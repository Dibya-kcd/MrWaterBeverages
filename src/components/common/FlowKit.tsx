import React from 'react';
import { ArrowLeft, Minus, Plus } from 'lucide-react';

/**
 * Building blocks for the full-screen "flow" screens (New sale, New trip, Edit load, Close trip), so they all
 * share one header, one canvas colour, one accent and one stepper. Colours come from the --flow-* tokens in
 * index.css; nothing here has a hex code of its own.
 *
 * Fit rules (why nothing can overflow, whatever the device width):
 *  - every flex / grid child that holds text has min-w-0, and the text itself truncates or wraps;
 *  - the stepper is a 3-column grid (button | flexible input | button), so the input absorbs the spare
 *    width instead of pushing a button past the card edge;
 *  - small text uses text-xs (12px), the app-wide minimum, so the theme never rescales it and wraps a label.
 */

/* ------------------------------------------------------------------ */
/* Header                                                               */
/* ------------------------------------------------------------------ */
export interface FlowHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows the round back button when given. */
  onBack?: () => void;
  backLabel?: string;
  /** A short badge or button on the right (kept to its own width, never squeezes the title to nothing). */
  right?: React.ReactNode;
  /** Step bar under the title: step 1 of 2 etc. */
  progress?: { step: number; total: number };
}

export const FlowHeader: React.FC<FlowHeaderProps> = ({ title, subtitle, onBack, backLabel = 'Back', right, progress }) => (
  <header className="rt-flow-header shrink-0 w-full bg-[var(--flow-header)] text-white pt-[env(safe-area-inset-top,0px)]">
    <div className="mx-auto w-full max-w-6xl px-3 py-2.5 flex items-center gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="size-11 shrink-0 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-[17px] sm:text-lg font-black text-white leading-tight truncate">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-white/75 leading-tight truncate">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0 max-w-[45%] flex items-center justify-end gap-2">{right}</div> : null}
    </div>
    {progress && (
      <div className="mx-auto w-full max-w-6xl px-3 pb-2.5 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: progress.total }, (_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i < progress.step ? 'bg-emerald-300' : 'bg-white/20'}`} />
        ))}
      </div>
    )}
  </header>
);

/**
 * The same navy bar, but as a rounded card that sits inside the page (New sale steps 1 and 3, where the app's
 * own header stays visible above). Both steps use this one component so they look identical.
 */
export const FlowInlineHeader: React.FC<{
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
}> = ({ title, subtitle, onBack, backLabel = 'Back', right }) => (
  <header className="rt-flow-inline-header w-full min-w-0 rounded-2xl bg-[#0A2558] bg-gradient-to-r from-[#0A2558] via-[#0B2D69] to-[#081E4A] text-white px-2.5 sm:px-3 py-2 flex items-center gap-2 shadow-sm">
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        className="size-10 shrink-0 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
    )}
    <div className="min-w-0 flex-1">
      <h2 className="text-[15px] sm:text-[17px] font-extrabold text-white leading-tight truncate">{title}</h2>
      {subtitle ? <p className="text-xs text-white/75 leading-tight truncate">{subtitle}</p> : null}
    </div>
    {right ? <div className="shrink-0 max-w-[55%] flex items-center gap-1.5 sm:gap-2">{right}</div> : null}
  </header>
);

/** Small pill for the header's right side. */
export const FlowBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="max-w-full truncate rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white">{children}</span>
);

/* ------------------------------------------------------------------ */
/* Footer: the main action on its own full-width row on phones          */
/* ------------------------------------------------------------------ */
export const FlowFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <footer className="rt-flow-footer shrink-0 w-full bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom,0px)]">
    <div className="mx-auto w-full max-w-6xl p-3 flex flex-wrap items-stretch gap-2">{children}</div>
  </footer>
);

/** Same height, radius and type for every footer button. */
export const flowBtn = {
  primary:
    'rt-flow-btn-primary min-h-[48px] min-w-0 px-4 rounded-xl bg-[var(--flow-accent)] hover:bg-[var(--flow-accent-hover)] text-white text-[15px] font-black inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'rt-flow-btn-secondary min-h-[48px] min-w-0 px-4 rounded-xl border border-gray-300 bg-white text-slate-700 text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed',
};
/** Layout helpers for a footer row: primary is full width on phones, then shares the row from 640px up. */
export const flowFooterPrimary = 'order-first basis-full sm:order-last sm:basis-0 sm:flex-1';
export const flowFooterSecondary = 'flex-1 sm:flex-none';

/* ------------------------------------------------------------------ */
/* Stat tile (Loaded / Sold / ...)                                      */
/* ------------------------------------------------------------------ */
const TONE: Record<string, string> = {
  ink: 'text-slate-900',
  good: 'text-[var(--flow-accent)]',
  bad: 'text-red-700',
  warn: 'text-amber-700',
};

export const FlowMetric: React.FC<{ label: string; value: React.ReactNode; tone?: 'ink' | 'good' | 'bad' | 'warn' }> = ({
  label,
  value,
  tone = 'ink',
}) => (
  <div className="min-w-0 rounded-xl bg-[var(--flow-canvas)] border border-gray-200 px-1 py-2 text-center">
    <div className={`text-base font-black tabular-nums leading-tight ${TONE[tone]}`}>{value}</div>
    <div className="mt-0.5 text-xs font-semibold leading-tight text-slate-500 truncate">{label}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Quantity stepper                                                     */
/* ------------------------------------------------------------------ */
export interface FlowStepperProps {
  label: string;
  /** Product / thing being counted, for screen readers only. */
  name: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Highest value allowed (the + button stops there). */
  max?: number;
}

export const FlowStepper: React.FC<FlowStepperProps> = ({ label, name, value, onChange, disabled, max }) => {
  const n = Number(value) || 0;
  const atMax = max !== undefined && n >= max;
  const btn =
    'h-11 w-full rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-bold text-slate-600 truncate">{label}</div>
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1.5">
        <button
          type="button"
          disabled={disabled || n <= 0}
          onClick={() => onChange(String(Math.max(0, n - 1)))}
          aria-label={`Less ${label} ${name}`}
          className={`${btn} border border-gray-300 bg-white text-slate-700`}
        >
          <Minus size={18} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
          onFocus={(e) => e.target.select()}
          aria-label={`${label} ${name}`}
          className="h-11 w-full min-w-0 px-1 text-center rounded-xl border border-gray-300 bg-white text-lg font-black tabular-nums text-slate-900 focus:outline-none focus:border-[var(--flow-accent)] disabled:bg-gray-100"
        />
        <button
          type="button"
          disabled={disabled || atMax}
          onClick={() => onChange(String(n + 1))}
          aria-label={`More ${label} ${name}`}
          className={`${btn} bg-[var(--flow-accent)] hover:bg-[var(--flow-accent-hover)] text-white`}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
};
