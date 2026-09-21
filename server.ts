import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

// Path resolution compatible with both ESM (tsx) and CJS (esbuild bundle)
const getDirname = () => {
  if (typeof __dirname !== 'undefined') return __dirname;
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
};
const _appDirname = getDirname();

// Supabase Database Connection
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://psizakmtxppariejawbd.supabase.co';

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_3D3tfJOS10gkL0lJ6qQT1Q_Lvux1S9W';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Helper for generic collections persistence
async function getCollectionData(key: string): Promise<any> {
  // 1. Try public.app_collections
  try {
    const { data, error } = await supabase
      .from('app_collections')
      .select('data')
      .eq('key', key)
      .maybeSingle();

    if (!error && data) {
      return data.data !== undefined ? data.data : [];
    }
  } catch (err: any) {
    console.warn(`[Supabase] Note querying app_collections: ${err.message}`);
  }

  // 2. Fallback to billing_settings if app_collections is not yet created in PostgreSQL
  try {
    const { data, error } = await supabase
      .from('billing_settings')
      .select('data')
      .eq('id', `collection_${key}`)
      .maybeSingle();

    if (!error && data && data.data) {
      return data.data.items !== undefined ? data.data.items : data.data;
    }
  } catch {
    // ignore
  }

  return [];
}

async function setCollectionData(key: string, rawData: any): Promise<boolean> {
  const data = rawData !== undefined ? rawData : [];

  // 1. Try public.app_collections
  try {
    const { error } = await supabase.from('app_collections').upsert(
      {
        key,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    if (!error) return true;
  } catch (err: any) {
    console.warn(`[Supabase] Exception upserting to app_collections: ${err.message}`);
  }

  // 2. Fallback to billing_settings
  try {
    const { error } = await supabase.from('billing_settings').upsert(
      {
        id: `collection_${key}`,
        data: { items: data },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    return !error;
  } catch (err: any) {
    console.error(`[Supabase] Fallback save failed for key ${key}: ${err.message}`);
    return false;
  }
}

// Helper to mutate inventory in PostgreSQL
async function updateInventoryItemStock(
  productId: string | number,
  deltaOnHand: number,
  deltaReserved: number
): Promise<void> {
  const pid = String(productId);

  // 1. Try updating public.inventory_items
  try {
    const { data: item, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('product_id', pid)
      .limit(1)
      .maybeSingle();

    if (!error && item) {
      const newOnHand = Math.max(0, Number(item.stock_on_hand || 0) + deltaOnHand);
      const newReserved = Math.max(0, Number(item.reserved_stock || 0) + deltaReserved);
      await supabase
        .from('inventory_items')
        .update({
          stock_on_hand: newOnHand,
          reserved_stock: newReserved,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      return;
    }
  } catch {
    // fallback
  }

  // 2. Fallback: update collection 'inventory_items'
  try {
    const items = await getCollectionData('inventory_items');
    if (Array.isArray(items)) {
      let updated = false;
      const newItems = items.map((it: any) => {
        if (String(it.product_id || it.productId) === pid) {
          updated = true;
          return {
            ...it,
            stock_on_hand: Math.max(0, Number(it.stock_on_hand || it.stockOnHand || 0) + deltaOnHand),
            reserved_stock: Math.max(0, Number(it.reserved_stock || it.reservedStock || 0) + deltaReserved),
            updated_at: new Date().toISOString(),
          };
        }
        return it;
      });
      if (updated) {
        await setCollectionData('inventory_items', newItems);
      }
    }
  } catch {
    // ignore
  }
}

// In-memory circuit breaker cooldown to prevent hammering temporarily unavailable models
const modelCoolDownUntil: Record<string, number> = {};

function getCandidateModels(): string[] {
  const now = Date.now();
  // Valid models per Gemini API guidelines: gemini-3.1-flash-lite, gemini-3.8-flash, gemini-flash-latest
  const pool = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
  return pool.sort((a, b) => {
    const coolA = (modelCoolDownUntil[a] || 0) > now ? 1 : 0;
    const coolB = (modelCoolDownUntil[b] || 0) > now ? 1 : 0;
    return coolA - coolB;
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for high-res invoice images and multi-page PDFs
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  });

  // AI Invoice Recognition Endpoint (Image, PDF, or text/CSV/Excel content)
  app.post('/api/recognize-invoice', async (req, res) => {
    try {
      const { fileBase64, mimeType, fileName, textContent } = req.body;

      if (!fileBase64 && !textContent) {
        return res.status(400).json({
          error: 'Please provide fileBase64 or textContent of the invoice.',
        });
      }

      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server. Please add your GEMINI_API_KEY in the environment settings.',
          fallbackAvailable: true,
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const invoicePrompt = `
You are an expert Indian beverage distribution and tax invoice parsing system.
Analyze this invoice/bill/quotation carefully (it may be a Tax Invoice or Sales Quotation from a beverage distributor like Radhika Enterprises, Campa, Sosyo Hajoori, Reliance Consumer Products, or others).

EXTRACT ALL INVOICE HEADER DETAILS:
- supplierName: Company or distributor issuing the invoice (e.g. "RADHIKA ENTERPRISES")
- supplierGstin: GSTIN of supplier (e.g. "21FSDPR8480R1ZU")
- supplierAddress: Registered address or dispatch godown of supplier (e.g. "Main Road, Kuchinda, Sambalpur, Odisha - 768222")
- supplierPhone: Supplier contact or dispatch phone number (e.g. "+91 94370 84801")
- supplierEmail: Supplier billing or support email if present
- invoiceNo: Invoice number or Quotation number (e.g. "38/26-27" or "2")
- invoiceDate: Date in YYYY-MM-DD format (e.g. "2026-09-12" or "2026-09-11")
- vehicleNo: Vehicle registration number if present (e.g. "OD15AF7869")
- placeOfSupply: State or place of supply (e.g. "Odisha (21)")
- billedTo: Customer/Party billed to (e.g. "NEW BIJAYA PUSTAK BHANDRA" or "KUCHINDA")
- shippedTo: Customer/Party shipped to
- overallDiscount: Total invoice level discount amount in Rupees if specified (e.g. 25530.00)
- grandTotal: Total invoice amount in Rupees (e.g. 122179.00 or 141049.10)
- totalCases: Total case/crate count mentioned (e.g. 560.00 or 760.00)

EXTRACT EVERY SINGLE LINE ITEM:
For each product / beverage item listed in the invoice table:
1. rawName: exact description in invoice (e.g. "CAMPA POWER UP 150ML PET", "E.H. VIBE COLA 150ML", "SOSYO JOOS MANGO 150ML PET", "SOSYO RUNNER GOLD 150ML PET")
2. productName: clean, normalized title-case name (e.g. "Campa Power Up 150ml PET", "E.H. Vibe Cola 150ml", "Sosyo Joos Mango 150ml PET")
3. category: one of ["energy", "vibe", "joos", "water", "general"]
   - "energy" for Power Up, Boost, Neon Boost, Purple Boost, Orange Boost, Energy drinks
   - "vibe" for Vibe Cola, Vibe Orange, Vibe Clear Lemon, Sosyo Runner, Sodas, Carbonated beverages
   - "joos" for Sosyo Joos, Mango, Apple, Mix Fruit, Guava, Nimbu Paani, fruit juices
   - "water" for packaged drinking water, Kinley, Aquafina, etc.
   - "general" for other items
4. pack: packaging type ("PET", "Can", "Glass", "Tetra")
5. volume: volume in ml as number (e.g. 150, 200, 250, 500, 1000, 2000)
6. hsn: HSN or SAC code (e.g. "22021090", "22021010", "22029920", "22011010")
7. qty: billed quantity in Cases/Crates as positive number (e.g. 150, 75, 45, 50, 10, 5, 100)
8. freeQty: free/bonus/scheme cases if specified (0 if none)
9. unitPrice: unit list price / purchase rate per case before tax (e.g. 222.00 or 158.57 or 150.00 or 202.15 or 210.00)
10. discountPercent: line item discount percent (e.g. 0.0 or 5.0)
11. discountAmount: discount amount in ₹ for this line item if any (0 if none)
12. cgstPercent: CGST tax rate percentage (e.g. 20.0 for carbonated soft drinks, 2.5 for fruit drinks, 9.0 for water)
13. sgstPercent: SGST tax rate percentage (e.g. 20.0 for carbonated soft drinks, 2.5 for fruit drinks, 9.0 for water)
14. schemeDescription: any scheme or promotion mentioned for this item (or "" if none)
15. lineTotal: total amount including taxes for this line item
16. batchNumber: batch or lot number if shown on invoice (or "" if not present)
17. expiryDate: expiry date in YYYY-MM-DD if shown (or "" if not present)

RETURN ONLY A VALID JSON OBJECT MATCHING THIS EXACT SCHEMA:
{
  "supplierName": "string",
  "supplierGstin": "string",
  "supplierAddress": "string",
  "supplierPhone": "string",
  "supplierEmail": "string",
  "invoiceNo": "string",
  "invoiceDate": "YYYY-MM-DD",
  "vehicleNo": "string",
  "placeOfSupply": "string",
  "billedTo": "string",
  "shippedTo": "string",
  "overallDiscount": number,
  "grandTotal": number,
  "totalCases": number,
  "items": [
    {
      "rawName": "string",
      "productName": "string",
      "category": "energy" | "vibe" | "joos" | "water" | "general",
      "pack": "string",
      "volume": number,
      "hsn": "string",
      "qty": number,
      "freeQty": number,
      "unitPrice": number,
      "discountPercent": number,
      "discountAmount": number,
      "cgstPercent": number,
      "sgstPercent": number,
      "schemeDescription": "string",
      "lineTotal": number,
      "batchNumber": "string",
      "expiryDate": "string"
    }
  ]
}
`;

      const contents: any[] = [];

      if (fileBase64 && mimeType) {
        // Multimodal image or PDF processing
        contents.push({
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: fileBase64,
              },
            },
            {
              text: invoicePrompt,
            },
          ],
        });
      } else if (textContent) {
        // Spreadsheet / CSV / raw text processing
        contents.push({
          role: 'user',
          parts: [
            {
              text: `${invoicePrompt}\n\nINVOICE CONTENT:\n${textContent}\nFile Name: ${fileName || 'invoice.csv'}`,
            },
          ],
        });
      }

      let responseText = '';
      let usedModel = '';
      const candidateModels = getCandidateModels();
      const modelErrors: { model: string; error: string; status?: number }[] = [];

      for (const model of candidateModels) {
        // Try up to 2 attempts per model if transient error occurs
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[Gemini] Attempting invoice parsing with ${model} (attempt ${attempt})...`);
            const response = await ai.models.generateContent({
              model,
              contents,
              config: {
                responseMimeType: 'application/json',
                temperature: 0.1,
              },
            });

            if (response.text && response.text.trim()) {
              responseText = response.text.trim();
              usedModel = model;
              console.log(`[Gemini] Invoice parsed successfully using ${model}`);
              break;
            }
          } catch (modelErr: any) {
            const errStatus = modelErr.status || modelErr.code || modelErr.error?.code;
            const errMsg = modelErr.message || String(modelErr);
            const is503OrTransient =
              errStatus === 503 ||
              errStatus === 429 ||
              /high demand|unavailable|temporary|spike/i.test(errMsg);

            console.warn(`[Gemini] Model ${model} attempt ${attempt} failed:`, errMsg);
            modelErrors.push({ model, error: errMsg, status: errStatus });

            if (is503OrTransient) {
              // Mark model as cooling down for 60s so subsequent requests prioritize healthy models
              modelCoolDownUntil[model] = Date.now() + 60000;
              if (attempt < 2) {
                const backoff = 1000 * attempt + Math.floor(Math.random() * 500);
                await new Promise((r) => setTimeout(r, backoff));
                continue;
              }
            }
            // Move to next candidate model
            break;
          }
        }

        if (responseText) {
          break;
        }
      }

      if (!responseText) {
        const isAll503 = modelErrors.every(
          (e) => e.status === 503 || /high demand|unavailable/i.test(e.error)
        );
        const err = new Error(
          isAll503
            ? 'Google Gemini is currently experiencing temporary high demand across models (503). Spikes in demand are usually brief. Please click Retry in a few moments, or upload your invoice as an Excel/CSV spreadsheet.'
            : `AI recognition failed across models: ${modelErrors.map((e) => `${e.model}: ${e.error}`).join('; ')}`
        );
        (err as any).status = isAll503 ? 503 : 500;
        (err as any).isTemporary = isAll503;
        throw err;
      }

      // Sanitize JSON text in case of markdown code block wrapper
      let cleanJson = responseText.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }
      const firstBrace = cleanJson.indexOf('{');
      const lastBrace = cleanJson.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanJson = cleanJson.slice(firstBrace, lastBrace + 1);
      }

      let parsedData: any;
      try {
        parsedData = JSON.parse(cleanJson);
      } catch (parseErr: any) {
        console.error('Failed to parse Gemini JSON output:', cleanJson);
        throw new Error(`Model returned invalid JSON format: ${parseErr.message}`);
      }

      return res.json({
        success: true,
        data: parsedData,
        rawModel: usedModel,
      });
    } catch (error: any) {
      console.error('Invoice recognition error:', error);
      const isUnavailable =
        error.status === 503 ||
        error.isTemporary ||
        /high demand|unavailable|temporar/i.test(error.message || '');

      return res.status(isUnavailable ? 503 : 500).json({
        error: error.message || 'Failed to process invoice with AI',
        isTemporary: isUnavailable,
        fallbackAvailable: true,
        details: error.toString(),
      });
    }
  });

  /* =========================================================================
   * STEP 2 & 3: SUPABASE DATA PERSISTENCE & COLLECTION ROUTES
   * ========================================================================= */

  function isValidUuid(val: any): boolean {
    if (typeof val !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val.trim());
  }

  /**
   * Resilient upsert helper that handles PostgREST schema cache misses gracefully.
   * If PostgREST schema cache has not yet refreshed for newly added columns (e.g. 'salesman', 'salesman_id'),
   * it automatically detects the missing column, removes it from the payload, and retries the operation.
   */
  async function resilientUpsert(
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

  function formatBillForSupabase(b: any) {
    const rawSalesmanId = b.salesmanId || b.salesman_id || null;
    const validSalesmanId = isValidUuid(rawSalesmanId) ? rawSalesmanId : null;
    return {
      id: Number(b.id),
      retailer: b.retailer || b.customerName || b.customer_name || 'Cash Sale',
      phone: b.phone || null,
      date: b.date || new Date().toISOString().slice(0, 10),
      subtotal: Number(b.subtotal || 0),
      cgst: Number(b.cgst || 0),
      sgst: Number(b.sgst || 0),
      total: Number(b.total || 0),
      discount: Number(b.discount || 0),
      amount_paid: Number(b.amountPaid !== undefined ? b.amountPaid : (b.amount_paid || 0)),
      warehouse_id: b.warehouseId || b.warehouse_id || null,
      salesman_id: validSalesmanId,
      salesman: b.salesman || '',
      items: Array.isArray(b.items) ? b.items : [],
      updated_at: new Date().toISOString(),
    };
  }

  function formatTripForSupabase(t: any) {
    const rawSalesmanId = t.salesmanId || t.salesman_id || null;
    const validSalesmanId = isValidUuid(rawSalesmanId) ? rawSalesmanId : null;
    return {
      id: Number(t.id),
      vehicle: t.vehicle || '',
      salesman_id: validSalesmanId,
      salesman: t.salesman || '',
      date: t.date || new Date().toISOString().slice(0, 10),
      warehouse_id: t.warehouseId || t.warehouse_id || null,
      loaded: typeof t.loaded === 'object' && t.loaded ? t.loaded : {},
      returned: typeof t.returned === 'object' && t.returned ? t.returned : {},
      bill_ids: Array.isArray(t.billIds || t.bill_ids) ? (t.billIds || t.bill_ids) : [],
      status: t.status || 'out',
      updated_at: new Date().toISOString(),
    };
  }

  function formatWarehouseForSupabase(w: any) {
    return {
      id: String(w.id),
      name: w.name || '',
      code: w.code || '',
      location: w.location || '',
      manager: w.manager || '',
      phone: w.phone || '',
      capacity_cases: Number(w.capacityCases || w.capacity_cases || 0),
      is_default: Boolean(w.isDefault || w.is_default),
      notes: w.notes || '',
      updated_at: new Date().toISOString(),
    };
  }

  // 1. BILLS & ORDERS ROUTES (Supabase public.bills and inventory adjustments)
  app.get(['/api/bills', '/api/orders'], async (_req, res) => {
    try {
      // 1. Try public.bills table
      const { data: bills, error: billsErr } = await supabase
        .from('bills')
        .select('*')
        .order('id', { ascending: false });

      if (!billsErr && Array.isArray(bills) && bills.length > 0) {
        const colOrders = await getCollectionData('orders');
        const colMap = new Map<number, any>();
        if (Array.isArray(colOrders)) {
          colOrders.forEach((co: any) => colMap.set(Number(co.id), co));
        }

        const mapped = bills.map((b: any) => {
          const cached = colMap.get(Number(b.id));
          return {
            id: Number(b.id),
            retailer: b.retailer,
            phone: b.phone || '',
            date: b.date,
            subtotal: Number(b.subtotal || 0),
            cgst: Number(b.cgst || 0),
            sgst: Number(b.sgst || 0),
            total: Number(b.total || 0),
            discount: Number(b.discount || 0),
            amountPaid: Number(b.amount_paid !== undefined ? b.amount_paid : (b.amountPaid || 0)),
            warehouseId: b.warehouse_id || '',
            salesman: b.salesman || cached?.salesman || '',
            salesmanId: b.salesman_id || cached?.salesmanId || cached?.salesman_id || undefined,
            items: Array.isArray(b.items) ? b.items : (cached?.items || []),
          };
        });
        return res.json({ success: true, data: mapped });
      }

      // 2. Try public.orders table
      const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (!ordersErr && Array.isArray(orders) && orders.length > 0) {
        return res.json({ success: true, data: orders });
      }

      // 3. Fallback to app_collections 'orders'
      const colOrders = await getCollectionData('orders');
      return res.json({ success: true, data: Array.isArray(colOrders) ? colOrders : [] });
    } catch (err: any) {
      console.error('Error in GET /api/bills:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch bills', data: [] });
    }
  });

  app.post(['/api/bills', '/api/orders', '/api/create_order_with_schemes'], async (req, res) => {
    try {
      const body = req.body;
      const billPayload = formatBillForSupabase(body);

      // Persist to public.bills with resilient upsert
      const { error: billErr } = await resilientUpsert(supabase, 'bills', billPayload, { onConflict: 'id' });
      if (billErr) {
        console.warn('Upsert to public.bills notice:', billErr.message);
      }

      // Mirror to app_collections 'orders' for local cache redundancy
      const existing = await getCollectionData('orders');
      const list = Array.isArray(existing) ? existing : [];
      const updated = [billPayload, ...list.filter((o: any) => Number(o.id) !== Number(billPayload.id))];
      await setCollectionData('orders', updated);

      // Reserve / update inventory in Postgres for ordered items
      const items = Array.isArray(body.items) ? body.items : [];
      for (const item of items) {
        const pid = item.productId || item.product_id || item.id;
        const qty = Number(item.qty || item.quantity || 0) + Number(item.freeQty || item.free_qty || 0);
        if (pid && qty > 0) {
          await updateInventoryItemStock(pid, 0, qty);
        }
      }

      return res.status(201).json({ success: true, data: billPayload });
    } catch (err: any) {
      console.error('Error creating bill:', err);
      return res.status(500).json({ error: err.message || 'Failed to create bill' });
    }
  });

  app.put(['/api/bills', '/api/orders'], async (req, res) => {
    try {
      const rawBills = Array.isArray(req.body?.bills)
        ? req.body.bills
        : Array.isArray(req.body?.data)
        ? req.body.data
        : Array.isArray(req.body)
        ? req.body
        : [];

      if (rawBills.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const payloads = rawBills.map(formatBillForSupabase);
      const { error } = await resilientUpsert(supabase, 'bills', payloads, { onConflict: 'id' });
      if (error) {
        console.warn('Bulk upsert to public.bills error:', error.message);
      }

      await setCollectionData('orders', rawBills);
      return res.json({ success: true, count: payloads.length });
    } catch (err: any) {
      console.error('Error in PUT /api/bills:', err);
      return res.status(500).json({ error: err.message || 'Failed to bulk update bills' });
    }
  });

  app.post('/api/bills/:id/payment', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const amountPaid = Number(req.body?.amountPaid !== undefined ? req.body.amountPaid : req.body?.amount || 0);

      const { error } = await supabase.from('bills').update({
        amount_paid: amountPaid,
        updated_at: new Date().toISOString(),
      }).eq('id', id);

      if (error) {
        console.warn('Payment update to public.bills error:', error.message);
      }

      const colOrders = await getCollectionData('orders');
      if (Array.isArray(colOrders)) {
        const updated = colOrders.map((o: any) =>
          Number(o.id) === id ? { ...o, amountPaid, amount_paid: amountPaid } : o
        );
        await setCollectionData('orders', updated);
      }

      return res.json({ success: true, id, amountPaid });
    } catch (err: any) {
      console.error('Error updating bill payment:', err);
      return res.status(500).json({ error: err.message || 'Failed to update payment' });
    }
  });

  app.delete(['/api/bills/:id', '/api/orders/:id'], async (req, res) => {
    try {
      const id = Number(req.params.id);
      await supabase.from('bills').delete().eq('id', id);

      const colOrders = await getCollectionData('orders');
      if (Array.isArray(colOrders)) {
        const updated = colOrders.filter((o: any) => Number(o.id) !== id);
        await setCollectionData('orders', updated);
      }

      return res.json({ success: true, id });
    } catch (err: any) {
      console.error('Error deleting bill:', err);
      return res.status(500).json({ error: err.message || 'Failed to delete bill' });
    }
  });

  // DELIVERY TRIPS ROUTES (Supabase public.trips)
  app.get('/api/trips', async (_req, res) => {
    try {
      const { data: trips, error } = await supabase
        .from('trips')
        .select('*')
        .order('id', { ascending: false });

      if (!error && Array.isArray(trips) && trips.length > 0) {
        const colTrips = await getCollectionData('trips');
        const tripMap = new Map<number, any>();
        if (Array.isArray(colTrips)) {
          colTrips.forEach((ct: any) => tripMap.set(Number(ct.id), ct));
        }

        const mapped = trips.map((t: any) => {
          const cached = tripMap.get(Number(t.id));
          return {
            id: Number(t.id),
            vehicle: t.vehicle,
            salesman: t.salesman || cached?.salesman || '',
            salesmanId: t.salesman_id || cached?.salesmanId || cached?.salesman_id || undefined,
            date: t.date,
            warehouseId: t.warehouse_id || '',
            loaded: typeof t.loaded === 'object' && t.loaded ? t.loaded : (cached?.loaded || {}),
            returned: typeof t.returned === 'object' && t.returned ? t.returned : (cached?.returned || {}),
            billIds: Array.isArray(t.bill_ids) ? t.bill_ids : (cached?.billIds || []),
            status: t.status || 'out',
          };
        });
        return res.json({ success: true, data: mapped });
      }

      const colTrips = await getCollectionData('trips');
      return res.json({ success: true, data: Array.isArray(colTrips) ? colTrips : [] });
    } catch (err: any) {
      console.error('Error in GET /api/trips:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch trips', data: [] });
    }
  });

  app.post('/api/trips', async (req, res) => {
    try {
      const body = req.body;
      const tripPayload = formatTripForSupabase(body);

      const { error } = await resilientUpsert(supabase, 'trips', tripPayload, { onConflict: 'id' });
      if (error) {
        console.warn('Upsert to public.trips error:', error.message);
      }

      const existing = await getCollectionData('trips');
      const list = Array.isArray(existing) ? existing : [];
      const updated = [tripPayload, ...list.filter((t: any) => Number(t.id) !== Number(tripPayload.id))];
      await setCollectionData('trips', updated);

      return res.status(201).json({ success: true, data: tripPayload });
    } catch (err: any) {
      console.error('Error saving trip:', err);
      return res.status(500).json({ error: err.message || 'Failed to save trip' });
    }
  });

  app.put('/api/trips', async (req, res) => {
    try {
      const rawTrips = Array.isArray(req.body?.trips)
        ? req.body.trips
        : Array.isArray(req.body?.data)
        ? req.body.data
        : Array.isArray(req.body)
        ? req.body
        : [];

      if (rawTrips.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const payloads = rawTrips.map(formatTripForSupabase);
      const { error } = await resilientUpsert(supabase, 'trips', payloads, { onConflict: 'id' });
      if (error) {
        console.warn('Bulk upsert to public.trips error:', error.message);
      }

      await setCollectionData('trips', rawTrips);
      return res.json({ success: true, count: payloads.length });
    } catch (err: any) {
      console.error('Error in PUT /api/trips:', err);
      return res.status(500).json({ error: err.message || 'Failed to bulk update trips' });
    }
  });

  app.delete('/api/trips/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      await supabase.from('trips').delete().eq('id', id);

      const colTrips = await getCollectionData('trips');
      if (Array.isArray(colTrips)) {
        const updated = colTrips.filter((t: any) => Number(t.id) !== id);
        await setCollectionData('trips', updated);
      }

      return res.json({ success: true, id });
    } catch (err: any) {
      console.error('Error deleting trip:', err);
      return res.status(500).json({ error: err.message || 'Failed to delete trip' });
    }
  });

  /* =========================================================================
   * SALESMEN ROUTES (Supabase public.salesmen)
   * Admin-provisioned, PIN-authenticated field salesmen
   * ========================================================================= */

  function formatSalesmanResponse(s: any) {
    return {
      id: String(s.id),
      name: s.name || '',
      phone: s.phone || '',
      pinHash: s.pin_hash || s.pinHash || '',
      active: s.active !== undefined ? Boolean(s.active) : true,
      defaultVehicle: s.default_vehicle || s.defaultVehicle || '',
      createdAt: s.created_at || s.createdAt || new Date().toISOString(),
      updatedAt: s.updated_at || s.updatedAt || new Date().toISOString(),
    };
  }

  app.get('/api/salesmen', async (_req, res) => {
    try {
      // 1. Try public.salesmen in Supabase
      const { data: list, error } = await supabase
        .from('salesmen')
        .select('*')
        .order('name', { ascending: true });

      if (!error && Array.isArray(list) && list.length > 0) {
        return res.json({ success: true, data: list.map(formatSalesmanResponse) });
      }

      // 2. Fallback to app_collections
      const colSalesmen = await getCollectionData('salesmen');
      const fallbackList = Array.isArray(colSalesmen) ? colSalesmen : [];
      return res.json({ success: true, data: fallbackList.map(formatSalesmanResponse) });
    } catch (err: any) {
      console.error('Error in GET /api/salesmen:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch salesmen', data: [] });
    }
  });

  app.post('/api/salesmen', async (req, res) => {
    try {
      const body = req.body;
      const salesmanPayload = {
        id: isValidUuid(body.id) ? body.id : undefined,
        name: (body.name || '').trim(),
        phone: (body.phone || '').trim(),
        pin_hash: body.pinHash || body.pin_hash || '',
        active: body.active !== undefined ? Boolean(body.active) : true,
        default_vehicle: body.defaultVehicle || body.default_vehicle || '',
        updated_at: new Date().toISOString(),
      };

      if (!salesmanPayload.name || !salesmanPayload.phone) {
        return res.status(400).json({ error: 'Name and phone are required fields' });
      }

      // Insert or upsert in public.salesmen
      const { data, error } = await supabase
        .from('salesmen')
        .upsert(salesmanPayload, { onConflict: 'phone' })
        .select()
        .maybeSingle();

      if (error) {
        console.warn('Supabase salesmen upsert warning:', error.message);
      }

      const finalRecord = data ? formatSalesmanResponse(data) : formatSalesmanResponse({
        ...salesmanPayload,
        id: salesmanPayload.id || `salesman_${Date.now()}`,
      });

      // Mirror in app_collections
      const existing = await getCollectionData('salesmen');
      const list = Array.isArray(existing) ? existing : [];
      const updated = [
        finalRecord,
        ...list.filter((s: any) => s.id !== finalRecord.id && s.phone !== finalRecord.phone),
      ];
      await setCollectionData('salesmen', updated);

      return res.status(201).json({ success: true, data: finalRecord });
    } catch (err: any) {
      console.error('Error in POST /api/salesmen:', err);
      return res.status(500).json({ error: err.message || 'Failed to create salesman' });
    }
  });

  app.put('/api/salesmen/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const body = req.body;

      const updatePayload: any = {
        updated_at: new Date().toISOString(),
      };
      if (body.name !== undefined) updatePayload.name = body.name.trim();
      if (body.phone !== undefined) updatePayload.phone = body.phone.trim();
      if (body.pinHash !== undefined) updatePayload.pin_hash = body.pinHash;
      if (body.pin_hash !== undefined) updatePayload.pin_hash = body.pin_hash;
      if (body.active !== undefined) updatePayload.active = Boolean(body.active);
      if (body.defaultVehicle !== undefined) updatePayload.default_vehicle = body.defaultVehicle;
      if (body.default_vehicle !== undefined) updatePayload.default_vehicle = body.default_vehicle;

      const { data, error } = await supabase
        .from('salesmen')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        console.warn('Update salesmen in Supabase notice:', error.message);
      }

      // Update in collection fallback
      const existing = await getCollectionData('salesmen');
      if (Array.isArray(existing)) {
        const updated = existing.map((s: any) =>
          s.id === id ? { ...s, ...body, updatedAt: new Date().toISOString() } : s
        );
        await setCollectionData('salesmen', updated);
      }

      return res.json({ success: true, data: data ? formatSalesmanResponse(data) : null });
    } catch (err: any) {
      console.error('Error updating salesman:', err);
      return res.status(500).json({ error: err.message || 'Failed to update salesman' });
    }
  });

  app.delete('/api/salesmen/:id', async (req, res) => {
    try {
      const id = req.params.id;
      // Soft-deactivate or delete
      await supabase.from('salesmen').delete().eq('id', id);

      const existing = await getCollectionData('salesmen');
      if (Array.isArray(existing)) {
        const updated = existing.filter((s: any) => s.id !== id);
        await setCollectionData('salesmen', updated);
      }

      return res.json({ success: true, id });
    } catch (err: any) {
      console.error('Error deleting salesman:', err);
      return res.status(500).json({ error: err.message || 'Failed to delete salesman' });
    }
  });

  // Verify PIN endpoint for secure login
  app.post('/api/salesmen/verify-pin', async (req, res) => {
    try {
      const { phone, pinHash } = req.body;
      const cleanPhone = (phone || '').trim();

      if (!cleanPhone || !pinHash) {
        return res.status(400).json({ success: false, error: 'Phone and PIN hash are required.' });
      }

      // 1. Check Supabase public.salesmen
      const { data: sm, error } = await supabase
        .from('salesmen')
        .select('*')
        .eq('phone', cleanPhone)
        .maybeSingle();

      let target = sm;

      // 2. Fallback to collection
      if (!target || error) {
        const colSalesmen = await getCollectionData('salesmen');
        if (Array.isArray(colSalesmen)) {
          target = colSalesmen.find((s: any) => (s.phone || '').trim() === cleanPhone);
        }
      }

      if (!target) {
        return res.status(404).json({ success: false, error: 'Salesman not found with this mobile number.' });
      }

      if (target.active === false) {
        return res.status(403).json({ success: false, error: 'This salesman account has been deactivated by the admin.' });
      }

      const storedHash = target.pin_hash || target.pinHash || '';
      if (storedHash.toLowerCase() !== String(pinHash).toLowerCase()) {
        return res.status(401).json({ success: false, error: 'Incorrect PIN. Please try again.' });
      }

      return res.json({
        success: true,
        salesman: formatSalesmanResponse(target),
      });
    } catch (err: any) {
      console.error('Error verifying salesman PIN:', err);
      return res.status(500).json({ success: false, error: err.message || 'PIN verification failed.' });
    }
  });

  // SETTINGS ROUTES (billing_settings and organization_profile)
  app.get('/api/settings/billing', async (_req, res) => {
    try {
      const { data, error } = await supabase.from('billing_settings').select('*').eq('id', 'default').maybeSingle();
      if (!error && data && data.data) {
        return res.json({ success: true, data: data.data });
      }
      const col = await getCollectionData('billing_settings');
      return res.json({ success: true, data: col || null });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to load billing settings' });
    }
  });

  app.post('/api/settings/billing', async (req, res) => {
    try {
      const settings = req.body?.settings || req.body?.data || req.body;
      const { error } = await supabase.from('billing_settings').upsert({
        id: 'default',
        data: settings,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) {
        console.warn('Error saving billing_settings in Supabase:', error.message);
      }
      await setCollectionData('billing_settings', settings);
      return res.json({ success: true, data: settings });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to save billing settings' });
    }
  });

  app.get('/api/settings/profile', async (_req, res) => {
    try {
      const { data, error } = await supabase.from('organization_profile').select('*').eq('id', 'default').maybeSingle();
      if (!error && data && data.data) {
        return res.json({ success: true, data: data.data });
      }
      const col = await getCollectionData('organization_profile');
      return res.json({ success: true, data: col || null });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to load org profile' });
    }
  });

  app.post('/api/settings/profile', async (req, res) => {
    try {
      const profile = req.body?.profile || req.body?.data || req.body;
      const { error } = await supabase.from('organization_profile').upsert({
        id: 'default',
        data: profile,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) {
        console.warn('Error saving organization_profile in Supabase:', error.message);
      }
      await setCollectionData('organization_profile', profile);
      return res.json({ success: true, data: profile });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to save org profile' });
    }
  });

  // WAREHOUSES ROUTES (Supabase public.warehouses)
  app.get('/api/warehouses', async (_req, res) => {
    try {
      const { data: whs, error } = await supabase.from('warehouses').select('*').order('name', { ascending: true });
      if (!error && Array.isArray(whs) && whs.length > 0) {
        const mapped = whs.map((w: any) => ({
          id: String(w.id),
          name: w.name,
          code: w.code || '',
          location: w.location || '',
          manager: w.manager || '',
          phone: w.phone || '',
          capacityCases: Number(w.capacity_cases || 0),
          isDefault: Boolean(w.is_default),
          notes: w.notes || '',
        }));
        return res.json({ success: true, data: mapped });
      }
      const col = await getCollectionData('warehouses');
      return res.json({ success: true, data: Array.isArray(col) ? col : [] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch warehouses', data: [] });
    }
  });

  app.post('/api/warehouses', async (req, res) => {
    try {
      const w = req.body;
      const payload = formatWarehouseForSupabase(w);
      const { error } = await supabase.from('warehouses').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Error upserting warehouse:', error.message);
      }
      return res.status(201).json({ success: true, data: payload });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to create warehouse' });
    }
  });

  app.put('/api/warehouses', async (req, res) => {
    try {
      const raw = Array.isArray(req.body?.warehouses)
        ? req.body.warehouses
        : Array.isArray(req.body?.data)
        ? req.body.data
        : Array.isArray(req.body)
        ? req.body
        : [];
      if (raw.length === 0) return res.json({ success: true, count: 0 });
      const payloads = raw.map(formatWarehouseForSupabase);
      const { error } = await supabase.from('warehouses').upsert(payloads, { onConflict: 'id' });
      if (error) console.warn('Error bulk upserting warehouses:', error.message);
      await setCollectionData('warehouses', raw);
      return res.json({ success: true, count: payloads.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to bulk save warehouses' });
    }
  });

  app.delete('/api/warehouses/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await supabase.from('warehouses').delete().eq('id', id);
      return res.json({ success: true, id });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to delete warehouse' });
    }
  });

  // STOCK AUDITS ROUTES (Supabase public.audits)
  app.get('/api/audits', async (_req, res) => {
    try {
      const { data: audits, error } = await supabase.from('audits').select('*').order('date', { ascending: false });
      if (!error && Array.isArray(audits)) {
        return res.json({ success: true, data: audits });
      }
      return res.json({ success: true, data: [] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch audits', data: [] });
    }
  });

  app.post('/api/audits', async (req, res) => {
    try {
      const a = req.body;
      const payload = {
        id: Number(a.id || Date.now()),
        date: a.date || new Date().toISOString().slice(0, 10),
        time: a.time || null,
        referenceNote: a.referenceNote || null,
        entries: Array.isArray(a.entries) ? a.entries : [],
        adjusted: Boolean(a.adjusted),
      };
      await supabase.from('audits').upsert(payload, { onConflict: 'id' });
      return res.status(201).json({ success: true, data: payload });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to save audit' });
    }
  });

  app.delete('/api/audits/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      await supabase.from('audits').delete().eq('id', id);
      return res.json({ success: true, id });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to delete audit' });
    }
  });

  app.post('/api/orders/:id/cancel', async (req, res) => {
    try {
      const { id } = req.params;
      let order: any = null;
      const { data: ordData } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
      if (ordData) {
        order = ordData;
      } else {
        const { data: bData } = await supabase.from('bills').select('*').eq('id', id).maybeSingle();
        if (bData) {
          order = bData;
        } else {
          const colOrders = await getCollectionData('orders');
          if (Array.isArray(colOrders)) {
            order = colOrders.find((o: any) => String(o.id) === String(id));
          }
        }
      }

      if (order && Array.isArray(order.items)) {
        for (const item of order.items) {
          const pid = item.productId || item.product_id || item.id;
          const qty = Number(item.qty || item.quantity || 0) + Number(item.freeQty || item.free_qty || 0);
          if (pid && qty > 0) {
            await updateInventoryItemStock(pid, 0, -qty);
          }
        }
      }

      await supabase.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
      const colOrders = await getCollectionData('orders');
      if (Array.isArray(colOrders)) {
        const updated = colOrders.map((o: any) => (String(o.id) === String(id) ? { ...o, status: 'cancelled' } : o));
        await setCollectionData('orders', updated);
      }

      return res.json({ success: true, message: 'Order cancelled and reserved stock released' });
    } catch (err: any) {
      console.error('Error cancelling order:', err);
      return res.status(500).json({ error: err.message || 'Failed to cancel order' });
    }
  });

  app.post('/api/orders/:id/deliver', async (req, res) => {
    try {
      const { id } = req.params;
      let order: any = null;
      const { data: ordData } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
      if (ordData) {
        order = ordData;
      } else {
        const { data: bData } = await supabase.from('bills').select('*').eq('id', id).maybeSingle();
        if (bData) {
          order = bData;
        } else {
          const colOrders = await getCollectionData('orders');
          if (Array.isArray(colOrders)) {
            order = colOrders.find((o: any) => String(o.id) === String(id));
          }
        }
      }

      if (order && Array.isArray(order.items)) {
        for (const item of order.items) {
          const pid = item.productId || item.product_id || item.id;
          const qty = Number(item.qty || item.quantity || 0) + Number(item.freeQty || item.free_qty || 0);
          if (pid && qty > 0) {
            await updateInventoryItemStock(pid, -qty, -qty);
          }
        }
      }

      await supabase.from('orders').update({ status: 'delivered', updated_at: new Date().toISOString() }).eq('id', id);
      const colOrders = await getCollectionData('orders');
      if (Array.isArray(colOrders)) {
        const updated = colOrders.map((o: any) => (String(o.id) === String(id) ? { ...o, status: 'delivered' } : o));
        await setCollectionData('orders', updated);
      }

      return res.json({ success: true, message: 'Order delivered and stock deducted from inventory' });
    } catch (err: any) {
      console.error('Error delivering order:', err);
      return res.status(500).json({ error: err.message || 'Failed to deliver order' });
    }
  });

  // 2. PROMOTIONAL SCHEMES ROUTES
  app.get('/api/schemes', async (_req, res) => {
    try {
      // 1. Primary: check public.promotions table
      const { data: promos, error: promoErr } = await supabase.from('promotions').select('*').order('id', { ascending: true });
      if (!promoErr && Array.isArray(promos) && promos.length > 0) {
        const mapped = promos.map((p: any) => ({
          id: Number(p.id),
          name: p.name,
          type: p.type,
          buyQty: Number(p.buy_qty ?? p.buyQty ?? 0),
          freeQty: Number(p.free_qty ?? p.freeQty ?? 0),
          percent: Number(p.percent ?? 0),
          flatPerCase: Number(p.flat_per_case ?? p.flatPerCase ?? 0),
          productIds: Array.isArray(p.product_ids) ? p.product_ids : Array.isArray(p.productIds) ? p.productIds : [],
        }));
        return res.json({ success: true, data: mapped });
      }

      // 2. Fallback: check public.promotional_schemes
      const { data: schemes, error } = await supabase.from('promotional_schemes').select('*');
      if (!error && Array.isArray(schemes) && schemes.length > 0) {
        return res.json({ success: true, data: schemes });
      }

      // 3. Fallback: app_collections
      const colSchemes = await getCollectionData('schemes');
      return res.json({ success: true, data: Array.isArray(colSchemes) ? colSchemes : [] });
    } catch (err: any) {
      console.error('Error in GET /api/schemes:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch schemes', data: [] });
    }
  });

  app.post('/api/schemes', async (req, res) => {
    try {
      const schemeData = req.body;
      const id = Number(schemeData.id) || Date.now();
      const dbRow = {
        id,
        name: schemeData.name,
        type: schemeData.type,
        buy_qty: Number(schemeData.buyQty ?? schemeData.buy_qty ?? 0),
        free_qty: Number(schemeData.freeQty ?? schemeData.free_qty ?? 0),
        percent: Number(schemeData.percent ?? 0),
        flat_per_case: Number(schemeData.flatPerCase ?? schemeData.flat_per_case ?? 0),
        product_ids: schemeData.productIds || schemeData.product_ids || [],
      };

      let saved = false;
      // 1. Primary: Save to Supabase promotions table with snake_case
      const { error: pErr } = await supabase.from('promotions').upsert(dbRow, { onConflict: 'id' });
      if (!pErr) {
        saved = true;
      } else {
        console.warn('Could not save to promotions table with snake_case, trying camelCase:', pErr.message);
        const { error: pErr2 } = await supabase.from('promotions').upsert({
          id,
          name: schemeData.name,
          type: schemeData.type,
          buyQty: Number(schemeData.buyQty ?? 0),
          freeQty: Number(schemeData.freeQty ?? 0),
          percent: Number(schemeData.percent ?? 0),
          flatPerCase: Number(schemeData.flatPerCase ?? 0),
          productIds: schemeData.productIds || [],
        }, { onConflict: 'id' });
        if (!pErr2) saved = true;
      }

      // 2. Also try promotional_schemes table
      try {
        await supabase.from('promotional_schemes').upsert(schemeData, { onConflict: 'id' });
      } catch {
        // ignore
      }

      // 3. Always mirror to collection for offline / backup resilience
      const colSchemes = await getCollectionData('schemes');
      const list = Array.isArray(colSchemes) ? colSchemes : [];
      const updated = [...list.filter((s: any) => Number(s.id) !== id), { ...schemeData, id }];
      await setCollectionData('schemes', updated);

      return res.status(201).json({ success: true, data: { ...schemeData, id } });
    } catch (err: any) {
      console.error('Error saving scheme:', err);
      return res.status(500).json({ error: err.message || 'Failed to save scheme' });
    }
  });

  app.put('/api/schemes', async (req, res) => {
    try {
      const rawSchemes = req.body?.schemes || req.body?.data || req.body;
      const list: any[] = Array.isArray(rawSchemes) ? rawSchemes : [];
      if (list.length > 0) {
        const rows = list.map((schemeData: any) => ({
          id: Number(schemeData.id),
          name: schemeData.name,
          type: schemeData.type,
          buy_qty: Number(schemeData.buyQty ?? schemeData.buy_qty ?? 0),
          free_qty: Number(schemeData.freeQty ?? schemeData.free_qty ?? 0),
          percent: Number(schemeData.percent ?? 0),
          flat_per_case: Number(schemeData.flatPerCase ?? schemeData.flat_per_case ?? 0),
          product_ids: schemeData.productIds || schemeData.product_ids || [],
        }));
        const { error: pErr } = await supabase.from('promotions').upsert(rows, { onConflict: 'id' });
        if (pErr) {
          console.warn('Batch upsert to promotions with snake_case failed, trying fallback:', pErr.message);
          const altRows = list.map((s: any) => ({
            id: Number(s.id),
            name: s.name,
            type: s.type,
            buyQty: Number(s.buyQty ?? 0),
            freeQty: Number(s.freeQty ?? 0),
            percent: Number(s.percent ?? 0),
            flatPerCase: Number(s.flatPerCase ?? 0),
            productIds: s.productIds || [],
          }));
          await supabase.from('promotions').upsert(altRows, { onConflict: 'id' });
        }
      }
      await setCollectionData('schemes', list);
      return res.json({ success: true, count: list.length });
    } catch (err: any) {
      console.error('Error in PUT /api/schemes:', err);
      return res.status(500).json({ error: err.message || 'Failed to update schemes' });
    }
  });

  app.delete('/api/schemes/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      await supabase.from('promotions').delete().eq('id', id);
      await supabase.from('promotional_schemes').delete().eq('id', id);
      const colSchemes = await getCollectionData('schemes');
      if (Array.isArray(colSchemes)) {
        await setCollectionData('schemes', colSchemes.filter((s: any) => Number(s.id) !== id));
      }
      return res.json({ success: true, id });
    } catch (err: any) {
      console.error('Error in DELETE /api/schemes:', err);
      return res.status(500).json({ error: err.message || 'Failed to delete scheme' });
    }
  });

  // 3. INVENTORY ITEMS ROUTES (PostgreSQL public.inventory_items)
  app.get('/api/inventory', async (_req, res) => {
    try {
      // 1. Try public.inventory_items
      const { data: items, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && Array.isArray(items)) {
        return res.json({ success: true, data: items });
      }

      // 2. Fallback to collection 'inventory_items' or 'inventory'
      let colInv = await getCollectionData('inventory_items');
      if (!Array.isArray(colInv) || colInv.length === 0) {
        colInv = await getCollectionData('inventory');
      }

      if (Array.isArray(colInv) && colInv.length > 0) {
        return res.json({ success: true, data: colInv });
      }

      // 3. Fallback to inventory_batches
      const { data: batches, error: batchErr } = await supabase.from('inventory_batches').select('*');
      if (!batchErr && Array.isArray(batches) && batches.length > 0) {
        const mapped = batches.map((b) => ({
          id: b.id,
          product_id: String(b.product_id),
          stock_on_hand: b.quantity || 0,
          reserved_stock: 0,
          reorder_level: 10,
          warehouse_id: b.warehouse_id,
          batch_number: b.batch_number,
          mfg_date: b.mfg_date,
          expiry_date: b.expiry_date,
          unit_cost: b.cost_price || 0,
          updated_at: b.updated_at || new Date().toISOString(),
        }));
        return res.json({ success: true, data: mapped });
      }

      return res.json({ success: true, data: [] });
    } catch (err: any) {
      console.error('Error in GET /api/inventory:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch inventory', data: [] });
    }
  });

  app.post('/api/inventory/import', async (req, res) => {
    try {
      const { items, replaceAll } = req.body;
      const itemsList = Array.isArray(items) ? items : [];

      // Normalize items to inventory_items schema
      const formattedItems = itemsList.map((item: any, idx: number) => ({
        id: String(item.id || `inv_${Date.now()}_${idx}`),
        product_id: String(item.sku || item.product_sku || item.product_id || item.productId || item.id),
        stock_on_hand: Number(item.stock_on_hand ?? item.stockOnHand ?? item.quantity ?? 0),
        reserved_stock: Number(item.reserved_stock ?? item.reservedStock ?? 0),
        reorder_level: Number(item.reorder_level ?? item.reorderLevel ?? 10),
        warehouse_id: item.warehouse_id || item.warehouseId || null,
        warehouse_name: item.warehouse_name || item.warehouseName || null,
        warehouse_bay: item.warehouse_bay || item.warehouseBay || null,
        batch_number: item.batch_number || item.batchNumber || null,
        mfg_date: item.mfg_date || item.mfgDate || null,
        expiry_date: item.expiry_date || item.expiryDate || null,
        unit_cost: Number(item.unit_cost ?? item.unitCost ?? item.cost ?? 0),
        selling_scheme: item.selling_scheme || item.sellingScheme || null,
        selling_scheme_discount: Number(item.selling_scheme_discount ?? item.sellingSchemeDiscount ?? 0),
        selling_scheme_label: item.selling_scheme_label || item.sellingSchemeLabel || null,
        last_restocked: item.last_restocked || item.lastRestocked || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // 1. Try public.inventory_items table
      let savedToTable = false;
      if (replaceAll) {
        // delete-then-insert only when replaceAll is true
        const { error: delErr } = await supabase.from('inventory_items').delete().neq('id', '___NEVER_MATCH___');
        if (!delErr) {
          if (formattedItems.length > 0) {
            const { error: insErr } = await supabase.from('inventory_items').insert(formattedItems);
            if (!insErr) savedToTable = true;
          } else {
            savedToTable = true;
          }
        }
      } else {
        if (formattedItems.length > 0) {
          const { error: upErr } = await supabase.from('inventory_items').upsert(formattedItems, { onConflict: 'id' });
          if (!upErr) savedToTable = true;
        } else {
          savedToTable = true;
        }
      }

      // 2. Also keep collection 'inventory_items' updated
      if (replaceAll) {
        await setCollectionData('inventory_items', formattedItems);
      } else {
        const existing = await getCollectionData('inventory_items');
        const list = Array.isArray(existing) ? existing : [];
        const map = new Map<string, any>();
        for (const ex of list) map.set(String(ex.id), ex);
        for (const it of formattedItems) map.set(String(it.id), it);
        await setCollectionData('inventory_items', Array.from(map.values()));
      }

      return res.json({
        success: true,
        count: formattedItems.length,
        savedToTable,
        message: `Imported ${formattedItems.length} inventory items to Supabase`,
      });
    } catch (err: any) {
      console.error('Error importing inventory:', err);
      return res.status(500).json({ error: err.message || 'Failed to import inventory' });
    }
  });

  app.put('/api/inventory/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = {
        ...req.body,
        updated_at: new Date().toISOString(),
      };

      await supabase.from('inventory_items').update(updates).eq('id', id);

      const existing = await getCollectionData('inventory_items');
      if (Array.isArray(existing)) {
        const updated = existing.map((item: any) =>
          String(item.id) === String(id) ? { ...item, ...updates } : item
        );
        await setCollectionData('inventory_items', updated);
      }

      return res.json({ success: true, id, updates });
    } catch (err: any) {
      console.error('Error updating inventory item:', err);
      return res.status(500).json({ error: err.message || 'Failed to update inventory item' });
    }
  });

  // PRODUCTS & BATCHES ROUTES (PostgreSQL public.products and public.inventory_batches)
  app.get('/api/products', async (_req, res) => {
    try {
      const { data: prods, error } = await supabase
        .from('products')
        .select('*')
        .order('id', { ascending: true });

      if (!error && Array.isArray(prods) && prods.length > 0) {
        const formatted = prods.map((r: any) => ({
          id: Number(r.id),
          sku: r.sku || `PRD-${r.id}`,
          name: r.name,
          category: r.category,
          volume: Number(r.volume || 0),
          pack: r.pack || 'PET',
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
        return res.json({ success: true, data: formatted });
      }

      const colProds = await getCollectionData('products');
      return res.json({ success: true, data: Array.isArray(colProds) ? colProds : [] });
    } catch (err: any) {
      console.error('Error in GET /api/products:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch products', data: [] });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const { products } = req.body;
      const prodsList = Array.isArray(products) ? products : (req.body ? [req.body] : []);
      if (prodsList.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const payload = prodsList.map((p: any) => ({
        id: Number(p.id),
        sku: String(p.sku || `PRD-${p.id}`),
        name: String(p.name || ''),
        category: String(p.category || 'energy'),
        volume: Number(p.volume || 0),
        pack: String(p.pack || 'PET'),
        expiry: String(p.expiry || ''),
        batch_number: String(p.batchNumber || p.batch_number || ''),
        mfg_date: String(p.mfgDate || p.mfg_date || ''),
        warehouse_id: String(p.warehouseId || p.warehouse_id || ''),
        opening: Number(p.opening || 0),
        cost: Number(p.cost || 0),
        effective_cost: Number(p.effectiveCost || p.effective_cost || p.cost || 0),
        retail: Number(p.retail || 0),
        wholesale: Number(p.wholesale || 0),
        hsn: String(p.hsn || '2202'),
        gst_rate: Number(p.gstRate !== undefined ? p.gstRate : 0.18),
        scheme: String(p.scheme || ''),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from('products').upsert(payload, { onConflict: 'id' });
      if (error) {
        // Fallback in case table has base columns
        const fallback = payload.map(({ sku: _s, batch_number: _b, mfg_date: _m, effective_cost: _e, hsn: _h, gst_rate: _g, scheme: _sc, ...rest }: any) => rest);
        await supabase.from('products').upsert(fallback, { onConflict: 'id' });
      }

      // Mirror to collection
      await setCollectionData('products', prodsList);
      return res.json({ success: true, count: payload.length });
    } catch (err: any) {
      console.error('Error in POST /api/products:', err);
      return res.status(500).json({ error: err.message || 'Failed to save products' });
    }
  });

  app.get('/api/batches', async (_req, res) => {
    try {
      const { data: batches, error } = await supabase.from('inventory_batches').select('*');
      if (!error && Array.isArray(batches) && batches.length > 0) {
        const formatted = batches.map((r: any) => ({
          id: String(r.id),
          productId: Number(r.product_id),
          sku: r.sku || '',
          batchNumber: r.batch_number || '',
          mfgDate: r.mfg_date || '',
          expiryDate: r.expiry_date || '',
          warehouseId: r.warehouse_id || '',
          quantity: Number(r.quantity || 0),
          costPrice: Number(r.cost_price || 0),
          mrp: Number(r.mrp || 0),
          scheme: r.scheme || '',
          effectiveCostPrice: Number(r.effective_cost_price || 0),
          notes: r.notes || '',
        }));
        return res.json({ success: true, data: formatted });
      }

      const colBatches = await getCollectionData('inventory_batches');
      return res.json({ success: true, data: Array.isArray(colBatches) ? colBatches : [] });
    } catch (err: any) {
      console.error('Error in GET /api/batches:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch batches', data: [] });
    }
  });

  app.post('/api/batches', async (req, res) => {
    try {
      const { batches } = req.body;
      const batchList = Array.isArray(batches) ? batches : (req.body ? [req.body] : []);
      if (batchList.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const payload = batchList.map((b: any) => ({
        id: String(b.id),
        product_id: Number(b.productId || b.product_id),
        sku: String(b.sku || ''),
        batch_number: String(b.batchNumber || b.batch_number || ''),
        mfg_date: b.mfgDate || b.mfg_date || null,
        expiry_date: b.expiryDate || b.expiry_date || null,
        warehouse_id: String(b.warehouseId || b.warehouse_id || ''),
        quantity: Number(b.quantity || 0),
        cost_price: Number(b.costPrice || b.cost_price || 0),
        mrp: Number(b.mrp || 0),
        scheme: String(b.scheme || ''),
        effective_cost_price: Number(b.effectiveCostPrice || b.effective_cost_price || 0),
        notes: String(b.notes || ''),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from('inventory_batches').upsert(payload, { onConflict: 'id' });
      if (error) {
        const fallback = payload.map(({ sku: _s, ...rest }: any) => rest);
        await supabase.from('inventory_batches').upsert(fallback, { onConflict: 'id' });
      }

      await setCollectionData('inventory_batches', batchList);
      return res.json({ success: true, count: payload.length });
    } catch (err: any) {
      console.error('Error in POST /api/batches:', err);
      return res.status(500).json({ error: err.message || 'Failed to save batches' });
    }
  });

  // 4. GENERIC COLLECTIONS ROUTES (STEP 3: partners, warehouses, warehouse_bays, stock_transactions, vehicle_trip)
  app.get('/api/collections/:key', async (req, res) => {
    const { key } = req.params;
    try {
      // For warehouses, if collection is empty, check public.warehouses
      if (key === 'warehouses') {
        const { data: whs, error } = await supabase.from('warehouses').select('*');
        if (!error && Array.isArray(whs) && whs.length > 0) {
          return res.json({ success: true, key, data: whs });
        }
      }

      const data = await getCollectionData(key);
      return res.json({ success: true, key, data: Array.isArray(data) ? data : [] });
    } catch (err: any) {
      console.error(`Error in GET /api/collections/${key}:`, err);
      return res.status(500).json({ error: err.message || 'Failed to fetch collection', key, data: [] });
    }
  });

  app.put('/api/collections/:key', async (req, res) => {
    const { key } = req.params;
    try {
      const collectionData = req.body?.data !== undefined ? req.body.data : req.body;
      const ok = await setCollectionData(key, collectionData);
      if (!ok) {
        return res.status(500).json({ error: `Failed to save collection ${key} to Supabase` });
      }
      return res.json({ success: true, key, data: collectionData });
    } catch (err: any) {
      console.error(`Error in PUT /api/collections/${key}:`, err);
      return res.status(500).json({ error: err.message || 'Failed to persist collection' });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
