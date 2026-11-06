import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  subtitle?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
  };
  badge?: string;
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  /** Phone-only pastel colour. Defaults from `variant` (success = received, danger = due, accent = sales). */
  tone?: 'sales' | 'profit' | 'received' | 'due' | 'neutral';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  badge,
  variant = 'default',
  tone,
  className = '',
}) => {
  const phoneTone =
    tone ?? ({ success: 'received', danger: 'due', accent: 'sales' } as const)[variant as 'success' | 'danger' | 'accent'] ?? 'neutral';
  const iconVariantStyles = {
    default: 'bg-[var(--canvas)] text-[var(--ink)]',
    accent: 'bg-[rgba(61,143,160,0.12)] text-[var(--teal)]',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
    danger: 'bg-rose-50 text-rose-600',
  }[variant];

  const valueColor = {
    default: 'text-[var(--ink)]',
    accent: 'text-[var(--deep)]',
    success: 'text-emerald-800',
    warning: 'text-[var(--warning)]',
    danger: 'text-rose-700',
  }[variant];

  return (
    <div
      data-tone={phoneTone}
      className={`mt-metric mw-panel bg-[var(--panel-solid)] ui-stat rounded-xl border border-[var(--border)] p-3 sm:p-4 lg:p-5 shadow-sm flex flex-col justify-between transition-all hover:border-[var(--teal)]/25 min-h-[110px] sm:min-h-[120px] overflow-hidden ${className}`}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
          <span className="mt-metric__label text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[var(--muted-fg)] line-clamp-2 leading-tight">
            {title}
          </span>
          <div
            className={`mt-metric__value text-lg sm:text-xl lg:text-2xl font-black tracking-tight font-mono tabular-nums leading-tight break-all ${valueColor}`}
          >
            {value}
          </div>
        </div>
        {Icon && (
          <div
            className={`mt-metric__icon w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 ${iconVariantStyles}`}
          >
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        )}
      </div>

      {(subtitle || trend || badge) && (
        <div className="mt-metric__sub mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-[var(--border)] flex items-start justify-between text-[10px] sm:text-[11px] gap-1.5 font-medium min-w-0">
          {subtitle && (
            <span className="text-[var(--muted-fg)] line-clamp-2 leading-snug flex-1 min-w-0">
              {subtitle}
            </span>
          )}
          {trend && (
            <span
              className={`font-bold shrink-0 ${
                trend.isNeutral
                  ? 'text-[var(--muted-fg)]'
                  : trend.isPositive
                    ? 'text-emerald-600'
                    : 'text-rose-600'
              }`}
            >
              {trend.value}
            </span>
          )}
          {badge && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[var(--canvas)] text-[var(--ink)] text-[10px] font-bold border border-[var(--border)]">
              {badge}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
