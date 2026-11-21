import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCrateTimeline, formatCompactInr, shortDateLabel } from '../src/utils/crateTimeline';
import type { Bill, CrateDepositRecord, GRN, Product } from '../src/types';

test('shortDateLabel formats ISO dates concisely', () => {
  assert.equal(shortDateLabel('2026-11-20'), '20 Nov');
  assert.equal(shortDateLabel('2026-01-05'), '5 Jan');
  assert.equal(shortDateLabel(''), '—');
  assert.equal(shortDateLabel(null), '—');
});

test('formatCompactInr compacts thousands and lakhs cleanly', () => {
  assert.equal(formatCompactInr(0), '₹0');
  assert.equal(formatCompactInr(850), '₹850');
  assert.equal(formatCompactInr(14000), '₹14k');
  assert.equal(formatCompactInr(31500), '₹31.5k');
  assert.equal(formatCompactInr(150000), '₹1.5L');
  assert.equal(formatCompactInr(-12000), '-₹12k');
});

test('buildCrateTimeline merges manual records, returnable sales, and returns for customers in newest-first order', () => {
  const products = [
    { id: 1, name: 'Water 1L', returnable: true },
    { id: 2, name: 'Juice 250ml', returnable: false },
  ] as unknown as Product[];

  const bills = [
    {
      id: 388,
      docNo: 'INV-0388',
      date: '2026-11-10',
      retailer: 'Sri Balaji Stores',
      status: 'active',
      items: [
        { productId: 1, qty: 12 },
        { productId: 2, qty: 20 },
      ],
      returns: [
        {
          date: '2026-11-15',
          lines: [
            { productId: 1, restockQty: 2, scrapQty: 1 },
            { productId: 2, restockQty: 5, scrapQty: 0 },
          ],
        },
      ],
    },
    {
      id: 389,
      docNo: 'INV-0389',
      date: '2026-11-18',
      retailer: 'Sri Balaji Stores',
      status: 'cancelled',
      cancelled: true,
      items: [{ productId: 1, qty: 99 }],
    },
  ] as unknown as Bill[];

  const records: CrateDepositRecord[] = [
    {
      id: 'rec-2',
      date: '2026-11-20',
      partyType: 'customer',
      partyName: 'Sri Balaji Stores',
      kind: 'empties_returned',
      productId: 1,
      productName: 'Water 1L',
      units: 6,
    },
    {
      id: 'rec-1',
      date: '2026-11-12',
      partyType: 'customer',
      partyName: 'Sri Balaji Stores',
      kind: 'deposit_collected',
      units: 0,
      amount: 1800,
    },
  ];

  const events = buildCrateTimeline({
    partyType: 'customer',
    partyName: 'sri balaji stores',
    records,
    bills,
    grns: [],
    products,
  });

  assert.equal(events.length, 4);
  assert.equal(events[0].title, 'Empties returned');
  assert.equal(events[0].deltaLabel, '-6 cs');
  assert.equal(events[0].tone, 'paid');
  assert.ok(events[0].record);

  assert.equal(events[1].title, 'Return from sale INV-0388');
  assert.equal(events[1].deltaLabel, '-3 cs');
  assert.equal(events[1].record, undefined);

  assert.equal(events[2].title, 'Deposit collected');
  assert.equal(events[2].deltaLabel, '+₹1,800');
  assert.equal(events[2].tone, 'primary');

  assert.equal(events[3].title, 'Sold with sale INV-0388');
  assert.equal(events[3].deltaLabel, '+12 cs');
  assert.equal(events[3].tone, 'due');
});

test('buildCrateTimeline builds automatic GRN events for suppliers', () => {
  const products = [
    { id: 10, name: 'Soda Crate', returnable: true },
  ] as unknown as Product[];

  const grns = [
    {
      id: 41,
      grnNumber: 'GRN-041',
      date: '2026-11-14',
      supplierName: 'Campa Distributors',
      items: [{ productId: 10, qty: 20, freeQty: 2 }],
    },
  ] as unknown as GRN[];

  const records: CrateDepositRecord[] = [
    {
      id: 'sup-1',
      date: '2026-11-19',
      partyType: 'supplier',
      partyName: 'Campa Distributors',
      kind: 'empties_returned',
      units: 10,
    },
  ];

  const events = buildCrateTimeline({
    partyType: 'supplier',
    partyName: 'Campa Distributors',
    records,
    bills: [],
    grns,
    products,
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].deltaLabel, '-10 cs');
  assert.equal(events[1].title, 'Purchase via GRN-041');
  assert.equal(events[1].deltaLabel, '+22 cs');
});
