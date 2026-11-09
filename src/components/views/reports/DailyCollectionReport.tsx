import React, { useMemo, useState } from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { PaymentRecord } from '../../../types';
import { money } from '../../../utils/billing';
import { billNetTotal, round2 } from '../../../utils/salesReturns';
import { isAdvanceAdjustmentRow, isAdvanceRow } from '../../../utils/paymentAllocation';
import { EXPENSE_LABELS } from '../../../utils/netProfit';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import type { PeriodRange } from '../../common/PeriodFilter';
import { DailyCollectionPhone, filterDailyDays, type DailyFilter } from './mobile/DailyCollectionPhone';

export interface DailyCollectionReportProps {
  periodLabel: string;
  dateInPeriod: (date: string) => boolean;
  onRecordPayment: () => void;
  onEditPayment: (p: PaymentRecord) => void;
  /** Phone only: current period and a way to change it from the Today / Yesterday / 7 days / Month chips. */
  period?: PeriodRange;
  onPeriodChange?: (r: PeriodRange) => void;
}

export type LineKind = 'sale' | 'collection' | 'advance' | 'refund' | 'expense';

export interface Line {
  key: string;
  kind: LineKind;
  title: string; // customer / expense type
  sub: string; // invoice no, mode, note
  amount: number; // sale: bill total; others: money moved
  paid?: number; // sale only: paid on the day of the sale
  due?: number; // sale only: left unpaid on the day of the sale
  cash: number; // money in hand effect (+ in, - out), split below
  digital: number;
  payment?: PaymentRecord;
}

export interface DayGroup {
  date: string;
  lines: Line[];
  cashIn: number;
  digitalIn: number;
  out: number;
  dueCreated: number;
  billed: number;
}

const MODE: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank', cheque: 'Cheque', other: 'Other' };

const fmtDay = (d: string) => {
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

const chip = {
  paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  part: 'bg-amber-50 text-amber-800 border-amber-200',
  due: 'bg-rose-50 text-rose-700 border-rose-200',
  pay: 'bg-sky-50 text-sky-800 border-sky-200',
  out: 'bg-slate-100 text-slate-700 border-slate-200',
};

/**
 * One simple day-wise register (replaces "Payments & Collections" + "Day Book").
 * Every day lists one line per transaction:
 *   - a sale: shows what was paid up front and what stayed due on that day,
 *   - a payment received later for an older invoice: shown on the day it was collected, as payment only,
 *   - refunds and expenses paid out.
 * The day header shows money received that day and new due created that day.
 */
export const DailyCollectionReport: React.FC<DailyCollectionReportProps> = ({
  periodLabel,
  dateInPeriod,
  onRecordPayment,
  onEditPayment,
  period,
  onPeriodChange,
}) => {
  const { bills, payments, expenses, deletePayment, orgProfile } = useLedger();
  const [openOnlyDue, setOpenOnlyDue] = useState(false);
  const [phoneFilter, setPhoneFilter] = useState<DailyFilter>('all');

  const { days, totals } = useMemo(() => {
    const live = (bills || []).filter((b) => b.status !== 'cancelled' && !b.cancelled);
    const billById = new Map(live.map((b) => [b.id, b]));
    const map = new Map<string, DayGroup>();
    const day = (d: string): DayGroup => {
      let g = map.get(d);
      if (!g) {
        g = { date: d, lines: [], cashIn: 0, digitalIn: 0, out: 0, dueCreated: 0, billed: 0 };
        map.set(d, g);
      }
      return g;
    };

    // Payments by invoice
    const rowsByBill = new Map<number, PaymentRecord[]>();
    for (const p of payments || []) {
      if (!p.billId || p.isRefund || (Number(p.amount) || 0) <= 0) continue;
      const list = rowsByBill.get(p.billId) || [];
      list.push(p);
      rowsByBill.set(p.billId, list);
    }

    // 1) Sales, with what was paid on the same day
    for (const b of live) {
      const d = String(b.date || '').slice(0, 10);
      if (!d || !dateInPeriod(d)) continue;
      const net = billNetTotal(b);
      const rows = rowsByBill.get(b.id) || [];
      const sameDay = rows.filter((p) => String(p.paymentDate || '').slice(0, 10) <= d && p.mode !== 'credit');
      let paid: number;
      let cash = 0;
      let digital = 0;
      let mode = '';
      if (rows.length === 0) {
        // payment rows not created yet: fall back to what the invoice says was paid
        paid = Math.min(net, Number(b.amountPaid) || 0);
        mode = b.paymentMode || 'cash';
        if (mode === 'cash') cash = paid;
        else digital = paid;
      } else {
        paid = 0;
        for (const p of sameDay) {
          const a = Number(p.amount) || 0;
          paid += a;
          if (isAdvanceAdjustmentRow(p)) continue; // already counted when the advance came in
          if (p.mode === 'cash') cash += a;
          else digital += a;
        }
        mode = Array.from(new Set(sameDay.map((p) => MODE[p.mode] || p.mode))).join(' + ');
        paid = Math.min(net, round2(paid));
      }
      const due = Math.max(0, round2(net - paid));
      const g = day(d);
      g.billed += net;
      g.dueCreated += due;
      g.cashIn += cash;
      g.digitalIn += digital;
      g.lines.push({
        key: `s${b.id}`,
        kind: 'sale',
        title: b.retailer || 'Cash Sale',
        sub: `Invoice #${b.id}${paid > 0 && mode ? ` · ${mode}` : ''}`,
        amount: net,
        paid,
        due,
        cash,
        digital,
      });
    }

    // 2) Money received on a later day, shown once on the day it was collected
    for (const p of payments || []) {
      const d = String(p.paymentDate || '').slice(0, 10);
      const amt = Number(p.amount) || 0;
      if (!d || !dateInPeriod(d) || amt === 0 || p.mode === 'credit') continue;
      const g = day(d);
      const modeLabel = MODE[p.mode] || p.mode;
      if (p.isRefund || amt < 0) {
        const a = Math.abs(amt);
        g.out += a;
        g.lines.push({
          key: `r${p.id}`, kind: 'refund', title: p.customerName || 'Customer', sub: `Refund · ${modeLabel}`,
          amount: a, cash: 0, digital: 0, payment: p,
        });
        continue;
      }
      const bill = p.billId ? billById.get(p.billId) : undefined;
      const billDay = bill ? String(bill.date || '').slice(0, 10) : '';
      if (bill && d <= billDay) continue; // paid on the sale day: already inside the sale line
      const adj = isAdvanceAdjustmentRow(p);
      const isAdv = isAdvanceRow(p);
      const cash = !adj && p.mode === 'cash' ? amt : 0;
      const digital = !adj && p.mode !== 'cash' ? amt : 0;
      g.cashIn += cash;
      g.digitalIn += digital;
      g.lines.push({
        key: `p${p.id}`,
        kind: isAdv ? 'advance' : 'collection',
        title: p.customerName || 'Customer',
        sub: adj
          ? `Advance adjusted · Invoice #${p.billId}`
          : isAdv
            ? `Advance / on account · ${modeLabel}`
            : p.billId
              ? `Payment for Invoice #${p.billId}${billDay ? ` (${billDay.slice(8, 10)}/${billDay.slice(5, 7)})` : ''} · ${modeLabel}`
              : `Payment on account · ${modeLabel}`,
        amount: amt,
        cash,
        digital,
        payment: p,
      });
    }

    // 3) Expenses paid
    for (const e of expenses || []) {
      const d = String(e.date || '').slice(0, 10);
      const a = Number(e.amount) || 0;
      if (!d || !dateInPeriod(d) || a === 0) continue;
      const g = day(d);
      g.out += a;
      g.lines.push({
        key: `e${e.id}`, kind: 'expense', title: EXPENSE_LABELS[e.category] || String(e.category || 'Expense'),
        sub: String((e as any).note || (e as any).description || 'Expense paid'), amount: a, cash: 0, digital: 0,
      });
    }

    const order: Record<LineKind, number> = { sale: 0, collection: 1, advance: 2, refund: 3, expense: 4 };
    const days = Array.from(map.values())
      .map((g) => ({ ...g, lines: g.lines.sort((a, b) => order[a.kind] - order[b.kind]) }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const totals = days.reduce(
      (t, g) => ({
        cash: t.cash + g.cashIn,
        digital: t.digital + g.digitalIn,
        out: t.out + g.out,
        due: t.due + g.dueCreated,
        billed: t.billed + g.billed,
      }),
      { cash: 0, digital: 0, out: 0, due: 0, billed: 0 },
    );
    return { days, totals };
  }, [bills, payments, expenses, dateInPeriod]);

  const shown = openOnlyDue
    ? days
        .map((g) => ({ ...g, lines: g.lines.filter((l) => l.kind === 'sale' && (l.due || 0) > 0) }))
        .filter((g) => g.lines.length)
    : days;

  const exportCsv = () => {
    const q = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    let csv = 'Date,Type,Customer / Item,Details,Bill amount,Paid on day,Due on day,Money received,Money paid out\n';
    for (const g of days) {
      for (const l of g.lines) {
        const recv = l.cash + l.digital;
        const out = l.kind === 'refund' || l.kind === 'expense' ? l.amount : 0;
        csv += [g.date, l.kind, q(l.title), q(l.sub), l.kind === 'sale' ? l.amount : '', l.paid ?? '', l.due ?? '', recv || '', out || ''].join(',') + '\n';
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `daily-collection-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const received = totals.cash + totals.digital;
  const inHand = received - totals.out;
  const card = 'rounded-2xl border border-black/10 bg-white';

  const confirmDelete = (p: PaymentRecord) => {
    const reason = window.prompt(
      `Delete payment of ₹${money(Math.abs(p.amount))} for ${p.customerName}?\n\nEnter a reason (e.g. wrong amount, duplicate):`,
      '',
    );
    if (reason !== null) deletePayment(p.id, reason);
  };

  const KIND_LABEL: Record<LineKind, string> = {
    sale: 'Sale',
    collection: 'Payment received',
    advance: 'Advance',
    refund: 'Refund paid',
    expense: 'Expense paid',
  };

  // Excel / PDF follow the chip chosen on the phone (Everything, Sales with due, ...).
  const exportDays = filterDailyDays(days, phoneFilter);
  const exportExcel = () =>
    downloadXlsx(`daily-collection-${fileStamp()}.xlsx`, [
      {
        name: 'Transactions',
        header: ['Date', 'Type', 'Customer / item', 'Details', 'Bill amount', 'Paid on day', 'Due on day', 'Cash in', 'UPI / other in', 'Paid out'],
        rows: exportDays.flatMap((g) =>
          g.lines.map((l) => {
            const out = l.kind === 'refund' || l.kind === 'expense' ? l.amount : 0;
            return [g.date, KIND_LABEL[l.kind], l.title, l.sub, l.kind === 'sale' ? l.amount : '', l.paid ?? '', l.due ?? '', l.cash || '', l.digital || '', out || ''];
          }),
        ),
      },
      {
        name: 'Daily totals',
        header: ['Date', 'Billed', 'Cash in', 'UPI / other in', 'Paid out', 'Net in hand', 'New due'],
        rows: exportDays.map((g) => [g.date, g.billed, g.cashIn, g.digitalIn, g.out, g.cashIn + g.digitalIn - g.out, g.dueCreated]),
        total: ['Total', totals.billed, totals.cash, totals.digital, totals.out, inHand, totals.due],
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `daily-collection-${fileStamp()}.pdf`,
      title: 'Daily collection',
      subtitle: [orgProfile?.name || 'MrWater Distribution', `Period: ${periodLabel}`],
      landscape: true,
      sections: exportDays.map((g) => ({
        title: `${fmtDay(g.date)}  -  In hand Rs. ${money(g.cashIn + g.digitalIn - g.out)}  |  New due Rs. ${money(g.dueCreated)}`,
        header: ['Type', 'Customer / item', 'Details', 'Amount (Rs.)', 'Paid on day (Rs.)', 'Due on day (Rs.)'],
        rows: g.lines.map((l) => [KIND_LABEL[l.kind], l.title, l.sub, money(l.amount), l.paid !== undefined ? money(l.paid) : '', l.due !== undefined ? money(l.due) : '']),
        rightAlign: [3, 4, 5],
      })),
    });

  return (
    <>
      <DailyCollectionPhone
        periodLabel={periodLabel}
        days={days}
        totals={totals}
        filter={phoneFilter}
        onFilter={setPhoneFilter}
        period={period}
        onPeriod={onPeriodChange}
        onRecordPayment={onRecordPayment}
        onEditPayment={onEditPayment}
        onDeletePayment={confirmDelete}
        onExcel={exportExcel}
        onPdf={exportPdf}
      />
    <div className="hidden md:block space-y-3" id="report-daily-collection">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">Daily collection</h2>
          <p className="text-xs text-slate-500 truncate">{periodLabel} · one line per sale or payment</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={exportCsv} aria-label="Export CSV" className="size-10 rounded-xl border border-black/10 bg-white flex items-center justify-center text-slate-600 cursor-pointer">
            <Download size={17} />
          </button>
          <button type="button" onClick={onRecordPayment} className="h-10 px-3.5 rounded-xl bg-[var(--primary)] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">
            <Plus size={16} /> Payment
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={`${card} p-3`}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Received</div>
          <div className="text-lg font-extrabold text-emerald-700 tabular-nums">₹{money(received)}</div>
          <div className="text-[11px] text-slate-500">Cash ₹{money(totals.cash)} · Other ₹{money(totals.digital)}</div>
        </div>
        <div className={`${card} p-3`}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">New due</div>
          <div className="text-lg font-extrabold text-rose-700 tabular-nums">₹{money(totals.due)}</div>
          <div className="text-[11px] text-slate-500">of ₹{money(totals.billed)} billed</div>
        </div>
      </div>
      {totals.out > 0 && (
        <div className="text-xs text-slate-600 px-1">
          Paid out (refunds + expenses) ₹{money(totals.out)} · Net in hand{' '}
          <strong className={inHand < 0 ? 'text-rose-700' : 'text-slate-900'}>₹{money(inHand)}</strong>
        </div>
      )}

      <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700 px-1 select-none cursor-pointer">
        <input type="checkbox" checked={openOnlyDue} onChange={(e) => setOpenOnlyDue(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        Show only sales with due
      </label>

      {shown.length === 0 && <div className={`${card} py-10 text-center text-sm text-slate-400`}>Nothing recorded in this period</div>}

      {shown.map((g) => {
        const dayOut = g.out;
        return (
          <section key={g.date} className={`${card} overflow-hidden`}>
            <header className="px-3.5 py-2.5 bg-[#faf8f5] border-b border-black/5">
              <div className="text-[13px] font-bold text-slate-900">{fmtDay(g.date)}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                <span>In hand <strong className="text-emerald-700 tabular-nums">₹{money(g.cashIn + g.digitalIn - dayOut)}</strong></span>
                <span>Due <strong className="text-rose-700 tabular-nums">₹{money(g.dueCreated)}</strong></span>
                {g.cashIn + g.digitalIn > 0 && (
                  <span className="text-slate-400">Cash ₹{money(g.cashIn)} · Other ₹{money(g.digitalIn)}</span>
                )}
              </div>
            </header>
            <ul className="divide-y divide-black/5">
              {g.lines.map((l) => (
                <li key={l.key} className="px-3.5 py-2.5 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-slate-900 leading-snug break-words">{l.title}</div>
                    <div className="text-xs text-slate-500 leading-snug break-words">{l.sub}</div>
                    {l.kind === 'sale' && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {(l.due || 0) <= 0 ? (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${chip.paid}`}>Paid upfront</span>
                        ) : (l.paid || 0) > 0 ? (
                          <>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${chip.part}`}>Paid ₹{money(l.paid || 0)}</span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${chip.due}`}>Due ₹{money(l.due || 0)}</span>
                          </>
                        ) : (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${chip.due}`}>Due ₹{money(l.due || 0)}</span>
                        )}
                      </div>
                    )}
                    {(l.kind === 'collection' || l.kind === 'advance') && (
                      <span className={`mt-1 inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border ${chip.pay}`}>Payment only</span>
                    )}
                    {(l.kind === 'refund' || l.kind === 'expense') && (
                      <span className={`mt-1 inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border ${chip.out}`}>Paid out</span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[15px] font-extrabold tabular-nums ${l.kind === 'refund' || l.kind === 'expense' ? 'text-rose-700' : l.kind === 'sale' ? 'text-slate-900' : 'text-emerald-700'}`}>
                      {l.kind === 'refund' || l.kind === 'expense' ? '−' : ''}₹{money(l.amount)}
                    </div>
                    {l.kind === 'sale' && <div className="text-[11px] text-slate-400">bill</div>}
                    {l.payment && (
                      <div className="mt-1 flex justify-end gap-1">
                        <button type="button" aria-label="Edit payment" onClick={() => onEditPayment(l.payment!)} className="size-8 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center cursor-pointer">
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete payment"
                          onClick={() => {
                            const reason = window.prompt(
                              `Delete payment of ₹${money(Math.abs(l.payment!.amount))} for ${l.payment!.customerName}?\n\nEnter a reason (e.g. wrong amount, duplicate):`,
                              '',
                            );
                            if (reason !== null) deletePayment(l.payment!.id, reason);
                          }}
                          className="size-8 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
    </>
  );
};
