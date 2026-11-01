import { useCallback, useMemo } from 'react';
import { useLedger } from '../context/LedgerContext';
import { BEAT_ROUTES, BeatRoute } from '../constants/beats';
import type { Customer } from '../types';
import {
  DEFAULT_BEAT_HUB,
  beatOfCustomer,
  beatsForSalesman,
  findBeatNameClash,
  newBeatId,
} from '../utils/beats';

/**
 * Beats / delivery areas. The owner's list lives in orgProfile.beats (synced with the profile) and is edited in
 * Settings → Beats (owner only). Until the owner saves one, the built-in default list is used.
 *
 * Customers are linked by `beatId`; `route` keeps the beat's name so older records and lists keep working.
 * Every change that touches customers (rename, move, delete, assign) is done here so the two never drift apart.
 */
export function useBeats() {
  const { orgProfile, updateOrgProfile, customers, trips, updateCustomer, currentUser } = useLedger();

  const configured = Array.isArray(orgProfile?.beats);
  const beats: BeatRoute[] = useMemo(
    () => (configured ? (orgProfile.beats as BeatRoute[]) : BEAT_ROUTES),
    [configured, orgProfile?.beats]
  );
  const activeBeats = useMemo(() => beats.filter((b) => b.active !== false), [beats]);

  // The beats a signed-in salesman works (set by the owner). Empty for the owner and for an unassigned salesman.
  const myBeats = useMemo(
    () => (currentUser?.role === 'salesman' ? beatsForSalesman(beats, currentUser.id) : []),
    [beats, currentUser]
  );

  const save = useCallback((next: BeatRoute[]) => updateOrgProfile({ beats: next }), [updateOrgProfile]);

  const customerBeat = useCallback((c: Parameters<typeof beatOfCustomer>[0]) => beatOfCustomer(c, beats), [beats]);

  const usage = useCallback(
    (name: string) => {
      const b = beats.find((x) => x.name === name);
      return {
        customers: (customers || []).filter((c) => (b ? beatOfCustomer(c, beats)?.id === b.id : (c.route || '').trim() === name)).length,
        trips: (trips || []).filter((t) => (t.route || '').trim() === name).length,
      };
    },
    [customers, trips, beats]
  );

  const customersIn = useCallback(
    (beatId: string): Customer[] => (customers || []).filter((c) => beatOfCustomer(c, beats)?.id === beatId),
    [customers, beats]
  );

  const stamp = (c: Customer, beat: BeatRoute | null): Customer =>
    beat ? { ...c, beatId: beat.id, route: beat.name } : { ...c, beatId: undefined, route: undefined };

  /** Put customers in a beat (or take them out with null). Returns how many changed. */
  const assignCustomers = useCallback(
    (customerIds: string[], beatId: string | null): number => {
      const beat = beatId ? beats.find((b) => b.id === beatId) || null : null;
      if (beatId && !beat) return 0;
      let n = 0;
      const want = new Set(customerIds);
      for (const c of customers || []) {
        if (!want.has(c.id)) continue;
        if ((beat ? c.beatId === beat.id && c.route === beat.name : !c.beatId && !c.route)) continue;
        updateCustomer(stamp(c, beat), false);
        n++;
      }
      return n;
    },
    [beats, customers, updateCustomer]
  );

  const addBeat = useCallback(
    (name: string, opts?: { hub?: string }): { ok: boolean; error?: string; beat?: BeatRoute } => {
      const clean = name.trim().replace(/\s+/g, ' ');
      if (!clean) return { ok: false, error: 'Enter a beat name.' };
      if (findBeatNameClash(beats, clean)) return { ok: false, error: `A beat named "${clean}" already exists.` };
      const beat: BeatRoute = {
        id: newBeatId(),
        name: clean,
        hub: opts?.hub ?? DEFAULT_BEAT_HUB,
        stops: [],
        label: clean,
        active: true,
      };
      // The first save replaces the built-in default list with the owner's own.
      void save([...(configured ? beats : []), beat]);
      return { ok: true, beat };
    },
    [beats, configured, save]
  );

  const addBeats = useCallback(
    (names: string[]): number => {
      const base = configured ? [...beats] : [];
      let added = 0;
      for (const raw of names) {
        const clean = raw.trim().replace(/\s+/g, ' ');
        if (!clean || findBeatNameClash(base, clean)) continue;
        base.push({ id: newBeatId(), name: clean, hub: DEFAULT_BEAT_HUB, stops: [], label: clean, active: true });
        added++;
      }
      if (added > 0) void save(base);
      return added;
    },
    [beats, configured, save]
  );

  /** Rename and keep every customer of the beat pointing at it (their `route` text follows the new name). */
  const renameBeat = useCallback(
    (id: string, name: string): { ok: boolean; error?: string } => {
      const clean = name.trim().replace(/\s+/g, ' ');
      const cur = beats.find((b) => b.id === id);
      if (!cur) return { ok: false, error: 'Beat not found.' };
      if (!clean) return { ok: false, error: 'Enter a beat name.' };
      if (findBeatNameClash(beats, clean, id)) return { ok: false, error: `A beat named "${clean}" already exists.` };
      if (clean === cur.name) return { ok: true };
      const members = customersIn(id);
      void save(beats.map((b) => (b.id === id ? { ...b, name: clean, label: clean } : b)));
      for (const c of members) updateCustomer({ ...c, beatId: id, route: clean }, false);
      return { ok: true };
    },
    [beats, customersIn, save, updateCustomer]
  );

  const updateBeat = useCallback(
    (id: string, patch: Partial<BeatRoute> & { salesmanIds?: string[] }) => {
      void save(beats.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [beats, save]
  );

  /**
   * Delete a beat. If customers are in it, they must be moved to another beat (or released to "no beat") first;
   * the caller chooses with `moveTo`: a beat id, null = release, undefined = refuse when the beat is in use.
   */
  const deleteBeat = useCallback(
    (id: string, moveTo?: string | null): { ok: boolean; error?: string } => {
      const members = customersIn(id);
      if (members.length > 0 && moveTo === undefined) {
        return { ok: false, error: `${members.length} customer${members.length === 1 ? ' is' : 's are'} in this beat. Move them first, or switch the beat off instead.` };
      }
      if (members.length > 0) assignCustomers(members.map((c) => c.id), moveTo ?? null);
      void save(beats.filter((b) => b.id !== id));
      return { ok: true };
    },
    [assignCustomers, beats, customersIn, save]
  );

  return {
    beats,
    activeBeats,
    myBeats,
    configured,
    saveBeats: save,
    beatUsage: usage,
    customerBeat,
    customersIn,
    assignCustomers,
    addBeat,
    addBeats,
    renameBeat,
    updateBeat,
    deleteBeat,
  };
}
