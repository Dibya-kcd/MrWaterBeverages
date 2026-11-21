import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billTotals,
  calculateLandedCostBreakdown,
  lineTaxDetail,
  normalizeTo8DigitHsn,
  productTaxFields,
  resolveProductGstRate,
  resolveProductHsn,
} from '../src/utils/billing';
import { billTaxBasis } from '../src/utils/billTaxBasis';
import { billTaxBreakdown, resolveLineGstRate } from '../src/utils/gstReports';
import { stockCrateCost } from '../src/tax/purchaseCost';
import { normalizePhone, validateBillDraft, validateCustomerForm, validatePhone } from '../src/utils/validation';
import type { Bill, BillItem, Product } from '../src/types';

const nonGstProd: Product = {
  id: 901,
  name: 'Ice Box Crate',
  category: 'general',
  wholesale: 400,
  retail: 480,
  gstRate: 0,
  taxability: 'non_gst',
  hsn: '',
  unitsPerCrate: 12,
};

const gstProd: Product = {
  id: 902,
  name: 'Campa Cola 500ml',
  category: 'vibe',
  wholesale: 280,
  retail: 336,
  gstRate: 0.4,
  taxability: 'taxable',
  hsn: '22021010',
  unitsPerCrate: 24,
};

test('non_gst products keep 0% GST and are never auto-coerced to beverage HSN 22021090', () => {
  assert.equal(resolveProductGstRate({ ...nonGstProd, gstRate: 0.18, hsn: '22021090' }), 0);
  assert.equal(normalizeTo8DigitHsn('', 'water', 'Plastic Crate', 'non_gst'), '');
  assert.equal(normalizeTo8DigitHsn('9999', 'water', 'Plastic Crate', 'non_gst'), '9999');
  assert.equal(resolveProductHsn(nonGstProd), '');
  const fields = productTaxFields({ ...nonGstProd, gstRate: 0.18 });
  assert.equal(fields.taxability, 'non_gst');
  assert.equal(fields.gstRate, 0);
  assert.equal(fields.hsn, '');

  // Taxable products still resolve HSN & GST normally
  assert.equal(normalizeTo8DigitHsn('', 'vibe', 'Cola Soda', 'taxable'), '22021010');
  assert.equal(resolveProductGstRate(gstProd), 0.4);
});

test('non_gst bill lines stay at 0% GST alone and inside mixed GST + Non-GST carts', () => {
  const nonGstItem: BillItem = {
    key: 'ng1',
    productId: nonGstProd.id,
    productName: nonGstProd.name,
    category: nonGstProd.category,
    hsn: '',
    taxability: 'non_gst',
    gst: 0,
    priceType: 'Retail',
    qty: 2,
    rate: 500,
    gross: 1000,
    freeQty: 0,
    chargeableQty: 2,
    discount: 0,
    amount: 1000,
  };

  // Even if someone passes a nonzero rate to lineTaxDetail, taxability === 'non_gst' locks tax to 0
  const forcedZero = lineTaxDetail(nonGstItem, 0.18, 'inclusive', 1);
  assert.equal(forcedZero.rate, 0);
  assert.equal(forcedZero.tax, 0);
  assert.equal(forcedZero.taxable, 1000);

  const nonGstOnlyTotals = billTotals([nonGstItem], 'inclusive', 0, { round: false });
  assert.equal(nonGstOnlyTotals.cgst, 0);
  assert.equal(nonGstOnlyTotals.sgst, 0);
  assert.equal(nonGstOnlyTotals.subtotal, 1000);
  assert.equal(nonGstOnlyTotals.total, 1000);

  // Mixed cart: Non-GST 1000 (0% GST) + GST 1400 (40% inclusive => 400 tax, 1000 taxable)
  const gstItem: BillItem = {
    key: 'g1',
    productId: gstProd.id,
    productName: gstProd.name,
    category: gstProd.category,
    hsn: '22021010',
    taxability: 'taxable',
    gst: 0.4,
    priceType: 'Retail',
    qty: 5,
    rate: 280,
    gross: 1400,
    freeQty: 0,
    chargeableQty: 5,
    discount: 0,
    amount: 1400,
  };
  const mixed = billTotals([nonGstItem, gstItem], 'inclusive', 0, { round: false });
  assert.equal(mixed.total, 2400);
  assert.equal(Math.round((mixed.cgst + mixed.sgst) * 100) / 100, 400);
  assert.equal(Math.round(mixed.subtotal * 100) / 100, 2000);
});

test('gstReports and billTaxBasis exclude non_gst items from GST carve-out and rate resolution', () => {
  const nonGstItem: BillItem = {
    key: 'ng2',
    productId: nonGstProd.id,
    productName: nonGstProd.name,
    category: nonGstProd.category,
    taxability: 'non_gst',
    gst: 0,
    priceType: 'Retail',
    qty: 1,
    rate: 1000,
    gross: 1000,
    freeQty: 0,
    chargeableQty: 1,
    discount: 0,
    amount: 1000,
  };

  const resolved = resolveLineGstRate(nonGstItem, [nonGstProd]);
  assert.equal(resolved.rate, 0);
  assert.equal(resolved.hsn, 'NON-GST');
  assert.equal(resolved.source, 'non_gst');

  const bill: Bill = {
    id: 501,
    retailer: 'Test Shop',
    date: '2026-02-15',
    items: [nonGstItem],
    subtotal: 1000,
    cgst: 0,
    sgst: 0,
    total: 1000,
    discount: 0,
    amountPaid: 1000,
    invoiceType: 'retail',
    isGstInvoice: false,
  };

  const basis = billTaxBasis(bill, {
    carveGstFromPrices: true,
    rateFor: () => 0.18,
  });
  assert.equal(basis.gst, 0);
  assert.equal(basis.taxable, 1000);
  assert.equal(basis.carved, false);

  const breakdown = billTaxBreakdown(bill, [nonGstProd]);
  assert.equal(breakdown.isTaxed, false);
  assert.equal(breakdown.lines[0].tax, 0);
});

test('auto landed price incorporates manual labour and freight for both Non-GST and GST items', () => {
  // Non-GST product: base 500 + manual labour 15 + manual freight 25 = 540/cs => 45/unit (12 pcs/case)
  const nonGstLanded = calculateLandedCostBreakdown({
    qty: 10,
    unitPrice: 500,
    unitsPerCrate: 12,
    cgstPercent: 0,
    sgstPercent: 0,
    schemeType: 'none',
    inwardCostPerCrate: 15 + 25,
  });
  assert.equal(nonGstLanded.gstAmountPerCrate, 0);
  assert.equal(nonGstLanded.landedCostPerCrateExGst, 540);
  assert.equal(nonGstLanded.landedCostPerCrate, 540);
  assert.equal(nonGstLanded.landedCostPerUnit, 45);

  const nonGstStockCost = stockCrateCost(
    { ...nonGstLanded, taxability: 'non_gst', cgstPercent: 0, sgstPercent: 0 },
    'incl_gst',
  );
  assert.equal(nonGstStockCost, 540);

  // GST product: base 1000 + 18% GST + manual labour 12 + freight 18 = 1210 incl-GST, 1030 ex-GST
  const gstLanded = calculateLandedCostBreakdown({
    qty: 10,
    unitPrice: 1000,
    unitsPerCrate: 24,
    cgstPercent: 9,
    sgstPercent: 9,
    schemeType: 'none',
    inwardCostPerCrate: 12 + 18,
  });
  assert.equal(gstLanded.landedCostPerCrateExGst, 1030);
  assert.equal(gstLanded.landedCostPerCrate, 1210);
  assert.equal(Math.round(gstLanded.landedCostPerUnit * 100) / 100, Math.round((1210 / 24) * 100) / 100);
});

test('phone validation supports Indian mobile, +91/0 prefixes, shop landlines, and rejects invalid input', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '+919876543210');
  assert.equal(validatePhone('9876543210'), null);
  assert.equal(validatePhone('+91 98765 43210'), null);
  assert.equal(validatePhone('09876543210'), null);
  assert.equal(validatePhone('0674255123'), null);
  assert.equal(validatePhone(''), null);
  assert.ok(validatePhone('', { required: true }));
  assert.ok(validatePhone('123'));
  assert.ok(validatePhone('abc9876543'));

  const badCustomer = validateCustomerForm({ name: 'Sharma Store', phone: '12345' });
  assert.ok(badCustomer.phone);
  const okCustomer = validateCustomerForm({ name: 'Sharma Store', phone: '+91 9876543210' });
  assert.equal(okCustomer.phone, undefined);

  const badBill = validateBillDraft({ retailer: 'Sharma Store', phone: '99', itemCount: 1, total: 500 });
  assert.ok(badBill.phone);
  const okBill = validateBillDraft({ retailer: 'Sharma Store', phone: '9876543210', itemCount: 1, total: 500 });
  assert.equal(okBill.phone, undefined);
});
