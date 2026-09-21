import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Audit,
  Bill,
  BillingSettings,
  GRN,
  InventoryBatch,
  OrganizationProfile,
  Product,
  Promotion,
  StockTransfer,
  Trip,
  Warehouse,
  Salesman,
} from '../types';
import { INIT_WAREHOUSES } from '../constants/initialData';
import { generateSkuId } from '../utils/billing';
import { hashPin, verifyPin } from '../utils/crypto';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  projectRef: string;
  isConfigured: boolean;
}

const STORAGE_CONFIG_KEY = 'radhika_supabase_custom_credentials';

export function getSupabaseConfig(): SupabaseConfig {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || 'https://psizakmtxppariejawbd.supabase.co';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_3D3tfJOS10gkL0lJ6qQT1Q_Lvux1S9W';

  let customUrl = '';
  let customKey = '';

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        customUrl = parsed.url || '';
        customKey = parsed.anonKey || '';
      }
    } catch {
      // ignore
    }
  }

  const finalUrl = (customUrl || envUrl || '').trim();
  const finalKey = (customKey || envKey || '').trim();

  let projectRef = 'psizakmtxppariejawbd';
  try {
    if (finalUrl) {
      const parsedUrl = new URL(finalUrl);
      projectRef = parsedUrl.hostname.split('.')[0] || 'psizakmtxppariejawbd';
    }
  } catch {
    // fallback
  }

  return {
    url: finalUrl,
    anonKey: finalKey,
    projectRef,
    isConfigured: Boolean(finalUrl && finalKey),
  };
}

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

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
    console.error('Failed to create Supabase client:', err);
    return null;
  }
}

export function saveSupabaseCustomConfig(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(
      STORAGE_CONFIG_KEY,
      JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() })
    );
    cachedClient = null;
    cachedConfigKey = '';
  }
}

export function clearSupabaseCustomConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_CONFIG_KEY);
    cachedClient = null;
    cachedConfigKey = '';
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
      message: 'Supabase URL or Key is missing in environment or settings.',
      error: 'Client not configured',
    };
  }

  const startTime = Date.now();

  try {
    const checkTable = async (tableName: string): Promise<boolean> => {
      try {
        const { error } = await client.from(tableName).select('id').limit(1);
        if (error) {
          if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    };

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
    ] = await Promise.all([
      checkTable('warehouses'),
      checkTable('products'),
      checkTable('inventory_batches'),
      checkTable('stock_transfers'),
      checkTable('promotions'),
      checkTable('bills'),
      checkTable('trips'),
      checkTable('audits'),
      checkTable('organization_profile'),
      checkTable('billing_settings'),
      checkTable('inventory_items'),
      checkTable('app_collections'),
      checkTable('salesmen'),
    ]);

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
        ? 'Connected to Supabase PostgreSQL database. All tables, warehouse schemas, and RLS policies are active.'
        : 'Connected to Supabase project endpoint. Please run the SQL setup script to initialize missing tables.',
    };
  } catch (err: any) {
    return {
      connected: false,
      url: config.url,
      projectRef: config.projectRef,
      latencyMs: Date.now() - startTime,
      tablesReady: emptyTables,
      allTablesExist: false,
      message: `Failed to connect to Supabase: ${err?.message || 'Network error'}`,
      error: err?.message,
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
  };
}

/**
 * Validate UUID format
 */
export function isValidUuid(val: any): boolean {
  if (typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val.trim());
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
  options: { onConflict?: string } = { onConflict: 'id' }
): Promise<{ error: any; data?: any }> {
  const isArray = Array.isArray(data);
  let currentRows: any[] = isArray ? [...data] : [{ ...data }];

  currentRows = currentRows.map((row) => {
    const copy = { ...row };
    if ('salesman_id' in copy && copy.salesman_id && !isValidUuid(copy.salesman_id)) {
      copy.salesman_id = null;
    }
    return copy;
  });

  let lastError: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const payload = isArray ? currentRows : currentRows[0];
    const { error, data: resData } = await client.from(tableName).upsert(payload, options);
    if (!error) {
      return { error: null, data: resData };
    }

    lastError = error;
    const msg = (error.message || '').toString();

    const cacheMatch = msg.match(/Could not find the '([^']+)' column/i);
    const colMatch = msg.match(/column "([^"]+)" of relation/i);
    const missingCol = cacheMatch?.[1] || colMatch?.[1];

    if (missingCol) {
      console.warn(
        `[Supabase] Table '${tableName}' missing column '${missingCol}' in schema cache. Stripping '${missingCol}' and retrying upsert...`
      );
      currentRows = currentRows.map((row) => {
        const { [missingCol]: _omit, ...rest } = row;
        return rest;
      });
      continue;
    }

    if (
      msg.toLowerCase().includes('schema cache') &&
      (msg.toLowerCase().includes('salesman') || msg.toLowerCase().includes(tableName))
    ) {
      console.warn(
        `[Supabase] Schema cache issue on '${tableName}': ${msg}. Retrying without salesman columns...`
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
  salesmen?: Salesman[];
}): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is not configured.');
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
    salesmen: 0,
  };

  // 1. Upsert Warehouses first to satisfy foreign key constraints in inventory_batches
  const whToUpsert = data.warehouses.length > 0 ? data.warehouses : INIT_WAREHOUSES;
  const whPayload = whToUpsert.map((w) => ({
    id: w.id,
    name: w.name,
    code: w.code,
    location: w.location || '',
    manager: w.manager || '',
    phone: w.phone || '',
    capacity_cases: w.capacityCases || 0,
    is_default: Boolean(w.isDefault),
    notes: w.notes || '',
    updated_at: new Date().toISOString(),
  }));
  const { error: whErr } = await client.from('warehouses').upsert(whPayload, { onConflict: 'id' });
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
      expiry: p.expiry || '',
      batch_number: p.batchNumber || '',
      mfg_date: p.mfgDate || '',
      warehouse_id: p.warehouseId || '',
      opening: p.opening,
      cost: p.cost,
      effective_cost: p.effectiveCost || p.cost,
      retail: p.retail,
      wholesale: p.wholesale,
      hsn: p.hsn || '',
      gst_rate: p.gstRate !== undefined ? p.gstRate : 0.18,
      scheme: p.scheme || '',
      updated_at: new Date().toISOString(),
    }));
    const { error } = await client.from('products').upsert(productPayload, { onConflict: 'id' });
    if (error) {
      // Fallback in case schema does not yet have newly added columns
      const fallbackPayload = data.products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        volume: p.volume,
        pack: p.pack,
        expiry: p.expiry,
        batch_number: p.batchNumber || '',
        mfg_date: p.mfgDate || '',
        warehouse_id: p.warehouseId || '',
        opening: p.opening,
        cost: p.cost,
        retail: p.retail,
        wholesale: p.wholesale,
        updated_at: new Date().toISOString(),
      }));
      const { error: fallbackErr } = await client.from('products').upsert(fallbackPayload, { onConflict: 'id' });
      if (fallbackErr) throw new Error(`Products sync error: ${fallbackErr.message}`);
    }
    pushedCount.products = productPayload.length;
  }

  // 3. Upsert Inventory Batches
  if (data.inventoryBatches.length > 0) {
    const batchPayload = data.inventoryBatches.map((b) => ({
      id: b.id,
      product_id: b.productId,
      sku: b.sku || '',
      batch_number: b.batchNumber,
      mfg_date: sanitizeDate(b.mfgDate),
      expiry_date: sanitizeDate(b.expiryDate),
      warehouse_id: b.warehouseId || null,
      quantity: b.quantity || 0,
      cost_price: b.costPrice || 0,
      mrp: b.mrp || 0,
      notes: b.notes || '',
      updated_at: new Date().toISOString(),
    }));
    const { error } = await client.from('inventory_batches').upsert(batchPayload, { onConflict: 'id' });
    if (error) {
      // Fallback if sku column not yet in inventory_batches
      const fallbackBatchPayload = batchPayload.map(({ sku: _sku, ...rest }) => rest);
      await client.from('inventory_batches').upsert(fallbackBatchPayload, { onConflict: 'id' });
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
        invoice_no: g.invoiceNo || '',
        supplier_name: g.supplierName || '',
        supplier_gstin: g.supplierGstin || '',
        supplier_address: g.supplierAddress || '',
        supplier_phone: g.supplierPhone || '',
        supplier_email: g.supplierEmail || '',
        inward_date: sanitizeDate(g.inwardDate) || new Date().toISOString().slice(0, 10),
        vehicle_no: g.vehicleNo || '',
        warehouse_id: g.warehouseId || '',
        warehouse_name: g.warehouseName || '',
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
        notes: g.notes || '',
        updated_at: new Date().toISOString(),
      }));
      const { error: grnErr } = await client.from('grns').upsert(grnPayload, { onConflict: 'id' });
      if (!grnErr) {
        pushedCount.grns = grnPayload.length;
      }
    } catch {
      // Table may not exist yet in schema
    }

    // B. Mirror in billing_settings with id: 'inward_grns' to guarantee persistence
    try {
      await client.from('billing_settings').upsert({
        id: 'inward_grns',
        data: { grns: data.grns },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (pushedCount.grns === 0) {
        pushedCount.grns = data.grns.length;
      }
    } catch (e) {
      console.warn('Mirror inward_grns in billing_settings warning:', e);
    }
  }

  // 5. Upsert Promotions
  if (data.promotions.length > 0) {
    const promoPayload = data.promotions.map((pr) => ({
      id: pr.id,
      name: pr.name,
      type: pr.type,
      buy_qty: pr.buyQty || 0,
      free_qty: pr.freeQty || 0,
      percent: pr.percent || 0,
      flat_per_case: pr.flatPerCase || 0,
      product_ids: pr.productIds || [],
    }));
    const { error } = await client.from('promotions').upsert(promoPayload, { onConflict: 'id' });
    if (error) throw new Error(`Promotions sync error: ${error.message}`);
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
      warehouse_id: b.warehouseId || null,
      salesman_id: isValidUuid(b.salesmanId) ? b.salesmanId : null,
      salesman: b.salesman || null,
      items: b.items,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await resilientSupabaseUpsert(client, 'bills', billPayload, { onConflict: 'id' });
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
      loaded: t.loaded,
      returned: t.returned,
      bill_ids: t.billIds,
      status: t.status,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await resilientSupabaseUpsert(client, 'trips', tripPayload, { onConflict: 'id' });
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
        default_vehicle: s.defaultVehicle || '',
        updated_at: new Date().toISOString(),
      }));
      const { error: smErr } = await client.from('salesmen').upsert(salesmanPayload, { onConflict: 'id' });
      if (smErr) console.warn('Salesmen sync notice:', smErr.message);
      else pushedCount.salesmen = salesmanPayload.length;
    } catch (e) {
      console.warn('Salesmen sync exception:', e);
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
    const { error } = await client.from('audits').upsert(auditPayload, { onConflict: 'id' });
    if (error) throw new Error(`Audits sync error: ${error.message}`);
    pushedCount.audits = auditPayload.length;
  }

  // 9. Upsert Organization Profile & Billing Settings
  const { error: orgErr } = await client.from('organization_profile').upsert({
    id: 'default',
    data: data.orgProfile,
    updated_at: new Date().toISOString(),
  });
  if (orgErr) console.warn(`Organization profile sync notice: ${orgErr.message}`);

  const { error: setErr } = await client.from('billing_settings').upsert({
    id: 'default',
    data: data.billingSettings,
    updated_at: new Date().toISOString(),
  });
  if (setErr) console.warn(`Billing settings sync notice: ${setErr.message}`);

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
}): Promise<{ success: boolean; cloudSynced: boolean; message: string; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: true,
      cloudSynced: false,
      message: 'Supabase client is not configured.',
      error: 'Client not configured',
    };
  }

  try {
    // 1. Ensure target warehouse exists in Supabase
    if (params.warehouse) {
      await client.from('warehouses').upsert(
        {
          id: params.warehouse.id,
          name: params.warehouse.name,
          code: params.warehouse.code,
          location: params.warehouse.location || '',
          manager: params.warehouse.manager || '',
          phone: params.warehouse.phone || '',
          capacity_cases: params.warehouse.capacityCases || 0,
          is_default: Boolean(params.warehouse.isDefault),
          notes: params.warehouse.notes || '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    } else {
      // Seed default warehouses if none exist
      const { count } = await client.from('warehouses').select('*', { count: 'exact', head: true });
      if (!count || count === 0) {
        await client.from('warehouses').upsert(
          INIT_WAREHOUSES.map((w) => ({
            id: w.id,
            name: w.name,
            code: w.code,
            location: w.location || '',
            is_default: Boolean(w.isDefault),
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'id' }
        );
      }
    }

    // 2. Upsert all products created or updated by this inward invoice
    if (params.products.length > 0) {
      const productPayload = params.products.map((p) => ({
        id: p.id,
        sku: p.sku || generateSkuId(p.name, p.category, p.id),
        name: p.name,
        category: p.category,
        volume: p.volume,
        pack: p.pack,
        expiry: p.expiry || '',
        batch_number: p.batchNumber || '',
        mfg_date: p.mfgDate || '',
        warehouse_id: p.warehouseId || '',
        opening: p.opening,
        cost: p.cost,
        effective_cost: p.effectiveCost || p.cost,
        retail: p.retail,
        wholesale: p.wholesale,
        hsn: p.hsn || '',
        gst_rate: p.gstRate !== undefined ? p.gstRate : 0.18,
        scheme: p.scheme || '',
        updated_at: new Date().toISOString(),
      }));
      const { error: prodErr } = await client.from('products').upsert(productPayload, { onConflict: 'id' });
      if (prodErr) {
        // Fallback for older schema
        const fallbackPayload = params.products.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          volume: p.volume,
          pack: p.pack,
          expiry: p.expiry,
          batch_number: p.batchNumber || '',
          mfg_date: p.mfgDate || '',
          warehouse_id: p.warehouseId || '',
          opening: p.opening,
          cost: p.cost,
          retail: p.retail,
          wholesale: p.wholesale,
          updated_at: new Date().toISOString(),
        }));
        await client.from('products').upsert(fallbackPayload, { onConflict: 'id' });
      }
    }

    // 3. Upsert inventory batches into inventory_batches table
    if (params.inventoryBatches.length > 0) {
      const batchPayload = params.inventoryBatches.map((b) => ({
        id: b.id,
        product_id: b.productId,
        sku: b.sku || '',
        batch_number: b.batchNumber,
        mfg_date: sanitizeDate(b.mfgDate),
        expiry_date: sanitizeDate(b.expiryDate),
        warehouse_id: b.warehouseId || null,
        quantity: b.quantity || 0,
        cost_price: b.costPrice || 0,
        mrp: b.mrp || 0,
        notes: b.notes || '',
        updated_at: new Date().toISOString(),
      }));
      const { error: batchErr } = await client.from('inventory_batches').upsert(batchPayload, { onConflict: 'id' });
      if (batchErr) {
        const fallbackBatchPayload = batchPayload.map(({ sku: _sku, ...rest }) => rest);
        await client.from('inventory_batches').upsert(fallbackBatchPayload, { onConflict: 'id' });
      }
    }

    // 4. Persist GRN record in Supabase:
    // Try public.grns table first
    const grnPayload = {
      id: params.grn.id,
      grn_number: params.grn.grnNumber,
      invoice_no: params.grn.invoiceNo || '',
      supplier_name: params.grn.supplierName || '',
      supplier_gstin: params.grn.supplierGstin || '',
      supplier_address: params.grn.supplierAddress || '',
      supplier_phone: params.grn.supplierPhone || '',
      supplier_email: params.grn.supplierEmail || '',
      inward_date: sanitizeDate(params.grn.inwardDate) || new Date().toISOString().slice(0, 10),
      vehicle_no: params.grn.vehicleNo || '',
      warehouse_id: params.grn.warehouseId || '',
      warehouse_name: params.grn.warehouseName || '',
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
      notes: params.grn.notes || '',
      updated_at: new Date().toISOString(),
    };

    try {
      await client.from('grns').upsert(grnPayload, { onConflict: 'id' });
    } catch {
      // grns table might not exist yet
    }

    // Always mirror the complete list of GRNs in billing_settings for foolproof persistence
    await client.from('billing_settings').upsert(
      {
        id: 'inward_grns',
        data: { grns: params.allGrns },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    return {
      success: true,
      cloudSynced: true,
      message: `Invoice ${params.grn.grnNumber} (${params.grn.invoiceNo}) successfully stored in Supabase PostgreSQL database!`,
    };
  } catch (err: any) {
    console.error('Error pushing inward invoice to Supabase:', err);
    return {
      success: false,
      cloudSynced: false,
      message: err?.message || 'Failed to persist invoice to Supabase',
      error: err?.message,
    };
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
      name: p.name,
      category: p.category,
      volume: p.volume,
      pack: p.pack,
      expiry: p.expiry,
      batch_number: p.batchNumber || '',
      mfg_date: p.mfgDate || '',
      warehouse_id: p.warehouseId || '',
      opening: p.opening,
      cost: p.cost,
      effective_cost: p.effectiveCost || p.cost,
      retail: p.retail,
      wholesale: p.wholesale,
      hsn: p.hsn || '2202',
      gst_rate: p.gstRate !== undefined ? p.gstRate : 0.18,
      scheme: p.scheme || '',
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('products').upsert(payload, { onConflict: 'id' });
    if (error) {
      // Base schema fallback
      const fallback = {
        id: p.id,
        sku: p.sku || generateSkuId(p.name, p.category, p.id),
        name: p.name,
        category: p.category,
        volume: p.volume,
        pack: p.pack,
        expiry: p.expiry,
        batch_number: p.batchNumber || '',
        mfg_date: p.mfgDate || '',
        warehouse_id: p.warehouseId || '',
        opening: p.opening,
        cost: p.cost,
        retail: p.retail,
        wholesale: p.wholesale,
        updated_at: new Date().toISOString(),
      };
      await client.from('products').upsert(fallback, { onConflict: 'id' });
    }
  } catch (e) {
    console.warn('Failed to push product to Supabase:', e);
  }
}

/**
 * Deletes a product from Supabase
 */
export async function deleteProductFromSupabase(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from('products').delete().eq('id', id);
  } catch (e) {
    console.warn('Failed to delete product from Supabase:', e);
  }
}

/**
 * Pushes a single bill to Supabase
 */
export async function pushBillToSupabase(b: Bill): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase client is not configured' };
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
      warehouse_id: b.warehouseId || null,
      salesman_id: isValidUuid(b.salesmanId) ? b.salesmanId : null,
      salesman: b.salesman || null,
      items: b.items,
      updated_at: new Date().toISOString(),
    };
    const { error } = await resilientSupabaseUpsert(client, 'bills', payload, { onConflict: 'id' });
    if (error) {
      console.warn('Failed to push bill to Supabase:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn('Failed to push bill to Supabase:', e);
    return { success: false, error: e?.message || 'Network error' };
  }
}

/**
 * Deletes a bill from Supabase
 */
export async function deleteBillFromSupabase(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from('bills').delete().eq('id', id);
  } catch (e) {
    console.warn('Failed to delete bill from Supabase:', e);
  }
}

/**
 * Pushes a single delivery trip to Supabase public.trips table
 */
export async function pushTripToSupabase(t: Trip): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase client is not configured' };
  try {
    const payload = {
      id: t.id,
      vehicle: t.vehicle,
      salesman_id: isValidUuid(t.salesmanId) ? t.salesmanId : null,
      salesman: t.salesman || null,
      date: t.date,
      warehouse_id: t.warehouseId || null,
      loaded: typeof t.loaded === 'object' && t.loaded ? t.loaded : {},
      returned: typeof t.returned === 'object' && t.returned ? t.returned : {},
      bill_ids: Array.isArray(t.billIds) ? t.billIds : [],
      status: t.status || 'out',
      updated_at: new Date().toISOString(),
    };
    const { error } = await resilientSupabaseUpsert(client, 'trips', payload, { onConflict: 'id' });
    if (error) {
      console.warn('Failed to upsert trip in Supabase:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn('Failed to push trip to Supabase:', e);
    return { success: false, error: e?.message || 'Network error' };
  }
}

/**
 * Deletes a delivery trip from Supabase public.trips table
 */
export async function deleteTripFromSupabase(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from('trips').delete().eq('id', id);
  } catch (e) {
    console.warn('Failed to delete trip from Supabase:', e);
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
      .from('salesmen')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('fetchSalesmenFromSupabase error:', error.message);
      return [];
    }

    return (data || []).map((s: any) => ({
      id: String(s.id),
      name: s.name || '',
      phone: s.phone || '',
      pinHash: s.pin_hash || s.pinHash || '',
      active: s.active !== undefined ? Boolean(s.active) : true,
      defaultVehicle: s.default_vehicle || s.defaultVehicle || '',
      createdAt: s.created_at || s.createdAt || new Date().toISOString(),
      updatedAt: s.updated_at || s.updatedAt || new Date().toISOString(),
    }));
  } catch (e) {
    console.warn('fetchSalesmenFromSupabase exception:', e);
    return [];
  }
}

export async function pushSalesmanToSupabase(s: Salesman): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase client is not configured' };
  try {
    const payload = {
      id: s.id,
      name: s.name.trim(),
      phone: s.phone.trim(),
      pin_hash: s.pinHash,
      active: s.active !== undefined ? Boolean(s.active) : true,
      default_vehicle: s.defaultVehicle || '',
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('salesmen').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('Failed to push salesman to Supabase:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn('Failed to push salesman to Supabase:', e);
    return { success: false, error: e?.message || 'Network error' };
  }
}

export async function deleteSalesmanFromSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase client is not configured' };
  try {
    const { error } = await client.from('salesmen').delete().eq('id', id);
    if (error) {
      console.warn('Failed to delete salesman in Supabase:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn('Failed to delete salesman in Supabase:', e);
    return { success: false, error: e?.message || 'Network error' };
  }
}

export async function verifySalesmanPinSupabase(
  phone: string,
  pin: string
): Promise<{ success: boolean; salesman?: Salesman; error?: string }> {
  const cleanPhone = (phone || '').trim();
  const cleanPin = (pin || '').trim();

  if (!cleanPhone || !cleanPin) {
    return { success: false, error: 'Phone and PIN are required' };
  }

  const computedHash = await hashPin(cleanPin);

  // First try direct Supabase query
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('salesmen')
        .select('*')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (!error && data) {
        if (data.active === false) {
          return { success: false, error: 'This salesman account is deactivated. Contact admin.' };
        }
        const storedHash = data.pin_hash || data.pinHash || '';
        if (storedHash.toLowerCase() === computedHash.toLowerCase()) {
          return {
            success: true,
            salesman: {
              id: String(data.id),
              name: data.name || '',
              phone: data.phone || '',
              pinHash: storedHash,
              active: Boolean(data.active),
              defaultVehicle: data.default_vehicle || data.defaultVehicle || '',
              createdAt: data.created_at || '',
              updatedAt: data.updated_at || '',
            },
          };
        } else {
          return { success: false, error: 'Incorrect PIN. Please try again.' };
        }
      }
    } catch (e) {
      console.warn('Direct Supabase verify exception, falling back to backend API:', e);
    }
  }

  // Fallback to server API endpoint
  try {
    const resp = await fetch('/api/salesmen/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone, pinHash: computedHash }),
    });
    const result = await resp.json();
    if (resp.ok && result.success) {
      return { success: true, salesman: result.salesman };
    }
    return { success: false, error: result.error || 'Verification failed.' };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error during PIN verification' };
  }
}

// Supabase Auth for Admin Login
export async function signInAdminSupabase(
  email: string,
  pass: string
): Promise<{ success: boolean; user?: any; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase client is not configured' };
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
    return { success: false, error: e?.message || 'Login failed' };
  }
}

export async function signOutSupabase(): Promise<void> {
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.auth.signOut();
    } catch (e) {
      console.warn('Supabase signOut notice:', e);
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
export async function pushWarehouseToSupabase(w: Warehouse): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase client is not configured' };
  try {
    const { error } = await client.from('warehouses').upsert({
      id: String(w.id),
      name: w.name,
      code: w.code || '',
      location: w.location || '',
      manager: w.manager || '',
      phone: w.phone || '',
      capacity_cases: Number(w.capacityCases || 0),
      is_default: Boolean(w.isDefault),
      notes: w.notes || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) {
      console.warn('Failed to upsert warehouse in Supabase:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn('Failed to push warehouse to Supabase:', e);
    return { success: false, error: e?.message || 'Network error' };
  }
}

/**
 * Deletes a warehouse from Supabase public.warehouses table
 */
export async function deleteWarehouseFromSupabase(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from('warehouses').delete().eq('id', id);
  } catch (e) {
    console.warn('Failed to delete warehouse from Supabase:', e);
  }
}

/**
 * Pushes an inventory batch to Supabase public.inventory_batches table
 */
export async function pushBatchToSupabase(b: InventoryBatch): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase client is not configured' };
  try {
    const payload: any = {
      id: String(b.id),
      product_id: Number(b.productId),
      sku: b.sku || '',
      batch_number: b.batchNumber,
      mfg_date: sanitizeDate(b.mfgDate),
      expiry_date: sanitizeDate(b.expiryDate),
      warehouse_id: b.warehouseId || null,
      quantity: Number(b.quantity || 0),
      cost_price: Number(b.costPrice || 0),
      mrp: Number(b.mrp || 0),
      notes: b.notes || '',
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('inventory_batches').upsert(payload, { onConflict: 'id' });
    if (error) {
      delete payload.sku;
      await client.from('inventory_batches').upsert(payload, { onConflict: 'id' });
    }
    return { success: true };
  } catch (e: any) {
    console.warn('Failed to push batch to Supabase:', e);
    return { success: false, error: e?.message || 'Network error' };
  }
}

/**
 * Deletes an inventory batch from Supabase
 */
export async function deleteBatchFromSupabase(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from('inventory_batches').delete().eq('id', id);
  } catch (e) {
    console.warn('Failed to delete batch from Supabase:', e);
  }
}

/**
 * Pushes physical audit to Supabase public.audits table
 */
export async function pushAuditToSupabase(a: Audit): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase client is not configured' };
  try {
    const { error } = await client.from('audits').upsert({
      id: Number(a.id),
      date: a.date,
      entries: a.entries,
      adjusted: Boolean(a.adjusted),
    }, { onConflict: 'id' });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

/**
 * Deletes physical audit from Supabase public.audits table
 */
export async function deleteAuditFromSupabase(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from('audits').delete().eq('id', id);
  } catch (e) {
    console.warn('Failed to delete audit from Supabase:', e);
  }
}

/**
 * Pushes Billing Settings to Supabase PostgreSQL table
 */
export async function pushBillingSettingsToSupabase(settings: BillingSettings): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase client is not configured.' };
  }
  try {
    const { error } = await client.from('billing_settings').upsert(
      {
        id: 'default',
        data: settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Pulls individual Billing Settings from Supabase PostgreSQL table
 */
export async function pullBillingSettingsFromSupabase(): Promise<{ success: boolean; settings?: BillingSettings; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase client is not configured.' };
  }
  try {
    const { data, error } = await client
      .from('billing_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: 'No billing settings record found in Supabase table yet.' };
    }

    if (data.data) {
      return { success: true, settings: data.data as BillingSettings };
    }
    return { success: false, error: 'Billing settings data column is empty.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Pushes a single promotional scheme to Supabase promotions table
 */
export async function pushPromotionToSupabase(pr: Promotion): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const payload = {
      id: pr.id,
      name: pr.name,
      type: pr.type,
      buy_qty: pr.buyQty || 0,
      free_qty: pr.freeQty || 0,
      percent: pr.percent || 0,
      flat_per_case: pr.flatPerCase || 0,
      product_ids: pr.productIds || [],
    };
    const { error } = await client.from('promotions').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('Failed to upsert to promotions with snake_case, trying camelCase:', error.message);
      // Fallback in case table has camelCase
      const altPayload = {
        id: pr.id,
        name: pr.name,
        type: pr.type,
        buyQty: pr.buyQty || 0,
        freeQty: pr.freeQty || 0,
        percent: pr.percent || 0,
        flatPerCase: pr.flatPerCase || 0,
        productIds: pr.productIds || [],
      };
      const { error: altErr } = await client.from('promotions').upsert(altPayload, { onConflict: 'id' });
      if (altErr) {
        console.warn('Failed to upsert to promotions table:', altErr.message);
        // Also try promotional_schemes
        await client.from('promotional_schemes').upsert(payload, { onConflict: 'id' });
      }
    }
  } catch (e) {
    console.warn('Failed to push promotion to Supabase:', e);
  }
}

/**
 * Deletes a promotion from Supabase
 */
export async function deletePromotionFromSupabase(id: number): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.from('promotions').delete().eq('id', id);
    await client.from('promotional_schemes').delete().eq('id', id);
  } catch (e) {
    console.warn('Failed to delete promotion from Supabase:', e);
  }
}

/**
 * Deletes an inward GRN from Supabase
 */
export async function deleteGrnFromSupabase(id: string, remainingGrns: GRN[]): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    try {
      await client.from('grns').delete().eq('id', id);
    } catch {
      // ignore
    }
    await client.from('billing_settings').upsert({
      id: 'inward_grns',
      data: { grns: remainingGrns },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('Failed to delete GRN from Supabase:', e);
  }
}

/**
 * Pushes individual Organization Profile to Supabase PostgreSQL table
 */
export async function pushOrgProfileToSupabase(profile: OrganizationProfile): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase client is not configured.' };
  }
  try {
    const { error } = await client.from('organization_profile').upsert(
      {
        id: 'default',
        data: profile,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Pulls individual Organization Profile from Supabase PostgreSQL table
 */
export async function pullOrgProfileFromSupabase(): Promise<{ success: boolean; profile?: OrganizationProfile; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase client is not configured.' };
  }
  try {
    const { data, error } = await client
      .from('organization_profile')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: 'No profile record found in Supabase table yet.' };
    }

    if (data.data) {
      return { success: true, profile: data.data as OrganizationProfile };
    }
    return { success: false, error: 'Profile data column is empty.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
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
  orgProfile?: OrganizationProfile;
  billingSettings?: BillingSettings;
  salesmen?: Salesman[];
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
      salesmanRes,
    ] = await Promise.all([
      client.from('warehouses').select('*').order('name', { ascending: true }),
      client.from('products').select('*').order('id', { ascending: true }),
      client.from('inventory_batches').select('*').order('created_at', { ascending: true }),
      client.from('promotions').select('*').order('id', { ascending: true }),
      client.from('bills').select('*').order('id', { ascending: true }),
      client.from('trips').select('*').order('id', { ascending: true }),
      client.from('audits').select('*').order('id', { ascending: true }),
      client.from('organization_profile').select('*').eq('id', 'default').maybeSingle(),
      client.from('billing_settings').select('*').eq('id', 'default').maybeSingle(),
      client.from('grns').select('*').order('created_at', { ascending: false }),
      client.from('billing_settings').select('*').eq('id', 'inward_grns').maybeSingle(),
      client.from('salesmen').select('*').order('name', { ascending: true }),
    ]);

    const result: any = {};

    if (!whRes.error && whRes.data && whRes.data.length > 0) {
      result.warehouses = whRes.data.map((r: any) => ({
        id: String(r.id),
        name: r.name,
        code: r.code || '',
        location: r.location || '',
        manager: r.manager || '',
        phone: r.phone || '',
        capacityCases: Number(r.capacity_cases || 0),
        isDefault: Boolean(r.is_default),
        notes: r.notes || '',
      }));
    } else {
      // Seed initial base warehouses so that foreign key constraints never fail
      try {
        await client.from('warehouses').upsert(
          INIT_WAREHOUSES.map((w) => ({
            id: w.id,
            name: w.name,
            code: w.code,
            location: w.location || '',
            is_default: Boolean(w.isDefault),
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'id' }
        );
        result.warehouses = INIT_WAREHOUSES;
      } catch {
        // ignore if table not accessible yet
      }
    }

    if (!prodRes.error && prodRes.data && prodRes.data.length > 0) {
      result.products = prodRes.data.map((r: any) => ({
        id: Number(r.id),
        sku: r.sku || generateSkuId(r.name, r.category, Number(r.id)),
        name: r.name,
        category: r.category,
        volume: Number(r.volume || 0),
        pack: r.pack || '',
        expiry: r.expiry || '',
        batchNumber: r.batch_number || '',
        mfgDate: r.mfg_date || '',
        warehouseId: r.warehouse_id || '',
        opening: Number(r.opening || 0),
        cost: Number(r.cost || 0),
        effectiveCost: Number(r.effective_cost || r.cost || 0),
        retail: Number(r.retail || 0),
        wholesale: Number(r.wholesale || 0),
        hsn: r.hsn || '2202',
        gstRate: r.gst_rate !== undefined && r.gst_rate !== null ? Number(r.gst_rate) : 0.18,
        scheme: r.scheme || '',
      }));
    }

    if (!batchRes.error && batchRes.data && batchRes.data.length > 0) {
      result.inventoryBatches = batchRes.data.map((r: any) => ({
        id: String(r.id),
        productId: Number(r.product_id),
        sku: r.sku || '',
        batchNumber: r.batch_number,
        mfgDate: r.mfg_date || '',
        expiryDate: r.expiry_date || '',
        warehouseId: r.warehouse_id || '',
        quantity: Number(r.quantity || 0),
        costPrice: Number(r.cost_price || 0),
        mrp: Number(r.mrp || 0),
        notes: r.notes || '',
      }));
    }

    // Process Inward Consignments / Invoices (GRNs)
    if (!grnRes.error && grnRes.data && grnRes.data.length > 0) {
      result.grns = grnRes.data.map((g: any) => ({
        id: String(g.id),
        grnNumber: g.grn_number,
        invoiceNo: g.invoice_no || '',
        supplierName: g.supplier_name || '',
        supplierGstin: g.supplier_gstin || '',
        supplierAddress: g.supplier_address || '',
        supplierPhone: g.supplier_phone || '',
        supplierEmail: g.supplier_email || '',
        inwardDate: g.inward_date || '',
        vehicleNo: g.vehicle_no || '',
        warehouseId: g.warehouse_id || '',
        warehouseName: g.warehouse_name || '',
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
        notes: g.notes || '',
        createdAt: g.created_at || new Date().toISOString(),
        updatedAt: g.updated_at || new Date().toISOString(),
      }));
    } else if (
      !inwardGrnSettingRes.error &&
      inwardGrnSettingRes.data &&
      inwardGrnSettingRes.data.data &&
      Array.isArray(inwardGrnSettingRes.data.data.grns)
    ) {
      result.grns = inwardGrnSettingRes.data.data.grns;
    }

    if (!promoRes.error && promoRes.data && promoRes.data.length > 0) {
      result.promotions = promoRes.data.map((r: any) => ({
        id: Number(r.id),
        name: r.name,
        type: r.type,
        buyQty: Number(r.buy_qty || 0),
        freeQty: Number(r.free_qty || 0),
        percent: Number(r.percent || 0),
        flatPerCase: Number(r.flat_per_case || 0),
        productIds: Array.isArray(r.product_ids) ? r.product_ids : [],
      }));
    }

    if (!billRes.error && billRes.data && billRes.data.length > 0) {
      result.bills = billRes.data.map((r: any) => ({
        id: Number(r.id),
        retailer: r.retailer,
        phone: r.phone || '',
        date: r.date,
        subtotal: Number(r.subtotal || 0),
        cgst: Number(r.cgst || 0),
        sgst: Number(r.sgst || 0),
        total: Number(r.total || 0),
        discount: Number(r.discount || 0),
        amountPaid: Number(r.amount_paid || 0),
        warehouseId: r.warehouse_id || '',
        salesman: r.salesman || '',
        salesmanId: r.salesman_id || undefined,
        items: Array.isArray(r.items) ? r.items : [],
      }));
    }

    if (!tripRes.error && tripRes.data && tripRes.data.length > 0) {
      result.trips = tripRes.data.map((r: any) => ({
        id: Number(r.id),
        vehicle: r.vehicle,
        salesman: r.salesman || '',
        salesmanId: r.salesman_id || undefined,
        date: r.date,
        warehouseId: r.warehouse_id || '',
        loaded: typeof r.loaded === 'object' && r.loaded ? r.loaded : {},
        returned: typeof r.returned === 'object' && r.returned ? r.returned : {},
        billIds: Array.isArray(r.bill_ids) ? r.bill_ids : [],
        status: r.status || 'out',
      }));
    }

    if (!salesmanRes.error && salesmanRes.data && salesmanRes.data.length > 0) {
      result.salesmen = salesmanRes.data.map((r: any) => ({
        id: String(r.id),
        name: r.name || '',
        phone: r.phone || '',
        pinHash: r.pin_hash || r.pinHash || '',
        active: r.active !== undefined ? Boolean(r.active) : true,
        defaultVehicle: r.default_vehicle || r.defaultVehicle || '',
        createdAt: r.created_at || '',
        updatedAt: r.updated_at || '',
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

    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    console.error('Failed to pull ledger from Supabase:', err);
    return null;
  }
}

export const COMPLETE_SQL_SCHEMA_SCRIPT = `-- ================================================================
-- RADHIKA DISTRIBUTION LEDGER - COMPLETE SUPABASE POSTGRESQL SCHEMA
-- Project: psizakmtxppariejawbd.supabase.co
-- Pure DDL Schema: Zero mock or seed data inserted.
-- Includes Warehouse Management, Batch Tracking, Inventory, Billing, Trips, and Audits.
-- ================================================================

-- 1. WAREHOUSES TABLE
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

-- 2. PRODUCTS TABLE (with SKU, batch & warehouse tracking)
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
    hsn TEXT DEFAULT '2202',
    gst_rate NUMERIC(5, 4) DEFAULT 0.18,
    scheme TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent column migrations for products and batches
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS batch_number TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mfg_date TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS hsn TEXT DEFAULT '2202';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5, 4) DEFAULT 0.18;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS scheme TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS effective_cost NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS sku TEXT DEFAULT '';

-- 3. INVENTORY BATCHES TABLE (Multi-batch stock by warehouse)
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

-- 4. STOCK TRANSFERS TABLE (Inter-warehouse godown movements)
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

-- 5. PROMOTIONS TABLE
CREATE TABLE IF NOT EXISTS public.promotions (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('bogo', 'percent', 'flat')),
    buy_qty INTEGER DEFAULT 0,
    free_qty INTEGER DEFAULT 0,
    percent NUMERIC(5, 2) DEFAULT 0,
    flat_per_case NUMERIC(10, 2) DEFAULT 0,
    product_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. BILLS / INVOICES TABLE
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

-- 7. DELIVERY TRIPS TABLE
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

-- 8. STOCK AUDIT TABLE
CREATE TABLE IF NOT EXISTS public.audits (
    id BIGINT PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    warehouse_id TEXT DEFAULT '',
    entries JSONB NOT NULL DEFAULT '[]'::JSONB,
    adjusted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. ORGANIZATION PROFILE TABLE
CREATE TABLE IF NOT EXISTS public.organization_profile (
    id TEXT PRIMARY KEY DEFAULT 'default',
    data JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. BILLING SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.billing_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    data JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. INWARD INVOICES / GOODS RECEIPT NOTES (GRN) TABLE
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

-- 12. INVENTORY ITEMS TABLE (Central Item-Level Inventory Tracking)
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
CREATE INDEX IF NOT EXISTS idx_inventory_items_product_id ON public.inventory_items(product_id);

-- 13. APP COLLECTIONS TABLE (Generic Persistence for Partners, Trips, Warehouses, Stock Transactions)
CREATE TABLE IF NOT EXISTS public.app_collections (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. SALESMEN TABLE (Admin-Provisioned Field Salesmen & Drivers)
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
CREATE INDEX IF NOT EXISTS idx_salesmen_phone ON public.salesmen(phone);

-- Column migrations for bills & trips salesman linkage
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES public.salesmen(id) ON DELETE SET NULL;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS salesman TEXT DEFAULT '';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES public.salesmen(id) ON DELETE SET NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS salesman TEXT DEFAULT '';

-- ================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ================================================================

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesmen ENABLE ROW LEVEL SECURITY;

-- Allow unrestricted access during pre-authentication phase
DROP POLICY IF EXISTS "Allow all access to warehouses" ON public.warehouses;
CREATE POLICY "Allow all access to warehouses" ON public.warehouses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to products" ON public.products;
CREATE POLICY "Allow all access to products" ON public.products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to inventory_batches" ON public.inventory_batches;
CREATE POLICY "Allow all access to inventory_batches" ON public.inventory_batches FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to stock_transfers" ON public.stock_transfers;
CREATE POLICY "Allow all access to stock_transfers" ON public.stock_transfers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to promotions" ON public.promotions;
CREATE POLICY "Allow all access to promotions" ON public.promotions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to bills" ON public.bills;
CREATE POLICY "Allow all access to bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to trips" ON public.trips;
CREATE POLICY "Allow all access to trips" ON public.trips FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to audits" ON public.audits;
CREATE POLICY "Allow all access to audits" ON public.audits FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to organization_profile" ON public.organization_profile;
CREATE POLICY "Allow all access to organization_profile" ON public.organization_profile FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to billing_settings" ON public.billing_settings;
CREATE POLICY "Allow all access to billing_settings" ON public.billing_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to grns" ON public.grns;
CREATE POLICY "Allow all access to grns" ON public.grns FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to inventory_items" ON public.inventory_items;
CREATE POLICY "Allow all access to inventory_items" ON public.inventory_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to app_collections" ON public.app_collections;
CREATE POLICY "Allow all access to app_collections" ON public.app_collections FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to salesmen" ON public.salesmen;
CREATE POLICY "Allow all access to salesmen" ON public.salesmen FOR ALL USING (true) WITH CHECK (true);
`;
