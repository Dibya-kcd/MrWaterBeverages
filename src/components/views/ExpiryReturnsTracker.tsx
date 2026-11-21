import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  PackageCheck,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import type { InventoryDisposition, ReturnStage, ReturnTracking } from '../../types';
import { money } from '../../utils/billing';
import { daysOpen } from '../../utils/dispositionCn';
import { todayISO } from '../../utils/dateLocal';
import { SizeChip } from '../common/SizeChip';

const today = () => todayISO();

const DISCARD_METHODS = [
  'Poured out, crates scrapped',
  'Given to scrap dealer',
  'Destroyed at godown',
  'Other',
];

type Filter = 'all' | 'action' | 'decide' | 'to_send' | 'with_company' | 'settled' | 'closed';

/** The real stage: a settled CN or explicit discard always wins; otherwise rejected / partial / stored stage. */
export function trackedStage(d: InventoryDisposition): ReturnStage {
  const rt = d.returnTracking;
  if (!rt) return 'held';
  if (d.compensationStatus === 'settled') return 'settled';
  if (rt.stage === 'discarded') return 'discarded';
  if (d.compensationStatus === 'rejected') return 'rejected';
  if (d.compensationStatus === 'partial') return 'sent';
  return rt.stage;
}

const STAGE_META: Record<ReturnStage, { label: string; cls: string }> = {
  held: { label: 'In godown', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  sent: { label: 'With company', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  settled: { label: 'Credit received', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  rejected: { label: 'Company refused', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  discarded: { label: 'Thrown out', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

interface Props {
  /** Opens the existing "Record CN" panel for this claim. */
  onRecordCn: (row: InventoryDisposition) => void;
}

export const ExpiryReturnsTracker: React.FC<Props> = ({ onRecordCn }) => {
  const { inventoryDispositions, products, updateInventoryDisposition, notify } = useLedger();

  const rows = useMemo(
    () => inventoryDispositions.filter((d) => !!d.returnTracking),
    [inventoryDispositions],
  );

  const decorated = useMemo(
    () =>
      rows
        .map((d) => ({ d, stage: trackedStage(d) }))
        .sort((a, b) => b.d.eventDate.localeCompare(a.d.eventDate)),
    [rows],
  );

  // Pick a useful default tab so users never land on an empty tab when records exist in another stage.
  const [filter, setFilter] = useState<Filter>(() => {
    if (decorated.some(({ stage }) => stage === 'held')) return 'action';
    if (decorated.some(({ stage }) => stage === 'sent')) return 'with_company';
    return 'all';
  });

  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [panel, setPanel] = useState<{ id: string; kind: 'send' | 'discard' | 'refused' } | null>(null);
  const [sentOn, setSentOn] = useState(today());
  const [sentRef, setSentRef] = useState('');
  const [method, setMethod] = useState(DISCARD_METHODS[0]);
  const [note, setNote] = useState('');

  const isUndecided = (d: InventoryDisposition, stage: ReturnStage) =>
    stage === 'held' && d.returnTracking!.decision === 'undecided';

  const needsAction = (_d: InventoryDisposition, stage: ReturnStage) => stage === 'held';

  const tiles = useMemo(() => {
    const sum = (f: (x: { d: InventoryDisposition; stage: ReturnStage }) => boolean) => {
      const list = decorated.filter(f);
      return {
        n: list.length,
        qty: list.reduce((s, x) => s + (Number(x.d.quantity) || 0), 0),
        value: list.reduce((s, x) => s + (Number(x.d.costValue) || 0), 0),
      };
    };
    return {
      decide: sum((x) => isUndecided(x.d, x.stage)),
      toSend: sum((x) => x.stage === 'held' && x.d.returnTracking!.decision === 'company'),
      withCo: sum((x) => x.stage === 'sent'),
      settled: sum((x) => x.stage === 'settled'),
      lost: sum((x) => x.stage === 'discarded' || x.stage === 'rejected'),
    };
  }, [decorated]);

  const totals = useMemo(
    () => ({
      n: decorated.length,
      qty: decorated.reduce((s, x) => s + (Number(x.d.quantity) || 0), 0),
      value: decorated.reduce((s, x) => s + (Number(x.d.costValue) || 0), 0),
    }),
    [decorated],
  );

  const stageFiltered = useMemo(
    () =>
      decorated.filter(({ d, stage }) => {
        if (filter === 'all') return true;
        if (filter === 'action') return needsAction(d, stage);
        if (filter === 'decide') return isUndecided(d, stage);
        if (filter === 'to_send') return stage === 'held' && d.returnTracking!.decision === 'company';
        if (filter === 'with_company') return stage === 'sent';
        if (filter === 'settled') return stage === 'settled';
        return stage === 'discarded' || stage === 'rejected';
      }),
    [decorated, filter],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stageFiltered;
    return stageFiltered.filter(({ d }) => {
      const rt = d.returnTracking!;
      return [
        d.productName || '',
        rt.customerName || '',
        rt.creditNoteNo || '',
        d.batchNumber || '',
        d.supplierName || '',
        d.warehouseName || '',
        d.creditNoteNumber || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [stageFiltered, query]);

  const visible = showAll ? filtered : filtered.slice(0, 10);

  if (rows.length === 0) {
    return (
      <section data-card-tone="neutral" className="rounded-2xl border border-dashed p-4 space-y-1.5" aria-label="Customer expiry returns">
        <h3 className="text-sm font-bold text-slate-900">Customer expired / damaged returns</h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          Nothing to track yet. When a customer gives back expired or damaged crates, tap <strong>Customer return</strong> above
          (or <strong>Return</strong> on an invoice in Sell → Sales history), enter the crates under <strong>Scrap</strong> and
          choose <strong>Send to company</strong>, <strong>Throw out</strong> or <strong>Decide later</strong>. They will appear
          here with their status.
        </p>
      </section>
    );
  }

  const patchTracking = (
    d: InventoryDisposition,
    changes: Partial<ReturnTracking>,
    logNote: string,
    extra: Partial<InventoryDisposition> = {},
  ) => {
    const rt = d.returnTracking!;
    const stage = (changes.stage || rt.stage) as ReturnStage;
    updateInventoryDisposition(d.id, {
      ...extra,
      returnTracking: {
        ...rt,
        ...changes,
        log: [...rt.log, { date: today(), stage, note: logNote }],
      },
    });
  };

  const chooseCompany = (d: InventoryDisposition) => {
    patchTracking(
      d,
      { decision: 'company', stage: 'held' },
      'Decided to send back to company',
      { dispositionType: 'expiry_return', compensationStatus: 'pending' },
    );
    notify('Marked to send back to company. Hand it over, then tap "Handed over".');
  };

  const resetToUndecided = (d: InventoryDisposition) => {
    patchTracking(
      d,
      { decision: 'undecided', stage: 'held' },
      'Moved back to To decide',
      { compensationStatus: 'not_applicable' },
    );
    notify('Moved back to "To decide".');
  };

  const closePanel = () => {
    setPanel(null);
    setSentRef('');
    setNote('');
    setSentOn(today());
    setMethod(DISCARD_METHODS[0]);
  };

  const openSendPanel = (d: InventoryDisposition) => {
    const rt = d.returnTracking!;
    setSentOn(rt.sentOn || today());
    setSentRef(rt.sentRef || '');
    setPanel({ id: d.id, kind: 'send' });
  };

  const confirmSent = (d: InventoryDisposition) => {
    const isEdit = trackedStage(d) === 'sent';
    patchTracking(
      d,
      { decision: 'company', stage: 'sent', sentOn: sentOn || today(), sentRef: sentRef.trim() || undefined },
      `${isEdit ? 'Updated handover' : 'Handed to company'}${sentRef.trim() ? ` (${sentRef.trim()})` : ''}`,
      { dispositionType: 'expiry_return', compensationStatus: d.compensationStatus === 'partial' ? 'partial' : 'pending' },
    );
    notify(isEdit ? 'Handover details updated.' : 'Marked as handed over. Record the credit note when the company issues it.');
    closePanel();
  };

  const confirmDiscard = (d: InventoryDisposition) => {
    const chosenMethod = method === 'Other' ? note.trim() || 'Other' : method;
    const wasRefused = trackedStage(d) === 'rejected';
    patchTracking(
      d,
      { decision: 'discard', stage: 'discarded', discardedOn: today(), discardMethod: chosenMethod },
      `${wasRefused ? 'Thrown out after company refusal' : 'Thrown out'} — ${chosenMethod}`,
      {
        dispositionType: 'expired_writeoff',
        compensationStatus: wasRefused ? 'rejected' : 'not_applicable',
      },
    );
    notify(`Thrown out. ₹${money(d.costValue)} is counted as a loss in profit reports.`);
    closePanel();
  };

  const confirmRefused = (d: InventoryDisposition) => {
    patchTracking(
      d,
      { stage: 'rejected', discardedOn: today(), discardMethod: note.trim() || 'Company refused the claim' },
      `Company refused${note.trim() ? ` — ${note.trim()}` : ''}`,
      { compensationStatus: 'rejected' },
    );
    notify(`Claim marked refused. ₹${money(d.costValue)} stays as a loss. You can now throw the crates out.`);
    closePanel();
  };

  const filters: { id: Filter; label: string; count: number; cases: number }[] = [
    { id: 'all', label: 'All', count: totals.n, cases: totals.qty },
    { id: 'action', label: 'Needs action', count: tiles.decide.n + tiles.toSend.n, cases: tiles.decide.qty + tiles.toSend.qty },
    { id: 'with_company', label: 'With company', count: tiles.withCo.n, cases: tiles.withCo.qty },
    { id: 'settled', label: 'Credit received', count: tiles.settled.n, cases: tiles.settled.qty },
    { id: 'closed', label: 'Thrown / refused', count: tiles.lost.n, cases: tiles.lost.qty },
  ];

  const stageCards: {
    id: Filter;
    label: string;
    data: { n: number; qty: number; value: number };
    cardTone: string;
    textTone: string;
    activeRing: string;
    iconBadge: string;
    Icon: React.ElementType;
    spanClass?: string;
  }[] = [
    {
      id: 'decide',
      label: 'To decide',
      data: tiles.decide,
      cardTone: 'warning',
      textTone: 'text-amber-950',
      activeRing: 'ring-2 ring-amber-500 border-amber-400',
      iconBadge: 'hh-icon-badge--amber',
      Icon: Clock,
    },
    {
      id: 'to_send',
      label: 'To hand over',
      data: tiles.toSend,
      cardTone: 'orange',
      textTone: 'text-orange-950',
      activeRing: 'ring-2 ring-orange-500 border-orange-400',
      iconBadge: 'hh-icon-badge--amber',
      Icon: PackageCheck,
    },
    {
      id: 'with_company',
      label: 'With company',
      data: tiles.withCo,
      cardTone: 'sales',
      textTone: 'text-sky-950',
      activeRing: 'ring-2 ring-sky-500 border-sky-400',
      iconBadge: 'hh-icon-badge--blue',
      Icon: Truck,
    },
    {
      id: 'settled',
      label: 'Credit received',
      data: tiles.settled,
      cardTone: 'received',
      textTone: 'text-emerald-950',
      activeRing: 'ring-2 ring-emerald-500 border-emerald-400',
      iconBadge: 'hh-icon-badge--green',
      Icon: CheckCircle2,
    },
    {
      id: 'closed',
      label: 'Thrown out / refused',
      data: tiles.lost,
      cardTone: 'neutral',
      textTone: 'text-slate-900',
      activeRing: 'ring-2 ring-slate-600 border-slate-400',
      iconBadge: 'hh-icon-badge--slate',
      Icon: Trash2,
      spanClass: 'col-span-2 sm:col-span-1',
    },
  ];

  const toggleLog = (id: string) =>
    setExpandedLogIds((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <section
      data-card-tone="neutral"
      className="rounded-2xl border shadow-xs p-3.5 sm:p-4 space-y-3.5"
      aria-label="Customer expiry returns"
    >
      {/* Header + clear totals (entries vs cases) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[#0A1F44] leading-snug">
            Customer expired / damaged returns
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Non-resaleable crates from customers. Tap any stage card below to filter.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-xl bg-[#F4F7FC] border border-[#DCE5F2] text-xs font-semibold text-[#0A1F44] tabular-nums shrink-0">
          <span>{totals.n} {totals.n === 1 ? 'entry' : 'entries'}</span>
          <span className="text-slate-300">·</span>
          <span className="font-bold">{totals.qty} cs</span>
          <span className="text-slate-300">·</span>
          <span className="font-bold">₹{money(totals.value)}</span>
        </div>
      </div>

      {/* 5 Interactive Stage Cards: 2x2 + full-width 5th on mobile, 5-across on sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {stageCards.map((c) => {
          const Icon = c.Icon;
          const isSelected = filter === c.id;
          return (
            <button
              key={c.id}
              type="button"
              data-card-tone={c.cardTone}
              onClick={() => {
                setFilter((prev) => (prev === c.id ? 'all' : c.id));
                setShowAll(false);
              }}
              aria-pressed={isSelected}
              className={`text-left rounded-2xl border p-3 transition-all cursor-pointer active:scale-[0.99] min-w-0 shadow-2xs ${c.textTone} ${
                isSelected ? c.activeRing : 'hover:shadow-sm'
              } ${c.spanClass || ''}`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-semibold leading-tight truncate">{c.label}</span>
                <span className={`hh-icon-badge hh-icon-badge--sm shrink-0 ${c.iconBadge}`}>
                  <Icon size={14} />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xl font-black leading-none tabular-nums">{c.data.qty}</span>
                <span className="text-xs font-bold opacity-75">cs</span>
                <span className="ml-auto text-xs font-bold opacity-80 tabular-nums">
                  {c.data.n} {c.data.n === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <div className="mt-1 text-xs font-semibold opacity-75 tabular-nums">
                ₹{money(c.data.value)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Non-clipping wrapped filter chips + Search */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter returns">
          {filters.map((f) => {
            const active =
              filter === f.id ||
              (f.id === 'action' && (filter === 'decide' || filter === 'to_send'));
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setFilter(f.id);
                  setShowAll(false);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer min-h-[38px] inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#0A1F44] text-white border-[#0A1F44] shadow-sm'
                    : 'bg-white text-slate-700 border-[#DCE5F2] hover:bg-slate-50'
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {f.count}
                  {f.cases > 0 ? ` · ${f.cases} cs` : ''}
                </span>
              </button>
            );
          })}
        </div>

        {decorated.length > 3 && (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowAll(false);
              }}
              placeholder="Search product, customer, CN, batch, supplier…"
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#DCE5F2] bg-slate-50/70 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/25"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-center py-6 px-3 space-y-2">
          <p className="text-xs font-semibold text-slate-600">
            {query.trim()
              ? 'No customer expired / damaged returns match your search.'
              : 'No items in this stage.'}
          </p>
          {(filter !== 'all' || query.trim()) && (
            <button
              type="button"
              onClick={() => {
                setFilter('all');
                setQuery('');
              }}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#DCE5F2] text-xs font-bold text-[#0A1F44] cursor-pointer hover:bg-slate-50"
            >
              Show all {totals.n} entries
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {visible.map(({ d, stage }) => {
            const rt = d.returnTracking!;
            const meta = STAGE_META[stage];
            const open = panel?.id === d.id ? panel.kind : null;
            const age = daysOpen(d.eventDate);
            const undecided = isUndecided(d, stage);
            const prod = products.find((p) => p.id === d.productId);
            const logOpen = !!expandedLogIds[d.id];

            const rowTone =
              stage === 'settled'
                ? 'received'
                : stage === 'rejected'
                  ? 'due'
                  : stage === 'sent'
                    ? 'sales'
                    : stage === 'held'
                      ? 'warning'
                      : 'neutral';
            return (
              <li
                key={d.id}
                data-card-tone={rowTone}
                className="rounded-2xl border p-3.5 space-y-2.5 shadow-xs"
              >
                {/* Top row: full product title + qty pill + status & value */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-sm text-[#0A1F44] leading-snug break-words">
                        {d.productName || `Product ${d.productId}`}
                      </span>
                      <SizeChip volume={prod?.volume} pack={prod?.pack} name={d.productName} />
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-xs font-bold tabular-nums">
                        {d.quantity} cs
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 leading-snug break-words">
                      From <strong className="font-semibold text-slate-800">{rt.customerName}</strong> · {rt.creditNoteNo} · {d.eventDate}
                    </div>
                    <div className="text-xs text-slate-500 leading-snug break-words">
                      {d.batchNumber ? `Batch ${d.batchNumber}` : 'Batch unknown'}
                      {d.expiryDate ? ` · Exp ${d.expiryDate}` : ''}
                      {d.warehouseName ? ` · ${d.warehouseName}` : ''}
                      {d.supplierName ? ` · ${d.supplierName}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${meta.cls}`}>
                      {undecided ? 'Decide' : meta.label}
                    </span>
                    <div className="text-sm font-extrabold text-amber-900 tabular-nums">
                      ₹{money(d.costValue)}
                    </div>
                  </div>
                </div>

                {/* Stage status detail */}
                {stage === 'held' && age >= 7 && (
                  <div className="text-xs font-semibold text-rose-700 bg-rose-50/70 border border-rose-200 rounded-xl px-2.5 py-1.5">
                    Waiting {age} days in godown — decide whether to send to company or throw out
                  </div>
                )}
                {stage === 'sent' && (
                  <div className="text-xs text-sky-900 bg-sky-50/70 border border-sky-200 rounded-xl px-2.5 py-1.5">
                    Handed over {rt.sentOn || ''}
                    {rt.sentRef ? ` · ${rt.sentRef}` : ''}
                    {rt.sentOn ? ` · ${daysOpen(rt.sentOn)} days ago` : ''}
                  </div>
                )}
                {stage === 'settled' && (
                  <div className="text-xs text-emerald-900 bg-emerald-50/70 border border-emerald-200 rounded-xl px-2.5 py-1.5 font-semibold">
                    {d.creditNoteNumber ? `CN ${d.creditNoteNumber} · ` : ''}₹{money(d.compensatedAmount || 0)} recovered
                  </div>
                )}
                {(stage === 'discarded' || stage === 'rejected') && (
                  <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                    {rt.discardedOn || d.eventDate}
                    {rt.discardMethod ? ` · ${rt.discardMethod}` : ''}
                    {d.reason && !rt.discardMethod ? ` · ${d.reason}` : ''}
                  </div>
                )}

                {/* Actions */}
                {stage === 'held' && !open && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-0.5">
                    {undecided ? (
                      <button
                        type="button"
                        onClick={() => chooseCompany(d)}
                        className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Truck size={15} /> Send to company
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openSendPanel(d)}
                        className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <PackageCheck size={15} /> Handed over to company
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPanel({ id: d.id, kind: 'discard' })}
                      className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={15} /> Throw out
                    </button>
                    {!undecided && (
                      <button
                        type="button"
                        onClick={() => resetToUndecided(d)}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                        title="Move back to To decide"
                      >
                        <RotateCcw size={13} /> Decide later
                      </button>
                    )}
                  </div>
                )}

                {stage === 'sent' && !open && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => onRecordCn(d)}
                      className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Record credit note
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanel({ id: d.id, kind: 'refused' })}
                      className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-white border border-rose-300 text-rose-800 hover:bg-rose-50 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <XCircle size={15} /> Company refused
                    </button>
                    <button
                      type="button"
                      onClick={() => openSendPanel(d)}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                    >
                      Edit handover
                    </button>
                  </div>
                )}

                {stage === 'rejected' && !open && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setPanel({ id: d.id, kind: 'discard' })}
                      className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={15} /> Throw out crates
                    </button>
                    <button
                      type="button"
                      onClick={() => onRecordCn(d)}
                      className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs font-bold cursor-pointer"
                    >
                      Record credit note instead
                    </button>
                  </div>
                )}

                {/* Inline panels */}
                {open === 'send' && (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-xs font-semibold text-slate-600">Handed over on</span>
                        <input
                          type="date"
                          value={sentOn}
                          max={today()}
                          onChange={(e) => setSentOn(e.target.value)}
                          className="mt-1 w-full border rounded-xl px-2.5 py-2 text-sm bg-white"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold text-slate-600">Challan / vehicle / person</span>
                        <input
                          type="text"
                          value={sentRef}
                          onChange={(e) => setSentRef(e.target.value)}
                          placeholder="e.g. Challan 112, Ramesh"
                          className="mt-1 w-full border rounded-xl px-2.5 py-2 text-sm bg-white"
                        />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => confirmSent(d)}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Save handover
                      </button>
                      <button
                        type="button"
                        onClick={closePanel}
                        className="min-h-[40px] px-3 py-2 rounded-xl border bg-white text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {open === 'discard' && (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2.5">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">How was it thrown out?</span>
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="mt-1 w-full border rounded-xl px-2.5 py-2 text-sm bg-white"
                      >
                        {DISCARD_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    {method === 'Other' && (
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Describe disposal method"
                        className="w-full border rounded-xl px-2.5 py-2 text-sm bg-white"
                      />
                    )}
                    <p className="text-xs text-slate-600">
                      ₹{money(d.costValue)} will stay counted as a loss in profit reports.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => confirmDiscard(d)}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold cursor-pointer"
                      >
                        Confirm throw out
                      </button>
                      <button
                        type="button"
                        onClick={closePanel}
                        className="min-h-[40px] px-3 py-2 rounded-xl border bg-white text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {open === 'refused' && (
                  <div className="rounded-xl bg-rose-50/60 border border-rose-200 p-3 space-y-2.5">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Why did the company refuse? (optional)"
                      className="w-full border rounded-xl px-2.5 py-2 text-sm bg-white"
                    />
                    <p className="text-xs text-slate-600">
                      The crates become a loss to you (₹{money(d.costValue)}). You can throw them out right after marking refused.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => confirmRefused(d)}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-rose-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Mark refused
                      </button>
                      <button
                        type="button"
                        onClick={closePanel}
                        className="min-h-[40px] px-3 py-2 rounded-xl border bg-white text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Collapsible tracking timeline */}
                {rt.log.length > 0 && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => toggleLog(d.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[#0A1F44] cursor-pointer"
                    >
                      <History size={12} />
                      <span>Timeline ({rt.log.length})</span>
                      {logOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {logOpen && (
                      <ul className="mt-1.5 pl-3 border-l-2 border-slate-200 space-y-1">
                        {rt.log.map((entry, idx) => (
                          <li key={idx} className="text-xs text-slate-600">
                            <span className="font-mono text-slate-500 mr-1.5">{entry.date}</span>
                            <span>{entry.note || STAGE_META[entry.stage]?.label || entry.stage}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full min-h-[42px] py-2 rounded-xl border border-[#DCE5F2] text-xs font-bold text-[#0A1F44] hover:bg-slate-50 cursor-pointer"
        >
          {showAll ? 'Show first 10' : `Show all ${filtered.length} entries (${filtered.reduce((s, x) => s + (Number(x.d.quantity) || 0), 0)} cs)`}
        </button>
      )}
    </section>
  );
};

export default ExpiryReturnsTracker;
