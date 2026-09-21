import React from 'react';
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Tag,
  Truck,
  UserCheck,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { TabId } from '../../types';

interface MobileNavItem {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

const MOBILE_ITEMS: MobileNavItem[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'salesman', label: 'Salesman', icon: UserCheck },
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'trips', label: 'Trips', icon: Truck },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'promotions', label: 'Promos', icon: Tag },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const MobileNav: React.FC = () => {
  const { tab, setTab, palette, scale, fz } = useLedger();

  // In Salesman-mode sessions, reduce visible mobile bottom nav to Salesman, Trips, Settings
  const items = React.useMemo(() => {
    if (tab === 'salesman') {
      return MOBILE_ITEMS.filter((item) => item.id === 'salesman' || item.id === 'trips' || item.id === 'settings');
    }
    return MOBILE_ITEMS;
  }, [tab]);

  const isSalesmanSession = tab === 'salesman';

  return (
    <nav
      id="mobile-nav"
      aria-label="Main sections"
      className={`flex md:hidden fixed bottom-0 inset-x-0 z-40 ${
        isSalesmanSession ? 'grid grid-cols-3' : 'overflow-x-auto no-scrollbar scroll-smooth'
      } border-t-2 select-none shadow-lg`}
      style={{
        borderColor: palette.line,
        backgroundColor: palette.navy,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            id={`mobile-nav-${id}`}
            onClick={() => setTab(id)}
            aria-current={active ? 'page' : undefined}
            className="flex flex-col items-center justify-center gap-1 shrink-0 focus-ring cursor-pointer select-none transition-all"
            style={{
              minWidth: isSalesmanSession ? 'auto' : `${66 * Math.min(scale, 1.2)}px`,
              minHeight: '52px',
              padding: '6px 8px',
              backgroundColor: active ? '#FFFFFF' : 'transparent',
              color: active ? palette.navy : '#FFFFFF',
              fontWeight: active ? 800 : 500,
              borderTop: active ? `3px solid ${palette.amber}` : '3px solid transparent',
            }}
          >
            <Icon size={Math.round(20 * Math.min(scale, 1.2))} aria-hidden="true" />
            <span
              className="whitespace-nowrap leading-none"
              style={fz(isSalesmanSession ? 13 : 11, { fontWeight: active ? 800 : 600 })}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
