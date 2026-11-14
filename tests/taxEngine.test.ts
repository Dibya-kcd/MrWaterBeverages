import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTax, seedRuleBook, RuleBook, SEED_RULES, gstinCheckChar, validateGstin, resolveBusinessProfile,
  resolveProductTax, createSnapshot, verifySnapshot, financialYear, formatDocumentNumber, NumberSeries,
  checkEwayBillRequired, canCancelEwayBill, markGenerated, consignmentValue, checkCompositionEligibility,
  r2,
} from '../src/tax';
import type { BusinessTaxProfile, TaxInput, TaxLineInput, LegalRule } from '../src/tax';

// ---- helpers -----------------------------------------------------------------------------------------------
const gstin = (state: string, pan = 'ABCDE1234F', entity = '1') => {
  const b14 = `${state}${pan}${entity}Z`;
  return b14 + gstinCheckChar(b14);
};
const ODISHA = gstin('21');
const SUPPLIER_OD = gstin('21', 'PQRST5678K');
const SUPPLIER_MH = gstin('27', 'LMNOP4321Q');
const CUSTOMER_OD = gstin('21', 'CUSTM1111C');
const CUSTOMER_MH = gstin('27', 'CUSTM2222D');

const composition: BusinessTaxProfile = {
  businessId: 'b1', registrationType: 'composition', gstin: ODISHA, stateCode: '21',
  compositionCategory: 'trader', effectiveFrom: '2025-04-01',
};
const regular: BusinessTaxProfile = { ...composition, registrationType: 'regular', compositionCategory: undefined };
const rb = seedRuleBook();

const line = (id: string, o: Partial<TaxLineInput> = {}): TaxLineInput => ({
  id, hsn: '22029990', qty: 1, unitPrice: 100000, taxability: 'taxable', gstRatePct: 18, ...o,
});
const input = (o: Partial<TaxInput> & Pick<TaxInput, 'lines'>): TaxInput => ({
  business: composition, kind: 'purchase', date: '2025-06-10', counterparty: { gstin: SUPPLIER_OD },
  pricesIncludeTax: false, ...o,
});
const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);

// ---- the three milestone workflows -------------------------------------------------------------------------
test('M1: composition purchase 1,00,000 + 18% => inventory cost 1,18,000, ITC zero', () => {
  const r = computeTax(input({ lines: [line('a')] }), rb);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.totals.taxable, 100000);
  assert.equal(r.totals.cgst, 9000);
  assert.equal(r.totals.sgst, 9000);
  assert.equal(r.totals.invoiceValue, 118000);
  assert.equal(r.totals.inventoryCost, 118000);
  assert.equal(r.totals.itcEligible, 0);
  assert.equal(r.totals.itcBlocked, 0);
  assert.equal(r.totals.itcPending, 0);
  assert.equal(r.lines[0].itcStatus, 'not_applicable');
});

test('M2: composition sale to a GST customer => Bill of Supply, no output GST, B2B record', () => {
  const r = computeTax(
    input({ kind: 'sale', date: '2026-02-01', counterparty: { gstin: CUSTOMER_OD },
      lines: [line('a', { qty: 100, unitPrice: 500, gstRatePct: 40 })] }), rb);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.documentType, 'bill_of_supply');
  assert.equal(r.counterpartyClass, 'B2B');
  assert.equal(r.showTaxOnDocument, false);
  assert.match(r.declaration!, /not eligible to collect tax/i);
  assert.equal(r.totals.cgst + r.totals.sgst + r.totals.igst + r.totals.cess, 0);
  assert.equal(r.totals.documentTax, 0);
  assert.equal(r.totals.invoiceValue, 50000, 'customer pays the quoted price, not price + 40% GST');
  assert.equal(r.compositionLiability!.total, 500, '1% of 50,000 turnover, own liability');
});

test('M3: composition sale to unregistered customer => Bill of Supply, no output GST, B2C record', () => {
  const r = computeTax(input({ kind: 'sale', date: '2026-02-01', counterparty: { name: 'Ramesh Kirana' },
    lines: [line('a', { qty: 4, unitPrice: 250 })] }), rb);
  assert.ok(r.ok);
  assert.equal(r.documentType, 'bill_of_supply');
  assert.equal(r.counterpartyClass, 'B2C');
  assert.equal(r.totals.invoiceValue, 1000);
  assert.equal(r.totals.documentTax, 0);
});

// ---- 1-5 composition purchases per rate --------------------------------------------------------------------
for (const [rate, tax] of [[5, 5000], [12, 12000], [18, 18000], [28, 28000]] as const) {
  test(`composition purchase with ${rate}% GST: tax capitalised into cost, ITC zero`, () => {
    const r = computeTax(input({ lines: [line('a', { gstRatePct: rate })] }), rb); // 2025-06-10: pre-rationalisation slabs
    assert.ok(r.ok, JSON.stringify(r.errors));
    assert.equal(r.totals.documentTax, tax);
    assert.equal(r.totals.inventoryCost, 100000 + tax);
    assert.equal(r.totals.itcEligible, 0);
    assert.ok(!codes({ errors: r.warnings }).includes('RATE_NOT_IN_SLABS'));
  });
}

test('composition purchase with multiple GST rates in one invoice', () => {
  const r = computeTax(input({ lines: [
    line('a', { gstRatePct: 5, unitPrice: 20000 }), line('b', { gstRatePct: 12, unitPrice: 30000 }),
    line('c', { gstRatePct: 18, unitPrice: 40000 }), line('d', { gstRatePct: 28, unitPrice: 10000 }),
  ] }), rb);
  assert.ok(r.ok);
  assert.equal(r.totals.taxable, 100000);
  assert.equal(r.totals.documentTax, 1000 + 3600 + 7200 + 2800);
  assert.equal(r.totals.inventoryCost, 114600);
  assert.equal(r.totals.itcEligible, 0);
  assert.equal(r.totals.invoiceValue, 114600);
});

test('composition inward inter-state purchase is allowed: IGST recorded, ITC zero', () => {
  const r = computeTax(input({ counterparty: { gstin: SUPPLIER_MH }, lines: [line('a')] }), rb);
  assert.ok(r.ok);
  assert.equal(r.supply, 'inter_state');
  assert.equal(r.totals.igst, 18000);
  assert.equal(r.totals.cgst + r.totals.sgst, 0);
  assert.equal(r.totals.itcEligible, 0);
  assert.equal(r.totals.inventoryCost, 118000);
});

test('purchase from composition supplier: Bill of Supply received, no tax, no ITC; supplier charging tax is rejected', () => {
  const ok = computeTax(input({ counterparty: { gstin: SUPPLIER_OD, declaredType: 'composition' },
    business: regular, lines: [line('a')] }), rb);
  assert.ok(ok.ok);
  assert.equal(ok.supplierDocumentType, 'bill_of_supply');
  assert.equal(ok.totals.documentTax, 0);
  assert.equal(ok.totals.itcEligible, 0);
  const bad = computeTax(input({ counterparty: { gstin: SUPPLIER_OD, declaredType: 'composition' },
    business: regular, lines: [line('a', { supplierCharged: { cgst: 9000, sgst: 9000 } })] }), rb);
  assert.ok(!bad.ok);
  assert.deepEqual(codes(bad), ['COMPOSITION_SUPPLIER_CHARGED_TAX']);
});

// ---- 6-10 composition sales --------------------------------------------------------------------------------
test('composition sale with discount: liability on net value; GST-inclusive flag never extracts tax', () => {
  const r = computeTax(input({ kind: 'sale', date: '2026-02-01', pricesIncludeTax: true,
    lines: [line('a', { qty: 10, unitPrice: 500, discount: 250 })] }), rb);
  assert.ok(r.ok);
  assert.equal(r.totals.invoiceValue, 4750);
  assert.equal(r.totals.taxable, 4750);
  assert.equal(r.compositionLiability!.cgst, 23.75);
  assert.equal(r.compositionLiability!.sgst, 23.75);
  assert.equal(r.compositionLiability!.total, 47.5);
});

test('composition sale return: negative, references original, reduces liability', () => {
  const r = computeTax(input({ kind: 'sale_return', date: '2026-03-01', originalDate: '2026-02-01',
    originalDocumentRef: 'BOS/2526/0007', lines: [line('a', { qty: 2, unitPrice: 500 })] }), rb);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.documentType, 'sales_return_voucher');
  assert.equal(r.totals.invoiceValue, -1000);
  assert.equal(r.compositionLiability!.total, -10);
  const noRef = computeTax(input({ kind: 'sale_return', lines: [line('a')] }), rb);
  assert.ok(codes(noRef).includes('MISSING_ORIGINAL_DOCUMENT_REF'));
});

test('composition tax is computed on turnover, not on profit or purchase value', () => {
  const r = computeTax(input({ kind: 'sale', date: '2026-02-01',
    lines: [line('a', { qty: 1, unitPrice: 123456.78, gstRatePct: 40 })] }), rb);
  assert.equal(r.compositionLiability!.base, 123456.78);
  // CGST and SGST are separate heads, each rounded to the paisa: 617.28 + 617.28 (not 1% rounded once = 1,234.57).
  assert.equal(r.compositionLiability!.cgst, 617.28);
  assert.equal(r.compositionLiability!.sgst, 617.28);
  assert.equal(r.compositionLiability!.total, 1234.56);
});

test('composition outward inter-state sale is blocked', () => {
  const r = computeTax(input({ kind: 'sale', date: '2026-02-01', counterparty: { gstin: CUSTOMER_MH },
    lines: [line('a')] }), rb);
  assert.ok(!r.ok);
  assert.ok(codes(r).includes('COMPOSITION_INTERSTATE_OUTWARD_BLOCKED'));
  assert.equal(r.documentType, null);
});

test('composition rate rule missing for an old period => error, not a guessed rate', () => {
  const old = { ...composition, effectiveFrom: '2024-04-01' };
  const r = computeTax(input({ business: old, kind: 'sale', date: '2024-10-01', lines: [line('a')] }), rb);
  assert.ok(!r.ok);
  assert.ok(codes(r).includes('NO_COMPOSITION_RATE_RULE'));
  assert.ok(codes(r).includes('NO_RULE_DECLARATION'), 'every missing rule is reported, not just the first');
});

// ---- 11-14 regular GST -------------------------------------------------------------------------------------
test('regular intra-state B2B sale: tax invoice with CGST + SGST', () => {
  const r = computeTax(input({ business: regular, kind: 'sale', date: '2026-02-01',
    counterparty: { gstin: CUSTOMER_OD }, lines: [line('a', { unitPrice: 10000 })] }), rb);
  assert.ok(r.ok);
  assert.equal(r.documentType, 'tax_invoice');
  assert.equal(r.counterpartyClass, 'B2B');
  assert.equal(r.showTaxOnDocument, true);
  assert.deepEqual([r.totals.cgst, r.totals.sgst, r.totals.igst, r.totals.invoiceValue], [900, 900, 0, 11800]);
});

test('regular inter-state sale: IGST only', () => {
  const r = computeTax(input({ business: regular, kind: 'sale', date: '2026-02-01',
    counterparty: { gstin: CUSTOMER_MH }, lines: [line('a', { unitPrice: 10000 })] }), rb);
  assert.ok(r.ok);
  assert.equal(r.supply, 'inter_state');
  assert.deepEqual([r.totals.cgst, r.totals.sgst, r.totals.igst, r.totals.invoiceValue], [0, 0, 1800, 11800]);
});

test('regular B2C sale with tax-inclusive price keeps total equal to the entered amount', () => {
  const r = computeTax(input({ business: regular, kind: 'sale', date: '2026-02-01', pricesIncludeTax: true,
    counterparty: { name: 'Walk-in' }, lines: [line('a', { unitPrice: 100 })] }), rb);
  assert.ok(r.ok);
  assert.equal(r.counterpartyClass, 'B2C');
  assert.equal(r.documentType, 'tax_invoice');
  assert.equal(r.totals.taxable, 84.75);
  assert.equal(r.totals.cgst + r.totals.sgst, 15.25);
  assert.equal(r.totals.invoiceValue, 100);
});

test('regular sale with cess', () => {
  const r = computeTax(input({ business: regular, kind: 'sale', date: '2026-02-01',
    counterparty: { gstin: CUSTOMER_OD }, lines: [line('a', { unitPrice: 10000, gstRatePct: 18, cessRatePct: 12 })] }), rb);
  assert.equal(r.totals.cess, 1200);
  assert.equal(r.totals.invoiceValue, 10000 + 900 + 900 + 1200);
});

test('regular business selling only exempt goods issues a Bill of Supply', () => {
  const r = computeTax(input({ business: regular, kind: 'sale', counterparty: { name: 'x' },
    lines: [line('a', { taxability: 'exempt', gstRatePct: 0 })] }), rb);
  assert.equal(r.documentType, 'bill_of_supply');
  assert.equal(r.showTaxOnDocument, false);
});

// ---- 15-17 ITC & RCM ---------------------------------------------------------------------------------------
test('regular purchase: eligible, blocked and pending ITC are kept separate', () => {
  const r = computeTax(input({ business: regular, lines: [
    line('ok'), line('blocked', { itcBlockedReason: 'Sec 17(5) motor vehicle' }), line('pending', { itcPending: true }),
  ] }), rb);
  assert.ok(r.ok);
  assert.equal(r.totals.itcEligible, 18000);
  assert.equal(r.totals.itcBlocked, 18000);
  assert.equal(r.totals.itcPending, 18000);
  assert.equal(r.lines[0].inventoryCost, 100000, 'eligible ITC is not part of cost');
  assert.equal(r.lines[1].inventoryCost, 118000, 'blocked ITC is part of cost');
  assert.equal(r.lines[2].inventoryCost, 100000, 'pending ITC is a receivable, not cost');
});

test('supplier-printed tax wins over computed tax, with a variance warning', () => {
  const r = computeTax(input({ business: regular, lines: [line('a', { supplierCharged: { cgst: 8000, sgst: 8000 } })] }), rb);
  assert.equal(r.totals.documentTax, 16000);
  assert.ok(codes({ errors: r.warnings }).includes('SUPPLIER_TAX_VARIANCE'));
});

const rcmRule: LegalRule = {
  id: 'test-rcm', key: 'rcm.category', scope: 'TEST_CAT', value: {}, effectiveFrom: '2025-01-01',
  effectiveTo: '2026-12-31', reference: 'synthetic test rule - NOT a legal rule', reviewStatus: 'ca_approved',
};
const rbRcm = new RuleBook([...SEED_RULES, rcmRule], 'test');
const unreg = { name: 'Local supplier' };

test('reverse charge applies only when an active rule matches the category and date', () => {
  const reg = computeTax(input({ business: regular, counterparty: unreg, lines: [line('a', { rcmCategory: 'TEST_CAT' })] }), rbRcm);
  assert.equal(reg.totals.rcmTax, 18000);
  assert.equal(reg.totals.invoiceValue, 100000, 'supplier is paid only the taxable value');
  assert.equal(reg.totals.itcEligible, 18000);
  const comp = computeTax(input({ counterparty: unreg, lines: [line('a', { rcmCategory: 'TEST_CAT' })] }), rbRcm);
  assert.equal(comp.totals.rcmTax, 18000);
  assert.equal(comp.totals.itcEligible, 0);
  assert.equal(comp.totals.inventoryCost, 118000);
  const noRule = computeTax(input({ business: regular, counterparty: unreg, lines: [line('a', { rcmCategory: 'OTHER' })] }), rbRcm);
  assert.equal(noRule.totals.rcmTax, 0);
  assert.ok(codes({ errors: noRule.warnings }).includes('RCM_CATEGORY_NO_ACTIVE_RULE'));
  const expired = computeTax(input({ business: regular, date: '2027-02-01', counterparty: unreg, lines: [line('a', { rcmCategory: 'TEST_CAT' })] }), rbRcm);
  assert.equal(expired.totals.rcmTax, 0);
});

test('purchase from an unregistered supplier is NOT automatically reverse charge', () => {
  const r = computeTax(input({ business: regular, counterparty: unreg, lines: [line('a')] }), rb);
  assert.equal(r.totals.rcmTax, 0);
  assert.equal(r.totals.documentTax, 0);
  assert.equal(r.supplierDocumentType, 'none');
});

// ---- 18-19 e-way bill --------------------------------------------------------------------------------------
test('e-way bill: threshold is "exceeding", Odisha intra-state rule applies and is effective-dated', () => {
  const at = (v: number, o = {}) => checkEwayBillRequired(rb, { date: '2026-02-01', fromStateCode: '21', toStateCode: '21', consignmentValue: v, hsnCodes: ['22021010'], ...o });
  assert.equal(at(50000).required, false);
  assert.equal(at(50000.01).required, true);
  assert.deepEqual(at(60000).ruleIds.includes('ewb-odisha-intra-2018'), true);
  const before = at(60000, { date: '2018-05-01' });
  assert.equal(before.thresholdScope, 'central', 'state rule not yet effective => central rule');
  assert.equal(at(60000, { toStateCode: '27' }).thresholdScope, 'central');
  const none = checkEwayBillRequired(rb, { date: '2010-01-01', fromStateCode: '21', toStateCode: '21', consignmentValue: 1, hsnCodes: [] });
  assert.equal(none.required, true, 'no rule => fail safe to required');
});

test('e-way bill: configurable exemptions and a higher state threshold come from rules only', () => {
  const custom = new RuleBook([
    ...SEED_RULES.filter((r) => r.id !== 'ewb-exempt-hsn-2018'),
    { id: 'x-ex', key: 'ewb.exemptHsnPrefixes', value: ['2201'], effectiveFrom: '2018-04-01', reference: 'test', reviewStatus: 'ca_approved' },
    { id: 'x-od', key: 'ewb.threshold', scope: 'IN-21', value: 100000, effectiveFrom: '2026-01-01', reference: 'test', reviewStatus: 'ca_approved' },
  ], 'custom');
  const base = { date: '2026-02-01', fromStateCode: '21', toStateCode: '21' };
  assert.equal(checkEwayBillRequired(custom, { ...base, consignmentValue: 90000, hsnCodes: ['22021010'] }).required, false);
  assert.equal(checkEwayBillRequired(custom, { ...base, consignmentValue: 900000, hsnCodes: ['22011010'] }).required, false);
  assert.equal(checkEwayBillRequired(custom, { ...base, consignmentValue: 900000, hsnCodes: ['22011010', '22021010'] }).required, true);
});

test('consignment value = invoice value less exempt supplies', () => {
  const r = computeTax(input({ business: regular, kind: 'sale', counterparty: { gstin: CUSTOMER_OD },
    lines: [line('a', { unitPrice: 10000 }), line('b', { unitPrice: 5000, taxability: 'exempt', gstRatePct: 0 })] }), rb);
  assert.equal(r.totals.invoiceValue, 16800);
  assert.equal(consignmentValue(r), 11800);
});

test('e-way bill cancellation: 24h window, blocked after transit verification, never "generated" without confirmation', () => {
  const g = '2026-02-01T10:00:00Z';
  assert.equal(canCancelEwayBill(rb, { generatedAt: g, now: '2026-02-02T09:59:00Z', verifiedInTransit: false }).allowed, true);
  assert.equal(canCancelEwayBill(rb, { generatedAt: g, now: '2026-02-02T10:01:00Z', verifiedInTransit: false }).allowed, false);
  assert.equal(canCancelEwayBill(rb, { generatedAt: g, now: '2026-02-01T11:00:00Z', verifiedInTransit: true }).allowed, false);
  assert.throws(() => markGenerated({ status: 'submitted' }, {}), /not confirmed/);
  assert.throws(() => markGenerated({ status: 'submitted' }, { ewbNo: '123', generatedAt: g }), /not confirmed/);
  assert.equal(markGenerated({ status: 'submitted' }, { ewbNo: '123456789012', generatedAt: g }).status, 'generated');
});

// ---- 20-21 validation --------------------------------------------------------------------------------------
test('wrong GSTIN and invalid HSN are rejected', () => {
  const badChecksum = SUPPLIER_OD.slice(0, 14) + (SUPPLIER_OD[14] === 'A' ? 'B' : 'A');
  assert.equal(validateGstin(badChecksum).valid, false);
  assert.equal(validateGstin('21ABC').valid, false);
  assert.equal(validateGstin(gstin('50')).valid, false, 'unknown state code');
  assert.equal(validateGstin(ODISHA).valid, true);
  const r1 = computeTax(input({ counterparty: { gstin: badChecksum }, lines: [line('a')] }), rb);
  assert.ok(codes(r1).includes('INVALID_GSTIN'));
  const r2_ = computeTax(input({ lines: [line('a', { hsn: '22' })] }), rb);
  assert.ok(codes(r2_).includes('INVALID_HSN'));
  const r3 = computeTax(input({ counterparty: { declaredType: 'regular' }, lines: [line('a')] }), rb);
  assert.ok(codes(r3).includes('MISSING_GSTIN'));
});

test('a customer with a business name but no GSTIN stays B2C (no GSTIN is invented)', () => {
  const r = computeTax(input({ kind: 'sale', counterparty: { name: 'Sri Balaji Traders' }, lines: [line('a')] }), rb);
  assert.equal(r.counterpartyClass, 'B2C');
  assert.equal(r.counterpartyType, 'unregistered');
});

// ---- 22-23, 26 history & effective dating ------------------------------------------------------------------
const history: BusinessTaxProfile[] = [
  { ...composition, effectiveFrom: '2025-04-01', effectiveTo: '2026-06-30' },
  { ...regular, effectiveFrom: '2026-07-01', effectiveTo: null },
];

test('registration change composition -> regular: each date uses the profile in force, old documents untouched', () => {
  const sale = (date: string) => {
    const p = resolveBusinessProfile(history, date)!;
    return { p, in: input({ business: p, kind: 'sale', date, counterparty: { gstin: CUSTOMER_OD }, lines: [line('a', { unitPrice: 10000 })] }) };
  };
  const before = sale('2026-06-30');
  const after = sale('2026-07-01');
  const rBefore = computeTax(before.in, rb);
  const rAfter = computeTax(after.in, rb);
  assert.equal(rBefore.documentType, 'bill_of_supply');
  assert.equal(rBefore.totals.invoiceValue, 10000);
  assert.equal(rAfter.documentType, 'tax_invoice');
  assert.equal(rAfter.totals.invoiceValue, 11800);
  const snap = createSnapshot('BOS/2526/0001', before.in, rBefore, '2026-06-30T10:00:00Z');
  // the business later becomes regular and the old document is re-priced by mistake with today's profile:
  const wrong = computeTax({ ...before.in, business: after.p }, rb);
  assert.ok(codes(wrong).includes('PROFILE_NOT_EFFECTIVE'));
  assert.equal(verifySnapshot(snap), true);
  assert.equal(snap.result.documentType, 'bill_of_supply');
});

test('GST rate change with effective date: new rate applies from the date, old snapshots never change', () => {
  const profiles = [
    { productId: 7, hsn: '22029920', taxability: 'taxable' as const, gstRatePct: 12, effectiveFrom: '2025-01-01', effectiveTo: '2025-09-21' },
    { productId: 7, hsn: '22029920', taxability: 'taxable' as const, gstRatePct: 5, effectiveFrom: '2025-09-22', effectiveTo: null },
  ];
  const mk = (date: string) => {
    const p = resolveProductTax(profiles, 7, date)!;
    return input({ business: regular, kind: 'sale', date, counterparty: { gstin: CUSTOMER_OD },
      lines: [line('a', { hsn: p.hsn, gstRatePct: p.gstRatePct, unitPrice: 10000 })] });
  };
  const oldIn = mk('2025-09-21');
  const oldRes = computeTax(oldIn, rb);
  const snap = createSnapshot('INV/2526/0001', oldIn, oldRes, '2025-09-21T12:00:00Z');
  const newRes = computeTax(mk('2025-09-22'), rb);
  assert.equal(oldRes.totals.cgst + oldRes.totals.sgst, 1200);
  assert.equal(newRes.totals.cgst + newRes.totals.sgst, 500);
  assert.equal(snap.result.totals.cgst + snap.result.totals.sgst, 1200, 'snapshot keeps the 12% result');
  assert.equal(verifySnapshot(snap), true);
  assert.throws(() => { (snap.result.totals as { cgst: number }).cgst = 1; }, TypeError, 'snapshot is frozen');
  // 12% after the rationalisation date is flagged (warning), not silently accepted
  const late = computeTax(input({ business: regular, kind: 'sale', date: '2026-01-10', counterparty: { gstin: CUSTOMER_OD }, lines: [line('a', { gstRatePct: 12 })] }), rb);
  assert.ok(codes({ errors: late.warnings }).includes('RATE_NOT_IN_SLABS'));
});

test('snapshot tampering is detected', () => {
  const r = computeTax(input({ lines: [line('a')] }), rb);
  const snap = createSnapshot('GRN-1', input({ lines: [line('a')] }), r, '2026-01-01T00:00:00Z');
  const forged = { ...structuredClone(snap), ruleVersion: 'tampered' };
  assert.equal(verifySnapshot(forged), false);
});

test('rule version is stored with every result', () => {
  const r = computeTax(input({ kind: 'sale', date: '2026-02-01', lines: [line('a')] }), rb);
  assert.match(r.ruleVersion, /^seed-2026-11-11\|/);
  assert.ok(r.rulesApplied.includes('comp-rate-trader-2025'));
  assert.ok(codes({ errors: r.warnings }).includes('RULES_PENDING_CA_REVIEW'));
});

// ---- 24-25 numbering ---------------------------------------------------------------------------------------
test('financial-year rollover restarts numbering; duplicates are refused; 16 character limit enforced', () => {
  assert.equal(financialYear('2026-03-31'), '2025-26');
  assert.equal(financialYear('2026-04-01'), '2026-27');
  const s = new NumberSeries();
  assert.equal(s.allocate('bos', 'BOS', '2026-03-30'), 'BOS/2526/0001');
  assert.equal(s.allocate('bos', 'BOS', '2026-03-31'), 'BOS/2526/0002');
  assert.equal(s.allocate('bos', 'BOS', '2026-04-01'), 'BOS/2627/0001');
  assert.equal(s.allocate('inv', 'INV', '2026-04-01'), 'INV/2627/0001', 'separate series per document type');
  assert.throws(() => s.register('bos', '2025-26', 'BOS/2526/0002'), /Duplicate/);
  assert.throws(() => formatDocumentNumber('VERYLONGPREFIX', '2026-27', 1), /16/);
});

// ---- composition eligibility monitor -----------------------------------------------------------------------
test('composition eligibility monitor warns, flags ineligibility, never decides', () => {
  const base = { date: '2026-02-01', stateCode: '21', madeInterStateOutwardSupply: false };
  const ok = checkCompositionEligibility(rb, { ...base, precedingFyTurnover: 5000000, currentFyTurnover: 6000000 });
  assert.equal(ok.status, 'eligible');
  const warn = checkCompositionEligibility(rb, { ...base, precedingFyTurnover: 12000000, currentFyTurnover: 13000000 });
  assert.equal(warn.status, 'warning');
  const over = checkCompositionEligibility(rb, { ...base, precedingFyTurnover: 12000000, currentFyTurnover: 15000001 });
  assert.equal(over.status, 'ineligible');
  const inter = checkCompositionEligibility(rb, { ...base, precedingFyTurnover: 1, currentFyTurnover: 1, madeInterStateOutwardSupply: true });
  assert.equal(inter.status, 'ineligible');
  assert.equal(over.limit, 15000000);
});

// ---- reconciliation property test --------------------------------------------------------------------------
test('header totals reconcile with line totals for 300 random documents (deterministic PRNG)', () => {
  let seed = 12345;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const rates = [0, 5, 12, 18, 28, 40];
  for (let n = 0; n < 300; n++) {
    const incl = rnd() < 0.5;
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) =>
      line(`l${i}`, { qty: 1 + Math.floor(rnd() * 20), unitPrice: r2(1 + rnd() * 999), gstRatePct: rates[Math.floor(rnd() * rates.length)],
        discount: rnd() < 0.3 ? 0.5 : 0 }));
    const r = computeTax(input({ business: regular, kind: 'sale', date: '2025-06-10', pricesIncludeTax: incl,
      counterparty: { gstin: rnd() < 0.5 ? CUSTOMER_OD : CUSTOMER_MH }, lines }), rb);
    assert.ok(r.ok, JSON.stringify(r.errors));
    const sumOf = (f: (x: (typeof r.lines)[0]) => number) => r2(r.lines.reduce((s, x) => s + f(x), 0));
    assert.equal(r.totals.invoiceValue, sumOf((x) => x.lineTotal));
    assert.equal(r.totals.documentTax, sumOf((x) => x.cgst + x.sgst + x.igst + x.cess));
    assert.equal(r.totals.invoiceValue, r2(r.totals.taxable + r.totals.documentTax));
    r.lines.forEach((x, i) => {
      assert.equal(x.lineTotal, r2(x.taxable + x.documentTax));
      if (incl) assert.equal(x.lineTotal, r2(lines[i].qty * lines[i].unitPrice - (lines[i].discount || 0)), 'inclusive price is preserved to the paisa');
    });
  }
});
