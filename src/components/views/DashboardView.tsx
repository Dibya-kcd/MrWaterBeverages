import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Eye,
  EyeOff,
  Filter,
  IndianRupee,
  Layers,
  Package,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import { money, statusOf } from "../../utils/billing";
import { collectExpiryAlerts } from "../../utils/fefo";
import { trackedStage } from "./ExpiryReturnsTracker";
import { billBalance, billNetTotal, returnedQtyByProduct } from "../../utils/salesReturns";
import { StatBlock } from "../common/StatBlock";
import { buildMonthlyIncentiveReport, isClaimLinkedNote } from "../../utils/supplierSchemes";

import {
  PeriodFilter,
  type FilterPeriodPreset,
  type PeriodRange,
  rangeForPreset,
} from "../common/PeriodFilter";
import { toLocalISODate } from "../../utils/dateLocal";
export type { FilterPeriodPreset };

export type CyclePeriod =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "all"
  | "custom";

interface CycleItem {
  id: CyclePeriod;
  label: string;
  metricHeader: string;
}

const CYCLE_SEQUENCE: CycleItem[] = [
  { id: "today", label: "Today", metricHeader: "SALES (TODAY)" },
  { id: "yesterday", label: "Yesterday", metricHeader: "SALES (YESTERDAY)" },
  { id: "week", label: "Week", metricHeader: "SALES (LAST 7 DAYS)" },
  { id: "month", label: "Month", metricHeader: "SALES (LAST 30 DAYS)" },
  { id: "all", label: "All time", metricHeader: "SALES (ALL TIME)" },
  { id: "custom", label: "Custom", metricHeader: "SALES (CUSTOM)" },
];

export const DashboardView: React.FC = () => {
  const {
    products,
    bills,
    grns,
    warehouses,
    warehouseStock,
    totalRemaining,
    tripsWithDiscrepancy,
    remainingStock,
    inventoryBatches,
    inventoryDispositions,
    supplierCreditNotes,
    supplierSchemes,
    customers,
    palette,
    fz,
    scale,
    setTab,
    currentUser,
  } = useLedger();

  // Helper date strings
  const today = useMemo(() => {
    const d = new Date();
    return toLocalISODate(d);
  }, []);

  const getPastDateStr = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return toLocalISODate(d);
  };

  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const userName = useMemo(() => {
    if (!currentUser) return "Owner";
    if (typeof currentUser === "object") {
      const u = currentUser as { name?: string; role?: string };
      if (u.name && u.name.trim()) return u.name.trim();
      if (u.role === "admin") return "Owner";
      if (u.role) return u.role;
    }
    return "Owner";
  }, [currentUser]);

  // Filter state defaulting to "today" with cycler support
  const [cycleIndex, setCycleIndex] = useState<number>(0);
  const currentCycle = CYCLE_SEQUENCE[cycleIndex];

  const [periodPreset, setPeriodPreset] = useState<FilterPeriodPreset>("today");
  const [customDays, setCustomDays] = useState<number>(15);
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  const applyCycleIndex = (newIndex: number) => {
    const cycle = CYCLE_SEQUENCE[newIndex];
    setCycleIndex(newIndex);
    if (cycle.id === "today") {
      setPeriodPreset("today");
      setStartDate(today);
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (cycle.id === "yesterday") {
      setPeriodPreset("yesterday");
      const y = getPastDateStr(1);
      setStartDate(y);
      setEndDate(y);
      setShowCustomPicker(false);
    } else if (cycle.id === "week") {
      setPeriodPreset("7days");
      setStartDate(getPastDateStr(6));
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (cycle.id === "month") {
      setPeriodPreset("month");
      setStartDate(getPastDateStr(29));
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (cycle.id === "all") {
      setPeriodPreset("all");
      setStartDate("");
      setEndDate("");
      setShowCustomPicker(false);
    } else if (cycle.id === "custom") {
      setPeriodPreset("custom");
      setShowCustomPicker(true);
    }
  };

  const handleCycleClick = () => {
    const nextIndex = (cycleIndex + 1) % CYCLE_SEQUENCE.length;
    applyCycleIndex(nextIndex);
  };

  // Close filter dropdown on outside click
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

  // Depot health summary banner visibility (able to hide / toggle)
  const [showHealthBanner, setShowHealthBanner] = useState<boolean>(() => {
    try {
      return localStorage.getItem("hide_depot_health_banner") !== "true";
    } catch {
      return true;
    }
  });

  const handleToggleHealthBanner = (visible: boolean) => {
    setShowHealthBanner(visible);
    try {
      localStorage.setItem(
        "hide_depot_health_banner",
        visible ? "false" : "true",
      );
    } catch {
      // ignore
    }
  };

  // Quick helper to apply a preset
  const handleSelectPreset = (preset: FilterPeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === "today") {
      setCycleIndex(0);
      setStartDate(today);
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (preset === "yesterday") {
      setCycleIndex(1);
      const y = getPastDateStr(1);
      setStartDate(y);
      setEndDate(y);
      setShowCustomPicker(false);
    } else if (preset === "7days") {
      setCycleIndex(2);
      setStartDate(getPastDateStr(6));
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (preset === "15days") {
      setCycleIndex(2);
      setStartDate(getPastDateStr(14));
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (preset === "30days" || preset === "month") {
      setCycleIndex(3);
      setStartDate(getPastDateStr(29));
      setEndDate(today);
      setShowCustomPicker(false);
    } else if (preset === "lastMonth") {
      setCycleIndex(3);
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const lastDayOfPrevMonth = new Date(y, d.getMonth() + 1, 0).getDate();
      setStartDate(`${y}-${m}-01`);
      setEndDate(`${y}-${m}-${String(lastDayOfPrevMonth).padStart(2, "0")}`);
      setShowCustomPicker(false);
    } else if (preset === "all") {
      setCycleIndex(4);
      setStartDate("");
      setEndDate("");
      setShowCustomPicker(false);
    } else if (preset === "custom") {
      setCycleIndex(5);
      setShowCustomPicker(true);
    }
  };

  const handleApplyCustomDays = (days: number) => {
    setCustomDays(days);
    setPeriodPreset("custom");
    setCycleIndex(5);
    setStartDate(getPastDateStr(days - 1));
    setEndDate(today);
  };

  // Filter bills by selected period
  const activeBills = useMemo(() => {
    if (currentCycle.id === "all" || periodPreset === "all" || (!startDate && !endDate)) {
      return bills;
    }
    return bills.filter((b) => {
      const bDate = (b.date || "").slice(0, 10);
      if (startDate && bDate < startDate) return false;
      if (endDate && bDate > endDate) return false;
      return true;
    });
  }, [bills, currentCycle.id, periodPreset, startDate, endDate]);

  // Filter GRNs by selected period
  const activeGrns = useMemo(() => {
    if (currentCycle.id === "all" || periodPreset === "all" || (!startDate && !endDate)) {
      return grns;
    }
    return grns.filter((g) => {
      const gDate = (g.inwardDate || g.createdAt || "").slice(0, 10);
      if (startDate && gDate < startDate) return false;
      if (endDate && gDate > endDate) return false;
      return true;
    });
  }, [grns, currentCycle.id, periodPreset, startDate, endDate]);

  // Computed metrics for active period
  const periodRevenue = useMemo(
    () => activeBills.reduce((s, b) => s + billNetTotal(b), 0),
    [activeBills],
  );
  const periodPaid = useMemo(
    () => activeBills.reduce((s, b) => s + (Number(b.amountPaid) || 0), 0),
    [activeBills],
  );
  const periodOutstanding = useMemo(
    () => activeBills.reduce((s, b) => s + billBalance(b), 0),
    [activeBills],
  );
  const periodCasesSold = useMemo(() => {
    return activeBills.reduce((s, b) => {
      const back = Object.values(returnedQtyByProduct(b)).reduce(
        (a, q) => a + q,
        0,
      );
      return s + (b.items || []).reduce((sum, i) => sum + (Number(i.qty) || 0), 0) - back;
    }, 0);
  }, [activeBills]);

  const avgBillValue =
    activeBills.length > 0 ? Math.round(periodRevenue / activeBills.length) : 0;
  const collectionRate =
    periodRevenue > 0
      ? Math.min(100, Math.round((periodPaid / periodRevenue) * 100))
      : 100;

  // Fast-Moving Beverages ranking in selected period
  const topProducts = useMemo(() => {
    const qtyMap: Record<
      number,
      { name: string; qty: number; category: string; revenue: number }
    > = {};
    activeBills.forEach((b) => {
      b.items.forEach((item) => {
        if (!qtyMap[item.productId]) {
          qtyMap[item.productId] = {
            name: item.productName,
            qty: 0,
            category: item.category,
            revenue: 0,
          };
        }
        qtyMap[item.productId].qty += item.qty;
        qtyMap[item.productId].revenue += item.gross || 0;
      });
    });
    return Object.values(qtyMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [activeBills]);

  // Godown Stock distribution:
  // Strictly normalized against depot live stock so godown balances never exceed depot book stock
  // and percentage of depot stock is mathematically clamped 0-100% (fixing the 188% anomaly)
  const warehouseDistribution = useMemo(() => {
    if (warehouses.length === 0) return [];

    const depotStock = Math.max(0, totalRemaining);

    // Raw floor stock in each godown
    const rawList = warehouses.map((w) => ({
      warehouse: w,
      raw: Math.max(0, warehouseStock(w.id)),
    }));
    const totalRaw = rawList.reduce((s, r) => s + r.raw, 0);

    return rawList.map(({ warehouse: w, raw }) => {
      // Proportional crates matching live depotRemaining
      let cases = raw;
      if (totalRaw > 0 && depotStock >= 0) {
        cases = Math.round((raw / totalRaw) * depotStock);
      } else if (warehouses.length === 1) {
        cases = depotStock;
      }

      // Share of total depot live stock (strictly 0 - 100%, never 188%)
      const pctOfDepotStock =
        depotStock > 0
          ? Math.min(100, Math.max(0, Math.round((cases / depotStock) * 100)))
          : totalRaw > 0
            ? Math.min(100, Math.max(0, Math.round((raw / totalRaw) * 100)))
            : 0;

      // Godown physical capacity utilization (capped at 100%)
      const capacity =
        w.capacityCases && w.capacityCases > 0 ? w.capacityCases : 2500;
      const capacityPct = Math.min(
        100,
        Math.max(0, Math.round((cases / capacity) * 100)),
      );

      return {
        ...w,
        cases,
        pctOfDepotStock,
        capacity,
        capacityPct,
      };
    });
  }, [warehouses, warehouseStock, totalRemaining]);

  const lowStockProducts = products.filter((p) => remainingStock(p.id) < 5);

  const expiryAlerts = useMemo(
    () => collectExpiryAlerts(inventoryBatches, products, today),
    [inventoryBatches, products, today],
  );
  const expiredLots = expiryAlerts.filter((a) => a.level === "expired");
  const criticalLots = expiryAlerts.filter((a) => a.level === "critical");
  const warningLots = expiryAlerts.filter((a) => a.level === "warning");

  const cardStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderWidth: 2,
  };

  // Descriptive label for current filter
  const filterSummaryLabel = useMemo(() => {
    if (periodPreset === "all") return "All Time Records";
    if (periodPreset === "today") return `Today (${today})`;
    if (periodPreset === "yesterday") return `Yesterday (${startDate})`;
    if (periodPreset === "7days")
      return `Last 7 Days (${startDate} to ${endDate})`;
    if (periodPreset === "15days")
      return `Last 15 Days (${startDate} to ${endDate})`;
    if (periodPreset === "30days")
      return `Last 30 Days (${startDate} to ${endDate})`;
    if (periodPreset === "month")
      return `Last 30 Days (${startDate} to ${endDate})`;
    if (periodPreset === "lastMonth")
      return `Last Month (${startDate.slice(0, 7)})`;
    if (startDate && endDate)
      return `Custom Range (${startDate} to ${endDate})`;
    return "Custom Filter";
  }, [periodPreset, startDate, endDate, today]);

  const shortFilterLabel = useMemo(() => {
    if (periodPreset === "all") return "All Time";
    if (periodPreset === "today") return "Today";
    if (periodPreset === "yesterday") return "Yesterday";
    if (periodPreset === "7days") return "7 Days";
    if (periodPreset === "15days") return "15 Days";
    if (periodPreset === "30days") return "30 Days";
    if (periodPreset === "month") return "30 Days";
    if (periodPreset === "lastMonth") return "Last Month";
    if (periodPreset === "custom") {
      if (startDate && endDate && startDate !== endDate) {
        return `${startDate.slice(5)} to ${endDate.slice(5)}`;
      }
      return `${customDays}d`;
    }
    return "All Time";
  }, [periodPreset, customDays, startDate, endDate]);
  // ---- Smart insights (read-only; does not change any ledger logic) ----------
  const todayBills = useMemo(
    () => bills.filter((b) => (b.date || "").slice(0, 10) === today),
    [bills, today],
  );
  const todayRevenue = useMemo(
    () => todayBills.reduce((s, b) => s + (b.total || 0), 0),
    [todayBills],
  );
  const todayCollected = useMemo(
    () => todayBills.reduce((s, b) => s + (b.amountPaid || 0), 0),
    [todayBills],
  );
  const todayCases = useMemo(
    () =>
      todayBills.reduce(
        (s, b) => s + b.items.reduce((x, i) => x + (i.qty || 0), 0),
        0,
      ),
    [todayBills],
  );

  const openClaims = useMemo(
    () =>
      (inventoryDispositions || []).filter(
        (d) =>
          d.compensationStatus === "pending" ||
          d.compensationStatus === "partial",
      ),
    [inventoryDispositions],
  );
  // Customer expired/damaged returns: waiting for a decision / handover, or with the company for a credit note.
  const expiryReturnCounts = useMemo(() => {
    let toAct = 0;
    let withCompany = 0;
    for (const d of inventoryDispositions || []) {
      if (!d.returnTracking) continue;
      const st = trackedStage(d);
      if (st === "held") toAct += 1;
      else if (st === "sent") withCompany += 1;
    }
    return { toAct, withCompany };
  }, [inventoryDispositions]);
  const openExpiryReturns = () => {
    try {
      sessionStorage.setItem("mrwater_open_dispositions", "claims");
    } catch {
      /* ignore */
    }
    setTab("inventory");
  };
  const openClaimValue = useMemo(
    () =>
      openClaims.reduce(
        (s, d) =>
          s + Math.max(0, (d.costValue || 0) - (d.compensatedAmount || 0)),
        0,
      ),
    [openClaims],
  );

  // Scheme / incentive credit notes only. Expiry/damage claim notes are already counted as
  // "open supplier claims" above and are managed in Returns & Disposals.
  const openSchemeCNs = useMemo(
    () =>
      (supplierCreditNotes || []).filter(
        (n) => n.status !== "settled" && !isClaimLinkedNote(n),
      ),
    [supplierCreditNotes],
  );

  // Monthly volume incentives where the target is met but no credit note is raised yet.
  const monthlyIncentivesToRaise = useMemo(() => {
    const now = new Date();
    const periods = [0, 1, 2].map((i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    return buildMonthlyIncentiveReport({
      schemes: supplierSchemes || [],
      bills,
      creditNotes: supplierCreditNotes || [],
      products,
      periods,
    }).filter((r) => r.achieved && r.status === "pending").length;
  }, [supplierSchemes, bills, supplierCreditNotes, products]);

  const topOutstanding = useMemo(() => {
    const map = new Map<string, { name: string; due: number; bills: number }>();
    for (const b of activeBills) {
      const due = Math.max(0, (b.total || 0) - (b.amountPaid || 0));
      if (due < 0.5) continue;
      const name = (b.retailer || "Cash Sale").trim() || "Cash Sale";
      const key = name.toLowerCase();
      const row = map.get(key) || { name, due: 0, bills: 0 };
      row.due += due;
      row.bills += 1;
      map.set(key, row);
    }
    return Array.from(map.values())
      .sort((a, b) => b.due - a.due)
      .slice(0, 5);
  }, [activeBills]);

  /** Who to visit next: highest dues, grouped by route/city when available */
  const visitNext = useMemo(() => {
    const map = new Map<
      string,
      { name: string; due: number; route: string; city: string; phone: string }
    >();
    for (const b of bills) {
      const due = Math.max(0, (b.total || 0) - (b.amountPaid || 0));
      if (due < 1) continue;
      const name = (b.retailer || "").trim();
      if (!name || name.toLowerCase() === "cash sale") continue;
      const key = name.toLowerCase();
      const cust = (customers || []).find(
        (c) => c.name.trim().toLowerCase() === key,
      );
      const row = map.get(key) || {
        name,
        due: 0,
        route: cust?.route || "",
        city: cust?.city || "",
        phone: cust?.phone || b.phone || "",
      };
      row.due += due;
      if (cust?.route) row.route = cust.route;
      if (cust?.city) row.city = cust.city;
      map.set(key, row);
    }
    return Array.from(map.values())
      .sort((a, b) => {
        const ra = (a.route || a.city || "zzz").localeCompare(
          b.route || b.city || "zzz",
        );
        if (ra !== 0) return ra;
        return b.due - a.due;
      })
      .slice(0, 8);
  }, [bills, customers]);

  const smartActions = useMemo(() => {
    const actions: {
      id: string;
      priority: number;
      title: string;
      detail: string;
      tab: Parameters<typeof setTab>[0];
      tone: "rose" | "amber" | "sky" | "emerald";
      onOpen?: () => void;
    }[] = [];
    if (expiredLots.length > 0) {
      actions.push({
        id: "expired",
        priority: 1,
        title: `${expiredLots.length} expired lot(s) in stock`,
        detail: "Cannot sell — write off, return to supplier, or dispose",
        tab: "inventory",
        tone: "rose",
      });
    }
    if (criticalLots.length > 0) {
      actions.push({
        id: "critical-exp",
        priority: 2,
        title: `${criticalLots.length} lot(s) expiring within 7 days`,
        detail: "Prioritise van load / near-expiry push or supplier return",
        tab: "inventory",
        tone: "amber",
      });
    }
    if (tripsWithDiscrepancy > 0) {
      actions.push({
        id: "trips",
        priority: 3,
        title: `${tripsWithDiscrepancy} trip stock discrepancy`,
        detail: "Reconcile van load vs billed cases",
        tab: "trips",
        tone: "rose",
      });
    }
    if (lowStockProducts.length > 0) {
      actions.push({
        id: "low-stock",
        priority: 4,
        title: `${lowStockProducts.length} SKU(s) below 5 cases`,
        detail: "Plan inward or transfer from other godown",
        tab: "inventory",
        tone: "amber",
      });
    }
    if (periodOutstanding > 100) {
      actions.push({
        id: "dues",
        priority: 5,
        title: `₹${money(periodOutstanding)} outstanding (${filterSummaryLabel})`,
        detail: "Follow up collections on credit bills",
        tab: "payments",
        tone: "sky",
      });
    }
    if (openClaims.length > 0) {
      actions.push({
        id: "claims",
        priority: 6,
        title: `${openClaims.length} open supplier claim(s) · ₹${money(openClaimValue)}`,
        detail: "Record credit notes when company compensates",
        tab: "inventory",
        tone: "amber",
      });
    }
    if (openSchemeCNs.length > 0 || monthlyIncentivesToRaise > 0) {
      const bits: string[] = [];
      if (openSchemeCNs.length > 0)
        bits.push(`${openSchemeCNs.length} supplier credit note(s) not settled`);
      if (monthlyIncentivesToRaise > 0)
        bits.push(`${monthlyIncentivesToRaise} monthly incentive(s) to raise`);
      actions.push({
        id: "scn",
        priority: 7,
        title: bits.join(" · "),
        detail: "Supplier credits → credit notes",
        tab: "supplierSchemes",
        tone: "sky",
        onOpen: () => {
          try {
            sessionStorage.setItem("mrwater_open_supplier_cn", "pending");
          } catch {
            /* ignore */
          }
        },
      });
    }
    if (actions.length === 0) {
      actions.push({
        id: "ok",
        priority: 99,
        title: "No urgent actions",
        detail: "Stock, trips and claims look clear for now",
        tab: "billing",
        tone: "emerald",
      });
    }
    return actions.sort((a, b) => a.priority - b.priority).slice(0, 6);
  }, [
    expiredLots.length,
    criticalLots.length,
    tripsWithDiscrepancy,
    lowStockProducts.length,
    periodOutstanding,
    filterSummaryLabel,
    openClaims.length,
    openClaimValue,
    openSchemeCNs.length,
    monthlyIncentivesToRaise,
  ]);

  const hasRealData = activeBills.length > 0;
  const displayRevenue = periodRevenue;
  const displayBillsCount = activeBills.length;
  const displayUnits = periodCasesSold;

  // Comparison with prior equivalent period for truthful trend calculation
  const previousPeriodBills = useMemo(() => {
    if (currentCycle.id === "all") return [];
    if (currentCycle.id === "today") {
      const y = getPastDateStr(1);
      return bills.filter((b) => (b.date || "").slice(0, 10) === y);
    }
    if (currentCycle.id === "yesterday") {
      const prev = getPastDateStr(2);
      return bills.filter((b) => (b.date || "").slice(0, 10) === prev);
    }
    if (currentCycle.id === "week") {
      const s = getPastDateStr(13);
      const e = getPastDateStr(7);
      return bills.filter((b) => {
        const d = (b.date || "").slice(0, 10);
        return d >= s && d <= e;
      });
    }
    if (currentCycle.id === "month") {
      const s = getPastDateStr(60);
      const e = getPastDateStr(31);
      return bills.filter((b) => {
        const d = (b.date || "").slice(0, 10);
        return d >= s && d <= e;
      });
    }
    return [];
  }, [bills, currentCycle.id]);

  const previousRevenue = useMemo(
    () => previousPeriodBills.reduce((s, b) => s + billNetTotal(b), 0),
    [previousPeriodBills],
  );

  const revenueTrend = useMemo(() => {
    if (displayRevenue === 0 && previousRevenue === 0) {
      return { text: "0%", tone: "neutral" as const };
    }
    if (previousRevenue === 0 && displayRevenue > 0) {
      return { text: "+100%", tone: "positive" as const };
    }
    if (previousRevenue > 0) {
      const diff = displayRevenue - previousRevenue;
      const pct = (diff / previousRevenue) * 100;
      if (pct === 0) return { text: "0%", tone: "neutral" as const };
      return {
        text: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`,
        tone: pct >= 0 ? ("positive" as const) : ("negative" as const),
      };
    }
    return { text: "0%", tone: "neutral" as const };
  }, [displayRevenue, previousRevenue]);

  // Real 7-day sparkline distribution based on actual bills in ledger
  const sparklineBars = useMemo(() => {
    const days: { date: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dStr = getPastDateStr(i);
      const dayRev = bills
        .filter((b) => (b.date || "").slice(0, 10) === dStr)
        .reduce((s, b) => s + billNetTotal(b), 0);
      days.push({ date: dStr, revenue: dayRev });
    }
    const max = Math.max(...days.map((d) => d.revenue), 1);
    const hasAnySales = days.some((d) => d.revenue > 0);

    return days.map((d, idx) => {
      const isLatest = idx === 6;
      if (!hasAnySales) {
        return {
          height: 12,
          color: isLatest ? "bg-teal-200" : "bg-slate-100",
          title: `${d.date}: ₹0`,
        };
      }
      const pct = Math.max(10, Math.round((d.revenue / max) * 100));
      return {
        height: pct,
        color:
          d.revenue > 0
            ? isLatest
              ? "bg-teal-600"
              : "bg-teal-400"
            : "bg-slate-100",
        title: `${d.date}: ₹${money(d.revenue)}`,
      };
    });
  }, [bills]);

  return (
    <div id="view-dashboard" className="space-y-4 min-w-0 max-w-full pb-2">
      {/* Green hero — sales for selected period + quick actions */}
      <section className="rounded-3xl bg-gradient-to-br from-[#0d4a3a] via-[#0f5c49] to-[#0a3d30] text-white p-4 sm:p-5 shadow-lg relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-white/80 font-medium">
            Hello,{' '}
            {(currentUser && 'name' in currentUser && (currentUser as { name?: string }).name) ||
              (currentUser && 'email' in currentUser && String((currentUser as { email?: string }).email || '').split('@')[0]) ||
              userName}
          </p>

          {/* Period Filter Dropdown Trigger (Arrowed element) */}
          <div className="relative shrink-0" ref={filterDropdownRef}>
            <button
              type="button"
              id="btn-cycle-period"
              onClick={() => setShowFilterDropdown((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 hover:bg-white/25 active:bg-white/30 text-amber-100 hover:text-white border border-white/20 shadow-xs cursor-pointer transition-all select-none group"
              aria-expanded={showFilterDropdown}
              aria-label={`Time filter: ${shortFilterLabel}. Click to change period.`}
              title="Click to select period or custom date range"
            >
              <Clock className="w-3.5 h-3.5 text-emerald-200 group-hover:rotate-45 transition-transform" />
              <span>{shortFilterLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-emerald-200 transition-transform duration-200 ${
                  showFilterDropdown ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu with all time filter features transferred */}
            {showFilterDropdown && (
              <div
                role="dialog"
                aria-label="Filter period"
                className="absolute right-0 mt-2 z-50 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white text-slate-800 shadow-2xl border border-slate-200/90 p-3.5 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-bold text-slate-900 tracking-tight">Period Filter</span>
                  </div>
                  {periodPreset !== 'today' && (
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectPreset('today');
                        setShowFilterDropdown(false);
                      }}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                    >
                      Reset to Today
                    </button>
                  )}
                </div>

                {/* Presets Grid */}
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  {[
                    { id: 'today' as FilterPeriodPreset, label: 'Today', sub: 'Today only' },
                    { id: 'yesterday' as FilterPeriodPreset, label: 'Yesterday', sub: 'Previous day' },
                    { id: '7days' as FilterPeriodPreset, label: 'Week', sub: 'Last 7 days' },
                    { id: 'month' as FilterPeriodPreset, label: 'Month', sub: 'Last 30 days' },
                    { id: 'lastMonth' as FilterPeriodPreset, label: 'Last Month', sub: 'Prior month' },
                    { id: 'all' as FilterPeriodPreset, label: 'All Time', sub: 'Complete history' },
                  ].map((p) => {
                    const active = periodPreset === p.id && !showCustomPicker;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          handleSelectPreset(p.id);
                          setShowFilterDropdown(false);
                        }}
                        className={`text-left px-2.5 py-2 rounded-xl text-xs transition-all cursor-pointer border ${
                          active
                            ? 'bg-emerald-50 border-emerald-500/40 text-emerald-900 font-bold shadow-xs'
                            : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200/60 text-slate-700 font-medium'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{p.label}</span>
                          {active && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal mt-0.5">{p.sub}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Days Row */}
                <div className="mb-3 pt-2 border-t border-slate-100">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Quick Horizons
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[7, 15, 30, 60, 90].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => {
                          handleApplyCustomDays(days);
                          setShowFilterDropdown(false);
                        }}
                        className={`flex-1 py-1 rounded-lg text-xs font-semibold cursor-pointer border transition-colors text-center ${
                          periodPreset === 'custom' && customDays === days
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Date Range */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Custom Range
                    </span>
                    {showCustomPicker ? (
                      <button
                        type="button"
                        onClick={() => setShowCustomPicker(false)}
                        className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomPicker(true);
                          setPeriodPreset('custom');
                        }}
                        className="text-[10px] font-bold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Pick Dates
                      </button>
                    )}
                  </div>

                  {showCustomPicker && (
                    <div className="space-y-2 bg-slate-50 rounded-xl p-2.5 border border-slate-200/80">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            From
                          </label>
                          <input
                            type="date"
                            value={startDate}
                            max={endDate || today}
                            onChange={(e) => {
                              setStartDate(e.target.value);
                              setPeriodPreset('custom');
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            To
                          </label>
                          <input
                            type="date"
                            value={endDate}
                            min={startDate || undefined}
                            max={today}
                            onChange={(e) => {
                              setEndDate(e.target.value);
                              setPeriodPreset('custom');
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!startDate) setStartDate(getPastDateStr(6));
                          if (!endDate) setEndDate(today);
                          setPeriodPreset('custom');
                          setShowFilterDropdown(false);
                        }}
                        className="w-full py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer shadow-xs"
                      >
                        Apply Range
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="mt-1 flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
            ₹{money(periodRevenue)}
          </span>
        </div>
        <p className="text-sm text-white/70 mt-0.5">
          sales · {activeBills.length} bill{activeBills.length === 1 ? '' : 's'}
          {periodPreset !== 'all' && startDate && endDate
            ? startDate === endDate
              ? ` · ${startDate}`
              : ` · ${startDate} → ${endDate}`
            : ''}
        </p>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {(
            [
              { label: 'New sale', tab: 'billing', icon: '🛒' },
              { label: 'Inventory', tab: 'grn', icon: '📦' },
              { label: 'Collect', tab: 'payments', icon: '💵' },
              { label: 'Trips', tab: 'trips', icon: '🚚' },
            ] as Array<{ label: string; tab: 'billing' | 'grn' | 'payments' | 'trips'; icon: string; onOpen?: () => void }>
          ).map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                a.onOpen?.();
                setTab(a.tab);
              }}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 py-3 px-1 cursor-pointer transition-colors active:scale-[0.98]"
            >
              <span className="text-lg" aria-hidden>
                {a.icon}
              </span>
              <span className="text-[11px] sm:text-xs font-semibold text-amber-200">{a.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* KPI strip — period-aware */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Collected</div>
          <div className="text-lg font-bold text-emerald-700 mt-1 tabular-nums">₹{money(periodPaid)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{shortFilterLabel}</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Outstanding</div>
          <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">₹{money(periodOutstanding)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Expiring soon</div>
          <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
            {expiredLots.length + criticalLots.length + warningLots.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">within 60 days</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Low stock</div>
          <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
            {lowStockProducts.length}
          </div>
        </div>
      </div>

      {(products.length === 0 || customers.length === 0 || bills.length === 0) && (
        <section className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-bold text-slate-900 mb-2">Get started</h2>
          <ol className="space-y-2 text-sm">
            <li>
              <button type="button" onClick={() => setTab('settings')} className="text-[#0d4a3a] font-semibold hover:underline cursor-pointer">
                1. Fill your company & GSTIN
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setTab('products')} className="text-[#0d4a3a] font-semibold hover:underline cursor-pointer">
                2. Add products
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setTab('customers')} className="text-[#0d4a3a] font-semibold hover:underline cursor-pointer">
                3. Add suppliers & customers
              </button>
            </li>
          </ol>
        </section>
      )}

      {((typeof tripsWithDiscrepancy === 'number' ? tripsWithDiscrepancy : 0) > 0 ||
        openClaims.length > 0 ||
        expiryReturnCounts.toAct > 0 ||
        expiryReturnCounts.withCompany > 0) && (
        <section className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 space-y-2">
          <h2 className="text-sm font-bold text-slate-900">Needs attention</h2>
          {(typeof tripsWithDiscrepancy === 'number' ? tripsWithDiscrepancy : 0) > 0 && (
            <button type="button" onClick={() => setTab('trips')} className="block w-full text-left text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 cursor-pointer">
              {tripsWithDiscrepancy} trip(s) with load discrepancy →
            </button>
          )}
          {expiryReturnCounts.toAct > 0 && (
            <button type="button" onClick={openExpiryReturns} className="block w-full text-left text-sm text-rose-800 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 cursor-pointer">
              {expiryReturnCounts.toAct} customer expired return(s) waiting: send to company or throw out →
            </button>
          )}
          {expiryReturnCounts.withCompany > 0 && (
            <button type="button" onClick={openExpiryReturns} className="block w-full text-left text-sm text-sky-800 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 cursor-pointer">
              {expiryReturnCounts.withCompany} expired return(s) with company: waiting for credit note →
            </button>
          )}
          {openClaims.length > 0 && (
            <button type="button" onClick={() => setTab('inventory')} className="block w-full text-left text-sm text-slate-700 bg-slate-50 border border-black/5 rounded-xl px-3 py-2 cursor-pointer">
              {openClaims.length} open claim(s) · ₹{money(openClaimValue)} →
            </button>
          )}
        </section>
      )}
    </div>
  );
};

export default DashboardView;

