import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMixedTaxBills,
  isGstExcludedBill,
  isMixedTaxBill,
} from '../src/utils/invoiceCommon';
import { planSplitMixedBill } from '../src/utils/mixedBillSplit';
import { buildGstLines } from '../src/utils/gstReports';
import type { Bill, BillItem, Product } from '../src/types';

const vibeLemon: Product = {
  id: 8,
  name: 'E.H. VIBE CLEAR LEMON 150ML PET',
  category: 'vibe',
  wholesale: 220,
  retail: 240,
  gstRate: 0.4,
  taxability: 'taxable',
  hsn: '22021090',
  unitsPerCrate: 24,
};

const tataGluco: Product = {
  id: 26,
  name: 'TATA GLUCO',
  category: 'general',
  wholesale: 185,
  retail: 200,
  gstRate: 0,
  taxability: 'non_gst',
  hsn: '',
  unitsPerCrate: 24,
};

const products: Product[] = [vibeLemon, tataGluco];

const makeBill573 = (overrides: Partial<Bill> = {}): Bill => {
  const vibeLine: BillItem = {
    key: 'k-8',
    productId: 8,
    productName: vibeLemon.name,
    category: 'vibe',
    hsn: '22021090',
    taxability: 'taxable',
    gst: 40,
    priceType: 'Retail',
    qty: 1,
    rate: 240,
    gross: 240,
    freeQty: 0,
    chargeableQty: 1,
    discount: 0,
    amount: 240,
    costExGst: 145.5,
    batchNumber: 'B-VIBE-1',
    batchAllocations: [{ batchId: 'batch_vibe_1', batchNumber: 'B-VIBE-1', qty: 1 }],
  };
  const glucoLine: BillItem = {
    key: 'k-26',
    productId: 26,
    productName: tataGluco.name,
    category: 'general',
    hsn: '',
    taxability: 'non_gst',
    gst: 0,
    priceType: 'Retail',
    qty: 1,
    rate: 200,
    gross: 200,
    freeQty: 0,
    chargeableQty: 1,
    discount: 0,
    amount: 200,
    costExGst: 173.33,
    batchNumber: 'B-GLUCO-1',
    batchAllocations: [{ batchId: 'batch_gluco_1', batchNumber: 'B-GLUCO-1', qty: 1 }],
  };
  return {
    id: 573,
    docSeries: 'gst',
    gstExclude: false,
    invoiceType: 'tax_invoice',
    isGstInvoice: true,
    supplyType: 'B2C',
    retailer: 'Atulya Store, Kindra',
    phone: '9777207283',
    date: '2026-11-17',
    warehouseId: 'wh_mujl6iti0gjo',
    tripId: 266649923,
    vehicle: 'OD-31-M-1234',
    salesman: 'Raju',
    salesmanId: 'sm_1',
    items: [vibeLine, glucoLine],
    subtotal: 371.43,
    cgst: 34.29,
    sgst: 34.29,
    total: 440,
    discount: 0,
    additionalDiscount: 0,
    amountPaid: 440,
    paymentDate: '2026-11-17',
    paymentMode: 'cash',
    ...overrides,
  };
};

test('findMixedTaxBills detects mixed GST + Non-GST invoice like #INV-573', () => {
  const mixed573 = makeBill573();
  const pureGst: Bill = makeBill573({
    id: 572,
    items: [mixed573.items[0]],
    subtotal: 171.43,
    total: 240,
    amountPaid: 240,
  });
  const pureNg: Bill = makeBill573({
    id: 571,
    docNo: 'NG-1',
    docSeries: 'non_gst',
    gstExclude: true,
    items: [mixed573.items[1]],
    subtotal: 200,
    cgst: 0,
    sgst: 0,
    total: 200,
    amountPaid: 200,
  });
  const cancelledMixed = makeBill573({ id: 570, status: 'cancelled' });
  const mixedWithReturns = makeBill573({
    id: 569,
    returns: [
      {
        id: 'ret_1',
        creditNoteNo: 'CN-1',
        date: '2026-11-18',
        items: [{ productId: 8, productName: vibeLemon.name, qty: 1, creditAmount: 240 }],
        totalCredit: 240,
        cgst: 34.29,
        sgst: 34.29,
        mode: 'adjust_bill',
      },
    ],
  });

  assert.equal(isMixedTaxBill(mixed573, products), true);
  assert.equal(isMixedTaxBill(pureGst, products), false);
  assert.equal(isMixedTaxBill(pureNg, products), false);
  assert.equal(isMixedTaxBill(cancelledMixed, products), false);
  assert.equal(isGstExcludedBill(mixed573, products), false);

  const found = findMixedTaxBills(
    [mixed573, pureGst, pureNg, cancelledMixed, mixedWithReturns],
    products,
  );
  assert.equal(found.billCount, 2);
  assert.equal(found.lineCount, 2);
  assert.equal(found.nonGstAmount, 400);
  assert.equal(found.entries[0].bill.id, 573);
  assert.equal(found.entries[0].nonGstAmount, 200);
  assert.deepEqual(found.entries[0].nonGstProductNames, ['TATA GLUCO']);
  assert.equal(found.entries[0].canAutoSplit, true);
  assert.equal(found.entries[1].bill.id, 569);
  assert.equal(found.entries[1].canAutoSplit, false);
});

test('planSplitMixedBill splits #INV-573 into INV-573 (GST) + NG-1 (Non-GST) preserving batches, trip, godown, and paid money', () => {
  const bill573 = makeBill573();
  const plan = planSplitMixedBill({
    bill: bill573,
    originalBill: bill573,
    products,
    gstMode: 'inclusive',
    outputTaxOff: false,
    nextBillId: 574,
    nextNonGstDocNo: 'NG-1',
    invoicePrefix: 'INV',
    splitGroupId: 'split_573',
    editBy: 'Admin',
    comment: 'Move TATA GLUCO to NG- memo',
    nowIso: '2026-11-19T05:00:00.000Z',
  });

  assert.ok(plan);
  const { gstBill, nonGstBill, updatedBill, createdBill, combinedTotal } = plan;

  // Original ID stays on GST invoice, new ID gets NG-1
  assert.equal(updatedBill.id, 573);
  assert.equal(createdBill.id, 574);
  assert.equal(gstBill.id, 573);
  assert.equal(gstBill.docNo, 'INV-573');
  assert.equal(gstBill.docSeries, 'gst');
  assert.equal(gstBill.gstExclude, false);
  assert.equal(gstBill.isGstInvoice, true);
  assert.equal(gstBill.total, 240);
  assert.equal(gstBill.amountPaid, 240);
  assert.equal(Math.round((gstBill.cgst + gstBill.sgst) * 100) / 100, 68.57);
  assert.equal(Math.round((gstBill.subtotal + gstBill.cgst + gstBill.sgst) * 100) / 100, 240);
  assert.equal(gstBill.items.length, 1);
  assert.equal(gstBill.items[0].productId, 8);
  assert.deepEqual(gstBill.items[0].batchAllocations, [
    { batchId: 'batch_vibe_1', batchNumber: 'B-VIBE-1', qty: 1 },
  ]);
  assert.equal(gstBill.items[0].costExGst, 145.5);
  assert.equal(gstBill.splitGroupId, 'split_573');
  assert.equal(gstBill.editHistory?.length, 1);
  assert.match(gstBill.editHistory![0].changes[0], /NG-1/);

  assert.equal(nonGstBill.id, 574);
  assert.equal(nonGstBill.docNo, 'NG-1');
  assert.equal(nonGstBill.docSeries, 'non_gst');
  assert.equal(nonGstBill.gstExclude, true);
  assert.equal(nonGstBill.invoiceType, 'bill_of_supply');
  assert.equal(nonGstBill.isGstInvoice, false);
  assert.equal(nonGstBill.total, 200);
  assert.equal(nonGstBill.subtotal, 200);
  assert.equal(nonGstBill.cgst, 0);
  assert.equal(nonGstBill.sgst, 0);
  assert.equal(nonGstBill.amountPaid, 200);
  assert.equal(nonGstBill.tripId, 266649923);
  assert.equal(nonGstBill.warehouseId, 'wh_mujl6iti0gjo');
  assert.equal(nonGstBill.items.length, 1);
  assert.equal(nonGstBill.items[0].productId, 26);
  assert.deepEqual(nonGstBill.items[0].batchAllocations, [
    { batchId: 'batch_gluco_1', batchNumber: 'B-GLUCO-1', qty: 1 },
  ]);
  assert.equal(nonGstBill.items[0].costExGst, 173.33);
  assert.equal(nonGstBill.splitGroupId, 'split_573');
  assert.equal(isGstExcludedBill(nonGstBill, products), true);
  assert.equal(isGstExcludedBill(gstBill, products), false);
  assert.equal(combinedTotal, 440);
});

test('planSplitMixedBill allocates partial payment GST-first and preserves proportional additionalDiscount', () => {
  const bill573 = makeBill573({ additionalDiscount: 44, total: 396, amountPaid: 250 });
  const plan = planSplitMixedBill({
    bill: bill573,
    originalBill: bill573,
    products,
    gstMode: 'inclusive',
    outputTaxOff: false,
    nextBillId: 575,
    nextNonGstDocNo: 'NG-2',
    invoicePrefix: 'INV',
    splitGroupId: 'split_disc',
  });

  assert.ok(plan);
  // Proportional discount: 44 * (240/440) = 24 on GST, 20 on Non-GST
  assert.equal(plan.gstBill.additionalDiscount, 24);
  assert.equal(plan.nonGstBill.additionalDiscount, 20);
  assert.equal(plan.gstBill.total, 216);
  assert.equal(plan.nonGstBill.total, 180);
  assert.equal(plan.combinedTotal, 396);
  // ₹250 received fills ₹216 on GST invoice first, remaining ₹34 goes to NG-2
  assert.equal(plan.gstBill.amountPaid, 216);
  assert.equal(plan.nonGstBill.amountPaid, 34);
});

test('planSplitMixedBill keeps original NG- ID when a GST item is added to an existing NG- memo', () => {
  const origNg = makeBill573({
    id: 600,
    docNo: 'NG-5',
    docSeries: 'non_gst',
    gstExclude: true,
    invoiceType: 'bill_of_supply',
    isGstInvoice: false,
    items: [makeBill573().items[1]],
    subtotal: 200,
    cgst: 0,
    sgst: 0,
    total: 200,
    amountPaid: 200,
  });
  const editedMixedDraft = makeBill573({
    id: 600,
    docNo: 'NG-5',
    docSeries: 'non_gst',
    gstExclude: true,
    amountPaid: 440,
  });

  const plan = planSplitMixedBill({
    bill: editedMixedDraft,
    originalBill: origNg,
    products,
    gstMode: 'inclusive',
    outputTaxOff: false,
    nextBillId: 601,
    nextNonGstDocNo: 'NG-6',
    invoicePrefix: 'INV',
    splitGroupId: 'split_rev',
  });

  assert.ok(plan);
  assert.equal(plan.updatedBill.id, 600);
  assert.equal(plan.updatedBill.docNo, 'NG-5');
  assert.equal(plan.updatedBill.docSeries, 'non_gst');
  assert.equal(plan.createdBill.id, 601);
  assert.equal(plan.createdBill.docNo, 'INV-601');
  assert.equal(plan.createdBill.docSeries, 'gst');
});

test('buildGstLines excludes Non-GST lines even inside an unsplit legacy mixed INV- bill', () => {
  const mixed573 = makeBill573();
  const lines = buildGstLines([mixed573], products, [], 'INV', { orgStateCode: '21' });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].productName, vibeLemon.name);
  assert.equal(lines[0].gstRatePct, 40);
  assert.equal(lines[0].lineTotal, 240);
});
