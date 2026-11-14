import React, { useMemo, useState, useCallback } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Calendar,
  Share2
} from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { money } from '../../../utils/billing';
import { billBalance, billNetTotal, round2 } from '../../../utils/salesReturns';
import { isAdvanceAdjustmentRow } from '../../../utils/paymentAllocation';
import { todayISO, toLocalISODate } from '../../../utils/dateLocal';
import { PaymentRecord } from '../../../types';
import { REPORT_GROUPS, getReportNavIcon } from './ReportNavMenu';
import { ReportShareMenu } from './ReportShareMenu';
import { useSalesMarginPnl } from './SalesMarginPnLReport';
import { totalDueOf } from '../../../utils/dueSummary';

interface ReportsMobileHomeProps {
  onSelectReport: (reportId: string) => void;
}

/** Formatter for large rounded numbers without decimals like ₹2,82,540 */
const rs = (n: number): string =>
  `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

/** 3-bar icon matching the navy header in the mock */
const BarChartThreeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white shrink-0">
    <rect x="3" y="11" width="4" height="10" rx="1.5" fill="white" />
    <rect x="10" y="6" width="4" height="15" rx="1.5" fill="white" />
    <rect x="17" y="2" width="4" height="19" rx="1.5" fill="white" />
  </svg>
);

export const ReportsMobileHome: React.FC<ReportsMobileHomeProps> = ({
  onSelectReport,
}) => {
  const { bills, payments, products, expenses, existingCustomers } = useLedger();
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<
    'today' | 'yesterday' | '7days' | 'month' | 'all'
  >('month');

  const todayStr = useMemo(() => todayISO(), []);
  const currentYearMonth = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);

  const sevenDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalISODate(d);
  }, []);

  // Filter matcher
  const matchesPeriod = useCallback((dateStr: string) => {
    const d = (dateStr || '').slice(0, 10);
    if (!d) return false;
    if (selectedPeriod === 'all') return true;
    if (selectedPeriod === 'today') return d === todayStr;
    if (selectedPeriod === 'yesterday') return d === yesterdayStr;
    if (selectedPeriod === '7days') return d >= sevenDaysAgoStr && d <= todayStr;
    if (selectedPeriod === 'month') return d.startsWith(currentYearMonth);
    return true;
  }, [selectedPeriod, todayStr, yesterdayStr, sevenDaysAgoStr, currentYearMonth]);

  // Dynamic card labels based on selected period
  const cardLabels = useMemo(() => {
    switch (selectedPeriod) {
      case 'today':
        return {
          received: 'Received - Today',
          sales: 'Sales - Today',
          profit: 'Net Profit - Today',
        };
      case 'yesterday':
        return {
          received: 'Received - Yesterday',
          sales: 'Sales - Yesterday',
          profit: 'Net Profit - Yesterday',
        };
      case '7days':
        return {
          received: 'Received - 7 Days',
          sales: 'Sales - 7 Days',
          profit: 'Net Profit - 7 Days',
        };
      case 'month':
        return {
          received: 'Received - This Month',
          sales: 'Sales - This Month',
          profit: 'Net Profit - This Month',
        };
      case 'all':
      default:
        return {
          received: 'Received - All Time',
          sales: 'Sales - All Time',
          profit: 'Net Profit - All Time',
        };
    }
  }, [selectedPeriod]);

  // 1. REAL METRIC: Received in selected period
  const receivedInPeriod = useMemo(() => {
    let sum = 0;
    const liveBills = (bills || []).filter((b) => b.status !== 'cancelled' && !b.cancelled);
    const billPaymentsMap = new Map<number, PaymentRecord[]>();
    (payments || []).forEach((p) => {
      if (!p.billId || p.isRefund) return;
      const list = billPaymentsMap.get(p.billId) || [];
      list.push(p);
      billPaymentsMap.set(p.billId, list);
    });

    // Upfront paid on bills within period
    liveBills.forEach((b) => {
      const bDate = String(b.date || '').slice(0, 10);
      if (!matchesPeriod(bDate)) return;
      const net = billNetTotal(b);
      const rows = billPaymentsMap.get(b.id) || [];
      if (rows.length === 0) {
        if (b.paymentMode !== 'credit') {
          sum += Math.min(net, Number(b.amountPaid) || 0);
        }
      } else {
        rows
          .filter((p) => matchesPeriod(String(p.paymentDate || p.createdAt || '').slice(0, 10)) && p.mode !== 'credit')
          .forEach((p) => {
            if (!isAdvanceAdjustmentRow(p)) {
              sum += Number(p.amount) || 0;
            }
          });
      }
    });

    // Later collections received in period
    (payments || []).forEach((p) => {
      const pDate = String(p.paymentDate || p.createdAt || '').slice(0, 10);
      if (!matchesPeriod(pDate) || p.mode === 'credit' || p.isRefund) return;
      const b = p.billId ? liveBills.find((bill) => bill.id === p.billId) : undefined;
      const bDate = b ? String(b.date || '').slice(0, 10) : '';
      if (b && pDate <= bDate) return;
      sum += Number(p.amount) || 0;
    });

    return round2(sum);
  }, [bills, payments, matchesPeriod]);

  // 2. Collection breakdown (Cash vs UPI) for the selected period (for Daily Collection hero)
  const collectionTotals = useMemo(() => {
    let grossCollected = 0;
    let cashIn = 0;
    let digitalIn = 0;
    let chequeIn = 0;

    const liveBills = (bills || []).filter((b) => b.status !== 'cancelled' && !b.cancelled);
    const billPaymentsMap = new Map<number, PaymentRecord[]>();
    (payments || []).forEach((p) => {
      if (!p.billId || p.isRefund) return;
      const list = billPaymentsMap.get(p.billId) || [];
      list.push(p);
      billPaymentsMap.set(p.billId, list);
    });

    liveBills.forEach((b) => {
      const bDate = String(b.date || '').slice(0, 10);
      if (!matchesPeriod(bDate)) return;

      const net = billNetTotal(b);
      const rows = billPaymentsMap.get(b.id) || [];
      const sameDayRows = rows.filter(
        (p) => String(p.paymentDate || '').slice(0, 10) <= bDate && p.mode !== 'credit'
      );

      let paid = 0;
      let billCash = 0;
      let billDigital = 0;
      let billCheque = 0;

      if (rows.length === 0) {
        paid = Math.min(net, Number(b.amountPaid) || 0);
        const m = b.paymentMode || 'cash';
        if (m === 'cash') billCash = paid;
        else if (m === 'cheque') billCheque = paid;
        else billDigital = paid;
      } else {
        sameDayRows.forEach((p) => {
          const a = Number(p.amount) || 0;
          paid += a;
          if (isAdvanceAdjustmentRow(p)) return;
          if (p.mode === 'cash') billCash += a;
          else if (p.mode === 'cheque') billCheque += a;
          else billDigital += a;
        });
      }

      cashIn += billCash;
      digitalIn += billDigital;
      chequeIn += billCheque;
      grossCollected += (billCash + billDigital + billCheque);
    });

    (payments || []).forEach((p) => {
      const pDate = String(p.paymentDate || p.createdAt || '').slice(0, 10);
      if (!matchesPeriod(pDate) || p.mode === 'credit' || p.isRefund) return;

      const amt = Number(p.amount) || 0;
      if (amt === 0) return;

      const b = p.billId ? liveBills.find((bill) => bill.id === p.billId) : undefined;
      const bDate = b ? String(b.date || '').slice(0, 10) : '';
      if (b && pDate <= bDate) return;

      if (p.mode === 'cash') cashIn += amt;
      else if (p.mode === 'cheque') chequeIn += amt;
      else digitalIn += amt;
      grossCollected += amt;
    });

    return {
      grossCollected: round2(grossCollected),
      cashIn: round2(cashIn),
      digitalIn: round2(digitalIn),
      chequeIn: round2(chequeIn),
    };
  }, [bills, payments, matchesPeriod]);

  // 3. REAL METRIC: Total Due across all bills
  const totalDue = useMemo(() => totalDueOf({ existingCustomers, bills }), [existingCustomers, bills]);

  // 4. REAL METRICS: Non-GST Retail Sales & Feasible Net Profit in selected period
  // Profit comes from the SAME engine as Reports > Profit & Loss (batch cost incl. inward freight, returns,
  // stock write-offs, supplier scheme credits), so Home, Overview and the P&L report always show one number.
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
  const { salesInPeriod, grossProfitInPeriod, landedCostInPeriod } = useMemo(() => {
    let billedRev = 0;
    periodBills.forEach((b) => {
      billedRev += billNetTotal(b);
    });
    return {
      salesInPeriod: round2(billedRev),
      grossProfitInPeriod: round2(periodPnl.operatingGrossProfit),
      landedCostInPeriod: round2(periodPnl.cogs),
    };
  }, [periodBills, periodPnl]);

  // Expenses in selected period (fuel, salary, rent, driver pay, maintenance)
  const expensesInPeriod = useMemo(() => {
    return (expenses || [])
      .filter((e) => matchesPeriod(String(e.date || '').slice(0, 10)))
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  }, [expenses, matchesPeriod]);

  // True Feasible Net Profit in period (Gross Profit minus operating expenses)
  const netProfitInPeriod = useMemo(() => {
    return round2(grossProfitInPeriod - expensesInPeriod);
  }, [grossProfitInPeriod, expensesInPeriod]);

  const periodOptions: { id: typeof selectedPeriod; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7days', label: '7 days' },
    { id: 'month', label: 'Month' },
    { id: 'all', label: 'All time' },
  ];

  const currentPeriodLabel = periodOptions.find((o) => o.id === selectedPeriod)?.label || 'Month';

  return (
    <div className="md:hidden min-h-screen bg-gradient-to-b from-[#EBF2FE] via-[#F3F6FD] to-[#F8FAFC] px-4 pt-4 pb-24 space-y-4 text-slate-900 selection:bg-blue-600 selection:text-white" id="reports-mobile-home-screen">
      
      {/* ========================================================== */}
      {/* 1. DARK BLUE HERO CARD: Reports / Daily Collection         */}
      {/* ========================================================== */}
      <div className="relative rounded-3xl bg-gradient-to-br from-[#0B1E48] via-[#08183A] to-[#040E24] p-5 text-white shadow-xl shadow-blue-950/20 z-10">
        
        {/* Top Header Row: Reports Title + Month Pill + Share Pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChartThreeIcon />
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Reports
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Period Selector Dropdown Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPeriodDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Calendar size={13} className="text-white/80" />
                <span>{currentPeriodLabel}</span>
                <ChevronDown
                  size={13}
                  className={`text-white/80 transition-transform ${periodDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {periodDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setPeriodDropdownOpen(false)}
                    aria-hidden
                  />
                  <div className="absolute right-0 mt-2 w-36 rounded-2xl border border-slate-200 bg-white py-1.5 shadow-2xl z-50 text-xs">
                    {periodOptions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPeriod(p.id);
                          setPeriodDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2 font-bold hover:bg-slate-50 cursor-pointer transition-colors ${
                          selectedPeriod === p.id ? 'text-blue-600 bg-blue-50/80' : 'text-slate-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Share Menu Pill */}
            <ReportShareMenu
              reportTitle="Reports Summary"
              periodLabel={currentPeriodLabel}
              orgName="Hydrate Hub"
              align="right"
              triggerClassName="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              iconClassName="text-white w-3.5 h-3.5"
              summaryMetrics={[
                { label: 'Daily Collection', value: rs(collectionTotals.grossCollected) },
                { label: cardLabels.received, value: `₹${money(receivedInPeriod)}` },
                { label: 'Total Due', value: `₹${money(totalDue)}` },
                { label: cardLabels.sales, value: `₹${money(salesInPeriod)}` },
                { label: cardLabels.profit, value: `₹${money(netProfitInPeriod)}` },
              ]}
              sheets={[
                {
                  name: 'Summary KPIs',
                  header: ['Metric', 'Period', 'Amount (Rs)'],
                  rows: [
                    ['Daily Collection', currentPeriodLabel, collectionTotals.grossCollected],
                    [cardLabels.received, currentPeriodLabel, receivedInPeriod],
                    ['Total Due Outstanding', 'All time', totalDue],
                    [cardLabels.sales, currentPeriodLabel, salesInPeriod],
                    [cardLabels.profit, currentPeriodLabel, netProfitInPeriod],
                  ],
                },
              ]}
              pdfSections={[
                {
                  title: `Business Summary (${currentPeriodLabel})`,
                  header: ['Key Performance Indicator', 'Period', 'Amount (Rs.)'],
                  rows: [
                    ['Daily Collection', currentPeriodLabel, rs(collectionTotals.grossCollected)],
                    [cardLabels.received, currentPeriodLabel, money(receivedInPeriod)],
                    ['Total Due Outstanding', 'All time', money(totalDue)],
                    [cardLabels.sales, currentPeriodLabel, money(salesInPeriod)],
                    [cardLabels.profit, currentPeriodLabel, money(netProfitInPeriod)],
                  ],
                  rightAlign: [2],
                },
              ]}
            />
          </div>
        </div>

        {/* Hero Body: Daily Collection Subtitle, Large Amount & Ascending Bar Chart Graphic */}
        <div 
          onClick={() => onSelectReport('daybook')}
          className="cursor-pointer group block mt-3"
          title="Tap to open Daily Collection report"
        >
          <div className="text-white/80 font-medium text-xs sm:text-sm">
            Daily Collection
          </div>

          <div className="flex items-end justify-between gap-3 mt-1">
            <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-none font-sans tabular-nums group-hover:text-blue-100 transition-colors">
              {rs(collectionTotals.grossCollected)}
            </div>

            {/* Ascending bar chart graphic matching mock */}
            <div className="flex items-end gap-1.5 h-12 pb-0.5 opacity-80 shrink-0 self-end mr-1">
              <div className="w-2.5 h-3 bg-blue-500/30 rounded-t-sm" />
              <div className="w-2.5 h-5 bg-blue-500/40 rounded-t-sm" />
              <div className="w-2.5 h-7.5 bg-blue-500/55 rounded-t-sm" />
              <div className="w-2.5 h-10 bg-blue-400/70 rounded-t-sm" />
              <div className="w-2.5 h-12 bg-blue-400 rounded-t-sm shadow-xs shadow-blue-400/50" />
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="w-full h-px bg-white/10 my-3" />

        {/* Bottom Legend: Cash & UPI breakdown */}
        <div className="flex items-center gap-3 text-xs font-semibold text-white/95">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0" />
            <span>Cash {rs(collectionTotals.cashIn)}</span>
          </div>

          <span className="text-white/30 font-normal">|</span>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00E5FF] shrink-0" />
            <span>UPI {rs(collectionTotals.digitalIn)}</span>
          </div>

          {collectionTotals.chequeIn > 0 && (
            <>
              <span className="text-white/30 font-normal">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#A855F7] shrink-0" />
                <span>Cheque {rs(collectionTotals.chequeIn)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ========================================================== */}
      {/* 2. THE 4 COLORFUL MOCK KPI CARDS (2x2 Grid)                */}
      {/* ========================================================== */}
      <div className="grid grid-cols-2 gap-2.5">
        
        {/* Card 1: RECEIVED (Pastel Mint Green) */}
        <div
          onClick={() => onSelectReport('daybook')}
          className="rounded-2xl border border-[#D1F7E2] bg-[#EAFBF3] p-3.5 flex flex-col justify-between hover:border-emerald-300 transition-all cursor-pointer active:scale-[0.98] shadow-xs min-h-[142px]"
        >
          {/* Circular Icon Badge */}
          <div className="w-10 h-10 rounded-full bg-[#A6F4C5] text-[#05603A] flex items-center justify-center shrink-0 mb-2 shadow-xs">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-[#05603A]">
              <path d="M21 7H3C2.44772 7 2 7.44772 2 8V18C2 18.5523 2.44772 19 3 19H21C21.5523 19 22 18.5523 22 18V8C22 7.44772 21.5523 7 21 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 13H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 10L22 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M7 14L9 16L13 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-600 line-clamp-1 h-4 flex items-center">
              {cardLabels.received}
            </div>
            <div className="text-base sm:text-lg font-extrabold text-[#05603A] tracking-tight tabular-nums mt-0.5 leading-tight">
              ₹{money(receivedInPeriod)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5 leading-tight line-clamp-1 h-3.5 flex items-center">
              Total collected
            </div>
          </div>
        </div>

        {/* Card 2: TOTAL DUE (Pastel Blush Pink) */}
        <div
          onClick={() => onSelectReport('receivables')}
          className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F5] p-3.5 flex flex-col justify-between hover:border-rose-300 transition-all cursor-pointer active:scale-[0.98] shadow-xs min-h-[142px]"
        >
          {/* Circular Icon Badge */}
          <div className="w-10 h-10 rounded-full bg-[#FEE4E2] text-[#D92D20] flex items-center justify-center shrink-0 mb-2 shadow-xs">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-[#D92D20]">
              <path d="M19 7V4C19 3.44772 18.5523 3 18 3H4C3.44772 3 3 3.44772 3 4V18C3 19.1046 3.89543 20 5 20H19C19.5523 20 20 19.5523 20 19V9C20 8.44772 19.5523 8 19 8H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="15" cy="14" r="1.5" fill="currentColor"/>
            </svg>
          </div>

          <div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-600 line-clamp-1 h-4 flex items-center">
              Total Due
            </div>
            <div className="text-base sm:text-lg font-extrabold text-[#D92D20] tracking-tight tabular-nums mt-0.5 leading-tight">
              ₹{money(totalDue)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5 leading-tight line-clamp-1 h-3.5 flex items-center">
              Market recovery
            </div>
          </div>
        </div>

        {/* Card 3: SALES (Pastel Ice Blue) */}
        <div
          onClick={() => onSelectReport('sales')}
          className="rounded-2xl border border-[#D1E0FF] bg-[#EFF4FE] p-3.5 flex flex-col justify-between hover:border-blue-300 transition-all cursor-pointer active:scale-[0.98] shadow-xs min-h-[142px]"
        >
          {/* Circular Icon Badge */}
          <div className="w-10 h-10 rounded-full bg-[#D1E0FF] text-[#155EEF] flex items-center justify-center shrink-0 mb-2 shadow-xs">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-[#155EEF]">
              <circle cx="9" cy="21" r="1" stroke="currentColor" strokeWidth="2"/>
              <circle cx="20" cy="21" r="1" stroke="currentColor" strokeWidth="2"/>
              <path d="M1 1H4.5L7.2 14.4C7.3 14.9 7.8 15.3 8.3 15.3H19.4C19.9 15.3 20.3 14.9 20.5 14.4L22.5 6.5H5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-600 line-clamp-1 h-4 flex items-center">
              {cardLabels.sales}
            </div>
            <div className="text-base sm:text-lg font-extrabold text-[#0F172A] tracking-tight tabular-nums mt-0.5 leading-tight">
              ₹{money(salesInPeriod)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5 leading-tight line-clamp-1 h-3.5 flex items-center">
              Non-GST retail sales
            </div>
          </div>
        </div>

        {/* Card 4: NET PROFIT (Pastel Lavender) */}
        <div
          onClick={() => onSelectReport('netProfit')}
          className="rounded-2xl border border-[#E9D7FE] bg-[#F9F5FF] p-3.5 flex flex-col justify-between hover:border-purple-300 transition-all cursor-pointer active:scale-[0.98] shadow-xs min-h-[142px]"
        >
          {/* Circular Icon Badge */}
          <div className="w-10 h-10 rounded-full bg-[#E9D7FE] text-[#7F56D9] flex items-center justify-center shrink-0 mb-2 shadow-xs">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-[#7F56D9]">
              <path d="M3 20H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M6 16L11 11L15 15L21 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 9H21V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="5" y="16" width="2" height="4" rx="0.5" fill="currentColor"/>
              <rect x="10" y="12" width="2" height="8" rx="0.5" fill="currentColor"/>
              <rect x="15" y="15" width="2" height="5" rx="0.5" fill="currentColor"/>
            </svg>
          </div>

          <div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-600 line-clamp-1 h-4 flex items-center">
              {cardLabels.profit}
            </div>
            <div className={`text-base sm:text-lg font-extrabold tracking-tight tabular-nums mt-0.5 leading-tight ${netProfitInPeriod >= 0 ? 'text-[#05603A]' : 'text-rose-700'}`}>
              ₹{money(netProfitInPeriod)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5 leading-tight line-clamp-1 h-3.5 flex items-center">
              Gross: ₹{money(grossProfitInPeriod)}
            </div>
          </div>
        </div>

      </div>

      {/* ========================================================== */}
      {/* 3. CATEGORIZED REPORT SECTIONS LIST                        */}
      {/* ========================================================== */}
      <div className="space-y-4 pt-1">
        {REPORT_GROUPS.map((group) => (
          <div key={group.id} className="space-y-2">
            <h2 className="text-[11px] font-extrabold tracking-wider text-slate-500 uppercase px-1">
              {group.name}
            </h2>

            <div className="rounded-2xl border border-blue-100/90 bg-white shadow-xs overflow-hidden divide-y divide-slate-100">
              {group.items.map((item) => {
                const Icon = getReportNavIcon(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectReport(item.id)}
                    className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer text-left group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors flex items-center justify-center shrink-0">
                        <Icon size={18} />
                      </div>

                      {/* Title & Subtitle */}
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 leading-snug break-words group-hover:text-blue-600 transition-colors">
                          {item.title}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-snug break-words">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>

                    <ChevronRight
                      size={16}
                      className="text-slate-400 group-hover:text-slate-600 transition-colors shrink-0 ml-2"
                    />
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
