import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { useBeats } from '../../../hooks/useBeats';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useLanguage } from '../../../i18n/LanguageContext';
import { money } from '../../../utils/billing';
import { todayISO } from '../../../utils/dateLocal';
import { buildDaySummary, buildDueInvoices, buildReceiptRegister, OVERDUE_AFTER_DAYS } from '../../../utils/beatReports';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { rsShort } from '../reports/mobile/PhoneKit';
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
  const isPhone = useIsMobile(767);
  const { t } = useLanguage();
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
  const upiTotal = useMemo(
    () => reg.rows.filter((r) => r.mode === 'upi').reduce((s, r) => s + r.amount, 0),
    [reg.rows],
  );
  const otherModeTotal = useMemo(
    () => reg.rows.filter((r) => r.mode !== 'cash' && r.mode !== 'upi').reduce((s, r) => s + r.amount, 0),
    [reg.rows],
  );
  const dayPreview = useMemo(
    () =>
      buildDaySummary({
        bills: bills || [],
        payments: payments || [],
        customers: customers || [],
        existingCustomers: existingCustomers || [],
        beats,
        inPeriod,
        beatFilter: beat,
      }),
    [bills, payments, customers, existingCustomers, beats, inPeriod, beat],
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
    { id: 'all', label: t('parties.allBeats', { n: '' }).trim() },
    ...activeBeats.map((b) => ({ id: b.id, label: b.name })),
    { id: 'none', label: t('parties.noBeatYet') },
  ];
  const shownCount = mode === 'paid' ? paidRows.length : due.rows.length;

  if (isPhone) {
    const topDays = dayPreview.days.slice(0, 5);
    const maxDayAmt = Math.max(1, ...topDays.map((d) => Math.max(d.received, d.sales)));

    return (
      <div className="space-y-3" id="report-total-receipts">
        {mode === 'paid' ? (
          <div className="rt-card space-y-3">
            <div>
              <div className="text-[12px] font-semibold" style={{ color: 'var(--text-2)' }}>
                {t('pay.totalReceived')}
              </div>
              <div
                className="text-[30px] font-extrabold tracking-tight leading-tight tabular-nums mt-1"
                style={{ color: 'var(--text)' }}
              >
                ₹{money(reg.total)}
              </div>
            </div>
            <div className="rt-three">
              <div className="rt-three__item">
                <span className="rt-three__label">{t('pay.modeCash')}</span>
                <span className="rt-three__val">{rsShort(reg.cash)}</span>
              </div>
              <div className="rt-three__item">
                <span className="rt-three__label">{t('pay.modeUpi')}</span>
                <span className="rt-three__val">{rsShort(upiTotal)}</span>
              </div>
              <div className="rt-three__item">
                <span className="rt-three__label">{t('pay.modeOther')}</span>
                <span className="rt-three__val">{rsShort(otherModeTotal)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rt-card space-y-3">
            <div>
              <div className="text-[12px] font-semibold" style={{ color: 'var(--text-2)' }}>
                {t('pay.totalDue')}
              </div>
              <div
                className="text-[30px] font-extrabold tracking-tight leading-tight tabular-nums mt-1"
                style={{ color: 'var(--due)' }}
              >
                ₹{money(due.total)}
              </div>
            </div>
            <div className="rt-three">
              <div className="rt-three__item">
                <span className="rt-three__label">{t('pay.openInvoices')}</span>
                <span className="rt-three__val">{due.rows.length}</span>
              </div>
              <div className="rt-three__item">
                <span className="rt-three__label">&gt;{OVERDUE_AFTER_DAYS}d</span>
                <span className="rt-three__val rt-three__val--due">{rsShort(overdue)}</span>
              </div>
              <div className="rt-three__item">
                <span className="rt-three__label">{t('parties.clear')}</span>
                <span className="rt-three__val">{reg.count}</span>
              </div>
            </div>
          </div>
        )}

        {mode === 'paid' && topDays.length > 0 && (
          <div className="rt-card space-y-2.5">
            <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>
              {t('pay.dayWiseCollectionSales')}
            </div>
            <div className="space-y-2.5">
              {topDays.map((d) => {
                const pct = Math.max(4, Math.min(100, Math.round((d.received / maxDayAmt) * 100)));
                return (
                  <div key={d.date} className="flex items-center gap-2.5">
                    <span className="text-[12px] w-14 shrink-0 tabular-nums" style={{ color: 'var(--text-2)' }}>
                      {fmtShort(d.date)}
                    </span>
                    <div className="rt-meter flex-1">
                      <div className="rt-meter__fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[12.5px] font-bold tabular-nums shrink-0 w-16 text-right" style={{ color: 'var(--text)' }}>
                      {rsShort(d.received)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {modeOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={mode === o.id}
              onClick={() => reset(() => setMode(o.id))}
              className="rt-chip shrink-0"
            >
              {o.label}
            </button>
          ))}
          {activeBeats.length > 0 &&
            beatOptions.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={beat === b.id}
                onClick={() => reset(() => setBeat(b.id))}
                className="rt-chip shrink-0"
              >
                {b.label}
              </button>
            ))}
        </div>

        <div className="rt-search-bar">
          <Search size={16} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
          <input
            type="text"
            enterKeyHint="search"
            value={search}
            onChange={(e) => reset(() => setSearch(e.target.value))}
            placeholder={mode === 'paid' ? t('pay.searchPayments') : t('pay.searchCustomerOrInv')}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => reset(() => setSearch(''))}
              className="p-1 bg-transparent border-0 cursor-pointer"
              style={{ color: 'var(--text-2)' }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {empty ? (
          <div className="rt-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--text-2)' }}>
            {t('common.noData')}
          </div>
        ) : (
          <div className="rt-card">
            {mode === 'paid'
              ? paidRows.slice(0, visible).map((r) => (
                  <div key={r.key} className="rt-rowi cursor-default">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold break-words" style={{ color: 'var(--text)' }}>
                        {r.customerName}
                      </div>
                      <div className="text-[11.5px] mt-0.5 break-words" style={{ color: 'var(--text-2)' }}>
                        {fmtShort(r.date)} · {r.receiptNo} · {MODE_LABEL[r.mode] || r.mode}
                        {r.invoiceLabel ? ` · ${r.invoiceLabel}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-extrabold tabular-nums" style={{ color: 'var(--paid)' }}>
                        ₹{money(r.amount)}
                      </div>
                    </div>
                  </div>
                ))
              : due.rows.slice(0, visible).map((r) => (
                  <div key={r.billId} className="rt-rowi cursor-default">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold break-words" style={{ color: 'var(--text)' }}>
                        {r.customerName}
                      </div>
                      <div className="text-[11.5px] mt-0.5 break-words" style={{ color: 'var(--text-2)' }}>
                        {r.invoiceNo} · {fmtShort(r.date)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-extrabold tabular-nums" style={{ color: 'var(--due)' }}>
                        ₹{money(r.balance)}
                      </div>
                      <span className={`rt-tag mt-0.5 ${r.ageDays > OVERDUE_AFTER_DAYS ? 'rt-tag--due' : 'rt-tag--soon'}`}>
                        {r.ageDays === 0 ? '0d' : `${r.ageDays}d`}
                      </span>
                    </div>
                  </div>
                ))}
          </div>
        )}

        <ShowMore shown={visible} total={shownCount} onMore={() => setVisible((v) => v + PAGE)} />

        <div className="h-20" aria-hidden="true" />
        <div className="rt-dlbar">
          <div className="rt-dlbar__grid">
            <button
              type="button"
              disabled={empty}
              onClick={exportExcel}
              className="rt-btn-outline rt-btn-outline--primary w-full"
            >
              {t('pay.excel')}
            </button>
            <button
              type="button"
              disabled={empty}
              onClick={exportPdf}
              className="rt-btn w-full"
            >
              {t('pay.pdf')}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
