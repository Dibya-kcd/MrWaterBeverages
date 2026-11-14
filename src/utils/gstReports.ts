import { Bill, BillItem, Customer, InventoryDisposition, OrganizationProfile, Product } from '../types';
import {
  normalizeGstFraction,
  gstRateFromHsn as gstRateFromHsnShared,
  lineTaxDetail,
  resolveProductHsn,
  normalizeTo8DigitHsn,
} from './billing';
import { CATS } from '../constants/initialData';
import { todayISO } from "./dateLocal";

export type GstLineBreakdown = {
  billId: number;
  date: string;
  invoiceNo: string;
  customerName: string;
  customerGstin: string;
  placeOfSupply: string;
  productName: string;
  hsn: string;
  qty: number;
  gstRatePct: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  lineTotal: number;
  isB2B: boolean;
  /** Index of the line inside bill.items (lets other reports map back to the bill line). */
  itemIndex: number;
  /** True when place of supply differs from the supplier state (IGST instead of CGST+SGST). */
  interState: boolean;
};

export type GstInvoiceSummary = {
  billId: number;
  date: string;
  invoiceNo: string;
  customerName: string;
  customerGstin: string;
  isB2B: boolean;
  interState: boolean;
  placeOfSupply: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  invoiceTotal: number;
};

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadCsv(filename: string, lines: string[]) {
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function customerGstinMap(customers: Customer[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of customers) {
    const key = (c.name || '').trim().toLowerCase();
    if (key && c.gstin) map[key] = c.gstin.trim().toUpperCase();
  }
  return map;
}

function hsnForItem(item: BillItem, products: Product[]): string {
  const rawHsn = item.hsn ? String(item.hsn).trim() : '';
  const p = products.find((x) => Number(x.id) === Number(item.productId));
  const productHsn = p?.hsn ? String(p.hsn).trim() : '';
  const candidate = rawHsn || productHsn || resolveProductHsn(p, item.category);
  const digits = candidate.replace(/\D+/g, '');
  if (digits === '2202') return '22021090';
  if (digits.length === 8) return digits;
  return normalizeTo8DigitHsn(candidate, p?.category || item.category, item.productName || p?.name);
}

export const gstRateFromHsn = gstRateFromHsnShared;

/**
 * Resolve GST fraction for a bill line.
 * Priority: explicit line gst (if meaningful) → product.gstRate (from supplier invoice / catalogue)
 * → HSN table → category default → 18%.
 */
export function resolveLineGstRate(
  item: BillItem,
  products: Product[],
): { rate: number; hsn: string; source: string } {
  const hsn = hsnForItem(item, products);
  const p = products.find((x) => Number(x.id) === Number(item.productId));

  // The rate actually charged on the invoice line always wins: the GST return must
  // match what the customer was billed, not what the product master says today.
  // A stored 0 is a real 0% rate - except on free-issue lines, which were saved with 0 only
  // because they carry no price.
  const rawLine = item.gst as unknown;
  const hasLineRate = rawLine !== undefined && rawLine !== null && rawLine !== '' && Number.isFinite(Number(rawLine));
  const lineGstFirst = normalizeGstFraction(item.gst);
  const isFreeIssue = !!(item.isFree || item.isBundleFreeItem);
  if (hasLineRate && (lineGstFirst > 0 || !isFreeIssue)) {
    return { rate: lineGstFirst, hsn, source: 'line' };
  }

  // Legacy lines without a stored rate (or free-issue lines): product master
  if (p?.gstRate != null && Number.isFinite(Number(p.gstRate))) {
    return { rate: normalizeGstFraction(p.gstRate), hsn, source: 'product' };
  }

  const fromHsn = gstRateFromHsn(hsn);
  if (fromHsn != null) {
    return { rate: fromHsn, hsn, source: 'hsn' };
  }

  const catKey = (p?.category || item.category) as keyof typeof CATS | undefined;
  if (catKey && CATS[catKey]?.gst != null) {
    return { rate: normalizeGstFraction(CATS[catKey].gst), hsn, source: 'category' };
  }

  return { rate: 0.18, hsn, source: 'default' };
}

export type BillGstMode = 'inclusive' | 'exclusive' | 'off';

/**
 * Work out how a saved bill was taxed. The Bill record does not store its GST mode,
 * so it is inferred from the stored totals:
 *  - exclusive: stored subtotal equals the (post-discount) line total and tax was added on top
 *  - off: bill was saved with zero CGST+SGST (customer was not charged GST)
 *  - inclusive: everything else (the default)
 * `factor` scales line amounts for an invoice-level (additional) discount.
 */
export function billGstContext(b: Bill): { mode: BillGstMode; factor: number } {
  const gross = (b.items || []).reduce((s, i) => s + Math.max(0, Number(i.amount) || 0), 0);
  const extra = Math.max(0, Number(b.additionalDiscount) || 0);
  const effective = Math.max(0, gross - extra);
  const factor = gross > 0 ? effective / gross : 1;

  const cgst = Number(b.cgst);
  const sgst = Number(b.sgst);
  const subtotal = Number(b.subtotal);
  const total = Number(b.total);
  const taxStored = Number.isFinite(cgst) && Number.isFinite(sgst);
  const tax = taxStored ? cgst + sgst : NaN;

  if (taxStored && tax < 0.005 && Number.isFinite(total) && total > 0) {
    return { mode: 'off', factor };
  }
  if (
    taxStored &&
    tax > 0.5 &&
    Number.isFinite(subtotal) &&
    Number.isFinite(total) &&
    effective > 0 &&
    Math.abs(subtotal - effective) <= 1 &&
    total > effective + 0.5
  ) {
    return { mode: 'exclusive', factor };
  }
  return { mode: 'inclusive', factor };
}

export function breakdownBillItem(
  item: BillItem,
  opts?: { preferInclusive?: boolean; rateOverride?: number; interState?: boolean; factor?: number }
): { taxable: number; cgst: number; sgst: number; igst: number; cess: number; rate: number; total: number } {
  const preferInclusive = opts?.preferInclusive !== false;
  const inter = !!opts?.interState;
  const rate =
    opts?.rateOverride != null
      ? normalizeGstFraction(opts.rateOverride)
      : normalizeGstFraction(item.gst);

  // The 40% slab for aerated/energy drinks replaced the old 28% GST + 12% cess: no separate cess.
  // GST is charged on the paid value PLUS the free scheme cases carried in the line
  // (see lineTaxDetail); `item.amount` is the net payable for the line.
  const d = lineTaxDetail(item, rate, preferInclusive ? 'inclusive' : 'exclusive', opts?.factor ?? 1);
  return {
    taxable: d.taxable,
    cgst: inter ? 0 : d.cgst,
    sgst: inter ? 0 : d.sgst,
    igst: inter ? d.tax : 0,
    cess: 0,
    rate: d.rate,
    total: d.total,
  };
}

/** Per-line tax figures plus a tax summary by HSN and rate, for printing on an invoice. */
export interface InvoiceTaxLine {
  hsn: string;
  ratePct: number;
  taxable: number;
  cgst: number;
  sgst: number;
  tax: number;
}
export interface InvoiceTaxSummaryRow extends InvoiceTaxLine {
  qty: number;
}

export function billTaxBreakdown(
  b: Bill,
  products: Product[],
): { lines: InvoiceTaxLine[]; summary: InvoiceTaxSummaryRow[]; isTaxed: boolean } {
  const ctx = billGstContext(b);
  const nonGstBill =
    b.invoiceType === 'bill_of_supply' || b.invoiceType === 'retail' || b.isGstInvoice === false || ctx.mode === 'off';
  const lines: InvoiceTaxLine[] = [];
  const map = new Map<string, InvoiceTaxSummaryRow>();
  for (const item of b.items || []) {
    const resolved = resolveLineGstRate(item, products);
    const rate = nonGstBill ? 0 : resolved.rate;
    const d = lineTaxDetail(item, rate, ctx.mode === 'exclusive' ? 'exclusive' : 'inclusive', ctx.factor);
    const ratePct = Math.round(d.rate * 10000) / 100;
    lines.push({ hsn: resolved.hsn, ratePct, taxable: d.taxable, cgst: d.cgst, sgst: d.sgst, tax: d.tax });
    const key = `${resolved.hsn}|${ratePct}`;
    const cur = map.get(key) || { hsn: resolved.hsn, ratePct, qty: 0, taxable: 0, cgst: 0, sgst: 0, tax: 0 };
    cur.qty += Number(item.qty) || 0;
    cur.taxable += d.taxable;
    cur.cgst += d.cgst;
    cur.sgst += d.sgst;
    cur.tax += d.tax;
    map.set(key, cur);
  }
  const summary = Array.from(map.values()).sort((a, c) => a.hsn.localeCompare(c.hsn) || a.ratePct - c.ratePct);
  return { lines, summary, isTaxed: !nonGstBill };
}

export type GstBuildOptions = {
  /** First two digits of the supplier GSTIN (state code). When set, B2B sales to another state become IGST. */
  orgStateCode?: string;
};

export function orgStateCodeFromProfile(org?: OrganizationProfile | null): string {
  const g = String(org?.gstin || '').trim();
  return /^[0-9]{2}/.test(g) ? g.slice(0, 2) : '';
}

function customerStateMap(customers: Customer[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of customers) {
    const key = (c.name || '').trim().toLowerCase();
    const code = String((c as any).stateCode || '').trim();
    if (key && /^[0-9]{2}$/.test(code)) map[key] = code;
  }
  return map;
}

export function buildGstLines(
  bills: Bill[],
  products: Product[],
  customers: Customer[],
  invoicePrefix = 'INV',
  opts: GstBuildOptions = {}
): GstLineBreakdown[] {
  const gstinMap = customerGstinMap(customers);
  const stateMap = customerStateMap(customers);
  const orgState = opts.orgStateCode || '';
  const lines: GstLineBreakdown[] = [];

  for (const b of bills) {
    if (b.status === 'cancelled' || (b as any).cancelled) continue;
    const custKey = (b.retailer || '').trim().toLowerCase();
    // Invoice-level GSTIN wins; else customer master; supplyType B2C forces B2C
    const gstinRaw = (b.customerGstin || gstinMap[custKey] || '').trim().toUpperCase();
    const gstinValid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(gstinRaw);
    const isB2B =
      b.supplyType === 'B2C'
        ? false
        : b.supplyType === 'B2B'
          ? gstinValid
          : gstinValid;
    const gstin = isB2B ? gstinRaw : '';
    // Place of supply: GSTIN state for B2B, customer-master state for B2C, else the supplier state
    const pos = gstin ? gstin.slice(0, 2) : stateMap[custKey] || '';
    const interState = !!orgState && !!pos && pos !== orgState;
    const invoiceNo = `${invoicePrefix}-${b.id}`;

    const ctx = billGstContext(b);
    // Non-GST / bill of supply, or a bill that was saved without charging any tax → force 0 rate
    const nonGstBill =
      b.invoiceType === 'bill_of_supply' ||
      b.invoiceType === 'retail' ||
      b.isGstInvoice === false ||
      ctx.mode === 'off';

    (b.items || []).forEach((item, itemIndex) => {
      const resolved = resolveLineGstRate(item, products);
      const rate = nonGstBill ? 0 : resolved.rate;
      // Scale for the invoice-level (special) discount so the report matches the invoice total.
      const br = breakdownBillItem(item, {
        rateOverride: rate,
        preferInclusive: ctx.mode !== 'exclusive',
        interState,
        factor: ctx.factor,
      });
      lines.push({
        billId: b.id,
        date: (b.date || '').slice(0, 10),
        invoiceNo,
        customerName: b.retailer || 'Cash Sale',
        customerGstin: gstin,
        placeOfSupply: pos,
        productName: item.productName,
        hsn: resolved.hsn,
        qty: Number(item.qty) || 0,
        // Always percentage points (40 for 40%, not 0.4)
        gstRatePct: Math.round(br.rate * 10000) / 100,
        taxable: br.taxable,
        cgst: br.cgst,
        sgst: br.sgst,
        igst: br.igst,
        cess: br.cess,
        lineTotal: br.total,
        isB2B,
        itemIndex,
        interState,
      });
    });
  }
  return lines;
}

export function summarizeInvoices(lines: GstLineBreakdown[]): GstInvoiceSummary[] {
  const map = new Map<number, GstInvoiceSummary>();
  for (const l of lines) {
    const cur = map.get(l.billId);
    if (!cur) {
      map.set(l.billId, {
        billId: l.billId,
        date: l.date,
        invoiceNo: l.invoiceNo,
        customerName: l.customerName,
        customerGstin: l.customerGstin,
        isB2B: l.isB2B,
        interState: l.interState,
        placeOfSupply: l.placeOfSupply,
        taxable: l.taxable,
        cgst: l.cgst,
        sgst: l.sgst,
        igst: l.igst,
        cess: l.cess,
        invoiceTotal: l.lineTotal,
      });
    } else {
      cur.taxable += l.taxable;
      cur.cgst += l.cgst;
      cur.sgst += l.sgst;
      cur.igst += l.igst;
      cur.cess += l.cess;
      cur.invoiceTotal += l.lineTotal;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date) || b.billId - a.billId);
}

export function hsnSummary(lines: GstLineBreakdown[]) {
  const map = new Map<
    string,
    { hsn: string; rate: number; qty: number; taxable: number; cgst: number; sgst: number; igst: number; cess: number }
  >();
  for (const l of lines) {
    const key = `${l.hsn}|${l.gstRatePct}`;
    const cur = map.get(key) || {
      hsn: l.hsn,
      rate: l.gstRatePct,
      qty: 0,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
    };
    cur.qty += l.qty;
    cur.taxable += l.taxable;
    cur.cgst += l.cgst;
    cur.sgst += l.sgst;
    cur.igst += l.igst;
    cur.cess += l.cess;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
}

export function computeGstPeriodSummary(lines: GstLineBreakdown[]) {
  let taxable = 0,
    cgst = 0,
    sgst = 0,
    igst = 0,
    cess = 0;
  for (const l of lines) {
    taxable += l.taxable;
    cgst += l.cgst;
    sgst += l.sgst;
    igst += l.igst;
    cess += l.cess;
  }
  return {
    outputTaxable: taxable,
    outputCgst: cgst,
    outputSgst: sgst,
    outputIgst: igst,
    outputCess: cess,
    totalOutputGst: cgst + sgst + igst + cess,
  };
}

/* ------------------------------------------------------------------ *
 * Credit notes (sales returns)
 * ------------------------------------------------------------------ */

export type CreditNoteRow = {
  billId: number;
  invoiceNo: string;
  creditNoteNo: string;
  date: string;
  customerName: string;
  customerGstin: string;
  placeOfSupply: string;
  interState: boolean;
  /** Taxable value of the credit note (credit minus the GST that was returned). */
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Credit notes issued against the given bills. `totalCredit` on a sales return is GST-inclusive,
 * so taxable = totalCredit − (cgst + sgst). Credit notes against an inter-state invoice are
 * reported as IGST.
 */
export function creditNoteSummary(
  bills: Bill[],
  lines: GstLineBreakdown[],
  invoicePrefix = 'INV'
): { rows: CreditNoteRow[]; taxable: number; cgst: number; sgst: number; igst: number; tax: number; total: number } {
  const meta = new Map<number, { gstin: string; pos: string; inter: boolean }>();
  for (const l of lines) {
    if (!meta.has(l.billId)) meta.set(l.billId, { gstin: l.customerGstin, pos: l.placeOfSupply, inter: l.interState });
  }
  const rows: CreditNoteRow[] = [];
  for (const b of bills) {
    if (b.status === 'cancelled' || (b as any).cancelled) continue;
    const m = meta.get(b.id) || { gstin: '', pos: '', inter: false };
    for (const r of b.returns || []) {
      const total = Number(r.totalCredit) || 0;
      const tax = (Number(r.cgst) || 0) + (Number(r.sgst) || 0);
      rows.push({
        billId: b.id,
        invoiceNo: `${invoicePrefix}-${b.id}`,
        creditNoteNo: r.creditNoteNo || r.id,
        date: (r.date || b.date || '').slice(0, 10),
        customerName: b.retailer || 'Cash Sale',
        customerGstin: m.gstin,
        placeOfSupply: m.pos,
        interState: m.inter,
        taxable: Math.max(0, total - tax),
        cgst: m.inter ? 0 : Number(r.cgst) || 0,
        sgst: m.inter ? 0 : Number(r.sgst) || 0,
        igst: m.inter ? tax : 0,
        total,
      });
    }
  }
  const sum = (f: (r: CreditNoteRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const cgst = sum((r) => r.cgst);
  const sgst = sum((r) => r.sgst);
  const igst = sum((r) => r.igst);
  return { rows, taxable: sum((r) => r.taxable), cgst, sgst, igst, tax: cgst + sgst + igst, total: sum((r) => r.total) };
}

/**
 * Single source of truth for the GSTR-3B style position, used by the GST screen,
 * the header cards and the CSV export so they can never disagree.
 *  - Output tax is reduced by credit notes.
 *  - ITC in excess of output tax is carried forward (not silently dropped).
 */
/**
 * Invoice series check (GSTR-1 "documents issued"): the first and last invoice number of the period, how many were
 * issued, how many were cancelled, and any number in between that exists nowhere (a hole in the series, which has
 * to be explained). `periodBills` are the active bills of the period; `cancelledBills` are all cancelled bills.
 */
export function invoiceSeriesSummary(
  periodBills: { id: number }[],
  cancelledBills: { id: number }[],
  allBills: { id: number }[]
) {
  const ids = (periodBills || []).map((b) => Number(b.id)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return null;
  const from = Math.min(...ids);
  const to = Math.max(...ids);
  const known = new Set<number>([...allBills, ...cancelledBills].map((b) => Number(b.id)));
  const missing: number[] = [];
  for (let n = from; n <= to && n - from < 50000; n++) if (!known.has(n)) missing.push(n);
  const cancelled = cancelledBills.filter((b) => b.id >= from && b.id <= to).length;
  return { from, to, numbers: to - from + 1, active: ids.length, cancelled, missing };
}

/**
 * Input tax credit that must be REVERSED for goods returned to the supplier: when the supplier issues a credit note
 * (recorded on the disposition with its tax), the GST on the returned goods is no longer claimable. Counted in the
 * period of the credit note date (event date if the note has none). Write-offs and free issues carry no supplier
 * credit note and are not included.
 */
const SUPPLIER_RETURN_TYPES = new Set([
  'expiry_return', 'quality_return', 'invoice_error_return', 'return_to_supplier', 'return_to_company',
]);
export function itcReversalFromDispositions(
  dispositions: InventoryDisposition[],
  inPeriod: (isoDate: string) => boolean
) {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const rows: { id: string; supplier: string; creditNoteNumber: string; date: string; tax: number }[] = [];
  for (const d of dispositions || []) {
    if (!SUPPLIER_RETURN_TYPES.has(d.dispositionType)) continue;
    if (!(d.creditNoteNumber || '').trim()) continue; // no credit note issued yet: nothing to reverse
    const date = String(d.creditNoteDate || d.eventDate || '').slice(0, 10);
    if (!date || !inPeriod(date)) continue;
    const c = Number(d.cnCgst) || 0;
    const sg = Number(d.cnSgst) || 0;
    const i = Number(d.cnIgst) || 0;
    if (c + sg + i <= 0) continue;
    cgst += c;
    sgst += sg;
    igst += i;
    rows.push({ id: d.id, supplier: d.supplierName || '', creditNoteNumber: d.creditNoteNumber || '', date, tax: c + sg + i });
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { cgst: r2(cgst), sgst: r2(sgst), igst: r2(igst), total: r2(cgst + sgst + igst), rows };
}

export function computeGstr3b(
  lines: GstLineBreakdown[],
  cn: { taxable: number; cgst: number; sgst: number; igst: number; tax: number },
  inputGstCredit: number
) {
  let taxableGst = 0;
  let taxableNil = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let cess = 0;
  for (const l of lines) {
    if (l.gstRatePct > 0) {
      taxableGst += l.taxable;
      cgst += l.cgst;
      sgst += l.sgst;
      igst += l.igst;
      cess += l.cess;
    } else {
      taxableNil += l.taxable;
    }
  }
  const outputGst = cgst + sgst + igst + cess;
  const netOutputGst = Math.max(0, outputGst - cn.tax);
  const itc = Math.max(0, Number(inputGstCredit) || 0);
  return {
    taxableGst,
    taxableNil,
    cgst,
    sgst,
    igst,
    cess,
    outputGst,
    cnTaxable: cn.taxable,
    cnCgst: cn.cgst,
    cnSgst: cn.sgst,
    cnIgst: cn.igst,
    cnTax: cn.tax,
    netOutputGst,
    inputCredit: itc,
    netPayable: Math.max(0, netOutputGst - itc),
    carryForwardItc: Math.max(0, itc - netOutputGst),
  };
}

export function safeGstSummaryFromBills(
  bills: Bill[],
  products: Product[],
  customers: Customer[],
  invoicePrefix = 'INV',
  opts: GstBuildOptions = {}
) {
  const lines = buildGstLines(bills, products, customers, invoicePrefix, opts);
  const cn = creditNoteSummary(bills, lines, invoicePrefix);
  return {
    ...computeGstPeriodSummary(lines),
    cnTaxable: cn.taxable,
    cnCgst: cn.cgst,
    cnSgst: cn.sgst,
    cnIgst: cn.igst,
    cnTax: cn.tax,
    creditNotes: cn.rows,
    lines,
  };
}

/* ------------------------------------------------------------------ *
 * CA export pack
 * ------------------------------------------------------------------ */

const B2CL_THRESHOLD = 250000;

export function exportCaGstPack(opts: {
  bills: Bill[];
  products: Product[];
  customers: Customer[];
  org?: OrganizationProfile | null;
  invoicePrefix?: string;
  periodLabel?: string;
  inputGstCredit?: number;
}) {
  const prefix = opts.invoicePrefix || 'INV';
  const orgState = orgStateCodeFromProfile(opts.org);
  const lines = buildGstLines(opts.bills, opts.products, opts.customers, prefix, { orgStateCode: orgState });
  const invoices = summarizeInvoices(lines);
  const invoiceById = new Map(invoices.map((i) => [i.billId, i]));
  const hsn = hsnSummary(lines);
  const summary = computeGstPeriodSummary(lines);
  const cn = creditNoteSummary(opts.bills, lines, prefix);
  const g3 = computeGstr3b(lines, cn, Number(opts.inputGstCredit) || 0);
  const period = (opts.periodLabel || 'period').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const stamp = todayISO();
  const orgName = opts.org?.name || 'MrWater';
  const orgGstin = opts.org?.gstin || '';

  const invLines: string[] = [
    ['Org', csvEscape(orgName)].join(','),
    ['GSTIN', orgGstin].join(','),
    ['Period', opts.periodLabel || period].join(','),
    ['Generated', stamp].join(','),
    '',
    [
      'Date',
      'Invoice No',
      'Customer',
      'GSTIN',
      'B2B/B2C',
      'Place of Supply',
      'Taxable Value',
      'CGST',
      'SGST',
      'IGST',
      'Cess',
      'Invoice Total',
    ].join(','),
  ];
  for (const inv of invoices) {
    invLines.push(
      [
        inv.date,
        inv.invoiceNo,
        csvEscape(inv.customerName),
        inv.customerGstin,
        inv.isB2B ? 'B2B' : 'B2C',
        inv.placeOfSupply || '',
        inv.taxable.toFixed(2),
        inv.cgst.toFixed(2),
        inv.sgst.toFixed(2),
        inv.igst.toFixed(2),
        inv.cess.toFixed(2),
        inv.invoiceTotal.toFixed(2),
      ].join(',')
    );
  }
  downloadCsv(`CA_Invoice_Register_${period}_${stamp}.csv`, invLines);

  // ---- GSTR-1 B2B: one row per invoice per rate; Invoice Value is the whole invoice total ----
  const b2bRows = new Map<
    string,
    { l: GstLineBreakdown; taxable: number; cgst: number; sgst: number; igst: number; cess: number }
  >();
  for (const l of lines.filter((x) => x.isB2B)) {
    const key = `${l.billId}|${l.gstRatePct}`;
    const cur = b2bRows.get(key) || { l, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    cur.taxable += l.taxable;
    cur.cgst += l.cgst;
    cur.sgst += l.sgst;
    cur.igst += l.igst;
    cur.cess += l.cess;
    b2bRows.set(key, cur);
  }
  const b2b: string[] = [
    'GSTR-1 B2B style (registered customers) - one row per invoice per rate',
    [
      'GSTIN of recipient',
      'Receiver Name',
      'Invoice Number',
      'Invoice date',
      'Invoice Value',
      'Place Of Supply',
      'Reverse Charge',
      'Invoice Type',
      'Rate %',
      'Taxable Value',
      'CGST',
      'SGST',
      'IGST',
      'Cess',
    ].join(','),
  ];
  for (const r of b2bRows.values()) {
    b2b.push(
      [
        r.l.customerGstin,
        csvEscape(r.l.customerName),
        r.l.invoiceNo,
        r.l.date,
        (invoiceById.get(r.l.billId)?.invoiceTotal ?? r.l.lineTotal).toFixed(2),
        r.l.placeOfSupply || '',
        'N',
        'Regular',
        r.l.gstRatePct,
        r.taxable.toFixed(2),
        r.cgst.toFixed(2),
        r.sgst.toFixed(2),
        r.igst.toFixed(2),
        r.cess.toFixed(2),
      ].join(',')
    );
  }
  downloadCsv(`CA_GSTR1_B2B_${period}_${stamp}.csv`, b2b);

  // ---- GSTR-1 B2C: B2CL (inter-state invoices above 2.5 lakh) and B2CS (everything else) ----
  const isB2cl = (l: GstLineBreakdown) =>
    !l.isB2B && l.interState && (invoiceById.get(l.billId)?.invoiceTotal || 0) > B2CL_THRESHOLD;
  const b2c: string[] = ['GSTR-1 B2C - Section 1: B2CL (inter-state, invoice value above 2.5 lakh)'];
  b2c.push(['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Rate %', 'Taxable Value', 'IGST', 'Cess'].join(','));
  const b2clRows = new Map<string, { l: GstLineBreakdown; taxable: number; igst: number; cess: number }>();
  for (const l of lines.filter(isB2cl)) {
    const key = `${l.billId}|${l.gstRatePct}`;
    const cur = b2clRows.get(key) || { l, taxable: 0, igst: 0, cess: 0 };
    cur.taxable += l.taxable;
    cur.igst += l.igst;
    cur.cess += l.cess;
    b2clRows.set(key, cur);
  }
  for (const r of b2clRows.values()) {
    b2c.push(
      [
        r.l.invoiceNo,
        r.l.date,
        (invoiceById.get(r.l.billId)?.invoiceTotal || 0).toFixed(2),
        r.l.placeOfSupply,
        r.l.gstRatePct,
        r.taxable.toFixed(2),
        r.igst.toFixed(2),
        r.cess.toFixed(2),
      ].join(',')
    );
  }
  b2c.push('');
  b2c.push('GSTR-1 B2C - Section 2: B2CS (consolidated by place of supply and rate)');
  b2c.push(['Type', 'Place Of Supply', 'Supply', 'Rate %', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Cess'].join(','));
  const b2csRows = new Map<string, { pos: string; rate: number; inter: boolean; taxable: number; cgst: number; sgst: number; igst: number; cess: number }>();
  for (const l of lines.filter((x) => !x.isB2B && !isB2cl(x))) {
    const pos = l.placeOfSupply || orgState || '';
    const key = `${pos}|${l.gstRatePct}|${l.interState}`;
    const cur = b2csRows.get(key) || { pos, rate: l.gstRatePct, inter: l.interState, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    cur.taxable += l.taxable;
    cur.cgst += l.cgst;
    cur.sgst += l.sgst;
    cur.igst += l.igst;
    cur.cess += l.cess;
    b2csRows.set(key, cur);
  }
  for (const r of b2csRows.values()) {
    b2c.push(
      [
        'OE',
        r.pos,
        r.inter ? 'Inter-state' : 'Intra-state',
        r.rate,
        r.taxable.toFixed(2),
        r.cgst.toFixed(2),
        r.sgst.toFixed(2),
        r.igst.toFixed(2),
        r.cess.toFixed(2),
      ].join(',')
    );
  }
  downloadCsv(`CA_GSTR1_B2C_${period}_${stamp}.csv`, b2c);

  // ---- Credit notes (CDNR registered / CDNUR unregistered) ----
  const cnl: string[] = [
    'GSTR-1 Credit notes issued (sales returns) - CDNR = registered recipient, CDNUR = unregistered',
    [
      'Type',
      'GSTIN of recipient',
      'Receiver Name',
      'Credit Note No',
      'Credit Note date',
      'Original Invoice',
      'Place Of Supply',
      'Note Value',
      'Taxable Value',
      'CGST',
      'SGST',
      'IGST',
    ].join(','),
  ];
  for (const r of cn.rows) {
    cnl.push(
      [
        r.customerGstin ? 'CDNR' : 'CDNUR',
        r.customerGstin,
        csvEscape(r.customerName),
        csvEscape(r.creditNoteNo),
        r.date,
        r.invoiceNo,
        r.placeOfSupply,
        r.total.toFixed(2),
        r.taxable.toFixed(2),
        r.cgst.toFixed(2),
        r.sgst.toFixed(2),
        r.igst.toFixed(2),
      ].join(',')
    );
  }
  downloadCsv(`CA_GSTR1_CreditNotes_${period}_${stamp}.csv`, cnl);

  // ---- HSN ----
  const hsnLines: string[] = [
    'GSTR-1 HSN summary (gross of credit notes)',
    ['HSN', 'Rate %', 'Total Qty', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Cess'].join(','),
  ];
  for (const h of hsn) {
    hsnLines.push(
      [
        h.hsn,
        h.rate,
        h.qty,
        h.taxable.toFixed(2),
        h.cgst.toFixed(2),
        h.sgst.toFixed(2),
        h.igst.toFixed(2),
        h.cess.toFixed(2),
      ].join(',')
    );
  }
  downloadCsv(`CA_GSTR1_HSN_${period}_${stamp}.csv`, hsnLines);

  // ---- Documents issued (Table 13) incl. cancelled invoices ----
  const docBills = [...opts.bills].sort((x, y) => Number(x.id) - Number(y.id));
  const cancelled = docBills.filter((b) => b.status === 'cancelled' || (b as any).cancelled);
  const docs: string[] = [
    'GSTR-1 Documents issued (Table 13)',
    ['Nature of document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'].join(','),
    [
      'Invoices for outward supply',
      docBills.length ? `${prefix}-${docBills[0].id}` : '',
      docBills.length ? `${prefix}-${docBills[docBills.length - 1].id}` : '',
      docBills.length,
      cancelled.length,
    ].join(','),
    ['Credit notes', '', '', cn.rows.length, 0].join(','),
    '',
    'Cancelled invoice numbers: ' + (cancelled.map((b) => `${prefix}-${b.id}`).join(' | ') || 'none'),
  ];
  downloadCsv(`CA_GSTR1_Documents_${period}_${stamp}.csv`, docs);

  // ---- GSTR-3B ----
  const g3b: string[] = [
    'GSTR-3B style summary - for CA (verify before filing)',
    ['Organisation', csvEscape(orgName)].join(','),
    ['GSTIN', orgGstin].join(','),
    ['Period', opts.periodLabel || period].join(','),
    '',
    ['Particulars', 'Taxable (Rs)', 'IGST', 'CGST', 'SGST', 'Cess'].join(','),
    [
      '3.1(a) Outward taxable supplies',
      g3.taxableGst.toFixed(2),
      g3.igst.toFixed(2),
      g3.cgst.toFixed(2),
      g3.sgst.toFixed(2),
      g3.cess.toFixed(2),
    ].join(','),
    ['3.1(c) Nil rated / non-GST supplies', g3.taxableNil.toFixed(2), '0.00', '0.00', '0.00', '0.00'].join(','),
    [
      'Less: credit notes issued',
      g3.cnTaxable.toFixed(2),
      g3.cnIgst.toFixed(2),
      g3.cnCgst.toFixed(2),
      g3.cnSgst.toFixed(2),
      '0.00',
    ].join(','),
    '',
    ['Tax position', 'Amount (Rs)'].join(','),
    ['Net output tax (after credit notes)', g3.netOutputGst.toFixed(2)].join(','),
    ['4. Eligible ITC (from purchase / GRN)', g3.inputCredit.toFixed(2)].join(','),
    ['5. Net GST payable (Net output - ITC)', g3.netPayable.toFixed(2)].join(','),
    ['ITC carried forward (excess over output tax)', g3.carryForwardItc.toFixed(2)].join(','),
    '',
    'Note: Management working paper for your CA - not a substitute for official GST portal returns.',
  ];
  downloadCsv(`CA_GSTR3B_Summary_${period}_${stamp}.csv`, g3b);

  const detail: string[] = [
    [
      'Invoice',
      'Date',
      'Customer',
      'GSTIN',
      'HSN',
      'Product',
      'Qty',
      'Rate%',
      'Taxable',
      'CGST',
      'SGST',
      'IGST',
      'Cess',
      'Line Total',
    ].join(','),
  ];
  for (const l of lines) {
    detail.push(
      [
        l.invoiceNo,
        l.date,
        csvEscape(l.customerName),
        l.customerGstin,
        l.hsn,
        csvEscape(l.productName),
        l.qty,
        l.gstRatePct,
        l.taxable.toFixed(2),
        l.cgst.toFixed(2),
        l.sgst.toFixed(2),
        l.igst.toFixed(2),
        l.cess.toFixed(2),
        l.lineTotal.toFixed(2),
      ].join(',')
    );
  }
  downloadCsv(`CA_Sale_Line_Detail_${period}_${stamp}.csv`, detail);

  return { lines, invoices, hsn, summary, creditNotes: cn.rows, gstr3b: g3, fileCount: 9 };
}
