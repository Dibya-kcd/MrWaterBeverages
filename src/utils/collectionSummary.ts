/**
 * ONE definition of "collection / received" for every screen (Home, Reports overview,
 * Reports mobile home, Daily collection, and Customer receipts).
 *
 * Rules (matching utils/beatReports.ts collectReceipts):
 *   1. Cancelled bills are ignored.
 *   2. Every positive, non-refund, non-'credit', non-advance-adjustment row in `payments`
 *      is counted on its receipt date (`paymentDate || createdAt`), whether it settles a new
 *      bill, collects an older bill, or is received on account (advance).
 *   3. Any live bill with NO positive non-refund payment rows (older / pre-ledger data)
 *      falls back to `Math.min(billNetTotal(b), Number(b.amountPaid) || 0)` on `b.date`,
 *      unless `b.paymentMode === 'credit'`.
 *
 * Read-only: nothing is written anywhere.
 */
import type { Bill, PaymentRecord } from '../types';
import { isAdvanceAdjustmentRow } from './paymentAllocation';
import { billNetTotal, round2 } from './salesReturns';

export interface CollectionSummary {
  /** Total money collected in the period (sum of all payment modes). */
  total: number;
  cash: number;
  upi: number;
  cheque: number;
  bank: number;
  other: number;
  /** UPI + bank + other (non-cash, non-cheque electronic/other). */
  digital: number;
  /** Everything other than cash (upi + bank + cheque + other), so `cash + nonCash === total`. */
  nonCash: number;
  /** Number of receipt / fallback-paid-bill entries counted. */
  count: number;
}

const isLiveBill = (b: Bill): boolean =>
  b.status !== 'cancelled' && !b.cancelled && !b.cancellation;

export function summarizeCollections(args: {
  bills?: Bill[] | null;
  payments?: PaymentRecord[] | null;
  inPeriod: (dateStr: string) => boolean;
}): CollectionSummary {
  const { bills, payments, inPeriod } = args;
  const liveBills = (bills || []).filter(isLiveBill);
  const billsWithRows = new Set<number>();

  let cash = 0;
  let upi = 0;
  let cheque = 0;
  let bank = 0;
  let other = 0;
  let count = 0;

  const addMode = (mode: string | undefined, amt: number) => {
    const m = (mode || 'cash').toLowerCase();
    if (m === 'cash') cash += amt;
    else if (m === 'upi') upi += amt;
    else if (m === 'cheque') cheque += amt;
    else if (m === 'bank') bank += amt;
    else other += amt;
    count += 1;
  };

  for (const p of payments || []) {
    const amt = Number(p.amount) || 0;
    if (amt > 0 && p.billId && !p.isRefund) {
      billsWithRows.add(p.billId);
    }
    if (amt <= 0 || p.isRefund || p.mode === 'credit' || isAdvanceAdjustmentRow(p)) {
      continue;
    }
    const pDate = String(p.paymentDate || p.createdAt || '').slice(0, 10);
    if (!pDate || !inPeriod(pDate)) continue;
    addMode(p.mode, amt);
  }

  for (const b of liveBills) {
    if (billsWithRows.has(b.id)) continue;
    const paid = Math.min(billNetTotal(b), Math.max(0, Number(b.amountPaid) || 0));
    const mode = b.paymentMode || 'cash';
    const bDate = String(b.date || '').slice(0, 10);
    if (paid <= 0 || mode === 'credit' || !bDate || !inPeriod(bDate)) continue;
    addMode(mode, paid);
  }

  const rCash = round2(cash);
  const rUpi = round2(upi);
  const rCheque = round2(cheque);
  const rBank = round2(bank);
  const rOther = round2(other);
  const digital = round2(rUpi + rBank + rOther);
  const nonCash = round2(rUpi + rBank + rCheque + rOther);
  const total = round2(rCash + nonCash);

  return {
    total,
    cash: rCash,
    upi: rUpi,
    cheque: rCheque,
    bank: rBank,
    other: rOther,
    digital,
    nonCash,
    count,
  };
}
