import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Layers } from 'lucide-react';
import { Warehouse } from '../../../types';
import { useLedger } from '../../../context/LedgerContext';
import { money } from '../../../utils/billing';
import { summariseSupplierDiscount } from '../../../utils/fefo';
import { todayISO, toLocalISODate } from '../../../utils/dateLocal';
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
  MiniStat,
  PhoneDownloadBar,
  PhoneHeader,
  PhoneSearch,
  RowCard,
  Tag,
  UnifiedPhoneFilterBar,
  PhoneFilterBottomSheet,
  rs,
} from './mobile/PhoneKit';

interface PurchasesReportProps {
  purchaseStats: {
    netPurchaseVal: number;
    totalCratesInward: number;
    totalGstPaid: number;
    totalCessPaid: number;
  };
  filteredGrns: any[];
  warehouses: Warehouse[];
  period: string;
  /** Lets the phone Filter sheet change the date period (same as Daily collection). */
  periodControl?: PhonePeriodControl;
  /** Label of the period chosen at the top of Reports (e.g. "November 2026"). Falls back to `period`. */
  periodLabel?: string;
  onNavigateInventory: () => void;
}

type ViewMode = 'daywise' | 'log';

interface GrnLine {
  g: any;
  date: string;
  supplier: string;
  invoiceNo: string;
  godown: string;
  crates: number;
  net: number;
  tax: number;
  total: number;
}

interface PurchaseDay {
  date: string;
  dateLabel: string;
  crates: number;
  net: number;
  tax: number;
  total: number;
  lines: GrnLine[];
}

const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'daywise', label: 'By day' },
  { id: 'log', label: 'Consignments' },
];

const formatDateHuman = (d: string): string => {
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

const grnCrates = (g: any): number =>
  g.totalReceivedQty ||
  g.items?.reduce(
    (s: number, i: any) => s + (i.totalReceivedQty ?? (i.schemeMode === 'additive' ? (i.qty || 0) + (i.freeQty || 0) : i.qty || 0)),
    0,
  ) ||
  0;

/**
 * Inward & purchases, laid out like "Daily collection": totals on top, always-visible search + filters,
 * then one collapsed card per day (open it to see every consignment). Uses the period chosen at the top of Reports.
 */
export const PurchasesReport: React.FC<PurchasesReportProps> = ({
  purchaseStats,
  filteredGrns,
  warehouses,
  period,
  periodControl,
  periodLabel,
  onNavigateInventory,
}) => {
  const { orgProfile } = useLedger();
  const label = periodLabel || period;

  const [viewMode, setViewMode] = useState<ViewMode>('daywise');
  const [godown, setGodown] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [explainOpen, setExplainOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const todayStr = useMemo(() => todayISO(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);
  const dayLabel = (d: string) =>
    d === todayStr ? `Today · ${formatDateHuman(d)}` : d === yesterdayStr ? `Yesterday · ${formatDateHuman(d)}` : formatDateHuman(d);

  const discountTotals = useMemo(() => {
    let line = 0;
    let bill = 0;
    filteredGrns.forEach((g) => {
      const s = summariseSupplierDiscount(g);
      line += s.lineDiscount;
      bill += s.billDiscount;
    });
    return { line, bill, total: line + bill };
  }, [filteredGrns]);

  const allLines = useMemo<GrnLine[]>(
    () =>
      filteredGrns
        .map((g) => ({
          g,
          date: (g.inwardDate || '').slice(0, 10) || 'Unknown date',
          supplier: g.supplierName || 'Supplier',
          invoiceNo: g.invoiceNo || '',
          godown: warehouses.find((w) => w.id === g.warehouseId)?.name || 'Godown',
          crates: grnCrates(g),
          net: g.totalTaxable || g.grandTotal || 0,
          tax: g.totalTax || (g.totalCgst || 0) + (g.totalSgst || 0) || 0,
          total: g.grandTotal || 0,
        }))
        .sort((a, b) => {
          const dCmp = b.date.localeCompare(a.date);
          return dCmp !== 0 ? dCmp : String(b.g.id).localeCompare(String(a.g.id));
        }),
    [filteredGrns, warehouses],
  );

  const godownOptions = useMemo(() => {
    const names = Array.from(new Set(allLines.map((l) => l.godown)));
    return [{ id: 'all', label: 'All godowns' }, ...names.map((n) => ({ id: n, label: n }))];
  }, [allLines]);
  const showGodownFilter = godownOptions.length > 2;

  const q = search.toLowerCase().trim();
  const isFiltered = godown !== 'all' || q.length > 0;

  const shownLines = useMemo(
    () =>
      allLines.filter((l) => {
        if (godown !== 'all' && l.godown !== godown) return false;
        if (q) {
          const hay = `${l.supplier} ${l.invoiceNo} ${l.g.id}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [allLines, godown, q],
  );

  const dayGroups = useMemo<PurchaseDay[]>(() => {
    const map = new Map<string, PurchaseDay>();
    shownLines.forEach((l) => {
      let d = map.get(l.date);
      if (!d) {
        d = { date: l.date, dateLabel: dayLabel(l.date), crates: 0, net: 0, tax: 0, total: 0, lines: [] };
        map.set(l.date, d);
      }
      d.crates += l.crates;
      d.net += l.net;
      d.tax += l.tax;
      d.total += l.total;
      d.lines.push(l);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownLines, todayStr, yesterdayStr]);

  const shownTotals = useMemo(
    () => ({
      net: shownLines.reduce((s, l) => s + l.net, 0),
      tax: shownLines.reduce((s, l) => s + l.tax, 0),
      total: shownLines.reduce((s, l) => s + l.total, 0),
      crates: shownLines.reduce((s, l) => s + l.crates, 0),
    }),
    [shownLines],
  );

  const periodActive = !!periodControl && isPeriodFilterActive(periodControl.period);
  const filterCount = (viewMode !== 'daywise' ? 1 : 0) + (godown !== 'all' ? 1 : 0) + (periodActive ? 1 : 0);

  const resetFilters = () => {
    setGodown('all');
    setSearch('');
  };
  const resetSheet = () => {
    resetFilters();
    setViewMode('daywise');
    periodControl?.onPeriodChange('thisMonth');
  };

  const forceOpen = q.length > 0;
  const isOpen = (d: string) => forceOpen || openDays.has(d);
  const toggleDay = (d: string) =>
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  const allOpen = dayGroups.length > 0 && dayGroups.every((g) => openDays.has(g.date));
  const toggleAll = () => setOpenDays(allOpen ? new Set() : new Set(dayGroups.map((g) => g.date)));

  // ---- downloads ---------------------------------------------------------------------------------
  const shop = orgProfile?.name || 'MrWater Distribution';
  const filterText = [godown !== 'all' ? godown : '', q ? `Search "${search.trim()}"` : ''].filter(Boolean).join(' · ');

  const exportExcel = () =>
    downloadXlsx(`inward-purchases-${fileStamp()}.xlsx`, [
      {
        name: 'Day-wise summary',
        header: ['Date', 'Consignments', 'Crates', 'Taxable (Rs)', 'GST (Rs)', 'Invoice total (Rs)'],
        rows: dayGroups.map((d) => [d.date, d.lines.length, d.crates, d.net, d.tax, d.total]),
        total: ['Total', shownLines.length, shownTotals.crates, shownTotals.net, shownTotals.tax, shownTotals.total],
      },
      {
        name: 'Consignments',
        header: ['GRN', 'Date', 'Supplier', 'Invoice no', 'Godown', 'Crates', 'Taxable (Rs)', 'GST (Rs)', 'Invoice total (Rs)'],
        rows: shownLines.map((l) => [String(l.g.id), l.date, l.supplier, l.invoiceNo, l.godown, l.crates, l.net, l.tax, l.total]),
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `inward-purchases-${fileStamp()}.pdf`,
      title: 'Inward & purchases',
      subtitle: [shop, `Period: ${label}`, ...(filterText ? [`Filtered: ${filterText}`] : [])],
      landscape: true,
      sections: [
        {
          title: 'Day-wise summary',
          header: ['Date', 'Consignments', 'Crates', 'Taxable (Rs.)', 'GST (Rs.)', 'Invoice total (Rs.)'],
          rows: dayGroups.map((d) => [formatDateHuman(d.date), d.lines.length, d.crates, money(d.net), money(d.tax), money(d.total)]),
          total: ['Total', shownLines.length, shownTotals.crates, money(shownTotals.net), money(shownTotals.tax), money(shownTotals.total)],
          rightAlign: [1, 2, 3, 4, 5],
        },
        {
          title: 'Consignments',
          header: ['GRN', 'Date', 'Supplier', 'Invoice no', 'Godown', 'Crates', 'Taxable (Rs.)', 'Invoice total (Rs.)'],
          rows: shownLines.map((l) => [String(l.g.id), l.date, l.supplier, l.invoiceNo || '-', l.godown, l.crates, money(l.net), money(l.total)]),
          rightAlign: [5, 6, 7],
        },
      ],
    });

  const hasAny = allLines.length > 0;
  const emptyText =
    hasAny && isFiltered ? 'Nothing matches these filters' : 'No inward invoices in this period. Receive a consignment in Inventory to see it here.';

  const lineTitle = (l: GrnLine) => l.supplier;
  const lineSub = (l: GrnLine, withDate: boolean) =>
    `${l.g.id}${withDate ? ` · ${formatDateHuman(l.date)}` : ''}${l.invoiceNo ? ` · Inv ${l.invoiceNo}` : ''} · ${l.godown} · ${l.crates} cs`;

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-inward-phone">
        <PhoneHeader title="Inward & purchases" sub="Consignments and inward stock" />

        <HeroCard tone="navy" label="Purchases (net of GST)" value={rs(purchaseStats.netPurchaseVal)}>
          <div className="text-[12.5px] text-white/90">
            {filteredGrns.length} consignment{filteredGrns.length === 1 ? '' : 's'} · {purchaseStats.totalCratesInward} crates received
          </div>
        </HeroCard>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Input GST (ITC)" value={rs(purchaseStats.totalGstPaid)} tone="green" />
          <MiniStat label="Cess paid" value={rs(purchaseStats.totalCessPaid)} />
          <MiniStat label="Supplier discount" value={rs(discountTotals.total)} tone={discountTotals.total > 0 ? 'green' : 'ink'} />
        </div>

        <UnifiedPhoneFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search supplier or invoice no…"
          onOpenFilter={() => setIsFilterSheetOpen(true)}
          activeFilterCount={filterCount}
        />

        <PhoneFilterBottomSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          title="Filter Inward & Purchases"
          activeCount={filterCount}
          onReset={resetSheet}
        >
          {periodControl && <PhonePeriodPicker {...periodControl} />}

          {/* View Mode */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              View Grouping
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VIEW_OPTIONS.map((opt) => {
                const isSelected = viewMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setViewMode(opt.id)}
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

          {/* Godowns */}
          {showGodownFilter && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Godown / Warehouse
              </label>
              <div className="grid grid-cols-2 gap-2">
                {godownOptions.map((opt) => {
                  const isSelected = godown === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setGodown(opt.id)}
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

        {(viewMode === 'daywise' && dayGroups.length > 1 && !forceOpen) || isFiltered ? (
          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
            <span>
              {shownLines.length} consignment{shownLines.length === 1 ? '' : 's'}
              {isFiltered && (
                <>
                  {' · '}
                  <button type="button" onClick={resetFilters} className="font-bold text-rose-600 cursor-pointer">
                    Clear filters
                  </button>
                </>
              )}
            </span>
            {viewMode === 'daywise' && dayGroups.length > 1 && !forceOpen && (
              <button type="button" onClick={toggleAll} className="font-bold text-slate-700 cursor-pointer min-h-[36px]">
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>
        ) : null}

        {shownLines.length === 0 && <EmptyNote>{emptyText}</EmptyNote>}

        {viewMode === 'daywise' &&
          dayGroups.map((d) => {
            const open = isOpen(d.date);
            return (
              <RowCard key={d.date}>
                <button
                  type="button"
                  onClick={() => toggleDay(d.date)}
                  aria-expanded={open}
                  disabled={forceOpen}
                  className="w-full text-left p-3 cursor-pointer active:bg-slate-50 disabled:cursor-default"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] font-extrabold text-slate-900 leading-snug break-words">{d.dateLabel}</div>
                      <div className="text-xs text-slate-500">
                        {d.lines.length} consignment{d.lines.length === 1 ? '' : 's'} · {d.crates} cs
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[17px] font-extrabold text-slate-900 tabular-nums leading-tight">{rs(d.total)}</div>
                      <div className="text-[11px] text-slate-500">invoiced</div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] font-semibold tabular-nums text-slate-600">
                    <span>Taxable {rs(d.net)}</span>
                    <span className="text-emerald-700">GST {rs(d.tax)}</span>
                  </div>
                </button>
                {open && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {d.lines.map((l) => (
                      <PhoneGrnRow key={String(l.g.id)} title={lineTitle(l)} sub={lineSub(l, false)} total={l.total} godown={l.godown} />
                    ))}
                  </ul>
                )}
              </RowCard>
            );
          })}

        {viewMode === 'log' && shownLines.length > 0 && (
          <RowCard>
            <ul className="divide-y divide-slate-100">
              {shownLines.map((l) => (
                <PhoneGrnRow key={String(l.g.id)} title={lineTitle(l)} sub={lineSub(l, true)} total={l.total} godown={l.godown} />
              ))}
            </ul>
          </RowCard>
        )}

        <button
          type="button"
          onClick={onNavigateInventory}
          className="w-full min-h-[48px] rounded-2xl border border-slate-200 bg-white text-[14px] font-bold text-slate-800 inline-flex items-center justify-center gap-2 cursor-pointer active:bg-slate-100"
        >
          Open Inward workspace <ArrowRight size={16} aria-hidden="true" />
        </button>

        <PhoneDownloadBar onExcel={exportExcel} onPdf={exportPdf} disabled={!hasAny} />
      </div>

      {/* ======================= TABLET / DESKTOP ======================= */}
      <div className="hidden md:block space-y-3" id="report-inward">
        <ReportTitleBar
          title="Inward & purchases"
          sub={`${label} · day by day: goods received from suppliers, with GST`}
          actions={
            <>
              <button
                type="button"
                onClick={onNavigateInventory}
                className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                Open Inward workspace <ArrowRight size={13} aria-hidden="true" />
              </button>
              <ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={!hasAny} reportTitle="Inward & purchases" />
            </>
          }
        />

        <ReportStatGrid>
          <ReportStat label="Purchases (net)" value={`₹${money(purchaseStats.netPurchaseVal)}`} sub={`${filteredGrns.length} consignment${filteredGrns.length === 1 ? '' : 's'}`} />
          <ReportStat label="Crates received" value={`${purchaseStats.totalCratesInward} cs`} tone="sky" sub="supplied to godowns" />
          <ReportStat label="Input GST (ITC)" value={`₹${money(purchaseStats.totalGstPaid)}`} tone="green" sub="offsets output GST" />
          <ReportStat label="Cess paid" value={`₹${money(purchaseStats.totalCessPaid)}`} tone="amber" sub="on carbonated drinks" />
        </ReportStatGrid>
        <ReportBreakdownLine onExplain={() => setExplainOpen(true)}>
          {discountTotals.total > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Layers size={13} aria-hidden="true" /> Supplier discounts ₹{money(discountTotals.total)} (line schemes ₹{money(discountTotals.line)} · bill discount ₹
              {money(discountTotals.bill)})
            </span>
          ) : (
            <span>No supplier discounts in this period</span>
          )}
        </ReportBreakdownLine>

        <ReportFilterPanel
          search={{ value: search, onChange: setSearch, placeholder: 'Search supplier, GRN or invoice no' }}
          isFiltered={isFiltered}
          onReset={resetFilters}
        >
          <ReportChipGroup<ViewMode> label="View" options={VIEW_OPTIONS} value={viewMode} onChange={setViewMode} />
          {showGodownFilter && <ReportChipGroup<string> label="Godown" options={godownOptions} value={godown} onChange={setGodown} />}
        </ReportFilterPanel>

        {viewMode === 'daywise' && dayGroups.length > 1 && !forceOpen && (
          <ReportListMeta allOpen={allOpen} onToggleAll={toggleAll}>
            {dayGroups.length} days · {shownLines.length} consignment{shownLines.length === 1 ? '' : 's'}
            {isFiltered ? ' match' : ''}
          </ReportListMeta>
        )}

        {shownLines.length === 0 && <ReportEmpty>{emptyText}</ReportEmpty>}

        {viewMode === 'daywise' &&
          dayGroups.map((d) => (
            <ReportGroupCard
              key={d.date}
              title={d.dateLabel}
              sub={`${d.lines.length} consignment${d.lines.length === 1 ? '' : 's'} · ${d.crates} cs`}
              inline={
                <>
                  <span>Taxable ₹{money(d.net)}</span>
                  <span className="text-emerald-700 font-semibold">GST ₹{money(d.tax)}</span>
                </>
              }
              headLabel="Invoiced"
              head={`₹${money(d.total)}`}
              headTone="ink"
              open={isOpen(d.date)}
              locked={forceOpen}
              onToggle={() => toggleDay(d.date)}
            >
              <ReportList>
                {d.lines.map((l) => (
                  <ReportRow
                    key={String(l.g.id)}
                    title={lineTitle(l)}
                    sub={lineSub(l, false)}
                    amount={`₹${money(l.total)}`}
                    status={`GST ₹${money(l.tax)}`}
                    statusTone="green"
                  />
                ))}
              </ReportList>
            </ReportGroupCard>
          ))}

        {viewMode === 'log' && shownLines.length > 0 && (
          <section className="rounded-2xl border border-black/10 bg-white overflow-hidden">
            <ReportList>
              {shownLines.map((l) => (
                <ReportRow
                  key={String(l.g.id)}
                  title={lineTitle(l)}
                  sub={lineSub(l, true)}
                  amount={`₹${money(l.total)}`}
                  status={`GST ₹${money(l.tax)}`}
                  statusTone="green"
                />
              ))}
            </ReportList>
          </section>
        )}
      </div>

      {explainOpen && (
        <ReportExplainModal ariaLabel="How inward and purchases are calculated" onClose={() => setExplainOpen(false)}>
          <ExplainBox tone="slate" title={`Purchases (net): ₹${money(purchaseStats.netPurchaseVal)}`}>
            <p>Taxable value of every goods-received voucher dated in this period, before GST.</p>
          </ExplainBox>
          <ExplainBox tone="emerald" title={`Input GST (ITC): ₹${money(purchaseStats.totalGstPaid)}`}>
            <p>GST charged by suppliers on those vouchers. It is set off against the GST you collect on sales.</p>
          </ExplainBox>
          <ExplainBox tone="amber" title={`Supplier discounts: ₹${money(discountTotals.total)}`}>
            <p>
              Line schemes and free crates (₹{money(discountTotals.line)}) plus bill-level discount (₹{money(discountTotals.bill)}).
              Bill discounts are spread into each batch&apos;s cost when stock is received.
            </p>
          </ExplainBox>
        </ReportExplainModal>
      )}
    </>
  );
};

/** One consignment line on the phone. */
const PhoneGrnRow: React.FC<{ title: string; sub: string; total: number; godown: string }> = ({ title, sub, total, godown }) => (
  <li className="p-3 flex items-start gap-3">
    <IconTile tone="blue">
      <Layers size={20} />
    </IconTile>
    <div className="min-w-0 flex-1">
      <div className="text-[15px] font-bold text-slate-900 leading-snug break-words">{title}</div>
      <div className="text-xs text-slate-500 leading-snug break-words">{sub}</div>
      <div className="mt-1.5">
        <Tag tone="grey">{godown}</Tag>
      </div>
    </div>
    <div className="text-right shrink-0">
      <div className="text-[17px] font-extrabold tabular-nums leading-tight text-slate-900">{rs(total)}</div>
      <div className="text-[11px] text-slate-400">invoice</div>
    </div>
  </li>
);
