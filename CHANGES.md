## Reports catalog (tablet & desktop only)
- Main Reports screen: every report type is a **full-width row card**, grouped by category (Money in, Who owes me, What sells, Stock, Trips & tax).
- No multi-column card grid on tablet/desktop — one card per row.
- Report section switcher stays on the main screen only; individual report pages use breadcrumb + “All reports” (no external section tab bar).
- **Mobile Reports UI is unchanged** (`md:hidden` / `ReportsMobileHome`).

## Expenses menu + soft links
- New main-menu item **Expenses** (sidebar, mobile sheet, App route `tab=expenses`).
- New screen `ExpensesView`: list, search, category filter, add/edit sheet, mobile cards + desktop table.
- Expense records accept optional soft FKs without breaking old data: `customerId`, `billId`, `paymentId`, `mode`, `referenceNote` (plus existing `tripId`).
- Party picker on expense form stores `customerId` when a real party is selected; free-text payees still work.
- Optional trip + invoice links on each expense.
- Parties and Payments menus already existed; link model documented in `migrations/015_soft_links_expenses_parties_payments.md` (additive only — no rewrite of live rows).
- Net Profit report continues to use the same shared `expenses` list.


## Reports
- Moved **Net Profit & Salary** (Net Profit & Pay) from a top-level Reports tab into a sub-tab of **Sales, Margin & P&L** (label: "Net Profit & Pay" / mobile "Net / Pay").
- Deep links to `netProfit` still open Sales, Margin & P&L on that sub-tab.
- Report catalog / Owner demo no longer list Net Profit as a separate top-level report.
- Net Profit expense form grid is more responsive on small phones (1 → 2 → 3 → 6 columns).
- Sales, Margin & P&L hides Ex-GST/Incl-GST toggle, method tips, and KPI strip while on the Net Profit tab (those belong to margin views only).

# Change log (this release)

## Payments screen
- Removed the "Some older receipts are not linked..." banner and its Link receipts button.
- PARTY field is now a searchable picker (name or phone) instead of "Choose..." (src/components/common/PartySearchSelect.tsx). "+ Enter custom name" still works.
- Tabs: Recent (today only) | Due | History (older receipts, grouped by date, search, "Show more") | Reports.
  Recent = dated today or recorded today.
- Reports tab (src/components/views/payments/): Total (Paid / Due), Day-wise, Beat-wise, Customers. Each has its own Excel and PDF download.
- "Payment history log" button renamed "Audit log".
- New calculations in src/utils/beatReports.ts (buildDaySummary, buildCustomerOverall, buildDueInvoices); tests in tests/paymentReports.test.ts.

## Size colour coding (stripe + size/pack chip)
- Helper sizeStripe added in src/utils/sizeColor.ts.
- Inventory: stock list, stock audit rows, consignment items, transfer lines.
- Audit: past audit table. Smart Reconciliation: count list, edit list, variance cards.
- Salesman: load-van list, trip card rows. Returns: return modal, return history.
- Billing history item chips and Edit Bill rows.

## Checks
- tsc --noEmit clean, vite build OK, 19/19 tests pass.
