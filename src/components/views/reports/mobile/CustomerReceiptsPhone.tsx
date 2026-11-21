import React, { useMemo, useState } from 'react';
import { Check, Search, SlidersHorizontal, X } from 'lucide-react';
import type { ReceiptRegister } from '../../../../utils/beatReports';
import type { BeatRoute } from '../../../../constants/beats';
import { money } from '../../../../utils/billing';
import { todayISO } from '../../../../utils/dateLocal';
import { MobileReportTopBar, useMobileReport } from './MobileReportContext';
import { PhoneDownloadBar, PhoneFilterBottomSheet, rs } from './PhoneKit';

const fmtShort = (d: string) => {
  if (!d) return '—';
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const getInitials = (name: string): string => {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

type SortMode = 'received' | 'due' | 'today';

export interface CustomerReceiptsPhoneProps {
  onlyCustomer?: boolean;
  topExtra?: React.ReactNode;
  reg: ReceiptRegister;
  periodLabel: string;
  view: 'day' | 'customer';
  onView: (v: 'day' | 'customer') => void;
  beat: string;
  onBeat: (v: string) => void;
  activeBeats: BeatRoute[];
  search: string;
  onSearch: (v: string) => void;
  includeUnpaid: boolean;
  onIncludeUnpaid: (v: boolean) => void;
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
}

export const CustomerReceiptsPhone: React.FC<CustomerReceiptsPhoneProps> = ({
  reg,
  beat,
  onBeat,
  activeBeats,
  search,
  onSearch,
  includeUnpaid,
  onIncludeUnpaid,
  onExcel,
  onPdf,
}) => {
  const mobileCtx = useMobileReport();
  const [sortMode, setSortMode] = useState<SortMode>('received');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const hasBeats = activeBeats.length > 0;
  const beatOptions = [
    { id: 'all', label: 'All beats' },
    ...activeBeats.map((b) => ({ id: b.id, label: b.name })),
    { id: 'none', label: 'No beat yet' },
  ];

  const today = useMemo(() => todayISO(), []);
  const activeFilterCount = (beat !== 'all' ? 1 : 0) + (includeUnpaid ? 1 : 0);

  const displayedCustomers = useMemo(() => {
    const base =
      sortMode === 'today'
        ? reg.customers.filter((c) => c.lastReceiptDate?.slice(0, 10) === today)
        : reg.customers.slice();

    return base.sort((a, b) => {
      if (sortMode === 'due') {
        const d = b.due - a.due;
        return d !== 0 ? d : b.received - a.received;
      }
      const r = b.received - a.received;
      return r !== 0 ? r : b.due - a.due;
    });
  }, [reg.customers, sortMode, today]);

  const shareProps = {
    reportTitle: 'Customer receipts',
    summaryMetrics: [
      { label: 'Received', value: rs(reg.total) },
      { label: 'Receipts', value: String(reg.count) },
      { label: 'Due remaining', value: rs(reg.dueRemaining) },
    ],
    sheets: [
      {
        name: 'Customer-wise',
        header: ['Customer', 'Beat', 'Receipts', 'Received', 'Last receipt', 'Due remaining', 'Advance held'],
        rows: reg.customers.map((c) => [c.name, c.beatName, c.receipts, c.received, c.lastReceiptDate, c.due, c.advance]),
      },
    ],
    pdfSections: [
      {
        title: 'Customer receipts',
        header: ['Customer', 'Receipts', 'Received (Rs.)', 'Last receipt', 'Due remaining (Rs.)'],
        rows: reg.customers.map((c) => [c.name, c.receipts, money(c.received), c.lastReceiptDate || '-', money(c.due)]),
        rightAlign: [1, 2, 4],
      },
    ],
  };

  return (
    <div className="md:hidden space-y-3" id="report-customer-receipts-phone">
      <MobileReportTopBar
        title="Collections"
        sub="Customer receipts"
        showPeriod
        shareProps={shareProps}
      />

      {/* Same 3-Chip Switcher: Day-wise summary | Transactions | Customer receipts */}
      {mobileCtx && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => {
              mobileCtx.setCollectionsSubTab('daywise');
              mobileCtx.navigateReport('daybook');
            }}
            className="shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border bg-white text-[var(--text)] border-[var(--border)] cursor-pointer"
          >
            Day-wise summary
          </button>
          <button
            type="button"
            onClick={() => {
              mobileCtx.setCollectionsSubTab('transactions');
              mobileCtx.navigateReport('daybook');
            }}
            className="shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border bg-white text-[var(--text)] border-[var(--border)] cursor-pointer"
          >
            Transactions
          </button>
          <button
            type="button"
            className="shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border bg-[var(--text)] text-white border-[var(--text)] cursor-pointer"
          >
            Customer receipts
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="rt-search-bar flex-1">
          <Search size={16} className="text-[var(--text-2)] shrink-0" />
          <input
            type="text"
            enterKeyHint="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search customer"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearch('')}
              className="text-[var(--text-2)] p-0.5 cursor-pointer shrink-0"
            >
              <X size={15} />
            </button>
          )}
        </div>
        {(hasBeats || activeFilterCount > 0) && (
          <button
            type="button"
            onClick={() => setIsFilterSheetOpen(true)}
            aria-label="Filter by beat or options"
            className={`h-[40px] w-[40px] rounded-[10px] border flex items-center justify-center shrink-0 cursor-pointer relative ${
              activeFilterCount > 0
                ? 'bg-[#eaf3fd] border-[var(--primary)] text-[var(--primary)]'
                : 'bg-white border-[var(--border)] text-[var(--text)]'
            }`}
          >
            <SlidersHorizontal size={16} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--primary)] text-white text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Sort Chips: Most received | Highest due | Today */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {([
          { id: 'received', label: 'Most received' },
          { id: 'due', label: 'Highest due' },
          { id: 'today', label: 'Today' },
        ] as { id: SortMode; label: string }[]).map((chip) => {
          const active = sortMode === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setSortMode(chip.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors cursor-pointer ${
                active
                  ? 'bg-[var(--text)] text-white border-[var(--text)]'
                  : 'bg-white text-[var(--text)] border-[var(--border)]'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Customer receipts grouped list */}
      {displayedCustomers.length === 0 ? (
        <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
          No customers to show
        </div>
      ) : (
        <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
          {displayedCustomers.map((c) => {
            const hasDue = c.due > 0.004;
            const hasAdv = !hasDue && c.advance > 0.004;
            return (
              <div key={c.key} className="px-3.5 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#eaf3fd] text-[var(--primary)] font-extrabold text-[12px] flex items-center justify-center shrink-0">
                  {getInitials(c.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug break-words">
                    {c.name}
                  </div>
                  <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 leading-snug">
                    {c.receipts > 0
                      ? `${c.receipts} receipt${c.receipts === 1 ? '' : 's'} · last ${fmtShort(c.lastReceiptDate)}`
                      : 'No receipt in this period'}
                  </div>
                </div>

                <div className="text-right shrink-0 flex flex-col items-end">
                  <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums leading-tight">
                    {c.received > 0 ? rs(c.received) : '—'}
                  </div>
                  {hasDue ? (
                    <div className="text-[11px] font-bold text-[var(--due)] tabular-nums mt-0.5 leading-tight">
                      due {rs(c.due)}
                    </div>
                  ) : hasAdv ? (
                    <div className="text-[11px] font-bold text-[var(--primary)] tabular-nums mt-0.5 leading-tight">
                      adv {rs(c.advance)}
                    </div>
                  ) : (
                    <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--paid-bg)] text-[var(--paid)] text-[10px] font-bold leading-tight">
                      Clear
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Filter Bottom Sheet Modal */}
      <PhoneFilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="Filter Receipts"
        activeCount={activeFilterCount}
        onReset={() => {
          onBeat('all');
          onIncludeUnpaid(false);
        }}
      >
        {hasBeats && (
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Filter by Beat Route
            </label>
            <div className="grid grid-cols-2 gap-2">
              {beatOptions.map((opt) => {
                const isCurrent = beat === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onBeat(opt.id)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors text-center cursor-pointer ${
                      isCurrent
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                        : 'bg-white text-[var(--text)] border-[var(--border)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Customer Options
          </label>
          <button
            type="button"
            onClick={() => onIncludeUnpaid(!includeUnpaid)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all text-left cursor-pointer ${
              includeUnpaid
                ? 'bg-[#eaf3fd] text-[var(--text)] border-[var(--primary)]'
                : 'bg-white text-[var(--text)] border-[var(--border)]'
            }`}
          >
            <span>Also show customers who owe but paid nothing</span>
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                includeUnpaid
                  ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                  : 'border-slate-300 bg-white'
              }`}
            >
              {includeUnpaid && <Check size={14} />}
            </div>
          </button>
        </div>
      </PhoneFilterBottomSheet>

      <PhoneDownloadBar
        onExcel={onExcel}
        onPdf={onPdf}
        disabled={reg.count === 0 && reg.customers.length === 0}
      />
    </div>
  );
};
