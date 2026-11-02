# Supabase Disk IO reduction (client-side only)

**No database change.** No SQL, no migration. Goal: stay on the Supabase free plan without exhausting the Disk IO budget.

## Why the budget was running out
* "Sync to cloud" upserted **every** row of every table (all bills, trips, GRNs, products ...) and stamped a fresh
  `updated_at` on each. One press rewrote the whole database, and made every other device think everything changed.
* After every download the app saved its merged lists back; on GitHub Pages each of those saved a whole list into one
  `app_collections` row, even when nothing had changed.
* Every open device checked for changes every 2 minutes and did a full download every 5 minutes.

## What changed
| File | Change |
|---|---|
| `src/lib/supabase.ts` | `changedOnlyClient()`: `pushLedgerToSupabase` now sends only rows whose content changed since the last successful push (fingerprints kept in `localStorage`, per Supabase project, `updated_at` ignored). Unchanged rows are not rewritten and keep their `updated_at`. `pushLedgerToSupabase(data, { full: true })` sends everything once. |
| `src/lib/supabase.ts` | `writeCollectionMerged()` skips a write whose content equals what the cloud already holds / what this device last wrote. `noteCollectionContent()` records what a read returned. |
| `src/utils/storage.ts` | After a read from `app_collections`, records its content (so identical write-backs are skipped). |
| `src/utils/syncGate.ts` | Background check every **5 min** (was 2), safety full download every **15 min** (was 5), fallback poll **10 min** (was 3). Other devices still hear about changes at once through the Realtime Broadcast signal. |
| `src/context/LedgerContext.tsx` | `syncToCloud(opts?: { full })`. |
| `src/components/views/DatabaseSettingsView.tsx` | "Push Changes to Cloud" (normal) plus a small "Re-send everything (rarely needed)" link with a confirmation. |
| `src/App.tsx` | Cloud sync notice popup: scrolls inside the screen, header with the close button stays visible, tapping outside closes it. Fixes the popup that could not be closed on small phones. |
| `package.json` | Added the missing `build:web` script that `.github/workflows/build.yml` calls. The workflow itself is unchanged (still builds on every push). |
| `tests/pushCache.test.ts` | Unit tests for the above (`npm test`). |

## Trade-offs
* A change made on another device can take up to 15 minutes to show if the Realtime signal is missed (it normally shows within seconds).
* If you ever restore or replace the Supabase database, use "Re-send everything" once (the fingerprints think the old rows are still there).
* The first "Push Changes" after installing this version sends everything once (the fingerprint list starts empty).

## Still worth doing later
Saves on GitHub Pages still write a whole list into one `app_collections` row when that list really changed. Moving the busiest
lists (bills, payments) to one-row-per-record writes would shrink those writes further.
