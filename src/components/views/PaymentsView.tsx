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
import { useLanguage } from "../../i18n/LanguageContext";
import { SegmentedPeriod } from "../ui/HomeKit";
import { money, whatsappLink } from "../../utils/billing";
import { RecordPaymentModal } from "../common/RecordPaymentModal";
import { InvoicePicker } from "../common/InvoicePicker";
import { allocateReceipt } from "../../utils/paymentAllocation";
import { TaxInvoiceModal } from "../common/TaxInvoiceModal";
import { ConfirmModal, Badge } from "../ui";
import { billBalance, billNetTotal } from "../../utils/salesReturns";
import { todayISO, toLocalISODate } from "../../utils/dateLocal";
import { PaymentAuditModal } from "../common/PaymentAuditModal";
import { PartySearchSelect, type PartyOption } from "../common/PartySearchSelect";
import { PaymentReportsPanel } from "./payments/PaymentReportsPanel";
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
  const { t } = useLanguage();
  const {
    payments,
    recordCustomerPayment,
    paymentAudit,
    updatePayment,
    deletePayment,
    existingCustomers,
    getCustomerLedger,
    bills,
    grns,
    expenses,
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
  // Invoice the receipt is tied to (undefined = oldest dues first)
  const [selectedBillId, setSelectedBillId] = useState<number | undefined>(undefined);
  const [receiptDate, setReceiptDate] = useState<string>(todayStr);
  const [referenceNote, setReferenceNote] = useState<string>("");
  const [formFeedback, setFormFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const dateInputRef = useRef<HTMLInputElement>(null);

  // Search State matching Image 3
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Tabs: Recent (today), Due invoices, History (older receipts), Reports (downloadable)
  const [activeTab, setActiveTab] = useState<"recent" | "due" | "history" | "reports">("recent");
  const HISTORY_PAGE = 50;
  const [historyVisible, setHistoryVisible] = useState<number>(HISTORY_PAGE);

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

  // Total cash expenses paid out of drawer
  const cashExpenses = useMemo(() => {
    return (expenses || []).reduce((sum, e) => {
      const mode = String(e.mode || "cash").toLowerCase();
      return mode === "cash" ? sum + (Number(e.amount) || 0) : sum;
    }, 0);
  }, [expenses]);

  // Realtime Cash in Box / Till Balance & Financial Overview (net of drawer cash expenses)
  const realtimeCashInBox = useMemo(() => {
    const cashFromBills = bills.reduce((sum, b) => {
      if (b.status === "cancelled" || b.cancellation) return sum;
      const mode = String(b.paymentMode || "cash").toLowerCase();
      return mode === "cash" ? sum + (Number(b.amountPaid) || 0) : sum;
    }, 0);
    const cashFromPayments = (allPayments || []).reduce((sum, p) => {
      if (p.isRefund) return sum;
      return String(p.mode || "").toLowerCase() === "cash" ? sum + (Number(p.amount) || 0) : sum;
    }, 0);
    const grossCash = Math.max(cashFromBills, cashFromPayments);
    return Math.max(0, grossCash - cashExpenses);
  }, [bills, allPayments, cashExpenses]);

  const totalCollectedAmount = useMemo(() => {
    return bills.reduce((sum, b) => {
      if (b.status === "cancelled" || b.cancellation) return sum;
      return sum + (Number(b.amountPaid) || 0);
    }, 0);
  }, [bills]);

  // Outstanding Market Due: accurately accounts for customer returns / credit notes
  const totalMarketDue = useMemo(() => {
    return bills.reduce((sum, b) => {
      if (b.status === "cancelled" || b.cancellation) return sum;
      return sum + Math.max(0, billBalance(b));
    }, 0);
  }, [bills]);

  // Total Billed Sales: net of sales returns, exactly synchronized with Dashboard and Reports
  const totalBilledSales = useMemo(() => {
    return bills.reduce((sum, b) => {
      if (b.status === "cancelled" || b.cancellation) return sum;
      return sum + billNetTotal(b);
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

  // Parties for the searchable PARTY picker (from existingCustomers + bills)
  const partyOptions = useMemo(() => {
    const list: PartyOption[] = [];
    const seen = new Set<string>();

    existingCustomers.forEach((c) => {
      const trimmed = c.name.trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) return;
      seen.add(trimmed.toLowerCase());
      list.push({
        key: `cust_${c.id || c.name}`,
        name: trimmed,
        phone: c.phone,
        due: c.balanceDue,
        advance: c.advance || 0,
        customerId: c.id,
      });
    });

    bills.forEach((b) => {
      const trimmed = (b.retailer || "").trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) return;
      seen.add(trimmed.toLowerCase());
      list.push({
        key: `bill_${b.id}`,
        name: trimmed,
        phone: b.phone,
        due: getEffectiveBillBalance(b),
        advance: 0,
      });
    });

    return list.sort((a, b) => {
      if (a.due > 0 && b.due <= 0) return -1;
      if (b.due > 0 && a.due <= 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [existingCustomers, bills, getEffectiveBillBalance]);

  // The chosen customer's live invoices (same ownership rules the save uses), for the invoice chooser
  const selectedOpt = !isCustomParty ? partyOptions.find((o) => o.name === selectedParty) : undefined;
  const partyBills = useMemo(() => {
    if (!selectedOpt) return [] as Bill[];
    try {
      return getCustomerLedger(selectedOpt.customerId || selectedOpt.name, selectedOpt.phone)
        .bills.map((b) => bills.find((x) => x.id === b.id) ?? b)
        .filter((b) => b.status !== "cancelled" && !b.cancellation);
    } catch {
      return [] as Bill[];
    }
  }, [selectedOpt, getCustomerLedger, bills]);
  const numericAmount = parseFloat(amount);

  // Search across receipts (used by Recent and History)
  const matchesSearch = useCallback(
    (p: PaymentRecord) => {
      const q = searchTerm.trim().toLowerCase();
      if (!q) return true;
      const name = (p.customerName || "").toLowerCase();
      const ref = (p.referenceNote || "").toLowerCase();
      const mode = (p.mode || "").toLowerCase();
      const pId = formatPaymentId(p.id).toLowerCase();
      const rawId = (p.id || "").toLowerCase();
      return name.includes(q) || ref.includes(q) || mode.includes(q) || pId.includes(q) || rawId.includes(q);
    },
    [searchTerm],
  );

  // Recent = receipts dated today or recorded today. Everything older is History.
  const isRecent = useCallback(
    (p: PaymentRecord) => {
      const d = String(p.paymentDate || p.createdAt || "").slice(0, 10);
      const rec = toLocalISODate(new Date(p.createdAt || Date.now()));
      return d >= todayStr || rec === todayStr;
    },
    [todayStr],
  );
  const recentAll = useMemo(() => allPayments.filter(isRecent), [allPayments, isRecent]);
  const historyAll = useMemo(
    () =>
      allPayments
        .filter((p) => !isRecent(p))
        .sort((a, b) => String(b.paymentDate || b.createdAt).localeCompare(String(a.paymentDate || a.createdAt))),
    [allPayments, isRecent],
  );
  const filteredRecent = useMemo(() => recentAll.filter(matchesSearch), [recentAll, matchesSearch]);
  const filteredHistory = useMemo(() => historyAll.filter(matchesSearch), [historyAll, matchesSearch]);
  const historyGroups = useMemo(() => {
    const groups: { date: string; rows: PaymentRecord[]; total: number }[] = [];
    for (const p of filteredHistory.slice(0, historyVisible)) {
      const d = String(p.paymentDate || p.createdAt || "").slice(0, 10);
      let g = groups[groups.length - 1];
      if (!g || g.date !== d) {
        g = { date: d, rows: [], total: 0 };
        groups.push(g);
      }
      g.rows.push(p);
      g.total += Number(p.amount) || 0;
    }
    return groups;
  }, [filteredHistory, historyVisible]);

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
      const billToPay = !isCustomParty ? selectedBillId : undefined;
      const split = allocateReceipt(numericAmount, partyBills, billToPay);
      const saved = recordCustomerPayment(
        partyToUse,
        numericAmount,
        receiptDate || todayStr,
        paymentMode,
        referenceNote.trim() || undefined,
        billToPay,
        !isCustomParty ? selectedOpt?.customerId : undefined
      );
      if (!saved) {
        // Same receipt sent twice within a few seconds: the first one is already saved.
        setFormFeedback({
          type: "error",
          text: "This receipt was not saved again because an identical one was just recorded.",
        });
        return;
      }

      const where = split.allocations.map((a) => `#${a.billId}`).join(", ");
      setFormFeedback({
        type: "success",
        text:
          `Receipt of ₹${money(numericAmount)} recorded for ${partyToUse}` +
          (where ? ` against invoice ${where}` : "") +
          (split.advance > 0.004 ? `${where ? "; " : " "}₹${money(split.advance)} kept as advance` : "") +
          ".",
      });

      setSelectedParty("");
      setSelectedBillId(undefined);
      setCustomPartyName("");
      setIsCustomParty(false);
      setAmount("");
      setReferenceNote("");
      setPaymentMode("cash");
      setReceiptDate(todayStr);

      setTimeout(() => setFormFeedback(null), 8000);
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

  // One list of receipts, shared by Recent and History: table on desktop, compact rows on mobile
  const renderPaymentList = (rows: PaymentRecord[], emptyText: string) => {
    if (rows.length === 0) {
      return emptyText ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs py-8 text-center text-xs text-slate-400 italic">
          {emptyText}
        </div>
      ) : null;
    }
    return (
      <>
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full min-w-[560px] text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/90 bg-slate-50/70">
                {["ITEM", "DETAILS", "VALUE", "STATUS"].map((h) => (
                  <th key={h} className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p, idx) => (
                <tr
                  key={p.id || idx}
                  onClick={() => setSelectedPaymentForDetails(p)}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  title="Click to view payment details"
                >
                  <td className="py-3.5 px-4 font-bold text-slate-800 text-sm whitespace-nowrap">{formatPaymentId(p.id, idx)}</td>
                  <td className="py-3.5 px-4 text-slate-500 text-sm">
                    {p.customerName} · {formatItemDate(p.paymentDate || p.createdAt)}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-800 text-sm whitespace-nowrap">
                    {p.amount < 0 ? "−" : ""}₹{money(Math.abs(p.amount))}
                  </td>
                  <td className="py-3.5 px-4 text-teal-600 font-medium text-sm whitespace-nowrap">{p.isRefund ? "Refunded" : "Received"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="block md:hidden bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden divide-y divide-slate-100">
          {rows.map((p, idx) => (
            <div
              key={p.id || idx}
              onClick={() => setSelectedPaymentForDetails(p)}
              className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-800 text-sm truncate">{p.customerName}</div>
                <div className="text-slate-500 text-xs mt-0.5 truncate">
                  {formatPaymentId(p.id, idx)} · {formatItemDate(p.paymentDate || p.createdAt)} · {String(p.mode || "").toUpperCase()}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-extrabold text-sm tabular-nums ${p.amount < 0 ? "text-rose-700" : "text-slate-900"}`}>
                  {p.amount < 0 ? "−" : ""}₹{money(Math.abs(p.amount))}
                </div>
                <div className="text-teal-600 font-medium text-[11px]">{p.isRefund ? "Refunded" : "Received"}</div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
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
            <div id="view-payment-details" className="hh-view mw-workspace w-full space-y-4 sm:space-y-5">
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
        <div id="view-payments" className="hh-view mw-workspace w-full space-y-5">
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
              Audit log
            </button>
          </div>
          {showAuditLog && (
            <PaymentAuditModal entries={paymentAudit} onClose={() => setShowAuditLog(false)} />
          )}

          {/* Realtime Cash in Box & Financial Summary Cards (Synchronized Layout & Typography) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-1">
                <span>Cash in Box (Till)</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                ₹{money(realtimeCashInBox)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {cashExpenses > 0 ? `Net drawer cash (less ₹${money(cashExpenses)} paid)` : "Realtime drawer cash"}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-rose-800 uppercase tracking-wider mb-1">
                <span>Market Credit Due</span>
                <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-rose-600 mt-1">
                ₹{money(totalMarketDue)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Pending customer dues (after returns)
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">
                <span>Total Inward Spend</span>
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                ₹{money(totalInwardSpend)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Total purchase spend (GRNs)
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                <span>Total Billed Sales</span>
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                ₹{money(totalBilledSales)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Collected: ₹{money(totalCollectedAmount)}
              </p>
            </div>
          </div>

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

          {/* 2. Record Receipt Form Card (Clean, Symmetrical 2-Column Grid) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6">
            <div className="pb-4 mb-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Record Payment Receipt</h2>
                <p className="text-xs text-slate-500">Collect dues, allocate against invoices, and record payments</p>
              </div>
              <span className="text-xs font-medium text-slate-500">
                Staff: <strong className="text-slate-800">{loggedInUserName}</strong>
              </span>
            </div>

            <form onSubmit={handleRecordReceipt} className="grid gap-6 lg:grid-cols-2">
              {/* LEFT BOX: Party Selection & Due Status */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold tracking-wider text-slate-600 uppercase block">
                      PARTY / CUSTOMER
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomParty(!isCustomParty);
                        setCustomPartyName("");
                        setSelectedParty("");
                        setSelectedBillId(undefined);
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
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
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700"
                    />
                  ) : (
                    <PartySearchSelect
                      options={partyOptions}
                      value={selectedParty}
                      onSelect={(name, opt) => {
                        setSelectedParty(name);
                        setSelectedBillId(undefined);
                        setAmount(opt && opt.due > 0 ? String(opt.due) : "");
                      }}
                    />
                  )}
                </div>

                {/* Selected Party Due Highlight Card */}
                {selectedOpt && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium block">Selected Account</span>
                      <p className="text-sm font-bold text-slate-900 truncate">{selectedParty}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold font-mono tabular-nums text-rose-600">
                        ₹{money(Math.max(0, selectedOpt.due))}
                      </p>
                      <span className="text-[10px] font-semibold text-rose-700 uppercase">
                        {t('collect.totalDue')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Invoice Picker */}
                {selectedOpt && (
                  <div className="pt-1">
                    <label className="text-xs font-semibold tracking-wider text-slate-600 uppercase block mb-1.5">
                      ALLOCATE TO INVOICE
                    </label>
                    <InvoicePicker
                      bills={partyBills}
                      selectedId={selectedBillId}
                      amount={isNaN(numericAmount) ? 0 : numericAmount}
                      onSelect={(id, due) => {
                        setSelectedBillId(id);
                        if (due > 0) setAmount(String(Math.round(due * 100) / 100));
                      }}
                    />
                  </div>
                )}

                {selectedOpt && partyBills.every((b) => billBalance(b) <= 0.004) && (
                  <p className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800 font-medium">
                    No unpaid invoice for this party. Payment will be credited as an advance for the next bill.
                  </p>
                )}
              </div>

              {/* RIGHT BOX: Payment Mode, Amount, Date & UTR */}
              <div className="space-y-4">
                {/* Mode Selector */}
                <div>
                  <label className="text-xs font-semibold tracking-wider text-slate-600 uppercase block mb-1.5">
                    PAYMENT MODE
                  </label>
                  <SegmentedPeriod
                    ariaLabel={t('collect.mode')}
                    options={[
                      { id: "cash", label: "Cash" },
                      { id: "upi", label: "UPI" },
                      { id: "cheque", label: "Cheque" },
                      { id: "bank", label: "Bank" },
                      { id: "other", label: "Other" },
                    ]}
                    value={paymentMode}
                    onChange={(id) => setPaymentMode(id as PaymentMode)}
                  />
                </div>

                {/* Amount Field with ₹ Prefix & Quick Full-Pay */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="payment-receipt-amount" className="text-xs font-semibold tracking-wider text-slate-600 uppercase block">
                      RECEIPT AMOUNT (₹)
                    </label>
                    {selectedOpt && selectedOpt.due > 0 && (
                      <button
                        type="button"
                        onClick={() => { setSelectedBillId(undefined); setAmount(String(selectedOpt.due)); }}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer flex items-center gap-1"
                      >
                        <span>{t('collect.payFull')}:</span>
                        <span className="font-mono tabular-nums font-bold">₹{money(selectedOpt.due)}</span>
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">₹</span>
                    <input
                      id="payment-receipt-amount"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-8 pr-3.5 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white font-mono tabular-nums font-bold text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700"
                    />
                  </div>
                </div>

                {/* Date and Reference Side-by-Side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="payment-receipt-date-input"
                        className="text-xs font-semibold tracking-wider text-slate-600 uppercase"
                      >
                        RECEIPT DATE
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setReceiptDate(todayStr)}
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                            receiptDate === todayStr
                              ? "bg-emerald-700 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => setReceiptDate(yesterdayStr)}
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                            receiptDate === yesterdayStr
                              ? "bg-emerald-700 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          Yesterday
                        </button>
                      </div>
                    </div>
                    <input
                      id="payment-receipt-date-input"
                      type="date"
                      required
                      value={toStandardIsoDate(receiptDate)}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700"
                    />
                  </div>

                  <div>
                    <label htmlFor="payment-receipt-ref" className="text-xs font-semibold tracking-wider text-slate-600 uppercase block mb-1.5">
                      REFERENCE / UTR
                    </label>
                    <input
                      id="payment-receipt-ref"
                      type="text"
                      value={referenceNote}
                      onChange={(e) => setReferenceNote(e.target.value)}
                      placeholder="UPI ref, cheque no., note"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700"
                    />
                  </div>
                </div>

                {/* Submit Action Button */}
                <div className="pt-2 space-y-1.5">
                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t('collect.saveReceipt')}</span>
                  </button>
                  <p className="text-center text-[11px] text-slate-500">{t('collect.whatsappNote')}</p>
                </div>
              </div>
            </form>
          </div>

          {/* 3. Tabs: Recent (today) · Due invoices · History · Reports */}
          <div
            role="tablist"
            aria-label="Payment views"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold overflow-x-auto no-scrollbar max-w-full"
          >
            {(
              [
                { id: "recent", label: `Recent (${recentAll.length})`, tone: "text-slate-900" },
                { id: "due", label: `Due (${dueBills.length})`, tone: "text-rose-700" },
                { id: "history", label: `History (${historyAll.length})`, tone: "text-slate-900" },
                { id: "reports", label: "Reports", tone: "text-emerald-800" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 px-3 py-2 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === t.id ? `bg-white ${t.tone} shadow-xs font-bold` : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search (Recent, Due and History) */}
          {activeTab !== "reports" && (
            <div className="relative md:max-w-xs md:ml-auto">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                enterKeyHint="search"
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setHistoryVisible(HISTORY_PAGE);
                }}
                placeholder={activeTab === "due" ? "Search customer or invoice" : "Search payments"}
                className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 placeholder:text-slate-400"
              />
              {searchTerm && (
                <button
                  aria-label="Clear search"
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Recent: today's receipts */}
          {activeTab === "recent" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Today · {formatItemDate(todayStr)}</span>
                <span>
                  {recentAll.length} receipt{recentAll.length === 1 ? "" : "s"} · ₹
                  {money(recentAll.reduce((sum, p) => sum + (Number(p.amount) || 0), 0))}
                </span>
              </div>
              {renderPaymentList(filteredRecent, recentAll.length === 0 ? "No receipts today yet. Older ones are in History." : "No payment receipts match your search")}
            </div>
          )}

          {/* History: everything before today */}
          {activeTab === "history" && (
            <div className="space-y-3">
              {historyGroups.length === 0 ? (
                renderPaymentList([], historyAll.length === 0 ? "No older receipts yet." : "No payment receipts match your search")
              ) : (
                historyGroups.map((g) => (
                  <div key={g.date} className="space-y-1.5">
                    <div className="flex items-center justify-between px-1 text-xs">
                      <span className="font-bold text-slate-800">{formatItemDate(g.date)} · {g.date}</span>
                      <span className="text-slate-500">
                        {g.rows.length} · ₹{money(g.total)}
                      </span>
                    </div>
                    {renderPaymentList(g.rows, "")}
                  </div>
                ))
              )}
              {filteredHistory.length > historyVisible && (
                <button
                  type="button"
                  onClick={() => setHistoryVisible((v) => v + HISTORY_PAGE)}
                  className="w-full py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Show more ({filteredHistory.length - historyVisible} left)
                </button>
              )}
            </div>
          )}

          {/* 5. Tab 2: Due / Credit Invoices View */}
          {activeTab === "due" && (
            <div className="space-y-3">
              <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
                <table className="w-full min-w-[560px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/90 bg-slate-50/70">
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        ITEM
                      </th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        DETAILS
                      </th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        BALANCE DUE
                      </th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
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
                            <td className="py-3.5 px-4 font-bold text-slate-800 text-sm whitespace-nowrap">
                              INV-{String(b.id).padStart(4, "0")}
                            </td>
                            <td className="py-3.5 px-4 text-slate-500 text-sm">
                              {b.retailer || "Cash Sale"} · {formatItemDate(b.date || "")}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-rose-700 text-sm whitespace-nowrap">
                              ₹{money(due)}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
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

          {/* Reports: total, day-wise, beat-wise, customer-wise (each downloadable) */}
          {activeTab === "reports" && <PaymentReportsPanel />}
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
