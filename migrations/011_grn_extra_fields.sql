-- Store every GRN field that has no column of its own (place of supply, billed-to / shipped-to, overall discount,
-- import warnings, stock-posted flag, ...). Safe to run any time; the app works without it.
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS extra JSONB;
