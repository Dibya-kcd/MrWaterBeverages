import React, { useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CreditCard,
  Edit2,
  FileText,
  History,
  MessageCircle,
  Phone,
  Printer,
  Receipt,
  RotateCcw,
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
import { useIsMobile } from "../../hooks/useIsMobile";
import { useBeats } from "../../hooks/useBeats";
import { SegmentedPeriod, getInitials } from "../ui/HomeKit";
import { money, whatsappLink } from "../../utils/billing";
import { RecordPaymentModal } from "../common/RecordPaymentModal";
import { InvoicePicker } from "../common/InvoicePicker";
import { allocateReceipt } from "../../utils/paymentAllocation";
import { TaxInvoiceModal } from "../common/TaxInvoiceModal";
import { ConfirmModal, Badge } from "../ui";
import { billBalance, billNetTotal } from "../../utils/salesReturns";
import { todayISO, toLocalISODate } from "../../utils/dateLocal";
import { PaymentAuditModal } from "../common/PaymentAuditModal";
import { GhostPaymentsModal } from "../common/GhostPaymentsModal";
import { PartySearchSelect, type PartyOption } from "../common/PartySearchSelect";
import { PaymentReportsPanel } from "./payments/PaymentReportsPanel";
import { formatPaymentId } from "../../utils/beatReports";
import { formatBillNumber, isGstExcludedBill } from "../../utils/invoiceCommon";

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

/** Formats ISO date/timestamp for "20 Nov 2026" display */
function formatDateLongDisplay(dateStr?: string): string {
  const iso = toStandardIsoDate(dateStr);
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`;
}

/** Formats Today's time for Recent receipts (e.g. "Today 11:20 am" or "20 Nov") */
function formatRecentDateMeta(p: PaymentRecord, todayStr: string): string {
  const datePart = String(p.paymentDate || p.createdAt || "").slice(0, 10);
  if (datePart === todayStr && p.createdAt) {
    const dt = new Date(p.createdAt);
    if (!isNaN(dt.getTime())) {
      const timeStr = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
      return `Today ${timeStr}`;
    }
    return "Today";
  }
  return formatItemDate(p.paymentDate || p.createdAt);
}

/** Default sample preset payments to match user screenshots if no history exists */

export const PaymentsView: React.FC = () => {
  const { t } = useLanguage();
  const isPhone = useIsMobile(767);
  const { customerBeat } = useBeats();
  const {
    payments,
    recordCustomerPayment,
    recordCustomerRefund,
    getCustomerCreditSummary,
    paymentAudit,
    updatePayment,
    deletePayment,
    ghostPayments,
    removeGhostPayments,
    customers,
    existingCustomers,
    getCustomerLedger,
    bills,
    grns,
    expenses,
    palette,
    orgProfile,
    billingSettings,
    products,
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
  const [historyModeFilter, setHistoryModeFilter] = useState<"all" | PaymentMode | "refund">("all");
  const HISTORY_PAGE = 50;
  const [historyVisible, setHistoryVisible] = useState<number>(HISTORY_PAGE);

  // Phone sub-flows: Record Payment (3 steps), Detail Bottom Sheet, Refund Screen
  const [phonePayStep, setPhonePayStep] = useState<"account" | "details" | "receipt" | null>(null);
  const [phoneAccountQuery, setPhoneAccountQuery] = useState("");
  const [savedPhonePayment, setSavedPhonePayment] = useState<PaymentRecord | null>(null);
  const [phoneSheetPayment, setPhoneSheetPayment] = useState<PaymentRecord | null>(null);
  const [phoneRefundPayment, setPhoneRefundPayment] = useState<PaymentRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMode, setRefundMode] = useState<PaymentMode>("cash");
  const [refundNote, setRefundNote] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);

  // Selection state for Item Detail View (user requested: clicking on the items should open the detail view)
  const [selectedPaymentForDetails, setSelectedPaymentForDetails] = useState<PaymentRecord | null>(null);

  // Modals state - ALWAYS rendered at the root level with high z-index so they never appear behind
  const [receiptPayment, setReceiptPayment] = useState<PaymentRecord | null>(null);
  const [paymentToEdit, setPaymentToEdit] = useState<PaymentRecord | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showGhostPaymentsModal, setShowGhostPaymentsModal] = useState(false);
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

  const phoneRecentCustomerNames = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of allPayments) {
      const n = (p.customerName || "").trim();
      if (!n || seen.has(n.toLowerCase())) continue;
      seen.add(n.toLowerCase());
      out.push(n);
      if (out.length >= 4) break;
    }
    return out;
  }, [allPayments]);

  const matchingPhoneParties = useMemo(() => {
    const q = phoneAccountQuery.trim().toLowerCase();
    if (!q) return partyOptions.slice(0, 6);
    return partyOptions
      .filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.phone || "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [partyOptions, phoneAccountQuery]);

  const phoneFilteredHistory = useMemo(() => {
    if (historyModeFilter === "all") return filteredHistory;
    if (historyModeFilter === "refund") {
      return filteredHistory.filter((p) => Boolean(p.isRefund || p.amount < 0));
    }
    return filteredHistory.filter(
      (p) => !p.isRefund && p.amount >= 0 && String(p.mode || "cash").toLowerCase() === historyModeFilter,
    );
  }, [filteredHistory, historyModeFilter]);

  const openPhoneRecordFlow = (presetParty?: string, presetBillId?: number, presetAmount?: string) => {
    setFormFeedback(null);
    if (presetParty) {
      setIsCustomParty(false);
      setCustomPartyName("");
      setSelectedParty(presetParty);
      setSelectedBillId(presetBillId);
      setAmount(presetAmount ?? "");
      setPhonePayStep("details");
    } else {
      setIsCustomParty(false);
      setCustomPartyName("");
      setSelectedBillId(undefined);
      setPhoneAccountQuery("");
      setPhonePayStep("account");
    }
  };

  const handlePhoneSaveReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    const partyToUse = isCustomParty ? customPartyName.trim() : selectedParty.trim();
    if (!partyToUse) {
      setFormFeedback({ type: "error", text: "Please choose or enter a party name" });
      return;
    }
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setFormFeedback({ type: "error", text: "Please enter a valid payment amount" });
      return;
    }

    try {
      const billToPay = !isCustomParty ? selectedBillId : undefined;
      const saved = recordCustomerPayment(
        partyToUse,
        amtNum,
        receiptDate || todayStr,
        paymentMode,
        referenceNote.trim() || undefined,
        billToPay,
        !isCustomParty ? selectedOpt?.customerId : undefined,
      );
      if (!saved) {
        setFormFeedback({
          type: "error",
          text: "This receipt was not saved again because an identical one was just recorded.",
        });
        return;
      }

      setSavedPhonePayment({
        id: `pay_${Date.now().toString(36)}`,
        billId: billToPay,
        customerName: partyToUse,
        customerId: !isCustomParty ? selectedOpt?.customerId : undefined,
        customerPhone: !isCustomParty ? selectedOpt?.phone : undefined,
        paymentDate: receiptDate || todayStr,
        amount: amtNum,
        mode: paymentMode,
        referenceNote: referenceNote.trim() || undefined,
        recordedBy: loggedInUserName,
        salesmanId: currentUser?.role === "salesman" ? currentUser.id : undefined,
        createdAt: new Date().toISOString(),
      });
      setSelectedParty("");
      setSelectedBillId(undefined);
      setCustomPartyName("");
      setIsCustomParty(false);
      setAmount("");
      setReferenceNote("");
      setPaymentMode("cash");
      setReceiptDate(todayStr);
      setPhonePayStep("receipt");
    } catch (err: any) {
      setFormFeedback({
        type: "error",
        text: err?.message || "Failed to record payment receipt",
      });
    }
  };

  const modeLabelText = (mode: PaymentMode, isRefund?: boolean) => {
    if (isRefund) return t("pay.refundTag");
    switch (mode) {
      case "upi":
        return t("pay.modeUpi");
      case "cheque":
        return t("pay.modeCheque");
      case "bank":
        return t("pay.modeBank");
      case "other":
        return t("pay.modeOther");
      default:
        return t("pay.modeCash");
    }
  };

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
        <div
          data-card-tone="neutral"
          className="rounded-2xl border shadow-xs py-8 text-center text-xs text-slate-500 font-medium"
        >
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

        <div className="block md:hidden space-y-2.5">
          {rows.map((p, idx) => {
            const isRefund = Boolean(p.isRefund || p.amount < 0);
            return (
              <div
                key={p.id || idx}
                data-card-tone={isRefund ? "due" : "received"}
                onClick={() => setSelectedPaymentForDetails(p)}
                className="rounded-2xl border px-3.5 py-3 shadow-xs flex items-center justify-between gap-3 active:scale-[0.99] cursor-pointer transition-all"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className={`hh-avatar hh-avatar--sm shrink-0 ${isRefund ? "hh-avatar--rose" : "hh-avatar--green"}`}>
                    {getInitials(p.customerName || "C", "C")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-slate-900 text-sm min-w-0 break-words lg:truncate">{p.customerName}</div>
                    <div className="text-slate-600 text-xs mt-0.5 min-w-0 break-words lg:truncate font-medium">
                      {formatPaymentId(p.id, idx)} · {formatItemDate(p.paymentDate || p.createdAt)} · {String(p.mode || "").toUpperCase()}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-black text-[15px] tabular-nums ${isRefund ? "text-rose-700" : "text-emerald-800"}`}>
                    {p.amount < 0 ? "−" : "+"}₹{money(Math.abs(p.amount))}
                  </div>
                  <span
                    className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      isRefund
                        ? "bg-rose-100/90 text-rose-800"
                        : "bg-emerald-100/90 text-emerald-800"
                    }`}
                  >
                    {p.isRefund ? "Refunded" : "Received"}
                  </span>
                </div>
              </div>
            );
          })}
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
      {isPhone && phoneRefundPayment ? (
        (() => {
          const orig = phoneRefundPayment;
          const credit = getCustomerCreditSummary(orig.customerName);
          const alreadyRefunded = allPayments
            .filter(
              (x) =>
                x.isRefund &&
                (x.customerName || "").trim().toLowerCase() === (orig.customerName || "").trim().toLowerCase(),
            )
            .reduce((s, x) => s + Math.abs(Number(x.amount) || 0), 0);
          const maxRefundable = Math.max(0, credit.refundable);

          return (
            <div id="view-payments" className="rt-flow-phone">
              <div className="hh-sales-top">
                <div className="hh-sales-top__row">
                  <div className="flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneRefundPayment(null);
                        setRefundError(null);
                      }}
                      className="hh-sales-top__iconbtn"
                      aria-label={t("common.back")}
                    >
                      <ChevronLeft size={24} strokeWidth={2.2} />
                    </button>
                    <h1 className="hh-sales-top__title">{t("pay.refund")}</h1>
                  </div>
                  <span className="hh-sales-top__pill shrink-0">{orig.customerName}</span>
                </div>
              </div>

              <div className="rt-flow-phone__body space-y-3">
                <div className="rt-card rt-card--divided">
                  <div className="rt-ln">
                    <span style={{ color: "var(--text-2)" }}>{t("pay.originalPayment")}</span>
                    <span className="font-bold tabular-nums" style={{ color: "var(--text)" }}>
                      ₹{money(Math.abs(orig.amount))} · {modeLabelText(orig.mode)}
                    </span>
                  </div>
                  <div className="rt-ln">
                    <span style={{ color: "var(--text-2)" }}>{t("pay.alreadyRefunded")}</span>
                    <span className="font-bold tabular-nums" style={{ color: "var(--text)" }}>
                      ₹{money(alreadyRefunded)}
                    </span>
                  </div>
                </div>

                <label className="rt-fld block">
                  <span className="rt-fld__label">{t("pay.refundAmount")}</span>
                  <div className="rt-fld__row">
                    <span className="rt-fld__curr">₹</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={refundAmount}
                      onChange={(e) => {
                        setRefundAmount(e.target.value);
                        setRefundError(null);
                      }}
                      placeholder="0"
                      className="rt-fld__input"
                    />
                  </div>
                </label>

                <div>
                  <div className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>
                    {t("pay.refundMethod")}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(["cash", "upi", "cheque", "bank", "other"] as PaymentMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={refundMode === m}
                        onClick={() => setRefundMode(m)}
                        className="rt-pay-pill text-[11.5px] font-bold cursor-pointer bg-white"
                      >
                        {modeLabelText(m)}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="rt-in">
                  <span className="rt-in__label uppercase">{t("pay.note")}</span>
                  <input
                    type="text"
                    value={refundNote}
                    onChange={(e) => setRefundNote(e.target.value)}
                    placeholder={t("pay.reasonForRefund")}
                    className="rt-in__control"
                  />
                </label>

                <div className="rt-noti">
                  <span>
                    {maxRefundable <= 0.004
                      ? t("pay.noAdvanceRefundNotice")
                      : t("pay.refundNotice")}
                  </span>
                </div>

                {refundError && (
                  <div className="hh-hist-card hh-hist-card--due text-[12.5px] font-semibold" style={{ color: "var(--due)" }}>
                    {refundError}
                  </div>
                )}
              </div>

              <div className="rt-flow-phone__footer">
                <button
                  type="button"
                  disabled={maxRefundable <= 0.004}
                  onClick={() => {
                    const num = parseFloat(refundAmount);
                    if (isNaN(num) || num <= 0) {
                      setRefundError("Enter a valid refund amount");
                      return;
                    }
                    if (num > maxRefundable + 0.01) {
                      setRefundError(`Cannot exceed refundable advance ₹${money(maxRefundable)}`);
                      return;
                    }
                    const ok = recordCustomerRefund(
                      orig.customerName,
                      num,
                      todayStr,
                      refundMode,
                      refundNote.trim() || undefined,
                    );
                    if (!ok) {
                      setRefundError("Refund could not be recorded");
                      return;
                    }
                    setPhoneRefundPayment(null);
                    setRefundAmount("");
                    setRefundNote("");
                    setRefundError(null);
                  }}
                  className="rt-btn rt-btn--due w-full"
                >
                  {t("pay.recordRefund")}
                </button>
              </div>
            </div>
          );
        })()
      ) : isPhone && phonePayStep !== null ? (
        (() => {
          if (phonePayStep === "receipt" && savedPhonePayment) {
            const sp = savedPhonePayment;
            const matchedCust = existingCustomers.find(
              (c) => c.name.trim().toLowerCase() === (sp.customerName || "").trim().toLowerCase(),
            );
            const phone = sp.customerPhone || matchedCust?.phone || "";
            const waText = `*Payment Receipt - ${orgProfile?.name || "MrWater Distribution"}*\nCustomer: ${sp.customerName}\nAmount Received: ₹${money(sp.amount)}\nMode: ${sp.mode.toUpperCase()}\nDate: ${sp.paymentDate || sp.createdAt?.slice(0, 10)}\n${sp.referenceNote ? `Ref Note: ${sp.referenceNote}\n` : ""}Thank you for your payment!`;

            return (
              <div id="view-payments" className="rt-flow-phone">
                <div className="hh-sales-top">
                  <div className="hh-sales-top__row">
                    <h1 className="hh-sales-top__title">{t("pay.paymentSaved")}</h1>
                    <span
                      className="size-8 rounded-full inline-flex items-center justify-center shrink-0"
                      style={{ background: "var(--paid-bg)", color: "var(--paid)" }}
                    >
                      <Check size={17} strokeWidth={2.8} />
                    </span>
                  </div>
                </div>

                <div className="rt-flow-phone__body space-y-3">
                  <div className="hh-paper space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
                        {t("pay.officialReceipt")}
                      </span>
                      <span className="font-mono text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
                        #{formatPaymentId(sp.id)}
                      </span>
                    </div>
                    <hr className="hh-paper__hr" />
                    <div className="rt-ln">
                      <span style={{ color: "var(--text-2)" }}>Customer</span>
                      <span className="font-bold text-right break-words" style={{ color: "var(--text)" }}>
                        {sp.customerName}
                      </span>
                    </div>
                    <div className="rt-ln">
                      <span style={{ color: "var(--text-2)" }}>{t("pay.paymentDate")}</span>
                      <span className="font-bold" style={{ color: "var(--text)" }}>
                        {formatItemDate(sp.paymentDate || sp.createdAt)} {String(sp.paymentDate || todayStr).slice(0, 4)}
                      </span>
                    </div>
                    <div className="rt-ln">
                      <span style={{ color: "var(--text-2)" }}>{t("pay.paymentMode")}</span>
                      <span className="font-bold" style={{ color: "var(--text)" }}>
                        {modeLabelText(sp.mode)}
                      </span>
                    </div>
                    <div className="rt-ln">
                      <span style={{ color: "var(--text-2)" }}>{t("pay.recordedBy")}</span>
                      <span className="font-bold" style={{ color: "var(--text)" }}>
                        {sp.recordedBy || loggedInUserName}
                      </span>
                    </div>
                    <div className="rt-ln">
                      <span style={{ color: "var(--text-2)" }}>{t("pay.refNoteLabel")}</span>
                      <span className="font-bold" style={{ color: "var(--text)" }}>
                        {sp.referenceNote || "—"}
                      </span>
                    </div>
                    <hr className="hh-paper__hr" />
                    <div className="flex items-baseline justify-between gap-2 py-1">
                      <span className="text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
                        {t("pay.amount")}
                      </span>
                      <span className="text-[18px] font-extrabold tabular-nums" style={{ color: "var(--text)" }}>
                        ₹{money(sp.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 text-[11px]" style={{ color: "var(--text-2)" }}>
                      <span>{t("pay.customerSignature")}</span>
                      <span>{t("pay.authorizedSignatory")}</span>
                    </div>
                  </div>

                  {phone ? (
                    <a
                      href={whatsappLink(phone, waText)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rt-btn rt-btn--wa w-full no-underline"
                    >
                      {t("pay.sendWaReceipt")}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsAppPromptPayment(sp);
                        setPromptPhoneInput("");
                      }}
                      className="rt-btn rt-btn--wa w-full"
                    >
                      {t("pay.sendWaReceipt")}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setReceiptPayment(sp)}
                    className="rt-btn-outline rt-btn-outline--primary w-full"
                  >
                    {t("common.print")}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPhonePayStep(null);
                      setSavedPhonePayment(null);
                    }}
                    className="rt-link-btn w-full"
                  >
                    {t("pay.backToPayments")}
                  </button>
                </div>
              </div>
            );
          }

          if (phonePayStep === "account") {
            const activePartyName = isCustomParty ? customPartyName.trim() : selectedParty.trim();
            const custRow = selectedOpt
              ? existingCustomers.find((c) => c.id === selectedOpt.customerId || c.name.trim().toLowerCase() === selectedOpt.name.trim().toLowerCase())
              : undefined;
            const fullCustRow = selectedOpt
              ? (selectedOpt.customerId ? (customers || []).find((c) => c.id === selectedOpt.customerId) : undefined) ||
                (customers || []).find((c) => c.name.trim().toLowerCase() === selectedOpt.name.trim().toLowerCase())
              : undefined;
            const beatSubtitle = (fullCustRow && customerBeat(fullCustRow)?.name) || fullCustRow?.route || custRow?.city || "";
            const acctBillsCount = selectedOpt
              ? partyBills.filter((b) => billBalance(b) > 0.004).length
              : 0;
            const qTrim = phoneAccountQuery.trim();
            const exactFound = partyOptions.some((o) => o.name.toLowerCase() === qTrim.toLowerCase());

            return (
              <div id="view-payments" className="rt-flow-phone">
                <div className="hh-sales-top">
                  <div className="hh-sales-top__row">
                    <div className="flex items-center gap-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => setPhonePayStep(null)}
                        className="hh-sales-top__iconbtn"
                        aria-label={t("common.back")}
                      >
                        <ChevronLeft size={24} strokeWidth={2.2} />
                      </button>
                      <h1 className="hh-sales-top__title">{t("pay.recordPayment")}</h1>
                    </div>
                  </div>
                </div>

                <div className="rt-flow-phone__body space-y-3">
                  <div className="rt-search-bar">
                    <Search size={16} style={{ color: "var(--text-2)", flexShrink: 0 }} />
                    <input
                      type="text"
                      value={phoneAccountQuery}
                      onChange={(e) => setPhoneAccountQuery(e.target.value)}
                      placeholder={t("pay.enterPartyPlaceholder")}
                    />
                    {phoneAccountQuery && (
                      <button
                        type="button"
                        onClick={() => setPhoneAccountQuery("")}
                        aria-label="Clear"
                        className="p-1 bg-transparent border-0 cursor-pointer"
                        style={{ color: "var(--text-2)" }}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  {activePartyName && (
                    <div className="hh-hist-card hh-hist-card--primary space-y-2.5">
                      <div>
                        <div className="text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
                          {t("pay.selectedAccount")}
                        </div>
                        <div className="text-[16px] font-extrabold break-words mt-0.5" style={{ color: "var(--text)" }}>
                          {activePartyName}
                        </div>
                        {(beatSubtitle || selectedOpt?.phone) && (
                          <div className="text-[12px] mt-0.5" style={{ color: "var(--text-2)" }}>
                            {[beatSubtitle, selectedOpt?.phone].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <div className="rt-three">
                        <div className="rt-three__col">
                          <span className="rt-three__label">{t("pay.totalDue")}</span>
                          <span className="rt-three__val" style={{ color: (selectedOpt?.due || 0) > 0.004 ? "var(--due)" : "var(--text)" }}>
                            ₹{money(Math.max(0, selectedOpt?.due || 0))}
                          </span>
                        </div>
                        <div className="rt-three__col">
                          <span className="rt-three__label">{t("pay.openInvoices")}</span>
                          <span className="rt-three__val">{acctBillsCount}</span>
                        </div>
                        <div className="rt-three__col">
                          <span className="rt-three__label">{t("pay.advance")}</span>
                          <span className="rt-three__val" style={{ color: (selectedOpt?.advance || 0) > 0.004 ? "var(--paid)" : "var(--text)" }}>
                            ₹{money(selectedOpt?.advance || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {phoneRecentCustomerNames.length > 0 && !qTrim && (
                    <div className="text-[12px] leading-relaxed px-0.5" style={{ color: "var(--text-2)" }}>
                      <span>{t("pay.recentPrefix")} </span>
                      {phoneRecentCustomerNames.map((n, i) => (
                        <React.Fragment key={n}>
                          {i > 0 && ", "}
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomParty(false);
                              setCustomPartyName("");
                              setSelectedParty(n);
                              setSelectedBillId(undefined);
                            }}
                            className="bg-transparent border-0 p-0 font-semibold cursor-pointer underline-offset-2 hover:underline"
                            style={{ color: "var(--text-2)", minHeight: "24px" }}
                          >
                            {n}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  )}

                  {(qTrim || !activePartyName) && (
                    <div className="rt-card">
                      {matchingPhoneParties.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setIsCustomParty(false);
                            setCustomPartyName("");
                            setSelectedParty(opt.name);
                            setSelectedBillId(undefined);
                            setPhoneAccountQuery("");
                          }}
                          className="rt-rowi"
                        >
                          <span className="rt-ico shrink-0">{getInitials(opt.name, "C")}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-bold break-words" style={{ color: "var(--text)" }}>
                              {opt.name}
                            </span>
                            {opt.phone && (
                              <span className="block text-[11.5px]" style={{ color: "var(--text-2)" }}>
                                {opt.phone}
                              </span>
                            )}
                          </span>
                          <span className="rt-amt text-[13px]" style={{ color: opt.due > 0.004 ? "var(--due)" : "var(--paid)" }}>
                            ₹{money(Math.max(0, opt.due))}
                          </span>
                        </button>
                      ))}
                      {qTrim && !exactFound && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomParty(true);
                            setCustomPartyName(qTrim);
                            setSelectedParty("");
                            setSelectedBillId(undefined);
                            setPhoneAccountQuery("");
                          }}
                          className="rt-rowi"
                        >
                          <span className="rt-ico rt-ico--primary shrink-0">+</span>
                          <span className="text-[13px] font-bold" style={{ color: "var(--primary)" }}>
                            {qTrim}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="rt-flow-phone__footer">
                  <button
                    type="button"
                    disabled={!activePartyName}
                    onClick={() => {
                      if (selectedOpt && selectedOpt.due > 0 && !amount) {
                        setAmount(String(Math.round(selectedOpt.due * 100) / 100));
                      }
                      setPhonePayStep("details");
                    }}
                    className="rt-btn w-full"
                  >
                    {t("common.next")}
                  </button>
                </div>
              </div>
            );
          }

          // phonePayStep === 'details'
          const activePartyName = isCustomParty ? customPartyName.trim() : selectedParty.trim();
          const unpaidBills = partyBills
            .filter((b) => billBalance(b) > 0.004)
            .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || Number(a.id) - Number(b.id));
          const amtVal = isNaN(numericAmount) ? 0 : Math.max(0, numericAmount);
          const allocSplit = allocateReceipt(amtVal, partyBills, !isCustomParty ? selectedBillId : undefined);
          const allocMap = new Map<number, number>();
          allocSplit.allocations.forEach((a) => allocMap.set(a.billId, a.amount));
          const totalPartyDue = selectedOpt ? Math.max(0, selectedOpt.due) : 0;
          const remainingAfter = Math.max(0, totalPartyDue - amtVal);

          return (
            <form id="view-payments" onSubmit={handlePhoneSaveReceipt} className="rt-flow-phone">
              <div className="hh-sales-top">
                <div className="hh-sales-top__row">
                  <div className="flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setPhonePayStep("account")}
                      className="hh-sales-top__iconbtn"
                      aria-label={t("common.back")}
                    >
                      <ChevronLeft size={24} strokeWidth={2.2} />
                    </button>
                    <h1 className="hh-sales-top__title">{t("pay.recordPayment")}</h1>
                  </div>
                  <span className="hh-sales-top__pill shrink-0">{activePartyName}</span>
                </div>
              </div>

              <div className="rt-flow-phone__body space-y-3">
                {formFeedback && formFeedback.type === "error" && (
                  <div className="hh-hist-card hh-hist-card--due text-[12.5px] font-semibold" style={{ color: "var(--due)" }}>
                    {formFeedback.text}
                  </div>
                )}

                <div>
                  <div className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>
                    {t("pay.paymentMethod")}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(["cash", "upi", "cheque", "bank", "other"] as PaymentMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={paymentMode === m}
                        onClick={() => setPaymentMode(m)}
                        className="rt-pay-pill text-[11.5px] font-bold cursor-pointer bg-white"
                      >
                        {modeLabelText(m)}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="rt-fld block">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rt-fld__label">{t("pay.amount")}</span>
                    {totalPartyDue > 0.004 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBillId(undefined);
                          setAmount(String(totalPartyDue));
                        }}
                        className="text-[11px] font-bold bg-transparent border-0 p-0 cursor-pointer"
                        style={{ color: "var(--primary)", minHeight: "22px" }}
                      >
                        {t("collect.payFull")} ₹{money(totalPartyDue)}
                      </button>
                    )}
                  </div>
                  <div className="rt-fld__row">
                    <span className="rt-fld__curr">₹</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      className="rt-fld__input"
                    />
                  </div>
                </label>

                <label className="rt-in">
                  <span className="rt-in__label uppercase">{t("pay.refUtr")}</span>
                  <input
                    type="text"
                    value={referenceNote}
                    onChange={(e) => setReferenceNote(e.target.value)}
                    placeholder={t("pay.refPlaceholder")}
                    className="rt-in__control"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="rt-in cursor-pointer">
                    <span className="rt-in__label uppercase">{t("pay.date")}</span>
                    <div className="rt-in__control flex items-center">
                      {formatDateLongDisplay(receiptDate)}
                    </div>
                    <input
                      type="date"
                      required
                      aria-label={t("pay.date")}
                      value={toStandardIsoDate(receiptDate)}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      className="rt-trip-field__date-overlay"
                    />
                  </label>
                  <div className="rt-in">
                    <span className="rt-in__label uppercase">{t("pay.recordedBy")}</span>
                    <div className="rt-in__control flex items-center">{loggedInUserName}</div>
                  </div>
                </div>

                <div className="rt-card space-y-1.5">
                  <div className="flex items-center justify-between gap-2 pb-1">
                    <span className="text-[13.5px] font-bold" style={{ color: "var(--text)" }}>
                      {t("pay.allocateInvoices")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedBillId(undefined)}
                      className="text-[12px] font-bold bg-transparent border-0 p-0 cursor-pointer"
                      style={{ color: "var(--primary)", minHeight: "32px" }}
                    >
                      {t("pay.oldestFirst")}
                    </button>
                  </div>

                  {unpaidBills.length === 0 ? (
                    <p className="text-[12px] m-0 py-1" style={{ color: "var(--text-2)" }}>
                      No unpaid invoice for this party. Payment will be credited as an advance.
                    </p>
                  ) : (
                    <div>
                      {unpaidBills.map((b) => {
                        const due = billBalance(b);
                        const allocated = allocMap.get(b.id) || 0;
                        const active = selectedBillId === b.id || allocated > 0.004;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              if (selectedBillId === b.id) {
                                setSelectedBillId(undefined);
                              } else {
                                setSelectedBillId(b.id);
                                setAmount(String(Math.round(due * 100) / 100));
                              }
                            }}
                            className="rt-rowi"
                          >
                            <span
                              className="size-5 rounded-md border flex items-center justify-center shrink-0"
                              style={{
                                background: active ? "var(--primary)" : "var(--surface)",
                                borderColor: active ? "var(--primary)" : "var(--border)",
                                color: "var(--surface)",
                              }}
                            >
                              {active && <Check size={13} strokeWidth={3} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-bold" style={{ color: "var(--text)" }}>
                                {formatBillNumber(b, billingSettings)}
                              </span>
                              <span className="block text-[11.5px]" style={{ color: "var(--text-2)" }}>
                                {t("status.due")} ₹{money(due)}
                              </span>
                            </span>
                            <span className="text-[13px] font-extrabold tabular-nums shrink-0" style={{ color: "var(--text)" }}>
                              ₹{money(allocated)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="rt-flow-phone__footer space-y-2">
                {totalPartyDue > 0.004 && (
                  <div className="flex items-center justify-between gap-2 px-1 text-[13px]">
                    <span className="font-semibold" style={{ color: "var(--text-2)" }}>
                      {t("pay.remainingDueAfter")}
                    </span>
                    <span className="font-extrabold tabular-nums" style={{ color: remainingAfter > 0.004 ? "var(--due)" : "var(--paid)" }}>
                      ₹{money(remainingAfter)}
                    </span>
                  </div>
                )}
                <button type="submit" className="rt-btn w-full">
                  {t("pay.savePayment")}
                </button>
              </div>
            </form>
          );
        })()
      ) : selectedPaymentForDetails ? (
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
              <div
                data-card-tone={p.amount < 0 ? "due" : "received"}
                className="rounded-2xl border p-4 sm:p-6 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/5 pb-3">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h1 className={`text-3xl sm:text-4xl font-black tracking-tight font-mono tabular-nums ${p.amount < 0 ? "text-rose-700" : "text-emerald-800"}`}>
                      {p.amount < 0 ? "−" : "+"}₹{money(Math.abs(p.amount))}
                    </h1>
                    {/* Billing items inline with payment +/- sign */}
                    {linkedBill && linkedBill.items && linkedBill.items.length > 0 ? (
                      <div className="inline-flex items-center gap-1.5 flex-wrap text-xs sm:text-sm font-medium text-slate-700 bg-white/80 px-3 py-1.5 rounded-xl border border-black/5">
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
                      <span className="text-xs sm:text-sm font-semibold text-slate-700 bg-white/80 px-2.5 py-1 rounded-lg border border-black/5">
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
                <div data-card-tone="sales" className="rounded-2xl border p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-black/5">
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-4 h-4 text-blue-600" />
                      Customer Party
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="hh-avatar hh-avatar--sm hh-avatar--blue shrink-0">
                      {getInitials(p.customerName || "C", "C")}
                    </span>
                    <div className="space-y-0.5 min-w-0">
                      <h3 className="text-base font-extrabold text-slate-900 break-words">
                        {p.customerName}
                      </h3>
                      {p.customerPhone || matchedCustomer?.phone ? (
                        <div className="flex items-center gap-3">
                          <a
                            href={`tel:${p.customerPhone || matchedCustomer?.phone}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-700"
                          >
                            <Phone className="w-3.5 h-3.5 text-blue-500" />
                            <span>{p.customerPhone || matchedCustomer?.phone}</span>
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">No phone registered</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Payment Details Card - System ID removed */}
                <div data-card-tone="neutral" className="rounded-2xl border p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-black/5">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-slate-600" />
                      Payment Details
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">{p.paymentDate || p.createdAt?.slice(0, 10)}</span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-white/80 border border-black/5 px-2.5 py-2">
                        <span className="text-slate-500 text-[10px] block font-semibold uppercase">Payment Method</span>
                        <span className="font-bold text-slate-900 uppercase">{p.mode}</span>
                      </div>
                      <div className="rounded-xl bg-white/80 border border-black/5 px-2.5 py-2">
                        <span className="text-slate-500 text-[10px] block font-semibold uppercase">Recorded By</span>
                        <span className="font-bold text-slate-900">{p.recordedBy || loggedInUserName}</span>
                      </div>
                    </div>

                    {p.referenceNote && (
                      <div className="p-2.5 rounded-xl bg-white/80 border border-black/5">
                        <span className="text-slate-500 text-[10px] block uppercase font-bold">Reference / UTR</span>
                        <span className="font-mono text-slate-800 font-semibold text-xs mt-0.5 block">
                          {p.referenceNote}
                        </span>
                      </div>
                    )}

                    {(p.billId || linkedBill) && (
                      <div className="p-2.5 rounded-xl bg-white/80 border border-black/5 flex items-center justify-between">
                        <div>
                          <span className="text-slate-500 text-[10px] block uppercase font-bold">Allocated Invoice</span>
                          <span className="font-mono text-slate-800 font-bold text-xs mt-0.5 block">
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
              <div data-card-tone="neutral" className="rounded-2xl border p-3 sm:p-4 shadow-xs flex items-center justify-between gap-3">
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
      ) : isPhone ? (
        <div id="view-payments" className="hh-view mw-workspace w-full space-y-3 pb-28">
          <div className="hh-sales-top hh-sales-top--flush">
            <div className="hh-sales-top__row">
              <h1 className="hh-sales-top__title">{t("pay.title")}</h1>
              <div className="flex items-center gap-1 shrink-0">
                {ghostPayments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowGhostPaymentsModal(true)}
                    className="rt-tag rt-tag--soon cursor-pointer"
                    aria-label="Ghost payments"
                  >
                    {ghostPayments.length}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAuditLog(true)}
                  className="hh-sales-top__iconbtn"
                  style={{ color: "rgba(255, 255, 255, 0.85)" }}
                  aria-label="Audit log"
                >
                  <History size={18} />
                </button>
              </div>
            </div>
            <div className="rt-utabs" role="tablist" aria-label="Payment views">
              {([
                { id: "recent" as const, label: t("pay.recentN", { n: recentAll.length }) },
                { id: "due" as const, label: t("pay.dueN", { n: dueBills.length }) },
                { id: "history" as const, label: t("pay.historyN", { n: historyAll.length }) },
                { id: "reports" as const, label: t("pay.reports") },
              ]).map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tb.id}
                  onClick={() => setActiveTab(tb.id)}
                  className="rt-utab"
                >
                  {tb.label}
                </button>
              ))}
            </div>
          </div>

          {showAuditLog && (
            <PaymentAuditModal entries={paymentAudit} onClose={() => setShowAuditLog(false)} />
          )}
          {showGhostPaymentsModal && (
            <GhostPaymentsModal
              candidates={ghostPayments}
              onRemoveSelected={(ids, reason) => removeGhostPayments(ids, reason)}
              onClose={() => setShowGhostPaymentsModal(false)}
            />
          )}

          {activeTab !== "reports" && (
            <>
              {activeTab === "recent" && (
                <div className="rt-kv-grid">
                  <div className="rt-kv">
                    <div className="rt-kv__label">{t("pay.cashInBox")}</div>
                    <div className="rt-kv__val">₹{money(realtimeCashInBox)}</div>
                  </div>
                  <div className="rt-kv">
                    <div className="rt-kv__label">{t("pay.marketCreditDue")}</div>
                    <div className="rt-kv__val" style={{ color: "var(--due)" }}>₹{money(totalMarketDue)}</div>
                  </div>
                  <div className="rt-kv">
                    <div className="rt-kv__label">{t("pay.totalInwardSpend")}</div>
                    <div className="rt-kv__val">₹{money(totalInwardSpend)}</div>
                  </div>
                  <div className="rt-kv">
                    <div className="rt-kv__label">{t("pay.totalBilledSales")}</div>
                    <div className="rt-kv__val">₹{money(totalBilledSales)}</div>
                  </div>
                </div>
              )}

              <div className="rt-search-bar">
                <Search size={16} style={{ color: "var(--text-2)", flexShrink: 0 }} />
                <input
                  enterKeyHint="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setHistoryVisible(HISTORY_PAGE);
                  }}
                  placeholder={activeTab === "due" ? t("pay.searchCustomerOrInv") : t("pay.searchPayments")}
                />
                {searchTerm && (
                  <button
                    aria-label="Clear search"
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="p-1 bg-transparent border-0 cursor-pointer"
                    style={{ color: "var(--text-2)" }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </>
          )}

          {activeTab === "recent" && (
            <>
              {filteredRecent.length === 0 ? (
                <div className="rt-card px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-2)" }}>
                  {recentAll.length === 0 ? "No receipts today yet. Older ones are in History." : "No payment receipts match your search"}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredRecent.map((p, idx) => {
                    const isRefund = Boolean(p.isRefund || p.amount < 0);
                    return (
                      <button
                        key={p.id || idx}
                        type="button"
                        onClick={() => setPhoneSheetPayment(p)}
                        className={`hh-hist-card ${isRefund ? "hh-hist-card--due" : "hh-hist-card--paid"} w-full text-left flex items-center gap-3 cursor-pointer`}
                      >
                        <span className={`rt-ico shrink-0 ${isRefund ? "rt-ico--neutral" : "rt-ico--paid"}`}>
                          {isRefund ? <ArrowLeftRight size={16} /> : <Banknote size={17} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-bold break-words" style={{ color: "var(--text)" }}>
                            {p.customerName}
                          </span>
                          <span className="block text-[11.5px] mt-0.5" style={{ color: "var(--text-2)" }}>
                            {formatRecentDateMeta(p, todayStr)} · {isRefund ? "refund" : p.billId ? `INV-${p.billId}` : formatPaymentId(p.id, idx)}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span
                            className="block text-[15px] font-extrabold tabular-nums"
                            style={{ color: "var(--text)" }}
                          >
                            {isRefund ? "−" : ""}₹{money(Math.abs(p.amount))}
                          </span>
                          <span className="rt-tag rt-tag--mode mt-0.5">
                            {modeLabelText(p.mode, isRefund)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="rt-fab-cta">
                <button
                  type="button"
                  onClick={() => openPhoneRecordFlow()}
                  className="rt-btn"
                >
                  + {t("pay.recordPayment")}
                </button>
              </div>
            </>
          )}

          {activeTab === "due" && (
            <div className="space-y-2.5">
              {filteredDueBills.length === 0 ? (
                <div className="rt-card px-5 py-10 text-center text-[13px] font-semibold" style={{ color: "var(--paid)" }}>
                  All customer invoices are settled!
                </div>
              ) : (
                <div className="rt-card">
                  {filteredDueBills.map((b) => {
                    const due = getEffectiveBillBalance(b);
                    const daysOld = b.date
                      ? Math.max(0, Math.floor((Date.now() - new Date(b.date.length === 10 ? `${b.date}T12:00:00` : b.date).getTime()) / 86400000))
                      : 0;
                    const urgent = daysOld > 10;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() =>
                          openPhoneRecordFlow(
                            b.retailer || "",
                            b.id,
                            String(Math.round(due * 100) / 100),
                          )
                        }
                        className="rt-rowi"
                      >
                        <span className="rt-ico shrink-0">{getInitials(b.retailer || "C", "C")}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-bold break-words" style={{ color: "var(--text)" }}>
                            {b.retailer || "Cash Sale"}
                          </span>
                          <span className="block text-[11.5px] mt-0.5" style={{ color: "var(--text-2)" }}>
                            {formatBillNumber(b, billingSettings)}
                            {daysOld > 0 ? ` · ${t("pay.daysLate", { n: daysOld })}` : ""}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block text-[14px] font-extrabold tabular-nums" style={{ color: "var(--text)" }}>
                            ₹{money(due)}
                          </span>
                          <span className={`rt-tag mt-0.5 ${urgent ? "rt-tag--due" : "rt-tag--soon"}`}>
                            {t("pay.collect")}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="rt-stp rt-stp--muted px-1">{t("pay.tapDueHint")}</p>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {([
                  { id: "all" as const, label: t("common.all") },
                  { id: "cash" as const, label: t("pay.modeCash") },
                  { id: "upi" as const, label: t("pay.modeUpi") },
                  { id: "cheque" as const, label: t("pay.modeCheque") },
                  { id: "bank" as const, label: t("pay.modeBank") },
                  { id: "other" as const, label: t("pay.modeOther") },
                  { id: "refund" as const, label: t("pay.refundTag") },
                ]).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={historyModeFilter === chip.id}
                    onClick={() => {
                      setHistoryModeFilter(chip.id);
                      setHistoryVisible(HISTORY_PAGE);
                    }}
                    className="rt-chip shrink-0"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {phoneFilteredHistory.length === 0 ? (
                <div className="rt-card px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-2)" }}>
                  {historyAll.length === 0 ? "No older receipts yet." : "No payment receipts match your search"}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {phoneFilteredHistory.slice(0, historyVisible).map((p, idx) => {
                    const isRefund = Boolean(p.isRefund || p.amount < 0);
                    return (
                      <button
                        key={p.id || idx}
                        type="button"
                        onClick={() => setPhoneSheetPayment(p)}
                        className={`hh-hist-card ${isRefund ? "hh-hist-card--due" : "hh-hist-card--paid"} w-full text-left flex items-center gap-3 cursor-pointer`}
                      >
                        <span className={`rt-ico shrink-0 ${isRefund ? "rt-ico--neutral" : "rt-ico--paid"}`}>
                          {isRefund ? <ArrowLeftRight size={16} /> : <Banknote size={17} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-bold break-words" style={{ color: "var(--text)" }}>
                            {p.customerName}
                          </span>
                          <span className="block text-[11.5px] mt-0.5" style={{ color: "var(--text-2)" }}>
                            {formatItemDate(p.paymentDate || p.createdAt)} · {isRefund ? "refund" : p.billId ? `INV-${p.billId}` : formatPaymentId(p.id, idx)}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span
                            className="block text-[15px] font-extrabold tabular-nums"
                            style={{ color: "var(--text)" }}
                          >
                            {isRefund ? "−" : ""}₹{money(Math.abs(p.amount))}
                          </span>
                          <span className="rt-tag rt-tag--mode mt-0.5">
                            {modeLabelText(p.mode, isRefund)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {phoneFilteredHistory.length > historyVisible && (
                    <button
                      type="button"
                      onClick={() => setHistoryVisible((v) => v + HISTORY_PAGE)}
                      className="rt-btn-outline w-full"
                    >
                      Show more ({phoneFilteredHistory.length - historyVisible} left)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "reports" && <PaymentReportsPanel />}

          {phoneSheetPayment &&
            createPortal(
              <div
                className="rt-bsheet-scrim"
                onClick={() => setPhoneSheetPayment(null)}
                role="dialog"
                aria-modal="true"
              >
                <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                  <div className="hh-grab" />
                  {(() => {
                    const p = phoneSheetPayment;
                    const isRefund = Boolean(p.isRefund || p.amount < 0);
                    const matchedCustomer = existingCustomers.find(
                      (c) => c.name.trim().toLowerCase() === (p.customerName || "").trim().toLowerCase(),
                    );
                    const phone = p.customerPhone || matchedCustomer?.phone || "";
                    const waText = `*Payment Receipt - ${orgProfile?.name || "MrWater Distribution"}*\nCustomer: ${p.customerName}\nAmount Received: ₹${money(Math.abs(p.amount))}\nMode: ${p.mode.toUpperCase()}\nDate: ${p.paymentDate || p.createdAt?.slice(0, 10)}\n${p.referenceNote ? `Ref Note: ${p.referenceNote}\n` : ""}Thank you for your payment!`;

                    return (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="text-[17px] font-extrabold m-0 break-words" style={{ color: "var(--text)" }}>
                            {isRefund ? "−" : ""}₹{money(Math.abs(p.amount))} · {p.customerName}
                          </h2>
                          <span className={`rt-tag shrink-0 ${isRefund ? "rt-tag--due" : "rt-tag--paid"}`}>
                            {modeLabelText(p.mode, isRefund)}
                          </span>
                        </div>

                        <div className="rt-card rt-card--divided">
                          <div className="rt-ln">
                            <span style={{ color: "var(--text-2)" }}>{t("pay.paymentMethod")}</span>
                            <span className="font-bold" style={{ color: "var(--text)" }}>
                              {p.mode === "upi" ? "UPI / QR" : p.mode === "bank" ? "Bank / NEFT" : modeLabelText(p.mode)}
                            </span>
                          </div>
                          <div className="rt-ln">
                            <span style={{ color: "var(--text-2)" }}>{t("pay.refUtr")}</span>
                            <span className="font-bold font-mono" style={{ color: "var(--text)" }}>
                              {p.referenceNote || "—"}
                            </span>
                          </div>
                          <div className="rt-ln">
                            <span style={{ color: "var(--text-2)" }}>{t("pay.allocatedInvoice")}</span>
                            <span className="font-bold" style={{ color: "var(--text)" }}>
                              {p.billId ? `INV-${p.billId}` : "On account"}
                            </span>
                          </div>
                          <div className="rt-ln">
                            <span style={{ color: "var(--text-2)" }}>{t("pay.recordedBy")}</span>
                            <span className="font-bold" style={{ color: "var(--text)" }}>
                              {p.recordedBy || loggedInUserName}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setReceiptPayment(p);
                              setPhoneSheetPayment(null);
                            }}
                            className="rt-btn-outline rt-btn-outline--primary"
                          >
                            {t("common.print")}
                          </button>

                          {phone ? (
                            <a
                              href={whatsappLink(phone, waText)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setPhoneSheetPayment(null)}
                              className="rt-btn-outline rt-btn-outline--primary flex items-center justify-center no-underline"
                            >
                              WhatsApp
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setWhatsAppPromptPayment(p);
                                setPromptPhoneInput("");
                                setPhoneSheetPayment(null);
                              }}
                              className="rt-btn-outline rt-btn-outline--primary"
                            >
                              WhatsApp
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setPhoneRefundPayment(p);
                              setRefundAmount("");
                              setRefundMode(p.mode || "cash");
                              setRefundNote("");
                              setRefundError(null);
                              setPhoneSheetPayment(null);
                            }}
                            className="rt-btn-outline rt-btn-outline--primary"
                          >
                            {t("pay.refund")}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPaymentToDelete(p);
                              setPhoneSheetPayment(null);
                            }}
                            className="rt-btn-outline rt-btn-outline--due"
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>,
              document.body,
            )}
        </div>
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

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setShowGhostPaymentsModal(true)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer shadow-2xs transition-colors ${
                  ghostPayments.length > 0
                    ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {ghostPayments.length > 0
                  ? `Ghost payments (${ghostPayments.length})`
                  : "Ghost payments"}
              </button>
              <button
                type="button"
                onClick={() => setShowAuditLog(true)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                Audit log
              </button>
            </div>
          </div>
          {showAuditLog && (
            <PaymentAuditModal entries={paymentAudit} onClose={() => setShowAuditLog(false)} />
          )}
          {showGhostPaymentsModal && (
            <GhostPaymentsModal
              candidates={ghostPayments}
              onRemoveSelected={(ids, reason) => removeGhostPayments(ids, reason)}
              onClose={() => setShowGhostPaymentsModal(false)}
            />
          )}

          {/* Realtime Cash in Box & Financial Summary Cards (Option A Soft-Tinted Fintech Cards) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div data-card-tone="received" className="border rounded-2xl p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider leading-tight">Cash in Box (Till)</span>
                <div className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--green shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-emerald-950 mt-1">
                ₹{money(realtimeCashInBox)}
              </div>
              <p className="text-[11px] text-emerald-800/80 font-medium mt-1">
                {cashExpenses > 0 ? `Net drawer cash (less ₹${money(cashExpenses)} paid)` : "Realtime drawer cash"}
              </p>
            </div>

            <div data-card-tone="due" className="border rounded-2xl p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-rose-900 uppercase tracking-wider leading-tight">Market Credit Due</span>
                <div className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--rose shrink-0">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-rose-700 mt-1">
                ₹{money(totalMarketDue)}
              </div>
              <p className="text-[11px] text-rose-800/80 font-medium mt-1">
                Pending customer dues (after returns)
              </p>
            </div>

            <div data-card-tone="sales" className="border rounded-2xl p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider leading-tight">Total Inward Spend</span>
                <div className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--blue shrink-0">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-slate-900 mt-1">
                ₹{money(totalInwardSpend)}
              </div>
              <p className="text-[11px] text-blue-900/75 font-medium mt-1">
                Total purchase spend (GRNs)
              </p>
            </div>

            <div data-card-tone="profit" className="border rounded-2xl p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wider leading-tight">Total Billed Sales</span>
                <div className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--purple shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-slate-900 mt-1">
                ₹{money(totalBilledSales)}
              </div>
              <p className="text-[11px] text-purple-900/75 font-medium mt-1">
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
          <div data-card-tone="received" className="rounded-2xl border shadow-xs p-4 sm:p-6">
            <div className="pb-4 mb-5 border-b border-black/5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="hh-icon-badge hh-icon-badge--green shrink-0">
                  <Receipt className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold text-slate-900">Record Payment Receipt</h2>
                  <p className="text-xs text-slate-600">Collect dues, allocate against invoices, and record payments</p>
                </div>
              </div>
              <span className="text-xs font-medium text-slate-600 bg-white/80 border border-black/5 px-2.5 py-1 rounded-full shrink-0">
                Staff: <strong className="text-slate-900">{loggedInUserName}</strong>
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
                  <div className="p-3.5 rounded-xl bg-white/85 border border-black/5 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium block">Selected Account</span>
                      <p className="text-sm font-bold text-slate-900 min-w-0 break-words lg:truncate">{selectedParty}</p>
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
                              <span>{formatBillNumber(b, billingSettings)}</span>
                              {isGstExcludedBill(b, products) && (
                                <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 uppercase">
                                  Non-GST
                                </span>
                              )}
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

              <div className="block md:hidden space-y-2.5">
                {filteredDueBills.length === 0 ? (
                  <div
                    data-card-tone="received"
                    className="rounded-2xl border py-8 text-center text-xs text-emerald-800 font-semibold shadow-xs"
                  >
                    All customer invoices are settled!
                  </div>
                ) : (
                  filteredDueBills.map((b) => {
                    const due = getEffectiveBillBalance(b);
                    const daysOld = b.date
                      ? Math.floor((Date.now() - new Date(b.date).getTime()) / (1000 * 60 * 60 * 24))
                      : 0;
                    const overdue = daysOld > 7;
                    return (
                      <div
                        key={b.id}
                        data-card-tone={overdue ? "due" : "warning"}
                        onClick={() => {
                          setSelectedParty(b.retailer || "");
                          setAmount(String(due));
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="rounded-2xl border px-3.5 py-3 shadow-xs flex items-center justify-between gap-3 active:scale-[0.99] cursor-pointer transition-all"
                        title="Click to populate Record Receipt form"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className={`hh-avatar hh-avatar--sm shrink-0 ${overdue ? "hh-avatar--rose" : "hh-avatar--amber"}`}>
                            {getInitials(b.retailer || "Cash Sale", "C")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-extrabold text-slate-900 text-sm break-words leading-snug">
                              {b.retailer || "Cash Sale"}
                            </div>
                            <div className="text-slate-600 text-xs mt-0.5 flex items-center gap-1.5 flex-wrap font-medium">
                              <span>{formatBillNumber(b, billingSettings)}</span>
                              <span>·</span>
                              <span>{formatItemDate(b.date || "")}</span>
                              {isGstExcludedBill(b, products) && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 uppercase">
                                  Non-GST
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-black text-[15px] tabular-nums ${overdue ? "text-rose-700" : "text-amber-900"}`}>
                            ₹{money(due)}
                          </div>
                          <span
                            className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                              overdue ? "bg-rose-100/90 text-rose-800" : "bg-amber-100/90 text-amber-800"
                            }`}
                          >
                            {overdue ? `Overdue ${daysOld}d` : "Due"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
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
