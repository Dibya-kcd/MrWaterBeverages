import React from 'react';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';

/**
 * Phone navigation inside one report (Sales, margin & P&L / Returns, free & claims / GST).
 *
 * Instead of a row of tabs / chips, every section of the report is a full-width card row:
 * icon, FULL section name (wraps, never cut off), a plain summary line (wraps, never cut off)
 * and a figure badge. Tapping a card opens that section as its own page inside the report;
 * a "back" bar returns to the list.
 *
 * Used inside `md:hidden` blocks only. Tablet and desktop keep their chip / tab views.
 */

/** Opening or leaving a section starts at the top of the page, not wherever the list was scrolled to. */
const toTop = () => {
  try {
    window.scrollTo({ top: 0 });
  } catch {
    /* not scrollable (tests / preview) */
  }
};

export type SubPageTone = 'indigo' | 'emerald' | 'blue' | 'amber' | 'purple' | 'cyan' | 'rose' | 'sky' | 'slate';

const TONE: Record<SubPageTone, { tile: string; icon: string }> = {
  indigo: { tile: 'bg-indigo-50 border-indigo-100', icon: 'text-indigo-600' },
  emerald: { tile: 'bg-emerald-50 border-emerald-100', icon: 'text-emerald-600' },
  blue: { tile: 'bg-blue-50 border-blue-100', icon: 'text-blue-600' },
  amber: { tile: 'bg-amber-50 border-amber-100', icon: 'text-amber-600' },
  purple: { tile: 'bg-purple-50 border-purple-100', icon: 'text-purple-600' },
  cyan: { tile: 'bg-cyan-50 border-cyan-100', icon: 'text-cyan-600' },
  rose: { tile: 'bg-rose-50 border-rose-100', icon: 'text-rose-600' },
  sky: { tile: 'bg-sky-50 border-sky-100', icon: 'text-sky-600' },
  slate: { tile: 'bg-slate-100 border-slate-200', icon: 'text-slate-600' },
};

export type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'cyan' | 'slate';

const BADGE: Record<BadgeTone, string> = {
  green: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  red: 'text-rose-700 bg-rose-50 border-rose-200',
  amber: 'text-amber-800 bg-amber-50 border-amber-200',
  blue: 'text-blue-700 bg-blue-50 border-blue-200',
  purple: 'text-purple-700 bg-purple-50 border-purple-200',
  cyan: 'text-cyan-700 bg-cyan-50 border-cyan-200',
  slate: 'text-slate-700 bg-slate-100 border-slate-200',
};

export interface SubPageCard<T extends string> {
  id: T;
  /** Full section name. */
  title: string;
  /** One plain sentence: what is inside and the key figures. */
  summary: string;
  /** Short figure shown as a pill (amount, count...). */
  badge?: string;
  badgeTone?: BadgeTone;
  icon: LucideIcon;
  tone?: SubPageTone;
}

export function SubPageMenu<T extends string>({
  heading,
  cards,
  onOpen,
}: {
  heading: string;
  cards: SubPageCard<T>[];
  onOpen: (id: T) => void;
}) {
  return (
    <section className="space-y-2.5" aria-label={heading}>
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">{heading}</h3>
        <span className="text-xs font-semibold text-slate-400">
          {cards.length} section{cards.length === 1 ? '' : 's'}
        </span>
      </div>

      {cards.map((card) => {
        const Icon = card.icon;
        const tone = TONE[card.tone || 'blue'];
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => {
              onOpen(card.id);
              toTop();
            }}
            className="group w-full text-left flex items-center gap-3 rounded-2xl border border-blue-100/80 bg-white p-3.5 shadow-xs active:scale-[0.99] active:bg-slate-50 hover:border-blue-200 transition-all cursor-pointer"
          >
            <div className={`size-11 shrink-0 rounded-xl border flex items-center justify-center ${tone.tile}`} aria-hidden="true">
              <Icon size={22} className={tone.icon} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-extrabold text-slate-900 leading-snug break-words">{card.title}</div>
              <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500 font-medium break-words">{card.summary}</p>
              {card.badge && (
                <span
                  className={`mt-1.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold tabular-nums ${BADGE[card.badgeTone || 'slate']}`}
                >
                  {card.badge}
                </span>
              )}
            </div>
            <ChevronRight size={20} className="shrink-0 text-slate-400 group-active:text-blue-600" aria-hidden="true" />
          </button>
        );
      })}
    </section>
  );
}

/** Bar shown at the top of an opened section: back to the list + the section's full name. */
export const SubPageBack: React.FC<{ backLabel: string; title: string; onBack: () => void }> = ({
  backLabel,
  title,
  onBack,
}) => (
  <div className="space-y-2">
    <button
      type="button"
      onClick={() => {
        onBack();
        toTop();
      }}
      className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-full bg-white border border-blue-100 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
    >
      <ArrowLeft size={14} className="text-blue-600" aria-hidden="true" />
      <span>{backLabel}</span>
    </button>
    <h3 className="px-1 text-[17px] font-extrabold text-slate-900 leading-snug break-words">{title}</h3>
  </div>
);
