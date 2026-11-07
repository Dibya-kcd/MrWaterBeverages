import React, { useState, useMemo } from 'react';
import { notify } from "../../utils/toast";
import {
  Search,
  Phone,
  MessageSquare,
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  Mic,
  MicOff,
  UserCheck,
  Calendar,
  CreditCard,
  X,
  Clock,
  ArrowRight,
  Share2,
  Download,
  FileText,
  Copy,
} from 'lucide-react';
import { Bill } from '../../types';
import { money } from '../../utils/billing';
import { useLedger } from '../../context/LedgerContext';
import { isSpeechRecognitionSupported, startSpeechRecognition } from '../../utils/speechRecognition';
import { billBalance } from '../../utils/salesReturns';
import { OdiaName } from '../common/OdiaName';
import { todayISO, toLocalISODate } from "../../utils/dateLocal";

export interface CustomerDueRecord {
  name: string;
  phone: string;
  balanceDue: number;
  lastBillDate: string | null;
  lastBillAmount: number | null;
  unpaidBills: { id: number; date: string; due: number }[];
  /** Paid ahead by the customer (credit on account), from the customer ledger. */
  advance?: number;
}

interface SalesmanCustomerDueLookupProps {
  bills: Bill[];
  onSelectForSale?: (customerName: string, phone: string) => void;
  onRecordPayment: (billId: number, amount: number, paymentDate?: string, mode?: any, referenceNote?: string) => void;
  palette: any;
  isLowVision?: boolean;
  speakAssistiveText?: (text: string) => void;
}

export const SalesmanCustomerDueLookup: React.FC<SalesmanCustomerDueLookupProps> = ({
  bills,
  onRecordPayment,
  palette,
  isLowVision = false,
  speakAssistiveText,
}) => {
  const { orgProfile, existingCustomers: ledgerCustomers, recordCustomerPayment } = useLedger();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDueOnly, setFilterDueOnly] = useState(true);
  const [isVoiceSearching, setIsVoiceSearching] = useState(false);

  // Active payment collection modal state (like owner)
  const [payingCustomer, setPayingCustomer] = useState<CustomerDueRecord | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(() => todayISO());
  const [payMode, setPayMode] = useState<'Cash' | 'UPI' | 'Cheque'>('Cash');
  const [payNote, setPayNote] = useState<string>('');
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string | null>(null);

  // Share statement modal state
  const [sharingCustomer, setSharingCustomer] = useState<CustomerDueRecord | null>(null);

  const todayStr = todayISO();
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);

  // Voice Search Handler
  const handleVoiceSearch = () => {
    if (isVoiceSearching) {
      setIsVoiceSearching(false);
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      notify('Speech recognition is not supported in this browser.');
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
        const due = billBalance(bill);
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
        advance:
          ledgerCustomers.find(
            (c) => c.name.trim().toLowerCase() === data.name.trim().toLowerCase(),
          )?.advance || 0,
      });
    }

    // Default sorting: highest balance due first, then alphabetically
    return records.sort((a, b) => {
      if (b.balanceDue !== a.balanceDue) return b.balanceDue - a.balanceDue;
      return a.name.localeCompare(b.name);
    });
  }, [bills, ledgerCustomers]);

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
    setSelectedBillId(null);
    setPayAmount(String(cust.balanceDue));
    setPayDate(todayISO());
    setPayMode('Cash');
    setPayNote('');
  };

  // Submit payment allocation
  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingCustomer) return;

    const entered = parseFloat(payAmount);
    if (isNaN(entered) || entered <= 0) {
      notify('Please enter a valid payment amount greater than zero.');
      return;
    }

    const payModeLower = payMode.toLowerCase() as any;

    if (selectedBillId !== null) {
      // Specific invoice selected like owner
      const targetBill = payingCustomer.unpaidBills.find((b) => b.id === selectedBillId);
      const maxAllowed = targetBill ? targetBill.due : payingCustomer.balanceDue;
      const payToApply = Math.min(entered, maxAllowed);

      if (recordCustomerPayment) {
        recordCustomerPayment(payingCustomer.name, payToApply, payDate, payModeLower, payNote.trim() || undefined, selectedBillId);
      } else {
        onRecordPayment(selectedBillId, payToApply, payDate, payModeLower, payNote.trim() || undefined);
      }

      const newDue = Math.max(0, payingCustomer.balanceDue - payToApply);
      const successText = `Payment of ₹${money(payToApply)} (${payMode}) recorded for Invoice #${selectedBillId} (${payingCustomer.name}). Remaining due: ₹${money(newDue)}.`;
      setPaymentSuccessMsg(successText);
      if (speakAssistiveText) {
        speakAssistiveText(`Payment of ₹${money(payToApply)} recorded for Invoice #${selectedBillId}.`);
      }
    } else {
      // General Account: FIFO allocation across unpaid bills
      const payToApply = Math.min(entered, payingCustomer.balanceDue);
      let remaining = payToApply;

      for (const bill of payingCustomer.unpaidBills) {
        if (remaining <= 0.001) break;
        const amountForThisBill = Math.min(bill.due, remaining);
        onRecordPayment(bill.id, amountForThisBill, payDate, payModeLower, payNote.trim() || undefined);
        remaining -= amountForThisBill;
      }

      const newDue = Math.max(0, payingCustomer.balanceDue - payToApply);
      const successText = `Payment of ₹${money(payToApply)} (${payMode}) recorded for ${payingCustomer.name}. Remaining due: ₹${money(newDue)}.`;
      setPaymentSuccessMsg(successText);
      if (speakAssistiveText) {
        speakAssistiveText(`Payment of ₹${money(payToApply)} recorded for ${payingCustomer.name}.`);
      }
    }

    setPayingCustomer(null);
    setSelectedBillId(null);
    setPayAmount('');
    setTimeout(() => setPaymentSuccessMsg(null), 5000);
  };

  // Build statement text for WhatsApp / Download
  const buildShareText = (cust: CustomerDueRecord, orgName: string): string => {
    const lines: string[] = [];
    lines.push(`*Payment Statement - ${orgName}*`);
    lines.push(`Customer: ${cust.name}`);
    if (cust.phone) lines.push(`Phone: ${cust.phone}`);
    lines.push(`--------------------------------`);
    if (cust.balanceDue > 0) {
      lines.push(`*Total Balance Due: ₹${money(cust.balanceDue)}*`);
      if (cust.unpaidBills && cust.unpaidBills.length > 0) {
        lines.push(`\nUnpaid Invoices:`);
        cust.unpaidBills.forEach((b) => {
          lines.push(`• Invoice #${b.id} (${b.date}): ₹${money(b.due)} due`);
        });
      }
      if (cust.lastBillDate) {
        lines.push(`\nLast Bill: ${cust.lastBillDate} (₹${money(cust.lastBillAmount || 0)})`);
      }
      lines.push(`\nPlease clear the outstanding dues. Thank you!`);
    } else if ((cust.advance || 0) > 0.004) {
      lines.push(`Account Status: Clear (₹${money(cust.advance || 0)} Advance Credit)`);
      lines.push(`No payment due at this time. Thank you!`);
    } else {
      lines.push(`Account Status: Fully Settled • No Dues Pending`);
      lines.push(`Thank you for your business!`);
    }
    return lines.join('\n');
  };

  // Download Statement as Text File
  const handleDownloadStatement = (cust: CustomerDueRecord) => {
    const text = buildShareText(cust, orgProfile?.name || 'MrWater Distribution');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cust.name.replace(/\s+/g, '_')}_statement.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify(`Statement downloaded for ${cust.name}`);
  };

  // Copy statement text
  const handleCopyStatement = (cust: CustomerDueRecord) => {
    const text = buildShareText(cust, orgProfile?.name || 'MrWater Distribution');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      notify(`Statement copied to clipboard!`);
    }
  };

  // Native Share (if supported)
  const handleNativeShare = async (cust: CustomerDueRecord) => {
    const text = buildShareText(cust, orgProfile?.name || 'MrWater Distribution');
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Payment Statement - ${cust.name}`,
          text,
        });
        setSharingCustomer(null);
      } catch {
        // user dismissed share dialog
      }
    }
  };

  return (
    <section id="salesman-customer-due-lookup" className="space-y-4 max-w-none lg:max-w-5xl mx-auto pb-8">
      {/* Top Banner & Stat Cards (Clean 2-card layout without redundant 3rd card) */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="p-3.5 sm:p-4 rounded-xl border-2 shadow-sm"
          style={{
            backgroundColor: palette.panel,
            borderColor: palette.line,
          }}
        >
          <div className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-500">
            Total Outstanding
          </div>
          <div className="text-xl sm:text-3xl font-black text-rose-700 mt-1 font-mono">
            ₹{money(totalDueSum)}
          </div>
          <div className="text-xs font-bold text-slate-500 mt-0.5">
            Across {countWithDue} accounts
          </div>
        </div>

        <div
          className="p-3.5 sm:p-4 rounded-xl border-2 shadow-sm"
          style={{
            backgroundColor: palette.panel,
            borderColor: palette.line,
          }}
        >
          <div className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-500">
            Accounts
          </div>
          <div className="text-xl sm:text-3xl font-black text-slate-900 mt-1 font-mono">
            {customerRecords.length}
          </div>
          <div className="text-xs font-bold text-slate-500 mt-0.5">
            Active customers
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {paymentSuccessMsg && (
        <div
          role="alert"
          className="p-3.5 bg-emerald-50 border-2 border-emerald-500 rounded-xl text-emerald-900 font-black text-sm flex items-center gap-2.5 shadow-sm transition-all animate-fadeIn"
        >
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <span className="flex-1">{paymentSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setPaymentSuccessMsg(null)}
            className="p-1 rounded hover:bg-emerald-100 text-emerald-700 cursor-pointer"
            aria-label="Dismiss alert"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search & Quick Filters (Add Customer button removed from this row per user image) */}
      <div
        className="p-3.5 rounded-xl border-2 shadow-sm space-y-3"
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
            <input enterKeyHint="search"
              id="input-customer-due-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shop name or phone..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-slate-300 font-bold text-slate-900 text-sm focus:border-sky-600 focus:outline-none bg-white transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
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
              {filterDueOnly ? '✓ Dues Only' : 'All Customers'}
            </button>

            {filterDueOnly && (
              <button
                type="button"
                onClick={() => setFilterDueOnly(false)}
                className="text-xs text-slate-500 hover:text-slate-800 font-bold underline cursor-pointer"
              >
                Show All
              </button>
            )}
          </div>

          <span className="font-bold text-slate-500">
            {filteredCustomers.length} of {customerRecords.length} accounts
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
                className="mt-2 inline-block px-3 py-1.5 rounded-lg bg-sky-600 text-white font-bold text-xs cursor-pointer"
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
                className="rounded-xl border-2 p-3.5 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all"
                style={{
                  backgroundColor: palette.panel,
                  borderColor: hasDue ? '#FCA5A5' : palette.line,
                }}
              >
                {/* Left: Customer Info, Balance Due, Last Bill */}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-slate-900 text-base sm:text-lg leading-tight">
                      <OdiaName name={cust.name} kind="person" />
                    </h3>

                    {hasDue ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-rose-100 text-rose-800 border border-rose-300">
                        ₹{money(cust.balanceDue)} Due
                      </span>
                    ) : (cust.advance || 0) > 0.004 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-sky-100 text-sky-800 border border-sky-300">
                        ₹{money(cust.advance || 0)} Advance • No Due
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

                {/* Right: Actions (Share and Collect - New Sale removed per user image) */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {/* Share Button (Replaces WhatsApp-only link, allows download or WhatsApp) */}
                  <button
                    type="button"
                    onClick={() => setSharingCustomer(cust)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
                    title={`Share statement for ${cust.name}`}
                  >
                    <Share2 size={15} className="text-slate-600" />
                    <span>Share</span>
                  </button>

                  {/* Collect Payment Button (Short name "Collect" replacing "Record Payment") */}
                  {hasDue ? (
                    <button
                      type="button"
                      id={`btn-collect-${cust.name.replace(/\s+/g, '-').toLowerCase()}`}
                      onClick={() => handleOpenPaymentModal(cust)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl border-2 border-emerald-600 bg-emerald-600 text-white font-black text-xs sm:text-sm flex items-center gap-1.5 hover:bg-emerald-700 cursor-pointer shadow-sm transition-colors"
                      title={`Collect payment from ${cust.name}`}
                    >
                      <IndianRupee size={15} />
                      <span>Collect</span>
                    </button>
                  ) : (
                    <div className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 bg-slate-100">
                      Settled
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* SHARE STATEMENT MODAL (Download, WhatsApp, Copy, Native Share) */}
      {sharingCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-share-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSharingCustomer(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 shadow-2xl p-5 sm:p-6 space-y-4 bg-white"
            style={{
              borderColor: palette.line,
              color: '#0F172A',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-bold">
                  <Share2 size={20} />
                </div>
                <div>
                  <h3 id="modal-share-title" className="font-black text-base sm:text-lg text-slate-900 leading-tight">
                    Share Statement
                  </h3>
                  <p className="text-xs text-slate-500">Download or send payment statement</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSharingCustomer(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Customer Details Pill */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="font-black text-base text-slate-900"><OdiaName name={sharingCustomer.name} kind="person" /></div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>{sharingCustomer.phone || 'No phone registered'}</span>
                <span className={sharingCustomer.balanceDue > 0 ? 'text-rose-700 font-black' : 'text-emerald-700 font-black'}>
                  {sharingCustomer.balanceDue > 0 ? `₹${money(sharingCustomer.balanceDue)} Due` : 'Clear • No Due'}
                </span>
              </div>
              {sharingCustomer.unpaidBills && sharingCustomer.unpaidBills.length > 0 && (
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/80">
                  {sharingCustomer.unpaidBills.length} unpaid bill(s):{' '}
                  {sharingCustomer.unpaidBills.map((b) => `#${b.id}`).join(', ')}
                </div>
              )}
            </div>

            {/* Share & Download Options */}
            <div className="space-y-2.5 pt-1">
              {/* WhatsApp Option */}
              <button
                type="button"
                onClick={() => {
                  const text = buildShareText(sharingCustomer, orgProfile?.name || 'MrWater Distribution');
                  const phone = sharingCustomer.phone ? sharingCustomer.phone.replace(/\D/g, '') : '';
                  const url = `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
                  window.open(url, '_blank');
                  setSharingCustomer(null);
                }}
                className="w-full min-h-[46px] p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-black text-xs sm:text-sm flex items-center justify-between cursor-pointer shadow-xs transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare size={18} className="text-emerald-700" />
                  <div className="text-left">
                    <div>Share via WhatsApp</div>
                    <div className="text-[10px] font-semibold text-emerald-800">
                      {sharingCustomer.phone ? `Send directly to ${sharingCustomer.phone}` : 'Open WhatsApp reminder'}
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} className="text-emerald-700" />
              </button>

              {/* Download Statement File */}
              <button
                type="button"
                onClick={() => {
                  handleDownloadStatement(sharingCustomer);
                  setSharingCustomer(null);
                }}
                className="w-full min-h-[46px] p-3 rounded-xl border-2 border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-950 font-black text-xs sm:text-sm flex items-center justify-between cursor-pointer shadow-xs transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Download size={18} className="text-sky-700" />
                  <div className="text-left">
                    <div>Download Statement</div>
                    <div className="text-[10px] font-semibold text-sky-800">
                      Save due slip text file to device
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} className="text-sky-700" />
              </button>

              {/* Copy & Native Share */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleCopyStatement(sharingCustomer)}
                  className="min-h-[42px] py-2 px-3 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Copy size={15} />
                  <span>Copy Text</span>
                </button>

                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
                  <button
                    type="button"
                    onClick={() => handleNativeShare(sharingCustomer)}
                    className="min-h-[42px] py-2 px-3 rounded-xl border-2 border-slate-900 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Share2 size={15} />
                    <span>More Apps</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSharingCustomer(null)}
                    className="min-h-[42px] py-2 px-3 rounded-xl border-2 border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center cursor-pointer"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COLLECT PAYMENT MODAL (WITH INVOICE SELECTION OPTION LIKE OWNER) */}
      {payingCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-collect-payment-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => {
            setPayingCustomer(null);
            setSelectedBillId(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 shadow-2xl p-5 sm:p-6 space-y-4 bg-white"
            style={{
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
                  <h3 id="modal-collect-payment-title" className="font-black text-base sm:text-lg text-slate-900 leading-tight">
                    Collect Payment
                  </h3>
                  <p className="text-xs text-slate-500">Log customer cash or UPI receipt</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPayingCustomer(null);
                  setSelectedBillId(null);
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Customer Summary Pill */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="font-black text-sm text-slate-900"><OdiaName name={payingCustomer.name} kind="person" /></div>
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
              {/* Invoice Selection like Owner */}
              <div>
                <label
                  htmlFor="select-payment-bill"
                  className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1"
                >
                  Apply Towards Invoice (Optional)
                </label>
                <div className="relative">
                  <select
                    id="select-payment-bill"
                    value={selectedBillId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      setSelectedBillId(val);
                      if (val !== null) {
                        const targetBill = payingCustomer.unpaidBills.find((b) => b.id === val);
                        if (targetBill) {
                          setPayAmount(String(targetBill.due));
                        }
                      } else {
                        setPayAmount(String(payingCustomer.balanceDue));
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-300 font-bold text-xs sm:text-sm text-slate-900 bg-white focus:border-emerald-600 focus:outline-none cursor-pointer"
                  >
                    <option value="">General Account (All Dues / FIFO)</option>
                    {payingCustomer.unpaidBills.map((b) => (
                      <option key={b.id} value={b.id}>
                        Invoice #{b.id} ({b.date}) • Due: ₹{money(b.due)}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10.5px] text-slate-500 mt-1">
                  {selectedBillId
                    ? `Payment will be applied specifically to Invoice #${selectedBillId}.`
                    : 'Payment will clear oldest unpaid bills first (FIFO).'}
                </p>
              </div>

              {/* Payment Date with Today / Yesterday Quick Chips */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="input-collect-date"
                    className="block text-xs font-black uppercase tracking-wider text-slate-700"
                  >
                    Collection Date *
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPayDate(todayStr)}
                      className={`px-2 py-0.5 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                        payDate === todayStr
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayDate(yesterdayStr)}
                      className={`px-2 py-0.5 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                        payDate === yesterdayStr
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Yesterday
                    </button>
                  </div>
                </div>
                <input
                  id="input-collect-date"
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border-2 border-slate-300 font-bold text-xs text-slate-900 bg-white focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Amount Collected */}
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
                    type="number" inputMode="decimal"
                    step="0.01"
                    min="1"
                    max={
                      selectedBillId !== null
                        ? payingCustomer.unpaidBills.find((b) => b.id === selectedBillId)?.due || payingCustomer.balanceDue
                        : payingCustomer.balanceDue
                    }
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
                    onClick={() => {
                      if (selectedBillId !== null) {
                        const targetBill = payingCustomer.unpaidBills.find((b) => b.id === selectedBillId);
                        if (targetBill) setPayAmount(String(targetBill.due));
                      } else {
                        setPayAmount(String(payingCustomer.balanceDue));
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                  >
                    {selectedBillId !== null
                      ? `Full Invoice (₹${money(payingCustomer.unpaidBills.find((b) => b.id === selectedBillId)?.due || 0)})`
                      : `Full Due (₹${money(payingCustomer.balanceDue)})`}
                  </button>
                  {[500, 1000, 2000].map((amt) => {
                    const maxVal = selectedBillId !== null
                      ? payingCustomer.unpaidBills.find((b) => b.id === selectedBillId)?.due || payingCustomer.balanceDue
                      : payingCustomer.balanceDue;
                    if (amt >= maxVal) return null;
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
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm'
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
                  onClick={() => {
                    setPayingCustomer(null);
                    setSelectedBillId(null);
                  }}
                  className="flex-1 min-h-[44px] py-2 px-4 rounded-xl border-2 border-slate-300 font-bold text-sm text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors text-center"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  id="btn-confirm-collect-payment"
                  className="flex-1 min-h-[44px] py-2 px-4 rounded-xl border-2 border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                >
                  <CheckCircle2 size={16} />
                  <span>Save Collection</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
