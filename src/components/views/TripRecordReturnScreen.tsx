import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Pencil, Save } from 'lucide-react';
import { Bill, PaymentRecord, Product, Trip, TripShortageInput, TripShortageReason, Warehouse } from '../../types';
import { useLedger } from '../../context/LedgerContext';
import { billBelongsToTrip } from '../../utils/billing';
import { billBalance } from '../../utils/salesReturns';
import { describeOverReturn, findOverReturns } from '../../utils/tripReturns';
import { compareProductsInSequence } from '../../utils/sizeColor';
import { PackIcon } from '../common/PackIcon';
import { SizeChip } from '../common/SizeChip';
import { OdiaName } from '../common/OdiaName';
import {
  FlowBadge,
  FlowFooter,
  FlowHeader,
  FlowMetric,
  FlowStepper,
  flowBtn,
  flowFooterPrimary,
  flowFooterSecondary,
} from '../common/FlowKit';
import { useCloseTrip } from './trips/useCloseTrip';

interface TripRecordReturnScreenProps {
  trip: Trip;
  products: Product[];
  bills: Bill[];
  warehouses?: Warehouse[];
  payments?: PaymentRecord[];
  onBack: () => void;
  /**
   * Called with what the person entered. For a close, `tripExpense` is the fuel / toll / loading paid out of
   * the trip cash; the caller closes the trip with `useCloseTrip().closeTrip` so it also reaches the ledger.
   * A text result = the save was refused; it is shown to the person.
   */
  onSaveReturn: (
    tripId: number,
    finalReturn: Record<number, number>,
    closeTrip: boolean,
    shortageReasons?: Record<number, TripShortageInput>,
    cashHandedIn?: number | null,
    cashShortBooked?: number | null,
    tripExpense?: { amount: number; note?: string },
  ) => string | null | void;
  onEditTrip?: (trip: Trip) => void;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const cents = (n: number) => Math.round(n * 100);

const PLAIN_REASONS: { id: TripShortageReason; label: string }[] = [
  { id: 'sold_not_billed', label: 'Sold but not billed' },
  { id: 'short_loaded', label: 'Short loaded' },
  { id: 'other', label: 'Other (add note)' },
];

/** What each reason does to book stock when the trip closes (shown under the reason chips). */
const REASON_STOCK_NOTE: Record<string, string> = {
  sold_not_billed: 'These crates are taken out of stock (a loss is booked) because they left the godown.',
  short_loaded: 'Stock stays as it is: these crates never left the godown.',
  other: 'These crates are taken out of stock (a loss is booked). Add a note.',
};

const REASON_LABEL: Record<string, string> = {
  sold_not_billed: 'Sold but not billed',
  short_loaded: 'Short loaded',
  other: 'Other',
  broken: 'Damaged / leakage',
};

/**
 * "Save draft" keeps the good counts on the trip (`draftReturned`), which is all the trip record has room for.
 * The damaged counts, the reasons, the expense and the remarks are kept here, on this device, so reopening the
 * draft shows everything that was typed. They are only used while the saved good counts still match, so a draft
 * changed on another phone is never mixed with stale numbers.
 */
interface DraftExtras {
  good: Record<number, string>;
  damaged: Record<number, string>;
  reasons: Record<number, { reason: TripShortageReason | ''; note: string }>;
  expense: string;
  remarks: string;
  bookShort: boolean;
  /** The person confirmed the counts were checked against the van (see `counted` on the screen). */
  counted?: boolean;
}
const draftKey = (id: number | string) => `mrwater.closeTripDraft.${id}`;
const readDraft = (id: number | string): DraftExtras | null => {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as DraftExtras) : null;
  } catch {
    return null;
  }
};
const writeDraft = (id: number | string, d: DraftExtras) => {
  try {
    window.localStorage.setItem(draftKey(id), JSON.stringify(d));
  } catch {
    /* storage full / blocked: the good counts are still saved on the trip */
  }
};
const clearDraft = (id: number | string) => {
  try {
    window.localStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
};
const draftMatchesTrip = (d: DraftExtras | null, trip: Trip): d is DraftExtras => {
  const saved = trip.draftReturned || {};
  if (!d || Object.keys(saved).length === 0) return false;
  return Object.keys(saved).every((pid) => Number(d.good?.[Number(pid)]) === Number(saved[Number(pid)]));
};

const inputCls =
  'w-full min-w-0 min-h-[44px] px-3 rounded-xl border border-gray-300 bg-white text-[15px] font-semibold text-slate-900 focus:outline-none focus:border-[var(--flow-accent)] disabled:bg-gray-100';

/**
 * Close Trip, in two steps.
 *   Step 1 – unsold & damaged stock return (good → godown, damaged → spoilage write-off)
 *   Step 2 – cash & ledger reconciliation (expected cash, trip expenses, cash handed over)
 * Stock and money are saved through the existing saveReturn path, so godown stock, spoilage, dues and
 * salesman cash-short tracking all keep working on the same data as before.
 */
export const TripRecordReturnScreen: React.FC<TripRecordReturnScreenProps> = ({
  trip,
  products,
  bills,
  payments = [],
  onBack,
  onSaveReturn,
  onEditTrip,
}) => {
  const { trips } = useLedger();
  const { postedTripExpense } = useCloseTrip();
  const closed = trip.status === 'closed';

  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  // Typed-but-not-closed values from this device (see DraftExtras); only for an open trip whose saved counts match.
  const [savedDraft] = useState<DraftExtras | null>(() => {
    if (trip.status === 'closed') return null;
    const d = readDraft(trip.id);
    return draftMatchesTrip(d, trip) ? d : null;
  });

  /* ------------------------------ stock ------------------------------ */
  const soldMap = useMemo(() => {
    const res: Record<number, number> = {};
    for (const b of bills) {
      if (b.status === 'cancelled' || !billBelongsToTrip(trip, b)) continue;
      for (const it of b.items || []) res[Number(it.productId)] = (res[Number(it.productId)] || 0) + (Number(it.qty) || 0);
    }
    return res;
  }, [bills, trip]);

  const pids = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return Object.keys(trip.loaded || {})
      .map(Number)
      .sort((a, b) =>
        compareProductsInSequence(byId.get(a) || { name: `Product #${a}` }, byId.get(b) || { name: `Product #${b}` }),
      );
  }, [trip.loaded, products]);

  const expectedOf = (pid: number) => Math.max(0, (Number(trip.loaded?.[pid]) || 0) - (soldMap[pid] || 0));

  // Start from what is on record: a closed trip shows its recorded counts, an open one its saved draft, else "all came back good".
  const [good, setGood] = useState<Record<number, string>>(() => {
    const src = closed ? trip.returned || {} : trip.draftReturned || {};
    const init: Record<number, string> = {};
    for (const pid of Object.keys(trip.loaded || {}).map(Number)) {
      const e = Math.max(0, (Number(trip.loaded[pid]) || 0) - (soldMap[pid] || 0));
      init[pid] = String(src[pid] !== undefined ? src[pid] : closed ? 0 : e);
    }
    return init;
  });
  const [damaged, setDamaged] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const pid of Object.keys(trip.loaded || {}).map(Number)) {
      const s = trip.shortageReasons?.[pid];
      init[pid] = closed && s?.reason === 'broken' ? String(s.qty || 0) : savedDraft?.damaged?.[pid] ?? '0';
    }
    return init;
  });
  const [reasons, setReasons] = useState<Record<number, { reason: TripShortageReason | ''; note: string }>>(() => {
    const init: Record<number, { reason: TripShortageReason | ''; note: string }> = {};
    for (const [pid, e] of Object.entries(trip.shortageReasons || {})) {
      if (e.reason !== 'broken') init[Number(pid)] = { reason: e.reason, note: e.note || '' };
      else if (e.missing) init[Number(pid)] = { reason: e.missing.reason, note: e.missing.note || '' };
    }
    if (!closed && savedDraft?.reasons) for (const [pid, e] of Object.entries(savedDraft.reasons)) init[Number(pid)] = e;
    return init;
  });

  // The good counts start as "everything came back". Until the person changes a count or ticks the confirmation,
  // Next is blocked, so a screen that was never counted cannot close the trip with a clean result by accident.
  const [counted, setCounted] = useState<boolean>(() => closed || savedDraft?.counted === true);

  const rows = useMemo(
    () =>
      pids.map((pid) => {
        const loaded = Number(trip.loaded?.[pid]) || 0;
        const sold = soldMap[pid] || 0;
        const expected = Math.max(0, loaded - sold);
        const g = num(good[pid] ?? '0');
        const d = num(damaged[pid] ?? '0');
        const diff = expected - g - d; // > 0 missing, < 0 counted more than expected
        return { pid, loaded, sold, expected, g, d, diff };
      }),
    [pids, trip.loaded, soldMap, good, damaged],
  );

  const nameOf = (pid: number) => products.find((p) => p.id === pid)?.name || `Product #${pid}`;

  /** Why step 1 cannot move on yet (null = fine). */
  const stockProblem = (): string | null => {
    const goodMap: Record<number, number> = {};
    rows.forEach((r) => (goodMap[r.pid] = r.g));
    const over = findOverReturns(trip, bills, goodMap);
    if (over.length) return over.map((o) => describeOverReturn(o, nameOf(o.productId))).join(' ');
    for (const r of rows) {
      if (r.diff < 0) return `${nameOf(r.pid)}: good + damaged is ${-r.diff} more than the ${r.expected} cases that should be back.`;
      if (r.diff > 0) {
        const why = reasons[r.pid];
        if (!why?.reason) return `${nameOf(r.pid)}: choose why ${r.diff} cases are missing.`;
        if (why.reason === 'other' && !why.note.trim()) return `${nameOf(r.pid)}: add a short note for the missing cases.`;
      }
    }
    if (!closed && !counted && rows.some((r) => r.expected > 0))
      return 'The counts still say "everything came back". Count the crates in the van, then change a count or tick "I counted the crates".';
    return null;
  };

  const totals = rows.reduce(
    (t, r) => ({ loaded: t.loaded + r.loaded, sold: t.sold + r.sold, good: t.good + r.g, damaged: t.damaged + r.d }),
    { loaded: 0, sold: 0, good: 0, damaged: 0 },
  );

  /* ------------------------------ money ------------------------------ */
  const money = useMemo(() => {
    const mine = bills.filter((b) => b.status !== 'cancelled' && billBelongsToTrip(trip, b));
    const ids = new Set(mine.map((b) => b.id));
    let gross = 0;
    let collected = 0;
    let credit = 0;
    for (const b of mine) {
      gross += Number(b.total) || 0;
      collected += Number(b.amountPaid) || 0;
      credit += Math.max(0, billBalance(b));
    }
    // Cash on the trip's bills: individual receipts when recorded, else each bill's own payment mode.
    const receipts = payments.filter((p) => p.billId != null && ids.has(p.billId) && !p.isAdvance && !p.isRefund);
    const cashOnBills = receipts.length
      ? receipts.filter((p) => p.mode === 'cash').reduce((s, p) => s + (Number(p.amount) || 0), 0)
      : mine.filter((b) => b.paymentMode === 'cash').reduce((s, b) => s + (Number(b.amountPaid) || 0), 0);
    const nonCash = Math.max(0, collected - cashOnBills);

    // Old dues: cash this salesman collected on the trip date that is not on this trip's bills. If he ran two trips
    // that day it is counted on the first one only, so it can never be asked for twice.
    const sameDay = trips
      .filter(
        (t) =>
          (t.date || '').slice(0, 10) === (trip.date || '').slice(0, 10) &&
          ((trip.salesmanId && t.salesmanId === trip.salesmanId) || (!trip.salesmanId && t.salesman === trip.salesman)),
      )
      .sort((a, b) => Number(a.id) - Number(b.id));
    const isFirstOfDay = !sameDay.length || Number(sameDay[0].id) === Number(trip.id);
    const oldDue = isFirstOfDay
      ? payments
          .filter(
            (p) =>
              p.mode === 'cash' &&
              (p.paymentDate || '').slice(0, 10) === (trip.date || '').slice(0, 10) &&
              !(p.billId != null && ids.has(p.billId)) &&
              ((trip.salesmanId && p.salesmanId === trip.salesmanId) ||
                (!p.salesmanId && !!trip.salesman && p.recordedBy === trip.salesman)),
          )
          .reduce((s, p) => s + (Number(p.amount) || 0), 0)
      : 0;
    const adjust = gross - credit - nonCash - cashOnBills; // returns / discounts etc. that are neither cash nor credit
    return { gross, credit, nonCash, oldDue, adjust, expectedCash: cashOnBills + oldDue };
  }, [bills, payments, trip, trips]);

  const [expenseText, setExpenseText] = useState(() =>
    closed ? String(postedTripExpense(trip.id) || '') : savedDraft?.expense ?? '',
  );
  const [actualText, setActualText] = useState(() => (trip.cashHandedIn != null ? String(trip.cashHandedIn) : ''));
  const [remarks, setRemarks] = useState(() => savedDraft?.remarks ?? '');
  const [bookShort, setBookShort] = useState(() => savedDraft?.bookShort ?? true);

  const expense = num(expenseText);
  const netExpected = money.expectedCash - expense;
  const hasActual = actualText.trim() !== '';
  const actual = num(actualText);
  const diff = cents(actual) - cents(netExpected); // < 0 short, > 0 excess

  /* ------------------------------ save ------------------------------ */
  const buildReturn = () => {
    const finalReturn: Record<number, number> = {};
    rows.forEach((r) => (finalReturn[r.pid] = r.g));
    return finalReturn;
  };

  const saveDraft = () => {
    setError(null);
    writeDraft(trip.id, { good, damaged, reasons, expense: expenseText, remarks, bookShort, counted });
    const refused = onSaveReturn(trip.id, buildReturn(), false, undefined, hasActual ? actual : null);
    if (typeof refused === 'string' && refused) setError(refused);
  };

  const goStep2 = () => {
    const p = stockProblem();
    if (p) {
      setError(p);
      // Take the person to the first product that needs attention.
      const first = rows.find((r) => r.diff !== 0);
      const target = first ? `close-row-${first.pid}` : 'close-counted-check';
      document.getElementById(target)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    setError(null);
    setStep(2);
    document.getElementById('close-trip-scroll')?.scrollTo({ top: 0 });
  };

  const closeTrip = () => {
    const p = stockProblem();
    if (p) {
      setStep(1);
      setError(p);
      return;
    }
    if (!hasActual) {
      setError('Enter the cash handed over (enter 0 if none).');
      return;
    }
    const picked: Record<number, { reason: TripShortageReason; note?: string }> = {};
    for (const r of rows) {
      if (r.diff > 0 && reasons[r.pid]?.reason) {
        // Damaged crates (if any) and the missing ones each get their own stock write-off.
        picked[r.pid] = {
          reason: reasons[r.pid].reason as TripShortageReason,
          note: reasons[r.pid].note.trim() || undefined,
          ...(r.d > 0 ? { damaged: r.d } : {}),
        };
      } else if (r.d > 0 && r.diff === 0) {
        picked[r.pid] = { reason: 'broken', note: `Trip #${trip.id}: ${r.d} damaged / leakage` };
      }
    }
    const booked = diff < 0 && bookShort ? Math.round(-diff) / 100 : null;
    const note = [remarks.trim(), diff < 0 ? `cash short ${inr(-diff / 100)}` : ''].filter(Boolean).join('; ') || undefined;
    setError(null);
    const refused = onSaveReturn(trip.id, buildReturn(), true, picked, actual, booked, { amount: expense, note });
    if (typeof refused === 'string' && refused) setError(refused);
    else clearDraft(trip.id);
  };

  /* ------------------------------ render ------------------------------ */
  const salesman = trip.salesman || 'Unassigned';
  const issues = rows.filter((r) => r.diff !== 0).length;

  // One shape for every card on this screen (the app theme gives white cards a 22px radius + soft shadow;
  // the red "needs attention" card must have exactly the same shape or the list looks uneven).
  const cardShape = 'min-w-0 rounded-[var(--r-card)] shadow-[var(--shadow)]';
  const card = `${cardShape} bg-white border border-[var(--border)] p-4`;

  const Step1 = (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <FlowMetric label="Loaded" value={totals.loaded} />
        <FlowMetric label="Sold" value={totals.sold} tone="good" />
        <FlowMetric label="Good" value={totals.good} tone="good" />
        <FlowMetric label="Damaged" value={totals.damaged} tone={totals.damaged ? 'bad' : 'ink'} />
      </div>
      {!closed && rows.some((r) => r.expected > 0) && (
        <label
          id="close-counted-check"
          className={`${cardShape} sticky top-0 z-10 flex items-start gap-3 border p-3 min-h-[44px] cursor-pointer text-[13px] ${
            counted ? 'border-[var(--border)] bg-white text-slate-700' : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <input
            type="checkbox"
            checked={counted}
            onChange={(e) => setCounted(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--flow-accent)]"
          />
          <span className="min-w-0">
            <strong className="block">I counted the crates in the van</strong>
            {counted
              ? 'The counts below are confirmed.'
              : 'The counts below start as “everything came back”. Tick this if they are right, or change a count.'}
          </span>
        </label>
      )}
      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">
          Nothing was loaded on this trip.
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 items-start">
        {rows.map((r) => {
          const p = products.find((x) => x.id === r.pid);
          const bad = r.diff !== 0;
          const why = reasons[r.pid] || { reason: '' as const, note: '' };
          return (
            <div
              key={r.pid}
              id={`close-row-${r.pid}`}
              className={`${cardShape} p-3 space-y-3 border ${
                bad ? 'border-red-400 ring-1 ring-red-400 bg-red-50' : 'border-[var(--border)] bg-white'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <PackIcon size="sm" pack={p?.pack} name={p?.name} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-slate-900 leading-snug break-words">
                    {p ? <OdiaName name={p.name} nameOr={p.nameOr} /> : nameOf(r.pid)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <SizeChip volume={p?.volume} name={p?.name} pack={p?.pack} />
                    {p?.unitsPerCrate ? (
                      <span className="text-xs font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{p.unitsPerCrate} pcs/cs</span>
                    ) : null}
                  </div>
                </div>
              </div>

              {bad && (
                <div className="flex items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-black text-red-700">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span className="min-w-0">
                    Stock variance: {Math.abs(r.diff)} {Math.abs(r.diff) === 1 ? 'case' : 'cases'}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <FlowMetric label="Loaded" value={r.loaded} />
                <FlowMetric label="Sold" value={r.sold} tone="good" />
                <FlowMetric label="Due back" value={r.expected} />
              </div>

              {/* Phones narrower than 400px stack the two counters, so each keeps full-size buttons. */}
              <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
                <FlowStepper
                  label="Good to godown"
                  name={nameOf(r.pid)}
                  value={good[r.pid] ?? '0'}
                  disabled={closed}
                  onChange={(v) => {
                    setCounted(true);
                    setGood((s) => ({ ...s, [r.pid]: v }));
                  }}
                />
                <FlowStepper
                  label="Damaged / leakage"
                  name={nameOf(r.pid)}
                  value={damaged[r.pid] ?? '0'}
                  disabled={closed}
                  onChange={(v) => {
                    setCounted(true);
                    setDamaged((s) => ({ ...s, [r.pid]: v }));
                  }}
                />
              </div>

              {!closed && r.diff > 0 && (
                <div className="space-y-2 border-t border-red-200 pt-2.5">
                  <div className="text-xs font-bold text-red-700">
                    {r.diff} {r.diff === 1 ? 'case is' : 'cases are'} missing{r.d > 0 ? ` (besides the ${r.d} damaged)` : ''}. Why?
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PLAIN_REASONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setReasons((s) => ({ ...s, [r.pid]: { reason: o.id, note: s[r.pid]?.note || '' } }))}
                        aria-pressed={why.reason === o.id}
                        className={`min-h-[44px] max-w-full px-3 rounded-full border text-xs font-bold cursor-pointer ${
                          why.reason === o.id
                            ? 'bg-[var(--flow-accent)] text-white border-[var(--flow-accent)]'
                            : 'bg-white text-slate-700 border-gray-300'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setDamaged((s) => ({ ...s, [r.pid]: String(r.d + r.diff) }))}
                      className="min-h-[44px] max-w-full px-3 rounded-full border border-red-300 bg-white text-red-700 text-xs font-bold cursor-pointer"
                    >
                      Mark {r.diff} as damaged
                    </button>
                  </div>
                  {why.reason && REASON_STOCK_NOTE[why.reason] && (
                    <p className="text-xs text-slate-600">{REASON_STOCK_NOTE[why.reason]}</p>
                  )}
                  {why.reason === 'other' && (
                    <input
                      value={why.note}
                      onChange={(e) => setReasons((s) => ({ ...s, [r.pid]: { reason: 'other', note: e.target.value } }))}
                      placeholder="Short note"
                      className={`${inputCls} text-sm`}
                    />
                  )}
                </div>
              )}
              {r.diff < 0 && <p className="text-xs font-bold text-red-700">Good + damaged is {-r.diff} more than expected.</p>}
              {closed && r.diff > 0 && reasons[r.pid]?.reason && (
                <p className="text-xs font-bold text-red-700 break-words">
                  Reason recorded: {REASON_LABEL[reasons[r.pid].reason as string] || reasons[r.pid].reason}
                  {reasons[r.pid].note ? ` — ${reasons[r.pid].note}` : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const row = (label: string, value: string, tone = 'text-slate-700') => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 text-slate-600">{label}</span>
      <span className={`shrink-0 font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );

  const pill = !hasActual
    ? { cls: 'bg-gray-100 text-gray-600', text: 'Enter the cash handed over' }
    : diff === 0
      ? { cls: 'bg-[var(--flow-accent-soft)] text-[var(--flow-accent-hover)] border border-[var(--flow-accent)]', text: '✓ Balanced (₹0 difference)' }
      : diff < 0
        ? { cls: 'bg-red-100 text-red-700', text: `⚠ Cash short by ${inr(-diff / 100)}` }
        : { cls: 'bg-amber-100 text-amber-800', text: `+ Excess cash: ${inr(diff / 100)}` };

  const fieldLabelCls = 'block mb-1 text-xs font-bold text-slate-600';

  const Step2 = (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 items-start">
      <section className={`${card} space-y-2.5`}>
        <h3 className="text-[15px] font-black text-slate-900">Trip financial breakdown</h3>
        {row('Gross trip sales', inr(money.gross))}
        {row('Less: Credit sales', `-${inr(money.credit)}`, 'text-red-700')}
        {row('Less: UPI / Bank payments', `-${inr(money.nonCash)}`, 'text-red-700')}
        {Math.abs(money.adjust) >= 1 &&
          row(
            money.adjust > 0 ? 'Less: Returns / other adjustments' : 'Plus: Other adjustments',
            `${money.adjust > 0 ? '-' : '+'}${inr(Math.abs(money.adjust))}`,
            money.adjust > 0 ? 'text-red-700' : 'text-[var(--flow-accent)]',
          )}
        {row('Plus: Old due cash collected', `+${inr(money.oldDue)}`, 'text-[var(--flow-accent)]')}
        <div className="border-t border-gray-200 pt-2.5 flex items-baseline justify-between gap-3">
          <strong className="min-w-0 text-[15px] text-slate-900">Expected cash in hand</strong>
          <strong className="shrink-0 text-[17px] tabular-nums text-slate-900">{inr(money.expectedCash)}</strong>
        </div>
      </section>

      <section className={`${card} space-y-3`}>
        <h3 className="text-[15px] font-black text-slate-900">Cash handover &amp; expense settlement</h3>
        <div>
          <label htmlFor="trip-expenses" className={fieldLabelCls}>
            Trip expenses (fuel / toll / loading)
          </label>
          <input
            id="trip-expenses"
            inputMode="decimal"
            value={expenseText}
            disabled={closed}
            onChange={(e) => setExpenseText(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            className={inputCls}
          />
        </div>
        {row('Net expected cash', inr(netExpected), 'text-slate-900')}
        <div>
          <label htmlFor="trip-actual-cash" className={fieldLabelCls}>
            Actual cash handed over
          </label>
          <input
            id="trip-actual-cash"
            inputMode="decimal"
            value={actualText}
            disabled={closed}
            onChange={(e) => setActualText(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="₹0"
            className="w-full min-w-0 min-h-[48px] px-3 rounded-xl border-2 border-[var(--flow-accent)]/50 bg-white text-lg font-bold text-slate-900 focus:outline-none focus:border-[var(--flow-accent)] disabled:bg-gray-100"
          />
        </div>
        <div role="status" className={`rounded-xl px-3 py-2.5 text-sm font-black break-words ${pill.cls}`}>
          {pill.text}
        </div>
        {!closed && hasActual && diff < 0 && (
          <div className="space-y-2">
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Remarks (optional)"
              className={`${inputCls} text-sm`}
            />
            <label className="flex items-start gap-3 min-h-[44px] cursor-pointer text-[13px] text-slate-700">
              <input
                type="checkbox"
                checked={bookShort}
                onChange={(e) => setBookShort(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--flow-accent)]"
              />
              <span className="min-w-0">
                Book the {inr(-diff / 100)} shortfall as owed by {salesman}. It is then tracked under Trips → History until repaid.
              </span>
            </label>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--flow-canvas)]" id="trip-return-screen">
      <FlowHeader
        title={`Close Trip — #TRP-${trip.id}`}
        subtitle={`${[trip.vehicle, salesman, trip.date].filter(Boolean).join(' • ')}${trip.driver ? ` • Driver ${trip.driver}` : ''}`}
        onBack={step === 2 ? () => setStep(1) : onBack}
        backLabel={step === 2 ? 'Back to stock return' : 'Back to trips'}
        right={<FlowBadge>{closed ? 'Closed' : step === 1 ? 'Stock Return' : 'Cash & Ledger'}</FlowBadge>}
        progress={{ step, total: 2 }}
      />

      <div id="close-trip-scroll" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="mx-auto w-full max-w-6xl px-3 pt-3 pb-6 space-y-3">
          {closed && (
            <p className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-600">
              This trip is closed. The figures below are what was recorded.
            </p>
          )}
          <h2 className="text-sm font-black text-slate-900 px-0.5">
            {step === 1 ? `Unsold & damaged stock return · ${rows.length} ${rows.length === 1 ? 'product' : 'products'}` : 'Cash & ledger reconciliation'}
          </h2>
          {step === 1 ? Step1 : Step2}
        </div>
      </div>

      {/* The message sits right above the buttons so it is never hidden below a long list. */}
      {error && (
        <div className="shrink-0 border-t border-red-200 bg-red-50 px-3 py-2">
          <p role="alert" className="mx-auto w-full max-w-6xl text-[13px] font-bold text-red-700 break-words">
            {error}
          </p>
        </div>
      )}

      <FlowFooter>
        {closed ? (
          <button
            type="button"
            onClick={step === 1 ? () => setStep(2) : onBack}
            className={`${flowBtn.primary} basis-full`}
          >
            {step === 1 ? 'Next: Cash & Ledger →' : 'Back to Trips'}
          </button>
        ) : step === 1 ? (
          <button type="button" onClick={goStep2} className={`${flowBtn.primary} ${flowFooterPrimary}`}>
            <span className="truncate">Next: Cash &amp; Ledger →</span>
            {issues > 0 && (
              <span
                aria-label={`${issues} to check`}
                className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-xs font-black tabular-nums"
              >
                {issues} to check
              </span>
            )}
          </button>
        ) : (
          <button type="button" onClick={closeTrip} className={`${flowBtn.primary} ${flowFooterPrimary}`}>
            <CheckCircle2 size={18} className="shrink-0" />
            <span className="truncate">Close Trip &amp; Post to Ledger</span>
          </button>
        )}
        {!closed && (
          <button type="button" onClick={saveDraft} className={`${flowBtn.secondary} ${flowFooterSecondary}`}>
            <Save size={16} className="shrink-0" /> Save draft
          </button>
        )}
        {onEditTrip && !closed && step === 1 && (
          <button type="button" onClick={() => onEditTrip(trip)} className={`${flowBtn.secondary} ${flowFooterSecondary}`}>
            <Pencil size={16} className="shrink-0" /> Edit load
          </button>
        )}
      </FlowFooter>
    </div>
  );
};
