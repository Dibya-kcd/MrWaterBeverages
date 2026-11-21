import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OVERSOLD_REASONS } from '../../utils/oversoldDiagnostic';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Eye,
  EyeOff,
  Minus,
  Plus,
  Search,
  Warehouse,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { SizeChip } from '../common/SizeChip';
import { PackIcon } from '../common/PackIcon';
import { InfoTip } from '../common/InfoTip';
import { batchLineKey } from '../../utils/stockLocations';
import { todayISO } from '../../utils/dateLocal';
import { confirmDialog } from '../../utils/dialogs';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { Product } from '../../types';

/**
 * Phone-first batch-level stock audit.
 *
 *  setup  -> pick the godown (and resume an unfinished count, if any)
 *  count  -> one card per product, one compact line per batch; no floating bars
 *  review -> only the differences, one line per batch, then Confirm & Save
 *
 * Every difference is saved against its own batch (see saveBatchAudit), so a shortage in a
 * new batch is never taken off an old one. Nothing is assumed: a batch that is not counted is
 * simply not audited (it is listed on the review screen so it can be counted or marked as matching).
 */

type Step = 'setup' | 'count' | 'review' | 'done';
type Filter = 'all' | 'pending' | 'diff' | 'done';
type OversoldChoice = 'fix' | 'open' | 'adjust';

interface Row {
  key: string;
  productId: number;
  batchNumber: string;
  expiryDate: string;
  expiryStatus: string;
  systemQty: number;
  /** Batch typed in by the counter (stock found with no matching batch). Created only when the audit is saved. */
  isFound?: boolean;
  /** Product with book stock but no batch rows in this godown. */
  noBatch?: boolean;
}

interface FoundLine {
  key: string;
  productId: number;
  batchNumber: string;
  expiryDate: string;
}

interface OversoldState {
  choice: OversoldChoice;
  reason: string;
}

interface Draft {
  whId: string;
  counts: Record<string, string>;
  found: FoundLine[];
  note: string;
  oversold: Record<number, OversoldState>;
  savedAt: number;
}

const DRAFT_KEY = 'mrwater_audit_draft_v1';


function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d.whId !== 'string' || typeof d.counts !== 'object') return null;
    return { ...d, found: d.found || [], oversold: d.oversold || {}, note: d.note || '' };
  } catch {
    return null;
  }
}

function writeDraft(d: Draft | null) {
  try {
    if (!d) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* storage can be unavailable; the count still works, it just is not kept */
  }
}

const fmtExp = (d?: string) =>
  d
    ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
    : 'No expiry';

const expiryClass = (status: string) => {
  if (status === 'expired') return 'text-rose-700 font-bold';
  if (status === 'critical') return 'text-rose-600 font-semibold';
  if (status === 'warning') return 'text-amber-700 font-semibold';
  return 'text-slate-500';
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export interface StockAuditScreenProps {
  /** Open another Inventory tab (used by the "fix the cause" links on oversold lines). */
  onGoInventoryTab?: (tab: 'consignments' | 'transfers') => void;
  /** Phone header warehouse sync from InventoryView */
  selectedWhId?: string;
  onChangeWhId?: (id: string) => void;
}

export const StockAuditScreen: React.FC<StockAuditScreenProps> = ({
  onGoInventoryTab,
  selectedWhId,
  onChangeWhId,
}) => {
  const isPhone = useIsMobile(767);
  const {
    products,
    warehouses,
    productBatchLines,
    productWarehouseStock,
    warehouseStock,
    bookStock,
    inventoryBatches,
    bills,
    audits,
    stockLedgerEntries,
    inventoryDispositions,
    addBatch,
    saveBatchAudit,
    currentRole,
    setTab,
  } = useLedger();

  const isAdmin = currentRole === 'admin';

  const [step, setStep] = useState<Step>(() => (typeof window !== 'undefined' && window.innerWidth <= 767 ? 'count' : 'setup'));
  const [whId, setWhId] = useState<string>(selectedWhId || warehouses[0]?.id || '');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [found, setFound] = useState<FoundLine[]>([]);
  const [note, setNote] = useState('');
  const [batchNotes, setBatchNotes] = useState<Record<string, string>>({});
  const [showPostSheet, setShowPostSheet] = useState(false);
  const [postReason, setPostReason] = useState('');
  const [oversold, setOversold] = useState<Record<number, OversoldState>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showEmpty, setShowEmpty] = useState(false);
  const [openEmpty, setOpenEmpty] = useState<Record<number, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [foundFormFor, setFoundFormFor] = useState<number | null>(null);
  const [ffBatch, setFfBatch] = useState('');
  const [ffExp, setFfExp] = useState('');
  const [ffError, setFfError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedInfo, setSavedInfo] = useState<{ id: number; counted: number; differ: number; net: number } | null>(null);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(() => readDraft());

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!whId && (selectedWhId || warehouses[0]?.id)) {
      setWhId(selectedWhId || warehouses[0].id);
    }
  }, [warehouses, whId, selectedWhId]);

  useEffect(() => {
    if (isPhone && selectedWhId && selectedWhId !== whId) {
      setWhId(selectedWhId);
      setCounts({});
      setFound([]);
      setBatchNotes({});
      setSaveError('');
      if (step === 'setup' || step === 'done') setStep('count');
    }
  }, [isPhone, selectedWhId, whId, step]);

  useEffect(() => {
    if (isPhone && step === 'setup' && (whId || warehouses[0]?.id)) {
      setStep('count');
    }
  }, [isPhone, step, whId, warehouses]);

  // Keep the count on the phone while the person works, so a closed tab or a phone call loses nothing.
  useEffect(() => {
    if (step !== 'count' && step !== 'review') return;
    const hasWork =
      Object.values(counts).some((v) => v !== '') || found.length > 0 || Object.keys(oversold).length > 0 || note.trim() !== '';
    const t = setTimeout(() => {
      writeDraft(hasWork ? { whId, counts, found, note, oversold, savedAt: Date.now() } : null);
    }, 400);
    return () => clearTimeout(t);
  }, [step, whId, counts, found, note, oversold]);

  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || 'Godown';

  // ── Rows: one per batch (system = live quantity of that batch at this godown) ───────────────
  const productRows = useMemo(() => {
    const out: { product: Product; rows: Row[] }[] = [];
    for (const product of products) {
      const lines = productBatchLines(product.id).filter((l) => !whId || l.warehouseId === whId);
      const rows: Row[] = lines.map((l) => ({
        key: l.key,
        productId: product.id,
        batchNumber: l.batchNumber,
        expiryDate: l.expiryDate,
        expiryStatus: l.expiryStatus,
        systemQty: l.availableQty,
      }));
      for (const f of found) {
        if (f.productId !== product.id) continue;
        rows.push({
          key: f.key,
          productId: product.id,
          batchNumber: f.batchNumber,
          expiryDate: f.expiryDate,
          expiryStatus: 'unknown',
          systemQty: 0,
          isFound: true,
        });
      }
      if (rows.length === 0) {
        const sys = whId ? warehouseStock(whId, product.id) : bookStock(product.id);
        if (sys !== 0) {
          rows.push({
            key: `prod_${product.id}`,
            productId: product.id,
            batchNumber: '',
            expiryDate: '',
            expiryStatus: 'unknown',
            systemQty: sys,
            noBatch: true,
          });
        }
      }
      if (rows.length > 0) out.push({ product, rows });
    }
    return out.sort((a, b) => a.product.name.localeCompare(b.product.name));
    // The stock functions are re-created every render; the state below is what actually changes them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, inventoryBatches, bills, audits, stockLedgerEntries, inventoryDispositions, warehouses, whId, found, step]);

  // Oversold products: the real (negative) book balance of this godown, which every other screen shows as 0.
  const oversoldList = useMemo(() => {
    if (!whId) return [] as { product: Product; raw: number; others: { name: string; qty: number }[] }[];
    const out: { product: Product; raw: number; others: { name: string; qty: number }[] }[] = [];
    for (const product of products) {
      const rows = productWarehouseStock(product.id);
      const here = rows.find((r) => r.warehouseId === whId);
      if (!here || here.crates >= 0) continue;
      out.push({
        product,
        raw: here.crates,
        others: rows
          .filter((r) => r.warehouseId !== whId && r.crates > 0)
          .map((r) => ({ name: r.warehouseName, qty: r.crates })),
      });
    }
    return out.sort((a, b) => a.product.name.localeCompare(b.product.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, inventoryBatches, bills, audits, stockLedgerEntries, inventoryDispositions, warehouses, whId, step]);

  const oversoldIds = useMemo(() => new Set(oversoldList.map((o) => o.product.id)), [oversoldList]);

  const num = (key: string): number | null => {
    const v = counts[key];
    if (v === undefined || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };

  const allRows = useMemo(() => productRows.flatMap((p) => p.rows), [productRows]);

  const stats = useMemo(() => {
    let total = 0;
    let counted = 0;
    let differ = 0;
    let net = 0;
    for (const r of allRows) {
      const c = num(r.key);
      if (r.systemQty > 0 || c !== null) total++;
      if (c !== null) {
        counted++;
        if (c !== r.systemQty) {
          differ++;
          net += c - r.systemQty;
        }
      }
    }
    return { total, counted, differ, net };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, counts]);

  const q = search.trim().toLowerCase();
  const isEmptyRow = (r: Row) => r.systemQty <= 0 && num(r.key) === null && !r.isFound;

  const rowVisible = (product: Product, r: Row) => {
    if (q && !product.name.toLowerCase().includes(q) && !(r.batchNumber || '').toLowerCase().includes(q)) return false;
    const c = num(r.key);
    if (isEmptyRow(r) && !(showEmpty || openEmpty[product.id] || q)) return false;
    if (filter === 'pending' && c !== null) return false;
    if (filter === 'done' && c === null) return false;
    if (filter === 'diff' && !(c !== null && c !== r.systemQty)) return false;
    return true;
  };

  const hiddenEmptyTotal = useMemo(() => {
    if (showEmpty || q) return 0;
    let n = 0;
    for (const { product, rows } of productRows) {
      if (openEmpty[product.id]) continue;
      n += rows.filter((r) => isEmptyRow(r)).length;
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productRows, counts, showEmpty, q, openEmpty]);

  // ── Actions ─────────────────────────────────────────────────────────────────────────────────
  const setCount = (key: string, value: string) =>
    setCounts((prev) => ({ ...prev, [key]: value.replace(/[^0-9]/g, '').slice(0, 6) }));

  const stepCount = (r: Row, delta: number) => {
    const cur = num(r.key);
    const base = cur === null ? r.systemQty : cur;
    setCounts((prev) => ({ ...prev, [r.key]: String(Math.max(0, base + delta)) }));
  };

  const markMatch = (r: Row) => setCounts((prev) => ({ ...prev, [r.key]: String(Math.max(0, r.systemQty)) }));

  const markProductMatch = (rows: Row[]) =>
    setCounts((prev) => {
      const next = { ...prev };
      for (const r of rows) if (!isEmptyRow(r) || next[r.key] !== undefined) next[r.key] = String(Math.max(0, r.systemQty));
      return next;
    });

  const focusNext = (el: HTMLInputElement) => {
    const inputs = Array.from(listRef.current?.querySelectorAll<HTMLInputElement>('input[data-audit-input]') || []);
    const nxt = inputs[inputs.indexOf(el) + 1];
    if (nxt) {
      nxt.focus();
      nxt.select();
      window.setTimeout(() => nxt.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    } else {
      el.blur();
      window.setTimeout(() => document.getElementById('audit-finish')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    }
  };

  const startCount = async (id: string) => {
    const hasWork = Object.values(counts).some((v) => v !== '') || found.length > 0;
    // Coming back to the same godown keeps the count in progress; only a different godown starts clean.
    if (hasWork && id === whId) {
      setStep('count');
      return;
    }
    if (hasWork) {
      const ok = await confirmDialog({
        title: 'Start another godown?',
        message: 'Starting another godown discards the count in progress.',
        confirmLabel: 'Discard & Switch',
        cancelLabel: 'Keep Current',
        tone: 'danger',
      });
      if (!ok) return;
    }
    if (id !== whId) {
      setWhId(id);
      onChangeWhId?.(id);
    }
    setCounts({});
    setFound([]);
    setNote('');
    setBatchNotes({});
    setOversold({});
    setSearch('');
    setFilter('all');
    setShowEmpty(false);
    setOpenEmpty({});
    setSaveError('');
    writeDraft(null);
    setPendingDraft(null);
    setStep('count');
  };

  const resumeDraft = () => {
    if (!pendingDraft) return;
    setWhId(pendingDraft.whId);
    onChangeWhId?.(pendingDraft.whId);
    setCounts(pendingDraft.counts);
    setFound(pendingDraft.found);
    setNote(pendingDraft.note);
    setOversold(pendingDraft.oversold);
    setSaveError('');
    setPendingDraft(null);
    setStep('count');
  };

  const discardDraft = () => {
    writeDraft(null);
    setPendingDraft(null);
  };

  const addFoundBatch = (productId: number) => {
    const bn = ffBatch.trim();
    if (!bn) {
      setFfError('Type the batch number printed on the crate.');
      return;
    }
    const key = batchLineKey(whId, bn, ffExp);
    if (allRows.some((r) => r.key === key)) {
      setFfError('This batch already exists for the product — count it directly.');
      setOpenEmpty((p) => ({ ...p, [productId]: true }));
      return;
    }
    setFound((prev) => [...prev, { key, productId, batchNumber: bn, expiryDate: ffExp }]);
    setFoundFormFor(null);
    setFfBatch('');
    setFfExp('');
    setFfError('');
  };

  const removeFound = (key: string) => {
    setFound((prev) => prev.filter((f) => f.key !== key));
    setCounts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // ── Review data ─────────────────────────────────────────────────────────────────────────────
  const review = useMemo(() => {
    const diffs: { product: Product; rows: { r: Row; c: number }[]; net: number }[] = [];
    const matches: { product: Product; r: Row; c: number }[] = [];
    const uncounted: Row[] = [];
    for (const { product, rows } of productRows) {
      const d: { r: Row; c: number }[] = [];
      for (const r of rows) {
        const c = num(r.key);
        if (c === null) {
          if (r.systemQty > 0) uncounted.push(r);
          continue;
        }
        if (c !== r.systemQty) d.push({ r, c });
        else matches.push({ product, r, c });
      }
      if (d.length) diffs.push({ product, rows: d, net: d.reduce((s, x) => s + x.c - x.r.systemQty, 0) });
    }
    return { diffs, matches, uncounted };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productRows, counts]);

  const oversoldChoice = (pid: number): OversoldState => oversold[pid] || { choice: 'fix', reason: '' };
  const oversoldToSave = oversoldList.filter((o) => oversoldChoice(o.product.id).choice !== 'fix');
  const oversoldUnresolved = oversoldList.filter((o) => oversoldChoice(o.product.id).choice === 'fix');
  const nothingToSave = stats.counted === 0 && oversoldToSave.length === 0;

  const confirmSave = (explicitReason?: string) => {
    setSaveError('');
    for (const o of oversoldToSave) {
      const st = oversoldChoice(o.product.id);
      if (st.choice === 'adjust' && !isAdmin) {
        setSaveError('Only the owner login can post an oversold adjustment.');
        return;
      }
      if (st.choice === 'adjust' && !st.reason) {
        setSaveError(`Choose a reason for the ${o.product.name} adjustment.`);
        return;
      }
    }
    if (isPhone && stats.differ > 0 && !isAdmin) {
      setSaveError('Owner login required to post stock adjustments.');
      return;
    }
    const reasonText = (explicitReason ?? postReason ?? '').trim();
    if (isPhone && stats.differ > 0 && !reasonText) {
      setSaveError('Enter a reason for the stock adjustment.');
      return;
    }
    const lines: Parameters<typeof saveBatchAudit>[0]['lines'] = [];
    for (const r of allRows) {
      const c = num(r.key);
      if (c === null) continue;
      if (r.isFound && c === 0) continue; // nothing was found
      lines.push({
        productId: r.productId,
        batchKey: r.noBatch ? undefined : r.key,
        batchNumber: r.noBatch ? undefined : r.batchNumber,
        expiryDate: r.noBatch ? undefined : r.expiryDate,
        system: r.systemQty,
        counted: c,
      });
    }
    for (const o of oversoldToSave) {
      const st = oversoldChoice(o.product.id);
      lines.push({
        productId: o.product.id,
        system: o.raw,
        counted: st.choice === 'adjust' ? 0 : o.raw,
        kind: st.choice === 'adjust' ? 'oversold_adjust' : 'oversold_open',
        reason: st.reason || (st.choice === 'open' ? 'Under investigation' : undefined),
      });
    }
    if (lines.length === 0) {
      setSaveError('Count at least one batch first.');
      return;
    }
    // Batches typed in as "found" are created (quantity 0) now; the audit difference then fills them.
    for (const f of found) {
      const c = num(f.key);
      if (c === null || c === 0) continue;
      addBatch({
        productId: f.productId,
        batchNumber: f.batchNumber,
        expiryDate: f.expiryDate,
        warehouseId: whId,
        quantity: 0,
        inwardDate: todayISO(),
        notes: 'Found during stock audit',
      });
    }
    const extraLineNotes = Object.entries(batchNotes)
      .filter(([, val]) => val.trim().length > 0)
      .map(([, val]) => val.trim());
    const combinedNote = [reasonText, note.trim(), ...extraLineNotes].filter(Boolean).join(' · ');
    const id = saveBatchAudit({ date: todayISO(), warehouseId: whId, referenceNote: combinedNote, lines });
    if (id === null) {
      setSaveError('Nothing could be saved. Count at least one batch.');
      return;
    }
    setSavedInfo({ id, counted: stats.counted, differ: stats.differ, net: stats.net });
    writeDraft(null);
    setCounts({});
    setFound([]);
    setNote('');
    setBatchNotes({});
    setPostReason('');
    setShowPostSheet(false);
    setOversold({});
    setStep('done');
  };

  // ── Pieces ──────────────────────────────────────────────────────────────────────────────────
  const renderControls = (r: Row) => {
    const c = num(r.key);
    const diff = c === null ? null : c - r.systemQty;
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => stepCount(r, -1)}
          aria-label="Decrease count"
          className="w-10 h-11 rounded-xl border border-slate-300 bg-white text-slate-700 flex items-center justify-center active:bg-slate-100 cursor-pointer"
        >
          <Minus size={16} />
        </button>
        <input
          data-audit-input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="next"
          value={counts[r.key] ?? ''}
          placeholder="—"
          aria-label={`Counted quantity, batch ${r.batchNumber || 'none'}`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setCount(r.key, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              focusNext(e.currentTarget);
            }
          }}
          className={`w-14 h-11 rounded-xl border-2 text-center text-base font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 ${
            diff === null
              ? 'border-slate-300 bg-white text-slate-900'
              : diff === 0
                ? 'border-emerald-400 bg-white text-emerald-700'
                : diff > 0
                  ? 'border-amber-400 bg-white text-amber-700'
                  : 'border-rose-400 bg-white text-rose-700'
          }`}
        />
        <button
          type="button"
          onClick={() => stepCount(r, 1)}
          aria-label="Increase count"
          className="w-10 h-11 rounded-xl border border-slate-300 bg-white text-slate-700 flex items-center justify-center active:bg-slate-100 cursor-pointer"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={() => markMatch(r)}
          aria-label="Count matches the system"
          title="Matches the system"
          className="w-10 h-11 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 flex items-center justify-center active:bg-emerald-100 cursor-pointer"
        >
          <Check size={18} />
        </button>
      </div>
    );
  };

  const renderBatchRow = (r: Row, title?: React.ReactNode) => {
    const c = num(r.key);
    const diff = c === null ? null : c - r.systemQty;
    const tint =
      diff === null ? '' : diff === 0 ? 'bg-emerald-50/60' : diff > 0 ? 'bg-amber-50/70' : 'bg-rose-50/70';
    return (
      <div key={r.key} className={`px-3 py-2.5 ${tint}`}>
        {title}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 leading-tight">
            <div className="text-[13px] font-semibold text-slate-900 break-all">
              {r.noBatch ? 'No batch · book stock' : `Batch ${r.batchNumber || '—'}`}
              {r.isFound && (
                <span className="ml-1.5 text-[10px] font-bold uppercase text-sky-700 bg-sky-50 border border-sky-200 rounded px-1 py-0.5">
                  Found
                </span>
              )}
            </div>
            {!r.noBatch && (
              <div className={`text-[11px] mt-0.5 ${expiryClass(r.expiryStatus)}`}>
                {r.expiryStatus === 'expired' ? 'EXPIRED · ' : 'Exp '}
                {fmtExp(r.expiryDate)}
              </div>
            )}
            <div className="text-[11px] text-slate-500 mt-0.5">
              System <span className="font-bold text-slate-800 tabular-nums">{r.systemQty}</span>
              {diff !== null && diff !== 0 && (
                <span className={`ml-1.5 font-bold tabular-nums ${diff > 0 ? 'text-amber-700' : 'text-rose-700'}`}>
                  {signed(diff)}
                </span>
              )}
              {diff === 0 && <span className="ml-1.5 font-bold text-emerald-700">✓</span>}
            </div>
          </div>
          {renderControls(r)}
        </div>
        {r.isFound && (
          <button
            type="button"
            onClick={() => removeFound(r.key)}
            className="mt-1 text-[11px] font-semibold text-slate-500 underline cursor-pointer inline-flex items-center gap-1"
          >
            <X size={11} /> Remove this found batch
          </button>
        )}
      </div>
    );
  };

  const renderProductCard = (product: Product, rows: Row[]) => {
    const visible = rows.filter((r) => rowVisible(product, r));
    if (visible.length === 0) return null;
    const emptyHere = rows.filter((r) => isEmptyRow(r)).length;
    const emptyHidden = !showEmpty && !q && !openEmpty[product.id] ? emptyHere : 0;
    const multi = visible.length > 1;
    const isCollapsed = multi && collapsed[product.id];
    const sysTotal = rows.reduce((s, r) => s + Math.max(0, r.systemQty), 0);
    const doneCount = rows.filter((r) => num(r.key) !== null).length;
    const titleNode = (
      <div className="flex items-start gap-2 mb-1.5">
        <PackIcon size="sm" pack={product.pack} name={product.name} className="mt-0.5" />
        <div className="min-w-0 flex-1 text-[14px] font-bold text-slate-900 leading-snug break-words">
          {product.name} <SizeChip volume={product.volume} pack={product.pack} name={product.name} />
          {oversoldIds.has(product.id) && (
            <span className="ml-1.5 text-[10px] font-bold uppercase text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-0.5">
              Oversold
            </span>
          )}
        </div>
      </div>
    );
    return (
      <div
        key={product.id}
        data-card-tone={
          oversoldIds.has(product.id)
            ? 'due'
            : doneCount > 0
              ? 'received'
              : 'sales'
        }
        className="rounded-2xl border shadow-sm overflow-hidden"
      >
        {multi ? (
          <div className="px-3 pt-2.5 pb-2 flex items-start gap-2">
            <button
              type="button"
              onClick={() => setCollapsed((p) => ({ ...p, [product.id]: !p[product.id] }))}
              className="flex-1 min-w-0 text-left cursor-pointer"
              aria-expanded={!isCollapsed}
            >
              <div className="flex items-start gap-1.5">
                {isCollapsed ? <ChevronRight size={18} className="mt-0.5 shrink-0" /> : <ChevronDown size={18} className="mt-0.5 shrink-0" />}
                <div className="min-w-0 flex-1">{titleNode}</div>
              </div>
              <div className="pl-6 -mt-1 text-[11px] text-slate-500">
                {visible.length} batches · System {sysTotal} cs · {doneCount} counted
              </div>
            </button>
            <button
              type="button"
              onClick={() => markProductMatch(visible)}
              className="shrink-0 h-9 px-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 text-[12px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Check size={14} /> All match
            </button>
          </div>
        ) : null}
        {!isCollapsed && (
          <div className="divide-y divide-black/5">
            {multi ? visible.map((r) => renderBatchRow(r)) : renderBatchRow(visible[0], <div className="pt-0.5">{titleNode}</div>)}
          </div>
        )}
        <div className="px-3 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-black/5 bg-slate-50/60">
          {emptyHidden > 0 && (
            <button
              type="button"
              onClick={() => setOpenEmpty((p) => ({ ...p, [product.id]: true }))}
              className="text-[11px] font-semibold text-slate-500 underline cursor-pointer"
            >
              +{emptyHidden} empty batch{emptyHidden === 1 ? '' : 'es'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setFoundFormFor(foundFormFor === product.id ? null : product.id);
              setFfBatch('');
              setFfExp('');
              setFfError('');
            }}
            className="text-[11px] font-semibold text-sky-700 underline cursor-pointer"
          >
            + Found stock (new batch)
          </button>
        </div>
        {foundFormFor === product.id && (
          <div className="px-3 py-2.5 border-t border-black/5 bg-sky-50/50 space-y-2">
            <div className="text-[12px] text-slate-600">
              Crates on the shelf that match no batch above. Type the batch and expiry printed on the crate, then count them.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={ffBatch}
                onChange={(e) => setFfBatch(e.target.value)}
                placeholder="Batch no."
                className="h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm"
              />
              <input
                type="date"
                value={ffExp}
                onChange={(e) => setFfExp(e.target.value)}
                aria-label="Expiry date"
                className="h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm"
              />
            </div>
            {ffError && <div className="text-[12px] font-semibold text-rose-700">{ffError}</div>}
            <button
              type="button"
              onClick={() => addFoundBatch(product.id)}
              className="h-10 px-4 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer"
            >
              Add batch to count
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderOversoldCard = (o: { product: Product; raw: number; others: { name: string; qty: number }[] }) => {
    const st = oversoldChoice(o.product.id);
    const setSt = (patch: Partial<OversoldState>) => setOversold((p) => ({ ...p, [o.product.id]: { ...oversoldChoice(o.product.id), ...patch } }));
    const choices: { id: OversoldChoice; label: string; sub: string }[] = [
      { id: 'fix', label: 'Fix the cause first', sub: 'Nothing is saved for this product' },
      { id: 'open', label: 'Under investigation', sub: 'Recorded, stock unchanged' },
      { id: 'adjust', label: `Post adjustment +${Math.abs(o.raw)}`, sub: isAdmin ? 'Owner only · needs a reason' : 'Owner login only' },
    ];
    return (
      <div key={o.product.id} data-card-tone="due" className="rounded-2xl border p-3.5 space-y-2.5 shadow-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle size={18} className="text-rose-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-slate-900 break-words">{o.product.name}</div>
            <div className="text-[12px] text-rose-700 font-semibold">
              Book balance here is {o.raw} cs — more was sold than received.
            </div>
            {o.others.length > 0 && (
              <div className="text-[12px] text-slate-600 mt-0.5">
                Other godowns hold: {o.others.map((x) => `${x.name} ${x.qty} cs`).join(', ')}. Check the godown on recent bills.
              </div>
            )}
          </div>
        </div>
        <div className="grid gap-1.5">
          {choices.map((c) => {
            const disabled = c.id === 'adjust' && !isAdmin;
            const on = st.choice === c.id;
            return (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                onClick={() => setSt({ choice: c.id })}
                className={`text-left rounded-xl border px-3 py-2 min-h-[44px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  on ? 'border-[var(--primary)] bg-white ring-2 ring-[var(--primary)]/20' : 'border-slate-300 bg-white'
                }`}
              >
                <div className="text-[13px] font-semibold text-slate-900">{c.label}</div>
                <div className="text-[11px] text-slate-500">{c.sub}</div>
              </button>
            );
          })}
        </div>
        {st.choice === 'fix' && onGoInventoryTab && (
          <div className="flex flex-wrap gap-2 text-[12px] font-semibold">
            <button type="button" onClick={() => onGoInventoryTab('transfers')} className="underline text-sky-700 cursor-pointer">
              Godown transfer
            </button>
            <button type="button" onClick={() => onGoInventoryTab('consignments')} className="underline text-sky-700 cursor-pointer">
              Stock receipts
            </button>
            <button type="button" onClick={() => setTab('billing')} className="underline text-sky-700 cursor-pointer">
              Bills
            </button>
            <span className="text-slate-400">· your count is kept as a draft</span>
          </div>
        )}
        {st.choice === 'adjust' && (
          <select
            value={st.reason}
            onChange={(e) => setSt({ reason: e.target.value })}
            aria-label="Reason for the adjustment"
            className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm"
          >
            <option value="">Choose the reason…</option>
            {OVERSOLD_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  // ── Screens ─────────────────────────────────────────────────────────────────────────────────
  if (isPhone) {
    // ── PHONE: Done confirmation ─────────────────────────────────────────────────────────────
    if (step === 'done' && savedInfo) {
      return (
        <div className="space-y-3 hh-inv-pb">
          <div className="hh-inv-card hh-inv-card--alert-blue space-y-2.5">
            <div className="flex items-center gap-2 text-[#101D3A] font-extrabold text-[15px]">
              <CheckCircle2 size={18} className="text-[#16A34A] shrink-0" />
              <span>Audit #{savedInfo.id} posted</span>
            </div>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              {savedInfo.counted} batch{savedInfo.counted === 1 ? '' : 'es'} counted ·{' '}
              {savedInfo.differ === 0
                ? 'every counted batch matched the system'
                : `${savedInfo.differ} differ (${signed(savedInfo.net)} cs net)`}
              . Live stock for {whName(whId)} has been updated.
            </p>
            <button
              type="button"
              onClick={() => {
                setSavedInfo(null);
                setStep('count');
              }}
              className="hh-inv-btn-primary w-full"
            >
              Start another count
            </button>
          </div>
        </div>
      );
    }

    // ── PHONE: Differences Review & Post Sheet (Full-screen overlay) ─────────────────────────
    if (step === 'review') {
      return (
        <div className="rt-flow-phone">
          <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
            <div className="hh-sales-top__row">
              <button
                type="button"
                onClick={() => setStep('count')}
                className="hh-inv-backbtn"
              >
                <ArrowLeft size={20} strokeWidth={2.3} />
                <span>Differences</span>
              </button>
              {stats.differ > 0 && (
                <span className="hh-inv-danger-pill">{stats.differ} differ</span>
              )}
            </div>
          </div>

          <div className="rt-flow-phone__body space-y-2.5" style={{ paddingBottom: '120px' }}>
            {review.diffs.length === 0 ? (
              <div className="hh-inv-card text-center py-6 space-y-1.5">
                <div className="text-[14px] font-extrabold text-[#16A34A]">
                  Every counted batch matches the system.
                </div>
                <p className="text-[12px] text-slate-500">
                  {stats.counted} batch{stats.counted === 1 ? '' : 'es'} verified in {whName(whId)}.
                </p>
              </div>
            ) : (
              review.diffs.map(({ product, rows }) =>
                rows.map(({ r, c }) => {
                  const d = c - r.systemQty;
                  return (
                    <div key={r.key} className="hh-inv-card space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 text-[14px] font-extrabold text-[#101D3A] leading-snug">
                          {product.name}
                          {!r.noBatch ? ` · ${r.batchNumber}` : ' · No batch'}
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums ${
                            d < 0 ? 'bg-rose-50 text-[#DC2626]' : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {signed(d)} cs
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-0.5">
                        <div>
                          <div className="text-[11px] text-slate-500 font-semibold">System</div>
                          <div className="text-[16px] font-extrabold text-[#101D3A] tabular-nums mt-0.5">
                            {r.systemQty}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 font-semibold">Counted</div>
                          <div className="text-[16px] font-extrabold text-[#101D3A] tabular-nums mt-0.5">
                            {c}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 font-semibold">Diff</div>
                          <div
                            className={`text-[16px] font-extrabold tabular-nums mt-0.5 ${
                              d < 0 ? 'text-[#DC2626]' : 'text-amber-700'
                            }`}
                          >
                            {signed(d)}
                          </div>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={batchNotes[r.key] ?? ''}
                        onChange={(e) =>
                          setBatchNotes((prev) => ({ ...prev, [r.key]: e.target.value }))
                        }
                        placeholder="Note (optional)"
                        className="w-full text-[12px] text-slate-700 placeholder:text-slate-400 bg-transparent border-0 border-t border-slate-100 pt-2 focus:outline-none"
                      />
                    </div>
                  );
                })
              )
            )}

            {oversoldList.length > 0 && (
              <div className="hh-inv-card hh-inv-card--alert-amber space-y-1.5" style={{ background: '#FFFBEB' }}>
                <div className="text-[13px] font-bold text-amber-950">
                  Oversold products ({oversoldList.length}): fix these first from the Stock tab.
                </div>
                {oversoldList.map((o) => {
                  const st = oversoldChoice(o.product.id);
                  return (
                    <div key={o.product.id} className="text-[11.5px] text-amber-900 flex justify-between gap-2">
                      <span>{o.product.name} ({o.raw} cs)</span>
                      <span className="font-bold">
                        {st.choice === 'fix' ? 'Fix on Stock tab' : st.choice === 'open' ? 'Under investigation' : `Adjust +${Math.abs(o.raw)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {review.uncounted.length > 0 && (
              <div className="hh-inv-card hh-inv-card--alert-amber space-y-2">
                <div className="text-[12.5px] font-bold text-slate-900">
                  {review.uncounted.length} batch{review.uncounted.length === 1 ? '' : 'es'} with stock not counted
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setStep('count')}
                    className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-[12px] font-bold text-slate-700"
                  >
                    Go count
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCounts((prev) => {
                        const next = { ...prev };
                        for (const r of review.uncounted) next[r.key] = String(r.systemQty);
                        return next;
                      })
                    }
                    className="px-3 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 text-[12px] font-bold text-emerald-800"
                  >
                    Mark all matching
                  </button>
                </div>
              </div>
            )}

            {review.matches.length > 0 && review.diffs.length > 0 && (
              <details className="hh-inv-card text-[12px] text-slate-600">
                <summary className="cursor-pointer font-bold text-slate-700">
                  {review.matches.length} batch{review.matches.length === 1 ? '' : 'es'} match system
                </summary>
                <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                  {review.matches.map(({ product, r, c }) => (
                    <li key={r.key} className="flex justify-between gap-2">
                      <span className="truncate">{product.name}{!r.noBatch ? ` · ${r.batchNumber}` : ''}</span>
                      <span className="font-bold tabular-nums">{c} cs</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="rt-flow-phone__footer flex gap-2.5">
            <button
              type="button"
              onClick={() => setStep('count')}
              className="hh-inv-btn-outline flex-1"
            >
              Save count
            </button>
            <button
              type="button"
              disabled={nothingToSave}
              onClick={() => {
                setSaveError('');
                setPostReason((prev) => prev || note);
                setShowPostSheet(true);
              }}
              className="hh-inv-btn-primary flex-1"
            >
              Post adjustment
            </button>
          </div>

          {showPostSheet && (
            <div
              className="rt-bsheet-scrim"
              role="presentation"
              onClick={() => setShowPostSheet(false)}
            >
              <div
                className="rt-bsheet"
                role="dialog"
                aria-modal="true"
                aria-label="Post adjustment"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="hh-grab" />
                <div className="space-y-3 pb-1">
                  <div>
                    <h3 className="text-[18px] font-extrabold text-[#101D3A] leading-tight">
                      Post adjustment
                    </h3>
                    <p className="text-[12.5px] text-slate-500 mt-0.5">
                      Stock will change by {signed(stats.net)} cs in {whName(whId)} godown
                    </p>
                  </div>

                  <div className="rounded-xl border-2 border-[#2864D9] bg-white px-3.5 py-2.5">
                    <div className="text-[14px] font-extrabold text-[#101D3A]">
                      Post adjustment {signed(stats.net)} cs
                    </div>
                    <div className="text-[11.5px] text-slate-500 mt-0.5">
                      Owner only · needs a reason
                    </div>
                  </div>

                  {!isAdmin && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900">
                      Owner login required to post stock adjustments.
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[12px] font-bold text-[#101D3A] block">
                      Reason {stats.differ > 0 ? '(required)' : '(optional)'}
                    </label>
                    <textarea
                      rows={2}
                      value={postReason}
                      onChange={(e) => {
                        setPostReason(e.target.value);
                        setNote(e.target.value);
                      }}
                      placeholder="Breakage found during count..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-semibold text-[#101D3A] focus:outline-none focus:border-[#2864D9]"
                    />
                  </div>

                  {saveError && (
                    <div className="text-[12px] font-bold text-[#DC2626]" role="alert">
                      {saveError}
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowPostSheet(false)}
                      className="hh-inv-btn-outline flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmSave(postReason)}
                      className="hh-inv-btn-primary flex-1"
                    >
                      Post
                    </button>
                  </div>

                  <p className="text-center text-[11px] text-slate-500">
                    If everything matches: &ldquo;Every counted batch matches the system.&rdquo;
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── PHONE: Audit Count Screen ─────────────────────────────────────────────────────────────
    return (
      <div className="flex flex-col gap-2.5 w-full hh-inv-pb">
        {pendingDraft && (
          <div className="hh-inv-card hh-inv-card--alert-amber flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13.5px] font-extrabold text-[#101D3A]">
                Unfinished count found
              </div>
              <div className="text-[11.5px] text-slate-500 mt-0.5 truncate">
                {whName(pendingDraft.whId)} · {Object.values(pendingDraft.counts).filter((v) => v !== '').length} batches counted ·{' '}
                {new Date(pendingDraft.savedAt).toLocaleString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={resumeDraft}
              className="shrink-0 text-[13px] font-extrabold text-[#2864D9] px-2 py-1.5 cursor-pointer"
            >
              Resume
            </button>
          </div>
        )}

        <div className="hh-inv-card grid grid-cols-3 gap-2">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Counted</div>
            <div className="text-[19px] font-extrabold text-[#101D3A] tabular-nums mt-0.5">
              {stats.counted}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Differ</div>
            <div
              className={`text-[19px] font-extrabold tabular-nums mt-0.5 ${
                stats.differ > 0 ? 'text-[#DC2626]' : 'text-[#101D3A]'
              }`}
            >
              {stats.differ}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Net cs</div>
            <div
              className={`text-[19px] font-extrabold tabular-nums mt-0.5 ${
                stats.net < 0 ? 'text-[#DC2626]' : stats.net > 0 ? 'text-amber-700' : 'text-[#101D3A]'
              }`}
            >
              {signed(stats.net)}
            </div>
          </div>
        </div>

        <div className="rt-search-bar">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            type="search"
            enterKeyHint="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or batch"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="text-slate-400 p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {oversoldList.length > 0 && (
          <div className="hh-inv-card hh-inv-card--alert-red flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold text-[#DC2626]">
                {oversoldList.length} oversold in {whName(whId)}
              </div>
              <div className="text-[11.5px] text-slate-500">
                Book balance below zero before counting
              </div>
            </div>
          </div>
        )}

        <div ref={listRef} className="flex flex-col gap-2.5">
          {warehouses.length === 0 ? (
            <div className="hh-inv-card text-center py-6 text-[13px] text-slate-500">
              Add a godown first in Settings → Godowns.
            </div>
          ) : (
            (() => {
              const phoneCards = productRows
                .map(({ product, rows }) => {
                  const visible = rows.filter((r) => rowVisible(product, r));
                  if (visible.length === 0) return null;
                  return (
                    <div key={product.id} className="hh-inv-card space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <PackIcon size="sm" pack={product.pack} name={product.name} />
                          <span className="text-[14.5px] font-extrabold text-[#101D3A] truncate">
                            {product.name}
                          </span>
                        </div>
                        {visible.length > 1 && (
                          <button
                            type="button"
                            onClick={() => markProductMatch(visible)}
                            className="shrink-0 text-[11px] font-bold text-[#2864D9] px-2 py-1 rounded-full bg-blue-50 cursor-pointer"
                          >
                            All match
                          </button>
                        )}
                      </div>

                      <div className="divide-y divide-dashed divide-slate-200">
                        {visible.map((r, idx) => {
                          const c = num(r.key);
                          const diff = c === null ? null : c - r.systemQty;
                          return (
                            <div
                              key={r.key}
                              className={`flex items-center justify-between gap-2.5 ${
                                idx > 0 ? 'pt-2.5 mt-2.5' : 'pt-0.5'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-[13px] text-slate-700 leading-snug">
                                  <strong className="font-extrabold text-[#101D3A]">
                                    {r.noBatch ? 'Book' : r.batchNumber || '—'}
                                  </strong>{' '}
                                  <span className="text-slate-500 font-medium">
                                    · system {r.systemQty} cs
                                  </span>
                                </div>
                                {!r.noBatch && r.expiryDate && (
                                  <div className={`text-[11px] mt-0.5 ${expiryClass(r.expiryStatus)}`}>
                                    {r.expiryStatus === 'expired' ? 'EXPIRED · ' : 'Exp '}
                                    {fmtExp(r.expiryDate)}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <input
                                  data-audit-input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  enterKeyHint="next"
                                  value={counts[r.key] ?? ''}
                                  placeholder="—"
                                  aria-label={`Counted quantity, batch ${r.batchNumber || 'none'}`}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => setCount(r.key, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      focusNext(e.currentTarget);
                                    }
                                  }}
                                  className={`w-[74px] h-[42px] rounded-xl border-2 text-center text-[15px] font-extrabold tabular-nums focus:outline-none ${
                                    diff === null
                                      ? 'border-slate-300 bg-white text-[#101D3A]'
                                      : diff === 0
                                        ? 'border-[#16A34A] bg-white text-[#15803D]'
                                        : 'border-[#DC2626] bg-white text-[#DC2626]'
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => markMatch(r)}
                                  aria-label="Matches system"
                                  title="Matches system"
                                  className={`w-9 h-[42px] rounded-xl border flex items-center justify-center cursor-pointer ${
                                    diff === 0
                                      ? 'border-[#16A34A] bg-emerald-50 text-[#16A34A]'
                                      : 'border-slate-200 bg-slate-50 text-slate-500'
                                  }`}
                                >
                                  <Check size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
                .filter(Boolean);

              if (phoneCards.length === 0) {
                return (
                  <div className="hh-inv-card text-center py-6 text-[13px] text-slate-500">
                    {q ? 'No batches match your search.' : `No stock lines in ${whName(whId)}.`}
                  </div>
                );
              }
              return phoneCards;
            })()
          )}
        </div>

        {(hiddenEmptyTotal > 0 || showEmpty) && (
          <button
            type="button"
            onClick={() => {
              setShowEmpty((v) => !v);
              setOpenEmpty({});
            }}
            className="self-center text-[12px] font-bold text-[#2864D9] py-1 cursor-pointer"
          >
            {showEmpty
              ? 'Hide empty batches'
              : `Show ${hiddenEmptyTotal} empty batch${hiddenEmptyTotal === 1 ? '' : 'es'}`}
          </button>
        )}

        <div className="hh-inv-cta-dock">
          <button
            type="button"
            onClick={() => setStep('review')}
            className="hh-inv-btn-primary w-full"
          >
            Review differences{stats.counted > 0 ? ` (${stats.counted})` : ''}
          </button>
        </div>
      </div>
    );
  }

  // ── Screens (Desktop / Tablet preserved intact) ─────────────────────────────────────────────
  if (step === 'setup') {
    return (
      <div className="flex flex-col gap-3 w-full">
        {pendingDraft && (
          <div data-card-tone="warning" className="rounded-2xl border p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--amber">
                <ClipboardCheck size={16} />
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-slate-900">Unfinished count found</div>
                <div className="text-[12px] text-slate-600">
                  {whName(pendingDraft.whId)} · {Object.values(pendingDraft.counts).filter((v) => v !== '').length} counted ·{' '}
                  {new Date(pendingDraft.savedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={resumeDraft} className="h-11 px-4 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer">
                Continue count
              </button>
              <button type="button" onClick={discardDraft} className="h-11 px-4 rounded-xl border border-black/10 bg-white/85 text-sm font-semibold text-slate-700 cursor-pointer">
                Discard
              </button>
            </div>
          </div>
        )}
        <div data-card-tone="profit" className="rounded-2xl border shadow-sm p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="hh-icon-badge hh-icon-badge--purple mt-0.5">
                <ClipboardCheck size={18} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-slate-900 leading-snug">
                  Which godown are you counting?
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Choose a godown to start a physical shelf count.
                </p>
              </div>
            </div>
            <div className="shrink-0 mt-0.5">
              <InfoTip title="How the stock audit works">
                <p>Count every batch on the shelf. Each difference is saved against its own batch and posted to live stock.</p>
                <p>A batch you do not count is not audited. Nothing is assumed to match.</p>
              </InfoTip>
            </div>
          </div>

          {warehouses.length === 0 ? (
            <div className="rounded-xl bg-white/80 border border-black/5 px-4 py-6 text-sm text-slate-500">
              Add a godown first (Settings → Godowns).
            </div>
          ) : (
            <div className="space-y-2.5">
              {warehouses.map((w) => {
                const qty = warehouseStock(w.id);
                const hasStock = qty > 0;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => startCount(w.id)}
                    data-card-tone={hasStock ? 'sales' : 'neutral'}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-3.5 rounded-2xl border shadow-xs text-left active:scale-[0.99] transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`hh-icon-badge ${
                          hasStock ? 'hh-icon-badge--blue' : 'hh-icon-badge--slate'
                        }`}
                      >
                        <Warehouse size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900 leading-snug break-words">
                          {w.name}
                        </div>
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                              hasStock
                                ? 'bg-blue-100/90 text-blue-800'
                                : 'bg-white/80 text-slate-500 border border-slate-200/80'
                            }`}
                          >
                            {qty.toLocaleString()} cs in stock
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-500 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'done' && savedInfo) {
    return (
      <div data-card-tone="received" className="rounded-2xl border p-4 space-y-3 shadow-sm">
        <div className="flex items-center gap-2.5 text-emerald-900 font-bold text-base">
          <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--green">
            <CheckCircle2 size={17} />
          </span>
          <span>Audit #{savedInfo.id} saved</span>
        </div>
        <div className="text-sm text-slate-700">
          {savedInfo.counted} batch{savedInfo.counted === 1 ? '' : 'es'} counted ·{' '}
          {savedInfo.differ === 0 ? 'no differences' : `${savedInfo.differ} differ (${signed(savedInfo.net)} cs net)`}. Differences are
          posted to live stock for {whName(whId)}.
        </div>
        <button
          type="button"
          onClick={() => {
            setSavedInfo(null);
            setStep('setup');
          }}
          className="h-11 px-4 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer"
        >
          Start another count
        </button>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="flex flex-col gap-3 w-full">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep('count')}
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft size={16} /> Back to counting
          </button>
          <div className="text-[12px] font-semibold text-slate-500">{whName(whId)}</div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div data-card-tone="sales" className="rounded-2xl border py-2.5 shadow-2xs">
            <div className="text-lg font-extrabold text-slate-900 tabular-nums">{stats.counted}</div>
            <div className="text-[10px] font-bold uppercase text-blue-800/80">Counted</div>
          </div>
          <div data-card-tone={stats.differ ? 'warning' : 'received'} className="rounded-2xl border py-2.5 shadow-2xs">
            <div className={`text-lg font-extrabold tabular-nums ${stats.differ ? 'text-amber-700' : 'text-emerald-700'}`}>{stats.differ}</div>
            <div className="text-[10px] font-bold uppercase text-slate-600">Differ</div>
          </div>
          <div data-card-tone={stats.net < 0 ? 'due' : stats.net > 0 ? 'warning' : 'neutral'} className="rounded-2xl border py-2.5 shadow-2xs">
            <div className={`text-lg font-extrabold tabular-nums ${stats.net < 0 ? 'text-rose-700' : stats.net > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {signed(stats.net)}
            </div>
            <div className="text-[10px] font-bold uppercase text-slate-600">Net cs</div>
          </div>
        </div>

        {review.uncounted.length > 0 && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
            <div className="text-[13px] font-bold text-slate-900">
              {review.uncounted.length} batch{review.uncounted.length === 1 ? '' : 'es'} with stock not counted
            </div>
            <div className="text-[12px] text-slate-600">They will not be audited. Count them, or mark them as matching the system.</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setStep('count')} className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold cursor-pointer">
                Go count them
              </button>
              <button
                type="button"
                onClick={() =>
                  setCounts((prev) => {
                    const next = { ...prev };
                    for (const r of review.uncounted) next[r.key] = String(r.systemQty);
                    return next;
                  })
                }
                className="h-10 px-3 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm font-semibold cursor-pointer"
              >
                Mark all as matching
              </button>
            </div>
          </div>
        )}

        {oversoldList.length > 0 && (
          <div className="rounded-2xl border border-rose-200 bg-white p-3 space-y-1.5">
            <div className="text-[13px] font-bold text-slate-900">Oversold products</div>
            {oversoldList.map((o) => {
              const st = oversoldChoice(o.product.id);
              return (
                <div key={o.product.id} className="text-[12px] flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-slate-800">{o.product.name} ({o.raw} cs)</span>
                  <span className={`shrink-0 font-semibold ${st.choice === 'fix' ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {st.choice === 'fix' ? 'Needs attention — not saved' : st.choice === 'open' ? 'Under investigation' : `Adjust +${Math.abs(o.raw)}`}
                  </span>
                </div>
              );
            })}
            {oversoldUnresolved.length > 0 && (
              <button type="button" onClick={() => setStep('count')} className="text-[12px] font-semibold text-sky-700 underline cursor-pointer">
                Choose what to do (back to counting)
              </button>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-black/5 text-[12px] font-bold uppercase tracking-wide text-slate-500">Differences</div>
          {review.diffs.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-emerald-700 font-semibold">Every counted batch matches the system.</div>
          ) : (
            <div className="divide-y divide-black/5">
              {review.diffs.map(({ product, rows, net }) => (
                <div key={product.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-bold text-slate-900 break-words min-w-0">{product.name}</div>
                    <div className={`text-[13px] font-extrabold tabular-nums shrink-0 ${net < 0 ? 'text-rose-700' : net > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
                      {signed(net)} cs
                    </div>
                  </div>
                  {rows.map(({ r, c }) => (
                    <div key={r.key} className="mt-1 flex items-center justify-between text-[12px]">
                      <span className="text-slate-600 break-all min-w-0">
                        {r.noBatch ? 'No batch' : `Batch ${r.batchNumber}`}
                        {!r.noBatch && <span className={`ml-1 ${expiryClass(r.expiryStatus)}`}>· {fmtExp(r.expiryDate)}</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {r.systemQty} → <b>{c}</b>{' '}
                        <b className={c - r.systemQty < 0 ? 'text-rose-700' : 'text-amber-700'}>({signed(c - r.systemQty)})</b>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {review.matches.length > 0 && (
          <details className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[12px] text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-700">{review.matches.length} batches match</summary>
            <ul className="mt-2 space-y-1">
              {review.matches.map(({ product, r, c }) => (
                <li key={r.key} className="flex justify-between gap-2">
                  <span className="min-w-0 break-words">
                    {product.name}
                    {!r.noBatch && <span className="text-slate-400"> · {r.batchNumber}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">{c}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="rounded-2xl border border-black/10 bg-white p-3 space-y-2.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm"
          />
          {saveError && (
            <div className="text-[12px] font-semibold text-rose-700 flex items-start gap-1.5" role="alert">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {saveError}
            </div>
          )}
          <button
            type="button"
            onClick={() => confirmSave()}
            disabled={nothingToSave}
            className="w-full h-12 rounded-xl bg-[var(--primary)] text-white text-[15px] font-bold disabled:opacity-50 cursor-pointer"
          >
            Confirm &amp; Save
          </button>
          <div className="text-[11px] text-slate-500">
            Differences are posted to live stock for {whName(whId)}. A saved audit can only be undone by deleting it, which reverses the adjustment.
          </div>
        </div>
      </div>
    );
  }

  // step === 'count'
  const pct = stats.total > 0 ? Math.min(100, Math.round((stats.counted / stats.total) * 100)) : 0;
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'diff', label: 'Different' },
    { id: 'done', label: 'Done' },
  ];
  const cards = productRows.map(({ product, rows }) => renderProductCard(product, rows)).filter(Boolean);

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setStep('setup')}
          className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer min-w-0"
        >
          <ArrowLeft size={16} className="shrink-0" /> <span className="truncate">{whName(whId)}</span>
        </button>
        <button
          type="button"
          onClick={() => setStep('review')}
          className="h-10 px-4 rounded-xl bg-[var(--primary)] text-white text-sm font-bold shrink-0 cursor-pointer"
        >
          Review{stats.counted > 0 ? ` (${stats.counted})` : ''}
        </button>
      </div>

      <div data-card-tone="sales" className="rounded-2xl border px-3.5 py-3 shadow-2xs">
        <div className="flex items-center justify-between text-[12px] font-bold text-slate-700">
          <span>
            {stats.counted} of {stats.total} counted
          </span>
          {stats.differ > 0 && <span className="text-amber-700">{stats.differ} differ</span>}
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-white/80 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="search"
          enterKeyHint="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product or batch"
          className="w-full h-11 pl-9 pr-3 rounded-full border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`h-9 px-3.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap cursor-pointer ${
              filter === f.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(hiddenEmptyTotal > 0 || showEmpty) && (
        <button
          type="button"
          onClick={() => {
            setShowEmpty((v) => !v);
            setOpenEmpty({});
          }}
          className="self-start text-[12px] font-semibold text-slate-600 inline-flex items-center gap-1.5 cursor-pointer"
        >
          {showEmpty ? <EyeOff size={14} /> : <Eye size={14} />}
          {showEmpty ? 'Hide empty batches' : `${hiddenEmptyTotal} empty batch${hiddenEmptyTotal === 1 ? '' : 'es'} hidden · Show`}
        </button>
      )}

      {oversoldList.length > 0 && (
        <div className="space-y-2">
          <div className="text-[12px] font-bold uppercase tracking-wide text-rose-700">
            Oversold — needs attention ({oversoldList.length})
          </div>
          {oversoldList.map(renderOversoldCard)}
        </div>
      )}

      <div ref={listRef} className="flex flex-col gap-2.5">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {q || filter !== 'all' ? 'No batches match.' : 'No stock lines for this godown.'}
          </div>
        ) : (
          cards
        )}
      </div>

      <div id="audit-finish" className="rounded-2xl border border-black/10 bg-white p-3 space-y-2">
        <div className="text-[13px] text-slate-600">
          {stats.counted} of {stats.total} batches counted
          {stats.differ > 0 ? ` · ${stats.differ} differ` : ''}.
        </div>
        <button
          type="button"
          onClick={() => setStep('review')}
          className="w-full h-12 rounded-xl bg-[var(--primary)] text-white text-[15px] font-bold cursor-pointer"
        >
          Review &amp; save
        </button>
      </div>
    </div>
  );
};
