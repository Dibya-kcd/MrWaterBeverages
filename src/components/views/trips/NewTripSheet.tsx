import React, { useMemo, useState } from 'react';
import { SizeChip } from "../../common/SizeChip";
import { ProductPicker } from "../../common/ProductPicker";
import { sizeTheme } from "../../../utils/sizeColor";
import { AlertTriangle, Minus, Plus, Trash2, Truck, X } from 'lucide-react';
import { Bill, Product, Salesman, Warehouse } from '../../../types';
import { todayISO } from "../../../utils/dateLocal";

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
}

const fieldLabel = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1';
const fieldBox =
  'w-full px-3 py-3 rounded-xl border border-black/10 bg-white text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/25';

/**
 * Mobile-first "New vehicle load sheet": pick vehicle + route, then add product lines
 * (product, godown, units). Batches are picked automatically, earliest expiry first.
 * Everything except the vehicle and at least one line is optional.
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
}) => {
  const [vehicle, setVehicle] = useState('');
  const [route, setRoute] = useState('');
  const [salesmanId, setSalesmanId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [autoAttach, setAutoAttach] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [lines, setLines] = useState<NewTripLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || 'Main Godown';
  const productName = (id: number) => products.find((p) => p.id === id)?.name || `Product #${id}`;

  const addedProductIds = useMemo(() => new Set(lines.map((l) => l.productId)), [lines]);

  // Only show products which are in stock in at least one warehouse AND not already added to this trip
  const inStockProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (addedProductIds.has(p.id)) return false;
        const total = warehouses.reduce(
          (sum, w) => sum + (typeof warehouseStock === 'function' ? warehouseStock(w.id, p.id) : 0),
          0
        );
        return total > 0;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, warehouses, warehouseStock, addedProductIds]);

  const addLine = (productId: number) => {
    if (!productId) return;
    // Prefer a godown that actually has the product
    const withStock = warehouses.find((w) => warehouseStock(w.id, productId) > 0);
    const wh = (withStock?.id) || defaultWarehouseId || warehouses[0]?.id || '';
    setLines((prev) => [
      ...prev,
      { key: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, productId, warehouseId: wh, qty: '' },
    ]);
  };

  const patch = (key: string, p: Partial<NewTripLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const totalUnits = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const godownCount = new Set(lines.filter((l) => Number(l.qty) > 0).map((l) => l.warehouseId)).size;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = onSubmit({
      vehicle: vehicle.trim(),
      route: route.trim(),
      date,
      salesmanId,
      autoAttachBills: autoAttach,
      lines: lines
        .map((l) => ({ productId: l.productId, warehouseId: l.warehouseId, qty: Number(l.qty) || 0 }))
        .filter((l) => l.qty > 0),
    });
    if (msg) setError(msg);
  };

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
  const loadByProduct = useMemo(() => {
    const res: Record<number, number> = {};
    for (const l of lines) res[l.productId] = (res[l.productId] || 0) + (Number(l.qty) || 0);
    return res;
  }, [lines]);
  const shortProducts = Object.entries(billedByProduct).filter(
    ([pid, billed]) => billed > (loadByProduct[Number(pid)] || 0),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-slate-900/40 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-load-sheet-title"
    >
      <form
        id="form-new-trip"
        onSubmit={handleSubmit}
        className="w-full sm:max-w-xl bg-[#faf8f5] sm:rounded-3xl shadow-2xl flex flex-col max-h-[100dvh] sm:max-h-[92vh] overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 px-4 py-3 flex items-center justify-between gap-3 border-b border-black/5 bg-[#faf8f5]">
          <h2 id="new-load-sheet-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Truck size={20} className="text-[#0d4a3a]" />
            New load sheet
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="size-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-black/5 cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">
          {error && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-sm font-semibold">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="vehicle-name" className={fieldLabel}>Vehicle (van)</label>
              <input
                id="vehicle-name"
                list="trip-vehicle-options"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                placeholder="e.g. EV"
                autoComplete="off"
                className={fieldBox}
              />
              <datalist id="trip-vehicle-options">
                {vehicles.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div>
              <label htmlFor="trip-route" className={fieldLabel}>Route / beat <span className="normal-case font-medium text-slate-400">(optional)</span></label>
              <input
                id="trip-route"
                list="trip-route-options"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="e.g. Jamankira"
                autoComplete="off"
                className={fieldBox}
              />
              <datalist id="trip-route-options">
                {routes.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
          </div>

          {/* Product lines */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`${fieldLabel} mb-0`}>Products to load</h3>
              <span className="text-[11px] font-semibold text-slate-400">{lines.length} line{lines.length === 1 ? '' : 's'}</span>
            </div>

            <div className="space-y-3">
              {lines.map((l) => {
                const avail = Math.max(0, warehouseStock(l.warehouseId, l.productId));
                const qty = Number(l.qty) || 0;
                const over = qty > avail;
                return (
                  <div
                    key={l.key}
                    className={`rounded-2xl border bg-white p-3.5 ${over ? 'border-amber-400' : 'border-black/10'}`}
                    style={{ borderLeftWidth: 6, borderLeftColor: sizeTheme(products.find((p) => p.id === l.productId)?.volume, productName(l.productId)).hex }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[15px] font-bold text-slate-900 leading-snug break-words min-w-0">
                        {productName(l.productId)}{' '}
                        <SizeChip
                          volume={products.find((p) => p.id === l.productId)?.volume}
                          pack={products.find((p) => p.id === l.productId)?.pack}
                          name={productName(l.productId)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                        className="size-9 -mt-1 -mr-1.5 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                        aria-label={`Remove ${productName(l.productId)}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-3 items-end">
                      <div className="min-w-0">
                        <label className={fieldLabel}>From godown</label>
                        <select
                          value={l.warehouseId}
                          onChange={(e) => patch(l.key, { warehouseId: e.target.value })}
                          className={fieldBox}
                        >
                          {warehouses.length === 0 && <option value="">Main Godown</option>}
                          {warehouses.map((w) => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={fieldLabel}>Units</label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => patch(l.key, { qty: qty > 1 ? String(qty - 1) : '' })}
                            disabled={qty <= 0}
                            aria-label="Decrease"
                            className="size-11 rounded-xl border border-black/10 bg-slate-50 flex items-center justify-center disabled:opacity-40 cursor-pointer active:scale-95"
                          >
                            <Minus size={16} />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            placeholder="0"
                            value={l.qty}
                            onChange={(e) => patch(l.key, { qty: e.target.value })}
                            aria-label={`Units of ${productName(l.productId)}`}
                            className="w-16 h-11 text-center rounded-xl border border-black/10 bg-white text-base font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/25"
                          />
                          <button
                            type="button"
                            onClick={() => patch(l.key, { qty: String(qty + 1) })}
                            aria-label="Increase"
                            className="size-11 rounded-xl border border-black/10 bg-slate-50 flex items-center justify-center cursor-pointer active:scale-95"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className={`mt-2 text-xs ${over ? 'text-amber-800 font-semibold' : 'text-slate-500'}`}>
                      {over && <AlertTriangle size={13} className="inline -mt-0.5 mr-1" />}
                      Stock at {whName(l.warehouseId)}: <strong>{avail}</strong> available
                      {over ? ' — more than in stock' : ''}
                    </div>
                    {(billedByProduct[l.productId] || 0) > 0 && (
                      <div
                        className={`mt-1 text-xs ${
                          (loadByProduct[l.productId] || 0) < billedByProduct[l.productId]
                            ? 'text-rose-700 font-semibold'
                            : 'text-slate-500'
                        }`}
                      >
                        {billedByProduct[l.productId]} already billed on attached bills — units for this product must be at least that.
                      </div>
                    )}
                  </div>
                );
              })}

              <ProductPicker
                keepSelection={false}
                value=""
                onChange={(id) => addLine(id)}
                ariaLabel="Add product to load sheet"
                placeholder={
                  inStockProducts.length === 0
                    ? lines.length > 0 && products.length > 0
                      ? '✓ All in-stock beverages added to trip'
                      : 'No products currently in stock in godowns'
                    : '+ Add product to load sheet…'
                }
                buttonClassName="px-3 py-3.5 rounded-2xl border border-dashed border-[#0d4a3a]/40 bg-white text-[15px] font-semibold text-[#0d4a3a] focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/25"
                options={inStockProducts.map((p) => {
                  const st = warehouses.reduce(
                    (sum, w) => sum + (typeof warehouseStock === 'function' ? warehouseStock(w.id, p.id) : 0),
                    0
                  );
                  return { product: p, note: `${st} cs in stock` };
                })}
              />
            </div>
          </section>

          {/* Optional details */}
          <section className="rounded-2xl border border-black/8 bg-white">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-slate-700 cursor-pointer"
              aria-expanded={showMore}
            >
              <span>More options <span className="font-normal text-slate-400">· salesman, date, bills</span></span>
              <span className="text-slate-400">{showMore ? '−' : '+'}</span>
            </button>
            {showMore && (
              <div className="px-4 pb-4 space-y-3 border-t border-black/5 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="trip-salesman-select" className={fieldLabel}>Salesman</label>
                    <select
                      id="trip-salesman-select"
                      value={salesmanId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSalesmanId(id);
                        const sm = salesmen.find((s) => s.id === id);
                        if (sm?.defaultVehicle && !vehicle) setVehicle(sm.defaultVehicle);
                      }}
                      className={fieldBox}
                    >
                      <option value="">None</option>
                      {salesmen.filter((s) => s.active !== false).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="trip-date" className={fieldLabel}>Date</label>
                    <input id="trip-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldBox} />
                  </div>
                </div>
                <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoAttach}
                    onChange={(e) => setAutoAttach(e.target.checked)}
                    className="size-4 rounded accent-[#0d4a3a]"
                  />
                  Attach today&apos;s bills to this trip
                  {billsReady > 0 && (
                    <span className="text-[11px] font-bold text-[#0d4a3a] bg-[#ebe8e1] px-2 py-0.5 rounded-full">{billsReady} ready</span>
                  )}
                </label>
              </div>
            )}
          </section>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 px-4 pt-3 pb-4 border-t border-black/5 bg-[#faf8f5] pb-[max(1rem,env(safe-area-inset-bottom))]">
          {shortProducts.length > 0 && (
            <div className="mb-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <AlertTriangle size={13} className="inline -mt-0.5 mr-1" />
              The {billsReady} attached bill{billsReady === 1 ? '' : 's'} already sell more than this load:{' '}
              {shortProducts
                .map(([pid, billed]) => `${productName(Number(pid))} (billed ${billed}, loading ${loadByProduct[Number(pid)] || 0})`)
                .join('; ')}
              . Add the units or untick &quot;Attach today&apos;s bills&quot;.
            </div>
          )}
          <button
            id="btn-submit-trip"
            type="submit"
            className="w-full py-3.5 rounded-2xl bg-[#0d4a3a] hover:bg-[#0a3d30] text-white text-[15px] font-semibold shadow-sm cursor-pointer active:scale-[0.99]"
          >
            Confirm &amp; load vehicle
            {totalUnits > 0 ? ` · ${totalUnits} cs${godownCount > 1 ? ` · ${godownCount} godowns` : ''}` : ''}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">Batches are picked automatically, earliest expiry first.</p>
        </div>
      </form>
    </div>
  );
};
