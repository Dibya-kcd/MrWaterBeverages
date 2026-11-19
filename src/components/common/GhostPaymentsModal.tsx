import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckSquare, Sparkles, Square, Trash2, X } from "lucide-react";
import type { GhostPaymentCandidate } from "../../utils/ghostPayments";
import { money } from "../../utils/billing";
import { EmptyState } from "./EmptyState";
import { Button } from "../ui/Button";

interface GhostPaymentsModalProps {
  candidates: GhostPaymentCandidate[];
  onRemoveSelected: (ids: string[], reason: string) => void;
  onClose: () => void;
}

const CATEGORY_LABEL: Record<GhostPaymentCandidate["category"], string> = {
  deleted_bill_advance: "Advance from deleted invoice",
  deleted_bill_link: "Linked to deleted/cancelled bill",
  deleted_customer: "Deleted customer payment",
  duplicate_synthetic: "Duplicate / orphan auto-payment",
};

const CATEGORY_TONE: Record<GhostPaymentCandidate["category"], string> = {
  deleted_bill_advance: "bg-amber-100 text-amber-900 border-amber-200",
  deleted_bill_link: "bg-rose-100 text-rose-800 border-rose-200",
  deleted_customer: "bg-purple-100 text-purple-800 border-purple-200",
  duplicate_synthetic: "bg-slate-100 text-slate-700 border-slate-200",
};

export const GhostPaymentsModal: React.FC<GhostPaymentsModalProps> = ({
  candidates,
  onRemoveSelected,
  onClose,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(candidates.map((c) => c.payment.id)),
  );
  const [reason, setReason] = useState("Duplicate / orphan ghost payment cleanup");

  useEffect(() => {
    setSelectedIds(new Set(candidates.map((c) => c.payment.id)));
  }, [candidates]);

  const totalSelectedAmount = useMemo(
    () =>
      candidates
        .filter((c) => selectedIds.has(c.payment.id))
        .reduce((s, c) => s + (Number(c.payment.amount) || 0), 0),
    [candidates, selectedIds],
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === candidates.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(candidates.map((c) => c.payment.id)));
  };

  return (
    <div
      data-esc-close
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden my-auto border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <Sparkles size={18} className="text-amber-300" />
            <div>
              <h2 className="font-bold text-base">Ghost & Orphan Payments Check</h2>
              <p className="text-[11px] text-white/70">
                Payments left behind by deleted duplicate bills or deleted customers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
            title="Close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {candidates.length === 0 ? (
            <EmptyState
              compact
              title="No ghost payments found"
              description="All payment receipts match live invoices and active customer accounts."
            />
          ) : (
            <>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  Uncheck any real advance you intentionally kept on a customer&apos;s account. Selected rows will be permanently removed and logged in the payment audit trail.
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-emerald-700 cursor-pointer"
                >
                  {selectedIds.size === candidates.length ? (
                    <CheckSquare className="w-4 h-4 text-emerald-700" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>
                    {selectedIds.size === candidates.length ? "Deselect all" : "Select all"} ({candidates.length})
                  </span>
                </button>
                <span className="font-semibold">
                  Selected total: ₹{money(totalSelectedAmount)}
                </span>
              </div>

              <ul className="divide-y divide-slate-100 max-h-[45vh] overflow-y-auto border border-slate-200 rounded-xl">
                {candidates.map(({ payment, category, reason: itemReason }) => {
                  const checked = selectedIds.has(payment.id);
                  return (
                    <li
                      key={payment.id}
                      onClick={() => toggle(payment.id)}
                      className={`p-3 flex items-start gap-3 cursor-pointer transition-colors ${
                        checked ? "bg-rose-50/40" : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(payment.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 rounded accent-rose-600 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            {payment.customerName || "Unknown customer"}
                          </span>
                          <span className="font-bold text-sm tabular-nums text-rose-700">
                            ₹{money(payment.amount)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className={`px-2 py-0.5 rounded-md border font-semibold ${CATEGORY_TONE[category]}`}>
                            {CATEGORY_LABEL[category]}
                          </span>
                          <span className="text-slate-500">
                            {payment.paymentDate || payment.createdAt?.slice(0, 10) || "—"} ·{" "}
                            {String(payment.mode || "cash").toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{itemReason}</p>
                        {payment.referenceNote && (
                          <p className="text-[11px] text-slate-400 truncate">
                            Note: {payment.referenceNote}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Cleanup note (saved in audit log)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-700"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          {candidates.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              disabled={selectedIds.size === 0}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => {
                onRemoveSelected(Array.from(selectedIds), reason.trim() || "Ghost payment cleanup");
                onClose();
              }}
            >
              Remove Selected ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
