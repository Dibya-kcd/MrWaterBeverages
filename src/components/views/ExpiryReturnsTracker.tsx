import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, PackageCheck, Trash2, Truck, XCircle } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import type { InventoryDisposition, ReturnStage, ReturnTracking } from '../../types';
import { money } from '../../utils/billing';
import { daysOpen } from '../../utils/dispositionCn';
import { todayISO } from "../../utils/dateLocal";

const today = () => todayISO();

const DISCARD_METHODS = [
  'Poured out, crates scrapped',
  'Given to scrap dealer',
  'Destroyed at godown',
  'Other',
];

type Filter = 'action' | 'with_company' | 'settled' | 'closed' | 'all';

/** The real stage: a recorded credit note / rejection always wins over the stored stage. */
export function trackedStage(d: InventoryDisposition): ReturnStage {
  const rt = d.returnTracking;
  if (!rt) return 'held';
  if (d.compensationStatus === 'settled') return 'settled';
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
  const { inventoryDispositions, updateInventoryDisposition, notify } = useLedger();
  const [filter, setFilter] = useState<Filter>('action');
  const [panel, setPanel] = useState<{ id: string; kind: 'send' | 'discard' | 'refused' } | null>(null);
  const [sentOn, setSentOn] = useState(today());
  const [sentRef, setSentRef] = useState('');
  const [method, setMethod] = useState(DISCARD_METHODS[0]);
  const [note, setNote] = useState('');

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

  const isUndecided = (d: InventoryDisposition, stage: ReturnStage) =>
    stage === 'held' && d.returnTracking!.decision === 'undecided';

  const needsAction = (d: InventoryDisposition, stage: ReturnStage) =>
    stage === 'held'; // undecided, or decided "company" but not yet handed over

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

  const visible = decorated.filter(({ d, stage }) => {
    if (filter === 'all') return true;
    if (filter === 'action') return needsAction(d, stage);
    if (filter === 'with_company') return stage === 'sent';
    if (filter === 'settled') return stage === 'settled';
    return stage === 'discarded' || stage === 'rejected';
  });

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 space-y-1.5" aria-label="Customer expiry returns">
        <h3 className="text-sm font-black text-slate-900">Customer expired / damaged returns</h3>
        <p className="text-xs text-slate-600">
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

  const closePanel = () => {
    setPanel(null);
    setSentRef('');
    setNote('');
    setSentOn(today());
    setMethod(DISCARD_METHODS[0]);
  };

  const confirmSent = (d: InventoryDisposition) => {
    patchTracking(
      d,
      { decision: 'company', stage: 'sent', sentOn: sentOn || today(), sentRef: sentRef.trim() || undefined },
      `Handed to company${sentRef.trim() ? ` (${sentRef.trim()})` : ''}`,
      { dispositionType: 'expiry_return', compensationStatus: d.compensationStatus === 'partial' ? 'partial' : 'pending' },
    );
    notify('Marked as handed over. Record the credit note when the company issues it.');
    closePanel();
  };

  const confirmDiscard = (d: InventoryDisposition) => {
    patchTracking(
      d,
      { decision: 'discard', stage: 'discarded', discardedOn: today(), discardMethod: method === 'Other' ? note.trim() || 'Other' : method },
      `Thrown out — ${method === 'Other' ? note.trim() || 'Other' : method}`,
      { dispositionType: 'expired_writeoff', compensationStatus: 'not_applicable' },
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
    notify(`Claim rejected. ₹${money(d.costValue)} stays as a loss in profit reports.`);
    closePanel();
  };

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'action', label: 'Needs action', count: tiles.decide.n + tiles.toSend.n },
    { id: 'with_company', label: 'With company', count: tiles.withCo.n },
    { id: 'settled', label: 'Credit received', count: tiles.settled.n },
    { id: 'closed', label: 'Thrown out / refused', count: tiles.lost.n },
    { id: 'all', label: 'All', count: decorated.length },
  ];

  const tile = (label: string, t: { n: number; qty: number; value: number }, tone: string, Icon: React.ElementType) => (
    <div className={`rounded-xl border p-2.5 ${tone}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide opacity-80">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 text-lg font-black leading-none tabular-nums">{t.qty}<span className="text-[10px] font-bold ml-1 opacity-70">cs</span></div>
      <div className="text-[10px] font-semibold opacity-80 mt-0.5">₹{money(t.value)}</div>
    </div>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4 space-y-3" aria-label="Customer expiry returns">
      <div>
        <h3 className="text-sm font-black text-slate-900">Customer expired / damaged returns</h3>
        <p className="hidden sm:block text-[11px] text-slate-500">
          Crates customers gave back that cannot be resold. Decide for each: send to the company for a credit note, or throw out.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {tile('To decide', tiles.decide, 'bg-amber-50 border-amber-200 text-amber-900', Clock)}
        {tile('To hand over', tiles.toSend, 'bg-orange-50 border-orange-200 text-orange-900', PackageCheck)}
        {tile('With company', tiles.withCo, 'bg-sky-50 border-sky-200 text-sky-900', Truck)}
        {tile('Credit received', tiles.settled, 'bg-emerald-50 border-emerald-200 text-emerald-900', CheckCircle2)}
        {tile('Loss (thrown / refused)', tiles.lost, 'bg-slate-50 border-slate-200 text-slate-800', Trash2)}
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="tablist" aria-label="Filter returns">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${
              filter === f.id ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="text-center text-xs text-slate-500 py-6">Nothing here.</div>
      ) : (
        <ul className="space-y-2">
          {visible.map(({ d, stage }) => {
            const rt = d.returnTracking!;
            const meta = STAGE_META[stage];
            const open = panel?.id === d.id ? panel.kind : null;
            const age = daysOpen(d.eventDate);
            const undecided = isUndecided(d, stage);
            return (
              <li key={d.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 leading-snug">
                      {d.productName || `Product ${d.productId}`}
                      <span className="ml-1.5 font-mono text-xs text-slate-600">× {d.quantity} cs</span>
                    </div>
                    <div className="text-[11px] text-slate-500 leading-snug">
                      From {rt.customerName} · {rt.creditNoteNo} · {d.eventDate}
                    </div>
                    <div className="text-[11px] text-slate-500 leading-snug">
                      {d.batchNumber ? `Batch ${d.batchNumber}` : 'Batch unknown'}
                      {d.expiryDate ? ` · Exp ${d.expiryDate}` : ''}
                      {d.supplierName ? ` · ${d.supplierName}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-md border ${meta.cls}`}>
                      {undecided ? 'Decide' : meta.label}
                    </span>
                    <div className="text-xs font-bold text-amber-900 mt-1 tabular-nums">₹{money(d.costValue)}</div>
                  </div>
                </div>

                {stage === 'held' && age >= 7 && (
                  <div className="text-[11px] font-semibold text-rose-700">Waiting {age} days in godown</div>
                )}
                {stage === 'sent' && (
                  <div className="text-[11px] text-slate-600">
                    Handed over {rt.sentOn || ''}
                    {rt.sentRef ? ` · ${rt.sentRef}` : ''}
                    {rt.sentOn ? ` · ${daysOpen(rt.sentOn)} days ago` : ''}
                  </div>
                )}
                {stage === 'settled' && (
                  <div className="text-[11px] text-emerald-800 font-semibold">
                    {d.creditNoteNumber ? `CN ${d.creditNoteNumber} · ` : ''}₹{money(d.compensatedAmount || 0)} recovered
                  </div>
                )}
                {(stage === 'discarded' || stage === 'rejected') && (
                  <div className="text-[11px] text-slate-600">
                    {rt.discardedOn || ''} {rt.discardMethod ? `· ${rt.discardMethod}` : ''}
                  </div>
                )}

                {/* Actions */}
                {stage === 'held' && !open && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {undecided ? (
                      <button type="button" onClick={() => chooseCompany(d)} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                        <Truck size={14} /> Send to company
                      </button>
                    ) : (
                      <button type="button" onClick={() => setPanel({ id: d.id, kind: 'send' })} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                        <PackageCheck size={14} /> Handed over to company
                      </button>
                    )}
                    <button type="button" onClick={() => setPanel({ id: d.id, kind: 'discard' })} className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                      <Trash2 size={14} /> Throw out
                    </button>
                  </div>
                )}
                {stage === 'sent' && !open && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => onRecordCn(d)} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer">
                      Record credit note
                    </button>
                    <button type="button" onClick={() => setPanel({ id: d.id, kind: 'refused' })} className="px-3 py-2 rounded-xl bg-white border border-rose-300 text-rose-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                      <XCircle size={14} /> Company refused
                    </button>
                  </div>
                )}

                {open === 'send' && (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-bold text-slate-600">Handed over on</span>
                        <input type="date" value={sentOn} max={today()} onChange={(e) => setSentOn(e.target.value)} className="mt-0.5 w-full border rounded-xl px-2.5 py-2 text-sm bg-white" />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-bold text-slate-600">Challan / vehicle / person</span>
                        <input type="text" value={sentRef} onChange={(e) => setSentRef(e.target.value)} placeholder="e.g. Challan 112, Ramesh" className="mt-0.5 w-full border rounded-xl px-2.5 py-2 text-sm bg-white" />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => confirmSent(d)} className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer">Save</button>
                      <button type="button" onClick={closePanel} className="px-3 py-2 rounded-xl border bg-white text-xs font-bold cursor-pointer">Cancel</button>
                    </div>
                  </div>
                )}

                {open === 'discard' && (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 space-y-2">
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-600">How was it thrown out?</span>
                      <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-0.5 w-full border rounded-xl px-2.5 py-2 text-sm bg-white">
                        {DISCARD_METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    {method === 'Other' && (
                      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe" className="w-full border rounded-xl px-2.5 py-2 text-sm bg-white" />
                    )}
                    <p className="text-[11px] text-slate-500">₹{money(d.costValue)} will be counted as a loss in profit reports.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => confirmDiscard(d)} className="flex-1 px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold cursor-pointer">Confirm throw out</button>
                      <button type="button" onClick={closePanel} className="px-3 py-2 rounded-xl border bg-white text-xs font-bold cursor-pointer">Cancel</button>
                    </div>
                  </div>
                )}

                {open === 'refused' && (
                  <div className="rounded-xl bg-rose-50/60 border border-rose-200 p-2.5 space-y-2">
                    <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why did the company refuse? (optional)" className="w-full border rounded-xl px-2.5 py-2 text-sm bg-white" />
                    <p className="text-[11px] text-slate-600">The crates are then a loss to you (₹{money(d.costValue)}). You can throw them out after this.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => confirmRefused(d)} className="flex-1 px-3 py-2 rounded-xl bg-rose-700 text-white text-xs font-bold cursor-pointer">Mark refused</button>
                      <button type="button" onClick={closePanel} className="px-3 py-2 rounded-xl border bg-white text-xs font-bold cursor-pointer">Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ExpiryReturnsTracker;
