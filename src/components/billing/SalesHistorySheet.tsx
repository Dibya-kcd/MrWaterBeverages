import React, { useMemo, useState } from 'react';
import { Printer, Search, Share2, X } from 'lucide-react';
import type { Bill } from '../../types';
import { money } from '../../utils/billing';
import { billBalance } from '../../utils/salesReturns';

/**
 * New Sale · Sales History.
 *  - phones (< 768px): bottom sheet.
 *  - tablets (768 - 1023px): right-hand drawer.
 *
 * Read-only: it lists bills it is given and calls the handlers the parent passes in (the same
 * "View / Print" modal and WhatsApp share the Sales history tab uses). It never edits a bill.
 */
export interface SalesHistorySheetProps {
  bills: Bill[];
  /** YYYY-MM-DD of the sale date the New Sale screen is on. */
  todayIso: string;
  /** Trip the user is selling from right now (drives the "Today's Trip" filter). */
  selectedTripId?: number;
  invoicePrefix?: string;
  onViewInvoice: (bill: Bill) => void;
  onShare: (bill: Bill) => void;
  /** Opens the full Sales history tab (edit, cancel, reports). */
  onOpenFullHistory: () => void;
  onClose: () => void;
  /** 'drawer' = tablet right panel, 'sheet' = phone bottom sheet. */
  variant: 'drawer' | 'sheet';
}

type Scope = 'trip' | 'today' | 'all';

const isLive = (b: Bill): boolean => b.status !== 'cancelled' && !b.cancelled && !b.cancellation;

const casesOf = (b: Bill): number =>
  (b.items || []).reduce((s, i) => s + (Number(i.qty) || 0) + (Number(i.freeQty) || 0), 0);

export const SalesHistorySheet: React.FC<SalesHistorySheetProps> = ({
  bills,
  todayIso,
  selectedTripId,
  invoicePrefix,
  onViewInvoice,
  onShare,
  onOpenFullHistory,
  onClose,
  variant,
}) => {
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');

  const live = useMemo(() => (bills || []).filter(isLive), [bills]);

  const scopeCounts = useMemo(() => {
    let todayCount = 0;
    let tripCount = 0;
    for (const b of live) {
      if (String(b.date || '').slice(0, 10) === todayIso) todayCount += 1;
      if (selectedTripId !== undefined && b.tripId === selectedTripId) tripCount += 1;
    }
    return { all: live.length, today: todayCount, trip: tripCount };
  }, [live, todayIso, selectedTripId]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return live
      .filter((b) => {
        if (scope === 'trip' && !(selectedTripId !== undefined && b.tripId === selectedTripId)) return false;
        if (scope === 'today' && String(b.date || '').slice(0, 10) !== todayIso) return false;
        if (!q) return true;
        return (
          String(b.id).includes(q) ||
          `${invoicePrefix || ''}${b.id}`.toLowerCase().includes(q) ||
          (b.retailer || '').toLowerCase().includes(q) ||
          (b.phone || '').includes(q)
        );
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id)
      .slice(0, 100);
  }, [live, scope, query, selectedTripId, todayIso, invoicePrefix]);

  const chip = (on: boolean) =>
    `min-h-[40px] px-3.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
      on ? 'bg-[#0A1F44] text-white' : 'bg-white border border-gray-300 text-[#0A1F44] hover:bg-gray-50'
    }`;

  const shell =
    variant === 'drawer'
      ? 'fixed inset-y-0 right-0 z-[60] w-[min(420px,92vw)] bg-white shadow-2xl flex flex-col'
      : 'fixed inset-x-0 bottom-0 z-[60] max-h-[85vh] bg-white rounded-t-3xl shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom)]';

  return (
    <div data-esc-close className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Sales History">
      <button
        type="button"
        aria-label="Close sales history"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 cursor-default"
      />
      <div className={shell}>
        {variant === 'sheet' && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-gray-300 shrink-0" aria-hidden />}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
          <h3 className="text-lg font-bold text-[#0A1F44]">Sales History ({scopeCounts.all})</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pb-2 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          <button type="button" onClick={() => setScope('all')} className={chip(scope === 'all')}>
            All History ({scopeCounts.all})
          </button>
          <button type="button" onClick={() => setScope('today')} className={chip(scope === 'today')}>
            Today ({scopeCounts.today})
          </button>
          {selectedTripId !== undefined && (
            <button type="button" onClick={() => setScope('trip')} className={chip(scope === 'trip')}>
              This Trip ({scopeCounts.trip})
            </button>
          )}
        </div>

        <div className="px-4 pb-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search invoice # or retailer..."
              autoComplete="off"
              className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-gray-300 bg-white text-base text-[#0A1F44] focus:outline-none focus:border-[#1B8A5A] focus:ring-2 focus:ring-[#1B8A5A]/20"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No invoices found.</p>
          ) : (
            rows.map((b) => {
              const due = Math.max(0, billBalance(b));
              const paid = due <= 0.004;
              const mode = b.paymentMode ? String(b.paymentMode).toUpperCase() : '';
              return (
                <article key={b.id} className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 tabular-nums">
                        #{invoicePrefix ? `${invoicePrefix}-` : 'INV-'}
                        {b.id}
                      </p>
                      <p className="font-bold text-[#0A1F44] leading-snug break-words">{b.retailer || 'Walk-in sale'}</p>
                      <p className="mt-0.5 text-xs text-gray-600 tabular-nums">
                        {casesOf(b)} Cases
                        {scope === 'all' ? ` • ${String(b.date || '').slice(0, 10)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-bold text-[#0A1F44] tabular-nums">₹{money(b.total)}</span>
                      <span
                        className={`text-xs font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap ${
                          paid ? 'bg-[#ECFDF5] text-[#1B8A5A]' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {paid ? `Paid${mode ? ` • ${mode}` : ''}` : `Due ₹${money(due)}`}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onViewInvoice(b)}
                      className="min-h-[44px] rounded-xl bg-[#1B8A5A] hover:bg-[#157048] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" /> View / Print
                    </button>
                    <button
                      type="button"
                      onClick={() => onShare(b)}
                      className="min-h-[44px] rounded-xl bg-[#1B8A5A] hover:bg-[#157048] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" /> Share
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onOpenFullHistory}
            className="w-full min-h-[44px] rounded-xl border border-gray-300 bg-white text-sm font-semibold text-[#0A1F44] hover:bg-gray-50 cursor-pointer"
          >
            Open full Sales history (edit, cancel, reports)
          </button>
        </div>
      </div>
    </div>
  );
};
