/**
 * Pure calculations behind Reports > Sales (no React, so the numbers can be unit-tested).
 *
 * For the bills of the chosen period (cancelled bills left out):
 *   Net sales   = invoice total minus sales returns (what customers are liable for, GST included)
 *   Before GST  = net sales minus the GST inside it (same rule as the Profit & Loss: utils/billTaxBasis.ts)
 *   Paid        = money already received on THOSE bills (capped at their net value)
 *   Unpaid      = what is still owed on THOSE bills. This is NOT the customer's total due (that also includes
 *                 older bills and opening balances, see utils/dueSummary.ts).
 */
import type { Bill, BillItem, Salesman } from '../types';
import { billBalance, billNetTotal, billReturnCredit, returnedCreditByProduct, returnedQtyByProduct, round2 } from './salesReturns';
import type { BillTaxBasis } from './billTaxBasis';

export interface SalesGroupRow {
  key: string;
  label: string;
  bills: number;
  /** Cases delivered, free scheme cases included, after returns. */
  cases: number;
  netSales: number;
  gst: number;
  paid: number;
  unpaid: number;
}

export interface SalesSummary {
  totals: Omit<SalesGroupRow, 'key' | 'label'> & { billed: number; returns: number; discounts: number; beforeGst: number };
  byDay: SalesGroupRow[];
  byCustomer: SalesGroupRow[];
  byProduct: SalesGroupRow[];
  bySalesman: SalesGroupRow[];
}

export const NO_SALESMAN_LABEL = 'Office / counter';

const emptyRow = (key: string, label: string): SalesGroupRow => ({ key, label, bills: 0, cases: 0, netSales: 0, gst: 0, paid: 0, unpaid: 0 });
const dayOf = (b: Bill) => String(b.date || '').slice(0, 10) || 'Unknown';
const isLive = (b: Bill) => b.status !== 'cancelled' && !(b as any).cancelled;

export function buildSalesSummary(args: {
  bills: Bill[];
  salesmen?: Pick<Salesman, 'id' | 'name'>[];
  /** Revenue / GST split of one bill, from the shared helper. */
  taxBasisOf: (b: Bill) => BillTaxBasis;
}): SalesSummary {
  const salesmanName = new Map<string, string>();
  (args.salesmen || []).forEach((s) => salesmanName.set(String(s.id), s.name));

  const day = new Map<string, SalesGroupRow>();
  const cust = new Map<string, SalesGroupRow>();
  const prod = new Map<string, SalesGroupRow>();
  const sman = new Map<string, SalesGroupRow>();
  const totals = { ...emptyRow('', ''), billed: 0, returns: 0, discounts: 0, beforeGst: 0 };

  const add = (m: Map<string, SalesGroupRow>, key: string, label: string, v: Partial<SalesGroupRow>) => {
    const r = m.get(key) || emptyRow(key, label);
    r.bills += v.bills || 0;
    r.cases += v.cases || 0;
    r.netSales += v.netSales || 0;
    r.gst += v.gst || 0;
    r.paid += v.paid || 0;
    r.unpaid += v.unpaid || 0;
    m.set(key, r);
  };

  for (const b of args.bills || []) {
    if (!isLive(b)) continue;
    const net = billNetTotal(b);
    const basis = args.taxBasisOf(b);
    const paid = Math.min(net, Math.max(0, Number(b.amountPaid) || 0));
    const unpaid = Math.max(0, billBalance(b));

    const retQty = returnedQtyByProduct(b);
    const retCredit = returnedCreditByProduct(b);
    const perProduct = new Map<number, { name: string; qty: number; amount: number }>();
    let cases = 0;
    let lineDiscounts = 0;
    for (const it of (b.items || []) as BillItem[]) {
      const cur = perProduct.get(it.productId) || { name: it.productName || `Product #${it.productId}`, qty: 0, amount: 0 };
      cur.qty += Number(it.qty) || 0;
      cur.amount += Number(it.amount) || 0;
      perProduct.set(it.productId, cur);
      lineDiscounts += Number(it.discount) || 0;
    }
    perProduct.forEach((p, id) => {
      const netQty = Math.max(0, p.qty - (retQty[id] || 0));
      const netAmt = Math.max(0, p.amount - (retCredit[id] || 0));
      cases += netQty;
      add(prod, String(id), p.name, { bills: 1, cases: netQty, netSales: netAmt });
    });

    const row: Partial<SalesGroupRow> = { bills: 1, cases, netSales: net, gst: basis.gst, paid, unpaid };
    const customerName = (b.retailer || 'Cash / Walk-in').trim() || 'Cash / Walk-in';
    const sm = (b.salesmanId && salesmanName.get(String(b.salesmanId))) || (b.salesman || '').trim() || NO_SALESMAN_LABEL;
    add(day, dayOf(b), dayOf(b), row);
    add(cust, customerName.toLowerCase(), customerName, row);
    add(sman, sm.toLowerCase(), sm, row);

    totals.bills += 1;
    totals.cases += cases;
    totals.netSales += net;
    totals.gst += basis.gst;
    totals.beforeGst += basis.taxable;
    totals.paid += paid;
    totals.unpaid += unpaid;
    totals.billed += Number(b.total) || 0;
    totals.returns += billReturnCredit(b);
    totals.discounts += lineDiscounts + Math.max(0, Number(b.additionalDiscount) || 0);
  }

  const fin = (m: Map<string, SalesGroupRow>, sort: (a: SalesGroupRow, b: SalesGroupRow) => number) =>
    Array.from(m.values())
      .map((r) => ({ ...r, netSales: round2(r.netSales), gst: round2(r.gst), paid: round2(r.paid), unpaid: round2(r.unpaid) }))
      .sort(sort);
  const bySales = (a: SalesGroupRow, b: SalesGroupRow) => b.netSales - a.netSales;

  return {
    totals: {
      key: '', label: '',
      bills: totals.bills, cases: totals.cases,
      netSales: round2(totals.netSales), gst: round2(totals.gst), paid: round2(totals.paid), unpaid: round2(totals.unpaid),
      billed: round2(totals.billed), returns: round2(totals.returns), discounts: round2(totals.discounts), beforeGst: round2(totals.beforeGst),
    } as SalesSummary['totals'],
    byDay: fin(day, (a, b) => b.key.localeCompare(a.key)),
    byCustomer: fin(cust, bySales),
    byProduct: fin(prod, bySales),
    bySalesman: fin(sman, bySales),
  };
}
