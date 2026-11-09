import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Check,
  CreditCard,
  FileText,
  IndianRupee,
  User,
  X,
} from 'lucide-react';
import { Bill, ExistingCustomer, PaymentMode, PaymentRecord } from '../../types';
import { money } from '../../utils/billing';
import { useLanguage } from '../../i18n/LanguageContext';
import { NumberPad, SegmentedPeriod } from '../ui/HomeKit';
import { InvoicePicker } from './InvoicePicker';
import { validatePaymentForm, summarizeErrors } from '../../utils/validation';
import { billBalance } from '../../utils/salesReturns';
import { todayISO, toLocalISODate } from "../../utils/dateLocal";

function toStandardIsoDate(input?: string): string {
  if (!input) return todayISO();
  const trimmed = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (trimmed.length > 10 && trimmed[10] === 'T') return trimmed.slice(0, 10);
  const parts = trimmed.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return toLocalISODate(d);
  }
  return todayISO();
}

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCustomerName?: string;
  initialBillId?: number;
  initialAmount?: number;
  initialDate?: string;
  initialMode?: PaymentMode;
  initialNote?: string;
  paymentToEdit?: PaymentRecord | null;
  existingCustomers: ExistingCustomer[];
  bills: Bill[];
  palette: any;
  onSavePayment: (data: {
    paymentId?: string;
    customerName: string;
    billId?: number;
    amount: number;
    paymentDate: string;
    mode: PaymentMode;
    referenceNote?: string;
  }) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  initialCustomerName = '',
  initialBillId,
  initialAmount,
  initialDate,
  initialMode = 'cash',
  initialNote = '',
  paymentToEdit,
  existingCustomers,
  bills,
  palette,
  onSavePayment,
}) => {
  const todayStr = todayISO();
  const yesterdayStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  })();

  const { t } = useLanguage();
  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [billId, setBillId] = useState<number | undefined>(initialBillId);
  const [amount, setAmount] = useState<string>(initialAmount !== undefined ? String(initialAmount) : '');
  const [paymentDate, setPaymentDate] = useState<string>(() => toStandardIsoDate(initialDate));
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initialMode);
  const [referenceNote, setReferenceNote] = useState<string>(initialNote);
  const [error, setError] = useState<string | null>(null);
  // On-screen number pad is optional: phones and tablets use their own numeric keyboard unless this is on
  const [showPad, setShowPad] = useState<boolean>(false);

  // The customer and bill lists are rebuilt (new array every time) whenever any background sync,
  // auto-save or realtime update arrives. They are only READ here, through refs. Listing them as
  // effect dependencies made the form reset itself mid-entry: the customer, invoice, amount, date
  // and mode jumped back to their starting values while you were choosing.
  const billsRef = useRef(bills);
  const customersListRef = useRef(existingCustomers);
  billsRef.current = bills;
  customersListRef.current = existingCustomers;

  // Sync state ONLY when the dialog opens or when a different payment / starting values are given.
  const initKey = [
    isOpen ? 1 : 0,
    paymentToEdit?.id ?? '',
    initialCustomerName,
    initialBillId ?? '',
    initialAmount ?? '',
    initialDate ?? '',
    initialMode,
    initialNote,
  ].join('|');
  const lastInitKeyRef = useRef<string>('');
  useEffect(() => {
    if (lastInitKeyRef.current === initKey) return;
    lastInitKeyRef.current = initKey;
    const bills = billsRef.current;
    const existingCustomers = customersListRef.current;
    if (paymentToEdit) {
      setCustomerName(paymentToEdit.customerName || '');
      setBillId(paymentToEdit.billId);
      setAmount(String(paymentToEdit.amount || ''));
      setPaymentDate(toStandardIsoDate(paymentToEdit.paymentDate));
      setPaymentMode(paymentToEdit.mode || 'cash');
      setReferenceNote(paymentToEdit.referenceNote || '');
    } else {
      setCustomerName(initialCustomerName);
      setBillId(initialBillId);
      setPaymentDate(toStandardIsoDate(initialDate));
      setPaymentMode(initialMode);
      setReferenceNote(initialNote);

      if (initialAmount !== undefined && initialAmount > 0) {
        setAmount(String(initialAmount));
      } else if (initialBillId) {
        const targetBill = bills.find((b) => b.id === initialBillId);
        if (targetBill) {
          const due = billBalance(targetBill);
          setAmount(due > 0 ? String(due) : String(targetBill.total));
        }
      } else if (initialCustomerName) {
        const cust = existingCustomers.find(
          (c) => c.name.trim().toLowerCase() === initialCustomerName.trim().toLowerCase()
        );
        if (cust && cust.balanceDue > 0) {
          setAmount(String(cust.balanceDue));
        }
      }
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey]);

  if (!isOpen) return null;

  // Selected customer details
  const matchedCustomer = existingCustomers.find(
    (c) => c.name.trim().toLowerCase() === customerName.trim().toLowerCase()
  );

  // Unpaid bills for the chosen customer
  const customerBills = bills.filter(
    (b) =>
      customerName &&
      b.retailer.trim().toLowerCase() === customerName.trim().toLowerCase()
  );
  const customerLiveBills = customerBills.filter((b) => b.status !== 'cancelled' && !(b as any).cancellation);
  const customerUnpaidBills = customerLiveBills.filter((b) => billBalance(b) > 0);

  const handleCustomerChange = (name: string) => {
    setCustomerName(name);
    const matched = existingCustomers.find(
      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (matched && matched.balanceDue > 0 && !amount) {
      setAmount(String(matched.balanceDue));
    }
    // If current selected bill does not belong to new customer, reset
    if (billId) {
      const b = bills.find((x) => x.id === billId);
      if (b && b.retailer.trim().toLowerCase() !== name.trim().toLowerCase()) {
        setBillId(undefined);
      }
    }
  };

  const handleBillSelect = (selectedIdStr: string) => {
    if (!selectedIdStr) {
      setBillId(undefined);
      return;
    }
    const id = Number(selectedIdStr);
    setBillId(id);
    const matched = bills.find((b) => b.id === id);
    if (matched) {
      const due = billBalance(matched);
      setAmount(due > 0 ? String(due) : String(matched.total));
      if (!customerName) {
        setCustomerName(matched.retailer);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCustomer = customerName.trim();
    const payErrors = validatePaymentForm({
      amount,
      paymentDate,
      customerName: cleanCustomer,
    });
    if (Object.keys(payErrors).length > 0) {
      setError(summarizeErrors(payErrors));
      return;
    }
    const numAmount = Number(String(amount).replace(/,/g, ''));

    // A receipt tied to one invoice cannot be more than that invoice still owes. (When editing a
    // receipt, its own old amount is already counted as paid, so it is added back.)
    if (billId) {
      const target = bills.find((x) => x.id === billId);
      if (target) {
        const ownOld =
          paymentToEdit && paymentToEdit.billId === billId
            ? Number(paymentToEdit.amount) || 0
            : 0;
        const maxAllowed = billBalance(target) + ownOld;
        if (numAmount > maxAllowed + 0.009) {
          setError(
            `Invoice #${billId} has only ₹${money(maxAllowed)} left to pay, but the amount is ₹${money(numAmount)}. ` +
              `Reduce the amount, or choose no invoice so the extra goes to the oldest unpaid invoices and then to advance.`,
          );
          return;
        }
      }
    }

    onSavePayment({
      paymentId: paymentToEdit ? paymentToEdit.id : undefined,
      customerName: cleanCustomer,
      billId: billId || undefined,
      amount: numAmount,
      paymentDate: paymentDate.trim(),
      mode: paymentMode,
      referenceNote: referenceNote.trim() || undefined,
    });

    onClose();
  };

  // Number pad: only edits the same `amount` text the input edits (same validation and save path).
  const handlePadKey = (key: string) => {
    setAmount((prev) => {
      const cur = String(prev ?? '');
      if (key === 'back') return cur.slice(0, -1);
      if (key === '.') return cur.includes('.') ? cur : (cur === '' ? '0.' : cur + '.');
      if (/^\d+\.\d{2}$/.test(cur)) return cur;
      return cur === '0' ? key : cur + key;
    });
  };

  const MODES: { id: PaymentMode; label: string; icon: string }[] = [
    { id: 'cash', label: 'Cash', icon: '💵' },
    { id: 'upi', label: 'UPI / QR', icon: '📱' },
    { id: 'bank', label: 'Bank / NEFT', icon: '🏦' },
    { id: 'cheque', label: 'Cheque', icon: '📝' },
    { id: 'other', label: 'Other', icon: '💳' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-payment-title"
    >
      <div
        className="w-full max-w-lg lg:max-w-4xl rounded-2xl shadow-2xl border-2 overflow-hidden bg-white my-auto"
        style={{ borderColor: palette.line }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between border-b text-white"
          style={{ backgroundColor: palette.navy }}
        >
          <div className="flex items-center gap-2">
            <CreditCard size={20} className="text-amber-300" />
            <div>
              <h2 id="record-payment-title" className="font-bold text-base sm:text-lg">
                {paymentToEdit ? 'Edit Payment Record' : 'Record Customer Payment'}
              </h2>
              <p className="hidden sm:block text-[11px] text-blue-200">
                Maintain accurate payment date, amount, mode & customer ledger
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 grid gap-4 lg:grid-cols-2 lg:gap-x-8 lg:items-start">
          {error && (
            <div className="lg:col-span-2 p-3 rounded-lg text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200">
              {error}
            </div>
          )}

          <div className="space-y-4 min-w-0">
          {customerName.trim() && (
            <div className="hh-collect__party">
              <p className="hh-label">{customerName.trim()}</p>
              <div className="hh-collect__party-row">
                <p className="hh-collect__due">₹{money(matchedCustomer ? Math.max(0, matchedCustomer.balanceDue) : 0)}</p>
                <span className="hh-collect__due-label">{t('collect.totalDue')}</span>
              </div>
            </div>
          )}

          {/* Customer Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Customer / Retailer Party *
            </label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                list="existing-customers-payment-modal"
                placeholder="Type or select customer name..."
                value={customerName}
                onChange={(e) => handleCustomerChange(e.target.value)}
                disabled={Boolean(paymentToEdit)}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm font-semibold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100"
                style={{ borderColor: palette.line }}
                required
              />
              <datalist id="existing-customers-payment-modal">
                {existingCustomers.map((c) => (
                  <option key={c.name} value={c.name}>
                    {(c.advance || 0) > 0.004 ? `Advance: ₹${money(c.advance || 0)}` : `Due: ₹${money(c.balanceDue)}`} ({c.phone || 'No phone'})
                  </option>
                ))}
              </datalist>
            </div>

            {/* Customer Quick Dues Badge */}
            {matchedCustomer && (
              <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600">
                  Total Outstanding Balance:
                </span>
                <span className={`font-black ${matchedCustomer.balanceDue > 0 ? 'text-rose-700' : (matchedCustomer.advance || 0) > 0.004 ? 'text-sky-700' : 'text-emerald-700'}`}>
                  {matchedCustomer.balanceDue > 0
                    ? `₹${money(matchedCustomer.balanceDue)} Due`
                    : (matchedCustomer.advance || 0) > 0.004
                      ? `₹${money(matchedCustomer.advance || 0)} Advance (paid ahead)`
                      : '✓ All Settled'}
                </span>
              </div>
            )}
          </div>

          {/* Invoice chooser: shown as soon as a customer with unpaid invoices is picked */}
          {customerUnpaidBills.length > 0 && !paymentToEdit && (
            <InvoicePicker
              bills={customerLiveBills}
              selectedId={billId}
              amount={Number(String(amount).replace(/,/g, '')) || 0}
              onSelect={(id, due) => {
                setBillId(id);
                if (due > 0) setAmount(String(Math.round(due * 100) / 100));
              }}
            />
          )}

          </div>

          <div className="space-y-4 min-w-0">
          {/* PAYMENT DATE (Accurately Maintained) */}
          <div className="space-y-1.5 bg-sky-50/60 p-3.5 rounded-xl border border-sky-200">
            <div className="flex items-center justify-between">
              <label htmlFor="payment-date-input" className="block text-xs font-black text-blue-950 flex items-center gap-1.5">
                <Calendar size={14} className="text-sky-700" />
                <span>Payment Date (Collection Date) *</span>
              </label>
              <span className="text-[11px] text-sky-700 font-semibold">Date of Payment</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                id="payment-date-input"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="flex-1 px-3 py-2 text-xs sm:text-sm font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                style={{ borderColor: palette.line }}
                required
              />

              {/* Quick Date Chips */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPaymentDate(todayStr)}
                  className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                    paymentDate === todayStr
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentDate(yesterdayStr)}
                  className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                    paymentDate === yesterdayStr
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Yesterday
                </button>
              </div>
            </div>
            <p className="text-[10.5px] text-blue-800">
              * Set the exact date this payment was collected or deposited so customer reports & daily registers remain 100% accurate.
            </p>
          </div>

          {/* Amount Paid */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Amount Received (₹) *
            </label>
            <div className="relative">
              <IndianRupee size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number" inputMode={showPad ? 'none' : 'decimal'}
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="hh-collect__amount w-full pl-9 pr-3 py-2.5 font-black border-2 rounded-xl"
                style={{ borderColor: palette.line }}
                required
              />
            </div>

            {/* Quick Amount Buttons */}
            {matchedCustomer && matchedCustomer.balanceDue > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => setAmount(String(matchedCustomer.balanceDue))}
                  className="hh-pill hh-pill--received min-h-[44px] px-4 cursor-pointer"
                >
                  {t('collect.payFull')} (₹{money(matchedCustomer.balanceDue)})
                </button>
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.round(matchedCustomer.balanceDue / 2)))}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-sky-50 text-blue-800 border border-blue-300 hover:bg-sky-100 cursor-pointer"
                >
                  50% Due (₹{money(Math.round(matchedCustomer.balanceDue / 2))})
                </button>
              </div>
            )}
          </div>

          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setShowPad((v) => !v)}
              aria-pressed={showPad}
              className={`hh-chip ${showPad ? '' : 'border border-slate-200'}`}
              data-active={showPad}
            >
              {showPad ? 'Hide number pad' : 'Number pad'}
            </button>
            {showPad && (
              <div className="hh-pad-wrap mt-3">
                <NumberPad onKey={handlePadKey} backspaceLabel={t('collect.backspace')} />
              </div>
            )}
          </div>

          {/* Payment Mode */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Payment Mode
            </label>
            <SegmentedPeriod
              ariaLabel={t('collect.mode')}
              options={MODES.map((m) => ({ id: m.id, label: m.label }))}
              value={paymentMode}
              onChange={(id) => setPaymentMode(id as PaymentMode)}
            />
          </div>

          {/* Reference / Cheque No / Notes */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Reference / Txn ID / Cheque # / Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. UPI Ref 429381928392, Cheque 049281, Cash received by driver"
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              className="w-full px-3 py-2 text-xs border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              style={{ borderColor: palette.line }}
            />
          </div>

          </div>

          {/* Action Buttons: big green save, Cancel stays visible */}
          <div className="lg:col-span-2 pt-3 border-t space-y-2" style={{ borderColor: palette.line }}>
            <button type="submit" className="hh-btn hh-btn--success w-full" style={{ minHeight: 56, fontSize: 17 }}>
              <Check size={20} aria-hidden="true" />
              <span>{paymentToEdit ? t('collect.saveChanges') : t('collect.saveReceipt')}</span>
            </button>
            {!paymentToEdit && <p className="text-center text-xs" style={{ color: 'var(--text-2)' }}>{t('collect.whatsappNote')}</p>}
            <button type="button" onClick={onClose} className="hh-btn hh-btn--ghost w-full">
              {t('sell.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
