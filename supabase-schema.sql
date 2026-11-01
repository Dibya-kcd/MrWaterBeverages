-- ================================================================
-- MRWATER DISTRIBUTION LEDGER - SUPABASE POSTGRESQL SCHEMA
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

-- Ensure check constraint does not reject bundle promotions
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_type_check;

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
    cancellation JSONB,
    returns JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS cancellation JSONB;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS returns JSONB;

-- 7. DELIVERY TRIPS TABLE
CREATE TABLE IF NOT EXISTS public.trips (
    id BIGINT PRIMARY KEY,
    vehicle TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    warehouse_id TEXT DEFAULT '',
    loaded JSONB NOT NULL DEFAULT '{}'::JSONB,
    warehouse_loads JSONB NOT NULL DEFAULT '{}'::JSONB,
    route TEXT,
    driver TEXT,
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
-- Multi-warehouse van loads: { "<warehouse_id>": { "<product_id>": crates } }
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS warehouse_loads JSONB NOT NULL DEFAULT '{}'::JSONB;
-- Why crates were missing at trip close: { "<product_id>": { reason, qty, note, dispositionId } }
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS shortage_reasons JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS driver TEXT;
-- Back-fill older single-warehouse trips so their load is attributed to the warehouse they left from
UPDATE public.trips
   SET warehouse_loads = jsonb_build_object(warehouse_id, loaded)
 WHERE (warehouse_loads IS NULL OR warehouse_loads = '{}'::jsonb)
   AND COALESCE(warehouse_id, '') <> ''
   AND loaded <> '{}'::jsonb;
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

-- ================================================================
-- SUPPLIER SCHEME & INCENTIVE SYSTEM (additive migration — never drops or alters
-- any existing table). Idempotent: safe to run against a production database that
-- already has data in the tables above.
--
-- Kept deliberately separate from `public.promotions` / `public.promotional_schemes`,
-- which remain the customer-facing sales-promotion tables and are untouched here.
-- ================================================================

-- supplier_schemes: reusable scheme configuration (Type A free_goods, Type B
-- pending_credit, Type C volume_incentive). product_ids is an array so one scheme can
-- cover a product group.
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

-- supplier_scheme_applications: links an actual GRN line to a Type A/B scheme.
-- (Type C monthly achievement is deliberately NOT stored — it is computed live from
-- public.bills each time it's reported, the same way this app derives stock live from
-- batches rather than a mutable counter, so a deleted/edited bill can never leave a
-- stale incentive figure behind.)
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

-- supplier_credit_notes: Type B/Type C settlement. Never rewrites the original GRN
-- invoice — always a separate, linked transaction. expected_amount is preserved
-- historically after actual_amount is filled in; status is derived (pending ->
-- partially_credited -> settled), never set independently of the two amounts.
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

CREATE INDEX IF NOT EXISTS idx_supplier_scheme_applications_scheme_id ON public.supplier_scheme_applications(scheme_id);
CREATE INDEX IF NOT EXISTS idx_supplier_scheme_applications_grn_id ON public.supplier_scheme_applications(grn_id);
CREATE INDEX IF NOT EXISTS idx_supplier_scheme_applications_product_id ON public.supplier_scheme_applications(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_scheme_id ON public.supplier_credit_notes(scheme_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_grn_id ON public.supplier_credit_notes(grn_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_period ON public.supplier_credit_notes(period);

ALTER TABLE public.supplier_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_scheme_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_credit_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to supplier_schemes" ON public.supplier_schemes;
CREATE POLICY "Allow all access to supplier_schemes" ON public.supplier_schemes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to supplier_scheme_applications" ON public.supplier_scheme_applications;
CREATE POLICY "Allow all access to supplier_scheme_applications" ON public.supplier_scheme_applications FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to supplier_credit_notes" ON public.supplier_credit_notes;
CREATE POLICY "Allow all access to supplier_credit_notes" ON public.supplier_credit_notes FOR ALL USING (true) WITH CHECK (true);


-- ================================================================
-- SMART STOCK RECONCILIATION & AUDIT (additive migration — never drops or alters any
-- existing table, including the pre-existing simple `audits` table used by the
-- original quick-audit flow, which stays untouched and keeps working as before).
--
-- audit_sessions.entries is stored as JSONB rather than a normalized child table: each
-- variance entry is small, always read/written as part of its whole session, and never
-- queried independently across sessions in this app — a normalized table would add
-- migration/join complexity with no real benefit here. reconciliation_transactions and
-- stock_ledger_entries ARE normalized tables, because those two are genuinely queried
-- independently (by product, by session, for the dashboard) and must stay append-only.
-- ================================================================

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

-- reconciliation_transactions: the audit trail for every confirmed swap or investigation
-- reason (spec §9). approved_at IS NULL until an admin approves it — approveReconciliation
-- is the only code path that ever sets it, and it's the same call that writes the
-- matching stock_ledger_entries rows below.
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

-- stock_ledger_entries: append-only (spec §10). Nothing in this app ever UPDATEs or
-- DELETEs a row here — a correction is always a new, opposite-signed entry, never an
-- edit. The stock balance this feature is responsible for is always reconstructable by
-- summing quantity per product_id.
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

CREATE INDEX IF NOT EXISTS idx_reconciliation_transactions_session ON public.reconciliation_transactions(audit_session_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_transactions_variance_entry ON public.reconciliation_transactions(variance_entry_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_transactions_from_product ON public.reconciliation_transactions(from_product_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_entries_product ON public.stock_ledger_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_entries_session ON public.stock_ledger_entries(reference_audit_session_id);

ALTER TABLE public.audit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to audit_sessions" ON public.audit_sessions;
CREATE POLICY "Allow all access to audit_sessions" ON public.audit_sessions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to reconciliation_transactions" ON public.reconciliation_transactions;
CREATE POLICY "Allow all access to reconciliation_transactions" ON public.reconciliation_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to stock_ledger_entries" ON public.stock_ledger_entries;
CREATE POLICY "Allow all access to stock_ledger_entries" ON public.stock_ledger_entries FOR ALL USING (true) WITH CHECK (true);


-- ================================================================
-- Mr Water — Smart Reconciliation (audit sessions) + GRN edit history
-- Safe to run more than once (idempotent). Paste into:
--   Supabase Dashboard -> SQL Editor -> New query -> Run
-- ================================================================

-- ----------------------------------------------------------------
-- 1. AUDIT SESSIONS  (one row per Smart Reconciliation audit)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_sessions (
    id             TEXT PRIMARY KEY,
    warehouse_id   TEXT,
    warehouse_name TEXT,
    date           TEXT NOT NULL,              -- audit date (YYYY-MM-DD), can be back-dated
    time           TEXT,
    auditor_name   TEXT NOT NULL,
    reference_note TEXT DEFAULT '',
    entries        JSONB NOT NULL DEFAULT '[]'::JSONB,   -- variance entries
    edit_log       JSONB NOT NULL DEFAULT '[]'::JSONB,   -- who edited counts / date afterwards
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);
-- for databases where audit_sessions already exists without the newer column
ALTER TABLE public.audit_sessions ADD COLUMN IF NOT EXISTS edit_log JSONB NOT NULL DEFAULT '[]'::JSONB;

-- ----------------------------------------------------------------
-- 2. RECONCILIATION TRANSACTIONS  (confirmed swaps / reasons / adjustments)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reconciliation_transactions (
    id                TEXT PRIMARY KEY,
    audit_session_id  TEXT NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
    variance_entry_id TEXT NOT NULL,
    type              TEXT NOT NULL CHECK (type IN ('swap', 'investigation_reason', 'adjustment')),
    from_product_id   BIGINT NOT NULL,
    to_product_id     BIGINT,
    quantity          NUMERIC(12, 2) NOT NULL,
    reason_code       TEXT,
    match_score       NUMERIC(5, 2),
    notes             TEXT DEFAULT '',
    identified_by     TEXT NOT NULL,
    approved_by       TEXT,
    approved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 3. STOCK LEDGER ENTRIES  (append-only trail of approved stock changes)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_ledger_entries (
    id                          TEXT PRIMARY KEY,
    product_id                  BIGINT NOT NULL,
    warehouse_id                TEXT,
    quantity                    NUMERIC(12, 2) NOT NULL,
    transaction_type            TEXT NOT NULL DEFAULT 'audit_reconciliation',
    reference_audit_session_id  TEXT NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
    reference_reconciliation_id TEXT NOT NULL REFERENCES public.reconciliation_transactions(id) ON DELETE CASCADE,
    reason                      TEXT NOT NULL,
    user_id                     TEXT,
    user_name                   TEXT,
    timestamp                   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_sessions_date ON public.audit_sessions(date);
CREATE INDEX IF NOT EXISTS idx_reconciliation_transactions_session ON public.reconciliation_transactions(audit_session_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_transactions_variance_entry ON public.reconciliation_transactions(variance_entry_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_transactions_from_product ON public.reconciliation_transactions(from_product_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_entries_product ON public.stock_ledger_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_entries_session ON public.stock_ledger_entries(reference_audit_session_id);

-- ----------------------------------------------------------------
-- 4. GRN EDIT TRACKING  (corrections made while reviewing an inward invoice)
-- ----------------------------------------------------------------
-- Full history also kept inside each GRN row (fast to read in the app)
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS edit_history JSONB NOT NULL DEFAULT '[]'::JSONB;

-- Append-only log, one row per save/delete: who, when, why, and the exact field changes
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
CREATE INDEX IF NOT EXISTS idx_grn_edit_log_grn ON public.grn_edit_log(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_edit_log_time ON public.grn_edit_log(edited_at DESC);

-- ----------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (same open policy the rest of the app uses)
-- ----------------------------------------------------------------
ALTER TABLE public.audit_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_edit_log                ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to audit_sessions" ON public.audit_sessions;
CREATE POLICY "Allow all access to audit_sessions" ON public.audit_sessions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to reconciliation_transactions" ON public.reconciliation_transactions;
CREATE POLICY "Allow all access to reconciliation_transactions" ON public.reconciliation_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to stock_ledger_entries" ON public.stock_ledger_entries;
CREATE POLICY "Allow all access to stock_ledger_entries" ON public.stock_ledger_entries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to grn_edit_log" ON public.grn_edit_log;
CREATE POLICY "Allow all access to grn_edit_log" ON public.grn_edit_log FOR ALL USING (true) WITH CHECK (true);

-- Make the API pick up the new tables/columns immediately
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- 6. HANDY QUERIES (optional — run separately when you need them)
-- ----------------------------------------------------------------
-- Every correction made to inward invoices, newest first:
--   SELECT edited_at, grn_number, invoice_no, supplier_name, edited_by, reason, changes
--   FROM public.grn_edit_log ORDER BY edited_at DESC;
--
-- Audit sessions by date:
--   SELECT id, date, warehouse_name, auditor_name, jsonb_array_length(entries) AS skus
--   FROM public.audit_sessions ORDER BY date DESC;

-- ============================================================
-- Inventory dispositions: supplier returns, free near-expiry,
-- write-offs, send-back to company (Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_dispositions (
    id TEXT PRIMARY KEY,
    disposition_type TEXT NOT NULL CHECK (disposition_type IN (
        'expiry_return',
        'quality_return',
        'invoice_error_return',
        'return_to_supplier',
        'return_to_company',
        'free_near_expiry',
        'scheme_free_issue',
        'expired_writeoff',
        'damage_writeoff'
    )),
    product_id BIGINT NOT NULL,
    product_name TEXT,
    warehouse_id TEXT NOT NULL,
    warehouse_name TEXT,
    batch_id TEXT,
    batch_number TEXT,
    expiry_date TEXT,
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL DEFAULT 'case',
    cost_per_unit NUMERIC(12, 4) NOT NULL DEFAULT 0,
    cost_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    supplier_name TEXT,
    grn_id TEXT,
    supplier_invoice_no TEXT,
    credit_note_number TEXT,
    credit_note_date TEXT,
    cn_taxable_value NUMERIC(14, 2) DEFAULT 0,
    cn_cgst NUMERIC(14, 2) DEFAULT 0,
    cn_sgst NUMERIC(14, 2) DEFAULT 0,
    cn_igst NUMERIC(14, 2) DEFAULT 0,
    cn_total NUMERIC(14, 2) DEFAULT 0,
    compensation_status TEXT NOT NULL DEFAULT 'not_applicable'
        CHECK (compensation_status IN (
            'not_applicable', 'pending', 'partial', 'settled', 'rejected'
        )),
    compensated_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    compensated_at TEXT,
    distributed_to_name TEXT,
    distributed_to_phone TEXT,
    salesman_id TEXT,
    salesman_name TEXT,
    reason TEXT NOT NULL DEFAULT '',
    notes TEXT DEFAULT '',
    reference_doc_no TEXT,
    attachment_ref TEXT,
    created_by TEXT,
    approved_by TEXT,
    event_date TEXT NOT NULL,
    stock_applied BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_disp_type ON public.inventory_dispositions(disposition_type);
CREATE INDEX IF NOT EXISTS idx_inv_disp_product ON public.inventory_dispositions(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_disp_warehouse ON public.inventory_dispositions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_disp_batch ON public.inventory_dispositions(batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_disp_grn ON public.inventory_dispositions(grn_id);
CREATE INDEX IF NOT EXISTS idx_inv_disp_event_date ON public.inventory_dispositions(event_date);
CREATE INDEX IF NOT EXISTS idx_inv_disp_comp_status ON public.inventory_dispositions(compensation_status);

ALTER TABLE public.inventory_dispositions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to inventory_dispositions" ON public.inventory_dispositions;
CREATE POLICY "Allow all access to inventory_dispositions"
    ON public.inventory_dispositions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.supplier_credit_notes
    ADD COLUMN IF NOT EXISTS taxable_value NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cgst NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sgst NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS igst NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS warehouse_id TEXT,
    ADD COLUMN IF NOT EXISTS batch_id TEXT,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT '';
-- ============================================================
-- MrWater — Inventory dispositions + reporting views
-- Run in Supabase: Dashboard → SQL Editor → New query → Run
-- Safe to re-run (IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- 1) Main table: returns, free near-expiry, write-offs, send-back
CREATE TABLE IF NOT EXISTS public.inventory_dispositions (
    id TEXT PRIMARY KEY,
    disposition_type TEXT NOT NULL CHECK (disposition_type IN (
        'expiry_return',
        'quality_return',
        'invoice_error_return',
        'return_to_supplier',
        'return_to_company',
        'free_near_expiry',
        'scheme_free_issue',
        'expired_writeoff',
        'damage_writeoff'
    )),
    product_id BIGINT NOT NULL,
    product_name TEXT,
    warehouse_id TEXT NOT NULL,
    warehouse_name TEXT,
    batch_id TEXT,
    batch_number TEXT,
    expiry_date TEXT,
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL DEFAULT 'case',
    cost_per_unit NUMERIC(12, 4) NOT NULL DEFAULT 0,
    cost_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    supplier_name TEXT,
    grn_id TEXT,
    supplier_invoice_no TEXT,
    credit_note_number TEXT,
    credit_note_date TEXT,
    cn_taxable_value NUMERIC(14, 2) DEFAULT 0,
    cn_cgst NUMERIC(14, 2) DEFAULT 0,
    cn_sgst NUMERIC(14, 2) DEFAULT 0,
    cn_igst NUMERIC(14, 2) DEFAULT 0,
    cn_total NUMERIC(14, 2) DEFAULT 0,
    compensation_status TEXT NOT NULL DEFAULT 'not_applicable'
        CHECK (compensation_status IN (
            'not_applicable', 'pending', 'partial', 'settled', 'rejected'
        )),
    compensated_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    compensated_at TEXT,
    distributed_to_name TEXT,
    distributed_to_phone TEXT,
    salesman_id TEXT,
    salesman_name TEXT,
    reason TEXT NOT NULL DEFAULT '',
    notes TEXT DEFAULT '',
    reference_doc_no TEXT,
    attachment_ref TEXT,
    created_by TEXT,
    approved_by TEXT,
    event_date TEXT NOT NULL,
    stock_applied BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_disp_type ON public.inventory_dispositions(disposition_type);
CREATE INDEX IF NOT EXISTS idx_inv_disp_product ON public.inventory_dispositions(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_disp_warehouse ON public.inventory_dispositions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_disp_batch ON public.inventory_dispositions(batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_disp_batch_number ON public.inventory_dispositions(batch_number);
CREATE INDEX IF NOT EXISTS idx_inv_disp_grn ON public.inventory_dispositions(grn_id);
CREATE INDEX IF NOT EXISTS idx_inv_disp_supplier ON public.inventory_dispositions(supplier_name);
CREATE INDEX IF NOT EXISTS idx_inv_disp_cn ON public.inventory_dispositions(credit_note_number);
CREATE INDEX IF NOT EXISTS idx_inv_disp_event_date ON public.inventory_dispositions(event_date);
CREATE INDEX IF NOT EXISTS idx_inv_disp_comp_status ON public.inventory_dispositions(compensation_status);

ALTER TABLE public.inventory_dispositions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to inventory_dispositions" ON public.inventory_dispositions;
CREATE POLICY "Allow all access to inventory_dispositions"
    ON public.inventory_dispositions FOR ALL USING (true) WITH CHECK (true);

-- 2) Enrich scheme supplier_credit_notes (optional columns)
ALTER TABLE public.supplier_credit_notes
    ADD COLUMN IF NOT EXISTS taxable_value NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cgst NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sgst NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS igst NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS warehouse_id TEXT,
    ADD COLUMN IF NOT EXISTS batch_id TEXT,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT '';

-- 3) Reporting views

-- Open supplier claims (returns waiting for CN / settlement)
CREATE OR REPLACE VIEW public.v_open_supplier_claims AS
SELECT
    id,
    disposition_type,
    supplier_name,
    supplier_invoice_no,
    product_id,
    product_name,
    batch_id,
    batch_number,
    expiry_date,
    warehouse_id,
    warehouse_name,
    quantity,
    cost_value,
    credit_note_number,
    cn_total,
    compensation_status,
    compensated_amount,
    (cost_value - COALESCE(compensated_amount, 0)) AS pending_claim_value,
    event_date,
    grn_id,
    reference_doc_no
FROM public.inventory_dispositions
WHERE compensation_status IN ('pending', 'partial')
ORDER BY event_date DESC;

-- Free issue cost by month
CREATE OR REPLACE VIEW public.v_free_issue_cost_monthly AS
SELECT
    left(event_date, 7) AS year_month,
    disposition_type,
    sum(quantity) AS total_cases,
    sum(cost_value) AS total_cost
FROM public.inventory_dispositions
WHERE disposition_type IN ('free_near_expiry', 'scheme_free_issue')
GROUP BY left(event_date, 7), disposition_type
ORDER BY year_month DESC;

-- Write-off cost by month
CREATE OR REPLACE VIEW public.v_writeoff_cost_monthly AS
SELECT
    left(event_date, 7) AS year_month,
    disposition_type,
    sum(quantity) AS total_cases,
    sum(cost_value) AS total_cost
FROM public.inventory_dispositions
WHERE disposition_type IN ('expired_writeoff', 'damage_writeoff')
GROUP BY left(event_date, 7), disposition_type
ORDER BY year_month DESC;

-- Batch tracking: disposed qty/cost per batch (+ join remaining if inventory_batches exists)
CREATE OR REPLACE VIEW public.v_batch_disposition_impact AS
SELECT
    d.batch_id,
    d.batch_number,
    d.product_id,
    max(d.product_name) AS product_name,
    d.warehouse_id,
    max(d.warehouse_name) AS warehouse_name,
    max(d.expiry_date) AS expiry_date,
    max(d.supplier_invoice_no) AS supplier_invoice_no,
    count(*) AS event_count,
    sum(d.quantity) AS disposed_qty,
    sum(d.cost_value) AS disposed_cost
FROM public.inventory_dispositions d
WHERE d.batch_id IS NOT NULL OR d.batch_number IS NOT NULL
GROUP BY d.batch_id, d.batch_number, d.product_id, d.warehouse_id
ORDER BY disposed_cost DESC;

-- Unified credit note trail: disposition CNs + scheme CNs (for GST packs)
CREATE OR REPLACE VIEW public.v_all_supplier_credit_activity AS
SELECT
    'disposition'::text AS source,
    d.id AS source_id,
    d.supplier_name,
    d.credit_note_number,
    d.credit_note_date,
    d.cn_taxable_value AS taxable_value,
    d.cn_cgst AS cgst,
    d.cn_sgst AS sgst,
    d.cn_igst AS igst,
    d.cn_total AS total_amount,
    d.compensated_amount AS actual_amount,
    d.compensation_status AS status,
    d.product_id,
    d.batch_number,
    d.event_date,
    d.grn_id
FROM public.inventory_dispositions d
WHERE d.credit_note_number IS NOT NULL AND d.credit_note_number <> ''
UNION ALL
SELECT
    'scheme'::text AS source,
    s.id AS source_id,
    s.supplier_name,
    s.credit_note_number,
    s.credit_note_date,
    COALESCE(s.taxable_value, 0) AS taxable_value,
    COALESCE(s.cgst, 0) AS cgst,
    COALESCE(s.sgst, 0) AS sgst,
    COALESCE(s.igst, 0) AS igst,
    s.actual_amount AS total_amount,
    s.actual_amount,
    s.status,
    s.product_id,
    NULL::text AS batch_number,
    COALESCE(s.credit_note_date, left(s.created_at::text, 10)) AS event_date,
    s.grn_id
FROM public.supplier_credit_notes s;

COMMENT ON TABLE public.inventory_dispositions IS
  'Supplier returns, free near-expiry distribution, write-offs; reduces stock; optional GST credit note fields';
COMMENT ON VIEW public.v_open_supplier_claims IS
  'Returns still waiting for supplier credit note / settlement';
COMMENT ON VIEW public.v_batch_disposition_impact IS
  'Batch-level disposed qty and cost for FEFO / claim audit';
COMMENT ON VIEW public.v_all_supplier_credit_activity IS
  'Combined disposition CNs and scheme CNs for GST reporting';

-- 008: customer expiry-return tracking (send to company / throw out)
ALTER TABLE public.inventory_dispositions ADD COLUMN IF NOT EXISTS return_tracking jsonb;
