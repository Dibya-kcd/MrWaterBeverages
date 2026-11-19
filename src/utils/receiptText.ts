// Text-only half of the 80 mm receipt (no jsPDF / qrcode import), so screens that only need the
// WhatsApp / receipt text do not pull the PDF library into the startup bundle.
import { Bill, BillingSettings, OrganizationProfile } from '../types';
import { buildBillText, cgstSgstLabels, freeStockInvoiceDisplay, money, nonGstSummary, statusOf } from './billing';
import { inrToWords, isBillGstInvoice, formatBillNumber } from './invoiceCommon';
import { lookupOdiaName } from './odiaNameLookup';

/**
 * 80 mm receipt (thermal-slip style) for a bill.
 *
 * ONE list of rows (`buildReceiptRows`) is drawn two ways, so the PDF and the WhatsApp text always show
 * the same numbers:
 *   - generateReceiptPdf80  -> a 80 mm wide PDF (height grows with the number of items)
 *   - buildReceiptText      -> monospace text, `width` characters per line (32 / 42 / 48)
 *
 * Nothing here changes how a bill is calculated; it only lays out figures that are already on the bill.
 */

export type ReceiptRow =
  | { k: 'title'; text: string }
  | { k: 'center'; text: string; bold?: boolean; small?: boolean }
  | { k: 'rule'; style: 'dash' | 'double' }
  | { k: 'kv'; left: string; right: string; bold?: boolean; big?: boolean }
  | { k: 'item'; name: string; nameOr?: string; qtyRate: string; amount: string; note?: string }
  | { k: 'qr'; data: string; caption?: string }
  | { k: 'wrap'; text: string; small?: boolean; bold?: boolean }
  | { k: 'gap' };

export type ReceiptTextWidth = 32 | 42 | 48;

/** Standard PDF fonts only know Latin-1: swap the few symbols that would print as junk. */
const plain = (s: string): string =>
  String(s ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u00b7\u2022\u2023]/g, '-')
    .replace(/\u00d7/g, 'x')
    .replace(/\u20b9/g, 'Rs ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();

/** Standard UPI deep link: any UPI app that scans it opens a payment screen with the amount filled in. */
export function upiPayUri(upiId: string, payeeName: string, amount: number, note: string): string {
  const enc = (v: string) => encodeURIComponent(v).replace(/%40/g, '@');
  const params = [
    `pa=${enc(upiId.trim())}`,
    `pn=${enc(plain(payeeName).slice(0, 40) || 'Merchant')}`,
    `am=${(Math.round(amount * 100) / 100).toFixed(2)}`,
    'cu=INR',
    `tn=${enc(plain(note).slice(0, 40))}`,
  ];
  return `upi://pay?${params.join('&')}`;
}

export function buildReceiptRows(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
  options?: { showBatch?: boolean },
): ReceiptRow[] {
  const isGst = isBillGstInvoice(bill, invoiceFormat);
  const rows: ReceiptRow[] = [];
  const billNo = formatBillNumber(bill, settings, invoiceFormat);
  const isNonGstSeries = bill.gstExclude === true || bill.docSeries === 'non_gst';

  // ---- Header -------------------------------------------------------------------------------
  rows.push({ k: 'title', text: plain(org?.name || 'MrWater').toUpperCase() });
  const address = [org?.address, org?.city].filter(Boolean).join(', ');
  if (address) rows.push({ k: 'center', text: plain(address), small: true });
  if (org?.phone) rows.push({ k: 'center', text: `Ph: ${plain(org.phone)}`, small: true });
  if (isGst && org?.gstin) rows.push({ k: 'center', text: `GSTIN: ${plain(org.gstin)}`, small: true });
  if (org?.fssai) rows.push({ k: 'center', text: `FSSAI: ${plain(org.fssai)}`, small: true });
  rows.push({ k: 'rule', style: 'dash' });
  rows.push({
    k: 'center',
    text: isGst ? 'TAX INVOICE' : isNonGstSeries ? 'CASH MEMO (NON-GST)' : 'RETAIL BILL / CASH MEMO',
    bold: true,
  });
  rows.push({ k: 'kv', left: isGst ? 'Invoice No' : 'Memo No', right: billNo, bold: true });
  rows.push({ k: 'kv', left: 'Date', right: String(bill.date || '') });
  rows.push({ k: 'wrap', text: `To: ${plain(bill.retailer || 'Cash Retailer')}`, bold: true });
  if (bill.phone) rows.push({ k: 'kv', left: 'Phone', right: plain(bill.phone) });
  if (isGst && bill.customerGstin) rows.push({ k: 'kv', left: 'Buyer GSTIN', right: plain(bill.customerGstin) });
  if (bill.vehicle) rows.push({ k: 'kv', left: 'Vehicle', right: plain(bill.vehicle) });
  rows.push({ k: 'rule', style: 'dash' });

  // ---- Items: name on its own line, then "qty x rate ........ amount" ------------------------
  const showLot =
    options?.showBatch !== undefined ? options.showBatch : (settings?.showBatchOnInvoice ?? false);
  const showOdia = settings?.showOdiaNameOnReceipt ?? false;
  let totalCases = 0;
  let totalFree = 0;
  for (const it of bill.items || []) {
    const d = freeStockInvoiceDisplay(it);
    const qty = Number(it.qty) || 0;
    const free = Number(it.freeQty) || 0;
    totalCases += qty;
    totalFree += free;
    const notes: string[] = [];
    if (d.isFreeStock) {
      notes.push('FREE STOCK - 100% scheme discount');
    } else {
      if (free > 0) notes.push(`Incl. ${free} free (${Math.max(0, qty - free)} billed + ${free} free)`);
      else if (d.discount > 0) notes.push(`Scheme disc Rs ${money(d.discount)}`);
    }
    if (showLot && it.batchNumber) {
      notes.push(`Lot ${plain(it.batchNumber)}${it.expiryDate ? ` (Exp ${it.expiryDate})` : ''}`);
    }
    const nameOr = showOdia ? lookupOdiaName(it.productId, it.productName || '') : '';
    rows.push({
      k: 'item',
      name: plain(it.productName || 'Item'),
      nameOr: nameOr && nameOr !== it.productName ? nameOr : undefined,
      qtyRate: `${d.qtyLabel} cs x ${money(d.rate)}`,
      amount: d.isFreeStock ? 'FREE' : money(d.amount),
      note: notes.length ? notes.join('. ') : undefined,
    });
  }
  rows.push({ k: 'rule', style: 'dash' });
  rows.push({
    k: 'kv',
    left: 'Crates',
    right: totalFree > 0 ? `${totalCases} cs (${totalFree} free incl.)` : `${totalCases} cs`,
  });

  // ---- Money summary (same figures as the A4 invoice) -------------------------------------
  if (isGst) {
    rows.push({ k: 'kv', left: 'Taxable value', right: `Rs ${money(bill.subtotal)}` });
    const special = Number(bill.additionalDiscount) || 0;
    if (special > 0) rows.push({ k: 'kv', left: 'Special discount', right: `-Rs ${money(special)}` });
    const scheme = (Number(bill.discount) || 0) - special;
    if (scheme > 0) rows.push({ k: 'kv', left: 'Scheme savings', right: `-Rs ${money(scheme)}` });
    if (bill.cgst > 0 || bill.sgst > 0) {
      const lbl = cgstSgstLabels(bill.items || []);
      rows.push({ k: 'kv', left: lbl.cgst, right: `Rs ${money(bill.cgst)}` });
      rows.push({ k: 'kv', left: lbl.sgst, right: `Rs ${money(bill.sgst)}` });
    }
  } else {
    const ng = nonGstSummary(bill);
    rows.push({ k: 'kv', left: 'Items value', right: `Rs ${money(ng.itemsValue)}` });
    if (ng.schemeDiscount > 0) rows.push({ k: 'kv', left: 'Scheme savings', right: `-Rs ${money(ng.schemeDiscount)}` });
    if (ng.specialDiscount > 0) rows.push({ k: 'kv', left: 'Special discount', right: `-Rs ${money(ng.specialDiscount)}` });
    if (ng.taxAdjustment > 0.05) rows.push({ k: 'kv', left: 'Taxes', right: `Rs ${money(ng.taxAdjustment)}` });
  }
  const ro = Number(bill.roundOff) || 0;
  if (Math.abs(ro) >= 0.005) {
    rows.push({ k: 'kv', left: 'Round off', right: `${ro < 0 ? '-' : '+'}Rs ${money(Math.abs(ro))}` });
  }
  rows.push({ k: 'rule', style: 'double' });
  rows.push({ k: 'kv', left: 'TOTAL', right: `Rs ${money(bill.total)}`, bold: true, big: true });
  const saved = Number(bill.youSaved) || Number(bill.schemeDiscountTotal) || 0;
  if (saved > 0) rows.push({ k: 'kv', left: 'You saved', right: `Rs ${money(saved)}` });
  const st = statusOf(bill.total, bill.amountPaid);
  rows.push({ k: 'kv', left: 'Received', right: `Rs ${money(bill.amountPaid)}` });
  rows.push({ k: 'kv', left: st.balance > 0 ? 'BALANCE DUE' : 'Balance', right: `Rs ${money(st.balance)}`, bold: st.balance > 0 });
  rows.push({ k: 'center', text: `Status: ${st.label.toUpperCase()}`, bold: true });
  rows.push({ k: 'rule', style: 'dash' });
  rows.push({ k: 'wrap', text: inrToWords(bill.total), small: true });

  if (org?.upiId) {
    if ((settings?.showUpiQrOnReceipt ?? true) && st.balance > 0.5) {
      // Scan-to-pay for the amount still due. (Text / WhatsApp copies carry the UPI ID line only.)
      rows.push({ k: 'gap' });
      rows.push({
        k: 'qr',
        data: upiPayUri(org.upiId, org.name || '', st.balance, billNo),
        caption: `Scan to pay Rs ${money(st.balance)}`,
      });
    }
    rows.push({ k: 'gap' });
    rows.push({ k: 'center', text: `Pay by UPI: ${plain(org.upiId)}`, small: true, bold: true });
  }
  rows.push({ k: 'gap' });
  rows.push({
    k: 'center',
    text: isGst ? 'Computer generated tax invoice. E. & O.E.' : bill.taxStamp?.declaration ?? 'Prices include all taxes.',
    small: true,
  });
  rows.push({ k: 'center', text: 'Thank you! Visit again.', bold: true });
  return rows;
}

/* ====================================================================== */
/* Text (WhatsApp / copy)                                                  */
/* ====================================================================== */

function wrapWords(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const raw of String(text).split(' ')) {
    let word = raw;
    while (word.length > width) {
      if (line) {
        out.push(line);
        line = '';
      }
      out.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ' ' + word;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

const center = (s: string, w: number) => ' '.repeat(Math.max(0, Math.floor((w - s.length) / 2))) + s;

export function buildReceiptText(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
  width: ReceiptTextWidth = 32,
  options?: { showBatch?: boolean },
): string {
  const W = width;
  const out: string[] = [];
  for (const r of buildReceiptRows(bill, org, settings, invoiceFormat, options)) {
    switch (r.k) {
      case 'title':
      case 'center':
        for (const l of wrapWords(r.text, W)) out.push(center(l, W));
        break;
      case 'rule':
        out.push((r.style === 'double' ? '=' : '-').repeat(W));
        break;
      case 'kv': {
        const left = r.left;
        const right = r.right;
        if (left.length + 1 + right.length <= W) {
          out.push(left + ' '.repeat(W - left.length - right.length) + right);
        } else {
          // too long for one line: label, then the value pushed to the right edge
          for (const l of wrapWords(left, W)) out.push(l);
          for (const l of wrapWords(right, W)) out.push(' '.repeat(Math.max(0, W - l.length)) + l);
        }
        break;
      }
      case 'item': {
        for (const l of wrapWords(r.name, W)) out.push(l);
        if (r.nameOr) for (const l of wrapWords(r.nameOr, W)) out.push(l);
        const left = '  ' + r.qtyRate;
        if (left.length + 1 + r.amount.length <= W) {
          out.push(left + ' '.repeat(W - left.length - r.amount.length) + r.amount);
        } else {
          out.push(left);
          out.push(' '.repeat(Math.max(0, W - r.amount.length)) + r.amount);
        }
        if (r.note) for (const l of wrapWords(r.note, W - 2)) out.push('  ' + l);
        break;
      }
      case 'wrap':
        for (const l of wrapWords(r.text, W)) out.push(l);
        break;
      case 'gap':
        out.push('');
        break;
      case 'qr':
        break; // a QR cannot be shown in a text message
    }
  }
  return out.join('\n');
}

/** The receipt as a WhatsApp message: the ``` fence makes WhatsApp show it in a fixed-width font. */
export function buildReceiptWhatsAppText(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
): string {
  const w = settings?.receiptTextWidth;
  const width: ReceiptTextWidth = w === 42 || w === 48 ? w : 32;
  return '```\n' + buildReceiptText(bill, org, settings, invoiceFormat, width) + '\n```';
}

/**
 * The text every "send on WhatsApp" / "copy bill text" button uses. Settings -> Billing decides the style:
 * the detailed emoji summary (default, as before) or the 80 mm receipt text.
 */
export function buildBillMessage(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
): string {
  if (settings?.whatsappTextStyle === 'receipt') {
    return buildReceiptWhatsAppText(bill, org, settings, invoiceFormat);
  }
  return buildBillText(bill, org, settings, invoiceFormat);
}
