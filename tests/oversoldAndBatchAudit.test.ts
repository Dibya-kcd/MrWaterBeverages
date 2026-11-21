import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseOversoldGodowns } from '../src/utils/oversoldDiagnostic';

const warehouses = [
  { id: 'g1', name: 'Godown 1', isDefault: true },
  { id: 'g2', name: 'Godown 2', isDefault: false },
] as any;
const products = [
  { id: 1, name: 'Aqua 1L', warehouseId: 'g1', opening: 0 },
  { id: 2, name: 'Aqua 500ml', warehouseId: 'g1', opening: 0 },
  { id: 3, name: 'Soda', warehouseId: 'g1', opening: 0 },
] as any;
const inv = (id: string, productId: number, wh: string, quantity: number) =>
  ({ id, productId, warehouseId: wh, quantity, batchNumber: id.toUpperCase(), expiryDate: '2027-01-01' }) as any;
const batches = [inv('p1g1', 1, 'g1', 100), inv('p1g2', 1, 'g2', 128), inv('p2g1', 2, 'g1', 10), inv('p3g1', 3, 'g1', 5)];
const bill = (id: number, warehouseId: string | undefined, items: any[], extra: any = {}) =>
  ({ id, retailer: `R${id}`, date: '2026-11-01', tripId: 7, warehouseId, items, total: 100, amountPaid: 40, ...extra }) as any;

test('finds every oversold product x godown and lists the contributing bills', () => {
  const bills = [
    bill(1, 'g1', [{ productId: 1, qty: 70 }]), // Aqua 1L from G1 (tagged godown)
    bill(2, 'g1', [{ productId: 1, qty: 122 }, { productId: 2, qty: 15 }]),
    bill(3, 'g2', [{ productId: 3, qty: 2 }]), // Soda tagged G2 but only stocked in G1
    bill(4, 'g1', [{ productId: 3, qty: 1 }], { status: 'cancelled' }),
  ].filter((b) => b.status !== 'cancelled'); // context passes ACTIVE bills only
  const res = diagnoseOversoldGodowns({ products, warehouses, inventoryBatches: batches, bills, audits: [] });

  const keys = res.map((r) => `${r.productId}|${r.warehouseId}`).sort();
  assert.deepEqual(keys, ['1|g1', '2|g1', '3|g2']);

  const aqua = res.find((r) => r.productId === 1)!;
  assert.equal(aqua.inwardCases, 100);
  assert.equal(aqua.totalSoldCases, 192);
  assert.equal(aqua.bookBalance, -92);
  assert.equal(aqua.shortfallCases, 92);
  assert.deepEqual(aqua.bills.map((b) => b.billId).sort(), [1, 2]);
  assert.equal(aqua.targets[0].warehouseId, 'g2');
  assert.equal(aqua.targets[0].availableCases, 128);

  const soda = res.find((r) => r.productId === 3)!;
  assert.equal(soda.warehouseId, 'g2');
  assert.equal(soda.bookBalance, -2);
  assert.equal(soda.bills[0].allocationSource, 'bill-godown');
});

test('batch-traced sales are attributed to the batch godown, with batch labels', () => {
  const bills = [bill(9, 'g1', [{ productId: 1, qty: 10, batchAllocations: [{ batchId: 'p1g2', batchNumber: 'P1G2', qty: 10 }] }])];
  const res = diagnoseOversoldGodowns({ products, warehouses, inventoryBatches: batches, bills, audits: [] });
  assert.equal(res.length, 0); // 128 - 10 still positive, nothing oversold
});

test('audit adjustments and dispositions change the book balance; cleared godowns drop out', () => {
  const bills = [bill(1, 'g1', [{ productId: 1, qty: 192 }])];
  const audits = [{ id: 1, date: '2026-11-02', adjusted: true, entries: [{ productId: 1, name: 'x', system: -92, counted: 0, diff: 92, warehouseId: 'g1' }] }] as any;
  const res = diagnoseOversoldGodowns({ products, warehouses, inventoryBatches: batches, bills, audits });
  assert.equal(res.filter((r) => r.productId === 1).length, 0);
});

test('single-godown setups never report oversold godowns', () => {
  const res = diagnoseOversoldGodowns({ products, warehouses: [warehouses[0]], inventoryBatches: batches, bills: [bill(1, 'g1', [{ productId: 1, qty: 500 }])], audits: [] });
  assert.deepEqual(res, []);
});

test('unallocated bill with blank warehouseId uses its trip godown (matched via trip.billIds) instead of product fallback', () => {
  const prods = [{ id: 1, name: 'Campa', warehouseId: 'g2', opening: 0 }] as any;
  const bats = [inv('b_g1', 1, 'g1', 0), inv('b_g2', 1, 'g2', 10)];
  // Older bill: no warehouseId, no tripId, no batchAllocations, but listed in trip #5 loaded from g1
  const oldTripBill = { id: 169, retailer: 'Dibya Sweets', date: '2026-09-17', warehouseId: undefined, items: [{ productId: 1, qty: 2 }] } as any;
  const trips = [{ id: 5, warehouseId: 'g1', billIds: [169], warehouseLoads: { g1: { 1: 15 } } }] as any;
  const res = diagnoseOversoldGodowns({ products: prods, warehouses, inventoryBatches: bats, bills: [oldTripBill], audits: [], trips });
  assert.equal(res.length, 1);
  assert.equal(res[0].warehouseId, 'g1');
  assert.equal(res[0].bookBalance, -2);
  assert.equal(res[0].bills[0].billId, 169);
  assert.equal(res[0].bills[0].tripId, 5);
  assert.equal(res[0].targets.find((t) => t.warehouseId === 'g2')?.bookBalance, 10);
});

test('clearing one oversold godown via an oversold_adjust audit leaves every other balance unchanged', () => {
  const bills = [
    bill(1, 'g1', [{ productId: 1, qty: 192 }]),
    bill(2, 'g1', [{ productId: 2, qty: 15 }]),
  ];
  const base = { products, warehouses, inventoryBatches: batches, bills };
  const before = diagnoseOversoldGodowns({ ...base, audits: [] });
  assert.deepEqual(before.map((r) => `${r.productId}|${r.warehouseId}|${r.bookBalance}`).sort(), ['1|g1|-92', '2|g1|-5']);

  // Same entry shape the inspector posts: system = negative book balance, counted 0, diff = +shortfall.
  const audits = [{ id: 1, date: '2026-11-17', adjusted: true, entries: [{ productId: 1, name: 'Aqua 1L', system: -92, counted: 0, diff: 92, warehouseId: 'g1', kind: 'oversold_adjust', reason: 'Other' }] }] as any;
  const after = diagnoseOversoldGodowns({ ...base, audits });
  assert.deepEqual(after.map((r) => `${r.productId}|${r.warehouseId}|${r.bookBalance}`), ['2|g1|-5']); // product 2 untouched
  // G2 stock of product 1 is still exactly 128 (shown as a target of product 2's godown list)
  assert.equal(after[0].targets.find((t) => t.warehouseId === 'g2')?.availableCases, 0);
  const aquaTargets = diagnoseOversoldGodowns({ ...base, bills: [bill(1, 'g1', [{ productId: 1, qty: 192 }])], audits: [] })[0].targets;
  assert.equal(aquaTargets.find((t) => t.warehouseId === 'g2')?.availableCases, 128);
});

// ---- ALL products x ALL godowns: randomized invariants (seeded, so failures are reproducible) ----
import { buildOversoldClearAudits } from '../src/utils/oversoldDiagnostic';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

for (const seed of [1, 7, 42, 2026, 99991]) {
  test(`all products: detection, bill totals and safe clear hold for random data (seed ${seed})`, () => {
    const r = rng(seed);
    const ri = (n: number) => Math.floor(r() * n);
    const whs = Array.from({ length: 4 }, (_, i) => ({ id: `w${i}`, name: `G${i}`, isDefault: i === 0 })) as any;
    const prods = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, warehouseId: `w${ri(4)}`, opening: 0 })) as any;
    const bats: any[] = [];
    for (const p of prods) for (const w of whs) if (r() < 0.6) for (let k = 0; k < 1 + ri(2); k++) bats.push({ id: `b${p.id}${w.id}${k}`, productId: p.id, warehouseId: w.id, quantity: ri(60), batchNumber: `B${k}`, expiryDate: '2027-01-01' });
    const bills: any[] = [];
    for (let i = 1; i <= 120; i++) {
      const items = Array.from({ length: 1 + ri(3) }, () => {
        const p = prods[ri(prods.length)];
        const own = bats.filter((b) => b.productId === p.id);
        const qty = 1 + ri(40);
        const it: any = { productId: p.id, qty };
        if (own.length && r() < 0.5) {
          const b = own[ri(own.length)];
          it.batchAllocations = [{ batchId: b.id, batchNumber: b.batchNumber, qty: Math.min(qty, 1 + ri(qty)) }];
        }
        return it;
      });
      bills.push(bill(i, r() < 0.8 ? `w${ri(4)}` : undefined, items));
    }
    const audits: any[] = [{ id: 1, date: '2026-11-01', adjusted: true, entries: prods.slice(0, 10).map((p: any) => ({ productId: p.id, name: p.name, system: 0, counted: 0, diff: ri(20) - 10, warehouseId: `w${ri(4)}` })) }];
    const base = { products: prods, warehouses: whs, inventoryBatches: bats, bills };

    // independent balance (no returns/dispositions in this data): inward + audit adj - sold
    const balance = (auds: any[]) => {
      const m: Record<string, number> = {};
      for (const p of prods) {
        const hasB = bats.some((b) => b.productId === p.id);
        for (const w of whs) m[`${p.id}|${w.id}`] = hasB ? bats.filter((b) => b.productId === p.id && b.warehouseId === w.id).reduce((s, b) => s + b.quantity, 0) : p.warehouseId === w.id ? 0 : 0;
      }
      for (const a of auds) for (const e of a.entries) m[`${e.productId}|${e.warehouseId}`] += e.diff;
      const bwh = new Map(bats.map((b) => [b.id, b.warehouseId]));
      for (const b of bills) for (const it of b.items) {
        const p = prods.find((x: any) => x.id === it.productId);
        const fb = whs.some((w: any) => w.id === p.warehouseId) ? p.warehouseId : 'w0';
        let left = it.qty;
        for (const a of it.batchAllocations || []) { const t = Math.min(left, a.qty); m[`${it.productId}|${bwh.get(a.batchId)}`] -= t; left -= t; }
        if (left > 0) m[`${it.productId}|${whs.some((w: any) => w.id === b.warehouseId) ? b.warehouseId : fb}`] -= left;
      }
      return m;
    };

    const res = diagnoseOversoldGodowns({ ...base, audits });
    const expected = balance(audits);
    const expectedNeg = Object.keys(expected).filter((k) => expected[k] < 0).sort();
    assert.ok(expectedNeg.length > 0, 'scenario should contain oversold godowns');
    assert.deepEqual(res.map((x) => `${x.productId}|${x.warehouseId}`).sort(), expectedNeg);
    for (const x of res) {
      assert.equal(x.bookBalance, expected[`${x.productId}|${x.warehouseId}`]);
      assert.equal(x.bills.reduce((s, b) => s + b.qtyDeducted, 0), x.totalSoldCases); // every case is traced to a bill
    }

    // Clear ALL via the exact helper the button uses, then re-check everything.
    const posted = buildOversoldClearAudits(res, 'Other').map((a, i) => ({
      id: 100 + i, date: '2026-11-17', adjusted: true,
      entries: a.lines.map((l) => ({ productId: l.productId, name: '', system: l.system, counted: l.counted, diff: l.counted - l.system, warehouseId: a.warehouseId })),
    }));
    const after = diagnoseOversoldGodowns({ ...base, audits: [...audits, ...posted] });
    assert.deepEqual(after, []); // nothing oversold remains
    const afterBal = balance([...audits, ...posted]);
    for (const k of Object.keys(expected)) {
      assert.equal(afterBal[k], expected[k] < 0 ? 0 : expected[k], `balance for ${k}`); // only negatives moved, to exactly 0
    }
  });
}

// ---- reassignBillsProductWarehouse ----
import { reassignBillsProductWarehouse, ReassignGuardError } from '../src/utils/oversoldDiagnostic';

const fullBill = (id: number, wh: string | undefined, qty: number, extra: any = {}) =>
  ({
    id, retailer: `R${id}`, date: '2026-11-01', tripId: 3, warehouseId: wh,
    subtotal: 1000, cgst: 90, sgst: 90, total: 1180, amountPaid: 500, discount: 10, customerId: 'c1',
    paymentMode: 'cash', paymentDate: '2026-11-02', returns: [],
    items: [{ productId: 1, qty, rate: 10, amount: 100, costExGst: 7.5, batchNumber: 'OLD', expiryDate: '2026-01-01', cgst: 9, sgst: 9 }, { productId: 2, qty: 1 }],
    ...extra,
  }) as any;

test('reassign moves only the batch link: totals, GST, dues, payments, cost stay identical, and the oversold balance clears', () => {
  const bills = [fullBill(1, 'g1', 70), fullBill(2, 'g1', 122)];
  const base = { products, warehouses, inventoryBatches: batches };
  const before = diagnoseOversoldGodowns({ ...base, bills, audits: [] }).find((r) => r.productId === 1)!;
  assert.equal(before.bookBalance, -92);

  const res = reassignBillsProductWarehouse({ bills, billIds: [2], productId: 1, fromWarehouseId: 'g1', toWarehouseId: 'g2', ...base });
  assert.equal(res.movedCases, 122);
  const nb = res.updatedBills.find((b) => b.id === 2)!;
  const ob = bills[1];
  for (const k of ['total', 'subtotal', 'cgst', 'sgst', 'amountPaid', 'discount', 'paymentMode', 'paymentDate', 'customerId', 'warehouseId', 'tripId', 'retailer']) {
    assert.equal((nb as any)[k], (ob as any)[k], k);
  }
  assert.deepEqual(nb.returns, ob.returns);
  const it = nb.items[0] as any;
  assert.equal(it.costExGst, 7.5); // frozen cost untouched
  assert.equal(it.batchNumber, 'OLD'); // invoice text untouched
  assert.equal(it.qty, 122);
  assert.equal(it.amount, 100);
  assert.deepEqual(nb.items[1], ob.items[1]); // other products on the bill untouched
  assert.deepEqual(it.batchAllocations, [{ batchId: 'p1g2', batchNumber: 'P1G2', expiryDate: '2027-01-01', qty: 122 }]);
  assert.strictEqual(res.updatedBills.find((b) => b.id === 1), bills[0]); // unselected bill is the same object

  const after = diagnoseOversoldGodowns({ ...base, bills: res.updatedBills, audits: [] });
  assert.equal(after.filter((r) => r.productId === 1).length, 0); // g1: 100 - 70 = +30

  // Real check on the target: moving 135 cs into a godown holding 128 makes THAT godown short by 7.
  const big = [fullBill(1, 'g1', 100), fullBill(2, 'g1', 135)];
  const moved = reassignBillsProductWarehouse({ bills: big, billIds: [2], productId: 1, fromWarehouseId: 'g1', toWarehouseId: 'g2', ...base });
  const neg = diagnoseOversoldGodowns({ ...base, bills: moved.updatedBills, audits: [] }).filter((r) => r.productId === 1);
  assert.deepEqual(neg.map((r) => `${r.warehouseId}|${r.bookBalance}`), ['g2|-7']);
});

test('reassign skips untagged bills (no shift warning), cancelled bills and locked bills', () => {
  const bills = [fullBill(1, undefined, 10), fullBill(2, 'g1', 10, { status: 'cancelled' }), fullBill(3, 'g1', 10)];
  const res = reassignBillsProductWarehouse({ bills, billIds: [1, 2, 3, 99], productId: 1, fromWarehouseId: 'g1', toWarehouseId: 'g2', products, warehouses, inventoryBatches: batches, lockedBillIds: [3] });
  assert.equal(res.changedBills.length, 0);
  assert.deepEqual(res.skipped.map((s) => s.billId).sort((a, b) => a - b), [1, 2, 3, 99]);
  assert.equal(res.updatedBills.every((b, i) => b === bills[i]), true);
});

test('reassign refuses when the target godown has no batch, and when source = target', () => {
  const bills = [fullBill(1, 'g1', 10)];
  const noBatch = batches.filter((b) => !(b.productId === 1 && b.warehouseId === 'g2'));
  assert.throws(() => reassignBillsProductWarehouse({ bills, billIds: [1], productId: 1, fromWarehouseId: 'g1', toWarehouseId: 'g2', products, warehouses, inventoryBatches: noBatch }), ReassignGuardError);
  assert.throws(() => reassignBillsProductWarehouse({ bills, billIds: [1], productId: 1, fromWarehouseId: 'g1', toWarehouseId: 'g1', products, warehouses, inventoryBatches: batches }), ReassignGuardError);
});

test('reassign keeps batch-traced and other-godown portions of a split line, and moves only the source portion', () => {
  const b = fullBill(5, 'g1', 20);
  (b.items[0] as any).batchAllocations = [
    { batchId: 'p1g1', batchNumber: 'P1G1', qty: 12 }, // 12 from G1 (will move)
    { batchId: 'p1g2', batchNumber: 'P1G2', qty: 3 }, // 3 already from G2 (stays)
  ]; // 5 cases unallocated -> charged to the bill's godown G1 (moves too)
  const res = reassignBillsProductWarehouse({ bills: [b], billIds: [5], productId: 1, fromWarehouseId: 'g1', toWarehouseId: 'g2', products, warehouses, inventoryBatches: batches });
  assert.equal(res.movedCases, 17);
  const allocs = (res.updatedBills[0].items[0] as any).batchAllocations;
  assert.equal(allocs.reduce((s: number, a: any) => s + a.qty, 0), 20);
  assert.deepEqual(allocs.map((a: any) => a.batchId), ['p1g2']);
});

test('reassign guard: nothing but batchAllocations ever differs (randomized, all products)', () => {
  const r = rng(77);
  const ri = (n: number) => Math.floor(r() * n);
  const bills: any[] = [];
  for (let i = 1; i <= 40; i++) {
    const wh = r() < 0.85 ? `g${1 + ri(2)}` : undefined;
    bills.push(fullBill(i, wh, 1 + ri(30)));
    bills[i - 1].items[0].productId = 1 + ri(3);
  }
  for (const pid of [1, 2, 3]) {
    for (const [from, to] of [['g1', 'g2'], ['g2', 'g1']]) {
      const hasTo = batches.some((b) => b.productId === pid && b.warehouseId === to);
      if (!hasTo) continue;
      const res = reassignBillsProductWarehouse({ bills, billIds: bills.map((b) => b.id), productId: pid, fromWarehouseId: from, toWarehouseId: to, products, warehouses, inventoryBatches: batches });
      for (const nb of res.changedBills) {
        const ob = bills.find((b) => b.id === nb.id);
        const strip = (x: any) => JSON.stringify({ ...x, items: x.items.map(({ batchAllocations, ...rest }: any) => rest) });
        assert.equal(strip(nb), strip(ob));
      }
    }
  }
});
