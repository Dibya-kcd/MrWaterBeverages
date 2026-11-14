import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useNeedsAttention } from '../../hooks/useNeedsAttention';
import { NotificationPanel } from './NotificationPanel';
import { ProfileAvatarMenu } from './ProfileAvatarMenu';

/** Desktop top bar (1024px+): period slot, alerts bell drawer, and business profile avatar menu. */
export const TopBar: React.FC = () => {
  const { t } = useLanguage();
  const { total } = useNeedsAttention();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <>
      <header id="app-topbar" className="hh-topbar">
        <div id="topbar-period-slot" className="hh-topbar__slot" />

        {/* Notification Bell (Opens dedicated non-disruptive notifications drawer) */}
        <button
          type="button"
          className="hh-iconbtn hh-iconbtn--bell"
          aria-label={total > 0 ? t('top.alertsCount', { n: total }) : t('top.alerts')}
          onClick={() => setShowNotifications(true)}
        >
          <Bell size={23} strokeWidth={2.25} aria-hidden="true" />
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

