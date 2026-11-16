import type { Bill, BillingSettings, OrganizationProfile } from '../types';
import type { InvoicePdfOptions } from './invoicePdfMeta';

/**
 * Loads the PDF code (jsPDF, autotable, receipt drawing) on first use instead of at app start.
 * Call preloadInvoicePdf() when a screen that can print / share / download an invoice opens: once the code is
 * loaded, the functions below run synchronously, exactly as before (important for window.open / share sheet,
 * which browsers only allow right after a tap).
 */
type PdfModule = typeof import('./invoicePdf');
let loaded: PdfModule | null = null;
let loading: Promise<PdfModule> | null = null;

export function preloadInvoicePdf(): Promise<PdfModule> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = import('./invoicePdf').then((m) => {
      loaded = m;
      return m;
    }).catch((err) => {
      loading = null; // allow a retry after a failed (e.g. offline) load
      throw err;
    });
  }
  return loading;
}

type Fmt = 'gst' | 'non_gst';

export function downloadInvoicePdf(
  bill: Bill, org?: OrganizationProfile, settings?: BillingSettings, invoiceFormat?: Fmt, options?: InvoicePdfOptions,
): void | Promise<void> {
  if (loaded) return loaded.downloadInvoicePdf(bill, org, settings, invoiceFormat, options);
  return preloadInvoicePdf().then((m) => m.downloadInvoicePdf(bill, org, settings, invoiceFormat, options));
}

export function printInvoicePdf(
  bill: Bill, org?: OrganizationProfile, settings?: BillingSettings, invoiceFormat?: Fmt, options?: InvoicePdfOptions,
): void | Promise<void> {
  if (loaded) return loaded.printInvoicePdf(bill, org, settings, invoiceFormat, options);
  return preloadInvoicePdf().then((m) => m.printInvoicePdf(bill, org, settings, invoiceFormat, options));
}

export function shareInvoicePdf(
  bill: Bill, org?: OrganizationProfile, settings?: BillingSettings, invoiceFormat?: Fmt, options?: InvoicePdfOptions,
): Promise<'shared' | 'cancelled' | 'downloaded'> {
  if (loaded) return loaded.shareInvoicePdf(bill, org, settings, invoiceFormat, options);
  return preloadInvoicePdf().then((m) => m.shareInvoicePdf(bill, org, settings, invoiceFormat, options));
}
