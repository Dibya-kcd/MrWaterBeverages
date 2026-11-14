import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  MessageCircle,
  Printer,
  Share2,
  X,
  Edit,
  ArrowRight,
  Paperclip,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Bill } from '../../types';
import {
  money,
  freeStockInvoiceDisplay,
  cgstSgstLabels,
  normalizeTo8DigitHsn,
  statusOf,
  whatsappLink,
  nonGstSummary,
} from '../../utils/billing';
import {
  downloadInvoicePdf,
  inrToWords,
  printInvoicePdf,
  resolveInvoicePaper,
  shareInvoicePdf,
  type InvoicePaper,
} from '../../utils/invoicePdf';
import { billNetTotal } from '../../utils/salesReturns';
import { billTaxBreakdown } from '../../utils/gstReports';
import { buildBillMessage } from '../../utils/receipt80';
import { sendBillOnWhatsApp, whatsAppResultMessage } from '../../utils/whatsappBill';
import { notify } from '../../utils/toast';

interface TaxInvoiceModalProps {
  bill: Bill;
  onClose: () => void;
  defaultFormat?: 'gst' | 'non_gst';
  onEditBill?: (bill: Bill) => void;
}

export const TaxInvoiceModal: React.FC<TaxInvoiceModalProps> = ({
  bill,
  onClose,
  defaultFormat,
  onEditBill,
}) => {
  const { orgProfile, billingSettings, palette, fz, scale } = useLedger();
  const [downloading, setDownloading] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedInvoiceText, setCopiedInvoiceText] = useState(false);
  // Paper for Download / Print / Share PDF: starts from Settings -> Billing, can be switched here per invoice.
  const [paper, setPaper] = useState<InvoicePaper>(() => resolveInvoicePaper(billingSettings));
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  // Bills issued by a composition / unregistered business cannot be printed as a Tax Invoice.
  const formatLocked = Boolean(bill.taxStamp && bill.taxStamp.registrationType !== 'regular');
  const invoiceFormat: 'gst' | 'non_gst' = (() => {
    if (formatLocked) return 'non_gst';
    if (bill.invoiceType === 'retail' || bill.invoiceType === 'bill_of_supply' || bill.isGstInvoice === false) {
      return 'non_gst';
    }
    if (bill.invoiceType === 'tax_invoice' || bill.isGstInvoice === true) {
      return 'gst';
    }
    if (defaultFormat) return defaultFormat;
    return bill.supplyType === 'B2B' && Boolean(bill.customerGstin) ? 'gst' : 'non_gst';
  })();
  const isGst = invoiceFormat === 'gst';
  // Per-line GST and the tax summary by HSN / rate
  const taxBreakdown = isGst ? billTaxBreakdown(bill, []) : null;
  // Tax-inclusive summary used by the Non-GST (B2C) copy
  const nonGst = nonGstSummary(bill);

  const status = statusOf(billNetTotal(bill), bill.amountPaid);
  const prefix = billingSettings?.invoicePrefix || (isGst ? 'INV' : 'RET');
  const invoiceNo = `${prefix}-${bill.id}`;
  const supplyLabel = bill.supplyType === 'B2B' && bill.customerGstin ? 'B2B' : 'B2C';
  const orgName = orgProfile?.name || 'MrWater';
  const orgAddress = orgProfile?.address
    ? `${orgProfile.address}, ${orgProfile.city || 'Sambalpur'}`
    : 'Main Godown Yard, Sambalpur';
  const orgPhone = orgProfile?.phone || '';
  const orgGstin = orgProfile?.gstin || '';
  const orgFssai = orgProfile?.fssai || '';
  const upiId = orgProfile?.upiId || '';

  const stateName = orgProfile?.state || (orgProfile?.gstin?.startsWith('21') ? 'Odisha' : 'Odisha');
  const stateCode = orgProfile?.stateCode || (orgProfile?.gstin ? orgProfile.gstin.slice(0, 2) : '21');
  const buyerStateCode =
    bill.customerGstin && bill.customerGstin.length >= 2
      ? bill.customerGstin.slice(0, 2)
      : stateCode;
  const buyerStateName = buyerStateCode === '21' ? 'Odisha' : stateName;

  const handleDownload = () => {
    setDownloading(true);
    try {
      downloadInvoicePdf(bill, orgProfile, billingSettings, invoiceFormat, { showBatch: false, paper });
    } catch (err) {
      console.error('Error downloading invoice PDF:', err);
    } finally {
      setTimeout(() => setDownloading(false), 1200);
    }
  };

  const handlePrint = () => {
    // A4 prints the on-screen invoice as before; the 80 mm receipt prints its own narrow PDF.
    if (paper === '80mm') {
      printInvoicePdf(bill, orgProfile, billingSettings, invoiceFormat, { showBatch: false, paper });
      return;
    }
    window.print();
  };

  // Opens the phone's share sheet with the PDF attached (choose WhatsApp there). A wa.me link can only carry
  // text, so this is the way to forward the actual file. Browsers that cannot share files get a download.
  const handleSharePdf = async () => {
    setSharing(true);
    setShareNote(null);
    try {
      const result = await shareInvoicePdf(bill, orgProfile, billingSettings, invoiceFormat, { showBatch: false, paper });
      if (result === 'downloaded') {
        setShareNote('This browser cannot attach files directly, so the PDF was saved. Attach it in WhatsApp from your downloads.');
      } else if (result === 'shared') {
        setShowShareModal(false);
      }
    } catch (err) {
      console.error('Error sharing invoice PDF:', err);
      setShareNote('Could not open the share sheet. Try Download PDF instead.');
    } finally {
      setSharing(false);
    }
  };

  const handleCopyUpi = () => {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleNativeShare = async () => {
    const text = buildBillMessage(bill, orgProfile, billingSettings, invoiceFormat);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${isGst ? 'Tax Invoice' : 'Retail Bill'} #${invoiceNo} — ${bill.retailer}`,
          text,
        });
      } catch (err) {
        // User cancelled or share failed
      }
    } else {
      window.open(whatsappLink(bill.phone, text), '_blank');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${isGst ? 'Tax Invoice' : 'Retail Bill'} ${invoiceNo}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white text-slate-900 border-2 w-full max-w-4xl shadow-2xl flex flex-col my-auto max-h-[94vh] print:max-h-none print:shadow-none print:border-0 print:w-full rounded-2xl overflow-hidden"
        style={{ borderColor: palette.line }}
      >
        {/* =====================================================================
            TOP HEADER (Invoice #, Status, Edit & Share Controls, Close)
            ===================================================================== */}
        <div
          className="px-3 sm:px-5 py-2.5 border-b flex items-center justify-between gap-2 bg-slate-50 print:hidden select-none shrink-0"
          style={{ borderColor: palette.line }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <FileText size={Math.round(18 * scale)} className="text-slate-700 shrink-0" aria-hidden="true" />
            <span className="font-extrabold text-xs sm:text-base text-slate-900 font-mono truncate">
              #{invoiceNo}
            </span>
            <span
              className="px-1.5 py-0.5 text-[10px] sm:text-xs font-bold uppercase rounded border shrink-0"
              style={{
                backgroundColor:
                  status.balance <= 0 ? '#10804315' : status.balance === bill.total ? '#B4282815' : '#D9770615',
                borderColor:
                  status.balance <= 0 ? '#108043' : status.balance === bill.total ? '#B42828' : '#D97706',
                color:
                  status.balance <= 0 ? '#108043' : status.balance === bill.total ? '#B42828' : '#D97706',
              }}
            >
              {status.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Edit Button on Top */}
            {onEditBill && (
              <button
                type="button"
                onClick={() => onEditBill(bill)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold bg-white hover:bg-slate-100 text-slate-800 text-xs cursor-pointer shadow-2xs transition-colors"
                title="Edit this invoice"
                id="invoice-modal-top-edit-btn"
              >
                <Edit size={13} className="text-amber-600" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}

            {/* Share Button on Top (opens WhatsApp, Print, Download PDF) */}
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-xs cursor-pointer transition-transform"
              title="Share, print or download invoice"
              id="invoice-modal-top-share-btn"
            >
              <Share2 size={13} />
              <span>Share</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice preview"
              className="p-1.5 rounded-lg border border-slate-300 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              style={{ borderColor: palette.line }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* =====================================================================
            SCROLLABLE INVOICE SHEET (Responsive: Fits Mobile & Desktop cleanly)
            ===================================================================== */}
        <div className="overflow-y-auto p-2 sm:p-4 md:p-6 print:p-0 print:overflow-visible flex-1">
          <div
            id="printable-tax-invoice"
            className="border-2 p-3 sm:p-5 md:p-7 lg:p-8 bg-white text-slate-900 font-sans print:border-0 print:p-0 rounded-xl"
            style={{ borderColor: palette.line }}
          >
            {/* 1. Header Firm Info */}
            <div
              className="flex flex-col sm:flex-row justify-between items-start border-b-2 pb-4 sm:pb-5 gap-3 sm:gap-4"
              style={{ borderColor: palette.line }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xl sm:text-3xl font-black tracking-tight text-slate-900 leading-tight">
                  {orgName.toUpperCase()}
                </div>
                <div className="text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">
                  {orgProfile?.tagline || 'Authorized Wholesale Beverage Distributor'}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-600 mt-1 space-y-0.5">
                  <div>{orgAddress}</div>
                  <div>
                    Phone / WhatsApp: <span className="font-semibold text-slate-800">{orgPhone}</span>
                  </div>
                  {orgProfile?.email && <div>Email: {orgProfile.email}</div>}
                </div>
              </div>

              <div className="text-left sm:text-right flex flex-col sm:items-end shrink-0">
                <div
                  className={`inline-block font-black text-xs sm:text-sm px-2.5 sm:px-3 py-1 tracking-wider uppercase rounded-xs text-white ${
                    isGst ? 'bg-amber-600' : 'bg-emerald-700'
                  }`}
                >
                  {isGst ? 'TAX INVOICE' : 'RETAIL BILL / BILL OF SUPPLY'}
                </div>
                <div className="text-[10.5px] sm:text-xs text-slate-500 font-medium mt-1">
                  {isGst ? '(Original for Recipient · Rule 46)' : '(Non-GST / B2C Cash Memo)'}
                </div>
                <div className="mt-1.5 text-[10.5px] sm:text-xs font-mono font-bold bg-slate-100 border px-2 py-0.5 text-slate-800 rounded">
                  {isGst
                    ? `GSTIN: ${orgGstin || 'Unregistered'} · Supply: ${supplyLabel}`
                    : `Supply: B2C Retail Cash Memo`}
                </div>
                {orgFssai && (
                  <div className="text-[10.5px] sm:text-xs text-slate-600 font-medium mt-0.5">
                    FSSAI Lic: <span className="font-mono">{orgFssai}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Bill To & Invoice Credentials Grid */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 py-3 sm:py-4 border-b-2 text-xs sm:text-sm"
              style={{ borderColor: palette.line }}
            >
              <div className="p-2.5 sm:p-3 bg-slate-50 border rounded-lg">
                <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Billed To (Party Details)
                </div>
                <div className="text-sm sm:text-base font-black text-slate-900 truncate">
                  {bill.retailer || 'Cash Retailer'}
                </div>
                {bill.phone ? (
                  <div className="text-slate-700 text-xs mt-0.5">
                    Contact: <span className="font-semibold font-mono">{bill.phone}</span>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs mt-0.5 italic">Counter Cash Sale</div>
                )}
                {isGst && bill.customerGstin ? (
                  <div className="text-slate-900 text-[11px] mt-1 font-mono font-bold text-sky-900 bg-sky-50 px-1.5 py-0.5 border border-sky-200 rounded inline-block">
                    Buyer GSTIN: {bill.customerGstin}
                  </div>
                ) : (
                  <div className="text-slate-600 text-[11px] mt-0.5">
                    Supply: <span className="font-medium text-slate-800">{isGst ? 'B2C / Unregistered' : 'Retail Consumer'}</span>
                  </div>
                )}
                <div className="text-slate-600 text-[11px] mt-0.5">
                  Place of Supply: <span className="font-medium text-slate-800">{buyerStateName} ({buyerStateCode})</span>
                </div>
              </div>

              <div className="p-2.5 sm:p-3 bg-slate-50 border rounded-lg flex flex-col justify-between">
                <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Invoice Details
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">{isGst ? 'Invoice No:' : 'Bill No:'}</span>
                    <div className="font-mono font-bold text-slate-900 text-xs sm:text-sm">{invoiceNo}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">Date:</span>
                    <div className="font-bold text-slate-900">{bill.date}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">Terms:</span>
                    <div className="font-semibold text-slate-800">Cash / Immediate</div>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10.5px]">Status:</span>
                    <span
                      className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded"
                      style={{
                        backgroundColor: status.balance <= 0 ? '#10804320' : '#B4282820',
                        color: status.balance <= 0 ? '#108043' : '#B42828',
                      }}
                    >
                      {status.label.toUpperCase()} (₹{money(bill.amountPaid)})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Items Presentation — Mobile-Optimized List & Desktop Tabular Grid */}
            {/* Desktop Table (Visible on sm+ and when printing) */}
            <div className="hidden sm:block print:block py-3 sm:py-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[840px] text-left data-table border-collapse border text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-xs uppercase tracking-wider">
                    <th className="p-2 border text-center w-8 whitespace-nowrap">#</th>
                    <th className="p-2 border min-w-[180px] whitespace-normal">Description of Goods</th>
                    {isGst && <th className="p-2 border text-center w-14 whitespace-nowrap">HSN</th>}
                    <th className="p-2 border text-center w-16 whitespace-nowrap">Total Crates</th>
                    <th className="p-2 border text-center w-16 whitespace-nowrap">Free (Incl.)</th>
                    <th className="p-2 border text-right w-18 whitespace-nowrap">Rate (₹)</th>
                    <th className="p-2 border text-right w-20 whitespace-nowrap">Gross (₹)</th>
                    <th className="p-2 border text-right w-18 whitespace-nowrap">{isGst ? 'Scheme (₹)' : 'Discount (₹)'}</th>
                    {isGst && <th className="p-2 border text-center w-14 whitespace-nowrap">GST %</th>}
                    {isGst && <th className="p-2 border text-right w-20 whitespace-nowrap">GST (₹)</th>}
                    <th className="p-2 border text-right w-22 whitespace-nowrap">{isGst ? 'Total (₹)' : 'Net Total (₹)'}</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.items.map((it, idx) => {
                    const d = freeStockInvoiceDisplay(it);
                    return (
                      <tr
                        key={it.key || `item_row_${idx}`}
                        className={`border-b hover:bg-slate-50 ${d.isFreeStock ? 'bg-emerald-50/60' : ''}`}
                      >
                        <td className="p-2 border text-center text-slate-500 font-mono whitespace-nowrap">{idx + 1}</td>
                        <td className="p-2 border font-semibold text-slate-900 min-w-[180px]">
                          {it.productName}
                          {d.isFreeStock ? (
                            <div className="mt-0.5">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-emerald-600 text-white">
                                Free stock · 100% discount
                              </span>
                              {d.schemeNote && (
                                <div className="text-xs font-bold text-emerald-800 mt-0.5">{d.schemeNote}</div>
                              )}
                            </div>
                          ) : it.freeQty > 0 ? (
                            <div className="mt-0.5">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-emerald-700 text-white">
                                Includes {it.freeQty} free of {it.qty} crates ({it.chargeableQty} billed + {it.freeQty} free)
                              </span>
                            </div>
                          ) : it.promoLabel && it.discount > 0 ? (
                            <div className="text-xs font-semibold text-amber-700 mt-0.5">
                              ★ {it.promoLabel} (scheme discount)
                            </div>
                          ) : null}
                        </td>
                        {isGst && (
                          <td className="p-2 border text-center text-slate-600 font-mono font-semibold whitespace-nowrap">
                            {normalizeTo8DigitHsn(it.hsn || taxBreakdown?.lines[idx]?.hsn, it.category, it.productName)}
                          </td>
                        )}
                        <td className="p-2 border text-center font-bold text-slate-900 font-mono whitespace-nowrap">{it.qty}</td>
                        <td className="p-2 border text-center font-mono font-bold text-emerald-800 whitespace-nowrap">
                          {d.isFreeStock ? d.freeLabel : it.freeQty > 0 ? `${it.freeQty} incl.` : '—'}
                        </td>
                        <td className="p-2 border text-right font-mono whitespace-nowrap">₹{money(d.rate)}</td>
                        <td className="p-2 border text-right font-mono whitespace-nowrap">₹{money(d.gross)}</td>
                        <td className="p-2 border text-right font-mono text-amber-800 font-bold whitespace-nowrap">
                          {d.isFreeStock
                            ? `100% (−₹${money(d.discount)})`
                            : d.discount > 0
                              ? `−₹${money(d.discount)}`
                              : '—'}
                        </td>
                        {isGst && (
                          <td className="p-2 border text-center font-mono text-slate-600 whitespace-nowrap">
                            {!d.isFreeStock && (taxBreakdown?.lines[idx]?.ratePct || 0) > 0 ? `${taxBreakdown!.lines[idx].ratePct}%` : '—'}
                          </td>
                        )}
                        {isGst && (
                          <td className="p-2 border text-right font-mono text-slate-700 whitespace-nowrap">
                            {!d.isFreeStock && (taxBreakdown?.lines[idx]?.tax || 0) > 0 ? `₹${money(taxBreakdown!.lines[idx].tax)}` : '—'}
                          </td>
                        )}
                        <td className={`p-2 border text-right font-bold font-mono whitespace-nowrap ${d.isFreeStock ? 'text-emerald-700' : 'text-slate-900'}`}>
                          {d.isFreeStock ? '₹0.00 FREE' : `₹${money(d.amount)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs sm:text-sm">
                    <td colSpan={isGst ? 3 : 2} className="p-2 border text-right font-black text-slate-800 uppercase tracking-wide whitespace-nowrap">
                      Total Crates Delivered:
                    </td>
                    <td className="p-2 border text-center font-mono font-black text-slate-900 bg-emerald-50 whitespace-nowrap">
                      {bill.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0)} cs
                    </td>
                    <td className="p-2 border text-center font-mono font-bold text-emerald-800 bg-emerald-50/70 whitespace-nowrap">
                      {(() => {
                        const freeSum = bill.items.reduce((sum, it) => sum + (Number(it.freeQty) || 0), 0);
                        return freeSum > 0 ? `${freeSum} incl.` : '—';
                      })()}
                    </td>
                    <td colSpan={isGst ? 5 : 2} className="p-2 border"></td>
                    <td className="p-2 border text-right font-mono font-black text-slate-900 whitespace-nowrap">
                      ₹{money(bill.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile-Fitted Items View (Visible on mobile screens, hidden in print & desktop) */}
            <div className="block sm:hidden print:hidden py-3 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 pb-1 border-b">
                Items ({bill.items.length}) · Total {bill.items.reduce((s, i) => s + (Number(i.qty) || 0), 0)} Crates
              </div>

              {bill.items.map((it, idx) => {
                const d = freeStockInvoiceDisplay(it);
                const lineTax = taxBreakdown?.lines[idx];
                return (
                  <div
                    key={it.key || `m_item_${idx}`}
                    className={`p-2.5 rounded-xl border text-xs space-y-1.5 ${
                      d.isFreeStock ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50/80 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-slate-900 block leading-tight">
                          {idx + 1}. {it.productName}
                        </span>
                        {d.isFreeStock ? (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-black bg-emerald-600 text-white uppercase">
                            Free Stock (100% off)
                          </span>
                        ) : it.freeQty > 0 ? (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {it.freeQty} free of {it.qty} cs ({it.chargeableQty} paid)
                          </span>
                        ) : it.promoLabel && it.discount > 0 ? (
                          <span className="text-[10px] font-semibold text-amber-700 block">
                            ★ {it.promoLabel}
                          </span>
                        ) : null}
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-black text-xs text-slate-900 block">
                          {d.isFreeStock ? '₹0.00 FREE' : `₹${money(d.amount)}`}
                        </span>
                        {d.discount > 0 && !d.isFreeStock && (
                          <span className="text-[10px] font-mono text-emerald-700 font-bold block">
                            −₹{money(d.discount)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 font-mono">
                      <span>
                        {it.qty} cs × ₹{money(d.rate)}
                      </span>
                      {isGst && lineTax && lineTax.ratePct > 0 && (
                        <span>
                          GST {lineTax.ratePct}% (₹{money(lineTax.tax)})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 4. GST Tax Breakdown Table by HSN (Situated at bottom of invoice) */}
            {taxBreakdown && taxBreakdown.isTaxed && taxBreakdown.summary.length > 0 && (
              <div className="mt-3.5 rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-700">
                  <span className="uppercase tracking-wider">GST Tax Breakdown (by HSN / SAC)</span>
                  <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">Values rounded as per GST Rule 46</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left border-collapse text-xs" aria-label="GST summary by HSN and rate">
                    <thead>
                      <tr className="bg-slate-800 text-white font-bold uppercase tracking-wider text-[10.5px]">
                        <th className="px-3 py-2 border-r border-slate-700 whitespace-nowrap">HSN / SAC</th>
                        <th className="px-3 py-2 border-r border-slate-700 text-center whitespace-nowrap">Rate</th>
                        <th className="px-3 py-2 border-r border-slate-700 text-center whitespace-nowrap">Cases</th>
                        <th className="px-3 py-2 border-r border-slate-700 text-right whitespace-nowrap">Taxable (₹)</th>
                        <th className="px-3 py-2 border-r border-slate-700 text-right whitespace-nowrap">CGST (₹)</th>
                        <th className="px-3 py-2 border-r border-slate-700 text-right whitespace-nowrap">SGST (₹)</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">Total GST (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {taxBreakdown.summary.map((r) => (
                        <tr key={`${r.hsn}|${r.ratePct}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-2 border-r border-slate-200 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {r.hsn}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200 text-center font-mono font-semibold text-slate-700 whitespace-nowrap">
                            {r.ratePct > 0 ? `${r.ratePct}%` : '0%'}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                            {r.qty}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                            ₹{money(r.taxable)}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                            ₹{money(r.cgst)}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                            ₹{money(r.sgst)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-emerald-800 bg-emerald-50/40 whitespace-nowrap">
                            ₹{money(r.tax)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                        <td className="px-3 py-2.5 border-r border-slate-300 uppercase tracking-wide text-[11px] whitespace-nowrap" colSpan={2}>
                          Total Taxable &amp; Tax:
                        </td>
                        <td className="px-3 py-2.5 border-r border-slate-300 text-center font-mono font-black whitespace-nowrap">
                          {taxBreakdown.summary.reduce((a, r) => a + r.qty, 0)}
                        </td>
                        <td className="px-3 py-2.5 border-r border-slate-300 text-right font-mono tabular-nums font-black whitespace-nowrap">
                          ₹{money(taxBreakdown.summary.reduce((a, r) => a + r.taxable, 0))}
                        </td>
                        <td className="px-3 py-2.5 border-r border-slate-300 text-right font-mono tabular-nums font-black whitespace-nowrap">
                          ₹{money(taxBreakdown.summary.reduce((a, r) => a + r.cgst, 0))}
                        </td>
                        <td className="px-3 py-2.5 border-r border-slate-300 text-right font-mono tabular-nums font-black whitespace-nowrap">
                          ₹{money(taxBreakdown.summary.reduce((a, r) => a + r.sgst, 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-black text-emerald-900 bg-emerald-100/60 whitespace-nowrap">
                          ₹{money(taxBreakdown.summary.reduce((a, r) => a + r.tax, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. Bottom Grid: Words & Bank (Left) + Totals Breakdown (Right) */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-3 mt-3 border-t-2"
              style={{ borderColor: palette.line }}
            >
              {/* Left Column: Words & Bank */}
              <div className="space-y-2.5">
                <div className="p-2.5 sm:p-3 bg-slate-50 border rounded-lg text-xs">
                  <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Amount Chargeable (in words)
                  </div>
                  <div className="font-bold text-slate-900 italic text-xs sm:text-sm">
                    {inrToWords(bill.total)}
                  </div>
                </div>

                <div className="p-2.5 sm:p-3 bg-slate-50 border rounded-lg text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Bank & Digital Settlement
                    </span>
                    {upiId && (
                      <button
                        type="button"
                        onClick={handleCopyUpi}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:underline cursor-pointer"
                      >
                        {copiedUpi ? <Check size={12} /> : <Copy size={12} />}
                        {copiedUpi ? 'Copied!' : 'Copy UPI'}
                      </button>
                    )}
                  </div>
                  <div className="font-semibold text-slate-900">
                    UPI ID: <span className="font-mono font-bold text-blue-800">{upiId || '—'}</span>
                  </div>
                  {orgProfile?.bankName && (
                    <div className="text-slate-700 text-[11px] mt-0.5">
                      Bank: {orgProfile.bankName} | A/c: <span className="font-mono">{orgProfile.accountNumber || '—'}</span> | IFSC: <span className="font-mono">{orgProfile.ifsc || '—'}</span>
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Scan via Google Pay, PhonePe, Paytm, or BHIM.
                  </div>
                </div>
              </div>

              {/* Right Column: Financial Breakdown */}
              <div className="border rounded-lg p-2.5 sm:p-3 bg-slate-50 text-xs sm:text-sm space-y-1.5">
                <div className="flex justify-between text-slate-900 font-bold pb-1 border-b text-xs">
                  <span>Total Crates Delivered:</span>
                  <span className="font-mono font-black text-slate-900">
                    {bill.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0)} Crates
                    {(() => {
                      const freeSum = bill.items.reduce((sum, it) => sum + (Number(it.freeQty) || 0), 0);
                      return freeSum > 0 ? ` (${freeSum} free incl.)` : '';
                    })()}
                  </span>
                </div>

                {isGst ? (
                  <>
                    <div className="flex justify-between text-slate-700 text-xs">
                      <span>Taxable Value:</span>
                      <span className="font-mono font-semibold">₹{money(bill.subtotal)}</span>
                    </div>

                    {bill.additionalDiscount && bill.additionalDiscount > 0 ? (
                      <div className="flex justify-between font-semibold text-rose-700 text-xs">
                        <span>Special Invoice Discount:</span>
                        <span className="font-mono">−₹{money(bill.additionalDiscount)}</span>
                      </div>
                    ) : null}

                    {bill.discount > (bill.additionalDiscount || 0) && (
                      <div className="flex justify-between font-semibold text-amber-700 text-xs">
                        <span>Trade Scheme Savings:</span>
                        <span className="font-mono">−₹{money(bill.discount - (bill.additionalDiscount || 0))}</span>
                      </div>
                    )}

                    {(bill.cgst > 0 || bill.sgst > 0) && (
                      <>
                        <div className="flex justify-between text-slate-600 text-xs">
                          <span>{cgstSgstLabels(bill.items || []).cgst}:</span>
                          <span className="font-mono">₹{money(bill.cgst)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600 text-xs">
                          <span>{cgstSgstLabels(bill.items || []).sgst}:</span>
                          <span className="font-mono">₹{money(bill.sgst)}</span>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-700 text-xs">
                      <span>Items Value:</span>
                      <span className="font-mono font-semibold">₹{money(nonGst.itemsValue)}</span>
                    </div>
                    {nonGst.schemeDiscount > 0 && (
                      <div className="flex justify-between font-semibold text-amber-700 text-xs">
                        <span>Trade Scheme Savings:</span>
                        <span className="font-mono">−₹{money(nonGst.schemeDiscount)}</span>
                      </div>
                    )}
                    {nonGst.specialDiscount > 0 && (
                      <div className="flex justify-between font-semibold text-rose-700 text-xs">
                        <span>Special Discount:</span>
                        <span className="font-mono">−₹{money(nonGst.specialDiscount)}</span>
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-between items-center pt-1.5 border-t-2 text-sm sm:text-base font-black text-slate-900">
                  <span>{isGst ? 'Total Invoice Value:' : 'Net Total Payable:'}</span>
                  <span className="font-mono text-base sm:text-lg" style={{ color: isGst ? palette.navy : '#047857' }}>
                    ₹{money(bill.total)}
                  </span>
                </div>

                <div className="flex justify-between text-slate-700 pt-1 border-t text-xs">
                  <span>Amount Paid / Received:</span>
                  <span className="font-mono font-semibold text-emerald-700">₹{money(bill.amountPaid)}</span>
                </div>

                <div className="flex justify-between items-center text-xs sm:text-sm font-bold pt-1">
                  <span>Balance Outstanding:</span>
                  <span
                    className="font-mono text-sm sm:text-base font-black"
                    style={{ color: status.balance > 0 ? '#B42828' : '#108043' }}
                  >
                    ₹{money(status.balance)}
                  </span>
                </div>
              </div>
            </div>

            {/* 6. Terms & Signatory Footer */}
            <div
              className="mt-5 pt-3 border-t-2 flex flex-col sm:flex-row justify-between items-end gap-4 text-xs text-slate-600"
              style={{ borderColor: palette.line }}
            >
              <div className="max-w-md">
                <div className="font-bold text-slate-800 uppercase text-[10px] sm:text-[11px] mb-0.5">
                  Terms & Conditions:
                </div>
                <p className="whitespace-pre-line leading-relaxed text-[10px] sm:text-[11px] text-slate-600">
                  {orgProfile?.invoiceTerms ||
                    '1. Goods once sold will not be taken back or exchanged.\n2. Payment strictly on delivery or agreed credit period.\n3. Empty glass bottles/crates must be returned in good condition.\n4. All disputes subject to local jurisdiction only.'}
                </p>
              </div>

              <div className="text-right sm:min-w-44">
                <div className="font-bold text-slate-900 text-xs uppercase">
                  For {orgName.toUpperCase()}
                </div>
                <div className="h-10 flex items-end justify-end">
                  <div className="border-b border-dashed border-slate-400 w-32"></div>
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 font-semibold mt-0.5">
                  Authorized Signatory
                </div>
              </div>
            </div>

            <div className="text-center text-[10px] text-slate-400 mt-4 pt-2 border-t">
              {isGst
                ? 'This is a Computer Generated Tax Invoice. E. & O.E.'
                : bill.taxStamp?.declaration
                  ? `${bill.taxStamp.declaration}. Computer generated Bill of Supply.`
                  : 'This is a Computer Generated Retail Bill of Supply (Non-GST / B2C). Thank You for Your Business!'}
            </div>
          </div>
        </div>
        {/* =====================================================================
            BOTTOM BAR (Issued Document Type Badge & Share Action)
            ===================================================================== */}
        <div
          className="px-4 py-3 bg-slate-50 border-t-2 flex items-center justify-between gap-3 shrink-0 print:hidden select-none"
          style={{ borderColor: palette.line }}
        >
          {/* Read-only issued document type badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`px-2 h-7 rounded-lg flex items-center justify-center font-black text-[10px] tracking-wide border shrink-0 ${
                isGst
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}
            >
              {isGst ? 'GST' : bill.taxStamp ? 'BOS' : 'CASH'}
            </div>
            <span className="text-xs font-bold text-slate-800 truncate">
              {isGst
                ? 'GST Tax Invoice'
                : bill.taxStamp?.registrationType === 'composition'
                  ? 'Bill of Supply · Composition'
                  : bill.taxStamp?.registrationType === 'unregistered'
                    ? 'Bill of Supply · Unregistered'
                    : bill.invoiceType === 'bill_of_supply'
                      ? 'Bill of Supply'
                      : 'Non-GST Retail Bill'}
            </span>
          </div>

          {/* Quick Share action button */}
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-xs cursor-pointer transition-transform shrink-0"
            id="invoice-modal-bottom-share-btn"
          >
            <Share2 size={14} />
            <span>Share &amp; Print</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          SHARE & EXPORT MODAL (WhatsApp, Download PDF, Print, Copy Text)
          ===================================================================== */}
      {showShareModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-white rounded-2xl border-2 shadow-2xl w-full max-w-sm overflow-hidden p-4 space-y-3 animate-fadeIn"
            style={{ borderColor: palette.line }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Share2 size={18} className="text-emerald-600" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  Share &amp; Export Invoice
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Close share sheet"
              >
                <X size={16} />
              </button>
            </div>

            {/* Paper size for the PDF buttons below */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">PDF paper size</div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200" role="group" aria-label="PDF paper size">
                {([['a4', 'A4 invoice'], ['80mm', '80 mm receipt']] as [InvoicePaper, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPaper(key)}
                    aria-pressed={paper === key}
                    id={`share-paper-${key}`}
                    className={`min-h-[40px] rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      paper === key ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {/* WhatsApp Button */}
              <button
                type="button"
                onClick={async () => {
                  setShowShareModal(false);
                  const msg = whatsAppResultMessage(await sendBillOnWhatsApp(bill, orgProfile, billingSettings, invoiceFormat));
                  if (msg) notify(msg.text, msg.kind);
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs sm:text-sm flex items-center justify-between cursor-pointer transition-colors shadow-2xs"
                id="share-modal-whatsapp-link"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#25D366] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <MessageCircle size={18} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-slate-900">Send via WhatsApp</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      {bill.phone ? `To ${bill.retailer} (${bill.phone})` : 'Send to contact / number'}
                      {' · 80 mm receipt PDF attached'}
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} className="text-emerald-700" />
              </button>

              {/* Forward the PDF file itself (phone share sheet -> WhatsApp) */}
              <button
                type="button"
                onClick={handleSharePdf}
                disabled={sharing}
                className="w-full py-2.5 px-3 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 font-bold text-xs sm:text-sm flex items-center justify-between cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                id="share-modal-pdf-share-btn"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Paperclip size={18} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-slate-900">Share PDF file</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      {paper === '80mm' ? '80 mm receipt' : 'A4 invoice'} · pick WhatsApp in the share sheet
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} className="text-emerald-700" />
              </button>
              {shareNote && (
                <p role="status" className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  {shareNote}
                </p>
              )}

              {/* Download PDF Button */}
              <button
                type="button"
                onClick={() => {
                  handleDownload();
                  setShowShareModal(false);
                }}
                disabled={downloading}
                className="w-full py-2.5 px-3 rounded-xl border border-blue-200 bg-sky-50 hover:bg-sky-100 text-sky-950 font-bold text-xs sm:text-sm flex items-center justify-between cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                id="share-modal-pdf-btn"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Download size={18} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-slate-900">Download PDF</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      {paper === '80mm' ? '80 mm receipt' : isGst ? 'Official GST Tax Invoice' : 'Retail Bill of Supply'} PDF
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} className="text-sky-700" />
              </button>

              {/* Print Button */}
              <button
                type="button"
                onClick={() => {
                  setShowShareModal(false);
                  setTimeout(() => handlePrint(), 250);
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900 font-bold text-xs sm:text-sm flex items-center justify-between cursor-pointer transition-colors shadow-2xs"
                id="share-modal-print-btn"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Printer size={18} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-slate-900">Print Invoice</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      {paper === '80mm' ? 'Print the 80 mm receipt (thermal printer)' : 'Send to printer or save thermal slip'}
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} className="text-slate-600" />
              </button>

              {/* Copy Text / Native Share */}
              <button
                type="button"
                onClick={() => {
                  const text = buildBillMessage(bill, orgProfile, billingSettings, invoiceFormat);
                  navigator.clipboard.writeText(text);
                  setCopiedInvoiceText(true);
                  setTimeout(() => setCopiedInvoiceText(false), 2000);
                }}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                id="share-modal-copy-btn"
              >
                {copiedInvoiceText ? (
                  <>
                    <Check size={14} className="text-emerald-600" />
                    <span className="text-emerald-700">Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copy Invoice Summary Text</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
