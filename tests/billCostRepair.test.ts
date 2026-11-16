import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBillCostRepairPlan, applyBillCostRepairPlan } from '../src/utils/billCostRepair';
import type { Bill, InventoryBatch, Product, Warehouse } from '../src/types';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Test Water 1L',
    category: 'pet',
    size: '1L',
    unitsPerCrate: 12,
    cost: 120,
    effectiveCost: 120,
    rate: 160,
    opening: 50,
    minStock: 5,
    sold: 0,
    gstRate: 18,
    ...overrides,
  };
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 501,
    retailer: 'Sharma Store',
    phone: '9876543210',
    discount: 10,
    additionalDiscount: 25,
    status: 'credit',
    total: 1850,
    amountPaid: 500,
    subtotal: 1567.8,
    cgst: 141.1,
    sgst: 141.1,
    roundOff: 0,
    date: '2026-10-15',
    warehouseId: 'wh-main',
    invoiceType: 'tax_invoice',
    isGstInvoice: true,
    items: [
      {
        productId: 1,
        productName: 'Test Water 1L',
        qty: 10,
        rate: 190,
        gross: 1900,
        freeQty: 0,
        chargeableQty: 10,
        discount: 10,
        amount: 1890,
        taxable: 1601.69,
        cgst: 144.15,
        sgst: 144.15,
      },
    ],
    ...overrides,
  };
}

function makeBatch(overrides: Partial<InventoryBatch> = {}): InventoryBatch {
  return {
    id: 'batch_1',
    productId: 1,
    batchNumber: 'B-OCT-01',
    warehouseId: 'wh-main',
    inwardDate: '2026-10-01',
    expiryDate: '2027-04-01',
    quantity: 100,
    costPrice: 118,
    effectiveCostPrice: 118,
    ...overrides,
  };
}

const warehouses: Warehouse[] = [
  { id: 'wh-main', name: 'Main Godown', isDefault: true },
  { id: 'wh-north', name: 'North Godown' },
];

test('buildBillCostRepairPlan detects no_batch, van_fallback, and missing_or_zero_batch accurately while skipping frozen/valid/cancelled bills', () => {
  const products = [
    makeProduct({ id: 1, name: 'Water 1L', effectiveCost: 120 }),
    makeProduct({ id: 2, name: 'Zero Cost Soda', cost: 0, effectiveCost: 0 }),
  ];
  const batches = [
    makeBatch({ id: 'b_main', productId: 1, warehouseId: 'wh-main', batchNumber: 'B-MAIN', effectiveCostPrice: 116 }),
    makeBatch({ id: 'b_zero', productId: 1, warehouseId: 'wh-main', batchNumber: 'B-ZERO', costPrice: 0, effectiveCostPrice: 0 }),
  ];

  const bills: Bill[] = [
    // 1. Estimated: no batch & no costExGst
    makeBill({ id: 101, warehouseId: 'wh-main' }),
    // 2. Estimated: VAN fallback batch
    makeBill({
      id: 102,
      warehouseId: 'wh-north',
      items: [
        {
          productId: 1,
          productName: 'Water 1L',
          qty: 5,
          rate: 190,
          gross: 950,
          freeQty: 0,
          chargeableQty: 5,
          discount: 0,
          amount: 950,
          batchNumber: 'VAN-EV01',
          batchAllocations: [{ batchId: 'trip_9_1', batchNumber: 'VAN-EV01', qty: 5 }],
        },
      ],
    }),
    // 3. Estimated: batch points to b_zero (0 cost)
    makeBill({
      id: 103,
      warehouseId: 'wh-main',
      items: [
        {
          productId: 1,
          productName: 'Water 1L',
          qty: 4,
          rate: 190,
          gross: 760,
          freeQty: 0,
          chargeableQty: 4,
          discount: 0,
          amount: 760,
          batchNumber: 'B-ZERO',
          batchAllocations: [{ batchId: 'b_zero', batchNumber: 'B-ZERO', qty: 4 }],
        },
      ],
    }),
    // 4. Already frozen -> must be skipped
    makeBill({
      id: 104,
      items: [
        {
          productId: 1,
          productName: 'Water 1L',
          qty: 8,
          rate: 190,
          gross: 1520,
          freeQty: 0,
          chargeableQty: 8,
          discount: 0,
          amount: 1520,
          costExGst: 115,
        },
      ],
    }),
    // 5. Cancelled -> must be skipped
    makeBill({ id: 105, status: 'cancelled' }),
    // 6. Zero cost product -> 'none', not 'estimated'
    makeBill({
      id: 106,
      items: [
        {
          productId: 2,
          productName: 'Zero Cost Soda',
          qty: 6,
          rate: 100,
          gross: 600,
          freeQty: 0,
          chargeableQty: 6,
          discount: 0,
          amount: 600,
        },
      ],
    }),
  ];

  const plan = buildBillCostRepairPlan({ bills, products, inventoryBatches: batches, warehouses });
  assert.equal(plan.affectedBillCount, 3);
  assert.equal(plan.totalCases, 19); // 10 + 5 + 4
  assert.equal(plan.lines.length, 3);

  const l101 = plan.lines.find((l) => l.billId === 101)!;
  assert.equal(l101.reason, 'no_batch');
  assert.equal(l101.action, 'link_and_freeze');
  assert.equal(l101.matchedBatch?.batchId, 'b_main');
  assert.equal(l101.proposedCostExGst, 116);

  // wh-north has NO batches for product 1 -> must NOT cross godowns, falls back to freeze_cost_only
  const l102 = plan.lines.find((l) => l.billId === 102)!;
  assert.equal(l102.reason, 'van_fallback');
  assert.equal(l102.action, 'freeze_cost_only');
  assert.equal(l102.matchedBatch, null);
  assert.equal(l102.proposedCostExGst, 120);

  const l103 = plan.lines.find((l) => l.billId === 103)!;
  assert.equal(l103.reason, 'missing_or_zero_batch');
  assert.equal(l103.action, 'link_and_freeze');
  assert.equal(l103.matchedBatch?.batchId, 'b_main');
});

test('applyBillCostRepairPlan updates costExGst & batchAllocations without altering totals, GST, dues, or payments', () => {
  const products = [makeProduct()];
  const batches = [makeBatch()];
  const original = makeBill({
    id: 501,
    total: 1850,
    subtotal: 1567.8,
    cgst: 141.1,
    sgst: 141.1,
    discount: 10,
    additionalDiscount: 25,
    amountPaid: 500,
    taxStamp: {
      regime: 'regular',
      registrationType: 'regular',
      gstMode: 'incl',
      isComposition: false,
      gstCollected: 282.2,
    } as any,
  });

  const plan = buildBillCostRepairPlan({
    bills: [original],
    products,
    inventoryBatches: batches,
    warehouses,
  });

  const result = applyBillCostRepairPlan({
    bills: [original],
    plan,
    mode: 'link_and_freeze',
    nowIso: '2026-11-15T10:00:00.000Z',
  });

  assert.equal(result.fixedBills, 1);
  assert.equal(result.linkedLines, 1);
  assert.equal(result.frozenOnlyLines, 0);
  assert.equal(result.fixedCases, 10);

  const repaired = result.updatedBills[0];
  // Strictly untouched financials
  assert.equal(repaired.total, original.total);
  assert.equal(repaired.subtotal, original.subtotal);
  assert.equal(repaired.cgst, original.cgst);
  assert.equal(repaired.sgst, original.sgst);
  assert.equal(repaired.discount, original.discount);
  assert.equal(repaired.additionalDiscount, original.additionalDiscount);
  assert.equal(repaired.amountPaid, original.amountPaid);
  assert.deepEqual(repaired.taxStamp, original.taxStamp);
  assert.equal(repaired.items[0].qty, original.items[0].qty);
  assert.equal(repaired.items[0].rate, original.items[0].rate);
  assert.equal(repaired.items[0].amount, original.items[0].amount);
  assert.equal(repaired.items[0].taxable, original.items[0].taxable);
  assert.equal(repaired.items[0].cgst, original.items[0].cgst);
  assert.equal(repaired.items[0].sgst, original.items[0].sgst);

  // Updated cost metadata
  assert.equal(repaired.items[0].costExGst, 118);
  assert.equal(repaired.items[0].batchNumber, 'B-OCT-01');
  assert.deepEqual(repaired.items[0].batchAllocations, [
    { batchId: 'batch_1', batchNumber: 'B-OCT-01', expiryDate: '2027-04-01', qty: 10 },
  ]);

  // Re-running buildBillCostRepairPlan after repair yields 0 estimated lines
  const secondPlan = buildBillCostRepairPlan({
    bills: result.updatedBills,
    products,
    inventoryBatches: batches,
    warehouses,
  });
  assert.equal(secondPlan.lines.length, 0);
  assert.equal(secondPlan.totalCases, 0);
});

test('applyBillCostRepairPlan in freeze_only mode locks costExGst without changing batchAllocations', () => {
  const products = [makeProduct({ effectiveCost: 122 })];
  const batches = [makeBatch({ effectiveCostPrice: 118 })];
  const original = makeBill({
    id: 700,
    items: [
      {
        productId: 1,
        productName: 'Water 1L',
        qty: 7,
        rate: 190,
        gross: 1330,
        freeQty: 0,
        chargeableQty: 7,
        discount: 0,
        amount: 1330,
        batchNumber: 'VAN-EV01',
        batchAllocations: [{ batchId: 'trip_1_1', batchNumber: 'VAN-EV01', qty: 7 }],
      },
    ],
  });

  const plan = buildBillCostRepairPlan({ bills: [original], products, inventoryBatches: batches, warehouses });
  const res = applyBillCostRepairPlan({ bills: [original], plan, mode: 'freeze_only' });
  const repaired = res.updatedBills[0];

  assert.equal(res.linkedLines, 0);
  assert.equal(res.frozenOnlyLines, 1);
  assert.equal(repaired.items[0].costExGst, 122);
  assert.equal(repaired.items[0].batchNumber, 'VAN-EV01');
  assert.deepEqual(repaired.items[0].batchAllocations, original.items[0].batchAllocations);
});

test('buildBillCostRepairPlan respects sales returns when counting netCases', () => {
  const products = [makeProduct({ effectiveCost: 120 })];
  const bill = makeBill({
    id: 800,
    returns: [
      {
        id: 'ret-1',
        creditNoteNo: 'CN-1',
        date: '2026-10-16',
        totalCredit: 570,
        cgst: 0,
        sgst: 0,
        lines: [{ productId: 1, qty: 3, restockQty: 3, scrapQty: 0, rate: 190, credit: 570 }],
      },
    ],
  });
  const plan = buildBillCostRepairPlan({ bills: [bill], products, inventoryBatches: [], warehouses });
  assert.equal(plan.totalCases, 7); // 10 sold - 3 returned
});

import {
  buildCrossWarehouseShiftPlan,
  applyCrossWarehouseRestorePlan,
  resolveEffectiveBillWarehouseId,
} from '../src/utils/billCostRepair';

function computeRemainingStockLikeLedger(
  product: Product,
  bills: Bill[],
  batches: InventoryBatch[],
  warehouses: Warehouse[],
): Record<string, number> {
  const valid = (id?: string) => !!id && warehouses.some((w) => w.id === id);
  const fallbackWh = valid(product.warehouseId)
    ? (product.warehouseId as string)
    : warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || '';
  const whOf = (id?: string) => (id && warehouses.some((w) => w.id === id) ? id : fallbackWh);
  const batchWh = new Map(batches.map((b) => [b.id, b.warehouseId]));

  const soldInWh: Record<string, number> = {};
  for (const b of bills) {
    if (b.status === 'cancelled') continue;
    for (const it of b.items) {
      if (it.productId !== product.id) continue;
      let left = Number(it.qty) || 0;
      for (const a of it.batchAllocations || []) {
        const wh = batchWh.get(a.batchId);
        if (!wh) continue;
        const take = Math.min(left, Number(a.qty) || 0);
        if (take > 0) {
          soldInWh[wh] = (soldInWh[wh] || 0) + take;
          left -= take;
        }
      }
      if (left > 0) soldInWh[whOf(b.warehouseId)] = (soldInWh[whOf(b.warehouseId)] || 0) + left;
    }
  }
  const out: Record<string, number> = {};
  for (const w of warehouses) {
    const batchSum = batches
      .filter((b) => b.productId === product.id && b.warehouseId === w.id)
      .reduce((s, b) => s + (Number(b.quantity) || 0), 0);
    out[w.id] = batchSum - (soldInWh[w.id] || 0);
  }
  return out;
}

test('empty-warehouse bill never links to an oversold alternate godown (total & per-godown stock stay invariant)', () => {
  const product = makeProduct({ id: 1, warehouseId: 'wh-main', effectiveCost: 120 });
  const batches = [
    // Main has 50 received; North has 10 received (and suppose North already oversold 30 -> -20)
    makeBatch({ id: 'b_main', productId: 1, warehouseId: 'wh-main', batchNumber: 'B-MAIN', inwardDate: '2026-10-05', quantity: 50, effectiveCostPrice: 118 }),
    makeBatch({ id: 'b_north', productId: 1, warehouseId: 'wh-north', batchNumber: 'B-NORTH', inwardDate: '2026-10-01', quantity: 10, effectiveCostPrice: 119 }),
  ];
  const bills: Bill[] = [
    // Explicit north sale of 30 -> North is -20
    makeBill({
      id: 10,
      warehouseId: 'wh-north',
      items: [{ productId: 1, productName: 'Water 1L', qty: 30, rate: 190, gross: 5700, freeQty: 0, chargeableQty: 30, discount: 0, amount: 5700, costExGst: 119 }],
    }),
    // Legacy bill with EMPTY warehouseId (""), qty 20 -> effective warehouse is product.warehouseId = 'wh-main'
    makeBill({
      id: 11,
      warehouseId: '',
      items: [{ productId: 1, productName: 'Water 1L', qty: 20, rate: 190, gross: 3800, freeQty: 0, chargeableQty: 20, discount: 0, amount: 3800 }],
    }),
  ];

  assert.equal(resolveEffectiveBillWarehouseId('', product, warehouses), 'wh-main');

  const stockBefore = computeRemainingStockLikeLedger(product, bills, batches, warehouses);
  assert.deepEqual(stockBefore, { 'wh-main': 30, 'wh-north': -20 });

  const plan = buildBillCostRepairPlan({ bills, products: [product], inventoryBatches: batches, warehouses });
  assert.equal(plan.lines[0].matchedBatch?.batchId, 'b_main'); // MUST pick Main even though North had an older inwardDate!

  const repaired = applyBillCostRepairPlan({ bills, plan, mode: 'link_and_freeze' });
  const stockAfter = computeRemainingStockLikeLedger(product, repaired.updatedBills, batches, warehouses);
  assert.deepEqual(stockAfter, stockBefore);
});

test('buildCrossWarehouseShiftPlan & applyCrossWarehouseRestorePlan restore shifted stock while keeping costExGst frozen', () => {
  const product = makeProduct({ id: 1, warehouseId: 'wh-main', effectiveCost: 120 });
  const batches = [
    makeBatch({ id: 'b_main', productId: 1, warehouseId: 'wh-main', batchNumber: 'B-MAIN', quantity: 50, effectiveCostPrice: 118 }),
    makeBatch({ id: 'b_north', productId: 1, warehouseId: 'wh-north', batchNumber: 'B-NORTH', quantity: 10, effectiveCostPrice: 119 }),
  ];
  // Simulate a bill whose warehouseId was "" and got linked to b_north (inflating wh-main)
  const shiftedBill = makeBill({
    id: 12,
    warehouseId: '',
    items: [
      {
        productId: 1,
        productName: 'Water 1L',
        qty: 20,
        rate: 190,
        gross: 3800,
        freeQty: 0,
        chargeableQty: 20,
        discount: 0,
        amount: 3800,
        costExGst: 119,
        batchNumber: 'B-NORTH',
        batchAllocations: [{ batchId: 'b_north', batchNumber: 'B-NORTH', qty: 20 }],
      },
    ],
  });

  const shiftPlan = buildCrossWarehouseShiftPlan({
    bills: [shiftedBill],
    products: [product],
    inventoryBatches: batches,
    warehouses,
  });
  assert.equal(shiftPlan.affectedBillCount, 1);
  assert.equal(shiftPlan.totalShiftedCases, 20);

  const restored = applyCrossWarehouseRestorePlan({ bills: [shiftedBill], plan: shiftPlan });
  assert.equal(restored.restoredBills, 1);
  // costExGst stays frozen!
  assert.equal(restored.updatedBills[0].items[0].costExGst, 119);
  // allocation moved back to main
  assert.equal(restored.updatedBills[0].items[0].batchAllocations?.[0].batchId, 'b_main');

  // Re-running shift check returns 0
  const postCheck = buildCrossWarehouseShiftPlan({
    bills: restored.updatedBills,
    products: [product],
    inventoryBatches: batches,
    warehouses,
  });
  assert.equal(postCheck.affectedBillCount, 0);
});
