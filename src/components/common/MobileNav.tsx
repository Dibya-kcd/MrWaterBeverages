import React from 'react';
import {
  Home,
  Menu,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { TabId } from '../../types';

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

/** Bottom navigation — full width, equal slots (mobile + tablet) */
export const MobileNav: React.FC<MobileNavProps> = ({ onOpenMenu }) => {
  const { tab, setTab } = useLedger();
  const { t } = useLanguage();

  const PRIMARY_ITEMS: PrimaryNavItem[] = [
    { id: 'dashboard', label: t('nav.home'), icon: Home },
    { id: 'billing', label: t('nav.sell'), icon: ShoppingCart },
    { id: 'customers', label: t('nav.parties'), icon: Users },
  ];

  return (
    <nav
      id="mobile-nav"
      className="fixed bottom-0 inset-x-0 z-40 w-full bg-white/95 backdrop-blur-xl border-t border-black/6 shadow-[0_-4px_24px_rgba(15,39,44,0.06)] pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      aria-label={t('nav.primary')}
    >
      <div className="w-full max-w-none mx-0 grid grid-cols-4 items-stretch px-1.5 sm:px-2 pt-1.5 pb-1.5">
        {PRIMARY_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              data-active={active ? 'true' : 'false'}
              onClick={() => setTab(id)}
              className={`min-h-[54px] w-full flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all rounded-xl ${
                active
                  ? 'text-[#0d4a3a] bg-[#0d4a3a]/8'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Icon size={22} aria-hidden="true" strokeWidth={active ? 2.5 : 1.8} />
              <span className={`text-[11px] leading-tight ${active ? 'font-bold' : 'font-medium'}`}>
                {label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onOpenMenu?.()}
          aria-label={t('nav.openMenu')}
          className="min-h-[54px] w-full flex flex-col items-center justify-center gap-0.5 cursor-pointer text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all rounded-xl"
        >
          <Menu size={22} aria-hidden="true" strokeWidth={2} />
          <span className="text-[11px] leading-tight font-medium">{t('nav.menu')}</span>
        </button>
      </div>
    </nav>
  );
};
