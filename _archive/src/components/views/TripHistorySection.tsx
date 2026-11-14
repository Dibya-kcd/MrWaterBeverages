import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  History,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { Bill, Product, Trip, PaletteTokens } from '../../types';
import { money } from '../../utils/billing';
import { TripCardItem } from './TripCardItem';
import { TripProductReconciliationRow } from './TripReconciliationCards';

interface TripHistorySectionProps {
  trips: Trip[];
  products: Product[];
  bills: Bill[];
  palette: PaletteTokens;
  scale: number;
  fz: (px: number, extra?: React.CSSProperties) => React.CSSProperties;
  onEdit: (trip: Trip) => void;
  onRecordReturn: (trip: Trip) => void;
  onReopen: (tripId: number) => void;
  onDelete: (trip: Trip) => void;
  onAutoAssign: (tripId: number, dateStr: string) => void;
  onManageBills: (trip: Trip) => void;
  tripBreakdown: (trip: Trip) => { rows: TripProductReconciliationRow[]; hasDiscrepancy: boolean };
}

export const TripHistorySection: React.FC<TripHistorySectionProps> = ({
  trips,
  products,
  bills,
  palette,
  scale,
  fz,
  onEdit,
  onRecordReturn,
  onReopen,
  onDelete,
  onAutoAssign,
  onManageBills,
  tripBreakdown,
}) => {
  // CRITICAL REQUIREMENT: Default contracted (empty state => all days collapsed)
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDiscrepancyOnly, setFilterDiscrepancyOnly] = useState<boolean>(false);

  // Helper to format day header cleanly
  const formatDayHeader = (dateStr: string) => {
    if (dateStr === 'Undated') return { label: 'Undated Completed Trips', tag: '' };
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const isToday = new Date().toISOString().slice(0, 10) === dateStr;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const isYesterday = yesterday === dateStr;

      let tag = '';
      if (isToday) tag = 'Today';
      else if (isYesterday) tag = 'Yesterday';

      const formatted = dt.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return { label: formatted, tag };
    } catch {
      return { label: dateStr, tag: '' };
    }
  };

  // Filter trips based on search query and discrepancy filter
  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      // Discrepancy filter
      if (filterDiscrepancyOnly) {
        const { hasDiscrepancy } = tripBreakdown(t);
        if (!hasDiscrepancy) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();

      // Match vehicle name or id
      if (t.vehicle.toLowerCase().includes(q) || String(t.id).includes(q) || t.date.includes(q)) {
        return true;
      }

      // Match products in loaded or returned
      const hasProductMatch = Object.keys(t.loaded || {}).some((pid) => {
        const prod = products.find((p) => p.id === Number(pid));
        return prod && prod.name.toLowerCase().includes(q);
      });
      if (hasProductMatch) return true;

      // Match assigned bills / retailers
      const hasRetailerMatch = (t.billIds || []).some((bid) => {
        const b = bills.find((x) => x.id === bid);
        return b && (b.retailer.toLowerCase().includes(q) || String(b.id).includes(q));
      });

      return hasRetailerMatch;
    });
  }, [trips, searchQuery, filterDiscrepancyOnly, products, bills, tripBreakdown]);

  // Group sequentially date-wise (latest date on top)
  const tripsGroupedByDate = useMemo(() => {
    const map = new Map<string, Trip[]>();
    for (const trip of filteredTrips) {
      const dateKey = trip.date || 'Undated';
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(trip);
    }
    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((date) => ({
      date,
      trips: map.get(date)!.sort((a, b) => b.id - a.id),
    }));
  }, [filteredTrips]);

  // Overall statistics for history view
  const historyStats = useMemo(() => {
    let totalLoaded = 0;
    let totalReturned = 0;
    let totalInvoiced = 0;
    let discrepancyCount = 0;

    for (const t of trips) {
      for (const q of Object.values(t.loaded || {})) {
        totalLoaded += q || 0;
      }
      for (const q of Object.values(t.returned || {})) {
        totalReturned += q || 0;
      }
      for (const bid of t.billIds || []) {
        const b = bills.find((x) => x.id === bid);
        if (b) totalInvoiced += b.total;
      }
      const { hasDiscrepancy } = tripBreakdown(t);
      if (hasDiscrepancy) discrepancyCount++;
    }

    return {
      totalTrips: trips.length,
      totalLoaded,
      totalReturned,
      totalInvoiced,
      discrepancyCount,
    };
  }, [trips, bills, tripBreakdown]);

  // Accordion Handlers
  const toggleDayExpansion = (dateKey: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  const expandAllDays = () => {
    const updated: Record<string, boolean> = {};
    for (const group of tripsGroupedByDate) {
      updated[group.date] = true;
    }
    setExpandedDates(updated);
  };

  const collapseAllDays = () => {
    setExpandedDates({});
  };

  return (
    <div className="space-y-4">
      {/* Header & Overview Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          className="border-2 p-3 rounded-lg shadow-xs bg-white"
          style={{ borderColor: palette.line }}
        >
          <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
            Total Trips Logged
          </div>
          <div className="text-xl font-extrabold mt-0.5 text-slate-900">{historyStats.totalTrips}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
            Across {tripsGroupedByDate.length} delivery day{tripsGroupedByDate.length === 1 ? '' : 's'}
          </div>
        </div>

        <div
          className="border-2 p-3 rounded-lg shadow-xs bg-white"
          style={{ borderColor: palette.line }}
        >
          <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
            Stock Dispatched
          </div>
          <div className="text-xl font-extrabold mt-0.5 text-slate-900">{historyStats.totalLoaded} cs</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Total loaded onto vans</div>
        </div>

        <div
          className="border-2 p-3 rounded-lg shadow-xs bg-white"
          style={{ borderColor: palette.line }}
        >
          <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
            Stock Returned
          </div>
          <div className="text-xl font-extrabold mt-0.5 text-slate-900">{historyStats.totalReturned} cs</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Unsold crates returned</div>
        </div>

        <div
          className="border-2 p-3 rounded-lg shadow-xs bg-white"
          style={{ borderColor: palette.line }}
        >
          <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
            Delivered Value
          </div>
          <div className="text-xl font-extrabold mt-0.5 text-emerald-800">
            ₹{money(historyStats.totalInvoiced)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
            {historyStats.discrepancyCount > 0 ? (
              <span className="text-red-600 font-bold">
                ⚠ {historyStats.discrepancyCount} trip shortage(s)
              </span>
            ) : (
              <span className="text-emerald-700 font-bold">All returns balanced</span>
            )}
          </div>
        </div>
      </div>

      {/* Search & Collapse Controls */}
      <div
        className="p-3 border-2 rounded-lg bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs"
        style={{ borderColor: palette.line }}
      >
        {/* Search Input */}
        <div className="relative flex-1 min-w-0">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Search history by vehicle, retailer stop, bill ID, or beverage product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 border-2 rounded text-xs font-semibold focus-ring bg-slate-50/50"
            style={{ borderColor: palette.line, color: palette.ink }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setFilterDiscrepancyOnly(!filterDiscrepancyOnly)}
            className={`px-2.5 py-1.5 rounded text-xs font-bold border transition-colors cursor-pointer ${
              filterDiscrepancyOnly
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {filterDiscrepancyOnly ? 'Showing Shortages Only' : 'Filter Shortages'}
          </button>

          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 border-l pl-2 border-slate-200">
            <button
              type="button"
              onClick={expandAllDays}
              className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer p-1 rounded hover:bg-slate-100"
              title="Expand all date accordions"
            >
              <ChevronsDown size={14} />
              <span className="hidden sm:inline">Expand All</span>
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={collapseAllDays}
              className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer p-1 rounded hover:bg-slate-100"
              title="Contract all date accordions"
            >
              <ChevronsUp size={14} />
              <span className="hidden sm:inline">Contract All</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sequential Date-wise Accordion List */}
      {tripsGroupedByDate.length === 0 ? (
        <div
          className="border-2 p-8 text-center rounded-lg shadow-xs bg-white space-y-2"
          style={{ borderColor: palette.line }}
        >
          <History size={36} className="mx-auto text-slate-400 opacity-60" aria-hidden="true" />
          <div className="font-extrabold text-base text-slate-800">
            {searchQuery || filterDiscrepancyOnly
              ? 'No trip records match your current search/filter.'
              : 'No completed vehicle trips recorded in history.'}
          </div>
          <div className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery || filterDiscrepancyOnly
              ? 'Try clearing the search query or toggle off the shortages filter.'
              : 'Dispatched vehicle trips will appear here once returns and delivery reconciliations are completed.'}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {tripsGroupedByDate.map((group) => {
            const { label: dayLabel, tag: dayTag } = formatDayHeader(group.date);
            // DEFAULT IS CONTRACTED (isDayExpanded === false when not explicitly true)
            const isDayExpanded = Boolean(expandedDates[group.date]);

            // Date group totals
            const dayLoaded = group.trips.reduce(
              (acc, t) =>
                acc + Object.values(t.loaded || {}).reduce((s, q) => s + (q || 0), 0),
              0
            );
            const dayReturned = group.trips.reduce(
              (acc, t) =>
                acc + Object.values(t.returned || {}).reduce((s, q) => s + (q || 0), 0),
              0
            );
            const dayHasDiscrepancy = group.trips.some((t) => tripBreakdown(t).hasDiscrepancy);

            return (
              <div
                key={group.date}
                className="border-2 rounded-lg overflow-hidden shadow-xs bg-white transition-all"
                style={{ borderColor: palette.line }}
              >
                {/* Date Accordion Header */}
                <div
                  onClick={() => toggleDayExpansion(group.date)}
                  className="p-3 sm:p-4 border-b-2 flex items-center justify-between flex-wrap gap-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                  style={{
                    borderColor: palette.line,
                    backgroundColor: isDayExpanded ? `${palette.navy}08` : '#FFFFFF',
                  }}
                  title="Click to expand or contract this day's trips"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      className="p-1 rounded text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                      aria-label={isDayExpanded ? 'Contract Day' : 'Expand Day'}
                    >
                      {isDayExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    <Calendar size={18} className="text-slate-700 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                          {dayLabel}
                        </span>
                        {dayTag && (
                          <span className="text-[10.5px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider bg-blue-100 text-blue-800">
                            {dayTag}
                          </span>
                        )}
                        {dayHasDiscrepancy && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-100 text-red-700">
                            ⚠ Shortage
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        {group.trips.length} sequential trip{group.trips.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>

                  {/* Summary Pills on Header */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 flex-wrap">
                    <span className="bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                      Loaded: <strong className="text-slate-900">{dayLoaded} cs</strong>
                    </span>
                    <span className="bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                      Returned: <strong className="text-slate-900">{dayReturned} cs</strong>
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {isDayExpanded ? 'Click to contract' : 'Click to expand'}
                    </span>
                  </div>
                </div>

                {/* Day's Trips List (Rendered when expanded) */}
                {isDayExpanded && (
                  <div className="divide-y-2" style={{ borderColor: palette.line }}>
                    {group.trips.map((trip) => (
                      <TripCardItem
                        key={trip.id}
                        trip={trip}
                        palette={palette}
                        scale={scale}
                        fz={fz}
                        products={products}
                        bills={bills}
                        onEdit={onEdit}
                        onRecordReturn={onRecordReturn}
                        onReopen={onReopen}
                        onDelete={onDelete}
                        onAutoAssign={onAutoAssign}
                        onManageBills={onManageBills}
                        tripBreakdown={tripBreakdown}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
