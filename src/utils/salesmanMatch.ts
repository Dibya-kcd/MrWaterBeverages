import { Salesman } from '../types';

/**
 * Decides whether a trip / bill belongs to the logged-in salesman.
 *
 * Old records often carry only a typed name ("Ramesh", "ramesh kumar ", "Ramesh K.") and no
 * salesman id, so an exact id-or-name check hides many of a salesman's own trips. This matches:
 *  1. by salesman id, including a second salesman record that has the same phone number;
 *  2. by name, ignoring case, spaces and punctuation;
 *  3. by partial name ("Ramesh" = "Ramesh Kumar"), but only when no other salesman could also
 *     be meant, so two people sharing a first name are never mixed up.
 */
const norm = (s?: string | null) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\u0b00-\u0b7f ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const last10 = (v?: string | null) => (v || '').replace(/\D/g, '').slice(-10);

const subsetMatch = (a: string, b: string) => {
  if (!a || !b) return false;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return small.every((t) => big.includes(t));
};

export interface SalesmanIdentity {
  id?: string;
  name?: string;
  phone?: string;
}

export function makeSalesmanMatcher(me: SalesmanIdentity, salesmen: Salesman[] = []) {
  const myPhone = last10(me.phone);
  const mine = salesmen.filter((s) => s.id === me.id || (myPhone.length === 10 && last10(s.phone) === myPhone));
  const myIds = new Set<string>([me.id || '', ...mine.map((s) => s.id)].filter(Boolean));
  const myNames = Array.from(new Set([norm(me.name), ...mine.map((s) => norm(s.name))].filter(Boolean)));
  const others = salesmen.filter((s) => !myIds.has(s.id) && !(myPhone.length === 10 && last10(s.phone) === myPhone));
  const knownIds = new Set(salesmen.map((s) => s.id));

  return (rec: { salesmanId?: string | null; salesman?: string | null }): boolean => {
    const rid = rec.salesmanId || '';
    if (rid && myIds.has(rid)) return true;
    // linked to a different salesman account that exists -> not mine
    if (rid && knownIds.has(rid)) return false;
    const name = norm(rec.salesman);
    if (!name) return false;
    if (myNames.includes(name)) return true;
    if (myNames.some((n) => subsetMatch(n, name))) {
      // only when nobody else could be meant by that name
      const ambiguous = others.some((o) => norm(o.name) === name || subsetMatch(norm(o.name), name));
      return !ambiguous;
    }
    return false;
  };
}
