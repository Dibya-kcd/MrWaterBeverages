# Record Return & Reconcile on phones + 80 mm receipt

## 1. Trips -> Record Return & Reconcile on a phone
- The six-column table was squeezed on phones. Below 640 px the screen now uses the same full-screen
  layout as Edit Load Sheet: header, totals strip, one card per product (Loaded / Billed / Should return,
  big - and + buttons, "Same as should (n)" shortcut, OK / short / extra badge), shortage reasons, collections,
  and the bottom bar Cancel / Save draft / Save & close.
- Wider screens (768 px and up) keep the table exactly as before. `useIsMobile(maxWidth)` takes an optional width; other screens still switch at 640 px.
- No logic changed: same drafts, same shortage reasons, same over-return block, same cash-short booking.
- File: `src/components/views/TripRecordReturnScreen.tsx` (reuses `StatsStrip`, `ActionBar`, `fieldBox` from `trips/LoadSheetParts`).

## 2. 80 mm receipt (PDF and text)
- New `src/utils/receipt80.ts`: ONE list of receipt rows, drawn as
  - an 80 mm wide PDF (page height grows with the items), and
  - fixed-width text (32 / 42 / 48 characters per line) for WhatsApp / copy.
  Both use the bill's own figures (GST or non-GST copy, free cases, round-off, received, balance).
- `invoicePdf.ts`: `downloadInvoicePdf` / `printInvoicePdf` now follow the paper choice; new
  `shareInvoicePdf` opens the phone share sheet with the PDF attached (pick WhatsApp there). Browsers that cannot
  share files download the PDF instead. `inrToWords` / `isBillGstInvoice` moved to `invoiceCommon.ts` (still exported from `invoicePdf.ts`).
- Share dialog (`TaxInvoiceModal`): "PDF paper size: A4 | 80 mm" switch, new "Share PDF file" button,
  Download / Print follow the switch.
- Settings -> Billing: "Invoice PDF paper" (A4 default / 80 mm), "WhatsApp bill message style"
  (Detailed default / 80 mm receipt text), "Receipt text width" (32 default / 42 / 48).
  Stored in the existing billing_settings JSON, so no SQL change is needed.
- Every WhatsApp / copy-text button now calls `buildBillMessage`, which follows the style setting.
  Defaults keep today's behaviour (A4 PDF, detailed message).
- Tests: `tests/receipt80.test.ts` (7 tests). `tests/customerLedger.test.ts` needs `data/collections.json`, which is not in the zip.

## 3. Follow-ups: UPI QR and Odia names on the 80 mm receipt
- **UPI QR** (PDF only): when the bill still has a balance due and the organization has a UPI ID, the receipt ends
  with a scan-to-pay QR for the *balance* (`upi://pay?pa=..&pn=..&am=..&cu=INR&tn=<bill no>`), drawn as vector squares.
  Fully paid bills get no QR. Settings -> Billing -> "Print a UPI QR on the 80 mm receipt" (on by default).
  The WhatsApp text keeps only the "Pay by UPI: id" line.
- **Odia product names**: Settings -> Billing -> "Print Odia product names..." (off by default). Uses the Odia name saved on the
  product (`nameOr`); products without one stay English-only. In the PDF the browser draws the name onto a small image
  (PDF fonts cannot join Odia letters); in the WhatsApp text it is plain Unicode.
  New `utils/odiaNameLookup.ts`, kept current by `LedgerContext`, so no caller had to change.
- New dependency: `qrcode-generator` (tiny, no sub-dependencies).
- Not done (by request): direct Bluetooth thermal printing (ESC/POS).

## 4. Landing page
- Removed the E / ଓ language switch from the landing page header (`AuthScreen.tsx`). Odia only applies to a signed-in
  salesman (the language provider keeps everyone else in English), so the switch did nothing there. Salesmen still have
  the same switch on their own home screen. To bring it back, re-add `<LanguageToggle />` next to the Sign in button.
