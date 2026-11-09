/**
 * Text and icons shown on the landing page and the sign-in page.
 *
 * Two ways to change it:
 *  1. Settings > Login page (owner only). Saved on this device and applied straight away.
 *  2. Edit DEFAULT_LANDING below, to change it for everyone on the next deploy.
 *
 * The pages are shown before anyone signs in, so the saved copy lives in this browser's storage,
 * not in the database. "Copy JSON" / "Paste JSON" in the editor moves a copy to another device.
 */
import { useSyncExternalStore } from 'react';

export type FeatureIcon =
  | 'receipt' | 'package' | 'tag' | 'truck' | 'shield' | 'users'
  | 'chart' | 'wallet' | 'droplets' | 'bell' | 'phone' | 'cloud';

export const FEATURE_ICON_IDS: FeatureIcon[] = [
  'receipt', 'package', 'tag', 'truck', 'shield', 'users',
  'chart', 'wallet', 'droplets', 'bell', 'phone', 'cloud',
];

export interface LandingFeature {
  icon: FeatureIcon;
  title: string;
  desc: string;
}

export interface LandingContent {
  /** Empty = use the business name from Settings, else "Hydrate Hub". */
  brandName: string;
  badge: string;
  headlineLine1: string;
  headlineLine2: string;
  /** Last word(s) of the headline, shown in the accent colour. */
  headlineAccent: string;
  subtitle: string;
  features: LandingFeature[];
  signInButton: string;
  salesmanDemoButton: string;
  ownerDemoButton: string;
  footer: string;
  signInTitle: string;
  signInSubtitle: string;
  panelHeadline: string;
  panelPoints: string[];
}

export const DEFAULT_LANDING: LandingContent = {
  brandName: '',
  badge: 'Built for beverage distributors',
  headlineLine1: 'Every crate,',
  headlineLine2: 'every rupee,',
  headlineAccent: 'accounted.',
  subtitle:
    'Billing, stock, trips and collections for beverage wholesalers, from the supplier invoice to the last shop on the beat.',
  features: [
    { icon: 'receipt', title: 'GST & non-GST billing', desc: 'Tax invoice, bill of supply, CGST/SGST/IGST done for you.' },
    { icon: 'package', title: 'Batch & expiry stock', desc: 'FEFO picking and expiry alerts before stock goes bad.' },
    { icon: 'tag', title: 'Promotions & BOGO', desc: 'Group offers applied automatically at billing.' },
    { icon: 'truck', title: 'Trips & collections', desc: 'Load the van, sell on the route, settle at day end.' },
  ],
  signInButton: 'Sign in',
  salesmanDemoButton: 'See how the salesman app works',
  ownerDemoButton: 'Owner? See how the whole app works',
  footer: 'Route sales & cloud invoicing',
  signInTitle: 'Welcome back',
  signInSubtitle: 'Sign in to continue. The owner sets up staff accounts and roles.',
  panelHeadline: 'Your depot, in your pocket.',
  panelPoints: [
    'Bill in seconds, even offline on the route',
    'Know every crate, deposit and due amount',
    'Day-end settlement without the paperwork',
  ],
};

const KEY = 'hh_landing_content';
const EVENT = 'hh-landing-change';

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

/** Accepts anything (old save, pasted JSON) and returns a complete, safe LandingContent. */
export function normalizeLanding(raw: unknown): LandingContent {
  const d = DEFAULT_LANDING;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const feats = Array.isArray(r.features) ? r.features : d.features;
  const points = Array.isArray(r.panelPoints) ? r.panelPoints : d.panelPoints;
  return {
    brandName: str(r.brandName, d.brandName),
    badge: str(r.badge, d.badge),
    headlineLine1: str(r.headlineLine1, d.headlineLine1),
    headlineLine2: str(r.headlineLine2, d.headlineLine2),
    headlineAccent: str(r.headlineAccent, d.headlineAccent),
    subtitle: str(r.subtitle, d.subtitle),
    features: feats.slice(0, 6).map((f, i) => {
      const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
      const base = d.features[i] || d.features[0];
      const icon = FEATURE_ICON_IDS.includes(o.icon as FeatureIcon) ? (o.icon as FeatureIcon) : base.icon;
      return { icon, title: str(o.title, base.title), desc: str(o.desc, base.desc) };
    }),
    signInButton: str(r.signInButton, d.signInButton),
    salesmanDemoButton: str(r.salesmanDemoButton, d.salesmanDemoButton),
    ownerDemoButton: str(r.ownerDemoButton, d.ownerDemoButton),
    footer: str(r.footer, d.footer),
    signInTitle: str(r.signInTitle, d.signInTitle),
    signInSubtitle: str(r.signInSubtitle, d.signInSubtitle),
    panelHeadline: str(r.panelHeadline, d.panelHeadline),
    panelPoints: points.slice(0, 5).map((p) => (typeof p === 'string' ? p : '')),
  };
}

let cache: { raw: string | null; value: LandingContent } | null = null;

export function readLanding(): LandingContent {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable: defaults are used */
  }
  if (cache && cache.raw === raw) return cache.value; // stable reference for useSyncExternalStore
  let value = DEFAULT_LANDING;
  if (raw) {
    try {
      value = normalizeLanding(JSON.parse(raw));
    } catch {
      value = DEFAULT_LANDING;
    }
  }
  cache = { raw, value };
  return value;
}

export function writeLanding(content: LandingContent): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeLanding(content)));
  } catch {
    /* storage full or blocked: the change just won't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function resetLanding(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export const useLandingContent = (): LandingContent =>
  useSyncExternalStore(subscribe, readLanding, () => DEFAULT_LANDING);
