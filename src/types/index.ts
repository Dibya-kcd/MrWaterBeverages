export type CategoryKey = 'energy' | 'vibe' | 'joos' | 'water' | 'general';

export interface CategoryInfo {
  name: string;
  hsn: string;
  gst: number;
}

export interface Product {
  id: number;
  sku?: string;
  name: string;
  volume: number;
  pack: string;
  category: CategoryKey;
  expiry: string;
  batchNumber?: string;
  mfgDate?: string;
  warehouseId?: string;
  opening: number;
  cost: number;
  retail: number;
  wholesale: number;
  hsn?: string;
  gstRate?: number;
  scheme?: string;
  unitsPerCrate?: number;
  packSize?: string;
  effectiveCost?: number;
  landedCostPerCrate?: number;
  landedCostPerUnit?: number;
}

export type PromotionType = 'bogo' | 'percent' | 'flat';

export interface Promotion {
  id: number;
  name: string;
  type: PromotionType;
  buyQty: number;
  freeQty: number;
  percent: number;
  flatPerCase: number;
  productIds: number[];
}

export type PriceType = 'Retail' | 'Wholesale';

export interface BillItem {
  key: string | number;
  productId: number;
  productName: string;
  category: CategoryKey;
  gst: number;
  priceType: PriceType;
  qty: number;
  rate: number;
  gross: number;
  freeQty: number;
  chargeableQty: number;
  discount: number;
  amount: number;
  promoLabel?: string | null;
  schemeSkipped?: boolean;
  batchNumber?: string;
  hsn?: string;
  expiryDate?: string;
  warehouseId?: string;
}

export interface BillTotals {
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  discount: number;
  additionalDiscount?: number;
}

export interface Bill extends BillTotals {
  id: number;
  retailer: string;
  phone: string;
  date: string;
  items: BillItem[];
  amountPaid: number;
  warehouseId?: string;
  tripId?: number;
  vehicle?: string;
  salesman?: string; // Fallback string for legacy records created before migration
  salesmanId?: string; // Foreign key to salesmen.id
  additionalDiscount?: number;
}

export interface ExistingCustomer {
  name: string;
  phone: string;
  totalBills: number;
  totalBilled: number;
  totalPaid: number;
  balanceDue: number;
  lastBillDate: string;
}

export interface CartState {
  retailer: string;
  phone: string;
  date: string;
  items: BillItem[];
  warehouseId?: string;
  tripId?: number;
  vehicle?: string;
  salesman?: string;
  salesmanId?: string;
  additionalDiscount?: number;
}

export type TripStatus = 'out' | 'closed';

export interface Trip {
  id: number;
  vehicle: string;
  salesman?: string; // Fallback string for legacy records created before migration
  salesmanId?: string; // Foreign key to salesmen.id
  route?: string;
  driver?: string;
  date: string;
  loaded: Record<number, number>;
  returned: Record<number, number>;
  billIds: number[];
  status: TripStatus;
  warehouseId?: string;
}

export interface Salesman {
  id: string; // uuid
  name: string;
  phone: string; // unique login identifier
  pinHash?: string; // never store plaintext
  pin_hash?: string;
  active: boolean; // default true - can deactivate without deleting history
  defaultVehicle?: string;
  default_vehicle?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export type UserRole = 'admin' | 'salesman';

export interface AdminUser {
  role: 'admin';
  email: string;
  name: string;
  id?: string;
}

export interface SalesmanUser {
  role: 'salesman';
  salesman: Salesman;
  name: string;
  phone: string;
  id: string;
}

export type AuthUser = AdminUser | SalesmanUser;

export interface TripProductBreakdown {
  productId: number;
  name: string;
  loaded: number;
  sold: number;
  returned: number;
  discrepancy: number;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  location: string;
  manager: string;
  phone: string;
  capacityCases?: number;
  isDefault: boolean;
  notes?: string;
}

export interface InventoryBatch {
  id: string;
  productId: number;
  sku?: string;
  batchNumber: string;
  supplierInvoiceNo?: string;
  supplierName?: string;
  supplierGstin?: string;
  supplierAddress?: string;
  supplierPhone?: string;
  inwardDate?: string;
  mfgDate?: string;
  expiryDate: string;
  warehouseId: string;
  quantity: number;
  costPrice?: number;
  mrp?: number;
  notes?: string;
  scheme?: string;
  billedQuantity?: number;
  freeQuantity?: number;
  effectiveCostPrice?: number;
  cgstRate?: number;
  sgstRate?: number;
  hsn?: string;
}

export interface StockTransfer {
  id: string;
  date: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  productId: number;
  batchNumber?: string;
  quantity: number;
  referenceNote?: string;
}

export interface AuditEntry {
  productId: number;
  name: string;
  system: number;
  counted: number;
  diff: number;
}

export interface Audit {
  id: number;
  date: string;
  time?: string;
  referenceNote?: string;
  entries: AuditEntry[];
  adjusted: boolean;
}

export type GstMode = 'inclusive' | 'exclusive' | 'off';

export type FontSize = 'standard' | 'large' | 'xlarge';

export type StickyTotalPosition = 'top' | 'bottom';

export type TabId =
  | 'dashboard'
  | 'grn'
  | 'products'
  | 'inventory'
  | 'warehouses'
  | 'promotions'
  | 'billing'
  | 'salesman'
  | 'salesmen'
  | 'trips'
  | 'reports'
  | 'audit'
  | 'settings';

export interface OrganizationProfile {
  name: string;
  tagline: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  gstin: string;
  fssai: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
  invoiceTerms: string;
}

export interface BillingSettings {
  invoicePrefix: string;
  defaultSaleType: PriceType;
  defaultGstMode: GstMode;
  lowStockThreshold: number;
  autoApplyPromotions: boolean;
  roundOffGrandTotal: boolean;
  maxSalesmanDiscountPercent?: number;
}

export type DemoPresetId = 'standard' | 'busy' | 'fresh';

export type BalanceStatusKey = 'good' | 'bad' | 'warn';

export interface BalanceStatus {
  label: 'Paid' | 'Credit' | 'Partial';
  balanceKey: BalanceStatusKey;
  balance: number;
}

export interface PaletteTokens {
  ink: string;
  navy: string;
  amber: string;
  cream: string;
  panel: string;
  muted: string;
  line: string;
  good: string;
  bad: string;
  warn: string;
  focus: string;
}

export interface ImportRow {
  name: string;
  sku?: string;
  opening: number;
  cost: number;
  retail: number;
  wholesale: number;
  volume: number;
  pack: string;
  expiry: string;
  category: CategoryKey;
  batchNumber?: string;
  hsn?: string;
  scheme?: string;
  supplierName?: string;
  supplierGstin?: string;
  supplierAddress?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  vehicleNo?: string;
  placeOfSupply?: string;
  billedTo?: string;
  shippedTo?: string;
  warnings: string[];
}

export type GrnSchemeType = 'none' | 'b2g1' | 'free_cases' | 'discount_percent' | 'discount_flat';
export type GrnSchemeMode = 'inclusive' | 'additive';

export interface InwardToGodownCosts {
  transport: number;
  freight: number;
  loadingLabour: number;
  unloadingLabour: number;
  otherInwardCosts: number;
  totalInwardCost: number;
  inwardCostPerCrate: number;
}

export interface GrnLineItem {
  id: string;
  isNewProduct: boolean;
  productId?: number;
  productName: string; // Description
  category: CategoryKey;
  sku: string; // Auto-generated or existing SKU
  hsn: string; // HSN/SAC
  qty: number; // Billed quantity
  unitPrice: number; // Rate/Price per unit before scheme & tax (ex-GST)

  // Packaging & Unit Specs
  pack?: string;
  volume?: number;
  packSize?: string;
  unitsPerCrate?: number; // e.g. 24 or 30 bottles per crate

  // Invoice rates & GST breakdown
  invoiceRateExGst?: number; // ex-GST rate per crate
  invoiceRateInclGst?: number; // rate per crate including GST
  gstPercent?: number; // total GST % (cgst + sgst)
  gstAmountPerCrate?: number; // GST ₹ per crate
  invoiceUnitRateBottleExGst?: number; // ex-GST rate per bottle/unit
  invoiceUnitRateBottleInclGst?: number; // incl-GST rate per bottle/unit

  // Scheme / manual discount
  schemeType: GrnSchemeType;
  schemeMode?: GrnSchemeMode; // 'inclusive' (default: free crates part of invoiced qty with discount credit) or 'additive' (bonus crates added on top)
  schemeBuyQty?: number; // e.g. 2 for Buy 2 Get 1
  schemeFreeQty?: number; // e.g. 1 for Buy 2 Get 1
  paidQty?: number; // Paid / charged quantity (e.g. 100 out of 150)
  freeQty: number; // Free cases / scheme crates (e.g. 50 out of 150)
  discountPercent?: number; // e.g. 5%
  discountFlat?: number; // e.g. ₹15 off per case
  discountAmount: number; // Total discount in ₹ on this line (credited on invoice for free units)
  schemeText?: string; // e.g. "Buy 2 Get 1 Free (50 Free of 150 cs)"

  // Invoice amounts for audit
  taxableAmount: number; // (qty * unitPrice) - discountAmount
  cgstPercent: number; // e.g. 20%
  sgstPercent: number; // e.g. 20%
  cgstAmount: number;
  sgstAmount: number;
  taxAmount: number; // cgst + sgst
  lineTotal: number; // taxableAmount + taxAmount
  totalReceivedQty: number; // qty + freeQty

  // Effective scheme-adjusted purchase cost (pre-inward)
  effectiveCostPerCrateExGst?: number; // taxableAmount / totalReceivedQty
  effectiveCostPerCrateInclGst?: number; // lineTotal / totalReceivedQty
  effectiveUnitRateExGst?: number; // per bottle
  effectiveUnitRateInclGst?: number; // per bottle

  // Inward godown cost allocation
  inwardCostPerCrate?: number; // allocated share of transport, freight, hamali

  // Final landed cost (including inward costs)
  landedCostPerCrate?: number; // effectiveCostPerCrateInclGst + inwardCostPerCrate
  landedCostPerCrateExGst?: number; // effectiveCostPerCrateExGst + inwardCostPerCrate
  landedCostPerUnit: number; // post-tax landed cost per unit bottle (landedCostPerCrate / unitsPerCrate)
  landedCostPerUnitExGst?: number; // pre-tax landed cost per unit bottle
  effectiveCostPerUnit: number; // backward compatibility: pre-tax landed cost per received unit

  expiry: string;
  mfgDate?: string;
  batchNumber: string;
  wholesaleRate?: number;
  retailRate?: number;
  notes?: string;
}

export interface GRN {
  id: string; // unique ID e.g. "grn_k8f93j2"
  grnNumber: string; // formatted e.g. "GRN-2026-001"
  supplierName: string;
  supplierGstin?: string;
  supplierAddress?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  invoiceNo: string;
  inwardDate: string;
  vehicleNo?: string;
  placeOfSupply?: string;
  billedTo?: string;
  shippedTo?: string;
  warehouseId: string;
  warehouseName?: string;
  items: GrnLineItem[];
  totalBilledQty: number;
  totalFreeQty: number;
  totalPaidQty?: number;
  totalReceivedQty: number;
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalTax: number;
  grandTotal: number;

  // Inward-to-godown direct cost allocation
  inwardCosts?: InwardToGodownCosts;
  totalInwardCost?: number;
  inwardCostPerCrate?: number;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

