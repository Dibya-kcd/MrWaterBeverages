# Inventory → Audit: phone-first, batch-level count

## What changed
- **No more floating save bar.** The fixed Note + Save bar (and the 128px spacer) is gone. Nothing floats over the rows, so the keyboard never covers the box being typed in. Progress is a slim line at the top; **Review** is a button at the top and again at the end of the list.
- **Three steps:** pick the godown → count → review & save. Nothing is saved before *Confirm & Save*.
- **Counting screen:** one card per product, one compact line per batch (batch, colour-coded expiry, system qty, `−  [count]  +  ✓`). 44px touch targets, numeric keypad, Next key jumps to the next batch and scrolls it into view. `✓` = matches the system; *All match* does it for every batch of a product. Rows turn green / amber / red as you type. Filters: All · Pending · Different · Done. Search by product or batch.
- **Empty batches (system qty 0) are hidden** by default: "N empty batches hidden · Show", plus "+N empty batches" inside a product. Searching shows them. A batch you have typed a count on always stays visible.
- **Found stock:** "+ Found stock (new batch)" for crates that match no batch. The batch is created (quantity 0) only when the audit is saved, then filled by the audit difference.
- **Oversold products** (book balance below 0 in the godown, which other screens show as 0) get their own "Needs attention" section with the real balance and the stock other godowns hold. Choose: *Fix the cause first* (default, nothing saved; links to transfer / receipts / bills), *Under investigation* (recorded, stock unchanged) or *Post adjustment* (owner login only, reason required).
- **Draft kept on the phone** (localStorage, no Supabase traffic). A closed tab or phone call offers "Continue count".
- **Review screen:** differences only, one line per batch with the net per product; uncounted batches with stock are listed with "Go count them" / "Mark all as matching".

## Logic
- Blank no longer means "matches". A batch that is not counted is simply not audited.
- Differences are saved **per batch** (`AuditEntry.batchKey/batchNumber/expiryDate/kind/reason`). `buildProductBatchLines` applies a batch's difference to that exact batch instead of spreading the godown difference First-Expiry-First-Out. Godown and product totals are unchanged (entries still sum into the same ledger).
- Old audits are untouched and keep working exactly as before (no stored-data change; entries are JSON so new fields sync as they are).
- Smart Reconciliation is unchanged. Deleting an audit still reverses its adjustment.

## Files
- `src/components/views/StockAuditScreen.tsx` (new)
- `src/components/views/InventoryView.tsx` (Audit tab now renders the new screen; old inline audit code and state removed)
- `src/components/views/AuditView.tsx` (history shows batch and oversold details)
- `src/context/LedgerContext.tsx` (`saveBatchAudit`, per-batch audit differences in `productBatchLines`)
- `src/utils/stockLocations.ts` (`batchLineKey`, optional per-batch adjustments)
- `src/types/index.ts` (`AuditEntry` optional batch fields)
- `tests/auditBatchLines.test.ts` (new)

## Checked
`tsc --noEmit` (only the pre-existing missing `src/data/gstData` error), `vite build`, and the test suite. `tests/customerLedger.test.ts` fails because `data/collections.json` is not in the zip; unrelated.
