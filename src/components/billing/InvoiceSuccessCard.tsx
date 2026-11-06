import React, { useState } from 'react';
import { Check, Download, MessageCircle, Printer, Plus, ArrowRight } from 'lucide-react';
import { Bill } from '../../types';
import { money, buildBillText, whatsappLink } from '../../utils/billing';
import { downloadInvoicePdf } from '../../utils/invoicePdf';
import { useLedger } from '../../context/LedgerContext';

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

  const totalCases = bill.items.reduce((s, it) => s + it.qty, 0);
  const itemsSubtotal = bill.items.reduce((s, it) => s + it.amount, 0);
  const discount = Math.max(0, Math.round((itemsSubtotal - bill.total) * 100) / 100);
  const fmtLabel = selectedFormat === 'gst' ? 'GST Invoice' : 'Retail Bill';

  return (
    <div className="space-y-3 max-w-none lg:max-w-2xl mx-auto">
      {/* 1. One-line success header (does not push the items down) */}
      <div className="rounded-2xl bg-emerald-700 text-white px-3.5 py-3 flex items-center gap-3 shadow-sm" role="status">
        <div className="w-10 h-10 shrink-0 rounded-full bg-white text-emerald-700 flex items-center justify-center">
          <Check size={24} strokeWidth={3.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-black text-base sm:text-lg leading-tight">Sale saved · Bill #{bill.id}</div>
          <div className="text-xs font-semibold text-emerald-100 mt-0.5 truncate">
            {bill.retailer} · {bill.date}{bill.vehicle ? ` · ${bill.vehicle}` : ''}
          </div>
        </div>
      </div>

      {/* 2. Total / Paid / Due strip */}
      <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="px-3.5 py-2.5">
          <div className="text-[10.5px] font-extrabold tracking-wide text-slate-500">TOTAL</div>
          <div className="font-black text-base sm:text-lg text-slate-900">₹{money(bill.total)}</div>
        </div>
        <div className="px-3.5 py-2.5 border-l border-slate-200">
          <div className="text-[10.5px] font-extrabold tracking-wide text-slate-500">PAID</div>
          <div className="font-black text-base sm:text-lg text-emerald-700">₹{money(bill.amountPaid || 0)}</div>
        </div>
        <div className={`px-3.5 py-2.5 border-l border-slate-200 ${balanceDue > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
          <div className={`text-[10.5px] font-extrabold tracking-wide ${balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {balanceDue > 0 ? 'DUE · CREDIT' : 'SETTLED'}
          </div>
          <div className={`font-black text-base sm:text-lg ${balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            ₹{money(balanceDue)}
          </div>
        </div>
      </div>

      {/* 3. Items sold — shown immediately */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 text-[11.5px] font-extrabold tracking-wide text-slate-600">
          <span>ITEMS SOLD · {bill.items.length}</span>
          <span>{totalCases} {totalCases === 1 ? 'CASE' : 'CASES'}</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {bill.items.map((it, idx) => (
            <li key={it.key || idx} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-sm text-slate-900 leading-snug break-words">{it.productName}</div>
                <div className="text-xs font-semibold text-slate-500 mt-0.5">
                  {it.qty} cs × ₹{money(it.rate)}
                  {it.discount ? <span className="text-rose-600"> · −₹{money(it.discount)} disc</span> : null}
                </div>
                {it.freeQty ? (
                  <div className="text-[11px] font-extrabold text-emerald-700 mt-0.5">+{it.freeQty} cs free</div>
                ) : null}
              </div>
              <div className="font-black text-[15px] text-slate-900 whitespace-nowrap">₹{money(it.amount)}</div>
            </li>
          ))}
        </ul>
        <div className="px-3.5 py-2.5 border-t border-slate-100 text-[13px] font-bold text-slate-600 space-y-1">
          {discount > 0 && (
            <>
              <div className="flex justify-between"><span>Items</span><span>₹{money(itemsSubtotal)}</span></div>
              <div className="flex justify-between text-rose-600"><span>Discount</span><span>−₹{money(discount)}</span></div>
            </>
          )}
          <div className={`flex justify-between font-black text-sm text-slate-900 ${discount > 0 ? 'border-t border-dashed border-slate-300 pt-1.5' : ''}`}>
            <span>Total{bill.paymentMode ? ` · ${String(bill.paymentMode).toUpperCase()}` : ''}</span>
            <span>₹{money(bill.total)}</span>
          </div>
        </div>
      </div>

      {/* 4. Bill format (compact) */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span className="text-xs font-extrabold text-slate-600">Bill format</span>
        <div className="inline-flex rounded-xl bg-slate-200 p-0.5">
          {(['non_gst', 'gst'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setSelectedFormat(f)}
              className={`px-3.5 min-h-[34px] rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                selectedFormat === f ? (f === 'gst' ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white') : 'text-slate-600'
              }`}
              title={f === 'gst' ? 'Official GST Tax Invoice with HSN code & CGST/SGST breakdown' : 'Non-GST retail bill / bill of supply'}
            >
              {f === 'gst' ? 'GST invoice' : 'Retail'}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Sticky action bar — sits above the bottom nav on phones, inline on desktop */}
      <div
        className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-slate-300 bg-white px-3 pt-2.5 pb-2.5 shadow-[0_-6px_18px_rgba(15,23,42,0.10)] lg:static lg:z-auto lg:border lg:rounded-2xl lg:shadow-sm"
        id="invoice-success-actions"
      >
        <div className="max-w-2xl mx-auto space-y-2">
          <div className="flex items-stretch gap-2">
            {bill.phone ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[46px] rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <MessageCircle size={19} />
                <span>WhatsApp bill</span>
              </a>
            ) : (
              <button type="button" disabled className="flex-1 min-h-[46px] rounded-xl bg-slate-100 text-slate-400 font-bold text-xs cursor-not-allowed">
                No phone for WhatsApp
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="w-14 min-h-[46px] rounded-xl border-[1.5px] border-slate-300 bg-white text-slate-800 text-[10px] font-extrabold flex flex-col items-center justify-center cursor-pointer"
              title={`Download ${fmtLabel} PDF`}
              aria-label={`Download ${fmtLabel} PDF`}
            >
              <Download size={17} />
              <span>PDF</span>
            </button>
            {onOpenInvoiceModal && (
              <button
                type="button"
                onClick={() => onOpenInvoiceModal(bill, selectedFormat)}
                className="w-14 min-h-[46px] rounded-xl border-[1.5px] border-slate-300 bg-white text-slate-800 text-[10px] font-extrabold flex flex-col items-center justify-center cursor-pointer"
                title={`Preview and print ${fmtLabel}`}
                aria-label={`Print ${fmtLabel}`}
              >
                <Printer size={17} />
                <span>Print</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="min-h-[50px] px-3 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
              >
                <span>History</span>
                <ArrowRight size={13} />
              </button>
            )}
            <button
              type="button"
              id="btn-create-next-invoice-bottom"
              onClick={onCreateNextBill}
              className="flex-1 min-h-[50px] rounded-xl font-black text-[15px] bg-[#0B3D32] hover:bg-[#072720] text-white cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Plus size={19} strokeWidth={3} />
              <span>New sale</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
