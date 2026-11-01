import type { Bill, PaymentRecord } from "../types";
import { billBalance } from "./salesReturns";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * True for a receipt that is held on account (customer advance) and is NOT applied to any invoice.
 * Rows saved by older versions have no flag, so the "Advance / on account" note is also honoured.
 */
export function isAdvanceRow(p: Pick<PaymentRecord, "billId" | "isAdvance" | "referenceNote">): boolean {
  if (p.billId) return false;
  if (p.isAdvance) return true;
  return (p.referenceNote || "").includes("Advance / on account");
}

export interface Allocation {
  billId: number;
  amount: number;
}

export interface AllocationResult {
  /** Amount applied to each invoice, oldest invoice first. */
  allocations: Allocation[];
  /** Part of the receipt that did not fit on any open invoice (advance / on-account). */
  advance: number;
}

/**
 * Split one receipt across a customer's invoices.
 *
 * - If `targetBillId` is given, that invoice is paid first (capped at its balance).
 * - The rest (or the whole amount when no invoice was chosen) goes to the oldest
 *   unpaid invoices first (FIFO by date, then by invoice number).
 * - Anything left over is returned as `advance`.
 *
 * `bills` must already be the customer's live (non-cancelled) invoices.
 */
export function allocateReceipt(
  amount: number,
  bills: Bill[],
  targetBillId?: number,
): AllocationResult {
  let remaining = round2(Number(amount) || 0);
  const allocations: Allocation[] = [];
  if (remaining <= 0) return { allocations, advance: 0 };

  const ordered = [...bills].sort((a, b) =>
    a.date === b.date ? a.id - b.id : a.date > b.date ? 1 : -1,
  );
  if (targetBillId != null) {
    const i = ordered.findIndex((b) => b.id === targetBillId);
    if (i > 0) ordered.unshift(...ordered.splice(i, 1));
  }

  for (const b of ordered) {
    if (remaining <= 0.004) break;
    const due = billBalance(b);
    if (due <= 0) continue;
    const apply = round2(Math.min(remaining, due));
    allocations.push({ billId: b.id, amount: apply });
    remaining = round2(remaining - apply);
  }
  return { allocations, advance: Math.max(0, remaining) };
}

/** Build the journal rows for one receipt: one row per invoice, plus one advance row if needed. */
export function buildReceiptRows(
  base: Omit<PaymentRecord, "id" | "billId" | "amount">,
  result: AllocationResult,
  newId: () => string,
): PaymentRecord[] {
  const rows: PaymentRecord[] = result.allocations.map((a) => ({
    ...base,
    id: newId(),
    billId: a.billId,
    amount: a.amount,
  }));
  if (result.advance > 0) {
    rows.push({
      ...base,
      id: newId(),
      billId: undefined,
      isAdvance: true,
      amount: result.advance,
      referenceNote: [base.referenceNote, "Advance / on account"]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return rows;
}

/**
 * One-time repair for old data.
 *
 * Old versions saved a receipt with no invoice as ONE journal row (billId empty, full amount)
 * while also raising amountPaid on the invoices. This turns each such row into per-invoice rows
 * that match what the invoices already show as paid. Totals never change; only the link is added.
 *
 * `billsOfCustomer(name)` must return the live invoices for that customer (use the same matcher
 * as the ledger).
 */
export function splitUnlinkedPayments(
  payments: PaymentRecord[],
  billsOfCustomer: (customerName: string) => Bill[],
  newId: () => string,
): { payments: PaymentRecord[]; changed: number } {
  // How much of each invoice's amountPaid is already explained by a linked journal row.
  const linkedPaid = new Map<number, number>();
  for (const p of payments) {
    if (p.billId && !p.id.startsWith("pay_bill_"))
      linkedPaid.set(
        Number(p.billId),
        round2((linkedPaid.get(Number(p.billId)) || 0) + (Number(p.amount) || 0)),
      );
  }
  // Remaining "unexplained" paid amount per invoice, consumed as unlinked rows are split.
  const unexplained = new Map<number, number>();
  const seenCustomers = new Set<string>();
  const customerBills = new Map<string, Bill[]>();
  const billsFor = (name: string) => {
    const k = name.trim().toLowerCase();
    if (!seenCustomers.has(k)) {
      seenCustomers.add(k);
      const list = billsOfCustomer(name);
      customerBills.set(k, list);
      for (const b of list)
        unexplained.set(
          b.id,
          Math.max(0, round2((Number(b.amountPaid) || 0) - (linkedPaid.get(b.id) || 0))),
        );
    }
    return customerBills.get(k) || [];
  };

  const out: PaymentRecord[] = [];
  let changed = 0;
  const ordered = [...payments].sort((a, b) =>
    (a.paymentDate || "") === (b.paymentDate || "")
      ? (a.createdAt || "") > (b.createdAt || "") ? 1 : -1
      : (a.paymentDate || "") > (b.paymentDate || "") ? 1 : -1,
  );
  const replaced = new Map<string, PaymentRecord[]>();

  for (const p of ordered) {
    if (p.billId || isAdvanceRow(p) || !(Number(p.amount) > 0) || !p.customerName) continue;
    const bills = billsFor(p.customerName)
      .slice()
      .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date > b.date ? 1 : -1));
    let left = round2(Number(p.amount));
    const rows: PaymentRecord[] = [];
    for (const b of bills) {
      if (left <= 0.004) break;
      const avail = unexplained.get(b.id) || 0;
      if (avail <= 0.004) continue;
      const take = round2(Math.min(left, avail));
      unexplained.set(b.id, round2(avail - take));
      rows.push({ ...p, id: newId(), billId: b.id, amount: take });
      left = round2(left - take);
    }
    if (rows.length === 0) continue; // nothing on the invoices to attach to: stays as advance
    if (left > 0.004)
      rows.push({
        ...p,
        id: newId(),
        billId: undefined,
        isAdvance: true,
        amount: left,
        referenceNote: [p.referenceNote, "Advance / on account"].filter(Boolean).join(" · "),
      });
    replaced.set(p.id, rows);
    changed++;
  }

  for (const p of payments) {
    const r = replaced.get(p.id);
    if (r) {
      out.push(...r);
    } else {
      if (p.id.startsWith("pay_bill_") && p.billId) {
        const remainingUnexplained = unexplained.get(Number(p.billId));
        if (remainingUnexplained !== undefined && remainingUnexplained <= 0.004) {
          changed++;
          continue;
        }
      }
      out.push(p);
    }
  }
  return { payments: out, changed };
}


/**
 * Invoice-by-invoice check of what the invoices say is paid (`amountPaid`) against the payment
 * rows that back it. Returns, per invoice, how much "paid" has no payment row behind it.
 *
 * `payments` must be this customer's rows. Old-style receipts with no invoice link (and that are
 * not advances) are treated as a pool that covers shortfalls, oldest invoice first, so legacy data
 * is never counted twice. Advance rows are never part of that pool: they were not applied to any
 * invoice. Comparing per invoice (not customer totals) stops an advance from hiding, or causing the
 * removal of, another invoice's payment.
 */
export function billPaymentGaps(
  bills: Pick<Bill, "id" | "date" | "amountPaid">[],
  payments: Pick<PaymentRecord, "billId" | "amount" | "isAdvance" | "referenceNote">[],
): { billId: number; shortfall: number }[] {
  const linked = new Map<number, number>();
  let pool = 0;
  for (const p of payments) {
    const amt = Number(p.amount) || 0;
    if (p.billId) linked.set(p.billId, (linked.get(p.billId) || 0) + amt);
    else if (!isAdvanceRow(p) && amt > 0) pool += amt;
  }
  const out: { billId: number; shortfall: number }[] = [];
  const ordered = [...bills].sort((a, b) => ((a.date || "") > (b.date || "") ? 1 : -1));
  for (const b of ordered) {
    const paid = Number(b.amountPaid) || 0;
    if (paid <= 0) continue;
    let short = round2(paid - (linked.get(b.id) || 0));
    if (short <= 0.005) continue;
    const use = Math.min(pool, short);
    pool -= use;
    short = round2(short - use);
    if (short > 0.005) out.push({ billId: b.id, shortfall: short });
  }
  return out;
}


/**
 * Rows made by "Use advance / credit on invoices" carry this note. They are an internal transfer
 * (money the customer already paid, moved onto an invoice), not a new receipt.
 */
export function isAdvanceAdjustmentRow(p: Pick<PaymentRecord, "billId" | "amount" | "referenceNote">): boolean {
  return !!p.billId && (Number(p.amount) || 0) > 0 && (p.referenceNote || "").startsWith("Advance / credit adjusted against invoice");
}

/**
 * Deleting an adjustment row takes the money off the invoice again. The customer still paid it, so
 * it goes back on account as an advance, otherwise their balance would rise by money they handed over.
 */
export function buildAdvanceRestoreRow(
  deleted: PaymentRecord,
  newId: () => string,
  recordedBy: string,
): PaymentRecord {
  return {
    id: newId(),
    customerName: deleted.customerName,
    customerId: deleted.customerId,
    customerPhone: deleted.customerPhone,
    paymentDate: deleted.paymentDate,
    amount: round2(Number(deleted.amount) || 0),
    mode: "other",
    billId: undefined,
    isAdvance: true,
    referenceNote: `Advance / on account · restored (adjustment against invoice #${deleted.billId} was deleted)`,
    recordedBy,
    createdAt: new Date().toISOString(),
  } as PaymentRecord;
}
