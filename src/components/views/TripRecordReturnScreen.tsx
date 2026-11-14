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
  Minus,
  Plus,
  X,
} from 'lucide-react';
import { Bill, PaymentRecord, Product, Trip, TripShortageReason, Warehouse } from '../../types';
import { billBelongsToTrip } from '../../utils/billing';
import { billBalance } from '../../utils/salesReturns';
import { SizeChip } from '../common/SizeChip';
import { OdiaName } from '../common/OdiaName';
import { sizeTheme, compareProductsInSequence } from '../../utils/sizeColor';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ActionBar, StatsStrip, fieldBox } from './trips/LoadSheetParts';

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

/**
 * One product on the phone: the same facts as a table row (loaded / billed / should return / came back),
 * stacked in a card with big + / - buttons, like the cards on the Edit Load Sheet screen.
 */
const ReturnLineCard: React.FC<{
  pid: number;
  product?: Product;
  loaded: number;
  sold: number;
  value: string;
  onValue: (v: string) => void;
  onMinus: () => void;
  onPlus: () => void;
  onMatch: () => void;
}> = ({ pid, product, loaded, sold, value, onValue, onMinus, onPlus, onMatch }) => {
  const expected = Math.max(0, loaded - sold);
  const returned = Number(value) || 0;
  const diff = loaded - sold - returned;
  const name = product?.name || `Product #${pid}`;
  const tone = diff > 0 ? 'border-rose-300 bg-rose-50/60' : diff < 0 ? 'border-amber-300 bg-amber-50/60' : 'border-black/10 bg-white';
  const tile = 'rounded-xl border border-black/10 bg-white px-1 py-1.5 text-center';
  return (
    <div className={`rounded-2xl border p-3 ${tone}`} style={{ borderLeftWidth: 6, borderLeftColor: sizeTheme(product?.volume, product?.name).hex }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-slate-900 leading-snug break-words">
            {product?.name ? <OdiaName name={product.name} nameOr={product.nameOr} /> : name}
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <SizeChip volume={product?.volume} name={product?.name} pack={product?.pack} />
            {product?.unitsPerCrate ? (
              <span className="text-[10.5px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                {product.unitsPerCrate} pcs/cs
              </span>
            ) : null}
          </div>
        </div>
        {diff === 0 ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 size={13} /> OK
          </span>
        ) : diff > 0 ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-800 border border-rose-200">
            <AlertTriangle size={13} /> {diff} short
          </span>
        ) : (
          <span className="shrink-0 px-2 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-800 border border-amber-200">
            +{Math.abs(diff)} extra
          </span>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <div className={tile}>
          <div className="text-base font-black leading-tight tabular-nums text-slate-900">{loaded}</div>
          <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-500">Loaded</div>
        </div>
        <div className={tile}>
          <div className="text-base font-black leading-tight tabular-nums text-emerald-700">{sold}</div>
          <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-500">Billed</div>
        </div>
        <div className={tile}>
          <div className="text-base font-black leading-tight tabular-nums text-slate-900">{expected}</div>
          <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-500">Should return</div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Came back</div>
          {returned !== expected && (
            <button
              type="button"
              onClick={onMatch}
              className="mt-1 min-h-[36px] px-2.5 rounded-lg border border-emerald-300 bg-emerald-50 text-[12px] font-black text-emerald-800 cursor-pointer active:bg-emerald-100"
            >
              Same as should ({expected})
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onMinus}
            aria-label={`Less ${name}`}
            className="size-11 rounded-xl border border-black/15 bg-slate-50 flex items-center justify-center text-slate-700 active:scale-95 cursor-pointer"
          >
            <Minus size={18} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={value}
            onChange={(e) => onValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            aria-label={`Cases of ${name} that came back`}
            className="w-16 h-11 text-center rounded-xl border-2 border-[var(--primary)]/40 bg-white text-lg font-black tabular-nums text-slate-900 focus:outline-none focus:border-[var(--primary)]"
          />
          <button
            type="button"
            onClick={onPlus}
            aria-label={`More ${name}`}
            className="size-11 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center active:scale-95 cursor-pointer"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

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
  // Card layout up to 767 px (phones and small tablets); the table needs more room than that to breathe.
  const isMobile = useIsMobile(767);
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
    const prodMap = new Map(products.map((p) => [p.id, p]));
    return Object.keys(trip.loaded || {})
      .map(Number)
      .sort((a, b) =>
        compareProductsInSequence(
          prodMap.get(a) || { name: `Product #${a}` },
          prodMap.get(b) || { name: `Product #${b}` },
        ),
      );
  }, [trip.loaded, products]);

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
  const missingReasonsCount = shortRows.filter(({ pid }) => {
    const r = reasons[pid];
    return !r || !r.reason || (r.reason === 'other' && !r.note.trim());
  }).length;

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

  // ---------------------------------------------------------------------------------------------
  // PHONE LAYOUT: the same screen as the Edit Load Sheet one (full screen, cards, big bottom bar).
  // Every number and rule comes from the code above; only the layout differs from the desktop table.
  // ---------------------------------------------------------------------------------------------
  if (isMobile) {
    const chip =
      'shrink-0 min-h-[44px] px-3.5 rounded-full border text-[13px] font-bold whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 bg-white text-slate-800 border-black/15 active:bg-slate-100';
    const stateTone =
      netDiscrepancy === 0
        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
        : netDiscrepancy > 0
          ? 'border-rose-300 bg-rose-50 text-rose-900'
          : 'border-amber-300 bg-amber-50 text-amber-900';
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#faf8f5] animate-in fade-in duration-150" id="trip-return-screen">
        <div className="shrink-0 border-b border-black/10 bg-[#faf8f5] pt-[env(safe-area-inset-top,0px)]">
          <div className="mx-auto max-w-xl px-3 py-2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to trips"
              className="size-11 shrink-0 rounded-xl border border-black/15 bg-white flex items-center justify-center text-slate-700 cursor-pointer"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-[17px] font-black text-slate-900 leading-tight truncate">Return &amp; Settle</h1>
              <p className="text-xs text-slate-500 truncate">
                Trip #{trip.id} · {trip.vehicle} · {trip.date}
              </p>
            </div>
            <span
              className={`text-[10.5px] font-black px-2.5 py-1 rounded-full border ${
                trip.status === 'closed'
                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {trip.status === 'closed' ? 'Completed' : 'Active'}
            </span>
          </div>
        </div>

        <div id="trip-return-scroll" className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-xl px-3 pt-3 pb-6 space-y-3">
            {/* Who / where the crates go back to */}
            <section className="rounded-2xl border border-black/10 bg-white p-3 space-y-1.5 text-[13px]">
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-500 shrink-0">Salesman</span>
                <strong className="text-slate-900 text-right break-words min-w-0">{trip.salesman || 'Unassigned'}</strong>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-500 shrink-0 inline-flex items-center gap-1">
                  <Building2 size={14} className="text-emerald-700" /> Unsold crates go to
                </span>
                <strong className="text-slate-900 text-right break-words min-w-0">{targetGodown?.name || 'Main Godown'}</strong>
              </div>
            </section>

            <StatsStrip
              items={[
                { label: 'Loaded', value: String(totalLoaded) },
                { label: 'Billed', value: String(totalSold), tone: 'green' },
                { label: 'Should return', value: String(totalExpected) },
                { label: 'Came back', value: String(totalActualReturn), tone: 'green' },
              ]}
            />

            <div className={`rounded-2xl border p-3 flex items-start gap-2 text-[13px] font-bold ${stateTone}`} role="status">
              {netDiscrepancy === 0 ? (
                <CheckCircle2 size={17} className="shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={17} className="shrink-0 mt-0.5" />
              )}
              <span>
                {netDiscrepancy === 0
                  ? 'All crates are accounted for.'
                  : netDiscrepancy > 0
                    ? `${netDiscrepancy} cases are short. You will be asked why before closing.`
                    : `${Math.abs(netDiscrepancy)} extra cases came back.`}
              </span>
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              <button type="button" onClick={handleFillAllExpected} className={chip}>
                <Sparkles size={15} className="text-emerald-600" /> Fill all as should
              </button>
              <button type="button" onClick={handleResetAllToZero} className={chip}>
                <RotateCcw size={15} /> Set all to 0
              </button>
              {onEditTrip && (
                <button type="button" onClick={() => onEditTrip(trip)} className={chip}>
                  <Pencil size={15} /> Edit load sheet
                </button>
              )}
            </div>

            {/* One card per product */}
            <section className="space-y-2" aria-label="Crates that came back">
              <h2 className="text-[13px] font-black text-slate-900 px-0.5">
                Step 1 · Crates that came back <span className="text-slate-400 font-bold">· {loadedPids.length} products</span>
              </h2>
              {loadedPids.length === 0 && (
                <div className="rounded-2xl border border-dashed border-black/20 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  Nothing was loaded on this trip.
                </div>
              )}
              {loadedPids.map((pid) => (
                <ReturnLineCard
                  key={pid}
                  pid={pid}
                  product={products.find((p) => p.id === pid)}
                  loaded={trip.loaded[pid] || 0}
                  sold={soldByProduct[pid] || 0}
                  value={returnDraft[pid] ?? ''}
                  onValue={(v) => handleSetReturnDirect(pid, v)}
                  onMinus={() => handleUpdateReturn(pid, -1)}
                  onPlus={() => handleUpdateReturn(pid, 1)}
                  onMatch={() => handleMatchExpectedSingle(pid)}
                />
              ))}
            </section>

            {/* Why crates are missing (needed to close the trip) */}
            {shortRows.length > 0 && (
              <section className="rounded-2xl border border-rose-200 bg-white p-3 space-y-2.5">
                <div>
                  <h2 className="text-[13px] font-black text-slate-900">Step 2 · Why are these crates missing?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pick a reason for each one before closing. <strong>Broken</strong> crates are written off from stock.
                  </p>
                </div>
                {shortRows.map(({ pid, short }) => {
                  const prod = products.find((p) => p.id === pid);
                  const r = reasons[pid] || { reason: '' as const, note: '' };
                  return (
                    <div key={pid} className="rounded-xl border border-slate-200 p-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[14px] font-bold text-slate-900 break-words min-w-0">{prod?.name || `Product #${pid}`}</span>
                        <span className="shrink-0 text-xs font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
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
                        className={`${fieldBox} cursor-pointer`}
                      >
                        <option value="">Select a reason…</option>
                        <option value="broken">Broken (written off from stock)</option>
                        <option value="short_loaded">Short-loaded (never reached the van)</option>
                        <option value="sold_not_billed">Sold but not billed</option>
                        <option value="other">Other (note required)</option>
                      </select>
                      {r.reason === 'sold_not_billed' && (
                        <p className="text-[12px] font-semibold text-amber-800">
                          Raise a bill for these crates so the sale and the customer's balance are recorded.
                        </p>
                      )}
                      {r.reason && (
                        <input
                          type="text"
                          value={r.note}
                          onChange={(e) => setReasons((prev) => ({ ...prev, [pid]: { reason: r.reason, note: e.target.value } }))}
                          placeholder={r.reason === 'other' ? 'Note (required)' : 'Note (optional)'}
                          className={fieldBox}
                        />
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* Money: billed / collected / due, and the cash handed in */}
            <section className="rounded-2xl border border-black/10 bg-white p-3 space-y-2.5">
              <h2 className="text-[13px] font-black text-slate-900">
                {shortRows.length > 0 ? 'Step 3' : 'Step 2'} · Collections &amp; Cash on this trip
              </h2>
              {money.count === 0 ? (
                <p className="text-xs text-slate-500">No bills are assigned to this trip yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                      <div className="text-[11px] text-slate-500 font-bold">Billed ({money.count} bills)</div>
                      <div className="text-[17px] font-black text-slate-900 tabular-nums">{inr(money.billed)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                      <div className="text-[11px] text-slate-500 font-bold">Collected</div>
                      <div className="text-[17px] font-black text-emerald-700 tabular-nums">{inr(money.collected)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                      <div className="text-[11px] text-slate-500 font-bold">Still due</div>
                      <div className="text-[17px] font-black text-amber-800 tabular-nums">{inr(money.dues)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                      <div className="text-[11px] text-slate-500 font-bold">Cash to hand in</div>
                      <div className="text-[17px] font-black text-slate-900 tabular-nums">{inr(money.cashExpected)}</div>
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
                      className={`${fieldBox} mt-1`}
                    />
                  </label>
                  {cashVariance !== null && (
                    <p className={`text-[13px] font-bold ${cashVariance === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {cashVariance === 0
                        ? 'Cash matches what was collected.'
                        : cashVariance < 0
                          ? `Cash is short by ${inr(-cashVariance)}.`
                          : `Cash is ${inr(cashVariance)} more than recorded collections: check for a payment not entered.`}
                    </p>
                  )}
                  {cashVariance !== null && cashVariance < 0 && (
                    <label className="flex items-start gap-2.5 text-[13px] font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bookShort}
                        onChange={(e) => setBookShort(e.target.checked)}
                        className="mt-0.5 size-5 shrink-0 rounded accent-[var(--primary)]"
                      />
                      <span>
                        Record {inr(-cashVariance)} as owed by {trip.driver || trip.salesman || 'the salesman'} when the trip is closed. It
                        stays on the trips screen until repaid or written off.
                      </span>
                    </label>
                  )}
                </>
              )}
            </section>

            {overReturns.length > 0 && (
              <div role="alert" className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-[13px] font-bold space-y-1">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={17} className="shrink-0 mt-0.5 text-rose-600" />
                  <span>More crates entered than can come back. The trip cannot be closed like this.</span>
                </div>
                {overReturns.map((o) => (
                  <div key={o.productId} className="pl-6 font-semibold">
                    {overText(o)}
                  </div>
                ))}
              </div>
            )}

            {reasonError && (
              <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-[13px] font-bold">
                <AlertTriangle size={17} className="shrink-0 mt-0.5 text-rose-600" />
                <span>{reasonError}</span>
              </div>
            )}
          </div>
        </div>

        <ActionBar
          actions={[
            { key: 'cancel', label: 'Cancel', icon: <X size={20} />, tone: 'cancel', onClick: onBack, id: 'btn-trip-return-cancel' },
            { key: 'draft', label: 'Save draft', icon: <Save size={20} />, tone: 'neutral', onClick: () => handleSubmit(false), grow: 1.2, id: 'btn-trip-return-draft' },
            {
              key: 'close',
              label: 'Save & close',
              icon: <CheckCircle2 size={20} />,
              tone: 'primary',
              onClick: () => handleSubmit(true),
              disabled: overReturns.length > 0,
              grow: 1.5,
              id: 'btn-trip-return-close',
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="max-w-none lg:max-w-5xl mx-auto space-y-6 pb-36 sm:pb-20 animate-in fade-in duration-200">
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
            <h2 className="text-sm font-extrabold text-slate-900">Step 1 · Beverage Return Reconciliation</h2>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Verify crates returned for each dispatched beverage item
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500">{loadedPids.length} products on load sheet</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[620px] text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10.5px] border-b border-slate-200">
                <th className="py-2.5 px-3 min-w-[150px]">Beverage Product</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Loaded</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Billed (Sold)</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Expected Return</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Actual Return</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
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
            <h2 className="text-sm font-extrabold text-slate-900">Step 2 · Why are these crates missing?</h2>
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
        <h2 className="text-sm font-black text-slate-900">
          {shortRows.length > 0 ? 'Step 3' : 'Step 2'} · Collections &amp; Cash on this trip
        </h2>
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

      {/* Sticky Bottom Action Bar — hovers cleanly above mobile floating nav */}
      <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-4 z-40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-lg">
        <div className="text-xs text-slate-600 font-semibold flex items-center gap-2">
          {overReturns.length > 0 ? (
            <span className="text-rose-700 font-bold flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Fix over-return count before closing
            </span>
          ) : missingReasonsCount > 0 ? (
            <span className="text-amber-800 font-bold flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Pick shortage reason for {missingReasonsCount} item{missingReasonsCount === 1 ? '' : 's'} to close
            </span>
          ) : netDiscrepancy === 0 ? (
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Ready to close: 0 discrepancy
            </span>
          ) : (
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Ready to close ({Math.abs(netDiscrepancy)} cases difference explained)
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
