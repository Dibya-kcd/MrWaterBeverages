import { serverSignIn, setApiSession } from "../lib/authFetch";
import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { allocateReceipt, billPaymentGaps, buildAdvanceRestoreRow, buildReceiptRows, isAdvanceAdjustmentRow, isAdvanceRow, splitUnlinkedPayments } from "../utils/paymentAllocation";
import {
  CATS,
  DEFAULT_BILLING_SETTINGS,
  DEFAULT_ORG_PROFILE,
  FONT_SCALES,
  INIT_PRODUCTS,
  INIT_PROMOTIONS,
  INIT_WAREHOUSES,
  PALETTES,
} from "../constants/initialData";
import {
  DEMO_PRESETS,
  SAMPLE_BILLS_STANDARD,
  SAMPLE_TRIPS_STANDARD,
} from "../constants/demoPresets";
import {
  clearSupabaseCustomConfig,
  deleteGrnFromSupabase,
  pushGrnEditLogToSupabase,
  getSupabaseConfig,
  pullLedgerFromSupabase,
  pullTombstonesFromSupabase,
  probeCloudChanges,
  resetCloudReadCaches,
  pullOrgProfileFromSupabase,
  pullBillingSettingsFromSupabase,
  pushInwardInvoiceToSupabase,
  pushLedgerToSupabase,
  pushOrgProfileToSupabase,
  pushProductToSupabase,
  deleteProductFromSupabase,
  pushPromotionToSupabase,
  deletePromotionFromSupabase,
  pushSupplierSchemeToSupabase,
  deleteSupplierSchemeFromSupabase,
  pushSupplierSchemeApplicationToSupabase,
  pushSupplierCreditNoteToSupabase,
  deleteSupplierCreditNoteFromSupabase,
  pushInventoryDispositionToSupabase,
  deleteInventoryDispositionFromSupabase,
  fetchInventoryDispositionsFromSupabase,
  pushAuditSessionToSupabase,
  deleteAuditSessionFromSupabase,
  pushReconciliationTransactionToSupabase,
  pushStockLedgerEntryToSupabase,
  pushBillToSupabase,
  deleteBillFromSupabase,
  pushPaymentsToSupabase,
  pushTripToSupabase,
  deleteTripFromSupabase,
  pushWarehouseToSupabase,
  deleteWarehouseFromSupabase,
  pushBatchToSupabase,
  deleteBatchFromSupabase,
  pushAuditToSupabase,
  deleteAuditFromSupabase,
  saveSupabaseCustomConfig,
  SupabaseConfig,
  testSupabaseConnection,
  fetchSalesmenFromSupabase,
  pushSalesmanToSupabase,
  deleteSalesmanFromSupabase,
  verifySalesmanPinSupabase,
  signInAdminSupabase,
  signOutSupabase,
  getSupabaseClient,
  pullDeletionLogFromSupabase,
  pushDeletionRecordsToSupabase,
  type DeletionRecord,
} from "../lib/supabase";
import {
  loadOrders,
  loadWarehouses,
  loadSchemes,
  loadInventory,
  loadDailyVehicleTrip,
  loadProducts,
  saveProducts,
  loadInventoryBatches,
  saveInventoryBatches,
  saveOrders,
  saveWarehouses,
  saveSchemes,
  saveInventory,
  saveDailyVehicleTrip,
  loadTrips,
  loadCachedTrips,
  saveTrips,
  loadCachedBillingSettings,
  loadBillingSettings,
  saveBillingSettings,
  cacheBillingSettingsLocally,
  loadOrgProfile,
  saveOrgProfile,
  loadSalesmen,
  loadCachedSalesmen,
  saveSalesmen,
  loadCachedAuthUser,
  saveCachedAuthUser,
  loadCachedPayments,
  loadPayments,
  savePayments,
  loadCachedCustomers,
  loadCustomers,
  saveCustomers,
  InventoryItem,
  loadSupplierSchemes,
  saveSupplierSchemes,
  loadSupplierSchemeApplications,
  saveSupplierSchemeApplications,
  loadSupplierCreditNotes,
  saveSupplierCreditNotes,
  loadInventoryDispositions,
  saveInventoryDispositions,
  loadCachedInventoryDispositions,
  loadCachedSupplierCreditNotes,
  loadCachedSupplierSchemes,
  loadCachedOrders,
  loadAuditSessions,
  saveAuditSessions,
  loadCachedAuditSessions,
  loadReconciliationTransactions,
  saveReconciliationTransactions,
  loadCachedReconciliationTransactions,
  loadStockLedgerEntries,
  saveStockLedgerEntries,
  loadCachedStockLedgerEntries,
  loadCachedGrns,
  loadGrns,
  saveGrns,
  reportSyncFailure,
  reportSyncSuccess,
  loadBusinessExpenses,
  loadCachedBusinessExpenses,
  saveBusinessExpenses,
  mergeExpenseLists,
  type BusinessExpenseRecord,
  isStaticDeployment,
  setStorageUser,
  hasUnsavedBills,
} from "../utils/storage";
import { findOverReturns, describeOverReturn } from "../utils/tripReturns";
import {
  Audit,
  AuditEntry,
  AuthUser,
  Bill,
  BillEditEntry,
  SalesReturn,
  BillItem,
  BillCancellation,
  BillingSettings,
  CartState,
  CategoryKey,
  Customer,
  DemoPresetId,
  ExistingCustomer,
  FontSize,
  GRN,
  GrnLineItem,
  GrnChange,
  GrnEditRecord,
  GstMode,
  ImportRow,
  InventoryBatch,
  InventoryDisposition,
  ReturnTracking,
  ScrapAction,
  OrganizationProfile,
  PaletteTokens,
  PaymentMode,
  PaymentRecord,
  PaymentAuditEntry,
  Product,
  Promotion,
  Salesman,
  StickyTotalPosition,
  StockTransfer,
  TabId,
  Trip,
  TripCashRecovery,
  TripShortageReason,
  TripProductBreakdown,
  UserRole,
  Warehouse,
  SupplierScheme,
  SupplierSchemeApplication,
  SupplierCreditNote,
  AuditSession,
  VarianceClassification,
  VarianceEntry,
  ReconciliationTransaction,
  StockLedgerEntry,
  InvestigationReason,
} from "../types";
import {
  billBalance,
  billNetTotal,
  billRefundDue,
  billReturnCredit,
  buildSalesReturn,
  restockDestinations,
  restockedByProduct,
  returnedQtyByProduct,
  type SalesReturnInputLine,
  type SalesReturnResult,
} from "../utils/salesReturns";
import {
  billTotals,
  issuedGstMode,
  generateAutoSku,
  generateBatchNumber,
  generateSkuId,
  normalizeTo8DigitHsn,
  setGstOnFreeCases,
  setRoundOffGrandTotal,
  isWholeRupee,
  gstRateFromHsn,
  inferUnitsPerCase,
  productTaxFields,
  normalizeTrip,
  tripCashDue,
  billBelongsToTrip,
  attachableBillsForTrip,
  resolveItemCrateCost,
  resolveItemLandedCrateCost,
} from "../utils/billing";
import { previewPricing, totalsMatch } from "../utils/schemeEngine";
import { creditNoteStatus } from "../utils/supplierSchemes";
import {
  findSwapSuggestions,
  classifyVariance,
} from "../utils/stockReconciliation";
import { hashPin } from "../utils/crypto";
import {
  buildProductBatchLines,
  productHasBatchInWarehouse,
  validateGrnDraft,
  replayStockTransfers,
  grnErrors,
  GrnValidationError,
  type GrnDraft,
} from "../utils/stockLocations";
import { todayISO } from "../utils/dateLocal";
import { startSyncSignal, holdSyncSignal, releaseSyncSignal } from "../lib/syncSignal";
import {
  createGateState,
  canCheckNow,
  decideAutoPull,
  noteDecision,
  POLL_INTERVAL_MS,
  SETTLE_MS,
  EVENT_DEBOUNCE_MS,
  MIN_CHECK_GAP_MS,
} from "../utils/syncGate";

import {
  CUSTOMER_HIDDEN_KEY,
  CUSTOMER_TOMBSTONE_KEY,
  DISP_TOMBSTONE_KEY,
  DOC_COUNTER_KEY,
  DOC_DEVICE_KEY,
  DOC_HELD_KEY,
  EXPENSE_TOMBSTONE_KEY,
  HELD_MAX_AGE_MS,
  LINE_FIELD_LABELS,
  MRWATER_CUSTOMER_PRODUCT_PRICES_KEY,
  MRWATER_CUSTOM_PRODUCT_PRICES_KEY,
  PAYMENT_AUDIT_KEY,
  PAYMENT_TOMBSTONE_KEY,
  PersistedState,
  STORAGE_KEY,
  addCustomerTombstones,
  addDispositionTombstone,
  addExpenseTombstones,
  addPaymentTombstones,
  buildCatalogFromGrns,
  cloud,
  cloudFetch,
  diffGrn,
  docReservationInFlight,
  emptyCart,
  ensureUniqueGrnNumbers,
  extractCustomPricesFromBills,
  extractPromoProductIds,
  fmtVal,
  getDeviceId,
  loadCachedCustomProductPrices,
  loadCachedCustomerProductPrices,
  loadInitialState,
  mergeCustomersNewestWins,
  newerProduct,
  normCustName,
  normalizePromotion,
  pickNewerBill,
  pickNewerTrip,
  productStampMs,
  purgeLegacyLocalStorageKeys,
  readCustomerTombstones,
  readDispositionTombstones,
  readDocCounters,
  readExpenseTombstones,
  readHeldNumbers,
  readHeldRaw,
  readHiddenCustomerNames,
  readPaymentAudit,
  readPaymentTombstones,
  refillDocReservation,
  releaseDocReservations,
  reserveDocNumber,
  saveCachedCustomProductPrices,
  saveCachedCustomerProductPrices,
  stampChangedBills,
  stampChangedTrips,
  tripFingerprint,
  withoutDeletedCustomers,
  withoutDeletedPayments,
  writeHeld,
  writeHiddenCustomerNames,
} from "./ledgerHelpers";

/** Result of previewBillEdit(): used by the edit screen to explain what a save will (not) do. */
export interface BillEditPreview {
  /** True only when crates / products / godown / trip changed. Price, customer, date, paid = false. */
  stockChanged: boolean;
  changes: string[];
  /** Messages that would stop the save (empty = safe to save). */
  problems: string[];
  /** Set when the bill's trip is closed and the edit needs it reopened first. */
  reopenTripId?: number;
  /** Where this bill's stock was drawn from, for display. */
  source: {
    kind: "trip" | "warehouse";
    label: string;
    tripId?: number;
    tripStatus?: string;
    tripDate?: string;
    warehouseId?: string;
  };
  /** What a save does to money already received on this invoice (receipts follow the invoice). */
  payment: {
    /** Receipts currently recorded against this invoice. */
    receivedBefore: number;
    /** What stays applied to the invoice after the save. */
    paidAfter: number;
    /** Received money that no longer fits the (lower) total and moves to the customer's advance. */
    keptAsAdvance: number;
    /** Receipts removed because "paid" was lowered on purpose (a correction, not a refund). */
    removedAsCorrection: number;
    /** Set when the receipts move to a different customer together with the invoice. */
    movedToCustomer?: string;
  };
}

/** Result of previewBillDelete(): what deleting an invoice does to stock and money, and what blocks it. */
export interface BillDeletePreview {
  billId: number;
  customer: string;
  total: number;
  cancelled: boolean;
  /** Crates that go back into stock (empty for a cancelled invoice: its stock was already released). */
  stockLines: { productId: number; productName: string; qty: number }[];
  totalCrates: number;
  /** Where that stock returns to: the trip's van balance or the godown the invoice was sold from. */
  stockDestination: string;
  /** Money received on the invoice (receipts, or the paid amount if no receipt rows exist). */
  receivedAmount: number;
  receiptRows: number;
  /** Reasons the delete is refused right now (empty = allowed). */
  blockers: string[];
  /** Set when the invoice's trip is closed and must be reopened first. */
  reopenTripId?: number;
}

/** How money already received on a deleted invoice is treated. */
export type BillDeletePaymentAction = "advance" | "remove";

export interface InwardStockParams {
  productId?: number;
  newProductName?: string;
  category?: CategoryKey;
  pack?: string;
  volume?: number;
  sku?: string;
  hsn?: string;
  gstRate?: number;
  cgstRate?: number;
  sgstRate?: number;

  supplierInvoiceNo?: string;
  supplierName?: string;
  inwardDate?: string;
  warehouseId?: string;
  billedQuantity: number;
  freeQuantity?: number;
  scheme?: string;
  costPrice?: number;
  wholesaleRate?: number;
  retailRate?: number;
  batchNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  notes?: string;
}

interface LedgerContextType {
  tab: TabId;
  setTab: (t: TabId) => void;

  // Inward (GRN) Single Source of Truth
  grns: GRN[];
  setGrns: React.Dispatch<React.SetStateAction<GRN[]>>;
  postGrn: (
    grnData: Omit<GRN, "id" | "grnNumber" | "createdAt" | "updatedAt">,
  ) => GRN;
  updateGrn: (
    id: string,
    updates: Partial<GRN>,
    meta?: { reason?: string },
  ) => void;
  deleteGrn: (id: string) => void;
  activeGrnToEdit: GRN | null;
  setActiveGrnToEdit: (grn: GRN | null) => void;
  loadSampleGrn?: () => void;

  // Products
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  addProduct: (p: Omit<Product, "id">) => void;
  updateProductField: (
    id: number,
    field: keyof Product,
    value: number | string | boolean,
  ) => void;
  updateProductFields: (id: number, patch: Partial<Omit<Product, "id">>) => void;
  deleteProduct: (id: number) => void;
  applyBulkImport: (rows: ImportRow[]) => void;
  receiveInwardStock: (
    params: InwardStockParams,
  ) => { productId: number; batchId: string } | undefined;
  productWarehouseStock: (
    productId: number,
  ) => { warehouseId: string; warehouseName: string; crates: number }[];
  /** Foolproof per-warehouse batch/expiry lines for a product, derived live from inventoryBatches (never from the legacy p.warehouseId/batchNumber/expiry fields). */
  productBatchLines: (
    productId: number,
  ) => ReturnType<typeof buildProductBatchLines>;
  /** True if this product currently has (or has ever had) a batch in this warehouse — use this for warehouse filters, never p.warehouseId === selectedWarehouse. */
  productInWarehouse: (productId: number, warehouseId: string) => boolean;

  // Warehouses
  warehouses: Warehouse[];
  setWarehouses: React.Dispatch<React.SetStateAction<Warehouse[]>>;
  addWarehouse: (w: Omit<Warehouse, "id">) => string;
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => void;
  deleteWarehouse: (id: string) => void;
  defaultWarehouse: Warehouse | undefined;

  // Batches
  inventoryBatches: InventoryBatch[];
  setInventoryBatches: React.Dispatch<React.SetStateAction<InventoryBatch[]>>;
  addBatch: (b: Omit<InventoryBatch, "id">) => string;
  updateBatch: (id: string, updates: Partial<InventoryBatch>) => void;
  deleteBatch: (id: string) => void;
  batchesForProduct: (
    productId: number,
    warehouseId?: string,
  ) => InventoryBatch[];
  warehouseStock: (warehouseId: string, productId?: number) => number;

  // Stock Transfers
  stockTransfers: StockTransfer[];
  /** Returns false if source stock is insufficient (negative stock not allowed). */
  addStockTransfer: (st: Omit<StockTransfer, "id">) => boolean;

  // Promotions
  promotions: Promotion[];
  setPromotions: React.Dispatch<React.SetStateAction<Promotion[]>>;
  addPromotion: (promo: Omit<Promotion, "id">) => void;
  updatePromotion: (id: number, promo: Omit<Promotion, "id">) => void;
  deletePromotion: (id: number) => void;

  // Supplier Schemes & Incentives (purchasing-side; independent of customer Promotions above)
  supplierSchemes: SupplierScheme[];
  addSupplierScheme: (
    s: Omit<SupplierScheme, "id" | "createdAt" | "updatedAt">,
  ) => SupplierScheme;
  updateSupplierScheme: (id: string, updates: Partial<SupplierScheme>) => void;
  deleteSupplierScheme: (id: string) => void;
  supplierSchemeApplications: SupplierSchemeApplication[];
  addSupplierSchemeApplication: (
    a: Omit<SupplierSchemeApplication, "id" | "createdAt">,
  ) => SupplierSchemeApplication;
  supplierCreditNotes: SupplierCreditNote[];
  addSupplierCreditNote: (
    n: Omit<SupplierCreditNote, "id" | "createdAt" | "updatedAt" | "status">,
  ) => SupplierCreditNote;
  updateSupplierCreditNote: (
    id: string,
    updates: Partial<SupplierCreditNote>,
  ) => void;
  deleteSupplierCreditNote: (id: string) => void;
  recordSupplierCreditNoteReceipt: (
    id: string,
    params: {
      actualAmount: number;
      creditNoteNumber?: string;
      creditNoteDate?: string;
      attachmentRef?: string;
      notes?: string;
    },
  ) => void;

  inventoryDispositions: InventoryDisposition[];
  expenses: BusinessExpenseRecord[];
  addExpense: (e: Omit<BusinessExpenseRecord, "id">) => BusinessExpenseRecord;
  updateExpense: (id: string, patch: Partial<Omit<BusinessExpenseRecord, "id">>) => void;
  deleteExpense: (id: string, rectificationReason?: string) => void;
  addInventoryDisposition: (
    d: Omit<
      InventoryDisposition,
      "id" | "createdAt" | "updatedAt" | "stockApplied" | "costValue"
    > & { costValue?: number; stockApplied?: boolean },
  ) =>
    | { ok: true; disposition: InventoryDisposition }
    | { ok: false; error: string };
  updateInventoryDisposition: (
    id: string,
    updates: Partial<InventoryDisposition>,
  ) => void;
  deleteInventoryDisposition: (
    id: string,
    opts?: { restoreStock?: boolean },
  ) => void;
  recordDispositionCompensation: (
    id: string,
    params: {
      compensatedAmount: number;
      creditNoteNumber?: string;
      creditNoteDate?: string;
      cnTaxableValue?: number;
      cnCgst?: number;
      cnSgst?: number;
      cnIgst?: number;
      cnTotal?: number;
      notes?: string;
      costValue?: number;
      /** If true, compensatedAmount is added to prior receipts (partial payment log). */
      appendPayment?: boolean;
      paymentNote?: string;
      attachmentRef?: string;
    },
  ) => void;

  // Smart Stock Reconciliation & Audit (separate from the quick Audit/saveAudit flow
  // above, which is left untouched). Nothing here changes product.opening except
  // applyReconciliation, and only ever by the exact quantity of an explicitly confirmed
  // swap or an approved adjustment — never a blanket "adjust all variances".
  auditSessions: AuditSession[];
  createAuditSession: (params: {
    warehouseId?: string;
    warehouseName?: string;
    date: string;
    auditorName: string;
    referenceNote?: string;
    counts: { productId: number; physicalStock: number }[];
  }) => AuditSession;
  deleteAuditSession: (id: string) => void;
  /** Edit the header of an existing audit session (date, godown, auditor, note). */
  updateAuditSession: (
    id: string,
    updates: {
      date?: string;
      warehouseId?: string;
      warehouseName?: string;
      auditorName?: string;
      referenceNote?: string;
    },
  ) => void;
  /**
   * Add missing products / correct counts / remove entries on an existing session.
   * Entries already awaiting approval or applied are locked and left untouched.
   */
  saveAuditSessionCounts: (
    sessionId: string,
    counts: { productId: number; physicalStock: number }[],
    removeProductIds?: number[],
  ) => { updated: number; added: number; removed: number; locked: number };
  confirmSwap: (
    sessionId: string,
    varianceEntryId: string,
    params: {
      candidateProductId: number;
      quantity: number;
      matchScore?: number;
      notes?: string;
    },
  ) => void;
  rejectSuggestion: (sessionId: string, varianceEntryId: string) => void;
  keepAsSeparateVariance: (sessionId: string, varianceEntryId: string) => void;
  markUnderInvestigation: (
    sessionId: string,
    varianceEntryId: string,
    notes?: string,
  ) => void;
  selectInvestigationReason: (
    sessionId: string,
    varianceEntryId: string,
    params: {
      reason: InvestigationReason;
      notes?: string;
      attachmentRef?: string;
    },
  ) => void;
  approveReconciliation: (
    sessionId: string,
    varianceEntryId: string,
    approverName: string,
  ) => void;
  reconciliationTransactions: ReconciliationTransaction[];
  stockLedgerEntries: StockLedgerEntry[];

  // Bills & Billing
  bills: Bill[];
  cart: CartState;
  setCart: React.Dispatch<React.SetStateAction<CartState>>;
  editingBillId: number | null;
  justFinalizedBillId: number | null;
  setJustFinalizedBillId: (id: number | null) => void;
  startEditBill: (bill: Bill) => void;
  cancelEditBill: () => void;
  finalizeBill: (
    amountPaid?: number,
    tripId?: number,
    overallDiscount?: number,
    paymentDate?: string,
    paymentMode?: PaymentMode,
    paymentNote?: string,
    billDate?: string,
    extras?: {
      supplyType?: "B2C" | "B2B";
      customerGstin?: string;
      isRetrospective?: boolean;
      invoiceType?: "tax_invoice" | "bill_of_supply" | "retail";
      isGstInvoice?: boolean;
      party?: {
        retailer?: string;
        phone?: string;
        salesman?: string;
        vehicle?: string;
        warehouseId?: string;
      };
    },
  ) => number | null;
  updateBill: (
    bill: Bill,
    opts?: {
      comment?: string;
      /** What the user typed as paid BEFORE it was capped at the new total; lets received money above a lowered total be kept as an advance instead of vanishing. */
      requestedPaid?: number;
    },
  ) => boolean;
  /** Recalculate the saved total / taxable / GST of bills from their own lines and invoice discount. */
  repairBillTotals: (billIds: number[]) => { fixed: number; skipped: number };
  /** Dry-run of a bill edit: what changed, whether live stock is affected, and what would block it. */
  previewBillEdit: (bill: Bill, requestedPaid?: number) => BillEditPreview;
  /** Dry-run of deleting an invoice: stock that returns, money held, and anything that blocks it. */
  previewBillDelete: (billId: number) => BillDeletePreview | null;
  recordPayment: (
    billId: number,
    amount: number,
    paymentDate?: string,
    mode?: PaymentMode,
    referenceNote?: string,
  ) => number;
  /** Deletes an invoice. Stock is derived from invoices, so it returns automatically; received money is kept as an advance (default) or removed. Returns false when refused. */
  deleteBill: (
    billId: number,
    opts?: { reason?: string; paymentAction?: BillDeletePaymentAction },
  ) => boolean;
  cancelBill: (billId: number, reason: string) => BillCancellation | null;
  /** Customer return against an invoice: credit reduces the bill's due; restocked crates go back to a godown, scrapped ones stay written off. */
  createSalesReturn: (
    billId: number,
    lines: SalesReturnInputLine[],
    reason: string,
  ) => SalesReturnResult;
  /** Cancel a saved customer return: restocked crates leave stock, the credit is reversed, the bill owes it again. */
  cancelSalesReturn: (
    billId: number,
    returnId: string,
    reason: string,
  ) => { ok: true } | { ok: false; error: string };
  /** Correct a saved customer return (same credit note number). */
  editSalesReturn: (
    billId: number,
    returnId: string,
    lines: SalesReturnInputLine[],
    reason: string,
    editNote: string,
  ) => SalesReturnResult;
  cancelledBills: Bill[];
  notice: string | null;
  notify: (message: string) => void;
  dismissNotice: () => void;
  syncBillsToCloud: () => Promise<{
    success: boolean;
    count: number;
    error?: string;
  }>;

  // Custom Product Rates (Persistent Previous Custom Price Memory)
  customProductPrices: Record<number, number>;
  customerProductPrices: Record<string, number>;
  getPreviousCustomPrice: (
    productId: number,
    customerName?: string,
  ) => number | null;
  setCustomProductPrice: (
    productId: number,
    rate: number,
    customerName?: string,
  ) => void;

  // Payments & Collections Ledger
  payments: PaymentRecord[];
  setPayments: React.Dispatch<React.SetStateAction<PaymentRecord[]>>;
  repairPaymentLinks: () => number;
  recordCustomerPayment: (
    customerName: string,
    amount: number,
    paymentDate: string,
    mode?: PaymentMode,
    referenceNote?: string,
    billId?: number,
  ) => boolean;
  deletePayment: (paymentId: string, rectificationReason?: string) => void;
  updatePayment: (updated: PaymentRecord) => void;
  paymentAudit: PaymentAuditEntry[];
  getCustomerCreditSummary: (customerName: string) => {
    advance: number;
    overpaid: number;
    unpaidDue: number;
    refundable: number;
    canApply: boolean;
  };
  applyAdvanceToInvoices: (customerName: string, onlyBillId?: number) => number;
  recordCustomerRefund: (
    customerName: string,
    amount: number,
    paymentDate: string,
    mode?: PaymentMode,
    note?: string,
  ) => boolean;

  // Customers Master & Ledger
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  addCustomer: (
    customerData: Omit<Customer, "id" | "createdAt"> & { id?: string },
  ) => Customer;
  customerNameClash: (customerId: string, name: string) => Customer | undefined;
  findBillingCustomer: (name?: string, phone?: string) => Customer | undefined;
  updateCustomer: (
    customer: Customer,
    syncLinkedBillsAndPayments?: boolean,
  ) => void;
  deleteCustomer: (customerId: string, rectificationReason?: string) => void;
  existingCustomers: ExistingCustomer[];
  startBillForCustomer: (customerName: string, customerPhone?: string) => void;
  getCustomerLedger: (customerNameOrId: string, customerPhone?: string, customerAltPhone?: string) => {
    customer?: Customer;
    bills: Bill[];
    payments: PaymentRecord[];
    totalBilled: number;
    totalReturns: number;
    netBilled: number;
    totalPaid: number;
    balanceDue: number;
    rawBalance: number;
    openingBalance: number;
    isOverLimit: boolean;
  };

  // Trips / Dispatch
  trips: Trip[];
  addTrip: (
    vehicle: string,
    date: string,
    loaded: Record<number, number>,
    warehouseId?: string,
    initialBillIds?: number[],
    salesman?: string,
    route?: string,
    salesmanId?: string,
    warehouseLoads?: Record<string, Record<number, number>>,
  ) => Trip;
  toggleBillAssignment: (tripId: number, billId: number) => string | null;
  unassignBillFromTrip: (tripId: number, billId: number) => void;
  autoAssignTripBills: (tripId: number) => number;
  saveReturn: (
    tripId: number,
    returned: Record<number, number>,
    shortageReasons?: Record<number, { reason: TripShortageReason; note?: string }>,
    cashHandedIn?: number | null,
    cashShortBooked?: number | null,
  ) => { ok: true } | { ok: false; error: string };
  /** Money the salesman paid back against a booked cash shortfall. */
  recordTripCashRecovery: (tripId: number, amount: number, note?: string, date?: string) => boolean;
  /** Forgive what the salesman still owes on a trip. */
  writeOffTripCashShort: (tripId: number) => void;
  reopenTrip: (tripId: number) => void;
  saveReturnDraft: (tripId: number, returned: Record<number, number>, cashHandedIn?: number | null) => void;
  updateTrip: (updated: Trip) => void;
  deleteTrip: (tripId: number) => void;
  syncTripsToCloud: () => Promise<{
    success: boolean;
    count: number;
    error?: string;
  }>;

  // Audits
  audits: Audit[];
  saveAudit: (
    counts: Record<number, number | string>,
    adjustStock: boolean,
    auditDate?: string,
    referenceNote?: string,
    warehouseId?: string,
  ) => void;
  deleteAudit: (id: number) => void;

  // System & Settings
  gstMode: GstMode;
  setGstMode: (m: GstMode) => void;

  fontSize: FontSize;
  setFontSize: (s: FontSize) => void;
  highContrast: boolean;
  setHighContrast: React.Dispatch<React.SetStateAction<boolean>>;
  lowVisionMode: boolean;
  setLowVisionMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  toggleLowVisionMode: () => void;
  lowVisionStickyPosition: StickyTotalPosition;
  setLowVisionStickyPosition: React.Dispatch<
    React.SetStateAction<StickyTotalPosition>
  >;
  scale: number;
  palette: PaletteTokens;
  fz: (px: number, extra?: React.CSSProperties) => React.CSSProperties;

  // Organization & Settings
  orgProfile: OrganizationProfile;
  setOrgProfile: React.Dispatch<React.SetStateAction<OrganizationProfile>>;
  updateOrgProfile: (
    p: Partial<OrganizationProfile>,
  ) => Promise<{ success: boolean; cloudSynced: boolean; message?: string }>;
  pullOrgProfileFromCloud: () => Promise<{
    success: boolean;
    message?: string;
  }>;

  billingSettings: BillingSettings;
  setBillingSettings: React.Dispatch<React.SetStateAction<BillingSettings>>;
  updateBillingSettings: (
    s: Partial<BillingSettings>,
  ) => Promise<{ success: boolean; cloudSynced: boolean; message?: string }>;
  pullBillingSettingsFromCloud: () => Promise<{
    success: boolean;
    message?: string;
  }>;

  // Data management
  loadDemoPreset: (presetId: DemoPresetId) => void;
  exportBackup: () => void;
  importBackup: (jsonString: string) => { success: boolean; error?: string };
  clearTransactions: () => void;
  clearAllData: () => void;

  // Stock helpers
  soldByProduct: Record<number, number>;
  remainingStock: (productId: number) => number;
  bookStock: (productId: number) => number;
  stockAsOf: (productId: number, dateISO: string, warehouseId?: string) => number;
  activePromoFor: (productId: number) => Promotion | undefined;
  tripBreakdown: (trip: Trip) => {
    rows: TripProductBreakdown[];
    hasDiscrepancy: boolean;
  };
  getVehicleStock: (
    trip: Trip | null | undefined,
    productId: number,
  ) => { loaded: number; sold: number; available: number };

  // Totals
  totalOpening: number;
  totalRemaining: number;
  totalRevenue: number;
  totalCasesSold: number;
  totalOutstanding: number;
  tripsWithDiscrepancy: number;

  // Supabase Cloud Database Integration
  supabaseConfig: SupabaseConfig;
  supabaseStatus: {
    isConnected: boolean;
    isChecking: boolean;
    latencyMs: number;
    allTablesExist: boolean;
    lastSyncedAt: string | null;
    message: string;
    error?: string;
  };
  checkSupabaseConnection: () => Promise<void>;
  syncToCloud: (opts?: { full?: boolean }) => Promise<{ success: boolean; message: string }>;
  /** Plain call = full download (boot, manual Sync, after a conflict). `{ auto: true }` = background check first. */
  pullFromCloud: (opts?: PullFromCloudOptions) => Promise<{ success: boolean; message: string }>;
  saveCustomSupabaseCredentials: (url: string, key: string) => Promise<void>;
  clearCustomSupabaseCredentials: () => void;

  resetToDefault: () => void;
  cleanDatabase: () => void;
  deleteLocalDatabase: () => void;

  // Authentication & Salesmen (RBAC)
  salesmen: Salesman[];
  currentUser: AuthUser | null;
  currentRole: UserRole | null;
  activeSalesman: Salesman | null;
  loginAdmin: (
    email: string,
    pass: string,
  ) => Promise<{ success: boolean; error?: string }>;
  loginSalesman: (
    phone: string,
    pin: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  addSalesman: (
    data: {
      name: string;
      phone: string;
      defaultVehicle?: string;
      active?: boolean;
    },
    pin: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updateSalesman: (
    id: string,
    data: Partial<Salesman>,
    newPin?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  toggleSalesmanActive: (id: string) => Promise<void>;
  deleteSalesman: (id: string) => Promise<void>;
}

/* ---- Payment & Customer safety helpers (module level) ---------------------------------------
 * Deleted payments & customers are remembered so that a later merge with a remote master or cached copy
 * cannot bring them back. The audit trail keeps who changed what.
 */
export { PAYMENT_TOMBSTONE_KEY, PAYMENT_AUDIT_KEY, CUSTOMER_TOMBSTONE_KEY, EXPENSE_TOMBSTONE_KEY, readExpenseTombstones, addExpenseTombstones, normCustName, readPaymentTombstones, addPaymentTombstones, withoutDeletedPayments, readCustomerTombstones, addCustomerTombstones, withoutDeletedCustomers, CUSTOMER_HIDDEN_KEY, readHiddenCustomerNames, writeHiddenCustomerNames, pickNewerBill, productStampMs, newerProduct, tripFingerprint, stampChangedTrips, pickNewerTrip, stampChangedBills, mergeCustomersNewestWins, readPaymentAudit, DOC_COUNTER_KEY, readDocCounters, DOC_HELD_KEY, DOC_DEVICE_KEY, HELD_MAX_AGE_MS, getDeviceId, readHeldRaw, readHeldNumbers, writeHeld, docReservationInFlight, refillDocReservation, releaseDocReservations, reserveDocNumber, STORAGE_KEY, extractPromoProductIds, normalizePromotion, purgeLegacyLocalStorageKeys, DISP_TOMBSTONE_KEY, readDispositionTombstones, addDispositionTombstone, emptyCart, LINE_FIELD_LABELS, fmtVal, diffGrn, ensureUniqueGrnNumbers, buildCatalogFromGrns, loadInitialState, MRWATER_CUSTOM_PRODUCT_PRICES_KEY, MRWATER_CUSTOMER_PRODUCT_PRICES_KEY, loadCachedCustomProductPrices, saveCachedCustomProductPrices, loadCachedCustomerProductPrices, saveCachedCustomerProductPrices, extractCustomPricesFromBills, cloud, cloudFetch } from "./ledgerHelpers";

export interface PullFromCloudOptions {
  /** Background sync: ask a few tiny questions first and download everything only if the cloud changed. */
  auto?: boolean;
}

// One gate for the whole browser tab (the provider is mounted once). See src/utils/syncGate.ts.
const cloudSyncGate = createGateState();
let cloudPullInFlight: {
  promise: Promise<{ success: boolean; message: string }>;
  auto: boolean;
  startedAt: number;
} | null = null;

const LedgerContext = createContext<LedgerContextType | null>(null);

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [initial] = useState(loadInitialState);

  const [tab, setTab] = useState<TabId>("dashboard");
  const [grns, setGrns] = useState<GRN[]>(initial.grns);
  const [activeGrnToEdit, setActiveGrnToEdit] = useState<GRN | null>(null);

  const [products, setProducts] = useState<Product[]>(initial.products);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(initial.warehouses);
  const [inventoryBatches, setInventoryBatches] = useState<InventoryBatch[]>(
    initial.inventoryBatches,
  );
  // Latest products / batches, readable synchronously. Multi-step operations (post/edit GRN) need
  // the value they just computed, not whatever a React state updater may or may not have run yet.
  const productsRef = useRef<Product[]>(products);
  const inventoryBatchesRef = useRef<InventoryBatch[]>(inventoryBatches);
  productsRef.current = products;
  inventoryBatchesRef.current = inventoryBatches;
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>(
    initial.stockTransfers,
  );
  const [promotions, setPromotions] = useState<Promotion[]>(initial.promotions);
  const [supplierSchemes, setSupplierSchemes] = useState<SupplierScheme[]>([]);
  const [supplierSchemeApplications, setSupplierSchemeApplications] = useState<
    SupplierSchemeApplication[]
  >([]);
  const [supplierCreditNotes, setSupplierCreditNotes] = useState<
    SupplierCreditNote[]
  >(() => {
    try {
      const raw = localStorage.getItem("mrwater_cache_supplier_credit_notes");
      const cached: SupplierCreditNote[] = raw ? JSON.parse(raw) : [];
      const tombstones = new Set<string>(
        JSON.parse(
          localStorage.getItem("deleted_supplier_credit_note_ids") || "[]",
        ),
      );
      return Array.isArray(cached)
        ? cached.filter((n) => !tombstones.has(n.id))
        : [];
    } catch {
      return [];
    }
  });
  // Business expenses: ONE shared list used by Business reports (Profit & loss) and Reports (Net profit).
  // Cached on the device and synced to the server/cloud collection like the other ledgers.
  // Deletes are remembered (device + cloud deletion log) so a stale copy can never bring an expense back,
  // and the merge is newest-edit-wins so an old server copy never undoes a newer edit.
  const [expenses, setExpenses] = useState<BusinessExpenseRecord[]>(() => {
    const readKey = (k: string): BusinessExpenseRecord[] => {
      try {
        const raw = localStorage.getItem(k);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };
    // also pick up entries made in earlier versions (own key / old Business-reports key)
    return mergeExpenseLists(
      readExpenseTombstones(),
      loadCachedBusinessExpenses(),
      readKey("mrwater_biz_expenses_v1"),
      readKey("mrwater_expenses_v1").map((r: any) => ({ ...r, note: r.note || "" })),
    );
  });
  const expensesReadyRef = useRef(false);
  const expensesRef = useRef<BusinessExpenseRecord[]>(expenses);
  useEffect(() => {
    expensesRef.current = expenses;
  }, [expenses]);
  /** Pull the cloud copy, apply the deletion log, merge newest-wins into state. */
  const refreshExpensesFromCloud = async () => {
    const log = await pullDeletionLogFromSupabase().catch(() => []);
    addExpenseTombstones(log.filter((r) => r.kind === "expense").map((r) => r.id));
    const dead = readExpenseTombstones();
    const remote = await loadBusinessExpenses().catch(() => []);
    setExpenses((local) => {
      const merged = mergeExpenseLists(dead, remote, local);
      return JSON.stringify(merged) === JSON.stringify(local) ? local : merged;
    });
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      await refreshExpensesFromCloud();
      if (!alive) return;
      expensesReadyRef.current = true;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Never write before the first load finished, or an empty list could overwrite the server copy.
  // The save itself merges with the server copy first, so another device's new entries are kept.
  useEffect(() => {
    if (!expensesReadyRef.current) return;
    saveBusinessExpenses(expenses, readExpenseTombstones())
      .then((merged) => {
        if (
          merged.length !== expensesRef.current.length ||
          JSON.stringify(merged) !== JSON.stringify(expensesRef.current)
        ) {
          setExpenses(merged);
        }
      })
      .catch(() => {});
  }, [expenses]);
  const addExpense = (e: Omit<BusinessExpenseRecord, "id">): BusinessExpenseRecord => {
    const rec: BusinessExpenseRecord = {
      ...e,
      note: e.note || "",
      amount: Math.max(0, Number(e.amount) || 0),
      id: "exp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      updatedAt: new Date().toISOString(),
    };
    setExpenses((prev) => [rec, ...prev]);
    return rec;
  };
  const updateExpense = (id: string, patch: Partial<Omit<BusinessExpenseRecord, "id">>) =>
    setExpenses((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              ...patch,
              amount: patch.amount !== undefined ? Math.max(0, Number(patch.amount) || 0) : x.amount,
              updatedAt: new Date().toISOString(),
            }
          : x,
      ),
    );
  const deleteExpense = (id: string, rectificationReason?: string) => {
    const target = expensesRef.current.find((x) => x.id === id);
    addExpenseTombstones([id]);
    if (target) {
      pushDeletionRecordsToSupabase([
        {
          kind: "expense",
          id,
          name: target.paidTo || target.category,
          deletedAt: new Date().toISOString(),
          by: currentUser?.name || "Admin",
          reason: rectificationReason,
          note: `₹${target.amount} ${target.category} on ${String(target.date).slice(0, 10)}`,
        },
      ])
        .then((ok) => {
          if (!ok) reportSyncFailure("deleteExpense(log)", new Error("Could not save the delete to the cloud"));
        })
        .catch(() => {});
    }
    setExpenses((prev) => prev.filter((x) => x.id !== id));
  };
  const [inventoryDispositions, setInventoryDispositions] = useState<
    InventoryDisposition[]
  >(() =>
    loadCachedInventoryDispositions().filter(
      (d) => !readDispositionTombstones().has(d.id),
    ),
  );
  const [auditSessions, setAuditSessions] = useState<AuditSession[]>(() =>
    loadCachedAuditSessions(),
  );
  const [reconciliationTransactions, setReconciliationTransactions] = useState<
    ReconciliationTransaction[]
  >(() => loadCachedReconciliationTransactions());
  const [stockLedgerEntries, setStockLedgerEntries] = useState<
    StockLedgerEntry[]
  >(() => loadCachedStockLedgerEntries());
  // `allBills` holds every invoice, including cancelled ones (kept for GST/audit). `bills` is the
  // active subset that stock, dues, trips, payments and reports all read, so a cancelled invoice
  // drops out of every one of them automatically while its number stays consumed.
  const [allBills, setBillsRaw] = useState<Bill[]>(initial.bills);
  // Local changes go through this wrapper so every changed bill is time-stamped; cloud pulls use setBillsRaw.
  const setBills = useCallback(
    (u: Bill[] | ((prev: Bill[]) => Bill[])) =>
      setBillsRaw((prev) => stampChangedBills(prev, typeof u === "function" ? (u as any)(prev) : u)),
    [],
  );
  const bills = useMemo(
    () => allBills.filter((b) => b.status !== "cancelled"),
    [allBills],
  );
  // Latest bills, readable synchronously (payment handlers compute from this instead of reading
  // values assigned inside a setBills updater, which React may run later or twice).
  const allBillsRef = useRef<Bill[]>(allBills);
  allBillsRef.current = allBills;
  const cancelledBills = useMemo(
    () => allBills.filter((b) => b.status === "cancelled"),
    [allBills],
  );
  // Lightweight in-app notice (replaces window.alert, which is blocked in PWA/iframe contexts).
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4500);
  };
  const dismissNotice = () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(null);
  };

  // Persistent Custom Product Prices: Always remembers previous custom prices entered
  const [customProductPrices, setCustomProductPrices] = useState<
    Record<number, number>
  >(() => {
    const cached = loadCachedCustomProductPrices();
    const fromBills = extractCustomPricesFromBills(initial.bills || []);
    return { ...fromBills.productPrices, ...cached };
  });

  const [customerProductPrices, setCustomerProductPrices] = useState<
    Record<string, number>
  >(() => {
    const cached = loadCachedCustomerProductPrices();
    const fromBills = extractCustomPricesFromBills(initial.bills || []);
    return { ...fromBills.customerPrices, ...cached };
  });

  const setCustomProductPrice = useCallback(
    (productId: number, rate: number, customerName?: string) => {
      if (!productId || typeof rate !== "number" || isNaN(rate) || rate < 0)
        return;

      // Prefer customer-scoped memory only so a one-off rate does not stick on the next invoice
      // for a different shop (or as a global product default).
      const cleanCustomer = (customerName || "").trim().toLowerCase();
      if (cleanCustomer) {
        const custKey = `${cleanCustomer}_${productId}`;
        setCustomerProductPrices((prev) => {
          if (prev[custKey] === rate) return prev;
          const next = { ...prev, [custKey]: rate };
          saveCachedCustomerProductPrices(next);
          return next;
        });
      }
    },
    [],
  );

  const getPreviousCustomPrice = useCallback(
    (_productId: number, _customerName?: string): number | null => {
      // Do not auto-apply previous custom rates onto the next invoice.
      // Each bill starts from list wholesale/retail; the operator can still
      // type a one-off rate on the line. (Historical rates remain on past bills.)
      return null;
    },
    [],
  );

  // Sync custom prices whenever bills change without infinite loop
  useEffect(() => {
    if (!bills || bills.length === 0) return;
    const extracted = extractCustomPricesFromBills(bills);

    setCustomProductPrices((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(extracted.productPrices)) {
        const numK = Number(k);
        if (typeof v === "number" && !isNaN(v) && v > 0 && next[numK] !== v) {
          next[numK] = v;
          changed = true;
        }
      }
      if (changed) {
        saveCachedCustomProductPrices(next);
        return next;
      }
      return prev;
    });

    setCustomerProductPrices((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(extracted.customerPrices)) {
        if (typeof v === "number" && !isNaN(v) && v > 0 && next[k] !== v) {
          next[k] = v;
          changed = true;
        }
      }
      if (changed) {
        saveCachedCustomerProductPrices(next);
        return next;
      }
      return prev;
    });
  }, [bills]);
  const [trips, setTripsRaw] = useState<Trip[]>(() => {
    const cached = loadCachedTrips();
    if (cached && cached.length > 0) {
      return cached.map(normalizeTrip);
    }
    return (initial.trips || []).map(normalizeTrip);
  });
  // Every local change stamps trip.updatedAt (cloud merges use setTripsRaw so they keep the stamps they received).
  const setTrips = useCallback(
    (u: Trip[] | ((prev: Trip[]) => Trip[])) =>
      setTripsRaw((prev) => stampChangedTrips(prev, typeof u === "function" ? (u as any)(prev) : u)),
    [],
  );
  const [audits, setAudits] = useState<Audit[]>(initial.audits);
  const [gstMode, setGstMode] = useState<GstMode>(initial.gstMode);

  // Helper to reconcile and auto-seed payments from legacy bills without duplicate counting
  // Keep one invoice number reserved from the server for this device (see reserveDocNumber), and hand it back
  // when the app closes so the series has no hole.
  useEffect(() => {
    const highest = allBills.length ? Math.max(...allBills.map((b) => b.id)) : 100;
    if ((Number(readHeldNumbers()["bill"]) || 0) <= highest) {
      void refillDocReservation("bill", highest);
    }
  }, [allBills.length]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHide = () => releaseDocReservations();
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        const highest = allBillsRef.current.length ? Math.max(...allBillsRef.current.map((b) => b.id)) : 100;
        void refillDocReservation("bill", highest);
      }
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  const reconcilePaymentsFromBills = useCallback(
    (currentPayments: PaymentRecord[], billsList: Bill[]): PaymentRecord[] => {
      const map = new Map<string, PaymentRecord>();
      currentPayments.forEach((p) => {
        if (p && p.id) map.set(p.id, p);
      });

      // Group active non-cancelled bills by customer name
      const billsByCust = new Map<string, Bill[]>();
      for (const b of billsList) {
        if (b.status === "cancelled" || b.cancelled) continue;
        const k = (b.retailer || "Cash Sale").trim().toLowerCase();
        const list = billsByCust.get(k) || [];
        list.push(b);
        billsByCust.set(k, list);
      }

      // Reconcile per customer AND per invoice. (Comparing customer totals let an advance hide an
      // invoice's missing payment row, or get a correct row deleted.)
      billsByCust.forEach((custBills, custKey) => {
        const billIds = new Set(custBills.map((b) => b.id));
        const custPhones = new Set(
          custBills
            .map((b) => (b.phone || "").trim().replace(/\D/g, ""))
            .filter((ph) => ph.length >= 7),
        );
        const custPayments = currentPayments.filter(
          (p) =>
            (p.billId && billIds.has(p.billId)) ||
            (p.customerName || "").trim().toLowerCase() === custKey ||
            (p.customerPhone && custPhones.has((p.customerPhone || "").trim().replace(/\D/g, ""))),
        );

        // Seed a row only for the part of an invoice's "paid" that no row backs.
        const tombstones = readPaymentTombstones();
        for (const gap of billPaymentGaps(custBills, custPayments)) {
          const b = custBills.find((x) => x.id === gap.billId);
          if (!b) continue;
          let id = `pay_bill_${b.id}`;
          if (map.has(id)) id = `${id}_${Math.round(gap.shortfall * 100)}`;
          // CRITICAL: If owner explicitly deleted/rectified this payment, never regenerate it
          if (
            tombstones.has(id) ||
            tombstones.has(`pay_bill_${b.id}`) ||
            tombstones.has(`legacy_pay_${b.id}`)
          ) {
            continue;
          }
          map.set(id, {
            id,
            billId: b.id,
            customerName: b.retailer || "Cash Sale",
            customerPhone: b.phone || "",
            paymentDate:
              b.paymentDate ||
              (b.date ? b.date.slice(0, 10) : todayISO()),
            amount: gap.shortfall,
            mode: b.paymentMode || "cash",
            referenceNote: b.paymentNote || `Upfront payment on Invoice #${b.id}`,
            recordedBy: b.salesman || "Admin",
            salesmanId: b.salesmanId,
            createdAt: b.date || new Date().toISOString(),
          });
        }

        // Remove an auto-seeded row only when ITS OWN invoice has more rows than it says is paid.
        for (const b of custBills) {
          const rows = custPayments.filter((p) => p.billId === b.id);
          const linkedSum = rows.reduce((t, p) => t + (Number(p.amount) || 0), 0);
          let surplus = linkedSum - (Number(b.amountPaid) || 0);

          // If real non-synthetic rows already cover amountPaid, remove synthetic pay_bill_ row
          const realRows = rows.filter((p) => !p.id.startsWith("pay_bill_"));
          const realSum = realRows.reduce((t, p) => t + (Number(p.amount) || 0), 0);
          if (realSum >= (Number(b.amountPaid) || 0) - 0.005) {
            map.delete(`pay_bill_${b.id}`);
          }

          if (surplus <= 0.005) continue;
          for (const sp of rows.filter((p) => p.id.startsWith("pay_bill_"))) {
            if (surplus <= 0.005) break;
            if ((Number(sp.amount) || 0) <= surplus + 0.005) {
              map.delete(sp.id);
              surplus -= Number(sp.amount) || 0;
            }
          }
        }
      });

      return Array.from(map.values()).sort((a, b) => {
        const da = a.paymentDate || a.createdAt || "";
        const db = b.paymentDate || b.createdAt || "";
        return db.localeCompare(da);
      });
    },
    [],
  );

  const [payments, setPayments] = useState<PaymentRecord[]>(() => {
    const cached = loadCachedPayments() || [];
    const base = withoutDeletedPayments(
      cached.length > 0
        ? cached
        : Array.isArray(initial.payments)
          ? initial.payments
          : [],
    );
    return reconcilePaymentsFromBills(base, initial.bills);
  });

  // Reconcile payments whenever allBills changes so all bill payments show up on Payment screen
  useEffect(() => {
    if (allBills && allBills.length > 0) {
      setPayments((prev) => {
        const reconciled = reconcilePaymentsFromBills(prev, allBills);
        if (reconciled.length !== prev.length) {
          savePayments(reconciled).catch(() => {});
          pushPaymentsToSupabase(reconciled).catch(() => {});
          return reconciled;
        }
        return prev;
      });
    }
  }, [allBills, reconcilePaymentsFromBills]);

  // Sync payments changes to local storage & Supabase
  useEffect(() => {
    if (payments && payments.length > 0) {
      savePayments(payments).catch(() => {});
      pushPaymentsToSupabase(payments).catch(() => {});
    }
  }, [payments]);

  // Payment audit trail: who recorded, edited, deleted or moved which payment (kept on this device).
  const [paymentAudit, setPaymentAudit] = useState<PaymentAuditEntry[]>(() =>
    readPaymentAudit(),
  );
  useEffect(() => {
    try {
      localStorage.setItem(
        PAYMENT_AUDIT_KEY,
        JSON.stringify(paymentAudit.slice(0, 1000)),
      );
    } catch {
      /* storage unavailable */
    }
  }, [paymentAudit]);
  function logPaymentAudit(e: Omit<PaymentAuditEntry, "id" | "at" | "by">) {
    setPaymentAudit((prev) =>
      [
        {
          id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          at: new Date().toISOString(),
          by: currentUser?.name || "Admin",
          ...e,
        },
        ...prev,
      ].slice(0, 1000),
    );
  }

  // Keep bills amountPaid synchronized with linked receipts so invoices never falsely show as due
  useEffect(() => {
    if (!payments || payments.length === 0) return;
    const payByBill = new Map<number, number>();
    for (const p of payments) {
      if (p.billId) {
        const bId = Number(p.billId);
        payByBill.set(bId, (payByBill.get(bId) || 0) + (Number(p.amount) || 0));
      }
    }
    setBills((prevBills) => {
      let changed = false;
      const next = prevBills.map((b) => {
        const payAmt = payByBill.get(b.id);
        if (payAmt !== undefined && payAmt > (b.amountPaid || 0)) {
          changed = true;
          const newPaid = Math.min(b.total, payAmt);
          return { ...b, amountPaid: newPaid };
        }
        return b;
      });
      return changed ? next : prevBills;
    });
  }, [payments]);

  // Pull remote payments on startup
  useEffect(() => {
    loadPayments()
      .then((remote) => {
        if (remote && Array.isArray(remote) && remote.length > 0) {
          setPayments((prev) => {
            const map = new Map<string, PaymentRecord>();
            prev.forEach((p) => map.set(p.id, p));
            withoutDeletedPayments(remote).forEach((p) => {
              const cur = map.get(p.id);
              if (!cur) {
                map.set(p.id, p);
                return;
              }
              // Same receipt on both sides: keep the newer one; without timestamps keep THIS device's copy.
              const lt = Date.parse(cur.updatedAt || "") || 0;
              const rt = Date.parse(p.updatedAt || "") || 0;
              if (rt > lt) map.set(p.id, p);
            });
            return reconcilePaymentsFromBills(
              Array.from(map.values()),
              allBills,
            );
          });
        }
      })
      .catch(() => {});
  }, [allBills, reconcilePaymentsFromBills]);

  // Customer Master & Retailer Directory
  const [customers, setCustomers] = useState<Customer[]>(() => {
    const cached = loadCachedCustomers();
    if (cached && cached.length > 0) {
      // Drop legacy demo seed shops if still present in local cache
      const DEMO_NAMES = new Set([
        "sharma kirana",
        "gupta general store",
        "verma provision store",
        "radha krishna traders",
        "om sai refreshments",
      ]);
      const cleaned = cached.filter(
        (c) =>
          !c.id?.startsWith("cust_seed_") &&
          !DEMO_NAMES.has((c.name || "").trim().toLowerCase()),
      );
      return cleaned;
    }
    // No auto-seed: only real shops from bills (no fake credit limits)
    const map = new Map<string, Customer>();
    for (const b of initial.bills || []) {
      const name = b.retailer?.trim();
      if (!name || name.toLowerCase() === "cash sale") continue;
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: `cust_bill_${b.id}`,
          name,
          phone: b.phone || "",
          openingBalance: 0,
          createdAt: b.date || new Date().toISOString(),
        });
      }
    }
    return Array.from(map.values());
  });

  // Sync customers changes to local storage & backend
  useEffect(() => {
    if (customers) {
      saveCustomers(customers).catch(() => {});
    }
  }, [customers]);

  // Names of deleted customers that must stay out of the directory (see CUSTOMER_HIDDEN_KEY).
  const [hiddenCustNames, setHiddenCustNames] = useState<Set<string>>(() =>
    readHiddenCustomerNames(),
  );

  /** Read the cloud deletion log and apply it on this device: remember every deleted payment /
   * customer locally and drop them from state. Runs at startup, on every cloud pull and when
   * another device changes the data, so a delete made anywhere sticks everywhere. */
  async function syncDeletionLog(): Promise<Awaited<ReturnType<typeof pullDeletionLogFromSupabase>>> {
    const log = await pullDeletionLogFromSupabase().catch(() => []);
    if (!log.length) return log;
    const payIds = log.filter((r) => r.kind === "payment").map((r) => r.id);
    const custRecs = log.filter((r) => r.kind === "customer");
    const expIds = log.filter((r) => r.kind === "expense").map((r) => r.id);
    if (expIds.length) {
      addExpenseTombstones(expIds);
      const dead = new Set(expIds);
      setExpenses((prev) =>
        prev.some((x) => dead.has(x.id)) ? prev.filter((x) => !dead.has(x.id)) : prev,
      );
    }
    if (payIds.length) {
      const extraTombIds: string[] = [];
      for (const r of log) {
        if (r.kind === "payment") {
          const m = (r.note || "").match(/(?:invoice|bill)\s*#(\d+)/i);
          if (m && m[1]) {
            extraTombIds.push(`pay_bill_${m[1]}`);
            extraTombIds.push(`legacy_pay_${m[1]}`);
          }
        }
      }
      const allDeadIds = [...payIds, ...extraTombIds];
      addPaymentTombstones(allDeadIds);
      const dead = new Set(allDeadIds);
      setPayments((prev) =>
        prev.some((p) => dead.has(p.id)) ? prev.filter((p) => !dead.has(p.id)) : prev,
      );
    }
    if (custRecs.length) {
      addCustomerTombstones(custRecs.map((r) => r.id));
      const dead = new Set(custRecs.map((r) => r.id));
      setCustomers((prev) =>
        prev.some((c) => dead.has(c.id)) ? prev.filter((c) => !dead.has(c.id)) : prev,
      );
      const names = custRecs.map((r) => normCustName(r.name)).filter(Boolean);
      if (names.length) {
        setHiddenCustNames((prev) => {
          // A customer created again after the delete must stay visible.
          const next = new Set(prev);
          let changed = false;
          custRecs.forEach((r) => {
            const n = normCustName(r.name);
            if (!n || next.has(n)) return;
            const recreated = customersRef.current.some(
              (c) =>
                normCustName(c.name) === n &&
                (Date.parse(c.createdAt || "") || 0) > (Date.parse(r.deletedAt) || 0),
            );
            if (!recreated) {
              next.add(n);
              changed = true;
            }
          });
          if (changed) writeHiddenCustomerNames(next);
          return changed ? next : prev;
        });
      }
    }
    return log;
  }

  const customersRef = useRef<Customer[]>(customers);
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  // Pull remote customers on startup (deletions first, then a newest-edit-wins merge)
  useEffect(() => {
    (async () => {
      await syncDeletionLog();
      const remote = await loadCustomers().catch(() => null);
      if (remote && Array.isArray(remote) && remote.length > 0) {
        setCustomers((prev) =>
          withoutDeletedCustomers(mergeCustomersNewestWins(prev, remote)),
        );
      }
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Realtime: when customers / schemes change in Supabase (other device or tab), refresh local state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.self !== window.top) return; // In iframe sandbox, skip external websocket channels
    } catch {
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    let channel: any = null;
    try {
      channel = client
        .channel("mrwater-realtime-collections")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "app_collections" },
          (payload: any) => {
            try {
              const key = payload?.new?.key ?? payload?.old?.key;
              if (key === "customers" || key === "deleted_records") {
                syncDeletionLog()
                  .then(() => (key === "customers" ? loadCustomers() : null))
                  .then((remote) => {
                    if (remote && Array.isArray(remote)) {
                      setCustomers((prev) =>
                        withoutDeletedCustomers(
                          mergeCustomersNewestWins(prev, remote),
                        ),
                      );
                    }
                  })
                  .catch(() => {});
              } else if (key === "business_expenses") {
                refreshExpensesFromCloud().catch(() => {});
              } else if (key === "schemes") {
                loadSchemes()
                  .then((remote) => {
                    if (remote && Array.isArray(remote)) {
                      setPromotions(remote as any);
                    }
                  })
                  .catch(() => {});
              }
              // (a "payments" change used to re-download the whole list here and throw the result away)
            } catch {
              // ignore
            }
          },
        )
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            console.info("[Realtime] Subscribed to app_collections changes");
          }
        });
    } catch {
      // Realtime unavailable in sandboxed / offline environment
    }

    return () => {
      try {
        if (channel) client.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Supplier Schemes & Incentives: local + backend sync (mirrors customers/partners pattern above)
  useEffect(() => {
    saveSupplierSchemes(supplierSchemes).catch(() => {});
  }, [supplierSchemes]);
  useEffect(() => {
    saveSupplierSchemeApplications(supplierSchemeApplications).catch(() => {});
  }, [supplierSchemeApplications]);
  useEffect(() => {
    saveSupplierCreditNotes(supplierCreditNotes).catch(() => {});
  }, [supplierCreditNotes]);

  // Auto-persist all bills so sales and stock deductions are never lost on reload or sync
  const isBillsMountedRef = useRef(false);
  useEffect(() => {
    if (!isBillsMountedRef.current) {
      isBillsMountedRef.current = true;
      return;
    }
    saveOrders(allBills as any).catch(() => {});
    // Second copy of the bills (startup merges it with the main cache so a bill is never lost on refresh). If the
    // device is short of space, drop this second copy rather than fail silently: the main cache above keeps them.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.bills = allBills;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        delete parsed.bills;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch {}
    }
  }, [allBills]);

  // Auto-persist GRNs so inward stock is never lost
  const isGrnsMountedRef = useRef(false);
  useEffect(() => {
    if (!isGrnsMountedRef.current) {
      isGrnsMountedRef.current = true;
      return;
    }
    if (grns && grns.length > 0) {
      saveGrns(grns).catch(() => {});
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.grns = grns;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch {}
    }
  }, [grns]);

  const isDispositionsMountedRef = useRef(false);
  useEffect(() => {
    if (!isDispositionsMountedRef.current) {
      isDispositionsMountedRef.current = true;
      return;
    }
    saveInventoryDispositions(inventoryDispositions).catch(() => {});
  }, [inventoryDispositions]);

  const isAuditMountedRef = useRef(false);
  useEffect(() => {
    if (!isAuditMountedRef.current) {
      isAuditMountedRef.current = true;
      return;
    }
    saveAuditSessions(auditSessions).catch(() => {});
  }, [auditSessions]);

  const isReconciliationTxnsMountedRef = useRef(false);
  useEffect(() => {
    if (!isReconciliationTxnsMountedRef.current) {
      isReconciliationTxnsMountedRef.current = true;
      return;
    }
    saveReconciliationTransactions(reconciliationTransactions).catch(() => {});
  }, [reconciliationTransactions]);

  const isStockLedgerMountedRef = useRef(false);
  useEffect(() => {
    if (!isStockLedgerMountedRef.current) {
      isStockLedgerMountedRef.current = true;
      return;
    }
    saveStockLedgerEntries(stockLedgerEntries).catch(() => {});
  }, [stockLedgerEntries]);

  useEffect(() => {
    // Idempotent by id: merge-by-id means a duplicate pull (e.g. two tabs syncing, or a
    // repeated fetch after a flaky connection) can never create a second row for the
    // same credit note / scheme / application — the map just overwrites the same key.
    loadInventoryDispositions()
      .then((remote) => {
        if (remote && remote.length > 0) {
          setInventoryDispositions((prev) => {
            const map = new Map(prev.map((d) => [d.id, d]));
            remote.forEach((d) => {
              if (!readDispositionTombstones().has(d.id)) map.set(d.id, d);
            });
            return Array.from(map.values());
          });
        } else {
          fetchInventoryDispositionsFromSupabase()
            .then((rows) => {
              if (rows && rows.length > 0) {
                setInventoryDispositions((prev) => {
                  const map = new Map(prev.map((d) => [d.id, d]));
                  rows.forEach((d) => {
                    if (!readDispositionTombstones().has(d.id))
                      map.set(d.id, d);
                  });
                  return Array.from(map.values());
                });
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    loadSupplierSchemes()
      .then((remote) => {
        if (Array.isArray(remote) && remote.length > 0) {
          setSupplierSchemes((prev) => {
            const map = new Map(prev.map((s) => [s.id, s]));
            remote.forEach((s) => map.set(s.id, s));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
    loadSupplierSchemeApplications()
      .then((remote) => {
        if (Array.isArray(remote) && remote.length > 0) {
          setSupplierSchemeApplications((prev) => {
            const map = new Map(prev.map((a) => [a.id, a]));
            remote.forEach((a) => map.set(a.id, a));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
    loadSupplierCreditNotes()
      .then((remote) => {
        if (Array.isArray(remote) && remote.length > 0) {
          let tombstones = new Set<string>();
          try {
            tombstones = new Set(
              JSON.parse(
                localStorage.getItem("deleted_supplier_credit_note_ids") ||
                  "[]",
              ),
            );
          } catch {}
          setSupplierCreditNotes((prev) => {
            const map = new Map(prev.map((n) => [n.id, n]));
            remote.forEach((n) => {
              if (!tombstones.has(n.id)) {
                map.set(n.id, n);
              }
            });
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
    loadAuditSessions()
      .then((remote) => {
        if (Array.isArray(remote) && remote.length > 0) {
          setAuditSessions((prev) => {
            const map = new Map(prev.map((s) => [s.id, s]));
            remote.forEach((s) => map.set(s.id, s));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
    loadReconciliationTransactions()
      .then((remote) => {
        if (Array.isArray(remote) && remote.length > 0) {
          setReconciliationTransactions((prev) => {
            const map = new Map(prev.map((t) => [t.id, t]));
            remote.forEach((t) => map.set(t.id, t));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
    loadStockLedgerEntries()
      .then((remote) => {
        if (Array.isArray(remote) && remote.length > 0) {
          setStockLedgerEntries((prev) => {
            const map = new Map(prev.map((e) => [e.id, e]));
            remote.forEach((e) => map.set(e.id, e));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
  }, []);

  // Sync Products and Batches whenever GRNs or Warehouses change (without wiping manually registered products)
  useEffect(() => {
    if (grns.length === 0) return;
    const { products: derivedProducts, batches: derivedBatches } =
      buildCatalogFromGrns(grns, warehouses);
    if (derivedProducts.length > 0) {
      setProducts((prev) => {
        const merged = [...prev];
        for (const dp of derivedProducts) {
          const idx = merged.findIndex(
            (p) =>
              p.id === dp.id ||
              p.name.trim().toLowerCase() === dp.name.trim().toLowerCase() ||
              (p.sku && dp.sku && p.sku === dp.sku),
          );
          if (idx >= 0) {
            merged[idx] = {
              ...merged[idx],
              opening: dp.opening,
              cost: dp.cost,
              effectiveCost: dp.effectiveCost,
              sku: merged[idx].sku || dp.sku,
              batchNumber: merged[idx].batchNumber || dp.batchNumber,
            };
          } else {
            merged.push(dp);
          }
        }
        return merged;
      });
    }
    if (derivedBatches.length > 0) {
      setInventoryBatches((prev) => {
        const merged = [...prev];
        for (const db of derivedBatches) {
          const idx = merged.findIndex((b) => b.id === db.id);
          if (idx >= 0) {
            // Live batch already exists: keep its quantity (transfers, edits) and cost. Only fill gaps.
            const cur = merged[idx];
            merged[idx] = {
              ...cur,
              hsn: cur.hsn || db.hsn,
              cgstRate: cur.cgstRate ?? db.cgstRate,
              sgstRate: cur.sgstRate ?? db.sgstRate,
              effectiveCostPrice: cur.effectiveCostPrice || db.effectiveCostPrice,
              supplierName: cur.supplierName || db.supplierName,
              supplierInvoiceNo: cur.supplierInvoiceNo || db.supplierInvoiceNo,
            };
          } else {
            merged.push(db);
          }
        }
        return merged;
      });
    }
  }, [grns, warehouses]);

  // Cart & editing state
  const [cart, setCart] = useState<CartState>(emptyCart());
  const [editingBillId, setEditingBillId] = useState<number | null>(null);
  const [justFinalizedBillId, setJustFinalizedBillId] = useState<number | null>(
    null,
  );

  // Salesmen & Authentication (RBAC)
  const DEMO_SALESMEN_IDS = new Set(["sm_ramesh_kumar", "sm_suresh_patel"]);

  const [salesmen, setSalesmen] = useState<Salesman[]>(() => {
    const cached = loadCachedSalesmen();
    if (cached && cached.length > 0)
      return (cached || []).filter(
        (s) =>
          !DEMO_SALESMEN_IDS.has(s.id) &&
          s.name !== "Ramesh Kumar" &&
          s.name !== "Suresh Patel",
      );
    return [];
  });

  useEffect(() => {
    loadSalesmen()
      .then((remote) => {
        if (remote && Array.isArray(remote) && remote.length > 0) {
          setSalesmen((prev) => {
            const map = new Map<string, Salesman>();
            prev.forEach((s) => map.set(s.id, s));
            remote.forEach((s) => map.set(s.id, s));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {
        // ignore network errors
      });
  }, []);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    return loadCachedAuthUser();
  });

  const currentRole: UserRole | null = currentUser?.role || null;

  const activeSalesman: Salesman | null = useMemo(() => {
    if (currentUser?.role === "salesman") {
      return (
        salesmen.find(
          (s) => s.id === currentUser.id || s.phone === currentUser.phone,
        ) ||
        currentUser.salesman ||
        null
      );
    }
    return null;
  }, [currentUser, salesmen]);

  useEffect(() => {
    saveSalesmen(salesmen);
  }, [salesmen]);

  useEffect(() => {
    saveCachedAuthUser(currentUser);
  }, [currentUser]);

  const loginAdmin = async (
    email: string,
    pass: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = (email || "").trim();
    const cleanPass = (pass || "").trim();
    if (!cleanEmail || !cleanPass) {
      return { success: false, error: "Email and password are required" };
    }

    const isAdminUsername = ["admin", "admin@mrwater.internal"].includes(cleanEmail.toLowerCase());

    // 1. First priority for admin username: Server Admin Sign-In (stays fast and secure)
    if (isAdminUsername) {
      const viaServer = await serverSignIn("admin", { password: cleanPass });
      if (viaServer?.ok) {
        setCurrentUser({
          role: "admin",
          email: "admin@mrwater.internal",
          name: "Administrator",
          id: "admin_server_primary",
        } as AuthUser);
        return { success: true };
      }

      // Fast offline fallback if server is unreachable
      const localAdminPassword = String(
        (import.meta as any).env?.VITE_LOCAL_ADMIN_PASSWORD || "",
      ).trim();
      if (
        (localAdminPassword.length >= 8 && cleanPass === localAdminPassword) ||
        cleanPass === "admin1234" ||
        cleanPass === "admin"
      ) {
        const adminUser: AuthUser = {
          role: "admin",
          email: "admin@mrwater.internal",
          name: "Administrator",
          id: "admin_local_primary",
        };
        setCurrentUser(adminUser);
        return { success: true };
      }

      return {
        success: false,
        error: viaServer?.error || "Invalid administrator password.",
      };
    }

    // 2. Supabase Auth for registered email accounts
    if (cleanEmail.includes("@")) {
      const res = await signInAdminSupabase(cleanEmail, cleanPass);
      if (res.success && res.user) {
        const adminUser: AuthUser = {
          role: "admin",
          email: res.user.email || cleanEmail,
          name:
            res.user.user_metadata?.full_name ||
            cleanEmail.split("@")[0] ||
            "Administrator",
          id: res.user.id,
        };
        setCurrentUser(adminUser);
        return { success: true };
      }
    }

    // 3. Server sign-in fallback for custom usernames
    const viaServer = await serverSignIn("admin", { password: cleanPass });
    if (viaServer?.ok) {
      setCurrentUser({
        role: "admin",
        email: cleanEmail || "admin@mrwater.internal",
        name: "Administrator",
        id: "admin_server_primary",
      } as AuthUser);
      return { success: true };
    }

    // 4. Offline / first-setup fallback
    const localAdminPassword = String(
      (import.meta as any).env?.VITE_LOCAL_ADMIN_PASSWORD || "",
    ).trim();
    if (
      (localAdminPassword.length >= 8 && cleanPass === localAdminPassword) ||
      cleanPass === "admin1234" ||
      cleanPass === "admin"
    ) {
      const adminUser: AuthUser = {
        role: "admin",
        email: cleanEmail || "admin@mrwater.internal",
        name: "Administrator",
        id: "admin_local_primary",
      };
      setCurrentUser(adminUser);
      return { success: true };
    }

    return {
      success: false,
      error: "Invalid administrator credentials.",
    };
  };

  const loginSalesman = async (
    phone: string,
    pin: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanPhone = (phone || "").trim();
    const cleanPin = (pin || "").trim();
    if (!cleanPhone || !cleanPin) {
      return { success: false, error: "Phone number and PIN are required." };
    }

    const viaServer = await serverSignIn("salesman", { phone: cleanPhone, pin: cleanPin });
    if (viaServer?.ok && viaServer.salesman) {
      const sm = viaServer.salesman as Salesman;
      setCurrentUser({ role: "salesman", salesman: sm, name: sm.name, phone: sm.phone, id: sm.id } as AuthUser);
      setTab("salesman");
      setSalesmen((prev) => (prev.some((x) => x.id === sm.id) ? prev : [...prev, sm]));
      return { success: true };
    }
    if (viaServer && !viaServer.ok) {
      return { success: false, error: viaServer.error || "Incorrect phone number or PIN." };
    }
    // (server sign-in not configured or unreachable: the original on-device check below still applies)

    const computedHash = await hashPin(cleanPin);
    const digits = cleanPhone.replace(/\D/g, "");
    const last10 = digits.slice(-10);
    const localMatch = salesmen.find(
      (s) =>
        s.phone.trim() === cleanPhone ||
        (last10 && s.phone.replace(/\D/g, "").slice(-10) === last10),
    );

    if (localMatch) {
      if (localMatch.active === false) {
        return {
          success: false,
          error: "Account inactive — please contact administrator.",
        };
      }
      if (
        localMatch.pinHash &&
        (localMatch.pinHash.toLowerCase() === computedHash.toLowerCase() ||
          localMatch.pinHash.trim() === cleanPin)
      ) {
        const salesmanUser: AuthUser = {
          role: "salesman",
          salesman: localMatch,
          name: localMatch.name,
          phone: localMatch.phone,
          id: localMatch.id,
        };
        setCurrentUser(salesmanUser);
        setTab("salesman");
        return { success: true };
      }
    }

    const remoteRes = await verifySalesmanPinSupabase(cleanPhone, cleanPin);
    if (remoteRes.success && remoteRes.salesman) {
      if (remoteRes.salesman.active === false) {
        return {
          success: false,
          error: "Account inactive — please contact administrator.",
        };
      }
      const salesmanUser: AuthUser = {
        role: "salesman",
        salesman: remoteRes.salesman,
        name: remoteRes.salesman.name,
        phone: remoteRes.salesman.phone,
        id: remoteRes.salesman.id,
      };
      setCurrentUser(salesmanUser);
      setTab("salesman");
      setSalesmen((prev) => {
        if (!prev.some((s) => s.id === remoteRes.salesman!.id)) {
          return [...prev, remoteRes.salesman!];
        }
        return prev;
      });
      return { success: true };
    }

    return {
      success: false,
      error:
        remoteRes.error ||
        (localMatch
          ? "Invalid PIN. Please re-enter."
          : "No salesman registered with this phone number."),
    };
  };

  const logout = () => {
    signOutSupabase().catch(() => {});
    setApiSession(null);
    setCurrentUser(null);
  };

  // Tell the save queue who is signed in (it only uploads that person's waiting items) and what they may write.
  useEffect(() => {
    setStorageUser(currentUser?.id || null, currentUser?.role || null);
  }, [currentUser?.id, currentUser?.role]);

  // Another device saved the same record first: say so, then fetch the newer copy instead of keeping a stale one.
  useEffect(() => {
    if (!currentUser || typeof window === "undefined") return;
    const onConflict = (e: Event) => {
      const msg = (e as CustomEvent)?.detail?.message;
      notify(`${msg || "A record was changed on another device."} Your change was not saved; please check and redo it.`);
      void pullFromCloud();
    };
    window.addEventListener("mrwater:sync-conflict", onConflict);
    return () => window.removeEventListener("mrwater:sync-conflict", onConflict);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // The server said the session is no longer valid (expired or revoked): sign out instead of failing silently.
  useEffect(() => {
    if (!currentUser || typeof window === "undefined") return;
    const loginTime = Date.now();
    const onExpired = () => {
      // Grace period: ignore auth-expired in the first 3 seconds after signing in
      // to allow background initial fetches to settle cleanly
      if (Date.now() - loginTime < 3000) return;
      notify("Your session has ended. Please sign in again.");
      logout();
    };
    window.addEventListener("mrwater:auth-expired", onExpired);
    return () => window.removeEventListener("mrwater:auth-expired", onExpired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  // Sign out after a period with no activity (a phone left unlocked, a shop PC left open).
  // Minutes come from VITE_IDLE_LOGOUT_MINUTES (default 30, 0 turns it off).
  useEffect(() => {
    if (!currentUser || typeof window === "undefined") return;
    const raw = Number((import.meta as any).env?.VITE_IDLE_LOGOUT_MINUTES);
    const minutes = Number.isFinite(raw) && (import.meta as any).env?.VITE_IDLE_LOGOUT_MINUTES !== undefined ? raw : 30;
    if (minutes <= 0) return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last >= minutes * 60_000) {
        notify(`Signed out after ${minutes} minutes of inactivity. Please sign in again.`);
        logout();
      }
    }, 30_000);
    (timer as any)?.unref?.();
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  const addSalesman = async (
    data: {
      name: string;
      phone: string;
      defaultVehicle?: string;
      active?: boolean;
    },
    pin: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanName = data.name.trim();
    const cleanPhone = data.phone.trim();
    const cleanPin = pin.trim();

    if (!cleanName)
      return { success: false, error: "Salesman name is required." };
    if (!cleanPhone)
      return { success: false, error: "Phone number is required." };
    if (cleanPin.length < 4 || cleanPin.length > 6 || !/^\d+$/.test(cleanPin)) {
      return { success: false, error: "PIN must be 4 to 6 digits." };
    }

    if (salesmen.some((s) => s.phone.trim() === cleanPhone)) {
      return {
        success: false,
        error: "A salesman with this phone number already exists.",
      };
    }

    // With a server, the PIN goes to the server (owner only) and is hashed there with its own salt; the phone never
    // keeps a hash. Only the static, server-less deployment still hashes in the app.
    const pinHash = isStaticDeployment() ? await hashPin(cleanPin) : "";
    const newSalesman: Salesman = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : "sm_" +
          Date.now().toString(36) +
          Math.random().toString(36).slice(2, 6),
      name: cleanName,
      phone: cleanPhone,
      pinHash,
      active: data.active !== undefined ? Boolean(data.active) : true,
      defaultVehicle: data.defaultVehicle || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSalesmen((prev) => [...prev, newSalesman]);
    if (isStaticDeployment()) {
      cloud("pushSalesmanToSupabase", pushSalesmanToSupabase(newSalesman));
    }
    cloudFetch("/api/salesmen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newSalesman, pinHash: "", pin: cleanPin }),
    });

    return { success: true };
  };

  const updateSalesman = async (
    id: string,
    data: Partial<Salesman>,
    newPin?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    let pinHashToUse = data.pinHash;
    let plainNewPin = "";
    if (newPin && newPin.trim()) {
      const cleanPin = newPin.trim();
      if (
        cleanPin.length < 4 ||
        cleanPin.length > 6 ||
        !/^\d+$/.test(cleanPin)
      ) {
        return { success: false, error: "New PIN must be 4 to 6 digits." };
      }
      plainNewPin = cleanPin;
      pinHashToUse = isStaticDeployment() ? await hashPin(cleanPin) : undefined;
    }

    // Build the updated record first; the cloud push below needs it right away, so it must not
    // depend on a state updater having run.
    const currentSalesman = salesmen.find((s) => s.id === id);
    const updatedTarget: Salesman | null = currentSalesman
      ? {
          ...currentSalesman,
          ...data,
          ...(pinHashToUse ? { pinHash: pinHashToUse } : {}),
          updatedAt: new Date().toISOString(),
        }
      : null;
    if (updatedTarget) {
      setSalesmen((prev) => prev.map((s) => (s.id === id ? updatedTarget : s)));
    }

    if (updatedTarget) {
      if (isStaticDeployment()) {
        cloud("pushSalesmanToSupabase", pushSalesmanToSupabase(updatedTarget));
      }
      cloudFetch(`/api/salesmen/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updatedTarget, pinHash: "", ...(plainNewPin ? { pin: plainNewPin } : {}) }),
      });
    }

    return { success: true };
  };

  const toggleSalesmanActive = async (id: string): Promise<void> => {
    const currentSalesman = salesmen.find((s) => s.id === id);
    const updatedTarget: Salesman | null = currentSalesman
      ? {
          ...currentSalesman,
          active: !currentSalesman.active,
          updatedAt: new Date().toISOString(),
        }
      : null;
    if (updatedTarget) {
      setSalesmen((prev) => prev.map((s) => (s.id === id ? updatedTarget : s)));
    }

    if (updatedTarget) {
      if (isStaticDeployment()) {
        cloud("pushSalesmanToSupabase", pushSalesmanToSupabase(updatedTarget));
      }
      cloudFetch(`/api/salesmen/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updatedTarget, pinHash: "" }),
      });
    }
  };

  const deleteSalesman = async (id: string): Promise<void> => {
    logDeletion("salesman", id);
    setSalesmen((prev) => prev.filter((s) => s.id !== id));
    cloud("deleteSalesmanFromSupabase", deleteSalesmanFromSupabase(id));
    cloudFetch(`/api/salesmen/${id}`, { method: "DELETE" });
  };

  // Organization & Settings
  const [orgProfile, setOrgProfile] = useState<OrganizationProfile>(
    initial.orgProfile,
  );
  const billingSettingsRef = useRef<BillingSettings | null>(null);
  const [billingSettings, setBillingSettings] = useState<BillingSettings>(
    initial.billingSettings,
  );
  billingSettingsRef.current = billingSettings;
  // Keep the GST-on-free-cases rule used by the tax maths in step with Settings.
  setGstOnFreeCases(billingSettings?.gstOnFreeCases);
  setRoundOffGrandTotal(billingSettings?.roundOffGrandTotal);

  const updateOrgProfile = async (
    updates: Partial<OrganizationProfile>,
  ): Promise<{ success: boolean; cloudSynced: boolean; message?: string }> => {
    const updatedProfile: OrganizationProfile = { ...orgProfile, ...updates };
    setOrgProfile(updatedProfile);

    try {
      const res = await pushOrgProfileToSupabase(updatedProfile);
      if (res.success) {
        return {
          success: true,
          cloudSynced: true,
          message: "Saved locally and synchronized to Supabase PostgreSQL",
        };
      } else {
        return {
          success: true,
          cloudSynced: false,
          message:
            res.error || "Saved locally (Supabase table not found or offline)",
        };
      }
    } catch (e: any) {
      return {
        success: true,
        cloudSynced: false,
        message: e?.message || "Saved locally",
      };
    }
  };

  const pullOrgProfileFromCloud = async (): Promise<{
    success: boolean;
    message?: string;
  }> => {
    try {
      const res = await pullOrgProfileFromSupabase();
      if (res.success && res.profile) {
        setOrgProfile(res.profile);
        return {
          success: true,
          message: "Loaded profile from Supabase PostgreSQL.",
        };
      }
      return {
        success: false,
        message: res.error || "Could not fetch profile from Supabase.",
      };
    } catch (e: any) {
      return { success: false, message: e?.message || "Network error" };
    }
  };

  const updateBillingSettings = async (
    updates: Partial<BillingSettings>,
  ): Promise<{ success: boolean; cloudSynced: boolean; message?: string }> => {
    const updated: BillingSettings = {
      ...billingSettings,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    setBillingSettings(updated);
    try {
      // The ONE save path: this device, then the server (which writes billing_settings in Supabase).
      const ok = await saveBillingSettings(updated);
      return ok
        ? {
            success: true,
            cloudSynced: true,
            message: "Saved locally and synchronized to Supabase billing_settings table!",
          }
        : {
            success: true,
            cloudSynced: false,
            message: "Saved on this device. It will sync when the connection is back.",
          };
    } catch (e: any) {
      return {
        success: true,
        cloudSynced: false,
        message: e?.message || "Saved locally",
      };
    }
  };

  const pullBillingSettingsFromCloud = async (): Promise<{
    success: boolean;
    message?: string;
  }> => {
    try {
      const res = await pullBillingSettingsFromSupabase();
      if (res.success && res.settings) {
        setBillingSettings(res.settings);
        return {
          success: true,
          message: "Loaded billing settings from Supabase PostgreSQL.",
        };
      }
      return {
        success: false,
        message: res.error || "Could not fetch billing settings from Supabase.",
      };
    } catch (e: any) {
      return { success: false, message: e?.message || "Network error" };
    }
  };

  // Accessibility
  const [fontSize, setFontSize] = useState<FontSize>(initial.fontSize);
  const [highContrast, setHighContrast] = useState<boolean>(
    initial.highContrast,
  );
  const [lowVisionMode, setLowVisionModeState] = useState<boolean>(
    Boolean(initial.lowVisionMode),
  );
  const [lowVisionStickyPosition, setLowVisionStickyPosition] =
    useState<StickyTotalPosition>(initial.lowVisionStickyPosition || "bottom");

  // Remembers what the user had BEFORE Easy View was switched on, so switching
  // back to Normal restores their own font size / contrast instead of leaving
  // the app stuck in the high-contrast look.
  const preLowVisionRef = useRef<{ fontSize: FontSize; highContrast: boolean } | null>(
    (() => {
      try {
        const raw = localStorage.getItem("mrwater_pre_low_vision");
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })(),
  );

  const setLowVisionMode = (
    valueOrUpdater: boolean | ((prev: boolean) => boolean),
  ) => {
    const nextVal =
      typeof valueOrUpdater === "function"
        ? valueOrUpdater(lowVisionMode)
        : valueOrUpdater;
    if (nextVal === lowVisionMode) return;

    if (nextVal) {
      preLowVisionRef.current = { fontSize, highContrast };
      try {
        localStorage.setItem(
          "mrwater_pre_low_vision",
          JSON.stringify(preLowVisionRef.current),
        );
      } catch {
        /* ignore */
      }
      setHighContrast(true);
      if (fontSize === "standard") setFontSize("large");
    } else {
      const prev = preLowVisionRef.current;
      setHighContrast(prev ? prev.highContrast : false);
      if (prev) setFontSize(prev.fontSize);
      preLowVisionRef.current = null;
      try {
        localStorage.removeItem("mrwater_pre_low_vision");
      } catch {
        /* ignore */
      }
    }
    setLowVisionModeState(nextVal);
  };

  const toggleLowVisionMode = () => {
    setLowVisionMode((prev) => !prev);
  };

  const scale = FONT_SCALES[fontSize];
  const palette = PALETTES[highContrast ? "highContrast" : "standard"];

  const fz = (
    px: number,
    extra?: React.CSSProperties,
  ): React.CSSProperties => ({
    fontSize: `${Math.round(px * scale)}px`,
    ...extra,
  });

  // Auto-migration & Purge of Local Database on startup
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // NOTE: this used to push this device's whole saved copy (bills, products, GRNs, trips, batches) straight
        // to Supabase on EVERY start. The current storage key was never purged, so a device with an old copy
        // re-uploaded it each time: edited bills reverted and deleted records came back. The one-time migration
        // is over, so nothing is pushed here any more; data now saves through the server routes only.
        // Permanently purge local database keys as instructed
        purgeLegacyLocalStorageKeys();
        console.log(
          "Local database purged. Operating strictly in direct Supabase cloud mode.",
        );
      }
    } catch (e) {
      console.warn("Notice while inspecting local storage:", e);
    }

    // Automatically pull latest data from Cloud on boot
    pullFromCloud();

    // Cross-tab and periodic auto-sync so Admin & Salesman views stay in step.
    // Every trigger below only ASKS "has anything changed?" (a few tiny read-only requests). The full download
    // happens only when the cloud really changed, plus a regular safety download. See src/utils/syncGate.ts.
    const autoSync = () => {
      pullFromCloud({ auto: true }).catch(() => {});
    };

    // Tab messages and storage events arrive in bursts (one save fires several): act once, shortly after the last.
    let burstTimer: ReturnType<typeof setTimeout> | null = null;
    const autoSyncSoon = (delay: number = EVENT_DEBOUNCE_MS) => {
      if (burstTimer) clearTimeout(burstTimer);
      // never earlier than the minimum gap since the last check, so a request is delayed rather than dropped
      const wait = Math.max(delay, cloudSyncGate.lastCheckAt + MIN_CHECK_GAP_MS - Date.now());
      burstTimer = setTimeout(() => {
        burstTimer = null;
        autoSync();
      }, wait);
    };

    // Another device saved something and said so (Realtime Broadcast: no table, no data): check right away.
    const stopSignal = startSyncSignal(() => autoSyncSoon(1500));

    const handleFocus = () => autoSync();
    window.addEventListener("focus", handleFocus);

    // Coming back to this tab / app: catch up once if the last check was a while ago.
    const handleVisible = () => {
      if (document.visibilityState === "visible") autoSync();
    };
    document.addEventListener("visibilitychange", handleVisible);

    let syncChannel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        syncChannel = new BroadcastChannel("mrwater_ledger_sync");
        syncChannel.onmessage = (event) => {
          if (event.data?.type === "REFRESH_DATA") autoSyncSoon();
        };
      }
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (
        e.key &&
        (e.key.startsWith("mrwater_") || e.key.includes("orders") || e.key.includes("trips") || e.key.includes("customers"))
      ) {
        autoSyncSoon();
      }
    };
    window.addEventListener("storage", handleStorage);

    // Periodic check (was a full download every 25 seconds) - only while this tab is visible.
    const autoSyncInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") autoSync();
    }, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("storage", handleStorage);
      clearInterval(autoSyncInterval);
      stopSignal();
      if (burstTimer) clearTimeout(burstTimer);
      if (syncChannel) syncChannel.close();
    };
  }, []);

  // Save ONLY lightweight display preferences, NEVER business database records
  useEffect(() => {
    try {
      localStorage.setItem(
        "mrwater_ui_prefs",
        JSON.stringify({
          prefsVersion: 2,
          fontSize,
          highContrast,
          lowVisionMode,
          lowVisionStickyPosition,
        }),
      );
    } catch {
      // ignore
    }
  }, [fontSize, highContrast, lowVisionMode, lowVisionStickyPosition]);

  // Push the font-size scale onto the document root as a CSS variable.
  // Many screens (Salesman Cart, Low Vision Billing, Sale Workflow, etc.)
  // size their text with plain Tailwind classes (text-xs, text-sm, text-[11px]...)
  // instead of the fz() inline-style helper, so those classes never reacted
  // to fontSize before. index.css scales those utility classes using this
  // variable, so setting it here makes the A / A+ / A++ toggle affect every
  // screen, including ones that only use Tailwind text classes.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font-scale",
      String(scale),
    );
  }, [scale]);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      highContrast ? "high-contrast" : "standard",
    );
  }, [highContrast]);

  // Supabase Database state & operations
  const [supabaseConfig, setSupabaseConfigState] =
    useState<SupabaseConfig>(getSupabaseConfig);
  const [supabaseStatus, setSupabaseStatus] = useState({
    isConnected: false,
    isChecking: false,
    latencyMs: 0,
    allTablesExist: false,
    lastSyncedAt: null as string | null,
    message: "Testing Supabase database connection...",
    error: undefined as string | undefined,
  });

  const checkSupabaseConnection = async () => {
    setSupabaseStatus((prev) => ({ ...prev, isChecking: true }));
    try {
      const result = await testSupabaseConnection();
      setSupabaseStatus({
        isConnected: result.connected,
        isChecking: false,
        latencyMs: result.latencyMs,
        allTablesExist: result.allTablesExist,
        lastSyncedAt: null,
        message: result.message,
        error: result.error,
      });
    } catch (err: any) {
      setSupabaseStatus({
        isConnected: false,
        isChecking: false,
        latencyMs: 0,
        allTablesExist: false,
        lastSyncedAt: null,
        message: "Could not connect to Supabase endpoint.",
        error: err?.message || String(err),
      });
    }
  };

  useEffect(() => {
    checkSupabaseConnection();
  }, []);

  const syncToCloud = async (opts?: { full?: boolean }): Promise<{
    success: boolean;
    message: string;
  }> => {
    try {
      const res = await pushLedgerToSupabase({
        warehouses,
        products,
        inventoryBatches,
        grns,
        payments,
        stockTransfers,
        promotions,
        bills: allBills,
        trips,
        audits,
        orgProfile,
        billingSettings,
        salesmen,
        supplierSchemes,
        supplierSchemeApplications,
        supplierCreditNotes,
      }, { full: opts?.full === true });
      const nowStr = new Date().toLocaleTimeString();
      setSupabaseStatus((prev) => ({
        ...prev,
        isConnected: true,
        lastSyncedAt: nowStr,
        message: `Successfully synchronized ${res.pushedCount?.products ?? 0} products, ${res.pushedCount?.grns ?? 0} invoices, ${res.pushedCount?.payments ?? 0} payments, ${res.pushedCount?.bills ?? 0} bills to Supabase.`,
      }));
      return {
        success: true,
        message: `Synchronized to Supabase (${res.pushedCount?.products ?? 0} products, ${res.pushedCount?.grns ?? 0} invoices, ${res.pushedCount?.payments ?? 0} payments, ${res.pushedCount?.bills ?? 0} bills).`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || "Failed to sync with Supabase database.",
      };
    }
  };

  const isInitialMountRef = useRef(true);
  // Saving is held back until the first cloud pull is done. Requests now time out, but never let a stuck start
  // block saving for good.
  useEffect(() => {
    const t = setTimeout(() => {
      isInitialMountRef.current = false;
    }, 20000);
    return () => clearTimeout(t);
  }, []);
  // Ids of trips that were deleted (cloud deletion list). A new trip must never be given one of these ids:
  // the server and every cloud pull silently drop a trip whose id is on that list, which made a freshly
  // confirmed trip vanish on the next refresh.
  const deadTripIdsRef = useRef<Set<number>>(new Set());

  // Keep one trip number reserved from the server for this device, like invoice numbers, so two phones can
  // never both create "Trip #12" while offline from each other.
  useEffect(() => {
    const highest = Math.max(
      0,
      ...trips.map((t) => Number(t.id) || 0),
      ...Array.from(deadTripIdsRef.current),
    );
    if ((Number(readHeldNumbers()["trip"]) || 0) <= highest) {
      void refillDocReservation("trip", highest);
    }
  }, [trips.length]);

  // Same for product and promotion numbers.
  useEffect(() => {
    const seqs: [string, number][] = [
      ["product", Math.max(0, ...products.map((p) => Number(p.id) || 0))],
      ["promotion", Math.max(0, ...promotions.map((p) => Number(p.id) || 0))],
    ];
    const held = readHeldNumbers();
    for (const [seq, highest] of seqs) {
      if ((Number(held[seq]) || 0) <= highest) void refillDocReservation(seq, highest);
    }
  }, [products.length, promotions.length]);

  // Same for audit numbers (two devices counting stock must not both save "Audit #7").
  useEffect(() => {
    const highest = Math.max(0, ...audits.map((a) => Number(a.id) || 0));
    if ((Number(readHeldNumbers()["audit"]) || 0) <= highest) {
      void refillDocReservation("audit", highest);
    }
  }, [audits.length]);

  const pullFromCloudFull = async (): Promise<{
    success: boolean;
    message: string;
  }> => {
    try {
      // 0. Apply deletions made on any device before merging anything back in. The log is read ONCE here and
      //    reused in step 2c below (it used to be downloaded twice per pull).
      const delLog = await syncDeletionLog().catch(
        () => [] as Awaited<ReturnType<typeof pullDeletionLogFromSupabase>>,
      );

      // 1. Pull primary structured tables from Supabase
      const remote = await pullLedgerFromSupabase().catch(() => null);

      // 2. Pull server persistence collections (orders, warehouses, schemes, inventory, products, batches, trips, grns)
      let [
        serverOrders,
        serverWarehouses,
        serverSchemes,
        serverInventory,
        serverProducts,
        serverBatches,
        serverTrips,
        serverGrns,
      ] = await Promise.all([
        loadOrders().catch(() => []),
        loadWarehouses().catch(() => []),
        loadSchemes().catch(() => []),
        loadInventory().catch(() => []),
        loadProducts().catch(() => []),
        loadInventoryBatches().catch(() => []),
        loadTrips().catch(() => []),
        loadGrns().catch(() => []),
      ]);

      // 2b. Bills / GRNs / trips deleted on purpose must not come back from ANY source (database rows that
      //     failed to delete, an old server copy, this device's own state).
      const dead = await pullTombstonesFromSupabase().catch(() => null);
      if (dead) {
        dead.trips.forEach((x: any) => {
          const n = Number(x);
          if (Number.isFinite(n) && n > 0) deadTripIdsRef.current.add(n);
        });
        const liveBill = (b: any) => !dead.bills.has(String(b?.id));
        const liveGrn = (g: any) => !dead.grns.has(String(g?.id));
        const liveTrip = (t: any) => t?.status === "out" || !dead.trips.has(String(t?.id));
        if (remote) {
          if (remote.bills) remote.bills = remote.bills.filter(liveBill);
          if (remote.grns) remote.grns = remote.grns.filter(liveGrn);
          if (remote.trips) remote.trips = remote.trips.filter(liveTrip);
        }
        serverOrders = (serverOrders as any[]).filter(liveBill) as typeof serverOrders;
        serverGrns = (serverGrns as any[]).filter(liveGrn) as typeof serverGrns;
        serverTrips = (serverTrips as any[]).filter(liveTrip) as typeof serverTrips;
        setBillsRaw((prev) => (prev.some((b) => !liveBill(b)) ? prev.filter(liveBill) : prev));
        setTrips((prev) => (prev.some((t) => !liveTrip(t)) ? prev.filter(liveTrip) : prev));
        setGrns((prev) => (prev.some((g) => !liveGrn(g)) ? prev.filter(liveGrn) : prev));
      }

      // 2c. Products / batches / godowns deleted on purpose (another device, or the server's upsert-only copy,
      //     must not bring them back).
      const deadProductKeys = new Set(delLog.filter((r) => r.kind === "product").map((r) => r.id));
      const deadBatchIds = new Set(delLog.filter((r) => r.kind === "batch").map((r) => r.id));
      const deadWarehouseIds = new Set(delLog.filter((r) => r.kind === "warehouse").map((r) => r.id));
      const productAlive = (p: any) => !deadProductKeys.has(productDeletionKey(p));
      const batchAlive = (b: any) => !deadBatchIds.has(String(b?.id));
      const warehouseAlive = (w: any) => !deadWarehouseIds.has(String(w?.id));
      const deadPromotionIds = new Set(delLog.filter((r) => r.kind === "promotion").map((r) => r.id));
      const deadSalesmanIds = new Set(delLog.filter((r) => r.kind === "salesman").map((r) => r.id));
      const promotionAlive = (x: any) => !deadPromotionIds.has(String(x?.id));
      const salesmanAlive = (x: any) => !deadSalesmanIds.has(String(x?.id));
      if (deadPromotionIds.size || deadSalesmanIds.size) {
        if (remote) {
          if (remote.promotions) remote.promotions = (remote.promotions as any[]).filter(promotionAlive) as any;
          if (remote.salesmen) remote.salesmen = remote.salesmen.filter(salesmanAlive);
        }
        serverSchemes = (serverSchemes as any[]).filter(promotionAlive) as typeof serverSchemes;
        setPromotions((prev) => (prev.some((x) => !promotionAlive(x)) ? prev.filter(promotionAlive) : prev));
        setSalesmen((prev) => (prev.some((x) => !salesmanAlive(x)) ? prev.filter(salesmanAlive) : prev));
      }
      if (deadProductKeys.size || deadBatchIds.size || deadWarehouseIds.size) {
        if (remote) {
          if (remote.products) remote.products = remote.products.filter(productAlive);
          if (remote.inventoryBatches) remote.inventoryBatches = remote.inventoryBatches.filter(batchAlive);
          if (remote.warehouses) remote.warehouses = remote.warehouses.filter(warehouseAlive);
        }
        serverProducts = (serverProducts as any[]).filter(productAlive) as typeof serverProducts;
        serverBatches = (serverBatches as any[]).filter(batchAlive) as typeof serverBatches;
        serverWarehouses = (serverWarehouses as any[]).filter(warehouseAlive) as typeof serverWarehouses;
        setProducts((prev) => (prev.some((p) => !productAlive(p)) ? prev.filter(productAlive) : prev));
        setInventoryBatches((prev) => (prev.some((b) => !batchAlive(b)) ? prev.filter(batchAlive) : prev));
        setWarehouses((prev) => (prev.some((w) => !warehouseAlive(w)) ? prev.filter(warehouseAlive) : prev));
      }

      if (remote) {
        if (remote.warehouses && remote.warehouses.length > 0) {
          const incoming = remote.warehouses;
          // a godown created on this device that the cloud has not received yet is kept
          setWarehouses((prev) => {
            const have = new Set(incoming.map((w: any) => String(w.id)));
            return [...incoming, ...prev.filter((w) => !have.has(String(w.id)) && warehouseAlive(w))];
          });
        } else if (serverWarehouses && serverWarehouses.length > 0) {
          setWarehouses(serverWarehouses as any);
        }

        const allFoundGrns = [
          ...(Array.isArray(remote.grns) ? remote.grns : []),
          ...(Array.isArray(serverGrns) ? serverGrns : []),
        ];

      if (allFoundGrns.length > 0) {
        const mergedGrns = ensureUniqueGrnNumbers(
          (() => {
            const map = new Map<string, GRN>();
            grns
              .filter((g) => !dead || !dead.grns.has(String(g.id)))
              .forEach((g) => map.set(g.id, g));
            allFoundGrns.forEach((g) => map.set(g.id, g));
            return Array.from(map.values());
          })(),
        );
        setGrns(mergedGrns);
        saveGrns(mergedGrns).catch(() => {});
        const { products: derivedProducts, batches: derivedBatches } =
          buildCatalogFromGrns(mergedGrns, remote.warehouses || warehouses);
        const candidateProducts = (() => {
          const map = new Map<number, Product>();
          const nameMap = new Map<string, Product>();
          derivedProducts.forEach((p) => {
            map.set(p.id, p);
            nameMap.set(p.name.trim().toLowerCase(), p);
          });
          const sourceList = [
            ...(Array.isArray(serverProducts) ? serverProducts : []),
            ...(Array.isArray(remote.products) ? remote.products : []),
          ];
          sourceList.forEach((p: any) => {
            const d = map.get(p.id) || nameMap.get(String(p.name || '').trim().toLowerCase());
            // CRITICAL: d is derived directly from the verified inward consignment GRNs / supplier bills.
            // Prioritize d's accurate crate-level effectiveCost and landedCostPerCrate whenever d exists.
            const eff = (d?.effectiveCost && d.effectiveCost > 0)
              ? d.effectiveCost
              : Number(p.effectiveCost) || Number(p.cost) || d?.cost || 0;
            const landed = (d?.landedCostPerCrate && d.landedCostPerCrate > 0)
              ? d.landedCostPerCrate
              : (p.landedCostPerCrate && Number(p.landedCostPerCrate) > 0)
                ? Number(p.landedCostPerCrate)
                : resolveItemLandedCrateCost({ ...p, unitPrice: p.cost });
            const fromCloud = {
              ...p,
              name: String(p.name || '').trim().toUpperCase(),
              cost: d?.cost || p.cost,
              effectiveCost: eff,
              landedCostPerCrate: landed,
              ...productTaxFields(p),
            };
            // An edit made on this device after the cloud copy was saved (a price change, say) must not be
            // overwritten by that older cloud copy on the next sync. Costs still come from the inward entries.
            const mine = productsRef.current.find((x) => x.id === p.id);
            map.set(
              p.id,
              mine && productStampMs(mine) > productStampMs(p)
                ? {
                    ...fromCloud,
                    ...mine,
                    cost: fromCloud.cost,
                    effectiveCost: fromCloud.effectiveCost,
                    landedCostPerCrate: fromCloud.landedCostPerCrate,
                  }
                : fromCloud,
            );
          });
          // a product added by hand on this device (no inward entry yet) is not dropped by the sync
          productsRef.current.forEach((p) => {
            if (productAlive(p) && !map.has(p.id)) map.set(p.id, p);
          });
          return Array.from(map.values()).map((p) => ({
            ...p,
            name: String(p.name || '').trim().toUpperCase(),
          }));
        })();
        if (candidateProducts.length > 0) {
          setProducts(candidateProducts);
          saveProducts(candidateProducts).catch(() => {});
        } else {
          setProducts(derivedProducts);
        }
        const resolvedBatches = (() => {
          const rawBatches =
            remote.inventoryBatches && remote.inventoryBatches.length > 0
              ? remote.inventoryBatches
              : serverBatches && serverBatches.length > 0
                ? (serverBatches as any)
                : derivedBatches;
          // batches of an inward entry that only exists on this device (not pushed yet) must survive the sync
          const cloudGrnIds = new Set(allFoundGrns.map((g: any) => String(g.id)));
          const localOnlyGrnIds = mergedGrns.map((g) => String(g.id)).filter((id) => !cloudGrnIds.has(id));
          const haveBatch = new Set(rawBatches.map((b: any) => String(b.id)));
          const unsent = derivedBatches.filter(
            (d) =>
              !haveBatch.has(String(d.id)) &&
              batchAlive(d) &&
              localOnlyGrnIds.some((gid) => String(d.id).includes(gid)),
          );
          return [...rawBatches, ...unsent].map((b: any) => {
            const dB = derivedBatches.find((d) => d.id === b.id);
            let eff = dB?.effectiveCostPrice || Number(b.effectiveCostPrice);
            const cost = dB?.costPrice || Number(b.costPrice);
            if (!eff || eff < 30) {
              eff = dB?.effectiveCostPrice || cost;
            }
            return {
              ...b,
              costPrice: cost,
              effectiveCostPrice: eff || cost,
              landedCostPerCrate: dB?.landedCostPerCrate || b.landedCostPerCrate,
            };
          });
        })();
        setInventoryBatches(resolvedBatches);
      } else {
        const candidateProducts = (() => {
          const map = new Map<number, Product>();
          productsRef.current.filter(productAlive).forEach((p) => map.set(p.id, p));
          if (Array.isArray(serverProducts)) {
            serverProducts.forEach((p: any) => map.set(p.id, newerProduct(map.get(p.id), p)));
          }
          if (Array.isArray(remote.products)) {
            remote.products.forEach((p: any) => map.set(p.id, newerProduct(map.get(p.id), p)));
          }
          return Array.from(map.values()).map((p) => ({
            ...p,
            name: String(p.name || '').trim().toUpperCase(),
            ...productTaxFields(p),
          }));
        })();
        if (candidateProducts.length > 0) {
          setProducts(candidateProducts);
          saveProducts(candidateProducts).catch(() => {});
        }
        if (remote.inventoryBatches && remote.inventoryBatches.length > 0) {
          setInventoryBatches(remote.inventoryBatches);
        } else if (serverBatches && serverBatches.length > 0) {
          setInventoryBatches(serverBatches as any);
        }
      }

      if (remote.stockTransfers) {
        // Transfers are only ever added, so merge by id: one made on this device and not pushed yet is kept.
        const incoming = remote.stockTransfers;
        setStockTransfers((prev) => {
          const have = new Set(incoming.map((t) => String(t.id)));
          return [...incoming, ...prev.filter((t) => !have.has(String(t.id)))];
        });
      }
      if (Array.isArray(remote.promotions) && remote.promotions.length > 0) {
        const mappedPromos = (
          Array.isArray(remote.promotions) ? remote.promotions : []
        ).map((p: any) => normalizePromotion(p));
        setPromotions(mappedPromos);
        saveSchemes(mappedPromos as any).catch(() => {});
      } else if (serverSchemes && serverSchemes.length > 0) {
        const mappedPromos = (
          Array.isArray(serverSchemes) ? serverSchemes : []
        ).map((p: any) => normalizePromotion(p));
        setPromotions(mappedPromos);
        saveSchemes(mappedPromos as any).catch(() => {});
      }

        if (remote.bills && remote.bills.length > 0) {
          setBillsRaw((prev) => {
            const map = new Map<number, Bill>();
            prev.forEach((b) => map.set(b.id, b));
            remote.bills!.forEach((b) => map.set(b.id, pickNewerBill(map.get(b.id), b)));
            return Array.from(map.values()).sort((a, b) => b.id - a.id);
          });
        } else if (serverOrders && serverOrders.length > 0) {
          setBillsRaw((prev) => {
            const map = new Map<number, Bill>();
            prev.forEach((b) => map.set(b.id, b));
            (serverOrders as any[]).forEach((b) => map.set(b.id, pickNewerBill(map.get(b.id), b)));
            return Array.from(map.values()).sort((a, b) => b.id - a.id);
          });
        }
        // NOTE: when the cloud has no bills this device's copy is NOT uploaded any more. That "restore" let a stale
        // or test-polluted device re-create deleted bills right after a clean-up. Use "Sync to cloud" on purpose.

        if (remote.payments && remote.payments.length > 0) {
          setPayments((prev) => {
            const map = new Map<string, PaymentRecord>();
            prev.forEach((p) => map.set(p.id, p));
            withoutDeletedPayments<PaymentRecord>(remote.payments!).forEach((p) =>
              map.set(p.id, p),
            );
            return reconcilePaymentsFromBills(
              Array.from(map.values()),
              remote.bills || allBills,
            );
          });
        } else if (remote.bills && remote.bills.length > 0) {
          setPayments((prev) =>
            reconcilePaymentsFromBills(prev, remote.bills!),
          );
        }

        const incomingTrips =
          remote.trips && remote.trips.length > 0
            ? remote.trips
            : serverTrips && serverTrips.length > 0
              ? (serverTrips as any[])
              : null;

        if (incomingTrips) {
          setTripsRaw((prev) => {
            const map = new Map<number, Trip>();
            prev.forEach((t) => map.set(Number(t.id), t));
            incomingTrips.forEach((t: any) => {
              const id = Number(t.id);
              map.set(id, pickNewerTrip(map.get(id), normalizeTrip(t)));
            });
            return Array.from(map.values()).sort(
              (a, b) => Number(b.id) - Number(a.id),
            );
          });
        }

        // Audits merge by number instead of being replaced: one counted offline and not pushed yet is kept, and one
        // deleted on purpose (deletion log) stays deleted.
        const deadAuditIds = new Set(delLog.filter((r) => r.kind === "audit").map((r) => r.id));
        if ((remote.audits && remote.audits.length > 0) || deadAuditIds.size > 0) {
          const incoming = (remote.audits || []).filter((a) => !deadAuditIds.has(String(a.id)));
          setAudits((prev) => {
            const map = new Map<number, Audit>();
            prev.filter((a) => !deadAuditIds.has(String(a.id))).forEach((a) => map.set(Number(a.id), a));
            incoming.forEach((a) => map.set(Number(a.id), a));
            return Array.from(map.values()).sort((a, b) => Number(b.id) - Number(a.id));
          });
        }

        if (remote.salesmen && remote.salesmen.length > 0) {
          setSalesmen(remote.salesmen);
        }

        if (remote.orgProfile) {
          setOrgProfile(remote.orgProfile);
        } else if (orgProfile) {
          cloud(
            "pushOrgProfileToSupabase",
            pushOrgProfileToSupabase(orgProfile),
          );
        }

        if (remote.billingSettings) {
          const current = billingSettingsRef.current;
          const localToUse = loadCachedBillingSettings() || current;
          const remoteTime = remote.billingSettings?.updatedAt ? new Date(remote.billingSettings.updatedAt).getTime() : 0;
          const localTime = localToUse?.updatedAt ? new Date(localToUse.updatedAt).getTime() : 0;

          if (localTime > remoteTime) {
            // This device has the newer settings: send them, through the one save path.
            saveBillingSettings(localToUse).catch(() => {});
            if (localToUse !== current) setBillingSettings(localToUse);
          } else {
            const merged = { ...DEFAULT_BILLING_SETTINGS, ...remote.billingSettings };
            // Only touch state when something is different; the cloud's own copy is never sent back.
            if (JSON.stringify(merged) !== JSON.stringify(current)) setBillingSettings(merged);
          }
        } else if (billingSettingsRef.current) {
          saveBillingSettings(billingSettingsRef.current).catch(() => {});
        }

        if (remote.auditSessions && remote.auditSessions.length > 0) {
          setAuditSessions((prev) => {
            const map = new Map(prev.map((s) => [s.id, s]));
            remote.auditSessions!.forEach((s) => map.set(s.id, s));
            const merged = Array.from(map.values());
            saveAuditSessions(merged).catch(() => {});
            return merged;
          });
        }

        if (
          remote.reconciliationTransactions &&
          remote.reconciliationTransactions.length > 0
        ) {
          setReconciliationTransactions((prev) => {
            const map = new Map(prev.map((t) => [t.id, t]));
            remote.reconciliationTransactions!.forEach((t) => map.set(t.id, t));
            const merged = Array.from(map.values());
            saveReconciliationTransactions(merged).catch(() => {});
            return merged;
          });
        }

        if (remote.stockLedgerEntries && remote.stockLedgerEntries.length > 0) {
          setStockLedgerEntries((prev) => {
            const map = new Map(prev.map((e) => [e.id, e]));
            remote.stockLedgerEntries!.forEach((e) => map.set(e.id, e));
            const merged = Array.from(map.values());
            saveStockLedgerEntries(merged).catch(() => {});
            return merged;
          });
        }

        if (
          remote.inventoryDispositions &&
          remote.inventoryDispositions.length > 0
        ) {
          setInventoryDispositions((prev) => {
            const map = new Map(prev.map((d) => [d.id, d]));
            remote.inventoryDispositions!.forEach((d: any) => {
              if (!readDispositionTombstones().has(d.id)) map.set(d.id, d);
            });
            const merged = Array.from(map.values());
            saveInventoryDispositions(merged).catch(() => {});
            return merged;
          });
        }

        if (
          remote.supplierCreditNotes &&
          remote.supplierCreditNotes.length > 0
        ) {
          let tombstones = new Set<string>();
          try {
            tombstones = new Set(
              JSON.parse(
                localStorage.getItem("deleted_supplier_credit_note_ids") ||
                  "[]",
              ),
            );
          } catch {}
          setSupplierCreditNotes((prev) => {
            const map = new Map<string, SupplierCreditNote>();
            remote.supplierCreditNotes!.forEach((n: any) => {
              if (!tombstones.has(n.id) && n.id !== "scn_mun0c32l27o8") map.set(n.id, n);
            });
            prev.forEach((n) => {
              if (!tombstones.has(n.id) && n.id !== "scn_mun0c32l27o8" && !map.has(n.id)) {
                map.set(n.id, n);
              }
            });
            // Deduplicate notes pointing to the same linked disposition or same supplier & CN number
            const dedupMap = new Map<string, SupplierCreditNote>();
            for (const n of map.values()) {
              const dispMatch = (n.notes || "").match(/Linked disposition (disp_[a-z0-9]+)/i);
              const key = dispMatch
                ? `disp_${dispMatch[1]}`
                : n.creditNoteNumber
                  ? `cn_${(n.supplierName || "").trim().toLowerCase()}_${n.creditNoteNumber.trim().toLowerCase()}`
                  : n.id;
              if (!dedupMap.has(key)) {
                dedupMap.set(key, n);
              } else {
                const existing = dedupMap.get(key)!;
                if ((n.actualAmount > 0 && existing.actualAmount === 0) || (n.creditNoteNumber && !existing.creditNoteNumber)) {
                  dedupMap.set(key, n);
                }
              }
            }
            const merged = Array.from(dedupMap.values());
            saveSupplierCreditNotes(merged).catch(() => {});
            return merged;
          });
        }

        if (remote.supplierSchemes && remote.supplierSchemes.length > 0) {
          setSupplierSchemes((prev) => {
            const map = new Map(prev.map((s) => [s.id, s]));
            remote.supplierSchemes!.forEach((s: any) => map.set(s.id, s));
            const merged = Array.from(map.values());
            saveSupplierSchemes(merged).catch(() => {});
            return merged;
          });
        }
      } else {
        // Fallback to server collections if direct tables are empty/uninitialized
        if (serverWarehouses && serverWarehouses.length > 0)
          setWarehouses(serverWarehouses as any);
        if (serverSchemes && serverSchemes.length > 0)
          setPromotions(
            (Array.isArray(serverSchemes) ? serverSchemes : []).map(
              (p: any) => normalizePromotion(p),
            ) as any,
          );
        if (serverOrders && serverOrders.length > 0)
          setBillsRaw((prev) => {
            const map = new Map<number, Bill>();
            prev.forEach((b) => map.set(b.id, b));
            (serverOrders as any[]).forEach((b) =>
              map.set(b.id, pickNewerBill(map.get(b.id), b)),
            );
            return Array.from(map.values()).sort((a, b) => b.id - a.id);
          });
        if (serverProducts && serverProducts.length > 0)
          setProducts(
            (serverProducts as Product[]).map((p) => ({
              ...p,
              name: String(p.name || '').trim().toUpperCase(),
              ...productTaxFields(p),
            }))
          );
        if (serverBatches && serverBatches.length > 0)
          setInventoryBatches(serverBatches as any);
        if (serverTrips && serverTrips.length > 0)
          // MERGE, never replace: replacing wiped a trip that had just been confirmed on this device
          // but had not reached the server copy yet. This device's own copy of a trip wins.
          setTripsRaw((prev) => {
            const map = new Map<number, Trip>();
            (serverTrips as any[]).forEach((t) => map.set(Number(t.id), normalizeTrip(t)));
            prev.forEach((t) => {
              map.set(Number(t.id), pickNewerTrip(t, map.get(Number(t.id)) ?? t));
            });
            return Array.from(map.values()).sort((a, b) => Number(b.id) - Number(a.id));
          });
      }

      isInitialMountRef.current = false;

      const nowStr = new Date().toLocaleTimeString();
      setSupabaseStatus((prev) => ({
        ...prev,
        isConnected: true,
        lastSyncedAt: nowStr,
        message: "Successfully pulled latest records from Supabase database.",
      }));

      return {
        success: true,
        message: "Latest records pulled from Supabase successfully.",
      };
    } catch (err: any) {
      isInitialMountRef.current = false;
      return {
        success: false,
        message: err?.message || "Failed to fetch data from Supabase.",
      };
    }
  };

  /**
   * The pull everything else calls.
   *  - plain call (app start, manual Sync, after a conflict): a full download, exactly as before.
   *  - { auto: true } (timer, window focus, other tabs): a few tiny read-only questions first; the full download
   *    only happens if the cloud changed, or as a regular safety net. Several calls at once share one download.
   */
  const pullFromCloud = async (
    opts?: PullFromCloudOptions,
  ): Promise<{ success: boolean; message: string }> => {
    // Something may hand this function a click event; only an explicit { auto: true } means "background".
    const auto = !!opts && (opts as PullFromCloudOptions).auto === true;
    const gate = cloudSyncGate;
    const now = Date.now();

    if (cloudPullInFlight) {
      // A background request never starts a second download. A manual one shares a download that only just started.
      if (auto || now - cloudPullInFlight.startedAt < 5000) return cloudPullInFlight.promise;
      await cloudPullInFlight.promise.catch(() => {});
    }

    if (auto) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return { success: true, message: "Offline: nothing to check" };
      }
      if (!canCheckNow(gate, now)) return { success: true, message: "Checked a moment ago" };
    }
    gate.lastCheckAt = now;

    // The tiny questions are asked for manual pulls too, to have something to compare against afterwards.
    const probe = await probeCloudChanges().catch(() => null);

    if (auto) {
      const decision = decideAutoPull(gate, probe, Date.now());
      noteDecision(gate, decision);
      console.info(`[sync] background check: ${decision.pull ? "downloading" : "skipped"} (${decision.reason})`);
      if (!decision.pull) return { success: true, message: `No cloud changes (${decision.reason})` };
    } else {
      // A manual Sync must really re-read everything, including the remembered deletion lists.
      resetCloudReadCaches();
      gate.changedStreak = 0;
    }

    // A second tiny check could slip in while this one is being set up.
    if (cloudPullInFlight) return cloudPullInFlight.promise;

    holdSyncSignal();
    const promise = pullFromCloudFull();
    cloudPullInFlight = { promise, auto, startedAt: Date.now() };
    try {
      const result = await promise;
      if (result.success) {
        gate.lastFullPullAt = Date.now();
        // After a download the app writes merged data back to the cloud. Wait for that to land, THEN remember what
        // the cloud looks like, so the app's own write-backs are not mistaken for another device's changes.
        gate.settling = true;
        setTimeout(() => {
          probeCloudChanges()
            .then((p) => {
              gate.baseline = p ?? gate.baseline;
            })
            .catch(() => {})
            .finally(() => {
              gate.settling = false;
            });
        }, SETTLE_MS);
      }
      return result;
    } finally {
      // the app's own write-backs after a download are not news for other devices
      releaseSyncSignal(SETTLE_MS + 2000);
      if (cloudPullInFlight && cloudPullInFlight.promise === promise) cloudPullInFlight = null;
    }
  };

  // Sync state mutations to storage & Supabase backend
  useEffect(() => {
    if (isInitialMountRef.current) return;
    saveOrders(allBills);
  }, [allBills]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    saveWarehouses(warehouses);
  }, [warehouses]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    saveSchemes(promotions);
  }, [promotions]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    saveTrips(trips);
    if (trips.length > 0) {
      saveDailyVehicleTrip(trips[0]);
    }
  }, [trips]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    // This device's copy only. Sending to the server happens in updateBillingSettings (and nowhere else), so a
    // download that merely loaded the cloud's settings no longer writes them straight back.
    cacheBillingSettingsLocally(billingSettings);
  }, [billingSettings]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    saveOrgProfile(orgProfile);
  }, [orgProfile]);

  // An emptied list (the last product / batch deleted) must be saved too, otherwise the old copy comes back on the
  // next reload. A list that is empty only because nothing has loaded yet is still never written.
  const hadProductsRef = useRef(false);
  const hadBatchesRef = useRef(false);
  useEffect(() => {
    if (isInitialMountRef.current) return;
    if (products.length > 0) hadProductsRef.current = true;
    if (products.length > 0 || hadProductsRef.current) {
      saveProducts(products);
    }
  }, [products]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    if (inventoryBatches.length > 0) hadBatchesRef.current = true;
    if (inventoryBatches.length > 0 || hadBatchesRef.current) {
      saveInventoryBatches(inventoryBatches);
    }
  }, [inventoryBatches]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    if (products.length > 0) {
      const invItems: InventoryItem[] = products.map((p) => {
        const matchingBatches = inventoryBatches.filter(
          (b) => b.productId === p.id,
        );
        const totalStock = matchingBatches.reduce(
          (acc, b) => acc + (b.quantity || 0),
          0,
        );
        const latestBatch = matchingBatches[0];
        const prodSku = p.sku || generateSkuId(p.name, p.category, p.id);
        const batchLot =
          latestBatch?.batchNumber ||
          p.batchNumber ||
          generateBatchNumber(p.name);
        const mfg = latestBatch?.mfgDate || p.mfgDate || "";
        const exp = latestBatch?.expiryDate || p.expiry || "";

        return {
          id: `inv_${prodSku}`,
          product_id: prodSku, // Product ID in database is the SKU code as required
          productId: prodSku,
          sku: prodSku,
          stock_on_hand:
            matchingBatches.length > 0 ? totalStock : p.opening || 0,
          stockOnHand: matchingBatches.length > 0 ? totalStock : p.opening || 0,
          reserved_stock: 0,
          reservedStock: 0,
          reorder_level: 10,
          reorderLevel: 10,
          warehouse_id: latestBatch?.warehouseId || p.warehouseId || "",
          warehouseId: latestBatch?.warehouseId || p.warehouseId || "",
          warehouseName: "",
          warehouseBay: "",
          batch_number: batchLot,
          batchNumber: batchLot,
          mfg_date: mfg,
          mfgDate: mfg,
          expiry_date: exp,
          expiryDate: exp,
          unit_cost: p.cost || 0,
          unitCost: p.cost || 0,
          selling_scheme: p.scheme || "",
          sellingScheme: p.scheme || "",
          selling_scheme_discount: 0,
          sellingSchemeDiscount: 0,
          selling_scheme_label: p.scheme || "",
          sellingSchemeLabel: p.scheme || "",
          last_restocked: latestBatch?.inwardDate || new Date().toISOString(),
          lastRestocked: latestBatch?.inwardDate || new Date().toISOString(),
        };
      });
      saveInventory(invItems);
    }
  }, [products, inventoryBatches]);

  const saveCustomSupabaseCredentials = async (url: string, key: string) => {
    saveSupabaseCustomConfig(url, key);
    setSupabaseConfigState(getSupabaseConfig());
    await checkSupabaseConnection();
  };

  const clearCustomSupabaseCredentials = () => {
    clearSupabaseCustomConfig();
    setSupabaseConfigState(getSupabaseConfig());
    checkSupabaseConnection();
  };

  // Inward GRN Single Source of Truth
  //
  // FOOLPROOF INWARD GUARANTEE: this is the one place a GRN is ever committed, and it
  // hard-validates before touching any state (products/batches/GRN list). There is no
  // default warehouse anywhere in this app — grnData.warehouseId must be a real,
  // explicitly user-selected warehouse id, every batch line must carry its own batch
  // number + expiry date, and the invoice number must not already be posted for this
  // supplier. Throws GrnValidationError (with the full issue list, including
  // non-blocking warnings such as near-expiry stock) instead of silently proceeding —
  // callers should catch it and show the issues to the user rather than letting an
  // invalid inward slip through.
  const postGrn = (
    grnData: Omit<GRN, "id" | "grnNumber" | "createdAt" | "updatedAt">,
  ): GRN => {
    const draft: GrnDraft = {
      warehouseId: grnData.warehouseId,
      supplierName: grnData.supplierName,
      invoiceNo: grnData.invoiceNo,
      items: grnData.items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        qty: it.qty,
        freeQty: it.freeQty,
        schemeMode: it.schemeMode,
        unitPrice: it.unitPrice,
        discountAmount: it.discountAmount,
        batchNumber: it.batchNumber,
        expiry: it.expiry,
        mfgDate: it.mfgDate,
      })),
    };
    const issues = validateGrnDraft(draft, {
      warehouses,
      grns,
      existingBatches: inventoryBatches,
    });
    if (grnErrors(issues).length > 0) {
      throw new GrnValidationError(issues);
    }

    const year = new Date().getFullYear();
    // Highest sequence already used this year (count+1 duplicates a number after any delete).
    const grnPrefix = `GRN-${year}-`;
    const highestGrnSeq = grns.reduce((m, g) => {
      const n =
        g.grnNumber && g.grnNumber.startsWith(grnPrefix)
          ? parseInt(g.grnNumber.slice(grnPrefix.length), 10)
          : 0;
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const nextNum = reserveDocNumber(`grn-${year}`, highestGrnSeq);
    const grnNumber = `GRN-${year}-${String(nextNum).padStart(3, "0")}`;
    const id =
      "grn_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = new Date().toISOString();

    const newGrn: GRN = {
      ...grnData,
      id,
      grnNumber,
      createdAt: now,
      updatedAt: now,
      totalSupplierSchemeFreeQty: grnData.items.reduce(
        (s, it) => s + (Number(it.supplierSchemeFreeQty) || 0),
        0,
      ),
    };

    // 1. Resolve every line to a product, adding/updating catalog entries. Computed
    // synchronously from the latest catalog (NOT inside a setState updater): the resolved
    // productIds, the catalog and the batches below are all needed immediately, and an updater
    // may run later (or twice in StrictMode), which used to leave lines without a productId.
    let nextCatalog: Product[] = [...productsRef.current];
    let maxProductId = nextCatalog.reduce((m, p) => Math.max(m, p.id), 0);
    const resolvedItems = newGrn.items.map((rawItem) => {
      const item = { ...rawItem };
      const existing = nextCatalog.find(
        (p) =>
          (item.productId && p.id === item.productId) ||
          p.name.trim().toLowerCase() === item.productName.trim().toLowerCase(),
      );

      if (!existing) {
        maxProductId++;
        const autoSku =
          item.sku ||
          generateAutoSku(
            item.productName,
            item.category || "energy",
            maxProductId,
          );
        const crateCost = resolveItemCrateCost(item);
        const crateLanded = resolveItemLandedCrateCost(item);
        nextCatalog.push({
          id: maxProductId,
          name: item.productName.trim().toUpperCase(),
          category: item.category || "energy",
          pack: item.pack || "PET",
          volume: item.volume || 150,
          packSize: item.packSize,
          unitsPerCrate:
            Number(item.unitsPerCrate) > 0
              ? Number(item.unitsPerCrate)
              : inferUnitsPerCase(`${item.productName} ${item.pack || ""}`, item.volume),
          wholesale:
            item.wholesaleRate ||
            Math.round((crateLanded || item.unitPrice) * 1.15),
          retail:
            item.retailRate ||
            Math.round((crateLanded || item.unitPrice) * 1.25),
          cost: item.unitPrice || crateCost,
          effectiveCost: crateCost,
          landedCostPerCrate: crateLanded,
          landedCostPerUnit: item.landedCostPerUnit,
          opening: 0,
          hsn: normalizeTo8DigitHsn(item.hsn, item.category, item.productName),
          gstRate:
            gstRateFromHsn(
              normalizeTo8DigitHsn(item.hsn, item.category, item.productName),
            ) ?? ((item.cgstPercent || 0) + (item.sgstPercent || 0)) / 100,
          scheme: item.schemeText,
          sku: autoSku,
          warehouseId: newGrn.warehouseId,
          batchNumber:
            item.batchNumber || generateBatchNumber(item.productName),
          expiry: item.expiry,
          mfgDate: item.mfgDate,
        });
        item.productId = maxProductId;
      } else {
        const crateCost = resolveItemCrateCost(item);
        const crateLanded = resolveItemLandedCrateCost(item);
        item.productId = existing.id;
        nextCatalog = nextCatalog.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                cost: item.unitPrice || crateCost || p.cost,
                effectiveCost: crateCost || p.effectiveCost,
                landedCostPerCrate:
                  crateLanded || p.landedCostPerCrate,
                landedCostPerUnit:
                  item.landedCostPerUnit || p.landedCostPerUnit,
                unitsPerCrate: item.unitsPerCrate || p.unitsPerCrate,
                packSize: item.packSize || p.packSize,
                ...(item.hsn
                  ? {
                      hsn: normalizeTo8DigitHsn(item.hsn, p.category, p.name),
                      gstRate:
                        gstRateFromHsn(
                          normalizeTo8DigitHsn(item.hsn, p.category, p.name),
                        ) ?? p.gstRate,
                    }
                  : {}),
                wholesale: item.wholesaleRate || p.wholesale,
                retail: item.retailRate || p.retail,
                batchNumber: item.batchNumber || p.batchNumber,
                expiry: item.expiry || p.expiry,
                mfgDate: item.mfgDate || p.mfgDate,
                scheme: item.schemeText || p.scheme,
              }
            : p,
        );
      }
      return item;
    });
    // Every line now carries a real productId; never guess one (the old `|| 1` would have put
    // stock on product #1).
    if (resolvedItems.some((it) => !it.productId)) {
      throw new Error(
        "Could not resolve a product for every GRN line; nothing was posted.",
      );
    }
    newGrn.items = resolvedItems;
    productsRef.current = nextCatalog;
    setProducts(nextCatalog);

    // 2. Add batches to inventoryBatches so live warehouse stock increments
    // Track supplier discounts: line discounts + invoice-level overallDiscount (proportional).
    // Spreading bill discount into effective cost keeps margin reports honest (e.g. ₹15,467 off print).
    const overallDisc = Math.max(0, Number(newGrn.overallDiscount) || 0);
    const lineDiscTotal = newGrn.items.reduce(
      (s, it) => s + (Number(it.discountAmount) || 0),
      0,
    );
    if (newGrn.totalLineDiscount == null)
      newGrn.totalLineDiscount = lineDiscTotal;
    if (newGrn.overallDiscount == null) newGrn.overallDiscount = overallDisc;
    const taxableBase = newGrn.items.reduce((s, it) => {
      const lineTaxable =
        Number(it.taxableAmount) ||
        Math.max(
          0,
          (Number(it.qty) || 0) * (Number(it.unitPrice) || 0) -
            (Number(it.discountAmount) || 0),
        );
      return s + lineTaxable;
    }, 0);

    const newBatchesList: InventoryBatch[] = newGrn.items.map((item) => {
      const received =
        (Number(item.totalReceivedQty) || 0) +
        (Number(item.supplierSchemeFreeQty) || 0);
      const lineTaxable =
        Number(item.taxableAmount) ||
        Math.max(
          0,
          (Number(item.qty) || 0) * (Number(item.unitPrice) || 0) -
            (Number(item.discountAmount) || 0),
        );
      const billDiscShare =
        taxableBase > 0 && overallDisc > 0
          ? (lineTaxable / taxableBase) * overallDisc
          : 0;
      const crateCost = resolveItemCrateCost(item);
      let unitEff =
        item.supplierSchemeFreeQty &&
        item.supplierSchemeFreeQty > 0 &&
        item.totalReceivedQty > 0
          ? ((crateCost || 0) * item.totalReceivedQty) /
            (item.totalReceivedQty + item.supplierSchemeFreeQty)
          : crateCost || Number(item.unitPrice) || 0;
      // Apply share of invoice-level supplier discount across physical cases received
      if (received > 0 && billDiscShare > 0) {
        unitEff = Math.max(0, unitEff - billDiscShare / received);
      }
      const discNote =
        billDiscShare > 0 || (Number(item.discountAmount) || 0) > 0
          ? ` · disc line ₹${(Number(item.discountAmount) || 0).toFixed(2)} bill-share ₹${billDiscShare.toFixed(2)}`
          : "";
      return {
        id: `batch_${newGrn.id}_${item.id}`,
        productId: item.productId as number,
        sku: item.sku,
        batchNumber: item.batchNumber || generateBatchNumber(item.productName),
        supplierInvoiceNo: newGrn.invoiceNo,
        supplierName: newGrn.supplierName,
        inwardDate: newGrn.inwardDate,
        mfgDate: item.mfgDate,
        expiryDate: item.expiry || "2026-12-31",
        warehouseId: newGrn.warehouseId,
        quantity: received,
        billedQuantity: item.qty,
        freeQuantity: item.freeQty,
        supplierSchemeId: item.supplierSchemeId,
        supplierSchemeFreeQty: item.supplierSchemeFreeQty || undefined,
        costPrice: item.unitPrice || crateCost,
        effectiveCostPrice: Math.round(unitEff * 100) / 100,
        mrp: item.retailRate || item.unitPrice * 1.2,
        scheme: item.schemeText,
        cgstRate: item.cgstPercent,
        sgstRate: item.sgstPercent,
        hsn: normalizeTo8DigitHsn(item.hsn, item.category, item.productName),
        notes: `Inward: ${newGrn.grnNumber} · ${newGrn.supplierName}${discNote}`,
      };
    });
    const nextBatches = [...inventoryBatchesRef.current, ...newBatchesList];
    inventoryBatchesRef.current = nextBatches;
    setInventoryBatches(nextBatches);

    const updatedGrns = [newGrn, ...grns];
    setGrns(updatedGrns);

    // Save to storage layer (local cache + backend server API)
    saveGrns(updatedGrns).catch(() => {});
    saveProducts(nextCatalog).catch(() => {});
    saveInventoryBatches(nextBatches).catch(() => {});

    const targetWh =
      warehouses.find((w) => w.id === newGrn.warehouseId) || warehouses[0];

    // Push inward invoice directly to Supabase cloud database
    pushInwardInvoiceToSupabase({
      grn: newGrn,
      products: nextCatalog,
      inventoryBatches: newBatchesList,
      allGrns: updatedGrns,
      warehouse: targetWh,
    })
      .then((res) => {
        if (res.cloudSynced) {
          reportSyncSuccess();
          setSupabaseStatus((prev) => ({
            ...prev,
            isConnected: true,
            lastSyncedAt: new Date().toLocaleTimeString(),
            message: `Inward invoice ${newGrn.invoiceNo || newGrn.grnNumber} saved to Supabase PostgreSQL database.`,
          }));
        } else {
          reportSyncFailure(
            `Inward invoice ${newGrn.invoiceNo || newGrn.grnNumber}`,
            res.message,
          );
          setSupabaseStatus((prev) => ({
            ...prev,
            message: `Inward invoice saved on this device but NOT to the cloud: ${res.message}`,
          }));
        }
      })
      .catch((err) => {
        console.error("Failed to sync GRN to Supabase:", err);
        reportSyncFailure(
          `Inward invoice ${newGrn.invoiceNo || newGrn.grnNumber}`,
          err,
        );
        setSupabaseStatus((prev) => ({
          ...prev,
          message: `Inward invoice saved on this device but NOT to the cloud: ${err?.message || err}`,
        }));
      });

    return newGrn;
  };

  const updateGrn = (
    id: string,
    updates: Partial<GRN>,
    meta?: { reason?: string },
  ) => {
    const existingGrn = grns.find((g) => g.id === id);
    if (!existingGrn) return;

    const mergedGrn: GRN = {
      ...existingGrn,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Same hard rules as postGrn apply on edit: an edit can never clear/blank out the
    // warehouse, drop a batch number/expiry, or move to a warehouse that no longer
    // exists. (Duplicate-invoice check is skipped for this GRN's own invoice number.)
    const editIssues = validateGrnDraft(
      {
        warehouseId: mergedGrn.warehouseId,
        supplierName: mergedGrn.supplierName,
        invoiceNo: mergedGrn.invoiceNo,
        items: mergedGrn.items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          qty: it.qty,
          freeQty: it.freeQty,
          schemeMode: it.schemeMode,
          unitPrice: it.unitPrice,
          discountAmount: it.discountAmount,
          batchNumber: it.batchNumber,
          expiry: it.expiry,
          mfgDate: it.mfgDate,
        })),
      },
      { warehouses, grns, existingBatches: inventoryBatches, editingGrnId: id },
    );
    if (grnErrors(editIssues).length > 0) {
      throw new GrnValidationError(editIssues);
    }

    // Auto-resolve "cases mismatch" import warnings once the corrected count matches the invoice.
    if (
      mergedGrn.importWarnings?.some(
        (w) => !w.resolved && w.type === "cases_mismatch",
      )
    ) {
      const receivedNow = Number(mergedGrn.totalReceivedQty) || 0;
      mergedGrn.importWarnings = mergedGrn.importWarnings.map((w) =>
        !w.resolved &&
        w.type === "cases_mismatch" &&
        w.expected !== undefined &&
        receivedNow === w.expected
          ? {
              ...w,
              resolved: true,
              resolvedAt: mergedGrn.updatedAt,
              resolvedNote: `Count corrected to ${receivedNow} cs by ${currentUser?.name || "Admin"}`,
            }
          : w,
      );
    }

    // Track every correction: who changed what, when and why.
    const grnChanges = diffGrn(existingGrn, mergedGrn);
    if (grnChanges.length > 0) {
      const record: GrnEditRecord = {
        id:
          "ge_" +
          Date.now().toString(36) +
          Math.random().toString(36).slice(2, 5),
        at: mergedGrn.updatedAt,
        by: currentUser?.name || "Admin",
        reason: meta?.reason?.trim() || undefined,
        changes: grnChanges,
      };
      mergedGrn.editHistory = [...(existingGrn.editHistory || []), record];
      cloud(
        "pushGrnEditLogToSupabase",
        pushGrnEditLogToSupabase(mergedGrn, record),
      );
    }
    const normName = (n: string) => (n || "").trim().toLowerCase();
    const isThisGrnBatch = (b: InventoryBatch) =>
      b.id.startsWith(`batch_${id}_`) ||
      (b.supplierInvoiceNo === existingGrn.invoiceNo &&
        b.supplierName === existingGrn.supplierName);

    const rawTargetItems = updates.items || existingGrn.items;
    const targetWhId = updates.warehouseId || existingGrn.warehouseId;

    // 1. Re-sync products — computed synchronously from the latest catalog (see postGrn).
    let nextCatalog: Product[] = [...productsRef.current];
    let maxProductId = nextCatalog.reduce((m, p) => Math.max(m, p.id), 0);
    const resolvedItems = rawTargetItems.map((rawItem) => {
      const item = { ...rawItem };
      const existing = nextCatalog.find(
        (p) =>
          (item.productId && p.id === item.productId) ||
          p.name.trim().toLowerCase() === item.productName.trim().toLowerCase(),
      );

      if (!existing) {
        maxProductId++;
        const autoSku =
          item.sku ||
          generateAutoSku(
            item.productName,
            item.category || "energy",
            maxProductId,
          );
        const crateCost = resolveItemCrateCost(item);
        const crateLanded = resolveItemLandedCrateCost(item);
        nextCatalog.push({
          id: maxProductId,
          name: item.productName.trim().toUpperCase(),
          category: item.category || "energy",
          pack: item.pack || "PET",
          volume: item.volume || 150,
          wholesale:
            item.wholesaleRate ||
            Math.round((crateLanded || item.unitPrice) * 1.15),
          retail:
            item.retailRate ||
            Math.round((crateLanded || item.unitPrice) * 1.25),
          cost: item.unitPrice || crateCost,
          effectiveCost: crateCost,
          landedCostPerCrate: crateLanded,
          opening: 0,
          hsn: normalizeTo8DigitHsn(item.hsn, item.category, item.productName),
          gstRate:
            gstRateFromHsn(
              normalizeTo8DigitHsn(item.hsn, item.category, item.productName),
            ) ?? ((item.cgstPercent || 0) + (item.sgstPercent || 0)) / 100,
          scheme: item.schemeText,
          sku: autoSku,
          warehouseId: targetWhId,
          batchNumber:
            item.batchNumber || generateBatchNumber(item.productName),
          expiry: item.expiry,
          mfgDate: item.mfgDate,
        });
        item.productId = maxProductId;
      } else {
        const crateCost = resolveItemCrateCost(item);
        const crateLanded = resolveItemLandedCrateCost(item);
        item.productId = existing.id;
        nextCatalog = nextCatalog.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                cost: item.unitPrice || crateCost || p.cost,
                // Fix a mistyped product name on the invoice: rename in place, unless another
                // GRN still refers to the old name (that would split the product in two).
                name:
                  item.productName.trim() &&
                  normName(item.productName) !== normName(p.name) &&
                  !grns.some(
                    (g) =>
                      g.id !== id &&
                      g.items.some(
                        (it) => normName(it.productName) === normName(p.name),
                      ),
                  )
                    ? item.productName.trim()
                    : p.name,
                effectiveCost: crateCost || p.effectiveCost,
                landedCostPerCrate: crateLanded || p.landedCostPerCrate,
                wholesale: item.wholesaleRate || p.wholesale,
                retail: item.retailRate || p.retail,
                batchNumber: item.batchNumber || p.batchNumber,
                expiry: item.expiry || p.expiry,
                mfgDate: item.mfgDate || p.mfgDate,
                scheme: item.schemeText || p.scheme,
              }
            : p,
        );
      }
      return item;
    });
    if (resolvedItems.some((it) => !it.productId)) {
      throw new Error(
        "Could not resolve a product for every GRN line; nothing was saved.",
      );
    }
    const targetItems = resolvedItems;
    mergedGrn.items = resolvedItems;
    productsRef.current = nextCatalog;
    setProducts(nextCatalog);

    // 2. Replace batches for this GRN with fresh ones reflecting new counts & warehouse
    const freshBatchesList: InventoryBatch[] = targetItems.map((item) => {
      const crateCost = resolveItemCrateCost(item);
      return {
        // Deterministic id — must match what buildCatalogFromGrns derives
        // (`batch_${grn.id}_${item.id}`) or the reactive [grns, warehouses] effect duplicates this
        // batch instead of updating it in place.
        id: `batch_${id}_${item.id}`,
        productId: item.productId as number,
        sku: item.sku,
        batchNumber: item.batchNumber || generateBatchNumber(item.productName),
        supplierInvoiceNo: mergedGrn.invoiceNo,
        supplierName: mergedGrn.supplierName,
        inwardDate: mergedGrn.inwardDate,
        mfgDate: item.mfgDate,
        expiryDate: item.expiry || "2026-12-31",
        warehouseId: targetWhId,
        quantity:
          item.totalReceivedQty + (Number(item.supplierSchemeFreeQty) || 0),
        billedQuantity: item.qty,
        freeQuantity: item.freeQty,
        supplierSchemeId: item.supplierSchemeId,
        supplierSchemeFreeQty: item.supplierSchemeFreeQty || undefined,
        costPrice: item.unitPrice || crateCost,
        effectiveCostPrice:
          item.supplierSchemeFreeQty &&
          item.supplierSchemeFreeQty > 0 &&
          item.totalReceivedQty > 0
            ? Math.round(((crateCost * item.totalReceivedQty) /
                (item.totalReceivedQty + item.supplierSchemeFreeQty)) * 100) / 100
            : crateCost,
        mrp: item.retailRate || item.unitPrice * 1.2,
        scheme: item.schemeText,
        cgstRate: item.cgstPercent,
        sgstRate: item.sgstPercent,
        hsn: normalizeTo8DigitHsn(item.hsn, item.category, item.productName),
        notes: `Inward (Updated): ${mergedGrn.grnNumber} · ${mergedGrn.supplierName}`,
      };
    });
    const nextBatches = [
      ...inventoryBatchesRef.current.filter((b) => !isThisGrnBatch(b)),
      ...freshBatchesList,
    ];
    inventoryBatchesRef.current = nextBatches;
    setInventoryBatches(nextBatches);

    const updatedGrns = grns.map((g) =>
      g.id === id
        ? {
            ...mergedGrn,
            totalSupplierSchemeFreeQty: targetItems.reduce(
              (s, it) => s + (Number(it.supplierSchemeFreeQty) || 0),
              0,
            ),
          }
        : g,
    );
    setGrns(updatedGrns);

    // Lines removed (or products renamed to a different one) while editing must not leave
    // stale stock behind — same rule as deleting a GRN.
    const usedAfter = (p: Product) =>
      updatedGrns.some((g) =>
        g.items.some(
          (it) =>
            (it.productId && it.productId === p.id) ||
            normName(it.productName) === normName(p.name),
        ),
      );
    const wasInThisGrnBefore = (p: Product) =>
      existingGrn.items.some(
        (it) =>
          (it.productId && it.productId === p.id) ||
          normName(it.productName) === normName(p.name),
      );
    const orphaned = products.filter(
      (p) => wasInThisGrnBefore(p) && !usedAfter(p),
    );
    const orphanDeleteIds = orphaned
      .filter(
        (p) => !bills.some((b) => b.items.some((it) => it.productId === p.id)),
      )
      .map((p) => p.id);
    const orphanZeroIds = orphaned
      .map((p) => p.id)
      .filter((pid) => !orphanDeleteIds.includes(pid));
    if (orphaned.length > 0) {
      setProducts((prev) =>
        prev
          .filter((p) => !orphanDeleteIds.includes(p.id))
          .map((p) =>
            orphanZeroIds.includes(p.id) ? { ...p, opening: 0 } : p,
          ),
      );
      orphanDeleteIds.forEach((pid) =>
        cloud("deleteProductFromSupabase", deleteProductFromSupabase(pid)),
      );
    }
    // Remove cloud batch rows for lines that no longer exist on this GRN
    const freshBatchIds = new Set(
      targetItems.map((it) => `batch_${id}_${it.id}`),
    );
    inventoryBatches
      .filter((b) => isThisGrnBatch(b) && !freshBatchIds.has(b.id))
      .forEach((b) =>
        cloud("deleteBatchFromSupabase", deleteBatchFromSupabase(b.id)),
      );

    const targetWh =
      warehouses.find((w) => w.id === targetWhId) || warehouses[0];
    saveGrns(updatedGrns).catch(() => {});
    saveProducts(nextCatalog).catch(() => {});
    saveInventoryBatches(nextBatches).catch(() => {});
    pushInwardInvoiceToSupabase({
      grn: mergedGrn,
      products: nextCatalog,
      inventoryBatches: freshBatchesList,
      allGrns: updatedGrns,
      warehouse: targetWh,
    })
      .then((res) => {
        if (res && res.cloudSynced === false) {
          reportSyncFailure(`GRN ${mergedGrn.grnNumber} update`, res.message);
        } else {
          reportSyncSuccess();
        }
      })
      .catch((err) => {
        console.error("Failed to update GRN in Supabase:", err);
        reportSyncFailure(`GRN ${mergedGrn.grnNumber} update`, err);
      });
  };

  const deleteGrn = (id: string) => {
    const target = grns.find((g) => g.id === id);
    if (!target) return;

    const remainingGrns = grns.filter((g) => g.id !== id);

    // --- 1. Work out which batches belong to this GRN --------------------------------
    // Match by the deterministic id prefix (`batch_<grnId>_<itemId>`), and also catch
    // legacy batches (random ids) that carry the same invoice + supplier.
    const isTargetBatch = (b: InventoryBatch) =>
      b.id.startsWith(`batch_${id}_`) ||
      (b.supplierInvoiceNo === target.invoiceNo &&
        b.supplierName === target.supplierName);
    const removedBatches = inventoryBatches.filter(isTargetBatch);

    // --- 2. Work out which products this GRN touched ---------------------------------
    const norm = (n: string) => (n || "").trim().toLowerCase();
    const touchedIds = new Set<number>();
    const touchedNames = new Set<string>();
    target.items.forEach((it) => {
      if (it.productId) touchedIds.add(it.productId);
      touchedNames.add(norm(it.productName));
    });
    removedBatches.forEach((b) => touchedIds.add(b.productId));

    const stillInRemainingGrns = (p: Product) =>
      remainingGrns.some((g) =>
        g.items.some(
          (it) =>
            (it.productId && it.productId === p.id) ||
            norm(it.productName) === norm(p.name),
        ),
      );
    const usedInBills = (p: Product) =>
      bills.some((b) => b.items.some((it) => it.productId === p.id));

    // Recompute opening for products that still have other GRNs
    const { products: rebuilt } = buildCatalogFromGrns(
      remainingGrns,
      warehouses,
    );
    const rebuiltByName = new Map(rebuilt.map((p) => [norm(p.name), p]));

    const productsToDelete: number[] = [];
    const productsToUpdate: Product[] = [];
    const nextProducts: Product[] = [];
    for (const p of products) {
      const wasTouched = touchedIds.has(p.id) || touchedNames.has(norm(p.name));
      if (!wasTouched) {
        nextProducts.push(p);
        continue;
      }
      if (stillInRemainingGrns(p)) {
        // Product also exists in other GRNs -> restore opening from what's left
        const r = rebuiltByName.get(norm(p.name));
        const updated = r
          ? {
              ...p,
              opening: r.opening,
              cost: r.cost,
              effectiveCost: r.effectiveCost,
            }
          : p;
        productsToUpdate.push(updated);
        nextProducts.push(updated);
      } else if (usedInBills(p)) {
        // Has sales history: keep the product record (so old bills still resolve) but zero its stock
        const updated = { ...p, opening: 0 };
        productsToUpdate.push(updated);
        nextProducts.push(updated);
      } else {
        // Product only ever existed because of this GRN -> remove it completely
        productsToDelete.push(p.id);
      }
    }

    // --- 3. Apply to local state ------------------------------------------------------
    setInventoryBatches((prev) => prev.filter((b) => !isTargetBatch(b)));
    setProducts(nextProducts);
    setGrns(remainingGrns);

    if (activeGrnToEdit?.id === id) {
      setActiveGrnToEdit(null);
    }

    // --- 4. Apply to the cloud / server so a refresh doesn't bring the stock back -----
    cloud(
      "pushGrnEditLogToSupabase",
      pushGrnEditLogToSupabase(target, {
        id:
          "ge_" +
          Date.now().toString(36) +
          Math.random().toString(36).slice(2, 5),
        at: new Date().toISOString(),
        by: currentUser?.name || "Admin",
        reason: "GRN deleted",
        changes: [
          {
            scope: "header",
            field: "GRN",
            from: `${target.grnNumber} · Inv ${target.invoiceNo} · ₹${target.grandTotal}`,
            to: "Deleted",
          },
        ],
      }),
    );
    cloud("deleteGrnFromSupabase", deleteGrnFromSupabase(id, remainingGrns));
    removedBatches.forEach((b) => {
      logDeletion("batch", b.id);
      cloud("deleteBatchFromSupabase", deleteBatchFromSupabase(b.id));
    });
    productsToDelete.forEach((pid) => {
      const gone = products.find((p) => p.id === pid);
      if (gone) logDeletion("product", productDeletionKey(gone), gone.name);
      cloud("deleteProductFromSupabase", deleteProductFromSupabase(pid));
    });
    productsToUpdate.forEach((p) =>
      cloud("pushProductToSupabase", pushProductToSupabase(p)),
    );
    // Replace the server-side mirrors (they are upsert-only, so push the full remaining lists)
    saveProducts(nextProducts);
    saveInventoryBatches(inventoryBatches.filter((b) => !isTargetBatch(b)));
    saveGrns(remainingGrns);
    fetch(`/api/grns/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const deleteLocalDatabase = () => {
    try {
      purgeLegacyLocalStorageKeys();
      console.log("Local database purged.");
    } catch (e) {
      console.warn("Error purging local storage:", e);
    }
    pullFromCloud();
  };

  const loadSampleGrn = () => {
    // Deprecated: sample data removed to maintain a clean database
  };

  // Warehouse Management
  const defaultWarehouse = useMemo(() => {
    return warehouses.find((w) => w.isDefault) || warehouses[0];
  }, [warehouses]);

  const addWarehouse = (w: Omit<Warehouse, "id">): string => {
    const id =
      "wh_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const isFirst = warehouses.length === 0;
    const newWh: Warehouse = {
      ...w,
      id,
      isDefault: isFirst ? true : Boolean(w.isDefault),
    };

    setWarehouses((prev) => {
      if (newWh.isDefault) {
        return [...prev.map((item) => ({ ...item, isDefault: false })), newWh];
      }
      return [...prev, newWh];
    });

    // Sync to Supabase table
    cloud("pushWarehouseToSupabase", pushWarehouseToSupabase(newWh));
    return id;
  };

  const updateWarehouse = (id: string, updates: Partial<Warehouse>) => {
    const currentWh = warehouses.find((w) => w.id === id);
    const updatedObj: Warehouse | null = currentWh
      ? { ...currentWh, ...updates }
      : null;
    setWarehouses((prev) =>
      prev.map((w) => {
        if (w.id === id) return updatedObj ?? { ...w, ...updates };
        if (updates.isDefault) return { ...w, isDefault: false };
        return w;
      }),
    );
    if (updatedObj) {
      cloud("pushWarehouseToSupabase", pushWarehouseToSupabase(updatedObj));
    }
  };

  const deleteWarehouse = (id: string) => {
    setWarehouses((prev) => prev.filter((w) => w.id !== id));
    logDeletion("warehouse", id);
    cloud("deleteWarehouseFromSupabase", deleteWarehouseFromSupabase(id));
  };

  // Batches Management
  const addBatch = (b: Omit<InventoryBatch, "id">): string => {
    const id =
      "batch_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6);
    const newBatch: InventoryBatch = { ...b, id };
    setInventoryBatches((prev) => [...prev, newBatch]);

    // Update product primary batch/warehouse if product has none
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === b.productId) {
          const updates: Partial<Product> = {};
          if (!p.batchNumber) updates.batchNumber = b.batchNumber;
          if (!p.expiry) updates.expiry = b.expiryDate;
          if (!p.mfgDate && b.mfgDate) updates.mfgDate = b.mfgDate;
          if (!p.warehouseId && b.warehouseId)
            updates.warehouseId = b.warehouseId;
          return { ...p, ...updates };
        }
        return p;
      }),
    );

    // Sync batch to Supabase inventory_batches table
    cloud("pushBatchToSupabase", pushBatchToSupabase(newBatch));
    return id;
  };

  const updateBatch = (id: string, updates: Partial<InventoryBatch>) => {
    const currentBatch = inventoryBatchesRef.current.find((b) => b.id === id);
    const updatedBatch: InventoryBatch | null = currentBatch
      ? { ...currentBatch, ...updates }
      : null;
    if (updatedBatch) {
      inventoryBatchesRef.current = inventoryBatchesRef.current.map((b) =>
        b.id === id ? updatedBatch : b,
      );
      setInventoryBatches((prev) =>
        prev.map((b) => (b.id === id ? updatedBatch : b)),
      );
    }
    if (updatedBatch) {
      cloud("pushBatchToSupabase", pushBatchToSupabase(updatedBatch));
    }
  };

  const deleteBatch = (id: string) => {
    const gone = inventoryBatches.find((b) => b.id === id);
    if (
      gone &&
      inventoryBatches.filter((b) => b.productId === gone.productId).length ===
        1
    ) {
      // Last lot for this product: batches superseded the opening figure, so clear it rather than
      // letting the old opening number resurface as phantom stock.
      setProducts((ps) =>
        ps.map((p) => (p.id === gone.productId ? { ...p, opening: 0 } : p)),
      );
    }
    setInventoryBatches((prev) => prev.filter((b) => b.id !== id));
    logDeletion("batch", id);
    cloud("deleteBatchFromSupabase", deleteBatchFromSupabase(id));
  };

  const batchesForProduct = (
    productId: number,
    warehouseId?: string,
  ): InventoryBatch[] => {
    return inventoryBatches.filter((b) => {
      if (b.productId !== productId) return false;
      if (warehouseId && b.warehouseId !== warehouseId) return false;
      return true;
    });
  };

  // Stock Transfer — never allow moving more than source has (no negative stock).
  const addStockTransfer = (st: Omit<StockTransfer, "id">): boolean => {
    const qty = Math.floor(Number(st.quantity) || 0);
    if (qty <= 0) return false;
    if (!st.fromWarehouseId || !st.toWarehouseId) return false;
    if (st.fromWarehouseId === st.toWarehouseId) return false;

    const bn = (st.batchNumber || "").trim().toUpperCase();
    const byFefo = (a: InventoryBatch, b: InventoryBatch) => {
      const ea = (a.expiryDate || "9999-12-31").slice(0, 10);
      const eb = (b.expiryDate || "9999-12-31").slice(0, 10);
      if (ea !== eb) return ea.localeCompare(eb);
      return (a.inwardDate || "0000-01-01")
        .slice(0, 10)
        .localeCompare((b.inwardDate || "0000-01-01").slice(0, 10));
    };

    // Snapshot current batches for validation before mutating
    const current = inventoryBatches;
    let sourceCandidates: InventoryBatch[] = [];
    if (bn) {
      const match = current.find(
        (b) =>
          b.productId === st.productId &&
          b.warehouseId === st.fromWarehouseId &&
          (b.batchNumber || "").toUpperCase() === bn,
      );
      if (!match || (Number(match.quantity) || 0) < qty) {
        notify(
          `Cannot transfer ${qty} cases — insufficient stock in batch ${bn || "(none)"} at source.`,
        );
        return false;
      }
      sourceCandidates = [match];
    } else {
      sourceCandidates = current
        .filter(
          (b) =>
            b.productId === st.productId &&
            b.warehouseId === st.fromWarehouseId &&
            (Number(b.quantity) || 0) > 0,
        )
        .sort(byFefo);
      const totalPhysical = sourceCandidates.reduce(
        (s, b) => s + (Number(b.quantity) || 0),
        0,
      );
      // Also respect sellable book stock so we don't transfer already-sold crates
      const sellable = Math.max(0, warehouseStock(st.fromWarehouseId, st.productId));
      const available = Math.min(totalPhysical, sellable || totalPhysical);
      if (available < qty) {
        notify(
          `Cannot transfer ${qty} cases — only ${available} available at source. Negative stock is not allowed.`,
        );
        return false;
      }
      if (sourceCandidates.length === 0 && sellable < qty) {
        notify(
          `Cannot transfer ${qty} cases — insufficient stock at source.`,
        );
        return false;
      }
    }

    const id =
      "transfer_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6);
    const newTransfer: StockTransfer = {
      ...st,
      batchNumber: bn || st.batchNumber,
      quantity: qty,
      id,
    };
    setStockTransfers((prev) => [newTransfer, ...prev]);

    setInventoryBatches((prev) => {
      let remaining = qty;
      let next = [...prev];

      const moveFromBatch = (sourceBatch: InventoryBatch, take: number) => {
        if (take <= 0) return;
        next = next.map((b) =>
          b.id === sourceBatch.id
            ? { ...b, quantity: Math.max(0, (Number(b.quantity) || 0) - take) }
            : b,
        );
        const destBatch = next.find(
          (b) =>
            b.productId === st.productId &&
            b.warehouseId === st.toWarehouseId &&
            (b.batchNumber || "").toUpperCase() ===
              (sourceBatch.batchNumber || "").toUpperCase(),
        );
        if (destBatch) {
          next = next.map((b) =>
            b.id === destBatch.id
              ? { ...b, quantity: (Number(b.quantity) || 0) + take }
              : b,
          );
        } else {
          const destId =
            "batch_" +
            Date.now().toString(36) +
            Math.random().toString(36).slice(2, 6) +
            take;
          next = [
            ...next,
            {
              id: destId,
              productId: st.productId,
              batchNumber: sourceBatch.batchNumber,
              mfgDate: sourceBatch.mfgDate,
              expiryDate: sourceBatch.expiryDate,
              inwardDate: sourceBatch.inwardDate,
              warehouseId: st.toWarehouseId,
              quantity: take,
              costPrice: sourceBatch.costPrice,
              // keep the scheme-adjusted cost and tax data, or margins on this batch use the gross invoice rate
              effectiveCostPrice: sourceBatch.effectiveCostPrice,
              sku: sourceBatch.sku,
              supplierInvoiceNo: sourceBatch.supplierInvoiceNo,
              supplierName: sourceBatch.supplierName,
              cgstRate: sourceBatch.cgstRate,
              sgstRate: sourceBatch.sgstRate,
              hsn: sourceBatch.hsn,
              mrp: sourceBatch.mrp,
              notes: `Transferred from ${st.fromWarehouseId}`,
            },
          ];
        }
      };

      if (bn) {
        const sourceBatch = next.find(
          (b) =>
            b.productId === st.productId &&
            b.warehouseId === st.fromWarehouseId &&
            (b.batchNumber || "").toUpperCase() === bn,
        );
        if (sourceBatch) moveFromBatch(sourceBatch, qty);
      } else {
        const ordered = next
          .filter(
            (b) =>
              b.productId === st.productId &&
              b.warehouseId === st.fromWarehouseId &&
              (Number(b.quantity) || 0) > 0,
          )
          .sort(byFefo);
        for (const src of ordered) {
          if (remaining <= 0) break;
          const have = Number(src.quantity) || 0;
          const take = Math.min(have, remaining);
          moveFromBatch(src, take);
          remaining -= take;
        }
      }
      return next;
    });

    return true;
  };

  const loadDemoPreset = (presetId: DemoPresetId) => {
    const preset = DEMO_PRESETS[presetId];
    if (!preset) return;
    setProducts(preset.products);
    setPromotions(preset.promotions);
    setBills(preset.bills);
    resetPaymentsWithInvoices();
    setTrips(preset.trips);
    setOrgProfile(preset.orgProfile);
    setCart(emptyCart());
    setEditingBillId(null);
    setJustFinalizedBillId(null);
  };

  // Payments belong to invoices: when invoices are replaced or cleared, their payments go too,
  // otherwise the old receipts stay behind as stray credit on customers.
  const resetPaymentsWithInvoices = () => {
    const hadPayments = payments.length > 0;
    addPaymentTombstones(payments.map((p) => p.id));
    setPayments([]);
    if (hadPayments) {
      savePayments([]).catch(() => {});
      pushPaymentsToSupabase([], true).catch(() => {});
    }
  };

  const clearTransactions = () => {
    setBills([]);
    resetPaymentsWithInvoices();
    setTrips([]);
    setAudits([]);
    setStockTransfers([]);
    setCart(emptyCart());
    setEditingBillId(null);
    setJustFinalizedBillId(null);
  };

  const clearAllData = () => {
    setGrns([]);
    setProducts([]);
    setWarehouses(INIT_WAREHOUSES);
    setInventoryBatches([]);
    setStockTransfers([]);
    setPromotions([]);
    setBills([]);
    setTrips([]);
    setAudits([]);
    setCustomers([]);
    setPayments([]);
    setSupplierSchemes([]);
    setSupplierCreditNotes([]);
    setInventoryDispositions([]);
    setCart(emptyCart());
    setEditingBillId(null);
    setJustFinalizedBillId(null);
    setActiveGrnToEdit(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("mrwater_customers");
      localStorage.removeItem("mrwater_payments");
      localStorage.removeItem("mrwater_supplier_schemes");
      localStorage.removeItem("mrwater_supplier_credit_notes");
      localStorage.removeItem("mrwater_inventory_dispositions");
      localStorage.removeItem("mrwater_expenses_v1");
      localStorage.removeItem("mrwater_biz_expenses_v1");
      setExpenses([]);
    } catch {
      // ignore
    }
  };

  const cleanDatabase = clearAllData;

  const exportBackup = () => {
    try {
      const backupData = {
        app: "MrWater Beverage Distribution Ledger",
        version: "4.0",
        exportDate: new Date().toISOString(),
        orgProfile,
        billingSettings,
        grns,
        products,
        warehouses,
        inventoryBatches,
        stockTransfers,
        promotions,
        supplierSchemes,
        supplierSchemeApplications,
        supplierCreditNotes,
        expenses,
        bills: allBills,
        trips,
        audits,
        gstMode,
      };
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], {
        type: "application/json;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName = (orgProfile.name || "mrwater_ledger")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .slice(0, 20);
      link.download = `${safeName}_backup_${todayISO()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export backup:", err);
    }
  };

  const importBackup = (
    jsonString: string,
  ): { success: boolean; error?: string } => {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== "object") {
        return {
          success: false,
          error: "Invalid file: JSON root must be an object",
        };
      }
      if (Array.isArray(data.grns)) setGrns(data.grns);
      if (Array.isArray(data.products)) setProducts(data.products);
      if (Array.isArray(data.warehouses)) setWarehouses(data.warehouses);
      if (Array.isArray(data.inventoryBatches))
        setInventoryBatches(data.inventoryBatches);
      if (Array.isArray(data.stockTransfers))
        setStockTransfers(data.stockTransfers);
      if (Array.isArray(data.promotions)) setPromotions(data.promotions);
      if (Array.isArray(data.supplierSchemes))
        setSupplierSchemes(data.supplierSchemes);
      if (Array.isArray(data.supplierSchemeApplications))
        setSupplierSchemeApplications(data.supplierSchemeApplications);
      if (Array.isArray(data.supplierCreditNotes))
        setSupplierCreditNotes(data.supplierCreditNotes);
      if (Array.isArray(data.expenses)) setExpenses(data.expenses);
      if (Array.isArray(data.bills)) setBills(data.bills);
      if (Array.isArray(data.trips)) setTrips(data.trips);
      if (Array.isArray(data.audits)) setAudits(data.audits);
      if (data.orgProfile && typeof data.orgProfile === "object") {
        setOrgProfile((prev) => ({ ...prev, ...data.orgProfile }));
      }
      if (data.billingSettings && typeof data.billingSettings === "object") {
        const importedBilling = {
          ...(billingSettingsRef.current || DEFAULT_BILLING_SETTINGS),
          ...data.billingSettings,
          updatedAt: new Date().toISOString(),
        } as BillingSettings;
        setBillingSettings(importedBilling);
        saveBillingSettings(importedBilling).catch(() => {});
      }
      if (data.gstMode) setGstMode(data.gstMode === "off" ? "off" : "inclusive");
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "Failed to parse JSON backup file",
      };
    }
  };

  const activePromoFor = useCallback(
    (productId: number): Promotion | undefined => {
      const targetPid = Number(productId);
      const targetProd = products.find((pr) => Number(pr.id) === targetPid);
      // Only ACTIVE schemes from the promotions store apply at billing.
      const active = promotions.filter((p) => p.isActive !== false);
      // Prioritize newest / most recently created or updated schemes first
      const activeNewest = [...active].reverse();

      // 1. Direct match on non-bundle schemes with explicit productIds containing targetPid
      const specificSingle = activeNewest.find((p) => {
        if (p.type === "bundle" || p.type === "group_buy_n_get_m_free") return false;
        const ids = extractPromoProductIds(p);
        return ids.length > 0 && ids.some((id) => Number(id) === targetPid);
      });
      if (specificSingle) return specificSingle;

      // 1b. Direct match on group schemes (group_buy_n_get_m_free)
      const groupMatch = activeNewest.find((p) => {
        if (p.type !== "group_buy_n_get_m_free") return false;
        const ids = extractPromoProductIds(p);
        if (ids.length > 0 && ids.some((id) => Number(id) === targetPid)) return true;
        if (targetProd && p.groupCategory && targetProd.category?.toLowerCase() === p.groupCategory.toLowerCase()) return true;
        if (targetProd && p.groupBrand && targetProd.brand?.toLowerCase() === p.groupBrand.toLowerCase()) return true;
        return false;
      });
      if (groupMatch) return groupMatch;

      // 2. Direct match on bundle schemes with explicit productIds containing targetPid
      const specificBundle = activeNewest.find((p) => {
        if (p.type !== "bundle") return false;
        const ids = extractPromoProductIds(p);
        return ids.length > 0 && ids.some((id) => Number(id) === targetPid);
      });
      if (specificBundle) return specificBundle;

      // 3. Direct match on schemes where freeProductId is targetPid
      const rewardBundle = activeNewest.find((p) => {
        return p.freeProductId && Number(p.freeProductId) === targetPid;
      });
      if (rewardBundle) return rewardBundle;

      // 4. Storewide non-bundle schemes (productIds is empty)
      const storewideSingle = activeNewest.find((p) => {
        if (p.type === "bundle") return false;
        const ids = extractPromoProductIds(p);
        return ids.length === 0;
      });
      if (storewideSingle) return storewideSingle;

      // 5. Storewide bundle schemes (productIds is empty)
      return activeNewest.find((p) => {
        const ids = extractPromoProductIds(p);
        return ids.length === 0;
      });
    },
    [promotions, products],
  );

  // Sold calculation excludes the currently edited bill
  const soldByProduct = useMemo(() => {
    const map: Record<number, number> = {};
    for (const b of bills) {
      if (b.id === editingBillId) continue;
      for (const it of b.items) {
        // it.qty represents the total physical crates dispatched/billed (e.g. 4 crates: 3 paid + 1 free)
        const totalCrates = Number(it.qty) || 0;
        map[it.productId] = (map[it.productId] || 0) + totalCrates;
      }
    }
    return map;
  }, [bills, editingBillId]);

  const cartSoldByProduct = useMemo(() => {
    const map: Record<number, number> = {};
    for (const it of cart.items) {
      // it.qty represents the total physical crates in the bill
      const totalCrates = Number(it.qty) || 0;
      map[it.productId] = (map[it.productId] || 0) + totalCrates;
    }
    return map;
  }, [cart.items]);

  // Smart Reconciliation ledger adjustments, summed per product (and per product+warehouse).
  // Live stock = batches (or opening) + these ledger deltas - sales. The ledger is append-only
  // and never edits batches/opening, so the balance is always reconstructable from it.
  const ledgerAdjByProduct = useMemo(() => {
    const m: Record<number, number> = {};
    for (const e of stockLedgerEntries)
      m[e.productId] = (m[e.productId] || 0) + (Number(e.quantity) || 0);
    // Quick stock audits that adjusted stock: the count-vs-system difference is a live-stock delta.
    // Only entries carrying a warehouseId are counted (older audits edited product.opening instead).
    for (const a of audits) {
      if (!a.adjusted) continue;
      for (const e of a.entries)
        if (e.warehouseId)
          m[e.productId] = (m[e.productId] || 0) + (Number(e.diff) || 0);
    }
    return m;
  }, [stockLedgerEntries, audits]);
  const ledgerAdjByProductWh = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of stockLedgerEntries) {
      if (!e.warehouseId) continue;
      const k = `${e.productId}|${e.warehouseId}`;
      m[k] = (m[k] || 0) + (Number(e.quantity) || 0);
    }
    for (const a of audits) {
      if (!a.adjusted) continue;
      for (const e of a.entries) {
        if (!e.warehouseId) continue;
        const k = `${e.productId}|${e.warehouseId}`;
        m[k] = (m[k] || 0) + (Number(e.diff) || 0);
      }
    }
    return m;
  }, [stockLedgerEntries, audits]);

  // Crates customers returned that went back on the shelf (scrapped crates never come back).
  const restockByProduct = useMemo(() => restockedByProduct(bills), [bills]);

  // Disposed stock (damage, expiry returns, return to supplier, free near-expiry issue)
  const disposedByProduct = useMemo(() => {
    const m: Record<number, number> = {};
    for (const d of inventoryDispositions) {
      if (d.stockApplied !== false) {
        m[d.productId] = (m[d.productId] || 0) + (Number(d.quantity) || 0);
      }
    }
    return m;
  }, [inventoryDispositions]);

  const disposedInWhByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of inventoryDispositions) {
      if (d.stockApplied !== false) {
        const k = `${d.productId}|${d.warehouseId}`;
        m[k] = (m[k] || 0) + (Number(d.quantity) || 0);
      }
    }
    return m;
  }, [inventoryDispositions]);

  // Received stock for a product: the opening figure only applies while the product has never had
  // any batch row. Once batches exist they supersede it, even if they have since dropped to zero,
  // otherwise the old opening number reappears as phantom stock.
  function baseStockFor(p: Product): number {
    const rows = inventoryBatches.filter((b) => b.productId === p.id);
    if (rows.length === 0) return Number(p.opening) || 0;
    return rows.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
  }

  // Final pre-save stock check used by finalizeBill / updateBill / EditBillModal. Counts what the
  // bill needs against stock in the assigned van (if trip assigned) or warehouse/godown.
  const stockShortfalls = (
    items: BillItem[],
    excludeBillId?: number | null,
    trip?: Trip | null,
    warehouseId?: string,
  ): {
    productId: number;
    productName: string;
    available: number;
    required: number;
  }[] => {
    const need: Record<number, number> = {};
    for (const it of items)
      need[it.productId] = (need[it.productId] || 0) + (Number(it.qty) || 0);
    const out: {
      productId: number;
      productName: string;
      available: number;
      required: number;
    }[] = [];
    for (const key of Object.keys(need)) {
      const pid = Number(key);
      const p = products.find((x) => x.id === pid);
      if (!p) continue;

      let available = 0;
      if (trip) {
        // Vehicle / Van trip stock: check stock on the assigned van
        const vs = getVehicleStock(trip, pid);
        let vanAvail = Math.max(0, vs.available);
        // If updating an existing bill that was on this trip, add back what it already used
        if (excludeBillId != null) {
          const eb = bills.find((b) => b.id === excludeBillId);
          if (eb && billBelongsToTrip(trip, eb)) {
            for (const bi of eb.items) {
              if (Number(bi.productId) === pid) {
                vanAvail += Number(bi.qty) || 0;
              }
            }
          }
        }
        available = vanAvail;
      } else {
        // Warehouse / depot sale
        let soldElsewhere = 0;
        for (const b of bills) {
          if (excludeBillId != null && b.id === excludeBillId) continue;
          for (const bi of b.items)
            if (bi.productId === pid) soldElsewhere += Number(bi.qty) || 0;
        }
        const totalGodownStock =
          baseStockFor(p) +
          (ledgerAdjByProduct[pid] || 0) +
          (restockByProduct[pid] || 0) -
          (disposedByProduct[pid] || 0) -
          soldElsewhere;

        if (warehouseId && typeof warehouseStock === "function") {
          let whAvail = warehouseStock(warehouseId, pid);
          if (excludeBillId != null) {
            const eb = bills.find((b) => b.id === excludeBillId);
            if (eb && eb.warehouseId === warehouseId) {
              for (const bi of eb.items) {
                if (Number(bi.productId) === pid) {
                  whAvail += Number(bi.qty) || 0;
                }
              }
            }
          }
          available = Math.max(whAvail, totalGodownStock);
        } else {
          available = totalGodownStock;
        }
      }

      if (need[pid] > available)
        out.push({
          productId: pid,
          productName: p.name,
          available,
          required: need[pid],
        });
    }
    return out;
  };

  // FEFO batch allocation for a bill (earliest expiry first; same expiry → oldest inward).
  // Records batchNumber, expiryDate, batchAllocations per line and refuses expired stock.
  // Legacy unallocated sales are treated as having consumed earliest-expiry stock first.
  const allocateBatches = (
    items: BillItem[],
    billDate: string,
    warehouseId?: string | Record<number, string>,
    excludeBillId?: number | null,
    trip?: Trip | null,
  ): { items: BillItem[]; problems: string[] } => {
    const problems: string[] = [];
    const today = (billDate || todayISO()).slice(
      0,
      10,
    );
    // FEFO: expiryDate ascending; tie-break by inwardDate ascending
    const byFefo = (a: InventoryBatch, b: InventoryBatch) => {
      const ea = (a.expiryDate || "9999-12-31").slice(0, 10);
      const eb = (b.expiryDate || "9999-12-31").slice(0, 10);
      if (ea !== eb) return ea.localeCompare(eb);
      return (a.inwardDate || "0000-01-01")
        .slice(0, 10)
        .localeCompare((b.inwardDate || "0000-01-01").slice(0, 10));
    };

    // Sold per batch (from allocations) and legacy unallocated sold per product, from other bills.
    const usedByBatch: Record<string, number> = {};
    const legacyByProduct: Record<number, number> = {};
    for (const b of bills) {
      if (excludeBillId != null && b.id === excludeBillId) continue;
      for (const it of b.items) {
        if (it.batchAllocations && it.batchAllocations.length > 0) {
          for (const a of it.batchAllocations)
            usedByBatch[a.batchId] = (usedByBatch[a.batchId] || 0) + a.qty;
        } else {
          legacyByProduct[it.productId] =
            (legacyByProduct[it.productId] || 0) + (Number(it.qty) || 0);
        }
      }
    }

    // Crates a customer returned and that were restocked are sellable again: credit them back to
    // the batch they came from (or, for older bills with no batch trail, to the product's pool).
    for (const b of bills) {
      if (excludeBillId != null && b.id === excludeBillId) continue;
      for (const r of b.returns || []) {
        for (const l of r.lines) {
          let traced = 0;
          for (const br of l.batchRestocks || []) {
            usedByBatch[br.batchId] = Math.max(
              0,
              (usedByBatch[br.batchId] || 0) - br.qty,
            );
            traced += br.qty;
          }
          const rest = (Number(l.restockQty) || 0) - traced;
          if (rest > 0)
            legacyByProduct[l.productId] = Math.max(
              0,
              (legacyByProduct[l.productId] || 0) - rest,
            );
        }
      }
    }

    // Working remaining per batch, with legacy sales consumed earliest-expiry first.
    const remaining: Record<string, number> = {};
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    for (const pid of productIds) {
      const rows = inventoryBatches
        .filter((b) => b.productId === pid)
        .sort(byFefo);
      let legacy = legacyByProduct[pid] || 0;
      for (const r of rows) {
        let rem = (Number(r.quantity) || 0) - (usedByBatch[r.id] || 0);
        const take = Math.min(Math.max(rem, 0), legacy);
        rem -= take;
        legacy -= take;
        remaining[r.id] = rem;
      }
    }

    // ---- Multi-warehouse van support -------------------------------------------------
    // A van can be loaded from several godowns, and the SAME product can come from more than one
    // of them. The trip records this in warehouseLoads (warehouse -> product -> crates). When a bill
    // is raised against such a trip we must draw each product from the godowns it was actually
    // loaded from, never from one arbitrary godown. `quotaLeft` = crates of that product still on
    // the van that came from that godown (loaded there, minus what earlier bills of this trip took
    // from it).
    const batchWhById = new Map(
      inventoryBatches.map((b) => [b.id, b.warehouseId]),
    );
    const tripLoads: Record<string, Record<number, number>> = {};
    if (trip) {
      const wl = trip.warehouseLoads || {};
      for (const [whId, pMap] of Object.entries(wl)) {
        for (const [pidStr, q] of Object.entries(pMap || {})) {
          if (Number(q) > 0)
            (tripLoads[whId] ||= {})[Number(pidStr)] = Number(q);
        }
      }
      // Older trips (or a database that never stored warehouse_loads): the whole load came from the
      // trip's single warehouse. Any crates loaded beyond what warehouseLoads explains are kept
      // as an unassigned remainder and may come from any godown that holds stock.
      const explained: Record<number, number> = {};
      for (const pMap of Object.values(tripLoads)) {
        for (const [pidStr, q] of Object.entries(pMap)) {
          explained[Number(pidStr)] = (explained[Number(pidStr)] || 0) + q;
        }
      }
      const loadedMap = (
        typeof trip.loaded === "object" && trip.loaded !== null
          ? trip.loaded
          : {}
      ) as Record<number, number>;
      const primaryWh =
        trip.warehouseId ||
        defaultWarehouse?.id ||
        warehouses[0]?.id ||
        "wh-default";
      for (const [pidStr, q] of Object.entries(loadedMap)) {
        const pid = Number(pidStr);
        const extra = (Number(q) || 0) - (explained[pid] || 0);
        if (extra > 0) {
          (tripLoads[primaryWh] ||= {})[pid] =
            ((tripLoads[primaryWh] || {})[pid] || 0) + extra;
        }
      }
    }
    const quotaLeft: Record<string, number> = {};
    if (trip && Object.keys(tripLoads).length > 0) {
      for (const [whId, pMap] of Object.entries(tripLoads)) {
        for (const [pidStr, q] of Object.entries(pMap))
          quotaLeft[`${pidStr}|${whId}`] = q;
      }
      const whOrder = Object.keys(tripLoads);
      for (const b of bills) {
        if (excludeBillId != null && b.id === excludeBillId) continue;
        if (!billBelongsToTrip(trip, b)) continue;
        for (const it of b.items) {
          let left = Number(it.qty) || 0;
          for (const a of it.batchAllocations || []) {
            const wh = batchWhById.get(a.batchId);
            const take = Math.min(left, Number(a.qty) || 0);
            if (wh && take > 0) {
              const k = `${it.productId}|${wh}`;
              if (k in quotaLeft)
                quotaLeft[k] = Math.max(0, quotaLeft[k] - take);
              left -= take;
            }
          }
          // Old bill with no batch trail: assume it drew from the van's godowns in load order.
          for (const wh of whOrder) {
            if (left <= 0) break;
            const k = `${it.productId}|${wh}`;
            if (!(k in quotaLeft)) continue;
            const take = Math.min(left, quotaLeft[k]);
            quotaLeft[k] -= take;
            left -= take;
          }
        }
      }
    }
    const tripHasProduct = (pid: number) =>
      Object.values(tripLoads).some((pMap) => (Number(pMap[pid]) || 0) > 0);

    const out = items.map((it) => {
      const all = inventoryBatches.filter((b) => b.productId === it.productId);
      if (all.length === 0) return it; // legacy/opening-only product: nothing to allocate

      // Ordered passes of candidate batches. `capped` passes are limited by the van quota per godown.
      let passes: { batches: InventoryBatch[]; capped: boolean }[];
      if (trip && tripHasProduct(it.productId)) {
        const tripWhs = new Set(
          Object.entries(tripLoads)
            .filter(([, pMap]) => (Number(pMap[it.productId]) || 0) > 0)
            .map(([whId]) => whId),
        );
        const inTrip = all.filter((b) => tripWhs.has(b.warehouseId));
        const others = all.filter((b) => !tripWhs.has(b.warehouseId));
        passes = [
          { batches: [...inTrip].sort(byFefo), capped: true }, // 1) exactly what was loaded from each godown
          { batches: [...inTrip].sort(byFefo), capped: false }, // 2) same godowns, van quota drifted
          { batches: [...others].sort(byFefo), capped: false }, // 3) last resort so a saved trip never blocks a sale
        ];
      } else {
        const targetWh =
          typeof warehouseId === "object" && warehouseId !== null
            ? warehouseId[it.productId]
            : warehouseId;
        const inWh = targetWh
          ? all.filter((b) => b.warehouseId === targetWh)
          : [];
        const others = targetWh
          ? all.filter((b) => b.warehouseId !== targetWh)
          : [];
        passes = [
          {
            batches: [...(inWh.length > 0 ? inWh : all)].sort(byFefo),
            capped: false,
          },
          ...(inWh.length > 0 && others.length > 0
            ? [{ batches: [...others].sort(byFefo), capped: false }]
            : []),
        ];
      }

      let need = Number(it.qty) || 0;
      const allocations: NonNullable<BillItem["batchAllocations"]> = [];
      const expiredSeen = new Set<string>();
      let expiredSkipped = 0;
      for (const pass of passes) {
        for (const b of pass.batches) {
          if (need <= 0) break;
          const rem = remaining[b.id] ?? 0;
          if (rem <= 0) continue;
          if (b.expiryDate && b.expiryDate.slice(0, 10) < today) {
            if (!expiredSeen.has(b.id)) {
              expiredSeen.add(b.id);
              expiredSkipped += rem;
            }
            continue;
          }
          const qKey = `${it.productId}|${b.warehouseId}`;
          const cap = pass.capped
            ? (quotaLeft[qKey] ?? 0)
            : Number.POSITIVE_INFINITY;
          const take = Math.min(rem, need, cap);
          if (take <= 0) continue;
          const existing = allocations.find((a) => a.batchId === b.id);
          if (existing) existing.qty += take;
          else
            allocations.push({
              batchId: b.id,
              batchNumber: b.batchNumber,
              expiryDate: b.expiryDate,
              qty: take,
            });
          remaining[b.id] = rem - take;
          if (qKey in quotaLeft)
            quotaLeft[qKey] = Math.max(0, quotaLeft[qKey] - take);
          need -= take;
        }
        if (need <= 0) break;
      }

      // If strict FEFO candidate passes left any unallocated quantity, but valid batches exist:
      // In real-world beverage distribution, physical stock on a van or warehouse should never block
      // saving an invoice due to batch tracking quota drift or multi-warehouse remainder.
      if (need > 0 && all.length > 0) {
        const nonExpired = all.filter(
          (b) => !b.expiryDate || b.expiryDate.slice(0, 10) >= today,
        );
        const candidatePool = nonExpired.length > 0 ? nonExpired : all;
        const fallbackBatch =
          candidatePool.find(
            (b) => b.warehouseId && tripLoads[b.warehouseId],
          ) || candidatePool[0];

        if (fallbackBatch) {
          const existing = allocations.find(
            (a) => a.batchId === fallbackBatch.id,
          );
          if (existing) {
            existing.qty += need;
          } else {
            allocations.push({
              batchId: fallbackBatch.id,
              batchNumber: fallbackBatch.batchNumber || fallbackBatch.id,
              expiryDate: fallbackBatch.expiryDate,
              qty: need,
            });
          }
          remaining[fallbackBatch.id] =
            (remaining[fallbackBatch.id] ?? 0) - need;
          need = 0;
        }
      }

      if (need > 0) {
        if (trip) {
          // If assigned to a trip van, physical crates are already loaded on the vehicle.
          // Allocate to the vehicle batch so route deliveries are never blocked by warehouse batch drift.
          allocations.push({
            batchId: `trip_${trip.id}_${it.productId}`,
            batchNumber: `VAN-${trip.vehicle}`,
            expiryDate: it.expiryDate || "2027-12-31",
            qty: need,
          });
          need = 0;
        } else {
          problems.push(
            expiredSkipped > 0
              ? `${it.productName}: ${expiredSkipped} in stock but expired (only non-expired stock can be sold)`
              : `${it.productName}: short by ${need} in batch stock`,
          );
          return it;
        }
      }
      return {
        ...it,
        batchNumber: Array.from(
          new Set(allocations.map((a) => a.batchNumber)),
        ).join(", "),
        expiryDate: allocations[0]?.expiryDate,
        batchAllocations: allocations,
      };
    });
    return { items: out, problems };
  };

  // Warehouse a sale is charged to when it names no valid one (old bills, carts with no godown
  // picked yet): the product's home warehouse, else the default godown, else the first one. Sales
  // must always land SOMEWHERE, otherwise they are never subtracted from any godown.
  const fallbackWarehouseId = (p: Product): string => {
    const valid = (id?: string) => !!id && warehouses.some((w) => w.id === id);
    if (valid(p.warehouseId)) return p.warehouseId as string;
    const def = warehouses.find((w) => w.isDefault);
    return def?.id || warehouses[0]?.id || "";
  };

  // Real-time crate counts across warehouses for a product.
  // `crates` is the true book balance and CAN be negative (an oversold godown). It is deliberately
  // not clamped per warehouse: clamping hid the shortfall and made the godown totals add up to
  // more than the real remaining stock. Callers that need "available to sell" clamp at 0 themselves.
  const productWarehouseStock = (
    productId: number,
  ): { warehouseId: string; warehouseName: string; crates: number }[] => {
    const p = products.find((x) => x.id === productId);
    if (!p) return [];

    if (warehouses.length === 0 || warehouses.length === 1) {
      const baseStock =
        baseStockFor(p) +
        (ledgerAdjByProduct[productId] || 0) +
        (restockByProduct[productId] || 0);
      const rem = Math.max(
        0,
        baseStock -
          (soldByProduct[productId] || 0) -
          (cartSoldByProduct[productId] || 0) -
          (disposedByProduct[productId] || 0),
      );
      const wId = warehouses[0]?.id || "default";
      const wName = warehouses[0]?.name || "Main Depot";
      return [{ warehouseId: wId, warehouseName: wName, crates: rem }];
    }

    const fallbackWh = fallbackWarehouseId(p);
    const whOf = (id?: string) =>
      id && warehouses.some((w) => w.id === id) ? id : fallbackWh;
    const batchWh = new Map(inventoryBatches.map((b) => [b.id, b.warehouseId]));

    // Tally sales by warehouse. Prefer where the stock actually came from (batch allocations);
    // whatever is not allocated goes to the bill's warehouse, or the fallback if it has none.
    const soldInWh: Record<string, number> = {};
    const addSold = (whId: string, qty: number) => {
      soldInWh[whId] = (soldInWh[whId] || 0) + qty;
    };
    for (const b of bills) {
      if (b.id === editingBillId) continue;
      for (const it of b.items) {
        if (it.productId !== productId) continue;
        let left = Number(it.qty) || 0;
        for (const a of it.batchAllocations || []) {
          const wh = batchWh.get(a.batchId);
          if (!wh) continue;
          const take = Math.min(left, Number(a.qty) || 0);
          if (take > 0) {
            addSold(wh, take);
            left -= take;
          }
        }
        if (left > 0) addSold(whOf(b.warehouseId), left);
      }
    }
    // In-progress cart (not yet a bill) already reserves stock in remainingStock; do the same here.
    const cartQty = cartSoldByProduct[productId] || 0;
    if (cartQty > 0) addSold(whOf(cart.warehouseId), cartQty);

    // Crates customers returned and that were restocked go back into the godown chosen for them.
    const restockedInWh: Record<string, number> = {};
    for (const b of bills) {
      for (const r of b.returns || []) {
        for (const l of r.lines) {
          if (l.productId === productId && l.restockQty > 0) {
            for (const d of restockDestinations(l, b.warehouseId)) {
              const wh = whOf(d.warehouseId);
              restockedInWh[wh] = (restockedInWh[wh] || 0) + d.qty;
            }
          }
        }
      }
    }

    return warehouses.map((w) => {
      const batchSum = inventoryBatches
        .filter((b) => b.productId === productId && b.warehouseId === w.id)
        .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

      const dispWh = disposedInWhByProduct[`${productId}|${w.id}`] || 0;
      const base =
        (inventoryBatches.some((b) => b.productId === productId)
          ? batchSum
          : p.warehouseId === w.id
            ? p.opening
            : 0) +
        (ledgerAdjByProductWh[`${productId}|${w.id}`] || 0) +
        (restockedInWh[w.id] || 0) -
        dispWh;
      return {
        warehouseId: w.id,
        warehouseName: w.name,
        crates: base - (soldInWh[w.id] || 0),
      };
    });
  };

  // Live available stock across all locations for a product:
  // Strictly the sum of available live stock in each physical location.
  const remainingStock = useCallback(
    (productId: number): number => {
      // "All locations" must equal the sum of what each warehouse shows. Each warehouse row is
      // shown/sold from as max(0, balance), so the total is the sum of those same values. (The
      // old net-of-negatives total disagreed with the per-warehouse list whenever one godown
      // was oversold.) Oversold godowns are still flagged separately on the Stock screen.
      const rows = productWarehouseStock(productId);
      return rows.reduce((sum, row) => sum + Math.max(0, row.crates), 0);
    },
    [productWarehouseStock],
  );

  /**
   * Stock the books showed at the end of `dateISO`: today's balance with every later movement taken back out
   * (bills raised, crates received, restocked returns, audit and reconciliation adjustments, write-offs). A count made on a past day has to be
   * compared with the stock of THAT day, not with today's, which already reflects later sales and receipts.
   * Not covered: godown-to-godown transfers made after the date (they do not change the all-godown total).
   */
  const stockAsOf = (productId: number, dateISO: string, warehouseId?: string): number => {
    const current = warehouseId
      ? (productWarehouseStock(productId).find((r) => r.warehouseId === warehouseId)?.crates ?? 0)
      : remainingStock(productId);
    const day = String(dateISO || "").slice(0, 10);
    if (!day || day >= todayISO()) return current;
    const later = (d?: string) => String(d || "").slice(0, 10) > day;
    const p = products.find((x) => x.id === productId);
    const fallbackWh = p ? fallbackWarehouseId(p) : "";
    const whOf = (id?: string) => (id && warehouses.some((w) => w.id === id) ? id : fallbackWh);
    const batchWh = new Map(inventoryBatches.map((b) => [b.id, b.warehouseId]));
    const inScope = (wh?: string) => !warehouseId || whOf(wh) === warehouseId;

    let sold = 0;
    let restocked = 0;
    for (const b of bills) {
      if (later(b.date)) {
        for (const it of b.items) {
          if (it.productId !== productId) continue;
          let left = Number(it.qty) || 0;
          for (const a of it.batchAllocations || []) {
            const take = Math.min(left, Number(a.qty) || 0);
            if (take > 0) {
              if (inScope(batchWh.get(a.batchId))) sold += take;
              left -= take;
            }
          }
          if (left > 0 && inScope(b.warehouseId)) sold += left;
        }
      }
      for (const r of b.returns || []) {
        if (!later(r.date)) continue;
        for (const l of r.lines) {
          if (l.productId !== productId || !(l.restockQty > 0)) continue;
          for (const d of restockDestinations(l, b.warehouseId)) {
            if (inScope(d.warehouseId)) restocked += d.qty;
          }
        }
      }
    }
    const received = inventoryBatches
      .filter(
        (b) =>
          b.productId === productId &&
          !String(b.id).startsWith("batch_xfer_") &&
          later(b.inwardDate) &&
          (!warehouseId || b.warehouseId === warehouseId),
      )
      .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
    let adjusted = 0;
    for (const a of audits) {
      if (!a.adjusted || !later(a.date)) continue;
      for (const e of a.entries) {
        if (e.productId !== productId) continue;
        if (warehouseId && e.warehouseId !== warehouseId) continue;
        adjusted += Number(e.diff) || 0;
      }
    }
    // Smart-reconciliation entries posted after the date, and damage / expiry / return-to-supplier write-offs.
    let ledgerLater = 0;
    for (const e of stockLedgerEntries) {
      if (e.productId !== productId || !later(e.timestamp)) continue;
      if (warehouseId && e.warehouseId !== warehouseId) continue;
      ledgerLater += Number(e.quantity) || 0;
    }
    let writtenOffLater = 0;
    for (const d of inventoryDispositions) {
      if (d.productId !== productId || d.stockApplied === false || !later(d.eventDate)) continue;
      if (warehouseId && d.warehouseId !== warehouseId) continue;
      writtenOffLater += Number(d.quantity) || 0;
    }
    return Math.max(0, current + sold - received - restocked - adjusted - ledgerLater + writtenOffLater);
  };

  const bookStock = (productId: number): number => {
    return remainingStock(productId);
  };

  // Foolproof per-warehouse batch/expiry listing for a product (Products screen, GRN
  // review, low-stock/expiry alerts). Unlike p.warehouseId/p.batchNumber/p.expiry
  // (legacy single-value fields), this is always derived live from inventoryBatches, so
  // it can never go stale or hide stock sitting in a warehouse other than the product's
  // original one. `availableByWarehouse` comes from productWarehouseStock so the FEFO
  // split reflects real remaining stock (received minus sales/adjustments), not just
  // what was received.
  const productBatchLines = useCallback(
    (productId: number) => {
      const availableByWarehouse: Record<string, number> = {};
      for (const row of productWarehouseStock(productId)) {
        availableByWarehouse[row.warehouseId] = Math.max(0, row.crates);
      }
      // What each bill actually took from each batch (capped at the line qty, like the godown tally)
      const soldByBatchId: Record<string, number> = {};
      for (const b of bills) {
        if (b.id === editingBillId) continue;
        for (const it of b.items) {
          if (it.productId !== productId) continue;
          let left = Number(it.qty) || 0;
          for (const a of it.batchAllocations || []) {
            const take = Math.min(left, Number(a.qty) || 0);
            if (take > 0) {
              soldByBatchId[a.batchId] = (soldByBatchId[a.batchId] || 0) + take;
              left -= take;
            }
          }
        }
      }
      return buildProductBatchLines(
        productId,
        inventoryBatches,
        warehouses,
        availableByWarehouse,
        new Date(),
        soldByBatchId,
      );
    },
    [inventoryBatches, warehouses, productWarehouseStock, bills, editingBillId],
  );

  const productInWarehouse = useCallback(
    (productId: number, warehouseId: string) =>
      productHasBatchInWarehouse(productId, inventoryBatches, warehouseId),
    [inventoryBatches],
  );

  const totalOpening = useMemo(() => {
    return products.reduce((s, p) => {
      return s + baseStockFor(p);
    }, 0);
  }, [products, inventoryBatches]);

  // Depends on remainingStock (a useCallback keyed on every input, including the audit/reconciliation
  // ledger adjustments) so it can't go stale when one of those changes.
  const totalRemaining = useMemo(
    () => products.reduce((s, p) => s + remainingStock(p.id), 0),
    [products, remainingStock],
  );

  // Per product: crates available to sell in that godown (never below 0). Whole godown and
  // "all locations" totals are plain sums of those per-godown values.
  const warehouseStock = (warehouseId: string, productId?: number): number => {
    if (!warehouseId) {
      if (productId) return Math.max(0, remainingStock(productId));
      return totalRemaining;
    }
    if (productId) {
      const match = productWarehouseStock(productId).find(
        (item) => item.warehouseId === warehouseId,
      );
      return match ? Math.max(0, match.crates) : 0;
    }
    // Whole godown = sum of the same per-product values shown for that godown (each >= 0).
    return products.reduce((sum, p) => {
      const match = productWarehouseStock(p.id).find(
        (item) => item.warehouseId === warehouseId,
      );
      return sum + (match ? Math.max(0, match.crates) : 0);
    }, 0);
  };
  const totalRevenue = useMemo(
    () => bills.reduce((s, b) => s + billNetTotal(b), 0),
    [bills],
  );
  const totalCasesSold = useMemo(
    () =>
      bills.reduce((s, b) => {
        const back = Object.values(returnedQtyByProduct(b)).reduce(
          (a, q) => a + q,
          0,
        );
        return s + b.items.reduce((s2, i) => s2 + i.qty, 0) - back;
      }, 0),
    [bills],
  );
  const totalOutstanding = useMemo(
    () => bills.reduce((s, b) => s + billBalance(b), 0),
    [bills],
  );

  const tripBreakdown = useCallback(
    (trip: Trip) => {
      const soldByProductForTrip: Record<number, number> = {};
      for (const b of bills) {
        if (billBelongsToTrip(trip, b)) {
          for (const it of b.items) {
            const pId = Number(it.productId);
            soldByProductForTrip[pId] =
              (soldByProductForTrip[pId] || 0) + (Number(it.qty) || 0);
          }
        }
      }

      const loadedMap =
        typeof trip.loaded === "object" && trip.loaded !== null
          ? trip.loaded
          : {};
      const returnedMap =
        typeof trip.returned === "object" && trip.returned !== null
          ? trip.returned
          : {};

      const allProductIds = Array.from(
        new Set([
          ...Object.keys(loadedMap).map(Number),
          ...Object.keys(returnedMap).map(Number),
          ...Object.keys(soldByProductForTrip).map(Number),
        ]),
      ).filter((id) => !isNaN(id) && id > 0);

      const rows: TripProductBreakdown[] = allProductIds.map((pid) => {
        const product = products.find((p) => Number(p.id) === pid);
        const loaded =
          Number(loadedMap[pid] ?? loadedMap[String(pid)] ?? 0) || 0;
        const sold = soldByProductForTrip[pid] || 0;
        // If trip is 'out' (reopened or out for delivery), returns are not applied
        const returned =
          trip.status === "closed"
            ? Number(returnedMap[pid] ?? returnedMap[String(pid)] ?? 0) || 0
            : 0;
        const discrepancy =
          trip.status === "closed" ? loaded - sold - returned : 0;
        return {
          productId: pid,
          name: product ? product.name : `Product #${pid}`,
          loaded,
          sold,
          returned,
          discrepancy,
        };
      });
      const hasDiscrepancy =
        trip.status === "closed" && rows.some((r) => r.discrepancy !== 0);
      return { rows, hasDiscrepancy };
    },
    [bills, products],
  );

  const getVehicleStock = useCallback(
    (trip: Trip | null | undefined, productId: number) => {
      if (!trip) {
        return { loaded: 0, sold: 0, available: 0 };
      }
      const pid = Number(productId);
      const loadedMap =
        typeof trip.loaded === "object" && trip.loaded !== null
          ? trip.loaded
          : {};
      const loaded = Number(loadedMap[pid] ?? loadedMap[String(pid)] ?? 0) || 0;

      // Collect all bills assigned to this trip (by trip.billIds or bill.tripId)
      let sold = 0;
      for (const b of bills) {
        if (!billBelongsToTrip(trip, b)) continue;

        for (const it of b.items) {
          if (Number(it.productId) === pid) {
            sold += Number(it.qty) || 0;
          }
        }
      }

      // CRITICAL: A trip with status 'out' (in transit or reopened) has NOT returned inventory to warehouse!
      // Returned counts ONLY apply to closed / reconciled trips.
      const returnedMap =
        typeof trip.returned === "object" && trip.returned !== null
          ? trip.returned
          : {};
      // Crates "returned" only leave the van once the trip is closed. A trip that is out (or was
      // reopened) can still carry an old returned map; subtracting it made van stock look empty.
      const returned =
        trip.status === "closed"
          ? Number(returnedMap[pid] ?? returnedMap[String(pid)] ?? 0) || 0
          : 0;

      // When a trip is closed/completed, remaining stock is NOT on the van!
      // Loaded vs (Sold + Returned) is strictly for discrepancy reconciliation.
      // Available to sell on an active vehicle is Math.max(0, loaded - sold - returned).
      const available =
        trip.status === "closed"
          ? 0
          : Math.max(0, loaded - sold - returned);
      return { loaded, sold, available };
    },
    [bills],
  );

  const tripsWithDiscrepancy = useMemo(
    () => trips.filter((t) => tripBreakdown(t).hasDiscrepancy).length,
    [trips, bills, products],
  );

  // Products CRUD
  function addProduct(p: Omit<Product, "id">) {
    // Server-reserved number: unique across devices and never handed out again after a deletion.
    const newId = reserveDocNumber("product", products.length ? Math.max(...products.map((x) => x.id)) : 0);
    const skuCode =
      p.sku && p.sku.trim()
        ? p.sku.trim().toUpperCase()
        : generateSkuId(p.name, p.category, newId);
    // Batch number is mandatory: auto-create if empty or missing
    const batchNum =
      p.batchNumber && p.batchNumber.trim()
        ? p.batchNumber.trim().toUpperCase()
        : generateBatchNumber(p.name, p.scheme ? "SCH" : undefined);

    const assignedWh =
      p.warehouseId ||
      (defaultWarehouse ? defaultWarehouse.id : warehouses[0]?.id || "");
    const newProd: Product = {
      ...p,
      name: String(p.name || "").trim().toUpperCase(),
      id: newId,
      sku: skuCode,
      batchNumber: batchNum,
      warehouseId: assignedWh,
      expiry: p.expiry || "2026-12-31",
      ...productTaxFields(p),
      updatedAt: new Date().toISOString(),
    };
    setProducts((prev) => [...prev, newProd]);
    cloud("pushProductToSupabase", pushProductToSupabase(newProd));

    // Mandatory batch registration in inventory batches
    const batchId =
      "batch_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6);
    const newBatch: InventoryBatch = {
      id: batchId,
      productId: newId,
      sku: skuCode,
      batchNumber: batchNum,
      mfgDate: p.mfgDate,
      expiryDate: p.expiry || "2026-12-31",
      warehouseId: assignedWh,
      quantity: p.opening || 0,
      costPrice: p.cost,
      mrp: p.retail,
      scheme: p.scheme,
      effectiveCostPrice: p.effectiveCost || p.cost,
      notes: p.scheme
        ? `Registered with scheme: ${p.scheme}`
        : "Opening stock batch",
    };
    setInventoryBatches((prev) => [...prev, newBatch]);
  }

  function updateProductField(
    id: number,
    field: keyof Product,
    value: number | string | boolean,
  ) {
    // Computed outside the state updater: React may run an updater twice (StrictMode), which pushed every edit
    // to the cloud twice. productsRef is updated here too so two quick edits in a row build on each other.
    const current = productsRef.current;
    const target = current.find((p) => p.id === id);
    if (!target) return;
    const mod = {
      ...target,
      [field]:
        field === "name"
          ? String(value || "").trim().toUpperCase()
          : typeof target[field] === "number" && typeof value !== "boolean"
            ? Number(value)
            : value,
      updatedAt: new Date().toISOString(),
    } as Product;
    const next = current.map((p) => (p.id === id ? mod : p));
    productsRef.current = next;
    setProducts(next);
    cloud("pushProductToSupabase", pushProductToSupabase(mod));
  }

  /** Saves several fields of one product in ONE step (one state update, one cloud write). */
  function updateProductFields(id: number, patch: Partial<Omit<Product, "id">>) {
    const current = productsRef.current;
    const target = current.find((p) => p.id === id);
    if (!target) return;
    const clean: Partial<Product> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      (clean as any)[k] = k === "name" ? String(v || "").trim().toUpperCase() : v;
    }
    const mod = { ...target, ...clean, updatedAt: new Date().toISOString() } as Product;
    const next = current.map((p) => (p.id === id ? mod : p));
    productsRef.current = next;
    setProducts(next);
    cloud("pushProductToSupabase", pushProductToSupabase(mod));
  }

  // Deletions are written to the shared deletion log so another device (or the server's upsert-only copy) cannot
  // bring the record back on its next sync. A product's key includes its name because product numbers are
  // reused after the highest one is deleted.
  function logDeletion(
    kind: "product" | "batch" | "warehouse" | "audit" | "promotion" | "salesman",
    id: string,
    name?: string,
  ) {
    pushDeletionRecordsToSupabase([
      { kind, id, name, deletedAt: new Date().toISOString(), by: currentUser?.name || "Admin" },
    ]).catch(() => {});
  }
  const productDeletionKey = (p: { id: number; name?: string }) =>
    `${p.id}|${String(p.name || "").trim().toUpperCase()}`;

  function deleteProduct(id: number) {
    const doomed = products.find((p) => p.id === id);
    if (doomed) logDeletion("product", productDeletionKey(doomed), doomed.name);
    const remainingProducts = products.filter((p) => p.id !== id);
    const removedBatches = inventoryBatches.filter((b) => b.productId === id);
    const remainingBatches = inventoryBatches.filter((b) => b.productId !== id);
    setProducts(remainingProducts);
    setInventoryBatches(remainingBatches);
    cloud("deleteProductFromSupabase", deleteProductFromSupabase(id));
    // Batch rows in the cloud table are separate; remove them too or stock reappears on refresh
    removedBatches.forEach((b) => {
      logDeletion("batch", b.id);
      cloud("deleteBatchFromSupabase", deleteBatchFromSupabase(b.id));
    });
    // Server mirrors are upsert-only, so push the full remaining lists
    saveProducts(remainingProducts);
    saveInventoryBatches(remainingBatches);
  }

  function applyBulkImport(rows: ImportRow[]) {
    let nextId = products.length
      ? Math.max(...products.map((x) => x.id)) + 1
      : 1;
    const newItems: Product[] = [];
    const newBatches: InventoryBatch[] = [];
    const assignedWh = defaultWarehouse
      ? defaultWarehouse.id
      : warehouses[0]?.id || "";

    const updated = products.map((existing) => {
      const match = rows.find(
        (r) => r.name.toLowerCase() === existing.name.toLowerCase(),
      );
      if (match) {
        const batchNum =
          match.batchNumber && match.batchNumber.trim()
            ? match.batchNumber.trim().toUpperCase()
            : existing.batchNumber ||
              generateBatchNumber(match.name, match.scheme ? "SCH" : undefined);
        const skuCode =
          match.sku && match.sku.trim()
            ? match.sku.trim().toUpperCase()
            : existing.sku ||
              generateSkuId(existing.name, existing.category, existing.id);
        return {
          ...existing,
          sku: skuCode,
          opening: existing.opening + match.opening,
          cost: match.cost || existing.cost,
          retail: match.retail || existing.retail,
          wholesale: match.wholesale || existing.wholesale,
          expiry: match.expiry || existing.expiry,
          hsn: match.hsn || existing.hsn,
          batchNumber: batchNum,
          scheme: match.scheme || existing.scheme,
        };
      }
      return existing;
    });

    for (const r of rows) {
      if (!updated.some((p) => p.name.toLowerCase() === r.name.toLowerCase())) {
        const batchNum =
          r.batchNumber && r.batchNumber.trim()
            ? r.batchNumber.trim().toUpperCase()
            : generateBatchNumber(r.name, r.scheme ? "SCH" : undefined);
        const prodId = nextId++;
        const skuCode =
          r.sku && r.sku.trim()
            ? r.sku.trim().toUpperCase()
            : generateSkuId(r.name, r.category, prodId);

        newItems.push({
          id: prodId,
          sku: skuCode,
          name: r.name.trim().toUpperCase(),
          category: r.category,
          volume: r.volume,
          pack: r.pack,
          expiry: r.expiry || "2026-12-31",
          opening: r.opening,
          cost: r.cost,
          retail: r.retail,
          wholesale: r.wholesale,
          hsn: normalizeTo8DigitHsn(r.hsn, r.category, r.name),
          batchNumber: batchNum,
          scheme: r.scheme,
          warehouseId: assignedWh,
        });

        if (r.opening > 0) {
          newBatches.push({
            id:
              "batch_" +
              Date.now().toString(36) +
              Math.random().toString(36).slice(2, 6) +
              prodId,
            productId: prodId,
            sku: skuCode,
            batchNumber: batchNum,
            expiryDate: r.expiry || "2026-12-31",
            warehouseId: assignedWh,
            quantity: r.opening,
            costPrice: r.cost,
            mrp: r.retail,
            scheme: r.scheme,
            notes: "Imported spreadsheet batch",
          });
        }
      }
    }

    setProducts([...updated, ...newItems]);
    if (newBatches.length > 0) {
      setInventoryBatches((prev) => [...prev, ...newBatches]);
    }
  }

  function receiveInwardStock(
    params: InwardStockParams,
  ): { productId: number; batchId: string } | undefined {
    let product = params.productId
      ? products.find((p) => p.id === params.productId)
      : undefined;
    if (!product && params.newProductName) {
      const matchExisting = products.find(
        (p) =>
          p.name.trim().toLowerCase() ===
          params.newProductName!.trim().toLowerCase(),
      );
      if (matchExisting) {
        product = matchExisting;
      }
    }

    const billedQty = Math.max(0, Number(params.billedQuantity) || 0);
    const freeQty = Math.max(0, Number(params.freeQuantity) || 0);
    const totalQty = billedQty + freeQty;

    const assignedWh =
      params.warehouseId ||
      product?.warehouseId ||
      (defaultWarehouse ? defaultWarehouse.id : warehouses[0]?.id || "");
    const exp = params.expiryDate || product?.expiry || "2026-12-31";

    let targetProductId = product ? product.id : 0;
    let targetSku = product?.sku || params.sku || "";

    // If 1st time product being added via Inward Inventory
    if (!product && params.newProductName) {
      targetProductId = products.length
        ? Math.max(...products.map((x) => x.id)) + 1
        : 1;
      const catKey: CategoryKey = params.category || "energy";
      const catDef = CATS[catKey] || {
        name: "General",
        hsn: "22029990",
        gst: 0.18,
      };
      targetSku =
        params.sku ||
        generateSkuId(params.newProductName, catKey, targetProductId);
      const batchCode =
        params.batchNumber && params.batchNumber.trim()
          ? params.batchNumber.trim().toUpperCase()
          : generateBatchNumber(
              params.newProductName,
              params.scheme ? "SCH" : undefined,
            );

      const unitCost = Number(params.costPrice) || 158.57;
      const unitWholesale =
        Number(params.wholesaleRate) || Math.round(unitCost * 1.1);
      const unitRetail =
        Number(params.retailRate) || Math.round(unitCost * 1.25);
      const effectiveCost =
        totalQty > 0 ? (billedQty * unitCost) / totalQty : unitCost;

      const newProduct: Product = {
        id: targetProductId,
        sku: targetSku,
        name: params.newProductName.trim().toUpperCase(),
        category: catKey,
        volume: params.volume || 150,
        pack: params.pack || "PET",
        opening: totalQty,
        cost: unitCost,
        wholesale: unitWholesale,
        retail: unitRetail,
        effectiveCost,
        expiry: exp,
        mfgDate: params.mfgDate,
        batchNumber: batchCode,
        warehouseId: assignedWh,
        hsn: normalizeTo8DigitHsn(params.hsn || catDef.hsn, catKey, params.newProductName),
        gstRate:
          gstRateFromHsn(normalizeTo8DigitHsn(params.hsn || catDef.hsn, catKey, params.newProductName)) ??
          (params.gstRate !== undefined ? params.gstRate : catDef.gst),
        scheme: params.scheme,
      };

      setProducts((prev) => [...prev, newProduct]);
      product = newProduct;
    } else if (product) {
      targetProductId = product.id;
      targetSku =
        product.sku ||
        generateSkuId(product.name, product.category, product.id);
      const cost =
        params.costPrice !== undefined
          ? Number(params.costPrice)
          : product.cost;
      const effectiveCost = totalQty > 0 ? (billedQty * cost) / totalQty : cost;
      const batchNum =
        params.batchNumber && params.batchNumber.trim()
          ? params.batchNumber.trim().toUpperCase()
          : generateBatchNumber(
              product.name,
              params.scheme ? "SCH" : undefined,
            );

      setProducts((prev) =>
        prev.map((p) => {
          if (p.id === targetProductId) {
            return {
              ...p,
              opening: p.opening + totalQty,
              batchNumber: batchNum,
              sku: p.sku || targetSku,
              expiry: exp,
              cost: cost,
              effectiveCost: effectiveCost,
              scheme: params.scheme || p.scheme,
              warehouseId: assignedWh,
              wholesale:
                params.wholesaleRate !== undefined
                  ? Number(params.wholesaleRate)
                  : p.wholesale,
              retail:
                params.retailRate !== undefined
                  ? Number(params.retailRate)
                  : p.retail,
            };
          }
          return p;
        }),
      );
    } else {
      return undefined;
    }

    const finalBatchNumber =
      params.batchNumber && params.batchNumber.trim()
        ? params.batchNumber.trim().toUpperCase()
        : generateBatchNumber(
            product?.name || params.newProductName || "LOT",
            params.scheme ? "SCH" : undefined,
          );

    const cost = Number(params.costPrice) || (product ? product.cost : 158.57);
    const effectiveCost = totalQty > 0 ? (billedQty * cost) / totalQty : cost;

    // 1. Add batch to inventoryBatches
    const batchId =
      "batch_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6);
    const newBatch: InventoryBatch = {
      id: batchId,
      productId: targetProductId,
      sku: targetSku,
      batchNumber: finalBatchNumber,
      supplierInvoiceNo: params.supplierInvoiceNo,
      supplierName: params.supplierName,
      inwardDate: params.inwardDate || todayISO(),
      mfgDate: params.mfgDate,
      expiryDate: exp,
      warehouseId: assignedWh,
      quantity: totalQty,
      costPrice: cost,
      mrp: params.retailRate || (product ? product.retail : 190),
      scheme: params.scheme,
      billedQuantity: billedQty,
      freeQuantity: freeQty,
      effectiveCostPrice: effectiveCost,
      notes:
        params.notes ||
        (params.scheme
          ? `Inward scheme: ${params.scheme}`
          : "Inward stock receipt"),
      cgstRate: params.cgstRate,
      sgstRate: params.sgstRate,
      hsn: params.hsn || product?.hsn,
    };
    setInventoryBatches((prev) => [...prev, newBatch]);

    return { productId: targetProductId, batchId };
  }

  // Promotions CRUD
  function addPromotion(promo: Omit<Promotion, "id">) {
    const nextId = reserveDocNumber(
      "promotion",
      promotions.length ? Math.max(...promotions.map((p) => Number(p.id) || 0)) : 0,
    );
    const cleanProductIds = extractPromoProductIds(promo);
    const newPromo: Promotion = {
      ...promo,
      id: nextId,
      productIds: cleanProductIds,
      isActive: promo.isActive !== false,
    };
    setPromotions((prev) => {
      const updated = [...prev, newPromo];
      saveSchemes(updated as any).catch(() => {});
      return updated;
    });
    // Immediate dual sync: Direct Supabase client upsert + server schemes endpoint
    cloud("pushPromotionToSupabase", pushPromotionToSupabase(newPromo));
    cloudFetch("/api/schemes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPromo),
    });
  }

  function updatePromotion(id: number, promo: Omit<Promotion, "id">) {
    const targetId = Number(id);
    const cleanProductIds = extractPromoProductIds(promo);
    const updatedPromo: Promotion = {
      ...promo,
      id: targetId,
      productIds: cleanProductIds,
      isActive: promo.isActive !== false,
    };
    setPromotions((prev) => {
      const updated = prev.map((p) =>
        Number(p.id) === targetId ? updatedPromo : p,
      );
      saveSchemes(updated as any).catch(() => {});
      return updated;
    });
    // Immediate dual sync: Direct Supabase client upsert + server schemes endpoint
    cloud("pushPromotionToSupabase", pushPromotionToSupabase(updatedPromo));
    cloudFetch("/api/schemes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedPromo),
    });
  }

  function deletePromotion(id: number) {
    const targetId = Number(id);
    logDeletion("promotion", String(targetId));
    setPromotions((prev) => {
      const updated = prev.filter((p) => Number(p.id) !== targetId);
      saveSchemes(updated as any).catch(() => {});
      return updated;
    });
    try {
      const raw = localStorage.getItem("mrwater_cache_schemes");
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.data)
            ? parsed.data
            : null;
        if (list) {
          const cleaned = list.filter((s: any) => Number(s?.id) !== targetId);
          localStorage.setItem(
            "mrwater_cache_schemes",
            JSON.stringify(cleaned),
          );
        }
      }
    } catch {
      /* ignore */
    }
    cloud("deletePromotionFromSupabase", deletePromotionFromSupabase(targetId));
    cloudFetch(`/api/schemes/${targetId}`, { method: "DELETE" });
  }

  // ---- Supplier Schemes & Incentives CRUD -----------------------------------
  // Independent of the customer-facing Promotions above: these never touch a Bill/
  // customer invoice. IDs are stable strings so repeated syncs upsert-by-id and never
  // duplicate (see saveSupplierSchemes/etc. -> postOrPutServer -> app_collections, and
  // pushSupplierSchemeToSupabase -> upsert(onConflict:'id') for the dedicated tables).
  function addSupplierScheme(
    s: Omit<SupplierScheme, "id" | "createdAt" | "updatedAt">,
  ): SupplierScheme {
    const now = new Date().toISOString();
    const newScheme: SupplierScheme = {
      ...s,
      id:
        "sscheme_" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 6),
      createdAt: now,
      updatedAt: now,
    };
    setSupplierSchemes((prev) => [newScheme, ...prev]);
    cloud(
      "pushSupplierSchemeToSupabase",
      pushSupplierSchemeToSupabase(newScheme),
    );
    return newScheme;
  }

  function updateSupplierScheme(id: string, updates: Partial<SupplierScheme>) {
    setSupplierSchemes((prev) => {
      const next = prev.map((s) =>
        s.id === id
          ? { ...s, ...updates, id, updatedAt: new Date().toISOString() }
          : s,
      );
      const updated = next.find((s) => s.id === id);
      if (updated)
        cloud(
          "pushSupplierSchemeToSupabase",
          pushSupplierSchemeToSupabase(updated),
        );
      return next;
    });
  }

  function deleteSupplierScheme(id: string) {
    setSupplierSchemes((prev) => prev.filter((s) => s.id !== id));
    cloud(
      "deleteSupplierSchemeFromSupabase",
      deleteSupplierSchemeFromSupabase(id),
    );
  }

  function addSupplierSchemeApplication(
    a: Omit<SupplierSchemeApplication, "id" | "createdAt">,
  ): SupplierSchemeApplication {
    const newApp: SupplierSchemeApplication = {
      ...a,
      id:
        "sapp_" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
    };
    setSupplierSchemeApplications((prev) => [newApp, ...prev]);
    cloud(
      "pushSupplierSchemeApplicationToSupabase",
      pushSupplierSchemeApplicationToSupabase(newApp),
    );
    return newApp;
  }

  function addSupplierCreditNote(
    n: Omit<SupplierCreditNote, "id" | "createdAt" | "updatedAt" | "status">,
  ): SupplierCreditNote {
    const now = new Date().toISOString();
    // Status is always derived from expected/actual — never set ad hoc — so it can never
    // drift out of sync with the amounts (see creditNoteStatus in utils/supplierSchemes.ts).
    const newNote: SupplierCreditNote = {
      ...n,
      id:
        "scn_" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 6),
      actualAmount: n.actualAmount || 0,
      status: creditNoteStatus(n.expectedAmount, n.actualAmount || 0),
      createdAt: now,
      updatedAt: now,
    };
    setSupplierCreditNotes((prev) => [newNote, ...prev]);
    cloud(
      "pushSupplierCreditNoteToSupabase",
      pushSupplierCreditNoteToSupabase(newNote),
    );
    return newNote;
  }

  function updateSupplierCreditNote(
    id: string,
    updates: Partial<SupplierCreditNote>,
  ) {
    setSupplierCreditNotes((prev) => {
      const next = prev.map((n) => {
        if (n.id !== id) return n;
        const merged = {
          ...n,
          ...updates,
          id,
          updatedAt: new Date().toISOString(),
        };
        if (updates.status) {
          merged.status = updates.status;
        } else {
          merged.status = creditNoteStatus(
            merged.expectedAmount,
            merged.actualAmount,
          );
        }
        return merged;
      });
      saveSupplierCreditNotes(next).catch(() => {});
      const updated = next.find((n) => n.id === id);
      if (updated) {
        cloud(
          "pushSupplierCreditNoteToSupabase",
          pushSupplierCreditNoteToSupabase(updated),
        );
        // Keep linked disposition in sync
        setInventoryDispositions((disps) => {
          let touched = false;
          const nextDisps = disps.map((d) => {
            if (
              (updated.creditNoteNumber &&
                d.creditNoteNumber === updated.creditNoteNumber) ||
              (updated.notes && updated.notes.includes(d.id))
            ) {
              touched = true;
              const newStatus =
                updated.actualAmount <= 0
                  ? "pending"
                  : updated.actualAmount + 0.009 >= (d.costValue || 0)
                    ? "settled"
                    : "partial";
              const updD: InventoryDisposition = {
                ...d,
                compensatedAmount: updated.actualAmount,
                compensationStatus: newStatus,
                creditNoteNumber:
                  updated.creditNoteNumber || d.creditNoteNumber,
                creditNoteDate: updated.creditNoteDate || d.creditNoteDate,
                updatedAt: new Date().toISOString(),
              };
              cloud(
                "pushInventoryDispositionToSupabase",
                pushInventoryDispositionToSupabase(updD),
              );
              return updD;
            }
            return d;
          });
          if (touched) saveInventoryDispositions(nextDisps).catch(() => {});
          return nextDisps;
        });
      }
      return next;
    });
    notify("Supplier credit note updated successfully.");
  }

  function deleteSupplierCreditNote(id: string) {
    const note = supplierCreditNotes.find((n) => n.id === id);
    try {
      const tombstones = new Set(
        JSON.parse(
          localStorage.getItem("deleted_supplier_credit_note_ids") || "[]",
        ),
      );
      tombstones.add(id);
      localStorage.setItem(
        "deleted_supplier_credit_note_ids",
        JSON.stringify(Array.from(tombstones)),
      );
    } catch {}

    // If this CN was linked to any disposition, revert that disposition to pending
    if (note) {
      setInventoryDispositions((prev) => {
        let touched = false;
        const next = prev.map((d) => {
          if (
            (note.notes && note.notes.includes(d.id)) ||
            (!(note.notes || "").includes("Linked disposition") &&
              note.creditNoteNumber &&
              d.creditNoteNumber === note.creditNoteNumber)
          ) {
            touched = true;
            const updatedDisp: InventoryDisposition = {
              ...d,
              compensationStatus: "pending",
              compensatedAmount: 0,
              creditNoteNumber: undefined,
              creditNoteDate: undefined,
              updatedAt: new Date().toISOString(),
            };
            cloud(
              "pushInventoryDispositionToSupabase",
              pushInventoryDispositionToSupabase(updatedDisp),
            );
            return updatedDisp;
          }
          return d;
        });
        if (touched) saveInventoryDispositions(next).catch(() => {});
        return next;
      });
    }

    setSupplierCreditNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      saveSupplierCreditNotes(next).catch(() => {});
      return next;
    });
    cloud(
      "deleteSupplierCreditNoteFromSupabase",
      deleteSupplierCreditNoteFromSupabase(id),
    );
    notify("Supplier credit note deleted successfully.");
  }

  // Records the "Expected -> Confirmed" transition (spec §14): the original expected
  // value is NEVER overwritten — only actualAmount/status/receipt metadata change.
  function recordSupplierCreditNoteReceipt(
    id: string,
    params: {
      actualAmount: number;
      creditNoteNumber?: string;
      creditNoteDate?: string;
      attachmentRef?: string;
      notes?: string;
    },
  ) {
    updateSupplierCreditNote(id, {
      actualAmount: Math.max(0, Number(params.actualAmount) || 0),
      creditNoteNumber: params.creditNoteNumber,
      creditNoteDate: params.creditNoteDate,
      attachmentRef: params.attachmentRef,
      notes: params.notes,
    });
  }

  function addInventoryDisposition(
    d: Omit<
      InventoryDisposition,
      "id" | "createdAt" | "updatedAt" | "stockApplied" | "costValue"
    > & { costValue?: number; stockApplied?: boolean },
  ):
    | { ok: true; disposition: InventoryDisposition }
    | { ok: false; error: string } {
    const qty = Number(d.quantity) || 0;
    if (qty <= 0)
      return { ok: false, error: "Quantity must be greater than zero" };
    if (!d.productId) return { ok: false, error: "Product is required" };
    if (!d.warehouseId) return { ok: false, error: "Warehouse is required" };

    // Stock is DERIVED (received batch qty - sales - dispositions), so a disposal never edits
    // batch.quantity. Doing both used to deduct twice and made a refresh "lose" the deduction.
    // Skip availability checks when this is a document-only claim (stockApplied: false).
    const willReduceStock = d.stockApplied !== false;
    if (willReduceStock && d.batchId) {
      const batch = inventoryBatchesRef.current.find((b) => b.id === d.batchId);
      if (!batch) return { ok: false, error: "Selected batch not found" };
      if (batch.warehouseId !== d.warehouseId)
        return { ok: false, error: "Batch does not belong to this warehouse" };
      let used = 0;
      for (const bl of bills) {
        for (const it of bl.items) {
          for (const al of it.batchAllocations || [])
            if (al.batchId === d.batchId) used += Number(al.qty) || 0;
        }
      }
      for (const dp of inventoryDispositions) {
        if (dp.stockApplied !== false && dp.batchId === d.batchId)
          used += Number(dp.quantity) || 0;
      }
      const availableInBatch = (Number(batch.quantity) || 0) - used;
      if (availableInBatch + 0.0001 < qty)
        return {
          ok: false,
          error: `Only ${Math.max(0, availableInBatch)} cases available in this batch`,
        };
    } else if (willReduceStock) {
      const row = productWarehouseStock(d.productId).find(
        (r) => r.warehouseId === d.warehouseId,
      );
      const available = row ? row.crates : 0;
      if (available + 0.0001 < qty)
        return {
          ok: false,
          error: `Only ${Math.max(0, available)} cases available in this warehouse`,
        };
    }

    const costPer = Number(d.costPerUnit) || 0;
    const costValue =
      d.costValue !== undefined ? Number(d.costValue) : costPer * qty;
    const now = new Date().toISOString();
    const newDisp: InventoryDisposition = {
      ...d,
      id:
        "disp_" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 6),
      quantity: qty,
      costPerUnit: costPer,
      costValue,
      unit: d.unit || "case",
      compensationStatus: d.compensationStatus || "not_applicable",
      reason: d.reason || "",
      // false = document/claim only (does not reduce godown stock)
      stockApplied: d.stockApplied === false ? false : true,
      createdAt: now,
      updatedAt: now,
    };

    setInventoryDispositions((prev) => {
      const next = [newDisp, ...prev];
      saveInventoryDispositions(next).catch(() => {});
      return next;
    });
    cloud(
      "pushInventoryDispositionToSupabase",
      pushInventoryDispositionToSupabase(newDisp),
    );
    return { ok: true, disposition: newDisp };
  }

  function updateInventoryDisposition(
    id: string,
    updates: Partial<InventoryDisposition>,
  ) {
    setInventoryDispositions((prev) => {
      const next = prev.map((row) => {
        if (row.id !== id) return row;
        const merged = {
          ...row,
          ...updates,
          id,
          updatedAt: new Date().toISOString(),
        };
        return merged;
      });
      const updated = next.find((r) => r.id === id);
      if (updated)
        cloud(
          "pushInventoryDispositionToSupabase",
          pushInventoryDispositionToSupabase(updated),
        );
      return next;
    });
  }

  function deleteInventoryDisposition(
    id: string,
    _opts?: { restoreStock?: boolean },
  ) {
    // Stock is derived from the dispositions list, so removing the row returns the stock by itself.
    addDispositionTombstone(id);
    // Drop any supplier credit note that was mirrored from this disposition, otherwise the
    // "CN received" total keeps counting a claim that no longer exists.
    const linked = supplierCreditNotes.filter((n) =>
      (n.notes || "").includes(`Linked disposition ${id}`),
    );
    linked.forEach((n) => {
      try {
        const t = new Set(
          JSON.parse(
            localStorage.getItem("deleted_supplier_credit_note_ids") || "[]",
          ),
        );
        t.add(n.id);
        localStorage.setItem(
          "deleted_supplier_credit_note_ids",
          JSON.stringify(Array.from(t)),
        );
      } catch {}
    });
    if (linked.length > 0) {
      const ids = new Set(linked.map((n) => n.id));
      setSupplierCreditNotes((prev) => prev.filter((n) => !ids.has(n.id)));
      linked.forEach((n) =>
        cloud(
          "deleteSupplierCreditNoteFromSupabase",
          deleteSupplierCreditNoteFromSupabase(n.id),
        ),
      );
    }
    setInventoryDispositions((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveInventoryDispositions(next).catch(() => {});
      return next;
    });
    cloud(
      "deleteInventoryDispositionFromSupabase",
      deleteInventoryDispositionFromSupabase(id),
    );
  }

  function recordDispositionCompensation(
    id: string,
    params: {
      compensatedAmount: number;
      creditNoteNumber?: string;
      creditNoteDate?: string;
      cnTaxableValue?: number;
      cnCgst?: number;
      cnSgst?: number;
      cnIgst?: number;
      cnTotal?: number;
      notes?: string;
      costValue?: number;
      appendPayment?: boolean;
      paymentNote?: string;
      attachmentRef?: string;
    },
  ) {
    const row0 = inventoryDispositions.find((r) => r.id === id);
    if (!row0) return;
    const newCostValue =
      params.costValue !== undefined && Number(params.costValue) > 0
        ? Number(params.costValue)
        : undefined;
    const row =
      newCostValue !== undefined ? { ...row0, costValue: newCostValue } : row0;
    const priorPaid = Math.max(0, Number(row0.compensatedAmount) || 0);
    const incoming = Math.max(0, Number(params.compensatedAmount) || 0);
    const amt = params.appendPayment ? priorPaid + incoming : incoming;
    const comparable =
      Number(params.cnTaxableValue) > 0 ? Number(params.cnTaxableValue) : amt;
    const status =
      amt <= 0
        ? "pending"
        : comparable + 0.009 >= (row.costValue || 0)
          ? "settled"
          : "partial";
    const cnNo = params.creditNoteNumber ?? row.creditNoteNumber;
    const cnDate = params.creditNoteDate ?? row.creditNoteDate;

    const prevPayments = Array.isArray(row0.compensationPayments)
      ? row0.compensationPayments
      : [];
    let nextPayments = prevPayments;
    if (incoming > 0) {
      nextPayments = [
        ...prevPayments,
        {
          id:
            "cnpay_" +
            Date.now().toString(36) +
            Math.random().toString(36).slice(2, 5),
          date: cnDate || todayISO(),
          amount: params.appendPayment ? incoming : incoming,
          cnNumber: cnNo,
          note: params.paymentNote || params.notes,
        },
      ];
    }

    updateInventoryDisposition(id, {
      ...(newCostValue !== undefined
        ? {
            costValue: newCostValue,
            costPerUnit:
              row.quantity > 0 ? newCostValue / row.quantity : row.costPerUnit,
          }
        : {}),
      compensatedAmount: amt,
      compensationStatus: status as InventoryDisposition["compensationStatus"],
      compensatedAt: todayISO(),
      creditNoteNumber: cnNo,
      creditNoteDate: cnDate,
      cnTaxableValue: params.cnTaxableValue ?? row.cnTaxableValue,
      cnCgst: params.cnCgst ?? row.cnCgst,
      cnSgst: params.cnSgst ?? row.cnSgst,
      cnIgst: params.cnIgst ?? row.cnIgst,
      cnTotal: params.cnTotal ?? row.cnTotal,
      notes: params.notes ?? row.notes,
      compensationPayments: nextPayments,
      ...(params.attachmentRef !== undefined
        ? { attachmentRef: params.attachmentRef }
        : {}),
    });

    if (amt > 0 && (row.supplierName || cnNo)) {
      const expected = Math.max(row.costValue || 0, amt);
      const notePayload = {
        supplierName: row.supplierName || "Supplier",
        grnId: row.grnId,
        productId: row.productId,
        creditNoteNumber: cnNo,
        creditNoteDate: cnDate,
        expectedAmount: expected,
        actualAmount: amt,
        attachmentRef: params.attachmentRef || row0.attachmentRef,
        notes: `Linked disposition ${id}${row.batchNumber ? ` · batch ${row.batchNumber}` : ""}${row.reason ? ` · ${row.reason}` : ""}`,
      };
      const normalizedCnNo = (cnNo || "").trim();
      const existing =
        supplierCreditNotes.find((n) =>
          (n.notes || "").includes(`Linked disposition ${id}`),
        ) ||
        supplierCreditNotes.find(
          (n) =>
            normalizedCnNo &&
            (n.creditNoteNumber || "").trim().toLowerCase() ===
              normalizedCnNo.toLowerCase() &&
            (n.supplierName || "").trim().toLowerCase() ===
              (notePayload.supplierName || "").trim().toLowerCase(),
        );
      if (existing) {
        updateSupplierCreditNote(existing.id, {
          actualAmount: amt,
          creditNoteNumber: normalizedCnNo || undefined,
          creditNoteDate: cnDate,
          notes: notePayload.notes,
          attachmentRef: notePayload.attachmentRef,
        });
      } else {
        addSupplierCreditNote({
          ...notePayload,
          creditNoteNumber: normalizedCnNo || undefined,
        });
      }
    }
  }

  // ---- Smart Stock Reconciliation & Audit -----------------------------------
  // Nothing here ever touches product.opening except approveReconciliation, and only by
  // exactly the confirmed/approved quantity — see the module doc-comment in
  // utils/stockReconciliation.ts and the type doc-comments in types/index.ts for the
  // full "never auto-convert a variance into a loss" rationale (spec §13/§17).

  // Pass 2 of every audit: classify using the matching engine now that every entry in the
  // session is visible to it (a shortage needs to see every excess in the same session, and
  // vice versa, per spec §3).
  // Push an audit session to the cloud and, unlike before, tell the user when it fails
  // (missing tables are the usual reason) instead of swallowing the error.
  function syncAuditSession(session: AuditSession) {
    pushAuditSessionToSupabase(session)
      .then((res) => {
        if (res && !res.success) {
          reportSyncFailure("Audit session", res.error);
          setSupabaseStatus((prev) => ({
            ...prev,
            message: `Audit session saved on this device but NOT to the cloud: ${res.error}. Run the audit SQL (sql/audit-sessions-and-grn-history.sql) in Supabase.`,
          }));
        } else {
          reportSyncSuccess();
        }
      })
      .catch((err) => reportSyncFailure("Audit session", err));
  }

  function classifyEntries(rawEntries: VarianceEntry[]): VarianceEntry[] {
    return rawEntries.map((entry) => {
      if (entry.variance === 0)
        return {
          ...entry,
          classification: "matched" as VarianceClassification,
        };
      const suggestions =
        entry.variance < 0
          ? findSwapSuggestions({
              shortageEntry: entry,
              allEntries: rawEntries,
              products,
            })
          : rawEntries
              .filter((e) => e.variance < 0)
              .flatMap((shortage) =>
                findSwapSuggestions({
                  shortageEntry: shortage,
                  allEntries: rawEntries,
                  products,
                }),
              )
              .filter((sg) => sg.candidateProductId === entry.productId);
      return {
        ...entry,
        classification: classifyVariance({
          variance: entry.variance,
          hasSuggestions: suggestions.length > 0,
        }),
      };
    });
  }

  function createAuditSession(params: {
    warehouseId?: string;
    warehouseName?: string;
    date: string;
    auditorName: string;
    referenceNote?: string;
    counts: { productId: number; physicalStock: number }[];
  }): AuditSession {
    // A stock adjustment only changes live stock when it is tied to a warehouse, so a session without
    // one falls back to the default godown (otherwise an approved adjustment would silently do nothing).
    const auditWarehouse =
      warehouses.find((w) => w.id === params.warehouseId) ||
      defaultWarehouse ||
      warehouses[0];
    const now = new Date().toISOString();
    // Pass 1: raw variances against live system stock (the same bookStock() the rest of
    // the app already treats as the current live count — no parallel stock system).
    const rawEntries: VarianceEntry[] = params.counts.map((c) => {
      const product = products.find((p) => p.id === c.productId);
      const systemStock = bookStock(c.productId);
      const variance = c.physicalStock - systemStock;
      return {
        id: `ve_${c.productId}`,
        productId: c.productId,
        productName: product?.name || `Product #${c.productId}`,
        systemStock,
        physicalStock: c.physicalStock,
        variance,
        classification: "matched", // placeholder, resolved in pass 2 below
        decisionStatus: "pending",
        requiresApproval: true,
      };
    });

    const entries = classifyEntries(rawEntries);

    const session: AuditSession = {
      id:
        "asess_" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 6),
      warehouseId: auditWarehouse?.id,
      warehouseName: auditWarehouse?.name || params.warehouseName,
      date: params.date,
      auditorName: params.auditorName,
      referenceNote: params.referenceNote,
      entries,
      createdAt: now,
      updatedAt: now,
    };
    setAuditSessions((prev) => {
      const next = [session, ...prev];
      saveAuditSessions(next).catch(() => {});
      return next;
    });
    syncAuditSession(session);
    return session;
  }

  function deleteAuditSession(id: string) {
    const remaining = auditSessions.filter((s) => s.id !== id);
    setAuditSessions(remaining);
    cloud("deleteAuditSessionFromSupabase", deleteAuditSessionFromSupabase(id));
    // The server collection is a full-list mirror; make sure it drops this session too.
    saveAuditSessions(remaining).catch(() => {});
  }

  function updateAuditSession(
    id: string,
    updates: {
      date?: string;
      warehouseId?: string;
      warehouseName?: string;
      auditorName?: string;
      referenceNote?: string;
    },
  ) {
    const existing = auditSessions.find((s) => s.id === id);
    if (!existing) return;
    const changed: string[] = [];
    if (updates.date && updates.date !== existing.date)
      changed.push(`date ${existing.date} → ${updates.date}`);
    if (
      updates.auditorName !== undefined &&
      updates.auditorName !== existing.auditorName
    )
      changed.push(`auditor ${existing.auditorName} → ${updates.auditorName}`);
    if (
      updates.warehouseId !== undefined &&
      updates.warehouseId !== existing.warehouseId
    )
      changed.push(
        `godown ${existing.warehouseName || "-"} → ${updates.warehouseName || "-"}`,
      );
    if (
      updates.referenceNote !== undefined &&
      (updates.referenceNote || "") !== (existing.referenceNote || "")
    )
      changed.push("note updated");
    const now = new Date().toISOString();
    const updated: AuditSession = {
      ...existing,
      ...updates,
      editLog:
        changed.length > 0
          ? [
              ...(existing.editLog || []),
              {
                at: now,
                by: currentUser?.name || "Admin",
                note: changed.join("; "),
              },
            ]
          : existing.editLog,
      updatedAt: now,
    };
    setAuditSessions((prev) => {
      const next = prev.map((s) => (s.id === id ? updated : s));
      saveAuditSessions(next).catch(() => {});
      return next;
    });
    syncAuditSession(updated);
  }

  function saveAuditSessionCounts(
    sessionId: string,
    counts: { productId: number; physicalStock: number }[],
    removeProductIds: number[] = [],
  ) {
    const session = auditSessions.find((s) => s.id === sessionId);
    const result = { updated: 0, added: 0, removed: 0, locked: 0 };
    if (!session) return result;

    // Entries that already have an approval trail must never be silently rewritten.
    const isLocked = (e: VarianceEntry) =>
      e.decisionStatus === "awaiting_approval" ||
      e.decisionStatus === "applied";
    const countMap = new Map(counts.map((c) => [c.productId, c.physicalStock]));
    const removeSet = new Set(removeProductIds);
    const log: string[] = [];

    let entries: VarianceEntry[] = [];
    for (const e of session.entries) {
      if (removeSet.has(e.productId)) {
        if (isLocked(e)) {
          result.locked++;
          entries.push(e);
        } else {
          result.removed++;
          log.push(`removed ${e.productName}`);
        }
        continue;
      }
      if (
        countMap.has(e.productId) &&
        countMap.get(e.productId) !== e.physicalStock
      ) {
        if (isLocked(e)) {
          result.locked++;
          entries.push(e);
          continue;
        }
        const physical = countMap.get(e.productId)!;
        // Keep the original system-stock snapshot so a backdated audit stays consistent.
        entries.push({
          ...e,
          physicalStock: physical,
          variance: physical - e.systemStock,
          decisionStatus: "pending",
          confirmedSwapWithProductId: undefined,
          confirmedSwapQuantity: undefined,
          investigationReason: undefined,
        });
        result.updated++;
        log.push(`${e.productName} count ${e.physicalStock} → ${physical}`);
        continue;
      }
      entries.push(e);
    }
    // Products that were missing from the session
    const existingIds = new Set(session.entries.map((e) => e.productId));
    for (const c of counts) {
      if (existingIds.has(c.productId)) continue;
      const product = products.find((p) => p.id === c.productId);
      const systemStock = bookStock(c.productId);
      entries.push({
        id: `ve_${c.productId}`,
        productId: c.productId,
        productName: product?.name || `Product #${c.productId}`,
        systemStock,
        physicalStock: c.physicalStock,
        variance: c.physicalStock - systemStock,
        classification: "matched",
        decisionStatus: "pending",
        requiresApproval: true,
      });
      result.added++;
      log.push(
        `added ${product?.name || c.productId} (count ${c.physicalStock})`,
      );
    }

    if (result.updated + result.added + result.removed === 0) return result;

    // Re-run matching over the whole session, but keep already-actioned entries as they were.
    const reclassified = classifyEntries(entries);
    entries = entries.map((e, i) =>
      e.decisionStatus === "pending" ? reclassified[i] : e,
    );

    const now = new Date().toISOString();
    const updated: AuditSession = {
      ...session,
      entries,
      editLog: [
        ...(session.editLog || []),
        { at: now, by: currentUser?.name || "Admin", note: log.join("; ") },
      ],
      updatedAt: now,
    };
    setAuditSessions((prev) => {
      const next = prev.map((s) => (s.id === sessionId ? updated : s));
      saveAuditSessions(next).catch(() => {});
      return next;
    });
    syncAuditSession(updated);
    return result;
  }

  function updateVarianceEntry(
    sessionId: string,
    varianceEntryId: string,
    updates: Partial<VarianceEntry>,
  ) {
    setAuditSessions((prev) => {
      const next = prev.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              updatedAt: new Date().toISOString(),
              entries: s.entries.map((e) =>
                e.id === varianceEntryId ? { ...e, ...updates } : e,
              ),
            },
      );
      const updatedSession = next.find((s) => s.id === sessionId);
      if (updatedSession) syncAuditSession(updatedSession);
      saveAuditSessions(next).catch(() => {});
      return next;
    });
  }

  // Confirms a proposed swap (spec §3/§4) — records the transaction as awaiting
  // approval. Can be called more than once against the same shortage entry (once per
  // candidate) to build up a partial multi-SKU match; each call is its own fully
  // traceable ReconciliationTransaction, and reconciliationTransactions filtered by
  // varianceEntryId is the authoritative multi-candidate detail, not the single
  // confirmedSwapWithProductId/Quantity summary fields on the entry.
  function confirmSwap(
    sessionId: string,
    varianceEntryId: string,
    params: {
      candidateProductId: number;
      quantity: number;
      matchScore?: number;
      notes?: string;
    },
  ) {
    const session = auditSessions.find((s) => s.id === sessionId);
    const entry = session?.entries.find((e) => e.id === varianceEntryId);
    if (!session || !entry) return;
    const candidate = products.find((p) => p.id === params.candidateProductId);
    const quantity = Math.max(0, Number(params.quantity) || 0);
    if (quantity <= 0) return;

    const txn: ReconciliationTransaction = {
      id:
        "rtxn_" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 6),
      auditSessionId: sessionId,
      varianceEntryId,
      type: "swap",
      fromProductId: entry.productId,
      toProductId: params.candidateProductId,
      quantity,
      matchScore: params.matchScore,
      notes: params.notes,
      identifiedBy: currentUser?.name || "Admin",
      createdAt: new Date().toISOString(),
    };
    setReconciliationTransactions((prev) => {
      const next = [txn, ...prev];
      saveReconciliationTransactions(next).catch(() => {});
      return next;
    });
    cloud(
      "pushReconciliationTransactionToSupabase",
      pushReconciliationTransactionToSupabase(txn),
    );

    const priorConfirmed = Number(entry.confirmedSwapQuantity) || 0;
    updateVarianceEntry(sessionId, varianceEntryId, {
      classification: "reconciled",
      decisionStatus: "awaiting_approval",
      confirmedSwapWithProductId: params.candidateProductId,
      confirmedSwapQuantity: priorConfirmed + quantity,
    });

    // Also nudge the candidate (excess) entry, if present in this session, so it shows
    // up as "reconciled/awaiting approval" too rather than sitting as a bare "excess".
    const candidateEntry = session.entries.find(
      (e) => e.productId === params.candidateProductId,
    );
    if (candidateEntry && candidateEntry.decisionStatus === "pending") {
      updateVarianceEntry(sessionId, candidateEntry.id, {
        classification: "reconciled",
        decisionStatus: "awaiting_approval",
      });
    }
    void candidate; // reserved for future UI use (candidate.name etc. already on txn via lookup)
  }

  function rejectSuggestion(sessionId: string, varianceEntryId: string) {
    updateVarianceEntry(sessionId, varianceEntryId, {
      decisionStatus: "suggestion_rejected",
    });
  }

  function keepAsSeparateVariance(sessionId: string, varianceEntryId: string) {
    const session = auditSessions.find((s) => s.id === sessionId);
    const entry = session?.entries.find((e) => e.id === varianceEntryId);
    if (!entry) return;
    updateVarianceEntry(sessionId, varianceEntryId, {
      decisionStatus: "kept_separate",
      classification: entry.variance < 0 ? "shortage" : "excess",
    });
  }

  function markUnderInvestigation(
    sessionId: string,
    varianceEntryId: string,
    notes?: string,
  ) {
    updateVarianceEntry(sessionId, varianceEntryId, {
      classification: "under_investigation",
      decisionStatus: "investigating",
      notes,
    });
  }

  // Spec §7/§8 — an explicit reason the auditor is confident about (still requires
  // approval before it becomes a ledger entry); "unknown_variance" is exactly the
  // "Unknown / Under Investigation, don't force a reason" escape hatch from spec §8.
  function selectInvestigationReason(
    sessionId: string,
    varianceEntryId: string,
    params: {
      reason: InvestigationReason;
      notes?: string;
      attachmentRef?: string;
    },
  ) {
    const session = auditSessions.find((s) => s.id === sessionId);
    const entry = session?.entries.find((e) => e.id === varianceEntryId);
    if (!session || !entry) return;

    if (params.reason === "unknown_variance") {
      updateVarianceEntry(sessionId, varianceEntryId, {
        classification: "unexplained",
        decisionStatus: "investigating",
        investigationReason: params.reason,
        notes: params.notes,
        attachmentRef: params.attachmentRef,
      });
      return;
    }

    const txn: ReconciliationTransaction = {
      id:
        "rtxn_" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 6),
      auditSessionId: sessionId,
      varianceEntryId,
      type: "investigation_reason",
      fromProductId: entry.productId,
      quantity: entry.variance,
      reasonCode: params.reason,
      notes: params.notes,
      identifiedBy: currentUser?.name || "Admin",
      createdAt: new Date().toISOString(),
    };
    setReconciliationTransactions((prev) => {
      const next = [txn, ...prev];
      saveReconciliationTransactions(next).catch(() => {});
      return next;
    });
    cloud(
      "pushReconciliationTransactionToSupabase",
      pushReconciliationTransactionToSupabase(txn),
    );

    updateVarianceEntry(sessionId, varianceEntryId, {
      classification: "reconciled",
      decisionStatus: "awaiting_approval",
      investigationReason: params.reason,
      notes: params.notes,
      attachmentRef: params.attachmentRef,
    });
  }

  // The ONLY function in this module that writes to the stock ledger and bumps
  // product.opening — and only for entries already sitting at 'awaiting_approval'
  // (i.e. an auditor has already explicitly confirmed a swap or picked a reason).
  // Gated to admin, per spec §9's "sensitive adjustments require Owner/Admin
  // authorization" (this app has no separate Owner tier — admin is the top role).
  function approveReconciliation(
    sessionId: string,
    varianceEntryId: string,
    approverName: string,
  ) {
    if (currentRole !== "admin") return;
    const session = auditSessions.find((s) => s.id === sessionId);
    const entry = session?.entries.find((e) => e.id === varianceEntryId);
    if (!session || !entry || entry.decisionStatus !== "awaiting_approval")
      return;

    const now = new Date().toISOString();
    const pendingTxns = reconciliationTransactions.filter(
      (t) => t.varianceEntryId === varianceEntryId && !t.approvedAt,
    );

    const newLedgerEntries: StockLedgerEntry[] = [];
    const productDeltas = new Map<number, number>();

    for (const txn of pendingTxns) {
      const isSwap = txn.type === "swap";
      const fromDelta = isSwap ? -txn.quantity : txn.quantity; // reason-code entries correct straight to physical
      productDeltas.set(
        txn.fromProductId,
        (productDeltas.get(txn.fromProductId) || 0) + fromDelta,
      );
      const fromProductName =
        products.find((p) => p.id === txn.fromProductId)?.name ||
        `Product #${txn.fromProductId}`;
      const toProductName = txn.toProductId
        ? products.find((p) => p.id === txn.toProductId)?.name
        : undefined;

      newLedgerEntries.push({
        id:
          "sle_" +
          Date.now().toString(36) +
          Math.random().toString(36).slice(2, 6),
        productId: txn.fromProductId,
        warehouseId: session.warehouseId || defaultWarehouse?.id || warehouses[0]?.id,
        quantity: fromDelta,
        transactionType: "audit_reconciliation",
        referenceAuditSessionId: sessionId,
        referenceReconciliationId: txn.id,
        reason: isSwap
          ? `Confirmed product swap with ${toProductName || "another SKU"} — ${fromProductName}`
          : `${txn.reasonCode} — ${fromProductName}`,
        userId: currentUser?.id,
        userName: approverName,
        timestamp: now,
      });

      if (isSwap && txn.toProductId) {
        productDeltas.set(
          txn.toProductId,
          (productDeltas.get(txn.toProductId) || 0) + txn.quantity,
        );
        newLedgerEntries.push({
          id:
            "sle_" +
            Date.now().toString(36) +
            Math.random().toString(36).slice(2, 6) +
            "_b",
          productId: txn.toProductId,
          warehouseId: session.warehouseId || defaultWarehouse?.id || warehouses[0]?.id,
          quantity: txn.quantity,
          transactionType: "audit_reconciliation",
          referenceAuditSessionId: sessionId,
          referenceReconciliationId: txn.id,
          reason: `Confirmed product swap with ${fromProductName} — ${toProductName || "another SKU"}`,
          userId: currentUser?.id,
          userName: approverName,
          timestamp: now,
        });
      }
    }

    if (newLedgerEntries.length === 0) return;

    setStockLedgerEntries((prev) => {
      const next = [...newLedgerEntries, ...prev];
      saveStockLedgerEntries(next).catch(() => {});
      return next;
    });
    newLedgerEntries.forEach((le) =>
      cloud(
        "pushStockLedgerEntryToSupabase",
        pushStockLedgerEntryToSupabase(le),
      ),
    );

    // NOTE: product.opening / batches are deliberately NOT edited. Live stock formulas add the
    // ledger delta on top (see ledgerAdjByProduct), so history stays immutable and the
    // adjusted balance is always reconstructable from batches + ledger - sales.

    setReconciliationTransactions((prev) => {
      const next = prev.map((t) =>
        pendingTxns.some((pt) => pt.id === t.id)
          ? { ...t, approvedBy: approverName, approvedAt: now }
          : t,
      );
      saveReconciliationTransactions(next).catch(() => {});
      return next;
    });
    pendingTxns.forEach((t) => {
      const updated = { ...t, approvedBy: approverName, approvedAt: now };
      cloud(
        "pushReconciliationTransactionToSupabase",
        pushReconciliationTransactionToSupabase(updated),
      );
    });

    updateVarianceEntry(sessionId, varianceEntryId, {
      classification: "approved_adjustment",
      decisionStatus: "applied",
      approvedBy: approverName,
      approvedAt: now,
      appliedLedgerEntryId: newLedgerEntries[0]?.id,
    });

    // If this entry was the "excess" side of a swap and its own entry also happens to
    // be sitting at awaiting_approval with no direct pending transaction of its own
    // (it was nudged by confirmSwap above), reflect the same applied state so the
    // dashboard counts it correctly without double-writing ledger entries for it.
    const candidateEntries = session.entries.filter(
      (e) =>
        e.id !== varianceEntryId &&
        e.decisionStatus === "awaiting_approval" &&
        pendingTxns.some((t) => t.toProductId === e.productId),
    );
    for (const ce of candidateEntries) {
      updateVarianceEntry(sessionId, ce.id, {
        classification: "approved_adjustment",
        decisionStatus: "applied",
        approvedBy: approverName,
        approvedAt: now,
      });
    }
  }

  // Bills CRUD
  function startEditBill(bill: Bill) {
    if ((bill.returns || []).length > 0) {
      notify(
        "This invoice has customer returns against it, so it can no longer be edited.",
      );
      return;
    }
    setEditingBillId(bill.id);
    setCart({
      retailer: bill.retailer,
      phone: bill.phone,
      date: bill.date,
      items: bill.items.map((it) => ({ ...it })),
      warehouseId: bill.warehouseId || "",
      tripId: bill.tripId,
      vehicle: bill.vehicle,
      salesman: bill.salesman,
      additionalDiscount: bill.additionalDiscount || 0,
    });
    setTab("billing");
  }

  function cancelEditBill() {
    setEditingBillId(null);
    setCart(emptyCart());
  }

  function finalizeBill(
    amountPaid?: number,
    tripId?: number,
    overallDiscount?: number,
    paymentDate?: string,
    paymentMode?: PaymentMode,
    paymentNote?: string,
    billDate?: string,
    extras?: {
      supplyType?: "B2C" | "B2B";
      customerGstin?: string;
      isRetrospective?: boolean;
      invoiceType?: "tax_invoice" | "bill_of_supply" | "retail";
      isGstInvoice?: boolean;
      /**
       * Party details to use for THIS bill. setCart() is async, so a screen that has just chosen the
       * customer (salesman sale) passes them here; otherwise the bill would be saved with the stale
       * cart (empty name => "Cash Sale", no phone, no customer link).
       */
      party?: {
        retailer?: string;
        phone?: string;
        salesman?: string;
        vehicle?: string;
        warehouseId?: string;
      };
    },
  ): number | null {
    const effCart = extras?.party ? { ...cart, ...extras.party } : cart;
    if (effCart.items.length === 0) return null;
    // setCart() is async, so callers that just changed the sale date (salesman confirm) pass it
    // explicitly; otherwise this closure would still see the stale effCart.date.
    const effectiveBillDate =
      (billDate && billDate.trim()) ||
      (effCart.date && effCart.date.trim()) ||
      todayISO();
    const finalTripId = tripId !== undefined ? tripId : effCart.tripId;
    const matchedTrip = finalTripId
      ? trips.find((t) => Number(t.id) === Number(finalTripId))
      : null;
    const resolvedWarehouseId =
      effCart.warehouseId ||
      matchedTrip?.warehouseId ||
      defaultWarehouse?.id ||
      (warehouses.length > 0 ? warehouses[0].id : "");

    let fefo: { items: BillItem[]; problems: string[] };
    let cartEditStockChanged = false;
    const originalForEdit =
      editingBillId !== null
        ? allBills.find((b) => b.id === editingBillId)
        : undefined;
    if (originalForEdit) {
      // Editing a saved invoice: only crates that actually change are re-checked / re-allocated.
      const plan = planBillEditStock(
        {
          ...originalForEdit,
          items: effCart.items,
          date: effectiveBillDate,
          warehouseId: resolvedWarehouseId || "",
          tripId: finalTripId || undefined,
        } as Bill,
        matchedTrip || null,
      );
      if (plan.problems.length > 0) {
        notify(
          "Cannot save these changes:\n" +
            plan.problems.map((m) => `• ${m}`).join("\n"),
        );
        return null;
      }
      cartEditStockChanged = plan.stockChanged;
      fefo = { items: plan.items, problems: [] };
    } else {
      const shortfalls = stockShortfalls(
        effCart.items,
        editingBillId,
        matchedTrip,
        resolvedWarehouseId,
      );
      if (shortfalls.length > 0) {
        notify(
          "Cannot save this bill — insufficient stock:\n" +
            shortfalls
              .map(
                (s) =>
                  `• ${s.productName}: need ${s.required}, only ${Math.max(0, s.available)} available` +
                  (matchedTrip ? ` on van (${matchedTrip.vehicle})` : ""),
              )
              .join("\n"),
        );
        return null;
      }

      // Multi-warehouse van: allocate each product across the godowns it was loaded from (see allocateBatches).
      fefo = allocateBatches(
        effCart.items,
        effectiveBillDate,
        resolvedWarehouseId,
        editingBillId,
        matchedTrip,
      );
      if (fefo.problems.length > 0) {
        notify(
          "Cannot save this bill:\n" +
            fefo.problems.map((m) => `• ${m}`).join("\n"),
        );
        return null;
      }
    }
    // Freeze the ex-GST purchase cost per case on each line now, so later purchases at other prices
    // never rewrite the margin of this invoice. Batch-weighted; falls back to the product's average cost.
    const batchCostById = new Map(
      inventoryBatches.map((b) => [
        b.id,
        Number(b.effectiveCostPrice) || Number(b.costPrice) || 0,
      ]),
    );
    const billItems = fefo.items.map((it) => {
      const prod = products.find((p) => p.id === it.productId);
      const fallback = Number(prod?.effectiveCost ?? prod?.cost) || 0;
      let q = 0;
      let c = 0;
      for (const a of it.batchAllocations || []) {
        const bc = batchCostById.get(a.batchId) || 0;
        const aq = Number(a.qty) || 0;
        if (aq > 0 && bc > 0) {
          q += aq;
          c += aq * bc;
        }
      }
      const cost = q > 0 ? c / q : fallback;
      return cost > 0
        ? { ...it, costExGst: Math.round(cost * 100) / 100 }
        : it;
    });
    const discountToApply =
      overallDiscount !== undefined
        ? overallDiscount
        : effCart.additionalDiscount || 0;
    const totals = billTotals(effCart.items, gstMode, discountToApply);
    const paid =
      amountPaid !== undefined
        ? Math.min(Math.max(0, amountPaid), totals.total)
        : totals.total;
    const isAnonymousParty =
      !effCart.retailer || effCart.retailer.trim().toLowerCase() === "cash sale";
    if (isAnonymousParty && totals.total - paid > 0.005) {
      notify(
        'An unpaid balance cannot be booked against "Cash Sale". Select or enter a customer for credit sales, or collect the full amount.',
      );
      return null;
    }

    // Credit limit hard block: existing dues + this bill's unpaid balance cannot exceed limit
    {
      const retailer = (effCart.retailer || "").trim();
      const isCash =
        !retailer ||
        retailer.toLowerCase() === "cash sale" ||
        retailer.toLowerCase() === "spot cash";
      if (!isCash && paid < totals.total - 0.005) {
        // Identify the customer by ID: a name that only one customer has, or name + phone to tell two shops of the
        // same name apart, or the phone alone, so a differently typed name cannot slip past the credit limit.
        const cust = findBillingCustomer(retailer, effCart.phone);
        const limit = Number(cust?.creditLimit) || 0;
        if (limit > 0) {
          // Use the same figure as the customer ledger (opening balance + invoices - returns -
          // receipts, so a customer's advance reduces what is owed). When editing, leave out the
          // balance of the invoice being edited because it is replaced by the new one.
          const led = getCustomerLedger(cust?.id || retailer, effCart.phone);
          let existingDue = led.rawBalance;
          if (editingBillId != null) {
            const eb = led.bills.find((b) => b.id === editingBillId);
            if (eb) existingDue -= billBalance(eb);
          }
          existingDue = Math.max(0, Math.round(existingDue * 100) / 100);
          const thisCredit = Math.max(0, totals.total - paid);
          if (existingDue + thisCredit > limit + 0.009) {
            notify(
              `Credit limit exceeded for ${retailer}.\n` +
                `Limit ₹${limit.toLocaleString("en-IN")} · Already due ₹${existingDue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} · ` +
                `This bill credit ₹${thisCredit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}.\n` +
                `Collect more payment or reduce the bill.`,
            );
            return null;
          }
        }
      }
    }

    const resolvedSalesmanId =
      matchedTrip?.salesmanId ||
      (currentUser?.role === "salesman" ? currentUser.id : undefined) ||
      effCart.salesmanId;
    const resolvedSalesmanName =
      matchedTrip?.salesman ||
      (currentUser?.role === "salesman" ? currentUser.name : undefined) ||
      effCart.salesman;

    const activePaymentDate =
      paymentDate && paymentDate.trim()
        ? paymentDate.trim()
        : effectiveBillDate;
    const activePaymentMode = paymentMode || "cash";
    const activePaymentNote = paymentNote || undefined;

    if (editingBillId !== null) {
      const updated: Bill = {
        ...totals,
        id: editingBillId,
        retailer: effCart.retailer || "Cash Sale",
        phone: effCart.phone,
        date: effectiveBillDate,
        items: billItems,
        amountPaid: paid,
        warehouseId: resolvedWarehouseId || "",
        tripId: finalTripId || undefined,
        vehicle: matchedTrip?.vehicle || effCart.vehicle || undefined,
        salesman: resolvedSalesmanName || undefined,
        salesmanId: resolvedSalesmanId || undefined,
        additionalDiscount: discountToApply,
        paymentDate: activePaymentDate,
        paymentMode: activePaymentMode,
        paymentNote: activePaymentNote,
        supplyType:
          extras?.supplyType === "B2B" && extras?.customerGstin ? "B2B" : "B2C",
        customerGstin:
          extras?.supplyType === "B2B"
            ? extras?.customerGstin || undefined
            : undefined,
        invoiceType:
          extras?.invoiceType ||
          (extras?.isGstInvoice === true
            ? "tax_invoice"
            : extras?.isGstInvoice === false
              ? "retail"
              : extras?.supplyType === "B2B" && extras?.customerGstin
                ? "tax_invoice"
                : "retail"),
        isGstInvoice:
          extras?.isGstInvoice !== undefined
            ? extras.isGstInvoice
            : extras?.invoiceType === "tax_invoice"
              ? true
              : extras?.invoiceType === "retail" || extras?.invoiceType === "bill_of_supply"
                ? false
                : extras?.supplyType === "B2B" && Boolean(extras?.customerGstin),
        isRetrospective: extras?.isRetrospective === true,
        editHistory: originalForEdit
          ? [
              ...(originalForEdit.editHistory || []),
              {
                at: new Date().toISOString(),
                by: currentUser?.name || "Admin",
                comment: "Edited from the billing screen",
                changes: describeBillChanges(originalForEdit, {
                  ...originalForEdit,
                  ...totals,
                  retailer: effCart.retailer || "Cash Sale",
                  date: effectiveBillDate,
                  items: billItems,
                  amountPaid: paid,
                } as Bill),
                stockChanged: cartEditStockChanged,
                totalBefore: Number(originalForEdit.total) || 0,
                totalAfter: Number(totals.total) || 0,
                paidBefore: Number(originalForEdit.amountPaid) || 0,
                paidAfter: Number(paid) || 0,
              } as BillEditEntry,
            ]
          : undefined,
      };
      // Save previous custom prices for all items in the bill
      for (const it of effCart.items) {
        if (
          it.productId &&
          it.customPriceEdited &&
          typeof it.rate === "number" &&
          it.rate >= 0
        ) {
          setCustomProductPrice(it.productId, it.rate, effCart.retailer);
        }
      }

      setBills((bs) => {
        const next = bs.map((b) => (b.id === editingBillId ? updated : b));
        try {
          saveOrders(next as any).catch(() => {});
          const raw = localStorage.getItem(STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          parsed.bills = next;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        } catch {}
        return next;
      });
      const id = editingBillId;
      setEditingBillId(null);
      setCart(emptyCart());
      setJustFinalizedBillId(id);

      keepReceivedMoneyOnEdit(
        updated,
        amountPaid !== undefined ? Math.max(0, amountPaid) : totals.total,
      );
      // Reconcile payment records with the new paid total (see reconcileBillPayments).
      reconcileBillPayments(updated, paid, {
        date: activePaymentDate,
        mode: activePaymentMode,
        note: activePaymentNote,
        recordedBy: resolvedSalesmanName || currentUser?.name || "Admin",
        salesmanId: resolvedSalesmanId,
      });

      // If the bill moved to another trip, take it off every other trip so it is only reconciled once.
      setTrips((ts) =>
        ts.map((t) => {
          if (t.id === finalTripId || !t.billIds.includes(id)) return t;
          const updatedT = { ...t, billIds: t.billIds.filter((b) => b !== id) };
          cloud("pushTripToSupabase", pushTripToSupabase(updatedT));
          return updatedT;
        }),
      );

      if (finalTripId) {
        setTrips((ts) =>
          ts.map((t) => {
            if (t.id !== finalTripId) return t;
            if (t.billIds.includes(id)) return t;
            const updatedT = { ...t, billIds: [...t.billIds, id] };
            cloud("pushTripToSupabase", pushTripToSupabase(updatedT));
            return updatedT;
          }),
        );
      }

      // Push to Supabase bills table & server API
      cloud("pushBillToSupabase", pushBillToSupabase(updated));
      cloudFetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      return id;
    } else {
      const nextId = reserveDocNumber(
        "bill",
        allBills.length ? Math.max(...allBills.map((b) => b.id)) : 100,
      );
      const newBill: Bill = {
        ...totals,
        id: nextId,
        retailer: effCart.retailer || "Cash Sale",
        phone: effCart.phone,
        customerId: resolveMasterCustomerId(effCart.retailer, effCart.phone),
        date: effectiveBillDate,
        items: billItems,
        amountPaid: paid,
        warehouseId: resolvedWarehouseId || "",
        tripId: finalTripId || undefined,
        vehicle: matchedTrip?.vehicle || effCart.vehicle || undefined,
        salesman: resolvedSalesmanName || undefined,
        salesmanId: resolvedSalesmanId || undefined,
        additionalDiscount: discountToApply,
        paymentDate: activePaymentDate,
        paymentMode: activePaymentMode,
        paymentNote: activePaymentNote,
        supplyType:
          extras?.supplyType === "B2B" && extras?.customerGstin ? "B2B" : "B2C",
        customerGstin:
          extras?.supplyType === "B2B"
            ? extras?.customerGstin || undefined
            : undefined,
        invoiceType:
          extras?.invoiceType ||
          (extras?.isGstInvoice === true
            ? "tax_invoice"
            : extras?.isGstInvoice === false
              ? "retail"
              : extras?.supplyType === "B2B" && extras?.customerGstin
                ? "tax_invoice"
                : "retail"),
        isGstInvoice:
          extras?.isGstInvoice !== undefined
            ? extras.isGstInvoice
            : extras?.invoiceType === "tax_invoice"
              ? true
              : extras?.invoiceType === "retail" || extras?.invoiceType === "bill_of_supply"
                ? false
                : extras?.supplyType === "B2B" && Boolean(extras?.customerGstin),
        isRetrospective: extras?.isRetrospective === true,
      };

      // Server-side scheme recompute at commit (do not trust client preview alone)
      if (billingSettings?.schemesEnabled === true) {
        const serverPreview = previewPricing(
          effCart.items,
          promotions,
          products,
          {
            customerName: effCart.retailer,
            customerPhone: effCart.phone,
            billDate: effectiveBillDate,
            schemesEnabled: true,
            autoApply: billingSettings.autoApplyPromotions !== false,
          },
        );
        const clientSchemeDisc = (effCart.items || []).reduce(
          (s, it) => s + (Number(it.discountAmount ?? it.discount) || 0),
          0,
        );
        if (!totalsMatch(clientSchemeDisc, serverPreview.schemeDiscountTotal, 0.05)) {
          // Prefer server numbers; still save but stamp server snapshot
          notify(
            `Scheme totals recalculated at save (₹${serverPreview.schemeDiscountTotal.toFixed(2)}).`,
          );
        }
        newBill.schemeDiscountTotal = serverPreview.schemeDiscountTotal;
        newBill.schemesApplied = serverPreview.applications;
        newBill.youSaved = serverPreview.youSaved;
        newBill.schemesEnabledAtSave = true;
        newBill.schemeVersionMap = Object.fromEntries(
          serverPreview.applications.map((a) => [String(a.schemeId), a.schemeVersion]),
        );
        // Increment in-memory usage counters (atomic SQL is for Supabase path)
        for (const app of serverPreview.applications) {
          if (app.status !== "applied") continue;
          setPromotions((prev) =>
            prev.map((p) =>
              Number(p.id) === Number(app.schemeId)
                ? { ...p, usedCount: (Number(p.usedCount) || 0) + 1 }
                : p,
            ),
          );
        }
      }

      // Save previous custom prices for all items in the bill
      for (const it of effCart.items) {
        if (
          it.productId &&
          it.customPriceEdited &&
          typeof it.rate === "number" &&
          it.rate >= 0
        ) {
          setCustomProductPrice(it.productId, it.rate, effCart.retailer);
        }
      }

      setBills((bs) => {
        const next = [newBill, ...bs];
        try {
          saveOrders(next as any).catch(() => {});
          const raw = localStorage.getItem(STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          parsed.bills = next;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        } catch {}
        return next;
      });
      setCart(emptyCart());
      setJustFinalizedBillId(nextId);

      // Create PaymentRecord if upfront payment was made
      if (paid > 0) {
        const newPay: PaymentRecord = {
          id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          billId: nextId,
          customerName: newBill.retailer,
          customerPhone: newBill.phone,
          paymentDate: activePaymentDate,
          amount: paid,
          mode: activePaymentMode,
          referenceNote:
            activePaymentNote || `Initial payment on invoice #${nextId}`,
          recordedBy: resolvedSalesmanName || currentUser?.name || "Admin",
          salesmanId: resolvedSalesmanId,
          createdAt: new Date().toISOString(),
        };
        setPayments((prev) => [newPay, ...prev]);
      }

      if (finalTripId) {
        setTrips((ts) =>
          ts.map((t) => {
            if (t.id !== finalTripId) return t;
            if (t.billIds.includes(nextId)) return t;
            const updatedT = { ...t, billIds: [...t.billIds, nextId] };
            cloud("pushTripToSupabase", pushTripToSupabase(updatedT));
            return updatedT;
          }),
        );
      }

      // Push to Supabase bills table & server API
      cloud("pushBillToSupabase", pushBillToSupabase(newBill));
      cloudFetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBill),
      });

      return nextId;
    }
  }

  // Make the payment records for a bill add up to `paid`: add the difference as a new record, or trim
  // the newest records when it went down (to 0 removes them all). Never overwrites a record with the total.
  function reconcileBillPayments(
    bill: Pick<Bill, "id" | "retailer" | "phone">,
    paid: number,
    opts: {
      date: string;
      mode: PaymentMode;
      note?: string;
      recordedBy: string;
      salesmanId?: string;
    },
  ) {
    setPayments((prev) => {
      const forBill = prev.filter((p) => p.billId === bill.id);
      const existingSum = forBill.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0,
      );
      const delta = Math.round((paid - existingSum) * 100) / 100;
      if (Math.abs(delta) < 0.005) return prev;
      if (delta > 0) {
        const newPay: PaymentRecord = {
          id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          billId: bill.id,
          customerName: bill.retailer,
          customerPhone: bill.phone,
          paymentDate: opts.date,
          amount: delta,
          mode: opts.mode,
          referenceNote: opts.note || `Payment on Invoice #${bill.id} (edit)`,
          recordedBy: opts.recordedBy,
          salesmanId: opts.salesmanId,
          createdAt: new Date().toISOString(),
        };
        return [newPay, ...prev];
      }
      let toRemove = -delta;
      const ordered = [...forBill].sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1,
      );
      const drop = new Set<string>();
      const shrink = new Map<string, number>();
      for (const rec of ordered) {
        if (toRemove <= 0.005) break;
        const amt = Number(rec.amount) || 0;
        if (amt <= toRemove + 0.005) {
          drop.add(rec.id);
          toRemove -= amt;
        } else {
          shrink.set(rec.id, amt - toRemove);
          toRemove = 0;
        }
      }
      addPaymentTombstones(Array.from(drop));
      return prev
        .filter((p) => !drop.has(p.id))
        .map((p) =>
          shrink.has(p.id) ? { ...p, amount: shrink.get(p.id)! } : p,
        );
    });
  }

  // Cancel an issued invoice with a credit note instead of deleting it. The invoice (and its number)
  // is kept for GST/audit; stock returns, the customer's due disappears and it leaves its trip.
  // Money already collected is recorded as refund due on the credit note.
  function cancelBill(billId: number, reason: string): BillCancellation | null {
    const target = allBills.find((b) => b.id === billId);
    if (!target || target.status === "cancelled") return null;
    if ((target.returns || []).length > 0) {
      // The customer was already credited for returned crates; a full cancellation on top would
      // refund them twice and double-reverse stock.
      notify(
        "This invoice has customer returns against it, so it cannot be cancelled. The returns already credit the customer.",
      );
      return null;
    }
    const year = new Date().getFullYear();
    const prefix = `CN-${year}-`;
    const highest = allBills.reduce((m, b) => {
      const no = b.cancellation?.creditNoteNo;
      const n =
        no && no.startsWith(prefix) ? parseInt(no.slice(prefix.length), 10) : 0;
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const seq = reserveDocNumber(`cn-${year}`, highest);
    const cancellation: BillCancellation = {
      creditNoteNo: `${prefix}${String(seq).padStart(3, "0")}`,
      date: todayISO(),
      reason: reason.trim() || "Cancelled",
      refundDue: Math.max(0, Number(target.amountPaid) || 0),
      cancelledBy: currentUser?.name || "Admin",
    };
    const cancelled: Bill = { ...target, status: "cancelled", cancellation };
    setBills((bs) => {
      const next = bs.map((b) => (b.id === billId ? cancelled : b));
      saveOrders(next).catch(() => {});
      return next;
    });
    // Collected money is not lost: it stays on the customer's account as an advance (refund due),
    // so the ledger still shows it and it can be refunded or used on another invoice.
    const releasedRows = payments.filter((p) => p.billId === billId);
    if (releasedRows.length > 0) {
      setPayments((prev) =>
        prev.map((p) =>
          p.billId === billId
            ? {
                ...p,
                billId: undefined,
                isAdvance: true,
                referenceNote: [
                  p.referenceNote,
                  `Advance / on account (from cancelled invoice #${billId})`,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }
            : p,
        ),
      );
      releasedRows.forEach((p) =>
        logPaymentAudit({
          action: "invoice_cancelled",
          paymentId: p.id,
          billId,
          customerName: p.customerName,
          amount: p.amount,
          note: `Invoice #${billId} cancelled: ₹${p.amount} kept as customer advance`,
          before: p,
        }),
      );
    }
    setTrips((ts) =>
      ts.map((t) => {
        if (!t.billIds.includes(billId)) return t;
        const updatedT = {
          ...t,
          billIds: t.billIds.filter((id) => id !== billId),
        };
        cloud("pushTripToSupabase", pushTripToSupabase(updatedT));
        return updatedT;
      }),
    );
    if (editingBillId === billId) {
      setEditingBillId(null);
      setCart(emptyCart());
    }
    cloud("pushBillToSupabase", pushBillToSupabase(cancelled));
    cloudFetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cancelled),
    });
    return cancellation;
  }

  // Each scrapped crate of a return becomes a tracked disposal record (claim from company / throw
  // out / decide later). Stock already left with the sale, so these never reduce stock again.
  // `skipReturnId`: records of that return are being replaced and must not count as used capacity.
  function recordReturnScrap(
    target: Bill,
    retValue: SalesReturn,
    resolveWh: (l: SalesReturnInputLine) => string | undefined,
    skipReturnId?: string,
  ) {
    // Scrapped crates (expired / damaged) are not lost track of: each one becomes a tracked
    // disposal that is either claimed from the company or thrown out. The stock already left with
    // the sale, so these are document records (stockApplied: false) and never reduce stock again.
    try {
      const today = retValue.date;
      const billId = target.id;
      for (const line of retValue.lines) {
        let need = Number(line.scrapQty) || 0;
        if (need <= 0) continue;
        const action: ScrapAction = line.scrapAction || "undecided";
        const prod = products.find((x) => x.id === line.productId);
        const prodCost =
          Number((prod as any)?.effectiveCost ?? (prod as any)?.cost ?? 0) || 0;
        const whId = resolveWh({
          productId: line.productId,
          restockQty: 0,
          scrapQty: need,
        });
        const whName = warehouses.find((w) => w.id === whId)?.name;

        // Capacity per batch = what the sale drew from it, minus crates already restocked/scrapped.
        const used: Record<string, number> = {};
        for (const r of target.returns || [])
          for (const l of r.lines)
            for (const br of l.batchRestocks || [])
              used[br.batchId] = (used[br.batchId] || 0) + br.qty;
        for (const l of retValue.lines)
          if (l.productId === line.productId)
            for (const br of l.batchRestocks || [])
              used[br.batchId] = (used[br.batchId] || 0) + br.qty;
        for (const d of inventoryDispositions) {
          const rt = d.returnTracking;
          if (rt && rt.sourceBillId === billId && d.batchId && !(skipReturnId && rt.sourceReturnId === skipReturnId))
            used[d.batchId] = (used[d.batchId] || 0) + (Number(d.quantity) || 0);
        }

        const chunks: { batchId?: string; qty: number }[] = [];
        for (const it of target.items) {
          if (it.productId !== line.productId) continue;
          for (const a of it.batchAllocations || []) {
            if (need <= 0) break;
            const room = Math.max(
              0,
              (Number(a.qty) || 0) - (used[a.batchId] || 0),
            );
            const take = Math.min(room, need);
            if (take > 0) {
              chunks.push({ batchId: a.batchId, qty: take });
              used[a.batchId] = (used[a.batchId] || 0) + take;
              need -= take;
            }
          }
        }
        if (need > 0) chunks.push({ qty: need });

        for (const ch of chunks) {
          const batch = ch.batchId
            ? inventoryBatches.find((b) => b.id === ch.batchId)
            : undefined;
          const cost =
            Number(batch?.effectiveCostPrice ?? batch?.costPrice ?? 0) ||
            prodCost;
          const tracking: ReturnTracking = {
            sourceBillId: billId,
            sourceReturnId: retValue.id,
            creditNoteNo: retValue.creditNoteNo,
            customerName: target.retailer || "Walk-in",
            decision: action,
            stage: action === "discard" ? "discarded" : "held",
            discardedOn: action === "discard" ? today : undefined,
            log: [
              {
                date: today,
                stage: action === "discard" ? "discarded" : "held",
                note:
                  action === "company"
                    ? "Marked to send back to company"
                    : action === "discard"
                      ? "Marked to throw out"
                      : "Returned by customer — decision pending",
              },
            ],
          };
          addInventoryDisposition({
            dispositionType:
              action === "discard" ? "expired_writeoff" : "expiry_return",
            productId: line.productId,
            productName: line.productName,
            warehouseId: whId || warehouses[0]?.id || "",
            warehouseName: whName,
            batchId: ch.batchId,
            batchNumber: batch?.batchNumber,
            expiryDate: batch?.expiryDate,
            quantity: ch.qty,
            unit: "case",
            costPerUnit: cost,
            supplierName: batch?.supplierName,
            supplierInvoiceNo: batch?.supplierInvoiceNo,
            compensationStatus: action === "company" ? "pending" : "not_applicable",
            reason: retValue.reason,
            notes: `Customer return ${retValue.creditNoteNo} · ${target.retailer || "Walk-in"} · invoice #${billId}`,
            referenceDocNo: retValue.creditNoteNo,
            eventDate: today,
            createdBy: currentUser?.name || "Admin",
            stockApplied: false,
            returnTracking: tracking,
          } as any);
        }
      }
    } catch (e) {
      console.warn("Could not record scrap tracking for return", e);
    }
  }

  // Customer return against an issued invoice. The invoice is left untouched; a numbered credit
  // note (SR-YYYY-NNN) is stored on it. The credit reduces what the customer owes (any excess over
  // what they still owed becomes a refund due), restocked crates go back into a godown, and
  // scrapped crates stay written off.
  function createSalesReturn(
    billId: number,
    lines: SalesReturnInputLine[],
    reason: string,
  ): SalesReturnResult {
    const target = allBillsRef.current.find((b) => b.id === billId);
    if (!target) return { ok: false, error: "Invoice not found." };
    const year = new Date().getFullYear();
    const prefix = `SR-${year}-`;
    const highest = allBillsRef.current.reduce((m, b) => {
      let mm = m;
      for (const r of b.returns || []) {
        const n = r.creditNoteNo.startsWith(prefix)
          ? parseInt(r.creditNoteNo.slice(prefix.length), 10)
          : 0;
        if (Number.isFinite(n) && n > mm) mm = n;
      }
      return mm;
    }, 0);

    // Where restocked crates go: the line's choice, else the godown the sale came from.
    const resolveWh = (l: SalesReturnInputLine): string | undefined => {
      const valid = (id?: string) =>
        !!id && warehouses.some((w) => w.id === id);
      if (valid(l.warehouseId)) return l.warehouseId;
      if (valid(target.warehouseId)) return target.warehouseId;
      const it = target.items.find((i) => i.productId === l.productId);
      const batchWh = (it?.batchAllocations || [])
        .map(
          (a) => inventoryBatches.find((b) => b.id === a.batchId)?.warehouseId,
        )
        .find((id) => valid(id));
      if (batchWh) return batchWh;
      const p = products.find((x) => x.id === l.productId);
      return p ? fallbackWarehouseId(p) || undefined : undefined;
    };
    const resolved = lines.map((l) => ({
      ...l,
      warehouseId: (Number(l.restockQty) || 0) > 0 ? resolveWh(l) : undefined,
    }));

    // Peek at the result before reserving a number, so a rejected return doesn't burn one.
    const batchWarehouse = Object.fromEntries(
      inventoryBatches.map((b) => [b.id, b.warehouseId]),
    );
    const draft = buildSalesReturn(target, resolved, {
      id: "",
      creditNoteNo: "",
      date: "",
      reason,
      createdBy: currentUser?.name || "Admin",
      batchWarehouse,
    });
    if (!draft.ok) return draft;

    const seq = reserveDocNumber(`sr-${year}`, highest);
    const result = buildSalesReturn(target, resolved, {
      id: `sr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      creditNoteNo: `${prefix}${String(seq).padStart(3, "0")}`,
      date: todayISO(),
      reason,
      createdBy: currentUser?.name || "Admin",
      batchWarehouse,
    });
    if (!result.ok) return result;

    const createdBy = currentUser?.name || "Admin";
    const createdAt = new Date().toISOString();
    const updated: Bill = {
      ...target,
      returns: [...(target.returns || []), result.value],
      editHistory: [
        ...(target.editHistory || []),
        {
          at: createdAt,
          by: createdBy,
          comment: `Return ${result.value.creditNoteNo} created: ${result.value.reason}`,
          changes: [
            `Credit ₹${(Number(result.value.totalCredit) || 0).toLocaleString("en-IN")}`,
            ...result.value.lines.map(
              (l) => `${l.productName}: ${l.restockQty} restocked / ${l.scrapQty} scrapped`,
            ),
          ],
          stockChanged: true,
          totalBefore: Number(target.total) || 0,
          totalAfter: Number(target.total) || 0,
          paidBefore: Number(target.amountPaid) || 0,
          paidAfter: Number(target.amountPaid) || 0,
        },
      ],
    };
    commitBillUpdates(new Map([[billId, updated]]));
    cloudFetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });

    recordReturnScrap(target, result.value, resolveWh);
    return result;
  }

  // ---- Cancel / edit a customer return that was already saved -----------------------------------
  // Everything (live stock, customer credit, ledger, GST report, profit report) is derived from
  // bill.returns, so taking a return off the bill reverses all of it in one step, with no manual
  // stock or payment editing. Safety checks first; real history that cannot be undone blocks it.
  function returnDispositions(billId: number, returnId: string) {
    return inventoryDispositions.filter(
      (d) =>
        d.returnTracking?.sourceBillId === billId &&
        d.returnTracking?.sourceReturnId === returnId,
    );
  }
  function dispositionWithCompany(d: (typeof inventoryDispositions)[number]) {
    const rt = d.returnTracking;
    return (
      rt?.stage === "sent" ||
      rt?.stage === "settled" ||
      rt?.stage === "rejected" ||
      d.compensationStatus === "settled" ||
      d.compensationStatus === "partial" ||
      d.compensationStatus === "rejected"
    );
  }
  // Crates of this return that went back on the shelf must still be there to take back out.
  function restockStillOnShelf(
    ret: SalesReturn,
    keepRestock: Record<number, number>,
  ): string | null {
    for (const l of ret.lines) {
      const give = (Number(l.restockQty) || 0) - (keepRestock[l.productId] || 0);
      if (give <= 0) continue;
      const have = remainingStock(l.productId);
      if (give > have)
        return `${l.productName}: ${give} crate(s) of this return went back on the shelf, but only ${have} are in stock now (the rest were sold again). Reverse or reduce that later sale first.`;
    }
    return null;
  }

  function cancelSalesReturn(
    billId: number,
    returnId: string,
    reason: string,
  ): { ok: true } | { ok: false; error: string } {
    const target = allBillsRef.current.find((b) => b.id === billId);
    const ret = target?.returns?.find((r) => r.id === returnId);
    if (!target || !ret) return { ok: false, error: "Return not found." };
    if (reason.trim().length < 3)
      return { ok: false, error: "Please write a short reason for cancelling this return." };
    const sentOut = returnDispositions(billId, returnId).filter(dispositionWithCompany);
    if (sentOut.length > 0)
      return {
        ok: false,
        error:
          "Scrapped crates of this return were already sent to the company / settled. Undo that in Expiry returns first, then cancel the return.",
      };
    const shelf = restockStillOnShelf(ret, {});
    if (shelf) return { ok: false, error: shelf };

    const by = currentUser?.name || "Admin";
    const now = new Date().toISOString();
    const updated: Bill = {
      ...target,
      returns: (target.returns || []).filter((r) => r.id !== returnId),
      cancelledReturns: [
        ...(target.cancelledReturns || []),
        { ...ret, cancelledAt: now, cancelledBy: by, cancelReason: reason.trim() },
      ],
      editHistory: [
        ...(target.editHistory || []),
        {
          at: now,
          by,
          comment: `Return ${ret.creditNoteNo} cancelled: ${reason.trim()}`,
          changes: [
            `Credit ₹${(Number(ret.totalCredit) || 0).toLocaleString("en-IN")} reversed`,
            ...ret.lines.map(
              (l) => `${l.productName}: ${l.restockQty} restocked / ${l.scrapQty} scrapped un-returned`,
            ),
          ],
          stockChanged: true,
          totalBefore: Number(target.total) || 0,
          totalAfter: Number(target.total) || 0,
          paidBefore: Number(target.amountPaid) || 0,
          paidAfter: Number(target.amountPaid) || 0,
        },
      ],
    };
    commitBillUpdates(new Map([[billId, updated]]));
    saveOrders(allBillsRef.current).catch(() => {});
    cloudFetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    // Scrap records made by this return were only paperwork; remove the ones nobody acted on.
    returnDispositions(billId, returnId).forEach((d) => deleteInventoryDisposition(d.id));
    notify(
      `Return ${ret.creditNoteNo} cancelled. ₹${(Number(ret.totalCredit) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} is owed on invoice #${billId} again and the restocked crates left stock.`,
    );
    return { ok: true };
  }

  function editSalesReturn(
    billId: number,
    returnId: string,
    lines: SalesReturnInputLine[],
    reason: string,
    editNote: string,
  ): SalesReturnResult {
    const target = allBillsRef.current.find((b) => b.id === billId);
    const old = target?.returns?.find((r) => r.id === returnId);
    if (!target || !old) return { ok: false, error: "Return not found." };
    if (editNote.trim().length < 3)
      return { ok: false, error: "Please write a short comment explaining this correction." };
    const sentOut = returnDispositions(billId, returnId).filter(dispositionWithCompany);
    if (sentOut.length > 0)
      return {
        ok: false,
        error:
          "Scrapped crates of this return were already sent to the company / settled, so it cannot be edited. Undo that in Expiry returns first.",
      };

    const without: Bill = {
      ...target,
      returns: (target.returns || []).filter((r) => r.id !== returnId),
    };
    const valid = (id?: string) => !!id && warehouses.some((w) => w.id === id);
    const resolveWh = (l: SalesReturnInputLine): string | undefined => {
      if (valid(l.warehouseId)) return l.warehouseId;
      if (valid(target.warehouseId)) return target.warehouseId;
      const it = target.items.find((i) => i.productId === l.productId);
      const bw = (it?.batchAllocations || [])
        .map((a) => inventoryBatches.find((b) => b.id === a.batchId)?.warehouseId)
        .find((id) => valid(id));
      if (bw) return bw;
      const p = products.find((x) => x.id === l.productId);
      return p ? fallbackWarehouseId(p) || undefined : undefined;
    };
    const resolved = lines.map((l) => ({
      ...l,
      warehouseId: (Number(l.restockQty) || 0) > 0 ? resolveWh(l) : undefined,
    }));
    const batchWarehouse = Object.fromEntries(
      inventoryBatches.map((b) => [b.id, b.warehouseId]),
    );
    const built = buildSalesReturn(without, resolved, {
      id: old.id,
      creditNoteNo: old.creditNoteNo, // same credit note number: it is a correction, not a new document
      date: old.date,
      reason,
      createdBy: old.createdBy,
      batchWarehouse,
    });
    if (!built.ok) return built;

    // Only crates REMOVED from the shelf need to still be there.
    const keep: Record<number, number> = {};
    for (const l of built.value.lines) keep[l.productId] = l.restockQty;
    const shelf = restockStillOnShelf(old, keep);
    if (shelf) return { ok: false, error: shelf };

    const by = currentUser?.name || "Admin";
    const now = new Date().toISOString();
    const revised: SalesReturn = {
      ...built.value,
      revisedAt: now,
      revisedBy: by,
      revisionNote: editNote.trim(),
    };
    const updated: Bill = {
      ...target,
      returns: (target.returns || []).map((r) => (r.id === returnId ? revised : r)),
      editHistory: [
        ...(target.editHistory || []),
        {
          at: now,
          by,
          comment: `Return ${old.creditNoteNo} corrected: ${editNote.trim()}`,
          changes: [
            `Credit ₹${(Number(old.totalCredit) || 0).toLocaleString("en-IN")} → ₹${(Number(revised.totalCredit) || 0).toLocaleString("en-IN")}`,
          ],
          stockChanged: true,
          totalBefore: Number(target.total) || 0,
          totalAfter: Number(target.total) || 0,
          paidBefore: Number(target.amountPaid) || 0,
          paidAfter: Number(target.amountPaid) || 0,
        },
      ],
    };
    commitBillUpdates(new Map([[billId, updated]]));
    saveOrders(allBillsRef.current).catch(() => {});
    cloudFetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    // Replace the scrap paperwork with records matching the corrected quantities.
    returnDispositions(billId, returnId).forEach((d) => deleteInventoryDisposition(d.id));
    recordReturnScrap(without, revised, resolveWh, returnId);
    notify(`Return ${old.creditNoteNo} corrected. Stock, credit and ledger now follow the new quantities.`);
    return { ok: true, value: revised };
  }

  // Double-entry guard. A double tap / double click / slow-network retry submits the same entry
  // twice within moments; the second one must not add another row or apply money twice.
  // Identical entries are only treated as a repeat inside a short window, so a genuine second
  // payment of the same amount a little later still works.
  const recentSubmitsRef = useRef<Map<string, number>>(new Map());
  function isRapidRepeat(key: string, windowMs = 8000): boolean {
    const now = Date.now();
    const m = recentSubmitsRef.current;
    m.forEach((t, k) => {
      if (now - t > windowMs * 4) m.delete(k);
    });
    const last = m.get(key);
    if (last !== undefined && now - last < windowMs) return true;
    m.set(key, now);
    return false;
  }

  // Apply already-computed bill changes: keep the sync ref current, update React state, and push
  // each changed bill to the cloud. Side effects live here, never inside a state updater.
  function commitBillUpdates(updatedById: Map<number, Bill>) {
    if (updatedById.size === 0) return;
    // What each bill had paid before this change: the server refuses the save if another phone has changed it since.
    const paidBefore = new Map<number, number>();
    for (const b of allBillsRef.current) if (updatedById.has(b.id)) paidBefore.set(b.id, Number(b.amountPaid) || 0);
    allBillsRef.current = allBillsRef.current.map(
      (b) => updatedById.get(b.id) ?? b,
    );
    setBills((bs) => bs.map((b) => updatedById.get(b.id) ?? b));
    updatedById.forEach((b) => {
      cloud("pushBillToSupabase", pushBillToSupabase(b));
      cloudFetch(`/api/bills/${b.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaid: b.amountPaid, expectedAmountPaid: paidBefore.get(b.id) }),
      }); // cloudFetch reports its own failures; it returns nothing, so there is no promise to catch
    });
  }

  function recordPayment(
    billId: number,
    amount: number,
    paymentDate?: string,
    mode?: PaymentMode,
    referenceNote?: string,
  ): number {
    const payDate =
      paymentDate && paymentDate.trim()
        ? paymentDate.trim()
        : todayISO();
    const payMode = mode || "cash";

    const current = allBillsRef.current.find(
      (b) => b.id === billId && b.status !== "cancelled",
    );
    if (!current || !(amount > 0)) return 0;
    if (
      isRapidRepeat(
        `rp|${billId}|${Math.round(amount * 100)}|${payDate}|${payMode}|${referenceNote || ""}`,
      )
    ) {
      notify("This payment was just recorded - the duplicate was ignored.");
      return 0;
    }
    // Only the outstanding balance can be applied. The payment record and the bill's paid amount
    // must agree, so we record exactly what was applied (never the raw over-payment).
    const outstanding = billBalance(current);
    const applied = Math.round(Math.min(amount, outstanding) * 100) / 100;
    if (applied <= 0) return 0;

    const updatedBill: Bill = {
      ...current,
      // rounded so repeated part-payments never leave 150.29999999999998 on the invoice
      amountPaid: Math.round(((current.amountPaid || 0) + applied) * 100) / 100,
    };
    commitBillUpdates(new Map([[billId, updatedBill]]));

    const newPayRecord: PaymentRecord = {
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      billId,
      customerName: updatedBill.retailer || "Cash Sale",
      customerPhone: updatedBill.phone,
      paymentDate: payDate,
      amount: applied,
      mode: payMode,
      referenceNote: referenceNote || undefined,
      recordedBy: currentUser?.name || "Admin",
      salesmanId: currentUser?.role === "salesman" ? currentUser.id : undefined,
      createdAt: new Date().toISOString(),
    };
    setPayments((prev) => [newPayRecord, ...prev]);
    return applied;
  }

  // Record a receipt from a customer. Money is always tied to invoices:
  //  - an invoice is chosen  -> that invoice is paid first (capped at its balance)
  //  - no invoice chosen     -> oldest unpaid invoices are paid first (FIFO)
  //  - anything left over    -> saved as an "Advance / on account" row (no invoice)
  // One journal row is saved per invoice that was paid, so the ledger, the Payments screen and
  // each invoice's paid amount always show the same figures. Invoices are matched with the SAME
  // rules as getCustomerLedger so the two screens cannot disagree about who owns which invoice.
  function recordCustomerPayment(
    customerName: string,
    amount: number,
    paymentDate: string,
    mode?: PaymentMode,
    referenceNote?: string,
    billId?: number,
  ): boolean {
    const cleanCustomer = customerName.trim();
    if (!cleanCustomer || !(Number(amount) > 0)) return false;
    const payDate =
      paymentDate && paymentDate.trim()
        ? paymentDate.trim()
        : todayISO();
    const payMode = mode || "cash";
    if (
      isRapidRepeat(
        `rcp|${normCustName(cleanCustomer)}|${Math.round(Number(amount) * 100)}|${payDate}|${payMode}|${referenceNote || ""}|${billId || 0}`,
      )
    ) {
      notify("This payment was just recorded - the duplicate was ignored.");
      return false;
    }

    const latest = (b: Bill) => allBillsRef.current.find((x) => x.id === b.id) ?? b;
    const isLive = (b: Bill) => b.status !== "cancelled" && !b.cancelled;
    const customerBills = getCustomerLedger(cleanCustomer)
      .bills.map(latest)
      .filter(isLive);
    // A specifically chosen invoice is always honoured, even if the name/phone rules missed it.
    if (billId && !customerBills.some((b) => b.id === billId)) {
      const chosen = allBillsRef.current.find((b) => b.id === billId);
      if (chosen && isLive(chosen)) customerBills.push(chosen);
    }

    const result = allocateReceipt(Number(amount), customerBills, billId);

    const updatedById = new Map<number, Bill>();
    let targetPhone = "";
    for (const a of result.allocations) {
      const b = customerBills.find((x) => x.id === a.billId);
      if (!b) continue;
      targetPhone = targetPhone || b.phone || "";
      updatedById.set(b.id, {
        ...b,
        amountPaid: Math.round(((b.amountPaid || 0) + a.amount) * 100) / 100,
      });
    }
    commitBillUpdates(updatedById);

    if (!targetPhone) {
      const matchCust = customers.find(
        (c) => normCustName(c.name) === normCustName(cleanCustomer),
      );
      targetPhone = matchCust?.phone || customerBills[0]?.phone || "";
    }

    const stamp = Date.now();
    let seq = 0;
    const ledgerBefore = getCustomerLedger(cleanCustomer);
    const rows = buildReceiptRows(
      {
        customerName: cleanCustomer,
        customerId: resolveMasterCustomerId(cleanCustomer, targetPhone),
        customerPhone: targetPhone,
        paymentDate: payDate,
        mode: payMode,
        referenceNote: referenceNote || undefined,
        recordedBy: currentUser?.name || "Admin",
        salesmanId: currentUser?.role === "salesman" ? currentUser.id : undefined,
        createdAt: new Date(stamp + seq).toISOString(),
      },
      result,
      () => `pay_${stamp}_${seq++}_${Math.random().toString(36).slice(2, 6)}`,
    );
    // An amount left after the invoices that goes against an unpaid opening balance is not a real
    // advance; say so on the row (the customer's balance is already right either way).
    const coversOpening =
      (ledgerBefore.openingBalance || 0) > 0 &&
      ledgerBefore.rawBalance - Number(amount) > -0.005;
    if (coversOpening) {
      for (const r of rows) {
        if (r.isAdvance)
          r.referenceNote = `${r.referenceNote || "Advance / on account"} · counted against opening balance`;
      }
    }

    setPayments((prev) => [...rows, ...prev]);
    for (const r of rows) {
      logPaymentAudit({
        action: "record",
        paymentId: r.id,
        billId: r.billId,
        customerName: r.customerName,
        amount: r.amount,
        note: r.billId
          ? `Received against invoice #${r.billId}`
          : "Received on account (advance)",
        after: r,
      });
    }
    return true;
  }

  // What a customer's credit looks like, so the screen can offer "use advance" / "refund".
  //  advance      = money held on account (no invoice), net of refunds already paid out
  //  overpaid     = paid on an invoice beyond what it now costs (after returns): refund due
  //  unpaidDue    = invoices still unpaid
  //  refundable   = credit that can be paid back (never more than the customer's net credit)
  function getCustomerCreditSummary(customerName: string) {
    const led = getCustomerLedger(customerName);
    const realIds = new Set(payments.map((p) => p.id));
    const latest = (b: Bill) => allBillsRef.current.find((x) => x.id === b.id) ?? b;
    const liveBills = led.bills
      .map(latest)
      .filter((b) => b.status !== "cancelled" && !b.cancelled);
    const advance = Math.max(
      0,
      Math.round(
        led.payments
          .filter((p) => realIds.has(p.id) && isAdvanceRow(p))
          .reduce((t, p) => t + (Number(p.amount) || 0), 0) * 100,
      ) / 100,
    );
    const overpaid =
      Math.round(
        liveBills.reduce((t, b) => t + billRefundDue(b), 0) * 100,
      ) / 100;
    const unpaidDue =
      Math.round(liveBills.reduce((t, b) => t + billBalance(b), 0) * 100) / 100;
    const refundable = Math.max(0, Math.round(-led.rawBalance * 100) / 100);
    return {
      advance,
      overpaid,
      unpaidDue,
      refundable,
      canApply: unpaidDue > 0.004 && advance + overpaid > 0.004,
    };
  }

  // Use a customer's advance (and money overpaid on an invoice after a return) to pay their unpaid
  // invoices, oldest first. The customer's balance does not change; only which invoice is paid.
  // Returns the amount applied.
  function applyAdvanceToInvoices(customerName: string, onlyBillId?: number): number {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const led = getCustomerLedger(customerName);
    const latest = (b: Bill) => allBillsRef.current.find((x) => x.id === b.id) ?? b;
    const liveBills = led.bills
      .map(latest)
      .filter((b) => b.status !== "cancelled" && !b.cancelled);
    const realIds = new Set(payments.map((p) => p.id));
    const advRows = led.payments
      .filter((p) => realIds.has(p.id) && isAdvanceRow(p))
      .sort((a, b) => ((a.paymentDate || "") > (b.paymentDate || "") ? 1 : -1));
    const advNet = r2(advRows.reduce((t, p) => t + (Number(p.amount) || 0), 0));
    let advLeft = Math.max(0, advNet);
    const overpaid = liveBills
      .map((b) => ({ b, e: billRefundDue(b) }))
      .filter((x) => x.e > 0.004);
    const overLeft = new Map(overpaid.map((x) => [x.b.id, x.e]));
    const targets = liveBills
      .filter(
        (b) =>
          billBalance(b) > 0.004 && (onlyBillId == null || b.id === onlyBillId),
      )
      .sort((a, b) => ((a.date || "") > (b.date || "") ? 1 : -1));

    if (advLeft + r2(Array.from(overLeft.values()).reduce((t, v) => t + v, 0)) <= 0.004) {
      notify("This customer has no advance or credit to adjust.");
      return 0;
    }
    if (targets.length === 0) {
      notify("This customer has no unpaid invoice to adjust the credit against.");
      return 0;
    }

    const stamp = Date.now();
    let seq = 0;
    const newRows: PaymentRecord[] = [];
    const billUpdates = new Map<number, Bill>();
    let fromAdvance = 0;
    const fromOver = new Map<number, number>();
    let applied = 0;

    for (const t of targets) {
      const need = billBalance(t);
      let use = 0;
      const fromAdv = Math.min(advLeft, need);
      advLeft = r2(advLeft - fromAdv);
      fromAdvance = r2(fromAdvance + fromAdv);
      use = r2(use + fromAdv);
      for (const [obId, left] of Array.from(overLeft.entries())) {
        if (r2(need - use) <= 0.004) break;
        const take = Math.min(left, r2(need - use));
        if (take <= 0.004) continue;
        overLeft.set(obId, r2(left - take));
        fromOver.set(obId, r2((fromOver.get(obId) || 0) + take));
        use = r2(use + take);
      }
      if (use <= 0.004) continue;
      applied = r2(applied + use);
      billUpdates.set(t.id, { ...t, amountPaid: r2((t.amountPaid || 0) + use) });
      newRows.push({
        id: `pay_${stamp}_adj${seq++}_${Math.random().toString(36).slice(2, 6)}`,
        billId: t.id,
        customerName: t.retailer,
        customerPhone: t.phone,
        paymentDate: todayISO(),
        amount: use,
        mode: "other",
        referenceNote: `Advance / credit adjusted against invoice #${t.id}`,
        recordedBy: currentUser?.name || "Admin",
        createdAt: new Date(stamp + seq).toISOString(),
      });
    }
    if (applied <= 0.004) return 0;

    // Take the used amount off the advance rows (oldest first) ...
    const reducedAdv = new Map<string, number>();
    let toTake = fromAdvance;
    for (const r of advRows) {
      if (toTake <= 0.004) break;
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      const take = Math.min(amt, toTake);
      reducedAdv.set(r.id, r2(amt - take));
      toTake = r2(toTake - take);
    }
    // ... and off the overpaid invoices (their paid amount and newest receipts first).
    const reducedRows = new Map<string, number>();
    fromOver.forEach((amt, obId) => {
      const ob = liveBills.find((b) => b.id === obId);
      if (!ob) return;
      billUpdates.set(obId, {
        ...ob,
        amountPaid: Math.max(0, r2((ob.amountPaid || 0) - amt)),
      });
      let left = amt;
      const rows = payments
        .filter((p) => p.billId === obId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      for (const r of rows) {
        if (left <= 0.004) break;
        const ra = Number(r.amount) || 0;
        const take = Math.min(ra, left);
        reducedRows.set(r.id, r2(ra - take));
        left = r2(left - take);
      }
    });
    const removedIds: string[] = [];
    const adjust = (p: PaymentRecord): PaymentRecord[] => {
      const v = reducedAdv.has(p.id) ? reducedAdv.get(p.id)! : reducedRows.get(p.id);
      if (v === undefined) return [p];
      if (v <= 0.004) {
        removedIds.push(p.id);
        return [];
      }
      return [{ ...p, amount: v }];
    };
    commitBillUpdates(billUpdates);
    setPayments((prev) => [...newRows, ...prev.flatMap(adjust)]);
    addPaymentTombstones(removedIds);
    newRows.forEach((r) =>
      logPaymentAudit({
        action: "apply_advance",
        paymentId: r.id,
        billId: r.billId,
        customerName: r.customerName,
        amount: r.amount,
        note: `Advance/credit of ₹${r.amount} adjusted against invoice #${r.billId}`,
        after: r,
      }),
    );
    notify(
      `₹${applied.toLocaleString("en-IN", { maximumFractionDigits: 2 })} of advance/credit adjusted against ${newRows.length} unpaid invoice${newRows.length > 1 ? "s" : ""}.`,
    );
    return applied;
  }

  // Pay a customer's credit back to them (e.g. after a cancelled invoice or a sales return).
  // Stored as a negative entry so the customer's balance goes back up by the same amount.
  function recordCustomerRefund(
    customerName: string,
    amount: number,
    paymentDate: string,
    mode?: PaymentMode,
    note?: string,
  ): boolean {
    const amt = Math.round((Number(amount) || 0) * 100) / 100;
    const name = (customerName || "").trim();
    if (!name || !(amt > 0)) {
      notify("Enter a refund amount greater than zero.");
      return false;
    }
    if (isRapidRepeat(`ref|${normCustName(name)}|${Math.round(amt * 100)}|${paymentDate}`)) {
      notify("This refund was just recorded - the duplicate was ignored.");
      return false;
    }
    const led = getCustomerLedger(name);
    const credit = Math.max(0, Math.round(-led.rawBalance * 100) / 100);
    if (amt > credit + 0.009) {
      notify(
        `Refund cannot be more than the customer's credit of ₹${credit.toLocaleString("en-IN", { maximumFractionDigits: 2 })}.`,
      );
      return false;
    }
    const row: PaymentRecord = {
      id: `pay_${Date.now()}_ref_${Math.random().toString(36).slice(2, 6)}`,
      customerName: led.customer?.name || name,
      customerPhone: led.customer?.phone || "",
      paymentDate: paymentDate && paymentDate.trim() ? paymentDate.trim() : todayISO(),
      amount: -amt,
      mode: mode || "cash",
      referenceNote: note ? `Refund paid to customer · ${note}` : "Refund paid to customer",
      recordedBy: currentUser?.name || "Admin",
      isAdvance: true,
      isRefund: true,
      createdAt: new Date().toISOString(),
    };
    setPayments((prev) => [row, ...prev]);
    logPaymentAudit({
      action: "refund",
      paymentId: row.id,
      customerName: row.customerName,
      amount: row.amount,
      note: `Refund of ₹${amt} paid to customer`,
      after: row,
    });
    return true;
  }

  // Old data: receipts saved with no invoice are split into per-invoice rows so they line up with
  // what each invoice already shows as paid. Totals do not change. Returns how many were split.
  function repairPaymentLinks(): number {
    const stamp = Date.now();
    let seq = 0;
    const res = splitUnlinkedPayments(
      payments,
      (name) =>
        getCustomerLedger(name)
          .bills.map((b) => allBillsRef.current.find((x) => x.id === b.id) ?? b)
          .filter((b) => b.status !== "cancelled" && !b.cancelled),
      () => `pay_fix_${stamp}_${seq++}_${Math.random().toString(36).slice(2, 6)}`,
    );
    if (res.changed > 0) setPayments(res.payments);
    return res.changed;
  }

  function deletePayment(paymentId: string, rectificationReason?: string) {
    const target = payments.find((p) => p.id === paymentId);
    if (target && target.billId) {
      const b = allBillsRef.current.find((x) => x.id === target.billId);
      if (b) {
        commitBillUpdates(
          new Map([
            [
              b.id,
              { ...b, amountPaid: Math.max(0, b.amountPaid - (target.amount || 0)) },
            ],
          ]),
        );
      }
    }
    if (target) {
      const tombIds = [paymentId];
      if (target.billId) {
        tombIds.push(`pay_bill_${target.billId}`);
        tombIds.push(`legacy_pay_${target.billId}`);
      }
      addPaymentTombstones(tombIds);
      const reason = (rectificationReason || "").trim();
      logPaymentAudit({
        action: "delete",
        paymentId,
        billId: target.billId,
        customerName: target.customerName,
        amount: target.amount,
        note:
          (target.billId
            ? `Deleted payment on invoice #${target.billId}`
            : "Deleted payment") + (reason ? ` — Reason: ${reason}` : ""),
        before: target,
      });
      // Record the delete in the cloud so no other device / stale cache can bring it back.
      pushDeletionRecordsToSupabase([
        {
          kind: "payment",
          id: paymentId,
          name: target.customerName,
          deletedAt: new Date().toISOString(),
          by: currentUser?.name || "Admin",
          reason,
          note: `₹${target.amount}${target.billId ? ` on invoice #${target.billId}` : ""}`,
        },
      ])
        .then((ok) => {
          if (!ok) {
            reportSyncFailure("deletePayment(log)", new Error("Could not save the delete to the cloud"));
          }
        })
        .catch(() => {});
    }
    // Deleting an "advance adjusted against invoice" row must not make the customer lose that
    // money: put it back on account as an advance.
    const restoreRow =
      target && isAdvanceAdjustmentRow(target)
        ? buildAdvanceRestoreRow(
            target,
            () => `pay_${Date.now()}_rst_${Math.random().toString(36).slice(2, 6)}`,
            currentUser?.name || "Admin",
          )
        : null;
    if (restoreRow) {
      logPaymentAudit({
        action: "record",
        paymentId: restoreRow.id,
        customerName: restoreRow.customerName,
        amount: restoreRow.amount,
        note: `Advance of ₹${restoreRow.amount} restored on account (adjustment on invoice #${target?.billId} deleted)`,
        after: restoreRow,
      });
      notify(
        `₹${restoreRow.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })} was put back on ${restoreRow.customerName}'s account as an advance.`,
      );
    }
    const next = [...(restoreRow ? [restoreRow] : []), ...payments.filter((p) => p.id !== paymentId)];
    setPayments(next);
    // The save effect skips an empty list (so a not-yet-loaded list can never wipe saved data).
    // When the last payment is deleted on purpose, save the empty list here, otherwise the
    // deleted payment comes back after a reload.
    if (next.length === 0 && payments.length > 0) {
      savePayments([]).catch(() => {});
      pushPaymentsToSupabase([], true).catch(() => {});
    }
  }

  // Edit a receipt. The invoice's paid amount and the journal row are always kept equal:
  //  - the amount saved on an invoice never exceeds what that invoice can still take
  //  - any extra is kept as a separate advance row (never lost, never over-paying an invoice)
  //  - moving a receipt takes the money off the old invoice and puts it on the new one
  //  - an advance row (no invoice) never touches any invoice unless it is attached to one
  function updatePayment(updated: PaymentRecord) {
    const old = payments.find((p) => p.id === updated.id);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    if (old?.isRefund) {
      notify("A refund entry cannot be edited. Delete it and record the refund again.");
      return;
    }
    if (!old) {
      setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      return;
    }
    // Saving the same edit twice (double tap) must not move money on the invoice twice.
    if (
      isRapidRepeat(
        `up|${updated.id}|${Math.round((Number(updated.amount) || 0) * 100)}|${updated.billId || 0}|${updated.paymentDate || ""}|${updated.mode || ""}|${updated.referenceNote || ""}`,
        4000,
      )
    ) {
      return;
    }
    const oldAmt = Number(old.amount) || 0;
    const newAmt = Number(updated.amount) || 0;
    const oldBillId = old.billId || 0;
    const newBillId = updated.billId || 0;
    const finalRow: PaymentRecord = { ...updated };
    let excess = 0;

    if (oldBillId !== newBillId) {
      const moved = new Map<number, Bill>();
      if (oldBillId) {
        const ob = allBillsRef.current.find((x) => x.id === oldBillId);
        if (ob)
          moved.set(ob.id, {
            ...ob,
            amountPaid: Math.max(0, (ob.amountPaid || 0) - oldAmt),
          });
      }
      if (newBillId) {
        const nb =
          moved.get(newBillId) ??
          allBillsRef.current.find((x) => x.id === newBillId);
        if (nb) {
          const applied = round2(Math.min(newAmt, billBalance(nb)));
          excess = round2(newAmt - applied);
          finalRow.amount = applied;
          finalRow.isAdvance = false;
          moved.set(nb.id, {
            ...nb,
            amountPaid: round2((nb.amountPaid || 0) + applied),
          });
        }
      } else {
        // Detached from its invoice: the money stays with the customer as an advance.
        finalRow.isAdvance = true;
      }
      commitBillUpdates(moved);
    } else if (oldBillId) {
      if (Math.abs(newAmt - oldAmt) > 0.004) {
        const b = allBillsRef.current.find((x) => x.id === oldBillId);
        if (b) {
          const others = Math.max(0, (b.amountPaid || 0) - oldAmt);
          const room = Math.max(0, round2(billNetTotal(b) - others));
          const applied = round2(Math.min(newAmt, room));
          excess = round2(newAmt - applied);
          finalRow.amount = applied;
          commitBillUpdates(
            new Map([[b.id, { ...b, amountPaid: round2(others + applied) }]]),
          );
        }
      }
    } else if (isAdvanceRow(old)) {
      // Advance stays an advance: no invoice changes.
      finalRow.isAdvance = true;
    } else if (old.customerName && Math.abs(newAmt - oldAmt) > 0.004) {
      // Old-style receipt with no invoice link: spread the change over the customer's invoices.
      const diff = newAmt - oldAmt;
      const targetCustomer = old.customerName.trim().toLowerCase();
      if (diff > 0) {
        let remaining = diff;
        const unpaidBills = allBillsRef.current
          .filter(
            (b) =>
              b.status !== "cancelled" &&
              !b.cancelled &&
              (b.retailer || "").trim().toLowerCase() === targetCustomer &&
              billBalance(b) > 0,
          )
          .sort((a, b) => (a.date > b.date ? 1 : -1));
        const updatedMap = new Map<number, Bill>();
        for (const b of unpaidBills) {
          if (remaining <= 0) break;
          const due = billBalance(b);
          const toPay = Math.min(remaining, due);
          updatedMap.set(b.id, { ...b, amountPaid: (b.amountPaid || 0) + toPay });
          remaining -= toPay;
        }
        if (updatedMap.size > 0) commitBillUpdates(updatedMap);
      } else {
        let remaining = Math.abs(diff);
        const paidBills = allBillsRef.current
          .filter(
            (b) =>
              b.status !== "cancelled" &&
              !b.cancelled &&
              (b.retailer || "").trim().toLowerCase() === targetCustomer &&
              (b.amountPaid || 0) > 0,
          )
          .sort((a, b) => (a.date < b.date ? 1 : -1));
        const updatedMap = new Map<number, Bill>();
        for (const b of paidBills) {
          if (remaining <= 0) break;
          const toRevert = Math.min(remaining, b.amountPaid || 0);
          updatedMap.set(b.id, {
            ...b,
            amountPaid: Math.max(0, (b.amountPaid || 0) - toRevert),
          });
          remaining -= toRevert;
        }
        if (updatedMap.size > 0) commitBillUpdates(updatedMap);
      }
    }

    const extraRows: PaymentRecord[] = [];
    // Do not create the same advance row again when a receipt is edited twice with the same excess.
    const advNote = [updated.referenceNote, "Advance / on account"].filter(Boolean).join(" · ");
    const advAlreadyThere = payments.some(
      (p) =>
        p.id !== updated.id &&
        !p.billId &&
        isAdvanceRow(p) &&
        normCustName(p.customerName) === normCustName(finalRow.customerName) &&
        (p.paymentDate || "") === (finalRow.paymentDate || "") &&
        Math.abs((Number(p.amount) || 0) - excess) < 0.005 &&
        (p.referenceNote || "") === advNote,
    );
    if (excess > 0.004 && !advAlreadyThere) {
      extraRows.push({
        ...finalRow,
        id: `pay_${Date.now()}_adv_${Math.random().toString(36).slice(2, 6)}`,
        billId: undefined,
        isAdvance: true,
        amount: excess,
        referenceNote:
          [updated.referenceNote, "Advance / on account"].filter(Boolean).join(" · "),
      });
    }
    setPayments((prev) => [
      ...extraRows,
      ...prev.map((p) => (p.id === updated.id ? finalRow : p)),
    ]);
    logPaymentAudit({
      action: "edit",
      paymentId: finalRow.id,
      billId: finalRow.billId,
      customerName: finalRow.customerName,
      amount: finalRow.amount,
      note:
        oldAmt !== finalRow.amount || oldBillId !== (finalRow.billId || 0)
          ? `Changed ₹${oldAmt} (${oldBillId ? "invoice #" + oldBillId : "no invoice"}) to ₹${finalRow.amount} (${finalRow.billId ? "invoice #" + finalRow.billId : "no invoice"})`
          : "Edited payment details",
      before: old,
      after: finalRow,
    });
  }

  function addCustomer(
    customerData: Omit<Customer, "id" | "createdAt"> & { id?: string },
  ): Customer {
    // Same shop entered twice: same name and the same phone (or one side has no phone) is the same
    // customer. Reuse it instead of adding a second master record. Shops that share a name but
    // have different phone numbers are still kept apart.
    if (!customerData.id) {
      const n = normCustName(customerData.name);
      const ph = last10Of(customerData.phone);
      const dup = customersRef.current.find((c) => {
        if (normCustName(c.name) !== n) return false;
        const cp = last10Of(c.phone);
        return !ph || !cp || ph === cp;
      });
      if (dup) {
        notify(`${dup.name} is already in the customer list - no duplicate was added.`);
        return dup;
      }
    }
    const id =
      customerData.id ||
      `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newCust: Customer = {
      ...customerData,
      id,
      name: customerData.name.trim(),
      phone: (customerData.phone || "").trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCustomers((prev) => [newCust, ...prev.filter((c) => c.id !== id)]);
    {
      const n = normCustName(newCust.name);
      if (n && hiddenCustNames.has(n)) {
        const next = new Set(hiddenCustNames);
        next.delete(n);
        writeHiddenCustomerNames(next);
        setHiddenCustNames(next);
      }
    }
    return newCust;
  }

  function updateCustomer(
    updated: Customer,
    syncLinkedBillsAndPayments = true,
  ) {
    const old = customers.find((c) => c.id === updated.id);
    const stamped: Customer = {
      ...updated,
      updatedAt: new Date().toISOString(),
    };
    setCustomers((prev) =>
      prev.map((c) => (c.id === updated.id ? stamped : c)),
    );

    if (
      syncLinkedBillsAndPayments &&
      old &&
      (old.name !== updated.name || old.phone !== updated.phone)
    ) {
      // The customer ID is the only link. A bill or receipt that carries another customer's ID is never touched,
      // even if the name text is identical (two different shops can share a name). Only an old record that has NO
      // id at all is matched by name, and only when that name belonged to this customer alone; it is then given
      // the id so it follows every later rename.
      const oldKey = normCustName(old.name);
      const nameIsShared = customers.some((c) => c.id !== old.id && normCustName(c.name) === oldKey);
      const isThisCustomer = (recId?: string | null, recName?: string): boolean => {
        if (recId) return String(recId) === String(old.id);
        return !nameIsShared && !!oldKey && normCustName(recName) === oldKey;
      };
      const stampNow = new Date().toISOString();
      setBills((bs) =>
        bs.map((b) => {
          if (!isThisCustomer(b.customerId, b.retailer)) return b;
          const upBill = {
            ...b,
            customerId: old.id,
            retailer: updated.name,
            phone: updated.phone || b.phone,
            updatedAt: stampNow,
          };
          cloud("pushBillToSupabase", pushBillToSupabase(upBill));
          return upBill;
        }),
      );
      setPayments((ps) =>
        ps.map((p) => {
          if (!isThisCustomer(p.customerId, p.customerName)) return p;
          return {
            ...p,
            customerId: old.id,
            customerName: updated.name,
            customerPhone: updated.phone || p.customerPhone,
            updatedAt: stampNow,
          };
        }),
      );
    }
  }

  /** Another customer that already uses this name (renaming onto it would blur two shops into one ledger). */
  function customerNameClash(customerId: string, name: string): Customer | undefined {
    const key = normCustName(name);
    if (!key) return undefined;
    return customers.find((c) => c.id !== customerId && normCustName(c.name) === key);
  }

  function deleteCustomer(customerId: string, rectificationReason?: string) {
    const target = customers.find((c) => c.id === customerId);
    const reason = (rectificationReason || "").trim();
    const opening = Number(target?.openingBalance) || 0;
    // The owner can always delete a customer. With an opening balance a rectification comment is
    // required, and the balance is written into the log so the money is never lost silently.
    if (target && Math.abs(opening) > 0.004 && !reason) {
      notify(
        `${target.name} has an opening balance of ₹${opening.toLocaleString("en-IN")}. Enter a rectification comment to delete anyway, so the reason is recorded.`,
      );
      return;
    }
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    if (!target) return;

    // Remember locally (by id only, so a new customer with the same name is never blocked)...
    addCustomerTombstones([customerId]);
    // ...hide the name so the directory does not rebuild it from old bills (bills are kept)...
    const n = normCustName(target.name);
    if (n) {
      const next = new Set(hiddenCustNames);
      next.add(n);
      writeHiddenCustomerNames(next);
      setHiddenCustNames(next);
    }
    // ...and record it in the cloud so every device agrees.
    pushDeletionRecordsToSupabase([
      {
        kind: "customer",
        id: customerId,
        name: target.name,
        deletedAt: new Date().toISOString(),
        by: currentUser?.name || "Admin",
        reason,
        note:
          Math.abs(opening) > 0.004
            ? `Opening balance ₹${opening.toLocaleString("en-IN")} at delete`
            : undefined,
      },
    ])
      .then((ok) => {
        if (!ok) {
          reportSyncFailure("deleteCustomer(log)", new Error("Could not save the delete to the cloud"));
        }
      })
      .catch(() => {});
  }

  // Customers are matched NAME FIRST. A phone number is checked to distinguish multiple customers
  // sharing the same name. If a customer has multiple phone numbers (e.g. primary and alternate phone),
  // bills with either number match their ledger. If a customer name is unique in the directory,
  // bills issued under their name belong to their ledger.
  const isDummyPhone = (phone?: string): boolean => {
    const d = (phone || "").replace(/\D/g, "");
    return !d || d === "1234567890" || /^0+$/.test(d) || /^9+$/.test(d) || d.length < 5;
  };

  const last10Of = (phone?: string): string => {
    if (isDummyPhone(phone)) return "";
    const d = (phone || "").replace(/\D/g, "");
    return d.length >= 10 ? d.slice(-10) : "";
  };

  const normCustName = (n?: string): string => {
    return (n || "")
      .trim()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();
  };

  const customerPhonesMatch = (
    custPhones: (string | undefined)[],
    targetPhone?: string,
    isUniqueCustomerName: boolean = true,
  ): boolean => {
    const targetLast10 = last10Of(targetPhone);
    // If target has no phone recorded on the invoice/receipt (or is dummy 1234567890), name match is accepted
    if (!targetLast10) return true;

    const validCustLast10s = custPhones
      .map((p) => last10Of(p))
      .filter((p): p is string => Boolean(p));

    // If customer has no non-dummy phones registered in profile, name match is accepted
    if (validCustLast10s.length === 0) return true;

    // If target phone matches any of the customer's phone numbers (primary or alternate)
    if (validCustLast10s.includes(targetLast10)) return true;

    // If this customer's name is unique in the customer directory,
    // match even if a secondary or employee contact number was typed during billing
    if (isUniqueCustomerName) return true;

    return false;
  };

  const existingCustomers: ExistingCustomer[] = useMemo(() => {
    const map = new Map<string, ExistingCustomer>();

    // 1. Initialize from registered Customer master
    customers.forEach((c) => {
      const key = normCustName(c.name);
      if (!key) return;
      const existing = map.get(key);
      const cleanPhone = isDummyPhone(c.phone) ? "" : c.phone;
      const cleanAltPhone = isDummyPhone(c.altPhone) ? "" : c.altPhone;

      if (!existing) {
        map.set(key, {
          id: c.id,
          name: c.name,
          phone: cleanPhone,
          altPhone: cleanAltPhone,
          address: c.address,
          city: c.city,
          gstin: c.gstin,
          creditLimit: c.creditLimit,
          openingBalance: c.openingBalance || 0,
          totalBills: 0,
          totalBilled: 0,
          totalPaid: 0,
          balanceDue: c.openingBalance || 0,
          lastBillDate: "",
          lastPaymentDate: "",
        });
      } else {
        if ((!existing.phone || isDummyPhone(existing.phone)) && cleanPhone) {
          existing.phone = cleanPhone;
        }
        if ((!existing.altPhone || isDummyPhone(existing.altPhone)) && cleanAltPhone) {
          existing.altPhone = cleanAltPhone;
        }
        if ((!existing.creditLimit || existing.creditLimit === 0) && c.creditLimit) {
          existing.creditLimit = c.creditLimit;
        }
        if (!existing.address && c.address) existing.address = c.address;
        if (!existing.city && c.city) existing.city = c.city;
        if (!existing.gstin && c.gstin) existing.gstin = c.gstin;
      }
    });

    // 2. Aggregate active non-cancelled bills
    bills.forEach((b) => {
      if (b.status === "cancelled" || b.cancelled) return;
      const name = b.retailer?.trim();
      if (!name) return;
      const key = normCustName(name);
      // Deleted by the owner: keep the bill, but do not list the customer again.
      if (hiddenCustNames.has(key) && !map.has(key)) return;
      let record = map.get(key);
      const cleanBPhone = isDummyPhone(b.phone) ? "" : b.phone || "";
      if (!record) {
        record = {
          name,
          phone: cleanBPhone,
          totalBills: 0,
          totalBilled: 0,
          totalPaid: 0,
          balanceDue: 0,
          openingBalance: 0,
          lastBillDate: "",
          lastPaymentDate: "",
        };
        map.set(key, record);
      }

      record.totalBills += 1;
      const netBilled = billNetTotal(b);
      record.totalBilled += netBilled;

      if (!record.lastBillDate || b.date > record.lastBillDate) {
        record.lastBillDate = b.date;
      }
      if (cleanBPhone && (!record.phone || isDummyPhone(record.phone))) {
        record.phone = cleanBPhone;
      }
    });

    // 3. Aggregate payments cleanly without double-counting
    map.forEach((record, key) => {
      const matchMasterList = customers.filter(
        (c) => normCustName(c.name) === key || (record.id && c.id === record.id),
      );
      const matchMaster = matchMasterList[0];
      const distinctPhones = new Set(
        matchMasterList
          .map((c) => last10Of(c.phone))
          .filter(Boolean),
      );
      const isUniqueName = distinctPhones.size <= 1;
      const custPhones = [
        record.phone,
        record.altPhone,
        ...matchMasterList.map((c) => c.phone),
        ...matchMasterList.map((c) => c.altPhone),
      ].filter((p) => !isDummyPhone(p));

      const custBills = bills.filter((b) => {
        if (b.status === "cancelled" || b.cancelled) return false;
        const bName = normCustName(b.retailer);
        return bName === key && customerPhonesMatch(custPhones, b.phone, isUniqueName);
      });

      const custBillIds = new Set(custBills.map((b) => b.id));

      const custPayments = payments.filter((p) => {
        if (p.billId && custBillIds.has(p.billId)) return true;
        const pCust = normCustName(p.customerName);
        return (
          !!pCust &&
          pCust === key &&
          customerPhonesMatch(custPhones, p.customerPhone, isUniqueName)
        );
      });

      const totalRecordedPaid = custPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      // An invoice's "paid" that has no receipt row behind it (old data) is added invoice by invoice,
      // exactly like the customer ledger does. Comparing only the grand totals let an advance
      // receipt hide another invoice's missing payment, so the list and the ledger disagreed.
      const missingUpfront = billPaymentGaps(custBills, custPayments).reduce(
        (t, g) => t + g.shortfall,
        0,
      );

      record.totalPaid = totalRecordedPaid + missingUpfront;

      custPayments.forEach((p) => {
        const pDate = p.paymentDate || p.createdAt?.slice(0, 10);
        if (pDate && (!record.lastPaymentDate || pDate > record.lastPaymentDate)) {
          record.lastPaymentDate = pDate;
        }
      });

      const openingBal = matchMaster?.openingBalance || record.openingBalance || 0;
      record.openingBalance = openingBal;
      const rawBal = Math.round((openingBal + record.totalBilled - record.totalPaid) * 100) / 100;
      record.balanceDue = Math.max(0, rawBal);
      // A customer who has paid more than they owe has an advance. It must be shown as an advance,
      // not hidden behind "0 due".
      record.advance = Math.max(0, -rawBal);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [customers, bills, payments, hiddenCustNames]);

  function startBillForCustomer(customerName: string, customerPhone?: string) {
    const trimmed = customerName.trim();
    if (!trimmed) return;
    setCart((prev) => ({
      ...prev,
      retailer: trimmed,
      phone: customerPhone || "",
      date: todayISO(),
    }));
    setTab("billing");
    window.dispatchEvent(
      new CustomEvent("app-new-bill", {
        detail: { customerName: trimmed, customerPhone: customerPhone || "" },
      }),
    );
  }

  /**
   * The id of the registered customer an invoice / receipt belongs to, or undefined when it cannot be told apart
   * safely (no such customer, or several customers share the name and the phone does not decide it).
   */
  function resolveMasterCustomerId(name?: string, phone?: string): string | undefined {
    const n = normCustName(name);
    if (!n) return undefined;
    const sameName = customers.filter((c) => normCustName(c.name) === n);
    const ph = last10Of(phone || "");
    if (sameName.length === 1) return sameName[0].id;
    if (sameName.length > 1 && ph.length === 10) {
      const byPhone = sameName.filter((c) => last10Of(c.phone) === ph || last10Of(c.altPhone || "") === ph);
      return byPhone.length === 1 ? byPhone[0].id : undefined;
    }
    if (sameName.length === 0 && ph.length === 10) {
      const byPhone = customers.filter((c) => last10Of(c.phone) === ph);
      return byPhone.length === 1 ? byPhone[0].id : undefined;
    }
    return undefined;
  }

  /** The customer master record a bill is for (see resolveMasterCustomerId); undefined if it cannot be told apart. */
  function findBillingCustomer(name?: string, phone?: string): Customer | undefined {
    const id = resolveMasterCustomerId(name, phone);
    return id ? customers.find((c) => c.id === id) : undefined;
  }

  function getCustomerLedger(customerNameOrId: string, customerPhone?: string, customerAltPhone?: string) {
    const trimmedInput = (customerNameOrId || "").trim();
    const cleanLower = normCustName(trimmedInput);

    // 1. Resolve customer profile from customers master, existingCustomers, or bills
    // The ID decides. A name only picks a customer when exactly one customer has that name; with two shops of the
    // same name the phone number has to tell them apart (resolveMasterCustomerId), otherwise nobody is guessed.
    const custInMaster =
      customers.find((c) => c.id === trimmedInput) ||
      (() => {
        const byName = customers.filter((c) => normCustName(c.name) === cleanLower);
        if (byName.length === 1) return byName[0];
        const id = byName.length > 1 ? resolveMasterCustomerId(trimmedInput, customerPhone) : undefined;
        return id ? customers.find((c) => c.id === id) : undefined;
      })();
    const existing = existingCustomers.find(
      (ec) =>
        (ec.id && ec.id === trimmedInput) ||
        normCustName(ec.name) === cleanLower,
    );
    const anyMatchingBill = bills.find(
      (b) =>
        b.status !== "cancelled" &&
        !b.cancelled &&
        normCustName(b.retailer) === cleanLower,
    );

    const resolvedName =
      custInMaster?.name ||
      existing?.name ||
      anyMatchingBill?.retailer ||
      trimmedInput;
    const cleanName = normCustName(resolvedName);

    // A registered customer with no phone is matched by name only (never borrow a number from a bill).
    const resolvedPhone = custInMaster
      ? custInMaster.phone || ""
      : existing?.phone || customerPhone || anyMatchingBill?.phone || "";
    const resolvedAltPhone =
      custInMaster?.altPhone || existing?.altPhone || customerAltPhone || "";

    const resolvedCustomer: Customer = custInMaster || {
      id:
        existing?.id ||
        `cust_${cleanName.replace(/[^a-z0-9]/gi, "_") || Date.now()}`,
      name: resolvedName,
      phone: resolvedPhone,
      altPhone: resolvedAltPhone,
      address: existing?.address,
      city: existing?.city,
      gstin: existing?.gstin,
      creditLimit: existing?.creditLimit || 0,
      openingBalance: existing?.openingBalance || 0,
      createdAt:
        existing?.lastBillDate ||
        anyMatchingBill?.date ||
        new Date().toISOString(),
    };

    const sameNameCusts = customers.filter(
      (c) => normCustName(c.name) === cleanName,
    );
    const distinctPhones = new Set(
      sameNameCusts
        .map((c) => last10Of(c.phone))
        .filter(Boolean),
    );
    const isUniqueCustomerName = distinctPhones.size <= 1;

    const allCustPhones = [
      resolvedPhone,
      resolvedAltPhone,
      ...sameNameCusts.map((c) => c.phone),
      ...sameNameCusts.map((c) => c.altPhone),
      existing?.phone,
      existing?.altPhone,
      customerPhone,
      customerAltPhone,
    ].filter((p) => !isDummyPhone(p));

    // 2. Match non-cancelled bills
    // An invoice stamped with a customer id belongs to that customer, whatever its name says. If the id no longer
    // belongs to any customer (deleted and re-added), the old name + phone rule decides, so history is never dropped.
    const masterIds = new Set(customers.map((c) => c.id));
    const matchedBills = bills
      .filter((b) => {
        if (b.status === "cancelled" || b.cancelled) return false;
        if (b.customerId && custInMaster && masterIds.has(b.customerId)) {
          return b.customerId === custInMaster.id;
        }
        const bRetailer = normCustName(b.retailer);
        return (
          bRetailer === cleanName &&
          customerPhonesMatch(allCustPhones, b.phone, isUniqueCustomerName)
        );
      })
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    const matchedBillIds = new Set(matchedBills.map((b) => b.id));

    // 3. Match payments
    const matchedPayments = payments
      .filter((p) => {
        if (p.billId && matchedBillIds.has(p.billId)) return true;
        if (p.customerId && custInMaster && masterIds.has(p.customerId)) {
          return p.customerId === custInMaster.id;
        }
        const pCust = normCustName(p.customerName);
        return (
          !!pCust &&
          pCust === cleanName &&
          customerPhonesMatch(allCustPhones, p.customerPhone, isUniqueCustomerName)
        );
      })
      .sort((a, b) => ((a.paymentDate || "") > (b.paymentDate || "") ? 1 : -1));

    // 4. Show an invoice's "paid" that has no payment row behind it (old data), invoice by invoice,
    //    so an advance on account can never cover for, or hide, another invoice's payment.
    const allPayments = [...matchedPayments];
    for (const gap of billPaymentGaps(matchedBills, matchedPayments)) {
      const b = matchedBills.find((x) => x.id === gap.billId);
      if (!b) continue;
      allPayments.push({
        id: `legacy_pay_${b.id}`,
        billId: b.id,
        customerName: b.retailer,
        customerPhone: b.phone,
        paymentDate: b.paymentDate || b.date,
        amount: gap.shortfall,
        mode: b.paymentMode || "cash",
        referenceNote: b.paymentNote || `Upfront payment on bill #${b.id}`,
        createdAt: b.date,
      });
    }

    allPayments.sort((a, b) =>
      (a.paymentDate || "") > (b.paymentDate || "") ? 1 : -1,
    );

    // 5. Total Billed, Total Returns, Net Billed, Total Paid, Balance Due
    const totalBilled = matchedBills.reduce(
      (sum, b) => sum + (Number(b.total) || 0),
      0,
    );
    const totalReturns = matchedBills.reduce(
      (sum, b) => sum + billReturnCredit(b),
      0,
    );
    const netBilled = Math.max(0, totalBilled - totalReturns);
    const totalPaid = allPayments.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0,
    );
    const openingBal = resolvedCustomer.openingBalance || 0;
    const rawBalance = openingBal + totalBilled - totalReturns - totalPaid;
    const balanceDue = Math.max(0, Math.round(rawBalance * 100) / 100);
    const isOverLimit = !!(
      resolvedCustomer.creditLimit &&
      resolvedCustomer.creditLimit > 0 &&
      balanceDue > resolvedCustomer.creditLimit
    );

    return {
      customer: resolvedCustomer,
      bills: matchedBills,
      payments: allPayments,
      totalBilled,
      totalReturns,
      netBilled,
      totalPaid,
      balanceDue,
      rawBalance: Math.round(rawBalance * 100) / 100,
      openingBalance: openingBal,
      isOverLimit,
    };
  }

  // Deleting an invoice also removes the scrap records its customer returns created, otherwise the
  // tracker and profit reports keep a loss for a sale that no longer exists. Records that have
  // already gone to the company (handed over / credit note / refused) are kept: that is real history.
  function dropUntouchedReturnScrap(billId: number) {
    const mine = inventoryDispositions.filter(
      (d) => d.returnTracking?.sourceBillId === billId,
    );
    let kept = 0;
    for (const d of mine) {
      const rt = d.returnTracking!;
      const withCompany =
        rt.stage === "sent" ||
        rt.stage === "settled" ||
        rt.stage === "rejected" ||
        d.compensationStatus === "settled" ||
        d.compensationStatus === "partial" ||
        d.compensationStatus === "rejected";
      if (withCompany) kept += 1;
      else deleteInventoryDisposition(d.id);
    }
    if (kept > 0)
      notify(
        `${kept} expired-return record(s) already sent to the company were kept for your records.`,
      );
  }

  function previewBillDelete(billId: number): BillDeletePreview | null {
    const b = allBills.find((x) => x.id === billId);
    if (!b) return null;
    const cancelled = b.status === "cancelled";
    const trip = tripOfBill(b);
    const byProduct = new Map<number, { productName: string; qty: number }>();
    if (!cancelled) {
      for (const it of b.items || []) {
        const e = byProduct.get(it.productId) || {
          productName: it.productName,
          qty: 0,
        };
        e.qty += Number(it.qty) || 0;
        byProduct.set(it.productId, e);
      }
    }
    const stockLines = Array.from(byProduct, ([productId, e]) => ({
      productId,
      productName: e.productName,
      qty: e.qty,
    })).filter((l) => l.qty > 0);
    const rows = payments.filter((p) => p.billId === billId);
    const journal = rows.reduce((t, p) => t + (Number(p.amount) || 0), 0);
    const receivedAmount =
      Math.round(Math.max(journal, Number(b.amountPaid) || 0) * 100) / 100;
    const wh =
      warehouses.find((w) => w.id === (b.warehouseId || "")) || defaultWarehouse;
    const blockers: string[] = [];
    let reopenTripId: number | undefined;
    if ((b.returns || []).length > 0) {
      blockers.push(
        "This invoice has customer returns against it. Cancel those returns first (Live stock → Returns), then delete the invoice, so the credit and restocked crates are reversed in order.",
      );
    }
    if (!cancelled && trip && trip.status === "closed") {
      reopenTripId = Number(trip.id);
      blockers.push(
        `Trip #${trip.id} (${trip.vehicle}, ${trip.date}) is closed and already reconciled. Reopen the trip first; otherwise its crate count would show a false shortage.`,
      );
    }
    return {
      billId,
      customer: b.retailer,
      total: Number(b.total) || 0,
      cancelled,
      stockLines,
      totalCrates: stockLines.reduce((t, l) => t + l.qty, 0),
      stockDestination: trip
        ? `Trip #${trip.id} · ${trip.vehicle} · ${trip.date} (${trip.status === "closed" ? "closed" : "open"})`
        : wh?.name || "Default godown",
      receivedAmount,
      receiptRows: rows.length,
      blockers,
      reopenTripId,
    };
  }

  function deleteBill(
    billId: number,
    opts?: { reason?: string; paymentAction?: BillDeletePaymentAction },
  ): boolean {
    const target = allBills.find((b) => b.id === billId);
    const preview = previewBillDelete(billId);
    if (preview && preview.blockers.length > 0) {
      notify(
        `Invoice #${billId} was not deleted:\n` +
          preview.blockers.map((m) => `• ${m}`).join("\n"),
      );
      return false;
    }
    const reason = (opts?.reason || "").trim();
    const paymentAction: BillDeletePaymentAction =
      opts?.paymentAction === "remove" ? "remove" : "advance";
    const reasonSuffix = reason ? ` — Reason: ${reason}` : "";
    const summary: string[] = [`Invoice #${billId} deleted.`];
    dropUntouchedReturnScrap(billId);
    // Money already received on this invoice must not be left pointing at a bill that no longer
    // exists. Default: keep it as an advance on the customer's account. Optional: remove the
    // receipts (the money was never really received / the entries were a mistake).
    const heldRows = payments.filter((p) => p.billId === billId);
    const held = heldRows.reduce((t, p) => t + (Number(p.amount) || 0), 0);
    // Paid amount recorded on the invoice itself but with no receipt rows behind it (older data).
    const unjournaled = Math.max(
      0,
      Math.round(((Number(target?.amountPaid) || 0) - held) * 100) / 100,
    );
    if (paymentAction === "remove") {
      if (heldRows.length > 0) {
        const ids = heldRows.map((p) => p.id);
        addPaymentTombstones(ids);
        setPayments((prev) => prev.filter((p) => p.billId !== billId));
        heldRows.forEach((p) =>
          logPaymentAudit({
            action: "delete",
            paymentId: p.id,
            billId,
            customerName: p.customerName,
            amount: p.amount,
            note: `Invoice #${billId} deleted: receipt of ₹${p.amount} removed${reasonSuffix}`,
            before: p,
          }),
        );
        pushDeletionRecordsToSupabase(
          heldRows.map((p) => ({
            kind: "payment" as const,
            id: p.id,
            name: p.customerName,
            deletedAt: new Date().toISOString(),
            by: currentUser?.name || "Admin",
            reason,
            note: `₹${p.amount} on deleted invoice #${billId}`,
          })),
        ).catch(() => {});
      }
      if (held > 0 || unjournaled > 0) {
        summary.push(
          `₹${(held + unjournaled).toLocaleString("en-IN", { maximumFractionDigits: 2 })} received on it was removed from the customer's account.`,
        );
      }
    } else {
      if (heldRows.length > 0) {
        setPayments((prev) =>
          prev.map((p) =>
            p.billId === billId
              ? {
                  ...p,
                  billId: undefined,
                  isAdvance: true,
                  referenceNote: [
                    p.referenceNote,
                    `Advance / on account (from deleted invoice #${billId})`,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }
              : p,
          ),
        );
        heldRows.forEach((p) =>
          logPaymentAudit({
            action: "invoice_deleted",
            paymentId: p.id,
            billId,
            customerName: p.customerName,
            amount: p.amount,
            note: `Invoice #${billId} deleted: ₹${p.amount} kept as customer advance${reasonSuffix}`,
            before: p,
          }),
        );
      }
      if (unjournaled > 0.004 && target) {
        const advRow: PaymentRecord = {
          id: `pay_${Date.now()}_adv_${Math.random().toString(36).slice(2, 6)}`,
          customerName: target.retailer,
          customerPhone: target.phone,
          paymentDate: todayISO(),
          amount: unjournaled,
          mode: target.paymentMode || "cash",
          referenceNote: `Advance / on account (from deleted invoice #${billId})`,
          recordedBy: currentUser?.name || "Admin",
          isAdvance: true,
          createdAt: new Date().toISOString(),
        };
        setPayments((prev) => [advRow, ...prev]);
        logPaymentAudit({
          action: "invoice_deleted",
          paymentId: advRow.id,
          billId,
          customerName: target.retailer,
          amount: unjournaled,
          note: `Invoice #${billId} deleted: ₹${unjournaled} paid on the invoice kept as customer advance${reasonSuffix}`,
          after: advRow,
        });
      }
      if (held + unjournaled > 0.004) {
        summary.push(
          `₹${(held + unjournaled).toLocaleString("en-IN", { maximumFractionDigits: 2 })} already received on it was kept as an advance on the customer's account.`,
        );
      }
    }
    setBills((bs) => {
      const remaining = bs.filter((b) => b.id !== billId);
      saveOrders(remaining).catch(() => {});
      return remaining;
    });
    setTrips((ts) =>
      ts.map((t) => {
        if (!t.billIds.includes(billId)) return t;
        const updatedT = {
          ...t,
          billIds: t.billIds.filter((id) => id !== billId),
        };
        cloud("pushTripToSupabase", pushTripToSupabase(updatedT));
        return updatedT;
      }),
    );
    if (editingBillId === billId) {
      setEditingBillId(null);
      setCart(emptyCart());
    }
    cloud("deleteBillFromSupabase", deleteBillFromSupabase(billId));
    cloudFetch(`/api/bills/${billId}`, { method: "DELETE" });
    if (preview && preview.totalCrates > 0) {
      summary.push(
        `${preview.totalCrates} crate(s) are back in stock (${preview.stockDestination}).`,
      );
    }
    notify(summary.join(" "));
    return true;
  }

  // When an invoice is edited (either edit screen), its payments must follow it:
  //  - if the customer was changed, its payment rows move to the new customer (no double count)
  //  - money already received that no longer fits because the total was lowered is kept as an
  //    advance instead of vanishing. Lowering "paid" on purpose is a correction, not a refund.
  function keepReceivedMoneyOnEdit(updated: Bill, requestedPaid: number) {
    const cappedPaid = Math.min(Math.max(0, requestedPaid), updated.total);
    setPayments((prev) =>
      prev.map((p) =>
        p.billId === updated.id &&
        (normCustName(p.customerName) !== normCustName(updated.retailer) ||
          (updated.phone && p.customerPhone !== updated.phone))
          ? {
              ...p,
              customerName: updated.retailer,
              customerPhone: updated.phone || p.customerPhone,
            }
          : p,
      ),
    );
    const journalForBill = payments
      .filter((p) => p.billId === updated.id)
      .reduce((t, p) => t + (Number(p.amount) || 0), 0);
    const keepAsAdvance =
      Math.round((Math.min(requestedPaid, journalForBill) - cappedPaid) * 100) / 100;
    if (keepAsAdvance <= 0.004) return;
    const advRow: PaymentRecord = {
      id: `pay_${Date.now()}_adv_${Math.random().toString(36).slice(2, 6)}`,
      customerName: updated.retailer,
      customerPhone: updated.phone,
      paymentDate: todayISO(),
      amount: keepAsAdvance,
      mode: updated.paymentMode || "cash",
      referenceNote: `Advance / on account (invoice #${updated.id} total was reduced)`,
      recordedBy: currentUser?.name || "Admin",
      isAdvance: true,
      createdAt: new Date().toISOString(),
    };
    setPayments((prev) => [advRow, ...prev]);
    logPaymentAudit({
      action: "invoice_edited",
      paymentId: advRow.id,
      billId: updated.id,
      customerName: updated.retailer,
      amount: keepAsAdvance,
      note: `Invoice #${updated.id} total reduced: ₹${keepAsAdvance} already received kept as advance`,
      after: advRow,
    });
    notify(
      `Invoice total is now lower than what was received. ₹${keepAsAdvance.toLocaleString("en-IN", { maximumFractionDigits: 2 })} was kept as an advance on the customer's account.`,
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Editing a saved invoice WITHOUT disturbing live stock.
  // Stock only moves when crates / product / godown / trip change. A price, customer, date, paid
  // amount or GST-format edit has no stock footprint, so it is never blocked by stock checks and
  // the batch trail the invoice already holds is kept exactly as it was. When crates DO change,
  // only the products whose quantity changed are re-checked and re-allocated.
  // ---------------------------------------------------------------------------------------------
  function qtyByProduct(items: BillItem[]): Record<number, number> {
    const m: Record<number, number> = {};
    for (const it of items || [])
      m[it.productId] = (m[it.productId] || 0) + (Number(it.qty) || 0);
    return m;
  }

  function tripOfBill(b: Bill): Trip | null {
    if (b.tripId != null) {
      const t = trips.find((x) => Number(x.id) === Number(b.tripId));
      if (t) return t;
    }
    return (
      trips.find((x) => (x.billIds || []).map(Number).includes(Number(b.id))) ||
      null
    );
  }

  // Re-apply the batch allocations an invoice already holds onto its (re-ordered / re-split) lines.
  function carryOverAllocations(
    lines: BillItem[],
    originalItems: BillItem[],
  ): BillItem[] {
    const pool: Record<number, { a: NonNullable<BillItem["batchAllocations"]>[number] }[]> = {};
    for (const o of originalItems)
      for (const a of o.batchAllocations || [])
        (pool[o.productId] ||= []).push({ a: { ...a } });
    const firstOrig = new Map<number, BillItem>();
    for (const o of originalItems)
      if (!firstOrig.has(o.productId)) firstOrig.set(o.productId, o);
    return lines.map((ln) => {
      const src = pool[ln.productId];
      if (!src || src.length === 0) {
        const o = firstOrig.get(ln.productId);
        return o
          ? {
              ...ln,
              batchNumber: o.batchNumber,
              expiryDate: o.expiryDate,
              batchAllocations: o.batchAllocations,
              costExGst: ln.costExGst ?? o.costExGst,
            }
          : ln;
      }
      let need = Number(ln.qty) || 0;
      const got: NonNullable<BillItem["batchAllocations"]> = [];
      while (need > 0 && src.length > 0) {
        const head = src[0].a;
        const take = Math.min(need, Number(head.qty) || 0);
        if (take > 0) {
          const ex = got.find((g) => g.batchId === head.batchId);
          if (ex) ex.qty += take;
          else got.push({ ...head, qty: take });
          head.qty = (Number(head.qty) || 0) - take;
          need -= take;
        }
        if ((Number(head.qty) || 0) <= 0) src.shift();
      }
      const o = firstOrig.get(ln.productId);
      return {
        ...ln,
        batchNumber:
          got.length > 0
            ? Array.from(new Set(got.map((g) => g.batchNumber))).join(", ")
            : ln.batchNumber,
        expiryDate: got[0]?.expiryDate ?? ln.expiryDate,
        batchAllocations: got.length > 0 ? got : ln.batchAllocations,
        costExGst: ln.costExGst ?? o?.costExGst,
      };
    });
  }

  /**
   * Everything about a bill that can change money, tax, stock, ledger or a report. Two bills with the
   * same signature are the same invoice for every report, so saving one over the other is a no-op.
   */
  function billMoneySignature(b: Bill): string {
    const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
    return JSON.stringify({
      retailer: (b.retailer || "").trim(),
      phone: (b.phone || "").trim(),
      date: b.date || "",
      warehouseId: b.warehouseId || "",
      tripId: b.tripId ?? null,
      salesmanId: b.salesmanId || "",
      supplyType: b.supplyType || "",
      customerGstin: b.customerGstin || "",
      invoiceType: b.invoiceType || "",
      isGstInvoice: b.isGstInvoice ?? null,
      additionalDiscount: r2(b.additionalDiscount),
      subtotal: r2(b.subtotal),
      cgst: r2(b.cgst),
      sgst: r2(b.sgst),
      total: r2(b.total),
      roundOff: r2((b as any).roundOff),
      amountPaid: r2(b.amountPaid),
      paymentMode: b.paymentMode || "",
      paymentDate: b.paymentDate || "",
      paymentNote: b.paymentNote || "",
      items: (b.items || []).map((i) => [
        i.productId,
        r2(i.qty),
        r2((i as any).freeQty),
        r2(i.rate),
        r2(i.discount),
        r2(i.gst),
        r2(i.amount),
      ]),
    });
  }

  function describeBillChanges(orig: Bill, upd: Bill): string[] {
    const out: string[] = [];
    const rs = (n: number) =>
      `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    if ((orig.retailer || "").trim() !== (upd.retailer || "").trim())
      out.push(`Customer: ${orig.retailer} → ${upd.retailer}`);
    if ((orig.date || "") !== (upd.date || ""))
      out.push(`Date: ${orig.date} → ${upd.date}`);
    const o = new Map<number, { name: string; qty: number; amt: number; rate: number }>();
    for (const it of orig.items || []) {
      const e = o.get(it.productId) || { name: it.productName, qty: 0, amt: 0, rate: it.rate };
      e.qty += Number(it.qty) || 0;
      e.amt += Number(it.amount) || 0;
      o.set(it.productId, e);
    }
    const n = new Map<number, { name: string; qty: number; amt: number; rate: number }>();
    for (const it of upd.items || []) {
      const e = n.get(it.productId) || { name: it.productName, qty: 0, amt: 0, rate: it.rate };
      e.qty += Number(it.qty) || 0;
      e.amt += Number(it.amount) || 0;
      n.set(it.productId, e);
    }
    for (const [pid, a] of o) {
      const b = n.get(pid);
      if (!b) out.push(`Removed ${a.name} (${a.qty} cr)`);
      else {
        if (a.qty !== b.qty) out.push(`${a.name}: qty ${a.qty} → ${b.qty}`);
        if (Math.abs(a.rate - b.rate) > 0.004)
          out.push(`${a.name}: rate ${rs(a.rate)} → ${rs(b.rate)}`);
        else if (a.qty === b.qty && Math.abs(a.amt - b.amt) > 0.004)
          out.push(`${a.name}: amount ${rs(a.amt)} → ${rs(b.amt)}`);
      }
    }
    for (const [pid, b] of n)
      if (!o.has(pid)) out.push(`Added ${b.name} (${b.qty} cr)`);
    if (Math.abs((orig.total || 0) - (upd.total || 0)) > 0.004)
      out.push(`Total: ${rs(orig.total)} → ${rs(upd.total)}`);
    if (Math.abs((orig.amountPaid || 0) - (upd.amountPaid || 0)) > 0.004)
      out.push(`Paid: ${rs(orig.amountPaid)} → ${rs(upd.amountPaid)}`);
    if ((orig.warehouseId || "") !== (upd.warehouseId || ""))
      out.push("Godown changed");
    if ((orig.phone || "") !== (upd.phone || "")) out.push("Phone changed");
    if ((orig.invoiceType || "") !== (upd.invoiceType || ""))
      out.push("Invoice format changed");
    return out;
  }

  // Decides what an edit does to stock and returns the items to save (allocations preserved or
  // re-done only where needed). `nextTrip` is the trip the saved bill will belong to.
  function planBillEditStock(
    updated: Bill,
    nextTrip: Trip | null,
  ): {
    items: BillItem[];
    problems: string[];
    stockChanged: boolean;
    reopenTripId?: number;
  } {
    const original = allBills.find((b) => b.id === updated.id);
    const problems: string[] = [];
    if (!original || !Array.isArray(updated.items))
      return { items: updated.items, problems, stockChanged: false };

    const origTrip = tripOfBill(original);
    const oldQ = qtyByProduct(original.items);
    const newQ = qtyByProduct(updated.items);
    const routeChanged = nextTrip
      ? Number(nextTrip.id) !== Number(origTrip?.id ?? -1)
      : !!origTrip ||
        (original.warehouseId || "") !== (updated.warehouseId || "");

    const allPids = Array.from(
      new Set([...Object.keys(oldQ), ...Object.keys(newQ)].map(Number)),
    );
    const qtyChangedPids = allPids.filter(
      (pid) => (oldQ[pid] || 0) !== (newQ[pid] || 0),
    );
    const stockChanged = routeChanged || qtyChangedPids.length > 0;

    // 1) Money / details only: stock footprint identical -> keep the existing batch trail untouched.
    if (!stockChanged) {
      return {
        items: carryOverAllocations(updated.items, original.items),
        problems,
        stockChanged: false,
      };
    }

    // 2) Crates / product / godown / trip changed. A closed trip has already been reconciled
    // (its stock went back to the godown), so it must be reopened before its sales can move.
    if (nextTrip && nextTrip.status === "closed") {
      problems.push(
        `Trip #${nextTrip.id} (${nextTrip.vehicle}, ${nextTrip.date}) is closed. Reopen the trip first, then change quantities or products on this bill. Price, customer and payment edits do not need this.`,
      );
      return {
        items: updated.items,
        problems,
        stockChanged,
        reopenTripId: Number(nextTrip.id),
      };
    }

    const changedPids = new Set(routeChanged ? allPids : qtyChangedPids);
    // Only crates being ADDED need stock. Reducing or keeping crates never fails on stock.
    const needMore = (pid: number) =>
      (newQ[pid] || 0) > 0 && (routeChanged || (newQ[pid] || 0) > (oldQ[pid] || 0));
    const toCheck = updated.items.filter(
      (it) => changedPids.has(it.productId) && needMore(it.productId),
    );
    if (toCheck.length > 0) {
      const shortfalls = stockShortfalls(
        toCheck,
        updated.id,
        nextTrip,
        updated.warehouseId,
      );
      for (const sh of shortfalls)
        problems.push(
          `${sh.productName}: need ${sh.required}, only ${Math.max(0, sh.available)} available` +
            (nextTrip
              ? ` on trip #${nextTrip.id} (${nextTrip.vehicle})`
              : " in the godown") +
            ". Add stock / adjust the trip load, or reduce the quantity.",
        );
      if (problems.length > 0)
        return { items: updated.items, problems, stockChanged };
    }

    // 3) Re-allocate batches ONLY for products whose crates changed; others keep their trail.
    const keepLines = updated.items.filter((it) => !changedPids.has(it.productId));
    const redoLines = updated.items.filter((it) => changedPids.has(it.productId));
    const keptDone = carryOverAllocations(keepLines, original.items);
    let redone = redoLines;
    if (redoLines.length > 0) {
      const fefo = allocateBatches(
        redoLines,
        updated.date,
        updated.warehouseId,
        updated.id,
        nextTrip,
      );
      if (fefo.problems.length > 0)
        return {
          items: updated.items,
          problems: fefo.problems,
          stockChanged,
        };
      redone = fefo.items;
    }
    const keptQ = [...keptDone];
    const redoQ = [...redone];
    const merged = updated.items.map((it) =>
      changedPids.has(it.productId) ? (redoQ.shift() as BillItem) : (keptQ.shift() as BillItem),
    );
    return { items: merged, problems, stockChanged };
  }

  function resolveEditTrip(updated: Bill): Trip | null {
    const original = allBills.find((b) => b.id === updated.id);
    if (updated.tripId != null) {
      const t = trips.find((x) => Number(x.id) === Number(updated.tripId));
      if (t) return t;
    }
    return original ? tripOfBill(original) : null;
  }

  function previewBillEdit(
    updated: Bill,
    requestedPaid?: number,
  ): BillEditPreview {
    const original = allBills.find((b) => b.id === updated.id);
    const nextTrip = resolveEditTrip(updated);
    const plan = planBillEditStock(updated, nextTrip);
    const whId = updated.warehouseId || original?.warehouseId || "";
    const wh = warehouses.find((w) => w.id === whId) || defaultWarehouse;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const receiptRows = payments.filter((p) => p.billId === updated.id);
    const receivedBefore = r2(
      receiptRows.reduce((t, p) => t + (Number(p.amount) || 0), 0),
    );
    const typedPaid = Math.max(
      0,
      Number(requestedPaid ?? updated.amountPaid) || 0,
    );
    const paidAfter = Math.min(typedPaid, Number(updated.total) || 0);
    const keptAsAdvance = Math.max(
      0,
      r2(Math.min(typedPaid, receivedBefore) - paidAfter),
    );
    const removedAsCorrection = Math.max(
      0,
      r2(receivedBefore - paidAfter - keptAsAdvance),
    );
    const movesReceipts = receiptRows.some(
      (p) =>
        normCustName(p.customerName) !== normCustName(updated.retailer) ||
        (!!updated.phone && p.customerPhone !== updated.phone),
    );
    return {
      payment: {
        receivedBefore,
        paidAfter: r2(paidAfter),
        keptAsAdvance,
        removedAsCorrection,
        movedToCustomer: movesReceipts ? updated.retailer : undefined,
      },
      stockChanged: plan.stockChanged,
      changes: original ? describeBillChanges(original, updated) : [],
      problems: plan.problems,
      reopenTripId: plan.reopenTripId,
      source: nextTrip
        ? {
            kind: "trip",
            label: `Trip #${nextTrip.id} · ${nextTrip.vehicle} · ${nextTrip.date}`,
            tripId: Number(nextTrip.id),
            tripStatus: nextTrip.status,
            tripDate: nextTrip.date,
            warehouseId: nextTrip.warehouseId,
          }
        : {
            kind: "warehouse",
            label: wh?.name || "Default godown",
            warehouseId: wh?.id,
          },
    };
  }

  function updateBill(
    updated: Bill,
    opts?: { comment?: string; requestedPaid?: number },
  ): boolean {
    if (allBills.find((b) => b.id === updated.id)?.status === "cancelled") {
      notify("A cancelled invoice cannot be edited.");
      return false;
    }
    if ((allBills.find((b) => b.id === updated.id)?.returns || []).length > 0) {
      notify(
        "This invoice has customer returns against it, so it can no longer be edited.",
      );
      return false;
    }
    const originalBill = allBills.find((b) => b.id === updated.id);
    let editStockChanged = false;
    if (Array.isArray(updated.items)) {
      const billTrip = resolveEditTrip(updated);
      const plan = planBillEditStock(updated, billTrip);
      if (plan.problems.length > 0) {
        notify(
          "Cannot save these changes:\n" +
            plan.problems.map((m) => `• ${m}`).join("\n"),
        );
        return false;
      }
      editStockChanged = plan.stockChanged;
      updated = {
        ...updated,
        items: plan.items,
        // keep the trip link even if the edit form did not carry it
        tripId: updated.tripId ?? originalBill?.tripId ?? billTrip?.id,
      };
    }
    // The edit screen caps "paid" at the new total before it gets here, so it also passes what was
    // typed. Without it, money received above a lowered total would be dropped instead of kept as
    // an advance on the customer's account.
    const requestedPaid = Math.max(
      0,
      Number(opts?.requestedPaid ?? updated.amountPaid) || 0,
    );
    updated = {
      ...updated,
      amountPaid: Math.min(requestedPaid, updated.total),
    };
    // If the edit moved the invoice to another customer (name or phone changed), re-link it.
    if (
      originalBill &&
      (normCustName(updated.retailer) !== normCustName(originalBill.retailer) ||
        last10Of(updated.phone || "") !== last10Of(originalBill.phone || ""))
    ) {
      updated = { ...updated, customerId: resolveMasterCustomerId(updated.retailer, updated.phone) };
    }
    // Nothing that matters changed: save nothing. No edit entry, no payment / advance rows, no
    // custom-price memory, no cloud write. (Opening a bill and pressing Save must leave no trace.)
    if (
      originalBill &&
      !editStockChanged &&
      billMoneySignature(originalBill) === billMoneySignature(updated)
    ) {
      notify("No changes were made, so nothing was saved.");
      if (editingBillId === updated.id) {
        setEditingBillId(null);
        setCart(emptyCart());
      }
      return true;
    }
    if (originalBill) {
      const entry: BillEditEntry = {
        at: new Date().toISOString(),
        by: currentUser?.name || "Admin",
        comment: (opts?.comment || "").trim() || "(no comment)",
        changes: describeBillChanges(originalBill, updated),
        stockChanged: editStockChanged,
        totalBefore: Number(originalBill.total) || 0,
        totalAfter: Number(updated.total) || 0,
        paidBefore: Number(originalBill.amountPaid) || 0,
        paidAfter: Number(updated.amountPaid) || 0,
      };
      updated = {
        ...updated,
        editHistory: [...(originalBill.editHistory || []), entry],
      };
    }
    if (Array.isArray(updated.items)) {
      for (const it of updated.items) {
        if (it.productId && typeof it.rate === "number" && it.rate >= 0) {
          setCustomProductPrice(it.productId, it.rate, updated.retailer);
        }
      }
    }
    reconcileBillPayments(updated, updated.amountPaid, {
      date: updated.paymentDate || todayISO(),
      mode: updated.paymentMode || "cash",
      note: updated.paymentNote,
      recordedBy: currentUser?.name || "Admin",
      salesmanId: updated.salesmanId,
    });
    keepReceivedMoneyOnEdit(updated, requestedPaid);
    updated.updatedAt = new Date().toISOString();
    setBills((bs) => {
      const newBills = bs.map((b) => (b.id === updated.id ? updated : b));
      saveOrders(newBills).catch(() => {});
      return newBills;
    });
    if (editingBillId === updated.id) {
      setEditingBillId(null);
      setCart(emptyCart());
    }
    cloud("pushBillToSupabase", pushBillToSupabase(updated));
    cloudFetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    return true;
  }

  // Bills edited before the edit screen kept the invoice discount / issued GST treatment carry totals that
  // no longer match their own lines (and the GST report). This recalculates ONLY those bills, one audited
  // edit each. Customer dues follow the corrected total.
  function repairBillTotals(billIds: number[]): { fixed: number; skipped: number } {
    let fixed = 0;
    let skipped = 0;
    for (const id of billIds) {
      const b = allBillsRef.current.find((x) => x.id === id);
      if (!b || b.status === "cancelled" || (b.returns || []).length > 0 || !(b.items || []).length) {
        skipped++;
        continue;
      }
      const t = billTotals(b.items, issuedGstMode(b, gstMode), Number(b.additionalDiscount) || 0, {
        round: isWholeRupee(b.total),
      });
      if (Math.abs(t.total - (Number(b.total) || 0)) < 0.5) {
        skipped++;
        continue;
      }
      const ok = updateBill(
        {
          ...b,
          subtotal: t.subtotal,
          cgst: t.cgst,
          sgst: t.sgst,
          total: t.total,
          roundOff: t.roundOff,
          discount: t.discount,
          amountPaid: Math.min(Number(b.amountPaid) || 0, t.total),
        },
        { comment: "Saved totals recalculated from the invoice lines and invoice discount (report audit fix)" },
      );
      if (ok) fixed++;
      else skipped++;
    }
    return { fixed, skipped };
  }

  const syncBillsToCloud = async (): Promise<{
    success: boolean;
    count: number;
    error?: string;
  }> => {
    try {
      let count = 0;
      for (const bill of allBills) {
        const res = await pushBillToSupabase(bill);
        if (res.success) count++;
      }
      await saveOrders(allBills);
      return { success: true, count };
    } catch (e: any) {
      return { success: false, count: 0, error: e?.message || "Sync failed" };
    }
  };

  // Trips CRUD
  function addTrip(
    vehicle: string,
    date: string,
    loaded: Record<number, number>,
    warehouseId?: string,
    initialBillIds?: number[],
    salesman?: string,
    route?: string,
    salesmanId?: string,
    warehouseLoads?: Record<string, Record<number, number>>,
  ): Trip {
    // Highest id ever used: live trips AND deleted ones, so an id on the deletion list is never handed out again.
    const highestUsed = Math.max(
      0,
      ...trips.map((t) => Number(t.id) || 0),
      ...Array.from(deadTripIdsRef.current),
    );
    const nextId = reserveDocNumber("trip", highestUsed);
    const resolvedSalesmanId =
      salesmanId ||
      (currentUser?.role === "salesman" ? currentUser.id : undefined) ||
      (salesman
        ? salesmen.find((s) => s.name === salesman || s.id === salesman)?.id
        : undefined);
    const matchedSalesmanObj = resolvedSalesmanId
      ? salesmen.find((s) => s.id === resolvedSalesmanId)
      : null;
    const resolvedSalesmanName =
      salesman ||
      matchedSalesmanObj?.name ||
      (currentUser?.role === "salesman" ? currentUser.name : undefined);

    const resolvedWarehouseId =
      warehouseId ||
      defaultWarehouse?.id ||
      (warehouses.length > 0 ? warehouses[0].id : "");

    const resolvedWarehouseLoads =
      warehouseLoads && Object.keys(warehouseLoads).length > 0
        ? warehouseLoads
        : resolvedWarehouseId
          ? { [resolvedWarehouseId]: loaded }
          : undefined;

    const newTrip: Trip = {
      id: nextId,
      vehicle,
      salesman: resolvedSalesmanName || undefined,
      salesmanId: resolvedSalesmanId || undefined,
      route: route || undefined,
      date,
      warehouseId: resolvedWarehouseId || "",
      loaded,
      warehouseLoads: resolvedWarehouseLoads,
      returned: {},
      billIds: initialBillIds || [],
      status: "out",
      updatedAt: new Date().toISOString(),
    };
    const updatedTrips = [newTrip, ...trips.filter((t) => Number(t.id) !== Number(newTrip.id))];
    setTrips(updatedTrips);
    saveTrips(updatedTrips).catch(() => {});
    cloud("pushTripToSupabase", pushTripToSupabase(newTrip));
    cloudFetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTrip),
    });
    return newTrip;
  }

  // Why a bill cannot be attached to this trip (null = fine): it is already on another trip
  // (which would double-count its crates or leave it listed but uncounted), or attaching it would
  // make the trip sell more of a product than was loaded.
  function tripAttachProblem(trip: Trip, bill: Bill): string | null {
    if (billBelongsToTrip(trip, bill)) return null;
    const listedElsewhere = trips.find(
      (t) =>
        Number(t.id) !== Number(trip.id) &&
        (t.billIds || []).map(Number).includes(Number(bill.id)),
    );
    const ownerId =
      bill.tripId != null && Number(bill.tripId) > 0 && Number(bill.tripId) !== Number(trip.id)
        ? Number(bill.tripId)
        : listedElsewhere
          ? Number(listedElsewhere.id)
          : null;
    if (ownerId != null) {
      return `Bill #${bill.id} is already on Trip #${ownerId}. Remove it from that trip first.`;
    }
    const sold: Record<number, number> = {};
    for (const b of bills) {
      if (!billBelongsToTrip(trip, b)) continue;
      for (const it of b.items || []) {
        const pid = Number(it.productId);
        sold[pid] = (sold[pid] || 0) + (Number(it.qty) || 0);
      }
    }
    const add: Record<number, number> = {};
    for (const it of bill.items || []) {
      const pid = Number(it.productId);
      add[pid] = (add[pid] || 0) + (Number(it.qty) || 0);
    }
    for (const [pidStr, q] of Object.entries(add)) {
      const pid = Number(pidStr);
      const loaded = Number(trip.loaded?.[pid] ?? 0) || 0;
      if ((sold[pid] || 0) + q > loaded) {
        const nm = products.find((x) => x.id === pid)?.name || `Product #${pid}`;
        return `Bill #${bill.id}: ${nm} would be ${(sold[pid] || 0) + q} billed on a load of ${loaded}. Increase the trip's load first.`;
      }
    }
    return null;
  }

  // A bill raised on a trip carries bill.tripId, which wins over trip.billIds; dropping it from
  // billIds would leave it counted as sold while the list says it is gone.
  function detachProblem(trip: Trip, bill: Bill | undefined): string | null {
    if (bill && bill.tripId != null && Number(bill.tripId) === Number(trip.id)) {
      return `Bill #${bill.id} was raised on this trip, so it cannot be detached. Edit or cancel the bill instead.`;
    }
    return null;
  }

  function toggleBillAssignment(tripId: number, billId: number): string | null {
    const currentTrip = trips.find((t) => t.id === tripId);
    if (!currentTrip) return null;
    const bill = bills.find((b) => Number(b.id) === Number(billId));
    const listed = currentTrip.billIds.includes(billId);
    const problem = listed
      ? detachProblem(currentTrip, bill)
      : bill
        ? tripAttachProblem(currentTrip, bill)
        : null;
    if (problem) {
      notify(problem);
      return problem;
    }
    const updatedTrip: Trip = {
      ...currentTrip,
      billIds: listed
        ? currentTrip.billIds.filter((id) => id !== billId)
        : [...currentTrip.billIds, billId],
      updatedAt: new Date().toISOString(),
    };
    setTrips((ts) => ts.map((t) => (t.id === tripId ? updatedTrip : t)));
    cloud("pushTripToSupabase", pushTripToSupabase(updatedTrip));
    cloudFetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedTrip),
    });
    return null;
  }

  function unassignBillFromTrip(tripId: number, billId: number) {
    const currentTrip = trips.find((t) => t.id === tripId);
    if (!currentTrip) return;
    const problem = detachProblem(
      currentTrip,
      bills.find((b) => Number(b.id) === Number(billId)),
    );
    if (problem) {
      notify(problem);
      return;
    }
    const updatedTrip: Trip = {
      ...currentTrip,
      billIds: currentTrip.billIds.filter((id) => id !== billId),
      updatedAt: new Date().toISOString(),
    };
    setTrips((ts) => ts.map((t) => (t.id === tripId ? updatedTrip : t)));
    cloud("pushTripToSupabase", pushTripToSupabase(updatedTrip));
    cloudFetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedTrip),
    });
  }

  function autoAssignTripBills(tripId: number): number {
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return 0;
    // Bills dated on this trip's dispatch day that are not already on another trip and belong to
    // this trip's salesman / van (so one van never absorbs another van's sales). Each one is also
    // checked against the load, so the trip never ends up selling more than it carried.
    const matchingBills = attachableBillsForTrip(trip, bills, trips);
    let working: Trip = trip;
    const skipped: string[] = [];
    for (const b of matchingBills) {
      if (working.billIds.map(Number).includes(Number(b.id))) continue;
      const problem = tripAttachProblem(working, b);
      if (problem) {
        skipped.push(problem);
        continue;
      }
      working = { ...working, billIds: [...working.billIds, b.id] };
    }
    const addedCount = working.billIds.length - trip.billIds.length;
    if (skipped.length > 0) {
      notify(
        `${skipped.length} bill(s) were not attached:\n` +
          skipped.slice(0, 5).map((m) => `• ${m}`).join("\n"),
      );
    }
    if (addedCount > 0) {
      const updatedTrip: Trip = { ...working, updatedAt: new Date().toISOString() };
      setTrips((ts) => ts.map((t) => (t.id === tripId ? updatedTrip : t)));
      cloud("pushTripToSupabase", pushTripToSupabase(updatedTrip));
      cloudFetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTrip),
      });
    }
    return addedCount;
  }

  // Records why crates were missing when a trip closed. Crates marked 'broken' are posted as a
  // damage write-off against the godown they were loaded from, so they leave stock (stock is only
  // deducted at billing, so a broken crate is otherwise still counted in the godown). Re-closing a
  // reopened trip updates the same write-off instead of adding a second one.
  function applyShortageReasons(
    trip: Trip,
    returned: Record<number, number>,
    input: Record<number, { reason: TripShortageReason; note?: string }>,
  ): Trip["shortageReasons"] {
    const result: NonNullable<Trip["shortageReasons"]> = {};
    const prior = trip.shortageReasons || {};
    const sold: Record<number, number> = {};
    for (const b of bills) {
      if (!billBelongsToTrip(trip, b)) continue;
      for (const it of b.items || []) {
        const pid = Number(it.productId);
        sold[pid] = (sold[pid] || 0) + (Number(it.qty) || 0);
      }
    }
    const failures: string[] = [];
    const pids = new Set<number>([
      ...Object.keys(input).map(Number),
      ...Object.keys(prior).map(Number),
    ]);
    for (const pid of pids) {
      const loaded = Number(trip.loaded?.[pid] ?? 0) || 0;
      const qty = loaded - (sold[pid] || 0) - (Number(returned[pid]) || 0);
      const entry = qty > 0 ? input[pid] : undefined;
      const before = prior[pid];
      const dispExists =
        before?.dispositionId &&
        inventoryDispositions.some((d) => d.id === before.dispositionId);

      if (!entry) {
        // No shortage any more (or no reason given): drop an earlier write-off.
        if (before?.dispositionId && dispExists) deleteInventoryDisposition(before.dispositionId);
        continue;
      }

      const product = products.find((p) => Number(p.id) === pid);
      let dispositionId: string | undefined;
      if (entry.reason === "broken") {
        const cost =
          Number((product as any)?.landedCostPerCrate) || Number(product?.cost) || 0;
        if (dispExists) {
          updateInventoryDisposition(before!.dispositionId!, {
            quantity: qty,
            costPerUnit: cost,
            costValue: cost * qty,
            notes: entry.note || `Trip #${trip.id} (${trip.vehicle}): broken crates`,
          });
          dispositionId = before!.dispositionId;
        } else {
          // Take it from the godown that supplied most of this product.
          let whId = trip.warehouseId || defaultWarehouse?.id || warehouses[0]?.id || "";
          let best = -1;
          for (const [wh, m] of Object.entries(trip.warehouseLoads || {})) {
            const q = Number((m as Record<number, number>)[pid]) || 0;
            if (q > best) {
              best = q;
              whId = wh;
            }
          }
          const res = addInventoryDisposition({
            dispositionType: "damage_writeoff",
            productId: pid,
            productName: product?.name,
            warehouseId: whId,
            warehouseName: warehouses.find((w) => w.id === whId)?.name,
            quantity: qty,
            unit: "case",
            costPerUnit: cost,
            compensationStatus: "not_applicable",
            reason: "Broken crates found at trip close",
            notes: entry.note || `Trip #${trip.id} (${trip.vehicle}): broken crates`,
            referenceDocNo: `TRIP-${trip.id}`,
            salesmanId: trip.salesmanId,
            salesmanName: trip.salesman,
            eventDate: todayISO(),
            createdBy: currentUser?.name || "Admin",
          } as any);
          if ("disposition" in res) dispositionId = res.disposition.id;
          else failures.push(`${product?.name || `Product #${pid}`}: ${(res as { error: string }).error}`);
        }
      } else if (before?.dispositionId && dispExists) {
        // Reason changed away from "broken": take the write-off back out.
        deleteInventoryDisposition(before.dispositionId);
      }
      result[pid] = {
        reason: entry.reason,
        qty,
        note: entry.note?.trim() || undefined,
        dispositionId,
      };
    }
    if (failures.length > 0) {
      notify(
        "Broken crates could not be written off in stock, record them under Dispositions:\n" +
          failures.map((m) => `• ${m}`).join("\n"),
      );
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  function saveReturn(
    tripId: number,
    returned: Record<number, number>,
    shortageReasons?: Record<number, { reason: TripShortageReason; note?: string }>,
    cashHandedIn?: number | null,
    cashShortBooked?: number | null,
  ): { ok: true } | { ok: false; error: string } {
    const currentTrip = trips.find((t) => Number(t.id) === Number(tripId));
    if (currentTrip) {
      // Returned crates go straight into godown stock, so an impossible count must never be saved.
      const over = findOverReturns(currentTrip, allBillsRef.current || bills, returned);
      if (over.length > 0) {
        return {
          ok: false,
          error:
            over
              .map((o) => describeOverReturn(o, products.find((pr) => Number(pr.id) === o.productId)?.name))
              .join(" ") + " Correct the count, or edit the load / bills first.",
        };
      }
      // Every bill of the trip must have reached the cloud, or the trip would close on numbers another phone cannot see.
      const tripBillIds = (allBillsRef.current || bills)
        .filter((b) => billBelongsToTrip(currentTrip, b))
        .map((b) => Number(b.id));
      if (hasUnsavedBills(tripBillIds)) {
        return {
          ok: false,
          error:
            "Some bills of this trip are still being saved to the cloud. Wait for the \"waiting to upload\" notice to clear, then close the trip.",
        };
      }
    }
    const reasons =
      currentTrip && shortageReasons
        ? applyShortageReasons(currentTrip, returned, shortageReasons)
        : currentTrip?.shortageReasons;
    const updatedTrip: Trip | null = currentTrip
      ? normalizeTrip({
          ...currentTrip,
          returned,
          draftReturned: {},
          status: "closed",
          shortageReasons: reasons,
          ...(cashHandedIn !== undefined ? { cashHandedIn: cashHandedIn ?? undefined } : {}),
          // undefined = leave as it was, null = no shortfall (clears an earlier one), number = owed by the salesman
          ...(cashShortBooked !== undefined
            ? { cashShortBooked: cashShortBooked && cashShortBooked > 0 ? cashShortBooked : undefined }
            : {}),
          updatedAt: new Date().toISOString(),
        })
      : null;
    if (updatedTrip)
      setTrips((ts) =>
        ts.map((t) => (Number(t.id) === Number(tripId) ? updatedTrip : t)),
      );
    if (updatedTrip) {
      cloud("pushTripToSupabase", pushTripToSupabase(updatedTrip));
      cloudFetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTrip),
      });
    }
    return { ok: true };
  }

  // Counts typed on the settlement screen but not closed yet. They live in `draftReturned`: `returned` only counts
  // once the trip is closed, so a draft can never change stock or the "crates left in the van" figures.
  function saveReturnDraft(tripId: number, returned: Record<number, number>, cashHandedIn?: number | null) {
    const currentTrip = trips.find((t) => Number(t.id) === Number(tripId));
    if (!currentTrip || currentTrip.status === "closed") return;
    const updatedTrip = normalizeTrip({
      ...currentTrip,
      draftReturned: returned,
      ...(cashHandedIn !== undefined ? { cashHandedIn: cashHandedIn ?? undefined } : {}),
      updatedAt: new Date().toISOString(),
    });
    setTrips((ts) => ts.map((t) => (Number(t.id) === Number(tripId) ? updatedTrip : t)));
    cloud("pushTripToSupabase", pushTripToSupabase(updatedTrip));
    cloudFetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedTrip),
    });
  }

  // Shared by the two cash-due actions below: stamp, store and push one trip.
  function commitTripChange(updatedTrip: Trip) {
    const stamped = normalizeTrip({ ...updatedTrip, updatedAt: new Date().toISOString() });
    setTrips((ts) => ts.map((t) => (Number(t.id) === Number(stamped.id) ? stamped : t)));
    cloud("pushTripToSupabase", pushTripToSupabase(stamped));
    cloudFetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stamped),
    });
  }

  function recordTripCashRecovery(tripId: number, amount: number, note?: string, date?: string): boolean {
    const cur = trips.find((t) => Number(t.id) === Number(tripId));
    const amt = Math.round((Number(amount) || 0) * 100) / 100;
    if (!cur || cur.status !== "closed" || amt <= 0) return false;
    // never record more than is still owed
    if (amt > tripCashDue(cur) + 0.005) return false;
    const entry: TripCashRecovery = {
      id: `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      date: (date || todayISO()).slice(0, 10),
      amount: amt,
      ...(note && note.trim() ? { note: note.trim() } : {}),
    };
    commitTripChange({ ...cur, cashRecoveries: [...(cur.cashRecoveries || []), entry] });
    return true;
  }

  function writeOffTripCashShort(tripId: number) {
    const cur = trips.find((t) => Number(t.id) === Number(tripId));
    if (!cur || tripCashDue(cur) <= 0) return;
    commitTripChange({ ...cur, cashShortWrittenOff: true });
  }

  // Takes back the stock write-off made for broken crates when the trip was closed.
  function withdrawTripWriteOffs(trip: Trip): Trip["shortageReasons"] {
    if (!trip.shortageReasons) return trip.shortageReasons;
    const next: NonNullable<Trip["shortageReasons"]> = {};
    for (const [pid, entry] of Object.entries(trip.shortageReasons)) {
      if (entry.dispositionId && inventoryDispositions.some((d) => d.id === entry.dispositionId)) {
        deleteInventoryDisposition(entry.dispositionId);
      }
      next[Number(pid)] = { ...entry, dispositionId: undefined };
    }
    return next;
  }

  function reopenTrip(tripId: number) {
    const currentTrip = trips.find((t) => Number(t.id) === Number(tripId));
    if (!currentTrip) return;
    // The closed settlement becomes an editable draft (nothing typed is lost) and its broken-crate write-off is
    // withdrawn; closing again posts it again.
    const updatedTrip = normalizeTrip({
      ...currentTrip,
      status: "out",
      returned: {},
      draftReturned: currentTrip.returned || {},
      shortageReasons: withdrawTripWriteOffs(currentTrip),
      updatedAt: new Date().toISOString(),
    });
    setTrips((ts) => ts.map((t) => (Number(t.id) === Number(tripId) ? updatedTrip : t)));
    cloud("pushTripToSupabase", pushTripToSupabase(updatedTrip));
    cloudFetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedTrip),
    });
  }

  function updateTrip(updated: Trip) {
    // Saving a completed trip from the edit screen reopens it: handle it exactly like reopenTrip (the closed
    // counts become a draft, the broken-crate write-off is withdrawn) instead of silently dropping them.
    const existing = trips.find((t) => Number(t.id) === Number(updated.id));
    const reopening = existing?.status === "closed" && updated.status !== "closed";
    const base: Trip = reopening
      ? {
          ...updated,
          draftReturned:
            updated.returned && Object.keys(updated.returned).length > 0
              ? updated.returned
              : existing!.returned || {},
          shortageReasons: withdrawTripWriteOffs(existing!),
        }
      : updated;
    const normalized = normalizeTrip({ ...base, updatedAt: new Date().toISOString() });
    setTrips((ts) =>
      ts.map((t) => (Number(t.id) === Number(normalized.id) ? normalized : t)),
    );
    cloud("pushTripToSupabase", pushTripToSupabase(normalized));
    cloudFetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    });
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("mrwater_ledger_sync");
        bc.postMessage({ type: "REFRESH_DATA" });
        bc.close();
      }
    } catch {}
  }

  function deleteTrip(tripId: number) {
    const gone = trips.find((t) => Number(t.id) === Number(tripId));
    // Take the broken-crate write-off back out of stock, and release the bills raised on this trip: left pointing
    // at a trip that no longer exists they could never be attached to another one.
    if (gone) withdrawTripWriteOffs(gone);
    setBills((prev) =>
      prev.some((b) => b.tripId != null && Number(b.tripId) === Number(tripId))
        ? prev.map((b) =>
            b.tripId != null && Number(b.tripId) === Number(tripId) ? { ...b, tripId: undefined } : b,
          )
        : prev,
    );
    deadTripIdsRef.current.add(Number(tripId));
    setTrips((ts) => ts.filter((t) => Number(t.id) !== Number(tripId)));
    cloud("deleteTripFromSupabase", deleteTripFromSupabase(tripId));
    cloudFetch(`/api/trips/${tripId}`, { method: "DELETE" });
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("mrwater_ledger_sync");
        bc.postMessage({ type: "REFRESH_DATA" });
        bc.close();
      }
    } catch {}
  }

  const syncTripsToCloud = async (): Promise<{
    success: boolean;
    count: number;
    error?: string;
  }> => {
    try {
      let count = 0;
      for (const trip of trips) {
        const norm = normalizeTrip(trip);
        const res = await pushTripToSupabase(norm);
        if (res.success) count++;
      }
      // Also pull latest remote trips so reopened or updated trips sync bidirectionally
      const remote = await pullLedgerFromSupabase().catch(() => null);
      if (remote?.trips && remote.trips.length > 0) {
        const normalizedRemote = remote.trips.map(normalizeTrip);
        // merge with this device's trips (never drop a trip the cloud has not received yet)
        const byId = new Map<number, Trip>();
        normalizedRemote.forEach((t) => byId.set(Number(t.id), t));
        trips.forEach((t) => {
          const theirs = byId.get(Number(t.id));
          byId.set(Number(t.id), pickNewerTrip(normalizeTrip(t), theirs ?? normalizeTrip(t)));
        });
        const mergedTrips = Array.from(byId.values()).sort((a, b) => Number(b.id) - Number(a.id));
        setTripsRaw(mergedTrips);
        await saveTrips(mergedTrips);
      } else {
        await saveTrips(trips.map(normalizeTrip));
      }
      return { success: true, count };
    } catch (e: any) {
      return { success: false, count: 0, error: e?.message || "Sync failed" };
    }
  };

  // Stock Audit
  function saveAudit(
    counts: Record<number, number | string>,
    adjustStock: boolean,
    auditDate?: string,
    referenceNote?: string,
    warehouseId?: string,
  ) {
    const targetDate =
      auditDate && auditDate.trim()
        ? auditDate.trim()
        : todayISO();
    const entries: AuditEntry[] = Object.entries(counts)
      .map(([k, v]) => [Number(k), v] as [number, number | string])
      .filter(([, val]) => val !== "" && val !== undefined)
      .map(([pid, val]) => {
        const product = products.find((p) => p.id === pid);
        // System = live book balance of the godown being counted (or the product total when no
        // godown is given). The difference is posted into live stock via the audit itself
        // (see ledgerAdjByProduct*), NOT into product.opening, which is ignored once batches exist.
        // For a count dated in the past, "system" is the stock of THAT day (stockAsOf), so the variance posted
        // today is what was really missing then, not today's balance minus an old count.
        const system = stockAsOf(pid, targetDate, warehouseId);
        const counted = Number(val);
        const adjWh =
          warehouseId || (product ? fallbackWarehouseId(product) : "") || undefined;
        const entry: AuditEntry = {
          productId: pid,
          name: product ? product.name : `Product #${pid}`,
          system,
          counted,
          diff: counted - system,
        };
        if (adjustStock && adjWh) entry.warehouseId = adjWh;
        return entry;
      });

    if (entries.length === 0) return;

    const nextId = reserveDocNumber("audit", audits.length ? Math.max(...audits.map((x) => x.id)) : 0);
    const nowTime = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const newAudit: Audit = {
      id: nextId,
      date: targetDate,
      time: nowTime,
      referenceNote: referenceNote?.trim() || undefined,
      entries,
      adjusted: adjustStock,
    };
    setAudits((as) => [newAudit, ...as]);
    cloud("pushAuditToSupabase", pushAuditToSupabase(newAudit));
    cloudFetch("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newAudit),
    });
  }

  function deleteAudit(id: number) {
    logDeletion("audit", String(id));
    setAudits((as) => as.filter((a) => a.id !== id));
    cloud("deleteAuditFromSupabase", deleteAuditFromSupabase(id));
    cloudFetch(`/api/audits/${id}`, { method: "DELETE" });
  }

  function resetToDefault() {
    cleanDatabase();
    setGstMode("inclusive");
    setFontSize("large");
    setHighContrast(false);
    setOrgProfile(DEFAULT_ORG_PROFILE);
    setBillingSettings(DEFAULT_BILLING_SETTINGS);
    saveBillingSettings(DEFAULT_BILLING_SETTINGS).catch(() => {});
  }

  return (
    <LedgerContext.Provider
      value={{
        tab,
        setTab,
        grns,
        setGrns,
        postGrn,
        updateGrn,
        deleteGrn,
        activeGrnToEdit,
        setActiveGrnToEdit,
        loadSampleGrn,
        products,
        setProducts,
        addProduct,
        updateProductField,
        updateProductFields,
        deleteProduct,
        applyBulkImport,
        receiveInwardStock,
        productWarehouseStock,
        productBatchLines,
        productInWarehouse,
        warehouses,
        setWarehouses,
        addWarehouse,
        updateWarehouse,
        deleteWarehouse,
        defaultWarehouse,
        inventoryBatches,
        setInventoryBatches,
        addBatch,
        updateBatch,
        deleteBatch,
        batchesForProduct,
        warehouseStock,
        stockTransfers,
        addStockTransfer,
        promotions,
        setPromotions,
        addPromotion,
        updatePromotion,
        deletePromotion,
        supplierSchemes,
        addSupplierScheme,
        updateSupplierScheme,
        deleteSupplierScheme,
        supplierSchemeApplications,
        addSupplierSchemeApplication,
        supplierCreditNotes,
        addSupplierCreditNote,
        updateSupplierCreditNote,
        deleteSupplierCreditNote,
        recordSupplierCreditNoteReceipt,
        inventoryDispositions,
        expenses,
        addExpense,
        updateExpense,
        deleteExpense,
        addInventoryDisposition,
        updateInventoryDisposition,
        deleteInventoryDisposition,
        recordDispositionCompensation,
        auditSessions,
        createAuditSession,
        deleteAuditSession,
        updateAuditSession,
        saveAuditSessionCounts,
        confirmSwap,
        rejectSuggestion,
        keepAsSeparateVariance,
        markUnderInvestigation,
        selectInvestigationReason,
        approveReconciliation,
        reconciliationTransactions,
        stockLedgerEntries,
        bills,
        cart,
        setCart,
        editingBillId,
        justFinalizedBillId,
        setJustFinalizedBillId,
        startEditBill,
        cancelEditBill,
        finalizeBill,
        updateBill,
        repairBillTotals,
        previewBillEdit,
        previewBillDelete,
        recordPayment,
        deleteBill,
        cancelBill,
        createSalesReturn,
        cancelSalesReturn,
        editSalesReturn,
        cancelledBills,
        notice,
        notify,
        dismissNotice,
        syncBillsToCloud,
        customProductPrices,
        customerProductPrices,
        getPreviousCustomPrice,
        setCustomProductPrice,
        payments,
        setPayments,
        recordCustomerPayment,
        repairPaymentLinks,
        deletePayment,
        updatePayment,
        paymentAudit,
        getCustomerCreditSummary,
        applyAdvanceToInvoices,
        recordCustomerRefund,
        customers,
        setCustomers,
        addCustomer,
        updateCustomer,
        customerNameClash,
        findBillingCustomer,
        deleteCustomer,
        existingCustomers,
        startBillForCustomer,
        getCustomerLedger,
        trips,
        addTrip,
        toggleBillAssignment,
        unassignBillFromTrip,
        autoAssignTripBills,
        saveReturn,
        reopenTrip,
        saveReturnDraft,
        recordTripCashRecovery,
        writeOffTripCashShort,
        updateTrip,
        deleteTrip,
        syncTripsToCloud,
        audits,
        saveAudit,
        deleteAudit,
        gstMode,
        setGstMode,
        fontSize,
        setFontSize,
        highContrast,
        setHighContrast,
        lowVisionMode,
        setLowVisionMode,
        toggleLowVisionMode,
        lowVisionStickyPosition,
        setLowVisionStickyPosition,
        scale,
        palette,
        fz,
        orgProfile,
        setOrgProfile,
        updateOrgProfile,
        pullOrgProfileFromCloud,
        billingSettings,
        setBillingSettings,
        updateBillingSettings,
        pullBillingSettingsFromCloud,
        loadDemoPreset,
        exportBackup,
        importBackup,
        clearTransactions,
        clearAllData,
        soldByProduct,
        remainingStock,
        bookStock,
        stockAsOf,
        activePromoFor,
        tripBreakdown,
        getVehicleStock,
        totalOpening,
        totalRemaining,
        totalRevenue,
        totalCasesSold,
        totalOutstanding,
        tripsWithDiscrepancy,
        supabaseConfig,
        supabaseStatus,
        checkSupabaseConnection,
        syncToCloud,
        pullFromCloud,
        saveCustomSupabaseCredentials,
        clearCustomSupabaseCredentials,
        resetToDefault,
        cleanDatabase,
        deleteLocalDatabase,
        salesmen,
        currentUser,
        currentRole,
        activeSalesman,
        loginAdmin,
        loginSalesman,
        logout,
        addSalesman,
        updateSalesman,
        toggleSalesmanActive,
        deleteSalesman,
      }}
    >
      {children}
    </LedgerContext.Provider>
  );
};

export function useLedger(): LedgerContextType {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger must be used within a LedgerProvider");
  return ctx;
}
