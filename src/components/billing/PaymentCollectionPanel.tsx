import React from 'react';
import { IndianRupee, CreditCard, Banknote, QrCode, Clock, CheckCircle2, AlertCircle, Percent } from 'lucide-react';
import { PaymentMode } from '../../types';
import { money } from '../../utils/billing';

interface PaymentCollectionPanelProps {
  totalAmount: number;
  subtotal: number;
  overallDiscountDraft: string;
  onDiscountChange: (val: string) => void;
  onApplyQuickDiscount: (amt: number, isPercent?: boolean) => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (mode: PaymentMode) => void;
  amountPaidDraft: string;
  onAmountPaidChange: (val: string) => void;
  balanceDue: number;
  isPaidInFull: boolean;
  paymentDate?: string;
  onPaymentDateChange?: (d: string) => void;
  paymentNote?: string;
  onPaymentNoteChange?: (n: string) => void;
  compact?: boolean;
}

export const PaymentCollectionPanel: React.FC<PaymentCollectionPanelProps> = ({
  totalAmount,
  subtotal,
  overallDiscountDraft,
  onDiscountChange,
  onApplyQuickDiscount,
  paymentMode,
  onPaymentModeChange,
  amountPaidDraft,
  onAmountPaidChange,
  balanceDue,
  isPaidInFull,
  paymentDate,
  onPaymentDateChange,
  paymentNote,
  onPaymentNoteChange,
  compact = false,
}) => {
  const currentDiscount = Number(overallDiscountDraft) || 0;

  const paymentModes: { id: PaymentMode; label: string; icon: React.ElementType }[] = [
    { id: 'cash', label: 'Cash', icon: Banknote },
    { id: 'upi', label: 'UPI / QR', icon: QrCode },
    { id: 'credit', label: 'Credit (Due)', icon: Clock },
    { id: 'cheque', label: 'Cheque', icon: CreditCard },
  ];

  return (
    <div className="space-y-4 bg-slate-50/50 p-4 sm:p-5 rounded-2xl border border-slate-200">
      {/* 1. Payment Mode Chips */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
          Payment Method
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {paymentModes.map(({ id, label, icon: Icon }) => {
            const isSelected = paymentMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onPaymentModeChange(id);
                  if (id === 'credit' && amountPaidDraft === '') {
                    onAmountPaidChange('0');
                  } else if (id !== 'credit' && amountPaidDraft === '0') {
                    onAmountPaidChange(String(totalAmount));
                  }
                }}
                className={`py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-sky-600 border-blue-950 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/80'
                }`}
              >
                <Icon size={16} className={isSelected ? 'text-white' : 'text-slate-500'} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Discounts & Settlements Row */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Percent size={13} className="text-amber-600" />
              <span>Special Invoice Cash Discount</span>
            </span>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Trade schemes & BOGO are already deducted from line items above.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-semibold">₹</span>
            <input
              type="number" inputMode="numeric"
              min="0"
              placeholder="0"
              value={overallDiscountDraft}
              onChange={(e) => onDiscountChange(e.target.value)}
              className="w-24 px-2 py-1 text-xs font-black text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
        </div>

        {/* Quick Discount Presets */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400">Quick:</span>
          {[
            { label: '₹50', val: 50, isPct: false },
            { label: '₹100', val: 100, isPct: false },
            { label: '2%', val: 2, isPct: true },
            { label: '5%', val: 5, isPct: true },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={() => onApplyQuickDiscount(btn.val, btn.isPct)}
              className="px-2 py-0.5 rounded text-[11px] font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
            >
              {btn.label}
            </button>
          ))}
          {currentDiscount > 0 && (
            <button
              type="button"
              onClick={() => onDiscountChange('0')}
              className="px-2 py-0.5 rounded text-[11px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer ml-auto transition-colors"
            >
              Clear Discount
            </button>
          )}
        </div>
      </div>

      {/* 3. Amount Paid Collection & Balance Due */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-slate-600">Total Bill Payable</span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              ₹{money(totalAmount)}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-700 block">Amount Collected / Paid</span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                  ₹
                </span>
                <input
                  type="number" inputMode="decimal"
                  min="0"
                  max={totalAmount}
                  placeholder="0"
                  value={amountPaidDraft}
                  onChange={(e) => onAmountPaidChange(e.target.value)}
                  className="w-32 pl-6 pr-2 py-1.5 text-sm font-black text-right bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </div>

              {/* Quick Fill Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onAmountPaidChange(String(totalAmount))}
                  className="px-2 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
                  title="Mark Fully Paid"
                >
                  Full
                </button>
                <button
                  type="button"
                  onClick={() => onAmountPaidChange(String(Math.round(totalAmount / 2)))}
                  className="px-2 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
                  title="Mark 50% Paid"
                >
                  Half
                </button>
                <button
                  type="button"
                  onClick={() => onAmountPaidChange('0')}
                  className="px-2 py-1.5 rounded-lg text-[11px] font-bold border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 cursor-pointer"
                  title="Mark 100% Credit Due"
                >
                  Zero
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Settlement Status Banner */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isPaidInFull ? (
              <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 size={13} />
                <span>Fully Settled</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-black text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                <AlertCircle size={13} />
                <span>Credit Balance Remaining</span>
              </span>
            )}
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-500 font-semibold block">
              Remaining Balance Due
            </span>
            <span
              className={`text-sm sm:text-base font-black ${
                balanceDue > 0 ? 'text-rose-600' : 'text-emerald-700'
              }`}
            >
              ₹{money(balanceDue)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Optional Payment Ref & Date */}
      {!compact && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {onPaymentDateChange && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Settlement Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => onPaymentDateChange(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          )}

          {onPaymentNoteChange && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Txn Ref / Cheque # / Notes (Optional)
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => onPaymentNoteChange(e.target.value)}
                placeholder="e.g. UPI Ref #, Cheque #4928"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
