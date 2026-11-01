/**
 * Beat rules shared by the app and the server.
 *
 * A beat is a delivery area the owner defines in Settings → Beats. A customer is linked to it by `beatId`
 * (renaming a beat never loses customers). The customer's `route` text is kept in step as the display name and as
 * a fallback for older records and for stores that drop unknown fields.
 */
import type { BeatRouteConfig } from "../types";

export type BeatLike = Pick<BeatRouteConfig, "id" | "name"> & Partial<Pick<BeatRouteConfig, "hub" | "stops" | "active" | "salesmanIds">>;
export interface CustomerBeatFields {
  id?: string;
  beatId?: string;
  route?: string;
  city?: string;
  address?: string;
  name?: string;
}

/** The five places the owner named first; the sixth is added in Settings. */
export const SUGGESTED_BEAT_NAMES = ["Kuchinda Town", "Keseibahal", "Jamankira", "Laida", "Kusumi"];

export const DEFAULT_BEAT_HUB = "Kuchinda";

export const normBeat = (s?: string | null): string =>
  String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function newBeatId(): string {
  return "beat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** The beat a customer belongs to: by id first, else by the beat name stored in `route`. */
export function beatOfCustomer<B extends BeatLike>(c: CustomerBeatFields | undefined | null, beats: B[]): B | undefined {
  if (!c) return undefined;
  if (c.beatId) {
    const byId = beats.find((b) => b.id === c.beatId);
    if (byId) return byId;
  }
  const key = normBeat(c.route);
  return key ? beats.find((b) => normBeat(b.name) === key) : undefined;
}

export const beatsForSalesman = <B extends BeatLike>(beats: B[], salesmanId?: string | null): B[] =>
  salesmanId ? beats.filter((b) => b.active !== false && (b.salesmanIds || []).includes(salesmanId)) : [];

/** True when the customer sits in one of these beats (used to decide what a salesman may see). */
export function customerInBeats<B extends BeatLike>(c: CustomerBeatFields, beats: B[]): boolean {
  const b = beatOfCustomer(c, beats);
  return !!b && beats.some((x) => x.id === b.id);
}

/** Suggest a beat from the customer's city / route / address text (a beat name or one of its stops appears in it). */
export function suggestBeat<B extends BeatLike>(c: CustomerBeatFields, beats: B[]): B | undefined {
  const text = " " + normBeat([c.city, c.route, c.address].filter(Boolean).join(" ")) + " ";
  if (text.trim() === "") return undefined;
  let best: { beat: B; len: number } | undefined;
  for (const b of beats) {
    if (b.active === false) continue;
    const terms = [b.name, ...(b.stops || []).map((s) => s.name)].map(normBeat).filter((t) => t.length >= 3);
    for (const t of terms) {
      if (text.includes(" " + t + " ") && (!best || t.length > best.len)) best = { beat: b, len: t.length };
    }
  }
  return best?.beat;
}

/** Places typed on customers (city / route) that match no beat yet, most common first: candidates for new beats. */
export function placesWithoutBeat<B extends BeatLike>(
  customers: CustomerBeatFields[],
  beats: B[],
): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const c of customers) {
    if (beatOfCustomer(c, beats)) continue;
    for (const raw of [c.route, c.city]) {
      const name = String(raw || "").trim();
      const key = normBeat(name);
      if (!key || key.length < 3) continue;
      if (beats.some((b) => normBeat(b.name) === key)) continue;
      const cur = counts.get(key);
      if (cur) cur.count++;
      else counts.set(key, { name, count: 1 });
      break; // count a customer once, under the first place that is filled in
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function findBeatNameClash<B extends BeatLike>(beats: B[], name: string, exceptId?: string): B | undefined {
  const key = normBeat(name);
  return key ? beats.find((b) => b.id !== exceptId && normBeat(b.name) === key) : undefined;
}
