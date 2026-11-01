-- Settlement drafts: crates counted on the Record Return screen before the trip is closed.
-- Safe to run any time; without it the draft only lives on the device that typed it.
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS draft_returned JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cash_handed_in NUMERIC;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cash_short_booked NUMERIC;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cash_recoveries JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cash_short_written_off BOOLEAN NOT NULL DEFAULT FALSE;
