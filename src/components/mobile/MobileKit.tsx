import React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Shared building blocks for the phone theme (see src/mobile-theme.css).
 *
 * Every piece renders the same markup on every screen size. The `mt-*` classes only do
 * something inside the `max-width: 767px` block of mobile-theme.css, so tablet and desktop
 * keep whatever Tailwind classes are passed in (`className`, `valueClassName`).
 */

export type MetricTone = 'sales' | 'profit' | 'received' | 'due' | 'neutral';

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  /** Small line under the value (period, count, hint). */
  sub?: React.ReactNode;
  /** Phone-only icon tile. Hidden from tablet up. */
  icon?: LucideIcon;
  /** Phone colour: sales = blue, profit = purple, received = green, due = red. */
  tone?: MetricTone;
  id?: string;
  onClick?: () => void;
  /** Classes for the card on tablet / desktop. */
  className?: string;
  /** Classes for the amount on tablet / desktop. */
  valueClassName?: string;
}

/** Pastel finance tile: icon + label on top, bold amount, optional sub line. 18px radius on phones. */
export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'neutral',
  id,
  onClick,
  className = 'bg-white rounded-2xl border border-black/5 shadow-sm p-3.5',
  valueClassName = 'text-slate-900',
}) => {
  const body = (
    <>
      <div className="mt-metric__head">
        {Icon && (
          <span className="mt-metric__icon md:hidden" aria-hidden="true">
            <Icon size={16} strokeWidth={2.2} />
          </span>
        )}
        <div className="mt-metric__label text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      </div>
      <div className={`mt-metric__value text-lg font-bold mt-1 tabular-nums ${valueClassName}`}>{value}</div>
      {sub != null && sub !== '' && <div className="mt-metric__sub text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        id={id}
        onClick={onClick}
        data-tone={tone}
        className={`mt-metric text-left cursor-pointer ${className}`}
      >
        {body}
      </button>
    );
  }
  return (
    <div id={id} data-tone={tone} className={`mt-metric ${className}`}>
      {body}
    </div>
  );
};

/** Two-column metric grid on phones (12px gap); keeps the caller's columns from tablet up. */
export const MetricGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = 'grid grid-cols-2 sm:grid-cols-4 gap-2.5',
}) => <div className={`mt-grid ${className}`}>{children}</div>;

/** Titled block with a 20px gap to the next block on phones. */
export const MobileSection: React.FC<{
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, action, children, className = '' }) => (
  <section className={`mt-section ${className}`}>
    {(title || action) && (
      <div className="mt-section__head flex items-center justify-between gap-3 mb-2">
        {title && <h2 className="mt-section__title text-base font-bold text-slate-900">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);
