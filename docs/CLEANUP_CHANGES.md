# Cleanup + fixes (this round)

1. Desktop sidebar (src/components/common/Nav.tsx, src/shell.css): Settings is pinned above the user card, so it is always
   visible. On windows up to 860px tall the list is tighter, so all items fit without scrolling (checked 600-900px tall).
2. Settings > Cloud (src/components/views/SettingsView.tsx): button renamed "Push Changes to Cloud" (sends changed rows only,
   as it always did) and a small "Re-send everything (rarely needed)" link with a confirmation. Use it once after restoring
   or replacing the Supabase database.
3. Unused files moved to _archive/ (same sub-folders; nothing imported them). Move one back to src/ if ever needed;
   delete _archive/ when you are happy. Also archived: the root registerServiceWorker.js (the app uses src/registerServiceWorker.ts).
4. From the earlier sync round (see SYNC_SPEED_CHANGES.md): src/utils/storage.ts, src/lib/supabase.ts.

Checked: npm run lint passes, build passes, npm test 115/116 (customerLedger.test.ts needs data/collections.json, not in the zip).
All 13 screens: no sideways overflow at 360 / 820 / 1366 px wide (empty data, standard text size).
