import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, MapPin, Check } from 'lucide-react';
import { NO_BEAT, OVERDUE_AFTER_DAYS, type BeatSummary } from '../../../../utils/beatReports';
import {
  EmptyNote,
  HeroCard,
  MiniStat,
  PhoneDownloadBar,
  RowCard,
  SplitBar,
  UnifiedPhoneFilterBar,
  PhoneFilterBottomSheet,
  rs,
} from './PhoneKit';

type SortId = 'due' | 'sales' | 'az' | 'overdue';

const SORTS: { id: SortId; label: string }[] = [
  { id: 'due', label: 'Most due' },
  { id: 'sales', label: 'Most sales' },
  { id: 'az', label: 'A–Z' },
  { id: 'overdue', label: 'Overdue only' },
];

export interface BeatSalesDuePhoneProps {
  summary: BeatSummary;
  periodLabel: string;
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
}

/** Phone layout of "Beat-wise sales & due": total due on top, one card per beat, unified search & filter sheet. */
export const BeatSalesDuePhone: React.FC<BeatSalesDuePhoneProps> = ({ summary, periodLabel, onExcel, onPdf }) => {
  const { rows, totals } = summary;
  const [sort, setSort] = useState<SortId>('due');
  const [search, setSearch] = useState('');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const list = useMemo(() => {
    let base = sort === 'overdue' ? rows.filter((r) => r.overdue > 0.004) : rows.slice();
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter((r) => 
        r.beatName.toLowerCase().includes(q) ||
        r.customerRows.some((c) => c.name.toLowerCase().includes(q))
      );
    }
    base.sort((a, b) =>
      sort === 'sales' ? b.sales - a.sales : sort === 'az' ? a.beatName.localeCompare(b.beatName) : b.due - a.due,
    );
    return base;
  }, [rows, sort, search]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const activeFilterCount = sort !== 'due' ? 1 : 0;

  return (
    <div className="md:hidden space-y-3.5" id="report-beat-sales-due-phone">
      {/* Title Header */}
      <div className="px-0.5">
        <h2 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
          Beat Sales & Due
        </h2>
        <p className="text-xs text-slate-500 font-medium">Due as of today</p>
      </div>

      {/* Hero Card with Rose/Crimson gradient */}
      <HeroCard tone="red" label="Due remaining · all beats" value={rs(totals.due)}>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/95">
          <span>
            Sales <strong className="text-white tabular-nums font-bold">{rs(totals.sales)}</strong>
          </span>
          <span>
            Received <strong className="text-white tabular-nums font-bold">{rs(totals.received)}</strong>
          </span>
        </div>
        <SplitBar
          label="Received versus due"
          parts={[
            { value: totals.received, className: 'bg-emerald-400' },
            { value: totals.due, className: 'bg-rose-300' },
          ]}
        />
        {totals.overdue > 0.004 && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 pt-1">
            <AlertTriangle size={14} aria-hidden="true" />
            {rs(totals.overdue)} is older than {OVERDUE_AFTER_DAYS} days
          </div>
        )}
      </HeroCard>

      {/* Unified Search and Filter Bar */}
      <UnifiedPhoneFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search beat or customer…"
        onOpenFilter={() => setIsFilterSheetOpen(true)}
        activeFilterCount={activeFilterCount}
      />

      {/* Filter Bottom Sheet Modal */}
      <PhoneFilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="Sort & Filter Beats"
        activeCount={activeFilterCount}
        onReset={() => setSort('due')}
      >
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Sort Order
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SORTS.map((s) => {
              const isCurrent = sort === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSort(s.id)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors text-center ${
                    isCurrent
                      ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </PhoneFilterBottomSheet>

      {/* Beat Cards List */}
      {rows.length === 0 && (
        <EmptyNote>No beats or customers yet. Create beats in Settings → Beats and assign customers to them.</EmptyNote>
      )}
      {rows.length > 0 && list.length === 0 && (
        <EmptyNote>No beats match your search.</EmptyNote>
      )}

      <div className="space-y-3">
        {list.map((r) => {
          const edge = r.overdue > 0.004 ? 'red' : r.due > 0.004 ? 'amber' : 'green';
          const collectedPct = r.sales > 0.004 ? Math.min(100, Math.round((r.received * 100) / r.sales)) : null;
          const sorted = r.customerRows.slice().sort((a, b) => b.due - a.due);
          const preview = sorted.filter((c) => c.due > 0.004).slice(0, 2);
          const isOpen = open.has(r.beatId);
          const shownCustomers = isOpen ? sorted : preview;
          return (
            <div 
              key={r.beatId} 
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={17} className={r.beatId === NO_BEAT ? 'text-slate-400' : 'text-rose-600'} aria-hidden="true" />
                    <span className="text-[16px] sm:text-[17px] font-extrabold text-slate-900 break-words">{r.beatName}</span>
                    {r.active === false && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">OFF</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {r.customers} customers · {r.bills} bills
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[19px] sm:text-[21px] font-extrabold tabular-nums leading-tight ${r.due > 0.004 ? 'text-rose-700' : 'text-slate-400'}`}>
                    {rs(r.due)}
                  </div>
                  <div className="text-[11px] text-slate-400">due remaining</div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <MiniStat label="Sales" value={rs(r.sales)} tone="ink" />
                <MiniStat label="Received" value={rs(r.received)} tone="green" />
              </div>

              {collectedPct !== null && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Collected</span>
                    <span className="font-bold text-slate-700">{collectedPct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${collectedPct}%` }} />
                  </div>
                </div>
              )}

              {/* Customer rows */}
              {shownCustomers.length > 0 && (
                <div className="border-t border-slate-100 pt-2 space-y-1.5">
                  {shownCustomers.map((c) => (
                    <div key={c.key} className="flex items-center justify-between text-xs py-1">
                      <span className="font-semibold text-slate-800 truncate pr-2">{c.name}</span>
                      <span className={`font-bold tabular-nums shrink-0 ${c.due > 0.004 ? 'text-rose-700' : 'text-slate-400'}`}>
                        {rs(c.due)}
                      </span>
                    </div>
                  ))}
                  {sorted.length > 2 && (
                    <button
                      type="button"
                      onClick={() => toggle(r.beatId)}
                      className="text-xs font-bold text-blue-600 hover:underline pt-1 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isOpen ? 'Show less' : `Show all ${sorted.length} customers`}</span>
                      <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <PhoneDownloadBar onExcel={onExcel} onPdf={onPdf} disabled={rows.length === 0} />
    </div>
  );
};
