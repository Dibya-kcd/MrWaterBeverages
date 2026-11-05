-- Store the product-master fields that have no column of their own (units per crate, brand, returnable, active,
-- rates include GST, barcode, deposit per unit). Before this they were never saved to the cloud, so a refresh let the
-- cloud copy overwrite the local value. Safe to run any time; the app works without it (it just keeps them on-device).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS extra JSONB;
