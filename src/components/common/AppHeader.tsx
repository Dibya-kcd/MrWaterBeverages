import React, { useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useNeedsAttention } from '../../hooks/useNeedsAttention';
import { BrandMark } from './BrandMark';
import { NotificationPanel } from './NotificationPanel';
import { ProfileAvatarMenu } from './ProfileAvatarMenu';

export interface AppHeaderProps {
  onMenuClick?: () => void;
}

/** Phone header (hidden from 768px up): logo, name + greeting, alerts bell, and profile avatar. */
export const AppHeader: React.FC<AppHeaderProps> = () => {
  const { highContrast, setTab, currentUser, orgProfile } = useLedger();
  const { t } = useLanguage();
  const { total } = useNeedsAttention();
  const [showNotifications, setShowNotifications] = useState(false);

  const roleLabel =
    currentUser && typeof currentUser === 'object' && 'role' in currentUser
      ? String((currentUser as { role?: string }).role || 'Owner')
      : 'Owner';
  const userName = (currentUser && typeof currentUser === 'object' && 'name' in currentUser && String((currentUser as { name?: string }).name || '').trim()) ||
    (roleLabel === 'admin' ? t('nav.owner') : roleLabel);
  const brand =
    (orgProfile && (orgProfile as { name?: string }).name && (orgProfile as { name?: string }).name !== 'MrWater')
      ? (orgProfile as { name?: string }).name!
      : 'Hydrate Hub';

  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    return t(hr < 12 ? 'greet.morning' : hr < 17 ? 'greet.afternoon' : 'greet.evening');
  }, [t]);

  return (
    <>
      <header
        id="app-header"
        className="hh-header select-none flex items-center justify-between gap-2"
        style={highContrast ? { backgroundColor: '#000', color: '#fff' } : undefined}
      >
        <button type="button" onClick={() => setTab('dashboard')} className="hh-header__brand focus-ring min-w-0" aria-label={t('nav.home')}>
          <BrandMark letter={brand.charAt(0).toUpperCase()} className="size-10 text-base shrink-0" />
          <span className="min-w-0 text-left">
            <span className="hh-header__name truncate block">{brand}</span>
            <span className="hh-header__greet truncate block">{greeting}, {userName}</span>
          </span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowNotifications(true)}
            className="hh-iconbtn hh-iconbtn--bell"
            aria-label={total > 0 ? t('top.alertsCount', { n: total }) : t('top.alerts')}
          >
            <Bell size={20} aria-hidden="true" />
            {total > 0 && <span className="hh-dot" aria-hidden="true" />}
          </button>

          <ProfileAvatarMenu />
        </div>
      </header>

      {/* Notifications Drawer */}
      <NotificationPanel
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </>
  );
};
