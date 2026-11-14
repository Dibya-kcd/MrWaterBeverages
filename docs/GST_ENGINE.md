# GST Tax & Compliance Engine — Phase 1 Audit, Gap Report and Phase 2–3 Delivery

Repository audited: `mrwater-distribution-ledger` (React 19 + Vite PWA, Express `server.ts`, Supabase, Capacitor).
Audit date: 11 Nov 2026. Baseline before any change: `tsc --noEmit` clean; `npm test` 27/28 pass (the one failure,
`tests/customerLedger.test.ts`, needs `data/collections.json`, which the README says must never be shipped — unrelated to GST).

---------------------------------------------------------------------------------------------------------

## 1. Headline finding

**The app is built entirely as a Regular GST taxpayer. The word "composition" appears nowhere in the code.**
There is no registration-type field on the business profile, so nothing can make it behave as a composition dealer.

With your registration (Composition, Odisha) the current behaviour is wrong in these ways:

| # | What the app does today | Why it is wrong for composition | Where |
|---|---|---|---|
| 1 | New sale defaults to **Tax Invoice** and splits every price into taxable + CGST + SGST | A composition dealer must issue a Bill of Supply and never collect or show GST | `NewSaleScreen.tsx:113`, `:661-678`; `billing.ts` `lineTaxDetail` |
| 2 | Settings has a global GST mode `inclusive / exclusive / off` chosen by the user | Registration type must drive this, not a UI toggle | `types/index.ts:813`, `SettingsView.tsx:993` |
| 3 | Purchase stock cost and margins use the **ex-GST** cost (`costExGst`, `effectiveCostPerCrateExGst`) | Composition cannot claim ITC, so purchase GST is part of cost. Profit reports overstate margin by the tax amount | `billing.ts:398-406`, `BillItem.costExGst`, `SalesMarginPnLReport.tsx` |
| 4 | Reports compute GSTR-1, GSTR-3B, ITC and ITC reversal | Composition files CMP-08 (quarterly) and GSTR-4 (annual). ITC must be zero | `gstReports.ts`, `ReportsView.tsx:374`, `TaxReport.tsx` |
| 5 | B2B / B2C is a UI toggle (`supplyType`) | Should follow a validated GSTIN, and must not change tax treatment under composition | `BillingWorkflow.tsx:135`, `NewSaleScreen.tsx:661` |
| 6 | Nothing blocks inter-state outward sales | Composition cannot make inter-state outward supplies of goods | — |
| 7 | No composition liability, eligibility or turnover tracking | Needed for CMP-08 / GSTR-4 and the ₹1.5 cr limit | — |

**Important:** I cannot tell from code which registration the business had on past dates. Because the defaults are Tax Invoice and
GST-inclusive, **if this app has been used since you opted into composition, past bills may show GST collected.
Please raise that with your CA before the next return.** This engine does not touch any existing bill.

## 2. Existing features that work (and are preserved)

- Line-level HSN → rate resolution, CGST/SGST split, tax-inclusive back-calculation (`billing.ts`).
- Free-goods scheme GST handling and the `gstOnFreeCases` switch (flagged for CA in the README already).
- Sales returns / credit notes against an invoice without editing it (`salesReturns.ts`, `SalesReturn`).
- Bill cancellation that keeps the invoice number consumed (`cancelBill`).
- Edit history on bills (`editHistory`) and GRN edits (`grn_edit_log`).
- E-way bill bulk-upload JSON builder and readiness checks (`ewayBill.ts`); no scraping of the portal.
- Supplier GSTIN, HSN, place of supply captured on GRN; supplier credit notes with `cn_cgst/sgst/igst` columns.
- Newest-wins sync and tombstones for deleted records; Supabase schema and migrations 003–014.

## 3. Incorrect or risky logic found

| Issue | Detail | Risk |
|---|---|---|
| Hardcoded rates | `CATS` in `initialData.ts` and `gstRateFromHsn()` in `billing.ts:607` hold fixed rates (40 / 5 / 18 %). They are not effective-dated | A rate change silently alters new documents; reports that fall back to them mis-state old ones |
| Fallback to 18 % | `resolveLineGstRate` and `resolveProductGstRate` end with `return 0.18` | Unknown product silently taxed at 18 % |
| HSN table overrides the product's own rate | `resolveProductGstRate` prefers the table over `product.gstRate` | The user cannot correct a product |
| Bill does not store its tax mode | `billGstContext()` *infers* inclusive / exclusive / off from stored totals | Fragile; wrong inference changes reports |
| Invoice-type decision duplicated in **8 places** | `billing.ts:2133`, `invoiceCommon.ts:69`, `TaxInvoiceModal.tsx:64`, `EditBillModal.tsx:127`, `InvoiceSuccessCard.tsx:26`, `DashboardView.tsx:177`, `TaxReport.tsx:189`, `gstReports.ts:213/288` | Fixing one leaves seven inconsistent |
| Issued invoices are editable and deletable | `EditBillModal` rewrites an issued bill; `deleteBill` removes it and writes a tombstone | Conflicts with immutable finalised documents; gaps in the number series |
| Invoice number is `prefix-<id>` | One running integer across all types, prefix changes by type, no financial-year series (`billing.ts:2140`) | Not FY-wise; the prefix can change the number's meaning |
| E-way bill threshold is a constant | `EWAY_BILL_THRESHOLD = 50000` applied to every movement; no state rules, exemptions or dates | Wrong where a state differs or goods are exempt |
| E-way JSON hardcodes `cessRate: 0`, `qtyUnit: 'BOX'` | `ewayBill.ts` | Wrong for goods with cess; wrong unit |
| Purchases are intra-state, CGST/SGST only | `GRN` and `GrnLineItem` have no IGST, no supplier registration type, no RCM, no ITC status | Cannot record inter-state or composition-supplier purchases correctly |
| Single business | One `organization_profile`; no `business_id` on existing tables | "Multiple businesses" is not possible without a wider migration |
| No tax roles or tax audit trail | Roles are admin / salesman only; no before/after log for tax settings | Fails the audit requirement |
| Direct browser → Supabase calls | README open item: RLS lock-down not done | Tax data readable/writable from the browser |
| Housekeeping | The uploaded zip contained a `.env` (not opened by me) | Rotate any keys in it if it was shared |

## 4. Missing functionality (vs. your specification)

Business GST profile with effective dates · product tax profile with effective dates · rule/notification store ·
purchase GST ledger with ITC status · reverse-charge rules · composition liability, turnover and eligibility ·
CMP-08 / GSTR-4 workings · Bill of Supply with declaration · document-type separation (Bill of Supply, Debit Note, Delivery Challan, Proforma) ·
FY-wise numbering · immutable tax snapshots · e-way bill cancel / extend / vehicle update / delivery · GSP API adapter ·
role-based tax permissions · export of the 16 requested reports.

## 5. Migration and compatibility risks

1. **Existing bills must not be re-taxed.** Plan: a cut-over date; bills before it keep their stored totals and are read as legacy.
2. **Bills carry no stored tax mode** — legacy bills need a one-time backfill of an explicit mode before reports switch to snapshots.
3. **Offline salesman flows** compute totals on the device; they must call the same engine (it is pure TypeScript, so it can run offline).
4. **Sync model** (JSON collections + newest-wins) is not transactional. Posting an invoice + stock + ledger atomically needs a server-side RPC; the new tables are designed for that.
5. **Price semantics change** under composition: list rates are currently GST-inclusive. The customer's total stays the same; only the tax split disappears. Confirm this is what you want.

---------------------------------------------------------------------------------------------------------

## 6. Delivered in this step (Phases 2–3 foundation) — additive only, no existing file modified

| File | Purpose |
|---|---|
| `src/tax/engine.ts` | `computeTax()` — one pure function for sales, purchases and returns |
| `src/tax/ruleBook.ts`, `seedRules.ts` | Effective-dated legal rules (rates, limits, thresholds, wording); no rule ⇒ error, never a guess |
| `src/tax/gstin.ts` | GSTIN structure + checksum, state-code table, HSN check |
| `src/tax/eway.ts` | Applicability from rules, consignment value, 24 h cancellation rule, "generated only on provider confirmation" guard |
| `src/tax/eligibility.ts` | Composition eligibility monitor (reports only; never changes registration) |
| `src/tax/productTax.ts`, `snapshot.ts`, `docNumber.ts`, `money.ts` | Product tax history, immutable snapshot + checksum, FY numbering, single rounding rule |
| `migrations/016_gst_engine_foundation.sql` | 10 new tables, constraints, triggers, RLS on; touches nothing existing |
| `tests/taxEngine.test.ts` | 37 tests; `tests/sql/…check.sql` | 27 database checks |

**Verified:** `tsc --noEmit` clean · `npm test` 64/65 (only the pre-existing unrelated failure) ·
migration executed **twice** on PostgreSQL 16 (idempotent) · all 27 database safeguard checks pass.

**Not yet done (honest status):** nothing in the running app uses the engine yet. The new tables are not applied to your Supabase.
No screen, report, PDF, e-way API adapter, CMP-08/GSTR-4 export or role system has been changed or built.

### Safeguards now enforced in code or in the database

| Your rule | Enforced by |
|---|---|
| Composition never collects GST | Engine returns Bill of Supply with zero tax; DB `CHECK` rejects composition Bill of Supply carrying tax |
| Composition never has ITC | Engine zeroes ITC and capitalises tax into cost; DB `CHECK` rejects ITC on a composition snapshot |
| Product rate ≠ composition rate | Product rate is only used for purchases; composition liability uses its own rule |
| No hardcoded rates | Every legal number is a rule row; no effective rule ⇒ error |
| No retrospective change | Snapshot is frozen + checksummed; DB trigger blocks `UPDATE`/`DELETE`; old profile required on old dates |
| No duplicate numbers / postings | Unique constraints; one ledger row per snapshot; atomic `next_document_number()` |
| No wrong e-way bills | Rule-based threshold ("exceeding"), state-then-central lookup, fail-safe to *required* when no rule |
| No silent changes | Audit trigger records before/after + user on profiles, rules and e-way bills |

### The three milestone workflows you asked for first — all pass

1. Purchase ₹1,00,000 + 18 % → inventory cost ₹1,18,000, ITC ₹0.
2. Composition sale to a GST customer → Bill of Supply, no output GST, recorded as B2B.
3. Composition sale to an unregistered customer → Bill of Supply, no output GST, recorded as B2C.

### Behaviours worth knowing

- **Rates after 22 Sep 2025:** your list mentions 12 % and 28 %. The seed slab rule treats them as valid only for dates **before** 22 Sep 2025;
  after that date the engine warns (does not block) because I believe those slabs were removed. This needs CA confirmation.
- **Rounding:** CGST and SGST are separate heads, each rounded to the paisa, so 1 % of ₹1,23,456.78 is 617.28 + 617.28 = ₹1,234.56.
  Because of this, **CMP-08 must be computed on aggregate quarterly turnover, not by summing per-bill liabilities** (Phase 6).
- **Returns** resolve rates and rules as on the *original* document date, and must reference the original document.

---------------------------------------------------------------------------------------------------------

## 7. Remaining phases

| Phase | Work | Needs from you first |
|---|---|---|
| 4 | Purchase / GRN integration (supplier type, IGST, ITC status, GST-inclusive stock cost) | Cut-over date; keep old cost on old GRNs? |
| 5 | Sales / billing integration, Bill of Supply PDF + declaration, FY numbering, replace the 8 duplicated checks | Confirm price semantics (§5.5); lock edit/delete of issued bills? |
| 6 | Composition ledger, CMP-08 / GSTR-4 workings, turnover tracking | Aggregate turnover of **all** GSTINs under your PAN |
| 7 | E-way bill adapter (GSP/NIC), cancel / extend / vehicle / delivery | Which GSP you will use; credentials stored server-side only |
| 8 | 16 reports + Excel/CSV/PDF, ledger reconciliation | — |
| 9–10 | Regression suite, role permissions, RLS lock-down, production review | — |

## 8. Unresolved legal assumptions — CA approval required before production

Every seeded rule ships as `pending_ca_review`; the engine adds a `RULES_PENDING_CA_REVIEW` warning until each is approved.

1. **Composition category and rate** for a beverage distributor/wholesaler (seeded: trader, 0.5 % CGST + 0.5 % SGST) — Section 10, Rule 7.
2. **Tax base** — whether exempt supplies belong in the composition turnover (seeded: yes, per the CMP-08 layout).
3. **Eligibility** — aggregate turnover across *all* GSTINs under the PAN, preceding vs current year, and the exit date if the ₹1.5 cr limit is crossed (Section 10(3)).
4. **Wording** of the Bill of Supply declaration and mandatory fields (Rule 46A).
5. **Sales returns under composition** — name of the document (`sales_return_voucher` is a placeholder) and whether CMP-08 turnover is reduced in-period or only in GSTR-4.
6. **Reverse charge** — no category is seeded. The CA must supply the notified categories and dates, including composition dealers' own RCM duties.
7. **Registration transitions** — stock/ITC treatment on composition → regular (and the reverse); not automated.
8. **Rate slabs and beverage rates** — the post-22-Sep-2025 slabs and HSN-wise rates (carbonated / energy 40 %, juice-based 5 %, packaged water 18 %), and the cess position on bills before that date.
9. **E-way bill** — Odisha intra-state threshold ₹50,000 effective 1 Jun 2018 (Notification 8003/CT dt 26-05-2018). I confirmed this from a **mirror** of the notification, not the Odisha Finance Department site. Check for later amendments. The exempt-goods list is **not seeded**. "Consignment value" (invoice value less exempt supplies) needs confirming for mixed invoices.
10. **GST on free-scheme cases** (`gstOnFreeCases`) — already flagged in your README.
11. **Past periods** — whether any bills issued under composition showed GST, and how to regularise them.
12. Filing **due dates** for CMP-08 and GSTR-4 are intentionally not seeded.

No software can be guaranteed tax-proof. Have a practising GST professional validate the rule table and a sample of outputs before go-live.

---------------------------------------------------------------------------------------------------------

## 9. Phase 5a — composition sales gate (first change to existing screens)

Context from the owner: **all old bills are B2C, there has been no B2B sale, and the only other bills are cancelled test bills.**
So there are no customer ITC claims to unwind and the cut-over can be a simple date. It also means the **B2B path has never run in
production**: test it with a real Odisha GSTIN before relying on it.

**OFF by default.** Nothing changes until an admin saves a registration type **and** a start date in
*Settings → Billing → GST registration*. Bills dated before the start date are never touched.

| Change | File | Effect when switched on (composition) |
|---|---|---|
| New settings (optional fields) | `types/index.ts`, `GstRegistrationCard.tsx`, `SettingsView.tsx` | Registration type, category, start date |
| Central gate in `finalizeBill` | `LedgerContext.tsx` | Every sale (all 4 screens) is validated by the engine, forced to Bill of Supply, all tax splits stripped, totals computed tax-free, a `taxStamp` saved on the bill |
| Blocking rules | `appRegime.ts` | Invalid customer GSTIN, inter-state customer, missing category/GSTIN ⇒ "Cannot save this bill" with the reason |
| Sale screen | `NewSaleScreen.tsx` | "Tax invoice" option disabled; defaults to Bill of Supply |
| Printing | `invoiceCommon.ts`, `TaxInvoiceModal.tsx`, `invoicePdf.ts`, `receipt80.ts` | A stamped composition bill can never print as a Tax Invoice (even if toggled); composition declaration printed in the footer |

The customer pays the **same amount** as before: only the GST split disappears (verified with the real `billTotals`).
Regular-taxpayer billing is deliberately not wired yet (the card offers Composition / Unregistered only).

**Verification:** `tsc` clean · `npm test` 71/72 (same single pre-existing, unrelated failure) · `vite build` succeeds.

**Still open after 5a:** purchase/GRN side (GST-inclusive stock cost for composition margins, supplier type, IGST, ITC status) ·
reports still show GSTR-1/3B style views (they will show zero tax for stamped bills but are not CMP-08/GSTR-4) ·
issued-bill edit/delete lock · FY numbering · e-way adapter · `Estimate / quotation` in the sale screen is saved as a Bill of Supply (existing behaviour, worth reviewing).

---------------------------------------------------------------------------------------------------------

## 10. Phase 4 — purchase GST becomes stock cost (composition), by GRN date

**Rule implemented:** for a GRN whose **inward date is on/after the engine start date**, and only when the business is
Composition (or Unregistered), stock cost per crate = taxable cost **+ the GST printed on the supplier's invoice line** (+ inward freight).
No input credit is claimable, so that GST is part of the cost of goods. GRNs dated before the start date, regular taxpayers,
and businesses that have not switched the engine on keep the exact legacy ex-GST cost.

Worked example (tested): purchase ₹1,00,000 + 18 % GST → stock cost ₹1,18,000, ITC ₹0. Stock bought at ₹1,000 before the
start date and ₹1,180 after it blends to a ₹1,090 weighted average.

| Change | File | Effect |
|---|---|---|
| Basis by date + cost calculation | `src/tax/purchaseCost.ts` (new) | `costBasisFor()`, `stockCrateCost()`; a line with no tax split or 0 % GST is **never** given an assumed 18 % |
| Catalog rebuild | `ledgerHelpers.ts` `buildCatalogFromGrns` | Optional basis function; omitted = legacy |
| Posting / editing a GRN | `LedgerContext.tsx` `postGrn`, `updateGrn` (6 sites), 3 rebuild callers | Product `effectiveCost` and batch `effectiveCostPrice` use the basis |
| Break-even pricing | `ProductProfitPricingModal.tsx` | No GST grossed up on top of an already GST-inclusive cost when sales are tax-free |
| Settings card | `GstRegistrationCard.tsx` | Confirmation now states the stock-cost effect |

Margins follow automatically: a sale freezes the batch cost into the bill line, so margins on goods bought after the start date
are no longer overstated by the purchase GST. The supplier list rate (`cost`) stays ex-GST, as printed on the invoice.

**Known limits (not hidden):**
1. **Batches already posted keep their cost.** A GRN dated on/after the start date that was *posted before* you switched the engine on keeps its old ex-GST batch cost until the GRN is re-saved (re-saving rebuilds its batches). Set the start date to the day you switch on to avoid this.
2. **No IGST on GRNs.** The GRN model only holds CGST/SGST percentages, so an inter-state purchase is not representable yet (composition may legally buy inter-state). Needs a GRN schema extension.
3. **No supplier registration type / RCM / ITC status on GRNs** yet (schema extension). Purchases from composition or unregistered suppliers should carry 0 % tax; the app trusts the percentages typed on the line.
4. **Effect order:** the GRN → catalog sync effect was moved below the `orgProfile` state declaration (it now depends on the registration settings). Behaviour is unchanged for existing data, but please exercise GRN post/edit once on a copy before relying on it.
5. Reports that show "cost ex-GST" labels still say ex-GST for composition data; label changes belong to the reporting phase.

**Verification:** `tsc` clean · `npm test` 78/79 (same single pre-existing, unrelated failure) · `vite build` succeeds · 7 new purchase-cost tests.

---------------------------------------------------------------------------------------------------------

## 11. Phase 6 (reports) — CMP-08 and GSTR-4 workings, cost relabelling

**Where:** Reports → GST. For a business set to *Composition* (with a start date) this tab now shows the composition workings
instead of GSTR-1/GSTR-3B. A link opens the old regular-GST view for bills before the start date, with a button back.

**CMP-08 working (per quarter, per FY)** — gross supplies, less sales returns, net turnover, CGST, SGST, tax payable.
- Counts only bills issued under the composition setting (`taxStamp`); cancelled bills (including your test bills) are excluded.
- Tax = rule rate (seed: 0.5 % CGST + 0.5 % SGST) × the quarter's **aggregate** net turnover, each head rounded once.
  The sum of per-bill liabilities is shown only as a reconciliation figure; any difference is paise rounding. Pay the aggregate.
- A missing category, or no rate rule for the quarter, shows an error and a zero — never a guessed rate.

**GSTR-4 working (annual)** — outward gross / returns / net, 0 %-GST line turnover (estimate), tax by quarter and total,
inward supplies from GRNs split into registered vs no/invalid-GSTIN suppliers, total GST paid on purchases, GST added to stock cost
(no ITC), reverse-charge line (shown as 0: not captured yet).

**Eligibility panel** — aggregate turnover for the FY and previous FY against the limit (warns at 80 %), inter-state outward bills
detected from customer GSTINs, and an input for **other GSTINs under the same PAN** (aggregate turnover is PAN-wide).
It only reports; it never changes your registration.

**Exports:** CSV for CMP-08 and GSTR-4 (UTF-8 with BOM, opens in Excel). Both carry the "working paper, not a portal return" line.

**Relabelling:** stock cost on composition data now includes purchase GST, so cost labels read "incl. purchase GST" instead of "ex-GST"
in the sale-screen margin hint, the Profit & Loss product table and the product pricing modal. Sales labelled "ex-GST" were left alone:
stamped bills carry no GST, so "ex-GST sales" equals the billed value and output GST is 0 (numbers are correct). The pricing modal's
break-even no longer grosses GST on top of an already inclusive cost.

**Legal points still needing CA sign-off (also in §8):** returns are deducted in the quarter they are recorded; whether exempt-line
turnover belongs in the base; PAN-wide turnover; the exact table layout of the portal's CMP-08 / GSTR-4 (these workings are
organised for review, they are not a field-for-field copy); due dates are not stored.

**Verification:** `tsc` clean · `npm test` 91/92 (only the pre-existing `customerLedger` failure) · `vite build` succeeds ·
11 calculation tests + 2 render tests for the new reports. `npm test` now also runs `tests/*.test.tsx`.

**Not done yet:** GRN IGST / supplier registration type / reverse-charge capture · issued-bill edit/delete lock · FY-wise numbering ·
e-way bill API adapter and register · PDF/Excel exports for the reports (CSV only) · regular-taxpayer billing through the engine.

---------------------------------------------------------------------------------------------------------

## 12. Review of the updated upload, and IGST (core)

### 12.1 What the updated upload added
`GstRectifier.tsx`, `types/gst.ts`, `utils/gstCalculation.ts`, `data/gstData.ts`, plus edits to `LedgerContext.tsx`, `billing.ts`,
`gstReports.ts`, `TaxReport.tsx`, `SimpleGstReport.tsx` (HSN defaults, a "convert to tax invoice" action and report tweaks).
My GST engine, tests and reports were intact in it.

### 12.2 Fixed immediately (small, safe)
| Issue | Fix |
|---|---|
| **The updated upload did not typecheck**: `normalizeGstFraction` was used in `LedgerContext.tsx` without an import, so `repairBillTotals` would throw at run time | Import added |
| `convertBillsToTaxInvoices` and `repairBillTotals` could rewrite a **composition** bill into a Tax Invoice / re-add a GST split | Both now skip composition and unregistered bills (`isNoOutputTaxBill`, unit-tested) |

### 12.3 Needs your decision (not changed by me)
1. **Which registration is correct?** The rectifier models ITC (₹1,30,659.85 "available") and 40 % / 5 % output tax. Input tax credit and output GST
   **cannot exist for a composition taxpayer**. Earlier you told me the business is Composition. Please confirm the actual registration with your GST
   certificate / CA before the composition switch (Settings → GST registration) is turned on. If you are a **regular** taxpayer, leave that switch
   OFF; the regular-taxpayer path is not wired to the engine yet.
2. **`convertBillsToTaxInvoices` edits issued bills in place** (invoice type, line GST, totals) and pushes them to the cloud with no edit history.
   Rates are guessed (product rate, then HSN prefix, else 18 %). A finalised invoice should not be silently rewritten; correcting past tax is a CA-guided
   process (amended return / payment with interest, credit-note-and-reissue where permitted). I recommend not using this button until your CA agrees the method.
3. **`GstRectifier.tsx` is a demo on hard-coded numbers** (sample invoices, fixed totals "matching screenshots"), with wording such as "100 % Rectified &
   Compliant" and "Zero cash out of pocket". It is not mounted anywhere. Do not mount it or rely on its figures; they are not derived from your ledger.
4. The new `TaxReport` / `SimpleGstReport` buttons call (2). Those views are for regular taxpayers; composition businesses now get the CMP-08 / GSTR-4 workings.

### 12.4 IGST — safe, additive core (done)
IGST is an **optional** field (`igstPercent`, `igstAmount`) that defaults to 0. Changed: `calculateLandedCostBreakdown`, `calculateGrnLineMetrics`,
`resolveItemCrateCost`, `resolveItemLandedCrateCost` (billing.ts), `GrnLineItem` (types), `stockCrateCost` (purchaseCost.ts), inward summary (reports).

**Proof it does not affect existing data:** the original and patched `calculateLandedCostBreakdown`, `calculateGrnLineMetrics` and both cost resolvers were run on
**8,000 random legacy lines (both "GST on free cases" modes): 0 differences**. Adding 0 in floating point returns the identical number, so legacy results cannot move.
Permanent tests also check that IGST x % costs exactly the same as CGST x/2 + SGST x/2 for 1,000 random lines, with and without schemes.

**Not done yet (the entry screens):** nothing lets you *type* an IGST rate yet, so no existing screen behaves differently. The remaining wiring is
`BulkInwardModal` (5 call sites, 22 references), `InwardConsignmentModal`, `InwardProductCard`, `GrnView`, the AI invoice parser
(`invoiceParser`, `invoiceAiValidation`), `grnCsvExport`, and Supabase mapping. Suggested UI: a per-invoice "Inter-state purchase (IGST)" switch that
swaps the CGST/SGST boxes for one IGST box, defaulting OFF so existing entry is unchanged.

**Verification:** `tsc` clean · `npm test` 98/99 (only the pre-existing `customerLedger` failure) · `vite build` succeeds.
