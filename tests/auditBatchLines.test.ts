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
const qty = (lines: ReturnType<typeof buildProductBatchLines>, key: string) => lines.find((l) => l.key === key)?.availableQty;

test('batchLineKey ignores case and blank batch numbers', () => {
  assert.equal(batchLineKey('w1', 'ab12', '2026-12-01'), batchLineKey('w1', ' AB12 ', '2026-12-01'));
  assert.equal(batchLineKey('w1', '', ''), 'w1|(NO BATCH)|');
});

test('without a batch-level adjustment a godown shortage is taken off the oldest batch (FEFO)', () => {
  const lines = buildProductBatchLines(1, [A, B], wh, { w1: 18 });
  assert.equal(qty(lines, keyA), 8);
  assert.equal(qty(lines, keyB), 10);
});

test('a shortage counted in the newer batch stays on that batch', () => {
  const lines = buildProductBatchLines(1, [A, B], wh, { w1: 18 }, new Date(), {}, { [keyB]: -2 });
  assert.equal(qty(lines, keyA), 10);
  assert.equal(qty(lines, keyB), 8);
});

test('offsetting differences in two batches are both kept (total unchanged)', () => {
  const lines = buildProductBatchLines(1, [A, B], wh, { w1: 20 }, new Date(), {}, { [keyA]: -2, [keyB]: 2 });
  assert.equal(qty(lines, keyA), 8);
  assert.equal(qty(lines, keyB), 12);
});

test('found stock: a zero-quantity batch plus a positive audit difference shows the found crates', () => {
  const found = batch('c', 'NEW9', '2027-06-01', 0);
  const keyC = batchLineKey('w1', 'NEW9', '2027-06-01');
  const lines = buildProductBatchLines(1, [A, B, found], wh, { w1: 23 }, new Date(), {}, { [keyC]: 3 });
  assert.equal(qty(lines, keyA), 10);
  assert.equal(qty(lines, keyB), 10);
  assert.equal(qty(lines, keyC), 3);
});

test('batch lines always add up to the godown balance', () => {
  const lines = buildProductBatchLines(1, [A, B], wh, { w1: 15 }, new Date(), { a: 3 }, { [keyB]: -2 });
  assert.equal(lines.reduce((s, l) => s + l.availableQty, 0), 15);
});
