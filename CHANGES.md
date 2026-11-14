## Collections: Daily collection + Customer receipts in one report
- Reports now has one "Collections" entry with a Day book | By customer switch (components/views/reports/CollectionsSwitch.tsx). The Day book keeps money in, money paid out, net in hand and new due; By customer lists money received per customer with the due remaining (same ledger due as everywhere else).
- The day-by-day receipts list inside Customer receipts duplicated the Day book, so it is not shown in Collections. The Payments screen's Reports tab still uses the full Customer receipts report, unchanged.
- Period filter, beat filter and Excel / PDF downloads work as before on both views. Code only, no data changed.

## Reports clean-up
- One definition of "due": the customer ledger total (opening balance + billed - paid), the same as the Customers screen and Beat-wise report. Overview, Home and Party credit now use it (utils/dueSummary.ts). Party credit no longer counts cancelled bills and shows any opening-balance gap next to the total.
- New Reports > Sales: net sales, GST inside, received and unpaid for the period, by day / customer / product / salesman (utils/salesSummary.ts).
- New Reports > Expenses: spending by category or as a list of entries.
- GST report: the non-GST-bills notice now shows the GST sitting inside those prices, so the GST page reconciles with the Profit & Loss. No GSTR-3B figure was changed.
- Profit & Loss detail: removed the duplicate "P&L & GST" tab (its GST bridge belongs to the GST report) and the Batches tab; "Net Profit & Pay" is now "Salary budget". Products, Customers and By day remain.
- Deleted unused code: old Daily Collection report and its phone view, Supplier Product Profit report and its phone view, and the hidden supplierProfit route.
- Code only: no database data, schema or migration changed. New tests in tests/salesSummary.test.ts.

## Supplier scheme credits: enter without GST
- Credit notes carry no GST split and the P&L adds the amount typed as profit. The receipt and edit screens now say to enter the credit note value WITHOUT GST, and the P&L line says so. No data or schema change; amounts entered earlier should be checked against each credit note's taxable value.

## P&L: GST in prices is no longer counted as revenue; write-off recovery is ex-GST
- A regular taxpayer's non-GST bill still has GST inside its price, which is owed to the government. The headline P&L and the customer / day tabs used the bill's stored tax (zero on such bills), so GST was counted as income. One shared helper (utils/billTaxBasis.ts) now carves it out at each line's GST rate, the way a tax invoice would. Tax invoices keep their stored split; composition / unregistered businesses are not carved.
- All tabs and Home / Overview now agree on revenue ex-GST.
- Write-off recovery from supplier credit notes used the credit note total (GST included) against an ex-GST loss; it now counts only the ex-GST part (utils/pnlBridge.ts).
- Code only, nothing stored is changed. Tests added to tests/pnlFreight.test.ts.

## P&L / margin: inward freight no longer counted twice
- Invoice-upload GRNs store a landed cost that already contains the inward freight / labour; the margin engine added the freight again, so every profit and margin figure was understated by (freight per case x cases sold).
- `inwardFreightAlreadyInCost()` (utils/billing.ts) detects that case; freight is now added on top of batch cost only when it is not already inside it (manual GRN lines keep the old, correct behaviour).
- Margin P&L, Simple P&L, Net Profit and the product / customer / day / batch tabs all use the corrected cost. "Includes inward freight" still shows the total freight carried in cost.
- Reports Overview and the mobile Reports home now take profit from the same engine as Profit & Loss (batch cost, returns, write-offs, scheme credits) instead of a rough product-average calculation, so all screens agree.
- Code only: no database data, schema or migration was changed. Existing GRNs, batches and bills are read exactly as stored.
- New test: tests/pnlFreight.test.ts.

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
