/**
 * Glue between the app's Bill / OrganizationProfile and the tax engine.
 * OFF by default: unless the organisation sets gstRegistrationType AND gstEngineStartDate, every function here
 * reports "not active" and the app behaves exactly as before.
 */
import type { Bill, BillItem, OrganizationProfile, TaxStamp } from '../types';
import { computeTax } from './engine';
import { validateHsn } from './gstin';
import { RuleBook } from './ruleBook';
import { seedRuleBook } from './seedRules';
import type { BusinessTaxProfile, Issue, RegistrationType, TaxInput, TaxLineInput } from './types';

export interface TaxRegime {
  active: boolean;
  registrationType?: RegistrationType;
  profile?: BusinessTaxProfile;
  engineStartDate?: string;
}

export function resolveTaxRegime(org: OrganizationProfile | undefined, date: string): TaxRegime {
  const type = org?.gstRegistrationType;
  const start = org?.gstEngineStartDate;
  if (!org || !type || !start || !/^\d{4}-\d{2}-\d{2}$/.test(start) || date < start) return { active: false };
  const gstin = String(org.gstin || '').trim().toUpperCase();
  const stateCode = (org.stateCode || gstin.slice(0, 2) || '').trim();
  return {
    active: true,
    registrationType: type,
    engineStartDate: start,
    profile: {
      businessId: 'default',
      registrationType: type,
      gstin: gstin || undefined,
      stateCode,
      compositionCategory: org.compositionCategory,
      effectiveFrom: start,
      effectiveTo: null,
    },
  };
}

/** True when the business must never charge or show output GST (composition / unregistered). */
export const noOutputTax = (r: TaxRegime): boolean => r.active && r.registrationType !== 'regular';

/** Remove every tax split from bill lines: the customer pays the quoted amount, nothing is carved out. */
export function stripOutputTax<T extends Partial<BillItem>>(items: T[]): T[] {
  return items.map((i) => ({
    ...i,
    taxable: Number(i.amount) || 0,
    cgst: 0, sgst: 0, cgstRate: 0, sgstRate: 0,
  }));
}

export interface SaleCheck {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  stamp?: TaxStamp;
}

/** Codes that must not stop a counter sale (HSN is reported, not blocking, for a Bill of Supply). */
const NON_BLOCKING = new Set(['INVALID_HSN']);

/**
 * Validate a sale against the engine for the regime in force on `date`.
 * Lines are priced at what the customer pays (line amount), so the engine cannot add or extract GST.
 */
export function checkSaleForRegime(
  org: OrganizationProfile | undefined,
  args: { date: string; customerGstin?: string; items: Pick<BillItem, 'productId' | 'hsn' | 'amount' | 'gst'>[] },
  rb: RuleBook = seedRuleBook(),
): SaleCheck {
  const regime = resolveTaxRegime(org, args.date);
  // Regular-taxpayer billing is not wired to the engine yet (later phase): leave the legacy behaviour alone.
  if (!regime.active || !regime.profile || regime.registrationType === 'regular') return { ok: true, errors: [], warnings: [] };
  const hsnWarnings: Issue[] = [];
  const lines: TaxLineInput[] = args.items.map((i, n) => {
    const id = `l${n}-${i.productId}`;
    const ok = validateHsn(i.hsn);
    // A bad product HSN is reported but must not stop a counter sale; the engine gets a neutral placeholder.
    if (!ok) hsnWarnings.push({ code: 'INVALID_HSN', message: `Product ${i.productId} has an invalid HSN "${i.hsn ?? ''}"`, lineId: id });
    return {
    id,
    hsn: ok ? String(i.hsn).trim() : '00000000',
    qty: 1,
    unitPrice: Math.max(0, Number(i.amount) || 0),
    taxability: 'taxable',
    gstRatePct: 0, // product rate is irrelevant to a composition / unregistered sale
    };
  });
  const input: TaxInput = {
    business: regime.profile,
    kind: 'sale',
    date: args.date,
    counterparty: { gstin: args.customerGstin?.trim() || undefined },
    pricesIncludeTax: false,
    lines,
  };
  const r = computeTax(input, rb);
  const errors = r.errors.filter((e) => !NON_BLOCKING.has(e.code));
  const warnings = [...r.warnings, ...hsnWarnings, ...r.errors.filter((e) => NON_BLOCKING.has(e.code))];
  // Fail closed: a result with no document type is never allowed through, even if it states no reason.
  if (!errors.length && !r.documentType)
    errors.push({ code: 'TAX_ENGINE_NO_RESULT', message: 'The tax engine could not classify this sale' });
  if (errors.length || !r.documentType) return { ok: false, errors, warnings };
  return {
    ok: true,
    errors: [],
    warnings,
    stamp: {
      registrationType: regime.registrationType!,
      documentType: r.documentType,
      ruleVersion: r.ruleVersion,
      engineStartDate: regime.engineStartDate!,
      declaration: r.declaration,
      compositionLiability: r.compositionLiability
        ? { base: r.compositionLiability.base, cgst: r.compositionLiability.cgst, sgst: r.compositionLiability.sgst, total: r.compositionLiability.total }
        : undefined,
    },
  };
}

/**
 * True for a bill issued by a composition / unregistered business. Such a bill must never be converted into a Tax
 * Invoice or have a GST split re-added by any repair, rectification or "convert" tool.
 */
export const isNoOutputTaxBill = (b: Pick<Bill, 'taxStamp'> | undefined): boolean =>
  Boolean(b?.taxStamp && b.taxStamp.registrationType !== 'regular');

/** Footer wording for a printed document: the composition declaration when the bill carries one. */
export const billDeclaration = (b: Pick<Bill, 'taxStamp'> | undefined): string | undefined => b?.taxStamp?.declaration;
