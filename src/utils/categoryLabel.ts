import { CATS } from '../constants/initialData';

const SHORT_CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  general: 'Drinks',
  energy: 'Energy',
  joos: 'Juice',
  vibe: 'Soda',
  water: 'Water',
};

/**
 * Compact 1-word label for horizontal filter chips so category pills stay crisp
 * and readable on narrow mobile screens without overlapping or truncating.
 */
export function shortCategoryLabel(catKey: string): string {
  const k = (catKey || '').trim().toLowerCase();
  if (!k || k === 'all') return 'All';
  if (SHORT_CATEGORY_LABELS[k]) return SHORT_CATEGORY_LABELS[k];
  const full = (CATS as Record<string, { name: string }>)[k]?.name || catKey;
  return full.split(/[/(]/)[0].trim() || full;
}
