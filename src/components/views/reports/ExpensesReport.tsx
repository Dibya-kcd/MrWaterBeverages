import React, { useMemo, useState } from 'react';
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

type View = 'category' | 'entries';
const rs = (n: number) => `₹${money(n)}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
    return Array.from(m.values()).map((r) => ({ ...r, amount: round2(r.amount) })).sort((a, b) => b.amount - a.amount);
  }, [list]);

  const total = round2(list.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const pay = round2(list.filter((e) => PAY_CATEGORIES.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const running = round2(total - pay);

  const exportExcel = () =>
    downloadXlsx(`expenses-${fileStamp()}.xlsx`, [
      { name: 'By category', header: ['Category', 'Entries', 'Amount'], rows: byCategory.map((r) => [r.label, r.count, r.amount]), total: ['Total', list.length, total] },
      {
        name: 'Entries',
        header: ['Date', 'Category', 'Paid to', 'Note', 'Amount'],
        rows: list.map((e) => [String(e.date).slice(0, 10), EXPENSE_LABELS[e.category] || e.category, e.paidTo || '', e.note || '', Number(e.amount) || 0]),
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `expenses-${fileStamp()}.pdf`,
      title: 'Expenses',
      subtitle: [`Period: ${periodLabel}`],
      sections: [
        { title: 'By category', header: ['Category', 'Entries', 'Amount (Rs.)'], rows: byCategory.map((r) => [r.label, r.count, money(r.amount)]), total: ['Total', list.length, money(total)], rightAlign: [1, 2] },
      ],
    });

  return (
    <div className="space-y-3" id="report-expenses">
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
  );
};
