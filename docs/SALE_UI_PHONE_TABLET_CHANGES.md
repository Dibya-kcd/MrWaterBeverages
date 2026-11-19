# New Sale: phone + tablet clean-up (Nov 2026)

Phones (<768px) and tablets (768-1023px) only. Desktop (>=1024px) renders exactly as before.
Presentation only: no ledger, bill, stock, payment, sync or Supabase code was touched.

## Duplicates removed
- After you pick a retailer, the order page used to ask again for Customer, Stock from, Date and Route/Beat
  (all already set in Step 1). It is now ONE summary card: retailer + Due, van/warehouse + date chips,
  a "Change" link back to Step 1, and Bill type (the only setting that lives nowhere else).
- The "New sale / Sales history" tab row is hidden on the New Sale screens (they have their own header
  and a History pill). It still shows on the Sales history tab so you can get back.

## Added from the mockups
- "History (n)" pill in the New Sale header (n = today's live bills).
  Phone: bottom sheet. Tablet: right drawer. Chips: Today's Trip / Today's All / All History,
  search by invoice # or retailer, View / Print (existing invoice modal), Share (existing WhatsApp 80mm bill),
  and "Open full Sales history" for edit / cancel.
- Tablet "Start Order with <retailer> (Trip: #TRP-n)".

## Salesman view (phone + tablet)
- Kept the salesman's own flow (Easy View, voice search, Odia, Credit / Partial / Full payment); a re-skin would risk those.
- Removed the two extra cart icons on the Sell screen (header and beside the customer name). The bottom
  "total + Review cart" bar is the single cart entry.
- Selected-customer card now shows a Due pill (red when owing, green at 0), same as the owner screen.
- The salesman already has Bills (View / Print / Share) in his own tab, so no second History pill was added there.

## Text overflow
- 42 customer / product / party / vehicle names and their sub-lines used `truncate` (cut with "...").
  On phones and tablets (<1024px) they now wrap (`min-w-0 break-words`); desktop keeps `lg:truncate`.
  Files: CustomersView, PaymentsView, ExpensesView, DispositionsView, OversoldInspectorModal, BeatsSettings,
  BillingHistoryView, TripCardItem, TripListCard, BulkInwardModal, CustomerSelector, CustomerPredictiveSearch,
  CustomerQuickSelect, CustomerReturnLauncher, PartySearchSelect, DeleteConfirmModal, SchemeSelectorModal,
  SalesmanView, SalesmanSaleWorkflow, SalesmanCartModal.
- Checked by code scan only (no browser here). Short labels (tabs, chips, report titles, menus) were left as is.

## Files
- NEW  src/components/billing/SalesHistorySheet.tsx
- EDIT NewSaleScreen, BillingView, CustomerStep, SalesmanSaleWorkflow, plus the 20 files in the Text overflow list

## Checks
- `npm run lint`: no new errors (one existing error: src/utils/gstCalculation.ts imports ../data/gstData, which is not in the zip).
- `npm test`: 151/152 pass; tests/customerLedger.test.ts needs data/collections.json, which is not in the zip.

## Review pass (follow-up)
- Landscape iPad: compact screens now apply under 1024px, and on touch devices up to 1366px (`useIsCompactLayout`,
  src/hooks/useIsMobile.ts). Normal 1366px laptops keep the desktop screen. Used in NewSaleScreen and BillingView.
- Order page: "Edit van / date" opens Stock-from and Date in place (no need to re-pick the retailer);
  "Change retailer" goes back to Step 1 (the Step 4 "Edit" link is renamed the same way).
- History pill now also shows on the order page header (Steps 2-4), same sheet/drawer as Step 1.
- Alignment: header buttons on the order page (History, Reset, Review Cart) share a 40px height; the van/date chips
  on Step 1 are 44px like the other buttons; the Step 2 setup card uses the same radius as the Step 3/4 cards.
- Not browser-tested. `tsc`: only the existing gstData error.
