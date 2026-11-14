/**
 * Effective-dated legal rule store. Every legal number the engine uses (rates, limits, thresholds, wording)
 * is a LegalRule row that an administrator can add or end-date. If no rule is effective on a date the engine
 * reports an error instead of silently falling back to a guess.
 */
import type { BusinessTaxProfile } from './types';

export type ReviewStatus = 'pending_ca_review' | 'ca_approved';

export interface LegalRule<V = unknown> {
  id: string;
  key: string;
  /** Optional narrowing, e.g. 'trader' for composition rates or 'IN-21' for a state e-way bill threshold. */
  scope?: string;
  value: V;
  effectiveFrom: string; // YYYY-MM-DD inclusive
  effectiveTo?: string | null; // YYYY-MM-DD inclusive; null/undefined = open ended
  /** Notification / section / rule that justifies the value. */
  reference: string;
  reviewStatus: ReviewStatus;
  active?: boolean;
  note?: string;
}

export class RuleNotFoundError extends Error {
  constructor(public key: string, public date: string, public scope?: string) {
    super(`No legal rule "${key}"${scope ? ` [${scope}]` : ''} is effective on ${date}`);
  }
}

export class RuleBook {
  constructor(private readonly rules: LegalRule[], public readonly version: string) {}

  all(): LegalRule[] {
    return [...this.rules];
  }

  /** Latest-starting active rule for key (+ exact scope when given) that covers `date`. */
  resolve<V = unknown>(key: string, date: string, scope?: string): LegalRule<V> | undefined {
    const hit = this.rules
      .filter(
        (r) =>
          r.key === key &&
          r.active !== false &&
          (scope === undefined ? r.scope === undefined : r.scope === scope) &&
          r.effectiveFrom <= date &&
          (!r.effectiveTo || date <= r.effectiveTo),
      )
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
    return hit as LegalRule<V> | undefined;
  }

  require<V = unknown>(key: string, date: string, scope?: string): LegalRule<V> {
    const r = this.resolve<V>(key, date, scope);
    if (!r) throw new RuleNotFoundError(key, date, scope);
    return r;
  }

  /** All active rules for a key on a date, any scope (used for RCM category lookup). */
  resolveAll<V = unknown>(key: string, date: string): LegalRule<V>[] {
    return this.rules.filter(
      (r) =>
        r.key === key &&
        r.active !== false &&
        r.effectiveFrom <= date &&
        (!r.effectiveTo || date <= r.effectiveTo),
    ) as LegalRule<V>[];
  }
}

/** Pick the registration profile that was in force on `date` (never today's profile for an old document). */
export function resolveBusinessProfile(
  history: BusinessTaxProfile[],
  date: string,
): BusinessTaxProfile | undefined {
  return history
    .filter((p) => p.effectiveFrom <= date && (!p.effectiveTo || date <= p.effectiveTo))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
}
