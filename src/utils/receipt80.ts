import { jsPDF } from 'jspdf';
import qrcode from 'qrcode-generator';
import { Bill, BillingSettings, OrganizationProfile } from '../types';
import { buildReceiptRows, type ReceiptRow } from './receiptText';

// Everything that was exported from here before is still exported from here.
export * from './receiptText';

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
