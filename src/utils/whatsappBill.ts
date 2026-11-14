/**
 * "Send the bill on WhatsApp" with the 80 mm receipt PDF attached.
 *
 * A plain wa.me link can only carry text, never a file. The only way a web app can hand a file to WhatsApp is the
 * phone's share sheet (Web Share API with files): the person taps WhatsApp there and picks the customer.
 * (The share sheet cannot pre-select the customer, that is a WhatsApp rule.)
 * Where the browser cannot share files (desktop), the PDF is downloaded and WhatsApp opens on the customer's number
 * with a short message, so the PDF can be attached with the paperclip.
 *
 * Call it straight from a click/tap handler (browsers only allow the share sheet right after a tap).
 */
import type { Bill, BillingSettings, OrganizationProfile } from '../types';
import { money, whatsappLink } from './billing';
import { buildInvoicePdf, invoicePdfFilename, isBillGstInvoice } from './invoicePdf';
import { sharePdfFile } from './receipt80';

export type WhatsAppBillResult = 'shared' | 'cancelled' | 'downloaded' | 'failed';

const PAPER = { paper: '80mm' as const };

/** Short caption that goes with the attached receipt (the receipt itself carries all the detail). */
export function buildWhatsAppCaption(bill: Bill, org?: OrganizationProfile, settings?: BillingSettings): string {
  const total = Number(bill.total) || 0;
  const paid = Number(bill.amountPaid) || 0;
  const due = Math.max(0, Math.round((total - paid) * 100) / 100);
  const name = org?.name || 'Hydrate Hub';
  const prefix = settings?.invoicePrefix || '';
  const no = prefix ? `${prefix}-${bill.id}` : `#${bill.id}`;
  const lines = [`${name}`, `Bill ${no}${bill.date ? ` · ${bill.date}` : ''}`];
  lines.push(`Total ₹${money(total)} · Paid ₹${money(paid)}${due > 0 ? ` · Due ₹${money(due)}` : ''}`);
  lines.push('Thank you!');
  return lines.join('\n');
}

export async function sendBillOnWhatsApp(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
): Promise<WhatsAppBillResult> {
  try {
    const doc = buildInvoicePdf(bill, org, settings, invoiceFormat, PAPER);
    const filename = invoicePdfFilename(bill, settings, invoiceFormat, PAPER);
    const isGst = isBillGstInvoice(bill, invoiceFormat);
    const caption = buildWhatsAppCaption(bill, org, settings);
    const title = `${isGst ? 'Tax Invoice' : 'Bill'} ${settings?.invoicePrefix ? settings.invoicePrefix + '-' : '#'}${bill.id} - ${bill.retailer || 'Cash'}`;

    const result = await sharePdfFile(doc, filename, title, caption);
    if (result !== 'unsupported') return result;

    // No file sharing here (desktop / older phone): save the PDF, then open WhatsApp on the customer's number.
    doc.save(filename);
    try {
      window.open(whatsappLink(bill.phone || '', caption + '\n(Receipt PDF attached)'), '_blank');
    } catch {
      // pop-up blocked: the PDF is saved anyway
    }
    return 'downloaded';
  } catch (err) {
    console.warn('[whatsapp] could not prepare the bill PDF:', err);
    return 'failed';
  }
}

/** Plain-words message for the toast after sendBillOnWhatsApp. Empty string = nothing to say. */
export function whatsAppResultMessage(result: WhatsAppBillResult): { text: string; kind: 'success' | 'info' | 'error' } | null {
  switch (result) {
    case 'downloaded':
      return { text: 'Receipt PDF saved. In WhatsApp, tap the paperclip and attach it.', kind: 'info' };
    case 'failed':
      return { text: 'Could not prepare the receipt PDF. Please try again.', kind: 'error' };
    default:
      return null;
  }
}
