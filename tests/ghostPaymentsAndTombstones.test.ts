import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCancelledRestores,
  mergeBillLists,
} from "../src/utils/billMerge";
import {
  findGhostPayments,
  findPaymentsForDeletedCustomer,
  isPaymentFromDeletedCustomerId,
  looksLikeDuplicateOrMistakeReason,
} from "../src/utils/ghostPayments";
import type { Bill, Customer, PaymentRecord } from "../src/types";

const makeBill = (id: number, overrides: Partial<Bill> = {}): Bill => ({
  id,
  invNo: `INV-${id}`,
  date: "2026-11-18",
  retailer: "Ramesh Traders",
  phone: "9876543210",
  items: [],
  total: 1000,
  gstMode: "gst",
  paymentMode: "cash",
  amountPaid: 500,
  ...overrides,
});

const makeCustomer = (id: string, overrides: Partial<Customer> = {}): Customer => ({
  id,
  name: "Ramesh Traders",
  phone: "9876543210",
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makePayment = (id: string, overrides: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id,
  customerName: "Ramesh Traders",
  customerPhone: "9876543210",
  amount: 500,
  mode: "cash",
  createdAt: "2026-11-18T10:00:00Z",
  ...overrides,
});

test("billMerge: deleted active duplicate bills never resurrect via PUT sync", () => {
  const deletedIds = new Set<number>([101, 102]);
  const staleIncoming = [
    makeBill(101), // active deleted duplicate from stale tab/outbox
    makeBill(102, { status: "cancelled", cancelled: true, cancellation: { reason: "GST cancel", by: "Admin", at: "2026-11-18T11:00:00Z" } }),
    makeBill(103), // genuinely new bill
  ];

  const restored = collectCancelledRestores(staleIncoming, deletedIds);
  assert.deepEqual(restored, [102]);
  assert.equal(deletedIds.has(101), true, "active deleted bill 101 must remain tombstoned");
  assert.equal(deletedIds.has(102), false, "explicitly cancelled bill 102 is kept for GST series");

  const stored = [makeBill(100), makeBill(101)]; // even if 101 lingered in stored cache
  const merged = mergeBillLists(stored, staleIncoming, deletedIds);
  const mergedIds = merged.map((b) => b.id);
  assert.equal(mergedIds.includes(101), false, "tombstoned active bill 101 must stay excluded");
  assert.equal(mergedIds.includes(102), true, "cancelled bill 102 stays for GST series");
  assert.equal(mergedIds.includes(103), true, "active bill 103 is kept");
  assert.equal(mergedIds.includes(100), true, "active bill 100 is kept");
});

test("looksLikeDuplicateOrMistakeReason identifies duplicate/mistake comments", () => {
  assert.equal(looksLikeDuplicateOrMistakeReason("duplicate bill"), true);
  assert.equal(looksLikeDuplicateOrMistakeReason("Dup entry"), true);
  assert.equal(looksLikeDuplicateOrMistakeReason("entered by mistake"), true);
  assert.equal(looksLikeDuplicateOrMistakeReason("wrong customer double billing"), true);
  assert.equal(looksLikeDuplicateOrMistakeReason("test bill"), true);
  assert.equal(looksLikeDuplicateOrMistakeReason("Customer rescheduled delivery"), false);
});

test("findGhostPayments detects deleted-bill advances, deleted-bill links, synthetic dupes, and deleted customer payments", () => {
  const bills: Bill[] = [
    makeBill(10, { amountPaid: 500 }),
    makeBill(11, { status: "cancelled", cancelled: true }),
  ];
  const customers: Customer[] = [makeCustomer("cust-active")];
  const payments: PaymentRecord[] = [
    // Real payment covering bill 10
    makePayment("pay_real_10", { billId: 10, customerId: "cust-active", amount: 500 }),
    // Stale synthetic pay_bill_10 already covered by real payment
    makePayment("pay_bill_10", { billId: 10, customerId: "cust-active", amount: 500 }),
    // Orphaned advance from deleted invoice #99
    makePayment("pay_adv_99", {
      customerId: "cust-active",
      amount: 300,
      referenceNote: "Advance / on account (from deleted invoice #99)",
    }),
    // Payment linked to cancelled bill #11
    makePayment("pay_link_11", { billId: 11, customerId: "cust-active", amount: 250 }),
    // Payment tagged with a deleted duplicate customer's ID
    makePayment("pay_del_cust", {
      customerId: "cust-deleted-dup",
      customerName: "Ramesh Traders",
      amount: 700,
    }),
    // Legitimate customer advance unrelated to any deleted invoice
    makePayment("pay_legit_adv", {
      customerId: "cust-active",
      amount: 400,
      referenceNote: "Cash advance for next week",
    }),
  ];

  const ghosts = findGhostPayments({
    payments,
    bills,
    customers,
    deletedBillIds: new Set([99]),
    deletedCustomerIds: new Set(["cust-deleted-dup"]),
    hiddenCustomerNames: new Set(),
  });

  const byId = new Map(ghosts.map((g) => [g.payment.id, g]));
  assert.equal(byId.get("pay_bill_10")?.category, "duplicate_synthetic");
  assert.equal(byId.get("pay_adv_99")?.category, "deleted_bill_advance");
  assert.equal(byId.get("pay_link_11")?.category, "deleted_bill_link");
  assert.equal(byId.get("pay_del_cust")?.category, "deleted_customer");
  assert.equal(byId.has("pay_real_10"), false);
  assert.equal(byId.has("pay_legit_adv"), false);
});

test("isPaymentFromDeletedCustomerId blocks bleed-over onto surviving duplicate customer", () => {
  const deletedIds = new Set(["cust-dup-1"]);
  const activeIds = new Set(["cust-surviving"]);
  const liveBillIds = new Set([10]);

  assert.equal(
    isPaymentFromDeletedCustomerId(
      { customerId: "cust-dup-1", billId: undefined },
      deletedIds,
      activeIds,
      liveBillIds,
    ),
    true,
  );
  assert.equal(
    isPaymentFromDeletedCustomerId(
      { customerId: "cust-dup-1", billId: 10 },
      deletedIds,
      activeIds,
      liveBillIds,
    ),
    false,
    "payment attached to a live bill remains accounted for on that bill",
  );
  assert.equal(
    isPaymentFromDeletedCustomerId(
      { customerId: "cust-surviving", billId: undefined },
      deletedIds,
      activeIds,
      liveBillIds,
    ),
    false,
  );
});

test("findPaymentsForDeletedCustomer never deletes surviving duplicate customer's untagged payments", () => {
  const dup = makeCustomer("cust-dup", { name: "Sita Stores", phone: "9998887776" });
  const survivor = makeCustomer("cust-keep", { name: "Sita Stores", phone: "9998887776" });

  const payments: PaymentRecord[] = [
    makePayment("p1", { customerId: "cust-dup", customerName: "Sita Stores", customerPhone: "9998887776", amount: 200 }),
    makePayment("p2", { customerId: "cust-keep", customerName: "Sita Stores", customerPhone: "9998887776", amount: 500 }),
    makePayment("p3", { customerName: "Sita Stores", customerPhone: "9998887776", amount: 300 }), // untagged, same phone
    makePayment("p4", { customerName: "Sita Stores", customerPhone: "9876543210", amount: 150 }), // untagged, different phone
  ];

  // With surviving duplicate sharing name/phone: only p1 (strictly tagged to cust-dup) is removed
  const withDupMatches = findPaymentsForDeletedCustomer({
    customer: dup,
    allCustomers: [dup, survivor],
    payments,
  });
  assert.deepEqual(withDupMatches.map((p) => p.id), ["p1"]);

  // Without any surviving duplicate sharing name/phone: claims tagged (p1) + untagged matching phone (p3), not different phone (p4)
  const soloMatches = findPaymentsForDeletedCustomer({
    customer: dup,
    allCustomers: [dup],
    payments: [payments[0], payments[2], payments[3]],
  });
  assert.deepEqual(soloMatches.map((p) => p.id), ["p1", "p3"]);
});
