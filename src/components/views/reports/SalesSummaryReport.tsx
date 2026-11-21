import React, { useCallback, useMemo, useState } from 'react';
import { Calendar, ChevronRight, Package, Search, Split, UserCheck, Users, X } from 'lucide-react';
import { Bill } from '../../../types';
import { useLedger } from '../../../context/LedgerContext';
import { money, resolveProductGstRate } from '../../../utils/billing';
import { billTaxBasis } from '../../../utils/billTaxBasis';
import { totalDueOf } from '../../../utils/dueSummary';
import {
  findMixedTaxBills,
  formatBillNumber,
  isGstExcludedBill,
  type MixedTaxBillInfo,
} from '../../../utils/invoiceCommon';
import { buildSalesSummary, type SalesGroupRow } from '../../../utils/salesSummary';
import { resolveTaxRegime, noOutputTax } from '../../../tax/appRegime';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { ConfirmModal } from '../../ui/ConfirmModal';
import { notify } from '../../../utils/toast';
import {
  ReportChipGroup,
  ReportEmpty,
  ReportList,
  ReportListMeta,
  ReportRow,
  ReportSearch,
  ReportStat,
  ReportStatGrid,
  ReportTitleBar,
  reportCard,
} from './ReportKit';
import { MobileReportTopBar } from './mobile/MobileReportContext';
import { PhoneDownloadBar } from './mobile/PhoneKit';

type BillKind = 'all' | 'gst' | 'non_gst';

const KINDS: { id: BillKind; label: string }[] = [
  { id: 'all', label: 'All sales' },
  { id: 'gst', label: 'GST invoices' },
  { id: 'non_gst', label: 'Non-GST memos' },
];

type GroupBy = 'day' | 'customer' | 'product' | 'salesman';

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'day', label: 'By day' },
  { id: 'customer', label: 'By customer' },
  { id: 'product', label: 'By product' },
  { id: 'salesman', label: 'By salesman' },
];

const rs = (n: number) => `₹${money(n)}`;

export interface SalesSummaryReportProps {
  /** Bills of the chosen period. */
  filteredBills: Bill[];
  periodLabel: string;
}

/**
 * Sales: how much was sold in the period, how much of it is paid and how much is still unpaid,
 * split by day, customer, product or salesman. One place for the sales figures.
 */
export const SalesSummaryReport: React.FC<SalesSummaryReportProps> = ({ filteredBills, periodLabel }) => {
  const { products, orgProfile, billingSettings, salesmen, existingCustomers, bills, splitMixedBill } = useLedger();
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [mobileSection, setMobileSection] = useState<'summary' | GroupBy | null>(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<BillKind>('all');
  const [splitTarget, setSplitTarget] = useState<MixedTaxBillInfo | null>(null);

  const productMap = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);

  // Same revenue / GST rule as the Profit & Loss (utils/billTaxBasis.ts).
  const taxBasisOf = useCallback(
    (b: Bill) => {
      const carve = !noOutputTax(resolveTaxRegime(orgProfile, String(b.date || '').slice(0, 10)));
      return billTaxBasis(b, {
        carveGstFromPrices: carve,
        rateFor: (item) => {
          const prod = productMap.get(item.productId);
          if (item.taxability === 'non_gst' || prod?.taxability === 'non_gst') return 0;
          return item.gst !== undefined && item.gst !== null
            ? (item.gst as number)
            : resolveProductGstRate(prod, item.category);
        },
      });
    },
    [orgProfile, productMap],
  );

  // GST invoices (INV-) and Non-GST cash memos (NG-) tracked separately; both are real sales in the books.
  const gstBills = useMemo(() => filteredBills.filter((b) => !isGstExcludedBill(b, products)), [filteredBills, products]);
  const nonGstBills = useMemo(() => filteredBills.filter((b) => isGstExcludedBill(b, products)), [filteredBills, products]);
  const mixedTaxInfo = useMemo(() => findMixedTaxBills(filteredBills, products), [filteredBills, products]);
  const gstSummary = useMemo(() => buildSalesSummary({ bills: gstBills, salesmen, taxBasisOf }), [gstBills, salesmen, taxBasisOf]);
  const nonGstSummary = useMemo(() => buildSalesSummary({ bills: nonGstBills, salesmen, taxBasisOf }), [nonGstBills, salesmen, taxBasisOf]);
  const shownBills = kind === 'gst' ? gstBills : kind === 'non_gst' ? nonGstBills : filteredBills;
  const kindLabel = KINDS.find((k) => k.id === kind)?.label || 'All sales';

  const summary = useMemo(
    () => buildSalesSummary({ bills: shownBills, salesmen, taxBasisOf }),
    [shownBills, salesmen, taxBasisOf],
  );
  const t = summary.totals;
  const allCustomersDue = useMemo(() => totalDueOf({ existingCustomers, bills }), [existingCustomers, bills]);

  const rowsAll: SalesGroupRow[] =
    groupBy === 'day' ? summary.byDay : groupBy === 'customer' ? summary.byCustomer : groupBy === 'product' ? summary.byProduct : summary.bySalesman;
  const q = search.trim().toLowerCase();
  const rows = q ? rowsAll.filter((r) => r.label.toLowerCase().includes(q)) : rowsAll;
  const showMoney = groupBy !== 'product'; // paid / unpaid belong to a bill, not to a product line

  const dayLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };

  const exportExcel = () =>
    downloadXlsx(`sales-${fileStamp()}.xlsx`, [
      {
        name: 'Summary',
        header: ['Item', 'Value'],
        rows: [
          ['Period', periodLabel],
          ['Bill type', kindLabel],
          ['GST invoices: net sales', gstSummary.totals.netSales],
          ['Non-GST memos: net sales', nonGstSummary.totals.netSales],
          ['Bills', t.bills],
          ['Billed (before returns)', t.billed],
          ['Discounts given', t.discounts],
          ['Sales returns', t.returns],
          ['Net sales (incl. GST)', t.netSales],
          ['GST included in sales', t.gst],
          ['Net sales before GST', t.beforeGst],
          ['Received on these bills', t.paid],
          ['Unpaid on these bills', t.unpaid],
          ['Cases delivered (incl. free)', t.cases],
        ],
      },
      ...(['day', 'customer', 'product', 'salesman'] as GroupBy[]).map((g) => {
        const list = g === 'day' ? summary.byDay : g === 'customer' ? summary.byCustomer : g === 'product' ? summary.byProduct : summary.bySalesman;
        return {
          name: g === 'day' ? 'By day' : g === 'customer' ? 'By customer' : g === 'product' ? 'By product' : 'By salesman',
          header: ['Name', 'Bills', 'Cases', 'Net sales', 'GST included', 'Received', 'Unpaid'],
          rows: list.map((r) => [r.label, r.bills, r.cases, r.netSales, r.gst, r.paid, r.unpaid]),
        };
      }),
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `sales-${fileStamp()}.pdf`,
      title: 'Sales',
      subtitle: [`Period: ${periodLabel}`, `Bill type: ${kindLabel}`],
      sections: [
        {
          title: 'Summary',
          header: ['Item', 'Amount (Rs.)'],
          rows: [
            ['Net sales (incl. GST)', money(t.netSales)],
            ['GST included', money(t.gst)],
            ['Net sales before GST', money(t.beforeGst)],
            ['Received on these bills', money(t.paid)],
            ['Unpaid on these bills', money(t.unpaid)],
          ],
          rightAlign: [1],
        },
        {
          title: GROUPS.find((g) => g.id === groupBy)?.label,
          header: ['Name', 'Bills', 'Cases', 'Net sales', 'Received', 'Unpaid'],
          rows: rows.map((r) => [r.label, r.bills, r.cases, money(r.netSales), showMoney ? money(r.paid) : '', showMoney ? money(r.unpaid) : '']),
          rightAlign: [1, 2, 3, 4, 5],
        },
      ],
    });

  const compactRs = (n: number): string => {
    const abs = Math.abs(n);
    const sign = n < 0 ? '−' : '';
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2).replace(/\.?0+$/, '')}L`;
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return `${sign}₹${money(abs)}`;
  };

  const initialsOf = (name: string) => {
    const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  const activeMobileGroup: GroupBy =
    mobileSection && mobileSection !== 'summary' ? mobileSection : groupBy;
  const mobileRowsAll: SalesGroupRow[] =
    activeMobileGroup === 'day'
      ? summary.byDay
      : activeMobileGroup === 'customer'
        ? summary.byCustomer
        : activeMobileGroup === 'product'
          ? summary.byProduct
          : summary.bySalesman;
  const mobileRows = q ? mobileRowsAll.filter((r) => r.label.toLowerCase().includes(q)) : mobileRowsAll;
  const mobileShowMoney = activeMobileGroup !== 'product';

  const sectionLabelMap: Record<'summary' | GroupBy, string> = {
    summary: 'Summary',
    day: 'By day',
    customer: 'By customer',
    product: 'By product',
    salesman: 'By salesman',
  };

  const shareProps = {
    reportTitle: mobileSection ? `Sales · ${sectionLabelMap[mobileSection]}` : 'Sales',
    summaryMetrics: [
      { label: 'Net sales', value: rs(t.netSales) },
      { label: 'Received', value: rs(t.paid) },
      { label: 'Unpaid', value: rs(t.unpaid) },
      { label: 'Bills', value: String(t.bills) },
    ],
    sheets: [
      {
        name: 'Summary',
        header: ['Item', 'Value'],
        rows: [
          ['Period', periodLabel],
          ['Bill type', kindLabel],
          ['Net sales (incl. GST)', t.netSales],
          ['Received', t.paid],
          ['Unpaid', t.unpaid],
        ],
      },
    ],
    pdfSections: [
      {
        title: sectionLabelMap[mobileSection || 'day'],
        header: ['Name', 'Bills', 'Cases', 'Net sales', 'Received', 'Unpaid'],
        rows: mobileRows.map((r) => [r.label, r.bills, r.cases, money(r.netSales), money(r.paid), money(r.unpaid)]),
        rightAlign: [1, 2, 3, 4, 5],
      },
    ],
  };

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-sales-phone">
        {mobileSection === null ? (
          <>
            <MobileReportTopBar
              title="Sales"
              sub="Sold, received and unpaid"
              showPeriod
              shareProps={shareProps}
            />

            {mixedTaxInfo.billCount > 0 && (
              <div className="rt-rep-card rt-rep-pad bg-[var(--soon-bg)] border-amber-200 space-y-2 text-[12px] text-amber-950">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Split size={14} className="shrink-0" />
                  <span>
                    {mixedTaxInfo.billCount} mixed GST + Non-GST invoice{mixedTaxInfo.billCount === 1 ? '' : 's'} ({rs(mixedTaxInfo.nonGstAmount)})
                  </span>
                </div>
                <div className="space-y-1.5">
                  {mixedTaxInfo.entries.map((entry) => {
                    const billNo = formatBillNumber(entry.bill, billingSettings);
                    return (
                      <div key={entry.bill.id} className="flex items-center justify-between gap-2 bg-white/80 rounded-lg px-2.5 py-1.5">
                        <div className="min-w-0 truncate">
                          <span className="font-bold">#{billNo}</span> · {entry.bill.retailer}
                        </div>
                        {entry.canAutoSplit && (
                          <button
                            type="button"
                            onClick={() => setSplitTarget(entry)}
                            className="shrink-0 px-2 py-1 rounded-md bg-amber-700 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Split
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5-Section Menu Card (Mockup 4 Screen 1) */}
            <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
              {([
                {
                  id: 'summary' as const,
                  title: 'Summary',
                  sub: 'All sales, GST and non-GST',
                  right: compactRs(t.netSales),
                  icon: <span className="font-extrabold text-[15px]">Σ</span>,
                },
                {
                  id: 'day' as const,
                  title: 'By day',
                  sub: 'Sales day by day',
                  right: `${summary.byDay.length} ${summary.byDay.length === 1 ? 'day' : 'days'}`,
                  icon: <Calendar size={17} />,
                },
                {
                  id: 'customer' as const,
                  title: 'By customer',
                  sub: 'Who bought the most',
                  right: String(summary.byCustomer.length),
                  icon: <Users size={17} />,
                },
                {
                  id: 'product' as const,
                  title: 'By product',
                  sub: 'Cases and value per product',
                  right: String(summary.byProduct.length),
                  icon: <Package size={17} />,
                },
                {
                  id: 'salesman' as const,
                  title: 'By salesman',
                  sub: 'Per salesman',
                  right: String(summary.bySalesman.length),
                  icon: <UserCheck size={17} />,
                },
              ]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSearch('');
                    if (item.id !== 'summary') setGroupBy(item.id);
                    setMobileSection(item.id);
                  }}
                  className="w-full text-left px-3.5 py-3 flex items-center gap-3 active:bg-[#f8fafc] transition-colors cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-[#f1f5f9] text-[var(--text-2)] flex items-center justify-center shrink-0">
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-[var(--text)] leading-snug">{item.title}</div>
                    <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 leading-snug">{item.sub}</div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums">
                      {item.right}
                    </span>
                    <ChevronRight size={14} className="text-[var(--text-2)]" />
                  </div>
                </button>
              ))}
            </section>
          </>
        ) : (
          <>
            <MobileReportTopBar
              title={sectionLabelMap[mobileSection]}
              doubleBack
              onBack={() => {
                setMobileSection(null);
                setSearch('');
              }}
              showPeriod
              shareProps={shareProps}
            />

            {/* Bill type chips */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {KINDS.map((opt) => {
                const active = kind === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setKind(opt.id)}
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

            {/* 3-Col Sold / Received / Unpaid Card */}
            <section className="rt-rep-card rt-rep-pad">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[11px] font-medium text-[var(--text-2)]">Sold</div>
                  <div className="text-[15px] font-extrabold text-[var(--text)] tabular-nums mt-0.5">
                    {compactRs(t.netSales)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-[var(--text-2)]">Received</div>
                  <div className="text-[15px] font-extrabold text-[var(--paid)] tabular-nums mt-0.5">
                    {compactRs(t.paid)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-[var(--text-2)]">Unpaid</div>
                  <div className={`text-[15px] font-extrabold tabular-nums mt-0.5 ${t.unpaid > 0.004 ? 'text-[var(--due)]' : 'text-[var(--text)]'}`}>
                    {compactRs(t.unpaid)}
                  </div>
                </div>
              </div>
            </section>

            {mobileSection === 'summary' ? (
              <div className="space-y-2.5">
                <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
                  {[
                    { title: 'GST invoices (INV-)', x: gstSummary.totals },
                    { title: 'Non-GST memos (NG-)', x: nonGstSummary.totals },
                  ].map((g) => (
                    <div key={g.title} className="px-3.5 py-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[13.5px] font-bold text-[var(--text)]">{g.title}</div>
                        <div className="text-[11.5px] text-[var(--text-2)] mt-0.5">
                          {g.x.bills} bill{g.x.bills === 1 ? '' : 's'} · GST {rs(g.x.gst)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[14px] font-extrabold text-[var(--text)] tabular-nums">{rs(g.x.netSales)}</div>
                        <div className="text-[11px] text-[var(--text-2)] tabular-nums">
                          unpaid {rs(g.x.unpaid)}
                        </div>
                      </div>
                    </div>
                  ))}
                </section>

                <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
                  {[
                    ['Billed (before returns)', rs(t.billed)],
                    ['Discounts inside price', `− ${rs(t.discounts)}`],
                    ['Sales returns', `− ${rs(t.returns)}`],
                    ['Net sales (incl. GST)', rs(t.netSales)],
                    ['Sales before GST', rs(t.beforeGst)],
                    ['GST included in sales', rs(t.gst)],
                    ['Received on these bills', rs(t.paid)],
                    ['Unpaid on these bills', rs(t.unpaid)],
                    ['All customers owe today', rs(allCustomersDue)],
                  ].map(([k, v]) => (
                    <div key={k} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-[var(--text-2)] font-medium">{k}</span>
                      <span className="font-bold text-[var(--text)] tabular-nums">{v}</span>
                    </div>
                  ))}
                </section>
              </div>
            ) : (
              <>
                {mobileSection !== 'day' && (
                  <div className="rt-search-bar">
                    <Search size={16} className="text-[var(--text-2)] shrink-0" />
                    <input
                      type="text"
                      enterKeyHint="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={`Search ${mobileSection}…`}
                    />
                    {search && (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => setSearch('')}
                        className="text-[var(--text-2)] p-0.5 cursor-pointer shrink-0"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                )}

                {mobileRows.length === 0 ? (
                  <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
                    No sales in this period.
                  </div>
                ) : (
                  <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
                    {mobileRows.map((r) => (
                      <div key={r.key} className="px-3.5 py-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#eaf3fd] text-[var(--primary)] font-extrabold text-[12px] flex items-center justify-center shrink-0">
                          {mobileSection === 'day' ? (
                            <Calendar size={16} />
                          ) : mobileSection === 'product' ? (
                            <Package size={16} />
                          ) : (
                            initialsOf(r.label)
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug break-words">
                            {mobileSection === 'day' ? dayLabel(r.label) : r.label}
                          </div>
                          <div className="text-[11.5px] text-[var(--text-2)] mt-0.5">
                            {r.bills} bill{r.bills === 1 ? '' : 's'} · {r.cases} case{r.cases === 1 ? '' : 's'}
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex flex-col items-end">
                          <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums leading-tight">
                            {rs(r.netSales)}
                          </div>
                          {mobileShowMoney &&
                            (r.unpaid > 0.004 ? (
                              <div className="text-[11px] font-bold text-[var(--due)] tabular-nums mt-0.5 leading-tight">
                                unpaid {rs(r.unpaid)}
                              </div>
                            ) : (
                              <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--paid-bg)] text-[var(--paid)] text-[10px] font-bold leading-tight">
                                Paid
                              </span>
                            ))}
                        </div>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}

            <PhoneDownloadBar onExcel={exportExcel} onPdf={exportPdf} disabled={t.bills === 0} />
          </>
        )}
      </div>

      {/* ======================= TABLET / DESKTOP ======================= */}
      <div className="hidden md:block space-y-3" id="report-sales">
      <ReportTitleBar
        title="Sales"
        sub={`${periodLabel} · ${kindLabel} · ${t.bills} bill${t.bills === 1 ? '' : 's'}`}
        actions={<ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} reportTitle="Sales" disabled={t.bills === 0} />}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {([
          ['GST invoices (INV-)', gstSummary.totals, false],
          ['Non-GST memos (NG-)', nonGstSummary.totals, true],
        ] as const).map(([title, x, isNonGstCard]) => (
          <div key={title} className={`${reportCard} px-3.5 py-2.5 text-xs text-slate-600`}>
            <div className="font-bold text-slate-800 text-sm">{title}</div>
            <div>{x.bills} bill{x.bills === 1 ? '' : 's'} · net sales {rs(x.netSales)}</div>
            <div>GST in it {rs(x.gst)} · received {rs(x.paid)} · unpaid {rs(x.unpaid)}</div>
            {isNonGstCard && mixedTaxInfo.billCount > 0 && (
              <div className="mt-1 font-semibold text-amber-800">
                + {rs(mixedTaxInfo.nonGstAmount)} of Non-GST items inside {mixedTaxInfo.billCount} mixed GST invoice{mixedTaxInfo.billCount === 1 ? '' : 's'}
              </div>
            )}
          </div>
        ))}
      </div>

      {mixedTaxInfo.billCount > 0 && (
        <div
          id="report-sales-mixed-tax-banner"
          className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-xs text-amber-950 space-y-2"
        >
          <div className="font-bold text-amber-900 flex items-center gap-1.5">
            <Split className="w-3.5 h-3.5 shrink-0" />
            <span>
              {mixedTaxInfo.billCount === 1
                ? '1 GST invoice also contains Non-GST items'
                : `${mixedTaxInfo.billCount} GST invoices also contain Non-GST items`}
              {' '}({rs(mixedTaxInfo.nonGstAmount)})
            </span>
          </div>
          <p className="text-amber-900/90 leading-relaxed">
            Because GST and Non-GST products are mixed on the same invoice, the entire bill is counted under{' '}
            <strong>GST invoices (INV-)</strong> instead of <strong>Non-GST memos (NG-)</strong>. Split below to move the Non-GST items into a linked{' '}
            <strong>NG-</strong> cash memo without changing stock, trip loads, or payments.
          </p>
          <div className="space-y-1.5 pt-0.5">
            {mixedTaxInfo.entries.map((entry) => {
              const billNo = formatBillNumber(entry.bill, billingSettings);
              return (
                <div
                  key={entry.bill.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white/80 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900">#{billNo}</span>
                    <span className="text-slate-600">
                      {' '}· {entry.bill.retailer} · {entry.nonGstProductNames.join(', ')} ({rs(entry.nonGstAmount)})
                    </span>
                  </div>
                  {entry.canAutoSplit ? (
                    <button
                      type="button"
                      onClick={() => setSplitTarget(entry)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs cursor-pointer shrink-0"
                      id={`split-mixed-bill-btn-${entry.bill.id}`}
                    >
                      <Split className="w-3 h-3" />
                      <span>Split #{billNo} into INV + NG-</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold text-amber-800">
                      Has sales returns (cannot auto-split)
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ReportChipGroup<BillKind> label="Bill type" options={KINDS} value={kind} onChange={setKind} />

      <ReportStatGrid>
        <ReportStat
          label="Net sales"
          value={rs(t.netSales)}
          sub={t.returns > 0.004 ? `after ${rs(t.returns)} returns · GST included` : 'GST included'}
        />
        <ReportStat label="Sales before GST" value={rs(t.beforeGst)} sub={`GST in sales ${rs(t.gst)}`} />
        <ReportStat label="Received on these bills" value={rs(t.paid)} tone="green" sub={t.netSales > 0 ? `${Math.round((t.paid / t.netSales) * 100)}% of sales` : undefined} />
        <ReportStat label="Unpaid on these bills" value={rs(t.unpaid)} tone={t.unpaid > 0.004 ? 'red' : 'ink'} sub={`All customers owe ${rs(allCustomersDue)} today`} />
      </ReportStatGrid>

      <div className={`${reportCard} px-3.5 py-2.5 text-xs text-slate-600 space-y-0.5`}>
        <div>
          Billed {rs(t.billed)} − discounts {rs(t.discounts)} already inside the price − returns {rs(t.returns)} = net sales {rs(t.netSales)}.
        </div>
        <div>
          “Unpaid on these bills” is only for the bills of this period. “Total due” on Party credit also includes older bills and opening balances.
        </div>
      </div>

      <ReportChipGroup<GroupBy> label="View" options={GROUPS} value={groupBy} onChange={(v) => { setGroupBy(v); setSearch(''); }} />
      {groupBy !== 'day' && <ReportSearch value={search} onChange={setSearch} placeholder={`Search ${groupBy}…`} />}

      {rows.length === 0 ? (
        <ReportEmpty>No sales in this period.</ReportEmpty>
      ) : (
        <>
          <ReportListMeta>{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</ReportListMeta>
          <section className={`${reportCard} overflow-hidden`}>
            <ReportList>
              {rows.map((r) => (
                <ReportRow
                  key={r.key}
                  title={groupBy === 'day' ? dayLabel(r.label) : r.label}
                  sub={`${r.bills} bill${r.bills === 1 ? '' : 's'} · ${r.cases} case${r.cases === 1 ? '' : 's'}${showMoney ? ` · received ${rs(r.paid)}` : ''}`}
                  amount={rs(r.netSales)}
                  status={showMoney ? (r.unpaid > 0.004 ? `Unpaid ${rs(r.unpaid)}` : 'Paid in full') : undefined}
                  statusTone={showMoney ? (r.unpaid > 0.004 ? 'red' : 'green') : 'muted'}
                />
              ))}
            </ReportList>
          </section>
        </>
      )}
      </div>

      {splitTarget && (() => {
        const billNo = formatBillNumber(splitTarget.bill, billingSettings);
        const gstPart = Math.max(0, Math.round(((Number(splitTarget.bill.total) || 0) - splitTarget.nonGstAmount) * 100) / 100);
        return (
          <ConfirmModal
            isOpen
            title={`Split #${billNo} into INV + NG- Cash Memo?`}
            subtitle={`Moves ${splitTarget.nonGstProductNames.join(', ')} onto a linked Non-GST memo (NG-) so Reports > Sales and GST returns stay separated.`}
            variant="primary"
            confirmIcon={<Split className="w-3.5 h-3.5" />}
            confirmButtonLabel="Split into INV + NG- Memo"
            impactItems={[
              {
                label: `#${billNo} keeps GST items only`,
                detail: splitTarget.bill.retailer,
                qtyChange: rs(gstPart),
              },
              {
                label: 'New linked Non-GST Cash Memo (NG-)',
                detail: splitTarget.nonGstProductNames.join(', '),
                qtyChange: rs(splitTarget.nonGstAmount),
              },
              {
                label: 'Stock, trip load & total payments unchanged',
                detail: `Total received ${rs(splitTarget.bill.amountPaid || 0)} is allocated across the two bills with zero double-counting.`,
              },
            ]}
            onConfirm={() => {
              const target = splitTarget;
              setSplitTarget(null);
              const res = splitMixedBill(target.bill.id, {
                comment: 'Split Non-GST items into separate NG- Cash Memo from Sales report',
              });
              if (res) {
                notify(
                  `Split complete: #${formatBillNumber(res.gstBill, billingSettings)} (${rs(res.gstBill.total)}) + #${formatBillNumber(res.nonGstBill, billingSettings)} (${rs(res.nonGstBill.total)}).`,
                  'success',
                );
              }
            }}
            onClose={() => setSplitTarget(null)}
          />
        );
      })()}
    </>
  );
};
