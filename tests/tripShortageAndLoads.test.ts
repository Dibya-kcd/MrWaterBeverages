import test from "node:test";
import assert from "node:assert/strict";
import { formatTripGroupDay, rebalanceWarehouseLoads } from "../src/utils/tripLoads";
import { normalizeTrip } from "../src/utils/billing";
import { validatePhone } from "../src/utils/validation";
import { tripFingerprint } from "../src/context/ledgerHelpers";
import { DEMO_PRESETS } from "../src/constants/demoPresets";
import { TRIP_WRITEOFF_REASONS } from "../src/types";

test("only crates that left the godown reduce book stock", () => {
  assert.ok(TRIP_WRITEOFF_REASONS.includes("broken"));
  assert.ok(TRIP_WRITEOFF_REASONS.includes("sold_not_billed"));
  assert.ok(TRIP_WRITEOFF_REASONS.includes("other"));
  assert.ok(!TRIP_WRITEOFF_REASONS.includes("short_loaded"));
});

test("a product with damaged AND missing crates keeps both parts through normalizeTrip", () => {
  const t = normalizeTrip({
    id: 7,
    vehicle: "OD-01",
    date: "2026-11-18",
    loaded: { 1: 10 },
    shortageReasons: {
      1: {
        reason: "broken",
        qty: 2,
        dispositionId: "d1",
        missing: { reason: "sold_not_billed", qty: 3, note: "Shop A", dispositionId: "d2" },
      },
      2: { reason: "short_loaded", qty: 1, missing: { reason: "broken", qty: 1 } },
    },
  });
  const e = t.shortageReasons![1];
  assert.equal(e.reason, "broken");
  assert.equal(e.qty, 2);
  assert.deepEqual(e.missing, { reason: "sold_not_billed", qty: 3, note: "Shop A", dispositionId: "d2" });
  // "missing" can never itself be 'broken'
  assert.equal(t.shortageReasons![2].missing, undefined);
});

test("edit load: changing the source godown moves only the unsold crates", () => {
  const out = rebalanceWarehouseLoads({ A: { 1: 10, 2: 4 } }, { 1: 10, 2: 4 }, "B", { 1: 6 });
  assert.deepEqual(out, { A: { 1: 6 }, B: { 1: 4, 2: 4 } });
});

test("edit load: unchanged godown keeps the split, extra crates come from the chosen godown", () => {
  const out = rebalanceWarehouseLoads({ A: { 1: 5 }, B: { 1: 5 } }, { 1: 12 }, "B", {});
  assert.deepEqual(out, { A: { 1: 5 }, B: { 1: 7 } });
});

test("edit load: a chosen godown the van did not use yet receives the extra crates", () => {
  const out = rebalanceWarehouseLoads({ A: { 1: 5 }, B: { 1: 5 } }, { 1: 12 }, "C", {});
  assert.deepEqual(out, { A: { 1: 5 }, B: { 1: 5 }, C: { 1: 2 } });
});

test("edit load: cuts come off the last godown first and empty godowns disappear", () => {
  const out = rebalanceWarehouseLoads({ A: { 1: 5 }, B: { 1: 5 } }, { 1: 4 }, "A", {});
  assert.deepEqual(out, { A: { 1: 4 } });
});

test("edit load: all crates billed stay in the old godown when the selector changes", () => {
  const out = rebalanceWarehouseLoads({ A: { 1: 8 } }, { 1: 8 }, "B", { 1: 8 });
  assert.deepEqual(out, { A: { 1: 8 } });
});

test("trip phone numbers: normalizeTrip preserves camelCase and snake_case phones safely", () => {
  const fromApp = normalizeTrip({
    id: 11,
    vehicle: "OD-02-AB-1111",
    date: "2026-11-20",
    driver: "Ramesh",
    driverPhone: " 9876543210 ",
    salesman: "Suresh",
    salesmanPhone: "+91 91234 56789",
    loaded: { 1: 12 },
  });
  assert.equal(fromApp.driverPhone, "9876543210");
  assert.equal(fromApp.salesmanPhone, "+91 91234 56789");

  const fromDb = normalizeTrip({
    id: 12,
    vehicle: "OD-02-AB-2222",
    date: "2026-11-20",
    driver: "Bikash",
    driver_phone: "9988776655",
    salesman_phone: "   ",
    loaded: { 1: 8 },
  });
  assert.equal(fromDb.driverPhone, "9988776655");
  assert.equal(fromDb.salesmanPhone, undefined);
});

test("trip phone numbers: tripFingerprint detects driverPhone and salesmanPhone changes", () => {
  const base = normalizeTrip({
    id: 21,
    vehicle: "OD-05-CD-4444",
    date: "2026-11-20",
    loaded: { 1: 5 },
    driverPhone: "9876543210",
  });
  const editedDriver = { ...base, driverPhone: "9876500000" };
  const editedSalesman = { ...base, salesmanPhone: "9123456789" };
  assert.notEqual(tripFingerprint(base), tripFingerprint(editedDriver));
  assert.notEqual(tripFingerprint(base), tripFingerprint(editedSalesman));
});

test("trip phone validation accepts Indian numbers and rejects invalid ones", () => {
  assert.equal(validatePhone("9876543210", { label: "Driver phone" }), null);
  assert.equal(validatePhone("+91 98765 43210", { label: "Driver phone" }), null);
  assert.ok(validatePhone("12345", { label: "Driver phone" }));
});

test("seed presets contain zero trips and zero bills so real DB records are never affected", () => {
  for (const preset of Object.values(DEMO_PRESETS)) {
    assert.equal(preset.trips.length, 0);
    assert.equal(preset.bills.length, 0);
  }
});

test("formatTripGroupDay labels today, yesterday, older dates, and undated trips", () => {
  assert.equal(formatTripGroupDay("2026-11-20", "2026-11-20", "2026-11-19"), "TODAY");
  assert.equal(formatTripGroupDay("2026-11-19T14:30:00", "2026-11-20", "2026-11-19"), "YESTERDAY");
  assert.equal(formatTripGroupDay("2026-11-18", "2026-11-20", "2026-11-19"), "18 NOV 2026");
  assert.equal(formatTripGroupDay(undefined, "2026-11-20", "2026-11-19"), "UNDATED");
});
