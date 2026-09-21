import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { Bill } from '../../types';
import { money } from '../../utils/billing';

interface DeleteConfirmModalProps {
  bill: Bill | null;
  onConfirm: (billId: number) => void;
  onCancel: () => void;
  palette: any;
  invoicePrefix?: string;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  bill,
  onConfirm,
  onCancel,
  palette,
  invoicePrefix = '',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  if (!bill) return null;

  const due = Math.max(0, bill.total - bill.amountPaid);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl border-2 overflow-hidden bg-white text-stone-900 animate-in zoom-in-95 duration-150"
        style={{
          borderColor: palette.bad,
          backgroundColor: palette.cardBg || '#ffffff',
          color: palette.text,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between border-b"
          style={{
            borderColor: `${palette.bad}30`,
            backgroundColor: `${palette.bad}10`,
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: palette.bad }}
            >
              <Trash2 size={18} />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight" style={{ color: palette.bad }}>
                Delete Bill #{invoicePrefix}{bill.id}
              </h3>
              <p className="text-xs opacity-75">
                Permanent deletion confirmation
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg transition-colors hover:bg-stone-200/60 focus:outline-none"
            style={{ color: palette.muted }}
            title="Cancel"
            id="cancel-delete-modal-x"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs">
            <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-bold">Are you sure you want to delete this bill?</p>
              <p className="opacity-90 mt-0.5">
                This will delete bill #{invoicePrefix}{bill.id} from Supabase cloud database and local state.
              </p>
            </div>
          </div>

          <div
            className="p-3.5 rounded-lg border text-sm space-y-2"
            style={{ borderColor: palette.border, backgroundColor: palette.bg }}
          >
            <div className="flex justify-between">
              <span className="opacity-60 text-xs">Retailer / Party:</span>
              <span className="font-bold text-sm">{bill.retailer}</span>
            </div>
            {bill.phone && (
              <div className="flex justify-between">
                <span className="opacity-60 text-xs">Phone:</span>
                <span className="font-mono text-xs">{bill.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="opacity-60 text-xs">Invoice Date:</span>
              <span className="text-xs">{bill.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60 text-xs">Total Amount:</span>
              <span className="font-bold text-sm">₹{money(bill.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60 text-xs">Amount Paid / Due:</span>
              <span className="text-xs">
                Paid: ₹{money(bill.amountPaid)} | Due: <span className="font-bold text-red-600">₹{money(due)}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60 text-xs">Billed Items:</span>
              <span className="text-xs font-medium">
                {bill.items.length} item{bill.items.length !== 1 ? 's' : ''} ({bill.items.reduce((s, i) => s + i.qty, 0)} cases)
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div
          className="px-5 py-3.5 bg-stone-50 border-t flex items-center justify-end gap-2.5"
          style={{ borderColor: palette.border, backgroundColor: palette.bg }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-stone-200"
            style={{ borderColor: palette.border }}
            id="cancel-delete-btn"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(bill.id)}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white shadow-xs transition-all hover:opacity-90 flex items-center gap-1.5"
            style={{ backgroundColor: palette.bad }}
            id="confirm-delete-bill-btn"
          >
            <Trash2 size={16} />
            Yes, Delete Bill
          </button>
        </div>
      </div>
    </div>
  );
};
