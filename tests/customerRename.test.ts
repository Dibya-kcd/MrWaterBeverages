import test from "node:test";
import assert from "node:assert/strict";
import { planCustomerUpdate } from "../src/context/ledgerHelpers";
import type { Bill, Customer, PaymentRecord } from "../src/types";

const makeCust = (id: string, name: string, phone = "", extra: Partial<Customer> = {}): Customer => ({
  id,
  name,
  phone,
  createdAt: "2026-09-14T00:00:00.000Z",
  ...extra,
});

const makeBill = (
  id: number,
  retailer: string,
  phone = "",
  extra: Partial<Bill> = {},
): Bill => ({
  id,
  retailer,
  phone,
  date: "2026-10-16",
  items: [],
  subtotal: 400,
  cgst: 40,
  sgst: 40,
  total: 480,
  discount: 0,
  amountPaid: 0,
  ...extra,
});

const makePay = (
  id: string,
  customerName: string,
  amount: number,
  extra: Partial<PaymentRecord> = {},
): PaymentRecord => ({
  id,
  customerName,
  amount,
  paymentDate: "2026-10-16",
  mode: "cash",
  createdAt: "2026-10-16T00:00:00.000Z",
  ...extra,
});

test("renames master customer in-place and updates bills, payments, and custom prices without creating a duplicate", () => {
  const cust = makeCust("cust_bill_121", "Manas Kuchinda", "");
  const other = makeCust("cust_other", "Ayush Store, Saida", "7978275465");
  const bills = [
    makeBill(121, "Manas Kuchinda", "", { customerId: "cust_bill_121", amountPaid: 480 }),
    makeBill(371, "Manas Kuchinda", "", { total: 720, amountPaid: 500 }),
    makeBill(562, "Ayush Store, Saida", "7978275465", { customerId: "cust_other" }),
  ];
  const payments = [
    makePay("pay_bill_121", "Manas Kuchinda", 480, { billId: 121 }),
    makePay("pay_371", "Manas Kuchinda", 500, { billId: 371, customerId: "cust_bill_121" }),
    makePay("pay_other", "Ayush Store, Saida", 620, { billId: 562, customerId: "cust_other" }),
  ];
  const prices = {
    "manas kuchinda_6": 240,
    "ayush store, saida_6": 235,
  };

  const plan = planCustomerUpdate({
    customers: [cust, other],
    bills,
    payments,
    customerProductPrices: prices,
    updated: { ...cust, name: "Muna Kirana , Kundeswar, Kuchinda", phone: "9876543210" },
    now: "2026-11-12T10:00:00.000Z",
  });

  assert.equal(plan.customers.length, 2);
  assert.equal(plan.customers.filter((c) => c.name === "Manas Kuchinda").length, 0);
  assert.equal(plan.savedCustomer.id, "cust_bill_121");
  assert.equal(plan.savedCustomer.name, "Muna Kirana , Kundeswar, Kuchinda");
  assert.equal(plan.retiredDuplicateIds.length, 0);

  assert.equal(plan.bills[0].retailer, "Muna Kirana , Kundeswar, Kuchinda");
  assert.equal(plan.bills[0].customerId, "cust_bill_121");
  assert.equal(plan.bills[0].phone, "9876543210");
  assert.equal(plan.bills[1].retailer, "Muna Kirana , Kundeswar, Kuchinda");
  assert.equal(plan.bills[1].customerId, "cust_bill_121");
  assert.equal(plan.bills[2].retailer, "Ayush Store, Saida");
  assert.equal(plan.changedBills.length, 2);

  assert.equal(plan.payments[0].customerName, "Muna Kirana , Kundeswar, Kuchinda");
  assert.equal(plan.payments[0].customerId, "cust_bill_121");
  assert.equal(plan.payments[1].customerName, "Muna Kirana , Kundeswar, Kuchinda");
  assert.equal(plan.payments[2].customerName, "Ayush Store, Saida");
  assert.equal(plan.paymentsChanged, true);

  assert.equal(plan.customerProductPrices?.["manas kuchinda_6"], undefined);
  assert.equal(plan.customerProductPrices?.["muna kirana , kundeswar, kuchinda_6"], 240);
  assert.equal(plan.customerProductPrices?.["ayush store, saida_6"], 235);
});

test("retires redundant same-shop duplicate master records on rename so old name does not remain as a second customer", () => {
  const c1 = makeCust("cust_bill_121", "Manas Kuchinda", "");
  const c2 = makeCust("cust_bill_371", "Manas Kuchinda", "");
  const bills = [
    makeBill(121, "Manas Kuchinda", ""),
    makeBill(371, "Manas Kuchinda", "", { customerId: "cust_bill_121" }),
  ];
  const payments = [
    makePay("pay_1", "Manas Kuchinda", 480, { billId: 121 }),
    makePay("pay_2", "Manas Kuchinda", 500, { billId: 371, customerId: "cust_bill_121" }),
  ];

  const plan = planCustomerUpdate({
    customers: [c1, c2],
    bills,
    payments,
    updated: { ...c2, name: "Muna Kirana , Kundeswar, Kuchinda" },
    now: "2026-11-12T10:00:00.000Z",
  });

  assert.equal(plan.customers.length, 1);
  assert.equal(plan.customers[0].id, "cust_bill_371");
  assert.equal(plan.customers[0].name, "Muna Kirana , Kundeswar, Kuchinda");
  assert.deepEqual(plan.retiredDuplicateIds, ["cust_bill_121"]);
  assert.ok(plan.bills.every((b) => b.retailer === "Muna Kirana , Kundeswar, Kuchinda" && b.customerId === "cust_bill_371"));
  assert.ok(plan.payments.every((p) => p.customerName === "Muna Kirana , Kundeswar, Kuchinda" && p.customerId === "cust_bill_371"));
});

test("promotes and renames a bill-only derived customer with no master record yet", () => {
  const bills = [
    makeBill(371, "Manas Kuchinda", ""),
    makeBill(121, "Manas Kuchinda", ""),
  ];
  const payments = [
    makePay("pay_371", "Manas Kuchinda", 500, { billId: 371 }),
  ];

  const plan = planCustomerUpdate({
    customers: [],
    bills,
    payments,
    updated: makeCust("cust_new_promoted", "Muna Kirana , Kundeswar, Kuchinda", "9000011111"),
    previousIdentity: { name: "Manas Kuchinda", phone: "" },
    now: "2026-11-12T10:00:00.000Z",
  });

  assert.equal(plan.customers.length, 1);
  assert.equal(plan.customers[0].id, "cust_new_promoted");
  assert.equal(plan.customers[0].name, "Muna Kirana , Kundeswar, Kuchinda");
  assert.ok(plan.bills.every((b) => b.retailer === "Muna Kirana , Kundeswar, Kuchinda" && b.customerId === "cust_new_promoted"));
  assert.ok(plan.payments.every((p) => p.customerName === "Muna Kirana , Kundeswar, Kuchinda" && p.customerId === "cust_new_promoted"));
});

test("keeps distinct shops with the same name and different phone numbers strictly separate on rename", () => {
  const shopA = makeCust("cA", "Sharma Store", "9876543210");
  const shopB = makeCust("cB", "Sharma Store", "9123456780");
  const bills = [
    makeBill(10, "Sharma Store", "9876543210", { customerId: "cA" }),
    makeBill(11, "Sharma Store", "9876543210"),
    makeBill(12, "Sharma Store", "9123456780", { customerId: "cB" }),
    makeBill(13, "Sharma Store", "9123456780"),
  ];
  const payments = [
    makePay("pA", "Sharma Store", 100, { customerId: "cA", customerPhone: "9876543210" }),
    makePay("pB", "Sharma Store", 200, { customerId: "cB", customerPhone: "9123456780" }),
  ];

  const plan = planCustomerUpdate({
    customers: [shopA, shopB],
    bills,
    payments,
    updated: { ...shopA, name: "Sharma Kirana, Main Road" },
    now: "2026-11-12T10:00:00.000Z",
  });

  assert.equal(plan.customers.length, 2);
  assert.equal(plan.retiredDuplicateIds.length, 0);
  assert.equal(plan.customers.find((c) => c.id === "cB")?.name, "Sharma Store");
  assert.equal(plan.bills.find((b) => b.id === 10)?.retailer, "Sharma Kirana, Main Road");
  assert.equal(plan.bills.find((b) => b.id === 11)?.retailer, "Sharma Kirana, Main Road");
  assert.equal(plan.bills.find((b) => b.id === 12)?.retailer, "Sharma Store");
  assert.equal(plan.bills.find((b) => b.id === 13)?.retailer, "Sharma Store");
  assert.equal(plan.payments.find((p) => p.id === "pA")?.customerName, "Sharma Kirana, Main Road");
  assert.equal(plan.payments.find((p) => p.id === "pB")?.customerName, "Sharma Store");
});

test("re-links bills with an orphaned customerId that still carry the old name", () => {
  const cust = makeCust("cust_live", "Manas Kuchinda", "");
  const bills = [
    makeBill(400, "Manas Kuchinda", "", { customerId: "cust_deleted_ghost" }),
  ];

  const plan = planCustomerUpdate({
    customers: [cust],
    bills,
    payments: [],
    updated: { ...cust, name: "Muna Kirana , Kundeswar, Kuchinda" },
    now: "2026-11-12T10:00:00.000Z",
  });

  assert.equal(plan.bills[0].customerId, "cust_live");
  assert.equal(plan.bills[0].retailer, "Muna Kirana , Kundeswar, Kuchinda");
});
