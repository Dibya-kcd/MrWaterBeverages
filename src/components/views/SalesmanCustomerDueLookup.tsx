import React, { useState, useMemo } from 'react';
import {
  Search,
  Phone,
  MessageSquare,
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  ShoppingCart,
  Mic,
  MicOff,
  UserCheck,
  Calendar,
  CreditCard,
  X,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Bill } from '../../types';
import { money } from '../../utils/billing';
import { isSpeechRecognitionSupported, startSpeechRecognition } from '../../utils/speechRecognition';

export interface CustomerDueRecord {
  name: string;
  phone: string;
  balanceDue: number;
  lastBillDate: string | null;
  lastBillAmount: number | null;
  unpaidBills: { id: number; date: string; due: number }[];
}

interface SalesmanCustomerDueLookupProps {
  bills: Bill[];
  onSelectForSale?: (customerName: string, phone: string) => void;
  onRecordPayment: (billId: number, amount: number) => void;
  palette: any;
  isLowVision?: boolean;
  speakAssistiveText?: (text: string) => void;
}

export const SalesmanCustomerDueLookup: React.FC<SalesmanCustomerDueLookupProps> = ({
  bills,
  onSelectForSale,
  onRecordPayment,
  palette,
  isLowVision = false,
  speakAssistiveText,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDueOnly, setFilterDueOnly] = useState(true);
  const [isVoiceSearching, setIsVoiceSearching] = useState(false);

  // Active payment recording modal state
  const [payingCustomer, setPayingCustomer] = useState<CustomerDueRecord | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMode, setPayMode] = useState<'Cash' | 'UPI' | 'Cheque'>('Cash');
  const [payNote, setPayNote] = useState<string>('');
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string | null>(null);

  // Voice Search Handler
  const handleVoiceSearch = () => {
    if (isVoiceSearching) {
      setIsVoiceSearching(false);
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    setIsVoiceSearching(true);
    if (speakAssistiveText) speakAssistiveText('Listening for customer name.');

    startSpeechRecognition({
      onStart: () => setIsVoiceSearching(true),
      onResult: (transcript) => {
        setIsVoiceSearching(false);
        setSearchQuery(transcript);
        if (speakAssistiveText) speakAssistiveText(`Searching customer ${transcript}`);
      },
      onError: () => {
        setIsVoiceSearching(false);
      },
      onEnd: () => setIsVoiceSearching(false),
    });
  };

  // Compile strictly scoped customer due records from all bills
  // Note: Only exposes Name, Phone, Outstanding Balance, Last Bill Date & Last Bill Amount
  const customerRecords: CustomerDueRecord[] = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        phone: string;
        allBills: { id: number; date: string; total: number; amountPaid: number }[];
      }
    >();

    for (const b of bills) {
      const rawName = (b.retailer || '').trim();
      if (!rawName) continue;
      const key = rawName.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          name: rawName,
          phone: b.phone || '',
          allBills: [],
        });
      }

      const entry = map.get(key)!;
      if (b.phone && !entry.phone) {
        entry.phone = b.phone;
      }
      entry.allBills.push({
        id: b.id,
        date: b.date || '',
        total: Number(b.total) || 0,
        amountPaid: Number(b.amountPaid) || 0,
      });
    }

    const records: CustomerDueRecord[] = [];

    for (const [, data] of map.entries()) {
      // Sort bills chronological (oldest to newest for FIFO payment allocation)
      const sortedBills = [...data.allBills].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Most recent bill
      const mostRecent = sortedBills[sortedBills.length - 1];

      // Calculate unpaid bills and total balance due
      const unpaidBills: { id: number; date: string; due: number }[] = [];
      let totalDue = 0;

      for (const bill of sortedBills) {
        const due = Math.max(0, bill.total - bill.amountPaid);
        if (due > 0.01) {
          totalDue += due;
          unpaidBills.push({ id: bill.id, date: bill.date, due });
        }
      }

      records.push({
        name: data.name,
        phone: data.phone,
        balanceDue: Math.round(totalDue * 100) / 100,
        lastBillDate: mostRecent ? mostRecent.date : null,
        lastBillAmount: mostRecent ? mostRecent.total : null,
        unpaidBills,
      });
    }

    // Default sorting: highest balance due first, then alphabetically
    return records.sort((a, b) => {
      if (b.balanceDue !== a.balanceDue) return b.balanceDue - a.balanceDue;
      return a.name.localeCompare(b.name);
    });
  }, [bills]);

  // Filtered customer records based on query and filterDueOnly
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return customerRecords.filter((c) => {
      const matchQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q));

      const matchDue = !filterDueOnly || c.balanceDue > 0;
      return matchQuery && matchDue;
    });
  }, [customerRecords, searchQuery, filterDueOnly]);

  // Summary figures
  const totalDueSum = useMemo(() => {
    return customerRecords.reduce((sum, c) => sum + c.balanceDue, 0);
  }, [customerRecords]);

  const countWithDue = useMemo(() => {
    return customerRecords.filter((c) => c.balanceDue > 0).length;
  }, [customerRecords]);

  // Open Payment Drawer / Modal
  const handleOpenPaymentModal = (cust: CustomerDueRecord) => {
    setPayingCustomer(cust);
    setPayAmount(String(cust.balanceDue));
    setPayMode('Cash');
    setPayNote('');
  };

  // Submit payment allocation
  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingCustomer) return;

    const entered = parseFloat(payAmount);
    if (isNaN(entered) || entered <= 0) {
      alert('Please enter a valid payment amount greater than zero.');
      return;
    }

    const payToApply = Math.min(entered, payingCustomer.balanceDue);
    let remaining = payToApply;

    // Allocate across unpaid bills (FIFO: oldest unpaid bills first)
    for (const bill of payingCustomer.unpaidBills) {
      if (remaining <= 0.001) break;
      const amountForThisBill = Math.min(bill.due, remaining);
      onRecordPayment(bill.id, amountForThisBill);
      remaining -= amountForThisBill;
    }

    const newDue = Math.max(0, payingCustomer.balanceDue - payToApply);
    const successText = `Payment of ₹${money(payToApply)} (${payMode}) recorded for ${payingCustomer.name}. Remaining due: ₹${money(newDue)}.`;

    setPaymentSuccessMsg(successText);
    if (speakAssistiveText) {
      speakAssistiveText(`Payment of ₹${money(payToApply)} recorded for ${payingCustomer.name}.`);
    }

    setPayingCustomer(null);
    setPayAmount('');
    setTimeout(() => setPaymentSuccessMsg(null), 5000);
  };

  return (
    <section id="salesman-customer-due-lookup" className="space-y-4 max-w-5xl mx-auto pb-8">
      {/* Top Banner & Field Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className="p-4 rounded-xl border-2 shadow-xs"
          style={{
            backgroundColor: palette.panel,
            borderColor: palette.line,
          }}
        >
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">
            Total Customer Outstandings
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-700 mt-1 font-mono">
            ₹{money(totalDueSum)}
          </div>
          <div className="text-xs font-bold text-slate-500 mt-1">
            Across {countWithDue} retailer accounts
          </div>
        </div>

        <div
          className="p-4 rounded-xl border-2 shadow-xs"
          style={{
            backgroundColor: palette.panel,
            borderColor: palette.line,
          }}
        >
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">
            Accounts Tracked
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 font-mono">
            {customerRecords.length}
          </div>
          <div className="text-xs font-bold text-slate-500 mt-1">
            Active retail customers
          </div>
        </div>

        <div
          className="p-4 rounded-xl border-2 shadow-xs flex flex-col justify-between"
          style={{
            backgroundColor: '#EFF6FF',
            borderColor: '#93C5FD',
          }}
        >
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-blue-900">
              Payment Due Lookup
            </div>
            <p className="text-xs text-blue-800 font-medium mt-1 leading-relaxed">
              Verify outstanding dues before dispatching stock. Record on-the-spot cash/UPI collections directly into the ledger.
            </p>
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {paymentSuccessMsg && (
        <div
          role="alert"
          className="p-3.5 bg-emerald-50 border-2 border-emerald-500 rounded-xl text-emerald-900 font-black text-sm flex items-center gap-2.5 shadow-xs transition-all animate-fadeIn"
        >
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <span className="flex-1">{paymentSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setPaymentSuccessMsg(null)}
            className="p-1 rounded hover:bg-emerald-100 text-emerald-700"
            aria-label="Dismiss alert"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search & Quick Filters */}
      <div
        className="p-3.5 rounded-xl border-2 shadow-xs space-y-3"
        style={{
          backgroundColor: palette.panel,
          borderColor: palette.line,
        }}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              id="input-customer-due-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer by shop name or phone number..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-slate-300 font-bold text-slate-900 text-sm focus:border-blue-900 focus:outline-none bg-white transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            type="button"
            id="btn-voice-search-customer-due"
            onClick={handleVoiceSearch}
            aria-label="Voice search customer"
            title="Voice search customer or shop name"
            className={`min-h-[44px] px-3 rounded-xl border-2 flex items-center justify-center transition-all cursor-pointer ${
              isVoiceSearching
                ? 'bg-rose-600 border-rose-600 text-white animate-pulse'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
            }`}
          >
            {isVoiceSearching ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-toggle-due-only"
              onClick={() => setFilterDueOnly((v) => !v)}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg border-2 font-black cursor-pointer transition-colors ${
                filterDueOnly
                  ? 'bg-rose-100 border-rose-400 text-rose-900'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {filterDueOnly ? '✓ Showing Dues Only' : 'Filter: Balance Due Only'}
            </button>

            {filterDueOnly && (
              <button
                type="button"
                onClick={() => setFilterDueOnly(false)}
                className="text-xs text-slate-500 hover:text-slate-800 font-bold underline cursor-pointer"
              >
                Show All Customers
              </button>
            )}
          </div>

          <span className="font-bold text-slate-500">
            Showing {filteredCustomers.length} of {customerRecords.length} accounts
          </span>
        </div>
      </div>

      {/* Customer Lookup Records List */}
      <div className="space-y-2.5">
        {filteredCustomers.length === 0 ? (
          <div
            className="p-8 text-center rounded-xl border-2 border-dashed space-y-2 text-slate-500"
            style={{ borderColor: palette.line, backgroundColor: palette.panel }}
          >
            <UserCheck size={36} className="mx-auto text-slate-400" />
            <div className="font-black text-sm text-slate-700">No customers found</div>
            <div className="text-xs font-semibold">
              {searchQuery
                ? `No customer matching "${searchQuery}". Try a different name or phone.`
                : 'No customers currently have an outstanding balance.'}
            </div>
            {filterDueOnly && (
              <button
                type="button"
                onClick={() => setFilterDueOnly(false)}
                className="mt-2 inline-block px-3 py-1.5 rounded-lg bg-blue-900 text-white font-bold text-xs"
              >
                View All Customer Records
              </button>
            )}
          </div>
        ) : (
          filteredCustomers.map((cust) => {
            const hasDue = cust.balanceDue > 0;

            return (
              <div
                key={cust.name}
                id={`customer-due-card-${cust.name.replace(/\s+/g, '-').toLowerCase()}`}
                className="rounded-xl border-2 p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all"
                style={{
                  backgroundColor: palette.panel,
                  borderColor: hasDue ? '#FCA5A5' : palette.line,
                }}
              >
                {/* Left: Customer Info, Balance Due, Last Bill */}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-slate-900 text-base sm:text-lg leading-tight">
                      {cust.name}
                    </h3>

                    {hasDue ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-rose-100 text-rose-800 border border-rose-300">
                        ₹{money(cust.balanceDue)} Due
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Clear • No Due
                      </span>
                    )}
                  </div>

                  {/* Scoped Details: Phone + Last Bill Date and Amount */}
                  <div className="flex items-center gap-x-4 gap-y-1 text-xs font-bold text-slate-600 flex-wrap">
                    {cust.phone && (
                      <span className="flex items-center gap-1 font-mono text-slate-700">
                        <Phone size={13} className="text-slate-400 shrink-0" />
                        <span>{cust.phone}</span>
                      </span>
                    )}

                    {cust.lastBillDate ? (
                      <span className="flex items-center gap-1 text-slate-600">
                        <Clock size={13} className="text-slate-400 shrink-0" />
                        <span>
                          Last Bill: <strong>{cust.lastBillDate}</strong>
                          {cust.lastBillAmount !== null && (
                            <span className="text-slate-800"> (₹{money(cust.lastBillAmount)})</span>
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">No bill history recorded</span>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {cust.phone && (
                    <a
                      href={`https://wa.me/91${cust.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `Hello ${cust.name}, this is regarding your balance payment of ₹${money(
                          cust.balanceDue
                        )} for beverage supplies from Radhika Distribution.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-[40px] px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold text-xs flex items-center gap-1.5 hover:bg-emerald-100 transition-colors"
                      title="Send WhatsApp payment reminder"
                    >
                      <MessageSquare size={14} className="text-emerald-700" />
                      <span>WhatsApp</span>
                    </a>
                  )}

                  {/* Record Payment Button */}
                  {hasDue ? (
                    <button
                      type="button"
                      id={`btn-record-payment-${cust.name.replace(/\s+/g, '-').toLowerCase()}`}
                      onClick={() => handleOpenPaymentModal(cust)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl border-2 border-emerald-600 bg-emerald-600 text-white font-black text-xs sm:text-sm flex items-center gap-1.5 hover:bg-emerald-700 cursor-pointer shadow-xs transition-colors"
                      title={`Record payment collected from ${cust.name}`}
                    >
                      <IndianRupee size={15} />
                      <span>Record Payment</span>
                    </button>
                  ) : (
                    <div className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 bg-slate-100">
                      Settled
                    </div>
                  )}

                  {/* Start New Sale Shortcut */}
                  {onSelectForSale && (
                    <button
                      type="button"
                      onClick={() => onSelectForSale(cust.name, cust.phone || '')}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl border-2 border-blue-900 bg-white text-blue-900 font-black text-xs flex items-center gap-1.5 hover:bg-blue-50 cursor-pointer shadow-xs transition-colors"
                      title={`Start fresh delivery sale for ${cust.name}`}
                    >
                      <ShoppingCart size={14} />
                      <span>New Sale</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* RECORD PAYMENT MODAL / DIALOG */}
      {payingCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-record-payment-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setPayingCustomer(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 shadow-2xl p-5 sm:p-6 space-y-4"
            style={{
              backgroundColor: '#FFFFFF',
              borderColor: palette.line,
              color: '#0F172A',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 id="modal-record-payment-title" className="font-black text-base sm:text-lg text-slate-900 leading-tight">
                    Record Payment Collection
                  </h3>
                  <p className="text-xs text-slate-500">Log customer cash or UPI receipt</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPayingCustomer(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Customer Summary Pill */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="font-black text-sm text-slate-900">{payingCustomer.name}</div>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-500">
                  {payingCustomer.phone ? `Phone: ${payingCustomer.phone}` : 'Retail Account'}
                </span>
                <span className="text-rose-700 font-black">
                  Current Due: ₹{money(payingCustomer.balanceDue)}
                </span>
              </div>
            </div>

            {/* Payment Form */}
            <form onSubmit={handleConfirmPayment} className="space-y-3.5">
              <div>
                <label
                  htmlFor="input-collect-amount"
                  className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1"
                >
                  Amount Collected (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-slate-500 text-base">
                    ₹
                  </span>
                  <input
                    id="input-collect-amount"
                    type="number"
                    step="0.01"
                    min="1"
                    max={payingCustomer.balanceDue}
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border-2 border-slate-300 font-mono font-black text-lg text-slate-900 focus:border-emerald-600 focus:outline-none"
                    placeholder="Enter amount collected..."
                  />
                </div>

                {/* Quick amount shortcut pills */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(payingCustomer.balanceDue))}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                  >
                    Full Due (₹{money(payingCustomer.balanceDue)})
                  </button>
                  {[500, 1000, 2000].map((amt) => {
                    if (amt >= payingCustomer.balanceDue) return null;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setPayAmount(String(amt))}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        ₹{amt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Payment Mode Selection */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  Payment Mode *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'UPI', 'Cheque'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPayMode(mode)}
                      className={`min-h-[40px] py-1.5 px-2 rounded-xl border-2 font-black text-xs cursor-pointer transition-all ${
                        payMode === mode
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Reference / Note */}
              <div>
                <label
                  htmlFor="input-collect-note"
                  className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1"
                >
                  Reference / Note (Optional)
                </label>
                <input
                  id="input-collect-note"
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="e.g. GPay UPI Ref 349829 or Cash collected"
                  className="w-full px-3.5 py-2 rounded-xl border-2 border-slate-300 font-bold text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPayingCustomer(null)}
                  className="flex-1 min-h-[44px] py-2 px-4 rounded-xl border-2 border-slate-300 font-bold text-sm text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors text-center"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  id="btn-confirm-record-payment"
                  className="flex-1 min-h-[44px] py-2 px-4 rounded-xl border-2 border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <CheckCircle2 size={16} />
                  <span>Save Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
