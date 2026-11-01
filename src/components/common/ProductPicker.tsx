import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Product } from '../../types';
import { SizeChip } from './SizeChip';
import { sizeTheme } from '../../utils/sizeColor';

export interface ProductPickerOption {
  product: Product;
  /** small grey text on the right, e.g. "40 cs in stock" */
  note?: string;
}

/**
 * Drop-down list of products where every row shows its size colour and pack (Can / PET).
 * A normal <select> cannot show colours on phones, so this replaces it.
 */
export const ProductPicker: React.FC<{
  options: ProductPickerOption[];
  value: number | '';
  onChange: (productId: number) => void;
  placeholder: string;
  ariaLabel?: string;
  /** keep the chosen product shown in the button (default) or reset after each pick */
  keepSelection?: boolean;
  className?: string;
  buttonClassName?: string;
}> = ({ options, value, onChange, placeholder, ariaLabel, keepSelection = true, className = '', buttonClassName = '' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const selected = keepSelection && value !== '' ? options.find((o) => o.product.id === Number(value)) : undefined;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 text-left cursor-pointer ${buttonClassName}`}
      >
        {selected ? (
          <span className="min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className="font-bold break-words">{selected.product.name}</span>
            <SizeChip volume={selected.product.volume} name={selected.product.name} pack={selected.product.pack} />
          </span>
        ) : (
          <span className="min-w-0 truncate">{placeholder}</span>
        )}
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-40 left-0 right-0 mt-1 max-h-[55vh] overflow-y-auto rounded-xl border border-slate-300 bg-white shadow-xl divide-y divide-slate-100"
        >
          {options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">Nothing to add</li>
          ) : (
            options.map(({ product: p, note }) => (
              <li key={p.id} role="option" aria-selected={Number(value) === p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  style={{ borderLeftWidth: 6, borderLeftColor: sizeTheme(p.volume, p.name).hex }}
                  className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900 break-words leading-snug">{p.name}</span>
                    <span className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <SizeChip volume={p.volume} name={p.name} pack={p.pack} />
                    </span>
                  </span>
                  {note && <span className="text-[11px] font-semibold text-slate-500 shrink-0 text-right">{note}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
