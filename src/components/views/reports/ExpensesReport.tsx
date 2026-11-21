import React, { useMemo, useState } from 'react';
import { Fuel, IndianRupee, Receipt, Wrench } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { money } from '../../../utils/billing';
import { EXPENSE_LABELS, PAY_CATEGORIES } from '../../../utils/netProfit';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import {
  ReportChipGroup,
  ReportEmpty,
  ReportList,
  ReportListMeta,
  ReportRow,
  ReportStat,
  ReportStatGrid,
  ReportTitleBar,
  reportCard,
} from './ReportKit';
import { MobileReportTopBar } from './mobile/MobileReportContext';
import { PhoneDownloadBar } from './mobile/PhoneKit';

type View = 'category' | 'entries';
const rs = (n: number) => `₹${money(n)}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const compactRs = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sign}₹${money(abs)}`;
};

const categoryIcon = (key: string) => {
  if (key === 'fuel') return <Fuel size={16} />;
  if (key === 'repair' || key === 'maintenance') return <Wrench size={16} />;
  if (PAY_CATEGORIES.includes(key)) return <IndianRupee size={16} />;
  return <Receipt size={16} />;
};

export interface ExpensesReportProps {
  periodLabel: string;
  dateInPeriod: (date: string) => boolean;
}

/** What the business spent in the period, by category. The same entries feed the Profit & Loss. */
export const ExpensesReport: React.FC<ExpensesReportProps> = ({ periodLabel, dateInPeriod }) => {
  const { expenses } = useLedger();
  const [view, setView] = useState<View>('category');

  const list = useMemo(
    () =>
      (expenses || [])
        .filter((e) => dateInPeriod(String(e.date || '').slice(0, 10)) && (Number(e.amount) || 0) > 0)
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [expenses, dateInPeriod],
  );

  const byCategory = useMemo(() => {
    const m = new Map<string, { key: string; label: string; amount: number; count: number }>();
    for (const e of list) {
      const key = e.category || 'misc';
      const cur = m.get(key) || { key, label: EXPENSE_LABELS[key] || key, amount: 0, count: 0 };
      cur.amount += Number(e.amount) || 0;
      cur.count += 1;
      m.set(key, cur);
    }
    return Array.from(m.values())
      .map((r) => ({ ...r, amount: round2(r.amount) }))
      .sort((a, b) => b.amount - a.amount);
  }, [list]);

  const total = round2(list.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const pay = round2(
    list.filter((e) => PAY_CATEGORIES.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0),
  );
  const running = round2(total - pay);
  const maxCatAmount = byCategory.length > 0 ? Math.max(1, byCategory[0].amount) : 1;

  const exportExcel = () =>
    downloadXlsx(`expenses-${fileStamp()}.xlsx`, [
      {
        name: 'By category',
        header: ['Category', 'Entries', 'Amount'],
        rows: byCategory.map((r) => [r.label, r.count, r.amount]),
        total: ['Total', list.length, total],
      },
      {
        name: 'Entries',
        header: ['Date', 'Category', 'Paid to', 'Note', 'Amount'],
        rows: list.map((e) => [
          String(e.date).slice(0, 10),
          EXPENSE_LABELS[e.category] || e.category,
          e.paidTo || '',
          e.note || '',
          Number(e.amount) || 0,
        ]),
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `expenses-${fileStamp()}.pdf`,
      title: 'Expenses',
      subtitle: [`Period: ${periodLabel}`],
      sections: [
        {
          title: 'By category',
          header: ['Category', 'Entries', 'Amount (Rs.)'],
          rows: byCategory.map((r) => [r.label, r.count, money(r.amount)]),
          total: ['Total', list.length, money(total)],
          rightAlign: [1, 2],
        },
      ],
    });

  const shareProps = {
    reportTitle: 'Expenses',
    summaryMetrics: [
      { label: 'Total spent', value: rs(total) },
      { label: 'Running costs', value: rs(running) },
      { label: 'Pay to people', value: rs(pay) },
    ],
    sheets: [
      {
        name: 'By category',
        header: ['Category', 'Entries', 'Amount'],
        rows: byCategory.map((r) => [r.label, r.count, r.amount]),
      },
    ],
    pdfSections: [
      {
        title: 'By category',
        header: ['Category', 'Entries', 'Amount (Rs.)'],
        rows: byCategory.map((r) => [r.label, r.count, money(r.amount)]),
        rightAlign: [1, 2],
      },
    ],
  };

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-expenses-phone">
        <MobileReportTopBar
          title="Expenses"
          sub="By category"
          showPeriod
          shareProps={shareProps}
        />

        {/* Total spent card */}
        <section className="rt-rep-card rt-rep-pad">
          <div className="text-[12px] font-medium text-[var(--text-2)]">Total spent</div>
          <div className="text-[26px] font-extrabold text-[var(--text)] tracking-tight leading-tight tabular-nums mt-0.5">
            {rs(total)}
          </div>
          <div className="text-[11.5px] text-[var(--text-2)] mt-1 tabular-nums">
            {list.length} {list.length === 1 ? 'entry' : 'entries'} · Running {compactRs(running)} · Pay {compactRs(pay)}
          </div>
        </section>

        {/* View switcher chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {([
            { id: 'category', label: 'By category' },
            { id: 'entries', label: 'All entries' },
          ] as { id: View; label: string }[]).map((opt) => {
            const active = view === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setView(opt.id)}
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

        {list.length === 0 ? (
          <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
            No expenses recorded in this period.
          </div>
        ) : view === 'category' ? (
          <>
            {/* Horizontal bar chart card */}
            <section className="rt-rep-card rt-rep-pad space-y-2.5">
              <div className="text-[13px] font-bold text-[var(--text)]">By category</div>
              <div className="space-y-2">
                {byCategory.slice(0, 5).map((r) => {
                  const pct = Math.max(6, Math.round((r.amount / maxCatAmount) * 100));
                  return (
                    <div key={r.key} className="grid grid-cols-[78px_1fr_54px] items-center gap-2.5 text-[11.5px]">
                      <span className="font-semibold text-[var(--text)] truncate">{r.label}</span>
                      <div className="rt-hbar-track">
                        <div className="rt-hbar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-right font-bold text-[var(--text)] tabular-nums">
                        {compactRs(r.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Category list card */}
            <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
              {byCategory.map((r) => (
                <div key={r.key} className="px-3.5 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#f1f5f9] text-[var(--text-2)] flex items-center justify-center shrink-0">
                    {categoryIcon(r.key)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug">{r.label}</div>
                    <div className="text-[11.5px] text-[var(--text-2)] mt-0.5">
                      {r.count} {r.count === 1 ? 'entry' : 'entries'}
                    </div>
                  </div>
                  <div className="text-right shrink-0 text-[13.5px] font-extrabold text-[var(--text)] tabular-nums">
                    {rs(r.amount)}
                  </div>
                </div>
              ))}
            </section>
          </>
        ) : (
          <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
            {list.map((e) => (
              <div key={e.id} className="px-3.5 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#f1f5f9] text-[var(--text-2)] flex items-center justify-center shrink-0">
                  {categoryIcon(e.category || 'misc')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug">
                    {EXPENSE_LABELS[e.category] || e.category}
                  </div>
                  <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 break-words">
                    {[String(e.date).slice(0, 10), e.paidTo, e.note].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="text-right shrink-0 text-[13.5px] font-extrabold text-[var(--due)] tabular-nums">
                  {rs(Number(e.amount) || 0)}
                </div>
              </div>
            ))}
          </section>
        )}

        <PhoneDownloadBar onExcel={exportExcel} onPdf={exportPdf} disabled={list.length === 0} />
      </div>

      {/* ======================= TABLET / DESKTOP ======================= */}
      <div className="hidden md:block space-y-3" id="report-expenses">
        <ReportTitleBar
          title="Expenses"
          sub={`${periodLabel} · ${list.length} entr${list.length === 1 ? 'y' : 'ies'}`}
          actions={<ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} reportTitle="Expenses" disabled={list.length === 0} />}
        />
        <ReportStatGrid cols={3}>
          <ReportStat label="Total spent" value={rs(total)} tone="red" />
          <ReportStat label="Running costs" value={rs(running)} sub="fuel, rent, repairs…" />
          <ReportStat label="Pay to people" value={rs(pay)} tone="sky" sub="salary, driver, commission" />
        </ReportStatGrid>

        <ReportChipGroup<View>
          label="View"
          options={[{ id: 'category', label: 'By category' }, { id: 'entries', label: 'All entries' }]}
          value={view}
          onChange={setView}
        />

        {list.length === 0 ? (
          <ReportEmpty>No expenses recorded in this period.</ReportEmpty>
        ) : view === 'category' ? (
          <section className={`${reportCard} overflow-hidden`}>
            <ReportList>
              {byCategory.map((r) => (
                <ReportRow
                  key={r.key}
                  title={r.label}
                  sub={`${r.count} entr${r.count === 1 ? 'y' : 'ies'}${total > 0 ? ` · ${Math.round((r.amount / total) * 100)}% of spending` : ''}`}
                  amount={rs(r.amount)}
                  amountTone="red"
                />
              ))}
            </ReportList>
          </section>
        ) : (
          <>
            <ReportListMeta>{list.length} entries, newest first</ReportListMeta>
            <section className={`${reportCard} overflow-hidden`}>
              <ReportList>
                {list.map((e) => (
                  <ReportRow
                    key={e.id}
                    title={EXPENSE_LABELS[e.category] || e.category}
                    sub={[String(e.date).slice(0, 10), e.paidTo, e.note].filter(Boolean).join(' · ')}
                    amount={rs(Number(e.amount) || 0)}
                    amountTone="red"
                  />
                ))}
              </ReportList>
            </section>
          </>
        )}
      </div>
    </>
  );
};
