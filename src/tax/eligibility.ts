/** Composition eligibility monitor. It only reports; it never changes registration or files anything. */
import { RuleBook } from './ruleBook';

export interface CompositionEligibilityInput {
  date: string;
  stateCode: string;
  /** Aggregate turnover (all GSTINs under the same PAN) of the preceding financial year. */
  precedingFyTurnover: number;
  /** Aggregate turnover so far in the current financial year. */
  currentFyTurnover: number;
  madeInterStateOutwardSupply: boolean;
  suppliesNonTaxableGoods?: boolean;
  suppliesNotifiedRestrictedGoods?: boolean; // e.g. ice cream / pan masala / tobacco manufacture
}

export interface CompositionEligibilityResult {
  status: 'eligible' | 'warning' | 'ineligible';
  limit?: number;
  usedPct?: number;
  messages: string[];
  ruleIds: string[];
}

export function checkCompositionEligibility(rb: RuleBook, i: CompositionEligibilityInput): CompositionEligibilityResult {
  const messages: string[] = [];
  const ruleIds: string[] = [];
  let status: CompositionEligibilityResult['status'] = 'eligible';
  const raise = (s: 'warning' | 'ineligible') => {
    if (s === 'ineligible' || status === 'eligible') status = s;
  };

  const special = rb.resolve<string[]>('composition.specialCategoryStates', i.date);
  if (special) ruleIds.push(special.id);
  const scope = special?.value.includes(i.stateCode) ? 'special_category' : 'general';
  const limitRule = rb.resolve<number>('composition.turnoverLimit', i.date, scope);
  const warnRule = rb.resolve<number>('composition.eligibilityWarningPct', i.date);
  if (warnRule) ruleIds.push(warnRule.id);
  if (!limitRule) {
    messages.push(`No turnover-limit rule effective on ${i.date}; ask the administrator to add one`);
    return { status: 'warning', messages, ruleIds };
  }
  ruleIds.push(limitRule.id);
  const limit = limitRule.value;
  const worst = Math.max(i.precedingFyTurnover, i.currentFyTurnover);
  const usedPct = limit > 0 ? Math.round((worst / limit) * 1000) / 10 : 0;

  if (i.precedingFyTurnover > limit) {
    raise('ineligible');
    messages.push(`Preceding-year aggregate turnover exceeds the ${limit} limit`);
  }
  if (i.currentFyTurnover > limit) {
    raise('ineligible');
    messages.push(`Current-year aggregate turnover has crossed the ${limit} limit: review the exit from composition with your CA`);
  } else if (warnRule && usedPct >= warnRule.value) {
    raise('warning');
    messages.push(`Turnover has used ${usedPct}% of the ${limit} limit`);
  }
  if (i.madeInterStateOutwardSupply) {
    raise('ineligible');
    messages.push('Inter-state outward supply made: not permitted under composition');
  }
  if (i.suppliesNonTaxableGoods) {
    raise('ineligible');
    messages.push('Supply of goods not leviable to GST: not permitted under composition');
  }
  if (i.suppliesNotifiedRestrictedGoods) {
    raise('ineligible');
    messages.push('Supply/manufacture of notified restricted goods: not permitted under composition');
  }
  return { status, limit, usedPct, messages, ruleIds };
}
