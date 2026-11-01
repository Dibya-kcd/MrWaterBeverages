import React, { useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Edit2,
  FileText,
  MessageCircle,
  Phone,
  Printer,
  Receipt,
  Search,
  Trash2,
  User,
  X,
  Package,
  IndianRupee,
  Wallet,
} from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import {
  Bill,
  PaymentMode,
  PaymentRecord,
} from "../../types";
import { money, whatsappLink } from "../../utils/billing";
import { RecordPaymentModal } from "../common/RecordPaymentModal";
import { TaxInvoiceModal } from "../common/TaxInvoiceModal";
import { ConfirmModal, Badge } from "../ui";
import { billBalance } from "../../utils/salesReturns";
import { todayISO, toLocalISODate } from "../../utils/dateLocal";
import { isAdvanceRow } from "../../utils/paymentAllocation";
import { PaymentAuditModal } from "../common/PaymentAuditModal";
import { PeriodFilter, periodLabel as periodRangeLabel, rangeForPreset, type PeriodRange } from "../common/PeriodFilter";
import { BeatSalesDueReport } from "./reports/BeatSalesDueReport";
import { CustomerReceiptsReport } from "./reports/CustomerReceiptsReport";
import { formatPaymentId } from "../../utils/beatReports";

/** Formats a date string into "14 May" or "02 Oct" format */
function formatItemDate(dateStr: string): string {
  if (!dateStr) return "14 May";
  if (/^\d{1,2}\s+[A-Za-z]{3}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${day} ${month}`;
}

/** Formats a date string into standard YYYY-MM-DD format for date inputs */
function toStandardIsoDate(input?: string): string {
  if (!input) return todayISO();
  const trimmed = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (trimmed.length > 10 && trimmed[10] === "T") return trimmed.slice(0, 10);
  const parts = trimmed.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    } else if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return toLocalISODate(d);
  }
  return todayISO();
}

/** Formats YYYY-MM-DD into "02-Oct-2026" for the input field */
function formatInputDateDisplay(dateStr: string): string {
  if (!dateStr) return "02-Oct-2026";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  if (!y || !m || !d) return dateStr;
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mIdx = parseInt(m, 10) - 1;
  const monthStr = monthNames[mIdx] || m;
  return `${d.padStart(2, "0")}-${monthStr}-${y}`;
}

/** Default sample preset payments to match user screenshots if no history exists */

export const PaymentsView: React.FC = () => {
  const {
    payments,
    recordCustomerPayment,
    repairPaymentLinks,
    paymentAudit,
    updatePayment,
    deletePayment,
    existingCustomers,
    bills,
    grns,
    palette,
    orgProfile,
    currentUser,
  } = useLedger();

  const loggedInUserName = currentUser?.name || currentUser?.username || "Admin";
  const todayStr = useMemo(() => todayISO(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);

  // Form State matching Image 1
  const [selectedParty, setSelectedParty] = useState<string>("");
  const [customPartyName, setCustomPartyName] = useState<string>("");
  const [isCustomParty, setIsCustomParty] = useState<boolean>(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [amount, setAmount] = useState<string>("");
  const [receiptDate, setReceiptDate] = useState<string>(todayStr);
  const [referenceNote, setReferenceNote] = useState<string>("");
  const [formFeedback, setFormFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const dateInputRef = useRef<HTMLInputElement>(null);

  // Search State matching Image 3
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Tab: 'receipts' (default, matches screenshots) or 'due' (Due/Credit Invoices)
  const [activeTab, setActiveTab] = useState<"receipts" | "due" | "daywise" | "beats">("receipts");

  // Period for the Day-wise and Beat-wise tabs (default: last 7 days)
  const [reportRange, setReportRange] = useState<PeriodRange>(() => ({
    preset: "7days",
    ...rangeForPreset("7days"),
  }));
  const reportInPeriod = useCallback(
    (d: string) =>
      (!reportRange.startDate || d >= reportRange.startDate) && (!reportRange.endDate || d <= reportRange.endDate),
    [reportRange],
  );
  const reportPeriodText = useMemo(() => periodRangeLabel(reportRange), [reportRange]);

  // Selection state for Item Detail View (user requested: clicking on the items should open the detail view)
  const [selectedPaymentForDetails, setSelectedPaymentForDetails] = useState<PaymentRecord | null>(null);

  // Modals state - ALWAYS rendered at the root level with high z-index so they never appear behind
  const [receiptPayment, setReceiptPayment] = useState<PaymentRecord | null>(null);
  const [paymentToEdit, setPaymentToEdit] = useState<PaymentRecord | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentRecord | null>(null);
  const [taxInvoiceModalBill, setTaxInvoiceModalBill] = useState<Bill | null>(null);
  const [whatsAppPromptPayment, setWhatsAppPromptPayment] = useState<PaymentRecord | null>(null);
  const [promptPhoneInput, setPromptPhoneInput] = useState<string>("");

  // Real ledger payments only (never show made-up sample receipts, they would distort totals)
  const allPayments = useMemo(() => payments || [], [payments]);

  // Realtime Cash in Box / Till Balance & Financial Overview
  const realtimeCashInBox = useMemo(() => {
    const cashFromBills = bills.reduce((sum, b) => {
      if (b.status === "cancelled" || b.cancellation) return sum;
      const mode = String(b.paymentMode || "cash").toLowerCase();
      return mode === "cash" ? sum + (Number(b.amountPaid) || 0) : sum;
    }, 0);
    const cashFromPayments = (allPayments || []).reduce((sum, p) => {
      return String(p.mode || "").toLowerCase() === "cash" ? sum + (Number(p.amount) || 0) : sum;
    }, 0);
    return Math.max(cashFromBills, cashFromPayments);
  }, [bills, allPayments]);

  const totalCollectedAmount = useMemo(() => {
    return bills.reduce((sum, b) => {
      if (b.status === "cancelled" || b.cancellation) return sum;
      return sum + (Number(b.amountPaid) || 0);
    }, 0);
  }, [bills]);

  const totalMarketDue = useMemo(() => {
    return bills.reduce((sum, b) => {
      if (b.status === "cancelled" || b.cancellation) return sum;
      return sum + Math.max(0, (Number(b.total) || 0) - (Number(b.amountPaid) || 0));
    }, 0);
  }, [bills]);

  const totalInwardSpend = useMemo(() => {
    return (grns || []).reduce((sum, g) => sum + (Number(g.grandTotal) || 0), 0);
  }, [grns]);

  // Compute effective balance owed on a bill accounting for both bill.amountPaid and recorded payments journal
  const getEffectiveBillBalance = useCallback(
    (b: Bill) => {
      const linkedPaid = allPayments
        .filter((p) => p.billId === b.id)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const paid = Math.max(Number(b.amountPaid) || 0, linkedPaid);
      return billBalance({ ...b, amountPaid: paid });
    },
    [allPayments],
  );

  // List of parties for the PARTY dropdown (from existingCustomers + bills)
  const partyOptions = useMemo(() => {
    const list: { key: string; name: string; label: string; due: number }[] = [];
    const seen = new Set<string>();

    existingCustomers.forEach((c) => {
      const trimmed = c.name.trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) return;
      seen.add(trimmed.toLowerCase());
      list.push({
        key: `cust_${c.id || c.name || Math.random()}`,
        name: trimmed,
        label:
          c.balanceDue > 0
            ? `${trimmed} (Due: ₹${money(c.balanceDue)})`
            : (c.advance || 0) > 0.004
              ? `${trimmed} (Advance: ₹${money(c.advance || 0)})`
              : trimmed,
        due: c.balanceDue,
      });
    });

    bills.forEach((b) => {
      const trimmed = (b.retailer || "").trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) return;
      seen.add(trimmed.toLowerCase());
      const due = getEffectiveBillBalance(b);
      list.push({
        key: `bill_${b.id}`,
        name: trimmed,
        label: due > 0 ? `${trimmed} (Due: ₹${money(due)})` : trimmed,
        due,
      });
    });

    return list.sort((a, b) => {
      if (a.due > 0 && b.due <= 0) return -1;
      if (b.due > 0 && a.due <= 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [existingCustomers, bills, getEffectiveBillBalance]);

  // Filtered payments by search term
  const filteredPayments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return allPayments;
    return allPayments.filter((p) => {
      const name = (p.customerName || "").toLowerCase();
      const ref = (p.referenceNote || "").toLowerCase();
      const mode = (p.mode || "").toLowerCase();
      const pId = formatPaymentId(p.id).toLowerCase();
      const rawId = (p.id || "").toLowerCase();
      return name.includes(q) || ref.includes(q) || mode.includes(q) || pId.includes(q) || rawId.includes(q);
    });
  }, [allPayments, searchTerm]);

  // Due / Credit Invoices
  const dueBills = useMemo(() => {
    return bills.filter((b) => {
      if (b.cancelled || b.cancellation) return false;
      return getEffectiveBillBalance(b) > 0.01;
    });
  }, [bills, getEffectiveBillBalance]);

  const filteredDueBills = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return dueBills;
    return dueBills.filter((b) => {
      const retailer = (b.retailer || "").toLowerCase();
      const phone = (b.phone || "").toLowerCase();
      const idStr = String(b.id);
      return retailer.includes(q) || phone.includes(q) || idStr.includes(q);
    });
  }, [dueBills, searchTerm]);

  // Handle Record Receipt submission
  const handleRecordReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    const partyToUse = isCustomParty ? customPartyName.trim() : selectedParty.trim();
    if (!partyToUse) {
      setFormFeedback({ type: "error", text: "Please choose or enter a party name" });
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setFormFeedback({ type: "error", text: "Please enter a valid payment amount" });
      return;
    }

    try {
      const saved = recordCustomerPayment(
        partyToUse,
        numericAmount,
        receiptDate || todayStr,
        paymentMode,
        referenceNote.trim() || undefined
      );
      if (!saved) {
        // Same receipt sent twice within a few seconds: the first one is already saved.
        setFormFeedback({
          type: "error",
          text: "This receipt was not saved again because an identical one was just recorded.",
        });
        return;
      }

      setFormFeedback({
        type: "success",
        text: `Receipt of ₹${money(numericAmount)} successfully recorded for ${partyToUse}!`,
      });

      setSelectedParty("");
      setCustomPartyName("");
      setIsCustomParty(false);
      setAmount("");
      setReferenceNote("");
      setPaymentMode("cash");
      setReceiptDate(todayStr);

      setTimeout(() => setFormFeedback(null), 4000);
    } catch (err: any) {
      setFormFeedback({
        type: "error",
        text: err?.message || "Failed to record payment receipt",
      });
    }
  };

  const getModeBadge = (mode: PaymentMode) => {
    switch (mode) {
      case "cash":
        return <Badge variant="success" size="sm">CASH</Badge>;
      case "upi":
        return <Badge variant="accent" size="sm">UPI / QR</Badge>;
      case "cheque":
        return <Badge variant="warning" size="sm">CHEQUE</Badge>;
      case "bank":
        return <Badge variant="neutral" size="sm">BANK / NEFT</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{(mode as string).toUpperCase()}</Badge>;
    }
  };

  return (
    <>
      {/* 
        CONDITIONAL SCREEN CONTENT:
        If an item is clicked, render the clean Detail View.
        Otherwise, render the Main Payments screen matching the screenshots.
      */}
      {selectedPaymentForDetails ? (
        /* =========================================================================
           DETAIL VIEW
           - Billing items inline with payment +/- sign
           - Not required for collection or credit label
           - Edit icon only, placed inline with the cash/mode line
           - WhatsApp, Print receipt, View Invoice, and Delete moved to the bottom
           - System ID removed from Payment Record Details
           ========================================================================= */
        (() => {
          const p = selectedPaymentForDetails;
          const linkedBill = p.billId ? bills.find((b) => b.id === p.billId) : null;
          const matchedCustomer = existingCustomers.find(
            (c) => c.name.trim().toLowerCase() === (p.customerName || "").trim().toLowerCase()
          );

          // Build a safe bill representation for the Tax Invoice modal
          const activeBillForInvoice: Bill = linkedBill || {
            id: typeof p.billId === "number" ? p.billId : 0,
            retailer: p.customerName || "Cash Sale",
            phone: p.customerPhone || matchedCustomer?.phone || "",
            date: p.paymentDate || p.createdAt?.slice(0, 10) || todayISO(),
            items: [
              {
                key: "item-1",
                productId: 0,
                productName: "Beverage & Packaged Water Supply",
                category: "water",
                gst: 18,
                priceType: "Wholesale",
                qty: 1,
                rate: p.amount,
                gross: p.amount,
                freeQty: 0,
                chargeableQty: 1,
                discount: 0,
                amount: p.amount,
              },
            ],
            amountPaid: p.amount,
            subtotal: Math.round((p.amount / 1.18) * 100) / 100,
            cgst: Math.round(((p.amount - Math.round((p.amount / 1.18) * 100) / 100) / 2) * 100) / 100,
            sgst: Math.round(((p.amount - Math.round((p.amount / 1.18) * 100) / 100) / 2) * 100) / 100,
            total: p.amount,
            discount: 0,
            paymentMode: p.mode,
            paymentDate: p.paymentDate || p.createdAt?.slice(0, 10),
            paymentNote: p.referenceNote,
          };

          return (
            <div id="view-payment-details" className="mw-workspace space-y-4 sm:space-y-6 max-w-none lg:max-w-4xl mx-auto py-2 sm:py-3">
              {/* Top Navigation - Back only, system ID removed */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentForDetails(null)}
                  className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 hover:text-emerald-700 transition-colors cursor-pointer group"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-500 group-hover:-translate-x-0.5 transition-transform" />
                  <span>Back to Payments</span>
                </button>
              </div>

              {/* Payment Amount Card with Billing Items Inline */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h1 className={`text-3xl sm:text-4xl font-black tracking-tight font-mono ${p.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {p.amount < 0 ? "−" : "+"}₹{money(Math.abs(p.amount))}
                    </h1>
                    {/* Billing items inline with payment +/- sign */}
                    {linkedBill && linkedBill.items && linkedBill.items.length > 0 ? (
                      <div className="inline-flex items-center gap-1.5 flex-wrap text-xs sm:text-sm font-medium text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                        <span className="font-bold text-slate-900">Invoice #{linkedBill.id}:</span>
                        <div className="inline-flex items-center gap-1.5 flex-wrap">
                          {linkedBill.items.map((it, idx) => (
                            <span
                              key={it.key || idx}
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-semibold text-slate-800 shadow-2xs"
                            >
                              {it.productName} × {it.qty}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : p.billId ? (
                      <span className="text-xs sm:text-sm font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                        Invoice #{p.billId}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Cash line with Edit icon inline only */}
                <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 flex-wrap pt-0.5">
                  <span>
                    Received on <strong className="text-slate-900 font-semibold">{formatItemDate(p.paymentDate || p.createdAt)} ({p.paymentDate || p.createdAt?.slice(0, 10)})</strong>
                    {" "}via <strong className="text-slate-900 font-bold uppercase">{p.mode}</strong>
                  </span>
                  {!p.isRefund && (
                  <button
                    type="button"
                    onClick={() => setPaymentToEdit(p)}
                    className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer ml-1 inline-flex items-center"
                    title="Edit payment"
                    aria-label="Edit payment"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  )}
                </div>
              </div>

              {/* 2-Column Info Grid - No collection or credit stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Party Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-4 h-4 text-emerald-600" />
                      Customer Party
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-slate-900">
                      {p.customerName}
                    </h3>
                    {p.customerPhone || matchedCustomer?.phone ? (
                      <div className="flex items-center gap-3 pt-1">
                        <a
                          href={`tel:${p.customerPhone || matchedCustomer?.phone}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-emerald-700"
                        >
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{p.customerPhone || matchedCustomer?.phone}</span>
                        </a>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No phone registered</span>
                    )}
                  </div>
                </div>

                {/* Payment Details Card - System ID removed */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-slate-600" />
                      Payment Details
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">{p.paymentDate || p.createdAt?.slice(0, 10)}</span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-400 text-[10px] block font-semibold uppercase">Payment Method</span>
                        <span className="font-bold text-slate-800 uppercase">{p.mode}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-semibold uppercase">Recorded By</span>
                        <span className="font-bold text-slate-800">{p.recordedBy || loggedInUserName}</span>
                      </div>
                    </div>

                    {p.referenceNote && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-slate-400 text-[10px] block uppercase font-bold">Reference / UTR</span>
                        <span className="font-mono text-slate-800 font-semibold text-xs mt-0.5 block">
                          {p.referenceNote}
                        </span>
                      </div>
                    )}

                    {(p.billId || linkedBill) && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="text-slate-400 text-[10px] block uppercase font-bold">Allocated Invoice</span>
                          <span className="font-mono text-slate-700 font-bold text-xs mt-0.5 block">
                            Invoice #{p.billId || linkedBill?.id}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTaxInvoiceModalBill(activeBillForInvoice)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="View Invoice"
                          aria-label="View Invoice"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Action Bar: Icon-only buttons (Delete, WhatsApp, Print Receipt, Invoice) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-xs flex items-center justify-between gap-3">
                {/* Delete button (icon only) */}
                <button
                  type="button"
                  onClick={() => setPaymentToDelete(p)}
                  className="p-3 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer shadow-xs inline-flex items-center justify-center shrink-0"
                  title="Delete Payment"
                  aria-label="Delete Payment"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                {/* WhatsApp, Print Receipt, and Invoice buttons (icons only) */}
                <div className="flex items-center gap-2.5 sm:gap-3">
                  {/* WhatsApp Option (icon only) */}
                  {p.customerPhone || matchedCustomer?.phone ? (
                    <a
                      href={whatsappLink(
                        p.customerPhone || matchedCustomer?.phone || "",
                        `*Payment Receipt - ${orgProfile?.name || "MrWater Distribution"}*\nCustomer: ${p.customerName}\nAmount Received: ₹${money(p.amount)}\nMode: ${p.mode.toUpperCase()}\nDate: ${p.paymentDate || p.createdAt?.slice(0, 10)}\n${p.referenceNote ? `Ref Note: ${p.referenceNote}\n` : ""}Thank you for your payment!`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl text-white bg-[#25D366] hover:bg-[#1EBE5D] shadow-xs transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
                      title="Share on WhatsApp"
                      aria-label="Share on WhatsApp"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsAppPromptPayment(p);
                        setPromptPhoneInput("");
                      }}
                      className="p-3 rounded-xl text-white bg-[#25D366] hover:bg-[#1EBE5D] shadow-xs transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
                      title="Share on WhatsApp"
                      aria-label="Share on WhatsApp"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </button>
                  )}

                  {/* Print Receipt (icon only) */}
                  <button
                    type="button"
                    onClick={() => setReceiptPayment(p)}
                    className="p-3 rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer shadow-xs inline-flex items-center justify-center shrink-0"
                    title="Print Receipt"
                    aria-label="Print Receipt"
                  >
                    <Printer className="w-5 h-5" />
                  </button>

                  {/* View / Print Tax Invoice (icon only) */}
                  <button
                    type="button"
                    onClick={() => setTaxInvoiceModalBill(activeBillForInvoice)}
                    className="p-3 rounded-xl text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer shadow-xs inline-flex items-center justify-center shrink-0"
                    title="View Tax Invoice"
                    aria-label="View Tax Invoice"
                  >
                    <FileText className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        /* =========================================================================
           MAIN PAYMENTS VIEW (EXACT MATCH TO ATTACHED SCREENSHOTS)
           ========================================================================= */
        <div id="view-payments" className="mw-workspace max-w-none lg:max-w-4xl mx-auto py-2 sm:py-4 space-y-6">
          {/* 1. Header with History Log Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Payments
              </h1>
            </div>

            <button
              type="button"
              onClick={() => setShowAuditLog(true)}
              className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
            >
              Payment history log
            </button>
          </div>
          {showAuditLog && (
            <PaymentAuditModal entries={paymentAudit} onClose={() => setShowAuditLog(false)} />
          )}

          {/* Realtime Cash in Box & Financial Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between text-emerald-800 text-xs font-bold uppercase tracking-wider mb-1">
                <span>Cash in Box (Till)</span>
                <Wallet className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-950 font-mono">
                ₹{money(realtimeCashInBox)}
              </div>
              <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                Realtime cash collected in drawer
              </p>
            </div>

            <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between text-rose-800 text-xs font-bold uppercase tracking-wider mb-1">
                <span>Market Credit Due</span>
                <IndianRupee className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-rose-950 font-mono">
                ₹{money(totalMarketDue)}
              </div>
              <p className="text-[11px] text-rose-700 mt-1 font-medium">
                Pending customer collections
              </p>
            </div>

            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between text-blue-800 text-xs font-bold uppercase tracking-wider mb-1">
                <span>Total Inward Spend</span>
                <Package className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-blue-950 font-mono">
                ₹{money(totalInwardSpend)}
              </div>
              <p className="text-[11px] text-blue-700 mt-1 font-medium">
                Spent on purchases (all GRNs)
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-700 text-xs font-bold uppercase tracking-wider mb-1">
                <span>Total Billed Sales</span>
                <CreditCard className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">
                ₹{money(totalCollectedAmount + totalMarketDue)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                Collected: ₹{money(totalCollectedAmount)}
              </p>
            </div>
          </div>

          {/* One-click repair for receipts saved earlier without an invoice (advances are not old receipts) */}
          {payments.some((p) => !p.billId && !isAdvanceRow(p)) && (
            <div className="p-3 rounded-xl text-xs border border-amber-200 bg-amber-50 text-amber-900 flex items-center justify-between gap-3">
              <span>
                Some older receipts are not linked to an invoice, so ledger and invoice dues can differ.
                Linking splits them by invoice (oldest first). Totals do not change.
              </span>
              <button
                type="button"
                onClick={() => {
                  const n = repairPaymentLinks();
                  setFormFeedback({
                    type: "success",
                    text: n > 0 ? `Linked ${n} receipt(s) to their invoices.` : "Nothing to link: remaining unlinked receipts are advances.",
                  });
                  setTimeout(() => setFormFeedback(null), 5000);
                }}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 cursor-pointer"
              >
                Link receipts
              </button>
            </div>
          )}

          {/* Feedback Alert if any */}
          {formFeedback && (
            <div
              className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 border ${
                formFeedback.type === "success"
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : "bg-rose-50 text-rose-900 border-rose-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {formFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{formFeedback.text}</span>
              </div>
              <button aria-label="Close"
                type="button"
                onClick={() => setFormFeedback(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 2. Top Card: Record Receipt Form (EXACT MATCH TO IMAGE 1) */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-4">
            <form onSubmit={handleRecordReceipt} className="space-y-4">
              {/* PARTY Row (Full width) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] sm:text-xs font-semibold tracking-wider text-slate-600 uppercase block">
                    PARTY
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomParty(!isCustomParty);
                      setCustomPartyName("");
                      setSelectedParty("");
                    }}
                    className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 cursor-pointer"
                  >
                    {isCustomParty ? "← Select from list" : "+ Enter custom name"}
                  </button>
                </div>

                {isCustomParty ? (
                  <input
                    type="text"
                    value={customPartyName}
                    onChange={(e) => setCustomPartyName(e.target.value)}
                    placeholder="Enter customer or supplier name..."
                    className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700"
                  />
                ) : (
                  <div className="relative">
                    <select
                      value={selectedParty}
                      onChange={(e) => {
                        setSelectedParty(e.target.value);
                        const match = partyOptions.find((p) => p.name === e.target.value);
                        if (match && match.due > 0 && !amount) {
                          setAmount(String(match.due));
                        }
                      }}
                      className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 appearance-none pr-10 cursor-pointer"
                    >
                      <option value="" disabled>
                        Choose...
                      </option>
                      {partyOptions.map((opt) => (
                        <option key={opt.key} value={opt.name}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                )}
              </div>

              {/* MODE & AMOUNT Row (2 columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-[11px] sm:text-xs font-semibold tracking-wider text-slate-600 uppercase block mb-1.5">
                    MODE
                  </label>
                  <div className="relative">
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                      className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 appearance-none pr-10 cursor-pointer"
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI / QR</option>
                      <option value="cheque">Cheque</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="other">Other</option>
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] sm:text-xs font-semibold tracking-wider text-slate-600 uppercase block mb-1.5">
                    AMOUNT
                  </label>
                  <input
                    type="number" inputMode="decimal"
                    step="any"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder=""
                    className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700"
                  />
                </div>
              </div>

              {/* DATE & REFERENCE / UTR Row (2 columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="payment-receipt-date-input"
                      className="text-[11px] sm:text-xs font-semibold tracking-wider text-slate-600 uppercase"
                    >
                      DATE
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReceiptDate(todayStr)}
                        className={`px-2 py-0.5 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                          receiptDate === todayStr
                            ? "bg-[#064e3b] text-white border-[#064e3b]"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                        title="Set date to Today"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptDate(yesterdayStr)}
                        className={`px-2 py-0.5 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                          receiptDate === yesterdayStr
                            ? "bg-[#064e3b] text-white border-[#064e3b]"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                        title="Set date to Yesterday"
                      >
                        Yesterday
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      id="payment-receipt-date-input"
                      type="date"
                      required
                      value={toStandardIsoDate(receiptDate)}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 cursor-pointer"
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Collection Date:{" "}
                      <strong className="text-emerald-800 font-semibold">
                        {formatInputDateDisplay(receiptDate)}
                      </strong>
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] sm:text-xs font-semibold tracking-wider text-slate-600 uppercase block mb-1.5">
                    REFERENCE / UTR
                  </label>
                  <input
                    type="text"
                    value={referenceNote}
                    onChange={(e) => setReferenceNote(e.target.value)}
                    placeholder=""
                    className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700"
                  />
                </div>
              </div>

              {/* Submit Action Button (EXACT MATCH: Deep Green "Record receipt") */}
              <div className="pt-1">
                <button
                  type="submit"
                  className="w-full py-3 sm:py-3.5 px-4 rounded-xl sm:rounded-2xl font-semibold text-sm sm:text-base text-white bg-[#064e3b] hover:bg-[#053d2e] active:scale-[0.99] transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  Record receipt
                </button>
              </div>
            </form>
          </div>

          {/* 3. Recent Section Header + Tab switch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Recent
            </h2>

            {/* Tab switch: Receipts, Due Invoices, Day-wise receipts (with due remaining), Beat-wise */}
            <div
              role="tablist"
              aria-label="Payment views"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold overflow-x-auto no-scrollbar max-w-full"
            >
              {(
                [
                  { id: "receipts", label: `Receipts (${allPayments.length})`, tone: "text-slate-900" },
                  { id: "due", label: `Due Invoices (${dueBills.length})`, tone: "text-rose-700" },
                  { id: "daywise", label: "Day-wise", tone: "text-slate-900" },
                  { id: "beats", label: "Beat-wise", tone: "text-slate-900" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    activeTab === t.id
                      ? `bg-white ${t.tone} shadow-xs font-bold`
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Tab 1: Receipts View (EXACT MATCH TO IMAGE 2 on Desktop & IMAGE 3 on Mobile) */}
          {activeTab === "receipts" && (
            <div className="space-y-3">
              {/* Mobile Search Bar (EXACT MATCH TO IMAGE 3) */}
              <div className="block md:hidden">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input enterKeyHint="search"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search payments"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 placeholder:text-slate-400"
                  />
                  {searchTerm && (
                    <button aria-label="Close"
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Desktop Search Bar */}
              <div className="hidden md:flex justify-end">
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input enterKeyHint="search"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search payments..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 placeholder:text-slate-400"
                  />
                  {searchTerm && (
                    <button aria-label="Close"
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* DESKTOP TABLE VIEW (EXACT MATCH TO IMAGE 2) */}
              <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/90 bg-slate-50/70">
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        ITEM
                      </th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        DETAILS
                      </th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        VALUE
                      </th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        STATUS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-xs text-slate-400 italic">
                          No payment receipts match your search
                        </td>
                      </tr>
                    ) : (
                      filteredPayments.map((p, idx) => (
                        <tr
                          key={p.id || idx}
                          onClick={() => setSelectedPaymentForDetails(p)}
                          className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                          title="Click to view payment details"
                        >
                          <td className="py-3.5 px-4 font-bold text-slate-800 text-sm">
                            {formatPaymentId(p.id, idx)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-sm">
                            {p.customerName} · {formatItemDate(p.paymentDate || p.createdAt)}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-800 text-sm">
                            {p.amount < 0 ? "−" : ""}₹{money(Math.abs(p.amount))}
                          </td>
                          <td className="py-3.5 px-4 text-teal-600 font-medium text-sm">
                            Received
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* MOBILE LIST VIEW (EXACT MATCH TO IMAGE 3) */}
              <div className="block md:hidden bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="bg-slate-50/70 border-b border-slate-200/90 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    ITEM
                  </span>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    STATUS
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredPayments.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 italic">
                      No payment receipts match your search
                    </div>
                  ) : (
                    filteredPayments.map((p, idx) => (
                      <div
                        key={p.id || idx}
                        onClick={() => setSelectedPaymentForDetails(p)}
                        className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors"
                        title="Click to view details"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-800 text-sm">
                            {formatPaymentId(p.id, idx)}
                          </div>
                          <div className="text-slate-500 text-xs mt-0.5 truncate">
                            {p.customerName} · {formatItemDate(p.paymentDate || p.createdAt)} · ₹{money(p.amount)}
                          </div>
                        </div>
                        <div className="text-teal-600 font-medium text-xs whitespace-nowrap pt-0.5">
                          Received
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 5. Tab 2: Due / Credit Invoices View */}
          {activeTab === "due" && (
            <div className="space-y-3">
              <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/90 bg-slate-50/70">
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        ITEM
                      </th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        DETAILS
                      </th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        BALANCE DUE
                      </th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        STATUS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDueBills.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-xs text-slate-400 italic">
                          All customer invoices are settled! No outstanding dues.
                        </td>
                      </tr>
                    ) : (
                      filteredDueBills.map((b) => {
                        const due = getEffectiveBillBalance(b);
                        const daysOld = b.date
                          ? Math.floor((Date.now() - new Date(b.date).getTime()) / (1000 * 60 * 60 * 24))
                          : 0;
                        return (
                          <tr
                            key={b.id}
                            onClick={() => {
                              setSelectedParty(b.retailer || "");
                              setAmount(String(due));
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                            title="Click to populate Record Receipt form above"
                          >
                            <td className="py-3.5 px-4 font-bold text-slate-800 text-sm">
                              INV-{String(b.id).padStart(4, "0")}
                            </td>
                            <td className="py-3.5 px-4 text-slate-500 text-sm">
                              {b.retailer || "Cash Sale"} · {formatItemDate(b.date || "")}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-rose-700 text-sm">
                              ₹{money(due)}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`text-xs font-bold ${daysOld > 7 ? "text-rose-600" : "text-amber-700"}`}>
                                {daysOld > 7 ? `Overdue (${daysOld}d)` : "Due"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="block md:hidden bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="bg-slate-50/70 border-b border-slate-200/90 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    ITEM
                  </span>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    STATUS
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredDueBills.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 italic">
                      All customer invoices are settled!
                    </div>
                  ) : (
                    filteredDueBills.map((b) => {
                      const due = getEffectiveBillBalance(b);
                      const daysOld = b.date
                        ? Math.floor((Date.now() - new Date(b.date).getTime()) / (1000 * 60 * 60 * 24))
                        : 0;
                      return (
                        <div
                          key={b.id}
                          onClick={() => {
                            setSelectedParty(b.retailer || "");
                            setAmount(String(due));
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors"
                          title="Click to populate Record Receipt form"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-800 text-sm">
                              INV-{String(b.id).padStart(4, "0")}
                            </div>
                            <div className="text-slate-500 text-xs mt-0.5 truncate">
                              {b.retailer || "Cash Sale"} · {formatItemDate(b.date || "")} · ₹{money(due)}
                            </div>
                          </div>
                          <div className={`font-medium text-xs whitespace-nowrap pt-0.5 ${daysOld > 7 ? "text-rose-600" : "text-amber-700"}`}>
                            {daysOld > 7 ? "Overdue" : "Due"}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 6. Tab 3 / 4: Day-wise customer receipts and Beat-wise sales & due (downloadable) */}
          {(activeTab === "daywise" || activeTab === "beats") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">Period</span>
                <PeriodFilter compact value={reportRange} onChange={setReportRange} />
              </div>
              {activeTab === "daywise" ? (
                <CustomerReceiptsReport periodLabel={reportPeriodText} inPeriod={reportInPeriod} />
              ) : (
                <BeatSalesDueReport periodLabel={reportPeriodText} inPeriod={reportInPeriod} />
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          ROOT-LEVEL MODALS (PORTALED DIRECTLY TO DOCUMENT.BODY WITH Z-[9999])
          These render at document.body so they are ALWAYS in front of all screens
          and never open behind the Detail View, Topbar, or Mobile Navigation.
          ========================================================================= */}

      {/* 1. Printable Receipt Modal */}
      {receiptPayment &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden bg-white flex flex-col text-xs my-auto"
              style={{ borderColor: palette.line }}
            >
              <div
                className="px-4 py-3 border-b flex items-center justify-between"
                style={{ backgroundColor: palette.navy, color: "#FFFFFF" }}
              >
                <div className="flex items-center gap-2">
                  <Receipt size={16} className="text-amber-400" />
                  <span className="font-bold">Official Payment Receipt</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-white text-slate-900 font-bold hover:bg-neutral-100 cursor-pointer"
                  >
                    <Printer size={13} />
                    <span>Print</span>
                  </button>
                  <button aria-label="Close"
                    type="button"
                    onClick={() => setReceiptPayment(null)}
                    className="text-white/70 hover:text-white cursor-pointer ml-2"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="p-6 bg-white space-y-4" id="printable-payment-receipt">
                <div className="text-center border-b pb-4 border-slate-200">
                  <h2 className="text-lg font-black text-slate-900">
                    {orgProfile?.name || "MrWater"}
                  </h2>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    {orgProfile?.address || "Wholesale Beverages & Packaged Water Distribution"}
                  </div>
                  {orgProfile?.phone && (
                    <div className="text-slate-500 text-[11px]">Phone: {orgProfile.phone}</div>
                  )}
                  {orgProfile?.gstin && (
                    <div className="text-slate-500 font-mono text-[11px]">GSTIN: {orgProfile.gstin}</div>
                  )}
                  <div className="mt-2 inline-block px-3 py-1 rounded bg-slate-100 font-bold uppercase text-slate-800 text-[11px] tracking-wider border border-slate-200">
                    PAYMENT ACKNOWLEDGMENT RECEIPT
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400">Customer:</span>{" "}
                    <strong className="text-slate-900 text-xs">{receiptPayment.customerName}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400">Payment Date:</span>{" "}
                    <strong className="text-slate-800">
                      {receiptPayment.paymentDate || receiptPayment.createdAt?.slice(0, 10)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Payment Mode:</span>{" "}
                    <strong className="text-slate-900 uppercase">{receiptPayment.mode}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400">Recorded By:</span>{" "}
                    <strong className="text-slate-800">{receiptPayment.recordedBy || loggedInUserName}</strong>
                  </div>
                  {receiptPayment.referenceNote && (
                    <div className="col-span-2">
                      <span className="text-slate-400">Ref Note / UTR / Cheque:</span>{" "}
                      <strong className="font-mono text-slate-800">{receiptPayment.referenceNote}</strong>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl border-2 border-dashed border-emerald-600 bg-emerald-50/60 text-center my-4">
                  <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    Amount Received with Thanks
                  </div>
                  <div className="text-3xl font-black text-emerald-700 font-mono tabular-nums my-1">
                    +₹{money(receiptPayment.amount)}
                  </div>
                  <div className="text-[11px] text-slate-500 italic">
                    Recorded by: {receiptPayment.recordedBy || loggedInUserName}
                  </div>
                </div>

                <div className="pt-8 flex justify-between items-end border-t border-slate-200 text-[11px] text-slate-500">
                  <div>Customer Signature</div>
                  <div className="text-right">Authorized Signatory</div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 2. Edit Payment Modal */}
      {paymentToEdit &&
        createPortal(
          <div className="fixed inset-0 z-[9999] pointer-events-auto">
            <RecordPaymentModal
              isOpen={true}
              onClose={() => setPaymentToEdit(null)}
              paymentToEdit={paymentToEdit}
              existingCustomers={existingCustomers}
              bills={bills}
              palette={palette}
              onSavePayment={(payload) => {
                const updatedRec: PaymentRecord = {
                  ...paymentToEdit,
                  customerName: payload.customerName,
                  billId: payload.billId,
                  amount: payload.amount,
                  paymentDate: payload.paymentDate,
                  mode: payload.mode,
                  referenceNote: payload.referenceNote,
                  recordedBy: paymentToEdit.recordedBy || loggedInUserName,
                };
                updatePayment(updatedRec);
                if (selectedPaymentForDetails?.id === updatedRec.id) {
                  setSelectedPaymentForDetails(updatedRec);
                }
                setPaymentToEdit(null);
              }}
            />
          </div>,
          document.body
        )}

      {/* 3. Tax Invoice Modal */}
      {taxInvoiceModalBill &&
        createPortal(
          <div className="fixed inset-0 z-[9999] pointer-events-auto">
            <TaxInvoiceModal
              bill={taxInvoiceModalBill}
              onClose={() => setTaxInvoiceModalBill(null)}
            />
          </div>,
          document.body
        )}

      {/* 4. Delete Confirm Modal */}
      {paymentToDelete &&
        createPortal(
          <div className="fixed inset-0 z-[9999] pointer-events-auto">
            <ConfirmModal
              isOpen={true}
              onClose={() => setPaymentToDelete(null)}
              rectificationPrompt="Rectification comment (saved with the delete)"
              onConfirmWithComment={(comment) => {
                if (paymentToDelete) {
                  deletePayment(paymentToDelete.id, comment);
                  if (selectedPaymentForDetails?.id === paymentToDelete.id) {
                    setSelectedPaymentForDetails(null);
                  }
                  setPaymentToDelete(null);
                }
              }}
              onConfirm={() => {
                if (paymentToDelete) {
                  deletePayment(paymentToDelete.id);
                  if (selectedPaymentForDetails?.id === paymentToDelete.id) {
                    setSelectedPaymentForDetails(null);
                  }
                  setPaymentToDelete(null);
                }
              }}
              title="Delete Payment Record"
              message={`Are you sure you want to delete payment receipt of ₹${money(paymentToDelete.amount)} from ${paymentToDelete.customerName}?`}
              confirmButtonLabel="Yes, Delete Payment"
              variant="danger"
            />
          </div>,
          document.body
        )}

      {/* 5. WhatsApp Prompt Modal */}
      {whatsAppPromptPayment &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4 my-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Send WhatsApp Receipt</h3>
                    <p className="text-[11px] text-slate-500">{whatsAppPromptPayment.customerName}</p>
                  </div>
                </div>
                <button aria-label="Close"
                  type="button"
                  onClick={() => setWhatsAppPromptPayment(null)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-700 block">
                  Enter Customer WhatsApp Mobile Number
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={promptPhoneInput}
                    onChange={(e) => setPromptPhoneInput(e.target.value)}
                    placeholder="e.g. 9437012345"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    autoFocus
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setWhatsAppPromptPayment(null)}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <a
                    href={whatsappLink(
                      promptPhoneInput.trim(),
                      `*Payment Receipt - ${orgProfile?.name || "MrWater Distribution"}*\nCustomer: ${whatsAppPromptPayment.customerName}\nAmount Received: ₹${money(whatsAppPromptPayment.amount)}\nMode: ${whatsAppPromptPayment.mode.toUpperCase()}\nDate: ${whatsAppPromptPayment.paymentDate || whatsAppPromptPayment.createdAt?.slice(0, 10)}\n${whatsAppPromptPayment.referenceNote ? `Note: ${whatsAppPromptPayment.referenceNote}\n` : ""}Thank you for your payment!`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setWhatsAppPromptPayment(null)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#25D366] hover:bg-[#1EBE5D] flex items-center gap-1.5 cursor-pointer ${
                      !promptPhoneInput.trim() ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </a>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
