import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Fuel,
  Home,
  IndianRupee,
  MoreHorizontal,
  Package,
  Percent,
  ParkingSquare,
  Plus,
  Receipt,
  Search,
  Trash2,
  Truck,
  Users,
  Wallet,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import { notify } from "../../utils/toast";
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
type Period = "today" | "week" | "month" | "all";

const MODES: { id: Mode; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "cheque", label: "Cheque" },
  { id: "other", label: "Other" },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 days" },
  { id: "month", label: "This month" },
  { id: "all", label: "All" },
];

/** Short names for chips and tiles; the full name stays in EXPENSE_LABELS (used by reports). */
const SHORT_LABEL: Record<string, string> = {
  fuel: "Fuel",
  salary: "Salary",
  driver: "Driver pay",
  commission: "Commission",
  rent: "Rent",
  electricity: "Electricity",
  transport: "Transport",
  toll: "Toll / parking",
  repair: "Repair",
  packaging: "Packaging",
  baddebt: "Bad debt",
  misc: "Other",
};

const CAT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  fuel: Fuel,
  salary: Users,
  driver: Truck,
  commission: Percent,
  rent: Home,
  electricity: Zap,
  transport: Truck,
  toll: ParkingSquare,
  repair: Wrench,
  packaging: Package,
  baddebt: AlertTriangle,
  misc: MoreHorizontal,
};

function catLabel(key: string) {
  return SHORT_LABEL[key] || EXPENSE_LABELS[key] || key;
}

function catTone(key: string) {
  if (key === "baddebt") return "bg-rose-50 text-rose-700";
  if (PAY_CATEGORIES.includes(key)) return "bg-sky-50 text-sky-700";
  return "bg-amber-50 text-amber-700";
}

function addDaysISO(iso: string, delta: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + delta);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function dayLabel(iso: string, today: string) {
  if (iso === today) return "Today";
  if (iso === addDaysISO(today, -1)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: y === Number(today.slice(0, 4)) ? undefined : "numeric",
  });
}

const chipCls = (on: boolean) =>
  `shrink-0 min-h-[38px] px-3.5 rounded-full border text-[13px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
    on
      ? "bg-slate-900 text-white border-slate-900"
      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
  }`;

const fieldLabelCls = "block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5";
const fieldBoxCls =
  "w-full min-h-[46px] px-3 rounded-xl border border-slate-300 bg-white text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15";

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
  const [period, setPeriod] = useState<Period>("month");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<BusinessExpenseRecord | null>(null);

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
    // An older expense can point at a trip outside the recent list: keep that link instead of dropping it.
    const existing = editingId ? (expenses || []).find((x) => x.id === editingId) : undefined;
    const keepOldTrip = !trip && tripId && existing?.tripId != null && String(existing.tripId) === String(tripId);
    const payload: Omit<BusinessExpenseRecord, "id"> = {
      date: date.slice(0, 10),
      category,
      amount: amt,
      note: note.trim(),
      paidTo: paidTo.trim() || undefined,
      customerId: customerId && !customerId.startsWith("name:") && !customerId.startsWith("sm:")
        ? customerId
        : undefined,
      tripId: trip ? Number(trip.id) : keepOldTrip ? Number(existing!.tripId) : undefined,
      tripLabel: trip
        ? `Trip #${trip.id} · ${String(trip.date).slice(0, 10)} · ${trip.vehicle || "vehicle"}`
        : keepOldTrip
          ? existing!.tripLabel
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

  const today = todayISO();

  // 1) period + search first, so the category chips show what is really in range
  const inPeriod = useMemo(() => {
    const query = q.trim().toLowerCase();
    const weekStart = addDaysISO(today, -6);
    return (expenses || [])
      .filter((e) => {
        const d = String(e.date).slice(0, 10);
        if (period === "today" && d !== today) return false;
        if (period === "week" && (d < weekStart || d > today)) return false;
        if (period === "month" && d.slice(0, 7) !== today.slice(0, 7)) return false;
        if (!query) return true;
        const blob = [
          e.paidTo,
          e.note,
          e.category,
          catLabel(e.category),
          EXPENSE_LABELS[e.category],
          e.referenceNote,
          e.tripLabel,
          String(e.amount),
          d,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(query);
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [expenses, q, period, today]);

  const categoryChips = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of inPeriod) m.set(e.category, (m.get(e.category) || 0) + Math.max(0, Number(e.amount) || 0));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [inPeriod]);

  // a chip that vanished (e.g. period changed) must not leave the list stuck on an empty filter
  const activeCat = catFilter !== "all" && !categoryChips.some(([k]) => k === catFilter) ? "all" : catFilter;

  const filtered = useMemo(
    () => (activeCat === "all" ? inPeriod : inPeriod.filter((e) => e.category === activeCat)),
    [inPeriod, activeCat],
  );

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

  const groups = useMemo(() => {
    const m = new Map<string, { date: string; total: number; rows: BusinessExpenseRecord[] }>();
    for (const e of filtered) {
      const d = String(e.date).slice(0, 10);
      const g = m.get(d) || { date: d, total: 0, rows: [] };
      g.total += Math.max(0, Number(e.amount) || 0);
      g.rows.push(e);
      m.set(d, g);
    }
    return Array.from(m.values());
  }, [filtered]);

  const periodLabel = PERIODS.find((p) => p.id === period)?.label || "";
  const opsPct = totals.all > 0 ? Math.round((totals.ops / totals.all) * 100) : 0;

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const confirmDelete = () => {
    if (!editingId) return;
    const exp = (expenses || []).find((x) => x.id === editingId);
    if (exp) {
      setExpenseToDelete(exp);
    }
  };

  const handleDeleteExpense = (exp: BusinessExpenseRecord) => {
    deleteExpense(exp.id);
    notify(`Expense of ₹${money(exp.amount)} deleted`, "success");
    setExpenseToDelete(null);
    if (editingId === exp.id) {
      closeForm();
    }
  };

  const amountOk = Number(amount) > 0;

  return (
    <div className="w-full min-w-0 text-slate-900 pb-24">
      <div className="hh-view w-full min-w-0 max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-amber-600 shrink-0" />
            <span className="truncate">Expenses</span>
          </h1>
          <button
            type="button"
            onClick={openCreate}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-slate-900 text-white text-sm font-bold shadow-sm hover:bg-slate-800 active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {/* Period */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={chipCls(period === p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Summary */}
        <section className="rounded-3xl bg-white border border-slate-200 shadow-xs p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                Spent · {periodLabel}
                {activeCat !== "all" ? ` · ${catLabel(activeCat)}` : ""}
              </div>
              <div className="mt-1 text-[clamp(1.6rem,8vw,2.4rem)] leading-none font-black tabular-nums text-slate-900 whitespace-nowrap">
                ₹{money(totals.all)}
              </div>
            </div>
            <div className="shrink-0 text-xs font-semibold text-slate-500 pb-1">
              {totals.count} {totals.count === 1 ? "entry" : "entries"}
            </div>
          </div>

          {totals.all > 0 && (
            <>
              <div
                className="mt-4 h-2 rounded-full bg-sky-200 overflow-hidden"
                role="img"
                aria-label={`Operating ${opsPct}%, pay ${100 - opsPct}%`}
              >
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${opsPct}%` }} />
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <span className="size-2 rounded-full bg-amber-500 shrink-0" /> Running costs
                  </div>
                  <div className="text-[15px] font-black tabular-nums text-slate-900 truncate">₹{money(totals.ops)}</div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <span className="size-2 rounded-full bg-sky-300 shrink-0" /> Staff pay
                  </div>
                  <div className="text-[15px] font-black tabular-nums text-slate-900 truncate">₹{money(totals.pay)}</div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Search + category chips */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, note or amount"
              className="w-full min-h-[46px] pl-10 pr-10 rounded-xl border border-slate-200 bg-white text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/15"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQ("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 size-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {categoryChips.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="group" aria-label="Category">
              <button type="button" onClick={() => setCatFilter("all")} className={chipCls(activeCat === "all")}>
                All
              </button>
              {categoryChips.map(([k, amt]) => (
                <button
                  key={k}
                  type="button"
                  title={EXPENSE_LABELS[k] || k}
                  onClick={() => setCatFilter(activeCat === k ? "all" : k)}
                  className={chipCls(activeCat === k)}
                >
                  {catLabel(k)} <span className="opacity-70 font-semibold">₹{money(amt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* List, grouped by day */}
        {groups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Wallet className="w-6 h-6" />
            </div>
            <p className="text-[15px] font-bold text-slate-800">
              {q || activeCat !== "all" || (expenses || []).length > 0 ? "No expenses found" : "No expenses yet"}
            </p>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {(expenses || []).length > 0 && period !== "all"
                ? "Try a longer period or clear the search."
                : "Tap Add to record your first one."}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {(expenses || []).length > 0 && period !== "all" && (
                <button type="button" onClick={() => { setPeriod("all"); setQ(""); setCatFilter("all"); }} className={chipCls(false)}>
                  Show all time
                </button>
              )}
              <button type="button" onClick={openCreate} className="min-h-[38px] px-4 rounded-full bg-slate-900 text-white text-[13px] font-bold cursor-pointer">
                Add expense
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.date} aria-label={dayLabel(g.date, today)}>
                <div className="flex items-baseline justify-between gap-3 px-1 mb-1.5">
                  <h2 className="text-[13px] font-black text-slate-700">{dayLabel(g.date, today)}</h2>
                  <span className="text-[13px] font-bold tabular-nums text-slate-500">₹{money(g.total)}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white shadow-xs divide-y divide-slate-100 overflow-hidden">
                  {g.rows.map((e) => {
                    const Icon = CAT_ICON[e.category] || MoreHorizontal;
                    const sub = [catLabel(e.category), e.mode && e.mode !== "cash" ? String(e.mode).toUpperCase() : "", e.note]
                      .filter(Boolean)
                      .join(" · ");
                    const links = [e.tripId ? `Trip #${e.tripId}` : "", e.billId ? `Invoice #${e.billId}` : ""]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div
                        key={e.id}
                        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-slate-50 transition-colors group"
                      >
                        <button
                          type="button"
                          onClick={() => openEdit(e)}
                          aria-label={`Edit ${e.paidTo || catLabel(e.category)} ₹${money(e.amount)}`}
                          className="min-w-0 flex-1 flex items-center gap-3 text-left cursor-pointer"
                        >
                          <span className={`size-10 shrink-0 rounded-xl flex items-center justify-center ${catTone(e.category)}`}>
                            <Icon className="w-5 h-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-bold text-slate-900 truncate">
                              {e.paidTo || catLabel(e.category)}
                            </span>
                            <span className="block text-[12.5px] text-slate-500 truncate">{sub}</span>
                            {links && (
                              <span className="mt-0.5 flex items-center gap-1 text-[11.5px] font-semibold text-slate-400 truncate">
                                {e.billId ? <Receipt className="w-3 h-3 shrink-0" /> : <Truck className="w-3 h-3 shrink-0" />}
                                <span className="truncate">{links}</span>
                              </span>
                            )}
                          </span>
                        </button>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-[16px] font-black tabular-nums text-slate-900">
                            ₹{money(e.amount)}
                          </span>
                          <button
                            type="button"
                            title="Delete expense"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setExpenseToDelete(e);
                            }}
                            className="size-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Add / edit sheet */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={editingId ? "Edit expense" : "Add expense"}>
          <button type="button" className="absolute inset-0 bg-slate-900/45 cursor-pointer" aria-label="Close" onClick={closeForm} />
          <div className="relative w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 pt-4 pb-2">
              <h2 className="text-lg font-black text-slate-900">{editingId ? "Edit expense" : "Add expense"}</h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="size-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 space-y-4">
              {/* Amount */}
              <div>
                <label htmlFor="exp-amount" className={fieldLabelCls}>Amount</label>
                <div className="flex items-center gap-3 h-16 rounded-2xl border-2 border-slate-300 focus-within:border-slate-900 px-4 bg-white transition-colors shadow-2xs">
                  <div className="size-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-700">
                    <IndianRupee className="w-5 h-5" />
                  </div>
                  <input
                    id="exp-amount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    autoFocus={!editingId}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0"
                    style={{
                      border: 'none',
                      outline: 'none',
                      boxShadow: 'none',
                      background: 'transparent',
                      padding: 0,
                      margin: 0,
                      minHeight: 'auto',
                    }}
                    className="flex-1 min-w-0 h-full !border-0 !outline-none !shadow-none !bg-transparent !p-0 text-3xl font-black tabular-nums text-slate-900 placeholder:text-slate-300 focus:!ring-0 focus:!border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <span className={fieldLabelCls}>What was it for?</span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Category">
                  {EXPENSE_CATEGORY_KEYS.map((k) => {
                    const Icon = CAT_ICON[k] || MoreHorizontal;
                    const on = category === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={EXPENSE_LABELS[k] || k}
                        onClick={() => setCategory(k)}
                        className={`min-h-[64px] rounded-xl border-2 px-1.5 py-2 flex flex-col items-center justify-center gap-1 text-[12px] font-bold leading-tight text-center cursor-pointer transition-colors ${
                          on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <Icon className="w-[18px] h-[18px] shrink-0" />
                        <span className="max-w-full break-words">{catLabel(k)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Paid to */}
              <div>
                <span className={fieldLabelCls}>Paid to <span className="normal-case font-medium text-slate-400">(optional)</span></span>
                <PartySearchSelect
                  value={paidTo}
                  options={partyOptions}
                  placeholder="Search party or type a name"
                  onSelect={(name, opt) => {
                    setPaidTo(name);
                    if (opt?.key && !String(opt.key).startsWith("name:") && !String(opt.key).startsWith("sm:")) {
                      setCustomerId(String(opt.key));
                    } else {
                      setCustomerId(undefined);
                    }
                  }}
                />
              </div>

              {/* How paid */}
              <div>
                <span className={fieldLabelCls}>Paid by</span>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Paid by">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={mode === m.id}
                      onClick={() => setMode(m.id)}
                      className={chipCls(mode === m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label htmlFor="exp-date" className={fieldLabelCls}>Date</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="exp-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value || todayISO())}
                    className={`${fieldBoxCls} flex-1 min-w-[150px]`}
                  />
                  <button type="button" onClick={() => setDate(todayISO())} className={chipCls(date === todayISO())}>
                    Today
                  </button>
                  <button type="button" onClick={() => setDate(addDaysISO(todayISO(), -1))} className={chipCls(date === addDaysISO(todayISO(), -1))}>
                    Yesterday
                  </button>
                </div>
              </div>

              {/* Note */}
              <div>
                <label htmlFor="exp-note" className={fieldLabelCls}>Note <span className="normal-case font-medium text-slate-400">(optional)</span></label>
                <input
                  id="exp-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Diesel for van"
                  className={fieldBoxCls}
                />
              </div>

              {/* Rarely used */}
              <details className="group rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" open={Boolean(tripId || billId || referenceNote)}>
                <summary className="flex items-center justify-between gap-2 cursor-pointer select-none list-none text-[13px] font-bold text-slate-700">
                  <span>Link to trip, invoice or reference</span>
                  <span className="text-slate-400 transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <label htmlFor="exp-trip" className={fieldLabelCls}>Trip</label>
                    <select id="exp-trip" value={tripId} onChange={(e) => setTripId(e.target.value)} className={fieldBoxCls}>
                      <option value="">None</option>
                      {recentTrips.map((t: any) => (
                        <option key={t.id} value={String(t.id)}>
                          #{t.id} · {String(t.date).slice(0, 10)} · {t.vehicle || "vehicle"}
                          {t.driver ? ` · ${t.driver}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="exp-bill" className={fieldLabelCls}>Invoice</label>
                    <select id="exp-bill" value={billId} onChange={(e) => setBillId(e.target.value)} className={fieldBoxCls}>
                      <option value="">None</option>
                      {openBills.map((b) => (
                        <option key={b.id} value={String(b.id)}>
                          #{b.id} · {b.retailer} · {String(b.date).slice(0, 10)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="exp-ref" className={fieldLabelCls}>UTR / cheque no.</label>
                    <input id="exp-ref" value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} className={fieldBoxCls} />
                  </div>
                </div>
              </details>
            </div>

            <div className="shrink-0 flex gap-2 border-t border-slate-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {editingId && (
                <button
                  type="button"
                  onClick={confirmDelete}
                  aria-label="Delete expense"
                  className="size-[52px] shrink-0 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={!amountOk}
                className="flex-1 min-w-0 min-h-[52px] rounded-xl bg-slate-900 text-white text-[15px] font-black disabled:opacity-40 cursor-pointer active:scale-[0.99]"
              >
                {editingId ? "Save changes" : amountOk ? `Save ₹${money(Number(amount))}` : "Save expense"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {expenseToDelete && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-exp-title"
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="size-11 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="del-exp-title" className="text-base font-black text-slate-900">
                  Delete Expense?
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Are you sure you want to delete the <strong className="text-slate-800 font-bold">₹{money(expenseToDelete.amount)}</strong> entry for <strong className="text-slate-800 font-bold">{expenseToDelete.paidTo || catLabel(expenseToDelete.category)}</strong>?
                </p>
                {expenseToDelete.note && (
                  <p className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-xl italic line-clamp-2">
                    "{expenseToDelete.note}"
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setExpenseToDelete(null)}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteExpense(expenseToDelete)}
                className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpensesView;
