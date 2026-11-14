-- 016_gst_engine_foundation.sql
-- GST Tax & Compliance Engine - Phase 2 foundation. ADDITIVE ONLY: creates new tables, never alters or drops
-- existing ones, and nothing in the current app reads them yet. Safe to run repeatedly (IF NOT EXISTS).
-- Run in the Supabase SQL editor after migrations 003-014.
--
-- Multi-business ready: every table carries business_id (default 'default' for today's single business).
-- Row Level Security is ENABLED with NO policies: only the server (service role) can touch these tables until
-- real policies are written during the security roll-out (see security/RUNBOOK.md).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Business GST registration, effective-dated. Never apply today's profile to an old document. --------------
CREATE TABLE IF NOT EXISTS public.business_tax_profiles (
  id                    BIGSERIAL PRIMARY KEY,
  business_id           TEXT NOT NULL DEFAULT 'default',
  legal_name            TEXT,
  trade_name            TEXT,
  gstin                 VARCHAR(15),
  pan                   VARCHAR(10),
  registration_type     TEXT NOT NULL CHECK (registration_type IN ('regular','composition','unregistered')),
  state_code            VARCHAR(2) NOT NULL,
  composition_category  TEXT CHECK (composition_category IN ('trader','manufacturer','restaurant','service')),
  effective_from        DATE NOT NULL,
  effective_to          DATE,
  config_version        INTEGER NOT NULL DEFAULT 1,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT btp_period_valid CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT btp_composition_needs_category CHECK (registration_type <> 'composition' OR composition_category IS NOT NULL),
  CONSTRAINT btp_registered_needs_gstin CHECK (registration_type = 'unregistered' OR gstin IS NOT NULL),
  -- two profiles of one business can never cover the same day
  CONSTRAINT btp_no_overlap EXCLUDE USING gist (
    business_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  )
);

-- 2. Product tax classification, effective-dated, independent of the composition rate. ------------------------
CREATE TABLE IF NOT EXISTS public.product_tax_profiles (
  id               BIGSERIAL PRIMARY KEY,
  business_id      TEXT NOT NULL DEFAULT 'default',
  product_id       TEXT NOT NULL,
  hsn_code         VARCHAR(8) NOT NULL CHECK (hsn_code ~ '^[0-9]{4}([0-9]{2}([0-9]{2})?)?$'),
  taxability       TEXT NOT NULL CHECK (taxability IN ('taxable','exempt','nil_rated','non_gst')),
  gst_rate_pct     NUMERIC(6,3) NOT NULL CHECK (gst_rate_pct >= 0),
  cess_rate_pct    NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (cess_rate_pct >= 0),
  prices_include_tax BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from   DATE NOT NULL,
  effective_to     DATE,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ptp_period_valid CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT ptp_no_overlap EXCLUDE USING gist (
    business_id WITH =, product_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  )
);
CREATE INDEX IF NOT EXISTS ptp_lookup ON public.product_tax_profiles (business_id, product_id, effective_from);

-- 3. Legal rules: rates, limits, thresholds, wording. Edited by an administrator, never by a code deploy. -------
CREATE TABLE IF NOT EXISTS public.gst_tax_rules (
  id                 BIGSERIAL PRIMARY KEY,
  rule_id            TEXT NOT NULL UNIQUE,            -- stable id used in tax snapshots, e.g. 'comp-rate-trader-2025'
  rule_key           TEXT NOT NULL,                   -- e.g. 'composition.rate'
  scope              TEXT,                            -- e.g. 'trader', 'IN-21', 'central'
  value              JSONB NOT NULL,
  effective_from     DATE NOT NULL,
  effective_to       DATE,
  reference          TEXT NOT NULL,                   -- notification / section / rule
  review_status      TEXT NOT NULL DEFAULT 'pending_ca_review' CHECK (review_status IN ('pending_ca_review','ca_approved')),
  reviewed_by        TEXT,
  reviewed_at        TIMESTAMPTZ,
  note               TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gtr_period_valid CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS gtr_lookup ON public.gst_tax_rules (rule_key, scope, effective_from);

-- 4. Financial-year-wise document numbering, atomic and gap-free per (business, series, FY). ------------------
CREATE TABLE IF NOT EXISTS public.document_number_series (
  business_id   TEXT NOT NULL DEFAULT 'default',
  doc_type      TEXT NOT NULL,                        -- tax_invoice, bill_of_supply, credit_note, ...
  fin_year      TEXT NOT NULL,                        -- '2025-26'
  prefix        TEXT NOT NULL,
  last_number   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, doc_type, fin_year)
);

CREATE OR REPLACE FUNCTION public.next_document_number(p_business TEXT, p_doc_type TEXT, p_fy TEXT, p_prefix TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n INTEGER; no TEXT;
BEGIN
  INSERT INTO public.document_number_series (business_id, doc_type, fin_year, prefix, last_number)
  VALUES (p_business, p_doc_type, p_fy, p_prefix, 1)
  ON CONFLICT (business_id, doc_type, fin_year) DO UPDATE SET last_number = public.document_number_series.last_number + 1
  RETURNING last_number INTO n;
  -- BOS/2526/0001 : <prefix>/<yy><yy>/<4-digit serial>; GST allows at most 16 characters
  no := p_prefix || '/' || substr(p_fy, 3, 2) || substr(p_fy, 6, 2) || '/' || lpad(n::text, 4, '0');
  IF length(no) > 16 THEN RAISE EXCEPTION 'Document number % exceeds 16 characters', no; END IF;
  RETURN no;
END $$;

-- 5. Immutable tax snapshot of every finalised document. ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transaction_tax_snapshots (
  id                    BIGSERIAL PRIMARY KEY,
  business_id           TEXT NOT NULL DEFAULT 'default',
  document_ref          TEXT NOT NULL,                -- invoice / GRN / credit note number
  document_type         TEXT NOT NULL,
  fin_year              TEXT NOT NULL,
  registration_type     TEXT NOT NULL,
  doc_date              DATE NOT NULL,
  taxable_value         NUMERIC(14,2) NOT NULL,
  cgst_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  cess_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  itc_eligible_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  itc_blocked_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  itc_pending_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  rcm_tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  composition_tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  invoice_value         NUMERIC(14,2) NOT NULL,
  rule_version          TEXT NOT NULL,
  payload               JSONB NOT NULL,               -- full TaxInput + TaxResult as computed
  checksum              TEXT NOT NULL,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tts_unique_doc UNIQUE (business_id, document_type, fin_year, document_ref),
  -- a composition taxpayer can never carry output tax or ITC on a snapshot
  CONSTRAINT tts_composition_no_itc CHECK (registration_type <> 'composition' OR (itc_eligible_amount = 0 AND itc_blocked_amount = 0 AND itc_pending_amount = 0)),
  CONSTRAINT tts_composition_no_output_tax CHECK (
    registration_type <> 'composition' OR document_type NOT IN ('bill_of_supply','sales_return_voucher')
    OR (cgst_amount = 0 AND sgst_amount = 0 AND igst_amount = 0 AND cess_amount = 0))
);

CREATE OR REPLACE FUNCTION public.block_snapshot_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'transaction_tax_snapshots is append-only: correct a document with a credit/debit note or cancellation, not an edit';
END $$;
DROP TRIGGER IF EXISTS tts_immutable ON public.transaction_tax_snapshots;
CREATE TRIGGER tts_immutable BEFORE UPDATE OR DELETE ON public.transaction_tax_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.block_snapshot_changes();

-- 6. Composition liability ledger and ITC ledger: append-only; corrections are new (negative) rows. --------------
CREATE TABLE IF NOT EXISTS public.composition_liability_ledger (
  id             BIGSERIAL PRIMARY KEY,
  business_id    TEXT NOT NULL DEFAULT 'default',
  snapshot_id    BIGINT NOT NULL REFERENCES public.transaction_tax_snapshots(id),
  fin_year       TEXT NOT NULL,
  quarter        TEXT NOT NULL,                       -- 'Q1'..'Q4'
  state_code     VARCHAR(2) NOT NULL,
  turnover_base  NUMERIC(14,2) NOT NULL,
  cgst           NUMERIC(14,2) NOT NULL,
  sgst           NUMERIC(14,2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id)                                -- one posting per document: no duplicate accounting entries
);

CREATE TABLE IF NOT EXISTS public.itc_ledger (
  id             BIGSERIAL PRIMARY KEY,
  business_id    TEXT NOT NULL DEFAULT 'default',
  snapshot_id    BIGINT NOT NULL REFERENCES public.transaction_tax_snapshots(id),
  status         TEXT NOT NULL CHECK (status IN ('eligible','blocked','pending','reversed')),
  cgst           NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst           NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst           NUMERIC(14,2) NOT NULL DEFAULT 0,
  cess           NUMERIC(14,2) NOT NULL DEFAULT 0,
  period         TEXT,                                -- 'YYYY-MM' return period it is claimed in
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. E-Way Bills: a bill is 'generated' only with provider confirmation. --------------------------------------
CREATE TABLE IF NOT EXISTS public.eway_bills (
  id               BIGSERIAL PRIMARY KEY,
  business_id      TEXT NOT NULL DEFAULT 'default',
  document_ref     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','generated','cancelled','rejected')),
  ewb_no           VARCHAR(12),
  provider_ref     TEXT,                              -- GSP / NIC acknowledgement id
  consignment_value NUMERIC(14,2) NOT NULL,
  from_state_code  VARCHAR(2) NOT NULL,
  to_state_code    VARCHAR(2) NOT NULL,
  transporter_id   TEXT,
  vehicle_no       TEXT,
  distance_km      INTEGER,
  valid_until      TIMESTAMPTZ,
  generated_at     TIMESTAMPTZ,
  rule_ids         TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ewb_generated_needs_number CHECK (status <> 'generated' OR (ewb_no ~ '^[0-9]{12}$' AND generated_at IS NOT NULL AND provider_ref IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ewb_unique_no ON public.eway_bills (business_id, ewb_no) WHERE ewb_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.eway_bill_events (
  id            BIGSERIAL PRIMARY KEY,
  eway_bill_id  BIGINT NOT NULL REFERENCES public.eway_bills(id),
  event         TEXT NOT NULL,                        -- generated, vehicle_updated, extended, cancelled, rejected, delivered
  detail        JSONB,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Audit trail for every tax-related configuration change (before/after, who, when). -------------------------
CREATE TABLE IF NOT EXISTS public.tax_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  row_id      TEXT,
  action      TEXT NOT NULL,
  before_row  JSONB,
  after_row   JSONB,
  actor       TEXT,                                   -- set per request: SELECT set_config('app.user_id', '<id>', true)
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.log_tax_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.tax_audit_log (table_name, row_id, action, before_row, after_row, actor)
  VALUES (TG_TABLE_NAME,
          COALESCE((CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'id', ''),
          TG_OP,
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
          current_setting('app.user_id', true));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS audit_btp ON public.business_tax_profiles;
CREATE TRIGGER audit_btp AFTER INSERT OR UPDATE OR DELETE ON public.business_tax_profiles FOR EACH ROW EXECUTE FUNCTION public.log_tax_change();
DROP TRIGGER IF EXISTS audit_ptp ON public.product_tax_profiles;
CREATE TRIGGER audit_ptp AFTER INSERT OR UPDATE OR DELETE ON public.product_tax_profiles FOR EACH ROW EXECUTE FUNCTION public.log_tax_change();
DROP TRIGGER IF EXISTS audit_gtr ON public.gst_tax_rules;
CREATE TRIGGER audit_gtr AFTER INSERT OR UPDATE OR DELETE ON public.gst_tax_rules FOR EACH ROW EXECUTE FUNCTION public.log_tax_change();
DROP TRIGGER IF EXISTS audit_eway ON public.eway_bills;
CREATE TRIGGER audit_eway AFTER INSERT OR UPDATE OR DELETE ON public.eway_bills FOR EACH ROW EXECUTE FUNCTION public.log_tax_change();

-- 9. Lock the new tables down (server/service role only until real policies exist). ---------------------------
ALTER TABLE public.business_tax_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tax_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_tax_rules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_number_series       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tax_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.composition_liability_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_ledger                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eway_bills                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eway_bill_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_audit_log                ENABLE ROW LEVEL SECURITY;
