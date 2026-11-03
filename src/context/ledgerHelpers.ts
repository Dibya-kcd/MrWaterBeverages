/**
 * Module-level helpers for the ledger (storage keys, tombstones, merge rules, document numbers,
 * price caches, initial-state loader). Moved out of LedgerContext.tsx unchanged so that file
 * only holds the provider. Nothing here touches React state.
 */
import { DEFAULT_BILLING_SETTINGS, DEFAULT_ORG_PROFILE, INIT_WAREHOUSES } from "../constants/initialData";
import { loadCachedBillingSettings, loadCachedOrders, loadCachedGrns, reportSyncFailure, reportSyncSuccess } from "../utils/storage";
import { Audit, Bill, BillingSettings, CartState, Customer, ExistingCustomer, FontSize, GRN, GrnLineItem, GrnChange, GstMode, InventoryBatch, OrganizationProfile, PaymentRecord, PaymentAuditEntry, Product, Promotion, StickyTotalPosition, StockTransfer, Trip, Warehouse } from "../types";
import { generateAutoSku, generateBatchNumber, normalizeTo8DigitHsn, gstRateFromHsn, inferUnitsPerCase, productTaxFields, resolveItemCrateCost, resolveItemLandedCrateCost } from "../utils/billing";
import { buildProductBatchLines, productHasBatchInWarehouse, validateGrnDraft, replayStockTransfers } from "../utils/stockLocations";
import { todayISO } from "../utils/dateLocal";

export const PAYMENT_TOMBSTONE_KEY = "payment_deleted_ids_v1";
export const PAYMENT_AUDIT_KEY = "payment_audit_log_v1";
export const CUSTOMER_TOMBSTONE_KEY = "customer_deleted_ids_v1";
export const EXPENSE_TOMBSTONE_KEY = "expense_deleted_ids_v1";

export function readExpenseTombstones(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPENSE_TOMBSTONE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function addExpenseTombstones(ids: string[]) {
  if (!ids.length) return;
  try {
    const set = readExpenseTombstones();
    ids.forEach((id) => set.add(id));
    localStorage.setItem(
      EXPENSE_TOMBSTONE_KEY,
      JSON.stringify(Array.from(set).slice(-5000)),
    );
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

/**
 * Canonical form of a customer name used for every "is this the same shop?" check.
 * Keeps letters and digits of ANY script (Odia, Hindi, ...) - the old ASCII-only rule turned every
 * non-English name into a blank, so all such shops looked identical. Case, spacing and punctuation
 * are ignored; for plain English names the result is the same as before.
 */
export const normCustName = (n?: string): string => {
  return (n || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}_\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

export function readPaymentTombstones(): Set<string> {
  try {
    const raw = localStorage.getItem(PAYMENT_TOMBSTONE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function addPaymentTombstones(ids: string[]) {
  if (!ids.length) return;
  try {
    const set = readPaymentTombstones();
    ids.forEach((id) => set.add(id));
    localStorage.setItem(
      PAYMENT_TOMBSTONE_KEY,
      JSON.stringify(Array.from(set).slice(-5000)),
    );
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

export function withoutDeletedPayments<T extends { id: string }>(list: T[]): T[] {
  const tomb = readPaymentTombstones();
  return tomb.size ? list.filter((p) => !tomb.has(p.id)) : list;
}

export function readCustomerTombstones(): Set<string> {
  try {
    const raw = localStorage.getItem(CUSTOMER_TOMBSTONE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function addCustomerTombstones(idsOrNames: string[]) {
  if (!idsOrNames.length) return;
  try {
    const set = readCustomerTombstones();
    idsOrNames.forEach((item) => {
      if (!item) return;
      set.add(item.trim());
      const norm = normCustName(item);
      if (norm) set.add(norm);
    });
    localStorage.setItem(
      CUSTOMER_TOMBSTONE_KEY,
      JSON.stringify(Array.from(set).slice(-5000)),
    );
  } catch {
    /* storage unavailable */
  }
}

export function withoutDeletedCustomers<T extends { id?: string; name?: string }>(list: T[]): T[] {
  const tomb = readCustomerTombstones();
  if (!tomb.size) return list;
  return list.filter((c) => {
    if (c.id && tomb.has(c.id)) return false;
    if (c.name && (tomb.has(c.name.trim()) || tomb.has(normCustName(c.name)))) return false;
    return true;
  });
}

/* Customers that are only known from old bills come back into the directory on their own (the
 * directory is built from the customer master PLUS bill names). When the owner deletes a customer
 * its name is hidden, so the directory stays clean while the past bills are kept. Adding a customer
 * with the same name again un-hides it. */
export const CUSTOMER_HIDDEN_KEY = "customer_hidden_names_v1";

export function readHiddenCustomerNames(): Set<string> {
  try {
    const raw = localStorage.getItem(CUSTOMER_HIDDEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function writeHiddenCustomerNames(set: Set<string>) {
  try {
    localStorage.setItem(
      CUSTOMER_HIDDEN_KEY,
      JSON.stringify(Array.from(set).slice(-5000)),
    );
  } catch {
    /* storage unavailable */
  }
}

/** When the same invoice exists locally and in the cloud, keep the copy that has more recorded edits
 * (then the one whose last edit is newer). A plain "remote wins" merge let an older cloud copy (or a pull
 * that started before the edit was saved) undo an edit that had just been made. */
export function pickNewerBill(local: Bill | undefined, remote: Bill): Bill {
  if (!local) return remote;
  // Every local change stamps bill.updatedAt, so the later stamp is the newer copy.
  const lt = Date.parse(local.updatedAt || "") || 0;
  const rt = Date.parse(remote.updatedAt || "") || 0;
  if (lt !== rt) return lt > rt ? local : remote;
  const le = Array.isArray(local.editHistory) ? local.editHistory : [];
  const re = Array.isArray(remote.editHistory) ? remote.editHistory : [];
  if (le.length !== re.length) return le.length > re.length ? local : remote;
  if (le.length > 0) {
    const lat = Date.parse(le[le.length - 1]?.at || "") || 0;
    const rat = Date.parse(re[re.length - 1]?.at || "") || 0;
    if (lat > rat) return local;
  }
  return remote;
}

export const productStampMs = (p?: { updatedAt?: string } | null) => Date.parse(p?.updatedAt || "") || 0;
/** Which copy of a product to keep: a copy edited later on THIS device must not be undone by an older cloud copy. */
export function newerProduct<T extends { updatedAt?: string }>(local: T | undefined, incoming: T): T {
  return local && productStampMs(local) > productStampMs(incoming) ? local : incoming;
}

/** Order-independent text of a trip, ignoring its own change stamp, to tell a real edit from a re-normalised copy. */
export function tripFingerprint(t: Trip): string {
  const { updatedAt: _u, ...rest } = t as any;
  const sorted = (v: any): any =>
    Array.isArray(v)
      ? v.map(sorted)
      : v && typeof v === "object"
        ? Object.keys(v)
            .sort()
            .reduce((o: any, k) => ((o[k] = sorted(v[k])), o), {})
        : v;
  return JSON.stringify(sorted(rest));
}

/** Stamps trip.updatedAt on every trip a LOCAL action changed. A stamp the caller set itself is kept. */
export function stampChangedTrips(prev: Trip[], next: Trip[]): Trip[] {
  if (next === prev) return prev;
  const before = new Map<number, Trip>();
  prev.forEach((t) => before.set(Number(t.id), t));
  const now = new Date().toISOString();
  return next.map((t) => {
    const p = before.get(Number(t.id));
    if (p === t) return t;
    if (p && (t.updatedAt || "") !== (p.updatedAt || "")) return t;
    if (p && tripFingerprint(p) === tripFingerprint(t)) return t;
    return { ...t, updatedAt: now };
  });
}

/**
 * Which copy of a trip to keep when two devices disagree. The later change stamp wins; without stamps a closed
 * trip beats an open one (a close is never undone by a copy that simply has not seen it), otherwise this device's
 * copy stays.
 */
export function pickNewerTrip(local: Trip | undefined, remote: Trip): Trip {
  if (!local) return remote;
  const lt = Date.parse(local.updatedAt || "") || 0;
  const rt = Date.parse(remote.updatedAt || "") || 0;
  if (lt !== rt) return lt > rt ? local : remote;
  if ((local.status === "closed") !== (remote.status === "closed")) {
    return local.status === "closed" ? local : remote;
  }
  return local;
}

/** Stamps bill.updatedAt on every bill a LOCAL action changed (new object, different content). */
export function stampChangedBills(prev: Bill[], next: Bill[]): Bill[] {
  if (next === prev) return prev;
  const before = new Map<number, Bill>();
  prev.forEach((b) => before.set(b.id, b));
  const now = new Date().toISOString();
  return next.map((b) => {
    const p = before.get(b.id);
    if (p === b) return b;
    if (p) {
      if (b.updatedAt !== p.updatedAt) return b; // caller already stamped it
      const keys = new Set([...Object.keys(p), ...Object.keys(b)]);
      let same = true;
      for (const k of keys) {
        if (k !== "updatedAt" && !Object.is((p as any)[k], (b as any)[k])) { same = false; break; }
      }
      if (same) return p;
    }
    return { ...b, updatedAt: now };
  });
}

/** Last 10 digits of a usable phone number, or "" for blank / placeholder numbers (1234567890, 0000000000, ...). */
export function last10PhoneDigits(phone?: string): string {
  const d = (phone || "").replace(/\D/g, "");
  if (!d || d === "1234567890" || /^0+$/.test(d) || /^9+$/.test(d) || d.length < 5) return "";
  return d.length >= 10 ? d.slice(-10) : "";
}

/**
 * Is a customer about to be added already registered?
 *  - sameShop:  same (normalized) name and a compatible phone (equal, or one side has none) -> the same customer
 *  - samePhone: same mobile number under a different name -> probably the same shop typed differently (ask first)
 * Two shops with the same name but different phone numbers are NOT the same shop.
 */
export function findDuplicateCustomer(
  list: Customer[],
  name: string,
  phone?: string,
): { sameShop?: Customer; samePhone?: Customer } {
  const n = normCustName(name);
  const ph = last10PhoneDigits(phone);
  const sameShop = n
    ? list.find((c) => {
        if (normCustName(c.name) !== n) return false;
        const cp = last10PhoneDigits(c.phone);
        const ca = last10PhoneDigits(c.altPhone);
        return !ph || (!cp && !ca) || ph === cp || ph === ca;
      })
    : undefined;
  if (sameShop) return { sameShop };
  const samePhone = ph
    ? list.find((c) => last10PhoneDigits(c.phone) === ph || last10PhoneDigits(c.altPhone) === ph)
    : undefined;
  return { samePhone };
}

/**
 * The by-name customer summary (`existingCustomers`) shows two registered shops that share a name but have
 * different phone numbers as ONE entry, so the second shop can never be picked. For pick-lists only: replace
 * such an entry by one entry per registered shop (each with its own id and phone). Their by-name totals cannot
 * be split, so those rows show no balance; the ledger is still exact once the shop is chosen by id.
 * Every other entry is returned unchanged.
 */
export function splitSameNameShops(existing: ExistingCustomer[], masters: Customer[]): ExistingCustomer[] {
  const last10 = (p?: string) => (p || "").replace(/\D/g, "").slice(-10);
  const byName = new Map<string, Customer[]>();
  for (const c of masters || []) {
    const k = normCustName(c.name);
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(c);
  }
  const split = new Set<string>();
  byName.forEach((list, k) => {
    const phones = new Set(list.map((c) => last10(c.phone)).filter((d) => d.length === 10));
    if (phones.size > 1) split.add(k);
  });
  if (split.size === 0) return existing;
  const out: ExistingCustomer[] = [];
  const done = new Set<string>();
  for (const e of existing) {
    const k = normCustName(e.name);
    if (!split.has(k)) {
      out.push(e);
      continue;
    }
    if (done.has(k)) continue;
    done.add(k);
    for (const c of byName.get(k)!) {
      out.push({
        id: c.id,
        name: c.name,
        phone: c.phone || "",
        altPhone: c.altPhone,
        address: c.address,
        city: c.city,
        gstin: c.gstin,
        creditLimit: c.creditLimit,
        openingBalance: c.openingBalance || 0,
        totalBills: 0,
        totalBilled: 0,
        totalPaid: 0,
        balanceDue: 0,
        lastBillDate: "",
      });
    }
  }
  return out;
}

/** Merge by id; when both sides have the same customer the most recently edited copy wins
 * (a plain "remote wins" merge was undoing renames that had not reached the cloud yet). */
export function mergeCustomersNewestWins(local: Customer[], remote: Customer[]): Customer[] {
  const map = new Map<string, Customer>();
  local.forEach((c) => map.set(c.id, c));
  remote.forEach((r) => {
    const l = map.get(r.id);
    if (!l) {
      map.set(r.id, r);
      return;
    }
    const lt = Date.parse(l.updatedAt || l.createdAt || "") || 0;
    const rt = Date.parse(r.updatedAt || r.createdAt || "") || 0;
    map.set(r.id, rt > lt ? r : l);
  });
  return Array.from(map.values());
}

export function readPaymentAudit(): PaymentAuditEntry[] {
  try {
    const raw = localStorage.getItem(PAYMENT_AUDIT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}


// ---- Never-reused document numbers -------------------------------------------------------
// Invoice and GRN numbers are derived from the highest existing number, which lets a number be
// reused after the latest document is deleted (GST risk: two different invoices sharing a number).
// A persisted high-water mark per sequence guarantees numbers only ever move forward.
export const DOC_COUNTER_KEY = "mrwater_doc_counters_v1";
export function readDocCounters(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DOC_COUNTER_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
import { isStaticDeployment, sendWrite } from "../utils/storage";

// A number the SERVER has set aside for this device (see /api/doc-numbers/reserve). Because the server
// hands out each number once, two devices can never issue the same invoice number. When the server cannot
// be reached the device falls back to "highest known + 1" (the old behaviour).
export const DOC_HELD_KEY = "mrwater_doc_reserved_v2";
export const DOC_DEVICE_KEY = "mrwater_device_id_v1";
// The server takes a held number back after 12 h; the device stops trusting it a little earlier.
export const HELD_MAX_AGE_MS = 11 * 60 * 60 * 1000;
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DOC_DEVICE_KEY);
    if (!id) {
      id = "dev_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DOC_DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "dev_unknown";
  }
}
export function readHeldRaw(): Record<string, { n: number; at: number }> {
  try {
    const v = JSON.parse(localStorage.getItem(DOC_HELD_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
/** Numbers this device currently holds from the server, by sequence (expired ones are ignored). */
export function readHeldNumbers(): Record<string, number> {
  const out: Record<string, number> = {};
  const now = Date.now();
  for (const [seq, h] of Object.entries(readHeldRaw())) {
    if (h && Number(h.n) > 0 && now - Number(h.at) < HELD_MAX_AGE_MS) out[seq] = Number(h.n);
  }
  return out;
}
export function writeHeld(seq: string, n: number | null) {
  try {
    const all = readHeldRaw();
    if (n === null) delete all[seq];
    else all[seq] = { n, at: Date.now() };
    localStorage.setItem(DOC_HELD_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}
export const docReservationInFlight: Record<string, boolean> = {};
/**
 * Ask the server for the next free number of `sequence` and keep it for this device's next document.
 * `floor` is the highest number this device has seen or used; the server gives back the same held number
 * until it has been used.
 */
export async function refillDocReservation(sequence: string, floor: number): Promise<void> {
  if (docReservationInFlight[sequence]) return;
  docReservationInFlight[sequence] = true;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), 5000);
  try {
    const res = await fetch("/api/doc-numbers/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence, floor, deviceId: getDeviceId() }),
      signal: ctrl?.signal,
    });
    if (!res.ok) return;
    const j = await res.json();
    const n = Number(j?.number);
    if (Number.isFinite(n) && n > 0) writeHeld(sequence, n);
  } catch {
    /* offline: the next number comes from the local fallback */
  } finally {
    clearTimeout(timer);
    docReservationInFlight[sequence] = false;
  }
}
/** The app is closing: give every held number back so it does not stay a hole in the invoice series. */
export function releaseDocReservations() {
  if (typeof fetch === "undefined") return;
  const held = readHeldNumbers();
  for (const seq of Object.keys(held)) {
    try {
      void fetch("/api/doc-numbers/release", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence: seq, deviceId: getDeviceId() }),
      }).catch(() => {});
    } catch {
      /* closing anyway */
    }
    writeHeld(seq, null);
  }
}
/** Returns the next number: the server-reserved one when this device holds a valid one, else max(existingMax, storedHighWater) + 1. */
export function reserveDocNumber(sequence: string, existingMax: number): number {
  const counters = readDocCounters();
  const floor = Math.max(existingMax, Number(counters[sequence]) || 0);
  const held = Number(readHeldNumbers()[sequence]) || 0;
  const next = held > floor ? held : floor + 1;
  try {
    localStorage.setItem(
      DOC_COUNTER_KEY,
      JSON.stringify({ ...counters, [sequence]: next }),
    );
  } catch {
    /* storage unavailable: fall back to existing-max behaviour */
  }
  writeHeld(sequence, null);
  void refillDocReservation(sequence, next); // line up the following number right away
  return next;
}

export const STORAGE_KEY = "mrwater_distribution_ledger_v4";

export function extractPromoProductIds(p: any): number[] {
  if (!p) return [];
  const raw = p?.productGroup ?? p?.product_group ?? p?.productIds ?? p?.product_ids ?? p?.productId ?? p?.product_id;
  if (Array.isArray(raw)) return raw.map(Number).filter((n) => !isNaN(n));
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed))
        return parsed.map(Number).filter((n) => !isNaN(n));
    } catch {}
    return raw
      .split(",")
      .map((s: string) => Number(s.trim()))
      .filter((n: number) => !isNaN(n));
  }
  if (typeof raw === "number" && !isNaN(raw)) return [raw];
  return [];
}

/** Normalize a raw promotion object so extended types (group/bundle) survive refresh/sync. */
export function normalizePromotion(p: any): any {
  if (!p) return p;
  const cfg = p?.config && typeof p.config === "object" ? p.config : {};
  const restoredType =
    p.type && !["bogo", "percent", "flat"].includes(String(p.type))
      ? p.type
      : cfg.originalType || p.type || "bogo";
  const ids = extractPromoProductIds(p);
  const group =
    Array.isArray(p.productGroup) && p.productGroup.length > 0
      ? p.productGroup.map(Number).filter((n: number) => !isNaN(n))
      : Array.isArray(cfg.productGroup) && cfg.productGroup.length > 0
        ? cfg.productGroup.map(Number).filter((n: number) => !isNaN(n))
        : ids;
  return {
    ...p,
    id: Number(p.id),
    type: restoredType,
    productIds: ids,
    productGroup: group,
    groupCategory: p.groupCategory ?? cfg.groupCategory,
    groupBrand: p.groupBrand ?? cfg.groupBrand,
    freeItemRule:
      p.freeItemRule ??
      p.freeItem ??
      cfg.freeItemRule ??
      cfg.freeItem ??
      "CHEAPEST_IN_GROUP",
    freeItem:
      p.freeItemRule ??
      p.freeItem ??
      cfg.freeItemRule ??
      cfg.freeItem ??
      "CHEAPEST_IN_GROUP",
    isActive: p.isActive !== false,
  };
}



// Removes every local-storage key this app (and its earlier legacy
// branding) has ever used for the offline business-data cache, now that
// the app runs strictly in direct Supabase cloud mode. Kept as one shared
// helper so the current and legacy v1/v2/v3 keys can't drift out of sync
// between the two places that purge local data.
export function purgeLegacyLocalStorageKeys() {
  localStorage.removeItem("mrwater_distribution_ledger_v3");
  localStorage.removeItem("mrwater_distribution_ledger_v2");
  localStorage.removeItem("mrwater_distribution_ledger_v1");
  localStorage.removeItem("radhika_distribution_ledger");
}

// Deleted dispositions are remembered so a stale cloud row / merge can never resurrect them.
export const DISP_TOMBSTONE_KEY = "deleted_inventory_disposition_ids";
export function readDispositionTombstones(): Set<string> {
  try {
    return new Set<string>(
      JSON.parse(localStorage.getItem(DISP_TOMBSTONE_KEY) || "[]"),
    );
  } catch {
    return new Set<string>();
  }
}
export function addDispositionTombstone(id: string) {
  try {
    const t = readDispositionTombstones();
    t.add(id);
    localStorage.setItem(DISP_TOMBSTONE_KEY, JSON.stringify(Array.from(t)));
  } catch {}
}

export const emptyCart = (): CartState => ({
  retailer: "",
  phone: "",
  date: todayISO(),
  items: [],
  warehouseId: "",
  tripId: undefined,
  vehicle: undefined,
  salesman: undefined,
  additionalDiscount: 0,
});

export const LINE_FIELD_LABELS: [keyof GrnLineItem, string][] = [
  ["productName", "Product name"],
  ["qty", "Billed qty (cases)"],
  ["freeQty", "Free qty (cases)"],
  ["unitPrice", "Rate / unit"],
  ["batchNumber", "Batch no"],
  ["expiry", "Expiry"],
  ["hsn", "HSN"],
  ["cgstPercent", "CGST %"],
  ["sgstPercent", "SGST %"],
  ["wholesaleRate", "Wholesale rate"],
  ["retailRate", "Retail rate"],
  ["supplierSchemeFreeQty", "Scheme free qty"],
];

export const fmtVal = (v: unknown): string =>
  v === undefined || v === null || v === "" ? "—" : String(v);

/**
 * Field-by-field comparison of a GRN before/after an edit, so every correction made while
 * reviewing an invoice is traceable (who / when / what / why).
 */
export function diffGrn(before: GRN, after: GRN): GrnChange[] {
  const changes: GrnChange[] = [];
  const header: [keyof GRN, string][] = [
    ["supplierName", "Supplier"],
    ["invoiceNo", "Invoice No"],
    ["inwardDate", "Inward date"],
    ["warehouseId", "Godown"],
    ["notes", "Notes"],
    ["totalReceivedQty", "Total cases received"],
    ["totalTaxable", "Taxable total"],
    ["totalTax", "Tax total"],
    ["grandTotal", "Grand total"],
  ];
  for (const [k, label] of header) {
    const a = fmtVal(before[k]);
    const b = fmtVal(after[k]);
    if (a !== b)
      changes.push({ scope: "header", field: label, from: a, to: b });
  }
  const beforeById = new Map(before.items.map((it) => [it.id, it]));
  const afterIds = new Set(after.items.map((it) => it.id));
  for (const it of after.items) {
    const old = beforeById.get(it.id);
    if (!old) {
      changes.push({
        scope: "line",
        lineLabel: it.productName,
        field: "Line added",
        from: "—",
        to: `${it.qty} cs @ ₹${it.unitPrice}`,
      });
      continue;
    }
    for (const [k, label] of LINE_FIELD_LABELS) {
      const a = fmtVal(old[k]);
      const b = fmtVal(it[k]);
      if (a !== b)
        changes.push({
          scope: "line",
          lineLabel: old.productName,
          field: label,
          from: a,
          to: b,
        });
    }
  }
  for (const it of before.items) {
    if (!afterIds.has(it.id)) {
      changes.push({
        scope: "line",
        lineLabel: it.productName,
        field: "Line removed",
        from: `${it.qty} cs @ ₹${it.unitPrice}`,
        to: "—",
      });
    }
  }
  return changes;
}

/**
 * Ensures every GRN has a strictly unique sequential grnNumber (e.g., GRN-2026-001, GRN-2026-002).
 * If duplicate or blank numbers exist, assigns unique sequential identifiers chronologically.
 */
export function ensureUniqueGrnNumbers(list: GRN[]): GRN[] {
  if (!list || list.length === 0) return [];

  // Sort chronologically ascending (oldest first)
  const sorted = [...list].sort((a, b) => {
    const da = a.inwardDate || a.createdAt || "";
    const db = b.inwardDate || b.createdAt || "";
    return da.localeCompare(db);
  });

  const used = new Set<string>();
  const result: GRN[] = [];

  for (const g of sorted) {
    let num = (g.grnNumber || "").trim();
    const match = num.match(/^GRN-(\d{4})-(\d+)$/);
    const year = match
      ? match[1]
      : g.inwardDate
        ? g.inwardDate.slice(0, 4)
        : "2026";

    if (!num || used.has(num)) {
      let seq = 1;
      while (used.has(`GRN-${year}-${String(seq).padStart(3, "0")}`)) {
        seq++;
      }
      num = `GRN-${year}-${String(seq).padStart(3, "0")}`;
    }

    used.add(num);
    result.push({ ...g, grnNumber: num });
  }

  // Preserve newest first order for UI
  return result.sort((a, b) => {
    const da = a.inwardDate || a.createdAt || "";
    const db = b.inwardDate || b.createdAt || "";
    return db.localeCompare(da);
  });
}

/**
 * Builds the complete Product catalog and Inventory Batches derived 100%
 * from posted Inward GRNs as the Single Source of Truth.
 */
export function buildCatalogFromGrns(
  grnList: GRN[],
  baseWarehouses: Warehouse[] = [],
): { products: Product[]; batches: InventoryBatch[] } {
  const prodMap = new Map<string, Product>();
  const batches: InventoryBatch[] = [];
  let nextId = 1;

  for (const grn of grnList) {
    const isStockPosted =
      grn.stockPosted !== false &&
      !grn.notes?.toLowerCase().includes("zero stock posted") &&
      !grn.notes?.toLowerCase().includes("without stock posting") &&
      !grn.editHistory?.some(
        (e) =>
          e.action === "historical_restore" &&
          e.reason?.toLowerCase().includes("without stock posting"),
      );

    for (const item of grn.items) {
      const normName = item.productName.trim().toLowerCase();
      let existing = prodMap.get(normName);

      const billedQty = Math.max(0, Number(item.qty) || 0);
      const freeQty = Math.max(0, Number(item.freeQty) || 0);
      // FIX: `item.qty`/`item.totalReceivedQty` already represent the total physically
      // received quantity under the existing (inclusive) GRN scheme model — freeQty is a
      // portion carved OUT of qty, not additional to it (see calculateLandedCostBreakdown
      // in utils/billing.ts, which hard-locks totalReceivedQty = qty for b2g1/free_cases).
      // Adding freeQty again here double-counted free stock and inflated `opening`/batch
      // quantity beyond what was actually received. The only quantity that is genuinely
      // additive on top of the existing total is the new Supplier Scheme (Type A) free
      // goods field, which is summed in separately, once, right here.
      const supplierSchemeFreeQty = Math.max(
        0,
        Number(item.supplierSchemeFreeQty) || 0,
      );
      const existingTotalReceived = Number(item.totalReceivedQty) || billedQty;
      const totalReceived = existingTotalReceived + supplierSchemeFreeQty;
      const stockReceivedQty = isStockPosted ? totalReceived : 0;
      const unitCost = Number(item.unitPrice) || 0;
      const crateCost = resolveItemCrateCost(item);
      const crateLandedCost = resolveItemLandedCrateCost(item);
      const effCost =
        totalReceived > 0
          ? (crateCost * existingTotalReceived) / totalReceived
          : crateCost;

      // FIX (multi-warehouse inward bug): never silently default to warehouses[0] or a
      // hardcoded id here. A GRN posted through postGrn always carries a real,
      // explicitly-chosen warehouseId (postGrn now hard-validates this — see
      // validateGrnDraft) — so if it is ever missing here, that is legacy data from
      // before this fix, and stock for that line must show as "Unassigned" rather than
      // being silently reassigned to whichever warehouse happens to be baseWarehouses[0].
      const targetWh = grn.warehouseId || "";

      if (!existing) {
        const prodId = item.productId || nextId++;
        const skuCode =
          item.sku || generateAutoSku(item.productName, item.category, prodId);
        const batchLot =
          item.batchNumber ||
          generateBatchNumber(
            item.productName,
            item.schemeText ? "SCH" : undefined,
          );

        const newProd: Product = {
          id: prodId,
          sku: skuCode,
          name: item.productName.trim().toUpperCase(),
          category: item.category,
          volume: item.volume || 150,
          pack: item.pack || "PET",
          opening: stockReceivedQty,
          cost: unitCost || crateCost,
          effectiveCost: effCost,
          landedCostPerCrate: crateLandedCost,
          wholesale: Number(item.wholesaleRate) || Math.round((crateLandedCost || unitCost) * 1.1),
          retail: Number(item.retailRate) || Math.round((crateLandedCost || unitCost) * 1.25),
          expiry: item.expiry || "2026-12-31",
          mfgDate: item.mfgDate,
          batchNumber: batchLot,
          warehouseId: isStockPosted ? targetWh : "",
          hsn: normalizeTo8DigitHsn(item.hsn, item.category, item.productName),
          gstRate:
            gstRateFromHsn(normalizeTo8DigitHsn(item.hsn, item.category, item.productName)) ??
            (item.cgstPercent + item.sgstPercent) / 100,
          unitsPerCrate:
            Number(item.unitsPerCrate) > 0
              ? Number(item.unitsPerCrate)
              : inferUnitsPerCase(`${item.productName} ${item.pack || ""}`, item.volume),
          scheme: item.schemeText,
        };
        prodMap.set(normName, newProd);
        existing = newProd;
      } else {
        // Accumulate stock from multiple GRNs for the exact same product
        const prevTotal = existing.opening;
        const newTotal = prevTotal + stockReceivedQty;
        const blendedEffCost =
          newTotal > 0
            ? (prevTotal * (existing.effectiveCost || existing.cost) +
                stockReceivedQty * effCost) /
              newTotal
            : effCost;
        const blendedLandedCost =
          newTotal > 0
            ? (prevTotal * (existing.landedCostPerCrate || existing.cost) +
                stockReceivedQty * crateLandedCost) /
              newTotal
            : crateLandedCost;

        existing.opening = newTotal;
        existing.cost = unitCost || crateCost;
        existing.effectiveCost = Math.round(blendedEffCost * 100) / 100;
        existing.landedCostPerCrate = Math.round(blendedLandedCost * 100) / 100;
        if (item.wholesaleRate) existing.wholesale = item.wholesaleRate;
        if (item.retailRate) existing.retail = item.retailRate;
        if (item.expiry) existing.expiry = item.expiry;
        if (item.batchNumber) existing.batchNumber = item.batchNumber;
        if (item.schemeText) existing.scheme = item.schemeText;
        existing.hsn = normalizeTo8DigitHsn(item.hsn || existing.hsn, existing.category, existing.name);
        // FIX: this field is only a legacy "primary warehouse" hint for old single-
        // warehouse screens/exports — it must NEVER be treated as the source of truth
        // for where a product's stock physically is (a product can have live stock in
        // several warehouses at once via inventoryBatches). Previously this was
        // overwritten on every GRN line processed, so a product's hint silently
        // flipped to whichever warehouse happened to be processed last — which then
        // made per-warehouse filters on the Products screen hide stock that was
        // correctly sitting in inventoryBatches under other warehouses. Set it once,
        // on first assignment, and never move it again; real multi-warehouse stock
        // and batch/expiry data always come from inventoryBatches (see
        // buildProductBatchLines / productHasBatchInWarehouse in utils/stockLocations).
        if (targetWh && !existing.warehouseId && isStockPosted) existing.warehouseId = targetWh;
      }

      // Add corresponding batch entry for inventory audit and godown traceability
      const batchId = `batch_${grn.id}_${item.id}`;
      batches.push({
        id: batchId,
        productId: existing.id,
        sku: existing.sku || item.sku,
        batchNumber:
          item.batchNumber ||
          existing.batchNumber ||
          generateBatchNumber(item.productName),
        supplierInvoiceNo: grn.invoiceNo,
        supplierName: grn.supplierName,
        inwardDate: grn.inwardDate,
        mfgDate: item.mfgDate,
        expiryDate: item.expiry || existing.expiry,
        warehouseId: targetWh,
        quantity: stockReceivedQty,
        costPrice: unitCost || crateCost,
        effectiveCostPrice: effCost,
        mrp: item.retailRate || existing.retail,
        scheme: item.schemeText,
        billedQuantity: isStockPosted ? billedQty : 0,
        freeQuantity: isStockPosted ? freeQty : 0,
        supplierSchemeId: item.supplierSchemeId,
        supplierSchemeFreeQty: (isStockPosted && supplierSchemeFreeQty) ? supplierSchemeFreeQty : undefined,
        notes: `GRN: ${grn.grnNumber} · Inv: ${grn.invoiceNo}`,
        cgstRate: item.cgstPercent,
        sgstRate: item.sgstPercent,
        hsn: item.hsn || existing.hsn,
      });
    }
  }

  return {
    products: Array.from(prodMap.values()),
    batches,
  };
}

export interface PersistedState {
  grns: GRN[];
  products: Product[];
  warehouses: Warehouse[];
  inventoryBatches: InventoryBatch[];
  stockTransfers: StockTransfer[];
  promotions: Promotion[];
  bills: Bill[];
  trips: Trip[];
  audits: Audit[];
  payments?: PaymentRecord[];
  gstMode: GstMode;
  fontSize: FontSize;
  highContrast: boolean;
  lowVisionMode?: boolean;
  lowVisionStickyPosition?: StickyTotalPosition;
  orgProfile: OrganizationProfile;
  billingSettings: BillingSettings;
}

export function loadInitialState(): PersistedState {
  const initialGrns: GRN[] = [];
  const initialWarehouses: Warehouse[] = INIT_WAREHOUSES;

  const cleanFallback: PersistedState = {
    grns: [],
    products: [],
    warehouses: initialWarehouses,
    inventoryBatches: [],
    stockTransfers: [],
    promotions: [],
    bills: (() => {
      try {
        const cached = loadCachedOrders();
        if (Array.isArray(cached) && cached.length > 0) return cached as Bill[];
      } catch {}
      return [];
    })(),
    trips: [],
    audits: [],
    payments: [],
    gstMode: "inclusive",
    fontSize: "standard",
    highContrast: false,
    lowVisionMode: false,
    lowVisionStickyPosition: "bottom",
    orgProfile: DEFAULT_ORG_PROFILE,
    billingSettings: DEFAULT_BILLING_SETTINGS,
  };

  if (typeof window === "undefined") {
    return cleanFallback;
  }

  // Load UI display preferences (font size, contrast, low-vision mode)
  try {
    const uiRaw = localStorage.getItem("mrwater_ui_prefs");
    if (uiRaw) {
      const u = JSON.parse(uiRaw);
      // Before this fix the size only touched a few screens, and "large" was silently saved for everyone.
      // Now that it really scales the whole app, reset that untouched default once.
      if (u.fontSize) cleanFallback.fontSize = u.prefsVersion === 2 ? u.fontSize : "standard";
      if (typeof u.highContrast === "boolean")
        cleanFallback.highContrast = u.highContrast;
      if (typeof u.lowVisionMode === "boolean")
        cleanFallback.lowVisionMode = u.lowVisionMode;
      if (
        u.lowVisionStickyPosition === "top" ||
        u.lowVisionStickyPosition === "bottom"
      ) {
        cleanFallback.lowVisionStickyPosition = u.lowVisionStickyPosition;
      }
    }
  } catch {
    // ignore
  }

  // Load cached promotional schemes to ensure newly saved schemes are immediately active on boot/refresh
  try {
    const rawSchemes = localStorage.getItem("mrwater_cache_schemes");
    if (rawSchemes) {
      const parsedSchemes = JSON.parse(rawSchemes);
      const list = Array.isArray(parsedSchemes)
        ? parsedSchemes
        : Array.isArray(parsedSchemes?.data)
          ? parsedSchemes.data
          : null;
      if (Array.isArray(list) && list.length > 0) {
        cleanFallback.promotions = list.map((p: any) => normalizePromotion(p));
      }
    }
  } catch {
    // ignore
  }

  // Load cached billing settings so user configurations (like autoApplyPromotions: false) are preserved immediately
  try {
    const cachedBilling = loadCachedBillingSettings();
    if (cachedBilling && typeof cachedBilling === "object") {
      cleanFallback.billingSettings = {
        ...DEFAULT_BILLING_SETTINGS,
        ...cachedBilling,
      };
    }
  } catch {
    // ignore
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      // Sanitize: filter out mock sample id if present and ensure unique sequential GRN numbers
      let rawGrns = Array.isArray(parsed.grns) ? parsed.grns : [];
      if (rawGrns.length === 0) {
        const cachedGrns = loadCachedGrns();
        if (Array.isArray(cachedGrns) && cachedGrns.length > 0) {
          rawGrns = cachedGrns;
        }
      }
      const loadedGrns: GRN[] = ensureUniqueGrnNumbers(
        rawGrns.filter((g) => g.id !== "grn_sq02_sample"),
      );

      const loadedWarehouses: Warehouse[] =
        Array.isArray(parsed.warehouses) && parsed.warehouses.length > 0
          ? parsed.warehouses
          : initialWarehouses;

      // Products and Batches are derived directly from GRNs
      const { products: derivedProducts, batches: derivedBatches } =
        buildCatalogFromGrns(loadedGrns, loadedWarehouses);

      // Merge with cached products to preserve full catalog even before network sync
      let cachedProducts: Product[] = [];
      try {
        const rawCachedProds = localStorage.getItem("mrwater_cache_products");
        if (rawCachedProds) {
          const cp = JSON.parse(rawCachedProds);
          if (Array.isArray(cp)) cachedProducts = cp;
          else if (Array.isArray(cp?.data)) cachedProducts = cp.data;
        }
      } catch {}

      const productMap = new Map<number, Product>();
      derivedProducts.forEach((p) => productMap.set(p.id, p));
      cachedProducts.forEach((p) => {
        if (!productMap.has(p.id)) productMap.set(p.id, p);
      });
      if (Array.isArray(parsed.products)) {
        parsed.products.forEach((p) => {
          if (!productMap.has(p.id)) productMap.set(p.id, p);
        });
      }
      const loadedProducts = Array.from(productMap.values()).map((p) => ({
        ...p,
        name: String(p.name || "").trim().toUpperCase(),
        ...productTaxFields(p),
      }));

      const initialPromos =
        Array.isArray(parsed.promotions) && parsed.promotions.length > 0
          ? parsed.promotions.map((p: any) => normalizePromotion(p))
          : cleanFallback.promotions;

      // Merge bills from parsed.bills and mrwater_cache_orders to guarantee no bills lost on refresh
      let cachedBills: Bill[] = [];
      try {
        const rawOrders = localStorage.getItem("mrwater_cache_orders");
        if (rawOrders) {
          const parsedOrders = JSON.parse(rawOrders);
          if (Array.isArray(parsedOrders)) cachedBills = parsedOrders;
          else if (Array.isArray(parsedOrders?.bills))
            cachedBills = parsedOrders.bills;
        }
      } catch {}

      const billMap = new Map<number, Bill>();
      (Array.isArray(parsed.bills) ? parsed.bills : []).forEach((b) =>
        billMap.set(b.id, b),
      );
      cachedBills.forEach((b) => billMap.set(b.id, b));
      const loadedBills = Array.from(billMap.values()).sort(
        (a, b) => b.id - a.id,
      );

      return {
        grns: loadedGrns,
        products: loadedProducts,
        warehouses: loadedWarehouses,
        inventoryBatches: replayStockTransfers(
          derivedBatches,
          Array.isArray(parsed.stockTransfers) ? parsed.stockTransfers : [],
        ),
        stockTransfers: Array.isArray(parsed.stockTransfers)
          ? parsed.stockTransfers
          : [],
        promotions: initialPromos,
        bills: loadedBills,
        trips: Array.isArray(parsed.trips) ? parsed.trips : [],
        audits: Array.isArray(parsed.audits)
          ? parsed.audits.map((a, idx) => ({
              ...a,
              date:
                a.date && a.date.trim()
                  ? a.date.trim()
                  : new Date(Date.now() - idx * 86400000)
                      .toISOString()
                      .slice(0, 10),
              time: a.time || "10:00 AM",
            }))
          : [],
        payments: Array.isArray(parsed.payments) ? parsed.payments : [],
        gstMode: parsed.gstMode === "off" ? "off" : "inclusive",
        fontSize: cleanFallback.fontSize,
        highContrast: cleanFallback.highContrast,
        lowVisionMode: cleanFallback.lowVisionMode,
        lowVisionStickyPosition: cleanFallback.lowVisionStickyPosition,
        orgProfile: parsed.orgProfile
          ? { ...DEFAULT_ORG_PROFILE, ...parsed.orgProfile }
          : DEFAULT_ORG_PROFILE,
        billingSettings: parsed.billingSettings
          ? { ...cleanFallback.billingSettings, ...parsed.billingSettings }
          : cleanFallback.billingSettings,
      };
    }
  } catch (err) {
    console.warn("Failed to load persisted ledger data, starting clean:", err);
  }

  return cleanFallback;
}

export const MRWATER_CUSTOM_PRODUCT_PRICES_KEY = "mrwater_custom_product_prices";
export const MRWATER_CUSTOMER_PRODUCT_PRICES_KEY = "mrwater_customer_product_prices";

export function loadCachedCustomProductPrices(): Record<number, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MRWATER_CUSTOM_PRODUCT_PRICES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCachedCustomProductPrices(data: Record<number, number>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      MRWATER_CUSTOM_PRODUCT_PRICES_KEY,
      JSON.stringify(data),
    );
  } catch {
    // ignore
  }
}

export function loadCachedCustomerProductPrices(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MRWATER_CUSTOMER_PRODUCT_PRICES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCachedCustomerProductPrices(data: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      MRWATER_CUSTOMER_PRODUCT_PRICES_KEY,
      JSON.stringify(data),
    );
  } catch {
    // ignore
  }
}

export function extractCustomPricesFromBills(billsList: Bill[]): {
  productPrices: Record<number, number>;
  customerPrices: Record<string, number>;
} {
  const prodPrices: Record<number, number> = {};
  const custPrices: Record<string, number> = {};

  const sortedBills = [...billsList].sort((a, b) => {
    const dateComp = (b.date || "").localeCompare(a.date || "");
    if (dateComp !== 0) return dateComp;
    return Number(b.id) - Number(a.id);
  });

  for (const b of sortedBills) {
    if (!Array.isArray(b.items)) continue;
    const cleanCustomer = (b.retailer || "").trim().toLowerCase();

    for (const item of b.items) {
      if (
        !item ||
        !item.productId ||
        typeof item.rate !== "number" ||
        isNaN(item.rate) ||
        item.rate <= 0
      )
        continue;

      if (cleanCustomer) {
        const custKey = `${cleanCustomer}_${item.productId}`;
        if (custPrices[custKey] === undefined) {
          custPrices[custKey] = item.rate;
        }
      }

      if (prodPrices[item.productId] === undefined) {
        prodPrices[item.productId] = item.rate;
      }
    }
  }

  return { productPrices: prodPrices, customerPrices: custPrices };
}

/**
 * Fire-and-forget cloud write that is NOT silent. Supabase push helpers resolve
 * `{ success: false, error }` instead of throwing, and a bare `.catch(() => {})` discards
 * both that and real rejections. Everything routed through here reports to the shared sync
 * status (the app-wide "Cloud Persistence Warning" banner) and clears it on the next success.
 */
export function cloud(label: string, work: unknown): void {
  Promise.resolve(work)
    .then((res) => {
      const r = res as
        | {
            success?: boolean;
            error?: string;
            cloudSynced?: boolean;
            message?: string;
          }
        | undefined;
      if (r && typeof r === "object" && r.success === false) {
        reportSyncFailure(
          label,
          r.error || r.message || "Cloud write was rejected",
        );
      } else {
        reportSyncSuccess();
      }
    })
    .catch((err) => reportSyncFailure(label, err));
}

/** fetch() to our own API that surfaces network errors AND non-2xx responses. */
/**
 * Save to our own API. Goes through the on-device outbox (storage.ts): if the save cannot reach the server it is
 * kept, retried when the connection returns and at every app start, and counted in the banner. A conflict ("changed
 * on another device") or a refusal is reported once and not retried.
 */
export function cloudFetch(url: string, init?: RequestInit): void {
  // Static hosting has no /api: the same data already goes to Supabase through storage.ts, and calling the dead
  // route only produced a false "cloud write failed" warning.
  if (isStaticDeployment()) return;
  const method = String(init?.method || "GET").toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "DELETE") {
    cloud(`${method} ${url}`, fetch(url, init).then((r) => ({ success: r.ok, error: `HTTP ${r.status}` })));
    return;
  }
  let payload: any;
  try {
    payload = typeof init?.body === "string" && init.body ? JSON.parse(init.body) : undefined;
  } catch {
    payload = undefined;
  }
  const isRecord = payload && typeof payload === "object" && !Array.isArray(payload) && payload.id !== undefined;
  const key = isRecord ? `${method} ${url}#${payload.id}` : `${method} ${url}`;
  const isBill = /^\/api\/(bills|orders|create_order_with_schemes)$/.test(url.split("?")[0]);
  sendWrite(url, method as "POST" | "PUT" | "DELETE", payload, {
    key,
    billId: isBill && isRecord && Number.isFinite(Number(payload.id)) ? Number(payload.id) : undefined,
  }).catch((err) => reportSyncFailure(`${method} ${url}`, err));
}

