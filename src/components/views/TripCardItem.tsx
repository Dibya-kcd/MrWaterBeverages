import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  Package,
  Plus,
  RotateCcw,
  Trash2,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import { Bill, Product, Trip, PaletteTokens } from '../../types';
import { money } from '../../utils/billing';
import { TripProductReconciliationRow, TripReconciliationCards } from './TripReconciliationCards';

interface TripCardItemProps {
  trip: Trip;
  palette: PaletteTokens;
  scale: number;
  fz: (px: number, extra?: React.CSSProperties) => React.CSSProperties;
  products: Product[];
  bills: Bill[];
  onEdit: (trip: Trip) => void;
  onRecordReturn: (trip: Trip) => void;
  onReopen: (tripId: number) => void;
  onDelete: (trip: Trip) => void;
  onAutoAssign: (tripId: number, dateStr: string) => void;
  onManageBills: (trip: Trip) => void;
  tripBreakdown: (trip: Trip) => { rows: TripProductReconciliationRow[]; hasDiscrepancy: boolean };
  initiallyExpandedBreakdown?: boolean;
}

export const TripCardItem: React.FC<TripCardItemProps> = ({
  trip,
  palette,
  scale,
  fz,
  products,
  bills,
  onEdit,
  onRecordReturn,
  onReopen,
  onDelete,
  onAutoAssign,
  onManageBills,
  tripBreakdown,
  initiallyExpandedBreakdown = false,
}) => {
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState<boolean>(initiallyExpandedBreakdown);
  const [breakdownViewMode, setBreakdownViewMode] = useState<'beverage' | 'customer'>('beverage');

  const { rows, hasDiscrepancy } = tripBreakdown(trip);

  const totalLoadedCases = rows.reduce((s, r) => s + r.loaded, 0);
  const totalDeliveredCases = rows.reduce((s, r) => s + r.sold, 0);
  const totalReturnedCases = rows.reduce((s, r) => s + r.returned, 0);
  const netDiscrepancy = rows.reduce((s, r) => s + r.discrepancy, 0);

  // Filter ONLY bills assigned to this trip
  const tripAssignedBills = (trip.billIds || [])
    .map((id) => bills.find((b) => b.id === id))
    .filter(Boolean) as Bill[];

  const totalAssignedInvoiceValue = tripAssignedBills.reduce((sum, b) => sum + b.total, 0);

  // Unassigned bills for this date
  const unassignedDateBills = bills.filter(
    (b) => b.date === trip.date && !(trip.billIds || []).includes(b.id)
  );

  // Customer deliveries mapped per product
  const customerDeliveriesByProduct: Record<
    number,
    { customer: string; qty: number; billId: number }[]
  > = {};
  for (const b of tripAssignedBills) {
    for (const it of b.items) {
      if (it.qty > 0) {
        if (!customerDeliveriesByProduct[it.productId]) {
          customerDeliveriesByProduct[it.productId] = [];
        }
        customerDeliveriesByProduct[it.productId].push({
          customer: b.retailer,
          qty: it.qty,
          billId: b.id,
        });
      }
    }
  }

  return (
    <div className="p-3 sm:p-4 bg-white hover:bg-slate-50/40 transition-colors">
      <div className="border-2 rounded-md overflow-hidden" style={{ borderColor: palette.line }}>
        {/* Trip Header Banner */}
        <div
          className="p-3 sm:p-4 border-b-2 flex items-center justify-between flex-wrap gap-3"
          style={{ borderColor: palette.line, backgroundColor: `${palette.line}25` }}
        >
          <div className="flex items-center gap-3">
            <Truck size={Math.round(22 * scale)} className="text-slate-800" aria-hidden="true" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span style={fz(16, { fontWeight: 800, color: palette.ink })}>
                  Trip #{trip.id}: {trip.vehicle}
                </span>
                <span
                  className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: trip.status === 'out' ? `${palette.bad}20` : `${palette.good}20`,
                    color: trip.status === 'out' ? palette.bad : palette.good,
                  }}
                >
                  {trip.status === 'out' ? 'Out for Delivery' : 'Returned & Reconciled'}
                </span>
              </div>
              <div style={fz(12.5, { color: palette.muted, marginTop: '0.15em' })}>
                Dispatch Date: <strong>{trip.date}</strong> · Assigned Customers:{' '}
                <strong>{tripAssignedBills.length}</strong> (₹{money(totalAssignedInvoiceValue)})
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Edit Trip Button */}
            <button
              type="button"
              id={`edit-trip-${trip.id}`}
              onClick={() => onEdit(trip)}
              className="flex items-center gap-1 border-2 px-3 py-1.5 focus-ring cursor-pointer font-semibold rounded text-xs transition-colors hover:bg-slate-100"
              style={{
                borderColor: palette.line,
                color: palette.ink,
                backgroundColor: palette.panel,
              }}
              title="Edit vehicle, date, or adjust loaded/returned stock"
            >
              <Edit3 size={13} aria-hidden="true" />
              <span>Edit Load/Unload</span>
            </button>

            {trip.status === 'out' ? (
              <button
                id={`btn-record-return-${trip.id}`}
                type="button"
                onClick={() => onRecordReturn(trip)}
                className="border-2 px-3.5 py-1.5 focus-ring cursor-pointer font-bold rounded text-xs text-white transition-opacity hover:opacity-95"
                style={{
                  backgroundColor: palette.navy,
                  borderColor: palette.navy,
                }}
              >
                Record Return
              </button>
            ) : (
              <button
                id={`btn-reopen-trip-${trip.id}`}
                type="button"
                onClick={() => onReopen(trip.id)}
                className="flex items-center gap-1 border-2 px-3 py-1.5 focus-ring cursor-pointer font-semibold rounded text-xs transition-colors hover:bg-slate-100"
                style={{
                  borderColor: palette.line,
                  color: palette.ink,
                  backgroundColor: palette.panel,
                }}
              >
                <RotateCcw size={13} aria-hidden="true" />
                <span>Re-open</span>
              </button>
            )}

            {/* Delete Trip */}
            <button
              type="button"
              id={`delete-trip-${trip.id}`}
              onClick={() => onDelete(trip)}
              className="border-2 p-1.5 text-red-600 border-red-200 hover:border-red-500 hover:bg-red-50 rounded cursor-pointer transition-colors focus-ring"
              title={`Delete trip #${trip.id}`}
              aria-label={`Delete trip #${trip.id}`}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Card Body & Reconciled High-Level Metrics */}
        <div className="p-3 sm:p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2.5 rounded border" style={{ borderColor: palette.line, backgroundColor: palette.panel }}>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Loaded Crates</div>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">{totalLoadedCases} cs</div>
              <div className="text-[10.5px] text-slate-400">{rows.length} product(s)</div>
            </div>

            <div className="p-2.5 rounded border" style={{ borderColor: palette.line, backgroundColor: palette.panel }}>
              <div className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Delivered & Billed</div>
              <div className="text-base font-extrabold text-emerald-800 mt-0.5">{totalDeliveredCases} cs</div>
              <div className="text-[10.5px] text-slate-400">₹{money(totalAssignedInvoiceValue)} total</div>
            </div>

            <div className="p-2.5 rounded border" style={{ borderColor: palette.line, backgroundColor: palette.panel }}>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Returned Crates</div>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">
                {trip.status === 'closed' ? `${totalReturnedCases} cs` : 'Pending'}
              </div>
              <div className="text-[10.5px] text-slate-400">
                {trip.status === 'closed' ? 'Unsold stock returned' : 'Currently in market'}
              </div>
            </div>

            <div
              className="p-2.5 rounded border"
              style={{
                backgroundColor:
                  trip.status === 'closed'
                    ? hasDiscrepancy
                      ? `${palette.bad}15`
                      : `${palette.good}15`
                    : `${palette.line}25`,
                borderColor:
                  trip.status === 'closed'
                    ? hasDiscrepancy
                      ? palette.bad
                      : palette.good
                    : palette.line,
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Reconciliation Status
              </div>
              <div
                className="text-base font-black mt-0.5"
                style={{
                  color:
                    trip.status === 'closed'
                      ? hasDiscrepancy
                        ? palette.bad
                        : palette.good
                      : palette.ink,
                }}
              >
                {trip.status === 'closed'
                  ? netDiscrepancy === 0
                    ? 'Balanced (0)'
                    : `${netDiscrepancy > 0 ? `+${netDiscrepancy}` : netDiscrepancy} cs missing`
                  : 'Out on run'}
              </div>
              <div className="text-[10.5px] text-slate-500 font-medium">
                {trip.status === 'closed'
                  ? netDiscrepancy === 0
                    ? 'All crates accounted'
                    : 'Discrepancy detected'
                  : 'Pending return count'}
              </div>
            </div>
          </div>

          {/* Collapsible Accordion Toggle for Reconciliation */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-800 hover:text-blue-900 cursor-pointer p-1 -ml-1 transition-colors"
            >
              {isBreakdownExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              <span>
                {isBreakdownExpanded ? 'Hide' : 'Show'} Vehicle Stock Reconciliation & Manifest
              </span>
              <span className="text-slate-500 font-normal">
                ({rows.length} beverage item{rows.length === 1 ? '' : 's'}, {tripAssignedBills.length} delivery stop{tripAssignedBills.length === 1 ? '' : 's'})
              </span>
            </button>

            {hasDiscrepancy && trip.status === 'closed' && (
              <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                ⚠ Shortage flagged in return
              </span>
            )}
          </div>

          {/* Collapsible Details Content */}
          {isBreakdownExpanded && (
            <div className="space-y-4 pt-2 border-t-2" style={{ borderColor: palette.line }}>
              {/* Manifest Sub-Navigation Toggle */}
              <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-2">
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setBreakdownViewMode('beverage')}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-extrabold rounded cursor-pointer transition-colors ${
                      breakdownViewMode === 'beverage'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Package size={13} />
                    <span>Beverage Stock Reconciliation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBreakdownViewMode('customer')}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-extrabold rounded cursor-pointer transition-colors ${
                      breakdownViewMode === 'customer'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users size={13} />
                    <span>Customer Manifest ({tripAssignedBills.length} stops)</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBreakdownExpanded(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer py-1"
                >
                  ↑ Contract Breakdown
                </button>
              </div>

              {/* View 1: Vehicle Stock Reconciliation (Cards View by default for Mobile/Tablet) */}
              {breakdownViewMode === 'beverage' ? (
                <TripReconciliationCards
                  tripId={trip.id}
                  rows={rows}
                  tripStatus={trip.status}
                  customerDeliveriesByProduct={customerDeliveriesByProduct}
                  palette={palette}
                  fz={fz}
                />
              ) : (
                /* View 2: Customer Manifest View */
                <div
                  className="border-2 rounded p-3 space-y-2.5 bg-slate-50/50"
                  style={{ borderColor: palette.line }}
                >
                  {tripAssignedBills.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      No customer bills linked to this trip. Use &quot;Auto-Assign Date Bills&quot; or &quot;+ Manage Bills&quot; below.
                    </div>
                  ) : (
                    tripAssignedBills.map((b, idx) => {
                      const billCases = b.items.reduce((s, it) => s + it.qty, 0);
                      return (
                        <div
                          key={b.id}
                          className="border-2 bg-white p-3 rounded flex items-center justify-between flex-wrap gap-2 text-xs"
                          style={{ borderColor: palette.line }}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">
                                Stop #{idx + 1}: {b.retailer}
                              </span>
                              <span className="text-slate-500">· Bill #{b.id}</span>
                              {b.phone && <span className="text-slate-400">· Ph: {b.phone}</span>}
                            </div>
                            <div className="text-slate-600 mt-1">
                              Delivered:{' '}
                              {b.items
                                .map((it) => {
                                  const p = products.find((x) => x.id === it.productId);
                                  return `${it.qty} cs ${p?.name || 'Beverage'}`;
                                })
                                .join(', ')}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-bold text-slate-900 text-sm">₹{money(b.total)}</div>
                            <div className="text-slate-500 font-semibold">{billCases} cases</div>
                            <div className="text-[11px] font-bold">
                              {b.amountPaid >= b.total ? (
                                <span className="text-emerald-700">PAID</span>
                              ) : (
                                <span className="text-amber-700">₹{money(b.total - b.amountPaid)} DUE</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Assigned Delivery Bills Management Section */}
              <div className="border-t-2 pt-3 mt-3" style={{ borderColor: palette.line }}>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span style={fz(13.5, { fontWeight: 700, color: palette.ink })}>
                      Assigned Delivery Bills ({tripAssignedBills.length}):
                    </span>
                    {tripAssignedBills.length > 0 && (
                      <span className="text-xs text-slate-500 font-semibold">
                        · Total Invoiced: ₹{money(totalAssignedInvoiceValue)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Auto-Assign button for this date */}
                    <button
                      type="button"
                      onClick={() => onAutoAssign(trip.id, trip.date)}
                      className="inline-flex items-center gap-1.5 border-2 px-2.5 py-1 text-xs font-bold rounded cursor-pointer transition-colors shadow-2xs hover:bg-slate-50"
                      style={{ borderColor: palette.navy, color: palette.navy }}
                      title={`Automatically assign all customer delivery bills dated ${trip.date}`}
                    >
                      <Zap size={13} aria-hidden="true" />
                      Auto-Assign {trip.date} Bills
                      {unassignedDateBills.length > 0 && (
                        <span className="bg-amber-100 text-amber-800 px-1 rounded text-[10px]">
                          +{unassignedDateBills.length} ready
                        </span>
                      )}
                    </button>

                    {/* Open Modal to Add/Manage Bills */}
                    <button
                      type="button"
                      onClick={() => onManageBills(trip)}
                      className="inline-flex items-center gap-1.5 border-2 px-2.5 py-1 text-xs font-bold rounded cursor-pointer text-white transition-opacity hover:opacity-95"
                      style={{ backgroundColor: palette.navy, borderColor: palette.navy }}
                    >
                      <Plus size={13} aria-hidden="true" />
                      Manage Bills
                    </button>
                  </div>
                </div>

                {/* Show bills list or friendly notice */}
                {tripAssignedBills.length === 0 ? (
                  <div
                    className="p-3 border-2 rounded text-xs text-slate-600 flex items-center justify-between flex-wrap gap-2"
                    style={{ borderColor: palette.line, backgroundColor: `${palette.line}10` }}
                  >
                    <div>
                      No delivery bills currently assigned to this vehicle run.
                      {unassignedDateBills.length > 0 && (
                        <span className="ml-1 font-bold text-slate-800">
                          (Found {unassignedDateBills.length} customer bill(s) created for {trip.date})
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onAutoAssign(trip.id, trip.date)}
                      className="font-bold underline text-blue-700 hover:text-blue-900 cursor-pointer"
                    >
                      Click to Auto-Assign Bills for {trip.date} →
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {tripAssignedBills.map((b) => {
                      const casesCount = b.items.reduce((s, it) => s + it.qty, 0);
                      return (
                        <div
                          key={b.id}
                          className="border-2 rounded p-2.5 flex items-center justify-between gap-2 text-xs transition-colors hover:bg-slate-50"
                          style={{ borderColor: palette.line, backgroundColor: palette.panel }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 truncate" title={b.retailer}>
                                {b.retailer}
                              </span>
                              <span className="text-slate-500 shrink-0 font-semibold">#{b.id}</span>
                            </div>
                            <div className="text-slate-500 text-[11px] mt-0.5">
                              {casesCount} cs · ₹{money(b.total)}
                            </div>
                          </div>
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              backgroundColor: b.amountPaid >= b.total ? `${palette.good}15` : '#FEF3C7',
                              color: b.amountPaid >= b.total ? palette.good : '#92400E',
                            }}
                          >
                            {b.amountPaid >= b.total ? 'Paid' : 'Due'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
