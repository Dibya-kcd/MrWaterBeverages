import test from 'node:test';
import assert from 'node:assert/strict';
import { batchLineKey, buildProductBatchLines } from '../src/utils/stockLocations';

const wh = [{ id: 'w1', name: 'Godown 1' }] as any;
const batch = (id: string, no: string, exp: string, qty: number) =>
  ({ id, productId: 1, batchNumber: no, expiryDate: exp, warehouseId: 'w1', quantity: qty }) as any;
const A = batch('a', 'A1', '2026-12-01', 10);
const B = batch('b', 'B1', '2027-03-01', 10);
const keyA = batchLineKey('w1', 'A1', '2026-12-01');
const keyB = batchLineKey('w1', 'B1', '2027-03-01');
const qty = (l: ReturnType<typeof buildProductBatchLines>, k: string) => l.find((x) => x.key === k)?.availableQty;
const total = (l: ReturnType<typeof buildProductBatchLines>) => l.reduce((s, x) => s + x.availableQty, 0);

test('audited batch stays locked when an unattributed legacy deficit exists', () => {
  // 3 crates sold with no batch trail (-3) and the newer batch B counted -2 (book 20-3-2 = 15)
  const lines = buildProductBatchLines(1, [A, B], wh, { w1: 15 }, new Date(), {}, { [keyB]: -2 });
  assert.equal(qty(lines, keyB), 8); // exactly what the audit said, untouched by FEFO
  assert.equal(qty(lines, keyA), 7); // the unattributed 3 came off the oldest batch
  assert.equal(total(lines), 15);
});

test('audited batch stays locked when an unattributed surplus exists', () => {
  // +4 unattributed surplus and batch A counted -1 (book 20+4-1 = 23)
  const lines = buildProductBatchLines(1, [A, B], wh, { w1: 23 }, new Date(), {}, { [keyA]: -1 });
  assert.equal(qty(lines, keyA), 9);
  assert.equal(qty(lines, keyB), 14); // surplus parks on the latest-expiry batch
  assert.equal(total(lines), 23);
});

test('a batch-level surplus is not spread to other batches', () => {
  const lines = buildProductBatchLines(1, [A, B], wh, { w1: 23 }, new Date(), {}, { [keyA]: 3 });
  assert.equal(qty(lines, keyA), 13);
  assert.equal(qty(lines, keyB), 10);
});

test('clamping at zero is rebalanced so lines still equal the godown balance', () => {
  const lines = buildProductBatchLines(1, [A, B], wh, { w1: 8 }, new Date(), {}, { [keyA]: -12 });
  assert.equal(qty(lines, keyA), 0);
  assert.equal(total(lines), 8);
});
