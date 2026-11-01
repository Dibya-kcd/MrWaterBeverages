-- ============================================================================================
-- LOCK DOWN THE DATABASE  (NOT applied automatically - read security/RUNBOOK.md first)
--
-- Today every table has an "allow everything" policy and the app ships the public key, so anyone who finds the app
-- URL can read or change bills, customers and payments. This script removes those policies and lets ONLY signed-in
-- Supabase Auth users (and the server's service-role key, which always bypasses RLS) reach the data.
--
-- Do NOT run it before: (1) the server has SUPABASE_SERVICE_ROLE_KEY, (2) API_AUTH_REQUIRED=true works for you,
-- (3) you tested the full salesman flow on a STAGING copy. Salesmen do not have Supabase sessions, so anything the
-- app still does directly against the database from a salesman's phone will stop working until it goes via the server.
-- To undo, run security/undo-lock-down-rls.sql.
-- ============================================================================================
DO $$
DECLARE t record; p record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tablename LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t.tablename);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY "signed_in_users_only" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t.tablename
    );
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
