import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Bill, Trip } from '../../types';
import { IconButton } from '../common/IconButton';
import { EditTripModal } from './EditTripModal';
import { AssignBillsModal } from './AssignBillsModal';
import { TripCardItem } from './TripCardItem';
import { TripHistorySection } from './TripHistorySection';

interface TripsViewProps {
  initialSubTab?: 'active' | 'history';
}

export const TripsView: React.FC<TripsViewProps> = ({ initialSubTab = 'active' }) => {
  const {
    trips,
    bills,
    products,
    salesmen,
    addTrip,
    toggleBillAssignment,
    unassignBillFromTrip,
    autoAssignTripBills,
    saveReturn,
    reopenTrip,
    updateTrip,
    deleteTrip,
    syncTripsToCloud,
    supabaseStatus,
    tripBreakdown,
    palette,
    fz,
    scale,
  } = useLedger();

  // Sub-Navigation: 'active' (active trip screen) vs 'history' (dedicated history section)
  const [tripsTab, setTripsTab] = useState<'active' | 'history'>(initialSubTab);

  const [showAddTrip, setShowAddTrip] = useState(false);
  const [selectedSalesmanId, setSelectedSalesmanId] = useState<string>('');
  const [vehicleName, setVehicleName] = useState('');
  const [tripDate, setTripDate] = useState(new Date().toISOString().slice(0, 10));
  const [autoAttachBillsForDate, setAutoAttachBillsForDate] = useState(true);
  const [loadedQuantities, setLoadedQuantities] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Return reconciliation modal/drawer state
  const [returningTripId, setReturningTripId] = useState<number | null>(null);
  const [returnDraft, setReturnDraft] = useState<Record<number, string>>({});

  // Editing trip state (load/unload & details)
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

  // Managing bills modal state (Assign / Unassign customer bills)
  const [managingBillsTrip, setManagingBillsTrip] = useState<Trip | null>(null);

  // Deletion confirmation modal state (Custom in-app modal to avoid iframe suppression)
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);

  const cardStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    borderColor: palette.line,
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    color: palette.ink,
    borderColor: palette.line,
    ...fz(14),
  };

  const labelStyle: React.CSSProperties = {
    ...fz(12.5, { fontWeight: 700, color: palette.ink, marginBottom: '0.25em' }),
    display: 'block',
  };

  const availableDateBillsCount = useMemo(() => {
    return bills.filter((b) => b.date === tripDate).length;
  }, [bills, tripDate]);

  // Active trips vs historic closed trips
  const activeTrips = useMemo(() => trips.filter((t) => t.status === 'out'), [trips]);
  const closedTrips = useMemo(() => trips.filter((t) => t.status === 'closed'), [trips]);

  // Overall totals across all trips
  const overallStats = useMemo(() => {
    let totalLoaded = 0;
    let totalReturned = 0;
    let totalDispatchedTrips = trips.length;
    let activeTripsCount = activeTrips.length;
    let closedTripsCount = closedTrips.length;

    for (const t of trips) {
      for (const qty of Object.values(t.loaded || {})) {
        totalLoaded += qty || 0;
      }
      for (const qty of Object.values(t.returned || {})) {
        totalReturned += qty || 0;
      }
    }
    return { totalLoaded, totalReturned, totalDispatchedTrips, activeTripsCount, closedTripsCount };
  }, [trips, activeTrips, closedTrips]);

  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!vehicleName.trim()) {
      setFormError('Vehicle number or driver name is required.');
      return;
    }

    const loadedMap: Record<number, number> = {};
    for (const [pid, val] of Object.entries(loadedQuantities)) {
      const num = Number(val);
      if (num > 0) {
        loadedMap[Number(pid)] = num;
      }
    }

    if (Object.keys(loadedMap).length === 0) {
      setFormError('Please enter loaded crate quantities for at least one beverage product.');
      return;
    }

    // Auto-attach matching customer bills for this date if checked
    const initialBillIds = autoAttachBillsForDate
      ? bills.filter((b) => b.date === tripDate).map((b) => b.id)
      : [];

    const matchedSalesman = salesmen.find((s) => s.id === selectedSalesmanId);
    const resolvedSalesmanName = matchedSalesman?.name;

    addTrip(
      vehicleName,
      tripDate,
      loadedMap,
      undefined,
      initialBillIds,
      resolvedSalesmanName,
      undefined,
      selectedSalesmanId || undefined
    );
    setVehicleName('');
    setSelectedSalesmanId('');
    setLoadedQuantities({});
    setShowAddTrip(false);
    setTripsTab('active');

    if (initialBillIds.length > 0) {
      setSyncMsg(
        `Trip dispatched with ${initialBillIds.length} customer delivery bill(s) automatically assigned!`
      );
    } else {
      setSyncMsg('Trip dispatched & synchronized to database!');
    }
    setTimeout(() => setSyncMsg(null), 4000);
  };

  const handleAutoAssign = (tripId: number, dateStr: string) => {
    const addedCount = autoAssignTripBills(tripId);
    if (addedCount > 0) {
      setSyncMsg(
        `Automatically assigned ${addedCount} customer bill(s) for ${dateStr} to Trip #${tripId}!`
      );
    } else {
      setSyncMsg(`All customer bills for ${dateStr} are already assigned to this trip.`);
    }
    setTimeout(() => setSyncMsg(null), 4000);
  };

  const startReturnRecord = (trip: Trip) => {
    setReturningTripId(trip.id);
    const initial: Record<number, string> = {};
    for (const pid of Object.keys(trip.loaded)) {
      initial[Number(pid)] =
        trip.returned[Number(pid)] !== undefined ? String(trip.returned[Number(pid)]) : '0';
    }
    setReturnDraft(initial);
  };

  const handleSaveReturn = () => {
    if (!returningTripId) return;
    const finalReturn: Record<number, number> = {};
    for (const [pid, val] of Object.entries(returnDraft)) {
      finalReturn[Number(pid)] = Number(val) || 0;
    }
    saveReturn(returningTripId, finalReturn);
    setReturningTripId(null);
    setSyncMsg(`Trip #${returningTripId} return recorded and reconciled.`);
    setTimeout(() => setSyncMsg(null), 4000);
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Global Actions */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b-2"
        style={{ borderColor: palette.line }}
      >
        <div>
          <h1
            className="text-lg sm:text-2xl font-black tracking-tight"
            style={{ color: palette.ink }}
          >
            Vehicle Delivery Trips
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Track vehicle dispatch loading sheets, delivery bills, and return reconciliations.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Supabase Status Indicator */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border-2"
            style={{
              borderColor: supabaseStatus.isConnected ? palette.good : palette.line,
              backgroundColor: supabaseStatus.isConnected ? `${palette.good}15` : `${palette.line}40`,
              color: supabaseStatus.isConnected ? palette.good : palette.muted,
            }}
            title={supabaseStatus.message}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                supabaseStatus.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span className="hidden sm:inline">
              {supabaseStatus.isConnected ? 'Supabase Sync Active' : 'Offline / Standalone'}
            </span>
            <span className="sm:hidden">
              {supabaseStatus.isConnected ? 'Online' : 'Offline'}
            </span>
          </div>

          <button
            type="button"
            onClick={async () => {
              setIsSyncing(true);
              const res = await syncTripsToCloud();
              setIsSyncing(false);
              setSyncMsg(res.success ? `Synced ${res.count} trips!` : `Sync error: ${res.error}`);
              setTimeout(() => setSyncMsg(null), 4000);
            }}
            disabled={isSyncing}
            className="flex items-center gap-1 border-2 px-2.5 py-1.5 focus-ring cursor-pointer font-semibold rounded text-xs transition-colors hover:bg-slate-100"
            style={{ borderColor: palette.line, color: palette.ink, backgroundColor: palette.panel }}
            title="Force push trips to Supabase"
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} aria-hidden="true" />
            <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
          </button>

          <button
            type="button"
            id="btn-dispatch-trip"
            onClick={() => {
              setShowAddTrip(true);
              setTripsTab('active');
            }}
            className="flex items-center gap-1 border-2 px-3 py-1.5 focus-ring cursor-pointer font-bold rounded shadow-xs text-xs sm:text-sm text-white transition-opacity hover:opacity-95"
            style={{
              backgroundColor: palette.navy,
              borderColor: palette.navy,
            }}
          >
            <Plus size={14} aria-hidden="true" />
            <span>Dispatch Trip</span>
          </button>
        </div>
      </div>

      {/* Sync / Success Toast */}
      {syncMsg && (
        <div
          className="flex items-center justify-between p-3 border-2 rounded text-xs font-semibold transition-all"
          style={{
            borderColor: palette.good,
            backgroundColor: `${palette.good}15`,
            color: palette.good,
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{syncMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncMsg(null)}
            className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Primary Section Switcher: Active Trips ("Trip Screen") vs History ("History Section") */}
      <div
        className="flex items-center justify-between border-b-2 gap-2 flex-wrap"
        style={{ borderColor: palette.line }}
      >
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            id="tab-active-trips"
            onClick={() => setTripsTab('active')}
            className={`flex items-center gap-2 px-3.5 sm:px-5 py-2.5 text-xs sm:text-sm font-black border-b-2 -mb-[2px] transition-colors cursor-pointer ${
              tripsTab === 'active'
                ? 'border-blue-600 text-blue-700 bg-blue-50/60'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck size={16} />
            <span>Active Trips ({activeTrips.length})</span>
          </button>

          <button
            type="button"
            id="tab-trip-history"
            onClick={() => setTripsTab('history')}
            className={`flex items-center gap-2 px-3.5 sm:px-5 py-2.5 text-xs sm:text-sm font-black border-b-2 -mb-[2px] transition-colors cursor-pointer ${
              tripsTab === 'history'
                ? 'border-blue-600 text-blue-700 bg-blue-50/60'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <History size={16} />
            <span>Trip History ({trips.length})</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium py-1">
          {tripsTab === 'active'
            ? `${activeTrips.length} active vehicle run(s)`
            : `${trips.length} total sequential dispatches`}
        </div>
      </div>

      {/* TAB 1: ACTIVE TRIPS SCREEN */}
      {tripsTab === 'active' && (
        <div className="space-y-4">
          {/* Active Trips Metrics Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border-2 p-3 rounded-sm shadow-xs" style={cardStyle}>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Vehicles on Delivery
              </div>
              <div className="text-xl font-extrabold mt-1 text-slate-900">
                {overallStats.activeTripsCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Currently on run</div>
            </div>
            <div className="border-2 p-3 rounded-sm shadow-xs" style={cardStyle}>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Loaded On Active Vans
              </div>
              <div className="text-xl font-extrabold mt-1 text-slate-900">
                {activeTrips.reduce(
                  (acc, t) =>
                    acc + Object.values(t.loaded || {}).reduce((s, q) => s + (q || 0), 0),
                  0
                )}{' '}
                cs
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">In transit to retailers</div>
            </div>
            <div className="border-2 p-3 rounded-sm shadow-xs" style={cardStyle}>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Customer Stops Out
              </div>
              <div className="text-xl font-extrabold mt-1 text-slate-900">
                {activeTrips.reduce((acc, t) => acc + (t.billIds || []).length, 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Assigned delivery bills</div>
            </div>
            <div className="border-2 p-3 rounded-sm shadow-xs" style={cardStyle}>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Completed in History
              </div>
              <div className="text-xl font-extrabold mt-1 text-slate-900">
                {overallStats.closedTripsCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
                Reconciled runs archived
              </div>
            </div>
          </div>

          {/* New Trip Form Drawer */}
          {showAddTrip && (
            <form
              id="form-new-trip"
              onSubmit={handleCreateTrip}
              className="border-2 p-5 mb-4 shadow-sm rounded-sm"
              style={{ borderColor: palette.navy, backgroundColor: palette.panel }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 style={fz(18, { fontWeight: 700, color: palette.ink })}>
                  Dispatch Vehicle Loading Sheet
                </h2>
                <IconButton onClick={() => setShowAddTrip(false)} icon={X} label="Close trip form" />
              </div>

              {formError && (
                <div
                  className="flex items-center gap-2 p-3 border-2 mb-4 rounded"
                  style={{
                    borderColor: palette.bad,
                    backgroundColor: `${palette.bad}15`,
                    color: palette.bad,
                    ...fz(14, { fontWeight: 600 }),
                  }}
                  role="alert"
                >
                  <AlertTriangle size={Math.round(18 * scale)} aria-hidden="true" />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label htmlFor="trip-salesman-select" style={labelStyle}>
                    Assigned Salesman *
                  </label>
                  <select
                    id="trip-salesman-select"
                    value={selectedSalesmanId}
                    onChange={(e) => {
                      const smId = e.target.value;
                      setSelectedSalesmanId(smId);
                      const sm = salesmen.find((s) => s.id === smId);
                      if (sm?.defaultVehicle && !vehicleName) {
                        setVehicleName(sm.defaultVehicle);
                      }
                    }}
                    className="w-full border-2 px-3 py-2.5 focus-ring rounded"
                    style={inputStyle}
                  >
                    <option value="">-- Choose Field Salesman --</option>
                    {salesmen
                      .filter((s) => s.active !== false)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.phone}){s.defaultVehicle ? ` • ${s.defaultVehicle}` : ''}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="vehicle-name" style={labelStyle}>
                    Vehicle Number / Van *
                  </label>
                  <input
                    id="vehicle-name"
                    type="text"
                    required
                    placeholder="e.g. Tata Ace MH-14-1234"
                    value={vehicleName}
                    onChange={(e) => setVehicleName(e.target.value)}
                    className="w-full border-2 px-3 py-2.5 focus-ring rounded"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="trip-date" style={labelStyle}>
                    Dispatch Date
                  </label>
                  <input
                    id="trip-date"
                    type="date"
                    value={tripDate}
                    onChange={(e) => setTripDate(e.target.value)}
                    className="w-full border-2 px-3 py-2.5 focus-ring rounded"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Automatic Customer Bill Assignment Checkbox */}
              <div
                className="mb-4 p-3 border-2 rounded flex items-center justify-between flex-wrap gap-2"
                style={{ borderColor: palette.line, backgroundColor: `${palette.line}15` }}
              >
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold select-none">
                  <input
                    type="checkbox"
                    checked={autoAttachBillsForDate}
                    onChange={(e) => setAutoAttachBillsForDate(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus-ring cursor-pointer"
                  />
                  <span>
                    Automatically attach customer delivery bills dated {tripDate} to this vehicle run
                  </span>
                </label>
                {availableDateBillsCount > 0 && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    ⚡ {availableDateBillsCount} bill(s) ready for this date
                  </span>
                )}
              </div>

              <div style={fz(14, { fontWeight: 700, color: palette.ink, marginBottom: '0.4em' })}>
                Load Quantities into Vehicle (Cases):
              </div>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4 max-h-72 overflow-y-auto p-3 border-2 rounded"
                style={{ borderColor: palette.line, backgroundColor: palette.panel }}
              >
                {products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 border-b pb-1">
                    <label htmlFor={`load-${p.id}`} className="truncate text-xs font-semibold" title={p.name}>
                      {p.name}
                    </label>
                    <input
                      id={`load-${p.id}`}
                      type="number"
                      min="0"
                      placeholder="0"
                      value={loadedQuantities[p.id] || ''}
                      onChange={(e) =>
                        setLoadedQuantities({ ...loadedQuantities, [p.id]: e.target.value })
                      }
                      className="w-20 border-2 px-2 py-1 text-right focus-ring font-semibold rounded"
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  id="btn-submit-trip"
                  type="submit"
                  className="border-2 px-5 py-2.5 focus-ring cursor-pointer font-bold rounded"
                  style={{
                    backgroundColor: palette.navy,
                    borderColor: palette.navy,
                    color: '#FFFFFF',
                    ...fz(14),
                  }}
                >
                  Confirm & Dispatch Trip
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTrip(false)}
                  className="border-2 px-4 py-2.5 focus-ring cursor-pointer font-semibold rounded"
                  style={{
                    borderColor: palette.line,
                    color: palette.muted,
                    backgroundColor: palette.panel,
                    ...fz(14),
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Record Return Drawer / Form */}
          {(() => {
            if (!returningTripId) return null;
            const returningTrip = trips.find((t) => t.id === returningTripId);
            if (!returningTrip) return null;

            return (
              <div
                className="border-2 p-5 mb-4 shadow-md rounded-sm"
                style={{ borderColor: palette.good, backgroundColor: palette.panel }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 style={fz(18, { fontWeight: 700, color: palette.ink })}>
                    Record Vehicle Return & Reconcile — Trip #{returningTrip.id} ({returningTrip.vehicle})
                  </h2>
                  <IconButton onClick={() => setReturningTripId(null)} icon={X} label="Close return form" />
                </div>

                <p style={fz(13, { color: palette.muted, marginBottom: '1em' })}>
                  Count crates brought back on the vehicle. The system compares Loaded vs Delivered (via assigned customer bills) vs Returned to flag any shortage.
                </p>

                <div
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4 max-h-72 overflow-y-auto p-3 border-2 rounded"
                  style={{ borderColor: palette.line }}
                >
                  {Object.keys(returningTrip.loaded).map((pidStr) => {
                    const pid = Number(pidStr);
                    const p = products.find((x) => x.id === pid);
                    const loaded = returningTrip.loaded[pid] || 0;
                    return (
                      <div key={pid} className="flex items-center justify-between gap-2 border-b pb-1">
                        <div>
                          <div className="text-xs font-semibold truncate" title={p?.name}>
                            {p?.name || `Product #${pid}`}
                          </div>
                          <div className="text-[11px] text-slate-500">Loaded: {loaded} cs</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <label htmlFor={`ret-${pid}`} className="sr-only">
                            Returned crates for {p?.name}
                          </label>
                          <input
                            id={`ret-${pid}`}
                            type="number"
                            min="0"
                            value={returnDraft[pid] || ''}
                            onChange={(e) => setReturnDraft({ ...returnDraft, [pid]: e.target.value })}
                            className="w-20 border-2 px-2 py-1 text-right focus-ring font-semibold rounded"
                            style={inputStyle}
                          />
                          <span className="text-xs text-slate-500">cs</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <button
                    id="btn-save-return-trip"
                    type="button"
                    onClick={handleSaveReturn}
                    className="border-2 px-5 py-2.5 focus-ring cursor-pointer font-bold rounded"
                    style={{
                      backgroundColor: palette.good,
                      borderColor: palette.good,
                      color: '#FFFFFF',
                      ...fz(14),
                    }}
                  >
                    Close Trip & Reconcile
                  </button>
                  <button
                    type="button"
                    onClick={() => setReturningTripId(null)}
                    className="border-2 px-4 py-2.5 focus-ring cursor-pointer font-semibold rounded"
                    style={{
                      borderColor: palette.line,
                      color: palette.muted,
                      backgroundColor: palette.panel,
                      ...fz(14),
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Active Trips Content */}
          {activeTrips.length === 0 ? (
            <div
              className="border-2 p-8 text-center shadow-xs rounded-lg bg-white space-y-3"
              style={cardStyle}
            >
              <Truck
                size={Math.round(36 * scale)}
                className="mx-auto text-slate-400 opacity-60"
                aria-hidden="true"
              />
              <div style={fz(16, { fontWeight: 700, color: palette.ink })}>
                No vehicles currently out on delivery
              </div>
              <div style={fz(13, { color: palette.muted, maxWidth: '420px', margin: '0 auto' })}>
                All dispatches have returned and reconciled. Past completed runs are archived in the dedicated{' '}
                <strong>Trip History</strong> section.
              </div>
              <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowAddTrip(true)}
                  className="border-2 px-4 py-2 font-bold text-xs rounded text-white cursor-pointer shadow-xs transition-opacity hover:opacity-90"
                  style={{ backgroundColor: palette.navy, borderColor: palette.navy }}
                >
                  + Dispatch New Trip
                </button>
                {trips.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTripsTab('history')}
                    className="border-2 px-4 py-2 font-bold text-xs rounded cursor-pointer hover:bg-slate-50 transition-colors"
                    style={{ borderColor: palette.line, color: palette.ink }}
                  >
                    View Trip History ({trips.length}) →
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                Active Vehicle Runs ({activeTrips.length})
              </div>
              <div
                className="divide-y-2 border-2 rounded-lg overflow-hidden bg-white shadow-xs"
                style={{ borderColor: palette.line }}
              >
                {activeTrips.map((trip) => (
                  <TripCardItem
                    key={trip.id}
                    trip={trip}
                    palette={palette}
                    scale={scale}
                    fz={fz}
                    products={products}
                    bills={bills}
                    onEdit={setEditingTrip}
                    onRecordReturn={startReturnRecord}
                    onReopen={reopenTrip}
                    onDelete={setTripToDelete}
                    onAutoAssign={handleAutoAssign}
                    onManageBills={setManagingBillsTrip}
                    tripBreakdown={tripBreakdown}
                    initiallyExpandedBreakdown={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DEDICATED TRIP HISTORY SECTION (Date-wise, sequential, default contracted) */}
      {tripsTab === 'history' && (
        <TripHistorySection
          trips={trips}
          products={products}
          bills={bills}
          palette={palette}
          scale={scale}
          fz={fz}
          onEdit={setEditingTrip}
          onRecordReturn={startReturnRecord}
          onReopen={reopenTrip}
          onDelete={setTripToDelete}
          onAutoAssign={handleAutoAssign}
          onManageBills={setManagingBillsTrip}
          tripBreakdown={tripBreakdown}
        />
      )}

      {/* Modal 1: Edit Trip Modal */}
      {editingTrip && (
        <EditTripModal
          trip={editingTrip}
          isOpen={Boolean(editingTrip)}
          products={products}
          bills={bills}
          palette={palette}
          fz={fz}
          scale={scale}
          onClose={() => setEditingTrip(null)}
          onSave={updateTrip}
        />
      )}

      {/* Modal 2: Assign Customer Bills Modal */}
      {managingBillsTrip && (
        <AssignBillsModal
          trip={managingBillsTrip}
          isOpen={Boolean(managingBillsTrip)}
          bills={bills}
          products={products}
          palette={palette}
          fz={fz}
          scale={scale}
          onClose={() => setManagingBillsTrip(null)}
          onToggleBill={toggleBillAssignment}
          onAutoAssignDate={autoAssignTripBills}
        />
      )}

      {/* Modal 3: Custom In-App Modal for Delete Confirmation (Guaranteed to work in iframe) */}
      {tripToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-delete-trip-title"
        >
          <div
            className="w-full max-w-md border-2 shadow-2xl rounded-sm overflow-hidden"
            style={{ backgroundColor: palette.panel, borderColor: palette.bad }}
          >
            <div
              className="p-4 border-b-2 flex items-center justify-between text-white"
              style={{ backgroundColor: palette.bad }}
            >
              <div className="flex items-center gap-2 font-bold text-base">
                <Trash2 size={20} aria-hidden="true" />
                <span id="modal-delete-trip-title">Confirm Delete Trip</span>
              </div>
              <button
                type="button"
                onClick={() => setTripToDelete(null)}
                className="text-white/80 hover:text-white p-1 rounded transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p style={fz(14, { color: palette.ink, lineHeight: 1.5 })}>
                Are you sure you want to permanently delete{' '}
                <strong>
                  Trip #{tripToDelete.id} ({tripToDelete.vehicle})
                </strong>{' '}
                dispatched on <strong>{tripToDelete.date}</strong>?
              </p>
              <div
                className="p-3 border-2 rounded text-xs"
                style={{
                  backgroundColor: `${palette.bad}10`,
                  borderColor: palette.bad,
                  color: palette.bad,
                }}
              >
                This will remove the vehicle loading record and dissociate its assigned delivery bills.
                This action is synchronized to cloud storage and cannot be undone.
              </div>
            </div>

            <div
              className="p-4 border-t-2 flex items-center justify-end gap-2"
              style={{ borderColor: palette.line, backgroundColor: `${palette.line}20` }}
            >
              <button
                type="button"
                onClick={() => setTripToDelete(null)}
                className="border-2 px-4 py-2 text-xs font-semibold rounded cursor-pointer transition-colors"
                style={{
                  borderColor: palette.line,
                  color: palette.ink,
                  backgroundColor: palette.panel,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-trip"
                onClick={() => {
                  const id = tripToDelete.id;
                  const v = tripToDelete.vehicle;
                  deleteTrip(id);
                  setTripToDelete(null);
                  setSyncMsg(`Trip #${id} (${v}) was deleted successfully.`);
                  setTimeout(() => setSyncMsg(null), 4000);
                }}
                className="border-2 px-4 py-2 text-xs font-bold text-white rounded cursor-pointer transition-all shadow-xs"
                style={{
                  backgroundColor: palette.bad,
                  borderColor: palette.bad,
                }}
              >
                Yes, Delete Trip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
