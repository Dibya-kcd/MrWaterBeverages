-- Reason recorded for each shortage when a trip is closed (broken, short-loaded, sold but not billed, other).
-- Safe to run any time; the app works without it (the reasons then only live on the device).
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS shortage_reasons JSONB NOT NULL DEFAULT '{}'::JSONB;
