import React, { useMemo } from 'react';
import {
  ChevronRight,
  Coins,
  Globe,
  Hourglass,
  ShoppingCart,
  LineChart,
  Receipt,
  Package,
  Truck,
  Undo2,
  FileSpreadsheet,
} from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { money } from '../../../utils/billing';
import { billNetTotal, round2 } from '../../../utils/salesReturns';
import { summarizeCollections } from '../../../utils/collectionSummary';
import { REPORT_GROUPS } from './ReportNavMenu';
import { useSalesMarginPnl } from './SalesMarginPnLReport';
import { totalDueOf } from '../../../utils/dueSummary';
import { MobileReportTopBar, useMobileReport } from './mobile/MobileReportContext';

interface ReportsMobileHomeProps {
  onSelectReport: (reportId: string) => void;
  inPeriod?: (dateStr: string) => boolean;
  periodLabel?: string;
}

const rs = (n: number): string =>
  `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

const GROUP_DISPLAY_NAME: Record<string, string> = {
  money_in: 'MONEY IN',
  who_owes_me: 'WHO OWES ME',
  what_sells: 'WHAT SELLS',
  stock_buying: 'STOCK AND BUYING',
  trips_tax: 'TRIPS AND TAX',
};

const ROW_SUBTITLE_OVERRIDE: Record<string, string> = {
  daybook: 'Money in and out each day, and from each customer',
  sales: 'Sold, received and unpaid',
};

const getCircleBadgeStyle = (id: string) => {
  switch (id) {
    case 'daybook':
      return { bg: 'bg-[#fef7e0] text-[#b45309]', Icon: Coins };
    case 'beats':
      return { bg: 'bg-[#eef4fc] text-[#1e3a8a]', Icon: Globe };
    case 'receivables':
      return { bg: 'bg-[#fef7e0] text-[#b45309]', Icon: Hourglass };
    case 'sales':
      return { bg: 'bg-[#f1f5f9] text-[#334155]', Icon: ShoppingCart };
    case 'margin':
      return { bg: 'bg-[#fef2f2] text-[#0071dc]', Icon: LineChart };
    case 'expenses':
      return { bg: 'bg-[#f1f5f9] text-[#334155]', Icon: Receipt };
    case 'inventory':
      return { bg: 'bg-[#fef7e0] text-[#92400e]', Icon: Package };
    case 'purchases':
      return { bg: 'bg-[#eef7ea] text-[#2a8703]', Icon: Truck };
    case 'dispositions':
      return { bg: 'bg-[#0071dc] text-white', Icon: Undo2 };
    case 'trips':
      return { bg: 'bg-[#fdeeee] text-[#de1c24]', Icon: Truck };
    case 'tax':
      return { bg: 'bg-[#f1f5f9] text-[#334155]', Icon: FileSpreadsheet };
    default:
      return { bg: 'bg-[#f1f5f9] text-[#334155]', Icon: FileSpreadsheet };
  }
};

export const ReportsMobileHome: React.FC<ReportsMobileHomeProps> = ({
  onSelectReport,
  inPeriod,
  periodLabel: propPeriodLabel,
}) => {
  const { bills, payments, products, expenses, existingCustomers } = useLedger();
  const mobileCtx = useMobileReport();

  const matchesPeriod = useMemo(
    () => inPeriod || (() => true),
    [inPeriod],
  );

  const shortPeriodText = useMemo(() => {
    const p = mobileCtx?.period || 'thisMonth';
    if (p === 'today') return 'Today';
    if (p === 'yesterday') return 'Yesterday';
    if (p === 'last7') return '7 days';
    if (p === 'thisMonth') return 'This month';
    if (p === 'lastMonth') return 'Last month';
    if (p === 'all') return 'All time';
    return mobileCtx?.shortPeriodLabel || propPeriodLabel || 'This month';
  }, [mobileCtx?.period, mobileCtx?.shortPeriodLabel, propPeriodLabel]);

  // 1. Received in selected period (same shared calculation as Home & Daily Collection)
  const receivedInPeriod = useMemo(
    () => summarizeCollections({ bills, payments, inPeriod: matchesPeriod }).total,
    [bills, payments, matchesPeriod],
  );

  // 2. Total Due across all bills/customers
  const totalDue = useMemo(() => totalDueOf({ existingCustomers, bills }), [existingCustomers, bills]);

  // 3. Sales & Net Profit using the shared P&L engine
  const periodBills = useMemo(
    () =>
      (bills || []).filter(
        (b) => b.status !== 'cancelled' && !b.cancelled && matchesPeriod(String(b.date || '').slice(0, 10)),
      ),
    [bills, matchesPeriod],
  );
  const { pnl: periodPnl } = useSalesMarginPnl({
    filteredBills: periodBills,
    products: products || [],
    dateInPeriod: matchesPeriod,
    viewBasis: 'exGst',
  });
  const salesInPeriod = useMemo(() => {
    let billedRev = 0;
    periodBills.forEach((b) => {
      billedRev += billNetTotal(b);
    });
    return round2(billedRev);
  }, [periodBills]);

  const expensesInPeriod = useMemo(() => {
    return (expenses || [])
      .filter((e) => matchesPeriod(String(e.date || '').slice(0, 10)))
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  }, [expenses, matchesPeriod]);

  const netProfitInPeriod = useMemo(
    () => round2(periodPnl.operatingGrossProfit - expensesInPeriod),
    [periodPnl.operatingGrossProfit, expensesInPeriod],
  );

  return (
    <div className="space-y-3" id="reports-mobile-home-screen">
      {/* Top Blue Bar: Reports | [Month ▾] [Share] */}
      <MobileReportTopBar
        title="Reports"
        hideBack
        showPeriod
        shareProps={{
          reportTitle: 'Reports Summary',
          filenamePrefix: 'reports-summary',
          summaryMetrics: [
            { label: `Received - ${shortPeriodText}`, value: `₹${money(receivedInPeriod)}` },
            { label: `Sales - ${shortPeriodText}`, value: `₹${money(salesInPeriod)}` },
            { label: 'Net profit', value: `₹${money(netProfitInPeriod)}` },
            { label: 'Total due', value: `₹${money(totalDue)}` },
          ],
          sheets: [
            {
              name: 'Summary KPIs',
              header: ['Metric', 'Period', 'Amount (Rs)'],
              rows: [
                [`Received`, shortPeriodText, receivedInPeriod],
                [`Sales`, shortPeriodText, salesInPeriod],
                ['Net profit', shortPeriodText, netProfitInPeriod],
                ['Total due', 'All time', totalDue],
              ],
            },
          ],
          pdfSections: [
            {
              title: `Business Summary (${shortPeriodText})`,
              header: ['Key Performance Indicator', 'Period', 'Amount (Rs.)'],
              rows: [
                ['Received', shortPeriodText, money(receivedInPeriod)],
                ['Sales', shortPeriodText, money(salesInPeriod)],
                ['Net profit', shortPeriodText, money(netProfitInPeriod)],
                ['Total due', 'All time', money(totalDue)],
              ],
              rightAlign: [2],
            },
          ],
        }}
      />

      {/* 2x2 White KPI Grid */}
      <div className="rt-kv-grid">
        <button
          type="button"
          onClick={() => onSelectReport('daybook')}
          className="rt-kv text-left cursor-pointer active:scale-[0.99] transition-transform"
        >
          <div className="rt-kv__label truncate">Received - {shortPeriodText}</div>
          <div className="rt-kv__val">{rs(receivedInPeriod)}</div>
        </button>

        <button
          type="button"
          onClick={() => onSelectReport('sales')}
          className="rt-kv text-left cursor-pointer active:scale-[0.99] transition-transform"
        >
          <div className="rt-kv__label truncate">Sales - {shortPeriodText}</div>
          <div className="rt-kv__val">{rs(salesInPeriod)}</div>
        </button>

        <button
          type="button"
          onClick={() => onSelectReport('margin')}
          className="rt-kv text-left cursor-pointer active:scale-[0.99] transition-transform"
        >
          <div className="rt-kv__label truncate">Net profit</div>
          <div
            className="rt-kv__val"
            style={{ color: netProfitInPeriod >= 0 ? 'var(--paid)' : 'var(--due)' }}
          >
            {netProfitInPeriod < 0 ? `−${rs(Math.abs(netProfitInPeriod))}` : rs(netProfitInPeriod)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelectReport('receivables')}
          className="rt-kv text-left cursor-pointer active:scale-[0.99] transition-transform"
        >
          <div className="rt-kv__label truncate">Total due</div>
          <div className="rt-kv__val" style={{ color: 'var(--due)' }}>
            {rs(totalDue)}
          </div>
        </button>
      </div>

      {/* Single Grouped White Card containing 5 Sections & 11 Reports */}
      <div className="rt-rep-card divide-y divide-[var(--divider)]">
        {REPORT_GROUPS.map((group) => (
          <div key={group.id}>
            <div className="px-3.5 pt-3 pb-1 text-[10.5px] font-extrabold tracking-[0.06em] text-[var(--text-2)] uppercase">
              {GROUP_DISPLAY_NAME[group.id] || group.name}
            </div>
            <div className="divide-y divide-[var(--divider)]">
              {group.items.map((item) => {
                const { bg, Icon } = getCircleBadgeStyle(item.id);
                const subtitle = ROW_SUBTITLE_OVERRIDE[item.id] || item.subtitle;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectReport(item.id)}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left bg-[var(--surface)] active:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`size-9 rounded-full shrink-0 flex items-center justify-center ${bg}`}
                        aria-hidden="true"
                      >
                        <Icon size={17} strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] font-bold text-[var(--text)] leading-snug break-words">
                          {item.title}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-2)] leading-snug break-words mt-0.5">
                          {subtitle}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-400 shrink-0" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
