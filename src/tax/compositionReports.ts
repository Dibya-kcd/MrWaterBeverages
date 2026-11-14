/**
 * CMP-08 (quarterly) and GSTR-4 (annual) WORKINGS for a composition taxpayer.
 *
 * These are management working papers for your CA, not portal returns. The quarterly tax is computed on the
 * AGGREGATE turnover of the quarter (CGST and SGST each rounded once), never by adding up per-bill amounts, because
 * that is how the liability is paid and filed. Per-bill stamped liability is shown only as a reconciliation figure.
 */
import type { Bill, GRN, OrganizationProfile } from '../types';
import { financialYear } from './docNumber';
import { checkCompositionEligibility, CompositionEligibilityResult } from './eligibility';
import { validateGstin } from './gstin';
import { r2, sum } from './money';
import { RuleBook } from './ruleBook';
import { seedRuleBook } from './seedRules';

export type QuarterId = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export function fyBounds(fy: string): { from: string; to: string } {
  const start = Number(fy.slice(0, 4));
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

export function quarterBounds(fy: string, q: QuarterId): { from: string; to: string } {
  const y = Number(fy.slice(0, 4));
  switch (q) {
    case 'Q1': return { from: `${y}-04-01`, to: `${y}-06-30` };
    case 'Q2': return { from: `${y}-07-01`, to: `${y}-09-30` };
    case 'Q3': return { from: `${y}-10-01`, to: `${y}-12-31` };
    default: return { from: `${y + 1}-01-01`, to: `${y + 1}-03-31` };
  }
}

const inRange = (d: string | undefined, r: { from: string; to: string }) => Boolean(d) && d! >= r.from && d! <= r.to;
const isLive = (b: Bill) => b.status !== 'cancelled' && !(b as { cancelled?: boolean }).cancelled;
const isComposition = (b: Bill) => b.taxStamp?.registrationType === 'composition';

/** Value of supply excluding any GST and the round-off paise. Works for legacy tax invoices and stamped bills alike. */
export const billSupplyValue = (b: Bill): number => r2((b.total || 0) - (b.cgst || 0) - (b.sgst || 0) - (b.roundOff || 0));

/** Return credit excluding GST. */
export const returnSupplyValue = (r: { totalCredit: number; cgst?: number; sgst?: number }): number =>
  r2((r.totalCredit || 0) - (r.cgst || 0) - (r.sgst || 0));

export interface CmpQuarter {
  quarter: QuarterId;
  label: string;
  from: string;
  to: string;
  bills: number;
  gross: number;
  returns: number;
  net: number;
  cgstPct?: number;
  sgstPct?: number;
  cgst: number;
  sgst: number;
  total: number;
  /** Sum of the liability stamped on each bill; differs from `total` only by rounding. */
  perBillSum: number;
  roundingDifference: number;
  warnings: string[];
  errors: string[];
}

export function buildCmp08(args: {
  bills: Bill[];
  org: OrganizationProfile;
  fy: string;
  rb?: RuleBook;
}): CmpQuarter[] {
  const rb = args.rb ?? seedRuleBook();
  const category = args.org.compositionCategory;
  return (['Q1', 'Q2', 'Q3', 'Q4'] as QuarterId[]).map((q) => {
    const range = quarterBounds(args.fy, q);
    const warnings: string[] = [];
    const errors: string[] = [];
    const stamped = args.bills.filter((b) => isLive(b) && isComposition(b));
    const inQ = stamped.filter((b) => inRange(b.date, range));
    const gross = sum(inQ.map(billSupplyValue));
    // Returns reduce turnover in the quarter in which the return is recorded (treatment flagged for CA review).
    const retValue = sum(
      stamped.flatMap((b) => (b.returns || []).filter((r) => inRange(r.date, range)).map(returnSupplyValue)),
    );
    const net = r2(gross - retValue);
    const rule = category ? rb.resolve<{ cgstPct: number; sgstPct: number }>('composition.rate', range.to, category) : undefined;
    let cgst = 0, sgst = 0;
    if (!category) errors.push('Composition category is not set in Settings.');
    else if (!rule) errors.push(`No composition rate rule is effective on ${range.to}. Ask the administrator to add one.`);
    else {
      cgst = r2((net * rule.value.cgstPct) / 100);
      sgst = r2((net * rule.value.sgstPct) / 100);
    }
    if (net < 0) warnings.push('Returns exceed sales in this quarter: the negative liability needs CA guidance (carry forward / adjust).');
    if (inQ.length === 0 && retValue === 0) warnings.push('No composition-stamped bills in this quarter.');
    const perBillSum = sum(inQ.map((b) => b.taxStamp?.compositionLiability?.total ?? 0));
    const total = r2(cgst + sgst);
    return {
      quarter: q, label: `${q} (${range.from} to ${range.to})`, ...range, bills: inQ.length,
      gross, returns: retValue, net, cgstPct: rule?.value.cgstPct, sgstPct: rule?.value.sgstPct,
      cgst, sgst, total, perBillSum, roundingDifference: r2(total - perBillSum), warnings, errors,
    };
  });
}

export interface InwardSummary {
  registeredCount: number;
  registeredTaxable: number;
  registeredTax: number;
  unregisteredCount: number;
  unregisteredTaxable: number;
  unregisteredTax: number;
  totalTaxable: number;
  totalTax: number;
  /** Part of totalTax paid as IGST (inter-state purchases). */
  igstPaid: number;
  /** GST on GRNs dated on/after the engine start that was added to stock cost (no ITC). */
  taxCapitalised: number;
}

export function buildInwardSummary(grns: GRN[], org: OrganizationProfile, fy: string): InwardSummary {
  const range = fyBounds(fy);
  const inFy = grns.filter((g) => inRange(g.inwardDate || g.invoiceDate, range));
  const reg = inFy.filter((g) => validateGstin(g.supplierGstin).valid);
  const unreg = inFy.filter((g) => !validateGstin(g.supplierGstin).valid);
  const start = org.gstEngineStartDate;
  return {
    registeredCount: reg.length,
    registeredTaxable: sum(reg.map((g) => g.totalTaxable || 0)),
    registeredTax: sum(reg.map((g) => g.totalTax || 0)),
    unregisteredCount: unreg.length,
    unregisteredTaxable: sum(unreg.map((g) => g.totalTaxable || 0)),
    unregisteredTax: sum(unreg.map((g) => g.totalTax || 0)),
    totalTaxable: sum(inFy.map((g) => g.totalTaxable || 0)),
    totalTax: sum(inFy.map((g) => g.totalTax || 0)),
    igstPaid: sum(inFy.flatMap((g) => (g.items || []).map((i) => Number((i as { igstAmount?: number }).igstAmount) || 0))),
    taxCapitalised: start ? sum(inFy.filter((g) => (g.inwardDate || '') >= start).map((g) => g.totalTax || 0)) : 0,
  };
}

/** Net aggregate turnover of a financial year across ALL live bills (legacy and stamped), excluding GST. */
export function fyAggregateTurnover(bills: Bill[], fy: string): number {
  const range = fyBounds(fy);
  const live = bills.filter(isLive);
  const sales = sum(live.filter((b) => inRange(b.date, range)).map(billSupplyValue));
  const rets = sum(live.flatMap((b) => (b.returns || []).filter((r) => inRange(r.date, range)).map(returnSupplyValue)));
  return r2(sales - rets);
}

export interface Gstr4Working {
  fy: string;
  quarters: CmpQuarter[];
  outwardGross: number;
  outwardReturns: number;
  outwardNet: number;
  /** Turnover of lines whose product GST is 0 % (estimate from line amounts, before bill-level discount). */
  exemptLineTurnover: number;
  cgst: number;
  sgst: number;
  taxPayable: number;
  inward: InwardSummary;
  rcmInwardTax: number;
  eligibility: CompositionEligibilityResult;
  precedingFyTurnover: number;
  currentFyTurnover: number;
  interStateOutwardBills: number[];
  notes: string[];
}

export function buildGstr4Working(args: {
  bills: Bill[];
  grns: GRN[];
  org: OrganizationProfile;
  fy: string;
  /** Turnover of OTHER GSTINs under the same PAN (aggregate turnover is PAN-wide). Entered by the user. */
  otherGstinTurnover?: { preceding: number; current: number };
  today?: string;
  rb?: RuleBook;
}): Gstr4Working {
  const rb = args.rb ?? seedRuleBook();
  const quarters = buildCmp08({ bills: args.bills, org: args.org, fy: args.fy, rb });
  const range = fyBounds(args.fy);
  const stamped = args.bills.filter((b) => isLive(b) && isComposition(b));
  const outwardGross = sum(quarters.map((q) => q.gross));
  const outwardReturns = sum(quarters.map((q) => q.returns));
  const exemptLineTurnover = sum(
    stamped.filter((b) => inRange(b.date, range)).flatMap((b) => b.items.filter((i) => !(Number(i.gst) > 0)).map((i) => i.amount || 0)),
  );
  const prevFy = `${Number(args.fy.slice(0, 4)) - 1}-${String(Number(args.fy.slice(0, 4)) % 100).padStart(2, '0')}`;
  const other = args.otherGstinTurnover ?? { preceding: 0, current: 0 };
  const preceding = r2(fyAggregateTurnover(args.bills, prevFy) + other.preceding);
  const current = r2(fyAggregateTurnover(args.bills, args.fy) + other.current);
  const ownState = (args.org.stateCode || String(args.org.gstin || '').slice(0, 2)).trim();
  const inter = args.bills
    .filter((b) => isLive(b) && inRange(b.date, range) && (b as { customerGstin?: string }).customerGstin)
    .filter((b) => String((b as { customerGstin?: string }).customerGstin).slice(0, 2) !== ownState)
    .map((b) => b.id);
  // Rules are looked up as of today when the FY is still running, else as of the FY end.
  const asOf = args.today && args.today < range.to ? args.today : range.to;
  const eligibility = checkCompositionEligibility(rb, {
    date: asOf,
    stateCode: ownState,
    precedingFyTurnover: preceding,
    currentFyTurnover: current,
    madeInterStateOutwardSupply: inter.length > 0,
  });
  const cgst = sum(quarters.map((q) => q.cgst));
  const sgst = sum(quarters.map((q) => q.sgst));
  return {
    fy: args.fy, quarters, outwardGross, outwardReturns, outwardNet: r2(outwardGross - outwardReturns),
    exemptLineTurnover, cgst, sgst, taxPayable: r2(cgst + sgst),
    inward: buildInwardSummary(args.grns, args.org, args.fy),
    rcmInwardTax: 0, eligibility, precedingFyTurnover: preceding, currentFyTurnover: current,
    interStateOutwardBills: inter,
    notes: [
      'Management working for your CA; not the portal return. Verify every figure before filing.',
      'Reverse-charge inward supplies are not captured by the app yet (shown as 0).',
      'Filing due dates are not stored; check the GST portal.',
      'Treatment of sales returns, the exempt-turnover base and other-GSTIN turnover needs CA confirmation.',
    ],
  };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

export function cmp08Csv(org: OrganizationProfile, fy: string, qs: CmpQuarter[]): string {
  return csv([
    ['CMP-08 working', org.name || '', org.gstin || '', `FY ${fy}`, 'Management working for CA - not a portal return'],
    [],
    ['Quarter', 'From', 'To', 'Bills', 'Gross supplies', 'Less returns', 'Net turnover', 'CGST %', 'SGST %', 'CGST', 'SGST', 'Total tax', 'Per-bill sum', 'Rounding diff'],
    ...qs.map((q) => [q.quarter, q.from, q.to, q.bills, q.gross, q.returns, q.net, q.cgstPct ?? '', q.sgstPct ?? '', q.cgst, q.sgst, q.total, q.perBillSum, q.roundingDifference]),
    [],
    ['Total', '', '', sum(qs.map((q) => q.bills)), sum(qs.map((q) => q.gross)), sum(qs.map((q) => q.returns)), sum(qs.map((q) => q.net)), '', '', sum(qs.map((q) => q.cgst)), sum(qs.map((q) => q.sgst)), sum(qs.map((q) => q.total))],
  ]);
}

export function gstr4Csv(org: OrganizationProfile, w: Gstr4Working): string {
  return csv([
    ['GSTR-4 working', org.name || '', org.gstin || '', `FY ${w.fy}`, 'Management working for CA - not a portal return'],
    [],
    ['Outward supplies'],
    ['Gross supplies', w.outwardGross], ['Less returns', w.outwardReturns], ['Net turnover', w.outwardNet],
    ['of which lines at 0% GST (estimate)', w.exemptLineTurnover],
    [],
    ['Composition tax by quarter', 'Net turnover', 'CGST', 'SGST', 'Total'],
    ...w.quarters.map((q) => [q.quarter, q.net, q.cgst, q.sgst, q.total]),
    ['Total tax payable', w.outwardNet, w.cgst, w.sgst, w.taxPayable],
    [],
    ['Inward supplies (from GRNs)', 'Count', 'Taxable value', 'GST paid'],
    ['From registered suppliers', w.inward.registeredCount, w.inward.registeredTaxable, w.inward.registeredTax],
    ['From unregistered / no GSTIN', w.inward.unregisteredCount, w.inward.unregisteredTaxable, w.inward.unregisteredTax],
    ['Total', w.inward.registeredCount + w.inward.unregisteredCount, w.inward.totalTaxable, w.inward.totalTax],
    ['of which IGST (inter-state)', '', '', w.inward.igstPaid],
    ['GST added to stock cost (no ITC)', '', '', w.inward.taxCapitalised],
    ['Reverse-charge inward tax', '', '', w.rcmInwardTax],
    [],
    ['Eligibility', w.eligibility.status, `Limit ${w.eligibility.limit ?? ''}`, `Preceding FY turnover ${w.precedingFyTurnover}`, `Current FY turnover ${w.currentFyTurnover}`],
    ...w.eligibility.messages.map((m) => ['', m]),
    [],
    ...w.notes.map((n) => [n]),
  ]);
}

export const currentFinancialYear = (today: string) => financialYear(today);
