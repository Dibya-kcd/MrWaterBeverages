# All fixes in this package (Nov 2026)

## A. Faster device-to-device sync, no extra egress
- src/utils/storage.ts: GitHub Pages saves now send the tiny "changed" Realtime message, so other devices check at once
  instead of waiting for the 5 / 15 minute timers.
- src/lib/supabase.ts: the cheap change check also watches payments, customers and business_expenses (one request,
  timestamps only), so a payment or new customer is noticed without waiting for the safety download.
- Details and rollback: SYNC_SPEED_CHANGES.md (copy of the notes is in docs below).

## B. Desktop sidebar
- src/components/common/Nav.tsx, src/shell.css: Settings pinned above the user card; tighter list on windows up to 860px tall.

## C. Settings > Cloud
- src/components/views/SettingsView.tsx: "Push Changes to Cloud" (changed rows only) + "Re-send everything (rarely needed)" with confirmation.

## D. Cleanup
- 12 unused components and the root registerServiceWorker.js moved to _archive/ (see _archive/README.md). Nothing deleted.

## Checks
- npm run lint: pass. vite build: pass. npm test: 115/116 (customerLedger.test.ts needs data/collections.json, not in the zip).
- 13 screens at 360 / 820 / 1366 px wide: no sideways overflow (empty data, standard text size).

## Supabase egress warning (grace period ends 30 Nov 2026)
Update every device to this version (reload / accept the PWA update prompt), watch Supabase > Usage > Egress for a few days,
and decide on a plan upgrade before 30 Nov if usage stays over quota (otherwise requests return 402).

## E. WhatsApp: send the 80 mm bill as an attachment (owner and salesman)
- NEW src/utils/whatsappBill.ts: builds the 80 mm receipt PDF and opens the phone's share sheet with it attached (pick WhatsApp,
  then the customer). A short caption (shop, bill no, total / paid / due) goes with it. On desktop / browsers that cannot share
  files: the PDF is saved and WhatsApp opens on the customer's number, with a toast to attach it with the paperclip.
- Wired in: invoice success card (owner Billing + salesman sale screens), owner "just saved" bar, invoice modal share menu,
  salesman cart banner (shown after a sale when "Send bill on WhatsApp" is on; it used to auto-open a text-only chat).
- WhatsApp does not let any web app pre-select the customer when sending a file; that is a WhatsApp rule. Sending straight to the
  number with no taps needs the WhatsApp Business API (Meta account + paid messages), not included.
- tests/whatsappBill.test.ts added (118/119 tests pass; the one failure is the data/collections.json one).

## F. Double "+" on add buttons
11 buttons showed a plus icon AND text starting with "+" (looked like "++"). The "+" was removed from the text, the icon stays:
CustomerPredictiveSearch (2), CustomerQuickSelect, CustomerSelector (2), EditBillModal, SalesmanCartModal, BillingWorkflow,
NewSaleScreen, SalesmanSaleWorkflow (2, one via the 'salesman.addCustomer' text in English and Odia). Odia phrase list updated to match.
