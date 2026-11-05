/**
 * The database table `public.bills` has a column for each of the main bill fields, but a Bill carries many more
 * (invoice discount, round-off, invoice type, payment mode / date / note, trip link, customer id, ...). Those were
 * never stored in the database, so a bill reloaded from it (new device, empty server copy) lost them and its totals
 * and GST no longer matched. They are now saved together in one JSON column, `extra`, and merged back on load.
 */
const BILL_COLUMN_FIELDS = new Set([
  'id', 'retailer', 'phone', 'date', 'subtotal', 'cgst', 'sgst', 'total', 'discount', 'amountPaid',
  'cancellation', 'returns', 'cancelledReturns', 'editHistory', 'warehouseId', 'salesmanId', 'salesman',
  'supplyType', 'customerGstin', 'isRetrospective', 'items',
]);

/** Everything on a bill that has no column of its own (null when there is nothing extra). */
export function billExtraFields(b: any): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b || {})) {
    if (BILL_COLUMN_FIELDS.has(k) || v === undefined || typeof v === 'function') continue;
    if (/^[a-z]+(_[a-z]+)+$/.test(k)) continue; // snake_case duplicates added while talking to the database
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Puts the saved extra fields back on a bill loaded from the database. Real columns always win. */
export function applyBillExtra<T extends Record<string, any>>(bill: T, extra: unknown): T {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return bill;
  const merged: Record<string, any> = { ...bill };
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    if (BILL_COLUMN_FIELDS.has(k)) continue;
    if (merged[k] === undefined) merged[k] = v;
  }
  return merged as T;
}

/**
 * Same idea for GRNs: the `grns` table has a column for the main fields only. Everything else on a GRN (place of
 * supply, billed-to / shipped-to, overall discount, import warnings, stock-posted flag, ...) goes into `extra`.
 */
const GRN_COLUMN_FIELDS = new Set([
  'id', 'grnNumber', 'invoiceNo', 'supplierName', 'supplierGstin', 'supplierAddress', 'supplierPhone', 'supplierEmail',
  'inwardDate', 'vehicleNo', 'warehouseId', 'warehouseName', 'items', 'totalBilledQty', 'totalFreeQty', 'totalPaidQty',
  'totalReceivedQty', 'totalTaxable', 'totalCgst', 'totalSgst', 'totalTax', 'grandTotal', 'inwardCosts',
  'totalInwardCost', 'inwardCostPerCrate', 'notes', 'editHistory', 'createdAt', 'updatedAt',
]);

export function grnExtraFields(g: any): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(g || {})) {
    if (GRN_COLUMN_FIELDS.has(k) || v === undefined || typeof v === 'function') continue;
    if (/^[a-z]+(_[a-z]+)+$/.test(k)) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function applyGrnExtra<T extends Record<string, any>>(grn: T, extra: unknown): T {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return grn;
  const merged: Record<string, any> = { ...grn };
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    if (GRN_COLUMN_FIELDS.has(k)) continue;
    if (merged[k] === undefined) merged[k] = v;
  }
  return merged as T;
}

/**
 * Products: the `products` table has columns for the main fields only. These product-master fields never had one,
 * so they were never saved to the cloud and a refresh let the (empty) cloud copy overwrite the local value.
 * They now travel together in the `extra` JSON column.
 */
export const PRODUCT_EXTRA_KEYS = [
  'unitsPerCrate', 'brand', 'returnable', 'active', 'ratesIncludeGst', 'barcode', 'depositPerUnit',
] as const;

/** The product-master fields to save in `extra` (null when the product has none set). */
export function productExtraFields(p: any): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const k of PRODUCT_EXTRA_KEYS) {
    const v = p?.[k];
    if (v === undefined || v === null) continue;
    if (k === 'unitsPerCrate' && !(Number(v) > 0)) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Puts the saved product-master fields back on a product loaded from the database. */
export function applyProductExtra<T extends Record<string, any>>(product: T, extra: unknown): T {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return product;
  const merged: Record<string, any> = { ...product };
  for (const k of PRODUCT_EXTRA_KEYS) {
    const v = (extra as Record<string, unknown>)[k];
    if (v !== undefined && v !== null) merged[k] = v;
  }
  return merged as T;
}

/**
 * After merging a cloud copy with this device's copy: for each product-master field, if the CLOUD copy has no value
 * but this device does, keep the local value. (A cloud value, when there is one, still follows the usual newest-wins rule.)
 */
export function keepLocalProductFields<T extends object>(merged: T, cloud: any, local: any): T {
  if (!local) return merged;
  const out: Record<string, any> = { ...(merged as any) };
  for (const k of PRODUCT_EXTRA_KEYS) {
    const cloudHas = cloud?.[k] !== undefined && cloud?.[k] !== null && !(k === 'unitsPerCrate' && !(Number(cloud[k]) > 0));
    const localHas = local?.[k] !== undefined && local?.[k] !== null;
    if (!cloudHas && localHas) out[k] = local[k];
  }
  return out as T;
}
