-- ================================================================
-- RADHIKA DISTRIBUTION LEDGER - SUPABASE POSTGRESQL SCHEMA
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

-- 11. INVENTORY ITEMS TABLE (Central Item-Level Inventory Tracking)
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

-- 12. APP COLLECTIONS TABLE (Generic Persistence for Partners, Trips, Warehouses, Stock Transactions)
CREATE TABLE IF NOT EXISTS public.app_collections (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. ORDERS TABLE (Unified Sales & Delivery Orders)
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

-- 14. PROMOTIONAL SCHEMES TABLE
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

-- 15. SALESMEN TABLE (Admin-provisioned, PIN-authenticated field salesmen)
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

-- Idempotent column migrations for delivery trips & bills with foreign key to salesmen
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS salesman TEXT DEFAULT '';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES public.salesmen(id) ON DELETE SET NULL;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS salesman TEXT DEFAULT '';
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES public.salesmen(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trips_salesman_id ON public.trips(salesman_id);
CREATE INDEX IF NOT EXISTS idx_bills_salesman_id ON public.bills(salesman_id);

-- ================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Multi-role access control:
-- Admin: Full access to all tables, salesmen management, and settings
-- Salesman: Access to active trip, assigned bills, van stock, and own profile
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
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotional_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesmen ENABLE ROW LEVEL SECURITY;

-- Allow unrestricted access during pre-authentication phase / API gateway proxy
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

DROP POLICY IF EXISTS "Allow all access to inventory_items" ON public.inventory_items;
CREATE POLICY "Allow all access to inventory_items" ON public.inventory_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to app_collections" ON public.app_collections;
CREATE POLICY "Allow all access to app_collections" ON public.app_collections FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to orders" ON public.orders;
CREATE POLICY "Allow all access to orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to promotional_schemes" ON public.promotional_schemes;
CREATE POLICY "Allow all access to promotional_schemes" ON public.promotional_schemes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to salesmen" ON public.salesmen;
CREATE POLICY "Allow all access to salesmen" ON public.salesmen FOR ALL USING (true) WITH CHECK (true);

-- PRODUCTION RLS POLICIES FOR AUTH-RESTRICTED SALESMEN ACCESS (Reference / Activation):
-- When Supabase Auth JWT is active with role claim:
--
-- 1. Salesmen Table:
-- CREATE POLICY "Admins can manage all salesmen" ON public.salesmen
--   FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
--   WITH CHECK (auth.jwt() ->> 'role' = 'admin');
-- CREATE POLICY "Salesmen can view active salesmen for PIN login" ON public.salesmen
--   FOR SELECT USING (active = true);
--
-- 2. Trips Table:
-- CREATE POLICY "Admins full access to trips" ON public.trips
--   FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
-- CREATE POLICY "Salesmen access assigned trips" ON public.trips
--   FOR ALL USING (salesman_id::text = auth.uid()::text OR salesman_id IS NULL);
--
-- 3. Bills Table:
-- CREATE POLICY "Admins full access to bills" ON public.bills
--   FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
-- CREATE POLICY "Salesmen access their own bills" ON public.bills
--   FOR ALL USING (salesman_id::text = auth.uid()::text OR salesman_id IS NULL);

-- ================================================================
-- NO SEED DATA INSERTED (Schema only as requested)
-- ================================================================
