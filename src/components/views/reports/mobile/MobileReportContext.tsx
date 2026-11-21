import React, { createContext, useContext } from 'react';
import { ChevronDown, ChevronLeft, ChevronsLeft } from 'lucide-react';
import type { ReportPeriod } from '../reportPeriod';
import type { ReportSection } from '../ReportSectionTabs';
import { ReportShareMenu, type ReportShareMenuProps } from '../ReportShareMenu';

export type CollectionsMobileSubTab = 'daywise' | 'transactions';
export type PnlDetailTabId = 'products' | 'customers' | 'days' | 'netProfit';

export interface MobileReportContextValue {
  period: ReportPeriod;
  setPeriod: (p: ReportPeriod) => void;
  shortPeriodLabel: string;
  periodLabel: string;
  openPeriodSheet: () => void;
  onBackToHome: () => void;
  navigateReport: (section: ReportSection) => void;
  collectionsSubTab: CollectionsMobileSubTab;
  setCollectionsSubTab: (t: CollectionsMobileSubTab) => void;
  pnlTargetTab: PnlDetailTabId | null;
  setPnlTargetTab: (t: PnlDetailTabId | null) => void;
  orgName: string;
}

const MobileReportContext = createContext<MobileReportContextValue | null>(null);

export const MobileReportProvider = MobileReportContext.Provider;

export const useMobileReport = (): MobileReportContextValue | null => useContext(MobileReportContext);

export const formatShortPeriodLabel = (period: ReportPeriod, selectedDate?: string): string => {
  switch (period) {
    case 'today':
      return 'Today';
    case 'yesterday':
      return 'Yesterday';
    case 'last7':
      return '7 days';
    case 'thisMonth':
      return 'Month';
    case 'lastMonth':
      return 'Last mo';
    case 'all':
      return 'All time';
    case 'customDate':
      return selectedDate || 'Custom';
    case 'customRange':
      return 'Range';
    default:
      return 'Month';
  }
};

export interface MobileReportTopBarProps {
  title: string;
  sub?: string;
  /** Default backs to Reports home; pass custom handler for nested 3rd-level pages. */
  onBack?: () => void;
  /** Renders no back chevron (used on Reports home). */
  hideBack?: boolean;
  /** Uses double chevron `<<` for 3rd-level section drill-downs. */
  doubleBack?: boolean;
  /** Shows the white glass `[Month ▾]` period pill (omit on snapshot reports). */
  showPeriod?: boolean;
  /** Live share menu payload for the top-right upload/share button. */
  shareProps?: Omit<ReportShareMenuProps, 'align' | 'iconOnly' | 'orgName' | 'periodLabel'>;
}

export const MobileReportTopBar: React.FC<MobileReportTopBarProps> = ({
  title,
  sub,
  onBack,
  hideBack = false,
  doubleBack = false,
  showPeriod = true,
  shareProps,
}) => {
  const ctx = useMobileReport();
  const handleBack = onBack || ctx?.onBackToHome;
  const periodText = ctx?.shortPeriodLabel || 'Month';

  return (
    <header className="hh-sales-top">
      <div className="hh-sales-top__row">
        <div className="min-w-0 flex-1">
          {hideBack || !handleBack ? (
            <h1 className="hh-sales-top__title truncate">{title}</h1>
          ) : (
            <button
              type="button"
              onClick={handleBack}
              className="hh-inv-backbtn max-w-full"
              aria-label={`Back from ${title}`}
            >
              {doubleBack ? (
                <ChevronsLeft size={20} strokeWidth={2.4} className="shrink-0" aria-hidden="true" />
              ) : (
                <ChevronLeft size={20} strokeWidth={2.5} className="shrink-0 -ml-1" aria-hidden="true" />
              )}
              <span className="truncate">{title}</span>
            </button>
          )}
          {sub && (
            <div className={`text-[12px] text-white/85 font-medium leading-tight truncate ${hideBack ? 'mt-0.5' : 'mt-0.5'}`}>
              {sub}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {showPeriod && ctx && (
            <button
              type="button"
              onClick={ctx.openPeriodSheet}
              className="hh-inv-glass-pill"
              aria-label={`Change period (${periodText})`}
            >
              <span>{periodText}</span>
              <ChevronDown size={13} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}

          {shareProps && (
            <ReportShareMenu
              {...shareProps}
              orgName={ctx?.orgName || 'Hydrate Hub'}
              periodLabel={ctx?.periodLabel || periodText}
              align="right"
              iconOnly
            />
          )}
        </div>
      </div>
    </header>
  );
};
