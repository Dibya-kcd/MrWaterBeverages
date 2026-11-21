import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Download, MessageCircle, Printer, Plus, ArrowRight } from 'lucide-react';
import { Bill } from '../../types';
import { money } from '../../utils/billing';
import { downloadInvoicePdf, preloadInvoicePdf } from '../../utils/invoicePdfLazy';
import { useLedger } from '../../context/LedgerContext';
import { sendBillOnWhatsApp, whatsAppResultMessage } from '../../utils/whatsappBill';
import { notify } from '../../utils/toast';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatBillNumber } from '../../utils/invoiceCommon';

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
  const { orgProfile, billingSettings, getCustomerLedger } = useLedger();
  const isPhone = useIsMobile(767);
  const { t } = useLanguage();
  useEffect(() => { preloadInvoicePdf().catch(() => {}); }, []);

  // Document format toggle (GST B2B Tax Invoice vs Non-GST B2C Retail Bill)
  const [selectedFormat, setSelectedFormat] = useState<'gst' | 'non_gst'>(() => {
    if (bill.invoiceType === 'tax_invoice' || bill.isGstInvoice) return 'gst';
    if (bill.invoiceType === 'retail' || bill.invoiceType === 'bill_of_supply' || bill.isGstInvoice === false) return 'non_gst';
    return bill.supplyType === 'B2B' && Boolean(bill.customerGstin) ? 'gst' : 'non_gst';
  });

  const balanceDue = Math.max(0, bill.total - (bill.amountPaid || 0));
  const isWalkIn = !bill.retailer || bill.retailer === 'Apt / Walk-in sale';
  let totalDueNow = balanceDue;
  if (!isWalkIn && getCustomerLedger) {
    try {
      const ledgerBal = Number(getCustomerLedger(bill.retailer, bill.phone)?.rawBalance) || 0;
      totalDueNow = Math.max(balanceDue, ledgerBal);
    } catch {
      totalDueNow = balanceDue;
    }
  }
  const billDocNo = formatBillNumber(bill, billingSettings, selectedFormat);

  const handleDownloadPdf = () => {
    Promise.resolve(downloadInvoicePdf(bill, orgProfile, billingSettings, selectedFormat))
      .catch((err) => console.error('Error downloading invoice PDF:', err));
  };

  const [sendingWa, setSendingWa] = useState(false);
  const handleSendWhatsApp = async () => {
    setSendingWa(true);
    try {
      const result = await sendBillOnWhatsApp(bill, orgProfile, billingSettings, selectedFormat);
      const msg = whatsAppResultMessage(result);
      if (msg) notify(msg.text, msg.kind);
    } finally {
      setSendingWa(false);
    }
  };

  const totalCases = bill.items.reduce((s, it) => s + it.qty, 0);
  const itemsSubtotal = bill.items.reduce((s, it) => s + it.amount, 0);
  const discount = Math.max(0, Math.round((itemsSubtotal - bill.total) * 100) / 100);
  const fmtLabel = selectedFormat === 'gst' ? 'GST Invoice' : 'Retail Bill';
  const modeLabel =
    bill.paymentMode === 'upi'
      ? t('sell.upi')
      : bill.paymentMode === 'credit'
        ? t('sell.credit')
        : t('sell.cash');

  if (isPhone) {
    return (
      <div className="rt-success-wrap pt-2" id="invoice-success-actions">
        <div className="text-center space-y-1.5 py-2" role="status">
          <div className="rt-success-check mx-auto">
            <Check size={30} strokeWidth={3} aria-hidden="true" />
          </div>
          <div className="rt-success-total">₹{money(bill.total)}</div>
          <div className="text-xs font-semibold text-[var(--text-2)] break-words">
            #{billDocNo} · {isWalkIn ? t('sell.walkInSale') : bill.retailer}
          </div>
        </div>

        <div className="rt-card !py-2 !px-3.5">
          <div className="rt-ln">
            <span className="text-[var(--text-2)] font-semibold">
              {t('sell.receivedMode', { mode: modeLabel })}
            </span>
            <b className="text-[var(--paid)] tabular-nums">₹{money(bill.amountPaid || 0)}</b>
          </div>
          <div className="rt-ln">
            <span className="text-[var(--text-2)] font-semibold">{t('sell.totalDueNow')}</span>
            <b className={`tabular-nums ${totalDueNow > 0.004 ? 'text-[var(--due)]' : 'text-[var(--paid)]'}`}>
              ₹{money(totalDueNow)}
            </b>
          </div>
        </div>

        <button
          type="button"
          id="invoice-success-whatsapp"
          onClick={handleSendWhatsApp}
          disabled={!bill.phone || sendingWa}
          className="rt-btn rt-btn--wa w-full"
        >
          <MessageCircle size={18} />
          <span>{bill.phone ? (sendingWa ? '…' : t('sell.shareOnWhatsapp')) : t('salesman.noPhone')}</span>
        </button>

        <button
          type="button"
          onClick={() => (onOpenInvoiceModal ? onOpenInvoiceModal(bill, selectedFormat) : handleDownloadPdf())}
          className="rt-btn-outline rt-btn-outline--primary w-full"
          aria-label={`${t('sell.printPdf')} ${fmtLabel}`}
        >
          <Printer size={17} />
          <span>{t('sell.printPdf')}</span>
        </button>

        <button
          type="button"
          id="btn-create-next-invoice-bottom"
          onClick={onCreateNextBill}
          className="rt-link-btn"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>{t('sell.startNewSale')}</span>
        </button>

        <details className="rt-card !p-3">
          <summary className="flex items-center justify-between gap-2 text-xs font-bold text-[var(--text-2)] cursor-pointer list-none">
            <span>{t('sell.items')} ({bill.items.length} · {totalCases} cs)</span>
            <ChevronDown size={15} />
          </summary>
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-[var(--text-2)]">
              <span>{fmtLabel}</span>
              <div className="inline-flex rounded-full bg-[var(--bg)] p-0.5 border border-[var(--border)]">
                {(['non_gst', 'gst'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={selectedFormat === f}
                    onClick={() => setSelectedFormat(f)}
                    className={`px-3 min-h-[34px] rounded-full text-xs font-bold cursor-pointer ${
                      selectedFormat === f
                        ? 'bg-[var(--primary)] text-[var(--surface)]'
                        : 'text-[var(--text-2)]'
                    }`}
                  >
                    {f === 'gst' ? 'GST' : 'Retail'}
                  </button>
                ))}
              </div>
            </div>

            <ul className="divide-y divide-[var(--border)]">
              {bill.items.map((it, idx) => (
                <li key={it.key || idx} className="py-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[var(--text)] break-words">{it.productName}</div>
                    <div className="text-xs text-[var(--text-2)] tabular-nums">
                      {it.qty} × ₹{money(it.rate)}
                      {it.freeQty ? ` (+${it.freeQty} free)` : ''}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-[var(--text)] tabular-nums shrink-0">
                    ₹{money(it.amount)}
                  </div>
                </li>
              ))}
            </ul>
            {discount > 0 && (
              <div className="pt-2 border-t border-[var(--border)] flex justify-between text-xs font-semibold text-[var(--paid)]">
                <span>{t('salesman.discount')}</span>
                <span>−₹{money(discount)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="rt-btn-outline flex-1 text-xs"
                aria-label={`${t('sell.pdf')} ${fmtLabel}`}
              >
                <Download size={15} />
                <span>{t('sell.pdf')}</span>
              </button>
              {onOpenHistory && (
                <button
                  type="button"
                  onClick={onOpenHistory}
                  className="rt-btn-outline flex-1 text-xs"
                >
                  <span>{t('sell.viewInHistory')}</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </details>
      </div>
    );
  }

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
      <div className="lg:hidden h-32" aria-hidden="true" />
      <div
        className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md px-3 pt-2.5 pb-2.5 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] lg:static lg:z-auto lg:border lg:rounded-2xl lg:shadow-sm lg:backdrop-blur-none"
        id="invoice-success-actions"
      >
        <div className="max-w-2xl mx-auto space-y-2">
          <div className="flex items-stretch gap-2">
            {bill.phone ? (
              <button
                type="button"
                id="invoice-success-whatsapp"
                onClick={handleSendWhatsApp}
                disabled={sendingWa}
                className="flex-1 min-h-[46px] rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] disabled:opacity-70 text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <MessageCircle size={19} />
                <span>{sendingWa ? 'Preparing…' : 'WhatsApp 80mm bill'}</span>
              </button>
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
              className="flex-1 min-h-[50px] rounded-xl font-black text-[15px] bg-[var(--primary)] hover:bg-[var(--primary)] text-white cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
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
