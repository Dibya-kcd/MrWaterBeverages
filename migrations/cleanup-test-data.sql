-- ============================================================================
-- CLEAN-UP OF AUTOMATED-TEST DATA IN SUPABASE  (final version)
-- Supabase's SQL editor shows only the LAST statement's result: run ONE block at a time.
-- ORDER:  0) close the app on every device and deploy the new version + restart server
--         1) tombstones  2) JSON collections  3) tables  4) verify  5) clear site data on every device
-- Review the SELECT blocks first. Keep a backup. Nothing below touches RADHIKA ENTERPRISES GRNs.
-- ============================================================================

-- ---------- REVIEW (read-only) ----------
-- R1) test rows per JSON collection (customers, payments, orders, grns, products, stock ...)
with sig as (select '(Pay Shop|Sync Shop|Edit Shop|Del Shop|Q Shop|Z Shop|B Shop|Reg Shop|SR Shop|Book Shop|Alpha Stores|Beta Stores|Alpha Mega Stores|PAY PRODUCT|SYNC PRODUCT|SR PRODUCT|REG [A-Z ]*PRODUCT|REG GODOWN|EDIT PRODUCT|DELETE TEST|DISP TEST|ID PRODUCT|Integration Test|SR Supplier|Reg Supplier|Test Distributors|Sample Supplier|9100000[0-9]{3}|9111111111|9222222222|92000000[0-9]{2})'::text as re)
select c.key, count(*) as test_rows
  from public.app_collections c, sig, jsonb_array_elements(c.data) e
 where jsonb_typeof(c.data) = 'array' and e::text ~* sig.re
 group by c.key order by test_rows desc;

-- R2) test bills in the bills table
select id, retailer, phone, date, total from public.bills
 where retailer ~* '^(Pay Shop|Sync Shop|Edit Shop|Del Shop|Q Shop|Z Shop|B Shop|Reg Shop|SR Shop|Book Shop|Alpha Stores|Beta Stores|Alpha Mega Stores)'
    or phone ~ '^(9100000|9111111111|9222222222|92000000)' order by id;

-- R3) all GRNs (real = RADHIKA ENTERPRISES)
select id, grn_number, invoice_no, supplier_name, inward_date, grand_total from public.grns order by inward_date desc, grn_number;

-- R4) test products
select id, name from public.products
 where name ~ '^(PAY|SYNC|SR|REG|ID|EDIT|DISP|DELETE) .*(PRODUCT|TEST|GODOWN)' or name ~* '^(Integration Test|DECOY)';

-- ---------- STEP 1: TOMBSTONES (stop stale devices re-creating deleted records) ----------
-- 1a) GRNs
insert into public.app_collections (key, data, updated_at)
values ('deleted_grn_ids',
  '["grn_mvnu9lhqh35u","grn_mvnu6kyo77vp","grn_mvnu915q7btd","grn_mvnu4u2qo7yk","grn_mvnu5b7lnyfg","grn_mvnu914ni1x1","grn_mvnu5gphu32i","grn_mvnu913jrmda"]'::jsonb, now())
on conflict (key) do update
  set data = (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements(public.app_collections.data || excluded.data) x), updated_at = now();

-- 1b) Bills (#101 and #416-#436 seen in your list; add any other test bill ids from R2)
insert into public.app_collections (key, data, updated_at)
select 'deleted_bill_ids', jsonb_agg(n), now() from (select 101 as n union all select generate_series(416, 436)) t
on conflict (key) do update
  set data = (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements(public.app_collections.data || excluded.data) x), updated_at = now();

-- ---------- STEP 2: JSON COLLECTIONS ----------
-- 2a) names / phones / suppliers / product names, across all collections
with sig as (select '(Pay Shop|Sync Shop|Edit Shop|Del Shop|Q Shop|Z Shop|B Shop|Reg Shop|SR Shop|Book Shop|Alpha Stores|Beta Stores|Alpha Mega Stores|PAY PRODUCT|SYNC PRODUCT|SR PRODUCT|REG [A-Z ]*PRODUCT|REG GODOWN|EDIT PRODUCT|DELETE TEST|DISP TEST|ID PRODUCT|Integration Test|SR Supplier|Reg Supplier|Test Distributors|Sample Supplier|9100000[0-9]{3}|9111111111|9222222222|92000000[0-9]{2})'::text as re)
update public.app_collections c
   set data = coalesce((select jsonb_agg(e) from jsonb_array_elements(c.data) e where e::text !~* (select re from sig)), '[]'::jsonb), updated_at = now()
 where jsonb_typeof(c.data) = 'array'
   and c.key not like 'deleted\_%'
   and exists (select 1 from jsonb_array_elements(c.data) e where e::text ~* (select re from sig));

-- 2b) the 8 test GRNs by id
update public.app_collections c
   set data = coalesce((select jsonb_agg(e) from jsonb_array_elements(c.data) e
     where e->>'id' not in ('grn_mvnu9lhqh35u','grn_mvnu6kyo77vp','grn_mvnu915q7btd','grn_mvnu4u2qo7yk','grn_mvnu5b7lnyfg','grn_mvnu914ni1x1','grn_mvnu5gphu32i','grn_mvnu913jrmda')), '[]'::jsonb), updated_at = now()
 where c.key in ('inward_grns','grns');

-- 2c) test products 26 and 28 (each collection uses a different field for the product id)
update public.app_collections c set data = coalesce((select jsonb_agg(e) from jsonb_array_elements(c.data) e where e->>'id' not in ('26','28')), '[]'::jsonb), updated_at = now() where c.key = 'products';
update public.app_collections c set data = coalesce((select jsonb_agg(e) from jsonb_array_elements(c.data) e where e->>'product_id' not in ('26','28')), '[]'::jsonb), updated_at = now() where c.key = 'inventory_items';
update public.app_collections c set data = coalesce((select jsonb_agg(e) from jsonb_array_elements(c.data) e where e->>'productId' not in ('26','28')), '[]'::jsonb), updated_at = now() where c.key in ('inventory_batches','stock_ledger_entries');

-- ---------- STEP 3: TABLES ----------
-- 3a) bills
delete from public.bills
 where retailer ~* '^(Pay Shop|Sync Shop|Edit Shop|Del Shop|Q Shop|Z Shop|B Shop|Reg Shop|SR Shop|Book Shop|Alpha Stores|Beta Stores|Alpha Mega Stores)'
    or phone ~ '^(9100000|9111111111|9222222222|92000000)'
returning id, retailer;

-- 3b) trips (VAN-9 test trip)
delete from public.trips where (vehicle = 'VAN-9' and date = '2026-09-29') or vehicle = 'OD15AF7869' returning id, vehicle;

-- 3c) GRNs (8 test ones; must return exactly 8 rows from SR Supplier / Reg Supplier)
delete from public.grns where id in ('grn_mvnu9lhqh35u','grn_mvnu6kyo77vp','grn_mvnu915q7btd','grn_mvnu4u2qo7yk','grn_mvnu5b7lnyfg','grn_mvnu914ni1x1','grn_mvnu5gphu32i','grn_mvnu913jrmda')
returning id, grn_number, supplier_name;

-- 3d) stock batches created by those GRNs
delete from public.inventory_batches
 where id like any (array['batch\_grn\_mvnu9lhqh35u\_%','batch\_grn\_mvnu6kyo77vp\_%','batch\_grn\_mvnu915q7btd\_%','batch\_grn\_mvnu4u2qo7yk\_%','batch\_grn\_mvnu5b7lnyfg\_%','batch\_grn\_mvnu914ni1x1\_%','batch\_grn\_mvnu5gphu32i\_%','batch\_grn\_mvnu913jrmda\_%'])
returning id, product_id, quantity;

-- 3e) test products and their batches (or use the new "Delete product" button in the app)
delete from public.inventory_batches where product_id in (26, 28);
delete from public.products where id in (26, 28) returning id, name;

-- ---------- STEP 4: VERIFY (each should return no test rows) ----------
-- run R1 again; then:
select b.id, b.product_id, b.batch_number, b.quantity
  from public.inventory_batches b left join public.products p on p.id = b.product_id where p.id is null;   -- orphan batches

-- ---------- STEP 5 ----------
-- Restart the server, then on EVERY phone/PC clear the site data for the app and reload.
