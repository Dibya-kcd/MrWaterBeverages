/**
 * Auto-translate English product / customer names to Odia when the UI language is Odia.
 * - Uses free MyMemory API (en → or)
 * - Results cached in memory + localStorage (survives refresh)
 * - Offline / failed requests fall back to the original English name
 * - Prefer an explicit `nameOr` field when the user has set one
 */

const CACHE_KEY = 'mrwater_odia_name_cache_v1';
const MAX_CACHE_ENTRIES = 800;

type CacheMap = Record<string, string>;

let memoryCache: CacheMap = {};
let loaded = false;
const inflight = new Map<string, Promise<string>>();

function loadCache(): CacheMap {
  if (loaded) return memoryCache;
  loaded = true;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) memoryCache = { ...JSON.parse(raw) };
  } catch {
    memoryCache = {};
  }
  return memoryCache;
}

function saveCache() {
  try {
    const keys = Object.keys(memoryCache);
    if (keys.length > MAX_CACHE_ENTRIES) {
      // Drop oldest-ish entries (object key order)
      const trimmed: CacheMap = {};
      keys.slice(-MAX_CACHE_ENTRIES).forEach((k) => {
        trimmed[k] = memoryCache[k];
      });
      memoryCache = trimmed;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache));
  } catch {
    // quota / private mode
  }
}

function cacheKey(text: string): string {
  return text.trim().toLowerCase();
}

/** Sync: return cached Odia name if we already translated this string. */
export function getCachedOdiaName(english: string | null | undefined): string | null {
  if (!english || !english.trim()) return null;
  const c = loadCache()[cacheKey(english)];
  return c || null;
}

/**
 * Translate one English string to Odia.
 * Returns original text on failure so the UI never shows blank names.
 */
export async function translateToOdia(english: string): Promise<string> {
  const text = (english || '').trim();
  if (!text) return '';

  // Already Odia script? keep as-is
  if (/[\u0B00-\u0B7F]/.test(text) && !/[A-Za-z]{3,}/.test(text)) {
    return text;
  }

  const key = cacheKey(text);
  const cache = loadCache();
  if (cache[key]) return cache[key];

  const existing = inflight.get(key);
  if (existing) return existing;

  const job = (async () => {
    try {
      // MyMemory free endpoint — Odia language code is "or"
      const url =
        'https://api.mymemory.translated.net/get?q=' +
        encodeURIComponent(text.slice(0, 450)) +
        '&langpair=en|or';
      const res = await fetch(url);
      if (!res.ok) throw new Error('translate http ' + res.status);
      const data = await res.json();
      const translated =
        (data?.responseData?.translatedText as string | undefined)?.trim() || '';

      // Reject useless responses
      if (
        !translated ||
        translated.toUpperCase() === text.toUpperCase() ||
        /INVALID|ERROR|QUERY LENGTH/i.test(translated)
      ) {
        return text;
      }

      memoryCache[key] = translated;
      saveCache();
      return translated;
    } catch {
      return text;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
}

/** Translate many names with a small concurrency limit (avoids rate limits). */
export async function translateManyToOdia(
  names: string[],
  concurrency = 3
): Promise<Map<string, string>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const result = new Map<string, string>();
  let i = 0;

  async function worker() {
    while (i < unique.length) {
      const idx = i++;
      const name = unique[idx];
      const odia = await translateToOdia(name);
      result.set(name, odia);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));
  return result;
}

/**
 * Best display name for UI:
 * 1) explicit nameOr (user-entered)
 * 2) cached auto-translation
 * 3) English name
 */
export function resolveDisplayNameSync(
  entity: { name?: string; nameOr?: string } | null | undefined,
  language: 'en' | 'or'
): string {
  if (!entity) return '';
  const en = (entity.name || '').trim();
  if (language !== 'or') return en;
  const manual = (entity.nameOr || '').trim();
  if (manual) return manual;
  return getCachedOdiaName(en) || en;
}
