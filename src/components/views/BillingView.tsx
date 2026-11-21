import React, { useState, useMemo, useEffect } from 'react';
import {
  Bell,
  Check,
  Clock,
  Download,
  Eye,
  FileText,
  MessageCircle,
  Plus,
  Printer,
  RotateCcw,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Bill, ExistingCustomer } from '../../types';
import {
  money,
  whatsappLink,
} from '../../utils/billing';
import { downloadInvoicePdf, preloadInvoicePdf } from '../../utils/invoicePdfLazy';
import { IconButton } from '../common/IconButton';
import { TaxInvoiceModal } from '../common/TaxInvoiceModal';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { EditBillModal } from '../common/EditBillModal';
import { BillingHistoryView } from './BillingHistoryView';
import { NewSaleScreen } from './NewSaleScreen';
import { useLanguage } from '../../i18n/LanguageContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useNeedsAttention } from '../../hooks/useNeedsAttention';
import { billBalance } from '../../utils/salesReturns';
import { sendBillOnWhatsApp, whatsAppResultMessage } from '../../utils/whatsappBill';
import { notify as toastNotify } from '../../utils/toast';
import { formatBillNumber, isGstExcludedBill } from '../../utils/invoiceCommon';

export const BillingView: React.FC = () => {
  const {
    products,
    bills,
    editingBillId,
    updateBill,
    splitMixedBill,
    previewBillEdit,
    previewBillDelete,
    reopenTrip,
    trips,
    deleteBill,
    cancelBill,
    notify,
    cancelledBills,
    justFinalizedBillId,
    setJustFinalizedBillId,
    justFinalizedSplitIds,
    setJustFinalizedSplitIds,
    remainingStock,
    promotions,
    gstMode,
    setGstMode,
    palette,
    fz,
    scale,
    orgProfile,
    billingSettings,
    warehouses,
  } = useLedger();

  const { t } = useLanguage();
  const isPhone = useIsMobile(767);
  const { total: attentionTotal } = useNeedsAttention();
  const [billingSubTab, setBillingSubTab] = useState<'create' | 'history'>('create');

  // Modals: In-place edit modal, delete confirmation modal, tax invoice modal
  const [editModalBill, setEditModalBill] = useState<Bill | null>(null);
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);
  const [billToCancel, setBillToCancel] = useState<Bill | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [invoiceModalBill, setInvoiceModalBill] = useState<Bill | null>(null);
  const [invoiceModalFormat, setInvoiceModalFormat] = useState<'gst' | 'non_gst' | undefined>(undefined);

  // Respond to global shortcuts "+ New Bill" and "Sales History"
  useEffect(() => {
    const onNewBill = () => {
      setBillingSubTab('create');
    };
    const onHistory = () => {
      setBillingSubTab('history');
    };
    window.addEventListener('app-new-bill', onNewBill);
    window.addEventListener('app-sales-history', onHistory);
    return () => {
      window.removeEventListener('app-new-bill', onNewBill);
      window.removeEventListener('app-sales-history', onHistory);
    };
  }, []);

  // Compile unique existing customers with purchase history for EditBillModal
  // One source of truth for customer balances: the ledger's own list (opening balance, every
  // receipt, advances and returns included). A private list built from bills alone showed
  // "0 due / settled" for a customer who had paid in advance.
  const { existingCustomers: ledgerCustomers } = useLedger();
  const existingCustomers: ExistingCustomer[] = useMemo(
    () => [...ledgerCustomers].sort((a, b) => b.totalBills - a.totalBills),
    [ledgerCustomers],
  );

  const justBill = justFinalizedBillId ? bills.find((b) => b.id === justFinalizedBillId) : null;
  const justSplitBills = useMemo(
    () =>
      justFinalizedSplitIds.length > 1
        ? justFinalizedSplitIds
            .map((id) => bills.find((b) => b.id === id))
            .filter((b): b is Bill => Boolean(b))
        : [],
    [justFinalizedSplitIds, bills],
  );
  const hasJustBill = Boolean(justBill) || justSplitBills.length > 0;
  useEffect(() => { if (hasJustBill) preloadInvoicePdf().catch(() => {}); }, [hasJustBill]);

  const previewCancelCnNo = useMemo(() => {
    const year = new Date().getFullYear();
    const prefix = `CN-${year}-`;
    const highest = [...bills, ...cancelledBills].reduce((m, b) => {
      const no = b.cancellation?.creditNoteNo;
      const n = no && no.startsWith(prefix) ? parseInt(no.slice(prefix.length), 10) : 0;
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `${prefix}${String(highest + 1).padStart(4, '0')}`;
  }, [bills, cancelledBills]);

  return (
    <div id="view-billing" className="hh-view mw-workspace space-y-4 min-w-0 max-w-full md:overflow-x-hidden">
      {/* Phone (<768px) Unified Blue Sales Header + Segmented Bar */}
      <header className="hh-sales-top md:hidden select-none">
        <div className="hh-sales-top__row">
          <h1 className="hh-sales-top__title">{t('nav.sell')}</h1>
          {billingSubTab === 'history' ? (
            <button
              type="button"
              onClick={() => {
                setBillingSubTab('create');
                window.dispatchEvent(new CustomEvent('app-new-bill'));
              }}
              className="hh-sales-fab"
              aria-label={t('sell.newSale')}
              title={t('sell.newSale')}
            >
              <Plus size={22} strokeWidth={2.75} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('hh-open-notifications'))}
              className="hh-iconbtn hh-iconbtn--bell"
              aria-label={attentionTotal > 0 ? t('top.alertsCount', { n: attentionTotal }) : t('top.alerts')}
            >
              <Bell size={22} strokeWidth={2.1} aria-hidden="true" />
              {attentionTotal > 0 && (
                <span className="hh-header__bell-badge" aria-hidden="true">
                  {attentionTotal > 99 ? '99+' : attentionTotal}
                </span>
              )}
            </button>
          )}
        </div>
        <div className="rt-segt" role="tablist" aria-label="Sales sections">
          <button
            type="button"
            role="tab"
            aria-selected={billingSubTab === 'create'}
            onClick={() => setBillingSubTab('create')}
            className="rt-segt__btn"
          >
            {t('sell.newSale')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={billingSubTab === 'history'}
            onClick={() => setBillingSubTab('history')}
            className="rt-segt__btn"
          >
            {t('sell.history')}
          </button>
        </div>
      </header>

      {/* Consistent Page Header (tablet/desktop only) */}
      <div className="hidden md:flex items-center justify-between gap-3 min-h-10 sm:min-h-11">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          {t('nav.sell')}
        </h1>
        {billingSubTab === 'history' && (
          <button
            type="button"
            onClick={() => setBillingSubTab('create')}
            className="size-10 sm:size-11 rounded-full bg-[var(--primary)] text-white flex items-center justify-center shadow-md cursor-pointer active:scale-95 transition-transform shrink-0"
            aria-label={t('sell.newSale')}
            title={t('sell.newSale')}
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Consistent Two-Tab Segmented Bar — Tablet & Desktop (Phone uses .rt-segt in blue header) */}
      <div
        className="hh-sales-tabs hidden md:flex bg-[#ebe8e1] rounded-full p-1"
        role="tablist"
        aria-label="Sales sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={billingSubTab === 'create'}
          id="tab-btn-new-sale"
          onClick={() => setBillingSubTab('create')}
          className={`flex-1 py-2.5 px-3 text-sm font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
            billingSubTab === 'create'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {t('sell.tabNewSale')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={billingSubTab === 'history'}
          id="tab-btn-sales-history"
          onClick={() => setBillingSubTab('history')}
          className={`flex-1 py-2.5 px-3 text-sm font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
            billingSubTab === 'history'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {t('sell.history')}
        </button>
      </div>

      {/* Success banner for newly finalized bill (single or auto-split pair) */}
      {(justSplitBills.length > 1 || justBill) && (
        isPhone ? (() => {
          const primary = justSplitBills.length > 1 ? justSplitBills[0] : justBill!;
          const totalAmt = justSplitBills.length > 1
            ? justSplitBills.reduce((s, b) => s + (Number(b.total) || 0), 0)
            : Number(primary.total) || 0;
          const docLabel = justSplitBills.length > 1
            ? justSplitBills.map((sb) => formatBillNumber(sb, billingSettings)).join(' + ')
            : formatBillNumber(primary, billingSettings);
          const isNg = isGstExcludedBill(primary, products);
          return (
            <div id="banner-just-finalized" className="hh-okb space-y-2" role="status">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-[var(--paid)]">
                  <Check size={16} strokeWidth={3} aria-hidden="true" />
                  <span>{t('sell.billSavedAmt', { amt: money(totalAmt) })}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setJustFinalizedBillId(null);
                    setJustFinalizedSplitIds([]);
                  }}
                  className="size-8 rounded-full flex items-center justify-center text-[var(--text-2)] cursor-pointer"
                  aria-label="Dismiss confirmation"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="text-[12px] font-semibold text-[var(--text)] break-words">
                #{docLabel} · {primary.retailer}
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  id="btn-print-just-saved"
                  onClick={() => {
                    setInvoiceModalBill(primary);
                    setInvoiceModalFormat(isNg ? 'non_gst' : undefined);
                  }}
                  className="hh-ib size-10"
                  aria-label={t('sell.view')}
                  title={t('sell.view')}
                >
                  <Eye size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceModalBill(primary);
                    setInvoiceModalFormat(isNg ? 'non_gst' : undefined);
                  }}
                  className="hh-ib size-10"
                  aria-label={t('sell.print')}
                  title={t('sell.print')}
                >
                  <Printer size={16} aria-hidden="true" />
                </button>
                {primary.phone && (
                  <button
                    type="button"
                    id="whatsapp-just-saved"
                    onClick={async () => {
                      const msg = whatsAppResultMessage(
                        await sendBillOnWhatsApp(primary, orgProfile, billingSettings, isNg ? 'non_gst' : undefined),
                      );
                      if (msg) toastNotify(msg.text, msg.kind);
                    }}
                    className="hh-ib hh-ib--wa size-10"
                    aria-label={t('sell.whatsapp')}
                    title={t('sell.whatsapp')}
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  id="btn-download-just-saved-pdf"
                  onClick={() => {
                    Promise.resolve(
                      downloadInvoicePdf(primary, orgProfile, billingSettings, isNg ? 'non_gst' : undefined),
                    ).catch((err) => console.error('Error downloading invoice PDF:', err));
                  }}
                  className="hh-ib size-10"
                  aria-label={t('sell.pdf')}
                  title={t('sell.pdf')}
                >
                  <Download size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setBillingSubTab('history')}
                  className="ml-auto text-[12px] font-bold text-[var(--primary-hover)] cursor-pointer min-h-[44px] inline-flex items-center px-1"
                >
                  <span>{t('sell.viewInHistory')} ➔</span>
                </button>
              </div>
            </div>
          );
        })() : (
        <div
          id="banner-just-finalized"
          className="hh-just-finalized border-2 p-3.5 space-y-2.5 shadow-sm-2xl rounded-xl"
          style={{ borderColor: palette.good, backgroundColor: `${palette.good}15` }}
          role="status"
        >
          {justSplitBills.length > 1 ? (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="hh-jf-title flex items-center gap-2" style={fz(14, { color: palette.good, fontWeight: 700 })}>
                  <Check size={Math.round(18 * scale)} aria-hidden="true" />
                  <span>
                    Split Checkout Saved for {justSplitBills[0].retailer} · Total ₹
                    {money(justSplitBills.reduce((s, b) => s + (Number(b.total) || 0), 0))}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBillingSubTab('history')}
                    className="hh-jf-btn hh-jf-btn--ghost inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:bg-white font-bold text-xs rounded-xl"
                    style={{
                      borderColor: palette.navy,
                      backgroundColor: `${palette.navy}10`,
                      color: palette.navy,
                    }}
                  >
                    <span>{t('sell.viewInHistory')} ➔</span>
                  </button>
                  <IconButton
                    onClick={() => {
                      setJustFinalizedBillId(null);
                      setJustFinalizedSplitIds([]);
                    }}
                    icon={X}
                    label="Dismiss confirmation"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {justSplitBills.map((sb) => {
                  const isNg = isGstExcludedBill(sb, products);
                  const docLabel = formatBillNumber(sb, billingSettings);
                  return (
                    <div
                      key={sb.id}
                      className="bg-white rounded-xl border border-slate-200 px-3 py-2 flex items-center justify-between gap-2 flex-wrap"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-slate-900">{docLabel}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isNg ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isNg ? 'Non-GST Memo' : 'GST Invoice'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 tabular-nums">₹{money(sb.total)}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            Promise.resolve(
                              downloadInvoicePdf(sb, orgProfile, billingSettings, isNg ? 'non_gst' : undefined),
                            ).catch((err) => console.error('Error downloading invoice PDF:', err));
                          }}
                          className="hh-jf-btn hh-jf-btn--primary inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white cursor-pointer"
                          style={{ backgroundColor: palette.navy }}
                        >
                          <Download size={12} /> PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInvoiceModalBill(sb);
                            setInvoiceModalFormat(isNg ? 'non_gst' : undefined);
                          }}
                          className="hh-jf-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-[11px] font-bold text-slate-800 cursor-pointer"
                        >
                          <Printer size={12} /> View
                        </button>
                        {sb.phone && (
                          <button
                            type="button"
                            onClick={async () => {
                              const msg = whatsAppResultMessage(
                                await sendBillOnWhatsApp(sb, orgProfile, billingSettings, isNg ? 'non_gst' : undefined),
                              );
                              if (msg) toastNotify(msg.text, msg.kind);
                            }}
                            className="hh-jf-btn hh-jf-btn--wa inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white cursor-pointer"
                            style={{ backgroundColor: '#25D366' }}
                          >
                            <MessageCircle size={12} /> WA
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : justBill ? (
            <div className="flex items-center justify-between flex-wrap gap-2.5">
              <div className="hh-jf-title flex items-center gap-2" style={fz(14, { color: palette.good, fontWeight: 700 })}>
                <Check size={Math.round(18 * scale)} aria-hidden="true" />
                <span>
                  {isGstExcludedBill(justBill, products) ? 'Cash Memo' : 'Bill'} #{formatBillNumber(justBill, billingSettings)} saved for {justBill.retailer} (₹{money(justBill.total)})
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* 1-Click Download PDF */}
                <button
                  type="button"
                  id="btn-download-just-saved-pdf"
                  onClick={() => { Promise.resolve(downloadInvoicePdf(justBill, orgProfile, billingSettings)).catch((err) => console.error('Error downloading invoice PDF:', err)); }}
                  className="hh-jf-btn hh-jf-btn--primary inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:opacity-95 font-bold shadow-sm text-xs rounded-xl"
                  style={{
                    backgroundColor: palette.navy,
                    borderColor: palette.navy,
                    color: '#FFFFFF',
                  }}
                  title="Download PDF"
                >
                  <Download size={14} aria-hidden="true" />
                  <span>Download PDF</span>
                </button>

                {/* View & Print Modal */}
                <button
                  type="button"
                  id="btn-print-just-saved"
                  onClick={() => setInvoiceModalBill(justBill)}
                  className="hh-jf-btn inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:bg-white font-bold text-xs rounded-xl"
                  style={{
                    borderColor: palette.line,
                    backgroundColor: palette.panel,
                    color: palette.ink,
                  }}
                  title="Open full printable bill"
                >
                  <Printer size={14} aria-hidden="true" />
                  <span>View &amp; Print</span>
                </button>

                {/* WhatsApp formatted receipt */}
                {justBill.phone && (
                  <button
                    type="button"
                    id="whatsapp-just-saved"
                    onClick={async () => {
                      const msg = whatsAppResultMessage(await sendBillOnWhatsApp(justBill, orgProfile, billingSettings));
                      if (msg) toastNotify(msg.text, msg.kind);
                    }}
                    className="hh-jf-btn hh-jf-btn--wa inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:opacity-95 font-bold shadow-sm text-xs rounded-xl"
                    style={{
                      borderColor: '#1EBE5D',
                      backgroundColor: '#25D366',
                      color: '#FFFFFF',
                    }}
                  >
                    <MessageCircle size={14} aria-hidden="true" />
                    <span>WhatsApp 80mm bill</span>
                  </button>
                )}

                {/* View in History Option */}
                <button
                  type="button"
                  onClick={() => setBillingSubTab('history')}
                  className="hh-jf-btn hh-jf-btn--ghost inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:bg-white font-bold text-xs rounded-xl"
                  style={{
                    borderColor: palette.navy,
                    backgroundColor: `${palette.navy}10`,
                    color: palette.navy,
                  }}
                >
                  <span>{t('sell.viewInHistory')} ➔</span>
                </button>

                <IconButton
                  onClick={() => {
                    setJustFinalizedBillId(null);
                    setJustFinalizedSplitIds([]);
                  }}
                  icon={X}
                  label="Dismiss confirmation"
                />
              </div>
            </div>
          ) : null}
        </div>
        )
      )}

      {/* CREATE SUBTAB: DEDICATED NEW SALE SCREEN */}
      {billingSubTab === 'create' && (
        <NewSaleScreen
          onBack={() => setBillingSubTab('history')}
          onOpenInvoiceModal={(b, format) => {
            setInvoiceModalBill(b);
            setInvoiceModalFormat(format);
          }}
        />
      )}

      {/* BILLING HISTORY SUBTAB */}
      {billingSubTab === 'history' && (
        <BillingHistoryView
          onViewInvoice={(b, format) => {
            setInvoiceModalBill(b);
            setInvoiceModalFormat(format);
          }}
          onEditBill={(b) => setEditModalBill(b)}
          onDeleteBill={(b) => setBillToDelete(b)}
          onCancelBill={(b) => {
            setCancelReason('');
            setBillToCancel(b);
          }}
          onNewInvoiceClick={() => setBillingSubTab('create')}
        />
      )}

      {/* Full GST / Non-GST Tax Invoice View & Print Modal */}
      {invoiceModalBill && (
        <TaxInvoiceModal
          bill={invoiceModalBill}
          defaultFormat={invoiceModalFormat}
          onClose={() => {
            setInvoiceModalBill(null);
            setInvoiceModalFormat(undefined);
          }}
          onEditBill={(b) => {
            setInvoiceModalBill(null);
            setEditModalBill(b);
          }}
          onCancelBill={(b) => {
            setInvoiceModalBill(null);
            setCancelReason('');
            setBillToCancel(b);
          }}
        />
      )}

      {/* In-Place Bill Edit Modal (for past invoices) */}
      {editModalBill && (
        <EditBillModal
          bill={editModalBill}
          onClose={() => setEditModalBill(null)}
          onSave={(updated, o) => updateBill(updated, o)}
          onSplitMixedBill={(draft, o) => splitMixedBill(draft, o)}
          previewEdit={previewBillEdit}
          onReopenTrip={reopenTrip}
          trips={trips}
          onRequestDelete={(b) => {
            setEditModalBill(null);
            setBillToDelete(b);
          }}
          products={products}
          promotions={promotions}
          warehouses={warehouses}
          existingCustomers={existingCustomers}
          gstMode={gstMode}
          palette={palette}
          invoicePrefix={billingSettings?.invoicePrefix || ''}
          remainingStock={remainingStock}
        />
      )}

      {/* Cancel invoice with credit note */}
      {billToCancel && (
        isPhone ? (() => {
          const preview = previewBillDelete(billToCancel.id);
          const totalCases = (billToCancel.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
          const dueReduced = Math.max(0, (Number(billToCancel.total) || 0) - (Number(billToCancel.amountPaid) || 0));
          const sib = billToCancel.splitGroupId
            ? (bills || []).filter(
                (b) => b.splitGroupId === billToCancel.splitGroupId && b.id !== billToCancel.id && b.status !== 'cancelled',
              )
            : [];
          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Cancel invoice with credit note"
              className="fixed inset-0 z-[9998] bg-black/45 flex items-end justify-center"
              onClick={() => setBillToCancel(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="hh-sheet rt-sheet-phone w-full max-h-[88vh] overflow-y-auto space-y-3"
              >
                <div className="hh-grab" aria-hidden="true" />
                <div>
                  <h3 className="text-base font-extrabold text-[var(--text)]">
                    {t('sell.cancelConfirmTitle', { no: formatBillNumber(billToCancel, billingSettings) })}
                  </h3>
                  <p className="text-xs font-medium text-[var(--text-2)] mt-0.5 break-words">
                    {billToCancel.retailer} · ₹{money(billToCancel.total)}
                  </p>
                </div>

                <div className="rt-card !py-2 !px-3 space-y-0.5">
                  <div className="rt-ln">
                    <span className="text-[var(--text-2)] font-medium">{t('sell.stockReturned')}</span>
                    <b className="text-[var(--text)] tabular-nums">
                      {preview?.stockLines.reduce((s, l) => s + l.qty, 0) ?? totalCases} {totalCases === 1 ? 'case' : 'cases'}
                    </b>
                  </div>
                  <div className="rt-ln">
                    <span className="text-[var(--text-2)] font-medium">{t('sell.dueReducedBy')}</span>
                    <b className="text-[var(--text)] tabular-nums">₹{money(dueReduced)}</b>
                  </div>
                  <div className="rt-ln">
                    <span className="text-[var(--text-2)] font-medium">{t('sell.creditNote')}</span>
                    <b className="text-[var(--text)] font-mono">{previewCancelCnNo}</b>
                  </div>
                </div>

                {billToCancel.amountPaid > 0 && (
                  <p className="rt-notice rt-notice--due">
                    ₹{money(billToCancel.amountPaid)} already collected will be marked as refund due on {previewCancelCnNo}.
                  </p>
                )}

                {sib.length > 0 && (
                  <p className="rt-notice rt-notice--soon">
                    Part of a split order: {sib.map((b) => formatBillNumber(b, billingSettings)).join(', ')} stays active unless cancelled separately.
                  </p>
                )}

                <div>
                  <label htmlFor="cancel-reason-phone" className="block text-xs font-semibold text-[var(--text-2)] mb-1.5">
                    {t('sell.reasonRequired')}
                  </label>
                  <textarea
                    id="cancel-reason-phone"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder={t('sell.reasonPlaceholder')}
                    className="rt-ta"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setBillToCancel(null)}
                    className="rt-btn-outline flex-1"
                  >
                    {t('sell.keepBill')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cn = cancelBill(billToCancel.id, cancelReason);
                      setBillToCancel(null);
                      if (cn) notify(`Invoice cancelled. Credit note ${cn.creditNoteNo} issued${cn.refundDue > 0 ? ` — refund due ₹${cn.refundDue.toFixed(2)}` : ''}.`);
                    }}
                    className="rt-btn rt-btn--due flex-1"
                  >
                    {t('sell.cancelBill')}
                  </button>
                </div>
              </div>
            </div>
          );
        })() : (
        <div role="dialog" aria-modal="true" aria-label="Cancel invoice with credit note" className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3 text-sm">
            <h3 className="font-bold text-slate-900">
              Cancel Invoice #{formatBillNumber(billToCancel, billingSettings)} with credit note
            </h3>
            <p className="text-xs text-slate-600">
              The invoice stays on record (its number is not reused). Stock returns, the customer's due is removed and
              it leaves its trip.
              {billToCancel.amountPaid > 0 &&
                ` ₹${billToCancel.amountPaid.toFixed(2)} already collected will be marked as refund due on the credit note.`}
            </p>
            {(() => {
              const sib = billToCancel.splitGroupId
                ? (bills || []).filter(
                    (b) => b.splitGroupId === billToCancel.splitGroupId && b.id !== billToCancel.id && b.status !== 'cancelled',
                  )
                : [];
              return sib.length > 0 ? (
                <p className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1.5">
                  This bill is part of a split order. {sib.map((b) => formatBillNumber(b, billingSettings)).join(', ')} stays active
                  - cancel it separately if the whole sale is being cancelled.
                </p>
              ) : null;
            })()}
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (e.g. wrong quantity, customer returned goods)"
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBillToCancel(null)}
                className="px-3 py-1.5 text-xs font-bold rounded border border-slate-300 cursor-pointer"
              >
                Keep invoice
              </button>
              <button
                type="button"
                onClick={() => {
                  const cn = cancelBill(billToCancel.id, cancelReason);
                  setBillToCancel(null);
                  if (cn) notify(`Invoice cancelled. Credit note ${cn.creditNoteNo} issued${cn.refundDue > 0 ? ` — refund due ₹${cn.refundDue.toFixed(2)}` : ''}.`);
                }}
                className="px-3 py-1.5 text-xs font-bold rounded bg-rose-600 text-white cursor-pointer"
              >
                Cancel invoice
              </button>
            </div>
          </div>
        </div>
        )
      )}

      {/* Credit notes issued */}
      {billingSubTab === 'history' && cancelledBills.length > 0 && (
        isPhone ? (
          <div className="rt-card hh-cancelled-card">
            <h4 className="text-[13px] font-bold text-[var(--text)] mb-1">
              Cancelled invoices / credit notes ({cancelledBills.length})
            </h4>
            <div>
              {cancelledBills.map((b) => {
                const refundDue = b.cancellation?.refundDue || 0;
                return (
                  <div key={b.id} className="rt-rowi !items-start">
                    <div className={`rt-ico ${refundDue > 0 ? 'rt-ico--due' : 'rt-ico--muted'}`} aria-hidden="true">
                      <RotateCcw size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-bold text-[var(--text)] break-words">
                        {b.cancellation?.creditNoteNo} · {formatBillNumber(b, billingSettings)}
                      </div>
                      <div className="text-[11.5px] text-[var(--text-2)] break-words">
                        {b.retailer} · {b.cancellation?.date}
                      </div>
                      {b.cancellation?.reason && (
                        <div className="text-[11.5px] text-[var(--text-2)] break-words">
                          {b.cancellation.reason}
                        </div>
                      )}
                    </div>
                    <div className="rt-amt">
                      <div className="text-[13px] font-bold text-[var(--text)] tabular-nums">
                        ₹{money(b.total)}
                      </div>
                      <div className="mt-1">
                        {refundDue > 0 ? (
                          <span className="rt-tag rt-tag--due">
                            {t('sell.refundDueAmt', { amt: money(refundDue) })}
                          </span>
                        ) : (
                          <span className="rt-tag">{t('sell.settled')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
        <div className="hh-cancelled-card mt-4 border border-slate-200 rounded-lg bg-white p-3">
          <h4 className="text-xs font-bold text-slate-800 mb-2">Cancelled invoices / credit notes ({cancelledBills.length})</h4>
          <div className="space-y-1">
            {cancelledBills.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-700 border-b border-slate-100 py-1">
                <span className="font-mono font-bold">{b.cancellation?.creditNoteNo}</span>
                <span>{formatBillNumber(b, billingSettings)}</span>
                <span>{b.retailer}</span>
                <span>₹{b.total.toFixed(2)}</span>
                <span>{b.cancellation?.date}</span>
                <span className="text-slate-500">{b.cancellation?.reason}</span>
                {(b.cancellation?.refundDue || 0) > 0 && (
                  <span className="text-rose-700 font-semibold">Refund due ₹{b.cancellation!.refundDue.toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
        )
      )}

      {/* Safe Delete Bill Confirmation Modal */}
      {billToDelete && (
        <DeleteConfirmModal
          bill={billToDelete}
          preview={previewBillDelete(billToDelete.id)}
          onConfirm={(id, o) => {
            // Stay open when the delete is refused (closed trip, returns) so the message is not lost.
            if (deleteBill(id, o)) setBillToDelete(null);
          }}
          onReopenTrip={reopenTrip}
          onCancel={() => setBillToDelete(null)}
          palette={palette}
          invoicePrefix={billingSettings?.invoicePrefix || ''}
        />
      )}
    </div>
  );
};

export default BillingView;
