# Mobile / small-screen UI pass

## Inventory
- Audit: stacked card rows on phones (full product name wraps, then System / Counted / Diff), search box, "N counted · M differ" summary, fixed Save bar above bottom nav. Classic 4-column grid kept from `sm` up.
- Removed duplicate "Inventory control" header + "Movement ledger / Transfer / Stock audit" pills from Audit and Transfers (they repeat the top tabs).
- Transfers: compact form; From/To stack on narrow phones; recent transfers stacked.
- Live Stock: removed duplicate heading, redundant bottom buttons, empty ⓘ; names wrap.
- Header one row; 5 tabs on one row; meaningless "0" count badges removed.

## Cleanups
- Products: removed dead Share button; names wrap; category chips swipe.
- Removed ⓘ buttons that only restated their heading (Crates & deposits, Warehouses, GST report, Payments).
- Report/Settings explanation banners -> tap-to-open `InfoTip` (new optional `text` label); descriptive subtitles hidden on phones.
- Reports: compact header; report directory is a swipe strip on phones; "Latest first" badges dropped.
- Settings: tighter padding, 14px inputs, hidden section subtitles.
- Sync banner shortened on phones.
- Long product / party / supplier names wrap instead of truncating (Audit, Smart Reconciliation, Promotions, Customers, Supplier credits, Billing lines, Salesman).

## Global CSS bug fixed (src/index.css)
`button { min-height: 44px }` on mobile stretched every compact control (toggle switches became 44px circles).
Buttons with an explicit h-5..h-8 / size-* class or role="switch" now keep their size.

## Beat-wise sales & due, customer receipts day-wise (v22)
- **Reports → "Beat-wise Sales & Due"**: one card per beat with Sales, Received (both for the period picked) and Due remaining (as of today) plus how much of the due is older than 15 days. Tap a beat to see its customers, biggest due first. Customers not in any beat appear under "No beat yet".
- **Payments → "Day-wise" tab**: customer receipts grouped by day (newest first) with the day total, cash / UPI split, the invoice each receipt was for, and what the customer still owes. Switch to "Customer-wise" for one line per customer (receipts, last receipt date, due remaining), optionally including customers who owe but paid nothing in the period. Beat chips and search narrow it down.
- **Payments → "Beat-wise" tab**: the same beat report as in Reports, with its own period picker.
- Every one of these can be downloaded as **Excel** (separate sheets) or **PDF**.
- Rules (src/utils/beatReports.ts): sales = invoice total minus returns, cancelled invoices ignored; received = receipts by receipt date (advance moves between invoices and refunds are not new money; an invoice paid at billing with no receipt row counts on its invoice date, as in Daily collection); due remaining = the customer ledger balance shown on the Customers screen. Tests: tests/beatReports.unit.test.ts.
