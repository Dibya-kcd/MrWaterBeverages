/**
 * Delta reads for the heavy tables.
 *
 * A full download used to re-read every row of every big table. Now the first read of a table keeps its rows in
 * memory, and later reads ask only for rows changed since the newest one already seen, then merge them in. The
 * caller still receives the complete list in the same order, so nothing downstream changes.
 *
 * Read-only: nothing here writes to the database, and no new column or table is needed. Whenever anything is
 * unclear (an error, a row without an id, a count that does not match, a copy older than a few minutes) it simply
 * does the old full read of that table instead, so the worst case is the old behaviour.
 *
 * The client is passed in (any Supabase-like object) so this file can be tested with a fake database.
 */

export interface DeltaSpec {
  table: string;
  /** unique key column of the table */
  idCol: string;
  /** column that moves forward when a row is added or changed (updated_at, created_at, timestamp ...) */
  cursorCol: string;
  /** column the caller wants the result sorted by (same as the old query's order) */
  orderCol: string;
  ascending: boolean;
}

interface TableCache {
  rows: Map<string, any>;
  /** newest cursor value seen */
  cursor: string | number | null;
  at: number;
}

/** A remembered copy is trusted for this long at most, then the table is read in full again (catches stray edits). */
export const TABLE_CACHE_MAX_AGE_MS = 15 * 60_000;
/**
 * Rows are re-requested from a little BEFORE the newest one seen, because devices stamp rows with their own clock
 * (a phone running a few minutes slow would otherwise be missed). Re-reading a few rows twice is harmless.
 */
export const DELTA_OVERLAP_MS = 10 * 60_000;
const PAGE = 1000;
const MAX_ROWS = 50_000;

const caches = new Map<string, TableCache>();
/** tables whose rows have no usable id: always read in full, never remembered */
const notDeltaable = new Set<string>();

export function resetTableCaches(): void {
  caches.clear();
  notDeltaable.clear();
}

/** The cursor value moved back by `ms`. Works for ISO date text and for millisecond numbers. */
export function cursorMinus(cursor: string | number, ms: number): string | number {
  if (typeof cursor === "number") return cursor - ms;
  // Only ISO text ("2026-11-01T08:00:00...") can be moved safely; any other text format is left as it is.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(cursor)) return cursor;
  const t = Date.parse(cursor);
  if (Number.isNaN(t)) return cursor;
  return new Date(t - ms).toISOString();
}

function newer(a: string | number | null, b: any): string | number {
  if (b === null || b === undefined || b === "") return a as any;
  if (a === null) return b;
  return b > a ? b : a;
}

export function sortRows(rows: any[], col: string, ascending: boolean): any[] {
  const dir = ascending ? 1 : -1;
  return [...rows].sort((x, y) => {
    const a = x?.[col];
    const b = y?.[col];
    if (a === b) return 0;
    if (a === null || a === undefined) return 1; // empty values last, like the database does
    if (b === null || b === undefined) return -1;
    return (a < b ? -1 : 1) * dir;
  });
}

async function readAll(client: any, spec: DeltaSpec): Promise<{ rows: any[] | null; error: any }> {
  const rows: any[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await client
      .from(spec.table)
      .select("*")
      .order(spec.idCol, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows: null, error };
    const page: any[] = data || [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return { rows, error: null };
}

/**
 * Same result shape as `client.from(t).select("*").order(...)`: `{ data, error }`, with `data` the complete list.
 */
export async function fetchTableDelta(
  client: any,
  spec: DeltaSpec,
  now: number = Date.now(),
): Promise<{ data: any[] | null; error: any }> {
  const done = (rows: any[]) => ({ data: sortRows(rows, spec.orderCol, spec.ascending), error: null });
  const cache = caches.get(spec.table);

  if (cache && cache.cursor !== null && !notDeltaable.has(spec.table) && now - cache.at < TABLE_CACHE_MAX_AGE_MS) {
    try {
      // Is it still the same number of rows? (A different number means rows were added or removed elsewhere.)
      const head = await client.from(spec.table).select("*", { count: "exact", head: true });
      if (!head.error && head.count === cache.rows.size) {
        const { data, error } = await client
          .from(spec.table)
          .select("*")
          .gte(spec.cursorCol, cursorMinus(cache.cursor, DELTA_OVERLAP_MS))
          .order(spec.cursorCol, { ascending: true })
          .limit(PAGE);
        const changed: any[] = data || [];
        if (!error && changed.length < PAGE && changed.every((r) => r?.[spec.idCol] !== undefined && r?.[spec.idCol] !== null)) {
          let cursor = cache.cursor;
          for (const r of changed) {
            cache.rows.set(String(r[spec.idCol]), r);
            cursor = newer(cursor, r[spec.cursorCol]);
          }
          cache.cursor = cursor;
          return done(Array.from(cache.rows.values()));
        }
      }
    } catch {
      // fall through to the full read
    }
  }

  const { rows, error } = await readAll(client, spec);
  if (error || !rows) {
    caches.delete(spec.table);
    // The paged read could not be done (for example the key column has another name): do exactly the old query.
    const plain = await client.from(spec.table).select("*").order(spec.orderCol, { ascending: spec.ascending });
    return { data: plain.data ?? null, error: plain.error ?? null };
  }
  if (rows.some((r) => r?.[spec.idCol] === undefined || r?.[spec.idCol] === null)) {
    notDeltaable.add(spec.table);
    caches.delete(spec.table);
    return done(rows);
  }
  let cursor: string | number | null = null;
  const map = new Map<string, any>();
  for (const r of rows) {
    map.set(String(r[spec.idCol]), r);
    cursor = newer(cursor, r[spec.cursorCol]);
  }
  caches.set(spec.table, { rows: map, cursor, at: now });
  return done(rows);
}

/* ---------------------------------------------------------------------------------------------------------------
 * One-row reads (large JSON rows such as the payments list): ask only for the row's "last changed" time first and
 * download the row only if that changed.
 * ------------------------------------------------------------------------------------------------------------- */
const rowCache = new Map<string, { stamp: string; row: any; at: number }>();

export function resetRowCaches(): void {
  rowCache.clear();
}

export async function fetchRowIfChanged(
  client: any,
  table: string,
  matchCol: string,
  matchVal: string,
  now: number = Date.now(),
): Promise<{ data: any | null; error: any }> {
  const key = `${table}|${matchCol}|${matchVal}`;
  const hit = rowCache.get(key);
  if (hit && now - hit.at < TABLE_CACHE_MAX_AGE_MS) {
    try {
      const head = await client.from(table).select("updated_at").eq(matchCol, matchVal).maybeSingle();
      if (!head.error && head.data && String(head.data.updated_at ?? "") === hit.stamp && hit.stamp !== "") {
        return { data: hit.row, error: null };
      }
    } catch {
      // fall through to the full read
    }
  }
  const res = await client.from(table).select("*").eq(matchCol, matchVal).maybeSingle();
  if (!res.error && res.data) {
    rowCache.set(key, { stamp: String(res.data.updated_at ?? ""), row: res.data, at: now });
  } else {
    rowCache.delete(key);
  }
  return res;
}
