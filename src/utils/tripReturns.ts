/**
 * Return-count rules for closing a trip. Shared by the settlement screen, the saving code in the app and the
 * server, so the three can never disagree.
 *
 *   expected return = loaded - sold           (sold = qty on the non-cancelled bills that belong to the trip)
 *   a return ABOVE that is impossible: those extra crates would be added to godown stock out of thin air.
 *
 * Fewer crates than expected is a shortage and is handled by the existing "reason required" rule.
 */

export interface TripReturnTrip {
  id: number;
  billIds?: (number | string)[];
  loaded?: Record<string | number, number>;
}

export interface TripReturnBill {
  id: number | string;
  tripId?: number | null;
  status?: string;
  items?: { productId?: number | string; qty?: number | string }[];
}

export interface OverReturn {
  productId: number;
  returned: number;
  loaded: number;
  sold: number;
  /** The most that may be returned for this product. */
  expected: number;
  /** How many crates above `expected` were entered. */
  excess: number;
}

/** Same ownership rule as the trip list and van stock: a bill with a tripId belongs only to that trip. */
function belongsToTrip(trip: TripReturnTrip, bill: TripReturnBill): boolean {
  if (bill.tripId != null && Number(bill.tripId) > 0) return Number(bill.tripId) === Number(trip.id);
  return (Array.isArray(trip.billIds) ? trip.billIds : []).map(Number).includes(Number(bill.id));
}

export function soldByProduct(trip: TripReturnTrip, bills: TripReturnBill[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const b of bills) {
    if (b?.status === "cancelled") continue;
    if (!belongsToTrip(trip, b)) continue;
    for (const it of b.items || []) {
      const pid = Number(it.productId);
      if (!Number.isFinite(pid)) continue;
      out[pid] = (out[pid] || 0) + (Number(it.qty) || 0);
    }
  }
  return out;
}

/** Every product whose entered return is above loaded - sold. Empty list = the counts are possible. */
export function findOverReturns(
  trip: TripReturnTrip,
  bills: TripReturnBill[],
  returned: Record<string | number, number | string> | undefined | null,
): OverReturn[] {
  const sold = soldByProduct(trip, bills);
  const loadedMap = (trip.loaded && typeof trip.loaded === "object" ? trip.loaded : {}) as Record<string, number>;
  const out: OverReturn[] = [];
  for (const [pidStr, rawQty] of Object.entries(returned || {})) {
    const pid = Number(pidStr);
    const returnedQty = Number(rawQty) || 0;
    if (!Number.isFinite(pid) || returnedQty <= 0) continue;
    const loaded = Number(loadedMap[pidStr] ?? loadedMap[pid] ?? 0) || 0;
    const soldQty = sold[pid] || 0;
    const expected = Math.max(0, loaded - soldQty);
    if (returnedQty > expected + 1e-9) {
      out.push({ productId: pid, returned: returnedQty, loaded, sold: soldQty, expected, excess: returnedQty - expected });
    }
  }
  return out;
}

export function describeOverReturn(o: OverReturn, productName?: string): string {
  const name = productName || `Product #${o.productId}`;
  return (
    `${name}: ${o.returned} returned, but only ${o.expected} can come back ` +
    `(loaded ${o.loaded} − sold ${o.sold}).`
  );
}
