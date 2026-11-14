import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCmp08, buildGstr4Working, buildInwardSummary, fyAggregateTurnover, quarterBounds, fyBounds,
  cmp08Csv, gstr4Csv, gstinCheckChar,
} from '../src/tax';
import type { Bill, GRN, OrganizationProfile } from '../src/types';

const g = (state: string, pan: string) => { const b = `${state}${pan}1Z`; return b + gstinCheckChar(b); };
const org = (o: Partial<OrganizationProfile> = {}) =>
  ({ name: 'Mr Water', gstin: g('21', 'ABCDE1234F'), stateCode: '21', gstRegistrationType: 'composition',
     compositionCategory: 'trader', gstEngineStartDate: '2026-04-01', ...o }) as OrganizationProfile;

let n = 0;
/** A composition bill as finalizeBill writes it: no tax, taxStamp attached. */
const cbill = (date: string, total: number, o: Partial<Bill> = {}) =>
  ({ id: ++n, date, total, subtotal: total, cgst: 0, sgst: 0, discount: 0, status: 'active', amountPaid: total,
     items: [{ productId: 1, amount: total, gst: 0.18 }], invoiceType: 'bill_of_supply',
     taxStamp: { registrationType: 'composition', documentType: 'bill_of_supply', ruleVersion: 'x', engineStartDate: '2026-04-01',
       compositionLiability: { base: total, cgst: Math.round(total * 0.5) / 100, sgst: Math.round(total * 0.5) / 100, total: Math.round(total) / 100 } },
     ...o }) as unknown as Bill;
/** A legacy regular tax invoice: 11,800 total = 10,000 taxable + 900 + 900. */
const legacy = (date: string, total = 11800, tax = 900) =>
  ({ id: ++n, date, total, subtotal: total - 2 * tax, cgst: tax, sgst: tax, discount: 0, status: 'active', items: [] }) as unknown as Bill;

test('quarter and FY boundaries', () => {
  assert.deepEqual(fyBounds('2026-27'), { from: '2026-04-01', to: '2027-03-31' });
  assert.deepEqual(quarterBounds('2026-27', 'Q3'), { from: '2026-10-01', to: '2026-12-31' });
  assert.deepEqual(quarterBounds('2026-27', 'Q4'), { from: '2027-01-01', to: '2027-03-31' });
});

test('CMP-08: tax is 1% (0.5% + 0.5%) of AGGREGATE quarterly turnover, cancelled bills excluded', () => {
  const bills = [
    cbill('2026-10-05', 50000), cbill('2026-11-10', 30000), cbill('2026-12-31', 20000),
    cbill('2026-11-12', 99999, { status: 'cancelled' } as any), // test bill, cancelled
    cbill('2027-01-01', 40000), // next quarter
  ];
  const q3 = buildCmp08({ bills, org: org(), fy: '2026-27' })[2];
  assert.equal(q3.bills, 3);
  assert.equal(q3.gross, 100000);
  assert.equal(q3.net, 100000);
  assert.deepEqual([q3.cgst, q3.sgst, q3.total], [500, 500, 1000]);
  assert.equal(q3.errors.length, 0);
});

test('CMP-08: sales returns reduce turnover in the quarter the return is recorded', () => {
  const b = cbill('2026-10-05', 100000, { returns: [{ id: 'r1', creditNoteNo: 'SR-1', date: '2026-11-02', reason: 'x', lines: [], totalCredit: 10000, cgst: 0, sgst: 0 }] } as any);
  const q = buildCmp08({ bills: [b], org: org(), fy: '2026-27' })[2];
  assert.equal(q.gross, 100000);
  assert.equal(q.returns, 10000);
  assert.equal(q.net, 90000);
  assert.equal(q.total, 900);
});

test('CMP-08: aggregate rounding differs from the per-bill sum by paise only, and is reported', () => {
  const bills = [cbill('2026-10-01', 333.33), cbill('2026-10-02', 333.33), cbill('2026-10-03', 333.34)];
  const q = buildCmp08({ bills, org: org(), fy: '2026-27' })[2];
  assert.equal(q.net, 1000);
  assert.equal(q.total, 10);
  assert.ok(Math.abs(q.roundingDifference) <= 0.05, `rounding difference ${q.roundingDifference}`);
});

test('CMP-08: legacy (pre-engine) bills never enter composition turnover', () => {
  const q = buildCmp08({ bills: [legacy('2026-10-05'), cbill('2026-10-06', 1000)], org: org(), fy: '2026-27' })[2];
  assert.equal(q.bills, 1);
  assert.equal(q.net, 1000);
});

test('CMP-08: missing category or missing rate rule is an error, never a guessed rate', () => {
  const noCat = buildCmp08({ bills: [cbill('2026-10-05', 1000)], org: org({ compositionCategory: undefined }), fy: '2026-27' })[2];
  assert.ok(noCat.errors.length && noCat.total === 0);
  const oldFy = buildCmp08({ bills: [], org: org(), fy: '2023-24' })[0];
  assert.match(oldFy.errors[0], /No composition rate rule/);
});

test('aggregate turnover counts legacy tax invoices EXCLUDING their GST, plus stamped bills, minus returns', () => {
  const bills = [legacy('2026-05-01'), cbill('2026-06-01', 5000)];
  assert.equal(fyAggregateTurnover(bills, '2026-27'), 15000);
  assert.equal(fyAggregateTurnover(bills, '2025-26'), 0);
});

test('GSTR-4 working: annual totals tie to the four quarters; eligibility warns at 80% of the limit', () => {
  const bills = [cbill('2026-05-10', 6000000), cbill('2026-08-10', 4000000), cbill('2026-11-10', 3000000), cbill('2027-02-10', 100000)];
  const w = buildGstr4Working({ bills, grns: [], org: org(), fy: '2026-27', today: '2027-03-01' });
  assert.equal(w.outwardNet, 13100000);
  assert.equal(w.taxPayable, 131000);
  assert.equal(w.cgst + w.sgst, w.taxPayable);
  assert.equal(w.quarters.reduce((s, q) => s + q.total, 0), w.taxPayable);
  assert.equal(w.eligibility.status, 'warning');
  assert.equal(w.eligibility.limit, 15000000);
});

test('GSTR-4 working: crossing the limit or an inter-state outward bill makes the business ineligible; other GSTIN turnover counts', () => {
  const over = buildGstr4Working({ bills: [cbill('2026-05-10', 14000000)], grns: [], org: org(), fy: '2026-27', today: '2027-03-01',
    otherGstinTurnover: { preceding: 0, current: 1500000 } });
  assert.equal(over.eligibility.status, 'ineligible');
  const inter = buildGstr4Working({ bills: [cbill('2026-05-10', 1000, { customerGstin: g('27', 'CUSTM2222D') } as any)], grns: [], org: org(), fy: '2026-27', today: '2027-03-01' });
  assert.equal(inter.eligibility.status, 'ineligible');
  assert.equal(inter.interStateOutwardBills.length, 1);
});

test('inward summary splits registered / unregistered suppliers and shows GST capitalised after the start date', () => {
  const grns = [
    { inwardDate: '2026-03-15', supplierGstin: g('21', 'PQRST5678K'), totalTaxable: 1000, totalTax: 180 },
    { inwardDate: '2026-05-15', supplierGstin: g('21', 'PQRST5678K'), totalTaxable: 100000, totalTax: 18000 },
    { inwardDate: '2026-06-15', supplierGstin: '', totalTaxable: 5000, totalTax: 0 },
    { inwardDate: '2025-12-15', supplierGstin: g('21', 'PQRST5678K'), totalTaxable: 777, totalTax: 7 }, // other FY
  ] as unknown as GRN[];
  const s = buildInwardSummary(grns, org(), '2026-27');
  assert.equal(s.registeredCount, 1);
  assert.equal(s.registeredTaxable, 100000);
  assert.equal(s.unregisteredCount, 1);
  assert.equal(s.totalTaxable, 105000);
  assert.equal(s.taxCapitalised, 18000);
});

test('CSV exports contain the figures and the working-paper disclaimer', () => {
  const bills = [cbill('2026-10-05', 100000)];
  const qs = buildCmp08({ bills, org: org(), fy: '2026-27' });
  const c = cmp08Csv(org(), '2026-27', qs);
  assert.match(c, /CMP-08 working/);
  assert.match(c, /not a portal return/);
  assert.match(c, /Q3,2026-10-01,2026-12-31,1,100000,0,100000,0.5,0.5,500,500,1000/);
  const w = buildGstr4Working({ bills, grns: [], org: org(), fy: '2026-27', today: '2027-03-01' });
  assert.match(gstr4Csv(org(), w), /Total tax payable,100000,500,500,1000/);
});
