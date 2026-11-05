import React, { useMemo, useState } from "react";
import {
  Calendar,
  IndianRupee,
  Plus,
  Receipt,
  Search,
  Trash2,
  Truck,
  User,
  Wallet,
  X,
  Pencil,
  Filter,
} from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import type { BusinessExpenseRecord } from "../../utils/storage";
import {
  EXPENSE_LABELS,
  EXPENSE_CATEGORY_KEYS,
  PAY_CATEGORIES,
} from "../../utils/netProfit";
import { money } from "../../utils/billing";
import { todayISO } from "../../utils/dateLocal";
import { PartySearchSelect, type PartyOption } from "../common/PartySearchSelect";

type Mode = "cash" | "upi" | "bank" | "cheque" | "other";

const MODES: { id: Mode; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "cheque", label: "Cheque" },
  { id: "other", label: "Other" },
];

function catLabel(key: string) {
  return EXPENSE_LABELS[key] || key;
}

export const ExpensesView: React.FC = () => {
  const {
    expenses,
    addExpense,
    updateExpense,
    deleteExpense,
    customers,
    trips,
    salesmen,
    bills,
  } = useLedger();

  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<string>("fuel");
  const [amount, setAmount] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<Mode>("cash");
  const [referenceNote, setReferenceNote] = useState("");
  const [tripId, setTripId] = useState("");
  const [billId, setBillId] = useState("");

  const partyOptions: PartyOption[] = useMemo(() => {
    const list: PartyOption[] = (customers || []).map((c) => ({
      key: c.id,
      name: c.name,
      phone: c.phone || "",
      due: 0,
      advance: 0,
    }));
    const names = new Set(list.map((c) => c.name.trim().toLowerCase()));
    (expenses || []).forEach((e) => {
      const n = (e.paidTo || "").trim();
      if (n && !names.has(n.toLowerCase())) {
        names.add(n.toLowerCase());
        list.push({ key: `name:${n}`, name: n, phone: "", due: 0, advance: 0 });
      }
    });
    (salesmen || []).forEach((s: any) => {
      const n = String(s?.name || "").trim();
      if (n && !names.has(n.toLowerCase())) {
        names.add(n.toLowerCase());
        list.push({ key: `sm:${s.id || n}`, name: n, phone: "", due: 0, advance: 0 });
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, expenses, salesmen]);

  const recentTrips = useMemo(
    () =>
      [...(trips || [])]
        .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 80),
    [trips],
  );

  const openBills = useMemo(() => {
    return (bills || [])
      .filter((b) => !b.cancelled && b.status !== 'cancelled')
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 100);
  }, [bills]);

  const resetForm = () => {
    setDate(todayISO());
    setCategory("fuel");
    setAmount("");
    setPaidTo("");
    setCustomerId(undefined);
    setNote("");
    setMode("cash");
    setReferenceNote("");
    setTripId("");
    setBillId("");
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (e: BusinessExpenseRecord) => {
    setEditingId(e.id);
    setDate(String(e.date).slice(0, 10));
    setCategory(e.category || "misc");
    setAmount(String(e.amount ?? ""));
    setPaidTo(e.paidTo || "");
    setCustomerId(e.customerId);
    setNote(e.note || "");
    setMode(((e.mode as Mode) || "cash") as Mode);
    setReferenceNote(e.referenceNote || "");
    setTripId(e.tripId != null ? String(e.tripId) : "");
    setBillId(e.billId != null ? String(e.billId) : "");
    setShowForm(true);
  };

  const submit = () => {
    const amt = Math.max(0, Number(amount) || 0);
    if (amt <= 0) return;
    const trip = recentTrips.find((t: any) => String(t.id) === String(tripId));
    const payload: Omit<BusinessExpenseRecord, "id"> = {
      date: date.slice(0, 10),
      category,
      amount: amt,
      note: note.trim(),
      paidTo: paidTo.trim() || undefined,
      customerId: customerId && !customerId.startsWith("name:") && !customerId.startsWith("sm:")
        ? customerId
        : undefined,
      tripId: trip ? Number(trip.id) : undefined,
      tripLabel: trip
        ? `Trip #${trip.id} · ${String(trip.date).slice(0, 10)} · ${trip.vehicle || "vehicle"}`
        : undefined,
      billId: billId ? Number(billId) : undefined,
      mode,
      referenceNote: referenceNote.trim() || undefined,
    };
    if (editingId) {
      updateExpense(editingId, payload);
    } else {
      addExpense(payload);
    }
    setShowForm(false);
    resetForm();
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (expenses || []).filter((e) => {
      if (catFilter !== "all" && e.category !== catFilter) return false;
      if (!query) return true;
      const blob = [
        e.paidTo,
        e.note,
        e.category,
        catLabel(e.category),
        e.referenceNote,
        e.tripLabel,
        String(e.amount),
        e.date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(query);
    });
  }, [expenses, q, catFilter]);

  const totals = useMemo(() => {
    let all = 0;
    let pay = 0;
    let ops = 0;
    for (const e of filtered) {
      const a = Math.max(0, Number(e.amount) || 0);
      all += a;
      if (PAY_CATEGORIES.includes(e.category)) pay += a;
      else ops += a;
    }
    return { all, pay, ops, count: filtered.length };
  }, [filtered]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/60 text-slate-900 pb-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <Wallet className="w-6 h-6 text-amber-600 shrink-0" />
              Expenses
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Record business costs and pay. Linked to parties, trips and invoices when known.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-slate-900 text-white text-sm font-bold shadow-sm hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add expense
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</div>
            <div className="text-lg sm:text-xl font-black font-mono text-slate-900 mt-0.5">
              ₹{money(totals.all)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">{totals.count} entries</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Operating</div>
            <div className="text-lg sm:text-xl font-black font-mono text-amber-800 mt-0.5">
              ₹{money(totals.ops)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Fuel, rent, vehicle…</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pay</div>
            <div className="text-lg sm:text-xl font-black font-mono text-sky-800 mt-0.5">
              ₹{money(totals.pay)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Salary, wages, commission</div>
          </div>
          <div className="bg-white rounded-2xl border border-emerald-100 p-3.5 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Tip</div>
            <div className="text-[12px] text-slate-600 mt-1 leading-snug">
              Linked expenses show on Net Profit &amp; party history without changing past data.
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search payee, note, category…"
              className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm font-medium"
            />
          </div>
          <div className="relative sm:w-56">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm font-medium appearance-none"
            >
              <option value="all">All categories</option>
              {EXPENSE_CATEGORY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {catLabel(k)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* List — mobile cards */}
        <div className="md:hidden space-y-2.5">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 px-4 py-12 text-center text-sm text-slate-500">
              No expenses yet. Tap <strong>Add expense</strong> to record one.
            </div>
          ) : (
            filtered.map((e) => (
              <div
                key={e.id}
                className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-slate-900 truncate">
                      {e.paidTo || catLabel(e.category)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {String(e.date).slice(0, 10)} · {catLabel(e.category)}
                      {e.mode ? ` · ${e.mode}` : ""}
                    </div>
                  </div>
                  <div className="font-mono font-black text-slate-900 shrink-0">
                    ₹{money(e.amount)}
                  </div>
                </div>
                {(e.note || e.tripLabel || e.billId) && (
                  <div className="text-[11px] text-slate-600 space-y-0.5">
                    {e.note ? <div>{e.note}</div> : null}
                    {e.tripLabel ? (
                      <div className="flex items-center gap-1 text-slate-500">
                        <Truck className="w-3 h-3" /> {e.tripLabel}
                      </div>
                    ) : null}
                    {e.billId ? (
                      <div className="flex items-center gap-1 text-slate-500">
                        <Receipt className="w-3 h-3" /> Invoice #{e.billId}
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openEdit(e)}
                    className="flex-1 min-h-[40px] rounded-xl border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this expense?")) deleteExpense(e.id);
                    }}
                    className="min-h-[40px] px-4 rounded-xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-700 cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* List — desktop table */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-3 py-3 font-bold">Category</th>
                  <th className="px-3 py-3 font-bold">Paid to</th>
                  <th className="px-3 py-3 font-bold">Note / link</th>
                  <th className="px-3 py-3 font-bold text-right">Amount</th>
                  <th className="px-4 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      No expenses match this filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => (
                    <tr key={e.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                        {String(e.date).slice(0, 10)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 font-bold">
                          {catLabel(e.category)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">
                        {e.paidTo || "—"}
                        {e.customerId ? (
                          <span className="ml-1 text-[10px] text-emerald-700 font-bold">· linked</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 max-w-[220px]">
                        <div className="truncate">{e.note || "—"}</div>
                        {e.tripLabel ? (
                          <div className="text-[10px] text-slate-400 truncate">{e.tripLabel}</div>
                        ) : null}
                        {e.billId ? (
                          <div className="text-[10px] text-slate-400">Invoice #{e.billId}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-black">
                        ₹{money(e.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                            aria-label="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("Delete this expense?")) deleteExpense(e.id);
                            }}
                            className="p-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 cursor-pointer"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Form sheet */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 cursor-pointer"
            aria-label="Close"
            onClick={() => {
              setShowForm(false);
              resetForm();
            }}
          />
          <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900">
                {editingId ? "Edit expense" : "Add expense"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="size-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Date
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Category
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3"
                >
                  {EXPENSE_CATEGORY_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {catLabel(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <IndianRupee className="w-3 h-3" /> Amount
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Paid by
                </span>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3"
                >
                  {MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <User className="w-3 h-3" /> Paid to (party / staff)
              </span>
              <PartySearchSelect
                value={paidTo}
                options={partyOptions}
                placeholder="Search party or type a name…"
                onSelect={(name, opt) => {
                  setPaidTo(name);
                  if (opt?.key && !String(opt.key).startsWith("name:") && !String(opt.key).startsWith("sm:")) {
                    setCustomerId(String(opt.key));
                  } else {
                    setCustomerId(undefined);
                  }
                }}
              />
              <p className="text-[10px] text-slate-400">
                Selecting a party stores <code className="font-mono">customerId</code> (soft FK). Free text still works for one-off payees.
              </p>
            </div>

            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Note
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Diesel for van, office rent May"
                className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-sm"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Reference (UTR / cheque #)
              </span>
              <input
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
                placeholder="Optional"
                className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-sm"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Truck className="w-3 h-3" /> Trip (optional)
                </span>
                <select
                  value={tripId}
                  onChange={(e) => setTripId(e.target.value)}
                  className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-sm"
                >
                  <option value="">— None —</option>
                  {recentTrips.map((t: any) => (
                    <option key={t.id} value={String(t.id)}>
                      #{t.id} · {String(t.date).slice(0, 10)} · {t.vehicle || "vehicle"}
                      {t.driver ? ` · ${t.driver}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Receipt className="w-3 h-3" /> Invoice (optional)
                </span>
                <select
                  value={billId}
                  onChange={(e) => setBillId(e.target.value)}
                  className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-sm"
                >
                  <option value="">— None —</option>
                  {openBills.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      #{b.id} · {b.retailer} · {String(b.date).slice(0, 10)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!amount || Number(amount) <= 0}
              className="w-full min-h-[48px] rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-40 cursor-pointer"
            >
              {editingId ? "Save changes" : "Save expense"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpensesView;
