import React, { useMemo, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { money } from '../../../utils/billing';
import { billBalance, billNetTotal, round2 } from '../../../utils/salesReturns';
import { isAdvanceAdjustmentRow } from '../../../utils/paymentAllocation';
import { todayISO, toLocalISODate } from '../../../utils/dateLocal';
import { PaymentRecord, PaymentMode } from '../../../types';
import { ReportShareMenu } from './ReportShareMenu';
import { ReportList, ReportRow, ReportStat, ReportStatGrid, ReportTitleBar, reportCard } from './ReportKit';
import { HeroCard, LegendDot, SplitBar } from './mobile/PhoneKit';
import { useSalesMarginPnl } from './SalesMarginPnLReport';
import { totalDueOf } from '../../../utils/dueSummary';

interface ReportsOverviewProps {
  onNavigateReport: (reportId: string) => void;
  /** Label of the period picked at the top of Reports (e.g. "November 2026"). */
  periodLabel?: string;
  /** Period picked at the top of Reports. When given, the Overview follows it and has no picker of its own. */
  inPeriod?: (date: string) => boolean;
}

const MODE_LABEL: Record<PaymentMode, string> = {
  cash: 'Cash',
  upi: 'UPI',
  cheque: 'Cheque',
  bank: 'Bank Transfer',
  credit: 'Credit',
  other: 'Other',
};

export const ReportsOverview: React.FC<ReportsOverviewProps> = ({
  onNavigateReport,
  periodLabel,
  inPeriod: externalInPeriod,
}) => {
  const followsTop = typeof externalInPeriod === 'function';
  const { bills, payments, expenses, products, customers, existingCustomers } = useLedger();

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

  // Filter matcher based on selectedPeriod
  const matchesPeriod = useCallback((dateStr: string) => {
    const d = (dateStr || '').slice(0, 10);
    if (!d) return false;
    if (externalInPeriod) return externalInPeriod(d);
    if (selectedPeriod === 'all') return true;
    if (selectedPeriod === 'today') return d === todayStr;
    if (selectedPeriod === 'yesterday') return d === yesterdayStr;
    if (selectedPeriod === '7days') return d >= sevenDaysAgoStr && d <= todayStr;
    if (selectedPeriod === 'month') return d.startsWith(currentYearMonth);
    return true;
  }, [externalInPeriod, selectedPeriod, todayStr, yesterdayStr, sevenDaysAgoStr, currentYearMonth]);

  // Dynamic card labels based on selected period
  const cardLabels = useMemo(() => {
    if (followsTop) {
      const l = (periodLabel || 'This period').toUpperCase();
      return {
        received: `RECEIVED · ${l}`,
        sales: `SALES · ${l}`,
        profit: `PROFIT · ${l}`,
        collection: `COLLECTION · ${l}`,
        moneyInHand: `MONEY IN HAND · ${l}`,
      };
    }
    switch (selectedPeriod) {
      case 'today':
        return {
          received: 'RECEIVED TODAY',
          sales: 'SALES · TODAY',
          profit: 'PROFIT · TODAY',
          collection: 'DAILY COLLECTION · TODAY',
          moneyInHand: 'MONEY IN HAND TODAY',
        };
      case 'yesterday':
        return {
          received: 'RECEIVED YESTERDAY',
          sales: 'SALES · YESTERDAY',
          profit: 'PROFIT · YESTERDAY',
          collection: 'COLLECTION · YESTERDAY',
          moneyInHand: 'MONEY IN HAND (YESTERDAY)',
        };
      case '7days':
        return {
          received: 'RECEIVED · 7 DAYS',
          sales: 'SALES · 7 DAYS',
          profit: 'PROFIT · 7 DAYS',
          collection: 'COLLECTION · LAST 7 DAYS',
          moneyInHand: 'MONEY IN HAND (7 DAYS)',
        };
      case 'month':
        return {
          received: 'RECEIVED · THIS MONTH',
          sales: 'SALES · THIS MONTH',
          profit: 'PROFIT · THIS MONTH',
          collection: 'COLLECTION · THIS MONTH',
          moneyInHand: 'MONEY IN HAND (THIS MONTH)',
        };
      case 'all':
      default:
        return {
          received: 'RECEIVED · ALL TIME',
          sales: 'SALES · ALL TIME',
          profit: 'PROFIT · ALL TIME',
          collection: 'COLLECTION · ALL TIME',
          moneyInHand: 'MONEY IN HAND (ALL TIME)',
        };
    }
  }, [selectedPeriod, followsTop, periodLabel]);

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

  // 2. REAL METRIC: Total Due across all bills
  // One definition of due for every screen: the customer ledger total (see utils/dueSummary.ts).
  const totalDue = useMemo(() => totalDueOf({ existingCustomers, bills }), [existingCustomers, bills]);

  // 3. REAL METRICS: billed sales in the selected period, and profit from the shared P&L engine
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
  const { salesInPeriod, profitInPeriod, landedCostInPeriod } = useMemo(() => {
    let billedRev = 0;
    periodBills.forEach((b) => {
      billedRev += billNetTotal(b);
    });
    return {
      salesInPeriod: round2(billedRev),
      profitInPeriod: round2(periodPnl.operatingGrossProfit),
      landedCostInPeriod: round2(periodPnl.cogs),
    };
  }, [periodBills, periodPnl]);

  // 5. REAL DATA: Daily / Period Collection Breakdown & Transactions
  const { periodMoneyInHand, periodCashIn, periodDigitalIn, periodNewDue, periodTransactions } = useMemo(() => {
    let cash = 0;
    let digital = 0;
    let due = 0;
    let out = 0;

    interface TxItem {
      id: string;
      title: string;
      subtitle: string;
      initial: string;
      tone: 'blue' | 'green' | 'red';
      amount: number;
      paid?: number;
      due?: number;
      isOut?: boolean;
    }

    const txs: TxItem[] = [];
    const liveBills = (bills || []).filter((b) => b.status !== 'cancelled' && !b.cancelled);
    const billPaymentsMap = new Map<number, PaymentRecord[]>();
    (payments || []).forEach((p) => {
      if (!p.billId || p.isRefund) return;
      const list = billPaymentsMap.get(p.billId) || [];
      list.push(p);
      billPaymentsMap.set(p.billId, list);
    });

    // Bills generated in period
    liveBills.forEach((b) => {
      const bDate = String(b.date || '').slice(0, 10);
      if (!matchesPeriod(bDate)) return;

      const net = billNetTotal(b);
      const rows = billPaymentsMap.get(b.id) || [];
      const sameDayRows = rows.filter(
        (p) => String(p.paymentDate || p.createdAt || '').slice(0, 10) <= bDate && p.mode !== 'credit'
      );

      let paid = 0;
      let billCash = 0;
      let billDigital = 0;
      let modeStr = '';

      if (rows.length === 0) {
        paid = Math.min(net, Number(b.amountPaid) || 0);
        const m = b.paymentMode || 'cash';
        if (m === 'cash') billCash = paid;
        else billDigital = paid;
        modeStr = MODE_LABEL[m] || m;
      } else {
        sameDayRows.forEach((p) => {
          const a = Number(p.amount) || 0;
          paid += a;
          if (isAdvanceAdjustmentRow(p)) return;
          if (p.mode === 'cash') billCash += a;
          else billDigital += a;
        });
        modeStr = Array.from(new Set(sameDayRows.map((p) => MODE_LABEL[p.mode] || p.mode))).join(' + ');
        paid = Math.min(net, round2(paid));
      }

      const billDue = Math.max(0, round2(net - paid));
      cash += billCash;
      digital += billDigital;
      due += billDue;

      txs.push({
        id: `b-${b.id}`,
        title: b.retailer || 'Cash Sale',
        subtitle: `Invoice #${b.id}${paid > 0 && modeStr ? ` · ${modeStr}` : ' · Cash'}`,
        initial: (b.retailer || 'S')[0]?.toUpperCase() || 'S',
        tone: 'blue',
        amount: net,
        paid,
        due: billDue,
      });
    });

    // Payments collected in period
    (payments || []).forEach((p) => {
      const pDate = String(p.paymentDate || p.createdAt || '').slice(0, 10);
      if (!matchesPeriod(pDate) || p.mode === 'credit') return;

      const amt = Number(p.amount) || 0;
      if (amt === 0) return;
      const modeStr = MODE_LABEL[p.mode] || p.mode;

      if (p.isRefund || amt < 0) {
        const refundAmt = Math.abs(amt);
        out += refundAmt;
        txs.push({
          id: `ref-${p.id}`,
          title: p.customerName || 'Customer',
          subtitle: `Refund issued · ${modeStr}`,
          initial: '↗',
          tone: 'red',
          amount: refundAmt,
          isOut: true,
        });
        return;
      }

      // Skip upfront payments on bills inside period (already counted on the bill)
      const b = p.billId ? liveBills.find((bill) => bill.id === p.billId) : undefined;
      const bDate = b ? String(b.date || '').slice(0, 10) : '';
      if (b && matchesPeriod(bDate) && pDate <= bDate) return;

      if (p.mode === 'cash') cash += amt;
      else digital += amt;

      txs.push({
        id: `p-${p.id}`,
        title: p.customerName || (b ? b.retailer : 'Customer'),
        subtitle: b ? `Payment for #${p.billId} · ${modeStr}` : `Payment on account · ${modeStr}`,
        initial: '₹',
        tone: 'green',
        amount: amt,
      });
    });

    // Expenses paid in period
    (expenses || []).forEach((e) => {
      const eDate = String(e.date || '').slice(0, 10);
      if (!matchesPeriod(eDate)) return;
      const amt = Number(e.amount) || 0;
      if (amt <= 0) return;
      out += amt;
      txs.push({
        id: `exp-${e.id}`,
        title: e.paidTo ? `${e.category} · ${e.paidTo}` : (e.category || 'Expense'),
        subtitle: e.note || 'Expense paid',
        initial: '↗',
        tone: 'red',
        amount: amt,
        isOut: true,
      });
    });

    const inHand = cash + digital - out;

    return {
      periodMoneyInHand: inHand,
      periodCashIn: cash,
      periodDigitalIn: digital,
      periodNewDue: due,
      periodTransactions: txs.slice(0, 15),
    };
  }, [bills, payments, expenses, matchesPeriod]);

  const totalCollected = periodCashIn + periodDigitalIn;
  const recordedExpensesInPeriod = useMemo(() => {
    return (expenses || [])
      .filter((e) => matchesPeriod(String(e.date || '').slice(0, 10)))
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  }, [expenses, matchesPeriod]);
  const periodExpenses = recordedExpensesInPeriod;
  const netProfitInPeriod = useMemo(() => round2(profitInPeriod - recordedExpensesInPeriod), [profitInPeriod, recordedExpensesInPeriod]);
  const cashPct = totalCollected > 0 ? (periodCashIn / totalCollected) * 100 : 0;
  const upiPct = totalCollected > 0 ? (periodDigitalIn / totalCollected) * 100 : 0;

  // 6. REAL DATA: Who Owes Me (Biggest Outstanding Balances)
  const biggestDues = useMemo(() => {
    const liveBills = (bills || []).filter((b) => b.status !== 'cancelled' && !b.cancelled);
    const key = (n?: string) => String(n || '').trim().toLowerCase();
    const perName = new Map<string, { overdue: number; count: number }>();
    liveBills.forEach((b) => {
      if (billBalance(b) <= 0) return;
      const k = key(b.retailer);
      const cur = perName.get(k) || { overdue: 0, count: 0 };
      cur.count += 1;
      if (String(b.date || '').slice(0, 10) < todayStr) cur.overdue += 1;
      perName.set(k, cur);
    });
    // Same ledger balance as the Customers screen, Party credit and the Beat report.
    return (existingCustomers || [])
      .filter((c) => (Number(c.balanceDue) || 0) > 0.004)
      .map((c) => {
        const x = perName.get(key(c.name));
        return {
          name: c.name || 'Unknown Party',
          balance: Number(c.balanceDue) || 0,
          overdueCount: x?.overdue || 0,
          totalBills: x?.count || 0,
        };
      })
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);
  }, [bills, existingCustomers, todayStr]);

  // 7. REAL DATA: Product Profit (Top Products in period)
  const topProductProfits = useMemo(() => {
    const liveBills = (bills || []).filter((b) => b.status !== 'cancelled' && !b.cancelled);
    const prodMap = new Map((products || []).map((p) => [p.id, p]));
    const itemMap = new Map<
      number,
      {
        name: string;
        revenue: number;
        cost: number;
        profit: number;
      }
    >();

    liveBills.forEach((b) => {
      const bDate = String(b.date || '').slice(0, 10);
      if (!matchesPeriod(bDate)) return;

      b.items.forEach((item) => {
        const prod = prodMap.get(item.productId);
        const name = item.productName || prod?.name || `Product #${item.productId}`;
        const unitCost = item.costExGst || prod?.effectiveCost || prod?.cost || 0;
        const totalItemCost = item.qty * unitCost;
        const gross = item.gross || item.qty * item.rate;
        const disc = item.discount || 0;
        const netRev = item.amount || gross - disc;

        const existing = itemMap.get(item.productId) || {
          name,
          revenue: 0,
          cost: 0,
          profit: 0,
        };

        existing.revenue += netRev;
        existing.cost += totalItemCost;
        existing.profit += netRev - totalItemCost;

        itemMap.set(item.productId, existing);
      });
    });

    return Array.from(itemMap.values())
      .map((p) => ({
        ...p,
        marginPct: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 4);
  }, [bills, products, matchesPeriod]);

  const periodOptions: { id: typeof selectedPeriod; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7days', label: '7 days' },
    { id: 'month', label: 'Month' },
    { id: 'all', label: 'All time' },
  ];

  const currentPeriodLabel = followsTop
    ? periodLabel || 'This period'
    : periodOptions.find((o) => o.id === selectedPeriod)?.label || 'Month';

  const shareMenu = (
    <ReportShareMenu
      reportTitle="Reports Overview"
      periodLabel={currentPeriodLabel}
      orgName="Hydrate Hub"
      align="right"
      summaryMetrics={[
        { label: cardLabels.received, value: `₹${money(receivedInPeriod)}` },
        { label: 'Total Due', value: `₹${money(totalDue)}` },
        { label: cardLabels.sales, value: `₹${money(salesInPeriod)}` },
        { label: cardLabels.profit, value: `₹${money(profitInPeriod)}` },
        { label: 'Money in Hand', value: `₹${money(periodMoneyInHand)}` },
      ]}
      sheets={[
        {
          name: 'Overview KPIs',
          header: ['Metric', 'Period', 'Amount (Rs)'],
          rows: [
            [cardLabels.received, currentPeriodLabel, receivedInPeriod],
            ['Total Due Outstanding', 'All time', totalDue],
            [cardLabels.sales, currentPeriodLabel, salesInPeriod],
            [cardLabels.profit, currentPeriodLabel, profitInPeriod],
            ['Money in Hand', currentPeriodLabel, periodMoneyInHand],
            ['Cash Collected', currentPeriodLabel, periodCashIn],
            ['Digital / UPI Collected', currentPeriodLabel, periodDigitalIn],
            ['New Due Created', currentPeriodLabel, periodNewDue],
          ],
        },
        {
          name: 'Transactions',
          header: ['Party / Title', 'Details', 'Amount (Rs)', 'Paid (Rs)', 'Due (Rs)'],
          rows: periodTransactions.map((t) => [t.title, t.subtitle, t.isOut ? -t.amount : t.amount, t.paid || 0, t.due || 0]),
        },
        {
          name: 'Top Dues',
          header: ['Party Name', 'Outstanding Balance (Rs)', 'Overdue Invoices'],
          rows: biggestDues.map((d) => [d.name, d.balance, d.overdueCount]),
        },
        {
          name: 'Top Products',
          header: ['Product', 'Revenue (Rs)', 'Cost (Rs)', 'Profit (Rs)', 'Margin %'],
          rows: topProductProfits.map((p) => [p.name, p.revenue, p.cost, p.profit, `${p.marginPct.toFixed(1)}%`]),
        },
      ]}
      pdfSections={[
        {
          title: `Summary KPIs (${currentPeriodLabel})`,
          header: ['Indicator', 'Period', 'Amount (Rs.)'],
          rows: [
            [cardLabels.received, currentPeriodLabel, money(receivedInPeriod)],
            ['Total Due Outstanding', 'All time', money(totalDue)],
            [cardLabels.sales, currentPeriodLabel, money(salesInPeriod)],
            [cardLabels.profit, currentPeriodLabel, money(profitInPeriod)],
            ['Money in Hand', currentPeriodLabel, money(periodMoneyInHand)],
          ],
          rightAlign: [2],
        },
        {
          title: `Recent Transactions (${currentPeriodLabel})`,
          header: ['Party / Title', 'Details', 'Amount (Rs.)', 'Paid (Rs.)', 'Due (Rs.)'],
          rows: periodTransactions.map((t) => [
            t.title,
            t.subtitle,
            t.isOut ? `-Rs.${money(t.amount)}` : money(t.amount),
            t.paid !== undefined ? money(t.paid) : '',
            t.due !== undefined ? money(t.due) : '',
          ]),
          rightAlign: [2, 3, 4],
        },
        {
          title: 'Biggest Outstanding Accounts',
          header: ['Party Name', 'Bills on Credit', 'Outstanding Due (Rs.)'],
          rows: biggestDues.map((d) => [d.name, `${d.totalBills} bills`, money(d.balance)]),
          rightAlign: [2],
        },
        {
          title: `Top Product Profits (${currentPeriodLabel})`,
          header: ['Product Name', 'Revenue (Rs.)', 'Profit (Rs.)', 'Margin %'],
          rows: topProductProfits.map((p) => [p.name, money(p.revenue), money(p.profit), `${p.marginPct.toFixed(1)}%`]),
          rightAlign: [1, 2, 3],
        },
      ]}
    />
  );

  /** Tappable stat tile: same tile as the other reports, opens the report behind it. */
  const StatLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
    <button
      type="button"
      onClick={() => onNavigateReport(to)}
      className="text-left rounded-2xl cursor-pointer transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40"
    >
      {children}
    </button>
  );

  /** White card with the shaded heading strip and an "Open report" link. */
  const Section: React.FC<{ title: string; linkLabel: string; to: string; children: React.ReactNode }> = ({ title, linkLabel, to, children }) => (
    <section className={`${reportCard} overflow-hidden`}>
      <div className="px-3.5 py-2.5 bg-[#faf8f5] flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{title}</span>
        <button type="button" onClick={() => onNavigateReport(to)} className="text-xs font-bold text-sky-700 hover:underline cursor-pointer shrink-0">
          {linkLabel}
        </button>
      </div>
      <div className="border-t border-black/5">{children}</div>
    </section>
  );

  return (
    <div className="space-y-3" id="report-overview">
      <ReportTitleBar
        title="Overview"
        sub={`${currentPeriodLabel} · all reports start here`}
        actions={
          <>
            {!followsTop && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
                  className="h-9 flex items-center gap-1.5 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer"
                >
                  <span>{currentPeriodLabel}</span>
                  <ChevronDown size={14} className="text-slate-400" />
                </button>
                {periodDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-36 rounded-xl border border-slate-200 bg-white py-1 shadow-xl z-50 text-xs">
                    {periodOptions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPeriod(p.id);
                          setPeriodDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 font-medium hover:bg-slate-50 cursor-pointer ${
                          selectedPeriod === p.id ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-slate-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {shareMenu}
          </>
        }
      />

      <ReportStatGrid>
        <StatLink to="daybook">
          <ReportStat label={cardLabels.received} value={`₹${money(receivedInPeriod)}`} tone="green" sub="money taken in" />
        </StatLink>
        <StatLink to="receivables">
          <ReportStat label="Total due" value={`₹${money(totalDue)}`} tone="red" sub="still to collect, all time" />
        </StatLink>
        <StatLink to="margin">
          <ReportStat label={cardLabels.sales} value={`₹${money(salesInPeriod)}`} sub="Non-GST retail sales" />
        </StatLink>
        <StatLink to="margin">
          <ReportStat label={cardLabels.profit} value={`₹${money(profitInPeriod)}`} tone="green" sub={`Gross margin · Net ₹${money(netProfitInPeriod)}`} />
        </StatLink>
      </ReportStatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {/* Left: money in hand + latest transactions */}
        <div className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onNavigateReport('daybook')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigateReport('daybook');
              }
            }}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 rounded-3xl"
          >
            <HeroCard tone="navy" label={cardLabels.moneyInHand} value={`₹${money(periodMoneyInHand)}`} negative={periodMoneyInHand < 0}>
              <div className="text-xs text-white/70">
                Collected ₹{money(totalCollected)} − Paid out ₹{money(periodExpenses)}
              </div>
              <SplitBar
                label="Cash versus UPI received"
                parts={[
                  { value: periodCashIn, className: 'bg-emerald-400' },
                  { value: periodDigitalIn, className: 'bg-sky-400' },
                ]}
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/90">
                <LegendDot dot="bg-emerald-400">Cash ₹{money(periodCashIn)}</LegendDot>
                <LegendDot dot="bg-sky-400">UPI ₹{money(periodDigitalIn)}</LegendDot>
                <LegendDot dot="bg-rose-400">New due ₹{money(periodNewDue)}</LegendDot>
              </div>
            </HeroCard>
          </div>

          <Section title={cardLabels.collection} linkLabel="Open report →" to="daybook">
            {periodTransactions.length === 0 ? (
              <div className="py-8 px-4 text-center text-sm text-slate-400">
                No transactions recorded for this period. Bills, payments and expenses will appear here.
              </div>
            ) : (
              <ReportList>
                {periodTransactions.map((tx) => (
                  <ReportRow
                    key={tx.id}
                    title={tx.title}
                    sub={tx.subtitle}
                    amount={tx.isOut ? `−₹${money(tx.amount)}` : `₹${money(tx.amount)}`}
                    amountTone={tx.isOut ? 'red' : tx.tone === 'green' ? 'green' : 'ink'}
                    status={
                      (tx.due || 0) > 0
                        ? `Due ₹${money(tx.due || 0)}${(tx.paid || 0) > 0 ? ` · Paid ₹${money(tx.paid || 0)}` : ''}`
                        : (tx.paid || 0) > 0
                          ? `Paid ₹${money(tx.paid || 0)}`
                          : undefined
                    }
                    statusTone={(tx.due || 0) > 0 ? 'red' : 'green'}
                  />
                ))}
              </ReportList>
            )}
          </Section>
        </div>

        {/* Right: who owes me + product profit */}
        <div className="space-y-3">
          <Section title="Who owes me · biggest dues" linkLabel="All parties →" to="receivables">
            {biggestDues.length === 0 ? (
              <div className="py-8 px-4 text-center text-sm text-slate-400">All accounts are clear · No outstanding dues</div>
            ) : (
              <ReportList>
                {biggestDues.map((item) => (
                  <ReportRow
                    key={item.name}
                    title={item.name}
                    sub={
                      item.overdueCount > 0
                        ? `${item.overdueCount} invoice${item.overdueCount === 1 ? '' : 's'} overdue`
                        : `${item.totalBills} bill${item.totalBills === 1 ? '' : 's'} on credit`
                    }
                    amount={`₹${money(item.balance)}`}
                    amountTone="red"
                  />
                ))}
              </ReportList>
            )}
          </Section>

          <Section title="Product profit · top" linkLabel="All products →" to="margin">
            {topProductProfits.length === 0 ? (
              <div className="py-8 px-4 text-center text-sm text-slate-400">No product sales recorded in this period</div>
            ) : (
              <ReportList>
                {topProductProfits.map((item) => (
                  <ReportRow
                    key={item.name}
                    title={item.name}
                    sub={`Margin ${item.marginPct.toFixed(1)}%${item.marginPct < 5 ? ' · low' : ''}`}
                    amount={`₹${money(item.profit)}`}
                    amountTone={item.marginPct < 5 ? 'amber' : 'green'}
                  />
                ))}
              </ReportList>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
};
