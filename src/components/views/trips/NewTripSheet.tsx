import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, Plus, Truck, X } from 'lucide-react';
import { Bill, Product, Salesman, Warehouse } from '../../../types';
import { todayISO, toLocalISODate } from "../../../utils/dateLocal";
import {
  ActionBar,
  AddProductsSheet,
  DiscardSheet,
  LoadLineCard,
  ReviewSheet,
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
 * One "New load sheet" for owner AND salesman, phone first: vehicle, route, date, salesman, then the
 * products as big cards (each with its own source godown), a search-and-tap Add products sheet, and a
 * Review step before the van is loaded. Batches are picked automatically, earliest expiry first.
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
  const [review, setReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);

  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || 'Main Godown';
  const productOf = (id: number) => products.find((p) => p.id === id);
  const productName = (id: number) => productOf(id)?.name || `Product #${id}`;
  const stockIn = (wh: string, pid: number) => Math.max(0, typeof warehouseStock === 'function' ? warehouseStock(wh, pid) : 0);

  const addedQty = useMemo(() => {
    const m: Record<number, number> = {};
    for (const l of lines) m[l.productId] = (m[l.productId] || 0) + (Number(l.qty) || 0);
    return m;
  }, [lines]);

  // Each product the salesman / owner picks goes on a line with the godown chosen in the sheet.
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
  // Crates on the bills that will attach. The load must cover them, otherwise the trip is
  // born with more sold than loaded.
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
  const shortProducts = Object.entries(billedByProduct).filter(([pid, billed]) => billed > (addedQty[Number(pid)] || 0));

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

  const openReview = () => {
    setError(null);
    setReviewError(null);
    if (!vehicle.trim()) {
      setError('Enter the vehicle (van) for this trip.');
      document.getElementById('new-trip-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (totalUnits <= 0) {
      setError('Add at least one product with cases to load.');
      return;
    }
    setReview(true);
  };

  const confirm = () => {
    const msg = onSubmit(payload());
    if (msg) {
      setReviewError(msg);
    }
  };

  const handleCancel = () => (lines.length > 0 ? setAskDiscard(true) : onClose());

  const chip = (on: boolean) =>
    `shrink-0 min-h-[36px] px-3 rounded-full border text-[12px] font-bold whitespace-nowrap cursor-pointer ${
      on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-black/15'
    }`;

  const yesterday = toLocalISODate(new Date(Date.now() - 86400000));
  const salesmanLabel = lockedSalesman?.name || salesmen.find((s) => s.id === salesmanId)?.name || '';
  const reviewRows = lines
    .filter((l) => Number(l.qty) > 0)
    .map((l) => ({
      key: l.key,
      name: productName(l.productId),
      product: productOf(l.productId),
      qty: Number(l.qty) || 0,
      note: `From ${whName(l.warehouseId)}${(Number(l.qty) || 0) > stockIn(l.warehouseId, l.productId) ? ' — more than in stock' : ''}`,
      noteTone: (Number(l.qty) || 0) > stockIn(l.warehouseId, l.productId) ? ('bad' as const) : ('normal' as const),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#faf8f5]" role="dialog" aria-modal="true" aria-labelledby="new-load-sheet-title" id="form-new-trip">
      {/* Header */}
      <div className="shrink-0 border-b border-black/10 pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto max-w-xl px-3 py-2 flex items-center gap-2.5">
          <button type="button" onClick={handleCancel} aria-label="Close" className="size-11 shrink-0 rounded-xl border border-black/15 bg-white flex items-center justify-center text-slate-700 cursor-pointer">
            <X size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 id="new-load-sheet-title" className="flex items-center gap-2 text-[17px] font-black text-slate-900 leading-tight">
              <Truck size={18} className="text-[#0d4a3a]" /> New load sheet
            </h2>
            <p className="text-xs text-slate-500 truncate">{lockedSalesman ? `${lockedSalesman.name} · signed in` : 'Choose van, add products, review'}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div id="new-trip-scroll" className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-xl px-3 pt-3 pb-6 space-y-3">
          {error && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-[13px] font-bold">
              <AlertTriangle size={17} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <section className="rounded-2xl border border-black/10 bg-white p-3 space-y-3">
            <div>
              <label htmlFor="vehicle-name" className={fieldLabel}>Vehicle (van) *</label>
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
                    <button key={v} type="button" onClick={() => setVehicle(v)} className={chip(vehicle.trim().toLowerCase() === v.trim().toLowerCase())}>
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="trip-route" className={fieldLabel}>
                Route / beat <span className="normal-case font-medium text-slate-400">(optional)</span>
              </label>
              <input id="trip-route" value={route} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. Jamankira" autoComplete="off" className={fieldBox} />
              {routes.length > 0 && (
                <div className="mt-1.5 flex gap-1.5 overflow-x-auto no-scrollbar">
                  {routes.slice(0, 10).map((r) => (
                    <button key={r} type="button" onClick={() => setRoute(route === r ? '' : r)} className={chip(route === r)}>
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="trip-salesman-select" className={fieldLabel}>Salesman</label>
                {lockedSalesman ? (
                  <div className={`${fieldBox} flex items-center justify-between bg-slate-100 border-dashed text-slate-600`}>
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
                    {salesmen.filter((x) => x.active !== false).map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label htmlFor="trip-date" className={fieldLabel}>Date</label>
                <input id="trip-date" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} className={fieldBox} />
              </div>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setDate(todayISO())} className={chip(date === todayISO())}>Today</button>
              <button type="button" onClick={() => setDate(yesterday)} className={chip(date === yesterday)}>Yesterday</button>
            </div>

            <label className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-700 cursor-pointer select-none">
              <input type="checkbox" checked={autoAttach} onChange={(e) => setAutoAttach(e.target.checked)} className="size-5 rounded accent-[#0d4a3a]" />
              <span>Attach bills of this date</span>
              {billsReady > 0 && <span className="text-[11px] font-black text-[#0d4a3a] bg-[#ebe8e1] px-2 py-0.5 rounded-full">{billsReady} ready</span>}
            </label>
          </section>

          {/* Product lines */}
          <section aria-label="Products to load" className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10.5px] font-black uppercase tracking-wider text-slate-500">
                Products to load · {lines.length} line{lines.length === 1 ? '' : 's'}
              </h3>
              <span className="text-[12px] font-black text-[#0d4a3a]">Total {totalUnits} cs{godownCount > 1 ? ` · ${godownCount} godowns` : ''}</span>
            </div>

            {lines.length === 0 && (
              <div className="rounded-2xl border border-dashed border-black/20 bg-white px-4 py-8 text-center text-sm text-slate-500">
                No products yet. Tap <strong>Add products</strong> below.
              </div>
            )}

            {lines.map((l) => {
              const avail = stockIn(l.warehouseId, l.productId);
              const qty = Number(l.qty) || 0;
              const over = qty > avail;
              const billed = billedByProduct[l.productId] || 0;
              const short = billed > qty;
              return (
                <LoadLineCard
                  key={l.key}
                  product={productOf(l.productId)}
                  fallbackName={productName(l.productId)}
                  qty={l.qty}
                  onQty={(v) => patch(l.key, { qty: v })}
                  onMinus={() => patch(l.key, { qty: qty > 1 ? String(qty - 1) : '' })}
                  onPlus={() => patch(l.key, { qty: String(qty + 1) })}
                  onRemove={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                  problem={short || over}
                  godown={{
                    value: l.warehouseId,
                    options: warehouses,
                    onChange: (id) => patch(l.key, { warehouseId: id }),
                    stockText: `${avail} cs`,
                  }}
                  facts={billed > 0 ? [{ label: 'Billed on attached bills', value: `${billed} cs`, bad: short }] : []}
                  warning={
                    short
                      ? `Cases must be at least ${billed} (already billed).`
                      : over
                        ? `More than the ${avail} cs in ${whName(l.warehouseId)}.`
                        : undefined
                  }
                />
              );
            })}
          </section>

          {shortProducts.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <AlertTriangle size={13} className="inline -mt-0.5 mr-1" />
              The {billsReady} attached bill{billsReady === 1 ? '' : 's'} already sell more than this load:{' '}
              {shortProducts.map(([pid, billed]) => `${productName(Number(pid))} (billed ${billed}, loading ${addedQty[Number(pid)] || 0})`).join('; ')}. Add the cases or untick “Attach bills of this date”.
            </div>
          )}
          <p className="text-center text-[11px] text-slate-400">Batches are picked automatically, earliest expiry first.</p>
        </div>
      </div>

      <ActionBar
        actions={[
          { key: 'cancel', label: 'Cancel', icon: <X size={20} />, tone: 'cancel', onClick: handleCancel, id: 'btn-new-trip-cancel' },
          { key: 'add', label: 'Add products', icon: <Plus size={20} />, tone: 'add', onClick: () => setShowAdd(true), grow: 1.3, id: 'btn-new-trip-add' },
          { key: 'review', label: totalUnits > 0 ? `Review · ${totalUnits} cs` : 'Review', icon: <CheckCircle2 size={20} />, tone: 'primary', onClick: openReview, grow: 1.5, id: 'btn-submit-trip' },
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

      {review && (
        <ReviewSheet
          title="Review load sheet"
          facts={[
            { label: 'Vehicle', value: vehicle.trim() },
            { label: 'Route', value: route.trim() },
            { label: 'Salesman', value: salesmanLabel },
            { label: 'Date', value: date },
            { label: 'Bills attaching', value: autoAttach ? `${billsReady}` : 'none' },
            { label: 'Godowns', value: godownCount > 1 ? `${godownCount} godowns` : whName(lines[0]?.warehouseId || defaultWarehouseId) },
          ]}
          rows={reviewRows}
          totalCases={totalUnits}
          warnings={shortProducts.length > 0 ? ['Some attached bills sell more than you are loading — fix this before confirming.'] : []}
          error={reviewError}
          confirmLabel="Confirm & Load"
          onBack={() => setReview(false)}
          onCancel={() => {
            setReview(false);
            handleCancel();
          }}
          onConfirm={confirm}
        />
      )}

      {askDiscard && <DiscardSheet message="This load sheet has not been saved. If you cancel now it will be lost." onKeep={() => setAskDiscard(false)} onDiscard={onClose} />}
    </div>
  );
};
