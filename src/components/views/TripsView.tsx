import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, ChevronLeft, MessageCircle, Pencil, Phone, Plus, Receipt, Search, Share2, Trash2, Truck, X } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Trip } from '../../types';
import { billBalance, billNetTotal } from '../../utils/salesReturns';
import { attachableBillsForTrip, billBelongsToTrip, money, tripCashDue, whatsappLink } from '../../utils/billing';
import { invoiceNo } from '../../utils/beatReports';
import { todayISO, toLocalISODate } from '../../utils/dateLocal';
import { formatTripGroupDay } from '../../utils/tripLoads';
import { AssignBillsModal } from './AssignBillsModal';
import { TripEditScreen } from './TripEditScreen';
import { TripRecordReturnScreen } from './TripRecordReturnScreen';
import { NewTripSheet, NewTripPayload } from './trips/NewTripSheet';
import { useCreateTrip } from './trips/useCreateTrip';
import { useCloseTrip } from './trips/useCloseTrip';
import { useLoadValidator } from './trips/useLoadValidator';
import { TripListCard } from './trips/TripListCard';
import { SalesmanDuesPanel } from './trips/SalesmanDuesPanel';
import { useBeats } from '../../hooks/useBeats';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useLanguage } from '../../i18n/LanguageContext';

interface TripsViewProps {
  initialSubTab?: 'active' | 'history';
}

const HISTORY_PAGE = 30;
const MOBILE_HISTORY_PAGE = 10;

const fmtDay = (d?: string) => {
  if (!d) return 'Undated';
  const dt = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtShortDate = (d?: string) => {
  if (!d) return 'Undated';
  const dt = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTripGroupDay = (d?: string) => {
  const today = todayISO();
  const yestDt = new Date();
  yestDt.setDate(yestDt.getDate() - 1);
  return formatTripGroupDay(d, today, toLocalISODate(yestDt));
};

export const TripsView: React.FC<TripsViewProps> = ({ initialSubTab = 'active' }) => {
  const { activeBeats } = useBeats();
  const createTrip = useCreateTrip();
  const { closeTrip: closeTripAndPost } = useCloseTrip();
  const validateLoad = useLoadValidator();
  const {
    trips,
    bills,
    products,
    salesmen,
    customers,
    warehouses,
    defaultWarehouse,
    warehouseStock,
    addTrip,
    reopenTrip,
    toggleBillAssignment,
    autoAssignTripBills,
    saveReturnDraft,
    recordTripCashRecovery,
    writeOffTripCashShort,
    payments,
    updateTrip,
    deleteTrip,
    tripBreakdown,
    setTab,
    palette,
    fz,
    scale,
  } = useLedger();

  const isPhone = useIsMobile(767);
  const { t } = useLanguage();
  const pageSize = isPhone ? MOBILE_HISTORY_PAGE : HISTORY_PAGE;

  // Active is the default; closed trips live under History.
  const [tripsTab, setTripsTab] = useState<'active' | 'history'>(initialSubTab);
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyLimit, setHistoryLimit] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 767 ? MOBILE_HISTORY_PAGE : HISTORY_PAGE));
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histSalesman, setHistSalesman] = useState('');
  const [activeRange, setActiveRange] = useState<'7' | '30' | 'month' | 'all' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'list' | 'edit-trip' | 'record-return'>('list');
  const [tripForEdit, setTripForEdit] = useState<Trip | null>(null);
  const [editReopens, setEditReopens] = useState(false);
  const [tripForReturn, setTripForReturn] = useState<Trip | null>(null);
  const [managingBillsTrip, setManagingBillsTrip] = useState<Trip | null>(null);
  const [tripToReopen, setTripToReopen] = useState<Trip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [detailTripId, setDetailTripId] = useState<number | null>(null);
  const [closedSummary, setClosedSummary] = useState<{
    id: number;
    sales: number;
    cashIn: number;
    owed: number;
    salesman: string;
    phone?: string;
    route: string;
    date: string;
    vehicle: string;
  } | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  };

  const handleReopenTrip = (target: Trip | number) => {
    const tripId = typeof target === 'number' ? target : Number(target.id);
    reopenTrip(tripId);
    setTripsTab('active');
    setDetailTripId(null);
    setClosedSummary(null);
    showToast(`Trip #${tripId} reopened and moved back to Active trips.`);
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

  const resolveTripContacts = (tr: Trip) => {
    const matchedSm = salesmen.find(
      (s) =>
        (tr.salesmanId && s.id === tr.salesmanId) ||
        (tr.salesman && s.name.trim().toLowerCase() === tr.salesman.trim().toLowerCase()),
    );
    const driverName = (tr.driver || '').trim();
    const driverPhone = (tr.driverPhone || '').trim();
    const salesmanName = (tr.salesman || matchedSm?.name || '').trim();
    const salesmanPhone = (tr.salesmanPhone || matchedSm?.phone || '').trim();
    return {
      driverName,
      driverPhone,
      salesmanName,
      salesmanPhone,
      primaryPhone: driverPhone || salesmanPhone,
    };
  };

  const renderCard = (t: Trip, mode: 'active' | 'history') => {
    const rows = tripBreakdown(t).rows.map((r) => ({
      ...r,
      reason: t.shortageReasons?.[r.productId]?.reason,
      reasonNote: t.shortageReasons?.[r.productId]?.note,
      damagedQty: t.shortageReasons?.[r.productId]?.missing ? t.shortageReasons?.[r.productId]?.qty : undefined,
      missing: t.shortageReasons?.[r.productId]?.missing,
    }));
    const stats = tripBillStats(t);
    const contacts = resolveTripContacts(t);
    return (
      <TripListCard
        key={t.id}
        trip={t}
        mode={mode}
        rows={rows}
        billsCount={stats.count}
        soldValue={stats.value}
        godownLabel={godownLabel(t)}
        personLabel={contacts.driverName || contacts.salesmanName || undefined}
        driverPhone={contacts.driverPhone || undefined}
        salesmanPhone={contacts.salesmanPhone || undefined}
        onSettle={openSettle}
        onReopen={isPhone ? (tr) => setTripToReopen(tr) : handleReopenTrip}
        onEdit={openEdit}
        onBills={setManagingBillsTrip}
        onDelete={setTripToDelete}
        onOpenDetail={(tr) => setDetailTripId(tr.id)}
      />
    );
  };

  const handleCreate = (p: NewTripPayload): string | null => {
    const res = createTrip.create(p);
    if (res.ok === false) return res.error;
    setShowNewTrip(false);
    setTripsTab('active');
    showToast(`${p.vehicle} loaded with ${res.total} cs${res.godowns > 1 ? ` from ${res.godowns} godowns` : ''}.`);
    return null;
  };

  const detailTrip = useMemo(
    () => (detailTripId != null ? trips.find((x) => Number(x.id) === Number(detailTripId)) || null : null),
    [detailTripId, trips],
  );

  const closedViewData = useMemo(() => {
    if (!isPhone) return null;
    const sumBillsPaid = (tr: Trip) =>
      bills
        .filter((b) => b.status !== 'cancelled' && billBelongsToTrip(tr, b))
        .reduce((s, b) => s + (Number(b.amountPaid) || 0), 0);
    if (closedSummary) {
      const liveClosed = trips.find((x) => Number(x.id) === Number(closedSummary.id));
      const liveDue = liveClosed ? tripCashDue(liveClosed) : closedSummary.owed;
      const liveStats = liveClosed ? tripBillStats(liveClosed) : null;
      const liveCashIn = liveClosed
        ? Number(liveClosed.cashHandedIn ?? closedSummary.cashIn)
        : closedSummary.cashIn;
      return {
        id: closedSummary.id,
        trip: liveClosed || null,
        sales: liveStats ? liveStats.value : closedSummary.sales,
        cashIn: liveCashIn,
        owed: liveDue,
        salesman: closedSummary.salesman,
        phone: closedSummary.phone,
        route: closedSummary.route,
        date: closedSummary.date,
        vehicle: closedSummary.vehicle,
        fromHistory: false,
      };
    }
    if (detailTrip && detailTrip.status === 'closed') {
      const contacts = resolveTripContacts(detailTrip);
      const st = tripBillStats(detailTrip);
      return {
        id: detailTrip.id,
        trip: detailTrip,
        sales: st.value,
        cashIn: Number(detailTrip.cashHandedIn ?? sumBillsPaid(detailTrip)),
        owed: tripCashDue(detailTrip),
        salesman: contacts.driverName || contacts.salesmanName || '',
        phone: contacts.primaryPhone || undefined,
        route: detailTrip.route || '',
        date: fmtShortDate(detailTrip.date),
        vehicle: detailTrip.vehicle || '',
        fromHistory: true,
      };
    }
    return null;
  }, [isPhone, closedSummary, detailTrip, trips, bills, salesmen]);

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
        validateLoad={validateLoad}
        reopensOnSave={editReopens}
        onReopenTripNow={(id) => {
          reopenTrip(id);
          setEditReopens(false);
          setTripsTab('active');
          showToast(`Trip #${id} reopened and moved back to Active trips.`);
        }}
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
        onSaveReturn={(tripId, finalReturn, closeTrip, shortageReasons, cashHandedIn, cashShortBooked, tripExpense) => {
          // A draft is kept apart from the recorded returns and never closes the trip.
          if (closeTrip) {
            const refused = closeTripAndPost({ tripId, returned: finalReturn, shortageReasons, cashHandedIn, cashShortBooked, tripExpense });
            if (refused) return refused; // stay on the screen and show why
          } else saveReturnDraft(tripId, finalReturn, cashHandedIn);
          setViewMode('list');
          setTripForReturn(null);
          if (closeTrip) {
            setDetailTripId(null);
            setClosedSummary(null);
            setRecoveryOpen(false);
            setRecoveryInput('');
            setTripsTab('history');
          }
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
  const qDigits = q.replace(/\D/g, '');
  const historySalesmen = Array.from(new Set(closedTrips.map((t) => (t.salesman || '').trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );
  const filteredHistory = closedTrips.filter((t) => {
    const day = (t.date || '').slice(0, 10);
    if (histFrom && (!day || day < histFrom)) return false;
    if (histTo && (!day || day > histTo)) return false;
    if (histSalesman && (t.salesman || '').trim() !== histSalesman) return false;
    if (!q) return true;
    const contacts = resolveTripContacts(t);
    const phoneHaystack = `${contacts.driverPhone} ${contacts.salesmanPhone}`.toLowerCase();
    const phoneDigits = phoneHaystack.replace(/\D/g, '');
    return (
      (t.vehicle || '').toLowerCase().includes(q) ||
      String(t.id).includes(q) ||
      (t.date || '').includes(q) ||
      (t.route || '').toLowerCase().includes(q) ||
      (t.salesman || '').toLowerCase().includes(q) ||
      (t.driver || '').toLowerCase().includes(q) ||
      phoneHaystack.includes(q) ||
      (qDigits.length >= 3 && phoneDigits.includes(qDigits))
    );
  });
  const historyFiltered = Boolean(q || histFrom || histTo || histSalesman);
  const setQuickRange = (days: number | 'month' | 'all', key?: '7' | '30' | 'month' | 'all') => {
    setHistoryLimit(pageSize);
    setActiveRange(key ?? null);
    if (days === 'all') {
      setHistFrom('');
      setHistTo('');
      return;
    }
    const now = new Date();
    if (days === 'month') {
      setHistFrom(toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
    } else {
      const start = new Date(now);
      start.setDate(start.getDate() - (days - 1));
      setHistFrom(toLocalISODate(start));
    }
    setHistTo(todayISO());
  };
  const clearHistoryFilters = () => {
    setHistFrom('');
    setHistTo('');
    setHistSalesman('');
    setHistorySearch('');
    setActiveRange(null);
    setHistoryLimit(pageSize);
  };
  const shownHistory = filteredHistory.slice(0, historyLimit);
  const historyGroups: { day: string; trips: Trip[] }[] = [];
  for (const t of shownHistory) {
    const day = isPhone ? fmtTripGroupDay(t.date) : fmtDay(t.date);
    const last = historyGroups[historyGroups.length - 1];
    if (last && last.day === day) last.trips.push(t);
    else historyGroups.push({ day, trips: [t] });
  }

  if (isPhone && closedViewData) {
    const shareText = [
      `Trip #${closedViewData.id} (${closedViewData.vehicle || '-'})`,
      closedViewData.route ? `Route: ${closedViewData.route}` : '',
      closedViewData.salesman ? `Salesman: ${closedViewData.salesman}` : '',
      `Date: ${closedViewData.date}`,
      `Sales: ₹${money(closedViewData.sales)}`,
      `Cash in: ₹${money(closedViewData.cashIn)}`,
      closedViewData.owed > 0 ? `Owed: ₹${money(closedViewData.owed)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return (
      <div id="view-trips" className="mw-workspace w-full min-w-0 pb-8 space-y-4">
        <div className="hh-sales-top">
          <div className="hh-sales-top__row">
            <div className="flex items-center gap-1 min-w-0">
              {closedViewData.fromHistory && (
                <button
                  type="button"
                  onClick={() => setDetailTripId(null)}
                  className="hh-sales-top__iconbtn"
                  aria-label={t('common.back')}
                >
                  <ChevronLeft size={24} strokeWidth={2.2} />
                </button>
              )}
              <h1 className="hh-sales-top__title truncate">{t('trips.tripClosedHeader', { id: closedViewData.id })}</h1>
            </div>
            <span className="hh-sales-top__pill shrink-0">{t('trips.closedTag')}</span>
          </div>
        </div>

        <div className="rt-card space-y-4 text-center py-6">
          <div className="mx-auto rt-success-check">
            <Check size={28} strokeWidth={2.6} />
          </div>
          <div>
            <h2 className="text-[22px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
              {t('trips.tripCompleted')}
            </h2>
            <p className="text-[13px] font-medium mt-1 break-words" style={{ color: 'var(--text-2)' }}>
              {[closedViewData.salesman, closedViewData.route, closedViewData.date].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="rt-three pt-2 border-t text-left" style={{ borderColor: 'var(--divider)' }}>
            <div className="rt-three__col">
              <span className="rt-three__label">{t('trips.sales')}</span>
              <span className="rt-three__val">₹{money(closedViewData.sales)}</span>
            </div>
            <div className="rt-three__col">
              <span className="rt-three__label">{t('trips.cashIn')}</span>
              <span className="rt-three__val" style={{ color: 'var(--paid)' }}>₹{money(closedViewData.cashIn)}</span>
            </div>
            <div className="rt-three__col">
              <span className="rt-three__label">{t('trips.owed')}</span>
              <span className="rt-three__val" style={{ color: closedViewData.owed > 0 ? 'var(--due)' : 'var(--text)' }}>
                ₹{money(closedViewData.owed)}
              </span>
            </div>
          </div>
        </div>

        {closedViewData.owed > 0 && (
          <div className="hh-hist-card hh-hist-card--due space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13.5px] font-extrabold break-words" style={{ color: 'var(--text)' }}>
                  {t('trips.salesmanOwes', {
                    name: closedViewData.salesman || t('trips.salesman'),
                    amt: money(closedViewData.owed),
                  })}
                </div>
                <div className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>
                  {t('trips.cashShortfall')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRecoveryInput(String(closedViewData.owed));
                  setRecoveryOpen((v) => !v);
                }}
                className="text-[13px] font-bold bg-transparent border-0 cursor-pointer shrink-0"
                style={{ color: 'var(--primary)', minHeight: '44px' }}
              >
                {t('trips.recordRecovery')}
              </button>
            </div>
            {recoveryOpen && (
              <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'var(--divider)' }}>
                <input
                  type="number"
                  inputMode="decimal"
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value)}
                  className="flex-1 min-h-[44px] px-3 rounded-full border text-sm font-bold"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const amt = Number(recoveryInput);
                    if (amt > 0 && amt <= closedViewData.owed + 0.005) {
                      if (recordTripCashRecovery(closedViewData.id, amt)) {
                        setRecoveryOpen(false);
                        showToast(`₹${money(amt)} recovered.`);
                      }
                    }
                  }}
                  className="rt-btn shrink-0"
                >
                  {t('common.save')}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2.5">
          <a
            href={whatsappLink(closedViewData.phone || '', shareText)}
            target="_blank"
            rel="noopener noreferrer"
            className="rt-btn-outline rt-btn-outline--primary w-full no-underline"
          >
            <Share2 size={16} /> {t('trips.shareTripReport')}
          </a>
          <button
            type="button"
            onClick={() => {
              handleReopenTrip(closedViewData.id);
              setClosedSummary(null);
              setDetailTripId(null);
            }}
            className="rt-btn-outline rt-btn-outline--primary w-full"
          >
            {t('trips.reopenTrip')}
          </button>
          <button
            type="button"
            onClick={() => {
              setClosedSummary(null);
              setDetailTripId(null);
              setTripsTab('history');
            }}
            className="rt-link-btn"
          >
            {t('trips.backToTrips')}
          </button>
        </div>

        {closedViewData.trip && (
          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              type="button"
              onClick={() => setManagingBillsTrip(closedViewData.trip)}
              className="inline-flex items-center gap-1.5 text-[13px] font-bold bg-transparent border-0 cursor-pointer"
              style={{ color: 'var(--primary)', minHeight: '44px' }}
            >
              <Receipt size={14} /> {t('trips.billsOnTrip')}
            </button>
            <button
              type="button"
              onClick={() => openEdit(closedViewData.trip!)}
              className="inline-flex items-center gap-1.5 text-[13px] font-bold bg-transparent border-0 cursor-pointer"
              style={{ color: 'var(--primary)', minHeight: '44px' }}
            >
              <Pencil size={14} /> {t('common.edit')}
            </button>
            <button
              type="button"
              onClick={() => setTripToDelete(closedViewData.trip)}
              className="inline-flex items-center gap-1.5 text-[13px] font-bold bg-transparent border-0 cursor-pointer"
              style={{ color: 'var(--due)', minHeight: '44px' }}
            >
              <Trash2 size={14} /> {t('common.delete')}
            </button>
          </div>
        )}

        {managingBillsTrip && (
          <AssignBillsModal
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
            onReopenTrip={handleReopenTrip}
          />
        )}

        {tripToDelete && (
          <div
            className="rt-bsheet-scrim"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-delete-trip-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setTripToDelete(null);
            }}
          >
            <div className="rt-bsheet rt-bsheet--white space-y-3">
              <div className="hh-grab" />
              <div className="text-[17px] font-extrabold leading-tight" style={{ color: 'var(--due)' }} id="modal-delete-trip-title">
                Delete trip #{tripToDelete.id}?
              </div>
              <p className="text-[13.5px] leading-relaxed m-0" style={{ color: 'var(--text-2)' }}>
                This removes the trip record. Bills made on the trip stay in Sales history.
              </p>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setTripToDelete(null)}
                  className="rt-btn-outline rt-btn-outline--primary"
                >
                  Keep
                </button>
                <button
                  type="button"
                  id="btn-confirm-delete-trip"
                  onClick={() => {
                    const { id, vehicle } = tripToDelete;
                    deleteTrip(id);
                    setTripToDelete(null);
                    setClosedSummary(null);
                    setDetailTripId(null);
                    showToast(`Trip #${id} (${vehicle}) deleted.`);
                  }}
                  className="rt-btn rt-btn--due"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isPhone && detailTrip) {
    const bdRows = tripBreakdown(detailTrip).rows;
    const loadedTotal = bdRows.reduce((s, r) => s + r.loaded, 0);
    const soldTotal = bdRows.reduce((s, r) => s + r.sold, 0);
    const leftTotal = bdRows.reduce((s, r) => s + Math.max(0, r.loaded - r.sold), 0);
    const pct = loadedTotal > 0 ? Math.min(100, Math.round((soldTotal / loadedTotal) * 100)) : 0;
    const tripBills = bills
      .filter((b) => b.status !== 'cancelled' && billBelongsToTrip(detailTrip, b))
      .sort((a, b) => Number(b.id) - Number(a.id));
    const cashCollected = tripBills.reduce((s, b) => s + (Number(b.amountPaid) || 0), 0);
    const contacts = resolveTripContacts(detailTrip);
    const salesmanDisplay = contacts.driverName || contacts.salesmanName || '';
    const isDetailOpen = detailTrip.status !== 'closed';

    return (
      <div id="view-trips" className="mw-workspace w-full min-w-0 pb-8 space-y-3">
        <div className="hh-sales-top">
          <div className="hh-sales-top__row">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={() => setDetailTripId(null)}
                className="hh-sales-top__iconbtn"
                aria-label={t('common.back')}
              >
                <ChevronLeft size={24} strokeWidth={2.2} />
              </button>
              <h1 className="hh-sales-top__title truncate">Trip #{detailTrip.id}</h1>
            </div>
            <span className={`shrink-0 ${isDetailOpen ? 'rt-trip-pill-onroute' : 'rt-trip-pill-completed'}`}>
              {isDetailOpen ? 'On route' : 'Completed'}
            </span>
          </div>
          <p className="rt-stp m-0 pl-2 break-words" style={{ color: 'var(--surface)' }}>
            {[detailTrip.route || godownLabel(detailTrip), salesmanDisplay, detailTrip.vehicle].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="rt-card space-y-3">
          <div>
            <div className="text-[12px] font-semibold" style={{ color: 'var(--text-2)' }}>
              {t('trips.cashCollectedSoFar')}
            </div>
            <div className="text-[28px] font-extrabold tracking-tight tabular-nums mt-0.5" style={{ color: 'var(--text)' }}>
              ₹{money(cashCollected)}
            </div>
          </div>
          <div className="border-t pt-2.5" style={{ borderColor: 'var(--divider)' }}>
            <div className="rt-three">
              <div className="rt-three__col">
                <span className="rt-three__label">{t('trips.loaded')}</span>
                <span className="rt-three__val">{loadedTotal}</span>
              </div>
              <div className="rt-three__col">
                <span className="rt-three__label">{t('trips.sold')}</span>
                <span className="rt-three__val">{soldTotal}</span>
              </div>
              <div className="rt-three__col">
                <span className="rt-three__label">{t('trips.left')}</span>
                <span className="rt-three__val">{leftTotal}</span>
              </div>
            </div>
          </div>
          <div className="rt-meter" aria-hidden="true">
            <div className="rt-meter__fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="rt-card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold m-0" style={{ color: 'var(--text)' }}>
              {t('trips.billsOnTrip')}
            </h2>
            <button
              type="button"
              onClick={() => setManagingBillsTrip(detailTrip)}
              className="text-[12.5px] font-bold bg-transparent border-0 cursor-pointer"
              style={{ color: 'var(--primary)', minHeight: '44px' }}
            >
              {t('trips.seeAll')}
            </button>
          </div>
          {tripBills.length === 0 ? (
            <p className="text-[13px] py-2 m-0" style={{ color: 'var(--text-2)' }}>
              {t('trips.noBillsYet')}
            </p>
          ) : (
            <div>
              {tripBills.slice(0, 6).map((b) => {
                const net = billNetTotal(b);
                const bal = billBalance(b);
                const paid = Number(b.amountPaid) || 0;
                const cases = (b.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
                const statusTag =
                  bal <= 0.01 ? 'rt-tag--paid' : paid > 0 ? 'rt-tag--soon' : 'rt-tag--due';
                const statusLabel =
                  bal <= 0.01 ? t('status.paid') : paid > 0 ? t('status.partial') : t('status.due');
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setManagingBillsTrip(detailTrip)}
                    className="rt-rowi"
                  >
                    <span className="rt-ico rt-ico--muted">
                      <Receipt size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold break-words" style={{ color: 'var(--text)' }}>
                        {b.retailer}
                      </span>
                      <span className="block text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                        {[invoiceNo(b), t('trips.casesCount', { n: cases }), b.phone].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="rt-amt space-y-0.5">
                      <span className="block text-[13.5px] font-bold" style={{ color: 'var(--text)' }}>
                        ₹{money(net)}
                      </span>
                      <span className={`rt-tag ${statusTag}`}>{statusLabel}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem('mrwater_prefill_trip_id', String(detailTrip.id));
              } catch {
                // ignore storage quota / private mode
              }
              setDetailTripId(null);
              setTab('billing');
            }}
            className="rt-btn-outline rt-btn-outline--primary"
          >
            {t('trips.recordSale')}
          </button>
          {isDetailOpen ? (
            <button type="button" onClick={() => openSettle(detailTrip)} className="rt-btn">
              {t('trips.settleTrip')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                handleReopenTrip(detailTrip);
                setDetailTripId(null);
              }}
              className="rt-btn"
            >
              {t('trips.reopenTrip')}
            </button>
          )}
        </div>

        {(contacts.driverName || contacts.driverPhone || contacts.salesmanName || contacts.salesmanPhone) && (
          <div className="rt-card space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[14px] font-bold m-0" style={{ color: 'var(--text)' }}>
                Crew &amp; Phone
              </h2>
              <button
                type="button"
                onClick={() => openEdit(detailTrip)}
                className="text-[12px] font-bold bg-transparent border-0 cursor-pointer"
                style={{ color: 'var(--primary)' }}
              >
                {t('common.edit')}
              </button>
            </div>
            {(contacts.driverName || contacts.driverPhone) && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t" style={{ borderColor: 'var(--divider)' }}>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-2)' }}>{t('trips.driver')}</div>
                  <div className="text-[13.5px] font-bold break-words" style={{ color: 'var(--text)' }}>
                    {contacts.driverName || '—'}
                    {contacts.driverPhone ? ` · ${contacts.driverPhone}` : ''}
                  </div>
                </div>
                {contacts.driverPhone && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={`tel:${contacts.driverPhone.replace(/\s+/g, '')}`}
                      aria-label={`Call driver ${contacts.driverPhone}`}
                      className="size-10 rounded-full border flex items-center justify-center no-underline"
                      style={{ borderColor: 'var(--border)', color: 'var(--primary)' }}
                    >
                      <Phone size={15} />
                    </a>
                    <a
                      href={whatsappLink(contacts.driverPhone, `Trip #${detailTrip.id} (${detailTrip.vehicle || 'Van'}) · ${detailTrip.date}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`WhatsApp driver ${contacts.driverPhone}`}
                      className="size-10 rounded-full border flex items-center justify-center no-underline"
                      style={{ borderColor: 'var(--border)', color: 'var(--paid)' }}
                    >
                      <MessageCircle size={15} />
                    </a>
                  </div>
                )}
              </div>
            )}
            {(contacts.salesmanName || contacts.salesmanPhone) && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t" style={{ borderColor: 'var(--divider)' }}>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-2)' }}>{t('trips.salesman')}</div>
                  <div className="text-[13.5px] font-bold break-words" style={{ color: 'var(--text)' }}>
                    {contacts.salesmanName || '—'}
                    {contacts.salesmanPhone ? ` · ${contacts.salesmanPhone}` : ''}
                  </div>
                </div>
                {contacts.salesmanPhone && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={`tel:${contacts.salesmanPhone.replace(/\s+/g, '')}`}
                      aria-label={`Call salesman ${contacts.salesmanPhone}`}
                      className="size-10 rounded-full border flex items-center justify-center no-underline"
                      style={{ borderColor: 'var(--border)', color: 'var(--primary)' }}
                    >
                      <Phone size={15} />
                    </a>
                    <a
                      href={whatsappLink(contacts.salesmanPhone, `Trip #${detailTrip.id} (${detailTrip.vehicle || 'Van'}) · ${detailTrip.date}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`WhatsApp salesman ${contacts.salesmanPhone}`}
                      className="size-10 rounded-full border flex items-center justify-center no-underline"
                      style={{ borderColor: 'var(--border)', color: 'var(--paid)' }}
                    >
                      <MessageCircle size={15} />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-4 pt-1">
          <button
            type="button"
            onClick={() => openEdit(detailTrip)}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold bg-transparent border-0 cursor-pointer"
            style={{ color: 'var(--primary)', minHeight: '44px' }}
          >
            <Pencil size={14} /> {t('trips.editLoad')}
          </button>
          <button
            type="button"
            onClick={() => setTripToDelete(detailTrip)}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold bg-transparent border-0 cursor-pointer"
            style={{ color: 'var(--due)', minHeight: '44px' }}
          >
            <Trash2 size={14} /> {t('common.delete')}
          </button>
        </div>

        {managingBillsTrip && (
          <AssignBillsModal
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
            onReopenTrip={handleReopenTrip}
          />
        )}

        {tripToDelete && (
          <div
            className="rt-bsheet-scrim"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-delete-trip-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setTripToDelete(null);
            }}
          >
            <div className="rt-bsheet rt-bsheet--white space-y-3">
              <div className="hh-grab" />
              <div className="text-[17px] font-extrabold leading-tight" style={{ color: 'var(--due)' }} id="modal-delete-trip-title">
                Delete trip #{tripToDelete.id}?
              </div>
              <p className="text-[13.5px] leading-relaxed m-0" style={{ color: 'var(--text-2)' }}>
                This removes the trip record. Bills made on the trip stay in Sales history.
              </p>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setTripToDelete(null)}
                  className="rt-btn-outline rt-btn-outline--primary"
                >
                  Keep
                </button>
                <button
                  type="button"
                  id="btn-confirm-delete-trip"
                  onClick={() => {
                    const { id, vehicle } = tripToDelete;
                    deleteTrip(id);
                    setTripToDelete(null);
                    setDetailTripId(null);
                    showToast(`Trip #${id} (${vehicle}) deleted.`);
                  }}
                  className="rt-btn rt-btn--due"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="view-trips" className="mw-workspace w-full min-w-0 max-w-none mx-auto space-y-4 pb-24">
      {/* Header */}
      {isPhone ? (
        <div className="hh-sales-top hh-sales-top--flush">
          <div className="hh-sales-top__row">
            <h1 className="hh-sales-top__title">Trips</h1>
            <button
              type="button"
              id="btn-dispatch-trip"
              onClick={() => setShowNewTrip(true)}
              className="hh-sales-top__iconbtn"
              aria-label={t('trips.newTrip')}
            >
              <Plus size={22} strokeWidth={2.4} />
            </button>
          </div>
          <div className="rt-utabs" role="tablist" aria-label="Trip lists">
            <button
              type="button"
              role="tab"
              aria-selected={tripsTab === 'active'}
              id="tab-active-trips"
              onClick={() => setTripsTab('active')}
              className="rt-utab"
            >
              Active {activeTrips.length}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tripsTab === 'history'}
              id="tab-trip-history"
              onClick={() => setTripsTab('history')}
              className="rt-utab"
            >
              History {closedTrips.length}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Trips</h1>
          <button
            type="button"
            id="btn-dispatch-trip"
            onClick={() => setShowNewTrip(true)}
            className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-semibold shadow-sm cursor-pointer active:scale-[0.98]"
          >
            <Plus size={17} /> New trip
          </button>
        </div>
      )}

      {toast && !isPhone && (
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

      {toast && isPhone && (
        <div role="status" className="rt-toast-float">
          <span className="flex items-center gap-2.5 min-w-0">
            <Check size={17} strokeWidth={2.8} className="shrink-0" style={{ color: '#22c55e' }} />
            <span className="break-words">{toast}</span>
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 text-white/70 hover:text-white bg-transparent border-0 cursor-pointer shrink-0"
            style={{ minWidth: '32px', minHeight: '32px' }}
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Active / History (desktop pill switcher; mobile uses header underline tabs) */}
      {!isPhone && (
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
      )}

      {/* ACTIVE */}
      {tripsTab === 'active' && (
        <div className="space-y-3">
          {activeTrips.length === 0 ? (
            isPhone ? (
              <div className="rt-card px-5 py-10 text-center space-y-2">
                <div className="mx-auto rt-ico">
                  <Truck size={18} />
                </div>
                <h2 className="text-base font-bold m-0" style={{ color: 'var(--text)' }}>{t('trips.noActiveTrips')}</h2>
                <p className="text-[13px] m-0" style={{ color: 'var(--text-2)' }}>{t('trips.noActiveTripsSub')}</p>
                <div className="pt-2">
                  <button type="button" onClick={() => setShowNewTrip(true)} className="rt-btn">
                    <Plus size={16} /> {t('trips.newTrip')}
                  </button>
                </div>
              </div>
            ) : (
              <div data-card-tone="sales" className="rounded-2xl border shadow-xs px-6 py-12 text-center">
                <div className="mx-auto hh-icon-badge hh-icon-badge--blue mb-3">
                  <Truck size={22} />
                </div>
                <h2 className="text-base font-bold text-slate-900">No active trips</h2>
                <p className="text-sm text-slate-500 mt-1">Load a vehicle to start a trip.</p>
                <button
                  type="button"
                  onClick={() => setShowNewTrip(true)}
                  className="mt-4 inline-flex items-center gap-1.5 min-h-11 px-5 rounded-full bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer"
                >
                  <Plus size={16} /> New trip
                </button>
              </div>
            )
          ) : (
            activeTrips.map((tr) => renderCard(tr, 'active'))
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
          {isPhone ? (
            <>
              <div className="rt-card space-y-2.5">
                <div className="rt-search-bar" style={{ borderRadius: '18px' }}>
                  <Search size={16} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                  <input
                    type="search"
                    value={historySearch}
                    onChange={(e) => {
                      setHistorySearch(e.target.value);
                      setHistoryLimit(pageSize);
                    }}
                    placeholder="Search vehicle, beat, date, trip no."
                    className="text-[13px]"
                  />
                  {historySearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistorySearch('');
                        setHistoryLimit(pageSize);
                      }}
                      aria-label="Clear"
                      className="p-1 bg-transparent border-0 cursor-pointer"
                      style={{ color: 'var(--text-2)' }}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {([
                    ['Last 7 days', 7, '7'],
                    ['Last 30 days', 30, '30'],
                    ['This month', 'month', 'month'],
                    ['All', 'all', 'all'],
                  ] as const).map(([label, v, key]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={activeRange === key}
                      onClick={() => setQuickRange(v as number | 'month' | 'all', key)}
                      className="rt-chip shrink-0"
                      style={{ minHeight: '38px' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">From</span>
                    <input
                      type="date"
                      value={histFrom}
                      onChange={(e) => {
                        setHistFrom(e.target.value);
                        setActiveRange(null);
                        setHistoryLimit(pageSize);
                      }}
                      className="rt-in__control"
                    />
                  </label>
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">To</span>
                    <input
                      type="date"
                      value={histTo}
                      onChange={(e) => {
                        setHistTo(e.target.value);
                        setActiveRange(null);
                        setHistoryLimit(pageSize);
                      }}
                      className="rt-in__control"
                    />
                  </label>
                </div>

                <label className="rt-in">
                  <span className="rt-in__label uppercase">Salesman</span>
                  <div className="rt-in__select-wrap">
                    <select
                      value={histSalesman}
                      onChange={(e) => {
                        setHistSalesman(e.target.value);
                        setHistoryLimit(pageSize);
                      }}
                      className="rt-in__control"
                    >
                      <option value="">All salesmen</option>
                      {historySalesmen.map((n) => (
                        <option key={n} value={n}>
                          {n} ({closedTrips.filter((t) => (t.salesman || '').trim() === n).length})
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="rt-in__select-chev" aria-hidden="true" />
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 px-1 text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>
                <span>
                  Showing {shownHistory.length} of {filteredHistory.length}
                  {historyFiltered ? ` (${closedTrips.length} completed trips in total)` : ' completed trips'}
                </span>
                {historyFiltered && (
                  <button
                    type="button"
                    onClick={clearHistoryFilters}
                    className="text-[12.5px] font-bold bg-transparent border-0 cursor-pointer shrink-0"
                    style={{ color: 'var(--primary)', minHeight: '36px' }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={historySearch}
                  onChange={(e) => {
                    setHistorySearch(e.target.value);
                    setHistoryLimit(HISTORY_PAGE);
                  }}
                  placeholder="Search vehicle, beat, person, phone, trip #"
                  className="w-full pl-10 pr-3 py-3 rounded-full border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
                />
              </div>
              <div data-card-tone="neutral" className="rounded-2xl border shadow-xs p-3 space-y-2.5">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
                  {([
                    ['Last 7 days', 7, '7'],
                    ['Last 30 days', 30, '30'],
                    ['This month', 'month', 'month'],
                    ['All', 'all', 'all'],
                  ] as const).map(([label, v, key]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setQuickRange(v as number | 'month' | 'all', key)}
                      className={`shrink-0 min-h-9 px-3.5 rounded-full border text-xs font-bold cursor-pointer ${
                        activeRange === key
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-black/10 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
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
                        setActiveRange(null);
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
                        setActiveRange(null);
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
                      onClick={clearHistoryFilters}
                      className="font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {filteredHistory.length === 0 ? (
            isPhone ? (
              historyFiltered ? (
                <div className="rt-card px-5 py-8 text-center space-y-3">
                  <div className="mx-auto rt-trip-icon-badge" style={{ width: 48, height: 48 }}>
                    <Truck size={22} />
                  </div>
                  <p className="text-[14.5px] font-bold m-0" style={{ color: 'var(--text)' }}>
                    No completed trips match these filters.
                  </p>
                  <button
                    type="button"
                    onClick={clearHistoryFilters}
                    className="rt-btn-outline rt-btn-outline--primary w-full"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="rt-card px-5 py-7 text-center">
                  <p className="text-[14px] font-bold m-0" style={{ color: 'var(--text)' }}>
                    Completed trips will appear here after day-end settlement.
                  </p>
                </div>
              )
            ) : (
              <div data-card-tone="neutral" className="rounded-2xl border shadow-xs px-6 py-10 text-center text-sm text-slate-500">
                {historyFiltered ? 'No completed trips match these filters.' : 'Completed trips will appear here after day-end settlement.'}
              </div>
            )
          ) : (
            <>
              {historyGroups.map((g) => (
                <section key={g.day} className="space-y-2">
                  <h2 className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>{g.day}</h2>
                  {g.trips.map((t) => renderCard(t, 'history'))}
                </section>
              ))}
              {filteredHistory.length > shownHistory.length && (
                <button
                  type="button"
                  onClick={() => setHistoryLimit((n) => n + pageSize)}
                  className={isPhone ? 'rt-btn-outline rt-btn-outline--primary w-full font-bold' : 'w-full min-h-11 rounded-full border border-black/10 bg-white text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-50'}
                >
                  Show more ({filteredHistory.length - shownHistory.length} older)
                </button>
              )}
              {!isPhone && filteredHistory.length > shownHistory.length && (
                <button
                  type="button"
                  onClick={() => setHistoryLimit(filteredHistory.length)}
                  className="w-full min-h-10 text-xs font-bold bg-transparent border-0 cursor-pointer"
                  style={{ color: 'var(--text-2)' }}
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
          attachableBills={createTrip.attachable}
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
          onReopenTrip={handleReopenTrip}
        />
      )}

      {/* Reopen confirmation (mobile bottom sheet) */}
      {tripToReopen && isPhone && (
        <div
          className="rt-bsheet-scrim"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-reopen-trip-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTripToReopen(null);
          }}
        >
          <div className="rt-bsheet rt-bsheet--white space-y-3">
            <div className="hh-grab" />
            <div className="text-[17px] font-extrabold leading-tight" style={{ color: 'var(--text)' }} id="modal-reopen-trip-title">
              Reopen trip #{tripToReopen.id}?
            </div>
            <p className="text-[13.5px] leading-relaxed m-0" style={{ color: 'var(--text-2)' }}>
              Reopen trip back to Active to edit load, return, or bill stock. Settle it again when you are done.
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setTripToReopen(null)}
                className="rt-btn-outline rt-btn-outline--primary"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-reopen-trip"
                onClick={() => {
                  const target = tripToReopen;
                  setTripToReopen(null);
                  handleReopenTrip(target);
                }}
                className="rt-btn"
              >
                Reopen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {tripToDelete && (
        isPhone ? (
          <div
            className="rt-bsheet-scrim"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-delete-trip-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setTripToDelete(null);
            }}
          >
            <div className="rt-bsheet rt-bsheet--white space-y-3">
              <div className="hh-grab" />
              <div className="text-[17px] font-extrabold leading-tight" style={{ color: 'var(--due)' }} id="modal-delete-trip-title">
                Delete trip #{tripToDelete.id}?
              </div>
              <p className="text-[13.5px] leading-relaxed m-0" style={{ color: 'var(--text-2)' }}>
                This removes the trip record. Bills made on the trip stay in Sales history.
              </p>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setTripToDelete(null)}
                  className="rt-btn-outline rt-btn-outline--primary"
                >
                  Keep
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
                  className="rt-btn rt-btn--due"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ) : (
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
        )
      )}
    </div>
  );
};

export default TripsView;
