import React, { useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Share,
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
import { SimpleGstReport } from "./reports/SimpleGstReport";
import { CompositionReport } from "./reports/CompositionReport";
import { SimplePnLReport } from "./reports/SimplePnLReport";
import { SalesMarginPnLReport } from "./reports/SalesMarginPnLReport";
import { SalesSummaryReport } from "./reports/SalesSummaryReport";
import { ExpensesReport } from "./reports/ExpensesReport";
import { BeatSalesDueReport } from "./reports/BeatSalesDueReport";
import { CustomerReceiptsReport } from "./reports/CustomerReceiptsReport";
import { CollectionsSwitch } from "./reports/CollectionsSwitch";
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
import { isGstExcludedBill } from "../../utils/invoiceCommon";

// High-fidelity components matching user mock images
import { ReportsOverview } from "./reports/ReportsOverview";
import { ledgerTotalDue } from "../../utils/dueSummary";
import { ReportsMobileHome } from "./reports/ReportsMobileHome";
import { DailyCollectionStreamlined } from "./reports/DailyCollectionStreamlined";
import { ReportShareMenu } from "./reports/ReportShareMenu";
import { ReportCatalogGrid } from "./reports/ReportCatalogGrid";
import {
  MobileReportProvider,
  formatShortPeriodLabel,
  type CollectionsMobileSubTab,
  type PnlDetailTabId,
} from "./reports/mobile/MobileReportContext";

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
  // Composition taxpayers see CMP-08 / GSTR-4 workings instead of GSTR-1 / GSTR-3B; this toggles back to the old view.
  const [showRegularGst, setShowRegularGst] = useState(false);
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
  const [collectionsSubTab, setCollectionsSubTab] = useState<CollectionsMobileSubTab>("daywise");
  const [pnlTargetTab, setPnlTargetTab] = useState<PnlDetailTabId | null>(null);

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
    d.setDate(d.getDate() - 6);
    return toLocalISODate(d);
  }, []);
  const currentYearMonth = useMemo(() => todayStr.slice(0, 7), [todayStr]);
  const lastYearMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return toLocalISODate(d).slice(0, 7);
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

  // GST-eligible period bills (excludes Non-GST / Trading NG- cash memos)
  const gstPeriodBills = useMemo(
    () => periodBills.filter((b) => !isGstExcludedBill(b, products)),
    [periodBills, products]
  );

  const nonGstPeriodStats = useMemo(() => {
    const ng = periodBills.filter(
      (b) => b.status !== "cancelled" && !(b as any).cancelled && isGstExcludedBill(b, products)
    );
    const total = ng.reduce((s, b) => s + billNetTotal(b), 0);
    return { count: ng.length, total: Math.round(total * 100) / 100 };
  }, [periodBills, products]);

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
      // Cancelled bills are not owed (they used to be counted here, which inflated Party credit).
      if (b.status === "cancelled" || (b as any).cancelled) return;
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

  // GST Summary (excludes Non-GST / Trading cash memos)
  const gstTaxSummary = useMemo(() => {
    const computed = safeGstSummaryFromBills(
      gstPeriodBills,
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
  }, [gstPeriodBills, products, customers, billingSettings, orgProfile, inventoryDispositions, purchaseStats]);

  const existingCustomersList = useMemo(() => {
    return existingCustomers || [];
  }, [existingCustomers]);

  // Report Title helper for breadcrumbs
  const getReportTitle = (id: ReportSection) => {
    switch (id) {
      case "overview":
        return "Overview";
      case "daybook":
        return "Collections";
      case "payments":
        return "Collections by customer";
      case "beats":
        return "Beat-wise sales & due";
      case "receivables":
        return "Party credit";
      case "margin":
      case "netProfit":
        return "Profit & Loss";
      case "sales":
        return "Sales";
      case "expenses":
        return "Expenses";
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

  /** Lets a report's phone Filter sheet change the date period (same as Daily collection). */
  const periodControl = {
    period,
    onPeriodChange: (p: ReportPeriod) => setPeriod(p),
    startDate,
    endDate,
    onCustomRangeChange: (start: string, end: string) => {
      setStartDate(start);
      setEndDate(end);
      setPeriod("customRange");
    },
  };

  const shortPeriodLabel = useMemo(
    () => formatShortPeriodLabel(period, selectedDate),
    [period, selectedDate]
  );

  const mobileContextValue = useMemo(
    () => ({
      period,
      setPeriod,
      shortPeriodLabel,
      periodLabel,
      openPeriodSheet: () => setMobilePeriodOpen(true),
      onBackToHome: () => {
        setPnlTargetTab(null);
        setActiveReport("overview");
      },
      navigateReport: (section: ReportSection) => {
        if (section !== "margin" && section !== "netProfit") {
          setPnlTargetTab(null);
        }
        setActiveReport(section);
      },
      collectionsSubTab,
      setCollectionsSubTab,
      pnlTargetTab,
      setPnlTargetTab,
      orgName: orgProfile?.name || "Hydrate Hub",
    }),
    [period, shortPeriodLabel, periodLabel, collectionsSubTab, pnlTargetTab, orgProfile?.name]
  );

  const handleSharePeriodSummary = () => {
    setMobilePeriodOpen(false);
    const liveBills = periodBills.filter((b) => b.status !== "cancelled" && !(b as any).cancelled);
    const totalSales = liveBills.reduce((s, b) => s + billNetTotal(b), 0);
    const totalDueNow = ledgerTotalDue(existingCustomers)?.total ?? debtorsLedger.reduce((s, d) => s + d.balance, 0);
    const text =
      `📊 *${orgProfile?.name || "Hydrate Hub"} · Reports (${periodLabel})*\n` +
      `• Sales: ₹${money(totalSales)}\n` +
      `• Total Due: ₹${money(totalDueNow)}\n` +
      `• Net GST Payable: ₹${money(gstTaxSummary.netGstPayable)}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      navigator.clipboard?.writeText(text);
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
          topExtra={<CollectionsSwitch active="daybook" onChange={(v) => setActiveReport(v)} />}
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
          only="customer"
          topExtra={<CollectionsSwitch active="payments" onChange={(v) => setActiveReport(v)} />}
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
          ledgerTotalDue={ledgerTotalDue(existingCustomers)?.total}
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

    // Profit & Loss: one plain statement. The detailed product / customer / day view is behind a button.
    if (activeReport === "margin" || activeReport === "netProfit") {
      return (
        <SimplePnLReport
          dateInPeriod={reportInPeriod}
          filteredBills={periodBills}
          products={products}
          gstTaxSummary={gstTaxSummary}
          purchaseStats={purchaseStats}
          periodLabel={periodLabel}
          detail={
            <SalesMarginPnLReport
              dateInPeriod={reportInPeriod}
              filteredBills={periodBills}
              products={products}
              gstTaxSummary={gstTaxSummary}
              purchaseStats={purchaseStats}
              periodLabel={periodLabel}
              initialSubTab="products"
            />
          }
        />
      );
    }

    // Sales: sold / received / unpaid, by day, customer, product or salesman.
    if (activeReport === "sales") {
      return <SalesSummaryReport filteredBills={periodBills} periodLabel={periodLabel} />;
    }

    // Expenses by category (the same entries feed the Profit & Loss).
    if (activeReport === "expenses") {
      return <ExpensesReport dateInPeriod={reportInPeriod} periodLabel={periodLabel} />;
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
          periodControl={periodControl}
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
          periodControl={periodControl}
          periodLabel={periodLabel}
          dateInPeriod={reportInPeriod}
          warehouses={warehouses}
          onNavigateTrips={() => setTab("trips")}
        />
      );
    }

    if (
      activeReport === "tax" &&
      orgProfile?.gstRegistrationType === "composition" &&
      orgProfile?.gstEngineStartDate &&
      !showRegularGst
    ) {
      return (
        <CompositionReport
          bills={(bills || []).filter((b) => !isGstExcludedBill(b, products))}
          grns={grns}
          orgProfile={orgProfile}
          onShowRegularGst={() => setShowRegularGst(true)}
        />
      );
    }

    if (activeReport === "tax") {
      return (
        <>
        {orgProfile?.gstRegistrationType === "composition" && orgProfile?.gstEngineStartDate && (
          <button
            type="button"
            onClick={() => setShowRegularGst(false)}
            className="mb-2 px-1 text-xs font-semibold underline text-indigo-800 cursor-pointer"
          >
            ← Back to composition workings (CMP-08 / GSTR-4)
          </button>
        )}
        <SimpleGstReport
          gstTaxSummary={gstTaxSummary}
          purchaseStats={purchaseStats}
          filteredBills={gstPeriodBills}
          products={products}
          customers={customers || []}
          orgProfile={orgProfile}
          invoicePrefix={billingSettings?.invoicePrefix || "INV"}
          periodLabel={periodLabel}
          excludedBillsCount={nonGstPeriodStats.count}
          excludedBillsTotal={nonGstPeriodStats.total}
          detail={
            <TaxReport
              gstTaxSummary={gstTaxSummary}
              purchaseStats={purchaseStats}
              filteredBills={gstPeriodBills}
              filteredGrns={filteredGrns}
              products={products}
              customers={customers || []}
              orgProfile={orgProfile}
              invoicePrefix={billingSettings?.invoicePrefix || "INV"}
              periodLabel={periodLabel}
              excludedBillsCount={nonGstPeriodStats.count}
              excludedBillsTotal={nonGstPeriodStats.total}
            />
          }
        />
        </>
      );
    }

    return null;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/60 text-slate-900 pb-12">
      {/* ========================================================== */}
      {/* 1. MOBILE VIEW (md:hidden) — Flat blue header + white cards */}
      {/* ========================================================== */}
      <MobileReportProvider value={mobileContextValue}>
        <div
          id="view-reports"
          className="md:hidden px-[var(--page-pad)] bg-[var(--bg)] min-h-screen pb-28 text-[var(--text)]"
        >
          {activeReport === "overview" ? (
            <ReportsMobileHome
              onSelectReport={(id) => {
                setPnlTargetTab(null);
                setActiveReport(id as ReportSection);
              }}
              inPeriod={reportInPeriod}
              periodLabel={periodLabel}
            />
          ) : (
            renderActiveReportContent()
          )}

          {/* Bottom Period Picker + Share Summary Sheet (Mockup 1 Screen 3) */}
          {mobilePeriodOpen && (
            <div
              data-esc-close
              className="rt-bsheet-scrim"
              onClick={() => setMobilePeriodOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Period"
            >
              <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                <div className="w-9 h-1 rounded-full bg-slate-300 mx-auto mb-0.5" aria-hidden="true" />
                <h3 className="text-[17px] font-extrabold text-[var(--text)] tracking-tight m-0">
                  Period
                </h3>

                <div className="rt-rep-card divide-y divide-[var(--divider)]">
                  {[
                    { id: "today" as ReportPeriod, label: "Today" },
                    { id: "yesterday" as ReportPeriod, label: "Yesterday" },
                    { id: "last7" as ReportPeriod, label: "7 days" },
                    { id: "thisMonth" as ReportPeriod, label: "Month" },
                    { id: "all" as ReportPeriod, label: "All time" },
                    { id: "customRange" as ReportPeriod, label: "Custom range" },
                  ].map((opt) => {
                    const checked = period === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => {
                          setPeriod(opt.id);
                          if (opt.id !== "customRange") {
                            setMobilePeriodOpen(false);
                          }
                        }}
                        className="w-full flex items-center justify-between px-4 py-3.5 text-left text-[14.5px] font-semibold text-[var(--text)] bg-[var(--surface)] active:bg-slate-50 cursor-pointer"
                      >
                        <span>{opt.label}</span>
                        <span className="rt-period-radio" data-checked={checked ? "true" : "false"} />
                      </button>
                    );
                  })}
                </div>

                {period === "customRange" && (
                  <div className="rt-rep-card p-3.5 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-bold text-[var(--text-2)] block mb-1">
                          From
                        </label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full text-xs font-bold p-2.5 border border-[var(--border)] rounded-xl bg-[var(--bg)] text-[var(--text)]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-[var(--text-2)] block mb-1">
                          To
                        </label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full text-xs font-bold p-2.5 border border-[var(--border)] rounded-xl bg-[var(--bg)] text-[var(--text)]"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobilePeriodOpen(false)}
                      className="w-full min-h-[42px] rounded-full bg-[var(--primary)] text-white text-[13.5px] font-bold cursor-pointer"
                    >
                      Apply range
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSharePeriodSummary}
                  className="w-full min-h-[44px] rounded-full border-[1.5px] border-[var(--primary)] bg-[var(--surface)] text-[var(--primary)] text-[14px] font-bold inline-flex items-center justify-center gap-2 cursor-pointer active:bg-blue-50"
                >
                  <Share size={16} strokeWidth={2.2} aria-hidden="true" />
                  <span>Share summary</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </MobileReportProvider>

      {/* ========================================================== */}
      {/* 2. TABLET & DESKTOP — full-width hub (no second sidebar)  */}
      {/* App already has main left nav; report options live in the */}
      {/* center as a categorized catalog. Mobile view unchanged.  */}
      {/* ========================================================== */}
      <div className="hidden md:block">
        <div className="hh-view w-full min-w-0">
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
