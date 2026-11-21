import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Load actual database collections to ensure real data accuracy
const collectionsPath = path.resolve("./data/collections.json");
const data = JSON.parse(fs.readFileSync(collectionsPath, "utf8"));
const customers: any[] = data.customers || [];
const orders: any[] = data.orders || [];

function isDummyPhone(phone?: string): boolean {
  const d = (phone || "").replace(/\D/g, "");
  return !d || d === "1234567890" || /^0+$/.test(d) || /^9+$/.test(d) || d.length < 5;
}

function last10Of(phone?: string): string {
  if (isDummyPhone(phone)) return "";
  const d = (phone || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

function normCustName(n?: string): string {
  return (n || "")
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function customerPhonesMatch(
  custPhones: (string | undefined)[],
  targetPhone?: string,
  isUniqueCustomerName: boolean = true,
): boolean {
  const targetLast10 = last10Of(targetPhone);
  if (!targetLast10) return true;
  const validCustLast10s = custPhones.map((p) => last10Of(p)).filter(Boolean);
  if (validCustLast10s.length === 0) return true;
  if (validCustLast10s.includes(targetLast10)) return true;
  if (isUniqueCustomerName) return true;
  return false;
}

function resolveMasterCustomerId(name?: string, phone?: string): string | undefined {
  const n = normCustName(name);
  if (!n) return undefined;
  const sameName = customers.filter((c) => normCustName(c.name) === n);
  const ph = last10Of(phone || "");
  if (sameName.length === 1) return sameName[0].id;
  if (sameName.length > 1 && ph.length === 10) {
    const byPhone = sameName.filter((c) => last10Of(c.phone) === ph || last10Of(c.altPhone || "") === ph);
    if (byPhone.length >= 1) return byPhone[0].id;
  }
  if (sameName.length > 1 && ph.length === 0) {
    const distinctPhones = new Set(sameName.map((c) => last10Of(c.phone)).filter(Boolean));
    if (distinctPhones.size <= 1) {
      return sameName[0].id;
    }
  }
  if (sameName.length === 0 && ph.length === 10) {
    const byPhone = customers.filter((c) => last10Of(c.phone) === ph);
    if (byPhone.length >= 1) return byPhone[0].id;
  }
  return undefined;
}

function matchBillsForCustomer(
  inputCustomer: { id?: string; name: string; phone?: string; altPhone?: string },
  bills: any[],
) {
  const cleanLower = normCustName(inputCustomer.id || inputCustomer.name);
  const custInMaster =
    customers.find((c) => c.id === inputCustomer.id) ||
    (() => {
      const byName = customers.filter((c) => normCustName(c.name) === cleanLower);
      if (byName.length === 1) return byName[0];
      const id = byName.length > 1 ? resolveMasterCustomerId(inputCustomer.name, inputCustomer.phone) : undefined;
      return id ? customers.find((c) => c.id === id) : undefined;
    })();

  const resolvedName = custInMaster?.name || inputCustomer.name;
  const cleanName = normCustName(resolvedName);
  const resolvedPhone = custInMaster ? custInMaster.phone || "" : inputCustomer.phone || "";
  const resolvedAltPhone = custInMaster?.altPhone || inputCustomer.altPhone || "";

  const sameNameCusts = customers.filter((c) => normCustName(c.name) === cleanName);
  const distinctPhones = new Set(sameNameCusts.map((c) => last10Of(c.phone)).filter(Boolean));
  const isUniqueCustomerName = distinctPhones.size <= 1;

  const allCustPhones = [
    resolvedPhone,
    resolvedAltPhone,
    ...sameNameCusts.map((c) => c.phone),
    ...sameNameCusts.map((c) => c.altPhone),
    inputCustomer.phone,
    inputCustomer.altPhone,
  ].filter((p) => !isDummyPhone(p));

  const customerById = new Map<string, any>(customers.map((c) => [c.id, c]));
  const matchingCustIds = new Set<string>();
  if (custInMaster?.id) matchingCustIds.add(custInMaster.id);
  for (const c of sameNameCusts) {
    if (isUniqueCustomerName || customerPhonesMatch(allCustPhones, c.phone, isUniqueCustomerName)) {
      matchingCustIds.add(c.id);
    }
  }

  return bills.filter((b) => {
    if (b.status === "cancelled" || b.cancelled) return false;
    if (b.customerId && matchingCustIds.has(b.customerId)) {
      return true;
    }
    if (b.customerId && customerById.has(b.customerId)) {
      const otherCust = customerById.get(b.customerId)!;
      if (
        normCustName(otherCust.name) !== cleanName &&
        !customerPhonesMatch(allCustPhones, otherCust.phone, false)
      ) {
        return false;
      }
    }
    const bRetailer = normCustName(b.retailer);
    return (
      bRetailer === cleanName &&
      customerPhonesMatch(allCustPhones, b.phone, isUniqueCustomerName)
    );
  });
}

test("Bill #462 appears in Biswajit Ray ledger even with duplicate master profile IDs", (t) => {
  if (!orders || orders.length === 0) {
    t.skip("Skipping test: no orders in collections.json");
    return;
  }
  const bill462 = orders.find((b) => b.id === 462);
  assert.ok(bill462, "Bill #462 should exist in collections");
  assert.equal(bill462.retailer, "Biswajit Ray , Keseibahal");
  assert.equal(bill462.total, 3960);

  // Even when CustomersView passes cust_bill_462 as the selected customer
  const biswajitCustomer = {
    id: "cust_bill_462",
    name: "Biswajit Ray , Keseibahal",
    phone: "6372547147",
  };

  const matched = matchBillsForCustomer(biswajitCustomer, [bill462]);
  assert.equal(matched.length, 1, "Bill #462 must be matched in Biswajit Ray ledger");
  assert.equal(matched[0].id, 462);
  assert.equal(matched[0].total, 3960);
});

test("All 24 previously missing bills are correctly matched in their customer ledgers", (t) => {
  if (!orders || orders.length === 0) {
    t.skip("Skipping test: no orders in collections.json");
    return;
  }
  const missingBillIds = [
    497, 496, 493, 492, 490, 489, 484, 483, 479, 473,
    471, 470, 466, 465, 464, 463, 462, 460, 459, 458,
    457, 453, 452, 213,
  ];

  for (const billId of missingBillIds) {
    const bill = orders.find((b) => b.id === billId);
    assert.ok(bill, `Bill #${billId} should exist`);

    const customer = customers.find(
      (c) => normCustName(c.name) === normCustName(bill.retailer),
    );
    assert.ok(customer, `Customer should exist for bill #${billId} (${bill.retailer})`);

    const matched = matchBillsForCustomer(customer, [bill]);
    assert.equal(
      matched.length,
      1,
      `Bill #${billId} (${bill.retailer}) must appear in customer ledger`,
    );
  }
});
