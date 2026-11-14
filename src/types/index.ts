export type CategoryKey = 'energy' | 'vibe' | 'joos' | 'water' | 'general';

export interface CategoryInfo {
  name: string;
  hsn: string;
  gst: number;
}

export interface Product {
  id: number;
  /** When this product was last edited (ISO). The newer copy wins when devices sync. */
  updatedAt?: string;
  sku?: string;
  name: string;
  /** Optional Odia (ଓଡ଼ିଆ) display name. Shown when app language is Odia. */
  nameOr?: string;
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
  // Optional product-master fields used for Smart Stock Reconciliation matching
  // (visually/similarly named FMCG products getting mixed up during billing/counting).
  // Fully optional — never required elsewhere in the app.
  brand?: string;
  barcode?: string;
  /** When true, sales/purchases track empty crates with customers / suppliers. */
  returnable?: boolean;
  /** Optional deposit value per crate/bottle (INR). */
  depositPerUnit?: number;
  active?: boolean;
  ratesIncludeGst?: boolean;
}

/** Manual crate / empty-bottle / deposit movements (Crates & deposits screen). */
export type CrateDepositKind =
  | "empties_returned"
  | "empties_issued"
  | "deposit_collected"
  | "deposit_refunded";

export interface CrateDepositRecord {
  id: string;
  date: string;
  partyType: "customer" | "supplier";
  partyName: string;
  partyPhone?: string;
  kind: CrateDepositKind;
  productId?: number;
  productName?: string;
  units: number;
  amount?: number;
  note?: string;
  billId?: number;
  grnId?: string;
  createdAt: string;
}

export type PromotionType =
  | 'bogo'
  | 'percent'
  | 'flat'
  | 'bundle'
  | 'buy_x_get_different_free'
  | 'group_buy_n_get_m_free';

export type GroupFreeItemRule =
  | 'CHEAPEST_IN_GROUP'
  | 'SAME_AS_LAST_ADDED'
  | 'SPECIFIC_PRODUCT'
  | 'CUSTOMER_CHOICE_FROM_GROUP';

export interface Promotion {
  id: number;
  name: string;
  type: PromotionType;
  buyQty: number;
  freeQty: number;
  percent: number;
  flatPerCase: number;
  productIds: number[];
  /** When false, scheme is hidden from billing auto-apply and scheme picker. Default true. */
  isActive?: boolean;
  startDate?: string;
  endDate?: string;

  // Multi-Product Bundle Scheme configuration
  bundleBuyType?: 'specific' | 'any'; // 'specific': Buy all selected products; 'any': Buy any N distinct types
  requiredDistinctTypes?: number; // Number of distinct product types required (e.g. 2 types)
  minQtyPerType?: number; // Minimum quantity required per product type (e.g. 1 case)
  freeRewardChoice?: 'all_eligible' | 'specific'; // 'all_eligible': any product eligible in the scheme can be given as the 1 type free
  freeProductId?: number; // Optional specific/preferred product rewarded for free
  freeProductQty?: number; // Free cases rewarded per bundle (default 1)

  // BUY_X_GET_DIFFERENT_FREE (Buy Product A, get Product B free)
  // Uses productIds (trigger products), buyQty, freeProductId (free product), freeQty

  // GROUP_BUY_N_GET_M_FREE (Buy any N from group, get M free)
  productGroup?: number[]; // list of product IDs in group
  groupCategory?: string; // optional category tag filter for group
  groupBrand?: string; // optional brand tag filter for group
  freeItemRule?: GroupFreeItemRule; // default: 'CHEAPEST_IN_GROUP'
  freeItem?: GroupFreeItemRule; // alias for freeItemRule ('CHEAPEST_IN_GROUP' | 'SAME_AS_LAST_ADDED' | 'SPECIFIC_PRODUCT' | 'CUSTOMER_CHOICE_FROM_GROUP')
  customerChoiceProductId?: number; // optional cashier/customer choice override

  // Scheme integration (migration 007) — all optional for backwards compatibility
  /** Incremented on edit; bills store the version they used so later edits never rewrite history. */
  version?: number;
  /** Global max applications; null/undefined = unlimited. */
  usageLimit?: number;
  usedCount?: number;
  /** Max times this scheme can apply per customer key (name+phone). */
  perCustomerLimit?: number;
  /** 'self' | supplier name / id for funded claims. */
  fundedBy?: string;
  supplierSharePercent?: number;
  supplierName?: string;
  /**
   * Extra engine config:
   * - discountBeforeTax (default true)
   * - disableManualDiscountWhenApplied (default false)
   * - freeOnReturnRequiresQualifyingReturn (default true)
   * - maxPercentCap, priority, exclusive, nearMissThreshold
   */
  config?: {
    discountBeforeTax?: boolean;
    disableManualDiscountWhenApplied?: boolean;
    freeOnReturnRequiresQualifyingReturn?: boolean;
    maxPercentCap?: number;
    priority?: number;
    exclusive?: boolean;
    nearMissThreshold?: number;
    [key: string]: unknown;
  };
}

/** Snapshot of one scheme application stored on a bill / in scheme_applications. */
export interface SchemeApplicationSnapshot {
  id: string;
  schemeId: number;
  schemeVersion: number;
  schemeName: string;
  customerKey?: string;
  discountAmount: number;
  freeQty: number;
  freeProductId?: number;
  freeProductName?: string;
  freeValueAtCost?: number;
  explanation: string;
  skippedReason?: string;
  overridden?: boolean;
  overrideReason?: string;
  status: 'applied' | 'reversed' | 'skipped' | 'overridden';
  fundedBy?: string;
  supplierSharePercent?: number;
}

/** Near-miss hint returned by previewPricing when cart is close to unlocking a scheme. */
export interface SchemeNearMiss {
  schemeId: number;
  schemeName: string;
  message: string;
  unitsNeeded?: number;
  valueNeeded?: number;
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
  /** Explicitly opted out of schemes for this line (never apply any promo/scheme) */
  noScheme?: boolean;
  appliedPromo?: Promotion | null;
  customPriceEdited?: boolean;
  batchNumber?: string;
  /** First-expiry-first-out allocation recorded when the bill was saved (one entry per batch used). */
  batchAllocations?: { batchId: string; batchNumber: string; expiryDate?: string; qty: number }[];
  hsn?: string;
  expiryDate?: string;
  warehouseId?: string;
  isBundleFreeItem?: boolean;
  bundlePromoId?: number;
  /** True when this is a free scheme line (price locked at 0). */
  isFree?: boolean;
  /** Scheme that generated this free / discounted line. */
  schemeId?: number;
  schemeName?: string;
  schemeVersion?: number;
  discountAmount?: number;
  /** Ex-GST purchase cost per case frozen when the bill was saved (batch-weighted), so later stock never changes old margins. */
  costExGst?: number;
  /** Ex-GST value of the line, written by applyCartSchemes (GST is inclusive in list rates). */
  taxable?: number;
  /** Half of the line GST rate, in percent (e.g. 9 for an 18% line). 0 on non-GST invoices. */
  cgstRate?: number;
  cgst?: number;
  sgstRate?: number;
  sgst?: number;
}

export interface BillTotals {
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  discount: number;
  additionalDiscount?: number;
  /** Paise added / removed to round the invoice total to a whole rupee (0 or absent = none). */
  roundOff?: number;
}

/** One audit-trail entry written every time a saved invoice is edited. */
export interface BillEditEntry {
  at: string; // ISO timestamp
  by: string;
  comment: string;
  /** Human readable list of what changed (qty, rate, customer, paid, ...). */
  changes: string[];
  /** True when crates/product/godown/trip changed, i.e. live stock was affected. False = money/details only. */
  stockChanged: boolean;
  totalBefore: number;
  totalAfter: number;
  paidBefore: number;
  paidAfter: number;
}

/** Tax treatment recorded on a bill when it was issued under the tax engine (never recalculated later). */
export interface TaxStamp {
  registrationType: 'regular' | 'composition' | 'unregistered';
  documentType: string;
  ruleVersion: string;
  engineStartDate: string;
  declaration?: string;
  /** Own composition liability on this bill (informational; never charged to the customer). */
  compositionLiability?: { base: number; cgst: number; sgst: number; total: number };
}

export interface Bill extends BillTotals {
  id: number;
  retailer: string;
  phone: string;
  /** Id of the customer record this invoice belongs to (set on new invoices; older ones are matched by name + phone). */
  customerId?: string;
  date: string;
  items: BillItem[];
  amountPaid: number;
  warehouseId?: string;
  tripId?: number;
  vehicle?: string;
  /** E-way bill number (12 digits) generated on the GST portal for this invoice, when goods worth more than Rs 50,000 move. */
  ewayBillNo?: string;
  transporterName?: string;
  /** Transporter GSTIN / TRANSIN, when a transporter is used. */
  transporterId?: string;
  /** Approximate distance in km (needed for the e-way bill). */
  transportDistanceKm?: number;
  /** E-invoice reference number (IRN) received from the e-invoice portal, when e-invoicing applies. */
  irn?: string;
  salesman?: string; // Fallback string for legacy records created before migration
  salesmanId?: string; // Foreign key to salesmen.id
  additionalDiscount?: number;
  paymentDate?: string;
  paymentMode?: PaymentMode;
  paymentNote?: string;
  /**
   * GST supply classification. Default B2C for distributor → unregistered retailers.
   * B2B only when customer GSTIN is captured on the invoice.
   */
  supplyType?: 'B2C' | 'B2B';
  /** Recipient GSTIN when supplyType is B2B (optional). */
  customerGstin?: string;
  /** Invoice format type: 'tax_invoice' (GST B2B) vs 'retail' / 'bill_of_supply' (Non-GST B2C) */
  invoiceType?: 'tax_invoice' | 'bill_of_supply' | 'retail';
  /** Present on bills issued under the tax engine. */
  taxStamp?: TaxStamp;
  isGstInvoice?: boolean;
  /** True when invoice was raised later for stock already issued (uncaptured field sale). */
  isRetrospective?: boolean;
  /** 'cancelled' bills are kept for GST/audit (their invoice number stays consumed) but excluded from stock, dues, trips and reports. */
  status?: 'active' | 'cancelled';
  cancelled?: boolean;
  cancellation?: BillCancellation;
  /** Customer sales returns (credit notes) issued against this invoice. The invoice itself is never edited. */
  returns?: SalesReturn[];
  /** Returns that were cancelled later (audit only; they do not affect stock, credit or ledger). */
  cancelledReturns?: CancelledSalesReturn[];
  /** Audit trail of edits made after the invoice was first saved (oldest first). */
  editHistory?: BillEditEntry[];
  /** ISO time of the last local change to this bill; sync keeps the copy with the newer value. */
  updatedAt?: string;

  // Scheme integration (migration 007) — all optional so old invoices render correctly
  schemeDiscountTotal?: number;
  schemesApplied?: SchemeApplicationSnapshot[];
  schemeVersionMap?: Record<string, number>;
  youSaved?: number;
  manualOverrideLog?: { schemeId: number; reason: string; at: string; by?: string }[];
  schemesEnabledAtSave?: boolean;
  /** Tax breakdown mirrored onto the saved invoice by New Sale (subtotal/cgst/sgst above are the canonical totals). */
  totalTaxable?: number;
  totalCgst?: number;
  totalSgst?: number;
  totalTax?: number;
}

/** One product line of a customer sales return. Restocked crates go back into the godown; scrapped crates stay written off. */
/** What happens to crates a customer returns that cannot be resold (expired / damaged / leaking). */
export type ScrapAction = 'company' | 'discard' | 'undecided';

export interface SalesReturnLine {
  productId: number;
  productName: string;
  restockQty: number;
  scrapQty: number;
  /** Where the scrapped crates go: send back to the company (claim), throw out, or decide later. */
  scrapAction?: ScrapAction;
  /** Godown for restocked crates that cannot be traced to a batch (older bills). Batch-traced crates go back to their own batch's godown. */
  warehouseId?: string;
  /** Which batches the restocked crates are credited back to, so they can be sold again (FEFO) and shown per godown. */
  batchRestocks?: { batchId: string; batchNumber: string; warehouseId?: string; qty: number }[];
  /** Credit for this line, GST included, prorated from what the customer was actually charged. */
  credit: number;
  cgst: number;
  sgst: number;
}

export interface SalesReturn {
  id: string;
  /** e.g. SR-2026-001 */
  creditNoteNo: string;
  date: string; // YYYY-MM-DD
  reason: string;
  lines: SalesReturnLine[];
  totalCredit: number;
  cgst: number;
  sgst: number;
  createdBy?: string;
  /** Set when the return was corrected after it was first saved. */
  revisedAt?: string;
  revisedBy?: string;
  revisionNote?: string;
}

/** A customer return that was cancelled. Kept on the bill for audit only; it no longer counts anywhere. */
export interface CancelledSalesReturn extends SalesReturn {
  cancelledAt: string;
  cancelledBy?: string;
  cancelReason: string;
}

export interface BillCancellation {
  creditNoteNo: string;
  date: string; // YYYY-MM-DD
  reason: string;
  /** Amount already collected on the invoice that is now owed back to the customer. */
  refundDue: number;
  cancelledBy?: string;
}

export type PaymentMode = 'cash' | 'upi' | 'cheque' | 'bank' | 'credit' | 'other';

export interface PaymentRecord {
  id: string; // Unique ID e.g. "pay_k9f3j2"
  billId?: number; // Linked invoice ID if applicable
  customerName: string; // Retailer / Customer Name
  customerId?: string; // Customer record this receipt belongs to (new receipts; older ones are matched by name + phone)
  customerPhone?: string;
  paymentDate: string; // YYYY-MM-DD - accurately maintained payment date
  amount: number; // Payment amount in INR
  mode: PaymentMode; // cash, upi, cheque, bank, credit, other
  referenceNote?: string; // Cheque #, UTR, UPI Txn ID, notes
  recordedBy?: string; // Salesman name or 'Admin'
  salesmanId?: string;
  /** True for money received on account that is NOT applied to any invoice (customer advance). */
  isAdvance?: boolean;
  /** True for money paid back to the customer out of their credit. Stored as a NEGATIVE amount. */
  isRefund?: boolean;
  createdAt: string; // ISO timestamp
  /** ISO time of the last change (e.g. customer rename); sync keeps the newer copy. */
  updatedAt?: string;
}

/** One line of the payment audit trail (who did what to which payment). */
export interface PaymentAuditEntry {
  id: string;
  at: string; // ISO timestamp
  by: string;
  action:
    | 'record'
    | 'edit'
    | 'delete'
    | 'refund'
    | 'apply_advance'
    | 'invoice_cancelled'
    | 'invoice_deleted'
    | 'invoice_edited';
  paymentId?: string;
  billId?: number;
  customerName?: string;
  amount?: number;
  note?: string;
  /** Snapshot of the payment before the change (kept so a deleted payment can be rebuilt by hand). */
  before?: PaymentRecord;
  after?: PaymentRecord;
}

export interface Customer {
  id: string; // Unique ID e.g. "cust_1742081234"
  name: string; // Customer / Retailer / Shop Name
  /** Optional Odia (ଓଡ଼ିଆ) display name. Shown when app language is Odia. */
  nameOr?: string;
  phone: string; // Primary phone
  altPhone?: string; // Secondary contact
  email?: string;
  address?: string; // Shop / Street address
  city?: string; // City / Town / Beat / Market
  route?: string; // Sales route / delivery route
  gstin?: string; // GST Number
  creditLimit?: number; // Maximum credit allowed in INR (0 = no limit)
  openingBalance?: number; // Starting balance due in INR (+ = owes, - = advance)
  notes?: string; // Special instructions, delivery notes
  createdAt: string; // ISO date string
  updatedAt?: string;
  /** Set by the server for a customer a salesman added: lets that salesman keep seeing them. */
  createdBySalesmanId?: string;
  /** The beat (delivery area) this customer belongs to; `route` keeps its name for display. */
  beatId?: string;
  /** Alternate names / previous shop names merged into this unified profile */
  aliases?: string[];
}

export interface ExistingCustomer {
  id?: string;
  name: string;
  /** Optional Odia (ଓଡ଼ିଆ) display name. Shown when app language is Odia. */
  nameOr?: string;
  phone: string;
  altPhone?: string;
  address?: string;
  city?: string;
  gstin?: string;
  creditLimit?: number;
  openingBalance?: number;
  totalBills: number;
  totalBilled: number;
  totalPaid: number;
  /** Amount the customer still owes. Never negative. */
  balanceDue: number;
  /** Money the customer has paid ahead (advance / credit on account). 0 when they owe or are settled. */
  advance?: number;
  lastBillDate: string;
  lastPaymentDate?: string;
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
  warehouseLoads?: Record<string, Record<number, number>>;
  /** Why crates were missing when the trip was closed, per product (see TripShortageEntry). */
  shortageReasons?: Record<number, TripShortageEntry>;
  /** Last-change stamp (ISO). Lets every device keep the newest copy of a trip when merging. */
  updatedAt?: string;
  /** Counts typed on the settlement screen but not yet closed. Kept apart from `returned`, which only counts once the trip is closed. */
  draftReturned?: Record<number, number>;
  /** Cash the salesman handed in when settling the trip (compared with the cash collected on its bills). */
  cashHandedIn?: number;
  /** Cash shortfall recorded at close as owed by the salesman (what was collected in cash minus what was handed in). */
  cashShortBooked?: number;
  /** Amounts the salesman has paid back against that shortfall. */
  cashRecoveries?: TripCashRecovery[];
  /** The shortfall was forgiven: it no longer counts as owed. */
  cashShortWrittenOff?: boolean;
}

export interface TripCashRecovery {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  note?: string;
}

export type TripShortageReason = 'broken' | 'short_loaded' | 'sold_not_billed' | 'other';

export interface TripShortageEntry {
  reason: TripShortageReason;
  /** Crates short for this product when the reason was recorded. */
  qty: number;
  note?: string;
  /** Damage write-off posted to stock for 'broken' crates, so a re-close updates it, not duplicates it. */
  dispositionId?: string;
}

export interface Salesman {
  id: string; // uuid
  name: string;
  phone: string; // unique login identifier
  pinHash?: string; // never store plaintext
  pin_hash?: string;
  hasPin?: boolean;
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
  username?: string;
  id?: string;
}

export interface SalesmanUser {
  role: 'salesman';
  salesman: Salesman;
  name: string;
  phone: string;
  username?: string;
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
  volume?: number;
  pack?: string;
  unitsPerCrate?: number;
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
  landedCostPerCrate?: number;
  cgstRate?: number;
  sgstRate?: number;
  hsn?: string;

  // Supplier scheme traceability (Type A additive free goods received into this batch)
  supplierSchemeId?: string;
  supplierSchemeFreeQty?: number;
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
  /** Godown the count/adjustment applies to. Set on audits that adjusted live stock. */
  warehouseId?: string;
}

export interface Audit {
  id: number;
  date: string;
  time?: string;
  referenceNote?: string;
  entries: AuditEntry[];
  adjusted: boolean;
}

// ================================================================
// SMART STOCK RECONCILIATION & AUDIT
// A separate, more careful workflow from the quick Audit/AuditEntry model above, which
// is left completely untouched (existing quick-audit sessions keep working exactly as
// before). This module NEVER auto-converts a negative variance into a loss: every
// classification below is a recommendation, and only an explicit user confirmation (or,
// for adjustments, an admin approval) ever changes `product.opening` or the ledger.
// ================================================================

export type VarianceClassification =
  | 'matched' // variance = 0
  | 'shortage' // negative variance, not yet explained
  | 'excess' // positive variance, not yet explained
  | 'possible_swap' // shortage/excess pair with a plausible product-substitution match
  | 'unexplained' // no plausible match found, no reason chosen yet
  | 'under_investigation' // auditor is actively looking into it, no reason yet
  | 'reconciled' // a swap or reason was confirmed and, where required, approved
  | 'approved_adjustment'; // a final stock-ledger adjustment was approved & applied

export type InvestigationReason =
  | 'sale_not_recorded'
  | 'wrong_sku_in_sale'
  | 'warehouse_transfer_not_recorded'
  | 'customer_return_not_recorded'
  | 'free_scheme_qty_not_recorded'
  | 'damage'
  | 'leakage'
  | 'expiry'
  | 'loading_unloading_discrepancy'
  | 'counting_error'
  | 'wrong_opening_stock'
  | 'duplicate_missing_transaction'
  | 'unknown_variance';

/** One breakdown line inside a similarity score — kept transparent per spec §5. */
export interface MatchScoreBreakdown {
  factor: 'brand' | 'pack_size' | 'category' | 'name_similarity' | 'mrp' | 'barcode' | 'case_config';
  weight: number; // points this factor could contribute
  awarded: number; // points actually awarded (0..weight)
  note: string; // short human-readable explanation, e.g. "Same brand: Campa"
}

/**
 * A possible SKU-substitution match for one shortage entry, computed live from the
 * product master + the other variances in the same session (see
 * utils/stockReconciliation.ts). Never persisted — always freshly derived so it can
 * never drift from the underlying product data, the same way the Monthly Incentive
 * Report is derived live from bills rather than stored.
 */
export interface SwapSuggestion {
  candidateProductId: number;
  candidateProductName: string;
  candidateVariance: number; // the candidate's own excess (positive) in this session
  matchedQuantity: number; // min(abs(shortage), candidateVariance) — the actual overlap suggested
  score: number; // 0-100, sum of breakdown.awarded
  breakdown: MatchScoreBreakdown[];
  explanation: string; // e.g. "15 units of NEON may have been recorded/sold as POWER."
}

export type ReconciliationDecisionStatus =
  | 'pending' // not yet actioned by the auditor
  | 'swap_confirmed'
  | 'kept_separate' // user explicitly said "no, treat as its own variance"
  | 'suggestion_rejected'
  | 'investigating'
  | 'reason_selected'
  | 'awaiting_approval' // reason/swap chosen, needs admin approval before ledger entry
  | 'approved'
  | 'applied'; // ledger entry written, product.opening updated

export interface VarianceEntry {
  id: string; // stable within the session, e.g. "ve_<productId>"
  productId: number;
  productName: string;
  systemStock: number;
  physicalStock: number;
  variance: number; // physicalStock - systemStock
  classification: VarianceClassification;
  decisionStatus: ReconciliationDecisionStatus;

  // Set once the auditor confirms a swap against a specific candidate in this session.
  confirmedSwapWithProductId?: number;
  confirmedSwapQuantity?: number;

  // Set once the auditor picks an "Other Investigation Reason" (spec §7) instead.
  investigationReason?: InvestigationReason;

  notes?: string;
  attachmentRef?: string;

  // Approval trail (spec §9) — required before this entry can reach 'applied'.
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: string;

  // Filled in once this entry has been written to the stock ledger.
  appliedLedgerEntryId?: string;
}

export interface AuditSession {
  id: string; // e.g. "asess_k9f3j2"
  warehouseId?: string;
  warehouseName?: string;
  date: string;
  time?: string;
  auditorName: string;
  referenceNote?: string;
  entries: VarianceEntry[];
  /** Simple change log: who edited the session/counts afterwards and what changed. */
  editLog?: { at: string; by: string; note: string }[];
  createdAt: string;
  updatedAt: string;
}

/**
 * One confirmed reconciliation action — created the moment an auditor confirms a swap,
 * picks an investigation reason, or an admin approves a final adjustment. This is the
 * audit trail spec §9/§17 require; it never itself mutates stock — see StockLedgerEntry.
 */
export interface ReconciliationTransaction {
  id: string;
  auditSessionId: string;
  varianceEntryId: string;
  type: 'swap' | 'investigation_reason' | 'adjustment';
  fromProductId: number;
  toProductId?: number; // set for 'swap'
  quantity: number;
  reasonCode?: InvestigationReason;
  matchScore?: number; // the score shown to the user at confirmation time, for the record
  notes?: string;
  identifiedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

/**
 * Append-only stock ledger entry (spec §10). This is intentionally scoped to Smart
 * Reconciliation adjustments only — it does not replace or duplicate the app's existing
 * batch/opening-based stock model elsewhere; it is the audit trail for *this* feature's
 * stock-changing actions, and product.opening is updated in lockstep with every entry
 * written here so the two never disagree.
 */
export interface StockLedgerEntry {
  id: string;
  productId: number;
  warehouseId?: string;
  quantity: number; // signed delta applied to product.opening
  transactionType: 'audit_reconciliation';
  referenceAuditSessionId: string;
  referenceReconciliationId: string;
  reason: string; // human-readable, e.g. "Product swap with NEON 150ML" or reason label
  userId?: string;
  userName?: string;
  timestamp: string;
}

export type GstMode = 'inclusive' | 'exclusive' | 'off';

export type FontSize = 'standard' | 'large' | 'xlarge';

export type StickyTotalPosition = 'top' | 'bottom';

export type TabId =
  | 'dashboard'
  | 'customers'
  | 'payments'
  | 'expenses'
  | 'grn'
  | 'products'
  | 'inventory'
  | 'warehouses'
  | 'promotions'
  | 'supplierSchemes'
  | 'billing'
  | 'salesman'
  | 'salesmen'
  | 'trips'
  | 'reports'
  | 'audit'
  | 'settings'
  | 'crates';

export interface OrganizationProfile {
  name: string;
  tagline: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state?: string;
  stateCode?: string;
  gstin: string;
  /**
   * GST registration of this business. Leave unset to keep the legacy behaviour (nothing changes).
   * The tax engine takes over for documents dated on/after `gstEngineStartDate`.
   */
  gstRegistrationType?: 'regular' | 'composition' | 'unregistered';
  compositionCategory?: 'trader' | 'manufacturer' | 'restaurant' | 'service';
  /** First document date (YYYY-MM-DD) governed by the tax engine. Older documents are never re-taxed. */
  gstEngineStartDate?: string;
  fssai: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
  invoiceTerms: string;
  /**
   * Sales beats / delivery routes the owner manages in Settings → Beats & routes.
   * Stored inside the profile JSON so it syncs with the cloud without a schema change.
   * When undefined, the built-in default beat list is used.
   */
  beats?: BeatRouteConfig[];
}

export interface BeatRouteConfig {
  id: string;
  name: string;
  /** Hub / base the van starts from (godown town). */
  hub: string;
  /** Ordered market stops on the beat, excluding the hub. */
  stops: { name: string; code?: string }[];
  active?: boolean;
  /** Salesmen who work this beat (owner sets it in Settings → Beats). */
  salesmanIds?: string[];
}

export interface BillingSettings {
  invoicePrefix: string;
  defaultSaleType: PriceType;
  defaultGstMode: GstMode;
  lowStockThreshold: number;
  autoApplyPromotions: boolean;
  roundOffGrandTotal: boolean;
  maxSalesmanDiscountPercent?: number;
  /**
   * Master feature flag for the scheme engine integration.
   * When false the app behaves exactly as before (legacy computeLine only).
   * Default false so rollout can enable per environment / after QA.
   */
  schemesEnabled?: boolean;
  /**
   * When a scheme is applied, block manual / special discount on the same bill.
   * Default false — scheme first, then manual on net.
   */
  disableManualDiscountWhenSchemeApplied?: boolean;
  /** Staff with this permission may remove a scheme from the current bill (with reason). */
  allowSchemeOverride?: boolean;
  /** Whether to print Lot/Batch numbers and expiry dates on invoices (default: false for clean invoices) */
  showBatchOnInvoice?: boolean;
  /**
   * true (default): GST is charged on free scheme cases too (same as the supplier invoice method); the free value only
   * reduces the taxable amount. false: GST only on what the customer pays, so a free-case scheme and an equivalent
   * custom price give the same tax and profit. Confirm with your CA.
   */
  gstOnFreeCases?: boolean;
  /** Paper for the PDF made by the Download / Print / Share buttons: A4 (full invoice, default) or an 80 mm receipt. */
  defaultInvoicePaper?: 'a4' | '80mm';
  /** Style of the bill text sent on WhatsApp / copied: 'detailed' (emoji summary, default) or 'receipt' (80 mm slip in a fixed-width font). */
  whatsappTextStyle?: 'detailed' | 'receipt';
  /** Characters per line of the receipt text: 32 fits a phone chat, 42 / 48 suit 80 mm printer apps. */
  receiptTextWidth?: 32 | 42 | 48;
  /** 80 mm receipt PDF: print a UPI QR (for the balance due) when the bill is not fully paid and a UPI ID is set. Default on. */
  showUpiQrOnReceipt?: boolean;
  /** 80 mm receipt: also print each product's saved Odia name under the English name. Default off. */
  showOdiaNameOnReceipt?: boolean;
  /** ISO timestamp when billing settings were last updated */
  updatedAt?: string;
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
  /** Inter-state purchase: IGST instead of CGST + SGST. Optional; absent = 0 (legacy lines unchanged). */
  igstPercent?: number;
  igstAmount?: number;
  taxAmount: number; // cgst + sgst + igst
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

  // --- Supplier Scheme (additive layer, separate from the schemeType/freeQty above) ---
  // Type A: extra free CASE received from a named Supplier Scheme, ADDED ON TOP of
  // totalReceivedQty above (never merged into the existing inclusive-mode freeQty).
  supplierSchemeId?: string;
  supplierSchemeFreeQty?: number;
  // Type B: this line is eligible for a pending supplier credit, to be settled later.
  pendingCreditSchemeId?: string;
  pendingCreditEligibleQty?: number;
  pendingCreditExpectedAmount?: number;
}

// ================================================================
// SUPPLIER SCHEME & INCENTIVE SYSTEM
// Separate from customer-facing `Promotion`s (src/types/index.ts above).
// A Promotion affects a customer invoice. A SupplierScheme affects
// purchase cost, stock benefit, or supplier credit — never the customer bill.
// ================================================================

/**
 * Type A ('free_goods'): supplier gives extra free cases with a purchase, on top of
 *   the paid/invoiced quantity (ADDITIVE — distinct from the existing GRN line's own
 *   inclusive-mode `schemeType`/`freeQty`, which already ships and is left untouched).
 * Type B ('pending_credit'): supplier promises a per-product benefit to be settled later
 *   via a Credit Note; the original GRN/invoice is not altered.
 * Type C ('volume_incentive'): supplier pays a rate per case once a monthly sales target
 *   is achieved, settled via a Credit Note.
 */

/** How stock left the warehouse without a normal customer sale. */
export type InventoryDispositionType =
  | 'expiry_return'
  | 'quality_return'
  | 'invoice_error_return'
  | 'return_to_supplier'
  | 'return_to_company'
  | 'free_near_expiry'
  | 'scheme_free_issue'
  | 'expired_writeoff'
  | 'damage_writeoff';

export type DispositionCompensationStatus =
  | 'not_applicable'
  | 'pending'
  | 'partial'
  | 'settled'
  | 'rejected';

/**
 * Where a customer-returned expired crate is in its journey.
 *  held       - sitting in our godown, not yet decided / not yet handed over
 *  sent       - handed to the company / supplier, waiting for their credit note
 *  settled    - company issued a credit note
 *  rejected   - company refused the claim (crates are then thrown out, loss stays with us)
 *  discarded  - thrown out / destroyed by us
 */
export type ReturnStage = 'held' | 'sent' | 'settled' | 'rejected' | 'discarded';

export interface ReturnTracking {
  sourceBillId: number;
  sourceReturnId: string;
  creditNoteNo: string;
  customerName: string;
  /** What the owner chose at the time of the return. */
  decision: ScrapAction;
  stage: ReturnStage;
  sentOn?: string;
  /** Challan no. / vehicle / person the crates were handed to. */
  sentRef?: string;
  discardedOn?: string;
  /** e.g. "Poured out and crates crushed", "Given to scrap dealer". */
  discardMethod?: string;
  log: { date: string; stage: ReturnStage; note?: string }[];
}

/**
 * Supplier return / free near-expiry issue / write-off / send-back.
 * Never mutates the original GRN — always a separate stock + claim document.
 */
export interface InventoryDisposition {
  id: string;
  dispositionType: InventoryDispositionType;
  productId: number;
  productName?: string;
  warehouseId: string;
  warehouseName?: string;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
  quantity: number;
  unit: 'case' | 'unit';
  costPerUnit: number;
  costValue: number;
  supplierName?: string;
  grnId?: string;
  supplierInvoiceNo?: string;
  creditNoteNumber?: string;
  creditNoteDate?: string;
  cnTaxableValue?: number;
  cnCgst?: number;
  cnSgst?: number;
  cnIgst?: number;
  cnTotal?: number;
  compensationStatus: DispositionCompensationStatus;
  compensatedAmount?: number;
  compensatedAt?: string;
  distributedToName?: string;
  distributedToPhone?: string;
  salesmanId?: string;
  salesmanName?: string;
  reason: string;
  notes?: string;
  referenceDocNo?: string;
  attachmentRef?: string;
  createdBy?: string;
  approvedBy?: string;
  /** Optional maker-checker: draft claims need approval before CN settle. */
  approvalStatus?: 'not_required' | 'pending_approval' | 'approved' | 'rejected';
  eventDate: string;
  createdAt: string;
  updatedAt: string;
  /** When true, batch qty was already reduced for this event (idempotent). */
  stockApplied?: boolean;
  /** Supplier scheme expected on the CN (value / % / free BOGO / near-expiry). */
  claimScheme?: string;
  /** Set when this disposal came from a customer return of expired / damaged crates. */
  returnTracking?: ReturnTracking;
  /** Running log of partial CN receipts against this claim. */
  compensationPayments?: {
    id: string;
    date: string;
    amount: number;
    cnNumber?: string;
    note?: string;
  }[];
}

export type SupplierSchemeType = 'free_goods' | 'pending_credit' | 'volume_incentive';

/** Only used by 'volume_incentive' schemes. */
export type SupplierIncentiveCalcMethod = 'all_eligible' | 'excess_only';

export interface SupplierScheme {
  id: string; // e.g. "sscheme_k9f3j2"
  supplierName: string;
  name: string;
  schemeType: SupplierSchemeType;
  productIds: number[]; // product / product group this scheme applies to
  warehouseId?: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD, optional / open-ended
  // 'volume_incentive' fields
  targetQuantity?: number; // monthly target in CASE
  incentiveRate?: number; // ₹ per eligible CASE
  calculationMethod?: SupplierIncentiveCalcMethod;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Links an actual GRN line to a Type A or Type B supplier scheme.
 * Type C ('volume_incentive') achievement is deliberately NOT stored here — it is
 * computed live from posted `Bill`s each time it's viewed (see
 * `computeMonthlyIncentiveAchievement` in utils/supplierSchemes.ts), the same way the
 * rest of this app derives stock live from batches rather than a mutable counter. This
 * means a deleted/edited bill is automatically excluded with no extra bookkeeping, and
 * nothing can drift out of sync with the sales ledger.
 */
export interface SupplierSchemeApplication {
  id: string; // e.g. "sapp_k9f3j2"
  schemeId: string;
  schemeType: 'free_goods' | 'pending_credit';
  grnId: string;
  grnLineId: string;
  productId: number;
  supplierName: string;
  supplierInvoiceNo?: string;
  eligibleQuantity: number; // paid/eligible CASE that earned the benefit
  freeQuantity: number; // Type A only — additive free CASE actually received
  expectedBenefit: number; // Type B only — expected ₹ credit
  warehouseId?: string;
  batchId?: string;
  notes?: string;
  createdAt: string;
}

export type SupplierCreditNoteStatus = 'pending' | 'partially_credited' | 'settled';

/**
 * A supplier credit note. Never overwrites the original GRN/invoice — always a
 * separate, linked transaction. `expectedAmount` is preserved historically even after
 * `actualAmount` is recorded; outstanding = expectedAmount - actualAmount.
 */
export interface SupplierCreditNote {
  id: string; // e.g. "scn_k9f3j2"
  supplierName: string;
  schemeId?: string; // Type B or Type C scheme this settles
  grnId?: string; // Type B: the GRN the benefit was promised on
  productId?: number;
  period?: string; // Type C: "YYYY-MM" month this settles
  creditNoteNumber?: string; // filled once actually received
  creditNoteDate?: string;
  expectedAmount: number;
  actualAmount: number; // 0 until received
  status: SupplierCreditNoteStatus;
  attachmentRef?: string; // filename/URL reference; never overwritten
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyIncentiveRow {
  schemeId: string;
  supplierName: string;
  productId: number;
  productName: string;
  period: string; // "YYYY-MM"
  targetQuantity: number;
  actualEligibleQty: number;
  achieved: boolean;
  incentiveRate: number;
  calculationMethod: SupplierIncentiveCalcMethod;
  expectedCredit: number;
  creditReceived: number;
  outstandingCredit: number;
  status: SupplierCreditNoteStatus | 'not_yet_eligible';
}

/** One field-level change captured when a posted GRN is edited. */
export interface GrnChange {
  scope: 'header' | 'line';
  /** Line item label (product name) when scope === 'line' */
  lineLabel?: string;
  field: string; // human readable e.g. "Invoice No", "Qty (cases)"
  from: string;
  to: string;
}

/** One save of an edited GRN — who, when, why and exactly what changed. */
export interface GrnEditRecord {
  id: string;
  at: string; // ISO timestamp
  by: string;
  reason?: string;
  /** Machine-readable tag for special edits, e.g. 'historical_restore' (accounting-only restore, no stock posted). */
  action?: string;
  changes: GrnChange[];
}

/** A warning that was on screen when the invoice was imported anyway (kept for future tracking). */
export interface GrnImportWarning {
  id: string;
  type: 'cases_mismatch' | 'other';
  message: string;
  /** Numbers behind the warning, e.g. printed vs received cases */
  expected?: number;
  actual?: number;
  difference?: number;
  /** Why the user chose to import anyway (optional) */
  note?: string;
  acknowledgedAt: string; // ISO timestamp
  acknowledgedBy: string;
  /** Set later, once the discrepancy has been rectified via GRN edit */
  resolved?: boolean;
  resolvedAt?: string;
  resolvedNote?: string;
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
  /** Legacy field on older stored GRNs; prefer inwardDate and fall back to this only when reading. */
  invoiceDate?: string;
  vehicleNo?: string;
  placeOfSupply?: string;
  billedTo?: string;
  shippedTo?: string;
  warehouseId: string;
  warehouseName?: string;
  /** Whether inward inventory from this GRN was posted into warehouse stock (defaults to true; false for historical/accounting-only bills) */
  stockPosted?: boolean;
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

  /** Invoice-level supplier discount (₹), e.g. "Less : Discount 15,467" on the print. */
  overallDiscount?: number;
  /** Sum of line-level discountAmount on items. */
  totalLineDiscount?: number;
  /** Gross before line + bill discounts (taxable + tax + discounts), optional audit figure. */
  subtotalBeforeDiscount?: number;

  // Aggregate additive free-goods received under Supplier Schemes on this GRN (Type A),
  // on top of totalReceivedQty. Purely informational/reporting.
  totalSupplierSchemeFreeQty?: number;

  // Inward-to-godown direct cost allocation
  inwardCosts?: InwardToGodownCosts;
  totalInwardCost?: number;
  inwardCostPerCrate?: number;

  notes?: string;

  // Audit trail of every edit made after the GRN was first posted (newest last).
  editHistory?: GrnEditRecord[];

  // Warnings that were acknowledged when this invoice was imported (newest last).
  importWarnings?: GrnImportWarning[];

  createdAt: string;
  updatedAt: string;
}

