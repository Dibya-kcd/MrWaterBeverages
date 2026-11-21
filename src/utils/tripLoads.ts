import type { Bill, InventoryBatch, Trip, Warehouse } from '../types';

/**
 * Keeps a trip's per-godown split (`warehouseLoads`) in step with an edited load sheet.
 * Billing draws each product from the godowns recorded here, so the split must stay truthful.
 *
 *  - Source godown changed on a van that loads from ONE godown: the crates still unsold move to the chosen godown;
 *    crates already billed stay where they were drawn from.
 *  - Otherwise the existing split is kept: extra crates come from the chosen godown (added to the split when the
 *    van did not load from it yet), cuts are taken from the last godown first.
 */
export function rebalanceWarehouseLoads(
  existing: Record<string, Record<number, number>> | undefined,
  newLoaded: Record<number, number>,
  targetWarehouseId?: string,
  billed: Record<number, number> = {},
): Record<string, Record<number, number>> | undefined {
  if (!existing || Object.keys(existing).length === 0) {
    return targetWarehouseId ? { [targetWarehouseId]: { ...newLoaded } } : undefined;
  }
  const oldIds = Object.keys(existing);
  const target = targetWarehouseId || oldIds[0];

  // The source godown was changed on a van that loads from one godown: the crates still unsold move to the
  // chosen godown. Crates already billed stay where they were drawn from (the bills took them from that godown).
  if (oldIds.length === 1 && target !== oldIds[0]) {
    const from = oldIds[0];
    const next: Record<string, Record<number, number>> = { [from]: {}, [target]: {} };
    for (const [pidStr, total] of Object.entries(newLoaded)) {
      const pid = Number(pidStr);
      const keep = Math.min(Number(billed[pid]) || 0, total);
      if (keep > 0) next[from][pid] = keep;
      if (total - keep > 0) next[target][pid] = total - keep;
    }
    for (const wh of Object.keys(next)) if (Object.keys(next[wh]).length === 0) delete next[wh];
    return Object.keys(next).length > 0 ? next : undefined;
  }

  // Otherwise keep the existing split. Extra crates come from the chosen godown (added to the split if the van did
  // not load from it yet); cuts are taken from the last godown first.
  const whIds = oldIds.includes(target) ? oldIds : [...oldIds, target];
  const next: Record<string, Record<number, number>> = {};
  for (const wh of whIds) next[wh] = {};
  for (const [pidStr, total] of Object.entries(newLoaded)) {
    const pid = Number(pidStr);
    const split = whIds.map((wh) => ({ wh, q: Number(existing[wh]?.[pid]) || 0 }));
    const sum = split.reduce((a, x) => a + x.q, 0);
    if (sum < total) {
      const row = split.find((x) => x.wh === target)!;
      row.q += total - sum;
    } else if (sum > total) {
      let excess = sum - total;
      for (let i = split.length - 1; i >= 0 && excess > 0; i--) {
        const cut = Math.min(split[i].q, excess);
        split[i].q -= cut;
        excess -= cut;
      }
    }
    for (const x of split) if (x.q > 0) next[x.wh][pid] = x.q;
  }
  for (const wh of whIds) if (Object.keys(next[wh]).length === 0) delete next[wh];
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Returns the godown IDs that actually supplied crates for a trip, ordered by loaded crates descending.
 * Uses `warehouseLoads` first (the true per-godown load split), falling back to `trip.warehouseId` when
 * `warehouseLoads` has no positive-quantity entries. When `validWarehouseIds` is non-empty, stale or
 * placeholder IDs (e.g. `'wh_main'`) are excluded.
 */
export function tripWarehouseIds(
  trip?: Pick<Trip, 'warehouseId' | 'warehouseLoads'> | null,
  validWarehouseIds?: ReadonlySet<string>,
): string[] {
  if (!trip) return [];
  const enforceValid = Boolean(validWarehouseIds && validWarehouseIds.size > 0);
  const isAllowed = (id: string) => Boolean(id) && (!enforceValid || validWarehouseIds!.has(id));

  const totals: { id: string; qty: number }[] = [];
  if (trip.warehouseLoads && typeof trip.warehouseLoads === 'object') {
    for (const [rawId, prodMap] of Object.entries(trip.warehouseLoads)) {
      const id = String(rawId || '').trim();
      if (!isAllowed(id) || !prodMap || typeof prodMap !== 'object') continue;
      let sum = 0;
      for (const q of Object.values(prodMap)) {
        const n = Number(q) || 0;
        if (n > 0) sum += n;
      }
      if (sum > 0) totals.push({ id, qty: sum });
    }
  }

  if (totals.length > 0) {
    totals.sort((a, b) => b.qty - a.qty);
    return totals.map((x) => x.id);
  }

  const single = String(trip.warehouseId || '').trim();
  return isAllowed(single) ? [single] : [];
}

/**
 * Returns the single primary godown ID for a trip.
 * Prefers `trip.warehouseId` when it is one of the godowns loaded on the trip; otherwise picks the
 * godown with the highest loaded crate count from `warehouseLoads` (or `trip.warehouseId` when no split exists).
 */
export function tripPrimaryWarehouseId(
  trip?: Pick<Trip, 'warehouseId' | 'warehouseLoads'> | null,
  validWarehouseIds?: ReadonlySet<string>,
): string {
  const ids = tripWarehouseIds(trip, validWarehouseIds);
  if (ids.length === 0) return '';
  const explicit = String(trip?.warehouseId || '').trim();
  if (explicit && ids.includes(explicit)) return explicit;
  return ids[0];
}

/**
 * Resolves the `warehouseId` to stamp on a finalized bill.
 * - For trip-linked bills, the trip's loaded godown ALWAYS takes precedence over any stale cart godown.
 * - Rejects unknown/placeholder IDs (e.g. `'wh_main'`) whenever real warehouses are loaded.
 */
export function resolveBillWarehouseId(params: {
  trip?: Pick<Trip, 'warehouseId' | 'warehouseLoads'> | null;
  cartWarehouseId?: string;
  defaultWarehouseId?: string;
  warehouses: readonly Pick<Warehouse, 'id'>[];
}): string {
  const validIds = new Set(params.warehouses.map((w) => w.id).filter(Boolean));
  const isValid = (id?: string): id is string =>
    Boolean(id && id.trim() && (validIds.size === 0 || validIds.has(id.trim())));

  const fallback = isValid(params.defaultWarehouseId)
    ? params.defaultWarehouseId.trim()
    : params.warehouses[0]?.id || '';

  if (params.trip) {
    const tripWh = tripPrimaryWarehouseId(params.trip, validIds);
    if (tripWh) return tripWh;
    if (isValid(params.cartWarehouseId)) return params.cartWarehouseId.trim();
    return fallback;
  }

  if (isValid(params.cartWarehouseId)) return params.cartWarehouseId.trim();
  return fallback;
}

export interface TripGodownDisplay {
  warehouseIds: string[];
  primaryWarehouseId: string;
  label: string;
  isMultiWarehouse: boolean;
}

/**
 * Resolves which godown(s) to display for a trip or a trip-linked bill.
 * Resolution order:
 *   1. The trip's `warehouseLoads` / `warehouseId` (matching known `warehouses`)
 *   2. The bill's allocated batches (`batchAllocations` -> `inventoryBatches[].warehouseId`)
 *   3. The bill's own `warehouseId` (if it matches a known warehouse)
 */
export function resolveTripGodownDisplay(params: {
  trip?: Pick<Trip, 'id' | 'warehouseId' | 'warehouseLoads'> | null;
  bill?: Pick<Bill, 'warehouseId' | 'items'> | null;
  warehouses: readonly Pick<Warehouse, 'id' | 'name' | 'location'>[];
  inventoryBatches?: readonly Pick<InventoryBatch, 'id' | 'warehouseId'>[];
  includeLocation?: boolean;
}): TripGodownDisplay {
  const whById = new Map(params.warehouses.map((w) => [w.id, w]));
  const validIds = new Set(whById.keys());

  let ids = tripWarehouseIds(params.trip, validIds);

  if (ids.length === 0 && params.bill?.items && params.inventoryBatches?.length) {
    const batchWh = new Map(params.inventoryBatches.map((b) => [b.id, b.warehouseId]));
    const qtyByWh = new Map<string, number>();
    for (const it of params.bill.items) {
      for (const a of it.batchAllocations || []) {
        const whId = batchWh.get(a.batchId);
        if (!whId || !validIds.has(whId)) continue;
        qtyByWh.set(whId, (qtyByWh.get(whId) || 0) + (Number(a.qty) || 0));
      }
    }
    ids = Array.from(qtyByWh.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }

  if (ids.length === 0) {
    const billWh = String(params.bill?.warehouseId || '').trim();
    if (billWh && validIds.has(billWh)) {
      ids = [billWh];
    }
  }

  const primaryFromTrip = tripPrimaryWarehouseId(params.trip, validIds);
  const primaryWarehouseId =
    (primaryFromTrip && ids.includes(primaryFromTrip) ? primaryFromTrip : ids[0]) || '';

  let label = '';
  if (ids.length === 1) {
    const w = whById.get(ids[0]);
    if (w) {
      label = params.includeLocation && w.location ? `${w.name} (${w.location})` : w.name;
    }
  } else if (ids.length > 1) {
    label = ids
      .map((id) => whById.get(id)?.name)
      .filter((name): name is string => Boolean(name))
      .join(' + ');
  }

  return {
    warehouseIds: ids,
    primaryWarehouseId,
    label,
    isMultiWarehouse: ids.length > 1,
  };
}

/**
 * Formats a trip date into mobile History group labels: TODAY, YESTERDAY, or DD MMM YYYY.
 */
export function formatTripGroupDay(
  dateStr: string | undefined,
  refTodayISO: string,
  refYesterdayISO: string,
): string {
  if (!dateStr) return 'UNDATED';
  const dayStr = dateStr.slice(0, 10);
  if (dayStr === refTodayISO) return 'TODAY';
  if (dayStr === refYesterdayISO) return 'YESTERDAY';
  const dt = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
  return isNaN(dt.getTime())
    ? dateStr.toUpperCase()
    : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}

