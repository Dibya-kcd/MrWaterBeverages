import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Phone layout shared by the report screens: one-line tabs, and one compact "register card" per row
 * (title + big figure, a paid/due bar, a few labelled figures, optional tap-to-expand details).
 * Tablet and desktop keep their tables; these are used inside `md:hidden` blocks.
 */

export type Tone = 'ink' | 'green' | 'red' | 'amber' | 'sky' | 'muted';

const TONE: Record<Tone, string> = {
  ink: 'text-slate-900',
  green: 'text-emerald-700',
  red: 'text-rose-700',
  amber: 'text-amber-700',
  sky: 'text-sky-800',
  muted: 'text-slate-500',
};

export interface MobileTab<T extends string> {
  id: T;
  label: string;
  count?: number | string;
  /** Optional DOM id (kept so existing automation / tests still find the button). */
  domId?: string;
}

/** Sub-tab strip: every label on one line, swipes sideways if there are many. */
export function MobileSegTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: MobileTab<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            id={t.domId}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`shrink-0 min-h-[44px] px-3.5 rounded-xl border text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
              on
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-white text-slate-800 border-slate-200 active:bg-slate-100'
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className={on ? 'text-slate-300' : 'text-slate-500'}> · {t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface CardStat {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}

export const StatCell: React.FC<CardStat & { align?: 'left' | 'right' | 'center' }> = ({
  label,
  value,
  tone = 'ink',
  align = 'left',
}) => (
  <div className={`min-w-0 overflow-hidden ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}`}>
    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 truncate">{label}</div>
    <div className={`text-[14px] sm:text-[15px] font-extrabold tabular-nums leading-tight mt-0.5 break-words ${TONE[tone]}`}>
      {value}
    </div>
  </div>
);

export interface RegisterCardProps {
  id?: string;
  title: React.ReactNode;
  /** Small tags next to the title (Today, Paid, category...). */
  pills?: React.ReactNode;
  subtitle?: React.ReactNode;
  heroLabel?: string;
  hero?: React.ReactNode;
  heroTone?: Tone;
  /** Green / red bar, e.g. money in hand vs due. Hidden when both are 0. */
  split?: { a: number; b: number; label?: string };
  /** Multi-colour bar (e.g. aging buckets). `className` is a Tailwind background class. */
  segments?: { value: number; className: string; label?: string }[];
  /** Labelled figures, three per row. */
  stats?: CardStat[];
  /** Chips and small notes under the figures. */
  note?: React.ReactNode;
  /** Buttons row (View, WhatsApp...). */
  actions?: React.ReactNode;
  expandable?: {
    expanded: boolean;
    onToggle: () => void;
    label: string;
    expandedLabel?: string;
    content: React.ReactNode;
  };
}

export const RegisterCard: React.FC<RegisterCardProps> = ({
  id,
  title,
  pills,
  subtitle,
  heroLabel,
  hero,
  heroTone = 'ink',
  split,
  segments,
  stats,
  note,
  actions,
  expandable,
}) => {
  const total = split ? Math.max(0, split.a) + Math.max(0, split.b) : 0;
  const aPct = split && total > 0 ? Math.round((Math.max(0, split.a) * 100) / total) : 0;
  return (
    <div id={id} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3.5 flex flex-col gap-3 overflow-hidden">
      <div className="flex items-start justify-between gap-2 sm:gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold text-slate-900 break-words">{title}</span>
            {pills}
          </div>
          {subtitle && <div className="text-xs text-slate-600 mt-1 break-words">{subtitle}</div>}
        </div>
        {hero !== undefined && (
          <div className="text-right shrink-0 max-w-[45%]">
            {heroLabel && <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 truncate">{heroLabel}</div>}
            <div className={`text-[17px] sm:text-[19px] font-extrabold tabular-nums leading-tight break-all ${TONE[heroTone]}`}>
              {hero}
            </div>
          </div>
        )}
      </div>

      {split && total > 0 && (
        <div
          className="flex h-2 rounded-full overflow-hidden bg-slate-100"
          role="img"
          aria-label={split.label || 'Collected versus due'}
        >
          <div className="bg-emerald-600" style={{ width: `${aPct}%` }} />
          <div className="bg-rose-600" style={{ width: `${100 - aPct}%` }} />
        </div>
      )}

      {segments && segments.reduce((t, x) => t + Math.max(0, x.value), 0) > 0 && (
        <div
          className="flex h-2 rounded-full overflow-hidden bg-slate-100"
          role="img"
          aria-label={segments.map((x) => x.label).filter(Boolean).join(', ') || 'Breakdown'}
        >
          {segments.map((x, i) => (
            <div key={i} className={x.className} style={{ width: `${(Math.max(0, x.value) * 100) / segments.reduce((t, y) => t + Math.max(0, y.value), 0)}%` }} />
          ))}
        </div>
      )}

      {stats && stats.length > 0 && (
        <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
          {stats.map((s, i) => (
            <StatCell key={s.label} {...s} align={i % 3 === 2 ? 'right' : 'left'} />
          ))}
        </div>
      )}

      {note}

      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}

      {expandable && (
        <>
          {expandable.expanded && <div className="border-t border-slate-100 pt-2">{expandable.content}</div>}
          <button
            type="button"
            onClick={expandable.onToggle}
            aria-expanded={expandable.expanded}
            className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 text-[13px] font-bold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer active:bg-slate-100"
          >
            {expandable.expanded ? expandable.expandedLabel || 'Hide details' : expandable.label}
            <ChevronDown size={16} className={expandable.expanded ? 'rotate-180' : ''} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
};

/** Pill / tag used on cards. */
export const Pill: React.FC<{ children: React.ReactNode; tone?: 'green' | 'red' | 'amber' | 'blue' | 'indigo' | 'slate' }> = ({
  children,
  tone = 'slate',
}) => {
  const c = {
    green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    red: 'bg-rose-100 text-rose-800 border-rose-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    blue: 'bg-blue-100 text-sky-800 border-sky-200',
    indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  }[tone];
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase ${c}`}>{children}</span>;
};

/** One-line list row inside an expanded card (label + sub-line on the left, figure on the right). */
export const DetailRow: React.FC<{
  title: React.ReactNode;
  sub?: React.ReactNode;
  value?: React.ReactNode;
  valueTone?: Tone;
  tag?: React.ReactNode;
}> = ({ title, sub, value, valueTone = 'ink', tag }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-t border-slate-100 first:border-t-0">
    <div className="min-w-0">
      <div className="text-[13px] font-bold text-slate-900 break-words">{title}</div>
      {sub && <div className="text-[11px] text-slate-500 break-words">{sub}</div>}
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {value !== undefined && <span className={`text-[13px] font-extrabold tabular-nums ${TONE[valueTone]}`}>{value}</span>}
      {tag}
    </div>
  </div>
);

/** Replaces a table footer on phones: a dark totals strip with a few labelled figures. */
export const TotalsCard: React.FC<{ title: string; items: CardStat[] }> = ({ title, items }) => (
  <div className="rounded-2xl bg-slate-900 text-white p-3.5">
    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-300">{title}</div>
    <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
      {items.map((s) => (
        <div key={s.label} className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{s.label}</div>
          <div className="text-[15px] font-extrabold tabular-nums leading-tight">{s.value}</div>
        </div>
      ))}
    </div>
  </div>
);
