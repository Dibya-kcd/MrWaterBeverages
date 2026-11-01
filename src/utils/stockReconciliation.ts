/**
 * Smart Stock Reconciliation — matching engine.
 *
 * Pure, deterministic, and fully transparent: every score is a sum of named,
 * independently-inspectable factors (spec §5), and this module NEVER decides that a
 * variance IS a loss or IS a swap — it only ranks candidates and proposes matched
 * quantities. Confirmation always happens in LedgerContext, driven by an explicit user
 * action (spec §17).
 */
import {
  Product,
  VarianceEntry,
  VarianceClassification,
  SwapSuggestion,
  MatchScoreBreakdown,
} from '../types';

// ----------------------------------------------------------------
// Similarity scoring (spec §5)
// ----------------------------------------------------------------

const WEIGHTS = {
  barcode: 15, // exact match only — near-decisive but still not auto-applied
  brand: 25,
  packSize: 30, // pack + volume + unitsPerCrate together — the strongest FMCG-confusion signal
  category: 10,
  nameSimilarity: 15,
  mrp: 5,
} as const;

/** Cheap, dependency-free word-overlap similarity for product names (0..1). */
function nameSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s.]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const tok of setA) if (setB.has(tok)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

function inferredBrand(p: Pick<Product, 'brand' | 'name'>): string {
  if (p.brand && p.brand.trim()) return p.brand.trim().toLowerCase();
  // Fall back to the first word of the name — a reasonable proxy for FMCG brand lines
  // ("CAMPA POWER 150ML" / "CAMPA NEON 150ML" both start with "CAMPA").
  return (p.name || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
}

/**
 * Scores how plausible it is that `candidate` is what `shortageProduct` was actually
 * counted/sold as. Returns a transparent breakdown, never just a bare number.
 */
export function scoreProductMatch(shortageProduct: Product, candidate: Product): { score: number; breakdown: MatchScoreBreakdown[] } {
  const breakdown: MatchScoreBreakdown[] = [];

  // Barcode — exact match only, per spec §5.
  const barcodeMatch = !!shortageProduct.barcode && !!candidate.barcode && shortageProduct.barcode === candidate.barcode;
  breakdown.push({
    factor: 'barcode',
    weight: WEIGHTS.barcode,
    awarded: barcodeMatch ? WEIGHTS.barcode : 0,
    note: barcodeMatch ? `Exact barcode match (${shortageProduct.barcode})` : 'No barcode match',
  });

  const brandA = inferredBrand(shortageProduct);
  const brandB = inferredBrand(candidate);
  const brandMatch = !!brandA && brandA === brandB;
  breakdown.push({
    factor: 'brand',
    weight: WEIGHTS.brand,
    awarded: brandMatch ? WEIGHTS.brand : 0,
    note: brandMatch ? `Same brand: ${brandA}` : 'Different brand (or brand unknown)',
  });

  const samePack = (shortageProduct.pack || '').trim().toLowerCase() === (candidate.pack || '').trim().toLowerCase();
  const sameVolume = Number(shortageProduct.volume) === Number(candidate.volume);
  const sameUnitsPerCrate =
    shortageProduct.unitsPerCrate != null &&
    candidate.unitsPerCrate != null &&
    Number(shortageProduct.unitsPerCrate) === Number(candidate.unitsPerCrate);
  let packAwarded = 0;
  const packNotes: string[] = [];
  if (samePack) {
    packAwarded += WEIGHTS.packSize * 0.4;
    packNotes.push(`same pack (${shortageProduct.pack})`);
  }
  if (sameVolume) {
    packAwarded += WEIGHTS.packSize * 0.4;
    packNotes.push(`same volume (${shortageProduct.volume}ml)`);
  }
  if (sameUnitsPerCrate) {
    packAwarded += WEIGHTS.packSize * 0.2;
    packNotes.push(`same case config (${shortageProduct.unitsPerCrate}/crate)`);
  }
  breakdown.push({
    factor: 'pack_size',
    weight: WEIGHTS.packSize,
    awarded: Math.round(packAwarded),
    note: packNotes.length > 0 ? `Matches on ${packNotes.join(', ')}` : 'Different pack/volume/case config',
  });

  const sameCategory = shortageProduct.category === candidate.category;
  breakdown.push({
    factor: 'category',
    weight: WEIGHTS.category,
    awarded: sameCategory ? WEIGHTS.category : 0,
    note: sameCategory ? `Same category (${shortageProduct.category})` : 'Different category',
  });

  const nameSim = nameSimilarity(shortageProduct.name, candidate.name);
  const nameAwarded = Math.round(nameSim * WEIGHTS.nameSimilarity);
  breakdown.push({
    factor: 'name_similarity',
    weight: WEIGHTS.nameSimilarity,
    awarded: nameAwarded,
    note: `Name overlap ${(nameSim * 100).toFixed(0)}% ("${shortageProduct.name}" vs "${candidate.name}")`,
  });

  const sameMrp = Number(shortageProduct.retail) > 0 && Number(shortageProduct.retail) === Number(candidate.retail);
  breakdown.push({
    factor: 'mrp',
    weight: WEIGHTS.mrp,
    awarded: sameMrp ? WEIGHTS.mrp : 0,
    note: sameMrp ? `Same MRP (₹${shortageProduct.retail})` : 'Different MRP',
  });

  const score = Math.min(100, Math.round(breakdown.reduce((s, b) => s + b.awarded, 0)));
  return { score, breakdown };
}

// ----------------------------------------------------------------
// Suggestion generation for one shortage against every excess in the same session
// ----------------------------------------------------------------

const MIN_SUGGESTION_SCORE = 35; // below this, a "match" is just noise — don't show it

export function findSwapSuggestions(params: {
  shortageEntry: VarianceEntry;
  allEntries: VarianceEntry[];
  products: Product[];
}): SwapSuggestion[] {
  const { shortageEntry, allEntries, products } = params;
  if (shortageEntry.variance >= 0) return [];
  const shortageProduct = products.find((p) => p.id === shortageEntry.productId);
  if (!shortageProduct) return [];

  const shortageQty = Math.abs(shortageEntry.variance);

  const candidates = allEntries.filter(
    (e) => e.productId !== shortageEntry.productId && e.variance > 0 && e.decisionStatus === 'pending'
  );

  const suggestions: SwapSuggestion[] = [];
  for (const candidateEntry of candidates) {
    const candidateProduct = products.find((p) => p.id === candidateEntry.productId);
    if (!candidateProduct) continue;
    const { score, breakdown } = scoreProductMatch(shortageProduct, candidateProduct);
    if (score < MIN_SUGGESTION_SCORE) continue;
    const matchedQuantity = Math.min(shortageQty, candidateEntry.variance);
    suggestions.push({
      candidateProductId: candidateEntry.productId,
      candidateProductName: candidateEntry.productName,
      candidateVariance: candidateEntry.variance,
      matchedQuantity,
      score,
      breakdown,
      explanation: `${matchedQuantity} unit${matchedQuantity === 1 ? '' : 's'} of ${candidateEntry.productName} may have been recorded/sold as ${shortageEntry.productName}.`,
    });
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

// ----------------------------------------------------------------
// Partial / many-to-many matching (spec §4): POWER -20 -> NEON +15 + LEMON +5
// ----------------------------------------------------------------

export interface PartialMatchAllocation {
  candidateProductId: number;
  candidateProductName: string;
  quantity: number;
  score: number;
}

/**
 * Greedily allocates a shortage across its ranked candidates until the shortage is
 * covered or candidates run out. This is a suggestion only (spec §4 — "do not
 * automatically apply this"): it's presented as a proposed split for the auditor to
 * accept, adjust, or reject line by line.
 */
export function suggestPartialMatch(params: {
  shortageEntry: VarianceEntry;
  allEntries: VarianceEntry[];
  products: Product[];
}): PartialMatchAllocation[] {
  const suggestions = findSwapSuggestions(params);
  let remaining = Math.abs(params.shortageEntry.variance);
  const allocations: PartialMatchAllocation[] = [];
  for (const s of suggestions) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, s.candidateVariance);
    if (take <= 0) continue;
    allocations.push({
      candidateProductId: s.candidateProductId,
      candidateProductName: s.candidateProductName,
      quantity: take,
      score: s.score,
    });
    remaining -= take;
  }
  return allocations;
}

// ----------------------------------------------------------------
// Classification (spec §2) — advisory only, never mutates anything
// ----------------------------------------------------------------

export function classifyVariance(params: {
  variance: number;
  hasSuggestions: boolean;
}): VarianceClassification {
  if (params.variance === 0) return 'matched';
  if (params.variance < 0) return params.hasSuggestions ? 'possible_swap' : 'shortage';
  return params.hasSuggestions ? 'possible_swap' : 'excess';
}

// ----------------------------------------------------------------
// Session-level summary (spec §11 — Audit Dashboard)
// ----------------------------------------------------------------

export interface AuditDashboardSummary {
  totalSkusAudited: number;
  matched: number;
  shortage: number;
  excess: number;
  possibleSwaps: number;
  reconciled: number;
  unresolved: number;
  approvedAdjustments: number;
  totalShortageUnits: number;
  totalExcessUnits: number;
  possibleSubstitutionUnits: number;
  unexplainedVarianceUnits: number;
}

export function buildAuditDashboardSummary(entries: VarianceEntry[]): AuditDashboardSummary {
  const summary: AuditDashboardSummary = {
    totalSkusAudited: entries.length,
    matched: 0,
    shortage: 0,
    excess: 0,
    possibleSwaps: 0,
    reconciled: 0,
    unresolved: 0,
    approvedAdjustments: 0,
    totalShortageUnits: 0,
    totalExcessUnits: 0,
    possibleSubstitutionUnits: 0,
    unexplainedVarianceUnits: 0,
  };

  for (const e of entries) {
    if (e.variance < 0) summary.totalShortageUnits += Math.abs(e.variance);
    if (e.variance > 0) summary.totalExcessUnits += e.variance;

    switch (e.classification) {
      case 'matched':
        summary.matched++;
        break;
      case 'shortage':
        summary.shortage++;
        break;
      case 'excess':
        summary.excess++;
        break;
      case 'possible_swap':
        summary.possibleSwaps++;
        if (e.decisionStatus === 'swap_confirmed' || e.decisionStatus === 'applied') {
          summary.possibleSubstitutionUnits += Math.abs(e.variance);
        }
        break;
      case 'unexplained':
      case 'under_investigation':
        summary.unresolved++;
        summary.unexplainedVarianceUnits += Math.abs(e.variance);
        break;
      case 'reconciled':
        summary.reconciled++;
        break;
      case 'approved_adjustment':
        summary.approvedAdjustments++;
        break;
    }
  }

  return summary;
}
