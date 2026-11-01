import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Gift,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { CATS } from '../../constants/initialData';
import { CategoryKey, GrnSchemeMode, GrnSchemeType, Product } from '../../types';
import { calculateLandedCostBreakdown, generateBatchNumber } from '../../utils/billing';

export interface EditableInwardRow {
  id: string;
  rawName: string;
  productName: string;
  category: CategoryKey;
  pack: string;
  volume: number;
  packSize?: string;
  unitsPerCrate?: number;
  hsn: string;
  qty: number;
  freeQty: number;
  paidQty?: number;
  unitPrice: number;
  listPrice?: number;
  isGstIncluded?: boolean;
  calculatedGstAmount?: number;
  priceInclGst?: number;
  schemeType: GrnSchemeType;
  schemeMode?: GrnSchemeMode;
  schemeBuyQty?: number;
  schemeFreeQty?: number;
  discountPercent: number;
  discountFlat: number;
  discountAmount: number;
  schemeText: string;
  cgstPercent: number;
  sgstPercent: number;
  wholesaleRate: number;
  retailRate: number;
  batchNumber: string;
  expiry: string;
  mfgDate: string;
  isNewProduct: boolean;
  matchedProductId?: number;
  existingStock?: number;
  supplierSchemeId?: string;
  notes?: string;
  [key: string]: any;
}

interface InwardProductCardProps {
  /** Preferred prop from BulkInwardModal */
  row?: EditableInwardRow;
  /** Alias used by some call sites */
  r?: EditableInwardRow;
  index?: number;
  idx?: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateField: (field: string, value: any) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  products?: Product[];
  inwardCostPerCrate?: number;
  inwardDate?: string;
  onCatalogMappingChange?: (val: any) => void;
  money?: (n: number) => string;
}

/**
 * Compact professional line card for GRN review.
 * Primary: name · qty · free · rate · amount · batch · expiry
 * Scheme only when needed. Manufacturing date is not shown.
 */
export const InwardProductCard: React.FC<InwardProductCardProps> = (props) => {
  const r = (props.row || props.r)!;
  const idx = props.index ?? props.idx ?? 0;
  const {
    isExpanded,
    onToggleExpand,
    onUpdateField,
    onDelete,
    onDuplicate,
    inwardCostPerCrate = 0,
    inwardDate,
  } = props;
  // Was used below ("Auto" batch button) without ever being read from props -> ReferenceError on click.
  const products = props.products;

  const schemeMode = (r.schemeMode || 'inclusive') as GrnSchemeMode;
  const hasScheme = r.schemeType !== 'none' && !!r.schemeType;
  const [schemeOpen, setSchemeOpen] = React.useState(hasScheme);

  React.useEffect(() => {
    if (hasScheme) setSchemeOpen(true);
  }, [hasScheme]);

  const breakdown = calculateLandedCostBreakdown({
    qty: r.qty,
    unitPrice: r.unitPrice,
    unitsPerCrate: r.unitsPerCrate || 24,
    pack: r.pack,
    volume: r.volume,
    packSize: r.packSize,
    cgstPercent: r.cgstPercent,
    sgstPercent: r.sgstPercent,
    schemeType: r.schemeType,
    schemeMode,
    schemeBuyQty: r.schemeBuyQty,
    schemeFreeQty: r.schemeFreeQty,
    freeQty: r.freeQty,
    paidQty: r.paidQty,
    discountPercent: r.discountPercent,
    discountFlat: r.discountFlat,
    discountAmount: r.discountAmount,
    inwardCostPerCrate,
  });

  const lineAmount = breakdown?.lineTotal ?? r.qty * r.unitPrice;
  const effectiveCost = breakdown?.effectiveCostPerCrateExGst ?? r.unitPrice;
  const fmt = props.money || ((n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 }));

  const applyB2g1 = (buy: number, free: number) => {
    onUpdateField('schemeType', 'b2g1');
    onUpdateField('schemeBuyQty', buy);
    onUpdateField('schemeFreeQty', free);
    onUpdateField('schemeText', `Buy ${buy} Get ${free} Free`);
    onUpdateField('discountPercent', 0);
    onUpdateField('discountFlat', 0);
    onUpdateField('discountAmount', 0);
    const total = Math.max(0, Number(r.qty) || 0);
    if (total > 0 && buy > 0) {
      const cycle = buy + free;
      const freeCases = Math.floor(total / cycle) * free;
      onUpdateField('freeQty', freeCases);
      onUpdateField('paidQty', Math.max(0, total - freeCases));
    }
  };

  return (
    <div
      id={`inward-card-${r.id}`}
      className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${
        r.isNewProduct ? 'border-l-4 border-l-sky-500 border-slate-200' : 'border-l-4 border-l-emerald-500 border-slate-200'
      }`}
    >
      <div className="px-3.5 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center justify-center font-mono shrink-0">
              {idx + 1}
            </span>
            {r.isNewProduct ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                <Sparkles size={10} /> NEW
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <Check size={10} /> #{r.matchedProductId}
                {r.existingStock !== undefined && (
                  <span className="font-normal opacity-80">· {r.existingStock} cs</span>
                )}
              </span>
            )}
            {hasScheme && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-800 border border-violet-200">
                <Gift size={10} />
                {r.schemeType === 'b2g1'
                  ? `B${r.schemeBuyQty || 2}G${r.schemeFreeQty || 1}`
                  : r.schemeType === 'free_cases'
                    ? `${r.freeQty || 0} free`
                    : r.schemeType === 'discount_percent'
                      ? `${r.discountPercent}%`
                      : r.schemeType === 'discount_flat'
                        ? `₹${r.discountFlat}/cs`
                        : 'Scheme'}
              </span>
            )}
          </div>
          <input
            type="text"
            value={r.productName}
            onChange={(e) => onUpdateField('productName', e.target.value)}
            className="font-bold text-slate-900 text-sm bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-sky-400 focus:outline-none w-full px-0 py-0.5"
            placeholder="Product name"
          />
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 flex-wrap">
            <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              {r.volume ? (r.volume >= 1000 && r.volume % 1000 === 0 ? `${r.volume / 1000}L` : `${r.volume}ml`) : '—'} {r.pack || 'PET'}
            </span>
            <span>{r.unitsPerCrate || 24}/cr</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={onDuplicate} className="p-1.5 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded-lg cursor-pointer" title="Duplicate">
            <Copy size={14} />
          </button>
          <button type="button" onClick={onDelete} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer" title="Remove">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="px-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Qty</span>
          <input
            type="number" inputMode="numeric"
            min={0}
            step="any"
            value={r.qty}
            onChange={(e) => onUpdateField('qty', parseFloat(e.target.value) || 0)}
            className="mt-0.5 w-full font-mono font-bold text-sm text-right border border-slate-300 rounded-lg px-2 py-1.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Free</span>
          <input
            type="number" inputMode="numeric"
            min={0}
            step="any"
            value={r.freeQty}
            onChange={(e) => {
              const free = Math.max(0, parseFloat(e.target.value) || 0);
              onUpdateField('freeQty', free);
              if (r.schemeType === 'none' && free > 0) onUpdateField('schemeType', 'free_cases');
            }}
            className={`mt-0.5 w-full font-mono font-bold text-sm text-right border rounded-lg px-2 py-1.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 ${
              r.freeQty > 0 ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-slate-300'
            }`}
          />
        </label>
        <div className="block">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rate ₹</span>
            <button
              type="button"
              onClick={() => onUpdateField('isGstIncluded', !r.isGstIncluded)}
              className={`text-[10px] font-bold px-1 py-0.2 rounded border transition-colors cursor-pointer ${
                r.isGstIncluded
                  ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
              title={
                r.isGstIncluded
                  ? 'List price includes GST. Click to toggle Ex-GST.'
                  : `List price excludes GST (+₹${fmt(r.calculatedGstAmount || 0)} GST calculated). Click to toggle.`
              }
            >
              {r.isGstIncluded ? 'GST Incl' : '+Calc GST'}
            </button>
          </div>
          <input
            type="number" inputMode="decimal"
            min={0}
            step="any"
            value={r.listPrice !== undefined ? r.listPrice : r.unitPrice}
            onChange={(e) => onUpdateField('listPrice', parseFloat(e.target.value) || 0)}
            className="mt-0.5 w-full font-mono font-bold text-sm text-right border border-slate-300 rounded-lg px-2 py-1.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            title={`List Price: ₹${fmt(r.listPrice !== undefined ? r.listPrice : r.unitPrice)}`}
          />
        </div>
        <div className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount</span>
          <div className="mt-0.5 w-full font-mono font-black text-sm text-right px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900">
            {fmt(lineAmount)}
          </div>
        </div>
      </div>

      <div className="px-3.5 mt-2.5 grid grid-cols-2 gap-2">
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Batch / Tag <span className="text-amber-600">*</span>
            </span>
            <button
              type="button"
              onClick={() => {
                const existingBatches = (products || []).map((p) => p.batchNumber).filter(Boolean) as string[];
                const fresh = generateBatchNumber(r.productName || r.rawName, undefined, existingBatches, undefined, inwardDate);
                onUpdateField('batchNumber', fresh);
              }}
              className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 flex items-center gap-0.5 cursor-pointer"
              title="Auto-generate fresh unique batch/tag number (never use old one)"
            >
              <Sparkles size={9} /> Auto
            </button>
          </div>
          <input
            type="text"
            value={r.batchNumber}
            onChange={(e) => onUpdateField('batchNumber', e.target.value)}
            placeholder="Lot / Tag number"
            className={`mt-0.5 w-full font-mono text-xs border rounded-lg px-2 py-1.5 ${
              !(r.batchNumber || '').trim()
                ? 'border-amber-400 bg-amber-50 focus:border-amber-500'
                : 'border-slate-300 focus:border-sky-500'
            } focus:ring-1 focus:ring-sky-500`}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Expiry <span className="text-amber-600">*</span>
          </span>
          <input
            type="date"
            value={r.expiry}
            onChange={(e) => onUpdateField('expiry', e.target.value)}
            className={`mt-0.5 w-full text-xs border rounded-lg px-2 py-1.5 ${
              !r.expiry
                ? 'border-amber-400 bg-amber-50 focus:border-amber-500'
                : 'border-slate-300 focus:border-sky-500'
            } focus:ring-1 focus:ring-sky-500`}
          />
        </label>
      </div>

      <div className="px-3.5 mt-2.5">
        <button
          type="button"
          onClick={() => setSchemeOpen((v) => !v)}
          className="w-full flex items-center justify-between text-[11px] font-bold text-slate-600 hover:text-violet-700 py-1 cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5">
            <Gift size={13} className={hasScheme ? 'text-violet-600' : 'text-slate-400'} />
            Supplier scheme
            {hasScheme ? (
              <span className="text-violet-700 font-black">· active</span>
            ) : (
              <span className="text-slate-400 font-normal">· optional (B1G1 / free)</span>
            )}
          </span>
          {schemeOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {schemeOpen && (
          <div className="mt-1.5 p-2.5 rounded-xl border border-violet-200 bg-violet-50/60 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'none', label: 'None' },
                  { id: 'b2g1', label: 'B2G1' },
                  { id: 'free_cases', label: 'Free cases' },
                  { id: 'discount_percent', label: '% off' },
                  { id: 'discount_flat', label: '₹/cs off' },
                ] as { id: GrnSchemeType; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (opt.id === 'b2g1') {
                      applyB2g1(r.schemeBuyQty || 2, r.schemeFreeQty || 1);
                    } else {
                      onUpdateField('schemeType', opt.id);
                      if (opt.id === 'none') {
                        onUpdateField('freeQty', 0);
                        onUpdateField('discountPercent', 0);
                        onUpdateField('discountFlat', 0);
                        onUpdateField('discountAmount', 0);
                        onUpdateField('schemeText', '');
                      }
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${
                    r.schemeType === opt.id
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-violet-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {r.schemeType === 'b2g1' && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="text-violet-800 font-semibold">Buy</span>
                <input
                  type="number" inputMode="numeric"
                  min={1}
                  value={r.schemeBuyQty || 2}
                  onChange={(e) => applyB2g1(Math.max(1, parseInt(e.target.value, 10) || 1), r.schemeFreeQty || 1)}
                  className="w-12 font-mono font-bold text-center border border-violet-300 rounded-lg px-1 py-1 bg-white"
                />
                <span className="text-violet-800 font-semibold">Get</span>
                <input
                  type="number" inputMode="numeric"
                  min={1}
                  value={r.schemeFreeQty || 1}
                  onChange={(e) => applyB2g1(r.schemeBuyQty || 2, Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-12 font-mono font-bold text-center border border-violet-300 rounded-lg px-1 py-1 bg-white"
                />
                <span className="text-violet-800 font-semibold">Free</span>
                <span className="text-[10px] text-violet-700 ml-auto">
                  → Free {r.freeQty || 0} of {r.qty} · eff. ₹{fmt(effectiveCost)}/cs
                </span>
              </div>
            )}

            {r.schemeType === 'discount_percent' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-violet-800 font-semibold">Discount %</span>
                <input
                  type="number" inputMode="decimal"
                  min={0}
                  step="0.1"
                  value={r.discountPercent}
                  onChange={(e) => {
                    const p = parseFloat(e.target.value) || 0;
                    onUpdateField('discountPercent', p);
                    onUpdateField('discountAmount', (r.qty * r.unitPrice * p) / 100);
                  }}
                  className="w-20 font-mono font-bold text-right border border-violet-300 rounded-lg px-2 py-1 bg-white"
                />
              </div>
            )}

            {r.schemeType === 'discount_flat' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-violet-800 font-semibold">₹ off / case</span>
                <input
                  type="number" inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={r.discountFlat}
                  onChange={(e) => {
                    const f = parseFloat(e.target.value) || 0;
                    onUpdateField('discountFlat', f);
                    onUpdateField('discountAmount', f * r.qty);
                  }}
                  className="w-24 font-mono font-bold text-right border border-violet-300 rounded-lg px-2 py-1 bg-white"
                />
              </div>
            )}

            <p className="text-[10px] text-violet-800/80 leading-relaxed">
              Use <strong>B2G1 / Free</strong> when free cases arrive as stock (correct qty + cost). Use the header
              <strong> Bill Discount</strong> for invoice total discounts that are not free stock (e.g. ₹15,467).
            </p>
          </div>
        )}
      </div>

      <div className="px-3.5 mt-1.5 pb-3 border-t border-slate-100 pt-1.5">
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full flex items-center justify-between text-[11px] font-bold text-slate-500 hover:text-sky-700 py-1 cursor-pointer"
        >
          <span>
            More · GST {r.cgstPercent + r.sgstPercent}% · HSN {r.hsn || '—'} · eff. ₹{fmt(effectiveCost)}/cs
          </span>
          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {isExpanded && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <label className="block">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Category</span>
              <select
                value={r.category}
                onChange={(e) => onUpdateField('category', e.target.value as CategoryKey)}
                className="mt-0.5 w-full border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              >
                {Object.keys(CATS).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATS[cat as CategoryKey]?.name || cat}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Pack</span>
              <select
                value={r.pack}
                onChange={(e) => onUpdateField('pack', e.target.value)}
                className="mt-0.5 w-full border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="PET">PET</option>
                <option value="CAN">CAN</option>
                <option value="RGB">RGB</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-400 uppercase">ml / units</span>
              <div className="mt-0.5 flex gap-1">
                <input
                  type="number" inputMode="decimal"
                  value={r.volume}
                  onChange={(e) => onUpdateField('volume', parseInt(e.target.value, 10) || 0)}
                  className="w-1/2 border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-right"
                />
                <input
                  type="number" inputMode="numeric"
                  min={1}
                  value={r.unitsPerCrate || 24}
                  onChange={(e) => onUpdateField('unitsPerCrate', Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-1/2 border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-right"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-400 uppercase">GST</span>
              <select
                value={`${r.cgstPercent},${r.sgstPercent}`}
                onChange={(e) => {
                  const [cg, sg] = e.target.value.split(',').map(Number);
                  onUpdateField('cgstPercent', cg);
                  onUpdateField('sgstPercent', sg);
                }}
                className="mt-0.5 w-full font-mono border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="20,20">40% carbonated</option>
                <option value="2.5,2.5">5% juices</option>
                <option value="9,9">18% water</option>
                <option value="6,6">12%</option>
                <option value="0,0">0% exempt</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-400 uppercase">HSN</span>
              <input
                type="text"
                value={r.hsn}
                onChange={(e) => onUpdateField('hsn', e.target.value)}
                className="mt-0.5 w-full font-mono border border-slate-300 rounded-lg px-2 py-1.5"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Wholesale ₹</span>
              <input
                type="number" inputMode="decimal"
                value={r.wholesaleRate}
                onChange={(e) => onUpdateField('wholesaleRate', parseFloat(e.target.value) || 0)}
                className="mt-0.5 w-full font-mono border border-slate-300 rounded-lg px-2 py-1.5 text-right"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-400 uppercase">MRP ₹</span>
              <input
                type="number" inputMode="decimal"
                value={r.retailRate}
                onChange={(e) => onUpdateField('retailRate', parseFloat(e.target.value) || 0)}
                className="mt-0.5 w-full font-mono border border-slate-300 rounded-lg px-2 py-1.5 text-right"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
