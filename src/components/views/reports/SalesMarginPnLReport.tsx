import React, { useCallback, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Download,
  IndianRupee,
  Package,
  Percent,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Layers,
  Sparkles,
  ShieldCheck,
  Info,
  HelpCircle,
  Calculator,
  Gift,
  Boxes,
} from 'lucide-react';
import { Bill, BillItem, InventoryBatch, Product } from '../../../types';
import { useLedger } from '../../../context/LedgerContext';
import { money, normalizeGstFraction, resolveProductGstRate, scaledTaxSplit, inwardFreightAlreadyInCost } from '../../../utils/billing';
import { billBalance, billNetTotal, returnedQtyByProduct, billReturnCredit, returnedCreditByProduct } from '../../../utils/salesReturns';
import { CATS } from '../../../constants/initialData';
import { writeOffNetForPeriod, schemeCreditsForPeriod } from '../../../utils/pnlBridge';
import { billTaxBasis } from '../../../utils/billTaxBasis';
import { resolveTaxRegime, noOutputTax } from '../../../tax/appRegime';
import { ProductProfitPricingModal } from './ProductProfitPricingModal';
import { NetProfitReport } from './NetProfitReport';
import { InfoTip } from '../../common/InfoTip';
import { RegisterCard, Pill } from './mobile/ReportCards';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import {
  ExplainBox,
  ReportBreakdownLine,
  ReportChipGroup,
  ReportExplainModal,
  ReportFilterPanel,
  ReportStat,
  ReportStatGrid,
  ReportTitleBar,
} from './ReportKit';
import {
  Chips,
  HeroCard,
  LegendDot,
  MiniStat,
  PhoneDownloadBar,
  PhoneHeader,
  PhoneSearch,
  SplitBar,
} from './mobile/PhoneKit';
import { SubPageBack, SubPageMenu, type SubPageCard } from './mobile/SubPageMenu';

export type MarginSubTab = 'products' | 'customers' | 'days' | 'netProfit';
export type ProfitViewBasis = 'exGst' | 'inclGst';

export interface SalesMarginPnLReportProps {
  filteredBills: Bill[];
  products: Product[];
  periodLabel: string;
  /** Open on a specific sub-tab (e.g. products when deep-linked from old Product profit). */
  initialSubTab?: MarginSubTab;
  /** True when a yyyy-mm-dd date falls inside the selected report period (used for write-offs). */
  dateInPeriod?: (date: string) => boolean;
  gstTaxSummary?: {
    outputTaxable: number;
    outputCgst: number;
    outputSgst: number;
    outputCess: number;
    totalOutputGst: number;
    inputGstCredit: number;
    netGstPayable: number;
  };
  purchaseStats?: {
    grossPurchaseVal: number;
    netPurchaseVal: number;
    totalGstPaid: number;
    totalCessPaid: number;
  };
}

export interface ProductMarginRow {
  productId: number;
  productName: string;
  category: string;
  casesSold: number; // Net billed cases
  freeCases: number; // Free promotional scheme cases
  totalDispatched: number; // casesSold + freeCases
  grossSales: number;
  discounts: number;
  netSales: number; // Billed net (Incl-GST)
  taxableSales: number; // Taxable turnover (Ex-GST)
  gstAmount: number; // Output GST collected
  cogs: number; // Inward cost * totalDispatched
  grossProfit: number; // Active profit based on viewBasis
  marginPct: number; // Active margin % based on viewBasis
  operatingProfit: number; // True Ex-GST operating profit (taxableSales - cogs)
  operatingMarginPct: number;
  costPerCase: number; // Active purchase cost based on viewBasis
  exGstCostPerCase: number; // Inward cost Ex-GST (used for true operating profit)
  landedCostPerCase: number; // Inward cost Incl-GST (original bill rate + landed freight/labour)
  avgSellRate: number; // Method 2: activeRev / casesSold
  avgBilledSellRate: number; // Method 2: netSales / casesSold (Incl-GST)
  avgTaxableSellRate: number; // Method 2: taxableSales / casesSold (Ex-GST)
  effectiveSellRate: number; // netSales / totalDispatched (Incl-GST blended)
  effectiveTaxableRate: number; // taxableSales / totalDispatched (Ex-GST blended)
  profitPerCase: number; // operatingProfit / casesSold
}

export interface CustomerMarginRow {
  customerKey: string;
  customerName: string;
  invoices: number;
  casesSold: number;
  netSales: number;
  taxableSales: number;
  gstAmount: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  outstanding: number;
}

export interface DayMarginRow {
  date: string;
  invoices: number;
  netSales: number;
  taxableSales: number;
  gstAmount: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  discounts: number;
}

/** One row per stock batch (or "Unallocated" fallback) that contributed cases to period sales. */
export interface BatchMarginRow {
  batchKey: string;
  batchNumber: string;
  productId: number;
  productName: string;
  category: string;
  supplierName: string;
  inwardDate: string;
  expiryDate: string;
  casesSold: number;
  freeCases: number;
  totalDispatched: number;
  costPerCase: number;
  netSales: number;
  taxableSales: number;
  gstAmount: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  operatingProfit: number;
  operatingMarginPct: number;
  profitPerCase: number;
  avgSellRate: number;
}

export function resolveExGstProductCost(product: Product | undefined): number {
  if (!product) return 0;
  let eff = Number(product.effectiveCost ?? product.cost ?? 0) || 0;
  const cost = Number(product.cost ?? 0) || eff;
  // Guard against any single bottle rate accidentally stored (< 30) for multi-unit beverage crates
  if (eff > 0 && cost > 0 && eff < cost * 0.35 && (product.unitsPerCrate || 30) > 1) {
    eff = cost;
  }
  return eff;
}

export function resolveLandedProductCost(product: Product | undefined): number {
  if (!product) return 0;
  const landed = Number(product.landedCostPerCrate);
  if (landed && landed > 0) return landed;
  const ex = resolveExGstProductCost(product);
  const g = resolveProductGstRate(product);
  return Math.round(ex * (1 + g) * 100) / 100;
}

/**
 * The one gross-profit engine. Used by the Sales, Margin & P&L report and by the Net Profit report,
 * so both always show the same revenue, cost and write-off numbers.
 */
export function useSalesMarginPnl(args: {
  filteredBills: Bill[];
  products: Product[];
  dateInPeriod?: (date: string) => boolean;
  gstTaxSummary?: SalesMarginPnLReportProps['gstTaxSummary'];
  purchaseStats?: SalesMarginPnLReportProps['purchaseStats'];
  viewBasis: ProfitViewBasis;
}) {
  const { filteredBills, products, dateInPeriod, gstTaxSummary, purchaseStats, viewBasis } = args;
  const productMap = useMemo(() => {
    const m = new Map<number, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const { inventoryBatches, inventoryDispositions, supplierCreditNotes, grns, orgProfile } = useLedger();

  /**
   * Revenue ex-GST and GST for ONE bill, the same way on every screen. A regular taxpayer's non-GST bill still
   * contains GST in its price; that GST is owed to the government and is not revenue (see utils/billTaxBasis).
   */
  const taxBasisOf = useCallback(
    (b: Bill) => {
      const carve = !noOutputTax(resolveTaxRegime(orgProfile, String(b.date || '').slice(0, 10)));
      return billTaxBasis(b, {
        carveGstFromPrices: carve,
        rateFor: (item) =>
          item.gst !== undefined && item.gst !== null
            ? (item.gst as number)
            : resolveProductGstRate(productMap.get(item.productId), item.category),
      });
    },
    [orgProfile, productMap]
  );
  const batchMap = useMemo(() => {
    const m = new Map<string, InventoryBatch>();
    (inventoryBatches || []).forEach((b) => m.set(b.id, b));
    return m;
  }, [inventoryBatches]);

  /**
   * Inward freight / transport / unloading labour per crate, by stock batch (from the GRN it came in on).
   * This is a real cost of the stock, so it is part of COGS. Before this, it was entered on the GRN but
   * never reached any profit figure.
   */
  const { inwardByBatch, inwardExtraByBatch } = useMemo(() => {
    // inwardByBatch: ALL freight per crate carried in the cost of a batch (used for the "includes freight" figure).
    // inwardExtraByBatch: only the freight NOT already inside the batch's stored cost, i.e. what must still be added
    // on top of the batch cost. Invoice-upload GRNs store a landed cost that already holds the freight; adding it
    // again counted it twice and understated every margin.
    const all = new Map<string, number>();
    const extra = new Map<string, number>();
    (grns || []).forEach((g: any) => {
      const grnLevel = Number(g?.inwardCostPerCrate) || 0;
      (g?.items || []).forEach((it: any) => {
        const per = Number(it?.inwardCostPerCrate) || grnLevel;
        if (per <= 0) return;
        const key = `batch_${g.id}_${it.id}`;
        all.set(key, per);
        if (!inwardFreightAlreadyInCost(it, per)) extra.set(key, per);
      });
    });
    return { inwardByBatch: all, inwardExtraByBatch: extra };
  }, [grns]);

  /** Freight per crate of ONE bill line, weighted by the batches the cases were taken from. */
  const weightedInward = useCallback(
    (item: BillItem, source: Map<string, number>): number => {
      let q = 0;
      let c = 0;
      for (const a of item.batchAllocations || []) {
        const aq = Number(a.qty) || 0;
        if (aq <= 0) continue;
        q += aq;
        c += aq * (source.get(a.batchId) || 0);
      }
      return q > 0 ? c / q : 0;
    },
    []
  );

  /** Total freight per crate carried in the cost of ONE bill line (informational). */
  const lineInwardPerCrate = useCallback((item: BillItem): number => weightedInward(item, inwardByBatch), [weightedInward, inwardByBatch]);

  /** Freight per crate still to be ADDED on top of the batch cost for ONE bill line (not already inside it). */
  const lineInwardExtraPerCrate = useCallback((item: BillItem): number => weightedInward(item, inwardExtraByBatch), [weightedInward, inwardExtraByBatch]);


  /** How trustworthy the cost used for ONE bill line is (feeds the "Check my numbers" panel). */
  const lineCostQuality = useCallback(
    (item: BillItem): 'frozen' | 'batch' | 'estimated' | 'none' => {
      if ((Number(item.costExGst) || 0) > 0) return 'frozen';
      const prod = productMap.get(item.productId);
      const exFallback = resolveExGstProductCost(prod);
      for (const a of item.batchAllocations || []) {
        const b = batchMap.get(a.batchId);
        const raw = Number(b?.effectiveCostPrice) || Number(b?.costPrice) || 0;
        if ((Number(a.qty) || 0) > 0 && raw > 0 && !(exFallback > 0 && raw < exFallback * 0.35)) return 'batch';
      }
      return exFallback > 0 ? 'estimated' : 'none';
    },
    [productMap, batchMap]
  );

  /**
   * Cost of goods for the physical cases of ONE bill line.
   * - Uses the cost of the stock batch(es) the invoice was actually issued from (FEFO allocation
   *   saved on the bill), so an old invoice keeps the cost it really had even after newer, dearer
   *   or cheaper stock arrives.
   * - Falls back to the product's blended average cost for older bills without batch allocation.
   * - `physicalQty` is the case count that left the godown (it already includes free scheme cases).
   */
  const lineCogs = useCallback(
    (item: BillItem, physicalQty: number, basis: ProfitViewBasis): number => {
      if (physicalQty <= 0) return 0;
      const prod = productMap.get(item.productId);
      const exFallback = resolveExGstProductCost(prod);
      const landedFallback = resolveLandedProductCost(prod);

      // Cost frozen on the bill when it was saved wins over anything recalculated today.
      const frozen = Number(item.costExGst) || 0;
      let allocQty = 0;
      let allocEx = 0;
      for (const a of item.batchAllocations || []) {
        const q = Number(a.qty) || 0;
        if (q <= 0) continue;
        const b = batchMap.get(a.batchId);
        const raw = Number(b?.effectiveCostPrice) || Number(b?.costPrice) || 0;
        // ignore a stray per-bottle rate stored instead of a per-crate rate
        const sane = raw > 0 && !(exFallback > 0 && raw < exFallback * 0.35);
        allocQty += q;
        allocEx += q * (sane ? raw : exFallback);
      }
      const avgEx = frozen > 0 ? frozen : allocQty > 0 ? allocEx / allocQty : exFallback;
      // Ex-GST profit carries the inward freight / labour of the batches too. (The incl-GST view already
      // scales by the product's landed cost, which contains it.)
      if (basis === 'exGst') return (avgEx + lineInwardExtraPerCrate(item)) * physicalQty;
      const landedRatio = exFallback > 0 ? landedFallback / exFallback : 1;
      return avgEx * landedRatio * physicalQty;
    },
    [productMap, batchMap, lineInwardExtraPerCrate]
  );

  /**
   * Accurate Core P&L Roll-Up with proper GST and Returns linking:
   * - Ex-GST (Operating Turnover): Taxable Sales minus COGS = True Gross Profit.
   * - GST is separated as a statutory pass-through liability to the government.
   * - Sales Returns reduce both revenue and returned physical cases from COGS.
   * - Trade discounts are correctly summed without double-counting invoice-level discounts.
   * - COGS includes inward cost of both billed and free promotional scheme cases.
   */
  const pnl = useMemo(() => {
    let grossSales = 0;
    let lineDiscounts = 0;
    let billDiscounts = 0;
    let billedSalesNet = 0;
    let taxableSalesNet = 0;
    let totalOutputGstNet = 0;
    let gstCarvedFromPrices = 0;
    let cogs = 0;
    let casesSold = 0;
    let freeCases = 0;
    const invoiceCount = filteredBills.length;
    let collected = 0;
    let outstanding = 0;
    let inwardInCogs = 0;
    let estimatedCostLines = 0;
    let estimatedCostCases = 0;
    let zeroCostLines = 0;
    let zeroCostCases = 0;
    const zeroCostProducts = new Set<string>();
    const noBatchBills = new Set<number | string>();

    filteredBills.forEach((b) => {
      if (b.status === 'cancelled') return;

      const billNet = billNetTotal(b);
      billedSalesNet += billNet;
      collected += Number(b.amountPaid) || 0;
      outstanding += Math.max(0, billBalance(b));

      // Bill-level extra discount
      const extraDisc = Math.max(0, Number(b.additionalDiscount) || 0);
      billDiscounts += extraDisc;

      // Bill-level revenue ex-GST and GST, net of returns (one shared definition for every profit screen)
      const basis = taxBasisOf(b);
      totalOutputGstNet += basis.gst;
      taxableSalesNet += basis.taxable;
      if (basis.carved) gstCarvedFromPrices += basis.gst;

      // Returned quantities by product for this bill
      const backByProd = returnedQtyByProduct(b);

      b.items.forEach((item) => {
        const gross = Number(item.gross) || (Number(item.qty) || 0) * (Number(item.rate) || 0);
        const disc = Number(item.discount) || 0;
        const qty = Number(item.qty) || 0;
        const free = Number(item.freeQty) || 0;

        grossSales += gross;
        lineDiscounts += disc;

        // `qty` is the physical number of cases that left the godown and ALREADY includes the
        // free scheme cases (stock is deducted by `qty` only). Split it into paid + free;
        // never add `freeQty` on top again or COGS is overstated and profit understated.
        const retQty = backByProd[item.productId] || 0;
        const netQty = Math.max(0, qty - retQty);
        const freeNet = Math.min(free, netQty);
        freeCases += freeNet;
        casesSold += netQty - freeNet;

        cogs += lineCogs(item, netQty, viewBasis);

        if (netQty > 0) {
          inwardInCogs += lineInwardPerCrate(item) * netQty;
          const quality = lineCostQuality(item);
          if (quality === 'estimated') {
            estimatedCostLines += 1;
            estimatedCostCases += netQty;
            noBatchBills.add(b.id);
          } else if (quality === 'none') {
            zeroCostLines += 1;
            zeroCostCases += netQty;
            zeroCostProducts.add(String(item.productName || productMap.get(item.productId)?.name || `#${item.productId}`));
            noBatchBills.add(b.id);
          }
        }
      });
    });

    // Fallback if grossSales wasn't captured on older bills
    if (grossSales <= 0 && billedSalesNet > 0) {
      grossSales = billedSalesNet + lineDiscounts + billDiscounts;
    }

    const totalDiscounts = lineDiscounts + billDiscounts;
    const totalDispatchedCases = casesSold + freeCases;

    // Stock lost or written off in the period (damage, expiry, return to supplier) is a real cost of the
    // business even though it never appears on a sales invoice. Supplier compensation received is netted off.
    // Free issues / scheme free issues are stock given away, also a cost.
    const wo = writeOffNetForPeriod(inventoryDispositions, dateInPeriod);
    const writeOffLoss = wo.loss;
    const writeOffRecovered = wo.recovered;
    const writeOffNet = wo.net;
    // Supplier scheme credits actually received (same definition as Business reports)
    const supplierCredits = schemeCreditsForPeriod(supplierCreditNotes, dateInPeriod);

    // True Operating Gross Profit (Ex-GST turnover - Ex-GST Inward COGS)
    const grossProfitBeforeLosses = taxableSalesNet - cogs;
    const operatingGrossProfit = grossProfitBeforeLosses - writeOffNet + supplierCredits;
    const operatingMarginPct = taxableSalesNet > 0 ? (operatingGrossProfit / taxableSalesNet) * 100 : 0;

    // Billed Gross Margin (Incl-GST billed invoices - Landed Inward COGS)
    const billedGrossProfit = billedSalesNet - cogs;
    const billedMarginPct = billedSalesNet > 0 ? (billedGrossProfit / billedSalesNet) * 100 : 0;

    // Active KPI metrics based on user selection (Ex-GST vs Incl-GST)
    const activeNetSales = viewBasis === 'exGst' ? taxableSalesNet : billedSalesNet;
    const activeGrossProfit = viewBasis === 'exGst' ? operatingGrossProfit : billedGrossProfit;
    const activeMarginPct = viewBasis === 'exGst' ? operatingMarginPct : billedMarginPct;

    // Method 2 (dividing by billed cases only):
    const avgBilledSellPerCase = casesSold > 0 ? billedSalesNet / casesSold : 0;
    const avgTaxableSellPerCase = casesSold > 0 ? taxableSalesNet / casesSold : 0;
    const avgSellPerCase = viewBasis === 'exGst' ? avgTaxableSellPerCase : avgBilledSellPerCase;

    // Blended effective rate (dividing by total dispatched crates):
    const avgEffectiveSellPerCase = totalDispatchedCases > 0 ? billedSalesNet / totalDispatchedCases : 0;

    const avgProfitPerCase = casesSold > 0 ? operatingGrossProfit / casesSold : 0;
    const avgCostPerCase = totalDispatchedCases > 0 ? cogs / totalDispatchedCases : (casesSold > 0 ? cogs / casesSold : 0);

    // GST ITC & Net Tax position
    const itc = purchaseStats?.totalGstPaid
      ? purchaseStats.totalGstPaid + (purchaseStats.totalCessPaid || 0)
      : (gstTaxSummary?.inputGstCredit || 0);
    const netGstPayable = Math.max(0, totalOutputGstNet - itc);

    return {
      grossSales,
      totalDiscounts,
      lineDiscounts,
      billDiscounts,
      billedSalesNet,
      taxableSalesNet,
      totalOutputGstNet,
      gstCarvedFromPrices: Math.round(gstCarvedFromPrices * 100) / 100,
      netGstPayable,
      itc,
      cogs,
      inwardInCogs: Math.round(inwardInCogs * 100) / 100,
      costChecks: {
        estimatedCostLines,
        estimatedCostCases,
        zeroCostLines,
        zeroCostCases,
        zeroCostProducts: Array.from(zeroCostProducts).sort(),
        billsWithEstimatedCost: noBatchBills.size,
      },
      operatingGrossProfit,
      grossProfitBeforeLosses,
      writeOffLoss,
      writeOffRecovered,
      writeOffNet,
      supplierCredits,
      operatingMarginPct,
      billedGrossProfit,
      billedMarginPct,
      activeNetSales,
      activeGrossProfit,
      activeMarginPct,
      casesSold,
      freeCases,
      totalDispatchedCases,
      invoiceCount,
      collected,
      outstanding,
      avgProfitPerCase,
      avgSellPerCase,
      avgBilledSellPerCase,
      avgTaxableSellPerCase,
      avgEffectiveSellPerCase,
      avgCostPerCase,
    };
  }, [filteredBills, productMap, viewBasis, gstTaxSummary, purchaseStats, lineCogs, inventoryDispositions, supplierCreditNotes, dateInPeriod, lineInwardPerCrate, lineCostQuality, taxBasisOf]);
  return { pnl, productMap, batchMap, lineCogs, inwardExtraByBatch, taxBasisOf };
}

export const SalesMarginPnLReport: React.FC<SalesMarginPnLReportProps> = ({
  filteredBills,
  products,
  periodLabel,
  initialSubTab = 'products',
  dateInPeriod,
  gstTaxSummary,
  purchaseStats,
}) => {
  const [subTab, setSubTab] = useState<MarginSubTab>(initialSubTab || 'products');
  // Phone: a deep link (e.g. "Net Profit" from the Reports home) opens that page directly; otherwise start on the list.
  const [mobileActiveSubPage, setMobileActiveSubPage] = useState<MarginSubTab | null>(
    initialSubTab || null,
  );
  const [viewBasis, setViewBasis] = useState<ProfitViewBasis>('exGst');
  const [search, setSearch] = useState('');
  // Composition / unregistered bills carry a taxStamp: stock cost then includes the purchase GST (no ITC).
  const costIncludesGst = filteredBills.some((b) => b.taxStamp && b.taxStamp.registrationType !== 'regular');
  const [sortBy, setSortBy] = useState<'profit' | 'margin' | 'sales' | 'cases'>('profit');
  const [explainOpen, setExplainOpen] = useState(false);

  // Modal inspection state
  const [selectedProductForModal, setSelectedProductForModal] = useState<ProductMarginRow | null>(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  const { pnl, productMap, batchMap, lineCogs, taxBasisOf } = useSalesMarginPnl({
    filteredBills,
    products,
    dateInPeriod,
    gstTaxSummary,
    purchaseStats,
    viewBasis,
  });

  const productRows = useMemo(() => {
    interface ProductAcc {
      row: ProductMarginRow;
      exCogs: number;
      landedCogs: number;
    }
    const map = new Map<number, ProductAcc>();

    filteredBills.forEach((b) => {
      if (b.status === 'cancelled') return;
      const backByProd = returnedQtyByProduct(b);

      b.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const qty = Number(item.qty) || 0;
        const free = Number(item.freeQty) || 0;
        const gross = Number(item.gross) || qty * (Number(item.rate) || 0);
        const disc = Number(item.discount) || 0;
        const billedNet = Number(item.amount) || gross - disc;

        // `qty` = physical cases delivered, free scheme cases included. Split into paid + free.
        const retQty = backByProd[item.productId] || 0;
        const netCases = Math.max(0, qty - retQty);
        const freeNet = Math.min(free, netCases);
        const paidCases = netCases - freeNet;

        // Taxable & GST calculation for the product item
        const g = item.gst !== undefined && item.gst !== null
          ? normalizeGstFraction(item.gst)
          : resolveProductGstRate(prod, item.category);
        // GST is charged on the paid value plus the free scheme cases (see lineTaxDetail)
        const split = scaledTaxSplit(item, billedNet, g);
        const taxable = split.taxable;
        const gst = split.tax;

        let acc = map.get(item.productId);
        if (!acc) {
          acc = {
            exCogs: 0,
            landedCogs: 0,
            row: {
              productId: item.productId,
              productName: item.productName || prod?.name || `Product #${item.productId}`,
              category: String(item.category || prod?.category || 'general'),
              casesSold: 0,
              freeCases: 0,
              totalDispatched: 0,
              grossSales: 0,
              discounts: 0,
              netSales: 0,
              taxableSales: 0,
              gstAmount: 0,
              cogs: 0,
              grossProfit: 0,
              marginPct: 0,
              operatingProfit: 0,
              operatingMarginPct: 0,
              costPerCase: 0,
              exGstCostPerCase: 0,
              landedCostPerCase: 0,
              avgSellRate: 0,
              avgBilledSellRate: 0,
              avgTaxableSellRate: 0,
              effectiveSellRate: 0,
              effectiveTaxableRate: 0,
              profitPerCase: 0,
            },
          };
          map.set(item.productId, acc);
        }

        // Returns: subtract returned credit (and pro-rate taxable/GST) so product P&L matches top-level
        const creditBackByProd = returnedCreditByProduct(b);
        const retCredit = creditBackByProd[item.productId] || 0;
        const netBilled = Math.max(0, billedNet - retCredit);
        const retRatio = billedNet > 0 ? Math.min(1, retCredit / billedNet) : 0;
        const netGross = Math.max(0, gross * (1 - retRatio));
        const netDisc = Math.max(0, disc * (1 - retRatio));
        const netTaxable = Math.max(0, taxable * (1 - retRatio));
        const netGst = Math.max(0, gst * (1 - retRatio));

        const r = acc.row;
        r.casesSold += paidCases;
        r.freeCases += freeNet;
        r.totalDispatched += netCases;
        r.grossSales += netGross;
        r.discounts += netDisc;
        r.netSales += netBilled;
        r.taxableSales += netTaxable;
        r.gstAmount += netGst;
        // COGS is built from the batch each line was issued from (see lineCogs)
        acc.exCogs += lineCogs(item, netCases, 'exGst');
        acc.landedCogs += lineCogs(item, netCases, 'inclGst');
      });
    });

    let rows: ProductMarginRow[] = Array.from(map.values()).map(({ row: r, exCogs, landedCogs }) => {
      const prod = productMap.get(r.productId);
      const opProfit = r.taxableSales - exCogs;
      const billedProfit = r.netSales - landedCogs;
      const activeProfit = viewBasis === 'exGst' ? opProfit : billedProfit;
      const activeRev = viewBasis === 'exGst' ? r.taxableSales : r.netSales;
      const activeCogs = viewBasis === 'exGst' ? exCogs : landedCogs;
      const disp = r.totalDispatched;
      const exPerCase = disp > 0 ? exCogs / disp : resolveExGstProductCost(prod);
      const landedPerCase = disp > 0 ? landedCogs / disp : resolveLandedProductCost(prod);

      return {
        ...r,
        cogs: activeCogs,
        grossProfit: activeProfit,
        marginPct: activeRev > 0 ? (activeProfit / activeRev) * 100 : 0,
        operatingProfit: opProfit,
        operatingMarginPct: r.taxableSales > 0 ? (opProfit / r.taxableSales) * 100 : 0,
        costPerCase: viewBasis === 'exGst' ? exPerCase : landedPerCase,
        exGstCostPerCase: exPerCase,
        landedCostPerCase: landedPerCase,
        // Method 2: revenue / billed (paid) cases
        avgSellRate: r.casesSold > 0 ? activeRev / r.casesSold : 0,
        avgBilledSellRate: r.casesSold > 0 ? r.netSales / r.casesSold : 0,
        avgTaxableSellRate: r.casesSold > 0 ? r.taxableSales / r.casesSold : 0,
        // Blended: revenue / all cases delivered (paid + free)
        effectiveSellRate: disp > 0 ? r.netSales / disp : 0,
        effectiveTaxableRate: disp > 0 ? r.taxableSales / disp : 0,
        profitPerCase: r.casesSold > 0 ? opProfit / r.casesSold : 0,
      };
    });

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.productName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          String(r.productId).includes(q)
      );
    }

    rows.sort((a, b) => {
      if (sortBy === 'margin') return b.marginPct - a.marginPct;
      if (sortBy === 'sales')
        return (viewBasis === 'exGst' ? b.taxableSales : b.netSales) -
          (viewBasis === 'exGst' ? a.taxableSales : a.netSales);
      if (sortBy === 'cases') return b.casesSold - a.casesSold;
      return b.grossProfit - a.grossProfit;
    });

    return rows;
  }, [filteredBills, productMap, search, sortBy, viewBasis, lineCogs]);

  const customerRows = useMemo(() => {
    const map = new Map<string, CustomerMarginRow>();

    filteredBills.forEach((b) => {
      if (b.status === 'cancelled') return;
      const name = (b.retailer || 'Cash / Walk-in').trim() || 'Cash / Walk-in';
      const key = name.toLowerCase();
      const backByProd = returnedQtyByProduct(b);

      let billCogs = 0;
      let billCases = 0;
      b.items.forEach((item) => {
        const retQty = backByProd[item.productId] || 0;
        // qty already includes free scheme cases; COGS follows the active Ex-GST / Incl-GST basis
        const netQty = Math.max(0, (Number(item.qty) || 0) - retQty);
        billCogs += lineCogs(item, netQty, viewBasis);
        billCases += netQty;
      });

      const netBilled = billNetTotal(b);
      const { taxable, gst: bGst } = taxBasisOf(b);

      const opProfit = taxable - billCogs;
      const billedProfit = netBilled - billCogs;
      const activeProfit = viewBasis === 'exGst' ? opProfit : billedProfit;
      const activeRev = viewBasis === 'exGst' ? taxable : netBilled;
      const due = Math.max(0, billBalance(b));

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          customerKey: key,
          customerName: name,
          invoices: 1,
          casesSold: billCases,
          netSales: netBilled,
          taxableSales: taxable,
          gstAmount: bGst,
          cogs: billCogs,
          grossProfit: activeProfit,
          marginPct: activeRev > 0 ? (activeProfit / activeRev) * 100 : 0,
          outstanding: due,
        });
      } else {
        existing.invoices += 1;
        existing.casesSold += billCases;
        existing.netSales += netBilled;
        existing.taxableSales += taxable;
        existing.gstAmount += bGst;
        existing.cogs += billCogs;

        const cumProfit =
          viewBasis === 'exGst'
            ? existing.taxableSales - existing.cogs
            : existing.netSales - existing.cogs;
        const cumRev = viewBasis === 'exGst' ? existing.taxableSales : existing.netSales;
        existing.grossProfit = cumProfit;
        existing.marginPct = cumRev > 0 ? (cumProfit / cumRev) * 100 : 0;
        existing.outstanding += due;
      }
    });

    let rows = Array.from(map.values());
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.customerName.toLowerCase().includes(q));

    rows.sort((a, b) => {
      if (sortBy === 'margin') return b.marginPct - a.marginPct;
      if (sortBy === 'sales')
        return (viewBasis === 'exGst' ? b.taxableSales : b.netSales) -
          (viewBasis === 'exGst' ? a.taxableSales : a.netSales);
      if (sortBy === 'cases') return b.casesSold - a.casesSold;
      return b.grossProfit - a.grossProfit;
    });

    return rows;
  }, [filteredBills, productMap, search, sortBy, viewBasis, lineCogs, taxBasisOf]);

  const dayRows = useMemo(() => {
    const map = new Map<string, DayMarginRow>();

    filteredBills.forEach((b) => {
      if (b.status === 'cancelled') return;
      const d = (b.date || '').slice(0, 10) || 'Unknown';
      const backByProd = returnedQtyByProduct(b);

      let billCogs = 0;
      let billDisc = Math.max(0, Number(b.additionalDiscount) || 0);

      b.items.forEach((item) => {
        const retQty = backByProd[item.productId] || 0;
        const netQty = Math.max(0, (Number(item.qty) || 0) - retQty);
        billCogs += lineCogs(item, netQty, viewBasis);
        billDisc += Number(item.discount) || 0;
      });

      const netBilled = billNetTotal(b);
      const { taxable, gst: bGst } = taxBasisOf(b);

      const opProfit = taxable - billCogs;
      const billedProfit = netBilled - billCogs;
      const activeProfit = viewBasis === 'exGst' ? opProfit : billedProfit;
      const activeRev = viewBasis === 'exGst' ? taxable : netBilled;

      const existing = map.get(d);
      if (!existing) {
        map.set(d, {
          date: d,
          invoices: 1,
          netSales: netBilled,
          taxableSales: taxable,
          gstAmount: bGst,
          cogs: billCogs,
          grossProfit: activeProfit,
          marginPct: activeRev > 0 ? (activeProfit / activeRev) * 100 : 0,
          discounts: billDisc,
        });
      } else {
        existing.invoices += 1;
        existing.netSales += netBilled;
        existing.taxableSales += taxable;
        existing.gstAmount += bGst;
        existing.cogs += billCogs;
        existing.discounts += billDisc;

        const cumProfit =
          viewBasis === 'exGst'
            ? existing.taxableSales - existing.cogs
            : existing.netSales - existing.cogs;
        const cumRev = viewBasis === 'exGst' ? existing.taxableSales : existing.netSales;
        existing.grossProfit = cumProfit;
        existing.marginPct = cumRev > 0 ? (cumProfit / cumRev) * 100 : 0;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredBills, productMap, viewBasis, lineCogs, taxBasisOf]);

  /**
   * Batch-wise profit: attribute each bill line's revenue & COGS to the stock batches
   * the invoice was actually issued from (batchAllocations). Falls back to an
   * "Unallocated · Average Cost" bucket when older bills have no FEFO allocation.
   */

  const basisText = viewBasis === 'exGst' ? 'Ex-GST operating profit' : 'Incl-GST billed value';
  const pct2 = (n: number) => `${n.toFixed(2)}%`;

  const exportExcel = () =>
    downloadXlsx(`sales-margin-pnl-${viewBasis}-${fileStamp()}.xlsx`, [
      {
        name: 'Summary',
        header: ['Item', 'Value'],
        rows: [
          ['Period', periodLabel],
          ['Basis', basisText],
          ['Gross sales', pnl.grossSales],
          ['Discounts', pnl.totalDiscounts],
          ['Taxable sales (Ex-GST)', pnl.taxableSalesNet],
          ['Output GST', pnl.totalOutputGstNet],
          ['Net invoiced (Incl-GST)', pnl.billedSalesNet],
          ['Cost of goods (COGS)', pnl.cogs],
          ['Operating profit', pnl.operatingGrossProfit],
          ['Operating margin %', Number(pnl.operatingMarginPct.toFixed(2))],
          ['Billed cases', pnl.casesSold],
          ['Free cases', pnl.freeCases],
          ['Total dispatched', pnl.totalDispatchedCases],
          ['Invoices', pnl.invoiceCount],
        ],
      },
      {
        name: 'Products',
        header: ['Product', 'Category', 'Billed cs', 'Free cs', 'Dispatched', 'Cost / cs', 'Avg sell (Incl GST)', 'Avg sell (Ex GST)', 'Taxable sales', 'Output GST', 'Billed net', 'COGS', 'Operating profit', 'Profit / cs', 'Margin %'],
        rows: productRows.map((r) => [r.productName, r.category, r.casesSold, r.freeCases, r.totalDispatched, r.costPerCase, r.avgBilledSellRate, r.avgTaxableSellRate, r.taxableSales, r.gstAmount, r.netSales, r.cogs, r.operatingProfit, r.profitPerCase, Number(r.operatingMarginPct.toFixed(2))]),
      },
      {
        name: 'Customers',
        header: ['Customer', 'Invoices', 'Cases', 'Taxable sales', 'GST', 'Billed net', 'COGS', 'Profit', 'Margin %', 'Outstanding'],
        rows: customerRows.map((r) => [r.customerName, r.invoices, r.casesSold, r.taxableSales, r.gstAmount, r.netSales, r.cogs, r.grossProfit, Number(r.marginPct.toFixed(2)), r.outstanding]),
      },
      {
        name: 'By day',
        header: ['Date', 'Invoices', 'Billed net', 'Taxable sales', 'GST', 'COGS', 'Profit', 'Margin %', 'Discounts'],
        rows: dayRows.map((r) => [r.date, r.invoices, r.netSales, r.taxableSales, r.gstAmount, r.cogs, r.grossProfit, Number(r.marginPct.toFixed(2)), r.discounts]),
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `sales-margin-pnl-${viewBasis}-${fileStamp()}.pdf`,
      title: 'Sales, margin & profit / loss',
      subtitle: ['MrWater Distribution', `Period: ${periodLabel}`, `Basis: ${basisText}`],
      landscape: true,
      sections: [
        {
          title: 'Summary',
          header: ['Item', 'Amount (Rs.)'],
          rows: [
            ['Taxable sales (Ex-GST)', money(pnl.taxableSalesNet)],
            ['Output GST', money(pnl.totalOutputGstNet)],
            ['Net invoiced (Incl-GST)', money(pnl.billedSalesNet)],
            ['Cost of goods (COGS)', money(pnl.cogs)],
            ['Operating profit', money(pnl.operatingGrossProfit)],
            ['Operating margin', pct2(pnl.operatingMarginPct)],
          ],
          rightAlign: [1],
        },
        {
          title: 'Products',
          header: ['Product', 'Billed cs', 'Free cs', 'Taxable sales', 'COGS', 'Profit', 'Margin'],
          rows: productRows.map((r) => [r.productName, r.casesSold, r.freeCases, money(r.taxableSales), money(r.cogs), money(r.operatingProfit), pct2(r.operatingMarginPct)]),
          rightAlign: [1, 2, 3, 4, 5, 6],
        },
        {
          title: 'Customers',
          header: ['Customer', 'Invoices', 'Cases', 'Billed net', 'Profit', 'Margin', 'Outstanding'],
          rows: customerRows.map((r) => [r.customerName, r.invoices, r.casesSold, money(r.netSales), money(r.grossProfit), pct2(r.marginPct), money(r.outstanding)]),
          rightAlign: [1, 2, 3, 4, 5, 6],
        },
        {
          title: 'By day',
          header: ['Date', 'Invoices', 'Billed net', 'Taxable sales', 'Profit', 'Margin'],
          rows: dayRows.map((r) => [r.date, r.invoices, money(r.netSales), money(r.taxableSales), money(r.grossProfit), pct2(r.marginPct)]),
          rightAlign: [1, 2, 3, 4, 5],
        },
      ],
    });

  const marginColor = (pct: number) =>
    pct >= 25 ? 'text-emerald-700' : pct >= 12 ? 'text-sky-700' : pct >= 0 ? 'text-amber-700' : 'text-rose-700';

  const marginBg = (pct: number) =>
    pct >= 25
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : pct >= 12
        ? 'bg-sky-50 border-sky-200 text-sky-800'
        : pct >= 0
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-rose-50 border-rose-200 text-rose-800';

  const tabs: { id: MarginSubTab; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    { id: 'netProfit', label: 'Salary budget', shortLabel: 'Salary', icon: <Wallet className="w-3.5 h-3.5" /> },
    { id: 'products', label: 'Products', shortLabel: 'Products', icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'customers', label: 'Customers', shortLabel: 'Customers', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'days', label: 'By day', shortLabel: 'Days', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  ];

  const showControls = subTab !== 'netProfit';
  const showSearch = subTab === 'products' || subTab === 'customers';
  const searchHint =
    subTab === 'products' ? 'Search product…' : 'Search customer…';
  const tabOptions = tabs.map((t) => ({ id: t.id, label: t.label }));
  const basisOptions: { id: ProfitViewBasis; label: string }[] = [
    { id: 'exGst', label: 'Ex-GST (operating profit)' },
    { id: 'inclGst', label: 'Incl-GST (billed value)' },
  ];
  const phoneBasisOptions: { id: ProfitViewBasis; label: string }[] = [
    { id: 'exGst', label: 'Ex-GST' },
    { id: 'inclGst', label: 'Incl-GST' },
  ];
  const sortOptions: { id: typeof sortBy; label: string }[] = [
    { id: 'profit', label: 'Profit' },
    { id: 'margin', label: 'Margin %' },
    { id: 'sales', label: 'Sales' },
    { id: 'cases', label: 'Cases' },
  ];
  const isFiltered = showSearch && search.trim().length > 0;
  const profitNeg = pnl.activeGrossProfit < 0;
  const paidPct = pnl.collected > 0 ? `${((pnl.collected / (pnl.billedSalesNet || 1)) * 100).toFixed(0)}% paid` : '0% paid';
  const rs = (n: number) => `₹${money(n)}`;

  const mobileMenuCards: SubPageCard<MarginSubTab>[] = [
    {
      id: 'netProfit',
      title: 'Salary budget and pay',
      summary: 'Net profit after running costs and pay already given, plus how much can be shared as staff pay',
      badge: 'Open report',
      badgeTone: 'green',
      icon: Wallet,
      tone: 'emerald',
    },
    {
      id: 'products',
      title: 'Product Margins and Profit',
      summary: `${productRows.length} product${productRows.length === 1 ? '' : 's'} · landed cost, average selling price and profit per case for each`,
      badge: `${productRows.length} item${productRows.length === 1 ? '' : 's'}`,
      badgeTone: 'blue',
      icon: Package,
      tone: 'blue',
    },
    {
      id: 'customers',
      title: 'Customer Account Margins',
      summary: `${customerRows.length} customer${customerRows.length === 1 ? '' : 's'} · sales, cost and true profit earned from each party`,
      badge: `${customerRows.length} buyer${customerRows.length === 1 ? '' : 's'}`,
      badgeTone: 'purple',
      icon: Users,
      tone: 'purple',
    },
    {
      id: 'days',
      title: 'Daily Sales and Margins',
      summary: `${dayRows.length} day${dayRows.length === 1 ? '' : 's'} with sales · invoices, billed amount, profit and margin % for each day`,
      badge: `${dayRows.length} day${dayRows.length === 1 ? '' : 's'}`,
      badgeTone: 'cyan',
      icon: TrendingUp,
      tone: 'cyan',
    },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-200" id="report-sales-margin-pnl">
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3">
        <PhoneHeader title="Sales, margin & P&L" sub="Revenue, gross margin and profitability" />

        {mobileActiveSubPage === null ? (
          <>
            {showControls && (
              <HeroCard tone={profitNeg ? 'red' : 'profit'} label={viewBasis === 'exGst' ? 'Operating profit' : 'Gross margin'} value={rs(pnl.activeGrossProfit)} negative={profitNeg}>
                <SplitBar
                  label="Cost versus profit"
                  parts={[
                    { value: pnl.cogs, className: 'bg-amber-300' },
                    { value: Math.max(0, pnl.activeGrossProfit), className: 'bg-emerald-300' },
                  ]}
                />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/90">
                  <LegendDot dot="bg-amber-300">Cost {rs(pnl.cogs)}</LegendDot>
                  <LegendDot dot="bg-emerald-300">{pnl.activeMarginPct.toFixed(1)}% margin</LegendDot>
                </div>
              </HeroCard>
            )}
            {showControls && (
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="You got" value={rs(pnl.activeNetSales)} />
                <MiniStat label="You spent" value={rs(pnl.cogs)} tone="amber" />
                <MiniStat label="Invoices" value={pnl.invoiceCount} />
              </div>
            )}
            {showControls && (
              <button type="button" onClick={() => setExplainOpen(true)} className="px-1 text-xs font-semibold text-sky-700 inline-flex items-center gap-1 cursor-pointer min-h-[36px]">
                <Info size={13} aria-hidden="true" /> How is this calculated?
              </button>
            )}

            {/* Every section is a full-width card row: full name + full summary, opens as its own page */}
            <SubPageMenu<MarginSubTab>
              heading="Sales, margin & P&L sections"
              cards={mobileMenuCards}
              onOpen={(id) => {
                setSubTab(id);
                setMobileActiveSubPage(id);
              }}
            />
          </>
        ) : (
          <>
            <SubPageBack
              backLabel="All sales, margin & P&L sections"
              title={mobileMenuCards.find((c) => c.id === mobileActiveSubPage)?.title || ''}
              onBack={() => setMobileActiveSubPage(null)}
            />

            {showControls && <Chips<ProfitViewBasis> label="Profit basis" options={phoneBasisOptions} value={viewBasis} onChange={setViewBasis} />}
            {showSearch && (
              <>
                <PhoneSearch value={search} onChange={setSearch} placeholder={searchHint} />
                <Chips<typeof sortBy> label="Sort by" options={sortOptions} value={sortBy} onChange={setSortBy} />
              </>
            )}
          </>
        )}
      </div>

      {/* ======================= TABLET / DESKTOP ======================= */}
      <div className="hidden md:block space-y-3">
        <ReportTitleBar
          title="Sales, margin & P&L"
          sub={`${periodLabel} · revenue, cost and margin by product, batch, customer and day`}
          actions={showControls ? <ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={pnl.invoiceCount === 0} reportTitle="Sales, margin and P&L" /> : undefined}
        />

        {showControls && (
          <>
            <ReportStatGrid>
              <ReportStat label="You got" value={rs(pnl.activeNetSales)} tone="sky" sub={viewBasis === 'exGst' ? `Taxable sales · GST ${rs(pnl.totalOutputGstNet)}` : `Net billed · GST ${rs(pnl.totalOutputGstNet)}`} />
              <ReportStat label="You spent" value={rs(pnl.cogs)} tone="amber" sub={`${pnl.totalDispatchedCases} cs (${pnl.freeCases} free) · ${rs(pnl.avgCostPerCase)} / cs`} />
              <ReportStat label={viewBasis === 'exGst' ? 'Operating profit' : 'Gross margin'} value={rs(pnl.activeGrossProfit)} tone={profitNeg ? 'red' : 'green'} sub={`${rs(pnl.avgProfitPerCase)} / cs profit`} />
              <ReportStat
                label="Margin"
                value={`${pnl.activeMarginPct.toFixed(1)}%`}
                tone={pnl.activeMarginPct >= 12 ? 'green' : pnl.activeMarginPct >= 0 ? 'amber' : 'red'}
                sub={`${pnl.invoiceCount} invoices · ${paidPct}`}
              />
            </ReportStatGrid>
            <ReportBreakdownLine onExplain={() => setExplainOpen(true)}>
              <span>
                {viewBasis === 'exGst'
                  ? `Ex-GST view · sales ${rs(pnl.taxableSalesNet)} + GST ${rs(pnl.totalOutputGstNet)} = billed ${rs(pnl.billedSalesNet)}`
                  : `Incl-GST view · billed ${rs(pnl.billedSalesNet)} includes GST ${rs(pnl.totalOutputGstNet)} owed to the government`}
              </span>
            </ReportBreakdownLine>
          </>
        )}

        <ReportFilterPanel
          search={showSearch ? { value: search, onChange: setSearch, placeholder: searchHint } : undefined}
          isFiltered={isFiltered}
          onReset={() => setSearch('')}
        >
          <ReportChipGroup<MarginSubTab> label="View" options={tabOptions} value={subTab} onChange={setSubTab} />
          {showControls && <ReportChipGroup<ProfitViewBasis> label="Basis" options={basisOptions} value={viewBasis} onChange={setViewBasis} />}
          {showSearch && <ReportChipGroup<typeof sortBy> label="Sort" options={sortOptions} value={sortBy} onChange={setSortBy} />}
        </ReportFilterPanel>
      </div>

      {/* Subtab views - on mobile only shown when a subpage card is selected */}
      <div className={mobileActiveSubPage === null ? 'hidden md:block' : ''}>
      {/* ===== 2. PRODUCT MARGINS & PRICING TABLE ===== */}
      {subTab === 'products' && (
        <div className="space-y-2">
          {/* Table Description Note */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500 px-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">
                {productRows.length} Product SKUs Sold
              </span>
              <span>·</span>
              <span>
                <strong>Method 2 Selling Price</strong> = Dividing by Billed Cases only
              </span>
              <span>·</span>
              <span className="text-emerald-700 font-semibold">
                Ex-GST True Operating Profit is primary
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Click any row or &ldquo;Inspect&rdquo; to view custom rates &amp; profit formula
            </span>
          </div>

          <div className="md:hidden space-y-3" id="margin-product-cards">
            {productRows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-black/10 px-4 py-10 text-center text-sm text-slate-500">
                No product sales matching this period or filter.
              </div>
            ) : (
              productRows.map((r) => (
                <RegisterCard
                  key={r.productId}
                  title={r.productName}
                  pills={
                    <>
                      {r.freeCases > 0 && <Pill tone="amber">Scheme</Pill>}
                      <span className={`inline-flex text-[10px] font-black px-2 py-0.5 rounded-md border ${marginBg(r.operatingMarginPct)}`}>
                        {r.operatingMarginPct.toFixed(1)}%
                      </span>
                    </>
                  }
                  subtitle={r.category}
                  heroLabel="Operating profit"
                  hero={`₹${money(r.operatingProfit)}`}
                  heroTone={r.operatingProfit >= 0 ? 'green' : 'red'}
                  segments={[
                    { value: r.cogs, className: 'bg-amber-500', label: 'COGS' },
                    { value: Math.max(0, r.operatingProfit), className: 'bg-emerald-600', label: 'Operating profit' },
                  ]}
                  stats={[
                    { label: 'Billed', value: `${r.casesSold} cs` },
                    { label: 'Free', value: r.freeCases > 0 ? `+${r.freeCases} cs` : '—', tone: r.freeCases > 0 ? 'amber' : 'muted' },
                    { label: 'Total', value: `${r.totalDispatched} cs`, tone: 'sky' },
                    { label: 'Avg sell / cs', value: `₹${money(r.avgBilledSellRate)}` },
                    { label: 'Billed net', value: `₹${money(r.netSales)}`, tone: 'sky' },
                    { label: 'COGS', value: `₹${money(r.cogs)}`, tone: 'amber' },
                  ]}
                  note={
                    <div className="text-[11px] text-slate-500 font-mono">
                      Cost ₹{money(r.costPerCase)} / cs · +₹{money(r.profitPerCase)} profit / cs
                    </div>
                  }
                  actions={
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProductForModal(r);
                        setIsPricingModalOpen(true);
                      }}
                      className="flex-1 min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 text-[13px] font-bold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Calculator className="w-4 h-4" /> Rates &amp; profit guide
                    </button>
                  }
                />
              ))
            )}
          </div>
          <div className="hidden md:block overflow-x-auto overscroll-x-contain rounded-2xl border border-black/10 bg-white">
            <table className="w-full text-left data-table min-w-[980px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#faf8f5] text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5">Product SKU</th>
                  <th className="px-2 py-2.5 text-right">Billed cs</th>
                  <th className="px-2 py-2.5 text-right">Free cs</th>
                  <th className="px-2 py-2.5 text-right">Total cs</th>
                  <th className="px-2 py-2.5 text-right">Inward Cost</th>
                  <th className="px-3 py-2.5 text-right font-black text-sky-900">
                    Avg Sell (Method 2)
                  </th>
                  <th className="px-3 py-2.5 text-right">Taxable (Ex-GST)</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-700">
                    GST (Output)
                  </th>
                  <th className="px-3 py-2.5 text-right">Billed Net</th>
                  <th className="px-2 py-2.5 text-right">COGS</th>
                  <th className="px-3 py-2.5 text-right font-black text-emerald-800">
                    Operating Profit
                  </th>
                  <th className="px-2 py-2.5 text-right">Margin %</th>
                  <th className="px-2 py-2.5 text-center no-print">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-10 text-slate-500 text-sm">
                      No product sales matching this period or filter.
                    </td>
                  </tr>
                ) : (
                  productRows.map((r) => (
                    <tr
                      key={r.productId}
                      onClick={() => {
                        setSelectedProductForModal(r);
                        setIsPricingModalOpen(true);
                      }}
                      className="hover:bg-sky-50/50 transition-colors cursor-pointer"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{r.productName}</span>
                          {r.freeCases > 0 && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Scheme
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {r.category}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900">
                        {r.casesSold}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-amber-700">
                        {r.freeCases > 0 ? `+${r.freeCases}` : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono font-bold tabular-nums text-slate-700">
                        {r.totalDispatched}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-600">
                        <div className="font-bold text-slate-900">₹{money(r.costPerCase)}</div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {viewBasis === 'exGst' ? (
                            <span title="Original Inward Bill Landed Rate (Inclusive of GST + Landing Cost)">
                              Landed: ₹{money(r.landedCostPerCase)}
                            </span>
                          ) : (
                            <span title={costIncludesGst ? 'Inward purchase cost including the GST paid (no input credit under composition)' : 'Pre-tax Inward Purchase Rate (Ex-GST)'}>
                              {costIncludesGst ? 'Cost incl. GST' : 'Ex-GST'}: ₹{money(r.exGstCostPerCase)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="font-mono font-black tabular-nums text-sky-950">
                          ₹{money(r.avgBilledSellRate)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Ex-GST: ₹{money(r.avgTaxableSellRate)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-slate-800">
                        ₹{money(r.taxableSales)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500">
                        ₹{money(r.gstAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-sky-900">
                        ₹{money(r.netSales)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-amber-800">
                        ₹{money(r.cogs)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-black tabular-nums ${
                          r.operatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        <div>₹{money(r.operatingProfit)}</div>
                        <div className="text-[10px] font-normal text-emerald-800">
                          +₹{money(r.profitPerCase)} / cs
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span
                          className={`inline-flex text-[10px] font-black px-2 py-0.5 rounded-md border ${marginBg(
                            r.operatingMarginPct
                          )}`}
                        >
                          {r.operatingMarginPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-center no-print" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProductForModal(r);
                            setIsPricingModalOpen(true);
                          }}
                          className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-sky-100 text-slate-700 hover:text-sky-800 text-[11px] font-bold flex items-center gap-1 mx-auto transition-colors cursor-pointer"
                          title="Inspect custom rates, selling price and profit calculation"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          <span>Guide</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== 3. CUSTOMER MARGINS TABLE ===== */}
      {subTab === 'customers' && (
        <div className="space-y-2">
          <div className="hidden md:block overflow-x-auto overscroll-x-contain rounded-2xl border border-black/10 bg-white">
            <table className="w-full text-left data-table min-w-[760px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#faf8f5] text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5">Customer Party</th>
                  <th className="px-3 py-2.5 text-right">Invoices</th>
                  <th className="px-3 py-2.5 text-right">Cases Sold</th>
                  <th className="px-3 py-2.5 text-right">You got</th>
                  <th className="px-3 py-2.5 text-right">GST</th>
                  <th className="px-3 py-2.5 text-right">Billed Net</th>
                  <th className="px-3 py-2.5 text-right">You spent</th>
                  <th className="px-3 py-2.5 text-right font-black">Profit</th>
                  <th className="px-3 py-2.5 text-right">Margin %</th>
                  <th className="px-3 py-2.5 text-right">Balance Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customerRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-slate-500 text-sm">
                      No customer sales matching this period.
                    </td>
                  </tr>
                ) : (
                  customerRows.map((r) => (
                    <tr key={r.customerKey} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        {r.customerName}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{r.invoices}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">{r.casesSold}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-700">
                        ₹{money(r.taxableSales)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                        ₹{money(r.gstAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sky-800">
                        ₹{money(r.netSales)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-800">
                        ₹{money(r.cogs)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-black ${
                          r.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        ₹{money(r.grossProfit)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`inline-flex text-[10px] font-black px-2 py-0.5 rounded-md border ${marginBg(r.marginPct)}`}>
                          {r.marginPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-700">
                        {r.outstanding > 0 ? `₹${money(r.outstanding)}` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="block md:hidden space-y-3" id="margin-customer-cards">
            {customerRows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-black/10 px-4 py-10 text-center text-sm text-slate-500">
                No customer sales matching this period.
              </div>
            ) : (
              customerRows.map((r) => (
                <RegisterCard
                  key={r.customerKey}
                  title={r.customerName}
                  pills={<span className={`inline-flex text-[10px] font-black px-2 py-0.5 rounded-md border ${marginBg(r.marginPct)}`}>{r.marginPct.toFixed(1)}%</span>}
                  subtitle={`${r.invoices} invoice${r.invoices === 1 ? '' : 's'} · ${r.casesSold} cs`}
                  heroLabel="Profit"
                  hero={`₹${money(r.grossProfit)}`}
                  heroTone={r.grossProfit >= 0 ? 'green' : 'red'}
                  segments={[
                    { value: r.cogs, className: 'bg-amber-500', label: 'You spent' },
                    { value: Math.max(0, r.grossProfit), className: 'bg-emerald-600', label: 'Profit' },
                  ]}
                  stats={[
                    { label: 'You got', value: `₹${money(viewBasis === 'exGst' ? r.taxableSales : r.netSales)}`, tone: 'sky' },
                    { label: 'You spent', value: `₹${money(r.cogs)}`, tone: 'amber' },
                    { label: 'Due', value: `₹${money(r.outstanding)}`, tone: r.outstanding > 0 ? 'red' : 'muted' },
                  ]}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* ===== 4. DAY-WISE P&L TABLE ===== */}
      {subTab === 'days' && (
        <div className="space-y-2">
          <div className="hidden md:block overflow-x-auto overscroll-x-contain rounded-2xl border border-black/10 bg-white">
            <table className="w-full text-left data-table min-w-[650px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#faf8f5] text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5 text-right">Invoices</th>
                  <th className="px-3 py-2.5 text-right">You got</th>
                  <th className="px-3 py-2.5 text-right">GST</th>
                  <th className="px-3 py-2.5 text-right">Billed Net</th>
                  <th className="px-3 py-2.5 text-right">You spent</th>
                  <th className="px-3 py-2.5 text-right font-black">Profit</th>
                  <th className="px-3 py-2.5 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dayRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-500 text-sm">
                      No sales days recorded in this period.
                    </td>
                  </tr>
                ) : (
                  dayRows.map((r) => (
                    <tr key={r.date} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{r.invoices}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-700">
                        ₹{money(r.taxableSales)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                        ₹{money(r.gstAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sky-800">
                        ₹{money(r.netSales)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-800">
                        ₹{money(r.cogs)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-black ${
                          r.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        ₹{money(r.grossProfit)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`inline-flex text-[10px] font-black px-2 py-0.5 rounded-md border ${marginBg(r.marginPct)}`}>
                          {r.marginPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="block md:hidden space-y-3" id="margin-day-cards">
            {dayRows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-black/10 px-4 py-10 text-center text-sm text-slate-500">
                No sales days recorded in this period.
              </div>
            ) : (
              dayRows.map((r) => (
                <RegisterCard
                  key={r.date}
                  title={<span className="font-mono">{r.date}</span>}
                  pills={<span className={`inline-flex text-[10px] font-black px-2 py-0.5 rounded-md border ${marginBg(r.marginPct)}`}>{r.marginPct.toFixed(1)}%</span>}
                  subtitle={`${r.invoices} invoice${r.invoices === 1 ? '' : 's'}`}
                  heroLabel="Profit"
                  hero={`₹${money(r.grossProfit)}`}
                  heroTone={r.grossProfit >= 0 ? 'green' : 'red'}
                  segments={[
                    { value: r.cogs, className: 'bg-amber-500', label: 'You spent' },
                    { value: Math.max(0, r.grossProfit), className: 'bg-emerald-600', label: 'Profit' },
                  ]}
                  stats={[
                    { label: 'You got', value: `₹${money(viewBasis === 'exGst' ? r.taxableSales : r.netSales)}`, tone: 'sky' },
                    { label: 'You spent', value: `₹${money(r.cogs)}`, tone: 'amber' },
                  ]}
                />
              ))
            )}
          </div>
        </div>
      )}

      {subTab === 'netProfit' && dateInPeriod && (
        <NetProfitReport
          dateInPeriod={dateInPeriod}
          filteredBills={filteredBills}
          products={products}
          gstTaxSummary={gstTaxSummary}
          purchaseStats={purchaseStats}
          periodLabel={periodLabel}
        />
      )}
      </div>

      {/* Interactive Product Profit & Pricing Modal */}
      <ProductProfitPricingModal
        isOpen={isPricingModalOpen}
        onClose={() => {
          setIsPricingModalOpen(false);
          setSelectedProductForModal(null);
        }}
        row={selectedProductForModal}
        bills={filteredBills}
      />

      {showControls && <PhoneDownloadBar onExcel={exportExcel} onPdf={exportPdf} disabled={pnl.invoiceCount === 0} />}

      {explainOpen && (
        <ReportExplainModal ariaLabel="How sales, margin and profit are calculated" onClose={() => setExplainOpen(false)}>
          <ExplainBox tone="emerald" title={viewBasis === 'exGst' ? `Ex-GST operating profit: ${rs(pnl.operatingGrossProfit)}` : `Incl-GST billed value: ${rs(pnl.billedSalesNet)}`}>
            {viewBasis === 'exGst' ? (
              <p>
                Revenue is taxable turnover ({rs(pnl.taxableSalesNet)}) with output GST ({rs(pnl.totalOutputGstNet)}) shown separately. Cost covers all {pnl.totalDispatchedCases} crates
                dispatched, including {pnl.freeCases} free scheme crates, from the batch each invoice was issued from plus inward freight and labour.
              </p>
            ) : (
              <p>
                Invoiced revenue of {rs(pnl.billedSalesNet)} includes {rs(pnl.totalOutputGstNet)} GST. That GST is owed to the government (less input credit) and is not profit you keep.
              </p>
            )}
          </ExplainBox>
          <ExplainBox tone="slate" title={`Average selling price`}>
            <p>Sales divided by billed cases only ({pnl.casesSold}). Free scheme crates add cost but no billed sales.</p>
          </ExplainBox>
        </ReportExplainModal>
      )}
    </div>
  );
};
