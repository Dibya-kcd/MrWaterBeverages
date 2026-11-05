import React, { useMemo, useState } from 'react';
import { useLedger } from '../../../context/LedgerContext';
import { useBeats } from '../../../hooks/useBeats';
import { money } from '../../../utils/billing';
import { todayISO } from '../../../utils/dateLocal';
import { buildDueInvoices, buildReceiptRegister, OVERDUE_AFTER_DAYS } from '../../../utils/beatReports';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { fmtShort, MODE_LABEL, ShowMore } from './reportUi';
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

interface Props {
  periodLabel: string;
  inPeriod: (date: string) => boolean;
}

const PAGE = 100;

/**
 * Total receipts: every receipt in the period ("Paid") or every invoice that still has money to collect ("Due").
 * The download button always downloads the list that is on screen.
 */
export const TotalReceiptsReport: React.FC<Props> = ({ periodLabel, inPeriod }) => {
  const { bills, payments, customers, existingCustomers, orgProfile } = useLedger();
  const { beats, activeBeats } = useBeats();
  const [mode, setMode] = useState<'paid' | 'due'>('paid');
  const [beat, setBeat] = useState('all');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE);

  const shop = orgProfile?.name || 'MrWater Distribution';
  const beatLabel = beat === 'all' ? 'All beats' : beat === 'none' ? 'No beat yet' : beats.find((b) => b.id === beat)?.name || 'Beat';
  const today = todayISO();

  const reg = useMemo(
    () =>
      buildReceiptRegister({
        bills: bills || [],
        payments: payments || [],
        customers: customers || [],
        existingCustomers: existingCustomers || [],
        beats,
        inPeriod,
        beatFilter: beat,
        search,
      }),
    [bills, payments, customers, existingCustomers, beats, inPeriod, beat, search],
  );
  const paidRows = useMemo(
    () => [...reg.rows].sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount),
    [reg.rows],
  );

  const due = useMemo(
    () => buildDueInvoices({ bills: bills || [], payments: payments || [], customers: customers || [], beats, today, beatFilter: beat, search }),
    [bills, payments, customers, beats, today, beat, search],
  );
  const overdue = useMemo(
    () => due.rows.filter((r) => r.ageDays > OVERDUE_AFTER_DAYS).reduce((s, r) => s + r.balance, 0),
    [due.rows],
  );

  const exportExcel = () => {
    if (mode === 'paid') {
      return downloadXlsx(`total-receipts-paid-${fileStamp()}.xlsx`, [
        {
          name: 'Paid receipts',
          header: ['Date', 'Receipt no', 'Customer', 'Beat', 'Mode', 'Invoice', 'Amount received', 'Reference'],
          rows: paidRows.map((r) => [r.date, r.receiptNo, r.customerName, r.beatName, MODE_LABEL[r.mode] || r.mode, r.invoiceLabel, r.amount, r.note]),
          total: ['Total', '', '', '', '', '', reg.total, ''],
        },
      ]);
    }
    return downloadXlsx(`total-receipts-due-${fileStamp()}.xlsx`, [
      {
        name: 'Due invoices',
        header: ['Invoice', 'Date', 'Customer', 'Phone', 'Beat', 'Invoice total', 'Paid', 'Balance due', 'Age (days)'],
        rows: due.rows.map((r) => [r.invoiceNo, r.date, r.customerName, r.phone, r.beatName, r.total, r.paid, r.balance, r.ageDays]),
        total: ['Total', '', '', '', '', '', '', due.total, ''],
      },
    ]);
  };

  const exportPdf = () => {
    if (mode === 'paid') {
      return downloadPdf({
        filename: `total-receipts-paid-${fileStamp()}.pdf`,
        title: 'Total receipts - paid',
        subtitle: [shop, `Period: ${periodLabel}`, `Beat: ${beatLabel}`],
        landscape: true,
        sections: [
          {
            header: ['Date', 'Receipt', 'Customer', 'Beat', 'Mode', 'Invoice', 'Received (Rs.)'],
            rows: paidRows.map((r) => [r.date, r.receiptNo, r.customerName, r.beatName, MODE_LABEL[r.mode] || r.mode, r.invoiceLabel || '-', money(r.amount)]),
            total: ['Total', '', '', '', '', '', money(reg.total)],
            rightAlign: [6],
          },
        ],
      });
    }
    return downloadPdf({
      filename: `total-receipts-due-${fileStamp()}.pdf`,
      title: 'Total receipts - due invoices',
      subtitle: [shop, `Due as on ${today}`, `Beat: ${beatLabel}`],
      landscape: true,
      sections: [
        {
          header: ['Invoice', 'Date', 'Customer', 'Beat', 'Invoice total (Rs.)', 'Paid (Rs.)', 'Balance due (Rs.)', 'Age (days)'],
          rows: due.rows.map((r) => [r.invoiceNo, r.date, r.customerName, r.beatName, money(r.total), money(r.paid), money(r.balance), r.ageDays]),
          total: ['Total', '', '', '', '', '', money(due.total), ''],
          rightAlign: [4, 5, 6, 7],
        },
      ],
    });
  };

  const empty = mode === 'paid' ? paidRows.length === 0 : due.rows.length === 0;
  const reset = (fn: () => void) => {
    fn();
    setVisible(PAGE);
  };

  const isFiltered = beat !== 'all' || search.trim().length > 0;
  const resetFilters = () => reset(() => {
    setBeat('all');
    setSearch('');
  });
  const modeOptions: { id: 'paid' | 'due'; label: string }[] = [
    { id: 'paid', label: `Paid ${reg.count}` },
    { id: 'due', label: `Due ${due.rows.length}` },
  ];
  const beatOptions = [
    { id: 'all', label: 'All beats' },
    ...activeBeats.map((b) => ({ id: b.id, label: b.name })),
    { id: 'none', label: 'No beat yet' },
  ];
  const shownCount = mode === 'paid' ? paidRows.length : due.rows.length;

  return (
    <div className="space-y-3" id="report-total-receipts">
      <ReportTitleBar
        title="Total receipts"
        sub={mode === 'paid' ? `${periodLabel} · every receipt taken` : `Due as on today · ${due.rows.length} invoice${due.rows.length === 1 ? '' : 's'} to collect`}
        actions={<ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={empty} reportTitle="Total receipts" />}
      />

      {mode === 'paid' ? (
        <ReportStatGrid cols={2}>
          <ReportStat label="Received" value={`₹${money(reg.total)}`} tone="green" sub={`${reg.count} receipt${reg.count === 1 ? '' : 's'}`} />
          <ReportStat label="Cash" value={`₹${money(reg.cash)}`} sub={`UPI / other ₹${money(reg.other)}`} />
        </ReportStatGrid>
      ) : (
        <ReportStatGrid cols={2}>
          <ReportStat label="Total due" value={`₹${money(due.total)}`} tone="red" sub={`${due.rows.length} invoice${due.rows.length === 1 ? '' : 's'}`} />
          <ReportStat label={`Overdue > ${OVERDUE_AFTER_DAYS} days`} value={`₹${money(overdue)}`} tone="amber" sub="part of the due" />
        </ReportStatGrid>
      )}
      <ReportBreakdownLine>
        {mode === 'paid'
          ? `Cash ₹${money(reg.cash)} · UPI / bank / other ₹${money(reg.other)}`
          : `${beatLabel} · oldest invoices are listed by age`}
      </ReportBreakdownLine>

      <ReportFilterPanel
        search={{ value: search, onChange: (v) => reset(() => setSearch(v)), placeholder: mode === 'paid' ? 'Search customer or receipt' : 'Search customer or invoice' }}
        isFiltered={isFiltered}
        onReset={resetFilters}
      >
        <ReportChipGroup<'paid' | 'due'> label="Show" options={modeOptions} value={mode} onChange={(m) => reset(() => setMode(m))} />
        {activeBeats.length > 0 && (
          <ReportChipGroup<string> label="Beat" options={beatOptions} value={beat} onChange={(v) => reset(() => setBeat(v))} />
        )}
      </ReportFilterPanel>

      {!empty && (
        <ReportListMeta>
          {Math.min(visible, shownCount)} of {shownCount} {mode === 'paid' ? 'receipt' : 'invoice'}
          {shownCount === 1 ? '' : 's'}
          {isFiltered ? ' match' : ''}
        </ReportListMeta>
      )}

      {empty && <ReportEmpty>{mode === 'paid' ? 'No receipts in this period' : 'No outstanding invoices'}</ReportEmpty>}

      {mode === 'paid' && paidRows.length > 0 && (
        <section className={`${reportCard} overflow-hidden`}>
          <ReportList>
            {paidRows.slice(0, visible).map((r) => (
              <ReportRow
                key={r.key}
                title={r.customerName}
                sub={`${fmtShort(r.date)} · ${r.receiptNo} · ${MODE_LABEL[r.mode] || r.mode}${
                  r.kind === 'advance' ? ' · On account' : r.invoiceLabel ? ` · ${r.invoiceLabel}` : ''
                }`}
                amount={`₹${money(r.amount)}`}
                amountTone="green"
              />
            ))}
          </ReportList>
        </section>
      )}

      {mode === 'due' && due.rows.length > 0 && (
        <section className={`${reportCard} overflow-hidden`}>
          <ReportList>
            {due.rows.slice(0, visible).map((r) => (
              <ReportRow
                key={r.billId}
                title={r.customerName}
                sub={`${r.invoiceNo} · ${fmtShort(r.date)} · Total ₹${money(r.total)}${r.paid > 0 ? ` · Paid ₹${money(r.paid)}` : ''}`}
                amount={`₹${money(r.balance)}`}
                amountTone="red"
                status={r.ageDays > OVERDUE_AFTER_DAYS ? `Overdue ${r.ageDays}d` : r.ageDays === 0 ? 'Today' : `${r.ageDays}d old`}
                statusTone={r.ageDays > OVERDUE_AFTER_DAYS ? 'red' : 'amber'}
              />
            ))}
          </ReportList>
        </section>
      )}

      <ShowMore shown={visible} total={shownCount} onMore={() => setVisible((v) => v + PAGE)} />
    </div>
  );
};
