import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesSummary } from '../src/utils/salesSummary';
import { billTaxBasis } from '../src/utils/billTaxBasis';
import { ledgerTotalDue, liveBillsDue, totalDueOf, dueGapNote } from '../src/utils/dueSummary';

const item = (productId: number, qty: number, amount: number): any => ({
  productId, productName: `P${productId}`, qty, freeQty: 0, rate: amount / qty, discount: 0, amount, gst: 18,
});
const bill = (id: number, over: any = {}): any => ({
  id, date: '2026-11-01', retailer: 'Ravi Stores', status: 'paid', items: [item(1, 10, 1180)],
  subtotal: 1180, cgst: 0, sgst: 0, total: 1180, amountPaid: 0, additionalDiscount: 0, returns: [], ...over,
});
const taxBasisOf = (b: any) => billTaxBasis(b, { carveGstFromPrices: true });

test('sales summary: totals, paid and unpaid come from live bills only', () => {
  const bills = [
    bill(1, { amountPaid: 1180 }),
    bill(2, { amountPaid: 500, salesman: 'Raju', retailer: 'Shyam Shop' }),
    bill(3, { status: 'cancelled', total: 999 }),
  ];
  const s = buildSalesSummary({ bills, taxBasisOf });
  assert.equal(s.totals.bills, 2);
  assert.equal(s.totals.netSales, 2360);
  assert.equal(s.totals.paid, 1680);
  assert.equal(s.totals.unpaid, 680);
  assert.ok(Math.abs(s.totals.gst - 360) < 0.01);
  assert.ok(Math.abs(s.totals.beforeGst - 2000) < 0.01);
  assert.equal(s.byCustomer.length, 2);
  assert.equal(s.bySalesman.map((r) => r.label).sort().join(','), 'Office / counter,Raju');
});

test('sales summary: returns reduce net sales, cases and the product line', () => {
  const b = bill(1, { returns: [{ totalCredit: 118, cgst: 0, sgst: 0, lines: [{ productId: 1, restockQty: 1, scrapQty: 0, credit: 118 }] }] });
  const s = buildSalesSummary({ bills: [b], taxBasisOf });
  assert.equal(s.totals.netSales, 1062);
  assert.equal(s.totals.returns, 118);
  assert.equal(s.totals.cases, 9);
  assert.equal(s.byProduct[0].cases, 9);
  assert.equal(s.byProduct[0].netSales, 1062);
});

test('due: ledger total is the one definition, cancelled bills never count', () => {
  const live = bill(1, { amountPaid: 400 });
  const cancelled = bill(2, { status: 'cancelled', amountPaid: 0 });
  assert.equal(liveBillsDue([live, cancelled]), 780);
  const ledger: any[] = [{ name: 'Ravi Stores', balanceDue: 1000 }, { name: 'Clear', balanceDue: 0 }];
  assert.deepEqual(ledgerTotalDue(ledger), { total: 1000, customers: 1 });
  assert.equal(totalDueOf({ existingCustomers: ledger, bills: [live, cancelled] }), 1000);
  assert.equal(totalDueOf({ existingCustomers: [], bills: [live, cancelled] }), 780);
  assert.match(dueGapNote(1000, 780), /opening balance/);
  assert.equal(dueGapNote(780, 780), '');
});
