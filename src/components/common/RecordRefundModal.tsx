import React, { useState } from "react";
import { X, Undo2 } from "lucide-react";
import type { PaymentMode } from "../../types";
import { todayISO } from "../../utils/dateLocal";
import { money } from "../../utils/billing";

interface Props {
  customerName: string;
  /** Most that can be paid back (the customer's credit). */
  maxAmount: number;
  onClose: () => void;
  onSave: (amount: number, date: string, mode: PaymentMode, note?: string) => boolean;
}

const MODES: { id: PaymentMode; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI / QR" },
  { id: "bank", label: "Bank / NEFT" },
  { id: "cheque", label: "Cheque" },
  { id: "other", label: "Other" },
];

/** Pay a customer's credit (advance, cancelled-invoice money, return credit) back to them. */
export const RecordRefundModal: React.FC<Props> = ({
  customerName,
  maxAmount,
  onClose,
  onSave,
}) => {
  const [amount, setAmount] = useState(String(maxAmount || ""));
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const n = Number(String(amount).replace(/,/g, ""));
    if (!(n > 0)) return setError("Enter a refund amount greater than zero.");
    if (n > maxAmount + 0.009)
      return setError(`Refund cannot be more than the customer's credit of ₹${money(maxAmount)}.`);
    if (!date || date > todayISO()) return setError("Choose a valid date that is not in the future.");
    if (onSave(n, date, mode, note.trim() || undefined)) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden my-auto">
        <div className="px-5 py-4 flex items-center justify-between bg-[#0d4a3a] text-white">
          <div className="flex items-center gap-2">
            <Undo2 size={18} />
            <div>
              <h2 className="font-bold text-base">Refund to customer</h2>
              <p className="text-[11px] text-white/70">{customerName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10" title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-600">
            Credit available to refund: <b>₹{money(maxAmount)}</b>. This pays money back to the customer and
            brings their balance back to zero.
          </p>
          <label className="block text-xs font-semibold text-slate-700">
            Amount (₹)
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Date
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1">Paid by</div>
            <div className="flex flex-wrap gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    mode === m.id ? "bg-[#0d4a3a] text-white border-[#0d4a3a]" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-xs font-semibold text-slate-700">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="e.g. cancelled invoice refund"
            />
          </label>
          {error && <p className="text-xs text-rose-700 font-medium">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button type="button" onClick={submit} className="flex-1 py-2.5 rounded-xl bg-[#0d4a3a] text-white text-sm font-semibold">
              Record refund
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
