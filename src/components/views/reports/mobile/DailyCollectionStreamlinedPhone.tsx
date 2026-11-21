import React, { useState } from 'react';
import {
  Calendar,
  ChevronDown,
  Filter,
  Search,
  X,
  SlidersHorizontal,
  Check,
  Receipt,
  ArrowUpRight,
  Info,
} from 'lucide-react';
import type {
  CollectionFilterType,
  CollectionModeFilter,
  DayCollectionGroup,
  PeriodTotals,
} from '../DailyCollectionStreamlined';
import type { ReportPeriod } from '../reportPeriod';
import { money } from '../../../../utils/billing';
import { MobileReportTopBar, useMobileReport } from './MobileReportContext';
import { PhoneDownloadBar, rs, Tag } from './PhoneKit';

export const TYPE_OPTIONS: { id: CollectionFilterType; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'due', label: 'Sales with due' },
  { id: 'pay', label: 'Payments only' },
  { id: 'out', label: 'Paid out' },
];

export const MODE_OPTIONS: { id: CollectionModeFilter; label: string }[] = [
  { id: 'all', label: 'All modes' },
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI / bank' },
  { id: 'cheque', label: 'Cheque' },
];

export const PERIOD_PRESETS: { id: ReportPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'all', label: 'All time' },
  { id: 'customRange', label: 'Custom range' },
];

export interface DailyCollectionStreamlinedPhoneProps {
  topExtra?: React.ReactNode;
  periodLabel: string;
  totals: PeriodTotals;
  groups: DayCollectionGroup[];
  hasAny: boolean;
  typeCounts: Record<CollectionFilterType, number>;
  filterType: CollectionFilterType;
  onFilterType: (v: CollectionFilterType) => void;
  filterMode: CollectionModeFilter;
  onFilterMode: (v: CollectionModeFilter) => void;
  search: string;
  onSearch: (v: string) => void;
  isFiltered: boolean;
  onReset: () => void;
  isOpen: (date: string) => boolean;
  onToggleDay: (date: string) => void;
  forceOpen: boolean;
  allOpen: boolean;
  onToggleAll: () => void;
  onExplain: () => void;
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
  onBack?: () => void;
  period?: ReportPeriod;
  onPeriodChange?: (p: ReportPeriod) => void;
  startDate?: string;
  endDate?: string;
  onCustomRangeChange?: (start: string, end: string) => void;
}

const KIND_LABEL = { sale: 'Sale', payment: 'Collection', refund: 'Refund', expense: 'Expense' } as const;

const compactRs = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sign}₹${money(abs)}`;
};

const formatDayShort = (dateStr: string): string => {
  const dt = new Date(`${dateStr}T12:00:00`);
  if (isNaN(dt.getTime())) return dateStr;
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export const DailyCollectionStreamlinedPhone: React.FC<DailyCollectionStreamlinedPhoneProps> = ({
  periodLabel,
  totals,
  groups,
  hasAny,
  typeCounts,
  filterType,
  onFilterType,
  filterMode,
  onFilterMode,
  search,
  onSearch,
  isFiltered,
  onReset,
  isOpen,
  onToggleDay,
  forceOpen,
  allOpen,
  onToggleAll,
  onExplain,
  onExcel,
  onPdf,
  onBack,
  period = 'thisMonth',
  onPeriodChange,
  startDate = '',
  endDate = '',
  onCustomRangeChange,
}) => {
  const mobileCtx = useMobileReport();
  const [localSubTab, setLocalSubTab] = useState<'daywise' | 'transactions'>('daywise');
  const activeSubTab = mobileCtx ? mobileCtx.collectionsSubTab : localSubTab;
  const setActiveSubTab = mobileCtx ? mobileCtx.setCollectionsSubTab : setLocalSubTab;

  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  const isPeriodFiltered = period !== 'thisMonth' && period !== 'all';
  const activeFilterCount =
    (filterType !== 'all' ? 1 : 0) + (filterMode !== 'all' ? 1 : 0) + (isPeriodFiltered ? 1 : 0);

  const handleApplyFilters = () => {
    if (period === 'customRange' && onCustomRangeChange && customStart && customEnd) {
      onCustomRangeChange(customStart, customEnd);
    }
    setIsFilterSheetOpen(false);
  };

  const handleResetAll = () => {
    onReset();
    if (onPeriodChange) onPeriodChange('thisMonth');
    setIsFilterSheetOpen(false);
  };

  const handleTapDayRow = (date: string) => {
    if (!isOpen(date)) {
      onToggleDay(date);
    }
    setActiveSubTab('transactions');
  };

  const shareProps = {
    reportTitle: 'Collections',
    summaryMetrics: [
      { label: 'Money in', value: rs(totals.grossCollected) },
      { label: 'Cash', value: rs(totals.cashIn) },
      { label: 'UPI / bank', value: rs(totals.digitalIn) },
      { label: 'Paid out', value: rs(totals.out) },
    ],
    sheets: [
      {
        name: 'Day-wise summary',
        header: ['Date', 'Bills', 'Billed', 'Cash', 'UPI / bank', 'Cheque', 'Total collected', 'New due', 'Paid out', 'Net in hand'],
        rows: groups.map((d) => [d.date, d.salesCount, d.billed, d.cashIn, d.digitalIn, d.chequeIn, d.totalCollected, d.dueCreated, d.out, d.netInHand]),
      },
    ],
    pdfSections: [
      {
        title: 'Day-wise summary',
        header: ['Date', 'Bills', 'Cash (Rs.)', 'UPI / bank (Rs.)', 'Collected (Rs.)', 'Paid out (Rs.)'],
        rows: groups.map((d) => [d.date, d.salesCount, money(d.cashIn), money(d.digitalIn), money(d.totalCollected), money(d.out)]),
        rightAlign: [1, 2, 3, 4, 5],
      },
    ],
  };

  const upiAndBank = totals.digitalIn + totals.chequeIn;

  return (
    <div className="md:hidden space-y-3" id="daily-collection-mobile-screen">
      <MobileReportTopBar
        title="Collections"
        sub={activeSubTab === 'daywise' ? 'Money in and out each day' : 'Transactions'}
        onBack={onBack}
        showPeriod
        shareProps={shareProps}
      />

      {/* 3-Chip Switcher: Day-wise summary | Transactions | Customer receipts */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
        <button
          type="button"
          onClick={() => setActiveSubTab('daywise')}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors cursor-pointer ${
            activeSubTab === 'daywise'
              ? 'bg-[var(--text)] text-white border-[var(--text)]'
              : 'bg-white text-[var(--text)] border-[var(--border)]'
          }`}
        >
          Day-wise summary
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('transactions')}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors cursor-pointer ${
            activeSubTab === 'transactions'
              ? 'bg-[var(--text)] text-white border-[var(--text)]'
              : 'bg-white text-[var(--text)] border-[var(--border)]'
          }`}
        >
          Transactions
        </button>
        <button
          type="button"
          onClick={() => mobileCtx?.navigateReport('payments')}
          className="shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border bg-white text-[var(--text)] border-[var(--border)] transition-colors cursor-pointer"
        >
          Customer receipts
        </button>
      </div>

      {/* Money in summary card */}
      <section className="rt-rep-card rt-rep-pad">
        <div className="text-[12px] font-medium text-[var(--text-2)]">Money in</div>
        <div className="text-[26px] font-extrabold text-[var(--text)] tracking-tight leading-tight tabular-nums mt-0.5">
          {rs(totals.grossCollected)}
        </div>
        <div className="text-[11px] font-medium text-[var(--text-2)] mt-1">
          Cash {compactRs(totals.cashIn)} · UPI {compactRs(upiAndBank)}
        </div>

        <div className="border-t border-[var(--divider)] my-2.5" />

        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[11px] text-[var(--text-2)] font-medium">Cash</div>
            <div className="text-[13px] font-extrabold text-[var(--text)] tabular-nums mt-0.5">
              {compactRs(totals.cashIn)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-2)] font-medium">UPI</div>
            <div className="text-[13px] font-extrabold text-[var(--text)] tabular-nums mt-0.5">
              {compactRs(upiAndBank)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-2)] font-medium">Out</div>
            <div className="text-[13px] font-extrabold text-[var(--due)] tabular-nums mt-0.5">
              {compactRs(totals.out)}
            </div>
          </div>
        </div>
      </section>

      {/* TRANSACTIONS SEARCH & FILTER BAR */}
      {activeSubTab === 'transactions' && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="rt-search-bar flex-1">
              <Search size={16} className="text-[var(--text-2)] shrink-0" />
              <input
                type="text"
                enterKeyHint="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search customer or invoice…"
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
            <button
              type="button"
              onClick={() => setIsFilterSheetOpen(true)}
              className={`h-[40px] px-3 rounded-[10px] border text-[12px] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeFilterCount > 0
                  ? 'bg-[#eaf3fd] border-[var(--primary)] text-[var(--primary)]'
                  : 'bg-white border-[var(--border)] text-[var(--text)]'
              }`}
            >
              <Filter size={14} />
              <span>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
            </button>
          </div>

          {groups.length > 0 && !forceOpen && (
            <div className="flex items-center justify-between px-0.5 text-[12px]">
              <span className="font-medium text-[var(--text-2)]">
                {groups.length} day{groups.length === 1 ? '' : 's'} · {groups.reduce((s, g) => s + g.lines.length, 0)} entries
              </span>
              <button
                type="button"
                onClick={onToggleAll}
                className="font-bold text-[var(--primary)] cursor-pointer"
              >
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {groups.length === 0 && (
        <div className="rt-rep-card py-10 px-4 text-center space-y-2">
          <p className="text-[13px] font-semibold text-[var(--text)]">
            {hasAny && isFiltered ? 'No transactions match these filters' : 'Nothing recorded in this period'}
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={handleResetAll}
              className="text-[12px] font-bold text-[var(--primary)] hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* DAY-WISE SUMMARY LIST (Mockup 2 Screen 1) */}
      {activeSubTab === 'daywise' && groups.length > 0 && (
        <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
          {groups.map((g) => (
            <button
              key={g.date}
              type="button"
              onClick={() => handleTapDayRow(g.date)}
              className="w-full text-left px-3.5 py-3 flex items-center gap-3 active:bg-[#f8fafc] transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-[#f1f5f9] flex items-center justify-center shrink-0 text-[var(--text-2)]">
                <Calendar size={17} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug">
                  {formatDayShort(g.date)}
                </div>
                <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 leading-snug">
                  {g.salesCount} bill{g.salesCount === 1 ? '' : 's'} · {g.paymentsCount} receipt{g.paymentsCount === 1 ? '' : 's'}
                </div>
              </div>

              <div className="text-right shrink-0 flex flex-col items-end">
                <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums leading-tight">
                  {rs(g.totalCollected)}
                </div>
                <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--due-bg)] text-[var(--due)] text-[10px] font-bold tabular-nums leading-tight">
                  out {rs(g.out)}
                </span>
              </div>
            </button>
          ))}
        </section>
      )}

      {/* TRANSACTIONS EXPANDABLE LIST */}
      {activeSubTab === 'transactions' && groups.length > 0 && (
        <div className="space-y-2.5">
          {groups.map((g) => {
            const open = isOpen(g.date);
            return (
              <section key={g.date} className="rt-rep-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => onToggleDay(g.date)}
                  aria-expanded={open}
                  disabled={forceOpen}
                  className="w-full text-left px-3.5 py-3 flex items-center justify-between gap-2.5 cursor-pointer active:bg-[#f8fafc] disabled:cursor-default"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-[#f1f5f9] flex items-center justify-center shrink-0 text-[var(--text-2)]">
                      <Calendar size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug">
                        {formatDayShort(g.date)}
                      </div>
                      <div className="text-[11px] text-[var(--text-2)]">
                        {g.salesCount} bills · {g.paymentsCount} receipts
                        {g.out > 0 ? ` · out ${rs(g.out)}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[13.5px] font-extrabold text-[var(--paid)] tabular-nums">
                      {rs(g.totalCollected)}
                    </span>
                    {!forceOpen && (
                      <ChevronDown
                        size={16}
                        className={`text-[var(--text-2)] transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    )}
                  </div>
                </button>

                {open && (
                  <ul className="divide-y divide-[var(--divider)] border-t border-[var(--divider)]">
                    {g.lines.map((l) => {
                      const isSale = l.kind === 'sale';
                      return (
                        <li key={l.id} className="px-3.5 py-2.5 flex items-start gap-2.5">
                          <div
                            className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-[12px] mt-0.5 ${
                              l.isOut
                                ? 'bg-[var(--due-bg)] text-[var(--due)]'
                                : isSale
                                  ? 'bg-[#eaf3fd] text-[var(--primary)]'
                                  : 'bg-[var(--paid-bg)] text-[var(--paid)]'
                            }`}
                          >
                            {l.isOut ? <ArrowUpRight size={15} /> : isSale ? <Receipt size={15} /> : '₹'}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-bold text-[var(--text)] leading-snug break-words">
                              {l.title}
                            </div>
                            <div className="text-[11.5px] text-[var(--text-2)] leading-snug break-words mt-0.5">
                              {l.subtitle}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {isSale &&
                                ((l.due || 0) <= 0.004 ? (
                                  <Tag tone="green">Paid in full</Tag>
                                ) : (
                                  <>
                                    {(l.paid || 0) > 0 && <Tag tone="green">Paid {rs(l.paid || 0)}</Tag>}
                                    <Tag tone="red">Due {rs(l.due || 0)}</Tag>
                                  </>
                                ))}
                              {l.kind === 'payment' && <Tag tone="blue">Payment received</Tag>}
                              {l.isOut && <Tag tone="red">{KIND_LABEL[l.kind]}</Tag>}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`text-[13.5px] font-extrabold tabular-nums leading-tight ${
                                l.isOut
                                  ? 'text-[var(--due)]'
                                  : l.kind === 'payment'
                                    ? 'text-[var(--paid)]'
                                    : 'text-[var(--text)]'
                              }`}
                            >
                              {l.isOut ? '−' : ''}
                              {rs(l.amount)}
                            </div>
                            {isSale && <div className="text-[10.5px] text-[var(--text-2)] mt-0.5">invoice</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="text-center pt-1">
        <button
          type="button"
          onClick={onExplain}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-2)] hover:text-[var(--text)] cursor-pointer"
        >
          <Info size={13} />
          <span>How is daily collection calculated?</span>
        </button>
      </div>

      <PhoneDownloadBar onExcel={onExcel} onPdf={onPdf} disabled={!hasAny} />

      {/* FILTER BOTTOM SHEET MODAL */}
      {isFilterSheetOpen && (
        <div
          data-esc-close
          className="rt-bsheet-scrim"
          onClick={() => setIsFilterSheetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Filter Collection"
        >
          <div className="rt-bsheet space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--divider)]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={17} className="text-[var(--primary)]" />
                <h3 className="text-[16px] font-extrabold text-[var(--text)]">Filters</h3>
              </div>
              <div className="flex items-center gap-3">
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="text-[12px] font-bold text-[var(--due)] hover:underline cursor-pointer"
                  >
                    Reset all
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close filters"
                  onClick={() => setIsFilterSheetOpen(false)}
                  className="size-8 rounded-full bg-[#f1f5f9] text-[var(--text-2)] flex items-center justify-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {onPeriodChange && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">
                  Date Period
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PERIOD_PRESETS.map((p) => {
                    const isCurrent = period === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onPeriodChange(p.id)}
                        className={`px-2.5 py-2 rounded-xl text-[12px] font-bold border transition-colors text-center cursor-pointer ${
                          isCurrent
                            ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                            : 'bg-white text-[var(--text)] border-[var(--border)]'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {period === 'customRange' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">From Date</label>
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full text-[12px] font-bold p-2 border border-[var(--border)] rounded-xl bg-white text-[var(--text)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--text-2)] block mb-1">To Date</label>
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full text-[12px] font-bold p-2 border border-[var(--border)] rounded-xl bg-white text-[var(--text)]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-[var(--divider)]">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">
                Transaction Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((opt) => {
                  const isCurrent = filterType === opt.id;
                  const count = typeCounts[opt.id];
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onFilterType(opt.id)}
                      className={`px-3 py-2 rounded-xl text-[12px] font-bold border transition-colors flex items-center justify-between cursor-pointer ${
                        isCurrent
                          ? 'bg-[var(--text)] text-white border-[var(--text)]'
                          : 'bg-white text-[var(--text)] border-[var(--border)]'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {opt.id !== 'all' && <span className="text-[11px] opacity-80 font-mono">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[var(--divider)]">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">
                Paid by Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MODE_OPTIONS.map((opt) => {
                  const isCurrent = filterMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onFilterMode(opt.id)}
                      className={`px-3 py-2 rounded-xl text-[12px] font-bold border transition-colors text-center cursor-pointer ${
                        isCurrent
                          ? 'bg-[var(--text)] text-white border-[var(--text)]'
                          : 'bg-white text-[var(--text)] border-[var(--border)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleApplyFilters}
                className="w-full py-3 px-4 rounded-full bg-[var(--primary)] text-white font-bold text-[14px] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check size={17} />
                <span>Apply Filters ({groups.reduce((s, g) => s + g.lines.length, 0)} results)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
