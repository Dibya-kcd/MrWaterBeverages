/**
 * ONE definition of "how much of a sale is revenue and how much is GST", used by every profit screen.
 *
 * - A bill that carries tax (tax invoice): the stored taxable value / CGST / SGST are used, less what was returned.
 * - A bill issued with NO tax carved out (a non-GST / retail bill), for a business that is a regular taxpayer:
 *   the price already contains GST, which the business owes the government. That GST is not revenue, so it is
 *   carved out at each line's GST rate, exactly as a tax invoice would show it. Without this, profit counts the
 *   GST as income and every margin on those bills is too high.
 * - Composition / unregistered businesses never charge output GST, so nothing is carved (carveGstFromPrices = false).
 *
 * Read-only: nothing is written back to any bill.
 */
import type { Bill, BillItem } from '../types';
import { billTotals } from './billing';
import { billNetTotal, billReturnCredit } from './salesReturns';

export interface BillTaxBasis {
  /** Revenue ex-GST, net of returns. */
  taxable: number;
  /** GST included in the sale, net of returns (payable to the government). */
  gst: number;
  /** True when the GST was carved out of a bill that had no tax stored. */
  carved: boolean;
}

export function billTaxBasis(
  bill: Bill,
  opts: { carveGstFromPrices: boolean; rateFor?: (item: BillItem) => number | undefined },
): BillTaxBasis {
  const net = billNetTotal(bill);
  const returns = bill.returns || [];
  const returnTax = returns.reduce((s, r) => s + (Number(r.cgst) || 0) + (Number(r.sgst) || 0), 0);
  const storedGst = (Number(bill.cgst) || 0) + (Number(bill.sgst) || 0);

  if (storedGst >= 0.005 || !opts.carveGstFromPrices) {
    const gst = Math.max(0, storedGst - returnTax);
    const subtotal = Number(bill.subtotal);
    const returnTaxable = Math.max(0, billReturnCredit(bill) - returnTax);
    const taxable =
      Number.isFinite(subtotal) && subtotal > 0
        ? Math.max(0, subtotal - returnTaxable)
        : Math.max(0, net - gst);
    return { taxable, gst, carved: false };
  }

  const items = (bill.items || []).map((i) => {
    const r = opts.rateFor ? opts.rateFor(i) : i.gst;
    return { ...i, gst: (r ?? i.gst ?? 0) as number };
  });
  const t = billTotals(items, 'inclusive', Number(bill.additionalDiscount) || 0, { round: false });
  const tax = (Number(t.cgst) || 0) + (Number(t.sgst) || 0);
  const share = t.total > 0 ? Math.min(1, tax / t.total) : 0;
  const gst = net * share;
  return { taxable: Math.max(0, net - gst), gst, carved: gst > 0.004 };
}
