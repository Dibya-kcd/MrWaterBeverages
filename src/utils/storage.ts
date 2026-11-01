/**
 * Central Storage Layer - Server First with LocalStorage Offline Cache
 *
 * Source of truth: Backend Server API & Supabase PostgreSQL
 * Offline resilience: Browser LocalStorage cache
 */

import {
  AuthUser,
  Customer,
  PaymentRecord,
  Salesman,
  SupplierScheme,
  SupplierSchemeApplication,
  SupplierCreditNote,
  AuditSession,
  ReconciliationTransaction,
  StockLedgerEntry,
} from "../types";
import { getSupabaseClient, dropDeletedFromList, writeCollectionMerged, collectionSeen } from "../lib/supabase";
import { announceCloudChange } from "../lib/syncSignal";

export interface Order {
  id: string | number;
  orderNumber?: string;
  retailer?: string;
  customerName?: string;
  phone?: string;
  date?: string;
  status?: "pending" | "confirmed" | "delivered" | "cancelled" | string;
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
  type?: "customer" | "supplier" | "retailer" | "distributor" | string;
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
  type: "inward" | "outward" | "adjustment" | "transfer" | "delivery" | string;
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
  /** Saves that did not reach the cloud yet and are kept on this device to be retried. */
  pendingCount: number;
}

const STORAGE_KEYS = {
  orders: "mrwater_cache_orders",
  partners: "mrwater_cache_partners",
  inventory: "mrwater_cache_inventory",
  stock_transactions: "mrwater_cache_stock_transactions",
  warehouses: "mrwater_cache_warehouses",
  warehouse_bays: "mrwater_cache_warehouse_bays",
  schemes: "mrwater_cache_schemes",
  vehicle_trip: "mrwater_cache_vehicle_trip",
  trips: "mrwater_cache_trips",
  billing_settings: "mrwater_cache_billing_settings",
  org_profile: "mrwater_cache_org_profile",
  products: "mrwater_cache_products",
  inventory_batches: "mrwater_cache_inventory_batches",
  salesmen: "mrwater_cache_salesmen",
  auth_user: "mrwater_cache_auth_user",
  payments: "mrwater_cache_payments",
  customers: "mrwater_cache_customers",
  supplier_schemes: "mrwater_cache_supplier_schemes",
  supplier_scheme_applications: "mrwater_cache_supplier_scheme_applications",
  supplier_credit_notes: "mrwater_cache_supplier_credit_notes",
  audit_sessions: "mrwater_cache_audit_sessions",
  reconciliation_transactions: "mrwater_cache_reconciliation_transactions",
  stock_ledger_entries: "mrwater_cache_stock_ledger_entries",
  inventory_dispositions: "mrwater_cache_inventory_dispositions",
  business_expenses: "mrwater_cache_business_expenses",
  grns: "mrwater_cache_grns",
} as const;

let syncStatusState: SyncStatus = {
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  consecutiveFailures: 0,
  lastSuccessfulSync: null,
  lastError: null,
  isSyncing: false,
  hasPersistentFailure: false,
  pendingCount: 0,
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

/**
 * Report a cloud write that failed outside the storage helpers (e.g. a Supabase push that
 * resolved `{ success: false }` or a fire-and-forget fetch). Feeds the same status the
 * app-wide "Cloud Persistence Warning" banner reads, so failures are no longer silent.
 */
export function reportSyncFailure(label: string, error?: unknown): void {
  const rawMsg =
    typeof error === "string"
      ? error
      : (error as { message?: string } | null | undefined)?.message ||
        "Unknown error";

  let msg = rawMsg;
  if (
    rawMsg.includes("520") ||
    rawMsg.includes("<!DOCTYPE") ||
    rawMsg.includes("upstream request timeout") ||
    rawMsg.includes("cloudflare")
  ) {
    msg = "Cloud provider unavailable (Cloudflare 520 / timeout). Local storage active.";
  }

  console.warn(`[Sync] ${label} notice:`, msg);
  notifySyncStatus({
    isSyncing: false,
    consecutiveFailures: Math.min(syncStatusState.consecutiveFailures + 1, 10),
    lastError: `${label}: ${msg}`,
  });
}

export function clearSyncStatus(): void {
  notifySyncStatus({
    isSyncing: false,
    consecutiveFailures: 0,
    lastError: null,
    hasPersistentFailure: false,
  });
}

export function reportSyncSuccess(): void {
  notifySyncStatus({
    isSyncing: false,
    consecutiveFailures: 0,
    lastSuccessfulSync: new Date().toISOString(),
    lastError: null,
    hasPersistentFailure: false,
  });
}

function notifySyncStatus(updates: Partial<SyncStatus>) {
  syncStatusState = {
    ...syncStatusState,
    ...updates,
    // Any unresolved failed write is worth surfacing (it clears on the next successful sync).
    hasPersistentFailure:
      (updates.consecutiveFailures ?? syncStatusState.consecutiveFailures) >= 1 ||
      (updates.pendingCount ?? syncStatusState.pendingCount) > 0,
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
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    notifySyncStatus({ isOnline: true });
  });
  window.addEventListener("offline", () => {
    notifySyncStatus({ isOnline: false, lastError: "Browser is offline" });
  });
}

function readLocalCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
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
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`[Storage] Failed to write localStorage key "${key}":`, err);
    // A full device storage means the offline copy silently stops updating: make that visible.
    const name = (err as any)?.name || "";
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
      reportSyncFailure(
        "device storage is full (offline copy is not being updated - free up space or clear old data)",
        err,
      );
    }
  }
}

/* -------------------------------------------------------------------------
 * Network safety: every request has a time limit (a hung request used to block
 * the first sync, and with it all saving, forever), and a write that failed is
 * kept in a small outbox and retried when the device is back online.
 * ------------------------------------------------------------------------- */
const REQUEST_TIMEOUT_MS = 15000;

function withTimeout<T>(work: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out")), ms);
    Promise.resolve(work).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl?.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("Request timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================================
 * Unsaved-writes outbox. A save that fails (no signal, server asleep, timeout) is kept ON THE DEVICE, so closing
 * the app cannot lose it. It is retried when the connection returns, every 30 seconds, and at every app start,
 * and the banner shows how many are waiting. Items remember who saved them: a phone shared by two people never
 * uploads one person's bills under the other's login.
 * ========================================================================= */
type WriteMethod = "POST" | "PUT" | "DELETE";
interface PendingWrite {
  url: string;
  method: WriteMethod;
  payload?: any;
  /** Last-changed time of the record as this device last saw it (sent as X-Base-Updated-At). */
  baseUpdatedAt?: string;
  userId: string;
  billId?: number;
  attempts: number;
  savedAt: number;
}
const OUTBOX_KEY = "mrwater_outbox_v1";

function loadOutbox(): Map<string, PendingWrite> {
  try {
    if (typeof localStorage === "undefined") return new Map();
    const raw = localStorage.getItem(OUTBOX_KEY);
    return new Map(raw ? (JSON.parse(raw) as [string, PendingWrite][]) : []);
  } catch {
    return new Map();
  }
}

// Latest payload per key wins: whole-list writes carry everything, single-record writes replace the older copy.
const pendingWrites = new Map<string, PendingWrite>(loadOutbox());
let flushingPending = false;
let outboxUser = "";
let storageRole: "admin" | "salesman" | "" = "";

function persistOutbox() {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(Array.from(pendingWrites.entries())));
  } catch {
    /* storage full or unavailable: the in-memory queue still works for this session */
  }
  notifySyncStatus({ pendingCount: ownPendingCount() });
}

function ownPendingCount(): number {
  let n = 0;
  for (const w of pendingWrites.values()) if (!outboxUser || w.userId === outboxUser) n++;
  return n;
}

/** Who is signed in on this device. Starts the retry as soon as somebody is. */
export function setStorageUser(userId: string | null, role?: "admin" | "salesman" | null) {
  outboxUser = userId || "";
  storageRole = role || "";
  notifySyncStatus({ pendingCount: ownPendingCount() });
  if (outboxUser) setTimeout(() => void flushPendingWrites(), 1500);
}

// What a salesman's login may write (the server enforces the same list). Anything else the app would try
// from a salesman phone (catalogue lists, settings, ...) is skipped instead of failing forever.
const SALESMAN_WRITABLE = /^\/api\/(bills|orders|create_order_with_schemes|payments|trips|customers|doc-numbers\/(reserve|release)|collections\/(stock_transactions|inventory_dispositions))(\/|$)/;
const salesmanMayWrite = (url: string) => SALESMAN_WRITABLE.test(url.split("?")[0]);

/** Errors a retry cannot fix are reported once and not queued. 401 stays queued: the person just has to sign in. */
function isRetryable(status: number): boolean {
  return ![400, 403, 404, 405, 409, 413, 422].includes(status);
}

export function pendingWriteCount(): number {
  return ownPendingCount();
}

// Bill saves that are on their way right now (not failed, not finished). -1 = a whole-list save.
const inflightBillWrites = new Map<string, number>();
const BILL_URL = /^\/api\/(bills|orders|create_order_with_schemes)$/;

/** True while any bill (optionally one of `billIds`) has not reached the cloud. Closing a trip waits for this. */
export function hasUnsavedBills(billIds?: (number | string)[]): boolean {
  const want = billIds ? new Set(billIds.map(Number)) : null;
  for (const id of inflightBillWrites.values()) {
    if (id === -1 || !want || want.has(id)) return true;
  }
  for (const w of pendingWrites.values()) {
    if (w.billId === undefined && !/^\/api\/(bills|orders)$/.test(w.url)) continue;
    if (!/^\/api\/(bills|orders|create_order_with_schemes)$/.test(w.url)) continue;
    if (w.method === "PUT") return true; // a whole-list save: it may hold any bill
    if (!want || (w.billId !== undefined && want.has(Number(w.billId)))) return true;
  }
  return false;
}

// Last-changed time of each record as this device last saw it, to catch "two phones edited the same record".
const seenStamps = new Map<string, string>();
const kindOfUrl = (url: string): string | null => {
  const m = /^\/api\/(bills|orders|trips|customers|payments)$/.exec(url.split("?")[0]);
  return m ? (m[1] === "orders" ? "bills" : m[1]) : null;
};
const stampOf = (r: any): string => String(r?.updatedAt || r?.updated_at || "");
export function recordSeen(kind: "bills" | "trips" | "customers" | "payments", list: any[] | null | undefined) {
  if (!Array.isArray(list)) return;
  for (const r of list) {
    const st = stampOf(r);
    if (r && r.id !== undefined && st) seenStamps.set(`${kind}:${r.id}`, st);
  }
}

function serverMessage(txt: string, status: number): string {
  try {
    const j = JSON.parse(txt);
    if (j?.error) return String(j.error);
  } catch {
    /* not JSON */
  }
  return txt ? `HTTP ${status}: ${txt.slice(0, 160)}` : `HTTP ${status}`;
}

interface SendOptions {
  key?: string;
  billId?: number;
  headers?: Record<string, string>;
}

/**
 * Sends one write. On success it leaves the outbox; on a temporary failure it stays (or joins) the outbox; on a
 * conflict or a refusal it is reported to the person and dropped, because repeating it cannot succeed.
 */
export async function sendWrite(
  url: string,
  method: WriteMethod,
  payload: any,
  opts: SendOptions = {},
): Promise<boolean> {
  const key = opts.key || `${method} ${url}`;
  if (storageRole === "salesman" && !salesmanMayWrite(url)) return true;
  const trackBill = method !== "DELETE" && BILL_URL.test(url.split("?")[0]);
  if (trackBill) inflightBillWrites.set(key, opts.billId ?? -1);
  try {
    return await sendWriteInner(url, method, payload, opts, key);
  } finally {
    if (trackBill) inflightBillWrites.delete(key);
  }
}

async function sendWriteInner(
  url: string,
  method: WriteMethod,
  payload: any,
  opts: SendOptions,
  key: string,
): Promise<boolean> {
  const kind = kindOfUrl(url);
  const recId = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.id : undefined;
  const existing = pendingWrites.get(key);
  // Two payments saved offline for the same bill collapse into one write of the final total; it must still start
  // from the total the server had before the FIRST of them.
  if (
    existing?.payload?.expectedAmountPaid !== undefined &&
    payload && typeof payload === "object" && !Array.isArray(payload)
  ) {
    payload = { ...payload, expectedAmountPaid: existing.payload.expectedAmountPaid };
  }
  const baseUpdatedAt =
    existing?.baseUpdatedAt ||
    (method === "POST" && kind && recId !== undefined ? seenStamps.get(`${kind}:${recId}`) : undefined);

  const queue = (attempts: number) => {
    pendingWrites.set(key, {
      url,
      method,
      payload,
      baseUpdatedAt,
      userId: outboxUser,
      billId: opts.billId,
      attempts,
      savedAt: existing?.savedAt || Date.now(),
    });
    persistOutbox();
  };
  const unqueue = () => {
    if (pendingWrites.delete(key)) persistOutbox();
  };

  if (isStaticDeployment() && staticCollectionKey(url)) {
    notifySyncStatus({ isSyncing: true });
    const ok = await saveToStaticCollection(url, payload);
    if (ok) unqueue();
    else queue((existing?.attempts || 0) + 1);
    return ok;
  }

  try {
    notifySyncStatus({ isSyncing: true });
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
      ...(baseUpdatedAt ? { "X-Base-Updated-At": baseUpdatedAt } : {}),
    };
    const res = await fetchWithTimeout(url, {
      method,
      headers,
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const msg = serverMessage(txt, res.status);
      if (!isRetryable(res.status)) {
        unqueue();
        if (res.status === 409 && typeof window !== "undefined") {
          // Somebody else changed it first: tell the person, and let the app fetch the newer copy.
          window.dispatchEvent(new CustomEvent("mrwater:sync-conflict", { detail: { url, message: msg } }));
        }
        notifySyncStatus({
          isSyncing: false,
          consecutiveFailures: Math.min(syncStatusState.consecutiveFailures + 1, 10),
          lastError: res.status === 409 ? `Not saved: ${msg}` : `${method} ${url}: ${msg}`,
        });
        return false;
      }
      throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
    }

    // Remember the stamp the server now holds, so this device's next edit is compared against it.
    if (kind && recId !== undefined) {
      let stamp = stampOf(payload);
      try {
        const j = await res.clone().json();
        stamp = stampOf(j?.data) || stamp;
      } catch {
        /* no body */
      }
      if (stamp) seenStamps.set(`${kind}:${recId}`, stamp);
    }
    unqueue();
    notifySyncStatus({
      isSyncing: false,
      consecutiveFailures: 0,
      lastSuccessfulSync: new Date().toISOString(),
      lastError: null,
    });
    // Tell the other devices (a tiny message, no data) so they check for changes now rather than at their next timer.
    announceCloudChange();
    return true;
  } catch (err: any) {
    console.warn(`[Storage] Server ${method} failed for ${url}:`, err.message);
    queue((existing?.attempts || 0) + 1);
    notifySyncStatus({
      isSyncing: false,
      consecutiveFailures: Math.min(syncStatusState.consecutiveFailures + 1, 10),
      lastError: err.message || `Failed to sync ${url}`,
    });
    return false;
  }
}

export async function flushPendingWrites(): Promise<void> {
  if (flushingPending || pendingWrites.size === 0 || !outboxUser) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  flushingPending = true;
  try {
    for (const [key, w] of Array.from(pendingWrites.entries())) {
      if (w.userId !== outboxUser) continue; // belongs to somebody else who used this phone
      const ok = await sendWrite(w.url, w.method, w.payload, { key, billId: w.billId });
      if (!ok && pendingWrites.has(key)) break; // still offline: keep order, try again later
    }
  } finally {
    flushingPending = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void flushPendingWrites();
  });
  setInterval(() => {
    if (pendingWrites.size > 0) void flushPendingWrites();
  }, 30000);
}

const STATIC_API_COLLECTIONS: Record<string, string> = {
  "/api/bills": "bills",
  "/api/trips": "trips",
  "/api/settings/billing": "billing_settings",
  "/api/settings/profile": "organization_profile",
  "/api/collections/partners": "partners",
  "/api/collections/supplier_schemes": "supplier_schemes",
  "/api/collections/supplier_scheme_applications":
    "supplier_scheme_applications",
  "/api/collections/supplier_credit_notes": "supplier_credit_notes",
  "/api/collections/business_expenses": "business_expenses",
  "/api/collections/audit_sessions": "audit_sessions",
  "/api/collections/reconciliation_transactions": "reconciliation_transactions",
  "/api/collections/stock_ledger_entries": "stock_ledger_entries",
  "/api/inventory": "inventory",
  "/api/inventory/import": "inventory",
  "/api/collections/stock_transactions": "stock_transactions",
  "/api/warehouses": "warehouses",
  "/api/collections/warehouse_bays": "warehouse_bays",
  "/api/schemes": "schemes",
  "/api/collections/vehicle_trip": "vehicle_trip",
  "/api/products": "products",
  "/api/batches": "inventory_batches",
  "/api/salesmen": "salesmen",
  "/api/payments": "payments",
  "/api/grns": "inward_grns",
  "/api/customers": "customers",
};

export function isStaticDeployment(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.endsWith(".github.io") || host === "github.io";
}

function staticCollectionKey(url: string): string | null {
  try {
    const path =
      new URL(url, window.location.origin).pathname.replace(/\/+$/, "") || "/";
    return STATIC_API_COLLECTIONS[path] || null;
  } catch {
    return null;
  }
}

function extractStaticPayload(path: string, payload: any): any {
  if (path === "/api/bills") return payload?.bills ?? payload ?? [];
  if (path === "/api/trips") return payload?.trips ?? payload ?? [];
  if (path === "/api/settings/billing")
    return payload?.settings ?? payload ?? null;
  if (path === "/api/settings/profile")
    return payload?.profile ?? payload ?? null;
  if (path === "/api/inventory/import") return payload?.items ?? payload ?? [];
  if (path === "/api/warehouses") return payload?.warehouses ?? payload ?? [];
  if (path === "/api/products") return payload?.products ?? payload ?? [];
  if (path === "/api/batches") return payload?.batches ?? payload ?? [];
  if (path === "/api/salesmen") return payload?.salesmen ?? payload ?? [];
  if (path === "/api/payments") return payload?.payments ?? payload ?? [];
  if (path === "/api/customers") return payload?.customers ?? payload?.data ?? payload ?? [];
  if (path.startsWith("/api/collections/"))
    return payload?.data ?? payload ?? [];
  if (path === "/api/schemes") return payload?.schemes ?? payload ?? [];
  if (path === "/api/grns") return payload?.grns ?? payload?.data ?? payload ?? [];
  return payload;
}

async function fetchFromStaticCollection<T>(url: string): Promise<T | null> {
  const key = staticCollectionKey(url);
  if (!key) return null;
  const client = getSupabaseClient();
  if (!client) {
    notifySyncStatus({ lastError: "Supabase is not configured" });
    return null;
  }

  try {
    const { data, error } = (await withTimeout(
      client.from("app_collections").select("data,updated_at").eq("key", key).maybeSingle(),
    )) as any;
    if (error) throw error;
    if (data?.updated_at) collectionSeen.set(key, String(data.updated_at));

    // No row yet = the cloud knows nothing, which is not the same as "empty": return null so the
    // caller keeps this device's own copy instead of overwriting it with an empty list.
    if (!data) return null;
    const value =
      data.data ??
      (key === "billing_settings" || key === "organization_profile"
        ? null
        : []);
    notifySyncStatus({
      consecutiveFailures: 0,
      lastSuccessfulSync: new Date().toISOString(),
      lastError: null,
    });
    return value as T;
  } catch (err: any) {
    const message = err?.message || "Supabase collection read failed";
    console.warn(`[Storage] Supabase read failed for ${key} (using local cache):`, message);
    return null;
  }
}

async function saveToStaticCollection(
  url: string,
  payload: any,
): Promise<boolean> {
  const key = staticCollectionKey(url);
  if (!key) return false;
  const client = getSupabaseClient();
  if (!client) {
    notifySyncStatus({ lastError: "Supabase is not configured" });
    return false;
  }

  try {
    const path =
      new URL(url, window.location.origin).pathname.replace(/\/+$/, "") || "/";
    const data = extractStaticPayload(path, payload);
    const { error } = await writeCollectionMerged(client, key, data, withTimeout);
    if (error) throw error;

    notifySyncStatus({
      isSyncing: false,
      consecutiveFailures: 0,
      lastSuccessfulSync: new Date().toISOString(),
      lastError: null,
    });
    return true;
  } catch (err: any) {
    const message = err?.message || "Supabase collection write failed";
    console.warn(`[Storage] Supabase write failed for ${key}:`, message);
    notifySyncStatus({
      isSyncing: false,
      consecutiveFailures: Math.min(syncStatusState.consecutiveFailures + 1, 10),
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
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
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
    if (json && typeof json === "object" && "data" in json) {
      return json.data as T;
    }
    return json as T;
  } catch (err: any) {
    // Read failures on startup/background poll fall back to local localStorage cache safely
    console.warn(`[Storage] Server fetch failed for ${url} (falling back to local cache):`, err.message);
    return null;
  }
}

async function postOrPutServer<T>(url: string, method: "POST" | "PUT", payload: any): Promise<boolean> {
  return sendWrite(url, method, payload);
}

/* =========================================================================
 * 1. ORDERS
 * ========================================================================= */
export async function loadOrders(): Promise<Order[]> {
  const serverData = await fetchFromServer<Order[]>("/api/bills");
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.orders, serverData);
    recordSeen("bills", serverData);
    return serverData;
  }
  return readLocalCache<Order[]>(STORAGE_KEYS.orders, []);
}

export async function saveOrders(orders: Order[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.orders, orders);
  // Persist to server via /api/bills which syncs to Supabase public.bills
  postOrPutServer("/api/bills", "PUT", { bills: orders });
}

/* =========================================================================
 * 1B. DELIVERY TRIPS (Supabase public.trips)
 * ========================================================================= */
export async function loadTrips(): Promise<any[]> {
  const serverData = await fetchFromServer<any[]>("/api/trips");
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.trips, serverData);
    recordSeen("trips", serverData);
    return serverData;
  }
  return readLocalCache<any[]>(STORAGE_KEYS.trips, []);
}

export function loadCachedTrips(): any[] {
  return readLocalCache<any[]>(STORAGE_KEYS.trips, []);
}

export async function saveTrips(trips: any[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.trips, trips);
  postOrPutServer("/api/trips", "PUT", { trips });
}

/* =========================================================================
 * 1C. SETTINGS (Supabase public.billing_settings & organization_profile)
 * ========================================================================= */
export function loadCachedBillingSettings(): any | null {
  return readLocalCache<any | null>(STORAGE_KEYS.billing_settings, null);
}

export async function loadBillingSettings(): Promise<any | null> {
  const serverData = await fetchFromServer<any>("/api/settings/billing");
  if (serverData !== null) {
    writeLocalCache(STORAGE_KEYS.billing_settings, serverData);
    return serverData;
  }
  return readLocalCache<any | null>(STORAGE_KEYS.billing_settings, null);
}

/** Remember the billing settings on THIS device only (nothing is sent anywhere). */
export function cacheBillingSettingsLocally(settings: any): void {
  writeLocalCache(STORAGE_KEYS.billing_settings, settings);
  try {
    if (typeof localStorage !== 'undefined') {
      const legacyKey = "mrwater_distribution_ledger_v4";
      const raw = localStorage.getItem(legacyKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.billingSettings = settings;
        localStorage.setItem(legacyKey, JSON.stringify(parsed));
      }
    }
  } catch {}
}

/**
 * THE one way billing settings are saved: this device first, then the server (which writes billing_settings in
 * Supabase). Resolves true only when the server accepted it; false means "kept on this device, will retry".
 */
export async function saveBillingSettings(settings: any): Promise<boolean> {
  cacheBillingSettingsLocally(settings);
  return postOrPutServer("/api/settings/billing", "POST", { settings });
}

export async function loadOrgProfile(): Promise<any | null> {
  const serverData = await fetchFromServer<any>("/api/settings/profile");
  if (serverData !== null) {
    writeLocalCache(STORAGE_KEYS.org_profile, serverData);
    return serverData;
  }
  return readLocalCache<any | null>(STORAGE_KEYS.org_profile, null);
}

export async function saveOrgProfile(profile: any): Promise<void> {
  writeLocalCache(STORAGE_KEYS.org_profile, profile);
  postOrPutServer("/api/settings/profile", "POST", { profile });
}

/* =========================================================================
 * 1D. PAYMENTS & COLLECTIONS (Supabase / Local Cache)
 * ========================================================================= */
export function loadCachedPayments(): PaymentRecord[] {
  return readLocalCache<PaymentRecord[]>(STORAGE_KEYS.payments, []);
}

export async function loadPayments(): Promise<PaymentRecord[]> {
  const raw = await fetchFromServer<PaymentRecord[]>("/api/payments");
  if (raw !== null && Array.isArray(raw)) {
    // Drop anything the owner deleted before it can be cached or merged again.
    const serverData = await dropDeletedFromList("payment", raw);
    writeLocalCache(STORAGE_KEYS.payments, serverData);
    recordSeen("payments", serverData);
    return serverData;
  }
  return readLocalCache<PaymentRecord[]>(STORAGE_KEYS.payments, []);
}

export async function savePayments(payments: PaymentRecord[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.payments, payments);
  const safe = await dropDeletedFromList("payment", payments).catch(() => payments);
  postOrPutServer("/api/payments", "PUT", { payments: safe });
}

/* =========================================================================
 * 1E. CUSTOMERS & RETAILERS MASTER (Supabase / Local Cache)
 * ========================================================================= */
export function loadCachedCustomers(): Customer[] {
  return readLocalCache<Customer[]>(STORAGE_KEYS.customers, []);
}

export async function loadCustomers(): Promise<Customer[]> {
  const raw = await fetchFromServer<Customer[]>("/api/customers");
  if (raw !== null && Array.isArray(raw)) {
    const serverData = await dropDeletedFromList("customer", raw);
    writeLocalCache(STORAGE_KEYS.customers, serverData);
    recordSeen("customers", serverData);
    return serverData;
  }
  return readLocalCache<Customer[]>(STORAGE_KEYS.customers, []);
}

export async function saveCustomers(customers: Customer[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.customers, customers);
  const safe = await dropDeletedFromList("customer", customers).catch(() => customers);
  postOrPutServer("/api/customers", "PUT", { customers: safe });
}

/* =========================================================================
 * 1F. GRNS & INWARD INVOICES (Supabase public.grns & collections)
 * ========================================================================= */
export function loadCachedGrns(): any[] {
  return readLocalCache<any[]>(STORAGE_KEYS.grns, []);
}

export async function loadGrns(): Promise<any[]> {
  const serverData = await fetchFromServer<any[]>("/api/grns");
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.grns, serverData);
    return serverData;
  }
  return readLocalCache<any[]>(STORAGE_KEYS.grns, []);
}

export async function saveGrns(grns: any[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.grns, grns);
  postOrPutServer("/api/grns", "PUT", { grns });
}

/* =========================================================================
 * 2. PARTNERS (Retailers, Customers, Suppliers)
 * ========================================================================= */
export async function loadPartners(): Promise<Partner[]> {
  const serverData = await fetchFromServer<Partner[]>(
    "/api/collections/partners",
  );
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.partners, serverData);
    return serverData;
  }
  return readLocalCache<Partner[]>(STORAGE_KEYS.partners, []);
}

export async function savePartners(partners: Partner[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.partners, partners);
  postOrPutServer("/api/collections/partners", "PUT", { data: partners });
}

/* =========================================================================
 * SUPPLIER SCHEME & INCENTIVE SYSTEM (generic app_collections-backed, mirrors Partners)
 * ========================================================================= */
export async function loadSupplierSchemes(): Promise<SupplierScheme[]> {
  const serverData = await fetchFromServer<SupplierScheme[]>(
    "/api/collections/supplier_schemes",
  );
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.supplier_schemes, serverData);
    return serverData;
  }
  return readLocalCache<SupplierScheme[]>(STORAGE_KEYS.supplier_schemes, []);
}

export async function saveSupplierSchemes(
  schemes: SupplierScheme[],
): Promise<void> {
  writeLocalCache(STORAGE_KEYS.supplier_schemes, schemes);
  postOrPutServer("/api/collections/supplier_schemes", "PUT", {
    data: schemes,
  });
}

export async function loadSupplierSchemeApplications(): Promise<
  SupplierSchemeApplication[]
> {
  const serverData = await fetchFromServer<SupplierSchemeApplication[]>(
    "/api/collections/supplier_scheme_applications",
  );
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.supplier_scheme_applications, serverData);
    return serverData;
  }
  return readLocalCache<SupplierSchemeApplication[]>(
    STORAGE_KEYS.supplier_scheme_applications,
    [],
  );
}

export async function saveSupplierSchemeApplications(
  apps: SupplierSchemeApplication[],
): Promise<void> {
  writeLocalCache(STORAGE_KEYS.supplier_scheme_applications, apps);
  postOrPutServer("/api/collections/supplier_scheme_applications", "PUT", {
    data: apps,
  });
}

export async function loadSupplierCreditNotes(): Promise<SupplierCreditNote[]> {
  const serverData = await fetchFromServer<SupplierCreditNote[]>(
    "/api/collections/supplier_credit_notes",
  );
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.supplier_credit_notes, serverData);
    return serverData;
  }
  return readLocalCache<SupplierCreditNote[]>(
    STORAGE_KEYS.supplier_credit_notes,
    [],
  );
}

export async function saveSupplierCreditNotes(
  notes: SupplierCreditNote[],
): Promise<void> {
  writeLocalCache(STORAGE_KEYS.supplier_credit_notes, notes);
  postOrPutServer("/api/collections/supplier_credit_notes", "PUT", {
    data: notes,
  });
}

/* =========================================================================
 * SMART STOCK RECONCILIATION & AUDIT (generic app_collections-backed, mirrors above)
 * ========================================================================= */
export async function loadInventoryDispositions(): Promise<
  import("../types").InventoryDisposition[]
> {
  const serverData = await fetchFromServer<
    import("../types").InventoryDisposition[]
  >("/api/collections/inventory_dispositions");
  if (serverData && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.inventory_dispositions, serverData);
    return serverData;
  }
  return readLocalCache(STORAGE_KEYS.inventory_dispositions, []);
}

export async function saveInventoryDispositions(
  rows: import("../types").InventoryDisposition[],
): Promise<void> {
  writeLocalCache(STORAGE_KEYS.inventory_dispositions, rows);
  postOrPutServer("/api/collections/inventory_dispositions", "PUT", {
    data: rows,
  });
}

export function loadCachedInventoryDispositions(): import("../types").InventoryDisposition[] {
  return readLocalCache<import("../types").InventoryDisposition[]>(
    STORAGE_KEYS.inventory_dispositions,
    [],
  );
}

/* =========================================================================
 * BUSINESS EXPENSES (Business reports -> Profit & loss), app_collections-backed
 * ========================================================================= */
export type BusinessExpenseRecord = {
  id: string;
  date: string;
  category: string;
  amount: number;
  note: string;
  /** employee / vendor the money was paid to (used for salary budget) */
  paidTo?: string;
  /** Optional link to the trip this cost belongs to (fuel, driver, toll ...). */
  tripId?: number;
  tripLabel?: string;
  /** Last edit time; the newest edit wins when devices merge. */
  updatedAt?: string;
};

/** Newest edit wins; entries in `dead` (deleted by the owner) are always dropped. */
export function mergeExpenseLists(
  dead: Set<string>,
  ...lists: BusinessExpenseRecord[][]
): BusinessExpenseRecord[] {
  const map = new Map<string, BusinessExpenseRecord>();
  for (const l of lists) {
    for (const r of l || []) {
      if (!r || !r.id || dead.has(r.id)) continue;
      const cur = map.get(r.id);
      if (!cur || (Date.parse(r.updatedAt || "") || 0) > (Date.parse(cur.updatedAt || "") || 0)) {
        map.set(r.id, r);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function loadCachedBusinessExpenses(): BusinessExpenseRecord[] {
  return readLocalCache<BusinessExpenseRecord[]>(
    STORAGE_KEYS.business_expenses,
    [],
  );
}

export async function loadBusinessExpenses(): Promise<BusinessExpenseRecord[]> {
  const serverData = await fetchFromServer<BusinessExpenseRecord[]>(
    "/api/collections/business_expenses",
  );
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.business_expenses, serverData);
    return serverData;
  }
  return loadCachedBusinessExpenses();
}

/**
 * Saves the expense list WITHOUT overwriting what other devices added: the server copy is read first,
 * merged (newest edit wins, deleted ids dropped) and only then written. Returns the merged list so the
 * caller can show entries that were added elsewhere.
 */
export async function saveBusinessExpenses(
  rows: BusinessExpenseRecord[],
  dead: Set<string> = new Set(),
): Promise<BusinessExpenseRecord[]> {
  let merged = mergeExpenseLists(dead, rows);
  try {
    const server = await fetchFromServer<BusinessExpenseRecord[]>(
      "/api/collections/business_expenses",
    );
    if (Array.isArray(server)) merged = mergeExpenseLists(dead, server, rows);
  } catch {
    /* keep the local list */
  }
  writeLocalCache(STORAGE_KEYS.business_expenses, merged);
  postOrPutServer("/api/collections/business_expenses", "PUT", { data: merged });
  return merged;
}

export function loadCachedSupplierCreditNotes(): import("../types").SupplierCreditNote[] {
  return readLocalCache<import("../types").SupplierCreditNote[]>(
    STORAGE_KEYS.supplier_credit_notes,
    [],
  );
}

export function loadCachedSupplierSchemes(): import("../types").SupplierScheme[] {
  return readLocalCache<import("../types").SupplierScheme[]>(
    STORAGE_KEYS.supplier_schemes,
    [],
  );
}

export function loadCachedOrders(): Order[] {
  return readLocalCache<Order[]>(STORAGE_KEYS.orders, []);
}

export function loadCachedAuditSessions(): AuditSession[] {
  return readLocalCache<AuditSession[]>(STORAGE_KEYS.audit_sessions, []);
}

export function loadCachedReconciliationTransactions(): ReconciliationTransaction[] {
  return readLocalCache<ReconciliationTransaction[]>(
    STORAGE_KEYS.reconciliation_transactions,
    [],
  );
}

export function loadCachedStockLedgerEntries(): StockLedgerEntry[] {
  return readLocalCache<StockLedgerEntry[]>(
    STORAGE_KEYS.stock_ledger_entries,
    [],
  );
}

export async function loadAuditSessions(): Promise<AuditSession[]> {
  const localData = readLocalCache<AuditSession[]>(
    STORAGE_KEYS.audit_sessions,
    [],
  );
  const serverData = await fetchFromServer<AuditSession[]>(
    "/api/collections/audit_sessions",
  );
  if (serverData !== null && Array.isArray(serverData)) {
    if (serverData.length > 0) {
      const map = new Map(localData.map((s) => [s.id, s]));
      serverData.forEach((s) => map.set(s.id, s));
      const merged = Array.from(map.values());
      writeLocalCache(STORAGE_KEYS.audit_sessions, merged);
      return merged;
    } else if (localData.length > 0) {
      // Server returned empty collection but local cache has sessions -> heal the server collection
      postOrPutServer("/api/collections/audit_sessions", "PUT", {
        data: localData,
      });
      return localData;
    }
  }
  return localData;
}

export async function saveAuditSessions(
  sessions: AuditSession[],
): Promise<void> {
  writeLocalCache(STORAGE_KEYS.audit_sessions, sessions);
  postOrPutServer("/api/collections/audit_sessions", "PUT", { data: sessions });
}

export async function loadReconciliationTransactions(): Promise<
  ReconciliationTransaction[]
> {
  const localData = readLocalCache<ReconciliationTransaction[]>(
    STORAGE_KEYS.reconciliation_transactions,
    [],
  );
  const serverData = await fetchFromServer<ReconciliationTransaction[]>(
    "/api/collections/reconciliation_transactions",
  );
  if (serverData !== null && Array.isArray(serverData)) {
    if (serverData.length > 0) {
      const map = new Map(localData.map((t) => [t.id, t]));
      serverData.forEach((t) => map.set(t.id, t));
      const merged = Array.from(map.values());
      writeLocalCache(STORAGE_KEYS.reconciliation_transactions, merged);
      return merged;
    } else if (localData.length > 0) {
      postOrPutServer("/api/collections/reconciliation_transactions", "PUT", {
        data: localData,
      });
      return localData;
    }
  }
  return localData;
}

export async function saveReconciliationTransactions(
  txns: ReconciliationTransaction[],
): Promise<void> {
  writeLocalCache(STORAGE_KEYS.reconciliation_transactions, txns);
  postOrPutServer("/api/collections/reconciliation_transactions", "PUT", {
    data: txns,
  });
}

export async function loadStockLedgerEntries(): Promise<StockLedgerEntry[]> {
  const localData = readLocalCache<StockLedgerEntry[]>(
    STORAGE_KEYS.stock_ledger_entries,
    [],
  );
  const serverData = await fetchFromServer<StockLedgerEntry[]>(
    "/api/collections/stock_ledger_entries",
  );
  if (serverData !== null && Array.isArray(serverData)) {
    if (serverData.length > 0) {
      const map = new Map(localData.map((e) => [e.id, e]));
      serverData.forEach((e) => map.set(e.id, e));
      const merged = Array.from(map.values());
      writeLocalCache(STORAGE_KEYS.stock_ledger_entries, merged);
      return merged;
    } else if (localData.length > 0) {
      postOrPutServer("/api/collections/stock_ledger_entries", "PUT", {
        data: localData,
      });
      return localData;
    }
  }
  return localData;
}

export async function saveStockLedgerEntries(
  entries: StockLedgerEntry[],
): Promise<void> {
  writeLocalCache(STORAGE_KEYS.stock_ledger_entries, entries);
  postOrPutServer("/api/collections/stock_ledger_entries", "PUT", {
    data: entries,
  });
}

/* =========================================================================
 * 3. INVENTORY ITEMS (PostgreSQL public.inventory_items)
 * ========================================================================= */
export async function loadInventory(): Promise<InventoryItem[]> {
  const serverData = await fetchFromServer<InventoryItem[]>("/api/inventory");
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.inventory, serverData);
    return serverData;
  }
  return readLocalCache<InventoryItem[]>(STORAGE_KEYS.inventory, []);
}

export async function saveInventory(
  inventory: InventoryItem[],
  replaceAll = false,
): Promise<void> {
  writeLocalCache(STORAGE_KEYS.inventory, inventory);
  // Sync to PostgreSQL via POST /api/inventory/import
  postOrPutServer("/api/inventory/import", "POST", {
    items: inventory,
    replaceAll,
  });
}

export const syncInventoryToServer = saveInventory;

/* =========================================================================
 * 4. STOCK TRANSACTIONS
 * ========================================================================= */
export async function loadStockTransactions(): Promise<StockTransaction[]> {
  const serverData = await fetchFromServer<StockTransaction[]>(
    "/api/collections/stock_transactions",
  );
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.stock_transactions, serverData);
    return serverData;
  }
  return readLocalCache<StockTransaction[]>(
    STORAGE_KEYS.stock_transactions,
    [],
  );
}

export async function saveStockTransactions(
  transactions: StockTransaction[],
): Promise<void> {
  writeLocalCache(STORAGE_KEYS.stock_transactions, transactions);
  postOrPutServer("/api/collections/stock_transactions", "PUT", {
    data: transactions,
  });
}

/* =========================================================================
 * 5. WAREHOUSES
 * ========================================================================= */
export async function loadWarehouses(): Promise<Warehouse[]> {
  const serverData = await fetchFromServer<Warehouse[]>("/api/warehouses");
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.warehouses, serverData);
    return serverData;
  }
  return readLocalCache<Warehouse[]>(STORAGE_KEYS.warehouses, []);
}

export async function saveWarehouses(warehouses: Warehouse[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.warehouses, warehouses);
  postOrPutServer("/api/warehouses", "PUT", { warehouses });
}

/* =========================================================================
 * 6. WAREHOUSE BAYS
 * ========================================================================= */
export async function loadWarehouseBays(): Promise<WarehouseBay[]> {
  const serverData = await fetchFromServer<WarehouseBay[]>(
    "/api/collections/warehouse_bays",
  );
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.warehouse_bays, serverData);
    return serverData;
  }
  return readLocalCache<WarehouseBay[]>(STORAGE_KEYS.warehouse_bays, []);
}

export async function saveWarehouseBays(bays: WarehouseBay[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.warehouse_bays, bays);
  postOrPutServer("/api/collections/warehouse_bays", "PUT", { data: bays });
}

/* =========================================================================
 * 7. PROMOTIONAL SCHEMES
 * ========================================================================= */
export async function loadSchemes(): Promise<PromotionalScheme[]> {
  const serverData = await fetchFromServer<PromotionalScheme[]>("/api/schemes");
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.schemes, serverData);
    return serverData;
  }
  return readLocalCache<PromotionalScheme[]>(STORAGE_KEYS.schemes, []);
}

export async function saveSchemes(schemes: PromotionalScheme[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.schemes, schemes);
  // Sync to server schemes endpoint (persists to Supabase promotions table)
  postOrPutServer("/api/schemes", "PUT", { schemes });
}

/* =========================================================================
 * 8. DAILY VEHICLE TRIP
 * ========================================================================= */
export async function loadDailyVehicleTrip(): Promise<DailyVehicleTrip | null> {
  const serverData = await fetchFromServer<DailyVehicleTrip | null>(
    "/api/collections/vehicle_trip",
  );
  if (serverData !== null) {
    writeLocalCache(STORAGE_KEYS.vehicle_trip, serverData);
    return serverData;
  }
  return readLocalCache<DailyVehicleTrip | null>(
    STORAGE_KEYS.vehicle_trip,
    null,
  );
}

export async function saveDailyVehicleTrip(
  trip: DailyVehicleTrip,
): Promise<void> {
  writeLocalCache(STORAGE_KEYS.vehicle_trip, trip);
  postOrPutServer("/api/collections/vehicle_trip", "PUT", { data: trip });
}

/* =========================================================================
 * 9. PRODUCTS & INVENTORY BATCHES (PostgreSQL products and inventory_batches)
 * ========================================================================= */
export async function loadProducts(): Promise<any[]> {
  const serverData = await fetchFromServer<any[]>("/api/products");
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.products, serverData);
    return serverData;
  }
  return readLocalCache<any[]>(STORAGE_KEYS.products, []);
}

export async function saveProducts(products: any[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.products, products);
  postOrPutServer("/api/products", "POST", { products });
}

export async function loadInventoryBatches(): Promise<any[]> {
  const serverData = await fetchFromServer<any[]>("/api/batches");
  if (serverData !== null && Array.isArray(serverData)) {
    writeLocalCache(STORAGE_KEYS.inventory_batches, serverData);
    return serverData;
  }
  return readLocalCache<any[]>(STORAGE_KEYS.inventory_batches, []);
}

export async function saveInventoryBatches(batches: any[]): Promise<void> {
  writeLocalCache(STORAGE_KEYS.inventory_batches, batches);
  postOrPutServer("/api/batches", "POST", { batches });
}

/* =========================================================================
 * 10. SALESMEN & AUTH SESSION
 * ========================================================================= */
export function loadCachedSalesmen(): Salesman[] {
  return readLocalCache<Salesman[]>(STORAGE_KEYS.salesmen, []);
}

export async function loadSalesmen(): Promise<Salesman[]> {
  const serverData = await fetchFromServer<Salesman[]>("/api/salesmen");
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
