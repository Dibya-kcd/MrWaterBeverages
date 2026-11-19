import type { Customer } from "../types";

/** Normalizes a customer name for matching (Unicode-safe for English, Odia, Hindi). */
export function normCustomerName(n?: string | null): string {
  return String(n || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}_\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Last 10 digits of a usable phone number, or "" for blank / placeholder numbers (1234567890, 0000000000, ...). */
export function realLast10Phone(phone?: string | null): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d || d === "1234567890" || /^0+$/.test(d) || /^9+$/.test(d) || d.length < 5) return "";
  return d.length >= 10 ? d.slice(-10) : "";
}

function stampMs(c: Pick<Customer, "updatedAt" | "createdAt">): number {
  return Date.parse(c.updatedAt || "") || Date.parse(c.createdAt || "") || 0;
}

function updatedMs(c: Pick<Customer, "updatedAt">): number {
  return Date.parse(c.updatedAt || "") || 0;
}

function createdMs(c: Pick<Customer, "createdAt">): number {
  return Date.parse(c.createdAt || "") || 0;
}

function isSyntheticBillCustId(id?: string): boolean {
  return String(id || "").startsWith("cust_bill_");
}

function hasAssignedBeat(c: Customer): boolean {
  return Boolean((c.beatId && c.beatId.trim()) || (c.route && c.route.trim()));
}

function metadataRichness(c: Customer): number {
  let score = 0;
  if (Math.abs(Number(c.openingBalance) || 0) > 0.004) score += 2;
  if ((Number(c.creditLimit) || 0) > 0) score += 1;
  if (c.gstin && c.gstin.trim()) score += 2;
  if (c.address && c.address.trim()) score += 1;
  if (c.nameOr && c.nameOr.trim()) score += 1;
  if (c.notes && c.notes.trim()) score += 1;
  return score;
}

/**
 * Picks the canonical surviving record and merges non-empty metadata (beat, real phone, address,
 * GSTIN, opening balance, aliases) from all duplicate rows of the exact same shop so nothing is lost.
 */
function collapseSameShopCluster<T extends Customer>(cluster: T[]): {
  winner: T;
  retiredIds: string[];
} {
  if (cluster.length === 1) {
    return { winner: cluster[0], retiredIds: [] };
  }

  // Pick the best surviving ID: prefer real master IDs over synthetic cust_bill_* IDs,
  // then beat-assigned records, then real phone, then metadata richness, then newest timestamp.
  const rankedForId = [...cluster].sort((a, b) => {
    const masterDiff = (isSyntheticBillCustId(a.id) ? 0 : 1) - (isSyntheticBillCustId(b.id) ? 0 : 1);
    if (masterDiff !== 0) return -masterDiff;
    const beatDiff = (hasAssignedBeat(a) ? 1 : 0) - (hasAssignedBeat(b) ? 1 : 0);
    if (beatDiff !== 0) return -beatDiff;
    const phoneDiff = (realLast10Phone(a.phone) ? 1 : 0) - (realLast10Phone(b.phone) ? 1 : 0);
    if (phoneDiff !== 0) return -phoneDiff;
    const richDiff = metadataRichness(a) - metadataRichness(b);
    if (richDiff !== 0) return -richDiff;
    return stampMs(b) - stampMs(a);
  });

  const winner = rankedForId[0];

  // For field merging, sort newest-updated first (winner breaks ties) so the latest edit wins.
  const newestFirst = [...cluster].sort((a, b) => {
    const uDiff = updatedMs(b) - updatedMs(a);
    if (uDiff !== 0) return uDiff;
    if (a.id === winner.id) return -1;
    if (b.id === winner.id) return 1;
    return createdMs(b) - createdMs(a);
  });

  // Beat: prefer the most recently updated record that actually has a beatId (or route).
  const beatSource =
    newestFirst.find((c) => Boolean(c.beatId && c.beatId.trim())) ||
    newestFirst.find((c) => Boolean(c.route && c.route.trim()));

  // Real (non-dummy) phone wins over blank or placeholder "1234567890".
  const phoneSource = newestFirst.find((c) => Boolean(realLast10Phone(c.phone)));
  const mergedPhone = phoneSource ? phoneSource.phone.trim() : (winner.phone || "").trim();
  const mergedPhone10 = realLast10Phone(mergedPhone);

  const altPhoneSource = newestFirst.find((c) => {
    const p10 = realLast10Phone(c.altPhone);
    return Boolean(p10 && p10 !== mergedPhone10);
  });

  const pickText = (getter: (c: T) => string | undefined): string | undefined => {
    const wVal = getter(winner)?.trim();
    if (wVal) return wVal;
    for (const c of newestFirst) {
      const v = getter(c)?.trim();
      if (v) return v;
    }
    return undefined;
  };

  // Name: prefer winner's name, unless a newer explicitly-updated record has the exact same normalized name.
  const mergedName = (winner.name || newestFirst[0]?.name || "").trim();
  const mergedNameKey = normCustomerName(mergedName);

  const creditSource = newestFirst.find((c) => (Number(c.creditLimit) || 0) > 0);
  const openingSource =
    Math.abs(Number(winner.openingBalance) || 0) > 0.004
      ? winner
      : newestFirst.find((c) => Math.abs(Number(c.openingBalance) || 0) > 0.004);

  const aliasSeen = new Set<string>();
  const mergedAliases: string[] = [];
  for (const c of newestFirst) {
    for (const raw of c.aliases || []) {
      const k = normCustomerName(raw);
      if (!k || k === mergedNameKey || aliasSeen.has(k)) continue;
      aliasSeen.add(k);
      mergedAliases.push(raw.trim());
    }
  }

  let earliestCreated = winner.createdAt || "";
  let earliestMs = createdMs(winner);
  let latestUpdated = winner.updatedAt;
  let latestUpdMs = updatedMs(winner);
  for (const c of cluster) {
    const cm = createdMs(c);
    if (cm > 0 && (earliestMs === 0 || cm < earliestMs)) {
      earliestMs = cm;
      earliestCreated = c.createdAt;
    }
    const um = updatedMs(c);
    if (um > latestUpdMs) {
      latestUpdMs = um;
      latestUpdated = c.updatedAt;
    }
  }

  const merged: T = {
    ...winner,
    name: mergedName,
    phone: mergedPhone,
    altPhone: altPhoneSource?.altPhone?.trim() || winner.altPhone,
    nameOr: pickText((c) => c.nameOr),
    address: pickText((c) => c.address),
    city: pickText((c) => c.city),
    route: beatSource?.route?.trim() || pickText((c) => c.route),
    beatId: beatSource?.beatId?.trim() || winner.beatId,
    gstin: pickText((c) => c.gstin),
    notes: pickText((c) => c.notes),
    createdBySalesmanId: pickText((c) => c.createdBySalesmanId),
    creditLimit:
      (Number(winner.creditLimit) || 0) > 0
        ? winner.creditLimit
        : creditSource?.creditLimit ?? winner.creditLimit,
    openingBalance: openingSource?.openingBalance ?? winner.openingBalance ?? 0,
    aliases: mergedAliases.length > 0 ? mergedAliases : undefined,
    createdAt: earliestCreated || winner.createdAt,
    updatedAt: latestUpdated,
  };

  const retiredIds = cluster
    .filter((c) => c.id !== winner.id)
    .map((c) => c.id);

  return { winner: merged, retiredIds };
}

export interface DedupeCustomersResult<T extends Customer = Customer> {
  customers: T[];
  retiredIds: string[];
  retiredToWinner: Map<string, string>;
  changed: boolean;
}

/**
 * Collapses accidental duplicate records of the SAME shop (e.g. synthetic `cust_bill_*` rows
 * created alongside a real master record or another bill-derived row) while keeping genuinely
 * distinct shops (same name + different real 10-digit phones) strictly separate.
 */
export function dedupeSameShopCustomers<T extends Customer>(list: T[]): DedupeCustomersResult<T> {
  if (!Array.isArray(list) || list.length <= 1) {
    return {
      customers: Array.isArray(list) ? list : [],
      retiredIds: [],
      retiredToWinner: new Map(),
      changed: false,
    };
  }

  // First collapse exact duplicate IDs if any slipped in
  const seenIds = new Map<string, T>();
  const uniqueById: T[] = [];
  for (const c of list) {
    if (!c) continue;
    const idKey = String(c.id || "");
    if (idKey && seenIds.has(idKey)) {
      const prev = seenIds.get(idKey)!;
      if (stampMs(c) > stampMs(prev)) {
        seenIds.set(idKey, c);
        const idx = uniqueById.indexOf(prev);
        if (idx >= 0) uniqueById[idx] = c;
      }
      continue;
    }
    if (idKey) seenIds.set(idKey, c);
    uniqueById.push(c);
  }

  const groups = new Map<string, T[]>();
  const order: Array<{ kind: "raw"; item: T } | { kind: "group"; key: string }> = [];

  for (const c of uniqueById) {
    const key = normCustomerName(c.name);
    if (!key) {
      order.push({ kind: "raw", item: c });
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, [c]);
      order.push({ kind: "group", key });
    } else {
      groups.get(key)!.push(c);
    }
  }

  const out: T[] = [];
  const retiredIds: string[] = [];
  const retiredToWinner = new Map<string, string>();
  let changed = uniqueById.length !== list.length;

  for (const slot of order) {
    if (slot.kind === "raw") {
      out.push(slot.item);
      continue;
    }
    const group = groups.get(slot.key)!;
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }

    const distinctRealPhones = new Set(
      group.map((c) => realLast10Phone(c.phone)).filter(Boolean),
    );

    if (distinctRealPhones.size <= 1) {
      const { winner, retiredIds: retired } = collapseSameShopCluster(group);
      out.push(winner);
      if (retired.length > 0) {
        changed = true;
        for (const rid of retired) {
          retiredIds.push(rid);
          retiredToWinner.set(rid, winner.id);
        }
      }
    } else {
      // Multiple genuinely different shops share this name (different real 10-digit phones).
      // Only collapse duplicates that share the EXACT SAME real phone; keep distinct phones separate.
      const phoneBuckets = new Map<string, T[]>();
      const subOrder: Array<{ kind: "raw"; item: T } | { kind: "phone"; ph: string }> = [];
      for (const c of group) {
        const ph = realLast10Phone(c.phone);
        if (!ph) {
          subOrder.push({ kind: "raw", item: c });
          continue;
        }
        if (!phoneBuckets.has(ph)) {
          phoneBuckets.set(ph, [c]);
          subOrder.push({ kind: "phone", ph });
        } else {
          phoneBuckets.get(ph)!.push(c);
        }
      }
      for (const sub of subOrder) {
        if (sub.kind === "raw") {
          out.push(sub.item);
          continue;
        }
        const bucket = phoneBuckets.get(sub.ph)!;
        if (bucket.length === 1) {
          out.push(bucket[0]);
        } else {
          const { winner, retiredIds: retired } = collapseSameShopCluster(bucket);
          out.push(winner);
          if (retired.length > 0) {
            changed = true;
            for (const rid of retired) {
              retiredIds.push(rid);
              retiredToWinner.set(rid, winner.id);
            }
          }
        }
      }
    }
  }

  return { customers: out, retiredIds, retiredToWinner, changed };
}

/**
 * Checks whether saving a customer edit would rename it onto another distinct customer's name.
 * Editing non-name fields (such as beat, phone, address, or credit limit) without changing the name
 * NEVER triggers a duplicate-name clash warning — any legacy same-shop duplicate is silently merged
 * on save by `planCustomerUpdate`.
 */
export function findCustomerNameClash(
  customers: Customer[],
  args: { customerId: string; oldName?: string; newName: string; phone?: string },
): Customer | undefined {
  const newKey = normCustomerName(args.newName);
  if (!newKey) return undefined;

  const self = customers.find((c) => c.id === args.customerId);
  const oldKey = normCustomerName(args.oldName ?? self?.name);

  // If the customer's name was NOT changed, do not nag with a "Duplicate customer name" modal
  // when the user is only assigning a beat or editing phone/address/limits.
  if (oldKey && oldKey === newKey) {
    return undefined;
  }

  const others = customers.filter(
    (c) => c.id !== args.customerId && normCustomerName(c.name) === newKey,
  );
  if (others.length === 0) return undefined;

  return others[0];
}
