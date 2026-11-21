import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Package, Plus, Trash2, Truck, Wallet, X } from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import {
  CrateDepositKind,
  CrateDepositRecord,
  ExistingCustomer,
} from "../../types";
import { money } from "../../utils/billing";
import { ConfirmModal } from "../ui";
import { getInitials } from "../ui/HomeKit";
import { todayISO } from "../../utils/dateLocal";
import { useIsMobile } from "../../hooks/useIsMobile";
import { buildCrateTimeline, formatCompactInr, shortDateLabel } from "../../utils/crateTimeline";

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
  const isPhone = useIsMobile(767);
  const {
    products,
    bills,
    existingCustomers,
    grns,
  } = useLedger();

  const [records, setRecords] = useState<CrateDepositRecord[]>(() => loadRecords());
  const [modalOpen, setModalOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CrateDepositRecord | null>(null);
  const [phonePartyFilter, setPhonePartyFilter] = useState<"customer" | "supplier">("customer");
  const [selectedParty, setSelectedParty] = useState<{
    partyType: "customer" | "supplier";
    partyName: string;
  } | null>(null);

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

  const filteredPhoneParties = useMemo(
    () => partyBalances.filter((r) => r.partyType === phonePartyFilter),
    [partyBalances, phonePartyFilter],
  );

  const selectedPartyTimeline = useMemo(() => {
    if (!selectedParty) return [];
    return buildCrateTimeline({
      partyType: selectedParty.partyType,
      partyName: selectedParty.partyName,
      records,
      bills,
      grns,
      products,
    });
  }, [selectedParty, records, bills, grns, products]);

  const selectedPartyBalance = useMemo(() => {
    if (!selectedParty) return undefined;
    const target = selectedParty.partyName.trim().toLowerCase();
    return partyBalances.find(
      (r) =>
        r.partyType === selectedParty.partyType &&
        r.partyName.trim().toLowerCase() === target,
    );
  }, [selectedParty, partyBalances]);

  const openPhoneEntryForParty = (t: "customer" | "supplier", name: string) => {
    setPartyType(t);
    setPartyName(name);
    setKind("empties_returned");
    setProductId("");
    setUnits("");
    setAmount("");
    setNote("");
    setFormError(null);
    setModalOpen(true);
  };

  if (isPhone) {
    const deleteSheet = toDelete ? (
      <div
        className="rt-bsheet-scrim"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ph-crate-del-title"
        onClick={() => setToDelete(null)}
      >
        <div
          className="rt-bsheet rt-bsheet--white space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="hh-grab" />
          <div>
            <h3
              id="ph-crate-del-title"
              className="text-[17px] font-extrabold"
              style={{ color: "var(--due)" }}
            >
              Delete this entry?
            </h3>
            <p className="text-[13px] text-slate-500 mt-1 leading-snug">
              {KIND_LABELS[toDelete.kind]} ·{" "}
              {toDelete.kind === "deposit_collected" || toDelete.kind === "deposit_refunded"
                ? `₹${money(toDelete.amount || 0)}`
                : `${toDelete.units} cs`}{" "}
              · {shortDateLabel(toDelete.date)}. Balances are recalculated.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setToDelete(null)}
              className="rt-btn-outline rt-btn-outline--primary"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => {
                setRecords((prev) => prev.filter((r) => r.id !== toDelete.id));
                setToDelete(null);
              }}
              className="rt-btn rt-btn--due"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    ) : null;

    if (modalOpen) {
      return (
        <div id="view-crates" className="rt-flow-phone">
          <header className="hh-sales-top">
            <button
              type="button"
              className="rt-back-link"
              onClick={() => setModalOpen(false)}
            >
              <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
              <span>New crate entry</span>
            </button>
          </header>

          <div className="rt-flow-phone__body space-y-3">
            {formError && (
              <div
                className="rt-noti"
                style={{
                  background: "var(--due-bg)",
                  borderColor: "var(--due)",
                  color: "var(--due)",
                }}
              >
                {formError}
              </div>
            )}

            <div className="hh-set-seg2" role="group" aria-label="Party type">
              <button
                type="button"
                aria-pressed={partyType === "customer"}
                onClick={() => {
                  setPartyType("customer");
                  setPartyName("");
                }}
                className="hh-set-seg2__btn"
              >
                Customer
              </button>
              <button
                type="button"
                aria-pressed={partyType === "supplier"}
                onClick={() => {
                  setPartyType("supplier");
                  setPartyName("");
                }}
                className="hh-set-seg2__btn"
              >
                Supplier
              </button>
            </div>

            <div
              className="rt-in"
              style={{
                borderColor: "var(--primary)",
                boxShadow: "0 0 0 3px var(--primary-soft)",
              }}
            >
              <label className="rt-in__label" htmlFor="ph-crate-party">
                PARTY
              </label>
              {partyType === "customer" ? (
                <div className="rt-in__select-wrap">
                  <select
                    id="ph-crate-party"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="rt-in__control"
                  >
                    <option value="">Choose…</option>
                    {customerOptions.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="rt-in__select-chev" aria-hidden="true" />
                </div>
              ) : supplierNames.length > 0 ? (
                <div className="rt-in__select-wrap">
                  <select
                    id="ph-crate-party"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="rt-in__control"
                  >
                    <option value="">Choose…</option>
                    {supplierNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="rt-in__select-chev" aria-hidden="true" />
                </div>
              ) : (
                <input
                  id="ph-crate-party"
                  type="text"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  placeholder="Type supplier name"
                  className="rt-in__control"
                />
              )}
            </div>

            <div>
              <div className="hh-set-section-lbl">Entry type</div>
              <div className="space-y-2" role="radiogroup" aria-label="Entry type">
                {(Object.keys(KIND_LABELS) as CrateDepositKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className="hh-set-radio"
                  >
                    <span className="hh-set-radio__dot" />
                    <span className="text-[13.5px] font-bold text-slate-900">
                      {KIND_LABELS[k]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {!isDepositKind ? (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rt-in">
                  <label className="rt-in__label" htmlFor="ph-crate-product">
                    PRODUCT
                  </label>
                  <div className="rt-in__select-wrap">
                    <select
                      id="ph-crate-product"
                      value={productId === "" ? "" : String(productId)}
                      onChange={(e) =>
                        setProductId(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="rt-in__control"
                    >
                      <option value="">Choose…</option>
                      {(returnableProducts.length > 0 ? returnableProducts : products).map(
                        (p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.returnable ? "" : " (not marked returnable)"}
                          </option>
                        ),
                      )}
                    </select>
                    <ChevronDown size={15} className="rt-in__select-chev" aria-hidden="true" />
                  </div>
                </div>

                <div className="rt-in">
                  <label className="rt-in__label" htmlFor="ph-crate-units">
                    CRATES
                  </label>
                  <input
                    id="ph-crate-units"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    placeholder="0"
                    className="rt-in__control"
                  />
                </div>
              </div>
            ) : (
              <div className="rt-in">
                <label className="rt-in__label" htmlFor="ph-crate-amount">
                  AMOUNT (₹)
                </label>
                <input
                  id="ph-crate-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="rt-in__control"
                />
              </div>
            )}

            <div className="rt-in">
              <label className="rt-in__label" htmlFor="ph-crate-note">
                NOTE
              </label>
              <input
                id="ph-crate-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional"
                className="rt-in__control"
              />
            </div>
          </div>

          <div className="rt-flow-phone__footer">
            <button type="button" onClick={handleSave} className="rt-btn w-full">
              Save entry
            </button>
          </div>
          {deleteSheet}
        </div>
      );
    }

    if (selectedParty) {
      const cratesCount = selectedPartyBalance?.cratesOut ?? 0;
      const depositAmt = selectedPartyBalance?.depositHeld ?? 0;
      const lastDate = selectedPartyTimeline[0]?.date
        ? shortDateLabel(selectedPartyTimeline[0].date)
        : "—";

      return (
        <div id="view-crates" className="rt-flow-phone">
          <header className="hh-sales-top">
            <button
              type="button"
              className="rt-back-link"
              onClick={() => setSelectedParty(null)}
            >
              <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
              <span className="truncate">{selectedParty.partyName}</span>
            </button>
          </header>

          <div className="rt-flow-phone__body space-y-3">
            <div className="rt-card grid grid-cols-3 gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-500">
                  {selectedParty.partyType === "customer" ? "Crates out" : "Owed to supplier"}
                </div>
                <div className="text-[18px] font-black tabular-nums text-slate-900 mt-0.5">
                  {cratesCount}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-500">Deposit held</div>
                <div className="text-[18px] font-black tabular-nums text-slate-900 mt-0.5">
                  ₹{money(depositAmt)}
                </div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[11px] font-semibold text-slate-500">Last entry</div>
                <div className="text-[14px] font-extrabold text-slate-900 mt-1">
                  {lastDate}
                </div>
              </div>
            </div>

            {selectedPartyTimeline.length === 0 ? (
              <div className="rt-card text-center py-6 text-[13px] text-slate-500">
                No crate or deposit entries yet.
              </div>
            ) : (
              <div className="hh-timeline">
                {selectedPartyTimeline.map((ev) => {
                  const dotCls =
                    ev.tone === "paid"
                      ? "hh-timeline__dot hh-timeline__dot--paid"
                      : ev.tone === "due"
                        ? "hh-timeline__dot hh-timeline__dot--due"
                        : "hh-timeline__dot";
                  const deltaColor =
                    ev.tone === "paid"
                      ? "var(--paid)"
                      : ev.tone === "due"
                        ? "var(--due)"
                        : "var(--text)";
                  return (
                    <div key={ev.id} className="hh-timeline__item">
                      <span className={dotCls} />
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-bold text-slate-900 leading-snug">
                            {ev.title}
                          </div>
                          <div className="text-[11.5px] text-slate-500 mt-0.5">
                            {ev.subtitle}
                          </div>
                          <div
                            className="text-[13px] font-extrabold tabular-nums mt-0.5"
                            style={{ color: deltaColor }}
                          >
                            {ev.deltaLabel}
                          </div>
                        </div>
                        {ev.record && (
                          <button
                            type="button"
                            aria-label="Delete entry"
                            onClick={() => setToDelete(ev.record!)}
                            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rt-flow-phone__footer">
            <button
              type="button"
              onClick={() =>
                openPhoneEntryForParty(selectedParty.partyType, selectedParty.partyName)
              }
              className="rt-btn w-full"
            >
              Add entry
            </button>
          </div>

          {deleteSheet}
        </div>
      );
    }

    return (
      <div id="view-crates" className="w-full min-w-0 pb-24">
        <header className="hh-sales-top">
          <div className="hh-sales-top__row">
            <h1 className="hh-sales-top__title">Crates</h1>
            <button
              type="button"
              onClick={openRecord}
              aria-label="New crate entry"
              className="hh-sales-top__iconbtn"
            >
              <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="space-y-3">
          {/* 3 KPI tiles */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rt-kv">
              <div className="rt-kv__label">With customers</div>
              <div className="rt-kv__val">{totals.withCustomers}</div>
            </div>
            <div className="rt-kv">
              <div className="rt-kv__label">Owed to suppliers</div>
              <div className="rt-kv__val">{totals.owedSuppliers}</div>
            </div>
            <div className="rt-kv">
              <div className="rt-kv__label">Deposit held</div>
              <div className="rt-kv__val">{formatCompactInr(totals.depositHeld)}</div>
            </div>
          </div>

          {/* Customers / Suppliers toggle */}
          <div className="flex gap-2" role="tablist" aria-label="Party type">
            <button
              type="button"
              role="tab"
              aria-selected={phonePartyFilter === "customer"}
              aria-pressed={phonePartyFilter === "customer"}
              onClick={() => setPhonePartyFilter("customer")}
              className="rt-chip"
            >
              Customers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={phonePartyFilter === "supplier"}
              aria-pressed={phonePartyFilter === "supplier"}
              onClick={() => setPhonePartyFilter("supplier")}
              className="rt-chip"
            >
              Suppliers
            </button>
          </div>

          {/* Party list */}
          {filteredPhoneParties.length === 0 ? (
            <div className="rt-card text-center py-8 px-4 space-y-2">
              <div className="text-[15px] font-extrabold text-slate-900">
                Nothing outstanding
              </div>
              <div className="text-[12.5px] text-slate-500 leading-relaxed">
                {phonePartyFilter === "customer"
                  ? "No customer crate balances or deposits right now."
                  : "No supplier crate balances or deposits right now."}
              </div>
            </div>
          ) : (
            <div className="hh-set-list">
              {filteredPhoneParties.map((row) => {
                const subLeft =
                  row.partyType === "customer"
                    ? row.cratesOut > 0
                      ? "Crates out"
                      : row.cratesOut < 0
                        ? "Credit"
                        : "Deposit"
                    : row.cratesOut > 0
                      ? "Owed to supplier"
                      : row.cratesOut < 0
                        ? "Supplier credit"
                        : "Deposit";
                const depositSub =
                  row.depositHeld !== 0 ? `Deposit ₹${money(row.depositHeld)}` : "No deposit";
                return (
                  <button
                    key={`${row.partyType}-${row.partyName}`}
                    type="button"
                    onClick={() =>
                      setSelectedParty({
                        partyType: row.partyType,
                        partyName: row.partyName,
                      })
                    }
                    className="hh-set-row"
                  >
                    <span className="rt-ico rt-ico--neutral">
                      {getInitials(
                        row.partyName,
                        row.partyType === "supplier" ? "S" : "C",
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-slate-900 truncate">
                        {row.partyName}
                      </div>
                      <div className="text-[12px] text-slate-500 mt-0.5">{subLeft}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-extrabold tabular-nums text-slate-900">
                        {row.cratesOut} cs
                      </div>
                      <div className="text-[11.5px] font-medium text-slate-500 mt-0.5 tabular-nums">
                        {depositSub}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[11.5px] text-slate-500 px-0.5 leading-snug">
            {phonePartyFilter === "customer"
              ? "Customer crates come from sales of returnable products minus returns."
              : "Supplier crates come from GRN purchases of returnable products minus returns."}
          </p>
        </div>

        {deleteSheet}
      </div>
    );
  }

  return (
    <div className="mw-workspace flex flex-col gap-4 sm:gap-5 w-full min-w-0 max-w-none mx-auto">
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
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[var(--primary)] text-white font-semibold text-sm shadow-sm cursor-pointer hover:bg-[var(--primary-hover)] shrink-0"
        >
          <Plus size={16} />
          Record
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div data-card-tone="warning" className="rounded-2xl border shadow-xs px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-amber-800/80">
              With customers
            </div>
            <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--amber shrink-0">
              <Package size={15} />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1.5 tabular-nums">
            {totals.withCustomers}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">units to come back</div>
        </div>
        <div data-card-tone="sales" className="rounded-2xl border shadow-xs px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-blue-900/80">
              Owed to suppliers
            </div>
            <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--blue shrink-0">
              <Truck size={15} />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1.5 tabular-nums">
            {totals.owedSuppliers}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">units to return</div>
        </div>
        <div data-card-tone="received" className="rounded-2xl border shadow-xs px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/80">
              Deposits held
            </div>
            <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--green shrink-0">
              <Wallet size={15} />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1.5 tabular-nums">
            ₹{money(totals.depositHeld)}
          </div>
        </div>
      </div>

      {/* Outstanding list or empty state */}
      {partyBalances.length === 0 ? (
        <div data-card-tone="neutral" className="rounded-2xl border shadow-xs px-6 py-12 text-center">
          <h2 className="text-lg font-bold text-slate-900">Nothing outstanding</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
            Mark a product as returnable in Products. Sales and purchases of
            returnable products then track crates automatically; use Record for
            returns and deposits.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Outstanding by party ({partyBalances.length})
          </div>
          <ul className="space-y-2">
            {partyBalances.map((row) => {
              const cardTone =
                row.partyType === "supplier"
                  ? "profit"
                  : row.cratesOut > 0
                    ? "warning"
                    : "received";
              const avatarTone =
                row.partyType === "supplier"
                  ? "hh-avatar--purple"
                  : row.cratesOut > 0
                    ? "hh-avatar--amber"
                    : "hh-avatar--green";
              return (
                <li
                  key={`${row.partyType}-${row.partyName}`}
                  data-card-tone={cardTone}
                  className="rounded-2xl border shadow-xs px-3.5 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5"
                >
                  <span className={`hh-avatar hh-avatar--sm shrink-0 ${avatarTone}`}>
                    {getInitials(row.partyName, row.partyType === "supplier" ? "S" : "C")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 break-words leading-snug">
                      {row.partyName}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 capitalize">
                      {row.partyType}
                    </div>
                  </div>
                  {row.cratesOut !== 0 && (
                    <div className="text-right">
                      <div
                        className={`text-sm font-extrabold tabular-nums ${
                          row.cratesOut > 0 ? "text-amber-800" : "text-emerald-700"
                        }`}
                      >
                        {row.cratesOut > 0 ? "+" : ""}
                        {row.cratesOut} units
                      </div>
                      <div className="text-[10px] font-medium text-slate-500">
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
                      <div className="text-sm font-extrabold tabular-nums text-slate-900">
                        ₹{money(row.depositHeld)}
                      </div>
                      <div className="text-[10px] font-medium text-slate-500">deposit</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Recent manual records */}
      {records.length > 0 && (
        <div data-card-tone="neutral" className="rounded-2xl border shadow-xs overflow-hidden">
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
                    className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
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
                    className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
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
                    className="mt-2 w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
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
                  className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
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
                      className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
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
                      className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
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
                    className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
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
                  className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                />
              </div>

              <button
                type="button"
                onClick={handleSave}
                className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-bold text-sm cursor-pointer hover:bg-[var(--primary-hover)]"
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
