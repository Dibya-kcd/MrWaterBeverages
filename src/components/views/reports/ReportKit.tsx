import React from 'react';
import { ChevronDown, Info, Search, X } from 'lucide-react';

/**
 * Desktop / tablet building blocks for every report screen.
 *
 * They are lifted straight from "Daily collection" (the reference report) so all reports share one look:
 *   title row + Share menu  ->  stat tiles  ->  one-line breakdown + "How is this calculated?"
 *   ->  always-visible filter panel (search + chips)  ->  one collapsed card per day / group.
 *
 * Phone layouts use `mobile/PhoneKit.tsx` (same idea, bigger tap targets). These pieces are for `md:` and up.
 */

export const reportCard = 'rounded-2xl border border-black/10 bg-white';

/* ---------- title row ---------- */

export const ReportTitleBar: React.FC<{
  title: string;
  sub?: React.ReactNode;
  /** Right side, normally <ReportDownloadButtons /> */
  actions?: React.ReactNode;
}> = ({ title, sub, actions }) => (
  <div className="flex items-start justify-between gap-2">
    <div className="min-w-0">
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
    {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
  </div>
);

/* ---------- stat tiles ---------- */

export type StatTone = 'ink' | 'green' | 'red' | 'amber' | 'sky';
const STAT_TONE: Record<StatTone, string> = {
  ink: 'text-slate-900',
  green: 'text-emerald-700',
  red: 'text-rose-700',
  amber: 'text-amber-700',
  sky: 'text-sky-700',
};

export const ReportStat: React.FC<{ label: string; value: React.ReactNode; tone?: StatTone; sub?: React.ReactNode }> = ({
  label,
  value,
  tone = 'ink',
  sub,
}) => (
  <div className={`${reportCard} p-3`}>
    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
    <div className={`text-lg font-extrabold tabular-nums ${STAT_TONE[tone]}`}>{value}</div>
    {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
  </div>
);

/** 2 / 3 / 4 equal tiles in one row. */
export const ReportStatGrid: React.FC<{ cols?: 2 | 3 | 4; children: React.ReactNode }> = ({ cols = 4, children }) => (
  <div className={`grid gap-2 ${cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>{children}</div>
);

/** "Cash ₹.. · UPI ₹.." line with an optional "How is this calculated?" link on the right. */
export const ReportBreakdownLine: React.FC<{ children: React.ReactNode; onExplain?: () => void }> = ({ children, onExplain }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
    <span>{children}</span>
    {onExplain && (
      <button
        type="button"
        onClick={onExplain}
        className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline cursor-pointer"
      >
        <Info size={13} aria-hidden="true" /> How is this calculated?
      </button>
    )}
  </div>
);

/* ---------- filters ---------- */

export const ReportFilterChip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
      on ? 'bg-emerald-700 text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
    }`}
  >
    {children}
  </button>
);

export function ReportChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto" role="group" aria-label={label}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mr-0.5">{label}</span>
      {options.map((o) => (
        <ReportFilterChip key={o.id} on={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count !== undefined && o.id !== options[0].id && <span className="opacity-70"> {o.count}</span>}
        </ReportFilterChip>
      ))}
    </div>
  );
}

export const ReportSearch: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({
  value,
  onChange,
  placeholder,
}) => (
  <div className="relative">
    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      enterKeyHint="search"
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 placeholder:text-slate-400"
    />
    {value && (
      <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

/** The white filter box: optional search, then chip rows (pass <ReportChipGroup/>s as children). */
export const ReportFilterPanel: React.FC<{
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  isFiltered?: boolean;
  onReset?: () => void;
  children?: React.ReactNode;
}> = ({ search, isFiltered, onReset, children }) => (
  <div className={`${reportCard} p-3 space-y-2.5`}>
    {search && <ReportSearch {...search} />}
    {(children || (isFiltered && onReset)) && (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {children}
        {isFiltered && onReset && (
          <button type="button" onClick={onReset} className="ml-auto text-xs font-bold text-rose-600 hover:underline cursor-pointer">
            Clear filters
          </button>
        )}
      </div>
    )}
  </div>
);

/** "5 days · 23 transactions match" + Expand / Collapse all. */
export const ReportListMeta: React.FC<{
  children: React.ReactNode;
  allOpen?: boolean;
  onToggleAll?: () => void;
}> = ({ children, allOpen, onToggleAll }) => (
  <div className="flex items-center justify-between px-1 text-xs text-slate-500">
    <span>{children}</span>
    {onToggleAll && (
      <button type="button" onClick={onToggleAll} className="font-bold text-slate-700 hover:underline cursor-pointer">
        {allOpen ? 'Collapse all' : 'Expand all'}
      </button>
    )}
  </div>
);

/* ---------- collapsible group card (the "day card") ---------- */

export const ReportGroupCard: React.FC<{
  /** Bold first line, e.g. "Today · Wed, 04 Nov 2026" */
  title: React.ReactNode;
  /** Small grey second line. */
  sub?: React.ReactNode;
  /** Optional small figures shown between title and headline on wide screens. */
  inline?: React.ReactNode;
  /** Headline figure on the right. */
  headLabel?: string;
  head?: React.ReactNode;
  headTone?: StatTone;
  open: boolean;
  onToggle: () => void;
  /** Pass true to lock the card open (e.g. while searching). */
  locked?: boolean;
  children?: React.ReactNode;
}> = ({ title, sub, inline, headLabel, head, headTone = 'green', open, onToggle, locked, children }) => (
  <section className={`${reportCard} overflow-hidden`}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      disabled={locked}
      className="w-full text-left px-3.5 py-2.5 bg-[#faf8f5] cursor-pointer active:bg-slate-100 disabled:cursor-default"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-slate-900">{title}</div>
          {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {inline && <div className="hidden lg:flex items-center gap-4 text-xs text-slate-600 tabular-nums">{inline}</div>}
          {head !== undefined && (
            <div className="text-right">
              {headLabel && <div className="text-[11px] text-slate-500">{headLabel}</div>}
              <div className={`text-[14px] font-extrabold tabular-nums leading-tight ${STAT_TONE[headTone]}`}>{head}</div>
            </div>
          )}
          {!locked && <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </div>
      </div>
    </button>
    {open && <div className="border-t border-black/5">{children}</div>}
  </section>
);

/** One row inside a group card: title + small line on the left, figure + status on the right. */
export const ReportRow: React.FC<{
  title: React.ReactNode;
  sub?: React.ReactNode;
  amount?: React.ReactNode;
  amountTone?: StatTone;
  status?: React.ReactNode;
  statusTone?: StatTone | 'muted';
}> = ({ title, sub, amount, amountTone = 'ink', status, statusTone = 'muted' }) => (
  <li className="px-3.5 py-2.5 flex items-start gap-3">
    <div className="min-w-0 flex-1">
      <div className="text-[14px] font-semibold text-slate-900 leading-snug break-words">{title}</div>
      {sub && <div className="text-xs text-slate-500 leading-snug break-words">{sub}</div>}
    </div>
    <div className="text-right shrink-0">
      {amount !== undefined && <div className={`text-[14px] font-extrabold tabular-nums ${STAT_TONE[amountTone]}`}>{amount}</div>}
      {status && <div className={`text-[11px] ${statusTone === 'muted' ? 'text-slate-400' : `font-semibold ${STAT_TONE[statusTone]}`}`}>{status}</div>}
    </div>
  </li>
);

export const ReportList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul className="divide-y divide-black/5">{children}</ul>
);

/* ---------- empty + explain ---------- */

export const ReportEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={`${reportCard} py-10 text-center text-sm text-slate-400`}>{children}</div>
);

export const ReportExplainModal: React.FC<{
  title?: string;
  ariaLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title = 'How this is calculated', ariaLabel, onClose, children }) => (
  <div
    className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
    onClick={onClose}
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabel}
  >
    <div
      className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-3 max-h-[88vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="size-9 rounded-xl text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer">
          <X size={18} />
        </button>
      </div>
      <div className="space-y-2 text-xs leading-relaxed text-slate-700">{children}</div>
      <div className="text-right">
        <button type="button" onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">
          Got it
        </button>
      </div>
    </div>
  </div>
);

export const ExplainBox: React.FC<{ tone?: 'slate' | 'rose' | 'emerald' | 'amber'; title: string; children?: React.ReactNode }> = ({
  tone = 'slate',
  title,
  children,
}) => {
  const t = {
    slate: ['bg-slate-50 border-slate-200', 'text-slate-900', 'text-slate-600'],
    rose: ['bg-rose-50 border-rose-200', 'text-rose-800', 'text-rose-700'],
    emerald: ['bg-emerald-50 border-emerald-200', 'text-emerald-900', 'text-emerald-800'],
    amber: ['bg-amber-50 border-amber-200', 'text-amber-900', 'text-amber-800'],
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${t[0]}`}>
      <div className={`font-bold ${t[1]}`}>{title}</div>
      {children && <div className={t[2]}>{children}</div>}
    </div>
  );
};
