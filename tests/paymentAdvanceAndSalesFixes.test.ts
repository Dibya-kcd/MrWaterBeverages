import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdvanceAdjustmentRow,
  remainingAdvanceAmount,
  sumCustomerRecordedPaid,
} from '../src/utils/paymentAllocation';
import { summarizeCollections } from '../src/utils/collectionSummary';
import { collectReceipts, effectiveBillBalances, makeBeatResolver } from '../src/utils/beatReports';
import { buildSalesSummary } from '../src/utils/salesSummary';
import { billTaxBasis } from '../src/utils/billTaxBasis';
import {
  auditToDbRow,
  dbRowToAudit,
  dbRowToPayment,
  paymentToDbRow,
} from '../src/lib/supabase';
import type { Bill, PaymentAuditEntry, PaymentRecord } from '../src/types';

test('advance kept at full value preserves Collections and avoids customer ledger double-count', () => {
  const advRow: PaymentRecord = {
    id: 'pay_adv_1',
    customerName: 'Ravi Stores',
    paymentDate: '2026-11-01',
    amount: 5000,
    mode: 'cash',
    entryKind: 'advance',
    isAdvance: true,
    appliedAmount: 3000,
    isAdvanceApplied: false,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-05T10:00:00Z',
  };
  const adjRow: PaymentRecord = {
    id: 'pay_adj_1',
    billId: 101,
    customerName: 'Ravi Stores',
    paymentDate: '2026-11-05',
    amount: 3000,
    mode: 'other',
    entryKind: 'advance_adjustment',
    sourcePaymentId: 'pay_adv_1',
    referenceNote: 'Advance / credit adjusted against invoice #101',
    createdAt: '2026-11-05T10:00:00Z',
  };
  const bill: Bill = {
    id: 101,
    date: '2026-11-05',
    retailer: 'Ravi Stores',
    status: 'paid',
    items: [],
    subtotal: 3000,
    cgst: 0,
    sgst: 0,
    total: 3000,
    amountPaid: 3000,
    discount: 0,
    additionalDiscount: 0,
    returns: [],
  } as Bill;

  assert.equal(isAdvanceAdjustmentRow(adjRow), true);
  assert.equal(remainingAdvanceAmount(advRow), 2000);

  const fullAppliedAdv = { ...advRow, appliedAmount: 5000, isAdvanceApplied: true };
  assert.equal(remainingAdvanceAmount(fullAppliedAdv), 0);

  // Collections on 01 Nov must still show Rs 5,000 even after adjustment on 05 Nov
  const inNov = (d: string) => d.startsWith('2026-11');
  const col = summarizeCollections({
    bills: [bill],
    payments: [advRow, adjRow],
    inPeriod: inNov,
  });
  assert.equal(col.total, 5000);
  assert.equal(col.cash, 5000);

  const resolver = makeBeatResolver([], []);
  const receipts = collectReceipts({ bills: [bill], payments: [advRow, adjRow], resolver });
  assert.equal(receipts.reduce((s, r) => s + r.amount, 0), 5000);

  // Customer ledger must count 5,000 once (not 5,000 + 3,000 = 8,000)
  assert.equal(sumCustomerRecordedPaid([advRow, adjRow]), 5000);

  // Legacy adjustment rows without sourcePaymentId still count (where old advRow was deleted/shrunk)
  const legacyAdj: PaymentRecord = {
    id: 'pay_legacy_adj',
    billId: 102,
    customerName: 'Ravi Stores',
    paymentDate: '2026-10-15',
    amount: 1200,
    mode: 'other',
    referenceNote: 'Advance / credit adjusted against invoice #102',
    createdAt: '2026-10-15T10:00:00Z',
  };
  assert.equal(sumCustomerRecordedPaid([advRow, adjRow, legacyAdj]), 6200);
});

test('overpaid invoice credit transfer preserves original cash receipt and balances both bills', () => {
  const b1: Bill = {
    id: 201,
    date: '2026-11-01',
    retailer: 'Kiran Mart',
    status: 'paid',
    items: [],
    subtotal: 1000,
    cgst: 0,
    sgst: 0,
    total: 1000,
    amountPaid: 800, // Originally 1000 paid; 200 transferred to bill 202 after 200 return
    returns: [{ id: 'ret1', date: '2026-11-03', totalCredit: 200, cgst: 0, sgst: 0, lines: [] } as any],
  } as Bill;
  const b2: Bill = {
    id: 202,
    date: '2026-11-04',
    retailer: 'Kiran Mart',
    status: 'paid',
    items: [],
    subtotal: 500,
    cgst: 0,
    sgst: 0,
    total: 500,
    amountPaid: 200,
    returns: [],
  } as Bill;

  const origCash: PaymentRecord = {
    id: 'pay_cash_201',
    billId: 201,
    customerName: 'Kiran Mart',
    paymentDate: '2026-11-01',
    amount: 1000,
    mode: 'cash',
    entryKind: 'receipt',
    createdAt: '2026-11-01T09:00:00Z',
  };
  const transferOut: PaymentRecord = {
    id: 'pay_out_201',
    billId: 201,
    sourceBillId: 201,
    customerName: 'Kiran Mart',
    paymentDate: '2026-11-04',
    amount: -200,
    mode: 'other',
    entryKind: 'advance_adjustment',
    referenceNote: 'Advance / credit transferred from invoice #201 to #202',
    createdAt: '2026-11-04T09:00:00Z',
  };
  const transferIn: PaymentRecord = {
    id: 'pay_in_202',
    billId: 202,
    sourceBillId: 201,
    customerName: 'Kiran Mart',
    paymentDate: '2026-11-04',
    amount: 200,
    mode: 'other',
    entryKind: 'advance_adjustment',
    referenceNote: 'Advance / credit adjusted against invoice #202 (from #201)',
    createdAt: '2026-11-04T09:00:01Z',
  };

  const payments = [origCash, transferOut, transferIn];

  // Collections still reflects the full 1000 cash received on 01 Nov
  const col = summarizeCollections({
    bills: [b1, b2],
    payments,
    inPeriod: (d) => d.startsWith('2026-11'),
  });
  assert.equal(col.total, 1000);
  assert.equal(col.cash, 1000);

  // Customer ledger total paid stays 1000 (1000 - 200 + 200 = 1000)
  assert.equal(sumCustomerRecordedPaid(payments), 1000);

  // Bill balances match: b1 due = 0, b2 due = 300
  const balances = effectiveBillBalances([b1, b2], payments);
  assert.equal(balances.get(201), 0);
  assert.equal(balances.get(202), 300);
});

test('sales summary byProduct sums to totals.netSales even with additionalDiscount, roundOff, and returns', () => {
  const bills: any[] = [
    {
      id: 301,
      date: '2026-11-01',
      retailer: 'Shop A',
      status: 'paid',
      items: [
        { productId: 1, productName: 'Prod 1', qty: 2, freeQty: 0, rate: 300, discount: 0, amount: 600, gst: 18 },
        { productId: 2, productName: 'Prod 2', qty: 4, freeQty: 0, rate: 100, discount: 0, amount: 400, gst: 18 },
      ],
      subtotal: 1000,
      cgst: 0,
      sgst: 0,
      discount: 0,
      additionalDiscount: 100,
      roundOff: -0.35,
      total: 899.65,
      amountPaid: 899.65,
      returns: [
        {
          totalCredit: 100,
          cgst: 0,
          sgst: 0,
          lines: [{ productId: 1, restockQty: 0.33, scrapQty: 0, credit: 100 }],
        },
      ],
    },
    {
      id: 302,
      date: '2026-11-02',
      retailer: 'Shop B',
      status: 'paid',
      items: [
        { productId: 1, productName: 'Prod 1', qty: 1, freeQty: 0, rate: 333.33, discount: 0, amount: 333.33, gst: 18 },
        { productId: 3, productName: 'Prod 3', qty: 2, freeQty: 0, rate: 333.33, discount: 0, amount: 666.66, gst: 18 },
      ],
      subtotal: 999.99,
      cgst: 0,
      sgst: 0,
      discount: 0,
      additionalDiscount: 50,
      roundOff: 0.01,
      total: 950,
      amountPaid: 950,
      returns: [],
    },
  ];

  const s = buildSalesSummary({
    bills,
    taxBasisOf: (b) => billTaxBasis(b, { carveGstFromPrices: true }),
  });

  const sumByProduct = Math.round(s.byProduct.reduce((sum, r) => sum + r.netSales, 0) * 100) / 100;
  assert.equal(sumByProduct, s.totals.netSales);
});

test('payment & paymentAudit DB row mappers round-trip metadata cleanly', () => {
  const p: PaymentRecord = {
    id: 'pay_rt_1',
    customerId: 'cust_1',
    customerName: 'Test Mart',
    customerPhone: '9876543210',
    paymentDate: '2026-11-10',
    amount: 5000,
    mode: 'upi',
    entryKind: 'advance',
    isAdvance: true,
    isAdvanceApplied: true,
    appliedAmount: 5000,
    referenceNote: 'Advance / on account',
    recordedBy: 'Admin',
    createdAt: '2026-11-10T11:00:00Z',
    updatedAt: '2026-11-12T12:00:00Z',
  };
  const row = paymentToDbRow(p);
  assert.equal(row.entry_kind, 'advance');
  assert.equal(row.is_advance_applied, true);
  assert.equal(row.applied_amount, 5000);
  const back = dbRowToPayment(row);
  assert.deepEqual(back, p);

  const audit: PaymentAuditEntry = {
    id: 'aud_1',
    at: '2026-11-12T12:00:00Z',
    by: 'Admin',
    action: 'apply_advance',
    paymentId: 'pay_adj_x',
    billId: 55,
    customerName: 'Test Mart',
    amount: 1500,
    note: 'Adjusted advance',
    after: { ...p, id: 'pay_adj_x', billId: 55, amount: 1500, entryKind: 'advance_adjustment', sourcePaymentId: p.id },
  };
  const aRow = auditToDbRow(audit);
  const aBack = dbRowToAudit(aRow);
  assert.deepEqual(aBack, audit);
});
