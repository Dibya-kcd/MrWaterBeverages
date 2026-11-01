/**
 * invoiceAiValidation.ts
 *
 * Pure, dependency-free helpers that turn the raw JSON an AI vision model returns for a
 * supplier invoice into clean, internally-consistent data, and that CHECK the result
 * against the invoice's own arithmetic (qty x rate = amount, sum of rows = grand total,
 * sum of cases = printed total cases, GSTIN checksum, ...).
 *
 * It is imported by both the server (invoiceAi.ts) and the browser (invoiceParser.ts),
 * so it must stay free of imports.
 */

export type IssueLevel = 'info' | 'warn' | 'error';

export interface AiIssue {
  level: IssueLevel;
  code: string;
  message: string;
  /** 1-based line number in the invoice table, when the issue is about one row */
  line?: number;
}

export interface AiItem {
  rawName: string;
  productName: string;
  category: string;
  pack: string;
  volume: number;
  hsn: string;
  /** TOTAL cases received for the row, INCLUDING free cases (app convention: inclusive) */
  qty: number;
  /** free cases, always a subset of qty */
  freeQty: number;
  /** rate per CASE, before tax */
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  /** null = not printed (caller should fall back to the HSN default) */
  cgstPercent: number | null;
  sgstPercent: number | null;
  schemeDescription: string;
  /** row amount including GST (derived when the invoice only printed taxable value) */
  lineTotal: number;
  batchNumber: string;
  expiryDate: string;
  mfgDate: string;
  unitsPerCase: number | null;
  /** true = row arithmetic agrees with printed amount, false = it does not, null = unknown */
  reconciled: boolean | null;
}

export interface AiInvoice {
  supplierName: string;
  supplierGstin: string;
  supplierAddress: string;
  supplierPhone: string;
  supplierEmail: string;
  buyerGstin: string;
  invoiceNo: string;
  invoiceDate: string;
  vehicleNo: string;
  placeOfSupply: string;
  billedTo: string;
  shippedTo: string;
  overallDiscount: number;
  roundOff: number;
  otherCharges: number;
  grandTotal: number;
  totalCases: number;
  items: AiItem[];
}

export interface NormalizeResult {
  invoice: AiInvoice;
  issues: AiIssue[];
}

export interface ValidationResult {
  issues: AiIssue[];
  /** true when a second, focused look at the document is likely to fix something */
  needsRepair: boolean;
  /** lower is better; used to decide whether the repaired result beats the first one */
  score: number;
}

/* ------------------------------------------------------------------------------------ */
/* primitives                                                                            */
/* ------------------------------------------------------------------------------------ */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** "₹ 1,23,456.50", "Rs. 12,000/-", "(250.00)" -> number. Returns fallback when not numeric. */
export function toNumber(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  let s = String(v).trim();
  if (!s) return fallback;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  // drop currency markers first so the "." in "Rs." is not mistaken for a decimal point
  s = s.replace(/₹|\brs\b\.?|\binr\b|\/-/gi, ' ').replace(/[^0-9.]/g, '');
  if (!s) return fallback;
  // keep only the first decimal point
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return fallback;
  return negative ? -n : n;
}

/** like toNumber but keeps "not printed" as null */
export function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = toNumber(v, NaN);
  return Number.isFinite(n) ? n : null;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);
const lastDayOfMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  return d <= lastDayOfMonth(y, m);
}

/** Any common Indian invoice date format -> YYYY-MM-DD, or '' when it cannot be read. */
export function normalizeDate(v: unknown): string {
  const s = str(v);
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return validYmd(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : '';
  }
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/);
  if (m) {
    const [d, mo, y] = [+m[1], +m[2], fullYear(+m[3])];
    return validYmd(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : '';
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[-/. ]+([A-Za-z]{3,9})[-/. ,]+(\d{2,4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const [d, mo, y] = [+m[1], MONTHS[m[2].toLowerCase()], fullYear(+m[3])];
    return validYmd(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : '';
  }
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const [mo, d, y] = [MONTHS[m[1].toLowerCase()], +m[2], fullYear(+m[3])];
    return validYmd(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : '';
  }
  return '';
}

/** Expiry may be printed as "03/2027" or "Mar-27": that means the LAST day of the month. */
export function normalizeExpiry(v: unknown): string {
  const full = normalizeDate(v);
  if (full) return full;
  const s = str(v);
  if (!s) return '';
  let m = s.match(/^(\d{1,2})[-/. ](\d{2,4})$/);
  if (m) {
    const [mo, y] = [+m[1], fullYear(+m[2])];
    return mo >= 1 && mo <= 12 && y >= 1990 && y <= 2100 ? `${y}-${pad2(mo)}-${pad2(lastDayOfMonth(y, mo))}` : '';
  }
  m = s.match(/^([A-Za-z]{3,9})[-/. ,]+(\d{2,4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const [mo, y] = [MONTHS[m[1].toLowerCase()], fullYear(+m[2])];
    return `${y}-${pad2(mo)}-${pad2(lastDayOfMonth(y, mo))}`;
  }
  return '';
}

/* ------------------------------------------------------------------------------------ */
/* GSTIN                                                                                 */
/* ------------------------------------------------------------------------------------ */

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i]);
    if (v < 0) return '';
    const prod = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

/** Format AND checksum. A single misread character (O/0, 8/B, 5/S ...) fails the checksum. */
export function isValidGstin(g: string): boolean {
  const s = (g || '').trim().toUpperCase();
  if (!GSTIN_FORMAT.test(s)) return false;
  return gstinCheckChar(s.slice(0, 14)) === s[14];
}

const CONFUSABLE: Record<string, string[]> = {
  '0': ['O', 'D', 'Q'], O: ['0'], D: ['0'], Q: ['0'],
  '1': ['I', 'L'], I: ['1'], L: ['1'],
  '2': ['Z'], Z: ['2'],
  '5': ['S'], S: ['5'],
  '6': ['G'], G: ['6'],
  '8': ['B'], B: ['8'],
  '4': ['A'], A: ['4'],
};

/** Tries every single-character confusable swap; returns a repaired GSTIN only if EXACTLY one passes. */
export function repairGstin(raw: string): string | null {
  const s = (raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (s.length !== 15) return null;
  if (isValidGstin(s)) return s;
  const hits = new Set<string>();
  for (let i = 0; i < 15; i++) {
    for (const alt of CONFUSABLE[s[i]] || []) {
      const cand = s.slice(0, i) + alt + s.slice(i + 1);
      if (isValidGstin(cand)) hits.add(cand);
    }
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/* ------------------------------------------------------------------------------------ */
/* normalisation                                                                         */
/* ------------------------------------------------------------------------------------ */

const VALID_GST_TOTALS = [0, 0.25, 1.5, 3, 5, 12, 18, 28, 40];
const NON_PRODUCT_ROW =
  /^(sub\s*-?\s*total|total|grand\s*total|net\s*(amount|payable)|round(ing)?\s*-?\s*off|freight|cartage|transport(ation)?|packing|loading|unloading|tcs|tds|cess|cgst|sgst|igst|less\b|add\b|discount|trade\s*disc|cash\s*disc|scheme\s*disc|amount\s*in\s*words|bank|terms)/i;

const CATEGORIES = ['energy', 'vibe', 'joos', 'water', 'general'];

function nearly(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

export function normalizeAiInvoice(raw: any): NormalizeResult {
  const issues: AiIssue[] = [];
  const r = raw && typeof raw === 'object' ? raw : {};

  /* ---- header ---- */
  let supplierGstin = str(r.supplierGstin).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (supplierGstin && !isValidGstin(supplierGstin)) {
    const fixed = repairGstin(supplierGstin);
    if (fixed) {
      issues.push({
        level: 'info',
        code: 'gstin_repaired',
        message: `Supplier GSTIN was misread (${supplierGstin}); corrected to ${fixed} using the GSTIN checksum.`,
      });
      supplierGstin = fixed;
    } else {
      issues.push({
        level: 'warn',
        code: 'gstin_invalid',
        message: `Supplier GSTIN "${supplierGstin}" fails the GSTIN checksum - please verify it against the invoice.`,
      });
    }
  }
  let buyerGstin = str(r.buyerGstin).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (buyerGstin && !isValidGstin(buyerGstin)) buyerGstin = repairGstin(buyerGstin) || buyerGstin;

  const invoiceDate = normalizeDate(r.invoiceDate);
  if (!invoiceDate) {
    issues.push({ level: 'warn', code: 'date_missing', message: 'Invoice date could not be read - please set it.' });
  } else {
    const t = new Date(invoiceDate + 'T00:00:00').getTime();
    const now = Date.now();
    if (t > now + 2 * 86400000) {
      issues.push({ level: 'warn', code: 'date_future', message: `Invoice date ${invoiceDate} is in the future - check day/month order.` });
    } else if (t < now - 800 * 86400000) {
      issues.push({ level: 'warn', code: 'date_old', message: `Invoice date ${invoiceDate} is over two years old - check the year.` });
    }
  }

  const header = {
    supplierName: str(r.supplierName),
    supplierGstin,
    supplierAddress: str(r.supplierAddress),
    supplierPhone: str(r.supplierPhone),
    supplierEmail: str(r.supplierEmail),
    buyerGstin,
    invoiceNo: str(r.invoiceNo),
    invoiceDate,
    vehicleNo: str(r.vehicleNo).replace(/\s+/g, '').toUpperCase(),
    placeOfSupply: str(r.placeOfSupply),
    billedTo: str(r.billedTo),
    shippedTo: str(r.shippedTo),
    overallDiscount: Math.abs(toNumber(r.overallDiscount)),
    roundOff: toNumber(r.roundOff),
    otherCharges: toNumber(r.otherCharges),
    grandTotal: Math.abs(toNumber(r.grandTotal)),
    totalCases: Math.abs(toNumber(r.totalCases)),
  };

  if (!header.supplierName) issues.push({ level: 'warn', code: 'supplier_missing', message: 'Supplier name was not found on the invoice.' });
  if (!header.invoiceNo) issues.push({ level: 'warn', code: 'invoice_no_missing', message: 'Invoice number was not found.' });

  /* ---- rows ---- */
  const rawItems: any[] = Array.isArray(r.items) ? r.items : [];
  const items: AiItem[] = [];

  rawItems.forEach((it, idx) => {
    const rawName = str(it?.rawName || it?.productName);
    if (!rawName) return;
    if (NON_PRODUCT_ROW.test(rawName)) {
      issues.push({ level: 'info', code: 'non_product_row', message: `Ignored non-product row "${rawName}".` });
      return;
    }
    const line = items.length + 1;

    let qty = toNumber(it.qty);
    let free = Math.max(0, toNumber(it.freeQty));
    let rate = Math.abs(toNumber(it.unitPrice));
    const upcRaw = toNumber(it.unitsPerCase);
    const unitsPerCase = upcRaw > 1 ? Math.round(upcRaw) : null;

    // quantities / rates quoted per piece -> convert to cases
    if (String(it.qtyUnit).toLowerCase() === 'pcs' && unitsPerCase) {
      qty = round2(qty / unitsPerCase);
      free = round2(free / unitsPerCase);
      if (!Number.isInteger(qty)) {
        issues.push({ level: 'warn', code: 'qty_fractional', line, message: `Line ${line} (${rawName}): quantity converts to ${qty} cases - check pieces per case (${unitsPerCase}).` });
      }
    }
    if (String(it.rateUnit).toLowerCase() === 'pcs' && unitsPerCase) rate = round2(rate * unitsPerCase);

    // free cases printed as a separate column ON TOP of the billed quantity
    if (free > 0 && it.freeIncludedInQty === false) {
      qty = round2(qty + free);
      issues.push({ level: 'info', code: 'free_added', line, message: `Line ${line} (${rawName}): free cases were a separate column - total ${qty} cs incl. ${free} free.` });
    } else if (free > qty) {
      qty = round2(qty + free);
      issues.push({ level: 'info', code: 'free_added', line, message: `Line ${line} (${rawName}): free cases exceeded quantity, so they were treated as extra - total ${qty} cs.` });
    }

    // discount that merely restates the value of the free cases would be counted twice
    let discAmt = Math.abs(toNumber(it.discountAmount));
    const discPct = Math.abs(toNumber(it.discountPercent));
    if (free > 0 && rate > 0 && discAmt > 0 && nearly(discAmt, free * rate, Math.max(1, 0.01 * discAmt))) {
      issues.push({ level: 'info', code: 'free_as_discount', line, message: `Line ${line} (${rawName}): the printed discount equals the value of the free cases, so it was not counted twice.` });
      discAmt = 0;
    }

    // taxes
    let cg = toNullableNumber(it.cgstPercent);
    let sg = toNullableNumber(it.sgstPercent);
    const ig = toNullableNumber(it.igstPercent);
    if (cg === null && sg === null && ig !== null && ig > 0) {
      cg = ig / 2;
      sg = ig / 2;
    } else if (cg === null && sg !== null) cg = sg;
    else if (sg === null && cg !== null) sg = cg;
    if (cg !== null && sg !== null) {
      const total = cg + sg;
      if (!VALID_GST_TOTALS.some((t) => nearly(t, total, 0.01))) {
        issues.push({ level: 'warn', code: 'tax_unusual', line, message: `Line ${line} (${rawName}): GST ${total}% is not a standard slab - check the CGST/SGST columns.` });
      }
    }
    const taxFrac = cg !== null && sg !== null ? (cg + sg) / 100 : 0;

    let printed = Math.abs(toNumber(it.lineTotal));

    // derive a missing rate from the printed amount
    if (rate === 0 && printed > 0 && qty - free > 0 && cg !== null) {
      rate = round2((printed / (1 + taxFrac) + discAmt) / (qty - free));
      issues.push({ level: 'warn', code: 'rate_derived', line, message: `Line ${line} (${rawName}): rate was not readable; derived ₹${rate}/case from the amount.` });
    }

    if (discAmt === 0 && discPct > 0 && rate > 0) discAmt = round2((qty - free) * rate * discPct / 100);

    // arithmetic check: qty x rate - discount (+ tax) must equal the printed amount
    const tol = Math.max(1.5, 0.004 * printed);
    const agrees = (taxable: number) => nearly(printed, taxable, tol) || nearly(printed, taxable * (1 + taxFrac), tol);
    let reconciled: boolean | null = null;

    if (printed > 0 && rate > 0) {
      let taxableA = (qty - free) * rate - discAmt; // free cases included in qty
      if (agrees(taxableA)) {
        reconciled = true;
      } else if (free > 0 && it.freeIncludedInQty !== true && agrees(qty * rate - discAmt)) {
        // amount only matches if free cases were ON TOP of the printed quantity
        qty = round2(qty + free);
        taxableA = (qty - free) * rate - discAmt;
        reconciled = true;
        issues.push({ level: 'info', code: 'free_added_by_amount', line, message: `Line ${line} (${rawName}): the amount only reconciles when ${free} free cases are on top of the billed quantity - total set to ${qty} cs.` });
      } else {
        reconciled = false;
        issues.push({
          level: 'warn',
          code: 'line_mismatch',
          line,
          message: `Line ${line} (${rawName}): ${qty - free} cs x ₹${rate}${discAmt ? ` - ₹${round2(discAmt)}` : ''} does not match printed amount ₹${printed}. Check qty, rate or free cases.`,
        });
      }
      // if only the taxable value was printed, store the tax-inclusive amount
      if (reconciled && taxFrac > 0 && nearly(printed, taxableA, tol) && !nearly(printed, taxableA * (1 + taxFrac), tol)) {
        printed = round2(taxableA * (1 + taxFrac));
      }
    } else if (rate === 0) {
      issues.push({ level: 'warn', code: 'rate_missing', line, message: `Line ${line} (${rawName}): rate is missing - please enter it.` });
    }

    if (!(qty > 0)) {
      issues.push({ level: 'warn', code: 'qty_missing', line, message: `Line ${line} (${rawName}): quantity could not be read.` });
    }

    const category = CATEGORIES.includes(str(it.category).toLowerCase()) ? str(it.category).toLowerCase() : '';

    items.push({
      rawName,
      productName: str(it.productName) || rawName,
      category,
      pack: str(it.pack),
      volume: Math.max(0, toNumber(it.volume)),
      hsn: str(it.hsn).replace(/[^0-9]/g, ''),
      qty,
      freeQty: Math.min(free, qty),
      unitPrice: rate,
      discountPercent: discPct,
      discountAmount: round2(discAmt),
      cgstPercent: cg,
      sgstPercent: sg,
      schemeDescription: str(it.schemeDescription),
      lineTotal: printed > 0 ? round2(printed) : round2(((qty - free) * rate - discAmt) * (1 + taxFrac)),
      batchNumber: str(it.batchNumber),
      expiryDate: normalizeExpiry(it.expiryDate),
      mfgDate: normalizeDate(it.mfgDate),
      unitsPerCase,
      reconciled,
    });
  });

  return { invoice: { ...header, items }, issues };
}

/* ------------------------------------------------------------------------------------ */
/* whole-invoice validation                                                              */
/* ------------------------------------------------------------------------------------ */

export function validateInvoice(inv: AiInvoice, carriedIssues: AiIssue[] = []): ValidationResult {
  const issues: AiIssue[] = [...carriedIssues];
  let needsRepair = false;

  if (inv.items.length === 0) {
    issues.push({ level: 'error', code: 'no_items', message: 'No line items were found in the document.' });
    needsRepair = true;
  }

  if (inv.supplierGstin && inv.buyerGstin && inv.supplierGstin === inv.buyerGstin) {
    issues.push({ level: 'error', code: 'parties_swapped', message: 'Supplier and buyer GSTIN are identical - supplier and buyer may have been swapped.' });
    needsRepair = true;
  }

  // missed / duplicated rows: compare with the invoice's printed total of cases
  const sumQty = round2(inv.items.reduce((s, i) => s + i.qty, 0));
  const sumPaid = round2(inv.items.reduce((s, i) => s + (i.qty - i.freeQty), 0));
  if (inv.totalCases > 0 && !nearly(sumQty, inv.totalCases, 0.01)) {
    if (nearly(sumPaid, inv.totalCases, 0.01)) {
      issues.push({ level: 'info', code: 'cases_billed_only', message: `The printed total (${inv.totalCases} cs) counts billed cases only; with free cases the rows add up to ${sumQty} cs.` });
    } else {
      issues.push({
        level: 'warn',
        code: 'cases_mismatch',
        message: `Rows add up to ${sumQty} cs but the invoice prints ${inv.totalCases} cs - a row may be missing, duplicated or misread.`,
      });
      needsRepair = true;
    }
  }

  // amounts
  const sumLines = round2(inv.items.reduce((s, i) => s + i.lineTotal, 0));
  const expected = round2(sumLines - inv.overallDiscount + inv.otherCharges + inv.roundOff);
  if (inv.grandTotal > 0 && sumLines > 0) {
    const diff = round2(expected - inv.grandTotal);
    const warnTol = Math.max(5, 0.003 * inv.grandTotal);
    const repairTol = Math.max(25, 0.015 * inv.grandTotal);
    if (Math.abs(diff) > warnTol) {
      issues.push({
        level: 'warn',
        code: 'amount_mismatch',
        message: `Rows add up to ₹${expected} but the invoice total is ₹${inv.grandTotal} (difference ₹${diff}). Check quantities, rates, discounts and extra charges.`,
      });
      if (Math.abs(diff) > repairTol) needsRepair = true;
    }
  } else if (inv.grandTotal === 0) {
    issues.push({ level: 'info', code: 'grand_total_missing', message: 'Invoice grand total was not found, so the amount cross-check was skipped.' });
  }

  if (issues.some((i) => i.code === 'line_mismatch')) needsRepair = true;

  // possible duplicates (same product, qty, rate, batch)
  const seen = new Map<string, number>();
  inv.items.forEach((it, idx) => {
    const key = [it.rawName.toLowerCase(), it.qty, it.unitPrice, it.batchNumber, it.expiryDate].join('|');
    if (seen.has(key)) {
      issues.push({ level: 'warn', code: 'duplicate_row', line: idx + 1, message: `Lines ${seen.get(key)} and ${idx + 1} look identical (${it.rawName}) - possible duplicate.` });
    } else seen.set(key, idx + 1);
  });

  const score = issues.reduce((s, i) => s + (i.level === 'error' ? 3 : i.level === 'warn' ? 1 : 0), 0);
  return { issues, needsRepair, score };
}
