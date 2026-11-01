-- Audit trail for edited invoices and cancelled customer returns. Safe to run more than once.
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS edit_history JSONB;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS cancelled_returns JSONB;
