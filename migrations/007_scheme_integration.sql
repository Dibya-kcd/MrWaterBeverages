-- ================================================================
-- 007_scheme_integration.sql
-- Customer-facing scheme / promotion integration for billing.
-- Reversible. All new columns nullable or defaulted so existing
-- bills and promotions continue to work unchanged.
-- ================================================================

-- ----------------------------------------------------------------
-- UP
-- ----------------------------------------------------------------

-- 1) Extend promotions with versioning, limits, funding, config
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS usage_limit INTEGER,
  ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_customer_limit INTEGER,
  ADD COLUMN IF NOT EXISTS funded_by TEXT DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS supplier_share_percent NUMERIC(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Same extras on promotional_schemes if that table is used as a mirror
ALTER TABLE public.promotional_schemes
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS usage_limit INTEGER,
  ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_customer_limit INTEGER,
  ADD COLUMN IF NOT EXISTS funded_by TEXT DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS supplier_share_percent NUMERIC(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2) Bills: scheme snapshot fields (nullable → old invoices unaffected)
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS scheme_discount_total NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schemes_applied JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS scheme_version_map JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS you_saved NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_override_log JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS schemes_enabled_at_save BOOLEAN DEFAULT NULL;

-- 3) scheme_applications — one row per applied (or overridden) scheme on a bill
CREATE TABLE IF NOT EXISTS public.scheme_applications (
  id TEXT PRIMARY KEY,
  bill_id BIGINT NOT NULL,
  scheme_id BIGINT NOT NULL,
  scheme_version INTEGER NOT NULL DEFAULT 1,
  scheme_name TEXT NOT NULL DEFAULT '',
  customer_key TEXT DEFAULT '',
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  free_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
  free_product_id BIGINT,
  free_product_name TEXT DEFAULT '',
  free_value_at_cost NUMERIC(12, 2) DEFAULT 0,
  explanation TEXT DEFAULT '',
  skipped_reason TEXT DEFAULT '',
  overridden BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'reversed', 'skipped', 'overridden')),
  funded_by TEXT DEFAULT 'self',
  supplier_share_percent NUMERIC(5, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reversed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scheme_applications_bill_id
  ON public.scheme_applications(bill_id);
CREATE INDEX IF NOT EXISTS idx_scheme_applications_scheme_id
  ON public.scheme_applications(scheme_id);
CREATE INDEX IF NOT EXISTS idx_scheme_applications_customer
  ON public.scheme_applications(customer_key);
CREATE INDEX IF NOT EXISTS idx_scheme_applications_status
  ON public.scheme_applications(status);
CREATE INDEX IF NOT EXISTS idx_scheme_applications_created
  ON public.scheme_applications(created_at);

ALTER TABLE public.scheme_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to scheme_applications" ON public.scheme_applications;
CREATE POLICY "Allow all access to scheme_applications"
  ON public.scheme_applications FOR ALL USING (true) WITH CHECK (true);

-- 4) Per-customer usage helper table (optional; also derivable from scheme_applications)
CREATE TABLE IF NOT EXISTS public.scheme_customer_usage (
  scheme_id BIGINT NOT NULL,
  customer_key TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (scheme_id, customer_key)
);

ALTER TABLE public.scheme_customer_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to scheme_customer_usage" ON public.scheme_customer_usage;
CREATE POLICY "Allow all access to scheme_customer_usage"
  ON public.scheme_customer_usage FOR ALL USING (true) WITH CHECK (true);

-- 5) Audit log for scheme CRUD and manual overrides
CREATE TABLE IF NOT EXISTS public.scheme_audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  scheme_id BIGINT,
  bill_id BIGINT,
  actor TEXT DEFAULT '',
  details JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheme_audit_log_scheme
  ON public.scheme_audit_log(scheme_id);
CREATE INDEX IF NOT EXISTS idx_scheme_audit_log_created
  ON public.scheme_audit_log(created_at);

ALTER TABLE public.scheme_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to scheme_audit_log" ON public.scheme_audit_log;
CREATE POLICY "Allow all access to scheme_audit_log"
  ON public.scheme_audit_log FOR ALL USING (true) WITH CHECK (true);

-- 6) Report views
CREATE OR REPLACE VIEW public.v_scheme_performance AS
SELECT
  sa.scheme_id,
  sa.scheme_name,
  sa.scheme_version,
  DATE(sa.created_at) AS application_date,
  COUNT(DISTINCT sa.bill_id) FILTER (WHERE sa.status = 'applied') AS bills_count,
  COALESCE(SUM(sa.discount_amount) FILTER (WHERE sa.status = 'applied'), 0) AS discount_given,
  COALESCE(SUM(sa.free_qty) FILTER (WHERE sa.status = 'applied'), 0) AS free_units,
  COALESCE(SUM(sa.free_value_at_cost) FILTER (WHERE sa.status = 'applied'), 0) AS free_value_at_cost
FROM public.scheme_applications sa
GROUP BY sa.scheme_id, sa.scheme_name, sa.scheme_version, DATE(sa.created_at);

CREATE OR REPLACE VIEW public.v_free_stock_by_product AS
SELECT
  sa.free_product_id AS product_id,
  sa.free_product_name AS product_name,
  COALESCE(SUM(sa.free_qty) FILTER (WHERE sa.status = 'applied'), 0) AS free_units_given,
  COALESCE(SUM(sa.free_value_at_cost) FILTER (WHERE sa.status = 'applied'), 0) AS free_value_at_cost
FROM public.scheme_applications sa
WHERE sa.free_product_id IS NOT NULL
GROUP BY sa.free_product_id, sa.free_product_name;

CREATE OR REPLACE VIEW public.v_supplier_funded_claims AS
SELECT
  COALESCE(NULLIF(sa.funded_by, ''), 'self') AS funded_by,
  sa.scheme_id,
  sa.scheme_name,
  COALESCE(SUM(sa.discount_amount) FILTER (WHERE sa.status = 'applied'), 0) AS total_discount,
  COALESCE(SUM(sa.free_value_at_cost) FILTER (WHERE sa.status = 'applied'), 0) AS free_value_at_cost,
  COALESCE(AVG(sa.supplier_share_percent) FILTER (WHERE sa.status = 'applied'), 0) AS avg_supplier_share_pct,
  COALESCE(SUM(
    (sa.discount_amount + sa.free_value_at_cost) * (COALESCE(sa.supplier_share_percent, 0) / 100.0)
  ) FILTER (WHERE sa.status = 'applied'), 0) AS claimable_amount,
  COUNT(*) FILTER (WHERE sa.status = 'applied') AS application_count
FROM public.scheme_applications sa
WHERE COALESCE(sa.funded_by, 'self') <> 'self'
GROUP BY COALESCE(NULLIF(sa.funded_by, ''), 'self'), sa.scheme_id, sa.scheme_name;

CREATE OR REPLACE VIEW public.v_customer_scheme_benefits AS
SELECT
  sa.customer_key,
  COUNT(DISTINCT sa.bill_id) FILTER (WHERE sa.status = 'applied') AS bills_with_scheme,
  COALESCE(SUM(sa.discount_amount) FILTER (WHERE sa.status = 'applied'), 0) AS total_discount,
  COALESCE(SUM(sa.free_qty) FILTER (WHERE sa.status = 'applied'), 0) AS total_free_units,
  COALESCE(SUM(sa.free_value_at_cost) FILTER (WHERE sa.status = 'applied'), 0) AS total_free_value_at_cost
FROM public.scheme_applications sa
WHERE COALESCE(sa.customer_key, '') <> ''
GROUP BY sa.customer_key;

-- 7) Atomic usage increment helper (call from app with limit check in WHERE)
-- Example:
--   UPDATE public.promotions
--   SET used_count = used_count + $n, updated_at = NOW()
--   WHERE id = $id
--     AND (usage_limit IS NULL OR used_count + $n <= usage_limit);

COMMENT ON TABLE public.scheme_applications IS
  'Per-bill scheme application snapshot. status=reversed on cancel/edit reverse.';
COMMENT ON COLUMN public.bills.schemes_applied IS
  'JSON array snapshot of schemes applied at save time (versioned).';
COMMENT ON COLUMN public.promotions.version IS
  'Incremented on scheme edit; bills store the version they used.';

-- ----------------------------------------------------------------
-- DOWN (run manually to reverse)
-- ----------------------------------------------------------------
-- DROP VIEW IF EXISTS public.v_customer_scheme_benefits;
-- DROP VIEW IF EXISTS public.v_supplier_funded_claims;
-- DROP VIEW IF EXISTS public.v_free_stock_by_product;
-- DROP VIEW IF EXISTS public.v_scheme_performance;
-- DROP TABLE IF EXISTS public.scheme_audit_log;
-- DROP TABLE IF EXISTS public.scheme_customer_usage;
-- DROP TABLE IF EXISTS public.scheme_applications;
-- ALTER TABLE public.bills
--   DROP COLUMN IF EXISTS scheme_discount_total,
--   DROP COLUMN IF EXISTS schemes_applied,
--   DROP COLUMN IF EXISTS scheme_version_map,
--   DROP COLUMN IF EXISTS you_saved,
--   DROP COLUMN IF EXISTS manual_override_log,
--   DROP COLUMN IF EXISTS schemes_enabled_at_save;
-- ALTER TABLE public.promotions
--   DROP COLUMN IF EXISTS version,
--   DROP COLUMN IF EXISTS is_active,
--   DROP COLUMN IF EXISTS start_date,
--   DROP COLUMN IF EXISTS end_date,
--   DROP COLUMN IF EXISTS usage_limit,
--   DROP COLUMN IF EXISTS used_count,
--   DROP COLUMN IF EXISTS per_customer_limit,
--   DROP COLUMN IF EXISTS funded_by,
--   DROP COLUMN IF EXISTS supplier_share_percent,
--   DROP COLUMN IF EXISTS supplier_name,
--   DROP COLUMN IF EXISTS config,
--   DROP COLUMN IF EXISTS updated_at;
-- (Same DROP COLUMN list for promotional_schemes if desired.)
