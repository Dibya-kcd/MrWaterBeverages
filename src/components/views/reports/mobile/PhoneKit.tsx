import React, { useState } from 'react';
import { 
  ChevronLeft, 
  FileSpreadsheet, 
  FileText, 
  Loader2, 
  Search, 
  X, 
  SlidersHorizontal, 
  ChevronDown, 
  Check, 
  Calendar 
} from 'lucide-react';

/**
 * Phone look for the money reports (Customer receipts, Daily collection, Beat-wise sales & due,
 * Product profit): one big headline number, plain words, colour for status
 * (green = paid, red = due, amber = late), big tap targets, filter chips instead of small controls,
 * and Excel / PDF always pinned at the bottom.
 *
 * These pieces are used inside `md:hidden` blocks. Tablet and desktop keep their existing layouts.
 */

/** Whole rupees when the amount is whole, otherwise two decimals: ₹1,84,250 / ₹1,250.50 */
export const rs = (n: number): string => {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return `₹${v.toLocaleString('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
};

/** "1.7L" / "16.4k" style short rupees for tight tiles. */
export const rsShort = (n: number): string => {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 10000000) return `${sign}₹${(a / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (a >= 100000) return `${sign}₹${(a / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (a >= 10000) return `${sign}₹${(a / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sign}${rs(a)}`;
};

/* ---------- header ---------- */

export const PhoneHeader: React.FC<{
  title: string;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  onBack?: () => void;
}> = ({ title, sub, right, onBack }) => (
  <div className="flex items-center gap-3">
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="size-10 shrink-0 rounded-2xl border border-blue-100/90 bg-white flex items-center justify-center text-slate-700 cursor-pointer active:scale-95 transition-all shadow-xs"
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
    )}
    <div className="min-w-0 flex-1">
      <h2 className="text-lg font-extrabold text-slate-900 leading-tight tracking-tight break-words">{title}</h2>
      {sub && <p className="text-xs text-slate-500 mt-0.5 break-words font-medium">{sub}</p>}
    </div>
    {right}
  </div>
);

/* ---------- hero card ---------- */

const HERO_TONE = {
  green: 'bg-gradient-to-br from-[#064E3B] via-[#063C2E] to-[#02261C] text-white shadow-xl shadow-emerald-950/20',
  navy: 'bg-gradient-to-br from-[#0B1E48] via-[#08183A] to-[#040E24] text-white shadow-xl shadow-blue-950/20',
  red: 'bg-gradient-to-br from-[#7F1D1D] via-[#601212] to-[#3B0707] text-white shadow-xl shadow-rose-950/20',
} as const;

export const HeroCard: React.FC<{
  tone?: keyof typeof HERO_TONE;
  label: string;
  value: string;
  negative?: boolean;
  action?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ tone = 'green', label, value, negative, action, children }) => (
  <div className={`rounded-3xl p-5 ${HERO_TONE[tone]}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">{label}</div>
      {action}
    </div>
    <div className={`mt-2 text-3xl sm:text-4xl leading-none font-extrabold tabular-nums tracking-tight ${negative ? 'text-rose-300' : 'text-white'}`}>{value}</div>
    {children && <div className="mt-3.5 space-y-2.5">{children}</div>}
  </div>
);

export interface BarPart {
  value: number;
  /** Tailwind background class */
  className: string;
}

/** Thick multi-colour bar. Renders nothing when every part is 0. */
export const SplitBar: React.FC<{ parts: BarPart[]; label: string; trackClass?: string }> = ({
  parts,
  label,
  trackClass = 'bg-white/15',
}) => {
  const total = parts.reduce((t, p) => t + Math.max(0, p.value), 0);
  if (total <= 0) return null;
  return (
    <div className={`flex h-2.5 rounded-full overflow-hidden ${trackClass}`} role="img" aria-label={label}>
      {parts.map((p, i) => (
        <div key={i} className={p.className} style={{ width: `${(Math.max(0, p.value) * 100) / total}%` }} />
      ))}
    </div>
  );
};

export const LegendDot: React.FC<{ dot: string; children: React.ReactNode }> = ({ dot, children }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span className={`size-2.5 rounded-full ${dot}`} aria-hidden="true" />
    {children}
  </span>
);

/* ---------- controls ---------- */

export interface ChipOption<T extends string> {
  id: T;
  label: string;
}

/** Filter chips: one line, swipe sideways when there are many. Active chip is dark. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
  trailing,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** Extra control shown after the chips inside the same swipe row (e.g. a godown picker). */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-0.5 px-0.5 py-0.5" role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={`shrink-0 min-h-[44px] px-4 rounded-full border text-[13px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
              on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-200 active:bg-slate-100'
            }`}
          >
            {o.label}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}

/**
 * Sort / filter as a single dropdown (avoids long pill rows that overflow on phone).
 * Prefer this over Chips when the control is a sort order.
 */
export function SortSelect<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const current = options.find((o) => o.id === value)?.label || label;
  return (
    <div className="relative w-full">
      <label className="sr-only" htmlFor={`sort-select-${label}`}>
        {label}
      </label>
      <select
        id={`sort-select-${label}`}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full appearance-none min-h-[44px] pl-3.5 pr-10 rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label.startsWith('Sort') ? o.label : `Sort: ${o.label}`}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">
        ▼
      </span>
      <span className="sr-only">{current}</span>
    </div>
  );
}

/** Two-way big switch (By day / By customer). */
export function BigSwitch<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200" role="tablist" aria-label={label}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`flex-1 min-h-[46px] rounded-xl text-[14px] font-bold cursor-pointer transition-colors ${
              on ? 'bg-[#0b4d3a] text-white shadow-sm' : 'text-slate-600 active:bg-slate-200'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const PhoneSearch: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({
  value,
  onChange,
  placeholder,
}) => (
  <div className="relative">
    <Search size={18} className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
    <input
      type="text"
      enterKeyHint="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full min-h-[48px] pl-10 pr-10 text-[15px] rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 placeholder:text-slate-400"
    />
    {value && (
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange('')}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 size-10 flex items-center justify-center text-slate-400 cursor-pointer"
      >
        <X size={16} />
      </button>
    )}
  </div>
);

/* ---------- small pieces ---------- */

const TAG = {
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  red: 'bg-rose-50 text-rose-700 border-rose-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  blue: 'bg-sky-50 text-sky-800 border-sky-200',
  grey: 'bg-slate-100 text-slate-700 border-slate-200',
} as const;

export const Tag: React.FC<{ tone?: keyof typeof TAG; children: React.ReactNode }> = ({ tone = 'grey', children }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11.5px] font-bold leading-none ${TAG[tone]}`}>
    {children}
  </span>
);

const TILE = {
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-sky-50 text-sky-700',
  red: 'bg-rose-50 text-rose-700',
  grey: 'bg-slate-100 text-slate-600',
} as const;

/** Rounded icon square at the left of a row. */
export const IconTile: React.FC<{ tone: keyof typeof TILE; children: React.ReactNode }> = ({ tone, children }) => (
  <div className={`size-11 shrink-0 rounded-2xl flex items-center justify-center text-lg font-bold ${TILE[tone]}`} aria-hidden="true">
    {children}
  </div>
);

/** Small grey tile with a label and a figure (Sales / Received / Collected...). */
export const MiniStat: React.FC<{ label: string; value: React.ReactNode; tone?: 'ink' | 'green' | 'red' | 'amber' }> = ({
  label,
  value,
  tone = 'ink',
}) => {
  const c = { ink: 'text-slate-900', green: 'text-emerald-700', red: 'text-rose-700', amber: 'text-amber-700' }[tone];
  return (
    <div className="rounded-xl bg-slate-50 px-2.5 py-2 min-w-0">
      <div className="text-[10.5px] font-semibold text-slate-500 leading-tight">{label}</div>
      <div className={`text-[15px] font-extrabold tabular-nums leading-tight mt-0.5 ${c}`}>{value}</div>
    </div>
  );
};

/** A white list card used for one row / one group of rows. */
export const RowCard: React.FC<{
  children: React.ReactNode;
  /** Coloured left edge: green / amber / red */
  edge?: 'green' | 'amber' | 'red';
  className?: string;
}> = ({ children, edge, className = '' }) => {
  const stripe = edge ? { green: 'bg-emerald-600', amber: 'bg-amber-500', red: 'bg-rose-600' }[edge] : '';
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {edge && <span className={`absolute inset-y-0 left-0 w-1.5 ${stripe}`} aria-hidden="true" />}
      {children}
    </div>
  );
};

export const DayHeading: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <div className="flex items-baseline justify-between gap-3 px-1 pt-1">
    <span className="text-[15px] font-extrabold text-slate-900">{left}</span>
    {right && <span className="text-xs text-slate-500 tabular-nums">{right}</span>}
  </div>
);

export const EmptyNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white py-10 px-4 text-center text-sm text-slate-500">{children}</div>
);

/** "Wed, 4 Nov" */
export const fmtDayShort = (d: string): string => {
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

/* ---------- bottom Excel / PDF bar ---------- */

/**
 * Excel and PDF, always at the bottom (fixed just above the bottom navigation).
 * Place it once at the end of a phone block; it adds its own spacer so the last row is never hidden.
 */
export const PhoneDownloadBar: React.FC<{
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
  disabled?: boolean;
}> = ({ onExcel, onPdf, disabled }) => {
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const [err, setErr] = useState('');

  const run = async (kind: 'xlsx' | 'pdf', fn: () => Promise<void> | void) => {
    setBusy(kind);
    setErr('');
    try {
      await fn();
    } catch (e) {
      console.error('Report download failed', e);
      setErr('Download failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="h-20" aria-hidden="true" />
      <div className="fixed inset-x-0 z-30 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] px-3 py-2 bg-[#f6f4ef]/95 backdrop-blur border-t border-black/5">
        {err && <div className="text-[11px] text-rose-700 text-center pb-1">{err}</div>}
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={disabled || busy !== null}
            onClick={() => run('xlsx', onExcel)}
            aria-label="Download Excel"
            className="flex-1 min-h-[52px] rounded-2xl border-2 border-[#0b4d3a] bg-white text-[#0b4d3a] text-[15px] font-bold inline-flex items-center justify-center gap-2 cursor-pointer active:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'xlsx' ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
            Excel
          </button>
          <button
            type="button"
            disabled={disabled || busy !== null}
            onClick={() => run('pdf', onPdf)}
            aria-label="Download PDF"
            className="flex-1 min-h-[52px] rounded-2xl border-2 border-[#0b4d3a] bg-[#0b4d3a] text-white text-[15px] font-bold inline-flex items-center justify-center gap-2 cursor-pointer active:bg-[#093d2e] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === 'pdf' ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
            PDF
          </button>
        </div>
      </div>
    </>
  );
};

/* ---------- Unified Search + Filter Bar & Bottom Sheet (Daily Collection style) ---------- */

export const UnifiedPhoneFilterBar: React.FC<{
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  onOpenFilter: () => void;
  activeFilterCount?: number;
  showFilterButton?: boolean;
}> = ({
  search,
  onSearch,
  placeholder = 'Search…',
  onOpenFilter,
  activeFilterCount = 0,
  showFilterButton = true,
}) => (
  <div className="bg-white rounded-2xl border border-blue-100/90 shadow-xs px-3.5 py-2.5 flex items-center justify-between gap-2">
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Search size={18} className="text-slate-400 shrink-0" />
      <input
        type="text"
        enterKeyHint="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        className="w-full text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent"
      />
      {search && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onSearch('')}
          className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer shrink-0"
        >
          <X size={15} />
        </button>
      )}
    </div>

    {showFilterButton && (
      <>
        <div className="h-5 w-px bg-slate-200 mx-1 shrink-0" />
        <button
          type="button"
          onClick={onOpenFilter}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-all shrink-0 cursor-pointer font-bold text-xs sm:text-sm ${
            activeFilterCount > 0
              ? 'bg-blue-50 text-blue-700'
              : 'text-blue-600 hover:bg-blue-50 active:scale-95'
          }`}
        >
          <SlidersHorizontal size={15} className="text-blue-600 stroke-[2.2]" />
          <span>Filter</span>
          {activeFilterCount > 0 ? (
            <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center ml-0.5">
              {activeFilterCount}
            </span>
          ) : (
            <ChevronDown size={14} className="text-blue-600 stroke-[2.5]" />
          )}
        </button>
      </>
    )}
  </div>
);

export const PhoneFilterBottomSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  onReset?: () => void;
  activeCount?: number;
  children: React.ReactNode;
  onApply?: () => void;
  applyLabel?: string;
}> = ({
  isOpen,
  onClose,
  title = 'Filters',
  onReset,
  activeCount = 0,
  children,
  onApply,
  applyLabel = 'Apply Filters',
}) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-4 max-h-[88vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-blue-600" />
            <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          </div>
          <div className="flex items-center gap-3">
            {onReset && activeCount > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="size-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">{children}</div>

        {/* Apply Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              if (onApply) onApply();
              onClose();
            }}
            className="w-full py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Check size={18} />
            <span>{applyLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

