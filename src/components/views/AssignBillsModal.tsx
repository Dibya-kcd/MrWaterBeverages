import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Check,
  Plus,
  Calendar,
  Zap,
  ShoppingBag,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { Bill, Product, Trip } from '../../types';
import { money } from '../../utils/billing';

interface AssignBillsModalProps {
  trip: Trip | null;
  isOpen: boolean;
  onClose: () => void;
  bills: Bill[];
  products: Product[];
  onToggleBill: (tripId: number, billId: number) => void;
  onAutoAssignDate: (tripId: number) => void;
  palette: any;
  fz: (size: number, extra?: React.CSSProperties) => React.CSSProperties;
  scale: number;
}

export const AssignBillsModal: React.FC<AssignBillsModalProps> = ({
  trip,
  isOpen,
  onClose,
  bills,
  products,
  onToggleBill,
  onAutoAssignDate,
  palette,
  fz,
  scale,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'date' | 'unassigned' | 'all'>('date');

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
        return !trip.billIds.includes(b.id);
      }
      return true;
    });
  }, [bills, trip, searchTerm, filterMode]);

  // Bills matching trip date that are not yet assigned
  const unassignedDateBillsCount = useMemo(() => {
    if (!trip) return 0;
    return bills.filter((b) => b.date === trip.date && !trip.billIds.includes(b.id)).length;
  }, [bills, trip]);

  // Calculate summary of assigned bills
  const assignedBills = useMemo(() => {
    if (!trip) return [];
    return trip.billIds.map((id) => bills.find((b) => b.id === id)).filter(Boolean) as Bill[];
  }, [trip, bills]);

  const totalAssignedCases = assignedBills.reduce(
    (sum, b) => sum + b.items.reduce((s, it) => s + it.qty, 0),
    0
  );
  const totalAssignedValue = assignedBills.reduce((sum, b) => sum + b.total, 0);

  const inputStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    color: palette.ink,
    borderColor: palette.line,
    borderWidth: 2,
    ...fz(13.5),
  };

  if (!isOpen || !trip) return null;

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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded cursor-pointer transition-all shadow-xs"
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
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search retailer, phone, or bill #..."
                className="w-full pl-8 pr-3 py-1.5 border-2 rounded text-xs focus-ring"
                style={inputStyle}
              />
              {searchTerm && (
                <button
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
                  onClick={() => onToggleBill(trip.id, bill.id)}
                  className="p-3 border-2 rounded flex items-center justify-between gap-3 cursor-pointer transition-all hover:shadow-xs"
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
                      {bill.amountPaid >= bill.total ? (
                        <span className="text-emerald-700">PAID</span>
                      ) : bill.amountPaid > 0 ? (
                        <span className="text-amber-700">₹{money(bill.total - bill.amountPaid)} DUE</span>
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
            className="border-2 px-5 py-2 font-bold text-xs text-white rounded cursor-pointer transition-all shadow-xs"
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
