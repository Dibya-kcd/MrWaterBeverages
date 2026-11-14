import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompositionReport } from '../src/components/views/reports/CompositionReport';
import { gstinCheckChar, financialYear } from '../src/tax';

// The screen opens on the CURRENT financial year, so sample bills must fall inside it.
const fyStartYear = Number(financialYear(new Date().toISOString().slice(0, 10)).slice(0, 4));

const b14 = '21ABCDE1234F1Z';
const org: any = { name: 'Mr Water', gstin: b14 + gstinCheckChar(b14), stateCode: '21', gstRegistrationType: 'composition',
  compositionCategory: 'trader', gstEngineStartDate: '2025-04-01' };
const bill = (id: number, date: string, total: number): any => ({ id, date, total, subtotal: total, cgst: 0, sgst: 0, discount: 0,
  status: 'active', items: [{ productId: 1, amount: total, gst: 0.18 }],
  taxStamp: { registrationType: 'composition', documentType: 'bill_of_supply', ruleVersion: 'x', engineStartDate: '2025-04-01',
    compositionLiability: { base: total, cgst: total / 200, sgst: total / 200, total: total / 100 } } });

test('CompositionReport renders CMP-08 and GSTR-4 workings with the right figures', () => {
  const html = renderToStaticMarkup(
    <CompositionReport bills={[bill(1, `${fyStartYear}-05-10`, 100000), bill(2, `${fyStartYear}-05-11`, 50000)]} grns={[]} orgProfile={org} />,
  );
  assert.match(html, /CMP-08 working/);
  assert.match(html, /GSTR-4 working/);
  assert.match(html, /does not file GSTR-1 or GSTR-3B/);
  assert.match(html, /1,50,000\.00/, 'net turnover in Indian digit grouping');
  assert.match(html, /1,500\.00/, '1% of 1,50,000');
  assert.match(html, /Download CSV/);
});

test('CompositionReport renders safely with no bills and with a misconfigured profile', () => {
  const empty = renderToStaticMarkup(<CompositionReport bills={[]} grns={[]} orgProfile={org} />);
  assert.match(empty, /No composition-stamped bills/);
  const bad = renderToStaticMarkup(<CompositionReport bills={[]} grns={[]} orgProfile={{ ...org, compositionCategory: undefined }} />);
  assert.match(bad, /Composition category is not set/);
});
