import { findOverReturns, describeOverReturn } from '../../utils/tripReturns';
import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  Package,
  Pencil,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { Bill, PaymentRecord, Product, Trip, TripShortageReason, Warehouse } from '../../types';
import { billBelongsToTrip } from '../../utils/billing';
import { billBalance } from '../../utils/salesReturns';
import { SizeChip } from '../common/SizeChip';
import { OdiaName } from '../common/OdiaName';
import { sizeTheme } from '../../utils/sizeColor';

interface TripRecordReturnScreenProps {
  trip: Trip;
  products: Product[];
  bills: Bill[];
  warehouses?: Warehouse[];
  payments?: PaymentRecord[];
  onBack: () => void;
  onSaveReturn: (
    tripId: number,
    finalReturn: Record<number, number>,
    closeTrip: boolean,
    shortageReasons?: Record<number, { reason: TripShortageReason; note?: string }>,
    cashHandedIn?: number | null,
    cashShortBooked?: number | null,
  ) => string | null | void; // a text = the save was refused; shown to the person
  onEditTrip?: (trip: Trip) => void;
}

export const TripRecordReturnScreen: React.FC<TripRecordReturnScreenProps> = ({
  trip,
  products,
  bills,
  warehouses = [],
  payments = [],
  onBack,
  onSaveReturn,
  onEditTrip,
}) => {
  // Initialize return draft with existing returned values or empty
  const [returnDraft, setReturnDraft] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    // A closed trip shows what was recorded; an open one shows the unsaved draft counts (if any).
    const returnedMap = trip.status === 'closed' ? trip.returned || {} : trip.draftReturned || {};
    for (const pidStr of Object.keys(trip.loaded || {})) {
      const pid = Number(pidStr);
      if (returnedMap[pid] !== undefined) {
        init[pid] = String(returnedMap[pid]);
      } else {
        init[pid] = '0';
      }
    }
    return init;
  });

  // Why each short product is short. Required to close the trip; 'broken' crates are written off
  // from stock when the trip closes.
  const [reasons, setReasons] = useState<Record<number, { reason: TripShortageReason | ''; note: string }>>(() => {
    const init: Record<number, { reason: TripShortageReason | ''; note: string }> = {};
    for (const [pid, e] of Object.entries(trip.shortageReasons || {})) {
      init[Number(pid)] = { reason: e.reason, note: e.note || '' };
    }
    return init;
  });
  const [reasonError, setReasonError] = useState<string | null>(null);

  // Money side of the trip: what was billed, what has been collected, what is still due, and how much of the
  // collection was cash (the amount the salesman is expected to hand in).
  const [cashIn, setCashIn] = useState<string>(trip.cashHandedIn != null ? String(trip.cashHandedIn) : '');
  const money = useMemo(() => {
    const mine = bills.filter((b) => billBelongsToTrip(trip, b));
    const ids = new Set(mine.map((b) => b.id));
    let billed = 0;
    let collected = 0;
    let dues = 0;
    for (const b of mine) {
      billed += Number(b.total) || 0;
      collected += Number(b.amountPaid) || 0;
      dues += Math.max(0, billBalance(b));
    }
    const forTrip = payments.filter((p) => p.billId != null && ids.has(p.billId) && !p.isAdvance && !p.isRefund);
    // Prefer the individual receipts; fall back to each bill's own payment mode when none were recorded.
    const cashExpected = forTrip.length
      ? forTrip.filter((p) => p.mode === 'cash').reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      : mine.filter((b) => b.paymentMode === 'cash').reduce((sum, b) => sum + (Number(b.amountPaid) || 0), 0);
    return { count: mine.length, billed, collected, dues, cashExpected };
  }, [bills, payments, trip]);
  // A shortfall can be booked as owed by the salesman; it is then tracked under Trips → History until repaid.
  const [bookShort, setBookShort] = useState<boolean>(true);
  const cashNum = cashIn.trim() === '' ? null : Number(cashIn);
  const cashVariance = cashNum === null || !Number.isFinite(cashNum) ? null : cashNum - money.cashExpected;
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  // Calculate sold per product for this trip's assigned bills
  const soldByProduct = useMemo(() => {
    const res: Record<number, number> = {};
    // Same ownership rule as the trip list and van stock (bill.tripId wins, else trip.billIds),
    // so the expected-return figures here always agree with the discrepancy shown afterwards.
    for (const bill of bills) {
      if (!billBelongsToTrip(trip, bill)) continue;
      for (const item of bill.items || []) {
        res[item.productId] = (res[item.productId] || 0) + (Number(item.qty) || 0);
      }
    }
    return res;
  }, [trip, bills]);

  const loadedPids = useMemo(() => {
    return Object.keys(trip.loaded || {}).map(Number);
  }, [trip.loaded]);

  const handleUpdateReturn = (pid: number, delta: number) => {
    setReturnDraft((prev) => {
      const current = Number(prev[pid]) || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [pid]: String(next) };
    });
  };

  const handleSetReturnDirect = (pid: number, val: string) => {
    setReturnDraft((prev) => ({ ...prev, [pid]: val }));
  };

  // Fill all items with their expected return count (loaded - sold)
  const handleFillAllExpected = () => {
    const next: Record<number, string> = {};
    for (const pid of loadedPids) {
      const l = trip.loaded[pid] || 0;
      const s = soldByProduct[pid] || 0;
      const expected = Math.max(0, l - s);
      next[pid] = String(expected);
    }
    setReturnDraft(next);
  };

  const handleResetAllToZero = () => {
    const next: Record<number, string> = {};
    for (const pid of loadedPids) {
      next[pid] = '0';
    }
    setReturnDraft(next);
  };

  const handleMatchExpectedSingle = (pid: number) => {
    const l = trip.loaded[pid] || 0;
    const s = soldByProduct[pid] || 0;
    const expected = Math.max(0, l - s);
    setReturnDraft((prev) => ({ ...prev, [pid]: String(expected) }));
  };

  // Totals & KPI metrics
  const { totalLoaded, totalSold, totalExpected, totalActualReturn, netDiscrepancy, anyShortage } = useMemo(() => {
    let tLoaded = 0;
    let tSold = 0;
    let tActual = 0;
    let hasShort = false;

    for (const pid of loadedPids) {
      const l = trip.loaded[pid] || 0;
      const s = soldByProduct[pid] || 0;
      const r = Number(returnDraft[pid]) || 0;

      tLoaded += l;
      tSold += s;
      tActual += r;

      if (l - s - r > 0) hasShort = true;
    }

    const tExpected = Math.max(0, tLoaded - tSold);
    const discrepancy = tLoaded - tSold - tActual;

    return {
      totalLoaded: tLoaded,
      totalSold: tSold,
      totalExpected: tExpected,
      totalActualReturn: tActual,
      netDiscrepancy: discrepancy,
      anyShortage: hasShort,
    };
  }, [loadedPids, trip.loaded, soldByProduct, returnDraft]);

  const shortRows = useMemo(
    () =>
      loadedPids
        .map((pid) => ({
          pid,
          short: (trip.loaded[pid] || 0) - (soldByProduct[pid] || 0) - (Number(returnDraft[pid]) || 0),
        }))
        .filter((r) => r.short > 0),
    [loadedPids, trip.loaded, soldByProduct, returnDraft],
  );

  // More crates than were ever left in the van (loaded - sold) cannot come back: they would be added to godown stock
  // out of nothing. Closing is blocked until the count is fixed; the same rule is checked again when saving.
  const overReturns = useMemo(() => {
    const entered: Record<number, number> = {};
    for (const pid of loadedPids) entered[pid] = Math.max(0, Number(returnDraft[pid]) || 0);
    return findOverReturns(trip, bills, entered);
  }, [loadedPids, returnDraft, trip, bills]);
  const overText = (o: (typeof overReturns)[number]) =>
    describeOverReturn(o, products.find((p) => p.id === o.productId)?.name);

  const handleSubmit = (closeTrip: boolean) => {
    const finalReturn: Record<number, number> = {};
    for (const pid of loadedPids) {
      finalReturn[pid] = Math.max(0, Number(returnDraft[pid]) || 0);
    }
    setReasonError(null);
    if (closeTrip && overReturns.length > 0) {
      setReasonError(overReturns.map(overText).join(' ') + ' Correct the count before closing.');
      return;
    }
    const cashValue = cashNum !== null && Number.isFinite(cashNum) && cashNum >= 0 ? cashNum : null;
    if (cashIn.trim() !== '' && cashValue === null) {
      setReasonError('Cash handed in must be a number of 0 or more (or leave it empty).');
      return;
    }
    if (!closeTrip) {
      onSaveReturn(trip.id, finalReturn, false, undefined, cashValue);
      return;
    }
    const picked: Record<number, { reason: TripShortageReason; note?: string }> = {};
    for (const { pid } of shortRows) {
      const r = reasons[pid];
      const name = products.find((p) => p.id === pid)?.name || `Product #${pid}`;
      if (!r || !r.reason) {
        setReasonError(`Choose a reason for the shortage on ${name}.`);
        return;
      }
      if (r.reason === 'other' && !r.note.trim()) {
        setReasonError(`Add a short note explaining the shortage on ${name}.`);
        return;
      }
      picked[pid] = { reason: r.reason, note: r.note.trim() || undefined };
    }
    const booked =
      cashValue !== null && cashVariance !== null && cashVariance < 0 && bookShort
        ? Math.round(-cashVariance * 100) / 100
        : null;
    const refused = onSaveReturn(trip.id, finalReturn, true, picked, cashValue, booked);
    if (typeof refused === 'string' && refused) setReasonError(refused);
  };

  const targetGodown = warehouses.find((w) => w.id === trip.warehouseId);

  return (
    <div className="max-w-none lg:max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-200">
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
                Record Return & Reconcile — Trip #{trip.id}
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                {trip.vehicle}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Trip Date: {trip.date} · Driver: {trip.salesman || 'Unassigned'} · Sourcing Godown: {targetGodown?.name || 'Main Godown'}
            </p>
          </div>
        </div>

        {onEditTrip && (
          <button
            type="button"
            onClick={() => onEditTrip(trip)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer shadow-2xs self-start sm:self-auto"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit Load Sheet</span>
          </button>
        )}
      </div>

      {/* KPI Cards: Live Reconciliation Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Loaded</div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">{totalLoaded}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">crates dispatched</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Delivered</div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 tabular-nums">{totalSold}</div>
          <div className="text-[11px] text-emerald-800/80 mt-0.5 font-medium">billed on route</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Expected</div>
          <div className="text-xl sm:text-2xl font-black text-slate-800 mt-1 tabular-nums">{totalExpected}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">unsold cases</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Actual Return</div>
          <div className="text-xl sm:text-2xl font-black text-teal-800 mt-1 tabular-nums">{totalActualReturn}</div>
          <div className="text-[11px] text-teal-700/80 mt-0.5 font-medium">entered below</div>
        </div>

        <div
          className={`col-span-2 sm:col-span-1 p-3.5 rounded-2xl border shadow-2xs ${
            netDiscrepancy === 0
              ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900'
              : netDiscrepancy > 0
                ? 'bg-rose-50/80 border-rose-300 text-rose-900'
                : 'bg-amber-50/80 border-amber-300 text-amber-900'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider">
            {netDiscrepancy === 0 ? 'Reconciliation' : netDiscrepancy > 0 ? 'Shortage' : 'Surplus'}
          </div>
          <div className="text-xl sm:text-2xl font-black mt-1 tabular-nums">
            {netDiscrepancy === 0 ? '0 Balanced' : netDiscrepancy > 0 ? `−${netDiscrepancy} cs` : `+${Math.abs(netDiscrepancy)} cs`}
          </div>
          <div className="text-[11px] mt-0.5 font-medium">
            {netDiscrepancy === 0 ? 'All crates accounted' : netDiscrepancy > 0 ? 'Cases unaccounted' : 'Extra cases brought'}
          </div>
        </div>
      </div>

      {/* Godown Return Destination Banner */}
      <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs font-semibold text-emerald-950">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-700 shrink-0" />
          <span>
            Returned unsold crates will be physically received back into godown inventory:{' '}
            <strong className="text-emerald-900 font-bold">{targetGodown?.name || 'Main Godown'}</strong>
          </span>
        </div>

        {/* Quick Autofill Tools */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleFillAllExpected}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100/70 text-emerald-900 border border-emerald-300 font-bold transition-colors cursor-pointer shadow-2xs"
            title="Automatically set all returned values equal to expected unsold cases"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Fill All Expected</span>
          </button>
          <button
            type="button"
            onClick={handleResetAllToZero}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-semibold transition-colors cursor-pointer shadow-2xs"
            title="Reset all return inputs to zero"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Beverage Reconciliation Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Beverage Return Reconciliation</h2>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Verify crates returned for each dispatched beverage item
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500">{loadedPids.length} products on load sheet</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10.5px] border-b border-slate-200">
                <th className="py-2.5 px-3">Beverage Product</th>
                <th className="py-2.5 px-3 text-center">Loaded</th>
                <th className="py-2.5 px-3 text-center">Billed (Sold)</th>
                <th className="py-2.5 px-3 text-center">Expected Return</th>
                <th className="py-2.5 px-3 text-center">Actual Return</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loadedPids.map((pid) => {
                const prod = products.find((p) => p.id === pid);
                const loaded = trip.loaded[pid] || 0;
                const sold = soldByProduct[pid] || 0;
                const expected = Math.max(0, loaded - sold);
                const returned = Number(returnDraft[pid]) || 0;
                const rowDiscrepancy = loaded - sold - returned;

                return (
                  <tr key={pid} className="hover:bg-slate-50/70 transition-colors">
                    <td
                      className="py-2.5 px-3"
                      style={{ borderLeftWidth: 6, borderLeftStyle: 'solid', borderLeftColor: sizeTheme(prod?.volume, prod?.name).hex }}
                    >
                      <div className="font-bold text-slate-900 leading-snug">{prod?.name ? <OdiaName name={prod.name} nameOr={prod.nameOr} /> : `Product #${pid}`}</div>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <SizeChip volume={prod?.volume} name={prod?.name} pack={prod?.pack} />
                        {prod?.unitsPerCrate && (
                          <span className="text-[10.5px] font-bold text-slate-600 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                            {prod.unitsPerCrate} pcs/cs
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 capitalize">
                          · {prod?.category || 'General'}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-700">{loaded} cs</td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          sold > 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-400'
                        }`}
                      >
                        {sold} cs
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                      {expected} cs
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateReturn(pid, -1)}
                          className="size-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 cursor-pointer shadow-2xs"
                          title="Decrease 1 crate"
                        >
                          −
                        </button>
                        <input
                          type="number" inputMode="decimal"
                          min="0"
                          value={returnDraft[pid] || ''}
                          onChange={(e) => handleSetReturnDirect(pid, e.target.value)}
                          className="w-16 px-2 py-1 rounded-lg border border-slate-300 font-bold text-center text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateReturn(pid, 1)}
                          className="size-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 cursor-pointer shadow-2xs"
                          title="Increase 1 crate"
                        >
                          +
                        </button>
                        {returned !== expected && (
                          <button
                            type="button"
                            onClick={() => handleMatchExpectedSingle(pid)}
                            className="px-2 py-0.5 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 cursor-pointer ml-1"
                            title={`Match expected return (${expected} cs)`}
                          >
                            ={expected}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {rowDiscrepancy === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Balanced</span>
                        </span>
                      ) : rowDiscrepancy > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>−{rowDiscrepancy} Short</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <span>+{Math.abs(rowDiscrepancy)} Surplus</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reason for every shortage (needed to close the trip) */}
      {shortRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-rose-200 p-4 sm:p-5 shadow-xs space-y-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Why are these crates missing?</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pick a reason for each shortage before closing. Crates marked <strong>Broken</strong> are written off
              from stock automatically.
            </p>
          </div>
          <div className="space-y-2.5">
            {shortRows.map(({ pid, short }) => {
              const prod = products.find((p) => p.id === pid);
              const r = reasons[pid] || { reason: '' as const, note: '' };
              return (
                <div key={pid} className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">{prod?.name || `Product #${pid}`}</span>
                    <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                      {short} short
                    </span>
                  </div>
                  <select
                    value={r.reason}
                    onChange={(e) =>
                      setReasons((prev) => ({
                        ...prev,
                        [pid]: { reason: e.target.value as TripShortageReason | '', note: prev[pid]?.note || '' },
                      }))
                    }
                    aria-label={`Reason for shortage on ${prod?.name || pid}`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 cursor-pointer"
                  >
                    <option value="">Select a reason…</option>
                    <option value="broken">Broken (written off from stock)</option>
                    <option value="short_loaded">Short-loaded (never reached the van)</option>
                    <option value="sold_not_billed">Sold but not billed</option>
                    <option value="other">Other (note required)</option>
                  </select>
                  {r.reason === 'sold_not_billed' && (
                    <p className="text-[11px] text-amber-800">
                      Raise a bill for these crates so the sale and the customer's balance are recorded.
                    </p>
                  )}
                  {r.reason && (
                    <input
                      type="text"
                      value={r.note}
                      onChange={(e) =>
                        setReasons((prev) => ({ ...prev, [pid]: { reason: r.reason, note: e.target.value } }))
                      }
                      placeholder={r.reason === 'other' ? 'Note (required)' : 'Note (optional)'}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Money: billed / collected / dues, and the cash the salesman hands in */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-black text-slate-900">Collections on this trip</h2>
        {money.count === 0 ? (
          <p className="text-xs text-slate-500">No bills are assigned to this trip yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-slate-500 font-semibold">Billed ({money.count} bills)</div>
                <div className="text-base font-black text-slate-900">{inr(money.billed)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-slate-500 font-semibold">Collected</div>
                <div className="text-base font-black text-emerald-700">{inr(money.collected)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-slate-500 font-semibold">Still due</div>
                <div className="text-base font-black text-amber-800">{inr(money.dues)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-slate-500 font-semibold">Cash to hand in</div>
                <div className="text-base font-black text-slate-900">{inr(money.cashExpected)}</div>
              </div>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Cash handed in by the salesman (optional)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={cashIn}
                onChange={(e) => setCashIn(e.target.value)}
                placeholder={String(Math.round(money.cashExpected))}
                className="mt-1 w-full sm:w-56 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-900"
              />
            </label>
            {cashVariance !== null && (
              <p
                className={`text-xs font-bold ${cashVariance === 0 ? 'text-emerald-700' : 'text-rose-700'}`}
              >
                {cashVariance === 0
                  ? 'Cash matches what was collected.'
                  : cashVariance < 0
                    ? `Cash is short by ${inr(-cashVariance)}.`
                    : `Cash is ${inr(cashVariance)} more than recorded collections: check for a payment not entered.`}
              </p>
            )}
            {cashVariance !== null && cashVariance < 0 && (
              <label className="flex items-start gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bookShort}
                  onChange={(e) => setBookShort(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Record {inr(-cashVariance)} as owed by {trip.driver || trip.salesman || 'the salesman'} when the trip is
                  closed. It stays on the trips screen until repaid or written off.
                </span>
              </label>
            )}
          </>
        )}
      </div>

      {overReturns.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold space-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>More crates entered than can come back. The trip cannot be closed like this.</span>
          </div>
          {overReturns.map((o) => (
            <div key={o.productId} className="pl-6 font-semibold">{overText(o)}</div>
          ))}
        </div>
      )}

      {reasonError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{reasonError}</span>
        </div>
      )}

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-4 z-20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-lg">
        <div className="text-xs text-slate-600 font-semibold flex items-center gap-2">
          {netDiscrepancy === 0 ? (
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Ready to close: 0 discrepancy
            </span>
          ) : (
            <span className="text-amber-800 font-bold flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> {Math.abs(netDiscrepancy)} cases difference will be logged
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs sm:text-sm hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-emerald-700 text-emerald-800 font-bold text-xs sm:text-sm hover:bg-emerald-50 transition-colors cursor-pointer"
            title="Save returns now but keep trip in active status"
          >
            Save Draft Return
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={overReturns.length > 0}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Save & Close Trip</span>
          </button>
        </div>
      </div>
    </div>
  );
};
