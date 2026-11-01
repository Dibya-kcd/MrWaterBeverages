import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SizeChip } from "../common/SizeChip";
import { ProductPicker } from "../common/ProductPicker";
import { sizeTheme } from "../../utils/sizeColor";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Package,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Truck,
  User,
  Building2,
  AlertTriangle,
  Receipt,
  FileCheck,
} from 'lucide-react';
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
}) => {
  const [vehicle, setVehicle] = useState(trip.vehicle || '');
  const [warehouseId, setWarehouseId] = useState(trip.warehouseId || (warehouses[0]?.id ?? ''));
  const [date, setDate] = useState(() => toStandardIsoDate(trip.date));
  const [autoAttachBills, setAutoAttachBills] = useState(true);
  const [salesmanId, setSalesmanId] = useState(trip.salesmanId || '');
  const [status, setStatus] = useState<TripStatus>(trip.status || 'out');
  const [loaded, setLoaded] = useState<Record<number, string>>({});
  const [returned, setReturned] = useState<Record<number, string>>({});
  const [selectedAddProductId, setSelectedAddProductId] = useState<number | ''>('');
  const [addQty, setAddQty] = useState<string>('10');
  const [searchTerm, setSearchTerm] = useState('');
  const [addSearchFilter, setAddSearchFilter] = useState('');
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize from trip props ONLY when a different trip is opened.
  // Previously this depended on [trip, warehouses]; the background cloud sync (every ~25s, on
  // focus, after any save) hands down a new `warehouses`/`trip` object reference, which re-ran
  // this and wiped every unsaved edit (e.g. a product just added to the load sheet).
  const initializedTripId = useRef<number | string | null>(null);
  useEffect(() => {
    if (initializedTripId.current === trip.id) return;
    initializedTripId.current = trip.id;
    setVehicle(trip.vehicle || '');
    setWarehouseId(trip.warehouseId || (warehouses[0]?.id ?? ''));
    setDate(toStandardIsoDate(trip.date));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  // Warehouses may load after the screen opens: only fill in a default, never overwrite a choice.
  useEffect(() => {
    if (!warehouseId && warehouses[0]?.id) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);

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

  // One definition of stock, used by the dropdown, the table and the add check, so the numbers
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

  // Products available to add:
  // - Once added to the trip (present in activeProductIds), NEVER show in the filter/dropdown
  // - Only show in-stock products by default (stock > 0)
  // - Filterable by search text
  const availableToAdd = useMemo(() => {
    return products.filter((p) => {
      if (activeProductIds.includes(p.id)) return false;
      if (!showOutOfStock && stockAll(p.id) <= 0) {
        return false;
      }
      if (addSearchFilter.trim()) {
        const query = addSearchFilter.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesCategory = (p.category || '').toLowerCase().includes(query);
        const matchesPack = (p.pack || '').toLowerCase().includes(query);
        if (!matchesName && !matchesCategory && !matchesPack) return false;
      }
      return true;
    });
  }, [products, activeProductIds, stockAll, showOutOfStock, addSearchFilter]);

  // Same free-stock rule that Save applies, run at the moment a load goes up, so a bad quantity
  // is caught on Add / "+" instead of only after the whole sheet is filled in.
  const checkLoadChange = (pid: number, newQty: number): string | null => {
    const before = Number(trip.loaded?.[pid]) || 0;
    if (newQty <= before) return null;
    const next: Record<number, number> = {};
    for (const [k, v] of Object.entries(loaded)) {
      const n = Number(v);
      if (n > 0) next[Number(k)] = n;
    }
    next[pid] = newQty;
    if (validateLoad) return validateLoad(trip, next, billedAfterSave);
    const name = products.find((x) => x.id === pid)?.name || `Product #${pid}`;
    const avail = stockAll(pid);
    return newQty - before > avail ? `${name}: only ${avail} in stock.` : null;
  };

  const handleSelectProduct = (val: string) => {
    if (!val) {
      setSelectedAddProductId('');
      return;
    }
    const pid = Number(val);
    setSelectedAddProductId(pid);
    const stock = stockHere(pid) || stockAll(pid);
    if (stock > 0) {
      setAddQty(String(Math.min(10, stock)));
    } else {
      setAddQty('1');
    }
  };

  const handleAddProduct = () => {
    if (!selectedAddProductId) return;
    const pid = Number(selectedAddProductId);
    const prod = products.find((p) => p.id === pid);
    if (!prod) return;
    const qtyNum = Math.max(1, parseInt(addQty, 10) || 1);
    const problem = checkLoadChange(pid, qtyNum);
    if (problem) {
      setError(problem);
      return;
    }
    setLoaded((prev) => ({ ...prev, [pid]: String(qtyNum) }));
    setSelectedAddProductId('');
    setAddSearchFilter('');
    setAddQty('10');
    setError(null);
  };

  const handleUpdateQty = (pid: number, delta: number) => {
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
    setLoaded((prev) => ({ ...prev, [pid]: val }));
  };

  const handleRemoveProduct = (pid: number) => {
    const billed = billedAfterSave[pid] || 0;
    if (billed > 0) {
      const name = products.find((x) => x.id === pid)?.name || `Product #${pid}`;
      setError(`${name}: ${billed} already billed on this trip, so it cannot be removed from the load sheet.`);
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

  // Totals calculations
  const totalLoaded = useMemo(() => {
    return Object.values(loaded).reduce((acc, q) => acc + (Number(q) || 0), 0);
  }, [loaded]);

  const totalSold = useMemo(() => {
    return Object.values(billedAfterSave).reduce((acc, q) => acc + q, 0);
  }, [billedAfterSave]);

  const totalValue = useMemo(() => {
    let sum = 0;
    for (const [pidStr, qStr] of Object.entries(loaded)) {
      const pid = Number(pidStr);
      const q = Number(qStr) || 0;
      const prod = products.find((p) => p.id === pid);
      if (prod) {
        sum += q * (prod.wholesale || prod.retail || 0);
      }
    }
    return sum;
  }, [loaded, products]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!vehicle.trim()) {
      setError('Please enter a vehicle name or registration number.');
      return;
    }

    if (!date) {
      setError('Please select a valid trip date.');
      return;
    }

    const cleanLoaded: Record<number, number> = {};
    for (const [pid, val] of Object.entries(loaded)) {
      const num = Number(val);
      if (num > 0) {
        cleanLoaded[Number(pid)] = num;
      }
    }

    if (Object.keys(cleanLoaded).length === 0) {
      setError('Load sheet must contain at least one beverage with quantity > 0.');
      return;
    }

    // The load can never be cut below what is billed on this trip, counting the bills this save
    // is about to attach too; otherwise the trip would show crates sold that were never loaded.
    for (const [pidStr, billed] of Object.entries(billedAfterSave)) {
      const pid = Number(pidStr);
      if (billed > (cleanLoaded[pid] || 0)) {
        const name = products.find((x) => x.id === pid)?.name || `Product #${pid}`;
        setError(`${name}: ${billed} billed on this trip, so the load cannot be less than ${billed}.`);
        return;
      }
    }

    const stockError = validateLoad ? validateLoad(trip, cleanLoaded, billedAfterSave) : null;
    if (stockError) {
      setError(stockError);
      return;
    }

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
        const name = products.find((x) => x.id === pid)?.name || `Product #${pid}`;
        setError(`${name}: ${r} returned is more than the ${cleanLoaded[pid] || 0} loaded.`);
        return;
      }
    }

    const matchedSalesman = salesmen.find((s) => s.id === salesmanId);

    const finalBillIds = Array.from(
      new Set([...(trip.billIds || []).map(Number), ...pendingBills.map((b) => Number(b.id))]),
    );

    const updatedTrip: Trip = {
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
    };

    onSave(updatedTrip);
  };

  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);

  return (
    <div className="max-w-none lg:max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-200">
      {reopensOnSave && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Completed trip.</strong> Saving your changes reopens it and moves it back to Active.
          Press back to leave it as it is.
        </div>
      )}
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer shadow-2xs"
            title="Back to trips list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Edit Trip #{trip.id}
              </h1>
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  status === 'closed'
                    ? 'bg-slate-100 text-slate-700 border border-slate-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
              >
                {status === 'closed' ? 'Completed (Closed)' : 'Active (On Road)'}
              </span>
            </div>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Modify vehicle route, load sheet quantities, assigned driver & godown
            </p>
          </div>
        </div>

        {onRecordReturn && (
          <button
            type="button"
            onClick={() => onRecordReturn(trip)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold transition-colors cursor-pointer shadow-2xs self-start sm:self-auto"
          >
            <RotateCcw className="w-4 h-4 text-emerald-700" />
            <span>Record Return & Reconcile</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Card 1: Core Trip Settings */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 text-sm font-extrabold text-slate-900">
            <Truck className="w-4 h-4 text-emerald-700" />
            <span>Trip & Route Details</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Vehicle identifier */}
            <div>
              <label htmlFor="edit-vehicle" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Vehicle / Van Identifier *
              </label>
              <input
                id="edit-vehicle"
                type="text"
                required
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                placeholder="e.g. OD15-EV-Van, Piaggio Ape"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              />
            </div>

            {/* Trip Date */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="edit-trip-date" className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Trip Date *
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDate(todayISO())}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer"
                    title="Set to today's date"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const y = toLocalISODate(new Date(Date.now() - 86400000));
                      setDate(y);
                    }}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                    title="Set to yesterday's date"
                  >
                    Yesterday
                  </button>
                </div>
              </div>
              <input
                id="edit-trip-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 cursor-pointer"
              />
              <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500 flex-wrap gap-1">
                <span className="font-semibold text-emerald-800">
                  {(() => {
                    try {
                      if (!date) return '';
                      const [y, m, d] = date.split('-').map(Number);
                      return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      });
                    } catch {
                      return date;
                    }
                  })()}
                </span>
                <label className="inline-flex items-center gap-1 cursor-pointer select-none text-[10.5px] text-slate-600 font-medium">
                  <input
                    type="checkbox"
                    checked={autoAttachBills}
                    onChange={(e) => setAutoAttachBills(e.target.checked)}
                    className="rounded text-emerald-700 w-3 h-3 cursor-pointer"
                  />
                  <span>Auto-attach bills for date</span>
                </label>
              </div>
            </div>

            {/* Assigned Salesman / Driver */}
            <div>
              <label htmlFor="edit-salesman" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Salesman / Driver
              </label>
              <select
                id="edit-salesman"
                value={salesmanId}
                onChange={(e) => setSalesmanId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 cursor-pointer"
              >
                <option value="">Choose registered salesman...</option>
                {salesmen.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone})
                  </option>
                ))}
              </select>
            </div>

            {/* Sourcing Godown */}
            <div>
              <label htmlFor="edit-warehouse" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Sourcing Godown *
              </label>
              <select
                id="edit-warehouse"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 cursor-pointer"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.code ? `(${w.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Switcher */}
          <div className="pt-2 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-slate-700">Trip Current Status:</span>
            <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setStatus('out')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  status === 'out'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active · Out on Road
              </button>
              <button
                type="button"
                onClick={() => setStatus('closed')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  status === 'closed'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Completed · Closed
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Load Sheet Table & Add Beverages */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                <Package className="w-4 h-4 text-emerald-700" />
                <span>Loaded Beverages & Crates</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Quantities dispatched from {selectedWarehouse?.name || 'Godown'}
              </p>
            </div>

            {/* Quick Summary Pill */}
            <div className="flex items-center gap-3 text-xs font-bold text-slate-700 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200 self-start sm:self-auto">
              <span>
                Total Loaded: <strong className="text-emerald-800">{totalLoaded}</strong> crates
              </span>
              <span>·</span>
              <span>
                Est. Value: <strong className="text-slate-900">₹{money(totalValue)}</strong>
              </span>
            </div>
          </div>

          {/* Add Beverage Bar */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-700" /> Add beverage to load sheet:
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                <label className="inline-flex items-center gap-1.5 text-slate-600 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showOutOfStock}
                    onChange={(e) => setShowOutOfStock(e.target.checked)}
                    className="rounded text-emerald-700 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Show 0-stock items</span>
                </label>
              </div>
            </div>

            {products.length > 0 && products.length === activeProductIds.length ? (
              <div className="p-2.5 rounded-xl bg-white/80 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                <span className="text-emerald-700 font-bold">✓</span> All {products.length} beverages in the catalog are already added to this trip's load sheet.
              </div>
            ) : availableToAdd.length === 0 ? (
              <div className="p-2.5 rounded-xl bg-white/80 border border-amber-200 text-xs font-semibold text-amber-900 flex items-center justify-between flex-wrap gap-2">
                <span>
                  No remaining in-stock beverages to add from this godown.
                </span>
                {!showOutOfStock && (
                  <button
                    type="button"
                    onClick={() => setShowOutOfStock(true)}
                    className="text-emerald-800 underline font-bold cursor-pointer hover:text-emerald-950"
                  >
                    Show 0-stock items to add anyway
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {products.length > 4 && (
                  <input
                    type="text"
                    value={addSearchFilter}
                    onChange={(e) => setAddSearchFilter(e.target.value)}
                    placeholder="Search beverage..."
                    className="w-full sm:w-44 px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-white text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                  />
                )}
                <ProductPicker
                  className="flex-1"
                  buttonClassName="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                  value={selectedAddProductId}
                  onChange={(id) => handleSelectProduct(String(id))}
                  placeholder={`Select beverage from catalog (${availableToAdd.length} available)...`}
                  options={availableToAdd.map((p) => {
                    const here = stockHere(p.id);
                    const other = stockAll(p.id) - here;
                    return { product: p, note: `${here} cs${other > 0 ? ` (+${other} other)` : ''}` };
                  })}
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="relative flex items-center">
                    <input
                      type="number" inputMode="numeric"
                      min="1"
                      value={addQty}
                      onChange={(e) => setAddQty(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddProduct();
                        }
                      }}
                      placeholder="Qty"
                      className="w-20 px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-white text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                    <span className="text-[11px] font-bold text-slate-500 ml-1">cs</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddProduct}
                    disabled={!selectedAddProductId}
                    className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Search within loaded items */}
          {activeProductIds.length > 5 && (
            <input enterKeyHint="search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter loaded items by name..."
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-700"
            />
          )}

          {/* Loaded Products Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10.5px] border-b border-slate-200">
                  <th className="py-2.5 px-3">Beverage Product</th>
                  <th className="py-2.5 px-3 text-center">Godown Stock</th>
                  <th className="py-2.5 px-3 text-center">Billed (Sold)</th>
                  <th className="py-2.5 px-3 text-center">Loaded Crates</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {activeProductIds
                  .filter((pid) => {
                    if (!searchTerm.trim()) return true;
                    const prod = products.find((p) => p.id === pid);
                    return prod?.name.toLowerCase().includes(searchTerm.toLowerCase());
                  })
                  .map((pid) => {
                    const prod = products.find((p) => p.id === pid);
                    const currentLoaded = Number(loaded[pid]) || 0;
                    const sold = soldByProduct[pid] || 0;
                    const pending = pendingByProduct[pid] || 0;
                    const tooLow = sold + pending > currentLoaded;
                    const godownStock = stockHere(pid);
                    const otherStock = stockAll(pid) - godownStock;

                    return (
                      <tr key={pid} className={`transition-colors ${tooLow ? 'bg-rose-50/70' : 'hover:bg-slate-50/70'}`}>
                        <td
                          className="py-2.5 px-3"
                          style={{ borderLeftWidth: 6, borderLeftStyle: 'solid', borderLeftColor: sizeTheme(prod?.volume, prod?.name).hex }}
                        >
                          <div className="font-bold text-slate-900">{prod?.name || `Product #${pid}`}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                            <SizeChip volume={prod?.volume} name={prod?.name} pack={prod?.pack} />
                            <span>{prod?.category || 'General'}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-slate-600">
                          {godownStock} cs
                          {otherStock > 0 && (
                            <div className="text-[10px] font-medium text-slate-400">+{otherStock} other godowns</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              sold > 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-400'
                            }`}
                          >
                            {sold} cs
                          </span>
                          {tooLow && (
                            <div className="text-[10px] font-bold text-rose-700 mt-0.5">Load below billed</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(pid, -1)}
                              className="size-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 cursor-pointer shadow-2xs"
                              title="Decrease 1 crate"
                            >
                              −
                            </button>
                            <input
                              type="number" inputMode="numeric"
                              min="0"
                              value={loaded[pid] || ''}
                              onChange={(e) => handleSetQtyDirect(pid, e.target.value)}
                              className="w-16 px-2 py-1 rounded-lg border border-slate-300 font-bold text-center text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(pid, 1)}
                              className="size-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 cursor-pointer shadow-2xs"
                              title="Increase 1 crate"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(pid)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Remove from load sheet"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card 3: Route Stops & Customer Invoices */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
              <Receipt className="w-4 h-4 text-emerald-700" />
              <span>Assigned Customer Bills ({trip.billIds?.length || 0})</span>
            </div>
            {onManageBills && (
              <button
                type="button"
                onClick={() => onManageBills(trip)}
                className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
              >
                Manage attached invoices →
              </button>
            )}
          </div>

          <div className="text-xs text-slate-600">
            {trip.billIds && trip.billIds.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {trip.billIds.map((bid) => {
                  const bill = bills.find((b) => b.id === bid);
                  return (
                    <span
                      key={bid}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs"
                    >
                      <FileCheck className="w-3.5 h-3.5 text-emerald-700" />
                      <span>
                        #{bid} {bill ? `· ${bill.retailer}` : ''} ({bill?.items?.reduce((s, i) => s + i.qty, 0) || 0} cs)
                      </span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-400 italic">No invoices currently attached to this vehicle trip.</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-4 z-20 flex items-center justify-end gap-3 p-3.5 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-lg">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs sm:text-sm hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Trip Changes</span>
          </button>
        </div>
      </form>
    </div>
  );
};
