/**
 * ONE definition of the items that sit between "sales minus cost of cases" and net profit.
 * Every profit screen (Reports > Margin P&L, Reports > Net Profit, Business reports > Profit & loss)
 * must use these, so they cannot disagree.
 *
 *   Revenue ex-GST (net of returns)
 *   - Cost of the cases delivered (free scheme cases included)
 *   = Gross profit on sales
 *   - Stock written off / given free, net of what the supplier compensated   (writeOffNetForPeriod)
 *   + Supplier scheme credits received                                         (schemeCreditsForPeriod)
 *   = Gross profit
 *   - Running expenses (fuel, rent, salary ...)
 *   = Net profit
 */
import type { InventoryDisposition, SupplierCreditNote } from '../types';

const r2 = (n: number) => Math.round(n * 100) / 100;

export function writeOffNetForPeriod(
  dispositions: InventoryDisposition[] | undefined,
  inPeriod?: (date: string) => boolean,
) {
  let loss = 0;
  let recovered = 0;
  for (const d of dispositions || []) {
    const day = String(d.eventDate || '').slice(0, 10);
    if (inPeriod && !inPeriod(day)) continue;
    // Document-only claims never touch profit. Customer-return scrap is the exception: its stock
    // already left with the sale (so stockApplied is false), but the crate is a real loss to us
    // until the company credits it back.
    if ((d as any).stockApplied === false && !(d as any).returnTracking) continue;
    const cost = Number(d.costValue) || 0;
    loss += cost;
    if (d.compensationStatus === 'settled' || d.compensationStatus === 'partial') {
      recovered += Math.min(cost, Number(d.compensatedAmount) || Number(d.cnTaxableValue) || 0);
    }
  }
  return { loss: r2(loss), recovered: r2(recovered), net: r2(Math.max(0, loss - recovered)) };
}

/**
 * Supplier scheme / incentive credit notes actually received in the period. Credit notes raised for
 * damaged or returned stock are NOT counted here: they are already netted in the write-off figure above.
 */
export function schemeCreditsForPeriod(
  notes: SupplierCreditNote[] | undefined,
  inPeriod?: (date: string) => boolean,
): number {
  let total = 0;
  for (const n of notes || []) {
    const amt = Number(n.actualAmount) || 0;
    if (amt <= 0 || n.status === 'pending' || !n.schemeId) continue;
    const day = String(n.creditNoteDate || n.updatedAt || '').slice(0, 10);
    if (inPeriod && !inPeriod(day)) continue;
    total += amt;
  }
  return r2(total);
}
