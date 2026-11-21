import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCollections } from '../src/utils/collectionSummary';
import { collectReceipts, makeBeatResolver } from '../src/utils/beatReports';
import type { Bill, PaymentRecord } from '../src/types';

const makeBill = (id: number, over: Partial<Bill> = {}): Bill =>
  ({
    id,
    date: '2026-11-10',
    retailer: 'Sri Balaji Stores',
    status: 'paid',
    items: [],
    subtotal: 1000,
    cgst: 0,
    sgst: 0,
    total: 1000,
    amountPaid: 0,
    additionalDiscount: 0,
    returns: [],
    ...over,
  }) as Bill;

const makePayment = (id: string, over: Partial<PaymentRecord> = {}): PaymentRecord =>
  ({
    id,
    customerName: 'Sri Balaji Stores',
    amount: 0,
    mode: 'cash',
    paymentDate: '2026-11-10',
    createdAt: '2026-11-10T10:00:00Z',
    ...over,
  }) as PaymentRecord;

test('summarizeCollections matches collectReceipts across same-period later payments, advances, refunds, and cancelled bills', () => {
  const bills: Bill[] = [
    // Bill 1: paid partly upfront (cash) and partly on a later date in same month (upi)
    makeBill(1, { date: '2026-11-05', total: 1000, amountPaid: 1000, paymentMode: 'cash' }),
    // Bill 2: legacy paid bill with no payment rows
    makeBill(2, { date: '2026-11-08', total: 500, amountPaid: 500, paymentMode: 'upi' }),
    // Bill 3: cancelled bill with stale amountPaid (must be ignored)
    makeBill(3, { date: '2026-11-09', status: 'cancelled', total: 900, amountPaid: 900, paymentMode: 'cash' }),
    // Bill 4: October bill collected in November
    makeBill(4, { date: '2026-10-20', total: 800, amountPaid: 800, paymentMode: 'credit' }),
  ];

  const payments: PaymentRecord[] = [
    // Upfront cash on Bill 1 (05 Nov)
    makePayment('p1', { billId: 1, amount: 400, mode: 'cash', paymentDate: '2026-11-05' }),
    // Later UPI on Bill 1 (12 Nov) — previously double-counted in ReportsMobileHome/ReportsOverview!
    makePayment('p2', { billId: 1, amount: 600, mode: 'upi', paymentDate: '2026-11-12' }),
    // Collection in Nov for Oct Bill 4 — previously missing on Home!
    makePayment('p3', { billId: 4, amount: 800, mode: 'cheque', paymentDate: '2026-11-15' }),
    // Advance / on-account receipt in Nov — previously missing on Home!
    makePayment('p4', { billId: undefined, isAdvance: true, amount: 250, mode: 'bank', paymentDate: '2026-11-18' }),
    // Advance adjustment row (moving existing credit onto a bill) — NOT new cash collected
    makePayment('p5', {
      billId: 1,
      amount: 100,
      mode: 'cash',
      paymentDate: '2026-11-19',
      referenceNote: 'Advance / credit adjusted against invoice #1',
    }),
    // Refund — NOT collected money
    makePayment('p6', { billId: 1, isRefund: true, amount: 150, mode: 'cash', paymentDate: '2026-11-19' }),
  ];

  const inNov = (d: string) => d.startsWith('2026-11');
  const summary = summarizeCollections({ bills, payments, inPeriod: inNov });

  // Expected in Nov:
  // p1 (400 cash) + p2 (600 upi) + Bill 2 fallback (500 upi) + p3 (800 cheque) + p4 (250 bank) = 2550
  assert.equal(summary.cash, 400);
  assert.equal(summary.upi, 1100);
  assert.equal(summary.cheque, 800);
  assert.equal(summary.bank, 250);
  assert.equal(summary.nonCash, 2150);
  assert.equal(summary.total, 2550);
  assert.equal(summary.cash + summary.nonCash, summary.total);

  // Must equal collectReceipts total for the exact same period!
  const resolver = makeBeatResolver([], []);
  const receiptsTotal = collectReceipts({ bills, payments, resolver })
    .filter((r) => inNov(r.date))
    .reduce((s, r) => s + r.amount, 0);
  assert.equal(summary.total, receiptsTotal);
});

test('summarizeCollections caps legacy bill fallback at billNetTotal after sales returns and ignores credit mode', () => {
  const bills: Bill[] = [
    makeBill(10, {
      date: '2026-11-10',
      total: 1000,
      amountPaid: 1000,
      paymentMode: 'cash',
      returns: [{ id: 'r1', date: '2026-11-10', totalCredit: 200, lines: [] } as any],
    }),
    makeBill(11, {
      date: '2026-11-10',
      total: 600,
      amountPaid: 600,
      paymentMode: 'credit',
    }),
  ];

  const summary = summarizeCollections({
    bills,
    payments: [],
    inPeriod: (d) => d === '2026-11-10',
  });

  assert.equal(summary.total, 800);
  assert.equal(summary.cash, 800);
});
