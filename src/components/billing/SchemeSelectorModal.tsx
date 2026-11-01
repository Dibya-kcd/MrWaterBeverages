import React, { useMemo, useState } from 'react';
import { Gift, X, Check, Percent, Tag, Sparkles } from 'lucide-react';
import { Product, Promotion } from '../../types';
import { schemeLabel, money } from '../../utils/billing';

interface SchemeSelectorModalProps {
  product: Product;
  currentRate: number;
  currentScheme?: Promotion | null;
  currentPromoLabel?: string | null;
  availablePromotions?: Promotion[];
  products?: Product[];
  onSelectScheme: (promo: Promotion | null, label: string | null) => void;
  onClose: () => void;
}

/**
 * Scheme picker for billing — ONLY active schemes from the promotions DB/store.
 * Hardcoded BOGO/%/flat presets removed so schemes can be managed from Promotions.
 */
export const SchemeSelectorModal: React.FC<SchemeSelectorModalProps> = ({
  product,
  currentRate,
  currentScheme,
  currentPromoLabel,
  availablePromotions = [],
  products = [],
  onSelectScheme,
  onClose,
}) => {
  const [customType, setCustomType] = useState<'bogo' | 'percent' | 'flat'>('bogo');
  const [customBuyQty, setCustomBuyQty] = useState<number>(5);
  const [customFreeQty, setCustomFreeQty] = useState<number>(1);
  const [customPercent, setCustomPercent] = useState<number>(10);
  const [customFlat, setCustomFlat] = useState<number>(15);
  const [showOneTime, setShowOneTime] = useState(false);

  const productStorePromos = useMemo(
    () => {
      const targetId = Number(product.id);
      return availablePromotions.filter((p) => {
        if (p.isActive === false) return false;
        const raw = p.productIds ?? (p as any).product_ids ?? (p as any).productId ?? (p as any).product_id;
        let ids: number[] = [];
        if (Array.isArray(raw)) ids = raw.map(Number).filter((n) => !isNaN(n));
        else if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) ids = parsed.map(Number).filter((n) => !isNaN(n));
          } catch {
            ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n));
          }
        } else if (typeof raw === 'number' && !isNaN(raw)) {
          ids = [raw];
        }

        if (ids.length > 0) {
          return ids.some((id: any) => Number(id) === targetId);
        }
        return true;
      });
    },
    [availablePromotions, product.id]
  );

  const handleSelectStoreScheme = (promo: Promotion) => {
    onSelectScheme(promo, schemeLabel(promo, products));
    onClose();
  };

  const handleClearScheme = () => {
    onSelectScheme(null, null);
    onClose();
  };

  const handleApplyOneTime = () => {
    let newPromo: Promotion;
    let label = '';

    if (customType === 'bogo') {
      const buy = Math.max(1, Number(customBuyQty) || 1);
      const free = Math.max(1, Number(customFreeQty) || 1);
      newPromo = {
        id: -Date.now(),
        name: `Buy ${buy} Get ${free} Free (one-time)`,
        type: 'bogo',
        buyQty: buy,
        freeQty: free,
        percent: 0,
        flatPerCase: 0,
        productIds: [product.id],
        isActive: true,
      };
      label = `Buy ${buy} Get ${free} Free`;
    } else if (customType === 'percent') {
      const pct = Math.max(1, Math.min(100, Number(customPercent) || 5));
      newPromo = {
        id: -Date.now(),
        name: `${pct}% Scheme Discount (one-time)`,
        type: 'percent',
        buyQty: 0,
        freeQty: 0,
        percent: pct,
        flatPerCase: 0,
        productIds: [product.id],
        isActive: true,
      };
      label = `${pct}% off`;
    } else {
      const flat = Math.max(1, Number(customFlat) || 10);
      newPromo = {
        id: -Date.now(),
        name: `Rs ${flat}/case Scheme Discount (one-time)`,
        type: 'flat',
        buyQty: 0,
        freeQty: 0,
        percent: 0,
        flatPerCase: flat,
        productIds: [product.id],
        isActive: true,
      };
      label = `Rs ${flat}/case off`;
    }

    onSelectScheme(newPromo, label);
    onClose();
  };

  const isSelected = (p: Promotion) =>
    currentScheme != null && Number(currentScheme.id) === Number(p.id);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl border-2 border-slate-300 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Gift size={18} className="text-emerald-600 shrink-0" />
              <span>Select Trade Scheme</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">
              {product.name} · Rate Rs {money(currentRate)}/case
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          <button
            type="button"
            onClick={handleClearScheme}
            className={`w-full p-3 rounded-xl border-2 text-left flex items-center justify-between transition-all ${
              !currentScheme
                ? 'border-slate-700 bg-slate-100 text-slate-900 font-black'
                : 'border-slate-200 hover:border-slate-400 bg-white text-slate-700 font-bold'
            }`}
          >
            <span className="text-sm">No scheme — full rate</span>
            {!currentScheme && <Check size={16} className="text-slate-700 shrink-0" />}
          </button>

          <div className="space-y-2">
            <div className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles size={14} className="text-emerald-600" />
              <span>Active schemes (from Promotions)</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Only schemes marked Active in the Promotions screen are listed and auto-applied at billing.
              Manage or delete schemes there — they are linked to the database.
            </p>

            {productStorePromos.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-500">
                No active scheme for this product.
                <br />
                Create one under <strong>Promotions</strong>, or use a one-time override below.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {productStorePromos.map((p) => {
                  const active = isSelected(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectStoreScheme(p)}
                      className={`p-3 rounded-xl border-2 text-left flex items-center justify-between cursor-pointer transition-all ${
                        active
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black shadow-sm ring-1 ring-emerald-500'
                          : 'border-slate-200 hover:border-emerald-400 bg-white text-slate-900 font-bold'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs flex items-center gap-1.5">
                          {p.type === 'bogo' && <Gift size={13} className="text-emerald-700" />}
                          {p.type === 'bundle' && <Sparkles size={13} className="text-purple-600" />}
                          {p.type === 'percent' && <Percent size={13} className="text-blue-600" />}
                          {p.type === 'flat' && <Tag size={13} className="text-amber-600" />}
                          <span>{p.name || schemeLabel(p, products)}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                          {schemeLabel(p, products)}
                          {p.productIds?.length ? ' · product-linked' : ' · all products'}
                        </div>
                      </div>
                      {active && <Check size={16} className="text-emerald-700 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setShowOneTime((v) => !v)}
              className="text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              {showOneTime ? '▼' : '▶'} One-time override for this bill line only (not saved)
            </button>

            {showOneTime && (
              <div className="mt-3 space-y-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-[11px] text-amber-900">
                  This applies only to the current line. It is <strong>not</strong> added to the Promotions
                  list and will not auto-apply on future bills.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(['bogo', 'percent', 'flat'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCustomType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                        customType === t
                          ? 'bg-amber-600 text-white border-amber-700'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      {t === 'bogo' ? 'Buy X Get Y' : t === 'percent' ? '% Off' : 'Rs/case Off'}
                    </button>
                  ))}
                </div>

                {customType === 'bogo' && (
                  <div className="flex gap-2 items-center text-sm">
                    <span>Buy</span>
                    <input
                      type="number" inputMode="numeric"
                      min={1}
                      value={customBuyQty}
                      onChange={(e) => setCustomBuyQty(Number(e.target.value) || 1)}
                      className="w-16 border rounded-lg px-2 py-1 font-bold"
                    />
                    <span>Get</span>
                    <input
                      type="number" inputMode="numeric"
                      min={1}
                      value={customFreeQty}
                      onChange={(e) => setCustomFreeQty(Number(e.target.value) || 1)}
                      className="w-16 border rounded-lg px-2 py-1 font-bold"
                    />
                    <span>Free</span>
                  </div>
                )}
                {customType === 'percent' && (
                  <div className="flex gap-2 items-center text-sm">
                    <input
                      type="number" inputMode="decimal"
                      min={1}
                      max={100}
                      value={customPercent}
                      onChange={(e) => setCustomPercent(Number(e.target.value) || 5)}
                      className="w-20 border rounded-lg px-2 py-1 font-bold"
                    />
                    <span>% off</span>
                  </div>
                )}
                {customType === 'flat' && (
                  <div className="flex gap-2 items-center text-sm">
                    <span>Rs</span>
                    <input
                      type="number" inputMode="decimal"
                      min={1}
                      value={customFlat}
                      onChange={(e) => setCustomFlat(Number(e.target.value) || 10)}
                      className="w-20 border rounded-lg px-2 py-1 font-bold"
                    />
                    <span>/case off</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleApplyOneTime}
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-black"
                >
                  Apply one-time override
                </button>
              </div>
            )}
          </div>
        </div>

        {currentPromoLabel && (
          <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-600">
            Current: <strong>{currentPromoLabel}</strong>
          </div>
        )}
      </div>
    </div>
  );
};
