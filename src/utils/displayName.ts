import type { LanguageCode } from '../i18n/translations';

/** Entity that may carry an optional Odia name. */
export type NamedEntity = {
  name: string;
  nameOr?: string;
};

/**
 * Returns the best display name for the current UI language.
 * - Odia mode: prefer `nameOr` when present, else fall back to `name`
 * - English mode: always use `name`
 */
export function displayName(
  entity: NamedEntity | null | undefined,
  language: LanguageCode = 'en'
): string {
  if (!entity) return '';
  if (language === 'or' && entity.nameOr && entity.nameOr.trim()) {
    return entity.nameOr.trim();
  }
  return (entity.name || '').trim();
}

/**
 * Search haystack: always includes English name + Odia name so search works in both languages.
 */
export function searchHaystack(entity: NamedEntity | null | undefined): string {
  if (!entity) return '';
  return [entity.name, entity.nameOr].filter(Boolean).join(' ').toLowerCase();
}
