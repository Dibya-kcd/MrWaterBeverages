import React from 'react';
import { ChevronRight } from 'lucide-react';
import {
  REPORT_GROUPS,
  getReportNavIcon,
  getBadgeStyles,
  type ReportCategoryItem,
} from './ReportNavMenu';

interface ReportCatalogGridProps {
  onSelect: (id: string) => void;
  /** Optional highlight for the current report when used as a picker. */
  activeId?: string;
  className?: string;
}

/**
 * Tablet & desktop report catalog — one card per row, grouped by type.
 * Mobile Reports home is separate (`ReportsMobileHome`) and must not use this.
 */
export const ReportCatalogGrid: React.FC<ReportCatalogGridProps> = ({
  onSelect,
  activeId,
  className = '',
}) => {
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 items-start ${className}`}>
      {REPORT_GROUPS.map((group) => (
        <section
          key={group.id}
          aria-labelledby={`report-group-${group.id}`}
          className="rounded-2xl border border-black/10 bg-white overflow-hidden"
        >
          <h3
            id={`report-group-${group.id}`}
            className="px-3.5 py-2.5 bg-[#faf8f5] text-[11px] font-bold uppercase tracking-wide text-slate-600"
          >
            {group.name}
          </h3>
          <ul className="divide-y divide-black/5 border-t border-black/5">
            {group.items.map((item) => (
              <li key={item.id}>
                <ReportCatalogCard item={item} active={activeId === item.id} onSelect={() => onSelect(item.id)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

const ReportCatalogCard: React.FC<{
  item: ReportCategoryItem;
  active?: boolean;
  onSelect: () => void;
}> = ({ item, active, onSelect }) => {
  const Icon = getReportNavIcon(item.id);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={`group text-left w-full px-3.5 py-2.5 transition-colors cursor-pointer
        hover:bg-slate-50 active:bg-slate-100
        focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700/40
        ${active ? 'bg-emerald-50/60' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${getBadgeStyles(item.tone)}`}>
          <Icon size={18} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-[14px] text-slate-900 leading-snug">{item.title}</span>
            <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
          </div>
          <p className="text-xs text-slate-500 leading-snug line-clamp-1">{item.subtitle}</p>
        </div>
      </div>
    </button>
  );
};

export default ReportCatalogGrid;
