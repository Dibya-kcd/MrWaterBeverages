import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import {
  CrateDepositKind,
  CrateDepositRecord,
  ExistingCustomer,
} from "../../types";
import { money } from "../../utils/billing";
import { ConfirmModal } from "../ui";
import { todayISO } from "../../utils/dateLocal";

const STORAGE_KEY = "mrwater_crate_deposit_records_v1";

const KIND_LABELS: Record<CrateDepositKind, string> = {
  empties_returned: "Empties returned",
  empties_issued: "Empties / crates issued",
  deposit_collected: "Deposit collected",
  deposit_refunded: "Deposit refunded",
};

function loadRecords(): CrateDepositRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords(list: CrateDepositRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

function uid() {
  return `crate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const CratesDepositsView: React.FC = () => {
  const {
    products,
    bills,
    existingCustomers,
    grns,
  } = useLedger();

  const [records, setRecords] = useState<CrateDepositRecord[]>(() => loadRecords());
  const [modalOpen, setModalOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CrateDepositRecord | null>(null);

  // Form state
  const [partyType, setPartyType] = useState<"customer" | "supplier">("customer");
  const [partyName, setPartyName] = useState("");
  const [kind, setKind] = useState<CrateDepositKind>("empties_returned");
  const [productId, setProductId] = useState<number | "">("");
  const [units, setUnits] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  const returnableProducts = useMemo(
    () => products.filter((p) => p.returnable),
    [products],
  );

  // Supplier names from GRNs
  const supplierNames = useMemo(() => {
    const set = new Set<string>();
    for (const g of grns || []) {
      const n = (g.supplierName || "").trim();
      if (n) set.add(n);
    }
    for (const r of records) {
      if (r.partyType === "supplier" && r.partyName) set.add(r.partyName);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [grns, records]);

  const customerOptions: ExistingCustomer[] = existingCustomers;

  /** Crates with customers from sales of returnable products minus returns / manual empties returned */
  const partyBalances = useMemo(() => {
    type Row = {
      partyType: "customer" | "supplier";
      partyName: string;
      cratesOut: number; // held by party (positive = we need them back)
      depositHeld: number;
    };
    const map = new Map<string, Row>();

    const keyOf = (t: "customer" | "supplier", name: string) =>
      `${t}::${name.trim().toLowerCase()}`;

    const touch = (t: "customer" | "supplier", name: string) => {
      const k = keyOf(t, name);
      if (!map.has(k)) {
        map.set(k, {
          partyType: t,
          partyName: name.trim(),
          cratesOut: 0,
          depositHeld: 0,
        });
      }
      return map.get(k)!;
    };

    // Sales: returnable products go out with customer
    for (const b of bills) {
      if (b.status === "cancelled" || b.cancelled) continue;
      const retailer = (b.retailer || "").trim();
      if (!retailer) continue;
      for (const it of b.items) {
        const prod = products.find((p) => p.id === it.productId);
        if (!prod?.returnable) continue;
        const row = touch("customer", retailer);
        row.cratesOut += Number(it.qty) || 0;
      }
      // Sales returns of returnable products come back
      for (const r of b.returns || []) {
        for (const line of r.lines) {
          const prod = products.find((p) => p.id === line.productId);
          if (!prod?.returnable) continue;
          const row = touch("customer", retailer);
          const back =
            (Number(line.restockQty) || 0) + (Number(line.scrapQty) || 0);
          row.cratesOut -= back;
        }
      }
    }

    // Purchases (GRN): returnable products — empties owed to supplier when we keep the crates
    for (const g of grns || []) {
      const supplier = (g.supplierName || "").trim();
      if (!supplier) continue;
      // GRN lines live in `items` (older/imported records may use `lines`).
      for (const line of ((g as any).items || (g as any).lines || []) as any[]) {
        const pid = line.productId;
        const prod = pid
          ? products.find((p) => p.id === pid)
          : products.find(
              (p) =>
                p.name.trim().toLowerCase() ===
                (line.productName || "").trim().toLowerCase(),
            );
        if (!prod?.returnable) continue;
        const row = touch("supplier", supplier);
        // We received full crates; we typically owe empties back to supplier
        const qty =
          Number(line.totalReceivedQty) ||
          Number(line.qty) + Number(line.freeQty) ||
          Number(line.qty) ||
          0;
        row.cratesOut += qty; // positive = owed to supplier (units to return)
      }
    }

    // Manual records
    for (const r of records) {
      const row = touch(r.partyType, r.partyName);
      if (r.kind === "empties_returned") {
        row.cratesOut -= Number(r.units) || 0;
      } else if (r.kind === "empties_issued") {
        row.cratesOut += Number(r.units) || 0;
      } else if (r.kind === "deposit_collected") {
        row.depositHeld += Number(r.amount) || 0;
      } else if (r.kind === "deposit_refunded") {
        row.depositHeld -= Number(r.amount) || 0;
      }
    }

    return Array.from(map.values())
      .map((r) => ({
        ...r,
        cratesOut: r.cratesOut,
        depositHeld: r.depositHeld,
      }))
      .filter((r) => r.cratesOut !== 0 || r.depositHeld !== 0)
      .sort((a, b) => a.partyName.localeCompare(b.partyName));
  }, [bills, products, grns, records]);

  const totals = useMemo(() => {
    let withCustomers = 0;
    let owedSuppliers = 0;
    let depositHeld = 0;
    for (const r of partyBalances) {
      if (r.partyType === "customer") {
        withCustomers += Math.max(0, r.cratesOut);
        depositHeld += r.depositHeld;
      } else {
        owedSuppliers += Math.max(0, r.cratesOut);
        depositHeld += r.depositHeld;
      }
    }
    return { withCustomers, owedSuppliers, depositHeld };
  }, [partyBalances]);

  const openRecord = () => {
    setPartyType("customer");
    setPartyName("");
    setKind("empties_returned");
    setProductId("");
    setUnits("");
    setAmount("");
    setNote("");
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = () => {
    const name = partyName.trim();
    if (!name) {
      setFormError("Choose a party.");
      return;
    }
    const isDeposit =
      kind === "deposit_collected" || kind === "deposit_refunded";
    if (isDeposit) {
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0) {
        setFormError("Enter a valid deposit amount.");
        return;
      }
    } else {
      const u = parseFloat(units);
      if (isNaN(u) || u <= 0) {
        setFormError("Enter units greater than zero.");
        return;
      }
    }

    const prod =
      productId !== ""
        ? products.find((p) => p.id === Number(productId))
        : undefined;

    const rec: CrateDepositRecord = {
      id: uid(),
      date: todayISO(),
      partyType,
      partyName: name,
      kind,
      productId: prod?.id,
      productName: prod?.name,
      units: isDeposit ? 0 : Number(units) || 0,
      amount: isDeposit ? Number(amount) || 0 : undefined,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    setRecords((prev) => [rec, ...prev]);
    setModalOpen(false);
  };

  const isDepositKind =
    kind === "deposit_collected" || kind === "deposit_refunded";

  return (
    <div className="mw-workspace flex flex-col gap-4 sm:gap-5 w-full min-w-0 max-w-none lg:max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Crates &amp; deposits
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={openRecord}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#0d4a3a] text-white font-semibold text-sm shadow-sm cursor-pointer hover:bg-[#0a3d30] shrink-0"
        >
          <Plus size={16} />
          Record
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-black/8 bg-white shadow-sm px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            With customers
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
            {totals.withCustomers}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">units to come back</div>
        </div>
        <div className="rounded-2xl border border-black/8 bg-white shadow-sm px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Owed to suppliers
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
            {totals.owedSuppliers}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">units to return</div>
        </div>
        <div className="rounded-2xl border border-black/8 bg-white shadow-sm px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Deposits held
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
            ₹{money(totals.depositHeld)}
          </div>
        </div>
      </div>

      {/* Outstanding list or empty state */}
      {partyBalances.length === 0 ? (
        <div className="rounded-2xl border border-black/8 bg-white shadow-sm px-6 py-12 text-center">
          <h2 className="text-lg font-bold text-slate-900">Nothing outstanding</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
            Mark a product as returnable in Products. Sales and purchases of
            returnable products then track crates automatically; use Record for
            returns and deposits.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-black/5 text-sm font-bold text-slate-800">
            Outstanding by party
          </div>
          <ul className="divide-y divide-black/5">
            {partyBalances.map((row) => (
              <li
                key={`${row.partyType}-${row.partyName}`}
                className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 break-words leading-snug">
                    {row.partyName}
                  </div>
                  <div className="text-[11px] text-slate-500 capitalize">
                    {row.partyType}
                  </div>
                </div>
                {row.cratesOut !== 0 && (
                  <div className="text-right">
                    <div
                      className={`text-sm font-bold tabular-nums ${
                        row.cratesOut > 0 ? "text-amber-700" : "text-emerald-700"
                      }`}
                    >
                      {row.cratesOut > 0 ? "+" : ""}
                      {row.cratesOut} units
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {row.partyType === "customer"
                        ? row.cratesOut > 0
                          ? "with customer"
                          : "credit"
                        : row.cratesOut > 0
                          ? "owed to supplier"
                          : "supplier credit"}
                    </div>
                  </div>
                )}
                {row.depositHeld !== 0 && (
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums text-slate-800">
                      ₹{money(row.depositHeld)}
                    </div>
                    <div className="text-[10px] text-slate-400">deposit</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent manual records */}
      {records.length > 0 && (
        <div className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-black/5 text-sm font-bold text-slate-800">
            Recent records
          </div>
          <ul className="divide-y divide-black/5 max-h-72 overflow-y-auto">
            {records.slice(0, 40).map((r) => (
              <li
                key={r.id}
                className="px-4 py-2.5 flex items-start gap-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">
                    {KIND_LABELS[r.kind]}
                    {r.productName ? ` · ${r.productName}` : ""}
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.partyName}{" "}
                    <span className="capitalize">({r.partyType})</span>
                    {r.units > 0 ? ` · ${r.units} units` : ""}
                    {r.amount != null && r.amount > 0
                      ? ` · ₹${money(r.amount)}`
                      : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{r.date}</div>
                </div>
                <button
                  type="button"
                  aria-label="Delete record"
                  onClick={() => setToDelete(r)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Record modal — matches screenshot */}
      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div
            className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-[#faf9f6] rounded-t-2xl sm:rounded-2xl shadow-xl border border-black/5"
            role="dialog"
            aria-labelledby="crate-deposit-title"
          >
            <div className="sticky top-0 bg-[#faf9f6] border-b border-black/5 px-4 sm:px-5 py-3 flex items-center justify-between z-10">
              <h2
                id="crate-deposit-title"
                className="text-base sm:text-lg font-bold text-slate-900"
              >
                Record crates / deposit
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-full hover:bg-black/5 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="px-4 sm:px-5 py-4 space-y-3.5">
              {formError && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                  {formError}
                </div>
              )}

              {/* Party type switcher */}
              <div className="inline-flex bg-[#ebe8e1] rounded-full p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setPartyType("customer");
                    setPartyName("");
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${
                    partyType === "customer"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  Customer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPartyType("supplier");
                    setPartyName("");
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${
                    partyType === "supplier"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  Supplier
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  Party
                </label>
                {partyType === "customer" ? (
                  <select
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                  >
                    <option value="">Choose…</option>
                    {customerOptions.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                  >
                    <option value="">Choose…</option>
                    {supplierNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
                {partyType === "supplier" && supplierNames.length === 0 && (
                  <input
                    type="text"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    placeholder="Type supplier name"
                    className="mt-2 w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                  />
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  What happened
                </label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as CrateDepositKind)}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                >
                  {(Object.keys(KIND_LABELS) as CrateDepositKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>

              {!isDepositKind ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                      Product
                    </label>
                    <select
                      value={productId === "" ? "" : String(productId)}
                      onChange={(e) =>
                        setProductId(
                          e.target.value === "" ? "" : Number(e.target.value),
                        )
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                    >
                      <option value="">Choose…</option>
                      {(returnableProducts.length > 0
                        ? returnableProducts
                        : products
                      ).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.returnable ? "" : " (not marked returnable)"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                      Units
                    </label>
                    <input
                      type="number" inputMode="numeric"
                      min={1}
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Amount ₹
                  </label>
                  <input
                    type="number" inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  Note
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                />
              </div>

              <button
                type="button"
                onClick={handleSave}
                className="w-full py-3 rounded-xl bg-[#0d4a3a] text-white font-bold text-sm cursor-pointer hover:bg-[#0a3d30]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <ConfirmModal
          isOpen
          title="Delete record?"
          message={`Remove this ${KIND_LABELS[toDelete.kind].toLowerCase()} entry for ${toDelete.partyName}?`}
          confirmButtonLabel="Delete"
          variant="danger"
          onConfirm={() => {
            setRecords((prev) => prev.filter((r) => r.id !== toDelete.id));
            setToDelete(null);
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
};
