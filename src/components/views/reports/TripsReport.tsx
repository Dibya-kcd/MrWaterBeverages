import React, { useState, useMemo } from 'react';
import { ArrowRight, Truck, Package, CheckCircle2, AlertTriangle, Calendar, FileText, ChevronDown, ChevronUp, Building2 } from 'lucide-react';
import { Trip, Warehouse } from '../../../types';
import { StatCard, Card, Badge, Button } from '../../ui';
import { todayISO, toLocalISODate } from "../../../utils/dateLocal";

interface TripsReportProps {
  filteredTrips: Trip[];
  tripBreakdown: (t: Trip) => { rows: any[] };
  period: string;
  warehouses?: Warehouse[];
  onNavigateTrips: () => void;
}

export const TripsReport: React.FC<TripsReportProps> = ({
  filteredTrips,
  tripBreakdown,
  period,
  warehouses = [],
  onNavigateTrips,
}) => {
  const [viewMode, setViewMode] = useState<'daywise' | 'log'>('daywise');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const todayStr = useMemo(() => todayISO(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);

  const formatFriendlyDate = (dateStr: string) => {
    if (!dateStr) return 'Unknown Date';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const tripStats = useMemo(() => {
    return filteredTrips.reduce(
      (acc, t) => {
        const { rows } = tripBreakdown(t);
        const loaded = Object.values(t.loaded || {}).reduce((s, v) => s + v, 0);
        const returned = Object.values(t.returned || {}).reduce((s, v) => s + v, 0);
        const delivered = rows.reduce((s, r) => s + r.sold, 0);
        const discrepancy = rows.reduce((s, r) => s + r.discrepancy, 0);
        return {
          loaded: acc.loaded + loaded,
          delivered: acc.delivered + delivered,
          returned: acc.returned + returned,
          discrepancy: acc.discrepancy + discrepancy,
        };
      },
      { loaded: 0, delivered: 0, returned: 0, discrepancy: 0 }
    );
  }, [filteredTrips, tripBreakdown]);

  // Day-wise aggregated trip runs breakdown (Sorted Day-wise, Latest on top)
  const dayWiseTrips = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        tripCount: number;
        vehicles: Set<string>;
        loaded: number;
        delivered: number;
        returned: number;
        discrepancy: number;
        trips: Trip[];
      }
    >();

    filteredTrips.forEach((t) => {
      const d = (t.date || '').slice(0, 10) || 'Unknown Date';
      const { rows } = tripBreakdown(t);
      const loaded = Object.values(t.loaded || {}).reduce((s, v) => s + v, 0);
      const returned = Object.values(t.returned || {}).reduce((s, v) => s + v, 0);
      const delivered = rows.reduce((s, r) => s + r.sold, 0);
      const disc = rows.reduce((s, r) => s + r.discrepancy, 0);

      const existing = map.get(d);
      if (!existing) {
        map.set(d, {
          date: d,
          tripCount: 1,
          vehicles: new Set([t.vehicle || 'Van']),
          loaded,
          delivered,
          returned,
          discrepancy: disc,
          trips: [t],
        });
      } else {
        existing.tripCount += 1;
        if (t.vehicle) existing.vehicles.add(t.vehicle);
        existing.loaded += loaded;
        existing.delivered += delivered;
        existing.returned += returned;
        existing.discrepancy += disc;
        existing.trips.push(t);
      }
    });

    // Sort strictly day-wise: Latest day on top
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredTrips, tripBreakdown]);

  // Individual trips sorted latest date on top
  const sortedTrips = useMemo(() => {
    return [...filteredTrips].sort((a, b) => {
      const dCmp = (b.date || '').localeCompare(a.date || '');
      if (dCmp !== 0) return dCmp;
      return Number(b.id) - Number(a.id);
    });
  }, [filteredTrips]);

  return (
    <div className="space-y-6">
      {/* Metrics Row: 2-col mobile -> 4-col desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Dispatched Trips"
          value={`${filteredTrips.length} runs`}
          icon={Truck}
          subtitle="Route delivery trips"
          variant="default"
        />

        <StatCard
          title="Crates Loaded"
          value={`${tripStats.loaded} cs`}
          icon={Package}
          subtitle="Total cargo dispatched"
          variant="accent"
        />

        <StatCard
          title="Crates Delivered"
          value={`${tripStats.delivered} cs`}
          icon={CheckCircle2}
          subtitle="Delivered to retailers"
          variant="success"
        />

        <StatCard
          title="Stock Discrepancy"
          value={`${tripStats.discrepancy} cases`}
          icon={AlertTriangle}
          subtitle="Unaccounted in transit"
          variant={tripStats.discrepancy > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Trips Reconciliation Table with Day-wise View Toggle */}
      <Card noPadding>
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900">Vehicle Trips & Dispatches Report</h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                Sorted: Day-wise, Latest on Top ↓
              </span>
            </div>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Loaded vs delivered counts, returned empties, and transit variance.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setViewMode('daywise')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors ${
                  viewMode === 'daywise'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Day-Wise Summary ({dayWiseTrips.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('log')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors ${
                  viewMode === 'log'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Trip Logs ({filteredTrips.length})</span>
              </button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={onNavigateTrips}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Open Trips Manager
            </Button>
          </div>
        </div>

        {filteredTrips.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No delivery trips recorded for {period}. Log trips under Vehicle Trips to track drivers and vehicles.
          </div>
        ) : viewMode === 'daywise' ? (
          /* ======================================================== */
          /* DAY-WISE TRIPS SUMMARY (LATEST DAY ON TOP)               */
          /* ======================================================== */
          <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left data-table text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                  <th className="px-4 py-3">Dispatch Date</th>
                  <th className="px-3 py-3 text-center">Trips Run</th>
                  <th className="px-3 py-3">Vehicles Dispatched</th>
                  <th className="px-3 py-3 text-right">Loaded</th>
                  <th className="px-3 py-3 text-right">Delivered</th>
                  <th className="px-3 py-3 text-right">Returned</th>
                  <th className="px-3 py-3 text-right">Transit Variance</th>
                  <th className="px-3 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dayWiseTrips.map((day) => {
                  const isExpanded = expandedDay === day.date;
                  const isToday = day.date === todayStr;
                  const isYesterday = day.date === yesterdayStr;

                  return (
                    <React.Fragment key={day.date}>
                      <tr className={`hover:bg-slate-50/75 transition-colors ${isExpanded ? 'bg-sky-50/40' : ''}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono">{day.date}</span>
                            {isToday && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Today
                              </span>
                            )}
                            {isYesterday && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 text-blue-800 border border-sky-200">
                                Yesterday
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-normal block mt-0.5">
                            {formatFriendlyDate(day.date)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border">
                            {day.tripCount} {day.tripCount === 1 ? 'run' : 'runs'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600 max-w-[150px] truncate">
                          {Array.from(day.vehicles).join(', ')}
                        </td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums">{day.loaded} cs</td>
                        <td className="px-3 py-3 text-right font-medium text-emerald-700 tabular-nums">
                          {day.delivered} cs
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-600 tabular-nums">
                          {day.returned} cs
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-black tabular-nums ${
                            day.discrepancy > 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {day.discrepancy > 0 ? `-${day.discrepancy} cs` : '0'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                            className="px-2.5 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-50 text-sky-700 flex items-center gap-1 mx-auto cursor-pointer transition-colors shadow-sm"
                          >
                            <span>{isExpanded ? 'Hide' : 'View Runs'}</span>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Sub-Table showing individual trips of this day */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={8} className="p-3 sm:p-4">
                            <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 shadow-inner">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700 border-b pb-2">
                                <span>Vehicle Dispatches on {formatFriendlyDate(day.date)}</span>
                                <span className="text-slate-500 font-medium">{day.trips.length} Trips</span>
                              </div>
                              <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b text-[10.5px] uppercase font-bold text-slate-500 bg-slate-50">
                                      <th className="px-3 py-1.5 text-left">Trip ID</th>
                                      <th className="px-3 py-1.5 text-left">Vehicle</th>
                                      <th className="px-3 py-1.5 text-left">Godown</th>
                                      <th className="px-3 py-1.5 text-left">Status</th>
                                      <th className="px-3 py-1.5 text-right">Loaded</th>
                                      <th className="px-3 py-1.5 text-right">Delivered</th>
                                      <th className="px-3 py-1.5 text-right">Returned</th>
                                      <th className="px-3 py-1.5 text-right">Discrepancy</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {day.trips.map((t) => {
                                      const { rows } = tripBreakdown(t);
                                      const loaded = Object.values(t.loaded || {}).reduce((s, v) => s + v, 0);
                                      const returned = Object.values(t.returned || {}).reduce((s, v) => s + v, 0);
                                      const delivered = rows.reduce((s, r) => s + r.sold, 0);
                                      const disc = rows.reduce((s, r) => s + r.discrepancy, 0);
                                      return (
                                        <tr key={t.id} className="hover:bg-slate-50">
                                          <td className="px-3 py-2 font-mono font-bold text-sky-700">{t.id}</td>
                                          <td className="px-3 py-2 font-semibold text-slate-900">{t.vehicle}</td>
                                          <td className="px-3 py-2">
                                            <Badge
                                              variant={t.status === 'out' ? 'warning' : 'success'}
                                              size="sm"
                                            >
                                              {t.status === 'out' ? 'In Transit' : 'Reconciled'}
                                            </Badge>
                                          </td>
                                          <td className="px-3 py-2 text-right font-medium">{loaded} cs</td>
                                          <td className="px-3 py-2 text-right text-emerald-700 font-medium">{delivered} cs</td>
                                          <td className="px-3 py-2 text-right text-slate-600">{returned} cs</td>
                                          <td className={`px-3 py-2 text-right font-bold ${disc > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                            {disc > 0 ? `-${disc} cs` : '0'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-black text-xs text-slate-900">
                  <td className="px-4 py-3" colSpan={3}>
                    TOTAL DISPATCHES ({dayWiseTrips.length} Active Days)
                  </td>
                  <td className="px-3 py-3 text-right">{tripStats.loaded} cs</td>
                  <td className="px-3 py-3 text-right text-emerald-800">{tripStats.delivered} cs</td>
                  <td className="px-3 py-3 text-right text-slate-600">{tripStats.returned} cs</td>
                  <td className={`px-3 py-3 text-right ${tripStats.discrepancy > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
                    {tripStats.discrepancy > 0 ? `-${tripStats.discrepancy} cs` : '0'}
                  </td>
                  <td className="px-3 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          /* ======================================================== */
          /* DETAILED TRIP LOGS (SORTED LATEST ON TOP)                */
          /* ======================================================== */
          <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left data-table text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                  <th className="px-4 py-3">Trip ID</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Vehicle</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Loaded</th>
                  <th className="px-3 py-3 text-right">Delivered</th>
                  <th className="px-3 py-3 text-right">Returned</th>
                  <th className="px-3 py-3 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedTrips.map((t) => {
                  const { rows } = tripBreakdown(t);
                  const loaded = Object.values(t.loaded || {}).reduce((s, v) => s + v, 0);
                  const returned = Object.values(t.returned || {}).reduce((s, v) => s + v, 0);
                  const delivered = rows.reduce((s, r) => s + r.sold, 0);
                  const disc = rows.reduce((s, r) => s + r.discrepancy, 0);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-sky-700">{t.id}</td>
                      <td className="px-3 py-3 text-slate-600 font-mono">{t.date}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{t.vehicle}</td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={t.status === 'out' ? 'warning' : 'success'}
                          size="sm"
                        >
                          {t.status === 'out' ? 'In Transit' : 'Reconciled'}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">{loaded} cs</td>
                      <td className="px-3 py-3 text-right font-medium text-emerald-700 tabular-nums">{delivered} cs</td>
                      <td className="px-3 py-3 text-right font-medium text-slate-600 tabular-nums">{returned} cs</td>
                      <td className={`px-3 py-3 text-right font-bold tabular-nums ${disc > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {disc > 0 ? `-${disc} cs` : '0'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-black text-xs text-slate-900">
                  <td className="px-4 py-3" colSpan={4}>
                    TOTAL TRIPS ({sortedTrips.length} Runs)
                  </td>
                  <td className="px-3 py-3 text-right">{tripStats.loaded} cs</td>
                  <td className="px-3 py-3 text-right text-emerald-800">{tripStats.delivered} cs</td>
                  <td className="px-3 py-3 text-right text-slate-600">{tripStats.returned} cs</td>
                  <td className={`px-3 py-3 text-right ${tripStats.discrepancy > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
                    {tripStats.discrepancy > 0 ? `-${tripStats.discrepancy} cs` : '0'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
