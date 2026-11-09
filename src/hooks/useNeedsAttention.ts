import { useMemo } from 'react';
import { useLedger } from '../context/LedgerContext';
import { collectExpiryAlerts } from '../utils/fefo';
import { isClaimLinkedNote } from '../utils/supplierSchemes';
import { todayISO } from '../utils/dateLocal';
import type { TabId } from '../types';

/**
 * Read-only roll-up of things the owner should look at. Every count comes from data the app already holds
 * (same rules the old Home screen used); rows with a zero count are simply not returned.
 * Presentation helper only: nothing here writes to the ledger.
 */
export type AttentionTone = 'due' | 'warning' | 'info';

export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  count: number;
  /** i18n keys: title takes {{n}} */
  titleKey: string;
  subKey: string;
  tab: TabId;
  /** Optional sessionStorage hand-off the target screen already understands. */
  session?: [string, string];
}

export function useNeedsAttention(): { items: AttentionItem[]; total: number } {
  const {
    customers,
    products,
    remainingStock,
    getCustomerLedger,
    tripsWithDiscrepancy,
    inventoryBatches,
    supplierCreditNotes,
  } = useLedger();

  const overCredit = useMemo(() => {
    let n = 0;
    for (const c of customers || []) {
      const limit = Number(c.creditLimit) || 0;
      if (limit <= 0) continue;
      try {
        if (Math.max(0, getCustomerLedger(c.id).rawBalance) > limit) n += 1;
      } catch {
        /* a broken ledger row must never break the header */
      }
    }
    return n;
  }, [customers, getCustomerLedger]);

  const lowStock = useMemo(
    () => (products || []).filter((p) => remainingStock(p.id) < 5).length,
    [products, remainingStock],
  );

  const expiring = useMemo(() => {
    const alerts = collectExpiryAlerts(inventoryBatches, products, todayISO());
    return alerts.filter((a) => a.level === 'expired' || a.level === 'critical').length;
  }, [inventoryBatches, products]);

  const creditNotes = useMemo(
    () => (supplierCreditNotes || []).filter((n) => n.status !== 'settled' && !isClaimLinkedNote(n)).length,
    [supplierCreditNotes],
  );

  return useMemo(() => {
    const items: AttentionItem[] = [];
    if (overCredit > 0)
      items.push({ id: 'credit', tone: 'due', count: overCredit, titleKey: 'attn.creditLimit', subKey: 'attn.creditLimitSub', tab: 'customers' });
    const trips = typeof tripsWithDiscrepancy === 'number' ? tripsWithDiscrepancy : 0;
    if (trips > 0)
      items.push({ id: 'trips', tone: 'due', count: trips, titleKey: 'attn.trips', subKey: 'attn.tripsSub', tab: 'trips' });
    if (lowStock > 0)
      items.push({ id: 'low-stock', tone: 'warning', count: lowStock, titleKey: 'attn.lowStock', subKey: 'attn.lowStockSub', tab: 'inventory' });
    if (expiring > 0)
      items.push({ id: 'expiry', tone: 'warning', count: expiring, titleKey: 'attn.expiry', subKey: 'attn.expirySub', tab: 'inventory' });
    if (creditNotes > 0)
      items.push({
        id: 'credit-notes',
        tone: 'info',
        count: creditNotes,
        titleKey: 'attn.creditNotes',
        subKey: 'attn.creditNotesSub',
        tab: 'supplierSchemes',
        session: ['mrwater_open_supplier_cn', 'pending'],
      });
    return { items, total: items.reduce((s, i) => s + i.count, 0) };
  }, [overCredit, lowStock, expiring, creditNotes, tripsWithDiscrepancy]);
}

/** Bell action: go Home and bring the "Needs attention" block into view. */
export function scrollToNeedsAttention(): void {
  window.setTimeout(() => {
    const el = document.getElementById('needs-attention');
    if (el) el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, 60);
}
