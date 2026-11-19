# Batch-audit ordering fix + Oversold godown inspector

## Changed
- `src/utils/stockLocations.ts` – `buildProductBatchLines`: sold batches first, then ONLY the unattributed godown difference FEFO, then each batch's own audit adjustment applied to that exact batch, then a zero-clamp rebalance. A counted batch is never drained or topped up by other batches.
- `src/context/LedgerContext.tsx` – `oversoldReport`, `reassignBillsProductWarehouse` (owner only, dry-run, undo, log), `undoLastOversoldReassign`.
- `src/components/views/InventoryView.tsx` – "Inspect All Oversold (N)" banner, "Inspect Bills" button on each oversold card, modal wiring, clear-deficit handler.
- `src/components/views/StockAuditScreen.tsx` – uses the shared `OVERSOLD_REASONS`.

## Added
- `src/utils/oversoldDiagnostic.ts` – `diagnoseOversoldGodowns`, `buildOversoldClearAudits`, `reassignBillsProductWarehouse` (only `batchAllocations` may change; 3 guards).
- `src/components/views/OversoldInspectorModal.tsx` – read-only math + bills, green "Clear Book Deficit to 0 via Audit", "Clear All Oversold Deficits", collapsed "Advanced: Reassign Mis-tagged Bills" with live before/after and confirmation.
- `tests/batchAuditOrdering.test.ts`, `tests/oversoldAndBatchAudit.test.ts`.

## Known, not from these changes
- `src/data/gstData` and `data/collections.json` were missing from the uploaded zip, so `tsc --noEmit` reports one error and `tests/customerLedger.test.ts` fails. Restore those files in your project.
