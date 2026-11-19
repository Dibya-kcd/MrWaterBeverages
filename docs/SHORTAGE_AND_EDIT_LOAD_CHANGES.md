# Close Trip shortages + Edit load godowns: changes

## Salesman sale screen (SalesmanSaleWorkflow) - checked, no change
It is not missing a header. It renders inside SalesmanView, whose sticky top bar already shows "Home" (back),
"New Sale" and the van badge; the cart sheet has its own back/close bar. A second navy header there would repeat the
title, so none was added. (Owner New Sale needed one because its step 1 had no bar of its own.)

## 1. Shortage reasons now move book stock (LedgerContext.applyShortageReasons)
Stock is only deducted at billing, so a crate that vanished stayed counted in the godown.
- Damaged: write-off (unchanged).
- Sold but not billed: NEW - written off against the godown it was loaded from. It is a real loss until the bill is raised.
- Other: NEW - written off the same way (note still required).
- Short loaded: stock stays as is (the crates never left the godown) - on purpose.
Write-offs reuse the existing "damage_writeoff" disposition type (reason text says which), so no SQL change.
Re-closing updates the same write-off; changing a reason to "Short loaded" removes it; Reopen / Delete trip withdraw all of them.
The reason chips now say what each choice does to stock.

## 2. Damaged and missing crates on the same product
Entry stays one per product: the damaged part is the entry, the missing part is `missing` {reason, qty, note, dispositionId}
(types/index.ts, kept by normalizeTrip). Each part has its own write-off. Close Trip no longer blocks
"good + damaged < due back" when a reason is chosen for the missing rest. Saved in the existing shortage_reasons JSON.

## 3. Good return defaults to "everything came back"
Still the default, but Next is blocked until the person changes a count or ticks "I counted the crates in the van"
(ticking is remembered with Save draft on this device). A trip with nothing due back is not asked.

## 4. Edit load
- Changing the source godown on a van loaded from one godown moves the unsold crates to the new godown; billed crates
  stay where the bills drew them from (src/utils/tripLoads.ts). Before, the selector was ignored for existing lines
  and only labelled the trip. A hint under the selector says what will move.
- Stock check is now per godown as well as global (useLoadValidator): any godown asked for more crates of a product
  than the van already takes from it must have them free, minus unsold crates on other open vans from that godown.
  It runs on +, Add, godown change and Save. Godowns whose share does not go up are not checked, so old trips still edit.

## Tests / checks
tests/tripShortageAndLoads.test.ts (7 new). npm test 158/159 (customerLedger needs data/collections.json, not in the zip).
tsc: only the old gstData error. vite build OK.
Not verified: phone/tablet visual check, and a live close-trip run against Supabase.

## Worth knowing
- If a "sold but not billed" crate is billed LATER on a trip that was already closed, stock is deducted twice.
  Reopen the trip first (that withdraws the write-off), bill, then close again.
- Per-godown "unsold on other vans" assumes billed crates were drawn in load order (same assumption billing uses for old bills).

## Follow-up UI fixes
- Trips history card shows both parts for a product with damaged + missing crates (e.g. "Short 5 · 2 broken, 3 sold, not billed").
- Close Trip: the "I counted the crates" card stays pinned at the top while scrolling the product list.
