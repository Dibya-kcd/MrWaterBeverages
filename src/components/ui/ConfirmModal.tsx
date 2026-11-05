import React, { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from './Button';

export interface DeleteImpactItem {
  label: string;
  detail?: string;
  qtyChange?: string;
}

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  onConfirmWithComment?: (comment: string) => void | Promise<void>;
  title: string;
  subtitle?: string;
  message?: string;
  impactItems?: DeleteImpactItem[];
  warningNote?: string;
  confirmationPrompt?: string;
  rectificationPrompt?: string;
  rectificationPlaceholder?: string;
  /** Starting text for the comment box (lets a caller keep what was typed if the action fails). */
  initialComment?: string;
  /** When set, the confirm button stays disabled until the comment has at least this many characters. */
  commentMinLength?: number;
  confirmButtonLabel?: string;
  cancelButtonLabel?: string;
  requiresCheckbox?: boolean;
  isLoading?: boolean;
  variant?: 'danger' | 'warning' | 'primary';
  /** Icon on the confirm button; defaults to a trash can (delete dialogs). */
  confirmIcon?: React.ReactNode;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onConfirmWithComment,
  title,
  subtitle,
  message,
  impactItems = [],
  warningNote,
  confirmationPrompt,
  rectificationPrompt,
  rectificationPlaceholder = 'Enter reason or comment for this rectification (e.g. wrong amount, duplicate, customer request)...',
  confirmButtonLabel = 'Delete Permanently',
  cancelButtonLabel = 'Cancel',
  requiresCheckbox = false,
  isLoading = false,
  variant = 'danger',
  confirmIcon,
  initialComment = '',
  commentMinLength = 0,
}) => {
  const [isChecked, setIsChecked] = useState(false);
  const [comment, setComment] = useState(initialComment);

  if (!isOpen) return null;

  const commentTooShort = Boolean(rectificationPrompt) && commentMinLength > 0 && comment.trim().length < commentMinLength;
  const isConfirmDisabled = (requiresCheckbox && !isChecked) || isLoading || commentTooShort;

  const handleConfirm = async () => {
    if (isConfirmDisabled) return;
    if (onConfirmWithComment) {
      await onConfirmWithComment(comment.trim());
    } else {
      await onConfirm();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              {variant === 'danger' ? (
                <Trash2 className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {message && (
            <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
          )}

          {warningNote && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200/70 text-amber-900 text-xs leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>{warningNote}</div>
            </div>
          )}

          {impactItems.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Impacted Records & Stock
              </span>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto bg-slate-50/60">
                {impactItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 flex items-center justify-between text-xs gap-2"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-slate-800 truncate block">
                        {item.label}
                      </span>
                      {item.detail && (
                        <span className="text-slate-500 text-[11px] block">
                          {item.detail}
                        </span>
                      )}
                    </div>
                    {item.qtyChange && (
                      <span className="font-mono font-semibold px-2 py-0.5 rounded text-rose-700 bg-rose-50 border border-rose-200/60 shrink-0 text-[11px]">
                        {item.qtyChange}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rectification / Reason Comment Input (optional) */}
          {rectificationPrompt && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                {rectificationPrompt}
              </label>
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={rectificationPlaceholder}
                className="w-full text-sm p-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none font-sans"
              />
              {commentTooShort && (
                <p className="text-[11px] text-slate-500">Write a short reason (at least {commentMinLength} characters) to save.</p>
              )}
            </div>
          )}

          {/* Double Confirmation Checkbox (optional) */}
          {confirmationPrompt && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setIsChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-rose-600 cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-700 leading-snug">
                {confirmationPrompt}
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
            {cancelButtonLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={handleConfirm}
            isLoading={isLoading}
            disabled={isConfirmDisabled}
            leftIcon={confirmIcon ?? <Trash2 className="w-3.5 h-3.5" />}
          >
            {confirmButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
