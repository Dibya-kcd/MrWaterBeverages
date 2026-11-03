import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Eye,
  FileText,
  Filter,
  MessageCircle,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  User,
  Users,
  Check,
  LayoutList,
  X,
} from 'lucide-react';
import { Bill, ExistingCustomer } from '../../types';
import { money, statusOf } from '../../utils/billing';
import { StatusBadge } from '../common/StatusBadge';
import { WhatsAppButton } from '../common/WhatsAppButton';
import { RecordPaymentModal } from '../common/RecordPaymentModal';
import { useLedger } from '../../context/LedgerContext';
import { billBalance, billNetTotal, billRefundDue, billReturnCredit } from '../../utils/salesReturns';
import { todayISO } from '../../utils/dateLocal';

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
  onCancelBill,
  onNewInvoiceClick,
}) => {
  const {
    bills,
    cancelledBills,
    salesmen,
    recordPayment,
    recordCustomerPayment,
    payments,
    syncBillsToCloud,
    palette,
    fz,
    scale,
    billingSettings,
  } = useLedger();

  const [grouping, setGrouping] = useState<HistoryGrouping>('table');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [salesmanFilter, setSalesmanFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [paymentDraft, setPaymentDraft] = useState<Record<number, string>>({});
  const [paymentModalBill, setPaymentModalBill] = useState<Bill | null>(null);
  const [isSyncingBills, setIsSyncingBills] = useState(false);
  const [syncBillsMsg, setSyncBillsMsg] = useState<string | null>(null);

  const prefix = billingSettings?.invoicePrefix ? `${billingSettings.invoicePrefix}-` : '';

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

  // Unique customer list for payment modal
  // One source of truth for customer balances: the ledger's own list (opening balance, every
  // receipt, advances and returns included). A private list built from bills alone showed
  // "0 due / settled" for a customer who had paid in advance.
  const { existingCustomers: ledgerCustomers } = useLedger();
  const existingCustomers: ExistingCustomer[] = useMemo(
    () => ledgerCustomers,
    [ledgerCustomers],
  );

  // Group by Date (Latest date on top)
  const dateGroups = useMemo(() => {
    const map = new Map<string, Bill[]>();
    for (const b of filteredBills) {
      const dateKey = b.date || 'Unspecified Date';
      const arr = map.get(dateKey) || [];
      arr.push(b);
      map.set(dateKey, arr);
    }

    // Sort dates in descending order (latest on top)
    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    return sortedDates.map((date) => {
      // Sort bills inside each date in sequence (latest on top)
      const groupBills = (map.get(date) || []).sort((a, b) => b.id - a.id);
      const totalBilled = groupBills.reduce((s, b) => s + b.total, 0);
      const totalPaid = groupBills.reduce((s, b) => s + b.amountPaid, 0);
      const totalDue = Math.max(0, totalBilled - totalPaid);
      return {
        key: `date-${date}`,
        label: date,
        bills: groupBills,
        totalBilled,
        totalPaid,
        totalDue,
      };
    });
  }, [filteredBills]);

  // Group by Customer (Latest activity on top)
  const customerGroups = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; bills: Bill[] }>();
    for (const b of filteredBills) {
      const norm = (b.retailer || 'Unknown Party').trim();
      const key = norm.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { name: norm, phone: b.phone || '', bills: [b] });
      } else {
        existing.bills.push(b);
        if (!existing.phone && b.phone) existing.phone = b.phone;
      }
    }

    const groups = Array.from(map.entries()).map(([key, data]) => {
      // Sort bills for each customer with latest on top
      const sortedBills = data.bills.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return b.id - a.id;
      });
      const latestDate = sortedBills[0]?.date || '';
      const totalBilled = sortedBills.reduce((s, b) => s + b.total, 0);
      const totalPaid = sortedBills.reduce((s, b) => s + b.amountPaid, 0);
      const totalDue = Math.max(0, totalBilled - totalPaid);
      return {
        key: `cust-${key}`,
        name: data.name,
        phone: data.phone,
        latestDate,
        bills: sortedBills,
        totalBilled,
        totalPaid,
        totalDue,
      };
    });

    // Sequence manner: customer with latest bill on top
    return groups.sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  }, [filteredBills]);

  // Toggle expansion for an accordion key
  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key], // Default is expanded (undefined => true)
    }));
  };

  const isExpanded = (key: string, isFirst: boolean) => {
    if (expandedKeys[key] !== undefined) return expandedKeys[key];
    return isFirst; // Expand top group by default
  };

  const handleExpandAll = () => {
    const allKeys: Record<string, boolean> = {};
    if (grouping === 'date') {
      dateGroups.forEach((g) => {
        allKeys[g.key] = true;
      });
    } else {
      customerGroups.forEach((g) => {
        allKeys[g.key] = true;
      });
    }
    setExpandedKeys(allKeys);
  };

  const handleCollapseAll = () => {
    const allKeys: Record<string, boolean> = {};
    if (grouping === 'date') {
      dateGroups.forEach((g) => {
        allKeys[g.key] = false;
      });
    } else {
      customerGroups.forEach((g) => {
        allKeys[g.key] = false;
      });
    }
    setExpandedKeys(allKeys);
  };

  const handleRecordPayment = (billId: number) => {
    const amount = Number(paymentDraft[billId]);
    if (!amount || amount <= 0) return;
    const bill = bills.find((b) => b.id === billId);
    // recordPayment only applies what is still due on this invoice, so anything typed above that
    // used to vanish with no trace. Send a larger amount through the receipt flow instead: this
    // invoice is paid first, the rest goes to the customer's oldest unpaid invoices, and whatever
    // is left is kept as an advance on account.
    if (bill && amount > billBalance(bill) + 0.004) {
      recordCustomerPayment(bill.retailer, amount, todayISO(), 'cash', undefined, billId, bill.customerId);
    } else {
      recordPayment(billId, amount);
    }
    setPaymentDraft((pd) => ({ ...pd, [billId]: '' }));
  };

  const handleFullClear = (bill: Bill) => {
    const due = billBalance(bill);
    if (due > 0) {
      recordPayment(bill.id, due);
    }
  };

  const cardStyle = {
    backgroundColor: palette.panel,
    borderColor: palette.line,
  };

  return (
    <div id="view-billing-history" className="space-y-4">
      {/* =========================================================================
          MODERN SMART CONTROL BAR (Search + View Modes + Payment Status Filters)
          ========================================================================= */}
      {/* =========================================================================
          SMART MODERN CONTROL BAR (Interactive Metric Cards + Sleek View Mode Tabs)
          ========================================================================= */}
      {/* 1. Interactive KPI Summary Cards (Double as Fast Payment Status Filters) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {/* All Bills Card */}
        <button
          type="button"
          id="filter-all-bills"
          onClick={() => setPaymentFilter('all')}
          className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group select-none ${
            paymentFilter === 'all'
              ? 'bg-white border-[#0d4a3a] shadow-md ring-2 ring-[#0d4a3a]/15'
              : 'bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 group-hover:text-slate-700">
              All Invoices
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono transition-colors ${
                paymentFilter === 'all' ? 'bg-[#0d4a3a] text-white' : 'bg-slate-100 text-slate-600'
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

        {/* Pending Due Card */}
        <button
          type="button"
          id="filter-pending-bills"
          onClick={() => setPaymentFilter('pending')}
          className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group select-none ${
            paymentFilter === 'pending'
              ? 'bg-amber-50/70 border-amber-600 shadow-md ring-2 ring-amber-600/20'
              : 'bg-white/80 border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Pending Due
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono transition-colors ${
                paymentFilter === 'pending'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {statusCounts.pending}
            </span>
          </div>
          <div className="font-mono text-base sm:text-lg font-black text-amber-950">
            ₹{money(stats.totalDue)}
          </div>
          <div className="text-[11px] text-amber-700/80 mt-0.5">
            Outstanding balance to collect
          </div>
        </button>

        {/* Paid / Cleared Card */}
        <button
          type="button"
          id="filter-paid-bills"
          onClick={() => setPaymentFilter('paid')}
          className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group select-none ${
            paymentFilter === 'paid'
              ? 'bg-emerald-50/70 border-emerald-700 shadow-md ring-2 ring-emerald-700/20'
              : 'bg-white/80 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Paid in Full
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono transition-colors ${
                paymentFilter === 'paid'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {statusCounts.paid}
            </span>
          </div>
          <div className="font-mono text-base sm:text-lg font-black text-emerald-950">
            ₹{money(stats.totalPaid)}
          </div>
          <div className="text-[11px] text-emerald-700/80 mt-0.5">
            Settled collections
          </div>
        </button>
      </div>

      {/* 2. Unified Modern Smart Toolbar (View Mode Tabs + Search + Secondary Actions) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Main View Mode Segmented Tabs: Table (default) | Date-wise | By Customer */}
          <div className="inline-flex p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shrink-0 self-stretch sm:self-auto shadow-2xs">
            <button
              type="button"
              id="tab-view-table"
              onClick={() => setGrouping('table')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                grouping === 'table'
                  ? 'bg-[#0d4a3a] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <LayoutList size={14} />
              <span>Table</span>
            </button>

            <button
              type="button"
              id="tab-view-date"
              onClick={() => setGrouping('date')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                grouping === 'date'
                  ? 'bg-[#0d4a3a] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Calendar size={14} />
              <span>Date-wise</span>
            </button>

            <button
              type="button"
              id="tab-view-customer"
              onClick={() => setGrouping('customer')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                grouping === 'customer'
                  ? 'bg-[#0d4a3a] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Users size={14} />
              <span>By Customer</span>
            </button>
          </div>

          {/* Search Bar + Controls */}
          <div className="flex items-center gap-2 flex-1 max-w-xl">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input enterKeyHint="search"
                id="history-search-input"
                type="text"
                placeholder="Search bills, customer, phone, item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/20 focus:border-[#0d4a3a] focus:bg-white transition-all shadow-2xs"
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

            {/* Accordion Expand/Collapse buttons when in grouped mode (Date-wise or Customer) */}
            {grouping !== 'table' && (
              <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors cursor-pointer"
                >
                  Expand
                </button>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md hover:bg-white/80 text-slate-600 transition-colors cursor-pointer"
                >
                  Collapse
                </button>
              </div>
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

      {syncBillsMsg && (
        <div className="p-2.5 border rounded-xl flex items-center gap-2 text-xs font-bold bg-emerald-50 text-emerald-800 border-emerald-300">
          <Check size={14} />
          {syncBillsMsg}
        </div>
      )}

      {/* PRIMARY VIEW MODE: Clean Table directly compliant with Image 1 */}
      {grouping === 'table' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          {/* Desktop Table View (visible on md screens and up) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="py-3.5 px-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    ITEM
                  </th>
                  <th className="py-3.5 px-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    DETAILS
                  </th>
                  <th className="py-3.5 px-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    VALUE
                  </th>
                  <th className="py-3.5 px-6 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">
                    STATUS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400 text-sm">
                      No billing records found.
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((b) => {
                    const due = billBalance(b);
                    const isPaid = due <= 0.01;
                    const invPrefix = billingSettings?.invoicePrefix || (b.isGstInvoice ? 'INV' : 'INV');
                    const itemLabel = `${invPrefix}-${b.id}`;

                    return (
                      <tr
                        key={b.id}
                        onClick={() => onViewInvoice(b)}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors group select-none"
                        title="Click to view full sale details"
                      >
                        <td className="py-4 px-6 text-sm font-semibold text-slate-900 group-hover:text-emerald-800">
                          {itemLabel}
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-600 font-normal">
                          {b.retailer || 'Cash customer'}
                        </td>
                        <td className="py-4 px-6 text-sm font-semibold text-slate-900 font-mono tabular-nums">
                          ₹{money(b.total)}
                        </td>
                        <td className="py-4 px-6 text-sm text-right">
                          <span className={`font-semibold text-xs ${isPaid ? 'text-teal-600' : 'text-amber-600'}`}>
                            {isPaid ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile & Tablet Responsive View — strictly matching Image 1 */}
          <div className="md:hidden">
            <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">ITEM</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">STATUS</span>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredBills.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  No billing records found.
                </div>
              ) : (
                filteredBills.map((b) => {
                  const due = billBalance(b);
                  const isPaid = due <= 0.01;
                  const invPrefix = billingSettings?.invoicePrefix || (b.isGstInvoice ? 'INV' : 'INV');
                  const itemLabel = `${invPrefix}-${b.id}`;

                  return (
                    <div
                      key={b.id}
                      onClick={() => onViewInvoice(b)}
                      className="px-4 py-3.5 flex items-center justify-between hover:bg-slate-50/80 active:bg-slate-100 cursor-pointer transition-colors select-none"
                      title="Click to view full sale details"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="text-sm font-bold text-slate-900 leading-tight">
                          {itemLabel}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 truncate">
                          {b.retailer || 'Cash customer'} · ₹{money(b.total)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-1.5">
                        <span className={`block font-semibold text-xs ${isPaid ? 'text-teal-600' : 'text-amber-600'}`}>
                          {isPaid ? 'Paid' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECONDARY VIEW MODES: Date-wise or By Customer */}
      {grouping !== 'table' && (
        <>

      {/* Empty state — Crate-style */}
      {filteredBills.length === 0 && (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm px-6 py-12 text-center">
          <h3 className="text-base font-bold text-slate-900">No bills yet</h3>
          <p className="text-sm text-slate-500 mt-1.5">
            Create your first sale to see it here.
          </p>
          {onNewInvoiceClick && (
            <button
              type="button"
              onClick={onNewInvoiceClick}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#0d4a3a] text-white text-sm font-semibold shadow-sm cursor-pointer active:scale-[0.99]"
            >
              New sale
            </button>
          )}
        </div>
      )}

      {/* Grouping Mode 1: Date-wise (Sequence: Latest on top) */}
      {grouping === 'date' &&
        dateGroups.map((group, idx) => {
          const expanded = isExpanded(group.key, idx === 0);
          return (
            <div key={group.key} className="border-2 rounded overflow-hidden shadow-sm" style={cardStyle}>
              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => toggleExpand(group.key)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer select-none bg-slate-50/80 hover:bg-slate-100/80 border-b"
                style={{ borderColor: palette.line }}
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  {expanded ? <ChevronUp size={16} className="text-slate-600" /> : <ChevronDown size={16} className="text-slate-600" />}
                  <Calendar size={15} style={{ color: palette.navy }} />
                  <span className="font-bold text-sm text-slate-900">{group.label}</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-700">
                    {group.bills.length} bill{group.bills.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="text-slate-800">₹{money(group.totalBilled)}</span>
                  {group.totalDue > 0 ? (
                    <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                      Due: ₹{money(group.totalDue)}
                    </span>
                  ) : (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      Settled
                    </span>
                  )}
                </div>
              </button>

              {/* Accordion Body: Bills in sequence */}
              {expanded && (
                <div className="divide-y divide-slate-200 p-2 sm:p-3 space-y-2">
                  {group.bills.map((bill) => (
                    <BillItemCard
                      key={bill.id}
                      bill={bill}
                      prefix={prefix}
                      palette={palette}
                      onViewInvoice={onViewInvoice}
                      onEditBill={onEditBill}
                      onDeleteBill={onDeleteBill}
                      onCancelBill={onCancelBill}
                      paymentDraft={paymentDraft[bill.id] || ''}
                      onPaymentDraftChange={(val) => setPaymentDraft((prev) => ({ ...prev, [bill.id]: val }))}
                      onRecordPayment={() => handleRecordPayment(bill.id)}
                      onFullClear={() => handleFullClear(bill)}
                      onOpenPaymentModal={() => setPaymentModalBill(bill)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

      {/* Grouping Mode 2: Customer-wise (Sequence: Latest customer on top) */}
      {grouping === 'customer' &&
        customerGroups.map((group, idx) => {
          const expanded = isExpanded(group.key, idx === 0);
          return (
            <div key={group.key} className="border-2 rounded overflow-hidden shadow-sm" style={cardStyle}>
              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => toggleExpand(group.key)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer select-none bg-slate-50/80 hover:bg-slate-100/80 border-b"
                style={{ borderColor: palette.line }}
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  {expanded ? <ChevronUp size={16} className="text-slate-600" /> : <ChevronDown size={16} className="text-slate-600" />}
                  <User size={15} style={{ color: palette.navy }} />
                  <span className="font-bold text-sm text-slate-900">{group.name}</span>
                  {group.phone && <span className="text-xs text-slate-500 font-mono">({group.phone})</span>}
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-700">
                    {group.bills.length} order{group.bills.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="text-slate-500">Last: {group.latestDate}</span>
                  <span className="text-slate-800">Total: ₹{money(group.totalBilled)}</span>
                  {group.totalDue > 0 ? (
                    <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                      Due: ₹{money(group.totalDue)}
                    </span>
                  ) : (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      All Paid
                    </span>
                  )}
                </div>
              </button>

              {/* Accordion Body: Bills for this customer in sequence */}
              {expanded && (
                <div className="divide-y divide-slate-200 p-2 sm:p-3 space-y-2">
                  {group.bills.map((bill) => (
                    <BillItemCard
                      key={bill.id}
                      bill={bill}
                      prefix={prefix}
                      palette={palette}
                      onViewInvoice={onViewInvoice}
                      onEditBill={onEditBill}
                      onDeleteBill={onDeleteBill}
                      onCancelBill={onCancelBill}
                      paymentDraft={paymentDraft[bill.id] || ''}
                      onPaymentDraftChange={(val) => setPaymentDraft((prev) => ({ ...prev, [bill.id]: val }))}
                      onRecordPayment={() => handleRecordPayment(bill.id)}
                      onFullClear={() => handleFullClear(bill)}
                      onOpenPaymentModal={() => setPaymentModalBill(bill)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        </>
      )}

      {/* Record Payment Modal with date maintenance */}
      {paymentModalBill && (
        <RecordPaymentModal
          isOpen={Boolean(paymentModalBill)}
          onClose={() => setPaymentModalBill(null)}
          initialCustomerName={paymentModalBill.retailer}
          initialBillId={paymentModalBill.id}
          initialAmount={billBalance(paymentModalBill)}
          existingCustomers={existingCustomers}
          bills={bills}
          palette={palette}
          onSavePayment={({ customerName, amount, paymentDate, mode, referenceNote, billId }) => {
            recordCustomerPayment(
              customerName,
              amount,
              paymentDate,
              mode,
              referenceNote,
              billId || paymentModalBill.id,
              paymentModalBill.customerId
            );
            setPaymentModalBill(null);
          }}
        />
      )}
    </div>
  );
};

interface BillItemCardProps {
  bill: Bill;
  prefix: string;
  palette: any;
  onViewInvoice: (b: Bill) => void;
  onEditBill: (b: Bill) => void;
  onDeleteBill: (b: Bill) => void;
  onCancelBill: (b: Bill) => void;
  paymentDraft: string;
  onPaymentDraftChange: (val: string) => void;
  onRecordPayment: () => void;
  onFullClear: () => void;
  onOpenPaymentModal: () => void;
}

const BillItemCard: React.FC<BillItemCardProps> = ({
  bill,
  prefix,
  palette,
  onViewInvoice,
  onEditBill,
  onDeleteBill,
  onCancelBill,
  paymentDraft,
  onPaymentDraftChange,
  onRecordPayment,
  onFullClear,
  onOpenPaymentModal,
}) => {
  const balance = billBalance(bill);
  const st = statusOf(billNetTotal(bill), bill.amountPaid);
  const totalCases = bill.items.reduce((s, i) => s + i.qty, 0);
  const freeCases = bill.items.reduce((s, i) => s + (i.freeQty || 0), 0);
  const returnCredit = billReturnCredit(bill);
  const refundDue = billRefundDue(bill);

  return (
    <div className="border rounded-md p-3 bg-white hover:border-slate-400 transition-colors shadow-sm space-y-2.5">
      {returnCredit > 0 && (
        <div className="text-[11px] font-semibold rounded bg-sky-50 border border-sky-200 text-sky-700 px-2 py-1">
          Returns credited: ₹{money(returnCredit)} ({(bill.returns || []).map((r) => r.creditNoteNo).join(', ')})
          {refundDue > 0 && <span className="text-amber-800"> · Refund due to customer: ₹{money(refundDue)}</span>}
        </div>
      )}
      {/* Top Line: Invoice #, Date, Customer & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onViewInvoice(bill)}
            className="font-bold font-mono text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-sky-700 border border-slate-300 cursor-pointer"
            title="Click to view invoice"
          >
            #{prefix}{bill.id}
          </button>
          <span
            className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${
              bill.invoiceType === 'tax_invoice' || bill.isGstInvoice
                ? 'bg-amber-50 text-amber-900 border-amber-300'
                : 'bg-emerald-50 text-emerald-900 border-emerald-300'
            }`}
            title={
              bill.invoiceType === 'tax_invoice' || bill.isGstInvoice
                ? 'GST Tax Invoice (with HSN code & tax breakdown)'
                : 'Non-GST Retail Bill (B2C Cash Memo)'
            }
          >
            {bill.invoiceType === 'tax_invoice' || bill.isGstInvoice ? '🏢 GST' : '🛒 Non-GST'}
          </span>
          <span className="text-xs text-slate-500 font-medium">{bill.date}</span>
          <span className="font-bold text-xs text-slate-900">{bill.retailer}</span>
          {bill.salesman && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 flex items-center gap-1">
              <User size={10} />
              <span>{bill.salesman}</span>
            </span>
          )}
          {bill.phone && (
            <span className="text-xs text-slate-500 font-mono flex items-center gap-0.5">
              <Phone size={10} />
              {bill.phone}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={st} />
        </div>
      </div>

      {/* Item Summary Chips */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
        <span className="font-bold text-slate-600">{totalCases} cs</span>
        {freeCases > 0 && <span className="font-bold text-amber-700">(+{freeCases} free)</span>}
        <span className="text-slate-300">·</span>
        {bill.items.map((item, idx) => (
          <span key={item.key || idx} className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
            {item.productName} ({item.qty} cs @ ₹{item.rate})
          </span>
        ))}
      </div>

      {/* Financials & Quick Collection Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div>
            <span className="text-slate-500">Bill: </span>
            <strong className="text-slate-900">₹{money(bill.total)}</strong>
          </div>
          <div>
            <span className="text-slate-500">Paid: </span>
            <strong className="text-emerald-700">₹{money(bill.amountPaid)}</strong>
          </div>
          {balance > 0 ? (
            <div>
              <span className="text-slate-500">Due: </span>
              <strong className="text-rose-700">₹{money(balance)}</strong>
            </div>
          ) : (
            <span className="text-emerald-700 font-bold text-[11px]">✓ Settled</span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {balance > 0 && (
            <div className="flex items-center gap-1 mr-1">
              <input
                type="number" inputMode="decimal"
                step="0.01"
                placeholder={`₹${balance}`}
                value={paymentDraft}
                onChange={(e) => onPaymentDraftChange(e.target.value)}
                className="w-20 px-2 py-1 text-xs border rounded font-mono font-bold focus:outline-none"
                style={{ borderColor: palette.line }}
              />
              <button
                type="button"
                onClick={onRecordPayment}
                disabled={!paymentDraft || Number(paymentDraft) <= 0}
                className="px-2 py-1 text-xs font-bold rounded text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
                title="Record partial or full payment"
              >
                Pay
              </button>
              <button
                type="button"
                onClick={onFullClear}
                className="px-1.5 py-1 text-[11px] font-bold rounded border bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                title="Clear entire due balance"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={onOpenPaymentModal}
                className="px-2 py-1 text-[11px] font-bold rounded border border-blue-300 bg-sky-50 hover:bg-sky-100 text-sky-700 flex items-center gap-1 cursor-pointer"
                title="Record payment with exact collection date, mode, and reference notes"
              >
                <Calendar size={11} />
                <span>Date Pay</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onViewInvoice(bill)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border hover:bg-slate-100 cursor-pointer"
            style={{ borderColor: palette.line, color: palette.navy }}
            title={
              bill.invoiceType === 'tax_invoice' || bill.isGstInvoice
                ? 'View GST Tax Invoice'
                : 'View Non-GST Retail Bill'
            }
          >
            <Eye size={12} />
            <span>View {bill.invoiceType === 'tax_invoice' || bill.isGstInvoice ? 'GST' : 'Bill'}</span>
          </button>

          <button
            type="button"
            onClick={() => onEditBill(bill)}
            disabled={(bill.returns || []).length > 0}
            className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border hover:bg-amber-50 text-amber-800 border-amber-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={(bill.returns || []).length > 0 ? 'Customer returns exist against this invoice. Cancel or correct the return first (Live stock → Returns), then edit the invoice.' : 'Edit this invoice'}
          >
            <Pencil size={12} />
            <span>Edit</span>
          </button>

          <WhatsAppButton bill={bill} id={`wa-btn-hist-${bill.id}`} />

          <button
            type="button"
            onClick={() => onCancelBill(bill)}
            className="px-2 py-1 text-xs font-bold rounded text-rose-700 hover:bg-rose-50 border border-rose-300 cursor-pointer"
            title="Cancel this invoice with a credit note (keeps the invoice number for GST records)"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => onDeleteBill(bill)}
            className="p-1 text-xs font-bold rounded text-rose-600 hover:bg-rose-50 hover:text-rose-800 border border-transparent hover:border-rose-200 cursor-pointer"
            title="Delete this bill"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
