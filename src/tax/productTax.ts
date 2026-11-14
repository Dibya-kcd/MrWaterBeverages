/** Effective-dated product tax classification, kept separate from the business registration / composition rate. */
import type { Taxability } from './types';

export interface ProductTaxProfile {
  productId: string | number;
  hsn: string;
  taxability: Taxability;
  gstRatePct: number;
  cessRatePct?: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export function resolveProductTax(
  profiles: ProductTaxProfile[],
  productId: string | number,
  date: string,
): ProductTaxProfile | undefined {
  return profiles
    .filter(
      (p) =>
        String(p.productId) === String(productId) &&
        p.effectiveFrom <= date &&
        (!p.effectiveTo || date <= p.effectiveTo),
    )
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
}
