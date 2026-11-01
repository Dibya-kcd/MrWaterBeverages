import React from 'react';
import type { BeatRoute } from '../../constants/beats';

/** Row of beat chips for customer pickers: All · each beat · No beat yet. Renders nothing when no beats are set up. */
export const BeatFilterBar: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: BeatRoute[];
  showNone?: boolean;
  className?: string;
}> = ({ value, onChange, options, showNone = true, className = '' }) => {
  if (options.length === 0) return null;
  const items = [{ id: 'all', name: 'All' }, ...options.map((b) => ({ id: b.id, name: b.name })), ...(showNone ? [{ id: 'none', name: 'No beat yet' }] : [])];
  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto pb-1 text-xs ${className}`} role="group" aria-label="Filter customers by beat">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          className={`px-3 py-1.5 rounded-full font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            value === it.id ? 'bg-emerald-700 text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          {it.name}
        </button>
      ))}
    </div>
  );
};
