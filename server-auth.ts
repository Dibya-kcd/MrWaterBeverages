/**
 * Access control for the server API.
 *
 *   APP_SESSION_SECRET   32+ random characters. Signs session tokens (and peppers PIN hashes).
 *   API_AUTH_REQUIRED    ON BY DEFAULT. Only an explicit "false" turns it off, and never in production
 *                        (see startupProblems()).
 *   ADMIN_PASSWORD       lets the owner sign in through the server (the password never leaves the server).
 *   ADMIN_EMAILS         comma list: only these Supabase Auth users count as admin.
 *   PIN_PEPPER           optional extra secret for PIN hashes (defaults to APP_SESSION_SECRET).
 *
 * Tokens are "<payload>.<signature>" (HMAC-SHA256), valid for 12 hours. Supabase Auth access tokens are accepted
 * as admin tokens too.
 *
 * Salesmen are held to an ALLOW-LIST (salesmanPolicy): anything not listed is owner-only. Reads are filtered to
 * the salesman's own records and writes are forced to carry (and never overwrite someone else's) salesmanId.
 */
import crypto from "node:crypto";
import { beatsForSalesman, customerInBeats, type BeatLike } from "./src/utils/beats";

export interface AuthClaims {
  r: "admin" | "salesman";
  sid?: string; // salesman id
  n?: string; // display name / email
  exp: number; // ms since epoch
}

export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const b64u = (v: Buffer | string) => Buffer.from(v).toString("base64url");

export function signToken(
  claims: Omit<AuthClaims, "exp"> & { exp?: number },
  secret: string,
  ttlMs = TOKEN_TTL_MS,
  now = Date.now(),
): string {
  const payload = b64u(JSON.stringify({ ...claims, exp: claims.exp ?? now + ttlMs }));
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string, secret: string, now = Date.now()): AuthClaims | null {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64url");
  if (!safeEqual(parts[1], expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as AuthClaims;
    if ((c.r !== "admin" && c.r !== "salesman") || !(c.exp > now)) return null;
    if (c.r === "salesman" && !c.sid) return null;
    return c;
  } catch {
    return null;
  }
}

/** Constant-time string comparison (hashes first so lengths do not leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Blocks a key (phone + address, or address) after too many failed sign-ins. */
export class FailureLimiter {
  private hits = new Map<string, { n: number; until: number; first: number }>();
  constructor(private max = 5, private windowMs = 15 * 60 * 1000) {}
  /** Milliseconds left until the key may try again (0 = allowed). */
  blockedFor(key: string, now = Date.now()): number {
    const h = this.hits.get(key);
    if (!h) return 0;
    if (h.until > now) return h.until - now;
    if (now - h.first > this.windowMs) this.hits.delete(key);
    return 0;
  }
  fail(key: string, now = Date.now()) {
    const h = this.hits.get(key);
    if (!h || now - h.first > this.windowMs) {
      this.hits.set(key, { n: 1, first: now, until: 0 });
      return;
    }
    h.n += 1;
    if (h.n >= this.max) h.until = now + this.windowMs;
  }
  reset(key: string) {
    this.hits.delete(key);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Configuration. Sign-in is ON unless somebody explicitly turns it off (and never in production).
 * ---------------------------------------------------------------------------------------------- */
const OFF_WORDS = new Set(["false", "0", "off", "no"]);

export function authConfig(env: Record<string, string | undefined> = process.env) {
  const flag = (env.API_AUTH_REQUIRED || "").trim().toLowerCase();
  const isProd = (env.NODE_ENV || "").trim().toLowerCase() === "production";
  const secret = (env.APP_SESSION_SECRET || "").trim() || (isProd ? "" : "mrwater-distribution-ledger-session-secret-key-32chars");
  const adminPassword = env.ADMIN_PASSWORD || env.VITE_LOCAL_ADMIN_PASSWORD || (isProd ? "" : "admin1234");
  const required = flag ? !OFF_WORDS.has(flag) : isProd;
  return {
    secret,
    required,
    production: isProd,
    adminPassword,
    adminEmails: (env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    pinPepper: (env.PIN_PEPPER || "").trim() || secret,
    salesmanDirectory: (env.SALESMAN_CUSTOMER_DIRECTORY || "").trim().toLowerCase() === "true",
  };
}

/** Reasons the server must refuse to start in production. Empty list = fine. */
export function startupProblems(env: Record<string, string | undefined> = process.env): string[] {
  const cfg = authConfig(env);
  if (!cfg.production) return [];
  const problems: string[] = [];
  if (!cfg.required) problems.push("API_AUTH_REQUIRED is turned off. Server sign-in cannot be disabled in production.");
  if (cfg.secret.length < 32) problems.push("APP_SESSION_SECRET must be set to 32+ random characters (e.g. `openssl rand -hex 32`).");
  if (!cfg.adminPassword && cfg.adminEmails.length === 0) {
    problems.push("Set ADMIN_PASSWORD (or ADMIN_EMAILS) so the owner can sign in.");
  }
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const rawCandidateKeys = [env.SUPABASE_SERVICE_ROLE_KEY, env.VITE_SUPABASE_ANON_KEY, env.SUPABASE_ANON_KEY];
  const key = (rawCandidateKeys.find((k) => k && !k.includes("CHANGE-ME") && !k.startsWith("YOUR_") && !k.startsWith("missing-") && k.trim() !== "") || "").trim();
  if (!url || !key) {
    problems.push("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (no built-in database address or key is used in production).");
  }
  return problems;
}

/** Routes that work without a token even when authentication is required. */
export function isPublicApiPath(path: string): boolean {
  return (
    path === "/api/health" ||
    path === "/api/auth/status" ||
    path === "/api/auth/admin-login" ||
    path === "/api/auth/salesman-login"
  );
}

/** Kept for callers that only need the old coarse check. The allow-list below is what is enforced. */
export function isAdminOnly(method: string, path: string): boolean {
  return !salesmanPolicy(method, path).allow;
}

/* ------------------------------------------------------------------------------------------------
 * Salesman allow-list
 * ---------------------------------------------------------------------------------------------- */
export type SalesmanScope =
  | "own-bills" // read: only bills with his salesmanId
  | "own-trips"
  | "own-payments"
  | "own-customers"
  | "self-salesman"
  | "read-all" // product catalogue / stock / prices (needed to bill) - no customer or money data
  | "write-bills"
  | "write-bill-payment"
  | "write-payments"
  | "write-trips"
  | "write-customers" // new customers only
  | "append-only" // lists that only ever grow from a salesman's phone
  | "open"; // no record data involved (document-number counters)

export type PolicyDecision = { allow: true; scope: SalesmanScope } | { allow: false };

interface Rule {
  methods: string[];
  re: RegExp;
  scope: SalesmanScope;
}

const RULES: Rule[] = [
  // ---- reads --------------------------------------------------------------------------------------
  { methods: ["GET"], re: /^\/api\/(bills|orders)$/, scope: "own-bills" },
  { methods: ["GET"], re: /^\/api\/trips$/, scope: "own-trips" },
  { methods: ["GET"], re: /^\/api\/payments$/, scope: "own-payments" },
  { methods: ["GET"], re: /^\/api\/customers$/, scope: "own-customers" },
  { methods: ["GET"], re: /^\/api\/salesmen$/, scope: "self-salesman" },
  {
    methods: ["GET"],
    re: /^\/api\/(products|inventory|batches|schemes|warehouses|settings\/billing|settings\/profile)$/,
    scope: "read-all",
  },
  { methods: ["GET"], re: /^\/api\/collections\/(vehicle_trip|warehouse_bays|stock_transactions)$/, scope: "read-all" },
  // ---- writes -------------------------------------------------------------------------------------
  { methods: ["POST", "PUT"], re: /^\/api\/(bills|orders|create_order_with_schemes)$/, scope: "write-bills" },
  { methods: ["POST"], re: /^\/api\/bills\/[^/]+\/payment$/, scope: "write-bill-payment" },
  { methods: ["POST", "PUT"], re: /^\/api\/payments$/, scope: "write-payments" },
  { methods: ["POST", "PUT"], re: /^\/api\/trips$/, scope: "write-trips" },
  { methods: ["POST", "PUT"], re: /^\/api\/customers$/, scope: "write-customers" },
  { methods: ["POST"], re: /^\/api\/doc-numbers\/(reserve|release)$/, scope: "open" },
  { methods: ["PUT"], re: /^\/api\/collections\/(stock_transactions|inventory_dispositions)$/, scope: "append-only" },
];

export function normalizeApiPath(path: string): string {
  const p = String(path || "").split("?")[0].replace(/\/+$/, "");
  return p || "/";
}

/** The ONLY things a salesman login may do. Everything else (deletes, settings, salesmen, GRNs, audits,
 *  inventory edits, schemes, the paid invoice reader, ...) is owner-only. */
export function salesmanPolicy(method: string, path: string): PolicyDecision {
  const m = String(method || "").toUpperCase() === "HEAD" ? "GET" : String(method || "").toUpperCase();
  const p = normalizeApiPath(path);
  for (const r of RULES) {
    if (r.methods.includes(m) && r.re.test(p)) return { allow: true, scope: r.scope };
  }
  return { allow: false };
}

/* ------------------------------------------------------------------------------------------------
 * Record ownership and filtering
 * ---------------------------------------------------------------------------------------------- */
const sidOf = (r: any): string => String(r?.salesmanId ?? r?.salesman_id ?? "").trim();
export const ownedBy = (r: any, sid: string): boolean => !!sid && sidOf(r) === String(sid);
export const normName = (n: any): string =>
  String(n || "").trim().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").toLowerCase();

export interface SalesmanContext {
  sid: string;
  name?: string;
  bills: any[]; // stored bills
  trips: any[];
  payments: any[];
  customers: any[];
  directory?: boolean; // SALESMAN_CUSTOMER_DIRECTORY=true
  beats?: BeatLike[]; // the owner's beats (with the salesmen assigned to each)
}

/** Customer ids / names a salesman is allowed to see: his own bills, payments and trips plus customers he added. */
export function allowedCustomerKeys(ctx: SalesmanContext) {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const b of ctx.bills) {
    if (!ownedBy(b, ctx.sid)) continue;
    if (b?.customerId) ids.add(String(b.customerId));
    else if (b?.retailer) names.add(normName(b.retailer));
  }
  for (const p of ctx.payments) {
    if (!ownedBy(p, ctx.sid)) continue;
    if (p?.customerId) ids.add(String(p.customerId));
    else if (p?.customerName) names.add(normName(p.customerName));
  }
  for (const c of ctx.customers) {
    if (String(c?.createdBySalesmanId || "") === ctx.sid && c?.id) ids.add(String(c.id));
  }
  return { ids, names };
}

const DIRECTORY_FIELDS = ["id", "name", "phone", "altPhone", "address", "city", "route", "createdAt", "updatedAt"];

function filterList(scope: SalesmanScope, list: any[], ctx: SalesmanContext): any[] {
  if (!Array.isArray(list)) return list;
  const sid = ctx.sid;
  switch (scope) {
    case "own-bills":
    case "own-trips":
      return list.filter((r) => ownedBy(r, sid));
    case "own-payments": {
      const myBills = new Set(ctx.bills.filter((b) => ownedBy(b, sid)).map((b) => String(b?.id)));
      return list.filter((p) => ownedBy(p, sid) || (p?.billId != null && myBills.has(String(p.billId))));
    }
    case "own-customers": {
      const { ids, names } = allowedCustomerKeys(ctx);
      // plus every customer in a beat the owner has given him
      const myBeats = beatsForSalesman(ctx.beats || [], sid);
      const out: any[] = [];
      for (const c of list) {
        const mine =
          (c?.id && ids.has(String(c.id))) ||
          names.has(normName(c?.name)) ||
          (myBeats.length > 0 && customerInBeats(c, myBeats));
        if (mine) out.push(c);
        else if (ctx.directory) {
          // Optional directory mode: names and contact details only - no balances, limits or notes.
          const slim: any = {};
          for (const k of DIRECTORY_FIELDS) if (c?.[k] !== undefined) slim[k] = c[k];
          out.push(slim);
        }
      }
      return out;
    }
    default:
      return list;
  }
}

/** Removes every PIN hash from salesman records that leave the server. */
export function stripPin<T extends Record<string, any>>(s: T): T {
  if (!s || typeof s !== "object") return s;
  const { pin_hash, pinHash, ...rest } = s as any;
  return { ...rest, pinHash: "", hasPin: !!(pin_hash || pinHash) } as T;
}

const LIST_KEYS = ["data", "bills", "orders", "trips", "payments", "customers", "salesmen"];

/** Filters a GET response body for a salesman login. Handles `[...]`, `{data: [...]}`, `{bills: [...]}` etc. */
export function filterSalesmanResponse(scope: SalesmanScope, body: any, ctx: SalesmanContext): any {
  if (scope === "self-salesman") {
    const only = (list: any[]) => list.filter((s) => String(s?.id) === ctx.sid).map(stripPin);
    if (Array.isArray(body)) return only(body);
    if (body && typeof body === "object") {
      const out = { ...body };
      for (const k of LIST_KEYS) if (Array.isArray(out[k])) out[k] = only(out[k]);
      return out;
    }
    return body;
  }
  if (scope === "read-all" || scope === "open") return body;
  if (Array.isArray(body)) return filterList(scope, body, ctx);
  if (body && typeof body === "object") {
    const out = { ...body };
    for (const k of LIST_KEYS) if (Array.isArray(out[k])) out[k] = filterList(scope, out[k], ctx);
    return out;
  }
  return body;
}

export type WriteResult =
  | { ok: true; body: any; dropped: number }
  | { ok: false; status: number; error: string };

const idKey = (r: any) => String(r?.id);

/** The incoming records of a write body, wherever the app put them. */
function listFrom(body: any, keys: string[]): { list: any[] | null; key: string | null } {
  if (Array.isArray(body)) return { list: body, key: null };
  for (const k of keys) if (body && Array.isArray(body[k])) return { list: body[k], key: k };
  return { list: null, key: null };
}

function withList(body: any, key: string | null, list: any[]) {
  if (key === null) return list;
  return { ...body, [key]: list };
}

/**
 * Makes a salesman's write safe BEFORE the normal route handler sees it:
 *  - new records are stamped with his salesmanId;
 *  - a record that already exists under another salesman (or the owner) is never touched: a single-record write
 *    is refused (403), a list write simply drops it;
 *  - customers can only be added, never edited or replaced;
 *  - append-only lists keep everything already stored.
 */
export function sanitizeSalesmanWrite(scope: SalesmanScope, body: any, ctx: SalesmanContext, stored?: any[]): WriteResult {
  const sid = ctx.sid;
  const stamp = (r: any) => ({ ...r, salesmanId: sid, ...(ctx.name && !r?.salesman ? { salesman: ctx.name } : {}) });
  const myBillIds = new Set(ctx.bills.filter((b) => ownedBy(b, sid)).map((b) => String(b?.id)));
  const anyBillIds = new Set(ctx.bills.map((b) => String(b?.id)));

  const guard = (
    incoming: any[],
    storedList: any[],
    single: boolean,
    extra?: (r: any) => boolean,
  ): { kept: any[]; dropped: number; refused: boolean } => {
    const byId = new Map(storedList.map((r) => [idKey(r), r]));
    const kept: any[] = [];
    let dropped = 0;
    for (const r of incoming) {
      if (!r || typeof r !== "object" || r.id === undefined || r.id === null) {
        dropped++;
        continue;
      }
      const cur = byId.get(idKey(r));
      if ((cur && !ownedBy(cur, sid)) || (extra && !extra(r))) {
        if (single) return { kept: [], dropped: 1, refused: true };
        dropped++;
        continue;
      }
      kept.push(stamp(r));
    }
    return { kept, dropped, refused: false };
  };

  const refuse = (error: string): WriteResult => ({ ok: false, status: 403, error });

  switch (scope) {
    case "write-bills": {
      const { list, key } = listFrom(body, ["bills", "orders", "data"]);
      const single = list === null;
      const r = guard(single ? [body] : list!, ctx.bills, single);
      if (r.refused) return refuse("This invoice belongs to another salesman or the owner.");
      return { ok: true, body: single ? r.kept[0] : withList(body, key, r.kept), dropped: r.dropped };
    }
    case "write-bill-payment": {
      return { ok: true, body, dropped: 0 }; // ownership of the bill is checked by the caller (needs the :id)
    }
    case "write-payments": {
      const { list, key } = listFrom(body, ["payments", "data"]);
      const single = list === null;
      const onOthersBill = (p: any) =>
        p?.billId === undefined || p?.billId === null || p.billId === 0 || myBillIds.has(String(p.billId)) || !anyBillIds.has(String(p.billId));
      const r = guard(single ? [body] : list!, ctx.payments, single, onOthersBill);
      if (r.refused) return refuse("This receipt belongs to another salesman, the owner, or another salesman's invoice.");
      return { ok: true, body: single ? r.kept[0] : withList(body, key, r.kept), dropped: r.dropped };
    }
    case "write-trips": {
      const { list, key } = listFrom(body, ["trips", "data"]);
      const single = list === null;
      const r = guard(single ? [body] : list!, ctx.trips, single);
      if (r.refused) return refuse("This trip belongs to another salesman or the owner.");
      return { ok: true, body: single ? r.kept[0] : withList(body, key, r.kept), dropped: r.dropped };
    }
    case "write-customers": {
      const { list, key } = listFrom(body, ["customers", "data"]);
      const single = list === null;
      const known = new Set(ctx.customers.map(idKey));
      const incoming = single ? [body] : list!;
      const kept: any[] = [];
      let dropped = 0;
      for (const c of incoming) {
        if (!c || typeof c !== "object" || !c.id || known.has(idKey(c))) {
          // Existing customers are the owner's to edit. A single add that clashes is refused so the app knows.
          if (single && c?.id && known.has(idKey(c))) return refuse("Only the owner can change an existing customer.");
          dropped++;
          continue;
        }
        const { creditLimit, openingBalance, ...rest } = c; // a salesman cannot set his own customer's limit or opening dues
        kept.push({ ...rest, creditLimit: 0, openingBalance: 0, createdBySalesmanId: sid });
      }
      if (single && kept.length === 0) return refuse("Customer needs an id.");
      return { ok: true, body: single ? kept[0] : withList(body, key, kept), dropped };
    }
    case "append-only": {
      const payload = body?.data !== undefined ? body.data : body;
      if (!Array.isArray(payload)) return refuse("Only lists can be sent here.");
      const have = new Set((stored || []).map(idKey));
      const fresh = payload.filter((r) => r && r.id !== undefined && !have.has(idKey(r)));
      const merged = [...(stored || []), ...fresh];
      return { ok: true, body: { data: merged }, dropped: payload.length - fresh.length };
    }
    default:
      return { ok: true, body, dropped: 0 };
  }
}

/* ------------------------------------------------------------------------------------------------
 * PIN hashing (server side).
 *
 * New PINs are stored as  scrypt$N$r$p$<salt>$<hash>  with a RANDOM salt per salesman, after the PIN has been
 * run through HMAC-SHA256 with a server-only pepper, so a copy of the database alone cannot be used to guess PINs.
 * Old hashes (SHA-256 with one shared salt) still verify and are upgraded on the next successful sign-in.
 * ---------------------------------------------------------------------------------------------- */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

const scryptAsync = (pw: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    crypto.scrypt(pw, salt, 32, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );

const prehash = (pin: string, pepper: string) =>
  crypto.createHmac("sha256", pepper || "mrwater-no-pepper").update(String(pin).trim()).digest("hex");

export const isModernPinHash = (s: unknown): s is string => typeof s === "string" && s.startsWith("scrypt$");

export async function hashPinSecure(pin: string, pepper: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(prehash(pin, pepper), salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/**
 * Checks a PIN against a stored hash. `legacyHash` computes the old fixed-salt SHA-256 (so existing salesmen keep
 * working). `needsUpgrade` tells the caller to store a fresh scrypt hash now that the PIN is known to be right.
 */
export async function verifyStoredPin(
  pin: string,
  stored: string,
  pepper: string,
  legacyHash: (pin: string) => Promise<string>,
): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (!stored) return { ok: false, needsUpgrade: false };
  const cleanPin = String(pin).trim();
  if (isModernPinHash(stored)) {
    const [, n, r, p, salt, hash] = stored.split("$");
    if (!n || !r || !p || !salt || !hash) return { ok: false, needsUpgrade: false };
    const saltBuf = Buffer.from(salt, "base64url");
    const want = Buffer.from(hash, "base64url");
    const N = Number(n);
    const R = Number(r);
    const P = Number(p);

    const candidatePeppers = [
      pepper,
      "mrwater-distribution-ledger-session-secret-key-32chars",
      "CHANGE-ME-at-least-32-random-characters",
      "mrwater-no-pepper",
      "",
    ].filter((val, idx, arr) => arr.indexOf(val) === idx);

    for (let i = 0; i < candidatePeppers.length; i++) {
      const pCandidate = candidatePeppers[i];
      try {
        const key = await scryptAsync(prehash(cleanPin, pCandidate), saltBuf, N, R, P);
        if (want.length === key.length && crypto.timingSafeEqual(want, key)) {
          const needsUpgrade = i > 0;
          return { ok: true, needsUpgrade };
        }
      } catch {
        // continue
      }
    }
    return { ok: false, needsUpgrade: false };
  }

  // Check legacy SHA-256 hash
  try {
    const computedLegacy = await legacyHash(cleanPin);
    if (safeEqual(stored.toLowerCase(), computedLegacy.toLowerCase())) {
      return { ok: true, needsUpgrade: true };
    }
  } catch {
    // continue
  }

  // Plaintext fallback (e.g. manual DB record or test data)
  if (safeEqual(stored.trim(), cleanPin)) {
    return { ok: true, needsUpgrade: true };
  }

  return { ok: false, needsUpgrade: false };
}

