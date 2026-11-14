import React, { useMemo, useState } from 'react';
import { ArrowLeft, AlertTriangle, ChevronRight } from 'lucide-react';
import { Bill, Product } from '../../../types';
import { useLedger } from '../../../context/LedgerContext';
import { money } from '../../../utils/billing';
import { EXPENSE_LABELS, computeNetProfit } from '../../../utils/netProfit';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { ReportTitleBar, reportCard } from './ReportKit';
import { useSalesMarginPnl } from './SalesMarginPnLReport';

/**
 * Profit & Loss in the usual accounting order, one screen, nothing repeated:
 *
 *   Sales (before GST, after discounts and returns)
 *   - Cost of the cases delivered
 *   = Gross profit on sales
 *   - Stock lost / given free (net of supplier compensation)
 *   + Supplier scheme credits
 *   = Gross profit
 *   - Expenses
 *   = Net profit
 *
 * All figures come from the same engine as the detailed reports (useSalesMarginPnl + computeNetProfit),
 * so they always agree with them. GST collected is NOT income and is left out (see the GST report).
 */

export interface SimplePnLReportProps {
  filteredBills: Bill[];
  products: Product[];
  periodLabel: string;
  dateInPeriod: (date: string) => boolean;
  gstTaxSummary?: Parameters<typeof useSalesMarginPnl>[0]['gstTaxSummary'];
  purchaseStats?: Parameters<typeof useSalesMarginPnl>[0]['purchaseStats'];
  /** The detailed product / customer / day report, shown only when the person asks for it. */
  detail?: React.ReactNode;
}

type Kind = 'item' | 'less' | 'add' | 'subtotal' | 'grand';

const Line: React.FC<{ label: string; value: number; kind?: Kind; hint?: string }> = ({ label, value, kind = 'item', hint }) => {
  const neg = value < -0.004;
  const prefix = kind === 'less' ? '− ' : kind === 'add' ? '+ ' : '';
  const strong = kind === 'subtotal' || kind === 'grand';
  const shade =
    kind === 'grand'
      ? neg
        ? 'bg-rose-50'
        : 'bg-emerald-50'
      : kind === 'subtotal'
        ? 'bg-[#faf8f5]'
        : '';
  const color = neg && strong ? 'text-rose-700' : kind === 'grand' ? 'text-emerald-800' : 'text-slate-900';
  return (
    <div className={`flex items-start justify-between gap-3 px-3.5 py-2.5 border-t border-black/5 first:border-t-0 ${shade}`}>
      <div className="min-w-0">
        <div className={`leading-snug ${kind === 'grand' ? 'text-[15px] font-extrabold' : strong ? 'text-[14px] font-bold' : 'text-[14px] font-medium'} ${color}`}>
          {label}
        </div>
        {hint ? <div className="text-xs text-slate-500 leading-snug">{hint}</div> : null}
      </div>
      <div className={`tabular-nums whitespace-nowrap ${kind === 'grand' ? 'text-[16px]' : 'text-[14px]'} ${strong ? 'font-extrabold' : 'font-semibold'} ${color}`}>
        {neg ? '−' : prefix}₹{money(Math.abs(value))}
      </div>
    </div>
  );
};

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-t border-black/5 first:border-t-0">
    {children}
  </div>
);

export const SimplePnLReport: React.FC<SimplePnLReportProps> = ({
  filteredBills,
  products,
  periodLabel,
  dateInPeriod,
  gstTaxSummary,
  purchaseStats,
  detail,
}) => {
  const { expenses } = useLedger();
  const [showDetail, setShowDetail] = useState(false);

  const { pnl } = useSalesMarginPnl({
    filteredBills,
    products,
    dateInPeriod,
    gstTaxSummary,
    purchaseStats,
    viewBasis: 'exGst',
  });

  const periodExpenses = useMemo(
    () => (expenses || []).filter((e) => dateInPeriod(String(e.date).slice(0, 10))),
    [expenses, dateInPeriod],
  );

  // operatingGrossProfit already contains the write-offs and supplier scheme credits (shared engine).
  const np = useMemo(
    () => computeNetProfit({ grossProfitAfterLosses: pnl.operatingGrossProfit, expenses: periodExpenses }),
    [pnl.operatingGrossProfit, periodExpenses],
  );

  const expenseRows = useMemo(
    () =>
      Object.keys(EXPENSE_LABELS)
        .map((k) => ({ key: k, label: EXPENSE_LABELS[k], amount: np.byCategory[k] || 0 }))
        .filter((r) => r.amount > 0.004),
    [np.byCategory],
  );
  const totalExpenses = np.operatingCosts + np.payPaid;

  const sales = pnl.taxableSalesNet;
  const grossOnSales = pnl.grossProfitBeforeLosses; // sales - cost
  const grossProfit = pnl.operatingGrossProfit; // after write-offs and scheme credits
  const netProfit = np.netProfit;
  const pct = (n: number) => (sales > 0 ? `${((n / sales) * 100).toFixed(1)}%` : '—');

  const missingCost = pnl.costChecks.zeroCostLines > 0;
  const estimatedCost = pnl.costChecks.estimatedCostLines > 0;

  const exportRows = (): [string, number][] => [
    ['Sales (before GST, after discounts and returns)', sales],
    ['Less: Cost of goods delivered', pnl.cogs],
    ['Gross profit on sales', grossOnSales],
    ['Less: Stock lost / given free (net of supplier compensation)', pnl.writeOffNet],
    ['Add: Supplier scheme credits received', pnl.supplierCredits],
    ['Gross profit', grossProfit],
    ...expenseRows.map((r): [string, number] => [`Expense: ${r.label}`, r.amount]),
    ['Total expenses', totalExpenses],
    ['Net profit', netProfit],
  ];

  const exportExcel = () =>
    downloadXlsx(`profit-and-loss-${fileStamp()}.xlsx`, [
      {
        name: 'Profit & Loss',
        header: ['Item', 'Amount (Rs.)'],
        rows: [['Period', periodLabel], ...exportRows().map(([a, b]) => [a, Math.round(b * 100) / 100] as (string | number)[])],
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `profit-and-loss-${fileStamp()}.pdf`,
      title: 'Profit & Loss',
      subtitle: ['MrWater Distribution', `Period: ${periodLabel}`],
      sections: [
        {
          header: ['Item', 'Amount (Rs.)'],
          rows: exportRows().map(([a, b]) => [a, money(b)]),
          rightAlign: [1],
        },
      ],
    });

  const whatsappText =
    `📊 *Profit & Loss — ${periodLabel}*\n` +
    `Sales (before GST): ₹${money(sales)}\n` +
    `Gross profit: ₹${money(grossProfit)}\n` +
    `Expenses: ₹${money(totalExpenses)}\n` +
    `*Net profit: ₹${money(netProfit)}*`;

  if (showDetail && detail) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowDetail(false)}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-700 hover:underline cursor-pointer"
        >
          <ArrowLeft size={15} /> Back to Profit &amp; Loss
        </button>
        {detail}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full max-w-3xl" id="report-pnl">
      <ReportTitleBar
        title="Profit & Loss"
        sub={periodLabel}
        actions={
          <ReportDownloadButtons
            onExcel={exportExcel}
            onPdf={exportPdf}
            reportTitle="Profit & Loss"
            whatsappText={whatsappText}
          />
        }
      />

      {/* The one number that matters */}
      <div className={`${reportCard} p-4 ${netProfit < 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {netProfit < 0 ? 'Net loss' : 'Net profit'}
        </div>
        <div className={`text-3xl font-extrabold tabular-nums ${netProfit < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
          {netProfit < 0 ? '−' : ''}₹{money(Math.abs(netProfit))}
        </div>
        <div className="text-xs text-slate-600 mt-0.5">
          {pct(netProfit)} of sales · {pnl.invoiceCount} invoice{pnl.invoiceCount === 1 ? '' : 's'} ·{' '}
          {pnl.casesSold} cases sold{pnl.freeCases > 0 ? ` + ${pnl.freeCases} free` : ''}
        </div>
      </div>

      {(missingCost || estimatedCost) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
          <div className="space-y-1">
            {missingCost && (
              <div>
                <b>Profit may be too high:</b> {pnl.costChecks.zeroCostCases} cases have no purchase cost
                {pnl.costChecks.zeroCostProducts.length > 0 ? ` (${pnl.costChecks.zeroCostProducts.slice(0, 4).join(', ')}${pnl.costChecks.zeroCostProducts.length > 4 ? '…' : ''})` : ''}
                . Enter the cost on the inward / GRN entry.
              </div>
            )}
            {estimatedCost && (
              <div>
                {pnl.costChecks.estimatedCostCases} cases use the product&apos;s average cost because no stock batch was recorded on the bill.
              </div>
            )}
          </div>
        </div>
      )}

      {/* The statement */}
      <section className={`${reportCard} overflow-hidden`}>
        <Heading>Sales</Heading>
        <Line
          label="Sales"
          value={sales}
          hint="Before GST, after discounts and returns"
        />
        <Heading>Cost of goods</Heading>
        <Line
          label="Cost of cases delivered"
          value={pnl.cogs}
          kind="less"
          hint={`${pnl.totalDispatchedCases} cases${pnl.freeCases > 0 ? ` (${pnl.freeCases} free)` : ''}, including inward freight`}
        />
        <Line label={`Gross profit on sales · ${pct(grossOnSales)}`} value={grossOnSales} kind="subtotal" />

        {(pnl.writeOffNet > 0.004 || pnl.supplierCredits > 0.004) && (
          <>
            <Heading>Stock losses and supplier credits</Heading>
            {pnl.writeOffNet > 0.004 && (
              <Line
                label="Stock lost or given free"
                value={pnl.writeOffNet}
                kind="less"
                hint={pnl.writeOffRecovered > 0.004 ? `After ₹${money(pnl.writeOffRecovered)} compensated by the supplier` : 'Damaged, expired or free issues'}
              />
            )}
            {pnl.supplierCredits > 0.004 && <Line label="Supplier scheme credits received (as entered, should be without GST)" value={pnl.supplierCredits} kind="add" />}
            <Line label="Gross profit" value={grossProfit} kind="subtotal" />
          </>
        )}

        <Heading>Expenses</Heading>
        {expenseRows.length === 0 ? (
          <div className="px-3.5 py-2.5 text-sm text-slate-500 border-t border-black/5">
            No expenses entered for this period. Add them in Expenses so net profit is correct.
          </div>
        ) : (
          expenseRows.map((r) => <Line key={r.key} label={r.label} value={r.amount} kind="less" />)
        )}
        {expenseRows.length > 1 && <Line label="Total expenses" value={totalExpenses} kind="subtotal" />}

        <Line label={netProfit < 0 ? 'Net loss' : 'Net profit'} value={netProfit} kind="grand" />
      </section>

      <p className="text-xs text-slate-500 px-1">
        GST in your sales (₹{money(pnl.totalOutputGstNet)}) is owed to the government, not income, so it is left out. See the GST report.
      </p>

      {detail && (
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className="inline-flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
        >
          <span>Profit by product, customer or day</span>
          <ChevronRight size={16} className="text-slate-400" />
        </button>
      )}
    </div>
  );
};
