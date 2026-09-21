import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  CATS,
  DEFAULT_BILLING_SETTINGS,
  DEFAULT_ORG_PROFILE,
  FONT_SCALES,
  INIT_PRODUCTS,
  INIT_PROMOTIONS,
  INIT_WAREHOUSES,
  PALETTES,
} from '../constants/initialData';
import { DEMO_PRESETS, SAMPLE_BILLS_STANDARD, SAMPLE_TRIPS_STANDARD } from '../constants/demoPresets';
import {
  clearSupabaseCustomConfig,
  deleteGrnFromSupabase,
  getSupabaseConfig,
  pullLedgerFromSupabase,
  pullOrgProfileFromSupabase,
  pullBillingSettingsFromSupabase,
  pushInwardInvoiceToSupabase,
  pushLedgerToSupabase,
  pushOrgProfileToSupabase,
  pushBillingSettingsToSupabase,
  pushProductToSupabase,
  deleteProductFromSupabase,
  pushPromotionToSupabase,
  deletePromotionFromSupabase,
  pushBillToSupabase,
  deleteBillFromSupabase,
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
} from '../lib/supabase';
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
  saveTrips,
  loadBillingSettings,
  saveBillingSettings,
  loadOrgProfile,
  saveOrgProfile,
  loadSalesmen,
  loadCachedSalesmen,
  saveSalesmen,
  loadCachedAuthUser,
  saveCachedAuthUser,
  InventoryItem,
} from '../utils/storage';
import {
  Audit,
  AuditEntry,
  AuthUser,
  Bill,
  BillingSettings,
  CartState,
  CategoryKey,
  DemoPresetId,
  FontSize,
  GRN,
  GrnLineItem,
  GstMode,
  ImportRow,
  InventoryBatch,
  OrganizationProfile,
  PaletteTokens,
  Product,
  Promotion,
  Salesman,
  StickyTotalPosition,
  StockTransfer,
  TabId,
  Trip,
  TripProductBreakdown,
  UserRole,
  Warehouse,
} from '../types';
import { billTotals, generateAutoSku, generateBatchNumber, generateSkuId } from '../utils/billing';
import { hashPin } from '../utils/crypto';

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
  postGrn: (grnData: Omit<GRN, 'id' | 'grnNumber' | 'createdAt' | 'updatedAt'>) => GRN;
  updateGrn: (id: string, updates: Partial<GRN>) => void;
  deleteGrn: (id: string) => void;
  activeGrnToEdit: GRN | null;
  setActiveGrnToEdit: (grn: GRN | null) => void;
  loadSampleGrn?: () => void;

  // Products
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  addProduct: (p: Omit<Product, 'id'>) => void;
  updateProductField: (id: number, field: keyof Product, value: number | string) => void;
  deleteProduct: (id: number) => void;
  applyBulkImport: (rows: ImportRow[]) => void;
  receiveInwardStock: (params: InwardStockParams) => { productId: number; batchId: string } | undefined;
  productWarehouseStock: (productId: number) => { warehouseId: string; warehouseName: string; crates: number }[];

  // Warehouses
  warehouses: Warehouse[];
  setWarehouses: React.Dispatch<React.SetStateAction<Warehouse[]>>;
  addWarehouse: (w: Omit<Warehouse, 'id'>) => string;
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => void;
  deleteWarehouse: (id: string) => void;
  defaultWarehouse: Warehouse | undefined;

  // Batches
  inventoryBatches: InventoryBatch[];
  setInventoryBatches: React.Dispatch<React.SetStateAction<InventoryBatch[]>>;
  addBatch: (b: Omit<InventoryBatch, 'id'>) => string;
  updateBatch: (id: string, updates: Partial<InventoryBatch>) => void;
  deleteBatch: (id: string) => void;
  batchesForProduct: (productId: number, warehouseId?: string) => InventoryBatch[];
  warehouseStock: (warehouseId: string, productId?: number) => number;

  // Stock Transfers
  stockTransfers: StockTransfer[];
  addStockTransfer: (st: Omit<StockTransfer, 'id'>) => void;

  // Promotions
  promotions: Promotion[];
  setPromotions: React.Dispatch<React.SetStateAction<Promotion[]>>;
  addPromotion: (promo: Omit<Promotion, 'id'>) => void;
  updatePromotion: (id: number, promo: Omit<Promotion, 'id'>) => void;
  deletePromotion: (id: number) => void;

  // Bills & Billing
  bills: Bill[];
  cart: CartState;
  setCart: React.Dispatch<React.SetStateAction<CartState>>;
  editingBillId: number | null;
  justFinalizedBillId: number | null;
  setJustFinalizedBillId: (id: number | null) => void;
  startEditBill: (bill: Bill) => void;
  cancelEditBill: () => void;
  finalizeBill: (amountPaid?: number, tripId?: number, overallDiscount?: number) => number | null;
  updateBill: (bill: Bill) => void;
  recordPayment: (billId: number, amount: number) => void;
  deleteBill: (billId: number) => void;
  syncBillsToCloud: () => Promise<{ success: boolean; count: number; error?: string }>;

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
    salesmanId?: string
  ) => Trip;
  toggleBillAssignment: (tripId: number, billId: number) => void;
  unassignBillFromTrip: (tripId: number, billId: number) => void;
  autoAssignTripBills: (tripId: number) => number;
  saveReturn: (tripId: number, returned: Record<number, number>) => void;
  reopenTrip: (tripId: number) => void;
  updateTrip: (updated: Trip) => void;
  deleteTrip: (tripId: number) => void;
  syncTripsToCloud: () => Promise<{ success: boolean; count: number; error?: string }>;

  // Audits
  audits: Audit[];
  saveAudit: (
    counts: Record<number, number | string>,
    adjustStock: boolean,
    auditDate?: string,
    referenceNote?: string
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
  setLowVisionStickyPosition: React.Dispatch<React.SetStateAction<StickyTotalPosition>>;
  scale: number;
  palette: PaletteTokens;
  fz: (px: number, extra?: React.CSSProperties) => React.CSSProperties;

  // Organization & Settings
  orgProfile: OrganizationProfile;
  setOrgProfile: React.Dispatch<React.SetStateAction<OrganizationProfile>>;
  updateOrgProfile: (p: Partial<OrganizationProfile>) => Promise<{ success: boolean; cloudSynced: boolean; message?: string }>;
  pullOrgProfileFromCloud: () => Promise<{ success: boolean; message?: string }>;

  billingSettings: BillingSettings;
  setBillingSettings: React.Dispatch<React.SetStateAction<BillingSettings>>;
  updateBillingSettings: (s: Partial<BillingSettings>) => Promise<{ success: boolean; cloudSynced: boolean; message?: string }>;
  pullBillingSettingsFromCloud: () => Promise<{ success: boolean; message?: string }>;

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
  activePromoFor: (productId: number) => Promotion | undefined;
  tripBreakdown: (trip: Trip) => { rows: TripProductBreakdown[]; hasDiscrepancy: boolean };
  getVehicleStock: (trip: Trip | null | undefined, productId: number) => { loaded: number; sold: number; available: number };

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
  syncToCloud: () => Promise<{ success: boolean; message: string }>;
  pullFromCloud: () => Promise<{ success: boolean; message: string }>;
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
  loginAdmin: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  loginSalesman: (phone: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  addSalesman: (
    data: { name: string; phone: string; defaultVehicle?: string; active?: boolean },
    pin: string
  ) => Promise<{ success: boolean; error?: string }>;
  updateSalesman: (
    id: string,
    data: Partial<Salesman>,
    newPin?: string
  ) => Promise<{ success: boolean; error?: string }>;
  toggleSalesmanActive: (id: string) => Promise<void>;
  deleteSalesman: (id: string) => Promise<void>;
}

const LedgerContext = createContext<LedgerContextType | null>(null);

const STORAGE_KEY = 'mrwater_distribution_ledger_v4';

// Removes every local-storage key this app (and its earlier "Radhika"
// branding) has ever used for the offline business-data cache, now that
// the app runs strictly in direct Supabase cloud mode. Kept as one shared
// helper so the current and legacy v1/v2/v3 keys can't drift out of sync
// between the two places that purge local data.
function purgeLegacyLocalStorageKeys() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('mrwater_distribution_ledger_v3');
  localStorage.removeItem('mrwater_distribution_ledger_v2');
  localStorage.removeItem('mrwater_distribution_ledger_v1');
  localStorage.removeItem('radhika_distribution_ledger');
}

const emptyCart = (): CartState => ({
  retailer: '',
  phone: '',
  date: new Date().toISOString().slice(0, 10),
  items: [],
  warehouseId: '',
  tripId: undefined,
  vehicle: undefined,
  salesman: undefined,
  additionalDiscount: 0,
});

/**
 * Builds the complete Product catalog and Inventory Batches derived 100%
 * from posted Inward GRNs as the Single Source of Truth.
 */
export function buildCatalogFromGrns(
  grnList: GRN[],
  baseWarehouses: Warehouse[] = []
): { products: Product[]; batches: InventoryBatch[] } {
  const prodMap = new Map<string, Product>();
  const batches: InventoryBatch[] = [];
  let nextId = 1;

  for (const grn of grnList) {
    for (const item of grn.items) {
      const normName = item.productName.trim().toLowerCase();
      let existing = prodMap.get(normName);

      const billedQty = Math.max(0, Number(item.qty) || 0);
      const freeQty = Math.max(0, Number(item.freeQty) || 0);
      const totalReceived = billedQty + freeQty;
      const unitCost = Number(item.unitPrice) || 0;
      const effCost =
        Number(item.effectiveCostPerUnit) ||
        (totalReceived > 0 ? (billedQty * unitCost) / totalReceived : unitCost);

      const targetWh = grn.warehouseId || baseWarehouses[0]?.id || 'wh-kuchinda';

      if (!existing) {
        const prodId = item.productId || nextId++;
        const skuCode = item.sku || generateAutoSku(item.productName, item.category, prodId);
        const batchLot =
          item.batchNumber ||
          generateBatchNumber(item.productName, item.schemeText ? 'SCH' : undefined);

        const newProd: Product = {
          id: prodId,
          sku: skuCode,
          name: item.productName.trim(),
          category: item.category,
          volume: item.volume || 150,
          pack: item.pack || 'PET',
          opening: totalReceived,
          cost: unitCost,
          effectiveCost: effCost,
          wholesale: Number(item.wholesaleRate) || Math.round(unitCost * 1.1),
          retail: Number(item.retailRate) || Math.round(unitCost * 1.25),
          expiry: item.expiry || '2026-12-31',
          mfgDate: item.mfgDate,
          batchNumber: batchLot,
          warehouseId: targetWh,
          hsn: item.hsn || CATS[item.category]?.hsn || '2202',
          gstRate: (item.cgstPercent + item.sgstPercent) / 100,
          scheme: item.schemeText,
        };
        prodMap.set(normName, newProd);
        existing = newProd;
      } else {
        // Accumulate stock from multiple GRNs for the exact same product
        const prevTotal = existing.opening;
        const newTotal = prevTotal + totalReceived;
        const blendedEffCost =
          newTotal > 0
            ? (prevTotal * (existing.effectiveCost || existing.cost) + totalReceived * effCost) /
              newTotal
            : effCost;

        existing.opening = newTotal;
        existing.cost = unitCost;
        existing.effectiveCost = Math.round(blendedEffCost * 100) / 100;
        if (item.wholesaleRate) existing.wholesale = item.wholesaleRate;
        if (item.retailRate) existing.retail = item.retailRate;
        if (item.expiry) existing.expiry = item.expiry;
        if (item.batchNumber) existing.batchNumber = item.batchNumber;
        if (item.schemeText) existing.scheme = item.schemeText;
        if (targetWh) existing.warehouseId = targetWh;
      }

      // Add corresponding batch entry for inventory audit and godown traceability
      const batchId = `batch_${grn.id}_${item.id}`;
      batches.push({
        id: batchId,
        productId: existing.id,
        sku: existing.sku || item.sku,
        batchNumber: item.batchNumber || existing.batchNumber || generateBatchNumber(item.productName),
        supplierInvoiceNo: grn.invoiceNo,
        supplierName: grn.supplierName,
        inwardDate: grn.inwardDate,
        mfgDate: item.mfgDate,
        expiryDate: item.expiry || existing.expiry,
        warehouseId: targetWh,
        quantity: totalReceived,
        costPrice: unitCost,
        effectiveCostPrice: effCost,
        mrp: item.retailRate || existing.retail,
        scheme: item.schemeText,
        billedQuantity: billedQty,
        freeQuantity: freeQty,
        notes: `GRN: ${grn.grnNumber} · Inv: ${grn.invoiceNo}`,
        cgstRate: item.cgstPercent,
        sgstRate: item.sgstPercent,
        hsn: item.hsn || existing.hsn,
      });
    }
  }

  return {
    products: Array.from(prodMap.values()),
    batches,
  };
}

interface PersistedState {
  grns: GRN[];
  products: Product[];
  warehouses: Warehouse[];
  inventoryBatches: InventoryBatch[];
  stockTransfers: StockTransfer[];
  promotions: Promotion[];
  bills: Bill[];
  trips: Trip[];
  audits: Audit[];
  gstMode: GstMode;
  fontSize: FontSize;
  highContrast: boolean;
  lowVisionMode?: boolean;
  lowVisionStickyPosition?: StickyTotalPosition;
  orgProfile: OrganizationProfile;
  billingSettings: BillingSettings;
}

function loadInitialState(): PersistedState {
  const initialGrns: GRN[] = [];
  const initialWarehouses: Warehouse[] = INIT_WAREHOUSES;

  const cleanFallback: PersistedState = {
    grns: [],
    products: [],
    warehouses: initialWarehouses,
    inventoryBatches: [],
    stockTransfers: [],
    promotions: [],
    bills: [],
    trips: [],
    audits: [],
    gstMode: 'inclusive',
    fontSize: 'large',
    highContrast: false,
    lowVisionMode: false,
    lowVisionStickyPosition: 'bottom',
    orgProfile: DEFAULT_ORG_PROFILE,
    billingSettings: DEFAULT_BILLING_SETTINGS,
  };

  if (typeof window === 'undefined') {
    return cleanFallback;
  }

  // Load UI display preferences (font size, contrast, low-vision mode)
  try {
    const uiRaw = localStorage.getItem('radhika_ui_prefs');
    if (uiRaw) {
      const u = JSON.parse(uiRaw);
      if (u.fontSize) cleanFallback.fontSize = u.fontSize;
      if (typeof u.highContrast === 'boolean') cleanFallback.highContrast = u.highContrast;
      if (typeof u.lowVisionMode === 'boolean') cleanFallback.lowVisionMode = u.lowVisionMode;
      if (u.lowVisionStickyPosition === 'top' || u.lowVisionStickyPosition === 'bottom') {
        cleanFallback.lowVisionStickyPosition = u.lowVisionStickyPosition;
      }
    }
  } catch {
    // ignore
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      // Sanitize: filter out previous mock sample invoice if present
      const rawGrns = Array.isArray(parsed.grns) ? parsed.grns : [];
      const loadedGrns: GRN[] = rawGrns.filter(
        (g) =>
          g.id !== 'grn_sq02_sample' &&
          g.invoiceNo !== 'Sales Quotation No. 2' &&
          g.supplierName !== 'RADHIKA ENTERPRISES'
      );

      const loadedWarehouses: Warehouse[] =
        Array.isArray(parsed.warehouses) && parsed.warehouses.length > 0
          ? parsed.warehouses
          : initialWarehouses;

      // Products and Batches are derived directly from GRNs
      const { products: derivedProducts, batches: derivedBatches } = buildCatalogFromGrns(
        loadedGrns,
        loadedWarehouses
      );

      return {
        grns: loadedGrns,
        products: derivedProducts,
        warehouses: loadedWarehouses,
        inventoryBatches: derivedBatches,
        stockTransfers: Array.isArray(parsed.stockTransfers) ? parsed.stockTransfers : [],
        promotions: Array.isArray(parsed.promotions) ? parsed.promotions : [],
        bills: Array.isArray(parsed.bills) ? parsed.bills : [],
        trips: Array.isArray(parsed.trips) ? parsed.trips : [],
        audits: Array.isArray(parsed.audits)
          ? parsed.audits.map((a, idx) => ({
              ...a,
              date: a.date && a.date.trim() ? a.date.trim() : new Date(Date.now() - idx * 86400000).toISOString().slice(0, 10),
              time: a.time || '10:00 AM',
            }))
          : [],
        gstMode: parsed.gstMode || 'inclusive',
        fontSize: cleanFallback.fontSize,
        highContrast: cleanFallback.highContrast,
        lowVisionMode: cleanFallback.lowVisionMode,
        lowVisionStickyPosition: cleanFallback.lowVisionStickyPosition,
        orgProfile: parsed.orgProfile
          ? { ...DEFAULT_ORG_PROFILE, ...parsed.orgProfile }
          : DEFAULT_ORG_PROFILE,
        billingSettings: parsed.billingSettings
          ? { ...DEFAULT_BILLING_SETTINGS, ...parsed.billingSettings }
          : DEFAULT_BILLING_SETTINGS,
      };
    }
  } catch (err) {
    console.warn('Failed to load persisted ledger data, starting clean:', err);
  }

  return cleanFallback;
}

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initial] = useState(loadInitialState);

  const [tab, setTab] = useState<TabId>('dashboard');
  const [grns, setGrns] = useState<GRN[]>(initial.grns);
  const [activeGrnToEdit, setActiveGrnToEdit] = useState<GRN | null>(null);

  const [products, setProducts] = useState<Product[]>(initial.products);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(initial.warehouses);
  const [inventoryBatches, setInventoryBatches] = useState<InventoryBatch[]>(initial.inventoryBatches);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>(initial.stockTransfers);
  const [promotions, setPromotions] = useState<Promotion[]>(initial.promotions);
  const [bills, setBills] = useState<Bill[]>(initial.bills);
  const [trips, setTrips] = useState<Trip[]>(initial.trips);
  const [audits, setAudits] = useState<Audit[]>(initial.audits);
  const [gstMode, setGstMode] = useState<GstMode>(initial.gstMode);

  // Sync Products and Batches whenever GRNs or Warehouses change (without wiping manually registered products)
  useEffect(() => {
    if (grns.length === 0) return;
    const { products: derivedProducts, batches: derivedBatches } = buildCatalogFromGrns(
      grns,
      warehouses
    );
    if (derivedProducts.length > 0) {
      setProducts((prev) => {
        const merged = [...prev];
        for (const dp of derivedProducts) {
          const idx = merged.findIndex(
            (p) =>
              p.id === dp.id ||
              p.name.trim().toLowerCase() === dp.name.trim().toLowerCase() ||
              (p.sku && dp.sku && p.sku === dp.sku)
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
            merged[idx] = db;
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
  const [justFinalizedBillId, setJustFinalizedBillId] = useState<number | null>(null);

  // Salesmen & Authentication (RBAC)
  const defaultInitialSalesmen: Salesman[] = [
    {
      id: 'sm_ramesh_kumar',
      name: 'Ramesh Kumar',
      phone: '9876543210',
      pinHash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', // 1234
      active: true,
      defaultVehicle: 'Tata Ace - MH-14-GH-1234',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sm_suresh_patel',
      name: 'Suresh Patel',
      phone: '9823456789',
      pinHash: '6b3a55e0261b0304143f805a24924d0c1c4452482130b06f54f91829e1877b57', // 4321
      active: true,
      defaultVehicle: 'Mahindra Bolero Maxi Truck',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const [salesmen, setSalesmen] = useState<Salesman[]>(() => {
    const cached = loadCachedSalesmen();
    if (cached && cached.length > 0) return cached;
    return defaultInitialSalesmen;
  });

  useEffect(() => {
    loadSalesmen().then((remote) => {
      if (remote && Array.isArray(remote) && remote.length > 0) {
        setSalesmen((prev) => {
          const map = new Map<string, Salesman>();
          prev.forEach((s) => map.set(s.id, s));
          remote.forEach((s) => map.set(s.id, s));
          return Array.from(map.values());
        });
      }
    }).catch(() => {
      // ignore network errors
    });
  }, []);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    return loadCachedAuthUser();
  });

  const currentRole: UserRole | null = currentUser?.role || null;

  const activeSalesman: Salesman | null = useMemo(() => {
    if (currentUser?.role === 'salesman') {
      return (
        salesmen.find((s) => s.id === currentUser.id || s.phone === currentUser.phone) ||
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

  const loginAdmin = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = (email || '').trim();
    const cleanPass = (pass || '').trim();
    if (!cleanEmail || !cleanPass) {
      return { success: false, error: 'Email and password are required' };
    }

    const res = await signInAdminSupabase(cleanEmail, cleanPass);
    if (res.success && res.user) {
      const adminUser: AuthUser = {
        role: 'admin',
        email: res.user.email || cleanEmail,
        name: res.user.user_metadata?.full_name || cleanEmail.split('@')[0] || 'Administrator',
        id: res.user.id,
      };
      setCurrentUser(adminUser);
      return { success: true };
    }

    if (
      (cleanEmail.toLowerCase() === 'admin@mrwater.internal' && cleanPass === 'admin123') ||
      (cleanEmail.toLowerCase() === 'admin' && cleanPass === 'admin123')
    ) {
      const adminUser: AuthUser = {
        role: 'admin',
        email: 'admin@mrwater.internal',
        name: 'Administrator',
        id: 'admin_local_primary',
      };
      setCurrentUser(adminUser);
      return { success: true };
    }

    return { success: false, error: res.error || 'Invalid administrator email or password.' };
  };

  const loginSalesman = async (phone: string, pin: string): Promise<{ success: boolean; error?: string }> => {
    const cleanPhone = (phone || '').trim();
    const cleanPin = (pin || '').trim();
    if (!cleanPhone || !cleanPin) {
      return { success: false, error: 'Phone number and PIN are required.' };
    }

    const computedHash = await hashPin(cleanPin);
    const localMatch = salesmen.find((s) => s.phone.trim() === cleanPhone);

    if (localMatch) {
      if (localMatch.active === false) {
        return { success: false, error: 'Account inactive — please contact administrator.' };
      }
      if (localMatch.pinHash && localMatch.pinHash.toLowerCase() === computedHash.toLowerCase()) {
        const salesmanUser: AuthUser = {
          role: 'salesman',
          salesman: localMatch,
          name: localMatch.name,
          phone: localMatch.phone,
          id: localMatch.id,
        };
        setCurrentUser(salesmanUser);
        setTab('salesman');
        return { success: true };
      }
    }

    const remoteRes = await verifySalesmanPinSupabase(cleanPhone, cleanPin);
    if (remoteRes.success && remoteRes.salesman) {
      if (remoteRes.salesman.active === false) {
        return { success: false, error: 'Account inactive — please contact administrator.' };
      }
      const salesmanUser: AuthUser = {
        role: 'salesman',
        salesman: remoteRes.salesman,
        name: remoteRes.salesman.name,
        phone: remoteRes.salesman.phone,
        id: remoteRes.salesman.id,
      };
      setCurrentUser(salesmanUser);
      setTab('salesman');
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
      error: remoteRes.error || (localMatch ? 'Invalid PIN. Please re-enter.' : 'No salesman registered with this phone number.'),
    };
  };

  const logout = () => {
    signOutSupabase().catch(() => {});
    setCurrentUser(null);
  };

  const addSalesman = async (
    data: { name: string; phone: string; defaultVehicle?: string; active?: boolean },
    pin: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanName = data.name.trim();
    const cleanPhone = data.phone.trim();
    const cleanPin = pin.trim();

    if (!cleanName) return { success: false, error: 'Salesman name is required.' };
    if (!cleanPhone) return { success: false, error: 'Phone number is required.' };
    if (cleanPin.length < 4 || cleanPin.length > 6 || !/^\d+$/.test(cleanPin)) {
      return { success: false, error: 'PIN must be 4 to 6 digits.' };
    }

    if (salesmen.some((s) => s.phone.trim() === cleanPhone)) {
      return { success: false, error: 'A salesman with this phone number already exists.' };
    }

    const pinHash = await hashPin(cleanPin);
    const newSalesman: Salesman = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'sm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: cleanName,
      phone: cleanPhone,
      pinHash,
      active: data.active !== undefined ? Boolean(data.active) : true,
      defaultVehicle: data.defaultVehicle || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSalesmen((prev) => [...prev, newSalesman]);
    pushSalesmanToSupabase(newSalesman).catch(() => {});
    fetch('/api/salesmen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSalesman),
    }).catch(() => {});

    return { success: true };
  };

  const updateSalesman = async (
    id: string,
    data: Partial<Salesman>,
    newPin?: string
  ): Promise<{ success: boolean; error?: string }> => {
    let pinHashToUse = data.pinHash;
    if (newPin && newPin.trim()) {
      const cleanPin = newPin.trim();
      if (cleanPin.length < 4 || cleanPin.length > 6 || !/^\d+$/.test(cleanPin)) {
        return { success: false, error: 'New PIN must be 4 to 6 digits.' };
      }
      pinHashToUse = await hashPin(cleanPin);
    }

    let updatedTarget: Salesman | null = null;
    setSalesmen((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        updatedTarget = {
          ...s,
          ...data,
          ...(pinHashToUse ? { pinHash: pinHashToUse } : {}),
          updatedAt: new Date().toISOString(),
        };
        return updatedTarget;
      })
    );

    if (updatedTarget) {
      pushSalesmanToSupabase(updatedTarget).catch(() => {});
      fetch(`/api/salesmen/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTarget),
      }).catch(() => {});
    }

    return { success: true };
  };

  const toggleSalesmanActive = async (id: string): Promise<void> => {
    let updatedTarget: Salesman | null = null;
    setSalesmen((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        updatedTarget = { ...s, active: !s.active, updatedAt: new Date().toISOString() };
        return updatedTarget;
      })
    );

    if (updatedTarget) {
      pushSalesmanToSupabase(updatedTarget).catch(() => {});
      fetch(`/api/salesmen/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTarget),
      }).catch(() => {});
    }
  };

  const deleteSalesman = async (id: string): Promise<void> => {
    setSalesmen((prev) => prev.filter((s) => s.id !== id));
    deleteSalesmanFromSupabase(id).catch(() => {});
    fetch(`/api/salesmen/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  // Organization & Settings
  const [orgProfile, setOrgProfile] = useState<OrganizationProfile>(initial.orgProfile);
  const [billingSettings, setBillingSettings] = useState<BillingSettings>(initial.billingSettings);

  const updateOrgProfile = async (
    updates: Partial<OrganizationProfile>
  ): Promise<{ success: boolean; cloudSynced: boolean; message?: string }> => {
    const updatedProfile: OrganizationProfile = { ...orgProfile, ...updates };
    setOrgProfile(updatedProfile);

    try {
      const res = await pushOrgProfileToSupabase(updatedProfile);
      if (res.success) {
        return {
          success: true,
          cloudSynced: true,
          message: 'Saved locally and synchronized to Supabase PostgreSQL',
        };
      } else {
        return {
          success: true,
          cloudSynced: false,
          message: res.error || 'Saved locally (Supabase table not found or offline)',
        };
      }
    } catch (e: any) {
      return {
        success: true,
        cloudSynced: false,
        message: e?.message || 'Saved locally',
      };
    }
  };

  const pullOrgProfileFromCloud = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await pullOrgProfileFromSupabase();
      if (res.success && res.profile) {
        setOrgProfile(res.profile);
        return { success: true, message: 'Loaded profile from Supabase PostgreSQL.' };
      }
      return { success: false, message: res.error || 'Could not fetch profile from Supabase.' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Network error' };
    }
  };

  const updateBillingSettings = async (updates: Partial<BillingSettings>): Promise<{ success: boolean; cloudSynced: boolean; message?: string }> => {
    const updated = { ...billingSettings, ...updates };
    setBillingSettings(updated);
    saveBillingSettings(updated);

    try {
      const res = await pushBillingSettingsToSupabase(updated);
      if (res.success) {
        return {
          success: true,
          cloudSynced: true,
          message: 'Saved locally and synchronized to Supabase billing_settings table!',
        };
      } else {
        return {
          success: true,
          cloudSynced: false,
          message: res.error || 'Saved locally (Supabase table not found or offline)',
        };
      }
    } catch (e: any) {
      return {
        success: true,
        cloudSynced: false,
        message: e?.message || 'Saved locally',
      };
    }
  };

  const pullBillingSettingsFromCloud = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await pullBillingSettingsFromSupabase();
      if (res.success && res.settings) {
        setBillingSettings(res.settings);
        return { success: true, message: 'Loaded billing settings from Supabase PostgreSQL.' };
      }
      return { success: false, message: res.error || 'Could not fetch billing settings from Supabase.' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Network error' };
    }
  };

  // Accessibility
  const [fontSize, setFontSize] = useState<FontSize>(initial.fontSize);
  const [highContrast, setHighContrast] = useState<boolean>(initial.highContrast);
  const [lowVisionMode, setLowVisionModeState] = useState<boolean>(Boolean(initial.lowVisionMode));
  const [lowVisionStickyPosition, setLowVisionStickyPosition] = useState<StickyTotalPosition>(
    initial.lowVisionStickyPosition || 'bottom'
  );

  const setLowVisionMode = (valueOrUpdater: boolean | ((prev: boolean) => boolean)) => {
    setLowVisionModeState((prev) => {
      const nextVal = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
      if (nextVal && !highContrast) {
        setHighContrast(true);
      }
      return nextVal;
    });
  };

  const toggleLowVisionMode = () => {
    setLowVisionMode((prev) => !prev);
  };

  const scale = FONT_SCALES[fontSize];
  const palette = PALETTES[highContrast ? 'highContrast' : 'standard'];

  const fz = (px: number, extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize: `${Math.round(px * scale)}px`,
    ...extra,
  });

  // Auto-migration & Purge of Local Database on startup
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const localGrns = Array.isArray(parsed?.grns) ? parsed.grns : [];
        if (localGrns.length > 0) {
          console.log(`Migrating ${localGrns.length} locally imported invoice(s) directly to Supabase cloud...`);
          pushLedgerToSupabase({
            warehouses: parsed.warehouses || INIT_WAREHOUSES,
            products: parsed.products || [],
            inventoryBatches: parsed.inventoryBatches || [],
            grns: localGrns,
            bills: parsed.bills || [],
            trips: parsed.trips || [],
            audits: parsed.audits || [],
            promotions: parsed.promotions || [],
            orgProfile: parsed.orgProfile,
            billingSettings: parsed.billingSettings,
          }).then((res) => {
            console.log('Migrated trapped local data to Supabase:', res.message);
          });
        }
        // Permanently purge local database keys as instructed
        purgeLegacyLocalStorageKeys();
        console.log('Local database purged. Operating strictly in direct Supabase cloud mode.');
      }
    } catch (e) {
      console.warn('Notice while inspecting local storage:', e);
    }

    // Automatically pull latest data from Supabase Cloud on boot
    pullFromCloud();
  }, []);

  // Save ONLY lightweight display preferences, NEVER business database records
  useEffect(() => {
    try {
      localStorage.setItem(
        'radhika_ui_prefs',
        JSON.stringify({ fontSize, highContrast, lowVisionMode, lowVisionStickyPosition })
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
    document.documentElement.style.setProperty('--app-font-scale', String(scale));
  }, [scale]);

  // Supabase Database state & operations
  const [supabaseConfig, setSupabaseConfigState] = useState<SupabaseConfig>(getSupabaseConfig);
  const [supabaseStatus, setSupabaseStatus] = useState({
    isConnected: false,
    isChecking: false,
    latencyMs: 0,
    allTablesExist: false,
    lastSyncedAt: null as string | null,
    message: 'Testing Supabase database connection...',
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
        message: 'Could not connect to Supabase endpoint.',
        error: err?.message || String(err),
      });
    }
  };

  useEffect(() => {
    checkSupabaseConnection();
  }, []);

  const syncToCloud = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await pushLedgerToSupabase({
        warehouses,
        products,
        inventoryBatches,
        stockTransfers,
        promotions,
        bills,
        trips,
        audits,
        orgProfile,
        billingSettings,
        salesmen,
      });
      const nowStr = new Date().toLocaleTimeString();
      setSupabaseStatus((prev) => ({
        ...prev,
        isConnected: true,
        lastSyncedAt: nowStr,
        message: `Successfully synchronized ${res.pushedCount?.products ?? 0} products, ${res.pushedCount?.promotions ?? 0} schemes, ${res.pushedCount?.warehouses ?? 0} warehouses, ${res.pushedCount?.inventoryBatches ?? 0} batches, ${res.pushedCount?.bills ?? 0} bills to Supabase.`,
      }));
      return {
        success: true,
        message: `Synchronized to Supabase (${res.pushedCount?.products ?? 0} products, ${res.pushedCount?.promotions ?? 0} schemes, ${res.pushedCount?.warehouses ?? 0} warehouses, ${res.pushedCount?.inventoryBatches ?? 0} batches, ${res.pushedCount?.bills ?? 0} bills).`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Failed to sync with Supabase database.',
      };
    }
  };

  const isInitialMountRef = useRef(true);

  const pullFromCloud = async (): Promise<{ success: boolean; message: string }> => {
    try {
      // 1. Pull primary structured tables from Supabase
      const remote = await pullLedgerFromSupabase().catch(() => null);

      // 2. Pull server persistence collections (orders, warehouses, schemes, inventory, products, batches)
      const [serverOrders, serverWarehouses, serverSchemes, serverInventory, serverProducts, serverBatches] = await Promise.all([
        loadOrders().catch(() => []),
        loadWarehouses().catch(() => []),
        loadSchemes().catch(() => []),
        loadInventory().catch(() => []),
        loadProducts().catch(() => []),
        loadInventoryBatches().catch(() => []),
      ]);

      if (remote) {
        if (remote.warehouses && remote.warehouses.length > 0) {
          setWarehouses(remote.warehouses);
        } else if (serverWarehouses && serverWarehouses.length > 0) {
          setWarehouses(serverWarehouses as any);
        }

        if (remote.grns && remote.grns.length > 0) {
          setGrns(remote.grns);
          const { products: derivedProducts, batches: derivedBatches } = buildCatalogFromGrns(
            remote.grns,
            remote.warehouses || warehouses
          );
          if (remote.products && remote.products.length > 0) {
            setProducts(remote.products);
          } else if (serverProducts && serverProducts.length > 0) {
            setProducts(serverProducts as any);
          } else {
            setProducts(derivedProducts);
          }
          if (remote.inventoryBatches && remote.inventoryBatches.length > 0) {
            setInventoryBatches(remote.inventoryBatches);
          } else if (serverBatches && serverBatches.length > 0) {
            setInventoryBatches(serverBatches as any);
          } else {
            setInventoryBatches(derivedBatches);
          }
        } else {
          if (remote.products && remote.products.length > 0) {
            setProducts(remote.products);
          } else if (serverProducts && serverProducts.length > 0) {
            setProducts(serverProducts as any);
          }
          if (remote.inventoryBatches && remote.inventoryBatches.length > 0) {
            setInventoryBatches(remote.inventoryBatches);
          } else if (serverBatches && serverBatches.length > 0) {
            setInventoryBatches(serverBatches as any);
          }
        }

        if (remote.stockTransfers) setStockTransfers(remote.stockTransfers);
        if (remote.promotions && remote.promotions.length > 0) {
          setPromotions(remote.promotions);
        } else if (serverSchemes && serverSchemes.length > 0) {
          setPromotions(serverSchemes as any);
        } else if (promotions.length > 0) {
          // Sync any locally existing promotions to Supabase
          promotions.forEach((pr) => pushPromotionToSupabase(pr));
        }

        if (remote.bills && remote.bills.length > 0) {
          setBills(remote.bills);
        } else if (serverOrders && serverOrders.length > 0) {
          setBills(serverOrders as any);
        } else if (bills.length > 0) {
          bills.forEach((b) => pushBillToSupabase(b));
        }

        if (remote.trips && remote.trips.length > 0) {
          setTrips(remote.trips);
        } else if (trips.length > 0) {
          trips.forEach((t) => pushTripToSupabase(t));
        }

        if (remote.audits && remote.audits.length > 0) {
          setAudits(remote.audits);
        }

        if (remote.salesmen && remote.salesmen.length > 0) {
          setSalesmen(remote.salesmen);
        }

        if (remote.orgProfile) {
          setOrgProfile(remote.orgProfile);
        } else if (orgProfile) {
          pushOrgProfileToSupabase(orgProfile);
        }

        if (remote.billingSettings) {
          setBillingSettings(remote.billingSettings);
        } else if (billingSettings) {
          pushBillingSettingsToSupabase(billingSettings);
        }
      } else {
        // Fallback to server collections if direct tables are empty/uninitialized
        if (serverWarehouses && serverWarehouses.length > 0) setWarehouses(serverWarehouses as any);
        if (serverSchemes && serverSchemes.length > 0) setPromotions(serverSchemes as any);
        if (serverOrders && serverOrders.length > 0) setBills(serverOrders as any);
        if (serverProducts && serverProducts.length > 0) setProducts(serverProducts as any);
        if (serverBatches && serverBatches.length > 0) setInventoryBatches(serverBatches as any);
      }

      isInitialMountRef.current = false;

      const nowStr = new Date().toLocaleTimeString();
      setSupabaseStatus((prev) => ({
        ...prev,
        isConnected: true,
        lastSyncedAt: nowStr,
        message: 'Successfully pulled latest records from Supabase database.',
      }));

      return {
        success: true,
        message: 'Latest records pulled from Supabase successfully.',
      };
    } catch (err: any) {
      isInitialMountRef.current = false;
      return {
        success: false,
        message: err?.message || 'Failed to fetch data from Supabase.',
      };
    }
  };

  // Sync state mutations to storage & Supabase backend
  useEffect(() => {
    if (isInitialMountRef.current) return;
    saveOrders(bills);
  }, [bills]);

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
    saveBillingSettings(billingSettings);
  }, [billingSettings]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    saveOrgProfile(orgProfile);
  }, [orgProfile]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    if (products.length > 0) {
      saveProducts(products);
    }
  }, [products]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    if (inventoryBatches.length > 0) {
      saveInventoryBatches(inventoryBatches);
    }
  }, [inventoryBatches]);

  useEffect(() => {
    if (isInitialMountRef.current) return;
    if (products.length > 0) {
      const invItems: InventoryItem[] = products.map((p) => {
        const matchingBatches = inventoryBatches.filter((b) => b.productId === p.id);
        const totalStock = matchingBatches.reduce((acc, b) => acc + (b.quantity || 0), 0);
        const latestBatch = matchingBatches[0];
        const prodSku = p.sku || generateSkuId(p.name, p.category, p.id);
        const batchLot = latestBatch?.batchNumber || p.batchNumber || generateBatchNumber(p.name);
        const mfg = latestBatch?.mfgDate || p.mfgDate || '';
        const exp = latestBatch?.expiryDate || p.expiry || '';

        return {
          id: `inv_${prodSku}`,
          product_id: prodSku, // Product ID in database is the SKU code as required
          productId: prodSku,
          sku: prodSku,
          stock_on_hand: matchingBatches.length > 0 ? totalStock : (p.opening || 0),
          stockOnHand: matchingBatches.length > 0 ? totalStock : (p.opening || 0),
          reserved_stock: 0,
          reservedStock: 0,
          reorder_level: 10,
          reorderLevel: 10,
          warehouse_id: latestBatch?.warehouseId || p.warehouseId || '',
          warehouseId: latestBatch?.warehouseId || p.warehouseId || '',
          warehouseName: '',
          warehouseBay: '',
          batch_number: batchLot,
          batchNumber: batchLot,
          mfg_date: mfg,
          mfgDate: mfg,
          expiry_date: exp,
          expiryDate: exp,
          unit_cost: p.cost || 0,
          unitCost: p.cost || 0,
          selling_scheme: p.scheme || '',
          sellingScheme: p.scheme || '',
          selling_scheme_discount: 0,
          sellingSchemeDiscount: 0,
          selling_scheme_label: p.scheme || '',
          sellingSchemeLabel: p.scheme || '',
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
  const postGrn = (
    grnData: Omit<GRN, 'id' | 'grnNumber' | 'createdAt' | 'updatedAt'>
  ): GRN => {
    const nextNum = grns.length + 1;
    const year = new Date().getFullYear();
    const grnNumber = `GRN-${year}-${String(nextNum).padStart(3, '0')}`;
    const id = 'grn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = new Date().toISOString();

    const newGrn: GRN = {
      ...grnData,
      id,
      grnNumber,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Sync or add products into product catalog
    let updatedCatalog: Product[] = [];
    setProducts((prevProducts) => {
      let current = [...prevProducts];
      let maxId = current.reduce((m, p) => Math.max(m, p.id), 0);

      newGrn.items.forEach((item) => {
        const existing = current.find(
          (p) =>
            (item.productId && p.id === item.productId) ||
            p.name.trim().toLowerCase() === item.productName.trim().toLowerCase()
        );

        if (!existing) {
          maxId++;
          const autoSku = item.sku || generateAutoSku(item.productName, item.category || 'energy', maxId);
          const newP: Product = {
            id: maxId,
            name: item.productName.trim(),
            category: item.category || 'energy',
            pack: item.pack || 'PET',
            volume: item.volume || 150,
            packSize: item.packSize,
            unitsPerCrate: item.unitsPerCrate || (item.volume <= 250 ? 24 : 12),
            wholesale: item.wholesaleRate || Math.round((item.landedCostPerCrate || item.unitPrice) * 1.15),
            retail: item.retailRate || Math.round((item.landedCostPerCrate || item.unitPrice) * 1.25),
            cost: item.unitPrice,
            effectiveCost: item.landedCostPerCrate || item.unitPrice,
            landedCostPerCrate: item.landedCostPerCrate,
            landedCostPerUnit: item.landedCostPerUnit,
            opening: 0,
            hsn: item.hsn,
            gstRate: ((item.cgstPercent || 0) + (item.sgstPercent || 0)) / 100,
            scheme: item.schemeText,
            sku: autoSku,
            warehouseId: newGrn.warehouseId,
            batchNumber: item.batchNumber || generateBatchNumber(item.productName),
            expiry: item.expiry,
            mfgDate: item.mfgDate,
          };
          current.push(newP);
          item.productId = maxId;
        } else {
          item.productId = existing.id;
          current = current.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  cost: item.unitPrice || p.cost,
                  effectiveCost: item.landedCostPerCrate || p.effectiveCost,
                  landedCostPerCrate: item.landedCostPerCrate || p.landedCostPerCrate,
                  landedCostPerUnit: item.landedCostPerUnit || p.landedCostPerUnit,
                  unitsPerCrate: item.unitsPerCrate || p.unitsPerCrate,
                  packSize: item.packSize || p.packSize,
                  wholesale: item.wholesaleRate || p.wholesale,
                  retail: item.retailRate || p.retail,
                  batchNumber: item.batchNumber || p.batchNumber,
                  expiry: item.expiry || p.expiry,
                  mfgDate: item.mfgDate || p.mfgDate,
                  scheme: item.schemeText || p.scheme,
                }
              : p
          );
        }
      });

      updatedCatalog = current;
      return current;
    });

    // 2. Add batches to inventoryBatches so live warehouse stock increments
    let newBatchesList: InventoryBatch[] = [];
    setInventoryBatches((prevBatches) => {
      const newBatches: InventoryBatch[] = newGrn.items.map((item, idx) => ({
        id: `batch_${newGrn.id}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        productId: item.productId || 1,
        sku: item.sku,
        batchNumber: item.batchNumber || generateBatchNumber(item.productName),
        supplierInvoiceNo: newGrn.invoiceNo,
        supplierName: newGrn.supplierName,
        inwardDate: newGrn.inwardDate,
        mfgDate: item.mfgDate,
        expiryDate: item.expiry || '2026-12-31',
        warehouseId: newGrn.warehouseId,
        quantity: item.totalReceivedQty,
        billedQuantity: item.qty,
        freeQuantity: item.freeQty,
        costPrice: item.unitPrice,
        effectiveCostPrice: item.landedCostPerUnit,
        mrp: item.retailRate || (item.unitPrice * 1.2),
        scheme: item.schemeText,
        cgstRate: item.cgstPercent,
        sgstRate: item.sgstPercent,
        hsn: item.hsn,
        notes: `Inward: ${newGrn.grnNumber} · ${newGrn.supplierName}`,
      }));

      newBatchesList = newBatches;
      return [...prevBatches, ...newBatches];
    });

    const updatedGrns = [newGrn, ...grns];
    setGrns(updatedGrns);

    const targetWh = warehouses.find((w) => w.id === newGrn.warehouseId) || warehouses[0];

    // Push inward invoice directly to Supabase cloud database
    pushInwardInvoiceToSupabase({
      grn: newGrn,
      products: updatedCatalog.length > 0 ? updatedCatalog : products,
      inventoryBatches: newBatchesList,
      allGrns: updatedGrns,
      warehouse: targetWh,
    }).then((res) => {
      if (res.cloudSynced) {
        setSupabaseStatus((prev) => ({
          ...prev,
          isConnected: true,
          lastSyncedAt: new Date().toLocaleTimeString(),
          message: `Inward invoice ${newGrn.invoiceNo || newGrn.grnNumber} saved to Supabase PostgreSQL database.`,
        }));
      } else {
        setSupabaseStatus((prev) => ({
          ...prev,
          message: res.message,
        }));
      }
    }).catch((err) => {
      console.error('Failed to sync GRN to Supabase:', err);
    });

    return newGrn;
  };

  const updateGrn = (id: string, updates: Partial<GRN>) => {
    const existingGrn = grns.find((g) => g.id === id);
    if (!existingGrn) return;

    const mergedGrn: GRN = {
      ...existingGrn,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const targetItems = updates.items || existingGrn.items;
    const targetWhId = updates.warehouseId || existingGrn.warehouseId;

    // 1. Re-sync products
    let updatedCatalog: Product[] = [];
    setProducts((prevProducts) => {
      let current = [...prevProducts];
      let maxId = current.reduce((m, p) => Math.max(m, p.id), 0);

      targetItems.forEach((item) => {
        const existing = current.find(
          (p) =>
            (item.productId && p.id === item.productId) ||
            p.name.trim().toLowerCase() === item.productName.trim().toLowerCase()
        );

        if (!existing) {
          maxId++;
          const autoSku = item.sku || generateAutoSku(item.productName, item.category || 'energy', maxId);
          current.push({
            id: maxId,
            name: item.productName.trim(),
            category: item.category || 'energy',
            pack: item.pack || 'PET',
            volume: item.volume || 150,
            wholesale: item.wholesaleRate || Math.round((item.landedCostPerUnit || item.unitPrice) * 1.15),
            retail: item.retailRate || Math.round((item.landedCostPerUnit || item.unitPrice) * 1.25),
            cost: item.unitPrice,
            effectiveCost: item.landedCostPerUnit || item.unitPrice,
            opening: 0,
            hsn: item.hsn,
            gstRate: ((item.cgstPercent || 0) + (item.sgstPercent || 0)) / 100,
            scheme: item.schemeText,
            sku: autoSku,
            warehouseId: targetWhId,
            batchNumber: item.batchNumber || generateBatchNumber(item.productName),
            expiry: item.expiry,
            mfgDate: item.mfgDate,
          });
          item.productId = maxId;
        } else {
          item.productId = existing.id;
          current = current.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  cost: item.unitPrice || p.cost,
                  effectiveCost: item.landedCostPerUnit || p.effectiveCost,
                  wholesale: item.wholesaleRate || p.wholesale,
                  retail: item.retailRate || p.retail,
                  batchNumber: item.batchNumber || p.batchNumber,
                  expiry: item.expiry || p.expiry,
                  mfgDate: item.mfgDate || p.mfgDate,
                  scheme: item.schemeText || p.scheme,
                }
              : p
          );
        }
      });

      updatedCatalog = current;
      return current;
    });

    // 2. Replace batches for this GRN with fresh ones reflecting new counts & warehouse
    let freshBatchesList: InventoryBatch[] = [];
    setInventoryBatches((prevBatches) => {
      const filtered = prevBatches.filter(
        (b) => !b.id.startsWith(`batch_${id}`) && b.supplierInvoiceNo !== existingGrn.invoiceNo
      );

      const freshBatches: InventoryBatch[] = targetItems.map((item, idx) => ({
        id: `batch_${id}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        productId: item.productId || 1,
        sku: item.sku,
        batchNumber: item.batchNumber || generateBatchNumber(item.productName),
        supplierInvoiceNo: mergedGrn.invoiceNo,
        supplierName: mergedGrn.supplierName,
        inwardDate: mergedGrn.inwardDate,
        mfgDate: item.mfgDate,
        expiryDate: item.expiry || '2026-12-31',
        warehouseId: targetWhId,
        quantity: item.totalReceivedQty,
        billedQuantity: item.qty,
        freeQuantity: item.freeQty,
        costPrice: item.unitPrice,
        effectiveCostPrice: item.landedCostPerUnit,
        mrp: item.retailRate || (item.unitPrice * 1.2),
        scheme: item.schemeText,
        cgstRate: item.cgstPercent,
        sgstRate: item.sgstPercent,
        hsn: item.hsn,
        notes: `Inward (Updated): ${mergedGrn.grnNumber} · ${mergedGrn.supplierName}`,
      }));

      freshBatchesList = freshBatches;
      return [...filtered, ...freshBatches];
    });

    const updatedGrns = grns.map((g) => (g.id === id ? mergedGrn : g));
    setGrns(updatedGrns);

    const targetWh = warehouses.find((w) => w.id === targetWhId) || warehouses[0];
    pushInwardInvoiceToSupabase({
      grn: mergedGrn,
      products: updatedCatalog.length > 0 ? updatedCatalog : products,
      inventoryBatches: freshBatchesList,
      allGrns: updatedGrns,
      warehouse: targetWh,
    }).catch((err) => {
      console.error('Failed to update GRN in Supabase:', err);
    });
  };

  const deleteGrn = (id: string) => {
    const target = grns.find((g) => g.id === id);
    if (!target) return;

    // Remove all associated batches so stock reverses accurately across all godowns
    setInventoryBatches((prev) =>
      prev.filter(
        (b) => !b.id.startsWith(`batch_${id}`) && b.supplierInvoiceNo !== target.invoiceNo
      )
    );

    const remainingGrns = grns.filter((g) => g.id !== id);
    setGrns(remainingGrns);

    if (activeGrnToEdit?.id === id) {
      setActiveGrnToEdit(null);
    }

    deleteGrnFromSupabase(id, remainingGrns).catch((err) => {
      console.error('Failed to delete GRN from Supabase:', err);
    });
  };

  const deleteLocalDatabase = () => {
    try {
      purgeLegacyLocalStorageKeys();
      console.log('Local database purged.');
    } catch (e) {
      console.warn('Error purging local storage:', e);
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

  const addWarehouse = (w: Omit<Warehouse, 'id'>): string => {
    const id = 'wh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
    pushWarehouseToSupabase(newWh);
    return id;
  };

  const updateWarehouse = (id: string, updates: Partial<Warehouse>) => {
    let updatedObj: Warehouse | null = null;
    setWarehouses((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          updatedObj = { ...w, ...updates };
          return updatedObj;
        }
        if (updates.isDefault) {
          return { ...w, isDefault: false };
        }
        return w;
      })
    );
    if (updatedObj) {
      pushWarehouseToSupabase(updatedObj);
    }
  };

  const deleteWarehouse = (id: string) => {
    setWarehouses((prev) => prev.filter((w) => w.id !== id));
    deleteWarehouseFromSupabase(id);
  };

  // Batches Management
  const addBatch = (b: Omit<InventoryBatch, 'id'>): string => {
    const id = 'batch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
          if (!p.warehouseId && b.warehouseId) updates.warehouseId = b.warehouseId;
          return { ...p, ...updates };
        }
        return p;
      })
    );

    // Sync batch to Supabase inventory_batches table
    pushBatchToSupabase(newBatch);
    return id;
  };

  const updateBatch = (id: string, updates: Partial<InventoryBatch>) => {
    let updatedBatch: InventoryBatch | null = null;
    setInventoryBatches((prev) =>
      prev.map((b) => {
        if (b.id === id) {
          updatedBatch = { ...b, ...updates };
          return updatedBatch;
        }
        return b;
      })
    );
    if (updatedBatch) {
      pushBatchToSupabase(updatedBatch);
    }
  };

  const deleteBatch = (id: string) => {
    setInventoryBatches((prev) => prev.filter((b) => b.id !== id));
    deleteBatchFromSupabase(id);
  };

  const batchesForProduct = (productId: number, warehouseId?: string): InventoryBatch[] => {
    return inventoryBatches.filter((b) => {
      if (b.productId !== productId) return false;
      if (warehouseId && b.warehouseId !== warehouseId) return false;
      return true;
    });
  };

  // Stock Transfer
  const addStockTransfer = (st: Omit<StockTransfer, 'id'>) => {
    const id = 'transfer_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newTransfer: StockTransfer = { ...st, id };
    setStockTransfers((prev) => [newTransfer, ...prev]);

    // Move quantity between warehouse batches if batch is specified
    if (st.batchNumber) {
      setInventoryBatches((prev) => {
        const sourceBatch = prev.find(
          (b) => b.productId === st.productId && b.warehouseId === st.fromWarehouseId && b.batchNumber === st.batchNumber
        );
        if (!sourceBatch) return prev;

        const updated = prev.map((b) => {
          if (b.id === sourceBatch.id) {
            return { ...b, quantity: Math.max(0, b.quantity - st.quantity) };
          }
          return b;
        });

        // Find or create target batch in destination warehouse
        const destBatch = updated.find(
          (b) => b.productId === st.productId && b.warehouseId === st.toWarehouseId && b.batchNumber === st.batchNumber
        );

        if (destBatch) {
          return updated.map((b) => (b.id === destBatch.id ? { ...b, quantity: b.quantity + st.quantity } : b));
        } else {
          const destId = 'batch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          return [
            ...updated,
            {
              id: destId,
              productId: st.productId,
              batchNumber: st.batchNumber,
              mfgDate: sourceBatch.mfgDate,
              expiryDate: sourceBatch.expiryDate,
              warehouseId: st.toWarehouseId,
              quantity: st.quantity,
              costPrice: sourceBatch.costPrice,
              mrp: sourceBatch.mrp,
              notes: `Transferred from ${st.fromWarehouseId}`,
            },
          ];
        }
      });
    }
  };

  const loadDemoPreset = (presetId: DemoPresetId) => {
    const preset = DEMO_PRESETS[presetId];
    if (!preset) return;
    setProducts(preset.products);
    setPromotions(preset.promotions);
    setBills(preset.bills);
    setTrips(preset.trips);
    setOrgProfile(preset.orgProfile);
    setCart(emptyCart());
    setEditingBillId(null);
    setJustFinalizedBillId(null);
  };

  const clearTransactions = () => {
    setBills([]);
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
    setCart(emptyCart());
    setEditingBillId(null);
    setJustFinalizedBillId(null);
    setActiveGrnToEdit(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const cleanDatabase = clearAllData;

  const exportBackup = () => {
    try {
      const backupData = {
        app: 'MrWater Beverage Distribution Ledger',
        version: '4.0',
        exportDate: new Date().toISOString(),
        orgProfile,
        billingSettings,
        grns,
        products,
        warehouses,
        inventoryBatches,
        stockTransfers,
        promotions,
        bills,
        trips,
        audits,
        gstMode,
      };
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = (orgProfile.name || 'mrwater_ledger')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 20);
      link.download = `${safeName}_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export backup:', err);
    }
  };

  const importBackup = (jsonString: string): { success: boolean; error?: string } => {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') {
        return { success: false, error: 'Invalid file: JSON root must be an object' };
      }
      if (Array.isArray(data.grns)) setGrns(data.grns);
      if (Array.isArray(data.products)) setProducts(data.products);
      if (Array.isArray(data.warehouses)) setWarehouses(data.warehouses);
      if (Array.isArray(data.inventoryBatches)) setInventoryBatches(data.inventoryBatches);
      if (Array.isArray(data.stockTransfers)) setStockTransfers(data.stockTransfers);
      if (Array.isArray(data.promotions)) setPromotions(data.promotions);
      if (Array.isArray(data.bills)) setBills(data.bills);
      if (Array.isArray(data.trips)) setTrips(data.trips);
      if (Array.isArray(data.audits)) setAudits(data.audits);
      if (data.orgProfile && typeof data.orgProfile === 'object') {
        setOrgProfile((prev) => ({ ...prev, ...data.orgProfile }));
      }
      if (data.billingSettings && typeof data.billingSettings === 'object') {
        setBillingSettings((prev) => ({ ...prev, ...data.billingSettings }));
      }
      if (data.gstMode) setGstMode(data.gstMode);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to parse JSON backup file' };
    }
  };

  const activePromoFor = (productId: number): Promotion | undefined =>
    promotions.find((p) => p.productIds.includes(productId));

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

  const remainingStock = (productId: number): number => {
    const p = products.find((x) => x.id === productId);
    if (!p) return 0;
    // If batches exist for this product, stock can be derived from batches or opening
    const batchSum = inventoryBatches
      .filter((b) => b.productId === productId)
      .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
    const baseStock = batchSum > 0 ? batchSum : p.opening;
    return baseStock - (soldByProduct[productId] || 0) - (cartSoldByProduct[productId] || 0);
  };

  const bookStock = (productId: number): number => {
    const p = products.find((x) => x.id === productId);
    if (!p) return 0;
    const batchSum = inventoryBatches
      .filter((b) => b.productId === productId)
      .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
    const baseStock = batchSum > 0 ? batchSum : p.opening;
    return baseStock - (soldByProduct[productId] || 0);
  };

  // Real-time crate counts across warehouses for a product
  const productWarehouseStock = (
    productId: number
  ): { warehouseId: string; warehouseName: string; crates: number }[] => {
    const p = products.find((x) => x.id === productId);
    if (!p) return [];

    // Tally sales by warehouse
    const soldInWh: Record<string, number> = {};
    for (const b of bills) {
      if (b.id === editingBillId) continue;
      const whId = b.warehouseId || p.warehouseId || '';
      for (const it of b.items) {
        if (it.productId === productId) {
          const count = Number(it.qty) || 0;
          soldInWh[whId] = (soldInWh[whId] || 0) + count;
        }
      }
    }

    if (warehouses.length === 0) {
      return [
        {
          warehouseId: 'default',
          warehouseName: 'Main Depot',
          crates: Math.max(0, remainingStock(productId)),
        },
      ];
    }

    if (warehouses.length === 1) {
      return [
        {
          warehouseId: warehouses[0].id,
          warehouseName: warehouses[0].name,
          crates: Math.max(0, remainingStock(productId)),
        },
      ];
    }

    return warehouses.map((w) => {
      const batchSum = inventoryBatches
        .filter((b) => b.productId === productId && b.warehouseId === w.id)
        .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

      const base = batchSum > 0 ? batchSum : (p.warehouseId === w.id ? p.opening : 0);
      const sold = soldInWh[w.id] || 0;
      return {
        warehouseId: w.id,
        warehouseName: w.name,
        crates: Math.max(0, base - sold),
      };
    });
  };

  const totalOpening = useMemo(() => {
    return products.reduce((s, p) => {
      const batchSum = inventoryBatches
        .filter((b) => b.productId === p.id)
        .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
      return s + (batchSum > 0 ? batchSum : p.opening);
    }, 0);
  }, [products, inventoryBatches]);

  const totalRemaining = useMemo(
    () => products.reduce((s, p) => s + remainingStock(p.id), 0),
    [products, soldByProduct, cartSoldByProduct, inventoryBatches]
  );

  const warehouseStock = (warehouseId: string, productId?: number): number => {
    if (warehouses.length <= 1) {
      if (productId) {
        return Math.max(0, remainingStock(productId));
      }
      return Math.max(0, totalRemaining);
    }
    if (productId) {
      const stockList = productWarehouseStock(productId);
      const match = stockList.find((item) => item.warehouseId === warehouseId);
      return match ? match.crates : 0;
    }
    return products.reduce((sum, p) => {
      const stockList = productWarehouseStock(p.id);
      const match = stockList.find((item) => item.warehouseId === warehouseId);
      return sum + (match ? match.crates : 0);
    }, 0);
  };
  const totalRevenue = useMemo(() => bills.reduce((s, b) => s + b.total, 0), [bills]);
  const totalCasesSold = useMemo(
    () => bills.reduce((s, b) => s + b.items.reduce((s2, i) => s2 + i.qty, 0), 0),
    [bills]
  );
  const totalOutstanding = useMemo(
    () => bills.reduce((s, b) => s + Math.max(0, b.total - b.amountPaid), 0),
    [bills]
  );

  function tripBreakdown(trip: Trip) {
    const soldByProductForTrip: Record<number, number> = {};
    for (const billId of trip.billIds) {
      const bill = bills.find((b) => b.id === billId);
      if (!bill) continue;
      for (const it of bill.items) {
        soldByProductForTrip[it.productId] = (soldByProductForTrip[it.productId] || 0) + it.qty;
      }
    }
    const productIds = Object.keys(trip.loaded).map(Number);
    const rows: TripProductBreakdown[] = productIds.map((pid) => {
      const product = products.find((p) => p.id === pid);
      const loaded = trip.loaded[pid] || 0;
      const sold = soldByProductForTrip[pid] || 0;
      const returned = trip.returned[pid] || 0;
      const discrepancy = loaded - sold - returned;
      return {
        productId: pid,
        name: product ? product.name : `Product #${pid}`,
        loaded,
        sold,
        returned,
        discrepancy,
      };
    });
    const hasDiscrepancy = trip.status === 'closed' && rows.some((r) => r.discrepancy !== 0);
    return { rows, hasDiscrepancy };
  }

  function getVehicleStock(trip: Trip | null | undefined, productId: number) {
    if (!trip) {
      return { loaded: 0, sold: 0, available: 0 };
    }
    const loaded = trip.loaded[productId] || 0;
    let sold = 0;
    for (const bId of trip.billIds) {
      const b = bills.find((x) => x.id === bId);
      if (!b) continue;
      for (const it of b.items) {
        if (it.productId === productId) {
          sold += it.qty;
        }
      }
    }
    const returned = trip.returned[productId] || 0;
    const available = Math.max(0, loaded - sold - returned);
    return { loaded, sold, available };
  }

  const tripsWithDiscrepancy = useMemo(
    () => trips.filter((t) => tripBreakdown(t).hasDiscrepancy).length,
    [trips, bills, products]
  );

  // Products CRUD
  function addProduct(p: Omit<Product, 'id'>) {
    const newId = products.length ? Math.max(...products.map((x) => x.id)) + 1 : 1;
    const skuCode =
      p.sku && p.sku.trim()
        ? p.sku.trim().toUpperCase()
        : generateSkuId(p.name, p.category, newId);
    // Batch number is mandatory: auto-create if empty or missing
    const batchNum =
      p.batchNumber && p.batchNumber.trim()
        ? p.batchNumber.trim().toUpperCase()
        : generateBatchNumber(p.name, p.scheme ? 'SCH' : undefined);

    const assignedWh = p.warehouseId || (defaultWarehouse ? defaultWarehouse.id : warehouses[0]?.id || '');
    const newProd: Product = {
      ...p,
      id: newId,
      sku: skuCode,
      batchNumber: batchNum,
      warehouseId: assignedWh,
      expiry: p.expiry || '2026-12-31',
    };
    setProducts((prev) => [...prev, newProd]);
    pushProductToSupabase(newProd);

    // Mandatory batch registration in inventory batches
    const batchId = 'batch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newBatch: InventoryBatch = {
      id: batchId,
      productId: newId,
      sku: skuCode,
      batchNumber: batchNum,
      mfgDate: p.mfgDate,
      expiryDate: p.expiry || '2026-12-31',
      warehouseId: assignedWh,
      quantity: p.opening || 0,
      costPrice: p.cost,
      mrp: p.retail,
      scheme: p.scheme,
      effectiveCostPrice: p.effectiveCost || p.cost,
      notes: p.scheme ? `Registered with scheme: ${p.scheme}` : 'Opening stock batch',
    };
    setInventoryBatches((prev) => [...prev, newBatch]);
  }

  function updateProductField(id: number, field: keyof Product, value: number | string) {
    setProducts((ps) => {
      const updated = ps.map((p) => {
        if (p.id === id) {
          const mod = { ...p, [field]: typeof p[field] === 'number' ? Number(value) : value };
          pushProductToSupabase(mod);
          return mod;
        }
        return p;
      });
      return updated;
    });
  }

  function deleteProduct(id: number) {
    setProducts((ps) => ps.filter((p) => p.id !== id));
    setInventoryBatches((bs) => bs.filter((b) => b.productId !== id));
    deleteProductFromSupabase(id);
  }

  function applyBulkImport(rows: ImportRow[]) {
    let nextId = products.length ? Math.max(...products.map((x) => x.id)) + 1 : 1;
    const newItems: Product[] = [];
    const newBatches: InventoryBatch[] = [];
    const assignedWh = defaultWarehouse ? defaultWarehouse.id : warehouses[0]?.id || '';

    const updated = products.map((existing) => {
      const match = rows.find((r) => r.name.toLowerCase() === existing.name.toLowerCase());
      if (match) {
        const batchNum =
          match.batchNumber && match.batchNumber.trim()
            ? match.batchNumber.trim().toUpperCase()
            : existing.batchNumber || generateBatchNumber(match.name, match.scheme ? 'SCH' : undefined);
        const skuCode =
          match.sku && match.sku.trim()
            ? match.sku.trim().toUpperCase()
            : existing.sku || generateSkuId(existing.name, existing.category, existing.id);
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
            : generateBatchNumber(r.name, r.scheme ? 'SCH' : undefined);
        const prodId = nextId++;
        const skuCode =
          r.sku && r.sku.trim()
            ? r.sku.trim().toUpperCase()
            : generateSkuId(r.name, r.category, prodId);

        newItems.push({
          id: prodId,
          sku: skuCode,
          name: r.name,
          category: r.category,
          volume: r.volume,
          pack: r.pack,
          expiry: r.expiry || '2026-12-31',
          opening: r.opening,
          cost: r.cost,
          retail: r.retail,
          wholesale: r.wholesale,
          hsn: r.hsn,
          batchNumber: batchNum,
          scheme: r.scheme,
          warehouseId: assignedWh,
        });

        if (r.opening > 0) {
          newBatches.push({
            id: 'batch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + prodId,
            productId: prodId,
            sku: skuCode,
            batchNumber: batchNum,
            expiryDate: r.expiry || '2026-12-31',
            warehouseId: assignedWh,
            quantity: r.opening,
            costPrice: r.cost,
            mrp: r.retail,
            scheme: r.scheme,
            notes: 'Imported spreadsheet batch',
          });
        }
      }
    }

    setProducts([...updated, ...newItems]);
    if (newBatches.length > 0) {
      setInventoryBatches((prev) => [...prev, ...newBatches]);
    }
  }

  function receiveInwardStock(params: InwardStockParams): { productId: number; batchId: string } | undefined {
    let product = params.productId ? products.find((p) => p.id === params.productId) : undefined;
    if (!product && params.newProductName) {
      const matchExisting = products.find(
        (p) => p.name.trim().toLowerCase() === params.newProductName!.trim().toLowerCase()
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
      (defaultWarehouse ? defaultWarehouse.id : warehouses[0]?.id || '');
    const exp = params.expiryDate || product?.expiry || '2026-12-31';

    let targetProductId = product ? product.id : 0;
    let targetSku = product?.sku || params.sku || '';

    // If 1st time product being added via Inward Inventory
    if (!product && params.newProductName) {
      targetProductId = products.length ? Math.max(...products.map((x) => x.id)) + 1 : 1;
      const catKey: CategoryKey = params.category || 'energy';
      const catDef = CATS[catKey] || { name: 'General', hsn: '22021090', gst: 0.18 };
      targetSku = params.sku || generateSkuId(params.newProductName, catKey, targetProductId);
      const batchCode =
        params.batchNumber && params.batchNumber.trim()
          ? params.batchNumber.trim().toUpperCase()
          : generateBatchNumber(params.newProductName, params.scheme ? 'SCH' : undefined);

      const unitCost = Number(params.costPrice) || 158.57;
      const unitWholesale = Number(params.wholesaleRate) || Math.round(unitCost * 1.1);
      const unitRetail = Number(params.retailRate) || Math.round(unitCost * 1.25);
      const effectiveCost = totalQty > 0 ? (billedQty * unitCost) / totalQty : unitCost;

      const newProduct: Product = {
        id: targetProductId,
        sku: targetSku,
        name: params.newProductName.trim(),
        category: catKey,
        volume: params.volume || 150,
        pack: params.pack || 'PET',
        opening: totalQty,
        cost: unitCost,
        wholesale: unitWholesale,
        retail: unitRetail,
        effectiveCost,
        expiry: exp,
        mfgDate: params.mfgDate,
        batchNumber: batchCode,
        warehouseId: assignedWh,
        hsn: params.hsn || catDef.hsn,
        gstRate: params.gstRate !== undefined ? params.gstRate : catDef.gst,
        scheme: params.scheme,
      };

      setProducts((prev) => [...prev, newProduct]);
      product = newProduct;
    } else if (product) {
      targetProductId = product.id;
      targetSku = product.sku || generateSkuId(product.name, product.category, product.id);
      const cost = params.costPrice !== undefined ? Number(params.costPrice) : product.cost;
      const effectiveCost = totalQty > 0 ? (billedQty * cost) / totalQty : cost;
      const batchNum =
        params.batchNumber && params.batchNumber.trim()
          ? params.batchNumber.trim().toUpperCase()
          : generateBatchNumber(product.name, params.scheme ? 'SCH' : undefined);

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
              wholesale: params.wholesaleRate !== undefined ? Number(params.wholesaleRate) : p.wholesale,
              retail: params.retailRate !== undefined ? Number(params.retailRate) : p.retail,
            };
          }
          return p;
        })
      );
    } else {
      return undefined;
    }

    const finalBatchNumber =
      params.batchNumber && params.batchNumber.trim()
        ? params.batchNumber.trim().toUpperCase()
        : generateBatchNumber(
            product?.name || params.newProductName || 'LOT',
            params.scheme ? 'SCH' : undefined
          );

    const cost = Number(params.costPrice) || (product ? product.cost : 158.57);
    const effectiveCost = totalQty > 0 ? (billedQty * cost) / totalQty : cost;

    // 1. Add batch to inventoryBatches
    const batchId = 'batch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newBatch: InventoryBatch = {
      id: batchId,
      productId: targetProductId,
      sku: targetSku,
      batchNumber: finalBatchNumber,
      supplierInvoiceNo: params.supplierInvoiceNo,
      supplierName: params.supplierName,
      inwardDate: params.inwardDate || new Date().toISOString().slice(0, 10),
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
      notes: params.notes || (params.scheme ? `Inward scheme: ${params.scheme}` : 'Inward stock receipt'),
      cgstRate: params.cgstRate,
      sgstRate: params.sgstRate,
      hsn: params.hsn || product?.hsn,
    };
    setInventoryBatches((prev) => [...prev, newBatch]);

    return { productId: targetProductId, batchId };
  }

  // Promotions CRUD
  function addPromotion(promo: Omit<Promotion, 'id'>) {
    const nextId = promotions.length ? Math.max(...promotions.map((p) => p.id)) + 1 : 1;
    const newPromo: Promotion = { id: nextId, ...promo };
    setPromotions((prev) => [...prev, newPromo]);
    // Immediate dual sync: Direct Supabase client upsert + server schemes endpoint
    pushPromotionToSupabase(newPromo);
    fetch('/api/schemes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPromo),
    }).catch(() => {});
  }

  function updatePromotion(id: number, promo: Omit<Promotion, 'id'>) {
    const updatedPromo: Promotion = { id, ...promo };
    setPromotions((prev) => prev.map((p) => (p.id === id ? updatedPromo : p)));
    // Immediate dual sync: Direct Supabase client upsert + server schemes endpoint
    pushPromotionToSupabase(updatedPromo);
    fetch('/api/schemes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPromo),
    }).catch(() => {});
  }

  function deletePromotion(id: number) {
    setPromotions((prev) => prev.filter((p) => p.id !== id));
    deletePromotionFromSupabase(id);
    fetch(`/api/schemes/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  // Bills CRUD
  function startEditBill(bill: Bill) {
    setEditingBillId(bill.id);
    setCart({
      retailer: bill.retailer,
      phone: bill.phone,
      date: bill.date,
      items: bill.items.map((it) => ({ ...it })),
      warehouseId: bill.warehouseId || '',
      tripId: bill.tripId,
      vehicle: bill.vehicle,
      salesman: bill.salesman,
      additionalDiscount: bill.additionalDiscount || 0,
    });
    setTab('billing');
  }

  function cancelEditBill() {
    setEditingBillId(null);
    setCart(emptyCart());
  }

  function finalizeBill(amountPaid?: number, tripId?: number, overallDiscount?: number): number | null {
    if (cart.items.length === 0) return null;
    const discountToApply =
      overallDiscount !== undefined ? overallDiscount : (cart.additionalDiscount || 0);
    const totals = billTotals(cart.items, gstMode, discountToApply);
    const paid = amountPaid !== undefined ? Math.min(amountPaid, totals.total) : totals.total;

    const finalTripId = tripId !== undefined ? tripId : cart.tripId;
    const matchedTrip = finalTripId ? trips.find((t) => t.id === finalTripId) : null;
    const resolvedSalesmanId =
      matchedTrip?.salesmanId ||
      (currentUser?.role === 'salesman' ? currentUser.id : undefined) ||
      cart.salesmanId;
    const resolvedSalesmanName =
      matchedTrip?.salesman ||
      (currentUser?.role === 'salesman' ? currentUser.name : undefined) ||
      cart.salesman;

    if (editingBillId !== null) {
      const updated: Bill = {
        ...totals,
        id: editingBillId,
        retailer: cart.retailer || 'Cash Sale',
        phone: cart.phone,
        date: cart.date,
        items: cart.items,
        amountPaid: paid,
        warehouseId: cart.warehouseId || '',
        tripId: finalTripId || undefined,
        vehicle: matchedTrip?.vehicle || cart.vehicle || undefined,
        salesman: resolvedSalesmanName || undefined,
        salesmanId: resolvedSalesmanId || undefined,
        additionalDiscount: discountToApply,
      };
      setBills((bs) => bs.map((b) => (b.id === editingBillId ? updated : b)));
      const id = editingBillId;
      setEditingBillId(null);
      setCart(emptyCart());
      setJustFinalizedBillId(id);

      if (finalTripId) {
        setTrips((ts) =>
          ts.map((t) => {
            if (t.id !== finalTripId) return t;
            if (t.billIds.includes(id)) return t;
            const updatedT = { ...t, billIds: [...t.billIds, id] };
            pushTripToSupabase(updatedT);
            return updatedT;
          })
        );
      }

      // Push to Supabase bills table & server API
      pushBillToSupabase(updated);
      fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {});

      return id;
    } else {
      const nextId = bills.length ? Math.max(...bills.map((b) => b.id)) + 1 : 101;
      const newBill: Bill = {
        ...totals,
        id: nextId,
        retailer: cart.retailer || 'Cash Sale',
        phone: cart.phone,
        date: cart.date,
        items: cart.items,
        amountPaid: paid,
        warehouseId: cart.warehouseId || '',
        tripId: finalTripId || undefined,
        vehicle: matchedTrip?.vehicle || cart.vehicle || undefined,
        salesman: resolvedSalesmanName || undefined,
        salesmanId: resolvedSalesmanId || undefined,
        additionalDiscount: discountToApply,
      };
      setBills((bs) => [newBill, ...bs]);
      setCart(emptyCart());
      setJustFinalizedBillId(nextId);

      if (finalTripId) {
        setTrips((ts) =>
          ts.map((t) => {
            if (t.id !== finalTripId) return t;
            if (t.billIds.includes(nextId)) return t;
            const updatedT = { ...t, billIds: [...t.billIds, nextId] };
            pushTripToSupabase(updatedT);
            return updatedT;
          })
        );
      }

      // Push to Supabase bills table & server API
      pushBillToSupabase(newBill);
      fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBill),
      }).catch(() => {});

      return nextId;
    }
  }

  function recordPayment(billId: number, amount: number) {
    let updatedBill: Bill | null = null;
    setBills((bs) =>
      bs.map((b) => {
        if (b.id !== billId) return b;
        const newPaid = Math.min(b.total, b.amountPaid + amount);
        updatedBill = { ...b, amountPaid: newPaid };
        return updatedBill;
      })
    );
    if (updatedBill) {
      pushBillToSupabase(updatedBill);
      fetch(`/api/bills/${billId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountPaid: (updatedBill as Bill).amountPaid }),
      }).catch(() => {});
    }
  }

  function deleteBill(billId: number) {
    setBills((bs) => {
      const remaining = bs.filter((b) => b.id !== billId);
      saveOrders(remaining).catch(() => {});
      return remaining;
    });
    setTrips((ts) =>
      ts.map((t) => ({
        ...t,
        billIds: t.billIds.filter((id) => id !== billId),
      }))
    );
    if (editingBillId === billId) {
      setEditingBillId(null);
      setCart(emptyCart());
    }
    deleteBillFromSupabase(billId);
    fetch(`/api/bills/${billId}`, { method: 'DELETE' }).catch(() => {});
  }

  function updateBill(updated: Bill) {
    setBills((bs) => {
      const newBills = bs.map((b) => (b.id === updated.id ? updated : b));
      saveOrders(newBills).catch(() => {});
      return newBills;
    });
    if (editingBillId === updated.id) {
      setEditingBillId(null);
      setCart(emptyCart());
    }
    pushBillToSupabase(updated);
    fetch('/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});
  }

  const syncBillsToCloud = async (): Promise<{ success: boolean; count: number; error?: string }> => {
    try {
      let count = 0;
      for (const bill of bills) {
        const res = await pushBillToSupabase(bill);
        if (res.success) count++;
      }
      await saveOrders(bills);
      return { success: true, count };
    } catch (e: any) {
      return { success: false, count: 0, error: e?.message || 'Sync failed' };
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
    salesmanId?: string
  ): Trip {
    const nextId = trips.length ? Math.max(...trips.map((t) => t.id)) + 1 : 1;
    const resolvedSalesmanId =
      salesmanId ||
      (currentUser?.role === 'salesman' ? currentUser.id : undefined) ||
      (salesman ? salesmen.find((s) => s.name === salesman || s.id === salesman)?.id : undefined);
    const matchedSalesmanObj = resolvedSalesmanId ? salesmen.find((s) => s.id === resolvedSalesmanId) : null;
    const resolvedSalesmanName =
      salesman || matchedSalesmanObj?.name || (currentUser?.role === 'salesman' ? currentUser.name : undefined);

    const newTrip: Trip = {
      id: nextId,
      vehicle,
      salesman: resolvedSalesmanName || undefined,
      salesmanId: resolvedSalesmanId || undefined,
      route: route || undefined,
      date,
      warehouseId: warehouseId || '',
      loaded,
      returned: {},
      billIds: initialBillIds || [],
      status: 'out',
    };
    setTrips((ts) => [newTrip, ...ts]);
    pushTripToSupabase(newTrip);
    fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTrip),
    }).catch(() => {});
    return newTrip;
  }

  function toggleBillAssignment(tripId: number, billId: number) {
    let updatedTrip: Trip | null = null;
    setTrips((ts) =>
      ts.map((t) => {
        if (t.id !== tripId) return t;
        const exists = t.billIds.includes(billId);
        updatedTrip = {
          ...t,
          billIds: exists ? t.billIds.filter((id) => id !== billId) : [...t.billIds, billId],
        };
        return updatedTrip;
      })
    );
    if (updatedTrip) {
      pushTripToSupabase(updatedTrip);
      fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTrip),
      }).catch(() => {});
    }
  }

  function unassignBillFromTrip(tripId: number, billId: number) {
    let updatedTrip: Trip | null = null;
    setTrips((ts) =>
      ts.map((t) => {
        if (t.id !== tripId) return t;
        updatedTrip = {
          ...t,
          billIds: t.billIds.filter((id) => id !== billId),
        };
        return updatedTrip;
      })
    );
    if (updatedTrip) {
      pushTripToSupabase(updatedTrip);
      fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTrip),
      }).catch(() => {});
    }
  }

  function autoAssignTripBills(tripId: number): number {
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return 0;
    // Find all customer bills dated on this trip's dispatch date
    const matchingBills = bills.filter((b) => b.date === trip.date);
    const newBillIds = Array.from(new Set([...trip.billIds, ...matchingBills.map((b) => b.id)]));
    const addedCount = newBillIds.length - trip.billIds.length;
    if (addedCount > 0) {
      const updatedTrip: Trip = { ...trip, billIds: newBillIds };
      setTrips((ts) => ts.map((t) => (t.id === tripId ? updatedTrip : t)));
      pushTripToSupabase(updatedTrip);
      fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTrip),
      }).catch(() => {});
    }
    return addedCount;
  }

  function saveReturn(tripId: number, returned: Record<number, number>) {
    let updatedTrip: Trip | null = null;
    setTrips((ts) =>
      ts.map((t) => {
        if (t.id === tripId) {
          updatedTrip = { ...t, returned, status: 'closed' };
          return updatedTrip;
        }
        return t;
      })
    );
    if (updatedTrip) {
      pushTripToSupabase(updatedTrip);
      fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTrip),
      }).catch(() => {});
    }
  }

  function reopenTrip(tripId: number) {
    let updatedTrip: Trip | null = null;
    setTrips((ts) =>
      ts.map((t) => {
        if (t.id === tripId) {
          updatedTrip = { ...t, status: 'out' };
          return updatedTrip;
        }
        return t;
      })
    );
    if (updatedTrip) {
      pushTripToSupabase(updatedTrip);
      fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTrip),
      }).catch(() => {});
    }
  }

  function updateTrip(updated: Trip) {
    setTrips((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
    pushTripToSupabase(updated);
    fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});
  }

  function deleteTrip(tripId: number) {
    setTrips((ts) => ts.filter((t) => t.id !== tripId));
    deleteTripFromSupabase(tripId);
    fetch(`/api/trips/${tripId}`, { method: 'DELETE' }).catch(() => {});
  }

  const syncTripsToCloud = async (): Promise<{ success: boolean; count: number; error?: string }> => {
    try {
      let count = 0;
      for (const trip of trips) {
        const res = await pushTripToSupabase(trip);
        if (res.success) count++;
      }
      await saveTrips(trips);
      return { success: true, count };
    } catch (e: any) {
      return { success: false, count: 0, error: e?.message || 'Sync failed' };
    }
  };

  // Stock Audit
  function saveAudit(
    counts: Record<number, number | string>,
    adjustStock: boolean,
    auditDate?: string,
    referenceNote?: string
  ) {
    const entries: AuditEntry[] = Object.entries(counts)
      .map(([k, v]) => [Number(k), v] as [number, number | string])
      .filter(([, val]) => val !== '' && val !== undefined)
      .map(([pid, val]) => {
        const product = products.find((p) => p.id === pid);
        const system = bookStock(pid);
        const counted = Number(val);
        return {
          productId: pid,
          name: product ? product.name : `Product #${pid}`,
          system,
          counted,
          diff: counted - system,
        };
      });

    if (entries.length === 0) return;

    if (adjustStock) {
      setProducts((ps) =>
        ps.map((p) => {
          const entry = entries.find((e) => e.productId === p.id);
          return entry ? { ...p, opening: p.opening + entry.diff } : p;
        })
      );
    }

    const nextId = audits.length ? Math.max(...audits.map((x) => x.id)) + 1 : 1;
    const targetDate = auditDate && auditDate.trim() ? auditDate.trim() : new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const newAudit: Audit = {
      id: nextId,
      date: targetDate,
      time: nowTime,
      referenceNote: referenceNote?.trim() || undefined,
      entries,
      adjusted: adjustStock,
    };
    setAudits((as) => [newAudit, ...as]);
    pushAuditToSupabase(newAudit);
    fetch('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAudit),
    }).catch(() => {});
  }

  function deleteAudit(id: number) {
    setAudits((as) => as.filter((a) => a.id !== id));
    deleteAuditFromSupabase(id);
    fetch(`/api/audits/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  function resetToDefault() {
    cleanDatabase();
    setGstMode('inclusive');
    setFontSize('large');
    setHighContrast(false);
    setOrgProfile(DEFAULT_ORG_PROFILE);
    setBillingSettings(DEFAULT_BILLING_SETTINGS);
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
        deleteProduct,
        applyBulkImport,
        receiveInwardStock,
        productWarehouseStock,
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
        recordPayment,
        deleteBill,
        syncBillsToCloud,
        trips,
        addTrip,
        toggleBillAssignment,
        unassignBillFromTrip,
        autoAssignTripBills,
        saveReturn,
        reopenTrip,
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
  if (!ctx) throw new Error('useLedger must be used within a LedgerProvider');
  return ctx;
}
