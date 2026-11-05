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

## Reports: tables on phones (v29)
- Bug: on phones the first column of many report tables (Stock Valuation, Retailer Debtors Aging, Purchases totals ...) was squeezed to one letter wide, so names and "TOTAL PURCHASES" printed vertically. The pinned first column now has a minimum width and wraps on word boundaries (src/index.css).
- Every report table on phones (<768px) now becomes one card per row, including tables with 6 to 16 columns. Many-column tables use a compact two-column card (small title above each value); few-column tables keep title-left / value-right lines.
- Total rows (table footers) are cards too, with the TOTAL label on top and each total labelled.
- Tables inside expanded rows and tables with a two-level header still scroll sideways (pinned first column).
- Tablet and desktop are unchanged. Code: src/utils/tableCards.ts, end of src/index.css.

## Reports: register-card layout on phones (v30)
- New shared kit `src/components/views/reports/mobile/ReportCards.tsx`: one-line 44px sub-tabs (`MobileSegTabs`), a compact `RegisterCard` (title + tags, one big figure, green/red or multi-colour bar, three labelled figures per row, optional tap-to-expand details, action buttons), `DetailRow`, `Pill` and a dark `TotalsCard` that replaces each table footer.
- Phones (<768px) now get these cards instead of the generic table-to-card transform for: Sales & Revenue (Day-wise with expandable transactions, Invoices with View / WhatsApp, Product dispatches), Inward & Purchases (Day-wise + Consignments), Vehicle Trips (Day-wise + Trip logs), Party Credit & Receivables (aging bar, Record payment, WhatsApp reminder), Inventory valuation, Returns/Free/Claims (ledger lists, batch tracking, scheme credit notes), Sales-Margin-P&L (Products, Batches, Customers, Days), GST (GSTR-3B sections, B2B, B2C, HSN, purchases), Net Profit expenses.
- Sub-tab strips of those reports are one line, swipe sideways, 44px tall. Tablet and desktop keep the tables unchanged.

## Reports on the phone: four money screens (Nov 2026)
Same look as the new trip screens: one big headline number, plain words, colour for status (green paid, red due, amber late), 44px+ tap targets, filter chips instead of small controls, **Excel / PDF always pinned at the bottom** (just above the bottom nav). Phones only (<768px); tablet and desktop keep their existing layouts.

- Shared kit: `src/components/views/reports/mobile/PhoneKit.tsx` (hero card, split bar, chips, big switch, search, tags, icon tiles, row card with colour edge, bottom download bar).
- **Customer receipts** (`CustomerReceiptsPhone.tsx`): received hero with Cash / UPI bar, *By day* / *By customer*, search, beat chips, one card per receipt (cash = green ₹ tile, UPI/bank = blue phone tile) with "Due / Settled / Advance". Now reachable from **Payments → Reports → Receipts** (the report existed but was not mounted anywhere).
- **Daily collection** (`DailyCollectionPhone.tsx`): Today / Yesterday / 7 days / Month chips (they change the same period as the top Reports filter), "Money in hand" hero with Cash / UPI / New due bar, Billed / Paid out / Net in hand tiles, filter chips (Everything, Sales with due, Payments only, Paid out), a card per sale / payment / expense, Edit + Delete on payments, **+ Payment** button. New Excel and PDF downloads follow the chosen filter chip.
- **Beat-wise sales & due** (`BeatSalesDuePhone.tsx`): red "Due remaining" hero with overdue warning, sort chips (Most due, Most sales, A–Z, Overdue only), a card per beat with colour edge (red = has overdue, amber = has due, green = clear), collected %, top 2 customers and "Show all N customers".
- **Product profit** (`ProductProfitPhone.tsx`): "Operating profit (after GST)" hero, search, sort chips (Most profit, Lowest margin, A–Z) and a godown picker, a card per product with margin bar and chips (green >= 5%, amber < 5% "low", red = selling below cost), "How?" explainer. New Excel and PDF downloads (this report had none).
- The numbers come from the same calculations as before; no report logic was changed.

## Daily collection screen matched to the other reports (Nov 2026)
- Header is now **Daily collection** (title + period + Share menu), same as Customer receipts / Beat-wise sales & due.
- **Tally table removed** (and the Day-wise / Tally Table switch). The report is the day-wise register only.
- **Days are collapsed by default.** Tap a day to open it; *Expand all / Collapse all* sits above the list. While you search, matching days open so results are never hidden.
- The big dark summary card is replaced by the compact stat cards used elsewhere (Collected, Paid out, Net in hand, New due) with a one-line Cash / UPI / Cheque split. "How is this calculated?" is a small link.
- **Filters are always visible** instead of a pop-up: search + *Show* chips (Everything, Sales with due, Payments, Paid out, with counts) + *Paid by* chips (All modes, Cash, UPI / bank, Cheque) + *Clear filters*.
- The report now follows the **period picked at the top of Reports** (it had its own second period picker). Phones show that picker for Daily collection too.
- Phone layout uses the shared PhoneKit (hero figure, chips, one card per day, Excel / PDF bar pinned at the bottom).
- Excel and PDF downloads (day-wise summary + transactions; transactions follow the filters).
- A sale with nothing paid is labelled "On credit" (was "Cash"), so the Cash filter no longer lists unpaid sales.
- "New due" explanation now reads billed − paid on the day of sale (it previously subtracted all collections).
- Code: `reports/DailyCollectionStreamlined.tsx`, new `reports/mobile/DailyCollectionStreamlinedPhone.tsx`, small change in `ReportsView.tsx`.
