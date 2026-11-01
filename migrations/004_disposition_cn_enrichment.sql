-- ============================================================
-- MrWater — Disposition / CN enrichment (optional)
-- Run in Supabase: Dashboard → SQL Editor → New query → Run
-- Safe to re-run (IF NOT EXISTS).
--
-- Needed only if you use cloud sync AND want these new fields
-- stored in Postgres (approval, claim scheme, payment log).
-- App still works offline via local cache without this migration.
-- ============================================================

ALTER TABLE public.inventory_dispositions
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'not_required';

ALTER TABLE public.inventory_dispositions
  ADD COLUMN IF NOT EXISTS claim_scheme TEXT;

ALTER TABLE public.inventory_dispositions
  ADD COLUMN IF NOT EXISTS compensation_payments JSONB DEFAULT '[]'::jsonb;

-- Soft constraint (not CHECK) so older rows remain valid
COMMENT ON COLUMN public.inventory_dispositions.approval_status IS
  'not_required | pending_approval | approved | rejected';
COMMENT ON COLUMN public.inventory_dispositions.claim_scheme IS
  'Supplier scheme expected on CN: value_credit, discount_pct, free_bogo, near_expiry_swap, none';
COMMENT ON COLUMN public.inventory_dispositions.compensation_payments IS
  'JSON array of partial CN receipts: [{id, date, amount, cnNumber, note}]';

-- Optional: widen views are unchanged; new columns are available for CA queries
