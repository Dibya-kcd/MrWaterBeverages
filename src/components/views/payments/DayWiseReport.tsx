import React, { useMemo, useState } from 'react';
import { useLedger } from '../../../context/LedgerContext';
import { useBeats } from '../../../hooks/useBeats';
import { money } from '../../../utils/billing';
import { buildDaySummary } from '../../../utils/beatReports';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { fmtDay, MODE_LABEL, ShowMore } from './reportUi';
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
    { id: 'all', label: 'All beats' },
    ...activeBeats.map((b) => ({ id: b.id, label: b.name })),
    { id: 'none', label: 'No beat yet' },
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
