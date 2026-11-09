import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  LayoutList,
  Pencil,
  Search,
  Share2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Bill } from '../../types';
import { money } from '../../utils/billing';
import { useLedger } from '../../context/LedgerContext';
import { billBalance } from '../../utils/salesReturns';

interface BillingHistoryViewProps {
  onViewInvoice: (bill: Bill, defaultFormat?: 'gst' | 'non_gst') => void;
  onEditBill: (bill: Bill) => void;
  onDeleteBill: (bill: Bill) => void;
  onCancelBill: (bill: Bill) => void;
  onNewInvoiceClick?: () => void;
}

type HistoryGrouping = 'table' | 'date' | 'customer';
type PaymentFilter = 'all' | 'pending' | 'paid';

export const BillingHistoryView: React.FC<BillingHistoryViewProps> = ({
  onViewInvoice,
  onEditBill,
  onDeleteBill,
  onCancelBill: _onCancelBill,
  onNewInvoiceClick,
}) => {
  const {
    bills,
    salesmen,
    billingSettings,
  } = useLedger();

  const [grouping, setGrouping] = useState<HistoryGrouping>('table');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [salesmanFilter, setSalesmanFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  // Filter bills based on search and payment status
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        b.retailer.toLowerCase().includes(q) ||
        (b.phone && b.phone.includes(q)) ||
        String(b.id).includes(q) ||
        b.date.includes(q) ||
        b.items.some((i) => i.productName.toLowerCase().includes(q));

      const due = billBalance(b);
      let matchesPayment = true;
      if (paymentFilter === 'pending') matchesPayment = due > 0;
      if (paymentFilter === 'paid') matchesPayment = due === 0;

      let matchesSalesman = true;
      if (salesmanFilter) {
        matchesSalesman =
          b.salesmanId === salesmanFilter ||
          b.salesman === salesmanFilter ||
          salesmen.find((s) => s.id === salesmanFilter)?.name === b.salesman;
      }

      return matchesSearch && matchesPayment && matchesSalesman;
    });
  }, [bills, salesmen, searchQuery, paymentFilter, salesmanFilter]);

  // Overall statistics
  const stats = useMemo(() => {
    const totalCount = bills.length;
    const totalBilled = bills.reduce((sum, b) => sum + b.total, 0);
    const totalPaid = bills.reduce((sum, b) => sum + b.amountPaid, 0);
    const totalDue = Math.max(0, totalBilled - totalPaid);
    const pendingCount = bills.filter((b) => billBalance(b) > 0).length;
    const paidCount = bills.filter((b) => billBalance(b) <= 0).length;
    return { totalCount, totalBilled, totalPaid, totalDue, pendingCount, paidCount };
  }, [bills]);

  // Status breakdown counts (respecting search and salesman filters)
  const statusCounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = bills.filter((b) => {
      const matchesSearch =
        !q ||
        b.retailer.toLowerCase().includes(q) ||
        (b.phone && b.phone.includes(q)) ||
        String(b.id).includes(q) ||
        b.date.includes(q) ||
        b.items.some((i) => i.productName.toLowerCase().includes(q));

      let matchesSalesman = true;
      if (salesmanFilter) {
        matchesSalesman =
          b.salesmanId === salesmanFilter ||
          b.salesman === salesmanFilter ||
          salesmen.find((s) => s.id === salesmanFilter)?.name === b.salesman;
      }
      return matchesSearch && matchesSalesman;
    });

    const all = base.length;
    const pending = base.filter((b) => billBalance(b) > 0).length;
    const paid = base.filter((b) => billBalance(b) <= 0).length;
    return { all, pending, paid };
  }, [bills, salesmen, searchQuery, salesmanFilter]);

  // Group by Date (Latest date on top)
  const dateGroups = useMemo(() => {
    const map = new Map<string, Bill[]>();
    for (const b of filteredBills) {
      const dateKey = b.date || 'Unspecified Date';
      const arr = map.get(dateKey) || [];
      arr.push(b);
      map.set(dateKey, arr);
    }

    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    return sortedDates.map((date) => {
      const groupBills = (map.get(date) || []).sort((a, b) => b.id - a.id);
      const totalBilled = groupBills.reduce((s, b) => s + b.total, 0);
      const totalPaid = groupBills.reduce((s, b) => s + b.amountPaid, 0);
      const totalDue = Math.max(0, totalBilled - totalPaid);
      const totalItems = groupBills.reduce(
        (sum, b) => sum + (b.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0),
        0
      );
      return {
        key: `date-${date}`,
        label: date,
        bills: groupBills,
        totalItems,
        totalBilled,
        totalPaid,
        totalDue,
      };
    });
  }, [filteredBills]);

  // Group by Customer (Latest activity on top)
  const customerGroups = useMemo(() => {
    const map = new Map<string, { name: string; bills: Bill[] }>();
    for (const b of filteredBills) {
      const norm = (b.retailer || 'Unknown Party').trim();
      const key = norm.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { name: norm, bills: [b] });
      } else {
        existing.bills.push(b);
      }
    }

    const groups = Array.from(map.entries()).map(([key, data]) => {
      const sortedBills = data.bills.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return b.id - a.id;
      });
      const latestDate = sortedBills[0]?.date || '';
      const totalBilled = sortedBills.reduce((s, b) => s + b.total, 0);
      const totalPaid = sortedBills.reduce((s, b) => s + b.amountPaid, 0);
      const totalDue = Math.max(0, totalBilled - totalPaid);
      const totalItems = sortedBills.reduce(
        (sum, b) => sum + (b.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0),
        0
      );
      return {
        key: `cust-${key}`,
        name: data.name,
        latestDate,
        bills: sortedBills,
        totalItems,
        totalBilled,
        totalPaid,
        totalDue,
      };
    });

    return groups.sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  }, [filteredBills]);

  // Toggle expansion for an accordion key
  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key],
    }));
  };

  const isExpanded = (key: string, isFirst: boolean) => {
    if (expandedKeys[key] !== undefined) return expandedKeys[key];
    return isFirst;
  };

  return (
    <div id="view-billing-history" className="hh-view space-y-4">
      {/* 1. Interactive KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {/* All Invoices Card */}
        <button
          type="button"
          id="filter-all-bills"
          onClick={() => setPaymentFilter('all')}
          className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group select-none ${
            paymentFilter === 'all'
              ? 'bg-white border-[var(--primary)] shadow-md ring-2 ring-[var(--primary)]/15'
              : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 group-hover:text-slate-700">
              All Invoices
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono transition-colors ${
                paymentFilter === 'all' ? 'bg-[var(--primary)] text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {statusCounts.all}
            </span>
          </div>
          <div className="font-mono text-base sm:text-lg font-black text-slate-900">
            ₹{money(stats.totalBilled)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Total sales value ({bills.length} total bills)
          </div>
        </button>

        {/* Pending Due Card (Red) */}
        <button
          type="button"
          id="filter-pending-bills"
          onClick={() => setPaymentFilter('pending')}
          className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group select-none ${
            paymentFilter === 'pending'
              ? 'bg-red-50/70 border-red-600 shadow-md ring-2 ring-red-600/20'
              : 'bg-white/80 border-slate-200 hover:border-red-300 hover:bg-red-50/30 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-700">
              Pending Due
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono transition-colors ${
                paymentFilter === 'pending' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'
              }`}
            >
              {statusCounts.pending}
            </span>
          </div>
          <div className="font-mono text-base sm:text-lg font-black text-red-600">
            ₹{money(stats.totalDue)}
          </div>
          <div className="text-[11px] text-red-600/80 mt-0.5">
            Pending customer collections
          </div>
        </button>

        {/* Settled / Paid Card (Green) */}
        <button
          type="button"
          id="filter-paid-bills"
          onClick={() => setPaymentFilter('paid')}
          className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group select-none ${
            paymentFilter === 'paid'
              ? 'bg-emerald-50/70 border-emerald-600 shadow-md ring-2 ring-emerald-600/20'
              : 'bg-white/80 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Settled
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono transition-colors ${
                paymentFilter === 'paid' ? 'bg-emerald-600 text-white' : 'bg-emerald-100/70 text-emerald-800'
              }`}
            >
              {statusCounts.paid}
            </span>
          </div>
          <div className="font-mono text-base sm:text-lg font-black text-emerald-700">
            ₹{money(stats.totalPaid)}
          </div>
          <div className="text-[11px] text-emerald-700/80 mt-0.5">
            Settled collections
          </div>
        </button>
      </div>

      {/* 2. Unified Toolbar (Compact single-word tabs: Invoices | Dates | Customer + Full-width Search) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Main View Mode Tabs (Short single-word names: Invoices | Dates | Customer to fit mobile) */}
          <div className="grid grid-cols-3 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shrink-0 self-stretch sm:self-auto sm:inline-flex shadow-2xs">
            <button
              type="button"
              id="tab-view-table"
              onClick={() => setGrouping('table')}
              className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap ${
                grouping === 'table'
                  ? 'bg-[var(--primary)] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <LayoutList size={14} className="shrink-0" />
              <span>Invoices</span>
            </button>

            <button
              type="button"
              id="tab-view-date"
              onClick={() => setGrouping('date')}
              className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap ${
                grouping === 'date'
                  ? 'bg-[var(--primary)] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Calendar size={14} className="shrink-0" />
              <span>Dates</span>
            </button>

            <button
              type="button"
              id="tab-view-customer"
              onClick={() => setGrouping('customer')}
              className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap ${
                grouping === 'customer'
                  ? 'bg-[var(--primary)] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Users size={14} className="shrink-0" />
              <span>Customer</span>
            </button>
          </div>

          {/* Full-width Search Bar (Expand & Collapse removed as requested) */}
          <div className="relative flex-1 min-w-0 max-w-xl">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              enterKeyHint="search"
              id="history-search-input"
              type="text"
              placeholder="Search invoices, customer, item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] focus:bg-white transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Live Filter Feedback Strip */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-800">
              Showing {filteredBills.length}
            </span>
            <span className="text-slate-400">of</span>
            <span className="text-slate-600">{bills.length} total bills</span>
            {paymentFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                Filter: {paymentFilter.toUpperCase()}
                <button
                  type="button"
                  onClick={() => setPaymentFilter('all')}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer ml-0.5"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          <div className="text-right">
            <span>Filtered Total: </span>
            <span className="font-mono font-bold text-slate-900">
              ₹{money(filteredBills.reduce((s, b) => s + b.total, 0))}
            </span>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredBills.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs px-6 py-12 text-center">
          <h3 className="text-base font-bold text-slate-900">No invoices found</h3>
          <p className="text-sm text-slate-500 mt-1.5">
            Create your first sale to see it here.
          </p>
          {onNewInvoiceClick && (
            <button
              type="button"
              onClick={onNewInvoiceClick}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[var(--primary)] text-white text-sm font-semibold shadow-xs cursor-pointer active:scale-[0.99]"
            >
              New sale
            </button>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 1: Invoices (Clean Table UI with Edit, Share, Delete)
          ========================================================================= */}
      {filteredBills.length > 0 && grouping === 'table' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="py-3.5 px-5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    ITEM
                  </th>
                  <th className="py-3.5 px-5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    DETAILS
                  </th>
                  <th className="py-3.5 px-5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    VALUE
                  </th>
                  <th className="py-3.5 px-5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    STATUS
                  </th>
                  <th className="py-3.5 px-5 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBills.map((b) => {
                  const due = billBalance(b);
                  const isPaid = due <= 0.01;
                  const invPrefix = billingSettings?.invoicePrefix || 'INV';
                  const itemLabel = `${invPrefix}-${b.id}`;
                  const totalCases = (b.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
                  const itemCount = (b.items || []).length;

                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-slate-50/80 transition-colors group select-none"
                    >
                      <td className="py-3.5 px-5 text-sm font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewInvoice(b)}
                            className="font-mono text-xs font-bold text-[var(--primary)] hover:underline cursor-pointer"
                            title="Click to view invoice"
                          >
                            #{itemLabel}
                          </button>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${
                              b.invoiceType === 'tax_invoice' || b.isGstInvoice
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                            }`}
                          >
                            {b.invoiceType === 'tax_invoice' || b.isGstInvoice ? 'GST' : 'Non-GST'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-sm text-slate-600 font-normal">
                        <div className="font-medium text-slate-900">{b.retailer || 'Cash customer'}</div>
                        <div className="text-[11px] text-slate-400">
                          {b.date} · {totalCases} cs · {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-sm font-semibold text-slate-900 font-mono tabular-nums">
                        ₹{money(b.total)}
                      </td>
                      <td className="py-3.5 px-5 text-sm">
                        <span className={`font-semibold text-xs ${isPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                          {isPaid ? 'Paid' : `Due: ₹${money(due)}`}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-sm text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEditBill(b)}
                            disabled={(b.returns || []).length > 0}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
                            title="Edit this invoice"
                          >
                            <Pencil size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onViewInvoice(b)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                            title="Share or View invoice"
                          >
                            <Share2 size={12} />
                            <span>Share</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteBill(b)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete bill"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Table View */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredBills.map((b) => {
              const due = billBalance(b);
              const isPaid = due <= 0.01;
              const invPrefix = billingSettings?.invoicePrefix || 'INV';
              const itemLabel = `${invPrefix}-${b.id}`;
              const totalCases = (b.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
              const itemCount = (b.items || []).length;

              return (
                <div key={b.id} className="p-3.5 space-y-2 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(b)}
                        className="font-bold font-mono text-xs text-[var(--primary)] hover:underline cursor-pointer"
                      >
                        #{itemLabel}
                      </button>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${
                          b.invoiceType === 'tax_invoice' || b.isGstInvoice
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        }`}
                      >
                        {b.invoiceType === 'tax_invoice' || b.isGstInvoice ? 'GST' : 'Non-GST'}
                      </span>
                    </div>
                    <span className={`font-semibold text-xs ${isPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isPaid ? 'Paid' : `Due: ₹${money(due)}`}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-slate-900">{b.retailer || 'Cash customer'}</span>
                    <span className="font-mono font-bold text-slate-900">₹{money(b.total)}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                    <span>
                      {b.date} · {totalCases} cs · {itemCount} {itemCount === 1 ? 'item' : 'items'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditBill(b)}
                        disabled={(b.returns || []).length > 0}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer disabled:opacity-40"
                      >
                        <Pencil size={11} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewInvoice(b)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer"
                      >
                        <Share2 size={11} />
                        <span>Share</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteBill(b)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Delete bill"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 2: Dates (Date header with Total & Due below Date, then Bills & Items)
          ========================================================================= */}
      {filteredBills.length > 0 && grouping === 'date' && (
        <div className="space-y-3">
          {dateGroups.map((group, idx) => {
            const expanded = isExpanded(group.key, idx === 0);
            return (
              <div
                key={group.key}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
              >
                {/* Date Card Header: Line 1 Date, Line 2 Total & Due, Line 3 Bills & Items */}
                <button
                  type="button"
                  onClick={() => toggleExpand(group.key)}
                  className="w-full p-3.5 sm:px-4 sm:py-3.5 text-left transition-colors cursor-pointer select-none bg-slate-50/90 hover:bg-slate-100/80 border-b border-slate-200/80 space-y-1.5"
                >
                  {/* Line 1: Date & Chevron */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar size={15} className="text-[var(--primary)] shrink-0" />
                      <span className="font-bold text-sm sm:text-base text-slate-900">{group.label}</span>
                    </div>
                    {expanded ? (
                      <ChevronUp size={16} className="text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-400 shrink-0" />
                    )}
                  </div>

                  {/* Line 2: Total & Due (below Date, before Bills & Items) */}
                  <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap text-xs sm:text-sm font-bold">
                    <span className="text-slate-800 font-mono">
                      Total: ₹{money(group.totalBilled)}
                    </span>
                    {group.totalDue > 0 ? (
                      <span className="text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-xs font-bold">
                        Due: ₹{money(group.totalDue)}
                      </span>
                    ) : (
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-bold">
                        Paid
                      </span>
                    )}
                  </div>

                  {/* Line 3: Bills and Items Count */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200/80 text-slate-700">
                      {group.bills.length} {group.bills.length === 1 ? 'bill' : 'bills'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      {group.totalItems} {group.totalItems === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </button>

                {/* Expanded Invoices List */}
                {expanded && (
                  <div className="divide-y divide-slate-100">
                    {group.bills.map((bill) => {
                      const due = billBalance(bill);
                      const isPaid = due <= 0.01;
                      const invPrefix = billingSettings?.invoicePrefix || 'INV';
                      const itemLabel = `${invPrefix}-${bill.id}`;
                      const totalCases = (bill.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
                      const itemCount = (bill.items || []).length;

                      return (
                        <div
                          key={bill.id}
                          className="p-3.5 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => onViewInvoice(bill)}
                                className="font-bold font-mono text-xs text-[var(--primary)] hover:underline cursor-pointer"
                                title="View Invoice"
                              >
                                #{itemLabel}
                              </button>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${
                                  bill.invoiceType === 'tax_invoice' || bill.isGstInvoice
                                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                }`}
                              >
                                {bill.invoiceType === 'tax_invoice' || bill.isGstInvoice ? 'GST' : 'Non-GST'}
                              </span>
                              <span className="text-xs text-slate-800 font-semibold truncate">
                                {bill.retailer || 'Cash customer'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {totalCases} cases · {itemCount} {itemCount === 1 ? 'item' : 'items'}
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-1 sm:pt-0 border-t border-slate-100 sm:border-0">
                            <div className="text-left sm:text-right">
                              <div className="text-xs sm:text-sm font-bold text-slate-900 font-mono">
                                ₹{money(bill.total)}
                              </div>
                              <div className="text-[11px]">
                                {isPaid ? (
                                  <span className="text-emerald-600 font-bold">Paid</span>
                                ) : (
                                  <span className="text-red-600 font-bold">Due: ₹{money(due)}</span>
                                )}
                              </div>
                            </div>

                            {/* Actions: Edit, Share, Delete */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => onEditBill(bill)}
                                disabled={(bill.returns || []).length > 0}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
                                title="Edit this invoice"
                              >
                                <Pencil size={12} />
                                <span>Edit</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onViewInvoice(bill)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                                title="Share or View this invoice"
                              >
                                <Share2 size={12} />
                                <span>Share</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onDeleteBill(bill)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete this invoice"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 3: Customer (Customer header with Total & Due below Name, then Invoices)
          ========================================================================= */}
      {filteredBills.length > 0 && grouping === 'customer' && (
        <div className="space-y-3">
          {customerGroups.map((group, idx) => {
            const expanded = isExpanded(group.key, idx === 0);
            return (
              <div
                key={group.key}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
              >
                {/* Customer Card Header: Line 1 Name, Line 2 Total & Due, Line 3 Invoices */}
                <button
                  type="button"
                  onClick={() => toggleExpand(group.key)}
                  className="w-full p-3.5 sm:px-4 sm:py-3.5 text-left transition-colors cursor-pointer select-none bg-slate-50/90 hover:bg-slate-100/80 border-b border-slate-200/80 space-y-1.5"
                >
                  {/* Line 1: Customer Name & Chevron */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Users size={15} className="text-[var(--primary)] shrink-0" />
                      <span className="font-bold text-sm sm:text-base text-slate-900 break-words">
                        {group.name}
                      </span>
                    </div>
                    {expanded ? (
                      <ChevronUp size={16} className="text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-400 shrink-0" />
                    )}
                  </div>

                  {/* Line 2: Total & Due (below Name, before Invoices count) */}
                  <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap text-xs sm:text-sm font-bold">
                    <span className="text-slate-800 font-mono">
                      Total: ₹{money(group.totalBilled)}
                    </span>
                    {group.totalDue > 0 ? (
                      <span className="text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-xs font-bold">
                        Due: ₹{money(group.totalDue)}
                      </span>
                    ) : (
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-bold">
                        Paid
                      </span>
                    )}
                  </div>

                  {/* Line 3: Invoices Count */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200/80 text-slate-700">
                      {group.bills.length} {group.bills.length === 1 ? 'invoice' : 'invoices'}
                    </span>
                  </div>
                </button>

                {/* Expanded Invoices List */}
                {expanded && (
                  <div className="divide-y divide-slate-100">
                    {group.bills.map((bill) => {
                      const due = billBalance(bill);
                      const isPaid = due <= 0.01;
                      const invPrefix = billingSettings?.invoicePrefix || 'INV';
                      const itemLabel = `${invPrefix}-${bill.id}`;
                      const totalCases = (bill.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
                      const itemCount = (bill.items || []).length;

                      return (
                        <div
                          key={bill.id}
                          className="p-3.5 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => onViewInvoice(bill)}
                                className="font-bold font-mono text-xs text-[var(--primary)] hover:underline cursor-pointer"
                                title="View Invoice"
                              >
                                #{itemLabel}
                              </button>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${
                                  bill.invoiceType === 'tax_invoice' || bill.isGstInvoice
                                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                }`}
                              >
                                {bill.invoiceType === 'tax_invoice' || bill.isGstInvoice ? 'GST' : 'Non-GST'}
                              </span>
                              <span className="text-xs text-slate-600 font-medium">
                                {bill.date}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {totalCases} cases · {itemCount} {itemCount === 1 ? 'item' : 'items'}
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-1 sm:pt-0 border-t border-slate-100 sm:border-0">
                            <div className="text-left sm:text-right">
                              <div className="text-xs sm:text-sm font-bold text-slate-900 font-mono">
                                ₹{money(bill.total)}
                              </div>
                              <div className="text-[11px]">
                                {isPaid ? (
                                  <span className="text-emerald-600 font-bold">Paid</span>
                                ) : (
                                  <span className="text-red-600 font-bold">Due: ₹{money(due)}</span>
                                )}
                              </div>
                            </div>

                            {/* Actions: Edit, Share, Delete */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => onEditBill(bill)}
                                disabled={(bill.returns || []).length > 0}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
                                title="Edit this invoice"
                              >
                                <Pencil size={12} />
                                <span>Edit</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onViewInvoice(bill)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                                title="Share or View this invoice"
                              >
                                <Share2 size={12} />
                                <span>Share</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onDeleteBill(bill)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete this invoice"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
