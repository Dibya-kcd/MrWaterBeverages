/**
 * One-time localStorage migration: the app used to prefix every key with "radhika_".
 * Copies each legacy key to its "mrwater_" name (never overwriting a newer value), then
 * removes the old key. Must be imported FIRST in main.tsx so nothing reads the old names.
 */
try {
  const legacy: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('radhika_')) legacy.push(k);
  }
  for (const k of legacy) {
    if (k === 'radhika_distribution_ledger') {
      localStorage.removeItem(k); // obsolete full-ledger snapshot, purged elsewhere too
      continue;
    }
    const next = 'mrwater_' + k.slice('radhika_'.length);
    if (localStorage.getItem(next) === null) {
      const v = localStorage.getItem(k);
      if (v !== null) localStorage.setItem(next, v);
    }
    localStorage.removeItem(k);
  }
} catch {
  /* storage unavailable (private mode) - nothing to migrate */
}
export {};
