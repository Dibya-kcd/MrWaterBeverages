import React from 'react';
import {
  BarChart3,
  BookOpen,
  Boxes,
  Container,
  FileText,
  Home,
  LayoutGrid,
  LogOut,
  Settings,
  ShoppingCart,
  Tag,
  Truck,
  Users,
  Wallet,
  Receipt,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { TabId } from '../../types';
import { UserAvatar } from './UserAvatar';
import { BrandMark } from './BrandMark';

export interface NavItem {
  id: TabId;
  /** i18n key - resolved with t() at render time */
  labelKey: string;
  /** @deprecated use labelKey + t() */
  label?: string;
  icon: React.ComponentType<{
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
    size?: number;
    strokeWidth?: number;
  }>;
}

/** Full destination list: desktop sidebar and the phone/tablet menu sheet. Order follows the design. */
const MENU_ITEMS: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav.home', icon: Home },
  { id: 'billing', labelKey: 'nav.sell', icon: ShoppingCart },
  { id: 'customers', labelKey: 'nav.parties', icon: Users },
  { id: 'products', labelKey: 'nav.products', icon: BookOpen },
  { id: 'inventory', labelKey: 'nav.inventory', icon: Boxes },
  { id: 'supplierSchemes', labelKey: 'nav.supplierCredits', icon: FileText },
  { id: 'payments', labelKey: 'nav.payments', icon: Wallet },
  { id: 'expenses', labelKey: 'nav.expenses', icon: Receipt },
  { id: 'crates', labelKey: 'nav.crates', icon: Container },
  { id: 'promotions', labelKey: 'nav.promotions', icon: Tag },
  { id: 'trips', labelKey: 'nav.trips', icon: Truck },
  { id: 'reports', labelKey: 'nav.reports', icon: BarChart3 },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
];

/** Tablet icon rail: six main destinations, Settings pinned at the bottom. */
const RAIL_ITEMS: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav.home', icon: Home },
  { id: 'billing', labelKey: 'nav.sell', icon: ShoppingCart },
  { id: 'customers', labelKey: 'nav.parties', icon: Users },
  { id: 'payments', labelKey: 'nav.payments', icon: Wallet },
  { id: 'inventory', labelKey: 'nav.stock', icon: Boxes },
  { id: 'reports', labelKey: 'nav.reports', icon: BarChart3 },
];

export const NAV_GROUPS = [
  {
    id: 'menu',
    labelKey: 'nav.menu',
    items: MENU_ITEMS,
  },
];

/**
 * Which menu entry is "current" for a tab. Several tabs open inside another destination
 * (stock receipts, audit and godowns live under Inventory / Settings), so they highlight their parent.
 */
export function navActiveId(tab: TabId): TabId | '' {
  switch (tab) {
    case 'grn':
    case 'audit':
      return 'inventory';
    case 'warehouses':
      return 'settings';
    case 'salesman':
      return 'billing';
    default:
      return tab;
  }
}

function useUserCard() {
  const { currentUser, warehouses } = useLedger();
  const { t } = useLanguage();
  const raw =
    currentUser && typeof currentUser === 'object' && 'name' in currentUser
      ? String((currentUser as { name?: string }).name || '').trim()
      : '';
  const role = currentUser && typeof currentUser === 'object' && 'role' in currentUser ? String((currentUser as { role?: string }).role) : 'admin';
  const name = raw || (role === 'admin' ? t('nav.owner') : role);
  const godown = ((warehouses || []).find((w) => w.isDefault)?.name) || (warehouses && warehouses[0] && warehouses[0].name) || t('nav.godownDefault');
  const email =
    currentUser && typeof currentUser === 'object' && 'email' in currentUser
      ? String((currentUser as { email?: string }).email || '')
      : '';
  return { name, godown, email, initial: name.charAt(0).toUpperCase() || 'O' };
}

export interface NavProps {
  open: boolean;
  onClose: () => void;
}

/** Menu sheet: opened from the phone bottom bar ("Menu") and the tablet rail ("More"). */
export const Nav: React.FC<NavProps> = ({ open, onClose }) => {
  const { tab, setTab, logout } = useLedger();
  const { t } = useLanguage();
  const { email } = useUserCard();

  if (!open) return null;

  const active = navActiveId(tab);
  const go = (id: TabId) => {
    setTab(id);
    onClose();
  };

  return (
    <div
      id="mobile-menu-sheet"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t('nav.menu')}
    >
      <button type="button" className="hh-sheet__scrim absolute inset-0 cursor-pointer" aria-label={t('nav.closeMenu')} onClick={onClose} />
      <div className="hh-sheet relative w-full sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="hh-sheet__title">{t('nav.menu')}</h2>
            {email && <p className="text-xs mt-0.5 break-words" style={{ color: 'var(--text-2)' }}>{email}</p>}
          </div>
          <button type="button" onClick={onClose} className="hh-iconbtn" aria-label={t('nav.closeMenu')}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="hh-sheet__grid">
          {MENU_ITEMS.map(({ id, labelKey, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={`${id}-${labelKey}`}
                type="button"
                onClick={() => go(id)}
                aria-current={isActive ? 'page' : undefined}
                className="hh-sheet__item"
                data-active={isActive ? 'true' : 'false'}
              >
                <Icon size={24} aria-hidden="true" />
                <span>{t(labelKey)}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              onClose();
              if (typeof logout === 'function') logout();
              else window.location.reload();
            }}
            className="hh-sheet__item hh-sheet__item--danger"
          >
            <LogOut size={24} aria-hidden="true" />
            <span>{t('nav.signOut')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/** Tablet (768-1023px): 96px icon rail. Hidden on phone and desktop by CSS. */
export const TabletRail: React.FC<{ onOpenMenu: () => void }> = ({ onOpenMenu }) => {
  const { t } = useLanguage();
  const { tab, setTab } = useLedger();
  const active = navActiveId(tab);

  const Item = ({ item }: { item: NavItem }) => {
    const Icon = item.icon;
    const isActive = active === item.id;
    return (
      <button
        type="button"
        onClick={() => setTab(item.id)}
        aria-current={isActive ? 'page' : undefined}
        className="hh-rail__item"
        data-active={isActive ? 'true' : 'false'}
      >
        <Icon size={24} aria-hidden="true" strokeWidth={isActive ? 2.4 : 1.9} />
        <span>{t(item.labelKey)}</span>
      </button>
    );
  };

  return (
    <aside id="tablet-rail" className="hh-rail" aria-label={t('nav.rail')}>
      <button type="button" onClick={() => setTab('dashboard')} className="hh-rail__logo" aria-label={t('nav.home')}>
        <BrandMark className="size-11 text-lg" />
      </button>
      <nav className="hh-rail__nav">
        {RAIL_ITEMS.map((item) => (
          <Item key={item.id} item={item} />
        ))}
        <button type="button" onClick={onOpenMenu} className="hh-rail__item" aria-label={t('nav.openMenu')}>
          <LayoutGrid size={24} aria-hidden="true" strokeWidth={1.9} />
          <span>{t('nav.more')}</span>
        </button>
      </nav>
      <Item item={{ id: 'settings', labelKey: 'nav.settings', icon: Settings }} />
    </aside>
  );
};

/** Desktop (1024px+): 260px sidebar with every destination and the user card. */
export const DesktopSidebar: React.FC = () => {
  const { t } = useLanguage();
  const { tab, setTab, logout, orgProfile } = useLedger();
  const { name, godown, initial } = useUserCard();
  const active = navActiveId(tab);

  return (
    <aside id="desktop-sidebar" className="hh-sidebar" aria-label={t('nav.rail')}>
      <button type="button" onClick={() => setTab('dashboard')} className="hh-sidebar__brand" aria-label={t('nav.home')}>
        <BrandMark className="size-10 text-base" />
        <span className="hh-sidebar__name">{orgProfile?.name || 'Hydrate Hub'}</span>
      </button>

      <nav className="hh-sidebar__nav">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className="hh-sidebar__item"
              data-active={isActive ? 'true' : 'false'}
            >
              <Icon size={22} strokeWidth={isActive ? 2.3 : 1.9} aria-hidden="true" />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <div className="hh-sidebar__foot">
        <div className="hh-usercard">
          <span className="hh-usercard__avatar" aria-hidden="true"><UserAvatar initial={initial} size={20} /></span>
          <span className="min-w-0">
            <span className="hh-usercard__name">{name}</span>
            <span className="hh-usercard__sub">{godown}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (typeof logout === 'function') logout();
            else window.location.reload();
          }}
          className="hh-sidebar__item hh-sidebar__item--quiet"
        >
          <LogOut size={22} aria-hidden="true" />
          <span>{t('nav.signOut')}</span>
        </button>
      </div>
    </aside>
  );
};
