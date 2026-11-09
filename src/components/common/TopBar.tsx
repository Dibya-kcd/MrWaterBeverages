import React, { useState } from 'react';
import { Bell, Search } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useNeedsAttention } from '../../hooks/useNeedsAttention';
import { NotificationPanel } from './NotificationPanel';
import { ProfileAvatarMenu } from './ProfileAvatarMenu';

/** Desktop top bar (1024px+): search, period slot, alerts bell drawer, and business profile avatar menu. */
export const TopBar: React.FC = () => {
  const { t } = useLanguage();
  const { setTab } = useLedger();
  const { total } = useNeedsAttention();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <>
      <header id="app-topbar" className="hh-topbar">
        {/* Search opens Parties, which already has the live party search (a typed query is not carried over). */}
        <button type="button" className="hh-search" onClick={() => setTab('customers')}>
          <Search size={20} aria-hidden="true" />
          <span>{t('top.searchPlaceholder')}</span>
        </button>

        <div id="topbar-period-slot" className="hh-topbar__slot" />

        {/* Notification Bell (Opens dedicated non-disruptive notifications drawer) */}
        <button
          type="button"
          className="hh-iconbtn hh-iconbtn--bell"
          aria-label={total > 0 ? t('top.alertsCount', { n: total }) : t('top.alerts')}
          onClick={() => setShowNotifications(true)}
        >
          <Bell size={20} aria-hidden="true" />
          {total > 0 && <span className="hh-dot" aria-hidden="true" />}
        </button>

        {/* Business Profile Avatar & Account Menu */}
        <ProfileAvatarMenu />
      </header>

      {/* Notifications Drawer */}
      <NotificationPanel
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </>
  );
};

