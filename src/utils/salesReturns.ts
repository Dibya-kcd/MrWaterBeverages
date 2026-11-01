/**
 * Customer sales returns.
 *
 * A return is stored ON the bill (bill.returns), like bill.cancellation, so it travels through the
 * existing bill save/sync path and the original invoice is never edited.
 *
 *  - Credit is prorated from what the customer was actually charged (free crates, discounts and GST
 *    all flow through), so returning every crate credits exactly bill.total.
 *  - The credit reduces what is owed on the bill. If the bill was already paid, the excess is a
 *    refund due to the customer (billRefundDue), the same idea as a cancellation credit note.
 *  - Restocked crates go back into the godown; scrapped crates stay out of stock (write-off).
 */
import type { Bill, SalesReturn, SalesReturnLine } from '../types';

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Where each restocked crate of a return line lands: back in the batch (and godown) it was sold
 * from, plus any remainder that cannot be traced to a batch (older bills) in the line's godown.
 */
export function restockDestinations(
  line: SalesReturnLine,
  fallbackWarehouseId?: string
): { batchId?: string; warehouseId?: string; qty: number }[] {
  const out: { batchId?: string; warehouseId?: string; qty: number }[] = [];
  let traced = 0;
  for (const br of line.batchRestocks || []) {
    if (br.qty > 0) {
      out.push({ batchId: br.batchId, warehouseId: br.warehouseId, qty: br.qty });
      traced += br.qty;
    }
  }
  const rest = (Number(line.restockQty) || 0) - traced;
  if (rest > 0) out.push({ warehouseId: line.warehouseId || fallbackWarehouseId, qty: rest });
  return out;
}

export interface SalesReturnInputLine {
  productId: number;
  restockQty: number;
  scrapQty: number;
  /** Where scrapped crates go (company claim / throw out / decide later). Defaults to 'undecided'. */
  scrapAction?: import('../types').ScrapAction;
  warehouseId?: string;
}

export type SalesReturnResult = { ok: true; value: SalesReturn } | { ok: false; error: string };

/** Total credit already issued against a bill. */
export function billReturnCredit(b: Pick<Bill, 'returns'>): number {
  return round2((b.returns || []).reduce((s, r) => s + (Number(r.totalCredit) || 0), 0));
}

/** What the customer is actually liable for after returns. */
export function billNetTotal(b: Pick<Bill, 'total' | 'returns'>): number {
  return Math.max(0, round2((Number(b.total) || 0) - billReturnCredit(b)));
}

/** Amount still owed on a bill: net of returns, minus payments. Never negative. */
export function billBalance(b: Pick<Bill, 'total' | 'amountPaid' | 'returns'>): number {
  return Math.max(0, round2((Number(b.total) || 0) - billReturnCredit(b) - (Number(b.amountPaid) || 0)));
}

/** Money owed BACK to the customer because returns exceed what they still owed. */
export function billRefundDue(b: Pick<Bill, 'total' | 'amountPaid' | 'returns'>): number {
  return Math.max(0, round2((Number(b.amountPaid) || 0) - ((Number(b.total) || 0) - billReturnCredit(b))));
}

/** Crates of each product already returned against a bill. */
export function returnedQtyByProduct(b: Pick<Bill, 'returns'>): Record<number, number> {
  const m: Record<number, number> = {};
  for (const r of b.returns || []) {
    for (const l of r.lines) m[l.productId] = (m[l.productId] || 0) + (Number(l.restockQty) || 0) + (Number(l.scrapQty) || 0);
  }
  return m;
}

/** Crates of each product sold on a bill. */
/** Credit amount (Incl-GST) already returned per product on a bill. */
export function returnedCreditByProduct(b: Pick<Bill, 'returns'>): Record<number, number> {
  const m: Record<number, number> = {};
  for (const r of b.returns || []) {
    for (const l of r.lines) {
      const pid = l.productId;
      m[pid] = (m[pid] || 0) + (Number(l.credit) || 0);
    }
  }
  return m;
}


export function soldQtyByProduct(b: Pick<Bill, 'items'>): Record<number, number> {
  const m: Record<number, number> = {};
  for (const it of b.items) m[it.productId] = (m[it.productId] || 0) + (Number(it.qty) || 0);
  return m;
}

/** Crates still returnable per product on a bill. */
export function returnableQtyByProduct(b: Pick<Bill, 'items' | 'returns'>): Record<number, number> {
  const sold = soldQtyByProduct(b);
  const back = returnedQtyByProduct(b);
  const m: Record<number, number> = {};
  for (const k of Object.keys(sold)) {
    const pid = Number(k);
    m[pid] = Math.max(0, sold[pid] - (back[pid] || 0));
  }
  return m;
}

/** Crates put back into stock, by product, across the given bills. */
export function restockedByProduct(bills: Pick<Bill, 'returns'>[]): Record<number, number> {
  const m: Record<number, number> = {};
  for (const b of bills) {
    for (const r of b.returns || []) {
      for (const l of r.lines) if (l.restockQty > 0) m[l.productId] = (m[l.productId] || 0) + l.restockQty;
    }
  }
  return m;
}

/** Crates put back into stock, keyed `productId|warehouseId`. */
export function restockedByProductWh(bills: Pick<Bill, 'returns'>[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const b of bills) {
    for (const r of b.returns || []) {
      for (const l of r.lines) {
        if (l.restockQty > 0 && l.warehouseId) {
          const k = `${l.productId}|${l.warehouseId}`;
          m[k] = (m[k] || 0) + l.restockQty;
        }
      }
    }
  }
  return m;
}

/** Crates written off (scrapped) across the given bills, by product. */
export function scrappedByProduct(bills: Pick<Bill, 'returns'>[]): Record<number, number> {
  const m: Record<number, number> = {};
  for (const b of bills) {
    for (const r of b.returns || []) {
      for (const l of r.lines) if (l.scrapQty > 0) m[l.productId] = (m[l.productId] || 0) + l.scrapQty;
    }
  }
  return m;
}

/**
 * Validate a return against a bill and price it. Pure: no state, no side effects.
 * `creditNoteNo` / `id` / `date` are supplied by the caller so numbering stays in one place.
 */
export function buildSalesReturn(
  bill: Bill,
  input: SalesReturnInputLine[],
  meta: {
    id: string;
    creditNoteNo: string;
    date: string;
    reason: string;
    createdBy?: string;
    defaultWarehouseId?: string;
    /** batchId -> godown, so restocked crates can be credited back to the right godown. */
    batchWarehouse?: Record<string, string | undefined>;
  }
): SalesReturnResult {
  if (bill.status === 'cancelled') return { ok: false, error: 'This invoice is cancelled, so nothing can be returned against it.' };

  const wanted = input.filter((l) => (Number(l.restockQty) || 0) > 0 || (Number(l.scrapQty) || 0) > 0);
  if (wanted.length === 0) return { ok: false, error: 'Enter at least one crate to return.' };

  const returnable = returnableQtyByProduct(bill);
  const seen = new Set<number>();
  for (const l of wanted) {
    if (seen.has(l.productId)) return { ok: false, error: 'Each product can appear only once in a return.' };
    seen.add(l.productId);
    const r = Number(l.restockQty) || 0;
    const s = Number(l.scrapQty) || 0;
    if (!Number.isInteger(r) || !Number.isInteger(s) || r < 0 || s < 0) {
      return { ok: false, error: 'Return quantities must be whole crates.' };
    }
    if (!(l.productId in returnable)) return { ok: false, error: 'That product is not on this invoice.' };
    if (r + s > returnable[l.productId]) {
      const name = bill.items.find((i) => i.productId === l.productId)?.productName || 'product';
      return { ok: false, error: `Cannot return ${r + s} of ${name}: only ${returnable[l.productId]} crate(s) can still be returned.` };
    }
  }

  // Price from what the customer was actually charged, blended per product.
  const gross = bill.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const factor = gross > 0 ? (Number(bill.total) || 0) / gross : 0;
  const taxShare = bill.total > 0 ? ((Number(bill.cgst) || 0) + (Number(bill.sgst) || 0)) / bill.total : 0;
  const amountByProduct: Record<number, number> = {};
  const qtyByProduct = soldQtyByProduct(bill);
  for (const it of bill.items) amountByProduct[it.productId] = (amountByProduct[it.productId] || 0) + (Number(it.amount) || 0);

  const priorCredit = billReturnCredit(bill);
  const remainingAfter: Record<number, number> = { ...returnable };
  for (const l of wanted) remainingAfter[l.productId] -= (Number(l.restockQty) || 0) + (Number(l.scrapQty) || 0);
  const fullyReturned = Object.values(remainingAfter).every((q) => q === 0);

  // Crates each batch already got back from earlier returns on this bill.
  const creditedBack: Record<string, number> = {};
  for (const r of bill.returns || []) {
    for (const l of r.lines) for (const br of l.batchRestocks || []) creditedBack[br.batchId] = (creditedBack[br.batchId] || 0) + br.qty;
  }
  // Credit restocked crates back to the batches the sale drew them from, in allocation order.
  const traceToBatches = (productId: number, qty: number) => {
    const cap: { batchId: string; batchNumber: string; left: number }[] = [];
    for (const it of bill.items) {
      if (it.productId !== productId) continue;
      for (const a of it.batchAllocations || []) {
        const ex = cap.find((c) => c.batchId === a.batchId);
        if (ex) ex.left += Number(a.qty) || 0;
        else cap.push({ batchId: a.batchId, batchNumber: a.batchNumber, left: Number(a.qty) || 0 });
      }
    }
    const out: { batchId: string; batchNumber: string; warehouseId?: string; qty: number }[] = [];
    let need = qty;
    for (const c of cap) {
      const room = Math.max(0, c.left - (creditedBack[c.batchId] || 0));
      const take = Math.min(room, need);
      if (take > 0) {
        out.push({ batchId: c.batchId, batchNumber: c.batchNumber, warehouseId: meta.batchWarehouse?.[c.batchId], qty: take });
        creditedBack[c.batchId] = (creditedBack[c.batchId] || 0) + take;
        need -= take;
      }
      if (need <= 0) break;
    }
    return out;
  };

  const lines: SalesReturnLine[] = wanted.map((l) => {
    const qty = (Number(l.restockQty) || 0) + (Number(l.scrapQty) || 0);
    const perCrate = qtyByProduct[l.productId] > 0 ? amountByProduct[l.productId] / qtyByProduct[l.productId] : 0;
    const credit = round2(perCrate * qty * factor);
    const tax = round2(credit * taxShare);
    const restock = Number(l.restockQty) || 0;
    return {
      productId: l.productId,
      productName: bill.items.find((i) => i.productId === l.productId)?.productName || `Product ${l.productId}`,
      restockQty: restock,
      scrapQty: Number(l.scrapQty) || 0,
      scrapAction: (Number(l.scrapQty) || 0) > 0 ? l.scrapAction || 'undecided' : undefined,
      warehouseId: restock > 0 ? l.warehouseId || meta.defaultWarehouseId || bill.warehouseId || undefined : undefined,
      batchRestocks: restock > 0 ? traceToBatches(l.productId, restock) : undefined,
      credit,
      cgst: round2(tax / 2),
      sgst: round2(tax - round2(tax / 2)),
    };
  });

  // Never credit more than the invoice total; on the final return, absorb rounding so the credits
  // across all returns add up to exactly bill.total.
  let totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  const room = round2(Math.max(0, (Number(bill.total) || 0) - priorCredit));
  const target = fullyReturned ? room : Math.min(totalCredit, room);
  if (target !== totalCredit && lines.length > 0) {
    const last = lines[lines.length - 1];
    const delta = round2(target - totalCredit);
    last.credit = round2(last.credit + delta);
    const tax = round2(last.credit * taxShare);
    last.cgst = round2(tax / 2);
    last.sgst = round2(tax - last.cgst);
    totalCredit = target;
  }

  return {
    ok: true,
    value: {
      id: meta.id,
      creditNoteNo: meta.creditNoteNo,
      date: meta.date,
      reason: meta.reason.trim() || 'Customer return',
      lines,
      totalCredit,
      cgst: round2(lines.reduce((s, l) => s + l.cgst, 0)),
      sgst: round2(lines.reduce((s, l) => s + l.sgst, 0)),
      createdBy: meta.createdBy,
    },
  };
}
