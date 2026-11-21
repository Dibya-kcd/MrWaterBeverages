import React, { useMemo, useState } from 'react';
import { ChevronDown, MessageCircle, Plus, Search, X } from 'lucide-react';
import { money } from '../../../utils/billing';
import { dueGapNote } from '../../../utils/dueSummary';
import { todayISO, toLocalISODate } from '../../../utils/dateLocal';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import {
  ExplainBox,
  ReportBreakdownLine,
  ReportChipGroup,
  ReportEmpty,
  ReportExplainModal,
  ReportFilterPanel,
  ReportGroupCard,
  ReportListMeta,
  ReportStat,
  ReportStatGrid,
  ReportTitleBar,
} from './ReportKit';
import { MobileReportTopBar } from './mobile/MobileReportContext';
import {
  MiniStat,
  PhoneDownloadBar,
  rs,
} from './mobile/PhoneKit';

interface DebtorItem {
  retailer: string;
  phone?: string;
  balance: number;
  billsCount: number;
  totalBilled: number;
  totalPaid: number;
  lastBillDate?: string;
  aging: {
    current: number;
    due15: number;
    overdue30: number;
  };
}

interface ReceivablesReportProps {
  debtorsLedger: DebtorItem[];
  /** Customer-ledger total due (opening balance + billed - paid): the one "due" figure every report shares. */
  ledgerTotalDue?: number;
  orgProfile?: { name?: string };
  onRecordPayment: (retailer: string) => void;
}

type SortOrder = 'latestDay' | 'balance' | 'overdue';
type AgeFilter = 'all' | 'overdue' | 'old' | 'current';

const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: 'latestDay', label: 'Latest bill' },
  { id: 'balance', label: 'Highest due' },
  { id: 'overdue', label: 'Most overdue' },
];

const AGE_OPTIONS: { id: AgeFilter; label: string }[] = [
  { id: 'all', label: 'All parties' },
  { id: 'overdue', label: 'Overdue 15+ days' },
  { id: 'old', label: 'Over 30 days' },
  { id: 'current', label: 'Current only' },
];

const overdueOf = (d: DebtorItem) => d.aging.due15 + d.aging.overdue30;

const ageMatches = (d: DebtorItem, f: AgeFilter): boolean => {
  if (f === 'overdue') return overdueOf(d) > 0.004;
  if (f === 'old') return d.aging.overdue30 > 0.004;
  if (f === 'current') return overdueOf(d) <= 0.004;
  return true;
};

const formatFriendlyDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

/**
 * Party credit, laid out like "Daily collection": totals on top, always-visible search + filters, then one
 * collapsed card per customer (open it for the ageing split, invoiced / paid and the Pay / WhatsApp buttons).
 */
export const ReceivablesReport: React.FC<ReceivablesReportProps> = ({ debtorsLedger, orgProfile, onRecordPayment, ledgerTotalDue }) => {
  const [sortOrder, setSortOrder] = useState<SortOrder>('latestDay');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [search, setSearch] = useState('');
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [explainOpen, setExplainOpen] = useState(false);

  const todayStr = useMemo(() => todayISO(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);

  const totals = useMemo(
    () => ({
      due: debtorsLedger.reduce((s, d) => s + d.balance, 0),
      current: debtorsLedger.reduce((s, d) => s + d.aging.current, 0),
      d15: debtorsLedger.reduce((s, d) => s + d.aging.due15, 0),
      d30: debtorsLedger.reduce((s, d) => s + d.aging.overdue30, 0),
      billed: debtorsLedger.reduce((s, d) => s + d.totalBilled, 0),
      paid: debtorsLedger.reduce((s, d) => s + d.totalPaid, 0),
    }),
    [debtorsLedger],
  );
  const overdueTotal = totals.d15 + totals.d30;
  // Headline = customer-ledger total (same as Overview, Home and the Beat report). The ageing below is built from
  // unpaid bills, so any opening balance / advance is shown as the gap instead of silently changing the total.
  const headlineDue = ledgerTotalDue ?? totals.due;
  const dueGap = ledgerTotalDue !== undefined ? dueGapNote(headlineDue, totals.due) : '';

  const [showPhoneSearch, setShowPhoneSearch] = useState(false);
  const q = search.toLowerCase().trim();
  const isFiltered = ageFilter !== 'all' || q.length > 0;

  const ageCounts = useMemo<Record<AgeFilter, number>>(
    () => ({
      all: debtorsLedger.length,
      overdue: debtorsLedger.filter((d) => ageMatches(d, 'overdue')).length,
      old: debtorsLedger.filter((d) => ageMatches(d, 'old')).length,
      current: debtorsLedger.filter((d) => ageMatches(d, 'current')).length,
    }),
    [debtorsLedger],
  );

  const rows = useMemo(() => {
    const filtered = debtorsLedger.filter(
      (d) => ageMatches(d, ageFilter) && (!q || d.retailer.toLowerCase().includes(q) || (d.phone || '').includes(q)),
    );
    return filtered.sort((a, b) => {
      if (sortOrder === 'latestDay') {
        const dCmp = (b.lastBillDate || '').localeCompare(a.lastBillDate || '');
        return dCmp !== 0 ? dCmp : b.balance - a.balance;
      }
      if (sortOrder === 'overdue') {
        const o = overdueOf(b) - overdueOf(a);
        return o !== 0 ? o : b.balance - a.balance;
      }
      return b.balance - a.balance;
    });
  }, [debtorsLedger, ageFilter, q, sortOrder]);

  const shownDue = rows.reduce((s, d) => s + d.balance, 0);

  const resetFilters = () => {
    setAgeFilter('all');
    setSearch('');
  };

  const keyOf = (d: DebtorItem) => d.retailer.trim().toLowerCase();
  const forceOpen = q.length > 0;
  const isOpen = (k: string) => forceOpen || openKeys.has(k);
  const toggle = (k: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const allOpen = rows.length > 0 && rows.every((d) => openKeys.has(keyOf(d)));
  const toggleAll = () => setOpenKeys(allOpen ? new Set() : new Set(rows.map(keyOf)));

  const waLinkFor = (d: DebtorItem) => {
    if (!d.phone) return null;
    const text = encodeURIComponent(
      `Dear ${d.retailer},\nGreetings from ${orgProfile?.name || 'MrWater Distribution'}.\nThis is a friendly reminder that your outstanding balance is ₹${money(
        d.balance,
      )} against beverage delivery bills.\nKindly clear the dues at your earliest convenience. Thank you!`,
    );
    return `https://wa.me/91${d.phone.replace(/[^0-9]/g, '')}?text=${text}`;
  };

  const dayTag = (d: DebtorItem) => {
    const day = d.lastBillDate?.slice(0, 10) || '';
    return day === todayStr ? 'Today' : day === yesterdayStr ? 'Yesterday' : '';
  };

  // ---- downloads (same files as before, now follow the filters) ----------------------------------
  const shop = orgProfile?.name || 'MrWater Distribution';
  const filterText = [
    ageFilter !== 'all' ? AGE_OPTIONS.find((o) => o.id === ageFilter)?.label : '',
    q ? `Search "${search.trim()}"` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const exportExcel = () =>
    downloadXlsx(`party-credit-${fileStamp()}.xlsx`, [
      {
        name: 'Debtors Aging',
        header: ['Retailer', 'Phone', 'Outstanding Due (Rs)', 'Current 0-15d (Rs)', 'Overdue 15-30d (Rs)', 'Overdue >30d (Rs)', 'Last Bill Date', 'Total Bills'],
        rows: rows.map((d) => [d.retailer, d.phone || '-', d.balance, d.aging.current, d.aging.due15, d.aging.overdue30, d.lastBillDate || '-', d.billsCount]),
        total: [
          'Total',
          '',
          shownDue,
          rows.reduce((s, d) => s + d.aging.current, 0),
          rows.reduce((s, d) => s + d.aging.due15, 0),
          rows.reduce((s, d) => s + d.aging.overdue30, 0),
          '',
          '',
        ],
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `party-credit-${fileStamp()}.pdf`,
      title: 'Party credit',
      subtitle: [shop, `Total market credit: Rs. ${money(headlineDue)}`, `As on: ${fileStamp()}`, ...(filterText ? [`Filtered: ${filterText}`] : [])],
      landscape: true,
      sections: [
        {
          header: ['Retailer', 'Phone', 'Due (Rs.)', '0-15d (Rs.)', '15-30d (Rs.)', '>30d (Rs.)', 'Last bill'],
          rows: rows.map((d) => [d.retailer, d.phone || '-', money(d.balance), money(d.aging.current), money(d.aging.due15), money(d.aging.overdue30), formatFriendlyDate(d.lastBillDate)]),
          total: [
            'Total',
            '',
            money(shownDue),
            money(rows.reduce((s, d) => s + d.aging.current, 0)),
            money(rows.reduce((s, d) => s + d.aging.due15, 0)),
            money(rows.reduce((s, d) => s + d.aging.overdue30, 0)),
            '',
          ],
          rightAlign: [2, 3, 4, 5],
        },
      ],
    });

  const hasAny = debtorsLedger.length > 0;
  const ageOptionsWithCount = AGE_OPTIONS.map((o) => ({ ...o, count: ageCounts[o.id] }));
  const emptyText = hasAny && isFiltered ? 'Nothing matches these filters' : '🎉 All customer accounts are settled. No credit outstanding.';

  /** Open part of one party: ageing split, invoiced / paid and the two buttons. */
  const detail = (d: DebtorItem, phone: boolean) => {
    const wa = waLinkFor(d);
    return (
      <div className={phone ? 'p-3 space-y-3 bg-[#f8fafc]' : 'px-3.5 py-3 space-y-3 bg-white'}>
        <div className={phone ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-6 gap-2'}>
          <MiniStat label="0-15 days" value={rs(d.aging.current)} />
          <MiniStat label="16-30 days" value={rs(d.aging.due15)} tone={d.aging.due15 > 0 ? 'amber' : 'ink'} />
          <MiniStat label="30+ days" value={rs(d.aging.overdue30)} tone={d.aging.overdue30 > 0 ? 'red' : 'ink'} />
          <MiniStat label="Invoiced" value={rs(d.totalBilled)} />
          <MiniStat label="Paid" value={rs(d.totalPaid)} tone="green" />
          <MiniStat label="Bills" value={d.billsCount} />
        </div>
        {d.phone && <div className="text-xs text-slate-500 font-mono">{d.phone}</div>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onRecordPayment(d.retailer)}
            className={`flex-1 rounded-xl bg-[var(--primary)] text-white font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer active:opacity-90 ${
              phone ? 'min-h-[44px] text-[13.5px]' : 'min-h-[38px] text-xs'
            }`}
          >
            <Plus className="w-4 h-4" /> Record payment
          </button>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              aria-label={`Send WhatsApp reminder to ${d.retailer}`}
              className={`rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 flex items-center justify-center ${
                phone ? 'min-h-[44px] min-w-[44px]' : 'min-h-[38px] min-w-[38px]'
              }`}
            >
              <MessageCircle className="w-5 h-5" />
            </a>
          )}
        </div>
      </div>
    );
  };

  const phoneInitials = (name: string) => {
    const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  const daysSinceDate = (iso?: string) => {
    if (!iso) return 0;
    const t0 = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
    const t1 = new Date(`${todayStr}T00:00:00`).getTime();
    if (Number.isNaN(t0) || Number.isNaN(t1)) return 0;
    return Math.max(0, Math.round((t1 - t0) / 86400000));
  };

  const cyclePhoneSort = () => {
    setSortOrder((prev) => (prev === 'balance' ? 'overdue' : prev === 'overdue' ? 'latestDay' : 'balance'));
  };

  const currentSortLabel = SORT_OPTIONS.find((s) => s.id === sortOrder)?.label || 'Highest due';
  const totalAged = Math.max(1, totals.current + totals.d15 + totals.d30);

  const shareProps = {
    reportTitle: 'Party credit',
    summaryMetrics: [
      { label: 'Total receivable', value: rs(headlineDue) },
      { label: '0-15 days', value: rs(totals.current) },
      { label: '16-30 days', value: rs(totals.d15) },
      { label: '30+ days', value: rs(totals.d30) },
    ],
    sheets: [
      {
        name: 'Debtors Aging',
        header: ['Retailer', 'Phone', 'Outstanding Due (Rs)', 'Current 0-15d (Rs)', 'Overdue 15-30d (Rs)', 'Overdue >30d (Rs)', 'Last Bill Date'],
        rows: rows.map((d) => [d.retailer, d.phone || '-', d.balance, d.aging.current, d.aging.due15, d.aging.overdue30, d.lastBillDate || '-']),
      },
    ],
    pdfSections: [
      {
        title: 'Party credit aging',
        header: ['Retailer', 'Due (Rs.)', '0-15d (Rs.)', '16-30d (Rs.)', '30+d (Rs.)', 'Last bill'],
        rows: rows.map((d) => [d.retailer, money(d.balance), money(d.aging.current), money(d.aging.due15), money(d.aging.overdue30), formatFriendlyDate(d.lastBillDate)]),
        rightAlign: [1, 2, 3, 4],
      },
    ],
  };

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-party-credit-phone">
        <MobileReportTopBar
          title="Party credit"
          sub="Aging of due"
          showPeriod={false}
          shareProps={shareProps}
        />

        {/* Total receivable card with aging bar */}
        <section className="rt-rep-card rt-rep-pad space-y-2.5">
          <div>
            <div className="text-[12px] font-medium text-[var(--text-2)]">Total receivable</div>
            <div className="text-[26px] font-extrabold text-[var(--due)] tracking-tight leading-tight tabular-nums mt-0.5">
              {rs(headlineDue)}
            </div>
          </div>

          <div className="h-[8px] w-full rounded-full bg-[#eef1f4] overflow-hidden flex gap-0.5">
            {totals.current > 0 && (
              <div
                className="h-full bg-[#2a8703]"
                style={{ width: `${Math.max(4, (totals.current / totalAged) * 100)}%` }}
              />
            )}
            {totals.d15 > 0 && (
              <div
                className="h-full bg-[#f59e0b]"
                style={{ width: `${Math.max(4, (totals.d15 / totalAged) * 100)}%` }}
              />
            )}
            {totals.d30 > 0 && (
              <div
                className="h-full bg-[#de1c24]"
                style={{ width: `${Math.max(4, (totals.d30 / totalAged) * 100)}%` }}
              />
            )}
          </div>

          <div className="text-[11px] font-medium text-[var(--text-2)] leading-snug tabular-nums">
            Current {rs(totals.current)} · 16-30d {rs(totals.d15)} · 30+ days {rs(totals.d30)}
          </div>
        </section>

        {/* Age filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {([
            { id: 'all', label: 'All parties' },
            { id: 'overdue', label: 'Overdue 15+' },
            { id: 'old', label: 'Over 30 days' },
            { id: 'current', label: 'Current' },
          ] as { id: AgeFilter; label: string }[]).map((opt) => {
            const active = ageFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAgeFilter(opt.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--text)] text-white border-[var(--text)]'
                    : 'bg-white text-[var(--text)] border-[var(--border)]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Count + Search toggle + Sort pill */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="text-[12px] font-semibold text-[var(--text-2)]">
            {rows.length} {rows.length === 1 ? 'party' : 'parties'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPhoneSearch((s) => !s)}
              aria-label="Search party"
              className={`h-7 w-7 rounded-full border flex items-center justify-center cursor-pointer ${
                showPhoneSearch || search
                  ? 'bg-[#eaf3fd] border-[var(--primary)] text-[var(--primary)]'
                  : 'bg-white border-[var(--border)] text-[var(--text-2)]'
              }`}
            >
              <Search size={13} />
            </button>
            <button
              type="button"
              onClick={cyclePhoneSort}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[var(--border)] text-[11.5px] font-bold text-[var(--primary)] cursor-pointer"
            >
              <span>{currentSortLabel}</span>
              <ChevronDown size={13} />
            </button>
          </div>
        </div>

        {(showPhoneSearch || search.length > 0) && (
          <div className="rt-search-bar">
            <Search size={16} className="text-[var(--text-2)] shrink-0" />
            <input
              type="text"
              enterKeyHint="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or phone…"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch('')}
                className="text-[var(--text-2)] p-0.5 cursor-pointer shrink-0"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
            {emptyText}
          </div>
        ) : (
          <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
            {rows.map((d) => {
              const k = keyOf(d);
              const open = isOpen(k);
              const daysOld = daysSinceDate(d.lastBillDate);
              const isLate = d.aging.overdue30 > 0.004 || d.aging.due15 > 0.004 || daysOld > 15;
              return (
                <div key={k}>
                  <button
                    type="button"
                    onClick={() => toggle(k)}
                    aria-expanded={open}
                    disabled={forceOpen}
                    className="w-full text-left px-3.5 py-3 flex items-center gap-3 active:bg-[#f8fafc] transition-colors cursor-pointer disabled:cursor-default"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#eaf3fd] text-[var(--primary)] font-extrabold text-[12px] flex items-center justify-center shrink-0">
                      {phoneInitials(d.retailer)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug break-words">
                        {d.retailer}
                      </div>
                      <div className="text-[11.5px] text-[var(--text-2)] mt-0.5">
                        Last bill {formatFriendlyDate(d.lastBillDate)}
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end">
                      <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums leading-tight">
                        {rs(d.balance)}
                      </div>
                      {daysOld > 0 ? (
                        <span
                          className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums leading-tight ${
                            isLate
                              ? 'bg-[var(--due-bg)] text-[var(--due)]'
                              : 'bg-[var(--soon-bg)] text-[var(--soon)]'
                          }`}
                        >
                          {daysOld} {isLate ? 'days late' : 'days'}
                        </span>
                      ) : (
                        <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--paid-bg)] text-[var(--paid)] text-[10px] font-bold leading-tight">
                          Today
                        </span>
                      )}
                    </div>
                  </button>
                  {open && <div className="border-t border-[var(--divider)]">{detail(d, true)}</div>}
                </div>
              );
            })}
          </section>
        )}

        <PhoneDownloadBar onExcel={exportExcel} onPdf={exportPdf} disabled={!hasAny} />
      </div>

      {/* ======================= TABLET / DESKTOP ======================= */}
      <div className="hidden md:block space-y-3" id="report-party-credit">
        <ReportTitleBar
          title="Party credit"
          sub="Outstanding as on today · who owes what, and for how long"
          actions={<ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={!hasAny} reportTitle="Party credit" />}
        />

        <ReportStatGrid>
          <ReportStat label="Total due" value={`₹${money(headlineDue)}`} tone="red" sub={dueGap ? `${debtorsLedger.length} customers on bills · ${dueGap}` : `across ${debtorsLedger.length} customers`} />
          <ReportStat label="Overdue 15+ days" value={`₹${money(overdueTotal)}`} tone={overdueTotal > 0 ? 'amber' : 'ink'} sub="collect these first" />
          <ReportStat label="Current 0-15 days" value={`₹${money(totals.current)}`} sub="within normal terms" />
          <ReportStat label="Collected so far" value={`₹${money(totals.paid)}`} tone="green" sub={`on ₹${money(totals.billed)} invoiced`} />
        </ReportStatGrid>
        <ReportBreakdownLine onExplain={() => setExplainOpen(true)}>
          0-15d ₹{money(totals.current)} · 16-30d ₹{money(totals.d15)}
          {totals.d30 > 0 && <> · 30+d ₹{money(totals.d30)}</>}
        </ReportBreakdownLine>

        <ReportFilterPanel
          search={{ value: search, onChange: setSearch, placeholder: 'Search customer or phone' }}
          isFiltered={isFiltered}
          onReset={resetFilters}
        >
          <ReportChipGroup<AgeFilter> label="Show" options={ageOptionsWithCount} value={ageFilter} onChange={setAgeFilter} />
          <ReportChipGroup<SortOrder> label="Sort" options={SORT_OPTIONS} value={sortOrder} onChange={setSortOrder} />
        </ReportFilterPanel>

        {rows.length > 1 && !forceOpen && (
          <ReportListMeta allOpen={allOpen} onToggleAll={toggleAll}>
            {rows.length} customers · ₹{money(shownDue)} due
            {isFiltered ? ' match' : ''}
          </ReportListMeta>
        )}

        {rows.length === 0 && <ReportEmpty>{emptyText}</ReportEmpty>}

        {rows.map((d) => {
          const k = keyOf(d);
          const tag = dayTag(d);
          return (
            <ReportGroupCard
              key={k}
              title={
                <span className="inline-flex items-center gap-2 flex-wrap">
                  {d.retailer}
                  {tag && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase border ${
                        tag === 'Today' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-sky-100 text-sky-800 border-sky-200'
                      }`}
                    >
                      {tag}
                    </span>
                  )}
                </span>
              }
              sub={`${d.billsCount} bill${d.billsCount === 1 ? '' : 's'} · latest ${formatFriendlyDate(d.lastBillDate)}${d.phone ? ` · ${d.phone}` : ''}`}
              inline={
                <>
                  <span>0-15d ₹{money(d.aging.current)}</span>
                  {d.aging.due15 > 0 && <span className="text-amber-700 font-semibold">16-30d ₹{money(d.aging.due15)}</span>}
                  {d.aging.overdue30 > 0 && <span className="text-rose-700 font-semibold">30+d ₹{money(d.aging.overdue30)}</span>}
                </>
              }
              headLabel="Due"
              head={`₹${money(d.balance)}`}
              headTone="red"
              open={isOpen(k)}
              locked={forceOpen}
              onToggle={() => toggle(k)}
            >
              {detail(d, false)}
            </ReportGroupCard>
          );
        })}
      </div>

      {explainOpen && (
        <ReportExplainModal ariaLabel="How party credit is calculated" onClose={() => setExplainOpen(false)}>
          <ExplainBox tone="rose" title={`Total due: ₹${money(headlineDue)}`}>
            <p>What customers owe today on the customer ledger (opening balance + billed - paid, after sales returns). Cancelled bills are not counted. This is the same total shown on Overview, Home and Beat-wise sales &amp; due.</p>
            {dueGap && <p className="mt-1">The ageing below covers unpaid bills (₹{money(totals.due)}); the total {dueGap}.</p>}
          </ExplainBox>
          <ExplainBox tone="slate" title="Ageing">
            <p>
              Each unpaid bill is counted by how many days old it is: <strong>0-15</strong>, <strong>16-30</strong> or{' '}
              <strong>30+</strong> days.
            </p>
            <p className="mt-1 font-semibold tabular-nums">
              ₹{money(totals.current)} + ₹{money(totals.d15)} + ₹{money(totals.d30)} = ₹{money(totals.due)}
            </p>
          </ExplainBox>
          <ExplainBox tone="amber" title={`Overdue 15+ days: ₹${money(overdueTotal)}`}>
            <p>The 16-30 and 30+ day buckets together: the amounts to chase first.</p>
          </ExplainBox>
        </ReportExplainModal>
      )}
    </>
  );
};
