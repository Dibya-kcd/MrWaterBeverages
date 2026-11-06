import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Edit2,
  FileText,
  Phone,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useLedger } from "../../context/LedgerContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { displayName } from "../../utils/displayName";
import {
  Bill,
  Customer,
  ExistingCustomer,
  GRN,
  PaymentRecord,
  SalesReturn,
} from "../../types";
import { money } from "../../utils/billing";
import { billBalance } from "../../utils/salesReturns";
import { useBeats } from "../../hooks/useBeats";
import { ConfirmModal } from "../ui";
import { RecordPaymentModal } from "../common/RecordPaymentModal";
import { RecordRefundModal } from "../common/RecordRefundModal";
import { EditBillModal } from "../common/EditBillModal";
import { DeleteConfirmModal } from "../common/DeleteConfirmModal";
import { normCustName } from "../../context/ledgerHelpers";

type PartyTab = "customers" | "suppliers";

const SUPPLIERS_KEY = "mrwater_cache_suppliers_master";

export interface SupplierMaster {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  contactPerson?: string;
  pan?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

const INDIAN_STATES = [
  "21 · Odisha",
  "27 · Maharashtra",
  "07 · Delhi",
  "09 · Uttar Pradesh",
  "24 · Gujarat",
  "29 · Karnataka",
  "33 · Tamil Nadu",
  "36 · Telangana",
  "37 · Andhra Pradesh",
  "03 · Punjab",
  "06 · Haryana",
  "08 · Rajasthan",
  "23 · Madhya Pradesh",
  "19 · West Bengal",
  "32 · Kerala",
  "10 · Bihar",
];

function loadSuppliers(): SupplierMaster[] {
  try {
    const raw = localStorage.getItem(SUPPLIERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSuppliers(list: SupplierMaster[]) {
  try {
    localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

function seedFromGrns(grns: GRN[], existing: SupplierMaster[]): SupplierMaster[] {
  const byName = new Map<string, SupplierMaster>();
  existing.forEach((s) => byName.set(s.name.trim().toLowerCase(), s));
  let changed = false;
  grns.forEach((g) => {
    const name = (g.supplierName || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (byName.has(key)) {
      const cur = byName.get(key)!;
      if (!cur.phone && g.supplierPhone) {
        cur.phone = g.supplierPhone;
        changed = true;
      }
      if (!cur.gstin && g.supplierGstin) {
        cur.gstin = g.supplierGstin;
        changed = true;
      }
      if (!cur.address && g.supplierAddress) {
        cur.address = g.supplierAddress;
        changed = true;
      }
      if (!cur.email && g.supplierEmail) {
        cur.email = g.supplierEmail;
        changed = true;
      }
      return;
    }
    const neu: SupplierMaster = {
      id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      phone: g.supplierPhone,
      email: g.supplierEmail,
      gstin: g.supplierGstin,
      address: g.supplierAddress,
      createdAt: new Date().toISOString(),
    };
    byName.set(key, neu);
    changed = true;
  });
  return changed ? Array.from(byName.values()) : existing;
}

const emptyCustomerForm = () => ({
  name: "",
  nameOr: "",
  contactPerson: "",
  phone: "",
  customerType: "Retail",
  priceList: "Retail",
  gstRegistered: false,
  state: "21 · Odisha",
  address: "",
  pan: "",
  fssai: "",
  beat: "",
  visitOrder: "0",
  creditLimit: "0",
  creditDays: "0",
  openingBalance: "0",
  gstin: "",
});

const emptySupplierForm = () => ({
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  gstRegistered: false,
  gstin: "",
  state: "21 · Odisha",
  address: "",
  city: "",
  pan: "",
  notes: "",
});

type LedgerEntry =
  | {
      kind: "opening";
      id: string;
      date: string;
      amount: number;
    }
  | {
      kind: "bill";
      id: string;
      date: string;
      bill: Bill;
      amount: number;
      due: number;
    }
  | {
      kind: "return";
      id: string;
      date: string;
      bill: Bill;
      salesReturn: SalesReturn;
      amount: number;
    }
  | {
      kind: "payment";
      id: string;
      date: string;
      payment: PaymentRecord;
      amount: number;
      isLegacy: boolean;
    };

export const CustomersView: React.FC = () => {
  const { activeBeats, beats, customerBeat } = useBeats();
  const {
    customers,
    existingCustomers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    startBillForCustomer,
    grns,
    getCustomerLedger,
    recordCustomerPayment,
    getCustomerCreditSummary,
    applyAdvanceToInvoices,
    recordCustomerRefund,
    updatePayment,
    deletePayment,
    deleteBill,
    updateBill,
    previewBillEdit,
    previewBillDelete,
    reopenTrip,
    trips,
    products,
    promotions,
    warehouses,
    gstMode,
    palette,
    billingSettings,
    remainingStock,
    bills,
    orgProfile,
    customerNameClash,
  } = useLedger();
  const { language } = useLanguage();

  const [partyTab, setPartyTab] = useState<PartyTab>("customers");
  const [searchTerm, setSearchTerm] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm());
  const [selectedCustomer, setSelectedCustomer] =
    useState<ExistingCustomer | null>(null);
  const [customerToDelete, setCustomerToDelete] =
    useState<ExistingCustomer | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Customer ledger actions
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [paymentToEdit, setPaymentToEdit] = useState<PaymentRecord | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentRecord | null>(
    null,
  );
  const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);

  // Suppliers master
  const [suppliers, setSuppliers] = useState<SupplierMaster[]>([]);
  const [editingSupplier, setEditingSupplier] = useState<SupplierMaster | null>(
    null,
  );
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm());
  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierMaster | null>(null);
  const [supplierToDelete, setSupplierToDelete] =
    useState<SupplierMaster | null>(null);
  const [customerFilter, setCustomerFilter] = useState<"all" | "due" | "advance">("all");
  // Beat filter: "all", a beat id, or "none" (customers not in any beat yet).
  const [beatFilter, setBeatFilter] = useState<string>("all");

  useEffect(() => {
    const loaded = loadSuppliers();
    const seeded = seedFromGrns(grns || [], loaded);
    if (seeded !== loaded) saveSuppliers(seeded);
    setSuppliers(seeded);
  }, [grns]);

  const advanceCount = useMemo(() => {
    return existingCustomers.filter(
      (c) => (c.advance || 0) > 0.004
    ).length;
  }, [existingCustomers]);

  const dueCount = useMemo(() => {
    return existingCustomers.filter((c) => (c.balanceDue || 0) > 0.004).length;
  }, [existingCustomers]);

  // beat id of each customer by master id ("" = no beat) and how many customers each beat has
  const beatIdByCustomer = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers || []) m.set(c.id, customerBeat(c)?.id || "");
    return m;
  }, [customers, customerBeat]);
  const beatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const ec of existingCustomers) {
      const b = (ec.id && beatIdByCustomer.get(ec.id)) || "";
      if (b) counts.set(b, (counts.get(b) || 0) + 1);
      else none++;
    }
    return { counts, none };
  }, [existingCustomers, beatIdByCustomer]);

  const filteredCustomers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let list = existingCustomers;
    if (beatFilter !== "all") {
      list = list.filter((c) => {
        const b = (c.id && beatIdByCustomer.get(c.id)) || "";
        return beatFilter === "none" ? !b : b === beatFilter;
      });
    }
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          ((c as any).nameOr || "").toLowerCase().includes(q) ||
          (c.phone || "").includes(q) ||
          (c.gstin || "").toLowerCase().includes(q) ||
          (c.city || "").toLowerCase().includes(q) ||
          (c.address || "").toLowerCase().includes(q),
      );
    }
    if (customerFilter === "due") {
      list = list.filter((c) => (c.balanceDue || 0) > 0.004);
    } else if (customerFilter === "advance") {
      list = list.filter(
        (c) => (c.advance || 0) > 0.004
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [existingCustomers, searchTerm, customerFilter, beatFilter, beatIdByCustomer]);

  const filteredSuppliers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let list = suppliers;
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.phone || "").includes(q) ||
          (s.gstin || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q) ||
          (s.city || "").toLowerCase().includes(q) ||
          (s.address || "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, searchTerm]);

  const grnCountBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    (grns || []).forEach((g) => {
      const k = (g.supplierName || "").trim().toLowerCase();
      if (!k) return;
      map.set(k, (map.get(k) || 0) + 1);
    });
    return map;
  }, [grns]);

  /* ─── Customer form handlers ─── */
  const openAddCustomer = () => {
    setEditingCustomer(null);
    setCustomerForm(emptyCustomerForm());
    setFormError(null);
    setFormOpen(true);
  };

  const openEditCustomer = (ec: ExistingCustomer) => {
    const full = customers.find(
      (c) =>
        c.id === ec.id ||
        c.name.trim().toLowerCase() === ec.name.trim().toLowerCase(),
    );
    setEditingCustomer(full || null);
    setCustomerForm({
      name: full?.name || ec.name || "",
      nameOr: full?.nameOr || (ec as any).nameOr || "",
      contactPerson: "",
      phone: full?.phone || ec.phone || "",
      customerType: "Retail",
      priceList: "Retail",
      gstRegistered: !!(full?.gstin || ec.gstin),
      state: "21 · Odisha",
      address: full?.address || ec.address || "",
      pan: "",
      fssai: "",
      beat: customerBeat(full)?.name || full?.route || full?.city || "",
      visitOrder: "0",
      creditLimit: String(full?.creditLimit ?? ec.creditLimit ?? 0),
      creditDays: "0",
      openingBalance: String(full?.openingBalance ?? 0),
      gstin: full?.gstin || ec.gstin || "",
    });
    setFormError(null);
    setFormOpen(true);
    setSelectedCustomer(null);
  };

  const saveCustomer = () => {
    const name = customerForm.name.trim();
    if (!name) {
      setFormError("Shop / business name is required");
      return;
    }
    const payload = {
      name,
      nameOr: customerForm.nameOr.trim() || undefined,
      phone: customerForm.phone.trim(),
      address: customerForm.address.trim() || undefined,
      city: customerForm.beat.trim() || undefined,
      route: customerForm.beat.trim() || undefined,
      // linked by id so renaming the beat never loses this customer
      beatId: activeBeats.find((b) => b.name === customerForm.beat.trim())?.id,
      gstin: customerForm.gstRegistered
        ? customerForm.gstin.trim() || undefined
        : undefined,
      creditLimit: Number(customerForm.creditLimit) || 0,
      openingBalance: Number(customerForm.openingBalance) || 0,
      notes: [
        customerForm.contactPerson && `Contact: ${customerForm.contactPerson}`,
        customerForm.pan && `PAN: ${customerForm.pan}`,
        customerForm.fssai && `FSSAI: ${customerForm.fssai}`,
        customerForm.customerType && `Type: ${customerForm.customerType}`,
        customerForm.priceList && `Price list: ${customerForm.priceList}`,
        customerForm.state && `State: ${customerForm.state}`,
        customerForm.creditDays && `Credit days: ${customerForm.creditDays}`,
        customerForm.visitOrder && `Visit order: ${customerForm.visitOrder}`,
      ]
        .filter(Boolean)
        .join(" · "),
    };
    if (editingCustomer) {
      const clash = customerNameClash(editingCustomer.id, name);
      if (
        clash &&
        !window.confirm(
          `Another customer is already named "${clash.name}"${clash.phone ? ` (phone ${clash.phone})` : ""}. ` +
            `Their bills stay with them and are NOT merged, but the two will look the same in lists. Save this name anyway?`,
        )
      ) {
        return;
      }
      updateCustomer({
        ...editingCustomer,
        ...payload,
        updatedAt: new Date().toISOString(),
      });
    } else {
      addCustomer(payload);
    }
    setFormOpen(false);
    setEditingCustomer(null);
  };

  /* ─── Supplier form handlers ─── */
  const openAddSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm(emptySupplierForm());
    setFormError(null);
    setFormOpen(true);
  };

  const openEditSupplier = (s: SupplierMaster) => {
    setEditingSupplier(s);
    setSupplierForm({
      name: s.name || "",
      contactPerson: s.contactPerson || "",
      phone: s.phone || "",
      email: s.email || "",
      gstRegistered: !!s.gstin,
      gstin: s.gstin || "",
      state: s.state || "21 · Odisha",
      address: s.address || "",
      city: s.city || "",
      pan: s.pan || "",
      notes: s.notes || "",
    });
    setFormError(null);
    setFormOpen(true);
    setSelectedSupplier(null);
  };

  const saveSupplier = () => {
    const name = supplierForm.name.trim();
    if (!name) {
      setFormError("Supplier / company name is required");
      return;
    }
    const next: SupplierMaster = {
      id:
        editingSupplier?.id ||
        `sup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      contactPerson: supplierForm.contactPerson.trim() || undefined,
      phone: supplierForm.phone.trim() || undefined,
      email: supplierForm.email.trim() || undefined,
      gstin: supplierForm.gstRegistered
        ? supplierForm.gstin.trim() || undefined
        : undefined,
      state: supplierForm.state || undefined,
      address: supplierForm.address.trim() || undefined,
      city: supplierForm.city.trim() || undefined,
      pan: supplierForm.pan.trim() || undefined,
      notes: supplierForm.notes.trim() || undefined,
      createdAt: editingSupplier?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSuppliers((prev) => {
      const without = prev.filter(
        (x) =>
          x.id !== next.id &&
          x.name.trim().toLowerCase() !== name.toLowerCase(),
      );
      const list = [...without, next].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      saveSuppliers(list);
      return list;
    });
    setFormOpen(false);
    setEditingSupplier(null);
  };

  const deleteSupplier = (id: string) => {
    setSuppliers((prev) => {
      const list = prev.filter((s) => s.id !== id);
      saveSuppliers(list);
      return list;
    });
  };

  const openAdd = () => {
    if (partyTab === "suppliers") openAddSupplier();
    else openAddCustomer();
  };

  const setCField = (
    key: keyof ReturnType<typeof emptyCustomerForm>,
    value: string | boolean,
  ) => setCustomerForm((f) => ({ ...f, [key]: value }));

  const setSField = (
    key: keyof ReturnType<typeof emptySupplierForm>,
    value: string | boolean,
  ) => setSupplierForm((f) => ({ ...f, [key]: value }));

  /* ═══════════ Customer detail + ledger ═══════════ */
  if (selectedCustomer && !formOpen) {
    const c = selectedCustomer;
    const ledgerKey = c.id || c.name;
    const ledger = getCustomerLedger(ledgerKey, c.phone, c.altPhone);
    const creditLimit = ledger.customer?.creditLimit ?? c.creditLimit ?? 0;
    const openingBal = ledger.openingBalance || 0;
    const balanceDue = ledger.balanceDue;
    const rawBalance = ledger.rawBalance ?? (openingBal + ledger.totalBilled - (ledger.totalReturns || 0) - ledger.totalPaid);
    const isOverLimit = ledger.isOverLimit;

    const formatEntryDate = (dateStr: string) => {
      if (!dateStr) return "—";
      const d = new Date(
        dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr,
      );
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      });
    };

    const ledgerEntries: LedgerEntry[] = (() => {
      const entries: LedgerEntry[] = [];
      if (openingBal !== 0) {
        entries.push({
          kind: "opening",
          id: "opening",
          date: ledger.customer?.createdAt?.slice(0, 10) || "1970-01-01",
          amount: openingBal,
        });
      }
      for (const b of ledger.bills) {
        if (b.status === "cancelled" || b.cancelled) continue;
        entries.push({
          kind: "bill",
          id: `bill_${b.id}`,
          date: b.date || "",
          bill: b,
          amount: b.total || 0,
          due: billBalance(b),
        });

        for (const ret of b.returns || []) {
          entries.push({
            kind: "return",
            id: `ret_${ret.id || b.id}_${ret.creditNoteNo || ""}`,
            date: ret.date || b.date || "",
            bill: b,
            salesReturn: ret,
            amount: ret.totalCredit || 0,
          });
        }
      }
      for (const p of ledger.payments) {
        const isLegacy = String(p.id || "").startsWith("legacy_pay_");
        entries.push({
          kind: "payment",
          id: p.id,
          date: p.paymentDate || p.createdAt?.slice(0, 10) || "",
          payment: p,
          amount: p.amount || 0,
          isLegacy,
        });
      }
      entries.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        const rank: Record<string, number> = { opening: 0, bill: 1, return: 2, payment: 3 };
        return (rank[a.kind] || 0) - (rank[b.kind] || 0);
      });
      return entries;
    })();

    let running = 0;
    const entriesWithBalance = ledgerEntries.map((e) => {
      if (e.kind === "opening") running += e.amount;
      else if (e.kind === "bill") running += e.amount;
      else if (e.kind === "return") running -= e.amount;
      else running -= e.amount;
      return { ...e, runningBalance: Math.round(running * 100) / 100 };
    });

    // WhatsApp Statement text builder
    const statementWaUrl = (() => {
      const cleanPhone = (c.phone || "").replace(/\D/g, "");
      const destPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      if (!destPhone) return null;
      const orgName = orgProfile?.name || "MrWater Distribution";
      const lines = [
        `*Customer Ledger Statement - ${displayName(c, language)}*`,
        orgName,
        `Date: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
        `--------------------------------`,
        `*Total Invoiced:* ₹${money(ledger.totalBilled)}`,
        (ledger.totalReturns || 0) > 0 ? `*Returns / Credit Notes:* -₹${money(ledger.totalReturns)}` : null,
        `*Total Paid:* ₹${money(ledger.totalPaid)}`,
        openingBal !== 0 ? `*Opening Balance:* ₹${money(openingBal)}` : null,
        `--------------------------------`,
        rawBalance < 0
          ? `*Account Balance:* ₹${money(Math.abs(rawBalance))} (Advance / Credit)`
          : `*Current Balance Due:* ₹${money(balanceDue)}`,
        ``,
        `Please verify your ledger records. Thank you!`,
      ].filter(Boolean);
      return `https://wa.me/${destPhone}?text=${encodeURIComponent(lines.join("\n"))}`;
    })();

    return (
      <div className="min-h-[100dvh] bg-[#f6f4ef] pb-28">
        {/* Sticky header — works on mobile & desktop */}
        <div className="sticky top-0 z-20 bg-[#f6f4ef]/95 backdrop-blur border-b border-black/5 px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3 max-w-none lg:max-w-3xl mx-auto w-full">
          <button
            type="button"
            onClick={() => {
              setSelectedCustomer(null);
              setShowRecordPayment(false);
              setPaymentToEdit(null);
              setPaymentToDelete(null);
              setBillToEdit(null);
              setBillToDelete(null);
            }}
            className="p-2 -ml-1 rounded-full hover:bg-black/5 cursor-pointer shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-800" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {displayName(c, language)}
            </h1>
            <p className="text-xs text-slate-500 truncate">
              {c.phone || "No phone"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditCustomer(c)}
            className="text-sm font-semibold text-[#0d4a3a] px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-[#0d4a3a]/10 cursor-pointer shrink-0"
          >
            Edit
          </button>
        </div>

        <div className="px-3 sm:px-6 py-4 space-y-3 max-w-none lg:max-w-3xl mx-auto w-full">
          {/* Summary card */}
          <div
            className={`rounded-2xl border shadow-sm p-4 space-y-3 transition-colors ${
              rawBalance < 0
                ? "bg-gradient-to-br from-emerald-50 via-teal-50/40 to-white border-emerald-300 shadow-emerald-500/10"
                : "bg-white border-black/5"
            }`}
          >
            <div className="flex flex-wrap justify-between items-baseline gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    rawBalance < 0 ? "text-emerald-800" : "text-slate-500"
                  }`}
                >
                  {rawBalance < 0 ? "Advance on Account" : "Balance due"}
                </span>
                {rawBalance < 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow-xs">
                    ADVANCE CREDIT
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isOverLimit && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                    Over limit
                  </span>
                )}
                <span
                  className={`text-xl sm:text-2xl font-black ${
                    rawBalance < 0
                      ? "text-emerald-700"
                      : balanceDue > 0
                        ? "text-rose-600"
                        : "text-emerald-700"
                  }`}
                >
                  {rawBalance < 0
                    ? `₹${money(Math.abs(rawBalance))} (Advance)`
                    : `₹${money(balanceDue)}`}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-[11px] text-slate-500">Total billed</div>
                <div className="font-semibold text-slate-800">
                  ₹{money(ledger.totalBilled)}
                </div>
              </div>
              {(ledger.totalReturns || 0) > 0 && (
                <div>
                  <div className="text-[11px] text-slate-500">Sales returns</div>
                  <div className="font-semibold text-blue-700">
                    -₹{money(ledger.totalReturns)}
                  </div>
                </div>
              )}
              {openingBal !== 0 && (
                <div>
                  <div className="text-[11px] text-slate-500">Opening bal.</div>
                  <div className="font-semibold text-slate-800">
                    ₹{money(openingBal)}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] text-slate-500">Total paid</div>
                <div className="font-semibold text-slate-800">
                  ₹{money(ledger.totalPaid)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Credit limit</div>
                <div className="font-semibold text-slate-800">
                  {creditLimit > 0 ? `₹${money(creditLimit)}` : "No limit"}
                </div>
              </div>
            </div>
          </div>

          {/* Address */}
          {(c.address || c.city || c.gstin) && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 space-y-1.5 text-sm">
              {c.address && <p className="text-slate-700">{c.address}</p>}
              {c.city && <p className="text-slate-500">{c.city}</p>}
              {c.gstin && (
                <p className="font-mono text-xs text-slate-600">
                  GSTIN {c.gstin}
                </p>
              )}
            </div>
          )}

          {/* Advance / credit: use it on unpaid invoices or pay it back */}
          {(() => {
            const credit = getCustomerCreditSummary(c.name);
            if (credit.advance <= 0.004 && credit.overpaid <= 0.004 && credit.refundable <= 0.004) return null;
            return (
              <div className="p-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>
                  {credit.advance > 0.004 && <>Advance on account: <b>₹{money(credit.advance)}</b>. </>}
                  {credit.overpaid > 0.004 && <>Paid above invoice value (returns): <b>₹{money(credit.overpaid)}</b>. </>}
                  {credit.refundable > 0.004 && <>Net credit owed to customer: <b>₹{money(credit.refundable)}</b>.</>}
                </span>
                <span className="flex gap-2 shrink-0">
                  {credit.canApply && (
                    <button
                      type="button"
                      onClick={() => applyAdvanceToInvoices(c.name)}
                      className="px-3 py-1.5 rounded-lg bg-sky-700 text-white font-bold hover:bg-sky-800 cursor-pointer"
                    >
                      Use on unpaid invoices
                    </button>
                  )}
                  {credit.refundable > 0.004 && (
                    <button
                      type="button"
                      onClick={() => setShowRefund(true)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-sky-300 text-sky-900 font-bold hover:bg-sky-100 cursor-pointer"
                    >
                      Refund to customer
                    </button>
                  )}
                </span>
              </div>
            );
          })()}

          {/* Primary actions — stack on narrow screens, row on sm+ */}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => startBillForCustomer(c.name, c.phone)}
              className="flex-1 py-3 rounded-xl bg-[#0d4a3a] text-white font-semibold text-sm cursor-pointer active:scale-[0.99] flex items-center justify-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              New bill
            </button>
            <button
              type="button"
              onClick={() => setShowRecordPayment(true)}
              className="flex-1 py-3 rounded-xl bg-white border border-[#0d4a3a]/30 text-[#0d4a3a] font-semibold text-sm cursor-pointer active:scale-[0.99] flex items-center justify-center gap-1.5"
            >
              <CreditCard className="w-4 h-4" />
              Record payment
            </button>
            {statementWaUrl && (
              <a
                href={statementWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-emerald-100"
              >
                <Share2 className="w-4 h-4 text-emerald-700" /> Share
              </a>
            )}
            <div className="flex gap-2">
              {c.phone && (
                <a
                  href={`tel:${c.phone}`}
                  className="flex-1 sm:flex-none px-4 py-3 rounded-xl bg-white border border-black/10 text-slate-800 font-semibold text-sm flex items-center justify-center gap-1.5"
                >
                  <Phone className="w-4 h-4" /> Call
                </a>
              )}
              <button
                type="button"
                onClick={() => setCustomerToDelete(c)}
                className="px-3 py-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 cursor-pointer"
                aria-label="Delete customer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Ledger */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#0d4a3a]" />
                Customer ledger
              </h2>
              <span className="text-[11px] text-slate-500">
                {entriesWithBalance.length} entr
                {entriesWithBalance.length === 1 ? "y" : "ies"}
              </span>
            </div>

            {entriesWithBalance.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No transactions yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Create a bill or record a payment to start the ledger
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-black/5">
                {entriesWithBalance.map((entry) => {
                  if (entry.kind === "opening") {
                    return (
                      <li
                        key={entry.id}
                        className="px-3 sm:px-4 py-3 flex gap-3 items-start"
                      >
                        <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold text-slate-800">
                              Opening balance
                            </span>
                            <span
                              className={`text-sm font-bold tabular-nums ${
                                entry.amount > 0
                                  ? "text-rose-600"
                                  : "text-emerald-700"
                              }`}
                            >
                              {entry.amount > 0 ? "+" : ""}₹
                              {money(Math.abs(entry.amount))}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
                            <span className="text-[11px] text-slate-500">
                              {formatEntryDate(entry.date)}
                            </span>
                            <span className="text-[11px] text-slate-400 tabular-nums">
                              Bal {entry.runningBalance < 0 ? `₹${money(Math.abs(entry.runningBalance))} (Adv)` : `₹${money(entry.runningBalance)}`}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  }

                  if (entry.kind === "return") {
                    const ret = entry.salesReturn;
                    return (
                      <li
                        key={entry.id}
                        className="px-3 sm:px-4 py-3 flex gap-3 items-start group"
                      >
                        <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <RotateCcw className="w-4 h-4 text-blue-700" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold text-slate-800">
                              Sales Return {ret.creditNoteNo ? `· CN #${ret.creditNoteNo}` : ""}
                            </span>
                            <span className="text-sm font-bold tabular-nums text-blue-700">
                              −₹{money(entry.amount)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span className="text-[11px] text-slate-500">
                              {formatEntryDate(entry.date)}
                            </span>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                              Invoice #{entry.bill.id}
                            </span>
                            {ret.reason && (
                              <span className="text-[11px] text-slate-400 truncate max-w-[10rem] sm:max-w-xs">
                                {ret.reason}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
                              Bal {entry.runningBalance < 0 ? `₹${money(Math.abs(entry.runningBalance))} (Adv)` : `₹${money(entry.runningBalance)}`}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  }

                  if (entry.kind === "bill") {
                    const b = entry.bill;
                    const invNo = `${billingSettings?.invoicePrefix || ""}${b.id}`;
                    return (
                      <li
                        key={entry.id}
                        className="px-3 sm:px-4 py-3 flex gap-3 items-start group"
                      >
                        <div className="mt-0.5 w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-amber-700" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold text-slate-800">
                              Bill {invNo}
                            </span>
                            <span className="text-sm font-bold tabular-nums text-rose-600">
                              +₹{money(entry.amount)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span className="text-[11px] text-slate-500">
                              {formatEntryDate(entry.date)}
                            </span>
                            {entry.due > 0 && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-50 text-rose-600">
                                Due ₹{money(entry.due)}
                              </span>
                            )}
                            {entry.due <= 0 && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                                Paid
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
                              Bal {entry.runningBalance < 0 ? `₹${money(Math.abs(entry.runningBalance))} (Adv)` : `₹${money(entry.runningBalance)}`}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <button
                              type="button"
                              onClick={() => setBillToEdit(b)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0d4a3a] px-2 py-1 rounded-lg hover:bg-[#0d4a3a]/10 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setBillToDelete(b)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  }

                  // payment
                  const p = entry.payment;
                  const modeLabel = (p.mode || "cash").toUpperCase();
                  return (
                    <li
                      key={entry.id}
                      className="px-3 sm:px-4 py-3 flex gap-3 items-start group"
                    >
                      <div className="mt-0.5 w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <CreditCard className="w-4 h-4 text-emerald-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                          <span className="text-sm font-semibold text-slate-800">
                            {p.isRefund ? "Refund paid" : "Payment"}
                            {p.billId ? ` · Bill #${p.billId}` : ""}
                          </span>
                          <span className={`text-sm font-bold tabular-nums ${entry.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                            {entry.amount < 0 ? "+" : "−"}₹{money(Math.abs(entry.amount))}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          <span className="text-[11px] text-slate-500">
                            {formatEntryDate(entry.date)}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {modeLabel}
                          </span>
                          {p.referenceNote && (
                            <span className="text-[11px] text-slate-400 truncate max-w-[10rem] sm:max-w-xs">
                              {p.referenceNote}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
                            Bal {entry.runningBalance < 0 ? `₹${money(Math.abs(entry.runningBalance))} (Adv)` : `₹${money(entry.runningBalance)}`}
                          </span>
                        </div>
                        {!entry.isLegacy && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {!p.isRefund && (
                            <button
                              type="button"
                              onClick={() => setPaymentToEdit(p)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0d4a3a] px-2 py-1 rounded-lg hover:bg-[#0d4a3a]/10 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" /> Edit
                            </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setPaymentToDelete(p)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        )}
                        {entry.isLegacy && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            Linked to invoice payment (edit via bill)
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Delete customer */}
        {customerToDelete && (
          <ConfirmModal
            isOpen
            title="Delete customer?"
            message={`Remove ${customerToDelete.name} from the directory? Past bills are kept.`}
            confirmButtonLabel="Delete"
            variant="danger"
            rectificationPrompt="Rectification comment (saved with the delete)"
            onConfirmWithComment={(comment) => {
              if (customerToDelete.id) deleteCustomer(customerToDelete.id, comment);
              setCustomerToDelete(null);
              setSelectedCustomer(null);
            }}
            onConfirm={() => {
              if (customerToDelete.id) deleteCustomer(customerToDelete.id);
              setCustomerToDelete(null);
              setSelectedCustomer(null);
            }}
            onClose={() => setCustomerToDelete(null)}
          />
        )}

        {/* Delete payment */}
        {paymentToDelete && (
          <ConfirmModal
            isOpen
            title="Delete payment?"
            message={`Delete receipt of ₹${money(paymentToDelete.amount)} from ${paymentToDelete.customerName}? The customer's balance due will increase.`}
            confirmButtonLabel="Delete payment"
            variant="danger"
            rectificationPrompt="Rectification comment (saved with the delete)"
            onConfirmWithComment={(comment) => {
              deletePayment(paymentToDelete.id, comment);
              setPaymentToDelete(null);
            }}
            onConfirm={() => {
              deletePayment(paymentToDelete.id);
              setPaymentToDelete(null);
            }}
            onClose={() => setPaymentToDelete(null)}
          />
        )}

        {/* Delete bill */}
        {billToDelete && (
          <DeleteConfirmModal
            bill={billToDelete}
            preview={previewBillDelete(billToDelete.id)}
            invoicePrefix={billingSettings?.invoicePrefix || ""}
            onConfirm={(id, o) => {
              // Stay open when the delete is refused (closed trip, returns) so the message is not lost.
              if (deleteBill(id, o)) setBillToDelete(null);
            }}
            onReopenTrip={reopenTrip}
            onCancel={() => setBillToDelete(null)}
          />
        )}

        {/* Refund credit to customer */}
        {showRefund && (
          <RecordRefundModal
            customerName={displayName(c, language)}
            maxAmount={getCustomerCreditSummary(c.name).refundable}
            onClose={() => setShowRefund(false)}
            onSave={(amount, date, mode, note) =>
              recordCustomerRefund(c.name, amount, date, mode, note)
            }
          />
        )}

        {/* Record payment */}
        {showRecordPayment && (
          <RecordPaymentModal
            isOpen
            onClose={() => setShowRecordPayment(false)}
            initialCustomerName={displayName(c, language)}
            existingCustomers={existingCustomers}
            bills={bills}
            palette={palette}
            onSavePayment={(payload) => {
              recordCustomerPayment(
                payload.customerName,
                payload.amount,
                payload.paymentDate,
                payload.mode,
                payload.referenceNote,
                payload.billId,
                // only a registered customer's own id; a name typed in the modal is matched by name as before
                normCustName(payload.customerName) === normCustName(c.name) ? c.id : undefined,
              );
              setShowRecordPayment(false);
            }}
          />
        )}

        {/* Edit payment */}
        {paymentToEdit && (
          <RecordPaymentModal
            isOpen
            onClose={() => setPaymentToEdit(null)}
            paymentToEdit={paymentToEdit}
            existingCustomers={existingCustomers}
            bills={bills}
            palette={palette}
            onSavePayment={(payload) => {
              const updated: PaymentRecord = {
                ...paymentToEdit,
                customerName: payload.customerName,
                billId: payload.billId,
                amount: payload.amount,
                paymentDate: payload.paymentDate,
                mode: payload.mode,
                referenceNote: payload.referenceNote,
              };
              updatePayment(updated);
              setPaymentToEdit(null);
            }}
          />
        )}

        {/* Edit bill */}
        {billToEdit && (
          <EditBillModal
            bill={billToEdit}
            onClose={() => setBillToEdit(null)}
            onSave={(updated, o) => updateBill(updated, o)}
            previewEdit={previewBillEdit}
            onReopenTrip={reopenTrip}
            trips={trips}
            onRequestDelete={(b) => {
              setBillToEdit(null);
              setBillToDelete(b);
            }}
            products={products}
            promotions={promotions}
            warehouses={warehouses}
            existingCustomers={existingCustomers}
            gstMode={gstMode}
            palette={palette}
            invoicePrefix={billingSettings?.invoicePrefix || ""}
            remainingStock={remainingStock}
          />
        )}
      </div>
    );
  }

  /* ═══════════ Supplier detail ═══════════ */
  if (selectedSupplier && !formOpen) {
    const s = selectedSupplier;
    const grnN = grnCountBySupplier.get(s.name.trim().toLowerCase()) || 0;
    return (
      <div className="min-h-[100dvh] bg-[#f6f4ef] pb-24">
        <div className="sticky top-0 z-20 bg-[#f6f4ef]/95 backdrop-blur border-b border-black/5 px-4 sm:px-6 py-3 flex items-center gap-3 max-w-none lg:max-w-2xl mx-auto w-full">
          <button
            type="button"
            onClick={() => setSelectedSupplier(null)}
            className="p-2 -ml-1 rounded-full hover:bg-black/5 cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-800" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900 truncate">{s.name}</h1>
            <p className="text-xs text-slate-500 truncate">
              {s.phone || s.email || "No contact"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditSupplier(s)}
            className="text-sm font-semibold text-[#0d4a3a] px-3 py-1.5 rounded-lg hover:bg-[#0d4a3a]/10 cursor-pointer"
          >
            Edit
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-3 max-w-none lg:max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Inward GRNs
              </span>
              <span className="text-xl font-extrabold text-slate-900">{grnN}</span>
            </div>
            {s.contactPerson && (
              <p className="text-sm text-slate-600">Contact: {s.contactPerson}</p>
            )}
            {s.gstin && (
              <p className="font-mono text-xs text-slate-600">GSTIN {s.gstin}</p>
            )}
            {s.pan && (
              <p className="font-mono text-xs text-slate-600">PAN {s.pan}</p>
            )}
          </div>

          {(s.address || s.city || s.state) && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 space-y-1 text-sm">
              {s.address && <p className="text-slate-700">{s.address}</p>}
              {(s.city || s.state) && (
                <p className="text-slate-500">
                  {[s.city, s.state].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          )}

          {s.notes && (
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 text-sm text-slate-600">
              {s.notes}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {s.phone && (
              <a
                href={`tel:${s.phone}`}
                className="flex-1 py-3 rounded-xl bg-[#0d4a3a] text-white font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <Phone className="w-4 h-4" /> Call
              </a>
            )}
            <button
              type="button"
              onClick={() => setSupplierToDelete(s)}
              className="px-3 py-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 cursor-pointer"
              aria-label="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {supplierToDelete && (
          <ConfirmModal
            isOpen
            title="Delete supplier?"
            message={`Remove ${supplierToDelete.name} from the directory? Past GRNs are kept.`}
            confirmButtonLabel="Delete"
            variant="danger"
            onConfirm={() => {
              deleteSupplier(supplierToDelete.id);
              setSupplierToDelete(null);
              setSelectedSupplier(null);
            }}
            onClose={() => setSupplierToDelete(null)}
          />
        )}
      </div>
    );
  }

  /* ═══════════ Forms ═══════════ */
  if (formOpen) {
    const isSupplier = partyTab === "suppliers" || !!editingSupplier;
    return (
      <div className="fixed inset-0 z-50 bg-[#f6f4ef] flex flex-col">
        <div className="sticky top-0 z-10 bg-[#f6f4ef] border-b border-black/5 px-4 sm:px-6 py-3 flex items-center justify-between max-w-none lg:max-w-2xl mx-auto w-full">
          <h1 className="text-lg font-bold text-slate-900">
            {isSupplier
              ? editingSupplier
                ? "Edit supplier"
                : "New supplier"
              : editingCustomer
                ? "Edit customer"
                : "New customer"}
          </h1>
          <button
            type="button"
            onClick={() => {
              setFormOpen(false);
              setEditingCustomer(null);
              setEditingSupplier(null);
            }}
            className="p-2 rounded-full hover:bg-black/5 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 pb-28 max-w-none lg:max-w-2xl mx-auto w-full space-y-4">
          {formError && (
            <div className="text-sm font-medium text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {formError}
            </div>
          )}

          {isSupplier ? (
            <>
              <Field label="Company / Supplier name">
                <input
                  className="crate-input"
                  value={supplierForm.name}
                  onChange={(e) => setSField("name", e.target.value)}
                  autoFocus
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Contact person">
                  <input
                    className="crate-input"
                    value={supplierForm.contactPerson}
                    onChange={(e) => setSField("contactPerson", e.target.value)}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className="crate-input"
                    inputMode="tel"
                    value={supplierForm.phone}
                    onChange={(e) => setSField("phone", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Email">
                <input
                  className="crate-input"
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSField("email", e.target.value)}
                />
              </Field>
              <div className="flex items-center justify-between py-1">
                <span className="text-sm font-medium text-slate-700">
                  GST registered
                </span>
                <Toggle
                  on={supplierForm.gstRegistered}
                  onChange={(v) => setSField("gstRegistered", v)}
                />
              </div>
              {supplierForm.gstRegistered && (
                <Field label="GSTIN">
                  <input autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                    className="crate-input uppercase"
                    value={supplierForm.gstin}
                    onChange={(e) =>
                      setSField("gstin", e.target.value.toUpperCase())
                    }
                    placeholder="22AAAAA0000A1Z5"
                  />
                </Field>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="State">
                  <select
                    className="crate-input"
                    value={supplierForm.state}
                    onChange={(e) => setSField("state", e.target.value)}
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="City">
                  <input
                    className="crate-input"
                    value={supplierForm.city}
                    onChange={(e) => setSField("city", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Address">
                <textarea
                  className="crate-input min-h-[72px] resize-y"
                  value={supplierForm.address}
                  onChange={(e) => setSField("address", e.target.value)}
                />
              </Field>
              <Field label="PAN">
                <input
                  className="crate-input uppercase"
                  value={supplierForm.pan}
                  onChange={(e) =>
                    setSField("pan", e.target.value.toUpperCase())
                  }
                />
              </Field>
              <Field label="Notes">
                <textarea
                  className="crate-input min-h-[64px] resize-y"
                  value={supplierForm.notes}
                  onChange={(e) => setSField("notes", e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Shop / Business name (English)">
                <input
                  className="crate-input"
                  value={customerForm.name}
                  onChange={(e) => setCField("name", e.target.value)}
                  autoFocus
                />
              </Field>
              <Field label="Name in Odia (ଓଡ଼ିଆ) — optional">
                <input
                  className="crate-input"
                  value={customerForm.nameOr || ""}
                  onChange={(e) => setCField("nameOr", e.target.value)}
                  placeholder="ଉଦାହରଣ: ମାଆ ଦୁର୍ଗା ଷ୍ଟୋର୍"
                  dir="auto"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Contact person">
                  <input
                    className="crate-input"
                    value={customerForm.contactPerson}
                    onChange={(e) => setCField("contactPerson", e.target.value)}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className="crate-input"
                    inputMode="tel"
                    value={customerForm.phone}
                    onChange={(e) => setCField("phone", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Customer type">
                  <select
                    className="crate-input"
                    value={customerForm.customerType}
                    onChange={(e) => setCField("customerType", e.target.value)}
                  >
                    <option>Retail</option>
                    <option>Wholesale</option>
                    <option>Distributor</option>
                    <option>Institution</option>
                  </select>
                </Field>
                <Field label="Price list">
                  <select
                    className="crate-input"
                    value={customerForm.priceList}
                    onChange={(e) => setCField("priceList", e.target.value)}
                  >
                    <option>Retail</option>
                    <option>Wholesale</option>
                    <option>Special</option>
                  </select>
                </Field>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-sm font-medium text-slate-700">
                  GST registered (B2B)
                </span>
                <Toggle
                  on={customerForm.gstRegistered}
                  onChange={(v) => setCField("gstRegistered", v)}
                />
              </div>
              {customerForm.gstRegistered && (
                <Field label="GSTIN">
                  <input autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                    className="crate-input uppercase"
                    value={customerForm.gstin}
                    onChange={(e) =>
                      setCField("gstin", e.target.value.toUpperCase())
                    }
                    placeholder="22AAAAA0000A1Z5"
                  />
                </Field>
              )}
              <Field label="State">
                <select
                  className="crate-input"
                  value={customerForm.state}
                  onChange={(e) => setCField("state", e.target.value)}
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Address">
                <textarea
                  className="crate-input min-h-[72px] resize-y"
                  value={customerForm.address}
                  onChange={(e) => setCField("address", e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="PAN">
                  <input
                    className="crate-input uppercase"
                    value={customerForm.pan}
                    onChange={(e) =>
                      setCField("pan", e.target.value.toUpperCase())
                    }
                  />
                </Field>
                <Field label="FSSAI">
                  <input
                    className="crate-input"
                    value={customerForm.fssai}
                    onChange={(e) => setCField("fssai", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Beat">
                  <select
                    className="crate-input"
                    value={customerForm.beat}
                    onChange={(e) => setCField("beat", e.target.value)}
                  >
                    <option value="">—</option>
                    {activeBeats.map((b) => (
                      <option key={b.id || b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                    {customerForm.beat && !activeBeats.some((b) => b.name === customerForm.beat) && (
                      <option value={customerForm.beat}>{customerForm.beat}</option>
                    )}
                  </select>
                </Field>
                <Field label="Visit order">
                  <input
                    className="crate-input"
                    inputMode="numeric"
                    value={customerForm.visitOrder}
                    onChange={(e) => setCField("visitOrder", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Credit limit ₹">
                  <input
                    className="crate-input"
                    inputMode="decimal"
                    value={customerForm.creditLimit}
                    onChange={(e) => setCField("creditLimit", e.target.value)}
                  />
                </Field>
                <Field label="Credit days">
                  <input
                    className="crate-input"
                    inputMode="numeric"
                    value={customerForm.creditDays}
                    onChange={(e) => setCField("creditDays", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Opening balance ₹">
                <input
                  className="crate-input"
                  inputMode="decimal"
                  value={customerForm.openingBalance}
                  onChange={(e) => setCField("openingBalance", e.target.value)}
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Positive = they owe you. Negative = you owe them.
                </p>
              </Field>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-[#f6f4ef] border-t border-black/5 px-4 sm:px-6 py-3">
          <button
            type="button"
            onClick={isSupplier ? saveSupplier : saveCustomer}
            className="w-full max-w-none lg:max-w-2xl mx-auto block py-3.5 rounded-2xl bg-[#0d4a3a] text-white font-semibold text-base shadow-sm cursor-pointer active:scale-[0.99]"
          >
            Save
          </button>
        </div>

        <style>{CRATE_INPUT_CSS}</style>
      </div>
    );
  }

  /* ═══════════ Main Parties list ═══════════ */
  return (
    <div className="min-h-[100dvh] bg-[#f6f4ef] pb-24">
      <div className="px-4 sm:px-6 pt-2 pb-4 max-w-none lg:max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Parties
          </h1>
          <button
            type="button"
            onClick={openAdd}
            className="size-10 sm:size-11 rounded-full bg-[#0d4a3a] text-white flex items-center justify-center shadow-md cursor-pointer active:scale-95"
            aria-label={partyTab === "suppliers" ? "Add supplier" : "Add customer"}
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex bg-[#ebe8e1] rounded-full p-1 mb-4">
          <button
            type="button"
            onClick={() => {
              setPartyTab("customers");
              setSearchTerm("");
            }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-full transition-colors cursor-pointer ${
              partyTab === "customers"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Customers
          </button>
          <button
            type="button"
            onClick={() => {
              setPartyTab("suppliers");
              setSearchTerm("");
            }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-full transition-colors cursor-pointer ${
              partyTab === "suppliers"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Suppliers
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input enterKeyHint="search"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              partyTab === "suppliers"
                ? "Search name, phone, GSTIN"
                : "Search name, phone, GSTIN"
            }
            className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white border border-black/8 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/25 focus:border-[#0d4a3a]/40"
          />
        </div>

        {partyTab === "customers" && (
          <div className="flex items-center gap-1.5 mb-3.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setCustomerFilter("all")}
              className={`px-3 py-1.5 rounded-full font-semibold transition-colors cursor-pointer shrink-0 ${
                customerFilter === "all"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-black/5 hover:bg-slate-50"
              }`}
            >
              All ({existingCustomers.length})
            </button>
            <button
              type="button"
              onClick={() => setCustomerFilter("due")}
              className={`px-3 py-1.5 rounded-full font-semibold transition-colors cursor-pointer shrink-0 ${
                customerFilter === "due"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-white text-rose-700 border border-rose-200 hover:bg-rose-50"
              }`}
            >
              With Due ({dueCount})
            </button>
            <button
              type="button"
              onClick={() => setCustomerFilter("advance")}
              className={`px-3 py-1.5 rounded-full font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                customerFilter === "advance"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  customerFilter === "advance" ? "bg-white" : "bg-emerald-500"
                }`}
              />
              With Advance ({advanceCount})
            </button>
          </div>
        )}

        {partyTab === "customers" && beats.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3.5 overflow-x-auto pb-1 text-xs" aria-label="Filter by beat">
            {[
              { id: "all", label: "All beats", n: existingCustomers.length },
              ...beats.filter((b) => b.active !== false).map((b) => ({ id: b.id, label: b.name, n: beatCounts.counts.get(b.id) || 0 })),
              { id: "none", label: "No beat yet", n: beatCounts.none },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setBeatFilter(chip.id)}
                className={`px-3 py-1.5 rounded-full font-semibold transition-colors cursor-pointer shrink-0 ${
                  beatFilter === chip.id
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "bg-white text-slate-600 border border-black/5 hover:bg-slate-50"
                }`}
              >
                {chip.label} ({chip.n})
              </button>
            ))}
          </div>
        )}

        {partyTab === "suppliers" ? (
          filteredSuppliers.length === 0 ? (
            <EmptyCard
              title="No suppliers yet"
              hint="Tap + to add one. Names from GRNs are imported automatically."
            />
          ) : (
            <ul className="space-y-2">
              {filteredSuppliers.map((s) => {
                const grnN =
                  grnCountBySupplier.get(s.name.trim().toLowerCase()) || 0;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSupplier(s)}
                      className="w-full text-left bg-white rounded-2xl border border-black/5 shadow-sm px-4 py-3.5 flex items-center gap-3 hover:border-black/10 cursor-pointer active:scale-[0.99] transition"
                    >
                      <div className="size-10 rounded-full bg-[#ebe8e1] text-[#0d4a3a] flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 break-words leading-snug">
                          {s.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {s.phone || s.city || s.gstin || "—"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-slate-800">
                          {grnN}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                          GRNs
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : filteredCustomers.length === 0 ? (
          <EmptyCard title="No customers yet" hint="Tap + to add one." />
        ) : (
          <ul className="space-y-2">
            {filteredCustomers.map((c) => {
              const hasAdvance = (c.advance || 0) > 0.004 && c.balanceDue <= 0.004;
              return (
              <li key={c.id || c.name}>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(c)}
                  className={`w-full text-left rounded-2xl border shadow-sm px-4 py-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition ${
                    hasAdvance
                      ? "bg-gradient-to-r from-emerald-50/80 via-teal-50/30 to-white border-emerald-300 hover:border-emerald-400 shadow-emerald-500/5"
                      : "bg-white border-black/5 hover:border-black/10"
                  }`}
                >
                  <div
                    className={`size-10 rounded-full flex items-center justify-center shrink-0 ${
                      hasAdvance
                        ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300/60"
                        : "bg-[#ebe8e1] text-[#0d4a3a]"
                    }`}
                  >
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 break-words leading-snug">
                        {displayName(c, language)}
                      </span>
                      {hasAdvance && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                          Advance
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {c.phone || c.city || "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {hasAdvance ? (
                      <>
                        <div className="text-sm font-black text-emerald-700">
                          ₹{money(c.advance || 0)}
                        </div>
                        <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                          advance
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className={`text-sm font-bold ${
                            c.balanceDue > 0 ? "text-rose-600" : "text-slate-700"
                          }`}
                        >
                          ₹{money(c.balanceDue)}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                          due
                        </div>
                      </>
                    )}
                  </div>
                </button>
              </li>
            );})}
          </ul>
        )}
      </div>

      {customerToDelete && (
        <ConfirmModal
          isOpen
          title="Delete customer?"
          message={`Remove ${customerToDelete.name}?`}
          confirmButtonLabel="Delete"
          variant="danger"
          rectificationPrompt="Rectification comment (saved with the delete)"
          onConfirmWithComment={(comment) => {
            if (customerToDelete.id) deleteCustomer(customerToDelete.id, comment);
            setCustomerToDelete(null);
          }}
          onConfirm={() => {
            if (customerToDelete.id) deleteCustomer(customerToDelete.id);
            setCustomerToDelete(null);
          }}
          onClose={() => setCustomerToDelete(null)}
        />
      )}

      {supplierToDelete && (
        <ConfirmModal
          isOpen
          title="Delete supplier?"
          message={`Remove ${supplierToDelete.name}?`}
          confirmButtonLabel="Delete"
          variant="danger"
          onConfirm={() => {
            deleteSupplier(supplierToDelete.id);
            setSupplierToDelete(null);
          }}
          onClose={() => setSupplierToDelete(null)}
        />
      )}
    </div>
  );
};

const CRATE_INPUT_CSS = `
  .crate-input {
    width: 100%;
    padding: 0.65rem 0.9rem;
    border-radius: 0.85rem;
    border: 1px solid rgba(0,0,0,0.08);
    background: #fff;
    font-size: 0.9rem;
    color: #1e293b;
    outline: none;
  }
  .crate-input:focus {
    border-color: rgba(13, 74, 58, 0.45);
    box-shadow: 0 0 0 3px rgba(13, 74, 58, 0.12);
  }
`;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
        on ? "bg-[#0d4a3a]" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function EmptyCard({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm px-6 py-12 text-center">
      <p className="text-base font-bold text-slate-900">{title}</p>
      <p className="text-sm text-slate-500 mt-1.5">{hint}</p>
    </div>
  );
}
