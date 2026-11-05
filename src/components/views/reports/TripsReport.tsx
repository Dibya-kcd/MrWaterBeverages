import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Truck } from 'lucide-react';
import { Trip, Warehouse } from '../../../types';
import { useLedger } from '../../../context/LedgerContext';
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
  ReportList,
  ReportListMeta,
  ReportRow,
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
} from './mobile/PhoneKit';

interface TripsReportProps {
  filteredTrips: Trip[];
  tripBreakdown: (t: Trip) => { rows: any[] };
  period: string;
  /** Label of the period chosen at the top of Reports (e.g. "November 2026"). Falls back to `period`. */
  periodLabel?: string;
  warehouses?: Warehouse[];
  onNavigateTrips: () => void;
}

type ViewMode = 'daywise' | 'log';
type StatusFilter = 'all' | 'out' | 'closed';

interface TripNums {
  loaded: number;
  delivered: number;
  returned: number;
  disc: number;
}

interface TripLine {
  trip: Trip;
  nums: TripNums;
}

interface TripDay {
  date: string;
  dateLabel: string;
  vehicles: string[];
  loaded: number;
  delivered: number;
  returned: number;
  disc: number;
  lines: TripLine[];
}

const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'daywise', label: 'By day' },
  { id: 'log', label: 'Trip log' },
];

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All trips' },
  { id: 'out', label: 'In transit' },
  { id: 'closed', label: 'Reconciled' },
];

const sumVals = (o?: Record<number, number>) => Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0);
const cs = (n: number) => `${n} cs`;
const varText = (n: number) => (n > 0 ? `−${n} cs` : '0');

const formatDateHuman = (d: string): string => {
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Vehicle trips, laid out like "Daily collection": totals on top, always-visible search + filters,
 * then one collapsed card per day (open it to see every run). Uses the period chosen at the top of Reports.
 */
export const TripsReport: React.FC<TripsReportProps> = ({
  filteredTrips,
  tripBreakdown,
  period,
  periodLabel,
  onNavigateTrips,
}) => {
  const { orgProfile } = useLedger();
  const label = periodLabel || period;

  const [viewMode, setViewMode] = useState<ViewMode>('daywise');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [explainOpen, setExplainOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const todayStr = useMemo(() => todayISO(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);

  const dayLabel = (d: string) =>
    d === todayStr ? `Today · ${formatDateHuman(d)}` : d === yesterdayStr ? `Yesterday · ${formatDateHuman(d)}` : formatDateHuman(d);

  // ---- every trip with its numbers, latest first -------------------------------------------------
  const allLines = useMemo<TripLine[]>(() => {
    const lines = filteredTrips.map((t) => {
      const { rows } = tripBreakdown(t);
      return {
        trip: t,
        nums: {
          loaded: sumVals(t.loaded),
          returned: sumVals(t.returned),
          delivered: rows.reduce((s, r) => s + (r.sold || 0), 0),
          disc: rows.reduce((s, r) => s + (r.discrepancy || 0), 0),
        },
      };
    });
    return lines.sort((a, b) => {
      const dCmp = (b.trip.date || '').localeCompare(a.trip.date || '');
      return dCmp !== 0 ? dCmp : Number(b.trip.id) - Number(a.trip.id);
    });
  }, [filteredTrips, tripBreakdown]);

  const totals = useMemo(
    () =>
      allLines.reduce(
        (a, l) => ({
          loaded: a.loaded + l.nums.loaded,
          delivered: a.delivered + l.nums.delivered,
          returned: a.returned + l.nums.returned,
          disc: a.disc + l.nums.disc,
        }),
        { loaded: 0, delivered: 0, returned: 0, disc: 0 },
      ),
    [allLines],
  );

  // ---- filters -----------------------------------------------------------------------------------
  const q = search.toLowerCase().trim();
  const isFiltered = statusFilter !== 'all' || q.length > 0;

  const statusCounts = useMemo<Record<StatusFilter, number>>(
    () => ({
      all: allLines.length,
      out: allLines.filter((l) => l.trip.status === 'out').length,
      closed: allLines.filter((l) => l.trip.status !== 'out').length,
    }),
    [allLines],
  );

  const shownLines = useMemo(
    () =>
      allLines.filter((l) => {
        if (statusFilter === 'out' && l.trip.status !== 'out') return false;
        if (statusFilter === 'closed' && l.trip.status === 'out') return false;
        if (q) {
          const hay = `${l.trip.id} ${l.trip.vehicle || ''} ${l.trip.driver || ''} ${l.trip.salesman || ''} ${l.trip.route || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [allLines, statusFilter, q],
  );

  const dayGroups = useMemo<TripDay[]>(() => {
    const map = new Map<string, TripDay>();
    shownLines.forEach((l) => {
      const d = (l.trip.date || '').slice(0, 10) || 'Unknown date';
      let g = map.get(d);
      if (!g) {
        g = { date: d, dateLabel: dayLabel(d), vehicles: [], loaded: 0, delivered: 0, returned: 0, disc: 0, lines: [] };
        map.set(d, g);
      }
      if (l.trip.vehicle && !g.vehicles.includes(l.trip.vehicle)) g.vehicles.push(l.trip.vehicle);
      g.loaded += l.nums.loaded;
      g.delivered += l.nums.delivered;
      g.returned += l.nums.returned;
      g.disc += l.nums.disc;
      g.lines.push(l);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownLines, todayStr, yesterdayStr]);

  const resetFilters = () => {
    setStatusFilter('all');
    setSearch('');
  };

  const forceOpen = q.length > 0;
  const isOpen = (d: string) => forceOpen || openDays.has(d);
  const toggleDay = (d: string) =>
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  const allOpen = dayGroups.length > 0 && dayGroups.every((g) => openDays.has(g.date));
  const toggleAll = () => setOpenDays(allOpen ? new Set() : new Set(dayGroups.map((g) => g.date)));

  const statusText = (t: Trip) => (t.status === 'out' ? 'In transit' : 'Reconciled');

  // ---- downloads ---------------------------------------------------------------------------------
  const shop = orgProfile?.name || 'MrWater Distribution';
  const filterText = [
    statusFilter !== 'all' ? STATUS_OPTIONS.find((o) => o.id === statusFilter)?.label : '',
    q ? `Search "${search.trim()}"` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const exportExcel = () =>
    downloadXlsx(`vehicle-trips-${fileStamp()}.xlsx`, [
      {
        name: 'Day-wise summary',
        header: ['Date', 'Runs', 'Vehicles', 'Loaded (cs)', 'Delivered (cs)', 'Returned (cs)', 'Variance (cs)'],
        rows: dayGroups.map((g) => [g.date, g.lines.length, g.vehicles.join(', '), g.loaded, g.delivered, g.returned, g.disc]),
        total: [
          'Total',
          shownLines.length,
          '',
          shownLines.reduce((s, l) => s + l.nums.loaded, 0),
          shownLines.reduce((s, l) => s + l.nums.delivered, 0),
          shownLines.reduce((s, l) => s + l.nums.returned, 0),
          shownLines.reduce((s, l) => s + l.nums.disc, 0),
        ],
      },
      {
        name: 'Trips',
        header: ['Trip', 'Date', 'Vehicle', 'Status', 'Loaded (cs)', 'Delivered (cs)', 'Returned (cs)', 'Variance (cs)'],
        rows: shownLines.map((l) => [l.trip.id, l.trip.date, l.trip.vehicle || '', statusText(l.trip), l.nums.loaded, l.nums.delivered, l.nums.returned, l.nums.disc]),
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `vehicle-trips-${fileStamp()}.pdf`,
      title: 'Vehicle trips',
      subtitle: [shop, `Period: ${label}`, ...(filterText ? [`Filtered: ${filterText}`] : [])],
      landscape: true,
      sections: [
        {
          title: 'Day-wise summary',
          header: ['Date', 'Runs', 'Vehicles', 'Loaded', 'Delivered', 'Returned', 'Variance'],
          rows: dayGroups.map((g) => [formatDateHuman(g.date), g.lines.length, g.vehicles.join(', '), g.loaded, g.delivered, g.returned, g.disc]),
          rightAlign: [1, 3, 4, 5, 6],
        },
        {
          title: 'Trips',
          header: ['Trip', 'Date', 'Vehicle', 'Status', 'Loaded', 'Delivered', 'Returned', 'Variance'],
          rows: shownLines.map((l) => [l.trip.id, l.trip.date, l.trip.vehicle || '', statusText(l.trip), l.nums.loaded, l.nums.delivered, l.nums.returned, l.nums.disc]),
          rightAlign: [4, 5, 6, 7],
        },
      ],
    });

  const hasAny = allLines.length > 0;
  const statusOptionsWithCount = STATUS_OPTIONS.map((o) => ({ ...o, count: statusCounts[o.id] }));
  const phoneStatusOptions = STATUS_OPTIONS.map((o) => ({ id: o.id, label: o.id === 'all' ? o.label : `${o.label} ${statusCounts[o.id]}` }));

  const runSummary = (g: TripDay) => `${g.lines.length} run${g.lines.length === 1 ? '' : 's'}${g.vehicles.length ? ` · ${g.vehicles.join(', ')}` : ''}`;
  const runSub = (l: TripLine) => `Loaded ${l.nums.loaded} · Delivered ${l.nums.delivered} · Returned ${l.nums.returned} cs`;

  const emptyText = hasAny && isFiltered ? 'Nothing matches these filters' : 'No delivery trips in this period. Log trips under Vehicle Trips to see them here.';

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-trips-phone">
        <PhoneHeader title="Vehicle trips" sub="Deliveries and crate tracking" />

        <HeroCard tone="navy" label="Delivered" value={cs(totals.delivered)}>
          <SplitBar
            label="Delivered, returned and missing crates"
            parts={[
              { value: totals.delivered, className: 'bg-emerald-400' },
              { value: totals.returned, className: 'bg-sky-400' },
              { value: totals.disc, className: 'bg-rose-400' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/90">
            <LegendDot dot="bg-emerald-400">Delivered {cs(totals.delivered)}</LegendDot>
            <LegendDot dot="bg-sky-400">Returned {cs(totals.returned)}</LegendDot>
            {totals.disc > 0 && <LegendDot dot="bg-rose-400">Missing {cs(totals.disc)}</LegendDot>}
          </div>
        </HeroCard>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Trips" value={allLines.length} />
          <MiniStat label="Loaded" value={cs(totals.loaded)} />
          <MiniStat label="Variance" value={varText(totals.disc)} tone={totals.disc > 0 ? 'red' : 'green'} />
        </div>

        <UnifiedPhoneFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search trip, vehicle or driver…"
          onOpenFilter={() => setIsFilterSheetOpen(true)}
          activeFilterCount={(viewMode !== 'daywise' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
        />

        <PhoneFilterBottomSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          title="Filter Vehicle Trips"
          activeCount={(viewMode !== 'daywise' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
          onReset={resetFilters}
        >
          {/* View Mode */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              View Grouping
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VIEW_OPTIONS.map((opt) => {
                const isSelected = viewMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setViewMode(opt.id)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 text-blue-900 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status Filter */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Trip Status
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const isSelected = statusFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStatusFilter(opt.id)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 text-blue-900 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </PhoneFilterBottomSheet>

        {(viewMode === 'daywise' && dayGroups.length > 1 && !forceOpen) || isFiltered ? (
          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
            <span>
              {shownLines.length} trip{shownLines.length === 1 ? '' : 's'}
              {isFiltered && (
                <>
                  {' · '}
                  <button type="button" onClick={resetFilters} className="font-bold text-rose-600 cursor-pointer">
                    Clear filters
                  </button>
                </>
              )}
            </span>
            {viewMode === 'daywise' && dayGroups.length > 1 && !forceOpen && (
              <button type="button" onClick={toggleAll} className="font-bold text-slate-700 cursor-pointer min-h-[36px]">
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>
        ) : null}

        {shownLines.length === 0 && <EmptyNote>{emptyText}</EmptyNote>}

        {viewMode === 'daywise' &&
          dayGroups.map((g) => {
            const open = isOpen(g.date);
            return (
              <RowCard key={g.date}>
                <button
                  type="button"
                  onClick={() => toggleDay(g.date)}
                  aria-expanded={open}
                  disabled={forceOpen}
                  className="w-full text-left p-3 cursor-pointer active:bg-slate-50 disabled:cursor-default"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] font-extrabold text-slate-900 leading-snug break-words">{g.dateLabel}</div>
                      <div className="text-xs text-slate-500 break-words">{runSummary(g)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[17px] font-extrabold text-emerald-700 tabular-nums leading-tight">{cs(g.delivered)}</div>
                      <div className="text-[11px] text-slate-500">delivered</div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] font-semibold tabular-nums">
                    <span className="text-slate-600">Loaded {cs(g.loaded)}</span>
                    {g.disc > 0 && <span className="text-rose-700">Missing {cs(g.disc)}</span>}
                  </div>
                </button>
                {open && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {g.lines.map((l) => (
                      <PhoneTripRow key={l.trip.id} l={l} statusText={statusText(l.trip)} />
                    ))}
                  </ul>
                )}
              </RowCard>
            );
          })}

        {viewMode === 'log' && shownLines.length > 0 && (
          <RowCard>
            <ul className="divide-y divide-slate-100">
              {shownLines.map((l) => (
                <PhoneTripRow key={l.trip.id} l={l} statusText={statusText(l.trip)} showDate />
              ))}
            </ul>
          </RowCard>
        )}

        <button
          type="button"
          onClick={onNavigateTrips}
          className="w-full min-h-[48px] rounded-2xl border border-slate-200 bg-white text-[14px] font-bold text-slate-800 inline-flex items-center justify-center gap-2 cursor-pointer active:bg-slate-100"
        >
          Open Trips manager <ArrowRight size={16} aria-hidden="true" />
        </button>

        <PhoneDownloadBar onExcel={exportExcel} onPdf={exportPdf} disabled={!hasAny} />
      </div>

      {/* ======================= TABLET / DESKTOP ======================= */}
      <div className="hidden md:block space-y-3" id="report-trips">
        <ReportTitleBar
          title="Vehicle trips"
          sub={`${label} · day by day: crates loaded, delivered, returned and missing`}
          actions={
            <>
              <button
                type="button"
                onClick={onNavigateTrips}
                className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                Open Trips manager <ArrowRight size={13} aria-hidden="true" />
              </button>
              <ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={!hasAny} reportTitle="Vehicle trips" />
            </>
          }
        />

        <ReportStatGrid>
          <ReportStat label="Delivered" value={cs(totals.delivered)} tone="green" sub={`${allLines.length} trip${allLines.length === 1 ? '' : 's'}`} />
          <ReportStat label="Loaded" value={cs(totals.loaded)} sub="total cargo dispatched" />
          <ReportStat label="Returned" value={cs(totals.returned)} sub="empties and unsold back" />
          <ReportStat label="Variance" value={varText(totals.disc)} tone={totals.disc > 0 ? 'red' : 'green'} sub="unaccounted in transit" />
        </ReportStatGrid>
        <ReportBreakdownLine onExplain={() => setExplainOpen(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Truck size={13} aria-hidden="true" /> {statusCounts.out} in transit · {statusCounts.closed} reconciled
          </span>
        </ReportBreakdownLine>

        <ReportFilterPanel
          search={{ value: search, onChange: setSearch, placeholder: 'Search trip no, vehicle or driver' }}
          isFiltered={isFiltered}
          onReset={resetFilters}
        >
          <ReportChipGroup<ViewMode> label="View" options={VIEW_OPTIONS} value={viewMode} onChange={setViewMode} />
          <ReportChipGroup<StatusFilter> label="Status" options={statusOptionsWithCount} value={statusFilter} onChange={setStatusFilter} />
        </ReportFilterPanel>

        {viewMode === 'daywise' && dayGroups.length > 1 && !forceOpen && (
          <ReportListMeta allOpen={allOpen} onToggleAll={toggleAll}>
            {dayGroups.length} days · {shownLines.length} trip{shownLines.length === 1 ? '' : 's'}
            {isFiltered ? ' match' : ''}
          </ReportListMeta>
        )}

        {shownLines.length === 0 && <ReportEmpty>{emptyText}</ReportEmpty>}

        {viewMode === 'daywise' &&
          dayGroups.map((g) => (
            <ReportGroupCard
              key={g.date}
              title={g.dateLabel}
              sub={runSummary(g)}
              inline={
                <>
                  <span>Loaded {cs(g.loaded)}</span>
                  <span>Returned {cs(g.returned)}</span>
                  {g.disc > 0 && <span className="text-rose-700 font-semibold">Missing {cs(g.disc)}</span>}
                </>
              }
              headLabel="Delivered"
              head={cs(g.delivered)}
              open={isOpen(g.date)}
              locked={forceOpen}
              onToggle={() => toggleDay(g.date)}
            >
              <ReportList>
                {g.lines.map((l) => (
                  <ReportRow
                    key={l.trip.id}
                    title={
                      <>
                        <span className="font-mono text-sky-700">#{l.trip.id}</span> · {l.trip.vehicle || 'Vehicle'}
                      </>
                    }
                    sub={runSub(l)}
                    amount={cs(l.nums.delivered)}
                    amountTone="green"
                    status={`${statusText(l.trip)}${l.nums.disc > 0 ? ` · missing ${l.nums.disc}` : ''}`}
                    statusTone={l.trip.status === 'out' ? 'amber' : l.nums.disc > 0 ? 'red' : 'green'}
                  />
                ))}
              </ReportList>
            </ReportGroupCard>
          ))}

        {viewMode === 'log' && shownLines.length > 0 && (
          <section className="rounded-2xl border border-black/10 bg-white overflow-hidden">
            <ReportList>
              {shownLines.map((l) => (
                <ReportRow
                  key={l.trip.id}
                  title={
                    <>
                      <span className="font-mono text-sky-700">#{l.trip.id}</span> · {l.trip.vehicle || 'Vehicle'}
                    </>
                  }
                  sub={`${formatDateHuman((l.trip.date || '').slice(0, 10))} · ${runSub(l)}`}
                  amount={cs(l.nums.delivered)}
                  amountTone="green"
                  status={`${statusText(l.trip)}${l.nums.disc > 0 ? ` · missing ${l.nums.disc}` : ''}`}
                  statusTone={l.trip.status === 'out' ? 'amber' : l.nums.disc > 0 ? 'red' : 'green'}
                />
              ))}
            </ReportList>
          </section>
        )}
      </div>

      {explainOpen && (
        <ReportExplainModal ariaLabel="How vehicle trips are calculated" onClose={() => setExplainOpen(false)}>
          <ExplainBox tone="slate" title={`Loaded: ${cs(totals.loaded)}`}>
            <p>Crates put on the vehicle when the trip was dispatched.</p>
          </ExplainBox>
          <ExplainBox tone="emerald" title={`Delivered: ${cs(totals.delivered)}`}>
            <p>Crates sold to customers on the trip&apos;s bills.</p>
          </ExplainBox>
          <ExplainBox tone="slate" title={`Returned: ${cs(totals.returned)}`}>
            <p>Crates brought back when the trip was closed.</p>
          </ExplainBox>
          <ExplainBox tone="rose" title={`Variance: ${varText(totals.disc)}`}>
            <p>
              Crates that left but are not in delivered or returned. Open the trip in Trips manager to see the reason recorded
              at closing.
            </p>
          </ExplainBox>
        </ReportExplainModal>
      )}
    </>
  );
};

/** One trip line on the phone. */
const PhoneTripRow: React.FC<{ l: TripLine; statusText: string; showDate?: boolean }> = ({ l, statusText, showDate }) => (
  <li className="p-3 flex items-start gap-3">
    <IconTile tone={l.trip.status === 'out' ? 'blue' : l.nums.disc > 0 ? 'red' : 'green'}>
      <Truck size={20} />
    </IconTile>
    <div className="min-w-0 flex-1">
      <div className="text-[15px] font-bold text-slate-900 leading-snug break-words">{l.trip.vehicle || 'Vehicle'}</div>
      <div className="text-xs text-slate-500 leading-snug break-words">
        #{l.trip.id}
        {showDate && l.trip.date ? ` · ${formatDateHuman(l.trip.date.slice(0, 10))}` : ''}
        {` · Loaded ${l.nums.loaded} · Returned ${l.nums.returned}`}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Tag tone={l.trip.status === 'out' ? 'amber' : 'green'}>{statusText}</Tag>
        {l.nums.disc > 0 && <Tag tone="red">Missing {l.nums.disc} cs</Tag>}
      </div>
    </div>
    <div className="text-right shrink-0">
      <div className="text-[17px] font-extrabold tabular-nums leading-tight text-emerald-700">{cs(l.nums.delivered)}</div>
      <div className="text-[11px] text-slate-400">delivered</div>
    </div>
  </li>
);
