import { Bill, BillingSettings, Product } from '../types';

/** Shared by the A4 invoice PDF, the 80mm receipt and the WhatsApp text, so all three agree. */
export function inrToWords(num: number): string {
  if (isNaN(num) || num <= 0) return 'Rupees Zero Only';

  const a = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertTwoDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
  };

  const convertThreeDigits = (n: number): string => {
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    let res = '';
    if (hundred > 0) res += a[hundred] + ' Hundred';
    if (remainder > 0) res += (res ? ' and ' : '') + convertTwoDigits(remainder);
    return res;
  };

  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);

  let crore = Math.floor(whole / 10000000);
  let lakh = Math.floor((whole % 10000000) / 100000);
  let thousand = Math.floor((whole % 100000) / 1000);
  let remainder = whole % 1000;

  let parts: string[] = [];
  if (crore > 0) parts.push(convertThreeDigits(crore) + ' Crore');
  if (lakh > 0) parts.push(convertThreeDigits(lakh) + ' Lakh');
  if (thousand > 0) parts.push(convertThreeDigits(thousand) + ' Thousand');
  if (remainder > 0) parts.push(convertThreeDigits(remainder));

  let res = 'Rupees ' + (parts.join(' ') || 'Zero');
  if (paise > 0) {
    res += ' and ' + convertTwoDigits(paise) + ' Paise';
  }
  return res + ' Only';
}

/**
 * True when a bill is a Non-GST / Trading memo that must be completely excluded
 * from all GST returns (GSTR-1, GSTR-3B, HSN, e-Way, CA packs) and tax invoice series.
 * It still remains active in stock, customer credit ledger, payments, and internal P&L.
 */
/** One definition of "this cart/bill line is Non-GST": the line says so, or its product master does. */
export function isLineNonGst(
  item: { productId?: number | string; taxability?: string },
  products?: Product[],
): boolean {
  if (item.taxability === 'non_gst') return true;
  if (!products || item.productId === undefined) return false;
  const p = products.find((x) => Number(x.id) === Number(item.productId));
  return p?.taxability === 'non_gst';
}

/** Splits a cart into GST-taxable and Non-GST lines using isLineNonGst. */
export function cartTaxMix<T extends { productId?: number | string; taxability?: string }>(
  items: T[],
  products?: Product[],
) {
  const nonGst = items.filter((it) => isLineNonGst(it, products));
  const taxable = items.filter((it) => !isLineNonGst(it, products));
  return {
    nonGst,
    taxable,
    hasMixed: nonGst.length > 0 && taxable.length > 0,
    allNonGst: items.length > 0 && taxable.length === 0,
  };
}

export function isGstExcludedBill(bill?: Partial<Bill> | null, products?: Product[]): boolean {
  if (!bill) return false;
  if (bill.gstExclude === true || bill.docSeries === 'non_gst') return true;
  if (bill.docNo && bill.docNo.toUpperCase().startsWith('NG-')) return true;
  const items = bill.items || [];
  if (items.length === 0) return false;
  const prodMap = products && products.length > 0
    ? new Map<number, Product>(products.map((p) => [Number(p.id), p]))
    : null;
  return items.every((it) => {
    if (it.taxability === 'non_gst') return true;
    const p = prodMap?.get(Number(it.productId));
    return p?.taxability === 'non_gst';
  });
}

/**
 * True when an active (non-cancelled) bill mixes at least one GST-taxable item
 * and at least one Non-GST item on the same document.
 */
export function isMixedTaxBill(bill?: Partial<Bill> | null, products?: Product[]): boolean {
  if (!bill || bill.status === 'cancelled' || (bill as any).cancelled) return false;
  const items = bill.items || [];
  if (items.length < 2) return false;
  return cartTaxMix(items, products).hasMixed;
}

export interface MixedTaxBillInfo {
  bill: Bill;
  nonGstLines: number;
  nonGstAmount: number;
  nonGstProductNames: string[];
  canAutoSplit: boolean;
}

/**
 * Finds active GST-series bills that also carry Non-GST items inside them
 * (for example, when a Non-GST product was added to an existing INV- bill via Edit Bill).
 */
export function findMixedTaxBills(
  bills: Bill[],
  products?: Product[],
): {
  entries: MixedTaxBillInfo[];
  billCount: number;
  lineCount: number;
  nonGstAmount: number;
} {
  const entries: MixedTaxBillInfo[] = [];
  let lineCount = 0;
  let totalNonGst = 0;

  for (const b of bills || []) {
    if (b.status === 'cancelled' || (b as any).cancelled) continue;
    if (isGstExcludedBill(b, products)) continue;
    const mix = cartTaxMix(b.items || [], products);
    if (!mix.hasMixed) continue;

    const gross = (b.items || []).reduce((s, it) => s + Math.max(0, Number(it.amount) || 0), 0);
    const extraDisc = Math.max(0, Number(b.additionalDiscount) || 0);
    const factor = gross > 0 && extraDisc > 0 ? Math.max(0, gross - extraDisc) / gross : 1;
    const rawNonGstAmt = mix.nonGst.reduce((s, it) => s + Math.max(0, Number(it.amount) || 0), 0);
    const nonGstAmount = Math.round(rawNonGstAmt * factor * 100) / 100;

    const names = Array.from(
      new Set(
        mix.nonGst
          .map((it) => String(it.productName || '').trim())
          .filter(Boolean),
      ),
    );
    const hasReturns = Array.isArray(b.returns) && b.returns.length > 0;

    entries.push({
      bill: b,
      nonGstLines: mix.nonGst.length,
      nonGstAmount,
      nonGstProductNames: names,
      canAutoSplit: !hasReturns,
    });
    lineCount += mix.nonGst.length;
    totalNonGst += nonGstAmount;
  }

  return {
    entries,
    billCount: entries.length,
    lineCount,
    nonGstAmount: Math.round(totalNonGst * 100) / 100,
  };
}

export function isBillGstInvoice(bill: Bill, invoiceFormat?: 'gst' | 'non_gst'): boolean {
  if (bill.gstExclude === true || bill.docSeries === 'non_gst') return false;
  // A bill issued by a composition / unregistered business can never be shown as a Tax Invoice, whatever format is asked for.
  if (bill.taxStamp && bill.taxStamp.registrationType !== 'regular') return false;
  if (invoiceFormat !== undefined) return invoiceFormat === 'gst';
  if (bill.invoiceType === 'tax_invoice' || bill.isGstInvoice === true) return true;
  if (bill.invoiceType === 'retail' || bill.invoiceType === 'bill_of_supply' || bill.isGstInvoice === false) return false;
  return bill.supplyType === 'B2B' && Boolean(bill.customerGstin);
}

/**
 * Canonical display number for a bill:
 * - Preserves separate sequence `NG-1`, `NG-2` (from `bill.docNo` or `NG-${bill.id}`) for Non-GST memos
 * - Uses `${prefix}-${bill.id}` (e.g. `INV-105` / `RET-105`) for standard invoices
 */
export function formatBillNumber(
  bill: Pick<Bill, 'id' | 'docNo' | 'docSeries' | 'gstExclude' | 'invoiceType' | 'isGstInvoice' | 'supplyType' | 'customerGstin' | 'taxStamp'>,
  settingsOrPrefix?: BillingSettings | string | null,
  invoiceFormat?: 'gst' | 'non_gst',
): string {
  if (bill.docNo && bill.docNo.trim()) return bill.docNo.trim();
  if (bill.docSeries === 'non_gst' || bill.gstExclude === true) return `NG-${bill.id}`;
  const isGst = isBillGstInvoice(bill as Bill, invoiceFormat);
  const customPrefix =
    typeof settingsOrPrefix === 'string'
      ? settingsOrPrefix.trim()
      : (settingsOrPrefix?.invoicePrefix || '').trim();
  const prefix = customPrefix || (isGst ? 'INV' : 'RET');
  return `${prefix}-${bill.id}`;
}
