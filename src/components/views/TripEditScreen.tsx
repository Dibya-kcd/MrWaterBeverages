import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import {
  ActionBar,
  AddProductsSheet,
  DiscardSheet,
  LoadLineCard,
  LockedBanner,
  ReviewSheet,
  StatsStrip,
  fieldBox,
  fieldLabel,
} from './trips/LoadSheetParts';
import { Bill, Product, Trip, TripStatus, Warehouse, Salesman } from '../../types';
import { money, billBelongsToTrip, attachableBillsForTrip } from '../../utils/billing';
import { todayISO, toLocalISODate } from "../../utils/dateLocal";

interface TripEditScreenProps {
  trip: Trip;
  products: Product[];
  bills: Bill[];
  salesmen?: Salesman[];
  warehouses?: Warehouse[];
  warehouseStock?: (warehouseId: string, productId?: number) => number;
  /** All trips, so auto-attach can skip bills that already belong to another trip. */
  allTrips?: Trip[];
  /** Extra check on the edited load (e.g. free stock). Return an error message to block the save. */
  validateLoad?: (trip: Trip, newLoaded: Record<number, number>, billedAfterSave: Record<number, number>) => string | null;
  onBack: () => void;
  onSave: (updated: Trip) => void;
  onRecordReturn?: (trip: Trip) => void;
  onManageBills?: (trip: Trip) => void;
  /** Trip was completed: saving this edit reopens it (moves it back to Active). */
  reopensOnSave?: boolean;
  /** Instant 1-click reopen of a completed trip directly from the edit banner. */
  onReopenTripNow?: (tripId: number) => void;
  /**
   * View-only: same screen, fields and steppers locked, no add / save. Used for the salesman, because
   * only the owner may change a trip once it is saved. Return & settle stays available.
   */
  readOnly?: boolean;
}

/**
 * Keeps a trip's per-godown split (warehouseLoads) in step with the edited total load
 */
function toStandardIsoDate(input?: string): string {
  if (!input) return todayISO();
  const trimmed = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    } else if (parts[2].length === 4) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return toLocalISODate(parsed);
  }
  return todayISO();
}

function rebalanceWarehouseLoads(
  existing: Record<string, Record<number, number>> | undefined,
  newLoaded: Record<number, number>,
  primaryWarehouseId?: string
): Record<string, Record<number, number>> | undefined {
  if (!existing || Object.keys(existing).length === 0) {
    return primaryWarehouseId ? { [primaryWarehouseId]: { ...newLoaded } } : undefined;
  }
  const whIds = Object.keys(existing);
  const primary = primaryWarehouseId && existing[primaryWarehouseId] ? primaryWarehouseId : whIds[0];
  const next: Record<string, Record<number, number>> = {};
  for (const wh of whIds) next[wh] = {};
  for (const [pidStr, total] of Object.entries(newLoaded)) {
    const pid = Number(pidStr);
    const split = whIds.map((wh) => ({ wh, q: Number(existing[wh]?.[pid]) || 0 }));
    let sum = split.reduce((a, x) => a + x.q, 0);
    if (sum < total) {
      const row = split.find((x) => x.wh === primary)!;
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

export const TripEditScreen: React.FC<TripEditScreenProps> = ({
  trip,
  products,
  bills,
  salesmen = [],
  warehouses = [],
  warehouseStock,
  allTrips = [],
  validateLoad,
  onBack,
  onSave,
  onRecordReturn,
  onManageBills,
  reopensOnSave = false,
  onReopenTripNow,
  readOnly = false,
}) => {
  const [vehicle, setVehicle] = useState(trip.vehicle || '');
  const [warehouseId, setWarehouseId] = useState(trip.warehouseId || (warehouses[0]?.id ?? ''));
  const [date, setDate] = useState(() => toStandardIsoDate(trip.date));
  const [autoAttachBills, setAutoAttachBills] = useState(true);
  const [salesmanId, setSalesmanId] = useState(trip.salesmanId || '');
  const [status, setStatus] = useState<TripStatus>(trip.status || 'out');
  const [loaded, setLoaded] = useState<Record<number, string>>({});
  const [returned, setReturned] = useState<Record<number, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'billed' | 'unbilled' | 'low'>('all');
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [reviewTrip, setReviewTrip] = useState<Trip | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);

  // What the screen looked like when it opened, to know whether Cancel needs a "lose changes?" question.
  const snapshot = (v: string, w: string, d: string, sm: string, st: string, l: Record<number, string>) =>
    JSON.stringify([v.trim(), w, d, sm, st, Object.entries(l).filter(([, q]) => Number(q) > 0).sort(([a], [b]) => Number(a) - Number(b)).map(([k, q]) => [k, Number(q)])]);
  const baseSnap = useRef<string>('');

  // Initialize from trip props ONLY when a different trip is opened.
  // Previously this depended on [trip, warehouses]; the background cloud sync (every ~25s, on
  // focus, after any save) hands down a new `warehouses`/`trip` object reference, which re-ran
  // this and wiped every unsaved edit (e.g. a product just added to the load sheet).
  const initializedTripId = useRef<number | string | null>(null);
  useEffect(() => {
    if (initializedTripId.current === trip.id) return;
    initializedTripId.current = trip.id;
    const wh = trip.warehouseId || (warehouses[0]?.id ?? '');
    const dt = toStandardIsoDate(trip.date);
    setVehicle(trip.vehicle || '');
    setWarehouseId(wh);
    setDate(dt);
    setSalesmanId(trip.salesmanId || '');
    setStatus(trip.status || 'out');

    const initLoaded: Record<number, string> = {};
    for (const [pid, qty] of Object.entries(trip.loaded || {})) {
      initLoaded[Number(pid)] = String(qty);
    }
    setLoaded(initLoaded);

    const initReturned: Record<number, string> = {};
    for (const [pid, qty] of Object.entries(trip.returned || {})) {
      initReturned[Number(pid)] = String(qty);
    }
    setReturned(initReturned);
    setError(null);
    baseSnap.current = snapshot(trip.vehicle || '', wh, dt, trip.salesmanId || '', trip.status || 'out', initLoaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  // Warehouses may load after the screen opens: only fill in a default, never overwrite a choice.
  useEffect(() => {
    if (!warehouseId && warehouses[0]?.id) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);

  const dirty = !readOnly && baseSnap.current !== '' && snapshot(vehicle, warehouseId, date, salesmanId, status, loaded) !== baseSnap.current;

  // Bills that will be attached when this edit is saved (same date / salesman / van, not on any
  // other trip). Computed once so the Billed column, the load check and the save all agree.
  const pendingBills = useMemo(() => {
    if (!autoAttachBills) return [] as Bill[];
    return attachableBillsForTrip(
      { id: trip.id, date, salesmanId: salesmanId || undefined, vehicle: vehicle.trim() },
      bills,
      allTrips,
    ).filter((b) => !billBelongsToTrip(trip, b));
  }, [autoAttachBills, trip, date, salesmanId, vehicle, bills, allTrips]);

  const sumByProduct = (list: Bill[]) => {
    const res: Record<number, number> = {};
    for (const bill of list) {
      for (const item of bill.items || []) {
        const pid = Number(item.productId);
        res[pid] = (res[pid] || 0) + (Number(item.qty) || 0);
      }
    }
    return res;
  };

  // Already on this trip. Uses the same ownership rule as van stock and the return screen
  // (bill.tripId wins, else trip.billIds), so the numbers here match the discrepancy later.
  const soldByProduct = useMemo(
    () => sumByProduct(bills.filter((b) => billBelongsToTrip(trip, b))),
    [trip, bills],
  );
  const pendingByProduct = useMemo(() => sumByProduct(pendingBills), [pendingBills]);
  const billedAfterSave = useMemo(() => {
    const res: Record<number, number> = { ...soldByProduct };
    for (const [pid, q] of Object.entries(pendingByProduct)) res[Number(pid)] = (res[Number(pid)] || 0) + q;
    return res;
  }, [soldByProduct, pendingByProduct]);

  const activeProductIds = useMemo(() => Object.keys(loaded).map(Number), [loaded]);

  // One definition of stock, used by the add sheet, the cards and the add check, so the numbers
  // always agree: stock in the selected godown, and stock in all godowns (same rule as New Trip).
  const stockHere = useCallback(
    (pid: number) => (typeof warehouseStock === 'function' && warehouseId ? warehouseStock(warehouseId, pid) : 0),
    [warehouseStock, warehouseId],
  );
  const stockAll = useCallback(
    (pid: number) =>
      typeof warehouseStock === 'function'
        ? warehouses.reduce((sum, w) => sum + warehouseStock(w.id, pid), 0)
        : 0,
    [warehouseStock, warehouses],
  );

  const nameOf = (pid: number) => products.find((x) => x.id === pid)?.name || `Product #${pid}`;

  // Same free-stock rule that Save applies, run at the moment a load goes up, so a bad quantity
  // is caught on Add / "+" instead of only after the whole sheet is filled in.
  const checkLoadChange = (pid: number, newQty: number, base: Record<number, string> = loaded): string | null => {
    const before = Number(trip.loaded?.[pid]) || 0;
    if (newQty <= before) return null;
    const next: Record<number, number> = {};
    for (const [k, v] of Object.entries(base)) {
      const n = Number(v);
      if (n > 0) next[Number(k)] = n;
    }
    next[pid] = newQty;
    if (validateLoad) return validateLoad(trip, next, billedAfterSave);
    const avail = stockAll(pid);
    return newQty - before > avail ? `${nameOf(pid)}: only ${avail} in stock.` : null;
  };

  const handleUpdateQty = (pid: number, delta: number) => {
    if (readOnly) return;
    if (delta > 0) {
      const problem = checkLoadChange(pid, (Number(loaded[pid]) || 0) + delta);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
    }
    setLoaded((prev) => {
      const current = Number(prev[pid]) || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[pid];
        return copy;
      }
      return { ...prev, [pid]: String(next) };
    });
  };

  const handleSetQtyDirect = (pid: number, val: string) => {
    if (readOnly) return;
    setLoaded((prev) => ({ ...prev, [pid]: val }));
  };

  const handleRemoveProduct = (pid: number) => {
    const billed = billedAfterSave[pid] || 0;
    if (billed > 0) {
      setError(`${nameOf(pid)}: ${billed} already billed on this trip, so it cannot be removed from the load sheet.`);
      return;
    }
    setLoaded((prev) => {
      const next = { ...prev };
      delete next[pid];
      return next;
    });
    setReturned((prev) => {
      const next = { ...prev };
      delete next[pid];
      return next;
    });
  };

  // Add several products at once from the sheet. Each is checked with the same rule as "+".
  const handleAddPicks = (picks: Record<number, number>): string | null => {
    const merged: Record<number, string> = { ...loaded };
    for (const [pidStr, qty] of Object.entries(picks)) {
      const pid = Number(pidStr);
      if (qty <= 0) continue;
      const problem = checkLoadChange(pid, qty, merged);
      if (problem) return problem;
      merged[pid] = String(qty);
    }
    setLoaded(merged);
    setError(null);
    setShowAdd(false);
    return null;
  };

  // Totals calculations
  const totalLoaded = useMemo(() => Object.values(loaded).reduce((acc, q) => acc + (Number(q) || 0), 0), [loaded]);
  const totalSold = useMemo(() => Object.values(billedAfterSave).reduce((acc, q) => acc + q, 0), [billedAfterSave]);
  const totalValue = useMemo(() => {
    let sum = 0;
    for (const [pidStr, qStr] of Object.entries(loaded)) {
      const prod = products.find((p) => p.id === Number(pidStr));
      if (prod) sum += (Number(qStr) || 0) * (prod.wholesale || prod.retail || 0);
    }
    return sum;
  }, [loaded, products]);

  const shortValue = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`);

  /** Runs every save check. Returns an error message, or the trip ready to save. */
  const buildUpdatedTrip = (): { error: string } | { trip: Trip } => {
    if (!vehicle.trim()) return { error: 'Please enter a vehicle name or registration number.' };
    if (!date) return { error: 'Please select a valid trip date.' };

    const cleanLoaded: Record<number, number> = {};
    for (const [pid, val] of Object.entries(loaded)) {
      const num = Number(val);
      if (num > 0) cleanLoaded[Number(pid)] = num;
    }
    if (Object.keys(cleanLoaded).length === 0) {
      return { error: 'Load sheet must contain at least one beverage with quantity > 0.' };
    }

    // The load can never be cut below what is billed on this trip, counting the bills this save
    // is about to attach too; otherwise the trip would show crates sold that were never loaded.
    for (const [pidStr, billed] of Object.entries(billedAfterSave)) {
      const pid = Number(pidStr);
      if (billed > (cleanLoaded[pid] || 0)) {
        return { error: `${nameOf(pid)}: ${billed} billed on this trip, so the load cannot be less than ${billed}.` };
      }
    }

    const stockError = validateLoad ? validateLoad(trip, cleanLoaded, billedAfterSave) : null;
    if (stockError) return { error: stockError };

    // Clean returned map, preserving existing counts
    const cleanReturned: Record<number, number> = {};
    for (const pid of Object.keys(cleanLoaded)) {
      const numPid = Number(pid);
      if (returned[numPid] !== undefined && Number(returned[numPid]) >= 0) {
        cleanReturned[numPid] = Number(returned[numPid]);
      } else if (trip.returned && trip.returned[numPid] !== undefined) {
        cleanReturned[numPid] = Number(trip.returned[numPid]);
      }
    }
    for (const [pidStr, r] of Object.entries(cleanReturned)) {
      const pid = Number(pidStr);
      if (r > (cleanLoaded[pid] || 0)) {
        return { error: `${nameOf(pid)}: ${r} returned is more than the ${cleanLoaded[pid] || 0} loaded.` };
      }
    }

    const matchedSalesman = salesmen.find((s) => s.id === salesmanId);
    const finalBillIds = Array.from(
      new Set([...(trip.billIds || []).map(Number), ...pendingBills.map((b) => Number(b.id))]),
    );

    return {
      trip: {
        ...trip,
        vehicle: vehicle.trim(),
        date,
        status,
        salesmanId: salesmanId || undefined,
        salesman: matchedSalesman ? matchedSalesman.name : trip.salesman,
        warehouseId: warehouseId || undefined,
        warehouseLoads: rebalanceWarehouseLoads(trip.warehouseLoads, cleanLoaded, warehouseId),
        loaded: cleanLoaded,
        returned: cleanReturned,
        billIds: finalBillIds,
      },
    };
  };

  const openReview = () => {
    setError(null);
    const res = buildUpdatedTrip();
    if ('error' in res) {
      setError(res.error);
      document.getElementById('trip-edit-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setReviewTrip(res.trip);
  };

  const handleCancel = () => (dirty ? setAskDiscard(true) : onBack());

  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);
  const salesmanName = salesmen.find((s) => s.id === salesmanId)?.name || trip.salesman || '';

  // ---- list filtering ----
  const q = searchTerm.trim().toLowerCase();
  const counts = {
    billed: activeProductIds.filter((pid) => (billedAfterSave[pid] || 0) > 0).length,
    unbilled: activeProductIds.filter((pid) => !(billedAfterSave[pid] > 0)).length,
    low: activeProductIds.filter((pid) => (billedAfterSave[pid] || 0) > (Number(loaded[pid]) || 0)).length,
  };
  const shownIds = activeProductIds
    .filter((pid) => {
      if (q && !nameOf(pid).toLowerCase().includes(q)) return false;
      const billed = billedAfterSave[pid] || 0;
      if (filter === 'billed') return billed > 0;
      if (filter === 'unbilled') return billed <= 0;
      if (filter === 'low') return billed > (Number(loaded[pid]) || 0);
      return true;
    })
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  const chip = (on: boolean) =>
    `shrink-0 min-h-[36px] px-3 rounded-full border text-[12px] font-bold whitespace-nowrap cursor-pointer ${
      on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-black/15'
    }`;

  const reviewRows = reviewTrip
    ? Object.entries(reviewTrip.loaded || {})
        .map(([pidStr, qty]) => {
          const pid = Number(pidStr);
          const before = Number(trip.loaded?.[pid]) || 0;
          const billed = billedAfterSave[pid] || 0;
          const changed = before !== qty;
          return {
            key: pidStr,
            name: nameOf(pid),
            product: products.find((p) => p.id === pid),
            qty,
            note: changed ? (before === 0 ? 'New on this trip' : `was ${before} → now ${qty}`) : billed > 0 ? `Billed ${billed} cs` : undefined,
            noteTone: changed ? ('changed' as const) : ('normal' as const),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const statusPill =
    status === 'closed'
      ? 'bg-slate-100 text-slate-700 border-slate-200'
      : 'bg-emerald-50 text-emerald-800 border-emerald-200';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#faf8f5] animate-in fade-in duration-150" id="trip-edit-screen">
      {/* Header */}
      <div className="shrink-0 border-b border-black/10 bg-[#faf8f5] pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto max-w-xl px-3 py-2 flex items-center gap-2.5">
          <button
            type="button"
            onClick={readOnly ? onBack : handleCancel}
            className="size-11 shrink-0 rounded-xl border border-black/15 bg-white flex items-center justify-center text-slate-700 cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-black text-slate-900 leading-tight truncate">{readOnly ? 'Load sheet' : 'Edit load sheet'}</h1>
            <p className="text-xs text-slate-500 truncate">
              Trip #{trip.id} · {vehicle || trip.vehicle}
            </p>
          </div>
          <span className={`text-[10.5px] font-black px-2.5 py-1 rounded-full border ${statusPill}`}>{status === 'closed' ? 'Completed' : 'Active'}</span>
        </div>
      </div>

      {/* Scrolling body */}
      <div id="trip-edit-scroll" className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-xl px-3 pt-3 pb-6 space-y-3">
          {(reopensOnSave || status === 'closed' || trip.status === 'closed') && !readOnly && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3.5 flex items-center justify-between flex-wrap gap-2 text-[13px] text-amber-950 shadow-xs">
              <div className="min-w-0 flex-1">
                <div className="font-extrabold flex items-center gap-1.5 text-amber-900">
                  <RotateCcw size={15} /> Completed / Closed Trip
                </div>
                <div className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  {status === 'out'
                    ? 'Reopen pending: saving this trip will reactivate it so vehicle stock and attached bills can be edited.'
                    : 'This trip is completed and reconciled. Reopen it to Active to allow modifying crates or attached bills.'}
                </div>
              </div>
              {status === 'closed' && onReopenTripNow && (
                <button
                  type="button"
                  id="btn-instant-reopen-trip-screen"
                  onClick={() => {
                    onReopenTripNow(Number(trip.id));
                    setStatus('out');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0d4a3a] hover:bg-[#0a3d30] text-white font-bold text-xs cursor-pointer shadow-sm active:scale-95 transition-all"
                >
                  <RotateCcw size={14} /> Reopen Trip Now
                </button>
              )}
            </div>
          )}
          {readOnly && <LockedBanner>Only the owner can change this load once it is saved. You can look at it and record returns.</LockedBanner>}

          {error && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-[13px] font-bold">
              <AlertTriangle size={17} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Trip details: every field in one place */}
          <section className="rounded-2xl border border-black/10 bg-white p-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="edit-vehicle" className={fieldLabel}>Vehicle *</label>
                <input
                  id="edit-vehicle"
                  type="text"
                  value={vehicle}
                  disabled={readOnly}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="e.g. EV"
                  className={fieldBox}
                />
              </div>
              <div>
                <label htmlFor="edit-trip-date" className={fieldLabel}>Trip date *</label>
                <input
                  id="edit-trip-date"
                  type="date"
                  value={date}
                  disabled={readOnly}
                  onChange={(e) => setDate(e.target.value)}
                  className={fieldBox}
                />
              </div>
              <div>
                <label htmlFor="edit-salesman" className={fieldLabel}>Salesman</label>
                <select id="edit-salesman" value={salesmanId} disabled={readOnly} onChange={(e) => setSalesmanId(e.target.value)} className={fieldBox}>
                  <option value="">{salesmanName && !salesmanId ? salesmanName : 'Choose…'}</option>
                  {salesmen.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-warehouse" className={fieldLabel}>Source godown *</label>
                <select id="edit-warehouse" value={warehouseId} disabled={readOnly} onChange={(e) => setWarehouseId(e.target.value)} className={fieldBox}>
                  {warehouses.length === 0 && <option value="">Main Godown</option>}
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!readOnly && (
              <div className="mt-3 pt-3 border-t border-black/5 flex items-center justify-between flex-wrap gap-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Date:</span>
                  <button type="button" onClick={() => setDate(todayISO())} className={chip(date === todayISO())}>Today</button>
                  <button type="button" onClick={() => setDate(toLocalISODate(new Date(Date.now() - 86400000)))} className={chip(date === toLocalISODate(new Date(Date.now() - 86400000)))}>
                    Yesterday
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status:</span>
                  <div className="inline-flex rounded-full p-0.5 bg-slate-100 border border-slate-200 text-xs font-bold">
                    <button
                      type="button"
                      id="btn-edit-status-out"
                      onClick={() => setStatus('out')}
                      className={`px-3 py-1.5 rounded-full cursor-pointer transition-all ${
                        status === 'out' ? 'bg-[#0d4a3a] text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Set trip to Active / Out on road"
                    >
                      Out on road (Active)
                    </button>
                    <button
                      type="button"
                      id="btn-edit-status-closed"
                      onClick={() => setStatus('closed')}
                      className={`px-3 py-1.5 rounded-full cursor-pointer transition-all ${
                        status === 'closed' ? 'bg-slate-800 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Set trip to Completed / Closed"
                    >
                      Completed
                    </button>
                  </div>
                </div>
              </div>
            )}

            <label className={`mt-3 flex items-center gap-2.5 text-[13px] font-semibold text-slate-700 select-none ${readOnly ? 'opacity-60' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={autoAttachBills}
                disabled={readOnly}
                onChange={(e) => setAutoAttachBills(e.target.checked)}
                className="size-5 rounded accent-[#0d4a3a]"
              />
              <span>Attach bills of this date</span>
              {pendingBills.length > 0 && (
                <span className="text-[11px] font-black text-[#0d4a3a] bg-[#ebe8e1] px-2 py-0.5 rounded-full">{pendingBills.length} ready</span>
              )}
            </label>
          </section>

          <StatsStrip
            items={[
              { label: 'Loaded', value: String(totalLoaded), tone: 'green' },
              { label: 'Billed', value: String(totalSold) },
              { label: 'On van', value: String(Math.max(0, totalLoaded - totalSold)), tone: 'amber' },
              { label: 'Value', value: shortValue(totalValue) },
            ]}
          />

          {/* Search + filters */}
          {activeProductIds.length > 4 && (
            <div className="space-y-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  enterKeyHint="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search loaded items…"
                  className="w-full min-h-[46px] pl-9 pr-9 rounded-xl border border-black/15 bg-white text-[15px] focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                />
                {searchTerm && (
                  <button type="button" onClick={() => setSearchTerm('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 size-9 flex items-center justify-center text-slate-400 cursor-pointer">
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                <button type="button" onClick={() => setFilter('all')} className={chip(filter === 'all')}>All {activeProductIds.length}</button>
                <button type="button" onClick={() => setFilter('billed')} className={chip(filter === 'billed')}>Billed {counts.billed}</button>
                <button type="button" onClick={() => setFilter('unbilled')} className={chip(filter === 'unbilled')}>Not billed {counts.unbilled}</button>
                {counts.low > 0 && (
                  <button type="button" onClick={() => setFilter('low')} className={chip(filter === 'low')}>Low ⚠ {counts.low}</button>
                )}
              </div>
            </div>
          )}

          {/* Product cards */}
          <section className="space-y-2" aria-label="Loaded beverages">
            {activeProductIds.length === 0 && (
              <div className="rounded-2xl border border-dashed border-black/20 bg-white px-4 py-8 text-center text-sm text-slate-500">
                Nothing loaded yet. {readOnly ? '' : 'Tap “Add products” below.'}
              </div>
            )}
            {activeProductIds.length > 0 && shownIds.length === 0 && (
              <div className="rounded-2xl border border-black/10 bg-white px-4 py-6 text-center text-sm text-slate-500">No items match.</div>
            )}
            {shownIds.map((pid) => {
              const prod = products.find((p) => p.id === pid);
              const cur = Number(loaded[pid]) || 0;
              const sold = soldByProduct[pid] || 0;
              const pending = pendingByProduct[pid] || 0;
              const tooLow = sold + pending > cur;
              const here = stockHere(pid);
              const other = stockAll(pid) - here;
              return (
                <LoadLineCard
                  key={pid}
                  product={prod}
                  fallbackName={`Product #${pid}`}
                  qty={loaded[pid] ?? ''}
                  onQty={(v) => handleSetQtyDirect(pid, v)}
                  onMinus={() => handleUpdateQty(pid, -1)}
                  onPlus={() => handleUpdateQty(pid, 1)}
                  onRemove={() => handleRemoveProduct(pid)}
                  readOnly={readOnly}
                  problem={tooLow}
                  facts={[
                    { label: 'Godown', value: `${here} cs${other > 0 ? ` (+${other} other)` : ''}` },
                    { label: 'Billed', value: `${sold + pending} cs`, bad: tooLow },
                  ]}
                  warning={tooLow ? 'Load is less than billed' : undefined}
                />
              );
            })}
          </section>

          {/* Bills on this trip */}
          <section className="rounded-2xl border border-black/10 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[13px] font-black text-slate-900">
                <Receipt size={16} className="text-[#0d4a3a]" />
                Bills on this trip ({trip.billIds?.length || 0})
              </div>
              {onManageBills && !readOnly && (
                <button type="button" onClick={() => onManageBills(trip)} className="min-h-[40px] px-2 text-xs font-black text-[#0d4a3a] underline cursor-pointer">
                  Manage →
                </button>
              )}
            </div>
            {trip.billIds && trip.billIds.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {trip.billIds.map((bid) => {
                  const bill = bills.find((b) => b.id === bid);
                  return (
                    <span key={bid} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs">
                      <FileCheck size={13} className="text-[#0d4a3a]" />
                      #{bid} {bill ? `· ${bill.retailer}` : ''} ({bill?.items?.reduce((s, i) => s + i.qty, 0) || 0} cs)
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400 italic">No bills attached yet.</p>
            )}
          </section>
        </div>
      </div>

      {/* Bottom bar */}
      {readOnly ? (
        <ActionBar
          actions={[
            { key: 'back', label: 'Back', icon: <ArrowLeft size={20} />, tone: 'neutral', onClick: onBack, id: 'btn-trip-view-back' },
            ...(onRecordReturn
              ? [{ key: 'settle', label: 'Return & Settle', icon: <RotateCcw size={20} />, tone: 'primary' as const, onClick: () => onRecordReturn(trip), grow: 2, id: 'btn-trip-view-settle' }]
              : []),
          ]}
        />
      ) : (
        <ActionBar
          actions={[
            { key: 'cancel', label: 'Cancel', icon: <X size={20} />, tone: 'cancel', onClick: handleCancel, id: 'btn-trip-edit-cancel' },
            { key: 'add', label: 'Add products', icon: <Plus size={20} />, tone: 'add', onClick: () => setShowAdd(true), grow: 1.3, id: 'btn-trip-edit-add' },
            { key: 'review', label: `Review · ${totalLoaded} cs`, icon: <CheckCircle2 size={20} />, tone: 'primary', onClick: openReview, grow: 1.5, id: 'btn-trip-edit-review' },
          ]}
        />
      )}

      {showAdd && !readOnly && (
        <AddProductsSheet
          products={products}
          added={Object.fromEntries(Object.entries(loaded).filter(([, v]) => Number(v) > 0).map(([k, v]) => [Number(k), Number(v)]))}
          stockOf={(pid) => stockAll(pid)}
          stockText={(pid) => {
            const here = stockHere(pid);
            const other = stockAll(pid) - here;
            return `${here} cs in ${selectedWarehouse?.name || 'godown'}${other > 0 ? ` (+${other} other)` : ''}`;
          }}
          onConfirm={handleAddPicks}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {reviewTrip && (
        <ReviewSheet
          title={`Review trip #${trip.id}`}
          facts={[
            { label: 'Vehicle', value: reviewTrip.vehicle },
            { label: 'Date', value: reviewTrip.date },
            { label: 'Salesman', value: salesmanName },
            { label: 'Godown', value: selectedWarehouse?.name || 'Main Godown' },
            { label: 'Bills attaching', value: pendingBills.length > 0 ? `${pendingBills.length} new` : 'none new' },
            { label: 'Status', value: status === 'closed' ? 'Completed' : 'Active' },
          ]}
          rows={reviewRows}
          totalCases={Object.values(reviewTrip.loaded || {}).reduce((s, n) => s + n, 0)}
          confirmLabel="Confirm & Save"
          onBack={() => setReviewTrip(null)}
          onCancel={() => {
            setReviewTrip(null);
            handleCancel();
          }}
          onConfirm={() => onSave(reviewTrip)}
        />
      )}

      {askDiscard && <DiscardSheet onKeep={() => setAskDiscard(false)} onDiscard={onBack} />}
    </div>
  );
};
