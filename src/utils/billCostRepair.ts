import { Bill, BillItem, InventoryBatch, Product, Warehouse } from '../types';
import { returnedQtyByProduct } from './salesReturns';

export type EstimatedCostReason =
  | 'no_batch'
  | 'van_fallback'
  | 'missing_or_zero_batch';

export type RepairActionKind = 'link_and_freeze' | 'freeze_cost_only';
export type RepairApplyMode = 'link_and_freeze' | 'freeze_only';

export interface MatchedBatchInfo {
  batchId: string;
  batchNumber: string;
  expiryDate?: string;
  warehouseId: string;
  warehouseName: string;
  inwardDate?: string;
  costPerCase: number;
}

export interface BillCostRepairLine {
  billId: number;
  billDate: string;
  retailer: string;
  warehouseId: string;
  warehouseName: string;
  itemIndex: number;
  productId: number;
  productName: string;
  netCases: number;
  reason: EstimatedCostReason;
  existingBatchText: string;
  currentAvgCostExGst: number;
  matchedBatch: MatchedBatchInfo | null;
  proposedCostExGst: number;
  action: RepairActionKind;
}

export interface BillCostRepairPlan {
  lines: BillCostRepairLine[];
  affectedBillCount: number;
  totalCases: number;
  linkableLinesCount: number;
  linkableCases: number;
  freezeOnlyLinesCount: number;
  freezeOnlyCases: number;
}

export interface BillCostRepairResult {
  updatedBills: Bill[];
  changedBills: Bill[];
  fixedBills: number;
  fixedLines: number;
  linkedLines: number;
  frozenOnlyLines: number;
  fixedCases: number;
}

export interface CrossWarehouseShiftLine {
  billId: number;
  billDate: string;
  retailer: string;
  itemIndex: number;
  productId: number;
  productName: string;
  qty: number;
  expectedWarehouseId: string;
  expectedWarehouseName: string;
  allocatedWarehouseIds: string[];
  allocatedWarehouseNames: string[];
  replacementBatch: MatchedBatchInfo | null;
}

export interface CrossWarehouseShiftPlan {
  lines: CrossWarehouseShiftLine[];
  affectedBillCount: number;
  totalShiftedCases: number;
}

export interface CrossWarehouseRestoreResult {
  updatedBills: Bill[];
  changedBills: Bill[];
  restoredBills: number;
  restoredLines: number;
  restoredCases: number;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export function resolveExGstCostForProduct(product: Product | undefined): number {
  if (!product) return 0;
  let eff = Number(product.effectiveCost ?? product.cost ?? 0) || 0;
  const cost = Number(product.cost ?? 0) || eff;
  // Guard against any single-bottle rate accidentally stored (< 35% of crate cost)
  if (eff > 0 && cost > 0 && eff < cost * 0.35 && (product.unitsPerCrate || 30) > 1) {
    eff = cost;
  }
  return eff;
}

/**
 * Mirrors LedgerContext's `whOf(bill.warehouseId)` / `fallbackWarehouseId(product)`
 * so batch matching NEVER shifts a bill's sales deduction to a different warehouse.
 */
export function resolveEffectiveBillWarehouseId(
  billWarehouseId: string | undefined,
  product: Product | undefined,
  warehouses: Warehouse[],
): string {
  const valid = (id?: string) => !!id && warehouses.some((w) => w.id === id);
  if (valid(billWarehouseId)) return billWarehouseId as string;
  if (product && valid(product.warehouseId)) return product.warehouseId as string;
  const def = warehouses.find((w) => w.isDefault);
  return def?.id || warehouses[0]?.id || '';
}

function isSaneBatchCost(raw: number, exFallback: number): boolean {
  return raw > 0 && !(exFallback > 0 && raw < exFallback * 0.35);
}

function classifyReason(
  item: BillItem,
  batchMap: Map<string, InventoryBatch>,
): EstimatedCostReason {
  const allocs = item.batchAllocations || [];
  if (allocs.length === 0) return 'no_batch';
  const hasVanFallback = allocs.some(
    (a) =>
      String(a.batchId || '').startsWith('trip_') ||
      String(a.batchNumber || '').toUpperCase().startsWith('VAN-'),
  );
  if (hasVanFallback) return 'van_fallback';
  const anyKnown = allocs.some((a) => batchMap.has(a.batchId));
  return anyKnown ? 'missing_or_zero_batch' : 'missing_or_zero_batch';
}

function pickCandidateBatch(args: {
  productId: number;
  billDate: string;
  effectiveWarehouseId: string;
  exFallback: number;
  batches: InventoryBatch[];
  warehouses: Warehouse[];
}): MatchedBatchInfo | null {
  const { productId, billDate, effectiveWarehouseId, exFallback, batches, warehouses } = args;
  const multiWh = warehouses.length > 1;
  const normDate = (billDate || '').slice(0, 10);

  // CRITICAL STOCK INVARIANT:
  // `productWarehouseStock` deducts allocated lines from `batch.warehouseId` and
  // unallocated lines from `effectiveWarehouseId = whOf(bill.warehouseId)`.
  // When >1 warehouse exists, ONLY match a batch inside `effectiveWarehouseId`
  // so linking batches NEVER shifts stock between godowns or alters total inventory.
  const candidates = batches.filter((b) => {
    if (b.productId !== productId) return false;
    const raw = Number(b.effectiveCostPrice) || Number(b.costPrice) || 0;
    if (!isSaneBatchCost(raw, exFallback)) return false;
    if (!multiWh) return true;
    return !!effectiveWarehouseId && b.warehouseId === effectiveWarehouseId;
  });

  if (candidates.length === 0) return null;

  const whNameOf = (id: string) =>
    warehouses.find((w) => w.id === id)?.name || (id ? id : 'Default');

  const sorted = [...candidates].sort((a, b) => {
    const aSameWh = effectiveWarehouseId && a.warehouseId === effectiveWarehouseId ? 0 : 1;
    const bSameWh = effectiveWarehouseId && b.warehouseId === effectiveWarehouseId ? 0 : 1;
    if (aSameWh !== bSameWh) return aSameWh - bSameWh;

    const aIn = (a.inwardDate || '0000-01-01').slice(0, 10);
    const bIn = (b.inwardDate || '0000-01-01').slice(0, 10);
    const aInTime = !normDate || aIn <= normDate ? 0 : 1;
    const bInTime = !normDate || bIn <= normDate ? 0 : 1;
    if (aInTime !== bInTime) return aInTime - bInTime;

    const aExp = (a.expiryDate || '9999-12-31').slice(0, 10);
    const bExp = (b.expiryDate || '9999-12-31').slice(0, 10);
    const aValidExp = !normDate || aExp >= normDate ? 0 : 1;
    const bValidExp = !normDate || bExp >= normDate ? 0 : 1;
    if (aValidExp !== bValidExp) return aValidExp - bValidExp;

    if (aExp !== bExp) return aExp.localeCompare(bExp);
    return aIn.localeCompare(bIn);
  });

  const best = sorted[0];
  const rawCost = Number(best.effectiveCostPrice) || Number(best.costPrice) || 0;
  return {
    batchId: best.id,
    batchNumber: best.batchNumber || best.id,
    expiryDate: best.expiryDate,
    warehouseId: best.warehouseId || '',
    warehouseName: whNameOf(best.warehouseId || ''),
    inwardDate: best.inwardDate,
    costPerCase: round2(rawCost),
  };
}

/**
 * Builds a deterministic preview of all active bill lines whose COGS is currently
 * `'estimated'` (no frozen `costExGst` and no valid priced `batchAllocations`).
 *
 * Strictly read-only — never mutates inputs.
 */
export function buildBillCostRepairPlan(args: {
  bills: Bill[];
  products: Product[];
  inventoryBatches: InventoryBatch[];
  warehouses?: Warehouse[];
}): BillCostRepairPlan {
  const { bills, products, inventoryBatches, warehouses = [] } = args;
  const productMap = new Map<number, Product>();
  for (const p of products) productMap.set(p.id, p);

  const batchMap = new Map<string, InventoryBatch>();
  for (const b of inventoryBatches || []) batchMap.set(b.id, b);

  const whNameOf = (id: string) =>
    warehouses.find((w) => w.id === id)?.name || (id ? id : 'Default');

  const lines: BillCostRepairLine[] = [];
  const billIds = new Set<number>();

  for (const b of bills) {
    if (b.status === 'cancelled') continue;
    const backByProd = returnedQtyByProduct(b);
    const items = b.items || [];

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const qty = Number(item.qty) || 0;
      const retQty = backByProd[item.productId] || 0;
      const netCases = Math.max(0, qty - retQty);
      if (netCases <= 0) continue;

      if ((Number(item.costExGst) || 0) > 0) continue;

      const prod = productMap.get(item.productId);
      const exFallback = resolveExGstCostForProduct(prod);
      let hasValidBatch = false;
      for (const a of item.batchAllocations || []) {
        const batch = batchMap.get(a.batchId);
        const raw = Number(batch?.effectiveCostPrice) || Number(batch?.costPrice) || 0;
        if ((Number(a.qty) || 0) > 0 && isSaneBatchCost(raw, exFallback)) {
          hasValidBatch = true;
          break;
        }
      }
      if (hasValidBatch) continue;
      if (exFallback <= 0) continue;

      const effectiveWh = resolveEffectiveBillWarehouseId(b.warehouseId, prod, warehouses);
      const matchedBatch = pickCandidateBatch({
        productId: item.productId,
        billDate: String(b.date || ''),
        effectiveWarehouseId: effectiveWh,
        exFallback,
        batches: inventoryBatches || [],
        warehouses,
      });

      const reason = classifyReason(item, batchMap);
      const existingBatchText =
        item.batchNumber?.trim() ||
        (item.batchAllocations || []).map((a) => a.batchNumber).filter(Boolean).join(', ') ||
        'None';

      const proposedCostExGst = matchedBatch
        ? matchedBatch.costPerCase
        : round2(exFallback);

      const action: RepairActionKind = matchedBatch ? 'link_and_freeze' : 'freeze_cost_only';

      billIds.add(b.id);
      lines.push({
        billId: b.id,
        billDate: String(b.date || '').slice(0, 10),
        retailer: b.retailer || 'Cash Sale',
        warehouseId: effectiveWh,
        warehouseName: whNameOf(effectiveWh),
        itemIndex: idx,
        productId: item.productId,
        productName: item.productName || prod?.name || `Product #${item.productId}`,
        netCases,
        reason,
        existingBatchText,
        currentAvgCostExGst: round2(exFallback),
        matchedBatch,
        proposedCostExGst,
        action,
      });
    }
  }

  let totalCases = 0;
  let linkableLinesCount = 0;
  let linkableCases = 0;
  let freezeOnlyLinesCount = 0;
  let freezeOnlyCases = 0;

  for (const l of lines) {
    totalCases += l.netCases;
    if (l.action === 'link_and_freeze') {
      linkableLinesCount += 1;
      linkableCases += l.netCases;
    } else {
      freezeOnlyLinesCount += 1;
      freezeOnlyCases += l.netCases;
    }
  }

  return {
    lines,
    affectedBillCount: billIds.size,
    totalCases,
    linkableLinesCount,
    linkableCases,
    freezeOnlyLinesCount,
    freezeOnlyCases,
  };
}

/**
 * Applies a previously built `BillCostRepairPlan` to `bills`.
 *
 * CRITICAL FINANCIAL INVARIANT:
 * Never modifies invoice totals, subtotal, taxable, GST (cgst/sgst), roundOff,
 * discounts, additionalDiscount, amountPaid, taxStamp, invoiceType, returns,
 * payment records, or line qty/rate/gross/amount.
 */
export function applyBillCostRepairPlan(args: {
  bills: Bill[];
  plan: BillCostRepairPlan;
  mode?: RepairApplyMode;
  nowIso?: string;
}): BillCostRepairResult {
  const { bills, plan, mode = 'link_and_freeze', nowIso = new Date().toISOString() } = args;

  const byBill = new Map<number, Map<number, BillCostRepairLine>>();
  for (const line of plan.lines) {
    let m = byBill.get(line.billId);
    if (!m) {
      m = new Map();
      byBill.set(line.billId, m);
    }
    m.set(line.itemIndex, line);
  }

  const changedBills: Bill[] = [];
  let fixedLines = 0;
  let linkedLines = 0;
  let frozenOnlyLines = 0;
  let fixedCases = 0;

  const updatedBills = bills.map((bill) => {
    if (bill.status === 'cancelled') return bill;
    const targets = byBill.get(bill.id);
    if (!targets || targets.size === 0) return bill;

    let billModified = false;
    const nextItems = (bill.items || []).map((item, idx) => {
      const line = targets.get(idx);
      if (!line) return item;
      if ((Number(item.costExGst) || 0) > 0) return item;

      const canLink =
        mode === 'link_and_freeze' &&
        line.action === 'link_and_freeze' &&
        line.matchedBatch !== null;

      const costToFreeze = canLink
        ? line.proposedCostExGst
        : line.currentAvgCostExGst;

      if (!(costToFreeze > 0)) return item;

      billModified = true;
      fixedLines += 1;
      fixedCases += line.netCases;

      if (canLink && line.matchedBatch) {
        linkedLines += 1;
        return {
          ...item,
          costExGst: costToFreeze,
          batchNumber: line.matchedBatch.batchNumber,
          expiryDate: line.matchedBatch.expiryDate || item.expiryDate,
          batchAllocations: [
            {
              batchId: line.matchedBatch.batchId,
              batchNumber: line.matchedBatch.batchNumber,
              expiryDate: line.matchedBatch.expiryDate,
              qty: Number(item.qty) || 0,
            },
          ],
        };
      }

      frozenOnlyLines += 1;
      return {
        ...item,
        costExGst: costToFreeze,
      };
    });

    if (!billModified) return bill;

    const updatedBill: Bill = {
      ...bill,
      items: nextItems,
      updatedAt: nowIso,
    };
    changedBills.push(updatedBill);
    return updatedBill;
  });

  return {
    updatedBills,
    changedBills,
    fixedBills: changedBills.length,
    fixedLines,
    linkedLines,
    frozenOnlyLines,
    fixedCases,
  };
}

/**
 * Detects bills WITHOUT an explicit valid `warehouseId` whose `batchAllocations`
 * point to a batch in a DIFFERENT warehouse than `resolveEffectiveBillWarehouseId`
 * (the warehouse `productWarehouseStock` used before batch linking).
 *
 * When that other warehouse is oversold, linking a cross-godown batch silently
 * shifts the sale into the oversold warehouse and inflates displayed inventory.
 */
export function buildCrossWarehouseShiftPlan(args: {
  bills: Bill[];
  products: Product[];
  inventoryBatches: InventoryBatch[];
  warehouses: Warehouse[];
}): CrossWarehouseShiftPlan {
  const { bills, products, inventoryBatches, warehouses } = args;
  if (warehouses.length <= 1) {
    return { lines: [], affectedBillCount: 0, totalShiftedCases: 0 };
  }

  const validWhIds = new Set(warehouses.map((w) => w.id));
  const productMap = new Map<number, Product>();
  for (const p of products) productMap.set(p.id, p);

  const batchMap = new Map<string, InventoryBatch>();
  for (const b of inventoryBatches || []) batchMap.set(b.id, b);

  const whNameOf = (id: string) =>
    warehouses.find((w) => w.id === id)?.name || (id ? id : 'Default');

  const lines: CrossWarehouseShiftLine[] = [];
  const billIds = new Set<number>();
  let totalShiftedCases = 0;

  for (const b of bills) {
    if (b.status === 'cancelled') continue;
    // Only bills lacking a valid explicit warehouseId were ever vulnerable to cross-warehouse linking
    if (b.warehouseId && validWhIds.has(b.warehouseId)) continue;

    for (let idx = 0; idx < (b.items || []).length; idx++) {
      const item = b.items[idx];
      const allocs = item.batchAllocations || [];
      if (allocs.length === 0) continue;

      const prod = productMap.get(item.productId);
      const expectedWh = resolveEffectiveBillWarehouseId(b.warehouseId, prod, warehouses);
      if (!expectedWh) continue;

      const mismatchedWhs = new Set<string>();
      for (const a of allocs) {
        const batch = batchMap.get(a.batchId);
        if (batch?.warehouseId && batch.warehouseId !== expectedWh) {
          mismatchedWhs.add(batch.warehouseId);
        }
      }
      if (mismatchedWhs.size === 0) continue;

      const exFallback = resolveExGstCostForProduct(prod);
      const replacementBatch = pickCandidateBatch({
        productId: item.productId,
        billDate: String(b.date || ''),
        effectiveWarehouseId: expectedWh,
        exFallback,
        batches: inventoryBatches,
        warehouses,
      });

      const qty = Number(item.qty) || 0;
      billIds.add(b.id);
      totalShiftedCases += qty;
      const allocWhIds = Array.from(mismatchedWhs);
      lines.push({
        billId: b.id,
        billDate: String(b.date || '').slice(0, 10),
        retailer: b.retailer || 'Cash Sale',
        itemIndex: idx,
        productId: item.productId,
        productName: item.productName || prod?.name || `Product #${item.productId}`,
        qty,
        expectedWarehouseId: expectedWh,
        expectedWarehouseName: whNameOf(expectedWh),
        allocatedWarehouseIds: allocWhIds,
        allocatedWarehouseNames: allocWhIds.map(whNameOf),
        replacementBatch,
      });
    }
  }

  return {
    lines,
    affectedBillCount: billIds.size,
    totalShiftedCases,
  };
}

/**
 * Restores exact godown stock balances on bills detected by `buildCrossWarehouseShiftPlan`
 * by either re-linking to a batch inside `expectedWarehouseId` or clearing the cross-godown
 * `batchAllocations` while preserving frozen `costExGst`. Never alters totals, GST, dues, or payments.
 */
export function applyCrossWarehouseRestorePlan(args: {
  bills: Bill[];
  plan: CrossWarehouseShiftPlan;
  nowIso?: string;
}): CrossWarehouseRestoreResult {
  const { bills, plan, nowIso = new Date().toISOString() } = args;

  const byBill = new Map<number, Map<number, CrossWarehouseShiftLine>>();
  for (const l of plan.lines) {
    let m = byBill.get(l.billId);
    if (!m) {
      m = new Map();
      byBill.set(l.billId, m);
    }
    m.set(l.itemIndex, l);
  }

  const changedBills: Bill[] = [];
  let restoredLines = 0;
  let restoredCases = 0;

  const updatedBills = bills.map((bill) => {
    if (bill.status === 'cancelled') return bill;
    const targets = byBill.get(bill.id);
    if (!targets || targets.size === 0) return bill;

    let modified = false;
    const nextItems = (bill.items || []).map((item, idx) => {
      const l = targets.get(idx);
      if (!l) return item;

      modified = true;
      restoredLines += 1;
      restoredCases += l.qty;

      const preservedCost =
        (Number(item.costExGst) || 0) > 0
          ? item.costExGst
          : l.replacementBatch?.costPerCase;

      if (l.replacementBatch) {
        return {
          ...item,
          ...(preservedCost && preservedCost > 0 ? { costExGst: preservedCost } : {}),
          batchNumber: l.replacementBatch.batchNumber,
          expiryDate: l.replacementBatch.expiryDate || item.expiryDate,
          batchAllocations: [
            {
              batchId: l.replacementBatch.batchId,
              batchNumber: l.replacementBatch.batchNumber,
              expiryDate: l.replacementBatch.expiryDate,
              qty: Number(item.qty) || 0,
            },
          ],
        };
      }

      // Clear cross-godown allocation so `productWarehouseStock` returns to `expectedWarehouseId`,
      // while keeping `costExGst` frozen so P&L stays exact without estimating.
      const nextItem: BillItem = {
        ...item,
        ...(preservedCost && preservedCost > 0 ? { costExGst: preservedCost } : {}),
      };
      delete nextItem.batchAllocations;
      delete nextItem.batchNumber;
      return nextItem;
    });

    if (!modified) return bill;

    const updatedBill: Bill = {
      ...bill,
      items: nextItems,
      updatedAt: nowIso,
    };
    changedBills.push(updatedBill);
    return updatedBill;
  });

  return {
    updatedBills,
    changedBills,
    restoredBills: changedBills.length,
    restoredLines,
    restoredCases,
  };
}
