import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  Package,
  Sparkles,
  Tag,
  Trash2,
  Truck,
} from 'lucide-react';
import { CATS } from '../../constants/initialData';
import { CategoryKey, GrnSchemeMode, GrnSchemeType, Product } from '../../types';
import { calculateLandedCostBreakdown } from '../../utils/billing';

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

  // Scheme & Discount
  schemeType: GrnSchemeType;
  schemeMode?: GrnSchemeMode;
  schemeBuyQty?: number;
  schemeFreeQty?: number;
  discountPercent: number;
  discountFlat: number;
  discountAmount: number;
  schemeText: string;

  // Taxes
  cgstPercent: number;
  sgstPercent: number;

  // Pricing & Batches
  wholesaleRate: number;
  retailRate: number;
  batchNumber: string;
  expiry: string;
  mfgDate: string;

  // Catalog Matching
  isNewProduct: boolean;
  matchedProductId?: number;
  matchedProductName?: string;
  existingStock?: number;
}

interface InwardProductCardProps {
  row: EditableInwardRow;
  index: number;
  products: Product[];
  inwardCostPerCrate: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateField: <K extends keyof EditableInwardRow>(field: K, value: EditableInwardRow[K]) => void;
  onCatalogMappingChange: (mapping: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  money: (val: number) => string;
}

export const InwardProductCard: React.FC<InwardProductCardProps> = ({
  row: r,
  index: idx,
  products,
  inwardCostPerCrate,
  isExpanded,
  onToggleExpand,
  onUpdateField,
  onCatalogMappingChange,
  onDuplicate,
  onDelete,
  money,
}) => {
  // Comprehensive Landed Cost calculation
  const schemeMode = r.schemeMode || 'inclusive';
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

  return (
    <div
      id={`inward-card-${r.id}`}
      className={`bg-white rounded-xl border p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between gap-3 relative ${
        r.isNewProduct ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-emerald-500'
      }`}
    >
      {/* CARD TOP BAR */}
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center justify-center font-mono shrink-0">
              {idx + 1}
            </span>
            {r.isNewProduct ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                <Sparkles size={10} className="text-blue-600" />
                NEW PRODUCT
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                <Check size={10} className="text-emerald-700" />
                CATALOG #{r.matchedProductId}
                {r.existingStock !== undefined && (
                  <span className="text-emerald-700 font-normal">({r.existingStock} cs)</span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onDuplicate}
              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer transition-colors"
              title="Duplicate row"
            >
              <Copy size={13} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
              title="Remove product"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* EDITABLE PRODUCT NAME */}
        <div className="min-w-0">
          <label className="text-[9px] font-semibold uppercase text-slate-400 block mb-0.5">
            Product Title
          </label>
          <input
            type="text"
            value={r.productName}
            onChange={(e) => onUpdateField('productName', e.target.value)}
            className="font-bold text-slate-900 text-xs sm:text-sm bg-slate-50 focus:bg-white border border-slate-300 rounded-md px-2 py-1 w-full min-w-0 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
            placeholder="e.g. CAMPA POWER UP 150ML PET"
          />
        </div>

        {/* CATALOG MAPPING & PACK SPECIFICATIONS */}
        <div className="space-y-1.5 min-w-0">
          <div className="min-w-0">
            <label className="text-[9px] font-semibold text-slate-400 block mb-0.5">
              Catalog Match
            </label>
            <select
              value={r.isNewProduct ? 'new_product' : String(r.matchedProductId)}
              onChange={(e) => onCatalogMappingChange(e.target.value)}
              className="w-full min-w-0 text-xs font-medium bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100 cursor-pointer truncate"
            >
              <option value="new_product">✨ Create as New Product in Catalog</option>
              <optgroup label="Link to Existing Catalog Product:">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category.toUpperCase()})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 min-w-0">
            <div>
              <label className="text-[9px] font-semibold text-slate-400 block mb-0.5">Category</label>
              <select
                value={r.category}
                onChange={(e) => onUpdateField('category', e.target.value as CategoryKey)}
                className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white text-slate-800 font-medium truncate"
                title="Category"
              >
                {Object.keys(CATS).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATS[cat as CategoryKey]?.name || cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[9px] font-semibold text-slate-400 block mb-0.5">Pack Type</label>
              <select
                value={r.pack}
                onChange={(e) => onUpdateField('pack', e.target.value)}
                className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white text-slate-800 font-medium"
                title="Pack"
              >
                <option value="PET">PET</option>
                <option value="CAN">CAN</option>
                <option value="RGB">RGB</option>
              </select>
            </div>

            <div>
              <label className="text-[9px] font-semibold text-slate-400 block mb-0.5">Volume</label>
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  value={r.volume}
                  onChange={(e) => onUpdateField('volume', parseInt(e.target.value, 10) || 0)}
                  className="w-full px-1.5 py-0.5 border border-slate-300 rounded text-xs text-slate-800 bg-white text-right font-mono"
                  title="Volume in ml"
                />
                <span className="text-[10px] text-slate-500 font-medium shrink-0">ml</span>
              </div>
            </div>

            <div>
              <label className="text-[9px] font-semibold text-slate-400 block mb-0.5">Pack Size (Bottles/Cr)</label>
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  min="1"
                  value={r.unitsPerCrate || 24}
                  onChange={(e) => onUpdateField('unitsPerCrate', Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full px-1.5 py-0.5 border border-slate-300 rounded text-xs text-slate-800 bg-white text-right font-mono font-bold"
                  title="Units per crate / pack size"
                />
                <span className="text-[10px] text-slate-500 font-medium shrink-0">btl</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COSTING & FINANCIALS BREAKDOWN BENTO */}
      <div className="space-y-2">
        {/* ROW 1: INVOICE UNIT RATE (EX-GST & INCL-GST) & BILLED QTY */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
          {/* Billed Qty */}
          <div>
            <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Billed Qty</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                value={r.qty}
                onChange={(e) => {
                  const newQty = Math.max(1, parseInt(e.target.value, 10) || 1);
                  onUpdateField('qty', newQty);
                  if (r.schemeType === 'b2g1') {
                    const buy = Math.max(1, r.schemeBuyQty || 2);
                    const free = Math.max(1, r.schemeFreeQty || 1);
                    onUpdateField('freeQty', Math.floor(newQty / buy) * free);
                  }
                }}
                className="font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-1 w-full text-right focus:border-indigo-500 text-xs shadow-2xs"
              />
              <span className="text-[10px] text-slate-500 font-medium shrink-0">cs</span>
            </div>
            {breakdown.freeQty > 0 && (
              <span className="text-[9px] text-purple-700 font-semibold mt-0.5 block">
                +{breakdown.freeQty} free ({breakdown.totalReceivedQty} total)
              </span>
            )}
          </div>

          {/* Invoice Unit Rate (ex-GST & incl-GST) */}
          <div className="col-span-1 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase font-bold text-slate-500">Invoice Rate (Per Crate)</span>
              <span className="text-[9px] font-mono font-semibold text-slate-600">
                GST: {breakdown.gstPercent}% (+₹{money(breakdown.gstAmountPerCrate)})
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {/* Rate Incl-GST Prominent */}
              <div className="bg-white border border-indigo-200 rounded px-2 py-1">
                <span className="text-[8px] uppercase font-bold text-indigo-700 block">Rate Incl. GST</span>
                <div className="font-mono font-extrabold text-indigo-900 text-xs sm:text-sm">
                  ₹{money(breakdown.invoiceRateInclGst)}
                  <span className="text-[9px] font-normal text-indigo-500">/cr</span>
                </div>
                <div className="text-[9px] font-mono text-indigo-700">
                  ₹{money(breakdown.invoiceUnitRateBottleInclGst)}/btl
                </div>
              </div>

              {/* Base Ex-GST Editable */}
              <div className="bg-white border border-slate-300 rounded px-2 py-1">
                <span className="text-[8px] uppercase font-bold text-slate-500 block">Base Ex-GST</span>
                <div className="flex items-center gap-0.5">
                  <span className="text-slate-400 font-medium text-[10px]">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.unitPrice}
                    onChange={(e) => onUpdateField('unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
                    className="font-mono font-bold text-slate-900 bg-transparent w-full text-right focus:outline-hidden text-xs"
                  />
                  <span className="text-[9px] text-slate-400">/cr</span>
                </div>
                <div className="text-[9px] font-mono text-slate-500 text-right">
                  ₹{money(breakdown.invoiceUnitRateBottleExGst)}/btl
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SCHEME REVIEW PANEL */}
        <div className="bg-purple-50/80 border border-purple-200 rounded-lg p-2.5 text-xs flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-bold text-purple-950 text-[11px] flex items-center gap-1.5">
              <Tag size={12} className="text-purple-600" />
              Scheme Review
              <span className="text-[9px] font-normal text-purple-600 bg-purple-100 px-1 rounded">
                Included in goods received · Zero double-count
              </span>
            </span>
            <select
              value={r.schemeType}
              onChange={(e) => {
                const newScheme = e.target.value as GrnSchemeType;
                onUpdateField('schemeType', newScheme);
                if (newScheme === 'b2g1') {
                  const buy = Math.max(1, r.schemeBuyQty || 2);
                  const free = Math.max(1, r.schemeFreeQty || 1);
                  onUpdateField('freeQty', Math.floor(r.qty / buy) * free);
                  onUpdateField('schemeText', `Buy ${buy} Get ${free} Free`);
                } else if (newScheme === 'none') {
                  onUpdateField('freeQty', 0);
                  onUpdateField('discountPercent', 0);
                  onUpdateField('discountFlat', 0);
                  onUpdateField('discountAmount', 0);
                  onUpdateField('schemeText', '');
                }
              }}
              className="font-bold text-purple-950 text-xs bg-white border border-purple-300 rounded px-2 py-0.5 focus:border-purple-500 cursor-pointer shadow-2xs"
            >
              <option value="b2g1">🎁 Buy X Get Y Free (e.g. Buy 2 Get 1)</option>
              <option value="free_cases">+ Direct Free Bonus Crates</option>
              <option value="discount_percent">% Percent Scheme Discount</option>
              <option value="discount_flat">₹ Flat Scheme / Case</option>
              <option value="none">Standard (No Scheme)</option>
            </select>
          </div>

          {/* Scheme Specific Interactive Controls */}
          {r.schemeType === 'b2g1' && (
            <div className="bg-white border border-purple-200 rounded-md p-2 flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-purple-900 font-bold text-xs">Buy</span>
                <input
                  type="number"
                  min="1"
                  value={r.schemeBuyQty || 2}
                  onChange={(e) => {
                    const newBuy = Math.max(1, parseInt(e.target.value, 10) || 1);
                    onUpdateField('schemeBuyQty', newBuy);
                    const freePer = Math.max(1, r.schemeFreeQty || 1);
                    const isInc = (r.schemeMode || 'inclusive') === 'inclusive';
                    const calculated = isInc
                      ? Math.floor(r.qty / (newBuy + freePer)) * freePer
                      : Math.floor(r.qty / newBuy) * freePer;
                    onUpdateField('freeQty', calculated);
                    onUpdateField('schemeText', `Buy ${newBuy} Get ${freePer} Free`);
                  }}
                  className="font-mono font-bold text-purple-900 text-xs bg-purple-50 border border-purple-300 rounded px-2 py-0.5 w-12 text-center"
                />
                <span className="text-purple-900 font-bold text-xs">Get</span>
                <input
                  type="number"
                  min="1"
                  value={r.schemeFreeQty || 1}
                  onChange={(e) => {
                    const newFree = Math.max(1, parseInt(e.target.value, 10) || 1);
                    onUpdateField('schemeFreeQty', newFree);
                    const buy = Math.max(1, r.schemeBuyQty || 2);
                    const calculated = Math.floor(r.qty / (buy + newFree)) * newFree;
                    onUpdateField('freeQty', calculated);
                    onUpdateField('schemeText', `Buy ${buy} Get ${newFree} Free`);
                  }}
                  className="font-mono font-bold text-purple-900 text-xs bg-purple-50 border border-purple-300 rounded px-2 py-0.5 w-12 text-center"
                />
                <span className="text-purple-900 font-bold text-xs">Free</span>

                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-medium">Calculated Free:</span>
                  <input
                    type="number"
                    min="0"
                    value={r.freeQty}
                    onChange={(e) => onUpdateField('freeQty', Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="font-mono font-extrabold text-emerald-800 text-xs bg-emerald-50 border border-emerald-300 rounded px-2 py-0.5 w-16 text-right"
                    title="Override free crates if needed"
                  />
                  <span className="text-emerald-700 font-semibold text-xs">cs</span>
                </div>
              </div>

              {/* Scheme Mode: Locked to Inclusive */}
              <div className="flex items-center justify-between gap-2 p-1.5 bg-purple-50/70 border border-purple-200 rounded text-[11px]">
                <div className="flex items-center gap-1.5 text-purple-950 font-semibold">
                  <span>Billing Mode:</span>
                  <select
                    value="inclusive"
                    disabled
                    className="font-bold text-purple-950 text-[11px] bg-white border border-purple-300 rounded px-1.5 py-0.5 cursor-not-allowed"
                  >
                    <option value="inclusive">Inclusive in Billed (50 free out of 150)</option>
                  </select>
                </div>
                <span className="text-[10px] text-purple-700 font-medium">
                  Free is credited within billed qty (Total received = Invoiced crates)
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-purple-900 pt-1 border-t border-purple-100">
                <span>
                  Billed: <strong className="font-mono">{r.qty}</strong> (
                  <strong className="font-mono text-indigo-700">{breakdown.paidQty} Paid</strong> +{' '}
                  <strong className="font-mono text-emerald-700">{breakdown.freeQty} Free</strong>) = Total Received:{' '}
                  <strong className="font-mono text-slate-900">{breakdown.totalReceivedQty} crates</strong>
                </span>
                <span className="font-semibold text-indigo-700">
                  Effective Cost: ₹{money(breakdown.effectiveCostPerCrateInclGst)}/cr (₹{money(breakdown.effectiveUnitRateInclGst)}/btl)
                </span>
              </div>
            </div>
          )}

          {r.schemeType === 'free_cases' && (
            <div className="flex items-center gap-2 p-1.5 bg-white border border-purple-200 rounded text-xs">
              <span className="text-purple-900 font-bold">Free Bonus Crates:</span>
              <input
                type="number"
                min="0"
                value={r.freeQty}
                onChange={(e) => onUpdateField('freeQty', Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="font-mono font-bold text-purple-900 text-xs bg-purple-50 border border-purple-300 rounded px-2 py-0.5 w-16 text-right"
              />
              <span className="text-emerald-700 font-bold ml-auto text-[11px]">
                Total: {breakdown.totalReceivedQty} crates received
              </span>
            </div>
          )}

          {r.schemeType === 'discount_percent' && (
            <div className="flex items-center gap-2 p-1.5 bg-white border border-purple-200 rounded text-xs">
              <span className="text-purple-900 font-bold">Discount:</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={r.discountPercent}
                onChange={(e) => onUpdateField('discountPercent', Math.max(0, parseFloat(e.target.value) || 0))}
                className="font-mono font-bold text-purple-900 text-xs bg-purple-50 border border-purple-300 rounded px-1.5 py-0.5 w-14 text-right"
              />
              <span className="text-purple-900 font-bold">%</span>
              <span className="text-rose-600 font-mono font-bold ml-auto text-xs">
                -₹{money(breakdown.discountAmount)}
              </span>
            </div>
          )}

          {r.schemeType === 'discount_flat' && (
            <div className="flex items-center gap-2 p-1.5 bg-white border border-purple-200 rounded text-xs">
              <span className="text-purple-900 font-bold">Flat: ₹</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={r.discountFlat}
                onChange={(e) => onUpdateField('discountFlat', Math.max(0, parseFloat(e.target.value) || 0))}
                className="font-mono font-bold text-purple-900 text-xs bg-purple-50 border border-purple-300 rounded px-1.5 py-0.5 w-16 text-right"
              />
              <span className="text-slate-500 text-[11px]">/case</span>
              <span className="text-rose-600 font-mono font-bold ml-auto text-xs">
                -₹{money(breakdown.discountAmount)}
              </span>
            </div>
          )}
        </div>

        {/* ROW 3: EFFECTIVE RATES, INWARD COST ALLOCATION & FINAL LANDED COST */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-gradient-to-r from-slate-50 to-emerald-50/50 p-2.5 rounded-lg border border-emerald-200/80 text-xs">
          {/* Effective Scheme-Adjusted Purchase Rate */}
          <div className="min-w-0 bg-white p-2 rounded-md border border-slate-200 shadow-2xs">
            <span className="text-[9px] uppercase font-bold text-indigo-800 block truncate">
              Effective Purchase Rate
            </span>
            <div className="font-mono font-extrabold text-indigo-950 text-sm truncate">
              ₹{money(breakdown.effectiveCostPerCrateInclGst)}
              <span className="text-[10px] font-normal text-slate-500">/cr</span>
            </div>
            <div className="text-[10px] font-mono text-indigo-700 font-semibold truncate">
              ₹{money(breakdown.effectiveUnitRateInclGst)}/btl (incl GST)
            </div>
            <div className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">
              Ex-GST: ₹{money(breakdown.effectiveCostPerCrateExGst)}/cr · ₹{money(breakdown.effectiveUnitRateExGst)}/btl
            </div>
          </div>

          {/* Allocated Inward-to-Godown Cost */}
          <div className="min-w-0 bg-white p-2 rounded-md border border-amber-200 shadow-2xs">
            <span className="text-[9px] uppercase font-bold text-amber-800 block flex items-center gap-1 truncate">
              <Truck size={10} className="text-amber-600" />
              Inward-to-Godown Cost
            </span>
            <div className="font-mono font-extrabold text-amber-950 text-sm truncate">
              +₹{money(inwardCostPerCrate)}
              <span className="text-[10px] font-normal text-slate-500">/cr</span>
            </div>
            <div className="text-[10px] font-mono text-amber-800 font-semibold truncate">
              +₹{money(breakdown.unitsPerCrate > 0 ? inwardCostPerCrate / breakdown.unitsPerCrate : 0)}/btl
            </div>
            <div className="text-[9px] text-amber-700 mt-0.5 truncate">
              Transport, labour & freight share
            </div>
          </div>

          {/* Final Landed Cost */}
          <div className="min-w-0 bg-emerald-600 text-white p-2 rounded-md shadow-xs flex flex-col justify-between">
            <div>
              <span className="text-[9px] uppercase font-bold text-emerald-100 block truncate">
                Final Landed Cost (All Costs)
              </span>
              <div className="font-mono font-black text-white text-base truncate">
                ₹{money(breakdown.landedCostPerCrate)}
                <span className="text-[10px] font-normal text-emerald-200">/cr</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono border-t border-emerald-500 pt-1 mt-1">
              <span className="font-bold text-emerald-100">
                ₹{money(breakdown.landedCostPerUnit)}/btl
              </span>
              <span className="text-[9px] text-emerald-200">
                ex-GST: ₹{money(breakdown.landedCostPerCrateExGst)}/cr
              </span>
            </div>
          </div>
        </div>

        {/* LINE TOTAL & TAXES SUMMARY BAR */}
        <div className="flex items-center justify-between bg-slate-100 px-2.5 py-1.5 rounded-md text-xs font-mono">
          <span className="text-slate-600 font-medium text-[11px]">
            Taxable Base: <strong>₹{money(breakdown.taxableAmount)}</strong> + GST ({breakdown.gstPercent}%):{' '}
            <strong>₹{money(breakdown.taxAmount)}</strong>
          </span>
          <span className="text-slate-900 font-extrabold text-xs">
            Invoice Line Total: ₹{money(breakdown.lineTotal)}
          </span>
        </div>
      </div>

      {/* COLLAPSIBLE DETAILS DRAWER: TAX, WHOLESALE & BATCH */}
      <div className="border-t pt-2 border-slate-200">
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-600 hover:text-indigo-600 transition-colors py-0.5 cursor-pointer"
        >
          <span>GST Rate, Wholesale Rate & Batch Lots</span>
          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {isExpanded && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">GST Rate Split</span>
              <select
                value={`${r.cgstPercent},${r.sgstPercent}`}
                onChange={(e) => {
                  const [cg, sg] = e.target.value.split(',').map(Number);
                  onUpdateField('cgstPercent', cg);
                  onUpdateField('sgstPercent', sg);
                }}
                className="w-full font-mono text-[11px] bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-800"
              >
                <option value="20,20">40% (20% CGST + 20% SGST) Carbonated</option>
                <option value="2.5,2.5">5% (2.5% CGST + 2.5% SGST) Juices</option>
                <option value="9,9">18% (9% CGST + 9% SGST) Water</option>
                <option value="6,6">12% (6% CGST + 6% SGST) Dairy</option>
                <option value="0,0">0% Exempt</option>
              </select>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Wholesale Selling Rate (₹)</span>
              <input
                type="number"
                value={r.wholesaleRate}
                onChange={(e) => onUpdateField('wholesaleRate', parseFloat(e.target.value) || 0)}
                className="w-full font-mono text-[11px] bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 text-right font-bold"
              />
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Retail / MRP Rate (₹)</span>
              <input
                type="number"
                value={r.retailRate}
                onChange={(e) => onUpdateField('retailRate', parseFloat(e.target.value) || 0)}
                className="w-full font-mono text-[11px] bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 text-right font-bold"
              />
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">HSN Code</span>
              <input
                type="text"
                value={r.hsn}
                onChange={(e) => onUpdateField('hsn', e.target.value)}
                className="w-full font-mono text-[11px] bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
              />
            </div>

            <div className="col-span-2">
              <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Lot Batch #</span>
              <input
                type="text"
                value={r.batchNumber}
                onChange={(e) => onUpdateField('batchNumber', e.target.value)}
                className="w-full font-mono text-[11px] bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
              />
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Mfg Date</span>
              <input
                type="date"
                value={r.mfgDate}
                onChange={(e) => onUpdateField('mfgDate', e.target.value)}
                className="w-full text-[11px] bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-800"
              />
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Expiry Date</span>
              <input
                type="date"
                value={r.expiry}
                onChange={(e) => onUpdateField('expiry', e.target.value)}
                className="w-full text-[11px] bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-800"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
