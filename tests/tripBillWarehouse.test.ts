import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveBillWarehouseId,
  resolveTripGodownDisplay,
  tripPrimaryWarehouseId,
  tripWarehouseIds,
} from "../src/utils/tripLoads";
import { normalizeTrip } from "../src/utils/billing";
import { applyBillExtra, billExtraFields } from "../src/utils/billExtra";

const WAREHOUSES = [
  { id: "wh_default", name: "Main Depot", location: "Bargarh" },
  { id: "wh_mandap", name: "Mandap Warehouse", location: "Mandap" },
];

test("tripWarehouseIds and tripPrimaryWarehouseId resolve Mandap from warehouseLoads even when trip.warehouseId is blank or stale", () => {
  const validIds = new Set(WAREHOUSES.map((w) => w.id));

  // Blank trip.warehouseId, loaded from Mandap
  const blankWhTrip = {
    warehouseId: "",
    warehouseLoads: { wh_mandap: { 101: 20, 102: 10 } },
  };
  assert.deepEqual(tripWarehouseIds(blankWhTrip, validIds), ["wh_mandap"]);
  assert.equal(tripPrimaryWarehouseId(blankWhTrip, validIds), "wh_mandap");

  // Stale/wrong trip.warehouseId ('wh_main' or 'wh_default'), loaded only from Mandap
  const staleTrip = {
    warehouseId: "wh_default",
    warehouseLoads: { wh_mandap: { 101: 15 }, wh_default: { 101: 0 } },
  };
  assert.deepEqual(tripWarehouseIds(staleTrip, validIds), ["wh_mandap"]);
  assert.equal(tripPrimaryWarehouseId(staleTrip, validIds), "wh_mandap");

  // Bogus placeholder 'wh_main' rejected when validIds provided
  const bogusTrip = { warehouseId: "wh_main" };
  assert.deepEqual(tripWarehouseIds(bogusTrip, validIds), []);
  assert.equal(tripPrimaryWarehouseId(bogusTrip, validIds), "");
});

test("multi-godown trip orders godowns by loaded qty descending and respects valid explicit warehouseId", () => {
  const validIds = new Set(WAREHOUSES.map((w) => w.id));
  const multiTrip = {
    warehouseId: "wh_default",
    warehouseLoads: {
      wh_default: { 101: 5 },
      wh_mandap: { 101: 25 },
    },
  };
  assert.deepEqual(tripWarehouseIds(multiTrip, validIds), ["wh_mandap", "wh_default"]);
  // Explicit warehouseId is one of the loaded godowns, so primary keeps it
  assert.equal(tripPrimaryWarehouseId(multiTrip, validIds), "wh_default");

  const multiTripNoExplicit = {
    warehouseId: "",
    warehouseLoads: multiTrip.warehouseLoads,
  };
  assert.equal(tripPrimaryWarehouseId(multiTripNoExplicit, validIds), "wh_mandap");
});

test("resolveBillWarehouseId gives trip godown precedence over stale cart godown and rejects bogus 'wh_main'", () => {
  const mandapTrip = {
    warehouseId: "",
    warehouseLoads: { wh_mandap: { 1: 30 } },
  };

  // Stale default godown left in cart must NOT override the trip's Mandap Warehouse
  assert.equal(
    resolveBillWarehouseId({
      trip: mandapTrip,
      cartWarehouseId: "wh_default",
      defaultWarehouseId: "wh_default",
      warehouses: WAREHOUSES,
    }),
    "wh_mandap",
  );

  // Hardcoded bogus 'wh_main' in cart must NOT override trip or direct-warehouse default
  assert.equal(
    resolveBillWarehouseId({
      trip: mandapTrip,
      cartWarehouseId: "wh_main",
      defaultWarehouseId: "wh_default",
      warehouses: WAREHOUSES,
    }),
    "wh_mandap",
  );
  assert.equal(
    resolveBillWarehouseId({
      trip: null,
      cartWarehouseId: "wh_main",
      defaultWarehouseId: "wh_default",
      warehouses: WAREHOUSES,
    }),
    "wh_default",
  );

  // Direct warehouse sale uses valid chosen godown
  assert.equal(
    resolveBillWarehouseId({
      trip: null,
      cartWarehouseId: "wh_mandap",
      defaultWarehouseId: "wh_default",
      warehouses: WAREHOUSES,
    }),
    "wh_mandap",
  );
});

test("resolveTripGodownDisplay shows Mandap Warehouse for trip bills even when bill.warehouseId is empty or invalid", () => {
  const trip = {
    id: 573,
    warehouseId: "",
    warehouseLoads: { wh_mandap: { 10: 12 } },
  };
  const legacyBill = {
    warehouseId: "",
    items: [],
  };

  const single = resolveTripGodownDisplay({
    trip,
    bill: legacyBill,
    warehouses: WAREHOUSES,
    includeLocation: true,
  });
  assert.equal(single.primaryWarehouseId, "wh_mandap");
  assert.equal(single.label, "Mandap Warehouse (Mandap)");
  assert.equal(single.isMultiWarehouse, false);

  const multi = resolveTripGodownDisplay({
    trip: {
      id: 574,
      warehouseId: "wh_mandap",
      warehouseLoads: { wh_mandap: { 10: 12 }, wh_default: { 11: 4 } },
    },
    bill: legacyBill,
    warehouses: WAREHOUSES,
    includeLocation: true,
  });
  assert.equal(multi.label, "Mandap Warehouse + Main Depot");
  assert.equal(multi.isMultiWarehouse, true);
  assert.deepEqual(multi.warehouseIds, ["wh_mandap", "wh_default"]);

  // Falls back to batch allocations if trip has no warehouse info
  const fromBatches = resolveTripGodownDisplay({
    trip: { id: 575, warehouseId: "" },
    bill: {
      warehouseId: "wh_main",
      items: [
        {
          productId: 10,
          productName: "Water",
          category: "water",
          priceType: "Retail",
          qty: 5,
          rate: 100,
          gross: 500,
          freeQty: 0,
          chargeableQty: 5,
          discount: 0,
          amount: 500,
          gst: 18,
          batchAllocations: [{ batchId: "b_mandap_1", batchNumber: "B1", expiryDate: "2027-01-01", qty: 5 }],
        },
      ],
    },
    warehouses: WAREHOUSES,
    inventoryBatches: [{ id: "b_mandap_1", warehouseId: "wh_mandap" }],
  });
  assert.equal(fromBatches.primaryWarehouseId, "wh_mandap");
  assert.equal(fromBatches.label, "Mandap Warehouse");
});

test("normalizeTrip backfills blank warehouseId from warehouseLoads", () => {
  const t = normalizeTrip({
    id: 99,
    vehicle: "EV",
    date: "2026-11-17",
    warehouse_id: "",
    loaded: { 1: 15 },
    warehouse_loads: { wh_mandap: { 1: 15 } },
  });
  assert.equal(t.warehouseId, "wh_mandap");
});

test("billExtraFields and applyBillExtra preserve warehouseId when DB column is blank while letting populated DB column win", () => {
  const extra = billExtraFields({ id: 573, tripId: 42, warehouseId: "wh_mandap" });
  assert.ok(extra);
  assert.equal(extra.warehouseId, "wh_mandap");

  // Missing/blank warehouse_id column hydrated as "" -> restored from extra
  const restored = applyBillExtra({ id: 573, warehouseId: "" }, extra);
  assert.equal(restored.warehouseId, "wh_mandap");

  // Populated warehouse_id column always wins over extra
  const dbWins = applyBillExtra({ id: 573, warehouseId: "wh_default" }, extra);
  assert.equal(dbWins.warehouseId, "wh_default");

  // Empty warehouseId is not written into extra
  const emptyExtra = billExtraFields({ id: 574, warehouseId: "   " });
  assert.equal(emptyExtra, null);
});
