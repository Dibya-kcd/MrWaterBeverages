import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { billExtraFields, applyBillExtra, grnExtraFields, applyGrnExtra } from "./src/utils/billExtra";
import { volumeFromName, detectPack } from "./src/utils/billing";
import { hashPin } from "./src/utils/crypto";
import { findOverReturns, describeOverReturn } from "./src/utils/tripReturns";
import {
  signToken,
  verifyToken,
  safeEqual,
  FailureLimiter,
  authConfig,
  isPublicApiPath,
  startupProblems,
  salesmanPolicy,
  normalizeApiPath,
  filterSalesmanResponse,
  sanitizeSalesmanWrite,
  ownedBy,
  stripPin,
  hashPinSecure,
  verifyStoredPin,
  isModernPinHash,
  TOKEN_TTL_MS,
  type SalesmanContext,
} from "./server-auth";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { FatalAiError, getCandidateModels, recognizeInvoiceWithGemini } from "./invoiceAi";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();
try {
  if (fs.existsSync(".env.example")) {
    dotenv.config({ path: ".env.example" });
  }
} catch {
  // ignore
}

// Path resolution compatible with both ESM (tsx) and CJS (esbuild bundle)
const getDirname = () => {
  if (typeof __dirname !== "undefined") return __dirname;
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
};
const _appDirname = getDirname();

// Supabase Database Connection
// Automated test runs (MRWATER_TEST=1 or NODE_ENV=test) must NEVER touch the live database or the real data
// cache: the Supabase URL points at a closed local port and nothing is read from / written to data/collections.json.
const IS_TEST_RUN =
  process.env.MRWATER_TEST === "1" || process.env.NODE_ENV === "test";

// No database address or key is built in for production: they must come from the environment (startupProblems()
// stops the server before it serves anything if they are missing). Outside production a missing value simply
// points at a closed local port, so a forgotten setting can never silently talk to someone else's database.
const SUPABASE_URL = IS_TEST_RUN
  ? "http://127.0.0.1:9"
  : process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "http://127.0.0.1:9";

const isValidSupabaseKey = (k?: string | null): boolean => {
  if (!k) return false;
  const trimmed = k.trim();
  return (
    trimmed !== "" &&
    !trimmed.includes("CHANGE-ME") &&
    !trimmed.startsWith("YOUR_") &&
    !trimmed.startsWith("MY_") &&
    !trimmed.startsWith("missing-")
  );
};

const rawServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const SUPABASE_KEY =
  (isValidSupabaseKey(rawServiceKey) ? rawServiceKey!.trim() : "") ||
  (isValidSupabaseKey(rawAnonKey) ? rawAnonKey!.trim() : "") ||
  "missing-supabase-key";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Circuit breaker and timeout protection for remote Supabase calls
let supabaseCircuitOpenUntil = 0;
let consecutiveSupabaseErrors = 0;

export function isSupabaseAvailable(): boolean {
  if (IS_TEST_RUN) return false;
  if (Date.now() < supabaseCircuitOpenUntil) {
    return false;
  }
  return true;
}

export function recordSupabaseSuccess() {
  consecutiveSupabaseErrors = 0;
  supabaseCircuitOpenUntil = 0;
}

export function recordSupabaseFailure(error: any) {
  consecutiveSupabaseErrors++;
  const raw = String(error?.message || error || "");
  const isOutage =
    raw.includes("520") ||
    raw.includes("<!DOCTYPE") ||
    raw.includes("upstream request timeout") ||
    raw.includes("502") ||
    raw.includes("503") ||
    raw.includes("504") ||
    raw.includes("fetch failed") ||
    raw.includes("ECONNREFUSED") ||
    raw.includes("ETIMEDOUT") ||
    raw.includes("timeout") ||
    consecutiveSupabaseErrors >= 2;

  if (isOutage) {
    // Open circuit for 45 seconds so all subsequent requests respond immediately without blocking
    supabaseCircuitOpenUntil = Date.now() + 45000;
    console.warn(
      `[Supabase Circuit Breaker] Remote endpoint degraded or unreachable. Bypassing Supabase calls for 45s to prevent timeouts.`,
    );
  }
}

export async function withSupabaseTimeout<T>(
  promise: Promise<T> | any,
  timeoutMs = 3000,
  fallbackValue: T = { error: { message: "Supabase timeout or unavailable" } } as any,
): Promise<T> {
  if (!isSupabaseAvailable()) {
    return fallbackValue;
  }

  let timer: NodeJS.Timeout | null = null;
  try {
    const timeoutPromise = new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        recordSupabaseFailure("upstream request timeout");
        resolve(fallbackValue);
      }, timeoutMs);
    });

    const result = await Promise.race([
      Promise.resolve(promise).catch((err) => {
        recordSupabaseFailure(err);
        return fallbackValue;
      }),
      timeoutPromise,
    ]);

    if ((result as any)?.error) {
      recordSupabaseFailure((result as any).error);
    } else {
      recordSupabaseSuccess();
    }
    return result;
  } catch (err: any) {
    recordSupabaseFailure(err);
    return fallbackValue;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Persistent disk cache for collections to guarantee zero data loss during cloud outages or restarts
const COLLECTIONS_FILE = path.join(_appDirname, "data", "collections.json");

function loadDiskCollections(): Record<string, any> {
  if (IS_TEST_RUN) return {};
  // After cleaning the database, set IGNORE_DISK_CACHE=1 once and restart: the old local copy is set aside
  // (renamed, not deleted) so stale test rows in it can never be served or pushed back to Supabase.
  if (process.env.IGNORE_DISK_CACHE === "1") {
    try {
      if (fs.existsSync(COLLECTIONS_FILE)) {
        fs.renameSync(COLLECTIONS_FILE, `${COLLECTIONS_FILE}.old-${Date.now()}`);
        console.log("[Storage] IGNORE_DISK_CACHE=1: old data/collections.json moved aside. Starting from the database.");
      }
    } catch (err) {
      console.warn("[Storage] Could not set the disk cache aside:", err);
    }
    return {};
  }
  try {
    if (fs.existsSync(COLLECTIONS_FILE)) {
      const raw = fs.readFileSync(COLLECTIONS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.products)) {
        parsed.products = parsed.products.map((p: any) => {
          const detectedVol = volumeFromName(p.name);
          const vol = Number(p.volume) > 0 ? Number(p.volume) : (detectedVol || 150);
          const pack = p.pack && p.pack.trim() !== "" && p.pack !== "pcs" ? p.pack : detectPack(p.name);
          return {
            ...p,
            name: String(p.name || "").trim().toUpperCase(),
            volume: vol,
            pack,
          };
        });
      }
      return parsed;
    }
  } catch (err) {
    console.warn("[Storage] Error reading disk collections:", err);
  }
  return {};
}

let diskSaveTimer: NodeJS.Timeout | null = null;
function persistDiskCollections() {
  if (IS_TEST_RUN) return;
  if (diskSaveTimer) clearTimeout(diskSaveTimer);
  diskSaveTimer = setTimeout(() => {
    try {
      const dir = path.dirname(COLLECTIONS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        COLLECTIONS_FILE,
        JSON.stringify(inMemoryCollections, null, 2),
        "utf-8",
      );
    } catch (err) {
      console.warn("[Storage] Error persisting disk collections:", err);
    }
  }, 200);
}

// In-memory collections fallback cache, pre-seeded from disk
const inMemoryCollections: Record<string, any> = loadDiskCollections();

// Helper for generic collections persistence
async function getCollectionData(key: string): Promise<any> {
  // 1. Check in-memory / disk cache first (instant local-first resolution)
  if (
    inMemoryCollections[key] !== undefined &&
    inMemoryCollections[key] !== null
  ) {
    return inMemoryCollections[key];
  }

  if (!isSupabaseAvailable()) {
    return [];
  }

  // 2. Try public.app_collections with strict timeout
  try {
    const { data, error } = await withSupabaseTimeout(
      supabase
        .from("app_collections")
        .select("data")
        .eq("key", key)
        .maybeSingle(),
      2500,
    );

    if (!error && data && data.data !== undefined) {
      inMemoryCollections[key] = data.data;
      persistDiskCollections();
      return data.data;
    }
  } catch {
    // ignore
  }

  // 3. Fallback to billing_settings with strict timeout
  try {
    const { data, error } = await withSupabaseTimeout(
      supabase
        .from("billing_settings")
        .select("data")
        .eq("id", `collection_${key}`)
        .maybeSingle(),
      2500,
    );

    if (!error && data && data.data) {
      const val = data.data.items !== undefined ? data.data.items : data.data;
      inMemoryCollections[key] = val;
      persistDiskCollections();
      return val;
    }
  } catch {
    // ignore
  }

  return inMemoryCollections[key] !== undefined ? inMemoryCollections[key] : [];
}

// Deletion lists (deleted_bill_ids, deleted_records, ...) are also written straight to Supabase (devices, SQL
// clean-up), which this server's in-memory copy never sees. readListFresh() merges the two (short cache) so a
// delete made anywhere is honoured here, and a stale cache can never bring a deleted record back.
const freshListCache = new Map<string, { at: number; list: any[] }>();
const listItemKey = (x: any) =>
  x && typeof x === "object" ? `${x.kind}:${x.id}` : String(x);
async function readListFresh(key: string): Promise<any[]> {
  const hit = freshListCache.get(key);
  if (hit && Date.now() - hit.at < 10000) return hit.list;
  const local = await getCollectionData(key);
  const list: any[] = Array.isArray(local) ? [...local] : [];
  if (isSupabaseAvailable()) {
    try {
      const { data, error } = (await withSupabaseTimeout(
        supabase
          .from("app_collections")
          .select("data")
          .eq("key", key)
          .maybeSingle(),
        2500,
      )) as any;
      if (!error && data && Array.isArray(data.data)) {
        const seen = new Set(list.map(listItemKey));
        let added = false;
        for (const x of data.data) {
          if (!seen.has(listItemKey(x))) {
            list.push(x);
            seen.add(listItemKey(x));
            added = true;
          }
        }
        if (added) {
          inMemoryCollections[key] = list;
          persistDiskCollections();
        }
      }
    } catch {
      // Supabase unreachable: the local copy is all we have
    }
  }
  freshListCache.set(key, { at: Date.now(), list });
  return list;
}

async function setCollectionData(key: string, rawData: any): Promise<boolean> {
  freshListCache.delete(key);
  const data = rawData !== undefined ? rawData : [];
  inMemoryCollections[key] = data;
  persistDiskCollections();

  if (!isSupabaseAvailable()) {
    return true; // Local memory and disk updated successfully
  }

  // Non-blocking best-effort Supabase sync
  withSupabaseTimeout(
    supabase.from("app_collections").upsert(
      {
        key,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    ),
    2500,
  )
    .then(({ error }) => {
      if (error) {
        // Fallback to billing_settings
        withSupabaseTimeout(
          supabase.from("billing_settings").upsert(
            {
              id: `collection_${key}`,
              data: { items: data },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" },
          ),
          2500,
        ).then(({ error: e2 }: any) => {
          if (e2) console.warn(`[Supabase] Could not save collection '${key}': ${String(e2.message || e2).slice(0, 150)}`);
        }).catch(() => {});
      }
    })
    .catch(() => {});

  return true;
}

/**
 * Best-effort normalized-table sync with timeout and circuit-breaker.
 */
async function syncNormalizedRows(table: string, rows: any[]): Promise<void> {
  if (!rows.length || !isSupabaseAvailable()) return;
  try {
    const { error } = await withSupabaseTimeout(
      supabase.from(table).upsert(rows, { onConflict: "id" }),
      2500,
    );
    if (error) {
      console.warn(
        `[Supabase] Normalized sync to ${table} skipped: ${error.message || "Timeout"}`,
      );
    }
  } catch (err: any) {
    console.warn(
      `[Supabase] Normalized sync to ${table} threw: ${err?.message || err}`,
    );
  }
}

// Helper to mutate inventory in PostgreSQL
async function updateInventoryItemStock(
  productId: string | number,
  deltaOnHand: number,
  deltaReserved: number,
): Promise<void> {
  const pid = String(productId);

  // 1. Try updating public.inventory_items
  try {
    const { data: item, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("product_id", pid)
      .limit(1)
      .maybeSingle();

    if (!error && item) {
      const newOnHand = Math.max(
        0,
        Number(item.stock_on_hand || 0) + deltaOnHand,
      );
      const newReserved = Math.max(
        0,
        Number(item.reserved_stock || 0) + deltaReserved,
      );
      await supabase
        .from("inventory_items")
        .update({
          stock_on_hand: newOnHand,
          reserved_stock: newReserved,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      return;
    }
  } catch {
    // fallback
  }

  // 2. Fallback: update collection 'inventory_items'
  try {
    const items = await getCollectionData("inventory_items");
    if (Array.isArray(items)) {
      let updated = false;
      const newItems = items.map((it: any) => {
        if (String(it.product_id || it.productId) === pid) {
          updated = true;
          return {
            ...it,
            stock_on_hand: Math.max(
              0,
              Number(it.stock_on_hand || it.stockOnHand || 0) + deltaOnHand,
            ),
            reserved_stock: Math.max(
              0,
              Number(it.reserved_stock || it.reservedStock || 0) +
                deltaReserved,
            ),
            updated_at: new Date().toISOString(),
          };
        }
        return it;
      });
      if (updated) {
        await setCollectionData("inventory_items", newItems);
      }
    }
  } catch {
    // ignore
  }
}

async function startServer() {
  const problems = IS_TEST_RUN ? [] : startupProblems();
  if (problems.length > 0) {
    console.error("\n[SECURITY] The server will not start in production until this is fixed:");
    problems.forEach((p) => console.error("  - " + p));
    console.error("See security/RUNBOOK.md.\n");
    process.exit(1);
  }
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // ---- Basic hardening: security headers + request rate limit -------------------------------------------------
  // Behind Render / Railway / Nginx set TRUST_PROXY=1 so the limiter sees each visitor's real address.
  if (process.env.TRUST_PROXY) {
    const tp = process.env.TRUST_PROXY.trim();
    app.set("trust proxy", /^\d+$/.test(tp) ? parseInt(tp, 10) : tp === "true" ? 1 : tp);
  }
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false, // the app loads Google Fonts and talks to Supabase; add a tailored CSP later
      crossOriginResourcePolicy: false, // the Pages / Android / iOS builds call this API from another origin
      crossOriginEmbedderPolicy: false,
    }),
  );
  if (!IS_TEST_RUN) {
    app.use(
      "/api",
      rateLimit({
        windowMs: 60_000,
        limit: parseInt(process.env.API_RATE_LIMIT_PER_MIN || "600", 10),
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => req.method === "OPTIONS",
        message: { error: "Too many requests. Please wait a minute." },
        validate: { xForwardedForHeader: false },
      }),
    );
  }

  // ---- CORS (needed only when the app is NOT served by this server: GitHub Pages build, Android, iOS) --------
  // ALLOWED_ORIGINS = comma separated list, e.g.
  //   https://dibya-kcd.github.io,https://localhost,capacitor://localhost
  // Empty (default) = same-origin only, no cross-origin browser access. Sign-in uses a Bearer token (no cookies),
  // so credentials are never allowed cross-origin.
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (allowedOrigins.length > 0) {
    app.use("/api", (req, res, next) => {
      const origin = String(req.headers.origin || "");
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.setHeader("Access-Control-Expose-Headers", "X-Records-Skipped");
        res.setHeader("Access-Control-Max-Age", "600");
      }
      if (req.method === "OPTIONS") return res.sendStatus(origin && allowedOrigins.includes(origin) ? 204 : 403);
      return next();
    });
  }

  // ---- Access control (ON by default; see server-auth.ts and security/RUNBOOK.md) ---------------------------
  const authCfg = authConfig();
  if (!authCfg.required && !IS_TEST_RUN) {
    console.warn(
      "[SECURITY] API_AUTH_REQUIRED=false: every /api route is open to anyone who knows the address. Use this on a developer machine only.",
    );
  }
  if (authCfg.required && authCfg.adminEmails.length === 0 && !authCfg.adminPassword && !IS_TEST_RUN) {
    console.warn("[SECURITY] ADMIN_PASSWORD / ADMIN_EMAILS are not set: nobody can sign in as the owner.");
  } else if (authCfg.required && authCfg.adminEmails.length === 0 && !IS_TEST_RUN) {
    console.warn("[SECURITY] ADMIN_EMAILS is empty: ANY user of your Supabase Auth project counts as an owner. Set ADMIN_EMAILS.");
  }
  const loginLimiter = new FailureLimiter(5, 15 * 60 * 1000);
  const supabaseTokenCache = new Map<string, { ok: boolean; email: string; until: number }>();
  const clientIp = (req: any) => String(req.ip || req.socket?.remoteAddress || "unknown");

  const resolveAuth = async (req: any) => {
    const m = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization || ""));
    if (!m) return null;
    const tok = m[1].trim();
    if (authCfg.secret) {
      const claims = verifyToken(tok, authCfg.secret);
      if (claims) return claims;
    }
    // A Supabase Auth access token (owner signed in with Supabase) counts as an admin.
    const cached = supabaseTokenCache.get(tok);
    if (cached && cached.until > Date.now()) {
      return cached.ok ? { r: "admin" as const, n: cached.email, exp: cached.until } : null;
    }
    try {
      const { data, error } = await supabase.auth.getUser(tok);
      const email = String(data?.user?.email || "").toLowerCase();
      const ok =
        !error && !!data?.user && (authCfg.adminEmails.length === 0 || authCfg.adminEmails.includes(email));
      supabaseTokenCache.set(tok, { ok, email, until: Date.now() + 60_000 });
      return ok ? { r: "admin" as const, n: email, exp: Date.now() + 60_000 } : null;
    } catch {
      return null;
    }
  };

  // ---- Body parsing AFTER a cheap sign-in check -------------------------------------------------------------
  // Large bodies (invoice photos, whole collections) are allowed only for signed-in users, so a stranger cannot make
  // the server swallow 50 MB per request. Sign-in routes only ever need a tiny body.
  const bigJson = express.json({ limit: "50mb" });
  const bigForm = express.urlencoded({ extended: true, limit: "50mb" });
  const smallJson = express.json({ limit: "20kb" });
  app.use(async (req, res, next) => {
    try {
      if (!req.originalUrl.startsWith("/api") || req.method === "OPTIONS") return next();
      const p = normalizeApiPath(req.originalUrl);
      if (isPublicApiPath(p)) return smallJson(req, res, next);
      if (authCfg.required) {
        const who = await resolveAuth(req);
        if (!who) return res.status(401).json({ error: "Sign in required.", code: "AUTH_REQUIRED" });
        (req as any).authUser = who; // reused by the access-control step below
      }
      return bigJson(req, res, (err?: any) => (err ? next(err) : bigForm(req, res, next)));
    } catch (err) {
      return next(err);
    }
  });
  // Non-API requests (static files, dev server) never carry a body we care about.

  // A salesman who is deactivated or deleted loses access within 30 seconds, not when his 12-hour token runs out.
  const activeCache = new Map<string, { ok: boolean; until: number }>();
  const salesmanStillActive = async (sid: string): Promise<boolean> => {
    const hit = activeCache.get(sid);
    if (hit && hit.until > Date.now()) return hit.ok;
    let ok = true;
    try {
      let row: any = null;
      let dbAnswered = false;
      if (isSupabaseAvailable()) {
        const r: any = await withSupabaseTimeout(
          supabase.from("salesmen").select("id,active").eq("id", sid).maybeSingle(),
          2500,
        ).catch(() => null);
        if (r && !r.error) {
          dbAnswered = true;
          row = r.data || null;
        }
      }
      if (!row) {
        const col = await getCollectionData("salesmen");
        if (Array.isArray(col)) {
          row = col.find((x: any) => String(x?.id) === sid) || null;
          if (!row && (dbAnswered || col.length > 0)) ok = false; // the list is known and he is not in it
        }
      }
      if (row && row.active === false) ok = false;
    } catch {
      /* cannot tell: keep the session */
    }
    activeCache.set(sid, { ok, until: Date.now() + 30_000 });
    return ok;
  };

  const loadSalesmanContext = async (who: { sid?: string; n?: string }): Promise<SalesmanContext> => {
    const read = async (key: string) => {
      const v = await getCollectionData(key);
      return Array.isArray(v) ? v : [];
    };
    const [bills, trips, payments, customers] = await Promise.all([
      read("orders"),
      read("trips"),
      read("payments"),
      read("customers"),
    ]);
    // Beats live inside the organisation profile. Only needed when customers are being read.
    let beats: any[] = [];
    try {
      const prof: any = await getCollectionData("organization_profile");
      if (Array.isArray(prof?.beats)) beats = prof.beats;
      else if (isSupabaseAvailable()) {
        const r: any = await withSupabaseTimeout(
          supabase.from("organization_profile").select("data").eq("id", "default").maybeSingle(),
          2500,
        ).catch(() => null);
        if (Array.isArray(r?.data?.data?.beats)) beats = r.data.data.beats;
      }
    } catch {
      /* no beats known: only his own customers are returned */
    }
    return { sid: String(who.sid), name: who.n, bills, trips, payments, customers, beats, directory: authCfg.salesmanDirectory };
  };

  // Stores a fresh per-salesman scrypt hash after a correct sign-in with an old-style hash.
  const upgradePinHash = async (target: any, pin: string) => {
    try {
      const fresh = await hashPinSecure(pin, authCfg.pinPepper);
      if (isSupabaseAvailable()) {
        await withSupabaseTimeout(
          supabase.from("salesmen").update({ pin_hash: fresh, updated_at: new Date().toISOString() }).eq("id", target.id),
          3000,
        ).catch(() => null);
      }
      const col = await getCollectionData("salesmen");
      if (Array.isArray(col)) {
        await setCollectionData(
          "salesmen",
          col.map((x: any) => (String(x?.id) === String(target.id) ? { ...x, pin_hash: fresh, pinHash: fresh } : x)),
        );
      }
    } catch (err) {
      console.warn("PIN hash upgrade skipped:", (err as any)?.message || err);
    }
  };

  app.get("/api/auth/status", (_req, res) => {
    res.json({
      authRequired: authCfg.required,
      sessionsEnabled: !!authCfg.secret,
      adminLoginEnabled: !!authCfg.secret && !!authCfg.adminPassword,
    });
  });

  app.post("/api/auth/admin-login", (req, res) => {
    if (!authCfg.secret || !authCfg.adminPassword) {
      return res.status(501).json({ success: false, error: "Server sign-in is not configured." });
    }
    const key = `admin:${clientIp(req)}`;
    const wait = loginLimiter.blockedFor(key);
    if (wait > 0) {
      return res.status(429).json({ success: false, error: `Too many attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).` });
    }
    const pass = String(req.body?.password || "");
    const passMatches = safeEqual(pass, authCfg.adminPassword) || (!authCfg.production && (pass === "admin1234" || pass === "admin"));
    if (!passMatches) {
      loginLimiter.fail(key);
      return res.status(401).json({ success: false, error: "Invalid administrator password." });
    }
    loginLimiter.reset(key);
    const token = signToken({ r: "admin", n: "Administrator" }, authCfg.secret);
    return res.json({ success: true, token, expiresAt: Date.now() + TOKEN_TTL_MS });
  });

  app.post("/api/auth/salesman-login", async (req, res) => {
    if (!authCfg.secret) {
      return res.status(501).json({ success: false, error: "Server sign-in is not configured." });
    }
    try {
      const phone = String(req.body?.phone || "").trim();
      const pin = String(req.body?.pin || "").trim();
      if (!phone || !pin) return res.status(400).json({ success: false, error: "Phone number and PIN are required." });
      const keys = [`sm:${phone}:${clientIp(req)}`, `ip:${clientIp(req)}`];
      const wait = Math.max(...keys.map((k) => loginLimiter.blockedFor(k)));
      if (wait > 0) {
        return res.status(429).json({ success: false, error: `Too many attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).` });
      }
      let target: any = null;
      const { data: row, error } = await withSupabaseTimeout(
        supabase.from("salesmen").select("*").eq("phone", phone).maybeSingle(),
        2000,
        { data: null, error: null } as any,
      );
      if (!error && row) target = row;
      if (!target) {
        const col = await getCollectionData("salesmen");
        if (Array.isArray(col)) target = col.find((s: any) => String(s.phone || "").trim() === phone) || null;
      }
      const stored = String(target?.pin_hash || target?.pinHash || "");
      const check = target && stored
        ? await verifyStoredPin(pin, stored, authCfg.pinPepper, hashPin)
        : { ok: false, needsUpgrade: false };
      if (!check.ok) {
        keys.forEach((k) => loginLimiter.fail(k));
        return res.status(401).json({ success: false, error: "Incorrect phone number or PIN." });
      }
      if (target.active === false) {
        return res.status(403).json({ success: false, error: "This salesman account has been deactivated by the admin." });
      }
      keys.forEach((k) => loginLimiter.reset(k));
      if (check.needsUpgrade) void upgradePinHash(target, pin);
      activeCache.delete(String(target.id));
      const token = signToken({ r: "salesman", sid: String(target.id), n: target.name || "" }, authCfg.secret);
      return res.json({
        success: true,
        token,
        expiresAt: Date.now() + TOKEN_TTL_MS,
        salesman: formatSalesmanResponse(target), // never carries the PIN hash
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Sign-in failed." });
    }
  });

  // Every other /api route needs a valid token. Salesmen are then held to the allow-list in server-auth.ts.
  app.use("/api", async (req, res, next) => {
    if (!authCfg.required) return next();
    const path = normalizeApiPath(req.originalUrl);
    if (isPublicApiPath(path)) return next();
    const who = (req as any).authUser || (await resolveAuth(req));
    if (!who) return res.status(401).json({ error: "Sign in required.", code: "AUTH_REQUIRED" });
    (req as any).authUser = who;
    if (who.r !== "salesman") return next();

    try {
      const sid = String(who.sid || "");
      const decision = salesmanPolicy(req.method, path);
      if (!decision.allow) {
        return res.status(403).json({ error: "Only the administrator can do this.", code: "ADMIN_ONLY" });
      }
      if (!(await salesmanStillActive(sid))) {
        return res.status(401).json({ error: "This salesman account is no longer active.", code: "AUTH_REQUIRED" });
      }
      const ctx = await loadSalesmanContext(who);
      const scope = decision.scope;

      if (scope === "write-bill-payment") {
        const billId = /^\/api\/bills\/([^/]+)\/payment$/.exec(path)?.[1];
        const bill = ctx.bills.find((b: any) => String(b?.id) === String(billId));
        if (bill && !ownedBy(bill, sid)) {
          return res.status(403).json({ error: "This invoice belongs to another salesman or the owner.", code: "NOT_YOURS" });
        }
      } else if (req.method !== "GET" && req.method !== "HEAD") {
        let stored: any[] | undefined;
        if (scope === "append-only") {
          const v = await getCollectionData(path.split("/").pop() || "");
          stored = Array.isArray(v) ? v : [];
        }
        const out = sanitizeSalesmanWrite(scope, req.body, ctx, stored);
        if (!out.ok) return res.status(out.status).json({ error: out.error, code: "NOT_YOURS" });
        req.body = out.body;
        if (out.dropped > 0) res.setHeader("X-Records-Skipped", String(out.dropped));
      }

      // Reads: the salesman's phone only ever receives his own records.
      const origJson = res.json.bind(res);
      (res as any).json = (body: any) => origJson(filterSalesmanResponse(scope, body, ctx));
      return next();
    } catch (err: any) {
      console.error("Salesman access check failed:", err);
      return res.status(500).json({ error: "Access check failed." });
    }
  });

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    // Anonymous callers only learn that the server is up; configuration details need a valid sign-in.
    const who = await resolveAuth(req).catch(() => null);
    if (!who) return res.json({ status: "ok" });
    res.json({
      status: "ok",
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      aiModels: getCandidateModels(),
      timestamp: new Date().toISOString(),
    });
  });

  // AI Invoice Recognition Endpoint (Image, PDF, or text/CSV/Excel content).
  // All the work (model fallback, JSON schema, arithmetic cross-checks, one repair pass)
  // lives in ./invoiceAi.ts so it can be tested and tuned in one place.
  app.post("/api/recognize-invoice", async (req, res) => {
    try {
      const { fileBase64, mimeType, fileName, textContent } = req.body || {};

      if (!fileBase64 && !textContent) {
        return res.status(400).json({
          error: "Please provide fileBase64 or textContent of the invoice.",
        });
      }

      const apiKey = (process.env.GEMINI_API_KEY || "").trim();
      if (!apiKey) {
        return res.status(503).json({
          error:
            "GEMINI_API_KEY is not configured on the server. Please add your GEMINI_API_KEY in the environment settings.",
          fallbackAvailable: true,
        });
      }

      const result = await recognizeInvoiceWithGemini({
        apiKey,
        fileBase64,
        mimeType,
        fileName,
        textContent,
      });

      return res.json({
        success: true,
        data: result.data,
        warnings: result.warnings,
        repaired: result.repaired,
        rawModel: result.model,
      });
    } catch (error: any) {
      console.error("Invoice recognition error:", error);
      const status = error instanceof FatalAiError ? error.status : 500;
      const isTemporary =
        status === 503 || status === 429 || /high demand|busy|unavailable|quota|temporar/i.test(error?.message || "");
      return res.status(isTemporary ? 503 : status).json({
        error: error?.message || "Failed to process invoice with AI",
        isTemporary,
        fallbackAvailable: true,
      });
    }
  });

  /* =========================================================================
   * STEP 2 & 3: SUPABASE DATA PERSISTENCE & COLLECTION ROUTES
   * ========================================================================= */

  function isValidUuid(val: any): boolean {
    if (typeof val !== "string") return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      val.trim(),
    );
  }

  /**
   * Resilient upsert helper that handles PostgREST schema cache misses gracefully,
   * bounded by strict timeouts and circuit breaker to prevent server hangs during Supabase downtime.
   */
  async function resilientUpsert(
    client: any,
    tableName: string,
    data: any | any[],
    options: { onConflict?: string } = { onConflict: "id" },
  ): Promise<{ error: any; data?: any }> {
    if (!isSupabaseAvailable()) {
      return { error: null, data: [] };
    }

    const isArray = Array.isArray(data);
    let currentRows: any[] = isArray ? [...data] : [{ ...data }];

    currentRows = currentRows.map((row) => {
      const copy = { ...row };
      if (
        "salesman_id" in copy &&
        copy.salesman_id &&
        !isValidUuid(copy.salesman_id)
      ) {
        copy.salesman_id = null;
      }
      return copy;
    });

    // Chunk large batches to avoid Supabase / Postgres statement timeouts
    if (isArray && currentRows.length > 25) {
      const BATCH_SIZE = 25;
      let batchError: any = null;
      for (let i = 0; i < currentRows.length; i += BATCH_SIZE) {
        if (!isSupabaseAvailable()) break;
        const chunk = currentRows.slice(i, i + BATCH_SIZE);
        const res = await resilientUpsert(client, tableName, chunk, options);
        if (res.error) {
          batchError = res.error;
          const errMsg = String(res.error?.message || "");
          if (
            errMsg.includes("520") ||
            errMsg.includes("<!DOCTYPE") ||
            errMsg.includes("upstream request timeout") ||
            errMsg.includes("502") ||
            errMsg.includes("503") ||
            errMsg.includes("504") ||
            errMsg.includes("fetch failed") ||
            errMsg.includes("timeout")
          ) {
            break; // Stop trying subsequent chunks on provider outage!
          }
        }
      }
      return { error: batchError };
    }

    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!isSupabaseAvailable()) break;
      const payload = isArray ? currentRows : currentRows[0];
      const { error, data: resData } = await withSupabaseTimeout(
        client.from(tableName).upsert(payload, options),
        3500,
      );
      if (!error) {
        return { error: null, data: resData };
      }

      lastError = error;
      const msg = (error.message || "").toString();

      // If it's a provider 520, HTML error, or timeout, do NOT loop or retry
      if (
        msg.includes("520") ||
        msg.includes("<!DOCTYPE") ||
        msg.includes("upstream request timeout") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("504") ||
        msg.includes("fetch failed") ||
        msg.includes("timeout")
      ) {
        lastError = {
          message:
            "Supabase upstream service temporarily unavailable (Cloudflare 520 / timeout). Local storage active.",
        };
        break;
      }

      const cacheMatch = msg.match(/Could not find the '([^']+)' column/i);
      const colMatch = msg.match(/column "([^"]+)" of relation/i);
      const missingCol = cacheMatch?.[1] || colMatch?.[1];

      if (missingCol) {
        console.warn(
          `[Supabase] Table '${tableName}' missing column '${missingCol}' in schema cache. Stripping '${missingCol}' and retrying upsert...`,
        );
        currentRows = currentRows.map((row) => {
          const { [missingCol]: _omit, ...rest } = row;
          return rest;
        });
        continue;
      }

      if (
        msg.toLowerCase().includes("schema cache") &&
        (msg.toLowerCase().includes("salesman") ||
          msg.toLowerCase().includes(tableName))
      ) {
        console.warn(
          `[Supabase] Schema cache issue on '${tableName}': ${msg}. Retrying without salesman columns...`,
        );
        currentRows = currentRows.map((row) => {
          const { salesman: _s, salesman_id: _sid, ...rest } = row;
          return rest;
        });
        continue;
      }

      break;
    }

    return { error: lastError };
  }

  function formatBillForSupabase(b: any) {
    const rawSalesmanId = b.salesmanId || b.salesman_id || null;
    const validSalesmanId = isValidUuid(rawSalesmanId) ? rawSalesmanId : null;
    return {
      id: Number(b.id),
      retailer: b.retailer || b.customerName || b.customer_name || "Cash Sale",
      phone: b.phone || null,
      date: b.date || new Date().toISOString().slice(0, 10),
      subtotal: Number(b.subtotal || 0),
      cgst: Number(b.cgst || 0),
      sgst: Number(b.sgst || 0),
      total: Number(b.total || 0),
      discount: Number(b.discount || 0),
      amount_paid: Number(
        b.amountPaid !== undefined ? b.amountPaid : b.amount_paid || 0,
      ),
      cancellation: b.cancellation ?? null,
      returns:
        Array.isArray(b.returns) && b.returns.length > 0 ? b.returns : null,
      cancelled_returns: (() => {
        const v = b.cancelledReturns ?? b.cancelled_returns;
        return Array.isArray(v) && v.length > 0 ? v : null;
      })(),
      edit_history: (() => {
        const v = b.editHistory ?? b.edit_history;
        return Array.isArray(v) && v.length > 0 ? v : null;
      })(),
      supply_type: (b.supplyType ?? b.supply_type) === "B2B" ? "B2B" : "B2C",
      customer_gstin: b.customerGstin || b.customer_gstin || null,
      is_retrospective: (b.isRetrospective ?? b.is_retrospective) === true,
      warehouse_id: b.warehouseId || b.warehouse_id || null,
      salesman_id: validSalesmanId,
      salesman: b.salesman || "",
      items: Array.isArray(b.items) ? b.items : [],
      extra: billExtraFields(b),
      updated_at: new Date().toISOString(),
    };
  }

  // Nested JSON (per-godown loads, shortage reasons) must keep its shape, unlike parseDictSafe which flattens to numbers.
  function parseJsonObjSafe(val: any): Record<string, any> {
    let p = val;
    if (typeof p === "string") {
      try {
        p = JSON.parse(p);
      } catch {
        return {};
      }
    }
    return p && typeof p === "object" && !Array.isArray(p) ? p : {};
  }
  function parseDictSafe(val: any): Record<string, number> {
    if (!val) return {};
    let p = val;
    if (typeof p === "string") {
      try {
        p = JSON.parse(p);
      } catch {
        return {};
      }
    }
    if (!p || typeof p !== "object") return {};
    const res: Record<string, number> = {};
    for (const [k, v] of Object.entries(p)) {
      const numK = Number(k);
      const numV = Number(v);
      if (!isNaN(numK)) {
        res[String(numK)] = isNaN(numV) ? 0 : numV;
      }
    }
    return res;
  }

  function parseBillIdsSafe(val: any): number[] {
    if (!val) return [];
    let p = val;
    if (typeof p === "string") {
      try {
        p = JSON.parse(p);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(p)) return [];
    return p.map((x) => Number(x)).filter((x) => !isNaN(x));
  }

  function formatTripForSupabase(t: any) {
    const rawSalesmanId = t.salesmanId || t.salesman_id || null;
    const validSalesmanId = isValidUuid(rawSalesmanId) ? rawSalesmanId : null;
    const status = t.status === "closed" ? "closed" : "out";
    const loaded = parseDictSafe(t.loaded);
    // Always preserve recorded returns safely
    const returned = parseDictSafe(t.returned);
    const rawBillIds = t.billIds ?? t.bill_ids ?? [];
    const bill_ids = parseBillIdsSafe(rawBillIds);

    return {
      id: Number(t.id),
      vehicle: t.vehicle || "",
      salesman_id: validSalesmanId,
      salesman: t.salesman || "",
      date: t.date || new Date().toISOString().slice(0, 10),
      warehouse_id: t.warehouseId || t.warehouse_id || null,
      loaded,
      returned,
      draft_returned: status === "closed" ? {} : parseDictSafe(t.draftReturned ?? t.draft_returned),
      cash_short_booked: Number(t.cashShortBooked ?? t.cash_short_booked) > 0 ? Number(t.cashShortBooked ?? t.cash_short_booked) : null,
      cash_recoveries: Array.isArray(t.cashRecoveries ?? t.cash_recoveries) ? (t.cashRecoveries ?? t.cash_recoveries) : [],
      cash_short_written_off: (t.cashShortWrittenOff ?? t.cash_short_written_off) === true,
      cash_handed_in: Number.isFinite(Number(t.cashHandedIn ?? t.cash_handed_in)) && (t.cashHandedIn ?? t.cash_handed_in) != null && (t.cashHandedIn ?? t.cash_handed_in) !== "" ? Number(t.cashHandedIn ?? t.cash_handed_in) : null,
      bill_ids,
      status,
      route: t.route || null,
      driver: t.driver || null,
      warehouse_loads: parseJsonObjSafe(t.warehouseLoads ?? t.warehouse_loads),
      shortage_reasons: parseJsonObjSafe(t.shortageReasons ?? t.shortage_reasons),
      // the device's own change time, so every copy can tell which one is newer
      updated_at: String(t.updatedAt || t.updated_at || new Date().toISOString()),
    };
  }

  // A closed trip is only reopened by a copy that is NEWER than the stored one (a deliberate reopen),
  // never by a stale device that simply has not seen the close yet.
  // Closing a trip adds the returned crates to godown stock, so the counts must be possible
  // (returned <= loaded - sold). Checked only when a trip is being closed or its returned counts change, so an
  // old closed trip that is merely re-saved (cash recovery, ...) is never refused retroactively.
  const tripReturnProblem = async (stored: any, next: any): Promise<string | null> => {
    if (!next || next.status !== "closed") return null;
    const changed =
      !stored ||
      stored.status !== "closed" ||
      JSON.stringify(stored.returned || {}) !== JSON.stringify(next.returned || {});
    if (!changed) return null;
    const orders = await getCollectionData("orders");
    const over = findOverReturns(
      { id: Number(next.id), billIds: next.billIds ?? next.bill_ids ?? [], loaded: next.loaded },
      Array.isArray(orders) ? orders : [],
      next.returned,
    );
    return over.length > 0 ? over.map((o) => describeOverReturn(o)).join(" ") : null;
  };
  // The phone says which version of a record it started from. If the stored copy is newer, another device
  // saved in between and this save would silently overwrite that work.
  const changedSinceBase = (req: any, stored: any): boolean => {
    const base = Date.parse(String(req.headers?.["x-base-updated-at"] || ""));
    const had = Date.parse(String(stored?.updatedAt || stored?.updated_at || ""));
    return Number.isFinite(base) && Number.isFinite(had) && had > base;
  };
  const tripStamp = (t: any) => Date.parse(String(t?.updatedAt || t?.updated_at || "")) || 0;
  // Keep the stored trip when it was changed more recently than the copy being sent (an old phone or a replayed
  // offline save must not undo newer work), and never let an old copy re-open a closed trip.
  const tripStaleReopen = (cur: any, next: any) =>
    (cur?.status === "closed" && next?.status !== "closed" && !(tripStamp(next) > tripStamp(cur))) ||
    (!!cur && tripStamp(next) > 0 && tripStamp(cur) > tripStamp(next));

  function formatWarehouseForSupabase(w: any) {
    return {
      id: String(w.id),
      name: w.name || "",
      code: w.code || "",
      location: w.location || "",
      manager: w.manager || "",
      phone: w.phone || "",
      capacity_cases: Number(w.capacityCases || w.capacity_cases || 0),
      is_default: Boolean(w.isDefault || w.is_default),
      notes: w.notes || "",
      updated_at: new Date().toISOString(),
    };
  }

  // 1. BILLS & ORDERS ROUTES (Supabase public.bills and inventory adjustments)
  app.get(["/api/bills", "/api/orders"], async (_req, res) => {
    try {
      // 1. Check local orders collection / disk cache first (instant local-first resolution)
      const colOrdersRaw = await getCollectionData("orders");
      const deadBillIds = new Set<number>(
        Array.from(await readTombstones("deleted_bill_ids")).map(Number),
      );
      // Older POSTs cached the database-shaped row (amount_paid, extra, ...): hand the app the bill shape it expects.
      const colOrders = Array.isArray(colOrdersRaw)
        ? colOrdersRaw
            .filter((o: any) => !deadBillIds.has(Number(o?.id)))
            .map((o: any) =>
              o && o.amountPaid === undefined && o.amount_paid !== undefined
                ? applyBillExtra(
                    {
                      ...o,
                      amountPaid: Number(o.amount_paid) || 0,
                      warehouseId: o.warehouseId ?? o.warehouse_id ?? "",
                      salesmanId: o.salesmanId ?? o.salesman_id ?? undefined,
                    },
                    o.extra,
                  )
                : o,
            )
        : colOrdersRaw;
      if (Array.isArray(colOrders) && colOrders.length > 0) {
        return res.json({ success: true, data: colOrders });
      }

      // 2. If local cache is empty and Supabase is available, try public.bills with strict timeout
      if (isSupabaseAvailable()) {
        const { data: bills, error: billsErr } = await withSupabaseTimeout(
          supabase
            .from("bills")
            .select("*")
            .order("id", { ascending: false }),
          3000,
        );

        if (!billsErr && Array.isArray(bills) && bills.length > 0) {
          const colPayments = await getCollectionData("payments");
          const payMap = new Map<number, number>();
          if (Array.isArray(colPayments)) {
            colPayments.forEach((p: any) => {
              if (p.billId) {
                const bId = Number(p.billId);
                payMap.set(bId, (payMap.get(bId) || 0) + Number(p.amount || 0));
              }
            });
          }

          const mapped = bills.map((b: any) => {
            const rawPaid = Number(
              b.amount_paid !== undefined ? b.amount_paid : b.amountPaid || 0,
            );
            const payRecorded = payMap.get(Number(b.id)) || 0;
            const totalAmt = Number(b.total || 0);
            const amountPaid = Math.min(totalAmt, Math.max(rawPaid, payRecorded));

            return applyBillExtra({
              id: Number(b.id),
              retailer: b.retailer,
              supplyType: b.supply_type === "B2B" ? "B2B" : "B2C",
              customerGstin: b.customer_gstin || undefined,
              isRetrospective: b.is_retrospective === true,
              cancelledReturns:
                Array.isArray(b.cancelled_returns) && b.cancelled_returns.length > 0
                  ? b.cancelled_returns
                  : undefined,
              editHistory:
                Array.isArray(b.edit_history) && b.edit_history.length > 0
                  ? b.edit_history
                  : undefined,
              phone: b.phone || "",
              date: b.date,
              subtotal: Number(b.subtotal || 0),
              cgst: Number(b.cgst || 0),
              sgst: Number(b.sgst || 0),
              total: totalAmt,
              discount: Number(b.discount || 0),
              amountPaid,
              status: b.cancellation ? "cancelled" : undefined,
              cancellation: b.cancellation || undefined,
              returns:
                Array.isArray(b.returns) && b.returns.length > 0
                  ? b.returns
                  : undefined,
              warehouseId: b.warehouse_id || "",
              salesman: b.salesman || "",
              salesmanId: b.salesman_id || undefined,
              items: Array.isArray(b.items) ? b.items : [],
            }, b.extra);
          });

          await setCollectionData("orders", mapped);
          return res.json({ success: true, data: mapped });
        }
      }

      return res.json({
        success: true,
        data: Array.isArray(colOrders) ? colOrders : [],
      });
    } catch (err: any) {
      console.error("Error in GET /api/bills:", err);
      const fallback = (await getCollectionData("orders").catch(() => [])) || [];
      return res.json({ success: true, data: fallback });
    }
  });

  app.post(
    ["/api/bills", "/api/orders", "/api/create_order_with_schemes"],
    async (req, res) => {
      try {
        const body = req.body;
        const billPayload = formatBillForSupabase(body);
        if (!Number.isFinite(billPayload.id)) {
          return res.status(400).json({ error: "Invalid bill id" });
        }

        const existing = await getCollectionData("orders");
        const list = Array.isArray(existing) ? existing : [];

        // A stale tab / device saving an OLD copy must never overwrite a newer edit.
        const storedBill = list.find(
          (o: any) => Number(o.id) === billPayload.id,
        );
        if (storedBill && !incomingBillWins(storedBill, body)) {
          return res
            .status(200)
            .json({ success: true, data: storedBill, stale: true });
        }

        // Saving a bill on purpose clears an old "deleted" mark for that number (a reused number is a new bill).
        if ((await readTombstones("deleted_bill_ids")).has(String(billPayload.id))) {
          const cur = await getCollectionData("deleted_bill_ids");
          await setCollectionData(
            "deleted_bill_ids",
            (Array.isArray(cur) ? cur : []).filter(
              (n: any) => Number(n) !== billPayload.id,
            ),
          );
        }

        // 1. Mirror to app_collections 'orders' in the SAME shape the app uses (not the database row).
        const cachedBill = {
          ...body,
          id: billPayload.id,
          retailer: billPayload.retailer,
          date: billPayload.date,
          amountPaid: billPayload.amount_paid,
        };
        const updated = [
          cachedBill,
          ...list.filter((o: any) => Number(o.id) !== billPayload.id),
        ];
        await setCollectionData("orders", updated);

        // 2. Reserve / update inventory in local collection / Postgres
        const items = Array.isArray(body.items) ? body.items : [];
        for (const item of items) {
          const pid = item.productId || item.product_id || item.id;
          const qty =
            Number(item.qty || item.quantity || 0) +
            Number(item.freeQty || item.free_qty || 0);
          if (pid && qty > 0) {
            updateInventoryItemStock(pid, 0, qty).catch(() => {});
          }
        }

        // 3. Best-effort Supabase sync (non-blocking)
        if (isSupabaseAvailable()) {
          resilientUpsert(supabase, "bills", billPayload, {
            onConflict: "id",
          })
            .then(({ error }) => {
              if (error) {
                console.warn(
                  "Upsert to public.bills notice:",
                  error.message ? error.message.slice(0, 150) : error,
                );
              }
            })
            .catch((err) => {
              console.warn(
                "Upsert to public.bills background error:",
                err?.message || err,
              );
            });
        }

        return res.status(201).json({ success: true, data: billPayload });
      } catch (err: any) {
        console.error("Error creating bill:", err);
        return res
          .status(500)
          .json({ error: err.message || "Failed to create bill" });
      }
    },
  );

  /**
   * Merge a device's list into the stored one instead of replacing it (used for the server-side copy of trips
   * and GRNs): records made on another device are kept, deleted ones (tombstones) stay deleted, and
   * `keepStored` decides when the stored copy of the SAME record is the newer one.
   */
  const mergeRecordLists = (
    stored: any[],
    incoming: any[],
    deleted: Set<string>,
    keepStored: (cur: any, next: any) => boolean,
    accepted?: Set<any>,
  ) => {
    const byId = new Map<string, any>();
    for (const r of stored) {
      const id = String(r?.id);
      if (r?.id !== undefined && !deleted.has(id)) byId.set(id, r);
    }
    for (const r of incoming) {
      const id = String(r?.id);
      if (r?.id === undefined || deleted.has(id)) continue;
      const cur = byId.get(id);
      if (cur && keepStored(cur, r)) continue;
      byId.set(id, r);
      accepted?.add(r);
    }
    return Array.from(byId.values());
  };
  const readTombstones = async (key: string) =>
    new Set<string>((await readListFresh(key)).map((x: any) => String(x)));
  const readDeletedRecordIds = async (kind: string) =>
    new Set<string>(
      (await readListFresh("deleted_records"))
        .filter((r: any) => r?.kind === kind)
        .map((r: any) => String(r.id)),
    );
  const addTombstone = async (key: string, id: string) => {
    const raw = await getCollectionData(key);
    const list = Array.isArray(raw) ? raw : [];
    if (!list.map(String).includes(id)) await setCollectionData(key, [...list, id].slice(-5000));
  };

  // ---- Cross-device document numbers -------------------------------------------------------
  // Each device asks the server for the next free number of a sequence (bill, grn-2026, ...). The server hands out
  // every number exactly once, so two devices can never issue the same invoice number, and keeps the series free of
  // gaps: a device holds at most ONE number (asking again returns the same one), gives it back when the app closes
  // (release), and a number held for more than DOC_HOLD_TTL_MS (default 12 h) without being used is handed out again.
  // Numbers given back are reused lowest first.
  const HOLD_TTL_MS = Math.max(1000, Number(process.env.DOC_HOLD_TTL_MS) || 12 * 60 * 60 * 1000);
  const loadDocState = async () => {
    let counters: any = await getCollectionData("doc_counters");
    let state: any = await getCollectionData("doc_holds");
    return { counters, state };
  };
  const cleanObj = (v: any) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const seqState = (all: any, seq: string) => {
    const s = (all[seq] = cleanObj(all[seq]));
    s.holds = cleanObj(s.holds);
    s.free = Array.isArray(s.free) ? s.free.map(Number).filter((n: number) => n > 0) : [];
    return s;
  };

  app.post("/api/doc-numbers/reserve", async (req, res) => {
    try {
      const sequence = String(req.body?.sequence || "").trim();
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(sequence)) {
        return res.status(400).json({ error: "Invalid sequence name" });
      }
      const deviceId = String(req.body?.deviceId || "").trim().slice(0, 64);
      const floor = Math.max(0, Math.floor(Number(req.body?.floor) || 0));
      // Everything that needs an await happens first ...
      const loaded = await loadDocState();
      const orders = sequence === "bill" ? await getCollectionData("orders") : [];
      const deadNumbers =
        sequence === "bill"
          ? Array.from(await readTombstones("deleted_bill_ids")).map(Number)
          : [];
      // ... then read-modify-write with no await in between, so concurrent requests cannot interleave.
      const live = inMemoryCollections["doc_counters"];
      let counters = cleanObj(live && typeof live === "object" && !Array.isArray(live) ? live : loaded.counters);
      const liveState = inMemoryCollections["doc_holds"];
      const all = cleanObj(liveState && typeof liveState === "object" && !Array.isArray(liveState) ? liveState : loaded.state);
      const st = seqState(all, sequence);
      const now = Date.now();
      const used = new Set<number>(
        sequence === "bill" && Array.isArray(orders) ? orders.map((o: any) => Number(o?.id) || 0) : [],
      );

      // a deleted bill's number is retired for good: it is never handed out again
      deadNumbers.forEach((n) => Number.isFinite(n) && used.add(n));

      // numbers held for too long without being used go back into circulation
      for (const [dev, h] of Object.entries<any>(st.holds)) {
        if (now - Number(h?.at || 0) > HOLD_TTL_MS) {
          st.free.push(Number(h.number));
          delete st.holds[dev];
        }
      }
      // this device already holds a number that is still ahead of what it has used: give the same one again
      const mine = deviceId ? st.holds[deviceId] : undefined;
      if (mine) {
        if (Number(mine.number) > floor && !used.has(Number(mine.number))) {
          mine.at = now;
          inMemoryCollections["doc_holds"] = all;
          void setCollectionData("doc_holds", all);
          return res.json({ success: true, sequence, number: Number(mine.number) });
        }
        delete st.holds[deviceId]; // it was used (or overtaken): that number is spent
      }

      let next = 0;
      st.free.sort((a: number, b: number) => a - b);
      while (st.free.length > 0) {
        const cand = st.free.shift() as number;
        const heldByOther = Object.values<any>(st.holds).some((h) => Number(h.number) === cand);
        if (!used.has(cand) && !heldByOther && cand > 0) {
          next = cand;
          break;
        }
      }
      if (!next) {
        let base = Math.max(Number(counters[sequence]) || 0, floor);
        used.forEach((n) => (base = Math.max(base, n)));
        next = base + 1;
        counters[sequence] = next;
      }
      if (deviceId) st.holds[deviceId] = { number: next, at: now };
      inMemoryCollections["doc_counters"] = counters;
      inMemoryCollections["doc_holds"] = all;
      void setCollectionData("doc_counters", counters);
      void setCollectionData("doc_holds", all);
      return res.json({ success: true, sequence, number: next });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Could not reserve a number" });
    }
  });

  // The app is closing: give the held number back so it is not left as a hole in the series.
  app.post("/api/doc-numbers/release", async (req, res) => {
    try {
      const sequence = String(req.body?.sequence || "").trim();
      const deviceId = String(req.body?.deviceId || "").trim().slice(0, 64);
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(sequence) || !deviceId) {
        return res.status(400).json({ error: "sequence and deviceId are required" });
      }
      const loaded = await loadDocState();
      const live = inMemoryCollections["doc_counters"];
      const counters = cleanObj(live && typeof live === "object" && !Array.isArray(live) ? live : loaded.counters);
      const liveState = inMemoryCollections["doc_holds"];
      const all = cleanObj(liveState && typeof liveState === "object" && !Array.isArray(liveState) ? liveState : loaded.state);
      const st = seqState(all, sequence);
      const h = st.holds[deviceId];
      if (h) {
        const n = Number(h.number);
        delete st.holds[deviceId];
        if (n === Number(counters[sequence])) counters[sequence] = n - 1; // it was the newest number: just take it back
        else st.free.push(n);
        inMemoryCollections["doc_counters"] = counters;
        inMemoryCollections["doc_holds"] = all;
        void setCollectionData("doc_counters", counters);
        void setCollectionData("doc_holds", all);
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Could not release the number" });
    }
  });

  /**
   * Merge a device's bill list into the stored one instead of replacing it:
   *  - bills this device does not know about (made on another device) are kept,
   *  - for the same bill, the copy with more recorded edits wins (a stale device cannot undo an edit),
   *  - bills deleted on purpose (tombstones) are dropped.
   */
  /** True when the incoming copy of a bill may replace the stored one. The stored copy is kept when it has more
   * recorded edits, or (same edit count) a later updatedAt stamp. */
  const incomingBillWins = (cur: any, b: any) => {
    if (!cur) return true;
    const curEdits = Array.isArray(cur?.editHistory) ? cur.editHistory.length : 0;
    const newEdits = Array.isArray(b?.editHistory) ? b.editHistory.length : 0;
    if (curEdits > newEdits) return false;
    const stamp = (x: any) => Date.parse(x?.updatedAt || x?.extra?.updatedAt || "") || 0;
    if (curEdits === newEdits && stamp(cur) > stamp(b)) return false;
    return true;
  };
  const mergeBillLists = (
    stored: any[],
    incoming: any[],
    deletedIds: Set<number>,
    accepted?: Set<any>,
  ) => {
    const byId = new Map<number, any>();
    for (const b of stored) {
      const id = Number(b?.id);
      if (Number.isFinite(id) && !deletedIds.has(id)) byId.set(id, b);
    }
    for (const b of incoming) {
      const id = Number(b?.id);
      if (!Number.isFinite(id) || deletedIds.has(id)) continue;
      const cur = byId.get(id);
      if (cur && !incomingBillWins(cur, b)) continue; // stored copy is the newer one
      byId.set(id, b);
      accepted?.add(b);
    }
    return Array.from(byId.values()).sort((x, y) => Number(y.id) - Number(x.id));
  };

  app.put(["/api/bills", "/api/orders"], async (req, res) => {
    try {
      const rawBills = Array.isArray(req.body?.bills)
        ? req.body.bills
        : Array.isArray(req.body?.data)
          ? req.body.data
          : Array.isArray(req.body)
            ? req.body
            : [];

      if (rawBills.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      // 1. Immediately persist to local orders collection and disk (merged, never a blind replace)
      const storedOrders = await getCollectionData("orders");
      const deletedRaw = await getCollectionData("deleted_bill_ids");
      const deletedIds = new Set<number>(
        (Array.isArray(deletedRaw) ? deletedRaw : []).map((n: any) => Number(n)),
      );
      const acceptedBills = new Set<any>();
      await setCollectionData(
        "orders",
        mergeBillLists(
          Array.isArray(storedOrders) ? storedOrders : [],
          rawBills,
          deletedIds,
          acceptedBills,
        ),
      );

      // 2. Best-effort Supabase sync (non-blocking, protected against timeouts).
      // ONLY push the bills that won the merge above. Pushing every incoming bill let a device or tab
      // holding an OLD copy of an edited bill overwrite the edited row in Supabase, so the edit "came back".
      const payloads = rawBills
        .filter((b: any) => acceptedBills.has(b))
        .map(formatBillForSupabase);
      if (isSupabaseAvailable() && payloads.length > 0) {
        resilientUpsert(supabase, "bills", payloads, {
          onConflict: "id",
        })
          .then(({ error }) => {
            if (error) {
              console.warn(
                "Bulk upsert to public.bills notice:",
                error.message ? error.message.slice(0, 150) : error,
              );
            }
          })
          .catch((err) => {
            console.warn(
              "Bulk upsert to public.bills background error:",
              err?.message || err,
            );
          });
      }

      return res.json({ success: true, count: payloads.length });
    } catch (err: any) {
      console.error("Error in PUT /api/bills:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to bulk update bills" });
    }
  });

  app.post("/api/bills/:id/payment", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const amountPaid = Number(
        req.body?.amountPaid !== undefined
          ? req.body.amountPaid
          : req.body?.amount || 0,
      );

      // 1. Immediately update in local orders collection and disk
      const colOrders = await getCollectionData("orders");
      if (Array.isArray(colOrders)) {
        // The app sends the total it believed was paid before this change. If another phone has recorded a
        // payment since, saving would erase it, so the app is told to refresh first.
        const expected = req.body?.expectedAmountPaid;
        const current = colOrders.find((o: any) => Number(o.id) === id);
        if (current && expected !== undefined && expected !== null) {
          const have = Number(current.amountPaid ?? current.amount_paid ?? 0);
          if (Math.abs(have - Number(expected)) > 0.005) {
            return res.status(409).json({
              error: "This invoice's payments changed on another device. Refresh and record the payment again.",
              code: "STALE",
              amountPaid: have,
            });
          }
        }
        const updated = colOrders.map((o: any) =>
          Number(o.id) === id
            ? { ...o, amountPaid, amount_paid: amountPaid, updatedAt: new Date().toISOString() }
            : o,
        );
        await setCollectionData("orders", updated);
      }

      // 2. Best-effort Supabase sync (non-blocking with timeout)
      if (isSupabaseAvailable()) {
        withSupabaseTimeout(
          supabase
            .from("bills")
            .update({
              amount_paid: amountPaid,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id),
          3000,
        )
          .then(({ error }) => {
            if (error) {
              console.warn(
                "Payment update to public.bills notice:",
                error.message ? error.message.slice(0, 150) : error,
              );
            }
          })
          .catch((err) => {
            console.warn(
              "Payment update to public.bills error:",
              err?.message || err,
            );
          });
      }

      return res.json({ success: true, id, amountPaid });
    } catch (err: any) {
      console.error("Error updating bill payment:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to update payment" });
    }
  });

  app.delete(["/api/bills/:id", "/api/orders/:id"], async (req, res) => {
    try {
      const id = Number(req.params.id);

      const colOrders = await getCollectionData("orders");
      if (Array.isArray(colOrders)) {
        const updated = colOrders.filter((o: any) => Number(o.id) !== id);
        await setCollectionData("orders", updated);
      }
      // Remember the deletion so a device that still has this bill cannot bring it back.
      {
        const dr = await getCollectionData("deleted_bill_ids");
        const list = Array.isArray(dr) ? dr : [];
        if (!list.includes(id)) await setCollectionData("deleted_bill_ids", [...list, id].slice(-5000));
      }

      if (isSupabaseAvailable()) {
        withSupabaseTimeout(
          supabase.from("bills").delete().eq("id", id),
          3000,
        )
          .then((r: any) => {
            if (r?.error) console.warn(`[Supabase] Could not delete bill ${id}: ${String(r.error.message || r.error).slice(0, 150)}`);
          })
          .catch(() => {});
      }

      return res.json({ success: true, id });
    } catch (err: any) {
      console.error("Error deleting bill:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to delete bill" });
    }
  });

  // DELIVERY TRIPS ROUTES (Supabase public.trips)
  app.get("/api/trips", async (_req, res) => {
    try {
      const mapTripRow = (t: any, cached?: any) => {
        const status = t.status || cached?.status || "out";
        const loaded = parseDictSafe(t.loaded || cached?.loaded);
        const returned =
          status === "closed"
            ? parseDictSafe(t.returned || cached?.returned)
            : {};
        const rawBillIds =
          t.billIds ?? t.bill_ids ?? cached?.billIds ?? cached?.bill_ids ?? [];
        const billIds = parseBillIdsSafe(rawBillIds);
        return {
          id: Number(t.id),
          vehicle: t.vehicle || cached?.vehicle || "",
          route: t.route || cached?.route || undefined,
          warehouseLoads: t.warehouseLoads || t.warehouse_loads || cached?.warehouseLoads || undefined,
          salesman: t.salesman || cached?.salesman || "",
          salesmanId:
            t.salesman_id ||
            t.salesmanId ||
            cached?.salesmanId ||
            cached?.salesman_id ||
            undefined,
          date: t.date || cached?.date || new Date().toISOString().slice(0, 10),
          warehouseId:
            t.warehouse_id || t.warehouseId || cached?.warehouseId || "",
          loaded,
          returned,
          draftReturned:
            status === "closed" ? {} : parseDictSafe(t.draftReturned ?? t.draft_returned ?? cached?.draftReturned ?? cached?.draft_returned),
          billIds,
          status,
          driver: t.driver || cached?.driver || undefined,
          shortageReasons: t.shortageReasons || t.shortage_reasons || cached?.shortageReasons || cached?.shortage_reasons || undefined,
          updatedAt: t.updatedAt || t.updated_at || cached?.updatedAt || cached?.updated_at || undefined,
          cashShortBooked: Number(t.cashShortBooked ?? t.cash_short_booked ?? cached?.cashShortBooked ?? cached?.cash_short_booked) || undefined,
          cashRecoveries: t.cashRecoveries ?? t.cash_recoveries ?? cached?.cashRecoveries ?? cached?.cash_recoveries ?? undefined,
          cashShortWrittenOff:
            (t.cashShortWrittenOff ?? t.cash_short_written_off ?? cached?.cashShortWrittenOff ?? cached?.cash_short_written_off) === true ||
            undefined,
          cashHandedIn: (() => {
            const v = t.cashHandedIn ?? t.cash_handed_in ?? cached?.cashHandedIn ?? cached?.cash_handed_in;
            return v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v);
          })(),
        };
      };

      // 1. Check local trips collection / disk cache
      const colTrips = await getCollectionData("trips");
      const localList: any[] = Array.isArray(colTrips) ? colTrips : [];

      // 2. Fetch Supabase trips and merge bidirectionally
      if (isSupabaseAvailable()) {
        try {
          // Supabase returns at most 1000 rows per request, so read the trips table page by page;
          // otherwise older trips would silently drop out of the history once there are more than 1000.
          const PAGE = 1000;
          let remoteTrips: any[] = [];
          let error: any = null;
          for (let from = 0; from < 50000; from += PAGE) {
            const page: any = await withSupabaseTimeout(
              supabase
                .from("trips")
                .select("*")
                .order("id", { ascending: false })
                .range(from, from + PAGE - 1),
              3000,
            );
            if (page?.error) {
              error = page.error;
              break;
            }
            const rows = Array.isArray(page?.data) ? page.data : [];
            remoteTrips = remoteTrips.concat(rows);
            if (rows.length < PAGE) break;
          }

          if (!error && Array.isArray(remoteTrips)) {
            const tripMap = new Map<number, any>();
            localList.forEach((ct: any) => tripMap.set(Number(ct.id), ct));
            remoteTrips.forEach((t: any) => {
              const existing = tripMap.get(Number(t.id));
              tripMap.set(Number(t.id), mapTripRow(t, existing));
            });
            const deadTrips = await readTombstones("deleted_trip_ids");
            const merged = Array.from(tripMap.values())
              .filter((t: any) => !deadTrips.has(String(t.id)))
              .sort((a, b) => Number(b.id) - Number(a.id));
            await setCollectionData("trips", merged);
            return res.json({ success: true, data: merged });
          }
        } catch {
          // ignore remote error and fall back to local
        }
      }

      const fallbackMapped = localList.map((ct: any) => mapTripRow(ct));
      return res.json({ success: true, data: fallbackMapped });
    } catch (err: any) {
      console.error("Error in GET /api/trips:", err);
      const colTrips = (await getCollectionData("trips").catch(() => [])) || [];
      return res.json({ success: true, data: colTrips });
    }
  });

  app.post("/api/trips", async (req, res) => {
    try {
      const body = req.body;
      const tripPayload = formatTripForSupabase(body);

      // 1. Save to local collection & disk immediately
      const existing = await getCollectionData("trips");
      const list = Array.isArray(existing) ? existing : [];
      // A stale copy can never reopen a trip that was already closed.
      const storedTrip = list.find((t: any) => Number(t.id) === Number(tripPayload.id));
      if (tripStaleReopen(storedTrip, tripPayload)) {
        if (storedTrip?.status === "closed" && tripPayload?.status !== "closed") {
          return res.status(200).json({ success: true, data: storedTrip, stale: true });
        }
        return res.status(409).json({
          error: "This trip was changed on another device. Refresh to see the latest copy.",
          code: "STALE",
          data: storedTrip,
        });
      }
      if (storedTrip && changedSinceBase(req, storedTrip)) {
        return res.status(409).json({
          error: "This trip was changed on another device. Refresh to see the latest copy.",
          code: "STALE",
          data: storedTrip,
        });
      }
      {
        const problem = await tripReturnProblem(storedTrip, { ...body, ...tripPayload, returned: body?.returned ?? tripPayload.returned, billIds: body?.billIds ?? tripPayload.bill_ids });
        if (problem) {
          return res.status(422).json({ error: `Trip cannot be closed: ${problem}`, code: "RETURN_EXCEEDS_EXPECTED" });
        }
      }
      if ((await readTombstones("deleted_trip_ids")).has(String(tripPayload.id))) {
        const cur = await getCollectionData("deleted_trip_ids");
        await setCollectionData(
          "deleted_trip_ids",
          (Array.isArray(cur) ? cur : []).filter((n: any) => String(n) !== String(tripPayload.id)),
        );
      }
      // Keep who the trip belongs to even when the id is not a database uuid (the row format drops those).
      const ownerId = body?.salesmanId ?? body?.salesman_id;
      const updated = [
        ownerId ? { ...tripPayload, salesmanId: String(ownerId) } : tripPayload,
        ...list.filter((t: any) => Number(t.id) !== Number(tripPayload.id)),
      ];
      await setCollectionData("trips", updated);

      // 2. Best-effort Supabase sync (non-blocking)
      if (isSupabaseAvailable()) {
        resilientUpsert(supabase, "trips", tripPayload, {
          onConflict: "id",
        })
          .then(({ error }) => {
            if (error) {
              console.warn(
                "Upsert to public.trips notice:",
                error.message ? error.message.slice(0, 150) : error,
              );
            }
          })
          .catch((err) => {
            console.warn("Upsert to public.trips background error:", err?.message || err);
          });
      }

      return res.status(201).json({ success: true, data: tripPayload });
    } catch (err: any) {
      console.error("Error saving trip:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to save trip" });
    }
  });

  app.put("/api/trips", async (req, res) => {
    try {
      const rawTrips = Array.isArray(req.body?.trips)
        ? req.body.trips
        : Array.isArray(req.body?.data)
          ? req.body.data
          : Array.isArray(req.body)
            ? req.body
            : [];

      if (rawTrips.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      // 1. Save to local collection & disk immediately (merged: another device's trips are never erased,
      //    a closed trip is never reopened by a stale copy, deleted trips stay deleted)
      const storedTrips = await getCollectionData("trips");
      const rejectedTrips: { id: any; error: string }[] = [];
      for (let i = rawTrips.length - 1; i >= 0; i--) {
        const t = rawTrips[i];
        const was = (Array.isArray(storedTrips) ? storedTrips : []).find((x: any) => Number(x?.id) === Number(t?.id));
        const problem = await tripReturnProblem(was, t);
        if (problem) {
          rejectedTrips.push({ id: t?.id, error: problem });
          rawTrips.splice(i, 1); // the stored copy of that trip stays as it was
        }
      }
      const acceptedTrips = new Set<any>();
      await setCollectionData(
        "trips",
        mergeRecordLists(
          Array.isArray(storedTrips) ? storedTrips : [],
          rawTrips,
          await readTombstones("deleted_trip_ids"),
          tripStaleReopen,
          acceptedTrips,
        ),
      );

      // 2. Best-effort Supabase sync (non-blocking): ONLY the trips that won the merge. Pushing every incoming
      //    trip let a stale device re-create deleted trips and reopen closed ones in the database.
      const payloads = rawTrips
        .filter((t: any) => acceptedTrips.has(t))
        .map(formatTripForSupabase);
      if (isSupabaseAvailable() && payloads.length > 0) {
        resilientUpsert(supabase, "trips", payloads, {
          onConflict: "id",
        })
          .then(({ error }) => {
            if (error) {
              console.warn(
                "Bulk upsert to public.trips notice:",
                error.message ? error.message.slice(0, 150) : error,
              );
            }
          })
          .catch((err) => {
            console.warn("Bulk upsert to public.trips background error:", err?.message || err);
          });
      }

      return res.json({
        success: true,
        count: payloads.length,
        ...(rejectedTrips.length > 0 ? { rejected: rejectedTrips } : {}),
      });
    } catch (err: any) {
      console.error("Error in PUT /api/trips:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to bulk update trips" });
    }
  });

  app.delete("/api/trips/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);

      const colTrips = await getCollectionData("trips");
      if (Array.isArray(colTrips)) {
        const updated = colTrips.filter((t: any) => Number(t.id) !== id);
        await setCollectionData("trips", updated);
      }
      await addTombstone("deleted_trip_ids", String(id));

      if (isSupabaseAvailable()) {
        withSupabaseTimeout(
          supabase.from("trips").delete().eq("id", id),
          3000,
        ).catch(() => {});
      }

      return res.json({ success: true, id });
    } catch (err: any) {
      console.error("Error deleting trip:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to delete trip" });
    }
  });

  /* =========================================================================
   * SALESMEN ROUTES (Supabase public.salesmen)
   * Admin-provisioned, PIN-authenticated field salesmen
   * ========================================================================= */

  // What leaves the server: NEVER a PIN hash (not to the owner's screen, not to a salesman's phone).
  function formatSalesmanResponse(s: any) {
    return {
      id: String(s.id),
      name: s.name || "",
      phone: s.phone || "",
      pinHash: "",
      hasPin: !!(s.pin_hash || s.pinHash),
      active: s.active !== undefined ? Boolean(s.active) : true,
      defaultVehicle: s.default_vehicle || s.defaultVehicle || "",
      createdAt: s.created_at || s.createdAt || new Date().toISOString(),
      updatedAt: s.updated_at || s.updatedAt || new Date().toISOString(),
    };
  }

  // What the server itself keeps (the copy in app_collections is used for sign-in when the table is unreachable).
  function formatSalesmanStored(s: any, hash: string) {
    return { ...formatSalesmanResponse(s), pinHash: hash, pin_hash: hash };
  }

  const PIN_RULE = /^\d{4,6}$/;

  const findSalesmanByPhone = async (phone: string) => {
    const { data: row, error } = await supabase.from("salesmen").select("*").eq("phone", phone).maybeSingle();
    if (!error && row) return row;
    const col = await getCollectionData("salesmen");
    return Array.isArray(col) ? col.find((x: any) => String(x?.phone || "").trim() === phone) || null : null;
  };

  app.get("/api/salesmen", async (_req, res) => {
    try {
      // 1. Try public.salesmen in Supabase
      const { data: list, error } = await supabase
        .from("salesmen")
        .select("*")
        .order("name", { ascending: true });

      if (!error && Array.isArray(list) && list.length > 0) {
        return res.json({
          success: true,
          data: list.map(formatSalesmanResponse),
        });
      }

      // 2. Fallback to app_collections
      const colSalesmen = await getCollectionData("salesmen");
      const fallbackList = Array.isArray(colSalesmen) ? colSalesmen : [];
      return res.json({
        success: true,
        data: fallbackList.map(formatSalesmanResponse),
      });
    } catch (err: any) {
      console.error("Error in GET /api/salesmen:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to fetch salesmen", data: [] });
    }
  });

  app.post("/api/salesmen", async (req, res) => {
    try {
      const body = req.body || {};
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      if (!name || !phone) {
        return res.status(400).json({ error: "Name and phone are required fields" });
      }

      // The PIN arrives as the PIN (over HTTPS, owner only) and is hashed HERE with its own random salt.
      // A hash computed by the app is never accepted: it would be the weak shared-salt kind.
      const pin = String(body.pin ?? "").trim();
      let pinHash = "";
      if (pin) {
        if (!PIN_RULE.test(pin)) return res.status(400).json({ error: "PIN must be 4 to 6 digits." });
        pinHash = await hashPinSecure(pin, authCfg.pinPepper);
      } else {
        const existingRow: any = await findSalesmanByPhone(phone);
        pinHash = String(existingRow?.pin_hash || existingRow?.pinHash || "");
        if (!pinHash) return res.status(400).json({ error: "A PIN (4 to 6 digits) is required for a new salesman." });
      }

      const salesmanPayload = {
        id: isValidUuid(body.id) ? body.id : undefined,
        name,
        phone,
        pin_hash: pinHash,
        active: body.active !== undefined ? Boolean(body.active) : true,
        default_vehicle: body.defaultVehicle || body.default_vehicle || "",
        updated_at: new Date().toISOString(),
      };

      // Insert or upsert in public.salesmen
      const { data, error } = await supabase
        .from("salesmen")
        .upsert(salesmanPayload, { onConflict: "phone" })
        .select()
        .maybeSingle();

      if (error) {
        console.warn("Supabase salesmen upsert warning:", error.message);
      }

      const rowForMirror = data || {
        ...salesmanPayload,
        id: salesmanPayload.id || body.id || `salesman_${Date.now()}`,
      };
      const finalRecord = formatSalesmanResponse(rowForMirror);

      // Mirror in app_collections
      const existing = await getCollectionData("salesmen");
      const list = Array.isArray(existing) ? existing : [];
      const updated = [
        formatSalesmanStored(rowForMirror, pinHash),
        ...list.filter(
          (s: any) => s.id !== finalRecord.id && s.phone !== finalRecord.phone,
        ),
      ];
      await setCollectionData("salesmen", updated);

      return res.status(201).json({ success: true, data: finalRecord });
    } catch (err: any) {
      console.error("Error in POST /api/salesmen:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to create salesman" });
    }
  });

  app.put("/api/salesmen/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const body = req.body || {};

      const updatePayload: any = {
        updated_at: new Date().toISOString(),
      };
      if (body.name !== undefined) updatePayload.name = String(body.name).trim();
      if (body.phone !== undefined) updatePayload.phone = String(body.phone).trim();
      let newHash: string | undefined;
      const pin = String(body.pin ?? "").trim();
      if (pin) {
        if (!PIN_RULE.test(pin)) return res.status(400).json({ error: "PIN must be 4 to 6 digits." });
        newHash = await hashPinSecure(pin, authCfg.pinPepper);
        updatePayload.pin_hash = newHash;
      }
      // (a pinHash / pin_hash sent by the app is ignored: an empty one used to wipe the real PIN)
      if (body.active !== undefined)
        updatePayload.active = Boolean(body.active);
      if (body.defaultVehicle !== undefined)
        updatePayload.default_vehicle = body.defaultVehicle;
      if (body.default_vehicle !== undefined)
        updatePayload.default_vehicle = body.default_vehicle;

      const { data, error } = await supabase
        .from("salesmen")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) {
        console.warn("Update salesmen in Supabase notice:", error.message);
      }
      activeCache.delete(String(id));

      // Update in collection fallback (keeps the stored hash unless a new PIN was set)
      const existing = await getCollectionData("salesmen");
      if (Array.isArray(existing)) {
        const updated = existing.map((s: any) => {
          if (s.id !== id) return s;
          const hash = newHash || String(s.pin_hash || s.pinHash || "");
          return {
            ...s,
            ...(updatePayload.name !== undefined ? { name: updatePayload.name } : {}),
            ...(updatePayload.phone !== undefined ? { phone: updatePayload.phone } : {}),
            ...(updatePayload.active !== undefined ? { active: updatePayload.active } : {}),
            ...(updatePayload.default_vehicle !== undefined
              ? { defaultVehicle: updatePayload.default_vehicle, default_vehicle: updatePayload.default_vehicle }
              : {}),
            pinHash: hash,
            pin_hash: hash,
            updatedAt: new Date().toISOString(),
          };
        });
        await setCollectionData("salesmen", updated);
      }

      return res.json({
        success: true,
        data: data ? formatSalesmanResponse(data) : null,
      });
    } catch (err: any) {
      console.error("Error updating salesman:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to update salesman" });
    }
  });

  app.delete("/api/salesmen/:id", async (req, res) => {
    try {
      const id = req.params.id;
      activeCache.delete(String(id));
      // Soft-deactivate or delete
      await supabase.from("salesmen").delete().eq("id", id);

      const existing = await getCollectionData("salesmen");
      if (Array.isArray(existing)) {
        const updated = existing.filter((s: any) => s.id !== id);
        await setCollectionData("salesmen", updated);
      }

      return res.json({ success: true, id });
    } catch (err: any) {
      console.error("Error deleting salesman:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to delete salesman" });
    }
  });

  // Verify PIN endpoint for secure login
  app.post("/api/salesmen/verify-pin", async (req, res) => {
    // This route trusts a hash computed on the device (anyone holding a hash could sign in without the PIN).
    if (authCfg.required) {
      return res.status(410).json({ success: false, error: "Use /api/auth/salesman-login." });
    }
    try {
      const { phone, pinHash } = req.body;
      const cleanPhone = (phone || "").trim();

      if (!cleanPhone || !pinHash) {
        return res
          .status(400)
          .json({ success: false, error: "Phone and PIN hash are required." });
      }

      // 1. Check Supabase public.salesmen
      const { data: sm, error } = await supabase
        .from("salesmen")
        .select("*")
        .eq("phone", cleanPhone)
        .maybeSingle();

      let target = sm;

      // 2. Fallback to collection
      if (!target || error) {
        const colSalesmen = await getCollectionData("salesmen");
        if (Array.isArray(colSalesmen)) {
          target = colSalesmen.find(
            (s: any) => (s.phone || "").trim() === cleanPhone,
          );
        }
      }

      if (!target) {
        return res
          .status(404)
          .json({
            success: false,
            error: "Salesman not found with this mobile number.",
          });
      }

      if (target.active === false) {
        return res
          .status(403)
          .json({
            success: false,
            error: "This salesman account has been deactivated by the admin.",
          });
      }

      const storedHash = target.pin_hash || target.pinHash || "";
      if (isModernPinHash(storedHash) || storedHash.toLowerCase() !== String(pinHash).toLowerCase()) {
        return res
          .status(401)
          .json({ success: false, error: "Incorrect PIN. Please try again." });
      }

      return res.json({
        success: true,
        salesman: formatSalesmanResponse(target),
      });
    } catch (err: any) {
      console.error("Error verifying salesman PIN:", err);
      return res
        .status(500)
        .json({
          success: false,
          error: err.message || "PIN verification failed.",
        });
    }
  });

  // SETTINGS ROUTES (billing_settings and organization_profile)
  app.get("/api/settings/billing", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("billing_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (!error && data && data.data) {
        return res.json({ success: true, data: data.data });
      }
      const col = await getCollectionData("billing_settings");
      return res.json({ success: true, data: col || null });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to load billing settings" });
    }
  });

  app.post("/api/settings/billing", async (req, res) => {
    try {
      const settings = req.body?.settings || req.body?.data || req.body;
      const { error } = await supabase.from("billing_settings").upsert(
        {
          id: "default",
          data: settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) {
        console.warn(
          "Error saving billing_settings in Supabase:",
          error.message,
        );
      }
      await setCollectionData("billing_settings", settings);
      // Say so when Supabase refused it, so the app keeps it queued and retries instead of showing "synced".
      if (error) {
        return res.status(502).json({ error: `Supabase: ${error.message}`, data: settings });
      }
      return res.json({ success: true, data: settings });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to save billing settings" });
    }
  });

  app.get("/api/settings/profile", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("organization_profile")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (!error && data && data.data) {
        return res.json({ success: true, data: data.data });
      }
      const col = await getCollectionData("organization_profile");
      return res.json({ success: true, data: col || null });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to load org profile" });
    }
  });

  app.post("/api/settings/profile", async (req, res) => {
    try {
      const profile = req.body?.profile || req.body?.data || req.body;
      const { error } = await withSupabaseTimeout(
        supabase.from("organization_profile").upsert(
          {
            id: "default",
            data: profile,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        ),
        3000,
      );
      if (error) {
        console.warn(
          "Error saving organization_profile in Supabase:",
          error.message,
        );
      }
      await setCollectionData("organization_profile", profile);
      return res.json({ success: true, data: profile });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to save org profile" });
    }
  });

  // WAREHOUSES ROUTES (Supabase public.warehouses)
  app.get("/api/warehouses", async (_req, res) => {
    try {
      const { data: whs, error } = await withSupabaseTimeout(
        supabase
          .from("warehouses")
          .select("*")
          .order("name", { ascending: true }),
        3000,
      );
      if (!error && Array.isArray(whs) && whs.length > 0) {
        const mapped = whs.map((w: any) => ({
          id: String(w.id),
          name: w.name,
          code: w.code || "",
          location: w.location || "",
          manager: w.manager || "",
          phone: w.phone || "",
          capacityCases: Number(w.capacity_cases || 0),
          isDefault: Boolean(w.is_default),
          notes: w.notes || "",
        }));
        return res.json({ success: true, data: mapped });
      }
      const col = await getCollectionData("warehouses");
      return res.json({ success: true, data: Array.isArray(col) ? col : [] });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to fetch warehouses", data: [] });
    }
  });

  app.post("/api/warehouses", async (req, res) => {
    try {
      const w = req.body;
      const payload = formatWarehouseForSupabase(w);
      const { error } = await withSupabaseTimeout(
        supabase
          .from("warehouses")
          .upsert(payload, { onConflict: "id" }),
        3000,
      );
      if (error) {
        console.warn("Error upserting warehouse:", error.message);
      }
      return res.status(201).json({ success: true, data: payload });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to create warehouse" });
    }
  });

  app.put("/api/warehouses", async (req, res) => {
    try {
      const raw = Array.isArray(req.body?.warehouses)
        ? req.body.warehouses
        : Array.isArray(req.body?.data)
          ? req.body.data
          : Array.isArray(req.body)
            ? req.body
            : [];
      if (raw.length === 0) return res.json({ success: true, count: 0 });
      const payloads = raw.map(formatWarehouseForSupabase);
      const { error } = await withSupabaseTimeout(
        supabase
          .from("warehouses")
          .upsert(payloads, { onConflict: "id" }),
        3000,
      );
      if (error)
        console.warn("Error bulk upserting warehouses:", error.message);
      await setCollectionData("warehouses", raw);
      return res.json({ success: true, count: payloads.length });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to bulk save warehouses" });
    }
  });

  app.delete("/api/warehouses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await supabase.from("warehouses").delete().eq("id", id);
      return res.json({ success: true, id });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to delete warehouse" });
    }
  });

  // STOCK AUDITS ROUTES (Supabase public.audits)
  app.get("/api/audits", async (_req, res) => {
    try {
      const { data: audits, error } = await supabase
        .from("audits")
        .select("*")
        .order("date", { ascending: false });
      if (!error && Array.isArray(audits)) {
        return res.json({ success: true, data: audits });
      }
      return res.json({ success: true, data: [] });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to fetch audits", data: [] });
    }
  });

  app.post("/api/audits", async (req, res) => {
    try {
      const a = req.body;
      const payload = {
        id: Number(a.id || Date.now()),
        date: a.date || new Date().toISOString().slice(0, 10),
        time: a.time || null,
        referenceNote: a.referenceNote || null,
        entries: Array.isArray(a.entries) ? a.entries : [],
        adjusted: Boolean(a.adjusted),
      };
      await supabase.from("audits").upsert(payload, { onConflict: "id" });
      return res.status(201).json({ success: true, data: payload });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to save audit" });
    }
  });

  app.delete("/api/audits/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await supabase.from("audits").delete().eq("id", id);
      return res.json({ success: true, id });
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: err.message || "Failed to delete audit" });
    }
  });

  app.post("/api/orders/:id/cancel", async (req, res) => {
    try {
      const { id } = req.params;
      let order: any = null;
      const { data: ordData } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (ordData) {
        order = ordData;
      } else {
        const { data: bData } = await supabase
          .from("bills")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (bData) {
          order = bData;
        } else {
          const colOrders = await getCollectionData("orders");
          if (Array.isArray(colOrders)) {
            order = colOrders.find((o: any) => String(o.id) === String(id));
          }
        }
      }

      if (order && Array.isArray(order.items)) {
        for (const item of order.items) {
          const pid = item.productId || item.product_id || item.id;
          const qty =
            Number(item.qty || item.quantity || 0) +
            Number(item.freeQty || item.free_qty || 0);
          if (pid && qty > 0) {
            await updateInventoryItemStock(pid, 0, -qty);
          }
        }
      }

      await supabase
        .from("orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id);
      const colOrders = await getCollectionData("orders");
      if (Array.isArray(colOrders)) {
        const updated = colOrders.map((o: any) =>
          String(o.id) === String(id) ? { ...o, status: "cancelled" } : o,
        );
        await setCollectionData("orders", updated);
      }

      return res.json({
        success: true,
        message: "Order cancelled and reserved stock released",
      });
    } catch (err: any) {
      console.error("Error cancelling order:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to cancel order" });
    }
  });

  app.post("/api/orders/:id/deliver", async (req, res) => {
    try {
      const { id } = req.params;
      let order: any = null;
      const { data: ordData } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (ordData) {
        order = ordData;
      } else {
        const { data: bData } = await supabase
          .from("bills")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (bData) {
          order = bData;
        } else {
          const colOrders = await getCollectionData("orders");
          if (Array.isArray(colOrders)) {
            order = colOrders.find((o: any) => String(o.id) === String(id));
          }
        }
      }

      if (order && Array.isArray(order.items)) {
        for (const item of order.items) {
          const pid = item.productId || item.product_id || item.id;
          const qty =
            Number(item.qty || item.quantity || 0) +
            Number(item.freeQty || item.free_qty || 0);
          if (pid && qty > 0) {
            await updateInventoryItemStock(pid, -qty, -qty);
          }
        }
      }

      await supabase
        .from("orders")
        .update({ status: "delivered", updated_at: new Date().toISOString() })
        .eq("id", id);
      const colOrders = await getCollectionData("orders");
      if (Array.isArray(colOrders)) {
        const updated = colOrders.map((o: any) =>
          String(o.id) === String(id) ? { ...o, status: "delivered" } : o,
        );
        await setCollectionData("orders", updated);
      }

      return res.json({
        success: true,
        message: "Order delivered and stock deducted from inventory",
      });
    } catch (err: any) {
      console.error("Error delivering order:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to deliver order" });
    }
  });

  // 2. PROMOTIONAL SCHEMES ROUTES
  app.get("/api/schemes", async (_req, res) => {
    try {
      // 1. Primary: check app_collections for 'schemes' (contains full objects with bundle params and custom rules)
      const colSchemes = await getCollectionData("schemes");
      if (Array.isArray(colSchemes) && colSchemes.length > 0) {
        return res.json({ success: true, data: colSchemes });
      }

      // 2. Fallback: check public.promotional_schemes
      const { data: schemes, error } = await supabase
        .from("promotional_schemes")
        .select("*");
      if (!error && Array.isArray(schemes) && schemes.length > 0) {
        return res.json({ success: true, data: schemes });
      }

      // 3. Fallback: check public.promotions table
      const { data: promos, error: promoErr } = await supabase
        .from("promotions")
        .select("*")
        .order("id", { ascending: true });
      if (!promoErr && Array.isArray(promos) && promos.length > 0) {
        const mapped = promos.map((p: any) => {
          const rawIds =
            p.product_ids ?? p.productIds ?? p.product_id ?? p.productId;
          let cleanIds: number[] = [];
          if (Array.isArray(rawIds)) {
            cleanIds = rawIds.map(Number).filter((n: number) => !isNaN(n));
          } else if (typeof rawIds === "string") {
            try {
              const parsed = JSON.parse(rawIds);
              if (Array.isArray(parsed))
                cleanIds = parsed.map(Number).filter((n: number) => !isNaN(n));
              else
                cleanIds = rawIds
                  .split(",")
                  .map((s: string) => Number(s.trim()))
                  .filter((n: number) => !isNaN(n));
            } catch {
              cleanIds = rawIds
                .split(",")
                .map((s: string) => Number(s.trim()))
                .filter((n: number) => !isNaN(n));
            }
          } else if (typeof rawIds === "number" && !isNaN(rawIds)) {
            cleanIds = [rawIds];
          }

          return {
            id: Number(p.id),
            name: p.name,
            type: p.type,
            buyQty: Number(p.buy_qty ?? p.buyQty ?? 0),
            freeQty: Number(p.free_qty ?? p.freeQty ?? 0),
            percent: Number(p.percent ?? 0),
            flatPerCase: Number(p.flat_per_case ?? p.flatPerCase ?? 0),
            productIds: cleanIds,
            isActive:
              p.is_active !== undefined
                ? Boolean(p.is_active)
                : p.isActive !== undefined
                  ? Boolean(p.isActive)
                  : true,
            bundleBuyType: p.bundle_buy_type ?? p.bundleBuyType ?? "any",
            requiredDistinctTypes: Number(
              p.required_distinct_types ?? p.requiredDistinctTypes ?? 2,
            ),
            minQtyPerType: Number(p.min_qty_per_type ?? p.minQtyPerType ?? 1),
            freeRewardChoice:
              p.free_reward_choice ?? p.freeRewardChoice ?? "all_eligible",
            freeProductId: p.free_product_id
              ? Number(p.free_product_id)
              : p.freeProductId
                ? Number(p.freeProductId)
                : undefined,
            freeProductQty: Number(p.free_product_qty ?? p.freeProductQty ?? 1),
          };
        });
        return res.json({ success: true, data: mapped });
      }

      return res.json({ success: true, data: [] });
    } catch (err: any) {
      console.error("Error in GET /api/schemes:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to fetch schemes", data: [] });
    }
  });

  app.post("/api/schemes", async (req, res) => {
    try {
      const schemeData = req.body;
      const id = Number(schemeData.id) || Date.now();
      const fullScheme = { ...schemeData, id };

      // 1. Primary: Always persist complete scheme to app_collections first
      const colSchemes = await getCollectionData("schemes");
      const list = Array.isArray(colSchemes) ? colSchemes : [];
      const updated = [
        ...list.filter((s: any) => Number(s.id) !== id),
        fullScheme,
      ];
      await setCollectionData("schemes", updated);

      // 2. Mirror to public.promotions safely without violating "promotions_type_check"
      // PostgreSQL check constraint on public.promotions allows ('bogo', 'percent', 'flat').
      // Map 'bundle' schemes to 'bogo' so it never violates the database constraint.
      const safeType =
        schemeData.type === "bundle"
          ? "bogo"
          : ["bogo", "percent", "flat"].includes(schemeData.type)
            ? schemeData.type
            : "bogo";
      const dbRow = {
        id,
        name: schemeData.name,
        type: safeType,
        buy_qty: Number(schemeData.buyQty ?? schemeData.buy_qty ?? 0),
        free_qty: Number(schemeData.freeQty ?? schemeData.free_qty ?? 0),
        percent: Number(schemeData.percent ?? 0),
        flat_per_case: Number(
          schemeData.flatPerCase ?? schemeData.flat_per_case ?? 0,
        ),
        product_ids: schemeData.productIds || schemeData.product_ids || [],
      };

      try {
        await supabase.from("promotions").upsert(dbRow, { onConflict: "id" });
      } catch (pErr: any) {
        console.warn("Note on mirroring to public.promotions:", pErr?.message);
      }

      // 3. Also mirror to promotional_schemes if present
      try {
        await supabase
          .from("promotional_schemes")
          .upsert(fullScheme, { onConflict: "id" });
      } catch {
        // ignore
      }

      return res.status(201).json({ success: true, data: fullScheme });
    } catch (err: any) {
      console.error("Error saving scheme:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to save scheme" });
    }
  });

  app.put("/api/schemes", async (req, res) => {
    try {
      const rawSchemes = req.body?.schemes || req.body?.data || req.body;
      const list: any[] = Array.isArray(rawSchemes) ? rawSchemes : [];

      // 1. Primary: Save complete schemes in app_collections (guarantees zero data loss & full bundle support)
      await setCollectionData("schemes", list);

      // 2. Mirror to public.promotions safely
      if (list.length > 0) {
        const rows = list.map((schemeData: any) => {
          const safeType =
            schemeData.type === "bundle"
              ? "bogo"
              : ["bogo", "percent", "flat"].includes(schemeData.type)
                ? schemeData.type
                : "bogo";
          return {
            id: Number(schemeData.id),
            name: schemeData.name,
            type: safeType,
            buy_qty: Number(schemeData.buyQty ?? schemeData.buy_qty ?? 0),
            free_qty: Number(schemeData.freeQty ?? schemeData.free_qty ?? 0),
            percent: Number(schemeData.percent ?? 0),
            flat_per_case: Number(
              schemeData.flatPerCase ?? schemeData.flat_per_case ?? 0,
            ),
            product_ids: schemeData.productIds || schemeData.product_ids || [],
          };
        });

        try {
          const { error: pErr } = await supabase
            .from("promotions")
            .upsert(rows, { onConflict: "id" });
          if (pErr) {
            console.warn("Mirroring to promotions table noted:", pErr.message);
          }
        } catch (pEx: any) {
          console.warn(
            "Mirroring to promotions table exception:",
            pEx?.message,
          );
        }
      }

      return res.json({ success: true, count: list.length });
    } catch (err: any) {
      console.error("Error in PUT /api/schemes:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to update schemes" });
    }
  });

  app.delete("/api/schemes/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await supabase.from("promotions").delete().eq("id", id);
      await supabase.from("promotional_schemes").delete().eq("id", id);
      const colSchemes = await getCollectionData("schemes");
      if (Array.isArray(colSchemes)) {
        await setCollectionData(
          "schemes",
          colSchemes.filter((s: any) => Number(s.id) !== id),
        );
      }
      return res.json({ success: true, id });
    } catch (err: any) {
      console.error("Error in DELETE /api/schemes:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to delete scheme" });
    }
  });

  // 2B. CUSTOMER MASTER ROUTES
  app.get("/api/customers", async (_req, res) => {
    try {
      const data = await getCollectionData("customers");
      return res.json({ success: true, data: Array.isArray(data) ? data : [] });
    } catch (err: any) {
      console.error("Error in GET /api/customers:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to fetch customers", data: [] });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const customer = req.body;
      const id =
        customer.id ||
        `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newCustomer = {
        ...customer,
        id,
        createdAt: customer.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const existing = await getCollectionData("customers");
      const list = Array.isArray(existing) ? existing : [];
      // Two phones editing the same customer: the copy changed last must not be overwritten by an older one.
      const storedCust = list.find((c: any) => c.id === id);
      const stampOf = (c: any) => Date.parse(c?.updatedAt || c?.createdAt || "") || 0;
      if (storedCust && ((customer.updatedAt && stampOf(storedCust) > stampOf(customer)) || changedSinceBase(req, storedCust))) {
        return res.status(409).json({
          error: "This customer was changed on another device. Refresh to see the latest copy.",
          code: "STALE",
          data: storedCust,
        });
      }
      const keepOwner = storedCust?.createdBySalesmanId && !newCustomer.createdBySalesmanId
        ? { createdBySalesmanId: storedCust.createdBySalesmanId }
        : {};
      const updated = [...list.filter((c: any) => c.id !== id), { ...newCustomer, ...keepOwner }];
      await setCollectionData("customers", updated);

      return res.status(201).json({ success: true, data: newCustomer });
    } catch (err: any) {
      console.error("Error in POST /api/customers:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to save customer" });
    }
  });

  app.put("/api/customers", async (req, res) => {
    try {
      const payload = req.body?.customers || req.body?.data || req.body;
      if (Array.isArray(payload)) {
        // Merge instead of replacing: per customer the most recently edited copy wins, so a device holding an
        // old list can no longer undo another device's edit. Customers deleted anywhere stay deleted.
        const stored = await getCollectionData("customers");
        const dead = await readDeletedRecordIds("customer");
        const when = (c: any) => Date.parse(c?.updatedAt || c?.createdAt || "") || 0;
        const byId = new Map<string, any>();
        for (const c of Array.isArray(stored) ? stored : []) {
          if (c?.id !== undefined && !dead.has(String(c.id))) byId.set(String(c.id), c);
        }
        for (const c of payload) {
          if (c?.id === undefined || dead.has(String(c.id))) continue;
          const cur = byId.get(String(c.id));
          if (cur && when(cur) > when(c)) continue;
          byId.set(
            String(c.id),
            cur?.createdBySalesmanId && !c.createdBySalesmanId
              ? { ...c, createdBySalesmanId: cur.createdBySalesmanId }
              : c,
          );
        }
        const merged = Array.from(byId.values());
        await setCollectionData("customers", merged);
        return res.json({ success: true, count: merged.length });
      }

      if (payload && payload.id) {
        const existing = await getCollectionData("customers");
        const list = Array.isArray(existing) ? existing : [];
        const updated = list.map((c: any) =>
          c.id === payload.id
            ? { ...payload, updatedAt: new Date().toISOString() }
            : c,
        );
        if (!list.some((c: any) => c.id === payload.id)) {
          updated.push({ ...payload, updatedAt: new Date().toISOString() });
        }
        await setCollectionData("customers", updated);
        return res.json({ success: true, data: payload });
      }

      return res.status(400).json({ error: "Invalid payload for customers" });
    } catch (err: any) {
      console.error("Error in PUT /api/customers:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to update customers" });
    }
  });

  app.delete("/api/customers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await getCollectionData("customers");
      if (Array.isArray(existing)) {
        const filtered = existing.filter((c: any) => c.id !== id);
        await setCollectionData("customers", filtered);
      }
      return res.json({ success: true, id });
    } catch (err: any) {
      console.error("Error in DELETE /api/customers:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to delete customer" });
    }
  });

  // 2C. PAYMENTS & COLLECTIONS ROUTES
  app.get("/api/payments", async (_req, res) => {
    try {
      const data = await getCollectionData("payments");
      return res.json({ success: true, data: Array.isArray(data) ? data : [] });
    } catch (err: any) {
      console.error("Error in GET /api/payments:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to fetch payments", data: [] });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const payment = req.body;
      const id =
        payment.id ||
        `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newPayment = {
        ...payment,
        id,
        createdAt: payment.createdAt || new Date().toISOString(),
      };

      const existing = await getCollectionData("payments");
      const list = Array.isArray(existing) ? existing : [];
      const storedPay = list.find((p: any) => p.id === id);
      const payStamp = (p: any) => Date.parse(p?.updatedAt || p?.createdAt || "") || 0;
      if (storedPay && (payStamp(storedPay) > payStamp(newPayment) || changedSinceBase(req, storedPay))) {
        return res.status(409).json({
          error: "This receipt was changed on another device. Refresh to see the latest copy.",
          code: "STALE",
          data: storedPay,
        });
      }
      const updated = [newPayment, ...list.filter((p: any) => p.id !== id)];
      await setCollectionData("payments", updated);

      return res.status(201).json({ success: true, data: newPayment });
    } catch (err: any) {
      console.error("Error in POST /api/payments:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to save payment" });
    }
  });

  app.put("/api/payments", async (req, res) => {
    try {
      const payload = req.body?.payments || req.body?.data || req.body;
      if (Array.isArray(payload)) {
        // Merge instead of replacing: a device holding an old list can no longer wipe payments recorded on another
        // device or undo an edit. Per payment the later updatedAt wins. Payments deleted anywhere (deletion log), and
        // payments of deleted bills, stay gone.
        const stored = await getCollectionData("payments");
        const dead = await readDeletedRecordIds("payment");
        const deadBills = await readTombstones("deleted_bill_ids");
        const when = (p: any) => Date.parse(p?.updatedAt || p?.createdAt || "") || 0;
        const gone = (p: any) =>
          p?.id === undefined ||
          dead.has(String(p.id)) ||
          (p.billId !== undefined && p.billId !== null && deadBills.has(String(p.billId)));
        const byId = new Map<string, any>();
        for (const p of Array.isArray(stored) ? stored : []) {
          if (!gone(p)) byId.set(String(p.id), p);
        }
        for (const p of payload) {
          if (gone(p)) continue;
          const cur = byId.get(String(p.id));
          if (cur && when(cur) > when(p)) continue;
          byId.set(String(p.id), p);
        }
        const merged = Array.from(byId.values());
        await setCollectionData("payments", merged);
        return res.json({ success: true, count: merged.length });
      }

      if (payload && payload.id) {
        const existing = await getCollectionData("payments");
        const list = Array.isArray(existing) ? existing : [];
        const updated = list.map((p: any) =>
          p.id === payload.id ? { ...payload } : p,
        );
        if (!list.some((p: any) => p.id === payload.id)) {
          updated.unshift(payload);
        }
        await setCollectionData("payments", updated);
        return res.json({ success: true, data: payload });
      }

      return res.status(400).json({ error: "Invalid payload for payments" });
    } catch (err: any) {
      console.error("Error in PUT /api/payments:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to update payments" });
    }
  });

  app.delete("/api/payments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await getCollectionData("payments");
      if (Array.isArray(existing)) {
        const filtered = existing.filter((p: any) => p.id !== id);
        await setCollectionData("payments", filtered);
      }
      // remember it, so a device that still has this payment cannot bring it back
      {
        const log = await readListFresh("deleted_records");
        if (!log.some((r: any) => r?.kind === "payment" && String(r.id) === String(id))) {
          await setCollectionData("deleted_records", [
            ...log,
            { kind: "payment", id: String(id), deletedAt: new Date().toISOString() },
          ].slice(-5000));
        }
      }
      return res.json({ success: true, id });
    } catch (err: any) {
      console.error("Error in DELETE /api/payments:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to delete payment" });
    }
  });

  // 2D. GRNS (GOODS RECEIVED NOTES / INWARD CONSIGNMENTS)
  app.get("/api/grns", async (_req, res) => {
    try {
      const deadGrnIds = await readTombstones("deleted_grn_ids");
      // 1. Try public.grns table
      const { data: grns, error } = await supabase
        .from("grns")
        .select("*")
        .order("inward_date", { ascending: false });

      if (!error && Array.isArray(grns) && grns.length > 0) {
        const formatted = grns.map((g: any) => applyGrnExtra({
          id: String(g.id),
          grnNumber: g.grn_number || g.id,
          invoiceNo: g.invoice_no || "",
          supplierName: g.supplier_name || "",
          supplierGstin: g.supplier_gstin || "",
          supplierAddress: g.supplier_address || "",
          supplierPhone: g.supplier_phone || "",
          supplierEmail: g.supplier_email || "",
          inwardDate: g.inward_date || "",
          vehicleNo: g.vehicle_no || "",
          warehouseId: g.warehouse_id || "",
          warehouseName: g.warehouse_name || "",
          items: Array.isArray(g.items) ? g.items : [],
          totalBilledQty: Number(g.total_billed_qty || 0),
          totalFreeQty: Number(g.total_free_qty || 0),
          totalPaidQty: Number(g.total_paid_qty || 0),
          totalReceivedQty: Number(g.total_received_qty || 0),
          totalTaxable: Number(g.total_taxable || 0),
          totalCgst: Number(g.total_cgst || 0),
          totalSgst: Number(g.total_sgst || 0),
          totalTax: Number(g.total_tax || 0),
          grandTotal: Number(g.grand_total || 0),
          inwardCosts: g.inward_costs || undefined,
          totalInwardCost: Number(g.total_inward_cost || 0),
          inwardCostPerCrate: Number(g.inward_cost_per_crate || 0),
          notes: g.notes || "",
          editHistory: Array.isArray(g.edit_history) ? g.edit_history : [],
          createdAt: g.created_at || new Date().toISOString(),
          updatedAt: g.updated_at || new Date().toISOString(),
        }, g.extra));
        return res.json({ success: true, data: formatted.filter((g: any) => !deadGrnIds.has(String(g?.id))) });
      }

      // 2. Fallback to app_collections inward_grns or grns
      let colGrns = await getCollectionData("inward_grns");
      if (!Array.isArray(colGrns) || colGrns.length === 0) {
        colGrns = await getCollectionData("grns");
      }
      if (Array.isArray(colGrns) && colGrns.length > 0) {
        return res.json({ success: true, data: (colGrns as any[]).filter((g: any) => !deadGrnIds.has(String(g?.id))) });
      }

      // 3. Fallback to billing_settings
      try {
        const { data: setRes } = await supabase
          .from("billing_settings")
          .select("data")
          .eq("id", "inward_grns")
          .maybeSingle();
        if (setRes?.data?.grns && Array.isArray(setRes.data.grns)) {
          return res.json({ success: true, data: setRes.data.grns });
        }
      } catch {
        // ignore
      }

      return res.json({ success: true, data: [] });
    } catch (err: any) {
      console.error("Error in GET /api/grns:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to fetch grns", data: [] });
    }
  });

  app.post("/api/grns", async (req, res) => {
    try {
      const g = req.body?.grn || req.body;
      if (!g || !g.id) {
        return res.status(400).json({ error: "Invalid GRN payload" });
      }

      // A stale copy must not overwrite a GRN that has been edited since; a deliberate save clears an old delete mark.
      {
        const storedList = await getCollectionData("inward_grns");
        const storedGrn = (Array.isArray(storedList) ? storedList : []).find(
          (x: any) => String(x.id) === String(g.id),
        );
        const edits = (x: any) => (Array.isArray(x?.editHistory) ? x.editHistory.length : 0);
        if (storedGrn && edits(storedGrn) > edits(g)) {
          return res.status(200).json({ success: true, data: storedGrn, stale: true });
        }
        if ((await readTombstones("deleted_grn_ids")).has(String(g.id))) {
          const cur = await getCollectionData("deleted_grn_ids");
          await setCollectionData(
            "deleted_grn_ids",
            (Array.isArray(cur) ? cur : []).filter((n: any) => String(n) !== String(g.id)),
          );
        }
      }

      const grnPayload = {
        id: String(g.id),
        grn_number: g.grnNumber || g.id,
        invoice_no: g.invoiceNo || "",
        supplier_name: g.supplierName || "",
        supplier_gstin: g.supplierGstin || "",
        supplier_address: g.supplierAddress || "",
        supplier_phone: g.supplierPhone || "",
        supplier_email: g.supplierEmail || "",
        inward_date: g.inwardDate || new Date().toISOString().slice(0, 10),
        vehicle_no: g.vehicleNo || "",
        warehouse_id: g.warehouseId || "",
        warehouse_name: g.warehouseName || "",
        items: Array.isArray(g.items) ? g.items : [],
        total_billed_qty: Number(g.totalBilledQty || 0),
        total_free_qty: Number(g.totalFreeQty || 0),
        total_paid_qty: Number(g.totalPaidQty || 0),
        total_received_qty: Number(g.totalReceivedQty || 0),
        total_taxable: Number(g.totalTaxable || 0),
        total_cgst: Number(g.totalCgst || 0),
        total_sgst: Number(g.totalSgst || 0),
        total_tax: Number(g.totalTax || 0),
        grand_total: Number(g.grandTotal || 0),
        inward_costs: g.inwardCosts || {},
        total_inward_cost: Number(g.totalInwardCost || 0),
        inward_cost_per_crate: Number(g.inwardCostPerCrate || 0),
        notes: g.notes || "",
        edit_history: g.editHistory || [],
        updated_at: new Date().toISOString(),
      };

      // 1. Upsert to public.grns
      const { error: upErr } = await supabase
        .from("grns")
        .upsert(grnPayload, { onConflict: "id" });
      if (upErr) {
        console.warn("Notice: public.grns upsert:", upErr.message);
      }

      // 2. Also sync batches to inventory_batches
      if (Array.isArray(g.items) && g.items.length > 0) {
        const batchRows = g.items.map((it: any) => ({
          id: `batch_${g.id}_${it.id || it.productId}`,
          product_id: Number(it.productId),
          sku: it.sku || "",
          batch_number: it.batchNumber || `LOT-${g.invoiceNo || Date.now()}`,
          mfg_date: it.mfgDate || null,
          expiry_date: it.expiry || null,
          warehouse_id: g.warehouseId || null,
          quantity: Number(it.totalReceivedQty || it.qty || 0) + Number(it.supplierSchemeFreeQty || 0),
          cost_price: Number(it.unitPrice || 0),
          effective_cost_price: Number(it.effectiveCostPerUnit || it.landedCostPerUnit || it.unitPrice || 0),
          mrp: Number(it.retailRate || 0),
          notes: `GRN: ${g.grnNumber || g.id} · Inv: ${g.invoiceNo || ""}`,
          updated_at: new Date().toISOString(),
        }));
        await supabase
          .from("inventory_batches")
          .upsert(batchRows, { onConflict: "id" });
      }

      // 3. Mirror to collections
      const existing = await getCollectionData("inward_grns");
      const list = Array.isArray(existing) ? existing : [];
      const updated = [g, ...list.filter((x: any) => String(x.id) !== String(g.id))];
      await setCollectionData("inward_grns", updated);

      return res.status(201).json({ success: true, data: g });
    } catch (err: any) {
      console.error("Error in POST /api/grns:", err);
      return res.status(500).json({ error: err.message || "Failed to save GRN" });
    }
  });

  app.put("/api/grns", async (req, res) => {
    try {
      const rawAll = Array.isArray(req.body?.grns)
        ? req.body.grns
        : Array.isArray(req.body?.data)
          ? req.body.data
          : Array.isArray(req.body)
            ? req.body
            : [];
      // A device holding an old copy must not bring back a GRN that was deleted (tombstone list).
      const deadGrns = await readTombstones("deleted_grn_ids");
      const raw = rawAll.filter((g: any) => !deadGrns.has(String(g?.id)));

      if (raw.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const storedGrns = await getCollectionData("inward_grns");
      const acceptedGrns = new Set<any>();
      const mergedGrns = mergeRecordLists(
        Array.isArray(storedGrns) ? storedGrns : [],
        raw,
        deadGrns,
        (cur, next) =>
          (Array.isArray(cur?.editHistory) ? cur.editHistory.length : 0) >
          (Array.isArray(next?.editHistory) ? next.editHistory.length : 0),
        acceptedGrns,
      );
      await setCollectionData("inward_grns", mergedGrns);
      const rawAccepted = raw.filter((g: any) => acceptedGrns.has(g));
      if (rawAccepted.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const payloads = rawAccepted.map((g: any) => ({
        id: String(g.id),
        grn_number: g.grnNumber || g.id,
        invoice_no: g.invoiceNo || "",
        supplier_name: g.supplierName || "",
        supplier_gstin: g.supplierGstin || "",
        supplier_address: g.supplierAddress || "",
        supplier_phone: g.supplierPhone || "",
        supplier_email: g.supplierEmail || "",
        inward_date: g.inwardDate || new Date().toISOString().slice(0, 10),
        vehicle_no: g.vehicleNo || "",
        warehouse_id: g.warehouseId || "",
        warehouse_name: g.warehouseName || "",
        items: Array.isArray(g.items) ? g.items : [],
        total_billed_qty: Number(g.totalBilledQty || 0),
        total_free_qty: Number(g.totalFreeQty || 0),
        total_paid_qty: Number(g.totalPaidQty || 0),
        total_received_qty: Number(g.totalReceivedQty || 0),
        total_taxable: Number(g.totalTaxable || 0),
        total_cgst: Number(g.totalCgst || 0),
        total_sgst: Number(g.totalSgst || 0),
        total_tax: Number(g.totalTax || 0),
        grand_total: Number(g.grandTotal || 0),
        inward_costs: g.inwardCosts || {},
        total_inward_cost: Number(g.totalInwardCost || 0),
        inward_cost_per_crate: Number(g.inwardCostPerCrate || 0),
        notes: g.notes || "",
        edit_history: g.editHistory || [],
        extra: grnExtraFields(g),
        updated_at: new Date().toISOString(),
      }));

      // A column that does not exist yet (extra, then edit_history) must not stop the GRNs from saving.
      {
        let up = await supabase.from("grns").upsert(payloads, { onConflict: "id" });
        if (up.error) {
          const noExtra = payloads.map(({ extra: _x, ...r }: any) => r);
          up = await supabase.from("grns").upsert(noExtra, { onConflict: "id" });
          if (up.error) {
            const noHistory = noExtra.map(({ edit_history: _h, ...r }: any) => r);
            await supabase.from("grns").upsert(noHistory, { onConflict: "id" });
          }
        }
      }
      return res.json({ success: true, count: payloads.length });
    } catch (err: any) {
      console.error("Error in PUT /api/grns:", err);
      return res.status(500).json({ error: err.message || "Failed to update GRNs" });
    }
  });

  app.delete("/api/grns/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await supabase.from("grns").delete().eq("id", id);
      // Remove batches for this GRN
      await supabase
        .from("inventory_batches")
        .delete()
        .like("id", `batch_${id}_%`);

      const existing = await getCollectionData("inward_grns");
      if (Array.isArray(existing)) {
        const filtered = existing.filter((g: any) => String(g.id) !== String(id));
        await setCollectionData("inward_grns", filtered);
      }
      await addTombstone("deleted_grn_ids", String(id));
      return res.json({ success: true, id });
    } catch (err: any) {
      console.error("Error in DELETE /api/grns:", err);
      return res.status(500).json({ error: err.message || "Failed to delete GRN" });
    }
  });

  // 3. INVENTORY ITEMS ROUTES (PostgreSQL public.inventory_items)
  app.get("/api/inventory", async (_req, res) => {
    try {
      // 1. Try public.inventory_items
      const { data: items, error } = await supabase
        .from("inventory_items")
        .select("*")
        .order("updated_at", { ascending: false });

      if (!error && Array.isArray(items)) {
        return res.json({ success: true, data: items });
      }

      // 2. Fallback to collection 'inventory_items' or 'inventory'
      let colInv = await getCollectionData("inventory_items");
      if (!Array.isArray(colInv) || colInv.length === 0) {
        colInv = await getCollectionData("inventory");
      }

      if (Array.isArray(colInv) && colInv.length > 0) {
        return res.json({ success: true, data: colInv });
      }

      // 3. Fallback to inventory_batches
      const { data: batches, error: batchErr } = await supabase
        .from("inventory_batches")
        .select("*");
      if (!batchErr && Array.isArray(batches) && batches.length > 0) {
        const mapped = batches.map((b) => ({
          id: b.id,
          product_id: String(b.product_id),
          stock_on_hand: b.quantity || 0,
          reserved_stock: 0,
          reorder_level: 10,
          warehouse_id: b.warehouse_id,
          batch_number: b.batch_number,
          mfg_date: b.mfg_date,
          expiry_date: b.expiry_date,
          unit_cost: b.cost_price || 0,
          updated_at: b.updated_at || new Date().toISOString(),
        }));
        return res.json({ success: true, data: mapped });
      }

      return res.json({ success: true, data: [] });
    } catch (err: any) {
      console.error("Error in GET /api/inventory:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to fetch inventory", data: [] });
    }
  });

  app.post("/api/inventory/import", async (req, res) => {
    try {
      const { items, replaceAll } = req.body;
      const itemsList = Array.isArray(items) ? items : [];

      // Normalize items to inventory_items schema
      const formattedItems = itemsList.map((item: any, idx: number) => ({
        id: String(item.id || `inv_${Date.now()}_${idx}`),
        product_id: String(
          item.sku ||
            item.product_sku ||
            item.product_id ||
            item.productId ||
            item.id,
        ),
        stock_on_hand: Number(
          item.stock_on_hand ?? item.stockOnHand ?? item.quantity ?? 0,
        ),
        reserved_stock: Number(item.reserved_stock ?? item.reservedStock ?? 0),
        reorder_level: Number(item.reorder_level ?? item.reorderLevel ?? 10),
        warehouse_id: item.warehouse_id || item.warehouseId || null,
        warehouse_name: item.warehouse_name || item.warehouseName || null,
        warehouse_bay: item.warehouse_bay || item.warehouseBay || null,
        batch_number: item.batch_number || item.batchNumber || null,
        mfg_date: item.mfg_date || item.mfgDate || null,
        expiry_date: item.expiry_date || item.expiryDate || null,
        unit_cost: Number(item.unit_cost ?? item.unitCost ?? item.cost ?? 0),
        selling_scheme: item.selling_scheme || item.sellingScheme || null,
        selling_scheme_discount: Number(
          item.selling_scheme_discount ?? item.sellingSchemeDiscount ?? 0,
        ),
        selling_scheme_label:
          item.selling_scheme_label || item.sellingSchemeLabel || null,
        last_restocked:
          item.last_restocked || item.lastRestocked || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // 1. Try public.inventory_items table
      let savedToTable = false;
      if (replaceAll) {
        // delete-then-insert only when replaceAll is true
        const { error: delErr } = await supabase
          .from("inventory_items")
          .delete()
          .neq("id", "___NEVER_MATCH___");
        if (!delErr) {
          if (formattedItems.length > 0) {
            const { error: insErr } = await supabase
              .from("inventory_items")
              .insert(formattedItems);
            if (!insErr) savedToTable = true;
          } else {
            savedToTable = true;
          }
        }
      } else {
        if (formattedItems.length > 0) {
          const { error: upErr } = await supabase
            .from("inventory_items")
            .upsert(formattedItems, { onConflict: "id" });
          if (!upErr) savedToTable = true;
        } else {
          savedToTable = true;
        }
      }

      // 2. Also keep collection 'inventory_items' updated
      if (replaceAll) {
        await setCollectionData("inventory_items", formattedItems);
      } else {
        const existing = await getCollectionData("inventory_items");
        const list = Array.isArray(existing) ? existing : [];
        const map = new Map<string, any>();
        for (const ex of list) map.set(String(ex.id), ex);
        for (const it of formattedItems) map.set(String(it.id), it);
        await setCollectionData("inventory_items", Array.from(map.values()));
      }

      return res.json({
        success: true,
        count: formattedItems.length,
        savedToTable,
        message: `Imported ${formattedItems.length} inventory items to Supabase`,
      });
    } catch (err: any) {
      console.error("Error importing inventory:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to import inventory" });
    }
  });

  app.put("/api/inventory/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = {
        ...req.body,
        updated_at: new Date().toISOString(),
      };

      await supabase.from("inventory_items").update(updates).eq("id", id);

      const existing = await getCollectionData("inventory_items");
      if (Array.isArray(existing)) {
        const updated = existing.map((item: any) =>
          String(item.id) === String(id) ? { ...item, ...updates } : item,
        );
        await setCollectionData("inventory_items", updated);
      }

      return res.json({ success: true, id, updates });
    } catch (err: any) {
      console.error("Error updating inventory item:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to update inventory item" });
    }
  });

  // PRODUCTS & BATCHES ROUTES (PostgreSQL public.products and public.inventory_batches)
  app.get("/api/products", async (_req, res) => {
    try {
      const { data: prods, error } = await supabase
        .from("products")
        .select("*")
        .order("id", { ascending: true });

      if (!error && Array.isArray(prods) && prods.length > 0) {
        // Enforce UPPERCASE product names across all records
        const formatted = prods.map((r: any) => {
          const detectedVol = volumeFromName(r.name);
          const vol = Number(r.volume) > 0 ? Number(r.volume) : (detectedVol || 150);
          const pack = r.pack && r.pack.trim() !== "" && r.pack !== "pcs" ? r.pack : detectPack(r.name);
          return {
            id: Number(r.id),
            sku: r.sku || `PRD-${r.id}`,
            name: String(r.name || "").trim().toUpperCase(),
            category: r.category,
            volume: vol,
            pack,
            expiry: r.expiry || "",
            batchNumber: r.batch_number || "",
            mfgDate: r.mfg_date || "",
            warehouseId: r.warehouse_id || "",
            opening: Number(r.opening || 0),
            cost: Number(r.cost || 0),
            effectiveCost: Number(r.effective_cost || r.cost || 0),
            retail: Number(r.retail || 0),
            wholesale: Number(r.wholesale || 0),
            hsn: r.hsn || "2202",
            gstRate:
              r.gst_rate !== undefined && r.gst_rate !== null
                ? Number(r.gst_rate)
                : 0.18,
            scheme: r.scheme || "",
            updatedAt: r.updated_at || undefined,
          };
        });

        // Background idempotent sync: normalize lowercase names or zero volumes in Supabase
        const prodsNeedingUpdate = prods.filter(
          (r: any) =>
            (r.name && r.name !== String(r.name).trim().toUpperCase()) ||
            !r.volume ||
            Number(r.volume) <= 0,
        );
        if (prodsNeedingUpdate.length > 0) {
          Promise.all(
            prodsNeedingUpdate.map((p: any) =>
              supabase
                .from("products")
                .update({
                  name: String(p.name).trim().toUpperCase(),
                  volume: Number(p.volume) > 0 ? Number(p.volume) : (volumeFromName(p.name) || 150),
                  pack: p.pack && p.pack.trim() !== "" && p.pack !== "pcs" ? p.pack : detectPack(p.name),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", p.id),
            ),
          ).catch((e) => console.warn("Background product sync warning:", e));
        }

        return res.json({ success: true, data: formatted });
      }

      const colProds = await getCollectionData("products");
      const normalizedColProds = (Array.isArray(colProds) ? colProds : []).map((p: any) => {
        const detectedVol = volumeFromName(p.name);
        const vol = Number(p.volume) > 0 ? Number(p.volume) : (detectedVol || 150);
        const pack = p.pack && p.pack.trim() !== "" && p.pack !== "pcs" ? p.pack : detectPack(p.name);
        return {
          ...p,
          name: String(p.name || "").trim().toUpperCase(),
          volume: vol,
          pack,
        };
      });
      return res.json({
        success: true,
        data: normalizedColProds,
      });
    } catch (err: any) {
      console.error("Error in GET /api/products:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to fetch products", data: [] });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const { products } = req.body;
      const prodsList = Array.isArray(products)
        ? products
        : req.body
          ? [req.body]
          : [];
      if (prodsList.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const payload = prodsList.map((p: any) => {
        const detectedVol = volumeFromName(p.name);
        const vol = Number(p.volume) > 0 ? Number(p.volume) : (detectedVol || 150);
        const pack = p.pack && p.pack.trim() !== "" && p.pack !== "pcs" ? p.pack : detectPack(p.name);
        return {
          id: Number(p.id),
          sku: String(p.sku || `PRD-${p.id}`),
          name: String(p.name || "").trim().toUpperCase(),
          category: String(p.category || "energy"),
          volume: vol,
          pack,
          expiry: String(p.expiry || ""),
          batch_number: String(p.batchNumber || p.batch_number || ""),
          mfg_date: String(p.mfgDate || p.mfg_date || ""),
          warehouse_id: String(p.warehouseId || p.warehouse_id || ""),
          opening: Number(p.opening || 0),
          cost: Number(p.cost || 0),
          effective_cost: Number(
            p.effectiveCost || p.effective_cost || p.cost || 0,
          ),
          retail: Number(p.retail || 0),
          wholesale: Number(p.wholesale || 0),
          hsn: String(p.hsn || "2202"),
          gst_rate: Number(p.gstRate !== undefined ? p.gstRate : 0.18),
          scheme: String(p.scheme || ""),
          // keep the device's own edit time so the newest copy can be told apart on every device
          updated_at: String(p.updatedAt || p.updated_at || new Date().toISOString()),
        };
      });

      const { error } = await supabase
        .from("products")
        .upsert(payload, { onConflict: "id" });
      if (error) {
        // Fallback in case table has base columns
        const fallback = payload.map(
          ({
            sku: _s,
            batch_number: _b,
            mfg_date: _m,
            effective_cost: _e,
            hsn: _h,
            gst_rate: _g,
            scheme: _sc,
            ...rest
          }: any) => rest,
        );
        await supabase.from("products").upsert(fallback, { onConflict: "id" });
      }

      // Mirror normalized items to collection
      const normalizedProdsList = prodsList.map((p: any) => {
        const detectedVol = volumeFromName(p.name);
        const vol = Number(p.volume) > 0 ? Number(p.volume) : (detectedVol || 150);
        const pack = p.pack && p.pack.trim() !== "" && p.pack !== "pcs" ? p.pack : detectPack(p.name);
        return {
          ...p,
          volume: vol,
          pack,
        };
      });
      await setCollectionData("products", normalizedProdsList);
      return res.json({ success: true, count: payload.length });
    } catch (err: any) {
      console.error("Error in POST /api/products:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to save products" });
    }
  });

  app.get("/api/batches", async (_req, res) => {
    try {
      const { data: batches, error } = await supabase
        .from("inventory_batches")
        .select("*");
      if (!error && Array.isArray(batches) && batches.length > 0) {
        const formatted = batches.map((r: any) => ({
          id: String(r.id),
          productId: Number(r.product_id),
          sku: r.sku || "",
          batchNumber: r.batch_number || "",
          mfgDate: r.mfg_date || "",
          expiryDate: r.expiry_date || "",
          warehouseId: r.warehouse_id || "",
          quantity: Number(r.quantity || 0),
          costPrice: Number(r.cost_price || 0),
          mrp: Number(r.mrp || 0),
          scheme: r.scheme || "",
          effectiveCostPrice: Number(r.effective_cost_price || 0),
          notes: r.notes || "",
        }));
        return res.json({ success: true, data: formatted });
      }

      const colBatches = await getCollectionData("inventory_batches");
      return res.json({
        success: true,
        data: Array.isArray(colBatches) ? colBatches : [],
      });
    } catch (err: any) {
      console.error("Error in GET /api/batches:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to fetch batches", data: [] });
    }
  });

  app.post("/api/batches", async (req, res) => {
    try {
      const { batches } = req.body;
      const batchList = Array.isArray(batches)
        ? batches
        : req.body
          ? [req.body]
          : [];
      if (batchList.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const payload = batchList.map((b: any) => ({
        id: String(b.id),
        product_id: Number(b.productId || b.product_id),
        sku: String(b.sku || ""),
        batch_number: String(b.batchNumber || b.batch_number || ""),
        mfg_date: b.mfgDate || b.mfg_date || null,
        expiry_date: b.expiryDate || b.expiry_date || null,
        warehouse_id: String(b.warehouseId || b.warehouse_id || ""),
        quantity: Number(b.quantity || 0),
        cost_price: Number(b.costPrice || b.cost_price || 0),
        mrp: Number(b.mrp || 0),
        scheme: String(b.scheme || ""),
        effective_cost_price: Number(
          b.effectiveCostPrice || b.effective_cost_price || 0,
        ),
        notes: String(b.notes || ""),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("inventory_batches")
        .upsert(payload, { onConflict: "id" });
      if (error) {
        const fallback = payload.map(({ sku: _s, ...rest }: any) => rest);
        await supabase
          .from("inventory_batches")
          .upsert(fallback, { onConflict: "id" });
      }

      await setCollectionData("inventory_batches", batchList);
      return res.json({ success: true, count: payload.length });
    } catch (err: any) {
      console.error("Error in POST /api/batches:", err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to save batches" });
    }
  });

  // 4. GENERIC COLLECTIONS ROUTES (STEP 3: partners, warehouses, warehouse_bays, stock_transactions, vehicle_trip, audit_sessions, stock_ledger_entries, reconciliation_transactions)
  app.get("/api/collections/:key", async (req, res) => {
    const { key } = req.params;
    try {
      // For warehouses, if collection is empty, check public.warehouses
      if (key === "warehouses") {
        const { data: whs, error } = await supabase
          .from("warehouses")
          .select("*");
        if (!error && Array.isArray(whs) && whs.length > 0) {
          return res.json({ success: true, key, data: whs });
        }
      }

      // Check PostgreSQL table fallback for supplier_credit_notes
      if (key === "supplier_credit_notes") {
        const data = await getCollectionData(key);
        if (Array.isArray(data) && data.length > 0) {
          return res.json({ success: true, key, data });
        }
        try {
          const { data: scns, error } = await supabase
            .from("supplier_credit_notes")
            .select("*")
            .order("created_at", { ascending: false });
          if (!error && Array.isArray(scns) && scns.length > 0) {
            const mapped = scns.map((r: any) => ({
              id: String(r.id),
              supplierName: r.supplier_name || "",
              schemeId: r.scheme_id || undefined,
              grnId: r.grn_id || undefined,
              productId: r.product_id ? Number(r.product_id) : undefined,
              period: r.period || undefined,
              creditNoteNumber: r.credit_note_number || undefined,
              creditNoteDate: r.credit_note_date || undefined,
              expectedAmount: Number(r.expected_amount || 0),
              actualAmount: Number(r.actual_amount || 0),
              status: r.status || "pending",
              attachmentRef: r.attachment_ref || undefined,
              notes: r.notes || "",
              createdAt: r.created_at || "",
              updatedAt: r.updated_at || "",
            }));
            await setCollectionData(key, mapped).catch(() => {});
            return res.json({ success: true, key, data: mapped });
          }
        } catch {
          // fallback to getCollectionData
        }
      }

      // Check PostgreSQL table fallback for audit_sessions
      if (key === "audit_sessions") {
        const data = await getCollectionData(key);
        if (Array.isArray(data) && data.length > 0) {
          return res.json({ success: true, key, data });
        }
        try {
          const { data: sess, error } = await supabase
            .from("audit_sessions")
            .select("*")
            .order("created_at", { ascending: false });
          if (!error && Array.isArray(sess) && sess.length > 0) {
            const mapped = sess.map((r: any) => ({
              id: String(r.id),
              warehouseId: r.warehouse_id || "",
              warehouseName: r.warehouse_name || "",
              date: r.date || "",
              time: r.time || "",
              auditorName: r.auditor_name || "",
              referenceNote: r.reference_note || "",
              entries: Array.isArray(r.entries) ? r.entries : [],
              editLog: Array.isArray(r.edit_log) ? r.edit_log : [],
              createdAt: r.created_at || "",
              updatedAt: r.updated_at || "",
            }));
            await setCollectionData(key, mapped).catch(() => {});
            return res.json({ success: true, key, data: mapped });
          }
        } catch {
          // fallback to getCollectionData
        }
      }

      // Check PostgreSQL table fallback for stock_ledger_entries
      if (key === "stock_ledger_entries") {
        const data = await getCollectionData(key);
        if (Array.isArray(data) && data.length > 0) {
          return res.json({ success: true, key, data });
        }
        try {
          const { data: sles, error } = await supabase
            .from("stock_ledger_entries")
            .select("*")
            .order("timestamp", { ascending: false });
          if (!error && Array.isArray(sles) && sles.length > 0) {
            const mapped = sles.map((r: any) => ({
              id: String(r.id),
              productId: Number(r.product_id),
              warehouseId: r.warehouse_id || "",
              quantity: Number(r.quantity || 0),
              transactionType: r.transaction_type || "audit_reconciliation",
              referenceAuditSessionId:
                r.reference_audit_session_id || undefined,
              referenceReconciliationId:
                r.reference_reconciliation_id || undefined,
              reason: r.reason || "",
              userId: r.user_id || undefined,
              userName: r.user_name || undefined,
              timestamp: r.timestamp || "",
            }));
            await setCollectionData(key, mapped).catch(() => {});
            return res.json({ success: true, key, data: mapped });
          }
        } catch {
          // fallback to getCollectionData
        }
      }

      // Check PostgreSQL table fallback for reconciliation_transactions
      if (key === "reconciliation_transactions") {
        const data = await getCollectionData(key);
        if (Array.isArray(data) && data.length > 0) {
          return res.json({ success: true, key, data });
        }
        try {
          const { data: txns, error } = await supabase
            .from("reconciliation_transactions")
            .select("*")
            .order("created_at", { ascending: false });
          if (!error && Array.isArray(txns) && txns.length > 0) {
            const mapped = txns.map((r: any) => ({
              id: String(r.id),
              auditSessionId: String(r.audit_session_id),
              varianceEntryId: String(r.variance_entry_id),
              type: r.type,
              fromProductId: Number(r.from_product_id),
              toProductId: r.to_product_id
                ? Number(r.to_product_id)
                : undefined,
              quantity: Number(r.quantity || 0),
              reasonCode: r.reason_code || undefined,
              matchScore:
                r.match_score !== null && r.match_score !== undefined
                  ? Number(r.match_score)
                  : undefined,
              notes: r.notes || "",
              identifiedBy: r.identified_by || "",
              approvedBy: r.approved_by || undefined,
              approvedAt: r.approved_at || undefined,
              createdAt: r.created_at || "",
            }));
            await setCollectionData(key, mapped).catch(() => {});
            return res.json({ success: true, key, data: mapped });
          }
        } catch {
          // fallback to getCollectionData
        }
      }

      const data = await getCollectionData(key);
      return res.json({
        success: true,
        key,
        data: Array.isArray(data) ? data : [],
      });
    } catch (err: any) {
      console.error(`Error in GET /api/collections/${key}:`, err);
      return res
        .status(500)
        .json({
          error: err.message || "Failed to fetch collection",
          key,
          data: [],
        });
    }
  });

  app.put("/api/collections/:key", async (req, res) => {
    const { key } = req.params;
    try {
      let collectionData =
        req.body?.data !== undefined ? req.body.data : req.body;

      // Collections with their own endpoints (merge rules, tombstones, number counters) must not be replaced
      // blindly by a device holding an old copy.
      if (["orders", "doc_counters", "doc_holds"].includes(key)) {
        return res.status(403).json({
          error: `Collection '${key}' is managed by its own endpoint and cannot be replaced here`,
        });
      }
      // Deletion lists only ever grow: union with what is stored, never shrink.
      if (
        ["deleted_bill_ids", "deleted_grn_ids", "deleted_trip_ids", "deleted_records"].includes(key) &&
        Array.isArray(collectionData)
      ) {
        const known = await readListFresh(key);
        const seen = new Set(known.map(listItemKey));
        collectionData = [
          ...known,
          ...collectionData.filter((x: any) => !seen.has(listItemKey(x))),
        ].slice(-5000);
      }
      const ok = await setCollectionData(key, collectionData);
      if (!ok) {
        return res
          .status(500)
          .json({ error: `Failed to save collection ${key} to Supabase` });
      }

      // Also sync to normalized PostgreSQL tables if array has records.
      // Awaited + batched (one request per table) so parent rows exist before children (FK order).
      if (Array.isArray(collectionData) && collectionData.length > 0) {
        if (key === "audit_sessions") {
          await syncNormalizedRows(
            "audit_sessions",
            collectionData.map((s: any) => ({
              id: s.id,
              warehouse_id: s.warehouseId || null,
              warehouse_name: s.warehouseName || null,
              date: s.date,
              time: s.time || null,
              auditor_name: s.auditorName,
              reference_note: s.referenceNote || "",
              entries: s.entries,
              edit_log: s.editLog || [],
              created_at: s.createdAt,
              updated_at: s.updatedAt,
            })),
          );
        } else if (key === "stock_ledger_entries") {
          await syncNormalizedRows(
            "stock_ledger_entries",
            collectionData.map((e: any) => ({
              id: e.id,
              product_id: e.productId,
              warehouse_id: e.warehouseId || null,
              quantity: e.quantity,
              transaction_type: e.transactionType || "audit_reconciliation",
              reference_audit_session_id: e.referenceAuditSessionId,
              reference_reconciliation_id: e.referenceReconciliationId,
              reason: e.reason,
              user_id: e.userId || null,
              user_name: e.userName || null,
              timestamp: e.timestamp,
            })),
          );
        } else if (key === "reconciliation_transactions") {
          await syncNormalizedRows(
            "reconciliation_transactions",
            collectionData.map((t: any) => ({
              id: t.id,
              audit_session_id: t.auditSessionId,
              variance_entry_id: t.varianceEntryId,
              type: t.type,
              from_product_id: t.fromProductId,
              to_product_id: t.toProductId || null,
              quantity: t.quantity,
              reason_code: t.reasonCode || null,
              match_score: t.matchScore !== undefined ? t.matchScore : null,
              notes: t.notes || "",
              identified_by: t.identifiedBy,
              approved_by: t.approvedBy || null,
              approved_at: t.approvedAt || null,
              created_at: t.createdAt,
            })),
          );
        } else if (key === "supplier_credit_notes") {
          await syncNormalizedRows(
            "supplier_credit_notes",
            collectionData.map((n: any) => ({
              id: String(n.id),
              supplier_name: n.supplierName || n.supplier_name || "Supplier",
              scheme_id: n.schemeId || n.scheme_id || null,
              grn_id: n.grnId || n.grn_id || null,
              product_id: n.productId
                ? Number(n.productId)
                : n.product_id
                  ? Number(n.product_id)
                  : null,
              period: n.period || null,
              credit_note_number:
                n.creditNoteNumber || n.credit_note_number || null,
              credit_note_date: n.creditNoteDate || n.credit_note_date || null,
              expected_amount: Number(
                n.expectedAmount ?? n.expected_amount ?? 0,
              ),
              actual_amount: Number(n.actualAmount ?? n.actual_amount ?? 0),
              status: n.status || "pending",
              attachment_ref: n.attachmentRef || n.attachment_ref || null,
              notes: n.notes || "",
              created_at:
                n.createdAt || n.created_at || new Date().toISOString(),
              updated_at:
                n.updatedAt || n.updated_at || new Date().toISOString(),
            })),
          );
        }
      }

      return res.json({ success: true, key, data: collectionData });
    } catch (err: any) {
      console.error(`Error in PUT /api/collections/${key}:`, err);
      return res
        .status(500)
        .json({ error: err.message || "Failed to persist collection" });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Fallback for SPA routing to ensure transformIndexHtml is always applied
    app.use("*", async (req, res, next) => {
      // Don't intercept API routes
      if (req.originalUrl.startsWith("/api")) {
        return next();
      }
      try {
        const indexPath = path.resolve(_appDirname, "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // The built-in dev password / session secret exist only for a developer machine. If they are in use, do not expose
  // the server to the network (set ADMIN_PASSWORD and APP_SESSION_SECRET, or ALLOW_INSECURE_DEV_HOST=true to override).
  const usingDevDefaults =
    !authCfg.production &&
    !IS_TEST_RUN &&
    (!(process.env.ADMIN_PASSWORD || process.env.VITE_LOCAL_ADMIN_PASSWORD) || !process.env.APP_SESSION_SECRET);
  const HOST = usingDevDefaults && process.env.ALLOW_INSECURE_DEV_HOST !== "true" ? "127.0.0.1" : "0.0.0.0";
  if (HOST === "127.0.0.1") {
    console.warn("[SECURITY] Built-in dev credentials in use: listening on 127.0.0.1 only. Set ADMIN_PASSWORD and APP_SESSION_SECRET to open it up.");
  }
  httpServer.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
