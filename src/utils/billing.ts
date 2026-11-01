import {
  BalanceStatus,
  Bill,
  BillItem,
  BillingSettings,
  BillTotals,
  CategoryKey,
  GrnSchemeMode,
  GrnSchemeType,
  GstMode,
  OrganizationProfile,
  PriceType,
  Product,
  Promotion,
  Trip,
  TripStatus,
} from '../types';
import { CATS } from '../constants/initialData';
import { todayISO } from "./dateLocal";

export const money = (n: number): string =>
  (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Helper to format a date input into DDMMYY (e.g. 16-Oct-2026 -> "161026").
 * Supports ISO strings (YYYY-MM-DD), Indian formats (DD-MM-YYYY, DD/MM/YYYY), and Date objects.
 */
export function formatDdMmYy(dateInput?: string | Date | null): string {
  if (!dateInput) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    return `${dd}${mm}${yy}`;
  }

  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    const dd = String(dateInput.getDate()).padStart(2, '0');
    const mm = String(dateInput.getMonth() + 1).padStart(2, '0');
    const yy = String(dateInput.getFullYear()).slice(-2);
    return `${dd}${mm}${yy}`;
  }

  const s = String(dateInput).trim();
  // Check for ISO format YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const yy = isoMatch[1].slice(-2);
    const mm = isoMatch[2].padStart(2, '0');
    const dd = isoMatch[3].padStart(2, '0');
    return `${dd}${mm}${yy}`;
  }

  // Check for DD-MM-YYYY or DD/MM/YYYY or DD-MM-YY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, '0');
    const mm = dmyMatch[2].padStart(2, '0');
    const yy = dmyMatch[3].length === 4 ? dmyMatch[3].slice(-2) : dmyMatch[3].padStart(2, '0');
    return `${dd}${mm}${yy}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yy = String(parsed.getFullYear()).slice(-2);
    return `${dd}${mm}${yy}`;
  }

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

/**
 * Generates an industry-standard unique Batch/Tag/Lot number for product inwards.
 * Guaranteed to be fresh and unique, never reusing old batch numbers from catalog/stock.
 * Uses DDMMYY (e.g. 161026 for 16-Oct-2026) based on invoiceDate so batches align with supplier invoices.
 */
export function generateBatchNumber(
  productName?: string,
  schemeCode?: string,
  existingBatches?: string[],
  sequenceIndex?: number,
  invoiceDate?: string | Date | null
): string {
  const datePart = formatDdMmYy(invoiceDate);

  const cleanName = (productName || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase() || 'LOT';

  const seqPart = sequenceIndex !== undefined ? String(sequenceIndex + 1).padStart(2, '0') : '';

  let attempts = 0;
  let batch = '';
  do {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    if (schemeCode) {
      const cleanScheme = schemeCode.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
      batch = `LOT-${cleanScheme}-${cleanName}-${datePart}-${seqPart ? seqPart + '-' : ''}${rand}`;
    } else {
      batch = `LOT-${cleanName}-${datePart}-${seqPart ? seqPart + '-' : ''}${rand}`;
    }
    attempts++;
  } while (existingBatches && existingBatches.includes(batch) && attempts < 20);

  return batch;
}

/**
 * Automatically generates a standardized SKU ID for beverages and water bottles.
 * e.g. SKU-WTR-500ML-101, SKU-CMP-150ML-102
 */
export function generateSkuId(productName?: string, category?: string, idHint?: number): string {
  const clean = (productName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let prefix = 'BEV';
  if (clean.includes('WATER') || category === 'water' || clean.includes('AQUA') || clean.includes('KINLEY') || clean.includes('BISLERI')) {
    prefix = 'WTR';
  } else if (clean.includes('CAMPA') || clean.includes('POWER') || clean.includes('BOOST')) {
    prefix = 'CMP';
  } else if (clean.includes('SOSYO') || clean.includes('JOOS') || clean.includes('RUNNER')) {
    prefix = 'SSY';
  } else if (clean.includes('VIBE') || clean.includes('COLA')) {
    prefix = 'VIB';
  } else if (clean.length >= 3) {
    prefix = clean.slice(0, 3);
  }

  // Extract volume if present e.g. 150ML, 500ML, 1L, 20L
  const volMatch = (productName || '').match(/(\d+)\s*(ML|L|LTR|LITRE)/i);
  const volTag = volMatch ? `-${volMatch[1]}${volMatch[2].toUpperCase()}` : '';

  const num = idHint ? String(idHint).padStart(3, '0') : Math.floor(100 + Math.random() * 900);
  return `SKU-${prefix}${volTag}-${num}`;
}

/**
 * Generates exact Auto SKU adhering to specification:
 * Category code + Name initials + 3-digit running number
 * e.g. "CAMPA MANGO BLAST" in Energy -> "ENR-CMB-015"
 */
export function generateAutoSku(
  productName: string,
  category: CategoryKey,
  runningNumber: number
): string {
  const catCodeMap: Record<CategoryKey, string> = {
    energy: 'ENR',
    vibe: 'VIB',
    joos: 'JOS',
    water: 'WTR',
    general: 'GEN',
  };
  const catCode = catCodeMap[category] || 'GEN';

  // Words ignoring volume/packaging tokens (e.g. 150ML, 500ML, PET, CAN)
  const cleanWords = (productName || '')
    .toUpperCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => {
      if (!w) return false;
      if (/^\d+(ML|L|LTR|KG)?$/i.test(w)) return false;
      if (['PET', 'CAN', 'GLASS', 'BOTTLE', 'BOTTLES', 'CRATE', 'CRATES', 'TIN'].includes(w)) return false;
      return true;
    });

  let initials = cleanWords.map((w) => w[0]).join('');
  if (!initials) {
    initials = (productName || 'PRODUCT')
      .replace(/[^a-zA-Z]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'PRD';
  } else if (initials.length > 4) {
    initials = initials.slice(0, 4);
  }

  const numStr = String(runningNumber).padStart(3, '0');
  return `${catCode}-${initials}-${numStr}`;
}

export interface LandedCostBreakdown {
  // Packaging & quantities
  unitsPerCrate: number;
  packSize: string;
  qty: number; // Invoiced billed crates (e.g. 150)
  paidQty: number; // Charged/paid crates (e.g. 100 out of 150 in inclusive mode)
  freeQty: number; // Free crates (e.g. 50 out of 150 in inclusive mode)
  totalReceivedQty: number; // Total physical crates inwarded into godown
  schemeMode: GrnSchemeMode; // 'inclusive' (default FMCG) vs 'additive'

  // Invoice rates (Audit unchanged, ex-GST & incl-GST)
  invoiceRateExGst: number; // rate ex-GST per crate (unitPrice)
  gstPercent: number; // total GST % (cgst + sgst)
  cgstPercent: number;
  sgstPercent: number;
  gstAmountPerCrate: number; // GST ₹ per crate
  invoiceRateInclGst: number; // rate per crate including GST
  invoiceUnitRateBottleExGst: number; // ex-GST rate per individual bottle/unit
  invoiceUnitRateBottleInclGst: number; // rate per bottle/unit including GST

  // Scheme
  schemeType: GrnSchemeType;
  schemeBuyQty: number;
  schemeFreeQty: number;
  discountPercent: number;
  discountFlat: number;
  discountAmount: number;
  schemeLabel: string;

  // Invoice paid / tax totals for line
  taxableAmount: number; // paid base amount
  cgstAmount: number;
  sgstAmount: number;
  taxAmount: number;
  lineTotal: number; // paid total amount incl. GST

  // Effective Scheme-Adjusted Purchase Cost (Pre-inward godown costs)
  effectiveCostPerCrateExGst: number; // taxableAmount / totalReceivedQty
  effectiveCostPerCrateInclGst: number; // lineTotal / totalReceivedQty
  effectiveUnitRateExGst: number; // effectiveCostPerCrateExGst / unitsPerCrate
  effectiveUnitRateInclGst: number; // effectiveCostPerCrateInclGst / unitsPerCrate

  // Inward godown cost allocation
  inwardCostPerCrate: number;

  // Final Landed Cost (including all costs into godown)
  landedCostPerCrate: number; // effectiveCostPerCrateInclGst + inwardCostPerCrate (incl-GST)
  landedCostPerCrateExGst: number; // effectiveCostPerCrateExGst + inwardCostPerCrate (ex-GST)
  landedCostPerUnit: number; // landedCostPerCrate / unitsPerCrate (bottle incl-GST)
  landedCostPerUnitExGst: number; // landedCostPerCrateExGst / unitsPerCrate (bottle ex-GST)
}

export function calculateLandedCostBreakdown(params: {
  qty: number;
  unitPrice: number; // Invoice Unit Rate (ex-GST)
  unitsPerCrate?: number;
  pack?: string;
  volume?: number;
  packSize?: string;
  cgstPercent: number;
  sgstPercent: number;
  schemeType: GrnSchemeType;
  schemeMode?: GrnSchemeMode;
  schemeBuyQty?: number;
  schemeFreeQty?: number;
  freeQty?: number;
  paidQty?: number;
  discountPercent?: number;
  discountFlat?: number;
  discountAmount?: number;
  inwardCostPerCrate?: number;
}): LandedCostBreakdown {
  const qty = Math.max(0, Number(params.qty) || 0);
  const unitPrice = Math.max(0, Number(params.unitPrice) || 0);
  const unitsPerCrate = Math.max(1, Number(params.unitsPerCrate) || 24);

  const cgstPercent = Math.max(0, Number(params.cgstPercent) || 0);
  const sgstPercent = Math.max(0, Number(params.sgstPercent) || 0);
  const gstPercent = cgstPercent + sgstPercent;

  // Base invoice rates
  const gstAmountPerCrate = (unitPrice * gstPercent) / 100;
  const invoiceRateExGst = unitPrice;
  const invoiceRateInclGst = unitPrice + gstAmountPerCrate;
  const invoiceUnitRateBottleExGst = unitsPerCrate > 0 ? invoiceRateExGst / unitsPerCrate : 0;
  const invoiceUnitRateBottleInclGst = unitsPerCrate > 0 ? invoiceRateInclGst / unitsPerCrate : 0;

  // Pack size description
  const packSize =
    params.packSize ||
    (params.pack && params.volume
      ? `${unitsPerCrate}x ${params.volume}ml ${params.pack}`
      : `${unitsPerCrate} units/case`);

  // Scheme calculations
  const schemeType = params.schemeType || 'none';
  // In FMCG beverage distribution, the printed invoice case count is typically inclusive of
  // free scheme items (e.g. 100 cases on invoice = 80 paid + 20 free).
  // Default mode is 'inclusive' (total physical received = billed quantity).
  // If 'additive' mode is selected, free crates are bonus crates on top (total = billed + free).
  const schemeMode: GrnSchemeMode = params.schemeMode || 'inclusive';
  const schemeBuyQty = Math.max(1, Number(params.schemeBuyQty) || 2);
  const schemeFreeQty = Math.max(1, Number(params.schemeFreeQty) || 1);
  const discountPercent = Math.max(0, Number(params.discountPercent) || 0);
  const discountFlat = Math.max(0, Number(params.discountFlat) || 0);

  let freeQty = 0;
  let paidQty = qty;
  let totalReceivedQty = qty;
  let discountAmount = 0;
  let schemeLabel = 'Standard (No Scheme)';

  const baseGross = qty * unitPrice;

  if (schemeType === 'b2g1') {
    // Buy X Get Y Free:
    // If 'inclusive' (Standard): Free items are included within the billed count.
    // e.g. Buy 2 Get 1 on 150 units -> group = 2 + 1 = 3 -> 50 free units, 100 paid units. Total received = 150.
    // If 'additive': Free items are added on top of billed quantity.
    // e.g. Buy 2 Get 1 on 150 units -> 150 / 2 = 75 free units. Total received = 150 + 75 = 225.
    if (params.freeQty !== undefined && params.freeQty !== null && Number(params.freeQty) >= 0) {
      freeQty = Math.max(0, Number(params.freeQty));
    } else {
      const cycle = schemeMode === 'inclusive' ? schemeBuyQty + schemeFreeQty : schemeBuyQty;
      freeQty = cycle > 0 ? Math.floor(qty / cycle) * schemeFreeQty : 0;
    }

    if (schemeMode === 'inclusive') {
      paidQty = Math.max(0, qty - freeQty);
      totalReceivedQty = qty; // Free items are inside billed quantity
    } else {
      paidQty = qty;
      totalReceivedQty = qty + freeQty; // Bonus on top
    }

    discountAmount =
      params.discountAmount !== undefined && params.discountAmount !== null && Number(params.discountAmount) >= 0
        ? Math.max(0, Number(params.discountAmount))
        : freeQty * unitPrice;
    schemeLabel =
      schemeMode === 'inclusive'
        ? `Buy ${schemeBuyQty} Get ${schemeFreeQty} Free (${freeQty} Free of ${qty} cs · ${paidQty} Paid · Incl.)`
        : `Buy ${schemeBuyQty} Get ${schemeFreeQty} Free (${freeQty} Free included in ${qty} cs)`;
  } else if (schemeType === 'free_cases') {
    freeQty = Math.max(0, Number(params.freeQty) || 0);
    paidQty = Math.max(0, qty - freeQty);
    totalReceivedQty = qty;
    schemeLabel = `${freeQty} Free Crates included in ${qty} cs (${paidQty} Paid · Scheme Discount)`;
    discountAmount =
      params.discountAmount !== undefined && params.discountAmount !== null
        ? Math.max(0, Number(params.discountAmount))
        : freeQty * unitPrice;
  } else if (schemeType === 'discount_percent') {
    freeQty = 0;
    paidQty = qty;
    totalReceivedQty = qty;
    discountAmount = (baseGross * discountPercent) / 100;
    schemeLabel = `${discountPercent}% Scheme Discount`;
  } else if (schemeType === 'discount_flat') {
    freeQty = 0;
    paidQty = qty;
    totalReceivedQty = qty;
    discountAmount = qty * discountFlat;
    schemeLabel = `₹${discountFlat}/cr Flat Scheme`;
  } else {
    freeQty = 0;
    paidQty = qty;
    totalReceivedQty = qty;
    discountAmount = 0;
    schemeLabel = 'None (Standard)';
  }

  discountAmount = Math.min(discountAmount, baseGross);

  // Invoice line totals (for supplier invoice audit)
  //
  // Supplier-invoice method (confirmed on real invoices 40/26-27 and 49/26-27): free scheme cases are listed in
  // the case count and invoiced at the full rate WITH GST. Their value (GST-inclusive) is then deducted from the
  // invoice total as a discount. Result:
  //   - the amount PAYABLE is only for the paid cases (paid cases x rate incl. GST),
  //   - GST is charged on the FULL value of paid + free cases (this is the tax on the invoice, claimable as ITC),
  //   - the TAXABLE VALUE shown is payable minus that GST (the discount lowers taxable value, not the tax).
  // Any other discount (percent / flat / extra trade discount) is before tax and lowers the tax as well.
  // This follows the same "GST on free cases" switch as sales (Settings > Billing); switch it off to charge
  // tax only on the net value.
  const isFreeGoodsScheme = schemeType === 'b2g1' || schemeType === 'free_cases';
  const freeGoodsValue = Math.min(freeQty * unitPrice, discountAmount);
  const otherDiscount = Math.max(0, discountAmount - freeGoodsValue);
  const netExGst = Math.max(0, baseGross - discountAmount);
  let taxableAmount: number;
  let cgstAmount: number;
  let sgstAmount: number;
  let lineTotal: number;
  if (isFreeGoodsScheme && getGstOnFreeCases()) {
    const taxBase = Math.max(0, baseGross - otherDiscount);
    cgstAmount = (taxBase * cgstPercent) / 100;
    sgstAmount = (taxBase * sgstPercent) / 100;
    lineTotal = netExGst * (1 + gstPercent / 100); // payable: paid cases only, GST-inclusive
    taxableAmount = Math.max(0, lineTotal - (cgstAmount + sgstAmount));
  } else {
    taxableAmount = netExGst;
    cgstAmount = (taxableAmount * cgstPercent) / 100;
    sgstAmount = (taxableAmount * sgstPercent) / 100;
    lineTotal = taxableAmount + cgstAmount + sgstAmount;
  }
  const taxAmount = cgstAmount + sgstAmount;

  // Effective Scheme-Adjusted Purchase Cost (pre-inward godown expenses)
  // Stock cost uses the net ex-GST value actually paid for (paid cases only), whatever the GST rule is: it must not
  // swing with how the supplier splits taxable value and tax. The extra input tax credit that comes from GST on free
  // cases is a GST-report item, not a cost reduction (conservative: profit is not inflated by it).
  const effectiveCostPerCrateExGst =
    totalReceivedQty > 0 ? netExGst / totalReceivedQty : invoiceRateExGst;
  const effectiveCostPerCrateInclGst =
    totalReceivedQty > 0 ? lineTotal / totalReceivedQty : invoiceRateInclGst;
  const effectiveUnitRateExGst = unitsPerCrate > 0 ? effectiveCostPerCrateExGst / unitsPerCrate : 0;
  const effectiveUnitRateInclGst = unitsPerCrate > 0 ? effectiveCostPerCrateInclGst / unitsPerCrate : 0;

  // Inward Godown Cost Allocation
  const inwardCostPerCrate = Math.max(0, Number(params.inwardCostPerCrate) || 0);

  // Final Landed Cost = Effective Scheme-adjusted Purchase Cost + Inward Cost
  const landedCostPerCrate = effectiveCostPerCrateInclGst + inwardCostPerCrate;
  const landedCostPerCrateExGst = effectiveCostPerCrateExGst + inwardCostPerCrate;
  const landedCostPerUnit = unitsPerCrate > 0 ? landedCostPerCrate / unitsPerCrate : 0;
  const landedCostPerUnitExGst = unitsPerCrate > 0 ? landedCostPerCrateExGst / unitsPerCrate : 0;

  return {
    unitsPerCrate,
    packSize,
    qty,
    paidQty,
    freeQty,
    totalReceivedQty,
    schemeMode,
    invoiceRateExGst,
    gstPercent,
    cgstPercent,
    sgstPercent,
    gstAmountPerCrate,
    invoiceRateInclGst,
    invoiceUnitRateBottleExGst,
    invoiceUnitRateBottleInclGst,
    schemeType,
    schemeBuyQty,
    schemeFreeQty,
    discountPercent,
    discountFlat,
    discountAmount,
    schemeLabel,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    taxAmount,
    lineTotal,
    effectiveCostPerCrateExGst,
    effectiveCostPerCrateInclGst,
    effectiveUnitRateExGst,
    effectiveUnitRateInclGst,
    inwardCostPerCrate,
    landedCostPerCrate,
    landedCostPerCrateExGst,
    landedCostPerUnit,
    landedCostPerUnitExGst,
  };
}

export interface GrnLineMetrics {
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  taxAmount: number;
  lineTotal: number;
  paidQty: number;
  freeQty: number;
  totalReceivedQty: number;
  landedCostPerUnit: number; // Post-tax landed price per received unit
  effectiveCostPerUnit: number; // Pre-tax landed cost per received unit
}

export function calculateGrnLineMetrics(params: {
  qty: number;
  unitPrice: number;
  schemeType: GrnSchemeType;
  schemeMode?: GrnSchemeMode;
  schemeBuyQty?: number;
  schemeFreeQty?: number;
  freeQty?: number;
  paidQty?: number;
  discountPercent?: number;
  discountFlat?: number;
  discountAmount?: number;
  cgstPercent: number;
  sgstPercent: number;
  inwardCostPerCrate?: number;
}): GrnLineMetrics {
  const breakdown = calculateLandedCostBreakdown({
    qty: params.qty,
    unitPrice: params.unitPrice,
    schemeType: params.schemeType,
    schemeMode: params.schemeMode,
    schemeBuyQty: params.schemeBuyQty,
    schemeFreeQty: params.schemeFreeQty,
    freeQty: params.freeQty,
    discountPercent: params.discountPercent,
    discountFlat: params.discountFlat,
    discountAmount: params.discountAmount,
    cgstPercent: params.cgstPercent,
    sgstPercent: params.sgstPercent,
    inwardCostPerCrate: params.inwardCostPerCrate,
  });

  return {
    discountAmount: breakdown.discountAmount,
    taxableAmount: breakdown.taxableAmount,
    cgstAmount: breakdown.cgstAmount,
    sgstAmount: breakdown.sgstAmount,
    taxAmount: breakdown.taxAmount,
    lineTotal: breakdown.lineTotal,
    paidQty: breakdown.paidQty,
    freeQty: breakdown.freeQty,
    totalReceivedQty: breakdown.totalReceivedQty,
    landedCostPerUnit: breakdown.landedCostPerCrate, // crate-level landed cost
    effectiveCostPerUnit: breakdown.effectiveCostPerCrateExGst, // pre-tax landed cost
  };
}

/**
 * Resolves the genuine pre-tax purchase cost per CRATE / CASE.
 * Safeguards against single-bottle / unit rates (e.g. rate / unitsPerCrate) being mistakenly treated as crate costs.
 */
export function resolveItemCrateCost(item: any): number {
  if (!item) return 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const unitsPerCrate = Number(item.unitsPerCrate) || 1;

  // 1. Explicit crate-level landed or scheme-adjusted fields
  const crateLandedEx = Number(item.landedCostPerCrateExGst);
  if (Number.isFinite(crateLandedEx) && crateLandedEx > 0) return crateLandedEx;

  const crateEffEx = Number(item.effectiveCostPerCrateExGst);
  if (Number.isFinite(crateEffEx) && crateEffEx > 0) return crateEffEx;

  // 2. Check effectiveCostPerUnit — if it was erroneously divided by unitsPerCrate (bottle rate)
  const effUnit = Number(item.effectiveCostPerUnit);
  if (Number.isFinite(effUnit) && effUnit > 0) {
    if (unitPrice > 0 && effUnit < unitPrice * 0.35 && unitsPerCrate > 1) {
      return Math.round(effUnit * unitsPerCrate * 100) / 100;
    }
    if (effUnit >= 25 || unitPrice <= 0) return effUnit;
    if (unitsPerCrate > 1) return Math.round(effUnit * unitsPerCrate * 100) / 100;
  }

  // 3. Explicit post-tax crate landed rate if no ex-tax available
  const crateLanded = Number(item.landedCostPerCrate);
  const gstRate = ((Number(item.cgstPercent) || 0) + (Number(item.sgstPercent) || 0)) / 100;
  if (Number.isFinite(crateLanded) && crateLanded > 0) {
    return gstRate > 0 ? Math.round((crateLanded / (1 + gstRate)) * 100) / 100 : crateLanded;
  }

  const crateEffIncl = Number(item.effectiveCostPerCrateInclGst);
  if (Number.isFinite(crateEffIncl) && crateEffIncl > 0) {
    return gstRate > 0 ? Math.round((crateEffIncl / (1 + gstRate)) * 100) / 100 : crateEffIncl;
  }

  // 4. Default to invoice line unitPrice (which is always per-crate on distributor inward invoices)
  return unitPrice;
}

/**
 * Resolves the genuine inclusive-of-GST landed cost per CRATE / CASE.
 */
export function resolveItemLandedCrateCost(item: any): number {
  if (!item) return 0;
  const crateLanded = Number(item.landedCostPerCrate);
  if (Number.isFinite(crateLanded) && crateLanded > 0) return crateLanded;

  const crateEffIncl = Number(item.effectiveCostPerCrateInclGst);
  if (Number.isFinite(crateEffIncl) && crateEffIncl > 0) return crateEffIncl;

  const crateCostExGst = resolveItemCrateCost(item);
  const hasSplit = item.cgstPercent !== undefined && item.cgstPercent !== null && item.sgstPercent !== undefined && item.sgstPercent !== null;
  // a purchase line saved with 0% + 0% really is 0% GST; only a line with no tax split falls back to 18%
  const gstRate = hasSplit ? ((Number(item.cgstPercent) || 0) + (Number(item.sgstPercent) || 0)) / 100 : 0.18;
  const inwardAddon = Math.max(0, Number(item.inwardCostPerCrate) || 0);
  return Math.round((crateCostExGst * (1 + gstRate) + inwardAddon) * 100) / 100;
}

export interface GstBreakdown {
  hsn: string;
  taxable: number;
  cgstRate: number; // in %
  cgstAmt: number;  // in ₹
  sgstRate: number; // in %
  sgstAmt: number;  // in ₹
  totalTax: number; // in ₹
  gstRate: number;  // in %
}

/**
 * GST may be stored as a fraction (0.18) or a whole percent (18).
 * Always normalise to a fraction for arithmetic.
 */
export function normalizeGstFraction(gst: number | undefined | null): number {
  const n = Number(gst);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? n / 100 : n;
}

/**
 * Statutory GST fraction (0-1) by HSN for beverage distribution (post Sep-2025 slabs).
 * 2202 10 xx (aerated / sweetened / flavoured, energy drinks) -> 40%.
 * 2202 99 20 (fruit pulp / fruit juice based drinks)         -> 5%.
 * Packaged water (2201) and other 220299 beverages            -> 18%.
 * Works with 4, 6 or 8 digit codes. Returns null for HSNs this table does not know.
 */
export function gstRateFromHsn(hsn?: string | null): number | null {
  if (!hsn) return null;
  const h = String(hsn).replace(/\D+/g, '');
  if (!h) return null;
  if (h.startsWith('220210')) return 0.4;
  if (h.startsWith('22029920')) return 0.05;
  if (h.startsWith('220299')) return 0.18;
  if (h.startsWith('2201')) return 0.18;
  if (h.startsWith('2202')) return 0.4;
  return null;
}

/**
 * Full 8-digit HSN for a beverage, from what we know about it.
 *  - 22021010  aerated / carbonated soft drinks (cola, lemon, soda ...)
 *  - 22021090  other sweetened / flavoured / energy drinks
 *  - 22029920  fruit-juice / pulp based drinks (juice, mango, mix-fruit ...)
 *  - 22019010  packaged drinking water
 *  - 22029990  other non-alcoholic beverages
 */
export function inferHsn8(category?: string | null, name?: string | null, hsn4or6?: string | null): string {
  const digits = String(hsn4or6 || '').replace(/\D+/g, '');
  const n = String(name || '').toLowerCase();
  const cat = String(category || '').toLowerCase();
  if (digits.startsWith('2201')) return '22019010';
  if (digits.startsWith('220299')) return digits.startsWith('22029920') ? '22029920' : '22029990';
  if (digits.startsWith('220210')) {
    if (/cola|lemon|soda|vibe|clear|orange|sprite|fanta|thums|limca|pepsi|coke|fizz|sparkl|aerated|carbonat/.test(n)) return '22021010';
    return '22021090';
  }
  // Nothing usable in the stored HSN: decide from the product itself.
  if (/water|aqua|bisleri|kinley|packaged drinking/.test(n) || cat === 'water') return '22019010';
  if (/juice|joos|mango|mix.?fruit|pulp|nectar|raskik|slice|maaza|frooti|guava|litchi|apple/.test(n) || cat === 'joos') return '22029920';
  if (/energy|runner|power\s*up|boost|red\s*bull|monster|campa/.test(n) || cat === 'energy') return '22021090';
  if (/cola|lemon|soda|vibe|clear|sprite|fanta|thums|limca|pepsi|coke|fizz|sparkl|aerated|carbonat/.test(n) || cat === 'vibe') return '22021010';
  const c = (cat && (CATS as any)[cat]?.hsn) as string | undefined;
  return c && c.length === 8 ? c : '22029990';
}

/**
 * Always returns an 8-digit HSN. A stored 8-digit code is kept as is; a 2-7 digit code (for example
 * "2202" from an old product or invoice) is expanded to the full 8-digit tariff code.
 */
export function normalizeTo8DigitHsn(
  hsn?: string | null,
  category?: string | null,
  name?: string | null,
): string {
  const digits = String(hsn ?? '').replace(/\D+/g, '');
  if (digits.length === 8) return digits;
  if (digits.length > 8) return digits.slice(0, 8);
  return inferHsn8(category, name, digits);
}

/**
 * THE one place that decides a product's GST rate (fraction 0-1). Every billing, purchase and
 * report screen must use this so they cannot disagree.
 * Order: statutory rate for the product's HSN (so a stale 0% / 18% saved on a beverage cannot
 * leak onto a bill) -> the product's own rate -> category -> 18%.
 */
export function resolveProductGstRate(
  p?: { gstRate?: number | null; hsn?: string | null; category?: string | null; name?: string | null } | null,
  categoryHint?: string | null,
): number {
  const fromHsn = gstRateFromHsn(p?.hsn);
  if (fromHsn != null) return fromHsn;
  const own = p?.gstRate;
  if (own !== undefined && own !== null && (own as unknown) !== '' && Number.isFinite(Number(own))) {
    return normalizeGstFraction(own);
  }
  const cat = (p?.category || categoryHint) as CategoryKey | undefined;
  if (cat && CATS[cat]) return normalizeGstFraction(CATS[cat].gst);
  return 0.18;
}

/** Standard Indian beverage volume sizes in milliliters */
export const STANDARD_VOLUMES = [2250, 2000, 1750, 1500, 1250, 1200, 1000, 750, 600, 500, 400, 330, 300, 250, 200, 185, 180, 160, 150];

/** Volume pattern with explicit unit: 250ml, 750 ml, 2.25L, 1.25 Ltr, 1.5 litre */
export const VOLUME_UNIT_RE = /(\d+(?:\.\d+)?)\s*(ml|milliliters?|millilitres?|ltrs?|litres?|liters?|lt|l)\b/i;

/** Multipack case pattern: 24x250, 12x750, 6x2.25l, 24*200, 30x150, 24/250 */
export const MULTIPACK_VOLUME_RE = /\b\d{1,2}\s*[*x×/]\s*(\d+(?:\.\d+)?)\s*(ml|ltrs?|litres?|liters?|lt|l)?\b/i;

/**
 * Volume in ml found in a product description or null.
 * Handles decimals (2.25L -> 2250), cases (24x250 -> 250), standard sizes (THUMS UP 750 -> 750).
 */
export function volumeFromName(name?: string | null): number | null {
  if (!name) return null;
  const str = name.trim();

  // 1. Explicit unit match (e.g. 2.25L, 250ml, 185ML, 750 ML, 1.25 Ltr)
  const unitMatch = str.match(VOLUME_UNIT_RE);
  if (unitMatch) {
    const val = parseFloat(unitMatch[1]);
    const unit = unitMatch[2].toLowerCase();
    if (unit.startsWith('l')) return Math.round(val * 1000);
    return Math.round(val);
  }

  // 2. Multipack notation (e.g. 24x250, 12x750, 6x2.25)
  const multiMatch = str.match(MULTIPACK_VOLUME_RE);
  if (multiMatch) {
    const val = parseFloat(multiMatch[1]);
    const unit = (multiMatch[2] || '').toLowerCase();
    if (unit.startsWith('l') || (val <= 5 && !unit)) return Math.round(val * 1000);
    return Math.round(val);
  }

  // 3. Standalone standard beverage volumes in text (e.g. "THUMS UP 750", "MAAZA 600", "LIMCA 300", "COKE 2000", "CAN 185")
  for (const vol of STANDARD_VOLUMES) {
    const re = new RegExp(`\\b${vol}\\b`, 'i');
    if (re.test(str)) {
      return vol;
    }
  }

  return null;
}

export function detectPack(name?: string | null): string {
  if (!name) return 'PET';
  const u = name.toUpperCase();
  if (u.includes('CAN') || u.includes('TIN')) return 'Can';
  if (u.includes('RGB') || u.includes('GLASS') || u.includes('RETURNABLE')) return 'Glass';
  if (u.includes('TETRA') || u.includes('TETRAPAK') || u.includes('POUCH') || u.includes('BRICK')) return 'Tetra';
  if (u.includes('PET') || u.includes('PLASTIC') || u.includes('BTL') || u.includes('BOTTLE')) return 'PET';
  return 'PET';
}

/**
 * Extract bottle pack and volume from beverage description
 */
export function detectPackAndVolume(name: string): { pack: string; volume: number } {
  const pack = detectPack(name);
  const detectedVol = volumeFromName(name);
  return {
    pack,
    volume: detectedVol || 250,
  };
}

/**
 * Formats product volume and pack cleanly without ever rendering "0ml".
 * If volume is 0 or missing, infers from product name.
 * e.g. "185ml Can", "150ml PET", "600ml PET", "1.25L PET", or "Can"
 */
export function formatProductVolPack(volume?: number | null, pack?: string | null, name?: string | null): string {
  const vol = (Number(volume) > 0 ? Number(volume) : (name ? volumeFromName(name) : null)) || 0;
  const volText = vol > 0 ? (vol >= 1000 && vol % 1000 === 0 ? `${vol / 1000}L` : `${vol}ml`) : '';
  const packText = pack && pack !== 'pcs' ? pack : (name ? detectPack(name) : '');
  return [volText, packText].filter(Boolean).join(' ');
}

/** Product with 8-digit HSN, the statutory GST rate for that HSN, and a units-per-case value. */
export function normalizeProductTax<T extends { hsn?: string | null; category?: any; name?: string; gstRate?: number | null; unitsPerCrate?: number; pack?: string; volume?: number }>(p: T): T {
  const hsn = normalizeTo8DigitHsn(p.hsn, p.category, p.name);
  const rate = gstRateFromHsn(hsn);
  const detectedVol = volumeFromName(p.name);
  const vol = Number(p.volume) > 0 ? Number(p.volume) : (detectedVol || 150);
  const pack = p.pack && p.pack.trim() !== '' && p.pack !== 'pcs' ? p.pack : detectPack(p.name);
  return {
    ...p,
    hsn,
    gstRate: rate != null ? rate : p.gstRate,
    volume: vol,
    pack,
    unitsPerCrate: Number(p.unitsPerCrate) > 0 ? p.unitsPerCrate : inferUnitsPerCase(`${p.name || ''} ${pack}`, vol),
  };
}

/** Just the normalized tax/pack/volume fields, for spreading over a product object. */
export function productTaxFields(p: Parameters<typeof normalizeProductTax>[0]) {
  const n = normalizeProductTax(p);
  return {
    hsn: n.hsn as string,
    gstRate: n.gstRate as number | undefined,
    unitsPerCrate: n.unitsPerCrate as number | undefined,
    volume: n.volume as number | undefined,
    pack: n.pack as string | undefined,
  };
}

/** HSN to print for a product: always the full 8-digit code. */
export function resolveProductHsn(
  p?: { hsn?: string | null; category?: string | null; name?: string | null; productName?: string | null } | null,
  categoryHint?: string | null,
): string {
  return normalizeTo8DigitHsn(p?.hsn, p?.category || categoryHint, p?.name || p?.productName);
}

/** Pieces (bottles / cans) in one crate / case. 30, 24, 12 and 10 are the usual pack sizes. */
export const CASE_PACK_SIZES = [30, 24, 12, 10] as const;

/**
 * Units per case, read from the text when it is stated ("24 x 200ml", "30 pcs/cs", "12 btl per case"),
 * otherwise a sensible default for the bottle size (<=200ml: 30, <=750ml: 24, <=1.25L: 12, bigger: 10).
 * Always editable on the product.
 */
export function inferUnitsPerCase(text?: string | null, volumeMl?: number | null): number {
  const t = String(text || '').toLowerCase();
  const m1 = t.match(/(\d{1,3})\s*(?:x|\*|×)\s*\d+(?:\.\d+)?\s*(?:ml|ltr|lt|l)\b/);
  const m2 = t.match(/(\d{1,3})\s*(?:pcs|pc|btl|btls|bottles?|cans?|units?|nos|pouch(?:es)?)\s*(?:\/|per)?\s*(?:cs|case|crate|ctn|box)?/);
  const m3 = t.match(/(\d{1,3})\s*(?:\/|per)\s*(?:cs|case|crate|ctn)/);
  for (const m of [m1, m2, m3]) {
    const n = m ? Number(m[1]) : 0;
    if (n >= 2 && n <= 60) return n;
  }
  const v = Number(volumeMl) || 0;
  if (v <= 0 || v <= 200) return 30;
  if (v <= 750) return 24;
  if (v <= 1250) return 12;
  return 10;
}

/**
 * Value (at the invoice rate, GST-inclusive in inclusive mode) of the FREE scheme cases carried
 * inside a line. Under the invoice method used by this business, GST is charged on this value too:
 * the free-case value is deducted from the taxable amount only, not from the tax.
 */
let GST_ON_FREE_CASES = true;
/** Set from Settings (billing.gstOnFreeCases). Default true = GST also on free scheme cases. */
export function setGstOnFreeCases(v: boolean | undefined | null) {
  GST_ON_FREE_CASES = v !== false;
}
/**
 * "Round off grand total" (Settings > Billing). When ON, the invoice total is rounded to the nearest
 * rupee and the difference is kept in `roundOff` (shown on the invoice). Before this the setting was
 * saved but never used.
 */
let ROUND_OFF_GRAND_TOTAL = false;
export function setRoundOffGrandTotal(v: boolean | undefined | null) {
  ROUND_OFF_GRAND_TOTAL = v !== false;
}
export function getRoundOffGrandTotal(): boolean {
  return ROUND_OFF_GRAND_TOTAL;
}
/** True when an amount is already a whole number of rupees (a bill issued with round-off). */
export function isWholeRupee(n: number | undefined | null): boolean {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return Math.abs(v - Math.round(v)) < 0.005;
}

export function getGstOnFreeCases(): boolean {
  return GST_ON_FREE_CASES;
}

/**
 * Lowest selling rate per PAID case (ex-GST) that still recovers the cost of a "buy N get M free" scheme.
 * Cost per case is ex-GST landed cost. e.g. buy 2 get 1 -> cost x 1.5; buy 1 get 1 -> cost x 2.
 */
export function breakEvenPaidRate(costExGstPerCase: number, buyN: number, getM: number): number {
  const n = Math.max(1, Number(buyN) || 1);
  const m = Math.max(0, Number(getM) || 0);
  return Math.round((Math.max(0, costExGstPerCase) * (n + m) / n) * 100) / 100;
}

/**
 * Lowest GST-INCLUSIVE rate per PAID case to charge so the taxable revenue still covers the cost of the
 * (n + m) cases handed over. Follows the active GST-on-free-cases rule: when GST is also charged on the
 * free cases, part of the price goes to tax on goods you gave away, so the price must be higher.
 * Returns null when no price can recover the cost (tax on free cases eats the whole paid amount).
 */
export function breakEvenInclPaidRate(costExGstPerCase: number, buyN: number, getM: number, gstFraction: number): number | null {
  const n = Math.max(1, Number(buyN) || 1);
  const m = Math.max(0, Number(getM) || 0);
  const c = Math.max(0, costExGstPerCase);
  const g = Math.max(0, gstFraction);
  const k = GST_ON_FREE_CASES ? ((n + m) * g) / (1 + g) : (n * g) / (1 + g);
  const denom = n - k;
  if (denom <= 0.0001) return null;
  return Math.round(((c * (n + m)) / denom) * 100) / 100;
}

/**
 * Lowest rate per case (ex-GST) when the deal is entered as ONE custom price for `cases` physical cases
 * (e.g. price of 2 divided over 3 cases) -> the cost itself. Provided for symmetry in the UI.
 */
export function breakEvenCustomRate(costExGstPerCase: number): number {
  return Math.round(Math.max(0, costExGstPerCase) * 100) / 100;
}

export function freeSchemeValue(
  it: Pick<BillItem, 'freeQty' | 'rate' | 'discount'>,
): number {
  if (!GST_ON_FREE_CASES) return 0;
  const free = Number(it.freeQty) || 0;
  const rate = Number(it.rate) || 0;
  if (free <= 0 || rate <= 0) return 0;
  const value = free * rate;
  const disc = Number(it.discount) || 0;
  // the stored discount may also hold a trade (percent/flat) discount; only the free-case part counts
  return Math.max(0, disc > 0 ? Math.min(value, disc) : value);
}

export interface LineTaxDetail {
  rate: number; // fraction
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
  total: number; // what the customer pays for the line
}

/**
 * Taxable / tax split of a line's NET billed value (e.g. after returns reduced it), keeping the
 * same proportions as the full line. Used by the profit reports.
 */
export function scaledTaxSplit(
  item: Pick<BillItem, 'amount' | 'freeQty' | 'rate' | 'discount'>,
  netBilled: number,
  rate: number,
): { taxable: number; tax: number } {
  const full = lineTaxDetail(item, rate, 'inclusive', 1);
  const ratio = full.total > 0 ? netBilled / full.total : 1;
  return { taxable: full.taxable * ratio, tax: full.tax * ratio };
}

/**
 * Tax split for one bill line. `factor` scales the line for an invoice-level (trade) discount.
 *  inclusive: amount is GST-inclusive. Tax = GST on (amount + free-case value); taxable = amount - tax.
 *  exclusive: amount is ex-GST.        Tax = rate x (amount + free-case value); total = amount + tax.
 */
export function lineTaxDetail(
  item: Pick<BillItem, 'amount' | 'freeQty' | 'rate' | 'discount'>,
  rate: number,
  mode: 'inclusive' | 'exclusive' = 'inclusive',
  factor = 1,
): LineTaxDetail {
  const amt = Math.max(0, Number(item.amount) || 0) * factor;
  const free = freeSchemeValue(item) * factor;
  const g = normalizeGstFraction(rate);
  if (g <= 0) return { rate: 0, taxable: amt, tax: 0, cgst: 0, sgst: 0, total: amt };
  const base = amt + free;
  if (mode === 'exclusive') {
    const tax = base * g;
    return { rate: g, taxable: amt, tax, cgst: tax / 2, sgst: tax / 2, total: amt + tax };
  }
  const tax = Math.min(amt, base - base / (1 + g));
  return { rate: g, taxable: amt - tax, tax, cgst: tax / 2, sgst: tax / 2, total: amt };
}

/**
 * Weighted-average half-rate (CGST or SGST %) for invoice labels.
 * Mixed-rate bills show the blended % instead of a hardcoded 6%.
 */
export function billGstHalfRatePercent(items: { amount: number; gst: number }[]): number {
  let taxBase = 0;
  let weighted = 0;
  for (const i of items) {
    const g = normalizeGstFraction(i.gst);
    const amt = Math.max(0, Number(i.amount) || 0);
    if (g <= 0 || amt <= 0) continue;
    taxBase += amt;
    weighted += amt * (g / 2) * 100;
  }
  if (taxBase <= 0) return 0;
  return Math.round((weighted / taxBase) * 100) / 100;
}

export function cgstSgstLabels(items: { amount: number; gst: number }[]): { cgst: string; sgst: string } {
  // Mixed slabs (e.g. 40% and 5% on one bill): never print a blended %. The per-rate tax summary
  // carries the rates; the totals row is just CGST / SGST.
  const rates = new Set<number>();
  for (const i of items) {
    const g = normalizeGstFraction(i.gst);
    if (g > 0 && Number(i.amount) > 0) rates.add(Math.round(g * 10000));
  }
  if (rates.size !== 1) return { cgst: 'CGST', sgst: 'SGST' };
  const half = Math.round(([...rates][0] / 2)) / 100;
  const s = Number.isInteger(half) ? String(half) : half.toFixed(2).replace(/\.?0+$/, '');
  return { cgst: `CGST (${s}%)`, sgst: `SGST (${s}%)` };
}

/**
 * Computes taxable value, CGST Rate/Amt and SGST Rate/Amt for a product.
 * In India, total GST is split 50/50 between CGST and SGST.
 */
export function computeProductGstBreakdown(
  productRate: number,
  categoryOrCustomGst?: number,
  customHsn?: string,
  categoryKey?: CategoryKey
): GstBreakdown {
  const gst = normalizeGstFraction(
    categoryOrCustomGst !== undefined
      ? categoryOrCustomGst
      : categoryKey && CATS[categoryKey]
      ? CATS[categoryKey].gst
      : 0.18
  );

  const hsn =
    customHsn ||
    (categoryKey && CATS[categoryKey] ? CATS[categoryKey].hsn : '22029990');

  const halfGst = gst / 2;
  const taxable = gst > 0 ? productRate / (1 + gst) : productRate;
  const totalTax = productRate - taxable;
  const cgstAmt = totalTax / 2;
  const sgstAmt = totalTax / 2;

  return {
    hsn,
    taxable,
    cgstRate: halfGst * 100,
    cgstAmt,
    sgstRate: halfGst * 100,
    sgstAmt,
    totalTax,
    gstRate: gst * 100,
  };
}

export function schemeLabel(promo?: Promotion | null, allProducts?: Product[]): string | null {
  if (!promo) return null;
  if (promo.type === 'bogo') return `Buy ${promo.buyQty || 2} Get ${promo.freeQty || 1} Free`;
  if (promo.type === 'percent') return `${promo.percent}% off`;
  if (promo.type === 'flat') return `₹${promo.flatPerCase} off/case`;

  if (promo.type === 'buy_x_get_different_free') {
    const rawIds = Array.isArray(promo.productIds)
      ? promo.productIds
      : Array.isArray((promo as any).product_ids)
      ? (promo as any).product_ids
      : [];
    const triggerNames = rawIds
      .map((id) => allProducts?.find((p) => Number(p.id) === Number(id))?.name)
      .filter(Boolean);
    const triggerStr =
      triggerNames.length > 0 ? triggerNames.join(', ') : 'Product';
    const freeProd = allProducts?.find((p) => Number(p.id) === Number(promo.freeProductId));
    const freeStr = freeProd ? freeProd.name : 'Free Product';
    const buyQty = Math.max(1, Number(promo.buyQty) || 1);
    const freeQty = Math.max(1, Number(promo.freeQty || promo.freeProductQty) || 1);
    return `Buy ${buyQty} ${triggerStr} → Get ${freeQty} ${freeStr} Free`;
  }

  if (promo.type === 'group_buy_n_get_m_free') {
    const buyQty = Math.max(1, Number(promo.buyQty) || 2);
    const freeQty = Math.max(1, Number(promo.freeQty || promo.freeProductQty) || 1);
    const rule = promo.freeItemRule || promo.freeItem || 'CHEAPEST_IN_GROUP';
    let ruleText = 'Cheapest in group';
    if (rule === 'SAME_AS_LAST_ADDED') {
      ruleText = 'Last added in group';
    } else if (rule === 'SPECIFIC_PRODUCT') {
      const p = allProducts?.find((x) => Number(x.id) === Number(promo.freeProductId));
      ruleText = p ? `${p.name} free` : 'Specific item';
    } else if (rule === 'CUSTOMER_CHOICE_FROM_GROUP') {
      ruleText = 'Choice from group';
    }
    const groupName = promo.groupCategory
      ? `${promo.groupCategory} category`
      : promo.groupBrand
      ? `${promo.groupBrand} brand`
      : 'group';
    return `Buy any ${buyQty} from ${groupName} → Get ${freeQty} Free (${ruleText})`;
  }

  if (promo.type === 'bundle') {
    const rawIds = Array.isArray(promo.productIds)
      ? promo.productIds
      : Array.isArray((promo as any).product_ids)
      ? (promo as any).product_ids
      : [];
    const minQty = Math.max(1, Number(promo.minQtyPerType) || Number(promo.buyQty) || 1);
    const freeQty = Math.max(1, Number(promo.freeProductQty) || Number(promo.freeQty) || 1);
    
    let freeName = '1 Free (Any Eligible)';
    if (promo.freeRewardChoice === 'specific' && promo.freeProductId) {
      const p = allProducts?.find((x) => Number(x.id) === Number(promo.freeProductId));
      if (p) freeName = `${p.name} Free`;
    }

    if (rawIds.length === 1) {
      const p = allProducts?.find((x) => Number(x.id) === Number(rawIds[0]));
      return `Buy ${minQty}cs ${p ? p.name : ''} → Get ${freeQty} Free`.replace('  ', ' ');
    }

    if (promo.bundleBuyType === 'specific' && rawIds.length > 0) {
      const names = rawIds
        .map((id) => allProducts?.find((p) => Number(p.id) === Number(id))?.name)
        .filter(Boolean);
      if (names.length > 0) {
        return `Buy ${names.join(' + ')} (${minQty}cs ea) → Get ${freeQty} ${freeName}`;
      }
    }
    const distinct = Math.max(1, promo.requiredDistinctTypes || 2);
    return `Buy ${distinct}+ Types (${minQty}cs ea) → Get ${freeQty} ${freeName}`;
  }
  return promo.name || null;
}

export interface BundleQualificationResult {
  promo: Promotion;
  isQualified: boolean;
  qualifyingCount: number; // e.g. 2 of 2
  requiredCount: number; // e.g. 2
  multiplier: number; // how many free bundles earned
  eligibleRewardProducts: Product[]; // all products eligible for the free reward
  defaultFreeProduct: Product | null;
  freeCasesAwarded: number; // total free crates earned
  qualifyingProductNames: string[];
  missingProductNames?: string[];
}

export function evaluateBundlePromotion(
  promo: Promotion,
  items: BillItem[],
  allProducts: Product[]
): BundleQualificationResult {
  const rawIds = Array.isArray(promo.productIds)
    ? promo.productIds
    : Array.isArray((promo as any).product_ids)
    ? (promo as any).product_ids
    : [];

  // Filter out any free bonus lines generated by bundle/bonus schemes from qualifying requirements
  const regularItems = items.filter((it) => !it.isBundleFreeItem && !it.isFree);

  // --- Type B: BUY_X_GET_DIFFERENT_FREE (buy product A, get product B free) ---
  if (promo.type === 'buy_x_get_different_free') {
    const buyQty = Math.max(1, Number(promo.buyQty) || 1);
    const freeQtyPerSet = Math.max(1, Number(promo.freeQty || promo.freeProductQty) || 1);
    const triggerItems = regularItems.filter((it) =>
      rawIds.length === 0 || rawIds.some((id) => Number(id) === Number(it.productId))
    );
    const totalTriggerQty = triggerItems.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const multiplier = Math.floor(totalTriggerQty / buyQty);
    const freeProd = promo.freeProductId
      ? allProducts.find((p) => Number(p.id) === Number(promo.freeProductId)) || null
      : null;
    const isQualified = multiplier > 0 && !!freeProd;
    const qualifyingNames = triggerItems.map((it) => it.productName);
    const missingNames =
      !isQualified && totalTriggerQty < buyQty
        ? rawIds.map((id) => allProducts.find((p) => Number(p.id) === Number(id))?.name || `Product #${id}`)
        : [];

    return {
      promo,
      isQualified,
      qualifyingCount: totalTriggerQty,
      requiredCount: buyQty,
      multiplier,
      eligibleRewardProducts: freeProd ? [freeProd] : allProducts,
      defaultFreeProduct: freeProd,
      freeCasesAwarded: isQualified ? multiplier * freeQtyPerSet : 0,
      qualifyingProductNames: qualifyingNames,
      missingProductNames: missingNames,
    };
  }

  // --- Type C: GROUP_BUY_N_GET_M_FREE (buy any N from this group, get M free) ---
  if (promo.type === 'group_buy_n_get_m_free') {
    const buyQty = Math.max(1, Number(promo.buyQty) || 2);
    const freeQtyPerSet = Math.max(1, Number(promo.freeQty || promo.freeProductQty) || 1);
    const groupIds = (
      Array.isArray(promo.productGroup) && promo.productGroup.length > 0
        ? promo.productGroup
        : rawIds
    ).map(Number);

    const isMemberOfGroup = (prodId: number) => {
      const p = allProducts.find((prod) => Number(prod.id) === Number(prodId));
      if (!p) return false;
      if (promo.groupCategory && p.category?.toLowerCase() === promo.groupCategory.toLowerCase()) {
        return true;
      }
      if (promo.groupBrand && p.brand?.toLowerCase() === promo.groupBrand.toLowerCase()) {
        return true;
      }
      if (groupIds.length > 0) {
        return groupIds.includes(Number(prodId));
      }
      return groupIds.length === 0 && !promo.groupCategory && !promo.groupBrand;
    };

    const groupItems = regularItems.filter((it) => isMemberOfGroup(it.productId));
    const totalGroupQty = groupItems.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const multiplier = Math.floor(totalGroupQty / buyQty);
    const isQualified = multiplier > 0;

    let eligibleRewardProducts = allProducts.filter((p) => isMemberOfGroup(p.id));
    if (eligibleRewardProducts.length === 0) eligibleRewardProducts = allProducts;

    const rule = promo.freeItemRule || promo.freeItem || 'CHEAPEST_IN_GROUP';
    let defaultFreeProduct: Product | null = null;

    if (rule === 'SPECIFIC_PRODUCT' && promo.freeProductId) {
      defaultFreeProduct = allProducts.find((p) => Number(p.id) === Number(promo.freeProductId)) || null;
      if (defaultFreeProduct) {
        eligibleRewardProducts = [defaultFreeProduct];
      }
    } else if (rule === 'CUSTOMER_CHOICE_FROM_GROUP') {
      if (promo.customerChoiceProductId) {
        defaultFreeProduct = allProducts.find((p) => Number(p.id) === Number(promo.customerChoiceProductId)) || null;
      }
      if (!defaultFreeProduct) {
        // Fallback default is cheapest or first in group
        const candidates = groupItems.length > 0
          ? allProducts.filter((p) => groupItems.some((it) => Number(it.productId) === Number(p.id)))
          : eligibleRewardProducts;
        const sorted = [...candidates].sort(
          (a, b) => (Number(a.retail) || 0) - (Number(b.retail) || 0)
        );
        defaultFreeProduct = sorted[0] || eligibleRewardProducts[0] || null;
      }
    } else if (rule === 'SAME_AS_LAST_ADDED' && groupItems.length > 0) {
      const lastItem = groupItems[groupItems.length - 1];
      defaultFreeProduct = allProducts.find((p) => Number(p.id) === Number(lastItem.productId)) || null;
      if (defaultFreeProduct) {
        eligibleRewardProducts = [defaultFreeProduct];
      }
    } else {
      // Default: 'CHEAPEST_IN_GROUP' (protects margin)
      const candidates = groupItems.length > 0
        ? allProducts.filter((p) => groupItems.some((it) => Number(it.productId) === Number(p.id)))
        : eligibleRewardProducts;
      const sorted = [...candidates].sort(
        (a, b) => (Number(a.retail) || 0) - (Number(b.retail) || 0)
      );
      defaultFreeProduct = sorted[0] || eligibleRewardProducts[0] || null;
      if (defaultFreeProduct) {
        eligibleRewardProducts = [defaultFreeProduct];
      }
    }

    if (!defaultFreeProduct) {
      defaultFreeProduct = eligibleRewardProducts[0] || null;
    }

    const qualifyingNames = groupItems.map((it) => it.productName);
    const missingNames =
      !isQualified && totalGroupQty > 0
        ? [`${buyQty - totalGroupQty} more case(s) from group`]
        : [];

    return {
      promo,
      isQualified,
      qualifyingCount: totalGroupQty,
      requiredCount: buyQty,
      multiplier,
      eligibleRewardProducts,
      defaultFreeProduct,
      freeCasesAwarded: isQualified ? multiplier * freeQtyPerSet : 0,
      qualifyingProductNames: qualifyingNames,
      missingProductNames: missingNames,
    };
  }

  // --- Type: Standard Combo / Bundle ---
  const minQty = Math.max(1, Number(promo.minQtyPerType) || Number(promo.buyQty) || 1);
  const freeQtyPerBundle = Math.max(1, Number(promo.freeProductQty) || Number(promo.freeQty) || 1);
  // If only 1 product configured in scheme, distinct requirement should be 1
  const distinct = rawIds.length === 1 ? 1 : Math.max(1, promo.requiredDistinctTypes || 2);

  // Compute all products eligible for the free reward
  let eligibleRewardProducts: Product[] = [];
  if (promo.freeRewardChoice === 'specific' && promo.freeProductId) {
    const specific = allProducts.find((p) => Number(p.id) === Number(promo.freeProductId));
    if (specific) eligibleRewardProducts = [specific];
    else eligibleRewardProducts = allProducts;
  } else if (rawIds.length > 0) {
    // All products configured in the scheme are eligible for the free reward
    eligibleRewardProducts = allProducts.filter((p) =>
      rawIds.some((id) => Number(id) === Number(p.id))
    );
    if (eligibleRewardProducts.length === 0) eligibleRewardProducts = allProducts;
  } else {
    // If no specific productIds, all products in catalog are eligible
    eligibleRewardProducts = allProducts;
  }

  // Determine a sensible default free product
  let defaultFreeProduct: Product | null = null;
  if (promo.freeProductId) {
    defaultFreeProduct = allProducts.find((p) => Number(p.id) === Number(promo.freeProductId)) || null;
  }
  if (!defaultFreeProduct && eligibleRewardProducts.length > 0) {
    // Check if any eligible reward product is already in regular cart items
    const inCart = eligibleRewardProducts.find((p) =>
      regularItems.some((it) => Number(it.productId) === Number(p.id))
    );
    defaultFreeProduct = inCart || eligibleRewardProducts[0];
  }

  if (promo.bundleBuyType === 'specific' && rawIds.length > 0) {
    // Requires all specific products in promo.productIds
    const requiredIds = rawIds;
    const qualifyingNames: string[] = [];
    const missingNames: string[] = [];
    let minBundleMultiplier = Infinity;

    for (const reqId of requiredIds) {
      const item = regularItems.find((it) => Number(it.productId) === Number(reqId));
      const prod = allProducts.find((p) => Number(p.id) === Number(reqId));
      const name = prod ? prod.name : `Product #${reqId}`;
      const qty = item ? item.qty : 0;
      if (qty >= minQty) {
        qualifyingNames.push(name);
        const bundlesPossible = Math.floor(qty / minQty);
        if (bundlesPossible < minBundleMultiplier) {
          minBundleMultiplier = bundlesPossible;
        }
      } else {
        missingNames.push(name);
      }
    }

    const isQualified = missingNames.length === 0 && requiredIds.length > 0;
    const multiplier = isQualified && minBundleMultiplier !== Infinity ? minBundleMultiplier : 0;

    return {
      promo,
      isQualified,
      qualifyingCount: qualifyingNames.length,
      requiredCount: requiredIds.length,
      multiplier,
      eligibleRewardProducts,
      defaultFreeProduct,
      freeCasesAwarded: multiplier * freeQtyPerBundle,
      qualifyingProductNames: qualifyingNames,
      missingProductNames: missingNames,
    };
  } else {
    // "any": Buy any N distinct product types from eligible list (or any in store if productIds is empty)
    const eligibleItems = regularItems.filter((it) => {
      if (rawIds.length > 0) {
        return rawIds.some((id) => Number(id) === Number(it.productId));
      }
      return true;
    }).filter((it) => it.qty >= minQty);

    const qualifyingNames = eligibleItems.map((it) => it.productName);
    const isQualified = eligibleItems.length >= distinct;
    
    // Calculate earned bundles based on distinct products and case quantities:
    // 1) From number of distinct eligible items (e.g. 4 distinct types with distinct requirement 2 = 2 bundles)
    const maxSetsByDistinct = Math.floor(eligibleItems.length / distinct);
    // 2) From repeated case quantities of qualifying types (e.g. 2 cases of Type A and 2 cases of Type B when minQty = 1 = 2 bundles)
    const sortedBundlesPerType = eligibleItems
      .map((it) => Math.floor(it.qty / minQty))
      .sort((a, b) => b - a);
    const maxSetsByQty =
      sortedBundlesPerType.length >= distinct ? sortedBundlesPerType[distinct - 1] : 0;
    const multiplier = isQualified ? Math.max(1, maxSetsByDistinct, maxSetsByQty) : 0;

    return {
      promo,
      isQualified,
      qualifyingCount: eligibleItems.length,
      requiredCount: distinct,
      multiplier,
      eligibleRewardProducts,
      defaultFreeProduct,
      freeCasesAwarded: multiplier * freeQtyPerBundle,
      qualifyingProductNames: qualifyingNames,
    };
  }
}

export function computeLine(
  product: Product,
  priceType: PriceType,
  qty: number,
  promo?: Promotion | null,
  customRate?: string | number | null,
  customDiscount?: number | null
) {
  const rate =
    customRate !== undefined && customRate !== null && customRate !== ''
      ? Number(customRate)
      : priceType === 'Retail'
      ? product.retail
      : product.wholesale;

  const gross = qty * rate;
  let freeQty = 0;
  let discount = 0;

  if (promo) {
    if (promo.type === 'bogo') {
      // Inclusive BOGO (FMCG standard): "Buy 2 Get 1 Free" means a cycle of
      // (2 paid + 1 free) = 3 cases. Free cases are taken from the line qty,
      // not added on top. Same math as GRN inward inclusive b2g1.
      //   qty 2 → 0 free (incomplete cycle)
      //   qty 3 → 1 free, 2 paid
      //   qty 6 → 2 free, 4 paid
      const buyQty = Math.max(1, Number(promo.buyQty) || 1);
      const rewardFreeQty = Math.max(1, Number(promo.freeQty) || 1);
      const cycle = buyQty + rewardFreeQty;
      if (qty >= cycle) {
        const groups = Math.floor(qty / cycle);
        freeQty = groups * rewardFreeQty;
      }
      // Cap free so chargeable never goes negative if misconfigured
      freeQty = Math.min(freeQty, Math.max(0, qty - 1));
      discount = freeQty * rate;
    } else if (promo.type === 'percent') {
      const pct = Math.max(0, Math.min(100, Number(promo.percent) || 0));
      discount = gross * (pct / 100);
    } else if (promo.type === 'flat') {
      const flatPerCase = Math.max(0, Number(promo.flatPerCase) || 0);
      discount = qty * flatPerCase;
    } else if (promo.type === 'bundle') {
      // Multi-product combo schemes (e.g. "Buy any 2 types get 1 free") require cart-level
      // qualification across distinct products (evaluated via evaluateBundlePromotion).
      // Line items themselves must NOT receive single-item free crates unless the bundle only targets 1 single product.
      const rawIds = Array.isArray(promo.productIds)
        ? promo.productIds
        : Array.isArray((promo as any).product_ids)
        ? (promo as any).product_ids
        : [];
      const distinct = Math.max(1, promo.requiredDistinctTypes || (rawIds.length === 1 ? 1 : 2));

      if (distinct <= 1 && rawIds.length === 1) {
        const buyReq = Math.max(1, Number(promo.minQtyPerType) || Number(promo.buyQty) || 1);
        const freeReq = Math.max(1, Number(promo.freeProductQty) || Number(promo.freeQty) || 1);
        if (qty >= buyReq) {
          const groups = Math.floor(qty / buyReq);
          freeQty = groups * freeReq;
        }
        discount = freeQty * rate;
      } else {
        // Multi-product combo: line item is billed at regular rate; free reward is awarded across the cart
        freeQty = 0;
        discount = 0;
      }
    } else if (promo.type === 'group_buy_n_get_m_free') {
      // If single item in group reaches full cycle (e.g. 3 cases for Buy 2 Get 1 Free), calculate free cases;
      // otherwise cross-product aggregation across distinct group items is handled by applyCartSchemes.
      const buyQty = Math.max(1, Number(promo.buyQty) || 2);
      const rewardFreeQty = Math.max(1, Number(promo.freeQty || promo.freeProductQty) || 1);
      const cycle = buyQty + rewardFreeQty;
      if (qty >= cycle) {
        const groups = Math.floor(qty / cycle);
        freeQty = groups * rewardFreeQty;
        freeQty = Math.min(freeQty, Math.max(0, qty - 1));
        discount = freeQty * rate;
      } else {
        freeQty = 0;
        discount = 0;
      }
    } else if (promo.type === 'buy_x_get_different_free') {
      // Cart-level cross-product schemes: line items are charged normally; free reward cases are computed & awarded across the cart
      freeQty = 0;
      discount = 0;
    }
  }

  if (customDiscount !== undefined && customDiscount !== null && Number(customDiscount) > 0) {
    discount += Number(customDiscount);
  }

  const chargeableQty = Math.max(0, qty - freeQty);
  const amount = Math.max(0, gross - discount);

  return { rate, gross, freeQty, chargeableQty, discount, amount };
}

export interface CartSchemeInputItem {
  productId: number;
  qty: number;
  /** May arrive as a string straight from a text input; '' / null mean "not set". */
  rate?: number | string | null;
  customRate?: number | string | null;
  promo?: Promotion | null;
  /** Explicitly opted out of schemes for this line (full rate, no free cases, no scheme deductions) */
  noScheme?: boolean;
  priceType?: PriceType;
}

export interface CartSchemeResult {
  lineItems: BillItem[];
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  totalTax: number;
  grandTotal: number;
  totalFreeQty: number;
  totalDiscount: number;
}

/**
 * Unified promotions & cart calculation engine.
 * Applies:
 * 1) Single-product schemes (BOGO, percent discount, flat discount per case).
 * 2) Group Schemes ('group_buy_n_get_m_free'):
 *    - Evaluates total cases across group members in the cart.
 *    - Awards free cases according to rule:
 *      * 'SAME_AS_LAST_ADDED': Last added group product in cart receives the free case(s).
 *      * 'CHEAPEST_IN_GROUP': Lowest-priced group product receives the free case(s).
 *      * 'SPECIFIC_PRODUCT': Designated product receives the free case(s).
 *      * 'CUSTOMER_CHOICE_FROM_GROUP': Customer choice or default cheapest/last.
 * 3) Cross-product 'buy_x_get_different_free':
 *    - Buy Product A, get Product B free.
 * 4) Multi-product combos ('bundle'):
 *    - Distinct types or specific bundle requirements.
 * 5) Taxes & Gross Line Totals:
 *    - Computes lineTaxable on net chargeable amount (gross - discount).
 *    - Computes CGST/SGST when billType is tax_invoice.
 */
export function applyCartSchemes(
  rawLines: CartSchemeInputItem[],
  promotions: Promotion[],
  allProducts: Product[],
  options?: {
    billType?: 'tax_invoice' | 'bill_of_supply' | 'estimate' | 'challan';
    itemOrder?: number[]; // Product IDs in chronological order of addition to cart
    autoAddMissingFreeLines?: boolean;
    /** If true, schemes are completely disabled for this sale: full rates, 0 free items, 0 discount */
    disableAllSchemes?: boolean;
    /** If false, auto-qualifying promotions won't auto-attach unless explicitly assigned */
    autoApply?: boolean;
  }
): CartSchemeResult {
  const activeLines = rawLines.filter((l) => (Number(l.qty) || 0) > 0);
  if (activeLines.length === 0) {
    return {
      lineItems: [],
      taxableAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      totalTax: 0,
      grandTotal: 0,
      totalFreeQty: 0,
      totalDiscount: 0,
    };
  }

  const allSchemesDisabled = options?.disableAllSchemes === true;

  // 1. Initialize BillItems and compute single-product promotions
  const lines: BillItem[] = activeLines.map((item, idx) => {
    const prod = allProducts.find((p) => p.id === item.productId);
    const fallbackPrice = prod
      ? item.priceType === 'Wholesale'
        ? prod.wholesale
        : prod.retail
      : 0;
    const rate =
      item.customRate !== undefined && item.customRate !== null && item.customRate !== ''
        ? Number(item.customRate)
        : item.rate !== undefined && item.rate !== null && item.rate !== ''
        ? Number(item.rate)
        : fallbackPrice;

    // Check if item has explicitly opted out of schemes
    const isExplicitlyNoScheme = allSchemesDisabled || item.noScheme === true || item.promo === null;
    const promo = isExplicitlyNoScheme ? null : (item.promo || null);
    const qty = Math.max(0, Number(item.qty) || 0);

    // If single-product promo (bogo, percent, flat), compute base line discount/free qty
    const isSinglePromo =
      !isExplicitlyNoScheme &&
      promo && (promo.type === 'bogo' || promo.type === 'percent' || promo.type === 'flat');
    const comp = isSinglePromo
      ? computeLine(prod || ({} as Product), item.priceType || 'Retail', qty, promo, rate, 0)
      : {
          rate,
          gross: qty * rate,
          freeQty: 0,
          chargeableQty: qty,
          discount: 0,
          amount: qty * rate,
        };

    const isGst = options?.billType === 'tax_invoice';
    const rawGst = prod?.gstRate !== undefined
      ? prod.gstRate
      : (prod?.category && (CATS as any)[prod.category]?.gst !== undefined)
      ? (CATS as any)[prod.category].gst
      : 0.18;
    const gstRatePercent = isGst ? (rawGst <= 1 ? Math.round(rawGst * 100 * 100) / 100 : rawGst) : 0;
    const halfRate = gstRatePercent / 2;

    return {
      key: `item_${item.productId}_${idx}`,
      productId: item.productId,
      productName: prod ? prod.name : `Product #${item.productId}`,
      category: (prod?.category as CategoryKey) || 'general',
      hsn: normalizeTo8DigitHsn(prod?.hsn, prod?.category, prod?.name),
      gst: normalizeGstFraction(gstRatePercent),
      priceType: item.priceType || 'Retail',
      qty,
      rate,
      gross: comp.gross,
      freeQty: comp.freeQty,
      chargeableQty: comp.chargeableQty,
      discount: comp.discount,
      amount: comp.amount,
      taxable: comp.amount,
      cgstRate: halfRate,
      cgst: 0,
      sgstRate: halfRate,
      sgst: 0,
      appliedPromo: promo || undefined,
      promoLabel: isExplicitlyNoScheme
        ? 'No Scheme'
        : promo
        ? schemeLabel(promo, allProducts)
        : undefined,
      noScheme: isExplicitlyNoScheme,
      schemeSkipped: isExplicitlyNoScheme,
    };
  });

  // Helper to test if product belongs to group
  const isMemberOfGroup = (promo: Promotion, prodId: number): boolean => {
    const p = allProducts.find((pr) => Number(pr.id) === Number(prodId));
    if (!p) return false;
    if (promo.groupCategory && p.category?.toLowerCase() === promo.groupCategory.toLowerCase()) {
      return true;
    }
    if (promo.groupBrand && p.brand?.toLowerCase() === promo.groupBrand.toLowerCase()) {
      return true;
    }
    const rawIds = Array.isArray(promo.productGroup) && promo.productGroup.length > 0
      ? promo.productGroup
      : Array.isArray(promo.productIds)
      ? promo.productIds
      : [];
    if (rawIds.length > 0) {
      return rawIds.some((id) => Number(id) === Number(prodId));
    }
    return !promo.groupCategory && !promo.groupBrand;
  };

  // 2. Cross-Product Group Schemes ('group_buy_n_get_m_free')
  if (!allSchemesDisabled) {
    // Collect active group promotions
    const activePromos = (promotions || []).filter((p) => p.isActive !== false);
    const groupPromos = options?.autoApply !== false
      ? activePromos.filter((p) => p.type === 'group_buy_n_get_m_free')
      : [];

    // Also include any group promos explicitly assigned on cart items
    for (const line of lines) {
      if (!line.noScheme && line.appliedPromo && line.appliedPromo.type === 'group_buy_n_get_m_free') {
        if (!groupPromos.some((gp) => Number(gp.id) === Number(line.appliedPromo!.id))) {
          groupPromos.push(line.appliedPromo);
        }
      }
    }

    for (const promo of groupPromos) {
      const groupLines = lines.filter((l) => !l.isBundleFreeItem && !l.noScheme && !l.schemeSkipped && isMemberOfGroup(promo, l.productId));
      if (groupLines.length === 0) continue;

      const totalGroupQty = groupLines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
      const buyQty = Math.max(1, Number(promo.buyQty) || 2);
      const freeQtyPerSet = Math.max(1, Number(promo.freeQty || promo.freeProductQty) || 1);
      const cycle = buyQty + freeQtyPerSet; // Inclusive cycle (e.g. 2 + 1 = 3 cases)

      let earnedFree = 0;
      if (totalGroupQty >= cycle) {
        earnedFree = Math.floor(totalGroupQty / cycle) * freeQtyPerSet;
      } else if (totalGroupQty >= buyQty) {
        earnedFree = Math.floor(totalGroupQty / buyQty) * freeQtyPerSet;
      }

      if (earnedFree > 0) {
        const rule = promo.freeItemRule || promo.freeItem || 'CHEAPEST_IN_GROUP';

        // Sort candidates to determine priority for receiving free cases
        let sortedCandidates = [...groupLines];

        if (rule === 'SAME_AS_LAST_ADDED') {
          // Latest added item in the group gets the free case(s)
          sortedCandidates.sort((a, b) => {
            if (options?.itemOrder && options.itemOrder.length > 0) {
              const idxA = options.itemOrder.lastIndexOf(a.productId);
              const idxB = options.itemOrder.lastIndexOf(b.productId);
              return idxB - idxA; // Highest index (latest added) first
            }
            return groupLines.indexOf(b) - groupLines.indexOf(a);
          });
        } else if (rule === 'CHEAPEST_IN_GROUP') {
          // Lowest rate item receives the free case(s) to protect margins
          sortedCandidates.sort((a, b) => (Number(a.rate) || 0) - (Number(b.rate) || 0));
        } else if (rule === 'SPECIFIC_PRODUCT' && promo.freeProductId) {
          // Preferred / specific free product
          sortedCandidates.sort((a, b) => {
            if (Number(a.productId) === Number(promo.freeProductId)) return -1;
            if (Number(b.productId) === Number(promo.freeProductId)) return 1;
            return 0;
          });
        } else if (rule === 'CUSTOMER_CHOICE_FROM_GROUP' && promo.customerChoiceProductId) {
          sortedCandidates.sort((a, b) => {
            if (Number(a.productId) === Number(promo.customerChoiceProductId)) return -1;
            if (Number(b.productId) === Number(promo.customerChoiceProductId)) return 1;
            return 0;
          });
        }

        let remFree = earnedFree;
        for (const targetLine of sortedCandidates) {
          if (remFree <= 0) break;
          // How many free cases can this line absorb?
          const availableQty = Math.max(0, targetLine.qty - (targetLine.freeQty || 0));
          const giveFree = Math.min(availableQty, remFree);
          if (giveFree > 0) {
            targetLine.freeQty = (targetLine.freeQty || 0) + giveFree;
            targetLine.chargeableQty = Math.max(0, targetLine.qty - targetLine.freeQty);
            targetLine.discount = (targetLine.discount || 0) + (giveFree * targetLine.rate);
            targetLine.amount = Math.max(0, targetLine.gross - targetLine.discount);
            targetLine.appliedPromo = promo;
            targetLine.promoLabel = schemeLabel(promo, allProducts) || `🎁 ${promo.name}`;
            remFree -= giveFree;
          }
        }

        // If specific product rule and product not in cart, or remaining free items need explicit row:
        if (remFree > 0 && (rule === 'SPECIFIC_PRODUCT' || options?.autoAddMissingFreeLines)) {
          const freeTargetProdId = promo.freeProductId || sortedCandidates[0]?.productId;
          const freeTargetProd = allProducts.find((p) => Number(p.id) === Number(freeTargetProdId));
          if (freeTargetProd) {
            lines.push({
              key: `group_free_${promo.id}_${Date.now()}`,
              productId: freeTargetProd.id,
              productName: freeTargetProd.name,
              category: (freeTargetProd.category as CategoryKey) || 'general',
              hsn: normalizeTo8DigitHsn(freeTargetProd.hsn, freeTargetProd.category, freeTargetProd.name),
              gst: resolveProductGstRate(freeTargetProd),
              priceType: 'Retail',
              qty: remFree,
              rate: 0,
              gross: 0,
              freeQty: remFree,
              chargeableQty: 0,
              discount: 0,
              amount: 0,
              taxable: 0,
              cgstRate: 0,
              cgst: 0,
              sgstRate: 0,
              sgst: 0,
              isBundleFreeItem: true,
              isFree: true,
              bundlePromoId: promo.id,
              appliedPromo: promo,
              promoLabel: `🎁 ${promo.name} (Free Reward)`,
            });
          }
        }
      }
    }

    // 3. Cross-Product 'buy_x_get_different_free' Schemes
    const buyXGetDiffPromos = options?.autoApply !== false
      ? activePromos.filter((p) => p.type === 'buy_x_get_different_free')
      : [];
    for (const line of lines) {
      if (!line.noScheme && line.appliedPromo && line.appliedPromo.type === 'buy_x_get_different_free') {
        if (!buyXGetDiffPromos.some((dp) => Number(dp.id) === Number(line.appliedPromo!.id))) {
          buyXGetDiffPromos.push(line.appliedPromo);
        }
      }
    }

    for (const promo of buyXGetDiffPromos) {
      const rawIds = Array.isArray(promo.productIds) ? promo.productIds.map(Number) : [];
      const triggerLines = lines.filter((l) => !l.isBundleFreeItem && !l.noScheme && !l.schemeSkipped && (rawIds.length === 0 || rawIds.includes(l.productId)));
      const totalTriggerQty = triggerLines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
      const buyQty = Math.max(1, Number(promo.buyQty) || 1);
      const freeQtyPerSet = Math.max(1, Number(promo.freeQty || promo.freeProductQty) || 1);
      const earnedFree = Math.floor(totalTriggerQty / buyQty) * freeQtyPerSet;

      if (earnedFree > 0 && promo.freeProductId) {
        const freeProd = allProducts.find((p) => Number(p.id) === Number(promo.freeProductId));
        const inCartLine = lines.find((l) => !l.isBundleFreeItem && !l.noScheme && Number(l.productId) === Number(promo.freeProductId));

        if (inCartLine && inCartLine.qty > 0) {
          const giveFree = Math.min(inCartLine.qty, earnedFree);
          inCartLine.freeQty = (inCartLine.freeQty || 0) + giveFree;
          inCartLine.chargeableQty = Math.max(0, inCartLine.qty - inCartLine.freeQty);
          inCartLine.discount = (inCartLine.discount || 0) + (giveFree * inCartLine.rate);
          inCartLine.amount = Math.max(0, inCartLine.gross - inCartLine.discount);
          inCartLine.appliedPromo = promo;
          inCartLine.promoLabel = schemeLabel(promo, allProducts) || `🎁 ${promo.name}`;
        } else if (freeProd && options?.autoAddMissingFreeLines) {
          lines.push({
            key: `diff_free_${promo.id}_${Date.now()}`,
            productId: freeProd.id,
            productName: freeProd.name,
            category: (freeProd.category as CategoryKey) || 'general',
            hsn: normalizeTo8DigitHsn(freeProd.hsn, freeProd.category, freeProd.name),
            gst: resolveProductGstRate(freeProd),
            priceType: 'Retail',
            qty: earnedFree,
            rate: 0,
            gross: 0,
            freeQty: earnedFree,
            chargeableQty: 0,
            discount: 0,
            amount: 0,
            taxable: 0,
            cgstRate: 0,
            cgst: 0,
            sgstRate: 0,
            sgst: 0,
            isBundleFreeItem: true,
            isFree: true,
            bundlePromoId: promo.id,
            appliedPromo: promo,
            promoLabel: `🎁 ${promo.name} (Free Reward)`,
          });
        }
      }
    }

    // 4. Multi-Product Bundle Schemes ('bundle')
    const bundlePromos = options?.autoApply !== false
      ? activePromos.filter((p) => p.type === 'bundle')
      : [];
    for (const promo of bundlePromos) {
      const eligibleLines = lines.filter((l) => !l.noScheme);
      const res = evaluateBundlePromotion(promo, eligibleLines, allProducts);
      if (res.isQualified && res.freeCasesAwarded > 0) {
        const rewardProd = res.defaultFreeProduct || res.eligibleRewardProducts[0];
        if (rewardProd) {
          const inCartLine = lines.find((l) => !l.isBundleFreeItem && !l.noScheme && Number(l.productId) === Number(rewardProd.id));
          if (inCartLine && inCartLine.qty >= res.freeCasesAwarded && inCartLine.freeQty === 0) {
            inCartLine.freeQty = res.freeCasesAwarded;
            inCartLine.chargeableQty = Math.max(0, inCartLine.qty - inCartLine.freeQty);
            inCartLine.discount = res.freeCasesAwarded * inCartLine.rate;
            inCartLine.amount = Math.max(0, inCartLine.gross - inCartLine.discount);
            inCartLine.appliedPromo = promo;
            inCartLine.promoLabel = schemeLabel(promo, allProducts) || `🎁 ${promo.name}`;
          } else if (options?.autoAddMissingFreeLines) {
            const existingFree = lines.find((l) => l.isBundleFreeItem && Number(l.bundlePromoId) === Number(promo.id));
            if (!existingFree) {
              lines.push({
                key: `bundle_free_${promo.id}_${Date.now()}`,
                productId: rewardProd.id,
                productName: rewardProd.name,
                category: (rewardProd.category as CategoryKey) || 'general',
                hsn: normalizeTo8DigitHsn(rewardProd.hsn, rewardProd.category, rewardProd.name),
                gst: resolveProductGstRate(rewardProd),
                priceType: 'Retail',
                qty: res.freeCasesAwarded,
                rate: 0,
                gross: 0,
                freeQty: res.freeCasesAwarded,
                chargeableQty: 0,
                discount: 0,
                amount: 0,
                taxable: 0,
                cgstRate: 0,
                cgst: 0,
                sgstRate: 0,
                sgst: 0,
                isBundleFreeItem: true,
                isFree: true,
                bundlePromoId: promo.id,
                appliedPromo: promo,
                promoLabel: `🎁 ${promo.name} (Combo Free)`,
              });
            }
          }
        }
      }
    }
  }

  // 5. Finalize Taxes, Net Amounts, and Totals across all lines
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let freeCount = 0;
  let discountSum = 0;

  const isGst = options?.billType === 'tax_invoice';

  // GST is ALWAYS inclusive: list rates already contain the tax, so a tax invoice shows the tax
  // carved out of the line amount; it is never added on top. Total payable = sum of line amounts.
  lines.forEach((item) => {
    const prod = allProducts.find((p) => p.id === item.productId);
    const rawGst = resolveProductGstRate(prod, item.category);
    const gstRate = isGst ? Math.round(rawGst * 100 * 100) / 100 : 0;
    const halfRate = gstRate / 2;

    // `amount` is what the customer pays for the line (GST included)
    const linePayable = Math.round(Math.max(0, item.amount ?? (item.chargeableQty * item.rate)) * 100) / 100;
    const d = isGst
      ? lineTaxDetail({ ...item, amount: linePayable }, rawGst, 'inclusive')
      : { taxable: linePayable, cgst: 0, sgst: 0 };
    const lineTaxable = Math.round(d.taxable * 100) / 100;
    const lineCgst = Math.round(d.cgst * 100) / 100;
    const lineSgst = Math.round(d.sgst * 100) / 100;

    item.taxable = lineTaxable;
    item.cgstRate = halfRate;
    item.cgst = lineCgst;
    item.sgstRate = halfRate;
    item.sgst = lineSgst;
    item.gst = rawGst;
    item.hsn = normalizeTo8DigitHsn(item.hsn || prod?.hsn, prod?.category || item.category, prod?.name || item.productName);
    item.gross = linePayable; // GST-inclusive payable value of the line
    item.amount = linePayable;

    totalTaxable += lineTaxable;
    totalCgst += lineCgst;
    totalSgst += lineSgst;
    freeCount += Number(item.freeQty) || 0;
    discountSum += Number(item.discount) || 0;
  });

  const totalTax = Math.round((totalCgst + totalSgst) * 100) / 100;
  const grandTotal = Math.round(lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0) * 100) / 100;

  return {
    lineItems: lines,
    taxableAmount: Math.round(totalTaxable * 100) / 100,
    cgstAmount: Math.round(totalCgst * 100) / 100,
    sgstAmount: Math.round(totalSgst * 100) / 100,
    totalTax,
    grandTotal,
    totalFreeQty: freeCount,
    totalDiscount: Math.round(discountSum * 100) / 100,
  };
}

/**
 * The GST treatment a saved bill was issued with, so re-calculating it (an edit, a repair) gives the
 * same tax it had. A bill saved with no tax charged stays tax-free, unless none of its lines was taxable
 * (then new taxed lines follow the app-wide setting).
 */
export function issuedGstMode(
  bill: { cgst?: number; sgst?: number; total?: number; items?: { gst?: number }[] },
  appMode: GstMode = 'inclusive'
): GstMode {
  const cgst = Number(bill.cgst);
  const sgst = Number(bill.sgst);
  const noTaxCharged = Number.isFinite(cgst) && Number.isFinite(sgst) && cgst + sgst < 0.005 && Number(bill.total) > 0;
  if (!noTaxCharged) return 'inclusive';
  const hadTaxedLine = (bill.items || []).some((i) => normalizeGstFraction(i.gst as number) > 0);
  return hadTaxedLine ? 'off' : appMode;
}

export function billTotals(
  items: BillItem[],
  gstMode: GstMode = 'inclusive',
  additionalDiscount: number = 0,
  opts?: { round?: boolean }
): BillTotals {
  const t = billTotalsUnrounded(items, gstMode, additionalDiscount);
  const doRound = opts?.round ?? ROUND_OFF_GRAND_TOTAL;
  if (!doRound) return t;
  const rounded = Math.round(t.total);
  const roundOff = Math.round((rounded - t.total) * 100) / 100;
  return Math.abs(roundOff) < 0.005 ? t : { ...t, total: rounded, roundOff };
}

function billTotalsUnrounded(
  items: BillItem[],
  gstMode: GstMode = 'inclusive',
  additionalDiscount: number = 0
): BillTotals {
  const gross = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const lineDiscount = items.reduce((s, i) => s + (Number(i.discount) || 0), 0);
  const extraDisc = Math.max(0, Number(additionalDiscount) || 0);
  const discount = lineDiscount + extraDisc;
  const effectiveGross = Math.max(0, gross - extraDisc);

  if (gstMode === 'off') {
    return {
      subtotal: effectiveGross,
      cgst: 0,
      sgst: 0,
      total: effectiveGross,
      discount,
      additionalDiscount: extraDisc,
    };
  }

  // An invoice-level (trade) discount scales every line, including its tax.
  const factor = gross > 0 ? effectiveGross / gross : 1;
  // Prices are GST-inclusive. Old data / settings saying 'exclusive' must never add tax on top.
  const mode = 'inclusive' as const;
  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let total = 0;
  for (const i of items) {
    const d = lineTaxDetail(i, i.gst, mode, factor);
    taxable += d.taxable;
    cgst += d.cgst;
    sgst += d.sgst;
    total += d.total;
  }
  return {
    subtotal: Math.max(0, taxable),
    cgst,
    sgst,
    total: Math.max(0, total),
    discount,
    additionalDiscount: extraDisc,
  };
}

export function statusOf(total: number, paid: number): BalanceStatus {
  const bal = Math.round((total - paid) * 100) / 100;
  if (bal <= 0) return { label: 'Paid', balanceKey: 'good', balance: Math.max(bal, 0) };
  if (paid <= 0) return { label: 'Credit', balanceKey: 'bad', balance: bal };
  return { label: 'Partial', balanceKey: 'warn', balance: bal };
}

/**
 * Customer-facing summary for the Non-GST (B2C retail) copy of a bill.
 * Every figure is the tax-inclusive price the customer actually pays, so the rows
 * always add up: itemsValue - schemeDiscount - specialDiscount (+ taxAdjustment) = total.
 * `taxAdjustment` is only non-zero for bills raised in "exclusive" GST mode, where the
 * tax is added on top of the line amounts.
 */
export function nonGstSummary(bill: Bill) {
  const itemsValue = (bill.items || []).reduce(
    (sum, it) => sum + (Number(it.gross) || (Number(it.qty) || 0) * (Number(it.rate) || 0)),
    0
  );
  const specialDiscount = Math.max(0, Number(bill.additionalDiscount) || 0);
  const schemeDiscount = Math.max(0, (Number(bill.discount) || 0) - specialDiscount);
  const net = itemsValue - schemeDiscount - specialDiscount;
  const rawAdj = (Number(bill.total) || 0) - net;
  const taxAdjustment = Math.abs(rawAdj) > 0.5 ? rawAdj : 0;
  return { itemsValue, schemeDiscount, specialDiscount, taxAdjustment, total: Number(bill.total) || 0 };
}

function formatMonospaceReceipt(bill: Bill, isGst: boolean = true): string {
  const colItem = 14;
  const colQty = 3;
  const colRate = 5;
  const colAmt = 6;
  const totalWidth = colItem + 1 + colQty + 1 + colRate + 1 + colAmt; // 31 chars

  const header = `${'ITEM'.padEnd(colItem)} ${'QTY'.padStart(colQty)} ${'RATE'.padStart(colRate)} ${'AMOUNT'.padStart(colAmt)}`;
  const divLine = '-'.repeat(totalWidth);
  const dblLine = '='.repeat(totalWidth);

  const lines: string[] = [header, divLine];

  bill.items.forEach((it) => {
    const d = freeStockInvoiceDisplay(it);
    let name = it.productName || 'Item';
    if (name.length > colItem) {
      name = name.slice(0, colItem - 1) + '…';
    } else {
      name = name.padEnd(colItem);
    }
    const qtyStr = String(it.qty).padStart(colQty);
    const rateStr = String(Math.round(d.rate)).padStart(colRate);
    const amtStr = (d.isFreeStock ? 'FREE' : String(Math.round(d.amount))).padStart(colAmt);

    lines.push(`${name} ${qtyStr} ${rateStr} ${amtStr}`);
    if (d.isFreeStock) {
      lines.push(` ↳ FREE STOCK · 100% discount`);
    } else if (it.freeQty > 0) {
      const paidQty = Math.max(0, it.qty - it.freeQty);
      lines.push(` ↳ Includes ${it.freeQty} free in ${it.qty} cs (${paidQty} billed + ${it.freeQty} free)`);
    }
    if (d.discount > 0 && !d.isFreeStock) {
      lines.push(` ↳ Scheme disc Rs ${Math.round(d.discount)}`);
    }
  });

  lines.push(divLine);

  const formatSummaryRow = (label: string, val: string) => {
    const paddedLabel = label.padEnd(16);
    const paddedVal = val.padStart(totalWidth - 16);
    return `${paddedLabel}${paddedVal}`;
  };

  if (isGst) {
    lines.push(formatSummaryRow('Gross Subtotal:', `Rs ${money(bill.subtotal)}`));
    if (bill.additionalDiscount && bill.additionalDiscount > 0) {
      lines.push(formatSummaryRow('Special Discount:', `-Rs ${money(bill.additionalDiscount)}`));
    }
    if (bill.discount > (bill.additionalDiscount || 0)) {
      lines.push(formatSummaryRow('Scheme Savings:', `-Rs ${money(bill.discount - (bill.additionalDiscount || 0))}`));
    }
    if (bill.cgst > 0 || bill.sgst > 0) {
      const gstLbl = cgstSgstLabels(bill.items || []);
      lines.push(formatSummaryRow(gstLbl.cgst + ':', `Rs ${money(bill.cgst)}`));
      lines.push(formatSummaryRow(gstLbl.sgst + ':', `Rs ${money(bill.sgst)}`));
    }
    if (Math.abs(Number(bill.roundOff) || 0) >= 0.005) {
      const ro = Number(bill.roundOff) || 0;
      lines.push(formatSummaryRow('Round off:', `${ro < 0 ? '-' : '+'}Rs ${money(Math.abs(ro))}`));
    }
  } else {
    // Non-GST (B2C) copy: tax-inclusive prices only, no GST split.
    const ng = nonGstSummary(bill);
    lines.push(formatSummaryRow('Items Value:', `Rs ${money(ng.itemsValue)}`));
    if (ng.schemeDiscount > 0) {
      lines.push(formatSummaryRow('Scheme Savings:', `-Rs ${money(ng.schemeDiscount)}`));
    }
    if (ng.specialDiscount > 0) {
      lines.push(formatSummaryRow('Special Discount:', `-Rs ${money(ng.specialDiscount)}`));
    }
    if (ng.taxAdjustment > 0.05) {
      lines.push(formatSummaryRow('Taxes:', `Rs ${money(ng.taxAdjustment)}`));
    }
  }

  lines.push(dblLine);
  lines.push(formatSummaryRow('TOTAL PAYABLE:', `Rs ${money(bill.total)}`));
  lines.push(formatSummaryRow('Amount Paid:', `Rs ${money(bill.amountPaid)}`));
  const st = statusOf(bill.total, bill.amountPaid);
  lines.push(formatSummaryRow('Balance Due:', `Rs ${money(st.balance)}`));

  return ['```', ...lines, '```'].join('\n');
}

export function buildBillText(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst'
): string {
  const isGst =
    invoiceFormat !== undefined
      ? invoiceFormat === 'gst'
      : bill.invoiceType === 'tax_invoice' || bill.isGstInvoice === true
        ? true
        : bill.invoiceType === 'retail' || bill.invoiceType === 'bill_of_supply' || bill.isGstInvoice === false
          ? false
          : bill.supplyType === 'B2B' && Boolean(bill.customerGstin);

  const st = statusOf(bill.total, bill.amountPaid);
  const invoicePrefix = settings?.invoicePrefix || (isGst ? 'INV' : 'RET');
  const billNo = `${invoicePrefix}-${bill.id}`;

  const orgName = org?.name || 'MrWater';
  const orgTagline = org?.tagline || 'Authorized Wholesale Beverage Distributor';
  const orgPhone = org?.phone || '';
  const orgGstin = org?.gstin || '';

  const out: string[] = [];

  if (isGst) {
    out.push(`🧾 *TAX INVOICE — ${orgName.toUpperCase()}*`);
    out.push(`_(GST B2B Tax Invoice)_`);
    if (orgTagline) out.push(`_${orgTagline}_`);
    if (org?.address) out.push(`📍 ${org.address}${org.city ? `, ${org.city}` : ''}`);
    out.push(`📞 ${orgPhone} | GSTIN: ${orgGstin}`);
  } else {
    out.push(`🧾 *RETAIL BILL / CASH MEMO — ${orgName.toUpperCase()}*`);
    out.push(`_(Non-GST / B2C Sale)_`);
    if (orgTagline) out.push(`_${orgTagline}_`);
    if (org?.address) out.push(`📍 ${org.address}${org.city ? `, ${org.city}` : ''}`);
    out.push(`📞 Phone: ${orgPhone}${orgGstin ? ` | GSTIN: ${orgGstin}` : ''}`);
  }
  out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━');
  out.push(`📄 *${isGst ? 'Tax Invoice' : 'Bill No'}:* #${billNo}`);
  out.push(`📅 *Date:* ${bill.date}`);
  out.push(`👤 *Billed To:* *${(bill.retailer || 'Cash Retailer').toUpperCase()}*`);
  if (isGst && bill.customerGstin) {
    out.push(`🏢 *Buyer GSTIN:* ${bill.customerGstin}`);
  }
  if (bill.phone) out.push(`📱 *Party Contact:* ${bill.phone}`);
  out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Monospace aligned receipt table
  out.push(formatMonospaceReceipt(bill, isGst));

  // Settlement & Status summary
  const statusEmoji = st.balance <= 0 ? '✅' : st.balance === bill.total ? '⚠️' : '⏳';
  out.push('');
  out.push(`${statusEmoji} *Payment Status:* *${st.label.toUpperCase()}*`);
  if (st.balance > 0) {
    out.push(`⚠️ *Pending Balance: ₹${money(st.balance)}*`);
  } else {
    out.push(`🎉 *Full Payment Received: ₹${money(bill.amountPaid)}*`);
  }

  if (org?.upiId || org?.bankName) {
    out.push('');
    out.push('💳 *Settlement Details:*');
    if (org.upiId) out.push(`• UPI ID: *${org.upiId}*`);
    if (org.bankName) {
      out.push(`• Bank: ${org.bankName} (A/c: ${org.accountNumber || '—'}, IFSC: ${org.ifsc || '—'})`);
    }
  }

  if (org?.invoiceTerms) {
    out.push('');
    out.push(`_Terms: ${org.invoiceTerms}_`);
  }
  out.push('_Thank you for your business!_');

  return out.join('\n');
}

export function whatsappLink(phone: string, text: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  const base = withCountryCode ? `https://wa.me/${withCountryCode}` : 'https://api.whatsapp.com/send';
  return `${base}?text=${encodeURIComponent(text)}`;
}

/**
 * Parses and coerces a dictionary of { [productId: number]: qty: number } safely,
 * converting numeric keys and string values to standard numbers.
 */
export function parseJsonDict(val: any): Record<number, number> {
  if (!val) return {};
  let parsed = val;
  if (typeof val === 'string') {
    try {
      parsed = JSON.parse(val);
    } catch {
      return {};
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const res: Record<number, number> = {};
  for (const [k, v] of Object.entries(parsed)) {
    const numK = Number(k);
    const numV = Number(v);
    if (!isNaN(numK) && numK > 0) {
      res[numK] = isNaN(numV) ? 0 : numV;
    }
  }
  return res;
}

/**
 * Parses an array of bill IDs safely from JSON string or raw array, coercing to number[].
 */
export function parseBillIds(val: any): number[] {
  if (!val) return [];
  let parsed = val;
  if (typeof val === 'string') {
    try {
      parsed = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((x) => Number(x)).filter((x) => !isNaN(x));
}

/**
 * Normalizes any Trip record from remote DB, JSON API, or local storage into a consistent Trip structure.
 * Crucially:
 * - If status is 'out' (ongoing or reopened trip), 'returned' is empty because crates are live in the van.
 * - Product IDs in 'loaded' and 'returned' are coerced to numbers.
 * - Bill IDs are coerced to numbers.
 */
/** What the salesman still owes from this trip's cash shortfall (0 when none was booked, repaid or written off). */
export function tripCashDue(t: Pick<Trip, 'status' | 'cashShortBooked' | 'cashRecoveries' | 'cashShortWrittenOff'>): number {
  if (t.status !== 'closed' || !(Number(t.cashShortBooked) > 0) || t.cashShortWrittenOff) return 0;
  const paid = (t.cashRecoveries || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  return Math.max(0, Math.round((Number(t.cashShortBooked) - paid) * 100) / 100);
}

export function normalizeTrip(raw: any): Trip {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 1,
      vehicle: 'Delivery Van',
      date: todayISO(),
      loaded: {},
      returned: {},
      billIds: [],
      status: 'out',
    };
  }

  const loaded = parseJsonDict(raw.loaded);
  const status: TripStatus = raw.status === 'closed' ? 'closed' : 'out';
  // If trip is 'out' (reopened or out for delivery), goods are active in the van; returns do not subtract
  const returned = status === 'closed' ? parseJsonDict(raw.returned) : {};
  const rawBillIds = raw.billIds ?? raw.bill_ids;
  const billIds = parseBillIds(rawBillIds);

  let warehouseLoads: Record<string, Record<number, number>> | undefined = undefined;
  const rawWhLoads = raw.warehouseLoads ?? raw.warehouse_loads;
  if (rawWhLoads) {
    let parsedWh: any = rawWhLoads;
    if (typeof rawWhLoads === 'string') {
      try {
        parsedWh = JSON.parse(rawWhLoads);
      } catch {
        parsedWh = null;
      }
    }
    if (parsedWh && typeof parsedWh === 'object' && !Array.isArray(parsedWh)) {
      warehouseLoads = {};
      for (const [whId, pMap] of Object.entries(parsedWh)) {
        if (pMap && typeof pMap === 'object') {
          warehouseLoads[whId] = parseJsonDict(pMap);
        }
      }
    }
  }

  // If the trip has no total for a product but warehouseLoads does, the van total is the SUM over
  // all godowns it was loaded from (older code only kept the first godown's crates).
  if (warehouseLoads) {
    const sums: Record<number, number> = {};
    for (const pMap of Object.values(warehouseLoads)) {
      for (const [pidStr, qty] of Object.entries(pMap)) {
        const pid = Number(pidStr);
        sums[pid] = (sums[pid] || 0) + (Number(qty) || 0);
      }
    }
    for (const [pidStr, sum] of Object.entries(sums)) {
      const pid = Number(pidStr);
      if (!(Number(loaded[pid]) > 0)) loaded[pid] = sum;
    }
  }

  // Drafts only exist while the trip is open; closing a trip turns them into `returned`.
  const draftReturned = status === 'out' ? parseJsonDict(raw.draftReturned ?? raw.draft_returned) : {};
  let cashRecoveries: NonNullable<Trip['cashRecoveries']> = [];
  {
    let rec: any = raw.cashRecoveries ?? raw.cash_recoveries;
    if (typeof rec === 'string') {
      try {
        rec = JSON.parse(rec);
      } catch {
        rec = [];
      }
    }
    if (Array.isArray(rec)) {
      cashRecoveries = rec
        .filter((r: any) => r && Number(r.amount) > 0)
        .map((r: any) => ({
          id: String(r.id || `rec_${Math.random().toString(36).slice(2, 10)}`),
          date: String(r.date || '').slice(0, 10),
          amount: Number(r.amount),
          ...(r.note ? { note: String(r.note) } : {}),
        }));
    }
  }
  let shortageReasons: Trip['shortageReasons'] = undefined;
  let rawReasons: any = raw.shortageReasons ?? raw.shortage_reasons;
  if (typeof rawReasons === 'string') {
    try {
      rawReasons = JSON.parse(rawReasons);
    } catch {
      rawReasons = null;
    }
  }
  if (rawReasons && typeof rawReasons === 'object' && !Array.isArray(rawReasons)) {
    const okReasons = ['broken', 'short_loaded', 'sold_not_billed', 'other'];
    const out: NonNullable<Trip['shortageReasons']> = {};
    for (const [pidStr, e] of Object.entries<any>(rawReasons)) {
      const pid = Number(pidStr);
      if (!pid || !e || !okReasons.includes(e.reason)) continue;
      out[pid] = {
        reason: e.reason,
        qty: Number(e.qty) || 0,
        note: e.note ? String(e.note) : undefined,
        dispositionId: e.dispositionId ? String(e.dispositionId) : undefined,
      };
    }
    if (Object.keys(out).length > 0) shortageReasons = out;
  }

  return {
    id: Number(raw.id) || Date.now(),
    vehicle: String(raw.vehicle || ''),
    salesman: raw.salesman || '',
    salesmanId: raw.salesmanId || raw.salesman_id || undefined,
    route: raw.route || undefined,
    driver: raw.driver || undefined,
    date: raw.date || todayISO(),
    loaded,
    returned,
    billIds,
    status,
    warehouseId: raw.warehouseId || raw.warehouse_id || '',
    warehouseLoads,
    ...(shortageReasons ? { shortageReasons } : {}),
    ...(raw.updatedAt || raw.updated_at ? { updatedAt: String(raw.updatedAt || raw.updated_at) } : {}),
    ...(Number(raw.cashShortBooked ?? raw.cash_short_booked) > 0
      ? { cashShortBooked: Number(raw.cashShortBooked ?? raw.cash_short_booked) }
      : {}),
    ...(cashRecoveries.length > 0 ? { cashRecoveries } : {}),
    ...((raw.cashShortWrittenOff ?? raw.cash_short_written_off) === true ? { cashShortWrittenOff: true } : {}),
    ...(Number.isFinite(Number(raw.cashHandedIn ?? raw.cash_handed_in)) && (raw.cashHandedIn ?? raw.cash_handed_in) !== null && (raw.cashHandedIn ?? raw.cash_handed_in) !== ''
      ? { cashHandedIn: Number(raw.cashHandedIn ?? raw.cash_handed_in) }
      : {}),
    ...(status === 'out' && Object.keys(draftReturned).length > 0 ? { draftReturned } : {}),
  };
}



/** Display values for invoice: free / scheme lines as 100% discount or free stock. */
export function freeStockInvoiceDisplay(it: {
  qty: number;
  rate: number;
  gross?: number;
  discount?: number;
  amount?: number;
  freeQty?: number;
  isBundleFreeItem?: boolean;
  promoLabel?: string | null;
}) {
  const rate = Number(it.rate) || 0;
  const qty = Number(it.qty) || 0;
  const freeQty = Number(it.freeQty) || 0;
  const isFreeLine = !!it.isBundleFreeItem || (qty > 0 && Number(it.amount) === 0 && freeQty >= qty);
  const notionalGross = Number(it.gross) > 0 ? Number(it.gross) : rate * Math.max(qty, freeQty || qty);
  const storedDiscount = Number(it.discount) || 0;

  if (isFreeLine || it.isBundleFreeItem) {
    const gross = notionalGross > 0 ? notionalGross : rate * qty;
    return {
      isFreeStock: true as const,
      label: 'FREE STOCK · 100% scheme discount',
      shortLabel: '100% FREE',
      qtyLabel: String(qty || freeQty || 0),
      freeLabel: String(qty || freeQty || 0),
      rate,
      gross,
      discount: gross,
      discountLabel: '100%',
      amount: 0,
      schemeNote: it.promoLabel || 'Scheme free issue',
    };
  }

  if (freeQty > 0) {
    const freeValue = rate * freeQty;
    const gross = Number(it.gross) > 0 ? Number(it.gross) : rate * qty;
    const discount = storedDiscount > 0 ? storedDiscount : freeValue;
    const chargeableQty = Math.max(0, qty - freeQty);
    return {
      isFreeStock: false as const,
      label: `Includes ${freeQty} free in total ${qty} crates (${chargeableQty} billed + ${freeQty} free)`,
      shortLabel: `${freeQty} FREE (INCL.)`,
      qtyLabel: String(qty),
      freeLabel: `${freeQty} incl.`,
      rate,
      gross,
      discount,
      discountLabel: discount > 0 ? `−₹` : '—',
      amount: Number(it.amount) || 0,
      schemeNote: it.promoLabel
        ? it.promoLabel.replace(/\+([0-9]+)\s*(?:extra\s*)?free(?:\s*crates)?/gi, '$1 free incl.')
        : `Includes ${freeQty} free in ${qty} cs`,
    };
  }

  const gross = Number(it.gross) > 0 ? Number(it.gross) : rate * qty;
  return {
    isFreeStock: false as const,
    label: '',
    shortLabel: '',
    qtyLabel: String(qty),
    freeLabel: '—',
    rate,
    gross,
    discount: storedDiscount,
    discountLabel: storedDiscount > 0 ? '−₹' : '—',
    amount: Number(it.amount) || 0,
    schemeNote: it.promoLabel || '',
  };
}

/**
 * Does this bill count against this trip's load sheet?
 * A bill that carries a tripId belongs ONLY to that trip. A bill with no tripId belongs to the
 * trip(s) that list it in billIds. (Counting "tripId matches OR listed in billIds" let one bill
 * hit two trips' sold totals, which showed up as false load/sold/return discrepancies.)
 */
export function billBelongsToTrip(
  trip: Pick<Trip, 'id' | 'billIds'>,
  bill: { id: number; tripId?: number | null },
): boolean {
  if (bill.tripId != null && Number(bill.tripId) > 0) {
    return Number(bill.tripId) === Number(trip.id);
  }
  return (Array.isArray(trip.billIds) ? trip.billIds : [])
    .map(Number)
    .includes(Number(bill.id));
}

/**
 * Bills that may be auto-attached to a trip by date: same day, not already on another trip, and
 * (when both sides say so) the same salesman and the same van. Without this, "attach today's
 * bills" pulled in every other salesman's bills and inflated this trip's sold quantities.
 */
export function attachableBillsForTrip<
  B extends { id: number; date: string; tripId?: number | null; salesmanId?: string; vehicle?: string },
>(
  trip: { id?: number; date: string; salesmanId?: string; vehicle?: string },
  bills: B[],
  allTrips: Pick<Trip, 'id' | 'billIds'>[],
): B[] {
  const onOtherTrip = new Set<number>();
  for (const t of allTrips) {
    if (trip.id != null && Number(t.id) === Number(trip.id)) continue;
    for (const id of t.billIds || []) onOtherTrip.add(Number(id));
  }
  const norm = (v?: string) => (v || '').trim().toLowerCase();
  return bills.filter((b) => {
    if (b.date !== trip.date) return false;
    if (b.tripId != null && Number(b.tripId) > 0 && Number(b.tripId) !== Number(trip.id ?? -1)) return false;
    if (onOtherTrip.has(Number(b.id))) return false;
    // A bill with no salesman AND no van is a warehouse / counter sale (the billing screen only
    // stamps those fields for van sales). It must never be pulled onto a trip just because the
    // date matches, otherwise the trip shows crates "sold" that never left the godown.
    const belongsByStamp = b.tripId != null && Number(b.tripId) > 0 && Number(b.tripId) === Number(trip.id ?? -1);
    if (!belongsByStamp && !b.salesmanId && !norm(b.vehicle)) return false;
    if (trip.salesmanId && b.salesmanId && trip.salesmanId !== b.salesmanId) return false;
    if (norm(trip.vehicle) && norm(b.vehicle) && norm(trip.vehicle) !== norm(b.vehicle)) return false;
    return true;
  });
}
