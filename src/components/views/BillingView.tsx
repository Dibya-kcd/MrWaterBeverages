import React, { useState, useMemo, useEffect } from 'react';
import {
  Check,
  Clock,
  Download,
  FileText,
  History,
  MessageCircle,
  Plus,
  Printer,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Bill, ExistingCustomer } from '../../types';
import {
  money,
  whatsappLink,
} from '../../utils/billing';
import { downloadInvoicePdf } from '../../utils/invoicePdf';
import { IconButton } from '../common/IconButton';
import { TaxInvoiceModal } from '../common/TaxInvoiceModal';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { EditBillModal } from '../common/EditBillModal';
import { BillingHistoryView } from './BillingHistoryView';
import { BillingWorkflow } from './BillingWorkflow';
import { NewSaleScreen } from './NewSaleScreen';
import { billBalance } from '../../utils/salesReturns';
import { sendBillOnWhatsApp, whatsAppResultMessage } from '../../utils/whatsappBill';
import { notify as toastNotify } from '../../utils/toast';

export const BillingView: React.FC = () => {
  const {
    products,
    bills,
    editingBillId,
    updateBill,
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

  return (
    <div id="view-billing" className="hh-view mw-workspace space-y-4 min-w-0 max-w-full overflow-x-hidden">
      {/* Page title for the history tab (New sale has its own title bar) */}
      {billingSubTab === 'history' && (
        <div className="hh-pagehead">
          <h1>Sales history</h1>
        </div>
      )}

      {/* Top Two Navigation Buttons — New sale & Sales history */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="tab-btn-new-sale"
            onClick={() => setBillingSubTab('create')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              billingSubTab === 'create'
                ? 'bg-[var(--primary)] text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New sale</span>
          </button>
          <button
            type="button"
            id="tab-btn-sales-history"
            onClick={() => setBillingSubTab('history')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              billingSubTab === 'history'
                ? 'bg-[var(--primary)] text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Sales history</span>
          </button>
        </div>

      </div>

      {/* Success banner for newly finalized bill */}
      {justBill && (
        <div
          id="banner-just-finalized"
          className="border-2 p-3.5 flex items-center justify-between flex-wrap gap-2.5 shadow-sm-2xl"
          style={{ borderColor: palette.good, backgroundColor: `${palette.good}15` }}
          role="status"
        >
          <div className="flex items-center gap-2" style={fz(14, { color: palette.good, fontWeight: 700 })}>
            <Check size={Math.round(18 * scale)} aria-hidden="true" />
            <span>
              Bill #{billingSettings?.invoicePrefix ? `${billingSettings.invoicePrefix}-` : ''}{justBill.id} saved for {justBill.retailer} (₹{money(justBill.total)})
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 1-Click Download PDF */}
            <button
              type="button"
              id="btn-download-just-saved-pdf"
              onClick={() => downloadInvoicePdf(justBill, orgProfile, billingSettings)}
              className="inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:opacity-95 font-bold shadow-sm text-xs rounded-xl"
              style={{
                backgroundColor: palette.navy,
                borderColor: palette.navy,
                color: '#FFFFFF',
              }}
              title="Download GST Tax Invoice PDF"
            >
              <Download size={14} aria-hidden="true" />
              <span>Download PDF</span>
            </button>

            {/* View & Print Modal */}
            <button
              type="button"
              id="btn-print-just-saved"
              onClick={() => setInvoiceModalBill(justBill)}
              className="inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:bg-white font-bold text-xs rounded-xl"
              style={{
                borderColor: palette.line,
                backgroundColor: palette.panel,
                color: palette.ink,
              }}
              title="Open full printable GST invoice"
            >
              <Printer size={14} aria-hidden="true" />
              <span>View & Print</span>
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
                className="inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:opacity-95 font-bold shadow-sm text-xs rounded-xl"
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
              className="inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:bg-white font-bold text-xs rounded-xl"
              style={{
                borderColor: palette.navy,
                backgroundColor: `${palette.navy}10`,
                color: palette.navy,
              }}
            >
              <span>View in History ➔</span>
            </button>

            <IconButton
              onClick={() => setJustFinalizedBillId(null)}
              icon={X}
              label="Dismiss confirmation"
            />
          </div>
        </div>
      )}

      {/* CREATE SUBTAB: DEDICATED NEW SALE SCREEN */}
      {billingSubTab === 'create' && (
        <NewSaleScreen
          onBack={() => setBillingSubTab('history')}
          onOpenInvoiceModal={(b, format) => {
            setInvoiceModalBill(b);
            setInvoiceModalFormat(format);
          }}
          onOpenHistory={() => setBillingSubTab('history')}
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
        />
      )}

      {/* In-Place Bill Edit Modal (for past invoices) */}
      {editModalBill && (
        <EditBillModal
          bill={editModalBill}
          onClose={() => setEditModalBill(null)}
          onSave={(updated, o) => updateBill(updated, o)}
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
        <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3 text-sm">
            <h3 className="font-bold text-slate-900">
              Cancel Invoice #{billingSettings?.invoicePrefix || ''}{billToCancel.id} with credit note
            </h3>
            <p className="text-xs text-slate-600">
              The invoice stays on record (its number is not reused). Stock returns, the customer's due is removed and
              it leaves its trip.
              {billToCancel.amountPaid > 0 &&
                ` ₹${billToCancel.amountPaid.toFixed(2)} already collected will be marked as refund due on the credit note.`}
            </p>
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
      )}

      {/* Credit notes issued */}
      {billingSubTab === 'history' && cancelledBills.length > 0 && (
        <div className="mt-4 border border-slate-200 rounded-lg bg-white p-3">
          <h4 className="text-xs font-bold text-slate-800 mb-2">Cancelled invoices / credit notes ({cancelledBills.length})</h4>
          <div className="space-y-1">
            {cancelledBills.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-700 border-b border-slate-100 py-1">
                <span className="font-mono font-bold">{b.cancellation?.creditNoteNo}</span>
                <span>Inv #{billingSettings?.invoicePrefix || ''}{b.id}</span>
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
