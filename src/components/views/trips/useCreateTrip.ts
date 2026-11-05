import { useLedger } from '../../../context/LedgerContext';
import { attachableBillsForTrip } from '../../../utils/billing';
import { Trip } from '../../../types';
import type { NewTripPayload } from './NewTripSheet';

export type CreateTripResult =
  | { ok: false; error: string }
  | { ok: true; trip: Trip; total: number; godowns: number };

/**
 * One place that checks and saves a new load sheet, used by the owner's Trips screen and the
 * salesman's Start Trip, so both get the same stock rules and the same per-product godowns.
 */
export function useCreateTrip() {
  const { trips, bills, products, salesmen, warehouses, defaultWarehouse, warehouseStock, remainingStock, getVehicleStock, addTrip } =
    useLedger();

  const attachable = (date: string, salesmanId: string, vehicle: string) =>
    attachableBillsForTrip({ date, salesmanId: salesmanId || undefined, vehicle }, bills, trips);

  const create = (p: NewTripPayload): CreateTripResult => {
    if (!p.vehicle) return { ok: false, error: 'Enter the vehicle (van) for this trip.' };
    if (p.lines.length === 0) return { ok: false, error: 'Add at least one product with units to load.' };

    // Bills this trip will pick up by date. Their crates are already out of stock (stock is deducted
    // at billing) and the load must cover them, or the trip starts with sold > loaded.
    const attachedBills = p.autoAttachBills
      ? attachableBillsForTrip({ date: p.date, salesmanId: p.salesmanId || undefined, vehicle: p.vehicle }, bills, trips)
      : [];
    const billedByProduct: Record<number, number> = {};
    for (const b of attachedBills) {
      for (const it of b.items || []) {
        const pid = Number(it.productId);
        billedByProduct[pid] = (billedByProduct[pid] || 0) + (Number(it.qty) || 0);
      }
    }
    const loadByProduct: Record<number, number> = {};
    for (const l of p.lines) loadByProduct[l.productId] = (loadByProduct[l.productId] || 0) + l.qty;
    const nameOf = (id: number) => products.find((x) => x.id === id)?.name || `Product #${id}`;
    for (const [pidStr, billed] of Object.entries(billedByProduct)) {
      const pid = Number(pidStr);
      if (billed > (loadByProduct[pid] || 0)) {
        return {
          ok: false,
          error: `${nameOf(pid)}: ${billed} already billed on the bills this trip would attach, so the load cannot be less than ${billed}. Add the units or untick "Attach bills of this date".`,
        };
      }
    }

    const wantByWh: Record<string, number> = {};
    const wantByProduct: Record<number, number> = {};
    for (const l of p.lines) {
      const wh = l.warehouseId || defaultWarehouse?.id || warehouses[0]?.id || '';
      wantByWh[`${wh}|${l.productId}`] = (wantByWh[`${wh}|${l.productId}`] || 0) + l.qty;
      wantByProduct[l.productId] = (wantByProduct[l.productId] || 0) + l.qty;
    }
    // Billed crates already left the godown, so only the unsold part of the load needs stock.
    const toCover = { ...billedByProduct };
    for (const key of Object.keys(wantByWh)) {
      const pid = Number(key.split('|')[1]);
      const use = Math.min(toCover[pid] || 0, wantByWh[key]);
      wantByWh[key] -= use;
      toCover[pid] = (toCover[pid] || 0) - use;
    }
    for (const [key, qty] of Object.entries(wantByWh)) {
      if (qty <= 0) continue;
      const [wh, pidStr] = key.split('|');
      const have = warehouseStock(wh, Number(pidStr));
      if (qty > have) {
        const whName = warehouses.find((w) => w.id === wh)?.name || 'Main Godown';
        return { ok: false, error: `${nameOf(Number(pidStr))}: loading ${qty} but ${whName} has only ${have}.` };
      }
    }
    // Crates already sitting unsold on other open vans are still counted in the godown balance,
    // so a second van could be loaded with the same crates. Count them as taken.
    for (const [pidStr, qty] of Object.entries(wantByProduct)) {
      const pid = Number(pidStr);
      const onVans = trips.filter((t) => t.status === 'out').reduce((sum, t) => sum + getVehicleStock(t, pid).available, 0);
      const free = remainingStock(pid) - onVans;
      if (qty - (billedByProduct[pid] || 0) > free) {
        return { ok: false, error: `${nameOf(pid)}: only ${Math.max(0, free)} free to load (${onVans} already on other vans).` };
      }
    }

    const warehouseLoads: Record<string, Record<number, number>> = {};
    const loaded: Record<number, number> = {};
    for (const l of p.lines) {
      const wh = l.warehouseId || defaultWarehouse?.id || warehouses[0]?.id || '';
      warehouseLoads[wh] = warehouseLoads[wh] || {};
      warehouseLoads[wh][l.productId] = (warehouseLoads[wh][l.productId] || 0) + l.qty;
      loaded[l.productId] = (loaded[l.productId] || 0) + l.qty;
    }
    const perWh = Object.entries(warehouseLoads).map(([id, m]) => [id, Object.values(m).reduce((s, q) => s + q, 0)] as const);
    const primary = [...perWh].sort((a, b) => b[1] - a[1])[0]?.[0] || defaultWarehouse?.id || '';
    const salesman = salesmen.find((s) => s.id === p.salesmanId);
    const initialBillIds = attachedBills.map((b) => b.id);

    const trip = addTrip(p.vehicle, p.date, loaded, primary, initialBillIds, salesman?.name || p.salesmanName, p.route || undefined, p.salesmanId || undefined, warehouseLoads);
    return { ok: true, trip, total: perWh.reduce((s, [, q]) => s + q, 0), godowns: perWh.length };
  };

  return { create, attachable };
}
