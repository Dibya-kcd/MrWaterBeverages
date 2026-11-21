import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { useBeats } from '../../../hooks/useBeats';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useLanguage } from '../../../i18n/LanguageContext';
import { money } from '../../../utils/billing';
import { buildDaySummary } from '../../../utils/beatReports';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { rsShort } from '../reports/mobile/PhoneKit';
import { fmtDay, fmtShort, MODE_LABEL, ShowMore } from './reportUi';
import {
  ReportBreakdownLine,
  ReportChipGroup,
  ReportEmpty,
  ReportFilterPanel,
  ReportGroupCard,
  ReportList,
  ReportListMeta,
  ReportRow,
  ReportStat,
  ReportStatGrid,
  ReportTitleBar,
} from '../reports/ReportKit';

interface Props {
  periodLabel: string;
  inPeriod: (date: string) => boolean;
}

const STATUS_TEXT = { up: 'Due increased', down: 'Dues recovered', even: 'Balanced' } as const;
const PAGE = 31;

/** Day-wise sales, collection and status. Tap a day to see the receipts behind it. */
export const DayWiseReport: React.FC<Props> = ({ periodLabel, inPeriod }) => {
  const isPhone = useIsMobile(767);
  const { t } = useLanguage();
  const { bills, payments, customers, existingCustomers, orgProfile } = useLedger();
  const { beats, activeBeats } = useBeats();
  const [beat, setBeat] = useState('all');
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(PAGE);

  const { days, totals } = useMemo(
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

  const shop = orgProfile?.name || 'MrWater Distribution';
  const beatLabel = beat === 'all' ? 'All beats' : beat === 'none' ? 'No beat yet' : beats.find((b) => b.id === beat)?.name || 'Beat';

  const exportExcel = () =>
    downloadXlsx(`day-wise-collection-${fileStamp()}.xlsx`, [
      {
        name: 'Day-wise summary',
        header: ['Date', 'Bills', 'Sales', 'Receipts', 'Collected', 'Cash', 'UPI / bank / other', 'Due change', 'Status'],
        rows: days.map((d) => [d.date, d.bills, d.sales, d.receipts, d.received, d.cash, d.other, d.dueChange, STATUS_TEXT[d.status]]),
        total: ['Total', totals.bills, totals.sales, totals.receipts, totals.received, totals.cash, totals.other, totals.dueChange, ''],
      },
      {
        name: 'Receipts by day',
        header: ['Date', 'Receipt no', 'Customer', 'Beat', 'Mode', 'Amount received', 'Invoice', 'Reference'],
        rows: days.flatMap((d) => d.receiptRows.map((r) => [r.date, r.receiptNo, r.customerName, r.beatName, MODE_LABEL[r.mode] || r.mode, r.amount, r.invoiceLabel, r.note])),
        total: ['Total', '', '', '', '', totals.received, '', ''],
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `day-wise-collection-${fileStamp()}.pdf`,
      title: 'Day-wise sales, collection & status',
      subtitle: [shop, `Period: ${periodLabel}`, `Beat: ${beatLabel}`, 'Due change = sales minus money collected that day'],
      landscape: true,
      sections: [
        {
          header: ['Date', 'Bills', 'Sales (Rs.)', 'Receipts', 'Collected (Rs.)', 'Cash (Rs.)', 'Other (Rs.)', 'Due change (Rs.)', 'Status'],
          rows: days.map((d) => [d.date, d.bills, money(d.sales), d.receipts, money(d.received), money(d.cash), money(d.other), money(d.dueChange), STATUS_TEXT[d.status]]),
          total: ['Total', totals.bills, money(totals.sales), totals.receipts, money(totals.received), money(totals.cash), money(totals.other), money(totals.dueChange), ''],
          rightAlign: [1, 2, 3, 4, 5, 6, 7],
        },
      ],
    });

  const isFiltered = beat !== 'all';
  const beatOptions = [
    { id: 'all', label: t('parties.allBeats', { n: '' }).trim() },
    ...activeBeats.map((b) => ({ id: b.id, label: b.name })),
    { id: 'none', label: t('parties.noBeatYet') },
  ];
  const shownDays = days.slice(0, visible);
  const openable = shownDays.filter((d) => d.receiptRows.length > 0).map((d) => d.date);
  const allOpen = openable.length > 0 && openable.every((d) => openDays.has(d));
  const toggleDay = (d: string) =>
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  const toggleAll = () => setOpenDays(allOpen ? new Set() : new Set(openable));
  const dueText =
    totals.dueChange > 0.004 ? `Due +₹${money(totals.dueChange)}` : totals.dueChange < -0.004 ? `Due −₹${money(-totals.dueChange)}` : 'Balanced';
  const signed = (n: number) => `${n > 0.004 ? '+' : n < -0.004 ? '−' : ''}₹${money(Math.abs(n))}`;

  if (isPhone) {
    const maxReceived = Math.max(1, ...shownDays.map((d) => d.received));

    return (
      <div className="space-y-3" id="report-day-wise">
        <div className="rt-kv-grid">
          <div className="rt-kv">
            <div className="rt-kv__label">{t('trips.sales')}</div>
            <div className="rt-kv__val">₹{money(totals.sales)}</div>
          </div>
          <div className="rt-kv">
            <div className="rt-kv__label">{t('trips.collected')}</div>
            <div className="rt-kv__val" style={{ color: 'var(--paid)' }}>₹{money(totals.received)}</div>
          </div>
          <div className="rt-kv">
            <div className="rt-kv__label">{t('pay.modeCash')}</div>
            <div className="rt-kv__val">₹{money(totals.cash)}</div>
          </div>
          <div className="rt-kv">
            <div className="rt-kv__label">{t('pay.totalDue')}</div>
            <div
              className="rt-kv__val"
              style={{
                color:
                  totals.dueChange > 0.004 ? 'var(--due)' : totals.dueChange < -0.004 ? 'var(--paid)' : 'var(--text)',
              }}
            >
              {signed(totals.dueChange)}
            </div>
          </div>
        </div>

        {activeBeats.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {beatOptions.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={beat === b.id}
                onClick={() => {
                  setBeat(b.id);
                  setVisible(PAGE);
                }}
                className="rt-chip shrink-0"
              >
                {b.label}
              </button>
            ))}
          </div>
        )}

        {days.length === 0 ? (
          <div className="rt-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--text-2)' }}>
            {t('common.noData')}
          </div>
        ) : (
          <div className="rt-card space-y-1">
            <div className="text-[14px] font-bold pb-1.5" style={{ color: 'var(--text)' }}>
              {t('pay.dayWiseCollectionSales')}
            </div>
            {shownDays.map((d) => {
              const canOpen = d.receiptRows.length > 0;
              const isOpen = canOpen && openDays.has(d.date);
              const pct = d.received > 0 ? Math.max(4, Math.min(100, Math.round((d.received / maxReceived) * 100))) : 0;
              return (
                <div
                  key={d.date}
                  className="border-b last:border-b-0 py-2"
                  style={{ borderColor: 'var(--divider)' }}
                >
                  <button
                    type="button"
                    disabled={!canOpen}
                    onClick={() => canOpen && toggleDay(d.date)}
                    aria-expanded={canOpen ? isOpen : undefined}
                    className="w-full flex items-center gap-2.5 bg-transparent border-0 p-0 text-left cursor-pointer disabled:cursor-default"
                  >
                    <span className="text-[12px] w-14 shrink-0 tabular-nums" style={{ color: 'var(--text-2)' }}>
                      {fmtShort(d.date)}
                    </span>
                    <div className="rt-meter flex-1">
                      <div className="rt-meter__fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span
                      className="text-[12.5px] font-bold tabular-nums shrink-0 w-16 text-right"
                      style={{ color: 'var(--text)' }}
                    >
                      {rsShort(d.received)}
                    </span>
                    {canOpen && (
                      <ChevronDown
                        size={14}
                        className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-2)' }}
                      />
                    )}
                  </button>

                  {isOpen && (
                    <div className="mt-2 pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--divider)' }}>
                      {d.receiptRows.map((r) => (
                        <div key={r.key} className="flex items-start justify-between gap-2 text-[12px]">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold break-words" style={{ color: 'var(--text)' }}>
                              {r.customerName}
                            </span>
                            <span className="block text-[11px]" style={{ color: 'var(--text-2)' }}>
                              {r.receiptNo} · {MODE_LABEL[r.mode] || r.mode}
                              {r.invoiceLabel ? ` · ${r.invoiceLabel}` : ''}
                            </span>
                          </div>
                          <span className="font-extrabold tabular-nums shrink-0" style={{ color: 'var(--paid)' }}>
                            ₹{money(r.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <ShowMore shown={visible} total={days.length} onMore={() => setVisible((v) => v + PAGE)} />

        <div className="h-20" aria-hidden="true" />
        <div className="rt-dlbar">
          <div className="rt-dlbar__grid">
            <button
              type="button"
              disabled={days.length === 0}
              onClick={exportExcel}
              className="rt-btn-outline rt-btn-outline--primary w-full"
            >
              {t('pay.excel')}
            </button>
            <button
              type="button"
              disabled={days.length === 0}
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
    <div className="space-y-3" id="report-day-wise">
      <ReportTitleBar
        title="Day-wise collection & sales"
        sub={`${periodLabel} · sales, money collected and what it did to the due`}
        actions={<ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={days.length === 0} reportTitle="Day-wise collection and sales" />}
      />

      <ReportStatGrid>
        <ReportStat label="Sales" value={`₹${money(totals.sales)}`} sub={`${totals.bills} bill${totals.bills === 1 ? '' : 's'}`} />
        <ReportStat label="Collected" value={`₹${money(totals.received)}`} tone="green" sub={`${totals.receipts} receipt${totals.receipts === 1 ? '' : 's'}`} />
        <ReportStat label="Cash" value={`₹${money(totals.cash)}`} sub="in hand" />
        <ReportStat
          label="Due change"
          value={signed(totals.dueChange)}
          tone={totals.dueChange > 0.004 ? 'red' : totals.dueChange < -0.004 ? 'green' : 'ink'}
          sub="sales minus collected"
        />
      </ReportStatGrid>
      <ReportBreakdownLine>
        <span>
          Cash ₹{money(totals.cash)} · UPI / bank / other ₹{money(totals.other)} · <span className="font-semibold">{dueText}</span>
        </span>
      </ReportBreakdownLine>

      {activeBeats.length > 0 && (
        <ReportFilterPanel
          isFiltered={isFiltered}
          onReset={() => {
            setBeat('all');
            setVisible(PAGE);
          }}
        >
          <ReportChipGroup<string>
            label="Beat"
            options={beatOptions}
            value={beat}
            onChange={(v) => {
              setBeat(v);
              setVisible(PAGE);
            }}
          />
        </ReportFilterPanel>
      )}

      {days.length > 0 && (
        <ReportListMeta allOpen={allOpen} onToggleAll={openable.length > 1 ? toggleAll : undefined}>
          {days.length} day{days.length === 1 ? '' : 's'}
          {isFiltered ? ' match' : ''}
        </ReportListMeta>
      )}

      {days.length === 0 && <ReportEmpty>No sales or receipts in this period</ReportEmpty>}

      {shownDays.map((d) => {
        const canOpen = d.receiptRows.length > 0;
        return (
          <ReportGroupCard
            key={d.date}
            title={fmtDay(d.date)}
            sub={`${d.bills} bill${d.bills === 1 ? '' : 's'} · ${d.receipts} receipt${d.receipts === 1 ? '' : 's'}${
              d.received > 0 ? ` · Cash ₹${money(d.cash)} · Other ₹${money(d.other)}` : ''
            }`}
            inline={
              <>
                <span>Sales ₹{money(d.sales)}</span>
                <span className={`font-semibold ${d.status === 'up' ? 'text-rose-700' : d.status === 'down' ? 'text-emerald-700' : ''}`}>
                  {STATUS_TEXT[d.status]} {signed(d.dueChange)}
                </span>
              </>
            }
            headLabel="Collected"
            head={`₹${money(d.received)}`}
            headTone="green"
            open={canOpen && openDays.has(d.date)}
            locked={!canOpen}
            onToggle={() => toggleDay(d.date)}
          >
            <ReportList>
              {d.receiptRows.map((r) => (
                <ReportRow
                  key={r.key}
                  title={r.customerName}
                  sub={`${r.receiptNo} · ${MODE_LABEL[r.mode] || r.mode}${r.kind === 'advance' ? ' · On account' : r.invoiceLabel ? ` · ${r.invoiceLabel}` : ''}`}
                  amount={`₹${money(r.amount)}`}
                  amountTone="green"
                />
              ))}
            </ReportList>
          </ReportGroupCard>
        );
      })}
      <ShowMore shown={visible} total={days.length} onMore={() => setVisible((v) => v + PAGE)} />
    </div>
  );
};
