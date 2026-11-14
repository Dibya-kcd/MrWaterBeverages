import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLandedCostBreakdown, inwardFreightAlreadyInCost, resolveItemCrateCost } from '../src/utils/billing';
import { stockCrateCost } from '../src/tax/purchaseCost';

// 100 cases on the invoice (20 free), Rs 200/case ex-GST, 18% GST, Rs 5/case inward freight + labour
function bulkInwardItem() {
  const b = calculateLandedCostBreakdown({
    qty: 100, unitPrice: 200, unitsPerCrate: 24, cgstPercent: 9, sgstPercent: 9,
    schemeType: 'free_cases', freeQty: 20, inwardCostPerCrate: 5,
  });
  // the fields BulkInwardModal saves on the GRN line
  return {
    unitPrice: 200, unitsPerCrate: 24, cgstPercent: 9, sgstPercent: 9,
    totalReceivedQty: b.totalReceivedQty,
    effectiveCostPerCrateExGst: b.effectiveCostPerCrateExGst,
    effectiveCostPerCrateInclGst: b.effectiveCostPerCrateInclGst,
    landedCostPerCrate: b.landedCostPerCrate,
    landedCostPerCrateExGst: b.landedCostPerCrateExGst,
    effectiveCostPerUnit: b.effectiveCostPerCrateExGst,
    inwardCostPerCrate: b.inwardCostPerCrate,
  };
}

test('invoice-upload GRN: batch cost already contains the freight, so it must not be added again', () => {
  const item = bulkInwardItem();
  assert.equal(stockCrateCost(item, 'ex_gst'), 165); // 160 purchase + 5 freight
  assert.equal(inwardFreightAlreadyInCost(item, 5), true);
  // report cost per case = batch cost + freight still to add = 165 + 0
  const extra = inwardFreightAlreadyInCost(item, 5) ? 0 : 5;
  assert.equal(stockCrateCost(item, 'ex_gst') + extra, 165);
});

test('manual GRN line without freight in its cost: freight is still added once', () => {
  // manual inward screens store landed ex-GST = scheme-adjusted cost (no freight inside)
  const item: any = { unitPrice: 200, unitsPerCrate: 24, landedCostPerCrateExGst: 160, inwardCostPerCrate: 5 };
  assert.equal(resolveItemCrateCost(item), 160);
  assert.equal(inwardFreightAlreadyInCost(item, 5), false);
  const item2: any = { unitPrice: 200, unitsPerCrate: 24, effectiveCostPerCrateExGst: 160, landedCostPerCrateExGst: 160, inwardCostPerCrate: 5 };
  assert.equal(inwardFreightAlreadyInCost(item2, 5), false);
});

test('no freight, or missing data: nothing is assumed', () => {
  assert.equal(inwardFreightAlreadyInCost(bulkInwardItem(), 0), false);
  assert.equal(inwardFreightAlreadyInCost(undefined, 5), false);
  assert.equal(inwardFreightAlreadyInCost({}, 5), false);
});

// ---- GST in prices (regular taxpayer selling on non-GST bills) --------------------------------------------
import { billTaxBasis } from '../src/utils/billTaxBasis';

function nonGstBill(): any {
  // 10 cases at Rs 118 (GST 18% included in the price), no tax stored on the bill
  return {
    id: 1, date: '2026-11-01', status: 'paid',
    items: [{ productId: 1, qty: 10, freeQty: 0, rate: 118, discount: 0, amount: 1180, gst: 18 }],
    subtotal: 1180, cgst: 0, sgst: 0, total: 1180, additionalDiscount: 0, returns: [],
  };
}

test('non-GST bill of a regular taxpayer: GST is carved out of the price, not counted as revenue', () => {
  const r = billTaxBasis(nonGstBill(), { carveGstFromPrices: true });
  assert.ok(Math.abs(r.taxable - 1000) < 0.01, `taxable ${r.taxable}`);
  assert.ok(Math.abs(r.gst - 180) < 0.01, `gst ${r.gst}`);
  assert.equal(r.carved, true);
});

test('composition / unregistered business: nothing is carved', () => {
  const r = billTaxBasis(nonGstBill(), { carveGstFromPrices: false });
  assert.equal(r.taxable, 1180);
  assert.equal(r.gst, 0);
});

test('tax invoice keeps its stored tax split', () => {
  const b: any = { ...nonGstBill(), subtotal: 1000, cgst: 90, sgst: 90, total: 1180 };
  const r = billTaxBasis(b, { carveGstFromPrices: true });
  assert.equal(r.taxable, 1000);
  assert.equal(r.gst, 180);
  assert.equal(r.carved, false);
});

test('returns reduce revenue and GST in proportion on a non-GST bill', () => {
  const b: any = { ...nonGstBill(), returns: [{ totalCredit: 118, cgst: 0, sgst: 0, lines: [] }] };
  const r = billTaxBasis(b, { carveGstFromPrices: true });
  assert.ok(Math.abs(r.taxable - 900) < 0.01, `taxable ${r.taxable}`);
  assert.ok(Math.abs(r.gst - 162) < 0.01, `gst ${r.gst}`);
});

// ---- write-off recovery must be ex-GST ----------------------------------------------------------------------
import { writeOffNetForPeriod } from '../src/utils/pnlBridge';

test('partial supplier compensation: only the ex-GST part counts as recovered', () => {
  const disp: any = {
    id: 'd1', status: 'recorded', eventDate: '2026-11-02', costValue: 100, qty: 1, stockApplied: true,
    compensationStatus: 'partial', compensatedAmount: 70.8, cnTotal: 70.8, cnTaxableValue: 60,
  };
  const r: any = writeOffNetForPeriod([disp], () => true);
  assert.ok(Math.abs(r.recovered - 60) < 0.01, `recovered ${r.recovered}`);
  assert.ok(Math.abs(r.net - 40) < 0.01, `net ${r.net}`);
});
