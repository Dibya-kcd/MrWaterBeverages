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
    id: 'beat_kuchinda_town',
    name: 'Kuchinda Town',
    hub: 'Kuchinda',
    label: 'Kuchinda Town (Market & Town Centre)',
    active: true,
    stops: [{ name: 'Kuchinda Market', code: 'KCH' }],
  },
  {
    id: 'beat_kusumi',
    name: 'Kusumi/Kuntra',
    hub: 'Kuchinda',
    label: 'Kusumi/Kuntra Route',
    active: true,
    stops: [{ name: 'Kusumi', code: 'KSM' }, { name: 'Kuntra', code: 'KNT' }],
  },
  {
    id: 'beat_keseibahal',
    name: 'Keseibahal/Mahulpali',
    hub: 'Kuchinda',
    label: 'Keseibahal/Mahulpali Route',
    active: true,
    stops: [{ name: 'Keseibahal', code: 'KSB' }, { name: 'Mahulpali', code: 'MHP' }],
  },
  {
    id: 'beat_jamankira',
    name: 'Jamankira/Bhojpur/Rengalbeda',
    hub: 'Kuchinda',
    label: 'Jamankira/Bhojpur/Rengalbeda Route',
    active: true,
    stops: [{ name: 'Jamankira', code: 'JMK' }, { name: 'Bhojpur', code: 'BJP' }, { name: 'Rengalbeda', code: 'RGB' }],
  },
  {
    id: 'beat_laida',
    name: 'Laida/Fasimal/Subarnpali',
    hub: 'Kuchinda',
    label: 'Laida/Fasimal/Subarnpali Route',
    active: true,
    stops: [{ name: 'Laida', code: 'LDA' }, { name: 'Fasimal', code: 'FSM' }, { name: 'Subarnpali', code: 'SBP' }],
  },
  {
    id: 'beat_kolabira',
    name: 'Kolabira/Malidihi/Junani',
    hub: 'Kuchinda',
    label: 'Kolabira/Malidihi/Junani Route',
    active: true,
    stops: [{ name: 'Kolabira', code: 'KLB' }, { name: 'Malidihi', code: 'MDH' }, { name: 'Junani', code: 'JNN' }],
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
