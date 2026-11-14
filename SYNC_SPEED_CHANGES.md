# Faster device-to-device sync, no extra egress

No database change. Two small client-side edits (copy the two files over the same paths in your project).

1. src/utils/storage.ts - on GitHub Pages (static) saves, the app now sends the tiny "changed" Realtime Broadcast
   message after a successful save. Before, only the /api server path sent it, so Pages devices never told the others
   and they waited for the 5 min check / 15 min safety download.
2. src/lib/supabase.ts - the cheap change check (probeCloudChanges) now also asks for the timestamps of the payments,
   customers and business_expenses lists (1 request, 3 rows, no data). Before, a payment or new customer alone was not
   noticed until the 15 min safety download.

Verify: DevTools console on the second device, after saving on the first: `[sync] background check: downloading (changed)`
within a few seconds. Idle device: mostly `skipped (unchanged)`.
Roll back: restore the two files.
Note: tests/customerLedger.test.ts needs data/collections.json, which is not in the zip (it failed before this change too).
