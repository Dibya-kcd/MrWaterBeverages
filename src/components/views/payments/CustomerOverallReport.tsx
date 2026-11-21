import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { useBeats } from '../../../hooks/useBeats';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useLanguage } from '../../../i18n/LanguageContext';
import { money } from '../../../utils/billing';
import { buildCustomerOverall } from '../../../utils/beatReports';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { getInitials } from '../../ui/HomeKit';
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
  const isPhone = useIsMobile(767);
  const { t } = useLanguage();
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
    { id: 'all', label: t('parties.allBeats', { n: '' }).trim() },
    ...activeBeats.map((b) => ({ id: b.id, label: b.name })),
    { id: 'none', label: t('parties.noBeatYet') },
  ];
  const dueOptions: { id: 'all' | 'due'; label: string }[] = [
    { id: 'all', label: t('pay.allCustomers') },
    { id: 'due', label: t('pay.oweMoney') },
  ];

  if (isPhone) {
    return (
      <div className="space-y-3" id="report-customer-overall">
        {activeBeats.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {beatOptions.map((b) => (
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
        )}

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {dueOptions.map((d) => {
            const active = (onlyDue && d.id === 'due') || (!onlyDue && d.id === 'all');
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={active}
                onClick={() => reset(() => setOnlyDue(d.id === 'due'))}
                className="rt-chip shrink-0"
              >
                {d.label}
              </button>
            );
          })}
        </div>

        <div className="rt-search-bar">
          <Search size={16} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
          <input
            type="text"
            enterKeyHint="search"
            value={search}
            onChange={(e) => reset(() => setSearch(e.target.value))}
            placeholder={t('parties.searchPlaceholder')}
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

        {rows.length === 0 ? (
          <div className="rt-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--text-2)' }}>
            {t('parties.noPartiesFound')}
          </div>
        ) : (
          <div className="rt-card">
            {rows.slice(0, visible).map((r) => {
              const hasDue = r.due > 0.004;
              const hasAdvance = !hasDue && r.advance > 0.004;
              return (
                <div key={r.key} className="rt-rowi cursor-default">
                  <span className="rt-ico shrink-0">{getInitials(r.name, 'C')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold break-words" style={{ color: 'var(--text)' }}>
                      {r.name}
                    </div>
                    <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-2)' }}>
                      {t('pay.paidAmt', { amt: `₹${money(r.paid)}` })}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {hasDue ? (
                      <>
                        <div className="text-[14px] font-extrabold tabular-nums" style={{ color: 'var(--due)' }}>
                          ₹{money(r.due)}
                        </div>
                        <div className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>
                          {t('salesman.due').toLowerCase()}
                        </div>
                      </>
                    ) : hasAdvance ? (
                      <>
                        <div className="text-[14px] font-extrabold tabular-nums" style={{ color: 'var(--paid)' }}>
                          ₹{money(r.advance)}
                        </div>
                        <span className="rt-tag rt-tag--soon mt-0.5">{t('pay.advance')}</span>
                      </>
                    ) : (
                      <>
                        <div className="text-[14px] font-extrabold tabular-nums" style={{ color: 'var(--paid)' }}>
                          ₹0
                        </div>
                        <span className="rt-tag rt-tag--paid mt-0.5">{t('parties.clear')}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <ShowMore shown={visible} total={rows.length} onMore={() => setVisible((v) => v + PAGE)} />

        <div className="h-20" aria-hidden="true" />
        <div className="rt-dlbar">
          <div className="rt-dlbar__grid">
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={exportExcel}
              className="rt-btn-outline rt-btn-outline--primary w-full"
            >
              {t('pay.excel')}
            </button>
            <button
              type="button"
              disabled={rows.length === 0}
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
