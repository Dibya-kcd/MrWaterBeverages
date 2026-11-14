/**
 * Central GST tax calculation service.
 *
 * Every sale, purchase, return and report must obtain its tax treatment from computeTax(). The function is
 * pure and deterministic: it reads the registration profile, product tax class and RuleBook it is given and
 * never consults global state, today's date or hardcoded rates.
 */
import { validateGstin, validateHsn, GST_STATE_CODES } from './gstin';
import { r2, sum } from './money';
import { LegalRule, RuleBook, RuleNotFoundError } from './ruleBook';
import type {
  CompositionLiability,
  CounterpartyType,
  DocumentType,
  Issue,
  ItcStatus,
  TaxInput,
  TaxLineInput,
  TaxLineResult,
  TaxResult,
  TaxTotals,
} from './types';

const zeroTotals = (): TaxTotals => ({
  taxable: 0, exemptValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, documentTax: 0, invoiceValue: 0,
  itcEligible: 0, itcBlocked: 0, itcPending: 0, taxCapitalised: 0, rcmTax: 0, inventoryCost: 0,
});

interface Amounts { taxable: number; cgst: number; sgst: number; igst: number; cess: number }

/** Core arithmetic for one line. Inclusive pricing keeps taxable + tax == entered amount to the paisa. */
function amounts(line: TaxLineInput, gross: number, taxApplies: boolean, inter: boolean, inclusive: boolean): Amounts {
  const rate = taxApplies ? Math.max(0, Number(line.gstRatePct) || 0) : 0;
  const cessRate = taxApplies ? Math.max(0, Number(line.cessRatePct) || 0) : 0;
  if (rate === 0 && cessRate === 0) return { taxable: gross, cgst: 0, sgst: 0, igst: 0, cess: 0 };
  if (inclusive) {
    const taxable = r2(gross / (1 + (rate + cessRate) / 100));
    const cess = r2((taxable * cessRate) / 100);
    const tax = r2(gross - taxable - cess);
    if (inter) return { taxable, cgst: 0, sgst: 0, igst: tax, cess };
    const half = r2(tax / 2);
    return { taxable, cgst: half, sgst: r2(tax - half), igst: 0, cess };
  }
  const taxable = gross;
  const cess = r2((taxable * cessRate) / 100);
  if (inter) return { taxable, cgst: 0, sgst: 0, igst: r2((taxable * rate) / 100), cess };
  const half = r2((taxable * rate) / 200);
  return { taxable, cgst: half, sgst: half, igst: 0, cess };
}

function emptyResult(input: TaxInput, errors: Issue[], warnings: Issue[], ruleVersion: string, applied: string[]): TaxResult {
  return {
    ok: false, kind: input.kind, documentType: null, counterpartyClass: 'B2C', supply: 'intra_state',
    counterpartyType: 'unknown', showTaxOnDocument: false, lines: [], totals: zeroTotals(),
    errors, warnings, ruleVersion, rulesApplied: applied,
    sign: input.kind === 'sale_return' || input.kind === 'purchase_return' ? -1 : 1,
  };
}

export function computeTax(input: TaxInput, rb: RuleBook): TaxResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const applied = new Map<string, LegalRule>();
  const use = <V>(r: LegalRule<V> | undefined): LegalRule<V> | undefined => {
    if (r) applied.set(r.id, r as LegalRule);
    return r;
  };
  const err = (code: string, message: string, lineId?: string) => errors.push({ code, message, lineId });
  const warn = (code: string, message: string, lineId?: string) => warnings.push({ code, message, lineId });
  const finish = (r: TaxResult): TaxResult => {
    const pending = [...applied.values()].filter((x) => x.reviewStatus !== 'ca_approved').map((x) => x.id);
    if (pending.length) warn('RULES_PENDING_CA_REVIEW', `Legal rules not yet approved by a CA: ${pending.join(', ')}`);
    return r;
  };
  const version = () => `${rb.version}|${[...applied.keys()].sort().join(',')}`;

  const isReturn = input.kind === 'sale_return' || input.kind === 'purchase_return';
  const sign: 1 | -1 = isReturn ? -1 : 1;
  const base: 'sale' | 'purchase' = input.kind === 'sale' || input.kind === 'sale_return' ? 'sale' : 'purchase';
  const biz = input.business;
  // Rules and rates are resolved as on the original document date for returns, never "today".
  const ruleDate = isReturn ? input.originalDate || '' : input.date;

  // ---- 1. structural validation ------------------------------------------------------------------------------
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) err('INVALID_DATE', 'Transaction date must be YYYY-MM-DD');
  if (isReturn) {
    if (!input.originalDocumentRef) err('MISSING_ORIGINAL_DOCUMENT_REF', 'A return must reference the original document');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ruleDate)) err('MISSING_ORIGINAL_DATE', 'A return needs the original document date to resolve rates');
  }
  if (!input.lines.length) err('NO_LINES', 'Document has no lines');
  if (!GST_STATE_CODES[biz.stateCode]) err('INVALID_BUSINESS_STATE', `Business state code "${biz.stateCode}" is not a valid GST state code`);
  if (biz.effectiveFrom > input.date || (biz.effectiveTo && input.date > biz.effectiveTo))
    err('PROFILE_NOT_EFFECTIVE', 'The business tax profile supplied was not in force on the document date (use the historical profile)');
  if (biz.registrationType !== 'unregistered') {
    const g = validateGstin(biz.gstin);
    if (!g.valid) err('INVALID_BUSINESS_GSTIN', `Business GSTIN: ${g.reason}`);
    else if (g.stateCode !== biz.stateCode) err('GSTIN_STATE_MISMATCH', 'Business GSTIN state code differs from the configured state');
  }
  if (errors.length) return finish(emptyResult(input, errors, warnings, version(), [...applied.keys()]));

  // ---- 2. counterparty classification ------------------------------------------------------------------------
  const cp = input.counterparty;
  let cpType: CounterpartyType = 'unregistered';
  let cpState = cp.stateCode;
  let gstinGiven = Boolean(String(cp.gstin ?? '').trim());
  if (gstinGiven) {
    const g = validateGstin(cp.gstin);
    if (!g.valid) {
      err('INVALID_GSTIN', `Counterparty GSTIN: ${g.reason}`);
    } else {
      cpState = g.stateCode;
      cpType = cp.declaredType === 'composition' ? 'composition' : 'regular';
    }
  } else if (cp.declaredType === 'regular' || cp.declaredType === 'composition') {
    err('MISSING_GSTIN', `Counterparty is marked ${cp.declaredType} but has no GSTIN`);
  }
  if (cp.stateCode && !GST_STATE_CODES[cp.stateCode]) err('INVALID_COUNTERPARTY_STATE', `State code "${cp.stateCode}" is not valid`);

  // ---- 3. line validation ------------------------------------------------------------------------------------
  const slabs = use(rb.resolve<number[]>('gst.rateSlabs', ruleDate || input.date))?.value;
  for (const l of input.lines) {
    if (!validateHsn(l.hsn)) err('INVALID_HSN', `HSN "${l.hsn}" must be 4, 6 or 8 digits`, l.id);
    if (!(Number(l.qty) > 0)) err('INVALID_QTY', 'Quantity must be greater than zero', l.id);
    if (!(Number(l.unitPrice) >= 0)) err('INVALID_PRICE', 'Unit price cannot be negative', l.id);
    if (Number(l.discount) < 0) err('INVALID_DISCOUNT', 'Discount cannot be negative', l.id);
    if (l.taxability === 'taxable' && slabs && !slabs.includes(Number(l.gstRatePct)))
      warn('RATE_NOT_IN_SLABS', `Rate ${l.gstRatePct}% is not a standard slab on ${ruleDate}; check the product tax profile`, l.id);
  }
  if (errors.length) return finish(emptyResult(input, errors, warnings, version(), [...applied.keys()]));

  const grossOf = (l: TaxLineInput) => r2(l.qty * l.unitPrice - (l.discount || 0));
  for (const l of input.lines) if ((l.discount || 0) > r2(l.qty * l.unitPrice)) err('DISCOUNT_EXCEEDS_VALUE', 'Discount is more than the line value', l.id);
  if (errors.length) return finish(emptyResult(input, errors, warnings, version(), [...applied.keys()]));

  // ---- 4. supply nature --------------------------------------------------------------------------------------
  let inter: boolean;
  if (base === 'sale') {
    const pos = input.placeOfSupplyStateCode || cpState || biz.stateCode;
    if (!GST_STATE_CODES[pos]) err('INVALID_PLACE_OF_SUPPLY', `Place of supply "${pos}" is not valid`);
    inter = pos !== biz.stateCode;
  } else {
    if (!cpState) warn('SUPPLIER_STATE_UNKNOWN', 'Supplier state unknown; treated as intra-state');
    inter = Boolean(cpState) && cpState !== biz.stateCode;
  }
  const supply = inter ? 'inter_state' : 'intra_state';
  const cpClass: 'B2B' | 'B2C' = cpType === 'regular' || cpType === 'composition' ? 'B2B' : 'B2C';
  if (errors.length) return finish(emptyResult(input, errors, warnings, version(), [...applied.keys()]));

  const lines: TaxLineResult[] = [];
  let documentType: DocumentType;
  let showTax = false;
  let declaration: string | undefined;
  let supplierDocumentType: TaxResult['supplierDocumentType'];
  let compositionLiability: CompositionLiability | undefined;
  let compRate: { cgstPct: number; sgstPct: number } | undefined;

  const blank = (l: TaxLineInput, a: Amounts, over: Partial<TaxLineResult> = {}): TaxLineResult => ({
    id: l.id, hsn: l.hsn, taxability: l.taxability, gstRatePct: Number(l.gstRatePct) || 0,
    taxable: a.taxable, cgst: a.cgst, sgst: a.sgst, igst: a.igst, cess: a.cess,
    documentTax: 0, lineTotal: a.taxable, itcStatus: 'not_applicable', itcEligible: 0, itcBlocked: 0,
    itcPending: 0, taxCapitalised: 0, rcm: false, inventoryCost: a.taxable, ...over,
  });

  // ---- 5a. SALES ---------------------------------------------------------------------------------------------
  if (base === 'sale') {
    if (biz.registrationType === 'regular') {
      const allNonTaxable = input.lines.every((l) => l.taxability !== 'taxable');
      documentType = isReturn ? 'credit_note' : allNonTaxable ? 'bill_of_supply' : 'tax_invoice';
      showTax = !allNonTaxable;
      for (const l of input.lines) {
        const a = amounts(l, grossOf(l), l.taxability === 'taxable', inter, input.pricesIncludeTax);
        const tax = r2(a.cgst + a.sgst + a.igst + a.cess);
        lines.push(blank(l, a, { documentTax: tax, lineTotal: r2(a.taxable + tax), inventoryCost: 0 }));
      }
    } else {
      // Composition and unregistered sellers: Bill of Supply, price as quoted, NO tax is ever extracted or added.
      documentType = isReturn ? 'sales_return_voucher' : 'bill_of_supply';
      if (biz.registrationType === 'composition') {
        const blockInter = use(rb.resolve<boolean>('composition.interStateOutwardBlocked', ruleDate))?.value ?? true;
        if (inter && blockInter)
          err('COMPOSITION_INTERSTATE_OUTWARD_BLOCKED', 'A composition taxpayer cannot make inter-state outward supplies of goods');
        const blockNonTax = use(rb.resolve<boolean>('composition.nonTaxableGoodsBlocked', ruleDate))?.value ?? true;
        for (const l of input.lines)
          if (blockNonTax && l.taxability === 'non_gst')
            err('COMPOSITION_NON_TAXABLE_GOODS', 'A composition taxpayer cannot supply goods that are not leviable to GST', l.id);
        if (!biz.compositionCategory) err('COMPOSITION_CATEGORY_MISSING', 'Composition category is not set on the business profile');
        declaration = use(rb.resolve<string>('composition.billOfSupplyDeclaration', ruleDate))?.value;
        if (!declaration) err('NO_RULE_DECLARATION', 'No effective Bill of Supply declaration rule');
        // Resolve the levy rate now so that ALL missing rules are reported together, not one at a time.
        if (biz.compositionCategory) {
          try {
            compRate = use(rb.require<{ cgstPct: number; sgstPct: number }>('composition.rate', ruleDate, biz.compositionCategory))!.value;
          } catch (e) {
            if (e instanceof RuleNotFoundError) err('NO_COMPOSITION_RATE_RULE', e.message);
            else throw e;
          }
        }
      }
      if (errors.length) return finish(emptyResult(input, errors, warnings, version(), [...applied.keys()]));
      for (const l of input.lines) {
        const gross = grossOf(l);
        lines.push(blank(l, { taxable: gross, cgst: 0, sgst: 0, igst: 0, cess: 0 }, { lineTotal: gross, inventoryCost: 0 }));
      }
      if (biz.registrationType === 'composition' && compRate) {
        const incExempt = use(rb.resolve<boolean>('composition.baseIncludesExempt', ruleDate))?.value ?? true;
        const baseValue = sum(lines.filter((x) => x.taxability === 'taxable' || incExempt).map((x) => x.taxable));
        // CGST and SGST are separate heads, each rounded to the paisa (as they are paid and filed).
        const cgst = r2((baseValue * compRate.cgstPct) / 100);
        const sgst = r2((baseValue * compRate.sgstPct) / 100);
        compositionLiability = {
          ratePct: compRate.cgstPct + compRate.sgstPct, cgstPct: compRate.cgstPct, sgstPct: compRate.sgstPct,
          base: baseValue, cgst, sgst, total: r2(cgst + sgst),
        };
      }
    }
  } else {
    // ---- 5b. PURCHASES ---------------------------------------------------------------------------------------
    documentType = isReturn
      ? biz.registrationType === 'regular' && cpType === 'regular' ? 'debit_note' : 'purchase_return_note'
      : 'purchase_invoice';
    supplierDocumentType = cpType === 'regular' ? 'tax_invoice' : cpType === 'composition' ? 'bill_of_supply' : 'none';
    showTax = cpType === 'regular';
    const tol = use(rb.resolve<number>('engine.purchaseTaxVarianceTolerance', ruleDate || input.date))?.value ?? 0;
    const buyerCanClaim = biz.registrationType === 'regular';

    for (const l of input.lines) {
      const gross = grossOf(l);
      let a: Amounts;
      let rcm = false;
      if (cpType === 'composition') {
        const c = l.supplierCharged || {};
        if ((c.cgst || 0) + (c.sgst || 0) + (c.igst || 0) + (c.cess || 0) > 0)
          err('COMPOSITION_SUPPLIER_CHARGED_TAX', 'A composition supplier cannot charge GST; the document is a Bill of Supply', l.id);
        a = { taxable: gross, cgst: 0, sgst: 0, igst: 0, cess: 0 };
      } else if (cpType === 'unregistered') {
        const matches = l.rcmCategory
          ? rb.resolveAll<{ categories?: string[] }>('rcm.category', ruleDate).find((r) => r.scope === l.rcmCategory)
          : undefined;
        if (matches && l.taxability === 'taxable') {
          use(matches);
          rcm = true;
          a = amounts(l, gross, true, inter, false); // RCM tax is added on top of what the supplier is paid
        } else {
          a = { taxable: gross, cgst: 0, sgst: 0, igst: 0, cess: 0 };
          if (l.rcmCategory) warn('RCM_CATEGORY_NO_ACTIVE_RULE', `No active reverse-charge rule for "${l.rcmCategory}" on ${ruleDate}`, l.id);
        }
      } else {
        const computed = amounts(l, gross, l.taxability === 'taxable', inter, input.pricesIncludeTax);
        if (l.supplierCharged) {
          const c = l.supplierCharged;
          const charged = { cgst: r2(c.cgst || 0), sgst: r2(c.sgst || 0), igst: r2(c.igst || 0), cess: r2(c.cess || 0) };
          const chargedTotal = r2(charged.cgst + charged.sgst + charged.igst + charged.cess);
          const computedTotal = r2(computed.cgst + computed.sgst + computed.igst + computed.cess);
          if (Math.abs(chargedTotal - computedTotal) > tol)
            warn('SUPPLIER_TAX_VARIANCE', `Supplier charged ${chargedTotal} but ${computedTotal} is expected from the product rate`, l.id);
          if ((!inter && charged.igst > 0) || (inter && charged.cgst + charged.sgst > 0))
            warn('SUPPLY_TYPE_MISMATCH', 'Tax heads on the supplier invoice do not match the intra/inter-state nature of the supply', l.id);
          a = { taxable: input.pricesIncludeTax ? r2(gross - chargedTotal) : gross, ...charged };
        } else {
          a = computed;
        }
      }
      const tax = r2(a.cgst + a.sgst + a.igst + a.cess);
      let status: ItcStatus = 'not_applicable';
      let elig = 0, blocked = 0, pending = 0, capitalised = 0;
      if (tax > 0) {
        if (!buyerCanClaim) capitalised = tax; // composition / unregistered buyer: tax is a cost, ITC is zero
        else if (l.itcBlockedReason) { status = 'blocked'; blocked = tax; capitalised = tax; }
        else if (l.itcPending) { status = 'pending'; pending = tax; }
        else { status = 'eligible'; elig = tax; }
      }
      lines.push(blank(l, a, {
        documentTax: rcm ? 0 : tax, lineTotal: r2(a.taxable + (rcm ? 0 : tax)), rcm,
        itcStatus: status, itcEligible: elig, itcBlocked: blocked, itcPending: pending,
        taxCapitalised: capitalised, inventoryCost: r2(a.taxable + capitalised),
      }));
    }
    if (errors.length) return finish(emptyResult(input, errors, warnings, version(), [...applied.keys()]));
  }

  if (errors.length) return finish(emptyResult(input, errors, warnings, version(), [...applied.keys()]));

  // ---- 6. apply sign for returns, build totals ---------------------------------------------------------------
  const sg = (n: number) => r2(n * sign);
  const signed = lines.map((x) => ({
    ...x, taxable: sg(x.taxable), cgst: sg(x.cgst), sgst: sg(x.sgst), igst: sg(x.igst), cess: sg(x.cess),
    documentTax: sg(x.documentTax), lineTotal: sg(x.lineTotal), itcEligible: sg(x.itcEligible),
    itcBlocked: sg(x.itcBlocked), itcPending: sg(x.itcPending), taxCapitalised: sg(x.taxCapitalised),
    inventoryCost: sg(x.inventoryCost),
  }));
  const col = (f: (x: TaxLineResult) => number) => sum(signed.map(f));
  const totals: TaxTotals = {
    taxable: col((x) => x.taxable),
    exemptValue: col((x) => (x.taxability === 'taxable' ? 0 : x.taxable)),
    cgst: col((x) => x.cgst), sgst: col((x) => x.sgst), igst: col((x) => x.igst), cess: col((x) => x.cess),
    documentTax: col((x) => x.documentTax),
    invoiceValue: col((x) => x.lineTotal),
    itcEligible: col((x) => x.itcEligible), itcBlocked: col((x) => x.itcBlocked), itcPending: col((x) => x.itcPending),
    taxCapitalised: col((x) => x.taxCapitalised),
    rcmTax: col((x) => (x.rcm ? r2(x.cgst + x.sgst + x.igst + x.cess) : 0)),
    inventoryCost: col((x) => x.inventoryCost),
  };
  if (compositionLiability) {
    const c = compositionLiability;
    compositionLiability = { ...c, base: sg(c.base), cgst: sg(c.cgst), sgst: sg(c.sgst), total: sg(c.total) };
  }

  return finish({
    ok: true, kind: input.kind, documentType, counterpartyClass: cpClass, supply, counterpartyType: cpType,
    showTaxOnDocument: showTax, declaration, lines: signed, totals, compositionLiability, errors, warnings,
    ruleVersion: version(), rulesApplied: [...applied.keys()], supplierDocumentType, sign,
  });
}
