import React, { useMemo, useState } from 'react';
import { ChevronDown, Info, Search, X } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { money } from '../../../utils/billing';
import { billNetTotal, round2 } from '../../../utils/salesReturns';
import { isAdvanceAdjustmentRow } from '../../../utils/paymentAllocation';
import { todayISO, toLocalISODate } from '../../../utils/dateLocal';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { PaymentRecord, PaymentMode } from '../../../types';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { DailyCollectionStreamlinedPhone, MODE_OPTIONS, TYPE_OPTIONS } from './mobile/DailyCollectionStreamlinedPhone';

import type { ReportPeriod } from './reportPeriod';

export interface DailyCollectionStreamlinedProps {
  periodLabel: string;
  /** Same period test the other reports use, so the Reports period filter drives this screen too. */
  inPeriod: (date: string) => boolean;
  onBack?: () => void;
  period?: ReportPeriod;
  onPeriodChange?: (p: ReportPeriod) => void;
  startDate?: string;
  endDate?: string;
  onCustomRangeChange?: (start: string, end: string) => void;
}

export type CollectionFilterType = 'all' | 'due' | 'pay' | 'out';
export type CollectionModeFilter = 'all' | 'cash' | 'upi' | 'cheque';

export interface DisplayLine {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  subtitle: string;
  initial: string;
  iconTone: 'blue' | 'green' | 'red';
  amount: number;
  paid?: number;
  due?: number;
  kind: 'sale' | 'payment' | 'expense' | 'refund';
  mode: PaymentMode | string;
  isOut?: boolean;
  customerName?: string;
  billId?: number;
  paymentId?: string;
}

export interface DayCollectionGroup {
  date: string;
  dateLabel: string;
  isToday: boolean;
  isYesterday: boolean;
  totalCollected: number; // cashIn + digitalIn + chequeIn
  cashIn: number;
  digitalIn: number;
  chequeIn: number;
  out: number; // expenses & refunds
  netInHand: number; // totalCollected - out
  dueCreated: number;
  billed: number;
  salesCount: number;
  paymentsCount: number;
  expensesCount: number;
  lines: DisplayLine[];
}

export interface PeriodTotals {
  cashIn: number;
  digitalIn: number;
  chequeIn: number;
  grossCollected: number;
  out: number;
  netInHand: number;
  dueCreated: number;
  billed: number;
  salesCount: number;
  paymentsCount: number;
}

const MODE_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank Transfer',
  cheque: 'Cheque',
  credit: 'Credit',
  other: 'Other',
};

const KIND_LABEL: Record<DisplayLine['kind'], string> = {
  sale: 'Sale',
  payment: 'Collection',
  refund: 'Refund',
  expense: 'Expense',
};

const card = 'rounded-2xl border border-black/10 bg-white';

const formatDateHuman = (d: string): string => {
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDayLabel = (dateStr: string, todayStr: string, yesterdayStr: string): string => {
  if (dateStr === todayStr) return 'Today · ' + formatDateHuman(dateStr);
  if (dateStr === yesterdayStr) return 'Yesterday · ' + formatDateHuman(dateStr);
  return formatDateHuman(dateStr);
};

/** Does one line pass the type / mode / search filters? */
export const lineMatches = (
  l: DisplayLine,
  type: CollectionFilterType,
  mode: CollectionModeFilter,
  q: string,
): boolean => {
  if (q) {
    const hit =
      l.title.toLowerCase().includes(q) ||
      l.subtitle.toLowerCase().includes(q) ||
      (l.customerName || '').toLowerCase().includes(q) ||
      (l.billId != null && String(l.billId).includes(q));
    if (!hit) return false;
  }
  if (type === 'due' && (l.kind !== 'sale' || (l.due || 0) <= 0)) return false;
  if (type === 'pay' && l.kind !== 'payment') return false;
  if (type === 'out' && !l.isOut) return false;
  if (mode === 'cash' && l.mode !== 'cash') return false;
  if (mode === 'upi' && l.mode !== 'upi' && l.mode !== 'bank') return false;
  if (mode === 'cheque' && l.mode !== 'cheque') return false;
  return true;
};

/** Small round chip used for the filter rows (same look as the beat chips on the other reports). */
const FilterChip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
      on ? 'bg-emerald-700 text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
    }`}
  >
    {children}
  </button>
);

/**
 * Daily collection: one card per day (collapsed until tapped) showing what was collected, what went out and what
 * stayed due; open a day to see every sale, payment and expense. Uses the period chosen at the top of Reports.
 */
export const DailyCollectionStreamlined: React.FC<DailyCollectionStreamlinedProps> = ({ 
  periodLabel, 
  inPeriod,
  onBack,
  period,
  onPeriodChange,
  startDate,
  endDate,
  onCustomRangeChange,
}) => {
  const { bills, payments, expenses, orgProfile } = useLedger();

  const [filterType, setFilterType] = useState<CollectionFilterType>('all');
  const [filterMode, setFilterMode] = useState<CollectionModeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Days are closed until opened (kept as "open" so nothing is expanded by default).
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [isExplainModalOpen, setIsExplainModalOpen] = useState(false);

  const todayStr = useMemo(() => todayISO(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);

  // =========================================================================
  // Group by DAY and work out the money for each day
  // =========================================================================
  const { dayGroups, allLines, periodTotals } = useMemo(() => {
    const liveBills = (bills || []).filter((b) => b.status !== 'cancelled' && !b.cancelled);
    const billById = new Map(liveBills.map((b) => [b.id, b]));

    // Map payments by bill ID
    const billPaymentsMap = new Map<number, PaymentRecord[]>();
    (payments || []).forEach((p) => {
      if (!p.billId || p.isRefund) return;
      const list = billPaymentsMap.get(p.billId) || [];
      list.push(p);
      billPaymentsMap.set(p.billId, list);
    });

    const dayMap = new Map<string, DayCollectionGroup>();
    const getOrCreateDay = (d: string): DayCollectionGroup => {
      let g = dayMap.get(d);
      if (!g) {
        g = {
          date: d,
          dateLabel: formatDayLabel(d, todayStr, yesterdayStr),
          isToday: d === todayStr,
          isYesterday: d === yesterdayStr,
          totalCollected: 0,
          cashIn: 0,
          digitalIn: 0,
          chequeIn: 0,
          out: 0,
          netInHand: 0,
          dueCreated: 0,
          billed: 0,
          salesCount: 0,
          paymentsCount: 0,
          expensesCount: 0,
          lines: [],
        };
        dayMap.set(d, g);
      }
      return g;
    };

    const flatLines: DisplayLine[] = [];

    // 1. Process Bills for period (grouped by bill date)
    liveBills.forEach((b) => {
      const bDate = String(b.date || '').slice(0, 10);
      if (!inPeriod(bDate)) return;

      const net = billNetTotal(b);
      const rows = billPaymentsMap.get(b.id) || [];
      const sameDayRows = rows.filter(
        (p) => String(p.paymentDate || '').slice(0, 10) <= bDate && p.mode !== 'credit'
      );

      let paid = 0;
      let billCash = 0;
      let billDigital = 0;
      let billCheque = 0;
      let modeStr = '';
      let primaryMode: string = b.paymentMode || 'cash';

      if (rows.length === 0) {
        paid = Math.min(net, Number(b.amountPaid) || 0);
        const m = b.paymentMode || 'cash';
        primaryMode = m;
        if (m === 'cash') billCash = paid;
        else if (m === 'cheque') billCheque = paid;
        else billDigital = paid;
        modeStr = MODE_LABEL[m] || m;
      } else {
        sameDayRows.forEach((p) => {
          const a = Number(p.amount) || 0;
          paid += a;
          if (isAdvanceAdjustmentRow(p)) return;
          if (p.mode === 'cash') billCash += a;
          else if (p.mode === 'cheque') billCheque += a;
          else billDigital += a;
        });
        modeStr = Array.from(new Set(sameDayRows.map((p) => MODE_LABEL[p.mode] || p.mode))).join(' + ');
        paid = Math.min(net, round2(paid));
        if (sameDayRows[0]) primaryMode = sameDayRows[0].mode;
      }

      const billDue = Math.max(0, round2(net - paid));
      const day = getOrCreateDay(bDate);

      day.cashIn += billCash;
      day.digitalIn += billDigital;
      day.chequeIn += billCheque;
      day.totalCollected += (billCash + billDigital + billCheque);
      day.dueCreated += billDue;
      day.billed += net;
      day.salesCount += 1;

      const lineItem: DisplayLine = {
        id: `bill-${b.id}`,
        date: bDate,
        title: b.retailer || 'Cash Sale',
        subtitle: `Invoice #${b.id}${paid > 0 ? (modeStr ? ` · ${modeStr}` : '') : ' · On credit'}`,
        initial: (b.retailer || 'S')[0]?.toUpperCase() || 'S',
        iconTone: 'blue',
        amount: net,
        paid,
        due: billDue,
        kind: 'sale',
        mode: paid > 0 ? primaryMode : 'credit',
        customerName: b.retailer,
        billId: b.id,
      };

      day.lines.push(lineItem);
      flatLines.push(lineItem);
    });

    // 2. Process Later Payments & Advances (grouped by payment date)
    (payments || []).forEach((p) => {
      const pDate = String(p.paymentDate || p.createdAt || '').slice(0, 10);
      if (!inPeriod(pDate) || p.mode === 'credit') return;

      const amt = Number(p.amount) || 0;
      if (amt === 0) return;

      const modeStr = MODE_LABEL[p.mode] || p.mode;
      const day = getOrCreateDay(pDate);

      if (p.isRefund || amt < 0) {
        const refundAmt = Math.abs(amt);
        day.out += refundAmt;
        day.expensesCount += 1;

        const lineItem: DisplayLine = {
          id: `ref-${p.id}`,
          date: pDate,
          title: p.customerName || 'Customer',
          subtitle: `Refund issued · ${modeStr}`,
          initial: '↗',
          iconTone: 'red',
          amount: refundAmt,
          kind: 'refund',
          mode: p.mode,
          isOut: true,
          customerName: p.customerName,
        };

        day.lines.push(lineItem);
        flatLines.push(lineItem);
        return;
      }

      // Check if already counted on the same sale date upfront
      const linkedBill = p.billId ? billById.get(p.billId) : undefined;
      const billDay = linkedBill ? String(linkedBill.date || '').slice(0, 10) : '';
      if (linkedBill && pDate <= billDay) return;

      if (p.mode === 'cash') day.cashIn += amt;
      else if (p.mode === 'cheque') day.chequeIn += amt;
      else day.digitalIn += amt;

      day.totalCollected += amt;
      day.paymentsCount += 1;

      const lineItem: DisplayLine = {
        id: `pay-${p.id}`,
        date: pDate,
        title: p.customerName || (linkedBill ? linkedBill.retailer : 'Customer'),
        subtitle: linkedBill
          ? `Collection for #${p.billId} · ${modeStr}`
          : `Collection on account · ${modeStr}`,
        initial: '₹',
        iconTone: 'green',
        amount: amt,
        paid: amt,
        due: 0,
        kind: 'payment',
        mode: p.mode,
        customerName: p.customerName || linkedBill?.retailer,
        billId: p.billId,
        paymentId: p.id,
      };

      day.lines.push(lineItem);
      flatLines.push(lineItem);
    });

    // 3. Process Business Expenses (grouped by expense date)
    (expenses || []).forEach((e) => {
      const eDate = String(e.date || '').slice(0, 10);
      if (!inPeriod(eDate)) return;

      const amt = Number(e.amount) || 0;
      if (amt <= 0) return;

      const day = getOrCreateDay(eDate);
      day.out += amt;
      day.expensesCount += 1;

      const lineItem: DisplayLine = {
        id: `exp-${e.id}`,
        date: eDate,
        title: e.paidTo ? `${e.category} · ${e.paidTo}` : (e.category || 'Business Expense'),
        subtitle: e.note || 'Expense paid out',
        initial: '↗',
        iconTone: 'red',
        amount: amt,
        kind: 'expense',
        mode: e.mode || 'cash',
        isOut: true,
      };

      day.lines.push(lineItem);
      flatLines.push(lineItem);
    });

    // Compute net for each day
    dayMap.forEach((g) => {
      g.netInHand = g.totalCollected - g.out;
    });

    // Sort days descending by date (Today first, then Yesterday, then older)
    const sortedDays = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    // Calculate grand period totals
    let periodCash = 0;
    let periodDigital = 0;
    let periodCheque = 0;
    let periodTotalCollected = 0;
    let periodOut = 0;
    let periodDue = 0;
    let periodBilled = 0;
    let periodSalesCount = 0;
    let periodPaymentsCount = 0;

    sortedDays.forEach((d) => {
      periodCash += d.cashIn;
      periodDigital += d.digitalIn;
      periodCheque += d.chequeIn;
      periodTotalCollected += d.totalCollected;
      periodOut += d.out;
      periodDue += d.dueCreated;
      periodBilled += d.billed;
      periodSalesCount += d.salesCount;
      periodPaymentsCount += d.paymentsCount;
    });

    const periodNetInHand = periodTotalCollected - periodOut;

    return {
      dayGroups: sortedDays,
      allLines: flatLines,
      periodTotals: {
        cashIn: round2(periodCash),
        digitalIn: round2(periodDigital),
        chequeIn: round2(periodCheque),
        grossCollected: round2(periodTotalCollected),
        out: round2(periodOut),
        netInHand: round2(periodNetInHand),
        dueCreated: round2(periodDue),
        billed: round2(periodBilled),
        salesCount: periodSalesCount,
        paymentsCount: periodPaymentsCount,
      },
    };
  }, [bills, payments, expenses, inPeriod, todayStr, yesterdayStr]);


  // =========================================================================
  // Filters (search + type + payment mode)
  // =========================================================================
  const q = searchQuery.toLowerCase().trim();
  const isFiltered = filterType !== 'all' || filterMode !== 'all' || q.length > 0;

  const typeCounts = useMemo<Record<CollectionFilterType, number>>(
    () => ({
      all: allLines.length,
      due: allLines.filter((l) => l.kind === 'sale' && (l.due || 0) > 0).length,
      pay: allLines.filter((l) => l.kind === 'payment').length,
      out: allLines.filter((l) => l.isOut).length,
    }),
    [allLines],
  );

  const filteredDayGroups = useMemo(
    () =>
      dayGroups
        .map((g) => ({ ...g, lines: g.lines.filter((l) => lineMatches(l, filterType, filterMode, q)) }))
        .filter((g) => g.lines.length > 0),
    [dayGroups, filterType, filterMode, q],
  );
  const shownCount = filteredDayGroups.reduce((s, g) => s + g.lines.length, 0);

  const resetFilters = () => {
    setFilterType('all');
    setFilterMode('all');
    setSearchQuery('');
  };

  // A day is open only when tapped. While searching, matching days open so results are never hidden.
  const forceOpen = q.length > 0;
  const isOpen = (date: string) => forceOpen || openDays.has(date);
  const toggleDay = (date: string) =>
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  const allOpen = filteredDayGroups.length > 0 && filteredDayGroups.every((g) => openDays.has(g.date));
  const toggleAll = () => setOpenDays(allOpen ? new Set() : new Set(filteredDayGroups.map((g) => g.date)));

  // =========================================================================
  // Downloads
  // =========================================================================
  const shop = orgProfile?.name || 'MrWater Distribution';
  const filterText = [
    filterType !== 'all' ? TYPE_OPTIONS.find((o) => o.id === filterType)?.label : '',
    filterMode !== 'all' ? MODE_OPTIONS.find((o) => o.id === filterMode)?.label : '',
    q ? `Search "${searchQuery.trim()}"` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const txnLines = filteredDayGroups.flatMap((g) => g.lines);

  const exportExcel = () =>
    downloadXlsx(`daily-collection-${fileStamp()}.xlsx`, [
      {
        name: 'Day-wise summary',
        header: ['Date', 'Bills', 'Billed', 'Cash', 'UPI / bank', 'Cheque', 'Total collected', 'New due', 'Paid out', 'Net in hand'],
        rows: dayGroups.map((d) => [d.date, d.salesCount, d.billed, d.cashIn, d.digitalIn, d.chequeIn, d.totalCollected, d.dueCreated, d.out, d.netInHand]),
        total: ['Total', periodTotals.salesCount, periodTotals.billed, periodTotals.cashIn, periodTotals.digitalIn, periodTotals.chequeIn, periodTotals.grossCollected, periodTotals.dueCreated, periodTotals.out, periodTotals.netInHand],
      },
      {
        name: 'Transactions',
        header: ['Date', 'Party / item', 'Details', 'Type', 'Mode', 'Amount', 'Paid', 'Due'],
        rows: txnLines.map((l) => [l.date, l.title, l.subtitle, KIND_LABEL[l.kind], MODE_LABEL[l.mode] || l.mode, l.amount, l.paid || 0, l.due || 0]),
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `daily-collection-${fileStamp()}.pdf`,
      title: 'Daily collection',
      subtitle: [shop, `Period: ${periodLabel}`, ...(filterText ? [`Transactions filtered: ${filterText}`] : [])],
      landscape: true,
      sections: [
        {
          title: 'Day-wise summary',
          header: ['Date', 'Bills', 'Billed (Rs.)', 'Cash (Rs.)', 'UPI / bank (Rs.)', 'Cheque (Rs.)', 'Collected (Rs.)', 'New due (Rs.)', 'Paid out (Rs.)', 'Net in hand (Rs.)'],
          rows: dayGroups.map((d) => [formatDateHuman(d.date), d.salesCount, money(d.billed), money(d.cashIn), money(d.digitalIn), money(d.chequeIn), money(d.totalCollected), money(d.dueCreated), money(d.out), money(d.netInHand)]),
          total: ['Total', periodTotals.salesCount, money(periodTotals.billed), money(periodTotals.cashIn), money(periodTotals.digitalIn), money(periodTotals.chequeIn), money(periodTotals.grossCollected), money(periodTotals.dueCreated), money(periodTotals.out), money(periodTotals.netInHand)],
          rightAlign: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        },
        {
          title: 'Transactions',
          header: ['Date', 'Party / item', 'Details', 'Type', 'Amount (Rs.)', 'Paid (Rs.)', 'Due (Rs.)'],
          rows: txnLines.map((l) => [l.date, l.title, l.subtitle, KIND_LABEL[l.kind], money(l.amount), l.paid !== undefined ? money(l.paid) : '', l.due !== undefined ? money(l.due) : '']),
          rightAlign: [4, 5, 6],
        },
      ],
    });

  const stat = (label: string, value: string, tone: string, sub?: string) => (
    <div className={`${card} p-3`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );

  return (
    <>
      <DailyCollectionStreamlinedPhone
        periodLabel={periodLabel}
        totals={periodTotals}
        groups={filteredDayGroups}
        hasAny={dayGroups.length > 0}
        typeCounts={typeCounts}
        filterType={filterType}
        onFilterType={setFilterType}
        filterMode={filterMode}
        onFilterMode={setFilterMode}
        search={searchQuery}
        onSearch={setSearchQuery}
        isFiltered={isFiltered}
        onReset={resetFilters}
        isOpen={isOpen}
        onToggleDay={toggleDay}
        forceOpen={forceOpen}
        allOpen={allOpen}
        onToggleAll={toggleAll}
        onExplain={() => setIsExplainModalOpen(true)}
        onExcel={exportExcel}
        onPdf={exportPdf}
        onBack={onBack}
        period={period}
        onPeriodChange={onPeriodChange}
        startDate={startDate}
        endDate={endDate}
        onCustomRangeChange={onCustomRangeChange}
      />

      <div className="hidden md:block space-y-3" id="report-daily-collection">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">Daily collection</h2>
            <p className="text-xs text-slate-500">{periodLabel} · day by day: money in, money out and new due</p>
          </div>
          <ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={dayGroups.length === 0} />
        </div>

        {/* Totals */}
        <div className="grid grid-cols-4 gap-2">
          {stat('Collected', `₹${money(periodTotals.grossCollected)}`, 'text-emerald-700', `${periodTotals.salesCount} sales · ${periodTotals.paymentsCount} payments`)}
          {stat('Paid out', `₹${money(periodTotals.out)}`, periodTotals.out > 0 ? 'text-rose-700' : 'text-slate-900', 'expenses & refunds')}
          {stat('Net in hand', `₹${money(periodTotals.netInHand)}`, periodTotals.netInHand < 0 ? 'text-rose-700' : 'text-slate-900', 'collected − paid out')}
          {stat('New due', `₹${money(periodTotals.dueCreated)}`, 'text-amber-700', `on ₹${money(periodTotals.billed)} billed`)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
          <span>
            Cash ₹{money(periodTotals.cashIn)} · UPI / bank ₹{money(periodTotals.digitalIn)}
            {periodTotals.chequeIn > 0 && <> · Cheque ₹{money(periodTotals.chequeIn)}</>}
          </span>
          <button
            type="button"
            onClick={() => setIsExplainModalOpen(true)}
            className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline cursor-pointer"
          >
            <Info size={13} aria-hidden="true" /> How is this calculated?
          </button>
        </div>

        {/* Filters: always visible, no pop-up */}
        <div className={`${card} p-3 space-y-2.5`}>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              enterKeyHint="search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, invoice no or note"
              className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-1.5 overflow-x-auto" role="group" aria-label="Show">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mr-0.5">Show</span>
              {TYPE_OPTIONS.map((o) => (
                <FilterChip key={o.id} on={filterType === o.id} onClick={() => setFilterType(o.id)}>
                  {o.label}
                  {o.id !== 'all' && <span className="opacity-70"> {typeCounts[o.id]}</span>}
                </FilterChip>
              ))}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto" role="group" aria-label="Paid by">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mr-0.5">Paid by</span>
              {MODE_OPTIONS.map((o) => (
                <FilterChip key={o.id} on={filterMode === o.id} onClick={() => setFilterMode(o.id)}>
                  {o.label}
                </FilterChip>
              ))}
            </div>
            {isFiltered && (
              <button type="button" onClick={resetFilters} className="ml-auto text-xs font-bold text-rose-600 hover:underline cursor-pointer">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Days */}
        {filteredDayGroups.length > 1 && !forceOpen && (
          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
            <span>
              {filteredDayGroups.length} days · {shownCount} transaction{shownCount === 1 ? '' : 's'}
              {isFiltered ? ' match' : ''}
            </span>
            <button type="button" onClick={toggleAll} className="font-bold text-slate-700 hover:underline cursor-pointer">
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        )}

        {filteredDayGroups.length === 0 && (
          <div className={`${card} py-10 text-center text-sm text-slate-400`}>
            {isFiltered ? (
              <>
                Nothing matches these filters.{' '}
                <button type="button" onClick={resetFilters} className="font-bold text-slate-700 underline cursor-pointer">
                  Clear filters
                </button>
              </>
            ) : (
              'No sales, payments or expenses in this period'
            )}
          </div>
        )}

        {filteredDayGroups.map((g) => {
          const open = isOpen(g.date);
          return (
            <section key={g.date} className={`${card} overflow-hidden`}>
              <button
                type="button"
                onClick={() => toggleDay(g.date)}
                aria-expanded={open}
                disabled={forceOpen}
                className="w-full text-left px-3.5 py-2.5 bg-[#faf8f5] cursor-pointer active:bg-slate-100 disabled:cursor-default"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-slate-900">{g.dateLabel}</div>
                    <div className="text-[11px] text-slate-500">
                      {g.lines.length} transaction{g.lines.length === 1 ? '' : 's'}
                      {` · ${g.salesCount} sale${g.salesCount === 1 ? '' : 's'} · ${g.paymentsCount} payment${g.paymentsCount === 1 ? '' : 's'}`}
                      {g.expensesCount > 0 && ` · ${g.expensesCount} paid out`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden lg:flex items-center gap-4 text-xs text-slate-600 tabular-nums">
                      <span>Cash ₹{money(g.cashIn)}</span>
                      <span>UPI ₹{money(g.digitalIn)}</span>
                      {g.dueCreated > 0 && <span className="text-amber-700 font-semibold">Due ₹{money(g.dueCreated)}</span>}
                      {g.out > 0 && <span className="text-rose-700 font-semibold">Out ₹{money(g.out)}</span>}
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500">Collected</div>
                      <div className="text-[14px] font-extrabold text-emerald-700 tabular-nums leading-tight">₹{money(g.totalCollected)}</div>
                    </div>
                    {!forceOpen && <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />}
                  </div>
                </div>
              </button>

              {open && (
                <ul className="divide-y divide-black/5 border-t border-black/5">
                  {g.lines.map((l) => (
                    <li key={l.id} className="px-3.5 py-2.5 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold text-slate-900 leading-snug break-words">{l.title}</div>
                        <div className="text-xs text-slate-500 leading-snug break-words">{l.subtitle}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`text-[14px] font-extrabold tabular-nums ${
                            l.isOut ? 'text-rose-700' : l.kind === 'payment' ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {l.isOut ? `−₹${money(l.amount)}` : `₹${money(l.amount)}`}
                        </div>
                        {l.kind === 'sale' ? (
                          (l.due || 0) > 0.004 ? (
                            <div className="text-[11px] font-semibold text-rose-700">
                              {(l.paid || 0) > 0 ? `Paid ₹${money(l.paid || 0)} · ` : ''}Due ₹{money(l.due || 0)}
                            </div>
                          ) : (
                            <div className="text-[11px] font-semibold text-emerald-700">Paid in full</div>
                          )
                        ) : (
                          <div className="text-[11px] text-slate-400">{KIND_LABEL[l.kind]}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {isExplainModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsExplainModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="How daily collection is calculated"
        >
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-3 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">How this is calculated</h3>
              <button type="button" aria-label="Close" onClick={() => setIsExplainModalOpen(false)} className="size-9 rounded-xl text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-xs leading-relaxed text-slate-700">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="font-bold text-slate-900">Collected: ₹{money(periodTotals.grossCollected)}</div>
                <p className="text-slate-600">
                  Money actually received in this period: paid at billing plus payments received later, counted on the day it came in.
                </p>
                <p className="mt-1 font-semibold tabular-nums">
                  Cash ₹{money(periodTotals.cashIn)} · UPI / bank ₹{money(periodTotals.digitalIn)}
                  {periodTotals.chequeIn > 0 && <> · Cheque ₹{money(periodTotals.chequeIn)}</>}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
                <div className="font-bold text-rose-800">Paid out: −₹{money(periodTotals.out)}</div>
                <p className="text-rose-700">Business expenses and customer refunds paid in this period.</p>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                <div className="font-bold text-emerald-900">Net in hand: ₹{money(periodTotals.netInHand)}</div>
                <p className="text-emerald-800 tabular-nums">
                  ₹{money(periodTotals.grossCollected)} collected − ₹{money(periodTotals.out)} paid out
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                <div className="font-bold text-amber-900">New due: ₹{money(periodTotals.dueCreated)}</div>
                <p className="text-amber-800">
                  <strong>Not money in hand.</strong> The part of this period&apos;s bills that was not paid on the day of the sale.
                </p>
                <p className="mt-1 font-semibold text-amber-900 tabular-nums">
                  ₹{money(periodTotals.billed)} billed − ₹{money(round2(periodTotals.billed - periodTotals.dueCreated))} paid on the day = ₹{money(periodTotals.dueCreated)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <button type="button" onClick={() => setIsExplainModalOpen(false)} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
