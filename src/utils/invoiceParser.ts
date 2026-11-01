import * as XLSX from 'xlsx';
import { CategoryKey, GrnSchemeType, Product } from '../types';
import {
  generateBatchNumber,
  generateSkuId,
  normalizeTo8DigitHsn,
  gstRateFromHsn,
  inferUnitsPerCase,
  detectPack,
  volumeFromName,
  detectPackAndVolume,
  STANDARD_VOLUMES,
  VOLUME_UNIT_RE,
  MULTIPACK_VOLUME_RE,
} from './billing';
import { todayISO } from "./dateLocal";

export interface ParsedInvoiceItem {
  id: string;
  rawName: string;
  productName: string;
  category: CategoryKey;
  pack: string;
  volume: number;
  packSize?: string;
  unitsPerCrate?: number; // bottles/units per crate
  hsn: string;
  qty: number;
  freeQty: number;
  unitPrice: number;
  listPrice?: number;
  isGstIncluded?: boolean;
  calculatedGstAmount?: number;
  priceInclGst?: number;
  discountPercent: number;
  discountFlat?: number;
  discountAmount: number;
  schemeType: GrnSchemeType;
  schemeBuyQty?: number;
  schemeFreeQty?: number;
  schemeDescription: string;
  cgstPercent: number;
  sgstPercent: number;
  batchNumber: string;
  expiryDate: string;
  mfgDate: string;
  wholesaleRate: number;
  retailRate: number;
  lineTotal: number;

  // Catalog linking
  isNewProduct: boolean;
  matchedProductId?: number;
  matchedProductName?: string;
  existingStock?: number;
}

export interface ParsedInvoiceData {
  supplierName: string;
  supplierGstin: string;
  supplierAddress?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  invoiceNo: string;
  invoiceDate: string;
  vehicleNo: string;
  placeOfSupply: string;
  billedTo: string;
  shippedTo: string;
  overallDiscount: number;
  grandTotal: number;
  totalCases: number;
  items: ParsedInvoiceItem[];
  detectedSource: 'ai_vision' | 'spreadsheet' | 'reference_preset' | 'client_fallback';
  /** Human-readable notes from the AI cross-checks (row arithmetic, totals, GSTIN ...) */
  warnings?: string[];
}

/**
 * Clean and detect category from product name
 */
export function detectCategory(name: string): CategoryKey {
  const l = name.toLowerCase();
  if (l.includes('boost') || l.includes('power') || l.includes('energy') || l.includes('charge')) return 'energy';
  if (l.includes('cola') || l.includes('carbonated') || l.includes('soda') || l.includes('vibe') || l.includes('runner')) return 'vibe';
  if (l.includes('joos') || l.includes('juice') || l.includes('mango') || l.includes('apple') || l.includes('guava') || l.includes('nimbu') || l.includes('fruit')) return 'joos';
  if (l.includes('water') || l.includes('aqua') || l.includes('kinley') || l.includes('bisleri')) return 'water';
  return 'general';
}

export {
  detectPack,
  volumeFromName,
  detectPackAndVolume,
  STANDARD_VOLUMES,
  VOLUME_UNIT_RE,
  MULTIPACK_VOLUME_RE,
};

/** Words that carry beverage flavour or specific product variant identity */
const VARIANT_WORDS = new Set([
  'orange', 'lemon', 'lime', 'nimbu', 'jeera', 'masala', 'mango', 'apple', 'guava',
  'lychee', 'litchi', 'grape', 'berry', 'energy', 'boost', 'power', 'charge',
  'soda', 'water', 'diet', 'zero', 'light', 'ginger', 'clear', 'pulpy', 'tonic',
  'cola', 'jeeru', 'fizzy', 'masalazip', 'club'
]);

/** Extract variant/flavor keywords from name */
function extractVariantKeywords(name: string): Set<string> {
  const tokens = name.toLowerCase().split(/[^a-z0-9]+/);
  return new Set(tokens.filter((t) => VARIANT_WORDS.has(t)));
}

/** Words that carry no product identity */
const MATCH_STOP_WORDS = new Set([
  'case', 'cases', 'ctn', 'crate', 'box', 'cs', 'bottle', 'bottles',
  'btl', 'pcs', 'the', 'and', 'of', 'mrp', 'new', 'sku', 'inr', 'rs'
]);

/** Identity words of a product description (pack count and volume removed). */
function identityWords(name: string): Set<string> {
  const cleaned = name
    .toLowerCase()
    .replace(new RegExp(VOLUME_UNIT_RE.source, 'gi'), ' ')
    .replace(new RegExp(MULTIPACK_VOLUME_RE.source, 'gi'), ' ');

  return new Set(
    cleaned
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2 && !MATCH_STOP_WORDS.has(t) && !/^\d+x?\d*$/.test(t))
  );
}

/**
 * Match parsed invoice description with catalog products.
 *
 * Order: exact name -> alphanumeric-normalised name -> best scored candidate.
 * Guarantees:
 * - NEVER matches products with different volume (e.g. 250ml vs 750ml vs 2.25L).
 * - NEVER matches conflicting flavours / variants (e.g. Campa Orange vs Campa Lemon, Coke Zero vs Coca Cola).
 * - Differentiates pack types (Can vs PET vs Glass RGB).
 */
export function matchProductCatalog(
  rawName: string,
  catalog: Product[]
): {
  isNewProduct: boolean;
  matchedProduct?: Product;
} {
  const cleanRaw = rawName.trim().toLowerCase();
  const norm = cleanRaw.replace(/[^a-z0-9]/g, '');

  // 1. Exact name match
  const exact = catalog.find((p) => p.name.trim().toLowerCase() === cleanRaw);
  if (exact) return { isNewProduct: false, matchedProduct: exact };

  // 2. Normalized alphanumeric match
  const normMatch = catalog.find(
    (p) => p.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === norm
  );
  if (normMatch) return { isNewProduct: false, matchedProduct: normMatch };

  // 3. Scored match on identity words, strictly guarded by volume, pack, and flavour
  const rawWords = identityWords(rawName);
  if (rawWords.size === 0) return { isNewProduct: true, matchedProduct: undefined };

  const rawVol = volumeFromName(rawName);
  const rawPack = detectPack(rawName);
  const rawVariants = extractVariantKeywords(rawName);

  let best: Product | undefined;
  let bestScore = 0;

  for (const p of catalog) {
    const pVol = volumeFromName(p.name) ?? (Number((p as any).volume) > 0 ? Number((p as any).volume) : null) ?? volumeFromName((p as any).packSize || '');
    const pPack = (p as any).pack || detectPack(p.name);
    const pVariants = extractVariantKeywords(p.name);

    // Rule A: DIFFERENT VOLUME = NEVER MATCH (e.g. 250ml vs 750ml vs 2.25L)
    if (rawVol && pVol && Math.abs(rawVol - pVol) > 1) {
      continue;
    }

    // Rule B: CONFLICTING FLAVOURS / VARIANTS = NEVER MATCH (e.g. Orange vs Lemon vs Mango vs Zero)
    if (rawVariants.size > 0 && pVariants.size > 0) {
      let variantOverlap = false;
      rawVariants.forEach((v) => {
        if (pVariants.has(v)) variantOverlap = true;
      });
      if (!variantOverlap) {
        continue; // Different flavour or variant
      }
    }

    // Rule C: CONFLICTING PACK TYPE = NEVER MATCH if both explicitly specified (e.g. Can vs PET vs Glass RGB)
    const rawHasExplicitPack = /(?:can|tin|glass|rgb|tetra|pet)\b/i.test(rawName);
    const pHasExplicitPack = /(?:can|tin|glass|rgb|tetra|pet)\b/i.test(p.name) || Boolean(p.pack);
    if (rawHasExplicitPack && pHasExplicitPack && rawPack.toLowerCase() !== (pPack || '').toLowerCase()) {
      continue;
    }

    const pWords = identityWords(p.name);
    if (pWords.size === 0) continue;

    let inter = 0;
    rawWords.forEach((w) => {
      if (pWords.has(w)) inter++;
    });
    if (inter === 0) continue;

    const smaller = Math.min(rawWords.size, pWords.size);
    const containment = inter / smaller;
    const jaccard = inter / (rawWords.size + pWords.size - inter);
    const accepted = (containment === 1 && (inter >= 2 || smaller === 1)) || jaccard >= 0.6;
    if (!accepted) continue;

    let score = jaccard + (containment === 1 ? 0.3 : 0);

    // Volume match bonus
    if (rawVol && pVol && Math.abs(rawVol - pVol) <= 1) {
      score += 0.5;
    }

    // Pack match bonus
    if (rawPack === pPack) {
      score += 0.25;
    }

    // Variant match bonus
    if (rawVariants.size > 0 && pVariants.size > 0) {
      score += 0.3;
    }

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return best ? { isNewProduct: false, matchedProduct: best } : { isNewProduct: true, matchedProduct: undefined };
}

/**
 * Helper to safely extract clean number from cell value (removes ₹, commas, spaces)
 */
function parseNumericCell(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  const str = String(val).replace(/[₹,\s]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? fallback : num;
}

/**
 * Parses client-side Excel (.xlsx, .xls) or CSV files
 */
export async function parseSpreadsheetInvoice(
  file: File,
  catalog: Product[]
): Promise<ParsedInvoiceData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Spreadsheet appears to be empty. Please upload a valid invoice spreadsheet.');
  }

  // No silent supplier: if the sheet has no supplier details the user must fill them in on review.
  let supplierName = '';
  let supplierGstin = '';
  let supplierAddress = '';
  let supplierPhone = '';
  let supplierEmail = '';
  let invoiceNo = `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
  let invoiceDate = todayISO();
  let vehicleNo = 'OD15AF7869';
  let placeOfSupply = 'Odisha (21)';
  let billedTo = 'NEW BIJAYA PUSTAK BHANDRA';
  let shippedTo = 'SAHAJBAHAL GODOWN / KUCHINDA DEPOT';
  let overallDiscount = 0;

  // Helper to test and extract key-value pairs from any text/cell
  const inspectKeyValue = (rawKey: string, rawVal: string) => {
    const k = rawKey.trim().toLowerCase();
    const v = rawVal.trim();
    if (!v) return;

    if (/supplier\s*(?:name)?|provider\s*(?:name)?|vendor|distributor|m\/s|issued\s*by|billed\s*by/i.test(k) && !/gst|address|phone|email/i.test(k)) {
      supplierName = v;
    } else if (/gstin|gst\s*(?:no|number)|tax\s*id/i.test(k)) {
      const match = v.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1})/i);
      supplierGstin = match ? match[1].toUpperCase() : v.toUpperCase();
    } else if (/address|location|godown\s*address|dispatch\s*address/i.test(k) && !/shipped|delivery/i.test(k)) {
      supplierAddress = v;
    } else if (/phone|mobile|contact|tel/i.test(k)) {
      supplierPhone = v;
    } else if (/email|mail/i.test(k)) {
      supplierEmail = v;
    } else if (/inv(?:oice)?\s*(?:no|num|#|number)|bill\s*(?:no|#)|quotation\s*(?:no|#)|challan/i.test(k) && !/date/i.test(k)) {
      invoiceNo = v;
    } else if (/date|dated|dt/i.test(k) && !/expiry|mfg|exp/i.test(k)) {
      const dateMatch = v.match(/(\d{1,2}[-./]\d{1,2}[-./]\d{2,4})/) || v.match(/(\d{4}[-./]\d{1,2}[-./]\d{1,2})/);
      if (dateMatch) {
        const parts = dateMatch[1].split(/[-./]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            invoiceDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else {
            const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            invoiceDate = `${y}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      }
    } else if (/vehicle|truck|transport|lorry/i.test(k)) {
      vehicleNo = v.replace(/\s+/g, '').toUpperCase();
    } else if (/place\s*of\s*supply|pos|state/i.test(k)) {
      placeOfSupply = v;
    } else if (/billed\s*to|consignee|buyer|customer/i.test(k)) {
      billedTo = v;
    } else if (/shipped\s*to|dispatch\s*to|delivery\s*godown|destination/i.test(k)) {
      shippedTo = v;
    } else if (/overall\s*disc|bill\s*disc|total\s*disc|lump\s*sum/i.test(k)) {
      overallDiscount = Math.abs(parseNumericCell(v)) || overallDiscount;
    }
  };

  // 1. Check for dedicated Provider Details sheet (e.g. Invoice_Provider_Details, Supplier_Details, Header)
  for (const sName of workbook.SheetNames) {
    if (/provider|supplier|header|meta|summary/i.test(sName)) {
      const s = workbook.Sheets[sName];
      const sRows = XLSX.utils.sheet_to_json<any[]>(s, { header: 1 }) as any[][];
      for (const row of sRows) {
        if (!row || row.length === 0) continue;
        const col0 = String(row[0] || '').trim();
        const col1 = String(row[1] || '').trim();
        if (col0 && col1) {
          inspectKeyValue(col0, col1);
        }
      }
    }
  }

  // 2. Locate the sheet containing the line items table
  let itemsSheet = workbook.Sheets[workbook.SheetNames[0]];
  let bestSheetName = workbook.SheetNames[0];

  for (const sName of workbook.SheetNames) {
    if (/item|product|beverage|inward|line|table/i.test(sName)) {
      itemsSheet = workbook.Sheets[sName];
      bestSheetName = sName;
      break;
    }
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(itemsSheet, { header: 1 }) as any[][];

  // Scan top 30 header lines of items sheet for any provider metadata
  for (let i = 0; i < Math.min(30, rawRows.length); i++) {
    const lineArr = rawRows[i] || [];
    const lineStr = lineArr.map((c) => String(c || '').trim()).filter(Boolean).join(' | ');
    if (!lineStr) continue;

    // Check key-value in adjacent columns (col A: Key, col B: Value)
    if (lineArr[0] && lineArr[1]) {
      inspectKeyValue(String(lineArr[0]), String(lineArr[1]));
    }

    // Direct string match extraction
    const suppMatch = lineStr.match(/(?:supplier|provider|distributor|vendor|m\/s|from)[\s.:-]+([^|,\n]+)/i);
    if (suppMatch && suppMatch[1]?.trim() && !/gstin|address|phone|email/i.test(suppMatch[1])) {
      supplierName = suppMatch[1].trim();
    }

    const gstinMatch = lineStr.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1})/i);
    if (gstinMatch) supplierGstin = gstinMatch[1].toUpperCase();

    const addrMatch = lineStr.match(/(?:supplier\s*address|provider\s*address|address|location)[\s.:-]+([^|,\n]+)/i);
    if (addrMatch && addrMatch[1]?.trim()) supplierAddress = addrMatch[1].trim();

    const phoneMatch = lineStr.match(/(?:supplier\s*phone|provider\s*phone|phone|mobile|contact)[\s.:-]+([^|,\n]+)/i);
    if (phoneMatch && phoneMatch[1]?.trim()) supplierPhone = phoneMatch[1].trim();

    const emailMatch = lineStr.match(/([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/);
    if (emailMatch && emailMatch[1]?.trim()) supplierEmail = emailMatch[1].trim();

    const invMatch = lineStr.match(/(?:inv|invoice|bill|quotation|voucher)[\s#.:-]*([a-z0-9\/-]+)/i);
    if (invMatch && invMatch[1] && !/date|no|gstin|amount/i.test(invMatch[1].trim())) {
      invoiceNo = invMatch[1].trim();
    }

    const dateMatch = lineStr.match(/(?:date|dated|dt)[\s.:-]*(\d{1,2}[-./]\d{1,2}[-./]\d{2,4})/i);
    if (dateMatch) {
      const parts = dateMatch[1].split(/[-./]/);
      if (parts.length === 3) {
        const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        const m = parts[1].padStart(2, '0');
        const d = parts[0].padStart(2, '0');
        invoiceDate = `${y}-${m}-${d}`;
      }
    }

    const vehMatch = lineStr.match(/([A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{4})/i);
    if (vehMatch) vehicleNo = vehMatch[1].replace(/\s+/g, '').toUpperCase();

    const billedMatch = lineStr.match(/(?:billed\s*to|bill\s*to|consignee|buyer|customer)[\s.:-]+([^|,\n]+)/i);
    if (billedMatch && billedMatch[1]?.trim()) billedTo = billedMatch[1].trim();

    const posMatch = lineStr.match(/(?:place\s*of\s*supply|pos|state)[\s.:-]+([^|,\n]+)/i);
    if (posMatch && posMatch[1]?.trim()) placeOfSupply = posMatch[1].trim();
  }

  // Find table header row by looking for item/description and qty/cases/rate
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(30, rawRows.length); r++) {
    const row = rawRows[r] || [];
    const hasName = row.some((c: any) => /item|desc|product|particular|material|beverage/i.test(String(c)));
    const hasQtyOrRate = row.some((c: any) => /qty|cases|quantity|crates|rate|price|amount/i.test(String(c)));
    if (hasName && hasQtyOrRate) {
      headerRowIdx = r;
      break;
    }
  }

  const jsonObjects = XLSX.utils.sheet_to_json<Record<string, any>>(itemsSheet, {
    range: headerRowIdx >= 0 ? headerRowIdx : 0,
  });

  const parsedItems: ParsedInvoiceItem[] = [];

  jsonObjects.forEach((row, idx) => {
    // Check if table row contains supplier/invoice metadata columns
    Object.keys(row).forEach((col) => {
      const val = String(row[col] || '').trim();
      if (!val) return;
      if (/supplier\s*(?:name)?|vendor|provider/i.test(col) && !/gst|address|phone/i.test(col)) supplierName = val;
      if (/supplier\s*gst|provider\s*gst|gstin/i.test(col)) {
        const m = val.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1})/i);
        supplierGstin = m ? m[1].toUpperCase() : val.toUpperCase();
      }
      if (/supplier\s*address|provider\s*address|address/i.test(col)) supplierAddress = val;
      if (/supplier\s*phone|provider\s*phone|phone|contact/i.test(col)) supplierPhone = val;
      if (/supplier\s*email|email/i.test(col)) supplierEmail = val;
      if (/invoice\s*(?:no|number)|bill\s*no/i.test(col) && !/date/i.test(col)) invoiceNo = val;
      if (/vehicle\s*(?:no|number)|truck/i.test(col)) vehicleNo = val.replace(/\s+/g, '').toUpperCase();
      if (/place\s*of\s*supply|pos/i.test(col)) placeOfSupply = val;
      if (/billed\s*to|consignee/i.test(col)) billedTo = val;
      if (/shipped\s*to|destination/i.test(col)) shippedTo = val;
    });

    // 1. Raw Name / Description
    const nameKey = Object.keys(row).find((k) =>
      /^(item|desc|product|particular|material|beverage|name)/i.test(k) ||
      /item\s*desc|product\s*name/i.test(k)
    );
    const rawName = nameKey && row[nameKey] ? String(row[nameKey]).trim() : '';

    if (!rawName || /^(total|subtotal|grand total|net amount|summary)/i.test(rawName)) {
      // Check if this row is overall invoice-level discount
      if (/discount|trade\s*scheme|deduction/i.test(rawName)) {
        const valKey = Object.keys(row).find((k) => typeof row[k] === 'number' || (typeof row[k] === 'string' && !isNaN(parseFloat(row[k]))));
        if (valKey) overallDiscount = Math.abs(parseNumericCell(row[valKey])) || 0;
      }
      return;
    }

    // 2. Quantities
    const qtyKey = Object.keys(row).find((k) =>
      /^(billed\s*cases|billed\s*qty|cases|crates|ctn|quantity|qty|billed)/i.test(k) &&
      !/free|scheme|bonus|foc/i.test(k)
    );
    const freeKey = Object.keys(row).find((k) =>
      /free|bonus|scheme\s*qty|foc|free\s*cases|bonus\s*crates/i.test(k)
    );

    // 3. Rates and Prices
    const rateKey = Object.keys(row).find((k) =>
      /^(unit\s*rate|rate|basic\s*rate|unit\s*price|purchase\s*rate|price|list\s*price)/i.test(k) &&
      !/wholesale|retail|mrp|taxable|amount|total/i.test(k)
    );

    // 4. Taxes
    const cgstKey = Object.keys(row).find((k) => /cgst.*(?:%|rate|percent)/i.test(k) || /^cgst$/i.test(k));
    const sgstKey = Object.keys(row).find((k) => /sgst.*(?:%|rate|percent)/i.test(k) || /^sgst$/i.test(k));
    const igstKey = Object.keys(row).find((k) => /igst.*(?:%|rate|percent)|gst.*%/i.test(k) || /^gst$/i.test(k));

    // 5. Schemes & Discounts
    const discPctKey = Object.keys(row).find((k) => /disc.*(?:%|percent)|trade\s*disc/i.test(k) || /^discount$/i.test(k));
    const discFlatKey = Object.keys(row).find((k) => /flat.*(?:off|disc)|disc.*flat|cash\s*disc/i.test(k));
    const schemeTypeKey = Object.keys(row).find((k) => /scheme\s*type|offer\s*type/i.test(k));
    const schemeLabelKey = Object.keys(row).find((k) => /scheme\s*label|scheme\s*name|scheme\s*desc|promotion/i.test(k));

    // 6. Selling Rates & Batch
    const wsRateKey = Object.keys(row).find((k) => /wholesale|w\/s/i.test(k));
    const retRateKey = Object.keys(row).find((k) => /retail|mrp/i.test(k));
    const batchKey = Object.keys(row).find((k) => /batch|lot/i.test(k));
    const expKey = Object.keys(row).find((k) => /expiry|exp\s*date|best\s*before/i.test(k));
    const mfgKey = Object.keys(row).find((k) => /mfg|manufacturing/i.test(k));
    const hsnKey = Object.keys(row).find((k) => /hsn|sac/i.test(k));
    const catKey = Object.keys(row).find((k) => /category|group|brand/i.test(k));
    const packKey = Object.keys(row).find((k) => /pack|packaging/i.test(k));
    const volKey = Object.keys(row).find((k) => /volume|size|ml/i.test(k));

    const qty = Math.max(1, parseNumericCell(qtyKey ? row[qtyKey] : 50, 50));
    const freeQty = Math.max(0, parseNumericCell(freeKey ? row[freeKey] : 0, 0));
    const rawListPrice = parseNumericCell(rateKey ? row[rateKey] : 158.57, 158.57);
    const hsn = hsnKey && row[hsnKey] ? String(row[hsnKey]).trim() : '';

    const hsnDefaultRate = gstRateFromHsn(normalizeTo8DigitHsn(hsn, undefined, rawName));
    const hsnHalf = hsnDefaultRate != null ? (hsnDefaultRate * 100) / 2 : 20;
    let cgstPercent = cgstKey ? parseNumericCell(row[cgstKey], hsnHalf) : hsnHalf;
    let sgstPercent = sgstKey ? parseNumericCell(row[sgstKey], hsnHalf) : hsnHalf;
    if (igstKey && row[igstKey]) {
      const totalGst = parseNumericCell(row[igstKey], 40);
      cgstPercent = totalGst / 2;
      sgstPercent = totalGst / 2;
    }

    const totalGstRate = (cgstPercent + sgstPercent) / 100;

    // Check if list price is included GST? If not then calculate:
    const gstIncludedKey = Object.keys(row).find((k) =>
      /is_?gst_?included|gst_?inclusive|tax_?inclusive|incl_?gst|inclusive_?tax|rate_?type|price_?type|tax_?type|is_?inclusive|price_?includes_?gst/i.test(k)
    );
    const isRateHeaderIncl = rateKey ? /incl.*gst|gst.*incl|with.*gst|cum.*tax/i.test(rateKey) : false;
    const isRateHeaderExcl = rateKey ? /excl.*gst|gst.*excl|basic.*rate|ex.*gst|without.*gst|taxable.*rate/i.test(rateKey) : false;

    let isGstIncluded = false;
    if (gstIncludedKey && row[gstIncludedKey] !== undefined) {
      const val = String(row[gstIncludedKey]).toLowerCase().trim();
      if (/^(yes|true|y|1|incl|inclusive|with\s*gst|tax\s*incl)/i.test(val)) {
        isGstIncluded = true;
      } else if (/^(no|false|n|0|excl|exclusive|without\s*gst|plus\s*gst)/i.test(val)) {
        isGstIncluded = false;
      }
    } else if (isRateHeaderIncl) {
      isGstIncluded = true;
    } else if (isRateHeaderExcl) {
      isGstIncluded = false;
    } else {
      // Check mathematically against row totals if present in the spreadsheet
      const taxableKey = Object.keys(row).find((k) => /taxable|base\s*amount/i.test(k));
      const totalKey = Object.keys(row).find((k) => /total\s*amount|line\s*total|net\s*amount/i.test(k));
      const rowTaxable = taxableKey ? parseNumericCell(row[taxableKey]) : 0;
      const rowTotal = totalKey ? parseNumericCell(row[totalKey]) : 0;

      if (rowTotal > 0 && Math.abs(qty * rawListPrice - rowTotal) < 1.5) {
        // Raw list price multiplied by qty equals row total -> list price is already GST-inclusive
        isGstIncluded = true;
      } else if (rowTaxable > 0 && Math.abs(qty * rawListPrice - rowTaxable) < 1.5) {
        // Raw list price multiplied by qty equals taxable value -> list price excludes GST
        isGstIncluded = false;
      } else if (rowTotal > 0 && Math.abs((qty * rawListPrice) * (1 + totalGstRate) - rowTotal) < 1.5) {
        // Adding GST to raw list price yields total -> list price excludes GST
        isGstIncluded = false;
      } else {
        // Default: list price is exclusive of GST (standard B2B trade list price); GST will be calculated
        isGstIncluded = false;
      }
    }

    // Calculate unitPrice (taxable base), calculated GST, and priceInclGst:
    let unitPrice = rawListPrice;
    let calculatedGstAmount = 0;
    let priceInclGst = rawListPrice;

    if (!isGstIncluded) {
      // List price does NOT include GST -> calculate GST and add to get landed price
      calculatedGstAmount = rawListPrice * totalGstRate;
      priceInclGst = rawListPrice + calculatedGstAmount;
      unitPrice = rawListPrice; // Taxable base rate is the list price
    } else {
      // List price DOES include GST -> back-calculate base taxable rate
      unitPrice = totalGstRate > 0 ? rawListPrice / (1 + totalGstRate) : rawListPrice;
      calculatedGstAmount = rawListPrice - unitPrice;
      priceInclGst = rawListPrice;
    }

    const discountPercent = discPctKey ? parseNumericCell(row[discPctKey], 0) : 0;
    const discountFlat = discFlatKey ? parseNumericCell(row[discFlatKey], 0) : 0;

    let schemeType: 'none' | 'free_cases' | 'discount_percent' | 'discount_flat' = 'none';
    if (schemeTypeKey && row[schemeTypeKey]) {
      const val = String(row[schemeTypeKey]).toLowerCase();
      if (val.includes('free') || val.includes('bonus')) schemeType = 'free_cases';
      else if (val.includes('flat')) schemeType = 'discount_flat';
      else if (val.includes('percent') || val.includes('%')) schemeType = 'discount_percent';
    } else if (freeQty > 0) {
      schemeType = 'free_cases';
    } else if (discountFlat > 0) {
      schemeType = 'discount_flat';
    } else if (discountPercent > 0) {
      schemeType = 'discount_percent';
    }

    let discountAmount = 0;
    if (schemeType === 'discount_percent') {
      discountAmount = (qty * unitPrice * discountPercent) / 100;
    } else if (schemeType === 'discount_flat') {
      discountAmount = qty * discountFlat;
    }

    const grossAmount = qty * unitPrice;
    const taxable = Math.max(0, grossAmount - discountAmount);
    const tax = taxable * totalGstRate;
    const lineTotal = taxable + tax;
    const totalUnits = qty + freeQty;
    const landedCost = totalUnits > 0 ? lineTotal / totalUnits : priceInclGst;

    const { isNewProduct, matchedProduct } = matchProductCatalog(rawName, catalog);
    const cat = (catKey && row[catKey] ? String(row[catKey]).toLowerCase() : null) as CategoryKey ||
      matchedProduct?.category ||
      detectCategory(rawName);
    const detectedPackVol = detectPackAndVolume(rawName);
    const pack = packKey && row[packKey] ? String(row[packKey]).trim() : matchedProduct?.pack || detectedPackVol.pack;
    const volume = volKey && row[volKey] ? parseNumericCell(row[volKey], detectedPackVol.volume) : matchedProduct?.volume || detectedPackVol.volume;

    const wholesaleRate = wsRateKey && row[wsRateKey]
      ? parseNumericCell(row[wsRateKey], Math.round(landedCost * 1.15))
      : matchedProduct?.wholesale || Math.round(landedCost * 1.15) || Math.round(priceInclGst * 1.15);

    const retailRate = retRateKey && row[retRateKey]
      ? parseNumericCell(row[retRateKey], Math.round(landedCost * 1.25))
      : matchedProduct?.retail || Math.round(landedCost * 1.25) || Math.round(priceInclGst * 1.25);

    // Each batch/tag number should be auto generated for each product inwards .. should NOT use old one
    const existingBatches = catalog.map((p) => p.batchNumber).filter(Boolean) as string[];
    const uploadedBatch = batchKey && row[batchKey] ? String(row[batchKey]).trim() : '';
    const isOldBatch = uploadedBatch ? existingBatches.includes(uploadedBatch) : false;

    // Auto-generate fresh unique batch/tag number if not given or if it matches an old catalog batch
    const batchNumber = (!uploadedBatch || isOldBatch)
      ? generateBatchNumber(matchedProduct ? matchedProduct.name : rawName, undefined, existingBatches, idx, invoiceDate)
      : uploadedBatch;

    const expiryDate = expKey && row[expKey]
      ? String(row[expKey]).trim()
      : matchedProduct?.expiry || '2027-03-31';

    const mfgDate = mfgKey && row[mfgKey]
      ? String(row[mfgKey]).trim()
      : todayISO();

    const schemeLabel = schemeLabelKey && row[schemeLabelKey] ? String(row[schemeLabelKey]).trim() : '';

    parsedItems.push({
      id: `parsed_${Date.now()}_${idx}`,
      rawName,
      productName: String(matchedProduct ? matchedProduct.name : rawName).trim().toUpperCase(),
      category: cat,
      pack,
      volume,
      hsn: normalizeTo8DigitHsn(matchedProduct?.hsn || hsn, cat, rawName),
      unitsPerCrate: matchedProduct?.unitsPerCrate || inferUnitsPerCase(`${rawName} ${matchedProduct?.pack || ''}`, matchedProduct?.volume || volume),
      qty,
      freeQty,
      unitPrice,
      listPrice: rawListPrice,
      isGstIncluded,
      calculatedGstAmount,
      priceInclGst,
      discountPercent,
      discountFlat,
      discountAmount,
      schemeType,
      schemeDescription: schemeLabel || (freeQty > 0 ? `+${freeQty} Free Crates` : discountPercent > 0 ? `${discountPercent}% Off` : discountFlat > 0 ? `₹${discountFlat}/cs Off` : ''),
      cgstPercent,
      sgstPercent,
      batchNumber,
      expiryDate,
      mfgDate,
      wholesaleRate,
      retailRate,
      lineTotal,
      isNewProduct,
      matchedProductId: matchedProduct?.id,
      matchedProductName: matchedProduct?.name,
      existingStock: matchedProduct?.opening,
    });
  });

  const totalCases = parsedItems.reduce((s, it) => s + it.qty, 0);
  const grandTotal = parsedItems.reduce((s, it) => s + it.lineTotal, 0) - overallDiscount;

  return {
    supplierName,
    supplierGstin,
    supplierAddress,
    supplierPhone,
    supplierEmail,
    invoiceNo,
    invoiceDate,
    vehicleNo,
    placeOfSupply,
    billedTo: billedTo || 'NEW BIJAYA PUSTAK BHANDRA',
    shippedTo: shippedTo || billedTo || 'SAHAJBAHAL GODOWN / KUCHINDA DEPOT',
    overallDiscount,
    grandTotal: Math.max(0, grandTotal),
    totalCases,
    items: parsedItems,
    detectedSource: 'spreadsheet',
  };
}

/**
 * Phone photos are often 6-12 MB. Re-encoding to a sensible size makes upload faster and the
 * request far less likely to time out, without losing readable text. EXIF rotation is applied.
 */
async function prepareImageForAi(file: File): Promise<{ base64: string; mimeType: string } | null> {
  const MAX_EDGE = 2600;
  const SMALL_ENOUGH = 1.5 * 1024 * 1024;
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH) {
      bitmap.close?.();
      return null; // already fine, send the original bytes
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * Call the server-side Gemini pipeline (/api/recognize-invoice) with an image or PDF.
 * The server returns data that is already normalised and cross-checked; this function only
 * links rows to the catalog and fills catalog-dependent defaults. It never invents numbers:
 * a value that could not be read stays empty/0 and is reported in `warnings`.
 */
export async function recognizeInvoiceWithAi(
  file: File,
  catalog: Product[]
): Promise<ParsedInvoiceData> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(extension || '');
  const isPdf = extension === 'pdf';

  if (!isImage && !isPdf) {
    throw new Error('Only PDF or Image files can be processed with AI Vision.');
  }
  if (file.size > 18 * 1024 * 1024) {
    throw new Error('This file is larger than 18 MB. Please compress the PDF or upload a smaller photo/scan.');
  }

  let base64Data: string;
  let mimeType: string;
  if (isPdf) {
    base64Data = await fileToBase64(file);
    mimeType = 'application/pdf';
  } else {
    const prepared = await prepareImageForAi(file);
    if (prepared) {
      base64Data = prepared.base64;
      mimeType = prepared.mimeType;
    } else {
      base64Data = await fileToBase64(file);
      mimeType = file.type || `image/${extension === 'jpg' ? 'jpeg' : extension}`;
    }
  }

  const response = await fetch('/api/recognize-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64: base64Data, mimeType, fileName: file.name }),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const message = errorJson.error || `Server returned ${response.status}: Failed to recognize invoice.`;
    const err = new Error(message);
    (err as any).status = response.status;
    (err as any).isTemporary = errorJson.isTemporary || response.status === 503 || response.status === 429;
    throw err;
  }

  const result = await response.json();
  const data = result.data || {};
  const warnings: string[] = Array.isArray(result.warnings) ? [...result.warnings] : [];

  const rawItems: any[] = Array.isArray(data.items) ? data.items : [];
  const processedItems: ParsedInvoiceItem[] = rawItems.map((item: any, idx: number) => {
    const rawName = String(item.rawName || item.productName || `Item ${idx + 1}`).trim();
    const { isNewProduct, matchedProduct } = matchProductCatalog(rawName, catalog);
    const category = matchedProduct?.category || (item.category as CategoryKey) || detectCategory(rawName);
    const detected = detectPackAndVolume(rawName);
    const pack = matchedProduct?.pack || item.pack || detected.pack;
    const volume = matchedProduct?.volume || item.volume || detected.volume;
    const hsn = normalizeTo8DigitHsn(matchedProduct?.hsn || item.hsn, category, rawName);

    const qty = Math.max(1, Number(item.qty) || 1);
    const freeQty = Math.min(qty, Math.max(0, Number(item.freeQty) || 0));
    const rawListPrice = Math.max(0, Number(item.unitPrice) || 0);
    const discountPercent = Number(item.discountPercent) || 0;
    const discountAmount = Number(item.discountAmount) || 0;

    // GST: use what the invoice printed; only when it printed nothing fall back to the HSN slab.
    const hsnRate = gstRateFromHsn(hsn);
    const hsnHalf = hsnRate != null ? (hsnRate * 100) / 2 : 20;
    let cgstPercent: number;
    let sgstPercent: number;
    if (item.cgstPercent === null || item.cgstPercent === undefined || item.sgstPercent === null || item.sgstPercent === undefined) {
      cgstPercent = hsnHalf;
      sgstPercent = hsnHalf;
      warnings.push(`Line ${idx + 1} (${rawName}): GST rate was not readable; used ${hsnHalf * 2}% from HSN ${hsn}.`);
    } else {
      cgstPercent = Number(item.cgstPercent);
      sgstPercent = Number(item.sgstPercent);
      if (hsnRate != null && cgstPercent + sgstPercent === 0 && hsnRate > 0) {
        warnings.push(`Line ${idx + 1} (${rawName}): invoice shows 0% GST but HSN ${hsn} is normally ${hsnRate * 100}% - please verify.`);
      }
    }

    const totalGstRate = (cgstPercent + sgstPercent) / 100;
    const itemPrintedLineTotal = Number(item.lineTotal) || 0;
    const expectedExGstTotal = (qty - freeQty) * rawListPrice - discountAmount;
    const isGstIncluded = itemPrintedLineTotal > 0 && Math.abs(expectedExGstTotal - itemPrintedLineTotal) < 1.5;

    let unitPrice = rawListPrice;
    let calculatedGstAmount = 0;
    let priceInclGst = rawListPrice;

    if (!isGstIncluded) {
      calculatedGstAmount = rawListPrice * totalGstRate;
      priceInclGst = rawListPrice + calculatedGstAmount;
      unitPrice = rawListPrice;
    } else {
      unitPrice = totalGstRate > 0 ? rawListPrice / (1 + totalGstRate) : rawListPrice;
      calculatedGstAmount = rawListPrice - unitPrice;
      priceInclGst = rawListPrice;
    }

    const taxable = Math.max(0, (qty - freeQty) * unitPrice - discountAmount);
    const lineTotal = itemPrintedLineTotal || taxable * (1 + totalGstRate);
    const landedPerCase = qty > 0 ? lineTotal / qty : priceInclGst;

    let schemeType: 'none' | 'free_cases' | 'discount_percent' | 'discount_flat' = 'none';
    if (freeQty > 0) schemeType = 'free_cases';
    else if (discountPercent > 0) schemeType = 'discount_percent';

    // Auto-generate fresh unique batch/tag number (never reuse old catalog batch)
    const existingBatches = catalog.map((p) => p.batchNumber).filter(Boolean) as string[];
    const isOldBatch = item.batchNumber ? existingBatches.includes(item.batchNumber) : false;
    const batchNumber = (!item.batchNumber || isOldBatch)
      ? generateBatchNumber(matchedProduct ? matchedProduct.name : rawName, undefined, existingBatches, idx, data.invoiceDate)
      : item.batchNumber;

    return {
      id: `ai_item_${Date.now()}_${idx}`,
      rawName,
      productName: String(matchedProduct ? matchedProduct.name : item.productName || rawName).trim().toUpperCase(),
      category,
      pack,
      volume,
      hsn,
      unitsPerCrate:
        matchedProduct?.unitsPerCrate ||
        item.unitsPerCase ||
        inferUnitsPerCase(`${rawName} ${item.pack || ''}`, volume),
      qty,
      freeQty,
      unitPrice,
      listPrice: rawListPrice,
      isGstIncluded,
      calculatedGstAmount,
      priceInclGst,
      discountPercent,
      discountAmount,
      schemeType,
      schemeDescription: item.schemeDescription || (freeQty > 0 ? `+${freeQty} Free Crates` : ''),
      cgstPercent,
      sgstPercent,
      batchNumber,
      // not printed and not in the catalog -> stay empty so the review screen flags it (never invent a date)
      expiryDate: item.expiryDate || matchedProduct?.expiry || '',
      mfgDate: item.mfgDate || todayISO(),
      wholesaleRate: matchedProduct?.wholesale || Math.round(landedPerCase * 1.15) || Math.round(priceInclGst * 1.15),
      retailRate: matchedProduct?.retail || Math.round(landedPerCase * 1.25) || Math.round(priceInclGst * 1.25),
      lineTotal,
      isNewProduct,
      matchedProductId: matchedProduct?.id,
      matchedProductName: matchedProduct?.name,
      existingStock: matchedProduct?.opening,
    };
  });

  return {
    supplierName: data.supplierName || '',
    supplierGstin: data.supplierGstin || '',
    supplierAddress: data.supplierAddress || '',
    supplierPhone: data.supplierPhone || '',
    supplierEmail: data.supplierEmail || '',
    invoiceNo: data.invoiceNo || '',
    invoiceDate: data.invoiceDate || todayISO(),
    vehicleNo: data.vehicleNo || '',
    placeOfSupply: data.placeOfSupply || 'Odisha (21)',
    billedTo: data.billedTo || '',
    shippedTo: data.shippedTo || '',
    overallDiscount: Number(data.overallDiscount) || 0,
    // 0 = "not printed": the review screen then skips the amount cross-check instead of comparing with itself
    grandTotal: Number(data.grandTotal) || 0,
    totalCases: Number(data.totalCases) || processedItems.reduce((s, it) => s + it.qty, 0),
    items: processedItems,
    detectedSource: 'ai_vision',
    warnings,
  };
}
