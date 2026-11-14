/**
 * SEED legal rules, loaded into the gst_tax_rules table on first install. They are DATA, not code:
 * an administrator edits / end-dates them in the database when a notification changes.
 *
 * Every rule below ships as `pending_ca_review`. Nothing here is a substitute for a GST professional's sign-off.
 * Where a start date could not be confirmed from a primary source it is deliberately set to a recent date, so the
 * engine reports "no rule" for older periods instead of applying a guess.
 */
import { LegalRule, RuleBook } from './ruleBook';

const P = 'pending_ca_review' as const;

export const SEED_RULES: LegalRule[] = [
  // ---- Valid GST rate slabs (validation only; each product still carries its own rate) ----------------------
  {
    id: 'slabs-2017',
    key: 'gst.rateSlabs',
    value: [0, 0.25, 3, 5, 12, 18, 28],
    effectiveFrom: '2017-07-01',
    effectiveTo: '2025-09-21',
    reference: 'GST Council rate schedule before the September 2025 rate rationalisation',
    reviewStatus: P,
  },
  {
    id: 'slabs-2025-09-22',
    key: 'gst.rateSlabs',
    value: [0, 0.25, 3, 5, 18, 40],
    effectiveFrom: '2025-09-22',
    reference: 'GST Council 56th meeting / notifications effective 22-Sep-2025',
    reviewStatus: P,
    note: 'Product-specific rates still come from the product tax profile; this only drives a warning.',
  },

  // ---- Composition levy ---------------------------------------------------------------------------------------
  {
    id: 'comp-rate-trader-2025',
    key: 'composition.rate',
    scope: 'trader',
    value: { cgstPct: 0.5, sgstPct: 0.5 },
    effectiveFrom: '2025-04-01',
    reference: 'Section 10(1) CGST Act; Rule 7 CGST Rules as notified',
    reviewStatus: P,
    note: 'Start date is conservative; add earlier rows if historic periods must be computed.',
  },
  {
    id: 'comp-limit-general-2025',
    key: 'composition.turnoverLimit',
    scope: 'general',
    value: 15000000,
    effectiveFrom: '2025-04-01',
    reference: 'Section 10(1) CGST Act - aggregate turnover limit (general category states)',
    reviewStatus: P,
  },
  {
    id: 'comp-limit-special-2025',
    key: 'composition.turnoverLimit',
    scope: 'special_category',
    value: 7500000,
    effectiveFrom: '2025-04-01',
    reference: 'Section 10(1) CGST Act - special category states',
    reviewStatus: P,
  },
  {
    id: 'comp-special-states-2025',
    key: 'composition.specialCategoryStates',
    value: [] as string[],
    effectiveFrom: '2025-04-01',
    reference: 'Notified special category states - NOT seeded; Odisha (21) is a general category state',
    reviewStatus: P,
    note: 'Add state codes here only if a business registers in a special category state.',
  },
  {
    id: 'comp-interstate-blocked-2025',
    key: 'composition.interStateOutwardBlocked',
    value: true,
    effectiveFrom: '2025-04-01',
    reference: 'Section 10(2)(c) CGST Act',
    reviewStatus: P,
  },
  {
    id: 'comp-nontaxable-blocked-2025',
    key: 'composition.nonTaxableGoodsBlocked',
    value: true,
    effectiveFrom: '2025-04-01',
    reference: 'Section 10(2)(b) CGST Act',
    reviewStatus: P,
  },
  {
    id: 'comp-base-exempt-2025',
    key: 'composition.baseIncludesExempt',
    value: true,
    effectiveFrom: '2025-04-01',
    reference: 'CMP-08 layout: outward supplies including exempt supplies',
    reviewStatus: P,
    note: 'UNRESOLVED: confirm with CA whether exempt turnover belongs in the composition tax base.',
  },
  {
    id: 'comp-declaration-2025',
    key: 'composition.billOfSupplyDeclaration',
    value: 'Composition taxable person, not eligible to collect tax on supplies',
    effectiveFrom: '2025-04-01',
    reference: 'Rule 46A CGST Rules (wording to be confirmed against the current rule text)',
    reviewStatus: P,
  },
  {
    id: 'comp-warn-pct-2025',
    key: 'composition.eligibilityWarningPct',
    value: 80,
    effectiveFrom: '2025-04-01',
    reference: 'Internal early-warning setting (not a legal rule)',
    reviewStatus: 'ca_approved',
  },

  // ---- Engine behaviour -------------------------------------------------------------------------------------
  {
    id: 'eng-variance-2025',
    key: 'engine.purchaseTaxVarianceTolerance',
    value: 1,
    effectiveFrom: '2017-07-01',
    reference: 'Internal setting: rupees of difference allowed between supplier-printed and computed tax',
    reviewStatus: 'ca_approved',
  },

  // ---- E-Way Bill ---------------------------------------------------------------------------------------------
  {
    id: 'ewb-central-2018',
    key: 'ewb.threshold',
    scope: 'central',
    value: 50000,
    effectiveFrom: '2018-04-01',
    reference: 'Rule 138 CGST Rules - consignment value exceeding the threshold',
    reviewStatus: P,
  },
  {
    id: 'ewb-odisha-intra-2018',
    key: 'ewb.threshold',
    scope: 'IN-21',
    value: 50000,
    effectiveFrom: '2018-06-01',
    reference: 'Odisha Commissioner of State Tax Notification No. 8003/CT dt 26-05-2018',
    reviewStatus: P,
    note: 'Confirmed from a mirror of the notification; check finance.odisha.gov.in for later amendments.',
  },
  {
    id: 'ewb-exempt-hsn-2018',
    key: 'ewb.exemptHsnPrefixes',
    value: [] as string[],
    effectiveFrom: '2018-04-01',
    reference: 'Rule 138(14) / Annexure of exempt goods - NOT seeded',
    reviewStatus: P,
    note: 'Add exempt HSN prefixes after checking the current notified list.',
  },
  {
    id: 'ewb-cancel-window-2018',
    key: 'ewb.cancellationWindowHours',
    value: 24,
    effectiveFrom: '2018-04-01',
    reference: 'Rule 138 CGST Rules - cancellation within 24 hours of generation, not after verification in transit',
    reviewStatus: P,
  },
];

export const seedRuleBook = (): RuleBook => new RuleBook(SEED_RULES, 'seed-2026-11-11');
