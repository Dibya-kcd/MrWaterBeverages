import React from 'react';
import { Search, X } from 'lucide-react';

export const card = 'rounded-2xl border border-black/10 bg-white';

export const MODE_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank', cheque: 'Cheque', other: 'Other' };

export const fmtDay = (d: string) => {
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtShort = (d: string) => {
  if (!d) return '—';
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export const StatTile: React.FC<{ label: string; value: string; tone?: string; sub?: string }> = ({
  label,
  value,
  tone = 'text-slate-900',
  sub,
}) => (
  <div className={`${card} p-3`}>
    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
    <div className={`text-lg font-extrabold tabular-nums ${tone}`}>{value}</div>
    {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
  </div>
);

/** Two or three option switch in the same pill style as the other Payments tabs. */
export function SegToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
            value === o.id ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({
  value,
  onChange,
  placeholder,
}) => (
  <div className="relative">
    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      enterKeyHint="search"
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 placeholder:text-slate-400"
    />
    {value && (
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange('')}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

export const ShowMore: React.FC<{ shown: number; total: number; onMore: () => void }> = ({ shown, total, onMore }) =>
  total > shown ? (
    <button
      type="button"
      onClick={onMore}
      className="w-full py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
    >
      Show more ({total - shown} left)
    </button>
  ) : null;
