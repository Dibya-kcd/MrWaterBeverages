import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLandedCostBreakdown, calculateGrnLineMetrics, resolveItemCrateCost, resolveItemLandedCrateCost, setGstOnFreeCases } from '../src/utils/billing';
import { stockCrateCost, buildInwardSummary, gstinCheckChar } from '../src/tax';

const base = { qty: 10, unitPrice: 1000, schemeType: 'none' as const };

test('legacy CGST + SGST line is exactly as before (hand-checked: 10 x 1000 + 9% + 9%)', () => {
  const b = calculateLandedCostBreakdown({ ...base, cgstPercent: 9, sgstPercent: 9 });
  assert.equal(b.taxableAmount, 10000);
  assert.equal(b.cgstAmount, 900);
  assert.equal(b.sgstAmount, 900);
  assert.equal(b.taxAmount, 1800);
  assert.equal(b.lineTotal, 11800);
  assert.equal(b.igstAmount, 0, 'IGST is zero on a legacy line');
  assert.equal(b.gstPercent, 18);
});

test('inter-state line: IGST 18% replaces CGST + SGST, same payable amount', () => {
  const b = calculateLandedCostBreakdown({ ...base, cgstPercent: 0, sgstPercent: 0, igstPercent: 18 });
  assert.equal(b.cgstAmount, 0);
  assert.equal(b.sgstAmount, 0);
  assert.equal(b.igstAmount, 1800);
  assert.equal(b.taxAmount, 1800);
  assert.equal(b.lineTotal, 11800);
  assert.equal(b.gstPercent, 18);
  const m = calculateGrnLineMetrics({ ...base, cgstPercent: 0, sgstPercent: 0, igstPercent: 18 });
  assert.equal(m.igstAmount, 1800);
  assert.equal(m.taxAmount, 1800);
});

test('inter-state (IGST x) and intra-state (x/2 + x/2) cost exactly the same, with and without schemes', () => {
  let seed = 4242;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const schemes = ['none', 'b2g1', 'free_cases', 'discount_percent', 'discount_flat'] as const;
  for (const freeGst of [true, false]) {
    setGstOnFreeCases(freeGst);
    for (let i = 0; i < 500; i++) {
      const rate = [5, 12, 18, 28, 40][Math.floor(rnd() * 5)];
      const common: any = {
        qty: 1 + Math.floor(rnd() * 200), unitPrice: Math.round(rnd() * 100000) / 100, schemeType: schemes[Math.floor(rnd() * 5)],
        schemeBuyQty: 2, schemeFreeQty: 1, freeQty: Math.floor(rnd() * 10), discountPercent: 3, discountFlat: 12, inwardCostPerCrate: 7,
      };
      const intra: any = calculateLandedCostBreakdown({ ...common, cgstPercent: rate / 2, sgstPercent: rate / 2 });
      const inter: any = calculateLandedCostBreakdown({ ...common, cgstPercent: 0, sgstPercent: 0, igstPercent: rate });
      for (const k of ['taxableAmount', 'taxAmount', 'lineTotal', 'effectiveCostPerCrateExGst', 'effectiveCostPerCrateInclGst', 'landedCostPerCrate', 'landedCostPerCrateExGst', 'gstPercent']) {
        assert.ok(Math.abs(intra[k] - inter[k]) < 1e-9, `${k}: ${intra[k]} vs ${inter[k]} (freeGst=${freeGst}, ${JSON.stringify(common)})`);
      }
      assert.ok(Math.abs(intra.cgstAmount + intra.sgstAmount - inter.igstAmount) < 1e-9);
    }
  }
  setGstOnFreeCases(undefined);
});

test('cost resolvers read IGST from a saved line', () => {
  const line: any = { ...calculateLandedCostBreakdown({ ...base, cgstPercent: 0, sgstPercent: 0, igstPercent: 18 }), cgstPercent: 0, sgstPercent: 0, igstPercent: 18 };
  assert.equal(resolveItemCrateCost(line), 1000);
  assert.equal(resolveItemLandedCrateCost(line), 1180);
  // a saved line with no landed fields, only the tax split: ex-GST cost grossed up by the IGST rate
  const bare: any = { unitPrice: 1000, cgstPercent: 0, sgstPercent: 0, igstPercent: 18 };
  assert.equal(resolveItemLandedCrateCost(bare), 1180);
});

test('composition stock cost includes the IGST paid (no ITC): 1,00,000 + 18% IGST => 1,18,000', () => {
  const line: any = { ...calculateLandedCostBreakdown({ qty: 1, unitPrice: 100000, schemeType: 'none', cgstPercent: 0, sgstPercent: 0, igstPercent: 18 }), cgstPercent: 0, sgstPercent: 0, igstPercent: 18 };
  assert.equal(stockCrateCost(line, 'ex_gst'), 100000);
  assert.equal(stockCrateCost(line, 'incl_gst'), 118000);
});

test('GRN inward summary reports the IGST part of purchase tax', () => {
  const b14 = '21ABCDE1234F1Z';
  const grns: any[] = [
    { inwardDate: '2026-05-10', supplierGstin: '27PQRST5678K1Z' + gstinCheckChar('27PQRST5678K1Z'), totalTaxable: 100000, totalTax: 18000, items: [{ igstAmount: 18000 }] },
    { inwardDate: '2026-05-11', supplierGstin: b14 + gstinCheckChar(b14), totalTaxable: 50000, totalTax: 9000, items: [{ cgstAmount: 4500, sgstAmount: 4500 }] },
  ];
  const org: any = { gstEngineStartDate: '2026-04-01' };
  const s = buildInwardSummary(grns, org, '2026-27');
  assert.equal(s.igstPaid, 18000);
  assert.equal(s.totalTax, 27000);
});
