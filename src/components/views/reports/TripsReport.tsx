import React, { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Search, Truck, X } from 'lucide-react';
import { Trip, Warehouse } from '../../../types';
import { useLedger } from '../../../context/LedgerContext';
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
  ReportList,
  ReportListMeta,
  ReportRow,
  ReportStat,
  ReportStatGrid,
  ReportTitleBar,
} from './ReportKit';
import { PhoneDownloadBar, type PhonePeriodControl } from './mobile/PhoneKit';
import { MobileReportTopBar, useMobileReport } from './mobile/MobileReportContext';

interface TripsReportProps {
  filteredTrips: Trip[];
  tripBreakdown: (t: Trip) => { rows: any[] };
  period: string;
  /** Lets the phone Filter sheet change the date period (same as Daily collection). */
  periodControl?: PhonePeriodControl;
  /** Label of the period chosen at the top of Reports (e.g. "November 2026"). Falls back to `period`. */
  periodLabel?: string;
  dateInPeriod?: (d: string) => boolean;
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
  periodControl,
  periodLabel,
  dateInPeriod,
  onNavigateTrips,
}) => {
  const { orgProfile, expenses } = useLedger();
  const mobileCtx = useMobileReport();
  const label = periodLabel || period;

  const [viewMode, setViewMode] = useState<ViewMode>('daywise');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [explainOpen, setExplainOpen] = useState(false);

  const fuelTotal = useMemo(
    () =>
      (expenses || [])
        .filter((e) => e.category === 'fuel' && (!dateInPeriod || dateInPeriod(String(e.date).slice(0, 10))))
        .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses, dateInPeriod],
  );

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

  const runSummary = (g: TripDay) => `${g.lines.length} run${g.lines.length === 1 ? '' : 's'}${g.vehicles.length ? ` · ${g.vehicles.join(', ')}` : ''}`;
  const runSub = (l: TripLine) => `Loaded ${l.nums.loaded} · Delivered ${l.nums.delivered} · Returned ${l.nums.returned} cs`;

  const emptyText = hasAny && isFiltered ? 'Nothing matches these filters' : 'No delivery trips in this period. Log trips under Vehicle Trips to see them here.';

  const shortDate = (d: string) => {
    const dt = new Date(`${d}T12:00:00`);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };
  const shortPeriodText = (mobileCtx?.shortPeriodLabel || label || 'this month').toLowerCase();
  const periodHeading =
    shortPeriodText === 'month' ? 'Trips this month' : shortPeriodText === 'all time' ? 'All trips' : `Trips · ${mobileCtx?.shortPeriodLabel || label}`;

  const shareProps = {
    reportTitle: 'Vehicle trips',
    summaryLines: [
      { label: 'Trips', value: String(allLines.length) },
      ...(fuelTotal > 0 ? [{ label: 'Diesel', value: `₹${money(fuelTotal)}` }] : []),
      { label: 'Loaded', value: `${totals.loaded} cases` },
      { label: 'Sold', value: `${totals.delivered} cases` },
      { label: 'Returned', value: `${totals.returned} cases` },
    ],
    sheets: [
      {
        name: 'Trips',
        header: ['Trip', 'Date', 'Vehicle', 'Status', 'Loaded', 'Delivered', 'Returned'],
        rows: shownLines.map((l) => [l.trip.id, l.trip.date, l.trip.vehicle || '', statusText(l.trip), l.nums.loaded, l.nums.delivered, l.nums.returned]),
      },
    ],
    pdfSections: [
      {
        title: 'Trips',
        header: ['Trip', 'Date', 'Vehicle', 'Loaded', 'Delivered', 'Returned'],
        rows: shownLines.map((l) => [l.trip.id, l.trip.date, l.trip.vehicle || '', l.nums.loaded, l.nums.delivered, l.nums.returned]),
        rightAlign: [3, 4, 5],
      },
    ],
  };

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-trips-phone">
        <MobileReportTopBar
          title="Vehicle trips"
          sub={viewMode === 'daywise' ? 'Day-wise summary' : 'Trip log'}
          showPeriod
          shareProps={shareProps}
        />

        {/* Row 1: View chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {VIEW_OPTIONS.map((opt) => {
            const active = viewMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setViewMode(opt.id)}
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

        {/* Row 2: Status chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {STATUS_OPTIONS.map((opt) => {
            const active = statusFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
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

        {/* Trips summary card */}
        <section className="rt-rep-card rt-rep-pad">
          <div className="text-[12px] font-medium text-[var(--text-2)]">{periodHeading}</div>
          <div className="text-[26px] font-extrabold text-[var(--text)] tracking-tight leading-tight tabular-nums mt-0.5">
            {allLines.length}
          </div>
          <div className="text-[11.5px] text-[var(--text-2)] mt-1 tabular-nums">
            {fuelTotal > 0 ? `Diesel ₹${money(fuelTotal)}` : `${statusCounts.out} in transit · ${statusCounts.closed} reconciled`}
          </div>
          <div className="rt-kv-grid grid-cols-3">
            <div className="rt-kv">
              <div className="rt-kv__l">Loaded</div>
              <div className="rt-kv__v text-[var(--text)]">{totals.loaded.toLocaleString('en-IN')}</div>
            </div>
            <div className="rt-kv">
              <div className="rt-kv__l">Sold</div>
              <div className="rt-kv__v text-[var(--text)]">{totals.delivered.toLocaleString('en-IN')}</div>
            </div>
            <div className="rt-kv">
              <div className="rt-kv__l">Returned</div>
              <div className="rt-kv__v text-[var(--text)]">{totals.returned.toLocaleString('en-IN')}</div>
            </div>
          </div>
        </section>

        {/* Search bar */}
        <div className="rt-search-bar">
          <Search size={15} className="text-[var(--text-2)] shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trip, vehicle or driver…"
          />
          {search.trim() && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-[var(--text-2)] p-1 cursor-pointer"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {shownLines.length === 0 ? (
          <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
            {emptyText}
          </div>
        ) : viewMode === 'daywise' ? (
          <div className="space-y-2.5">
            {dayGroups.map((g) => {
              const open = isOpen(g.date) || dayGroups.length === 1;
              return (
                <section key={g.date} className="rt-rep-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleDay(g.date)}
                    aria-expanded={open}
                    className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-[#f8fafc]"
                  >
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-bold text-[var(--text)] truncate">{shortDate(g.date)}</div>
                      <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 truncate">{runSummary(g)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums">{g.loaded} cases</div>
                        <div className="text-[11px] font-semibold text-[var(--paid)] tabular-nums">Sold {g.delivered}</div>
                      </div>
                      {dayGroups.length > 1 && (
                        open ? <ChevronUp size={15} className="text-[var(--text-2)]" /> : <ChevronDown size={15} className="text-[var(--text-2)]" />
                      )}
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-[var(--divider)] divide-y divide-[var(--divider)]">
                      {g.lines.map((l) => (
                        <PhoneTripRow key={l.trip.id} l={l} dateText={shortDate((l.trip.date || '').slice(0, 10))} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
            {shownLines.map((l) => (
              <PhoneTripRow key={l.trip.id} l={l} dateText={shortDate((l.trip.date || '').slice(0, 10))} />
            ))}
          </section>
        )}

        <button
          type="button"
          onClick={onNavigateTrips}
          className="w-full h-[46px] rounded-2xl border border-[var(--border)] bg-white text-[13.5px] font-bold text-[var(--text)] inline-flex items-center justify-center gap-2 cursor-pointer active:bg-[#f8fafc]"
        >
          Open Trips manager <ArrowRight size={15} aria-hidden="true" />
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
const PhoneTripRow: React.FC<{ l: TripLine; dateText: string }> = ({ l, dateText }) => {
  const isOut = l.trip.status === 'out';
  const party = l.trip.driver || l.trip.salesman || l.trip.route || l.trip.vehicle || 'Trip';
  return (
    <div className="px-3.5 py-3 flex items-center gap-3">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          isOut ? 'bg-[var(--soon-bg)] text-[var(--soon)]' : 'bg-[#eaf3fd] text-[var(--primary)]'
        }`}
      >
        <Truck size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug truncate">
          Trip #{l.trip.id} · {party}
        </div>
        <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 truncate">
          {[l.trip.vehicle, dateText].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums">{l.nums.loaded} cases</div>
        <span
          className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
            isOut ? 'bg-[var(--paid-bg)] text-[var(--paid)]' : 'bg-[#eaf3fd] text-[var(--primary)]'
          }`}
        >
          {isOut ? 'Out' : 'Reconciled'}
        </span>
      </div>
    </div>
  );
};
