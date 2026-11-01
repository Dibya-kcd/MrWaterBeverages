import React, { useMemo, useState } from "react";
import { X, History } from "lucide-react";
import type { PaymentAuditEntry } from "../../types";
import { money } from "../../utils/billing";

const LABEL: Record<PaymentAuditEntry["action"], string> = {
  record: "Recorded",
  edit: "Edited",
  delete: "Deleted",
  refund: "Refund paid",
  apply_advance: "Advance adjusted",
  invoice_cancelled: "Invoice cancelled",
  invoice_deleted: "Invoice deleted",
  invoice_edited: "Invoice edited",
};

/** Read-only history of payment changes (kept on this device). */
export const PaymentAuditModal: React.FC<{
  entries: PaymentAuditEntry[];
  onClose: () => void;
}> = ({ entries, onClose }) => {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return entries.slice(0, 300);
    return entries
      .filter((e) =>
        [e.customerName, e.note, e.by, LABEL[e.action], e.billId ? `#${e.billId}` : ""]
          .join(" ")
          .toLowerCase()
          .includes(s),
      )
      .slice(0, 300);
  }, [entries, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden my-auto">
        <div className="px-5 py-4 flex items-center justify-between bg-[#0d4a3a] text-white">
          <div className="flex items-center gap-2">
            <History size={18} />
            <div>
              <h2 className="font-bold text-base">Payment history log</h2>
              <p className="text-[11px] text-white/70">Who recorded, changed or deleted payments</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10" title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          <input enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customer, invoice, user…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
          />
          {shown.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No payment changes logged yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {shown.map((e) => (
                <li key={e.id} className="py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-sm font-semibold text-slate-800">
                      {LABEL[e.action]}
                      {e.customerName ? ` · ${e.customerName}` : ""}
                      {e.billId ? ` · Inv #${e.billId}` : ""}
                    </span>
                    {e.amount !== undefined && (
                      <span className="text-sm font-bold tabular-nums text-slate-700">
                        {e.amount < 0 ? "−" : ""}₹{money(Math.abs(e.amount))}
                      </span>
                    )}
                  </div>
                  {e.note && <p className="text-xs text-slate-600 mt-0.5">{e.note}</p>}
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(e.at).toLocaleString("en-IN")} · {e.by}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
