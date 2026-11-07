import { useMemo } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { resolveDisplayNameSync } from '../utils/odiaAutoTranslate';
import type { NameKind } from '../utils/odiaTransliterate';

type Named = { name?: string; nameOr?: string } | null | undefined;

/** Name to show for one product / customer (Odia only in the salesman view when Odia is selected). */
export function useAutoOdiaName(entity: Named, kind: NameKind = 'product'): string {
  const { language } = useLanguage();
  return resolveDisplayNameSync(entity, language, kind);
}

/** englishName → display name for a whole list (products: kind "product", customers: kind "person"). */
export function useAutoOdiaNameMap(
  entities: Array<{ name?: string; nameOr?: string }>,
  kind: NameKind = 'product'
): Map<string, string> {
  const { language } = useLanguage();
  return useMemo(() => {
    const map = new Map<string, string>();
    if (language !== 'or') return map;
    entities.forEach((e) => {
      const en = (e.name || '').trim();
      if (en) map.set(en, resolveDisplayNameSync(e, language, kind));
    });
    return map;
  }, [entities, language, kind]);
}

/** Map lookup with fallback to the English name. */
export function nameFromMap(
  map: Map<string, string>,
  entity: { name?: string; nameOr?: string } | null | undefined,
  language: 'en' | 'or',
  kind: NameKind = 'product'
): string {
  if (!entity) return '';
  const en = (entity.name || '').trim();
  if (language !== 'or') return en;
  if (entity.nameOr?.trim()) return entity.nameOr.trim();
  return map.get(en) || resolveDisplayNameSync(entity, language, kind) || en;
}
