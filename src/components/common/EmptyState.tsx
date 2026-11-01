import React from 'react';
import { Inbox, LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  /** Short headline, e.g. "No payments found" */
  title: string;
  /** Optional supporting sentence */
  description?: string;
  /** Icon component from lucide-react (defaults to Inbox) */
  icon?: LucideIcon;
  /** Optional primary action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Compact layout for tables / tight panels */
  compact?: boolean;
  className?: string;
}

/**
 * Shared empty state used across list screens so messaging and layout stay consistent.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = Inbox,
  action,
  compact = false,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8 px-4' : 'py-14 px-6'
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3 ${
          compact ? 'w-12 h-12' : 'w-16 h-16'
        }`}
      >
        <Icon className={compact ? 'w-6 h-6' : 'w-8 h-8'} aria-hidden="true" />
      </div>
      <div className={`font-semibold text-slate-700 ${compact ? 'text-sm' : 'text-base'}`}>{title}</div>
      {description && (
        <p className={`text-[var(--muted-fg)] mt-1 max-w-sm ${compact ? 'text-xs' : 'text-sm'}`}>{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors cursor-pointer shadow-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
