import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Minus, Plus, Search, X } from 'lucide-react';
import { FlowBadge, FlowHeader } from '../../common/FlowKit';
import { Bill, Product, Salesman, Warehouse } from '../../../types';
import { useLedger } from '../../../context/LedgerContext';
import { todayISO } from '../../../utils/dateLocal';
import { compareProductsInSequence } from '../../../utils/sizeColor';
import { confirmDialog } from '../../../utils/dialogs';
import { PackIcon } from '../../common/PackIcon';
import { SizeChip } from '../../common/SizeChip';
import { OdiaName } from '../../common/OdiaName';

export interface NewTripLine {
  key: string;
  productId: number;
  warehouseId: string;
  qty: string;
}

export interface NewTripPayload {
  vehicle: string;
  route: string;
  date: string;
  salesmanId: string;
  autoAttachBills: boolean;
  /** name to store when the salesman is not in the loaded salesmen list (signed-in salesman) */
  salesmanName?: string;
  /** driver of the van (free text) */
  driver?: string;
  lines: { productId: number; warehouseId: string; qty: number }[];
}

interface NewTripSheetProps {
  products: Product[];
  warehouses: Warehouse[];
  salesmen: Salesman[];
  vehicles: string[];
  routes: string[];
  defaultWarehouseId: string;
  warehouseStock: (warehouseId: string, productId?: number) => number;
  /** Bills this trip would auto-attach (same date, not on another trip, same salesman / van). */
  attachableBills: (date: string, salesmanId: string, vehicle: string) => Bill[];
  onSubmit: (payload: NewTripPayload) => string | null; // returns an error message, or null when saved
  onClose: () => void;
  /** Signed-in salesman: his name is fixed, everything else is the same as the owner's sheet. */
  lockedSalesman?: { id: string; name: string };
  /** Pre-filled vehicle (e.g. the salesman's usual van). */
  initialVehicle?: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const CAPACITY_KEY = 'mrwater_van_capacity_v1';

// Max-capacity is remembered per vehicle on this device only (it is a planning aid, not accounting data).
const readCapacities = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(CAPACITY_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
};
const writeCapacity = (vehicle: string, cap: number) => {
  try {
    const all = readCapacities();
    const k = vehicle.trim().toUpperCase();
    if (!k) return;
    if (cap > 0) all[k] = cap;
    else delete all[k];
    localStorage.setItem(CAPACITY_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: capacity just is not remembered */
  }
};

const caseRate = (p: Product): number => {
  if (Number(p.retail) > 0) return Number(p.retail);
  if (Number(p.wholesale) > 0) return Number(p.wholesale);
  return 0;
};

const input =
  'w-full min-h-[44px] px-3 rounded-xl border border-gray-300 bg-white text-[15px] font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--flow-accent)]/40 focus:border-[var(--flow-accent)] disabled:bg-gray-100 disabled:text-gray-500';
const label = 'block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1';

/**
 * Create New Trip → Load Stock (warehouse → van).
 *   Step A – trip details (date, beat, vehicle + capacity, salesman, driver)
 *   Step B – load products with steppers, live capacity bar, manifest summary
 * Saving goes through the same `onSubmit` (useCreateTrip → addTrip) as before: stock for a van is derived from
 * the trip's loaded map, so godown stock drops by exactly what is loaded and returns when the trip is closed.
 */
export const NewTripSheet: React.FC<NewTripSheetProps> = ({
  products,
  warehouses,
  salesmen,
  vehicles,
  routes,
  defaultWarehouseId,
  warehouseStock,
  attachableBills,
  onSubmit,
  onClose,
  lockedSalesman,
  initialVehicle = '',
}) => {
  const { trips, remainingStock, getVehicleStock } = useLedger();

  const [step, setStep] = useState<'A' | 'B'>('A');
  const [date, setDate] = useState(todayISO());
  const [route, setRoute] = useState('');
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [capacityText, setCapacityText] = useState('');
  const [salesmanId, setSalesmanId] = useState(lockedSalesman?.id || '');
  const [driver, setDriver] = useState('');
  const [godownId, setGodownId] = useState(defaultWarehouseId || warehouses[0]?.id || '');
  const [autoAttach, setAutoAttach] = useState(true);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // If warehouses finish loading after the sheet mounts, align godownId to a valid warehouse
  // without overwriting an already-valid user choice.
  useEffect(() => {
    if (warehouses.length === 0) return;
    if (!godownId || !warehouses.some((w) => w.id === godownId)) {
      const validDefault =
        defaultWarehouseId && warehouses.some((w) => w.id === defaultWarehouseId)
          ? defaultWarehouseId
          : warehouses[0].id;
      setGodownId(validDefault);
    }
  }, [warehouses, defaultWarehouseId, godownId]);

  // Next trip number, for the header badge (the real number is reserved when the trip is saved).
  const nextTripNo = useMemo(() => Math.max(0, ...trips.map((t) => Number(t.id) || 0)) + 1, [trips]);

  // Remembered capacity for the chosen van.
  useEffect(() => {
    const saved = readCapacities()[vehicle.trim().toUpperCase()];
    if (saved) setCapacityText(String(saved));
  }, [vehicle]);
  const maxCapacity = Number(capacityText) > 0 ? Number(capacityText) : 0;

  const vehicleChoices = vehicles.slice(0, 8);
  const salesmanName = lockedSalesman?.name || salesmen.find((s) => s.id === salesmanId)?.name || '';

  /* ---------- stock rules (same as useCreateTrip, so the stepper can never promise what Confirm refuses) ---------- */
  const attachList = useMemo(
    () => (autoAttach ? attachableBills(date, salesmanId, vehicle.trim()) : []),
    [autoAttach, attachableBills, date, salesmanId, vehicle],
  );
  const billedByProduct = useMemo(() => {
    const res: Record<number, number> = {};
    for (const b of attachList)
      for (const it of b.items || []) {
        const pid = Number(it.productId);
        res[pid] = (res[pid] || 0) + (Number(it.qty) || 0);
      }
    return res;
  }, [attachList]);
  const onOpenVans = (pid: number) =>
    trips.filter((t) => t.status === 'out').reduce((sum, t) => sum + getVehicleStock(t, pid).available, 0);

  const godownStock = (pid: number) => Math.max(0, warehouseStock(godownId, pid));
  // Cases of this product that may go on the van: free godown stock plus the crates already billed (they left the godown at billing).
  const maxLoad = (pid: number) => {
    const free = Math.max(0, Math.min(godownStock(pid), remainingStock(pid) - onOpenVans(pid)));
    return free + (billedByProduct[pid] || 0);
  };

  const sellable = useMemo(
    () =>
      products
        .filter((p) => p.active !== false && (maxLoad(p.id) > 0 || (qty[p.id] || 0) > 0))
        .sort((a, b) => compareProductsInSequence(a, b)),
    [products, godownId, trips, billedByProduct, qty, warehouseStock, remainingStock, getVehicleStock],
  );
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? sellable.filter((p) => `${p.name} ${p.sku || ''} ${p.pack || ''} ${p.brand || ''}`.toLowerCase().includes(q))
      : sellable;
  }, [sellable, search]);

  const setLoad = (pid: number, next: number) => {
    const clamped = Math.max(0, Math.min(Math.floor(next) || 0, maxLoad(pid)));
    setQty((prev) => {
      const copy = { ...prev };
      if (clamped > 0) copy[pid] = clamped;
      else delete copy[pid];
      return copy;
    });
    setError(null);
  };

  const loadedCases = Object.values(qty).reduce((s, n) => s + n, 0);
  const loadValue = Object.entries(qty).reduce((s, [pid, n]) => {
    const p = products.find((x) => x.id === Number(pid));
    return s + (p ? caseRate(p) * n : 0);
  }, 0);
  const overCapacity = maxCapacity > 0 && loadedCases > maxCapacity;
  const pct = maxCapacity > 0 ? Math.min(100, Math.round((loadedCases / maxCapacity) * 100)) : 0;
  const tripLabel = `#TRP-${nextTripNo} • ${vehicle.trim() || 'No vehicle'}`;

  /* ---------- quick action: copy the last load of this van / beat ---------- */
  const previousTrip = useMemo(() => {
    const byRecent = [...trips].sort(
      (a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.id) - Number(a.id),
    );
    const v = vehicle.trim().toLowerCase();
    return (
      byRecent.find((t) => v && (t.vehicle || '').trim().toLowerCase() === v) ||
      byRecent.find((t) => route && t.route === route) ||
      byRecent[0]
    );
  }, [trips, vehicle, route]);

  const copyPrevious = () => {
    if (!previousTrip) return;
    const next: Record<number, number> = {};
    for (const [pidStr, q] of Object.entries(previousTrip.loaded || {})) {
      const pid = Number(pidStr);
      const p = products.find((x) => x.id === pid);
      if (!p || p.active === false) continue;
      const n = Math.min(Number(q) || 0, maxLoad(pid));
      if (n > 0) next[pid] = n;
    }
    setQty(next);
    setError(null);
  };

  /* ---------- navigation ---------- */
  const goNext = () => {
    if (!vehicle.trim()) {
      setError('Enter the vehicle number for this trip.');
      document.getElementById('trip-vehicle')?.focus();
      return;
    }
    if (!date) {
      setError('Pick the trip date.');
      return;
    }
    setError(null);
    writeCapacity(vehicle, maxCapacity);
    setStep('B');
  };

  const confirm = () => {
    setError(null);
    if (loadedCases <= 0) {
      setError('Load at least one case before starting the trip.');
      return;
    }
    const msg = onSubmit({
      vehicle: vehicle.trim(),
      route: route.trim(),
      date,
      salesmanId,
      autoAttachBills: autoAttach,
      salesmanName: lockedSalesman?.name,
      driver: driver.trim() || undefined,
      lines: Object.entries(qty)
        .filter(([, n]) => n > 0)
        .map(([pid, n]) => ({ productId: Number(pid), warehouseId: godownId, qty: n })),
    });
    if (msg) setError(msg);
  };

  const handleClose = async () => {
    if (loadedCases > 0) {
      const ok = await confirmDialog({
        title: 'Discard this trip?',
        message: 'The stock you picked for this trip will not be saved.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep loading',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  const pill = (on: boolean) =>
    `shrink-0 min-h-[44px] px-4 rounded-full border text-[13px] font-bold whitespace-nowrap cursor-pointer ${
      on ? 'bg-[var(--flow-accent)] text-white border-[var(--flow-accent)]' : 'bg-white text-slate-700 border-gray-300'
    }`;

  /* ---------- manifest (tablet sidebar) ---------- */
  const manifestRows = Object.entries(qty)
    .map(([pid, n]) => ({ p: products.find((x) => x.id === Number(pid)), pid: Number(pid), n }))
    .sort((a, b) => compareProductsInSequence(a.p || { name: '' }, b.p || { name: '' }));

  const CapacityBar = (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-white">
        <span className="text-[13px] font-bold truncate">{tripLabel}</span>
        <span className={`text-[13px] font-black tabular-nums ${overCapacity ? 'text-red-300' : ''}`}>
          {maxCapacity > 0 ? `${loadedCases} / ${maxCapacity} Cases` : `${loadedCases} Cases`}
        </span>
      </div>
      {maxCapacity > 0 && (
        <div
          className="h-2 rounded-full bg-white/20 overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={`h-full rounded-full ${overCapacity ? 'bg-red-400' : 'bg-[#34D399]'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="flex items-center justify-between text-[12px] text-white/80">
        <span>{overCapacity ? `Over capacity by ${loadedCases - maxCapacity} cases` : 'Total stock value'}</span>
        <span className="font-black text-white tabular-nums">{inr(loadValue)}</span>
      </div>
    </div>
  );

  /* ================================ STEP A ================================ */
  if (step === 'A') {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-[var(--flow-canvas)]"
        role="dialog"
        aria-modal="true"
        aria-label="Create new trip"
        id="form-new-trip"
      >
        <FlowHeader
          title="Create New Trip"
          subtitle={vehicle.trim() ? vehicle.trim() : undefined}
          onBack={handleClose}
          backLabel="Close"
          right={<FlowBadge>#TRP-{nextTripNo}</FlowBadge>}
        />

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-2xl px-3 pt-4 pb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <div>
                <label htmlFor="trip-date" className={label}>
                  Trip Date
                </label>
                <input
                  id="trip-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value || todayISO())}
                  className={`${input} min-h-[44px]`}
                />
              </div>

              <div>
                <span className={label}>Select Beat / Route</span>
                {routes.length === 0 ? (
                  <p className="text-[13px] text-gray-500">No beats set up yet (Settings → Beats).</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {routes.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRoute(route === r ? '' : r)}
                        aria-pressed={route === r}
                        className={pill(route === r)}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="trip-vehicle" className={label}>
                    Vehicle Number *
                  </label>
                  <input
                    id="trip-vehicle"
                    value={vehicle}
                    onChange={(e) => setVehicle(e.target.value)}
                    placeholder="OD-15-AB-1234"
                    autoComplete="off"
                    autoCapitalize="characters"
                    className={input}
                  />
                </div>
                <div>
                  <label htmlFor="trip-capacity" className={label}>
                    Max Case Capacity (optional)
                  </label>
                  <input
                    id="trip-capacity"
                    inputMode="numeric"
                    value={capacityText}
                    onChange={(e) => setCapacityText(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="120 cases"
                    className={input}
                  />
                </div>
              </div>
              {vehicleChoices.length > 0 && (
                <div className="-mt-2 flex gap-2 overflow-x-auto no-scrollbar">
                  {vehicleChoices.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVehicle(v)}
                      className={pill(vehicle.trim().toLowerCase() === v.trim().toLowerCase())}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="trip-salesman" className={label}>
                    Assign Salesman
                  </label>
                  {lockedSalesman ? (
                    <div className={`${input} flex items-center bg-gray-100`}>{lockedSalesman.name}</div>
                  ) : (
                    <select
                      id="trip-salesman"
                      value={salesmanId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSalesmanId(id);
                        const sm = salesmen.find((x) => x.id === id);
                        if (sm?.defaultVehicle && !vehicle.trim()) setVehicle(sm.defaultVehicle);
                      }}
                      className={input}
                    >
                      <option value="">Select salesman</option>
                      {salesmen
                        .filter((x) => x.active !== false)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
                <div>
                  <label htmlFor="trip-driver" className={label}>
                    Assign Driver
                  </label>
                  <input
                    id="trip-driver"
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    placeholder="Driver name"
                    autoComplete="off"
                    className={input}
                  />
                </div>
              </div>

              {warehouses.length > 1 && (
                <div>
                  <span className={label}>Load From Godown</span>
                  <div className="flex flex-wrap gap-2">
                    {warehouses.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setGodownId(w.id)}
                        aria-pressed={godownId === w.id}
                        className={pill(godownId === w.id)}
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-start gap-3 min-h-[44px] rounded-xl bg-[var(--flow-canvas)] border border-gray-200 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAttach}
                  onChange={(e) => setAutoAttach(e.target.checked)}
                  className="mt-0.5 size-5 accent-[var(--flow-accent)]"
                />
                <span className="text-[13px] text-slate-700">
                  <strong className="text-slate-900">Attach bills of this date</strong>
                  <br />
                  {autoAttach
                    ? attachList.length > 0
                      ? `${attachList.length} bill${attachList.length === 1 ? '' : 's'} will join this trip.`
                      : 'No unassigned bills for this date yet.'
                    : 'Bills will be attached by hand later.'}
                </span>
              </label>
            </div>

            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-100 px-3 py-2 text-[13px] font-bold text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>

        <footer className="shrink-0 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom,0px)]">
          <div className="mx-auto max-w-2xl p-3">
            <button
              type="button"
              onClick={goNext}
              className="w-full min-h-[48px] rounded-xl bg-[var(--flow-accent)] hover:bg-[var(--flow-accent-hover)] text-white text-[15px] font-black cursor-pointer"
            >
              Load Stock to Trip →
            </button>
          </div>
        </footer>
      </div>
    );
  }

  /* ================================ STEP B ================================ */
  const card = (p: Product) => {
    const n = qty[p.id] || 0;
    const stock = godownStock(p.id);
    const cap = maxLoad(p.id);
    const billed = billedByProduct[p.id] || 0;
    const on = n > 0;
    const stepBtn = 'min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center disabled:opacity-40 cursor-pointer active:scale-95';
    const quick =
      'min-h-[44px] flex-1 rounded-xl border border-[var(--flow-accent)] text-[var(--flow-accent)] bg-white text-[13px] font-black disabled:opacity-40 cursor-pointer';
    return (
      <div
        key={p.id}
        className={`rounded-xl p-3 space-y-2.5 ${on ? 'border-2 border-[var(--flow-accent)] bg-[var(--flow-accent-soft)]' : 'border border-gray-200 bg-white'}`}
      >
        <div className="flex items-start gap-2.5">
          <PackIcon size="sm" pack={p.pack} name={p.name} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-slate-900 leading-snug break-words">
              <OdiaName name={p.name} nameOr={p.nameOr} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <SizeChip volume={p.volume} name={p.name} pack={p.pack} />
              {p.unitsPerCrate ? (
                <span className="text-[11px] font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                  {p.unitsPerCrate} pcs/cs
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[14px] font-black text-slate-900 tabular-nums">{inr(caseRate(p))}</div>
            <div className="text-[10px] font-bold uppercase text-gray-500">per case</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[12px] font-bold">
          <span className={stock === 0 ? 'text-red-700' : 'text-gray-600'}>Godown: {stock} cases</span>
          {billed > 0 && <span className="text-amber-700">Billed {billed} — load at least {billed}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLoad(p.id, n - 1)}
            disabled={n === 0}
            aria-label={`Less ${p.name}`}
            className={`${stepBtn} border border-gray-300 bg-white text-slate-700`}
          >
            <Minus size={18} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={n === 0 ? '' : String(n)}
            placeholder="0"
            onChange={(e) => setLoad(p.id, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
            onFocus={(e) => e.target.select()}
            aria-label={`Cases of ${p.name} to load`}
            className="min-h-[44px] w-16 text-center rounded-xl border border-gray-300 bg-white text-lg font-black tabular-nums focus:outline-none focus:border-[var(--flow-accent)]"
          />
          <button
            type="button"
            onClick={() => setLoad(p.id, n + 1)}
            disabled={n >= cap}
            aria-label={`More ${p.name}`}
            className={`${stepBtn} bg-[var(--flow-accent)] hover:bg-[var(--flow-accent-hover)] text-white`}
          >
            <Plus size={18} />
          </button>
          <button type="button" onClick={() => setLoad(p.id, n + 10)} disabled={n >= cap} className={quick}>
            +10
          </button>
          <button type="button" onClick={() => setLoad(p.id, n + 25)} disabled={n >= cap} className={quick}>
            +25
          </button>
        </div>
        {cap === 0 ? (
          <p className="text-[11px] font-bold text-red-700">
            Out of stock in {warehouses.find((w) => w.id === godownId)?.name || 'godown'}.
          </p>
        ) : n >= cap ? (
          <p className="text-[11px] font-bold text-amber-700">Maximum available is loaded.</p>
        ) : null}
      </div>
    );
  };

  const ConfirmButton = (
    <button
      type="button"
      onClick={confirm}
      disabled={loadedCases <= 0}
      className="w-full min-h-[48px] rounded-xl bg-[var(--flow-accent)] hover:bg-[var(--flow-accent-hover)] text-white text-[15px] font-black disabled:opacity-50 cursor-pointer"
    >
      Confirm &amp; Start Trip
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--flow-canvas)]"
      role="dialog"
      aria-modal="true"
      aria-label="Load stock to trip"
      id="form-new-trip"
    >
      <FlowHeader
        title="Load Stock to Trip"
        subtitle={[date, route, salesmanName, driver && `Driver ${driver}`].filter(Boolean).join(' • ')}
        onBack={() => setStep('A')}
        backLabel="Back to trip details"
        right={
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="size-11 shrink-0 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X size={20} />
          </button>
        }
      />
      <div className="shrink-0 bg-[var(--flow-header)] pb-3">
        <div className="mx-auto w-full max-w-6xl px-3">{CapacityBar}</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-6xl px-3 pt-3 pb-6 md:grid md:grid-cols-12 md:gap-6">
          <div className="md:col-span-8 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search SKU or product"
                  className={`${input} pl-9`}
                />
              </div>
              <button
                type="button"
                onClick={copyPrevious}
                disabled={!previousTrip}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--flow-accent)] bg-white text-[var(--flow-accent)] text-[13px] font-black inline-flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                <Copy size={16} /> Copy Previous Trip Load
              </button>
            </div>
            {previousTrip && (
              <p className="text-[11.5px] text-gray-500 -mt-1">
                Copies Trip #{previousTrip.id} ({previousTrip.vehicle}, {previousTrip.date}), limited to what is in
                stock now.
              </p>
            )}

            {shown.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">
                {search.trim()
                  ? 'No products match your search.'
                  : 'No products with stock available to load in this godown.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{shown.map(card)}</div>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-100 px-3 py-2 text-[13px] font-bold text-red-700">
                {error}
              </p>
            )}
          </div>

          {/* Tablet: sticky load manifest */}
          <aside className="hidden md:block md:col-span-4">
            <div className="sticky top-3 bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-[15px] font-black text-slate-900">Load Manifest</h3>
              {manifestRows.length === 0 ? (
                <p className="text-[13px] text-gray-500">Nothing loaded yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
                  {manifestRows.map(({ p, pid, n }) => (
                    <li key={pid} className="py-2 flex items-start justify-between gap-2 text-[13px]">
                      <span className="min-w-0 text-slate-800 font-semibold break-words">
                        {p?.name || `Product #${pid}`}
                      </span>
                      <span className="shrink-0 font-black tabular-nums">{n} cs</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-gray-200 pt-3 space-y-1 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total cases</span>
                  <strong className="tabular-nums">{loadedCases}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Stock value</span>
                  <strong className="tabular-nums">{inr(loadValue)}</strong>
                </div>
                {overCapacity && (
                  <p className="text-[12px] font-bold text-red-700">Over capacity by {loadedCases - maxCapacity} cases.</p>
                )}
              </div>
              {ConfirmButton}
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile: sticky bottom bar */}
      <footer className="md:hidden shrink-0 bg-[var(--flow-header)] text-white pb-[env(safe-area-inset-bottom,0px)]">
        <div className="p-3 space-y-2">
          <div className="text-center text-[14px] font-black tabular-nums">{`${loadedCases} Cases • ${inr(loadValue)}`}</div>
          {ConfirmButton}
        </div>
      </footer>
    </div>
  );
};
