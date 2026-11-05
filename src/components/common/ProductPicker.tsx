import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X, Package } from 'lucide-react';
import { Product } from '../../types';
import { SizeChip } from './SizeChip';
import { sizeTheme, packTheme } from '../../utils/sizeColor';
import { formatProductVolPack } from '../../utils/billing';

export interface ProductPickerOption {
  product: Product;
  /** small grey text on the right, e.g. "40 cs in stock" */
  note?: string;
}

/**
 * Enhanced Drop-down list of products with:
 * 1. Instant search across drink name, volume (e.g. 250ml, 1L), and pack type (CAN, PET, Glass)
 * 2. Quick filter tabs: [All] [🥫 Can] [🍾 PET] [🍶 Glass] [🧃 Tetra]
 * 3. Prominent color-coded volume and container type badges
 * 4. Units per crate indicator (e.g. 24 pcs / 30 pcs) to avoid loading confusion
 * 5. Same-name alert badge when multiple SKUs share the same brand name
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
}> = ({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
  keepSelection = true,
  className = '',
  buttonClassName = '',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [packFilter, setPackFilter] = useState<'all' | 'can' | 'pet' | 'glass' | 'tetra'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setPackFilter('all');
      return;
    }
    // Auto-focus search input when opened
    const t = setTimeout(() => searchInputRef.current?.focus(), 50);

    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  // Count names to detect multiple products with the same base name (e.g. 2x "THUMS UP" with different volume/pack)
  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const opt of options) {
      const cleanName = opt.product.name.trim().toLowerCase();
      counts.set(cleanName, (counts.get(cleanName) || 0) + 1);
    }
    return counts;
  }, [options]);

  // Filter options by search query and pack type filter
  const filteredOptions = useMemo(() => {
    return options.filter(({ product: p }) => {
      // Pack filter
      if (packFilter !== 'all') {
        const pTheme = packTheme(p.pack, p.name);
        const pLabel = pTheme.label.toLowerCase();
        if (packFilter === 'can' && !pLabel.includes('can') && !pLabel.includes('tin')) return false;
        if (packFilter === 'pet' && !pLabel.includes('pet') && !pLabel.includes('bottle')) return false;
        if (packFilter === 'glass' && !pLabel.includes('glass') && !pLabel.includes('rgb')) return false;
        if (packFilter === 'tetra' && !pLabel.includes('tetra') && !pLabel.includes('pouch')) return false;
      }

      // Search query filter
      if (!query.trim()) return true;
      const q = query.toLowerCase().trim();
      const sTheme = sizeTheme(p.volume, p.name);
      const pTheme = packTheme(p.pack, p.name);
      const volText = sTheme.label.toLowerCase();
      const packText = pTheme.label.toLowerCase();
      const nameText = p.name.toLowerCase();
      const catText = (p.category || '').toLowerCase();
      const unitsText = p.unitsPerCrate ? `${p.unitsPerCrate}pcs` : '';

      return (
        nameText.includes(q) ||
        volText.includes(q) ||
        packText.includes(q) ||
        catText.includes(q) ||
        unitsText.includes(q) ||
        (p.volume && String(p.volume).includes(q))
      );
    });
  }, [options, query, packFilter]);

  const selected = keepSelection && value !== '' ? options.find((o) => o.product.id === Number(value)) : undefined;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger Button */}
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
            {selected.product.unitsPerCrate && (
              <span className="text-[11px] font-semibold text-slate-500">
                ({selected.product.unitsPerCrate} pcs/cs)
              </span>
            )}
          </span>
        ) : (
          <span className="min-w-0 truncate">{placeholder}</span>
        )}
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-[65vh] flex flex-col rounded-2xl border border-slate-300 bg-white shadow-2xl overflow-hidden"
        >
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-200 bg-slate-50/90 shrink-0 space-y-2">
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search drink, volume (e.g. 250ml), or pack (Can/PET)..."
                className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Container Type Filter Chips: Can, PET, Glass, Tetra */}
            <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-bold no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setPackFilter('all')}
                className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  packFilter === 'all'
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                All ({options.length})
              </button>
              <button
                type="button"
                onClick={() => setPackFilter('can')}
                className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  packFilter === 'can'
                    ? 'bg-blue-600 text-white shadow-2xs font-black'
                    : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-50 font-bold'
                }`}
              >
                🥫 Can / Tin (Blue)
              </button>
              <button
                type="button"
                onClick={() => setPackFilter('pet')}
                className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  packFilter === 'pet'
                    ? 'bg-red-600 text-white shadow-2xs font-black'
                    : 'bg-white text-red-700 border border-red-300 hover:bg-red-50 font-bold'
                }`}
              >
                🍾 PET Bottle (Red)
              </button>
              <button
                type="button"
                onClick={() => setPackFilter('glass')}
                className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  packFilter === 'glass'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                🍶 Glass RGB
              </button>
              <button
                type="button"
                onClick={() => setPackFilter('tetra')}
                className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  packFilter === 'tetra'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-white text-amber-800 border border-amber-300 hover:bg-amber-50'
                }`}
              >
                🧃 Tetra
              </button>
            </div>
          </div>

          {/* Options List */}
          <ul className="flex-1 overflow-y-auto divide-y divide-slate-100 p-0 m-0">
            {filteredOptions.length === 0 ? (
              <li className="px-4 py-8 text-center text-xs text-slate-500">
                {query || packFilter !== 'all' ? (
                  <div>
                    <p className="font-semibold text-slate-700">No matching beverage found</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try clearing the search or switching container filter</p>
                  </div>
                ) : (
                  'No products available to add'
                )}
              </li>
            ) : (
              filteredOptions.map(({ product: p, note }) => {
                const sTheme = sizeTheme(p.volume, p.name);
                const pTheme = packTheme(p.pack, p.name);
                const hasSameNameConflict = (nameCounts.get(p.name.trim().toLowerCase()) || 0) > 1;

                return (
                  <li key={p.id} role="option" aria-selected={Number(value) === p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(p.id);
                        setOpen(false);
                      }}
                      style={{ borderLeftWidth: 6, borderLeftColor: sTheme.hex }}
                      className="w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2.5 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        {/* Name and Same-Name Disambiguation Pill */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-slate-900 break-words leading-snug">
                            {p.name}
                          </span>
                          {hasSameNameConflict && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                              ⚠️ Check Size/Pack
                            </span>
                          )}
                        </div>

                        {/* Distinct Volume & Pack Badges & Units Per Crate */}
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <SizeChip volume={p.volume} name={p.name} pack={p.pack} />
                          {p.unitsPerCrate && (
                            <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {p.unitsPerCrate} pcs/case
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 capitalize">
                            · {p.category || 'General'}
                          </span>
                        </div>
                      </div>

                      {/* Stock availability note */}
                      {note && (
                        <div className="text-right shrink-0">
                          <span className="inline-block text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-1 rounded-lg">
                            {note}
                          </span>
                        </div>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {/* Footer Helper */}
          <div className="p-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Showing {filteredOptions.length} of {options.length} beverages</span>
            <span className="font-semibold text-slate-400">Colored stripes = bottle volume</span>
          </div>
        </div>
      )}
    </div>
  );
};
