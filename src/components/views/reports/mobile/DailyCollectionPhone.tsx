import React from 'react';
import { ArrowUpRight, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import type { PaymentRecord } from '../../../../types';
import { rangeForPreset, type FilterPeriodPreset, type PeriodRange } from '../../../common/PeriodFilter';
import type { DayGroup, Line } from '../DailyCollectionReport';
import {
  Chips,
  DayHeading,
  EmptyNote,
  HeroCard,
  IconTile,
  LegendDot,
  PhoneDownloadBar,
  PhoneHeader,
  RowCard,
  SplitBar,
  Tag,
  fmtDayShort,
  rs,
} from './PhoneKit';

export type DailyFilter = 'all' | 'due' | 'pay' | 'out';

const FILTERS: { id: DailyFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'due', label: 'Sales with due' },
  { id: 'pay', label: 'Payments only' },
  { id: 'out', label: 'Paid out' },
];

const QUICK_PERIODS: { id: FilterPeriodPreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7days', label: '7 days' },
  { id: 'month', label: 'Month' },
];

/** Keep only the lines that match the chosen filter chip (days without lines disappear). */
export function filterDailyDays(days: DayGroup[], f: DailyFilter): DayGroup[] {
  if (f === 'all') return days;
  const keep = (l: Line) =>
    f === 'due'
      ? l.kind === 'sale' && (l.due || 0) > 0
      : f === 'pay'
        ? l.kind === 'collection' || l.kind === 'advance'
        : l.kind === 'refund' || l.kind === 'expense';
  return days.map((g) => ({ ...g, lines: g.lines.filter(keep) })).filter((g) => g.lines.length > 0);
}

export interface DailyCollectionPhoneProps {
  periodLabel: string;
  days: DayGroup[];
  totals: { cash: number; digital: number; out: number; due: number; billed: number };
  filter: DailyFilter;
  onFilter: (f: DailyFilter) => void;
  period?: PeriodRange;
  onPeriod?: (r: PeriodRange) => void;
  onRecordPayment: () => void;
  onEditPayment: (p: PaymentRecord) => void;
  onDeletePayment: (p: PaymentRecord) => void;
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
}

const LineRow: React.FC<{
  l: Line;
  onEdit: (p: PaymentRecord) => void;
  onDelete: (p: PaymentRecord) => void;
}> = ({ l, onEdit, onDelete }) => {
  const isOut = l.kind === 'refund' || l.kind === 'expense';
  const isSale = l.kind === 'sale';
  return (
    <RowCard className="p-3">
      <div className="flex items-start gap-3">
        <IconTile tone={isSale ? 'blue' : isOut ? 'red' : 'green'}>
          {isSale ? <Receipt size={20} /> : isOut ? <ArrowUpRight size={20} /> : '₹'}
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-slate-900 leading-snug break-words">{l.title}</div>
          <div className="text-xs text-slate-500 leading-snug break-words">{l.sub}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {isSale &&
              ((l.due || 0) <= 0 ? (
                <Tag tone="green">Paid upfront</Tag>
              ) : (
                <>
                  {(l.paid || 0) > 0 && <Tag tone="green">Paid {rs(l.paid || 0)}</Tag>}
                  <Tag tone="red">Due {rs(l.due || 0)}</Tag>
                </>
              ))}
            {(l.kind === 'collection' || l.kind === 'advance') && <Tag tone="blue">Payment only</Tag>}
            {isOut && <Tag tone="red">Paid out</Tag>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className={`text-[18px] font-extrabold tabular-nums leading-tight ${
              isOut ? 'text-rose-700' : isSale ? 'text-slate-900' : 'text-emerald-700'
            }`}
          >
            {isOut ? '−' : ''}
            {rs(l.amount)}
          </div>
          {isSale && <div className="text-[11px] text-slate-400">bill</div>}
        </div>
      </div>
      {l.payment && (
        <div className="mt-1 flex justify-end gap-1">
          <button
            type="button"
            aria-label="Edit payment"
            onClick={() => onEdit(l.payment!)}
            className="size-11 rounded-xl text-slate-500 active:bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            aria-label="Delete payment"
            onClick={() => onDelete(l.payment!)}
            className="size-11 rounded-xl text-slate-400 active:bg-rose-50 active:text-rose-700 flex items-center justify-center cursor-pointer"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </RowCard>
  );
};

/** Phone layout of "Daily collection": money in hand on top, a bar of cash / UPI / new due, then every sale or payment. */
export const DailyCollectionPhone: React.FC<DailyCollectionPhoneProps> = ({
  periodLabel,
  days,
  totals,
  filter,
  onFilter,
  period,
  onPeriod,
  onRecordPayment,
  onEditPayment,
  onDeletePayment,
  onExcel,
  onPdf,
}) => {
  const received = totals.cash + totals.digital;
  const net = received - totals.out;
  const shown = filterDailyDays(days, filter);
  const showDayHeadings = shown.length > 1;
  const isToday = period?.preset === 'today';

  return (
    <div className="md:hidden space-y-3" id="report-daily-collection-phone">
      <PhoneHeader
        title="Daily collection"
        sub="Sales and payments summary"
        right={
          <button
            type="button"
            onClick={onRecordPayment}
            className="shrink-0 min-h-[44px] px-3.5 rounded-2xl border border-black/10 bg-white text-[14px] font-bold text-[var(--primary)] inline-flex items-center gap-1.5 cursor-pointer active:bg-emerald-50"
          >
            <Plus size={16} aria-hidden="true" /> Payment
          </button>
        }
      />

      {period && onPeriod && (
        <Chips
          label="Period"
          value={QUICK_PERIODS.some((q) => q.id === period.preset) ? period.preset : ('' as FilterPeriodPreset)}
          onChange={(id) => onPeriod({ preset: id, ...rangeForPreset(id) })}
          options={QUICK_PERIODS}
        />
      )}

      <HeroCard tone="navy" label={isToday ? 'Money in hand today' : 'Money in hand'} value={rs(received)}>
        <SplitBar
          label="Cash, UPI and new due"
          parts={[
            { value: totals.cash, className: 'bg-emerald-400' },
            { value: totals.digital, className: 'bg-sky-400' },
            { value: totals.due, className: 'bg-rose-400' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/90">
          <LegendDot dot="bg-emerald-400">Cash {rs(totals.cash)}</LegendDot>
          <LegendDot dot="bg-sky-400">UPI {rs(totals.digital)}</LegendDot>
          <LegendDot dot="bg-rose-400">New due {rs(totals.due)}</LegendDot>
        </div>
      </HeroCard>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Billed', value: rs(totals.billed), c: 'text-slate-900' },
          { label: 'Paid out', value: rs(totals.out), c: totals.out > 0 ? 'text-rose-700' : 'text-slate-900' },
          { label: 'Net in hand', value: rs(net), c: net < 0 ? 'text-rose-700' : 'text-emerald-700' },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{t.label}</div>
            <div className={`text-[16px] font-extrabold tabular-nums leading-tight mt-0.5 ${t.c}`}>{t.value}</div>
          </div>
        ))}
      </div>

      <Chips label="Show" options={FILTERS} value={filter} onChange={onFilter} />

      {shown.length === 0 && <EmptyNote>Nothing recorded in this period</EmptyNote>}

      {shown.map((g) => (
        <section key={g.date} className="space-y-2">
          {showDayHeadings && (
            <DayHeading
              left={fmtDayShort(g.date)}
              right={`In hand ${rs(g.cashIn + g.digitalIn - g.out)}${g.dueCreated > 0 ? ` · Due ${rs(g.dueCreated)}` : ''}`}
            />
          )}
          {g.lines.map((l) => (
            <LineRow key={l.key} l={l} onEdit={onEditPayment} onDelete={onDeletePayment} />
          ))}
        </section>
      ))}

      <PhoneDownloadBar onExcel={onExcel} onPdf={onPdf} disabled={days.length === 0} />
    </div>
  );
};
