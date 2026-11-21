import React, { useEffect, useState } from 'react';
import { WifiOff, CheckCircle } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useLanguage } from '../../i18n/LanguageContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { t } = useLanguage();
  const [wasOffline, setWasOffline] = useState(false);
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setShowRestoredNotice(true);
      const timer = setTimeout(() => {
        setShowRestoredNotice(false);
        setWasOffline(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (!isOnline) {
    return (
      <div
        id="banner-offline-indicator"
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-black text-white shadow-xl border border-amber-500 animate-in fade-in"
      >
        <WifiOff size={15} className="animate-pulse shrink-0" aria-hidden="true" />
        <span>{t('offline.banner')}</span>
      </div>
    );
  }

  if (showRestoredNotice) {
    return (
      <div
        id="banner-online-restored-indicator"
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-black text-white shadow-xl border border-emerald-600 animate-in fade-in"
      >
        <CheckCircle size={15} className="shrink-0" aria-hidden="true" />
        <span>{t('offline.restored')}</span>
      </div>
    );
  }

  return null;
};
