import React, { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Check } from 'lucide-react';
import { Product } from '../../../types';
import { useLedger } from '../../../context/LedgerContext';
import { money, resolveProductGstRate } from '../../../utils/billing';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import {
  ExplainBox,
  ReportBreakdownLine,
  ReportChipGroup,
  ReportEmpty,
  ReportExplainModal,
  ReportFilterPanel,
  ReportGroupCard,
  ReportList,
  ReportListMeta,
  ReportRow,
  ReportStat,
  ReportStatGrid,
  ReportTitleBar,
} from './ReportKit';
import {
  Chips,
  EmptyNote,
  HeroCard,
  IconTile,
  LegendDot,
  MiniStat,
  PhoneDownloadBar,
  PhoneHeader,
  PhoneSearch,
  RowCard,
  SplitBar,
  Tag,
  UnifiedPhoneFilterBar,
  PhoneFilterBottomSheet,
  rs,
} from './mobile/PhoneKit';

interface InventoryReportProps {
  inventoryStats: {
    totalCrates: number;
    totalCostValuation: number;
    totalCostValuationInclGst?: number;
    totalInputGst?: number;
    totalSellingValuation: number;
    potentialGrossProfit: number;
    marginPct: number;
  };
  products: Product[];
  remainingStock: (id: number) => number;
  expiryRadar: {
    expired: any[];
    critical: any[];
  };
}

type StockFilter = 'all' | 'low' | 'out';

const LOW_STOCK_BELOW = 5;

const STOCK_OPTIONS: { id: StockFilter; label: string }[] = [
  { id: 'all', label: 'All items' },
  { id: 'low', label: `Low stock (under ${LOW_STOCK_BELOW})` },
  { id: 'out', label: 'Out of stock' },
];

interface StockLine {
  p: Product;
  rem: number;
  cost: number;
  landed: number;
  whole: number;
  costVal: number;
  landedVal: number;
  sellVal: number;
  margin: number;
}

interface CategoryGroup {
  category: string;
  lines: StockLine[];
  crates: number;
  costVal: number;
  sellVal: number;
}

/**
 * Inventory & value, laid out like "Daily collection": totals on top, always-visible search + filters,
 * then one collapsed card per category (open it to see every item with its stock, cost and margin).
 */
export const InventoryReport: React.FC<InventoryReportProps> = ({ inventoryStats, products, remainingStock, expiryRadar }) => {
  const { orgProfile } = useLedger();

  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [explainOpen, setExplainOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const totalLanded = inventoryStats.totalCostValuationInclGst || inventoryStats.totalCostValuation;
  const inputGst = inventoryStats.totalInputGst || Math.max(0, totalLanded - inventoryStats.totalCostValuation);

  // ---- every product with its numbers ------------------------------------------------------------
  const allLines = useMemo<StockLine[]>(
    () =>
      (products || []).map((p) => {
        const rem = remainingStock(p.id);
        const cost = p.effectiveCost || p.cost || 0;
        const landed = p.landedCostPerCrate && p.landedCostPerCrate > 0 ? p.landedCostPerCrate : cost * (1 + resolveProductGstRate(p));
        const whole = p.wholesale || p.retail || cost;
        return { p, rem, cost, landed, whole, costVal: rem * cost, landedVal: rem * landed, sellVal: rem * whole, margin: whole - cost };
      }),
    [products, remainingStock],
  );

  const categoryOptions = useMemo(() => {
    const cats = Array.from(new Set(allLines.map((l) => String(l.p.category || 'Other')))).sort();
    return [{ id: 'all', label: 'All categories' }, ...cats.map((c) => ({ id: c, label: c }))];
  }, [allLines]);
  const showCategoryFilter = categoryOptions.length > 2;

  const q = search.toLowerCase().trim();
  const isFiltered = stockFilter !== 'all' || category !== 'all' || q.length > 0;

  const stockCounts = useMemo<Record<StockFilter, number>>(
    () => ({
      all: allLines.length,
      low: allLines.filter((l) => l.rem > 0 && l.rem < LOW_STOCK_BELOW).length,
      out: allLines.filter((l) => l.rem <= 0).length,
    }),
    [allLines],
  );

  const shownLines = useMemo(
    () =>
      allLines.filter((l) => {
        if (stockFilter === 'low' && !(l.rem > 0 && l.rem < LOW_STOCK_BELOW)) return false;
        if (stockFilter === 'out' && l.rem > 0) return false;
        if (category !== 'all' && String(l.p.category || 'Other') !== category) return false;
        if (q && !`${l.p.name} ${l.p.category || ''}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    [allLines, stockFilter, category, q],
  );

  const groups = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, CategoryGroup>();
    shownLines.forEach((l) => {
      const c = String(l.p.category || 'Other');
      let g = map.get(c);
      if (!g) {
        g = { category: c, lines: [], crates: 0, costVal: 0, sellVal: 0 };
        map.set(c, g);
      }
      g.lines.push(l);
      g.crates += l.rem;
      g.costVal += l.costVal;
      g.sellVal += l.sellVal;
    });
    return Array.from(map.values()).sort((a, b) => b.sellVal - a.sellVal);
  }, [shownLines]);

  const resetFilters = () => {
    setStockFilter('all');
    setCategory('all');
    setSearch('');
  };

  const forceOpen = q.length > 0;
  const isOpen = (c: string) => forceOpen || openCats.has(c);
  const toggle = (c: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  const allOpen = groups.length > 0 && groups.every((g) => openCats.has(g.category));
  const toggleAll = () => setOpenCats(allOpen ? new Set() : new Set(groups.map((g) => g.category)));

  // ---- downloads ---------------------------------------------------------------------------------
  const shop = orgProfile?.name || 'MrWater Distribution';
  const filterText = [
    stockFilter !== 'all' ? STOCK_OPTIONS.find((o) => o.id === stockFilter)?.label : '',
    category !== 'all' ? category : '',
    q ? `Search "${search.trim()}"` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const sum = (f: (l: StockLine) => number) => shownLines.reduce((s, l) => s + f(l), 0);

  const exportExcel = () =>
    downloadXlsx(`inventory-value-${fileStamp()}.xlsx`, [
      {
        name: 'Stock valuation',
        header: ['Item', 'Category', 'In stock (cs)', 'Purchase rate (Rs)', 'Asset value ex-tax (Rs)', 'Landed incl-tax (Rs)', 'Wholesale rate (Rs)', 'Wholesale value (Rs)', 'Margin / case (Rs)'],
        rows: shownLines.map((l) => [l.p.name, String(l.p.category || ''), l.rem, l.cost, l.costVal, l.landedVal, l.whole, l.sellVal, l.margin]),
        total: ['Total', '', sum((l) => l.rem), '', sum((l) => l.costVal), sum((l) => l.landedVal), '', sum((l) => l.sellVal), ''],
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `inventory-value-${fileStamp()}.pdf`,
      title: 'Inventory & value',
      subtitle: [shop, `As on: ${fileStamp()}`, ...(filterText ? [`Filtered: ${filterText}`] : [])],
      landscape: true,
      sections: [
        {
          title: 'Stock valuation',
          header: ['Item', 'Category', 'Stock (cs)', 'Rate (Rs.)', 'Asset value (Rs.)', 'Landed (Rs.)', 'Wholesale (Rs.)', 'Realisation (Rs.)', 'Margin/case (Rs.)'],
          rows: shownLines.map((l) => [l.p.name, String(l.p.category || ''), l.rem, money(l.cost), money(l.costVal), money(l.landedVal), money(l.whole), money(l.sellVal), money(l.margin)]),
          total: ['Total', '', sum((l) => l.rem), '', money(sum((l) => l.costVal)), money(sum((l) => l.landedVal)), '', money(sum((l) => l.sellVal)), ''],
          rightAlign: [2, 3, 4, 5, 6, 7, 8],
        },
      ],
    });

  const hasAny = allLines.length > 0;
  const emptyText = hasAny && isFiltered ? 'Nothing matches these filters' : 'No products yet. Add products to see stock and value here.';
  const stockOptionsWithCount = STOCK_OPTIONS.map((o) => ({ ...o, count: stockCounts[o.id] }));
  const phoneStockOptions = STOCK_OPTIONS.map((o) => ({ id: o.id, label: o.id === 'all' ? o.label : `${o.label} ${stockCounts[o.id]}` }));
  const stockTone = (rem: number) => (rem <= 0 ? ('red' as const) : rem < LOW_STOCK_BELOW ? ('amber' as const) : ('ink' as const));

  const rowSub = (l: StockLine) => `Rate ₹${money(l.cost)} · Wholesale ₹${money(l.whole)} · Margin +₹${money(l.margin)}/case`;

  const expirySoon = expiryRadar.critical;

  const expiryBox = expirySoon.length > 0 && (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
      <div className="flex items-center gap-2 font-bold text-amber-900 text-[13px]">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
        Expires soon · {expirySoon.length} batch{expirySoon.length === 1 ? '' : 'es'}
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {expirySoon.map((b, idx) => (
          <li key={idx} className="rounded-xl bg-white border border-amber-200 p-2.5 text-xs">
            <div className="font-bold text-slate-900 break-words">{b.productName}</div>
            <div className="text-slate-500">
              Batch {b.batchNumber} · {b.quantity} cs
            </div>
            <div className="text-amber-700 font-semibold">Expires {b.expiryDate}</div>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-inventory-phone">
        <PhoneHeader title="Inventory & value" sub="Stock as on today" />

        <HeroCard tone="navy" label="Stock asset value (ex-tax)" value={rs(inventoryStats.totalCostValuation)}>
          <SplitBar
            label="Ex-tax value and input GST"
            parts={[
              { value: inventoryStats.totalCostValuation, className: 'bg-emerald-400' },
              { value: inputGst, className: 'bg-amber-400' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/90">
            <LegendDot dot="bg-emerald-400">Ex-tax {rs(inventoryStats.totalCostValuation)}</LegendDot>
            <LegendDot dot="bg-amber-400">GST {rs(inputGst)}</LegendDot>
          </div>
        </HeroCard>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="In stock" value={`${inventoryStats.totalCrates} cs`} />
          <MiniStat label="Realisation" value={rs(inventoryStats.totalSellingValuation)} tone="green" />
          <MiniStat label="Gross profit" value={rs(inventoryStats.potentialGrossProfit)} tone={inventoryStats.potentialGrossProfit < 0 ? 'red' : 'profit'} />
        </div>
        <button
          type="button"
          onClick={() => setExplainOpen(true)}
          className="inline-flex items-center gap-1.5 min-h-[36px] px-1 text-[12.5px] font-semibold text-sky-700 cursor-pointer"
        >
          How is this calculated?
        </button>

        {expiryBox}

        <UnifiedPhoneFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search item or category…"
          onOpenFilter={() => setIsFilterSheetOpen(true)}
          activeFilterCount={(stockFilter !== 'all' ? 1 : 0) + (category !== 'all' ? 1 : 0)}
        />

        <PhoneFilterBottomSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          title="Filter Inventory"
          activeCount={(stockFilter !== 'all' ? 1 : 0) + (category !== 'all' ? 1 : 0)}
          onReset={resetFilters}
        >
          {/* Stock Availability */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Stock Availability
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STOCK_OPTIONS.map((opt) => {
                const isSelected = stockFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStockFilter(opt.id)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 text-blue-900 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categories */}
          {showCategoryFilter && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Category
              </label>
              <div className="grid grid-cols-2 gap-2">
                {categoryOptions.map((opt) => {
                  const isSelected = category === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCategory(opt.id)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/70 text-blue-900 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </PhoneFilterBottomSheet>

        {(groups.length > 1 && !forceOpen) || isFiltered ? (
          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
            <span>
              {shownLines.length} item{shownLines.length === 1 ? '' : 's'}
              {isFiltered && (
                <>
                  {' · '}
                  <button type="button" onClick={resetFilters} className="font-bold text-rose-600 cursor-pointer">
                    Clear filters
                  </button>
                </>
              )}
            </span>
            {groups.length > 1 && !forceOpen && (
              <button type="button" onClick={toggleAll} className="font-bold text-slate-700 cursor-pointer min-h-[36px]">
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>
        ) : null}

        {groups.length === 0 && <EmptyNote>{emptyText}</EmptyNote>}

        {groups.map((g) => {
          const open = isOpen(g.category);
          return (
            <RowCard key={g.category}>
              <button
                type="button"
                onClick={() => toggle(g.category)}
                aria-expanded={open}
                disabled={forceOpen}
                className="w-full text-left p-3 cursor-pointer active:bg-slate-50 disabled:cursor-default"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-extrabold text-slate-900 leading-snug break-words">{g.category}</div>
                    <div className="text-xs text-slate-500">
                      {g.lines.length} item{g.lines.length === 1 ? '' : 's'} · {g.crates} cs in stock
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[17px] font-extrabold text-emerald-700 tabular-nums leading-tight">{rs(g.sellVal)}</div>
                    <div className="text-[11px] text-slate-500">wholesale value</div>
                  </div>
                </div>
              </button>
              {open && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {g.lines.map((l) => (
                    <li key={l.p.id} className="p-3 flex items-start gap-3">
                      <IconTile tone={l.rem <= 0 ? 'red' : l.rem < LOW_STOCK_BELOW ? 'grey' : 'blue'}>
                        <Boxes size={20} />
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold text-slate-900 leading-snug break-words">{l.p.name}</div>
                        <div className="text-xs text-slate-500 leading-snug">{rowSub(l)}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Tag tone={l.rem <= 0 ? 'red' : l.rem < LOW_STOCK_BELOW ? 'amber' : 'green'}>
                            {l.rem <= 0 ? 'Out of stock' : `${l.rem} cs in stock`}
                          </Tag>
                          <Tag tone="grey">Asset {rs(l.costVal)}</Tag>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[17px] font-extrabold tabular-nums leading-tight text-emerald-700">{rs(l.sellVal)}</div>
                        <div className="text-[11px] text-slate-400">realisation</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </RowCard>
          );
        })}

        <PhoneDownloadBar onExcel={exportExcel} onPdf={exportPdf} disabled={!hasAny} />
      </div>

      {/* ======================= TABLET / DESKTOP ======================= */}
      <div className="hidden md:block space-y-3" id="report-inventory">
        <ReportTitleBar
          title="Inventory & value"
          sub="Stock as on today · crates in hand, what they cost and what they should fetch"
          actions={<ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={!hasAny} reportTitle="Inventory & value" />}
        />

        <ReportStatGrid>
          <ReportStat label="Stock on hand" value={`${inventoryStats.totalCrates} cs`} sub={`${products.length} items`} />
          <ReportStat label="Asset value (ex-tax)" value={`₹${money(inventoryStats.totalCostValuation)}`} sub={`landed ₹${money(totalLanded)} incl. GST`} />
          <ReportStat label="Wholesale realisation" value={`₹${money(inventoryStats.totalSellingValuation)}`} tone="green" sub="expected revenue" />
          <ReportStat label="Potential profit" value={`₹${money(inventoryStats.potentialGrossProfit)}`} tone="green" sub={`~${inventoryStats.marginPct.toFixed(1)}% gross margin`} />
        </ReportStatGrid>
        <ReportBreakdownLine onExplain={() => setExplainOpen(true)}>
          Ex-tax ₹{money(inventoryStats.totalCostValuation)} + input GST ₹{money(inputGst)} = landed ₹{money(totalLanded)}
        </ReportBreakdownLine>

        {expiryBox}

        <ReportFilterPanel
          search={{ value: search, onChange: setSearch, placeholder: 'Search item or category' }}
          isFiltered={isFiltered}
          onReset={resetFilters}
        >
          <ReportChipGroup<StockFilter> label="Show" options={stockOptionsWithCount} value={stockFilter} onChange={setStockFilter} />
          {showCategoryFilter && <ReportChipGroup<string> label="Category" options={categoryOptions} value={category} onChange={setCategory} />}
        </ReportFilterPanel>

        {groups.length > 1 && !forceOpen && (
          <ReportListMeta allOpen={allOpen} onToggleAll={toggleAll}>
            {groups.length} categories · {shownLines.length} item{shownLines.length === 1 ? '' : 's'}
            {isFiltered ? ' match' : ''}
          </ReportListMeta>
        )}

        {groups.length === 0 && <ReportEmpty>{emptyText}</ReportEmpty>}

        {groups.map((g) => (
          <ReportGroupCard
            key={g.category}
            title={g.category}
            sub={`${g.lines.length} item${g.lines.length === 1 ? '' : 's'} · ${g.crates} cs in stock`}
            inline={
              <>
                <span>Asset ₹{money(g.costVal)}</span>
              </>
            }
            headLabel="Wholesale value"
            head={`₹${money(g.sellVal)}`}
            open={isOpen(g.category)}
            locked={forceOpen}
            onToggle={() => toggle(g.category)}
          >
            <ReportList>
              {g.lines.map((l) => (
                <ReportRow
                  key={l.p.id}
                  title={l.p.name}
                  sub={`${l.rem <= 0 ? 'Out of stock' : `${l.rem} cs in stock`} · ${rowSub(l)} · Asset ₹${money(l.costVal)} · Landed ₹${money(l.landedVal)}`}
                  amount={`₹${money(l.sellVal)}`}
                  amountTone="green"
                  status={l.rem <= 0 ? 'Out of stock' : l.rem < LOW_STOCK_BELOW ? 'Low stock' : 'In stock'}
                  statusTone={stockTone(l.rem) === 'ink' ? 'green' : stockTone(l.rem)}
                />
              ))}
            </ReportList>
          </ReportGroupCard>
        ))}
      </div>

      {explainOpen && (
        <ReportExplainModal ariaLabel="How inventory value is calculated" onClose={() => setExplainOpen(false)}>
          <ExplainBox tone="slate" title={`Asset value: ₹${money(inventoryStats.totalCostValuation)}`}>
            <p>
              Crates in stock × purchase rate, <strong>without GST</strong>. GST paid on purchases is recovered as input tax credit,
              so it is not part of stock value.
            </p>
          </ExplainBox>
          <ExplainBox tone="amber" title={`Input GST: ₹${money(inputGst)}`}>
            <p>GST paid on the crates still in stock. Landed cost = asset value + input GST = ₹{money(totalLanded)}.</p>
          </ExplainBox>
          <ExplainBox tone="emerald" title={`Realisation: ₹${money(inventoryStats.totalSellingValuation)}`}>
            <p>Crates in stock × wholesale rate (retail rate when no wholesale rate is set).</p>
          </ExplainBox>
          <ExplainBox tone="slate" title={`Potential profit: ₹${money(inventoryStats.potentialGrossProfit)}`}>
            <p>Realisation (ex-GST) minus asset value. About {inventoryStats.marginPct.toFixed(1)}% of the selling value.</p>
          </ExplainBox>
        </ReportExplainModal>
      )}
    </>
  );
};
