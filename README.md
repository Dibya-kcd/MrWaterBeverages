# Hydrate Hub / MrWater Distribution Ledger

Beverage distribution ledger: billing, inventory & GRNs, trips, customers, payments, reports. React + Vite PWA, Express
server (`server.ts`), Supabase cloud storage.

## Run
```bash
npm install
npm run dev                  # development (server + Vite)
npm run build && npm start   # production
npm run lint                 # type-check
```
Copy `.env.example` to `.env` and fill in your keys.

## Before deploying this version
1. In the Supabase SQL editor run `migrations/010` to `013` (all are `IF NOT EXISTS`, safe to repeat). A brand-new project
   runs `supabase-schema.sql` first, then `migrations/003` to `013` in order.
2. Make sure you can sign in as admin (Supabase admin user, or `ADMIN_PASSWORD` + `APP_SESSION_SECRET` on the server).
3. Rotate the Gemini API key that used to be in `.env.example`.
4. **Do not copy a `data/` folder from an old install.** `data/collections.json` is the server's own cache of your live
   data; it is created automatically and must never be shipped (a stale copy overrides the database).
5. If you still have test rows in Supabase, review and run `cleanup-test-data.sql` once (one block at a time), restart
   the server, then clear site data on each device. Delete that file afterwards.

## How saving works (so edits and deletes stick)
- Every bill / GRN / trip save is "newest wins": a stale tab or device can never overwrite a newer edit.
- Deleting a bill, GRN or trip records its id in `deleted_bill_ids` / `deleted_grn_ids` / `deleted_trip_ids`. Every server
  route and every cloud pull honours those lists, and a deleted bill number is never issued again.
- Payments and customers are merged (never replaced); the deletion log (`deleted_records`) removes deleted ones everywhere.
- Saving a bill on purpose clears an old delete mark for that number.
- The cloud pull never re-uploads this device's bills/trips when the cloud looks empty. Use "Sync to cloud" deliberately.

## Tests
`npm test` runs the unit and API tests in `tests/`. They set `MRWATER_TEST=1`, so the server cannot reach Supabase and
neither reads nor writes `data/collections.json`; the browser client also refuses to connect to the live database under
jsdom. Always keep that variable set if you run your own scripts against the server.

## Security roll-out
`security/RUNBOOK.md` (server sign-in, `API_AUTH_REQUIRED`, `lock-down-rls.sql`). Open items: salesman PINs are 4-6
digits (use 6); direct browser database calls remain until the lock-down step; e-way/e-invoice files are for bulk
upload only (no IRN/QR); confirm with your CA the ITC treatment of free cases.

## Layout
`server.ts` Express API + static files · `invoiceAi.ts` Gemini invoice reader · `server-auth.ts` sessions ·
`src/context/LedgerContext.tsx` app state & sync · `src/lib/supabase.ts` cloud access · `src/utils/storage.ts` server
calls · `src/components/views` screens · `migrations/` + `supabase-schema.sql` database · `public/` PWA icons.
