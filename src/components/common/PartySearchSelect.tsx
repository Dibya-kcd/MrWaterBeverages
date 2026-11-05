import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { money } from '../../utils/billing';

export interface PartyOption {
  key: string;
  name: string;
  phone?: string;
  due: number;
  advance: number;
}

interface PartySearchSelectProps {
  options: PartyOption[];
  /** Selected party name ('' when nothing is chosen). */
  value: string;
  onSelect: (name: string, option?: PartyOption) => void;
  placeholder?: string;
}

const digits = (s?: string) => String(s || '').replace(/\D/g, '');
const MAX_SHOWN = 60;

/**
 * Type to search a party by name or phone, then tap to pick.
 * Works with keyboard (arrows, Enter, Escape) and with touch: the list scrolls inside the box.
 */
export const PartySearchSelect: React.FC<PartySearchSelectProps> = ({
  options,
  value,
  onSelect,
  placeholder = 'Search party by name or phone…',
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qd = digits(query);
    const list = !q
      ? options
      : options.filter((o) => o.name.toLowerCase().includes(q) || (qd.length >= 3 && digits(o.phone).includes(qd)));
    return list;
  }, [options, query]);
  const shown = matches.slice(0, MAX_SHOWN);

  useEffect(() => setActive(0), [query, open]);

  // close when tapping outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  // keep the highlighted row in view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (o: PartyOption) => {
    onSelect(o.name, o);
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onSelect('');
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(0, shown.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && shown[active]) {
        e.preventDefault();
        pick(shown[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showingValue = !!value && !open;

  return (
    <div ref={wrapRef} className="relative">
      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        enterKeyHint="search"
        value={showingValue ? value : query}
        onFocus={() => {
          setOpen(true);
          if (value) setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onSelect('');
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`w-full pl-10 pr-16 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 placeholder:text-slate-400 ${
          showingValue ? 'text-slate-900 font-semibold' : 'text-slate-800'
        }`}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {(value || query) && (
          <button
            type="button"
            aria-label="Clear party"
            onClick={clear}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          aria-label={open ? 'Close list' : 'Open list'}
          tabIndex={-1}
          onClick={() => {
            setOpen((o) => !o);
            if (!open) inputRef.current?.focus();
          }}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {shown.length === 0 ? (
            <div className="px-3.5 py-4 text-xs text-slate-500">
              No party matches “{query.trim()}”. Use <strong>+ Enter custom name</strong> to add a new one.
            </div>
          ) : (
            <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto overscroll-contain divide-y divide-slate-100">
              {shown.map((o, i) => (
                <li
                  key={o.key}
                  role="option"
                  aria-selected={o.name === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between gap-3 ${
                    i === active ? 'bg-emerald-50' : 'bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{o.name}</div>
                    {o.phone ? <div className="text-[11px] text-slate-500">{o.phone}</div> : null}
                  </div>
                  {o.due > 0.004 ? (
                    <span className="shrink-0 text-xs font-bold text-rose-700 tabular-nums">Due ₹{money(o.due)}</span>
                  ) : o.advance > 0.004 ? (
                    <span className="shrink-0 text-xs font-semibold text-sky-700 tabular-nums">Advance ₹{money(o.advance)}</span>
                  ) : null}
                </li>
              ))}
              {matches.length > shown.length && (
                <li className="px-3.5 py-2 text-[11px] text-slate-500 bg-slate-50">
                  Showing {shown.length} of {matches.length}. Type more to narrow down.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
