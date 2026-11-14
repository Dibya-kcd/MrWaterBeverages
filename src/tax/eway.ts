/**
 * E-Way Bill rules (applicability, consignment value, cancellation) driven by effective-dated rules, plus a
 * guard that stops the app from ever claiming a bill was generated without confirmation from the authorised API.
 * The integration with a GSP / the NIC API itself is a separate adapter (Phase 7).
 */
import { RuleBook } from './ruleBook';
import type { TaxResult } from './types';

export interface EwayCheckInput {
  date: string;
  fromStateCode: string;
  toStateCode: string;
  consignmentValue: number;
  hsnCodes: string[];
  /** 'supply' | 'return' | 'job_work' | 'own_use' | other movement purpose. Informational for now. */
  purpose?: string;
}

export interface EwayCheckResult {
  required: boolean;
  thresholdUsed?: number;
  thresholdScope?: string;
  ruleIds: string[];
  reasons: string[];
  warnings: string[];
}

/** Value of consignment = invoice value including tax, excluding exempt supplies (Rule 138 explanation; CA to confirm). */
export const consignmentValue = (r: Pick<TaxResult, 'totals'>): number =>
  Math.round((Math.abs(r.totals.invoiceValue) - Math.abs(r.totals.exemptValue)) * 100) / 100;

export function checkEwayBillRequired(rb: RuleBook, i: EwayCheckInput): EwayCheckResult {
  const out: EwayCheckResult = { required: false, ruleIds: [], reasons: [], warnings: [] };
  const inter = i.fromStateCode !== i.toStateCode;

  const exempt = rb.resolve<string[]>('ewb.exemptHsnPrefixes', i.date);
  if (exempt) out.ruleIds.push(exempt.id);
  const prefixes = exempt?.value ?? [];
  if (
    prefixes.length &&
    i.hsnCodes.length &&
    i.hsnCodes.every((h) => prefixes.some((p) => String(h).startsWith(p)))
  ) {
    out.reasons.push('All goods are on the exempt list for e-way bills');
    return out;
  }

  const stateRule = inter ? undefined : rb.resolve<number>('ewb.threshold', i.date, `IN-${i.fromStateCode}`);
  const rule = stateRule ?? rb.resolve<number>('ewb.threshold', i.date, 'central');
  if (!rule) {
    out.warnings.push(`No e-way bill threshold rule is effective on ${i.date}; treat as REQUIRED until an administrator adds one`);
    out.required = true;
    return out;
  }
  out.ruleIds.push(rule.id);
  out.thresholdUsed = rule.value;
  out.thresholdScope = rule.scope;
  if (rule.reviewStatus !== 'ca_approved') out.warnings.push(`Rule ${rule.id} is pending CA review`);

  if (i.consignmentValue > rule.value) {
    out.required = true;
    out.reasons.push(`Consignment value ${i.consignmentValue} exceeds the ${inter ? 'inter-state' : 'intra-state'} threshold ${rule.value}`);
  } else {
    out.reasons.push(`Consignment value ${i.consignmentValue} does not exceed the threshold ${rule.value}`);
  }
  return out;
}

export interface EwayCancelInput {
  generatedAt: string; // ISO timestamp from the portal confirmation
  now: string; // ISO timestamp
  verifiedInTransit: boolean;
}

export function canCancelEwayBill(rb: RuleBook, i: EwayCancelInput): { allowed: boolean; reason: string } {
  if (i.verifiedInTransit) return { allowed: false, reason: 'Cannot cancel after the e-way bill was verified in transit' };
  const rule = rb.resolve<number>('ewb.cancellationWindowHours', i.generatedAt.slice(0, 10));
  if (!rule) return { allowed: false, reason: 'No cancellation-window rule is effective; cancel on the official portal' };
  const hours = (Date.parse(i.now) - Date.parse(i.generatedAt)) / 3_600_000;
  if (!(hours >= 0)) return { allowed: false, reason: 'Cancellation time is before generation time' };
  return hours <= rule.value
    ? { allowed: true, reason: `Within ${rule.value} hours of generation` }
    : { allowed: false, reason: `More than ${rule.value} hours since generation` };
}

export type EwayStatus = 'draft' | 'submitted' | 'generated' | 'cancelled' | 'rejected';

export interface EwayRecord {
  status: EwayStatus;
  ewbNo?: string;
  providerRef?: string;
  generatedAt?: string;
}

/** The ONLY way a record becomes 'generated': the provider must return a 12-digit number and a timestamp. */
export function markGenerated(rec: EwayRecord, resp: { ewbNo?: string; generatedAt?: string; providerRef?: string }): EwayRecord {
  if (!resp.ewbNo || !/^\d{12}$/.test(resp.ewbNo) || !resp.generatedAt)
    throw new Error('E-way bill not confirmed by the provider: refusing to mark as generated');
  return { ...rec, status: 'generated', ewbNo: resp.ewbNo, generatedAt: resp.generatedAt, providerRef: resp.providerRef };
}
