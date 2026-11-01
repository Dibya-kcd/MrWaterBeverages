-- Customer expiry returns: track whether scrapped crates are sent back to the company or thrown out.
-- Safe to run more than once.
ALTER TABLE public.inventory_dispositions
  ADD COLUMN IF NOT EXISTS return_tracking jsonb;
