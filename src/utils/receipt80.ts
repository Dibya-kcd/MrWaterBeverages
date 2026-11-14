import { jsPDF } from 'jspdf';
import qrcode from 'qrcode-generator';
import { Bill, BillingSettings, OrganizationProfile } from '../types';
import { buildBillText, cgstSgstLabels, freeStockInvoiceDisplay, money, nonGstSummary, statusOf } from './billing';
import { inrToWords, isBillGstInvoice } from './invoiceCommon';
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
  const prefix = settings?.invoicePrefix || (isGst ? 'INV' : 'RET');
  const billNo = `${prefix}-${bill.id}`;

  // ---- Header -------------------------------------------------------------------------------
  rows.push({ k: 'title', text: plain(org?.name || 'MrWater').toUpperCase() });
  const address = [org?.address, org?.city].filter(Boolean).join(', ');
  if (address) rows.push({ k: 'center', text: plain(address), small: true });
  if (org?.phone) rows.push({ k: 'center', text: `Ph: ${plain(org.phone)}`, small: true });
  if (org?.gstin) rows.push({ k: 'center', text: `GSTIN: ${plain(org.gstin)}`, small: true });
  if (org?.fssai) rows.push({ k: 'center', text: `FSSAI: ${plain(org.fssai)}`, small: true });
  rows.push({ k: 'rule', style: 'dash' });
  rows.push({ k: 'center', text: isGst ? 'TAX INVOICE' : 'RETAIL BILL / CASH MEMO', bold: true });
  rows.push({ k: 'kv', left: isGst ? 'Invoice No' : 'Bill No', right: billNo, bold: true });
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

/* ====================================================================== */
/* 80 mm PDF                                                               */
/* ====================================================================== */

const PAGE_W = 80;
const MARGIN = 3.5;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PT = 0.3528; // mm per point

const PX_PER_MM = 8; // ~203 dpi: matches an 80 mm thermal head and stays small as a PNG
const odiaCache = new Map<string, { url: string; hMm: number } | null>();

/**
 * PDF fonts cannot shape Odia, so the browser draws the name (it joins the letters correctly) onto a canvas and the
 * picture goes into the PDF. Returns null where there is no canvas (tests, servers): the line is simply left out.
 */
function odiaImage(text: string, widthMm: number, sizePt: number): { url: string; hMm: number } | null {
  const key = `${sizePt}|${widthMm}|${text}`;
  if (odiaCache.has(key)) return odiaCache.get(key) ?? null;
  let result: { url: string; hMm: number } | null = null;
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const fontPx = Math.round(sizePt * PT * PX_PER_MM * 1.05);
        const font = `700 ${fontPx}px "Noto Sans Oriya","Noto Sans Odia","Lohit Odia",Kalinga,"Oriya Sangam MN",sans-serif`;
        const maxW = Math.round(widthMm * PX_PER_MM);
        ctx.font = font;
        const lines: string[] = [];
        let line = '';
        for (const word of text.split(/\s+/).filter(Boolean)) {
          const trial = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(trial).width > maxW) {
            lines.push(line);
            line = word;
          } else line = trial;
        }
        if (line) lines.push(line);
        const lineH = Math.round(fontPx * 1.5);
        canvas.width = maxW;
        canvas.height = Math.max(1, lines.length) * lineH + 4;
        ctx.font = font; // resizing a canvas resets its state
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, 0, i * lineH + Math.round((lineH - fontPx) / 2)));
        result = { url: canvas.toDataURL('image/png'), hMm: canvas.height / PX_PER_MM };
      }
    }
  } catch {
    result = null;
  }
  odiaCache.set(key, result);
  return result;
}

/** Draws (or only measures, when draw=false) the rows; returns the y where the receipt ends. */
function paintRows(doc: jsPDF, rows: ReceiptRow[], draw: boolean): number {
  let y = 5;
  const lh = (size: number) => size * PT * 1.3;
  const font = (size: number, bold: boolean) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  };
  const lines = (text: string, width: number): string[] => doc.splitTextToSize(text, width) as string[];
  const put = (text: string, x: number, size: number, align: 'left' | 'center' | 'right') => {
    if (draw) doc.text(text, x, y + size * PT, { align });
  };

  doc.setTextColor(0, 0, 0);
  for (const r of rows) {
    switch (r.k) {
      case 'title': {
        font(12.5, true);
        for (const l of lines(r.text, CONTENT_W)) {
          put(l, PAGE_W / 2, 12.5, 'center');
          y += lh(12.5);
        }
        y += 0.5;
        break;
      }
      case 'center': {
        const size = r.small ? 7.2 : 8.5;
        font(size, !!r.bold);
        for (const l of lines(r.text, CONTENT_W)) {
          put(l, PAGE_W / 2, size, 'center');
          y += lh(size);
        }
        break;
      }
      case 'rule': {
        y += 1;
        if (draw) {
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.25);
          if (r.style === 'dash') {
            doc.setLineDashPattern([0.8, 0.8], 0);
            doc.line(MARGIN, y, PAGE_W - MARGIN, y);
            doc.setLineDashPattern([], 0);
          } else {
            doc.line(MARGIN, y, PAGE_W - MARGIN, y);
            doc.line(MARGIN, y + 0.6, PAGE_W - MARGIN, y + 0.6);
          }
        }
        y += r.style === 'double' ? 2.2 : 1.6;
        break;
      }
      case 'kv': {
        const size = r.big ? 11 : 8.3;
        font(size, !!r.bold);
        const rightW = doc.getTextWidth(r.right);
        if (rightW > CONTENT_W * 0.55) {
          for (const l of lines(r.left, CONTENT_W)) {
            put(l, MARGIN, size, 'left');
            y += lh(size);
          }
          put(r.right, PAGE_W - MARGIN, size, 'right');
          y += lh(size);
        } else {
          const left = lines(r.left, CONTENT_W - rightW - 2);
          put(r.right, PAGE_W - MARGIN, size, 'right');
          for (const l of left) {
            put(l, MARGIN, size, 'left');
            y += lh(size);
          }
        }
        break;
      }
      case 'item': {
        font(8.6, true);
        for (const l of lines(r.name, CONTENT_W)) {
          put(l, MARGIN, 8.6, 'left');
          y += lh(8.6);
        }
        if (r.nameOr) {
          const img = odiaImage(r.nameOr, CONTENT_W, 8.6);
          if (img) {
            if (draw) doc.addImage(img.url, 'PNG', MARGIN, y, CONTENT_W, img.hMm);
            y += img.hMm;
          }
          font(8.6, true); // addImage / measuring leave the font alone, but keep it explicit
        }
        font(8.2, false);
        put(r.qtyRate, MARGIN + 2, 8.2, 'left');
        font(8.4, true);
        put(r.amount, PAGE_W - MARGIN, 8.4, 'right');
        y += lh(8.4);
        if (r.note) {
          font(6.8, false);
          if (draw) doc.setTextColor(80, 80, 80);
          for (const l of lines(r.note, CONTENT_W - 2)) {
            put(l, MARGIN + 2, 6.8, 'left');
            y += lh(6.8);
          }
          if (draw) doc.setTextColor(0, 0, 0);
        }
        y += 0.9;
        break;
      }
      case 'wrap': {
        const size = r.small ? 7.2 : 8.3;
        font(size, !!r.bold);
        for (const l of lines(r.text, CONTENT_W)) {
          put(l, MARGIN, size, 'left');
          y += lh(size);
        }
        break;
      }
      case 'gap':
        y += 2;
        break;
      case 'qr': {
        const qr = qrcode(0, 'M');
        qr.addData(r.data);
        qr.make();
        const n = qr.getModuleCount();
        const size = 36; // mm including the 4-module quiet zone every scanner expects
        const cell = size / (n + 8);
        const x0 = (PAGE_W - size) / 2;
        if (draw) {
          doc.setFillColor(255, 255, 255);
          doc.rect(x0, y, size, size, 'F');
          doc.setFillColor(0, 0, 0);
          for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
              if (qr.isDark(row, col)) doc.rect(x0 + (col + 4) * cell, y + (row + 4) * cell, cell + 0.02, cell + 0.02, 'F');
            }
          }
        }
        y += size;
        if (r.caption) {
          font(8, true);
          put(r.caption, PAGE_W / 2, 8, 'center');
          y += lh(8);
        }
        break;
      }
    }
  }
  return y + 6;
}

export function generateReceiptPdf80(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
  options?: { showBatch?: boolean },
): jsPDF {
  const rows = buildReceiptRows(bill, org, settings, invoiceFormat, options);
  // Pass 1: measure on a tall scratch page. Pass 2: draw on a page exactly as tall as the receipt.
  const scratch = new jsPDF({ unit: 'mm', format: [PAGE_W, 3000] });
  const height = paintRows(scratch, rows, false);
  // jsPDF swaps a "portrait" page whose width is larger than its height, so never go below the width.
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_W, Math.max(Math.ceil(height), PAGE_W + 20)] });
  paintRows(doc, rows, true);
  return doc;
}

/* ====================================================================== */
/* Sharing a PDF through the phone's share sheet (WhatsApp is in it)        */
/* ====================================================================== */

/**
 * Opens the phone's share sheet with the PDF attached, so the person can pick WhatsApp (or anything else).
 * A plain wa.me link can only carry text, never a file; this is the only way a browser can hand over a file.
 * Returns 'shared', 'cancelled', or 'unsupported' (desktop browsers, older phones): the caller then
 * downloads the file instead.
 */
export async function sharePdfFile(
  doc: jsPDF,
  filename: string,
  title: string,
  text?: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof File === 'undefined' || !nav.share || !nav.canShare) return 'unsupported';
    const file = new File([doc.output('blob')], filename, { type: 'application/pdf' });
    if (!nav.canShare({ files: [file] })) return 'unsupported';
    await nav.share({ files: [file], title, text });
    return 'shared';
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}
