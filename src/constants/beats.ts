/**
 * Sales beat / delivery routes for MrWater distribution (Odisha).
 * Kuchinda = main hub (godown / base). Other places = market beat stops.
 */
export interface BeatStop {
  /** Market / village name */
  name: string;
  /** Optional short code for lists */
  code?: string;
}

export interface BeatRoute {
  id: string;
  /** Display name on trip / filters */
  name: string;
  /** Main hub / base (not a beat stop) */
  hub: string;
  /** Ordered market stops on the beat (excluding hub) */
  stops: BeatStop[];
  /** One-line label for dropdowns */
  label: string;
  /** Active for selection */
  active?: boolean;
  /** Salesmen who work this beat (set by the owner in Settings → Beats) */
  salesmanIds?: string[];
}

export const BEAT_ROUTES: BeatRoute[] = [
  {
    id: 'beat_kuchinda_main',
    name: 'Kuchinda Beat',
    hub: 'Kuchinda',
    label: 'Kuchinda hub → Jamankira · Keseibahal · Kusumi · Laida · Kolabira · Subarnpali',
    active: true,
    stops: [
      { name: 'Jamankira', code: 'JMK' },
      { name: 'Keseibahal', code: 'KSB' },
      { name: 'Kusumi', code: 'KSM' },
      { name: 'Laida', code: 'LDA' },
      { name: 'Kolabira', code: 'KLB' },
      { name: 'Subarnpali', code: 'SBP' },
    ],
  },
];

export function beatRouteById(id: string): BeatRoute | undefined {
  return BEAT_ROUTES.find((b) => b.id === id);
}

/** Market beat stop names only (excludes hub). */
export function allBeatStopNames(): string[] {
  const set = new Set<string>();
  for (const b of BEAT_ROUTES) {
    for (const s of b.stops) set.add(s.name);
  }
  return Array.from(set);
}

/** Hub names (e.g. Kuchinda). */
export function allHubNames(): string[] {
  return Array.from(new Set(BEAT_ROUTES.map((b) => b.hub).filter(Boolean)));
}

/** Hubs + beat stops — for city/market suggestions when tagging a customer. */
export function allMarketPlaceNames(): string[] {
  const set = new Set<string>();
  for (const b of BEAT_ROUTES) {
    if (b.hub) set.add(b.hub);
    for (const s of b.stops) set.add(s.name);
  }
  return Array.from(set);
}

export function formatBeatStops(route: BeatRoute): string {
  return route.stops.map((s) => s.name).join(' → ');
}

export function formatBeatWithHub(route: BeatRoute): string {
  return `${route.hub} (hub) → ${formatBeatStops(route)}`;
}

/** Dropdown label for a beat: "Name — hub X · A → B → C". */
export function beatLabel(b: Pick<BeatRoute, 'name' | 'hub' | 'stops'>): string {
  const stops = b.stops.map((s) => s.name).join(' → ');
  return `${b.name}${b.hub ? ` — hub ${b.hub}` : ''}${stops ? ` · ${stops}` : ''}`;
}
