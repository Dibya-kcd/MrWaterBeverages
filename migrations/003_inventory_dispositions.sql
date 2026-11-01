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
