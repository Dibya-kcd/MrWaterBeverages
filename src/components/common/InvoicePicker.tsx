import React, { useMemo } from 'react';
import { CheckCircle2, ListOrdered, Wallet } from 'lucide-react';
import type { Bill } from '../../types';
import { money } from '../../utils/billing';
import { billBalance } from '../../utils/salesReturns';
import { allocateReceipt } from '../../utils/paymentAllocation';

interface InvoicePickerProps {
  /** The selected customer's live (not cancelled) invoices. */
  bills: Bill[];
  /** Invoice the person chose; undefined = oldest dues first. */
  selectedId?: number;
  onSelect: (billId: number | undefined, due: number) => void;
  /** Amount typed so far; drives the "where this money goes" preview. */
  amount: number;
  className?: string;
}

/**
 * Once a customer is chosen, lists the invoices that still have a balance so the receipt can be tied to
 * one of them, or left on "Oldest dues first". Below the list a preview shows exactly how the amount will
 * be split (same allocateReceipt rules the save uses), so nobody is surprised by the result.
 */
export const InvoicePicker: React.FC<InvoicePickerProps> = ({ bills, selectedId, onSelect, amount, className = '' }) => {
  const unpaid = useMemo(
    () =>
      bills
        .filter((b) => billBalance(b) > 0.004)
        .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date > b.date ? 1 : -1)),
    [bills],
  );
  const totalDue = useMemo(() => unpaid.reduce((t, b) => t + billBalance(b), 0), [unpaid]);

  const preview = useMemo(
    () => (amount > 0 ? allocateReceipt(amount, bills, selectedId) : null),
    [amount, bills, selectedId],
  );

  const rowBase =
    'w-full text-left flex items-center gap-3 rounded-xl border px-3 py-2.5 min-h-[52px] cursor-pointer transition-colors';
  const rowOn = 'border-[var(--primary)] bg-[var(--primary-soft)]';
  const rowOff = 'border-[var(--border)] bg-white hover:bg-[var(--surface-soft)]';

  return (
    <section className={`space-y-2.5 ${className}`} aria-label="Apply payment to an invoice">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="hh-label">Apply to invoice</h3>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
          {unpaid.length} unpaid · ₹{money(totalDue)}
        </span>
      </div>

      <div role="radiogroup" aria-label="Invoice" className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
        <button
          type="button"
          role="radio"
          aria-checked={selectedId == null}
          onClick={() => onSelect(undefined, totalDue)}
          className={`${rowBase} ${selectedId == null ? rowOn : rowOff}`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white border border-[var(--border)]">
            <ListOrdered size={18} aria-hidden="true" style={{ color: 'var(--primary)' }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold" style={{ color: 'var(--text)' }}>
              Oldest dues first
            </span>
            <span className="block text-xs" style={{ color: 'var(--text-2)' }}>
              Automatic: pays the oldest unpaid invoice, then the next
            </span>
          </span>
          {selectedId == null && <CheckCircle2 size={20} aria-hidden="true" style={{ color: 'var(--primary)' }} />}
        </button>

        {unpaid.map((b) => {
          const due = billBalance(b);
          const partlyPaid = (Number(b.amountPaid) || 0) > 0.004;
          const on = selectedId === b.id;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSelect(b.id, due)}
              className={`${rowBase} ${on ? rowOn : rowOff}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold" style={{ color: 'var(--text)' }}>
                  Invoice #{b.id}
                </span>
                <span className="block text-xs" style={{ color: 'var(--text-2)' }}>
                  {b.date} · total ₹{money(b.total)}
                  {partlyPaid ? ` · paid ₹${money(b.amountPaid || 0)}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-extrabold tabular-nums" style={{ color: 'var(--due)' }}>
                  ₹{money(due)}
                </span>
                <span className="block text-[12px]" style={{ color: 'var(--text-2)' }}>
                  due
                </span>
              </span>
              {on && <CheckCircle2 size={20} aria-hidden="true" style={{ color: 'var(--primary)' }} />}
            </button>
          );
        })}
      </div>

      {preview && (
        <div
          className="rounded-xl border px-3 py-2.5 space-y-1.5"
          style={{ background: 'var(--received-bg)', borderColor: 'color-mix(in srgb, var(--received) 25%, transparent)' }}
          aria-live="polite"
        >
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--received)' }}>
            This payment will
          </p>
          {preview.allocations.map((a) => {
            const b = bills.find((x) => x.id === a.billId);
            const left = b ? Math.max(0, Math.round((billBalance(b) - a.amount) * 100) / 100) : 0;
            return (
              <p key={a.billId} className="flex items-start justify-between gap-3 text-sm" style={{ color: 'var(--text)' }}>
                <span>
                  Invoice #{a.billId} {left <= 0.004 ? 'settled in full' : `part paid, ₹${money(left)} left`}
                </span>
                <span className="font-bold tabular-nums">₹{money(a.amount)}</span>
              </p>
            );
          })}
          {preview.advance > 0.004 && (
            <p className="flex items-start justify-between gap-3 text-sm" style={{ color: 'var(--text)' }}>
              <span className="inline-flex items-center gap-1.5">
                <Wallet size={14} aria-hidden="true" /> Kept as advance (no invoice left)
              </span>
              <span className="font-bold tabular-nums">₹{money(preview.advance)}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
};
