import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  AlertTriangle,
  Plus,
  Trash2,
  Truck,
  CheckCircle2,
  Calendar,
  RotateCcw,
} from 'lucide-react';
import { Bill, Product, Trip, TripStatus } from '../../types';

interface EditTripModalProps {
  trip: Trip | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Trip) => void;
  products: Product[];
  bills: Bill[];
  palette: any;
  fz: (size: number, extra?: React.CSSProperties) => React.CSSProperties;
  scale: number;
}

export const EditTripModal: React.FC<EditTripModalProps> = ({
  trip,
  isOpen,
  onClose,
  onSave,
  products,
  bills,
  palette,
  fz,
  scale,
}) => {
  const [vehicle, setVehicle] = useState(trip?.vehicle || '');
  const [date, setDate] = useState(trip?.date || '');
  const [status, setStatus] = useState<TripStatus>(trip?.status || 'out');
  const [loaded, setLoaded] = useState<Record<number, string>>({});
  const [returned, setReturned] = useState<Record<number, string>>({});
  const [selectedAddProductId, setSelectedAddProductId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  // Sync state whenever trip changes
  useEffect(() => {
    if (trip) {
      setVehicle(trip.vehicle);
      setDate(trip.date);
      setStatus(trip.status);

      const initLoaded: Record<number, string> = {};
      for (const [pid, qty] of Object.entries(trip.loaded)) {
        initLoaded[Number(pid)] = String(qty);
      }
      setLoaded(initLoaded);

      const initReturned: Record<number, string> = {};
      for (const pid of Object.keys(trip.loaded)) {
        const numPid = Number(pid);
        initReturned[numPid] = trip.returned[numPid] !== undefined ? String(trip.returned[numPid]) : '0';
      }
      setReturned(initReturned);
      setError(null);
    }
  }, [trip]);

  // Calculate sold per product for this trip's assigned bills
  const soldByProduct: Record<number, number> = {};
  if (trip) {
    for (const billId of trip.billIds) {
      const bill = bills.find((b) => b.id === billId);
      if (!bill) continue;
      for (const item of bill.items) {
        soldByProduct[item.productId] = (soldByProduct[item.productId] || 0) + item.qty;
      }
    }
  }

  // Active product IDs currently in the loaded list
  const activeProductIds = Object.keys(loaded).map(Number);

  // Unloaded products that could be added
  const availableToAdd = products.filter((p) => !activeProductIds.includes(p.id));

  const handleAddProduct = () => {
    if (!selectedAddProductId) return;
    const pid = Number(selectedAddProductId);
    setLoaded((prev) => ({ ...prev, [pid]: '1' }));
    setReturned((prev) => ({ ...prev, [pid]: '0' }));
    setSelectedAddProductId('');
  };

  const handleRemoveProduct = (pid: number) => {
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!vehicle.trim()) {
      setError('Please enter a vehicle name or registration number.');
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
      setError('Trip must contain loaded crate quantities for at least one beverage.');
      return;
    }

    const cleanReturned: Record<number, number> = {};
    for (const pid of Object.keys(cleanLoaded)) {
      const numPid = Number(pid);
      cleanReturned[numPid] = Number(returned[numPid]) || 0;
    }

    const updatedTrip: Trip = {
      ...trip,
      vehicle: vehicle.trim(),
      date,
      status,
      loaded: cleanLoaded,
      returned: cleanReturned,
    };

    onSave(updatedTrip);
    onClose();
  };

  // Totals calculations
  let totalLoaded = 0;
  let totalSold = 0;
  let totalReturned = 0;

  activeProductIds.forEach((pid) => {
    const l = Number(loaded[pid]) || 0;
    const s = soldByProduct[pid] || 0;
    const r = Number(returned[pid]) || 0;
    totalLoaded += l;
    totalSold += s;
    totalReturned += r;
  });

  const netDiscrepancy = totalLoaded - totalSold - totalReturned;

  const inputStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    color: palette.ink,
    borderColor: palette.line,
    borderWidth: 2,
    ...fz(14),
  };

  if (!isOpen || !trip) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-trip-title"
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col border-2 shadow-2xl rounded-sm my-auto overflow-hidden"
        style={{ backgroundColor: palette.panel, borderColor: palette.navy }}
      >
        {/* Modal Header */}
        <div
          className="p-4 border-b-2 flex items-center justify-between text-white"
          style={{ backgroundColor: palette.navy }}
        >
          <div className="flex items-center gap-2.5">
            <Truck size={Math.round(20 * scale)} aria-hidden="true" />
            <div>
              <h2 id="edit-trip-title" style={fz(18, { fontWeight: 700, color: '#FFFFFF' })}>
                Edit Trip #{trip.id} — {trip.vehicle}
              </h2>
              <p className="text-white/80 text-xs mt-0.5">
                Adjust loaded cases, driver returns, vehicle info, or delivery status.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded transition-colors cursor-pointer"
            aria-label="Close edit modal"
          >
            <X size={Math.round(20 * scale)} aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div
              className="flex items-center gap-2 p-3 border-2 rounded text-sm font-semibold"
              style={{
                borderColor: palette.bad,
                backgroundColor: `${palette.bad}15`,
                color: palette.bad,
              }}
              role="alert"
            >
              <AlertTriangle size={Math.round(18 * scale)} aria-hidden="true" />
              {error}
            </div>
          )}

          {/* Primary Trip Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="edit-trip-vehicle"
                style={fz(13, { fontWeight: 600, color: palette.ink, display: 'block', marginBottom: '0.25em' })}
              >
                Vehicle Number / Driver *
              </label>
              <input
                id="edit-trip-vehicle"
                required
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                className="w-full border-2 px-3 py-2 focus-ring"
                style={inputStyle}
                placeholder="e.g. MH-12-AB-1234 (Suresh)"
              />
            </div>

            <div>
              <label
                htmlFor="edit-trip-date"
                style={fz(13, { fontWeight: 600, color: palette.ink, display: 'block', marginBottom: '0.25em' })}
              >
                Dispatch Date
              </label>
              <div className="relative">
                <input
                  id="edit-trip-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border-2 px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-trip-status"
                style={fz(13, { fontWeight: 600, color: palette.ink, display: 'block', marginBottom: '0.25em' })}
              >
                Trip Status
              </label>
              <select
                id="edit-trip-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TripStatus)}
                className="w-full border-2 px-3 py-2 focus-ring"
                style={inputStyle}
              >
                <option value="out">Out for Delivery (Active Run)</option>
                <option value="closed">Closed & Reconciled</option>
              </select>
            </div>
          </div>

          {/* Loading & Return Adjustment Table */}
          <div className="border-2 rounded p-4" style={{ borderColor: palette.line }}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h3 style={fz(15, { fontWeight: 700, color: palette.ink })}>
                  Stock Loading & Return Quantities
                </h3>
                <p style={fz(12.5, { color: palette.muted })}>
                  Edit initial cases loaded on departure and empty/unsold crates brought back on return.
                </p>
              </div>

              {/* Add extra beverage to trip */}
              {availableToAdd.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedAddProductId}
                    onChange={(e) => setSelectedAddProductId(e.target.value ? Number(e.target.value) : '')}
                    className="border-2 px-2.5 py-1.5 text-xs focus-ring"
                    style={inputStyle}
                    aria-label="Select additional beverage to load"
                  >
                    <option value="">+ Add another product...</option>
                    {availableToAdd.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku || p.category})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddProduct}
                    disabled={!selectedAddProductId}
                    className="inline-flex items-center gap-1 border-2 px-2.5 py-1.5 text-xs font-bold focus-ring cursor-pointer rounded disabled:opacity-40"
                    style={{
                      backgroundColor: palette.navy,
                      borderColor: palette.navy,
                      color: '#FFFFFF',
                    }}
                  >
                    <Plus size={14} aria-hidden="true" /> Add
                  </button>
                </div>
              )}
            </div>

            {activeProductIds.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-500">
                No products currently added to this trip loading sheet. Use the dropdown above to add beverages.
              </div>
            ) : (
              <div>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto border-2 rounded" style={{ borderColor: palette.line }}>
                  <table className="w-full text-left" style={fz(13)}>
                    <thead>
                      <tr className="border-b-2" style={{ borderColor: palette.line }}>
                        <th className="px-3 py-2 font-bold">Beverage Item</th>
                        <th className="px-3 py-2 text-right font-bold w-28">Loaded (Cs)</th>
                        <th className="px-3 py-2 text-right font-bold w-24">Billed / Sold</th>
                        <th className="px-3 py-2 text-right font-bold w-28">Returned (Cs)</th>
                        <th className="px-3 py-2 text-right font-bold w-28">Discrepancy</th>
                        <th className="px-2 py-2 text-center w-10">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeProductIds.map((pid) => {
                        const p = products.find((x) => x.id === pid);
                        const loadedVal = Number(loaded[pid]) || 0;
                        const soldVal = soldByProduct[pid] || 0;
                        const returnedVal = Number(returned[pid]) || 0;
                        const disc = loadedVal - soldVal - returnedVal;
                        const hasDisc = disc !== 0;

                        return (
                          <tr key={pid} className="border-t hover:bg-slate-50/50" style={{ borderColor: palette.line }}>
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-slate-900">
                                {p ? p.name : `Product #${pid}`}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Expected return: {Math.max(0, loadedVal - soldVal)} cs
                              </div>
                            </td>

                            {/* Loaded input */}
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  required
                                  value={loaded[pid] || ''}
                                  onChange={(e) =>
                                    setLoaded((prev) => ({ ...prev, [pid]: e.target.value }))
                                  }
                                  className="w-20 border-2 px-2 py-1 text-right font-semibold focus-ring"
                                  style={inputStyle}
                                  aria-label={`Loaded cases for ${p?.name || pid}`}
                                />
                                <span className="text-xs text-slate-500">cs</span>
                              </div>
                            </td>

                            {/* Sold / Billed display */}
                            <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                              {soldVal} cs
                            </td>

                            {/* Returned input */}
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={returned[pid] !== undefined ? returned[pid] : ''}
                                  onChange={(e) =>
                                    setReturned((prev) => ({ ...prev, [pid]: e.target.value }))
                                  }
                                  className="w-20 border-2 px-2 py-1 text-right font-semibold focus-ring"
                                  style={inputStyle}
                                  aria-label={`Returned crates for ${p?.name || pid}`}
                                />
                                <span className="text-xs text-slate-500">cs</span>
                              </div>
                            </td>

                            {/* Discrepancy */}
                            <td
                              className="px-3 py-2.5 text-right font-bold text-xs"
                              style={{ color: hasDisc ? palette.bad : palette.good }}
                            >
                              {disc === 0 ? (
                                '0 (Balanced)'
                              ) : disc > 0 ? (
                                `+${disc} missing`
                              ) : (
                                `${Math.abs(disc)} surplus`
                              )}
                            </td>

                            {/* Delete item */}
                            <td className="px-2 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveProduct(pid)}
                                className="text-slate-400 hover:text-red-600 p-1 transition-colors cursor-pointer"
                                title="Remove from trip"
                                aria-label={`Remove ${p?.name || pid} from trip`}
                              >
                                <Trash2 size={15} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile & Tablet Responsive Card Layout (No horizontal scroll) */}
                <div className="block md:hidden space-y-3">
                  {activeProductIds.map((pid) => {
                    const p = products.find((x) => x.id === pid);
                    const loadedVal = Number(loaded[pid]) || 0;
                    const soldVal = soldByProduct[pid] || 0;
                    const returnedVal = Number(returned[pid]) || 0;
                    const disc = loadedVal - soldVal - returnedVal;
                    const hasDisc = disc !== 0;

                    return (
                      <div
                        key={pid}
                        className="border-2 rounded-lg p-3 bg-white shadow-xs space-y-2.5"
                        style={{ borderColor: palette.line }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-extrabold text-sm text-slate-900 truncate">
                              {p ? p.name : `Product #${pid}`}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Expected return: <strong className="text-slate-700">{Math.max(0, loadedVal - soldVal)} cs</strong> · Sold: <strong className="text-emerald-700">{soldVal} cs</strong>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className="text-[11px] font-bold px-2 py-0.5 rounded border"
                              style={{
                                borderColor: hasDisc ? palette.bad : palette.good,
                                color: hasDisc ? palette.bad : palette.good,
                                backgroundColor: hasDisc ? `${palette.bad}10` : `${palette.good}10`,
                              }}
                            >
                              {disc === 0 ? 'Balanced' : disc > 0 ? `+${disc} cs` : `${Math.abs(disc)} sur`}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(pid)}
                              className="text-slate-400 hover:text-red-600 p-1 transition-colors cursor-pointer"
                              title="Remove from trip"
                              aria-label={`Remove ${p?.name || pid} from trip`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Mobile Inputs Grid */}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                          <div className="bg-slate-50 p-2 rounded border border-slate-200">
                            <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                              Loaded Cases
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                required
                                value={loaded[pid] || ''}
                                onChange={(e) =>
                                  setLoaded((prev) => ({ ...prev, [pid]: e.target.value }))
                                }
                                className="w-full border-2 px-2 py-1 text-right font-bold text-sm rounded focus-ring bg-white"
                                style={inputStyle}
                                aria-label={`Loaded cases for ${p?.name || pid}`}
                              />
                              <span className="text-xs text-slate-500 font-semibold">cs</span>
                            </div>
                          </div>

                          <div className="bg-slate-50 p-2 rounded border border-slate-200">
                            <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                              Returned Cases
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={returned[pid] !== undefined ? returned[pid] : ''}
                                onChange={(e) =>
                                  setReturned((prev) => ({ ...prev, [pid]: e.target.value }))
                                }
                                className="w-full border-2 px-2 py-1 text-right font-bold text-sm rounded focus-ring bg-white"
                                style={inputStyle}
                                aria-label={`Returned crates for ${p?.name || pid}`}
                              />
                              <span className="text-xs text-slate-500 font-semibold">cs</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Real-time Summary Card */}
          <div
            className="p-3.5 border-2 rounded flex items-center justify-between flex-wrap gap-3"
            style={{
              borderColor: palette.line,
              backgroundColor: `${palette.line}25`,
            }}
          >
            <div className="flex items-center gap-4 text-xs sm:text-sm font-semibold flex-wrap">
              <span>
                Total Loaded: <strong className="text-slate-900">{totalLoaded} cs</strong>
              </span>
              <span>
                Delivered / Sold: <strong className="text-slate-900">{totalSold} cs</strong>
              </span>
              <span>
                Returned: <strong className="text-slate-900">{totalReturned} cs</strong>
              </span>
            </div>

            <div>
              {netDiscrepancy === 0 ? (
                <span
                  className="px-2.5 py-1 border font-bold text-xs rounded inline-flex items-center gap-1"
                  style={{
                    borderColor: palette.good,
                    backgroundColor: `${palette.good}15`,
                    color: palette.good,
                  }}
                >
                  <CheckCircle2 size={13} aria-hidden="true" /> Reconciled & Balanced (0 diff)
                </span>
              ) : (
                <span
                  className="px-2.5 py-1 border font-bold text-xs rounded inline-flex items-center gap-1"
                  style={{
                    borderColor: palette.bad,
                    backgroundColor: `${palette.bad}15`,
                    color: palette.bad,
                  }}
                >
                  <AlertTriangle size={13} aria-hidden="true" /> Net Discrepancy:{' '}
                  {netDiscrepancy > 0 ? `${netDiscrepancy} cs missing` : `${Math.abs(netDiscrepancy)} cs extra`}
                </span>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border-2 px-4 py-2 font-semibold text-sm cursor-pointer rounded transition-colors"
              style={{
                borderColor: palette.line,
                color: palette.muted,
                backgroundColor: palette.panel,
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 border-2 px-5 py-2 font-bold text-sm cursor-pointer rounded text-white shadow-sm transition-all"
              style={{
                backgroundColor: palette.navy,
                borderColor: palette.navy,
              }}
            >
              <Save size={16} aria-hidden="true" />
              Save Trip Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
