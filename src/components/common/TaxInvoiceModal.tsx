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
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Bill } from '../../types';
import { buildBillText, money, statusOf, whatsappLink } from '../../utils/billing';
import { downloadInvoicePdf, inrToWords } from '../../utils/invoicePdf';

interface TaxInvoiceModalProps {
  bill: Bill;
  onClose: () => void;
}

export const TaxInvoiceModal: React.FC<TaxInvoiceModalProps> = ({ bill, onClose }) => {
  const { orgProfile, billingSettings, palette, fz, scale } = useLedger();
  const [downloading, setDownloading] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const status = statusOf(bill.total, bill.amountPaid);
  const prefix = billingSettings?.invoicePrefix || 'INV';
  const invoiceNo = `${prefix}-${bill.id}`;
  const orgName = orgProfile?.name || 'RADHIKA BEVERAGES';
  const orgAddress = orgProfile?.address
    ? `${orgProfile.address}, ${orgProfile.city || ''}`
    : 'Depot Area, Station Road';
  const orgPhone = orgProfile?.phone || '+91 98765 43210';
  const orgGstin = orgProfile?.gstin || '24AAACR1234F1Z8';
  const orgFssai = orgProfile?.fssai || '10020011000123';
  const upiId = orgProfile?.upiId || 'radhikabev@upi';

  const handleDownload = () => {
    setDownloading(true);
    try {
      downloadInvoicePdf(bill, orgProfile, billingSettings);
    } catch (err) {
      console.error('Error downloading invoice PDF:', err);
    } finally {
      setTimeout(() => setDownloading(false), 1200);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyUpi = () => {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleNativeShare = async () => {
    const text = buildBillText(bill, orgProfile, billingSettings);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Tax Invoice #${invoiceNo} — ${bill.retailer}`,
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
      aria-label={`Tax Invoice ${invoiceNo}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white text-slate-900 border-2 w-full max-w-4xl shadow-2xl flex flex-col my-auto max-h-[92vh] print:max-h-none print:shadow-none print:border-0 print:w-full"
        style={{ borderColor: palette.line }}
      >
        {/* Top Control Bar (Hidden when printing) */}
        <div
          className="px-4 py-3 border-b-2 flex items-center justify-between gap-3 flex-wrap bg-slate-100 print:hidden select-none"
          style={{ borderColor: palette.line }}
        >
          <div className="flex items-center gap-2">
            <FileText size={Math.round(20 * scale)} className="text-slate-700" aria-hidden="true" />
            <span style={fz(16, { fontWeight: 700, color: palette.ink })}>
              Tax Invoice #{invoiceNo}
            </span>
            <span
              className="px-2 py-0.5 text-xs font-bold uppercase rounded border"
              style={{
                backgroundColor: status.balance <= 0 ? '#10804315' : status.balance === bill.total ? '#B4282815' : '#D9770615',
                borderColor: status.balance <= 0 ? '#108043' : status.balance === bill.total ? '#B42828' : '#D97706',
                color: status.balance <= 0 ? '#108043' : status.balance === bill.total ? '#B42828' : '#D97706',
              }}
            >
              {status.label}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Download PDF Button */}
            <button
              type="button"
              id="btn-invoice-modal-download"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 font-bold focus-ring cursor-pointer transition-colors shadow-xs"
              style={{
                backgroundColor: palette.navy,
                borderColor: palette.navy,
                color: '#FFFFFF',
                ...fz(13),
              }}
              title="Download official GST Tax Invoice as PDF"
            >
              {downloading ? (
                <>
                  <Check size={16} /> Saved PDF!
                </>
              ) : (
                <>
                  <Download size={16} /> Download PDF
                </>
              )}
            </button>

            {/* Print Button */}
            <button
              type="button"
              id="btn-invoice-modal-print"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 font-bold focus-ring cursor-pointer transition-colors bg-white hover:bg-slate-50"
              style={{
                borderColor: palette.line,
                color: palette.ink,
                ...fz(13),
              }}
              title="Print invoice to thermal or A4 printer"
            >
              <Printer size={16} /> Print
            </button>

            {/* WhatsApp Quick Share */}
            <a
              id="btn-invoice-modal-whatsapp"
              href={whatsappLink(bill.phone, buildBillText(bill, orgProfile, billingSettings))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 font-bold focus-ring cursor-pointer transition-colors shadow-xs"
              style={{
                backgroundColor: '#25D366',
                borderColor: '#1EBE5D',
                color: '#FFFFFF',
                ...fz(13),
              }}
              title="Send formatted bill directly to retailer on WhatsApp"
            >
              <MessageCircle size={16} /> WhatsApp
            </a>

            {/* Native Mobile Share if available */}
            {'share' in navigator && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border-2 font-bold focus-ring cursor-pointer bg-white"
                style={{ borderColor: palette.line, color: palette.ink, ...fz(13) }}
                title="Share via other mobile apps"
              >
                <Share2 size={16} /> Share
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice preview"
              className="p-1.5 border-2 focus-ring cursor-pointer hover:bg-slate-200 transition-colors ml-1"
              style={{ borderColor: palette.line, color: palette.ink }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Invoice Content */}
        <div className="overflow-y-auto p-4 sm:p-8 print:p-0 print:overflow-visible">
          {/* Printable Invoice Sheet */}
          <div
            id="printable-tax-invoice"
            className="border-2 p-6 sm:p-8 bg-white text-slate-900 font-sans print:border-0 print:p-0"
            style={{ borderColor: palette.line }}
          >
            {/* 1. Header Firm Info */}
            <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 pb-5 gap-4" style={{ borderColor: palette.line }}>
              <div>
                <div className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 leading-tight">
                  {orgName.toUpperCase()}
                </div>
                <div className="text-sm font-semibold text-slate-600 mt-0.5">
                  {orgProfile?.tagline || 'Authorized Wholesale Beverage Distributor'}
                </div>
                <div className="text-xs sm:text-sm text-slate-600 mt-1 space-y-0.5">
                  <div>{orgAddress}</div>
                  <div>Phone / WhatsApp: <span className="font-semibold text-slate-800">{orgPhone}</span></div>
                  {orgProfile?.email && <div>Email: {orgProfile.email}</div>}
                </div>
              </div>

              <div className="text-left sm:text-right flex flex-col sm:items-end">
                <div className="inline-block bg-amber-600 text-white font-black text-sm px-3 py-1 tracking-wider uppercase rounded-xs">
                  TAX INVOICE
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                  (Original for Recipient)
                </div>
                <div className="mt-2 text-xs font-mono font-bold bg-slate-100 border px-2.5 py-1 text-slate-800">
                  GSTIN: {orgGstin}
                </div>
                <div className="text-xs text-slate-600 font-medium mt-1">
                  FSSAI Lic: <span className="font-mono">{orgFssai}</span>
                </div>
              </div>
            </div>

            {/* 2. Bill To & Invoice Credentials Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-b-2 text-xs sm:text-sm" style={{ borderColor: palette.line }}>
              <div className="p-3 bg-slate-50 border rounded-xs">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Billed To (Party Details)
                </div>
                <div className="text-base font-black text-slate-900">
                  {bill.retailer || 'Cash Retailer'}
                </div>
                {bill.phone ? (
                  <div className="text-slate-700 mt-0.5">
                    Contact / WhatsApp: <span className="font-semibold font-mono">{bill.phone}</span>
                  </div>
                ) : (
                  <div className="text-slate-500 mt-0.5 italic">Counter Cash Sale</div>
                )}
                <div className="text-slate-600 text-xs mt-1">
                  State: <span className="font-medium text-slate-800">Gujarat (Code: 24)</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border rounded-xs flex flex-col justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Invoice Details
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div>
                    <span className="text-slate-500">Invoice No:</span>
                    <div className="font-mono font-bold text-slate-900">{invoiceNo}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Date of Issue:</span>
                    <div className="font-bold text-slate-900">{bill.date}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Payment Terms:</span>
                    <div className="font-semibold text-slate-800">Immediate / Cash</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Payment Status:</span>
                    <div className="font-bold">
                      <span
                        className="inline-block px-2 py-0.5 text-xs rounded"
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
            </div>

            {/* 3. Items Table */}
            <div className="py-4 overflow-x-auto">
              <table className="w-full text-left border-collapse border text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-xs uppercase tracking-wider">
                    <th className="p-2 border text-center w-8">#</th>
                    <th className="p-2 border">Description of Goods</th>
                    <th className="p-2 border text-center w-14">HSN</th>
                    <th className="p-2 border text-center w-14">Crates</th>
                    <th className="p-2 border text-center w-14">Free</th>
                    <th className="p-2 border text-right w-18">Rate (₹)</th>
                    <th className="p-2 border text-right w-20">Gross (₹)</th>
                    <th className="p-2 border text-right w-18">Scheme (₹)</th>
                    <th className="p-2 border text-right w-22">Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.items.map((it, idx) => {
                    const gross = it.gross || it.qty * it.rate;
                    return (
                      <tr key={it.key} className="border-b hover:bg-slate-50">
                        <td className="p-2 border text-center text-slate-500 font-mono">{idx + 1}</td>
                        <td className="p-2 border font-semibold text-slate-900">
                          {it.productName}
                          {it.batchNumber && (
                            <div className="text-[11px] font-mono font-bold text-amber-900 mt-0.5">
                              Lot: {it.batchNumber} {it.expiryDate ? `· Exp: ${it.expiryDate}` : ''}
                            </div>
                          )}
                          {it.freeQty > 0 && (
                            <div className="text-xs font-bold text-amber-700">
                              ★ Scheme: +{it.freeQty} Free Case{it.freeQty === 1 ? '' : 's'}
                            </div>
                          )}
                          {it.promoLabel && it.freeQty === 0 && it.discount > 0 && (
                            <div className="text-xs font-semibold text-amber-700">
                              ★ {it.promoLabel}
                            </div>
                          )}
                        </td>
                        <td className="p-2 border text-center text-slate-600 font-mono font-semibold">
                          {it.hsn || '2202'}
                        </td>
                        <td className="p-2 border text-center font-bold text-slate-900 font-mono">{it.qty}</td>
                        <td className="p-2 border text-center font-mono font-bold text-amber-700">
                          {it.freeQty > 0 ? `+${it.freeQty}` : '—'}
                        </td>
                        <td className="p-2 border text-right font-mono">₹{money(it.rate)}</td>
                        <td className="p-2 border text-right font-mono">₹{money(gross)}</td>
                        <td className="p-2 border text-right font-mono text-amber-700">
                          {it.discount > 0 ? `−₹${money(it.discount)}` : '—'}
                        </td>
                        <td className="p-2 border text-right font-bold font-mono text-slate-900">
                          ₹{money(it.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 4. Bottom Grid: Words & Bank (Left) + Totals Breakdown (Right) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t-2" style={{ borderColor: palette.line }}>
              {/* Left Column: Words & Bank */}
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 border rounded-xs text-xs sm:text-sm">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Amount Chargeable (in words)
                  </div>
                  <div className="font-bold text-slate-900 italic">
                    {inrToWords(bill.total)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border rounded-xs text-xs sm:text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Bank & Digital Settlement
                    </span>
                    {upiId && (
                      <button
                        type="button"
                        onClick={handleCopyUpi}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
                      >
                        {copiedUpi ? <Check size={12} /> : <Copy size={12} />}
                        {copiedUpi ? 'Copied!' : 'Copy UPI'}
                      </button>
                    )}
                  </div>
                  <div className="font-semibold text-slate-900">
                    UPI ID: <span className="font-mono font-bold text-blue-800">{upiId}</span>
                  </div>
                  {orgProfile?.bankName && (
                    <div className="text-slate-700 text-xs mt-1">
                      Bank: {orgProfile.bankName} | A/c: <span className="font-mono">{orgProfile.accountNumber || '—'}</span> | IFSC: <span className="font-mono">{orgProfile.ifsc || '—'}</span>
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 mt-1">
                    Scan via Google Pay, PhonePe, Paytm, or BHIM.
                  </div>
                </div>
              </div>

              {/* Right Column: Financial Breakdown */}
              <div className="border rounded-xs p-3 bg-slate-50 text-xs sm:text-sm space-y-2">
                <div className="flex justify-between text-slate-700">
                  <span>Gross Subtotal:</span>
                  <span className="font-mono font-semibold">₹{money(bill.subtotal)}</span>
                </div>

                {bill.additionalDiscount && bill.additionalDiscount > 0 ? (
                  <div className="flex justify-between font-semibold text-rose-700">
                    <span>Special Invoice Discount:</span>
                    <span className="font-mono">−₹{money(bill.additionalDiscount)}</span>
                  </div>
                ) : null}

                {bill.discount > (bill.additionalDiscount || 0) && (
                  <div className="flex justify-between font-semibold text-amber-700">
                    <span>Trade Scheme Savings:</span>
                    <span className="font-mono">−₹{money(bill.discount - (bill.additionalDiscount || 0))}</span>
                  </div>
                )}

                {(bill.cgst > 0 || bill.sgst > 0) && (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>CGST (6%):</span>
                      <span className="font-mono">₹{money(bill.cgst)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>SGST (6%):</span>
                      <span className="font-mono">₹{money(bill.sgst)}</span>
                    </div>
                  </>
                )}

                <div className="flex justify-between items-center pt-2 border-t-2 text-base sm:text-lg font-black text-slate-900">
                  <span>Total Invoice Value:</span>
                  <span className="font-mono">₹{money(bill.total)}</span>
                </div>

                <div className="flex justify-between text-slate-700 pt-1 border-t">
                  <span>Amount Paid / Received:</span>
                  <span className="font-mono font-semibold text-emerald-700">₹{money(bill.amountPaid)}</span>
                </div>

                <div className="flex justify-between items-center text-sm font-bold pt-1">
                  <span>Balance Outstanding:</span>
                  <span
                    className="font-mono text-base font-black"
                    style={{ color: status.balance > 0 ? '#B42828' : '#108043' }}
                  >
                    ₹{money(status.balance)}
                  </span>
                </div>
              </div>
            </div>

            {/* 5. Terms & Signatory Footer */}
            <div className="mt-6 pt-4 border-t-2 flex flex-col sm:flex-row justify-between items-end gap-6 text-xs text-slate-600" style={{ borderColor: palette.line }}>
              <div className="max-w-md">
                <div className="font-bold text-slate-800 uppercase text-[11px] mb-1">
                  Terms & Conditions:
                </div>
                <p className="whitespace-pre-line leading-relaxed text-[11px] text-slate-600">
                  {orgProfile?.invoiceTerms ||
                    '1. Goods once sold will not be taken back or exchanged.\n2. Payment strictly on delivery or agreed credit period.\n3. Empty glass bottles/crates must be returned in good condition.\n4. All disputes subject to local jurisdiction only.'}
                </p>
              </div>

              <div className="text-right sm:min-w-48">
                <div className="font-bold text-slate-900 text-xs uppercase">
                  For {orgName.toUpperCase()}
                </div>
                <div className="h-12 flex items-end justify-end">
                  <div className="border-b border-dashed border-slate-400 w-36"></div>
                </div>
                <div className="text-[11px] text-slate-500 font-semibold mt-1">
                  Authorized Signatory
                </div>
              </div>
            </div>

            <div className="text-center text-[10px] text-slate-400 mt-6 pt-3 border-t">
              This is a Computer Generated Tax Invoice. E. & O.E.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
