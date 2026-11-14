import React, { useState } from 'react';
import { Smartphone, Check, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import type { ReceiptRegister } from '../../../../utils/beatReports';
import type { BeatRoute } from '../../../../constants/beats';
import {
  BigSwitch,
  DayHeading,
  EmptyNote,
  HeroCard,
  IconTile,
  LegendDot,
  PhoneDownloadBar,
  RowCard,
  SplitBar,
  UnifiedPhoneFilterBar,
  PhoneFilterBottomSheet,
  fmtDayShort,
  rs,
} from './PhoneKit';

const MODE: Record<string, string> = { 
  cash: 'Cash', 
  upi: 'UPI', 
  bank: 'Bank', 
  cheque: 'Cheque', 
  other: 'Other' 
};

const fmtShort = (d: string) => {
  if (!d) return '—';
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/** Customer's balance in plain words, with colour. */
const DueNote: React.FC<{ due: number; advance: number }> = ({ due, advance }) => {
  if (due > 0.004) return <div className="text-[12px] font-bold text-rose-700 tabular-nums">{rs(due)} due</div>;
  if (advance > 0.004) return <div className="text-[12px] font-bold text-sky-700 tabular-nums">{rs(advance)} advance</div>;
  return <div className="text-[12px] font-bold text-emerald-700">Settled ✓</div>;
};

export interface CustomerReceiptsPhoneProps {
  /** Collections view: only the by-customer list (the day-by-day list is the Day book). */
  onlyCustomer?: boolean;
  /** The Day book / By customer switch, shown at the top. */
  topExtra?: React.ReactNode;
  reg: ReceiptRegister;
  periodLabel: string;
  view: 'day' | 'customer';
  onView: (v: 'day' | 'customer') => void;
  beat: string;
  onBeat: (v: string) => void;
  activeBeats: BeatRoute[];
  search: string;
  onSearch: (v: string) => void;
  includeUnpaid: boolean;
  onIncludeUnpaid: (v: boolean) => void;
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
}

/** Phone layout of "Customer receipts": big received figure, by day / by customer, unified filter sheet, Excel + PDF at the bottom. */
export const CustomerReceiptsPhone: React.FC<CustomerReceiptsPhoneProps> = ({
  onlyCustomer,
  topExtra,
  reg,
  periodLabel,
  view,
  onView,
  beat,
  onBeat,
  activeBeats,
  search,
  onSearch,
  includeUnpaid,
  onIncludeUnpaid,
  onExcel,
  onPdf,
}) => {
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const hasBeats = activeBeats.length > 0;
  const beatOptions = [
    { id: 'all', label: 'All beats' },
    ...activeBeats.map((b) => ({ id: b.id, label: b.name })),
    { id: 'none', label: 'No beat yet' },
  ];

  const activeFilterCount = (beat !== 'all' ? 1 : 0) + (includeUnpaid ? 1 : 0);

  return (
    <div className="md:hidden space-y-3.5" id="report-customer-receipts-phone">
      {topExtra}

      {/* Title Header */}
      <div className="px-0.5">
        <h2 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
          {onlyCustomer ? 'Collections by customer' : 'Customer Receipts'}
        </h2>
        <p className="text-xs text-slate-500 font-medium">Due remaining is as of today</p>
      </div>

      {/* Hero Card with Emerald/Forest Green gradient */}
      <HeroCard tone="green" label="Received this period" value={rs(reg.total)}>
        <SplitBar
          label="Cash versus UPI and bank"
          parts={[
            { value: reg.cash, className: 'bg-[#10B981]' },
            { value: reg.other, className: 'bg-[#00E5FF]' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/95">
          <LegendDot dot="bg-[#10B981]">Cash {rs(reg.cash)}</LegendDot>
          <LegendDot dot="bg-[#00E5FF]">UPI / bank {rs(reg.other)}</LegendDot>
          <span className="text-white/70">
            {reg.count} receipt{reg.count === 1 ? '' : 's'}
          </span>
        </div>
        <div className="text-xs text-white/80 pt-2 border-t border-white/10 mt-2">
          Still due from {view === 'day' ? 'these customers' : 'customers listed'}:{' '}
          <strong className="text-white tabular-nums font-bold">{rs(reg.dueRemaining)}</strong>
        </div>
      </HeroCard>

      {/* Grouping switch: By day vs By customer */}
      {!onlyCustomer && (
        <BigSwitch
          label="Group receipts"
          value={view}
          onChange={onView}
          options={[
            { id: 'day', label: 'By day' },
            { id: 'customer', label: 'By customer' },
          ]}
        />
      )}

      {/* Unified Search and Filter Bar (replaces separate labels and separate chips) */}
      <UnifiedPhoneFilterBar
        search={search}
        onSearch={onSearch}
        placeholder="Search customer or receipt…"
        onOpenFilter={() => setIsFilterSheetOpen(true)}
        activeFilterCount={activeFilterCount}
      />

      {/* Filter Bottom Sheet Modal */}
      <PhoneFilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="Filter Receipts"
        activeCount={activeFilterCount}
        onReset={() => {
          onBeat('all');
          onIncludeUnpaid(false);
        }}
      >
        {/* Section 1: Beat Route */}
        {hasBeats && (
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Filter by Beat Route
            </label>
            <div className="grid grid-cols-2 gap-2">
              {beatOptions.map((opt) => {
                const isCurrent = beat === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onBeat(opt.id)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors text-center ${
                      isCurrent
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 2: Customer Options */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Customer Options
          </label>
          <button
            type="button"
            onClick={() => onIncludeUnpaid(!includeUnpaid)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all text-left ${
              includeUnpaid
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>Also show customers who owe but paid nothing</span>
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                includeUnpaid
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-300 bg-white'
              }`}
            >
              {includeUnpaid && <Check size={14} />}
            </div>
          </button>
        </div>
      </PhoneFilterBottomSheet>

      {/* Receipts List: By Day */}
      {view === 'day' && (
        <div className="space-y-3">
          {reg.days.length === 0 && <EmptyNote>No receipts in this period</EmptyNote>}
          {reg.days.map((g) => (
            <section key={g.date} className="space-y-2">
              <DayHeading 
                left={fmtDayShort(g.date)} 
                right={`${rs(g.total)} · ${g.rows.length} receipt${g.rows.length === 1 ? '' : 's'}`} 
              />
              <div className="space-y-2">
                {g.rows.map((r) => {
                  const isCash = r.mode === 'cash';
                  const what = r.kind === 'advance' ? 'On account' : r.invoiceLabel || '';
                  return (
                    <div 
                      key={r.key} 
                      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 flex items-center gap-3"
                    >
                      <div
                        className={`size-11 shrink-0 rounded-2xl flex items-center justify-center text-lg font-bold ${
                          isCash ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                        }`}
                      >
                        {isCash ? '₹' : <Smartphone size={20} />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] sm:text-[15px] font-bold text-slate-900 leading-snug break-words">
                          {r.customerName}
                        </div>
                        <div className="text-xs text-slate-500 leading-snug break-words mt-0.5">
                          {r.receiptNo} · {MODE[r.mode] || r.mode}
                          {what && ` · ${what}`}
                        </div>
                        {hasBeats && beat === 'all' && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{r.beatName}</div>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[16px] sm:text-[17px] font-extrabold text-emerald-700 tabular-nums leading-tight">
                          {rs(r.amount)}
                        </div>
                        <DueNote due={r.customerDue} advance={r.customerAdvance} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Receipts List: By Customer */}
      {view === 'customer' && (
        <div className="space-y-2">
          {reg.customers.length === 0 && <EmptyNote>No customers to show</EmptyNote>}
          {reg.customers.map((c) => (
            <div 
              key={c.key} 
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 flex items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[14px] sm:text-[15px] font-bold text-slate-900 leading-snug break-words">
                  {c.name}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {c.receipts > 0
                    ? `${c.receipts} receipt${c.receipts === 1 ? '' : 's'} · last ${fmtShort(c.lastReceiptDate)}`
                    : 'No receipt in this period'}
                </div>
                {hasBeats && beat === 'all' && (
                  <div className="text-[11px] text-slate-400 mt-0.5">{c.beatName}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div 
                  className={`text-[16px] sm:text-[17px] font-extrabold tabular-nums leading-tight ${
                    c.received > 0 ? 'text-emerald-700' : 'text-slate-300'
                  }`}
                >
                  {c.received > 0 ? rs(c.received) : '—'}
                </div>
                <DueNote due={c.due} advance={c.advance} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Excel and PDF Download Bar */}
      <PhoneDownloadBar 
        onExcel={onExcel} 
        onPdf={onPdf} 
        disabled={reg.count === 0 && reg.customers.length === 0} 
      />
    </div>
  );
};
