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
  className = '',
}) => {
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
      className={`mw-panel bg-[var(--panel-solid)] ui-stat rounded-xl border border-[var(--border)] p-4 sm:p-5 shadow-sm flex flex-col justify-between transition-all hover:border-[var(--teal)]/25 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-fg)] truncate block">
            {title}
          </span>
          <div className={`text-xl sm:text-2xl font-black tracking-tight font-mono tabular-nums ${valueColor}`}>
            {value}
          </div>
        </div>
        {Icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconVariantStyles}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {(subtitle || trend || badge) && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] gap-2 font-medium">
          {subtitle && <span className="text-[var(--muted-fg)] truncate">{subtitle}</span>}
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
