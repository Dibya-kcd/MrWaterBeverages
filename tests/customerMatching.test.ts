import test from "node:test";
import assert from "node:assert/strict";
import {
  normCustName,
  findDuplicateCustomer,
  splitSameNameShops,
  mergeCustomersNewestWins,
} from "../src/context/ledgerHelpers";
import { dedupeSameShopCustomers, findCustomerNameClash } from "../src/utils/customerDedupe";
import { makeBeatResolver, NO_BEAT } from "../src/utils/beatReports";

const cust = (id: string, name: string, phone = "", extra: any = {}): any => ({
  id,
  name,
  phone,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

test("normCustName ignores case, spacing and punctuation for English names", () => {
  assert.equal(normCustName("  SHARMA   store "), "sharma store");
  assert.equal(normCustName("Sharma-Store."), "sharma store");
});

test("normCustName keeps Odia / Hindi names apart (they used to collapse to a blank)", () => {
  const a = normCustName("ମା ତାରିଣୀ ଷ୍ଟୋର");
  const b = normCustName("श्री गणेश स्टोर");
  assert.notEqual(a.trim(), "");
  assert.notEqual(b.trim(), "");
  assert.notEqual(a, b);
});

test("same name + same phone is the same shop", () => {
  const list = [cust("c1", "Sharma Store", "98765 43210")];
  assert.equal(findDuplicateCustomer(list, "sharma  STORE", "9876543210").sameShop?.id, "c1");
});

test("same name, existing has no phone -> same shop (no look-alike record)", () => {
  const list = [cust("c1", "Sharma Store", "")];
  assert.equal(findDuplicateCustomer(list, "Sharma Store", "9876543210").sameShop?.id, "c1");
});

test("same name but a different phone is a different shop", () => {
  const list = [cust("c1", "Sharma Store", "9876543210")];
  const r = findDuplicateCustomer(list, "Sharma Store", "9123456780");
  assert.equal(r.sameShop, undefined);
  assert.equal(r.samePhone, undefined);
});

test("same phone under a different name is reported so the user can confirm", () => {
  const list = [cust("c1", "Ravi Store", "9876543210")];
  const r = findDuplicateCustomer(list, "Ravi Stores", "+91 98765 43210");
  assert.equal(r.sameShop, undefined);
  assert.equal(r.samePhone?.id, "c1");
});

test("matches on the alternate phone too", () => {
  const list = [cust("c1", "Ravi Store", "9876543210", { altPhone: "9000011111" })];
  assert.equal(findDuplicateCustomer(list, "Ravi Store", "9000011111").sameShop?.id, "c1");
});

test("two different Odia shops are not treated as one", () => {
  const list = [cust("c1", "ମା ତାରିଣୀ ଷ୍ଟୋର", "9876543210")];
  assert.equal(findDuplicateCustomer(list, "श्री गणेश स्टोर", "").sameShop, undefined);
});

test("placeholder phones never match", () => {
  const list = [cust("c1", "Ravi Store", "1234567890")];
  assert.equal(findDuplicateCustomer(list, "Other Shop", "1234567890").samePhone, undefined);
});

test("splitSameNameShops lists same-name shops with different phones separately", () => {
  const masters = [cust("a", "Sharma Store", "9876543210"), cust("b", "Sharma Store", "9123456780"), cust("z", "Other", "9000000001")];
  const existing: any[] = [
    { id: "a", name: "Sharma Store", phone: "9876543210", totalBills: 5, totalBilled: 100, totalPaid: 0, balanceDue: 100, lastBillDate: "" },
    { id: "z", name: "Other", phone: "9000000001", totalBills: 1, totalBilled: 10, totalPaid: 10, balanceDue: 0, lastBillDate: "" },
  ];
  const out = splitSameNameShops(existing, masters);
  assert.deepEqual(out.map((e) => e.id).sort(), ["a", "b", "z"]);
  assert.equal(out.find((e) => e.id === "z")!.balanceDue, 0);
});

test("splitSameNameShops leaves the list alone when no names clash", () => {
  const masters = [cust("a", "Sharma Store", "9876543210")];
  const existing: any[] = [{ id: "a", name: "Sharma Store", phone: "9876543210", totalBills: 1, totalBilled: 1, totalPaid: 0, balanceDue: 1, lastBillDate: "" }];
  assert.strictEqual(splitSameNameShops(existing, masters), existing);
});

test("sync merge still merges by id and keeps the newest copy", () => {
  const local = [cust("a", "Old", "", { updatedAt: "2026-01-01T00:00:00Z" })];
  const remote = [cust("a", "New", "", { updatedAt: "2026-02-01T00:00:00Z" })];
  assert.equal(mergeCustomersNewestWins(local, remote)[0].name, "New");
});

test("dedupeSameShopCustomers collapses ghost cust_bill_* duplicates while preserving beat and real phone", () => {
  // Real-world cases: Ganesh Pan Dukan, Hello in (Santosh), Khuntia Bettle Shop, Mahakul Store Kalehipali
  const input = [
    cust("cust_bill_230", "Ganesh Pan Dukan", "", { updatedAt: "2026-11-06T18:06:49Z" }),
    cust("cust_bill_506", "Ganesh Pan Dukan", "", { beatId: "beat_kch", route: "Kuchinda Town", updatedAt: "2026-11-06T18:06:49Z" }),
    cust("cust_bill_143", "Ganesh Pan Dukan", "", { beatId: "beat_kch", route: "Kuchinda Town", updatedAt: "2026-11-08T08:02:44Z" }),
    cust("cust_bill_491", "Hello in (Santosh), Kuchinda", "+919777124161", { updatedAt: "2026-11-06T18:06:49Z" }),
    cust("cust_bill_155", "Hello in (Santosh), Kuchinda", "1234567890", { beatId: "beat_kch", route: "Kuchinda Town", updatedAt: "2026-11-10T03:02:37Z" }),
    cust("cust_bill_402", "Hello in (Santosh), Kuchinda", "1234567890", { updatedAt: "2026-11-06T18:06:49Z" }),
    cust("cust_1794417600857_d22t", "Mahakul Store, Kalehipali", "9178470361", { updatedAt: "2026-11-11T17:20:00Z" }),
    cust("cust_bill_553", "Mahakul Store, Kalehipali", "9178470361"),
  ];

  const { customers: out, retiredIds, retiredToWinner } = dedupeSameShopCustomers(input);
  assert.equal(out.length, 3);
  assert.equal(retiredIds.length, 5);

  const ganesh = out.find((c) => c.name === "Ganesh Pan Dukan")!;
  assert.equal(ganesh.beatId, "beat_kch");
  assert.equal(ganesh.route, "Kuchinda Town");

  const santosh = out.find((c) => c.name === "Hello in (Santosh), Kuchinda")!;
  assert.equal(santosh.beatId, "beat_kch");
  assert.equal(santosh.phone, "+919777124161");

  const mahakul = out.find((c) => c.name === "Mahakul Store, Kalehipali")!;
  assert.equal(mahakul.id, "cust_1794417600857_d22t");
  assert.equal(retiredToWinner.get("cust_bill_553"), "cust_1794417600857_d22t");
});

test("dedupeSameShopCustomers keeps genuinely distinct shops with different real phones separate", () => {
  const input = [
    cust("c1", "Sharma Store", "9876543210", { beatId: "b1", route: "Beat 1" }),
    cust("cust_bill_99", "Sharma Store", "9876543210"),
    cust("c2", "Sharma Store", "9123456780", { beatId: "b2", route: "Beat 2" }),
  ];
  const { customers: out } = dedupeSameShopCustomers(input);
  assert.equal(out.length, 2);
  assert.equal(out.find((c) => c.id === "c1")?.beatId, "b1");
  assert.equal(out.find((c) => c.id === "c2")?.beatId, "b2");
});

test("findCustomerNameClash never warns when editing beat/phone without renaming, but warns when renaming onto another shop", () => {
  const list = [
    cust("cust_1794417600857_d22t", "Mahakul Store, Kalehipali", "9178470361"),
    cust("cust_bill_553", "Mahakul Store, Kalehipali", "9178470361"),
    cust("cust_other", "Ganesh Pan Dukan", ""),
  ];
  // Assigning a beat without renaming must NOT show a duplicate-name warning
  assert.equal(
    findCustomerNameClash(list, {
      customerId: "cust_1794417600857_d22t",
      oldName: "Mahakul Store, Kalehipali",
      newName: "Mahakul Store, Kalehipali",
      phone: "9178470361",
    }),
    undefined,
  );
  // Renaming onto a different existing shop's name MUST still warn
  assert.equal(
    findCustomerNameClash(list, {
      customerId: "cust_1794417600857_d22t",
      oldName: "Mahakul Store, Kalehipali",
      newName: "Ganesh Pan Dukan",
    })?.id,
    "cust_other",
  );
});

test("makeBeatResolver resolves assigned beat even when an unmapped duplicate copy or dummy phone exists", () => {
  const beats = [{ id: "beat_kch", name: "Kuchinda Town" }];
  const list = [
    cust("cust_bill_230", "Ganesh Pan Dukan", ""),
    cust("cust_bill_143", "Ganesh Pan Dukan", "", { beatId: "beat_kch", route: "Kuchinda Town" }),
    cust("cust_bill_491", "Hello in (Santosh), Kuchinda", "+919777124161"),
    cust("cust_bill_155", "Hello in (Santosh), Kuchinda", "1234567890", { beatId: "beat_kch", route: "Kuchinda Town" }),
  ];
  const resolver = makeBeatResolver(list, beats);
  assert.equal(resolver.beatIdFor("Ganesh Pan Dukan", "", "cust_bill_230"), "beat_kch");
  assert.equal(resolver.beatIdFor("Hello in (Santosh), Kuchinda", "+919777124161", "cust_bill_491"), "beat_kch");
  assert.equal(resolver.beatIdFor("Unknown Shop", ""), NO_BEAT);
});
