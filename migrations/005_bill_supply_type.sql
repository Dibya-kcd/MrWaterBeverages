-- Optional: B2C default supply classification on bills
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS supply_type TEXT DEFAULT 'B2C';
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS customer_gstin TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS is_retrospective BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN public.bills.supply_type IS 'B2C (default) or B2B when customer GSTIN present';
