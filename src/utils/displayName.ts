import type { LanguageCode } from '../i18n/translations';
import { transliterateToOdia, hasLatin, ODIA_RANGE, type NameKind } from './odiaTransliterate';

export type { NameKind };

/** Entity that may carry an optional Odia name. */
export type NamedEntity = {
  name: string;
  nameOr?: string;
  id?: string | number;
};

/**
 * Sound-alike Odia writing of an English name (Purple → ପର୍ପଲ୍). Always returns something for
 * Latin text, '' when the text is empty or already Odia.
 */
export function getPhoneticOdia(english: string, kind: NameKind = 'product'): string {
  const text = (english || '').trim();
  if (!text || ODIA_RANGE.test(text) && !hasLatin(text)) return '';
  const out = transliterateToOdia(text, kind);
  return out && out !== text ? out : '';
}

/**
 * Returns the best single display name for the current UI language.
 * - Odia mode: prefer `nameOr` when present, else fallback to phonetic or `name`
 * - English mode: always use `name`
 */
export function displayName(
  entity: NamedEntity | null | undefined,
  language: LanguageCode = 'en',
  kind: NameKind = 'product'
): string {
  if (!entity) return '';
  if (language === 'or') {
    if (entity.nameOr && entity.nameOr.trim()) {
      return entity.nameOr.trim();
    }
    const phonetic = getPhoneticOdia(entity.name, kind);
    if (phonetic) return phonetic;
  }
  return (entity.name || '').trim();
}

/**
 * Returns bilingual representation (primary english name + secondary Odia transliteration).
 */
export function displayBilingual(
  entity: NamedEntity | null | undefined,
  isOdia: boolean,
  kind: NameKind = 'product'
): { english: string; odia?: string } {
  if (!entity) return { english: '' };
  const english = (entity.name || '').trim();
  if (!isOdia) return { english };

  const odia = (entity.nameOr || '').trim() || getPhoneticOdia(english, kind);
  return {
    english,
    odia: odia && odia !== english ? odia : undefined,
  };
}

/**
 * Helper to find Odia name for a product by ID or name.
 */
export function getProductOdiaName(
  productIdOrName: number | string | null | undefined,
  products: Array<{ id?: number; name: string; nameOr?: string }>
): string {
  if (!productIdOrName && productIdOrName !== 0) return '';
  const match = products.find((p) => {
    if (typeof productIdOrName === 'number') {
      return p.id === productIdOrName;
    }
    return p.name.trim().toLowerCase() === String(productIdOrName).trim().toLowerCase();
  });
  if (match?.nameOr?.trim()) return match.nameOr.trim();
  return getPhoneticOdia(typeof productIdOrName === 'string' ? productIdOrName : (match?.name || ''));
}

/**
 * Helper to find Odia name for a customer by name or ID.
 */
export function getCustomerOdiaName(
  nameOrId: string | null | undefined,
  customers: Array<{ id?: string; name: string; nameOr?: string }>
): string {
  if (!nameOrId || !nameOrId.trim()) return '';
  const clean = nameOrId.trim().toLowerCase();
  const match = customers.find(
    (c) => (c.name && c.name.trim().toLowerCase() === clean) || (c.id && c.id.toLowerCase() === clean)
  );
  if (match?.nameOr?.trim()) return match.nameOr.trim();
  return getPhoneticOdia(nameOrId, 'person');
}

/**
 * Search haystack: always includes English name + Odia name so search works in both languages.
 */
export function searchHaystack(entity: NamedEntity | null | undefined): string {
  if (!entity) return '';
  return [entity.name, entity.nameOr, getPhoneticOdia(entity.name), getPhoneticOdia(entity.name, 'person')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
