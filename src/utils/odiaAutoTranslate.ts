/**
 * Odia display names for products / customers (salesman view only).
 * Works fully offline: an explicit `nameOr` wins, otherwise the English name is written in Odia script
 * by `odiaTransliterate` (sound-alike, e.g. Purple → ପର୍ପଲ୍). No web translation is used any more, because
 * it turned brand names into words (Purple → "Bengal").
 */

import { getPhoneticOdia } from './displayName';
import type { NameKind } from './odiaTransliterate';

/** Odia name for one English string ('' when it cannot be converted). */
export async function translateToOdia(english: string, kind: NameKind = 'product'): Promise<string> {
  return getPhoneticOdia(english, kind) || (english || '').trim();
}

export async function translateManyToOdia(names: string[], _concurrency = 3, kind: NameKind = 'product'): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const n of [...new Set(names.map((x) => x.trim()).filter(Boolean))]) {
    result.set(n, getPhoneticOdia(n, kind) || n);
  }
  return result;
}

export function getCachedOdiaName(english: string | null | undefined): string | null {
  return english ? getPhoneticOdia(english) || null : null;
}

/** Best name for the UI: explicit nameOr → sound-alike Odia → English. */
export function resolveDisplayNameSync(
  entity: { name?: string; nameOr?: string } | null | undefined,
  language: 'en' | 'or',
  kind: NameKind = 'product'
): string {
  if (!entity) return '';
  const en = (entity.name || '').trim();
  if (language !== 'or') return en;
  const manual = (entity.nameOr || '').trim();
  if (manual) return manual;
  return getPhoneticOdia(en, kind) || en;
}
