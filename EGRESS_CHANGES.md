# Supabase egress reduction (client-side only)

**No database change.** No SQL, no migration, no schema change. The new code only *reads*, and downloads far less.
Changed: `src/context/LedgerContext.tsx`, `src/lib/supabase.ts`, `src/utils/storage.ts`, `server.ts` (one small fix, see Billing).
New: `src/utils/syncGate.ts`, `src/lib/tableDelta.ts`, `src/lib/syncSignal.ts`, `tests/*.test.ts`.

## Before
Every open device downloaded ~25 tables every 25 s, on every window focus, and on every tab / storage message.
The deletion log was read twice per pull (and re-downloaded in full each time).

## Now
| Trigger | Before | Now |
|---|---|---|
| Timer | full download / 25 s | tiny check / 2 min (visible tab only) |
| Window focus, tab becomes visible | full download | tiny check (at most one per 20 s) |
| Other-tab message, storage event | full download each | one tiny check, 3 s after the last event |
| Cloud changed (bills, trips, record counts, deletions) | - | full download |
| Nothing changed | full download | none |
| Safety net | - | full download at least every 5 min |
| App start, manual Sync, after a conflict | full download | full download (unchanged) |

* **Tiny check** = `probeCloudChanges()` in `supabase.ts`: 9 small read-only requests (HEAD counts + one timestamp each).
* **Deletion log** is read once per pull and reused; it is also remembered and re-downloaded only when its count / last-changed
  time changes (or every 5 min). Same for the three tombstone lists.
* After a download the app writes merged data back; the check waits 8 s before taking its baseline so those write-backs are
  not mistaken for another device's change. If something keeps looking "changed" 3 times in a row, the check backs off to the
  5-minute safety download.
* If the check cannot run (offline, or after the future RLS lock-down for salesman phones), it falls back to a plain download
  every 3 minutes.

## What to expect / how to verify (no database needed)
Open the browser DevTools console. Every background check logs one line:
`[sync] background check: skipped (unchanged)` or `downloading (changed | safety | fallback | first)`.
On an idle device you should see mostly "skipped (unchanged)".

## Known trade-offs
* Changes that only show up in customers / payments / expenses (not in a bill, trip or record count) can take up to 5 minutes to
  appear on another device. Change `SAFETY_FULL_PULL_MS` in `src/utils/syncGate.ts` to tune.
* Edits to an existing product / godown / batch (no new or removed record) also wait for the safety download.
* Deployed phones need the new version: reload / accept the update prompt (PWA).


Run `npm test` (unit tests, never touches the database) and `npm run lint`.

## Round 2

### Delta sync (`src/lib/tableDelta.ts`)
A full download no longer re-reads every row. The first read of a table is kept in memory; later reads ask only for rows
changed since the newest one already seen (re-reading the last 10 minutes as clock-skew protection) and merge them in. The
caller still gets the complete list, in the same order.
Tables: bills, trips, grns, products, inventory_batches, salesmen, audit_sessions, reconciliation_transactions,
stock_ledger_entries, inventory_dispositions, supplier_credit_notes, supplier_schemes.
Large JSON rows (payments, inward GRNs, schemes, the `collection_*` copies) are downloaded only if their last-changed time moved.
Safety: a HEAD row count must match (catches rows added/removed elsewhere); a remembered copy is trusted for 15 minutes at most;
manual Sync / app start re-reads everything; any error, or a table without a usable id, falls back to the old full query.
Tables read in pages of 1000 now (the old single request could silently stop at the server's row limit).
Not delta: warehouses, promotions, audits (small).

### Change signal (`src/lib/syncSignal.ts`)
Supabase Realtime **Broadcast**: needs no table and writes nothing to the database. After a successful save a device sends one
tiny "changed" message (merged per burst); other devices run the cheap change check straight away instead of waiting for the
2-minute timer. The message carries no data. If Realtime is unavailable, the timer still does the job. Messages are not sent
while a download runs or for 10 s after, so the app's own write-backs are not announced.
Also removed: the realtime handler re-downloaded the whole payments list on every payments change and threw it away.

### Billing settings: one save path
`saveBillingSettings()` (this device, then the server, which writes billing_settings) is now the only way they are saved.
Removed: the direct browser upsert, the duplicate local-storage write, the auto-save effect that re-POSTed on every state change
(it now only caches on this device), and the write-back after every download of settings that were just downloaded.
Import and "reset to default" save explicitly. `server.ts`: the billing route now answers 502 when Supabase refuses the
save (it used to say success), so the app keeps it queued and retries and "synced" is truthful.

### Check it
Console: `[sync] background check: ...` lines (round 1). Network tab on an idle device: a few small HEAD / one-row requests,
no multi-hundred-KB table downloads except on "changed" / "safety" lines.

## Round 3: guided demo for salesmen (before sign-in)
New: `src/components/common/SalesmanDemo.tsx`, `tests/demoIsolation.test.ts`. Changed: `src/components/common/AuthScreen.tsx` (two entry buttons).
* Two buttons, both before sign-in: "New here? See how the salesman app works" on the welcome screen, and "New here? See how the app works"
  inside the Staff / Salesman sign-in card.
* 12 guided steps on a phone-shaped mock: sign in, home, load vehicle, pick shop, add products, take payment, invoice,
  collect old balance, check stock, end trip. The control to tap glows; Next / Back / Close / Esc also work; "Run it again" at the end.
* Cannot touch real data: the component imports only React and icons (no ledger context, no Supabase, no storage), makes no network
  request, and all shops / prices / numbers are invented and kept in the component's memory. `tests/demoIsolation.test.ts`
  fails the build if anyone later adds such a connection.
* Loaded only when opened (separate ~7 KB download).
* Wording of buttons (Record Trip, Load Vehicle Run, Finalize Sale ...) follows the real app. Sample shop / product names are examples:
  edit the `PRODUCTS`, `SHOPS` and `STEPS` lists at the top of the file to match your own.
