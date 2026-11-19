import { useLedger } from '../../../context/LedgerContext';
import { Trip } from '../../../types';
import { tripPrimaryWarehouseId } from '../../../utils/tripLoads';

type Split = Record<string, Record<number, number>>;

/**
 * The free-stock rule for EDITING a load, shared by the owner's Trips screen and the salesman's trip screens so
 * the two can never disagree. Stock is deducted at billing, not at loading, so every unsold crate on a van is
 * still counted in the godown balance; crates unsold on other open vans must therefore be treated as taken.
 * Only products whose load goes up are checked, so older trips can still be edited.
 *
 * Two checks run, the same two New Trip makes:
 *  1. all godowns together: free stock (minus what sits unsold on other open vans) must cover this van's unsold crates;
 *  2. per godown (when the caller passes the split the trip will have after saving): every godown that is asked for
 *     MORE crates of a product than the trip already takes from it must have them free, so a van cannot be topped up
 *     from a godown that is empty just because another godown has plenty.
 * Returns an error message, or null when the load is fine.
 */
export function useLoadValidator() {
  const { trips, products, warehouses, defaultWarehouse, remainingStock, warehouseStock, getVehicleStock } = useLedger();

  /** The per-godown split of a trip, with any load that warehouseLoads does not explain put on its main godown (same rule billing uses). */
  const splitOf = (t: Trip): Split => {
    const out: Split = {};
    for (const [wh, m] of Object.entries(t.warehouseLoads || {})) {
      for (const [p, q] of Object.entries(m || {})) {
        if (Number(q) > 0) (out[wh] ||= {})[Number(p)] = Number(q);
      }
    }
    const validWhIds = new Set(warehouses.map((w) => w.id));
    const primary = tripPrimaryWarehouseId(t, validWhIds) || defaultWarehouse?.id || warehouses[0]?.id || '';
    for (const [p, q] of Object.entries(t.loaded || {})) {
      const pid = Number(p);
      const explained = Object.values(out).reduce((s, m) => s + (m[pid] || 0), 0);
      const extra = (Number(q) || 0) - explained;
      if (extra > 0) (out[primary] ||= {})[pid] = (out[primary]?.[pid] || 0) + extra;
    }
    return out;
  };

  /** Unsold crates of one product on a van that came from one godown. Billed crates are assumed drawn in load order. */
  const unsoldFrom = (split: Split, pid: number, billedQty: number, wh: string): number => {
    let left = billedQty;
    for (const [id, m] of Object.entries(split)) {
      const q = m[pid] || 0;
      const take = Math.min(left, q);
      left -= take;
      if (id === wh) return q - take;
    }
    return 0;
  };

  return (
    t: Trip,
    newLoaded: Record<number, number>,
    billed: Record<number, number>,
    newSplit?: Split,
  ): string | null => {
    const nameOf = (pid: number) => products.find((x) => x.id === pid)?.name || `Product #${pid}`;
    const otherVans = trips.filter((x) => x.status === 'out' && Number(x.id) !== Number(t.id));

    for (const [pidStr, qty] of Object.entries(newLoaded)) {
      const pid = Number(pidStr);
      const before = Number(t.loaded?.[pid]) || 0;
      if (qty <= before) continue;
      const unsoldOnThisVan = Math.max(0, qty - (billed[pid] || 0));
      const onOtherVans = otherVans.reduce((sum, x) => sum + getVehicleStock(x, pid).available, 0);
      const free = remainingStock(pid) - onOtherVans;
      if (unsoldOnThisVan > free) {
        return `${nameOf(pid)}: only ${Math.max(0, free)} free to load (${onOtherVans} already on other vans), but this van would carry ${unsoldOnThisVan} unsold.`;
      }
    }

    if (newSplit && typeof warehouseStock === 'function') {
      const oldSplit = splitOf(t);
      for (const [wh, m] of Object.entries(newSplit)) {
        for (const [pidStr, q] of Object.entries(m)) {
          const pid = Number(pidStr);
          if (!(Number(q) > (oldSplit[wh]?.[pid] || 0))) continue; // not asking this godown for more than it already gives
          const unsoldHere = unsoldFrom(newSplit, pid, billed[pid] || 0, wh);
          const onOtherVans = otherVans.reduce(
            (sum, x) => sum + unsoldFrom(splitOf(x), pid, getVehicleStock(x, pid).sold, wh),
            0,
          );
          const free = Math.max(0, warehouseStock(wh, pid) - onOtherVans);
          if (unsoldHere > free) {
            const whName = warehouses.find((w) => w.id === wh)?.name || 'Main Godown';
            return `${nameOf(pid)}: this van would carry ${unsoldHere} unsold from ${whName}, but only ${free} are free there${onOtherVans > 0 ? ` (${onOtherVans} already on other vans)` : ''}.`;
          }
        }
      }
    }
    return null;
  };
}
