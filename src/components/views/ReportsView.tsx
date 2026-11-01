import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { installTableCards } from "../../utils/tableCards";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  MessageCircle,
  Package,
  Percent,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  HandCoins,
  SlidersHorizontal,
  Tag,
  TrendingUp,
  Truck,
  Users,
  X,
  Plus,
  Trash2,
  CreditCard,
  ArrowUpRight,
  Edit3,
} from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import { EmptyState } from "../common/EmptyState";
import {
  PeriodFilter,
  type PeriodRange,
  type FilterPeriodPreset,
} from "../common/PeriodFilter";
import { money, normalizeGstFraction, statusOf, resolveProductGstRate } from "../../utils/billing";
import {
  computeGstr3b,
  orgStateCodeFromProfile,
  safeGstSummaryFromBills,
  itcReversalFromDispositions,
} from "../../utils/gstReports";
import {
  Bill,
  ExistingCustomer,
  GRN,
  PaymentMode,
  PaymentRecord,
  Product,
} from "../../types";
import { TaxInvoiceModal } from "../common/TaxInvoiceModal";
import { WhatsAppButton } from "../common/WhatsAppButton";
import { RecordPaymentModal } from "../common/RecordPaymentModal";
import { CATS } from "../../constants/initialData";
import { InventoryReport } from "./reports/InventoryReport";
import { PurchasesReport } from "./reports/PurchasesReport";
import { ReceivablesReport } from "./reports/ReceivablesReport";
import { TripsReport } from "./reports/TripsReport";
import { TaxReport } from "./reports/TaxReport";
import { SupplierProductProfitReport } from "./reports/SupplierProductProfitReport";
import { SalesMarginPnLReport } from "./reports/SalesMarginPnLReport";
import { NetProfitReport } from "./reports/NetProfitReport";
import { DailyCollectionReport } from "./reports/DailyCollectionReport";
import { BeatSalesDueReport } from "./reports/BeatSalesDueReport";
import { DispositionsReport } from "./reports/DispositionsReport";
import {
  REPORT_SECTION_TABS,
  type ReportSection,
} from "./reports/ReportSectionTabs";
import { billBalance, billNetTotal, returnedQtyByProduct } from "../../utils/salesReturns";
import { InfoTip } from "../common/InfoTip";
import { todayISO, toLocalISODate } from "../../utils/dateLocal";

export type { ReportSection } from "./reports/ReportSectionTabs";

import { reportPeriodFromFilter, inclusiveDays, filterPresetFromReportPeriod, filterPresetForRange } from "./reports/reportPeriod";
export type { ReportPeriod } from "./reports/reportPeriod";
import type { ReportPeriod } from "./reports/reportPeriod";

export const ReportsView: React.FC = () => {
  const {
    products,
    bills,
    grns,
    warehouses,
    inventoryBatches,
    trips,
    audits,
    remainingStock,
    tripBreakdown,
    orgProfile,
    palette,
    fz,
    scale,
    setTab,
    payments,
    recordCustomerPayment,
    deletePayment,
    updatePayment,
    customers,
    billingSettings,
    inventoryDispositions,
  } = useLedger();

  const [activeReport, setActiveReport] = useState<ReportSection>("sales");
  const [period, setPeriod] = useState<ReportPeriod>(() => {
    const saved = sessionStorage.getItem("reports_period");
    if (saved) {
      sessionStorage.removeItem("reports_period");
      return saved as ReportPeriod;
    }
    return "all";
  });

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const saved = sessionStorage.getItem("reports_selected_date");
    if (saved) {
      sessionStorage.removeItem("reports_selected_date");
      return saved;
    }
    return todayISO();
  });

  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toLocalISODate(d);
  });
  const [endDate, setEndDate] = useState<string>(() =>
    todayISO(),
  );

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [skuSearchQuery, setSkuSearchQuery] = useState("");
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);

  // Sales reporting sub-tab state (Day-Wise Summary vs Invoices Register vs SKU Dispatches)
  const [salesReportSubTab, setSalesReportSubTab] = useState<
    "daywise" | "bills" | "skus"
  >("daywise");
  const [expandedSalesDay, setExpandedSalesDay] = useState<string | null>(null);

  // Payments & Collections reporting state
  const [paymentReportSubTab, setPaymentReportSubTab] = useState<
    "datewise" | "customerwise"
  >("datewise");
  const [paymentModeFilter, setPaymentModeFilter] = useState<
    "all" | PaymentMode
  >("all");
  const [expandedCustomerKey, setExpandedCustomerKey] = useState<string | null>(
    null,
  );

  // Record / Edit Payment Modal state
  const [isRecordPaymentModalOpen, setIsRecordPaymentModalOpen] =
    useState(false);
  const [modalCustomerName, setModalCustomerName] = useState<
    string | undefined
  >(undefined);
  const [modalBillId, setModalBillId] = useState<number | undefined>(undefined);
  const [modalEditingPayment, setModalEditingPayment] =
    useState<PaymentRecord | null>(null);

  // Smart space-saving Filter Dropdown state
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<
    "all" | "paid" | "due"
  >("all");
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(e.target as Node)
      ) {
        setShowFilterDropdown(false);
      }
    };
    if (showFilterDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showFilterDropdown]);

  const activeFiltersCount =
    (period !== "all" ? 1 : 0) +
    (selectedWarehouse !== "all" ? 1 : 0) +
    (paymentStatusFilter !== "all" ? 1 : 0);

  const clearAllFilters = () => {
    setPeriod("all");
    setStartDate("");
    setEndDate("");
    setSelectedWarehouse("all");
    setPaymentStatusFilter("all");
    setSearchQuery("");
    setSkuSearchQuery("");
  };

  // Date calculation utilities
  const todayStr = useMemo(() => todayISO(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);
  const sevenDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalISODate(d);
  }, []);
  const currentYearMonth = useMemo(() => todayStr.slice(0, 7), [todayStr]);
  const lastYearMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, []);

  // Distinct dates with recorded bills
  const datesWithBills = useMemo(() => {
    const set = new Set<string>();
    bills.forEach((b) => {
      if (b.date) set.add(b.date.slice(0, 10));
    });
    return Array.from(set).sort().reverse();
  }, [bills]);

  const shiftSelectedDate = (days: number) => {
    const base = selectedDate || todayStr;
    const [y, m, d] = base.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const yStr = dt.getFullYear();
    const mStr = String(dt.getMonth() + 1).padStart(2, "0");
    const dStr = String(dt.getDate()).padStart(2, "0");
    setSelectedDate(`${yStr}-${mStr}-${dStr}`);
    setPeriod("customDate");
  };

  const formatFriendlyDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Filter bills by date period & status — sorted day-wise, latest on top
  // Bills in the selected PERIOD only (no payment-status filter). GST returns must be
  // built from every invoice of the period, whether it is paid, part-paid or on credit.
  const periodBills = useMemo(() => {
    return bills
      .filter((b) => {
        const bDate = (b.date || "").slice(0, 10);
        let matchDate = true;
        if (period === "all") matchDate = true;
        else if (period === "customDate") matchDate = bDate === selectedDate;
        else if (period === "today") matchDate = bDate === todayStr;
        else if (period === "yesterday") matchDate = bDate === yesterdayStr;
        else if (period === "last7")
          matchDate = bDate >= sevenDaysAgoStr && bDate <= todayStr;
        else if (period === "thisMonth")
          matchDate = bDate.startsWith(currentYearMonth);
        else if (period === "lastMonth")
          matchDate = bDate.startsWith(lastYearMonth);
        else if (period === "customRange")
          matchDate =
            (!startDate || bDate >= startDate) &&
            (!endDate || bDate <= endDate);

        return matchDate;
      })
      .sort((a, b) => {
        const dCmp = (b.date || "").localeCompare(a.date || "");
        if (dCmp !== 0) return dCmp;
        return Number(b.id) - Number(a.id);
      });
  }, [
    bills,
    period,
    selectedDate,
    startDate,
    endDate,
    todayStr,
    yesterdayStr,
    sevenDaysAgoStr,
    currentYearMonth,
    lastYearMonth,
  ]);

  // Period bills further narrowed by the paid / due filter (sales & receivables views only).
  const filteredBills = useMemo(() => {
    return periodBills.filter((b) => {
      if (paymentStatusFilter === "paid") return billBalance(b) <= 0;
      if (paymentStatusFilter === "due") return billBalance(b) > 0;
      return true;
    });
  }, [periodBills, paymentStatusFilter]);

  // Day-wise aggregated sales & collections breakdown (Sorted Day-wise, Latest on top)
  // Tracks money in hand for that date and due on that date with unified one-line-per-transaction ledger.
  const dayWiseSalesSummary = useMemo(() => {
    interface DayUnifiedTransaction {
      id: string;
      time: string;
      type: "bill" | "past_due_payment" | "advance_payment" | "refund";
      refNo: string;
      partyName: string;
      partyPhone?: string;
      details: string;
      crates: number;
      billedAmount: number | null;
      moneyInHand: number;
      dueOnDate: number | null;
      paymentMode: string;
      upfrontNote?: string;
      clearedLaterNote?: string;
      bill?: Bill;
      payment?: PaymentRecord;
      statusBadge: {
        label: string;
        variant: "paid" | "partial" | "credit" | "payment" | "advance" | "refund";
      };
    }

    interface DaySummaryItem {
      date: string;
      billCount: number;
      paymentCount: number;
      casesSold: number;
      freeCases: number;
      totalRevenue: number;
      moneyInHand: number;
      upfrontCollected: number;
      pastDueCollected: number;
      advanceCollected: number;
      refundsPaid: number;
      dueOnDate: number;
      settledLaterAmount: number;
      currentBalanceDue: number;
      transactions: DayUnifiedTransaction[];
      bills: Bill[];
    }

    const map = new Map<string, DaySummaryItem>();

    const getOrCreate = (d: string): DaySummaryItem => {
      let entry = map.get(d);
      if (!entry) {
        entry = {
          date: d,
          billCount: 0,
          paymentCount: 0,
          casesSold: 0,
          freeCases: 0,
          totalRevenue: 0,
          moneyInHand: 0,
          upfrontCollected: 0,
          pastDueCollected: 0,
          advanceCollected: 0,
          refundsPaid: 0,
          dueOnDate: 0,
          settledLaterAmount: 0,
          currentBalanceDue: 0,
          transactions: [],
          bills: [],
        };
        map.set(d, entry);
      }
      return entry;
    };

    // All bills map for instant reference
    const allBillsMap = new Map<number, Bill>();
    (bills || []).forEach((b) => allBillsMap.set(b.id, b));

    // 1. Group filtered bills by invoice generation date
    filteredBills.forEach((b) => {
      const d = (b.date || "").slice(0, 10) || "Unknown";
      const entry = getOrCreate(d);

      const returnedBack = Object.values(returnedQtyByProduct(b)).reduce(
        (a, q) => a + q,
        0,
      );
      const crates = Math.max(
        0,
        b.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0) - returnedBack,
      );
      const free = b.items.reduce((sum, it) => sum + (Number(it.freeQty) || 0), 0);
      const netTotal = billNetTotal(b);
      const currentBal = billBalance(b);

      // Check payments linked to this bill
      const billPayments = (payments || []).filter(
        (p) => p.billId === b.id && p.mode !== "credit",
      );
      const laterPayments = billPayments.filter(
        (p) => ((p.paymentDate || p.createdAt || "").slice(0, 10)) > d,
      );
      const laterPaidAmt = laterPayments.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0,
      );
      const sameDayPayments = billPayments.filter(
        (p) => ((p.paymentDate || p.createdAt || "").slice(0, 10)) === d,
      );
      const sameDayPaidAmt = sameDayPayments.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0,
      );

      const upfrontPaid =
        sameDayPaidAmt > 0
          ? sameDayPaidAmt
          : b.paymentMode !== "credit"
            ? Math.max(0, (Number(b.amountPaid) || 0) - laterPaidAmt)
            : 0;
      const dueOnDate = Math.max(0, netTotal - upfrontPaid);
      const isFullyPaidUpfront = dueOnDate <= 0;

      const clearedLaterNote =
        dueOnDate > 0 && laterPaidAmt > 0
          ? currentBal <= 0
            ? `Due ₹${money(dueOnDate)} cleared later on ${(laterPayments[0]?.paymentDate || laterPayments[0]?.createdAt || "").slice(0, 10)} (+₹${money(laterPaidAmt)})`
            : `₹${money(laterPaidAmt)} paid later (Remaining: ₹${money(currentBal)})`
          : undefined;

      const statusBadge = isFullyPaidUpfront
        ? ({ label: "Paid Upfront (Full)", variant: "paid" } as const)
        : upfrontPaid > 0
          ? ({
              label: `Paid Upfront ₹${money(upfrontPaid)} · Due ₹${money(dueOnDate)}`,
              variant: "partial",
            } as const)
          : ({ label: "Billed on Credit", variant: "credit" } as const);

      const upfrontNote = isFullyPaidUpfront
        ? `Paid upfront in full (${(b.paymentMode || "Cash").toUpperCase()})`
        : upfrontPaid > 0
          ? `Partially paid upfront (${(b.paymentMode || "Cash").toUpperCase()})`
          : "Billed on credit (₹0 upfront)";

      entry.transactions.push({
        id: `bill-${b.id}`,
        time: (b.date || "").slice(11, 16) || "—",
        type: "bill",
        refNo: `Invoice #${b.id}`,
        partyName: b.retailer,
        partyPhone: b.phone,
        details: `${b.items.length} items (${crates} cs)`,
        crates,
        billedAmount: netTotal,
        moneyInHand: upfrontPaid,
        dueOnDate,
        paymentMode: b.paymentMode || "cash",
        upfrontNote,
        clearedLaterNote,
        bill: b,
        statusBadge,
      });

      entry.billCount += 1;
      entry.casesSold += crates;
      entry.freeCases += free;
      entry.totalRevenue += netTotal;
      entry.upfrontCollected += upfrontPaid;
      entry.dueOnDate += dueOnDate;
      entry.settledLaterAmount += Math.min(dueOnDate, laterPaidAmt);
      entry.currentBalanceDue += currentBal;
      entry.bills.push(b);
    });

    // 2. Process payments according to ACTUAL collection date (paymentDate)
    (payments || []).forEach((p) => {
      const pDate = (p.paymentDate || p.createdAt || "").slice(0, 10);
      if (!pDate) return;

      // Filter payments to match the current report period
      let matchDate = true;
      if (period === "all") matchDate = true;
      else if (period === "customDate") matchDate = pDate === selectedDate;
      else if (period === "today") matchDate = pDate === todayStr;
      else if (period === "yesterday") matchDate = pDate === yesterdayStr;
      else if (period === "last7")
        matchDate = pDate >= sevenDaysAgoStr && pDate <= todayStr;
      else if (period === "thisMonth")
        matchDate = pDate.startsWith(currentYearMonth);
      else if (period === "lastMonth")
        matchDate = pDate.startsWith(lastYearMonth);
      else if (period === "customRange") {
        matchDate =
          (!startDate || pDate >= startDate) && (!endDate || pDate <= endDate);
      }
      if (!matchDate) return;
      if (p.mode === "credit") return;

      const amt = Number(p.amount) || 0;
      if (amt === 0) return;

      const linkedBill = p.billId ? allBillsMap.get(p.billId) : undefined;
      const bDate = linkedBill ? (linkedBill.date || "").slice(0, 10) : "";

      // If this payment was on the exact bill date for this bill, it is already captured
      // as the upfront payment on the bill's transaction line to avoid duplicate rows.
      if (linkedBill && bDate && bDate === pDate) {
        return;
      }

      const entry = getOrCreate(pDate);

      if (p.isRefund || amt < 0) {
        const refundAmt = Math.abs(amt);
        entry.refundsPaid += refundAmt;
        entry.transactions.push({
          id: `pay-${p.id}`,
          time: (p.createdAt || "").slice(11, 16) || "—",
          type: "refund",
          refNo: p.referenceNote || (p.id ? `REF-${String(p.id).slice(-4)}` : "Refund"),
          partyName: p.customerName || "Customer",
          partyPhone: p.customerPhone,
          details: p.referenceNote || "Customer refund issued",
          crates: 0,
          billedAmount: null,
          moneyInHand: -refundAmt,
          dueOnDate: null,
          paymentMode: p.mode || "cash",
          payment: p,
          statusBadge: {
            label: "Customer Refund",
            variant: "refund",
          },
        });
      } else if (p.billId) {
        // Payment for past due on older invoice
        entry.pastDueCollected += amt;
        entry.paymentCount += 1;
        entry.transactions.push({
          id: `pay-${p.id}`,
          time: (p.createdAt || "").slice(11, 16) || "—",
          type: "past_due_payment",
          refNo: `Payment on #${p.billId}`,
          partyName: p.customerName || (linkedBill ? linkedBill.retailer : "Customer"),
          partyPhone: p.customerPhone || linkedBill?.phone,
          details: linkedBill
            ? `Payment against Invoice #${p.billId} (Billed on ${(linkedBill.date || "").slice(0, 10)} · Bill Total ₹${money(billNetTotal(linkedBill))})`
            : p.referenceNote || `Payment received for Invoice #${p.billId}`,
          crates: 0,
          billedAmount: null,
          moneyInHand: amt,
          dueOnDate: null,
          paymentMode: p.mode || "cash",
          bill: linkedBill,
          payment: p,
          statusBadge: {
            label: "Payment (Past Due)",
            variant: "payment",
          },
        });
      } else {
        // Advance / On-account payment
        entry.advanceCollected += amt;
        entry.paymentCount += 1;
        entry.transactions.push({
          id: `pay-${p.id}`,
          time: (p.createdAt || "").slice(11, 16) || "—",
          type: "advance_payment",
          refNo: p.referenceNote || (p.id ? `ADV-${String(p.id).slice(-4)}` : "Advance"),
          partyName: p.customerName || "Customer",
          partyPhone: p.customerPhone,
          details: p.referenceNote || "Advance / on-account collection",
          crates: 0,
          billedAmount: null,
          moneyInHand: amt,
          dueOnDate: null,
          paymentMode: p.mode || "cash",
          payment: p,
          statusBadge: {
            label: "Advance Payment",
            variant: "advance",
          },
        });
      }
    });

    // 3. Finalize moneyInHand and sort transactions per day
    map.forEach((entry) => {
      entry.moneyInHand =
        entry.upfrontCollected +
        entry.pastDueCollected +
        entry.advanceCollected -
        entry.refundsPaid;

      // Sort transactions cleanly: bills first by ID, then payments
      entry.transactions.sort((a, b) => {
        if (a.type === "bill" && b.type !== "bill") return -1;
        if (a.type !== "bill" && b.type === "bill") return 1;
        return a.refNo.localeCompare(b.refNo);
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }, [
    filteredBills,
    payments,
    bills,
    period,
    selectedDate,
    startDate,
    endDate,
    todayStr,
    yesterdayStr,
    sevenDaysAgoStr,
    currentYearMonth,
    lastYearMonth,
  ]);

  // Filter GRNs by date period & warehouse — sorted day-wise, latest on top
  const filteredGrns = useMemo(() => {
    return grns
      .filter((g) => {
        const gDate = (g.inwardDate || "").slice(0, 10);
        let matchesPeriod = true;
        if (period === "customDate") matchesPeriod = gDate === selectedDate;
        else if (period === "today") matchesPeriod = gDate === todayStr;
        else if (period === "yesterday") matchesPeriod = gDate === yesterdayStr;
        else if (period === "last7")
          matchesPeriod = gDate >= sevenDaysAgoStr && gDate <= todayStr;
        else if (period === "thisMonth")
          matchesPeriod = gDate.startsWith(currentYearMonth);
        else if (period === "lastMonth")
          matchesPeriod = gDate.startsWith(lastYearMonth);
        else if (period === "customRange")
          matchesPeriod =
            (!startDate || gDate >= startDate) &&
            (!endDate || gDate <= endDate);

        const matchesWh =
          selectedWarehouse === "all" || g.warehouseId === selectedWarehouse;
        return matchesPeriod && matchesWh;
      })
      .sort((a, b) => {
        const dCmp = (b.inwardDate || "").localeCompare(a.inwardDate || "");
        if (dCmp !== 0) return dCmp;
        return String(b.id).localeCompare(String(a.id));
      });
  }, [
    grns,
    period,
    selectedDate,
    startDate,
    endDate,
    selectedWarehouse,
    todayStr,
    yesterdayStr,
    sevenDaysAgoStr,
    currentYearMonth,
    lastYearMonth,
  ]);

  // Filter Trips by date period — sorted day-wise, latest on top
  const filteredTrips = useMemo(() => {
    return trips
      .filter((t) => {
        const tDate = t.date.slice(0, 10);
        if (period === "customDate") return tDate === selectedDate;
        if (period === "today") return tDate === todayStr;
        if (period === "yesterday") return tDate === yesterdayStr;
        if (period === "last7")
          return tDate >= sevenDaysAgoStr && tDate <= todayStr;
        if (period === "thisMonth") return tDate.startsWith(currentYearMonth);
        if (period === "lastMonth") return tDate.startsWith(lastYearMonth);
        if (period === "customRange")
          return (
            (!startDate || tDate >= startDate) && (!endDate || tDate <= endDate)
          );
        return true;
      })
      .sort((a, b) => {
        const dCmp = (b.date || "").localeCompare(a.date || "");
        if (dCmp !== 0) return dCmp;
        return Number(b.id) - Number(a.id);
      });
  }, [
    trips,
    period,
    selectedDate,
    startDate,
    endDate,
    todayStr,
    yesterdayStr,
    sevenDaysAgoStr,
    currentYearMonth,
    lastYearMonth,
  ]);

  // SALES METRICS
  const totalSalesRevenue = useMemo(
    () => filteredBills.reduce((sum, b) => sum + billNetTotal(b), 0),
    [filteredBills],
  );
  const totalSalesPaid = useMemo(
    () => filteredBills.reduce((sum, b) => sum + (Number(b.amountPaid) || 0), 0),
    [filteredBills],
  );
  const totalSalesOutstanding = useMemo(
    () => filteredBills.reduce((sum, b) => sum + billBalance(b), 0),
    [filteredBills],
  );
  const totalDayWiseCollected = useMemo(
    () => dayWiseSalesSummary.reduce((sum, d) => sum + d.moneyInHand, 0),
    [dayWiseSalesSummary],
  );
  const totalDayWiseRevenue = useMemo(
    () => dayWiseSalesSummary.reduce((sum, d) => sum + d.totalRevenue, 0),
    [dayWiseSalesSummary],
  );
  const totalDayWiseOutstanding = useMemo(
    () => dayWiseSalesSummary.reduce((sum, d) => sum + d.dueOnDate, 0),
    [dayWiseSalesSummary],
  );
  const totalDayWiseSettledLater = useMemo(
    () => dayWiseSalesSummary.reduce((sum, d) => sum + d.settledLaterAmount, 0),
    [dayWiseSalesSummary],
  );
  const totalCasesSold = useMemo(() => {
    return filteredBills.reduce((sum, b) => {
      const back = Object.values(returnedQtyByProduct(b)).reduce(
        (a, q) => a + q,
        0,
      );
      return sum + b.items.reduce((s, i) => s + (Number(i.qty) || 0), 0) - back;
    }, 0);
  }, [filteredBills]);

  const totalFreeCasesGiven = useMemo(() => {
    return filteredBills.reduce(
      (sum, b) => sum + b.items.reduce((s, i) => s + (i.freeQty || 0), 0),
      0,
    );
  }, [filteredBills]);

  const totalDiscountsGiven = useMemo(() => {
    return filteredBills.reduce(
      (sum, b) => sum + b.items.reduce((s, i) => s + (i.discount || 0), 0),
      0,
    );
  }, [filteredBills]);

  // SKU-Wise / Product-Wise Sales Breakdown for the selected time horizon / date
  const productWiseSales = useMemo(() => {
    const map = new Map<
      number,
      {
        productId: number;
        productName: string;
        category: string;
        casesBilled: number;
        casesFree: number;
        totalCases: number;
        grossRevenue: number;
        discounts: number;
        netRevenue: number;
        invoicesCount: number;
      }
    >();

    filteredBills.forEach((b) => {
      b.items.forEach((item) => {
        const prod = products.find((p) => p.id === item.productId);
        const existing = map.get(item.productId);
        const billed =
          item.chargeableQty !== undefined ? item.chargeableQty : item.qty;
        const free = item.freeQty || 0;
        const totalCs =
          item.qty +
          (item.freeQty && item.chargeableQty === item.qty ? item.freeQty : 0);
        const gross = item.gross || item.qty * item.rate;
        const disc = item.discount || 0;
        const net = item.amount || gross - disc;

        if (!existing) {
          map.set(item.productId, {
            productId: item.productId,
            productName:
              item.productName || prod?.name || `Product #${item.productId}`,
            category: item.category || prod?.category || "general",
            casesBilled: billed,
            casesFree: free,
            totalCases: totalCs,
            grossRevenue: gross,
            discounts: disc,
            netRevenue: net,
            invoicesCount: 1,
          });
        } else {
          existing.casesBilled += billed;
          existing.casesFree += free;
          existing.totalCases += totalCs;
          existing.grossRevenue += gross;
          existing.discounts += disc;
          existing.netRevenue += net;
          existing.invoicesCount += 1;
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => b.totalCases - a.totalCases);
  }, [filteredBills, products]);

  // INVENTORY METRICS
  const inventoryStats = useMemo(() => {
    let totalCrates = 0;
    let totalCostValuation = 0;
    let totalCostValuationInclGst = 0;
    let totalInputGst = 0;
    let totalSellingValuation = 0;
    let totalSellingValuationExGst = 0;

    products.forEach((p) => {
      const rem = remainingStock(p.id);
      totalCrates += rem;
      const costPrice = p.effectiveCost || p.cost || 0;
      totalCostValuation += rem * costPrice;

      const g = resolveProductGstRate(p);
      const landedWithTax = p.landedCostPerCrate && p.landedCostPerCrate > 0
        ? p.landedCostPerCrate
        : costPrice * (1 + g);
      totalCostValuationInclGst += rem * landedWithTax;
      totalInputGst += rem * Math.max(0, landedWithTax - costPrice);

      const sellPrice = p.wholesale || p.retail || costPrice;
      totalSellingValuation += rem * sellPrice;

      // Extract GST for accurate ex-GST operating valuation
      const sellExGst = g > 0 ? sellPrice / (1 + g) : sellPrice;
      totalSellingValuationExGst += rem * sellExGst;
    });

    // Ex-GST true potential operating gross profit
    const potentialGrossProfit = totalSellingValuationExGst - totalCostValuation;
    const marginPct =
      totalSellingValuationExGst > 0
        ? (potentialGrossProfit / totalSellingValuationExGst) * 100
        : 0;

    return {
      totalCrates,
      totalCostValuation,
      totalCostValuationInclGst,
      totalInputGst,
      totalSellingValuation,
      totalSellingValuationExGst,
      potentialGrossProfit,
      marginPct,
    };
  }, [products, remainingStock]);

  // BATCH EXPIRY RADAR
  const expiryRadar = useMemo(() => {
    const today = new Date();
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(today.getDate() + 30);
    const ninetyDaysAhead = new Date();
    ninetyDaysAhead.setDate(today.getDate() + 90);

    const expired: any[] = [];
    const critical: any[] = []; // within 30 days
    const caution: any[] = []; // 30-90 days

    inventoryBatches.forEach((b) => {
      if (!b.expiryDate) return;
      const exp = new Date(b.expiryDate);
      const prod = products.find((p) => p.id === b.productId);
      const item = {
        ...b,
        productName: prod?.name || `Product #${b.productId}`,
      };

      if (exp < today) {
        expired.push(item);
      } else if (exp <= thirtyDaysAhead) {
        critical.push(item);
      } else if (exp <= ninetyDaysAhead) {
        caution.push(item);
      }
    });

    return { expired, critical, caution };
  }, [inventoryBatches, products]);

  // PURCHASES & INWARD METRICS
  const purchaseStats = useMemo(() => {
    let grossPurchaseVal = 0;
    let netPurchaseVal = 0;
    let totalCratesInward = 0;
    let totalCessPaid = 0;
    let totalGstPaid = 0;

    filteredGrns.forEach((g) => {
      grossPurchaseVal += g.grandTotal || 0;
      netPurchaseVal += g.totalTaxable || g.grandTotal || 0;
      totalCratesInward +=
        g.totalReceivedQty ||
        g.items.reduce(
          (s, i) =>
            s +
            (i.totalReceivedQty ??
              (i.schemeMode === "additive" ? i.qty + (i.freeQty || 0) : i.qty)),
          0,
        );
      totalGstPaid +=
        g.totalTax ||
        (g.totalCgst || 0) + (g.totalSgst || 0) + ((g as any).totalIgst || 0);
    });

    return {
      inwardInvoicesCount: filteredGrns.length,
      grossPurchaseVal,
      netPurchaseVal,
      totalCratesInward,
      totalCessPaid,
      totalGstPaid,
    };
  }, [filteredGrns]);

  // RECEIVABLES & AGING LEDGER (All unpaid bills)
  const debtorsLedger = useMemo(() => {
    const partyMap: Record<
      string,
      {
        retailer: string;
        phone: string;
        totalBilled: number;
        totalPaid: number;
        balance: number;
        billsCount: number;
        lastBillDate: string;
        aging: { current: number; due15: number; overdue30: number };
      }
    > = {};

    const now = new Date().getTime();

    bills.forEach((b) => {
      const balance = billBalance(b);
      if (balance <= 0) return;

      const key = b.retailer
        .trim()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (!partyMap[key]) {
        partyMap[key] = {
          retailer: b.retailer,
          phone: b.phone || "",
          totalBilled: 0,
          totalPaid: 0,
          balance: 0,
          billsCount: 0,
          lastBillDate: b.date,
          aging: { current: 0, due15: 0, overdue30: 0 },
        };
      }

      const party = partyMap[key];
      party.totalBilled += billNetTotal(b);
      party.totalPaid += Number(b.amountPaid) || 0;
      party.balance += balance;
      party.billsCount += 1;
      if (b.date > party.lastBillDate) {
        party.lastBillDate = b.date;
      }

      // Aging
      const billTime = new Date(b.date).getTime();
      const daysDiff = Math.floor((now - billTime) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 15) {
        party.aging.current += balance;
      } else if (daysDiff <= 30) {
        party.aging.due15 += balance;
      } else {
        party.aging.overdue30 += balance;
      }
    });

    return Object.values(partyMap).sort((a, b) => b.balance - a.balance);
  }, [bills]);

  // GST TAX OUTPUT vs INPUT TAX CREDIT (ITC)
  const gstTaxSummary = useMemo(() => {
    // Built from ALL period invoices (not the paid/due filter), at the rate printed on each
    // invoice, after special discounts, with credit notes deducted and excess ITC carried forward.
    const computed = safeGstSummaryFromBills(
      periodBills,
      products,
      customers || [],
      billingSettings?.invoicePrefix || "INV",
      { orgStateCode: orgStateCodeFromProfile(orgProfile) },
    );
    // Goods returned to suppliers: once the supplier issues a credit note, the GST on them is no longer claimable.
    const itcReversal = itcReversalFromDispositions(
      inventoryDispositions || [],
      (d: string) => {
        if (period === "all") return true;
        if (period === "customDate") return d === selectedDate;
        if (period === "today") return d === todayStr;
        if (period === "yesterday") return d === yesterdayStr;
        if (period === "last7") return d >= sevenDaysAgoStr && d <= todayStr;
        if (period === "thisMonth") return d.startsWith(currentYearMonth);
        if (period === "lastMonth") return d.startsWith(lastYearMonth);
        if (period === "customRange")
          return (!startDate || d >= startDate) && (!endDate || d <= endDate);
        return true;
      },
    );
    const inputGstCredit = Math.max(
      0,
      purchaseStats.totalGstPaid + purchaseStats.totalCessPaid - itcReversal.total,
    );
    const g3 = computeGstr3b(
      computed.lines,
      {
        taxable: computed.cnTaxable,
        cgst: computed.cnCgst,
        sgst: computed.cnSgst,
        igst: computed.cnIgst,
        tax: computed.cnTax,
      },
      inputGstCredit,
    );
    return {
      outputTaxable: computed.outputTaxable,
      outputCgst: computed.outputCgst,
      outputSgst: computed.outputSgst,
      outputIgst: computed.outputIgst,
      outputCess: computed.outputCess,
      totalOutputGst: computed.totalOutputGst,
      creditNoteTax: computed.cnTax,
      netOutputGst: g3.netOutputGst,
      inputGstCredit,
      itcReversal,
      netGstPayable: g3.netPayable,
      carryForwardItc: g3.carryForwardItc,
    };
  }, [
    periodBills,
    purchaseStats,
    products,
    customers,
    orgProfile,
    billingSettings,
    inventoryDispositions,
    period,
    selectedDate,
    startDate,
    endDate,
  ]);

  // Existing Customers list for Record Payment modal
  // One source of truth for customer balances: the ledger's own list (opening balance, every
  // receipt, advances and returns included). A private list built from bills alone showed
  // "0 due / settled" for a customer who had paid in advance.
  const { existingCustomers: ledgerCustomers } = useLedger();
  const existingCustomersList: ExistingCustomer[] = useMemo(
    () => [...ledgerCustomers].sort((a, b) => b.balanceDue - a.balanceDue),
    [ledgerCustomers],
  );

  // Filtered Payments (by period, mode, search)
  const filteredPayments = useMemo(() => {
    return payments
      .filter((p) => {
        const pDate = (p.paymentDate || "").slice(0, 10);
        let matchDate = true;
        if (period === "customDate") matchDate = pDate === selectedDate;
        else if (period === "today") matchDate = pDate === todayStr;
        else if (period === "yesterday") matchDate = pDate === yesterdayStr;
        else if (period === "last7")
          matchDate = pDate >= sevenDaysAgoStr && pDate <= todayStr;
        else if (period === "thisMonth")
          matchDate = pDate.startsWith(currentYearMonth);
        else if (period === "lastMonth")
          matchDate = pDate.startsWith(lastYearMonth);
        else if (period === "customRange")
          matchDate = pDate >= startDate && pDate <= endDate;
        else if (period === "all") matchDate = true;

        if (!matchDate) return false;

        if (paymentModeFilter !== "all" && p.mode !== paymentModeFilter) {
          return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchCustomer = (p.customerName || "")
            .toLowerCase()
            .includes(q);
          const matchPhone = (p.customerPhone || "").toLowerCase().includes(q);
          const matchNote = (p.referenceNote || "").toLowerCase().includes(q);
          const matchId = (p.id || "").toLowerCase().includes(q);
          const matchBill = p.billId ? String(p.billId).includes(q) : false;
          if (
            !matchCustomer &&
            !matchPhone &&
            !matchNote &&
            !matchId &&
            !matchBill
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) =>
        b.paymentDate > a.paymentDate
          ? 1
          : b.paymentDate < a.paymentDate
            ? -1
            : 0,
      );
  }, [
    payments,
    period,
    selectedDate,
    todayStr,
    yesterdayStr,
    sevenDaysAgoStr,
    currentYearMonth,
    lastYearMonth,
    startDate,
    endDate,
    paymentModeFilter,
    searchQuery,
  ]);

  // Payment KPIs
  const paymentStats = useMemo(() => {
    let totalCollected = 0;
    let cashCollected = 0;
    let upiCollected = 0;
    let bankCollected = 0;
    let chequeCollected = 0;
    let otherCollected = 0;

    filteredPayments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      totalCollected += amt;
      if (p.mode === "cash") cashCollected += amt;
      else if (p.mode === "upi") upiCollected += amt;
      else if (p.mode === "bank") bankCollected += amt;
      else if (p.mode === "cheque") chequeCollected += amt;
      else otherCollected += amt;
    });

    return {
      totalCount: filteredPayments.length,
      totalCollected,
      cashCollected,
      upiCollected,
      bankCollected,
      chequeCollected,
      otherCollected,
    };
  }, [filteredPayments]);

  // Why "Payments & Collections" and "Paid on These Invoices" can differ:
  //  - Payments & Collections = every receipt, by the date the money came in (advances and old
  //    dues included, refunds taken off).
  //  - Paid on These Invoices = what the invoices listed here have received so far.
  // Split the receipts so the difference can be read, not guessed.
  const receiptsGap = useMemo(() => {
    if (searchQuery.trim() || paymentModeFilter !== "all") return null;
    let advance = 0;
    let noInvoice = 0;
    let refunds = 0;
    let onInvoice = 0;
    filteredPayments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (p.isRefund) refunds += amt;
      else if (p.isAdvance) advance += amt;
      else if (!p.billId) noInvoice += amt;
      else onInvoice += amt;
    });
    const other = Math.round((onInvoice - totalSalesPaid) * 100) / 100;
    const total = paymentStats.totalCollected;
    if (Math.abs(total - totalSalesPaid) < 0.5) return null;
    return { advance, noInvoice, refunds, other };
  }, [filteredPayments, paymentStats.totalCollected, totalSalesPaid, searchQuery, paymentModeFilter]);

  // Grouped Payments by Date (Sorted Day-Wise, Latest Day on Top)
  const dateWiseGroupedPayments = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        total: number;
        cash: number;
        upi: number;
        bank: number;
        cheque: number;
        payments: PaymentRecord[];
      }
    >();
    filteredPayments.forEach((p) => {
      const d = (p.paymentDate || "").slice(0, 10) || "Unknown Date";
      const amt = Number(p.amount) || 0;
      const existing = map.get(d);
      if (!existing) {
        map.set(d, {
          date: d,
          total: amt,
          cash: p.mode === "cash" ? amt : 0,
          upi: p.mode === "upi" ? amt : 0,
          bank: p.mode === "bank" ? amt : 0,
          cheque: p.mode === "cheque" ? amt : 0,
          payments: [p],
        });
      } else {
        existing.total += amt;
        if (p.mode === "cash") existing.cash += amt;
        else if (p.mode === "upi") existing.upi += amt;
        else if (p.mode === "bank") existing.bank += amt;
        else if (p.mode === "cheque") existing.cheque += amt;
        existing.payments.push(p);
      }
    });

    const groups = Array.from(map.values()).map((g) => {
      // Sort payments within each date group: latest on top
      g.payments.sort((a, b) =>
        (b.paymentDate || "").localeCompare(a.paymentDate || ""),
      );
      return g;
    });

    // Sort days strictly: latest day on top
    return groups.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredPayments]);

  // Customer-wise Payment & Invoicing Ledger
  const customerWisePaymentSummary = useMemo(() => {
    interface CustomerLedgerItem {
      name: string;
      phone: string;
      totalBilled: number;
      totalPaid: number;
      balanceDue: number;
      /** Paid ahead by the customer (credit on account). */
      advance: number;
      billCount: number;
      paymentCount: number;
      lastPaymentDate?: string;
      lastBillDate?: string;
      events: Array<{
        type: "invoice" | "payment";
        date: string;
        ref: string;
        description: string;
        mode?: PaymentMode;
        debit: number;
        credit: number;
        paymentRecordId?: string;
        billId?: number;
      }>;
    }

    const map = new Map<string, CustomerLedgerItem>();

    bills.forEach((b) => {
      if (b.status === "cancelled" || b.cancelled) return;
      const name = (b.retailer || "Cash Sale").trim();
      const key = name.toLowerCase();
      let item = map.get(key);
      if (!item) {
        item = {
          name,
          phone: b.phone || "",
          totalBilled: 0,
          totalPaid: 0,
          balanceDue: 0,
          advance: 0,
          billCount: 0,
          paymentCount: 0,
          events: [],
        };
        map.set(key, item);
      }
      item.billCount += 1;
      item.totalBilled += Number(b.total) || 0;
      if (!item.phone && b.phone) item.phone = b.phone;
      if (!item.lastBillDate || b.date > item.lastBillDate) {
        item.lastBillDate = b.date;
      }
      item.events.push({
        type: "invoice",
        date: b.date || "",
        ref: `Invoice #${b.id}`,
        description: `${b.items.length} items (${b.items.reduce((s, i) => s + i.qty, 0)} cases)`,
        debit: Number(b.total) || 0,
        credit: 0,
        billId: b.id,
      });

      for (const ret of b.returns || []) {
        item.events.push({
          type: "payment",
          date: ret.date || b.date || "",
          ref: ret.creditNoteNo ? `Credit Note #${ret.creditNoteNo}` : `Return #${b.id}`,
          description: ret.reason || `Sales Return on Invoice #${b.id}`,
          debit: 0,
          credit: Number(ret.totalCredit) || 0,
          billId: b.id,
        });
        item.totalPaid += Number(ret.totalCredit) || 0;
      }
    });

    payments.forEach((p) => {
      const name = (p.customerName || "Cash Sale").trim();
      const key = name.toLowerCase();
      let item = map.get(key);
      if (!item) {
        item = {
          name,
          phone: p.customerPhone || "",
          totalBilled: 0,
          totalPaid: 0,
          balanceDue: 0,
          advance: 0,
          billCount: 0,
          paymentCount: 0,
          events: [],
        };
        map.set(key, item);
      }
      item.paymentCount += 1;
      item.totalPaid += Number(p.amount) || 0;
      if (!item.phone && p.customerPhone) item.phone = p.customerPhone;
      if (!item.lastPaymentDate || p.paymentDate > item.lastPaymentDate) {
        item.lastPaymentDate = p.paymentDate;
      }
      item.events.push({
        type: "payment",
        date: p.paymentDate || "",
        ref: p.billId ? `Invoice #${p.billId}` : `Direct Collection`,
        description:
          p.referenceNote ||
          (p.mode ? `Paid via ${p.mode.toUpperCase()}` : "Payment Received"),
        mode: p.mode,
        debit: 0,
        credit: Number(p.amount) || 0,
        paymentRecordId: p.id,
        billId: p.billId,
      });
    });

    const nameKey = (n: string) =>
      (n || "").trim().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").toLowerCase();
    const list = Array.from(map.values()).map((c) => {
      // Due and advance come from the customer ledger (opening balance, every receipt and return),
      // so this table agrees with the customer's own page. Clamping at 0 here used to turn an
      // advance into "₹0 due" and hide it.
      const led = ledgerCustomers.find((x) => nameKey(x.name) === nameKey(c.name));
      if (led) {
        c.balanceDue = led.balanceDue;
        c.advance = led.advance || 0;
      } else {
        const raw = c.totalBilled - c.totalPaid;
        c.balanceDue = Math.max(0, raw);
        c.advance = Math.max(0, -raw);
      }
      c.events.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return a.type === "payment" ? -1 : 1;
      });
      return c;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
      );
    }

    return list.sort((a, b) => {
      const dateA = a.lastPaymentDate || a.lastBillDate || "";
      const dateB = b.lastPaymentDate || b.lastBillDate || "";
      const dateCmp = dateB.localeCompare(dateA);
      if (dateCmp !== 0) return dateCmp;
      return b.balanceDue - a.balanceDue;
    });
  }, [bills, payments, searchQuery, ledgerCustomers]);

  // Export current active report as CSV
  const handleExportCsv = () => {
    let csvContent = "";
    const dateTag =
      period === "customDate"
        ? selectedDate
        : period === "today"
          ? todayStr
          : period === "yesterday"
            ? yesterdayStr
            : period === "customRange"
              ? `${startDate}_to_${endDate}`
              : period;
    let filename = `report-${activeReport}-${dateTag}.csv`;

    if (activeReport === "sales") {
      filename = `sales-report-${dateTag}.csv`;

      csvContent = `"SALES & DISPATCH REPORT - ${orgProfile?.name || "MrWater Distribution"}"\n`;
      csvContent += `"Report Period: ${dateTag}"\n`;
      csvContent += `"Generated On: ${new Date().toLocaleString("en-IN")}"\n`;
      csvContent += `"Total Invoices: ${filteredBills.length}, Total Gross Turnover: ${totalSalesRevenue}, Total Cases: ${totalCasesSold}, Cash/UPI Collected: ${totalSalesPaid}, Outstanding Credit: ${totalSalesOutstanding}"\n\n`;

      csvContent += "--- INVOICING REGISTER ---\n";
      csvContent +=
        "Invoice No,Date,Retailer,Phone,Items Count,Gross Total,Amount Paid,Balance Due,Status\n";
      filteredBills.forEach((b) => {
        const itemsCount = b.items.reduce((s, i) => s + i.qty, 0);
        const bal = billBalance(b);
        const st = statusOf(billNetTotal(b), b.amountPaid);
        csvContent += `"${b.id}","${b.date}","${b.retailer.replace(/"/g, '""')}","${b.phone || ""}",${itemsCount},${b.total},${b.amountPaid},${bal},"${st.label.toUpperCase()}"\n`;
      });

      if (productWiseSales.length > 0) {
        csvContent += "\n--- PRODUCT-WISE / SKU SALES BREAKDOWN ---\n";
        csvContent +=
          "Product ID,Beverage SKU Name,Category,Invoices,Billed Cases,Free Cases,Total Cases,Gross Revenue,Discounts,Net Sales Amount\n";
        productWiseSales.forEach((p) => {
          csvContent += `${p.productId},"${p.productName.replace(/"/g, '""')}","${p.category}",${p.invoicesCount},${p.casesBilled},${p.casesFree},${p.totalCases},${p.grossRevenue},${p.discounts},${p.netRevenue}\n`;
        });
      }
    } else if (activeReport === "payments") {
      filename = `payments-collections-${dateTag}.csv`;
      csvContent = `"PAYMENTS & DATEWISE COLLECTIONS REGISTER - ${orgProfile?.name || "MrWater Distribution"}"\n`;
      csvContent += `"Report Period: ${dateTag}"\n`;
      csvContent += `"Total Collections: ₹${paymentStats.totalCollected}, Total Entries: ${paymentStats.totalCount}, Cash: ₹${paymentStats.cashCollected}, UPI: ₹${paymentStats.upiCollected}, Bank: ₹${paymentStats.bankCollected}, Cheque: ₹${paymentStats.chequeCollected}"\n\n`;
      csvContent +=
        "Payment ID,Payment Date,Customer Name,Phone,Bill Reference,Payment Mode,Amount (₹),Reference Note,Recorded By\n";
      filteredPayments.forEach((p) => {
        csvContent += `"${p.id}","${p.paymentDate}","${(p.customerName || "").replace(/"/g, '""')}","${p.customerPhone || ""}","${p.billId ? `Invoice #${p.billId}` : "Direct"}","${(p.mode || "cash").toUpperCase()}",${p.amount},"${(p.referenceNote || "").replace(/"/g, '""')}","${(p.recordedBy || "").replace(/"/g, '""')}"\n`;
      });
    } else if (activeReport === "inventory") {
      csvContent =
        "Product ID,Beverage SKU Name,Category,Remaining Crates,Landed Cost,Wholesale Rate,Cost Valuation,Selling Valuation,Margin\n";
      products.forEach((p) => {
        const rem = remainingStock(p.id);
        const cost = p.effectiveCost || p.cost || 0;
        const whole = p.wholesale || p.retail || cost;
        const costVal = rem * cost;
        const sellVal = rem * whole;
        csvContent += `${p.id},"${p.name.replace(/"/g, '""')}","${p.category}",${rem},${cost},${whole},${costVal},${sellVal},${sellVal - costVal}\n`;
      });
    } else if (activeReport === "purchases") {
      csvContent =
        "GRN No,Invoice Date,Supplier Name,Supplier Invoice,Warehouse,Crates Received,Total Value,Payment Status\n";
      filteredGrns.forEach((g) => {
        const crates =
          g.totalReceivedQty ||
          g.items.reduce((s, i) => s + i.qty + (i.freeQty || 0), 0);
        const whName =
          warehouses.find((w) => w.id === g.warehouseId)?.name || "Godown";
        csvContent += `"${g.id}","${g.inwardDate || ""}","${g.supplierName.replace(/"/g, '""')}","${g.invoiceNo || ""}","${whName}",${crates},${g.grandTotal},"Received"\n`;
      });
    } else if (activeReport === "receivables") {
      csvContent =
        "Retailer Party,Phone,Total Invoices,Total Billed,Total Paid,Current Balance Due,0-15 Days,16-30 Days,30+ Days Overdue\n";
      debtorsLedger.forEach((d) => {
        csvContent += `"${d.retailer.replace(/"/g, '""')}","${d.phone}",${d.billsCount},${d.totalBilled},${d.totalPaid},${d.balance},${d.aging.current},${d.aging.due15},${d.aging.overdue30}\n`;
      });
    } else if (activeReport === "trips") {
      csvContent =
        "Trip No,Date,Vehicle,Status,Loaded Crates,Delivered Crates,Returned Empty,Discrepancy Cases\n";
      filteredTrips.forEach((t) => {
        const { rows } = tripBreakdown(t);
        const loaded = Object.values(t.loaded).reduce((s, v) => s + v, 0);
        const returned = Object.values(t.returned).reduce((s, v) => s + v, 0);
        const delivered = rows.reduce((s, r) => s + r.sold, 0);
        const disc = rows.reduce((s, r) => s + r.discrepancy, 0);
        csvContent += `"${t.id}","${t.date}","${t.vehicle}","${t.status}",${loaded},${delivered},${returned},${disc}\n`;
      });
    } else if (activeReport === "tax") {
      csvContent = "Tax Component,Taxable Base,Rate / Rules,Tax Amount\n";
      csvContent += `Output Taxable Turnover,${gstTaxSummary.outputTaxable.toFixed(2)},GST B2B/B2C,${gstTaxSummary.totalOutputGst.toFixed(2)}\n`;
      csvContent += `Output CGST,${gstTaxSummary.outputTaxable.toFixed(2)},Central GST,${gstTaxSummary.outputCgst.toFixed(2)}\n`;
      csvContent += `Output SGST,${gstTaxSummary.outputTaxable.toFixed(2)},State GST,${gstTaxSummary.outputSgst.toFixed(2)}\n`;
      csvContent += `Output IGST,${gstTaxSummary.outputTaxable.toFixed(2)},Inter-state,${gstTaxSummary.outputIgst.toFixed(2)}\n`;
      csvContent += `Cess,${gstTaxSummary.outputTaxable.toFixed(2)},Cess charged on invoices,${gstTaxSummary.outputCess.toFixed(2)}\n`;
      csvContent += `Less: Credit Notes (tax),,Sales returns,${(-gstTaxSummary.creditNoteTax).toFixed(2)}\n`;
      csvContent += `Input Tax Credit (ITC),${purchaseStats.netPurchaseVal.toFixed(2)},Supplier Tax Invoices,${gstTaxSummary.inputGstCredit.toFixed(2)}\n`;
      csvContent += `Net GST Payable to Govt,${gstTaxSummary.outputTaxable.toFixed(2)},Output - Credit notes - ITC,${gstTaxSummary.netGstPayable.toFixed(2)}\n`;
      csvContent += `ITC carried forward,,Excess ITC,${gstTaxSummary.carryForwardItc.toFixed(2)}\n`;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Is this date inside the period picked at the top? (shared by the beat-wise report)
  const reportInPeriod = useCallback(
    (d: string) => {
      if (period === "all") return true;
      if (period === "customDate") return d === selectedDate;
      if (period === "today") return d === todayStr;
      if (period === "yesterday") return d === yesterdayStr;
      if (period === "last7") return d >= sevenDaysAgoStr && d <= todayStr;
      if (period === "thisMonth") return d.startsWith(currentYearMonth);
      if (period === "lastMonth") return d.startsWith(lastYearMonth);
      if (period === "customRange") return (!startDate || d >= startDate) && (!endDate || d <= endDate);
      return true;
    },
    [period, selectedDate, todayStr, yesterdayStr, sevenDaysAgoStr, currentYearMonth, lastYearMonth, startDate, endDate],
  );
  const reportPeriodText =
    period === "customDate"
      ? selectedDate
      : period === "today"
        ? "Today"
        : period === "yesterday"
          ? "Yesterday"
          : period === "customRange"
            ? `${startDate || "…"} → ${endDate || "…"}`
            : period === "last7"
              ? "Last 7 days"
              : period === "thisMonth"
                ? "This month"
                : period === "lastMonth"
                  ? "Last month"
                  : "All time";

  const cardStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderWidth: 2,
  };

  // Report tabs defined in ReportSectionTabs

  useEffect(() => {
    const root = document.getElementById("view-reports");
    return root ? installTableCards(root) : undefined;
  }, []);

  return (
    <div
      id="view-reports"
      className="mw-workspace reports-root space-y-4 sm:space-y-5 min-w-0 max-w-full overflow-x-hidden"
    >
      {/* Header — MrWater Beverages report style */}
      <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm border border-slate-200 flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
            <BarChart3 className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="mw-page-title text-xl flex items-center gap-2">
              Reports
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live
              </span>
            </h1>
            <p className="hidden sm:block text-xs text-slate-500 font-medium mt-0.5">
              Sales, profit, GST, stock and collections — one place
            </p>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-print-report"
            aria-label="Print report"
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print Report</span>
          </button>

          {activeReport !== "beats" && (
            <button
              id="btn-export-report-csv"
              aria-label="Export CSV"
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Smart Space-Saving Filter & Search Bar (Inventory & Product pattern) */}
      <div className="space-y-2">
        <div
          className="p-2 sm:p-2.5 border-2 rounded-lg flex flex-wrap items-center justify-between gap-2.5 relative"
          style={cardStyle}
        >
          {/* Search Input */}
          <div className="relative flex-1 min-w-0 basis-full sm:basis-auto sm:min-w-[200px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              id="input-reports-search"
              placeholder={
                activeReport === "sales"
                  ? "Search by invoice #, retailer, phone, or route..."
                  : activeReport === "inventory"
                    ? "Search SKU, brand, or pack size..."
                    : activeReport === "purchases"
                      ? "Search consignment, supplier, or invoice #..."
                      : "Search records or items..."
              }
              value={
                activeReport === "inventory" ? skuSearchQuery : searchQuery
              }
              onChange={(e) => {
                if (activeReport === "inventory") {
                  setSkuSearchQuery(e.target.value);
                } else {
                  setSearchQuery(e.target.value);
                }
              }}
              className="w-full pl-9 pr-8 py-1.5 text-xs sm:text-sm border-2 rounded bg-white focus:outline-none focus:border-sky-600 transition-colors"
              style={{ borderColor: palette.line, color: palette.ink }}
            />
            {(activeReport === "inventory" ? skuSearchQuery : searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  if (activeReport === "inventory") setSkuSearchQuery("");
                  else setSearchQuery("");
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Shared period control (quick horizon) */}
          <PeriodFilter
            compact
            monthIsCalendar
            value={{
              ...filterPresetForRange(period, startDate, endDate),
              startDate: period === "all" ? "" : startDate,
              endDate: period === "all" ? "" : endDate,
            }}
            onChange={(range) => {
              const mapped = reportPeriodFromFilter(range);
              setPeriod(mapped.period);
              setStartDate(mapped.startDate || "");
              setEndDate(mapped.endDate || "");
              if (mapped.selectedDate) setSelectedDate(mapped.selectedDate);
            }}
          />

          {/* Filter Dropdown Trigger Button & Popover */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              type="button"
              id="btn-report-filters-toggle"
              onClick={() => setShowFilterDropdown((prev) => !prev)}
              className={`flex items-center gap-2 px-3 py-1.5 border-2 rounded text-xs sm:text-sm font-bold cursor-pointer transition-colors focus-ring ${
                showFilterDropdown || activeFiltersCount > 0
                  ? "bg-sky-600 text-white border-sky-600"
                  : "bg-white hover:bg-slate-50 text-slate-800"
              }`}
              style={{
                borderColor:
                  showFilterDropdown || activeFiltersCount > 0
                    ? palette.navy
                    : palette.line,
              }}
            >
              <Filter size={14} />
              <span>Filter Options</span>
              {activeFiltersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown
                size={13}
                className={`transition-transform duration-200 ${showFilterDropdown ? "rotate-180" : ""}`}
              />
            </button>

            {/* Smart Filter Dropdown Popover */}
            {showFilterDropdown && (
              <div
                className="fixed inset-0 z-[55] bg-black/40 sm:hidden"
                onClick={() => setShowFilterDropdown(false)}
                aria-hidden="true"
              />
            )}
            {showFilterDropdown && (
              <div
                id="popover-report-filters"
                className="fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] z-[60] max-h-[80dvh] overflow-y-auto overscroll-contain sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-h-none sm:overflow-visible sm:z-50 bg-white border-2 rounded-2xl sm:rounded-xl shadow-2xl p-4 space-y-4 animate-in fade-in duration-150"
                style={{ borderColor: palette.navy }}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 sticky top-0 bg-white -mt-1 pt-1 z-10">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal size={15} className="text-sky-700" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Report Horizon & Filters
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {activeFiltersCount > 0 && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="text-[11px] font-bold text-red-600 hover:text-red-800 flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw size={11} />
                        Reset
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowFilterDropdown(false)}
                      className="sm:hidden px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>

                {/* Filter Option 1: exact dates (the quick periods live in the period dropdown) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1">
                    <Calendar size={12} /> Exact date / range:
                  </label>
                  <div className="grid grid-cols-2 gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                    {[
                      { id: "customDate", label: "Particular Date" },
                      { id: "customRange", label: "Date Range" },
                    ].map((p) => {
                      const active = period === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          id={`filter-period-${p.id}`}
                          onClick={() => {
                            // Pressing the active one again goes back to All time.
                            if (active) {
                              setPeriod("all");
                              return;
                            }
                            setPeriod(p.id as ReportPeriod);
                            if (p.id === "customRange" && (!startDate || !endDate)) {
                              const d = new Date();
                              d.setDate(d.getDate() - 29);
                              setStartDate(toLocalISODate(d));
                              setEndDate(todayStr);
                            }
                          }}
                          className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer text-center transition-all ${
                            active
                              ? "bg-sky-600 text-white shadow-sm"
                              : "text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Date Range Controls inside popover */}
                {period === "customRange" && (
                  <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 space-y-2">
                    <span className="text-[11px] font-bold text-blue-950 block">
                      Custom Date Span:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                          From:
                        </span>
                        <input
                          type="date"
                          value={startDate}
                          max={endDate || todayStr}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full border px-2 py-1 text-xs font-bold rounded bg-white"
                          style={{ borderColor: palette.line }}
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                          To:
                        </span>
                        <input
                          type="date"
                          value={endDate}
                          max={todayStr}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full border px-2 py-1 text-xs font-bold rounded bg-white"
                          style={{ borderColor: palette.line }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Filter Option 2: Warehouse / Depot */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1">
                    <Building2 size={12} /> Godown & Depot Facility:
                  </label>
                  <select
                    id="select-report-warehouse-dropdown"
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    className="w-full border-2 px-2.5 py-1.5 text-xs font-semibold rounded bg-white focus:outline-none focus:border-sky-600"
                    style={{ borderColor: palette.line, color: palette.ink }}
                  >
                    <option value="all">
                      All Godowns & Depots ({warehouses.length})
                    </option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.location})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter Option 3: Payment Status Filter (for Sales/Receivables) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1">
                    <Receipt size={12} /> Payment Settlement:
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                    {[
                      { id: "all", label: "All Bills" },
                      { id: "paid", label: "Fully Paid" },
                      { id: "due", label: "Pending Due" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setPaymentStatusFilter(item.id as any)}
                        className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer text-center transition-colors ${
                          paymentStatusFilter === item.id
                            ? "bg-sky-600 text-white shadow-sm"
                            : "text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Popover Footer */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {filteredBills.length} invoices in scope
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFilterDropdown(false)}
                    className="px-4 py-1.5 text-xs font-bold rounded bg-sky-600 text-white hover:bg-sky-700 cursor-pointer shadow-sm"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sub-bar: Particular Single Date Selector & Quick Navigation (shown only when customDate is active) */}
        {period === "customDate" && (
          <div
            className="p-2 sm:p-2.5 border-2 rounded-lg flex flex-wrap items-center justify-between gap-3 bg-white"
            style={{ borderColor: palette.line }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Calendar size={13} className="text-sky-700" /> Particular Date:
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="btn-report-prev-day"
                  onClick={() => shiftSelectedDate(-1)}
                  className="px-2.5 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-50 flex items-center gap-1 cursor-pointer transition-colors"
                  style={{ borderColor: palette.line, color: palette.ink }}
                  title="Previous Day"
                >
                  <ChevronLeft size={13} />
                  Prev Day
                </button>

                <input
                  type="date"
                  id="report-selected-date-picker"
                  value={selectedDate}
                  max={todayStr}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                    }
                  }}
                  className="border-2 px-2.5 py-1 text-xs font-black rounded bg-white shadow-sm"
                  style={{ borderColor: palette.navy, color: palette.ink }}
                />

                <button
                  type="button"
                  id="btn-report-next-day"
                  onClick={() => shiftSelectedDate(1)}
                  disabled={selectedDate >= todayStr}
                  className="px-2.5 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors"
                  style={{ borderColor: palette.line, color: palette.ink }}
                  title="Next Day"
                >
                  Next Day
                  <ChevronRight size={13} />
                </button>

                {selectedDate !== todayStr && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayStr)}
                    className="px-2 py-1 text-xs font-bold text-sky-700 hover:underline cursor-pointer"
                  >
                    Today
                  </button>
                )}
              </div>

              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                {formatFullDate(selectedDate)}
              </span>
            </div>

            {/* Quick jump pills for dates that have recorded bills */}
            {datesWithBills.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  Recent Sales:
                </span>
                {datesWithBills.slice(0, 4).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer transition-colors ${
                      selectedDate === d
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                    style={{
                      borderColor:
                        selectedDate === d ? palette.navy : palette.line,
                    }}
                  >
                    {formatFriendlyDate(d)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active Filter Chips */}
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Active Filters:
            </span>
            {period !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-sky-700 border border-sky-200">
                Period:{" "}
                {period === "today"
                  ? "Today"
                  : period === "yesterday"
                    ? "Yesterday"
                    : period === "thisMonth"
                      ? "This month"
                      : period === "lastMonth"
                        ? "Last month"
                        : period === "last7"
                          ? "Last 7 days"
                          : period === "customDate"
                            ? formatFriendlyDate(selectedDate)
                            : `${formatFriendlyDate(startDate)} - ${formatFriendlyDate(endDate)}`}
                <button
                  type="button"
                  onClick={() => setPeriod("all")}
                  className="hover:text-blue-950 cursor-pointer"
                  title="Back to All time"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {selectedWarehouse !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                Godown:{" "}
                {warehouses.find((w) => w.id === selectedWarehouse)?.name ||
                  selectedWarehouse}
                <button
                  type="button"
                  onClick={() => setSelectedWarehouse("all")}
                  className="hover:text-emerald-950 cursor-pointer"
                  title="Remove facility filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {paymentStatusFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-200">
                Payment:{" "}
                {paymentStatusFilter === "paid" ? "Paid Only" : "Due Only"}
                <button
                  type="button"
                  onClick={() => setPaymentStatusFilter("all")}
                  className="hover:text-amber-950 cursor-pointer"
                  title="Remove payment status filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-sky-700 hover:underline font-bold cursor-pointer ml-1"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Report Sections Quick Directory Grid */}
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto snap-x pb-1 sm:pb-0 sm:grid sm:grid-cols-3 xl:grid-cols-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {REPORT_SECTION_TABS.map(({ id, label, icon: Icon }) => {
            const active = activeReport === id;
            const metric = (() => {
              switch (id) {
                case "sales":
                  return `₹${money(totalSalesRevenue)}`;
                case "margin":
                  return "P&L";
                case "netProfit":
                  return "Net & salary";
                case "dispositions":
                  return "Claims";
                case "payments":
                  return `₹${money(paymentStats.totalCollected)}`;
                case "purchases":
                  return `₹${money(purchaseStats.netPurchaseVal)}`;
                case "receivables":
                  return `₹${money(debtorsLedger.reduce((s, d) => s + d.balance, 0))}`;
                case "inventory":
                  return `${inventoryStats.totalCrates} cs`;
                case "trips":
                  return `${filteredTrips.length} runs`;
                case "tax":
                  return `₹${money(gstTaxSummary.netGstPayable)}`;
                case "supplierProfit":
                  return "SKU P&L";
                case "daybook":
                  return "In / out";
                case "beats":
                  return "Sales & due";
              }
            })();

            const sub = (() => {
              switch (id) {
                case "sales":
                  return `${filteredBills.length} bills`;
                case "margin":
                  return "Margin & COGS";
                case "netProfit":
                  return "Salary budget";
                case "dispositions":
                  return "Free / write-off";
                case "payments":
                  return `${filteredPayments.length} receipts`;
                case "purchases":
                  return `${filteredGrns.length} GRNs`;
                case "receivables":
                  return `${debtorsLedger.length} parties`;
                case "inventory":
                  return `Asset Val`;
                case "trips":
                  return `Reconciliation`;
                case "tax":
                  return `Net Tax`;
                case "beats":
                  return `By delivery area`;
              }
            })();

            return (
              <button
                key={id}
                type="button"
                id={`btn-report-section-${id}`}
                onClick={(e) => {
                  setActiveReport(id);
                  e.currentTarget.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
                }}
                className={`snap-start shrink-0 w-auto sm:w-auto px-3 py-2 sm:p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-row sm:flex-col items-center sm:items-stretch gap-2 sm:gap-0 sm:justify-between ${
                  active
                    ? "bg-sky-600 text-white border-sky-600 shadow-md ring-2 ring-blue-900/20"
                    : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200 shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between sm:w-full">
                  <span
                    className={`p-1 rounded-md ${active ? "bg-white/20 text-white" : "bg-slate-100 text-sky-700"}`}
                  >
                    <Icon size={14} />
                  </span>
                  <span
                    className={`hidden sm:inline text-[10px] font-bold ${active ? "text-blue-200" : "text-slate-400"}`}
                  >
                    {sub}
                  </span>
                </div>
                <div className="sm:mt-2 flex items-baseline gap-1.5 sm:block">
                  <div
                    className={`text-xs font-bold leading-tight whitespace-nowrap sm:whitespace-normal sm:break-words ${active ? "text-white" : "text-slate-900"}`}
                  >
                    {label}
                  </div>
                  <div
                    className={`text-[11px] sm:text-sm font-black sm:mt-0.5 font-mono whitespace-nowrap ${active ? "text-amber-300" : "text-sky-700"}`}
                  >
                    {metric}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. SALES & REVENUE REPORT                                */}
      {/* ======================================================== */}
      {activeReport === "sales" && (
        <div className="space-y-6">
          {/* Printable Executive DSR Header (Visible only when printed) */}
          <div className="hidden print:block mb-4 border-b-2 pb-3">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black text-black">
                  {orgProfile?.name || "MrWater Distribution"}
                </h1>
                <p className="text-xs text-slate-700">
                  {orgProfile?.address || "Depot Area, Station Road"},{" "}
                  {orgProfile?.city || ""} | Ph: {orgProfile?.phone || ""}
                </p>
                {orgProfile?.gstin && (
                  <p className="text-xs font-mono font-bold text-neutral-800">
                    GSTIN: {orgProfile.gstin}
                  </p>
                )}
              </div>
              <div className="text-right">
                <h2 className="text-lg font-black text-slate-900 uppercase">
                  {period === "customDate" ||
                  period === "today" ||
                  period === "yesterday"
                    ? "DAILY SALES CLOSURE REPORT (DSR)"
                    : "SALES & INVOICING REPORT"}
                </h2>
                <p className="text-xs font-bold text-neutral-800">
                  Date:{" "}
                  {period === "customDate"
                    ? formatFullDate(selectedDate)
                    : period === "today"
                      ? formatFullDate(todayStr)
                      : period === "yesterday"
                        ? formatFullDate(yesterdayStr)
                        : period === "customRange"
                          ? `${formatFriendlyDate(startDate)} to ${formatFriendlyDate(endDate)}`
                          : period}
                </p>
                <p className="text-[11px] text-neutral-600">
                  Generated: {new Date().toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </div>

          {/* Daily Sales Closure (DSR) Date Banner */}
          {(period === "customDate" ||
            period === "today" ||
            period === "yesterday") && (
            <div
              className="p-4 border-2 rounded flex flex-wrap items-center justify-between gap-3 bg-sky-50/70"
              style={{ borderColor: palette.navy }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center font-bold text-white shrink-0"
                  style={{ backgroundColor: palette.navy }}
                >
                  <Calendar size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      className="text-base font-black tracking-tight"
                      style={{ color: palette.navy }}
                    >
                      Daily Sales Report (DSR)
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-sky-700 border border-sky-200">
                      {period === "today"
                        ? "Today's Ledger"
                        : period === "yesterday"
                          ? "Yesterday's Ledger"
                          : "Selected Date"}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">
                    {formatFullDate(
                      period === "today"
                        ? todayStr
                        : period === "yesterday"
                          ? yesterdayStr
                          : selectedDate,
                    )}
                  </p>
                </div>
              </div>

              {/* Quick Navigation Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => shiftSelectedDate(-1)}
                  className="px-2.5 py-1.5 text-xs font-bold border-2 rounded bg-white hover:bg-slate-50 flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                  style={{ borderColor: palette.line, color: palette.ink }}
                  title="Previous Day"
                >
                  <ChevronLeft size={14} />
                  Prev Day
                </button>

                <input
                  type="date"
                  value={
                    period === "today"
                      ? todayStr
                      : period === "yesterday"
                        ? yesterdayStr
                        : selectedDate
                  }
                  max={todayStr}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setPeriod("customDate");
                    }
                  }}
                  className="border-2 px-3 py-1 text-xs font-black rounded bg-white shadow-sm cursor-pointer"
                  style={{ borderColor: palette.navy, color: palette.ink }}
                />

                <button
                  type="button"
                  onClick={() => shiftSelectedDate(1)}
                  disabled={
                    (period === "today"
                      ? todayStr
                      : period === "yesterday"
                        ? yesterdayStr
                        : selectedDate) >= todayStr
                  }
                  className="px-2.5 py-1.5 text-xs font-bold border-2 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                  style={{ borderColor: palette.line, color: palette.ink }}
                  title="Next Day"
                >
                  Next Day
                  <ChevronRight size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded bg-slate-800 text-white hover:bg-slate-900 flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Print Daily Sales Report"
                >
                  <Printer size={13} />
                  Print DSR
                </button>
              </div>
            </div>
          )}

          {/* KPI Snapshot Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="text-xs text-slate-500 font-semibold flex items-center justify-between">
                <span>Gross Turnover</span>
                <Coins size={14} className="text-emerald-600" />
              </div>
              <div className="text-xl font-black mt-1 text-emerald-700">
                ₹{money(totalSalesRevenue)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {filteredBills.length} invoices recorded
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="text-xs text-slate-500 font-semibold flex items-center justify-between">
                <span>Cases Distributed</span>
                <Package size={14} className="text-sky-700" />
              </div>
              <div className="text-xl font-black mt-1 text-sky-700">
                {totalCasesSold}{" "}
                <span className="text-xs font-normal text-slate-500">
                  crates
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Avg{" "}
                {filteredBills.length > 0
                  ? (totalCasesSold / filteredBills.length).toFixed(1)
                  : 0}{" "}
                cs / bill
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="text-xs text-slate-500 font-semibold flex items-center justify-between">
                <span>Paid on These Invoices</span>
                <CheckCircle2 size={14} className="text-sky-600" />
              </div>
              <div className="text-xl font-black mt-1 text-sky-700">
                ₹{money(totalSalesPaid)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {totalSalesRevenue > 0
                  ? `${((totalSalesPaid / totalSalesRevenue) * 100).toFixed(0)}% recovery rate`
                  : "No revenue"}
              </div>
              {receiptsGap && (
                <div
                  className="text-[10px] text-amber-700 mt-1 leading-snug"
                  title="Payments & Collections counts every receipt by the date it was received. This card counts only what is paid on the invoices listed here. The difference is explained below."
                >
                  Receipts total ₹{money(paymentStats.totalCollected)}
                  {receiptsGap.advance > 0.5 && ` · ₹${money(receiptsGap.advance)} advance`}
                  {receiptsGap.noInvoice > 0.5 && ` · ₹${money(receiptsGap.noInvoice)} old dues`}
                  {receiptsGap.refunds < -0.5 && ` · −₹${money(-receiptsGap.refunds)} refunds`}
                  {receiptsGap.other > 0.5 || receiptsGap.other < -0.5
                    ? ` · ₹${money(receiptsGap.other)} other timing`
                    : ""}
                </div>
              )}
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="text-xs text-slate-500 font-semibold flex items-center justify-between">
                <span>Pending Market Credit</span>
                <AlertTriangle
                  size={14}
                  className={
                    totalSalesOutstanding > 0
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }
                />
              </div>
              <div
                className={`text-xl font-black mt-1 ${totalSalesOutstanding > 0 ? "text-rose-700" : "text-emerald-700"}`}
              >
                ₹{money(totalSalesOutstanding)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Market receivables due
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm col-span-2 lg:col-span-1">
              <div className="text-xs text-slate-500 font-semibold flex items-center justify-between">
                <span>Trade Schemes Given</span>
                <Tag size={14} className="text-amber-600" />
              </div>
              <div className="text-xl font-black mt-1 text-amber-700">
                {totalFreeCasesGiven}{" "}
                <span className="text-xs font-normal text-slate-500">
                  free cs
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                ₹{money(totalDiscountsGiven)} discounts applied
              </div>
            </div>
          </div>

          {/* Sales Sub-Tabs Navigation */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3"
            style={{ borderColor: palette.line }}
          >
            <div
              className="flex rounded-xl border-2 p-1 bg-slate-100/90 gap-1 w-fit"
              style={{ borderColor: palette.line }}
            >
              <button
                type="button"
                id="btn-sales-subtab-daywise"
                onClick={() => setSalesReportSubTab("daywise")}
                className={`px-3.5 py-1.5 text-xs font-black rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
                  salesReportSubTab === "daywise"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-700 hover:text-slate-900"
                }`}
              >
                <Calendar size={13} />
                <span>
                  Day-Wise Sales Register ({dayWiseSalesSummary.length} Days)
                </span>
              </button>

              <button
                type="button"
                id="btn-sales-subtab-bills"
                onClick={() => setSalesReportSubTab("bills")}
                className={`px-3.5 py-1.5 text-xs font-black rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
                  salesReportSubTab === "bills"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-700 hover:text-slate-900"
                }`}
              >
                <Receipt size={13} />
                <span>Invoicing Register ({filteredBills.length} Bills)</span>
              </button>

              <button
                type="button"
                id="btn-sales-subtab-skus"
                onClick={() => setSalesReportSubTab("skus")}
                className={`px-3.5 py-1.5 text-xs font-black rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
                  salesReportSubTab === "skus"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-700 hover:text-slate-900"
                }`}
              >
                <Package size={13} />
                <span>
                  Product & SKU Dispatches ({productWiseSales.length})
                </span>
              </button>
            </div>

            <span className="hidden sm:inline text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded border border-sky-200 w-fit">
              Latest first
            </span>
          </div>

          {/* Sub-Tab 1: Day-Wise Sales Breakdown (Latest Day on Top) */}
          {salesReportSubTab === "daywise" && (
            <div
              className="border-2 p-3 sm:p-5 rounded space-y-4 bg-white"
              style={cardStyle}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] sm:text-base" style={{ fontWeight: 700, color: palette.ink }}>
                      Day-Wise Sales & Collections Register
                    </h3>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-500">
                  {dayWiseSalesSummary.length} Sales Days Recorded
                </span>
              </div>

              {dayWiseSalesSummary.length === 0 ? (
                <EmptyState
                  compact
                  icon={Receipt}
                  title="No sales transactions found"
                  description="No sales transactions found for this period."
                />
              ) : (
                <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left data-table" style={fz(13)}>
                    <thead>
                      <tr
                        className="border-b-2 text-xs uppercase tracking-wider text-slate-500 bg-slate-50/60"
                        style={{ borderColor: palette.line }}
                      >
                        <th className="px-3 py-2.5 font-bold">Sales / Collection Date</th>
                        <th className="px-3 py-2.5 font-bold text-center">
                          Transactions
                        </th>
                        <th className="px-3 py-2.5 font-bold text-right">
                          Billed Crates
                        </th>
                        <th className="px-3 py-2.5 font-bold text-right">
                          Free Scheme
                        </th>
                        <th className="px-3 py-2.5 font-bold text-right">
                          Gross Sales (₹)
                        </th>
                        <th className="px-3 py-2.5 font-bold text-right">
                          Money in Hand (₹)
                        </th>
                        <th className="px-3 py-2.5 font-bold text-right">
                          Due on Date (₹)
                        </th>
                        <th className="px-3 py-2.5 font-bold text-center">
                          Status
                        </th>
                        <th className="px-3 py-2.5 font-bold text-center no-print">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayWiseSalesSummary.map((day) => {
                        const isExpanded = expandedSalesDay === day.date;
                        const isToday = day.date === todayStr;
                        const isYesterday = day.date === yesterdayStr;

                        return (
                          <React.Fragment key={day.date}>
                            <tr
                              className={`border-b last:border-b-0 hover:bg-slate-50/70 transition-colors ${
                                isExpanded ? "bg-sky-50/40" : ""
                              }`}
                              style={{ borderColor: palette.line }}
                            >
                              <td className="px-3 py-3 font-semibold text-slate-900">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono">{day.date}</span>
                                  {isToday && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      Today
                                    </span>
                                  )}
                                  {isYesterday && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 text-sky-800 border border-sky-200">
                                      Yesterday
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-500 font-normal block mt-0.5">
                                  {formatFriendlyDate(day.date)}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <div className="flex flex-col items-center">
                                  <span className="font-bold text-slate-800 text-xs">
                                    {day.transactions.length} tx
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {day.billCount} bills
                                    {day.paymentCount > 0 ? ` · ${day.paymentCount} payments` : ""}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right font-bold text-sky-700 tabular-nums">
                                {day.casesSold > 0 ? `${day.casesSold} cs` : "—"}
                              </td>
                              <td className="px-3 py-3 text-right font-medium text-amber-700 tabular-nums">
                                {day.freeCases > 0
                                  ? `+${day.freeCases} cs`
                                  : "—"}
                              </td>
                              <td className="px-3 py-3 text-right font-black text-slate-900 font-mono">
                                ₹{money(day.totalRevenue)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono">
                                <div className="font-black text-emerald-700 text-sm">
                                  ₹{money(day.moneyInHand)}
                                </div>
                                {day.pastDueCollected > 0 && day.upfrontCollected > 0 && (
                                  <span className="text-[10px] text-slate-500 font-normal block">
                                    ₹{money(day.upfrontCollected)} upfront + ₹{money(day.pastDueCollected)} past
                                  </span>
                                )}
                                {day.pastDueCollected > 0 && day.upfrontCollected === 0 && (
                                  <span className="text-[10px] text-amber-800 font-medium block">
                                    past dues collected
                                  </span>
                                )}
                              </td>
                              <td
                                className={`px-3 py-3 text-right font-black font-mono text-sm ${day.dueOnDate > 0 ? "text-rose-700" : "text-slate-400"}`}
                              >
                                <div>₹{money(day.dueOnDate)}</div>
                                {day.settledLaterAmount > 0 && (
                                  <span className="text-[10px] text-emerald-700 font-semibold block">
                                    ₹{money(day.settledLaterAmount)} settled later
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {day.totalRevenue > 0 && day.dueOnDate <= 0 ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    100% Upfront
                                  </span>
                                ) : day.dueOnDate > 0 && day.currentBalanceDue <= 0 ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    Fully Settled
                                  </span>
                                ) : day.settledLaterAmount > 0 && day.currentBalanceDue > 0 ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-sky-800 border border-sky-200">
                                    Partially Settled
                                  </span>
                                ) : day.dueOnDate > 0 && day.settledLaterAmount === 0 ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                    Credit Due
                                  </span>
                                ) : day.totalRevenue === 0 && day.moneyInHand > 0 ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    Collection Only
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-xs">—</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-center no-print">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedSalesDay(
                                        isExpanded ? null : day.date,
                                      )
                                    }
                                    className="px-2.5 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-50 text-sky-700 flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                                    style={{ borderColor: palette.line }}
                                  >
                                    <span>{isExpanded ? "Hide" : "Details"}</span>
                                    <span className="text-[10px] text-slate-500 font-normal">
                                      ({day.transactions.length})
                                    </span>
                                    {isExpanded ? (
                                      <ChevronDown
                                        size={12}
                                        className="rotate-180"
                                      />
                                    ) : (
                                      <ChevronDown size={12} />
                                    )}
                                  </button>
                                  {day.bills.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedDate(day.date);
                                        setPeriod("customDate");
                                      }}
                                      className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-sky-700 hover:underline cursor-pointer"
                                      title="Open Daily Sales Report (DSR) for this date"
                                    >
                                      DSR
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Unified Merged Daily Transactions Drawer */}
                            {isExpanded && (
                              <tr className="bg-slate-50/80">
                                <td colSpan={9} className="p-3 sm:p-4">
                                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-sm">
                                    {/* Top Header & Daily KPI Bar */}
                                    <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b">
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Receipt size={16} className="text-sky-600" />
                                          <h4 className="font-black text-sm text-slate-900">
                                            Daily Transactions on {formatFriendlyDate(day.date)}
                                          </h4>
                                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                            {day.transactions.length} Transactions
                                          </span>
                                        </div>
                                        <p className="hidden sm:block text-xs text-slate-500">
                                          One unified line for each transaction: invoices billed and payments collected for past dues.
                                        </p>
                                      </div>

                                      {/* Money in Hand & Due on Date Summary Cards */}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <div className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-right">
                                          <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                                            Money in Hand (Today)
                                          </span>
                                          <span className="font-black text-emerald-700 font-mono text-base">
                                            ₹{money(day.moneyInHand)}
                                          </span>
                                          <span className="text-[10px] text-emerald-600 font-medium block">
                                            ₹{money(day.upfrontCollected)} upfront
                                            {day.pastDueCollected > 0 && ` + ₹${money(day.pastDueCollected)} past dues`}
                                          </span>
                                        </div>

                                        <div className="px-3.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-right">
                                          <span className="text-[10px] uppercase font-bold text-rose-800 block">
                                            Due on Date
                                          </span>
                                          <span className="font-black text-rose-700 font-mono text-base">
                                            ₹{money(day.dueOnDate)}
                                          </span>
                                          <span className="text-[10px] text-rose-600 font-medium block">
                                            {day.settledLaterAmount > 0
                                              ? `₹${money(day.settledLaterAmount)} settled later`
                                              : day.dueOnDate > 0
                                                ? "Credit balance"
                                                : "Zero due"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Unified Single Transactions Table */}
                                    <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b text-[10.5px] uppercase font-bold text-slate-500 bg-slate-50">
                                            <th className="px-3 py-2 text-left">Ref # / Time</th>
                                            <th className="px-3 py-2 text-left">Type</th>
                                            <th className="px-3 py-2 text-left">Retailer Party</th>
                                            <th className="px-3 py-2 text-left">Transaction Details</th>
                                            <th className="px-3 py-2 text-right">Billed (₹)</th>
                                            <th className="px-3 py-2 text-right">Money in Hand (₹)</th>
                                            <th className="px-3 py-2 text-right">Due on Date (₹)</th>
                                            <th className="px-3 py-2 text-left">Payment / Upfront Info</th>
                                            <th className="px-3 py-2 text-center">Action</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {day.transactions.map((tx) => (
                                            <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="px-3 py-2.5 font-mono">
                                                <span className="font-bold text-slate-900 block">{tx.refNo}</span>
                                                <span className="text-[10.5px] text-slate-500">{tx.time}</span>
                                              </td>
                                              <td className="px-3 py-2.5">
                                                {tx.type === "bill" && (
                                                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 text-sky-800 border border-sky-300 inline-block">
                                                    Invoice Billed
                                                  </span>
                                                )}
                                                {tx.type === "past_due_payment" && (
                                                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 inline-block">
                                                    Payment
                                                  </span>
                                                )}
                                                {tx.type === "advance_payment" && (
                                                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-300 inline-block">
                                                    Advance
                                                  </span>
                                                )}
                                                {tx.type === "refund" && (
                                                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-300 inline-block">
                                                    Refund
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2.5">
                                                <span className="font-semibold text-slate-900 block">{tx.partyName}</span>
                                                {tx.partyPhone && (
                                                  <span className="text-[10.5px] text-slate-500 font-mono">{tx.partyPhone}</span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2.5">
                                                <span className="text-slate-800">{tx.details}</span>
                                                {tx.clearedLaterNote && (
                                                  <span className="block text-[10.5px] text-amber-700 font-semibold mt-0.5">
                                                    {tx.clearedLaterNote}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                                                {tx.billedAmount !== null ? `₹${money(tx.billedAmount)}` : "—"}
                                              </td>
                                              <td className="px-3 py-2.5 text-right font-mono font-bold">
                                                {tx.moneyInHand > 0 ? (
                                                  <span className="text-emerald-700">₹{money(tx.moneyInHand)}</span>
                                                ) : tx.moneyInHand < 0 ? (
                                                  <span className="text-rose-700">-₹{money(Math.abs(tx.moneyInHand))}</span>
                                                ) : (
                                                  <span className="text-slate-400 font-normal">₹0</span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2.5 text-right font-mono font-bold">
                                                {tx.dueOnDate !== null ? (
                                                  tx.dueOnDate > 0 ? (
                                                    <span className="text-rose-700">₹{money(tx.dueOnDate)}</span>
                                                  ) : (
                                                    <span className="text-emerald-700">₹0</span>
                                                  )
                                                ) : (
                                                  <span className="text-slate-400 font-normal">—</span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2.5">
                                                {tx.upfrontNote && (
                                                  <span
                                                    className={`text-xs font-semibold block ${
                                                      tx.dueOnDate === 0
                                                        ? "text-emerald-700"
                                                        : tx.moneyInHand > 0
                                                          ? "text-blue-700"
                                                          : "text-rose-700"
                                                    }`}
                                                  >
                                                    {tx.upfrontNote}
                                                  </span>
                                                )}
                                                {tx.type === "past_due_payment" && (
                                                  <div>
                                                    <span className="text-xs font-semibold text-emerald-800 block">
                                                      Only Payment (Past Due Settled)
                                                    </span>
                                                    <span className="text-[10.5px] text-slate-500 uppercase">
                                                      Via {tx.paymentMode}
                                                    </span>
                                                  </div>
                                                )}
                                                {tx.type === "advance_payment" && (
                                                  <span className="text-xs font-semibold text-indigo-800 block">
                                                    Advance Receipt (Via {tx.paymentMode.toUpperCase()})
                                                  </span>
                                                )}
                                                {tx.type === "refund" && (
                                                  <span className="text-xs font-semibold text-rose-800 block">
                                                    Refund Issued
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2.5 text-center">
                                                {tx.bill ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => setViewingBill(tx.bill!)}
                                                    className="px-2.5 py-1 text-[11px] font-bold border rounded bg-white hover:bg-slate-100 text-sky-700 cursor-pointer shadow-xs"
                                                  >
                                                    View Bill
                                                  </button>
                                                ) : (
                                                  <span className="text-slate-400 text-xs">—</span>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr
                        className="border-t-2 bg-slate-100/90 font-black text-xs"
                        style={{ borderColor: palette.line }}
                      >
                        <td className="px-3 py-2.5 text-slate-900" colSpan={2}>
                          TOTALS ({dayWiseSalesSummary.length} Sales Days)
                        </td>
                        <td className="px-3 py-2.5 text-right text-blue-950 text-sm">
                          {totalCasesSold} cs
                        </td>
                        <td className="px-3 py-2.5 text-right text-amber-800">
                          +{totalFreeCasesGiven} cs
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-950 text-sm">
                          ₹{money(totalDayWiseRevenue)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-900 text-sm">
                          ₹{money(totalDayWiseCollected)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-rose-900 text-sm">
                          ₹{money(totalDayWiseOutstanding)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-center text-slate-600"
                          colSpan={2}
                        >
                          {totalDayWiseRevenue > 0
                            ? `${((totalDayWiseCollected / totalDayWiseRevenue) * 100).toFixed(0)}% Recovery`
                            : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Sub-Tab 2: SKU-Wise / Beverage Dispatches Summary */}
          {salesReportSubTab === "skus" && (
            <div className="border-2 p-3 sm:p-5 rounded space-y-4" style={cardStyle}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 style={fz(16, { fontWeight: 700, color: palette.ink })}>
                      Product & Beverage Dispatches
                    </h3>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border">
                      {productWiseSales.length} SKUs Sold
                    </span>
                  </div>
                  <p className="hidden sm:block" style={fz(12.5, { color: palette.muted })}>
                    Crate-level breakdown of beverages sold, schemes dispensed,
                    and revenue per SKU.
                  </p>
                </div>

                {productWiseSales.length > 5 && (
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      placeholder="Search SKU..."
                      value={skuSearchQuery}
                      onChange={(e) => setSkuSearchQuery(e.target.value)}
                      className="border-2 pl-8 pr-3 py-1 rounded text-xs"
                      style={{ borderColor: palette.line, color: palette.ink }}
                    />
                  </div>
                )}
              </div>

              {productWiseSales.length === 0 ? (
                <EmptyState
                  compact
                  icon={Package}
                  title="No product dispatches found"
                  description="No product dispatches found for this selection."
                />
              ) : (
                <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left data-table" style={fz(13)}>
                    <thead>
                      <tr
                        className="border-b-2 text-xs uppercase tracking-wider text-slate-500 bg-slate-50/60"
                        style={{ borderColor: palette.line }}
                      >
                        <th className="px-3 py-2 font-bold">Beverage SKU</th>
                        <th className="px-3 py-2 font-bold">Category</th>
                        <th className="px-3 py-2 font-bold text-center">
                          Invoices
                        </th>
                        <th className="px-3 py-2 font-bold text-right">
                          Billed Cases
                        </th>
                        <th className="px-3 py-2 font-bold text-right">
                          Free Cases
                        </th>
                        <th className="px-3 py-2 font-bold text-right">
                          Total Crates
                        </th>
                        <th className="px-3 py-2 font-bold text-right">
                          Gross (₹)
                        </th>
                        <th className="px-3 py-2 font-bold text-right">
                          Discounts (₹)
                        </th>
                        <th className="px-3 py-2 font-bold text-right">
                          Net Sales (₹)
                        </th>
                        <th className="px-3 py-2 font-bold text-right text-sky-900">
                          Avg Sell / cs (Method 2)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {productWiseSales
                        .filter(
                          (p) =>
                            !skuSearchQuery ||
                            p.productName
                              .toLowerCase()
                              .includes(skuSearchQuery.toLowerCase()) ||
                            p.category
                              .toLowerCase()
                              .includes(skuSearchQuery.toLowerCase()),
                        )
                        .map((p) => {
                          const cat = CATS[p.category as keyof typeof CATS];
                          const avgSellMethod2 = p.casesBilled > 0 ? p.netRevenue / p.casesBilled : 0;
                          return (
                            <tr
                              key={p.productId}
                              className="border-b last:border-b-0 hover:bg-slate-50/60 transition-colors"
                              style={{ borderColor: palette.line }}
                            >
                              <td className="px-3 py-2.5 font-bold text-slate-900">
                                {p.productName}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-sky-50 text-sky-700 border border-sky-200">
                                  {cat?.name || p.category}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                                {p.invoicesCount}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium">
                                {p.casesBilled} cs
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium text-amber-700">
                                {p.casesFree > 0 ? `+${p.casesFree} cs` : "—"}
                              </td>
                              <td
                                className="px-3 py-2.5 text-right font-black"
                                style={{ color: palette.navy }}
                              >
                                {p.totalCases} cs
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-600">
                                ₹{money(p.grossRevenue)}
                              </td>
                              <td className="px-3 py-2.5 text-right text-amber-700">
                                {p.discounts > 0
                                  ? `-₹${money(p.discounts)}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right font-black text-emerald-800">
                                ₹{money(p.netRevenue)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold text-sky-950">
                                ₹{money(avgSellMethod2)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot>
                      <tr
                        className="border-t-2 bg-slate-100/80 font-black text-xs"
                        style={{ borderColor: palette.line }}
                      >
                        <td className="px-3 py-2.5 text-slate-900" colSpan={3}>
                          TOTAL DISPATCHES ({productWiseSales.length} SKUs)
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {productWiseSales.reduce(
                            (s, p) => s + p.casesBilled,
                            0,
                          )}{" "}
                          cs
                        </td>
                        <td className="px-3 py-2.5 text-right text-amber-800">
                          +
                          {productWiseSales.reduce(
                            (s, p) => s + p.casesFree,
                            0,
                          )}{" "}
                          cs
                        </td>
                        <td className="px-3 py-2.5 text-right text-blue-950 text-sm">
                          {totalCasesSold} cs
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          ₹
                          {money(
                            productWiseSales.reduce(
                              (s, p) => s + p.grossRevenue,
                              0,
                            ),
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-amber-800">
                          -₹{money(totalDiscountsGiven)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-900 text-sm">
                          ₹{money(totalSalesRevenue)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Sub-Tab 3: Sales & Invoicing Register Table */}
          {salesReportSubTab === "bills" && (
            <div className="border-2 p-3 sm:p-5 rounded space-y-4" style={cardStyle}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 style={fz(16, { fontWeight: 700, color: palette.ink })}>
                    Invoicing Register (Bills)
                  </h3>
                  <p style={fz(12.5, { color: palette.muted })}>
                    Individual tax invoices generated on{" "}
                    {period === "customDate"
                      ? formatFullDate(selectedDate)
                      : period === "today"
                        ? "Today"
                        : period === "yesterday"
                          ? "Yesterday"
                          : period}
                    . Click any invoice to inspect or print.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input enterKeyHint="search"
                      type="text"
                      placeholder="Filter retailer or bill #..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="border-2 pl-8 pr-3 py-1.5 rounded text-xs"
                      style={{ borderColor: palette.line, color: palette.ink }}
                    />
                  </div>
                </div>
              </div>

              {filteredBills.length === 0 ? (
                <EmptyState
                  compact
                  icon={Receipt}
                  title="No invoices found"
                  description="No invoices match this period or filter."
                />
              ) : (
                <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left data-table" style={fz(13)}>
                    <thead>
                      <tr
                        className="border-b-2 text-xs uppercase tracking-wider text-slate-500 bg-slate-50/60"
                        style={{ borderColor: palette.line }}
                      >
                        <th className="px-3 py-2 font-bold"># Invoice</th>
                        <th className="px-3 py-2 font-bold">Date & Time</th>
                        <th className="px-3 py-2 font-bold">Retailer Party</th>
                        <th className="px-3 py-2 font-bold text-right">
                          Crates
                        </th>
                        <th className="px-3 py-2 font-bold text-right">
                          Total Bill
                        </th>
                        <th className="px-3 py-2 font-bold text-right">Paid</th>
                        <th className="px-3 py-2 font-bold text-right">
                          Balance
                        </th>
                        <th className="px-3 py-2 font-bold text-center">
                          Status
                        </th>
                        <th className="px-3 py-2 font-bold text-center no-print">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBills
                        .filter(
                          (b) =>
                            !searchQuery ||
                            b.retailer
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                            String(b.id).includes(searchQuery),
                        )
                        .map((b) => {
                          const bal = billBalance(b);
                          const crates = b.items.reduce((s, i) => s + i.qty, 0);
                          const isPaid = bal <= 0;
                          return (
                            <tr
                              key={b.id}
                              className="border-b last:border-b-0 hover:bg-slate-50/60 transition-colors"
                              style={{ borderColor: palette.line }}
                            >
                              <td className="px-3 py-2.5 font-bold font-mono">
                                <button
                                  type="button"
                                  onClick={() => setViewingBill(b)}
                                  className="text-sky-700 hover:underline cursor-pointer flex items-center gap-1 font-bold"
                                  title="Click to view & print invoice"
                                >
                                  {b.id}
                                </button>
                              </td>
                              <td className="px-3 py-2.5 text-slate-600 text-xs">
                                {b.date}
                              </td>
                              <td className="px-3 py-2.5 font-semibold text-slate-900">
                                {b.retailer}
                                {b.phone && (
                                  <span className="block text-[11px] text-slate-500 font-normal">
                                    Ph: {b.phone}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium">
                                {crates} cs
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                                ₹{money(b.total)}
                              </td>
                              <td className="px-3 py-2.5 text-right text-emerald-700 font-medium">
                                ₹{money(b.amountPaid)}
                              </td>
                              <td
                                className={`px-3 py-2.5 text-right font-bold ${
                                  bal > 0 ? "text-rose-700" : "text-emerald-700"
                                }`}
                              >
                                ₹{money(bal)}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10.5px] font-bold uppercase ${
                                    isPaid
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {isPaid ? "Paid" : "Due"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center no-print">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setViewingBill(b)}
                                    className="px-2 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-100 text-sky-700 flex items-center gap-1 cursor-pointer transition-colors"
                                    style={{ borderColor: palette.line }}
                                    title="View Tax Invoice"
                                  >
                                    <Eye size={12} />
                                    <span>View</span>
                                  </button>
                                  <WhatsAppButton
                                    bill={b}
                                    id={`wa-report-${b.id}`}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot>
                      <tr
                        className="border-t-2 bg-slate-100/80 font-black text-xs"
                        style={{ borderColor: palette.line }}
                      >
                        <td className="px-3 py-2.5 text-slate-900" colSpan={3}>
                          TOTAL BILLS ({filteredBills.length} Invoices)
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {totalCasesSold} cs
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-900">
                          ₹{money(totalSalesRevenue)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-800">
                          ₹{money(totalSalesPaid)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-rose-800">
                          ₹{money(totalSalesOutstanding)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-center text-slate-500"
                          colSpan={2}
                        >
                          {totalSalesRevenue > 0
                            ? `${((totalSalesPaid / totalSalesRevenue) * 100).toFixed(0)}% Settled`
                            : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. PAYMENTS & DATEWISE COLLECTIONS REPORT                */}
      {/* ======================================================== */}
      {activeReport === "margin" && (
        <SalesMarginPnLReport
          dateInPeriod={(d: string) => {
            if (period === "all") return true;
            if (period === "customDate") return d === selectedDate;
            if (period === "today") return d === todayStr;
            if (period === "yesterday") return d === yesterdayStr;
            if (period === "last7") return d >= sevenDaysAgoStr && d <= todayStr;
            if (period === "thisMonth") return d.startsWith(currentYearMonth);
            if (period === "lastMonth") return d.startsWith(lastYearMonth);
            if (period === "customRange")
              return (!startDate || d >= startDate) && (!endDate || d <= endDate);
            return true;
          }}
          filteredBills={filteredBills}
          products={products}
          gstTaxSummary={gstTaxSummary}
          purchaseStats={purchaseStats}
          periodLabel={
            period === "customDate"
              ? selectedDate
              : period === "today"
                ? "Today"
                : period === "yesterday"
                  ? "Yesterday"
                  : period === "customRange"
                    ? `${startDate || "…"} → ${endDate || "…"}`
                    : period === "last7"
                      ? "Last 7 days"
                      : period === "thisMonth"
                        ? "This month"
                        : period === "lastMonth"
                          ? "Last month"
                          : period === "all"
                            ? "All time"
                            : String(period)
          }
        />
      )}

      {activeReport === "netProfit" && (
        <NetProfitReport
          dateInPeriod={(d: string) => {
            if (period === "all") return true;
            if (period === "customDate") return d === selectedDate;
            if (period === "today") return d === todayStr;
            if (period === "yesterday") return d === yesterdayStr;
            if (period === "last7") return d >= sevenDaysAgoStr && d <= todayStr;
            if (period === "thisMonth") return d.startsWith(currentYearMonth);
            if (period === "lastMonth") return d.startsWith(lastYearMonth);
            if (period === "customRange")
              return (!startDate || d >= startDate) && (!endDate || d <= endDate);
            return true;
          }}
          // Net profit must use EVERY bill of the period. The paid / due filter only narrows sales &
          // receivable views; expenses, write-offs and credits are never narrowed by it.
          filteredBills={periodBills}
          products={products}
          gstTaxSummary={gstTaxSummary}
          purchaseStats={purchaseStats}
          periodLabel={
            period === "customDate"
              ? selectedDate
              : period === "today"
                ? "Today"
                : period === "yesterday"
                  ? "Yesterday"
                  : period === "customRange"
                    ? `${startDate || "…"} → ${endDate || "…"}`
                    : period === "last7"
                      ? "Last 7 days"
                      : period === "thisMonth"
                        ? "This month"
                        : period === "lastMonth"
                          ? "Last month"
                          : period === "all"
                            ? "All time"
                            : String(period)
          }
        />
      )}

      {activeReport === "dispositions" && (
        <DispositionsReport
          period={period}
          selectedDate={selectedDate}
          startDate={startDate}
          endDate={endDate}
          todayStr={todayStr}
          yesterdayStr={yesterdayStr}
          sevenDaysAgoStr={sevenDaysAgoStr}
          currentYearMonth={currentYearMonth}
          lastYearMonth={lastYearMonth}
          periodLabel={
            period === "customDate"
              ? selectedDate
              : period === "today"
                ? "Today"
                : period === "yesterday"
                  ? "Yesterday"
                  : period === "customRange"
                    ? `${startDate || "…"} → ${endDate || "…"}`
                    : period === "last7"
                      ? "Last 7 days"
                      : period === "thisMonth"
                        ? "This month"
                        : period === "lastMonth"
                          ? "Last month"
                          : period === "all"
                            ? "All time"
                            : String(period)
          }
        />
      )}

      {/* ======================================================== */}
      {/* 3. INVENTORY & VALUATION REPORT                          */}
      {/* ======================================================== */}
      {activeReport === "inventory" && (
        <InventoryReport
          inventoryStats={inventoryStats}
          products={products}
          remainingStock={remainingStock}
          expiryRadar={expiryRadar}
        />
      )}

      {/* ======================================================== */}
      {/* 3. INWARD & PURCHASES REPORT                             */}
      {/* ======================================================== */}
      {activeReport === "purchases" && (
        <PurchasesReport
          purchaseStats={purchaseStats}
          filteredGrns={filteredGrns}
          warehouses={warehouses}
          period={period}
          onNavigateInventory={() => setTab("inventory")}
        />
      )}

      {/* ======================================================== */}
      {/* 4. RECEIVABLES & DEBTOR AGING                            */}
      {/* ======================================================== */}
      {activeReport === "receivables" && (
        <ReceivablesReport
          debtorsLedger={debtorsLedger}
          orgProfile={orgProfile}
          onRecordPayment={(retailer) => {
            setModalCustomerName(retailer);
            setModalBillId(undefined);
            setModalEditingPayment(null);
            setIsRecordPaymentModalOpen(true);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* 5. VEHICLE TRIPS & DISCREPANCY RECONCILIATION            */}
      {/* ======================================================== */}
      {activeReport === "trips" && (
        <TripsReport
          filteredTrips={filteredTrips}
          tripBreakdown={tripBreakdown}
          period={period}
          warehouses={warehouses}
          onNavigateTrips={() => setTab("trips")}
        />
      )}

      {/* ======================================================== */}
      {/* 6. GST TAX & COMPLIANCE SUMMARY                          */}
      {/* ======================================================== */}
      {activeReport === "tax" && (
        <TaxReport
          gstTaxSummary={gstTaxSummary}
          purchaseStats={purchaseStats}
          filteredBills={periodBills}
          filteredGrns={filteredGrns}
          products={products}
          customers={customers || []}
          orgProfile={orgProfile}
          invoicePrefix={billingSettings?.invoicePrefix || "INV"}
          periodLabel={
            period === "thisMonth"
              ? currentYearMonth
              : period === "lastMonth"
                ? lastYearMonth
                : period === "customRange" && startDate && endDate
                  ? `${startDate}_to_${endDate}`
                  : period === "today"
                    ? todayStr
                    : period
          }
        />
      )}

      {/* ======================================================== */}
      {/* 7. SUPPLIER & PRODUCT PROFIT (Supplier Schemes system)   */}
      {/* ======================================================== */}
      {activeReport === "supplierProfit" && <SupplierProductProfitReport />}

      {(activeReport === "daybook" || activeReport === "payments") && (
        <DailyCollectionReport
          onRecordPayment={() => {
            setModalCustomerName(undefined);
            setModalBillId(undefined);
            setModalEditingPayment(null);
            setIsRecordPaymentModalOpen(true);
          }}
          onEditPayment={(p) => {
            setModalEditingPayment(p);
            setIsRecordPaymentModalOpen(true);
          }}
          dateInPeriod={(d: string) => {
            if (period === "all") return true;
            if (period === "customDate") return d === selectedDate;
            if (period === "today") return d === todayStr;
            if (period === "yesterday") return d === yesterdayStr;
            if (period === "last7") return d >= sevenDaysAgoStr && d <= todayStr;
            if (period === "thisMonth") return d.startsWith(currentYearMonth);
            if (period === "lastMonth") return d.startsWith(lastYearMonth);
            if (period === "customRange")
              return (!startDate || d >= startDate) && (!endDate || d <= endDate);
            return true;
          }}
          periodLabel={
            period === "customDate"
              ? selectedDate
              : period === "today"
                ? "Today"
                : period === "yesterday"
                  ? "Yesterday"
                  : period === "customRange"
                    ? `${startDate || "…"} → ${endDate || "…"}`
                    : period === "last7"
                      ? "Last 7 days"
                      : period === "thisMonth"
                        ? "This month"
                        : period === "lastMonth"
                          ? "Last month"
                          : "All time"
          }
        />
      )}

      {activeReport === "beats" && (
        <BeatSalesDueReport periodLabel={reportPeriodText} inPeriod={reportInPeriod} />
      )}

      {/* Tax Invoice Modal for viewing full bill details & printing */}
      {viewingBill && (
        <TaxInvoiceModal
          bill={viewingBill}
          onClose={() => setViewingBill(null)}
        />
      )}

      {/* Record / Edit Payment Modal */}
      <RecordPaymentModal
        isOpen={isRecordPaymentModalOpen}
        onClose={() => {
          setIsRecordPaymentModalOpen(false);
          setModalCustomerName(undefined);
          setModalBillId(undefined);
          setModalEditingPayment(null);
        }}
        initialCustomerName={modalCustomerName}
        initialBillId={modalBillId}
        paymentToEdit={modalEditingPayment}
        existingCustomers={existingCustomersList}
        bills={bills}
        palette={palette}
        onSavePayment={({
          paymentId,
          customerName,
          billId,
          amount,
          paymentDate,
          mode,
          referenceNote,
        }) => {
          if (paymentId) {
            const existing = payments.find((p) => p.id === paymentId);
            if (existing) {
              updatePayment({
                ...existing,
                customerName,
                billId,
                amount,
                paymentDate,
                mode,
                referenceNote,
              });
            }
          } else {
            recordCustomerPayment(
              customerName,
              amount,
              paymentDate,
              mode,
              referenceNote,
              billId,
            );
          }
          setIsRecordPaymentModalOpen(false);
          setModalCustomerName(undefined);
          setModalBillId(undefined);
          setModalEditingPayment(null);
        }}
      />
    </div>
  );
};
