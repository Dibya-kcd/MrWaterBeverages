import React, { useMemo, useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { useBeats } from '../../../hooks/useBeats';
import { money } from '../../../utils/billing';
import { todayISO } from '../../../utils/dateLocal';
import { buildBeatSummary, NO_BEAT, OVERDUE_AFTER_DAYS } from '../../../utils/beatReports';
import { downloadPdf, downloadXlsx, fileSlug, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';

export interface BeatSalesDueReportProps {
  periodLabel: string;
  inPeriod: (date: string) => boolean;
}

const card = 'rounded-2xl border border-black/10 bg-white';

/**
 * Beat-wise sales and payment due. One card per beat: sales in the period, money received in the period and
 * the due that is still remaining today. Tap a beat to see its customers (who to collect from).
 */
export const BeatSalesDueReport: React.FC<BeatSalesDueReportProps> = ({ periodLabel, inPeriod }) => {
  const { bills, payments, customers, existingCustomers, orgProfile } = useLedger();
  const { beats } = useBeats();
  const [open, setOpen] = useState<string | null>(null);

  const summary = useMemo(
    () =>
      buildBeatSummary({
        bills: bills || [],
        payments: payments || [],
        customers: customers || [],
        existingCustomers: existingCustomers || [],
        beats,
        inPeriod,
        today: todayISO(),
      }),
    [bills, payments, customers, existingCustomers, beats, inPeriod],
  );
  const { rows, totals } = summary;
  const shop = orgProfile?.name || 'MrWater Distribution';

  const exportExcel = () =>
    downloadXlsx(`beat-wise-sales-due-${fileStamp()}.xlsx`, [
      {
        name: 'Beat summary',
        header: ['Beat', 'Customers', 'Bills', 'Sales', 'Received', 'Due remaining', `Overdue (>${OVERDUE_AFTER_DAYS} days)`, 'Advance held'],
        rows: rows.map((r) => [r.beatName, r.customers, r.bills, r.sales, r.received, r.due, r.overdue, r.advance]),
        total: ['Total', totals.customers, totals.bills, totals.sales, totals.received, totals.due, totals.overdue, totals.advance],
      },
      {
        name: 'Customers by beat',
        header: ['Beat', 'Customer', 'Bills', 'Sales', 'Received', 'Due remaining', 'Advance held'],
        rows: rows.flatMap((r) => r.customerRows.map((c) => [r.beatName, c.name, c.bills, c.sales, c.received, c.due, c.advance])),
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `beat-wise-sales-due-${fileStamp()}.pdf`,
      title: 'Beat-wise sales & due',
      subtitle: [shop, `Sales and received: ${periodLabel}`, `Due remaining: as on ${todayISO()}`],
      landscape: true,
      sections: [
        {
          title: 'Summary by beat',
          header: ['Beat', 'Customers', 'Bills', 'Sales (Rs.)', 'Received (Rs.)', 'Due remaining (Rs.)', `Overdue >${OVERDUE_AFTER_DAYS}d (Rs.)`],
          rows: rows.map((r) => [r.beatName, r.customers, r.bills, money(r.sales), money(r.received), money(r.due), money(r.overdue)]),
          total: ['Total', totals.customers, totals.bills, money(totals.sales), money(totals.received), money(totals.due), money(totals.overdue)],
          rightAlign: [1, 2, 3, 4, 5, 6],
        },
        ...rows
          .filter((r) => r.customerRows.length > 0)
          .map((r) => ({
            title: `${r.beatName} - customers`,
            header: ['Customer', 'Bills', 'Sales (Rs.)', 'Received (Rs.)', 'Due remaining (Rs.)'],
            rows: r.customerRows.map((c) => [c.name, c.bills, money(c.sales), money(c.received), money(c.due)]),
            total: ['Beat total', r.bills, money(r.sales), money(r.received), money(r.due)],
            rightAlign: [1, 2, 3, 4],
          })),
      ],
    });

  const stat = (label: string, value: number, tone: string, sub?: string) => (
    <div className={`${card} p-3`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums ${tone}`}>₹{money(value)}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-3" id="report-beat-sales-due">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">Beat-wise sales &amp; due</h2>
          <p className="text-xs text-slate-500">
            {periodLabel} · due remaining is as of today
          </p>
        </div>
        <ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={rows.length === 0} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {stat('Sales', totals.sales, 'text-slate-900', `${totals.bills} bills`)}
        {stat('Received', totals.received, 'text-emerald-700', 'in this period')}
        {stat('Due remaining', totals.due, 'text-rose-700', `${totals.customers} customers`)}
        {stat(`Overdue >${OVERDUE_AFTER_DAYS} days`, totals.overdue, 'text-amber-700', 'part of the due')}
      </div>

      {rows.length === 0 && (
        <div className={`${card} py-10 text-center text-sm text-slate-400`}>
          No beats or customers yet. Create beats in Settings → Beats and put customers in them.
        </div>
      )}

      {rows.map((r) => {
        const isOpen = open === r.beatId;
        return (
          <section key={r.beatId} className={`${card} overflow-hidden`}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : r.beatId)}
              aria-expanded={isOpen}
              className="w-full text-left px-3.5 py-3 cursor-pointer active:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin size={15} className={r.beatId === NO_BEAT ? 'text-slate-400' : 'text-emerald-700'} />
                  <span className="text-[15px] font-bold text-slate-900 truncate">{r.beatName}</span>
                  {r.active === false && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">OFF</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs text-slate-500">
                  <span>{r.customers} customers</span>
                  <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500">Sales · {r.bills} bills</div>
                  <div className="text-[15px] font-extrabold text-slate-900 tabular-nums">₹{money(r.sales)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Received</div>
                  <div className="text-[15px] font-extrabold text-emerald-700 tabular-nums">₹{money(r.received)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Due remaining</div>
                  <div className={`text-[15px] font-extrabold tabular-nums ${r.due > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                    ₹{money(r.due)}
                  </div>
                </div>
              </div>
              {r.overdue > 0 && (
                <div className="mt-1.5 text-[11px] text-amber-700 font-semibold">
                  ₹{money(r.overdue)} of the due is older than {OVERDUE_AFTER_DAYS} days
                </div>
              )}
            </button>

            {isOpen && (
              <div className="border-t border-black/5 bg-[#faf8f5]">
                {r.customerRows.length === 0 ? (
                  <div className="px-3.5 py-4 text-xs text-slate-400 text-center">No sales, receipts or dues in this beat.</div>
                ) : (
                  <ul className="divide-y divide-black/5">
                    {r.customerRows.map((c) => (
                      <li key={c.key} className="px-3.5 py-2.5 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-semibold text-slate-900 leading-snug break-words">{c.name}</div>
                          <div className="text-xs text-slate-500">
                            {c.bills > 0 ? `${c.bills} bill${c.bills === 1 ? '' : 's'} · ₹${money(c.sales)}` : 'No sale in period'}
                            {c.received > 0 && ` · got ₹${money(c.received)}`}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {c.due > 0.004 ? (
                            <>
                              <div className="text-[13.5px] font-bold text-rose-700 tabular-nums">₹{money(c.due)}</div>
                              <div className="text-[10px] text-slate-400">due</div>
                            </>
                          ) : c.advance > 0.004 ? (
                            <div className="text-[11px] font-semibold text-sky-700">Advance ₹{money(c.advance)}</div>
                          ) : (
                            <div className="text-[11px] font-semibold text-emerald-700">Settled</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}

      {rows.length > 1 && (
        <div className={`${card} px-3.5 py-3 bg-slate-50`}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">All beats</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-[15px] font-extrabold tabular-nums">₹{money(totals.sales)}</div>
            <div className="text-[15px] font-extrabold tabular-nums text-emerald-700">₹{money(totals.received)}</div>
            <div className="text-[15px] font-extrabold tabular-nums text-rose-700">₹{money(totals.due)}</div>
          </div>
        </div>
      )}
    </div>
  );
};
