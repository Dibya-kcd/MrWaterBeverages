/**
 * ONE definition of "due" for every report.
 *
 * Due = what each customer owes TODAY on the customer ledger (opening balance + billed - paid), the same figure the
 * Customers screen and the Beat-wise report show. Earlier, Overview / Home added up unpaid bills only, and Party
 * credit also counted cancelled bills, so the three screens never tallied.
 *
 * Read-only: nothing is written anywhere.
 */
import type { Bill, ExistingCustomer } from '../types';
import { billBalance, round2 } from './salesReturns';

/** Total owed by customers on the customer ledger, or null when the ledger is not available. */
export function ledgerTotalDue(existing?: ExistingCustomer[] | null): { total: number; customers: number } | null {
  if (!existing || existing.length === 0) return null;
  let total = 0;
  let customers = 0;
  for (const e of existing) {
    const due = Number(e?.balanceDue) || 0;
    if (due > 0.004) {
      total += due;
      customers += 1;
    }
  }
  return { total: round2(total), customers };
}

/** Unpaid balance on live (not cancelled) bills only. Used for ageing and as the fallback total. */
export function liveBillsDue(bills?: Bill[] | null): number {
  let sum = 0;
  for (const b of bills || []) {
    if (b.status === 'cancelled' || (b as any).cancelled) continue;
    sum += Math.max(0, billBalance(b));
  }
  return round2(sum);
}

/** The total-due figure every screen should show. */
export function totalDueOf(args: { existingCustomers?: ExistingCustomer[] | null; bills?: Bill[] | null }): number {
  const ledger = ledgerTotalDue(args.existingCustomers);
  return ledger ? ledger.total : liveBillsDue(args.bills);
}

/** Wording for the gap between the ledger total and the unpaid-bills total (opening balance, advances). */
export function dueGapNote(ledgerTotal: number, onBills: number): string {
  const diff = round2(ledgerTotal - onBills);
  if (diff > 0.5) return `includes ₹${diff.toLocaleString('en-IN')} of opening balance / older due not on a bill`;
  if (diff < -0.5) return `after ₹${Math.abs(diff).toLocaleString('en-IN')} of advance or adjustments`;
  return '';
}
