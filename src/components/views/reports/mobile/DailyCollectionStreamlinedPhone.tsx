import React, { useState } from 'react';
import { 
  ArrowLeft, 
  ArrowDown, 
  Calendar, 
  ChevronDown, 
  Filter, 
  Search, 
  X, 
  Clock, 
  SlidersHorizontal, 
  Check, 
  Receipt, 
  ArrowUpRight, 
  Info 
} from 'lucide-react';
import type {
  CollectionFilterType,
  CollectionModeFilter,
  DayCollectionGroup,
  PeriodTotals,
} from '../DailyCollectionStreamlined';
import type { ReportPeriod } from '../reportPeriod';
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
  /** The Day book / By customer switch, shown under the back button. */
  topExtra?: React.ReactNode;
  periodLabel: string;
  totals: PeriodTotals;
  /** Days after search / type / mode filters. */
  groups: DayCollectionGroup[];
  /** Is there anything at all in the period (before filters)? */
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
  /** True while searching: matching days stay open. */
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

/** Format date string "YYYY-MM-DD" as "05 November 2026" matching attached screenshot. */
const formatCardDate = (dateStr: string): string => {
  const dt = new Date(`${dateStr}T12:00:00`);
  if (isNaN(dt.getTime())) return dateStr;
  const day = String(dt.getDate()).padStart(2, '0');
  const month = dt.toLocaleString('en-US', { month: 'long' });
  const year = dt.getFullYear();
  return `${day} ${month} ${year}`;
};

/** Banknotes stack SVG icon matching the green 3D cash icon in screenshot. */
const BanknotesStackIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[#059669]">
    <path d="M4 14L12 18L20 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 10L12 14L20 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 2L20 6L12 10L4 6L12 2Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="6" r="1.5" fill="currentColor" />
  </svg>
);

/** 3-bar chart icon matching the white header icon in screenshot. */
const BarChartThreeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white shrink-0">
    <rect x="3" y="11" width="4" height="10" rx="1.5" fill="white" />
    <rect x="10" y="6" width="4" height="15" rx="1.5" fill="white" />
    <rect x="17" y="2" width="4" height="19" rx="1.5" fill="white" />
  </svg>
);

export const DailyCollectionStreamlinedPhone: React.FC<DailyCollectionStreamlinedPhoneProps> = ({
  topExtra,
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
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  // Calculate cash vs total collection percentage for progress bar
  const totalReceived = totals.grossCollected || 1;
  const cashPercentage = Math.round((totals.cashIn / totalReceived) * 100);

  // Active filter count (to highlight filter button)
  const isPeriodFiltered = period !== 'thisMonth' && period !== 'all';
  const activeFilterCount = (filterType !== 'all' ? 1 : 0) + (filterMode !== 'all' ? 1 : 0) + (isPeriodFiltered ? 1 : 0);

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

  return (
    <div className="md:hidden min-h-screen bg-gradient-to-b from-[#EBF2FE] via-[#F3F6FD] to-[#F8FAFC] px-4 pt-4 pb-24 space-y-3.5 text-slate-900 selection:bg-blue-600 selection:text-white" id="daily-collection-mobile-screen">
      
      {/* 1. BACK TO REPORTS PILL BUTTON */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 border border-blue-100/90 text-slate-800 font-bold text-xs shadow-xs hover:bg-white active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft size={15} className="text-slate-700" />
          <span>Reports</span>
        </button>
      </div>

      {topExtra}

      {/* 3. HERO CARD: DAILY COLLECTION */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1E48] via-[#08183A] to-[#040E24] p-5 text-white shadow-xl shadow-blue-950/20">
        {/* Top row: Title & Calendar Icon */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BarChartThreeIcon />
            <h2 className="text-lg font-bold text-white tracking-tight">Collections</h2>
          </div>

          <button
            type="button"
            onClick={() => setIsFilterSheetOpen(true)}
            aria-label="Change date period"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer"
            title={periodLabel}
          >
            <Calendar size={18} />
          </button>
        </div>

        {/* Big Amount */}
        <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-none my-3 font-sans tabular-nums">
          {rs(totals.grossCollected)}
        </div>

        {/* Progress Bar (Neon Green to Cyan Gradient) */}
        <div className="w-full bg-white/15 h-2.5 rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#10B981] via-[#06D6A0] to-[#00E5FF] transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(12, cashPercentage || 85))}%` }}
          />
        </div>

        {/* Bottom Legend: Cash & UPI breakdown */}
        <div className="flex items-center gap-3 text-xs font-semibold text-white/95">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0" />
            <span>Cash {rs(totals.cashIn)}</span>
          </div>

          <span className="text-white/30 font-normal">|</span>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00E5FF] shrink-0" />
            <span>UPI {rs(totals.digitalIn)}</span>
          </div>

          {totals.chequeIn > 0 && (
            <>
              <span className="text-white/30 font-normal">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#A855F7] shrink-0" />
                <span>Cheque {rs(totals.chequeIn)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 4. SEARCH BAR WITH FILTER BUTTON */}
      <div className="bg-white rounded-2xl border border-blue-100/90 shadow-xs px-3.5 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            type="text"
            enterKeyHint="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search customer or invoice number..."
            className="w-full text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearch('')}
              className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer shrink-0"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="h-5 w-px bg-slate-200 mx-1 shrink-0" />

        <button
          type="button"
          onClick={() => setIsFilterSheetOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-all shrink-0 cursor-pointer font-bold text-xs sm:text-sm ${
            activeFilterCount > 0
              ? 'bg-blue-50 text-blue-700'
              : 'text-blue-600 hover:bg-blue-50 active:scale-95'
          }`}
        >
          <Filter size={15} className="text-blue-600 stroke-[2.2]" />
          <span>Filter</span>
          {activeFilterCount > 0 ? (
            <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center ml-0.5">
              {activeFilterCount}
            </span>
          ) : (
            <ChevronDown size={14} className="text-blue-600 stroke-[2.5]" />
          )}
        </button>
      </div>

      {/* 5. 3 KPI SUMMARY CARDS */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Paid out Card */}
        <div className="bg-[#FDF2F4] border border-[#FCE0E5] rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[11px] font-semibold text-slate-600">Paid out</span>
          <span className="text-sm sm:text-base font-extrabold text-[#E11D48] tracking-tight leading-tight my-1 tabular-nums">
            {rs(totals.out)}
          </span>
          <div className="w-7 h-7 rounded-full bg-[#FCE8EB] flex items-center justify-center text-[#E11D48] mt-0.5">
            <ArrowDown size={14} strokeWidth={2.5} />
          </div>
        </div>

        {/* Net in hand Card */}
        <div className="bg-[#EFFBF5] border border-[#DCF5E8] rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[11px] font-semibold text-slate-600">Net in hand</span>
          <span className="text-sm sm:text-base font-extrabold text-[#059669] tracking-tight leading-tight my-1 tabular-nums">
            {rs(totals.netInHand)}
          </span>
          <div className="w-7 h-7 rounded-full bg-[#DCFCE7] flex items-center justify-center text-[#059669] mt-0.5">
            <BanknotesStackIcon />
          </div>
        </div>

        {/* New due Card */}
        <div className="bg-[#FEF6EE] border border-[#FDE7D2] rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[11px] font-semibold text-slate-600">New due</span>
          <span className="text-sm sm:text-base font-extrabold text-[#EA580C] tracking-tight leading-tight my-1 tabular-nums">
            {rs(totals.dueCreated)}
          </span>
          <div className="w-7 h-7 rounded-full bg-[#FFEDD5] flex items-center justify-center text-[#EA580C] mt-0.5">
            <Clock size={14} strokeWidth={2.5} />
          </div>
        </div>
      </div>

      {/* 6. ACTIVITY SECTION HEADER */}
      <div className="flex items-center justify-between px-1 pt-2">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm sm:text-base">
          <Calendar size={18} className="text-blue-600" />
          <span>{groups.length} days of activity</span>
        </div>

        {groups.length > 0 && !forceOpen && (
          <button
            type="button"
            onClick={onToggleAll}
            className="text-xs sm:text-sm font-semibold text-blue-600 flex items-center gap-1 cursor-pointer hover:underline"
          >
            <span>{allOpen ? 'Collapse all' : 'Expand all'}</span>
            <ChevronDown size={14} className={`transition-transform ${allOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Empty State */}
      {groups.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 px-4 text-center text-sm text-slate-500 shadow-xs space-y-2">
          <p className="font-semibold text-slate-700">
            {hasAny && isFiltered ? 'No transactions match these filters' : 'Nothing recorded in this period'}
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={handleResetAll}
              className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* 7. DAILY ACTIVITY CARDS LIST */}
      <div className="space-y-3">
        {groups.map((g) => {
          const open = isOpen(g.date);
          const custCount = new Set(g.lines.map((l) => l.customerName).filter(Boolean)).size || (g.salesCount > 0 ? g.salesCount : 1);
          
          return (
            <div
              key={g.date}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-all"
            >
              {/* Day Header Row */}
              <button
                type="button"
                onClick={() => onToggleDay(g.date)}
                aria-expanded={open}
                disabled={forceOpen}
                className="w-full text-left p-3.5 flex items-center justify-between gap-3 cursor-pointer active:bg-slate-50/80 disabled:cursor-default"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-snug">
                    {formatCardDate(g.date)}
                  </div>
                  <div className="text-xs text-slate-500 font-normal mt-0.5">
                    {g.salesCount} invoices • {custCount} customers • {g.paymentsCount} payments
                    {g.expensesCount > 0 ? ` • ${g.expensesCount} paid out` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="bg-[#E8FAF0] text-[#059669] px-3.5 py-1.5 rounded-full font-extrabold text-xs sm:text-sm tabular-nums">
                    {rs(g.totalCollected)}
                  </span>
                  {!forceOpen && (
                    <ChevronDown
                      size={18}
                      className={`text-slate-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    />
                  )}
                </div>
              </button>

              {/* Day Transactions List (Expanded) */}
              {open && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-[#FAFCFF]">
                  {g.lines.map((l) => {
                    const isSale = l.kind === 'sale';
                    return (
                      <li key={l.id} className="p-3.5 flex items-start gap-3">
                        <div
                          className={`size-10 shrink-0 rounded-xl flex items-center justify-center font-bold text-sm ${
                            l.isOut
                              ? 'bg-rose-50 text-rose-700'
                              : isSale
                                ? 'bg-sky-50 text-sky-700'
                                : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {l.isOut ? <ArrowUpRight size={18} /> : isSale ? <Receipt size={18} /> : '₹'}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-slate-900 leading-snug break-words">{l.title}</div>
                          <div className="text-xs text-slate-500 leading-snug break-words mt-0.5">{l.subtitle}</div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
                            className={`text-sm sm:text-base font-extrabold tabular-nums leading-tight ${
                              l.isOut ? 'text-rose-700' : l.kind === 'payment' ? 'text-emerald-700' : 'text-slate-900'
                            }`}
                          >
                            {l.isOut ? '−' : ''}
                            {rs(l.amount)}
                          </div>
                          {isSale && <div className="text-[11px] text-slate-400 mt-0.5">invoice</div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* 8. HOW IS THIS CALCULATED BUTTON */}
      <div className="text-center pt-2">
        <button
          type="button"
          onClick={onExplain}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <Info size={14} />
          <span>How is daily collection calculated?</span>
        </button>
      </div>

      {/* 9. EXCEL & PDF DOWNLOAD BAR */}
      <PhoneDownloadBar onExcel={onExcel} onPdf={onPdf} disabled={!hasAny} />

      {/* ========================================================== */}
      {/* 10. FILTER BOTTOM SHEET MODAL (Moved all filters to icon)  */}
      {/* ========================================================== */}
      {isFilterSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setIsFilterSheetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Filter Collection"
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-4 max-h-[88vh] overflow-y-auto animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-blue-600" />
                <h3 className="text-base font-extrabold text-slate-900">Filters</h3>
              </div>
              <div className="flex items-center gap-3">
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    Reset all
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close filters"
                  onClick={() => setIsFilterSheetOpen(false)}
                  className="size-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Section 1: Date Period Filter */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date Period</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PERIOD_PRESETS.map((p) => {
                  const isCurrent = period === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onPeriodChange && onPeriodChange(p.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors text-center ${
                        isCurrent
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom Range Date Pickers */}
              {period === 'customRange' && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">From Date</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full text-xs font-bold p-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">To Date</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full text-xs font-bold p-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Show / Transaction Type Filter */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Transaction Type</label>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((opt) => {
                  const isCurrent = filterType === opt.id;
                  const count = typeCounts[opt.id];
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onFilterType(opt.id)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors flex items-center justify-between ${
                        isCurrent
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {opt.id !== 'all' && (
                        <span className={`text-[11px] ml-1.5 opacity-80 font-mono`}>{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Paid by / Mode Filter */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Paid by Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {MODE_OPTIONS.map((opt) => {
                  const isCurrent = filterMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onFilterMode(opt.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors text-center ${
                        isCurrent
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Apply Button */}
            <div className="pt-3">
              <button
                type="button"
                onClick={handleApplyFilters}
                className="w-full py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check size={18} />
                <span>Apply Filters ({groups.reduce((s, g) => s + g.lines.length, 0)} results)</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
