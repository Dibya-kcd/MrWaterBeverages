-- Store every Bill field that has no column of its own (invoice discount, round-off, invoice type, payment mode /
-- date / note, trip link, customer id, ...). Safe to run any time; the app works without it but those fields are only
-- kept on the device / server copy until this column exists.
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS extra JSONB;
