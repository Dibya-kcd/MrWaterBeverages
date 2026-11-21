import React, { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Layers, Search, Truck, X } from 'lucide-react';
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
import { PhoneDownloadBar, type PhonePeriodControl, rs } from './mobile/PhoneKit';
import { MobileReportTopBar } from './mobile/MobileReportContext';

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

  const resetFilters = () => {
    setGodown('all');
    setSearch('');
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

  const compactRs = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`;
    if (abs >= 1000) return `₹${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `₹${Math.round(abs)}`;
  };
  const shortDate = (d: string) => {
    const dt = new Date(`${d}T12:00:00`);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const shareProps = {
    reportTitle: 'Inward & purchases',
    summaryLines: [
      { label: 'Bought (incl. GST)', value: rs(shownTotals.total) },
      { label: 'Taxable purchases', value: rs(shownTotals.net) },
      { label: 'Input GST', value: rs(shownTotals.tax) },
      { label: 'Cases received', value: `${shownTotals.crates} cs` },
    ],
    sheets: [
      {
        name: 'Consignments',
        header: ['GRN', 'Date', 'Supplier', 'Godown', 'Cases', 'Total'],
        rows: shownLines.map((l) => [String(l.g.id), l.date, l.supplier, l.godown, l.crates, l.total]),
      },
    ],
    pdfSections: [
      {
        title: 'Consignments',
        header: ['GRN', 'Date', 'Supplier', 'Cases', 'Total'],
        rows: shownLines.map((l) => [String(l.g.id), l.date, l.supplier, l.crates, money(l.total)]),
        rightAlign: [3, 4],
      },
    ],
  };

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-inward-phone">
        <MobileReportTopBar
          title="Inward & purchases"
          sub={viewMode === 'daywise' ? 'Day-wise summary' : 'Consignments'}
          showPeriod
          shareProps={shareProps}
        />

        {/* Row 1: View chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {VIEW_OPTIONS.map((opt) => {
            const active = viewMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setViewMode(opt.id)}
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

        {/* Row 2: Godown chips */}
        {godownOptions.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {godownOptions.map((opt) => {
              const active = godown === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setGodown(opt.id)}
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
        )}

        {/* Bought summary card */}
        <section className="rt-rep-card rt-rep-pad">
          <div className="text-[12px] font-medium text-[var(--text-2)]">Bought</div>
          <div className="text-[26px] font-extrabold text-[var(--text)] tracking-tight leading-tight tabular-nums mt-0.5">
            {rs(shownTotals.total)}
          </div>
          <div className="text-[11.5px] text-[var(--text-2)] mt-1 tabular-nums">
            Taxable {rs(shownTotals.net)} · GST {rs(shownTotals.tax)}
          </div>
          <div className="rt-kv-grid grid-cols-3">
            <div className="rt-kv">
              <div className="rt-kv__l">Cases</div>
              <div className="rt-kv__v text-[var(--text)]">{shownTotals.crates.toLocaleString('en-IN')}</div>
            </div>
            <div className="rt-kv">
              <div className="rt-kv__l">Taxable</div>
              <div className="rt-kv__v text-[var(--paid)]">{compactRs(shownTotals.net)}</div>
            </div>
            <div className="rt-kv">
              <div className="rt-kv__l">GST</div>
              <div className="rt-kv__v text-[var(--text)]">{compactRs(shownTotals.tax)}</div>
            </div>
          </div>
        </section>

        {/* Search bar */}
        <div className="rt-search-bar">
          <Search size={15} className="text-[var(--text-2)] shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier or invoice no…"
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

        {shownLines.length === 0 ? (
          <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
            {emptyText}
          </div>
        ) : viewMode === 'daywise' ? (
          <div className="space-y-2.5">
            {dayGroups.map((d) => {
              const open = isOpen(d.date) || dayGroups.length === 1;
              return (
                <section key={d.date} className="rt-rep-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleDay(d.date)}
                    aria-expanded={open}
                    className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-[#f8fafc]"
                  >
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-bold text-[var(--text)] truncate">{shortDate(d.date)}</div>
                      <div className="text-[11.5px] text-[var(--text-2)] mt-0.5">
                        {d.lines.length} consignment{d.lines.length === 1 ? '' : 's'} · {d.crates} cases
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums">{rs(d.total)}</div>
                        <div className="text-[11px] font-semibold text-[var(--paid)] tabular-nums">GST {compactRs(d.tax)}</div>
                      </div>
                      {dayGroups.length > 1 && (
                        open ? <ChevronUp size={15} className="text-[var(--text-2)]" /> : <ChevronDown size={15} className="text-[var(--text-2)]" />
                      )}
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-[var(--divider)] divide-y divide-[var(--divider)]">
                      {d.lines.map((l) => (
                        <PhoneGrnRow key={String(l.g.id)} line={l} dateText={shortDate(l.date)} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
            {shownLines.map((l) => (
              <PhoneGrnRow key={String(l.g.id)} line={l} dateText={shortDate(l.date)} />
            ))}
          </section>
        )}

        <button
          type="button"
          onClick={onNavigateInventory}
          className="w-full h-[46px] rounded-2xl border border-[var(--border)] bg-white text-[13.5px] font-bold text-[var(--text)] inline-flex items-center justify-center gap-2 cursor-pointer active:bg-[#f8fafc]"
        >
          Open Inward workspace <ArrowRight size={15} aria-hidden="true" />
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
const PhoneGrnRow: React.FC<{ line: GrnLine; dateText: string }> = ({ line, dateText }) => (
  <div className="px-3.5 py-3 flex items-center gap-3">
    <div className="w-9 h-9 rounded-full bg-[var(--paid-bg)] text-[var(--paid)] flex items-center justify-center shrink-0">
      <Truck size={16} />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug truncate">
        {line.invoiceNo || line.g.id} · {line.supplier}
      </div>
      <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 truncate">
        {dateText} · {line.crates} cases · {line.godown}
      </div>
    </div>
    <div className="text-right shrink-0">
      <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums">{rs(line.total)}</div>
      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--paid-bg)] text-[var(--paid)]">
        Received
      </span>
    </div>
  </div>
);
