import type { Bill, CrateDepositKind, CrateDepositRecord, GRN, Product } from '../types';
import { money } from './billing';
import { formatBillNumber } from './invoiceCommon';

export interface CrateTimelineEvent {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  deltaLabel: string;
  tone: 'paid' | 'due' | 'primary';
  record?: CrateDepositRecord;
}

const KIND_LABELS: Record<CrateDepositKind, string> = {
  empties_returned: 'Empties returned',
  empties_issued: 'Empties / crates issued',
  deposit_collected: 'Deposit collected',
  deposit_refunded: 'Deposit refunded',
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDateLabel(iso?: string | null): string {
  if (!iso) return '—';
  const clean = String(iso).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const mIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (isNaN(day) || mIdx < 0 || mIdx > 11) return clean;
  return `${day} ${SHORT_MONTHS[mIdx]}`;
}

export function formatCompactInr(amount: number): string {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000) {
    const lakhs = abs / 100000;
    const str = Number.isInteger(lakhs) ? String(lakhs) : lakhs.toFixed(1).replace(/\.0$/, '');
    return `${sign}₹${str}L`;
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    const str = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, '');
    return `${sign}₹${str}k`;
  }
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

function fmtAmount(n: number): string {
  const val = Number(n) || 0;
  return Number.isInteger(val) ? val.toLocaleString('en-IN') : money(val);
}

export function buildCrateTimeline(params: {
  partyType: 'customer' | 'supplier';
  partyName: string;
  records: CrateDepositRecord[];
  bills: Bill[];
  grns: GRN[];
  products: Product[];
}): CrateTimelineEvent[] {
  const { partyType, partyName, records, bills, grns, products } = params;
  const target = partyName.trim().toLowerCase();
  if (!target) return [];

  const events: (CrateTimelineEvent & { orderScore: number })[] = [];

  for (let i = 0; i < (records || []).length; i++) {
    const r = records[i];
    if (r.partyType !== partyType || r.partyName.trim().toLowerCase() !== target) continue;
    const d = String(r.date || '').slice(0, 10);
    const meta = [shortDateLabel(d), r.productName || '', r.note || ''].filter(Boolean).join(' · ');
    let deltaLabel = '';
    let tone: CrateTimelineEvent['tone'] = 'primary';

    if (r.kind === 'empties_returned') {
      deltaLabel = `-${Number(r.units) || 0} cs`;
      tone = 'paid';
    } else if (r.kind === 'empties_issued') {
      deltaLabel = `+${Number(r.units) || 0} cs`;
      tone = 'due';
    } else if (r.kind === 'deposit_collected') {
      deltaLabel = `+₹${fmtAmount(Number(r.amount) || 0)}`;
      tone = 'primary';
    } else if (r.kind === 'deposit_refunded') {
      deltaLabel = `-₹${fmtAmount(Number(r.amount) || 0)}`;
      tone = 'due';
    }

    const ts = r.createdAt ? Date.parse(r.createdAt) || 0 : 0;
    events.push({
      id: `rec_${r.id}`,
      date: d,
      title: KIND_LABELS[r.kind] || r.kind,
      subtitle: meta,
      deltaLabel,
      tone,
      record: r,
      orderScore: ts > 0 ? ts : 1_000_000 - i,
    });
  }

  if (partyType === 'customer') {
    for (const b of bills || []) {
      if (b.status === 'cancelled' || b.cancelled) continue;
      if ((b.retailer || '').trim().toLowerCase() !== target) continue;
      const d = String(b.date || '').slice(0, 10);
      const inv = formatBillNumber(b);
      let soldQty = 0;
      for (const it of b.items || []) {
        const prod = products.find((p) => p.id === it.productId);
        if (!prod?.returnable) continue;
        soldQty += Number(it.qty) || 0;
      }
      if (soldQty > 0) {
        events.push({
          id: `bill_${b.id}`,
          date: d,
          title: `Sold with sale ${inv}`,
          subtitle: `${shortDateLabel(d)} · automatic`,
          deltaLabel: `+${soldQty} cs`,
          tone: 'due',
          orderScore: 100 + (Number(b.id) || 0),
        });
      }
      for (let idx = 0; idx < (b.returns || []).length; idx++) {
        const ret = b.returns![idx];
        let backQty = 0;
        for (const line of ret.lines || []) {
          const prod = products.find((p) => p.id === line.productId);
          if (!prod?.returnable) continue;
          backQty += (Number(line.restockQty) || 0) + (Number(line.scrapQty) || 0);
        }
        if (backQty > 0) {
          const rd = String(ret.date || d).slice(0, 10);
          events.push({
            id: `ret_${b.id}_${idx}`,
            date: rd,
            title: `Return from sale ${inv}`,
            subtitle: `${shortDateLabel(rd)} · automatic`,
            deltaLabel: `-${backQty} cs`,
            tone: 'paid',
            orderScore: 200 + (Number(b.id) || 0),
          });
        }
      }
    }
  } else {
    for (const g of grns || []) {
      if ((g.supplierName || '').trim().toLowerCase() !== target) continue;
      const d = String((g as any).date || (g as any).invoiceDate || '').slice(0, 10);
      let qty = 0;
      for (const line of ((g as any).items || (g as any).lines || []) as any[]) {
        const pid = line.productId;
        const prod = pid
          ? products.find((p) => p.id === pid)
          : products.find(
              (p) => p.name.trim().toLowerCase() === (line.productName || '').trim().toLowerCase(),
            );
        if (!prod?.returnable) continue;
        qty += Number(line.totalReceivedQty) || Number(line.qty) + Number(line.freeQty) || Number(line.qty) || 0;
      }
      if (qty > 0) {
        const label = (g as any).grnNumber || (g as any).invoiceNumber || `GRN-${g.id}`;
        events.push({
          id: `grn_${g.id}`,
          date: d,
          title: `Purchase via ${label}`,
          subtitle: `${shortDateLabel(d)} · automatic`,
          deltaLabel: `+${qty} cs`,
          tone: 'due',
          orderScore: 100 + (Number(g.id) || 0),
        });
      }
    }
  }

  return events
    .sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return b.orderScore - a.orderScore;
    })
    .map(({ orderScore: _score, ...rest }) => rest);
}
