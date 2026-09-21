import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  SlidersHorizontal,
  Tag,
  TrendingUp,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { money, statusOf } from '../../utils/billing';
import { Bill, GRN, Product } from '../../types';
import { TaxInvoiceModal } from '../common/TaxInvoiceModal';
import { WhatsAppButton } from '../common/WhatsAppButton';
import { CATS } from '../../constants/initialData';

export type ReportSection =
  | 'sales'
  | 'inventory'
  | 'purchases'
  | 'receivables'
  | 'trips'
  | 'tax';

export type ReportPeriod =
  | 'customDate'
  | 'today'
  | 'yesterday'
  | 'customRange'
  | 'last7'
  | 'thisMonth'
  | 'lastMonth'
  | 'all';

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
  } = useLedger();

  const [activeReport, setActiveReport] = useState<ReportSection>('sales');
  const [period, setPeriod] = useState<ReportPeriod>(() => {
    const saved = sessionStorage.getItem('reports_period');
    if (saved) {
      sessionStorage.removeItem('reports_period');
      return saved as ReportPeriod;
    }
    return 'thisMonth';
  });

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const saved = sessionStorage.getItem('reports_selected_date');
    if (saved) {
      sessionStorage.removeItem('reports_selected_date');
      return saved;
    }
    return new Date().toISOString().slice(0, 10);
  });

  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [skuSearchQuery, setSkuSearchQuery] = useState('');
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);

  // Smart space-saving Filter Dropdown state
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'paid' | 'due'>('all');
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterDropdown]);

  const activeFiltersCount =
    (period !== 'thisMonth' ? 1 : 0) +
    (selectedWarehouse !== 'all' ? 1 : 0) +
    (paymentStatusFilter !== 'all' ? 1 : 0);

  const clearAllFilters = () => {
    setPeriod('thisMonth');
    setSelectedWarehouse('all');
    setPaymentStatusFilter('all');
    setSearchQuery('');
    setSkuSearchQuery('');
  };

  // Date calculation utilities
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const sevenDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
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
    const [y, m, d] = base.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const yStr = dt.getFullYear();
    const mStr = String(dt.getMonth() + 1).padStart(2, '0');
    const dStr = String(dt.getDate()).padStart(2, '0');
    setSelectedDate(`${yStr}-${mStr}-${dStr}`);
    setPeriod('customDate');
  };

  const formatFriendlyDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Filter bills by date period & status
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const bDate = b.date.slice(0, 10);
      let matchDate = true;
      if (period === 'customDate') matchDate = bDate === selectedDate;
      else if (period === 'today') matchDate = bDate === todayStr;
      else if (period === 'yesterday') matchDate = bDate === yesterdayStr;
      else if (period === 'last7') matchDate = bDate >= sevenDaysAgoStr && bDate <= todayStr;
      else if (period === 'thisMonth') matchDate = bDate.startsWith(currentYearMonth);
      else if (period === 'lastMonth') matchDate = bDate.startsWith(lastYearMonth);
      else if (period === 'customRange') matchDate = (!startDate || bDate >= startDate) && (!endDate || bDate <= endDate);

      if (!matchDate) return false;

      if (paymentStatusFilter === 'paid') {
        return (b.total - b.amountPaid) <= 0;
      }
      if (paymentStatusFilter === 'due') {
        return (b.total - b.amountPaid) > 0;
      }
      return true;
    });
  }, [bills, period, selectedDate, startDate, endDate, todayStr, yesterdayStr, sevenDaysAgoStr, currentYearMonth, lastYearMonth, paymentStatusFilter]);

  // Filter GRNs by date period & warehouse
  const filteredGrns = useMemo(() => {
    return grns.filter((g) => {
      const gDate = (g.inwardDate || '').slice(0, 10);
      let matchesPeriod = true;
      if (period === 'customDate') matchesPeriod = gDate === selectedDate;
      else if (period === 'today') matchesPeriod = gDate === todayStr;
      else if (period === 'yesterday') matchesPeriod = gDate === yesterdayStr;
      else if (period === 'last7') matchesPeriod = gDate >= sevenDaysAgoStr && gDate <= todayStr;
      else if (period === 'thisMonth') matchesPeriod = gDate.startsWith(currentYearMonth);
      else if (period === 'lastMonth') matchesPeriod = gDate.startsWith(lastYearMonth);
      else if (period === 'customRange') matchesPeriod = (!startDate || gDate >= startDate) && (!endDate || gDate <= endDate);

      const matchesWh = selectedWarehouse === 'all' || g.warehouseId === selectedWarehouse;
      return matchesPeriod && matchesWh;
    });
  }, [grns, period, selectedDate, startDate, endDate, selectedWarehouse, todayStr, yesterdayStr, sevenDaysAgoStr, currentYearMonth, lastYearMonth]);

  // Filter Trips by date period
  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      const tDate = t.date.slice(0, 10);
      if (period === 'customDate') return tDate === selectedDate;
      if (period === 'today') return tDate === todayStr;
      if (period === 'yesterday') return tDate === yesterdayStr;
      if (period === 'last7') return tDate >= sevenDaysAgoStr && tDate <= todayStr;
      if (period === 'thisMonth') return tDate.startsWith(currentYearMonth);
      if (period === 'lastMonth') return tDate.startsWith(lastYearMonth);
      if (period === 'customRange') return (!startDate || tDate >= startDate) && (!endDate || tDate <= endDate);
      return true;
    });
  }, [trips, period, selectedDate, startDate, endDate, todayStr, yesterdayStr, sevenDaysAgoStr, currentYearMonth, lastYearMonth]);

  // SALES METRICS
  const totalSalesRevenue = useMemo(() => filteredBills.reduce((sum, b) => sum + b.total, 0), [filteredBills]);
  const totalSalesPaid = useMemo(() => filteredBills.reduce((sum, b) => sum + b.amountPaid, 0), [filteredBills]);
  const totalSalesOutstanding = useMemo(() => totalSalesRevenue - totalSalesPaid, [totalSalesRevenue, totalSalesPaid]);
  const totalCasesSold = useMemo(() => {
    return filteredBills.reduce((sum, b) => sum + b.items.reduce((s, i) => s + i.qty, 0), 0);
  }, [filteredBills]);

  const totalFreeCasesGiven = useMemo(() => {
    return filteredBills.reduce((sum, b) => sum + b.items.reduce((s, i) => s + (i.freeQty || 0), 0), 0);
  }, [filteredBills]);

  const totalDiscountsGiven = useMemo(() => {
    return filteredBills.reduce((sum, b) => sum + b.items.reduce((s, i) => s + (i.discount || 0), 0), 0);
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
        const billed = item.chargeableQty !== undefined ? item.chargeableQty : item.qty;
        const free = item.freeQty || 0;
        const totalCs = item.qty + (item.freeQty && item.chargeableQty === item.qty ? item.freeQty : 0);
        const gross = item.gross || (item.qty * item.rate);
        const disc = item.discount || 0;
        const net = item.amount || (gross - disc);

        if (!existing) {
          map.set(item.productId, {
            productId: item.productId,
            productName: item.productName || prod?.name || `Product #${item.productId}`,
            category: item.category || prod?.category || 'general',
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
    let totalSellingValuation = 0;

    products.forEach((p) => {
      const rem = remainingStock(p.id);
      totalCrates += rem;
      const costPrice = p.effectiveCost || p.cost || 0;
      totalCostValuation += rem * costPrice;
      totalSellingValuation += rem * (p.wholesale || p.retail || costPrice);
    });

    const potentialGrossProfit = totalSellingValuation - totalCostValuation;
    const marginPct = totalSellingValuation > 0 ? (potentialGrossProfit / totalSellingValuation) * 100 : 0;

    return {
      totalCrates,
      totalCostValuation,
      totalSellingValuation,
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
      const item = { ...b, productName: prod?.name || `Product #${b.productId}` };

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
      totalCratesInward += g.totalReceivedQty || g.items.reduce((s, i) => s + i.qty + (i.freeQty || 0), 0);
      totalGstPaid += g.totalTax || (g.totalCgst + g.totalSgst) || 0;
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
      const balance = b.total - b.amountPaid;
      if (balance <= 0) return;

      const key = b.retailer.trim().toLowerCase();
      if (!partyMap[key]) {
        partyMap[key] = {
          retailer: b.retailer,
          phone: b.phone || '',
          totalBilled: 0,
          totalPaid: 0,
          balance: 0,
          billsCount: 0,
          lastBillDate: b.date,
          aging: { current: 0, due15: 0, overdue30: 0 },
        };
      }

      const party = partyMap[key];
      party.totalBilled += b.total;
      party.totalPaid += b.amountPaid;
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
    let outputTaxable = 0;
    let outputCgst = 0;
    let outputSgst = 0;
    let outputCess = 0;

    filteredBills.forEach((b) => {
      b.items.forEach((item) => {
        const itemLineVal = item.qty * item.rate;
        const discVal = item.discount || 0;
        const taxable = itemLineVal - discVal;
        outputTaxable += taxable;

        const rate = item.gst || 0;
        if (rate > 0) {
          outputCgst += (taxable * (rate / 2)) / 100;
          outputSgst += (taxable * (rate / 2)) / 100;
        }
        if (item.category === 'energy') {
          // 12% Compensation Cess on caffeinated drinks
          outputCess += taxable * 0.12;
        }
      });
    });

    const totalOutputGst = outputCgst + outputSgst + outputCess;
    const inputGstCredit = purchaseStats.totalGstPaid + purchaseStats.totalCessPaid;
    const netGstPayable = Math.max(0, totalOutputGst - inputGstCredit);

    return {
      outputTaxable,
      outputCgst,
      outputSgst,
      outputCess,
      totalOutputGst,
      inputGstCredit,
      netGstPayable,
    };
  }, [filteredBills, purchaseStats]);

  // Export current active report as CSV
  const handleExportCsv = () => {
    let csvContent = '';
    let filename = `report-${activeReport}-${period}.csv`;

    if (activeReport === 'sales') {
      const dateTag =
        period === 'customDate'
          ? selectedDate
          : period === 'today'
          ? todayStr
          : period === 'yesterday'
          ? yesterdayStr
          : period === 'customRange'
          ? `${startDate}_to_${endDate}`
          : period;
      filename = `sales-report-${dateTag}.csv`;

      csvContent = `"SALES & DISPATCH REPORT - ${orgProfile?.name || 'Radhika Beverages'}"\n`;
      csvContent += `"Report Period: ${dateTag}"\n`;
      csvContent += `"Generated On: ${new Date().toLocaleString('en-IN')}"\n`;
      csvContent += `"Total Invoices: ${filteredBills.length}, Total Gross Turnover: ${totalSalesRevenue}, Total Cases: ${totalCasesSold}, Cash/UPI Collected: ${totalSalesPaid}, Outstanding Credit: ${totalSalesOutstanding}"\n\n`;

      csvContent += '--- INVOICING REGISTER ---\n';
      csvContent += 'Invoice No,Date,Retailer,Phone,Items Count,Gross Total,Amount Paid,Balance Due,Status\n';
      filteredBills.forEach((b) => {
        const itemsCount = b.items.reduce((s, i) => s + i.qty, 0);
        const bal = b.total - b.amountPaid;
        const st = statusOf(b.total, b.amountPaid);
        csvContent += `"${b.id}","${b.date}","${b.retailer.replace(/"/g, '""')}","${b.phone || ''}",${itemsCount},${b.total},${b.amountPaid},${bal},"${st.label.toUpperCase()}"\n`;
      });

      if (productWiseSales.length > 0) {
        csvContent += '\n--- PRODUCT-WISE / SKU SALES BREAKDOWN ---\n';
        csvContent += 'Product ID,Beverage SKU Name,Category,Invoices,Billed Cases,Free Cases,Total Cases,Gross Revenue,Discounts,Net Sales Amount\n';
        productWiseSales.forEach((p) => {
          csvContent += `${p.productId},"${p.productName.replace(/"/g, '""')}","${p.category}",${p.invoicesCount},${p.casesBilled},${p.casesFree},${p.totalCases},${p.grossRevenue},${p.discounts},${p.netRevenue}\n`;
        });
      }
    } else if (activeReport === 'inventory') {
      csvContent = 'Product ID,Beverage SKU Name,Category,Remaining Crates,Landed Cost,Wholesale Rate,Cost Valuation,Selling Valuation,Margin\n';
      products.forEach((p) => {
        const rem = remainingStock(p.id);
        const cost = p.effectiveCost || p.cost || 0;
        const whole = p.wholesale || p.retail || cost;
        const costVal = rem * cost;
        const sellVal = rem * whole;
        csvContent += `${p.id},"${p.name.replace(/"/g, '""')}","${p.category}",${rem},${cost},${whole},${costVal},${sellVal},${sellVal - costVal}\n`;
      });
    } else if (activeReport === 'purchases') {
      csvContent = 'GRN No,Invoice Date,Supplier Name,Supplier Invoice,Warehouse,Crates Received,Total Value,Payment Status\n';
      filteredGrns.forEach((g) => {
        const crates = g.totalReceivedQty || g.items.reduce((s, i) => s + i.qty + (i.freeQty || 0), 0);
        const whName = warehouses.find((w) => w.id === g.warehouseId)?.name || 'Godown';
        csvContent += `"${g.id}","${g.inwardDate || ''}","${g.supplierName.replace(/"/g, '""')}","${g.invoiceNo || ''}","${whName}",${crates},${g.grandTotal},"Received"\n`;
      });
    } else if (activeReport === 'receivables') {
      csvContent = 'Retailer Party,Phone,Total Invoices,Total Billed,Total Paid,Current Balance Due,0-15 Days,16-30 Days,30+ Days Overdue\n';
      debtorsLedger.forEach((d) => {
        csvContent += `"${d.retailer.replace(/"/g, '""')}","${d.phone}",${d.billsCount},${d.totalBilled},${d.totalPaid},${d.balance},${d.aging.current},${d.aging.due15},${d.aging.overdue30}\n`;
      });
    } else if (activeReport === 'trips') {
      csvContent = 'Trip No,Date,Vehicle,Status,Loaded Crates,Delivered Crates,Returned Empty,Discrepancy Cases\n';
      filteredTrips.forEach((t) => {
        const { rows } = tripBreakdown(t);
        const loaded = Object.values(t.loaded).reduce((s, v) => s + v, 0);
        const returned = Object.values(t.returned).reduce((s, v) => s + v, 0);
        const delivered = rows.reduce((s, r) => s + r.sold, 0);
        const disc = rows.reduce((s, r) => s + r.discrepancy, 0);
        csvContent += `"${t.id}","${t.date}","${t.vehicle}","${t.status}",${loaded},${delivered},${returned},${disc}\n`;
      });
    } else if (activeReport === 'tax') {
      csvContent = 'Tax Component,Taxable Base,Rate / Rules,Tax Amount\n';
      csvContent += `Output Taxable Turnover,${gstTaxSummary.outputTaxable},GST B2B/B2C,${gstTaxSummary.outputTaxable}\n`;
      csvContent += `Output CGST,${gstTaxSummary.outputTaxable},Central GST,${gstTaxSummary.outputCgst}\n`;
      csvContent += `Output SGST,${gstTaxSummary.outputTaxable},State GST,${gstTaxSummary.outputSgst}\n`;
      csvContent += `Compensation Cess,${gstTaxSummary.outputTaxable},12% on Energy Drinks,${gstTaxSummary.outputCess}\n`;
      csvContent += `Input Tax Credit (ITC),${purchaseStats.netPurchaseVal},Supplier Tax Invoices,${gstTaxSummary.inputGstCredit}\n`;
      csvContent += `Net GST Payable to Govt,${gstTaxSummary.outputTaxable},Output - ITC,${gstTaxSummary.netGstPayable}\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderWidth: 2,
  };

  const reportTabs: { id: ReportSection; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'sales', label: 'Sales & Revenue', icon: TrendingUp },
    { id: 'inventory', label: 'Inventory & Valuation', icon: Boxes },
    { id: 'purchases', label: 'Inward & Purchases', icon: ArrowDownToLine },
    { id: 'receivables', label: 'Party Credit & Debtor Aging', icon: Users },
    { id: 'trips', label: 'Trip Pilferage & Logistics', icon: Truck },
    { id: 'tax', label: 'GST Tax & Compliance', icon: ShieldCheck },
  ];

  return (
    <div id="view-reports" className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b-2" style={{ borderColor: palette.line }}>
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={Math.round(24 * scale)} style={{ color: palette.amber }} aria-hidden="true" />
            <h1 style={fz(26, { fontWeight: 700, color: palette.ink })}>Reports</h1>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="btn-print-report"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 border-2 rounded focus-ring cursor-pointer transition-colors"
            style={{
              backgroundColor: palette.panel,
              borderColor: palette.line,
              color: palette.ink,
              ...fz(13, { fontWeight: 600 }),
            }}
          >
            <Printer size={15} />
            Print Report
          </button>

          <button
            id="btn-export-report-csv"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-4 py-2 border-2 rounded focus-ring cursor-pointer transition-colors"
            style={{
              backgroundColor: palette.navy,
              borderColor: palette.navy,
              color: '#FFFFFF',
              ...fz(13, { fontWeight: 700 }),
            }}
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Smart Space-Saving Filter & Search Bar (Inventory & Product pattern) */}
      <div className="space-y-2">
        <div
          className="p-2 sm:p-2.5 border-2 rounded-lg flex flex-wrap items-center justify-between gap-2.5 relative"
          style={cardStyle}
        >
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              id="input-reports-search"
              placeholder={
                activeReport === 'sales'
                  ? 'Search by invoice #, retailer, phone, or route...'
                  : activeReport === 'inventory'
                  ? 'Search SKU, brand, or pack size...'
                  : activeReport === 'purchases'
                  ? 'Search consignment, supplier, or invoice #...'
                  : 'Search records or items...'
              }
              value={activeReport === 'inventory' ? skuSearchQuery : searchQuery}
              onChange={(e) => {
                if (activeReport === 'inventory') {
                  setSkuSearchQuery(e.target.value);
                } else {
                  setSearchQuery(e.target.value);
                }
              }}
              className="w-full pl-9 pr-8 py-1.5 text-xs sm:text-sm border-2 rounded bg-white focus:outline-none focus:border-blue-900 transition-colors"
              style={{ borderColor: palette.line, color: palette.ink }}
            />
            {(activeReport === 'inventory' ? skuSearchQuery : searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  if (activeReport === 'inventory') setSkuSearchQuery('');
                  else setSearchQuery('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Quick Period Summary Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded border border-slate-200 text-xs font-semibold text-slate-700">
            <Calendar size={13} className="text-blue-900" />
            <span>
              {period === 'today'
                ? 'Today'
                : period === 'yesterday'
                ? 'Yesterday'
                : period === 'thisMonth'
                ? 'This Month'
                : period === 'lastMonth'
                ? 'Last Month'
                : period === 'last7'
                ? 'Last 7 Days'
                : period === 'customDate'
                ? formatFriendlyDate(selectedDate)
                : period === 'customRange'
                ? `${formatFriendlyDate(startDate)} - ${formatFriendlyDate(endDate)}`
                : 'All Time'}
            </span>
            {selectedWarehouse !== 'all' && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-blue-900 font-bold truncate max-w-[130px]">
                  {warehouses.find((w) => w.id === selectedWarehouse)?.name || 'Godown'}
                </span>
              </>
            )}
          </div>

          {/* Filter Dropdown Trigger Button & Popover */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              type="button"
              id="btn-report-filters-toggle"
              onClick={() => setShowFilterDropdown((prev) => !prev)}
              className={`flex items-center gap-2 px-3 py-1.5 border-2 rounded text-xs sm:text-sm font-bold cursor-pointer transition-colors focus-ring ${
                showFilterDropdown || activeFiltersCount > 0
                  ? 'bg-blue-900 text-white border-blue-900'
                  : 'bg-white hover:bg-slate-50 text-slate-800'
              }`}
              style={{
                borderColor: showFilterDropdown || activeFiltersCount > 0 ? palette.navy : palette.line,
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
                className={`transition-transform duration-200 ${showFilterDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Smart Filter Dropdown Popover */}
            {showFilterDropdown && (
              <div
                id="popover-report-filters"
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border-2 rounded-xl shadow-2xl z-50 p-4 space-y-4 animate-in fade-in duration-150"
                style={{ borderColor: palette.navy }}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal size={15} className="text-blue-900" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Report Horizon & Filters
                    </span>
                  </div>
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
                </div>

                {/* Filter Option 1: Time Horizon */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1">
                    <Calendar size={12} /> Time Horizon / Period:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                    {[
                      { id: 'today', label: 'Today' },
                      { id: 'yesterday', label: 'Yesterday' },
                      { id: 'thisMonth', label: 'This Month' },
                      { id: 'lastMonth', label: 'Last Month' },
                      { id: 'last7', label: 'Last 7 Days' },
                      { id: 'customDate', label: 'Particular Date' },
                      { id: 'customRange', label: 'Date Range' },
                      { id: 'all', label: 'All Time' },
                    ].map((p) => {
                      const active = period === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          id={`filter-period-${p.id}`}
                          onClick={() => {
                            setPeriod(p.id as ReportPeriod);
                            if (p.id === 'today') setSelectedDate(todayStr);
                            if (p.id === 'yesterday') setSelectedDate(yesterdayStr);
                          }}
                          className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer text-center transition-all ${
                            active
                              ? 'bg-blue-900 text-white shadow-xs'
                              : 'text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Date Range Controls inside popover */}
                {period === 'customRange' && (
                  <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 space-y-2">
                    <span className="text-[11px] font-bold text-blue-950 block">Custom Date Span:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500 block mb-0.5">From:</span>
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
                        <span className="text-[10px] font-semibold text-slate-500 block mb-0.5">To:</span>
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
                    className="w-full border-2 px-2.5 py-1.5 text-xs font-semibold rounded bg-white focus:outline-none focus:border-blue-900"
                    style={{ borderColor: palette.line, color: palette.ink }}
                  >
                    <option value="all">All Godowns & Depots ({warehouses.length})</option>
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
                      { id: 'all', label: 'All Bills' },
                      { id: 'paid', label: 'Fully Paid' },
                      { id: 'due', label: 'Pending Due' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setPaymentStatusFilter(item.id as any)}
                        className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer text-center transition-colors ${
                          paymentStatusFilter === item.id
                            ? 'bg-blue-900 text-white shadow-xs'
                            : 'text-slate-700 hover:bg-slate-200'
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
                    className="px-4 py-1.5 text-xs font-bold rounded bg-blue-900 text-white hover:bg-blue-950 cursor-pointer shadow-xs"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sub-bar: Particular Single Date Selector & Quick Navigation (shown only when customDate is active) */}
        {period === 'customDate' && (
          <div
            className="p-2 sm:p-2.5 border-2 rounded-lg flex flex-wrap items-center justify-between gap-3 bg-white"
            style={{ borderColor: palette.line }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Calendar size={13} className="text-blue-900" /> Particular Date:
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
                  className="border-2 px-2.5 py-1 text-xs font-black rounded bg-white shadow-xs"
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
                    className="px-2 py-1 text-xs font-bold text-blue-900 hover:underline cursor-pointer"
                  >
                    Today
                  </button>
                )}
              </div>

              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
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
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                    style={{ borderColor: selectedDate === d ? palette.navy : palette.line }}
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active Filters:</span>
            {period !== 'thisMonth' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-900 border border-blue-200">
                Period: {period}
                <button
                  type="button"
                  onClick={() => setPeriod('thisMonth')}
                  className="hover:text-blue-950 cursor-pointer"
                  title="Reset to this month"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {selectedWarehouse !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                Godown: {warehouses.find((w) => w.id === selectedWarehouse)?.name || selectedWarehouse}
                <button
                  type="button"
                  onClick={() => setSelectedWarehouse('all')}
                  className="hover:text-emerald-950 cursor-pointer"
                  title="Remove facility filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {paymentStatusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-200">
                Payment: {paymentStatusFilter === 'paid' ? 'Paid Only' : 'Due Only'}
                <button
                  type="button"
                  onClick={() => setPaymentStatusFilter('all')}
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
              className="text-xs text-blue-900 hover:underline font-bold cursor-pointer ml-1"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Category Pills Navigation */}
      <div
        role="tablist"
        aria-label="Report Categories"
        className="flex items-center gap-2 overflow-x-auto pb-1 border-b-2"
        style={{ borderColor: palette.line }}
      >
        {reportTabs.map(({ id, label, icon: Icon }) => {
          const active = activeReport === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveReport(id)}
              className="flex items-center gap-2 border-b-2 px-4 py-2.5 whitespace-nowrap cursor-pointer transition-all"
              style={{
                borderColor: active ? palette.navy : 'transparent',
                backgroundColor: active ? `${palette.navy}10` : 'transparent',
                color: active ? palette.navy : palette.muted,
                fontWeight: active ? 700 : 600,
                ...fz(14),
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* 1. SALES & REVENUE REPORT                                */}
      {/* ======================================================== */}
      {activeReport === 'sales' && (
        <div className="space-y-6">
          {/* Printable Executive DSR Header (Visible only when printed) */}
          <div className="hidden print:block mb-4 border-b-2 pb-3">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black text-black">{orgProfile?.name || 'Radhika Beverages'}</h1>
                <p className="text-xs text-neutral-700">
                  {orgProfile?.address || 'Depot Area, Station Road'}, {orgProfile?.city || ''} | Ph: {orgProfile?.phone || ''}
                </p>
                {orgProfile?.gstin && (
                  <p className="text-xs font-mono font-bold text-neutral-800">GSTIN: {orgProfile.gstin}</p>
                )}
              </div>
              <div className="text-right">
                <h2 className="text-lg font-black text-neutral-900 uppercase">
                  {period === 'customDate' || period === 'today' || period === 'yesterday'
                    ? 'DAILY SALES CLOSURE REPORT (DSR)'
                    : 'SALES & INVOICING REPORT'}
                </h2>
                <p className="text-xs font-bold text-neutral-800">
                  Date:{' '}
                  {period === 'customDate'
                    ? formatFullDate(selectedDate)
                    : period === 'today'
                    ? formatFullDate(todayStr)
                    : period === 'yesterday'
                    ? formatFullDate(yesterdayStr)
                    : period === 'customRange'
                    ? `${formatFriendlyDate(startDate)} to ${formatFriendlyDate(endDate)}`
                    : period}
                </p>
                <p className="text-[11px] text-neutral-600">Generated: {new Date().toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>

          {/* Daily Sales Closure (DSR) Date Banner */}
          {(period === 'customDate' || period === 'today' || period === 'yesterday') && (
            <div
              className="p-4 border-2 rounded flex flex-wrap items-center justify-between gap-3 bg-blue-50/70"
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
                    <h3 className="text-base font-black tracking-tight" style={{ color: palette.navy }}>
                      Daily Sales Report (DSR)
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                      {period === 'today' ? "Today's Ledger" : period === 'yesterday' ? "Yesterday's Ledger" : "Selected Date"}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">
                    {formatFullDate(period === 'today' ? todayStr : period === 'yesterday' ? yesterdayStr : selectedDate)}
                  </p>
                </div>
              </div>

              {/* Quick Navigation Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => shiftSelectedDate(-1)}
                  className="px-2.5 py-1.5 text-xs font-bold border-2 rounded bg-white hover:bg-slate-50 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  style={{ borderColor: palette.line, color: palette.ink }}
                  title="Previous Day"
                >
                  <ChevronLeft size={14} />
                  Prev Day
                </button>

                <input
                  type="date"
                  value={period === 'today' ? todayStr : period === 'yesterday' ? yesterdayStr : selectedDate}
                  max={todayStr}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setPeriod('customDate');
                    }
                  }}
                  className="border-2 px-3 py-1 text-xs font-black rounded bg-white shadow-2xs cursor-pointer"
                  style={{ borderColor: palette.navy, color: palette.ink }}
                />

                <button
                  type="button"
                  onClick={() => shiftSelectedDate(1)}
                  disabled={(period === 'today' ? todayStr : period === 'yesterday' ? yesterdayStr : selectedDate) >= todayStr}
                  className="px-2.5 py-1.5 text-xs font-bold border-2 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
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
                  className="px-3 py-1.5 text-xs font-bold rounded bg-slate-800 text-white hover:bg-slate-900 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Print Daily Sales Report"
                >
                  <Printer size={13} />
                  Print DSR
                </button>
              </div>
            </div>
          )}

          {/* KPI Snapshot Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-3.5 border-2 rounded shadow-2xs" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold flex items-center justify-between">
                <span>Gross Turnover</span>
                <Coins size={14} className="text-emerald-600" />
              </div>
              <div className="text-xl font-black mt-1 text-emerald-700">₹{money(totalSalesRevenue)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{filteredBills.length} invoices recorded</div>
            </div>

            <div className="p-3.5 border-2 rounded shadow-2xs" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold flex items-center justify-between">
                <span>Cases Distributed</span>
                <Package size={14} style={{ color: palette.navy }} />
              </div>
              <div className="text-xl font-black mt-1" style={{ color: palette.navy }}>
                {totalCasesSold} <span className="text-xs font-normal text-slate-500">crates</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Avg {filteredBills.length > 0 ? (totalCasesSold / filteredBills.length).toFixed(1) : 0} cs / bill
              </div>
            </div>

            <div className="p-3.5 border-2 rounded shadow-2xs" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold flex items-center justify-between">
                <span>Cash / UPI Received</span>
                <CheckCircle2 size={14} className="text-blue-600" />
              </div>
              <div className="text-xl font-black mt-1 text-blue-700">₹{money(totalSalesPaid)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {totalSalesRevenue > 0 ? `${((totalSalesPaid / totalSalesRevenue) * 100).toFixed(0)}% recovery rate` : 'No revenue'}
              </div>
            </div>

            <div className="p-3.5 border-2 rounded shadow-2xs" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold flex items-center justify-between">
                <span>Pending Market Credit</span>
                <AlertTriangle size={14} className={totalSalesOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600'} />
              </div>
              <div className={`text-xl font-black mt-1 ${totalSalesOutstanding > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                ₹{money(totalSalesOutstanding)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Market receivables due</div>
            </div>

            <div className="p-3.5 border-2 rounded shadow-2xs col-span-2 lg:col-span-1" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold flex items-center justify-between">
                <span>Trade Schemes Given</span>
                <Tag size={14} className="text-amber-600" />
              </div>
              <div className="text-xl font-black mt-1 text-amber-700">
                {totalFreeCasesGiven} <span className="text-xs font-normal text-slate-500">free cs</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                ₹{money(totalDiscountsGiven)} discounts applied
              </div>
            </div>
          </div>

          {/* SKU-Wise / Beverage Dispatches Summary on this Date */}
          <div className="border-2 p-5 rounded space-y-4" style={cardStyle}>
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
                <p style={fz(12.5, { color: palette.muted })}>
                  Crate-level breakdown of beverages sold, schemes dispensed, and revenue per SKU.
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
              <div className="text-center py-6 text-slate-500 text-xs italic">
                No product dispatches found for this selection.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={fz(13)}>
                  <thead>
                    <tr
                      className="border-b-2 text-xs uppercase tracking-wider text-slate-500 bg-slate-50/60"
                      style={{ borderColor: palette.line }}
                    >
                      <th className="px-3 py-2 font-bold">Beverage SKU</th>
                      <th className="px-3 py-2 font-bold">Category</th>
                      <th className="px-3 py-2 font-bold text-center">Invoices</th>
                      <th className="px-3 py-2 font-bold text-right">Billed Cases</th>
                      <th className="px-3 py-2 font-bold text-right">Free Cases</th>
                      <th className="px-3 py-2 font-bold text-right">Total Crates</th>
                      <th className="px-3 py-2 font-bold text-right">Gross (₹)</th>
                      <th className="px-3 py-2 font-bold text-right">Discounts (₹)</th>
                      <th className="px-3 py-2 font-bold text-right">Net Sales (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productWiseSales
                      .filter(
                        (p) =>
                          !skuSearchQuery ||
                          p.productName.toLowerCase().includes(skuSearchQuery.toLowerCase()) ||
                          p.category.toLowerCase().includes(skuSearchQuery.toLowerCase())
                      )
                      .map((p) => {
                        const cat = CATS[p.category as keyof typeof CATS];
                        return (
                          <tr
                            key={p.productId}
                            className="border-b last:border-b-0 hover:bg-slate-50/60 transition-colors"
                            style={{ borderColor: palette.line }}
                          >
                            <td className="px-3 py-2.5 font-bold text-slate-900">{p.productName}</td>
                            <td className="px-3 py-2.5">
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-blue-50 text-blue-900 border border-blue-200">
                                {cat?.name || p.category}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono text-slate-600">{p.invoicesCount}</td>
                            <td className="px-3 py-2.5 text-right font-medium">{p.casesBilled} cs</td>
                            <td className="px-3 py-2.5 text-right font-medium text-amber-700">
                              {p.casesFree > 0 ? `+${p.casesFree} cs` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-black" style={{ color: palette.navy }}>
                              {p.totalCases} cs
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-600">₹{money(p.grossRevenue)}</td>
                            <td className="px-3 py-2.5 text-right text-amber-700">
                              {p.discounts > 0 ? `-₹${money(p.discounts)}` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-black text-emerald-800">
                              ₹{money(p.netRevenue)}
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
                        {productWiseSales.reduce((s, p) => s + p.casesBilled, 0)} cs
                      </td>
                      <td className="px-3 py-2.5 text-right text-amber-800">
                        +{productWiseSales.reduce((s, p) => s + p.casesFree, 0)} cs
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-950 text-sm">
                        {totalCasesSold} cs
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        ₹{money(productWiseSales.reduce((s, p) => s + p.grossRevenue, 0))}
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

          {/* Sales & Invoicing Register Table */}
          <div className="border-2 p-5 rounded space-y-4" style={cardStyle}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 style={fz(16, { fontWeight: 700, color: palette.ink })}>Invoicing Register (Bills)</h3>
                <p style={fz(12.5, { color: palette.muted })}>
                  Individual tax invoices generated on{' '}
                  {period === 'customDate'
                    ? formatFullDate(selectedDate)
                    : period === 'today'
                    ? 'Today'
                    : period === 'yesterday'
                    ? 'Yesterday'
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
                  <input
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
              <div className="text-center py-10 px-4 border border-dashed rounded bg-slate-50/50 space-y-3">
                <Receipt size={32} className="mx-auto text-slate-400 opacity-60" />
                <p className="text-sm font-bold text-slate-700">
                  No sales invoices recorded for{' '}
                  {period === 'customDate'
                    ? formatFullDate(selectedDate)
                    : period === 'today'
                    ? 'Today'
                    : period === 'yesterday'
                    ? 'Yesterday'
                    : period}
                  .
                </p>
                {datesWithBills.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-slate-500 mb-2">
                      Jump to available dates with sales records:
                    </p>
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {datesWithBills.slice(0, 6).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            setSelectedDate(d);
                            setPeriod('customDate');
                          }}
                          className="px-2.5 py-1 text-xs font-bold border-2 rounded bg-white hover:bg-blue-50 text-blue-900 border-blue-200 cursor-pointer shadow-2xs"
                        >
                          {formatFriendlyDate(d)} ({bills.filter((b) => b.date.slice(0, 10) === d).length} bills)
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setPeriod('all')}
                    className="px-3 py-1.5 text-xs font-bold rounded bg-slate-200 text-slate-800 hover:bg-slate-300 cursor-pointer"
                  >
                    View All Time History
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={fz(13)}>
                  <thead>
                    <tr
                      className="border-b-2 text-xs uppercase tracking-wider text-slate-500 bg-slate-50/60"
                      style={{ borderColor: palette.line }}
                    >
                      <th className="px-3 py-2 font-bold"># Invoice</th>
                      <th className="px-3 py-2 font-bold">Date & Time</th>
                      <th className="px-3 py-2 font-bold">Retailer Party</th>
                      <th className="px-3 py-2 font-bold text-right">Crates</th>
                      <th className="px-3 py-2 font-bold text-right">Total Bill</th>
                      <th className="px-3 py-2 font-bold text-right">Paid</th>
                      <th className="px-3 py-2 font-bold text-right">Balance</th>
                      <th className="px-3 py-2 font-bold text-center">Status</th>
                      <th className="px-3 py-2 font-bold text-center no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBills
                      .filter(
                        (b) =>
                          !searchQuery ||
                          b.retailer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          String(b.id).includes(searchQuery)
                      )
                      .map((b) => {
                        const bal = b.total - b.amountPaid;
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
                                className="text-blue-900 hover:underline cursor-pointer flex items-center gap-1 font-bold"
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
                            <td className="px-3 py-2.5 text-right font-medium">{crates} cs</td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                              ₹{money(b.total)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-emerald-700 font-medium">
                              ₹{money(b.amountPaid)}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right font-bold ${
                                bal > 0 ? 'text-rose-700' : 'text-emerald-700'
                              }`}
                            >
                              ₹{money(bal)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10.5px] font-bold uppercase ${
                                  isPaid
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {isPaid ? 'Paid' : 'Due'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center no-print">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setViewingBill(b)}
                                  className="px-2 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-100 text-blue-900 flex items-center gap-1 cursor-pointer transition-colors"
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
                      <td className="px-3 py-2.5 text-right">{totalCasesSold} cs</td>
                      <td className="px-3 py-2.5 text-right text-slate-900">₹{money(totalSalesRevenue)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-800">₹{money(totalSalesPaid)}</td>
                      <td className="px-3 py-2.5 text-right text-rose-800">₹{money(totalSalesOutstanding)}</td>
                      <td className="px-3 py-2.5 text-center text-slate-500" colSpan={2}>
                        {totalSalesRevenue > 0
                          ? `${((totalSalesPaid / totalSalesRevenue) * 100).toFixed(0)}% Settled`
                          : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. INVENTORY & VALUATION REPORT                          */}
      {/* ======================================================== */}
      {activeReport === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 border-2 rounded" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold">Total Stock on Hand</div>
              <div className="text-2xl font-black mt-1" style={{ color: palette.navy }}>
                {inventoryStats.totalCrates} <span className="text-xs font-normal text-slate-500">crates</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{products.length} SKU beverage lines</div>
            </div>

            <div className="p-4 border-2 rounded" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold">Stock Value (at Landed Cost)</div>
              <div className="text-2xl font-black mt-1 text-slate-800">₹{money(inventoryStats.totalCostValuation)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Asset purchase value</div>
            </div>

            <div className="p-4 border-2 rounded" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold">Stock Value (at Wholesale Rate)</div>
              <div className="text-2xl font-black mt-1 text-emerald-700">₹{money(inventoryStats.totalSellingValuation)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Expected realization</div>
            </div>

            <div className="p-4 border-2 rounded" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold">Potential Gross Profit</div>
              <div className="text-2xl font-black mt-1 text-blue-700">
                ₹{money(inventoryStats.potentialGrossProfit)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">~{inventoryStats.marginPct.toFixed(1)}% gross margin</div>
            </div>
          </div>

          {/* Expiry Risk Radar */}
          {(expiryRadar.expired.length > 0 || expiryRadar.critical.length > 0) && (
            <div className="border-2 p-4 rounded bg-rose-50 border-rose-300">
              <div className="flex items-center gap-2 font-bold text-rose-900 text-sm mb-2">
                <AlertTriangle size={18} />
                Batch Expiry Alerts ({expiryRadar.expired.length + expiryRadar.critical.length} batches requiring attention)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {expiryRadar.expired.map((b, idx) => (
                  <div key={idx} className="bg-white border border-rose-300 p-2.5 rounded text-xs">
                    <span className="font-bold text-rose-900 block">{b.productName}</span>
                    <span className="text-slate-600">Batch: {b.batchNumber} | {b.quantity} cases</span>
                    <span className="block text-rose-700 font-semibold">Expired on {b.expiryDate}</span>
                  </div>
                ))}
                {expiryRadar.critical.map((b, idx) => (
                  <div key={idx} className="bg-white border border-amber-300 p-2.5 rounded text-xs">
                    <span className="font-bold text-amber-900 block">{b.productName}</span>
                    <span className="text-slate-600">Batch: {b.batchNumber} | {b.quantity} cases</span>
                    <span className="block text-amber-700 font-semibold">Expires soon ({b.expiryDate})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product Valuation Table */}
          <div className="border-2 p-5 rounded" style={cardStyle}>
            <h3 style={fz(17, { fontWeight: 700, color: palette.ink, marginBottom: '0.25rem' })}>
              Stock Valuation & Margin Analysis
            </h3>
            <p style={fz(13, { color: palette.muted, marginBottom: '1rem' })}>
              Current crate balances, purchase rates, wholesale prices, and unrealized profit per SKU.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left" style={fz(13.5)}>
                <thead>
                  <tr className="border-b-2 text-xs uppercase tracking-wider text-slate-500" style={{ borderColor: palette.line }}>
                    <th className="px-3 py-2 font-bold">Beverage Item</th>
                    <th className="px-3 py-2 font-bold">Category</th>
                    <th className="px-3 py-2 font-bold text-right">Available Stock</th>
                    <th className="px-3 py-2 font-bold text-right">Landed Cost</th>
                    <th className="px-3 py-2 font-bold text-right">Wholesale Rate</th>
                    <th className="px-3 py-2 font-bold text-right">Asset Cost</th>
                    <th className="px-3 py-2 font-bold text-right">Wholesale Realization</th>
                    <th className="px-3 py-2 font-bold text-right">Margin / Case</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const rem = remainingStock(p.id);
                    const cost = p.effectiveCost || p.cost || 0;
                    const whole = p.wholesale || p.retail || cost;
                    const costVal = rem * cost;
                    const sellVal = rem * whole;
                    const margin = whole - cost;
                    return (
                      <tr key={p.id} className="border-b last:border-b-0 hover:bg-slate-50/50" style={{ borderColor: palette.line }}>
                        <td className="px-3 py-2.5 font-bold text-slate-900">{p.name}</td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-slate-100 text-slate-700">
                            {p.category}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-right font-black ${rem < 5 ? 'text-rose-700' : 'text-slate-900'}`}>
                          {rem} cs
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">₹{money(cost)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">₹{money(whole)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-700">₹{money(costVal)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-800">₹{money(sellVal)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-blue-800">+₹{money(margin)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. INWARD & PURCHASES REPORT                             */}
      {/* ======================================================== */}
      {activeReport === 'purchases' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 border-2 rounded" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold">Total Purchases (Net)</div>
              <div className="text-2xl font-black mt-1 text-slate-900">₹{money(purchaseStats.netPurchaseVal)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Across {filteredGrns.length} consignments</div>
            </div>

            <div className="p-4 border-2 rounded" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold">Inward Crates Received</div>
              <div className="text-2xl font-black mt-1" style={{ color: palette.navy }}>
                {purchaseStats.totalCratesInward} <span className="text-xs font-normal text-slate-500">crates</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Supplied to depots</div>
            </div>

            <div className="p-4 border-2 rounded" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold">Input GST Tax Paid (ITC)</div>
              <div className="text-2xl font-black mt-1 text-indigo-700">₹{money(purchaseStats.totalGstPaid)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Available to offset output GST</div>
            </div>

            <div className="p-4 border-2 rounded" style={cardStyle}>
              <div className="text-xs text-slate-500 font-semibold">Compensation Cess Paid</div>
              <div className="text-2xl font-black mt-1 text-amber-700">₹{money(purchaseStats.totalCessPaid)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">On carbonated/caffeinated drinks</div>
            </div>
          </div>

          {/* Consignments List */}
          <div className="border-2 p-5 rounded" style={cardStyle}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 style={fz(17, { fontWeight: 700, color: palette.ink })}>Inward Invoices & Consignments Log</h3>
                <p style={fz(13, { color: palette.muted })}>Goods received vouchers from manufacturers & super-stockists.</p>
              </div>
              <button
                onClick={() => setTab('inventory')}
                className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1"
              >
                Open Inward Workspace <ArrowRight size={13} />
              </button>
            </div>

            {filteredGrns.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No inward invoices recorded for {period}. Receive a consignment in Inventory to view purchase history.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={fz(13.5)}>
                  <thead>
                    <tr className="border-b-2 text-xs uppercase tracking-wider text-slate-500" style={{ borderColor: palette.line }}>
                      <th className="px-3 py-2 font-bold">GRN #</th>
                      <th className="px-3 py-2 font-bold">Date</th>
                      <th className="px-3 py-2 font-bold">Supplier</th>
                      <th className="px-3 py-2 font-bold">Invoice Ref</th>
                      <th className="px-3 py-2 font-bold">Godown</th>
                      <th className="px-3 py-2 font-bold text-right">Crates</th>
                      <th className="px-3 py-2 font-bold text-right">Total Invoiced</th>
                      <th className="px-3 py-2 font-bold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGrns.map((g) => {
                      const wh = warehouses.find((w) => w.id === g.warehouseId);
                      const crates = g.items.reduce((s, i) => s + i.qty, 0);
                      return (
                        <tr key={g.id} className="border-b last:border-b-0 hover:bg-slate-50/50" style={{ borderColor: palette.line }}>
                          <td className="px-3 py-2.5 font-bold font-mono text-blue-900">{g.id}</td>
                          <td className="px-3 py-2.5 text-slate-600">{g.inwardDate || '—'}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-900">{g.supplierName}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{g.invoiceNo || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-600 text-xs">{wh?.name || 'Godown'}</td>
                          <td className="px-3 py-2.5 text-right font-medium">{crates} cs</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">₹{money(g.grandTotal)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-emerald-100 text-emerald-800">
                              Received
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. RECEIVABLES & DEBTOR AGING                            */}
      {/* ======================================================== */}
      {activeReport === 'receivables' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 border-2 rounded bg-rose-50 border-rose-300">
              <div className="text-xs text-rose-800 font-semibold">Total Market Credit Due</div>
              <div className="text-2xl font-black mt-1 text-rose-900">
                ₹{money(debtorsLedger.reduce((sum, d) => sum + d.balance, 0))}
              </div>
              <div className="text-[11px] text-rose-700 mt-0.5">Across {debtorsLedger.length} retail accounts</div>
            </div>

            <div className="p-4 border-2 rounded bg-amber-50 border-amber-300">
              <div className="text-xs text-amber-800 font-semibold">Overdue Credit (&gt; 15 Days)</div>
              <div className="text-2xl font-black mt-1 text-amber-900">
                ₹{money(debtorsLedger.reduce((sum, d) => sum + d.aging.due15 + d.aging.overdue30, 0))}
              </div>
              <div className="text-[11px] text-amber-700 mt-0.5">Priority collection targets</div>
            </div>

            <div className="p-4 border-2 rounded bg-emerald-50 border-emerald-300">
              <div className="text-xs text-emerald-800 font-semibold">Current Dues (0 - 15 Days)</div>
              <div className="text-2xl font-black mt-1 text-emerald-900">
                ₹{money(debtorsLedger.reduce((sum, d) => sum + d.aging.current, 0))}
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5">Within normal trade credit terms</div>
            </div>
          </div>

          {/* Party-wise Outstanding Table */}
          <div className="border-2 p-5 rounded" style={cardStyle}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 style={fz(17, { fontWeight: 700, color: palette.ink })}>Retailer Debtors Aging Schedule</h3>
                <p style={fz(13, { color: palette.muted })}>
                  Outstanding balances categorized by aging days with direct WhatsApp reminder triggers.
                </p>
              </div>
              <div className="text-xs font-semibold text-slate-500">
                Sorted by highest balance
              </div>
            </div>

            {debtorsLedger.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                🎉 All customer accounts are fully settled! Zero market credit outstanding.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={fz(13.5)}>
                  <thead>
                    <tr className="border-b-2 text-xs uppercase tracking-wider text-slate-500" style={{ borderColor: palette.line }}>
                      <th className="px-3 py-2 font-bold">Retailer Party</th>
                      <th className="px-3 py-2 font-bold text-right">Bills</th>
                      <th className="px-3 py-2 font-bold text-right">Total Invoiced</th>
                      <th className="px-3 py-2 font-bold text-right">Total Paid</th>
                      <th className="px-3 py-2 font-bold text-right text-rose-700">Balance Due</th>
                      <th className="px-3 py-2 font-bold text-right text-slate-600">0-15 Days</th>
                      <th className="px-3 py-2 font-bold text-right text-amber-700">16-30 Days</th>
                      <th className="px-3 py-2 font-bold text-right text-rose-700">30+ Days</th>
                      <th className="px-3 py-2 font-bold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtorsLedger.map((d, idx) => {
                      const waText = encodeURIComponent(
                        `Dear ${d.retailer},\nGreetings from ${orgProfile?.name || 'Radhika Beverages'}.\nThis is a friendly reminder that your outstanding balance is ₹${money(
                          d.balance
                        )} against your beverage delivery bills.\nKindly clear the dues at your earliest convenience. Thank you!`
                      );
                      const waLink = d.phone ? `https://wa.me/91${d.phone.replace(/[^0-9]/g, '')}?text=${waText}` : null;

                      return (
                        <tr key={idx} className="border-b last:border-b-0 hover:bg-slate-50/50" style={{ borderColor: palette.line }}>
                          <td className="px-3 py-2.5 font-semibold text-slate-900">
                            {d.retailer}
                            {d.phone && <span className="block text-[11px] text-slate-500 font-normal">📱 {d.phone}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-slate-600">{d.billsCount}</td>
                          <td className="px-3 py-2.5 text-right text-slate-700">₹{money(d.totalBilled)}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-700 font-medium">₹{money(d.totalPaid)}</td>
                          <td className="px-3 py-2.5 text-right font-black text-rose-700">₹{money(d.balance)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">₹{money(d.aging.current)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-amber-800">₹{money(d.aging.due15)}</td>
                          <td className="px-3 py-2.5 text-right font-black text-rose-800">₹{money(d.aging.overdue30)}</td>
                          <td className="px-3 py-2.5 text-center">
                            {waLink ? (
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-xs cursor-pointer"
                                title="Send WhatsApp payment reminder"
                              >
                                <MessageCircle size={12} />
                                Reminder
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">No phone</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. VEHICLE TRIPS & DISCREPANCY RECONCILIATION            */}
      {/* ======================================================== */}
      {activeReport === 'trips' && (() => {
        const tripStats = filteredTrips.reduce(
          (acc, t) => {
            const { rows } = tripBreakdown(t);
            const loaded = Object.values(t.loaded).reduce((s, v) => s + v, 0);
            const returned = Object.values(t.returned).reduce((s, v) => s + v, 0);
            const delivered = rows.reduce((s, r) => s + r.sold, 0);
            const discrepancy = rows.reduce((s, r) => s + r.discrepancy, 0);
            return {
              loaded: acc.loaded + loaded,
              delivered: acc.delivered + delivered,
              returned: acc.returned + returned,
              discrepancy: acc.discrepancy + discrepancy,
            };
          },
          { loaded: 0, delivered: 0, returned: 0, discrepancy: 0 }
        );

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 border-2 rounded" style={cardStyle}>
                <div className="text-xs text-slate-500 font-semibold">Total Dispatched Trips</div>
                <div className="text-2xl font-black mt-1" style={{ color: palette.navy }}>
                  {filteredTrips.length} <span className="text-xs font-normal text-slate-500">runs</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Route deliveries</div>
              </div>

              <div className="p-4 border-2 rounded" style={cardStyle}>
                <div className="text-xs text-slate-500 font-semibold">Crates Loaded for Delivery</div>
                <div className="text-2xl font-black mt-1 text-slate-800">
                  {tripStats.loaded} <span className="text-xs font-normal text-slate-500">cs</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Total cargo dispatched</div>
              </div>

              <div className="p-4 border-2 rounded" style={cardStyle}>
                <div className="text-xs text-slate-500 font-semibold">Crates Delivered & Sold</div>
                <div className="text-2xl font-black mt-1 text-emerald-700">
                  {tripStats.delivered} <span className="text-xs font-normal text-slate-500">cs</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Delivered to retail counters</div>
              </div>

              <div className="p-4 border-2 rounded" style={cardStyle}>
                <div className="text-xs text-slate-500 font-semibold">Stock Discrepancy / Variance</div>
                <div
                  className={`text-2xl font-black mt-1 ${
                    tripStats.discrepancy > 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {tripStats.discrepancy} <span className="text-xs font-normal text-slate-500">cases</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Unaccounted cases in transit</div>
              </div>
            </div>

            {/* Trips Reconciliation Table */}
            <div className="border-2 p-5 rounded" style={cardStyle}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h3 style={fz(17, { fontWeight: 700, color: palette.ink })}>Vehicle Dispatches & Crate Audit</h3>
                  <p style={fz(13, { color: palette.muted })}>Loaded vs delivered counts, returned empties, and transit variance.</p>
                </div>
                <button
                  onClick={() => setTab('trips')}
                  className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1"
                >
                  Open Trips Manager <ArrowRight size={13} />
                </button>
              </div>

              {filteredTrips.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No delivery trips recorded for {period}. Log trips under Vehicle Trips to track drivers and vehicles.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left" style={fz(13.5)}>
                    <thead>
                      <tr className="border-b-2 text-xs uppercase tracking-wider text-slate-500" style={{ borderColor: palette.line }}>
                        <th className="px-3 py-2 font-bold">Trip ID</th>
                        <th className="px-3 py-2 font-bold">Date</th>
                        <th className="px-3 py-2 font-bold">Vehicle</th>
                        <th className="px-3 py-2 font-bold">Status</th>
                        <th className="px-3 py-2 font-bold text-right">Loaded</th>
                        <th className="px-3 py-2 font-bold text-right">Delivered</th>
                        <th className="px-3 py-2 font-bold text-right">Returned</th>
                        <th className="px-3 py-2 font-bold text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrips.map((t) => {
                        const { rows } = tripBreakdown(t);
                        const loaded = Object.values(t.loaded).reduce((s, v) => s + v, 0);
                        const returned = Object.values(t.returned).reduce((s, v) => s + v, 0);
                        const delivered = rows.reduce((s, r) => s + r.sold, 0);
                        const disc = rows.reduce((s, r) => s + r.discrepancy, 0);
                        return (
                          <tr key={t.id} className="border-b last:border-b-0 hover:bg-slate-50/50" style={{ borderColor: palette.line }}>
                            <td className="px-3 py-2.5 font-mono font-bold text-blue-900">{t.id}</td>
                            <td className="px-3 py-2.5 text-slate-600">{t.date}</td>
                            <td className="px-3 py-2.5 font-bold text-slate-900">{t.vehicle}</td>
                            <td className="px-3 py-2.5 text-slate-800">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                                  t.status === 'out'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {t.status === 'out' ? 'In Transit' : 'Reconciled'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium">{loaded} cs</td>
                            <td className="px-3 py-2.5 text-right font-medium text-emerald-700">{delivered} cs</td>
                            <td className="px-3 py-2.5 text-right font-medium text-slate-600">{returned} cs</td>
                            <td className={`px-3 py-2.5 text-right font-bold ${disc > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {disc > 0 ? `-${disc} cs (Variance)` : '0 (Balanced)'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ======================================================== */}
      {/* 6. GST TAX & COMPLIANCE SUMMARY                          */}
      {/* ======================================================== */}
      {activeReport === 'tax' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 border-2 rounded bg-indigo-50 border-indigo-300">
              <div className="text-xs text-indigo-900 font-bold uppercase tracking-wider">Gross Output GST Tax</div>
              <div className="text-2xl font-black mt-1 text-indigo-900">₹{money(gstTaxSummary.totalOutputGst)}</div>
              <div className="text-xs text-indigo-700 mt-1">
                CGST: ₹{money(gstTaxSummary.outputCgst)} | SGST: ₹{money(gstTaxSummary.outputSgst)}
              </div>
              <div className="text-xs text-indigo-700 mt-0.5">
                Cess (12%): ₹{money(gstTaxSummary.outputCess)}
              </div>
            </div>

            <div className="p-5 border-2 rounded bg-emerald-50 border-emerald-300">
              <div className="text-xs text-emerald-900 font-bold uppercase tracking-wider">Input Tax Credit (ITC)</div>
              <div className="text-2xl font-black mt-1 text-emerald-900">₹{money(gstTaxSummary.inputGstCredit)}</div>
              <div className="text-xs text-emerald-700 mt-1">GST & Cess paid on inward supplier bills</div>
              <div className="text-xs text-emerald-700 mt-0.5">Offsets your output tax liability</div>
            </div>

            <div className="p-5 border-2 rounded bg-blue-50 border-blue-300">
              <div className="text-xs text-blue-900 font-bold uppercase tracking-wider">Net Tax Payable (GSTR-3B)</div>
              <div className="text-2xl font-black mt-1 text-blue-950">₹{money(gstTaxSummary.netGstPayable)}</div>
              <div className="text-xs text-blue-800 mt-1">Output GST minus Input Tax Credit</div>
              <div className="text-xs text-blue-700 mt-0.5 font-medium">To be paid by 20th of next month</div>
            </div>
          </div>

          {/* Detailed Tax Breakdown Card */}
          <div className="border-2 p-5 rounded" style={cardStyle}>
            <h3 style={fz(17, { fontWeight: 700, color: palette.ink, marginBottom: '0.25rem' })}>
              GSTR-1 & GSTR-3B Monthly Computation Schedule
            </h3>
            <p style={fz(13, { color: palette.muted, marginBottom: '1.25rem' })}>
              Prepared in accordance with Indian GST regulations for beverage wholesale trade.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left" style={fz(13.5)}>
                <thead>
                  <tr className="border-b-2 text-xs uppercase tracking-wider text-slate-500" style={{ borderColor: palette.line }}>
                    <th className="px-3 py-2.5 font-bold">Tax Category / Table</th>
                    <th className="px-3 py-2.5 font-bold text-right">Taxable Value</th>
                    <th className="px-3 py-2.5 font-bold text-right">Central Tax (CGST)</th>
                    <th className="px-3 py-2.5 font-bold text-right">State Tax (SGST)</th>
                    <th className="px-3 py-2.5 font-bold text-right">Compensation Cess</th>
                    <th className="px-3 py-2.5 font-bold text-right">Total Tax</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-slate-50/50" style={{ borderColor: palette.line }}>
                    <td className="px-3 py-3 font-bold text-slate-900">
                      Outward Taxable Supplies (Sales to Retailers)
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">₹{money(gstTaxSummary.outputTaxable)}</td>
                    <td className="px-3 py-3 text-right text-slate-800">₹{money(gstTaxSummary.outputCgst)}</td>
                    <td className="px-3 py-3 text-right text-slate-800">₹{money(gstTaxSummary.outputSgst)}</td>
                    <td className="px-3 py-3 text-right text-amber-800 font-semibold">₹{money(gstTaxSummary.outputCess)}</td>
                    <td className="px-3 py-3 text-right font-black text-indigo-900">₹{money(gstTaxSummary.totalOutputGst)}</td>
                  </tr>

                  <tr className="border-b hover:bg-slate-50/50" style={{ borderColor: palette.line }}>
                    <td className="px-3 py-3 font-bold text-emerald-900">
                      Eligible ITC (Inward Consignments from Suppliers)
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">₹{money(purchaseStats.netPurchaseVal)}</td>
                    <td className="px-3 py-3 text-right text-emerald-800">₹{money(purchaseStats.totalGstPaid / 2)}</td>
                    <td className="px-3 py-3 text-right text-emerald-800">₹{money(purchaseStats.totalGstPaid / 2)}</td>
                    <td className="px-3 py-3 text-right text-emerald-800 font-semibold">₹{money(purchaseStats.totalCessPaid)}</td>
                    <td className="px-3 py-3 text-right font-black text-emerald-900">₹{money(gstTaxSummary.inputGstCredit)}</td>
                  </tr>

                  <tr className="bg-slate-100/70 font-black">
                    <td className="px-3 py-3 text-slate-900">Net Tax Payable in Cash / Electronic Ledger</td>
                    <td className="px-3 py-3 text-right">—</td>
                    <td className="px-3 py-3 text-right text-blue-900">
                      ₹{money(Math.max(0, gstTaxSummary.outputCgst - purchaseStats.totalGstPaid / 2))}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900">
                      ₹{money(Math.max(0, gstTaxSummary.outputSgst - purchaseStats.totalGstPaid / 2))}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900">
                      ₹{money(Math.max(0, gstTaxSummary.outputCess - purchaseStats.totalCessPaid))}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-950 text-base">₹{money(gstTaxSummary.netGstPayable)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-start gap-2">
              <ShieldCheck size={16} className="shrink-0 mt-0.5 text-amber-700" />
              <div>
                <strong>Statutory Notice:</strong> Under GST notification No. 8/2021-Compensation Cess (Rate), carbonated beverages containing caffeine (energy drinks, soda waters) attract 12% Compensation Cess in addition to 28% GST (14% CGST + 14% SGST). Input Tax Credit on cess can only be utilized towards payment of output cess.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tax Invoice Modal for viewing full bill details & printing */}
      {viewingBill && (
        <TaxInvoiceModal
          bill={viewingBill}
          onClose={() => setViewingBill(null)}
        />
      )}
    </div>
  );
};
