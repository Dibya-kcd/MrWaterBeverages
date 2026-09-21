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
} from '../types';
import { CATS } from '../constants/initialData';

export const money = (n: number): string =>
  (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Generates an industry-standard unique Batch/Lot number.
 * Can incorporate scheme codes like 'B2G1' (Buy 2 Get 1 Free) or 'DISC' (Discount).
 */
export function generateBatchNumber(productName?: string, schemeCode?: string): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yy}${mm}${dd}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();

  const cleanName = (productName || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase() || 'LOT';

  if (schemeCode) {
    const cleanScheme = schemeCode.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
    return `LOT-${cleanScheme}-${cleanName}-${datePart}-${rand}`;
  }

  return `LOT-${cleanName}-${datePart}-${rand}`;
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
  // Hard-locked: In FMCG beverage distribution, the printed invoice case count is strictly
  // the total physically received cases (e.g. 150 cases = 100 paid + 50 free).
  // "Additive" mode (+bonus on top) is permanently disabled to prevent inflating godown stock.
  const schemeMode: GrnSchemeMode = 'inclusive';
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
    // FMCG Industry Standard: "Buy X Get Y Free" within invoiced quantity.
    // e.g. Buy 2 Get 1 Free on 150 units -> group = 2 + 1 = 3 -> 50 free units, 100 paid units.
    // The supplier bills for 150 units and provides a discount credit for the 50 free units (50 * unitPrice).
    const cycle = schemeBuyQty + schemeFreeQty;

    if (params.freeQty !== undefined && params.freeQty !== null && Number(params.freeQty) >= 0) {
      freeQty = Math.max(0, Number(params.freeQty));
    } else {
      freeQty = cycle > 0 ? Math.floor(qty / cycle) * schemeFreeQty : 0;
    }
    // Hard-locked: Free crates are always inside the billed quantity
    paidQty = Math.max(0, qty - freeQty);
    totalReceivedQty = qty; // Exactly equal to invoiced/printed case count
    discountAmount =
      params.discountAmount !== undefined && params.discountAmount !== null && Number(params.discountAmount) >= 0
        ? Math.max(0, Number(params.discountAmount))
        : freeQty * unitPrice;
    schemeLabel = `Buy ${schemeBuyQty} Get ${schemeFreeQty} Free (${freeQty} Free of ${qty} cs · ${paidQty} Paid)`;
  } else if (schemeType === 'free_cases') {
    freeQty = Math.max(0, Number(params.freeQty) || 0);
    // Hard-locked: Free crates are part of the billed quantity
    paidQty = Math.max(0, qty - freeQty);
    totalReceivedQty = qty; // Strictly inclusive within invoiced quantity
    discountAmount =
      params.discountAmount !== undefined && params.discountAmount !== null
        ? Math.max(0, Number(params.discountAmount))
        : freeQty * unitPrice;
    schemeLabel = `${freeQty} Free Crates of ${qty} (${paidQty} Paid · Scheme Discount)`;
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
  const taxableAmount = Math.max(0, baseGross - discountAmount);
  const cgstAmount = (taxableAmount * cgstPercent) / 100;
  const sgstAmount = (taxableAmount * sgstPercent) / 100;
  const taxAmount = cgstAmount + sgstAmount;
  const lineTotal = taxableAmount + taxAmount;

  // Effective Scheme-Adjusted Purchase Cost (pre-inward godown expenses)
  const effectiveCostPerCrateExGst =
    totalReceivedQty > 0 ? taxableAmount / totalReceivedQty : invoiceRateExGst;
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
  freeQty: number;
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
 * Computes taxable value, CGST Rate/Amt and SGST Rate/Amt for a product.
 * In India, total GST is split 50/50 between CGST and SGST.
 */
export function computeProductGstBreakdown(
  productRate: number,
  categoryOrCustomGst?: number,
  customHsn?: string,
  categoryKey?: CategoryKey
): GstBreakdown {
  const gst =
    categoryOrCustomGst !== undefined
      ? categoryOrCustomGst
      : categoryKey && CATS[categoryKey]
      ? CATS[categoryKey].gst
      : 0.18;

  const hsn =
    customHsn ||
    (categoryKey && CATS[categoryKey] ? CATS[categoryKey].hsn : '2202');

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

export function schemeLabel(promo?: Promotion | null): string | null {
  if (!promo) return null;
  if (promo.type === 'bogo') return `Buy ${promo.buyQty} Get ${promo.freeQty} Free`;
  if (promo.type === 'percent') return `${promo.percent}% off`;
  if (promo.type === 'flat') return `₹${promo.flatPerCase} off/case`;
  return null;
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
      const group = promo.buyQty + promo.freeQty;
      const fullGroups = Math.floor(qty / group);
      freeQty = fullGroups * promo.freeQty;
      discount = freeQty * rate;
    } else if (promo.type === 'percent') {
      discount = gross * (promo.percent / 100);
    } else if (promo.type === 'flat') {
      discount = qty * promo.flatPerCase;
    }
  }

  if (customDiscount !== undefined && customDiscount !== null && Number(customDiscount) > 0) {
    discount += Number(customDiscount);
  }

  const chargeableQty = qty - freeQty;
  const amount = Math.max(0, gross - discount);

  return { rate, gross, freeQty, chargeableQty, discount, amount };
}

export function billTotals(
  items: BillItem[],
  gstMode: GstMode = 'inclusive',
  additionalDiscount: number = 0
): BillTotals {
  const gross = items.reduce((s, i) => s + i.amount, 0);
  const lineDiscount = items.reduce((s, i) => s + i.discount, 0);
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

  if (gstMode === 'inclusive') {
    let tax = 0;
    for (const i of items) {
      tax += i.amount - i.amount / (1 + i.gst);
    }
    const taxFactor = gross > 0 ? effectiveGross / gross : 1;
    const effectiveTax = tax * taxFactor;
    const cgst = effectiveTax / 2;
    const sgst = effectiveTax / 2;
    return {
      subtotal: effectiveGross - effectiveTax,
      cgst,
      sgst,
      total: effectiveGross,
      discount,
      additionalDiscount: extraDisc,
    };
  }

  // exclusive
  const cgst = items.reduce((s, i) => s + i.amount * (i.gst / 2), 0);
  const sgst = cgst;
  const rawTotal = gross + cgst + sgst;
  const effectiveTotal = Math.max(0, rawTotal - extraDisc);
  return {
    subtotal: gross,
    cgst,
    sgst,
    total: effectiveTotal,
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

function formatMonospaceReceipt(bill: Bill): string {
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
    let name = it.productName || 'Item';
    if (name.length > colItem) {
      name = name.slice(0, colItem - 1) + '…';
    } else {
      name = name.padEnd(colItem);
    }
    const qtyStr = String(it.qty).padStart(colQty);
    const rateStr = String(Math.round(it.rate)).padStart(colRate);
    const amtStr = String(Math.round(it.amount)).padStart(colAmt);

    lines.push(`${name} ${qtyStr} ${rateStr} ${amtStr}`);
    if (it.freeQty > 0) {
      lines.push(` ↳ +${it.freeQty} Free Case${it.freeQty === 1 ? '' : 's'}`);
    }
    if (it.discount > 0 && it.freeQty === 0) {
      lines.push(` ↳ Save Rs ${Math.round(it.discount)}`);
    }
  });

  lines.push(divLine);

  const formatSummaryRow = (label: string, val: string) => {
    const paddedLabel = label.padEnd(16);
    const paddedVal = val.padStart(totalWidth - 16);
    return `${paddedLabel}${paddedVal}`;
  };

  lines.push(formatSummaryRow('Gross Subtotal:', `Rs ${money(bill.subtotal)}`));
  if (bill.additionalDiscount && bill.additionalDiscount > 0) {
    lines.push(formatSummaryRow('Special Discount:', `-Rs ${money(bill.additionalDiscount)}`));
  }
  if (bill.discount > (bill.additionalDiscount || 0)) {
    lines.push(formatSummaryRow('Scheme Savings:', `-Rs ${money(bill.discount - (bill.additionalDiscount || 0))}`));
  }
  if (bill.cgst > 0 || bill.sgst > 0) {
    lines.push(formatSummaryRow('CGST (6%):', `Rs ${money(bill.cgst)}`));
    lines.push(formatSummaryRow('SGST (6%):', `Rs ${money(bill.sgst)}`));
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
  settings?: BillingSettings
): string {
  const st = statusOf(bill.total, bill.amountPaid);
  const invoicePrefix = settings?.invoicePrefix || 'INV';
  const billNo = `${invoicePrefix}-${bill.id}`;

  const orgName = org?.name || 'RADHIKA BEVERAGES';
  const orgTagline = org?.tagline || 'Authorized Wholesale Beverage Distributor';
  const orgPhone = org?.phone || '+91 98765 43210';
  const orgGstin = org?.gstin || '24AAACR1234F1Z8';

  const out: string[] = [];

  out.push(`🧾 *TAX INVOICE — ${orgName.toUpperCase()}*`);
  if (orgTagline) out.push(`_${orgTagline}_`);
  if (org?.address) out.push(`📍 ${org.address}${org.city ? `, ${org.city}` : ''}`);
  out.push(`📞 ${orgPhone} | GSTIN: ${orgGstin}`);
  out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━');
  out.push(`📄 *Invoice:* #${billNo}`);
  out.push(`📅 *Date:* ${bill.date}`);
  out.push(`👤 *Billed To:* *${(bill.retailer || 'Cash Retailer').toUpperCase()}*`);
  if (bill.phone) out.push(`📱 *Party Contact:* ${bill.phone}`);
  out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Monospace aligned receipt table
  out.push(formatMonospaceReceipt(bill));

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
