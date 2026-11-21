import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBeatSummary,
  buildCustomerOverall,
  buildReceiptRegister,
  collectReceipts,
  makeBeatResolver,
  NO_BEAT,
} from '../src/utils/beatReports';
import type { Bill, Customer, ExistingCustomer, PaymentRecord } from '../src/types';
import type { BeatLike } from '../src/utils/beats';

const beats: BeatLike[] = [
  { id: 'b1', name: 'Kuchinda Town', active: true },
  { id: 'b2', name: 'Kusumi', active: true },
];

const mkCust = (id: string, name: string, over: Partial<Customer> = {}): Customer => ({
  id,
  name,
  phone: '',
  createdAt: '2026-01-01',
  ...over,
});

const mkExisting = (id: string, name: string, over: Partial<ExistingCustomer> = {}): ExistingCustomer => ({
  id,
  name,
  phone: '',
  totalBills: 0,
  totalBilled: 0,
  totalPaid: 0,
  balanceDue: 0,
  advance: 0,
  lastBillDate: '',
  lastPaymentDate: '',
  ...over,
});

const mkBill = (id: number, retailer: string, total: number, over: Partial<Bill> = {}): Bill => ({
  id,
  date: '2026-11-10',
  retailer,
  status: 'pending',
  items: [],
  subtotal: total,
  cgst: 0,
  sgst: 0,
  total,
  amountPaid: 0,
  ...over,
});

const mkPay = (id: string, billId: number | undefined, customerName: string, amount: number, over: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id,
  billId,
  customerName,
  amount,
  paymentDate: '2026-11-12',
  mode: 'cash',
  createdAt: '2026-11-12T10:00:00.000Z',
  ...over,
});

test('beat summary: all beat customers appear in customerRows even with zero sales/due in the period', () => {
  const customers: Customer[] = [
    mkCust('c1', 'Active Due Shop', { beatId: 'b1', route: 'Kuchinda Town', phone: '9876543210' }),
    mkCust('c2', 'Settled No Sale Shop', { beatId: 'b1', route: 'Kuchinda Town', phone: '9876543211' }),
    mkCust('c3', 'Other Period Shop', { beatId: 'b1', route: 'Kuchinda Town', phone: '9876543212' }),
  ];
  const existingCustomers: ExistingCustomer[] = [
    mkExisting('c1', 'Active Due Shop', { phone: '9876543210', balanceDue: 500, totalBills: 1, totalBilled: 500 }),
    mkExisting('c2', 'Settled No Sale Shop', { phone: '9876543211', balanceDue: 0 }),
    mkExisting('c3', 'Other Period Shop', { phone: '9876543212', balanceDue: 0, totalBills: 1, totalBilled: 400, totalPaid: 400 }),
  ];
  const bills: Bill[] = [
    mkBill(1, 'Active Due Shop', 500, { date: '2026-11-10', customerId: 'c1', phone: '9876543210' }),
    mkBill(2, 'Other Period Shop', 400, { date: '2026-10-05', status: 'paid', amountPaid: 400, customerId: 'c3', phone: '9876543212' }),
  ];

  const sum = buildBeatSummary({
    bills,
    payments: [],
    customers,
    existingCustomers,
    beats,
    inPeriod: (d) => d.startsWith('2026-11'),
    today: '2026-11-20',
  });

  const town = sum.rows.find((r) => r.beatId === 'b1')!;
  assert.equal(town.customers, 3);
  assert.equal(town.customerRows.length, 3);
  assert.deepEqual(
    town.customerRows.map((c) => c.name),
    ['Active Due Shop', 'Other Period Shop', 'Settled No Sale Shop'],
  );
  assert.equal(town.sales, 500);
  assert.equal(town.due, 500);
});

test('stale p.customerName on linked bill receipt resolves to canonical bill customer without spawning phantom rows', () => {
  const customers: Customer[] = [
    mkCust('c1', 'Sukanta Dehuri, Tileimal', { beatId: 'b2', route: 'Kusumi' }),
    mkCust('c2', 'Srikant Store , Purunapani', { beatId: 'b2', route: 'Kusumi' }),
  ];
  const existingCustomers: ExistingCustomer[] = [
    mkExisting('c1', 'Sukanta Dehuri, Tileimal', { balanceDue: 20, totalBills: 1, totalBilled: 500, totalPaid: 480 }),
    mkExisting('c2', 'Srikant Store , Purunapani', { balanceDue: 0, totalBills: 1, totalBilled: 480, totalPaid: 480 }),
  ];
  const bills: Bill[] = [
    mkBill(250, 'Sukanta Dehuri, Tileimal', 500, { customerId: 'cust_bill_292', amountPaid: 480 }),
    mkBill(180, 'Srikant Store , Purunapani', 480, { customerId: 'cust_bill_534', status: 'paid', amountPaid: 480 }),
  ];
  const payments: PaymentRecord[] = [
    mkPay('p1', 250, 'Sukanta Dehury , Tileimal', 480, { paymentDate: '2026-11-14', customerId: 'cust_bill_292' }),
    mkPay('p2', 180, 'Srikanta Purnapani', 480, { paymentDate: '2026-11-15', customerId: 'cust_bill_534' }),
  ];

  const sum = buildBeatSummary({
    bills,
    payments,
    customers,
    existingCustomers,
    beats,
    inPeriod: () => true,
    today: '2026-11-20',
  });

  const kusumi = sum.rows.find((r) => r.beatId === 'b2')!;
  assert.equal(kusumi.customers, 2);
  assert.equal(kusumi.customerRows.length, 2);
  assert.equal(kusumi.received, 960);
  assert.deepEqual(
    kusumi.customerRows.map((c) => [c.name, c.received]),
    [
      ['Sukanta Dehuri, Tileimal', 480],
      ['Srikant Store , Purunapani', 480],
    ],
  );

  const reg = buildReceiptRegister({
    bills,
    payments,
    customers,
    existingCustomers,
    beats,
    inPeriod: () => true,
  });
  assert.equal(reg.customers.length, 2);
  assert.equal(reg.dueRemaining, 20);

  const overall = buildCustomerOverall({ bills, payments, customers, existingCustomers, beats });
  assert.equal(overall.rows.find((r) => r.name === 'Sukanta Dehuri, Tileimal')?.lastReceiptDate, '2026-11-14');
  assert.equal(overall.rows.find((r) => r.name === 'Srikant Store , Purunapani')?.lastReceiptDate, '2026-11-15');
});

test('aliases and duplicate cust_bill_* copies merge cleanly into their canonical master customer', () => {
  const customers: Customer[] = [
    mkCust('c_master', 'Panda Store , Kudapara', { beatId: 'b1', route: 'Kuchinda Town', aliases: ['Rajesh Pandi, Kudapara'], phone: '9988776655' }),
    mkCust('cust_bill_999', 'Panda Store , Kudapara', { phone: '' }),
  ];
  const existingCustomers: ExistingCustomer[] = [
    mkExisting('c_master', 'Panda Store , Kudapara', { phone: '9988776655', balanceDue: 300, totalBills: 2, totalBilled: 800, totalPaid: 500 }),
  ];
  const bills: Bill[] = [
    mkBill(10, 'Rajesh Pandi, Kudapara', 800, { amountPaid: 500, customerId: 'cust_bill_999' }),
  ];
  const payments: PaymentRecord[] = [
    mkPay('pay_10', 10, 'Rajesh Pandi, Kudapara', 500, { paymentDate: '2026-11-18' }),
  ];

  const resolver = makeBeatResolver(customers, beats);
  assert.equal(resolver.customerFor('Panda Store , Kudapara')?.id, 'c_master');
  assert.equal(resolver.beatIdFor('Panda Store , Kudapara', '', 'cust_bill_999'), 'b1');

  const events = collectReceipts({ bills, payments, resolver });
  assert.equal(events.length, 1);
  assert.equal(events[0].customerName, 'Panda Store , Kudapara');
  assert.equal(events[0].beatId, 'b1');

  const sum = buildBeatSummary({
    bills,
    payments,
    customers,
    existingCustomers,
    beats,
    inPeriod: () => true,
    today: '2026-11-20',
  });
  const town = sum.rows.find((r) => r.beatId === 'b1')!;
  assert.equal(town.customers, 1);
  assert.equal(town.customerRows.length, 1);
  assert.equal(town.customerRows[0].name, 'Panda Store , Kudapara');
  assert.equal(town.customerRows[0].sales, 800);
  assert.equal(town.customerRows[0].received, 500);
  assert.equal(town.customerRows[0].due, 300);

  const reg = buildReceiptRegister({ bills, payments, customers, existingCustomers, beats, inPeriod: () => true });
  assert.equal(reg.customers.length, 1);
  assert.equal(reg.customers[0].name, 'Panda Store , Kudapara');
  assert.equal(reg.customers[0].due, 300);
});

test('two distinct shops sharing a normalized name with different real phones stay separate in their own beats', () => {
  const customers: Customer[] = [
    mkCust('shop_a', 'Maa Tarini Store', { beatId: 'b1', route: 'Kuchinda Town', phone: '9000000001' }),
    mkCust('shop_b', 'Maa Tarini Store', { beatId: 'b2', route: 'Kusumi', phone: '9000000002' }),
  ];
  const existingCustomers: ExistingCustomer[] = [
    mkExisting('shop_a', 'Maa Tarini Store', { phone: '9000000001', balanceDue: 250 }),
    mkExisting('shop_b', 'Maa Tarini Store', { phone: '9000000002', balanceDue: 600 }),
  ];
  const bills: Bill[] = [
    mkBill(1, 'Maa Tarini Store', 250, { phone: '9000000001', customerId: 'shop_a' }),
    mkBill(2, 'Maa Tarini Store', 600, { phone: '9000000002', customerId: 'shop_b' }),
  ];

  const sum = buildBeatSummary({
    bills,
    payments: [],
    customers,
    existingCustomers,
    beats,
    inPeriod: () => true,
    today: '2026-11-20',
  });

  const town = sum.rows.find((r) => r.beatId === 'b1')!;
  const kusumi = sum.rows.find((r) => r.beatId === 'b2')!;
  assert.equal(town.customers, 1);
  assert.equal(town.sales, 250);
  assert.equal(town.due, 250);
  assert.equal(kusumi.customers, 1);
  assert.equal(kusumi.sales, 600);
  assert.equal(kusumi.due, 600);

  // Even when a 2nd same-name distinct-phone shop is omitted from existingCustomers, beat summary still lists it in its beat.
  const partialSum = buildBeatSummary({
    bills,
    payments: [],
    customers,
    existingCustomers: [existingCustomers[0]],
    beats,
    inPeriod: () => true,
    today: '2026-11-20',
  });
  assert.equal(partialSum.rows.find((r) => r.beatId === 'b2')?.customers, 1);
  assert.equal(partialSum.rows.find((r) => r.beatId === NO_BEAT), undefined);
});
