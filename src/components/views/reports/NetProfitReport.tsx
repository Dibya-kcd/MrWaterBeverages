import React, { useMemo, useState } from 'react';
import { Bill, Product } from '../../../types';
import type { BusinessExpenseRecord } from '../../../utils/storage';
import { useLedger } from '../../../context/LedgerContext';
import { money } from '../../../utils/billing';
import { useSalesMarginPnl } from './SalesMarginPnLReport';
import { RegisterCard } from './mobile/ReportCards';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { ReportBreakdownLine, ReportStat, ReportStatGrid, ReportTitleBar, reportCard } from './ReportKit';
import { HeroCard, LegendDot, MiniStat, PhoneDownloadBar, PhoneHeader, SplitBar } from './mobile/PhoneKit';
import {
  EXPENSE_LABELS,
  PAY_CATEGORIES,
  computeNetProfit,
  salaryPool,
} from '../../../utils/netProfit';
import { todayISO } from "../../../utils/dateLocal";

export interface NetProfitReportProps {
  filteredBills: Bill[];
  products: Product[];
  periodLabel: string;
  dateInPeriod: (date: string) => boolean;
  gstTaxSummary?: Parameters<typeof useSalesMarginPnl>[0]['gstTaxSummary'];
  purchaseStats?: Parameters<typeof useSalesMarginPnl>[0]['purchaseStats'];
}

const CATS_ORDER = Object.keys(EXPENSE_LABELS);

const Row: React.FC<{ label: string; value: number; hint?: string; bold?: boolean; sign?: 'minus' | 'plus' }> = ({
  label,
  value,
  hint,
  bold,
  sign,
}) => (
  <div className="flex items-start justify-between gap-3 px-3.5 py-2.5 border-t border-black/5 first:border-t-0">
    <div className="min-w-0">
      <div className={`text-[14px] leading-snug ${bold ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'}`}>{label}</div>
      {hint ? <div className="text-xs text-slate-500 leading-snug">{hint}</div> : null}
    </div>
    <div
      className={`text-[14px] font-extrabold tabular-nums whitespace-nowrap ${
        value < 0 ? 'text-rose-700' : sign === 'plus' ? 'text-emerald-700' : bold ? 'text-slate-900' : 'text-slate-700'
      }`}
    >
      {sign === 'minus' ? '− ' : sign === 'plus' ? '+ ' : ''}₹{money(Math.abs(value))}
      {value < 0 && !sign ? ' (loss)' : ''}
    </div>
  </div>
);

/** White card with the same shaded heading strip as the day cards in the other reports. */
const Panel: React.FC<{ title: string; tone?: 'default' | 'amber'; children: React.ReactNode }> = ({ title, tone = 'default', children }) => (
  <section className={`${reportCard} overflow-hidden ${tone === 'amber' ? 'border-amber-200' : ''}`}>
    <div className={`px-3.5 py-2.5 text-[13px] font-bold ${tone === 'amber' ? 'bg-amber-50 text-amber-900' : 'bg-[#faf8f5] text-slate-900'}`}>{title}</div>
    <div className="border-t border-black/5">{children}</div>
  </section>
);

export const NetProfitReport: React.FC<NetProfitReportProps> = ({
  filteredBills,
  products,
  periodLabel,
  dateInPeriod,
  gstTaxSummary,
  purchaseStats,
}) => {
  const { expenses, addExpense, deleteExpense, salesmen, trips } = useLedger();
  const { pnl } = useSalesMarginPnl({
    filteredBills,
    products,
    dateInPeriod,
    gstTaxSummary,
    purchaseStats,
    viewBasis: 'exGst',
  });

  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<string>('salary');
  const [amount, setAmount] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [note, setNote] = useState('');
  const [poolPct, setPoolPct] = useState('40');
  const [tripId, setTripId] = useState('');

  // Names offered when typing "Paid to": salesmen, trip drivers and anyone paid before.
  const payeeNames = useMemo(() => {
    const set = new Set<string>();
    (salesmen || []).forEach((x: any) => x?.name && set.add(String(x.name).trim()));
    (trips || []).forEach((t: any) => t?.driver && set.add(String(t.driver).trim()));
    (expenses || []).forEach((e) => e.paidTo && set.add(e.paidTo.trim()));
    return Array.from(set).filter(Boolean).sort();
  }, [salesmen, trips, expenses]);

  const recentTrips = useMemo(
    () =>
      [...(trips || [])]
        .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 60),
    [trips],
  );
  const tripLabelOf = (t: any) =>
    `Trip #${t.id} · ${String(t.date).slice(0, 10)} · ${t.vehicle || 'vehicle'}${t.driver ? ' · ' + t.driver : ''}`;

  const periodExpenses = useMemo(
    () => (expenses || []).filter((e) => dateInPeriod(String(e.date).slice(0, 10))),
    [expenses, dateInPeriod],
  );
  const credits = pnl.supplierCredits;
  const np = useMemo(
    () =>
      computeNetProfit({
        // operatingGrossProfit already includes write-offs and supplier scheme credits (shared engine)
        grossProfitAfterLosses: pnl.operatingGrossProfit,
        expenses: periodExpenses,
      }),
    [pnl.operatingGrossProfit, periodExpenses],
  );
  const pool = salaryPool(np.profitBeforePay, Number(poolPct), np.payPaid);

  const paidByPerson = useMemo(() => {
    const m = new Map<string, number>();
    periodExpenses
      .filter((e) => PAY_CATEGORIES.includes(e.category))
      .forEach((e) => {
        const k = (e.paidTo || 'Unnamed').trim() || 'Unnamed';
        m.set(k, (m.get(k) || 0) + (Number(e.amount) || 0));
      });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [periodExpenses]);

  const submit = () => {
    const amt = Number(amount);
    if (!(amt > 0)) return;
    const trip = (trips || []).find((t: any) => String(t.id) === tripId);
    addExpense({
      date,
      category,
      amount: amt,
      paidTo: paidTo.trim() || undefined,
      note: note.trim(),
      tripId: trip ? Number((trip as any).id) : undefined,
      tripLabel: trip ? tripLabelOf(trip) : undefined,
    });
    setAmount('');
    setNote('');
    setTripId('');
  };

  const cashShort = pnl.outstanding > 0;

  const rs = (n: number) => `₹${money(n)}`;
  const runningCosts = Math.max(0, pnl.operatingGrossProfit - np.profitBeforePay);
  const netNeg = np.netProfit < 0;

  const workedOut: [string, number][] = [
    ['Sales revenue (ex-GST)', pnl.taxableSalesNet],
    ['Cost of cases delivered', -pnl.cogs],
    ['Stock written off / given free (net of supplier credit)', -pnl.writeOffNet],
    ...(credits > 0 ? ([['Supplier scheme credits received', credits]] as [string, number][]) : []),
    ['Gross profit', pnl.operatingGrossProfit],
    ...CATS_ORDER.filter((c) => !PAY_CATEGORIES.includes(c) && np.byCategory[c] > 0).map((c) => [EXPENSE_LABELS[c], -np.byCategory[c]] as [string, number]),
    ['Profit available for pay', np.profitBeforePay],
    ...PAY_CATEGORIES.filter((c) => np.byCategory[c] > 0).map((c) => [`${EXPENSE_LABELS[c]} already paid`, -np.byCategory[c]] as [string, number]),
    ['Net profit', np.netProfit],
  ];
  const sortedExpenses = [...periodExpenses].sort((a: BusinessExpenseRecord, b: BusinessExpenseRecord) => b.date.localeCompare(a.date));

  const exportExcel = () =>
    downloadXlsx(`net-profit-${fileStamp()}.xlsx`, [
      { name: 'Net profit', header: ['Item', 'Amount'], rows: workedOut.map(([l, v]) => [l, Number(v.toFixed(2))]) },
      {
        name: 'Expenses',
        header: ['Date', 'Type', 'Paid to', 'Trip / note', 'Amount'],
        rows: sortedExpenses.map((e) => [e.date, EXPENSE_LABELS[e.category] || e.category, e.paidTo || '', [e.tripLabel, e.note].filter(Boolean).join(' — '), e.amount]),
        total: ['Total', '', '', '', sortedExpenses.reduce((t, e) => t + (Number(e.amount) || 0), 0)],
      },
    ]);
  const exportPdf = () =>
    downloadPdf({
      filename: `net-profit-${fileStamp()}.pdf`,
      title: 'Net profit',
      subtitle: ['MrWater Distribution', `Period: ${periodLabel}`],
      sections: [
        { header: ['Item', 'Amount (Rs.)'], rows: workedOut.map(([l, v]) => [l, `${v < 0 ? '-' : ''}${money(Math.abs(v))}`]), rightAlign: [1] },
        {
          title: 'Expenses',
          header: ['Date', 'Type', 'Paid to', 'Amount (Rs.)'],
          rows: sortedExpenses.map((e) => [e.date, EXPENSE_LABELS[e.category] || e.category, e.paidTo || '-', money(e.amount)]),
          rightAlign: [3],
        },
      ],
    });

  return (
    <div className="space-y-3" id="report-net-profit">
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3">
        <PhoneHeader title="Net profit" sub="Gross margin minus operating expenses" />
        <HeroCard tone={netNeg ? 'red' : 'profit'} label="Net profit" value={rs(np.netProfit)} negative={netNeg}>
          <SplitBar
            label="Running costs, pay and net profit"
            parts={[
              { value: runningCosts, className: 'bg-amber-300' },
              { value: np.payPaid, className: 'bg-sky-300' },
              { value: Math.max(0, np.netProfit), className: 'bg-emerald-300' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/90">
            <LegendDot dot="bg-amber-300">Costs {rs(runningCosts)}</LegendDot>
            <LegendDot dot="bg-sky-300">Pay {rs(np.payPaid)}</LegendDot>
          </div>
        </HeroCard>
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Gross profit" value={rs(pnl.operatingGrossProfit)} tone={pnl.operatingGrossProfit < 0 ? 'red' : 'profit'} />
          <MiniStat label="For pay" value={rs(np.profitBeforePay)} tone={np.profitBeforePay < 0 ? 'red' : 'ink'} />
          <MiniStat label="Pay given" value={rs(np.payPaid)} tone="amber" />
        </div>
        <p className="px-1 text-xs text-slate-500">After stock costs, write-offs, running costs and pay already given. GST collected is not profit.</p>
      </div>

      {/* ======================= TABLET / DESKTOP ======================= */}
      <div className="hidden md:block space-y-3">
        <ReportTitleBar
          title="Net profit"
          sub={`${periodLabel} · after stock costs, write-offs, running costs and pay already given`}
          actions={<ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} reportTitle="Net profit" />}
        />
        <ReportStatGrid>
          <ReportStat label="Gross profit" value={rs(pnl.operatingGrossProfit)} tone={pnl.operatingGrossProfit < 0 ? 'red' : 'ink'} sub="after write-offs and credits" />
          <ReportStat label="Running costs" value={rs(runningCosts)} tone="amber" sub="fuel, rent, toll, repairs…" />
          <ReportStat label="Pay already given" value={rs(np.payPaid)} tone="sky" sub="salary, driver, commission" />
          <ReportStat label="Net profit" value={rs(np.netProfit)} tone={netNeg ? 'red' : 'green'} sub="what is really left" />
        </ReportStatGrid>
        <ReportBreakdownLine>GST collected is not profit and is left out of every figure here.</ReportBreakdownLine>
      </div>

      <Panel title="How it is worked out">
        <Row label="Sales revenue (ex-GST)" value={pnl.taxableSalesNet} hint="Bill value with GST taken out, less returns" />
        <Row
          label="Cost of cases delivered"
          value={pnl.cogs}
          sign="minus"
          hint={`Purchase cost of every case, free scheme cases included${
            pnl.inwardInCogs > 0 ? ` · includes ₹${money(pnl.inwardInCogs)} inward freight / labour` : ''
          }`}
        />
        <Row label="Stock written off / given free (net of supplier credit)" value={pnl.writeOffNet} sign="minus" hint="From the Returns, Free & Claims screen" />
        {credits > 0 && <Row label="Supplier scheme credits received" value={credits} sign="plus" />}
        <Row label="Gross profit" value={pnl.operatingGrossProfit} bold hint="Same figure as Reports > Margin P&L and Business reports > Profit & loss" />
        {CATS_ORDER.filter((c) => !PAY_CATEGORIES.includes(c) && np.byCategory[c] > 0).map((c) => (
          <Row key={c} label={EXPENSE_LABELS[c]} value={np.byCategory[c]} sign="minus" />
        ))}
        <Row label="Profit available for pay" value={np.profitBeforePay} bold hint="Gross profit − running costs (fuel, rent ...)" />
        {PAY_CATEGORIES.filter((c) => np.byCategory[c] > 0).map((c) => (
          <Row key={c} label={`${EXPENSE_LABELS[c]} already paid`} value={np.byCategory[c]} sign="minus" />
        ))}
        <Row label="Net profit" value={np.netProfit} bold />
      </Panel>

      {(() => {
        const c = pnl.costChecks;
        const items: { tone: 'bad' | 'warn' | 'info'; text: string }[] = [];
        if (c.zeroCostLines > 0)
          items.push({
            tone: 'bad',
            text: `${c.zeroCostLines} sale line(s) (${c.zeroCostCases} cases) have NO purchase cost, so their profit is shown as 100% of the sale. Products: ${c.zeroCostProducts
              .slice(0, 6)
              .join(', ')}${c.zeroCostProducts.length > 6 ? '…' : ''}. Set a cost on these products.`,
          });
        if (c.estimatedCostLines > 0)
          items.push({
            tone: 'warn',
            text: `${c.estimatedCostLines} sale line(s) in ${c.billsWithEstimatedCost} bill(s) (${c.estimatedCostCases} cases) have no saved batch cost, so today's average product cost was used. Profit on old bills may differ from what it really was.`,
          });
        if (periodExpenses.length === 0)
          items.push({
            tone: 'warn',
            text: 'No expenses are recorded for this period. Fuel, driver and salesman pay, rent, toll and repairs only count once they are added below, so profit is likely too high.',
          });
        else if (np.payPaid === 0)
          items.push({
            tone: 'warn',
            text: 'Expenses exist but no salary / driver / commission is recorded. Add pay paid in this period, or net profit is overstated.',
          });
        if (pnl.outstanding > 0)
          items.push({
            tone: 'info',
            text: `Customers still owe ₹${money(pnl.outstanding)} on this period's bills. That is counted as profit. If some will never be paid, add it as "Bad debt" below.`,
          });
        if (credits > 0)
          items.push({
            tone: 'info',
            text: `Scheme credits of ₹${money(credits)} are counted exactly as entered. They must be the amount WITHOUT GST, or GST is being counted as profit.`,
          });
        if (pnl.inwardInCogs > 0)
          items.push({
            tone: 'info',
            text: `Inward freight / labour of ₹${money(pnl.inwardInCogs)} from your GRNs is included in the cost of cases. Do not add the same cost again as an expense.`,
          });
        if (items.length === 0)
          items.push({ tone: 'info', text: 'No gaps found for this period: every sold case has a cost and expenses are recorded.' });
        return (
          <Panel title="Check my numbers">
           <div className="p-3 space-y-2">
            {items.map((it, i) => (
              <div
                key={i}
                className={`text-xs rounded-lg px-3 py-2 border ${
                  it.tone === 'bad'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : it.tone === 'warn'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {it.text}
              </div>
            ))}
           </div>
          </Panel>
        );
      })()}

      <Panel title="Salary budget" tone="amber">
        <div className="flex flex-wrap items-center gap-2 text-sm px-3.5 py-3">
          <span>Share of available profit for pay:</span>
          <input
            type="number" inputMode="decimal"
            min={0}
            max={100}
            value={poolPct}
            onChange={(e) => setPoolPct(e.target.value)}
            className="w-20 border border-slate-300 rounded-lg px-2 py-1 font-mono"
          />
          <span>%</span>
          {[25, 30, 40, 50].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPoolPct(String(p))}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                String(p) === poolPct ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              {p}%
            </button>
          ))}
        </div>
        <Row label="Pay budget for this period" value={pool.pool} />
        <Row label="Already paid (salary + commission)" value={np.payPaid} sign="minus" />
        <Row
          label={pool.remaining >= 0 ? 'Still available to pay' : 'Paid more than the budget'}
          value={Math.abs(pool.remaining)}
          bold
        />
        {np.profitBeforePay <= 0 && (
          <div className="px-3.5 py-2.5 text-xs font-bold text-rose-700">
            There is no profit available for pay in this period, so the budget is ₹0.
          </div>
        )}
        {cashShort && (
          <div className="px-3.5 py-2.5 text-xs text-amber-900">
            Profit counts sales you have billed. Customers still owe ₹{money(pnl.outstanding)} of this period's bills
            and you have collected ₹{money(pnl.collected)}. Pay out of cash you actually hold.
          </div>
        )}
        {paidByPerson.length > 0 && (
          <div className="px-3.5 py-2.5 text-xs text-slate-700">
            <div className="font-bold mb-1">Paid so far</div>
            {paidByPerson.map(([name, amt]) => (
              <div key={name} className="flex justify-between border-t border-amber-200/70 py-1">
                <span>{name}</span>
                <span className="font-mono">₹{money(amt)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Add an expense">
       <div className="p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5">
            {CATS_ORDER.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_LABELS[c]}
              </option>
            ))}
          </select>
          <input type="number" inputMode="decimal" min={0} placeholder="Amount ₹" value={amount} onChange={(e) => setAmount(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 font-mono" />
          <input list="np-payees" placeholder="Paid to (name)" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5" />
          <datalist id="np-payees">
            {payeeNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <select value={tripId} onChange={(e) => setTripId(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 col-span-2 md:col-span-1">
            <option value="">Trip (optional)</option>
            {recentTrips.map((t: any) => (
              <option key={t.id} value={String(t.id)}>
                {tripLabelOf(t)}
              </option>
            ))}
          </select>
          <input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5" />
        </div>
        <button type="button" onClick={submit} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold cursor-pointer">
          Save expense
        </button>

        <div className="md:hidden space-y-3" id="expense-cards">
          {periodExpenses.length === 0 ? (
            <div className="py-3 text-center text-sm text-slate-500">No expenses recorded for this period yet.</div>
          ) : (
            [...periodExpenses]
              .sort((a: BusinessExpenseRecord, b: BusinessExpenseRecord) => b.date.localeCompare(a.date))
              .map((e) => (
                <RegisterCard
                  key={e.id}
                  title={EXPENSE_LABELS[e.category] || e.category}
                  subtitle={
                    <>
                      <div className="font-mono">{e.date}</div>
                      <div className="text-slate-500">
                        {e.paidTo ? `Paid to ${e.paidTo}` : ''}
                        {e.paidTo && [e.tripLabel, e.note].filter(Boolean).length ? ' · ' : ''}
                        {[e.tripLabel, e.note].filter(Boolean).join(' — ')}
                      </div>
                    </>
                  }
                  heroLabel="Amount"
                  hero={`₹${money(e.amount)}`}
                  heroTone="amber"
                  actions={
                    <button
                      type="button"
                      onClick={() => {
                        const reason = window.prompt(
                          `Delete this ₹${money(e.amount)} ${EXPENSE_LABELS[e.category] || e.category} entry?\nWrite the reason (kept in the audit log):`,
                        );
                        if (reason === null) return;
                        deleteExpense(e.id, reason.trim() || undefined);
                      }}
                      className="min-h-[44px] px-4 rounded-xl border border-rose-200 bg-rose-50 text-[13px] font-bold text-rose-700 cursor-pointer"
                    >
                      Delete
                    </button>
                  }
                />
              ))
          )}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-black/5">
                <th className="py-1.5 pr-3 whitespace-nowrap">Date</th>
                <th className="py-1 pr-3 whitespace-nowrap">Type</th>
                <th className="py-1 pr-3 whitespace-nowrap">Paid to</th>
                <th className="py-1 pr-3 whitespace-nowrap">Note</th>
                <th className="py-1 pr-3 text-right whitespace-nowrap">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...periodExpenses]
                .sort((a: BusinessExpenseRecord, b: BusinessExpenseRecord) => b.date.localeCompare(a.date))
                .map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-1 pr-3 font-mono">{e.date}</td>
                    <td className="py-1 pr-3">{EXPENSE_LABELS[e.category] || e.category}</td>
                    <td className="py-1 pr-3">{e.paidTo || '—'}</td>
                    <td className="py-1 pr-3 text-slate-500">{[e.tripLabel, e.note].filter(Boolean).join(' — ')}</td>
                    <td className="py-1 pr-3 text-right font-mono">₹{money(e.amount)}</td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt(
                            `Delete this ₹${money(e.amount)} ${EXPENSE_LABELS[e.category] || e.category} entry?\nWrite the reason (kept in the audit log):`,
                          );
                          if (reason === null) return;
                          deleteExpense(e.id, reason.trim() || undefined);
                        }}
                        className="text-rose-700 font-bold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              {periodExpenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-center text-slate-500">
                    No expenses recorded for this period yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
       </div>
      </Panel>

      <PhoneDownloadBar onExcel={exportExcel} onPdf={exportPdf} />
    </div>
  );
};
