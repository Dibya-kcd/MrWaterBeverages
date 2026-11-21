import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LayoutList,
  Pencil,
  Receipt,
  Route,
  Search,
  Share2,
  Trash2,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { Bill } from '../../types';
import { money } from '../../utils/billing';
import { useLedger } from '../../context/LedgerContext';
import { billBalance } from '../../utils/salesReturns';
import { formatBillNumber, isGstExcludedBill } from '../../utils/invoiceCommon';
import { useBeats } from '../../hooks/useBeats';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useLanguage } from '../../i18n/LanguageContext';
import { todayISO } from '../../utils/dateLocal';
import { getInitials } from '../ui/HomeKit';
import { makeBeatResolver } from '../../utils/beatReports';
import { normBeat } from '../../utils/beats';

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
    products,
    salesmen,
    billingSettings,
    customers,
  } = useLedger();

  const { beats, activeBeats } = useBeats();
  const isPhone = useIsMobile(767);
  const { t } = useLanguage();

  const [grouping, setGrouping] = useState<HistoryGrouping>('table');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [dateWindow, setDateWindow] = useState<'all' | 'today' | '7d'>('all');
  const [salesmanFilter, setSalesmanFilter] = useState<string>('');
  const [beatFilter, setBeatFilter] = useState<string>('all');
  const [beatMenuOpen, setBeatMenuOpen] = useState(false);
  const beatMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!beatMenuOpen) return;
    const onDocDown = (e: MouseEvent | TouchEvent) => {
      if (beatMenuRef.current && !beatMenuRef.current.contains(e.target as Node)) {
        setBeatMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
    };
  }, [beatMenuOpen]);

  const beatResolver = useMemo(() => makeBeatResolver(customers || [], beats), [customers, beats]);

  const selectedBeatId = useMemo(() => {
    if (beatFilter === 'all') return 'all';
    const normSel = normBeat(beatFilter);
    return beats.find((x) => x.id === beatFilter || normBeat(x.name) === normSel)?.id || '';
  }, [beatFilter, beats]);

  const billMatchesBeat = (b: Bill, filterVal: string) => {
    if (filterVal === 'all') return true;
    if (!selectedBeatId) return false;
    return beatResolver.beatIdFor(b.retailer, b.phone, b.customerId) === selectedBeatId;
  };

  const todayStr = todayISO();
  const sevenDaysCutoff = useMemo(() => {
    const d = new Date(`${todayStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 6);
    return d.toISOString().slice(0, 10);
  }, [todayStr]);

  // Filter bills based on search, payment status, salesman, beat, and (on phone) date window
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      if (isPhone && dateWindow !== 'all') {
        const bDate = String(b.date || '').slice(0, 10);
        if (dateWindow === 'today' && bDate !== todayStr) return false;
        if (dateWindow === '7d' && (!bDate || bDate < sevenDaysCutoff)) return false;
      }
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        b.retailer.toLowerCase().includes(q) ||
        (b.phone && b.phone.includes(q)) ||
        String(b.id).includes(q) ||
        (b.docNo || '').toLowerCase().includes(q) ||
        formatBillNumber(b, billingSettings).toLowerCase().includes(q) ||
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

      const matchesBeat = billMatchesBeat(b, beatFilter);

      return matchesSearch && matchesPayment && matchesSalesman && matchesBeat;
    });
  }, [bills, salesmen, beatResolver, selectedBeatId, billingSettings, searchQuery, paymentFilter, salesmanFilter, beatFilter, isPhone, dateWindow, todayStr, sevenDaysCutoff]);

  // Overall statistics (respecting beat filter if active)
  const stats = useMemo(() => {
    const relevantBills = beatFilter === 'all' ? bills : bills.filter((b) => billMatchesBeat(b, beatFilter));

    const totalCount = relevantBills.length;
    const totalBilled = relevantBills.reduce((sum, b) => sum + b.total, 0);
    const totalPaid = relevantBills.reduce((sum, b) => sum + b.amountPaid, 0);
    const totalDue = Math.max(0, totalBilled - totalPaid);
    const pendingCount = relevantBills.filter((b) => billBalance(b) > 0).length;
    const paidCount = relevantBills.filter((b) => billBalance(b) <= 0).length;
    return { totalCount, totalBilled, totalPaid, totalDue, pendingCount, paidCount };
  }, [bills, beatResolver, selectedBeatId, beatFilter]);

  // Status breakdown counts (respecting search, salesman, and beat filters)
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

      const matchesBeat = billMatchesBeat(b, beatFilter);

      return matchesSearch && matchesSalesman && matchesBeat;
    });

    const all = base.length;
    const pending = base.filter((b) => billBalance(b) > 0).length;
    const paid = base.filter((b) => billBalance(b) <= 0).length;
    return { all, pending, paid };
  }, [bills, salesmen, beatResolver, selectedBeatId, searchQuery, salesmanFilter, beatFilter]);

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
      {isPhone ? (
        <>
          {/* 1. Search Pill + Beat Filter */}
          <div className="space-y-2.5 pt-1">
            <div ref={beatMenuRef} className="relative">
              <div className="rt-sale-search border border-[var(--border)]">
                <Search size={16} className="rt-sale-search__icon" aria-hidden="true" />
                <input
                  enterKeyHint="search"
                  id="history-search-input"
                  type="text"
                  placeholder={t('sell.billNoOrCustomer')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rt-sale-search__input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="rt-sale-search__btn"
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
                {activeBeats.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBeatMenuOpen((v) => !v)}
                    aria-label="Filter by beat"
                    aria-expanded={beatMenuOpen}
                    className={`rt-sale-search__btn ${beatFilter !== 'all' ? 'rt-sale-search__btn--active' : ''}`}
                    title="Filter by beat"
                  >
                    <Route size={16} />
                  </button>
                )}
              </div>

              {beatMenuOpen && activeBeats.length > 0 && (
                <div
                  role="listbox"
                  aria-label="Choose beat"
                  className="rt-card !p-2 absolute left-0 right-0 top-full mt-1.5 z-40 space-y-1 max-h-72 overflow-y-auto"
                >
                  <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">
                    {t('sell.beat')}
                  </div>
                  <button
                    type="button"
                    role="option"
                    aria-selected={beatFilter === 'all'}
                    onClick={() => {
                      setBeatFilter('all');
                      setBeatMenuOpen(false);
                    }}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-[var(--r-card)] text-left text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer ${
                      beatFilter === 'all'
                        ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                        : 'text-[var(--text)] hover:bg-[var(--bg)]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Route className="w-3.5 h-3.5 shrink-0" />
                      <span>All beats</span>
                    </span>
                    {beatFilter === 'all' && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                  {activeBeats.map((b) => {
                    const selected = beatFilter.toLowerCase() === b.name.toLowerCase();
                    return (
                      <button
                        key={b.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setBeatFilter(b.name);
                          setBeatMenuOpen(false);
                        }}
                        className={`w-full min-h-[44px] px-3 py-2 rounded-[var(--r-card)] text-left text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer ${
                          selected
                            ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                            : 'text-[var(--text)] hover:bg-[var(--bg)]'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Route className="w-3.5 h-3.5 shrink-0" />
                          <span className="break-words">{b.name}</span>
                        </span>
                        {selected && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Quick Date/Status & Grouping Filter Chips */}
            <div className="rt-chips !px-0 !py-0" role="group" aria-label="Filter and group sales history">
              <button
                type="button"
                aria-pressed={dateWindow === 'today'}
                onClick={() => setDateWindow((w) => (w === 'today' ? 'all' : 'today'))}
                className="rt-chip"
              >
                {t('sell.today')}
              </button>
              <button
                type="button"
                aria-pressed={dateWindow === '7d'}
                onClick={() => setDateWindow((w) => (w === '7d' ? 'all' : '7d'))}
                className="rt-chip"
              >
                {t('sell.sevenDays')}
              </button>
              <button
                type="button"
                id="filter-pending-bills"
                aria-pressed={paymentFilter === 'pending'}
                onClick={() => setPaymentFilter((p) => (p === 'pending' ? 'all' : 'pending'))}
                className="rt-chip"
              >
                {t('sell.unpaid')}
              </button>
              <button
                type="button"
                id="filter-all-bills"
                aria-pressed={dateWindow === 'all' && paymentFilter === 'all' && grouping === 'table'}
                onClick={() => {
                  setDateWindow('all');
                  setPaymentFilter('all');
                  setBeatFilter('all');
                  setGrouping('table');
                }}
                className="rt-chip"
              >
                {t('sell.sizeAll')}
              </button>
              <button
                type="button"
                id="tab-view-date"
                aria-pressed={grouping === 'date'}
                onClick={() => setGrouping((g) => (g === 'date' ? 'table' : 'date'))}
                className="rt-chip"
              >
                <Calendar size={14} className="shrink-0" />
                <span>{t('sell.dates')}</span>
              </button>
              <button
                type="button"
                id="tab-view-customer"
                aria-pressed={grouping === 'customer'}
                onClick={() => setGrouping((g) => (g === 'customer' ? 'table' : 'customer'))}
                className="rt-chip"
              >
                <Users size={14} className="shrink-0" />
                <span>{t('sell.customer')}</span>
              </button>
            </div>
          </div>

          {/* Empty State (Phone) */}
          {filteredBills.length === 0 && (
            <div className="rt-card text-center py-8 space-y-3">
              <h3 className="text-base font-bold text-[var(--text)]">No invoices found</h3>
              <p className="text-sm text-[var(--text-2)]">
                {beatFilter !== 'all'
                  ? `No invoices match Beat "${beatFilter}".`
                  : 'Create your first sale to see it here.'}
              </p>
              {onNewInvoiceClick && (
                <button
                  type="button"
                  onClick={onNewInvoiceClick}
                  className="rt-btn"
                >
                  {t('shortcut.newSale')}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* 1. Interactive KPI Summary Cards (Tablet/Desktop) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {/* All Invoices Card */}
            <button
              type="button"
              id="filter-all-bills"
              onClick={() => setPaymentFilter('all')}
              data-card-tone="sales"
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group select-none ${
                paymentFilter === 'all'
                  ? 'ring-2 ring-blue-600/35 shadow-md'
                  : 'shadow-xs hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--blue">
                    <Receipt size={15} />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900/80">
                    All Invoices
                  </span>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono transition-colors ${
                    paymentFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white/80 text-blue-800 border border-blue-200/80'
                  }`}
                >
                  {statusCounts.all}
                </span>
              </div>
              <div className="font-mono text-lg font-black text-slate-900 tabular-nums">
                ₹{money(stats.totalBilled)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Total sales value ({bills.length} total bills)
              </div>
            </button>

            {/* Pending Due Card (Red) */}
            <button
              type="button"
              id="filter-pending-bills"
              onClick={() => setPaymentFilter('pending')}
              data-card-tone="due"
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group select-none ${
                paymentFilter === 'pending'
                  ? 'ring-2 ring-rose-600/35 shadow-md'
                  : 'shadow-xs hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--rose">
                    <AlertCircle size={15} />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                    Pending Due
                  </span>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono transition-colors ${
                    paymentFilter === 'pending' ? 'bg-rose-600 text-white' : 'bg-white/80 text-rose-700 border border-rose-200/80'
                  }`}
                >
                  {statusCounts.pending}
                </span>
              </div>
              <div className="font-mono text-lg font-black text-rose-600 tabular-nums">
                ₹{money(stats.totalDue)}
              </div>
              <div className="text-[11px] text-rose-700/80 mt-0.5">
                Pending customer collections
              </div>
            </button>

            {/* Settled / Paid Card (Green) */}
            <button
              type="button"
              id="filter-paid-bills"
              onClick={() => setPaymentFilter('paid')}
              data-card-tone="received"
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group select-none ${
                paymentFilter === 'paid'
                  ? 'ring-2 ring-emerald-600/35 shadow-md'
                  : 'shadow-xs hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--green">
                    <CheckCircle2 size={15} />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Settled
                  </span>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full font-mono transition-colors ${
                    paymentFilter === 'paid' ? 'bg-emerald-600 text-white' : 'bg-white/80 text-emerald-800 border border-emerald-200/80'
                  }`}
                >
                  {statusCounts.paid}
                </span>
              </div>
              <div className="font-mono text-lg font-black text-emerald-700 tabular-nums">
                ₹{money(stats.totalPaid)}
              </div>
              <div className="text-[11px] text-emerald-800/80 mt-0.5">
                Settled collections
              </div>
            </button>
          </div>

          {/* 2. Unified Toolbar (Tablet/Desktop) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-3.5 shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Main View Mode Tabs */}
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shrink-0 shadow-2xs overflow-x-auto self-start sm:self-auto">
                <button
                  type="button"
                  id="tab-view-table"
                  onClick={() => setGrouping('table')}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
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
                  className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
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
                  className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
                    grouping === 'customer'
                      ? 'bg-[var(--primary)] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Users size={14} className="shrink-0" />
                  <span>Customer</span>
                </button>
              </div>

              {/* Full-width Search Bar */}
              <div ref={beatMenuRef} className="relative flex-1 min-w-[220px] max-w-xl">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  enterKeyHint="search"
                  id="history-search-input"
                  type="text"
                  placeholder="Search invoices, customer, item, beat..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-10 py-2 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] focus:bg-white transition-all shadow-2xs ${
                    activeBeats.length > 0
                      ? searchQuery
                        ? 'pr-20 md:pr-9'
                        : 'pr-12 md:pr-3'
                      : searchQuery
                        ? 'pr-9'
                        : 'pr-3'
                  }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className={`absolute top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer ${
                      activeBeats.length > 0 ? 'right-11 md:right-2.5' : 'right-2.5'
                    }`}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Beat Route Filter Strip (desktop) */}
            {activeBeats.length > 0 && (
              <div className="hidden md:flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100 text-xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
                  <Truck size={13} className="text-indigo-600 shrink-0" />
                  <span>Beat:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setBeatFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                    beatFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All Beats
                </button>
                {activeBeats.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBeatFilter(b.name)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                      beatFilter.toLowerCase() === b.name.toLowerCase()
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
                {beatFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setBeatFilter('all')}
                    className="text-xs text-rose-600 hover:underline shrink-0 ml-1 font-semibold cursor-pointer"
                  >
                    Clear Beat Filter
                  </button>
                )}
              </div>
            )}

            {/* Live Filter Feedback Strip */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium flex-wrap gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-800">
                  Showing {filteredBills.length}
                </span>
                <span className="text-slate-400">of</span>
                <span className="text-slate-600">{bills.length} total bills</span>
                {beatFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Beat: {beatFilter}
                    <button aria-label="Remove beat filter"
                      type="button"
                      onClick={() => setBeatFilter('all')}
                      className="text-indigo-400 hover:text-indigo-700 cursor-pointer ml-0.5"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {paymentFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                    Filter: {paymentFilter.toUpperCase()}
                    <button aria-label="Remove payment filter"
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
                <span className="font-mono font-bold text-slate-900 whitespace-nowrap">
                  ₹{money(filteredBills.reduce((s, b) => s + b.total, 0))}
                </span>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {filteredBills.length === 0 && (
            <div data-card-tone="neutral" className="rounded-2xl border shadow-xs px-6 py-12 text-center">
              <h3 className="text-base font-bold text-slate-900">No invoices found</h3>
              <p className="text-sm text-slate-500 mt-1.5">
                {beatFilter !== 'all'
                  ? `No invoices match Beat "${beatFilter}".`
                  : 'Create your first sale to see it here.'}
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
        </>
      )}

      {/* =========================================================================
          VIEW MODE 1: Invoices (Clean Table UI with Edit, Share, Delete)
          ========================================================================= */}
      {filteredBills.length > 0 && grouping === 'table' && (
        <>
          {/* Desktop & Tablet Table View (Guaranteed min-width prevents columns from squeezing) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-x-auto">
            <table className="w-full min-w-[700px] text-left border-collapse table-auto">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="py-3.5 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap w-[130px] shrink-0">
                    ITEM
                  </th>
                  <th className="py-3.5 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-[200px]">
                    DETAILS
                  </th>
                  <th className="py-3.5 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap w-[120px] shrink-0">
                    VALUE
                  </th>
                  <th className="py-3.5 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap w-[100px] shrink-0">
                    STATUS
                  </th>
                  <th className="py-3.5 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right whitespace-nowrap w-[170px] shrink-0">
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBills.map((b) => {
                  const due = billBalance(b);
                  const isPaid = due <= 0.01;
                  const itemLabel = formatBillNumber(b, billingSettings);
                  const isNg = isGstExcludedBill(b, products);
                  const totalCases = (b.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
                  const itemCount = (b.items || []).length;
                  const cust = (customers || []).find(
                    (c) => c.id === b.customerId || c.name.toLowerCase() === b.retailer.toLowerCase()
                  );
                  const custBeat = cust?.route || cust?.city;

                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-slate-50/80 transition-colors group select-none"
                    >
                      <td className="py-3.5 px-4 text-sm font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
                          <button
                            type="button"
                            onClick={() => onViewInvoice(b)}
                            className="font-mono text-xs font-bold text-[var(--primary)] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                            title={isNg ? 'Click to view Non-GST cash memo' : 'Click to view invoice'}
                          >
                            #{itemLabel}
                          </button>
                          {isNg && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-teal-300 bg-teal-50 text-teal-800 uppercase tracking-wider whitespace-nowrap shrink-0"
                              title="Non-GST Trading Memo (0% Tax · Excluded from GST Returns)"
                            >
                              Non-GST
                            </span>
                          )}
                          {b.customerGstin && !isNg && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-900 uppercase tracking-wider whitespace-nowrap shrink-0"
                              title={`Registered GSTIN: ${b.customerGstin}`}
                            >
                              B2B
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-sm text-slate-600 font-normal">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900">{b.retailer || 'Cash customer'}</span>
                          {custBeat && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-sky-50 text-sky-800 border border-sky-200 whitespace-nowrap shrink-0">
                              {custBeat}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 whitespace-nowrap">
                          {b.date} · {totalCases} cs · {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-sm font-bold text-slate-900 font-mono tabular-nums whitespace-nowrap">
                        ₹{money(b.total)}
                      </td>
                      <td className="py-3.5 px-4 text-sm whitespace-nowrap">
                        <span className={`font-semibold text-xs whitespace-nowrap ${isPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                          {isPaid ? 'Paid' : `Due: ₹${money(due)}`}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-sm text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap shrink-0">
                          <button
                            type="button"
                            onClick={() => onEditBill(b)}
                            disabled={(b.returns || []).length > 0}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                            title="Edit this invoice"
                          >
                            <Pencil size={12} className="shrink-0" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onViewInvoice(b)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            title="Share or View invoice"
                          >
                            <Share2 size={12} className="shrink-0" />
                            <span>Share</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteBill(b)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                            title="Delete bill"
                          >
                            <Trash2 size={14} className="shrink-0" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Flat Token Cards View (<768px) */}
          <div className="md:hidden space-y-2.5">
            {filteredBills.map((b) => {
              const due = billBalance(b);
              const isPaid = due <= 0.01;
              const isPartial = !isPaid && due < b.total - 0.01 && (b.amountPaid || 0) > 0.01;
              const itemLabel = formatBillNumber(b, billingSettings);
              const totalCases = (b.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
              const retailerName = b.retailer || t('sell.walkInSale');
              const modeLabel =
                b.paymentMode === 'upi'
                  ? t('sell.upi')
                  : b.paymentMode === 'credit'
                    ? t('sell.credit')
                    : t('sell.cash');

              return (
                <div
                  key={b.id}
                  className={`hh-hist-card ${
                    isPaid
                      ? 'hh-hist-card--paid'
                      : isPartial
                        ? 'hh-hist-card--partial'
                        : 'hh-hist-card--due'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onViewInvoice(b)}
                    className="w-full flex items-start justify-between gap-2.5 text-left cursor-pointer min-h-[44px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold text-[var(--text)] break-words leading-snug">
                        #{itemLabel} · {retailerName}
                      </div>
                      <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 tabular-nums">
                        {b.date} · {modeLabel}
                      </div>
                    </div>
                    <div className="text-[14px] font-extrabold text-[var(--text)] tabular-nums shrink-0">
                      ₹{money(b.total)}
                    </div>
                  </button>

                  {isPartial ? (
                    <div className="rt-three mt-2.5 pt-2.5">
                      <div className="rt-three__item">
                        <span className="rt-three__label">{t('sell.paid')}</span>
                        <span className="rt-three__val text-[var(--paid)]">
                          ₹{money(b.amountPaid || 0)}
                        </span>
                      </div>
                      <div className="rt-three__item">
                        <span className="rt-three__label">{t('sell.balance')}</span>
                        <span className="rt-three__val rt-three__val--due">
                          ₹{money(due)}
                        </span>
                      </div>
                      <div className="rt-three__item">
                        <span className="rt-three__label">Cases</span>
                        <span className="rt-three__val">{totalCases}</span>
                      </div>
                    </div>
                  ) : isPaid ? (
                    <div className="mt-2">
                      <span className="rt-tag rt-tag--paid">{t('sell.paid')}</span>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 mt-2.5">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(b)}
                        className="rt-btn-outline flex-1 !px-2 text-xs"
                      >
                        {t('sell.view')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewInvoice(b)}
                        className="rt-btn-outline flex-1 !px-2 text-xs"
                      >
                        {t('sell.share')}
                      </button>
                      <button
                        type="button"
                        onClick={() => _onCancelBill(b)}
                        className="rt-btn-outline rt-btn-outline--due flex-1 !px-2 text-xs"
                      >
                        {t('sell.cancel')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* =========================================================================
          VIEW MODE 2: Dates (Date header with Total & Due below Date, then Bills & Items)
          ========================================================================= */}
      {filteredBills.length > 0 && grouping === 'date' && (
        <div className={isPhone ? 'hh-history-phone space-y-2.5' : 'space-y-3'}>
          {dateGroups.map((group, idx) => {
            const expanded = isExpanded(group.key, idx === 0);
            return (
              <div
                key={group.key}
                data-card-tone={group.totalDue > 0 ? 'warning' : 'received'}
                className="rounded-2xl border shadow-xs overflow-hidden"
              >
                {/* Date Card Header: Line 1 Date, Line 2 Total & Due, Line 3 Bills & Items */}
                <button
                  type="button"
                  onClick={() => toggleExpand(group.key)}
                  className="w-full p-3.5 sm:px-4 sm:py-3.5 text-left transition-colors cursor-pointer select-none border-b border-black/5 space-y-1.5"
                >
                  {/* Line 1: Date & Chevron */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`hh-icon-badge hh-icon-badge--sm ${
                          group.totalDue > 0 ? 'hh-icon-badge--amber' : 'hh-icon-badge--green'
                        }`}
                      >
                        <Calendar size={15} />
                      </span>
                      <span className="font-bold text-sm sm:text-base text-slate-900">{group.label}</span>
                    </div>
                    {expanded ? (
                      <ChevronUp size={16} className="text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-500 shrink-0" />
                    )}
                  </div>

                  {/* Line 2: Total & Due (below Date, before Bills & Items) */}
                  <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap text-xs sm:text-sm font-bold">
                    <span className="text-slate-900 font-mono tabular-nums">
                      Total: ₹{money(group.totalBilled)}
                    </span>
                    {group.totalDue > 0 ? (
                      <span className="text-rose-700 bg-white/85 border border-rose-200 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums">
                        Due: ₹{money(group.totalDue)}
                      </span>
                    ) : (
                      <span className="text-emerald-700 bg-white/85 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-bold">
                        Paid
                      </span>
                    )}
                  </div>

                  {/* Line 3: Bills and Items Count */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/75 text-slate-700 border border-black/5">
                      {group.bills.length} {group.bills.length === 1 ? 'bill' : 'bills'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/75 text-slate-600 border border-black/5">
                      {group.totalItems} {group.totalItems === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </button>

                {/* Expanded Invoices List */}
                {expanded && (
                  <div className="bg-white/85 divide-y divide-black/5">
                    {group.bills.map((bill) => {
                      const due = billBalance(bill);
                      const isPaid = due <= 0.01;
                      const itemLabel = formatBillNumber(bill, billingSettings);
                      const isNg = isGstExcludedBill(bill, products);
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
                              {isNg && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded border border-teal-300 bg-teal-50 text-teal-800 uppercase tracking-wider">
                                  Non-GST
                                </span>
                              )}
                              {bill.customerGstin && !isNg && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded border border-amber-300 bg-amber-50 text-amber-900 uppercase tracking-wider">
                                  B2B
                                </span>
                              )}
                              <span className="text-xs text-slate-800 font-semibold min-w-0 break-words lg:truncate">
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
                                className="hh-history-action inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
                                title="Edit this invoice"
                              >
                                <Pencil size={12} />
                                <span>Edit</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onViewInvoice(bill)}
                                className="hh-history-action inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                                title="Share or View this invoice"
                              >
                                <Share2 size={12} />
                                <span>Share</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onDeleteBill(bill)}
                                className="hh-history-delete p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
        <div className={isPhone ? 'hh-history-phone space-y-2.5' : 'space-y-3'}>
          {customerGroups.map((group, idx) => {
            const expanded = isExpanded(group.key, idx === 0);
            return (
              <div
                key={group.key}
                data-card-tone={group.totalDue > 0 ? 'due' : 'received'}
                className="rounded-2xl border shadow-xs overflow-hidden"
              >
                {/* Customer Card Header: Line 1 Name, Line 2 Total & Due, Line 3 Invoices */}
                <button
                  type="button"
                  onClick={() => toggleExpand(group.key)}
                  className="w-full p-3.5 sm:px-4 sm:py-3.5 text-left transition-colors cursor-pointer select-none border-b border-black/5 space-y-1.5"
                >
                  {/* Line 1: Customer Name & Chevron */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`hh-avatar hh-avatar--sm ${
                          group.totalDue > 0 ? 'hh-avatar--rose' : 'hh-avatar--green'
                        }`}
                      >
                        {getInitials(group.name, 'C')}
                      </span>
                      <span className="font-bold text-sm sm:text-base text-slate-900 break-words">
                        {group.name}
                      </span>
                    </div>
                    {expanded ? (
                      <ChevronUp size={16} className="text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-500 shrink-0" />
                    )}
                  </div>

                  {/* Line 2: Total & Due (below Name, before Invoices count) */}
                  <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap text-xs sm:text-sm font-bold">
                    <span className="text-slate-900 font-mono tabular-nums">
                      Total: ₹{money(group.totalBilled)}
                    </span>
                    {group.totalDue > 0 ? (
                      <span className="text-rose-700 bg-white/85 border border-rose-200 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums">
                        Due: ₹{money(group.totalDue)}
                      </span>
                    ) : (
                      <span className="text-emerald-700 bg-white/85 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-bold">
                        Paid
                      </span>
                    )}
                  </div>

                  {/* Line 3: Invoices Count */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/75 text-slate-700 border border-black/5">
                      {group.bills.length} {group.bills.length === 1 ? 'invoice' : 'invoices'}
                    </span>
                  </div>
                </button>

                {/* Expanded Invoices List */}
                {expanded && (
                  <div className="bg-white/85 divide-y divide-black/5">
                    {group.bills.map((bill) => {
                      const due = billBalance(bill);
                      const isPaid = due <= 0.01;
                      const itemLabel = formatBillNumber(bill, billingSettings);
                      const isNg = isGstExcludedBill(bill, products);
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
                              {isNg && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded border border-teal-300 bg-teal-50 text-teal-800 uppercase tracking-wider">
                                  Non-GST
                                </span>
                              )}
                              {bill.customerGstin && !isNg && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded border border-amber-300 bg-amber-50 text-amber-900 uppercase tracking-wider">
                                  B2B
                                </span>
                              )}
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
                                className="hh-history-action inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
                                title="Edit this invoice"
                              >
                                <Pencil size={12} />
                                <span>Edit</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onViewInvoice(bill)}
                                className="hh-history-action inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                                title="Share or View this invoice"
                              >
                                <Share2 size={12} />
                                <span>Share</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onDeleteBill(bill)}
                                className="hh-history-delete p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
