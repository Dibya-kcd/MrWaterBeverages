import React, { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Search, Trash2, Truck, X } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Trip } from '../../types';
import { billNetTotal } from '../../utils/salesReturns';
import { attachableBillsForTrip } from '../../utils/billing';
import { AssignBillsModal } from './AssignBillsModal';
import { TripEditScreen } from './TripEditScreen';
import { TripRecordReturnScreen } from './TripRecordReturnScreen';
import { NewTripSheet, NewTripPayload } from './trips/NewTripSheet';
import { TripListCard } from './trips/TripListCard';
import { SalesmanDuesPanel } from './trips/SalesmanDuesPanel';
import { useBeats } from '../../hooks/useBeats';

interface TripsViewProps {
  initialSubTab?: 'active' | 'history';
}

const HISTORY_PAGE = 30;

const fmtDay = (d?: string) => {
  if (!d) return 'Undated';
  const dt = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

export const TripsView: React.FC<TripsViewProps> = ({ initialSubTab = 'active' }) => {
  const { activeBeats } = useBeats();
  const {
    trips,
    bills,
    products,
    salesmen,
    customers,
    warehouses,
    defaultWarehouse,
    warehouseStock,
    remainingStock,
    getVehicleStock,
    addTrip,
    toggleBillAssignment,
    autoAssignTripBills,
    saveReturn,
    saveReturnDraft,
    recordTripCashRecovery,
    writeOffTripCashShort,
    payments,
    updateTrip,
    deleteTrip,
    tripBreakdown,
    palette,
    fz,
    scale,
  } = useLedger();

  // Active is the default; closed trips live under History.
  const [tripsTab, setTripsTab] = useState<'active' | 'history'>(initialSubTab);
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histSalesman, setHistSalesman] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'list' | 'edit-trip' | 'record-return'>('list');
  const [tripForEdit, setTripForEdit] = useState<Trip | null>(null);
  const [editReopens, setEditReopens] = useState(false);
  const [tripForReturn, setTripForReturn] = useState<Trip | null>(null);
  const [managingBillsTrip, setManagingBillsTrip] = useState<Trip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  };

  // Editing a completed trip reopens it: the edit form opens as an active trip and is only
  // reopened if the user saves. Going back leaves the trip completed.
  const openEdit = (t: Trip) => {
    const closed = t.status === 'closed';
    setEditReopens(closed);
    setTripForEdit(closed ? { ...t, status: 'out' } : t);
    setViewMode('edit-trip');
  };
  const openSettle = (t: Trip) => {
    setTripForReturn(t);
    setViewMode('record-return');
  };

  const sortedTrips = useMemo(
    () =>
      [...trips].sort((a, b) => {
        const da = a.date || '';
        const db = b.date || '';
        if (db !== da) return db.localeCompare(da);
        return Number(b.id) - Number(a.id);
      }),
    [trips],
  );
  const activeTrips = useMemo(() => sortedTrips.filter((t) => t.status !== 'closed'), [sortedTrips]);
  const closedTrips = useMemo(() => sortedTrips.filter((t) => t.status === 'closed'), [sortedTrips]);

  const vehicleOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...trips.map((t) => t.vehicle),
          ...salesmen.map((s) => s.defaultVehicle || ''),
        ].map((v) => (v || '').trim()).filter(Boolean)),
      ),
    [trips, salesmen],
  );
  const routeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...activeBeats.map((b) => b.name),
          ...trips.map((t) => t.route || ''),
          ...(customers || []).map((c) => c.route || ''),
        ].map((v) => (v || '').trim()).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [trips, customers, activeBeats],
  );

  const godownLabel = (t: Trip) => {
    const ids = t.warehouseLoads ? Object.keys(t.warehouseLoads) : [];
    const names = (ids.length ? ids : [t.warehouseId || '']).map(
      (id) => warehouses.find((w) => w.id === id)?.name || 'Main Godown',
    );
    return Array.from(new Set(names)).join(' + ');
  };

  const tripBillStats = (t: Trip) => {
    const ids = new Set((t.billIds || []).map(Number));
    const tb = bills.filter((b) => Number(b.tripId) === Number(t.id) || ids.has(Number(b.id)));
    return { count: tb.length, value: tb.reduce((s, b) => s + billNetTotal(b), 0) };
  };

  const renderCard = (t: Trip, mode: 'active' | 'history') => {
    const rows = tripBreakdown(t).rows.map((r) => ({
      ...r,
      reason: t.shortageReasons?.[r.productId]?.reason,
      reasonNote: t.shortageReasons?.[r.productId]?.note,
    }));
    const stats = tripBillStats(t);
    return (
      <TripListCard
        key={t.id}
        trip={t}
        mode={mode}
        rows={rows}
        billsCount={stats.count}
        soldValue={stats.value}
        godownLabel={godownLabel(t)}
        personLabel={t.driver || t.salesman || salesmen.find((s) => s.id === t.salesmanId)?.name}
        onSettle={openSettle}
        onEdit={openEdit}
        onBills={setManagingBillsTrip}
        onDelete={setTripToDelete}
      />
    );
  };

  const handleCreate = (p: NewTripPayload): string | null => {
    if (!p.vehicle) return 'Enter the vehicle (van) for this trip.';
    if (p.lines.length === 0) return 'Add at least one product with units to load.';

    // Stock is deducted when a bill is raised, not when the van is loaded, so the load sheet must
    // itself refuse loads the godown cannot cover (previously this was only a warning).
    // Bills this trip will pick up by date. Their crates are already out of stock (stock is deducted
    // at billing) and the load must cover them, or the trip starts with sold > loaded.
    const attachedBills = p.autoAttachBills
      ? attachableBillsForTrip({ date: p.date, salesmanId: p.salesmanId || undefined, vehicle: p.vehicle }, bills, trips)
      : [];
    const billedByProduct: Record<number, number> = {};
    for (const b of attachedBills) {
      for (const it of b.items || []) {
        const pid = Number(it.productId);
        billedByProduct[pid] = (billedByProduct[pid] || 0) + (Number(it.qty) || 0);
      }
    }
    const loadByProduct: Record<number, number> = {};
    for (const l of p.lines) loadByProduct[l.productId] = (loadByProduct[l.productId] || 0) + l.qty;
    for (const [pidStr, billed] of Object.entries(billedByProduct)) {
      const pid = Number(pidStr);
      if (billed > (loadByProduct[pid] || 0)) {
        const nm = products.find((x) => x.id === pid)?.name || `Product #${pid}`;
        return `${nm}: ${billed} already billed on the bills this trip would attach, so the load cannot be less than ${billed}. Add the units or untick "Attach today's bills".`;
      }
    }

    const wantByWh: Record<string, number> = {};
    const wantByProduct: Record<number, number> = {};
    for (const l of p.lines) {
      const wh = l.warehouseId || defaultWarehouse?.id || warehouses[0]?.id || '';
      wantByWh[`${wh}|${l.productId}`] = (wantByWh[`${wh}|${l.productId}`] || 0) + l.qty;
      wantByProduct[l.productId] = (wantByProduct[l.productId] || 0) + l.qty;
    }
    const nameOf = (id: number) => products.find((x) => x.id === id)?.name || `Product #${id}`;
    // Billed crates already left the godown, so only the unsold part of the load needs stock.
    const toCover = { ...billedByProduct };
    for (const key of Object.keys(wantByWh)) {
      const pid = Number(key.split('|')[1]);
      const use = Math.min(toCover[pid] || 0, wantByWh[key]);
      wantByWh[key] -= use;
      toCover[pid] = (toCover[pid] || 0) - use;
    }
    for (const [key, qty] of Object.entries(wantByWh)) {
      if (qty <= 0) continue;
      const [wh, pidStr] = key.split('|');
      const have = warehouseStock(wh, Number(pidStr));
      if (qty > have) {
        const whName = warehouses.find((w) => w.id === wh)?.name || 'Main Godown';
        return `${nameOf(Number(pidStr))}: loading ${qty} but ${whName} has only ${have}.`;
      }
    }
    // Crates already sitting unsold on other open vans are still counted in the godown balance,
    // so a second van could be loaded with the same crates. Count them as taken.
    for (const [pidStr, qty] of Object.entries(wantByProduct)) {
      const pid = Number(pidStr);
      const onVans = trips
        .filter((t) => t.status === 'out')
        .reduce((sum, t) => sum + getVehicleStock(t, pid).available, 0);
      const free = remainingStock(pid) - onVans;
      if (qty - (billedByProduct[pid] || 0) > free) {
        return `${nameOf(pid)}: only ${Math.max(0, free)} free to load (${onVans} already on other vans).`;
      }
    }

    const warehouseLoads: Record<string, Record<number, number>> = {};
    const loaded: Record<number, number> = {};
    for (const l of p.lines) {
      const wh = l.warehouseId || defaultWarehouse?.id || warehouses[0]?.id || '';
      warehouseLoads[wh] = warehouseLoads[wh] || {};
      warehouseLoads[wh][l.productId] = (warehouseLoads[wh][l.productId] || 0) + l.qty;
      loaded[l.productId] = (loaded[l.productId] || 0) + l.qty;
    }
    const perWh = Object.entries(warehouseLoads).map(([id, m]) => [id, Object.values(m).reduce((s, q) => s + q, 0)] as const);
    const primary = [...perWh].sort((a, b) => b[1] - a[1])[0]?.[0] || defaultWarehouse?.id || '';
    const salesman = salesmen.find((s) => s.id === p.salesmanId);
    const initialBillIds = attachedBills.map((b) => b.id);

    addTrip(p.vehicle, p.date, loaded, primary, initialBillIds, salesman?.name, p.route || undefined, p.salesmanId || undefined, warehouseLoads);

    const total = perWh.reduce((s, [, q]) => s + q, 0);
    setShowNewTrip(false);
    setTripsTab('active');
    showToast(`${p.vehicle} loaded with ${total} cs${perWh.length > 1 ? ` from ${perWh.length} godowns` : ''}.`);
    return null;
  };

  /* ---------- Full-screen sub-views ---------- */
  if (viewMode === 'edit-trip' && tripForEdit) {
    return (
      <TripEditScreen
        trip={tripForEdit}
        products={products}
        bills={bills}
        salesmen={salesmen}
        warehouses={warehouses}
        warehouseStock={warehouseStock}
        allTrips={trips}
        validateLoad={(t, newLoaded, billed) => {
          // Same free-stock rule as a new trip, applied only to products whose load goes up so
          // older trips can still be edited. Stock is deducted at billing, not at loading, so
          // crates unsold on other open vans must be counted as taken.
          for (const [pidStr, qty] of Object.entries(newLoaded)) {
            const pid = Number(pidStr);
            const before = Number(t.loaded?.[pid]) || 0;
            if (qty <= before) continue;
            const unsoldOnThisVan = Math.max(0, qty - (billed[pid] || 0));
            const onOtherVans = trips
              .filter((x) => x.status === 'out' && Number(x.id) !== Number(t.id))
              .reduce((sum, x) => sum + getVehicleStock(x, pid).available, 0);
            const free = remainingStock(pid) - onOtherVans;
            if (unsoldOnThisVan > free) {
              const name = products.find((x) => x.id === pid)?.name || `Product #${pid}`;
              return `${name}: only ${Math.max(0, free)} free to load (${onOtherVans} already on other vans), but this van would carry ${unsoldOnThisVan} unsold.`;
            }
          }
          return null;
        }}
        reopensOnSave={editReopens}
        onBack={() => {
          setViewMode('list');
          setTripForEdit(null);
        }}
        onSave={(updated) => {
          updateTrip(updated);
          setViewMode('list');
          setTripForEdit(null);
          if (editReopens && updated.status !== 'closed') setTripsTab('active');
          showToast(
            editReopens && updated.status !== 'closed'
              ? `Trip #${updated.id} (${updated.vehicle}) updated and moved back to Active.`
              : `Trip #${updated.id} (${updated.vehicle}) updated.`,
          );
        }}
        onRecordReturn={openSettle}
        onManageBills={(t) => setManagingBillsTrip(t)}
      />
    );
  }

  if (viewMode === 'record-return' && tripForReturn) {
    return (
      <TripRecordReturnScreen
        trip={tripForReturn}
        products={products}
        bills={bills}
        warehouses={warehouses}
        onBack={() => {
          setViewMode('list');
          setTripForReturn(null);
        }}
        payments={payments}
        onSaveReturn={(tripId, finalReturn, closeTrip, shortageReasons, cashHandedIn, cashShortBooked) => {
          // A draft is kept apart from the recorded returns and never closes the trip.
          if (closeTrip) {
            const saved = saveReturn(tripId, finalReturn, shortageReasons, cashHandedIn, cashShortBooked);
            if (saved.ok === false) return saved.error; // stay on the screen and show why
          } else saveReturnDraft(tripId, finalReturn, cashHandedIn);
          setViewMode('list');
          setTripForReturn(null);
          if (closeTrip) setTripsTab('history');
          showToast(
            closeTrip ? `Trip #${tripId} settled and moved to History.` : `Trip #${tripId} settlement draft saved.`,
          );
        }}
        onEditTrip={openEdit}
      />
    );
  }

  /* ---------- History filtering ---------- */
  const q = historySearch.trim().toLowerCase();
  const historySalesmen = Array.from(new Set(closedTrips.map((t) => (t.salesman || '').trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );
  const filteredHistory = closedTrips.filter((t) => {
    const day = (t.date || '').slice(0, 10);
    if (histFrom && (!day || day < histFrom)) return false;
    if (histTo && (!day || day > histTo)) return false;
    if (histSalesman && (t.salesman || '').trim() !== histSalesman) return false;
    if (!q) return true;
    return (
      (t.vehicle || '').toLowerCase().includes(q) ||
      String(t.id).includes(q) ||
      (t.date || '').includes(q) ||
      (t.route || '').toLowerCase().includes(q) ||
      (t.salesman || '').toLowerCase().includes(q)
    );
  });
  const historyFiltered = Boolean(q || histFrom || histTo || histSalesman);
  const setQuickRange = (days: number | 'month' | 'all') => {
    setHistoryLimit(HISTORY_PAGE);
    if (days === 'all') {
      setHistFrom('');
      setHistTo('');
      return;
    }
    const now = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (days === 'month') {
      setHistFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
    } else {
      setHistFrom(iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))));
    }
    setHistTo(iso(now));
  };
  const shownHistory = filteredHistory.slice(0, historyLimit);
  const historyGroups: { day: string; trips: Trip[] }[] = [];
  for (const t of shownHistory) {
    const day = fmtDay(t.date);
    const last = historyGroups[historyGroups.length - 1];
    if (last && last.day === day) last.trips.push(t);
    else historyGroups.push({ day, trips: [t] });
  }

  return (
    <div id="view-trips" className="mw-workspace w-full min-w-0 max-w-none lg:max-w-3xl mx-auto space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Trips</h1>
        <button
          type="button"
          id="btn-dispatch-trip"
          onClick={() => setShowNewTrip(true)}
          className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full bg-[#0d4a3a] hover:bg-[#0a3d30] text-white text-sm font-semibold shadow-sm cursor-pointer active:scale-[0.98]"
        >
          <Plus size={17} /> New trip
        </button>
      </div>

      {toast && (
        <div role="status" className="flex items-center justify-between gap-2 p-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-semibold">
          <span className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{toast}</span>
          </span>
          <button type="button" onClick={() => setToast(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Active / History */}
      <div className="flex bg-[#ebe8e1] rounded-full p-1 gap-0.5" role="tablist">
        {([
          { id: 'active' as const, label: 'Active', n: activeTrips.length },
          { id: 'history' as const, label: 'History', n: closedTrips.length },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tripsTab === t.id}
            id={`tab-${t.id === 'active' ? 'active-trips' : 'trip-history'}`}
            onClick={() => setTripsTab(t.id)}
            className={`flex-1 min-h-10 px-4 rounded-full text-sm font-semibold cursor-pointer transition-all ${
              tripsTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t.label} · {t.n}
          </button>
        ))}
      </div>

      {/* ACTIVE */}
      {tripsTab === 'active' && (
        <div className="space-y-3">
          {activeTrips.length === 0 ? (
            <div className="rounded-2xl border border-black/8 bg-white px-6 py-12 text-center">
              <div className="mx-auto size-12 rounded-2xl bg-[#e9f1ec] text-[#0d4a3a] flex items-center justify-center mb-3">
                <Truck size={22} />
              </div>
              <h2 className="text-base font-bold text-slate-900">No active trips</h2>
              <p className="text-sm text-slate-500 mt-1">Load a vehicle to start a trip.</p>
              <button
                type="button"
                onClick={() => setShowNewTrip(true)}
                className="mt-4 inline-flex items-center gap-1.5 min-h-11 px-5 rounded-full bg-[#0d4a3a] text-white text-sm font-semibold cursor-pointer"
              >
                <Plus size={16} /> New trip
              </button>
            </div>
          ) : (
            activeTrips.map((t) => renderCard(t, 'active'))
          )}
        </div>
      )}

      {/* HISTORY */}
      {tripsTab === 'history' && (
        <div className="space-y-3">
          <SalesmanDuesPanel
            trips={trips}
            salesmen={salesmen}
            onRecover={recordTripCashRecovery}
            onWriteOff={writeOffTripCashShort}
          />
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                setHistoryLimit(HISTORY_PAGE);
              }}
              placeholder="Search vehicle, beat, date, trip no."
              className="w-full pl-10 pr-3 py-3 rounded-full border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/25"
            />
          </div>

          <div className="rounded-2xl border border-black/8 bg-white p-3 space-y-2.5">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
              {([
                ['Last 7 days', 7],
                ['Last 30 days', 30],
                ['This month', 'month'],
                ['All', 'all'],
              ] as const).map(([label, v]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setQuickRange(v as number | 'month' | 'all')}
                  className="shrink-0 min-h-9 px-3.5 rounded-full border border-black/10 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <label className="text-[11px] font-bold text-slate-500">
                From
                <input
                  type="date"
                  value={histFrom}
                  onChange={(e) => {
                    setHistFrom(e.target.value);
                    setHistoryLimit(HISTORY_PAGE);
                  }}
                  className="mt-0.5 w-full px-2.5 py-2 rounded-xl border border-black/10 bg-white text-sm"
                />
              </label>
              <label className="text-[11px] font-bold text-slate-500">
                To
                <input
                  type="date"
                  value={histTo}
                  onChange={(e) => {
                    setHistTo(e.target.value);
                    setHistoryLimit(HISTORY_PAGE);
                  }}
                  className="mt-0.5 w-full px-2.5 py-2 rounded-xl border border-black/10 bg-white text-sm"
                />
              </label>
              <label className="col-span-2 sm:col-span-1 text-[11px] font-bold text-slate-500">
                Salesman
                <select
                  value={histSalesman}
                  onChange={(e) => {
                    setHistSalesman(e.target.value);
                    setHistoryLimit(HISTORY_PAGE);
                  }}
                  className="mt-0.5 w-full px-2.5 py-2 rounded-xl border border-black/10 bg-white text-sm"
                >
                  <option value="">All salesmen</option>
                  {historySalesmen.map((n) => (
                    <option key={n} value={n}>
                      {n} ({closedTrips.filter((t) => (t.salesman || '').trim() === n).length})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
              <span>
                Showing {shownHistory.length} of {filteredHistory.length}
                {historyFiltered ? ` (${closedTrips.length} completed trips in total)` : ' completed trips'}
              </span>
              {historyFiltered && (
                <button
                  type="button"
                  onClick={() => {
                    setHistFrom('');
                    setHistTo('');
                    setHistSalesman('');
                    setHistorySearch('');
                    setHistoryLimit(HISTORY_PAGE);
                  }}
                  className="font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="rounded-2xl border border-black/8 bg-white px-6 py-10 text-center text-sm text-slate-500">
              {historyFiltered ? 'No completed trips match these filters.' : 'Completed trips will appear here after day-end settlement.'}
            </div>
          ) : (
            <>
              {historyGroups.map((g) => (
                <section key={g.day} className="space-y-2">
                  <h2 className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.day}</h2>
                  {g.trips.map((t) => renderCard(t, 'history'))}
                </section>
              ))}
              {filteredHistory.length > shownHistory.length && (
                <button
                  type="button"
                  onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE)}
                  className="w-full min-h-11 rounded-full border border-black/10 bg-white text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-50"
                >
                  Show more ({filteredHistory.length - shownHistory.length} older)
                </button>
              )}
              {filteredHistory.length > shownHistory.length && (
                <button
                  type="button"
                  onClick={() => setHistoryLimit(filteredHistory.length)}
                  className="w-full min-h-10 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Show all {filteredHistory.length} trips
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* New trip */}
      {showNewTrip && (
        <NewTripSheet
          products={products}
          warehouses={warehouses}
          salesmen={salesmen}
          vehicles={vehicleOptions}
          routes={routeOptions}
          defaultWarehouseId={defaultWarehouse?.id || warehouses[0]?.id || ''}
          warehouseStock={warehouseStock}
          attachableBills={(d, sid, veh) =>
            attachableBillsForTrip({ date: d, salesmanId: sid || undefined, vehicle: veh }, bills, trips)
          }
          onSubmit={handleCreate}
          onClose={() => setShowNewTrip(false)}
        />
      )}

      {/* Bills on trip */}
      {managingBillsTrip && (
        <AssignBillsModal
          // Always the live trip, so ticks update as bills are attached or detached.
          trip={trips.find((x) => Number(x.id) === Number(managingBillsTrip.id)) || managingBillsTrip}
          allTrips={trips}
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

      {/* Delete confirmation */}
      {tripToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-delete-trip-title"
        >
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-base" id="modal-delete-trip-title">
              <Trash2 size={20} /> Delete trip?
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              <strong>Trip #{tripToDelete.id} ({tripToDelete.vehicle})</strong> from {fmtDay(tripToDelete.date)} will be removed and its
              bills unassigned. This can&apos;t be undone.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTripToDelete(null)}
                className="min-h-11 rounded-xl border border-black/10 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-trip"
                onClick={() => {
                  const { id, vehicle } = tripToDelete;
                  deleteTrip(id);
                  setTripToDelete(null);
                  showToast(`Trip #${id} (${vehicle}) deleted.`);
                }}
                className="min-h-11 rounded-xl bg-rose-600 text-white text-sm font-semibold cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
