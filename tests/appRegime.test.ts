import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTaxRegime, noOutputTax, stripOutputTax, checkSaleForRegime, gstinCheckChar } from '../src/tax';
import { billTotals } from '../src/utils/billing';
import { isBillGstInvoice } from '../src/utils/invoiceCommon';
import type { Bill, OrganizationProfile } from '../src/types';

const g = (state: string, pan: string) => { const b = `${state}${pan}1Z`; return b + gstinCheckChar(b); };
const OWN = g('21', 'ABCDE1234F');
const org = (o: Partial<OrganizationProfile> = {}) =>
  ({ name: 'Mr Water', gstin: OWN, stateCode: '21', gstRegistrationType: 'composition', compositionCategory: 'trader',
     gstEngineStartDate: '2026-11-01', ...o }) as OrganizationProfile;
const items = [
  { productId: 1, hsn: '22029990', amount: 1180, gst: 0.18 },
  { productId: 2, hsn: '22021090', amount: 2000, gst: 0.4 },
];

test('engine is OFF unless registration type AND start date are set (legacy behaviour untouched)', () => {
  assert.equal(resolveTaxRegime(undefined, '2026-11-12').active, false);
  assert.equal(resolveTaxRegime(org({ gstRegistrationType: undefined }), '2026-11-12').active, false);
  assert.equal(resolveTaxRegime(org({ gstEngineStartDate: undefined }), '2026-11-12').active, false);
  assert.equal(resolveTaxRegime(org(), '2026-10-31').active, false, 'bills before the start date are never governed');
  assert.equal(resolveTaxRegime(org(), '2026-11-01').active, true);
  const off = checkSaleForRegime(org({ gstRegistrationType: undefined }), { date: '2026-11-12', items });
  assert.deepEqual([off.ok, off.stamp], [true, undefined]);
});

test('composition B2C sale passes: Bill of Supply stamp with declaration and own liability', () => {
  const r = checkSaleForRegime(org(), { date: '2026-11-12', items });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.stamp!.documentType, 'bill_of_supply');
  assert.match(r.stamp!.declaration!, /not eligible to collect tax/i);
  assert.equal(r.stamp!.compositionLiability!.base, 3180);
  assert.equal(r.stamp!.compositionLiability!.total, 31.8);
  assert.ok(noOutputTax(resolveTaxRegime(org(), '2026-11-12')));
});

test('composition B2B to an Odisha GST customer passes; inter-state or bad GSTIN is blocked', () => {
  const ok = checkSaleForRegime(org(), { date: '2026-11-12', customerGstin: g('21', 'CUSTM1111C'), items });
  assert.ok(ok.ok);
  const inter = checkSaleForRegime(org(), { date: '2026-11-12', customerGstin: g('27', 'CUSTM2222D'), items });
  assert.equal(inter.ok, false);
  assert.equal(inter.errors[0].code, 'COMPOSITION_INTERSTATE_OUTWARD_BLOCKED');
  const bad = checkSaleForRegime(org(), { date: '2026-11-12', customerGstin: '21ABCDE1234F1ZZ', items });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors[0].code, 'INVALID_GSTIN');
});

test('an invalid product HSN warns but does not stop a counter sale', () => {
  const r = checkSaleForRegime(org(), { date: '2026-11-12', items: [{ productId: 1, hsn: '22', amount: 100, gst: 0.18 }] });
  assert.ok(r.ok);
  assert.ok(r.warnings.some((w) => w.code === 'INVALID_HSN'));
});

test('a misconfigured profile (no composition category, bad GSTIN) blocks sales instead of guessing', () => {
  const a = checkSaleForRegime(org({ compositionCategory: undefined }), { date: '2026-11-12', items });
  assert.equal(a.ok, false);
  assert.ok(a.errors.some((e) => e.code === 'COMPOSITION_CATEGORY_MISSING'));
  const b = checkSaleForRegime(org({ gstin: '' }), { date: '2026-11-12', items });
  assert.equal(b.ok, false);
});

test('stripping output tax keeps the customer total identical to the quoted amount (real billTotals)', () => {
  const lines = [
    { productId: 1, amount: 1180, gst: 0.18, cgst: 90, sgst: 90, cgstRate: 9, sgstRate: 9, taxable: 1000 },
    { productId: 2, amount: 2000, gst: 0.4, cgst: 166.67, sgst: 166.67, cgstRate: 20, sgstRate: 20, taxable: 1666.66 },
  ] as any[];
  const legacy = billTotals(lines, 'inclusive', 0);
  assert.ok(legacy.cgst + legacy.sgst > 0, 'legacy path extracts GST');
  const stripped = stripOutputTax(lines);
  const comp = billTotals(stripped as any, 'off', 0);
  assert.equal(comp.cgst + comp.sgst, 0);
  assert.equal(comp.total, legacy.total, 'customer pays the same amount; only the GST split disappears');
  assert.equal(comp.total, 3180);
  stripped.forEach((l) => assert.deepEqual([l.cgst, l.sgst, l.cgstRate, l.sgstRate], [0, 0, 0, 0]));
});

test('a stamped composition bill can never be rendered as a Tax Invoice', () => {
  const bill = { id: 1, invoiceType: 'bill_of_supply', isGstInvoice: false,
    taxStamp: { registrationType: 'composition', documentType: 'bill_of_supply', ruleVersion: 'x', engineStartDate: '2026-11-01' } } as unknown as Bill;
  assert.equal(isBillGstInvoice(bill, 'gst'), false, 'even when the UI asks for GST format');
  assert.equal(isBillGstInvoice(bill), false);
  const legacyTax = { id: 2, invoiceType: 'tax_invoice' } as unknown as Bill;
  assert.equal(isBillGstInvoice(legacyTax), true, 'legacy bills behave as before');
});

import { isNoOutputTaxBill } from '../src/tax';
test('repair / convert tools must skip composition and unregistered bills, and only those', () => {
  const stamp = (t: string) => ({ taxStamp: { registrationType: t, documentType: 'x', ruleVersion: 'v', engineStartDate: '2026-04-01' } }) as any;
  assert.equal(isNoOutputTaxBill(stamp('composition')), true);
  assert.equal(isNoOutputTaxBill(stamp('unregistered')), true);
  assert.equal(isNoOutputTaxBill(stamp('regular')), false);
  assert.equal(isNoOutputTaxBill({} as any), false, 'legacy bills (no stamp) are unaffected');
  assert.equal(isNoOutputTaxBill(undefined), false);
});
