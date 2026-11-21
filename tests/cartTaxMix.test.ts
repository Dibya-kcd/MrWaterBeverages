import test from 'node:test';
import assert from 'node:assert/strict';
import { cartTaxMix, isLineNonGst } from '../src/utils/invoiceCommon';
import type { Product } from '../src/types';

const products = [
  { id: 1, name: 'Campa', taxability: 'taxable' },
  { id: 2, name: 'TATA G', taxability: 'non_gst' },
] as unknown as Product[];

test('cartTaxMix: mixed, pure GST, pure Non-GST, and product-master switch', () => {
  assert.equal(cartTaxMix([{ productId: 1 }, { productId: 2 }], products).hasMixed, true);
  assert.equal(cartTaxMix([{ productId: 1 }], products).hasMixed, false);
  const pure = cartTaxMix([{ productId: 2 }], products);
  assert.equal(pure.allNonGst, true);
  assert.equal(pure.hasMixed, false);
  // line says taxable but the product master was switched to Non-GST -> still Non-GST
  assert.equal(isLineNonGst({ productId: 2, taxability: 'taxable' }, products), true);
  assert.equal(isLineNonGst({ productId: 1 }, products), false);
});
