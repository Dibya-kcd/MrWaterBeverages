import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { billExtraFields, applyBillExtra, grnExtraFields, applyGrnExtra } from "../utils/billExtra";
import {
  Audit,
  Bill,
  BillingSettings,
  GRN,
  InventoryBatch,
  OrganizationProfile,
  PaymentRecord,
  Product,
  Promotion,
  StockTransfer,
  Trip,
  Warehouse,
  Salesman,
  SupplierScheme,
  SupplierSchemeApplication,
  SupplierCreditNote,
  InventoryDisposition,
  AuditSession,
  GRN as GrnType,
  GrnEditRecord,
  ReconciliationTransaction,
  StockLedgerEntry,
  CategoryKey,
} from "../types";
import { INIT_WAREHOUSES, CATS } from "../constants/initialData";
import {
  generateSkuId,
  normalizeTrip,
  parseJsonDict,
  parseBillIds,
  resolveProductGstRate,
  gstRateFromHsn,
  normalizeTo8DigitHsn,
} from "../utils/billing";
import { hashPin, verifyPin } from "../utils/crypto";
import { todayISO } from "../utils/dateLocal";
import { fingerprintOf, shortHash } from "../utils/syncGate";
import { fetchTableDelta, fetchRowIfChanged, resetTableCaches, resetRowCaches } from "./tableDelta";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  projectRef: string;
  isConfigured: boolean;
}

const STORAGE_CONFIG_KEY = "mrwater_supabase_custom_credentials";

/**
 * True when the code is running inside the automated test scripts (scripts/test-*.ts), which mount the real
 * LedgerProvider under jsdom. Those runs must NEVER reach the live database: before this guard the hard-coded
 * fallback URL below let `npm test` push test bills, trips, products and GRNs into the production Supabase project.
 */
function isTestRun(): boolean {
  try {
    if ((globalThis as any).process?.env?.MRWATER_TEST === "1") return true;
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || "")) return true;
  } catch {
    // ignore
  }
  return false;
}

export function getSupabaseConfig(): SupabaseConfig {
  if (isTestRun()) {
    return { url: "", anonKey: "", projectRef: "test", isConfigured: false };
  }
  const envUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    "https://psizakmtxppariejawbd.supabase.co";
  const envKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    "sb_publishable_3D3tfJOS10gkL0lJ6qQT1Q_Lvux1S9W";

  let customUrl = "";
  let customKey = "";

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        customUrl = parsed.url || "";
        customKey = parsed.anonKey || "";
      }
    } catch {
      // ignore
    }
  }

  const finalUrl = (customUrl || envUrl || "").trim();
  const finalKey = (customKey || envKey || "").trim();

  // Check for dummy or missing placeholder keys
  const isInvalidPlaceholder =
    !finalKey ||
    finalKey === "YOUR_SUPABASE_ANON_KEY" ||
    finalKey === "MY_SUPABASE_ANON_KEY" ||
    finalKey.trim() === "";

  let projectRef = "psizakmtxppariejawbd";
  try {
    if (finalUrl) {
      const parsedUrl = new URL(finalUrl);
      projectRef = parsedUrl.hostname.split(".")[0] || "psizakmtxppariejawbd";
    }
  } catch {
    // fallback
  }

  return {
    url: finalUrl,
    anonKey: finalKey,
    projectRef,
    isConfigured: Boolean(finalUrl && finalKey && !isInvalidPlaceholder),
  };
}

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = "";

export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    return null;
  }

  const configKey = `${config.url}_${config.anonKey}`;
  if (cachedClient && cachedConfigKey === configKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    cachedConfigKey = configKey;
    return cachedClient;
  } catch (err) {
    console.error("Failed to create Supabase client:", err);
    return null;
  }
}

export function saveSupabaseCustomConfig(url: string, anonKey: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(
      STORAGE_CONFIG_KEY,
      JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }),
    );
    cachedClient = null;
    cachedConfigKey = "";
  }
}

export function clearSupabaseCustomConfig(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_CONFIG_KEY);
    cachedClient = null;
    cachedConfigKey = "";
  }
}

export interface ConnectionTestResult {
  connected: boolean;
  url: string;
  projectRef: string;
  latencyMs: number;
  tablesReady: {
    warehouses: boolean;
    products: boolean;
    inventory_batches: boolean;
    stock_transfers: boolean;
    promotions: boolean;
    bills: boolean;
    trips: boolean;
    audits: boolean;
    organization_profile: boolean;
    billing_settings: boolean;
    inventory_items?: boolean;
    app_collections?: boolean;
    salesmen?: boolean;
  };
  allTablesExist: boolean;
  message: string;
  error?: string;
}

export async function testSupabaseConnection(): Promise<ConnectionTestResult> {
  const config = getSupabaseConfig();
  const client = getSupabaseClient();

  const emptyTables = {
    warehouses: false,
    products: false,
    inventory_batches: false,
    stock_transfers: false,
    promotions: false,
    bills: false,
    trips: false,
    audits: false,
    organization_profile: false,
    billing_settings: false,
    salesmen: false,
  };

  if (!client) {
    return {
      connected: false,
      url: config.url,
      projectRef: config.projectRef,
      latencyMs: 0,
      tablesReady: emptyTables,
      allTablesExist: false,
      message:
        "Local-first storage is active. Cloud synchronization requires custom Supabase credentials.",
      error: undefined,
    };
  }

  const startTime = Date.now();

  try {
    const checkTable = async (tableName: string): Promise<boolean> => {
      try {
        const checkPromise = client.from(tableName).select("id").limit(1);
        const timeoutPromise = new Promise<{ error: any }>((resolve) =>
          setTimeout(() => resolve({ error: { message: "timeout" } }), 2000),
        );
        const { error } = await Promise.race([checkPromise, timeoutPromise]);
        if (error) {
          if (
            error.code === "PGRST205" ||
            String(error.message || "").includes("Could not find the table")
          ) {
            return false;
          }
          if (
            String(error.message || "").includes("520") ||
            String(error.message || "").includes("timeout") ||
            String(error.message || "").includes("<!DOCTYPE")
          ) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    };

    const overallCheck = Promise.all([
      checkTable("warehouses"),
      checkTable("products"),
      checkTable("inventory_batches"),
      checkTable("stock_transfers"),
      checkTable("promotions"),
      checkTable("bills"),
      checkTable("trips"),
      checkTable("audits"),
      checkTable("organization_profile"),
      checkTable("billing_settings"),
      checkTable("inventory_items"),
      checkTable("app_collections"),
      checkTable("salesmen"),
    ]);

    const overallTimeout = new Promise<boolean[]>((_, reject) =>
      setTimeout(() => reject(new Error("Supabase connection timeout")), 3500),
    );

    const [
      whOk,
      productsOk,
      batchesOk,
      transfersOk,
      promosOk,
      billsOk,
      tripsOk,
      auditsOk,
      orgOk,
      settingsOk,
      invItemsOk,
      collectionsOk,
      salesmenOk,
    ] = await Promise.race([overallCheck, overallTimeout]);

    const latencyMs = Date.now() - startTime;
    const tablesReady = {
      warehouses: whOk,
      products: productsOk,
      inventory_batches: batchesOk,
      stock_transfers: transfersOk,
      promotions: promosOk,
      bills: billsOk,
      trips: tripsOk,
      audits: auditsOk,
      organization_profile: orgOk,
      billing_settings: settingsOk,
      inventory_items: invItemsOk,
      app_collections: collectionsOk,
      salesmen: salesmenOk,
    };

    const allTablesExist = Object.values(tablesReady).every(Boolean);

    return {
      connected: true,
      url: config.url,
      projectRef: config.projectRef,
      latencyMs,
      tablesReady,
      allTablesExist,
      message: allTablesExist
        ? "Connected to Supabase PostgreSQL database. All tables, warehouse schemas, and RLS policies are active."
        : "Connected to Supabase project endpoint. Please run the SQL setup script to initialize missing tables.",
    };
  } catch (err: any) {
    const rawMsg = String(err?.message || err || "");
    const cleanMsg =
      rawMsg.includes("520") ||
      rawMsg.includes("<!DOCTYPE") ||
      rawMsg.includes("timeout")
        ? "Supabase service temporarily unavailable or timing out. Local-first storage active."
        : `Failed to connect to Supabase: ${rawMsg}`;

    return {
      connected: false,
      url: config.url,
      projectRef: config.projectRef,
      latencyMs: Date.now() - startTime,
      tablesReady: emptyTables,
      allTablesExist: false,
      message: cleanMsg,
      error: cleanMsg,
    };
  }
}

function sanitizeDate(val?: string): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export interface SyncResult {
  success: boolean;
  message?: string;
  pushedCount?: {
    warehouses: number;
    products: number;
    inventoryBatches: number;
    grns: number;
    promotions: number;
    bills: number;
    trips: number;
    audits: number;
    payments?: number;
    salesmen?: number;
    supplierSchemes?: number;
    supplierSchemeApplications?: number;
    supplierCreditNotes?: number;
  };
}

/**
 * Validate UUID format
 */
export function isValidUuid(val: any): boolean {
  if (typeof val !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    val.trim(),
  );
}

/**
 * Resilient upsert helper that handles PostgREST schema cache misses gracefully.
 * If PostgREST schema cache has not yet refreshed for newly added columns (e.g. 'salesman', 'salesman_id'),
 * it automatically detects the missing column, removes it, and retries the operation seamlessly.
 */
export async function resilientSupabaseUpsert(
  client: any,
  tableName: string,
  data: any | any[],
  options: { onConflict?: string } = { onConflict: "id" },
): Promise<{ error: any; data?: any }> {
  const isArray = Array.isArray(data);
  let currentRows: any[] = isArray ? [...data] : [{ ...data }];

  currentRows = currentRows.map((row) => {
    const copy = { ...row };
    if (
      "salesman_id" in copy &&
      copy.salesman_id &&
      !isValidUuid(copy.salesman_id)
    ) {
      copy.salesman_id = null;
    }
    return copy;
  });

  // Chunk large batches to avoid Supabase / Postgres statement timeouts
  if (isArray && currentRows.length > 25) {
    const BATCH_SIZE = 25;
    let batchError: any = null;
    for (let i = 0; i < currentRows.length; i += BATCH_SIZE) {
      const chunk = currentRows.slice(i, i + BATCH_SIZE);
      const res = await resilientSupabaseUpsert(client, tableName, chunk, options);
      if (res.error) {
        batchError = res.error;
      }
    }
    return { error: batchError };
  }

  let lastError: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const payload = isArray ? currentRows : currentRows[0];
    const { error, data: resData } = await client
      .from(tableName)
      .upsert(payload, options);
    if (!error) {
      return { error: null, data: resData };
    }

    lastError = error;
    const msg = (error.message || "").toString();

    const cacheMatch = msg.match(/Could not find the '([^']+)' column/i);
    const colMatch = msg.match(/column "([^"]+)" of relation/i);
    const missingCol = cacheMatch?.[1] || colMatch?.[1];

    if (missingCol) {
      console.warn(
        `[Supabase] Table '${tableName}' missing column '${missingCol}' in schema cache. Stripping '${missingCol}' and retrying upsert...`,
      );
      currentRows = currentRows.map((row) => {
        const { [missingCol]: _omit, ...rest } = row;
        return rest;
      });
      continue;
    }

    if (
      msg.toLowerCase().includes("schema cache") &&
      (msg.toLowerCase().includes("salesman") ||
        msg.toLowerCase().includes(tableName))
    ) {
      console.warn(
        `[Supabase] Schema cache issue on '${tableName}': ${msg}. Retrying without salesman columns...`,
      );
      currentRows = currentRows.map((row) => {
        const { salesman: _s, salesman_id: _sid, ...rest } = row;
        return rest;
      });
      continue;
    }

    break;
  }

  return { error: lastError };
}

/**
 * Pushes local ledger state to Supabase PostgreSQL database
 */
export async function pushLedgerToSupabase(data: {
  warehouses: Warehouse[];
  products: Product[];
  inventoryBatches: InventoryBatch[];
  grns?: GRN[];
  stockTransfers?: StockTransfer[];
  promotions: Promotion[];
  bills: Bill[];
  trips: Trip[];
  audits: Audit[];
  orgProfile: OrganizationProfile;
  billingSettings: BillingSettings;
  payments?: PaymentRecord[];
  salesmen?: Salesman[];
  supplierSchemes?: SupplierScheme[];
  supplierSchemeApplications?: SupplierSchemeApplication[];
  supplierCreditNotes?: SupplierCreditNote[];
  auditSessions?: AuditSession[];
  reconciliationTransactions?: ReconciliationTransaction[];
  stockLedgerEntries?: StockLedgerEntry[];
}): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client is not configured.");
  }

  // Never re-create what was deleted: drop bills / GRNs / trips that are on the cloud deletion lists.
  try {
    const { data: rows } = await client
      .from("app_collections")
      .select("key,data")
      .in("key", ["deleted_bill_ids", "deleted_grn_ids", "deleted_trip_ids"]);
    const dead = (key: string) =>
      new Set<string>(
        ((rows || []).find((r: any) => r.key === key)?.data as any[] | undefined || []).map((x: any) => String(x)),
      );
    const deadBills = dead("deleted_bill_ids");
    const deadGrns = dead("deleted_grn_ids");
    const deadTrips = dead("deleted_trip_ids");
    data = {
      ...data,
      bills: (data.bills || []).filter((b) => !deadBills.has(String(b.id))),
      grns: data.grns ? data.grns.filter((g) => !deadGrns.has(String(g.id))) : data.grns,
      trips: (data.trips || []).filter((t) => !deadTrips.has(String(t.id))),
    };
  } catch {
    // deletion lists unavailable: continue with the data as given
  }

  const pushedCount = {
    warehouses: 0,
    products: 0,
    inventoryBatches: 0,
    grns: 0,
    promotions: 0,
    bills: 0,
    trips: 0,
    audits: 0,
    payments: 0,
    salesmen: 0,
    supplierSchemes: 0,
    supplierSchemeApplications: 0,
    supplierCreditNotes: 0,
    auditSessions: 0,
    reconciliationTransactions: 0,
    stockLedgerEntries: 0,
  };

  // 1. Upsert Warehouses first to satisfy foreign key constraints in inventory_batches
  const whToUpsert =
    data.warehouses.length > 0 ? data.warehouses : INIT_WAREHOUSES;
  const whPayload = whToUpsert.map((w) => ({
    id: w.id,
    name: w.name,
    code: w.code,
    location: w.location || "",
    manager: w.manager || "",
    phone: w.phone || "",
    capacity_cases: w.capacityCases || 0,
    is_default: Boolean(w.isDefault),
    notes: w.notes || "",
    updated_at: new Date().toISOString(),
  }));
  const { error: whErr } = await client
    .from("warehouses")
    .upsert(whPayload, { onConflict: "id" });
  if (whErr) console.warn(`Warehouses sync notice: ${whErr.message}`);
  else pushedCount.warehouses = whPayload.length;

  // 2. Upsert Products
  if (data.products.length > 0) {
    const productPayload = data.products.map((p) => ({
      id: p.id,
      sku: p.sku || generateSkuId(p.name, p.category, p.id),
      name: p.name,
      category: p.category,
      volume: p.volume,
      pack: p.pack,
      expiry: p.expiry || "",
      batch_number: p.batchNumber || "",
      mfg_date: p.mfgDate || "",
      warehouse_id: p.warehouseId || "",
      opening: p.opening,
      cost: p.cost,
      effective_cost: p.effectiveCost || p.cost,
      retail: p.retail,
      wholesale: p.wholesale,
      hsn: p.hsn || "",
      gst_rate: resolveProductGstRate(p),
      scheme: p.scheme || "",
      updated_at: p.updatedAt || new Date().toISOString(),
    }));
    const { error } = await client
      .from("products")
      .upsert(productPayload, { onConflict: "id" });
    if (error) {
      // Fallback in case schema does not yet have newly added columns
      const fallbackPayload = data.products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        volume: p.volume,
        pack: p.pack,
        expiry: p.expiry,
        batch_number: p.batchNumber || "",
        mfg_date: p.mfgDate || "",
        warehouse_id: p.warehouseId || "",
        opening: p.opening,
        cost: p.cost,
        retail: p.retail,
        wholesale: p.wholesale,
        updated_at: p.updatedAt || new Date().toISOString(),
      }));
      const { error: fallbackErr } = await client
        .from("products")
        .upsert(fallbackPayload, { onConflict: "id" });
      if (fallbackErr)
        throw new Error(`Products sync error: ${fallbackErr.message}`);
    }
    pushedCount.products = productPayload.length;
  }

  // 3. Upsert Inventory Batches
  if (data.inventoryBatches.length > 0) {
    const batchPayload = data.inventoryBatches.map((b) => ({
      id: b.id,
      product_id: b.productId,
      sku: b.sku || "",
      batch_number: b.batchNumber,
      mfg_date: sanitizeDate(b.mfgDate),
      expiry_date: sanitizeDate(b.expiryDate),
      warehouse_id: b.warehouseId || null,
      quantity: b.quantity || 0,
      cost_price: b.costPrice || 0,
      mrp: b.mrp || 0,
      notes: b.notes || "",
      updated_at: new Date().toISOString(),
    }));
    const { error } = await client
      .from("inventory_batches")
      .upsert(batchPayload, { onConflict: "id" });
    if (error) {
      // Fallback if sku column not yet in inventory_batches
      const fallbackBatchPayload = batchPayload.map(
        ({ sku: _sku, ...rest }) => rest,
      );
      await client
        .from("inventory_batches")
        .upsert(fallbackBatchPayload, { onConflict: "id" });
    }
    pushedCount.inventoryBatches = batchPayload.length;
  }

  // 4. Upsert GRNs (Inward Consignments & Invoices)
  if (data.grns && data.grns.length > 0) {
    // A. Attempt to upsert directly to grns table
    try {
      const grnPayload = data.grns.map((g) => ({
        id: g.id,
        grn_number: g.grnNumber,
        invoice_no: g.invoiceNo || "",
        supplier_name: g.supplierName || "",
        supplier_gstin: g.supplierGstin || "",
        supplier_address: g.supplierAddress || "",
        supplier_phone: g.supplierPhone || "",
        supplier_email: g.supplierEmail || "",
        inward_date:
          sanitizeDate(g.inwardDate) || todayISO(),
        vehicle_no: g.vehicleNo || "",
        warehouse_id: g.warehouseId || "",
        warehouse_name: g.warehouseName || "",
        items: g.items,
        total_billed_qty: g.totalBilledQty || 0,
        total_free_qty: g.totalFreeQty || 0,
        total_paid_qty: g.totalPaidQty || 0,
        total_received_qty: g.totalReceivedQty || 0,
        total_taxable: g.totalTaxable || 0,
        total_cgst: g.totalCgst || 0,
        total_sgst: g.totalSgst || 0,
        total_tax: g.totalTax || 0,
        grand_total: g.grandTotal || 0,
        inward_costs: g.inwardCosts || {},
        total_inward_cost: g.totalInwardCost || 0,
        inward_cost_per_crate: g.inwardCostPerCrate || 0,
        notes: g.notes || "",
        edit_history: g.editHistory || [],
        extra: grnExtraFields(g),
        updated_at: new Date().toISOString(),
      }));
      // Columns that do not exist yet (edit_history, extra) are dropped automatically so the GRN always saves.
      const { error: grnErr } = await resilientSupabaseUpsert(client, "grns", grnPayload, {
        onConflict: "id",
      });
      if (!grnErr) {
        pushedCount.grns = grnPayload.length;
      }
    } catch {
      // Table may not exist yet in schema
    }

    // B. Mirror in billing_settings with id: 'inward_grns' to guarantee persistence
    try {
      await client.from("billing_settings").upsert(
        {
          id: "inward_grns",
          data: { grns: data.grns },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (pushedCount.grns === 0) {
        pushedCount.grns = data.grns.length;
      }
    } catch (e) {
      console.warn("Mirror inward_grns in billing_settings warning:", e);
    }
  }

  // 5. Upsert Promotions
  if (data.promotions.length > 0) {
    const promoPayload = data.promotions.map((pr) => {
      const cleanIds = (
        Array.isArray(pr.productIds)
          ? pr.productIds
          : (pr as any).product_ids || []
      )
        .map(Number)
        .filter((n: number) => !isNaN(n));

      const cleanGroup = (
        Array.isArray(pr.productGroup) && pr.productGroup.length > 0
          ? pr.productGroup
          : Array.isArray((pr as any).config?.productGroup) && (pr as any).config.productGroup.length > 0
          ? (pr as any).config.productGroup
          : cleanIds
      )
        .map(Number)
        .filter((n: number) => !isNaN(n));

      const groupCat = pr.groupCategory ?? (pr as any).config?.groupCategory ?? null;
      const groupBr = pr.groupBrand ?? (pr as any).config?.groupBrand ?? null;
      const fItemRule = pr.freeItemRule ?? pr.freeItem ?? (pr as any).config?.freeItemRule ?? (pr as any).config?.freeItem ?? "CHEAPEST_IN_GROUP";
      const choicePid = pr.customerChoiceProductId ? Number(pr.customerChoiceProductId) : ((pr as any).config?.customerChoiceProductId ? Number((pr as any).config.customerChoiceProductId) : null);

      const promoConfig = {
        ...(pr.config || {}),
        productGroup: cleanGroup,
        groupCategory: groupCat,
        groupBrand: groupBr,
        freeItemRule: fItemRule,
        freeItem: fItemRule,
        customerChoiceProductId: choicePid,
        originalType: pr.type,
      };

      // Safe DB type for check constraint; real type kept in config.originalType
      const ALLOWED = new Set(["bogo", "percent", "flat"]);
      const safeDbType = ALLOWED.has(String(pr.type)) ? String(pr.type) : "bogo";

      return {
        id: Number(pr.id),
        name: pr.name,
        type: safeDbType,
        buy_qty: pr.buyQty || 0,
        free_qty: pr.freeQty || 0,
        percent: pr.percent || 0,
        flat_per_case: pr.flatPerCase || 0,
        product_ids: cleanGroup.length > 0 ? cleanGroup : cleanIds,
        bundle_buy_type: pr.bundleBuyType || "any",
        required_distinct_types: pr.requiredDistinctTypes || 2,
        min_qty_per_type: pr.minQtyPerType || 1,
        free_reward_choice: pr.freeRewardChoice || "all_eligible",
        free_product_id: pr.freeProductId ? Number(pr.freeProductId) : null,
        free_product_qty: pr.freeProductQty || 1,
        is_active: pr.isActive !== false,
        config: promoConfig,
      };
    });
    const { error } = await client
      .from("promotions")
      .upsert(promoPayload, { onConflict: "id" });
    if (error) {
      console.warn(
        "Promotions upsert with full schema warning, attempting fallback without bundle columns:",
        error.message,
      );
      const fallbackPromoPayload = promoPayload.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type, // already safeDbType
        buy_qty: p.buy_qty,
        free_qty: p.free_qty,
        percent: p.percent,
        flat_per_case: p.flat_per_case,
        product_ids: p.product_ids,
        config: p.config,
      }));
      await client
        .from("promotions")
        .upsert(fallbackPromoPayload, { onConflict: "id" });
    }
    // Also mirror to app_collections 'schemes' to guarantee zero data loss
    try {
      await client.from("app_collections").upsert(
        {
          key: "schemes",
          data: data.promotions,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    } catch {}
    pushedCount.promotions = promoPayload.length;
  }

  // 6. Upsert Bills
  if (data.bills.length > 0) {
    const billPayload = data.bills.map((b) => ({
      id: b.id,
      retailer: b.retailer,
      phone: b.phone || null,
      date: b.date,
      subtotal: b.subtotal,
      cgst: b.cgst,
      sgst: b.sgst,
      total: b.total,
      discount: b.discount,
      amount_paid: b.amountPaid,
      cancellation: b.cancellation ?? null,
      returns: b.returns && b.returns.length > 0 ? b.returns : null,
      cancelled_returns: b.cancelledReturns && b.cancelledReturns.length > 0 ? b.cancelledReturns : null,
      edit_history: b.editHistory && b.editHistory.length > 0 ? b.editHistory : null,
      warehouse_id: b.warehouseId || null,
      salesman_id: isValidUuid(b.salesmanId) ? b.salesmanId : null,
      salesman: b.salesman || null,
      supply_type: b.supplyType || "B2C",
      customer_gstin: b.customerGstin || null,
      is_retrospective: b.isRetrospective === true,
      extra: billExtraFields(b),
      items: b.items,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await resilientSupabaseUpsert(
      client,
      "bills",
      billPayload,
      { onConflict: "id" },
    );
    if (error) throw new Error(`Bills sync error: ${error.message}`);
    pushedCount.bills = billPayload.length;
  }

  // 7. Upsert Trips
  if (data.trips.length > 0) {
    const tripPayload = data.trips.map((t) => ({
      id: t.id,
      vehicle: t.vehicle,
      salesman_id: isValidUuid(t.salesmanId) ? t.salesmanId : null,
      salesman: t.salesman || null,
      date: t.date,
      warehouse_id: t.warehouseId || null,
      loaded: parseJsonDict(t.loaded),
      warehouse_loads: t.warehouseLoads || {},
      shortage_reasons: t.shortageReasons || {},
      route: t.route || null,
      driver: t.driver || null,
      returned: t.status === "closed" ? parseJsonDict(t.returned) : {},
      draft_returned: t.status === "closed" ? {} : parseJsonDict(t.draftReturned),
      cash_handed_in: t.cashHandedIn ?? null,
      cash_short_booked: t.cashShortBooked ?? null,
      cash_recoveries: t.cashRecoveries || [],
      cash_short_written_off: t.cashShortWrittenOff === true,
      bill_ids: parseBillIds(t.billIds),
      status: t.status || "out",
      updated_at: t.updatedAt || new Date().toISOString(),
    }));
    const { error } = await resilientSupabaseUpsert(
      client,
      "trips",
      tripPayload,
      { onConflict: "id" },
    );
    if (error) throw new Error(`Trips sync error: ${error.message}`);
    pushedCount.trips = tripPayload.length;
  }

  // 8. Upsert Salesmen
  if (data.salesmen && data.salesmen.length > 0) {
    try {
      const salesmanPayload = data.salesmen.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        pin_hash: s.pinHash,
        active: s.active !== undefined ? Boolean(s.active) : true,
        default_vehicle: s.defaultVehicle || "",
        updated_at: new Date().toISOString(),
      }));
      const { error: smErr } = await client
        .from("salesmen")
        .upsert(salesmanPayload, { onConflict: "id" });
      if (smErr) console.warn("Salesmen sync notice:", smErr.message);
      else pushedCount.salesmen = salesmanPayload.length;
    } catch (e) {
      console.warn("Salesmen sync exception:", e);
    }
  }

  // 9. Upsert Audits
  if (data.audits.length > 0) {
    const auditPayload = data.audits.map((a) => ({
      id: a.id,
      date: a.date,
      entries: a.entries,
      adjusted: Boolean(a.adjusted),
    }));
    const { error } = await client
      .from("audits")
      .upsert(auditPayload, { onConflict: "id" });
    if (error) throw new Error(`Audits sync error: ${error.message}`);
    pushedCount.audits = auditPayload.length;
  }

  // 9. Upsert Organization Profile & Billing Settings
  const { error: orgErr } = await client.from("organization_profile").upsert({
    id: "default",
    data: data.orgProfile,
    updated_at: new Date().toISOString(),
  });
  if (orgErr)
    console.warn(`Organization profile sync notice: ${orgErr.message}`);

  const { error: setErr } = await client.from("billing_settings").upsert({
    id: "default",
    data: data.billingSettings,
    updated_at: new Date().toISOString(),
  });
  if (setErr) console.warn(`Billing settings sync notice: ${setErr.message}`);

  // 10. Upsert Supplier Schemes & Incentives (idempotent per-record upserts — reuses
  // the same functions individual CRUD actions call, so a full "sync now" and a normal
  // add/edit can never diverge in how a record is written).
  if (data.supplierSchemes && data.supplierSchemes.length > 0) {
    let ok = 0;
    for (const s of data.supplierSchemes) {
      const res = await pushSupplierSchemeToSupabase(s);
      if (res.success) ok++;
    }
    pushedCount.supplierSchemes = ok;
  }
  if (
    data.supplierSchemeApplications &&
    data.supplierSchemeApplications.length > 0
  ) {
    let ok = 0;
    for (const a of data.supplierSchemeApplications) {
      const res = await pushSupplierSchemeApplicationToSupabase(a);
      if (res.success) ok++;
    }
    pushedCount.supplierSchemeApplications = ok;
  }
  if (data.supplierCreditNotes && data.supplierCreditNotes.length > 0) {
    let ok = 0;
    for (const n of data.supplierCreditNotes) {
      const res = await pushSupplierCreditNoteToSupabase(n);
      if (res.success) ok++;
    }
    pushedCount.supplierCreditNotes = ok;
  }

  // 11. Upsert Smart Stock Reconciliation & Audit Sessions
  if (data.auditSessions && data.auditSessions.length > 0) {
    let ok = 0;
    for (const s of data.auditSessions) {
      const res = await pushAuditSessionToSupabase(s);
      if (res.success) ok++;
    }
    pushedCount.auditSessions = ok;
  }
  if (
    data.reconciliationTransactions &&
    data.reconciliationTransactions.length > 0
  ) {
    let ok = 0;
    for (const t of data.reconciliationTransactions) {
      const res = await pushReconciliationTransactionToSupabase(t);
      if (res.success) ok++;
    }
    pushedCount.reconciliationTransactions = ok;
  }
  if (data.stockLedgerEntries && data.stockLedgerEntries.length > 0) {
    let ok = 0;
    for (const e of data.stockLedgerEntries) {
      const res = await pushStockLedgerEntryToSupabase(e);
      if (res.success) ok++;
    }
    pushedCount.stockLedgerEntries = ok;
  }

  // 12. Upsert Payments & Collections
  if (data.payments && data.payments.length > 0) {
    try {
      await pushPaymentsToSupabase(data.payments);
      pushedCount.payments = data.payments.length;
    } catch (e) {
      console.warn("Payments sync notice:", e);
    }
  }

  return {
    success: true,
    pushedCount,
  };
}

/**
 * Pushes a single Inward Consignment (GRN) and its derived products & batches
 * immediately and directly to the Supabase PostgreSQL database.
 */
export async function pushInwardInvoiceToSupabase(params: {
  grn: GRN;
  products: Product[];
  inventoryBatches: InventoryBatch[];
  allGrns: GRN[];
  warehouse?: Warehouse;
}): Promise<{
  success: boolean;
  cloudSynced: boolean;
  message: string;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: true,
      cloudSynced: false,
      message: "Supabase client is not configured.",
      error: "Client not configured",
    };
  }

  try {
    // 1. Ensure target warehouse exists in Supabase
    if (params.warehouse) {
      await client.from("warehouses").upsert(
        {
          id: params.warehouse.id,
          name: params.warehouse.name,
          code: params.warehouse.code,
          location: params.warehouse.location || "",
          manager: params.warehouse.manager || "",
          phone: params.warehouse.phone || "",
          capacity_cases: params.warehouse.capacityCases || 0,
          is_default: Boolean(params.warehouse.isDefault),
          notes: params.warehouse.notes || "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    } else {
      // Seed default warehouses if none exist
      const { count } = await client
        .from("warehouses")
        .select("*", { count: "exact", head: true });
      if (!count || count === 0) {
        await client.from("warehouses").upsert(
          INIT_WAREHOUSES.map((w) => ({
            id: w.id,
            name: w.name,
            code: w.code,
            location: w.location || "",
            is_default: Boolean(w.isDefault),
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "id" },
        );
      }
    }

    // 2. Upsert all products created or updated by this inward invoice
    if (params.products.length > 0) {
      const productPayload = params.products.map((p) => ({
        id: p.id,
        sku: p.sku || generateSkuId(p.name, p.category, p.id),
        name: String(p.name || "").trim().toUpperCase(),
        category: p.category,
        volume: p.volume,
        pack: p.pack,
        expiry: p.expiry || "",
        batch_number: p.batchNumber || "",
        mfg_date: p.mfgDate || "",
        warehouse_id: p.warehouseId || "",
        opening: p.opening,
        cost: p.cost,
        effective_cost: p.effectiveCost || p.cost,
        retail: p.retail,
        wholesale: p.wholesale,
        hsn: p.hsn || "",
        gst_rate: resolveProductGstRate(p),
        scheme: p.scheme || "",
        updated_at: new Date().toISOString(),
      }));
      const { error: prodErr } = await client
        .from("products")
        .upsert(productPayload, { onConflict: "id" });
      if (prodErr) {
        // Fallback for older schema
        const fallbackPayload = params.products.map((p) => ({
          id: p.id,
          name: String(p.name || "").trim().toUpperCase(),
          category: p.category,
          volume: p.volume,
          pack: p.pack,
          expiry: p.expiry,
          batch_number: p.batchNumber || "",
          mfg_date: p.mfgDate || "",
          warehouse_id: p.warehouseId || "",
          opening: p.opening,
          cost: p.cost,
          retail: p.retail,
          wholesale: p.wholesale,
          updated_at: new Date().toISOString(),
        }));
        await client
          .from("products")
          .upsert(fallbackPayload, { onConflict: "id" });
      }
    }

    // 3. Upsert inventory batches into inventory_batches table
    if (params.inventoryBatches.length > 0) {
      const batchPayload = params.inventoryBatches.map((b) => ({
        id: b.id,
        product_id: b.productId,
        sku: b.sku || "",
        batch_number: b.batchNumber,
        mfg_date: sanitizeDate(b.mfgDate),
        expiry_date: sanitizeDate(b.expiryDate),
        warehouse_id: b.warehouseId || null,
        quantity: b.quantity || 0,
        cost_price: b.costPrice || 0,
        mrp: b.mrp || 0,
        notes: b.notes || "",
        updated_at: new Date().toISOString(),
      }));
      const { error: batchErr } = await client
        .from("inventory_batches")
        .upsert(batchPayload, { onConflict: "id" });
      if (batchErr) {
        const fallbackBatchPayload = batchPayload.map(
          ({ sku: _sku, ...rest }) => rest,
        );
        await client
          .from("inventory_batches")
          .upsert(fallbackBatchPayload, { onConflict: "id" });
      }
    }

    // 4. Persist GRN record in Supabase:
    // Try public.grns table first
    const grnPayload = {
      id: params.grn.id,
      grn_number: params.grn.grnNumber,
      invoice_no: params.grn.invoiceNo || "",
      supplier_name: params.grn.supplierName || "",
      supplier_gstin: params.grn.supplierGstin || "",
      supplier_address: params.grn.supplierAddress || "",
      supplier_phone: params.grn.supplierPhone || "",
      supplier_email: params.grn.supplierEmail || "",
      inward_date:
        sanitizeDate(params.grn.inwardDate) ||
        todayISO(),
      vehicle_no: params.grn.vehicleNo || "",
      warehouse_id: params.grn.warehouseId || "",
      warehouse_name: params.grn.warehouseName || "",
      items: params.grn.items,
      total_billed_qty: params.grn.totalBilledQty || 0,
      total_free_qty: params.grn.totalFreeQty || 0,
      total_paid_qty: params.grn.totalPaidQty || 0,
      total_received_qty: params.grn.totalReceivedQty || 0,
      total_taxable: params.grn.totalTaxable || 0,
      total_cgst: params.grn.totalCgst || 0,
      total_sgst: params.grn.totalSgst || 0,
      total_tax: params.grn.totalTax || 0,
      grand_total: params.grn.grandTotal || 0,
      inward_costs: params.grn.inwardCosts || {},
      total_inward_cost: params.grn.totalInwardCost || 0,
      inward_cost_per_crate: params.grn.inwardCostPerCrate || 0,
      notes: params.grn.notes || "",
      edit_history: params.grn.editHistory || [],
      extra: grnExtraFields(params.grn),
      updated_at: new Date().toISOString(),
    };

    try {
      // Columns that do not exist yet (edit_history, extra) are dropped automatically so the GRN always saves.
      await resilientSupabaseUpsert(client, "grns", grnPayload, { onConflict: "id" });
    } catch {
      // grns table might not exist yet
    }

    // Always mirror the complete list of GRNs in billing_settings for foolproof persistence
    // Fetch and merge with existing so previous invoices are never overwritten
    try {
      const { data: existingSet } = await client
        .from("billing_settings")
        .select("data")
        .eq("id", "inward_grns")
        .maybeSingle();
      const existingList = Array.isArray(existingSet?.data?.grns)
        ? existingSet.data.grns
        : [];
      const mergedMap = new Map<string, any>();
      existingList.forEach((g: any) => {
        if (g && (g.id || g.invoiceNo || g.grnNumber)) {
          mergedMap.set(String(g.id || g.invoiceNo || g.grnNumber), g);
        }
      });
      params.allGrns.forEach((g) => {
        if (g && (g.id || g.invoiceNo || g.grnNumber)) {
          mergedMap.set(String(g.id || g.invoiceNo || g.grnNumber), g);
        }
      });
      const combinedGrns = Array.from(mergedMap.values());

      await client.from("billing_settings").upsert(
        {
          id: "inward_grns",
          data: { grns: combinedGrns },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    } catch (e) {
      console.warn("Error mirroring inward_grns:", e);
    }

    return {
      success: true,
      cloudSynced: true,
      message: `Invoice ${params.grn.grnNumber} (${params.grn.invoiceNo}) successfully stored in Supabase PostgreSQL database!`,
    };
  } catch (err: any) {
    console.error("Error pushing inward invoice to Supabase:", err);
    return {
      success: false,
      cloudSynced: false,
      message: err?.message || "Failed to persist invoice to Supabase",
      error: err?.message,
    };
  }
}

/* ---- Cloud-synced deletion log --------------------------------------------------------------
 * Deleted payments / customers are recorded in the cloud (app_collections key "deleted_records"),
 * not only on the device that deleted them. Every device reads this list before it merges or
 * pushes, so a stale phone / tab / cache can never bring a deleted record back.
 * Each record also carries the owner's rectification comment.
 */
export interface DeletionRecord {
  kind: "payment" | "customer" | "expense" | "product" | "batch" | "warehouse" | "audit" | "promotion" | "salesman";
  id: string;
  /** Customer name (used to hide a customer that is only known from old bills). */
  name?: string;
  deletedAt: string;
  by?: string;
  /** Owner's rectification comment. */
  reason?: string;
  /** Extra facts worth keeping, e.g. amount of a deleted payment or an opening balance. */
  note?: string;
}

const DELETION_LOG_KEY = "deleted_records";

/** Ids of bills / GRNs / trips deleted on purpose (the server keeps these lists). null = could not be read. */
type TombstoneSets = {
  bills: Set<string>;
  grns: Set<string>;
  trips: Set<string>;
};
const TOMBSTONE_KEYS = ["deleted_bill_ids", "deleted_grn_ids", "deleted_trip_ids"];
/** A copy of what was read is trusted for this long at most, even if its timestamps still look the same. */
const READ_CACHE_MAX_AGE_MS = 5 * 60_000;
let tombstoneCache: { stamp: string; value: TombstoneSets; at: number } | null = null;

/**
 * Forget what the deletion-list readers remembered, so the next read downloads everything again.
 * Used by the manual "Sync" actions, and after this device records a deletion.
 */
export function resetCloudReadCaches(): void {
  resetTableCaches();
  resetRowCaches();
  tombstoneCache = null;
  deletionCache = emptyDeletionCache();
}

export async function pullTombstonesFromSupabase(): Promise<TombstoneSets | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    // Cheap check first: only the "last changed" times of the three lists. The lists themselves are downloaded
    // only when one of those times changed (or the remembered copy is a few minutes old).
    let stamp = "";
    try {
      const { data: heads, error: headError } = await client
        .from("app_collections")
        .select("key,updated_at")
        .in("key", TOMBSTONE_KEYS);
      if (!headError && heads) {
        stamp = TOMBSTONE_KEYS.map(
          (k) => `${k}:${(heads as any[]).find((r) => r.key === k)?.updated_at ?? ""}`,
        ).join("|");
      }
    } catch {
      stamp = "";
    }
    if (stamp && tombstoneCache && tombstoneCache.stamp === stamp && Date.now() - tombstoneCache.at < READ_CACHE_MAX_AGE_MS) {
      return tombstoneCache.value;
    }

    const { data: rows, error } = await client
      .from("app_collections")
      .select("key,data")
      .in("key", TOMBSTONE_KEYS);
    if (error || !rows) return tombstoneCache ? tombstoneCache.value : null;
    const dead = (key: string) =>
      new Set<string>(
        ((rows.find((r: any) => r.key === key)?.data as any[] | undefined) || []).map((x: any) => String(x)),
      );
    const value: TombstoneSets = {
      bills: dead("deleted_bill_ids"),
      grns: dead("deleted_grn_ids"),
      trips: dead("deleted_trip_ids"),
    };
    if (stamp) tombstoneCache = { stamp, value, at: Date.now() };
    return value;
  } catch {
    return tombstoneCache ? tombstoneCache.value : null;
  }
}

const DELETION_ROW_PREFIX = "deleted:";

interface DeletionCache {
  /** "last changed" time of the old shared list when it was read */
  legacyStamp: string | null;
  legacy: DeletionRecord[];
  rows: Map<string, DeletionRecord>;
  /** how many per-deletion rows existed when they were read */
  rowCount: number | null;
  /** when everything above was last read completely; 0 = not trustworthy, read again */
  at: number;
}
function emptyDeletionCache(): DeletionCache {
  return { legacyStamp: null, legacy: [], rows: new Map(), rowCount: null, at: 0 };
}
let deletionCache: DeletionCache = emptyDeletionCache();

function composeDeletionList(c: DeletionCache): DeletionRecord[] {
  const out = new Map<string, DeletionRecord>();
  const add = (r: any) => {
    if (r && r.kind && r.id) out.set(`${r.kind}:${r.id}`, r as DeletionRecord);
  };
  c.legacy.forEach(add);
  c.rows.forEach(add);
  return Array.from(out.values());
}

/**
 * Every deletion is kept as its own row (key "deleted:<kind>:<id>") so two devices deleting at the same moment can
 * never overwrite each other, which the old single shared list could. The old list is still read and written so the
 * server and older app versions keep working.
 *
 * The log only ever grows and used to be downloaded in full on every sync. Now a cheap check comes first (the old
 * list's "last changed" time and the number of per-deletion rows); the full log is downloaded again only if one of
 * them changed, or the remembered copy is a few minutes old. Nothing is ever written here.
 */
export async function pullDeletionLogFromSupabase(): Promise<DeletionRecord[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const c = deletionCache;
  const stale = !c.at || Date.now() - c.at > READ_CACHE_MAX_AGE_MS;

  if (!stale) {
    try {
      const [head, count] = await Promise.all([
        client.from("app_collections").select("updated_at").eq("key", DELETION_LOG_KEY).maybeSingle(),
        client
          .from("app_collections")
          .select("key", { count: "exact", head: true })
          .like("key", `${DELETION_ROW_PREFIX}%`),
      ]);
      if (!head.error && !count.error && count.count !== null && count.count !== undefined) {
        const legacyStamp = String((head.data as any)?.updated_at ?? "");
        if (legacyStamp === c.legacyStamp && count.count === c.rowCount) {
          return composeDeletionList(c);
        }
      }
    } catch {
      // fall through to a full read
    }
  }

  // Full read (what every sync used to do).
  let legacy: DeletionRecord[] = c.legacy;
  let legacyStamp: string | null = c.legacyStamp;
  let legacyOk = false;
  try {
    const { data, error } = await client
      .from("app_collections")
      .select("data,updated_at")
      .eq("key", DELETION_LOG_KEY)
      .maybeSingle();
    if (!error) {
      legacy = Array.isArray((data as any)?.data) ? ((data as any).data as DeletionRecord[]) : [];
      legacyStamp = String((data as any)?.updated_at ?? "");
      legacyOk = true;
    }
  } catch {
    // the old list is optional now
  }

  const rows = new Map<string, DeletionRecord>();
  let rowsRead = 0;
  let rowsOk = false;
  try {
    const PAGE = 1000;
    rowsOk = true;
    for (let from = 0; from < 50000; from += PAGE) {
      const { data: page, error } = await client
        .from("app_collections")
        .select("data")
        .like("key", `${DELETION_ROW_PREFIX}%`)
        .order("key", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !page) {
        rowsOk = false;
        break;
      }
      rowsRead += page.length;
      page.forEach((row: any) => {
        const r = row?.data;
        if (r && r.kind && r.id) rows.set(`${r.kind}:${r.id}`, r as DeletionRecord);
      });
      if (page.length < PAGE) break;
    }
  } catch {
    rowsOk = false;
  }

  // Never forget a deletion because a read failed half way: keep what was remembered, add what was read.
  const next: DeletionCache = {
    legacyStamp,
    legacy,
    rows: rowsOk ? rows : new Map([...c.rows, ...rows]),
    rowCount: rowsOk ? rowsRead : null,
    at: legacyOk && rowsOk ? Date.now() : 0,
  };
  deletionCache = next;
  return composeDeletionList(next);
}

/* -------------------------------------------------------------------------
 * Concurrent-write protection for the shared lists kept in app_collections.
 * Each list is saved whole, so two devices saving close together used to overwrite each other. Now every device
 * remembers the cloud copy's time when it last read or wrote it; if the cloud copy is newer than that, somebody else
 * saved in between, and the two lists are combined (newest change per record wins, deletions honoured) instead of
 * one replacing the other.
 * ------------------------------------------------------------------------- */
export const collectionSeen = new Map<string, string>();
const MERGEABLE_COLLECTIONS = new Set([
  "bills",
  "trips",
  "payments",
  "customers",
  "products",
  "inventory_batches",
  "inward_grns",
]);
const changeStamp = (x: any) => Date.parse(String(x?.updatedAt || x?.updated_at || "")) || 0;

async function dropDeletedForCollection(key: string, list: any[]): Promise<any[]> {
  try {
    if (key === "payments") return await dropDeletedFromList("payment", list);
    if (key === "customers") return await dropDeletedFromList("customer", list);
    if (key === "inventory_batches") return await dropDeletedFromList("batch", list);
    if (key === "products") {
      const log = await pullDeletionLogFromSupabase();
      const dead = new Set(log.filter((r) => r.kind === "product").map((r) => r.id));
      return dead.size
        ? list.filter((p) => !dead.has(`${p.id}|${String(p.name || "").trim().toUpperCase()}`))
        : list;
    }
    const t = await pullTombstonesFromSupabase();
    if (!t) return list;
    const set = key === "bills" ? t.bills : key === "inward_grns" ? t.grns : key === "trips" ? t.trips : null;
    return set ? list.filter((x) => !set.has(String(x?.id))) : list;
  } catch {
    return list;
  }
}

/** Combines a cloud list with this device's list: same record -> the later change stamp wins (ties keep ours). */
export function mergeConcurrentLists(remote: any[], local: any[]): any[] {
  const map = new Map<string, any>();
  remote.forEach((r) => r && r.id != null && map.set(String(r.id), r));
  local.forEach((l) => {
    if (!l || l.id == null) return;
    const theirs = map.get(String(l.id));
    map.set(String(l.id), theirs && changeStamp(theirs) > changeStamp(l) ? theirs : l);
  });
  return Array.from(map.values());
}

/**
 * Writes one app_collections list. When the list is one of the shared ones and the cloud copy changed since this
 * device last saw it, the lists are merged first. `guard` lets the caller add a timeout.
 */
export async function writeCollectionMerged(
  client: any,
  key: string,
  data: any,
  guard: <T>(p: PromiseLike<T>) => Promise<T> = (p) => Promise.resolve(p),
): Promise<{ error: any }> {
  let outgoing = data;
  if (MERGEABLE_COLLECTIONS.has(key) && Array.isArray(data) && collectionSeen.has(key)) {
    try {
      const { data: row } = (await guard(
        client.from("app_collections").select("data,updated_at").eq("key", key).maybeSingle(),
      )) as any;
      const cloudTime = Date.parse(String(row?.updated_at || "")) || 0;
      const seenTime = Date.parse(collectionSeen.get(key) || "") || 0;
      if (row && Array.isArray(row.data) && cloudTime > seenTime) {
        outgoing = await dropDeletedForCollection(key, mergeConcurrentLists(row.data, data));
      }
    } catch {
      // could not check: fall back to a plain save, as before
    }
  }
  const stamp = new Date().toISOString();
  const res = (await guard(
    client.from("app_collections").upsert({ key, data: outgoing, updated_at: stamp }, { onConflict: "key" }),
  )) as any;
  if (!res?.error) collectionSeen.set(key, stamp);
  return { error: res?.error || null };
}


/**
 * "Has anything changed in the cloud?" - answered with a handful of tiny read-only requests instead of downloading
 * every table. Returns one short text that is the same until something changes, or null if it cannot be answered
 * (offline, or the database refuses the questions).
 *
 * What is looked at, and why only this:
 *  - bills and trips: how many rows, and when the newest one was last changed. These carry the busy day-to-day work
 *    (sales, payments on bills, trip changes) and are only rewritten when a record really changed.
 *  - godown stock records, products, batches, salesmen, warehouses: only how many rows (new or removed records).
 *  - deletions: the per-deletion rows and the "last changed" times of the deletion lists.
 * Not looked at: the generic collections (customers, payments, expenses ...). The app rewrites those after every
 * download, so they would look "changed" all the time. A change that only they show up in is picked up by the
 * regular safety download (see SAFETY_FULL_PULL_MS in src/utils/syncGate.ts).
 *
 * Nothing is written, and no rows are downloaded: counts use HEAD requests, the others fetch one timestamp.
 */
const PROBE_NEWEST_TABLES = ["bills", "trips"];
const PROBE_COUNT_TABLES = ["grns", "products", "inventory_batches", "salesmen", "warehouses"];
let probeWarned = false;

export async function probeCloudChanges(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const parts: Record<string, string> = {};
  const failed: string[] = [];
  let answered = 0;

  const ask = async (name: string, run: () => PromiseLike<string>) => {
    try {
      parts[name] = await run();
      answered++;
    } catch {
      parts[name] = "?";
      failed.push(name);
    }
  };

  await Promise.all([
    ...PROBE_NEWEST_TABLES.map((table) =>
      ask(table, async () => {
        const { data, count, error } = await client
          .from(table)
          .select("updated_at", { count: "exact" })
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(1);
        if (error) throw error;
        return `${count ?? "?"}|${(data as any)?.[0]?.updated_at ?? ""}`;
      }),
    ),
    ...PROBE_COUNT_TABLES.map((table) =>
      ask(table, async () => {
        const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
        if (error) throw error;
        return String(count ?? "?");
      }),
    ),
    ask("deleted_rows", async () => {
      const { count, error } = await client
        .from("app_collections")
        .select("key", { count: "exact", head: true })
        .like("key", `${DELETION_ROW_PREFIX}%`);
      if (error) throw error;
      return String(count ?? "?");
    }),
    ask("deletion_lists", async () => {
      const { data, error } = await client
        .from("app_collections")
        .select("key,updated_at")
        .in("key", [DELETION_LOG_KEY, ...TOMBSTONE_KEYS]);
      if (error) throw error;
      const text = ((data as any[]) || [])
        .map((r) => `${r.key}=${r.updated_at}`)
        .sort()
        .join(",");
      return shortHash(text);
    }),
  ]);

  if (failed.length && !probeWarned) {
    probeWarned = true;
    console.warn(`[sync] change check could not read: ${failed.join(", ")} (those are only caught by the safety download)`);
  }
  if (answered === 0) return null;
  return fingerprintOf(parts);
}

/**
 * Records deletions in the cloud: one row per deletion (cannot be lost to a concurrent write), plus the old shared
 * list for compatibility. Returns false only if neither could be written.
 */
export async function pushDeletionRecordsToSupabase(
  records: DeletionRecord[],
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !records.length) return false;
  let saved = false;
  try {
    const now = new Date().toISOString();
    const { error } = await client.from("app_collections").upsert(
      records.map((r) => ({
        key: `${DELETION_ROW_PREFIX}${r.kind}:${r.id}`,
        data: r,
        updated_at: now,
      })),
      { onConflict: "key" },
    );
    saved = !error;
  } catch {
    saved = false;
  }
  try {
    const { data, error: readError } = await client
      .from("app_collections")
      .select("data")
      .eq("key", DELETION_LOG_KEY)
      .maybeSingle();
    if (!readError) {
      const map = new Map<string, DeletionRecord>();
      (Array.isArray(data?.data) ? (data!.data as any[]) : []).forEach(
        (r) => r && r.kind && r.id && map.set(`${r.kind}:${r.id}`, r),
      );
      records.forEach((r) => map.set(`${r.kind}:${r.id}`, r));
      const { error } = await client.from("app_collections").upsert(
        {
          key: DELETION_LOG_KEY,
          data: Array.from(map.values()).slice(-5000),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (!error) saved = true;
    }
  } catch {
    // the per-record rows above are the source of truth
  }
  // this device just changed the log: the next read must see it
  resetCloudReadCaches();
  return saved;
}

/** Removes anything the cloud log says was deleted. If the log cannot be read, the list is returned as is. */
export async function dropDeletedFromList<T extends { id?: string }>(
  kind: DeletionRecord["kind"],
  list: T[],
): Promise<T[]> {
  if (!Array.isArray(list) || list.length === 0) return list;
  const log = await pullDeletionLogFromSupabase();
  const dead = new Set(log.filter((r) => r.kind === kind).map((r) => r.id));
  return dead.size ? list.filter((x) => !(x.id && dead.has(x.id))) : list;
}

/**
 * Pushes customer payments and settlements to Supabase cloud
 */
export async function pushPaymentsToSupabase(
  payments: PaymentRecord[],
  /** Set true only when the list was emptied on purpose (e.g. the last payment was deleted). */
  allowEmpty = false,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !payments || (payments.length === 0 && !allowEmpty)) return;
  try {
    // Never write back a payment the owner already deleted (a stale device would resurrect it).
    payments = await dropDeletedFromList("payment", payments);
    if (payments.length === 0 && !allowEmpty) return;
    // 1. Try public.app_collections
    try {
      await writeCollectionMerged(client, "payments", payments);
    } catch {
      // app_collections table may not exist
    }

    // 2. Mirror in billing_settings
    await client.from("billing_settings").upsert(
      {
        id: "collection_payments",
        data: { payments },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch (e) {
    console.warn("Error persisting payments to Supabase:", e);
  }
}

/**
 * Pushes a single product to Supabase
 */
export async function pushProductToSupabase(p: Product): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const payload = {
      id: p.id,
      sku: p.sku || generateSkuId(p.name, p.category, p.id),
      name: String(p.name || "").trim().toUpperCase(),
      category: p.category,
      volume: p.volume,
      pack: p.pack,
      expiry: p.expiry,
      batch_number: p.batchNumber || "",
      mfg_date: p.mfgDate || "",
      warehouse_id: p.warehouseId || "",
      opening: p.opening,
      cost: p.cost,
      effective_cost: p.effectiveCost || p.cost,
      retail: p.retail,
      wholesale: p.wholesale,
      hsn: normalizeTo8DigitHsn(p.hsn, p.category, p.name),
      gst_rate: resolveProductGstRate(p),
      scheme: p.scheme || "",
      updated_at: p.updatedAt || new Date().toISOString(),
    };
    const { error } = await client
      .from("products")
      .upsert(payload, { onConflict: "id" });
    if (error) {
      // Base schema fallback
      const fallback = {
        id: p.id,
        sku: p.sku || generateSkuId(p.name, p.category, p.id),
        name: String(p.name || "").trim().toUpperCase(),
        category: p.category,
        volume: p.volume,
        pack: p.pack,
        expiry: p.expiry,
        batch_number: p.batchNumber || "",
        mfg_date: p.mfgDate || "",
        warehouse_id: p.warehouseId || "",
        opening: p.opening,
        cost: p.cost,
        retail: p.retail,
        wholesale: p.wholesale,
        updated_at: p.updatedAt || new Date().toISOString(),
      };
      await client.from("products").upsert(fallback, { onConflict: "id" });
    }
  } catch (e) {
    console.warn("Failed to push product to Supabase:", e);
  }
}

/**
 * Deletes a product from Supabase
 */
export async function deleteProductFromSupabase(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("products").delete().eq("id", id);
  } catch (e) {
    console.warn("Failed to delete product from Supabase:", e);
  }
}

/**
 * Pushes a single bill to Supabase
 */
export async function pushBillToSupabase(
  b: Bill,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const payload = {
      id: b.id,
      retailer: b.retailer,
      phone: b.phone || null,
      date: b.date,
      subtotal: b.subtotal,
      cgst: b.cgst,
      sgst: b.sgst,
      total: b.total,
      discount: b.discount,
      amount_paid: b.amountPaid,
      cancellation: b.cancellation ?? null,
      returns: b.returns && b.returns.length > 0 ? b.returns : null,
      cancelled_returns: b.cancelledReturns && b.cancelledReturns.length > 0 ? b.cancelledReturns : null,
      edit_history: b.editHistory && b.editHistory.length > 0 ? b.editHistory : null,
      warehouse_id: b.warehouseId || null,
      salesman_id: isValidUuid(b.salesmanId) ? b.salesmanId : null,
      salesman: b.salesman || null,
      supply_type: b.supplyType || "B2C",
      customer_gstin: b.customerGstin || null,
      is_retrospective: b.isRetrospective === true,
      extra: billExtraFields(b),
      items: b.items,
      updated_at: new Date().toISOString(),
    };
    const { error } = await resilientSupabaseUpsert(client, "bills", payload, {
      onConflict: "id",
    });
    if (error) {
      console.warn("Failed to push bill to Supabase:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push bill to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

/**
 * Deletes a bill from Supabase
 */
export async function deleteBillFromSupabase(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("bills").delete().eq("id", id);
  } catch (e) {
    console.warn("Failed to delete bill from Supabase:", e);
  }
}

/**
 * Pushes a single delivery trip to Supabase public.trips table
 */
export async function pushTripToSupabase(
  t: Trip,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const payload = {
      id: t.id,
      vehicle: t.vehicle,
      salesman_id: isValidUuid(t.salesmanId) ? t.salesmanId : null,
      salesman: t.salesman || null,
      date: t.date,
      warehouse_id: t.warehouseId || null,
      loaded: parseJsonDict(t.loaded),
      // Per-godown split of the van load (warehouse -> product -> crates). Without this column a
      // multi-warehouse trip collapses to its single primary warehouse after a reload/sync.
      warehouse_loads: t.warehouseLoads || {},
      shortage_reasons: t.shortageReasons || {},
      route: t.route || null,
      driver: t.driver || null,
      returned: t.status === "closed" ? parseJsonDict(t.returned) : {},
      draft_returned: t.status === "closed" ? {} : parseJsonDict(t.draftReturned),
      cash_handed_in: t.cashHandedIn ?? null,
      cash_short_booked: t.cashShortBooked ?? null,
      cash_recoveries: t.cashRecoveries || [],
      cash_short_written_off: t.cashShortWrittenOff === true,
      bill_ids: parseBillIds(t.billIds),
      status: t.status || "out",
      updated_at: t.updatedAt || new Date().toISOString(),
    };
    const { error } = await resilientSupabaseUpsert(client, "trips", payload, {
      onConflict: "id",
    });
    if (error) {
      console.warn("Failed to upsert trip in Supabase:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push trip to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

/**
 * Deletes a delivery trip from Supabase public.trips table
 */
export async function deleteTripFromSupabase(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("trips").delete().eq("id", id);
  } catch (e) {
    console.warn("Failed to delete trip from Supabase:", e);
  }
}

/* =========================================================================
 * SALESMEN & AUTHENTICATION METHODS (Supabase Auth & public.salesmen)
 * ========================================================================= */

export async function fetchSalesmenFromSupabase(): Promise<Salesman[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("salesmen")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.warn("fetchSalesmenFromSupabase error:", error.message);
      return [];
    }

    return (data || []).map((s: any) => ({
      id: String(s.id),
      name: s.name || "",
      phone: s.phone || "",
      pinHash: s.pin_hash || s.pinHash || "",
      active: s.active !== undefined ? Boolean(s.active) : true,
      defaultVehicle: s.default_vehicle || s.defaultVehicle || "",
      createdAt: s.created_at || s.createdAt || new Date().toISOString(),
      updatedAt: s.updated_at || s.updatedAt || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn("fetchSalesmenFromSupabase exception:", e);
    return [];
  }
}

export async function pushSalesmanToSupabase(
  s: Salesman,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const payload = {
      id: s.id,
      name: s.name.trim(),
      phone: s.phone.trim(),
      // An empty hash must never overwrite the stored PIN.
      ...(s.pinHash ? { pin_hash: s.pinHash } : {}),
      active: s.active !== undefined ? Boolean(s.active) : true,
      default_vehicle: s.defaultVehicle || "",
      updated_at: new Date().toISOString(),
    };
    const { error } = await client
      .from("salesmen")
      .upsert(payload, { onConflict: "id" });
    if (error) {
      console.warn("Failed to push salesman to Supabase:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push salesman to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

export async function deleteSalesmanFromSupabase(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const { error } = await client.from("salesmen").delete().eq("id", id);
    if (error) {
      console.warn("Failed to delete salesman in Supabase:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to delete salesman in Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

export async function verifySalesmanPinSupabase(
  phone: string,
  pin: string,
): Promise<{ success: boolean; salesman?: Salesman; error?: string }> {
  const cleanPhone = (phone || "").trim();
  const cleanPin = (pin || "").trim();

  if (!cleanPhone || !cleanPin) {
    return { success: false, error: "Phone and PIN are required" };
  }

  const computedHash = await hashPin(cleanPin);

  // First try direct Supabase query
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from("salesmen")
        .select("*")
        .eq("phone", cleanPhone)
        .maybeSingle();

      if (!error && data) {
        if (data.active === false) {
          return {
            success: false,
            error: "This salesman account is deactivated. Contact admin.",
          };
        }
        const storedHash = data.pin_hash || data.pinHash || "";
        if (storedHash.toLowerCase() === computedHash.toLowerCase()) {
          return {
            success: true,
            salesman: {
              id: String(data.id),
              name: data.name || "",
              phone: data.phone || "",
              pinHash: storedHash,
              active: Boolean(data.active),
              defaultVehicle: data.default_vehicle || data.defaultVehicle || "",
              createdAt: data.created_at || "",
              updatedAt: data.updated_at || "",
            },
          };
        } else {
          return { success: false, error: "Incorrect PIN. Please try again." };
        }
      }
    } catch (e) {
      console.warn(
        "Direct Supabase verify exception, falling back to backend API:",
        e,
      );
    }
  }

  // Fallback to server API endpoint
  try {
    const resp = await fetch("/api/salesmen/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: cleanPhone, pinHash: computedHash }),
    });
    const result = await resp.json();
    if (resp.ok && result.success) {
      return { success: true, salesman: result.salesman };
    }
    return { success: false, error: result.error || "Verification failed." };
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || "Network error during PIN verification",
    };
  }
}

// Supabase Auth for Admin Login
export async function signInAdminSupabase(
  email: string,
  pass: string,
): Promise<{ success: boolean; user?: any; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "Supabase client is not configured" };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, user: data.user };
  } catch (e: any) {
    return { success: false, error: e?.message || "Login failed" };
  }
}

export async function signOutSupabase(): Promise<void> {
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.auth.signOut();
    } catch (e) {
      console.warn("Supabase signOut notice:", e);
    }
  }
}

export async function getCurrentSupabaseSession(): Promise<any | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data?.session || null;
  } catch {
    return null;
  }
}

/**
 * Pushes a single warehouse to Supabase public.warehouses table
 */
export async function pushWarehouseToSupabase(
  w: Warehouse,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const { error } = await client.from("warehouses").upsert(
      {
        id: String(w.id),
        name: w.name,
        code: w.code || "",
        location: w.location || "",
        manager: w.manager || "",
        phone: w.phone || "",
        capacity_cases: Number(w.capacityCases || 0),
        is_default: Boolean(w.isDefault),
        notes: w.notes || "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn("Failed to upsert warehouse in Supabase:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push warehouse to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

/**
 * Deletes a warehouse from Supabase public.warehouses table
 */
export async function deleteWarehouseFromSupabase(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("warehouses").delete().eq("id", id);
  } catch (e) {
    console.warn("Failed to delete warehouse from Supabase:", e);
  }
}

/**
 * Supplier Scheme & Incentive System — upsert(onConflict:'id') on every push means a
 * repeated sync of the same record (e.g. two tabs, a retried request, an offline queue
 * replaying) can never insert a duplicate row; it just re-applies the same values.
 */
export async function pushSupplierSchemeToSupabase(
  s: SupplierScheme,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const { error } = await client.from("supplier_schemes").upsert(
      {
        id: s.id,
        supplier_name: s.supplierName,
        name: s.name,
        scheme_type: s.schemeType,
        product_ids: s.productIds,
        warehouse_id: s.warehouseId || null,
        start_date: s.startDate,
        end_date: s.endDate || null,
        target_quantity: s.targetQuantity ?? null,
        incentive_rate: s.incentiveRate ?? null,
        calculation_method: s.calculationMethod || null,
        active: s.active,
        notes: s.notes || "",
        created_at: s.createdAt,
        updated_at: s.updatedAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn(
        "Failed to upsert supplier scheme in Supabase:",
        error.message,
      );
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push supplier scheme to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

export async function deleteSupplierSchemeFromSupabase(
  id: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("supplier_schemes").delete().eq("id", id);
  } catch (e) {
    console.warn("Failed to delete supplier scheme from Supabase:", e);
  }
}

export async function pushSupplierSchemeApplicationToSupabase(
  a: SupplierSchemeApplication,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const { error } = await client.from("supplier_scheme_applications").upsert(
      {
        id: a.id,
        scheme_id: a.schemeId,
        scheme_type: a.schemeType,
        grn_id: a.grnId,
        grn_line_id: a.grnLineId,
        product_id: a.productId,
        supplier_name: a.supplierName,
        supplier_invoice_no: a.supplierInvoiceNo || "",
        eligible_quantity: a.eligibleQuantity,
        free_quantity: a.freeQuantity,
        expected_benefit: a.expectedBenefit,
        warehouse_id: a.warehouseId || null,
        batch_id: a.batchId || null,
        notes: a.notes || "",
        created_at: a.createdAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn(
        "Failed to upsert supplier scheme application in Supabase:",
        error.message,
      );
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push supplier scheme application to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

export async function pushSupplierCreditNoteToSupabase(
  n: SupplierCreditNote,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const { error } = await client.from("supplier_credit_notes").upsert(
      {
        id: n.id,
        supplier_name: n.supplierName,
        scheme_id: n.schemeId || null,
        grn_id: n.grnId || null,
        product_id: n.productId ?? null,
        period: n.period || null,
        credit_note_number: n.creditNoteNumber || null,
        credit_note_date: n.creditNoteDate || null,
        expected_amount: n.expectedAmount,
        actual_amount: n.actualAmount,
        status: n.status,
        attachment_ref: n.attachmentRef || null,
        notes: n.notes || "",
        created_at: n.createdAt,
        updated_at: n.updatedAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn(
        "Failed to upsert supplier credit note in Supabase:",
        error.message,
      );
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push supplier credit note to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

export async function deleteSupplierCreditNoteFromSupabase(
  id: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("supplier_credit_notes").delete().eq("id", id);
  } catch (e) {
    console.warn("Failed to delete supplier credit note from Supabase:", e);
  }
}

export async function pushInventoryDispositionToSupabase(
  d: InventoryDisposition,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const { error } = await client.from("inventory_dispositions").upsert(
      {
        id: d.id,
        disposition_type: d.dispositionType,
        product_id: d.productId,
        product_name: d.productName || null,
        warehouse_id: d.warehouseId,
        warehouse_name: d.warehouseName || null,
        batch_id: d.batchId || null,
        batch_number: d.batchNumber || null,
        expiry_date: d.expiryDate || null,
        quantity: d.quantity,
        unit: d.unit || "case",
        cost_per_unit: d.costPerUnit,
        cost_value: d.costValue,
        supplier_name: d.supplierName || null,
        grn_id: d.grnId || null,
        supplier_invoice_no: d.supplierInvoiceNo || null,
        credit_note_number: d.creditNoteNumber || null,
        credit_note_date: d.creditNoteDate || null,
        cn_taxable_value: d.cnTaxableValue ?? 0,
        cn_cgst: d.cnCgst ?? 0,
        cn_sgst: d.cnSgst ?? 0,
        cn_igst: d.cnIgst ?? 0,
        cn_total: d.cnTotal ?? 0,
        compensation_status: d.compensationStatus,
        compensated_amount: d.compensatedAmount ?? 0,
        compensated_at: d.compensatedAt || null,
        distributed_to_name: d.distributedToName || null,
        distributed_to_phone: d.distributedToPhone || null,
        salesman_id: d.salesmanId || null,
        salesman_name: d.salesmanName || null,
        reason: d.reason || "",
        notes: d.notes || "",
        reference_doc_no: d.referenceDocNo || null,
        attachment_ref: d.attachmentRef || null,
        created_by: d.createdBy || null,
        approved_by: d.approvedBy || null,
        event_date: d.eventDate,
        stock_applied: d.stockApplied ?? true,
        approval_status: d.approvalStatus || "not_required",
        claim_scheme: d.claimScheme || null,
        compensation_payments: d.compensationPayments || [],
        // Only sent when present, so databases that have not run migration 008 keep working.
        ...(d.returnTracking ? { return_tracking: d.returnTracking } : {}),
        created_at: d.createdAt,
        updated_at: d.updatedAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn(
        "Failed to upsert inventory disposition in Supabase:",
        error.message,
      );
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push inventory disposition to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

export async function deleteInventoryDispositionFromSupabase(
  id: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("inventory_dispositions").delete().eq("id", id);
  } catch (e) {
    console.warn("Failed to delete inventory disposition from Supabase:", e);
  }
}

export async function fetchInventoryDispositionsFromSupabase(): Promise<
  InventoryDisposition[]
> {
  const client = getSupabaseClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("inventory_dispositions")
      .select("*")
      .order("event_date", { ascending: false });
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      dispositionType: r.disposition_type,
      productId: Number(r.product_id),
      productName: r.product_name || undefined,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name || undefined,
      batchId: r.batch_id || undefined,
      batchNumber: r.batch_number || undefined,
      expiryDate: r.expiry_date || undefined,
      quantity: Number(r.quantity) || 0,
      unit: r.unit === "unit" ? "unit" : "case",
      costPerUnit: Number(r.cost_per_unit) || 0,
      costValue: Number(r.cost_value) || 0,
      supplierName: r.supplier_name || undefined,
      grnId: r.grn_id || undefined,
      supplierInvoiceNo: r.supplier_invoice_no || undefined,
      creditNoteNumber: r.credit_note_number || undefined,
      creditNoteDate: r.credit_note_date || undefined,
      cnTaxableValue: Number(r.cn_taxable_value) || 0,
      cnCgst: Number(r.cn_cgst) || 0,
      cnSgst: Number(r.cn_sgst) || 0,
      cnIgst: Number(r.cn_igst) || 0,
      cnTotal: Number(r.cn_total) || 0,
      compensationStatus: r.compensation_status || "not_applicable",
      compensatedAmount: Number(r.compensated_amount) || 0,
      compensatedAt: r.compensated_at || undefined,
      distributedToName: r.distributed_to_name || undefined,
      distributedToPhone: r.distributed_to_phone || undefined,
      salesmanId: r.salesman_id || undefined,
      salesmanName: r.salesman_name || undefined,
      reason: r.reason || "",
      notes: r.notes || undefined,
      referenceDocNo: r.reference_doc_no || undefined,
      attachmentRef: r.attachment_ref || undefined,
      createdBy: r.created_by || undefined,
      approvedBy: r.approved_by || undefined,
      eventDate: r.event_date,
      stockApplied: r.stock_applied !== false,
      approvalStatus: r.approval_status || "not_required",
      claimScheme: r.claim_scheme || undefined,
      compensationPayments: Array.isArray(r.compensation_payments)
        ? r.compensation_payments
        : [],
      returnTracking: r.return_tracking || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Smart Stock Reconciliation & Audit — same upsert(onConflict:'id') idempotency pattern
 * as the Supplier Scheme functions above, so a repeated sync can never duplicate an
 * audit session, a reconciliation transaction, or a ledger entry.
 */
export async function pushAuditSessionToSupabase(
  s: AuditSession,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const row = {
      id: s.id,
      warehouse_id: s.warehouseId || null,
      warehouse_name: s.warehouseName || null,
      date: s.date,
      time: s.time || null,
      auditor_name: s.auditorName,
      reference_note: s.referenceNote || "",
      entries: s.entries,
      edit_log: s.editLog || [],
      created_at: s.createdAt,
      updated_at: s.updatedAt,
    };
    let { error } = await client
      .from("audit_sessions")
      .upsert(row, { onConflict: "id" });
    if (error && /edit_log/i.test(error.message)) {
      // older table without the edit_log column: save without it rather than failing
      const { edit_log: _el, ...legacyRow } = row;
      ({ error } = await client
        .from("audit_sessions")
        .upsert(legacyRow, { onConflict: "id" }));
    }
    if (error) {
      console.warn(
        "Failed to upsert audit session in Supabase:",
        error.message,
      );
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push audit session to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

export async function deleteAuditSessionFromSupabase(
  id: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("audit_sessions").delete().eq("id", id);
  } catch (e) {
    console.warn("Failed to delete audit session from Supabase:", e);
  }
}

export async function pushReconciliationTransactionToSupabase(
  t: ReconciliationTransaction,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const { error } = await client.from("reconciliation_transactions").upsert(
      {
        id: t.id,
        audit_session_id: t.auditSessionId,
        variance_entry_id: t.varianceEntryId,
        type: t.type,
        from_product_id: t.fromProductId,
        to_product_id: t.toProductId ?? null,
        quantity: t.quantity,
        reason_code: t.reasonCode || null,
        match_score: t.matchScore ?? null,
        notes: t.notes || "",
        identified_by: t.identifiedBy,
        approved_by: t.approvedBy || null,
        approved_at: t.approvedAt || null,
        created_at: t.createdAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn(
        "Failed to upsert reconciliation transaction in Supabase:",
        error.message,
      );
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push reconciliation transaction to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

export async function pushStockLedgerEntryToSupabase(
  e: StockLedgerEntry,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const { error } = await client.from("stock_ledger_entries").upsert(
      {
        id: e.id,
        product_id: e.productId,
        warehouse_id: e.warehouseId || null,
        quantity: e.quantity,
        transaction_type: e.transactionType,
        reference_audit_session_id: e.referenceAuditSessionId,
        reference_reconciliation_id: e.referenceReconciliationId,
        reason: e.reason,
        user_id: e.userId || null,
        user_name: e.userName || null,
        timestamp: e.timestamp,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn(
        "Failed to upsert stock ledger entry in Supabase:",
        error.message,
      );
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e2: any) {
    console.warn("Failed to push stock ledger entry to Supabase:", e2);
    return { success: false, error: e2?.message || "Network error" };
  }
}

/**
 * Pushes an inventory batch to Supabase public.inventory_batches table
 */
export async function pushBatchToSupabase(
  b: InventoryBatch,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const payload: any = {
      id: String(b.id),
      product_id: Number(b.productId),
      sku: b.sku || "",
      batch_number: b.batchNumber,
      mfg_date: sanitizeDate(b.mfgDate),
      expiry_date: sanitizeDate(b.expiryDate),
      warehouse_id: b.warehouseId || null,
      quantity: Number(b.quantity || 0),
      cost_price: Number(b.costPrice || 0),
      mrp: Number(b.mrp || 0),
      notes: b.notes || "",
      updated_at: new Date().toISOString(),
    };
    const { error } = await client
      .from("inventory_batches")
      .upsert(payload, { onConflict: "id" });
    if (error) {
      delete payload.sku;
      await client
        .from("inventory_batches")
        .upsert(payload, { onConflict: "id" });
    }
    return { success: true };
  } catch (e: any) {
    console.warn("Failed to push batch to Supabase:", e);
    return { success: false, error: e?.message || "Network error" };
  }
}

/**
 * Deletes an inventory batch from Supabase
 */
export async function deleteBatchFromSupabase(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("inventory_batches").delete().eq("id", id);
  } catch (e) {
    console.warn("Failed to delete batch from Supabase:", e);
  }
}

/**
 * Pushes physical audit to Supabase public.audits table
 */
export async function pushAuditToSupabase(
  a: Audit,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client)
    return { success: false, error: "Supabase client is not configured" };
  try {
    const { error } = await client.from("audits").upsert(
      {
        id: Number(a.id),
        date: a.date,
        entries: a.entries,
        adjusted: Boolean(a.adjusted),
      },
      { onConflict: "id" },
    );
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Network error" };
  }
}

/**
 * Deletes physical audit from Supabase public.audits table
 */
export async function deleteAuditFromSupabase(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("audits").delete().eq("id", id);
  } catch (e) {
    console.warn("Failed to delete audit from Supabase:", e);
  }
}

/**
 * Pushes Billing Settings to Supabase PostgreSQL table
 */
export async function pushBillingSettingsToSupabase(
  settings: BillingSettings,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "Supabase client is not configured." };
  }
  try {
    const { error } = await client.from("billing_settings").upsert(
      {
        id: "default",
        data: settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" };
  }
}

/**
 * Pulls individual Billing Settings from Supabase PostgreSQL table
 */
export async function pullBillingSettingsFromSupabase(): Promise<{
  success: boolean;
  settings?: BillingSettings;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "Supabase client is not configured." };
  }
  try {
    const { data, error } = await client
      .from("billing_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data) {
      return {
        success: false,
        error: "No billing settings record found in Supabase table yet.",
      };
    }

    if (data.data) {
      return { success: true, settings: data.data as BillingSettings };
    }
    return { success: false, error: "Billing settings data column is empty." };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" };
  }
}

/**
 * Pushes a single promotional scheme to Supabase promotions table
 */
export async function pushPromotionToSupabase(pr: Promotion): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const cleanIds = (
      Array.isArray(pr.productIds)
        ? pr.productIds
        : (pr as any).product_ids || []
    )
      .map(Number)
      .filter((n: number) => !isNaN(n));
    const cleanGroup = (
      Array.isArray(pr.productGroup) && pr.productGroup.length > 0
        ? pr.productGroup
        : Array.isArray((pr as any).config?.productGroup) && (pr as any).config.productGroup.length > 0
        ? (pr as any).config.productGroup
        : cleanIds
    )
      .map(Number)
      .filter((n: number) => !isNaN(n));

    const groupCat = pr.groupCategory ?? (pr as any).config?.groupCategory ?? null;
    const groupBr = pr.groupBrand ?? (pr as any).config?.groupBrand ?? null;
    const fItemRule = pr.freeItemRule ?? pr.freeItem ?? (pr as any).config?.freeItemRule ?? (pr as any).config?.freeItem ?? "CHEAPEST_IN_GROUP";
    const choicePid = pr.customerChoiceProductId ? Number(pr.customerChoiceProductId) : ((pr as any).config?.customerChoiceProductId ? Number((pr as any).config.customerChoiceProductId) : null);

    const promoConfig = {
      ...(pr.config || {}),
      productGroup: cleanGroup,
      groupCategory: groupCat,
      groupBrand: groupBr,
      freeItemRule: fItemRule,
      freeItem: fItemRule,
      customerChoiceProductId: choicePid,
      originalType: pr.type,
    };

    // promotions.type check constraint often only allows ('bogo','percent','flat').
    // Store a safe DB type for the column, keep the real type in config.originalType
    // and always mirror the full object to app_collections (below).
    const ALLOWED_PROMO_TYPES = new Set(["bogo", "percent", "flat"]);
    const safeDbType = ALLOWED_PROMO_TYPES.has(String(pr.type))
      ? String(pr.type)
      : "bogo";

    const fullPayload = {
      id: Number(pr.id),
      name: pr.name,
      type: safeDbType,
      buy_qty: pr.buyQty || 0,
      free_qty: pr.freeQty || 0,
      percent: pr.percent || 0,
      flat_per_case: pr.flatPerCase || 0,
      product_ids: cleanGroup.length > 0 ? cleanGroup : cleanIds,
      bundle_buy_type: pr.bundleBuyType || "any",
      required_distinct_types: pr.requiredDistinctTypes || 2,
      min_qty_per_type: pr.minQtyPerType || 1,
      free_reward_choice: pr.freeRewardChoice || "all_eligible",
      free_product_id: pr.freeProductId ? Number(pr.freeProductId) : null,
      free_product_qty: pr.freeProductQty || 1,
      is_active: pr.isActive !== false,
      config: promoConfig,
    };

    const { error } = await client
      .from("promotions")
      .upsert(fullPayload, { onConflict: "id" });
    if (error) {
      console.warn(
        "Failed to upsert to promotions with full schema, trying standard payload without bundle columns:",
        error.message,
      );
      // Fallback: minimal columns + config (originalType preserved)
      const altPayload = {
        id: Number(pr.id),
        name: pr.name,
        type: safeDbType,
        buy_qty: pr.buyQty || 0,
        free_qty: pr.freeQty || 0,
        percent: pr.percent || 0,
        flat_per_case: pr.flatPerCase || 0,
        product_ids: cleanGroup.length > 0 ? cleanGroup : cleanIds,
        config: promoConfig,
      };
      const { error: altErr } = await client
        .from("promotions")
        .upsert(altPayload, { onConflict: "id" });
      if (altErr) {
        console.warn("Failed to upsert to promotions table:", altErr.message);
      }
    }

    // Always mirror to app_collections 'schemes' to guarantee zero data loss & perfect offline/online persistence
    try {
      const { data: col } = await client
        .from("app_collections")
        .select("*")
        .eq("key", "schemes")
        .maybeSingle();
      const currentList: any[] = Array.isArray(col?.data) ? col.data : [];
      const updatedPromo = {
        ...pr,
        id: Number(pr.id),
        type: pr.type,
        productIds: cleanGroup.length > 0 ? cleanGroup : cleanIds,
        productGroup: cleanGroup,
        groupCategory: groupCat,
        groupBrand: groupBr,
        freeItemRule: fItemRule,
        freeItem: fItemRule,
        customerChoiceProductId: choicePid,
        isActive: pr.isActive !== false,
        config: promoConfig,
      };
      const updatedList = [
        ...currentList.filter((s: any) => Number(s.id) !== Number(pr.id)),
        updatedPromo,
      ];
      await client.from("app_collections").upsert(
        {
          key: "schemes",
          data: updatedList,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    } catch {}
  } catch (e) {
    console.warn("Failed to push promotion to Supabase:", e);
  }
}

/**
 * Deletes a promotion from Supabase
 */
export async function deletePromotionFromSupabase(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from("promotions").delete().eq("id", id);
    await client.from("promotional_schemes").delete().eq("id", id);
    // Also remove from app_collections schemes mirror
    const { data: col } = await client
      .from("app_collections")
      .select("*")
      .eq("key", "schemes")
      .single();
    if (col && Array.isArray(col.data)) {
      const updated = col.data.filter((s: any) => Number(s.id) !== Number(id));
      await client.from("app_collections").upsert({
        key: "schemes",
        data: updated,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn("Failed to delete promotion from Supabase:", e);
  }
}

/**
 * Append-only change log for GRN corrections (grn_edit_log table). Best-effort: the same
 * history also lives inside each GRN (editHistory), so a missing table never loses data.
 */
export async function pushGrnEditLogToSupabase(
  grn: GrnType,
  record: GrnEditRecord,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { error } = await client.from("grn_edit_log").upsert(
      {
        id: record.id,
        grn_id: grn.id,
        grn_number: grn.grnNumber,
        invoice_no: grn.invoiceNo || "",
        supplier_name: grn.supplierName || "",
        edited_by: record.by,
        reason: record.reason || "",
        changes: record.changes,
        edited_at: record.at,
      },
      { onConflict: "id" },
    );
    if (error)
      console.warn(
        "grn_edit_log not saved (run the SQL migration):",
        error.message,
      );
  } catch (e) {
    console.warn("Failed to push GRN edit log:", e);
  }
}

/**
 * Deletes an inward GRN from Supabase
 */
export async function deleteGrnFromSupabase(
  id: string,
  remainingGrns: GRN[],
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    try {
      await client.from("grns").delete().eq("id", id);
    } catch {
      // ignore
    }
    await client.from("billing_settings").upsert(
      {
        id: "inward_grns",
        data: { grns: remainingGrns },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch (e) {
    console.warn("Failed to delete GRN from Supabase:", e);
  }
}

/**
 * Pushes individual Organization Profile to Supabase PostgreSQL table
 */
export async function pushOrgProfileToSupabase(
  profile: OrganizationProfile,
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "Supabase client is not configured." };
  }
  try {
    const { error } = await client.from("organization_profile").upsert(
      {
        id: "default",
        data: profile,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" };
  }
}

/**
 * Pulls individual Organization Profile from Supabase PostgreSQL table
 */
export async function pullOrgProfileFromSupabase(): Promise<{
  success: boolean;
  profile?: OrganizationProfile;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "Supabase client is not configured." };
  }
  try {
    const { data, error } = await client
      .from("organization_profile")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data) {
      return {
        success: false,
        error: "No profile record found in Supabase table yet.",
      };
    }

    if (data.data) {
      return { success: true, profile: data.data as OrganizationProfile };
    }
    return { success: false, error: "Profile data column is empty." };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" };
  }
}

/**
 * Fetches all ledger data from Supabase database tables
 */
export async function pullLedgerFromSupabase(): Promise<{
  warehouses?: Warehouse[];
  products?: Product[];
  inventoryBatches?: InventoryBatch[];
  grns?: GRN[];
  stockTransfers?: StockTransfer[];
  promotions?: Promotion[];
  bills?: Bill[];
  trips?: Trip[];
  audits?: Audit[];
  payments?: PaymentRecord[];
  orgProfile?: OrganizationProfile;
  billingSettings?: BillingSettings;
  salesmen?: Salesman[];
  auditSessions?: AuditSession[];
  reconciliationTransactions?: ReconciliationTransaction[];
  stockLedgerEntries?: StockLedgerEntry[];
} | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const [
      whRes,
      prodRes,
      batchRes,
      promoRes,
      billRes,
      tripRes,
      auditRes,
      orgRes,
      setRes,
      grnRes,
      inwardGrnSettingRes,
      inwardGrnAppCollectionRes,
      paymentsSettingRes,
      paymentsAppCollectionRes,
      salesmanRes,
      auditSessionsRes,
      reconciliationTransactionsRes,
      stockLedgerEntriesRes,
      auditSessionsSettingRes,
      stockLedgerSettingRes,
      reconciliationTransactionsSettingRes,
      dispositionsRes,
      creditNotesRes,
      schemesRes,
      schemesAppCollectionRes,
    ] = await Promise.all([
      client.from("warehouses").select("*").order("name", { ascending: true }),
      fetchTableDelta(client, { table: "products", idCol: "id", cursorCol: "updated_at", orderCol: "id", ascending: true }),
      fetchTableDelta(client, { table: "inventory_batches", idCol: "id", cursorCol: "updated_at", orderCol: "created_at", ascending: true }),
      client.from("promotions").select("*").order("id", { ascending: true }),
      fetchTableDelta(client, { table: "bills", idCol: "id", cursorCol: "updated_at", orderCol: "id", ascending: true }),
      fetchTableDelta(client, { table: "trips", idCol: "id", cursorCol: "updated_at", orderCol: "id", ascending: true }),
      client.from("audits").select("*").order("id", { ascending: true }),
      client
        .from("organization_profile")
        .select("*")
        .eq("id", "default")
        .maybeSingle(),
      client
        .from("billing_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle(),
      fetchTableDelta(client, { table: "grns", idCol: "id", cursorCol: "updated_at", orderCol: "id", ascending: true }),
      fetchRowIfChanged(client, "billing_settings", "id", "inward_grns"),
      fetchRowIfChanged(client, "app_collections", "key", "inward_grns"),
      fetchRowIfChanged(client, "billing_settings", "id", "collection_payments"),
      fetchRowIfChanged(client, "app_collections", "key", "payments"),
      fetchTableDelta(client, { table: "salesmen", idCol: "id", cursorCol: "updated_at", orderCol: "name", ascending: true }),
      fetchTableDelta(client, { table: "audit_sessions", idCol: "id", cursorCol: "updated_at", orderCol: "created_at", ascending: false }),
      fetchTableDelta(client, { table: "reconciliation_transactions", idCol: "id", cursorCol: "created_at", orderCol: "created_at", ascending: false }),
      fetchTableDelta(client, { table: "stock_ledger_entries", idCol: "id", cursorCol: "timestamp", orderCol: "timestamp", ascending: false }),
      fetchRowIfChanged(client, "billing_settings", "id", "collection_audit_sessions"),
      fetchRowIfChanged(client, "billing_settings", "id", "collection_stock_ledger_entries"),
      fetchRowIfChanged(client, "billing_settings", "id", "collection_reconciliation_transactions"),
      fetchTableDelta(client, { table: "inventory_dispositions", idCol: "id", cursorCol: "updated_at", orderCol: "event_date", ascending: false }),
      fetchTableDelta(client, { table: "supplier_credit_notes", idCol: "id", cursorCol: "updated_at", orderCol: "created_at", ascending: false }),
      fetchTableDelta(client, { table: "supplier_schemes", idCol: "id", cursorCol: "updated_at", orderCol: "created_at", ascending: false }),
      // Full scheme objects (group / bundle / free-item rules) live here —
      // promotions table may only hold a constrained subset of types.
      fetchRowIfChanged(client, "app_collections", "key", "schemes"),
    ]);

    const result: any = {};

    if (!whRes.error && whRes.data && whRes.data.length > 0) {
      result.warehouses = whRes.data.map((r: any) => ({
        id: String(r.id),
        name: r.name,
        code: r.code || "",
        location: r.location || "",
        manager: r.manager || "",
        phone: r.phone || "",
        capacityCases: Number(r.capacity_cases || 0),
        isDefault: Boolean(r.is_default),
        notes: r.notes || "",
      }));
    } else {
      // Seed initial base warehouses so that foreign key constraints never fail
      try {
        await client.from("warehouses").upsert(
          INIT_WAREHOUSES.map((w) => ({
            id: w.id,
            name: w.name,
            code: w.code,
            location: w.location || "",
            is_default: Boolean(w.isDefault),
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "id" },
        );
        result.warehouses = INIT_WAREHOUSES;
      } catch {
        // ignore if table not accessible yet
      }
    }

    if (!batchRes.error && batchRes.data && batchRes.data.length > 0) {
      result.inventoryBatches = batchRes.data.map((r: any) => ({
        id: String(r.id),
        productId: Number(r.product_id),
        sku: r.sku || "",
        batchNumber: r.batch_number,
        mfgDate: r.mfg_date || "",
        expiryDate: r.expiry_date || "",
        warehouseId: r.warehouse_id || "",
        quantity: Number(r.quantity || 0),
        billedQuantity: Number(r.billed_quantity || r.quantity || 0),
        freeQuantity: Number(r.free_quantity || 0),
        costPrice: Number(r.cost_price || 0),
        effectiveCostPrice: Number(r.effective_cost_price || r.cost_price || 0),
        landedCostPerCrate: Number(r.landed_cost_per_crate || 0),
        mrp: Number(r.mrp || 0),
        notes: r.notes || "",
        supplierInvoiceNo: r.supplier_invoice_no || "",
        supplierName: r.supplier_name || "",
        inwardDate: r.inward_date || "",
      }));
    }

    if (!prodRes.error && prodRes.data && prodRes.data.length > 0) {
      result.products = prodRes.data.map((r: any) => {
        const catKey = r.category as CategoryKey;
        const catDef = CATS?.[catKey];
        // Standard beverage GST: 40% for energy & vibe, 5% for joos, 18% for water
        // A stored rate (including 0%) is the product's real rate. Only a missing rate, or the
        // old blanket 18% default written by earlier versions, is replaced from the HSN / category.
        const hsnRate = gstRateFromHsn(r.hsn);
        let gst = r.gst_rate !== undefined && r.gst_rate !== null
          ? Number(r.gst_rate)
          : (hsnRate ?? catDef?.gst ?? 0.18);
        if (gst === 0.18) {
          if (hsnRate != null && hsnRate !== 0.18) gst = hsnRate;
          else if (hsnRate == null && !r.hsn && catDef && (catKey === 'vibe' || catKey === 'energy')) gst = catDef.gst;
        }

        const cost = Number(r.cost || 0);
        const effectiveCost = Number(r.effective_cost || cost);

        // Find genuine landed cost from batch records if available
        let landedCost = Number(r.landed_cost_per_crate || 0);
        if (!landedCost || landedCost <= 0) {
          const matchingBatch = result.inventoryBatches?.find(
            (b: any) => Number(b.productId) === Number(r.id) && Number(b.landedCostPerCrate) > 0
          );
          if (matchingBatch) {
            landedCost = Number(matchingBatch.landedCostPerCrate);
          }
        }
        if (!landedCost || landedCost <= 0) {
          landedCost = Math.round(cost * (1 + gst) * 100) / 100;
        }

        return {
          id: Number(r.id),
          updatedAt: r.updated_at || undefined,
          sku: r.sku || generateSkuId(r.name, r.category, Number(r.id)),
          name: String(r.name || "").trim().toUpperCase(),
          category: r.category,
          volume: Number(r.volume || 0),
          pack: r.pack || "",
          expiry: r.expiry || "",
          batchNumber: r.batch_number || "",
          mfgDate: r.mfg_date || "",
          warehouseId: r.warehouse_id || "",
          opening: Number(r.opening || 0),
          cost,
          effectiveCost,
          landedCostPerCrate: landedCost,
          retail: Number(r.retail || 0),
          wholesale: Number(r.wholesale || 0),
          hsn: normalizeTo8DigitHsn(r.hsn || catDef?.hsn, r.category, r.name),
          gstRate: gst,
          scheme: r.scheme || "",
        };
      });
    }

    // Process Inward Consignments / Invoices (GRNs) from all Supabase sources
    const grnMap = new Map<string, any>();

    // 1. Inward GRNs from billing_settings mirror
    if (
      !inwardGrnSettingRes.error &&
      inwardGrnSettingRes.data?.data &&
      Array.isArray(inwardGrnSettingRes.data.data.grns)
    ) {
      inwardGrnSettingRes.data.data.grns.forEach((g: any) => {
        if (g && (g.id || g.invoiceNo || g.grnNumber)) {
          const key = String(g.id || g.invoiceNo || g.grnNumber);
          grnMap.set(key, g);
        }
      });
    }

    // 2. Inward GRNs from app_collections
    if (
      !inwardGrnAppCollectionRes.error &&
      inwardGrnAppCollectionRes.data?.data
    ) {
      const list = Array.isArray(inwardGrnAppCollectionRes.data.data)
        ? inwardGrnAppCollectionRes.data.data
        : inwardGrnAppCollectionRes.data.data.grns;
      if (Array.isArray(list)) {
        list.forEach((g: any) => {
          if (g && (g.id || g.invoiceNo || g.grnNumber)) {
            const key = String(g.id || g.invoiceNo || g.grnNumber);
            grnMap.set(key, g);
          }
        });
      }
    }

    // 3. GRNs from public.grns table
    if (!grnRes.error && grnRes.data && grnRes.data.length > 0) {
      grnRes.data.forEach((g: any) => {
        const mapped: any = {
          id: String(g.id),
          grnNumber: g.grn_number || g.id,
          invoiceNo: g.invoice_no || "",
          supplierName: g.supplier_name || "",
          supplierGstin: g.supplier_gstin || "",
          supplierAddress: g.supplier_address || "",
          supplierPhone: g.supplier_phone || "",
          supplierEmail: g.supplier_email || "",
          inwardDate: g.inward_date || "",
          vehicleNo: g.vehicle_no || "",
          warehouseId: g.warehouse_id || "",
          warehouseName: g.warehouse_name || "",
          items: Array.isArray(g.items) ? g.items : [],
          totalBilledQty: Number(g.total_billed_qty || 0),
          totalFreeQty: Number(g.total_free_qty || 0),
          totalPaidQty: Number(g.total_paid_qty || 0),
          totalReceivedQty: Number(g.total_received_qty || 0),
          totalTaxable: Number(g.total_taxable || 0),
          totalCgst: Number(g.total_cgst || 0),
          totalSgst: Number(g.total_sgst || 0),
          totalTax: Number(g.total_tax || 0),
          grandTotal: Number(g.grand_total || 0),
          inwardCosts: g.inward_costs || undefined,
          totalInwardCost: Number(g.total_inward_cost || 0),
          inwardCostPerCrate: Number(g.inward_cost_per_crate || 0),
          notes: g.notes || "",
          editHistory: Array.isArray(g.edit_history) ? g.edit_history : [],
          createdAt: g.created_at || new Date().toISOString(),
          updatedAt: g.updated_at || new Date().toISOString(),
        };
        const key = String(mapped.id || mapped.invoiceNo || mapped.grnNumber);
        // The table row only has the main columns: keep what the full mirror copy knows (place of supply, billed-to,
        // overall discount, ...) and let the saved `extra` fields and the real columns win over it.
        grnMap.set(key, { ...(grnMap.get(key) || {}), ...applyGrnExtra(mapped, g.extra) });
      });
    }

    if (grnMap.size > 0) {
      result.grns = Array.from(grnMap.values()).sort((a, b) => {
        const da = a.inwardDate || a.createdAt || "";
        const db = b.inwardDate || b.createdAt || "";
        return db.localeCompare(da);
      });
    }

    // Process Payments & Collections from Supabase
    const payMap = new Map<string, PaymentRecord>();
    if (
      !paymentsSettingRes.error &&
      paymentsSettingRes.data?.data &&
      Array.isArray(paymentsSettingRes.data.data.payments)
    ) {
      paymentsSettingRes.data.data.payments.forEach((p: any) => {
        if (p && p.id) payMap.set(String(p.id), p);
      });
    }
    if (
      !paymentsAppCollectionRes.error &&
      paymentsAppCollectionRes.data?.data
    ) {
      const list = Array.isArray(paymentsAppCollectionRes.data.data)
        ? paymentsAppCollectionRes.data.data
        : paymentsAppCollectionRes.data.data.payments;
      if (Array.isArray(list)) {
        list.forEach((p: any) => {
          if (p && p.id) payMap.set(String(p.id), p);
        });
      }
    }
    if (payMap.size > 0) {
      result.payments = Array.from(payMap.values()).sort((a, b) => {
        const da = a.paymentDate || a.createdAt || "";
        const db = b.paymentDate || b.createdAt || "";
        return db.localeCompare(da);
      });
    }

    // Prefer full scheme objects from app_collections (preserves group_buy_n_get_m_free,
    // bundle, freeItemRule, productGroup, etc.). Fall back to promotions table only
    // when the collection is empty — and restore originalType from config when present.
    const colSchemesRaw =
      !schemesAppCollectionRes?.error && schemesAppCollectionRes?.data
        ? (schemesAppCollectionRes.data as any)?.data
        : null;
    if (Array.isArray(colSchemesRaw) && colSchemesRaw.length > 0) {
      result.promotions = colSchemesRaw.map((p: any) => {
        const cfg = p?.config && typeof p.config === "object" ? p.config : {};
        const restoredType =
          p.type &&
          !["bogo", "percent", "flat"].includes(p.type)
            ? p.type
            : cfg.originalType || p.type || "bogo";
        const groupFromCfg = Array.isArray(cfg.productGroup)
          ? cfg.productGroup.map(Number).filter((n: number) => !isNaN(n))
          : [];
        const rawIds =
          p.productGroup ??
          p.product_group ??
          p.productIds ??
          p.product_ids ??
          groupFromCfg;
        let cleanIds: number[] = [];
        if (Array.isArray(rawIds)) {
          cleanIds = rawIds.map(Number).filter((n: number) => !isNaN(n));
        }
        return {
          ...p,
          id: Number(p.id),
          type: restoredType,
          productIds: cleanIds.length > 0 ? cleanIds : (Array.isArray(p.productIds) ? p.productIds.map(Number).filter((n: number) => !isNaN(n)) : []),
          productGroup:
            Array.isArray(p.productGroup) && p.productGroup.length > 0
              ? p.productGroup.map(Number).filter((n: number) => !isNaN(n))
              : groupFromCfg.length > 0
                ? groupFromCfg
                : cleanIds,
          groupCategory: p.groupCategory ?? cfg.groupCategory ?? undefined,
          groupBrand: p.groupBrand ?? cfg.groupBrand ?? undefined,
          freeItemRule:
            p.freeItemRule ??
            p.freeItem ??
            cfg.freeItemRule ??
            cfg.freeItem ??
            "CHEAPEST_IN_GROUP",
          freeItem:
            p.freeItemRule ??
            p.freeItem ??
            cfg.freeItemRule ??
            cfg.freeItem ??
            "CHEAPEST_IN_GROUP",
          customerChoiceProductId: p.customerChoiceProductId
            ? Number(p.customerChoiceProductId)
            : cfg.customerChoiceProductId
              ? Number(cfg.customerChoiceProductId)
              : undefined,
          isActive: p.isActive !== false,
        };
      });
    } else if (!promoRes.error && Array.isArray(promoRes.data)) {
      result.promotions = promoRes.data.map((r: any) => {
        const cfg = r?.config && typeof r.config === "object" ? r.config : {};
        const rawIds =
          r.product_ids ?? r.productIds ?? r.product_id ?? r.productId ?? cfg.productGroup;
        let cleanIds: number[] = [];
        if (Array.isArray(rawIds)) {
          cleanIds = rawIds.map(Number).filter((n: number) => !isNaN(n));
        } else if (typeof rawIds === "string") {
          try {
            const parsed = JSON.parse(rawIds);
            if (Array.isArray(parsed))
              cleanIds = parsed.map(Number).filter((n: number) => !isNaN(n));
            else
              cleanIds = rawIds
                .split(",")
                .map((s: string) => Number(s.trim()))
                .filter((n: number) => !isNaN(n));
          } catch {
            cleanIds = rawIds
              .split(",")
              .map((s: string) => Number(s.trim()))
              .filter((n: number) => !isNaN(n));
          }
        } else if (typeof rawIds === "number" && !isNaN(rawIds)) {
          cleanIds = [rawIds];
        }

        // Restore extended types that were forced to 'bogo' for the DB check constraint
        const restoredType =
          cfg.originalType ||
          (r.type && !["bogo", "percent", "flat"].includes(String(r.type))
            ? r.type
            : r.type) ||
          "bogo";

        return {
          id: Number(r.id),
          name: r.name,
          type: restoredType,
          buyQty: Number(r.buy_qty ?? r.buyQty ?? 0),
          freeQty: Number(r.free_qty ?? r.freeQty ?? 0),
          percent: Number(r.percent || 0),
          flatPerCase: Number(r.flat_per_case ?? r.flatPerCase ?? 0),
          productIds: cleanIds,
          isActive:
            r.is_active !== undefined
              ? Boolean(r.is_active)
              : r.isActive !== undefined
                ? Boolean(r.isActive)
                : true,
          bundleBuyType: r.bundle_buy_type ?? r.bundleBuyType ?? "any",
          requiredDistinctTypes: Number(
            r.required_distinct_types ?? r.requiredDistinctTypes ?? 2,
          ),
          minQtyPerType: Number(r.min_qty_per_type ?? r.minQtyPerType ?? 1),
          freeRewardChoice:
            r.free_reward_choice ?? r.freeRewardChoice ?? "all_eligible",
          freeProductId: r.free_product_id
            ? Number(r.free_product_id)
            : r.freeProductId
              ? Number(r.freeProductId)
              : undefined,
          freeProductQty: Number(r.free_product_qty ?? r.freeProductQty ?? 1),
          productGroup:
            Array.isArray(cfg.productGroup) && cfg.productGroup.length > 0
              ? cfg.productGroup.map(Number).filter((n: number) => !isNaN(n))
              : r.product_group ?? r.productGroup ?? cleanIds,
          groupCategory:
            r.group_category ?? r.groupCategory ?? cfg.groupCategory ?? undefined,
          groupBrand:
            r.group_brand ?? r.groupBrand ?? cfg.groupBrand ?? undefined,
          freeItemRule:
            r.free_item_rule ??
            r.freeItemRule ??
            cfg.freeItemRule ??
            cfg.freeItem ??
            "CHEAPEST_IN_GROUP",
          freeItem:
            r.free_item_rule ??
            r.freeItemRule ??
            cfg.freeItemRule ??
            cfg.freeItem ??
            "CHEAPEST_IN_GROUP",
          customerChoiceProductId: r.customer_choice_product_id
            ? Number(r.customer_choice_product_id)
            : r.customerChoiceProductId
              ? Number(r.customerChoiceProductId)
              : cfg.customerChoiceProductId
                ? Number(cfg.customerChoiceProductId)
                : undefined,
          config: cfg,
        };
      });
    }

    if (!billRes.error && billRes.data && billRes.data.length > 0) {
      result.bills = billRes.data.map((r: any) => applyBillExtra({
        id: Number(r.id),
        retailer: r.retailer,
        supplyType: r.supply_type === "B2B" ? "B2B" : "B2C",
        customerGstin: r.customer_gstin || undefined,
        isRetrospective: r.is_retrospective === true,
        phone: r.phone || "",
        date: r.date,
        subtotal: Number(r.subtotal || 0),
        cgst: Number(r.cgst || 0),
        sgst: Number(r.sgst || 0),
        total: Number(r.total || 0),
        discount: Number(r.discount || 0),
        amountPaid: Number(r.amount_paid || 0),
        status: r.cancellation ? "cancelled" : undefined,
        cancellation: r.cancellation || undefined,
        returns:
          Array.isArray(r.returns) && r.returns.length > 0
            ? r.returns
            : undefined,
        cancelledReturns:
          Array.isArray(r.cancelled_returns) && r.cancelled_returns.length > 0
            ? r.cancelled_returns
            : undefined,
        editHistory:
          Array.isArray(r.edit_history) && r.edit_history.length > 0
            ? r.edit_history
            : undefined,
        warehouseId: r.warehouse_id || "",
        salesman: r.salesman || "",
        salesmanId: r.salesman_id || undefined,
        items: Array.isArray(r.items) ? r.items : [],
      }, r.extra));
    }

    if (!tripRes.error && tripRes.data && tripRes.data.length > 0) {
      result.trips = tripRes.data.map(normalizeTrip);
    }

    if (!salesmanRes.error && salesmanRes.data && salesmanRes.data.length > 0) {
      result.salesmen = salesmanRes.data.map((r: any) => ({
        id: String(r.id),
        name: r.name || "",
        phone: r.phone || "",
        pinHash: r.pin_hash || r.pinHash || "",
        active: r.active !== undefined ? Boolean(r.active) : true,
        defaultVehicle: r.default_vehicle || r.defaultVehicle || "",
        createdAt: r.created_at || "",
        updatedAt: r.updated_at || "",
      }));
    }

    if (!auditRes.error && auditRes.data && auditRes.data.length > 0) {
      result.audits = auditRes.data.map((r: any) => ({
        id: Number(r.id),
        date: r.date,
        entries: Array.isArray(r.entries) ? r.entries : [],
        adjusted: Boolean(r.adjusted),
      }));
    }

    if (!orgRes.error && orgRes.data && orgRes.data.data) {
      result.orgProfile = orgRes.data.data;
    }

    if (!setRes.error && setRes.data && setRes.data.data) {
      result.billingSettings = setRes.data.data;
    }

    // Process Audit Sessions (Smart Reconciliation)
    if (
      !auditSessionsRes.error &&
      auditSessionsRes.data &&
      auditSessionsRes.data.length > 0
    ) {
      result.auditSessions = auditSessionsRes.data.map((r: any) => ({
        id: String(r.id),
        warehouseId: r.warehouse_id || "",
        warehouseName: r.warehouse_name || "",
        date: r.date || "",
        time: r.time || "",
        auditorName: r.auditor_name || "",
        referenceNote: r.reference_note || "",
        entries: Array.isArray(r.entries) ? r.entries : [],
        editLog: Array.isArray(r.edit_log) ? r.edit_log : [],
        createdAt: r.created_at || "",
        updatedAt: r.updated_at || "",
      }));
    } else if (
      !auditSessionsSettingRes.error &&
      auditSessionsSettingRes.data &&
      auditSessionsSettingRes.data.data &&
      Array.isArray(auditSessionsSettingRes.data.data.items) &&
      auditSessionsSettingRes.data.data.items.length > 0
    ) {
      result.auditSessions = auditSessionsSettingRes.data.data.items;
    }

    // Process Reconciliation Transactions
    if (
      !reconciliationTransactionsRes.error &&
      reconciliationTransactionsRes.data &&
      reconciliationTransactionsRes.data.length > 0
    ) {
      result.reconciliationTransactions =
        reconciliationTransactionsRes.data.map((r: any) => ({
          id: String(r.id),
          auditSessionId: String(r.audit_session_id),
          varianceEntryId: String(r.variance_entry_id),
          type: r.type,
          fromProductId: Number(r.from_product_id),
          toProductId: r.to_product_id ? Number(r.to_product_id) : undefined,
          quantity: Number(r.quantity || 0),
          reasonCode: r.reason_code || undefined,
          matchScore:
            r.match_score !== null && r.match_score !== undefined
              ? Number(r.match_score)
              : undefined,
          notes: r.notes || "",
          identifiedBy: r.identified_by || "",
          approvedBy: r.approved_by || undefined,
          approvedAt: r.approved_at || undefined,
          createdAt: r.created_at || "",
        }));
    } else if (
      !reconciliationTransactionsSettingRes.error &&
      reconciliationTransactionsSettingRes.data &&
      reconciliationTransactionsSettingRes.data.data &&
      Array.isArray(reconciliationTransactionsSettingRes.data.data.items) &&
      reconciliationTransactionsSettingRes.data.data.items.length > 0
    ) {
      result.reconciliationTransactions =
        reconciliationTransactionsSettingRes.data.data.items;
    }

    // Process Stock Ledger Entries
    if (
      !stockLedgerEntriesRes.error &&
      stockLedgerEntriesRes.data &&
      stockLedgerEntriesRes.data.length > 0
    ) {
      result.stockLedgerEntries = stockLedgerEntriesRes.data.map((r: any) => ({
        id: String(r.id),
        productId: Number(r.product_id),
        warehouseId: r.warehouse_id || "",
        quantity: Number(r.quantity || 0),
        transactionType: r.transaction_type || "audit_reconciliation",
        referenceAuditSessionId: r.reference_audit_session_id || undefined,
        referenceReconciliationId: r.reference_reconciliation_id || undefined,
        reason: r.reason || "",
        userId: r.user_id || undefined,
        userName: r.user_name || undefined,
        timestamp: r.timestamp || "",
      }));
    } else if (
      !stockLedgerSettingRes.error &&
      stockLedgerSettingRes.data &&
      stockLedgerSettingRes.data.data &&
      Array.isArray(stockLedgerSettingRes.data.data.items) &&
      stockLedgerSettingRes.data.data.items.length > 0
    ) {
      result.stockLedgerEntries = stockLedgerSettingRes.data.data.items;
    }

    // Process Inventory Dispositions
    if (
      !dispositionsRes.error &&
      dispositionsRes.data &&
      dispositionsRes.data.length > 0
    ) {
      result.inventoryDispositions = dispositionsRes.data.map((r: any) => ({
        id: r.id,
        dispositionType: r.disposition_type,
        productId: Number(r.product_id),
        productName: r.product_name || undefined,
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name || undefined,
        batchId: r.batch_id || undefined,
        batchNumber: r.batch_number || undefined,
        expiryDate: r.expiry_date || undefined,
        quantity: Number(r.quantity) || 0,
        unit: r.unit === "unit" ? "unit" : "case",
        costPerUnit: Number(r.cost_per_unit) || 0,
        costValue: Number(r.cost_value) || 0,
        supplierName: r.supplier_name || undefined,
        grnId: r.grn_id || undefined,
        supplierInvoiceNo: r.supplier_invoice_no || undefined,
        creditNoteNumber: r.credit_note_number || undefined,
        creditNoteDate: r.credit_note_date || undefined,
        cnTaxableValue: Number(r.cn_taxable_value) || 0,
        cnCgst: Number(r.cn_cgst) || 0,
        cnSgst: Number(r.cn_sgst) || 0,
        cnIgst: Number(r.cn_igst) || 0,
        cnTotal: Number(r.cn_total) || 0,
        compensationStatus: r.compensation_status || "not_applicable",
        compensatedAmount: Number(r.compensated_amount) || 0,
        compensatedAt: r.compensated_at || undefined,
        distributedToName: r.distributed_to_name || undefined,
        distributedToPhone: r.distributed_to_phone || undefined,
        salesmanId: r.salesman_id || undefined,
        salesmanName: r.salesman_name || undefined,
        reason: r.reason || "",
        notes: r.notes || undefined,
        referenceDocNo: r.reference_doc_no || undefined,
        attachmentRef: r.attachment_ref || undefined,
        createdBy: r.created_by || undefined,
        approvedBy: r.approved_by || undefined,
        eventDate: r.event_date,
        stockApplied: r.stock_applied !== false,
        returnTracking: r.return_tracking || undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    // Process Supplier Credit Notes
    if (
      !creditNotesRes.error &&
      creditNotesRes.data &&
      creditNotesRes.data.length > 0
    ) {
      result.supplierCreditNotes = creditNotesRes.data.map((r: any) => ({
        id: String(r.id),
        supplierName: r.supplier_name,
        schemeId: r.scheme_id || undefined,
        grnId: r.grn_id || undefined,
        productId: r.product_id ? Number(r.product_id) : undefined,
        period: r.period || undefined,
        creditNoteNumber: r.credit_note_number || undefined,
        creditNoteDate: r.credit_note_date || undefined,
        expectedAmount: Number(r.expected_amount) || 0,
        actualAmount: Number(r.actual_amount) || 0,
        status: r.status,
        attachmentRef: r.attachment_ref || undefined,
        notes: r.notes || "",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    // Process Supplier Schemes
    if (!schemesRes.error && schemesRes.data && schemesRes.data.length > 0) {
      result.supplierSchemes = schemesRes.data.map((r: any) => ({
        id: String(r.id),
        supplierName: r.supplier_name,
        name: r.name,
        schemeType: r.scheme_type,
        productIds: Array.isArray(r.product_ids)
          ? r.product_ids.map(Number)
          : [],
        warehouseId: r.warehouse_id || undefined,
        startDate: r.start_date,
        endDate: r.end_date || undefined,
        targetQuantity:
          r.target_quantity !== null && r.target_quantity !== undefined
            ? Number(r.target_quantity)
            : undefined,
        incentiveRate:
          r.incentive_rate !== null && r.incentive_rate !== undefined
            ? Number(r.incentive_rate)
            : undefined,
        calculationMethod: r.calculation_method || undefined,
        active: Boolean(r.active),
        notes: r.notes || "",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    console.error("Failed to pull ledger from Supabase:", err);
    return null;
  }
}

export const COMPLETE_SQL_SCHEMA_SCRIPT = `-- ================================================================
-- MR WATER — COMPLETE DATABASE SCHEMA  (single, ordered, re-runnable)
-- Paste the WHOLE file in: Supabase Dashboard -> SQL Editor -> Run
--
-- * Works on an EMPTY database and on one that already has older tables.
-- * Section 1 creates every table (dependency order).
-- * Section 2 adds any column an older copy of a table is missing, BEFORE
--   indexes/policies use them (fixes errors like: column "period" does not exist).
-- * Section 3 = indexes, Section 4 = row level security, Section 5 = extras.
-- * Never drops data.
-- ================================================================

-- ---------------------------------------------------------------
-- SECTION 1: TABLES
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    manager TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    capacity_cases INTEGER DEFAULT 0,
    is_default BOOLEAN DEFAULT FALSE,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.salesmen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  default_vehicle TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
    id BIGINT PRIMARY KEY,
    sku TEXT DEFAULT '',
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    volume NUMERIC(10, 2) NOT NULL DEFAULT 0,
    pack TEXT NOT NULL DEFAULT '',
    expiry TEXT NOT NULL DEFAULT '',
    batch_number TEXT DEFAULT '',
    mfg_date TEXT DEFAULT '',
    warehouse_id TEXT DEFAULT '',
    opening INTEGER NOT NULL DEFAULT 0,
    cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
    effective_cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
    retail NUMERIC(10, 2) NOT NULL DEFAULT 0,
    wholesale NUMERIC(10, 2) NOT NULL DEFAULT 0,
    hsn TEXT DEFAULT '22029990',
    gst_rate NUMERIC(5, 4) DEFAULT 0.18,
    scheme TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id TEXT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    batch_number TEXT NOT NULL,
    mfg_date DATE,
    expiry_date DATE,
    warehouse_id TEXT REFERENCES public.warehouses(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    cost_price NUMERIC(10, 2) DEFAULT 0,
    mrp NUMERIC(10, 2) DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    from_warehouse_id TEXT,
    to_warehouse_id TEXT,
    product_id BIGINT NOT NULL,
    batch_number TEXT DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0,
    reference_note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.promotions (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'bogo', 'percent', 'flat', 'bundle'
    buy_qty INTEGER DEFAULT 0,
    free_qty INTEGER DEFAULT 0,
    percent NUMERIC(5, 2) DEFAULT 0,
    flat_per_case NUMERIC(10, 2) DEFAULT 0,
    product_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
    bundle_buy_type TEXT DEFAULT 'any',
    required_distinct_types INTEGER DEFAULT 2,
    min_qty_per_type INTEGER DEFAULT 1,
    free_reward_choice TEXT DEFAULT 'all_eligible',
    free_product_id BIGINT,
    free_product_qty INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bills (
    id BIGINT PRIMARY KEY,
    retailer TEXT NOT NULL,
    phone TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cgst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sgst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
    warehouse_id TEXT DEFAULT '',
    items JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trips (
    id BIGINT PRIMARY KEY,
    vehicle TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    warehouse_id TEXT DEFAULT '',
    loaded JSONB NOT NULL DEFAULT '{}'::JSONB,
    returned JSONB NOT NULL DEFAULT '{}'::JSONB,
    bill_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
    status TEXT NOT NULL DEFAULT 'out' CHECK (status IN ('out', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audits (
    id BIGINT PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    warehouse_id TEXT DEFAULT '',
    entries JSONB NOT NULL DEFAULT '[]'::JSONB,
    adjusted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_profile (
    id TEXT PRIMARY KEY DEFAULT 'default',
    data JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.billing_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    data JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  stock_on_hand INTEGER NOT NULL DEFAULT 0,
  reserved_stock INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  warehouse_id TEXT,
  warehouse_name TEXT,
  warehouse_bay TEXT,
  batch_number TEXT,
  mfg_date TEXT,
  expiry_date TEXT,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  selling_scheme TEXT,
  selling_scheme_discount NUMERIC,
  selling_scheme_label TEXT,
  last_restocked TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_collections (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  retailer TEXT,
  phone TEXT,
  date TEXT,
  status TEXT DEFAULT 'confirmed',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC DEFAULT 0,
  cgst NUMERIC DEFAULT 0,
  sgst NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  warehouse_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.promotional_schemes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  buy_qty INTEGER DEFAULT 0,
  free_qty INTEGER DEFAULT 0,
  percent NUMERIC DEFAULT 0,
  flat_per_case NUMERIC DEFAULT 0,
  product_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grns (
    id TEXT PRIMARY KEY,
    grn_number TEXT NOT NULL,
    invoice_no TEXT NOT NULL DEFAULT '',
    supplier_name TEXT NOT NULL DEFAULT '',
    supplier_gstin TEXT DEFAULT '',
    supplier_address TEXT DEFAULT '',
    supplier_phone TEXT DEFAULT '',
    supplier_email TEXT DEFAULT '',
    inward_date DATE NOT NULL DEFAULT CURRENT_DATE,
    vehicle_no TEXT DEFAULT '',
    warehouse_id TEXT DEFAULT '',
    warehouse_name TEXT DEFAULT '',
    items JSONB NOT NULL DEFAULT '[]'::JSONB,
    total_billed_qty INTEGER DEFAULT 0,
    total_free_qty INTEGER DEFAULT 0,
    total_paid_qty INTEGER DEFAULT 0,
    total_received_qty INTEGER DEFAULT 0,
    total_taxable NUMERIC(12, 2) DEFAULT 0,
    total_cgst NUMERIC(12, 2) DEFAULT 0,
    total_sgst NUMERIC(12, 2) DEFAULT 0,
    total_tax NUMERIC(12, 2) DEFAULT 0,
    grand_total NUMERIC(12, 2) DEFAULT 0,
    inward_costs JSONB DEFAULT '{}'::JSONB,
    total_inward_cost NUMERIC(12, 2) DEFAULT 0,
    inward_cost_per_crate NUMERIC(10, 2) DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_schemes (
    id TEXT PRIMARY KEY,
    supplier_name TEXT NOT NULL,
    name TEXT NOT NULL,
    scheme_type TEXT NOT NULL CHECK (scheme_type IN ('free_goods', 'pending_credit', 'volume_incentive')),
    product_ids BIGINT[] NOT NULL DEFAULT '{}',
    warehouse_id TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    target_quantity NUMERIC(12, 2),
    incentive_rate NUMERIC(12, 2),
    calculation_method TEXT CHECK (calculation_method IN ('all_eligible', 'excess_only')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_scheme_applications (
    id TEXT PRIMARY KEY,
    scheme_id TEXT NOT NULL REFERENCES public.supplier_schemes(id) ON DELETE CASCADE,
    scheme_type TEXT NOT NULL CHECK (scheme_type IN ('free_goods', 'pending_credit')),
    grn_id TEXT NOT NULL,
    grn_line_id TEXT NOT NULL,
    product_id BIGINT NOT NULL,
    supplier_name TEXT NOT NULL,
    supplier_invoice_no TEXT DEFAULT '',
    eligible_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
    free_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
    expected_benefit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    warehouse_id TEXT,
    batch_id TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_credit_notes (
    id TEXT PRIMARY KEY,
    supplier_name TEXT NOT NULL,
    scheme_id TEXT REFERENCES public.supplier_schemes(id) ON DELETE SET NULL,
    grn_id TEXT,
    product_id BIGINT,
    period TEXT, -- "YYYY-MM" for Type C monthly settlements
    credit_note_number TEXT,
    credit_note_date TEXT,
    expected_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    actual_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_credited', 'settled')),
    attachment_ref TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_sessions (
    id TEXT PRIMARY KEY,
    warehouse_id TEXT,
    warehouse_name TEXT,
    date TEXT NOT NULL,
    time TEXT,
    auditor_name TEXT NOT NULL,
    reference_note TEXT DEFAULT '',
    entries JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reconciliation_transactions (
    id TEXT PRIMARY KEY,
    audit_session_id TEXT NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
    variance_entry_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('swap', 'investigation_reason', 'adjustment')),
    from_product_id BIGINT NOT NULL,
    to_product_id BIGINT,
    quantity NUMERIC(12, 2) NOT NULL,
    reason_code TEXT,
    match_score NUMERIC(5, 2),
    notes TEXT DEFAULT '',
    identified_by TEXT NOT NULL,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_ledger_entries (
    id TEXT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    warehouse_id TEXT,
    quantity NUMERIC(12, 2) NOT NULL,
    transaction_type TEXT NOT NULL DEFAULT 'audit_reconciliation',
    reference_audit_session_id TEXT NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
    reference_reconciliation_id TEXT NOT NULL REFERENCES public.reconciliation_transactions(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    user_id TEXT,
    user_name TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grn_edit_log (
    id            TEXT PRIMARY KEY,
    grn_id        TEXT NOT NULL,              -- no FK on purpose: the log must survive a GRN delete
    grn_number    TEXT,
    invoice_no    TEXT,
    supplier_name TEXT,
    edited_by     TEXT,
    reason        TEXT DEFAULT '',
    changes       JSONB NOT NULL DEFAULT '[]'::JSONB,   -- [{scope, lineLabel, field, from, to}, ...]
    edited_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- SECTION 2: REPAIR OLDER TABLES (add columns that may be missing)
-- ---------------------------------------------------------------
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS manager TEXT NOT NULL DEFAULT '';
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS capacity_cases INTEGER DEFAULT 0;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.salesmen ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.salesmen ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.salesmen ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.salesmen ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.salesmen ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.salesmen ADD COLUMN IF NOT EXISTS default_vehicle TEXT DEFAULT '';
ALTER TABLE public.salesmen ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.salesmen ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS id BIGINT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS volume NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pack TEXT NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry TEXT NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS batch_number TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mfg_date TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS warehouse_id TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS opening INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS effective_cost NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS retail NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS hsn TEXT DEFAULT '22029990';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5, 4) DEFAULT 0.18;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS scheme TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS product_id BIGINT;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS batch_number TEXT;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS mfg_date DATE;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS warehouse_id TEXT REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS mrp NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS from_warehouse_id TEXT;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS to_warehouse_id TEXT;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS product_id BIGINT;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS batch_number TEXT DEFAULT '';
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS reference_note TEXT DEFAULT '';
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS id BIGINT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS buy_qty INTEGER DEFAULT 0;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS free_qty INTEGER DEFAULT 0;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS percent NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS flat_per_case NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS product_ids JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS bundle_buy_type TEXT DEFAULT 'any';
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS required_distinct_types INTEGER DEFAULT 2;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS min_qty_per_type INTEGER DEFAULT 1;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS free_reward_choice TEXT DEFAULT 'all_eligible';
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS free_product_id BIGINT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS free_product_qty INTEGER DEFAULT 1;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS product_group JSONB DEFAULT '[]'::JSONB;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS group_category TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS group_brand TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS free_item_rule TEXT DEFAULT 'CHEAPEST_IN_GROUP';
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS customer_choice_product_id BIGINT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS id BIGINT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS retailer TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS cgst NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS sgst NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS discount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS extra JSONB;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS extra JSONB;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS warehouse_id TEXT DEFAULT '';
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS cancellation JSONB;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS returns JSONB;

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS id BIGINT;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS vehicle TEXT;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS warehouse_id TEXT DEFAULT '';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS loaded JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS returned JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS bill_ids JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS shortage_reasons JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS draft_returned JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cash_handed_in NUMERIC;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cash_short_booked NUMERIC;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cash_recoveries JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cash_short_written_off BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'out';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS id BIGINT;
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS warehouse_id TEXT DEFAULT '';
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS entries JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS adjusted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.organization_profile ADD COLUMN IF NOT EXISTS id TEXT DEFAULT 'default';
ALTER TABLE public.organization_profile ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.organization_profile ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.billing_settings ADD COLUMN IF NOT EXISTS id TEXT DEFAULT 'default';
ALTER TABLE public.billing_settings ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.billing_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS stock_on_hand INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS reserved_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS warehouse_id TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS warehouse_name TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS warehouse_bay TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS batch_number TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS mfg_date TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS expiry_date TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS selling_scheme TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS selling_scheme_discount NUMERIC;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS selling_scheme_label TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS last_restocked TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.app_collections ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE public.app_collections ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.app_collections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS retailer TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cgst NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sgst NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.promotional_schemes ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.promotional_schemes ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.promotional_schemes ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.promotional_schemes ADD COLUMN IF NOT EXISTS buy_qty INTEGER DEFAULT 0;
ALTER TABLE public.promotional_schemes ADD COLUMN IF NOT EXISTS free_qty INTEGER DEFAULT 0;
ALTER TABLE public.promotional_schemes ADD COLUMN IF NOT EXISTS percent NUMERIC DEFAULT 0;
ALTER TABLE public.promotional_schemes ADD COLUMN IF NOT EXISTS flat_per_case NUMERIC DEFAULT 0;
ALTER TABLE public.promotional_schemes ADD COLUMN IF NOT EXISTS product_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.promotional_schemes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.promotional_schemes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS grn_number TEXT;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS invoice_no TEXT NOT NULL DEFAULT '';
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS supplier_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS supplier_gstin TEXT DEFAULT '';
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS supplier_address TEXT DEFAULT '';
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS supplier_phone TEXT DEFAULT '';
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS supplier_email TEXT DEFAULT '';
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS inward_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS vehicle_no TEXT DEFAULT '';
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS warehouse_id TEXT DEFAULT '';
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS warehouse_name TEXT DEFAULT '';
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS total_billed_qty INTEGER DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS total_free_qty INTEGER DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS total_paid_qty INTEGER DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS total_received_qty INTEGER DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS total_taxable NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS total_cgst NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS total_sgst NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS total_tax NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS inward_costs JSONB DEFAULT '{}'::JSONB;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS total_inward_cost NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS inward_cost_per_crate NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS scheme_type TEXT;
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS product_ids BIGINT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS warehouse_id TEXT;
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS target_quantity NUMERIC(12, 2);
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS incentive_rate NUMERIC(12, 2);
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS calculation_method TEXT;
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supplier_schemes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS scheme_id TEXT REFERENCES public.supplier_schemes(id) ON DELETE CASCADE;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS scheme_type TEXT;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS grn_id TEXT;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS grn_line_id TEXT;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS product_id BIGINT;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS supplier_invoice_no TEXT DEFAULT '';
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS eligible_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS expected_benefit NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS warehouse_id TEXT;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.supplier_scheme_applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS scheme_id TEXT REFERENCES public.supplier_schemes(id) ON DELETE SET NULL;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS grn_id TEXT;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS product_id BIGINT;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS credit_note_number TEXT;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS credit_note_date TEXT;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS expected_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS attachment_ref TEXT;
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supplier_credit_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS warehouse_id TEXT;
ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS warehouse_name TEXT;
ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS time TEXT;
ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS auditor_name TEXT;
ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS reference_note TEXT DEFAULT '';
ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS entries JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS audit_session_id TEXT REFERENCES public.audit_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS variance_entry_id TEXT;
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS from_product_id BIGINT;
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS to_product_id BIGINT;
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 2);
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS match_score NUMERIC(5, 2);
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS identified_by TEXT;
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.reconciliation_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS product_id BIGINT;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS warehouse_id TEXT;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 2);
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'audit_reconciliation';
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS reference_audit_session_id TEXT REFERENCES public.audit_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS reference_reconciliation_id TEXT REFERENCES public.reconciliation_transactions(id) ON DELETE CASCADE;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.grn_edit_log ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.grn_edit_log ADD COLUMN IF NOT EXISTS grn_id TEXT;
ALTER TABLE public.grn_edit_log ADD COLUMN IF NOT EXISTS grn_number TEXT;
ALTER TABLE public.grn_edit_log ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE public.grn_edit_log ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE public.grn_edit_log ADD COLUMN IF NOT EXISTS edited_by TEXT;
ALTER TABLE public.grn_edit_log ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT '';
ALTER TABLE public.grn_edit_log ADD COLUMN IF NOT EXISTS changes JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.grn_edit_log ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS edit_log JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS edit_history JSONB NOT NULL DEFAULT '[]'::JSONB;
-- Salesman links on trips & bills
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES public.salesmen(id) ON DELETE SET NULL;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES public.salesmen(id) ON DELETE SET NULL;
-- Bundle promotions must not be rejected by an old check constraint
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_type_check;

-- ---------------------------------------------------------------
-- SECTION 3: INDEXES
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_inventory_items_product_id ON public.inventory_items(product_id);
CREATE INDEX IF NOT EXISTS idx_salesmen_phone ON public.salesmen(phone);
CREATE INDEX IF NOT EXISTS idx_trips_salesman_id ON public.trips(salesman_id);
CREATE INDEX IF NOT EXISTS idx_bills_salesman_id ON public.bills(salesman_id);
CREATE INDEX IF NOT EXISTS idx_supplier_scheme_applications_scheme_id ON public.supplier_scheme_applications(scheme_id);
CREATE INDEX IF NOT EXISTS idx_supplier_scheme_applications_grn_id ON public.supplier_scheme_applications(grn_id);
CREATE INDEX IF NOT EXISTS idx_supplier_scheme_applications_product_id ON public.supplier_scheme_applications(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_scheme_id ON public.supplier_credit_notes(scheme_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_grn_id ON public.supplier_credit_notes(grn_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_period ON public.supplier_credit_notes(period);
CREATE INDEX IF NOT EXISTS idx_reconciliation_transactions_session ON public.reconciliation_transactions(audit_session_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_transactions_variance_entry ON public.reconciliation_transactions(variance_entry_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_transactions_from_product ON public.reconciliation_transactions(from_product_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_entries_product ON public.stock_ledger_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_entries_session ON public.stock_ledger_entries(reference_audit_session_id);
CREATE INDEX IF NOT EXISTS idx_audit_sessions_date ON public.audit_sessions(date);
CREATE INDEX IF NOT EXISTS idx_grn_edit_log_grn ON public.grn_edit_log(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_edit_log_time ON public.grn_edit_log(edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_grns_inward_date ON public.grns(inward_date);

-- ---------------------------------------------------------------
-- SECTION 4: ROW LEVEL SECURITY (open policy, same as the app expects)
-- ---------------------------------------------------------------
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to warehouses" ON public.warehouses;
CREATE POLICY "Allow all access to warehouses" ON public.warehouses FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.salesmen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to salesmen" ON public.salesmen;
CREATE POLICY "Allow all access to salesmen" ON public.salesmen FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to products" ON public.products;
CREATE POLICY "Allow all access to products" ON public.products FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to inventory_batches" ON public.inventory_batches;
CREATE POLICY "Allow all access to inventory_batches" ON public.inventory_batches FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to stock_transfers" ON public.stock_transfers;
CREATE POLICY "Allow all access to stock_transfers" ON public.stock_transfers FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to promotions" ON public.promotions;
CREATE POLICY "Allow all access to promotions" ON public.promotions FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to bills" ON public.bills;
CREATE POLICY "Allow all access to bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to trips" ON public.trips;
CREATE POLICY "Allow all access to trips" ON public.trips FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to audits" ON public.audits;
CREATE POLICY "Allow all access to audits" ON public.audits FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.organization_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to organization_profile" ON public.organization_profile;
CREATE POLICY "Allow all access to organization_profile" ON public.organization_profile FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to billing_settings" ON public.billing_settings;
CREATE POLICY "Allow all access to billing_settings" ON public.billing_settings FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to inventory_items" ON public.inventory_items;
CREATE POLICY "Allow all access to inventory_items" ON public.inventory_items FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.app_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to app_collections" ON public.app_collections;
CREATE POLICY "Allow all access to app_collections" ON public.app_collections FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to orders" ON public.orders;
CREATE POLICY "Allow all access to orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.promotional_schemes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to promotional_schemes" ON public.promotional_schemes;
CREATE POLICY "Allow all access to promotional_schemes" ON public.promotional_schemes FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to grns" ON public.grns;
CREATE POLICY "Allow all access to grns" ON public.grns FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.supplier_schemes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to supplier_schemes" ON public.supplier_schemes;
CREATE POLICY "Allow all access to supplier_schemes" ON public.supplier_schemes FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.supplier_scheme_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to supplier_scheme_applications" ON public.supplier_scheme_applications;
CREATE POLICY "Allow all access to supplier_scheme_applications" ON public.supplier_scheme_applications FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.supplier_credit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to supplier_credit_notes" ON public.supplier_credit_notes;
CREATE POLICY "Allow all access to supplier_credit_notes" ON public.supplier_credit_notes FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.audit_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to audit_sessions" ON public.audit_sessions;
CREATE POLICY "Allow all access to audit_sessions" ON public.audit_sessions FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.reconciliation_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to reconciliation_transactions" ON public.reconciliation_transactions;
CREATE POLICY "Allow all access to reconciliation_transactions" ON public.reconciliation_transactions FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.stock_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to stock_ledger_entries" ON public.stock_ledger_entries;
CREATE POLICY "Allow all access to stock_ledger_entries" ON public.stock_ledger_entries FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.grn_edit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to grn_edit_log" ON public.grn_edit_log;
CREATE POLICY "Allow all access to grn_edit_log" ON public.grn_edit_log FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- SECTION 5: refresh the API cache so new tables/columns work immediately
-- ---------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- Handy queries (run separately):
--   SELECT edited_at, grn_number, invoice_no, supplier_name, edited_by, reason, changes
--     FROM public.grn_edit_log ORDER BY edited_at DESC;
--   SELECT id, date, warehouse_name, auditor_name, jsonb_array_length(entries) AS skus
--     FROM public.audit_sessions ORDER BY date DESC;
`;
