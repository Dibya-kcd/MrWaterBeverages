import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  X,
  Calendar,
  Check,
} from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import { useBeats } from "../../hooks/useBeats";
import {
  Bill,
  PaymentRecord,
} from "../../types";
import { TaxInvoiceModal } from "../common/TaxInvoiceModal";
import { RecordPaymentModal } from "../common/RecordPaymentModal";
import { InventoryReport } from "./reports/InventoryReport";
import { PurchasesReport } from "./reports/PurchasesReport";
import { ReceivablesReport } from "./reports/ReceivablesReport";
import { TripsReport } from "./reports/TripsReport";
import { TaxReport } from "./reports/TaxReport";
import { SalesMarginPnLReport } from "./reports/SalesMarginPnLReport";
import { BeatSalesDueReport } from "./reports/BeatSalesDueReport";
import { CustomerReceiptsReport } from "./reports/CustomerReceiptsReport";
import { DispositionsReport } from "./reports/DispositionsReport";
import {
  type ReportSection,
} from "./reports/ReportSectionTabs";
import { billBalance, billNetTotal } from "../../utils/salesReturns";
import { todayISO, toLocalISODate } from "../../utils/dateLocal";
import {
  computeGstr3b,
  orgStateCodeFromProfile,
  safeGstSummaryFromBills,
  itcReversalFromDispositions,
} from "../../utils/gstReports";
import { money, resolveProductGstRate } from "../../utils/billing";

// High-fidelity components matching user mock images
import { ReportsOverview } from "./reports/ReportsOverview";
import { ReportsMobileHome } from "./reports/ReportsMobileHome";
import { DailyCollectionStreamlined } from "./reports/DailyCollectionStreamlined";
import { ReportShareMenu } from "./reports/ReportShareMenu";
import { ReportCatalogGrid } from "./reports/ReportCatalogGrid";

export type { ReportSection } from "./reports/ReportSectionTabs";
export type { ReportPeriod } from "./reports/reportPeriod";
import type { ReportPeriod } from "./reports/reportPeriod";

export const STANDARD_PERIOD_OPTIONS: { id: ReportPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "thisMonth", label: "This month" },
  { id: "all", label: "All time" },
];

export const ReportsView: React.FC = () => {
  const {
    products,
    bills,
    grns,
    warehouses,
    inventoryBatches,
    trips,
    remainingStock,
    tripBreakdown,
    orgProfile,
    palette,
    setTab,
    payments,
    recordCustomerPayment,
    updatePayment,
    customers,
    existingCustomers,
    billingSettings,
    inventoryDispositions,
  } = useLedger();
  const { activeBeats } = useBeats();

  // Active report section — defaults to 'overview' (Desktop mock image)
  const [activeReport, setActiveReport] = useState<ReportSection>("overview");

  const [period, setPeriod] = useState<ReportPeriod>(() => {
    const saved = sessionStorage.getItem("reports_period");
    if (saved) {
      sessionStorage.removeItem("reports_period");
      return saved as ReportPeriod;
    }
    return "thisMonth";
  });

  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [mobilePeriodOpen, setMobilePeriodOpen] = useState(false);

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
  const [endDate, setEndDate] = useState<string>(() => todayISO());

  const [viewingBill, setViewingBill] = useState<Bill | null>(null);

  // Record / Edit Payment Modal state
  const [isRecordPaymentModalOpen, setIsRecordPaymentModalOpen] = useState(false);
  const [modalCustomerName, setModalCustomerName] = useState<string | undefined>(undefined);
  const [modalBillId, setModalBillId] = useState<number | undefined>(undefined);
  const [modalEditingPayment, setModalEditingPayment] = useState<PaymentRecord | null>(null);

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

  const reportInPeriod = (d: string) => {
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
  };

  const periodLabel = useMemo(() => {
    if (period === "today") return "Today";
    if (period === "yesterday") return "Yesterday";
    if (period === "last7") return "Last 7 days";
    if (period === "thisMonth") {
      // e.g. "November 2026" so the chip matches the calendar month
      try {
        const [y, m] = currentYearMonth.split("-").map(Number);
        const dt = new Date(y, m - 1, 1);
        return dt.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      } catch {
        return "This month";
      }
    }
    if (period === "lastMonth") {
      try {
        const [y, m] = lastYearMonth.split("-").map(Number);
        const dt = new Date(y, m - 1, 1);
        return dt.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      } catch {
        return "Last month";
      }
    }
    if (period === "customDate") return selectedDate;
    if (period === "customRange") return `${startDate || "…"} → ${endDate || "…"}`;
    return "All time";
  }, [period, selectedDate, startDate, endDate, currentYearMonth, lastYearMonth]);

  // Period-filtered bills
  const periodBills = useMemo(() => {
    return (bills || []).filter((b) => {
      const bDate = (b.date || "").slice(0, 10);
      return reportInPeriod(bDate);
    });
  }, [bills, period, selectedDate, startDate, endDate, todayStr, yesterdayStr, sevenDaysAgoStr, currentYearMonth, lastYearMonth]);

  // Filtered GRNs
  const filteredGrns = useMemo(() => {
    return (grns || []).filter((g) => {
      const gDate = (g.inwardDate || "").slice(0, 10);
      return reportInPeriod(gDate);
    });
  }, [grns, period, selectedDate, startDate, endDate, todayStr, yesterdayStr, sevenDaysAgoStr, currentYearMonth, lastYearMonth]);

  // Filtered Trips
  const filteredTrips = useMemo(() => {
    return (trips || []).filter((t) => {
      const tDate = (t.date || "").slice(0, 10);
      return reportInPeriod(tDate);
    });
  }, [trips, period, selectedDate, startDate, endDate, todayStr, yesterdayStr, sevenDaysAgoStr, currentYearMonth, lastYearMonth]);

  // Inventory Metrics
  const inventoryStats = useMemo(() => {
    let totalCrates = 0;
    let totalCostValuation = 0;
    let totalCostValuationInclGst = 0;
    let totalInputGst = 0;
    let totalSellingValuation = 0;
    let totalSellingValuationExGst = 0;

    (products || []).forEach((p) => {
      const rem = remainingStock(p.id);
      totalCrates += rem;
      const costPrice = p.effectiveCost || p.cost || 0;
      totalCostValuation += rem * costPrice;

      const g = resolveProductGstRate(p);
      const landedWithTax =
        p.landedCostPerCrate && p.landedCostPerCrate > 0
          ? p.landedCostPerCrate
          : costPrice * (1 + g);
      totalCostValuationInclGst += rem * landedWithTax;
      totalInputGst += rem * Math.max(0, landedWithTax - costPrice);

      const sellPrice = p.wholesale || p.retail || costPrice;
      totalSellingValuation += rem * sellPrice;
      const sellExGst = g > 0 ? sellPrice / (1 + g) : sellPrice;
      totalSellingValuationExGst += rem * sellExGst;
    });

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

  // Expiry Radar
  const expiryRadar = useMemo(() => {
    const today = new Date();
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(today.getDate() + 30);
    const ninetyDaysAhead = new Date();
    ninetyDaysAhead.setDate(today.getDate() + 90);

    const expired: any[] = [];
    const critical: any[] = [];
    const caution: any[] = [];

    (inventoryBatches || []).forEach((b) => {
      if (!b.expiryDate) return;
      const exp = new Date(b.expiryDate);
      const prod = (products || []).find((p) => p.id === b.productId);
      const item = {
        ...b,
        productName: prod?.name || `Product #${b.productId}`,
      };

      if (exp < today) expired.push(item);
      else if (exp <= thirtyDaysAhead) critical.push(item);
      else if (exp <= ninetyDaysAhead) caution.push(item);
    });

    return { expired, critical, caution };
  }, [inventoryBatches, products]);

  // Purchases Metrics
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
        g.items.reduce((s, i) => s + (i.qty || 0), 0);
      totalGstPaid += g.totalTax || (g.totalCgst || 0) + (g.totalSgst || 0);
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

  // Receivables & Debtors
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

    (bills || []).forEach((b) => {
      const balance = billBalance(b);
      if (balance <= 0) return;

      const key = (b.retailer || "Customer").trim().toLowerCase();
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

      const billTime = new Date(b.date).getTime();
      const daysDiff = Math.floor((now - billTime) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 15) party.aging.current += balance;
      else if (daysDiff <= 30) party.aging.due15 += balance;
      else party.aging.overdue30 += balance;
    });

    return Object.values(partyMap).sort((a, b) => b.balance - a.balance);
  }, [bills]);

  // GST Summary
  const gstTaxSummary = useMemo(() => {
    const computed = safeGstSummaryFromBills(
      periodBills,
      products || [],
      customers || [],
      billingSettings?.invoicePrefix || "INV",
      { orgStateCode: orgStateCodeFromProfile(orgProfile) }
    );
    const itcReversal = itcReversalFromDispositions(
      inventoryDispositions || [],
      reportInPeriod
    );
    const inputGstCredit = Math.max(
      0,
      purchaseStats.totalGstPaid + purchaseStats.totalCessPaid - itcReversal.total
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
      inputGstCredit
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
  }, [periodBills, products, customers, billingSettings, orgProfile, inventoryDispositions, purchaseStats]);

  const existingCustomersList = useMemo(() => {
    return existingCustomers || [];
  }, [existingCustomers]);

  // Report Title helper for breadcrumbs
  const getReportTitle = (id: ReportSection) => {
    switch (id) {
      case "overview":
        return "Overview";
      case "daybook":
        return "Daily collection";
      case "payments":
        return "Customer receipts";
      case "beats":
        return "Beat-wise sales & due";
      case "receivables":
        return "Party credit";
      case "sales":
      case "supplierProfit":
      case "margin":
      case "netProfit":
        return "Sales, Margin & P&L";
      case "inventory":
        return "Inventory & value";
      case "purchases":
        return "Inward & purchases";
      case "dispositions":
        return "Returns, free & claims";
      case "trips":
        return "Vehicle trips";
      case "tax":
        return "GST";
      default:
        return "Reports";
    }
  };

  // Render report content based on activeReport
  const renderActiveReportContent = () => {
    if (activeReport === "overview") {
      return (
        <ReportsOverview
          onNavigateReport={(id) => setActiveReport(id as ReportSection)}
          periodLabel={periodLabel}
          inPeriod={reportInPeriod}
        />
      );
    }

    if (activeReport === "daybook") {
      return (
        <DailyCollectionStreamlined
          periodLabel={periodLabel}
          inPeriod={reportInPeriod}
          onBack={() => setActiveReport("overview")}
          period={period}
          onPeriodChange={(p) => setPeriod(p)}
          startDate={startDate}
          endDate={endDate}
          onCustomRangeChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
            setPeriod("customRange");
          }}
        />
      );
    }

    if (activeReport === "payments") {
      return (
        <CustomerReceiptsReport
          periodLabel={periodLabel}
          inPeriod={reportInPeriod}
        />
      );
    }

    if (activeReport === "beats") {
      return (
        <BeatSalesDueReport
          periodLabel={periodLabel}
          inPeriod={reportInPeriod}
        />
      );
    }

    if (activeReport === "receivables") {
      return (
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
      );
    }

    // Sales / Product profit / Margin / Net Profit — one unified report with sub-tabs.
    if (
      activeReport === "sales" ||
      activeReport === "margin" ||
      activeReport === "supplierProfit" ||
      activeReport === "netProfit"
    ) {
      const initialSubTab =
        activeReport === "supplierProfit"
          ? "products"
          : activeReport === "sales"
            ? "days"
            : activeReport === "netProfit"
              ? "netProfit"
              : "pnl";
      return (
        <SalesMarginPnLReport
          dateInPeriod={reportInPeriod}
          filteredBills={periodBills}
          products={products}
          gstTaxSummary={gstTaxSummary}
          purchaseStats={purchaseStats}
          periodLabel={periodLabel}
          initialSubTab={initialSubTab as any}
        />
      );
    }

    if (activeReport === "inventory") {
      return (
        <InventoryReport
          inventoryStats={inventoryStats}
          products={products}
          remainingStock={remainingStock}
          expiryRadar={expiryRadar}
        />
      );
    }

    if (activeReport === "purchases") {
      return (
        <PurchasesReport
          purchaseStats={purchaseStats}
          filteredGrns={filteredGrns}
          warehouses={warehouses}
          period={period}
          periodLabel={periodLabel}
          onNavigateInventory={() => setTab("inventory")}
        />
      );
    }

    if (activeReport === "dispositions") {
      return (
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
          periodLabel={periodLabel}
        />
      );
    }

    if (activeReport === "trips") {
      return (
        <TripsReport
          filteredTrips={filteredTrips}
          tripBreakdown={tripBreakdown}
          period={period}
          periodLabel={periodLabel}
          warehouses={warehouses}
          onNavigateTrips={() => setTab("trips")}
        />
      );
    }

    if (activeReport === "tax") {
      return (
        <TaxReport
          gstTaxSummary={gstTaxSummary}
          purchaseStats={purchaseStats}
          filteredBills={periodBills}
          filteredGrns={filteredGrns}
          products={products}
          customers={customers || []}
          orgProfile={orgProfile}
          invoicePrefix={billingSettings?.invoicePrefix || "INV"}
          periodLabel={periodLabel}
        />
      );
    }

    return null;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/60 text-slate-900 pb-12">
      {/* ========================================================== */}
      {/* 1. MOBILE VIEW (md:hidden) — Matches Mobile_1x_d887850d.png */}
      {/* ========================================================== */}
      <div className="md:hidden px-4 py-5">
        {activeReport === "overview" ? (
          // Exact Mobile Home Screen with colorful mock matching attached image
          <div className="-mx-4 -my-5">
            <ReportsMobileHome
              onSelectReport={(id) => setActiveReport(id as ReportSection)}
            />
          </div>
        ) : activeReport === "daybook" ? (
          // Daily Collection streamlined phone view matching attached screenshot
          <div className="-mx-4 -my-5">
            {renderActiveReportContent()}
          </div>
        ) : (
          // Sub-report screen matching Daily Collection UI & theme
          <div className="-mx-4 -my-5 min-h-screen bg-gradient-to-b from-[#EBF2FE] via-[#F3F6FD] to-[#F8FAFC] px-4 pt-4 pb-24 space-y-3.5 text-slate-900">
            {/* Top Navigation Row: Back pill on left, sleek period pill on right */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setActiveReport("overview")}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 border border-blue-100/90 text-slate-800 font-bold text-xs shadow-xs hover:bg-white active:scale-95 transition-all cursor-pointer"
              >
                <ArrowLeft size={15} className="text-slate-700" />
                <span>Reports</span>
              </button>

              {/* Date period pill button opening the Filter Bottom Sheet modal */}
              <button
                type="button"
                onClick={() => setMobilePeriodOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/90 border border-blue-100/90 text-slate-800 font-bold text-xs shadow-xs hover:bg-white active:scale-95 transition-all cursor-pointer"
              >
                <Calendar size={14} className="text-blue-600" />
                <span className="truncate max-w-[140px]">{periodLabel}</span>
                <ChevronDown size={14} className="text-slate-400 shrink-0" />
              </button>
            </div>

            {/* Active sub-report content */}
            {renderActiveReportContent()}

            {/* Modern Period Filter Bottom Sheet Modal (matching Daily Collection) */}
            {mobilePeriodOpen && (
              <div
                className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
                onClick={() => setMobilePeriodOpen(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Filter Date Period"
              >
                <div
                  className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 text-slate-900"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Sheet Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Calendar size={18} className="text-blue-600" />
                      <h3 className="text-base font-extrabold text-slate-900">Date Period</h3>
                    </div>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={() => setMobilePeriodOpen(false)}
                      className="size-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Preset Options */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {STANDARD_PERIOD_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setPeriod(opt.id);
                          setMobilePeriodOpen(false);
                        }}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors text-center ${
                          period === opt.id
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setPeriod("customRange");
                      }}
                      className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors text-center ${
                        period === "customRange"
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Custom range
                    </button>
                  </div>

                  {/* Custom Range Pickers */}
                  {period === "customRange" && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">From Date</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full text-xs font-bold p-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">To Date</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full text-xs font-bold p-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  {/* Apply Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setMobilePeriodOpen(false)}
                      className="w-full py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Check size={18} />
                      <span>Apply Period</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================== */}
      {/* 2. TABLET & DESKTOP — full-width hub (no second sidebar)  */}
      {/* App already has main left nav; report options live in the */}
      {/* center as a categorized catalog. Mobile view unchanged.  */}
      {/* ========================================================== */}
      <div className="hidden md:block">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-6 lg:py-8">
          {activeReport === "overview" ? (
            <div className="space-y-5">
              {/* Hub header */}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-xl lg:text-2xl font-extrabold text-slate-900 tracking-tight">
                    Reports
                  </h1>
                  <p className="text-sm text-slate-500 mt-1">
                    Snapshot of money, stock and profit — open any report below
                  </p>
                </div>

                {/* Period filter on hub */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPeriodDropdownOpen((o) => !o)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50"
                  >
                    <span>{periodLabel}</span>
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 transition-transform ${periodDropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {periodDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setPeriodDropdownOpen(false)}
                        aria-hidden
                      />
                      <div className="absolute right-0 top-full mt-1 z-40 min-w-[160px] rounded-xl border border-slate-200 bg-white shadow-xl p-1.5">
                        {STANDARD_PERIOD_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setPeriod(opt.id);
                              setPeriodDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                              period === opt.id
                                ? "bg-slate-900 text-white"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* KPI / money snapshot (existing overview) */}
              <ReportsOverview
                onNavigateReport={(id) => setActiveReport(id as ReportSection)}
                periodLabel={periodLabel}
                inPeriod={reportInPeriod}
              />

              {/* All report types as row-wise cards (tablet & desktop only) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base font-bold text-slate-900">
                    All reports
                  </h2>
                  <span className="text-xs text-slate-500">
                    Open any report from here
                  </span>
                </div>
                <ReportCatalogGrid
                  onSelect={(id) => setActiveReport(id as ReportSection)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Breadcrumb + period — no side nav */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <button
                    type="button"
                    onClick={() => setActiveReport("overview")}
                    className="hover:text-slate-900 cursor-pointer"
                  >
                    Reports
                  </button>
                  <ChevronRight size={14} className="text-slate-400" />
                  <span className="text-slate-900">{getReportTitle(activeReport)}</span>
                </div>

                <div className="flex items-center gap-2 relative">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPeriodDropdownOpen((o) => !o)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50"
                    >
                      <span>{periodLabel}</span>
                      <ChevronDown
                        size={14}
                        className={`text-slate-400 transition-transform ${periodDropdownOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {periodDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setPeriodDropdownOpen(false)}
                          aria-hidden
                        />
                        <div className="absolute right-0 top-full mt-1 z-40 min-w-[160px] rounded-xl border border-slate-200 bg-white shadow-xl p-1.5">
                          {STANDARD_PERIOD_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setPeriod(opt.id);
                                setPeriodDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                                period === opt.id
                                  ? "bg-slate-900 text-white"
                                  : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveReport("overview")}
                    className="text-xs font-bold text-sky-700 hover:underline cursor-pointer"
                  >
                    ← All reports
                  </button>
                </div>
              </div>

              {renderActiveReportContent()}
            </div>
          )}
        </div>
      </div>

      {/* Viewing Bill Modal */}
      {viewingBill && (
        <TaxInvoiceModal
          bill={viewingBill}
          onClose={() => setViewingBill(null)}
        />
      )}

      {/* Record Payment Modal */}
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
            const existing = (payments || []).find((p) => p.id === paymentId);
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
              billId
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

export default ReportsView;
