/**
 * Oversold godown inspector (read-only, pure).
 *
 * Mirrors the multi-godown branch of `productWarehouseStock` (LedgerContext) so the numbers shown
 * here always equal the numbers the Inventory screen shows. It never changes anything: it only
 * explains WHY a (product x godown) book balance is negative and WHICH active bills drew from it.
 */
import type {
  Audit,
  Bill,
  InventoryBatch,
  InventoryDisposition,
  Product,
  StockLedgerEntry,
  Trip,
  Warehouse,
} from '../types';
import { restockDestinations } from './salesReturns';
import { buildCrossWarehouseShiftPlan } from './billCostRepair';
import { tripPrimaryWarehouseId } from './tripLoads';

function resolveBillTrip(b: Bill, trips?: Trip[]): Trip | null {
  if (!trips || trips.length === 0) return null;
  if (b.tripId != null) {
    const t = trips.find((x) => Number(x.id) === Number(b.tripId));
    if (t) return t;
  }
  return trips.find((x) => (x.billIds || []).map(Number).includes(Number(b.id))) || null;
}

/** Reasons the owner can pick when clearing a negative book balance with an audit adjustment. */
export const OVERSOLD_REASONS = [
  'Stock receipt (GRN) not entered',
  'Godown transfer not entered',
  'Wrong godown on bills',
  'Wrong product on a bill',
  'Opening stock missing',
  'Other',
];

export interface OversoldBillRef {
  billId: number;
  billDate: string;
  retailer: string;
  tripId?: number;
  /** Cases of this product this bill deducted from THIS godown. */
  qtyDeducted: number;
  /** 'batch' = traced through batchAllocations, 'bill-godown' = bill's own godown tag (or fallback), 'mixed' = both. */
  allocationSource: 'batch' | 'bill-godown' | 'mixed';
  batchLabels: string[];
}

export interface OversoldTarget {
  warehouseId: string;
  warehouseName: string;
  /** Book balance of the product in that godown (can itself be negative). */
  bookBalance: number;
  /** Sellable stock there (book balance clamped at 0). */
  availableCases: number;
}

export interface OversoldItem {
  productId: number;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  inwardCases: number;
  auditLedgerAdjCases: number;
  restockedCases: number;
  disposedCases: number;
  totalSoldCases: number;
  /** inward + audit/ledger adj + restocked - disposed - sold. Negative here by definition. */
  bookBalance: number;
  /** Cases missing: -bookBalance. */
  shortfallCases: number;
  bills: OversoldBillRef[];
  targets: OversoldTarget[];
}

export interface OversoldInput {
  products: Product[];
  warehouses: Warehouse[];
  inventoryBatches: InventoryBatch[];
  /** ACTIVE bills only (cancelled bills never count toward stock). */
  bills: Bill[];
  audits: Audit[];
  stockLedgerEntries?: StockLedgerEntry[];
  inventoryDispositions?: InventoryDisposition[];
  /** Trips list (used to match productWarehouseStock when a bill has no batch allocations or godown tag). */
  trips?: Trip[];
  /** Cases reserved by the in-progress cart, per product, and the godown it is drawing from. */
  cartSoldByProduct?: Record<number, number>;
  cartWarehouseId?: string;
  cartTripId?: number | string | null;
}

export function diagnoseOversoldGodowns(input: OversoldInput): OversoldItem[] {
  const { products, warehouses, inventoryBatches, bills, audits } = input;
  // The single/zero-godown path clamps at 0 and cannot be "oversold in a godown".
  if (warehouses.length < 2) return [];

  const ledgerAdj: Record<string, number> = {};
  for (const e of input.stockLedgerEntries || []) {
    if (!e.warehouseId) continue;
    const k = `${e.productId}|${e.warehouseId}`;
    ledgerAdj[k] = (ledgerAdj[k] || 0) + (Number(e.quantity) || 0);
  }
  for (const a of audits) {
    if (!a.adjusted) continue;
    for (const e of a.entries) {
      if (!e.warehouseId) continue;
      const k = `${e.productId}|${e.warehouseId}`;
      ledgerAdj[k] = (ledgerAdj[k] || 0) + (Number(e.diff) || 0);
    }
  }
  const disposed: Record<string, number> = {};
  for (const d of input.inventoryDispositions || []) {
    if (d.stockApplied === false) continue;
    const k = `${d.productId}|${d.warehouseId}`;
    disposed[k] = (disposed[k] || 0) + (Number(d.quantity) || 0);
  }

  const validWhIds = new Set(warehouses.map((w) => w.id));
  const batchWh = new Map(inventoryBatches.map((b) => [b.id, b.warehouseId]));
  const out: OversoldItem[] = [];

  for (const p of products) {
    const validWh = (id?: string) => !!id && validWhIds.has(id);
    const fallbackWh = validWh(p.warehouseId)
      ? (p.warehouseId as string)
      : warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || '';
    const whOf = (id?: string) => (validWh(id) ? (id as string) : fallbackWh);

    const soldInWh: Record<string, number> = {};
    const billsInWh: Record<string, Map<number, OversoldBillRef>> = {};
    const note = (
      b: Bill,
      wh: string,
      qty: number,
      src: 'batch' | 'bill-godown',
      label?: string,
      resolvedTripId?: number,
    ) => {
      soldInWh[wh] = (soldInWh[wh] || 0) + qty;
      const m = (billsInWh[wh] = billsInWh[wh] || new Map());
      let ref = m.get(b.id);
      if (!ref) {
        ref = {
          billId: b.id,
          billDate: b.date,
          retailer: b.retailer,
          tripId: b.tripId ?? resolvedTripId,
          qtyDeducted: 0,
          allocationSource: src,
          batchLabels: [],
        };
        m.set(b.id, ref);
      } else {
        if (ref.allocationSource !== src) ref.allocationSource = 'mixed';
        if (ref.tripId == null && resolvedTripId != null) ref.tripId = resolvedTripId;
      }
      ref.qtyDeducted += qty;
      if (label && !ref.batchLabels.includes(label)) ref.batchLabels.push(label);
    };

    for (const b of bills) {
      for (const it of b.items) {
        if (it.productId !== p.id) continue;
        let left = Number(it.qty) || 0;
        for (const a of it.batchAllocations || []) {
          const wh = batchWh.get(a.batchId);
          if (!wh) continue;
          const take = Math.min(left, Number(a.qty) || 0);
          if (take > 0) {
            note(b, wh, take, 'batch', a.batchNumber);
            left -= take;
          }
        }
        if (left > 0) {
          const tr = resolveBillTrip(b, input.trips);
          const tripWh = tr ? tripPrimaryWarehouseId(tr, validWhIds) : '';
          note(b, tripWh || whOf(b.warehouseId), left, 'bill-godown', undefined, tr?.id);
        }
      }
    }
    const cartQty = input.cartSoldByProduct?.[p.id] || 0;
    if (cartQty > 0) {
      const cartTrip =
        input.cartTripId != null
          ? (input.trips || []).find((t) => Number(t.id) === Number(input.cartTripId))
          : null;
      const cartWh = cartTrip
        ? tripPrimaryWarehouseId(cartTrip, validWhIds) || whOf(input.cartWarehouseId)
        : whOf(input.cartWarehouseId);
      soldInWh[cartWh] = (soldInWh[cartWh] || 0) + cartQty;
    }

    const restocked: Record<string, number> = {};
    for (const b of bills) {
      const billTrip = (b.returns || []).length > 0 ? resolveBillTrip(b, input.trips) : null;
      const billFallbackWh =
        (validWh(b.warehouseId) ? (b.warehouseId as string) : '') ||
        (billTrip ? tripPrimaryWarehouseId(billTrip, validWhIds) : '');
      for (const r of b.returns || []) {
        for (const l of r.lines) {
          if (l.productId === p.id && l.restockQty > 0) {
            for (const d of restockDestinations(l, billFallbackWh || b.warehouseId)) {
              const wh = whOf(d.warehouseId);
              restocked[wh] = (restocked[wh] || 0) + d.qty;
            }
          }
        }
      }
    }

    const hasBatches = inventoryBatches.some((b) => b.productId === p.id);
    const rows = warehouses.map((w) => {
      const inward = hasBatches
        ? inventoryBatches
            .filter((b) => b.productId === p.id && b.warehouseId === w.id)
            .reduce((s, b) => s + (Number(b.quantity) || 0), 0)
        : p.warehouseId === w.id
          ? Number(p.opening) || 0
          : 0;
      const adj = ledgerAdj[`${p.id}|${w.id}`] || 0;
      const rest = restocked[w.id] || 0;
      const disp = disposed[`${p.id}|${w.id}`] || 0;
      const sold = soldInWh[w.id] || 0;
      return { w, inward, adj, rest, disp, sold, book: inward + adj + rest - disp - sold };
    });

    for (const r of rows) {
      if (r.book >= 0) continue;
      out.push({
        productId: p.id,
        productName: p.name,
        warehouseId: r.w.id,
        warehouseName: r.w.name,
        inwardCases: r.inward,
        auditLedgerAdjCases: r.adj,
        restockedCases: r.rest,
        disposedCases: r.disp,
        totalSoldCases: r.sold,
        bookBalance: r.book,
        shortfallCases: -r.book,
        bills: Array.from(billsInWh[r.w.id]?.values() || []).sort(
          (a, b) => b.qtyDeducted - a.qtyDeducted || b.billId - a.billId,
        ),
        targets: rows
          .filter((o) => o.w.id !== r.w.id)
          .map((o) => ({
            warehouseId: o.w.id,
            warehouseName: o.w.name,
            bookBalance: o.book,
            availableCases: Math.max(0, o.book),
          }))
          .sort((a, b) => b.availableCases - a.availableCases),
      });
    }
  }
  return out.sort((a, b) => a.bookBalance - b.bookBalance);
}

/**
 * Turns oversold items into one audit per godown that brings each negative book balance to 0.
 * Used by the inspector's "Clear ... via Audit" buttons; pure so it can be tested for ALL products.
 */
export function buildOversoldClearAudits(
  items: OversoldItem[],
  reason: string,
): {
  warehouseId: string;
  lines: { productId: number; system: number; counted: number; kind: 'oversold_adjust'; reason: string }[];
}[] {
  const byWh = new Map<string, OversoldItem[]>();
  for (const it of items) {
    if (it.bookBalance >= 0) continue; // never touch a godown that is not actually negative
    byWh.set(it.warehouseId, [...(byWh.get(it.warehouseId) || []), it]);
  }
  return Array.from(byWh.entries()).map(([warehouseId, list]) => ({
    warehouseId,
    lines: list.map((it) => ({
      productId: it.productId,
      system: it.bookBalance,
      counted: 0,
      kind: 'oversold_adjust' as const,
      reason,
    })),
  }));
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Advanced: move a product's stock deduction on selected bills from one godown to another.
//
// ONLY `items[].batchAllocations` of the selected product lines may change. Everything else on the
// bill (totals, GST, line amounts, costExGst, batchNumber/expiry text, payments, returns, godown tag)
// is left exactly as it was, and the function THROWS (changing nothing) if a guard fails.
// ───────────────────────────────────────────────────────────────────────────────────────────
export class ReassignGuardError extends Error {}

export interface ReassignInput {
  /** ALL bills (cancelled ones are skipped). */
  bills: Bill[];
  billIds: number[];
  productId: number;
  fromWarehouseId: string;
  toWarehouseId: string;
  products: Product[];
  warehouses: Warehouse[];
  inventoryBatches: InventoryBatch[];
  trips?: Trip[];
  /** Bills that must not be touched right now (e.g. open in the bill editor). */
  lockedBillIds?: number[];
}

export interface ReassignResult {
  updatedBills: Bill[];
  changedBills: Bill[];
  /** The bills exactly as they were before (for undo). */
  originalBills: Bill[];
  movedCases: number;
  perBill: { billId: number; movedCases: number }[];
  skipped: { billId: number; reason: string }[];
}

export interface ReassignSummary {
  ok: boolean;
  error?: string;
  movedCases: number;
  perBill: { billId: number; movedCases: number }[];
  skipped: { billId: number; reason: string }[];
}

function stableJson(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  return (
    '{' +
    Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableJson(v[k]))
      .join(',') +
    '}'
  );
}

const withoutAllocations = (b: Bill) => ({
  ...b,
  items: (b.items || []).map((it) => {
    const { batchAllocations: _drop, ...rest } = it as any;
    return rest;
  }),
});

type Take = { a: NonNullable<Bill['items'][number]['batchAllocations']>[number]; wh?: string; take: number };

/** Same walk as productWarehouseStock: which godown each allocation really drew from. */
function effectiveTakes(item: Bill['items'][number], batchWh: Map<string, string>): { takes: Take[]; left: number } {
  let left = Number(item.qty) || 0;
  const takes: Take[] = [];
  for (const a of item.batchAllocations || []) {
    const wh = batchWh.get(a.batchId);
    if (!wh) {
      takes.push({ a, wh: undefined, take: 0 });
      continue;
    }
    const take = Math.max(0, Math.min(left, Number(a.qty) || 0));
    left -= take;
    takes.push({ a, wh, take });
  }
  return { takes, left };
}

function attribution(
  b: Bill,
  productId: number,
  batchWh: Map<string, string>,
  unallocatedWhOf: (b: Bill) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of b.items || []) {
    if (it.productId !== productId) continue;
    const { takes, left } = effectiveTakes(it, batchWh);
    for (const t of takes) if (t.wh && t.take > 0) out[t.wh] = (out[t.wh] || 0) + t.take;
    if (left > 0) {
      const wh = unallocatedWhOf(b);
      out[wh] = (out[wh] || 0) + left;
    }
  }
  return out;
}

export function reassignBillsProductWarehouse(input: ReassignInput): ReassignResult {
  const { bills, billIds, productId, fromWarehouseId, toWarehouseId, products, warehouses, inventoryBatches, trips } = input;
  const validWhIds = new Set(warehouses.map((w) => w.id));
  const validWh = (id?: string) => !!id && validWhIds.has(id);
  if (!validWh(fromWarehouseId) || !validWh(toWarehouseId)) throw new ReassignGuardError('Choose two valid godowns.');
  if (fromWarehouseId === toWarehouseId) throw new ReassignGuardError('Source and target godown are the same.');
  const product = products.find((p) => p.id === productId);
  if (!product) throw new ReassignGuardError('Product not found.');

  const fallbackWh = validWh(product.warehouseId)
    ? (product.warehouseId as string)
    : warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || '';
  const whOf = (id?: string) => (validWh(id) ? (id as string) : fallbackWh);
  const unallocatedWhOf = (b: Bill) => {
    const tr = resolveBillTrip(b, trips);
    const tripWh = tr ? tripPrimaryWarehouseId(tr, validWhIds) : '';
    return tripWh || whOf(b.warehouseId);
  };
  const batchWh = new Map(inventoryBatches.map((b) => [b.id, b.warehouseId]));

  const toBatches = inventoryBatches
    .filter((b) => b.productId === productId && b.warehouseId === toWarehouseId)
    .sort((a, b) => {
      const ea = a.expiryDate || '9999-12-31';
      const eb = b.expiryDate || '9999-12-31';
      return ea === eb ? String(a.inwardDate || '').localeCompare(String(b.inwardDate || '')) : ea.localeCompare(eb);
    });
  if (toBatches.length === 0) {
    throw new ReassignGuardError('The target godown has no batch of this product, so the sale cannot be linked there.');
  }

  // How much of each target batch is already drawn by active bills (so we fill batches that still have stock first).
  const used: Record<string, number> = {};
  for (const b of bills) {
    if (b.status === 'cancelled') continue;
    for (const it of b.items || []) {
      if (it.productId !== productId) continue;
      for (const t of effectiveTakes(it, batchWh).takes) if (t.wh === toWarehouseId) used[t.a.batchId] = (used[t.a.batchId] || 0) + t.take;
    }
  }
  const place = (qty: number): Map<string, number> => {
    const out = new Map<string, number>();
    let left = qty;
    for (const b of toBatches) {
      if (left <= 0) break;
      const cap = Math.max(0, (Number(b.quantity) || 0) - (used[b.id] || 0));
      const t = Math.min(cap, left);
      if (t > 0) {
        out.set(b.id, t);
        used[b.id] = (used[b.id] || 0) + t;
        left -= t;
      }
    }
    if (left > 0) {
      const last = toBatches[toBatches.length - 1];
      out.set(last.id, (out.get(last.id) || 0) + left); // target is short: the preview shows it going negative
      used[last.id] = (used[last.id] || 0) + left;
    }
    return out;
  };

  const locked = new Set(input.lockedBillIds || []);
  const changedById = new Map<number, Bill>();
  const originals: Bill[] = [];
  const perBill: { billId: number; movedCases: number }[] = [];
  const skipped: { billId: number; reason: string }[] = [];

  for (const id of Array.from(new Set(billIds))) {
    const bill = bills.find((b) => b.id === id);
    if (!bill) { skipped.push({ billId: id, reason: 'Bill not found' }); continue; }
    if (bill.status === 'cancelled') { skipped.push({ billId: id, reason: 'Cancelled bill' }); continue; }
    if (locked.has(id)) { skipped.push({ billId: id, reason: 'Open in the bill editor' }); continue; }
    if (!validWh(bill.warehouseId)) {
      // Moving a line on a bill with no godown tag would show up as a "cross-godown shift" warning.
      skipped.push({ billId: id, reason: 'Bill has no godown tag; moving it would trigger a cross-godown shift warning' });
      continue;
    }
    let moved = 0;
    const newItems = (bill.items || []).map((it) => {
      if (it.productId !== productId) return it;
      const { takes, left } = effectiveTakes(it, batchWh);
      const fromTaken = takes.filter((t) => t.wh === fromWarehouseId).reduce((s, t) => s + t.take, 0);
      const leftFrom = unallocatedWhOf(bill) === fromWarehouseId ? left : 0;
      const m = fromTaken + leftFrom;
      if (m <= 0) return it;
      moved += m;
      const merged = new Map<string, NonNullable<Bill['items'][number]['batchAllocations']>[number]>();
      const add = (a: (typeof takes)[number]['a'], qty: number) => {
        const prev = merged.get(a.batchId);
        merged.set(a.batchId, prev ? { ...prev, qty: prev.qty + qty } : { ...a, qty });
      };
      for (const t of takes) {
        if (t.wh === fromWarehouseId) continue; // these move
        if (t.wh === undefined) merged.set(`__raw${merged.size}_${t.a.batchId}`, t.a); // unknown batch: keep untouched
        else add(t.a, t.take === (Number(t.a.qty) || 0) ? t.a.qty : t.take);
      }
      place(m).forEach((qty, batchId) => {
        const b = toBatches.find((x) => x.id === batchId)!;
        add({ batchId, batchNumber: b.batchNumber, expiryDate: b.expiryDate, qty: 0 }, qty);
      });
      return { ...it, batchAllocations: Array.from(merged.values()) };
    });
    if (moved <= 0) { skipped.push({ billId: id, reason: 'No cases of this product were taken from the source godown' }); continue; }
    const nb: Bill = { ...bill, items: newItems };

    // ── GUARD 1: nothing but batchAllocations may differ.
    if (stableJson(withoutAllocations(bill)) !== stableJson(withoutAllocations(nb))) {
      throw new ReassignGuardError(`Safety check failed on bill #${id}: a field other than the batch link would change. Nothing was saved.`);
    }
    // ── GUARD 2: the cases only moved between the two godowns; every other godown is identical.
    const before = attribution(bill, productId, batchWh, unallocatedWhOf);
    const after = attribution(nb, productId, batchWh, unallocatedWhOf);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach((k) => {
      const expected = (before[k] || 0) + (k === fromWarehouseId ? -moved : 0) + (k === toWarehouseId ? moved : 0);
      if ((after[k] || 0) !== expected) {
        throw new ReassignGuardError(`Safety check failed on bill #${id}: stock would not balance between godowns. Nothing was saved.`);
      }
    });
    changedById.set(id, nb);
    originals.push(bill);
    perBill.push({ billId: id, movedCases: moved });
  }

  const updatedBills = bills.map((b) => changedById.get(b.id) || b);

  // ── GUARD 3: no NEW cross-godown shift warnings (the app's own check, run on the result).
  const planArgs = { products, inventoryBatches, warehouses };
  const beforeWarn = new Set(buildCrossWarehouseShiftPlan({ bills, ...planArgs }).lines.map((l) => l.billId));
  for (const l of buildCrossWarehouseShiftPlan({ bills: updatedBills, ...planArgs }).lines) {
    if (!beforeWarn.has(l.billId)) {
      throw new ReassignGuardError(`Safety check failed: bill #${l.billId} would raise a cross-godown shift warning. Nothing was saved.`);
    }
  }

  return {
    updatedBills,
    changedBills: Array.from(changedById.values()),
    originalBills: originals,
    movedCases: perBill.reduce((s, p) => s + p.movedCases, 0),
    perBill,
    skipped,
  };
}
