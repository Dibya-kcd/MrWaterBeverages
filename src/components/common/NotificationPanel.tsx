import React, { useState } from 'react';
import {
  Bell,
  X,
  AlertTriangle,
  Package,
  Clock,
  FileText,
  Users,
  Truck,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useNeedsAttention, AttentionItem } from '../../hooks/useNeedsAttention';
import { TabId } from '../../types';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const { setTab } = useLedger();
  const { items, total } = useNeedsAttention();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  if (!isOpen) return null;

  const activeItems = items.filter((item) => !dismissedIds.includes(item.id));

  const handleAction = (tab: TabId, session?: [string, string]) => {
    if (session) {
      try {
        sessionStorage.setItem(session[0], session[1]);
      } catch {
        /* storage may be restricted */
      }
    }
    setTab(tab);
    onClose();
  };

  const handleDismissAll = () => {
    setDismissedIds(items.map((i) => i.id));
  };

  const getIcon = (id: string) => {
    switch (id) {
      case 'credit':
        return <Users className="w-4 h-4 text-rose-600" />;
      case 'trips':
        return <Truck className="w-4 h-4 text-rose-600" />;
      case 'low-stock':
        return <Package className="w-4 h-4 text-amber-600" />;
      case 'expiry':
        return <Clock className="w-4 h-4 text-amber-600" />;
      case 'credit-notes':
        return <FileText className="w-4 h-4 text-blue-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-slate-600" />;
    }
  };

  const getToneBadge = (tone: string) => {
    switch (tone) {
      case 'due':
        return 'bg-rose-50 border-rose-200 text-rose-800';
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-800';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-800';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] mt-12 sm:mt-14 mr-0 sm:mr-2"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications and Alerts"
      >
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Notifications & Alerts</h2>
              <p className="text-[11px] text-slate-500">
                {activeItems.length > 0
                  ? `${activeItems.length} active business issue${activeItems.length === 1 ? '' : 's'} require review`
                  : 'All business alerts are clear'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeItems.length > 0 && (
              <button
                type="button"
                onClick={handleDismissAll}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                Dismiss All
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
              aria-label="Close notification panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List of active alerts */}
        <div className="p-3 overflow-y-auto space-y-2 flex-1">
          {activeItems.length > 0 ? (
            activeItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleAction(item.tab, item.session)}
                className="group p-3 rounded-xl border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 transition-all cursor-pointer flex items-start gap-3"
              >
                <div className={`p-2 rounded-lg border shrink-0 ${getToneBadge(item.tone)}`}>
                  {getIcon(item.id)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {t(item.titleKey, { n: item.count })}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                      {item.count}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {t(item.subKey)}
                  </p>

                  <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-800 group-hover:text-emerald-950">
                    <span>Resolve in {item.tab.charAt(0).toUpperCase() + item.tab.slice(1)}</span>
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">You are all caught up!</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                No credit limits exceeded, stock levels are healthy, and trips are balanced.
              </p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Realtime Ledger Auditor</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-semibold text-slate-700 hover:text-slate-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
