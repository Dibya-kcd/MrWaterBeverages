import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBillNumber,
  isBillGstInvoice,
  isGstExcludedBill,
} from '../src/utils/invoiceCommon';
import { billTaxBasis } from '../src/utils/billTaxBasis';
import {
  buildGstLines,
  creditNoteSummary,
  invoiceSeriesSummary,
  safeGstSummaryFromBills,
} from '../src/utils/gstReports';
import { billTotals, buildBillText, resolveProductGstRate } from '../src/utils/billing';
import { buildSalesSummary } from '../src/utils/salesSummary';
import type { Bill, BillItem, Customer, Product } from '../src/types';

const gstBeverage: Product = {
  id: 10,
  name: 'Campa Orange 200ml',
  category: 'vibe',
  wholesale: 200,
  retail: 224,
  gstRate: 0.4,
  taxability: 'taxable',
  hsn: '22021010',
  unitsPerCrate: 24,
};

const tradingTataG: Product = {
  id: 20,
  name: 'TATA G Trading',
  category: 'general',
  wholesale: 500,
  retail: 550,
  gstRate: 0,
  taxability: 'non_gst',
  hsn: '',
  unitsPerCrate: 12,
};

const makeItem = (prod: Product, qty: number, rate: number, overrides: Partial<BillItem> = {}): BillItem => ({
  key: `k-${prod.id}-${qty}`,
  productId: prod.id,
  productName: prod.name,
  category: prod.category,
  hsn: prod.hsn || '',
  taxability: prod.taxability || 'taxable',
  gst: prod.taxability === 'non_gst' ? 0 : prod.gstRate ?? 0.4,
  priceType: 'Wholesale',
  qty,
  rate,
  gross: qty * rate,
  freeQty: 0,
  chargeableQty: qty,
  discount: 0,
  amount: qty * rate,
  ...overrides,
});

test('isGstExcludedBill, formatBillNumber, and isBillGstInvoice separate NG- memos from INV- invoices', () => {
  const gstBill: Bill = {
    id: 101,
    docNo: 'INV-101',
    docSeries: 'gst',
    gstExclude: false,
    retailer: 'Babu Store',
    date: '2026-04-10',
    items: [makeItem(gstBeverage, 5, 280)],
    subtotal: 1000,
    cgst: 200,
    sgst: 200,
    total: 1400,
    discount: 0,
    amountPaid: 1400,
    invoiceType: 'tax_invoice',
    isGstInvoice: true,
  };

  const nonGstMemo: Bill = {
    id: 102,
    docNo: 'NG-1',
    docSeries: 'non_gst',
    gstExclude: true,
    splitGroupId: 'split_1',
    retailer: 'Babu Store',
    date: '2026-04-10',
    items: [makeItem(tradingTataG, 2, 500)],
    subtotal: 1000,
    cgst: 0,
    sgst: 0,
    total: 1000,
    discount: 0,
    amountPaid: 600,
    invoiceType: 'bill_of_supply',
    isGstInvoice: false,
  };

  const legacyAllNonGstItemsBill: Bill = {
    id: 103,
    retailer: 'Old Shop',
    date: '2026-04-10',
    items: [makeItem(tradingTataG, 1, 500, { taxability: undefined, gst: 0.05 })],
    subtotal: 500,
    cgst: 0,
    sgst: 0,
    total: 500,
    discount: 0,
    amountPaid: 500,
  };

  assert.equal(isGstExcludedBill(gstBill, [gstBeverage, tradingTataG]), false);
  assert.equal(isGstExcludedBill(nonGstMemo, [gstBeverage, tradingTataG]), true);
  assert.equal(isGstExcludedBill(legacyAllNonGstItemsBill, [gstBeverage, tradingTataG]), true);

  assert.equal(formatBillNumber(gstBill, 'INV'), 'INV-101');
  assert.equal(formatBillNumber(nonGstMemo, 'INV'), 'NG-1');
  assert.equal(
    formatBillNumber({ id: 104, docSeries: 'non_gst', gstExclude: true } as Bill, 'INV'),
    'NG-104',
  );

  // Even when a caller requests 'gst' view format, a Non-GST memo never becomes a Tax Invoice
  assert.equal(isBillGstInvoice(nonGstMemo, 'gst'), false);
  assert.equal(isBillGstInvoice(gstBill, 'gst'), true);
});

test('GST returns, CA summary, credit notes, and Table 13 series exclude NG- trading memos without gaps', () => {
  const cust: Customer = {
    id: 'c1',
    name: 'Babu Store',
    gstin: '21ABCDE1234F1Z5',
    stateCode: '21',
  };

  const gst101: Bill = {
    id: 101,
    docNo: 'INV-101',
    docSeries: 'gst',
    gstExclude: false,
    retailer: 'Babu Store',
    customerGstin: '21ABCDE1234F1Z5',
    supplyType: 'B2B',
    date: '2026-04-10',
    items: [makeItem(gstBeverage, 5, 280)],
    subtotal: 1000,
    cgst: 200,
    sgst: 200,
    total: 1400,
    discount: 0,
    amountPaid: 1400,
    invoiceType: 'tax_invoice',
    isGstInvoice: true,
    returns: [
      {
        id: 'ret_1',
        creditNoteNo: 'CN-1',
        date: '2026-04-12',
        items: [{ productId: gstBeverage.id, productName: gstBeverage.name, qty: 1, creditAmount: 280 }],
        totalCredit: 280,
        cgst: 40,
        sgst: 40,
        mode: 'adjust_bill',
      },
    ],
  };

  // Numeric id 102 sits between 101 and 103 in DB, but belongs to the NG-1 series!
  const ng102: Bill = {
    id: 102,
    docNo: 'NG-1',
    docSeries: 'non_gst',
    gstExclude: true,
    retailer: 'Babu Store',
    customerGstin: '21ABCDE1234F1Z5', // even if customer has GSTIN, NG memo stays excluded
    date: '2026-04-10',
    items: [makeItem(tradingTataG, 4, 500)],
    subtotal: 2000,
    cgst: 0,
    sgst: 0,
    total: 2000,
    discount: 0,
    amountPaid: 2000,
    invoiceType: 'bill_of_supply',
    isGstInvoice: false,
    returns: [
      {
        id: 'ret_ng_1',
        creditNoteNo: 'CN-NG-1',
        date: '2026-04-12',
        items: [{ productId: tradingTataG.id, productName: tradingTataG.name, qty: 1, creditAmount: 500 }],
        totalCredit: 500,
        cgst: 0,
        sgst: 0,
        mode: 'adjust_bill',
      },
    ],
  };

  const gst103: Bill = {
    id: 103,
    docNo: 'INV-103',
    docSeries: 'gst',
    gstExclude: false,
    retailer: 'Walkin Shop',
    date: '2026-04-11',
    items: [makeItem(gstBeverage, 2, 280)],
    subtotal: 400,
    cgst: 80,
    sgst: 80,
    total: 560,
    discount: 0,
    amountPaid: 560,
    invoiceType: 'tax_invoice',
    isGstInvoice: true,
  };

  const allBills = [gst101, ng102, gst103];
  const products = [gstBeverage, tradingTataG];

  const lines = buildGstLines(allBills, products, [cust], 'INV', { orgStateCode: '21' });
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.billId !== 102));

  const cn = creditNoteSummary(allBills, lines, 'INV');
  assert.equal(cn.rows.length, 1);
  assert.equal(cn.rows[0].creditNoteNo, 'CN-1');
  assert.equal(cn.tax, 80);

  const summary = safeGstSummaryFromBills(allBills, products, [cust], 'INV', { orgStateCode: '21' });
  assert.equal(Math.round(summary.outputTaxable * 100) / 100, 1400);
  assert.equal(Math.round(summary.totalOutputGst * 100) / 100, 560);

  // Table 13 series skips id 102 without flagging a false missing invoice gap
  const series = invoiceSeriesSummary([gst101, gst103], [], allBills, [ng102]);
  assert.ok(series);
  assert.equal(series.from, 101);
  assert.equal(series.to, 103);
  assert.equal(series.active, 2);
  assert.equal(series.numbers, 2);
  assert.deepEqual(series.missing, []);
});

test('P&L and Sales Summary keep 100% of Non-GST trading sales with zero fake GST carve-out even if product switched later', () => {
  const productMap = new Map<number, Product>([
    [gstBeverage.id, gstBeverage],
    [tradingTataG.id, tradingTataG],
  ]);

  // Simulate historical TATA G bill saved with item.gst = 0.05 before user bulk-switched TATA G to non_gst
  const historicalTataGBill: Bill = {
    id: 205,
    docNo: 'NG-2',
    docSeries: 'non_gst',
    gstExclude: true,
    retailer: 'Sahoo Traders',
    date: '2026-04-14',
    items: [makeItem(tradingTataG, 2, 500, { taxability: undefined, gst: 0.05 })],
    subtotal: 1000,
    cgst: 0,
    sgst: 0,
    total: 1000,
    discount: 0,
    amountPaid: 1000,
  };

  const gstBill: Bill = {
    id: 206,
    docNo: 'INV-206',
    docSeries: 'gst',
    gstExclude: false,
    retailer: 'Sahoo Traders',
    date: '2026-04-14',
    items: [makeItem(gstBeverage, 5, 280)],
    subtotal: 1000,
    cgst: 200,
    sgst: 200,
    total: 1400,
    discount: 0,
    amountPaid: 1400,
  };

  const rateFor = (item: BillItem) => {
    const prod = productMap.get(item.productId);
    if (item.taxability === 'non_gst' || prod?.taxability === 'non_gst') return 0;
    return item.gst !== undefined && item.gst !== null
      ? (item.gst as number)
      : resolveProductGstRate(prod, item.category);
  };

  const basisNg = billTaxBasis(historicalTataGBill, { carveGstFromPrices: true, rateFor });
  assert.equal(basisNg.gst, 0);
  assert.equal(basisNg.taxable, 1000);
  assert.equal(basisNg.carved, false);

  const summary = buildSalesSummary({
    bills: [historicalTataGBill, gstBill],
    salesmen: [],
    taxBasisOf: (b) => billTaxBasis(b, { carveGstFromPrices: true, rateFor }),
  });

  // Sales Summary retains full ₹2,400 combined sales (₹1,400 GST + ₹1,000 Trading) with only ₹400 GST
  assert.equal(summary.totals.bills, 2);
  assert.equal(summary.totals.netSales, 2400);
  assert.equal(Math.round(summary.totals.gst * 100) / 100, 400);
  assert.equal(Math.round(summary.totals.beforeGst * 100) / 100, 2000);
});

test('Mixed cart split computation yields exact totals, priority payment split, and clean CASH MEMO WhatsApp text', () => {
  const gstItem = makeItem(gstBeverage, 5, 280);
  const nonGstItem = makeItem(tradingTataG, 2, 500);

  const gstTotals = billTotals([gstItem], 'inclusive', 0);
  const ngTotals = billTotals([nonGstItem], 'off', 0);

  assert.equal(gstTotals.total, 1400);
  assert.equal(Math.round((gstTotals.cgst + gstTotals.sgst) * 100) / 100, 400);
  assert.equal(ngTotals.total, 1000);
  assert.equal(ngTotals.cgst + ngTotals.sgst, 0);

  // Payment of ₹1,800 fills GST invoice (₹1,400) first, remainder (₹400) goes to NG- memo
  const totalPaid = 1800;
  const gstPaid = Math.min(gstTotals.total, totalPaid);
  const ngPaid = Math.min(ngTotals.total, Math.max(0, totalPaid - gstPaid));
  assert.equal(gstPaid, 1400);
  assert.equal(ngPaid, 400);

  const ngBill: Bill = {
    ...ngTotals,
    id: 301,
    docNo: 'NG-3',
    docSeries: 'non_gst',
    gstExclude: true,
    splitGroupId: 'split_300',
    retailer: 'Ramesh Kirana',
    date: '2026-04-15',
    items: [nonGstItem],
    amountPaid: ngPaid,
  };
  const msg = buildBillText(ngBill, 'MrWater');
  assert.match(msg, /CASH MEMO \/ TRADING BILL/);
  assert.match(msg, /NG-3/);
  assert.match(msg, /Non-GST \/ 0% Tax/);
});
