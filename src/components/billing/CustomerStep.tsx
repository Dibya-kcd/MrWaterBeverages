import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Mail,
  MapPin,
  Phone,
  Plus,
  Route,
  Search,
  Star,
  Store,
  Truck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { Bill, Customer, ExistingCustomer, PaymentRecord } from '../../types';
import type { BeatRoute } from '../../constants/beats';
import { beatOfCustomer } from '../../utils/beats';
import { normCustName } from '../../context/ledgerHelpers';
import { effectiveBillBalances, OVERDUE_AFTER_DAYS } from '../../utils/beatReports';
import { todayISO } from '../../utils/dateLocal';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useLanguage } from '../../i18n/LanguageContext';
import { buildRichCustomerOptions, extractCustomerPrefill, RichCustomerOption } from './CustomerPredictiveSearch';
import { getInitials } from '../ui/HomeKit';

/**
 * New Sale — pick (or add) the retailer.
 *
 * Read-only on data: it only lists customers and calls the handlers the parent passes in.
 *  - below 768px: one card per retailer; tapping a card selects it and moves on.
 *  - 768px and up: list on the left, preview panel on the right; "Start Order" moves on.
 */
export interface CustomerStepProps {
  /** Already narrowed by the parent's beat filter. */
  customers: Customer[];
  existingCustomers: ExistingCustomer[];
  beats: BeatRoute[];
  activeBeats: BeatRoute[];
  selectedBeatFilter: string; // kept for parent compatibility
  onBeatFilterChange: (beatName: string) => void;
  bills: Bill[];
  payments: PaymentRecord[];
  onSelectCustomer: (c: RichCustomerOption) => void;
  onSelectSpotSale: () => void;
  onOpenCreateCustomer: (prefill: { name?: string; phone?: string; email?: string; gstin?: string }) => void;
  onBack?: () => void;
  /** Rendered inside the top controls card above the search bar (sale source + date). */
  contextBar?: React.ReactNode;
  /** Route / beat names of today's active trips; drives the "Today's Route" card. */
  todayRoutes?: string[];
  /** Trip the order will be sold from, shown on the tablet "Start Order" button, e.g. "#TRP-104". */
  tripLabel?: string;
  /** Compact summary of the active stock source & bill date for the Step 1 Order setup card. */
  stockSummary?: {
    source: 'trip' | 'warehouse';
    label: string;
    dateLabel: string;
    isBackDated?: boolean;
  };
  /** Active cart case count when user returns to Step 1 mid-order. */
  cartItemCount?: number;
  /** Cancels the entire current order & clears cart/customer selections. */
  onCancelSale?: () => void;
}

type QuickFilter = 'all' | 'today_route' | 'overdue' | 'recent' | 'favorites';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
const MAX_ROWS = 100;
const FAV_STORAGE_KEY = 'hh_favorite_retailers_v1';

const isLive = (b: Bill): boolean => b.status !== 'cancelled' && !b.cancelled && !(b as any).cancellation;
const daysBetween = (fromIso: string, toIso: string): number => {
  const a = Date.parse(`${fromIso}T12:00:00Z`);
  const b = Date.parse(`${toIso}T12:00:00Z`);
  return isNaN(a) || isNaN(b) ? 0 : Math.round((b - a) / 86400000);
};
const shortDate = (iso?: string): string => {
  const t = Date.parse(String(iso || '').slice(0, 10));
  return isNaN(t) ? '' : new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

const loadFavoriteKeys = (): string[] => {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const favKeyOf = (o: RichCustomerOption): string =>
  o.id ? `id:${o.id}` : `n:${normCustName(o.name)}`;

interface Row {
  o: RichCustomerOption;
  beat: string;
  due: number;
  limit: number;
  overdue: boolean;
  gst: boolean;
}

const DueText: React.FC<{ due: number }> = ({ due }) =>
  due > 0.004 ? (
    <span className="hh-customer-due bg-red-50 text-red-700 font-bold rounded-lg px-2 py-0.5 text-xs whitespace-nowrap tabular-nums">
      Due ₹{due.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
    </span>
  ) : (
    <span className="hh-customer-due--paid text-[#15803D] font-bold text-xs whitespace-nowrap tabular-nums">
      Due ₹0
    </span>
  );

const GstBadge: React.FC = () => (
  <span
    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-[#15803D] text-xs font-semibold px-2 py-0.5"
    title="A GSTIN is on file for this retailer"
  >
    <BadgeCheck className="w-3.5 h-3.5" /> GST registered
  </span>
);

export const CustomerStep: React.FC<CustomerStepProps> = ({
  customers,
  existingCustomers,
  beats,
  selectedBeatFilter,
  onBeatFilterChange,
  bills,
  payments,
  onSelectCustomer,
  onSelectSpotSale,
  onOpenCreateCustomer,
  contextBar,
  todayRoutes = [],
  tripLabel,
  stockSummary,
  cartItemCount = 0,
  onCancelSale,
}) => {
  const isMobile = useIsMobile(767); // < 768px
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('all');
  const [previewId, setPreviewId] = useState<string>('');
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => loadFavoriteKeys());
  const [showSetup, setShowSetup] = useState(false);

  const favoriteSet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);

  const toggleFavorite = (o: RichCustomerOption) => {
    const key = favKeyOf(o);
    setFavoriteKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore storage quota errors */
      }
      return next;
    });
  };

  // Customers who still owe on an invoice older than the app's overdue limit (same rule as the Beat report).
  const overdueKeys = useMemo(() => {
    const keys = new Set<string>();
    const bal = effectiveBillBalances(bills || [], payments || []);
    const today = todayISO();
    for (const b of bills || []) {
      if (!isLive(b)) continue;
      const d = String(b.date || '').slice(0, 10);
      if ((bal.get(b.id) || 0) > 0.004 && d && daysBetween(d, today) > OVERDUE_AFTER_DAYS) {
        if (b.customerId) keys.add(`id:${b.customerId}`);
        keys.add(`n:${normCustName(b.retailer)}`);
      }
    }
    return keys;
  }, [bills, payments]);

  const rows = useMemo<Row[]>(() => {
    const masterById = new Map((customers || []).map((c) => [c.id, c] as const));
    return buildRichCustomerOptions(customers, existingCustomers).map((o) => {
      const master = masterById.get(o.id);
      const beat = (master && beatOfCustomer(master, beats)?.name) || o.route || o.city || '';
      const due = Math.max(0, Number(o.balanceDue) || 0);
      return {
        o,
        beat,
        due,
        limit: Math.max(0, Number(o.creditLimit) || 0),
        overdue: due > 0.004 && (overdueKeys.has(`id:${o.id}`) || overdueKeys.has(`n:${normCustName(o.name)}`)),
        gst: GSTIN_RE.test((o.gstin || '').trim()),
      };
    });
  }, [customers, existingCustomers, beats, overdueKeys]);

  const lastBillDateMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bills || []) {
      if (!isLive(b)) continue;
      const d = String(b.date || '').slice(0, 10);
      if (!d) continue;
      if (b.customerId) {
        const prev = map.get(`id:${b.customerId}`);
        if (!prev || d > prev) map.set(`id:${b.customerId}`, d);
      }
      const nk = `n:${normCustName(b.retailer)}`;
      const prevN = map.get(nk);
      if (!prevN || d > prevN) map.set(nk, d);
    }
    return map;
  }, [bills]);

  const lastDateOf = (o: RichCustomerOption): string =>
    lastBillDateMap.get(`id:${o.id}`) || lastBillDateMap.get(`n:${normCustName(o.name)}`) || '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = rows.filter((r) => {
      if (activeFilter === 'overdue' && !r.overdue && r.due <= 0.004) return false;
      if (activeFilter === 'recent' && !lastDateOf(r.o)) return false;
      if (activeFilter === 'favorites' && !favoriteSet.has(favKeyOf(r.o))) return false;
      if (activeFilter === 'today_route') {
        const b = r.beat.trim().toLowerCase();
        if (!b || !todayRoutes.some((t) => {
          const tr = t.trim().toLowerCase();
          return tr && (tr.includes(b) || b.includes(tr));
        })) return false;
      }
      if (!q) return true;
      const o = r.o;
      return (
        o.name.toLowerCase().includes(q) ||
        r.beat.toLowerCase().includes(q) ||
        (o.city || '').toLowerCase().includes(q) ||
        (o.address || '').toLowerCase().includes(q) ||
        (o.gstin || '').toLowerCase().includes(q) ||
        (o.phone || '').toLowerCase().includes(q) ||
        (o.altPhone || '').toLowerCase().includes(q) ||
        (digits.length > 0 &&
          ((o.phone || '').replace(/\D/g, '').includes(digits) || (o.altPhone || '').replace(/\D/g, '').includes(digits)))
      );
    });
    if (activeFilter === 'recent') {
      return [...list].sort((a, b) => lastDateOf(b.o).localeCompare(lastDateOf(a.o)));
    }
    return list;
  }, [rows, query, activeFilter, favoriteSet, todayRoutes, lastBillDateMap]);

  const shown = filtered.slice(0, MAX_ROWS);
  const preview = useMemo(() => rows.find((r) => r.o.id === previewId) || null, [rows, previewId]);

  const recentOrders = useMemo(() => {
    if (!preview) return [] as Bill[];
    const nk = normCustName(preview.o.name);
    return (bills || [])
      .filter((b) => isLive(b) && (b.customerId === preview.o.id || normCustName(b.retailer) === nk))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id)
      .slice(0, 3);
  }, [preview, bills]);

  const clearAll = () => {
    setQuery('');
    setActiveFilter('all');
    if (selectedBeatFilter !== 'all') onBeatFilterChange('all');
  };

  const selectFilter = (next: QuickFilter) => {
    if (selectedBeatFilter !== 'all') onBeatFilterChange('all');
    setActiveFilter((prev) => (prev === next && next !== 'all' ? 'all' : next));
  };

  const handleCard = (r: Row) => {
    if (isMobile) onSelectCustomer(r.o);
    else setPreviewId(r.o.id);
  };

  const filterCardCls = (on: boolean, activeTone: 'green' | 'blue' | 'orange' | 'navy') => {
    if (!on) {
      return 'hh-customer-filter min-h-[68px] sm:min-h-[76px] px-1 py-2 rounded-2xl bg-white border border-[#DCE5F2] text-[#0A1F44] hover:bg-[#F5F8FD] shadow-2xs flex flex-col items-center justify-center gap-1 cursor-pointer transition-all';
    }
    const tones = {
      green: 'bg-gradient-to-b from-[#1DB050] to-[#0E8636] border-[#129640] shadow-md shadow-emerald-700/20',
      blue: 'bg-gradient-to-b from-[#1A63DB] to-[#0D47A1] border-[#1557C0] shadow-md shadow-blue-700/20',
      orange: 'bg-gradient-to-b from-[#F97316] to-[#DC5807] border-[#EA580C] shadow-md shadow-orange-700/20',
      navy: 'bg-gradient-to-b from-[#0D3984] to-[#082458] border-[#0A2C6B] shadow-md shadow-slate-900/20',
    };
    return `hh-customer-filter min-h-[68px] sm:min-h-[76px] px-1 py-2 rounded-2xl border text-white! flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${tones[activeTone]}`;
  };

  const formatVisitAgo = (dateIso?: string): string => {
    if (!dateIso) return '';
    const diff = daysBetween(dateIso, todayISO());
    if (diff <= 0) return t('sell.today').toLowerCase();
    if (diff === 1) return t('sell.dayAgo');
    if (diff < 30) return t('sell.daysAgo', { n: diff });
    return shortDate(dateIso);
  };

  if (isMobile) {
    const qTrim = query.trim();
    const filterItems: { id: QuickFilter; label: string }[] = [
      { id: 'all', label: t('sell.sizeAll') },
      { id: 'overdue', label: t('sell.dueFilter') },
      { id: 'recent', label: t('sell.recentFilter') },
      { id: 'today_route', label: t('sell.routeFilter') },
    ];
    return (
      <div className="space-y-2.5 pt-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* 4-bar light progress + Step label */}
        <div className="space-y-1.5">
          <div className="rt-seg rt-seg--light" aria-hidden="true">
            <div className="rt-seg__bar rt-seg__bar--on" />
            <div className="rt-seg__bar" />
            <div className="rt-seg__bar" />
            <div className="rt-seg__bar" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="rt-stp rt-stp--muted">{t('sell.step1SelectCustomer')}</div>
            {cartItemCount > 0 && onCancelSale && (
              <button
                type="button"
                onClick={onCancelSale}
                className="min-h-[36px] px-3 rounded-full border border-[var(--due)]/30 bg-[var(--due-bg)] text-[var(--due)] text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <X size={13} strokeWidth={2.5} aria-hidden="true" />
                <span>{t('salesman.cancelSale')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Step 1 Order setup & Stock source card */}
        {contextBar && (
          <section
            className="rt-card !p-3 space-y-2.5"
            aria-label={t('sell.orderSetup')}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-2)]">
                  <span>{t('sell.orderSetup')}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('sell.stockSource')}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--text)] min-w-0">
                  {stockSummary?.source === 'trip' ? (
                    <Truck size={15} className="text-[var(--primary)] shrink-0" aria-hidden="true" />
                  ) : (
                    <Building2 size={15} className="text-[var(--primary)] shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">
                    {stockSummary?.label || tripLabel || t('sell.godown')}
                  </span>
                </div>
                {stockSummary?.dateLabel && (
                  <div
                    className={`flex items-center gap-1.5 text-[11.5px] font-semibold tabular-nums ${
                      stockSummary.isBackDated ? 'text-[var(--soon-text)]' : 'text-[var(--text-2)]'
                    }`}
                  >
                    <Calendar size={12} className="shrink-0" aria-hidden="true" />
                    <span>{stockSummary.dateLabel}</span>
                    {stockSummary.isBackDated && (
                      <span className="rt-tag rt-tag--soon">Back-dated</span>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowSetup((v) => !v)}
                aria-expanded={showSetup}
                className={`min-h-[44px] px-3 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors ${
                  showSetup
                    ? 'bg-[var(--text)] border-[var(--text)] text-[var(--surface)]'
                    : 'bg-[var(--bg)] border-[var(--border)] text-[var(--primary)]'
                }`}
              >
                <span>{showSetup ? t('sell.done') : t('sell.change')}</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${showSetup ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>

            {showSetup && (
              <div className="pt-2.5 border-t border-[var(--border)]">{contextBar}</div>
            )}
          </section>
        )}

        {/* Search pill */}
        <div className={`rt-sale-search border border-[var(--border)] ${qTrim ? 'rt-customer-search-active' : ''}`}>
          <Search size={16} className="rt-sale-search__icon" aria-hidden="true" />
          <input
            id="step1-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sell.namePhoneGstin')}
            autoComplete="off"
            className="rt-sale-search__input"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="rt-sale-search__btn"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* + Add new customer  |  ⚡ Walk-in sale */}
        <div className="rt-acts">
          <button
            type="button"
            onClick={() => onOpenCreateCustomer(extractCustomerPrefill(query))}
            className="rt-btn rt-acts__primary"
          >
            <Plus size={15} strokeWidth={2.75} className="shrink-0" />
            <span className="text-center leading-tight">{t('sell.addNewCustomer')}</span>
          </button>
          <button
            type="button"
            onClick={onSelectSpotSale}
            className="rt-btn-outline rt-acts__secondary"
          >
            <Zap size={14} className="shrink-0" />
            <span className="text-center leading-tight">{t('sell.walkInSale')}</span>
          </button>
        </div>

        {/* Horizontal filter chips */}
        <div className="rt-chips !px-0 !py-0" role="group" aria-label="Customer filters">
          {filterItems.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={activeFilter === f.id}
              onClick={() => selectFilter(f.id)}
              className="rt-chip"
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Customer List / Search Empty Dropdown */}
        {filtered.length === 0 ? (
          qTrim ? (
            <div className="rt-card !py-1.5 !px-3">
              <div className="rt-rowi !cursor-default">
                <span className="rt-ico" aria-hidden="true">
                  <Search size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-[var(--text)]">
                    {t('sell.noCustomerFound')}
                  </div>
                  <div className="text-[11.5px] text-[var(--text-2)] break-words">
                    {t('sell.nothingMatches', { q: qTrim })}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenCreateCustomer(extractCustomerPrefill(query))}
                className="rt-rowi"
              >
                <span className="rt-ico rt-ico--primary" aria-hidden="true">
                  <Plus size={17} strokeWidth={2.75} />
                </span>
                <span className="text-[13px] font-bold text-[var(--primary)] break-words flex-1 min-w-0">
                  {t('sell.addAsNewCustomer', { q: qTrim })}
                </span>
              </button>
              <button
                type="button"
                onClick={onSelectSpotSale}
                className="rt-rowi"
              >
                <span className="rt-ico" aria-hidden="true">
                  <Zap size={16} />
                </span>
                <span className="text-[13px] font-bold text-[var(--text)] break-words flex-1 min-w-0">
                  {t('sell.continueWalkIn')}
                </span>
              </button>
            </div>
          ) : (
            <div className="rt-card text-center py-6 space-y-3">
              <p className="text-sm font-semibold text-[var(--text)]">
                {activeFilter === 'today_route' && todayRoutes.length === 0
                  ? t('sell.noRouteCustomers')
                  : activeFilter === 'recent'
                    ? t('sell.noRecentCustomers')
                    : activeFilter === 'overdue'
                      ? t('sell.noDueCustomers')
                      : activeFilter === 'favorites'
                        ? t('sell.noFavCustomers')
                        : t('sell.noMatchingCustomers')}
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="rt-btn-outline"
              >
                {t('sell.showAllRetailers')}
              </button>
            </div>
          )
        ) : (
          <div className="rt-card !py-1 !px-3.5">
            {shown.map((r) => {
              const lastIso = lastDateOf(r.o);
              const visitLabel = formatVisitAgo(lastIso);
              const sub = [r.beat || r.o.city, visitLabel || r.o.address].filter(Boolean).join(' · ');
              return (
                <button
                  key={r.o.id}
                  type="button"
                  onClick={() => handleCard(r)}
                  className="rt-rowi !py-2.5"
                >
                  <span className="rt-ico" aria-hidden="true">
                    {getInitials(r.o.name, 'R')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug break-words">
                      {r.o.name}
                    </div>
                    {sub && (
                      <div className="text-[11.5px] text-[var(--text-2)] leading-snug break-words mt-0.5">
                        {sub}
                      </div>
                    )}
                  </div>
                  <span
                    className={`rt-amt text-[13.5px] ${
                      r.due > 0.004 ? 'text-[var(--due)]' : 'text-[var(--text)]'
                    }`}
                  >
                    ₹{Math.round(r.due).toLocaleString('en-IN')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="hh-customer-step pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {/* Unified Controls & Filter Card */}
      <div>
        <div data-card-tone="sales" className="rounded-2xl border shadow-sm p-2.5 sm:p-3.5 space-y-2.5 sm:space-y-3">
          {cartItemCount > 0 && onCancelSale && (
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/70">
              <span className="text-xs font-bold text-[#0A1F44]">
                Active cart ({cartItemCount} {cartItemCount === 1 ? 'case' : 'cases'})
              </span>
              <button
                type="button"
                onClick={onCancelSale}
                className="min-h-[36px] px-3 rounded-full border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('salesman.cancelSale')}</span>
              </button>
            </div>
          )}
          {contextBar}

          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#4A638D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="step1-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, beat or GSTIN"
              autoComplete="off"
              className="hh-customer-search w-full min-h-[46px] pl-10 pr-11 rounded-2xl border border-[#DCE5F2] bg-white text-[14.5px] text-[#0A1F44] placeholder:text-[#6B7F9E] focus:outline-none focus:border-[#1A63DB] focus:ring-2 focus:ring-[#1A63DB]/15 shadow-2xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-0 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-[#0A1F44] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Primary Actions: Add New Customer + Walk-in sale */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => onOpenCreateCustomer(extractCustomerPrefill(query))}
              className="hh-customer-add-btn flex-1 min-h-[42px] sm:min-h-[46px] px-2.5 sm:px-3.5 rounded-full bg-gradient-to-r from-[#19A84B] to-[#0D8A38] hover:from-[#159642] hover:to-[#0A752E] text-white! font-bold text-[11.5px] sm:text-[13.5px] inline-flex items-center justify-between gap-1 sm:gap-2 shadow-sm cursor-pointer transition-all active:scale-[0.99]"
            >
              <span className="inline-flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
                <span className="size-5 sm:size-6 rounded-full bg-white text-[#0D8A38] flex items-center justify-center shrink-0">
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                </span>
                <span>Add New Customer</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/90 shrink-0" />
            </button>

            <button
              type="button"
              onClick={onSelectSpotSale}
              className="hh-customer-walkin-btn min-h-[42px] sm:min-h-[46px] px-2.5 sm:px-3.5 rounded-full border border-[#DCE5F2] bg-white hover:bg-[#F5F8FD] text-[11.5px] sm:text-[13.5px] font-bold text-[#0A1F44] inline-flex items-center justify-center gap-1 sm:gap-1.5 shadow-2xs cursor-pointer shrink-0 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0A1F44] shrink-0" />
              <span className="whitespace-nowrap">Walk-in sale</span>
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#6B7F9E] shrink-0" />
            </button>
          </div>

          {/* 4 Square Filter Cards (horizontal pill chips on phone) */}
          <div className="hh-customer-filters grid grid-cols-4 gap-1.5 sm:gap-2" role="group" aria-label="Customer filters">
            <button
              type="button"
              onClick={() => selectFilter('all')}
              aria-pressed={activeFilter === 'all'}
              className={filterCardCls(activeFilter === 'all', 'green')}
            >
              <LayoutGrid
                className={`w-[18px] h-[18px] sm:w-5 sm:h-5 shrink-0 ${
                  activeFilter === 'all' ? 'text-white fill-white/25' : 'text-[#1A63DB]'
                }`}
              />
              <span className="text-[10.5px] sm:text-[11.5px] font-bold leading-tight text-center whitespace-nowrap">
                All
              </span>
              {activeFilter === 'all' && (
                <span className="hh-customer-filter-bar w-5 h-[2.5px] rounded-full bg-white/95" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => selectFilter('today_route')}
              aria-pressed={activeFilter === 'today_route'}
              className={filterCardCls(activeFilter === 'today_route', 'blue')}
            >
              <Route
                className={`w-[18px] h-[18px] sm:w-5 sm:h-5 shrink-0 ${
                  activeFilter === 'today_route' ? 'text-white' : 'text-[#1A63DB]'
                }`}
              />
              <span className="text-[10px] sm:text-[11.5px] font-bold leading-tight text-center whitespace-nowrap">
                Today&apos;s Route
              </span>
              {activeFilter === 'today_route' && (
                <span className="hh-customer-filter-bar w-5 h-[2.5px] rounded-full bg-white/95" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => selectFilter('overdue')}
              aria-pressed={activeFilter === 'overdue'}
              className={filterCardCls(activeFilter === 'overdue', 'orange')}
            >
              <AlertTriangle
                className={`w-[18px] h-[18px] sm:w-5 sm:h-5 shrink-0 ${
                  activeFilter === 'overdue' ? 'text-white' : 'text-[#EA6A10]'
                }`}
              />
              <span className="text-[10.5px] sm:text-[11.5px] font-bold leading-tight text-center whitespace-nowrap">
                Overdue
              </span>
              {activeFilter === 'overdue' && (
                <span className="hh-customer-filter-bar w-5 h-[2.5px] rounded-full bg-white/95" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => selectFilter('favorites')}
              aria-pressed={activeFilter === 'favorites'}
              className={filterCardCls(activeFilter === 'favorites', 'navy')}
            >
              <Star
                className={`w-[18px] h-[18px] sm:w-5 sm:h-5 shrink-0 ${
                  activeFilter === 'favorites' ? 'text-amber-300 fill-amber-300' : 'text-[#0A1F44]'
                }`}
              />
              <span className="text-[10.5px] sm:text-[11.5px] font-bold leading-tight text-center whitespace-nowrap">
                Favorites
              </span>
              {activeFilter === 'favorites' && (
                <span className="hh-customer-filter-bar w-5 h-[2.5px] rounded-full bg-white/95" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="pt-3 md:pt-4 md:grid md:grid-cols-12 md:gap-6">
        <section className="md:col-span-5 min-w-0">
          <div className="flex items-start gap-2 text-[11.5px] sm:text-[12.5px] mb-2.5 px-1">
            <Users className="w-4 h-4 text-[#1A63DB] shrink-0 mt-0.5" />
            <p className="text-[#4A638D] min-w-0 leading-snug">
              <span className="font-bold text-[#0A1F44] tabular-nums">
                {filtered.length} retailer{filtered.length === 1 ? '' : 's'}
              </span>
              {filtered.length > MAX_ROWS ? ` · showing first ${MAX_ROWS}, search to narrow` : ''}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div data-card-tone="neutral" className="rounded-2xl border p-6 text-center shadow-2xs">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              {query.trim() ? (
                <>
                  <p className="text-sm font-semibold text-[#0A1F44] break-words">
                    No retailer found for &apos;{query.trim()}&apos;
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenCreateCustomer(extractCustomerPrefill(query))}
                    className="mt-4 w-full min-h-[44px] rounded-full bg-gradient-to-r from-[#19A84B] to-[#0D8A38] text-white font-bold px-4 cursor-pointer break-words"
                  >
                    + Add &quot;{query.trim()}&quot; as New Customer
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-[#0A1F44]">
                    {activeFilter === 'today_route' && todayRoutes.length === 0
                      ? "No route is set on today's active trips"
                      : activeFilter === 'favorites'
                        ? 'No favorite retailers yet — tap the star on any retailer to save it here'
                        : 'No retailers match these filters'}
                  </p>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="mt-4 min-h-[44px] rounded-full border border-[#DCE5F2] bg-white text-sm font-bold text-[#0A1F44] px-5 hover:bg-slate-50 cursor-pointer"
                  >
                    Show all retailers
                  </button>
                </>
              )}
            </div>
          ) : (
            <ul className="space-y-2.5 md:max-h-[calc(100vh-17rem)] md:overflow-y-auto md:pr-1">
              {shown.map((r) => {
                const active = !isMobile && previewId === r.o.id;
                const isFav = favoriteSet.has(favKeyOf(r.o));
                const cardTone = active
                  ? 'received'
                  : r.overdue || r.due > 0.004
                    ? 'due'
                    : 'sales';
                const avatarTone = active
                  ? 'green'
                  : r.overdue || r.due > 0.004
                    ? 'rose'
                    : 'blue';
                return (
                  <li key={r.o.id}>
                    <div
                      data-card-tone={cardTone}
                      className={`hh-customer-card w-full rounded-2xl border shadow-xs transition-all flex items-stretch overflow-hidden ${
                        active ? 'ring-2 ring-emerald-500/40' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleCard(r)}
                        aria-pressed={active}
                        className="flex-1 min-w-0 min-h-[44px] text-left p-3.5 pr-2 cursor-pointer"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className={`hh-avatar hh-avatar--sm hh-avatar--${avatarTone} mt-0.5`}>
                            {getInitials(r.o.name, 'R')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-bold text-[#0A1F44] leading-snug break-words">{r.o.name}</p>
                                {(r.beat || r.o.address) && (
                                  <p className="mt-0.5 text-xs text-[#4A638D] flex items-start gap-1">
                                    <MapPin className="w-3.5 h-3.5 mt-px shrink-0" />
                                    <span className="break-words">
                                      {[r.beat, r.o.address].filter(Boolean).join(' · ')}
                                    </span>
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <DueText due={r.due} />
                                {r.overdue && (
                                  <span className="text-[11px] font-bold text-rose-700">Overdue</span>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                              {r.gst && <GstBadge />}
                              <span className="text-xs text-[#4A638D] tabular-nums">
                                {r.limit > 0 ? `Credit Limit: ₹${r.limit.toLocaleString('en-IN')}` : 'No credit limit'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleFavorite(r.o)}
                        aria-label={isFav ? `Remove ${r.o.name} from favorites` : `Add ${r.o.name} to favorites`}
                        aria-pressed={isFav}
                        className="w-11 shrink-0 flex items-center justify-center border-l border-black/5 hover:bg-white/50 cursor-pointer transition-colors"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            isFav ? 'text-amber-500 fill-amber-400' : 'text-slate-400 hover:text-amber-400'
                          }`}
                        />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Tablet / Desktop preview panel */}
        <aside className="hidden md:block md:col-span-7 min-w-0">
          <div data-card-tone="neutral" className="sticky top-6 rounded-2xl border p-6 max-h-[calc(100vh-10rem)] overflow-y-auto flex flex-col shadow-2xs">
            {!preview ? (
              <div className="py-16 text-center text-[#5A7198]">
                <Store className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium">Select a retailer to preview their account.</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-[#0A1F44] break-words">{preview.o.name}</h3>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(preview.o)}
                        aria-label={
                          favoriteSet.has(favKeyOf(preview.o))
                            ? `Remove ${preview.o.name} from favorites`
                            : `Add ${preview.o.name} to favorites`
                        }
                        className="size-9 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            favoriteSet.has(favKeyOf(preview.o))
                              ? 'text-amber-500 fill-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {preview.gst && <GstBadge />}
                      {preview.overdue && (
                        <span className="text-xs font-bold text-red-700">Overdue</span>
                      )}
                    </div>
                  </div>
                  <DueText due={preview.due} />
                </div>

                <dl className="mt-5 space-y-2 text-sm text-slate-700">
                  {preview.o.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                      <a href={`tel:${preview.o.phone}`} className="hover:underline">
                        {preview.o.phone}
                      </a>
                      {preview.o.altPhone && <span className="text-slate-400">· {preview.o.altPhone}</span>}
                    </div>
                  )}
                  {preview.o.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="break-all">{preview.o.email}</span>
                    </div>
                  )}
                  {(preview.beat || preview.o.address) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <span className="break-words">{[preview.beat, preview.o.address].filter(Boolean).join(' · ')}</span>
                    </div>
                  )}
                  {preview.o.gstin && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-4 text-center shrink-0">GST</span>
                      <span className="font-mono text-xs tracking-wide">{preview.o.gstin}</span>
                    </div>
                  )}
                </dl>

                {/* Credit */}
                <div className="mt-6">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Credit</p>
                  {preview.limit > 0 ? (
                    (() => {
                      const used = preview.due;
                      const pct = Math.min(100, (used / preview.limit) * 100);
                      const over = used > preview.limit;
                      return (
                        <>
                          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${over ? 'bg-[#DC2626]' : 'bg-[#179B46]'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="mt-2 flex justify-between text-xs text-slate-600 gap-2 tabular-nums">
                            <span>
                              Used{' '}
                              <b className={over ? 'text-red-700' : 'text-[#0A1F44]'}>
                                ₹{used.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </b>
                            </span>
                            <span>
                              Available{' '}
                              <b className="text-[#0A1F44]">
                                ₹{Math.max(0, preview.limit - used).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </b>
                            </span>
                            <span>Limit ₹{preview.limit.toLocaleString('en-IN')}</span>
                          </div>
                          {over && (
                            <p className="mt-2 text-xs font-semibold text-red-700">
                              Over the credit limit: a credit bill may be blocked.
                            </p>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <p className="text-sm text-slate-600">No credit limit set.</p>
                  )}
                </div>

                {/* Recent orders */}
                <div className="mt-6">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Recent orders
                    {preview.o.totalBills ? ` · ${preview.o.totalBills} total` : ''}
                  </p>
                  {recentOrders.length === 0 ? (
                    <p className="text-sm text-slate-600">No orders yet.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-[#DCE5F2]">
                      {recentOrders.map((b) => (
                        <li key={b.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                          <span className="text-slate-600">
                            #{b.id} · {shortDate(b.date)}
                          </span>
                          <span className="font-semibold text-[#0A1F44] tabular-nums">
                            ₹{Math.round(Number(b.total) || 0).toLocaleString('en-IN')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="sticky bottom-0 bg-white pt-5 mt-auto">
                  <button
                    type="button"
                    onClick={() => onSelectCustomer(preview.o)}
                    className="w-full min-h-[46px] rounded-full bg-gradient-to-r from-[#19A84B] to-[#0D8A38] hover:from-[#159642] hover:to-[#0A752E] text-white font-bold px-4 cursor-pointer break-words shadow-sm"
                  >
                    Start Order with {preview.o.name}
                    {tripLabel ? ` (${tripLabel})` : ''} →
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
