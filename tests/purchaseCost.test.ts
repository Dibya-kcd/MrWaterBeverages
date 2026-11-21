import test from 'node:test';
import assert from 'node:assert/strict';
import { costBasisFor, stockCrateCost } from '../src/tax';
import { calculateLandedCostBreakdown } from '../src/utils/billing';
import { buildCatalogFromGrns } from '../src/context/ledgerHelpers';
import type { OrganizationProfile } from '../src/types';

const org = (o: Partial<OrganizationProfile> = {}) =>
  ({ name: 'x', gstin: '21ABCDE1234F1Z5', stateCode: '21', gstRegistrationType: 'composition',
     compositionCategory: 'trader', gstEngineStartDate: '2026-11-01', ...o }) as OrganizationProfile;

/** A GRN line exactly as the app stores it: the breakdown fields spread onto the line. */
const line = (o: { qty?: number; unitPrice?: number; cgst?: number; sgst?: number; inward?: number } = {}) => {
  const cgstPercent = o.cgst ?? 9, sgstPercent = o.sgst ?? 9;
  const b = calculateLandedCostBreakdown({ qty: o.qty ?? 10, unitPrice: o.unitPrice ?? 1000, cgstPercent, sgstPercent,
    schemeType: 'none' as any, inwardCostPerCrate: o.inward ?? 0 });
  return { id: 'it1', productName: 'MANGO 600ML', category: 'energy', hsn: '22029990', qty: o.qty ?? 10, freeQty: 0,
    unitPrice: o.unitPrice ?? 1000, cgstPercent, sgstPercent, unitsPerCrate: 24, totalReceivedQty: o.qty ?? 10, ...b } as any;
};
const grn = (inwardDate: string, item = line()) =>
  ({ id: `g-${inwardDate}`, grnNumber: 'GRN-1', invoiceNo: 'S-1', supplierName: 'Supplier', inwardDate,
     warehouseId: 'wh1', items: [item], stockPosted: true }) as any;

test('basis: legacy until the engine is on, and only for GRNs dated on/after the start date', () => {
  assert.equal(costBasisFor(undefined, '2026-12-01'), 'ex_gst');
  assert.equal(costBasisFor(org({ gstRegistrationType: undefined }), '2026-12-01'), 'ex_gst');
  assert.equal(costBasisFor(org(), '2026-10-31'), 'ex_gst', 'GRN before the start date keeps the old cost');
  assert.equal(costBasisFor(org(), '2026-11-01'), 'incl_gst', 'start date itself is included');
  assert.equal(costBasisFor(org({ gstRegistrationType: 'regular' }), '2026-12-01'), 'ex_gst', 'regular taxpayers keep ex-GST costing');
});

test('1,00,000 + 18% GST => composition stock cost 1,18,000 (ITC zero), legacy stays 1,00,000', () => {
  const it = line({ qty: 1, unitPrice: 100000 });
  assert.equal(stockCrateCost(it, 'ex_gst'), 100000);
  assert.equal(stockCrateCost(it, 'incl_gst'), 118000);
});

test('inclusive minus ex-GST cost is exactly the GST, for each slab', () => {
  for (const half of [2.5, 6, 9, 14, 20]) {
    const it = line({ unitPrice: 1000, cgst: half, sgst: half });
    const diff = Math.round((stockCrateCost(it, 'incl_gst') - stockCrateCost(it, 'ex_gst')) * 100) / 100;
    assert.equal(diff, Math.round(1000 * (half * 2) / 100 * 100) / 100, `${half * 2}%`);
  }
});

test('inward freight is added once, and is not taxed again', () => {
  const it = line({ unitPrice: 1000, inward: 30 });
  assert.equal(stockCrateCost(it, 'ex_gst'), 1030);
  assert.equal(stockCrateCost(it, 'incl_gst'), 1210, '1000 + 18% + 30 freight');
});

test('a line with no tax split or 0% GST is never given an assumed 18%', () => {
  const none = { ...line({ qty: 1, unitPrice: 500 }), cgstPercent: undefined, sgstPercent: undefined } as any;
  assert.equal(stockCrateCost(none, 'incl_gst'), stockCrateCost(none, 'ex_gst'));
  const zero = line({ qty: 1, unitPrice: 500, cgst: 0, sgst: 0 });
  assert.equal(stockCrateCost(zero, 'incl_gst'), 500);
});

test('catalog rebuild: legacy call is unchanged; composition GRNs carry GST in cost only from the start date', () => {
  const legacy = buildCatalogFromGrns([grn('2026-12-01')], []);
  assert.equal(legacy.products[0].effectiveCost, 1000);
  assert.equal(legacy.batches[0].effectiveCostPrice, 1000);

  const basis = (d: string) => costBasisFor(org(), d);
  const after = buildCatalogFromGrns([grn('2026-12-01')], [], basis);
  assert.equal(after.products[0].effectiveCost, 1180);
  assert.equal(after.batches[0].effectiveCostPrice, 1180);
  assert.equal(after.products[0].cost, 1000, 'the supplier list rate stays ex-GST');

  const before = buildCatalogFromGrns([grn('2026-10-15')], [], basis);
  assert.equal(before.products[0].effectiveCost, 1000, 'older GRN untouched');
  assert.equal(before.batches[0].effectiveCostPrice, 1000);
});

test('stock bought before and after the start date blends correctly (weighted average)', () => {
  const basis = (d: string) => costBasisFor(org(), d);
  const mixed = buildCatalogFromGrns([grn('2026-10-15'), grn('2026-12-01')].map((g, i) => ({ ...g, id: `g${i}` })), [], basis);
  // 10 cases @1000 then 10 cases @1180 => 1090
  assert.equal(mixed.products[0].effectiveCost, 1090);
});
