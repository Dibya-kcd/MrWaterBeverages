/**
 * Pure calculations behind
 *   - "Beat-wise sales & due"  (Reports and Payments)
 *   - "Customer receipts, day-wise, with due remaining"  (Payments)
 *
 * No React in here, so the numbers can be unit-tested.
 *
 * Definitions (kept identical to the rest of the app so totals agree):
 *   Sales        = invoice total minus sales returns, cancelled invoices left out, by invoice date.
 *   Received     = receipts by receipt date. An invoice that says "paid" but has no receipt row behind it
 *                  (older data) counts on its invoice date, exactly like the Daily collection report.
 *                  Advance adjustments (moving old advance onto an invoice) and refunds are not new money.
 *   Due remaining = the customer's ledger balance TODAY (opening balance + billed - paid), the same figure
 *                  the Customers screen shows. It does not depend on the period picked.
 *   Overdue       = part of the due that sits on invoices older than 15 days.
 */
import type { Bill, Customer, ExistingCustomer, PaymentRecord } from '../types';
import { beatOfCustomer, type BeatLike } from './beats';
import { billBalance, billNetTotal, round2 } from './salesReturns';
import { isAdvanceAdjustmentRow, isAdvanceRow } from './paymentAllocation';
import { formatBillNumber } from './invoiceCommon';
import { normCustomerName, realLast10Phone } from './customerDedupe';

export const NO_BEAT = 'none';
export const NO_BEAT_LABEL = 'No beat yet';
export const OVERDUE_AFTER_DAYS = 15;

const norm = (n?: string | null): string => normCustomerName(n);
const last10 = (p?: string | null): string => realLast10Phone(p);
const day10 = (d?: string | null): string => String(d || '').slice(0, 10);

const isLive = (b: Bill): boolean => b.status !== 'cancelled' && !b.cancelled && !b.cancellation;

/** PAY-0842 style number shown on receipts. `index` only matters for ids with no usable digits. */
export function formatPaymentId(id: string, index = 0): string {
  if (!id) return `PAY-${String(842 - index).padStart(4, '0')}`;
  if (id.startsWith('PAY-')) return id;
  if (id.startsWith('pay_bill_')) {
    const num = id.replace('pay_bill_', '');
    return `PAY-${num.padStart(4, '0')}`;
  }
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 4) return `PAY-${digits.slice(-4)}`;
  return `PAY-${String(842 - index).padStart(4, '0')}`;
}

export const invoiceNo = (idOrBill: number | string | Bill): string => {
  if (typeof idOrBill === 'object' && idOrBill !== null) {
    if (idOrBill.docNo && idOrBill.docNo.trim()) return idOrBill.docNo.trim();
    if (idOrBill.docSeries === 'non_gst' || idOrBill.gstExclude === true) return `NG-${idOrBill.id}`;
    return formatBillNumber(idOrBill, 'INV');
  }
  return `INV-${String(idOrBill).padStart(4, '0')}`;
};

/* ------------------------------------------------------------------ */
/* Who belongs to which beat                                           */
/* ------------------------------------------------------------------ */

export interface BeatResolver {
  customerFor: (name?: string, phone?: string, id?: string) => Customer | undefined;
  /** Beat id for a customer / invoice / receipt, or NO_BEAT. */
  beatIdFor: (name?: string, phone?: string, id?: string) => string;
}

export function makeBeatResolver(customers: Customer[], beats: BeatLike[]): BeatResolver {
  const byId = new Map<string, Customer>();
  const byName = new Map<string, Customer[]>();
  const isPrimaryMatch = (c: Customer, k: string) => norm(c.name) === k;
  const pickCanonical = (list: Customer[], k?: string): Customer => {
    if (list.length === 1) return list[0];
    return [...list].sort((a, b) => {
      const aSynth = String(a.id || '').startsWith('cust_bill_') ? 1 : 0;
      const bSynth = String(b.id || '').startsWith('cust_bill_') ? 1 : 0;
      if (aSynth !== bSynth) return aSynth - bSynth;
      const aBeat = beatOfCustomer(a, beats) ? 1 : 0;
      const bBeat = beatOfCustomer(b, beats) ? 1 : 0;
      if (aBeat !== bBeat) return bBeat - aBeat;
      if (k) {
        const aPrim = isPrimaryMatch(a, k) ? 1 : 0;
        const bPrim = isPrimaryMatch(b, k) ? 1 : 0;
        if (aPrim !== bPrim) return bPrim - aPrim;
      }
      const aPhone = last10(a.phone) ? 1 : 0;
      const bPhone = last10(b.phone) ? 1 : 0;
      return bPhone - aPhone;
    })[0];
  };

  for (const c of customers || []) {
    byId.set(c.id, c);
    const k = norm(c.name);
    if (k) {
      const list = byName.get(k);
      if (list) list.push(c);
      else byName.set(k, [c]);
    }
    for (const a of c.aliases || []) {
      const ak = norm(a);
      if (ak) {
        const list = byName.get(ak);
        if (list) list.push(c);
        else byName.set(ak, [c]);
      }
    }
  }
  const beatIdOf = (c?: Customer): string => (c ? beatOfCustomer(c, beats)?.id || NO_BEAT : NO_BEAT);

  const customerFor: BeatResolver['customerFor'] = (name, phone, id) => {
    if (id) {
      const hit = byId.get(id);
      if (hit) return hit;
    }
    const nk = norm(name);
    const list = byName.get(nk) || [];
    if (list.length === 1) return list[0];
    const ph = last10(phone);
    if (list.length > 1) {
      if (ph.length === 10) {
        const m = list.filter((c) => last10(c.phone) === ph || last10(c.altPhone) === ph);
        if (m.length === 1) return m[0];
        if (m.length > 1) {
          const mPhones = new Set(m.map((c) => last10(c.phone)).filter(Boolean));
          if (mPhones.size <= 1) return pickCanonical(m, nk);
        }
      }
      // If all records in `list` represent copies of the same shop (at most 1 distinct real phone),
      // return the canonical master copy even when phone is missing or dummy.
      const distinctPhones = new Set(list.map((c) => last10(c.phone)).filter(Boolean));
      if (distinctPhones.size <= 1) return pickCanonical(list, nk);
    }
    if (list.length === 0 && ph.length === 10) {
      const m = (customers || []).filter((c) => last10(c.phone) === ph || last10(c.altPhone) === ph);
      if (m.length === 1) return m[0];
      if (m.length > 1) {
        const names = new Set(m.map((c) => norm(c.name)).filter(Boolean));
        if (names.size <= 1) return pickCanonical(m);
      }
    }
    return undefined;
  };

  const beatIdFor: BeatResolver['beatIdFor'] = (name, phone, id) => {
    const c = customerFor(name, phone, id);
    if (c) {
      const b = beatIdOf(c);
      if (b !== NO_BEAT) return b;
    }
    // If the matched copy has no beat (e.g. a legacy bill-derived duplicate) or several copies share this name,
    // check compatible same-name records (not conflicting on a real 10-digit phone) for an unambiguous assigned beat.
    const list = byName.get(norm(name || c?.name)) || [];
    if (list.length > 0) {
      const ph = last10(phone || c?.phone);
      const compatible =
        ph.length === 10
          ? list.filter((x) => {
              const xp = last10(x.phone);
              const xa = last10(x.altPhone);
              return (!xp && !xa) || xp === ph || xa === ph;
            })
          : list;
      const assigned = new Set(compatible.map(beatIdOf).filter((b) => b !== NO_BEAT));
      if (assigned.size === 1) return Array.from(assigned)[0];
    }
    return NO_BEAT;
  };

  return { customerFor, beatIdFor };
}

interface CanonicalCustomerRef {
  key: string;
  name: string;
  customer?: Customer;
}

function makeCustomerGrouper(customers: Customer[], resolver: BeatResolver) {
  const phonesByName = new Map<string, Set<string>>();
  for (const c of customers || []) {
    const k = norm(c.name);
    const p = last10(c.phone);
    if (k && p) {
      let s = phonesByName.get(k);
      if (!s) {
        s = new Set<string>();
        phonesByName.set(k, s);
      }
      s.add(p);
    }
  }
  const ambiguousNames = new Set<string>();
  phonesByName.forEach((s, k) => {
    if (s.size > 1) ambiguousNames.add(k);
  });

  const resolve = (name?: string, phone?: string, id?: string, fallbackName = 'Customer'): CanonicalCustomerRef => {
    const c = resolver.customerFor(name, phone, id);
    if (c) {
      const kn = norm(c.name);
      const key = ambiguousNames.has(kn) ? `id:${c.id}` : `name:${kn || c.id}`;
      return { key, name: c.name || name || fallbackName, customer: c };
    }
    const cleanName = (name || '').trim() || fallbackName;
    const kn = norm(cleanName);
    const ph = last10(phone);
    const key = ambiguousNames.has(kn) && ph ? `name:${kn}#${ph}` : `name:${kn || id || cleanName.toLowerCase()}`;
    return { key, name: cleanName };
  };

  return { resolve, ambiguousNames };
}

/* ------------------------------------------------------------------ */
/* Invoice balances                                                    */
/* ------------------------------------------------------------------ */

/** Amount still owed per invoice, counting both what the invoice says was paid and the linked receipts (the larger wins). */
export function effectiveBillBalances(bills: Bill[], payments: PaymentRecord[]): Map<number, number> {
  const linked = new Map<number, number>();
  for (const p of payments || []) {
    if (!p.billId) continue;
    linked.set(p.billId, (linked.get(p.billId) || 0) + (Number(p.amount) || 0));
  }
  const out = new Map<number, number>();
  for (const b of bills || []) {
    const paid = Math.max(Number(b.amountPaid) || 0, linked.get(b.id) || 0);
    out.set(b.id, billBalance({ ...b, amountPaid: paid }));
  }
  return out;
}

/** Customer ledger balance today, keyed by canonical customer key (and id when present). */
function buildDueLookup(
  existing: ExistingCustomer[],
  grouper: ReturnType<typeof makeCustomerGrouper>,
): { byKey: Map<string, { due: number; advance: number }>; byId: Map<string, { due: number; advance: number }> } {
  const byKey = new Map<string, { due: number; advance: number }>();
  const byId = new Map<string, { due: number; advance: number }>();
  for (const e of existing || []) {
    const val = { due: Number(e.balanceDue) || 0, advance: Number(e.advance) || 0 };
    if (e.id) byId.set(e.id, val);
    const ref = grouper.resolve(e.name, e.phone, e.id);
    if (!byKey.has(ref.key)) byKey.set(ref.key, val);
    const rawKey = `name:${norm(e.name)}`;
    if (!grouper.ambiguousNames.has(norm(e.name)) && !byKey.has(rawKey)) byKey.set(rawKey, val);
  }
  return { byKey, byId };
}

/* ------------------------------------------------------------------ */
/* Money received                                                      */
/* ------------------------------------------------------------------ */

export interface ReceiptEvent {
  key: string;
  date: string; // YYYY-MM-DD
  customerName: string;
  customerPhone?: string;
  customerId?: string;
  beatId: string;
  amount: number;
  mode: string;
  billId?: number;
  receiptNo: string;
  /** receipt = against an invoice, advance = on account, invoice = paid at billing with no receipt row */
  kind: 'receipt' | 'advance' | 'invoice';
  note: string;
  paymentId?: string;
}

export function collectReceipts(args: {
  bills: Bill[];
  payments: PaymentRecord[];
  resolver: BeatResolver;
}): ReceiptEvent[] {
  const { bills, payments, resolver } = args;
  const live = (bills || []).filter(isLive);
  const billById = new Map(live.map((b) => [b.id, b]));
  const out: ReceiptEvent[] = [];
  const billsWithRows = new Set<number>();

  (payments || []).forEach((p, idx) => {
    const amt = Number(p.amount) || 0;
    if (amt > 0 && p.billId && !p.isRefund) billsWithRows.add(p.billId);
    if (amt <= 0 || p.isRefund || p.mode === 'credit' || isAdvanceAdjustmentRow(p)) return;
    const date = day10(p.paymentDate || p.createdAt);
    if (!date) return;
    const bill = p.billId ? billById.get(p.billId) : undefined;
    // Canonicalize customer from the live bill first (if linked), then master customer,
    // so renamed or reassigned bills never spawn phantom customer names from stale payment rows.
    const resolvedCust = bill
      ? resolver.customerFor(bill.retailer, bill.phone, bill.customerId || p.customerId)
      : resolver.customerFor(p.customerName, p.customerPhone, p.customerId);
    const beatId = bill
      ? resolver.beatIdFor(bill.retailer, bill.phone, bill.customerId || p.customerId)
      : resolver.beatIdFor(p.customerName, p.customerPhone, p.customerId);
    const customerName = bill
      ? resolvedCust?.name || bill.retailer || p.customerName || 'Customer'
      : resolvedCust?.name || p.customerName || 'Customer';
    out.push({
      key: `p${p.id || idx}`,
      date,
      customerName,
      customerPhone: resolvedCust?.phone || bill?.phone || p.customerPhone,
      customerId: resolvedCust?.id || bill?.customerId || p.customerId,
      beatId,
      amount: round2(amt),
      mode: p.mode || 'cash',
      billId: p.billId,
      receiptNo: formatPaymentId(p.id, idx),
      kind: isAdvanceRow(p) ? 'advance' : 'receipt',
      note: p.referenceNote || '',
      paymentId: p.id,
    });
  });

  // Invoices marked paid at billing that have no receipt row (older data)
  for (const b of live) {
    if (billsWithRows.has(b.id)) continue;
    const paid = Math.min(billNetTotal(b), Number(b.amountPaid) || 0);
    const mode = b.paymentMode || 'cash';
    const date = day10(b.date);
    if (paid <= 0 || mode === 'credit' || !date) continue;
    const resolvedCust = resolver.customerFor(b.retailer, b.phone, b.customerId);
    out.push({
      key: `b${b.id}`,
      date,
      customerName: resolvedCust?.name || b.retailer || 'Cash Sale',
      customerPhone: resolvedCust?.phone || b.phone,
      customerId: resolvedCust?.id || b.customerId,
      beatId: resolver.beatIdFor(b.retailer, b.phone, b.customerId),
      amount: round2(paid),
      mode,
      billId: b.id,
      receiptNo: invoiceNo(b),
      kind: 'invoice',
      note: 'Paid at billing',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Customer receipts, day-wise, with due remaining                     */
/* ------------------------------------------------------------------ */

export interface ReceiptRow extends ReceiptEvent {
  beatName: string;
  invoiceLabel: string;
  /** What is still unpaid on that invoice (0 when settled or no invoice). */
  invoiceDue: number;
  /** Customer's total due today. */
  customerDue: number;
  customerAdvance: number;
}

export interface ReceiptDay {
  date: string;
  rows: ReceiptRow[];
  total: number;
  cash: number;
  other: number;
}

export interface CustomerReceiptSummary {
  key: string;
  name: string;
  phone?: string;
  beatId: string;
  beatName: string;
  receipts: number;
  received: number;
  lastReceiptDate: string;
  due: number;
  advance: number;
}

export interface ReceiptRegister {
  days: ReceiptDay[];
  rows: ReceiptRow[];
  customers: CustomerReceiptSummary[];
  total: number;
  cash: number;
  other: number;
  count: number;
  /** Total due remaining of the customers listed in `customers`. */
  dueRemaining: number;
}

export function buildReceiptRegister(args: {
  bills: Bill[];
  payments: PaymentRecord[];
  customers: Customer[];
  existingCustomers: ExistingCustomer[];
  beats: BeatLike[];
  inPeriod: (date: string) => boolean;
  /** 'all' (default), a beat id, or NO_BEAT. */
  beatFilter?: string;
  /** Lower-case text matched against customer name, receipt number and reference. */
  search?: string;
  /** Customer-wise list also shows customers who owe money but paid nothing in the period. */
  includeUnpaid?: boolean;
}): ReceiptRegister {
  const { bills, payments, customers, existingCustomers, beats, inPeriod } = args;
  const beatFilter = args.beatFilter || 'all';
  const q = (args.search || '').trim().toLowerCase();
  const resolver = makeBeatResolver(customers, beats);
  const grouper = makeCustomerGrouper(customers, resolver);
  const beatName = (id: string) => (id === NO_BEAT ? NO_BEAT_LABEL : beats.find((b) => b.id === id)?.name || NO_BEAT_LABEL);
  const dues = buildDueLookup(existingCustomers, grouper);
  const balances = effectiveBillBalances(bills, payments);
  const billById = new Map((bills || []).map((b) => [b.id, b]));

  const events = collectReceipts({ bills, payments, resolver })
    .filter((e) => inPeriod(e.date))
    .filter((e) => beatFilter === 'all' || e.beatId === beatFilter)
    .filter(
      (e) =>
        !q ||
        e.customerName.toLowerCase().includes(q) ||
        e.receiptNo.toLowerCase().includes(q) ||
        e.note.toLowerCase().includes(q),
    );

  const rows: ReceiptRow[] = events.map((e) => {
    const ref = grouper.resolve(e.customerName, e.customerPhone, e.customerId);
    const d = (e.customerId && dues.byId.get(e.customerId)) || dues.byKey.get(ref.key);
    const bill = e.billId ? billById.get(e.billId) : undefined;
    return {
      ...e,
      beatName: beatName(e.beatId),
      invoiceLabel: bill ? invoiceNo(bill) : e.billId ? invoiceNo(e.billId) : '',
      invoiceDue: bill && isLive(bill) ? round2(balances.get(bill.id) || 0) : 0,
      customerDue: d?.due || 0,
      customerAdvance: d?.advance || 0,
    };
  });

  // newest day first; inside a day, biggest first
  const dayMap = new Map<string, ReceiptDay>();
  for (const r of rows) {
    let g = dayMap.get(r.date);
    if (!g) {
      g = { date: r.date, rows: [], total: 0, cash: 0, other: 0 };
      dayMap.set(r.date, g);
    }
    g.rows.push(r);
    g.total = round2(g.total + r.amount);
    if (r.mode === 'cash') g.cash = round2(g.cash + r.amount);
    else g.other = round2(g.other + r.amount);
  }
  const days = Array.from(dayMap.values())
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.date.localeCompare(a.date));

  // customer-wise
  const custMap = new Map<string, CustomerReceiptSummary>();
  for (const r of rows) {
    const ref = grouper.resolve(r.customerName, r.customerPhone, r.customerId);
    let c = custMap.get(ref.key);
    if (!c) {
      const d = (r.customerId && dues.byId.get(r.customerId)) || dues.byKey.get(ref.key);
      c = {
        key: ref.key,
        name: ref.name,
        phone: r.customerPhone || ref.customer?.phone,
        beatId: r.beatId,
        beatName: r.beatName,
        receipts: 0,
        received: 0,
        lastReceiptDate: '',
        due: d?.due || 0,
        advance: d?.advance || 0,
      };
      custMap.set(ref.key, c);
    }
    c.receipts += 1;
    c.received = round2(c.received + r.amount);
    if (r.date > c.lastReceiptDate) c.lastReceiptDate = r.date;
  }
  if (args.includeUnpaid) {
    for (const e of existingCustomers || []) {
      if (!((Number(e.balanceDue) || 0) > 0.004)) continue;
      const ref = grouper.resolve(e.name, e.phone, e.id);
      if (custMap.has(ref.key)) continue;
      const beatId = resolver.beatIdFor(e.name, e.phone, e.id);
      if (beatFilter !== 'all' && beatId !== beatFilter) continue;
      if (q && !e.name.toLowerCase().includes(q) && !ref.name.toLowerCase().includes(q)) continue;
      custMap.set(ref.key, {
        key: ref.key,
        name: ref.name,
        phone: e.phone || ref.customer?.phone,
        beatId,
        beatName: beatName(beatId),
        receipts: 0,
        received: 0,
        lastReceiptDate: '',
        due: Number(e.balanceDue) || 0,
        advance: Number(e.advance) || 0,
      });
    }
  }
  const customerList = Array.from(custMap.values()).sort(
    (a, b) => b.due - a.due || b.received - a.received || a.name.localeCompare(b.name),
  );

  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  const cash = round2(rows.filter((r) => r.mode === 'cash').reduce((s, r) => s + r.amount, 0));
  return {
    days,
    rows,
    customers: customerList,
    total,
    cash,
    other: round2(total - cash),
    count: rows.length,
    dueRemaining: round2(customerList.reduce((s, c) => s + c.due, 0)),
  };
}

/* ------------------------------------------------------------------ */
/* Beat-wise sales, received and due                                   */
/* ------------------------------------------------------------------ */

export interface BeatCustomerRow {
  key: string;
  name: string;
  bills: number;
  sales: number;
  received: number;
  due: number;
  advance: number;
}

export interface BeatSummaryRow {
  beatId: string;
  beatName: string;
  active: boolean;
  customers: number;
  bills: number;
  sales: number;
  received: number;
  due: number;
  overdue: number;
  advance: number;
  customerRows: BeatCustomerRow[];
}

export interface BeatSummary {
  rows: BeatSummaryRow[];
  totals: { customers: number; bills: number; sales: number; received: number; due: number; overdue: number; advance: number };
}

const daysBetween = (fromIso: string, toIso: string): number => {
  const a = Date.parse(`${fromIso}T12:00:00Z`);
  const b = Date.parse(`${toIso}T12:00:00Z`);
  return isNaN(a) || isNaN(b) ? 0 : Math.round((b - a) / 86400000);
};

export function buildBeatSummary(args: {
  bills: Bill[];
  payments: PaymentRecord[];
  customers: Customer[];
  existingCustomers: ExistingCustomer[];
  beats: BeatLike[];
  inPeriod: (date: string) => boolean;
  /** Today as YYYY-MM-DD (passed in so tests are stable). */
  today: string;
}): BeatSummary {
  const { bills, payments, customers, existingCustomers, beats, inPeriod, today } = args;
  const resolver = makeBeatResolver(customers, beats);
  const grouper = makeCustomerGrouper(customers, resolver);
  const rowMap = new Map<string, BeatSummaryRow>();
  const custMaps = new Map<string, Map<string, BeatCustomerRow>>();

  const ensure = (id: string): BeatSummaryRow => {
    let r = rowMap.get(id);
    if (!r) {
      const b = id === NO_BEAT ? undefined : beats.find((x) => x.id === id);
      r = {
        beatId: id,
        beatName: id === NO_BEAT ? NO_BEAT_LABEL : b?.name || NO_BEAT_LABEL,
        active: id === NO_BEAT ? true : b?.active !== false,
        customers: 0, bills: 0, sales: 0, received: 0, due: 0, overdue: 0, advance: 0,
        customerRows: [],
      };
      rowMap.set(id, r);
      custMaps.set(id, new Map());
    }
    return r;
  };
  const cust = (beatId: string, key: string, name: string): BeatCustomerRow => {
    ensure(beatId);
    const m = custMaps.get(beatId)!;
    let c = m.get(key);
    if (!c) {
      c = { key, name, bills: 0, sales: 0, received: 0, due: 0, advance: 0 };
      m.set(key, c);
    }
    return c;
  };

  for (const b of beats) ensure(b.id);

  // Due remaining: the customer ledger, customer by customer
  for (const e of existingCustomers || []) {
    const ref = grouper.resolve(e.name, e.phone, e.id);
    const beatId = resolver.beatIdFor(ref.name, e.phone || ref.customer?.phone, e.id || ref.customer?.id);
    const r = ensure(beatId);
    const due = Number(e.balanceDue) || 0;
    const adv = Number(e.advance) || 0;
    r.due = round2(r.due + due);
    r.advance = round2(r.advance + adv);
    const c = cust(beatId, ref.key, ref.name);
    c.due = round2(c.due + due);
    c.advance = round2(c.advance + adv);
  }

  // Ensure every registered customer copy (including same-name distinct-phone shops omitted
  // from existingCustomers) is represented in its beat.
  for (const c of customers || []) {
    const ref = grouper.resolve(c.name, c.phone, c.id);
    const target = ref.customer || c;
    const beatId = resolver.beatIdFor(target.name, target.phone, target.id);
    cust(beatId, ref.key, ref.name);
  }

  const balances = effectiveBillBalances(bills, payments);
  const overdueByBeat = new Map<string, number>();
  for (const b of bills || []) {
    if (!isLive(b)) continue;
    const ref = grouper.resolve(b.retailer, b.phone, b.customerId, 'Cash Sale');
    const beatId = resolver.beatIdFor(b.retailer, b.phone, b.customerId);
    const d = day10(b.date);
    if (d && inPeriod(d)) {
      const r = ensure(beatId);
      const net = billNetTotal(b);
      r.bills += 1;
      r.sales = round2(r.sales + net);
      const c = cust(beatId, ref.key, ref.name);
      c.bills += 1;
      c.sales = round2(c.sales + net);
    }
    const bal = balances.get(b.id) || 0;
    if (bal > 0.004 && d && daysBetween(d, today) > OVERDUE_AFTER_DAYS) {
      overdueByBeat.set(beatId, round2((overdueByBeat.get(beatId) || 0) + bal));
    }
  }

  for (const e of collectReceipts({ bills, payments, resolver })) {
    if (!inPeriod(e.date)) continue;
    const ref = grouper.resolve(e.customerName, e.customerPhone, e.customerId);
    const r = ensure(e.beatId);
    r.received = round2(r.received + e.amount);
    cust(e.beatId, ref.key, ref.name).received += e.amount;
  }

  const rows: BeatSummaryRow[] = [];
  for (const [id, r] of rowMap) {
    r.overdue = Math.min(overdueByBeat.get(id) || 0, r.due); // never more than what is owed
    r.customerRows = Array.from(custMaps.get(id)!.values())
      .map((c) => ({ ...c, received: round2(c.received) }))
      .sort((a, b) => b.due - a.due || b.sales - a.sales || b.received - a.received || b.advance - a.advance || a.name.localeCompare(b.name));
    r.customers = r.customerRows.length;
    const hasData = r.customers > 0 || r.bills > 0 || r.received > 0 || r.due > 0 || r.advance > 0;
    if (id === NO_BEAT ? hasData : r.active || hasData) rows.push(r);
  }
  const order = new Map(beats.map((b, i) => [b.id, i]));
  rows.sort((a, b) => {
    if (a.beatId === NO_BEAT) return 1;
    if (b.beatId === NO_BEAT) return -1;
    return (order.get(a.beatId) ?? 999) - (order.get(b.beatId) ?? 999);
  });

  const sum = (f: (r: BeatSummaryRow) => number) => round2(rows.reduce((s, r) => s + f(r), 0));
  return {
    rows,
    totals: {
      customers: rows.reduce((s, r) => s + r.customers, 0),
      bills: rows.reduce((s, r) => s + r.bills, 0),
      sales: sum((r) => r.sales),
      received: sum((r) => r.received),
      due: sum((r) => r.due),
      overdue: sum((r) => r.overdue),
      advance: sum((r) => r.advance),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Day-wise sales, collection and status                               */
/* ------------------------------------------------------------------ */

export interface DaySummaryRow {
  date: string;
  bills: number;
  sales: number;
  receipts: number;
  received: number;
  cash: number;
  other: number;
  /** Sales minus money received that day. Positive: customers owe more at day end. Negative: old dues were recovered. */
  dueChange: number;
  status: 'up' | 'down' | 'even';
  receiptRows: ReceiptRow[];
}

export interface DaySummary {
  days: DaySummaryRow[];
  totals: { bills: number; sales: number; receipts: number; received: number; cash: number; other: number; dueChange: number };
}

export function buildDaySummary(args: {
  bills: Bill[];
  payments: PaymentRecord[];
  customers: Customer[];
  existingCustomers: ExistingCustomer[];
  beats: BeatLike[];
  inPeriod: (date: string) => boolean;
  beatFilter?: string;
}): DaySummary {
  const { bills, payments, customers, existingCustomers, beats, inPeriod } = args;
  const beatFilter = args.beatFilter || 'all';
  const resolver = makeBeatResolver(customers, beats);
  const map = new Map<string, DaySummaryRow>();
  const day = (d: string): DaySummaryRow => {
    let g = map.get(d);
    if (!g) {
      g = { date: d, bills: 0, sales: 0, receipts: 0, received: 0, cash: 0, other: 0, dueChange: 0, status: 'even', receiptRows: [] };
      map.set(d, g);
    }
    return g;
  };

  for (const b of bills || []) {
    if (!isLive(b)) continue;
    const d = day10(b.date);
    if (!d || !inPeriod(d)) continue;
    if (beatFilter !== 'all' && resolver.beatIdFor(b.retailer, b.phone, b.customerId) !== beatFilter) continue;
    const g = day(d);
    g.bills += 1;
    g.sales = round2(g.sales + billNetTotal(b));
  }

  const reg = buildReceiptRegister({ bills, payments, customers, existingCustomers, beats, inPeriod, beatFilter });
  for (const rd of reg.days) {
    const g = day(rd.date);
    g.receipts = rd.rows.length;
    g.received = rd.total;
    g.cash = rd.cash;
    g.other = rd.other;
    g.receiptRows = rd.rows;
  }

  const days = Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  for (const g of days) {
    g.dueChange = round2(g.sales - g.received);
    g.status = g.dueChange > 0.004 ? 'up' : g.dueChange < -0.004 ? 'down' : 'even';
  }
  const sum = (f: (r: DaySummaryRow) => number) => round2(days.reduce((s, r) => s + f(r), 0));
  return {
    days,
    totals: {
      bills: days.reduce((s, r) => s + r.bills, 0),
      sales: sum((r) => r.sales),
      receipts: days.reduce((s, r) => s + r.receipts, 0),
      received: sum((r) => r.received),
      cash: sum((r) => r.cash),
      other: sum((r) => r.other),
      dueChange: sum((r) => r.dueChange),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Customer-wise overall billed, paid and due                          */
/* ------------------------------------------------------------------ */

export interface CustomerOverallRow {
  key: string;
  name: string;
  phone: string;
  beatId: string;
  beatName: string;
  bills: number;
  billed: number;
  paid: number;
  due: number;
  advance: number;
  lastReceiptDate: string;
}

export interface CustomerOverall {
  rows: CustomerOverallRow[];
  totals: { customers: number; billed: number; paid: number; due: number; advance: number };
}

/** Whole-life figures per customer (not limited to a period): the same ledger the Customers screen shows. */
export function buildCustomerOverall(args: {
  bills: Bill[];
  payments: PaymentRecord[];
  customers: Customer[];
  existingCustomers: ExistingCustomer[];
  beats: BeatLike[];
  beatFilter?: string;
  search?: string;
  onlyDue?: boolean;
}): CustomerOverall {
  const { bills, payments, customers, existingCustomers, beats } = args;
  const beatFilter = args.beatFilter || 'all';
  const q = (args.search || '').trim().toLowerCase();
  const resolver = makeBeatResolver(customers, beats);
  const grouper = makeCustomerGrouper(customers, resolver);
  const beatName = (id: string) => (id === NO_BEAT ? NO_BEAT_LABEL : beats.find((b) => b.id === id)?.name || NO_BEAT_LABEL);

  const lastReceipt = new Map<string, string>();
  for (const e of collectReceipts({ bills, payments, resolver })) {
    const ref = grouper.resolve(e.customerName, e.customerPhone, e.customerId);
    if (e.date > (lastReceipt.get(ref.key) || '')) lastReceipt.set(ref.key, e.date);
  }

  const rows: CustomerOverallRow[] = [];
  for (const e of existingCustomers || []) {
    const ref = grouper.resolve(e.name, e.phone, e.id);
    const beatId = resolver.beatIdFor(e.name, e.phone, e.id);
    if (beatFilter !== 'all' && beatId !== beatFilter) continue;
    if (q && !e.name.toLowerCase().includes(q) && !String(e.phone || '').includes(q)) continue;
    const due = round2(Number(e.balanceDue) || 0);
    const advance = round2(Number(e.advance) || 0);
    if (args.onlyDue && due <= 0.004) continue;
    rows.push({
      key: e.id || ref.key,
      name: e.name,
      phone: e.phone || '',
      beatId,
      beatName: beatName(beatId),
      bills: Number(e.totalBills) || 0,
      billed: round2(Number(e.totalBilled) || 0),
      paid: round2(Number(e.totalPaid) || 0),
      due,
      advance,
      lastReceiptDate: lastReceipt.get(ref.key) || '',
    });
  }
  rows.sort((a, b) => b.due - a.due || b.billed - a.billed || a.name.localeCompare(b.name));
  const sum = (f: (r: CustomerOverallRow) => number) => round2(rows.reduce((s, r) => s + f(r), 0));
  return {
    rows,
    totals: { customers: rows.length, billed: sum((r) => r.billed), paid: sum((r) => r.paid), due: sum((r) => r.due), advance: sum((r) => r.advance) },
  };
}

/* ------------------------------------------------------------------ */
/* Invoices that still have money to collect                           */
/* ------------------------------------------------------------------ */

export interface DueInvoiceRow {
  billId: number;
  invoiceNo: string;
  date: string;
  customerName: string;
  phone: string;
  beatId: string;
  beatName: string;
  total: number;
  paid: number;
  balance: number;
  ageDays: number;
}

export function buildDueInvoices(args: {
  bills: Bill[];
  payments: PaymentRecord[];
  customers: Customer[];
  beats: BeatLike[];
  today: string;
  beatFilter?: string;
  search?: string;
}): { rows: DueInvoiceRow[]; total: number } {
  const { bills, payments, customers, beats, today } = args;
  const beatFilter = args.beatFilter || 'all';
  const q = (args.search || '').trim().toLowerCase();
  const resolver = makeBeatResolver(customers, beats);
  const balances = effectiveBillBalances(bills, payments);
  const beatName = (id: string) => (id === NO_BEAT ? NO_BEAT_LABEL : beats.find((b) => b.id === id)?.name || NO_BEAT_LABEL);
  const rows: DueInvoiceRow[] = [];
  for (const b of bills || []) {
    if (!isLive(b)) continue;
    const balance = round2(balances.get(b.id) || 0);
    if (balance <= 0.004) continue;
    const beatId = resolver.beatIdFor(b.retailer, b.phone, b.customerId);
    if (beatFilter !== 'all' && beatId !== beatFilter) continue;
    const inv = invoiceNo(b);
    if (q && !(b.retailer || '').toLowerCase().includes(q) && !inv.toLowerCase().includes(q) && !String(b.phone || '').includes(q)) continue;
    const total = round2(billNetTotal(b));
    const d = day10(b.date);
    rows.push({
      billId: b.id,
      invoiceNo: inv,
      date: d,
      customerName: b.retailer || 'Cash Sale',
      phone: b.phone || '',
      beatId,
      beatName: beatName(beatId),
      total,
      paid: round2(Math.max(0, total - balance)),
      balance,
      ageDays: d ? Math.max(0, daysBetween(d, today)) : 0,
    });
  }
  rows.sort((a, b) => b.ageDays - a.ageDays || b.balance - a.balance);
  return { rows, total: round2(rows.reduce((s, r) => s + r.balance, 0)) };
}
