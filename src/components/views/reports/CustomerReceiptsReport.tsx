import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { useBeats } from '../../../hooks/useBeats';
import { money } from '../../../utils/billing';
import { buildReceiptRegister } from '../../../utils/beatReports';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { BeatFilterBar } from '../../common/BeatFilterBar';
import { CustomerReceiptsPhone } from './mobile/CustomerReceiptsPhone';

export interface CustomerReceiptsReportProps {
  periodLabel: string;
  inPeriod: (date: string) => boolean;
}

const MODE: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank', cheque: 'Cheque', other: 'Other' };
const card = 'rounded-2xl border border-black/10 bg-white';

const fmtDay = (d: string) => {
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtShort = (d: string) => {
  if (!d) return '—';
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/**
 * Customer receipts: day by day (who paid how much, and what each customer still owes) or customer by customer.
 * Can be limited to one beat and downloaded as Excel or PDF.
 */
export const CustomerReceiptsReport: React.FC<CustomerReceiptsReportProps> = ({ periodLabel, inPeriod }) => {
  const { bills, payments, customers, existingCustomers, orgProfile } = useLedger();
  const { beats, activeBeats } = useBeats();
  const [view, setView] = useState<'day' | 'customer'>('day');
  const [beat, setBeat] = useState('all');
  const [search, setSearch] = useState('');
  const [includeUnpaid, setIncludeUnpaid] = useState(false);

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
        includeUnpaid: view === 'customer' && includeUnpaid,
      }),
    [bills, payments, customers, existingCustomers, beats, inPeriod, beat, search, view, includeUnpaid],
  );

  const shop = orgProfile?.name || 'MrWater Distribution';
  const beatLabel = beat === 'all' ? 'All beats' : beat === 'none' ? 'No beat yet' : beats.find((b) => b.id === beat)?.name || 'Beat';
  const paidCustomers = reg.customers.filter((c) => c.receipts > 0).length;
  const hasBeats = activeBeats.length > 0;

  const dueText = (due: number, advance: number) =>
    due > 0.004 ? `Due ₹${money(due)}` : advance > 0.004 ? `Advance ₹${money(advance)}` : 'Settled';
  const dueTone = (due: number, advance: number) =>
    due > 0.004 ? 'text-rose-700' : advance > 0.004 ? 'text-sky-700' : 'text-emerald-700';

  const exportExcel = () =>
    downloadXlsx(`customer-receipts-${fileStamp()}.xlsx`, [
      {
        name: 'Day-wise receipts',
        header: ['Date', 'Receipt no', 'Customer', 'Beat', 'Mode', 'Amount received', 'Invoice', 'Invoice still due', 'Customer due remaining', 'Reference'],
        rows: reg.days.flatMap((g) =>
          g.rows.map((r) => [r.date, r.receiptNo, r.customerName, r.beatName, MODE[r.mode] || r.mode, r.amount, r.invoiceLabel, r.invoiceDue, r.customerDue, r.note]),
        ),
        total: ['Total', '', '', '', '', reg.total, '', '', '', ''],
      },
      {
        name: 'Daily totals',
        header: ['Date', 'Receipts', 'Cash', 'UPI / bank / other', 'Total received'],
        rows: reg.days.map((g) => [g.date, g.rows.length, g.cash, g.other, g.total]),
        total: ['Total', reg.count, reg.cash, reg.other, reg.total],
      },
      {
        name: 'Customer-wise',
        header: ['Customer', 'Beat', 'Receipts', 'Received', 'Last receipt', 'Due remaining', 'Advance held'],
        rows: reg.customers.map((c) => [c.name, c.beatName, c.receipts, c.received, c.lastReceiptDate, c.due, c.advance]),
        total: ['Total', '', reg.customers.reduce((s, c) => s + c.receipts, 0), reg.total, '', reg.dueRemaining, ''],
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `customer-receipts-${view === 'day' ? 'day-wise' : 'customer-wise'}-${fileStamp()}.pdf`,
      title: view === 'day' ? 'Customer receipts - day-wise' : 'Customer receipts - customer-wise',
      subtitle: [shop, `Period: ${periodLabel}`, `Beat: ${beatLabel}`, `Due remaining is as on ${fileStamp()}`],
      landscape: true,
      sections:
        view === 'day'
          ? reg.days.map((g) => ({
              title: `${fmtDay(g.date)}  -  Rs. ${money(g.total)} received (${g.rows.length})`,
              header: ['Receipt', 'Customer', 'Beat', 'Mode', 'Invoice', 'Received (Rs.)', 'Invoice due (Rs.)', 'Customer due remaining (Rs.)'],
              rows: g.rows.map((r) => [r.receiptNo, r.customerName, r.beatName, MODE[r.mode] || r.mode, r.invoiceLabel || '-', money(r.amount), money(r.invoiceDue), money(r.customerDue)]),
              rightAlign: [5, 6, 7],
            }))
          : [
              {
                header: ['Customer', 'Beat', 'Receipts', 'Received (Rs.)', 'Last receipt', 'Due remaining (Rs.)'],
                rows: reg.customers.map((c) => [c.name, c.beatName, c.receipts, money(c.received), c.lastReceiptDate || '-', money(c.due)]),
                total: ['Total', '', reg.customers.reduce((s, c) => s + c.receipts, 0), money(reg.total), '', money(reg.dueRemaining)],
                rightAlign: [2, 3, 5],
              },
            ],
    });

  const tab = (id: 'day' | 'customer', label: string) => (
    <button
      type="button"
      onClick={() => setView(id)}
      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
        view === id ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <CustomerReceiptsPhone
        reg={reg}
        periodLabel={periodLabel}
        view={view}
        onView={setView}
        beat={beat}
        onBeat={setBeat}
        activeBeats={activeBeats}
        search={search}
        onSearch={setSearch}
        includeUnpaid={includeUnpaid}
        onIncludeUnpaid={setIncludeUnpaid}
        onExcel={exportExcel}
        onPdf={exportPdf}
      />
    <div className="hidden md:block space-y-3" id="report-customer-receipts">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">Customer receipts &amp; due remaining</h2>
          <p className="text-xs text-slate-500">{periodLabel} · due is as of today</p>
        </div>
        <ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={reg.count === 0 && reg.customers.length === 0} />
      </div>

      {hasBeats && <BeatFilterBar value={beat} onChange={setBeat} options={activeBeats} />}

      <div className="grid grid-cols-2 gap-2">
        <div className={`${card} p-3`}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Received</div>
          <div className="text-lg font-extrabold text-emerald-700 tabular-nums">₹{money(reg.total)}</div>
          <div className="text-[11px] text-slate-500">
            {reg.count} receipt{reg.count === 1 ? '' : 's'} · {paidCustomers} customer{paidCustomers === 1 ? '' : 's'}
          </div>
        </div>
        <div className={`${card} p-3`}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Due remaining</div>
          <div className="text-lg font-extrabold text-rose-700 tabular-nums">₹{money(reg.dueRemaining)}</div>
          <div className="text-[11px] text-slate-500">{view === 'day' ? 'of these customers' : `of ${reg.customers.length} customers listed`}</div>
        </div>
      </div>
      {reg.count > 0 && (
        <div className="text-xs text-slate-600 px-1">
          Cash ₹{money(reg.cash)} · UPI / bank / other ₹{money(reg.other)}
        </div>
      )}

      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
        {tab('day', 'Day-wise')}
        {tab('customer', 'Customer-wise')}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          enterKeyHint="search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer or receipt"
          className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 placeholder:text-slate-400"
        />
        {search && (
          <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {view === 'customer' && (
        <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700 px-1 select-none cursor-pointer">
          <input type="checkbox" checked={includeUnpaid} onChange={(e) => setIncludeUnpaid(e.target.checked)} className="size-4 accent-[#0d4a3a]" />
          Also show customers who owe but paid nothing in this period
        </label>
      )}

      {view === 'day' && (
        <>
          {reg.days.length === 0 && <div className={`${card} py-10 text-center text-sm text-slate-400`}>No receipts in this period</div>}
          {reg.days.map((g) => (
            <section key={g.date} className={`${card} overflow-hidden`}>
              <header className="px-3.5 py-2.5 bg-[#faf8f5] border-b border-black/5">
                <div className="text-[13px] font-bold text-slate-900">{fmtDay(g.date)}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                  <span>
                    Received <strong className="text-emerald-700 tabular-nums">₹{money(g.total)}</strong>
                  </span>
                  <span>
                    {g.rows.length} receipt{g.rows.length === 1 ? '' : 's'}
                  </span>
                  <span className="text-slate-400">
                    Cash ₹{money(g.cash)} · Other ₹{money(g.other)}
                  </span>
                </div>
              </header>
              <ul className="divide-y divide-black/5">
                {g.rows.map((r) => (
                  <li key={r.key} className="px-3.5 py-2.5 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-slate-900 leading-snug break-words">{r.customerName}</div>
                      <div className="text-xs text-slate-500 leading-snug break-words">
                        {r.receiptNo} · {MODE[r.mode] || r.mode}
                        {r.kind === 'advance' ? ' · On account' : r.invoiceLabel ? ` · ${r.invoiceLabel}` : ''}
                        {r.invoiceDue > 0.004 && ` (₹${money(r.invoiceDue)} still due on it)`}
                      </div>
                      {hasBeats && (
                        <span className="mt-1 inline-block text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {r.beatName}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-extrabold text-emerald-700 tabular-nums">₹{money(r.amount)}</div>
                      <div className={`text-[11px] font-semibold ${dueTone(r.customerDue, r.customerAdvance)}`}>
                        {dueText(r.customerDue, r.customerAdvance)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {view === 'customer' && (
        <>
          {reg.customers.length === 0 && <div className={`${card} py-10 text-center text-sm text-slate-400`}>No customers to show</div>}
          {reg.customers.length > 0 && (
            <section className={`${card} overflow-hidden`}>
              <ul className="divide-y divide-black/5">
                {reg.customers.map((c) => (
                  <li key={c.key} className="px-3.5 py-2.5 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-slate-900 leading-snug break-words">{c.name}</div>
                      <div className="text-xs text-slate-500">
                        {c.receipts > 0
                          ? `${c.receipts} receipt${c.receipts === 1 ? '' : 's'} · last ${fmtShort(c.lastReceiptDate)}`
                          : 'No receipt in this period'}
                      </div>
                      {hasBeats && (
                        <span className="mt-1 inline-block text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {c.beatName}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-bold text-emerald-700 tabular-nums">
                        {c.received > 0 ? `₹${money(c.received)}` : '—'}
                      </div>
                      <div className={`text-[11px] font-semibold ${dueTone(c.due, c.advance)}`}>{dueText(c.due, c.advance)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
    </>
  );
};
