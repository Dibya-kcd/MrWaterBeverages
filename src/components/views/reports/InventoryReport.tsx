import React, { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Droplets, Package, Search, X } from 'lucide-react';
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
import { PhoneDownloadBar, rs } from './mobile/PhoneKit';
import { MobileReportTopBar } from './mobile/MobileReportContext';

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
  const { orgProfile, inventoryBatches, warehouses } = useLedger();

  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [explainOpen, setExplainOpen] = useState(false);

  const totalLanded = inventoryStats.totalCostValuationInclGst || inventoryStats.totalCostValuation;
  const inputGst = inventoryStats.totalInputGst || Math.max(0, totalLanded - inventoryStats.totalCostValuation);

  const warehouseByProduct = useMemo(() => {
    const whName = new Map<string, string>();
    (warehouses || []).forEach((w) => whName.set(String(w.id), w.name));
    const prodWh = new Map<number, Set<string>>();
    (inventoryBatches || []).forEach((b) => {
      if ((Number(b.quantity) || 0) > 0 && b.warehouseId) {
        const nm = whName.get(String(b.warehouseId));
        if (nm) {
          const s = prodWh.get(b.productId) || new Set<string>();
          s.add(nm);
          prodWh.set(b.productId, s);
        }
      }
    });
    const out = new Map<number, string>();
    prodWh.forEach((s, pid) => out.set(pid, Array.from(s).join(', ')));
    return out;
  }, [inventoryBatches, warehouses]);

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
  const stockTone = (rem: number) => (rem <= 0 ? ('red' as const) : rem < LOW_STOCK_BELOW ? ('amber' as const) : ('ink' as const));
  const rowSub = (l: StockLine) => `Rate ₹${money(l.cost)} · Wholesale ₹${money(l.whole)} · Margin +₹${money(l.margin)}/case`;
  const phoneStockChips: { id: StockFilter; label: string }[] = [
    { id: 'all', label: 'All items' },
    { id: 'low', label: stockCounts.low > 0 ? `Low (${stockCounts.low})` : 'Low' },
    { id: 'out', label: stockCounts.out > 0 ? `Out of stock (${stockCounts.out})` : 'Out of stock' },
  ];

  const shareProps = {
    reportTitle: 'Inventory & value',
    summaryLines: [
      { label: 'Stock value', value: rs(inventoryStats.totalCostValuation) },
      { label: 'In stock', value: `${inventoryStats.totalCrates} cases · ${products.length} products` },
      { label: 'Wholesale value', value: rs(inventoryStats.totalSellingValuation) },
    ],
    sheets: [
      {
        name: 'Stock valuation',
        header: ['Item', 'Category', 'In stock (cs)', 'Rate', 'Asset value'],
        rows: shownLines.map((l) => [l.p.name, String(l.p.category || ''), l.rem, l.cost, l.costVal]),
      },
    ],
    pdfSections: [
      {
        title: 'Stock valuation',
        header: ['Item', 'In stock', 'Asset value'],
        rows: shownLines.map((l) => [l.p.name, `${l.rem} cs`, money(l.costVal)]),
        rightAlign: [1, 2],
      },
    ],
  };

  const expirySoon = expiryRadar.critical;

  const expiryBox = expirySoon.length > 0 && (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
      <div className="flex items-center gap-2 font-bold text-amber-900 text-[12.5px]">
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
        <MobileReportTopBar
          title="Inventory & value"
          sub="Stock valuation"
          showPeriod={false}
          shareProps={shareProps}
        />

        {/* Stock value card */}
        <section className="rt-rep-card rt-rep-pad">
          <div className="text-[12px] font-medium text-[var(--text-2)]">Stock value</div>
          <div className="text-[26px] font-extrabold text-[var(--text)] tracking-tight leading-tight tabular-nums mt-0.5">
            {rs(inventoryStats.totalCostValuation)}
          </div>
          <div className="text-[11.5px] text-[var(--text-2)] mt-1">
            {inventoryStats.totalCrates.toLocaleString('en-IN')} cases · {products.length} {products.length === 1 ? 'product' : 'products'}
          </div>
        </section>

        {expiryBox}

        {/* Filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {phoneStockChips.map((opt) => {
            const active = stockFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStockFilter(opt.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--text)] text-white border-[var(--text)]'
                    : 'bg-white text-[var(--text)] border-[var(--border)]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Search bar */}
        <div className="rt-search-bar">
          <Search size={15} className="text-[var(--text-2)] shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item…"
          />
          {search.trim() && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-[var(--text-2)] p-1 cursor-pointer"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Product list */}
        {shownLines.length === 0 ? (
          <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
            {emptyText}
          </div>
        ) : (
          <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
            {shownLines.map((l) => {
              const isOut = l.rem <= 0;
              const isLow = l.rem > 0 && l.rem < LOW_STOCK_BELOW;
              const whLabel = warehouseByProduct.get(l.p.id) || String(l.p.category || 'Main godown');
              return (
                <div key={l.p.id} className="px-3.5 py-3 flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      isOut
                        ? 'bg-[#f1f5f9] text-[var(--text-2)]'
                        : isLow
                          ? 'bg-[var(--soon-bg)] text-[var(--soon)]'
                          : 'bg-[#eaf3fd] text-[var(--primary)]'
                    }`}
                  >
                    {isOut ? <Boxes size={16} /> : isLow ? <Package size={16} /> : <Droplets size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug truncate">
                      {l.p.name}
                    </div>
                    <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 truncate">
                      {whLabel}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums">
                      {isOut ? '0' : `${l.rem} ${l.rem === 1 ? 'case' : 'cases'}`}
                    </div>
                    {isOut ? (
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--due-bg)] text-[var(--due)]">
                        Out
                      </span>
                    ) : isLow ? (
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--soon-bg)] text-[var(--soon)]">
                        Low
                      </span>
                    ) : (
                      <div className="text-[11px] font-semibold text-[var(--text-2)] tabular-nums mt-0.5">
                        {rs(l.costVal)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

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
