/**
 * Supplier Scheme & Incentive calculations.
 *
 * Kept separate from `src/utils/billing.ts` deliberately: billing.ts owns the existing,
 * shipped GRN "inclusive" scheme model (schemeType/freeQty/paidQty on a GrnLineItem,
 * where the invoiced qty already includes the free portion). This file owns the NEW,
 * strictly ADDITIVE supplier-scheme model requested separately:
 *
 *     totalReceivedQty (existing, inclusive GRN math)  +  supplierSchemeFreeQty (new, additive)
 *     = physical stock actually placed in the batch
 *
 * The two are never mixed in one formula so neither can silently double- or under-count
 * the other.
 */
import { Bill, SupplierIncentiveCalcMethod, SupplierScheme, SupplierSchemeApplication, SupplierCreditNote, SupplierCreditNoteStatus, MonthlyIncentiveRow, Product } from '../types';

// ----------------------------------------------------------------
// Type A — Free goods with purchase (additive)
// ----------------------------------------------------------------

export interface AdditiveReceiptResult {
  paidQty: number; // unchanged — the existing GRN line's own paid/chargeable qty
  freeQty: number; // the existing GRN line's own (inclusive-model) free qty, unchanged
  supplierSchemeFreeQty: number; // NEW additive free qty from a named Supplier Scheme
  totalPhysicalQty: number; // = existing totalReceivedQty + supplierSchemeFreeQty
}

/**
 * Combines an existing (already-correct) GRN line totalReceivedQty with an additive
 * Supplier Scheme free-goods quantity. This is the ONLY place the two are added
 * together, so the invariant is easy to audit in one spot.
 */
export function applyAdditiveSupplierSchemeReceipt(params: {
  existingTotalReceivedQty: number; // GrnLineItem.totalReceivedQty (already paidQty+freeQty per existing inclusive model)
  existingPaidQty: number; // GrnLineItem.paidQty
  existingFreeQty: number; // GrnLineItem.freeQty
  supplierSchemeFreeQty?: number;
}): AdditiveReceiptResult {
  const supplierSchemeFreeQty = Math.max(0, Number(params.supplierSchemeFreeQty) || 0);
  const existingTotalReceivedQty = Math.max(0, Number(params.existingTotalReceivedQty) || 0);
  return {
    paidQty: Math.max(0, Number(params.existingPaidQty) || 0),
    freeQty: Math.max(0, Number(params.existingFreeQty) || 0),
    supplierSchemeFreeQty,
    totalPhysicalQty: existingTotalReceivedQty + supplierSchemeFreeQty,
  };
}

/**
 * Effective purchase cost re-spread across the truly additive physical receipt.
 * Example from the spec: 100 paid CASE @ ₹150 = ₹15,000 invoice value; 10 additive free
 * CASE on top → 110 physical CASE → effective cost = 15,000 / 110 = ₹136.36/CASE.
 * `invoiceValue` should be the line's existing taxable/invoice value (unchanged by the
 * additive scheme — the supplier invoice is never rewritten for free stock).
 */
export function effectivePurchaseCostWithAdditiveFreeGoods(params: {
  invoiceValue: number; // e.g. taxableAmount or lineTotal from the existing GRN line — NOT recomputed here
  totalPhysicalQty: number; // existingTotalReceivedQty + supplierSchemeFreeQty
}): number {
  const qty = Math.max(0, Number(params.totalPhysicalQty) || 0);
  const value = Math.max(0, Number(params.invoiceValue) || 0);
  return qty > 0 ? value / qty : 0;
}

/** Landed cost = effective purchase cost (post additive free goods) + existing inward cost/crate. Reuses the app's own landed-cost structure — does not invent a second formula. */
export function landedCostWithAdditiveFreeGoods(effectiveCost: number, inwardCostPerCrate: number): number {
  return Math.max(0, Number(effectiveCost) || 0) + Math.max(0, Number(inwardCostPerCrate) || 0);
}

// ----------------------------------------------------------------
// Type C — Monthly sales volume incentive (computed live, never stored)
// ----------------------------------------------------------------

/** "YYYY-MM" for a given ISO/date-like string. */
export function periodOf(dateStr: string): string {
  return (dateStr || '').slice(0, 7);
}

export function isDateWithinScheme(dateStr: string, scheme: Pick<SupplierScheme, 'startDate' | 'endDate'>): boolean {
  if (!dateStr) return false;
  if (scheme.startDate && dateStr < scheme.startDate) return false;
  if (scheme.endDate && dateStr > scheme.endDate) return false;
  return true;
}

/**
 * Eligible CASE quantity for a volume-incentive scheme in a given month, computed
 * directly from currently-posted `bills` (never from a stored counter). Because a
 * deleted or edited bill simply isn't in `bills` any more, cancelled/returned sales are
 * excluded automatically with no separate bookkeeping (Test I).
 */
export function computeEligibleMonthlySales(params: {
  scheme: SupplierScheme;
  period: string; // "YYYY-MM"
  bills: Bill[];
}): number {
  const { scheme, period, bills } = params;
  const productSet = new Set(Array.isArray(scheme.productIds) ? scheme.productIds : []);
  let qty = 0;
  for (const bill of bills || []) {
    // Cancelled invoices stay in `bills` for GST/audit, but never count as sales.
    if (bill.status === 'cancelled' || bill.cancelled) continue;
    if (periodOf(bill.date) !== period) continue;
    if (!isDateWithinScheme(bill.date, scheme)) continue;
    for (const item of bill.items || []) {
      if (!productSet.has(item.productId)) continue;
      // it.qty = total physical CASE dispatched on this bill line (paid + any customer-promo free),
      // consistent with how the rest of this app (soldByProduct) counts dispatched stock.
      qty += Number(item.qty) || 0;
    }
    // Customer sales returns (credit notes against this invoice) reduce eligible sales: the
    // supplier pays incentive on net sales, not on crates that came back.
    for (const r of bill.returns || []) {
      for (const l of r.lines || []) {
        if (!productSet.has(l.productId)) continue;
        qty -= (Number(l.restockQty) || 0) + (Number(l.scrapQty) || 0);
      }
    }
  }
  return Math.max(0, qty);
}

/**
 * Applies the scheme's configured calculation method. Never hard-coded — always driven
 * by `scheme.calculationMethod`.
 *   'all_eligible'  -> actualQty * rate               (e.g. 1200 * 10 = 12,000)
 *   'excess_only'   -> max(0, actualQty - target) * rate  (e.g. (1200-1000) * 10 = 2,000)
 */
export function computeExpectedIncentive(params: {
  actualQty: number;
  targetQty: number;
  rate: number;
  method: SupplierIncentiveCalcMethod;
}): number {
  const actualQty = Math.max(0, Number(params.actualQty) || 0);
  const targetQty = Math.max(0, Number(params.targetQty) || 0);
  const rate = Math.max(0, Number(params.rate) || 0);
  const achieved = actualQty >= targetQty;
  if (!achieved) return 0;
  if (params.method === 'excess_only') {
    return Math.max(0, actualQty - targetQty) * rate;
  }
  return actualQty * rate; // 'all_eligible'
}

// ----------------------------------------------------------------
// Supplier Credit Note reconciliation (Type B + Type C settlement)
// ----------------------------------------------------------------

export function outstandingCredit(expectedAmount: number, actualAmount: number): number {
  const expected = Math.max(0, Number(expectedAmount) || 0);
  const actual = Math.max(0, Number(actualAmount) || 0);
  // Never negative unless explicitly recording an over-credit/adjustment (out of scope
  // for the automatic derivation — an over-credit is a business decision, not a default).
  return Math.max(0, expected - actual);
}

export function creditNoteStatus(expectedAmount: number, actualAmount: number): SupplierCreditNoteStatus {
  const actual = Math.max(0, Number(actualAmount) || 0);
  const expected = Math.max(0, Number(expectedAmount) || 0);
  if (actual <= 0) return 'pending';
  if (actual >= expected && expected > 0) return 'settled';
  return 'partially_credited';
}

// ----------------------------------------------------------------
// Monthly Incentive Report — one row per (scheme, product, month)
// ----------------------------------------------------------------

export function buildMonthlyIncentiveReport(params: {
  schemes: SupplierScheme[];
  bills: Bill[];
  creditNotes: SupplierCreditNote[];
  products: Product[];
  periods: string[]; // "YYYY-MM" list to report on
}): MonthlyIncentiveRow[] {
  const { schemes, bills, creditNotes, products, periods } = params;
  const rows: MonthlyIncentiveRow[] = [];

  // ONE row per (scheme, month). The target applies to the whole product group together
  // (e.g. "any 3 Campa SKUs = 1000 cases"), so we must not repeat the group total once per
  // product — that multiplied the expected credit by the number of products in the scheme.
  for (const scheme of (schemes || []).filter((s) => s && s.schemeType === 'volume_incentive')) {
    const productIds = Array.isArray(scheme.productIds) ? scheme.productIds : [];
    const names = productIds.map((pid) => products.find((p) => p.id === pid)?.name || `Product #${pid}`);
    const productName =
      names.length === 0 ? '—' : names.length <= 2 ? names.join(', ') : `${names[0]}, ${names[1]} +${names.length - 2} more`;
    for (const period of periods) {
      const actualEligibleQty = computeEligibleMonthlySales({ scheme, period, bills });
      const targetQuantity = Math.max(0, Number(scheme.targetQuantity) || 0);
      const achieved = targetQuantity > 0 && actualEligibleQty >= targetQuantity;
      const expectedCredit = computeExpectedIncentive({
        actualQty: actualEligibleQty,
        targetQty: targetQuantity,
        rate: scheme.incentiveRate || 0,
        method: scheme.calculationMethod || 'all_eligible',
      });

      const relatedNotes = creditNotes.filter((cn) => cn.schemeId === scheme.id && cn.period === period);
      const creditReceived = relatedNotes.reduce((s, cn) => s + (Number(cn.actualAmount) || 0), 0);
      const outstanding = outstandingCredit(expectedCredit, creditReceived);

      let status: MonthlyIncentiveRow['status'] = 'not_yet_eligible';
      if (achieved) {
        status = relatedNotes.length > 0 ? creditNoteStatus(expectedCredit, creditReceived) : 'pending';
      }

      rows.push({
        schemeId: scheme.id,
        supplierName: scheme.supplierName,
        productId: productIds[0] ?? 0,
        productName,
        period,
        targetQuantity,
        actualEligibleQty,
        achieved,
        incentiveRate: scheme.incentiveRate || 0,
        calculationMethod: scheme.calculationMethod || 'all_eligible',
        expectedCredit,
        creditReceived,
        outstandingCredit: outstanding,
        status,
      });
    }
  }

  return rows;
}

/** Aggregate helpers used by the Product Profit report. */
export function totalSupplierCreditForProduct(params: {
  productId: number;
  applications: SupplierSchemeApplication[];
  creditNotes: SupplierCreditNote[];
}): { expected: number; received: number } {
  const grnIds = new Set(
    params.applications.filter((a) => a.productId === params.productId && a.schemeType === 'pending_credit').map((a) => a.grnId)
  );
  const related = params.creditNotes.filter((cn) => cn.productId === params.productId || (cn.grnId && grnIds.has(cn.grnId)));
  return {
    expected: related.reduce((s, cn) => s + (Number(cn.expectedAmount) || 0), 0),
    received: related.reduce((s, cn) => s + (Number(cn.actualAmount) || 0), 0),
  };
}

/**
 * A supplier credit note is "claim-linked" when it was mirrored from a Returns & Disposals
 * claim (expiry / damage / return-to-supplier). Those are owned by the Dispositions screen
 * (GST split, partial-receipt log, attachment) and must be edited there; everything else is
 * a scheme / incentive credit note owned by the Supplier credits screen.
 */
export function isClaimLinkedNote(cn: Pick<SupplierCreditNote, 'notes' | 'schemeId'>): boolean {
  return !cn.schemeId && (cn.notes || '').includes('Linked disposition');
}

/** Disposition id inside a claim-linked note's `notes` ("Linked disposition <id> · ..."). */
export function claimDispositionId(cn: Pick<SupplierCreditNote, 'notes'>): string | undefined {
  const m = /Linked disposition (\S+)/.exec(cn.notes || '');
  return m ? m[1] : undefined;
}
