import React, { useMemo, useState } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { money } from '../../../utils/billing';
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
import {
  Chips,
  EmptyNote,
  HeroCard,
  IconTile,
  LegendDot,
  MiniStat,
  PhoneDownloadBar,
  PhoneHeader,
  PhoneSearch,
  RowCard,
  SplitBar,
  Tag,
  UnifiedPhoneFilterBar,
  PhoneFilterBottomSheet,
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
export const ReceivablesReport: React.FC<ReceivablesReportProps> = ({ debtorsLedger, orgProfile, onRecordPayment }) => {
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

  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
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
      subtitle: [shop, `Total market credit: Rs. ${money(totals.due)}`, `As on: ${fileStamp()}`, ...(filterText ? [`Filtered: ${filterText}`] : [])],
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
  const phoneAgeOptions = AGE_OPTIONS.map((o) => ({ id: o.id, label: o.id === 'all' ? o.label : `${o.label} ${ageCounts[o.id]}` }));
  const emptyText = hasAny && isFiltered ? 'Nothing matches these filters' : '🎉 All customer accounts are settled. No credit outstanding.';

  /** Open part of one party: ageing split, invoiced / paid and the two buttons. */
  const detail = (d: DebtorItem, phone: boolean) => {
    const wa = waLinkFor(d);
    return (
      <div className={phone ? 'p-3 space-y-3 bg-slate-50/60' : 'px-3.5 py-3 space-y-3 bg-white'}>
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
            className={`flex-1 rounded-xl bg-emerald-700 text-white font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer active:bg-emerald-800 ${
              phone ? 'min-h-[48px] text-[14px]' : 'min-h-[38px] text-xs'
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
                phone ? 'min-h-[48px] min-w-[48px]' : 'min-h-[38px] min-w-[38px]'
              }`}
            >
              <MessageCircle className="w-5 h-5" />
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-party-credit-phone">
        <PhoneHeader title="Party credit" sub="Outstanding as on today" />

        <HeroCard tone="red" label="Total due" value={rs(totals.due)}>
          <SplitBar
            label="Current, 16-30 days and 30+ days"
            parts={[
              { value: totals.current, className: 'bg-slate-300' },
              { value: totals.d15, className: 'bg-amber-400' },
              { value: totals.d30, className: 'bg-rose-300' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/90">
            <LegendDot dot="bg-slate-300">0-15d {rs(totals.current)}</LegendDot>
            <LegendDot dot="bg-amber-400">16-30d {rs(totals.d15)}</LegendDot>
            <LegendDot dot="bg-rose-300">30+d {rs(totals.d30)}</LegendDot>
          </div>
        </HeroCard>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Customers" value={debtorsLedger.length} />
          <MiniStat label="Overdue 15d+" value={rs(overdueTotal)} tone={overdueTotal > 0 ? 'red' : 'ink'} />
          <MiniStat label="Collected so far" value={rs(totals.paid)} tone="green" />
        </div>

        <UnifiedPhoneFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search customer or phone…"
          onOpenFilter={() => setIsFilterSheetOpen(true)}
          activeFilterCount={(ageFilter !== 'all' ? 1 : 0) + (sortOrder !== 'latestDay' ? 1 : 0)}
        />

        <PhoneFilterBottomSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          title="Filter Party Credit"
          activeCount={(ageFilter !== 'all' ? 1 : 0) + (sortOrder !== 'latestDay' ? 1 : 0)}
          onReset={resetFilters}
        >
          {/* Age Filter */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Due Age
            </label>
            <div className="grid grid-cols-2 gap-2">
              {phoneAgeOptions.map((opt) => {
                const isCurrent = ageFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAgeFilter(opt.id)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors text-center ${
                      isCurrent
                        ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort Order */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Sort Order
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SORT_OPTIONS.map((opt) => {
                const isCurrent = sortOrder === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSortOrder(opt.id)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors text-center ${
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
        </PhoneFilterBottomSheet>

        {(rows.length > 1 && !forceOpen) || isFiltered ? (
          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
            <span>
              {rows.length} customer{rows.length === 1 ? '' : 's'}
              {isFiltered && (
                <>
                  {' · '}
                  <button type="button" onClick={resetFilters} className="font-bold text-rose-600 cursor-pointer">
                    Clear filters
                  </button>
                </>
              )}
            </span>
            {rows.length > 1 && !forceOpen && (
              <button type="button" onClick={toggleAll} className="font-bold text-slate-700 cursor-pointer min-h-[36px]">
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>
        ) : null}

        {rows.length === 0 && <EmptyNote>{emptyText}</EmptyNote>}

        {rows.map((d) => {
          const k = keyOf(d);
          const open = isOpen(k);
          const tag = dayTag(d);
          return (
            <RowCard key={k} edge={d.aging.overdue30 > 0 ? 'red' : d.aging.due15 > 0 ? 'amber' : undefined}>
              <button
                type="button"
                onClick={() => toggle(k)}
                aria-expanded={open}
                disabled={forceOpen}
                className="w-full text-left p-3 cursor-pointer active:bg-slate-50 disabled:cursor-default"
              >
                <div className="flex items-start gap-3">
                  <IconTile tone={d.aging.overdue30 > 0 ? 'red' : d.aging.due15 > 0 ? 'grey' : 'blue'}>
                    {(d.retailer || '?').trim().charAt(0).toUpperCase()}
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-extrabold text-slate-900 leading-snug break-words">{d.retailer}</div>
                    <div className="text-xs text-slate-500">Latest bill {formatFriendlyDate(d.lastBillDate)}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {tag && <Tag tone={tag === 'Today' ? 'green' : 'blue'}>{tag}</Tag>}
                      {d.aging.overdue30 > 0 && <Tag tone="red">30+ days {rs(d.aging.overdue30)}</Tag>}
                      {d.aging.overdue30 <= 0 && d.aging.due15 > 0 && <Tag tone="amber">16-30 days {rs(d.aging.due15)}</Tag>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[17px] font-extrabold text-rose-700 tabular-nums leading-tight">{rs(d.balance)}</div>
                    <div className="text-[11px] text-slate-500">due</div>
                  </div>
                </div>
              </button>
              {open && <div className="border-t border-slate-100">{detail(d, true)}</div>}
            </RowCard>
          );
        })}

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
          <ReportStat label="Total due" value={`₹${money(totals.due)}`} tone="red" sub={`across ${debtorsLedger.length} customers`} />
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
          <ExplainBox tone="rose" title={`Total due: ₹${money(totals.due)}`}>
            <p>Unpaid balance on every live bill, after payments and sales returns, as of today.</p>
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
