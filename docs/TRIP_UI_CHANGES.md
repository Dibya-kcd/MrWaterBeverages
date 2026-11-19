# Trip load / edit UI + sale bottom bar (Nov 2026)

## Sale screen (salesman)
- The bottom bar is now always visible while the cart has items: **Cancel** (asks before discarding), the running total, and **Review & Finalise**. Before, it only showed in low-vision mode, so normal mode only had the small basket icon with a number.

## One load-sheet UI for owner and salesman
- New shared parts: `src/components/views/trips/LoadSheetParts.tsx` (product cards, Add-products sheet, Review sheet, bottom action bar, discard question).
- **Edit trip** (`TripEditScreen.tsx`): table replaced by cards (no sideways scroll). All trip fields in one block (vehicle, date, salesman, source godown, attach bills, status), totals strip, search + filters, bottom bar **Cancel / Add products / Review**. Review lists every line (shows "was 10 -> now 20") and has **Cancel / Edit more / Confirm & Save**.
- **New load sheet** (`NewTripSheet.tsx`): same look. Vehicle and route have tap chips; godown is chosen per product line.
- **Salesman Start Trip** now uses this same sheet (`SalesmanView.tsx`), so he gets every owner option, including the per-product source godown. His name is locked.
- Shared stock checks and save moved to `trips/useCreateTrip.ts` (used by both Trips screens).
- **Salesman cannot edit a saved trip**: `TripEditScreen` has a `readOnly` mode (locked fields, no add/save). The salesman's "Edit Load" button is now "View Load"; "Return & Settle" still works.
