-- Database safeguard checks for migrations/016. Run on a SCRATCH database only (never production):
--   createdb scratch && psql scratch -f migrations/016_gst_engine_foundation.sql && psql scratch -f tests/sql/016_gst_engine_foundation.check.sql
-- Expect every row PASS and a final "failed = 0".
\set ON_ERROR_STOP off
CREATE TEMP TABLE results(name text, ok boolean);
CREATE OR REPLACE FUNCTION pg_temp.expect_fail(name text, stmt text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN EXECUTE stmt; INSERT INTO results VALUES (name, false);
  EXCEPTION WHEN OTHERS THEN INSERT INTO results VALUES (name, true); END;
END $f$;
CREATE OR REPLACE FUNCTION pg_temp.expect_ok(name text, stmt text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN EXECUTE stmt; INSERT INTO results VALUES (name, true);
  EXCEPTION WHEN OTHERS THEN INSERT INTO results VALUES (name || ' [' || SQLERRM || ']', false); END;
END $f$;

SELECT pg_temp.expect_ok('profile: composition 2025-04-01..2026-06-30', $$INSERT INTO business_tax_profiles(gstin,registration_type,state_code,composition_category,effective_from,effective_to) VALUES ('21ABCDE1234F1ZX','composition','21','trader','2025-04-01','2026-06-30')$$);
SELECT pg_temp.expect_ok('profile: regular from 2026-07-01 (adjacent, no overlap)', $$INSERT INTO business_tax_profiles(gstin,registration_type,state_code,effective_from) VALUES ('21ABCDE1234F1ZX','regular','21','2026-07-01')$$);
SELECT pg_temp.expect_fail('profile: overlapping period is rejected', $$INSERT INTO business_tax_profiles(gstin,registration_type,state_code,effective_from,effective_to) VALUES ('21ABCDE1234F1ZX','regular','21','2026-06-01','2026-06-30')$$);
SELECT pg_temp.expect_fail('profile: composition without category rejected', $$INSERT INTO business_tax_profiles(business_id,gstin,registration_type,state_code,effective_from) VALUES ('b2','21ABCDE1234F1ZX','composition','21','2025-04-01')$$);
SELECT pg_temp.expect_fail('profile: registered without GSTIN rejected', $$INSERT INTO business_tax_profiles(business_id,registration_type,state_code,effective_from) VALUES ('b3','regular','21','2025-04-01')$$);
SELECT pg_temp.expect_ok('profile: another business may overlap dates (isolation)', $$INSERT INTO business_tax_profiles(business_id,registration_type,state_code,effective_from) VALUES ('b4','unregistered','21','2025-04-01')$$);

SELECT pg_temp.expect_ok('product: 12% to 2025-09-21', $$INSERT INTO product_tax_profiles(product_id,hsn_code,taxability,gst_rate_pct,effective_from,effective_to) VALUES ('7','22029920','taxable',12,'2025-01-01','2025-09-21')$$);
SELECT pg_temp.expect_ok('product: 5% from 2025-09-22', $$INSERT INTO product_tax_profiles(product_id,hsn_code,taxability,gst_rate_pct,effective_from) VALUES ('7','22029920','taxable',5,'2025-09-22')$$);
SELECT pg_temp.expect_fail('product: overlapping rate period rejected', $$INSERT INTO product_tax_profiles(product_id,hsn_code,taxability,gst_rate_pct,effective_from) VALUES ('7','22029920','taxable',18,'2025-06-01')$$);
SELECT pg_temp.expect_fail('product: invalid HSN rejected', $$INSERT INTO product_tax_profiles(product_id,hsn_code,taxability,gst_rate_pct,effective_from) VALUES ('8','22','taxable',18,'2025-01-01')$$);

INSERT INTO transaction_tax_snapshots(document_ref,document_type,fin_year,registration_type,doc_date,taxable_value,invoice_value,rule_version,payload,checksum)
  VALUES ('BOS/2526/0001','bill_of_supply','2025-26','composition','2026-02-01',50000,50000,'v1','{}','c1');
SELECT pg_temp.expect_fail('snapshot: duplicate document number rejected', $$INSERT INTO transaction_tax_snapshots(document_ref,document_type,fin_year,registration_type,doc_date,taxable_value,invoice_value,rule_version,payload,checksum) VALUES ('BOS/2526/0001','bill_of_supply','2025-26','composition','2026-02-01',1,1,'v1','{}','c')$$);
SELECT pg_temp.expect_ok('snapshot: same number in NEXT financial year allowed', $$INSERT INTO transaction_tax_snapshots(document_ref,document_type,fin_year,registration_type,doc_date,taxable_value,invoice_value,rule_version,payload,checksum) VALUES ('BOS/2526/0001','bill_of_supply','2026-27','composition','2026-04-02',1,1,'v1','{}','c')$$);
SELECT pg_temp.expect_fail('snapshot: composition bill of supply with CGST rejected', $$INSERT INTO transaction_tax_snapshots(document_ref,document_type,fin_year,registration_type,doc_date,taxable_value,cgst_amount,invoice_value,rule_version,payload,checksum) VALUES ('BOS/2526/0002','bill_of_supply','2025-26','composition','2026-02-01',100,9,109,'v1','{}','c')$$);
SELECT pg_temp.expect_fail('snapshot: composition with ITC rejected', $$INSERT INTO transaction_tax_snapshots(document_ref,document_type,fin_year,registration_type,doc_date,taxable_value,itc_eligible_amount,invoice_value,rule_version,payload,checksum) VALUES ('PUR/1','purchase_invoice','2025-26','composition','2026-02-01',100000,18000,118000,'v1','{}','c')$$);
SELECT pg_temp.expect_ok('snapshot: composition purchase, tax in cost, ITC zero', $$INSERT INTO transaction_tax_snapshots(document_ref,document_type,fin_year,registration_type,doc_date,taxable_value,cgst_amount,sgst_amount,invoice_value,rule_version,payload,checksum) VALUES ('PUR/2','purchase_invoice','2025-26','composition','2026-02-01',100000,9000,9000,118000,'v1','{}','c')$$);
SELECT pg_temp.expect_fail('snapshot: UPDATE blocked (immutable)', $$UPDATE transaction_tax_snapshots SET taxable_value = 1$$);
SELECT pg_temp.expect_fail('snapshot: DELETE blocked (immutable)', $$DELETE FROM transaction_tax_snapshots$$);

SELECT pg_temp.expect_ok('liability: first posting', $$INSERT INTO composition_liability_ledger(snapshot_id,fin_year,quarter,state_code,turnover_base,cgst,sgst) SELECT id,'2025-26','Q4','21',50000,250,250 FROM transaction_tax_snapshots WHERE document_ref='BOS/2526/0001' AND fin_year='2025-26'$$);
SELECT pg_temp.expect_fail('liability: duplicate posting for same document rejected', $$INSERT INTO composition_liability_ledger(snapshot_id,fin_year,quarter,state_code,turnover_base,cgst,sgst) SELECT id,'2025-26','Q4','21',50000,250,250 FROM transaction_tax_snapshots WHERE document_ref='BOS/2526/0001' AND fin_year='2025-26'$$);

SELECT pg_temp.expect_fail('eway: "generated" without number/ack rejected', $$INSERT INTO eway_bills(document_ref,status,consignment_value,from_state_code,to_state_code) VALUES ('INV/1','generated',60000,'21','21')$$);
SELECT pg_temp.expect_ok('eway: generated with confirmation accepted', $$INSERT INTO eway_bills(document_ref,status,ewb_no,provider_ref,generated_at,consignment_value,from_state_code,to_state_code) VALUES ('INV/1','generated','123456789012','ack-1',now(),60000,'21','21')$$);
SELECT pg_temp.expect_fail('eway: duplicate EWB number rejected', $$INSERT INTO eway_bills(document_ref,status,ewb_no,provider_ref,generated_at,consignment_value,from_state_code,to_state_code) VALUES ('INV/2','generated','123456789012','ack-2',now(),60000,'21','21')$$);

SELECT pg_temp.expect_ok('rule: insert', $$INSERT INTO gst_tax_rules(rule_id,rule_key,scope,value,effective_from,reference) VALUES ('t1','ewb.threshold','IN-21','50000','2018-06-01','Notif 8003/CT')$$);
SELECT pg_temp.expect_ok('rule: update', $$SET LOCAL app.user_id='admin-1'; UPDATE gst_tax_rules SET value='100000'::jsonb WHERE rule_id='t1'$$);

-- numbering
DO $$ DECLARE n1 text; n2 text; n3 text; BEGIN
  n1 := next_document_number('default','bos','2025-26','BOS');
  n2 := next_document_number('default','bos','2025-26','BOS');
  n3 := next_document_number('default','bos','2026-27','BOS');
  INSERT INTO results VALUES ('numbering: '||n1||', '||n2||', '||n3||' (FY restarts)', n1='BOS/2526/0001' AND n2='BOS/2526/0002' AND n3='BOS/2627/0001');
END $$;
SELECT pg_temp.expect_fail('numbering: >16 chars rejected', $$SELECT next_document_number('default','x','2025-26','AVERYLONGPREFIX')$$);
INSERT INTO results SELECT 'audit log captured rule UPDATE with before/after', count(*) >= 1 FROM tax_audit_log WHERE table_name='gst_tax_rules' AND action='UPDATE' AND before_row IS NOT NULL AND after_row IS NOT NULL;
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS r, name FROM results ORDER BY ok, name;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;
