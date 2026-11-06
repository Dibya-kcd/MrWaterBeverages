import React, { useState } from 'react';
import { Check, CheckCircle2, Download, MessageCircle, Phone, Printer, Plus, ArrowRight } from 'lucide-react';
import { Bill } from '../../types';
import { money, buildBillText, whatsappLink } from '../../utils/billing';
import { downloadInvoicePdf } from '../../utils/invoicePdf';
import { useLedger } from '../../context/LedgerContext';
import { useIsMobile } from '../../hooks/useIsMobile';

interface InvoiceSuccessCardProps {
  bill: Bill;
  onOpenInvoiceModal?: (bill: Bill, defaultFormat?: 'gst' | 'non_gst') => void;
  onCreateNextBill: () => void;
  onOpenHistory?: () => void;
}

export const InvoiceSuccessCard: React.FC<InvoiceSuccessCardProps> = ({
  bill,
  onOpenInvoiceModal,
  onCreateNextBill,
  onOpenHistory,
}) => {
  const { orgProfile, billingSettings } = useLedger();
  const isMobile = useIsMobile();

  // Document format toggle (GST B2B Tax Invoice vs Non-GST B2C Retail Bill)
  const [selectedFormat, setSelectedFormat] = useState<'gst' | 'non_gst'>(() => {
    if (bill.invoiceType === 'tax_invoice' || bill.isGstInvoice) return 'gst';
    if (bill.invoiceType === 'retail' || bill.invoiceType === 'bill_of_supply' || bill.isGstInvoice === false) return 'non_gst';
    return bill.supplyType === 'B2B' && Boolean(bill.customerGstin) ? 'gst' : 'non_gst';
  });

  const balanceDue = Math.max(0, bill.total - (bill.amountPaid || 0));
  const isPaidInFull = balanceDue === 0;

  const handleDownloadPdf = () => {
    downloadInvoicePdf(bill, orgProfile, billingSettings, selectedFormat);
  };

  const whatsappUrl = bill.phone
    ? whatsappLink(bill.phone, buildBillText(bill, orgProfile, billingSettings, selectedFormat))
    : '';


  // ---------------------------------------------------------------------------
  // PHONE LAYOUT: slim success header → Total / Paid / Due strip → items first →
  // format switch → one sticky action bar. (Tablet / desktop keep the layout below.)
  // ---------------------------------------------------------------------------
  if (isMobile) {
    const itemsTotal = bill.items.reduce((s, it) => s + (it.amount || 0), 0);
    const discount = Math.max(0, Math.round((itemsTotal - bill.total) * 100) / 100);
    const totalCases = bill.items.reduce((s, it) => s + it.qty, 0);
    const formatLabel = selectedFormat === 'gst' ? 'GST invoice' : 'Retail bill';

    return (
      <div id="invoice-success-mobile">
        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
        {/* 1. One-line success header */}
        <div className="bg-emerald-700 text-white px-3 py-3 flex items-center gap-3">
          <div className="size-10 rounded-full bg-white text-emerald-700 flex items-center justify-center shrink-0">
            <Check size={22} strokeWidth={3.5} />
          </div>
          <div className="min-w-0">
            <div className="text-base font-black leading-tight">Sale saved · Bill #{bill.id}</div>
            <div className="text-xs font-semibold text-emerald-100 truncate">
              {bill.retailer} · {bill.date}
              {bill.vehicle ? ` · ${bill.vehicle}` : ''}
            </div>
          </div>
        </div>

        {/* 2. Total / Paid / Due strip */}
        <div className="grid grid-cols-3 bg-white">
          <div className="px-3 py-2.5">
            <div className="text-[11px] font-bold text-slate-500">Total</div>
            <div className="text-lg font-black text-slate-900 leading-tight">₹{money(bill.total)}</div>
          </div>
          <div className="px-3 py-2.5 border-l border-slate-100">
            <div className="text-[11px] font-bold text-slate-500">Paid</div>
            <div className="text-lg font-black text-emerald-700 leading-tight">₹{money(bill.amountPaid || 0)}</div>
          </div>
          <div className={`px-3 py-2.5 border-l border-slate-100 ${balanceDue > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
            <div className={`text-[11px] font-bold ${balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {balanceDue > 0 ? ((bill.amountPaid || 0) > 0 ? 'Due' : 'Due · credit') : 'Settled'}
            </div>
            <div className={`text-lg font-black leading-tight ${balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              ₹{money(balanceDue)}
            </div>
          </div>
        </div>
        </div>

        {/* 3. Items sold — straight away, no scrolling past banners */}
        <div className="pt-3">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-black text-slate-600">
              <span>Items sold · {bill.items.length}</span>
              <span>
                {totalCases} case{totalCases === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {bill.items.map((it, idx) => (
                <li key={it.key || idx} className="px-3 py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-black text-slate-900 leading-snug break-words">{it.productName}</div>
                    <div className="text-xs font-semibold text-slate-500 mt-0.5">
                      {it.qty} cs × ₹{money(it.rate)}
                      {it.discount > 0 ? ` · −₹${money(it.discount)} disc` : ''}
                    </div>
                    {it.freeQty ? <div className="text-xs font-black text-emerald-700 mt-0.5">+{it.freeQty} cs free</div> : null}
                  </div>
                  <div className="text-[15px] font-black text-slate-900 shrink-0">₹{money(it.amount)}</div>
                </li>
              ))}
            </ul>
            <div className="px-3 py-2.5 border-t border-slate-200 space-y-1 text-sm">
              <div className="flex items-center justify-between font-semibold text-slate-600">
                <span>Items</span>
                <span>₹{money(itemsTotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between font-black text-rose-600">
                  <span>Discount</span>
                  <span>−₹{money(discount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 border-t border-dashed border-slate-300 text-base font-black text-slate-900">
                <span>Total</span>
                <span>₹{money(bill.total)}</span>
              </div>
            </div>
          </div>

          {/* 4. Bill format — small row, below the items */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-600">Bill format</span>
            <div className="inline-flex rounded-xl bg-slate-200/70 p-1" role="group" aria-label="Bill format">
              <button
                type="button"
                onClick={() => setSelectedFormat('non_gst')}
                aria-pressed={selectedFormat === 'non_gst'}
                className={`min-h-[40px] px-4 rounded-lg text-sm font-black transition-colors ${
                  selectedFormat === 'non_gst' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => setSelectedFormat('gst')}
                aria-pressed={selectedFormat === 'gst'}
                className={`min-h-[40px] px-4 rounded-lg text-sm font-black transition-colors ${
                  selectedFormat === 'gst' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                GST invoice
              </button>
            </div>
          </div>

          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="mt-2 min-h-[44px] px-1 text-sm font-bold text-slate-500 flex items-center gap-1 active:text-slate-800"
            >
              Billing history <ArrowRight size={14} />
            </button>
          )}
        </div>

        {/* 5. One sticky action bar above the bottom nav */}
        <div
          className="fixed inset-x-0 bottom-16 z-30 bg-white border-t border-slate-200 px-3 pt-2.5 pb-3 space-y-2 shadow-[0_-6px_16px_rgba(15,23,42,0.08)]"
          role="region"
          aria-label="Bill actions"
        >
          <div className="flex items-stretch gap-2">
            {bill.phone ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                id="btn-success-whatsapp"
                className="flex-1 min-h-[50px] rounded-xl bg-[#25D366] active:brightness-95 text-white text-base font-black flex items-center justify-center gap-2 shadow-sm"
              >
                <MessageCircle size={20} />
                WhatsApp bill
              </a>
            ) : (
              <div className="flex-1 min-h-[50px] rounded-xl bg-slate-100 text-slate-400 text-sm font-bold flex items-center justify-center text-center px-2">
                No phone for WhatsApp
              </div>
            )}
            <button
              type="button"
              id="btn-success-pdf"
              onClick={handleDownloadPdf}
              aria-label={`Download ${formatLabel} PDF`}
              className="w-[62px] min-h-[50px] rounded-xl border-2 border-slate-200 bg-white text-slate-700 flex flex-col items-center justify-center gap-0.5 active:bg-slate-50"
            >
              <Download size={18} />
              <span className="text-[11px] font-black leading-none">PDF</span>
            </button>
            {onOpenInvoiceModal && (
              <button
                type="button"
                id="btn-success-print"
                onClick={() => onOpenInvoiceModal(bill, selectedFormat)}
                aria-label={`Print ${formatLabel}`}
                className="w-[62px] min-h-[50px] rounded-xl border-2 border-slate-200 bg-white text-slate-700 flex flex-col items-center justify-center gap-0.5 active:bg-slate-50"
              >
                <Printer size={18} />
                <span className="text-[11px] font-black leading-none">Print</span>
              </button>
            )}
          </div>
          <button
            type="button"
            id="btn-create-next-invoice-top"
            onClick={onCreateNextBill}
            className="w-full min-h-[50px] rounded-xl bg-[#0B3D32] active:bg-[#072720] text-white text-base font-black flex items-center justify-center gap-2"
          >
            <Plus size={19} strokeWidth={3} />
            New sale
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-none lg:max-w-2xl mx-auto">
      {/* 1. Success Announcement Banner */}
      <div className="p-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 text-center space-y-3 shadow-sm">
        <div className="w-13 h-13 mx-auto rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm">
          <Check size={26} strokeWidth={3} />
        </div>

        <div>
          <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
            Invoice Confirmed & Inventory Synchronized
          </span>
          <h2 className="text-2xl font-black text-slate-900 mt-1">
            Bill #{bill.id}
          </h2>
          <p className="text-xs sm:text-sm font-semibold text-slate-600 mt-1">
            Issued to <strong className="text-slate-900">{bill.retailer}</strong> on {bill.date}
          </p>
          {bill.vehicle && (
            <p className="text-xs font-bold text-slate-500 mt-0.5">
              Dispatched from Vehicle: {bill.vehicle}
            </p>
          )}
        </div>

        {/* Financial Overview Card */}
        <div className="p-3.5 rounded-xl bg-white border border-emerald-200/90 inline-flex flex-col sm:flex-row items-center justify-center gap-4 text-xs font-black shadow-sm">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-slate-400 font-semibold block text-[10px]">TOTAL</span>
              <span className="text-sm text-slate-900">₹{money(bill.total)}</span>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div>
              <span className="text-slate-400 font-semibold block text-[10px]">PAID</span>
              <span className="text-sm text-emerald-700">₹{money(bill.amountPaid || 0)}</span>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div>
              <span className="text-slate-400 font-semibold block text-[10px]">BALANCE DUE</span>
              <span
                className={`text-sm ${
                  balanceDue > 0 ? 'text-rose-600' : 'text-slate-600'
                }`}
              >
                ₹{money(balanceDue)}
              </span>
            </div>
          </div>

          {bill.paymentMode && (
            <div className="pt-2 sm:pt-0 sm:pl-3 border-t sm:border-t-0 sm:border-l border-slate-200 text-left">
              <span className="text-[10px] text-slate-400 block font-semibold">PAYMENT MODE</span>
              <span className="text-xs text-sky-700 font-bold uppercase">
                {bill.paymentMode} {bill.paymentDate ? `(${bill.paymentDate})` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Quick Top Primary Action: Create Next Invoice immediately without scrolling */}
        <div className="pt-2 flex items-center justify-center">
          <button
            type="button"
            id="btn-create-next-invoice-top"
            onClick={onCreateNextBill}
            className="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl font-black text-sm bg-[#0B3D32] hover:bg-[#072720] text-white cursor-pointer shadow-md inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] border-2 border-emerald-400 ring-2 ring-emerald-500/20"
          >
            <Plus size={18} strokeWidth={3} />
            <span>Create Next Invoice</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Document Format Switcher (GST vs Non-GST) */}
      <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            Document Format:
          </span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
              selectedFormat === 'gst'
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
            }`}
          >
            {selectedFormat === 'gst' ? '🏢 GST B2B Tax Invoice' : '🛒 Non-GST B2C Retail Bill'}
          </span>
        </div>

        <div className="inline-flex items-center rounded-xl border border-slate-200 p-1 bg-slate-100">
          <button
            type="button"
            onClick={() => setSelectedFormat('non_gst')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedFormat === 'non_gst'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Clean Non-GST Retail Cash Memo / Bill of Supply without separate tax breakdown"
          >
            🛒 Non-GST (Retail Bill)
          </button>
          <button
            type="button"
            onClick={() => setSelectedFormat('gst')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedFormat === 'gst'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Official GST Tax Invoice with HSN code & CGST/SGST tax breakdown"
          >
            🏢 GST (Tax Invoice)
          </button>
        </div>
      </div>

      {/* 2. Items Sold Breakdown */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
            Line Items ({bill.items.length})
          </span>
          <span className="text-xs font-semibold text-slate-500">
            {bill.items.reduce((s, it) => s + it.qty, 0)} cases billed
          </span>
        </div>

        <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left data-table text-xs">
            <thead>
              <tr className="text-slate-400 font-bold border-b border-slate-100">
                <th className="pb-1.5">Product</th>
                <th className="pb-1.5 text-right">Qty</th>
                <th className="pb-1.5 text-right">Rate</th>
                <th className="pb-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bill.items.map((it, idx) => (
                <tr key={it.key || idx}>
                  <td className="py-2 font-bold text-slate-900">
                    <div>{it.productName}</div>
                    {it.category && (
                      <span className="text-[10px] font-normal text-slate-400">
                        {it.category}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right font-black text-slate-900">
                    {it.qty} cs
                    {it.freeQty ? (
                      <span className="text-emerald-700 text-[10px] block">
                        +{it.freeQty} free
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right text-slate-600 font-semibold">
                    ₹{money(it.rate)}
                  </td>
                  <td className="py-2 text-right font-black text-slate-900">
                    ₹{money(it.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {onOpenInvoiceModal && (
          <button
            type="button"
            onClick={() => onOpenInvoiceModal(bill, selectedFormat)}
            className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs ${
              selectedFormat === 'gst'
                ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950'
                : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-950'
            }`}
            title={`Preview and print ${selectedFormat === 'gst' ? 'GST Tax Invoice' : 'Non-GST Retail Bill'}`}
          >
            <Printer size={15} />
            <span>Print {selectedFormat === 'gst' ? 'GST Invoice' : 'Retail Bill'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleDownloadPdf}
          className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
          title={`Download ${selectedFormat === 'gst' ? 'GST Tax Invoice' : 'Non-GST Retail Bill'} PDF`}
        >
          <Download size={15} />
          <span>Download PDF ({selectedFormat === 'gst' ? 'GST' : 'Non-GST'})</span>
        </button>

        {bill.phone ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 rounded-xl border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
          >
            <MessageCircle size={15} />
            <span>Send WhatsApp</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="p-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 font-bold text-xs cursor-not-allowed text-center"
          >
            No Phone for WhatsApp
          </button>
        )}
      </div>

      {/* 4. Bottom Footer: Next Sale / History */}
      <div className="pt-3 pb-2 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {onOpenHistory ? (
          <button
            type="button"
            onClick={onOpenHistory}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center justify-center sm:justify-start gap-1 cursor-pointer py-2 px-3 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <span>Billing History</span>
            <ArrowRight size={13} />
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          id="btn-create-next-invoice-bottom"
          onClick={onCreateNextBill}
          className="min-h-[46px] px-6 py-2.5 rounded-xl font-black text-sm bg-[#0B3D32] hover:bg-[#072720] text-white cursor-pointer shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] border-2 border-emerald-400"
        >
          <Plus size={18} strokeWidth={3} />
          <span>Create Next Invoice</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};
