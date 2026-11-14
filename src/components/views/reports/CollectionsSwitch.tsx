import React from 'react';

export type CollectionsView = 'daybook' | 'payments';

const OPTIONS: { id: CollectionsView; label: string }[] = [
  { id: 'daybook', label: 'Day book' },
  { id: 'payments', label: 'By customer' },
];

/**
 * "Collections" is one report with two views: the day book (money in and out, day by day) and money received
 * by customer. Each view is its own page underneath, so the period filter and downloads keep working as before;
 * this switch just moves between them.
 */
export const CollectionsSwitch: React.FC<{ active: CollectionsView; onChange: (v: CollectionsView) => void }> = ({ active, onChange }) => (
  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200" role="tablist" aria-label="Collections view">
    {OPTIONS.map((o) => (
      <button
        key={o.id}
        type="button"
        role="tab"
        aria-selected={active === o.id}
        onClick={() => active !== o.id && onChange(o.id)}
        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
          active === o.id ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-900'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);
