import type { Bill, BillingSettings } from '../types';
import { formatBillNumber, isBillGstInvoice } from './invoiceCommon';

// Pure helpers (no jsPDF) shared by the PDF code and by screens that only need the paper / file name.

export type InvoicePaper = 'a4' | '80mm';
export type InvoicePdfOptions = { showBatch?: boolean; paper?: InvoicePaper };

/** Paper for the PDF: what the caller asked for, else Settings -> Billing, else A4. */
export function resolveInvoicePaper(settings?: BillingSettings, options?: InvoicePdfOptions): InvoicePaper {
  return options?.paper ?? (settings?.defaultInvoicePaper === '80mm' ? '80mm' : 'a4');
}

export function invoicePdfFilename(
  bill: Bill,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
  options?: InvoicePdfOptions
): string {
  const isGst = isBillGstInvoice(bill, invoiceFormat);
  const docNo = formatBillNumber(bill, settings, invoiceFormat);
  const cleanRetailer = (bill.retailer || 'Cash').replace(/[^a-zA-Z0-9_-]/g, '_');
  const paper = resolveInvoicePaper(settings, options) === '80mm' ? '_80mm' : '';
  return isGst
    ? `Tax_Invoice_${docNo}_${cleanRetailer}${paper}.pdf`
    : bill.docSeries === 'non_gst' || bill.gstExclude
      ? `Cash_Memo_${docNo}_${cleanRetailer}${paper}.pdf`
      : `Retail_Bill_${docNo}_${cleanRetailer}${paper}.pdf`;
}
