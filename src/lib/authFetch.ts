/**
 * Sends the signed-in user's session with every call to this app's own /api routes, so the server can require
 * a login (API_AUTH_REQUIRED=true). Calls to other sites are never touched. When the server says the session is
 * gone (401) the app is told to sign out.
 */
import { getSupabaseClient } from "./supabase";

const TOKEN_KEY = "mrwater_api_session_v1";

interface StoredToken {
  token: string;
  expiresAt: number;
}

export function setApiSession(token: string | null, expiresAt?: number) {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt: expiresAt || Date.now() + 12 * 3600e3 }));
  } catch {
    /* storage unavailable */
  }
}

function readApiSession(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (!t?.token || !(t.expiresAt > Date.now())) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

async function currentToken(): Promise<string | null> {
  const own = readApiSession();
  if (own) return own.token;
  try {
    const { data } = (await getSupabaseClient()?.auth.getSession()) || { data: null };
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

function isOwnApiCall(url: string): boolean {
  if (url.startsWith("/api/")) return true;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

const NO_TOKEN_NEEDED = ["/api/health", "/api/auth/"];

export function installAuthFetch() {
  if (typeof window === "undefined" || (window as any).__mrwaterAuthFetch) return;
  (window as any).__mrwaterAuthFetch = true;

  try {
    if (typeof window.fetch !== "function") return;
    const original = window.fetch.bind(window);

    const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      try {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!isOwnApiCall(url)) return original(input, init);
        const path = new URL(url, window.location.origin).pathname;
        const token = NO_TOKEN_NEEDED.some((p) => path.startsWith(p)) ? null : await currentToken();
        let nextInit = init;
        if (token) {
          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
          if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
          nextInit = { ...init, headers };
        }
        const res = await original(input, nextInit);
        if (res.status === 401 && !NO_TOKEN_NEEDED.some((p) => path.startsWith(p))) {
          if (token) {
            setApiSession(null);
            window.dispatchEvent(new Event("mrwater:auth-expired"));
          }
        }
        return res;
      } catch (err) {
        return original(input, init);
      }
    };

    try {
      Object.defineProperty(window, "fetch", {
        value: customFetch,
        writable: true,
        configurable: true,
      });
    } catch {
      try {
        (window as any).fetch = customFetch;
      } catch (err) {
        console.warn("Unable to intercept window.fetch (getter-only or non-configurable):", err);
      }
    }
  } catch (outerErr) {
    console.warn("installAuthFetch encountered non-fatal error:", outerErr);
  }
}

/** Signs in through the server. Returns null when the server has no sign-in configured (use the old route). */
export async function serverSignIn(
  kind: "admin" | "salesman",
  body: Record<string, string>,
): Promise<{ ok: boolean; error?: string; salesman?: any } | null> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;
  try {
    const res = await fetch(kind === "admin" ? "/api/auth/admin-login" : "/api/auth/salesman-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (res.status === 501 || res.status === 404) return null; // not configured on this server
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.token) {
      setApiSession(data.token, data.expiresAt);
      return { ok: true, salesman: data.salesman };
    }
    return { ok: false, error: data?.error || "Sign-in failed." };
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
    return null; // server unreachable or timed out: fall back to the offline route
  }
}
