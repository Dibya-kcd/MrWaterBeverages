import * as XLSX from 'xlsx';
import { CategoryKey, GrnSchemeType, Product } from '../types';
import { generateBatchNumber, generateSkuId } from './billing';

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

/**
 * Extract bottle pack and volume from beverage description
 */
export function detectPackAndVolume(name: string): { pack: string; volume: number } {
  const upper = name.toUpperCase();
  let pack = 'PET';
  if (upper.includes('CAN')) pack = 'Can';
  else if (upper.includes('GLASS') || upper.includes('RGB')) pack = 'Glass';
  else if (upper.includes('TETRA')) pack = 'Tetra';
  else if (upper.includes('PET')) pack = 'PET';

  const volMatch = upper.match(/(\d+)\s*(ML|L|LTR)/i);
  let volume = 150;
  if (volMatch) {
    const val = parseInt(volMatch[1], 10);
    const unit = volMatch[2].toUpperCase();
    volume = unit.startsWith('L') ? val * 1000 : val;
  }
  return { pack, volume };
}

/**
 * Match parsed invoice description with catalog products
 */
export function matchProductCatalog(
  rawName: string,
  catalog: Product[]
): {
  isNewProduct: boolean;
  matchedProduct?: Product;
} {
  const norm = rawName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Exact name match
  const exact = catalog.find((p) => p.name.trim().toLowerCase() === rawName.trim().toLowerCase());
  if (exact) return { isNewProduct: false, matchedProduct: exact };

  // 2. Normalized alphanumeric match
  const normMatch = catalog.find(
    (p) => p.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === norm
  );
  if (normMatch) return { isNewProduct: false, matchedProduct: normMatch };

  // 3. Substring / significant token overlap
  const tokens = rawName
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !['150ml', 'pet', 'case', 'ctn'].includes(t));

  if (tokens.length > 0) {
    const candidate = catalog.find((p) => {
      const pLower = p.name.toLowerCase();
      const matchCount = tokens.filter((t) => pLower.includes(t)).length;
      return matchCount >= Math.min(2, tokens.length);
    });
    if (candidate) return { isNewProduct: false, matchedProduct: candidate };
  }

  return { isNewProduct: true, matchedProduct: undefined };
}

/**
 * Reference Tax Invoice #38/26-27 (from user's uploaded WhatsApp photo)
 */
export const REFERENCE_TAX_INVOICE_38: ParsedInvoiceData = {
  supplierName: 'RADHIKA ENTERPRISES',
  supplierGstin: '21FSDPR8480R1ZU',
  supplierAddress: 'Main Road, Near Bus Stand, Kuchinda, Sambalpur, Odisha - 768222',
  supplierPhone: '+91 94370 84801',
  supplierEmail: 'radhika.beverages@gmail.com',
  invoiceNo: '38/26-27',
  invoiceDate: '2026-09-12',
  vehicleNo: 'OD15AF7869',
  placeOfSupply: 'Odisha (21)',
  billedTo: 'NEW BIJAYA PUSTAK BHANDRA',
  shippedTo: 'NEW BIJAYA PUSTAK BHANDRA, KHATIYAN NO-80, SAHAJBAHAL',
  overallDiscount: 0,
  grandTotal: 122179.0,
  totalCases: 560,
  detectedSource: 'reference_preset',
  items: [
    {
      id: 'ref_item_1',
      rawName: 'CAMPA POWER UP 150ML PET',
      productName: 'Campa Power Up 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      packSize: '24 x 150ml PET',
      unitsPerCrate: 24,
      hsn: '22021090',
      qty: 150,
      freeQty: 50,
      unitPrice: 222.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'b2g1',
      schemeBuyQty: 2,
      schemeFreeQty: 1,
      schemeDescription: 'Buy 2 Get 1 Free (50 Free out of 150 cs)',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-CMP-260912-001',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 245,
      retailRate: 260,
      lineTotal: 33300.0,
      isNewProduct: false,
    },
    {
      id: 'ref_item_2',
      rawName: 'CAMPA NEON BOOST 150ML PET',
      productName: 'Campa Neon Boost 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      packSize: '24 x 150ml PET',
      unitsPerCrate: 24,
      hsn: '22021090',
      qty: 75,
      freeQty: 25,
      unitPrice: 222.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'b2g1',
      schemeBuyQty: 2,
      schemeFreeQty: 1,
      schemeDescription: 'Buy 2 Get 1 Free (25 Free out of 75 cs)',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-CMP-260912-002',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 245,
      retailRate: 260,
      lineTotal: 16650.0,
      isNewProduct: false,
    },
    {
      id: 'ref_item_3',
      rawName: 'CAMPA LEMON BOOST 150ML PET',
      productName: 'Campa Lemon Boost 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      packSize: '24 x 150ml PET',
      unitsPerCrate: 24,
      hsn: '22021090',
      qty: 75,
      freeQty: 25,
      unitPrice: 222.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'b2g1',
      schemeBuyQty: 2,
      schemeFreeQty: 1,
      schemeDescription: 'Buy 2 Get 1 Free (25 Free out of 75 cs)',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-CMP-260912-003',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 245,
      retailRate: 260,
      lineTotal: 16650.0,
      isNewProduct: false,
    },
    {
      id: 'ref_item_4',
      rawName: 'CAMPA ORANGE BOOST 150ML PET',
      productName: 'Campa Orange Boost 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      packSize: '24 x 150ml PET',
      unitsPerCrate: 24,
      hsn: '22021090',
      qty: 45,
      freeQty: 15,
      unitPrice: 222.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'b2g1',
      schemeBuyQty: 2,
      schemeFreeQty: 1,
      schemeDescription: 'Buy 2 Get 1 Free (15 Free out of 45 cs)',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-CMP-260912-004',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 245,
      retailRate: 260,
      lineTotal: 9990.0,
      isNewProduct: false,
    },
    {
      id: 'ref_item_5',
      rawName: 'CAMPA PURPLE BOOST 150ML PET',
      productName: 'Campa Purple Boost 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      hsn: '22021090',
      qty: 30,
      freeQty: 0,
      unitPrice: 222.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-CMP-260912-005',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 245,
      retailRate: 260,
      lineTotal: 6660.0,
      isNewProduct: false,
    },
    {
      id: 'ref_item_6',
      rawName: 'E.H. VIBE COLA 150ML',
      productName: 'E.H. Vibe Cola 150ml',
      category: 'vibe',
      pack: 'PET',
      volume: 150,
      hsn: '22021010',
      qty: 50,
      freeQty: 0,
      unitPrice: 210.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-VB-260912-006',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 230,
      retailRate: 250,
      lineTotal: 10500.0,
      isNewProduct: false,
    },
    {
      id: 'ref_item_7',
      rawName: 'E.H. VIBE ORANGE 150ML PET',
      productName: 'E.H. Vibe Orange 150ml PET',
      category: 'vibe',
      pack: 'PET',
      volume: 150,
      hsn: '22021010',
      qty: 50,
      freeQty: 0,
      unitPrice: 210.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-VB-260912-007',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 230,
      retailRate: 250,
      lineTotal: 10500.0,
      isNewProduct: false,
    },
    {
      id: 'ref_item_8',
      rawName: 'E.H. VIBE CLEAR LEMON 150ML PET',
      productName: 'E.H. Vibe Clear Lemon 150ml PET',
      category: 'vibe',
      pack: 'PET',
      volume: 150,
      hsn: '22021010',
      qty: 50,
      freeQty: 0,
      unitPrice: 210.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-VB-260912-008',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 230,
      retailRate: 250,
      lineTotal: 10500.0,
      isNewProduct: false,
    },
    {
      id: 'ref_item_9',
      rawName: 'SOSYO JOOS MANGO 150ML PET',
      productName: 'Sosyo Joos Mango 150ml PET',
      category: 'joos',
      pack: 'PET',
      volume: 150,
      hsn: '22029920',
      qty: 10,
      freeQty: 0,
      unitPrice: 212.26,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      batchNumber: 'LOT-JS-260912-009',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 235,
      retailRate: 250,
      lineTotal: 2122.6,
      isNewProduct: false,
    },
    {
      id: 'ref_item_10',
      rawName: 'SOSYO JOOS APPLE 150ML PET',
      productName: 'Sosyo Joos Apple 150ml PET',
      category: 'joos',
      pack: 'PET',
      volume: 150,
      hsn: '22029920',
      qty: 10,
      freeQty: 0,
      unitPrice: 212.26,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      batchNumber: 'LOT-JS-260912-010',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 235,
      retailRate: 250,
      lineTotal: 2122.6,
      isNewProduct: false,
    },
    {
      id: 'ref_item_11',
      rawName: 'SOSYO JOOS MIX FRUIT 150ML PET',
      productName: 'Sosyo Joos Mix Fruit 150ml PET',
      category: 'joos',
      pack: 'PET',
      volume: 150,
      hsn: '22029920',
      qty: 10,
      freeQty: 0,
      unitPrice: 212.26,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      batchNumber: 'LOT-JS-260912-011',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 235,
      retailRate: 250,
      lineTotal: 2122.6,
      isNewProduct: false,
    },
    {
      id: 'ref_item_12',
      rawName: 'SOSYO JOOS NIMBU PAANI 150ML PET',
      productName: 'Sosyo Joos Nimbu Paani 150ml PET',
      category: 'joos',
      pack: 'PET',
      volume: 150,
      hsn: '22029920',
      qty: 5,
      freeQty: 0,
      unitPrice: 212.26,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      batchNumber: 'LOT-JS-260912-012',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 235,
      retailRate: 250,
      lineTotal: 1061.3,
      isNewProduct: false,
    },
  ],
};

/**
 * Reference Sales Quotation #2 (from user's PDF with 14 items and ₹25,530 scheme discount)
 */
export const REFERENCE_SALES_QUOTATION_2: ParsedInvoiceData = {
  supplierName: 'RADHIKA ENTERPRISES',
  supplierGstin: '21FSDPR8480R1ZU',
  supplierAddress: 'Main Road, Near Bus Stand, Kuchinda, Sambalpur, Odisha - 768222',
  supplierPhone: '+91 94370 84801',
  supplierEmail: 'radhika.beverages@gmail.com',
  invoiceNo: 'QUOT-002',
  invoiceDate: '2026-09-11',
  vehicleNo: 'OD15AF7869',
  placeOfSupply: 'Odisha (21)',
  billedTo: 'KUCHINDA DEPOT',
  shippedTo: 'KUCHINDA GODOWN',
  overallDiscount: 25530.0,
  grandTotal: 141049.1,
  totalCases: 760,
  detectedSource: 'reference_preset',
  items: [
    {
      id: 'quote_item_1',
      rawName: 'CAMPA POWER UP 150ML PET',
      productName: 'Campa Power Up 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      hsn: '22021090',
      qty: 150,
      freeQty: 0,
      unitPrice: 158.57,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-CMP-260911-001',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 180,
      retailRate: 200,
      lineTotal: 33300.0,
      isNewProduct: false,
    },
    {
      id: 'quote_item_2',
      rawName: 'CAMPA NEON BOOST 150ML PET',
      productName: 'Campa Neon Boost 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      hsn: '22021090',
      qty: 75,
      freeQty: 0,
      unitPrice: 158.57,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-CMP-260911-002',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 180,
      retailRate: 200,
      lineTotal: 16650.0,
      isNewProduct: false,
    },
    {
      id: 'quote_item_3',
      rawName: 'CAMPA LEMON BOOST 150ML PET',
      productName: 'Campa Lemon Boost 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      hsn: '22021090',
      qty: 75,
      freeQty: 0,
      unitPrice: 158.57,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-CMP-260911-003',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 180,
      retailRate: 200,
      lineTotal: 16650.0,
      isNewProduct: false,
    },
    {
      id: 'quote_item_4',
      rawName: 'CAMPA ORANGE BOOST 150ML PET',
      productName: 'Campa Orange Boost 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      hsn: '22021090',
      qty: 45,
      freeQty: 0,
      unitPrice: 158.57,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-CMP-260911-004',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 180,
      retailRate: 200,
      lineTotal: 9990.0,
      isNewProduct: false,
    },
    {
      id: 'quote_item_5',
      rawName: 'CAMPA PURPLE BOOST 150ML PET',
      productName: 'Campa Purple Boost 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      hsn: '22021090',
      qty: 30,
      freeQty: 0,
      unitPrice: 158.57,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-CMP-260911-005',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 180,
      retailRate: 200,
      lineTotal: 6660.0,
      isNewProduct: false,
    },
    {
      id: 'quote_item_6',
      rawName: 'E.H. VIBE COLA 150ML',
      productName: 'E.H. Vibe Cola 150ml',
      category: 'vibe',
      pack: 'PET',
      volume: 150,
      hsn: '22021010',
      qty: 50,
      freeQty: 0,
      unitPrice: 150.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-VB-260911-006',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 170,
      retailRate: 190,
      lineTotal: 10500.0,
      isNewProduct: false,
    },
    {
      id: 'quote_item_7',
      rawName: 'E.H. VIBE ORANGE 150ML PET',
      productName: 'E.H. Vibe Orange 150ml PET',
      category: 'vibe',
      pack: 'PET',
      volume: 150,
      hsn: '22021010',
      qty: 50,
      freeQty: 0,
      unitPrice: 150.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-VB-260911-007',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 170,
      retailRate: 190,
      lineTotal: 10500.0,
      isNewProduct: false,
    },
    {
      id: 'quote_item_8',
      rawName: 'E.H. VIBE CLEAR LEMON 150ML PET',
      productName: 'E.H. Vibe Clear Lemon 150ml PET',
      category: 'vibe',
      pack: 'PET',
      volume: 150,
      hsn: '22021010',
      qty: 50,
      freeQty: 0,
      unitPrice: 150.0,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-VB-260911-008',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 170,
      retailRate: 190,
      lineTotal: 10500.0,
      isNewProduct: false,
    },
    {
      id: 'quote_item_9',
      rawName: 'SOSYO JOOS MANGO 150ML PET',
      productName: 'Sosyo Joos Mango 150ml PET',
      category: 'joos',
      pack: 'PET',
      volume: 150,
      hsn: '22029920',
      qty: 10,
      freeQty: 0,
      unitPrice: 202.15,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      batchNumber: 'LOT-JS-260911-009',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 225,
      retailRate: 240,
      lineTotal: 2122.6,
      isNewProduct: false,
    },
    {
      id: 'quote_item_10',
      rawName: 'SOSYO JOOS APPLE 150ML PET',
      productName: 'Sosyo Joos Apple 150ml PET',
      category: 'joos',
      pack: 'PET',
      volume: 150,
      hsn: '22029920',
      qty: 10,
      freeQty: 0,
      unitPrice: 202.15,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      batchNumber: 'LOT-JS-260911-010',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 225,
      retailRate: 240,
      lineTotal: 2122.6,
      isNewProduct: false,
    },
    {
      id: 'quote_item_11',
      rawName: 'SOSYO JOOS MIX FRUIT 150ML PET',
      productName: 'Sosyo Joos Mix Fruit 150ml PET',
      category: 'joos',
      pack: 'PET',
      volume: 150,
      hsn: '22029920',
      qty: 10,
      freeQty: 0,
      unitPrice: 202.15,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      batchNumber: 'LOT-JS-260911-011',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 225,
      retailRate: 240,
      lineTotal: 2122.6,
      isNewProduct: false,
    },
    {
      id: 'quote_item_12',
      rawName: 'SOSYO JOOS NIMBU PAANI 150ML PET',
      productName: 'Sosyo Joos Nimbu Paani 150ml PET',
      category: 'joos',
      pack: 'PET',
      volume: 150,
      hsn: '22029920',
      qty: 5,
      freeQty: 0,
      unitPrice: 202.15,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      batchNumber: 'LOT-JS-260911-012',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 225,
      retailRate: 240,
      lineTotal: 1061.3,
      isNewProduct: false,
    },
    {
      id: 'quote_item_13',
      rawName: 'SOSYO RUNNER GOLD 150ML PET',
      productName: 'Sosyo Runner Gold 150ml PET',
      category: 'vibe',
      pack: 'PET',
      volume: 150,
      hsn: '22021090',
      qty: 100,
      freeQty: 0,
      unitPrice: 158.57,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-SSY-260911-013',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 180,
      retailRate: 200,
      lineTotal: 22200.0,
      isNewProduct: true, // Example new product
    },
    {
      id: 'quote_item_14',
      rawName: 'SOSYO RUNNER BERRY 150ML PET',
      productName: 'Sosyo Runner Berry 150ml PET',
      category: 'vibe',
      pack: 'PET',
      volume: 150,
      hsn: '22021090',
      qty: 100,
      freeQty: 0,
      unitPrice: 158.57,
      discountPercent: 0,
      discountAmount: 0,
      schemeType: 'none',
      schemeDescription: '',
      cgstPercent: 20.0,
      sgstPercent: 20.0,
      batchNumber: 'LOT-SSY-260911-014',
      expiryDate: '2027-03-31',
      mfgDate: '2026-09-01',
      wholesaleRate: 180,
      retailRate: 200,
      lineTotal: 22200.0,
      isNewProduct: true, // Example new product
    },
  ],
};

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

  let supplierName = 'RADHIKA ENTERPRISES';
  let supplierGstin = '21FSDPR8480R1ZU';
  let supplierAddress = 'Main Road, Near Bus Stand, Kuchinda, Sambalpur, Odisha - 768222';
  let supplierPhone = '+91 94370 84801';
  let supplierEmail = 'radhika.beverages@gmail.com';
  let invoiceNo = `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
  let invoiceDate = new Date().toISOString().slice(0, 10);
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
    if (/radhika/i.test(lineStr)) supplierName = 'RADHIKA ENTERPRISES';
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
    const unitPrice = parseNumericCell(rateKey ? row[rateKey] : 158.57, 158.57);
    const hsn = hsnKey && row[hsnKey] ? String(row[hsnKey]).trim() : '22021090';

    let cgstPercent = cgstKey ? parseNumericCell(row[cgstKey], 20) : 20;
    let sgstPercent = sgstKey ? parseNumericCell(row[sgstKey], 20) : 20;
    if (igstKey && row[igstKey]) {
      const totalGst = parseNumericCell(row[igstKey], 40);
      cgstPercent = totalGst / 2;
      sgstPercent = totalGst / 2;
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
    const tax = (taxable * (cgstPercent + sgstPercent)) / 100;
    const lineTotal = taxable + tax;
    const totalUnits = qty + freeQty;
    const landedCost = totalUnits > 0 ? lineTotal / totalUnits : unitPrice;

    const { isNewProduct, matchedProduct } = matchProductCatalog(rawName, catalog);
    const cat = (catKey && row[catKey] ? String(row[catKey]).toLowerCase() : null) as CategoryKey ||
      matchedProduct?.category ||
      detectCategory(rawName);
    const detectedPackVol = detectPackAndVolume(rawName);
    const pack = packKey && row[packKey] ? String(row[packKey]).trim() : matchedProduct?.pack || detectedPackVol.pack;
    const volume = volKey && row[volKey] ? parseNumericCell(row[volKey], detectedPackVol.volume) : matchedProduct?.volume || detectedPackVol.volume;

    const wholesaleRate = wsRateKey && row[wsRateKey]
      ? parseNumericCell(row[wsRateKey], Math.round(landedCost * 1.15))
      : matchedProduct?.wholesale || Math.round(landedCost * 1.15) || Math.round(unitPrice * 1.15);

    const retailRate = retRateKey && row[retRateKey]
      ? parseNumericCell(row[retRateKey], Math.round(landedCost * 1.25))
      : matchedProduct?.retail || Math.round(landedCost * 1.25) || Math.round(unitPrice * 1.25);

    const batchNumber = batchKey && row[batchKey]
      ? String(row[batchKey]).trim()
      : matchedProduct?.batchNumber || generateBatchNumber(rawName);

    const expiryDate = expKey && row[expKey]
      ? String(row[expKey]).trim()
      : matchedProduct?.expiry || '2027-03-31';

    const mfgDate = mfgKey && row[mfgKey]
      ? String(row[mfgKey]).trim()
      : new Date().toISOString().slice(0, 10);

    const schemeLabel = schemeLabelKey && row[schemeLabelKey] ? String(row[schemeLabelKey]).trim() : '';

    parsedItems.push({
      id: `parsed_${Date.now()}_${idx}`,
      rawName,
      productName: matchedProduct ? matchedProduct.name : rawName,
      category: cat,
      pack,
      volume,
      hsn: matchedProduct?.hsn || hsn,
      qty,
      freeQty,
      unitPrice,
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
 * Call Server-Side Gemini API with Multimodal Image or PDF
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

  // Convert file to base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });

  const mimeType = isPdf ? 'application/pdf' : file.type || `image/${extension === 'jpg' ? 'jpeg' : extension}`;

  const response = await fetch('/api/recognize-invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileBase64: base64Data,
      mimeType,
      fileName: file.name,
    }),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const message = errorJson.error || `Server returned ${response.status}: Failed to recognize invoice.`;
    const err = new Error(message);
    (err as any).status = response.status;
    (err as any).isTemporary = errorJson.isTemporary || response.status === 503;
    throw err;
  }

  const result = await response.json();
  const data = result.data;

  // Process raw AI items and enrich with catalog match & calculations
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const processedItems: ParsedInvoiceItem[] = rawItems.map((item: any, idx: number) => {
    const rawName = String(item.rawName || item.productName || `Item ${idx + 1}`).trim();
    const { isNewProduct, matchedProduct } = matchProductCatalog(rawName, catalog);
    const category = matchedProduct?.category || (item.category as CategoryKey) || detectCategory(rawName);
    const { pack, volume } = detectPackAndVolume(rawName);

    const qty = Math.max(1, Number(item.qty) || 1);
    const freeQty = Math.max(0, Number(item.freeQty) || 0);
    const unitPrice = Number(item.unitPrice) || 158.57;
    const discountPercent = Number(item.discountPercent) || 0;
    const discountAmount =
      Number(item.discountAmount) || (qty * unitPrice * discountPercent) / 100;

    const cgstPercent = Number(item.cgstPercent) || 20;
    const sgstPercent = Number(item.sgstPercent) || 20;

    const grossAmount = qty * unitPrice;
    const taxable = grossAmount - discountAmount;
    const tax = (taxable * (cgstPercent + sgstPercent)) / 100;
    const lineTotal = Number(item.lineTotal) || taxable + tax;

    let schemeType: 'none' | 'free_cases' | 'discount_percent' | 'discount_flat' = 'none';
    if (freeQty > 0) schemeType = 'free_cases';
    else if (discountPercent > 0) schemeType = 'discount_percent';

    return {
      id: `ai_item_${Date.now()}_${idx}`,
      rawName,
      productName: matchedProduct ? matchedProduct.name : item.productName || rawName,
      category,
      pack: matchedProduct?.pack || item.pack || pack,
      volume: matchedProduct?.volume || item.volume || volume,
      hsn: matchedProduct?.hsn || String(item.hsn || '22021090'),
      qty,
      freeQty,
      unitPrice,
      discountPercent,
      discountAmount,
      schemeType,
      schemeDescription: item.schemeDescription || (freeQty > 0 ? `+${freeQty} Bonus Crates` : ''),
      cgstPercent,
      sgstPercent,
      batchNumber:
        matchedProduct?.batchNumber || item.batchNumber || generateBatchNumber(rawName),
      expiryDate:
        matchedProduct?.expiry || item.expiryDate || '2027-03-31',
      mfgDate: item.mfgDate || new Date().toISOString().slice(0, 10),
      wholesaleRate:
        matchedProduct?.wholesale || Math.round((lineTotal / (qty + freeQty)) * 1.15) || Math.round(unitPrice * 1.15),
      retailRate:
        matchedProduct?.retail || Math.round((lineTotal / (qty + freeQty)) * 1.25) || Math.round(unitPrice * 1.25),
      lineTotal,
      isNewProduct,
      matchedProductId: matchedProduct?.id,
      matchedProductName: matchedProduct?.name,
      existingStock: matchedProduct?.opening,
    };
  });

  return {
    supplierName: data.supplierName || 'RADHIKA ENTERPRISES',
    supplierGstin: data.supplierGstin || '21FSDPR8480R1ZU',
    invoiceNo: data.invoiceNo || `INV-${new Date().getFullYear()}-001`,
    invoiceDate: data.invoiceDate || new Date().toISOString().slice(0, 10),
    vehicleNo: data.vehicleNo || 'OD15AF7869',
    placeOfSupply: data.placeOfSupply || 'Odisha (21)',
    billedTo: data.billedTo || '',
    shippedTo: data.shippedTo || '',
    overallDiscount: Number(data.overallDiscount) || 0,
    grandTotal: Number(data.grandTotal) || processedItems.reduce((s, it) => s + it.lineTotal, 0),
    totalCases: Number(data.totalCases) || processedItems.reduce((s, it) => s + it.qty, 0),
    items: processedItems,
    detectedSource: 'ai_vision',
  };
}
