import React from 'react';
import { Home, Menu, ShoppingCart, Users } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { TabId } from '../../types';
import { navActiveId } from './Nav';

interface PrimaryNavItem {
  id: TabId;
  label: string;
  icon: React.ComponentType<{
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
    size?: number;
    strokeWidth?: number;
  }>;
}

export interface MobileNavProps {
  onOpenMenu?: () => void;
}

/** Phone (0-767px): floating bottom bar, inset 20px from the edges. Hidden from 768px up by CSS. */
export const MobileNav: React.FC<MobileNavProps> = ({ onOpenMenu }) => {
  const { tab, setTab } = useLedger();
  const { t } = useLanguage();
  const active = navActiveId(tab);

  const PRIMARY_ITEMS: PrimaryNavItem[] = [
    { id: 'dashboard', label: t('nav.home'), icon: Home },
    { id: 'billing', label: t('nav.sell'), icon: ShoppingCart },
    { id: 'customers', label: t('nav.parties'), icon: Users },
  ];

  return (
    <nav id="mobile-nav" className="hh-bottombar" aria-label={t('nav.primary')}>
      {PRIMARY_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            data-active={isActive ? 'true' : 'false'}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => setTab(id)}
            className="hh-bottombar__item"
          >
            <Icon size={24} aria-hidden="true" strokeWidth={isActive ? 2.4 : 1.9} />
            <span>{label}</span>
          </button>
        );
      })}

      <button type="button" onClick={() => onOpenMenu?.()} aria-label={t('nav.openMenu')} className="hh-bottombar__item" data-active="false">
        <Menu size={24} aria-hidden="true" strokeWidth={2} />
        <span>{t('nav.menu')}</span>
      </button>
    </nav>
  );
};
