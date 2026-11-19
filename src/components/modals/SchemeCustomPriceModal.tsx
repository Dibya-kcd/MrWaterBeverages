import React from 'react';
import { Gift, Minus, Pencil, Plus, Sparkles, X } from 'lucide-react';
import { Product } from '../../types';
import { sizeTheme, packTheme } from '../../utils/sizeColor';
import { PackIcon, packTextColor } from '../common/PackIcon';

/**
 * Item configuration sheet: case quantity, custom unit price and promotional scheme.
 *
 * Purely presentational. All state, calculations (computeLine / applyCartSchemes),
 * and commit logic stay in NewSaleScreen and are passed in through props.
 * Bottom sheet below 768px, centred dialog from 768px up.
 */
export interface SchemeCustomPriceModalProps {
  product: Product;
  /** Catalog case rate (the "original" rate shown struck-through when overridden). */
  basePrice: number;
  /** Stock available at the selected source (warehouse or van). */
  available: number;
  isVanStock: boolean;

  /** Raw quantity input text + its parsed value. */
  qty: string;
  parsedQty: number;
  onQtyChange: (value: string) => void;
  qtyInputRef?: React.Ref<HTMLInputElement>;

  /** Raw rate input text + its parsed value. */
  rate: string;
  parsedRate: number;
  onRateChange: (value: string) => void;

  /** Scheme state for this line. */
  schemeActive: boolean;
  promoLabel: string | null;
  /** Free cases unlocked by the current preview (computeLine().freeQty). */
  freeQty: number;
  onToggleScheme: (next: boolean) => void;
  onChangeScheme: () => void;

  /** Preview total for the footer CTA. */
  lineTotal: number;
  /** True when the product is already in the cart (shows Remove Item, "Update Cart"). */
  isEditing: boolean;

  onSubmit: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export const SchemeCustomPriceModal: React.FC<SchemeCustomPriceModalProps> = ({
  product,
  basePrice,
  available,
  isVanStock,
  qty,
  parsedQty,
  onQtyChange,
  qtyInputRef,
  rate,
  parsedRate,
  onRateChange,
  schemeActive,
  promoLabel,
  freeQty,
  onToggleScheme,
  onChangeScheme,
  lineTotal,
  isEditing,
  onSubmit,
  onRemove,
  onClose,
}) => {
  const sTheme = sizeTheme(product.volume, product.name);
  const pTheme = packTheme(product.pack, product.name);
  const isCustomRate = parsedRate !== basePrice;

  const ctaLabel =
    parsedQty === 0 && isEditing
      ? 'Remove Item'
      : `${isEditing ? 'Update Cart' : 'Add to Cart'} • ₹${lineTotal.toLocaleString('en-IN')}`;

  return (
    <div
      data-esc-close
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${product.name}`}
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center md:justify-center"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ borderTopWidth: 4, borderTopColor: sTheme.hex }}
        className="w-full rounded-t-2xl md:max-w-lg md:rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#ECFDF5] border border-[#1B8A5A]/20 flex items-center justify-center shrink-0">
              <PackIcon pack={product.pack} name={product.name} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[#0A1F44] leading-snug">{product.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5 tabular-nums">
                {sTheme.label && (
                  <span className="font-bold" style={{ color: sTheme.hex }}>
                    {sTheme.label}
                  </span>
                )}
                {pTheme.label && (
                  <span className={`font-bold ${packTextColor(product.pack, product.name)}`}>
                    {sTheme.label ? ' · ' : ''}
                    {pTheme.label}
                  </span>
                )}
                {product.unitsPerCrate ? `${sTheme.label || pTheme.label ? ' · ' : ''}${product.unitsPerCrate} pcs` : ''}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-[#0A1F44] tabular-nums">
                  ₹{basePrice.toLocaleString('en-IN')}
                  <span className="text-xs font-medium text-gray-500"> / case</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    available > 0 ? 'bg-[#ECFDF5] text-[#1B8A5A]' : 'bg-[#FEE2E2] text-[#DC2626]'
                  }`}
                >
                  {isVanStock ? `${available} on van` : `${available} in stock`}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Case quantity */}
          <div className="space-y-2">
            <label htmlFor="scpm-qty" className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Cases / Crates
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onQtyChange(String(Math.max(0, parsedQty - 1)))}
                aria-label="Decrease quantity"
                className="min-h-[48px] min-w-[48px] rounded-xl border border-gray-300 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-800 cursor-pointer shrink-0"
              >
                <Minus className="w-5 h-5" />
              </button>
              <input
                id="scpm-qty"
                ref={qtyInputRef}
                type="number"
                inputMode="numeric"
                min="0"
                value={qty}
                onChange={(e) => onQtyChange(e.target.value)}
                className="flex-1 min-w-0 min-h-[48px] text-center text-xl font-bold text-[#0A1F44] rounded-xl border-2 border-[#1B8A5A]/50 focus:border-[#1B8A5A] focus:outline-none tabular-nums"
              />
              <button
                type="button"
                onClick={() => onQtyChange(String(parsedQty + 1))}
                aria-label="Increase quantity"
                className="min-h-[48px] min-w-[48px] rounded-xl border border-[#1B8A5A] bg-[#1B8A5A] hover:bg-[#157048] text-white flex items-center justify-center cursor-pointer shrink-0"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 5, 10, 20].map((inc) => (
                <button
                  key={inc}
                  type="button"
                  onClick={() => onQtyChange(String(parsedQty + inc))}
                  className="min-h-[44px] rounded-xl border border-gray-200 bg-gray-50 hover:bg-[#ECFDF5] hover:border-[#1B8A5A]/40 text-xs font-bold text-gray-800 cursor-pointer tabular-nums"
                >
                  +{inc}
                </button>
              ))}
            </div>
          </div>

          {/* Promotional scheme */}
          <div
            className={`rounded-xl p-3.5 border ${
              schemeActive ? 'bg-[#ECFDF5] border-[#1B8A5A]/30' : 'bg-gray-50 border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Gift className={`w-5 h-5 mt-0.5 shrink-0 ${schemeActive ? 'text-[#1B8A5A]' : 'text-gray-400'}`} />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Promotional scheme</p>
                  <p className="text-sm font-semibold text-[#0A1F44] break-words">
                    {schemeActive && promoLabel ? promoLabel : 'No scheme applied'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={schemeActive}
                aria-label="Apply promotional scheme"
                onClick={() => onToggleScheme(!schemeActive)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer shrink-0"
              >
                <span
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    schemeActive ? 'bg-[#1B8A5A]' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      schemeActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </span>
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              {schemeActive && freeQty > 0 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1B8A5A] text-white text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5" />+{freeQty} Free Case{freeQty === 1 ? '' : 's'} Unlocked
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={onChangeScheme}
                className="min-h-[44px] px-2 text-xs font-bold text-[#1B8A5A] underline cursor-pointer"
              >
                {schemeActive ? 'Change scheme' : 'Choose scheme'}
              </button>
            </div>
          </div>

          {/* Custom unit price */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="scpm-rate" className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Custom unit price (₹ / case)
              </label>
              <button
                type="button"
                onClick={() => onRateChange('0')}
                className={`min-h-[44px] px-2 text-[11px] font-bold cursor-pointer ${
                  parsedRate === 0 ? 'text-[#1B8A5A] underline' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                ₹0 Free
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Pencil className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="scpm-rate"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={rate}
                  onChange={(e) => onRateChange(e.target.value)}
                  className="w-full min-h-[48px] pl-9 pr-3 rounded-xl border border-gray-300 text-base font-bold text-[#0A1F44] tabular-nums focus:outline-none focus:border-[#1B8A5A]"
                />
              </div>
              {isCustomRate && (
                <>
                  <span className="text-sm line-through text-gray-400 tabular-nums shrink-0">
                    ₹{basePrice.toLocaleString('en-IN')}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRateChange(String(basePrice))}
                    className="min-h-[44px] px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer shrink-0"
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-1">
          <button
            type="submit"
            className="w-full min-h-[48px] bg-[#1B8A5A] hover:bg-[#157048] text-white font-semibold rounded-xl cursor-pointer"
          >
            {ctaLabel}
          </button>
          {isEditing && parsedQty > 0 && (
            <button
              type="button"
              onClick={onRemove}
              className="w-full min-h-[44px] text-sm font-medium text-[#DC2626] hover:bg-[#FEE2E2] rounded-xl cursor-pointer"
            >
              Remove Item
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
