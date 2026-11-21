import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Check,
  Zap,
  ShoppingBag,
  RotateCcw,
  ChevronLeft,
  Share2,
  Plus,
} from 'lucide-react';
import { Bill, Product, Trip } from '../../types';
import { money, attachableBillsForTrip, whatsappLink } from '../../utils/billing';
import { billBalance, billNetTotal } from '../../utils/salesReturns';
import { invoiceNo } from '../../utils/beatReports';
import { useIsMobile } from '../../hooks/useIsMobile';

const fmtBillDayMonth = (d?: string) => {
  if (!d) return '—';
  const dt = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

interface AssignBillsModalProps {
  trip: Trip | null;
  isOpen: boolean;
  onClose: () => void;
  bills: Bill[];
  /** All trips, to show which bills already sit on another trip. */
  allTrips?: Trip[];
  products: Product[];
  onToggleBill: (tripId: number, billId: number) => string | null | void;
  onAutoAssignDate: (tripId: number) => void;
  onReopenTrip?: (tripId: number) => void;
  palette: any;
  fz: (size: number, extra?: React.CSSProperties) => React.CSSProperties;
  scale: number;
}

export const AssignBillsModal: React.FC<AssignBillsModalProps> = ({
  trip,
  isOpen,
  onClose,
  bills,
  allTrips = [],
  products,
  onToggleBill,
  onAutoAssignDate,
  onReopenTrip,
  palette,
  fz,
  scale,
}) => {
  const isPhone = useIsMobile(767);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'date' | 'unassigned' | 'all'>('date');
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [billActionError, setBillActionError] = useState<string | null>(null);

  // Filter bills based on current selection & search
  const filteredBills = useMemo(() => {
    if (!trip) return [];
    return bills.filter((b) => {
      // Search term filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const retailerMatch = b.retailer.toLowerCase().includes(term);
        const phoneMatch = b.phone?.toLowerCase().includes(term);
        const idMatch = String(b.id).includes(term);
        if (!retailerMatch && !phoneMatch && !idMatch) return false;
      }

      if (filterMode === 'date') {
        return b.date === trip.date;
      }
      if (filterMode === 'unassigned') {
        // Not on this trip AND not on any other trip either.
        if (trip.billIds.includes(b.id)) return false;
        if (b.tripId != null && Number(b.tripId) > 0 && Number(b.tripId) !== Number(trip.id)) return false;
        return !allTrips.some(
          (x) => Number(x.id) !== Number(trip.id) && (x.billIds || []).map(Number).includes(Number(b.id)),
        );
      }
      return true;
    });
  }, [bills, trip, allTrips, searchTerm, filterMode]);

  // Trip (other than this one) that already holds a bill, if any.
  const otherTripOf = (b: Bill): number | null => {
    if (!trip) return null;
    if (b.tripId != null && Number(b.tripId) > 0 && Number(b.tripId) !== Number(trip.id)) return Number(b.tripId);
    const t = allTrips.find(
      (x) => Number(x.id) !== Number(trip.id) && (x.billIds || []).map(Number).includes(Number(b.id)),
    );
    return t ? Number(t.id) : null;
  };

  // Bills that auto-assign would pick up: same date, same salesman / van, not on another trip.
  const unassignedDateBillsCount = useMemo(() => {
    if (!trip) return 0;
    return attachableBillsForTrip(trip, bills, allTrips).filter((b) => !trip.billIds.includes(b.id)).length;
  }, [bills, trip, allTrips]);

  // Calculate summary of assigned bills
  const assignedBills = useMemo(() => {
    if (!trip) return [];
    const ids = new Set((trip.billIds || []).map(Number));
    return bills
      .filter((b) => b.status !== 'cancelled' && (ids.has(Number(b.id)) || Number(b.tripId) === Number(trip.id)))
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [trip, bills]);

  const totalAssignedCases = assignedBills.reduce(
    (sum, b) => sum + b.items.reduce((s, it) => s + it.qty, 0),
    0
  );
  const totalAssignedValue = assignedBills.reduce((sum, b) => sum + b.total, 0);

  const selectedBill = useMemo(
    () => (selectedBillId != null ? bills.find((b) => Number(b.id) === Number(selectedBillId)) || null : null),
    [bills, selectedBillId],
  );

  const inputStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    color: palette.ink,
    borderColor: palette.line,
    borderWidth: 2,
    ...fz(13.5),
  };

  if (!isOpen || !trip) return null;

  if (isPhone) {
    const selectedBillNet = selectedBill ? billNetTotal(selectedBill) : 0;
    const selectedBillBal = selectedBill ? billBalance(selectedBill) : 0;
    const selectedBillPaid = selectedBill ? Number(selectedBill.amountPaid) || 0 : 0;
    const selectedBillCases = selectedBill ? (selectedBill.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0) : 0;
    const shareMsg = selectedBill
      ? [
          `${invoiceNo(selectedBill)} · ${selectedBill.retailer}`,
          `Date: ${fmtBillDayMonth(selectedBill.date)} · ${selectedBillCases} cases`,
          `Total: ₹${money(selectedBillNet)}`,
          selectedBillBal > 0.01 ? `Balance due: ₹${money(selectedBillBal)}` : 'Paid',
        ].join('\n')
      : '';

    return (
      <div
        className="rt-flow-phone"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-bills-title"
      >
        <div className="hh-sales-top">
          <div className="hh-sales-top__row">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="hh-sales-top__iconbtn"
                aria-label="Back"
              >
                <ChevronLeft size={24} strokeWidth={2.2} />
              </button>
              <h1 id="assign-bills-title" className="hh-sales-top__title truncate">
                Bills · Trip #{trip.id}
              </h1>
            </div>
            <span className="hh-sales-top__pill shrink-0">
              {assignedBills.length} {assignedBills.length === 1 ? 'bill' : 'bills'}
            </span>
          </div>
        </div>

        <div className="rt-flow-phone__body space-y-2.5">
          {assignedBills.length === 0 ? (
            <div className="rt-card px-4 py-8 text-center space-y-2">
              <ShoppingBag size={28} className="mx-auto opacity-35" style={{ color: 'var(--text-2)' }} aria-hidden="true" />
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>
                No bills on Trip #{trip.id} yet
              </div>
              <p className="text-[12.5px] m-0" style={{ color: 'var(--text-2)' }}>
                Use Attach bills below to link customer invoices to this trip.
              </p>
            </div>
          ) : (
            assignedBills.map((bill) => {
              const net = billNetTotal(bill);
              const bal = billBalance(bill);
              const paid = Number(bill.amountPaid) || 0;
              const cases = (bill.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
              const statusClass = bal <= 0.01 ? 'rt-tag--paid' : paid > 0 ? 'rt-tag--soon' : 'rt-tag--due';
              const statusLabel = bal <= 0.01 ? 'Paid' : paid > 0 ? 'Part paid' : 'Due';

              return (
                <button
                  key={bill.id}
                  type="button"
                  onClick={() => {
                    setBillActionError(null);
                    setSelectedBillId(bill.id);
                  }}
                  className="rt-card w-full text-left cursor-pointer block space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1 text-[14.5px] font-extrabold leading-snug break-words" style={{ color: 'var(--text)' }}>
                      {invoiceNo(bill)} · {bill.retailer}
                    </div>
                    <div className="shrink-0 text-[14.5px] font-extrabold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>
                      ₹{money(net)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>
                      {fmtBillDayMonth(bill.date)} · {cases} {cases === 1 ? 'case' : 'cases'}
                    </div>
                    <span className={`rt-tag shrink-0 ${statusClass}`}>{statusLabel}</span>
                  </div>
                </button>
              );
            })
          )}

          <p className="text-[12px] font-medium pt-0.5 px-0.5 m-0" style={{ color: 'var(--text-2)' }}>
            Tap a bill to view, share or change its trip.
          </p>

          <div className="pt-1 flex flex-wrap items-center gap-2">
            {unassignedDateBillsCount > 0 && (
              <button
                type="button"
                onClick={() => onAutoAssignDate(trip.id)}
                className="rt-btn-outline rt-btn-outline--primary"
                style={{ minHeight: '40px', padding: '0 14px', fontSize: '12.5px' }}
              >
                <Zap size={14} /> Auto-assign {unassignedDateBillsCount} {unassignedDateBillsCount === 1 ? 'bill' : 'bills'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="rt-chip"
              aria-expanded={showPicker}
              style={{ minHeight: '40px' }}
            >
              <Plus size={14} /> {showPicker ? 'Hide bill picker' : 'Attach or find bills'}
            </button>
          </div>

          {showPicker && (
            <div className="rt-card space-y-2.5">
              {trip.status === 'closed' && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-950 space-y-2">
                  <div>
                    Trip #{trip.id} is completed. Reopen it to Active to attach or detach bills freely.
                  </div>
                  {onReopenTrip && (
                    <button
                      type="button"
                      onClick={() => onReopenTrip(Number(trip.id))}
                      className="rt-btn-outline rt-btn-outline--primary w-full"
                      style={{ minHeight: '40px' }}
                    >
                      <RotateCcw size={14} /> Reopen Trip #{trip.id}
                    </button>
                  )}
                </div>
              )}

              <div className="rt-search-bar" style={{ borderRadius: '14px' }}>
                <Search size={15} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                <input
                  enterKeyHint="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search retailer, phone, or bill #..."
                  className="text-[13px]"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear"
                    className="p-1 bg-transparent border-0 cursor-pointer"
                    style={{ color: 'var(--text-2)' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  aria-pressed={filterMode === 'date'}
                  onClick={() => setFilterMode('date')}
                  className="rt-chip shrink-0"
                  style={{ minHeight: '36px' }}
                >
                  Date: {fmtBillDayMonth(trip.date)}
                </button>
                <button
                  type="button"
                  aria-pressed={filterMode === 'unassigned'}
                  onClick={() => setFilterMode('unassigned')}
                  className="rt-chip shrink-0"
                  style={{ minHeight: '36px' }}
                >
                  Unassigned
                </button>
                <button
                  type="button"
                  aria-pressed={filterMode === 'all'}
                  onClick={() => setFilterMode('all')}
                  className="rt-chip shrink-0"
                  style={{ minHeight: '36px' }}
                >
                  All ({bills.length})
                </button>
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                {filteredBills.length === 0 ? (
                  <div className="py-4 text-center text-[12.5px]" style={{ color: 'var(--text-2)' }}>
                    No customer bills match your filter.
                  </div>
                ) : (
                  filteredBills.map((bill) => {
                    const isAssigned = trip.billIds.includes(bill.id);
                    const ownerTrip = isAssigned ? null : otherTripOf(bill);
                    const cases = (bill.items || []).reduce((sum, it) => sum + it.qty, 0);
                    return (
                      <button
                        key={bill.id}
                        type="button"
                        disabled={ownerTrip != null}
                        onClick={() => {
                          if (ownerTrip != null) return;
                          onToggleBill(trip.id, bill.id);
                        }}
                        className="w-full py-2.5 px-1 flex items-center justify-between gap-2.5 text-left bg-transparent border-0 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span
                            className="size-5 rounded flex items-center justify-center shrink-0 border"
                            style={{
                              borderColor: isAssigned ? 'var(--primary)' : 'var(--border)',
                              background: isAssigned ? 'var(--primary)' : 'transparent',
                              color: '#fff',
                            }}
                          >
                            {isAssigned && <Check size={13} strokeWidth={3} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-bold truncate" style={{ color: 'var(--text)' }}>
                              {invoiceNo(bill)} · {bill.retailer}
                            </div>
                            <div className="text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                              {fmtBillDayMonth(bill.date)} · {cases} cases
                              {ownerTrip != null ? ` · On Trip #${ownerTrip}` : ''}
                            </div>
                          </div>
                        </div>
                        <span className="text-[13px] font-extrabold tabular-nums shrink-0" style={{ color: 'var(--text)' }}>
                          ₹{money(billNetTotal(bill))}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {selectedBill && (
          <div
            className="rt-bsheet-scrim"
            role="dialog"
            aria-modal="true"
            aria-label={`Bill ${invoiceNo(selectedBill)}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedBillId(null);
            }}
          >
            <div className="rt-bsheet rt-bsheet--white space-y-3">
              <div className="hh-grab" />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[16px] font-extrabold leading-tight break-words" style={{ color: 'var(--text)' }}>
                    {invoiceNo(selectedBill)} · {selectedBill.retailer}
                  </div>
                  <div className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--text-2)' }}>
                    {fmtBillDayMonth(selectedBill.date)} · {selectedBillCases} {selectedBillCases === 1 ? 'case' : 'cases'}
                    {selectedBill.phone ? ` · ${selectedBill.phone}` : ''}
                  </div>
                </div>
                <span
                  className={`rt-tag shrink-0 ${
                    selectedBillBal <= 0.01 ? 'rt-tag--paid' : selectedBillPaid > 0 ? 'rt-tag--soon' : 'rt-tag--due'
                  }`}
                >
                  {selectedBillBal <= 0.01 ? 'Paid' : selectedBillPaid > 0 ? 'Part paid' : 'Due'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rt-trip-tile">
                  <div className="text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>Total</div>
                  <div className="text-[14.5px] font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--text)' }}>
                    ₹{money(selectedBillNet)}
                  </div>
                </div>
                <div className="rt-trip-tile">
                  <div className="text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>Paid</div>
                  <div className="text-[14.5px] font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--received)' }}>
                    ₹{money(selectedBillPaid)}
                  </div>
                </div>
                <div className="rt-trip-tile">
                  <div className="text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>Due</div>
                  <div
                    className="text-[14.5px] font-extrabold tabular-nums mt-0.5"
                    style={{ color: selectedBillBal > 0.01 ? 'var(--due)' : 'var(--text)' }}
                  >
                    ₹{money(selectedBillBal)}
                  </div>
                </div>
              </div>

              {(selectedBill.items || []).length > 0 && (
                <div className="rounded-xl border divide-y px-3" style={{ borderColor: 'var(--divider)' }}>
                  {selectedBill.items.map((it, idx) => {
                    const p = products.find((x) => x.id === it.productId);
                    return (
                      <div key={`${it.productId}-${idx}`} className="py-2 flex items-center justify-between gap-2 text-[12.5px]">
                        <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>
                          {p?.name || `Product #${it.productId}`}
                        </span>
                        <span className="font-bold tabular-nums shrink-0" style={{ color: 'var(--text-2)' }}>
                          {it.qty} cs
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {billActionError && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-950">
                  {billActionError}
                </div>
              )}

              <div className="space-y-2 pt-1">
                <a
                  href={whatsappLink(selectedBill.phone || '', shareMsg)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rt-btn-outline rt-btn-outline--primary w-full no-underline"
                >
                  <Share2 size={15} /> Share on WhatsApp
                </a>
                {trip.status === 'closed' && onReopenTrip ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBillId(null);
                      onClose();
                      onReopenTrip(Number(trip.id));
                    }}
                    className="rt-btn-outline rt-btn-outline--primary w-full"
                  >
                    <RotateCcw size={15} /> Reopen trip #{trip.id} to change bills
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const err = onToggleBill(trip.id, selectedBill.id);
                      if (typeof err === 'string' && err) {
                        setBillActionError(err);
                      } else {
                        setSelectedBillId(null);
                      }
                    }}
                    className="rt-btn-outline rt-btn-outline--due w-full"
                  >
                    Remove from Trip #{trip.id}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedBillId(null)}
                  className="rt-btn w-full"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-bills-title"
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col border-2 shadow-2xl rounded-sm my-auto overflow-hidden"
        style={{ backgroundColor: palette.panel, borderColor: palette.navy }}
      >
        {/* Modal Header */}
        <div
          className="p-4 border-b-2 flex items-center justify-between text-white"
          style={{ backgroundColor: palette.navy }}
        >
          <div>
            <h2 id="assign-bills-title" style={fz(18, { fontWeight: 700, color: '#FFFFFF' })}>
              Assign Customer Bills — Trip #{trip.id} ({trip.vehicle})
            </h2>
            <p className="text-white/80 text-xs mt-0.5">
              Dispatch Date: <strong>{trip.date}</strong> · Currently Assigned: {trip.billIds.length} bills ({totalAssignedCases} cases, ₹{money(totalAssignedValue)})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={Math.round(20 * scale)} aria-hidden="true" />
          </button>
        </div>

        {/* Closed trip reopen banner */}
        {trip.status === 'closed' && (
          <div
            className="p-3 bg-amber-50 border-b-2 border-amber-200 flex items-center justify-between flex-wrap gap-2 text-xs"
          >
            <div className="flex items-center gap-2 text-amber-900 font-semibold">
              <RotateCcw size={15} className="shrink-0 text-amber-700" />
              <span>
                Trip #{trip.id} is completed and reconciled. Reopen it to Active to attach or detach bills freely.
              </span>
            </div>
            {onReopenTrip && (
              <button
                type="button"
                onClick={() => onReopenTrip(Number(trip.id))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white font-bold cursor-pointer hover:bg-[var(--primary-hover)] shadow-xs active:scale-95 transition-all"
              >
                <RotateCcw size={13} />
                Reopen Trip #{trip.id}
              </button>
            )}
          </div>
        )}

        {/* Quick Auto-Assign Banner if unassigned bills on date exist */}
        {unassignedDateBillsCount > 0 && (
          <div
            className="p-3 border-b-2 flex items-center justify-between flex-wrap gap-2 text-xs font-semibold"
            style={{
              backgroundColor: `${palette.navy}10`,
              borderColor: palette.line,
              color: palette.ink,
            }}
          >
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-amber-600" aria-hidden="true" />
              <span>
                Found <strong>{unassignedDateBillsCount} unassigned customer bill(s)</strong> generated on this trip's date ({trip.date}).
              </span>
            </div>
            <button
              type="button"
              onClick={() => onAutoAssignDate(trip.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded cursor-pointer transition-all shadow-sm"
              style={{ backgroundColor: palette.navy }}
            >
              <Zap size={13} aria-hidden="true" />
              Auto-Assign All {unassignedDateBillsCount} Bills
            </button>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="p-3.5 border-b-2 space-y-3" style={{ borderColor: palette.line }}>
          <div className="flex items-center gap-3 flex-wrap justify-between">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 border-2 rounded p-0.5" style={{ borderColor: palette.line }}>
              <button
                type="button"
                onClick={() => setFilterMode('date')}
                className="px-3 py-1 text-xs font-bold rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: filterMode === 'date' ? palette.navy : 'transparent',
                  color: filterMode === 'date' ? '#FFFFFF' : palette.ink,
                }}
              >
                Date: {trip.date}
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unassigned')}
                className="px-3 py-1 text-xs font-bold rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: filterMode === 'unassigned' ? palette.navy : 'transparent',
                  color: filterMode === 'unassigned' ? '#FFFFFF' : palette.ink,
                }}
              >
                Unassigned Only
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className="px-3 py-1 text-xs font-bold rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: filterMode === 'all' ? palette.navy : 'transparent',
                  color: filterMode === 'all' ? '#FFFFFF' : palette.ink,
                }}
              >
                All Bills ({bills.length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input enterKeyHint="search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search retailer, phone, or bill #..."
                className="w-full pl-8 pr-3 py-1.5 border-2 rounded text-xs focus-ring"
                style={inputStyle}
              />
              {searchTerm && (
                <button aria-label="Close"
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bills List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[55vh]">
          {filteredBills.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <ShoppingBag size={32} className="mx-auto mb-2 opacity-40" aria-hidden="true" />
              <p className="font-semibold text-sm">No customer bills match your filter.</p>
              <p className="text-xs mt-1">
                {filterMode === 'date'
                  ? `No bills found for ${trip.date}. Try switching to 'All Bills' or generate new bills in Billing.`
                  : 'Try searching with a different customer name or clear filters.'}
              </p>
            </div>
          ) : (
            filteredBills.map((bill) => {
              const isAssigned = trip.billIds.includes(bill.id);
              const ownerTrip = isAssigned ? null : otherTripOf(bill);
              const totalCases = bill.items.reduce((sum, it) => sum + it.qty, 0);

              // Beverage items summary string
              const itemsSummary = bill.items
                .map((it) => {
                  const p = products.find((x) => x.id === it.productId);
                  return `${it.qty} cs ${p?.name || 'Item'}`;
                })
                .join(', ');

              return (
                <div
                  key={bill.id}
                  onClick={() => {
                    if (ownerTrip != null) return;
                    onToggleBill(trip.id, bill.id);
                  }}
                  className={`p-3 border-2 rounded flex items-center justify-between gap-3 transition-all ${
                    ownerTrip != null ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'
                  }`}
                  style={{
                    borderColor: isAssigned ? palette.navy : palette.line,
                    backgroundColor: isAssigned ? `${palette.navy}08` : palette.panel,
                  }}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Checkbox indicator */}
                    <div
                      className="w-5 h-5 mt-0.5 rounded flex items-center justify-center border-2 shrink-0 transition-colors"
                      style={{
                        borderColor: isAssigned ? palette.navy : palette.line,
                        backgroundColor: isAssigned ? palette.navy : 'transparent',
                        color: '#FFFFFF',
                      }}
                    >
                      {isAssigned && <Check size={14} strokeWidth={3} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{bill.retailer}</span>
                        <span className="text-xs text-slate-500 font-semibold">Bill #{bill.id}</span>
                        <span className="text-xs text-slate-400">· {bill.date}</span>
                        {ownerTrip != null && (
                          <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                            On Trip #{ownerTrip}
                          </span>
                        )}
                        {bill.phone && (
                          <span className="text-xs text-slate-500">· Ph: {bill.phone}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 truncate mt-0.5" title={itemsSummary}>
                        {itemsSummary || 'No items listed'}
                      </div>
                    </div>
                  </div>

                  {/* Totals & Status */}
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-900 text-sm">₹{money(bill.total)}</div>
                    <div className="text-xs text-slate-500 font-semibold">{totalCases} cases</div>
                    <div className="text-[11px] font-bold mt-0.5">
                      {billBalance(bill) <= 0 ? (
                        <span className="text-emerald-700">PAID</span>
                      ) : bill.amountPaid > 0 ? (
                        <span className="text-amber-700">₹{money(billBalance(bill))} DUE</span>
                      ) : (
                        <span className="text-red-700">UNPAID</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="p-3.5 border-t-2 flex items-center justify-between flex-wrap gap-2"
          style={{ borderColor: palette.line, backgroundColor: `${palette.line}20` }}
        >
          <div className="text-xs text-slate-700 font-semibold">
            {assignedBills.length} bill(s) assigned · Total: <strong>{totalAssignedCases} cases</strong> (₹{money(totalAssignedValue)})
          </div>

          <button
            type="button"
            onClick={onClose}
            className="border-2 px-5 py-2 font-bold text-xs text-white rounded cursor-pointer transition-all shadow-sm"
            style={{
              backgroundColor: palette.navy,
              borderColor: palette.navy,
            }}
          >
            Done Managing Bills
          </button>
        </div>
      </div>
    </div>
  );
};
