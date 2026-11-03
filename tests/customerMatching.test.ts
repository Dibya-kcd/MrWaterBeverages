import test from "node:test";
import assert from "node:assert/strict";
import {
  normCustName,
  findDuplicateCustomer,
  splitSameNameShops,
  mergeCustomersNewestWins,
} from "../src/context/ledgerHelpers";

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
