/**
 * Central Storage Layer - Server First with LocalStorage Offline Cache
 *
 * Source of truth: Backend Server API & Supabase PostgreSQL
 * Offline resilience: Browser LocalStorage cache
 */

import { AuthUser, Salesman } from '../types';
import { getSupabaseClient } from '../lib/supabase';

export interface Order {
  id: string | number;
  orderNumber?: string;
  retailer?: string;
  customerName?: string;
  phone?: string;
  date?: string;
  status?: 'pending' | 'confirmed' | 'delivered' | 'cancelled' | string;
  items: any[];
  subtotal?: number;
  cgst?: number;
  sgst?: number;
  total?: number;
  discount?: number;
  amountPaid?: number;
  warehouseId?: string;
  [key: string]: any;
}

export interface Partner {
  id: string | number;
  name: string;
  type?: 'customer' | 'supplier' | 'retailer' | 'distributor' | string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  city?: string;
  balance?: number;
  [key: string]: any;
}

export interface InventoryItem {
  id: string;
  product_id?: string;
  stock_on_hand?: number;
  reserved_stock?: number;
  reorder_level?: number;
  warehouse_id?: string | null;
  warehouse_name?: string | null;
  warehouse_bay?: string | null;
  batch_number?: string | null;
  mfg_date?: string | null;
  expiry_date?: string | null;
  unit_cost?: number;
  selling_scheme?: string | null;
  selling_scheme_discount?: number | null;
  selling_scheme_label?: string | null;
  last_restocked?: string | null;
  updated_at?: string;

  // Interoperability camelCase aliases
  productId?: string | number;
  stockOnHand?: number;
  reservedStock?: number;
  reorderLevel?: number;
  warehouseId?: string;
  warehouseName?: string;
  warehouseBay?: string;
  batchNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  unitCost?: number;
  sellingScheme?: string;
  sellingSchemeDiscount?: number;
  sellingSchemeLabel?: string;
  lastRestocked?: string;
  [key: string]: any;
}

export interface StockTransaction {
  id: string | number;
  date: string;
  productId?: string | number;
  product_id?: string | number;
  type: 'inward' | 'outward' | 'adjustment' | 'transfer' | 'delivery' | string;
  quantity: number;
  referenceNote?: string;
  warehouseId?: string;
  batchNumber?: string;
  [key: string]: any;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  location?: string;
  manager?: string;
  phone?: string;
  capacityCases?: number;
  isDefault?: boolean;
  notes?: string;
  [key: string]: any;
}

export interface WarehouseBay {
  id: string;
  warehouseId: string;
  warehouse_id?: string;
  name: string;
  code?: string;
  capacity?: number;
  notes?: string;
  [key: string]: any;
}

export interface PromotionalScheme {
  id: string | number;
  name: string;
  type: string;
  buyQty?: number;
  freeQty?: number;
  percent?: number;
  flatPerCase?: number;
  productIds?: any[];
  description?: string;
  [key: string]: any;
}

export interface DailyVehicleTrip {
  id?: string | number;
  date?: string;
  vehicle?: string;
  driver?: string;
  warehouseId?: string;
  loaded?: Record<string | number, number>;
  returned?: Record<string | number, number>;
  billIds?: (string | number)[];
  status?: string;
  notes?: string;
  [key: string]: any;
}

export interface SyncStatus {
  isOnline: boolean;
  consecutiveFailures: number;
  lastSuccessfulSync: string | null;
  lastError: string | null;
  isSyncing: boolean;
  hasPersistentFailure: boolean;
}

const STORAGE_KEYS = {
  orders: 'radhika_cache_orders',
  partners: 'radhika_cache_partners',
  inventory: 'radhika_cache_inventory',
  stock_transactions: 'radhika_cache_stock_transactions',
  warehouses: 'radhika_cache_warehouses',
  warehouse_bays: 'radhika_cache_warehouse_bays',
  schemes: 'radhika_cache_schemes',
  vehicle_trip: 'radhika_cache_vehicle_trip',
  trips: 'radhika_cache_trips',
  billing_settings: 'radhika_cache_billing_settings',
  org_profile: 'radhika_cache_org_profile',
  products: 'mrwater_cache_products',
  inventory_batches: 'mrwater_cache_inventory_batches',
  salesmen: 'radhika_cache_salesmen',
  auth_user: 'radhika_cache_auth_user',
} as const;

let syncStatusState: SyncStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  consecutiveFailures: 0,
  lastSuccessfulSync: null,
  lastError: null,
  isSyncing: false,
  hasPersistentFailure: false,
};

type SyncListener = (status?: SyncStatus) => void;
const syncListeners: Set<SyncListener> = new Set();

export function getSyncStatus(): SyncStatus {
  return syncStatusState;
}

export function subscribeToSyncStatus(listener: SyncListener): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function notifySyncStatus(updates: Partial<SyncStatus>) {
  syncStatusState = {
    ...syncStatusState,
    ...updates,
    hasPersistentFailure: (updates.consecutiveFailures ?? syncStatusState.consecutiveFailures) >= 3,
  };
  // Defer listener notifications to a microtask to avoid invoking setState during another component's render phase
  queueMicrotask(() => {
    syncListeners.forEach((fn) => {
      try {
        fn(syncStatusState);
      } catch {
        // ignore
      }
    });
  });
}

// Track online/offline browser state
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notifySyncStatus({ isOnline: true });
  });
  window.addEventListener('offline', () => {
    notifySyncStatus({ isOnline: false, lastError: 'Browser is offline' });
  });
}

function readLocalCache<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[Storage] Failed to read localStorage key "${key}":`, err);
    return fallback;
  }
}

function writeLocalCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`[Storage] Failed to write localStorage key "${key}":`, err);
  }
}

const STATIC_API_COLLECTIONS: Record<string, string> = {
  '/api/bills': 'bills',
  '/api/trips': 'trips',
  '/api/settings/billing': 'billing_settings',
  '/api/settings/profile': 'organization_profile',
  '/api/collections/partners': 'partners',
  '/api/inventory': 'inventory',
  '/api/inventory/import': 'inventory',
  '/api/collections/stock_transactions': 'stock_transactions',
  '/api/warehouses': 'warehouses',
  '/api/collections/warehouse_bays': 'warehouse_bays',
  '/api/schemes': 'schemes',
  '/api/collections/vehicle_trip': 'vehicle_trip',
  '/api/products': 'products',
  '/api/batches': 'inventory_batches',
  '/api/salesmen': 'salesmen',
};

function isStaticDeployment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.endsWith('.github.io') || host === 'github.io';
}

function staticCollectionKey(url: string): string | null {
  try {
    const path = new URL(url, window.location.origin).pathname.replace(/\/+$/, '') || '/';
    return STATIC_API_COLLECTIONS[path] || null;
  } catch {
    return null;
  }
}

function extractStaticPayload(path: string, payload: any): any {
  if (path === '/api/bills') return payload?.bills ?? payload ?? [];
  if (path === '/api/trips') return payload?.trips ?? payload ?? [];
  if (path === '/api/settings/billing') return payload?.settings ?? payload ?? null;
  if (path === '/api/settings/profile') return payload?.profile ?? payload ?? null;
  if (path === '/api/inventory/import') return payload?.items ?? payload ?? [];
  if (path === '/api/warehouses') return payload?.warehouses ?? payload ?? [];
  if (path === '/api/products') return payload?.products ?? payload ?? [];
  if (path === '/api/batches') return payload?.batches ?? payload ?? [];
  if (path === '/api/salesmen') return payload?.salesmen ?? payload ?? [];
  if (path.startsWith('/api/collections/')) return payload?.data ?? payload ?? [];
  if (path === '/api/schemes') return payload?.schemes ?? payload ?? [];
  return payload;
}

async function fetchFromStaticCollection<T>(url: string): Promise<T | null> {
  const key = staticCollectionKey(url);
  if (!key) return null;
  const client = getSupabaseClient();
  if (!client) {
    notifySyncStatus({ lastError: 'Supabase is not configured' });
    return null;
  }

  try {
    const { data, error } = await client
      .from('app_collections')
      .select('data')
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;

    const value = data?.data ?? (key === 'billing_settings' || key === 'organization_profile' ? null : []);
    notifySyncStatus({
      consecutiveFailures: 0,
      lastSuccessfulSync: new Date().toISOString(),
      lastError: null,
    });
    return value as T;
  } catch (err: any) {
    const message = err?.message || 'Supabase collection read failed';
    console.warn(`[Storage] Supabase read failed for ${key}:`, message);
    notifySyncStatus({
      consecutiveFailures: syncStatusState.consecutiveFailures + 1,
      lastError: message,
    });
    return null;
  }
}

async function saveToStaticCollection(url: string, payload: any): Promise<boolean> {
  const key = staticCollectionKey(url);
  if (!key) return false;
  const client = getSupabaseClient();
  if (!client) {
    notifySyncStatus({ lastError: 'Supabase is not configured' });
    return false;
  }

  try {
    const path = new URL(url, window.location.origin).pathname.replace(/\/+$/, '') || '/';
    const data = extractStaticPayload(path, payload);
    const { error } = await client.from('app_collections').upsert(
      { key, data, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if (error) throw error;

    notifySyncStatus({
      isSyncing: false,
      consecutiveFailures: 0,
      lastSuccessfulSync: new Date().toISOString(),
      lastError: null,
    });
    return true;
  } catch (err: any) {
    const message = err?.message || 'Supabase collection write failed';
    console.warn(`[Storage] Supabase write failed for ${key}:`, message);
    notifySyncStatus({
      isSyncing: false,
      consecutiveFailures: syncStatusState.consecutiveFailures + 1,
      lastError: message,
    });
    return false;
  }
}

async function fetchFromServer<T>(url: string): Promise<T | null> {
  // GitHub Pages is static hosting: /api/* does not exist there. Use Supabase
  // directly through app_collections instead of repeatedly calling dead routes.
  if (isStaticDeployment() && staticCollectionKey(url)) {
    return fetchFromStaticCollection<T>(url);
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    notifySyncStatus({
      consecutiveFailures: 0,
      lastSuccessfulSync: new Date().toISOString(),
      lastError: null,
    });
    if (json && typeof json === 'object' && 'data' in json) {
      return json.data as T;
    }
    return json as T;
  } catch (err: any) {
    console.warn(`[Storage] Server fetch failed for ${url}:`, err.message);
    notifySyncStatus({
      consecutiveFailures: syncStatusState.consecutiveFailures + 1,
      lastError: err.message || 'Server fetch error',
    });
    return null;
  }
}

async function postOrPutServer<T>(url: string, method: 'POST' | 'PUT', payload: any): Promise<boolean> {
  if (isStaticDeployment() && staticCollectionKey(url)) {
    notifySyncStatus({ isSyncing: true });
    return saveToStaticCollection(url, payload);
  }

  try {
    notifySyncStatus({ isSyncing: true });
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
    }

    notifySyncStatus({
      isSyncing: false,
      consecutiveFailures: 0,
      lastSuccessfulSync: new Date().toISOString(),
      lastError: null,
    });
    return true;
  } catch (err: any) {
    console.warn(`[Storage] Server ${method} failed for ${url}:`, err.message);
    notifySyncStatus({
      isSyncing: false,
      consecutiveFailures: syncStatusState.consecutiveFailures + 1,
      lastError: err.message || `Failed to sync ${url}`,
    });
    return false;
  }
}

/* =========================================================================
 * 1. ORDERS
 * ========================================================================= */
export async function loadOrders(): Promise<Order[]> {
  const serverData = await fetchFromServer<Order[]>('/api/bills');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.orders, serverData);
    return serverData;
  }
  return readLocalCache<Order[]>(STORAGE_KEYS.orders, []);
}

export async function saveOrders(orders: Order[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.orders, orders);
  // Persist to server via /api/bills which syncs to Supabase public.bills
  postOrPutServer('/api/bills', 'PUT', { bills: orders });
}

/* =========================================================================
 * 1B. DELIVERY TRIPS (Supabase public.trips)
 * ========================================================================= */
export async function loadTrips(): Promise<any[]> {
  const serverData = await fetchFromServer<any[]>('/api/trips');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.trips, serverData);
    return serverData;
  }
  return readLocalCache<any[]>(STORAGE_KEYS.trips, []);
}

export async function saveTrips(trips: any[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.trips, trips);
  postOrPutServer('/api/trips', 'PUT', { trips });
}

/* =========================================================================
 * 1C. SETTINGS (Supabase public.billing_settings & organization_profile)
 * ========================================================================= */
export async function loadBillingSettings(): Promise<any | null> {
  const serverData = await fetchFromServer<any>('/api/settings/billing');
  if (serverData !== null) {
    writeLocalCache(STORAGE_KEYS.billing_settings, serverData);
    return serverData;
  }
  return readLocalCache<any | null>(STORAGE_KEYS.billing_settings, null);
}

export async function saveBillingSettings(settings: any): Promise<void> {
  writeLocalCache(STORAGE_KEYS.billing_settings, settings);
  postOrPutServer('/api/settings/billing', 'POST', { settings });
}

export async function loadOrgProfile(): Promise<any | null> {
  const serverData = await fetchFromServer<any>('/api/settings/profile');
  if (serverData !== null) {
    writeLocalCache(STORAGE_KEYS.org_profile, serverData);
    return serverData;
  }
  return readLocalCache<any | null>(STORAGE_KEYS.org_profile, null);
}

export async function saveOrgProfile(profile: any): Promise<void> {
  writeLocalCache(STORAGE_KEYS.org_profile, profile);
  postOrPutServer('/api/settings/profile', 'POST', { profile });
}

/* =========================================================================
 * 2. PARTNERS (Retailers, Customers, Suppliers)
 * ========================================================================= */
export async function loadPartners(): Promise<Partner[]> {
  const serverData = await fetchFromServer<Partner[]>('/api/collections/partners');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.partners, serverData);
    return serverData;
  }
  return readLocalCache<Partner[]>(STORAGE_KEYS.partners, []);
}

export async function savePartners(partners: Partner[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.partners, partners);
  postOrPutServer('/api/collections/partners', 'PUT', { data: partners });
}

/* =========================================================================
 * 3. INVENTORY ITEMS (PostgreSQL public.inventory_items)
 * ========================================================================= */
export async function loadInventory(): Promise<InventoryItem[]> {
  const serverData = await fetchFromServer<InventoryItem[]>('/api/inventory');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.inventory, serverData);
    return serverData;
  }
  return readLocalCache<InventoryItem[]>(STORAGE_KEYS.inventory, []);
}

export async function saveInventory(inventory: InventoryItem[], replaceAll = false): Promise<void> {
  writeLocalCache(STORAGE_KEYS.inventory, inventory);
  // Sync to PostgreSQL via POST /api/inventory/import
  postOrPutServer('/api/inventory/import', 'POST', {
    items: inventory,
    replaceAll,
  });
}

export const syncInventoryToServer = saveInventory;

/* =========================================================================
 * 4. STOCK TRANSACTIONS
 * ========================================================================= */
export async function loadStockTransactions(): Promise<StockTransaction[]> {
  const serverData = await fetchFromServer<StockTransaction[]>('/api/collections/stock_transactions');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.stock_transactions, serverData);
    return serverData;
  }
  return readLocalCache<StockTransaction[]>(STORAGE_KEYS.stock_transactions, []);
}

export async function saveStockTransactions(transactions: StockTransaction[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.stock_transactions, transactions);
  postOrPutServer('/api/collections/stock_transactions', 'PUT', { data: transactions });
}

/* =========================================================================
 * 5. WAREHOUSES
 * ========================================================================= */
export async function loadWarehouses(): Promise<Warehouse[]> {
  const serverData = await fetchFromServer<Warehouse[]>('/api/warehouses');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.warehouses, serverData);
    return serverData;
  }
  return readLocalCache<Warehouse[]>(STORAGE_KEYS.warehouses, []);
}

export async function saveWarehouses(warehouses: Warehouse[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.warehouses, warehouses);
  postOrPutServer('/api/warehouses', 'PUT', { warehouses });
}

/* =========================================================================
 * 6. WAREHOUSE BAYS
 * ========================================================================= */
export async function loadWarehouseBays(): Promise<WarehouseBay[]> {
  const serverData = await fetchFromServer<WarehouseBay[]>('/api/collections/warehouse_bays');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.warehouse_bays, serverData);
    return serverData;
  }
  return readLocalCache<WarehouseBay[]>(STORAGE_KEYS.warehouse_bays, []);
}

export async function saveWarehouseBays(bays: WarehouseBay[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.warehouse_bays, bays);
  postOrPutServer('/api/collections/warehouse_bays', 'PUT', { data: bays });
}

/* =========================================================================
 * 7. PROMOTIONAL SCHEMES
 * ========================================================================= */
export async function loadSchemes(): Promise<PromotionalScheme[]> {
  const serverData = await fetchFromServer<PromotionalScheme[]>('/api/schemes');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.schemes, serverData);
    return serverData;
  }
  return readLocalCache<PromotionalScheme[]>(STORAGE_KEYS.schemes, []);
}

export async function saveSchemes(schemes: PromotionalScheme[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.schemes, schemes);
  // Sync to server schemes endpoint (persists to Supabase promotions table)
  postOrPutServer('/api/schemes', 'PUT', { schemes });
}

/* =========================================================================
 * 8. DAILY VEHICLE TRIP
 * ========================================================================= */
export async function loadDailyVehicleTrip(): Promise<DailyVehicleTrip | null> {
  const serverData = await fetchFromServer<DailyVehicleTrip | null>('/api/collections/vehicle_trip');
  if (serverData !== null) {
    writeLocalCache(STORAGE_KEYS.vehicle_trip, serverData);
    return serverData;
  }
  return readLocalCache<DailyVehicleTrip | null>(STORAGE_KEYS.vehicle_trip, null);
}

export async function saveDailyVehicleTrip(trip: DailyVehicleTrip): Promise<void> {
  writeLocalCache(STORAGE_KEYS.vehicle_trip, trip);
  postOrPutServer('/api/collections/vehicle_trip', 'PUT', { data: trip });
}

/* =========================================================================
 * 9. PRODUCTS & INVENTORY BATCHES (PostgreSQL products and inventory_batches)
 * ========================================================================= */
export async function loadProducts(): Promise<any[]> {
  const serverData = await fetchFromServer<any[]>('/api/products');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.products, serverData);
    return serverData;
  }
  return readLocalCache<any[]>(STORAGE_KEYS.products, []);
}

export async function saveProducts(products: any[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.products, products);
  postOrPutServer('/api/products', 'POST', { products });
}

export async function loadInventoryBatches(): Promise<any[]> {
  const serverData = await fetchFromServer<any[]>('/api/batches');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.inventory_batches, serverData);
    return serverData;
  }
  return readLocalCache<any[]>(STORAGE_KEYS.inventory_batches, []);
}

export async function saveInventoryBatches(batches: any[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.inventory_batches, batches);
  postOrPutServer('/api/batches', 'POST', { batches });
}

/* =========================================================================
 * 10. SALESMEN & AUTH SESSION
 * ========================================================================= */
export function loadCachedSalesmen(): Salesman[] {
  return readLocalCache<Salesman[]>(STORAGE_KEYS.salesmen, []);
}

export async function loadSalesmen(): Promise<Salesman[]> {
  const serverData = await fetchFromServer<Salesman[]>('/api/salesmen');
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.salesmen, serverData);
    return serverData;
  }
  return readLocalCache<Salesman[]>(STORAGE_KEYS.salesmen, []);
}

export async function saveSalesmen(salesmen: Salesman[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.salesmen, salesmen);
}

export function loadCachedAuthUser(): AuthUser | null {
  return readLocalCache<AuthUser | null>(STORAGE_KEYS.auth_user, null);
}

export function saveCachedAuthUser(user: AuthUser | null): void {
  writeLocalCache(STORAGE_KEYS.auth_user, user);
}


