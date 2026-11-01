/**
 * Stock lot policy: FIFO (First In, First Out by inward date) + expiry safety.
 * Billing uses the same rules in LedgerContext.allocateBatches.
 * FEFO helpers remain available when you want earliest-expiry priority.
 */

import type { InventoryBatch, Product } from '../types';

export function compareInwardAsc(
  a: { inwardDate?: string; expiryDate?: string },
  b: { inwardDate?: string; expiryDate?: string }
): number {
  const ia = (a.inwardDate || '0000-01-01').slice(0, 10);
  const ib = (b.inwardDate || '0000-01-01').slice(0, 10);
  if (ia !== ib) return ia.localeCompare(ib);
  // Same receipt day → earlier expiry first
  return (a.expiryDate || '9999-12-31').localeCompare(b.expiryDate || '9999-12-31');
}

export function compareExpiryAsc(a: { expiryDate?: string }, b: { expiryDate?: string }): number {
  return (a.expiryDate || '9999-12-31').localeCompare(b.expiryDate || '9999-12-31');
}

export function isExpired(expiryDate: string | undefined, asOf: string): boolean {
  if (!expiryDate) return false;
  return expiryDate.slice(0, 10) < asOf.slice(0, 10);
}

export function daysUntilExpiry(expiryDate: string | undefined, asOf: string): number | null {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate.slice(0, 10) + 'T00:00:00');
  const base = new Date(asOf.slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(exp.getTime()) || Number.isNaN(base.getTime())) return null;
  return Math.round((exp.getTime() - base.getTime()) / 86400000);
}

/** Thresholds (days). Tune here or from settings later. */
export const EXPIRY_ALERT_CRITICAL_DAYS = 7;
export const EXPIRY_ALERT_WARNING_DAYS = 30;

export type ExpiryAlertLevel = 'expired' | 'critical' | 'warning' | 'ok';

export function classifyBatchExpiry(
  expiryDate: string | undefined,
  asOf: string,
  criticalDays = EXPIRY_ALERT_CRITICAL_DAYS,
  warningDays = EXPIRY_ALERT_WARNING_DAYS
): ExpiryAlertLevel {
  const d = daysUntilExpiry(expiryDate, asOf);
  if (d == null) return 'ok';
  if (d < 0) return 'expired';
  if (d <= criticalDays) return 'critical';
  if (d <= warningDays) return 'warning';
  return 'ok';
}

export interface BatchExpiryAlert {
  batchId: string;
  batchNumber: string;
  productId: number;
  productName: string;
  warehouseId: string;
  warehouseName?: string;
  expiryDate: string;
  inwardDate?: string;
  quantity: number;
  daysLeft: number;
  level: ExpiryAlertLevel;
}

export function collectExpiryAlerts(
  batches: InventoryBatch[],
  products: Product[],
  asOf: string,
  opts?: {
    warehouseId?: string;
    includeZeroQty?: boolean;
    criticalDays?: number;
    warningDays?: number;
  }
): BatchExpiryAlert[] {
  const criticalDays = opts?.criticalDays ?? EXPIRY_ALERT_CRITICAL_DAYS;
  const warningDays = opts?.warningDays ?? EXPIRY_ALERT_WARNING_DAYS;
  const nameOf = (id: number) => products.find((p) => p.id === id)?.name || `#${id}`;
  const out: BatchExpiryAlert[] = [];

  for (const b of batches) {
    if (opts?.warehouseId && b.warehouseId !== opts.warehouseId) continue;
    const qty = Number(b.quantity) || 0;
    if (!opts?.includeZeroQty && qty <= 0) continue;
    if (!b.expiryDate) continue;
    const level = classifyBatchExpiry(b.expiryDate, asOf, criticalDays, warningDays);
    if (level === 'ok') continue;
    const daysLeft = daysUntilExpiry(b.expiryDate, asOf) ?? 0;
    out.push({
      batchId: b.id,
      batchNumber: b.batchNumber || b.id,
      productId: b.productId,
      productName: nameOf(b.productId),
      warehouseId: b.warehouseId,
      expiryDate: b.expiryDate.slice(0, 10),
      inwardDate: b.inwardDate,
      quantity: qty,
      daysLeft,
      level,
    });
  }

  const rank = { expired: 0, critical: 1, warning: 2, ok: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.daysLeft - b.daysLeft);
}

export type LotPolicy = 'fifo' | 'fefo';

/** Batches for product/warehouse, FIFO (inward) or FEFO (expiry). */
export function sortBatchesByPolicy(
  batches: InventoryBatch[],
  policy: LotPolicy = 'fefo',
  opts?: { productId?: number; warehouseId?: string; remainingById?: Record<string, number> }
): InventoryBatch[] {
  let rows = batches;
  if (opts?.productId != null) rows = rows.filter((b) => b.productId === opts.productId);
  if (opts?.warehouseId) rows = rows.filter((b) => b.warehouseId === opts.warehouseId);
  const sorted = rows.slice().sort(policy === 'fefo' ? compareExpiryAsc : compareInwardAsc);
  return sorted.filter((b) => {
    const rem =
      opts?.remainingById && opts.remainingById[b.id] != null
        ? opts.remainingById[b.id]
        : Number(b.quantity) || 0;
    return rem > 0;
  });
}

/** @deprecated use sortBatchesByPolicy(..., 'fefo') */
export function sortBatchesFefo(
  batches: InventoryBatch[],
  opts?: { productId?: number; warehouseId?: string; remainingById?: Record<string, number> }
): InventoryBatch[] {
  return sortBatchesByPolicy(batches, 'fefo', opts);
}

export function sortBatchesFifo(
  batches: InventoryBatch[],
  opts?: { productId?: number; warehouseId?: string; remainingById?: Record<string, number> }
): InventoryBatch[] {
  return sortBatchesByPolicy(batches, 'fifo', opts);
}

export interface LotAllocation {
  batchId: string;
  batchNumber: string;
  expiryDate?: string;
  warehouseId: string;
  qty: number;
}

/** @deprecated alias */
export type FefoAllocation = LotAllocation;

/**
 * Allocate `need` cases FIFO (or FEFO). Always skips expired lots as of `asOf`.
 */
export function allocateLots(
  batches: InventoryBatch[],
  need: number,
  asOf: string,
  opts?: {
    productId?: number;
    warehouseId?: string;
    remainingById?: Record<string, number>;
    policy?: LotPolicy;
  }
): { allocations: LotAllocation[]; shortfall: number; expiredSkipped: number } {
  const policy = opts?.policy || 'fefo';
  const ordered = sortBatchesByPolicy(batches, policy, opts);
  const remaining: Record<string, number> = { ...(opts?.remainingById || {}) };
  for (const b of ordered) {
    if (remaining[b.id] == null) remaining[b.id] = Number(b.quantity) || 0;
  }

  let left = Math.max(0, need);
  let expiredSkipped = 0;
  const allocations: LotAllocation[] = [];
  const seenExpired = new Set<string>();

  for (const b of ordered) {
    if (left <= 0) break;
    let rem = remaining[b.id] ?? 0;
    if (rem <= 0) continue;
    if (isExpired(b.expiryDate, asOf)) {
      if (!seenExpired.has(b.id)) {
        seenExpired.add(b.id);
        expiredSkipped += rem;
      }
      continue;
    }
    const take = Math.min(rem, left);
    if (take <= 0) continue;
    allocations.push({
      batchId: b.id,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      warehouseId: b.warehouseId,
      qty: take,
    });
    remaining[b.id] = rem - take;
    left -= take;
  }

  return { allocations, shortfall: left, expiredSkipped };
}

/** @deprecated use allocateLots(..., { policy: 'fefo' }) */
export function allocateFefo(
  batches: InventoryBatch[],
  need: number,
  asOf: string,
  opts?: { productId?: number; warehouseId?: string; remainingById?: Record<string, number> }
) {
  return allocateLots(batches, need, asOf, { ...opts, policy: 'fefo' });
}

export function allocateFifo(
  batches: InventoryBatch[],
  need: number,
  asOf: string,
  opts?: { productId?: number; warehouseId?: string; remainingById?: Record<string, number> }
) {
  return allocateLots(batches, need, asOf, { ...opts, policy: 'fifo' });
}

/** Summarise supplier discounts on a GRN for reports / audit. */
export function summariseSupplierDiscount(grn: {
  overallDiscount?: number;
  totalLineDiscount?: number;
  items?: { discountAmount?: number; taxableAmount?: number; qty?: number; unitPrice?: number }[];
  grandTotal?: number;
  totalTaxable?: number;
}): {
  lineDiscount: number;
  billDiscount: number;
  totalDiscount: number;
  taxable: number;
} {
  const lineDiscount =
    grn.totalLineDiscount != null
      ? Number(grn.totalLineDiscount) || 0
      : (grn.items || []).reduce((s, it) => s + (Number(it.discountAmount) || 0), 0);
  const billDiscount = Math.max(0, Number(grn.overallDiscount) || 0);
  const taxable =
    grn.totalTaxable != null
      ? Number(grn.totalTaxable) || 0
      : (grn.items || []).reduce((s, it) => {
          const t =
            Number(it.taxableAmount) ||
            Math.max(0, (Number(it.qty) || 0) * (Number(it.unitPrice) || 0) - (Number(it.discountAmount) || 0));
          return s + t;
        }, 0);
  return {
    lineDiscount,
    billDiscount,
    totalDiscount: lineDiscount + billDiscount,
    taxable,
  };
}
