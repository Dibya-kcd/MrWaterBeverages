/**
 * Pure server/sync merge rules for invoices (`bills`).
 *
 * Key invariants:
 * 1. Tombstoned (`deleted_bill_ids`) active bills MUST NEVER be resurrected by a stale client's
 *    full-list PUT `/api/bills` sync or outbox replay.
 * 2. Only explicitly cancelled bills (`status === "cancelled"` or `cancellation` set) are preserved
 *    or un-tombstoned for GST invoice series continuity.
 */

export const isCancelledBillRecord = (b: any): boolean =>
  b?.status === "cancelled" || Boolean(b?.cancellation);

export const incomingBillWins = (cur: any, b: any): boolean => {
  if (!cur) return true;
  const curEdits = Array.isArray(cur?.editHistory) ? cur.editHistory.length : 0;
  const newEdits = Array.isArray(b?.editHistory) ? b.editHistory.length : 0;
  if (curEdits > newEdits) return false;
  const stamp = (x: any) => Date.parse(x?.updatedAt || x?.extra?.updatedAt || "") || 0;
  if (curEdits === newEdits && stamp(cur) > stamp(b)) return false;
  return true;
};

export function collectCancelledRestores(rawBills: any[], deletedIds: Set<number>): number[] {
  const restoredIds: number[] = [];
  for (const b of rawBills || []) {
    const id = Number(b?.id);
    if (Number.isFinite(id) && deletedIds.has(id) && isCancelledBillRecord(b)) {
      deletedIds.delete(id);
      restoredIds.push(id);
    }
  }
  return restoredIds;
}

export function mergeBillLists(
  stored: any[],
  incoming: any[],
  deletedIds: Set<number>,
  accepted?: Set<any>,
): any[] {
  const byId = new Map<number, any>();
  for (const b of stored || []) {
    const id = Number(b?.id);
    if (Number.isFinite(id) && (isCancelledBillRecord(b) || !deletedIds.has(id))) {
      byId.set(id, b);
    }
  }
  for (const b of incoming || []) {
    const id = Number(b?.id);
    if (!Number.isFinite(id) || (!isCancelledBillRecord(b) && deletedIds.has(id))) continue;
    const cur = byId.get(id);
    if (cur && !incomingBillWins(cur, b)) continue;
    byId.set(id, b);
    accepted?.add(b);
  }
  return Array.from(byId.values()).sort((x, y) => Number(y.id) - Number(x.id));
}
