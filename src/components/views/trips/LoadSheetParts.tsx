import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Lock, Minus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Product, Warehouse } from '../../../types';
import { SizeChip } from '../../common/SizeChip';
import {
  PackGroupInfo,
  PackGroupKey,
  compareProductsInSequence,
  productPackGroup,
  productSequenceVolume,
  sizeTheme,
} from '../../../utils/sizeColor';
import { OdiaName } from '../../common/OdiaName';

/**
 * Shared phone-first building blocks for every "load a van" screen (owner and salesman, new trip
 * and edit trip): big cards instead of a table, one add-products sheet, one review sheet and one
 * bottom action bar. Plain words and big buttons, so a first-time user can follow it.
 */

export const fieldLabel = 'block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1';
export const fieldBox =
  'w-full min-h-[46px] px-3 py-2.5 rounded-xl border border-black/15 bg-white text-[15px] font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-dashed';

/* ------------------------------------------------------------------ */
/* Totals strip                                                         */
/* ------------------------------------------------------------------ */
export const StatsStrip: React.FC<{ items: { label: string; value: string; tone?: 'green' | 'amber' | 'ink' }[] }> = ({ items }) => (
  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
    {items.map((s) => (
      <div key={s.label} className="rounded-xl border border-black/10 bg-white px-1 py-1.5 text-center">
        <div
          className={`text-base font-black leading-tight tabular-nums ${
            s.tone === 'green' ? 'text-[var(--primary)]' : s.tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
          }`}
        >
          {s.value}
        </div>
        <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-500">{s.label}</div>
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/* One product line                                                     */
/* ------------------------------------------------------------------ */
export interface LoadLineCardProps {
  product?: Product;
  fallbackName: string;
  qty: string;
  onQty: (v: string) => void;
  onMinus: () => void;
  onPlus: () => void;
  onRemove?: () => void;
  readOnly?: boolean;
  /** small facts under the name, e.g. Godown 43 cs · Billed 12 cs */
  facts?: { label: string; value: string; bad?: boolean }[];
  warning?: string;
  /** pale red background when something is wrong with this line */
  problem?: boolean;
  /** per-line godown picker (new load sheet) */
  godown?: { value: string; options: Warehouse[]; onChange: (id: string) => void; stockText: string };
}

export const LoadLineCard: React.FC<LoadLineCardProps> = ({
  product,
  fallbackName,
  qty,
  onQty,
  onMinus,
  onPlus,
  onRemove,
  readOnly,
  facts,
  warning,
  problem,
  godown,
}) => {
  const name = product?.name || fallbackName;
  const stripe = sizeTheme(product?.volume, product?.name).hex;
  return (
    <div
      className={`rounded-2xl border bg-white p-3 ${problem ? 'border-rose-300 bg-rose-50/60' : 'border-black/10'}`}
      style={{ borderLeftWidth: 6, borderLeftColor: stripe }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-slate-900 leading-snug break-words">{name}</div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <SizeChip volume={product?.volume} pack={product?.pack} name={name} />
            {product?.unitsPerCrate ? (
              <span className="text-[10.5px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                {product.unitsPerCrate} pcs/cs
              </span>
            ) : null}
          </div>
        </div>
        {!readOnly && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className="size-10 -mt-1 -mr-1 shrink-0 rounded-full flex items-center justify-center text-rose-600 active:bg-rose-50 cursor-pointer"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {godown && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 shrink-0">From</span>
          <select
            value={godown.value}
            onChange={(e) => godown.onChange(e.target.value)}
            disabled={readOnly}
            className="flex-1 min-w-0 min-h-[40px] px-2.5 rounded-lg border border-black/15 bg-slate-50 text-[13px] font-bold text-slate-900"
            aria-label={`Godown for ${name}`}
          >
            {godown.options.length === 0 && <option value="">Main Godown</option>}
            {godown.options.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <span className="text-[11px] font-semibold text-slate-500 shrink-0">{godown.stockText}</span>
        </div>
      )}

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-[11.5px] text-slate-500 leading-relaxed min-w-0">
          {(facts || []).map((f) => (
            <div key={f.label}>
              {f.label} <strong className={f.bad ? 'text-rose-700' : 'text-slate-900'}>{f.value}</strong>
            </div>
          ))}
        </div>
        <div className={`flex items-center gap-1 shrink-0 ${readOnly ? 'opacity-50' : ''}`}>
          <button
            type="button"
            onClick={onMinus}
            disabled={readOnly}
            aria-label={`Less ${name}`}
            className="size-11 rounded-xl border border-black/15 bg-slate-50 flex items-center justify-center text-slate-700 active:scale-95 disabled:cursor-not-allowed cursor-pointer"
          >
            <Minus size={18} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={qty}
            readOnly={readOnly}
            onChange={(e) => onQty(e.target.value)}
            onFocus={(e) => e.target.select()}
            aria-label={`Cases of ${name}`}
            className="w-16 h-11 text-center rounded-xl border-2 border-[var(--primary)]/40 bg-white text-lg font-black tabular-nums text-slate-900 focus:outline-none focus:border-[var(--primary)]"
          />
          <button
            type="button"
            onClick={onPlus}
            disabled={readOnly}
            aria-label={`More ${name}`}
            className="size-11 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center active:scale-95 disabled:cursor-not-allowed cursor-pointer"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {warning && (
        <div className="mt-2 text-[12px] font-bold text-rose-700 flex items-start gap-1">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{warning}</span>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Step progress (1 → 2 → 3) for sequential load-sheet wizard          */
/* ------------------------------------------------------------------ */
export const StepProgress: React.FC<{
  step: 1 | 2 | 3;
  labels?: [string, string, string];
}> = ({ step, labels = ['Details', 'Products', 'Review'] }) => (
  <div className="mx-auto max-w-xl px-3 pt-2 pb-1">
    <div className="flex items-center gap-1.5">
      {([1, 2, 3] as const).map((n) => {
        const done = n < step;
        const active = n === step;
        return (
          <React.Fragment key={n}>
            {n > 1 && (
              <div
                className={`h-0.5 flex-1 rounded-full ${done || active ? 'bg-[var(--primary)]' : 'bg-black/10'}`}
                aria-hidden
              />
            )}
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div
                className={`size-7 rounded-full flex items-center justify-center text-[11px] font-black border-2 ${
                  done
                    ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                    : active
                      ? 'bg-white border-[var(--primary)] text-[var(--primary)]'
                      : 'bg-white border-black/15 text-slate-400'
                }`}
              >
                {done ? <Check size={13} strokeWidth={3} /> : n}
              </div>
              <span
                className={`text-[9.5px] font-bold uppercase tracking-wide ${
                  active ? 'text-[var(--primary)]' : done ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {labels[n - 1]}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Bottom action bar: up to three big icon + word buttons              */
/* ------------------------------------------------------------------ */
export interface BarAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone: 'cancel' | 'neutral' | 'add' | 'primary';
  disabled?: boolean;
  /** relative width, default 1 */
  grow?: number;
  id?: string;
}

const TONE: Record<BarAction['tone'], string> = {
  cancel: 'border-rose-300 bg-rose-50 text-rose-700 active:bg-rose-100',
  neutral: 'border-black/15 bg-white text-slate-800 active:bg-slate-100',
  add: 'border-dashed border-[var(--primary)]/60 bg-white text-[var(--primary)] active:bg-emerald-50',
  primary: 'border-[var(--primary)] bg-[var(--primary)] text-white active:bg-[var(--primary-hover)] shadow-sm',
};

export const ActionBar: React.FC<{ actions: BarAction[] }> = ({ actions }) => (
  <div className="shrink-0 border-t border-black/10 bg-[#faf8f5] px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    <div className="mx-auto max-w-xl flex gap-2">
      {actions.map((a) => (
        <button
          key={a.key}
          id={a.id}
          type="button"
          disabled={a.disabled}
          onClick={a.onClick}
          style={{ flexGrow: a.grow ?? 1, flexBasis: 0 }}
          className={`min-h-[58px] min-w-0 rounded-2xl border-2 px-2 flex flex-col items-center justify-center gap-0.5 text-[12.5px] font-black leading-tight cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-[0.98] ${TONE[a.tone]}`}
        >
          {a.icon}
          <span className="truncate max-w-full">{a.label}</span>
        </button>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Generic bottom sheet shell                                           */
/* ------------------------------------------------------------------ */
export const SheetShell: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; z?: number }> = ({
  title,
  subtitle,
  onClose,
  children,
  z = 60,
}) => (
  <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-slate-900/55" style={{ zIndex: z }} role="dialog" aria-modal="true" aria-label={title}>
    <div className="w-full sm:max-w-2xl bg-[#faf8f5] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden">
      <div className="mx-auto mt-2 h-1.5 w-11 rounded-full bg-slate-300 sm:hidden" />
      <div className="shrink-0 px-4 pt-2 pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900 leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="size-10 rounded-full bg-white border border-black/10 flex items-center justify-center text-slate-600 cursor-pointer">
          <X size={18} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Add products sheet                                                   */
/* ------------------------------------------------------------------ */
export interface AddProductsSheetProps {
  products: Product[];
  /** products already on the load sheet, with their cases */
  added: Record<number, number>;
  /** stock of a product, in the chosen godown when godowns are offered */
  stockOf: (productId: number, godownId?: string) => number;
  stockText?: (productId: number, godownId?: string) => string;
  godowns?: Warehouse[];
  godownId?: string;
  onGodown?: (id: string) => void;
  /** return an error message to keep the sheet open, or null when done */
  onConfirm: (picks: Record<number, number>, godownId?: string) => string | null;
  onCancel: () => void;
}

export const AddProductsSheet: React.FC<AddProductsSheetProps> = ({
  products,
  added,
  stockOf,
  stockText,
  godowns,
  godownId,
  onGodown,
  onConfirm,
  onCancel,
}) => {
  const [query, setQuery] = useState('');
  const [packFilter, setPackFilter] = useState<PackGroupKey | ''>('');
  const [size, setSize] = useState('');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);

  // Popup entry modal state when clicking Add (or Edit) on a product
  const [entryProduct, setEntryProduct] = useState<Product | null>(null);
  const [entryQtyText, setEntryQtyText] = useState('1');
  const entryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!entryProduct) return;
    const t = setTimeout(() => {
      entryInputRef.current?.focus();
      entryInputRef.current?.select();
    }, 20);
    return () => clearTimeout(t);
  }, [entryProduct]);

  const packGroups = useMemo(() => {
    const map = new Map<PackGroupKey, { info: PackGroupInfo; count: number }>();
    for (const p of products) {
      const info = productPackGroup(p);
      const existing = map.get(info.key);
      if (existing) existing.count += 1;
      else map.set(info.key, { info, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.info.order - b.info.order);
  }, [products]);

  const sizes = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      if (packFilter && productPackGroup(p).key !== packFilter) continue;
      const t = sizeTheme(p.volume, p.name);
      if (t.label && !m.has(t.label)) m.set(t.label, productSequenceVolume(p));
    }
    return Array.from(m.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => label)
      .slice(0, 10);
  }, [products, packFilter]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return products
      .filter((p) => {
        if (packFilter && productPackGroup(p).key !== packFilter) return false;
        if (q) {
          const hay = `${p.name} ${p.category || ''} ${p.pack || ''} ${productPackGroup(p).heading} ${sizeTheme(p.volume, p.name).label}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (size && sizeTheme(p.volume, p.name).label !== size) return false;
        if (inStockOnly && !added[p.id] && !picks[p.id] && stockOf(p.id, godownId) <= 0) return false;
        return true;
      })
      .sort(compareProductsInSequence);
  }, [products, packFilter, q, size, inStockOnly, added, picks, stockOf, godownId]);

  const groupedSections = useMemo(() => {
    const groups: { key: PackGroupKey; heading: string; items: Product[] }[] = [];
    for (const p of visible) {
      const info = productPackGroup(p);
      const last = groups[groups.length - 1];
      if (last && last.key === info.key) {
        last.items.push(p);
      } else {
        groups.push({ key: info.key, heading: info.heading, items: [p] });
      }
    }
    return groups;
  }, [visible]);

  const pickCount = Object.values(picks).filter((n) => n > 0).length;
  const pickCases = Object.values(picks).reduce((s, n) => s + (n > 0 ? n : 0), 0);

  const setQty = (pid: number, n: number) => {
    setError(null);
    setPicks((prev) => {
      const next = { ...prev };
      if (n > 0) next[pid] = n;
      else delete next[pid];
      return next;
    });
  };

  const openEntryPopup = (p: Product) => {
    const current = picks[p.id] || 0;
    setEntryProduct(p);
    setEntryQtyText(current > 0 ? String(current) : '1');
  };

  const commitEntryPopup = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!entryProduct) return;
    const parsed = Math.max(0, parseInt(entryQtyText, 10) || 0);
    setQty(entryProduct.id, parsed);
    setEntryProduct(null);
  };

  const stockLine = (p: Product) => (stockText ? stockText(p.id, godownId) : `${stockOf(p.id, godownId)} cs in stock`);

  const renderRow = (p: Product) => {
    const onTrip = added[p.id];
    const n = picks[p.id] || 0;
    const stock = stockOf(p.id, godownId);
    const over = n > stock;
    const stripe = sizeTheme(p.volume, p.name).hex;

    return (
      <div
        key={p.id}
        style={{ borderLeftWidth: 4, borderLeftColor: stripe }}
        className={`flex items-center justify-between gap-2.5 py-2.5 pl-3 pr-2 rounded-xl border transition-colors ${
          n > 0
            ? 'border-emerald-300 bg-emerald-50/90'
            : 'border-black/8 bg-white hover:border-black/15'
        }`}
      >
        <button
          type="button"
          disabled={Boolean(onTrip)}
          onClick={() => openEntryPopup(p)}
          className="min-w-0 flex-1 text-left cursor-pointer disabled:cursor-default"
        >
          <div className="text-[13.5px] font-bold text-slate-900 leading-snug break-words flex items-center gap-1.5 flex-wrap">
            <OdiaName name={p.name} nameOr={p.nameOr} />
            <SizeChip volume={p.volume} pack={p.pack} name={p.name} />
          </div>
          <div className={`text-[11.5px] mt-0.5 ${over ? 'text-amber-700 font-bold' : 'text-slate-500'}`}>
            {stockLine(p)}
            {p.unitsPerCrate ? ` · ${p.unitsPerCrate} pcs/cs` : ''}
            {over ? ' — more than in stock' : ''}
          </div>
        </button>

        {onTrip ? (
          <span className="shrink-0 inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1.5 rounded-full">
            <Check size={13} /> On trip · {onTrip}
          </span>
        ) : n > 0 ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => openEntryPopup(p)}
              aria-label={`Edit cases for ${p.name}`}
              className="min-h-[38px] px-3 rounded-xl bg-emerald-700 text-white text-[13px] font-black tabular-nums inline-flex items-center gap-1.5 cursor-pointer hover:bg-emerald-800 active:scale-95"
            >
              <span>{n} cs</span>
              <Pencil size={12} />
            </button>
            <button
              type="button"
              onClick={() => setQty(p.id, 0)}
              aria-label={`Remove ${p.name}`}
              className="size-9 rounded-xl border border-black/10 bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Add ${p.name}`}
            onClick={() => openEntryPopup(p)}
            className="shrink-0 min-h-[40px] px-3.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-[13px] font-black flex items-center gap-1 cursor-pointer active:scale-95"
          >
            <Plus size={15} /> Add
          </button>
        )}
      </div>
    );
  };

  const chip = (on: boolean) =>
    `shrink-0 min-h-[34px] px-3 rounded-full border text-[12px] font-bold whitespace-nowrap cursor-pointer ${
      on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-black/15 hover:bg-slate-50'
    }`;

  const confirm = () => {
    const msg = onConfirm(picks, godownId);
    if (msg) setError(msg);
  };

  const entryStock = entryProduct ? stockOf(entryProduct.id, godownId) : 0;
  const entryParsedQty = Math.max(0, parseInt(entryQtyText, 10) || 0);
  const entryOver = entryProduct ? entryParsedQty > entryStock : false;

  return (
    <SheetShell
      title="Add products to trip"
      subtitle="Grouped in sequence (PET, Can, Glass) · Tap Add to enter cases"
      onClose={onCancel}
    >
      <div className="shrink-0 px-4 space-y-2 pb-2 border-b border-black/8">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, size, PET, Can…"
            className="w-full min-h-[44px] pl-9 pr-8 rounded-xl border border-black/15 bg-white text-[14.5px] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {godowns && godowns.length > 1 && onGodown && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Godown">
            {godowns.map((w) => (
              <button key={w.id} type="button" role="tab" aria-selected={w.id === godownId} onClick={() => onGodown(w.id)} className={chip(w.id === godownId)}>
                {w.name}
              </button>
            ))}
          </div>
        )}

        {/* Pack sequence filter row: PET, Can, Glass, Tetra */}
        {packGroups.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                setPackFilter('');
                setSize('');
              }}
              className={chip(packFilter === '')}
            >
              All packs ({products.length})
            </button>
            {packGroups.map(({ info, count }) => (
              <button
                key={info.key}
                type="button"
                onClick={() => {
                  setPackFilter(packFilter === info.key ? '' : info.key);
                  setSize('');
                }}
                className={chip(packFilter === info.key)}
              >
                {info.heading} ({count})
              </button>
            ))}
          </div>
        )}

        {/* Stock toggle + ascending size chips */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setInStockOnly((v) => !v)}
            aria-pressed={inStockOnly}
            className={`shrink-0 min-h-[34px] px-3 rounded-full border text-[12px] font-bold whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              inStockOnly ? 'bg-emerald-100 text-emerald-900 border-emerald-500' : 'bg-white text-slate-500 border-black/15'
            }`}
          >
            {inStockOnly && <Check size={13} />} In stock only
          </button>
          <span className="shrink-0 self-center w-px h-5 bg-black/15" />
          <button type="button" onClick={() => setSize('')} className={chip(size === '')}>
            All sizes
          </button>
          {sizes.map((s) => (
            <button key={s} type="button" onClick={() => setSize(size === s ? '' : s)} className={chip(size === s)}>
              {s}
            </button>
          ))}
        </div>

        {pickCount > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-900">
            <span>
              Selected: {pickCount} product{pickCount === 1 ? '' : 's'} · {pickCases} cs
            </span>
            <button
              type="button"
              onClick={() => setPicks({})}
              className="text-rose-700 hover:underline cursor-pointer font-bold"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-[180px] overflow-y-auto overscroll-contain px-4 pb-3 space-y-4 pt-2">
        {groupedSections.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Nothing to show.{' '}
            {inStockOnly && (
              <button type="button" onClick={() => setInStockOnly(false)} className="font-bold text-[var(--primary)] underline cursor-pointer">
                Show out-of-stock items too
              </button>
            )}
          </div>
        ) : (
          groupedSections.map((sec) => (
            <section key={sec.key} className="space-y-1.5">
              <div className="sticky top-0 z-10 flex items-center justify-between bg-[#faf8f5]/95 backdrop-blur-xs py-1 px-1 text-[11px] font-black uppercase tracking-wider text-slate-600">
                <span>{sec.heading}</span>
                <span className="font-mono tabular-nums text-slate-400">{sec.items.length}</span>
              </div>
              <div className="space-y-1.5">
                {sec.items.map(renderRow)}
              </div>
            </section>
          ))
        )}
      </div>

      {error && (
        <div role="alert" className="mx-4 mb-2 flex items-start gap-2 p-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-[12.5px] font-bold">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <ActionBar
        actions={[
          { key: 'cancel', label: 'Cancel', icon: <X size={20} />, tone: 'cancel', onClick: onCancel, grow: 1, id: 'btn-add-sheet-cancel' },
          {
            key: 'done',
            label: pickCount > 0 ? `Done · ${pickCount} item${pickCount === 1 ? '' : 's'} · ${pickCases} cs` : 'Done',
            icon: <CheckCircle2 size={20} />,
            tone: 'primary',
            onClick: confirm,
            disabled: pickCount === 0,
            grow: 2.2,
            id: 'btn-add-sheet-done',
          },
        ]}
      />

      {/* Focused Quantity Entry Popup when clicking Add on any product */}
      {entryProduct && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-entry-popup-title"
          onClick={() => setEntryProduct(null)}
        >
          <form
            onSubmit={commitEntryPopup}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-black/10 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <SizeChip volume={entryProduct.volume} pack={entryProduct.pack} name={entryProduct.name} />
                  {entryProduct.unitsPerCrate ? (
                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {entryProduct.unitsPerCrate} pcs/cs
                    </span>
                  ) : null}
                </div>
                <h3 id="product-entry-popup-title" className="mt-1.5 text-base font-black text-slate-900 leading-snug break-words">
                  <OdiaName name={entryProduct.name} nameOr={entryProduct.nameOr} />
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {stockLine(entryProduct)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEntryProduct(null)}
                aria-label="Close entry popup"
                className="size-9 shrink-0 rounded-full border border-black/10 bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {godowns && godowns.length > 1 && onGodown && (
              <div>
                <label htmlFor="entry-popup-godown" className={fieldLabel}>
                  Source godown
                </label>
                <select
                  id="entry-popup-godown"
                  value={godownId}
                  onChange={(e) => onGodown(e.target.value)}
                  className={fieldBox}
                >
                  {godowns.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({stockOf(entryProduct.id, w.id)} cs)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="entry-popup-qty" className={fieldLabel}>
                Cases to load
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setEntryQtyText(String(Math.max(0, entryParsedQty - 1)))}
                  className="size-12 shrink-0 rounded-xl border border-black/15 bg-slate-50 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:scale-95 cursor-pointer"
                >
                  <Minus size={20} />
                </button>
                <input
                  ref={entryInputRef}
                  id="entry-popup-qty"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={entryQtyText}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setEntryQtyText(e.target.value)}
                  className="flex-1 min-w-0 h-12 text-center rounded-xl border-2 border-[var(--primary)] bg-white text-2xl font-black tabular-nums text-slate-900 focus:outline-none"
                />
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setEntryQtyText(String(entryParsedQty + 1))}
                  className="size-12 shrink-0 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center hover:bg-[var(--primary-hover)] active:scale-95 cursor-pointer"
                >
                  <Plus size={20} />
                </button>
              </div>

              {/* Quick-tap preset increments */}
              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                {[1, 5, 10, 20, 50].map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => setEntryQtyText(String(entryParsedQty + inc))}
                    className="min-h-[36px] px-3 rounded-lg border border-black/10 bg-slate-50 hover:bg-slate-100 text-xs font-black text-slate-800 cursor-pointer tabular-nums"
                  >
                    +{inc}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setEntryQtyText('0')}
                  className="ml-auto min-h-[36px] px-2.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {entryOver && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>Entered {entryParsedQty} cs, which is more than {entryStock} cs in this godown.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEntryProduct(null)}
                className="min-h-[48px] rounded-xl border border-black/15 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="btn-entry-popup-confirm"
                className="min-h-[48px] rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-black cursor-pointer shadow-sm"
              >
                {entryParsedQty > 0 ? `Add ${entryParsedQty} cs` : 'Remove'}
              </button>
            </div>
          </form>
        </div>
      )}
    </SheetShell>
  );
};

/* ------------------------------------------------------------------ */
/* Review sheet                                                         */
/* ------------------------------------------------------------------ */
export interface ReviewRow {
  key: string;
  name: string;
  product?: Product;
  qty: number;
  /** small line under the name, e.g. "Main Godown" or "was 10" */
  note?: string;
  noteTone?: 'normal' | 'changed' | 'bad';
}

export const ReviewSheet: React.FC<{
  title: string;
  facts: { label: string; value: string }[];
  rows: ReviewRow[];
  totalCases: number;
  warnings?: string[];
  error?: string | null;
  confirmLabel: string;
  onBack: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, facts, rows, totalCases, warnings = [], error, confirmLabel, onBack, onConfirm, onCancel }) => (
  <SheetShell title={title} subtitle="Check everything, then confirm" onClose={onBack} z={70}>
    <div className="flex-1 min-h-[160px] overflow-y-auto overscroll-contain px-4 pb-3 space-y-3">
      <div className="rounded-2xl border border-black/10 bg-white p-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{f.label}</div>
            <div className="text-[14px] font-bold text-slate-900 truncate">{f.value || '—'}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white divide-y divide-black/5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 px-3 py-2.5" style={{ borderLeft: `6px solid ${sizeTheme(r.product?.volume, r.name).hex}`, borderRadius: 4 }}>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-slate-900 leading-snug break-words"><OdiaName name={r.name} /></div>
              {r.note && (
                <div className={`text-[11.5px] ${r.noteTone === 'bad' ? 'text-rose-700 font-bold' : r.noteTone === 'changed' ? 'text-amber-700 font-bold' : 'text-slate-500'}`}>
                  {r.note}
                </div>
              )}
            </div>
            <div className="shrink-0 text-lg font-black tabular-nums text-slate-900">
              {r.qty} <span className="text-xs font-bold text-slate-500">cs</span>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-3 bg-[#ebe8e1] rounded-b-2xl">
          <span className="text-sm font-black text-slate-800">Total · {rows.length} item{rows.length === 1 ? '' : 's'}</span>
          <span className="text-xl font-black text-[var(--primary)] tabular-nums">{totalCases} cs</span>
        </div>
      </div>

      {warnings.map((w) => (
        <div key={w} className="flex items-start gap-2 p-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-[12.5px] font-semibold">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          {w}
        </div>
      ))}
      {error && (
        <div role="alert" className="flex items-start gap-2 p-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-[12.5px] font-bold">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
    <ActionBar
      actions={[
        { key: 'cancel', label: 'Cancel', icon: <X size={20} />, tone: 'cancel', onClick: onCancel, id: 'btn-review-cancel' },
        { key: 'back', label: 'Edit more', icon: <ArrowLeft size={20} />, tone: 'neutral', onClick: onBack, id: 'btn-review-back' },
        { key: 'ok', label: confirmLabel, icon: <CheckCircle2 size={20} />, tone: 'primary', onClick: onConfirm, grow: 1.6, id: 'btn-review-confirm' },
      ]}
    />
  </SheetShell>
);

/* ------------------------------------------------------------------ */
/* "Discard changes?" confirmation                                      */
/* ------------------------------------------------------------------ */
export const DiscardSheet: React.FC<{ message?: string; onKeep: () => void; onDiscard: () => void }> = ({
  message = 'Your changes have not been saved. If you cancel now they will be lost.',
  onKeep,
  onDiscard,
}) => (
  <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Discard changes">
    <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
      <div className="flex items-center gap-2 text-rose-700 font-black text-base">
        <AlertTriangle size={20} /> Cancel and lose changes?
      </div>
      <p className="text-sm text-slate-700 leading-relaxed">{message}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onKeep} className="min-h-[52px] rounded-2xl border-2 border-black/15 text-sm font-black text-slate-800 cursor-pointer">
          No, keep editing
        </button>
        <button type="button" id="btn-discard-yes" onClick={onDiscard} className="min-h-[52px] rounded-2xl bg-rose-600 text-white text-sm font-black cursor-pointer">
          Yes, cancel
        </button>
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Locked-field banner (salesman view)                                  */
/* ------------------------------------------------------------------ */
export const LockedBanner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-[12.5px] font-semibold text-slate-600">
    <Lock size={14} className="shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);
