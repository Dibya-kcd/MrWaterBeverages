import React, { useMemo, useState } from 'react';
import { OdiaName } from '../../common/OdiaName';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Lock, Plus, Truck, X } from 'lucide-react';
import { Bill, Product, Salesman, Warehouse } from '../../../types';
import { todayISO, toLocalISODate } from '../../../utils/dateLocal';
import {
  ActionBar,
  AddProductsSheet,
  DiscardSheet,
  LoadLineCard,
  ReviewSheet,
  StepProgress,
  fieldBox,
  fieldLabel,
} from './LoadSheetParts';

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

/**
 * Sequential load-sheet wizard (owner + salesman):
 *   Step 1 – Trip details (vehicle, route, salesman, date, attach bills)
 *   Step 2 – Add products (cards + godown per line)
 *   Step 3 – Review & confirm
 * Same fields, validation and save path as before — only the presentation is step-by-step.
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
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [route, setRoute] = useState('');
  const [salesmanId, setSalesmanId] = useState(lockedSalesman?.id || '');
  const [date, setDate] = useState(todayISO());
  const [autoAttach, setAutoAttach] = useState(true);
  const [lines, setLines] = useState<NewTripLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addGodown, setAddGodown] = useState(defaultWarehouseId || warehouses[0]?.id || '');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);

  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || 'Main Godown';
  const productOf = (id: number) => products.find((p) => p.id === id);
  const productName = (id: number) => productOf(id)?.name || `Product #${id}`;
  const stockIn = (wh: string, pid: number) =>
    Math.max(0, typeof warehouseStock === 'function' ? warehouseStock(wh, pid) : 0);

  const addedQty = useMemo(() => {
    const m: Record<number, number> = {};
    for (const l of lines) m[l.productId] = (m[l.productId] || 0) + (Number(l.qty) || 0);
    return m;
  }, [lines]);

  const addPicks = (picks: Record<number, number>, godownId?: string): string | null => {
    const wh = godownId || addGodown || defaultWarehouseId || warehouses[0]?.id || '';
    setLines((prev) => [
      ...prev,
      ...Object.entries(picks)
        .filter(([pid, q]) => q > 0 && !prev.some((l) => l.productId === Number(pid)))
        .map(([pid, q], i) => ({
          key: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          productId: Number(pid),
          warehouseId: wh,
          qty: String(q),
        })),
    ]);
    setError(null);
    setShowAdd(false);
    return null;
  };

  const patch = (key: string, p: Partial<NewTripLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const totalUnits = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const godownCount = new Set(lines.filter((l) => Number(l.qty) > 0).map((l) => l.warehouseId)).size;

  const attachList = useMemo(
    () => (autoAttach ? attachableBills(date, salesmanId, vehicle.trim()) : []),
    [autoAttach, attachableBills, date, salesmanId, vehicle],
  );
  const billsReady = attachList.length;

  const billedByProduct = useMemo(() => {
    const res: Record<number, number> = {};
    for (const b of attachList) {
      for (const it of b.items || []) {
        const pid = Number(it.productId);
        res[pid] = (res[pid] || 0) + (Number(it.qty) || 0);
      }
    }
    return res;
  }, [attachList]);
  const shortProducts = Object.entries(billedByProduct).filter(
    ([pid, billed]) => billed > (addedQty[Number(pid)] || 0),
  );

  const payload = (): NewTripPayload => ({
    vehicle: vehicle.trim(),
    route: route.trim(),
    date,
    salesmanId,
    autoAttachBills: autoAttach,
    salesmanName: lockedSalesman?.name,
    lines: lines
      .map((l) => ({ productId: l.productId, warehouseId: l.warehouseId, qty: Number(l.qty) || 0 }))
      .filter((l) => l.qty > 0),
  });

  const confirm = () => {
    setError(null);
    if (!vehicle.trim()) {
      setError('Enter the vehicle (van) for this trip.');
      document.getElementById('vehicle-name')?.focus();
      return;
    }
    if (totalUnits <= 0) {
      setError('Add at least one product with cases to load.');
      return;
    }
    const msg = onSubmit(payload());
    if (msg) setError(msg);
  };

  const handleCancel = () => (lines.length > 0 || vehicle.trim() ? setAskDiscard(true) : onClose());

  const chip = (on: boolean) =>
    `shrink-0 min-h-[36px] px-3 rounded-full border text-[12px] font-bold whitespace-nowrap cursor-pointer ${
      on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-black/15'
    }`;

  const yesterday = toLocalISODate(new Date(Date.now() - 86400000));
  const salesmanLabel =
    lockedSalesman?.name || salesmen.find((s) => s.id === salesmanId)?.name || '';
  const reviewRows = lines
    .filter((l) => Number(l.qty) > 0)
    .map((l) => ({
      key: l.key,
      name: productName(l.productId),
      product: productOf(l.productId),
      qty: Number(l.qty) || 0,
      note: `From ${whName(l.warehouseId)}${
        (Number(l.qty) || 0) > stockIn(l.warehouseId, l.productId) ? ' — more than in stock' : ''
      }`,
      noteTone:
        (Number(l.qty) || 0) > stockIn(l.warehouseId, l.productId)
          ? ('bad' as const)
          : ('normal' as const),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const loadedLines = lines.filter((l) => Number(l.qty) > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#faf8f5]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-load-sheet-title"
      id="form-new-trip"
    >
      {/* Header */}
      <div className="shrink-0 border-b border-black/10 pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto max-w-xl px-3 py-2 flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close"
            className="size-11 shrink-0 rounded-xl border border-black/15 bg-white flex items-center justify-center text-slate-700 cursor-pointer"
          >
            <X size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2
              id="new-load-sheet-title"
              className="flex items-center gap-2 text-[17px] font-black text-slate-900 leading-tight"
            >
              <Truck size={18} className="shrink-0 text-[var(--primary)]" />
              <span className="truncate">New trip</span>
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {totalUnits > 0
                ? `${totalUnits} cs · ${loadedLines.length} item${loadedLines.length === 1 ? '' : 's'} loaded`
                : lockedSalesman
                  ? `${lockedSalesman.name} · signed in`
                  : 'Pick the van, then add products'}
            </p>
          </div>
        </div>
      </div>

      {/* Body: one screen — van details on top, products below */}
      <div id="new-trip-scroll" className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-xl px-3 pt-3 pb-6 space-y-3">
          {/* 1. Van */}
          <section className="rounded-2xl border border-black/10 bg-white p-3 space-y-3">
            <div>
              <label htmlFor="vehicle-name" className={fieldLabel}>
                Vehicle (van) *
              </label>
              <input
                id="vehicle-name"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                placeholder="e.g. EV"
                autoComplete="off"
                autoCapitalize="characters"
                className={fieldBox}
              />
              {vehicles.length > 0 && (
                <div className="mt-1.5 flex gap-1.5 overflow-x-auto no-scrollbar">
                  {vehicles.slice(0, 8).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVehicle(v)}
                      className={chip(vehicle.trim().toLowerCase() === v.trim().toLowerCase())}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2.5">
              <div className="min-w-0">
                <label htmlFor="trip-salesman-select" className={fieldLabel}>
                  Salesman
                </label>
                {lockedSalesman ? (
                  <div
                    className={`${fieldBox} flex items-center justify-between gap-2 bg-slate-100 border-dashed text-slate-600`}
                  >
                    <span className="truncate">{lockedSalesman.name}</span>
                    <Lock size={14} className="shrink-0 text-slate-400" />
                  </div>
                ) : (
                  <select
                    id="trip-salesman-select"
                    value={salesmanId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSalesmanId(id);
                      const sm = salesmen.find((x) => x.id === id);
                      if (sm?.defaultVehicle && !vehicle) setVehicle(sm.defaultVehicle);
                    }}
                    className={fieldBox}
                  >
                    <option value="">None</option>
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
              <div className="min-w-0">
                <label htmlFor="trip-date" className={fieldLabel}>
                  Date
                </label>
                <input
                  id="trip-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value || todayISO())}
                  className={`${fieldBox} min-w-0`}
                />
              </div>
            </div>

            {/* Rarely changed options stay tucked away */}
            <details className="group rounded-xl border border-black/10 bg-slate-50 px-3 py-2">
              <summary className="flex items-center justify-between gap-2 cursor-pointer select-none text-[13px] font-bold text-slate-700 list-none">
                <span className="truncate">
                  More options
                  <span className="font-medium text-slate-500">
                    {route.trim() ? ` · ${route.trim()}` : ''}
                    {autoAttach && billsReady > 0 ? ` · ${billsReady} bill${billsReady === 1 ? '' : 's'} attach` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-slate-400 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="trip-route" className={fieldLabel}>
                    Route / beat <span className="normal-case font-medium text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="trip-route"
                    value={route}
                    onChange={(e) => setRoute(e.target.value)}
                    placeholder="e.g. Jamankira"
                    autoComplete="off"
                    className={fieldBox}
                  />
                  {routes.length > 0 && (
                    <div className="mt-1.5 flex gap-1.5 overflow-x-auto no-scrollbar">
                      {routes.slice(0, 10).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRoute(route === r ? '' : r)}
                          className={chip(route === r)}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setDate(todayISO())} className={chip(date === todayISO())}>
                    Today
                  </button>
                  <button type="button" onClick={() => setDate(yesterday)} className={chip(date === yesterday)}>
                    Yesterday
                  </button>
                </div>
                <label className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoAttach}
                    onChange={(e) => setAutoAttach(e.target.checked)}
                    className="size-5 shrink-0 rounded accent-[var(--primary)]"
                  />
                  <span className="min-w-0">Attach bills of this date</span>
                  {autoAttach && billsReady > 0 && (
                    <span className="ml-auto shrink-0 text-[12px] font-bold text-[var(--primary)]">
                      {billsReady} ready
                    </span>
                  )}
                </label>
              </div>
            </details>
          </section>

          {/* 2. Products */}
          {loadedLines.length === 0 ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="w-full rounded-2xl border-2 border-dashed border-[var(--primary)]/50 bg-white py-9 px-4 text-center cursor-pointer active:bg-emerald-50"
            >
              <span className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-[var(--primary)] text-white">
                <Plus size={24} />
              </span>
              <span className="block text-[16px] font-black text-slate-900">Add products to load</span>
              <span className="block text-[13px] text-slate-500 mt-0.5">Tap here, pick the cases, press Done</span>
            </button>
          ) : (
            <div className="space-y-2.5">
              {loadedLines.map((l) => {
                const p = productOf(l.productId);
                const over = (Number(l.qty) || 0) > stockIn(l.warehouseId, l.productId);
                return (
                  <LoadLineCard
                    key={l.key}
                    product={p}
                    fallbackName={productName(l.productId)}
                    qty={l.qty}
                    onQty={(v) => patch(l.key, { qty: v })}
                    onMinus={() => patch(l.key, { qty: String(Math.max(0, (Number(l.qty) || 0) - 1)) })}
                    onPlus={() => patch(l.key, { qty: String((Number(l.qty) || 0) + 1) })}
                    onRemove={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    godown={
                      warehouses.length > 1
                        ? {
                            value: l.warehouseId,
                            options: warehouses,
                            onChange: (id) => patch(l.key, { warehouseId: id }),
                            stockText: `${stockIn(l.warehouseId, l.productId)} cs`,
                          }
                        : undefined
                    }
                    facts={
                      warehouses.length > 1
                        ? undefined
                        : [{ label: 'In stock', value: `${stockIn(l.warehouseId, l.productId)} cs`, bad: over }]
                    }
                    warning={over ? 'More than available in this godown' : undefined}
                    problem={over}
                  />
                );
              })}
            </div>
          )}

          {shortProducts.length > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 text-[12.5px] font-bold"
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span className="min-w-0 break-words">
                Attached bills need more cases than you loaded:{' '}
                {shortProducts
                  .map(
                    ([pid, billed]) =>
                      `${productName(Number(pid))} needs ${billed} (loading ${addedQty[Number(pid)] || 0})`,
                  )
                  .join('; ')}
                . Add the cases or untick “Attach bills of this date” under More options.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Errors stay visible right above the buttons */}
      {error && (
        <div className="shrink-0 bg-[#faf8f5] px-3 pt-2">
          <div
            role="alert"
            className="mx-auto max-w-xl flex items-start gap-2 p-3 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-[13px] font-bold"
          >
            <AlertTriangle size={17} className="shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        </div>
      )}

      <ActionBar
        actions={[
          {
            key: 'add',
            label: loadedLines.length > 0 ? 'Add more' : 'Add products',
            icon: <Plus size={20} />,
            tone: 'add',
            onClick: () => setShowAdd(true),
            grow: 1,
            id: 'btn-new-trip-add',
          },
          {
            key: 'confirm',
            label: totalUnits > 0 ? `Start trip · ${totalUnits} cs` : 'Start trip',
            icon: <CheckCircle2 size={20} />,
            tone: 'primary',
            onClick: confirm,
            grow: 1.4,
            id: 'btn-submit-trip',
          },
        ]}
      />

      {showAdd && (
        <AddProductsSheet
          products={products}
          added={addedQty}
          stockOf={(pid, wh) => stockIn(wh || addGodown, pid)}
          stockText={(pid, wh) => `${stockIn(wh || addGodown, pid)} cs in ${whName(wh || addGodown)}`}
          godowns={warehouses}
          godownId={addGodown}
          onGodown={setAddGodown}
          onConfirm={addPicks}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {askDiscard && (
        <DiscardSheet
          message="This load sheet has not been saved. If you cancel now it will be lost."
          onKeep={() => setAskDiscard(false)}
          onDiscard={onClose}
        />
      )}
    </div>
  );
};
