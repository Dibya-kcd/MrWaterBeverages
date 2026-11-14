import React from 'react';
import {
  Wallet,
  Receipt,
  MapPin,
  Clock,
  TrendingUp,
  Percent,
  BarChart3,
  Package,
  ShoppingBag,
  RotateCcw,
  Truck,
  FileText,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';

export interface ReportCategoryItem {
  id: string;
  title: string;
  subtitle: string;
  initial?: string;
  tone: 'green' | 'pink' | 'blue' | 'yellow' | 'purple' | 'slate';
}

export interface ReportCategoryGroup {
  id: string;
  name: string;
  items: ReportCategoryItem[];
}

export const getReportNavIcon = (id: string): LucideIcon => {
  switch (id) {
    case 'daybook':
      return Wallet;
    case 'payments':
      return Receipt;
    case 'beats':
      return MapPin;
    case 'receivables':
      return Clock;
    case 'sales':
      return TrendingUp;
    case 'expenses':
      return Wallet;
    case 'margin':
      return BarChart3;
    case 'inventory':
      return Package;
    case 'purchases':
      return ShoppingBag;
    case 'dispositions':
      return RotateCcw;
    case 'trips':
      return Truck;
    case 'tax':
      return FileText;
    default:
      return FileText;
  }
};

export const REPORT_GROUPS: ReportCategoryGroup[] = [
  {
    id: 'money_in',
    name: 'MONEY IN',
    items: [
      {
        id: 'daybook',
        title: 'Collections',
        subtitle: 'Money in and out each day, and money received from each customer',
        initial: 'C',
        tone: 'green',
      },
    ],
  },
  {
    id: 'who_owes_me',
    name: 'WHO OWES ME',
    items: [
      {
        id: 'beats',
        title: 'Beat-wise sales & due',
        subtitle: 'Which beats and shops to collect from',
        initial: 'B',
        tone: 'pink',
      },
      {
        id: 'receivables',
        title: 'Party credit',
        subtitle: "Aging of every shop's due",
        initial: 'P',
        tone: 'pink',
      },
    ],
  },
  {
    id: 'what_sells',
    name: 'WHAT SELLS AND EARNS',
    items: [
      {
        id: 'sales',
        title: 'Sales',
        subtitle: 'Sold, received and unpaid, by day, customer, product or salesman',
        initial: 'S',
        tone: 'blue',
      },
      {
        id: 'margin',
        title: 'Profit & Loss',
        subtitle: 'Sales, cost, expenses and net profit',
        initial: 'M',
        tone: 'blue',
      },
      {
        id: 'expenses',
        title: 'Expenses',
        subtitle: 'What you spent, by category',
        initial: 'E',
        tone: 'blue',
      },
    ],
  },
  {
    id: 'stock_buying',
    name: 'STOCK AND BUYING',
    items: [
      {
        id: 'inventory',
        title: 'Inventory & value',
        subtitle: 'What is in the godown now',
        initial: 'I',
        tone: 'yellow',
      },
      {
        id: 'purchases',
        title: 'Inward & purchases',
        subtitle: 'What you bought and paid',
        initial: 'P',
        tone: 'yellow',
      },
      {
        id: 'dispositions',
        title: 'Returns, free & claims',
        subtitle: 'Breakage and supplier credit',
        initial: 'R',
        tone: 'yellow',
      },
    ],
  },
  {
    id: 'trips_tax',
    name: 'TRIPS AND TAX',
    items: [
      {
        id: 'trips',
        title: 'Vehicle trips',
        subtitle: 'Loads, returns, diesel',
        initial: 'V',
        tone: 'purple',
      },
      {
        id: 'tax',
        title: 'GST',
        subtitle: 'GST to pay, input credit, CA download',
        initial: 'G',
        tone: 'slate',
      },
    ],
  },
];

export const getBadgeStyles = (tone: ReportCategoryItem['tone']) => {
  switch (tone) {
    case 'green':
      return 'bg-[#dcfce7] text-[#15803d]';
    case 'pink':
      return 'bg-[#ffe4e6] text-[#be123c]';
    case 'blue':
      return 'bg-[#dbeafe] text-[#1d4ed8]';
    case 'yellow':
      return 'bg-[#fef3c7] text-[#b45309]';
    case 'purple':
      return 'bg-[#ede9fe] text-[#6d28d9]';
    case 'slate':
      return 'bg-[#e2e8f0] text-[#334155]';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

interface ReportNavMenuProps {
  activeId: string;
  onSelect: (id: string) => void;
  showChevron?: boolean;
}

export const ReportNavMenu: React.FC<ReportNavMenuProps> = ({
  activeId,
  onSelect,
  showChevron = false,
}) => {
  return (
    <div className="space-y-6">
      {REPORT_GROUPS.map((group) => (
        <div key={group.id} className="space-y-2">
          <div className="px-3 text-[11px] font-extrabold tracking-wider text-slate-500 uppercase">
            {group.name}
          </div>
          <div className="space-y-1">
            {group.items.map((item) => {
              const isActive = activeId === item.id;
              const Icon = getReportNavIcon(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer group ${
                    isActive
                      ? 'bg-[#e8f5e9] text-slate-900 shadow-xs'
                      : 'hover:bg-slate-100/80 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`shrink-0 transition-colors ${
                        isActive
                          ? 'text-[#15803d]'
                          : 'text-slate-400 group-hover:text-slate-700'
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-[13px] leading-tight truncate text-slate-900">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight truncate mt-0.5">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  {showChevron && !isActive && (
                    <ChevronRight size={16} className="text-slate-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
