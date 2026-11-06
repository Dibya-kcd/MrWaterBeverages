import React, { useMemo, useState } from 'react';
import { ChevronDown, Info, SlidersHorizontal, Check } from 'lucide-react';
import {
  EmptyNote,
  HeroCard,
  MiniStat,
  PhoneDownloadBar,
  RowCard,
  Tag,
  UnifiedPhoneFilterBar,
  PhoneFilterBottomSheet,
  rs,
  rsShort,
} from './PhoneKit';

/** The fields of one product row that the phone card needs (the report's own row type has more). */
export interface ProductProfitRow {
  product: { id: number | string; name: string };
  salesQty: number;
  salesFreeQty: number;
  salesValue: number;
  salesTaxableValue: number;
  salesGst: number;
  adjustedCostConfirmed: number;
  grossProfitConfirmed: number;
  marginConfirmed: number;
  avgBilledSellingPrice: number;
  profitPerCase: number;
}

type SortId = 'profit' | 'margin' | 'az';

const SORTS: { id: SortId; label: string }[] = [
  { id: 'profit', label: 'Most profit' },
  { id: 'margin', label: 'Lowest margin' },
  { id: 'az', label: 'A–Z' },
];

/** Margin at which the bar is full. 20% and above reads as "very healthy". */
const FULL_BAR_MARGIN = 20;
const LOW_MARGIN = 5;

export interface ProductProfitPhoneProps {
  rows: ProductProfitRow[];
  totalProfit: number;
  totalGst: number;
  creditReceived: number;
  creditOutstanding: number;
  search: string;
  onSearch: (v: string) => void;
  warehouseId: string;
  onWarehouse: (v: string) => void;
  warehouses: { id: string; name: string }[];
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
}

/** Phone layout of "Product profit": profit on top, unified search & filter bottom sheet, cards with margin bar. */
export const ProductProfitPhone: React.FC<ProductProfitPhoneProps> = ({
  rows,
  totalProfit,
  totalGst,
  creditReceived,
  creditOutstanding,
  search,
  onSearch,
  warehouseId,
  onWarehouse,
  warehouses,
  onExcel,
  onPdf,
}) => {
  const [sort, setSort] = useState<SortId>('profit');
  const [how, setHow] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const list = useMemo(() => {
    const l = rows.slice();
    l.sort((a, b) =>
      sort === 'margin'
        ? a.marginConfirmed - b.marginConfirmed
        : sort === 'az'
          ? a.product.name.localeCompare(b.product.name)
          : b.grossProfitConfirmed - a.grossProfitConfirmed,
    );
    return l;
  }, [rows, sort]);

  const activeFilterCount = (sort !== 'profit' ? 1 : 0) + (warehouseId !== 'all' ? 1 : 0);

  return (
    <div className="md:hidden space-y-3.5" id="report-product-profit-phone">
      {/* Title Header */}
      <div className="flex items-center justify-between px-0.5">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
            Product Profit
          </h2>
          <p className="text-xs text-slate-500 font-medium">Profit after GST, per product</p>
        </div>
        <button
          type="button"
          onClick={() => setHow((v) => !v)}
          aria-expanded={how}
          className="px-3 py-1.5 rounded-full border border-blue-100 bg-white text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer shadow-2xs hover:bg-slate-50 transition-colors"
        >
          <Info size={14} className="text-blue-600" />
          <span>How?</span>
        </button>
      </div>

      {how && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs leading-relaxed text-blue-950 space-y-1.5">
          <p>
            <strong>Profit</strong> = what you sold for <em>without GST</em>, minus what the cases cost you (after supplier
            credits and free cases).
          </p>
          <p>The GST you collected from shops is not your money, so it is left out of profit.</p>
          <p>
            <strong>Avg selling price</strong> = total billed amount ÷ billed cases (free cases are not counted).
          </p>
        </div>
      )}

      {/* Hero Card with Green / Navy gradient */}
      <HeroCard
        tone={totalProfit < 0 ? 'red' : 'profit'}
        label="Operating profit (after GST)"
        value={rs(totalProfit)}
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/95">
          <span>
            GST collected <strong className="text-white tabular-nums font-bold">{rs(totalGst)}</strong>
          </span>
          <span>
            Credit received <strong className="text-white tabular-nums font-bold">{rs(creditReceived)}</strong>
          </span>
        </div>
        <div className="text-xs text-white/80 pt-1 border-t border-white/10 mt-1">
          Outstanding <strong className="text-white tabular-nums font-bold">{rs(creditOutstanding)}</strong>
        </div>
      </HeroCard>

      {/* Unified Search & Filter Bar */}
      <UnifiedPhoneFilterBar
        search={search}
        onSearch={onSearch}
        placeholder="Search product…"
        onOpenFilter={() => setIsFilterSheetOpen(true)}
        activeFilterCount={activeFilterCount}
      />

      {/* Filter Bottom Sheet Modal */}
      <PhoneFilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="Sort & Filter Products"
        activeCount={activeFilterCount}
        onReset={() => {
          setSort('profit');
          onWarehouse('all');
        }}
      >
        {/* Sort Order */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Sort Order
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SORTS.map((s) => {
              const isCurrent = sort === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSort(s.id)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors text-center ${
                    isCurrent
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Warehouse Filter */}
        {warehouses.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Godown / Warehouse
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onWarehouse('all')}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors text-center ${
                  warehouseId === 'all'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                All godowns
              </button>
              {warehouses.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onWarehouse(w.id)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors text-center ${
                    warehouseId === w.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </PhoneFilterBottomSheet>

      {/* Products List */}
      {rows.length === 0 && (
        <EmptyNote>No product sales recorded in this period</EmptyNote>
      )}
      {rows.length > 0 && list.length === 0 && (
        <EmptyNote>No products match your search</EmptyNote>
      )}

      <div className="space-y-3">
        {list.map((r) => {
          const isNegative = r.grossProfitConfirmed < 0;
          const isLow = !isNegative && r.marginConfirmed < LOW_MARGIN;
          const tone = isNegative ? 'red' : isLow ? 'amber' : 'green';
          const marginClamped = Math.max(0, Math.min(FULL_BAR_MARGIN, r.marginConfirmed));
          const barPct = Math.round((marginClamped / FULL_BAR_MARGIN) * 100);

          return (
            <div
              key={r.product.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15px] sm:text-base font-extrabold text-slate-900 break-words leading-snug">
                    {r.product.name}
                  </h3>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {r.salesQty} cases sold
                    {r.salesFreeQty > 0 && ` · ${r.salesFreeQty} free`}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className={`text-[17px] sm:text-[19px] font-extrabold tabular-nums leading-tight ${
                      isNegative ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {rs(r.grossProfitConfirmed)}
                  </div>
                  <Tag tone={tone}>{r.marginConfirmed.toFixed(1)}% margin</Tag>
                </div>
              </div>

              {/* Margin Bar */}
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isNegative ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>

              {/* Metric grid */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <MiniStat label="Sales" value={rsShort(r.salesValue)} tone="ink" />
                <MiniStat label="Taxable" value={rsShort(r.salesTaxableValue)} tone="ink" />
                <MiniStat label="Profit/cs" value={rs(r.profitPerCase)} tone={isNegative ? 'red' : 'green'} />
              </div>
            </div>
          );
        })}
      </div>

      <PhoneDownloadBar onExcel={onExcel} onPdf={onPdf} disabled={rows.length === 0} />
    </div>
  );
};
