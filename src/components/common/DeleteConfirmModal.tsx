import React, { useState } from 'react';
import { AlertTriangle, Boxes, Trash2, Wallet, X } from 'lucide-react';
import { Bill } from '../../types';
import { money } from '../../utils/billing';
import { billBalance } from '../../utils/salesReturns';
import { Button } from '../ui/Button';
import type { BillDeletePaymentAction, BillDeletePreview } from '../../context/LedgerContext';

interface DeleteConfirmModalProps {
  bill: Bill | null;
  /** From previewBillDelete(): stock that returns, money held, and anything that blocks the delete. */
  preview: BillDeletePreview | null;
  onConfirm: (billId: number, opts: { reason: string; paymentAction: BillDeletePaymentAction }) => void;
  onCancel: () => void;
  /** Lets the user reopen a closed trip right from the dialog when that is what blocks the delete. */
  onReopenTrip?: (tripId: number) => void;
  palette?: any;
  invoicePrefix?: string;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  bill,
  preview,
  onConfirm,
  onCancel,
  onReopenTrip,
  invoicePrefix = '',
}) => {
  const [reason, setReason] = useState('');
  const [paymentAction, setPaymentAction] = useState<BillDeletePaymentAction>('advance');

  if (!bill) return null;

  const due = billBalance(bill);
  const blockers = preview?.blockers ?? [];
  const received = preview?.receivedAmount ?? (Number(bill.amountPaid) || 0);
  const reasonOk = reason.trim().length >= 3;
  const canConfirm = reasonOk && blockers.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg bg-white border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                Delete Bill #{invoicePrefix}
                {bill.id}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {bill.retailer}
                {bill.phone ? ` (${bill.phone})` : ''} · {bill.date} · Total ₹{money(bill.total)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {blockers.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <div className="font-semibold">This bill cannot be deleted yet</div>
                {blockers.map((m, i) => (
                  <div key={i}>• {m}</div>
                ))}
                {preview?.reopenTripId != null && onReopenTrip && (
                  <button
                    type="button"
                    onClick={() => onReopenTrip(preview.reopenTripId as number)}
                    className="mt-1 px-2.5 py-1 rounded-lg bg-white border border-rose-300 text-rose-700 font-semibold cursor-pointer hover:bg-rose-100"
                  >
                    Reopen trip #{preview.reopenTripId}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Stock */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5" /> Stock
            </span>
            {preview && preview.totalCrates > 0 ? (
              <div className="border border-slate-200 rounded-xl bg-slate-50/60">
                <div className="px-3 py-2 text-xs text-slate-700 border-b border-slate-100">
                  These crates go back into stock: <b>{preview.stockDestination}</b>
                </div>
                <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto">
                  {preview.stockLines.map((l) => (
                    <div key={l.productId} className="px-3 py-1.5 flex items-center justify-between text-xs gap-2">
                      <span className="truncate text-slate-800">{l.productName}</span>
                      <span className="font-mono font-semibold px-2 py-0.5 rounded text-emerald-700 bg-emerald-50 border border-emerald-200/60 shrink-0">
                        +{l.qty} cr
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 border border-slate-200 rounded-xl bg-slate-50/60 px-3 py-2">
                {preview?.cancelled
                  ? 'This invoice was already cancelled, so its stock was released earlier. Nothing changes in stock.'
                  : 'No crates on this bill. Nothing changes in stock.'}
              </p>
            )}
          </div>

          {/* Money */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> Money
            </span>
            <div className="border border-slate-200 rounded-xl bg-slate-50/60 px-3 py-2 text-xs text-slate-700 flex items-center justify-between gap-2">
              <span>Received on this bill: <b>₹{money(received)}</b></span>
              <span className="text-slate-500">Due: ₹{money(due)} (disappears with the bill)</span>
            </div>
            {received > 0 ? (
              <div className="space-y-1.5">
                <label className="flex items-start gap-2 p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="bill-delete-payment"
                    checked={paymentAction === 'advance'}
                    onChange={() => setPaymentAction('advance')}
                    className="mt-0.5 accent-emerald-600 cursor-pointer"
                  />
                  <span>
                    <b>Keep ₹{money(received)} as customer advance</b> (recommended). The money stays on {bill.retailer}'s
                    account and can be used on another invoice or refunded.
                  </span>
                </label>
                <label className="flex items-start gap-2 p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="bill-delete-payment"
                    checked={paymentAction === 'remove'}
                    onChange={() => setPaymentAction('remove')}
                    className="mt-0.5 accent-rose-600 cursor-pointer"
                  />
                  <span>
                    <b>Remove the receipts too.</b> Use this only if the money was never really received or was
                    entered by mistake. The receipts are deleted from the customer's account.
                  </span>
                </label>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No money was received on this bill, so no payment entries change.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              Reason for deleting * <span className="font-normal opacity-60">(saved in the payment audit trail)</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. duplicate entry, wrong customer, test bill"
              className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none font-sans"
            />
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200/70 text-amber-900 text-xs leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              Deleting removes the invoice and its number from the books. If you need a GST credit note, cancel the
              invoice instead.
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!canConfirm}
            onClick={() => onConfirm(bill.id, { reason: reason.trim(), paymentAction })}
            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Yes, Delete Bill
          </Button>
        </div>
      </div>
    </div>
  );
};
