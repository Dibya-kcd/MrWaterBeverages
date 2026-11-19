# UI and data-safety changes (no change to how bills, payments, stock or the database are calculated or saved)

## Data safety
* Settings > Danger Operations is now owner-only (other users see a short note).
* "Clear Bills, Payments & Trips" and "Factory Reset" now show exactly what will be deleted with live counts
  (bills, payments, trips, audits, transfers; customers, products, GRNs, warehouses, company/GST settings),
  offer "Download a backup file first", and require typing CLEAR or RESET. Cancel / Escape / tapping outside does nothing.
* The old text said only "bills and trips"; it also removes payments, audits and stock transfers. The text now says so.

## Pop-ups
* New in-app dialogs (utils/dialogs.ts + components/common/DialogHost.tsx, mounted in App.tsx) replace the browser's
  confirm / prompt boxes in: Settings (delete warehouse, log out, re-send everything), GST registration card,
  Net Profit report (delete expense, with reason box).
* If the dialog host is not mounted the browser box is used instead, so a confirmation is never skipped.
* NOT changed on purpose: the duplicate-mobile-number question inside addCustomer (LedgerContext.tsx). It is a
  synchronous decision inside customer creation on the sale path; making it async would change billing code.

## Phones
* The warehouse delete button was invisible on touch screens (hover only). It is now always visible on phones, bigger, and labelled.

## Accessibility
* Close/clear (X) buttons that had no name now have one (bill filters, search boxes, bulk inward pickers, PIN keypad delete key).
* 21 pop-ups that lacked dialog markup now have role="dialog", aria-modal and a name.
* Escape closes the top-most pop-up marked data-esc-close (21 backdrop-close pop-ups in files that did not already handle Escape).
  It does the same thing as tapping outside, and is ignored while typing in a field or drop-down.

## Text and empty states
* 8-9 px text raised to 10 px (6 places). The ~389 uses of 10 px text are unchanged (dense tables / badges).
* Plain "nothing here" lines in Net Profit, Reports overview and Payment audit now use the shared EmptyState.

## Tests
* tests/dialogs.test.ts added. Suite: 126 pass; customerLedger still needs data/collections.json (not in the zip).
* The dialog and Escape behaviour was also exercised in a simulated browser (typed-word gate, confirm, cancel, prompt, Escape).

## Still not done (needs your decision or a real device)
* Focus trapping inside pop-ups, and full screen-reader testing.
* 10 px text in dense screens; context re-render refactor (see earlier notes).
