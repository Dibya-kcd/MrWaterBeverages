# Performance changes (no functionality change, no database change)

Startup bundle: 1,683 kB (500 kB gzip) -> 749 kB (214 kB gzip) of app code, plus React / Supabase / icons in their own cached files.
`npm test`: same result as before (124 pass; customerLedger needs data/collections.json, not in the zip). `tsc`: same single old error (../data/gstData).

## 1. PDF code loads on first use (was: at app start)
New: src/utils/invoicePdfLazy.ts, invoicePdfMeta.ts, receiptText.ts
Changed: receipt80.ts (text half moved to receiptText.ts, still re-exported), invoicePdf.ts, whatsappBill.ts,
TaxInvoiceModal.tsx, InvoiceSuccessCard.tsx, BillingView.tsx, SalesmanCartModal.tsx, SalesmanView.tsx, SalesmanSaleWorkflow.tsx
* Screens fetch the PDF code in the background when they open, so Download / Print / Share / WhatsApp run straight after the tap as before.
* Unused `downloadInvoicePdf` imports removed from SalesmanView and SalesmanSaleWorkflow.

## 2. Excel library loads only when a spreadsheet is read or exported
invoiceParser.ts, importExport.ts, BulkInwardModal.tsx

## 3. Vendor files split out (vite.config.ts)
React, Supabase and icons are separate files. A normal deploy now re-downloads only the app code.

## 4. Backup copy of bills / GRNs written at most once a second (LedgerContext.tsx)
Only the second copy inside the STORAGE_KEY blob is delayed. The main cache and the cloud save still happen immediately.
It is written at once when the page is hidden or closed (pagehide / visibilitychange).

## Tests
tests/whatsappBill.test.ts now loads the PDF code before replacing window/navigator, as the app does.

## Roll back
Restore the files from the old zip; delete invoicePdfLazy.ts, invoicePdfMeta.ts, receiptText.ts.
