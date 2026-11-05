import React, { useMemo, useState } from 'react';
import { useLedger } from '../../../context/LedgerContext';
import { useBeats } from '../../../hooks/useBeats';
import { money } from '../../../utils/billing';
import { buildCustomerOverall } from '../../../utils/beatReports';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { fmtShort, ShowMore } from './reportUi';
import {
  ReportBreakdownLine,
  ReportChipGroup,
  ReportEmpty,
  ReportFilterPanel,
  ReportList,
  ReportListMeta,
  ReportRow,
  ReportStat,
  ReportStatGrid,
  ReportTitleBar,
  reportCard,
} from '../reports/ReportKit';

const PAGE = 100;

/** Customer-wise overall billed, paid and due (whole life of the customer, not one period). */
export const CustomerOverallReport: React.FC = () => {
  const { bills, payments, customers, existingCustomers, orgProfile } = useLedger();
  const { beats, activeBeats } = useBeats();
  const [beat, setBeat] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);
  const [visible, setVisible] = useState(PAGE);

  const { rows, totals } = useMemo(
    () =>
      buildCustomerOverall({
        bills: bills || [],
        payments: payments || [],
        customers: customers || [],
        existingCustomers: existingCustomers || [],
        beats,
        beatFilter: beat,
        search,
        onlyDue,
      }),
    [bills, payments, customers, existingCustomers, beats, beat, search, onlyDue],
  );

  const shop = orgProfile?.name || 'MrWater Distribution';
  const beatLabel = beat === 'all' ? 'All beats' : beat === 'none' ? 'No beat yet' : beats.find((b) => b.id === beat)?.name || 'Beat';
  const reset = (fn: () => void) => {
    fn();
    setVisible(PAGE);
  };

  const exportExcel = () =>
    downloadXlsx(`customer-wise-due-paid-${fileStamp()}.xlsx`, [
      {
        name: 'Customer-wise',
        header: ['Customer', 'Phone', 'Beat', 'Bills', 'Total billed', 'Total paid', 'Due remaining', 'Advance held', 'Last receipt'],
        rows: rows.map((r) => [r.name, r.phone, r.beatName, r.bills, r.billed, r.paid, r.due, r.advance, r.lastReceiptDate]),
        total: ['Total', '', '', '', totals.billed, totals.paid, totals.due, totals.advance, ''],
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `customer-wise-due-paid-${fileStamp()}.pdf`,
      title: 'Customer-wise billed, paid & due',
      subtitle: [shop, `As on ${fileStamp()} (all time)`, `Beat: ${beatLabel}`, onlyDue ? 'Only customers with due' : 'All customers'],
      landscape: true,
      sections: [
        {
          header: ['Customer', 'Beat', 'Bills', 'Total billed (Rs.)', 'Total paid (Rs.)', 'Due remaining (Rs.)', 'Advance (Rs.)'],
          rows: rows.map((r) => [r.name, r.beatName, r.bills, money(r.billed), money(r.paid), money(r.due), money(r.advance)]),
          total: ['Total', '', '', money(totals.billed), money(totals.paid), money(totals.due), money(totals.advance)],
          rightAlign: [2, 3, 4, 5, 6],
        },
      ],
    });

  const isFiltered = beat !== 'all' || search.trim().length > 0 || onlyDue;
  const resetFilters = () =>
    reset(() => {
      setBeat('all');
      setSearch('');
      setOnlyDue(false);
    });
  const beatOptions = [
    { id: 'all', label: 'All beats' },
    ...activeBeats.map((b) => ({ id: b.id, label: b.name })),
    { id: 'none', label: 'No beat yet' },
  ];
  const dueOptions: { id: 'all' | 'due'; label: string }[] = [
    { id: 'all', label: 'All customers' },
    { id: 'due', label: 'Owe money' },
  ];

  return (
    <div className="space-y-3" id="report-customer-overall">
      <ReportTitleBar
        title="Customer-wise due & paid"
        sub={`Overall, as of today · ${totals.customers} customer${totals.customers === 1 ? '' : 's'}`}
        actions={<ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={rows.length === 0} reportTitle="Customer-wise due and paid" />}
      />

      <ReportStatGrid>
        <ReportStat label="Total billed" value={`₹${money(totals.billed)}`} sub="all invoices" />
        <ReportStat label="Total paid" value={`₹${money(totals.paid)}`} tone="green" sub="money received" />
        <ReportStat label="Due remaining" value={`₹${money(totals.due)}`} tone="red" sub="still to collect" />
        <ReportStat label="Advance held" value={`₹${money(totals.advance)}`} tone="sky" sub="paid ahead by customers" />
      </ReportStatGrid>
      <ReportBreakdownLine>
        Billed ₹{money(totals.billed)} − Paid ₹{money(totals.paid)} = Due ₹{money(totals.due)}
      </ReportBreakdownLine>

      <ReportFilterPanel
        search={{ value: search, onChange: (v) => reset(() => setSearch(v)), placeholder: 'Search customer or phone' }}
        isFiltered={isFiltered}
        onReset={resetFilters}
      >
        <ReportChipGroup<'all' | 'due'> label="Show" options={dueOptions} value={onlyDue ? 'due' : 'all'} onChange={(v) => reset(() => setOnlyDue(v === 'due'))} />
        {activeBeats.length > 0 && (
          <ReportChipGroup<string> label="Beat" options={beatOptions} value={beat} onChange={(v) => reset(() => setBeat(v))} />
        )}
      </ReportFilterPanel>

      {rows.length > 0 && (
        <ReportListMeta>
          {Math.min(visible, rows.length)} of {rows.length} customer{rows.length === 1 ? '' : 's'}
          {isFiltered ? ' match' : ''}
        </ReportListMeta>
      )}

      {rows.length === 0 && <ReportEmpty>No customers to show</ReportEmpty>}

      {rows.length > 0 && (
        <section className={`${reportCard} overflow-hidden`}>
          <ReportList>
            {rows.slice(0, visible).map((r) => (
              <ReportRow
                key={r.key}
                title={r.name}
                sub={
                  <>
                    Billed ₹{money(r.billed)} · Paid ₹{money(r.paid)}
                    <span className="block text-[11px] text-slate-400">
                      {r.beatName}
                      {r.lastReceiptDate ? ` · last receipt ${fmtShort(r.lastReceiptDate)}` : ''}
                    </span>
                  </>
                }
                amount={r.due > 0.004 ? `₹${money(r.due)}` : undefined}
                amountTone="red"
                status={r.due > 0.004 ? 'due' : r.advance > 0.004 ? `Advance ₹${money(r.advance)}` : 'Settled'}
                statusTone={r.due > 0.004 ? 'muted' : r.advance > 0.004 ? 'sky' : 'green'}
              />
            ))}
          </ReportList>
        </section>
      )}
      <ShowMore shown={visible} total={rows.length} onMore={() => setVisible((v) => v + PAGE)} />
    </div>
  );
};
