import React from 'react';
import {
  BarChart3,
  BookOpen,
  Boxes,
  Container,
  FileText,
  Home,
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
import { TabId } from '../../types';

export interface NavItem {
  id: TabId;
  label: string;
  icon: React.ComponentType<{
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
    size?: number;
    strokeWidth?: number;
  }>;
}

/** Full menu used by mobile sheet + desktop sidebar */
const MENU_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'billing', label: 'Sell', icon: ShoppingCart },
  { id: 'customers', label: 'Parties', icon: Users },
  { id: 'products', label: 'Products', icon: BookOpen },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'supplierSchemes', label: 'Supplier credits', icon: FileText },
  { id: 'payments', label: 'Payments', icon: Wallet },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'crates', label: 'Crates & deposits', icon: Container },
  { id: 'promotions', label: 'Promotions', icon: Tag },
  { id: 'trips', label: 'Trips', icon: Truck },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

/** Unique keys for list rendering (billing/inventory/settings appear twice with different labels) */
const SIDEBAR_ITEMS: (NavItem & { key: string })[] = [
  { key: 'home', id: 'dashboard', label: 'Home', icon: Home },
  { key: 'sell', id: 'billing', label: 'Sell', icon: ShoppingCart },
  { key: 'parties', id: 'customers', label: 'Parties', icon: Users },
  { key: 'catalogue', id: 'products', label: 'Products', icon: BookOpen },
  { key: 'inventory', id: 'inventory', label: 'Inventory', icon: Boxes },
  { key: 'cdn', id: 'supplierSchemes', label: 'Supplier credits', icon: FileText },
  { key: 'payments', id: 'payments', label: 'Payments', icon: Wallet },
  { key: 'expenses', id: 'expenses', label: 'Expenses', icon: Receipt },
  { key: 'crates', id: 'crates', label: 'Crates & deposits', icon: Container },
  { key: 'schemes', id: 'promotions', label: 'Promotions', icon: Tag },
  { key: 'trips', id: 'trips', label: 'Trips', icon: Truck },
  { key: 'reports', id: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', id: 'settings', label: 'Settings', icon: Settings },
];

export const NAV_GROUPS = [
  {
    id: 'menu',
    label: 'Menu',
    items: MENU_ITEMS,
  },
];

export interface NavProps {
  open: boolean;
  onClose: () => void;
}

/** Mobile / tablet menu sheet (unchanged behaviour) */
export const Nav: React.FC<NavProps> = ({ open, onClose }) => {
  const { tab, setTab, currentUser, logout } = useLedger();

  if (!open) return null;

  const email =
    currentUser && typeof currentUser === 'object' && 'email' in currentUser
      ? String((currentUser as { email?: string }).email || '')
      : currentUser && typeof currentUser === 'object' && 'name' in currentUser
        ? String((currentUser as { name?: string }).name || '')
        : '';

  const go = (id: TabId) => {
    setTab(id);
    onClose();
  };

  // Sheet shows unique destinations (no duplicate billing/inventory entries)
  const sheetItems: NavItem[] = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'billing', label: 'Sell', icon: ShoppingCart },
      { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'customers', label: 'Parties', icon: Users },
    { id: 'products', label: 'Products', icon: BookOpen },
    { id: 'supplierSchemes', label: 'Supplier credits', icon: FileText },
    { id: 'payments', label: 'Payments', icon: Wallet },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'crates', label: 'Crates & deposits', icon: Container },
    { id: 'promotions', label: 'Promotions', icon: Tag },
    { id: 'trips', label: 'Trips', icon: Truck },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div
      id="mobile-menu-sheet"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 cursor-pointer"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg bg-[#faf8f5] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-black/5 max-h-[88vh] overflow-y-auto p-4 sm:p-5 mb-0 sm:mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Menu</h2>
            {email && <p className="text-xs text-slate-500 mt-0.5">{email}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-black/5 cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {sheetItems.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={`${id}-${label}`}
                type="button"
                onClick={() => go(id)}
                className={`flex flex-col items-center justify-center gap-2 min-h-[88px] px-2 py-3 rounded-2xl border text-center cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#ebe8e1] border-[#0d4a3a]/20 text-[#0d4a3a]'
                    : 'bg-white border-black/5 text-slate-800 hover:bg-[#f6f4ef]'
                }`}
              >
                <Icon size={22} className="text-[#0d4a3a]" aria-hidden="true" />
                <span className="text-xs font-semibold leading-tight">{label}</span>
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
            className="flex flex-col items-center justify-center gap-2 min-h-[88px] px-2 py-3 rounded-2xl border border-black/5 bg-white text-rose-600 hover:bg-rose-50 cursor-pointer"
          >
            <LogOut size={22} aria-hidden="true" />
            <span className="text-xs font-semibold leading-tight">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Permanent left sidebar — desktop only (lg+).
 * Matches Crate reference: dark green rail, amber active pill, logo, sign out.
 */
export const DesktopSidebar: React.FC = () => {
  const { tab, setTab, logout } = useLedger();

  const isActive = (item: (typeof SIDEBAR_ITEMS)[0]) => {
    // Prefer exact label-intent where two items share a tab id
    if (item.key === 'sell') return tab === 'billing';
    return tab === item.id;
  };

  // Only highlight one of the duplicate-tab items at a time
  const activeKey = (() => {
    if (tab === 'dashboard') return 'home';
    if (tab === 'billing') return 'sell'; // default Sell when on billing
    if (tab === 'inventory' || tab === 'grn') return 'inventory';
    if (tab === 'customers') return 'parties';
    if (tab === 'products') return 'catalogue';
    if (tab === 'supplierSchemes') return 'cdn';
    if (tab === 'payments') return 'payments';
    if (tab === 'expenses') return 'expenses';
    if (tab === 'promotions') return 'schemes';
    if (tab === 'settings') return 'settings';
    if (tab === 'trips') return 'trips';
    if (tab === 'reports') return 'reports';
    return '';
  })();

  return (
    <aside
      id="desktop-sidebar"
      className="hidden lg:flex flex-col w-[240px] xl:w-[260px] shrink-0 h-dvh h-screen sticky top-0 z-40 overflow-hidden"
      style={{ backgroundColor: '#0B3D32' }}
      aria-label="Main navigation"
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-5">
        <div
          className="size-10 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-lg shadow-amber-500/30"
          style={{ background: 'linear-gradient(135deg, #FBBF24, #D97706)' }}
          aria-hidden="true"
        >
          H
        </div>
        <div className="min-w-0">
          <div className="text-lg font-bold tracking-tight text-white leading-tight">Hydrate Hub</div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-0.5 scrollbar-thin">
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeKey || (activeKey === '' && isActive(item));
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors cursor-pointer ${
                active
                  ? 'bg-[#F59E0B] text-[#0B3D32] font-semibold shadow-sm'
                  : 'text-white/85 hover:bg-white/10 hover:text-white font-medium'
              }`}
            >
              <Icon
                size={18}
                strokeWidth={active ? 2.4 : 1.9}
                className="shrink-0"
                aria-hidden="true"
              />
              <span className="truncate leading-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-2.5 pb-5 pt-2 border-t border-white/10">
        <button
          type="button"
          onClick={() => {
            if (typeof logout === 'function') logout();
            else window.location.reload();
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
        >
          <LogOut size={18} className="shrink-0" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
};
