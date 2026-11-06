import React from 'react';

interface StatBlockProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  /** Phone-only pastel colour (sales, profit, received, due). Neutral white when omitted. */
  tone?: 'sales' | 'profit' | 'received' | 'due' | 'neutral';
  id?: string;
  className?: string;
}

/** KPI card — reference design system */
export const StatBlock: React.FC<StatBlockProps> = ({ label, value, sub, accent, tone = 'neutral', id, className = '' }) => {
  return (
    <div
      id={id}
      data-tone={tone}
      className={`mt-metric mw-panel bg-[var(--panel-solid)] border border-[var(--border)] rounded-xl px-4 py-3.5 sm:px-5 sm:py-4 flex flex-col justify-between h-full shadow-sm transition-all hover:border-[var(--teal)]/25 ${className}`}
    >
      <div className="space-y-1">
        <div className="mt-metric__label text-[10px] font-bold uppercase tracking-wider text-[var(--muted-fg)] truncate">
          {label}
        </div>
        <div
          className="mt-metric__value text-xl sm:text-2xl font-black tracking-tight truncate font-mono tabular-nums text-[var(--ink)]"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </div>
      </div>
      {sub && (
        <div className="mt-metric__sub text-[11px] sm:text-xs text-[var(--muted-fg)] mt-2.5 pt-2 border-t border-[var(--border)] truncate font-medium">
          {sub}
        </div>
      )}
    </div>
  );
};
