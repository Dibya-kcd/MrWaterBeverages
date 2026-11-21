import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { type BeatSummary, OVERDUE_AFTER_DAYS } from '../../../../utils/beatReports';
import { money } from '../../../../utils/billing';
import { MobileReportTopBar } from './MobileReportContext';
import { PhoneDownloadBar, rs } from './PhoneKit';

export interface BeatSalesDuePhoneProps {
  summary: BeatSummary;
  periodLabel: string;
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
}

const compactRs = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sign}₹${money(abs)}`;
};

export const BeatSalesDuePhone: React.FC<BeatSalesDuePhoneProps> = ({ summary, onExcel, onPdf }) => {
  const { rows, totals } = summary;
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const sortedBeats = rows.slice().sort((a, b) => b.due - a.due);

  const shareProps = {
    reportTitle: 'Beat-wise sales & due',
    summaryMetrics: [
      { label: 'Total due', value: rs(totals.due) },
      { label: 'Sales', value: rs(totals.sales) },
      { label: 'Received', value: rs(totals.received) },
      { label: `Overdue >${OVERDUE_AFTER_DAYS}d`, value: rs(totals.overdue) },
    ],
    sheets: [
      {
        name: 'Beat summary',
        header: ['Beat', 'Customers', 'Bills', 'Sales', 'Received', 'Due remaining', `Overdue (>${OVERDUE_AFTER_DAYS} days)`],
        rows: rows.map((r) => [r.beatName, r.customers, r.bills, r.sales, r.received, r.due, r.overdue]),
      },
    ],
    pdfSections: [
      {
        title: 'Summary by beat',
        header: ['Beat', 'Customers', 'Sales (Rs.)', 'Received (Rs.)', 'Due remaining (Rs.)'],
        rows: rows.map((r) => [r.beatName, r.customers, money(r.sales), money(r.received), money(r.due)]),
        rightAlign: [1, 2, 3, 4],
      },
    ],
  };

  return (
    <div className="md:hidden space-y-3" id="report-beat-sales-due-phone">
      <MobileReportTopBar
        title="Beat-wise sales & due"
        sub="Which beats to visit"
        showPeriod
        shareProps={shareProps}
      />

      {/* Total due card */}
      <section className="rt-rep-card rt-rep-pad">
        <div className="text-[12px] font-medium text-[var(--text-2)]">Total due</div>
        <div className="text-[26px] font-extrabold text-[var(--due)] tracking-tight leading-tight tabular-nums mt-0.5">
          {rs(totals.due)}
        </div>
        <div className="text-[11.5px] text-[var(--text-2)] mt-1">
          across {rows.length} beat{rows.length === 1 ? '' : 's'}
        </div>
      </section>

      {rows.length === 0 && (
        <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
          No beats or customers yet. Create beats in Settings → Beats and assign customers to them.
        </div>
      )}

      {/* Beat cards */}
      <div className="space-y-2.5">
        {sortedBeats.map((r) => {
          const collectedPct = r.sales > 0.004 ? Math.min(100, Math.round((r.received * 100) / r.sales)) : 0;
          const sortedCustomers = r.customerRows;
          const topDues = sortedCustomers.filter((c) => c.due > 0.004).slice(0, 2);
          const isOpen = open.has(r.beatId);
          const hasOverdue = r.overdue > 0.004;
          const hasDue = r.due > 0.004;

          return (
            <section key={r.beatId} className="rt-rep-card rt-rep-pad space-y-2.5">
              {/* Top row: Beat name & due pill */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] font-extrabold text-[var(--text)] leading-snug break-words">
                      {r.beatName}
                    </span>
                    {r.active === false && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[var(--text-2)]">
                        OFF
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 tabular-nums">
                    {r.customers} customer{r.customers === 1 ? '' : 's'} · Sold {compactRs(r.sales)} · collected {collectedPct}%
                  </div>
                </div>

                {hasDue ? (
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-extrabold tabular-nums ${
                      hasOverdue
                        ? 'bg-[var(--due-bg)] text-[var(--due)]'
                        : 'bg-[var(--soon-bg)] text-[var(--soon)]'
                    }`}
                  >
                    {rs(r.due)} due
                  </span>
                ) : (
                  <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-[var(--paid-bg)] text-[var(--paid)]">
                    Clear
                  </span>
                )}
              </div>

              {/* Collection progress bar */}
              <div className="rt-hbar-track">
                <div className="rt-hbar-fill" style={{ width: `${collectedPct}%` }} />
              </div>

              {/* Top dues summary & show all button */}
              {(topDues.length > 0 || sortedCustomers.length > 0) && (
                <div className="space-y-1.5 pt-0.5">
                  {topDues.length > 0 && !isOpen && (
                    <div className="text-[11.5px] text-[var(--text-2)] leading-snug">
                      Top dues:{' '}
                      {topDues.map((c, idx) => (
                        <span key={c.key}>
                          {idx > 0 ? ' · ' : ''}
                          {c.name} {rs(c.due)}
                        </span>
                      ))}
                    </div>
                  )}

                  {sortedCustomers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggle(r.beatId)}
                      className="inline-flex items-center gap-1 text-[12px] font-bold text-[var(--primary)] cursor-pointer"
                    >
                      <span>
                        {isOpen ? 'Hide customers' : `Show all ${sortedCustomers.length} customer${sortedCustomers.length === 1 ? '' : 's'}`}
                      </span>
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}

                  {isOpen && (
                    <div className="border-t border-[var(--divider)] pt-2 mt-2 divide-y divide-[var(--divider)]">
                      {sortedCustomers.map((c) => (
                        <div key={c.key} className="py-1.5 flex items-center justify-between gap-2 text-[12px]">
                          <div className="min-w-0">
                            <div className="font-bold text-[var(--text)] truncate">{c.name}</div>
                            <div className="text-[11px] text-[var(--text-2)]">
                              {c.bills > 0 ? `${c.bills} bill${c.bills === 1 ? '' : 's'} · ${rs(c.sales)}` : 'No sale'}
                              {c.received > 0 ? ` · got ${rs(c.received)}` : ''}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {c.due > 0.004 ? (
                              <span className="font-extrabold text-[var(--due)] tabular-nums">{rs(c.due)}</span>
                            ) : c.advance > 0.004 ? (
                              <span className="font-bold text-[var(--primary)] tabular-nums">Adv {rs(c.advance)}</span>
                            ) : (
                              <span className="font-bold text-[var(--paid)]">Clear</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <PhoneDownloadBar onExcel={onExcel} onPdf={onPdf} disabled={rows.length === 0} />
    </div>
  );
};
