import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  getCachedOdiaName,
  resolveDisplayNameSync,
  translateManyToOdia,
  translateToOdia,
} from '../utils/odiaAutoTranslate';

type Named = { name?: string; nameOr?: string } | null | undefined;

/**
 * Returns the name to show for one product/customer.
 * When language is Odia: nameOr → cached translation → live translate → English.
 */
export function useAutoOdiaName(entity: Named): string {
  const { language } = useLanguage();
  const english = (entity?.name || '').trim();
  const manual = (entity?.nameOr || '').trim();

  const initial = resolveDisplayNameSync(entity, language);
  const [display, setDisplay] = useState(initial);

  useEffect(() => {
    setDisplay(resolveDisplayNameSync(entity, language));
    if (language !== 'or' || !english || manual) return;

    let cancelled = false;
    const cached = getCachedOdiaName(english);
    if (cached) {
      setDisplay(cached);
      return;
    }

    translateToOdia(english).then((odia) => {
      if (!cancelled && odia) setDisplay(odia);
    });
    return () => {
      cancelled = true;
    };
  }, [language, english, manual]);

  return display;
}

/**
 * For lists: pass all entities, get a stable Map of englishName → displayName.
 * Triggers background translation for any missing Odia names when language is Odia.
 */
export function useAutoOdiaNameMap(
  entities: Array<{ name?: string; nameOr?: string }>
): Map<string, string> {
  const { language } = useLanguage();
  const signature = useMemo(
    () =>
      entities
        .map((e) => `${(e.name || '').trim()}|${(e.nameOr || '').trim()}`)
        .join('\n'),
    [entities]
  );

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (language !== 'or') return;

    const needTranslate = entities
      .map((e) => (e.name || '').trim())
      .filter((n) => n && !entities.find((e) => e.name === n && e.nameOr?.trim()) && !getCachedOdiaName(n));

    if (needTranslate.length === 0) return;

    let cancelled = false;
    translateManyToOdia(needTranslate, 3).then(() => {
      if (!cancelled) setTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [language, signature]);

  return useMemo(() => {
    const map = new Map<string, string>();
    entities.forEach((e) => {
      const en = (e.name || '').trim();
      if (!en) return;
      map.set(en, resolveDisplayNameSync(e, language));
    });
    return map;
    // tick forces recompute after translations land
  }, [entities, language, signature, tick]);
}

/** Helper for map lookup with fallback */
export function nameFromMap(
  map: Map<string, string>,
  entity: { name?: string; nameOr?: string } | null | undefined,
  language: 'en' | 'or'
): string {
  if (!entity) return '';
  const en = (entity.name || '').trim();
  if (language !== 'or') return en;
  if (entity.nameOr?.trim()) return entity.nameOr.trim();
  return map.get(en) || en;
}
