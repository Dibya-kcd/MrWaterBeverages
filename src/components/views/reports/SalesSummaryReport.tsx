import React, { useCallback, useMemo, useState } from 'react';
import { Bill } from '../../../types';
import { useLedger } from '../../../context/LedgerContext';
import { money, resolveProductGstRate } from '../../../utils/billing';
import { billTaxBasis } from '../../../utils/billTaxBasis';
import { totalDueOf } from '../../../utils/dueSummary';
import { buildSalesSummary, type SalesGroupRow } from '../../../utils/salesSummary';
import { resolveTaxRegime, noOutputTax } from '../../../tax/appRegime';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
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
  const { products, orgProfile, salesmen, existingCustomers, bills } = useLedger();
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [search, setSearch] = useState('');

  const productMap = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);

  // Same revenue / GST rule as the Profit & Loss (utils/billTaxBasis.ts).
  const taxBasisOf = useCallback(
    (b: Bill) => {
      const carve = !noOutputTax(resolveTaxRegime(orgProfile, String(b.date || '').slice(0, 10)));
      return billTaxBasis(b, {
        carveGstFromPrices: carve,
        rateFor: (item) =>
          item.gst !== undefined && item.gst !== null
            ? (item.gst as number)
            : resolveProductGstRate(productMap.get(item.productId), item.category),
      });
    },
    [orgProfile, productMap],
  );

  const summary = useMemo(
    () => buildSalesSummary({ bills: filteredBills, salesmen, taxBasisOf }),
    [filteredBills, salesmen, taxBasisOf],
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
      subtitle: [`Period: ${periodLabel}`],
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

  return (
    <div className="space-y-3" id="report-sales">
      <ReportTitleBar
        title="Sales"
        sub={`${periodLabel} · ${t.bills} bill${t.bills === 1 ? '' : 's'}`}
        actions={<ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} reportTitle="Sales" disabled={t.bills === 0} />}
      />

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
  );
};
