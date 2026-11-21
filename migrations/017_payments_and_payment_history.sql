-- ================================================================
-- 017 — Dedicated public.payments & public.payment_history tables
-- Additive, idempotent, zero-downtime migration for live data.
-- Never drops or alters bills.amount_paid or app_collections['payments'].
-- ================================================================

-- 1. PAYMENTS TABLE (one row per receipt, advance, refund, or advance-adjustment)
CREATE TABLE IF NOT EXISTS public.payments (
    id                 TEXT PRIMARY KEY,
    bill_id            BIGINT, -- Soft link to bills.id (allows legacy / deleted bill IDs without FK failure)
    customer_id        TEXT,
    customer_name      TEXT NOT NULL DEFAULT '',
    customer_phone     TEXT DEFAULT '',
    salesman_id        TEXT,
    payment_date       TEXT NOT NULL,
    amount             NUMERIC(12, 2) NOT NULL DEFAULT 0,
    mode               TEXT NOT NULL DEFAULT 'cash',
    entry_kind         TEXT NOT NULL DEFAULT 'receipt'
                           CHECK (entry_kind IN ('receipt', 'advance', 'refund', 'advance_adjustment')),
    is_advance         BOOLEAN NOT NULL DEFAULT FALSE,
    is_refund          BOOLEAN NOT NULL DEFAULT FALSE,
    is_advance_applied BOOLEAN NOT NULL DEFAULT FALSE,
    applied_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0,
    source_payment_id  TEXT,
    source_bill_id     BIGINT,
    reference_note     TEXT DEFAULT '',
    recorded_by        TEXT DEFAULT '',
    deleted_at         TIMESTAMPTZ,
    deleted_by         TEXT,
    delete_reason      TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_bill_id ON public.payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON public.payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_updated_at ON public.payments(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_source_payment_id ON public.payments(source_payment_id);

-- 2. PAYMENT HISTORY TABLE (append-only audit log; survives payment deletes)
CREATE TABLE IF NOT EXISTS public.payment_history (
    id            TEXT PRIMARY KEY,
    payment_id    TEXT,
    bill_id       BIGINT,
    customer_name TEXT DEFAULT '',
    action        TEXT NOT NULL,
    amount        NUMERIC(12, 2),
    note          TEXT DEFAULT '',
    changed_by    TEXT NOT NULL DEFAULT 'Admin',
    before_data   JSONB,
    after_data    JSONB,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_history_payment_id ON public.payment_history(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_bill_id ON public.payment_history(bill_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_changed_at ON public.payment_history(changed_at DESC);

-- 3. ROW LEVEL SECURITY (matches the rest of the app)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to payments" ON public.payments;
CREATE POLICY "Allow all access to payments"
    ON public.payments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to payment_history" ON public.payment_history;
CREATE POLICY "Allow all access to payment_history"
    ON public.payment_history FOR ALL USING (true) WITH CHECK (true);

-- 4. SAFE IDEMPOTENT BACKFILL FROM app_collections['payments']
-- Leaves app_collections['payments'] and bills.amount_paid completely untouched.
DO $$
DECLARE
    raw_list JSONB;
BEGIN
    SELECT data INTO raw_list FROM public.app_collections WHERE key = 'payments' LIMIT 1;
    IF raw_list IS NOT NULL AND jsonb_typeof(raw_list) = 'array' THEN
        INSERT INTO public.payments (
            id,
            bill_id,
            customer_id,
            customer_name,
            customer_phone,
            salesman_id,
            payment_date,
            amount,
            mode,
            entry_kind,
            is_advance,
            is_refund,
            is_advance_applied,
            applied_amount,
            source_payment_id,
            source_bill_id,
            reference_note,
            recorded_by,
            created_at,
            updated_at
        )
        SELECT
            elem->>'id',
            NULLIF(elem->>'billId', '')::BIGINT,
            NULLIF(elem->>'customerId', ''),
            COALESCE(elem->>'customerName', ''),
            COALESCE(elem->>'customerPhone', ''),
            NULLIF(elem->>'salesmanId', ''),
            COALESCE(NULLIF(elem->>'paymentDate', ''), LEFT(COALESCE(elem->>'createdAt', NOW()::TEXT), 10)),
            COALESCE(NULLIF(elem->>'amount', '')::NUMERIC, 0),
            COALESCE(NULLIF(elem->>'mode', ''), 'cash'),
            CASE
                WHEN COALESCE((elem->>'isRefund')::BOOLEAN, FALSE) OR COALESCE(NULLIF(elem->>'amount', '')::NUMERIC, 0) < 0 THEN 'refund'
                WHEN COALESCE(elem->>'billId', '') <> '' AND COALESCE(elem->>'referenceNote', '') LIKE 'Advance / credit adjusted%' THEN 'advance_adjustment'
                WHEN COALESCE((elem->>'isAdvance')::BOOLEAN, FALSE) OR (COALESCE(elem->>'billId', '') = '' AND COALESCE(elem->>'referenceNote', '') LIKE '%Advance / on account%') THEN 'advance'
                ELSE 'receipt'
            END,
            COALESCE((elem->>'isAdvance')::BOOLEAN, FALSE),
            COALESCE((elem->>'isRefund')::BOOLEAN, FALSE),
            COALESCE((elem->>'isAdvanceApplied')::BOOLEAN, FALSE),
            COALESCE(NULLIF(elem->>'appliedAmount', '')::NUMERIC, 0),
            NULLIF(elem->>'sourcePaymentId', ''),
            NULLIF(elem->>'sourceBillId', '')::BIGINT,
            COALESCE(elem->>'referenceNote', ''),
            COALESCE(elem->>'recordedBy', ''),
            COALESCE(NULLIF(elem->>'createdAt', '')::TIMESTAMPTZ, NOW()),
            COALESCE(NULLIF(elem->>'updatedAt', '')::TIMESTAMPTZ, NULLIF(elem->>'createdAt', '')::TIMESTAMPTZ, NOW())
        FROM jsonb_array_elements(raw_list) AS elem
        WHERE COALESCE(elem->>'id', '') <> ''
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
