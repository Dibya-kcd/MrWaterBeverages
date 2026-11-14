import React from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  BookOpen,
  Boxes,
  Coins,
  HandCoins,
  MapPin,
  Percent,
  ShieldCheck,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
export type ReportSection =
  | 'overview'
  | 'sales'
  | 'margin'
  | 'netProfit'
  | 'dispositions'
  | 'payments'
  | 'purchases'
  | 'receivables'
  | 'inventory'
  | 'trips'
  | 'tax'
  | 'expenses'
  | 'daybook'
  | 'beats';

const TABS: {
  id: ReportSection;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: 'sales', label: 'Sales', icon: TrendingUp },
  { id: 'margin', label: 'Profit & Loss', icon: Percent },
  { id: 'expenses', label: 'Expenses', icon: Coins },
  { id: 'dispositions', label: 'Returns, Free & Claims', icon: AlertTriangle },
  { id: 'purchases', label: 'Inward & Purchases', icon: ArrowDownToLine },
  { id: 'receivables', label: 'Party Credit & Receivables', icon: Users },
  { id: 'inventory', label: 'Inventory & Valuation', icon: Boxes },
  { id: 'trips', label: 'Vehicle Trips & Logistics', icon: Truck },
  { id: 'tax', label: 'GST', icon: ShieldCheck },
  { id: 'daybook', label: 'Collections', icon: BookOpen },
  { id: 'beats', label: 'Beat-wise Sales & Due', icon: MapPin },
];

export interface ReportSectionTabsProps {
  activeReport: ReportSection;
  onChange: (id: ReportSection) => void;
  /** 'grid' = directory cards; 'scroll' = horizontal chip row */
  variant?: 'grid' | 'scroll';
}

/**
 * Shared report section switcher — keeps tab labels/icons in one place.
 */
export const ReportSectionTabs: React.FC<ReportSectionTabsProps> = ({
  activeReport,
  onChange,
  variant = 'grid',
}) => {
  if (variant === 'scroll') {
    return (
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Report sections">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeReport === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                active
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon size={14} className={active ? 'text-white' : 'text-slate-500'} />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" role="tablist" aria-label="Report sections">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = activeReport === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`min-h-[64px] flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-2xl border text-center cursor-pointer transition-colors ${
              active
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-1 ring-emerald-200'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Icon size={18} className={active ? 'text-emerald-700' : 'text-slate-500'} />
            <span className="text-[11px] font-bold leading-tight">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

export const REPORT_SECTION_TABS = TABS;
