# Trips close / load flow + New Sale header: changes

New: src/components/common/FlowKit.tsx (header, inline header, footer, stat tile, stepper), src/components/views/trips/useLoadValidator.ts
Tokens: --flow-* in src/index.css

Logic
- Close Trip: Save Draft keeps damaged, reasons, expense, remarks (device-local, used only while saved good counts match).
- Close Trip: errors shown above the buttons, scroll to first problem product; Edit load button visible on phones; closed trips show recorded shortage reason.
- Edit load: whole numbers only; "-" cannot go below billed; "Completed" switch disabled on open trips and save blocked (close via Day-end settlement).
- Free-stock check for edits is one shared hook (owner + salesman).

UI
- One navy header / #f8f9fa canvas / green accent across New Sale, New Trip, Edit load, Close Trip.
- Stepper is a 3-column grid (button | flexible input | button); counters stack below 400px.
- New Sale step 1 now has a header with back button (shared with step 3).

Verified: tsc (only pre-existing gstData error), vite build OK, 151/152 tests (customerLedger needs data/collections.json, not in zip).
Not verified: visual check in a browser at 320/360/390/768px.
