import React from 'react';
import {
  BarChart3,
  Boxes,
  Eye,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Tag,
  Truck,
  User,
  UserCheck,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { TabId } from '../../types';

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean | 'true' | 'false'; className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'inventory', label: 'Inventory & Inward', icon: Boxes },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'billing', label: 'Billing', icon: Receipt },
  { id: 'salesman', label: 'Salesman Mode', icon: UserCheck },
  { id: 'trips', label: 'Vehicle Trips', icon: Truck },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'promotions', label: 'Promotions', icon: Tag },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Nav: React.FC = () => {
  const { tab, setTab, palette, scale, fz, orgProfile, setHighContrast } = useLedger();

  const brandName = orgProfile?.name ? orgProfile.name.split(' ')[0] : 'MrWater';
  const tagline = orgProfile?.tagline || 'Distribution ledger';

  const selectSalesmanMode = (mode: 'normal' | 'lowVision') => {
    try {
      localStorage.setItem('salesman_view_mode', mode);
      window.dispatchEvent(new CustomEvent('salesman_mode_changed', { detail: mode }));
    } catch {
      // ignore
    }
    if (mode === 'lowVision') {
      setHighContrast(true);
    }
    setTab('salesman');
  };

  return (
    <nav
      id="desktop-nav"
      aria-label="Main sections"
      className="hidden md:flex flex-col shrink-0 border-r-2 select-none"
      style={{
        borderColor: palette.line,
        backgroundColor: palette.navy,
        width: `${Math.round(240 + (scale - 1) * 75)}px`,
      }}
    >
      <div className="px-4 py-4 border-b-2" style={{ borderColor: '#ffffff33' }}>
        <div style={fz(18, { color: '#FFFFFF', fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.2 })}>
          {brandName}
        </div>
        <div className="truncate mt-0.5" title={tagline} style={fz(12.5, { color: '#E6ECF2', lineHeight: 1.2 })}>
          {tagline}
        </div>
      </div>
      <div className="flex flex-col py-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          const isSalesman = id === 'salesman';

          return (
            <React.Fragment key={id}>
              <button
                id={`nav-item-${id}`}
                onClick={() => setTab(id)}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-3 px-4 py-3 text-left transition-colors focus-ring cursor-pointer leading-tight"
                style={{
                  backgroundColor: active ? '#FFFFFF' : 'transparent',
                  color: active ? palette.navy : '#FFFFFF',
                  fontWeight: active ? 700 : 500,
                  borderLeft: active ? `6px solid ${palette.amber}` : '6px solid transparent',
                  ...fz(15),
                }}
              >
                <Icon size={Math.round(19 * Math.min(scale, 1.25))} className="shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{label}</span>
              </button>

              {/* Sub-menu options for Salesman: Normal vs Visionless */}
              {isSalesman && (
                <div className="ml-5 my-1 pl-3 border-l-2 border-white/25 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => selectSalesmanMode('normal')}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Normal Salesman view for mobile/tablet route selling"
                  >
                    <User size={13} className="text-amber-400" />
                    <span>Normal Salesman</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => selectSalesmanMode('lowVision')}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs font-bold text-yellow-300 hover:text-yellow-200 hover:bg-white/10 transition-colors cursor-pointer"
                    title="Vision-impaired / high accessibility mode with voice search"
                  >
                    <Eye size={13} className="text-yellow-400" />
                    <span>Visionless Salesman</span>
                  </button>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};
