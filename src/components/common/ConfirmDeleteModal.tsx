import React, { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';

export interface DeleteImpactItem {
  label: string;
  detail?: string;
  qtyChange?: string;
}

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle?: string;
  impactItems?: DeleteImpactItem[];
  warningNote?: string;
  confirmationPrompt?: string;
  confirmButtonLabel?: string;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  impactItems = [],
  warningNote,
  confirmationPrompt = 'I understand this action will reverse or delete these records and cannot be undone.',
  confirmButtonLabel = 'Permanently Delete',
}) => {
  const { palette, fz } = useLedger();
  const [isChecked, setIsChecked] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-lg bg-white border-2 rounded shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ borderColor: palette.bad }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between border-b-2"
          style={{ backgroundColor: `${palette.bad}15`, borderColor: palette.bad }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="p-1.5 rounded-full flex items-center justify-center text-white"
              style={{ backgroundColor: palette.bad }}
            >
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 id="confirm-delete-title" className="font-bold text-base" style={{ color: palette.bad }}>
                {title}
              </h3>
              {subtitle && <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content & Impact list */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {warningNote && (
            <div
              className="p-3 border rounded text-xs leading-relaxed font-medium"
              style={{
                backgroundColor: '#fff5f5',
                borderColor: '#feb2b2',
                color: '#9b2c2c',
              }}
            >
              {warningNote}
            </div>
          )}

          {impactItems.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Inventory & Record Impact:
              </div>
              <div className="border rounded divide-y divide-slate-100 max-h-48 overflow-y-auto bg-slate-50/50">
                {impactItems.map((item, idx) => (
                  <div key={idx} className="px-3 py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{item.label}</span>
                      {item.detail && <span className="text-slate-500 ml-1.5 font-mono">({item.detail})</span>}
                    </div>
                    {item.qtyChange && (
                      <span className="font-bold font-mono px-2 py-0.5 rounded text-red-700 bg-red-50 border border-red-200">
                        {item.qtyChange}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Double Confirmation Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded bg-amber-50/70 border border-amber-200 cursor-pointer select-none">
            <input
              type="checkbox"
              id="chk-double-confirm"
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-red-600 cursor-pointer"
            />
            <span className="text-xs font-bold text-amber-950 leading-snug">
              {confirmationPrompt}
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="px-5 py-3.5 bg-slate-50 border-t flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
          >
            Cancel (Keep Safe)
          </button>
          <button
            type="button"
            id="btn-confirm-delete-action"
            disabled={!isChecked}
            onClick={() => {
              if (isChecked) {
                onConfirm();
                onClose();
              }
            }}
            className="px-4 py-2 text-xs font-bold rounded flex items-center gap-1.5 text-white transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            style={{ backgroundColor: palette.bad }}
          >
            <Trash2 size={14} />
            {confirmButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
