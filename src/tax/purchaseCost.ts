/**
 * Stock cost basis for purchases (GRNs).
 *
 *  - Legacy / regular taxpayer: stock is costed EX-GST (input tax credit is claimed separately).
 *  - Composition / unregistered taxpayer: no ITC is possible, so GST paid to the supplier is part of the cost of goods.
 *
 * The basis is decided by the GRN's inward date vs the engine start date. GRNs dated before the start date, and every
 * business that has not switched the engine on, keep the exact legacy cost.
 */
import type { OrganizationProfile } from '../types';
import { resolveItemCrateCost, resolveItemLandedCrateCost } from '../utils/billing';
import { noOutputTax, resolveTaxRegime } from './appRegime';

export type CostBasis = 'ex_gst' | 'incl_gst';

export function costBasisFor(org: OrganizationProfile | undefined, inwardDate: string | undefined): CostBasis {
  if (!inwardDate) return 'ex_gst';
  return noOutputTax(resolveTaxRegime(org, inwardDate)) ? 'incl_gst' : 'ex_gst';
}

/**
 * Cost per crate to carry in stock. Under `incl_gst` the supplier's GST (as printed on the invoice line) is added;
 * a line with no recorded tax split is NOT given an assumed 18%: it keeps its ex-GST cost.
 */
export function stockCrateCost(
  item: {
    cgstPercent?: number | null;
    sgstPercent?: number | null;
    igstPercent?: number | null;
    [k: string]: any;
  },
  basis: CostBasis,
): number {
  const ex = resolveItemCrateCost(item);
  if (basis !== 'incl_gst') return ex;
  const hasSplit = item.cgstPercent != null && item.sgstPercent != null;
  const taxPct = (Number(item.cgstPercent) || 0) + (Number(item.sgstPercent) || 0) + (Number(item.igstPercent) || 0);
  if (!hasSplit || taxPct <= 0) return ex;
  const landed = resolveItemLandedCrateCost(item);
  return landed > 0 ? landed : Math.round(ex * (1 + taxPct / 100) * 100) / 100;
}
