/**
 * Immutable tax snapshot stored with every finalised document. Old documents are NEVER recalculated; reports read
 * the snapshot. The checksum detects accidental edits (the database also blocks UPDATE/DELETE with a trigger).
 */
import type { TaxInput, TaxResult } from './types';

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** cyrb53: small non-cryptographic hash, enough for tamper-evidence of accidental changes. */
function hash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export interface TaxSnapshot {
  documentRef: string;
  businessId: string;
  registrationType: string;
  documentType: string;
  input: TaxInput;
  result: TaxResult;
  ruleVersion: string;
  createdAt: string;
  checksum: string;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

export function createSnapshot(documentRef: string, input: TaxInput, result: TaxResult, createdAt: string): TaxSnapshot {
  if (!result.ok || !result.documentType) throw new Error('Cannot snapshot a document that failed tax validation');
  const body = {
    documentRef, businessId: input.business.businessId, registrationType: input.business.registrationType,
    documentType: result.documentType, input: structuredClone(input), result: structuredClone(result),
    ruleVersion: result.ruleVersion, createdAt,
  };
  return deepFreeze({ ...body, checksum: hash(stable(body)) });
}

export function verifySnapshot(s: TaxSnapshot): boolean {
  const { checksum, ...body } = s;
  return hash(stable(body)) === checksum;
}
