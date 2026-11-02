/**
 * Decides when an automatic cloud pull is worth doing.
 *
 * Why this exists: a full pull downloads ~25 database tables. It used to run every 25 seconds on every open device
 * (plus on every window focus and every tab message), which is what used up the Supabase free-plan egress.
 * Now an automatic check first asks a handful of tiny questions ("how many bills, and when was the newest one
 * changed?"). Everything is downloaded only when the answers changed, plus a safety pull every few minutes.
 *
 * This file is pure logic (no network, no browser APIs) so it can be unit tested. See tests/syncGate.test.ts.
 */

/** How often a visible tab asks "has anything changed?". */
export const POLL_INTERVAL_MS = 300_000;
/** Never run two checks closer together than this (window focus, tab switches and tab messages all ask). */
export const MIN_CHECK_GAP_MS = 20_000;
/** A full pull at least this often, even if nothing looks changed (catches anything the tiny check cannot see). */
export const SAFETY_FULL_PULL_MS = 15 * 60_000;
/** When the tiny check is unavailable (offline, or the database refuses it), fall back to a plain slow poll. */
export const FALLBACK_PULL_MS = 10 * 60_000;
/** After a full pull the app writes merged data back to the cloud; wait for that to land before taking the baseline. */
export const SETTLE_MS = 8_000;
/** Tab messages and storage events arrive in bursts: act once, a moment after the last one. */
export const EVENT_DEBOUNCE_MS = 3_000;
/** After this many "changed" pulls in a row, stop trusting the check for a while (something keeps rewriting data). */
export const MAX_CHANGED_STREAK = 3;

export interface GateState {
  /** When the last check (tiny questions) started. */
  lastCheckAt: number;
  /** When the last full pull finished successfully. */
  lastFullPullAt: number;
  /** What the cloud looked like right after our last full pull settled. null = no baseline yet. */
  baseline: string | null;
  /** True while we wait for our own write-backs to land before taking the baseline. */
  settling: boolean;
  /** How many full pulls in a row were triggered by "changed". */
  changedStreak: number;
}

export type GateReason =
  | "changed"
  | "safety"
  | "fallback"
  | "first"
  | "unchanged"
  | "settling"
  | "too-soon"
  | "streak-backoff"
  | "unknown-wait";

export interface GateDecision {
  pull: boolean;
  reason: GateReason;
}

export function createGateState(): GateState {
  return { lastCheckAt: 0, lastFullPullAt: 0, baseline: null, settling: false, changedStreak: 0 };
}

/** Cheap pre-check, before even sending the tiny questions. */
export function canCheckNow(state: GateState, now: number): boolean {
  return now - state.lastCheckAt >= MIN_CHECK_GAP_MS;
}

/**
 * @param probe what the cloud looks like now (from the tiny questions), or null if they could not be answered.
 */
export function decideAutoPull(state: GateState, probe: string | null, now: number): GateDecision {
  if (state.settling) return { pull: false, reason: "settling" };

  const sinceFull = now - state.lastFullPullAt;

  if (probe === null) {
    // No cheap check available: a plain, much slower poll keeps the devices in step.
    return sinceFull >= FALLBACK_PULL_MS ? { pull: true, reason: "fallback" } : { pull: false, reason: "unknown-wait" };
  }

  if (state.baseline === null) return { pull: true, reason: "first" };

  if (probe !== state.baseline) {
    if (state.changedStreak >= MAX_CHANGED_STREAK && sinceFull < SAFETY_FULL_PULL_MS) {
      return { pull: false, reason: "streak-backoff" };
    }
    return { pull: true, reason: "changed" };
  }

  if (sinceFull >= SAFETY_FULL_PULL_MS) return { pull: true, reason: "safety" };
  return { pull: false, reason: "unchanged" };
}

/** Call after the decision was acted on, so the streak guard knows what kind of pull this was. */
export function noteDecision(state: GateState, decision: GateDecision): void {
  if (!decision.pull) {
    if (decision.reason === "unchanged") state.changedStreak = 0;
    return;
  }
  state.changedStreak = decision.reason === "changed" ? state.changedStreak + 1 : 0;
}

/** Joins the answers of the tiny questions into one comparable string. Order never matters. */
export function fingerprintOf(parts: Record<string, string>): string {
  return Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k]}`)
    .join(";");
}

/** Short stable hash (FNV-1a) so a long list of "key=timestamp" answers becomes one small token. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
