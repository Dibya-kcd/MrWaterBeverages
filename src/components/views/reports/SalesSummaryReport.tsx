import React, { useCallback, useMemo, useState } from 'react';
import { Split } from 'lucide-react';
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

  return (
    <div className="space-y-3" id="report-sales">
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
    </div>
  );
};
