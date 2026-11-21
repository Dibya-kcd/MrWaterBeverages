import React, { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronLeft, Package, Receipt, Search, Sparkles, Users, X } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useNeedsAttention } from '../../hooks/useNeedsAttention';
import { money } from '../../utils/billing';
import { invoiceNo } from '../../utils/beatReports';
import { billBalance, billNetTotal } from '../../utils/salesReturns';
import { Bill, TabId } from '../../types';
import { NotificationPanel } from './NotificationPanel';
import { ProfileAvatarMenu } from './ProfileAvatarMenu';
import { TaxInvoiceModal } from './TaxInvoiceModal';

export interface AppHeaderProps {
  onMenuClick?: () => void;
}

const TAB_TITLE_KEYS: Record<TabId, string> = {
  dashboard: 'nav.home',
  billing: 'nav.sell',
  customers: 'nav.parties',
  products: 'nav.products',
  inventory: 'nav.inventory',
  grn: 'nav.inventory',
  audit: 'nav.inventory',
  warehouses: 'settings.section.fleet',
  supplierSchemes: 'nav.supplierCredits',
  payments: 'nav.payments',
  expenses: 'nav.expenses',
  crates: 'nav.crates',
  promotions: 'nav.promotions',
  trips: 'nav.trips',
  reports: 'nav.reports',
  salesmen: 'settings.section.staff',
  salesman: 'nav.sell',
  settings: 'nav.settings',
};

/** Phone header (hidden from 768px up): solid primary bar, brand/back + title, bell with badge, and pill search on Home. */
export const AppHeader: React.FC<AppHeaderProps> = () => {
  const { tab, setTab, orgProfile, customers, products, bills } = useLedger();
  const { t } = useLanguage();
  const { total } = useNeedsAttention();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  useEffect(() => {
    const onOpenNotifications = () => setShowNotifications(true);
    window.addEventListener('hh-open-notifications', onOpenNotifications);
    return () => window.removeEventListener('hh-open-notifications', onOpenNotifications);
  }, []);

  const isHome = tab === 'dashboard';
  const brand =
    orgProfile && (orgProfile as { name?: string }).name && (orgProfile as { name?: string }).name !== 'MrWater'
      ? (orgProfile as { name?: string }).name!
      : 'Hydrate Hub';

  const headerTitle = isHome ? brand : t(TAB_TITLE_KEYS[tab] || 'nav.home');

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        parties: (customers || []).slice(0, 4),
        items: (products || []).slice(0, 4),
        invoices: [...(bills || [])]
          .filter((b) => b.status !== 'cancelled' && !(b as { cancelled?: boolean }).cancelled)
          .sort((a, b) => (b.date || '').localeCompare(a.date || '') || Number(b.id) - Number(a.id))
          .slice(0, 4),
      };
    }
    const parties = (customers || [])
      .filter((c) => {
        const name = String(c.name || '').toLowerCase();
        const phone = String(c.phone || '').toLowerCase();
        const route = String(c.route || c.city || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || route.includes(q);
      })
      .slice(0, 6);

    const items = (products || [])
      .filter((p) => {
        const name = String(p.name || '').toLowerCase();
        const nameOr = String(p.nameOr || '').toLowerCase();
        const cat = String(p.category || '').toLowerCase();
        return name.includes(q) || nameOr.includes(q) || cat.includes(q);
      })
      .slice(0, 6);

    const invoices = [...(bills || [])]
      .filter((b) => {
        if (b.status === 'cancelled' || (b as { cancelled?: boolean }).cancelled) return false;
        const inv = invoiceNo(b).toLowerCase();
        const party = String(b.retailer || '').toLowerCase();
        const phone = String(b.phone || '').toLowerCase();
        return inv.includes(q) || party.includes(q) || phone.includes(q) || String(b.id).includes(q);
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || Number(b.id) - Number(a.id))
      .slice(0, 6);

    return { parties, items, invoices };
  }, [query, customers, products, bills]);

  const hasAnyResults =
    searchResults.parties.length > 0 || searchResults.items.length > 0 || searchResults.invoices.length > 0;

  return (
    <>
      <header
        id="app-header"
        className={`hh-header select-none${
          tab === 'billing' || tab === 'trips' || tab === 'customers' || tab === 'payments' || tab === 'inventory' || tab === 'grn' || tab === 'audit' || tab === 'settings' || tab === 'warehouses' || tab === 'reports' || tab === 'promotions' || tab === 'supplierSchemes' || tab === 'expenses' || tab === 'crates' || tab === 'products'
            ? ' hh-header--hidden-phone'
            : ''
        }`}
      >
        <div className="hh-header__row">
          {isHome ? (
            <button
              type="button"
              onClick={() => setTab('dashboard')}
              className="hh-header__brand focus-ring min-w-0"
              aria-label={t('nav.home')}
            >
              <span className="hh-header__spark" aria-hidden="true">
                <Sparkles size={14} strokeWidth={2.5} />
              </span>
              <span className="hh-header__name">{headerTitle}</span>
            </button>
          ) : (
            <div className="hh-header__title-wrap">
              <button
                type="button"
                onClick={() => setTab('dashboard')}
                className="hh-header__back"
                aria-label={t('common.back')}
              >
                <ChevronLeft size={24} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <span className="hh-header__name">{headerTitle}</span>
            </div>
          )}

          <div className="hh-header__actions">
            <button
              type="button"
              onClick={() => setShowNotifications(true)}
              className="hh-iconbtn hh-iconbtn--bell"
              aria-label={total > 0 ? t('top.alertsCount', { n: total }) : t('top.alerts')}
            >
              <Bell size={22} strokeWidth={2.1} aria-hidden="true" />
              {total > 0 && (
                <span className="hh-header__bell-badge" aria-hidden="true">
                  {total > 99 ? '99+' : total}
                </span>
              )}
            </button>

            <div className="hh-header__profile">
              <ProfileAvatarMenu />
            </div>
          </div>
        </div>

        {isHome && (
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="hh-header__search"
            aria-label={t('home.searchPlaceholder')}
          >
            <Search size={17} strokeWidth={2.2} aria-hidden="true" />
            <span>{t('home.searchPlaceholder')}</span>
          </button>
        )}
      </header>

      {/* Phone Search Selector Dialog */}
      {showSearch && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('search.title')}
          className="fixed inset-0 z-50 flex flex-col md:hidden"
          style={{ backgroundColor: 'var(--bg)' }}
        >
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--surface)' }}
          >
            <button
              type="button"
              onClick={() => {
                setShowSearch(false);
                setQuery('');
              }}
              className="hh-header__back"
              aria-label={t('common.close')}
            >
              <ChevronLeft size={24} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <div
              className="flex items-center gap-2 flex-1 min-w-0 px-3 rounded-full"
              style={{ backgroundColor: 'var(--surface)', minHeight: 'var(--touch)' }}
            >
              <Search size={17} strokeWidth={2.2} style={{ color: 'var(--text-2)' }} aria-hidden="true" />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('home.searchPlaceholder')}
                aria-label={t('home.searchPlaceholder')}
                className="w-full bg-transparent border-0 outline-none shadow-none text-sm"
                style={{ color: 'var(--text)', minHeight: 'var(--touch)', border: 0, boxShadow: 'none' }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="size-7 inline-flex items-center justify-center rounded-full"
                  style={{ color: 'var(--text-2)' }}
                  aria-label={t('common.close')}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!query.trim() && (
              <p className="text-xs font-medium px-1" style={{ color: 'var(--text-2)' }}>
                {t('search.hint')}
              </p>
            )}

            {!hasAnyResults ? (
              <div className="rt-card text-center py-6">
                <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                  {t('search.noResults')}
                </p>
              </div>
            ) : (
              <>
                {searchResults.parties.length > 0 && (
                  <section className="rt-card space-y-2" aria-label={t('search.parties')}>
                    <div className="flex items-center gap-2">
                      <Users size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" />
                      <h2 className="text-sm font-bold m-0" style={{ color: 'var(--text)' }}>
                        {t('search.parties')}
                      </h2>
                    </div>
                    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {searchResults.parties.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setShowSearch(false);
                              setQuery('');
                              setTab('customers');
                            }}
                            className="w-full py-2.5 flex items-center justify-between gap-3 text-left bg-transparent border-0"
                            style={{ minHeight: 'var(--touch)' }}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold break-words" style={{ color: 'var(--text)' }}>
                                {c.name}
                              </span>
                              {(c.phone || c.route || c.city) && (
                                <span className="block text-xs break-words" style={{ color: 'var(--text-2)' }}>
                                  {[c.phone, c.route || c.city].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {searchResults.items.length > 0 && (
                  <section className="rt-card space-y-2" aria-label={t('search.products')}>
                    <div className="flex items-center gap-2">
                      <Package size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" />
                      <h2 className="text-sm font-bold m-0" style={{ color: 'var(--text)' }}>
                        {t('search.products')}
                      </h2>
                    </div>
                    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {searchResults.items.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setShowSearch(false);
                              setQuery('');
                              setTab('products');
                            }}
                            className="w-full py-2.5 flex items-center justify-between gap-3 text-left bg-transparent border-0"
                            style={{ minHeight: 'var(--touch)' }}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold break-words" style={{ color: 'var(--text)' }}>
                                {p.name}
                              </span>
                              {p.category && (
                                <span className="block text-xs break-words" style={{ color: 'var(--text-2)' }}>
                                  {p.category}
                                </span>
                              )}
                            </span>
                            <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: 'var(--text)' }}>
                              ₹{money(p.wholesale || p.retail || 0)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {searchResults.invoices.length > 0 && (
                  <section className="rt-card space-y-2" aria-label={t('search.bills')}>
                    <div className="flex items-center gap-2">
                      <Receipt size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" />
                      <h2 className="text-sm font-bold m-0" style={{ color: 'var(--text)' }}>
                        {t('search.bills')}
                      </h2>
                    </div>
                    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {searchResults.invoices.map((b) => {
                        const bal = billBalance(b);
                        return (
                          <li key={b.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setShowSearch(false);
                                setQuery('');
                                setSelectedBill(b);
                              }}
                              className="w-full py-2.5 flex items-center justify-between gap-3 text-left bg-transparent border-0"
                              style={{ minHeight: 'var(--touch)' }}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold break-words" style={{ color: 'var(--text)' }}>
                                  {b.retailer}
                                </span>
                                <span className="block text-xs break-words" style={{ color: 'var(--text-2)' }}>
                                  {invoiceNo(b)} · {String(b.date || '').slice(0, 10)}
                                </span>
                              </span>
                              <span className="text-right shrink-0">
                                <span className="block text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>
                                  ₹{money(billNetTotal(b))}
                                </span>
                                {bal > 0 && (
                                  <span className="block text-xs font-semibold tabular-nums" style={{ color: 'var(--due)' }}>
                                    {t('home.dueLabel')} ₹{money(bal)}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {selectedBill && (
        <TaxInvoiceModal
          bill={selectedBill}
          defaultFormat={selectedBill.supplyType === 'B2B' || selectedBill.isGstInvoice ? 'gst' : 'non_gst'}
          onClose={() => setSelectedBill(null)}
          onEditBill={() => {
            setSelectedBill(null);
            setTab('billing');
          }}
        />
      )}

      {/* Notifications Drawer */}
      <NotificationPanel
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </>
  );
};
