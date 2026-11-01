/**
 * Scheme / promotions pricing engine for billing integration.
 *
 * - previewPricing(): client-side, debounced; never blocks typing.
 * - Re-run at commit (server/finalize) and reject if totals diverge beyond rounding.
 * - Free lines are separate BillItems (isFree / isBundleFreeItem), price 0, locked.
 * - Does not deduct stock; caller uses existing allocateBatches path with is_free lines.
 */

import type {
  BillItem,
  Product,
  Promotion,
  PriceType,
  SchemeApplicationSnapshot,
  SchemeNearMiss,
  CategoryKey,
} from '../types';
import { computeLine, evaluateBundlePromotion, schemeLabel, resolveProductGstRate, resolveProductHsn } from './billing';
import { todayISO } from "./dateLocal";

export interface PreviewPricingContext {
  customerName?: string;
  customerPhone?: string;
  /** YYYY-MM-DD bill date for date-window checks */
  billDate?: string;
  priceType?: PriceType;
  /** Scheme IDs staff removed from this bill (override). */
  overriddenSchemeIds?: number[];
  overrideReasons?: Record<number, string>;
  /** Existing bills for per-customer limit checks (optional). */
  priorApplicationsForCustomer?: { schemeId: number; count: number }[];
  /** When false, engine is no-op (feature flag). */
  schemesEnabled?: boolean;
  autoApply?: boolean;
}

export interface LinePricingResult {
  key: string | number;
  productId: number;
  discountAmount: number;
  schemeName?: string;
  schemeId?: number;
  schemeVersion?: number;
  freeQtyOnLine: number;
  explanation?: string;
}

export interface FreeLineSpec {
  productId: number;
  productName: string;
  category: CategoryKey;
  qty: number;
  rate: number;
  gst: number;
  schemeId: number;
  schemeName: string;
  schemeVersion: number;
  hsn?: string;
}

export interface SkippedScheme {
  schemeId: number;
  schemeName: string;
  reason: string;
}

export interface PreviewPricingResult {
  lines: LinePricingResult[];
  freeLines: FreeLineSpec[];
  applications: SchemeApplicationSnapshot[];
  skipped: SkippedScheme[];
  nearMiss: SchemeNearMiss[];
  schemeDiscountTotal: number;
  gross: number;
  youSaved: number;
  explanations: string[];
  /** True when any applied scheme has disableManualDiscountWhenApplied. */
  blockManualDiscount: boolean;
}

function customerKey(name?: string, phone?: string): string {
  const n = (name || '').trim().toLowerCase();
  const p = (phone || '').replace(/\D/g, '');
  return p ? `${n}|${p}` : n;
}

function isSchemeInDateWindow(promo: Promotion, billDate?: string): boolean {
  if (!billDate) return true;
  const d = billDate.slice(0, 10);
  if (promo.startDate && d < promo.startDate.slice(0, 10)) return false;
  if (promo.endDate && d > promo.endDate.slice(0, 10)) return false;
  return true;
}

function isActiveScheme(promo: Promotion, billDate?: string): boolean {
  if (promo.isActive === false) return false;
  return isSchemeInDateWindow(promo, billDate);
}

function sortByPriority(promos: Promotion[]): Promotion[] {
  return [...promos].sort((a, b) => {
    const pa = Number(a.config?.priority) || 0;
    const pb = Number(b.config?.priority) || 0;
    if (pb !== pa) return pb - pa;
    return Number(b.id) - Number(a.id);
  });
}

function productMatchesPromo(promo: Promotion, productId: number): boolean {
  const ids = Array.isArray(promo.productIds) ? promo.productIds : [];
  if (ids.length === 0) return true;
  return ids.some((id) => Number(id) === Number(productId));
}

/**
 * Cart-level preview. Pure function — safe to call on every cart change (debounce outside).
 */
export function previewPricing(
  cartItems: BillItem[],
  promotions: Promotion[],
  products: Product[],
  ctx: PreviewPricingContext = {}
): PreviewPricingResult {
  const empty: PreviewPricingResult = {
    lines: [],
    freeLines: [],
    applications: [],
    skipped: [],
    nearMiss: [],
    schemeDiscountTotal: 0,
    gross: 0,
    youSaved: 0,
    explanations: [],
    blockManualDiscount: false,
  };

  if (ctx.schemesEnabled === false) {
    const gross = cartItems.reduce((s, it) => s + (Number(it.gross) || Number(it.qty) * Number(it.rate) || 0), 0);
    return { ...empty, gross, lines: cartItems.map((it) => ({
      key: it.key,
      productId: it.productId,
      discountAmount: Number(it.discount) || 0,
      freeQtyOnLine: Number(it.freeQty) || 0,
    })) };
  }

  const billDate = ctx.billDate || todayISO();
  const priceType: PriceType = ctx.priceType || 'Retail';
  const overridden = new Set(ctx.overriddenSchemeIds || []);
  const custKey = customerKey(ctx.customerName, ctx.customerPhone);
  const priorMap = new Map<number, number>();
  for (const p of ctx.priorApplicationsForCustomer || []) {
    priorMap.set(Number(p.schemeId), Number(p.count) || 0);
  }

  // Paid / editable lines only for qualification
  const regular = cartItems.filter((it) => !it.isFree && !it.isBundleFreeItem);
  const gross = regular.reduce(
    (s, it) => s + (Number(it.gross) || (Number(it.qty) || 0) * (Number(it.rate) || 0)),
    0
  );

  const active = sortByPriority(
    (promotions || []).filter((p) => isActiveScheme(p, billDate))
  );

  const lines: LinePricingResult[] = regular.map((it) => ({
    key: it.key,
    productId: it.productId,
    discountAmount: 0,
    freeQtyOnLine: 0,
  }));
  const freeLines: FreeLineSpec[] = [];
  const applications: SchemeApplicationSnapshot[] = [];
  const skipped: SkippedScheme[] = [];
  const nearMiss: SchemeNearMiss[] = [];
  const explanations: string[] = [];
  let schemeDiscountTotal = 0;
  let blockManualDiscount = false;
  let exclusiveTaken = false;

  const autoApply = ctx.autoApply !== false;

  for (const promo of active) {
    const version = Number(promo.version) || 1;
    const name = promo.name || `Scheme #${promo.id}`;

    if (overridden.has(Number(promo.id))) {
      skipped.push({
        schemeId: Number(promo.id),
        schemeName: name,
        reason: ctx.overrideReasons?.[Number(promo.id)] || 'Removed by staff (override)',
      });
      applications.push({
        id: `ov_${promo.id}_${Date.now()}`,
        schemeId: Number(promo.id),
        schemeVersion: version,
        schemeName: name,
        customerKey: custKey,
        discountAmount: 0,
        freeQty: 0,
        explanation: 'Overridden by staff',
        overridden: true,
        overrideReason: ctx.overrideReasons?.[Number(promo.id)] || '',
        status: 'overridden',
        fundedBy: promo.fundedBy || 'self',
        supplierSharePercent: Number(promo.supplierSharePercent) || 0,
      });
      continue;
    }

    if (exclusiveTaken && promo.config?.exclusive) {
      skipped.push({ schemeId: Number(promo.id), schemeName: name, reason: 'Another exclusive scheme already applied' });
      continue;
    }

    // Usage limits
    if (promo.usageLimit != null && Number(promo.usedCount || 0) >= Number(promo.usageLimit)) {
      skipped.push({ schemeId: Number(promo.id), schemeName: name, reason: 'Global usage limit reached' });
      continue;
    }
    if (promo.perCustomerLimit != null && custKey) {
      const used = priorMap.get(Number(promo.id)) || 0;
      if (used >= Number(promo.perCustomerLimit)) {
        skipped.push({ schemeId: Number(promo.id), schemeName: name, reason: 'Per-customer limit reached' });
        continue;
      }
    }

    if (!autoApply) {
      // Still compute near-miss for staff hints
      const nm = computeNearMiss(promo, regular, products, name);
      if (nm) nearMiss.push(nm);
      continue;
    }

    // --- Apply by type ---
    if (
      promo.type === 'bundle' ||
      promo.type === 'buy_x_get_different_free' ||
      promo.type === 'group_buy_n_get_m_free'
    ) {
      const result = evaluateBundlePromotion(promo, regular, products);
      if (!result.isQualified || result.freeCasesAwarded <= 0) {
        const nm = computeNearMiss(promo, regular, products, name);
        if (nm) nearMiss.push(nm);
        if (!result.isQualified) {
          skipped.push({
            schemeId: Number(promo.id),
            schemeName: name,
            reason: result.missingProductNames?.length
              ? `Missing: ${result.missingProductNames.join(', ')}`
              : `Need ${result.requiredCount} units/types (have ${result.qualifyingCount})`,
          });
        }
        continue;
      }

      const freeProd = result.defaultFreeProduct;
      if (!freeProd) {
        skipped.push({ schemeId: Number(promo.id), schemeName: name, reason: 'No free product available for reward' });
        continue;
      }

      const freeQty = result.freeCasesAwarded;
      const rate =
        priceType === 'Retail' ? Number(freeProd.retail) || 0 : Number(freeProd.wholesale) || 0;
      const cost = Number(freeProd.effectiveCost ?? freeProd.cost) || 0;
      freeLines.push({
        productId: Number(freeProd.id),
        productName: freeProd.name,
        category: freeProd.category,
        qty: freeQty,
        rate,
        gst: resolveProductGstRate(freeProd),
        schemeId: Number(promo.id),
        schemeName: name,
        schemeVersion: version,
        hsn: resolveProductHsn(freeProd),
      });

      const discountAmount = freeQty * rate;
      schemeDiscountTotal += discountAmount;
      const expl = `${name}: ${result.freeCasesAwarded} free case(s) of ${freeProd.name}`;
      explanations.push(expl);
      applications.push({
        id: `app_${promo.id}_${Date.now()}`,
        schemeId: Number(promo.id),
        schemeVersion: version,
        schemeName: name,
        customerKey: custKey,
        discountAmount,
        freeQty,
        freeProductId: Number(freeProd.id),
        freeProductName: freeProd.name,
        freeValueAtCost: freeQty * cost,
        explanation: expl,
        status: 'applied',
        fundedBy: promo.fundedBy || 'self',
        supplierSharePercent: Number(promo.supplierSharePercent) || 0,
      });
      if (promo.config?.disableManualDiscountWhenApplied) blockManualDiscount = true;
      if (promo.config?.exclusive) exclusiveTaken = true;
      continue;
    }

    // Line-level schemes (bogo / percent / flat) — apply to matching paid lines
    let appliedAny = false;
    for (let i = 0; i < regular.length; i++) {
      const it = regular[i];
      if (!productMatchesPromo(promo, it.productId)) continue;
      // Respect per-line override / skip
      if (it.schemeSkipped) continue;
      if (it.appliedPromo && Number(it.appliedPromo.id) !== Number(promo.id) && it.customPriceEdited) {
        // Staff locked a different promo on this line
        continue;
      }

      const prod = products.find((p) => Number(p.id) === Number(it.productId));
      if (!prod) continue;

      const qty = Number(it.qty) || 0;
      if (qty <= 0) continue;

      // Near-miss for BOGO before applying
      if (promo.type === 'bogo') {
        const buyQty = Math.max(1, Number(promo.buyQty) || 1);
        const rewardFree = Math.max(1, Number(promo.freeQty) || 1);
        const cycle = buyQty + rewardFree;
        if (qty > 0 && qty < cycle) {
          const needed = cycle - qty;
          nearMiss.push({
            schemeId: Number(promo.id),
            schemeName: name,
            message: `Add ${needed} more case(s) of ${it.productName} to unlock ${name}`,
            unitsNeeded: needed,
          });
        }
      }

      const forcedPromo =
        it.appliedPromo && Number(it.appliedPromo.id) === Number(promo.id) ? it.appliedPromo : promo;
      const computed = computeLine(prod, priceType, qty, forcedPromo, it.rate, it.discount);

      let disc = Number(computed.discount) || 0;
      if (promo.type === 'percent' && promo.config?.maxPercentCap != null) {
        const cap = Number(promo.config.maxPercentCap);
        if (cap > 0 && disc > cap) disc = cap;
      }

      if (disc <= 0 && (Number(computed.freeQty) || 0) <= 0) continue;

      lines[i] = {
        key: it.key,
        productId: it.productId,
        discountAmount: disc,
        schemeName: schemeLabel(promo, products) || name,
        schemeId: Number(promo.id),
        schemeVersion: version,
        freeQtyOnLine: Number(computed.freeQty) || 0,
        explanation: `${name} on ${it.productName}`,
      };
      schemeDiscountTotal += disc;
      appliedAny = true;

      // BOGO free is inclusive on the same line (not a separate free line)
      // If free product is different SKU, add free line
      if (
        promo.type === 'bogo' &&
        promo.freeProductId &&
        Number(promo.freeProductId) !== Number(it.productId) &&
        (Number(computed.freeQty) || 0) > 0
      ) {
        const freeProd = products.find((p) => Number(p.id) === Number(promo.freeProductId));
        if (freeProd) {
          const fq = Number(computed.freeQty) || 0;
          const rate =
            priceType === 'Retail' ? Number(freeProd.retail) || 0 : Number(freeProd.wholesale) || 0;
          freeLines.push({
            productId: Number(freeProd.id),
            productName: freeProd.name,
            category: freeProd.category,
            qty: fq,
            rate,
            gst: resolveProductGstRate(freeProd),
            schemeId: Number(promo.id),
            schemeName: name,
            schemeVersion: version,
            hsn: resolveProductHsn(freeProd),
          });
        }
      }
    }

    if (appliedAny) {
      const expl =
        promo.type === 'bogo'
          ? `${name}: Buy ${promo.buyQty} Get ${promo.freeQty} free`
          : promo.type === 'percent'
          ? `${name}: ${promo.percent}% off`
          : `${name}: ₹${promo.flatPerCase}/case off`;
      explanations.push(expl);
      applications.push({
        id: `app_${promo.id}_${Date.now()}`,
        schemeId: Number(promo.id),
        schemeVersion: version,
        schemeName: name,
        customerKey: custKey,
        discountAmount: lines
          .filter((l) => l.schemeId === Number(promo.id))
          .reduce((s, l) => s + l.discountAmount, 0),
        freeQty: lines
          .filter((l) => l.schemeId === Number(promo.id))
          .reduce((s, l) => s + l.freeQtyOnLine, 0),
        explanation: expl,
        status: 'applied',
        fundedBy: promo.fundedBy || 'self',
        supplierSharePercent: Number(promo.supplierSharePercent) || 0,
      });
      if (promo.config?.disableManualDiscountWhenApplied) blockManualDiscount = true;
      if (promo.config?.exclusive) exclusiveTaken = true;
    } else {
      const nm = computeNearMiss(promo, regular, products, name);
      if (nm) nearMiss.push(nm);
    }
  }

  // Merge free lines of same product+scheme
  const mergedFree = new Map<string, FreeLineSpec>();
  for (const fl of freeLines) {
    const k = `${fl.productId}:${fl.schemeId}`;
    const prev = mergedFree.get(k);
    if (prev) prev.qty += fl.qty;
    else mergedFree.set(k, { ...fl });
  }

  const youSaved = Math.round(schemeDiscountTotal * 100) / 100;

  return {
    lines,
    freeLines: Array.from(mergedFree.values()),
    applications,
    skipped,
    nearMiss,
    schemeDiscountTotal: youSaved,
    gross: Math.round(gross * 100) / 100,
    youSaved,
    explanations,
    blockManualDiscount,
  };
}

function computeNearMiss(
  promo: Promotion,
  items: BillItem[],
  products: Product[],
  name: string
): SchemeNearMiss | null {
  const threshold = Number(promo.config?.nearMissThreshold) || 1;

  if (promo.type === 'bogo') {
    const buyQty = Math.max(1, Number(promo.buyQty) || 1);
    const rewardFree = Math.max(1, Number(promo.freeQty) || 1);
    const cycle = buyQty + rewardFree;
    for (const it of items) {
      if (!productMatchesPromo(promo, it.productId)) continue;
      const qty = Number(it.qty) || 0;
      if (qty > 0 && qty < cycle && cycle - qty <= threshold + buyQty) {
        return {
          schemeId: Number(promo.id),
          schemeName: name,
          message: `Add ${cycle - qty} more of ${it.productName} for ${name}`,
          unitsNeeded: cycle - qty,
        };
      }
    }
  }

  if (
    promo.type === 'bundle' ||
    promo.type === 'buy_x_get_different_free' ||
    promo.type === 'group_buy_n_get_m_free'
  ) {
    const result = evaluateBundlePromotion(promo, items, products);
    if (!result.isQualified && result.qualifyingCount > 0) {
      const need = Math.max(0, result.requiredCount - result.qualifyingCount);
      if (need > 0 && need <= threshold + (promo.buyQty || 2)) {
        let msg = `Add ${need} more to unlock ${name}`;
        if (promo.type === 'buy_x_get_different_free') {
          const freeProd = result.defaultFreeProduct;
          msg = `Add ${need} more case(s) to get ${promo.freeQty || 1} free ${freeProd ? freeProd.name : 'case(s)'}`;
        } else if (promo.type === 'group_buy_n_get_m_free') {
          msg = `Add ${need} more case(s) from group to get ${promo.freeQty || 1} free`;
        } else {
          msg = `Add ${need} more product type(s) to unlock ${name}`;
        }
        return {
          schemeId: Number(promo.id),
          schemeName: name,
          message: msg,
          unitsNeeded: need,
        };
      }
    }
  }

  return null;
}

/**
 * Build locked free BillItems from free line specs (for cart display & save).
 */
export function freeSpecsToBillItems(
  specs: FreeLineSpec[],
  priceType: PriceType = 'Retail'
): BillItem[] {
  return specs.map((fl, idx) => ({
    key: `free_${fl.schemeId}_${fl.productId}_${idx}`,
    productId: fl.productId,
    productName: fl.productName,
    category: fl.category,
    gst: fl.gst,
    priceType,
    qty: fl.qty,
    rate: 0,
    gross: 0,
    freeQty: fl.qty,
    chargeableQty: 0,
    discount: fl.qty * fl.rate,
    amount: 0,
    promoLabel: `FREE – ${fl.schemeName}`,
    isBundleFreeItem: true,
    isFree: true,
    bundlePromoId: fl.schemeId,
    schemeId: fl.schemeId,
    schemeName: fl.schemeName,
    schemeVersion: fl.schemeVersion,
    discountAmount: fl.qty * fl.rate,
    hsn: fl.hsn,
  }));
}

/**
 * Apply line-level preview results onto cart items (non-free).
 * Free lines are appended separately via freeSpecsToBillItems.
 */
export function applyPreviewToItems(
  items: BillItem[],
  preview: PreviewPricingResult
): BillItem[] {
  const byKey = new Map(preview.lines.map((l) => [String(l.key), l]));
  return items
    .filter((it) => !it.isFree && !it.isBundleFreeItem)
    .map((it) => {
      const line = byKey.get(String(it.key));
      if (!line || (!line.discountAmount && !line.freeQtyOnLine)) {
        return {
          ...it,
          isFree: false,
          schemeId: undefined,
          schemeName: undefined,
          schemeVersion: undefined,
        };
      }
      const freeQty = line.freeQtyOnLine || 0;
      const chargeable = Math.max(0, (Number(it.qty) || 0) - freeQty);
      const rate = Number(it.rate) || 0;
      const gross = (Number(it.qty) || 0) * rate;
      const discount = line.discountAmount || 0;
      return {
        ...it,
        freeQty,
        chargeableQty: chargeable,
        discount,
        discountAmount: discount,
        amount: Math.max(0, gross - discount),
        promoLabel: line.schemeName || it.promoLabel,
        schemeId: line.schemeId,
        schemeName: line.schemeName,
        schemeVersion: line.schemeVersion,
        isFree: false,
      };
    });
}

/**
 * Compare client preview totals vs server recompute; allow ±0.05 rounding.
 */
export function totalsMatch(
  clientTotal: number,
  serverTotal: number,
  tolerance = 0.05
): boolean {
  return Math.abs(Number(clientTotal) - Number(serverTotal)) <= tolerance;
}

/**
 * Documented combination rule:
 * 1. Scheme discounts apply first (on gross / as defined by scheme type).
 * 2. Manual / special (additionalDiscount) applies on the net after schemes,
 *    unless disableManualDiscountWhenSchemeApplied is true and a scheme applied.
 */
export function combineDiscounts(params: {
  schemeDiscount: number;
  manualDiscount: number;
  blockManual: boolean;
}): { schemeDiscount: number; manualDiscount: number; totalDiscount: number } {
  const scheme = Math.max(0, Number(params.schemeDiscount) || 0);
  const manual = params.blockManual ? 0 : Math.max(0, Number(params.manualDiscount) || 0);
  return {
    schemeDiscount: scheme,
    manualDiscount: manual,
    totalDiscount: scheme + manual,
  };
}
