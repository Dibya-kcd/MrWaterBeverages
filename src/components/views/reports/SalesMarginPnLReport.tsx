import React, { useCallback, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
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
import { money, normalizeGstFraction, resolveProductGstRate, scaledTaxSplit } from '../../../utils/billing';
import { billBalance, billNetTotal, returnedQtyByProduct, billReturnCredit, returnedCreditByProduct } from '../../../utils/salesReturns';
import { CATS } from '../../../constants/initialData';
import { writeOffNetForPeriod, schemeCreditsForPeriod } from '../../../utils/pnlBridge';
import { ProductProfitPricingModal } from './ProductProfitPricingModal';
import { InfoTip } from '../../common/InfoTip';

export interface SalesMarginPnLReportProps {
  filteredBills: Bill[];
  products: Product[];
  periodLabel: string;
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

export type MarginSubTab = 'pnl' | 'products' | 'batches' | 'customers' | 'days';
export type ProfitViewBasis = 'exGst' | 'inclGst';

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

  const { inventoryBatches, inventoryDispositions, supplierCreditNotes, grns } = useLedger();
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
  const inwardByBatch = useMemo(() => {
    const m = new Map<string, number>();
    (grns || []).forEach((g: any) => {
      const grnLevel = Number(g?.inwardCostPerCrate) || 0;
      (g?.items || []).forEach((it: any) => {
        const per = Number(it?.inwardCostPerCrate) || grnLevel;
        if (per > 0) m.set(`batch_${g.id}_${it.id}`, per);
      });
    });
    return m;
  }, [grns]);

  /** Inward cost per crate of ONE bill line: weighted by the batches the cases were taken from. */
  const lineInwardPerCrate = useCallback(
    (item: BillItem): number => {
      let q = 0;
      let c = 0;
      for (const a of item.batchAllocations || []) {
        const aq = Number(a.qty) || 0;
        if (aq <= 0) continue;
        q += aq;
        c += aq * (inwardByBatch.get(a.batchId) || 0);
      }
      return q > 0 ? c / q : 0;
    },
    [inwardByBatch]
  );

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
      if (basis === 'exGst') return (avgEx + lineInwardPerCrate(item)) * physicalQty;
      const landedRatio = exFallback > 0 ? landedFallback / exFallback : 1;
      return avgEx * landedRatio * physicalQty;
    },
    [productMap, batchMap, lineInwardPerCrate]
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

      // Extract returns for this bill
      const returnCredit = billReturnCredit(b);
      const returns = b.returns || [];
      const returnCgst = returns.reduce((s, r) => s + (Number(r.cgst) || 0), 0);
      const returnSgst = returns.reduce((s, r) => s + (Number(r.sgst) || 0), 0);
      const returnTax = returnCgst + returnSgst;
      const returnTaxable = Math.max(0, returnCredit - returnTax);

      // Bill-level taxable and GST net of returns
      const bSubtotal = Number(b.subtotal);
      const bCgst = Number(b.cgst) || 0;
      const bSgst = Number(b.sgst) || 0;
      const billGstGross = bCgst + bSgst;
      const billGstNet = Math.max(0, billGstGross - returnTax);
      totalOutputGstNet += billGstNet;

      // Net Taxable Turnover (Ex-GST)
      const billTaxableNet =
        Number.isFinite(bSubtotal) && bSubtotal > 0
          ? Math.max(0, bSubtotal - returnTaxable)
          : Math.max(0, billNet - billGstNet);
      taxableSalesNet += billTaxableNet;

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
  }, [filteredBills, productMap, viewBasis, gstTaxSummary, purchaseStats, lineCogs, inventoryDispositions, supplierCreditNotes, dateInPeriod, lineInwardPerCrate, lineCostQuality]);
  return { pnl, productMap, batchMap, lineCogs };
}

export const SalesMarginPnLReport: React.FC<SalesMarginPnLReportProps> = ({
  filteredBills,
  products,
  periodLabel,
  dateInPeriod,
  gstTaxSummary,
  purchaseStats,
}) => {
  const [subTab, setSubTab] = useState<MarginSubTab>('pnl');
  const [viewBasis, setViewBasis] = useState<ProfitViewBasis>('exGst');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'profit' | 'margin' | 'sales' | 'cases'>('profit');

  // Modal inspection state
  const [selectedProductForModal, setSelectedProductForModal] = useState<ProductMarginRow | null>(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  const { pnl, productMap, batchMap, lineCogs } = useSalesMarginPnl({
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
      const returns = b.returns || [];
      const returnTax = returns.reduce((s, r) => s + (Number(r.cgst) || 0) + (Number(r.sgst) || 0), 0);
      const bGst = Math.max(0, (Number(b.cgst) || 0) + (Number(b.sgst) || 0) - returnTax);
      const taxable = Math.max(0, netBilled - bGst);

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
  }, [filteredBills, productMap, search, sortBy, viewBasis, lineCogs]);

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
      const returns = b.returns || [];
      const returnTax = returns.reduce((s, r) => s + (Number(r.cgst) || 0) + (Number(r.sgst) || 0), 0);
      const bGst = Math.max(0, (Number(b.cgst) || 0) + (Number(b.sgst) || 0) - returnTax);
      const taxable = Math.max(0, netBilled - bGst);

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
  }, [filteredBills, productMap, viewBasis, lineCogs]);

  /**
   * Batch-wise profit: attribute each bill line's revenue & COGS to the stock batches
   * the invoice was actually issued from (batchAllocations). Falls back to an
   * "Unallocated · Average Cost" bucket when older bills have no FEFO allocation.
   */
  const batchRows = useMemo(() => {
    interface BatchAcc {
      row: BatchMarginRow;
      exCogs: number;
      landedCogs: number;
    }
    const map = new Map<string, BatchAcc>();

    const ensure = (
      key: string,
      seed: Partial<BatchMarginRow> & { productId: number; productName: string; category: string }
    ): BatchAcc => {
      let acc = map.get(key);
      if (!acc) {
        acc = {
          exCogs: 0,
          landedCogs: 0,
          row: {
            batchKey: key,
            batchNumber: seed.batchNumber || 'Unallocated',
            productId: seed.productId,
            productName: seed.productName,
            category: seed.category,
            supplierName: seed.supplierName || '—',
            inwardDate: seed.inwardDate || '',
            expiryDate: seed.expiryDate || '',
            casesSold: 0,
            freeCases: 0,
            totalDispatched: 0,
            costPerCase: 0,
            netSales: 0,
            taxableSales: 0,
            gstAmount: 0,
            cogs: 0,
            grossProfit: 0,
            marginPct: 0,
            operatingProfit: 0,
            operatingMarginPct: 0,
            profitPerCase: 0,
            avgSellRate: 0,
          },
        };
        map.set(key, acc);
      }
      return acc;
    };

    filteredBills.forEach((b) => {
      if (b.status === 'cancelled') return;
      const backByProd = returnedQtyByProduct(b);
      const creditBackByProd = returnedCreditByProduct(b);

      b.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const qty = Number(item.qty) || 0;
        const free = Number(item.freeQty) || 0;
        const gross = Number(item.gross) || qty * (Number(item.rate) || 0);
        const disc = Number(item.discount) || 0;
        const billedNet = Number(item.amount) || gross - disc;
        const retQty = backByProd[item.productId] || 0;
        const netCases = Math.max(0, qty - retQty);
        if (netCases <= 0 && billedNet <= 0) return;

        const freeNet = Math.min(free, netCases);
        const paidCases = netCases - freeNet;

        const retCredit = creditBackByProd[item.productId] || 0;
        const netBilled = Math.max(0, billedNet - retCredit);
        const retRatio = billedNet > 0 ? Math.min(1, retCredit / billedNet) : 0;

        const g = item.gst !== undefined && item.gst !== null
          ? normalizeGstFraction(item.gst)
          : resolveProductGstRate(prod, item.category);
        const split = scaledTaxSplit(item, netBilled, g);
        const taxable = split.taxable;
        const gst = split.tax;

        const allocations = item.batchAllocations || [];
        const allocTotal = allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0);

        // Scale allocations down if returns reduced physical qty
        const scale = qty > 0 ? netCases / qty : 1;

        if (allocations.length > 0 && allocTotal > 0) {
          allocations.forEach((a) => {
            const rawQ = Number(a.qty) || 0;
            if (rawQ <= 0) return;
            const q = rawQ * scale;
            if (q <= 0) return;
            const share = allocTotal > 0 ? rawQ / allocTotal : 0;
            const batch = batchMap.get(a.batchId);
            const key = a.batchId || `${item.productId}::${a.batchNumber || 'unknown'}`;
            const productName = item.productName || prod?.name || `Product #${item.productId}`;
            const category = String(item.category || prod?.category || 'general');
            const acc = ensure(key, {
              productId: item.productId,
              productName,
              category,
              batchNumber: a.batchNumber || batch?.batchNumber || a.batchId.slice(0, 8),
              supplierName: batch?.supplierName || '—',
              inwardDate: batch?.inwardDate || '',
              expiryDate: a.expiryDate || batch?.expiryDate || '',
            });

            const paidShare = paidCases * share;
            const freeShare = freeNet * share;
            acc.row.casesSold += paidShare;
            acc.row.freeCases += freeShare;
            acc.row.totalDispatched += q;
            acc.row.netSales += netBilled * share;
            acc.row.taxableSales += taxable * share;
            acc.row.gstAmount += gst * share;

            // COGS from actual batch cost
            const exFallback = resolveExGstProductCost(prod);
            const landedFallback = resolveLandedProductCost(prod);
            const raw = Number(batch?.effectiveCostPrice) || Number(batch?.costPrice) || 0;
            const sane = raw > 0 && !(exFallback > 0 && raw < exFallback * 0.35);
            const exUnit = sane ? raw : exFallback;
            const landedRatio = exFallback > 0 ? landedFallback / exFallback : 1;
            acc.exCogs += exUnit * q;
            acc.landedCogs += exUnit * landedRatio * q;
          });
        } else {
          // Fallback: unallocated bucket per product
          const key = `unalloc::${item.productId}`;
          const productName = item.productName || prod?.name || `Product #${item.productId}`;
          const category = String(item.category || prod?.category || 'general');
          const acc = ensure(key, {
            productId: item.productId,
            productName,
            category,
            batchNumber: 'Unallocated · Avg Cost',
            supplierName: '—',
            inwardDate: '',
            expiryDate: '',
          });
          acc.row.casesSold += paidCases;
          acc.row.freeCases += freeNet;
          acc.row.totalDispatched += netCases;
          acc.row.netSales += netBilled * (1 - retRatio + retRatio); // already net
          acc.row.taxableSales += taxable;
          acc.row.gstAmount += gst;
          acc.exCogs += lineCogs(item, netCases, 'exGst');
          acc.landedCogs += lineCogs(item, netCases, 'inclGst');
        }
      });
    });

    let rows: BatchMarginRow[] = Array.from(map.values()).map(({ row: r, exCogs, landedCogs }) => {
      const opProfit = r.taxableSales - exCogs;
      const billedProfit = r.netSales - landedCogs;
      const activeProfit = viewBasis === 'exGst' ? opProfit : billedProfit;
      const activeRev = viewBasis === 'exGst' ? r.taxableSales : r.netSales;
      const activeCogs = viewBasis === 'exGst' ? exCogs : landedCogs;
      const disp = r.totalDispatched;
      const costPerCase = disp > 0 ? activeCogs / disp : 0;
      return {
        ...r,
        cogs: activeCogs,
        grossProfit: activeProfit,
        marginPct: activeRev > 0 ? (activeProfit / activeRev) * 100 : 0,
        operatingProfit: opProfit,
        operatingMarginPct: r.taxableSales > 0 ? (opProfit / r.taxableSales) * 100 : 0,
        costPerCase,
        profitPerCase: r.casesSold > 0 ? opProfit / r.casesSold : 0,
        avgSellRate: r.casesSold > 0 ? activeRev / r.casesSold : 0,
      };
    });

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.batchNumber.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
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
  }, [filteredBills, productMap, batchMap, search, sortBy, viewBasis, lineCogs]);

  const handleExportCsv = () => {
    const lines: string[] = [];
    lines.push(`MrWater — Sales, Margin & Profit/Loss Report (${viewBasis === 'exGst' ? 'Ex-GST Operating Profit' : 'Incl-GST Billed Revenue'})`);
    lines.push(`Period,${periodLabel}`);
    lines.push(`Basis,${viewBasis === 'exGst' ? 'Ex-GST (Taxable Turnover - Operating Standard)' : 'Incl-GST (Gross Billed Invoice Collections)'}`);
    lines.push(
      `Gross Sales,Discounts,Taxable Sales (Ex-GST),Output GST,Net Invoiced (Incl-GST),COGS,Operating Profit,Margin %,Billed Cases,Free Cases,Total Dispatched,Invoices`
    );
    lines.push(
      `${pnl.grossSales.toFixed(2)},${pnl.totalDiscounts.toFixed(2)},${pnl.taxableSalesNet.toFixed(2)},${pnl.totalOutputGstNet.toFixed(2)},${pnl.billedSalesNet.toFixed(2)},${pnl.cogs.toFixed(2)},${pnl.operatingGrossProfit.toFixed(2)},${pnl.operatingMarginPct.toFixed(2)},${pnl.casesSold},${pnl.freeCases},${pnl.totalDispatchedCases},${pnl.invoiceCount}`
    );
    lines.push('');
    lines.push(
      `Product Name,Category,Billed Cases,Free Cases,Total Dispatched,Inward Cost / cs,Avg Sell Price (Method 2 - Incl GST),Avg Sell Price (Ex GST),Taxable Sales (Ex-GST),Output GST,Billed Net (Incl-GST),COGS,Operating Profit (Ex-GST),Profit / cs,Operating Margin %`
    );
    productRows.forEach((r) => {
      lines.push(
        `"${r.productName.replace(/"/g, '""')}","${r.category}",${r.casesSold},${r.freeCases},${r.totalDispatched},${r.costPerCase.toFixed(2)},${r.avgBilledSellRate.toFixed(2)},${r.avgTaxableSellRate.toFixed(2)},${r.taxableSales.toFixed(2)},${r.gstAmount.toFixed(2)},${r.netSales.toFixed(2)},${r.cogs.toFixed(2)},${r.operatingProfit.toFixed(2)},${r.profitPerCase.toFixed(2)},${r.operatingMarginPct.toFixed(2)}%`
      );
    });
    lines.push('');
    lines.push(`Customer,Invoices,Cases Sold,Taxable Sales,GST,Billed Net,COGS,Gross Profit,Margin %,Outstanding`);
    customerRows.forEach((r) => {
      lines.push(
        `"${r.customerName.replace(/"/g, '""')}",${r.invoices},${r.casesSold},${r.taxableSales.toFixed(2)},${r.gstAmount.toFixed(2)},${r.netSales.toFixed(2)},${r.cogs.toFixed(2)},${r.grossProfit.toFixed(2)},${r.marginPct.toFixed(2)},${r.outstanding.toFixed(2)}`
      );
    });
    lines.push('');
    lines.push(
      `Batch Number,Product,Category,Supplier,Inward Date,Expiry,Billed Cases,Free Cases,Cost / cs,Taxable Sales,Billed Net,COGS,Operating Profit,Margin %`
    );
    batchRows.forEach((r) => {
      lines.push(
        `"${r.batchNumber.replace(/"/g, '""')}","${r.productName.replace(/"/g, '""')}","${r.category}","${r.supplierName.replace(/"/g, '""')}",${r.inwardDate.slice(0, 10)},${r.expiryDate.slice(0, 10)},${r.casesSold.toFixed(2)},${r.freeCases.toFixed(2)},${r.costPerCase.toFixed(2)},${r.taxableSales.toFixed(2)},${r.netSales.toFixed(2)},${r.cogs.toFixed(2)},${r.operatingProfit.toFixed(2)},${r.operatingMarginPct.toFixed(2)}%`
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MrWater_Sales_Margin_PnL_${viewBasis}_${periodLabel.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

  const tabs: { id: MarginSubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'pnl', label: 'P&L Waterfall & GST Flow', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'products', label: 'Product Margins & Pricing', icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'batches', label: 'Batch-wise Profit', icon: <Boxes className="w-3.5 h-3.5" /> },
    { id: 'customers', label: 'Customer Margins', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'days', label: 'Day-wise P&L', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-200">
      {/* Top Banner & Basis Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
            <Percent className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Sales, Margin &amp; Profit / Loss
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {periodLabel}
              </span>
            </div>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Method 2 Average Selling Price (billed cases) · Ex-GST True Operating Profit · GST column side-by-side
            </p>
          </div>
        </div>

        {/* Basis Toggle: Ex-GST vs Incl-GST + Export */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Basis Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewBasis('exGst')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewBasis === 'exGst'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Excludes GST statutory pass-through liability — recommended standard accounting practice"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Ex-GST (True Operating Profit)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewBasis('inclGst')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewBasis === 'inclGst'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Gross invoice billed collections including GST"
            >
              <IndianRupee className="w-3.5 h-3.5" />
              <span>Incl-GST (Billed Cash Value)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* GST treatment & Method 2 — tap to read */}
      {viewBasis === 'exGst' ? (
        <InfoTip title="Ex-GST True Operating Profit" text="How profit is calculated">
          <p>Revenue is reported as <strong>Net Taxable Turnover (₹{money(pnl.taxableSalesNet)})</strong> after excluding <strong>Output GST (₹{money(pnl.totalOutputGstNet)})</strong> shown side-by-side. <strong>COGS (₹{money(pnl.cogs)})</strong> includes inward cost of all {pnl.totalDispatchedCases} crates dispatched (including {pnl.freeCases} promotional free crates). Cost is taken from the actual stock batch each invoice was issued from (older bills without a batch use the product's average cost), plus the inward freight / labour entered on that batch's GRN. Average Selling Price is calculated using <strong>Method 2 (dividing by {pnl.casesSold} billed cases)</strong>.</p>
        </InfoTip>
      ) : (
        <InfoTip title="Cash Billed Mode (GST inclusive)" text="About GST-inclusive figures">
          <p>Total Invoiced Revenue is <strong>₹{money(pnl.billedSalesNet)}</strong> (inclusive of ₹{money(pnl.totalOutputGstNet)} Output GST). Note that Output GST collected is owed to the government (minus input tax credit on purchases) and does not represent retainable business profit.</p>
        </InfoTip>
      )}

      {/* Executive KPI Strip — business language: You spent / You got / Profit */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* You got (Revenue) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs">
          <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>You got</span>
            <IndianRupee className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div className="text-[11px] font-semibold text-sky-700 mt-0.5">
            {viewBasis === 'exGst' ? 'Taxable sales (Ex-GST)' : 'Net billed sales'}
          </div>
          <div className="text-xl sm:text-2xl font-black text-sky-950 tracking-tight mt-1 font-mono tabular-nums">
            ₹{money(pnl.activeNetSales)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between">
            <span>GST: ₹{money(pnl.totalOutputGstNet)}</span>
            <span>Avg Sell: ₹{money(pnl.avgSellPerCase)} / cs</span>
          </div>
        </div>

        {/* You spent (COGS) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs">
          <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>You spent</span>
            <Wallet className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-[11px] font-semibold text-amber-700 mt-0.5">
            Cost of goods (COGS)
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-950 tracking-tight mt-1 font-mono tabular-nums">
            ₹{money(pnl.cogs)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between">
            <span>Avg Cost: ₹{money(pnl.avgCostPerCase)} / cs</span>
            <span>{pnl.totalDispatchedCases} cs ({pnl.freeCases} free)</span>
          </div>
        </div>

        {/* Profit */}
        <div
          className={`rounded-2xl border p-3.5 sm:p-4 shadow-xs ${
            pnl.activeGrossProfit >= 0
              ? 'bg-gradient-to-br from-emerald-600 to-teal-700 border-emerald-700 text-white'
              : 'bg-gradient-to-br from-rose-600 to-rose-800 border-rose-700 text-white'
          }`}
        >
          <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-100 flex items-center justify-between">
            <span>Profit</span>
            {pnl.activeGrossProfit >= 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="text-[11px] font-semibold text-emerald-100/90 mt-0.5">
            {viewBasis === 'exGst' ? 'Operating profit' : 'Gross margin'}
          </div>
          <div className="text-xl sm:text-2xl font-black tracking-tight mt-1 font-mono tabular-nums">
            ₹{money(pnl.activeGrossProfit)}
          </div>
          <div className="text-[11px] text-emerald-100/90 mt-1.5 pt-1.5 border-t border-white/20 flex items-center justify-between">
            <span>₹{money(pnl.avgProfitPerCase)} / cs profit</span>
            <span>{pnl.activeMarginPct.toFixed(1)}% margin</span>
          </div>
        </div>

        {/* Gross Margin % */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs">
          <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Operating Margin %</span>
            <Percent className="w-3.5 h-3.5 text-teal-600" />
          </div>
          <div
            className={`text-xl sm:text-2xl font-black tracking-tight mt-1 font-mono tabular-nums ${marginColor(
              pnl.activeMarginPct
            )}`}
          >
            {pnl.activeMarginPct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between">
            <span>{pnl.invoiceCount} invoices</span>
            <span className="text-emerald-700 font-semibold">
              {pnl.collected > 0
                ? `${((pnl.collected / (pnl.billedSalesNet || 1)) * 100).toFixed(0)}% Paid`
                : '0%'}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-tabs bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                subTab === t.id
                  ? 'bg-[#0b2540] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {(subTab === 'products' || subTab === 'customers' || subTab === 'batches') && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 sm:flex-none min-w-[140px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  subTab === 'products'
                    ? 'Search SKU…'
                    : subTab === 'batches'
                      ? 'Search batch / product / supplier…'
                      : 'Search customer…'
                }
                className="w-full sm:w-52 pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-white cursor-pointer"
            >
              <option value="profit">Sort: Operating Profit</option>
              <option value="margin">Sort: Margin %</option>
              <option value="sales">Sort: Sales</option>
              <option value="cases">Sort: Cases</option>
            </select>
          </div>
        )}
      </div>

      {/* ===== 1. P&L WATERFALL & GST FLOW ===== */}
      {subTab === 'pnl' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Comprehensive P&amp;L Waterfall
                </span>
              </div>
              <span className="text-[11px] font-bold text-slate-500">
                Basis: {viewBasis === 'exGst' ? 'Ex-GST Operating' : 'Incl-GST Billed'}
              </span>
            </div>
            <div className="p-4 space-y-3">
              {[
                {
                  label: 'Gross Sales (Catalog Rate × Qty)',
                  value: pnl.grossSales,
                  tone: 'neutral' as const,
                  hint: 'Sum of line-item gross invoiced value',
                },
                {
                  label: 'Less: Trade Schemes & Discounts',
                  value: -pnl.totalDiscounts,
                  tone: 'warn' as const,
                  hint: `Line discounts ₹${money(pnl.lineDiscounts)} + Bill discount ₹${money(pnl.billDiscounts)}`,
                },
                {
                  label: 'Net Billed Invoice Value (Customer Payable)',
                  value: pnl.billedSalesNet,
                  tone: 'sky' as const,
                  hint: 'Total invoice demand net of returns & credits',
                  bold: true,
                },
                {
                  label: 'Less: Output GST Collected (Payable to Govt)',
                  value: -pnl.totalOutputGstNet,
                  tone: 'warn' as const,
                  hint: 'CGST + SGST statutory tax liability collected on behalf of tax authorities',
                  bold: true,
                },
                {
                  label: '= Operating Turnover / Taxable Revenue (Ex-GST)',
                  value: pnl.taxableSalesNet,
                  tone: 'sky' as const,
                  hint: 'Actual commercial revenue belonging to the business',
                  bold: true,
                },
                {
                  label: 'Less: Cost of Goods Sold (COGS at Inward Cost)',
                  value: -pnl.cogs,
                  tone: 'warn' as const,
                  hint: `Purchase rate × ${pnl.totalDispatchedCases} crates delivered (${pnl.casesSold} billed + ${pnl.freeCases} free schemes)`,
                },
                {
                  label: '= Gross Profit on Sales (before stock losses)',
                  value: pnl.grossProfitBeforeLosses,
                  tone: pnl.grossProfitBeforeLosses >= 0 ? ('good' as const) : ('bad' as const),
                  hint: 'Taxable revenue minus cost of the cases delivered',
                  bold: true,
                },
                {
                  label: 'Less: Stock Written Off / Returned / Given Free (net of supplier credit)',
                  value: -pnl.writeOffNet,
                  tone: 'warn' as const,
                  hint: `Cost ₹${money(pnl.writeOffLoss)} less supplier compensation ₹${money(pnl.writeOffRecovered)} (Dispositions screen)`,
                },
                ...(pnl.supplierCredits > 0
                  ? [
                      {
                        label: 'Add: Supplier scheme credits received',
                        value: pnl.supplierCredits,
                        tone: 'good' as const,
                        hint: 'Incentive / scheme credit notes actually received in the period',
                      },
                    ]
                  : []),
                {
                  label: '= True Operating Gross Profit / (Loss)',
                  value: pnl.operatingGrossProfit,
                  tone: pnl.operatingGrossProfit >= 0 ? ('good' as const) : ('bad' as const),
                  hint: `${pnl.operatingMarginPct.toFixed(1)}% operating gross margin on taxable revenue`,
                  bold: true,
                },
              ].map((row) => {
                const abs = Math.abs(row.value);
                const maxBase = Math.max(pnl.grossSales, pnl.billedSalesNet, pnl.taxableSalesNet, pnl.cogs, 1);
                const width = Math.min(100, (abs / maxBase) * 100);
                const barColor =
                  row.tone === 'good'
                    ? 'bg-emerald-500'
                    : row.tone === 'bad'
                      ? 'bg-rose-500'
                      : row.tone === 'sky'
                        ? 'bg-sky-500'
                        : row.tone === 'warn'
                          ? 'bg-amber-400'
                          : 'bg-slate-400';
                return (
                  <div key={row.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`font-semibold text-slate-700 ${row.bold ? 'font-black' : ''}`}>
                        {row.label}
                      </span>
                      <span
                        className={`font-mono font-black tabular-nums ${
                          row.tone === 'good'
                            ? 'text-emerald-700'
                            : row.tone === 'bad'
                              ? 'text-rose-700'
                              : row.tone === 'sky'
                                ? 'text-sky-800'
                                : row.tone === 'warn'
                                  ? 'text-amber-800'
                                  : 'text-slate-900'
                        }`}
                      >
                        {row.value < 0 ? '−' : ''}₹{money(abs)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">{row.hint}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-3.5">
            {/* GST Tax Settlement Flow */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  GST Tax Position
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {periodLabel}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Output GST Collected (Sales)</span>
                  <span className="font-mono font-bold text-slate-900">₹{money(pnl.totalOutputGstNet)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Eligible ITC (Purchases/GRN)</span>
                  <span className="font-mono font-bold text-emerald-700">−₹{money(pnl.itc)}</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                  <span className="font-bold text-slate-800">Net GST Liability</span>
                  <span
                    className={`font-mono font-black ${
                      pnl.netGstPayable > 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    ₹{money(pnl.netGstPayable)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 pt-1 leading-relaxed">
                  Output GST collected from buyers minus Input Tax Credit on your supplier invoices.
                </p>
              </div>
            </div>

            {/* Unit Economics with Method 2 Average Selling Price */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Unit Economics (Per Case)
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                  Method 2 Active
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">
                    Avg Sell (Method 2)
                  </div>
                  <div className="text-sm font-black text-slate-900 font-mono mt-0.5">
                    ₹{money(pnl.avgSellPerCase)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {pnl.casesSold} billed cases
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Cost / cs</div>
                  <div className="text-sm font-black text-amber-900 font-mono mt-0.5">
                    ₹{money(pnl.avgCostPerCase)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Inward purchase cost
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5 col-span-2">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase flex items-center justify-between">
                    <span>Operating Profit / Billed Case</span>
                    <span className="font-mono">{pnl.activeMarginPct.toFixed(1)}%</span>
                  </div>
                  <div className="text-base font-black text-emerald-800 font-mono mt-0.5">
                    +₹{money(pnl.avgProfitPerCase)} / cs
                  </div>
                </div>
              </div>
            </div>

            {/* Cash Position */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-2">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                Collections &amp; Receivables
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 font-medium">Collected Cash</span>
                <span className="font-mono font-bold text-emerald-700">₹{money(pnl.collected)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 font-medium">Outstanding Dues</span>
                <span className="font-mono font-bold text-rose-700">₹{money(pnl.outstanding)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1.5 border-t border-slate-100">
                <span className="text-slate-600 font-medium">Free Scheme Crates Given</span>
                <span className="font-mono font-bold text-amber-700">+{pnl.freeCases} cs</span>
              </div>
            </div>
          </div>
        </div>
      )}

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

          <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left data-table min-w-[980px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
                            <span title="Pre-tax Inward Purchase Rate (Ex-GST)">
                              Ex-GST: ₹{money(r.exGstCostPerCase)}
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

      {/* ===== 2b. BATCH-WISE PROFIT ===== */}
      {subTab === 'batches' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500 px-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-700">
                {batchRows.length} Stock Batches
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="text-emerald-700 font-semibold">
                Profit by actual FEFO batch cost (or average cost if unallocated)
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Matches how stock left the godown
            </span>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left data-table min-w-[920px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5">Batch / Lot</th>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-2 py-2.5 text-right">Billed cs</th>
                  <th className="px-2 py-2.5 text-right">Free cs</th>
                  <th className="px-2 py-2.5 text-right">Cost / cs</th>
                  <th className="px-3 py-2.5 text-right">You got</th>
                  <th className="px-3 py-2.5 text-right">You spent</th>
                  <th className="px-3 py-2.5 text-right font-black text-emerald-800">Profit</th>
                  <th className="px-2 py-2.5 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batchRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-500 text-sm">
                      No batch-level sales for this period. Older invoices without FEFO allocation appear under &ldquo;Unallocated · Avg Cost&rdquo;.
                    </td>
                  </tr>
                ) : (
                  batchRows.map((r) => (
                    <tr key={r.batchKey} className="hover:bg-sky-50/50 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900 font-mono text-[11px]">
                          {r.batchNumber}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {r.supplierName !== '—' ? r.supplierName : 'No supplier'}
                          {r.inwardDate ? ` · In ${r.inwardDate.slice(0, 10)}` : ''}
                          {r.expiryDate ? ` · Exp ${r.expiryDate.slice(0, 10)}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-800">{r.productName}</div>
                        <div className="text-[10px] text-slate-500">{r.category}</div>
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono font-bold tabular-nums">
                        {Math.round(r.casesSold * 100) / 100}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-amber-700">
                        {r.freeCases > 0 ? `+${Math.round(r.freeCases * 100) / 100}` : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-700">
                        ₹{money(r.costPerCase)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-sky-900">
                        ₹{money(viewBasis === 'exGst' ? r.taxableSales : r.netSales)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-900">
                        ₹{money(r.cogs)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-black tabular-nums ${
                          r.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        ₹{money(r.grossProfit)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span
                          className={`inline-flex text-[10px] font-black px-2 py-0.5 rounded-md border ${marginBg(
                            r.marginPct
                          )}`}
                        >
                          {r.marginPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards — matches Payments & Customers pattern */}
          <div className="block md:hidden space-y-2.5">
            {batchRows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs px-4 py-10 text-center text-sm text-slate-500">
                No batch-level sales for this period.
              </div>
            ) : (
              batchRows.map((r) => (
                <div
                  key={r.batchKey}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] font-bold text-slate-900 truncate">
                        {r.batchNumber}
                      </div>
                      <div className="text-sm font-semibold text-slate-800 truncate">
                        {r.productName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {r.category}
                        {r.supplierName !== '—' ? ` · ${r.supplierName}` : ''}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 inline-flex text-[10px] font-black px-2 py-0.5 rounded-md border ${marginBg(
                        r.marginPct
                      )}`}
                    >
                      {r.marginPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-sky-50 border border-sky-100 p-2">
                      <div className="text-[10px] font-bold uppercase text-sky-600">You got</div>
                      <div className="text-xs font-black font-mono text-sky-900 mt-0.5">
                        ₹{money(viewBasis === 'exGst' ? r.taxableSales : r.netSales)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-2">
                      <div className="text-[10px] font-bold uppercase text-amber-700">You spent</div>
                      <div className="text-xs font-black font-mono text-amber-950 mt-0.5">
                        ₹{money(r.cogs)}
                      </div>
                    </div>
                    <div
                      className={`rounded-xl border p-2 ${
                        r.grossProfit >= 0
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-rose-50 border-rose-100'
                      }`}
                    >
                      <div
                        className={`text-[10px] font-bold uppercase ${
                          r.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        Profit
                      </div>
                      <div
                        className={`text-xs font-black font-mono mt-0.5 ${
                          r.grossProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        ₹{money(r.grossProfit)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                    <span>
                      {Math.round(r.casesSold * 100) / 100} billed
                      {r.freeCases > 0 ? ` + ${Math.round(r.freeCases * 100) / 100} free` : ''} cs
                    </span>
                    <span className="font-mono">Cost ₹{money(r.costPerCase)} / cs</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===== 3. CUSTOMER MARGINS TABLE ===== */}
      {subTab === 'customers' && (
        <div className="space-y-2">
          <div className="hidden md:block overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left data-table min-w-[760px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
          <div className="block md:hidden space-y-2.5">
            {customerRows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs px-4 py-10 text-center text-sm text-slate-500">
                No customer sales matching this period.
              </div>
            ) : (
              customerRows.map((r) => (
                <div
                  key={r.customerKey}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{r.customerName}</div>
                      <div className="text-[10px] text-slate-500">
                        {r.invoices} inv · {r.casesSold} cs
                        {r.outstanding > 0 ? ` · Due ₹${money(r.outstanding)}` : ''}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 inline-flex text-[10px] font-black px-2 py-0.5 rounded-md border ${marginBg(
                        r.marginPct
                      )}`}
                    >
                      {r.marginPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-sky-50 border border-sky-100 p-2">
                      <div className="text-[10px] font-bold uppercase text-sky-600">You got</div>
                      <div className="text-xs font-black font-mono text-sky-900 mt-0.5">
                        ₹{money(viewBasis === 'exGst' ? r.taxableSales : r.netSales)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-2">
                      <div className="text-[10px] font-bold uppercase text-amber-700">You spent</div>
                      <div className="text-xs font-black font-mono text-amber-950 mt-0.5">
                        ₹{money(r.cogs)}
                      </div>
                    </div>
                    <div
                      className={`rounded-xl border p-2 ${
                        r.grossProfit >= 0
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-rose-50 border-rose-100'
                      }`}
                    >
                      <div
                        className={`text-[10px] font-bold uppercase ${
                          r.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        Profit
                      </div>
                      <div
                        className={`text-xs font-black font-mono mt-0.5 ${
                          r.grossProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        ₹{money(r.grossProfit)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===== 4. DAY-WISE P&L TABLE ===== */}
      {subTab === 'days' && (
        <div className="space-y-2">
          <div className="hidden md:block overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left data-table min-w-[650px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
          <div className="block md:hidden space-y-2.5">
            {dayRows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs px-4 py-10 text-center text-sm text-slate-500">
                No sales days recorded in this period.
              </div>
            ) : (
              dayRows.map((r) => (
                <div
                  key={r.date}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono font-bold text-slate-800">{r.date}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{r.invoices} inv</span>
                      <span
                        className={`inline-flex text-[10px] font-black px-2 py-0.5 rounded-md border ${marginBg(
                          r.marginPct
                        )}`}
                      >
                        {r.marginPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-sky-50 border border-sky-100 p-2">
                      <div className="text-[10px] font-bold uppercase text-sky-600">You got</div>
                      <div className="text-xs font-black font-mono text-sky-900 mt-0.5">
                        ₹{money(viewBasis === 'exGst' ? r.taxableSales : r.netSales)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-2">
                      <div className="text-[10px] font-bold uppercase text-amber-700">You spent</div>
                      <div className="text-xs font-black font-mono text-amber-950 mt-0.5">
                        ₹{money(r.cogs)}
                      </div>
                    </div>
                    <div
                      className={`rounded-xl border p-2 ${
                        r.grossProfit >= 0
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-rose-50 border-rose-100'
                      }`}
                    >
                      <div
                        className={`text-[10px] font-bold uppercase ${
                          r.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        Profit
                      </div>
                      <div
                        className={`text-xs font-black font-mono mt-0.5 ${
                          r.grossProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        ₹{money(r.grossProfit)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

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
    </div>
  );
};
