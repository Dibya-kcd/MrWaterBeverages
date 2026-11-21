import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  CreditCard,
  Edit2,
  FileText,
  MessageCircle,
  Phone,
  Plus,
  Receipt,
  RotateCcw,
  Route,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  X,
  Languages,
  Loader2,
} from "lucide-react";
import { getInitials } from "../ui/HomeKit";
import { useLedger } from "../../context/LedgerContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { useAutoOdiaNameMap, nameFromMap } from "../../hooks/useAutoOdiaName";
import { useIsMobile } from "../../hooks/useIsMobile";
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
import { ConfirmModal, ToggleSwitch } from "../ui";
import { RecordPaymentModal } from "../common/RecordPaymentModal";
import { RecordRefundModal } from "../common/RecordRefundModal";
import { EditBillModal } from "../common/EditBillModal";
import { DeleteConfirmModal } from "../common/DeleteConfirmModal";
import { normCustName } from "../../context/ledgerHelpers";
import { realLast10Phone } from "../../utils/customerDedupe";
import { validatePhone } from "../../utils/validation";
import { formatBillNumber, isGstExcludedBill } from "../../utils/invoiceCommon";

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

function parseCustomerNotes(notes?: string) {
  const out = {
    contactPerson: "",
    pan: "",
    fssai: "",
    customerType: "Retail",
    priceList: "Retail",
    state: "21 · Odisha",
    creditDays: "0",
    visitOrder: "0",
  };
  if (!notes) return out;
  for (const part of notes.split("·").map((s) => s.trim())) {
    if (part.startsWith("Contact:")) out.contactPerson = part.slice("Contact:".length).trim();
    else if (part.startsWith("PAN:")) out.pan = part.slice("PAN:".length).trim();
    else if (part.startsWith("FSSAI:")) out.fssai = part.slice("FSSAI:".length).trim();
    else if (part.startsWith("Type:")) out.customerType = part.slice("Type:".length).trim() || "Retail";
    else if (part.startsWith("Price list:")) out.priceList = part.slice("Price list:".length).trim() || "Retail";
    else if (part.startsWith("State:")) out.state = part.slice("State:".length).trim() || "21 · Odisha";
    else if (part.startsWith("Credit days:")) out.creditDays = part.slice("Credit days:".length).trim() || "0";
    else if (part.startsWith("Visit order:")) out.visitOrder = part.slice("Visit order:".length).trim() || "0";
  }
  return out;
}

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
    splitMixedBill,
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
  const { language, t } = useLanguage();
  const isPhone = useIsMobile(767);
  const customerNameMap = useAutoOdiaNameMap(customers || []);

  const [partyTab, setPartyTab] = useState<PartyTab>("customers");
  const [searchTerm, setSearchTerm] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [phoneDetailTab, setPhoneDetailTab] = useState<"summary" | "ledger">("summary");
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "bill" | "payment" | "return">("all");
  const [expandedLedgerEntryId, setExpandedLedgerEntryId] = useState<string | null>(null);
  const [phoneFilterSheetOpen, setPhoneFilterSheetOpen] = useState(false);
  const [waPhonePrompt, setWaPhonePrompt] = useState<{ text: string; input: string } | null>(null);
  const [showMoreFormFields, setShowMoreFormFields] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingDerivedCustomer, setEditingDerivedCustomer] =
    useState<ExistingCustomer | null>(null);
  const [clashConfirm, setClashConfirm] = useState<{
    clash: Customer;
    commit: () => void;
  } | null>(null);
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
  const [beatMenuOpen, setBeatMenuOpen] = useState(false);
  const beatMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!beatMenuOpen) return;
    const onDocDown = (e: MouseEvent | TouchEvent) => {
      if (beatMenuRef.current && !beatMenuRef.current.contains(e.target as Node)) {
        setBeatMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("touchstart", onDocDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("touchstart", onDocDown);
    };
  }, [beatMenuOpen]);

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

  // beat id of each customer by master id (with unambiguous same-name fallback) and how many customers each beat has
  const { beatIdByCustomer, beatIdByName } = useMemo(() => {
    const byId = new Map<string, string>();
    const phonesByName = new Map<string, Set<string>>();
    const candidateByName = new Map<string, string>();
    for (const c of customers || []) {
      const bid = customerBeat(c)?.id || "";
      byId.set(c.id, bid);
      const k = normCustName(c.name);
      if (!k) continue;
      const p10 = realLast10Phone(c.phone);
      if (p10) {
        let s = phonesByName.get(k);
        if (!s) {
          s = new Set<string>();
          phonesByName.set(k, s);
        }
        s.add(p10);
      }
      if (bid && !candidateByName.has(k)) candidateByName.set(k, bid);
    }
    const byName = new Map<string, string>();
    for (const [k, bid] of candidateByName) {
      if ((phonesByName.get(k)?.size || 0) <= 1) byName.set(k, bid);
    }
    return { beatIdByCustomer: byId, beatIdByName: byName };
  }, [customers, customerBeat]);
  const beatIdForExisting = useCallback(
    (ec: ExistingCustomer): string =>
      (ec.id && beatIdByCustomer.get(ec.id)) ||
      beatIdByName.get(normCustName(ec.name)) ||
      "",
    [beatIdByCustomer, beatIdByName],
  );
  const beatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const ec of existingCustomers) {
      const b = beatIdForExisting(ec);
      if (b) counts.set(b, (counts.get(b) || 0) + 1);
      else none++;
    }
    return { counts, none };
  }, [existingCustomers, beatIdForExisting]);

  const filteredCustomers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let list = existingCustomers;
    if (beatFilter !== "all") {
      list = list.filter((c) => {
        const b = beatIdForExisting(c);
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
  }, [existingCustomers, searchTerm, customerFilter, beatFilter, beatIdForExisting]);

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

  const { customerTypeById, customerTypeByName, beatNameById } = useMemo(() => {
    const byId = new Map<string, string>();
    const byName = new Map<string, string>();
    const beatNames = new Map<string, string>();
    for (const b of beats) beatNames.set(b.id, b.name);
    for (const c of customers || []) {
      const tp = parseCustomerNotes(c.notes).customerType || "Retail";
      byId.set(c.id, tp);
      const k = normCustName(c.name);
      if (k && !byName.has(k)) byName.set(k, tp);
    }
    return { customerTypeById: byId, customerTypeByName: byName, beatNameById: beatNames };
  }, [customers, beats]);

  const oldestDueDaysByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    const now = Date.now();
    for (const b of bills || []) {
      if (b.status === "cancelled" || b.cancelled) continue;
      if (billBalance(b) <= 0.004) continue;
      const k = normCustName(b.retailer || "");
      if (!k || !b.date) continue;
      const dt = new Date(b.date.length === 10 ? `${b.date}T12:00:00` : b.date);
      if (isNaN(dt.getTime())) continue;
      const days = Math.max(0, Math.floor((now - dt.getTime()) / 86400000));
      const prev = map.get(k);
      if (prev === undefined || days > prev) map.set(k, days);
    }
    return map;
  }, [bills]);

  /* ─── Customer form handlers ─── */
  const openAddCustomer = () => {
    setEditingCustomer(null);
    setEditingDerivedCustomer(null);
    setClashConfirm(null);
    setCustomerForm(emptyCustomerForm());
    setFormError(null);
    setFormOpen(true);
  };

  const openEditCustomer = (ec: ExistingCustomer) => {
    const targetNorm = normCustName(ec.name);
    const exactById = ec.id ? customers.find((c) => c.id === ec.id) : undefined;
    const sameNameList = customers.filter((c) => normCustName(c.name) === targetNorm);
    const full =
      (exactById && customerBeat(exactById) ? exactById : undefined) ||
      sameNameList.find((c) => Boolean(customerBeat(c))) ||
      exactById ||
      sameNameList[0];
    const parsedNotes = parseCustomerNotes(full?.notes);
    setEditingCustomer(full || null);
    setEditingDerivedCustomer(full ? null : ec);
    setClashConfirm(null);
    setCustomerForm({
      name: full?.name || ec.name || "",
      nameOr: full?.nameOr || (ec as any).nameOr || "",
      contactPerson: parsedNotes.contactPerson,
      phone: full?.phone || ec.phone || "",
      customerType: parsedNotes.customerType,
      priceList: parsedNotes.priceList,
      gstRegistered: !!(full?.gstin || ec.gstin),
      state: parsedNotes.state,
      address: full?.address || ec.address || "",
      pan: parsedNotes.pan,
      fssai: parsedNotes.fssai,
      beat: customerBeat(full)?.name || full?.route || full?.city || ec.city || "",
      visitOrder: parsedNotes.visitOrder,
      creditLimit: String(full?.creditLimit ?? ec.creditLimit ?? 0),
      creditDays: parsedNotes.creditDays,
      openingBalance: String(full?.openingBalance ?? ec.openingBalance ?? 0),
      gstin: full?.gstin || ec.gstin || "",
    });
    setFormError(null);
    setFormOpen(true);
  };

  const saveCustomer = () => {
    const name = customerForm.name.trim();
    if (!name) {
      setFormError("Shop / business name is required");
      return;
    }
    const phoneErr = customerForm.phone.trim()
      ? validatePhone(customerForm.phone, { label: "Phone" })
      : null;
    if (phoneErr) {
      setFormError(phoneErr);
      return;
    }
    const beatMatch =
      activeBeats.find((b) => b.name === customerForm.beat.trim()) ||
      beats.find((b) => b.name === customerForm.beat.trim());
    const payload = {
      name,
      nameOr: customerForm.nameOr.trim() || undefined,
      phone: customerForm.phone.trim(),
      address: customerForm.address.trim() || undefined,
      city: customerForm.beat.trim() || undefined,
      route: customerForm.beat.trim() || undefined,
      // linked by id so renaming the beat never loses this customer
      beatId: beatMatch?.id,
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

    const syncSelectedDetail = (saved: Customer) => {
      setSelectedCustomer((prev) =>
        prev
          ? {
              ...prev,
              id: saved.id,
              name: saved.name,
              nameOr: saved.nameOr,
              phone: saved.phone,
              address: saved.address,
              city: saved.city,
              gstin: saved.gstin,
              creditLimit: saved.creditLimit,
              openingBalance: saved.openingBalance,
            }
          : null,
      );
    };

    if (editingCustomer) {
      const commit = () => {
        const saved = updateCustomer({
          ...editingCustomer,
          ...payload,
          updatedAt: new Date().toISOString(),
        });
        syncSelectedDetail(saved);
        setClashConfirm(null);
        setFormOpen(false);
        setEditingCustomer(null);
        setEditingDerivedCustomer(null);
      };
      const clash = customerNameClash(editingCustomer.id, name, {
        oldName: editingCustomer.name,
        phone: payload.phone,
      });
      if (clash) {
        setClashConfirm({ clash, commit });
        return;
      }
      commit();
      return;
    }

    if (editingDerivedCustomer) {
      const derivedId =
        editingDerivedCustomer.id ||
        `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const commit = () => {
        const saved = updateCustomer(
          {
            id: derivedId,
            ...payload,
            altPhone: editingDerivedCustomer.altPhone,
            createdAt:
              editingDerivedCustomer.lastBillDate || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          true,
          {
            name: editingDerivedCustomer.name,
            phone: editingDerivedCustomer.phone,
          },
        );
        syncSelectedDetail(saved);
        setClashConfirm(null);
        setFormOpen(false);
        setEditingCustomer(null);
        setEditingDerivedCustomer(null);
      };
      const clash = customerNameClash(derivedId, name, {
        oldName: editingDerivedCustomer.name,
        phone: payload.phone,
      });
      if (clash) {
        setClashConfirm({ clash, commit });
        return;
      }
      commit();
      return;
    }

    addCustomer(payload);
    setFormOpen(false);
    setEditingCustomer(null);
    setEditingDerivedCustomer(null);
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
    const phoneErr = supplierForm.phone.trim()
      ? validatePhone(supplierForm.phone, { label: "Supplier phone" })
      : null;
    if (phoneErr) {
      setFormError(phoneErr);
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

    const formatPhoneLedgerDate = (dateStr: string) => {
      if (!dateStr) return "—";
      const d = new Date(
        dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr,
      );
      if (isNaN(d.getTime())) return dateStr;
      const nowY = new Date().getFullYear();
      if (d.getFullYear() === nowY) {
        return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      }
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
    };

    // WhatsApp Statement text builder
    const statementWaText = (() => {
      const orgName = orgProfile?.name || "MrWater Distribution";
      const lines = [
        `*Customer Ledger Statement - ${nameFromMap(customerNameMap, c, language)}*`,
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
      return lines.join("\n");
    })();

    const statementWaUrl = (() => {
      const cleanPhone = (c.phone || "").replace(/\D/g, "");
      const destPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      if (!destPhone) return null;
      return `https://wa.me/${destPhone}?text=${encodeURIComponent(statementWaText)}`;
    })();

    const customerTypeLabel =
      (c.id && customerTypeById.get(c.id)) ||
      customerTypeByName.get(normCustName(c.name)) ||
      "Retail";
    const creditSummary = getCustomerCreditSummary(c.name);
    const hasAdvanceScreen =
      rawBalance < -0.004 ||
      (creditSummary.refundable > 0.004 && balanceDue <= 0.004);
    const creditLimitPct =
      creditLimit > 0
        ? Math.min(100, Math.max(0, Math.round((balanceDue / creditLimit) * 100)))
        : 0;
    const filteredLedgerEntries = entriesWithBalance.filter((e) => {
      if (ledgerFilter === "all") return true;
      return e.kind === ledgerFilter;
    });
    const phoneLedgerEntries = [...filteredLedgerEntries].reverse();

    return (
      <div id="view-customers" className="hh-view w-full min-w-0 pb-24">
        {isPhone ? (
          <>
            <div className="hh-sales-top">
              <div className="hh-sales-top__row">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (phoneDetailTab === "ledger") {
                        setPhoneDetailTab("summary");
                        setExpandedLedgerEntryId(null);
                        return;
                      }
                      setSelectedCustomer(null);
                      setPhoneDetailTab("summary");
                      setExpandedLedgerEntryId(null);
                      setShowRecordPayment(false);
                      setPaymentToEdit(null);
                      setPaymentToDelete(null);
                      setBillToEdit(null);
                      setBillToDelete(null);
                    }}
                    className="hh-sales-top__iconbtn"
                    aria-label={t("common.back")}
                  >
                    <ChevronLeft className="w-6 h-6" strokeWidth={2.2} />
                  </button>
                  <h1 className="hh-sales-top__title break-words min-w-0">
                    {nameFromMap(customerNameMap, c, language)}
                  </h1>
                </div>
                <span className="hh-sales-top__pill shrink-0">
                  {phoneDetailTab === "ledger"
                    ? t("parties.ledger")
                    : hasAdvanceScreen
                      ? t("parties.credit")
                      : customerTypeLabel}
                </span>
              </div>
            </div>

            {phoneDetailTab === "ledger" ? (
              <div className="space-y-3 mt-1">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  {([
                    { id: "all", label: t("common.all") },
                    { id: "bill", label: t("parties.bills") },
                    { id: "payment", label: t("parties.payments") },
                    { id: "return", label: t("parties.returns") },
                  ] as const).map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      aria-pressed={ledgerFilter === chip.id}
                      onClick={() => setLedgerFilter(chip.id)}
                      className="rt-chip shrink-0"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {phoneLedgerEntries.length === 0 ? (
                  <div className="rt-card px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-2)" }}>
                    {t("parties.noLedgerItems")}
                  </div>
                ) : (
                  <div className="hh-timeline pt-1">
                    {phoneLedgerEntries.map((entry) => {
                      if (entry.kind === "opening") {
                        return (
                          <div key={entry.id} className="hh-timeline__item">
                            <span className="hh-timeline__dot" />
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="text-[13.5px] font-bold" style={{ color: "var(--text)" }}>
                                  {t("parties.openingBalance")}
                                </div>
                                <div className="text-[11.5px] mt-0.5" style={{ color: "var(--text-2)" }}>
                                  {formatPhoneLedgerDate(entry.date)}
                                </div>
                              </div>
                              <div
                                className="text-[13.5px] font-extrabold tabular-nums shrink-0"
                                style={{ color: entry.amount > 0 ? "var(--due)" : "var(--paid)" }}
                              >
                                {entry.amount > 0 ? "+" : "−"}₹{money(Math.abs(entry.amount))}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (entry.kind === "return") {
                        const ret = entry.salesReturn;
                        return (
                          <div key={entry.id} className="hh-timeline__item">
                            <span className="hh-timeline__dot" />
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="text-[13.5px] font-bold break-words" style={{ color: "var(--text)" }}>
                                  {t("parties.salesReturn")}
                                </div>
                                <div className="text-[11.5px] mt-0.5" style={{ color: "var(--text-2)" }}>
                                  {formatPhoneLedgerDate(entry.date)}
                                  {ret.creditNoteNo ? ` · CN-${ret.creditNoteNo}` : ""}
                                </div>
                              </div>
                              <div className="text-[13.5px] font-extrabold tabular-nums shrink-0" style={{ color: "var(--paid)" }}>
                                −₹{money(entry.amount)}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (entry.kind === "bill") {
                        const b = entry.bill;
                        const invNo = formatBillNumber(b, billingSettings);
                        const qtyCases = (b.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
                        const isExpanded = expandedLedgerEntryId === entry.id;
                        return (
                          <div key={entry.id} className="hh-timeline__item">
                            <span className="hh-timeline__dot" />
                            <button
                              type="button"
                              onClick={() => setExpandedLedgerEntryId(isExpanded ? null : entry.id)}
                              className="w-full text-left flex items-start justify-between gap-2 bg-transparent border-0 p-0 cursor-pointer"
                              style={{ minHeight: "36px" }}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-[13.5px] font-bold break-words" style={{ color: "var(--text)" }}>
                                  {t("parties.billPrefix")} {invNo}
                                </span>
                                <span className="block text-[11.5px] mt-0.5" style={{ color: "var(--text-2)" }}>
                                  {formatPhoneLedgerDate(entry.date)} · {t("trips.casesCount", { n: qtyCases })}
                                </span>
                              </span>
                              <span className="text-[13.5px] font-extrabold tabular-nums shrink-0" style={{ color: "var(--due)" }}>
                                +₹{money(entry.amount)}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="flex items-center gap-3 mt-1.5 pb-1">
                                <button
                                  type="button"
                                  onClick={() => setBillToEdit(b)}
                                  className="text-[11.5px] font-bold bg-transparent border-0 p-0 cursor-pointer"
                                  style={{ color: "var(--primary)", minHeight: "28px" }}
                                >
                                  {t("common.edit")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setBillToDelete(b)}
                                  className="text-[11.5px] font-bold bg-transparent border-0 p-0 cursor-pointer"
                                  style={{ color: "var(--due)", minHeight: "28px" }}
                                >
                                  {t("common.delete")}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      }

                      const p = entry.payment;
                      const isExpanded = expandedLedgerEntryId === entry.id;
                      const modeText =
                        String(p.mode || "cash").toLowerCase() === "upi"
                          ? "UPI"
                          : String(p.mode || "cash").toLowerCase() === "bank"
                            ? "Bank"
                            : String(p.mode || "cash").toLowerCase() === "cheque"
                              ? "Cheque"
                              : String(p.mode || "cash").toLowerCase() === "other"
                                ? "Other"
                                : "Cash";
                      return (
                        <div key={entry.id} className="hh-timeline__item">
                          <span className={`hh-timeline__dot ${entry.amount < 0 ? "hh-timeline__dot--due" : "hh-timeline__dot--paid"}`} />
                          <button
                            type="button"
                            onClick={() => !entry.isLegacy && setExpandedLedgerEntryId(isExpanded ? null : entry.id)}
                            className="w-full text-left flex items-start justify-between gap-2 bg-transparent border-0 p-0 cursor-pointer"
                            style={{ minHeight: "36px" }}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13.5px] font-bold break-words" style={{ color: "var(--text)" }}>
                                {p.isRefund ? t("pay.refundTag") : t("parties.paymentPrefix")} · {modeText}
                              </span>
                              <span className="block text-[11.5px] mt-0.5" style={{ color: "var(--text-2)" }}>
                                {formatPhoneLedgerDate(entry.date)}
                                {p.referenceNote ? ` · ${p.referenceNote}` : p.billId ? ` · INV-${p.billId}` : ` · RCT-${String(p.id).slice(-4).toUpperCase()}`}
                              </span>
                            </span>
                            <span
                              className="text-[13.5px] font-extrabold tabular-nums shrink-0"
                              style={{ color: entry.amount < 0 ? "var(--due)" : "var(--paid)" }}
                            >
                              {entry.amount < 0 ? "+" : "−"}₹{money(Math.abs(entry.amount))}
                            </span>
                          </button>
                          {!entry.isLegacy && isExpanded && (
                            <div className="flex items-center gap-3 mt-1.5 pb-1">
                              {!p.isRefund && (
                                <button
                                  type="button"
                                  onClick={() => setPaymentToEdit(p)}
                                  className="text-[11.5px] font-bold bg-transparent border-0 p-0 cursor-pointer"
                                  style={{ color: "var(--primary)", minHeight: "28px" }}
                                >
                                  {t("common.edit")}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setPaymentToDelete(p)}
                                className="text-[11.5px] font-bold bg-transparent border-0 p-0 cursor-pointer"
                                style={{ color: "var(--due)", minHeight: "28px" }}
                              >
                                {t("common.delete")}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : hasAdvanceScreen ? (
              <div className="space-y-3 mt-1">
                <div className="hh-hist-card hh-hist-card--paid space-y-1.5">
                  <div className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>
                    {t("parties.netCreditOwed")}
                  </div>
                  <div className="text-[30px] font-extrabold tracking-tight tabular-nums leading-none" style={{ color: "var(--paid)" }}>
                    ₹{money(Math.abs(rawBalance) || creditSummary.refundable)}
                  </div>
                  <div className="text-[12px] pt-1" style={{ color: "var(--text-2)" }}>
                    {t("parties.advanceOnAccount", {
                      amt: `₹${money(creditSummary.advance || Math.abs(rawBalance))}`,
                    })}
                  </div>
                </div>

                <div className="rt-noti">
                  <span>{t("parties.advanceNotice")}</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => startBillForCustomer(c.name, c.phone)}
                    className="rt-btn"
                  >
                    {t("parties.newSale")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRefund(true)}
                    disabled={creditSummary.refundable <= 0.004}
                    className="rt-btn-outline rt-btn-outline--primary"
                  >
                    {t("parties.refundAmt", {
                      amt: `₹${money(creditSummary.refundable || Math.abs(rawBalance))}`,
                    })}
                  </button>
                </div>

                {creditSummary.canApply && (
                  <button
                    type="button"
                    onClick={() => applyAdvanceToInvoices(c.name)}
                    className="rt-btn-outline w-full"
                  >
                    {t("parties.applyToUnpaid")}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setPhoneDetailTab("ledger")}
                  className="rt-btn-outline w-full"
                >
                  {t("parties.customerLedger")}
                </button>

                {statementWaUrl ? (
                  <a
                    href={statementWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rt-btn-outline w-full flex items-center justify-center gap-2 no-underline"
                    style={{ borderColor: "var(--paid)", color: "var(--paid)" }}
                  >
                    <MessageCircle size={16} />
                    {t("parties.whatsappReminder")}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setWaPhonePrompt({ text: statementWaText, input: "" })}
                    className="rt-btn-outline w-full flex items-center justify-center gap-2"
                    style={{ borderColor: "var(--paid)", color: "var(--paid)" }}
                  >
                    <MessageCircle size={16} />
                    {t("parties.whatsappReminder")}
                  </button>
                )}

                <div className="flex items-center justify-center gap-5 pt-1">
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex items-center gap-1.5 text-[13px] font-bold no-underline"
                      style={{ color: "var(--primary)", minHeight: "44px" }}
                    >
                      <Phone size={14} /> {c.phone}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditCustomer(c)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-bold bg-transparent border-0 cursor-pointer"
                    style={{ color: "var(--primary)", minHeight: "44px" }}
                  >
                    <Edit2 size={14} /> {t("common.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerToDelete(c)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-bold bg-transparent border-0 cursor-pointer"
                    style={{ color: "var(--due)", minHeight: "44px" }}
                  >
                    <Trash2 size={14} /> {t("common.delete")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 mt-1">
                <div className="rt-kv-grid">
                  <div className="rt-kv">
                    <div className="rt-kv__label">{t("parties.totalBilled")}</div>
                    <div className="rt-kv__val">₹{money(ledger.totalBilled)}</div>
                  </div>
                  <div className="rt-kv">
                    <div className="rt-kv__label">{t("parties.totalPaid")}</div>
                    <div className="rt-kv__val" style={{ color: "var(--paid)" }}>₹{money(ledger.totalPaid)}</div>
                  </div>
                  <div className="rt-kv">
                    <div className="rt-kv__label">{t("parties.openingBal")}</div>
                    <div className="rt-kv__val">₹{money(openingBal)}</div>
                  </div>
                  <div className="rt-kv">
                    <div className="rt-kv__label">{t("parties.salesReturns")}</div>
                    <div className="rt-kv__val">₹{money(ledger.totalReturns || 0)}</div>
                  </div>
                </div>

                <div className="rt-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>
                        {t("parties.balanceDue")}
                      </div>
                      <div
                        className="text-[28px] font-extrabold tracking-tight tabular-nums leading-tight mt-0.5"
                        style={{ color: balanceDue > 0.004 ? "var(--due)" : "var(--paid)" }}
                      >
                        ₹{money(balanceDue)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>
                        {t("parties.creditLimit")}
                      </div>
                      <div className="text-[15px] font-extrabold tabular-nums mt-0.5" style={{ color: "var(--text)" }}>
                        {creditLimit > 0 ? `₹${money(creditLimit)}` : "—"}
                      </div>
                      {creditLimit > 0 && (
                        <div className="rt-meter mt-2 ml-auto w-24" aria-hidden="true">
                          <div
                            className="rt-meter__fill"
                            style={{
                              width: `${creditLimitPct}%`,
                              background: isOverLimit ? "var(--due)" : "var(--primary)",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {(creditSummary.canApply || creditSummary.advance > 0.004) && (
                  <div className="rt-noti flex-col items-stretch gap-2">
                    <span>
                      {t("parties.advanceOnAccount", {
                        amt: `₹${money(creditSummary.advance)}`,
                      })}
                    </span>
                    <div className="flex gap-2">
                      {creditSummary.canApply && (
                        <button
                          type="button"
                          onClick={() => applyAdvanceToInvoices(c.name)}
                          className="rt-btn flex-1"
                          style={{ minHeight: "38px", fontSize: "12px" }}
                        >
                          {t("parties.applyToUnpaid")}
                        </button>
                      )}
                      {creditSummary.refundable > 0.004 && (
                        <button
                          type="button"
                          onClick={() => setShowRefund(true)}
                          className="rt-btn-outline flex-1"
                          style={{ minHeight: "38px", fontSize: "12px" }}
                        >
                          {t("parties.refundAmt", { amt: `₹${money(creditSummary.refundable)}` })}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowRecordPayment(true)}
                    className="rt-btn"
                  >
                    {t("parties.recordPayment")}
                  </button>
                  <button
                    type="button"
                    onClick={() => startBillForCustomer(c.name, c.phone)}
                    className="rt-btn-outline rt-btn-outline--primary"
                  >
                    {t("parties.newSale")}
                  </button>
                </div>

                {statementWaUrl ? (
                  <a
                    href={statementWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rt-btn-outline w-full flex items-center justify-center gap-2 no-underline"
                    style={{ borderColor: "var(--paid)", color: "var(--paid)" }}
                  >
                    {t("parties.whatsappReminder")}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setWaPhonePrompt({ text: statementWaText, input: "" })}
                    className="rt-btn-outline w-full flex items-center justify-center gap-2"
                    style={{ borderColor: "var(--paid)", color: "var(--paid)" }}
                  >
                    {t("parties.whatsappReminder")}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setPhoneDetailTab("ledger")}
                  className="rt-btn-outline w-full"
                >
                  {t("parties.customerLedger")}
                </button>

                <div className="flex items-center justify-center gap-5 pt-1">
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex items-center gap-1.5 text-[13px] font-bold no-underline"
                      style={{ color: "var(--primary)", minHeight: "44px" }}
                    >
                      <Phone size={14} /> {c.phone}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditCustomer(c)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-bold bg-transparent border-0 cursor-pointer"
                    style={{ color: "var(--primary)", minHeight: "44px" }}
                  >
                    <Edit2 size={14} /> {t("common.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerToDelete(c)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-bold bg-transparent border-0 cursor-pointer"
                    style={{ color: "var(--due)", minHeight: "44px" }}
                  >
                    <Trash2 size={14} /> {t("common.delete")}
                  </button>
                </div>
              </div>
            )}

            {waPhonePrompt &&
              createPortal(
                <div
                  className="rt-bsheet-scrim"
                  onClick={() => setWaPhonePrompt(null)}
                  role="dialog"
                  aria-modal="true"
                >
                  <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                    <div className="hh-grab" />
                    <div className="text-[16px] font-extrabold" style={{ color: "var(--text)" }}>
                      {t("parties.whatsappReminder")}
                    </div>
                    <label className="rt-in">
                      <span className="rt-in__label uppercase">{t("parties.phoneLabel")}</span>
                      <input
                        className="rt-in__control"
                        type="tel"
                        inputMode="tel"
                        placeholder="98765 43210"
                        value={waPhonePrompt.input}
                        onChange={(e) => setWaPhonePrompt((prev) => (prev ? { ...prev, input: e.target.value } : null))}
                        autoFocus
                      />
                    </label>
                    <button
                      type="button"
                      disabled={waPhonePrompt.input.replace(/\D/g, "").length < 10}
                      onClick={() => {
                        const digits = waPhonePrompt.input.replace(/\D/g, "");
                        const dest = digits.length === 10 ? `91${digits}` : digits;
                        const url = `https://wa.me/${dest}?text=${encodeURIComponent(waPhonePrompt.text)}`;
                        window.location.assign(url);
                        setWaPhonePrompt(null);
                      }}
                      className="rt-btn rt-btn--wa w-full"
                    >
                      <MessageCircle size={16} /> {t("parties.whatsappReminder")}
                    </button>
                  </div>
                </div>,
                document.body,
              )}
          </>
        ) : (
          <>
        {/* Sticky header — works on mobile & desktop */}
        <div className="sticky top-0 z-20 bg-[var(--bg)]/95 backdrop-blur border-b border-black/5 px-0 py-3 flex items-center gap-2 sm:gap-3 w-full">
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
            <h1 className="text-base sm:text-lg font-bold text-slate-900 min-w-0 break-words lg:truncate">
              {nameFromMap(customerNameMap, c, language)}
            </h1>
            <p className="text-xs text-slate-500 min-w-0 break-words lg:truncate">
              {c.phone || "No phone"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditCustomer(c)}
            className="text-sm font-semibold text-[var(--primary)] px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-[var(--primary)]/10 cursor-pointer shrink-0"
          >
            Edit
          </button>
        </div>

        <div className="hh-detail-cols px-0 py-4 space-y-3 w-full">
          {/* Summary card */}
          <div
            data-card-tone={
              rawBalance < 0 ? "received" : balanceDue > 0 ? "due" : "sales"
            }
            className="rounded-2xl border shadow-sm p-4 space-y-3 transition-colors"
          >
            <div className="flex flex-wrap justify-between items-baseline gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    rawBalance < 0
                      ? "text-emerald-800"
                      : balanceDue > 0
                        ? "text-rose-800"
                        : "text-slate-600"
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
                  className={`text-xl sm:text-2xl font-black tabular-nums ${
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded-xl bg-white/75 border border-black/5 px-2.5 py-2">
                <div className="text-[11px] text-slate-500">Total billed</div>
                <div className="font-bold text-slate-900 tabular-nums">
                  ₹{money(ledger.totalBilled)}
                </div>
              </div>
              {(ledger.totalReturns || 0) > 0 && (
                <div className="rounded-xl bg-white/75 border border-black/5 px-2.5 py-2">
                  <div className="text-[11px] text-slate-500">Sales returns</div>
                  <div className="font-bold text-blue-700 tabular-nums">
                    -₹{money(ledger.totalReturns)}
                  </div>
                </div>
              )}
              {openingBal !== 0 && (
                <div className="rounded-xl bg-white/75 border border-black/5 px-2.5 py-2">
                  <div className="text-[11px] text-slate-500">Opening bal.</div>
                  <div className="font-bold text-slate-900 tabular-nums">
                    ₹{money(openingBal)}
                  </div>
                </div>
              )}
              <div className="rounded-xl bg-white/75 border border-black/5 px-2.5 py-2">
                <div className="text-[11px] text-slate-500">Total paid</div>
                <div className="font-bold text-emerald-700 tabular-nums">
                  ₹{money(ledger.totalPaid)}
                </div>
              </div>
              <div className="rounded-xl bg-white/75 border border-black/5 px-2.5 py-2">
                <div className="text-[11px] text-slate-500">Credit limit</div>
                <div className="font-bold text-slate-900 tabular-nums">
                  {creditLimit > 0 ? `₹${money(creditLimit)}` : "No limit"}
                </div>
              </div>
            </div>
          </div>

          {/* Address */}
          {(c.address || c.city || c.gstin) && (
            <div
              data-card-tone="neutral"
              className="rounded-2xl border shadow-sm p-4 space-y-1.5 text-sm"
            >
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
              className="flex-1 py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm cursor-pointer active:scale-[0.99] flex items-center justify-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              New bill
            </button>
            <button
              type="button"
              onClick={() => setShowRecordPayment(true)}
              className="flex-1 py-3 rounded-xl bg-white border border-[var(--primary)]/30 text-[var(--primary)] font-semibold text-sm cursor-pointer active:scale-[0.99] flex items-center justify-center gap-1.5"
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
                <Receipt className="w-4 h-4 text-[var(--primary)]" />
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
                        <div className="mt-0.5 hh-icon-badge hh-icon-badge--sm hh-icon-badge--slate">
                          <Building2 className="w-4 h-4" />
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
                        <div className="mt-0.5 hh-icon-badge hh-icon-badge--sm hh-icon-badge--blue">
                          <RotateCcw className="w-4 h-4" />
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
                              {isGstExcludedBill(entry.bill, products) ? "Memo" : "Invoice"} #{formatBillNumber(entry.bill, billingSettings)}
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
                    const invNo = formatBillNumber(b, billingSettings);
                    const isNg = isGstExcludedBill(b, products);
                    return (
                      <li
                        key={entry.id}
                        className="px-3 sm:px-4 py-3 flex gap-3 items-start group"
                      >
                        <div className="mt-0.5 hh-icon-badge hh-icon-badge--sm hh-icon-badge--amber">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5">
                              <span>{isNg ? "Cash Memo" : "Bill"} {invNo}</span>
                              {isNg && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 uppercase">
                                  Non-GST
                                </span>
                              )}
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
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] px-2 py-1 rounded-lg hover:bg-[var(--primary)]/10 cursor-pointer"
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
                      <div className="mt-0.5 hh-icon-badge hh-icon-badge--sm hh-icon-badge--green">
                        <CreditCard className="w-4 h-4" />
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
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] px-2 py-1 rounded-lg hover:bg-[var(--primary)]/10 cursor-pointer"
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
          </>
        )}

        {/* Delete customer */}
        {customerToDelete && (
          <ConfirmModal
            isOpen
            title="Delete customer?"
            message={`Remove ${customerToDelete.name} from the directory? Past bills are kept.`}
            confirmButtonLabel="Delete"
            variant="danger"
            rectificationPrompt="Rectification comment (saved with the delete)"
            optionalCheckboxLabel="Also remove payments linked directly to this customer (recommended for duplicate customers)"
            onConfirmWithOptions={({ comment, optionalChecked }) => {
              if (customerToDelete.id) {
                deleteCustomer(customerToDelete.id, comment || undefined, {
                  removePayments: optionalChecked,
                });
              }
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
            customerName={nameFromMap(customerNameMap, c, language)}
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
            initialCustomerName={nameFromMap(customerNameMap, c, language)}
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
            onSplitMixedBill={(draft, o) => splitMixedBill(draft, o)}
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
      <div id="view-customers" className="hh-view min-h-[100dvh] bg-[var(--bg)] pb-24">
        {isPhone ? (
          <>
            <div className="hh-sales-top">
              <div className="hh-sales-top__row">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setSelectedSupplier(null)}
                    className="hh-sales-top__iconbtn"
                    aria-label={t("common.back")}
                  >
                    <ChevronLeft className="w-6 h-6" strokeWidth={2.2} />
                  </button>
                  <h1 className="hh-sales-top__title break-words min-w-0">{s.name}</h1>
                </div>
                <button
                  type="button"
                  onClick={() => openEditSupplier(s)}
                  className="hh-sales-top__iconbtn shrink-0"
                  aria-label={t("common.edit")}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3 mt-1">
              <div className="rt-card space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>
                    Inward GRNs
                  </span>
                  <span className="text-[22px] font-extrabold tabular-nums" style={{ color: "var(--text)" }}>
                    {grnN}
                  </span>
                </div>
                {s.contactPerson && (
                  <p className="text-[13px] m-0" style={{ color: "var(--text)" }}>Contact: {s.contactPerson}</p>
                )}
                {s.phone && (
                  <p className="text-[13px] m-0" style={{ color: "var(--text-2)" }}>{s.phone}</p>
                )}
                {s.gstin && (
                  <p className="font-mono text-[12px] m-0" style={{ color: "var(--text-2)" }}>GSTIN {s.gstin}</p>
                )}
                {s.pan && (
                  <p className="font-mono text-[12px] m-0" style={{ color: "var(--text-2)" }}>PAN {s.pan}</p>
                )}
              </div>

              {(s.address || s.city || s.state) && (
                <div className="rt-card space-y-1 text-[13px]">
                  {s.address && <p className="m-0" style={{ color: "var(--text)" }}>{s.address}</p>}
                  {(s.city || s.state) && (
                    <p className="m-0" style={{ color: "var(--text-2)" }}>
                      {[s.city, s.state].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              )}

              {s.notes && (
                <div className="rt-card text-[13px]" style={{ color: "var(--text-2)" }}>
                  {s.notes}
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                {s.phone && (
                  <a href={`tel:${s.phone}`} className="rt-btn flex-1 no-underline">
                    <Phone size={16} /> Call
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSupplierToDelete(s)}
                  className="rt-btn-outline rt-btn-outline--due flex-1"
                >
                  <Trash2 size={16} /> {t("common.delete")}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
        <div className="sticky top-0 z-20 bg-[var(--bg)]/95 backdrop-blur border-b border-black/5 px-0 py-3 flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={() => setSelectedSupplier(null)}
            className="p-2 -ml-1 rounded-full hover:bg-black/5 cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-800" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900 min-w-0 break-words lg:truncate">{s.name}</h1>
            <p className="text-xs text-slate-500 min-w-0 break-words lg:truncate">
              {s.phone || s.email || "No contact"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditSupplier(s)}
            className="text-sm font-semibold text-[var(--primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--primary)]/10 cursor-pointer"
          >
            Edit
          </button>
        </div>

        <div className="hh-detail-cols px-0 py-4 space-y-3 w-full">
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
                className="flex-1 py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm flex items-center justify-center gap-1.5"
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
          </>
        )}

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
    const closePartyForm = () => {
      setFormOpen(false);
      setEditingCustomer(null);
      setEditingDerivedCustomer(null);
      setEditingSupplier(null);
      setClashConfirm(null);
      setShowMoreFormFields(false);
    };

    if (isPhone) {
      return (
        <div className="rt-flow-phone">
          <div className="hh-sales-top">
            <div className="hh-sales-top__row">
              <div className="flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  onClick={closePartyForm}
                  className="hh-sales-top__iconbtn"
                  aria-label={t("common.back")}
                >
                  <ChevronLeft className="w-6 h-6" strokeWidth={2.2} />
                </button>
                <h1 className="hh-sales-top__title">
                  {isSupplier
                    ? editingSupplier
                      ? "Edit supplier"
                      : "New supplier"
                    : editingCustomer || editingDerivedCustomer
                      ? t("parties.editCustomer")
                      : t("parties.newCustomer")}
                </h1>
              </div>
            </div>
          </div>

          <div className="rt-flow-phone__body space-y-2.5">
            {formError && (
              <div className="hh-hist-card hh-hist-card--due text-[12.5px] font-semibold" style={{ color: "var(--due)" }}>
                {formError}
              </div>
            )}

            {isSupplier ? (
              <>
                <label className="rt-in">
                  <span className="rt-in__label uppercase">Company / Supplier name *</span>
                  <input
                    className="rt-in__control"
                    value={supplierForm.name}
                    onChange={(e) => setSField("name", e.target.value)}
                    autoFocus
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">{t("parties.phoneLabel")}</span>
                    <input
                      className="rt-in__control"
                      type="tel"
                      inputMode="tel"
                      placeholder="10-digit phone"
                      value={supplierForm.phone}
                      onChange={(e) => setSField("phone", e.target.value)}
                    />
                  </label>
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">{t("parties.gstinLabel")}</span>
                    <input
                      autoCapitalize="characters"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="rt-in__control uppercase"
                      value={supplierForm.gstin}
                      onChange={(e) => {
                        const v = e.target.value.toUpperCase();
                        setSField("gstin", v);
                        setSField("gstRegistered", Boolean(v.trim()));
                      }}
                      placeholder="22AAAAA0000A1Z5"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">Contact person</span>
                    <input
                      className="rt-in__control"
                      value={supplierForm.contactPerson}
                      onChange={(e) => setSField("contactPerson", e.target.value)}
                    />
                  </label>
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">City</span>
                    <input
                      className="rt-in__control"
                      value={supplierForm.city}
                      onChange={(e) => setSField("city", e.target.value)}
                    />
                  </label>
                </div>
                <label className="rt-in">
                  <span className="rt-in__label uppercase">{t("parties.addressLabel")}</span>
                  <input
                    className="rt-in__control"
                    value={supplierForm.address}
                    onChange={(e) => setSField("address", e.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">Email</span>
                    <input
                      className="rt-in__control"
                      type="email"
                      value={supplierForm.email}
                      onChange={(e) => setSField("email", e.target.value)}
                    />
                  </label>
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">PAN</span>
                    <input
                      className="rt-in__control uppercase"
                      value={supplierForm.pan}
                      onChange={(e) => setSField("pan", e.target.value.toUpperCase())}
                    />
                  </label>
                </div>
                <label className="rt-in">
                  <span className="rt-in__label uppercase">Notes</span>
                  <input
                    className="rt-in__control"
                    value={supplierForm.notes}
                    onChange={(e) => setSField("notes", e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="rt-in">
                  <span className="rt-in__label uppercase">{t("parties.shopPartyName")}</span>
                  <input
                    className="rt-in__control"
                    value={customerForm.name}
                    onChange={(e) => setCField("name", e.target.value)}
                    autoFocus
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">{t("parties.phoneLabel")}</span>
                    <input
                      className="rt-in__control"
                      type="tel"
                      inputMode="tel"
                      placeholder="98765 43210"
                      value={customerForm.phone}
                      onChange={(e) => setCField("phone", e.target.value)}
                    />
                  </label>
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">{t("parties.gstinLabel")}</span>
                    <input
                      autoCapitalize="characters"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="rt-in__control uppercase"
                      value={customerForm.gstin}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setCField("gstin", val);
                        if (val.trim()) setCField("gstRegistered", true);
                      }}
                      placeholder="22AAAAA0000A1Z5"
                    />
                  </label>
                </div>

                <div>
                  <div className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>
                    {t("parties.customerType")}
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {["Retail", "Wholesale", "Distributor", "Institution", "Special"].map((tp) => (
                      <button
                        key={tp}
                        type="button"
                        aria-pressed={customerForm.customerType === tp}
                        onClick={() => setCField("customerType", tp)}
                        className="rt-chip shrink-0"
                      >
                        {tp}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="rt-in">
                  <span className="rt-in__label uppercase">{t("parties.routeBeatLabel")}</span>
                  <div className="rt-in__select-wrap">
                    <select
                      className="rt-in__control"
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
                    <ChevronDown size={15} className="rt-in__select-chev" />
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">{t("parties.creditLimitLabel")}</span>
                    <input
                      className="rt-in__control tabular-nums"
                      inputMode="decimal"
                      value={customerForm.creditLimit}
                      onChange={(e) => setCField("creditLimit", e.target.value)}
                    />
                  </label>
                  <label className="rt-in">
                    <span className="rt-in__label uppercase">{t("parties.openingBalanceLabel")}</span>
                    <input
                      className="rt-in__control tabular-nums"
                      inputMode="decimal"
                      value={customerForm.openingBalance}
                      onChange={(e) => setCField("openingBalance", e.target.value)}
                    />
                  </label>
                </div>

                <label className="rt-in">
                  <span className="rt-in__label uppercase">{t("parties.addressLabel")}</span>
                  <input
                    className="rt-in__control"
                    placeholder={t("parties.addressPlaceholder")}
                    value={customerForm.address}
                    onChange={(e) => setCField("address", e.target.value)}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setShowMoreFormFields((v) => !v)}
                  className="rt-card w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                  style={{ minHeight: "44px" }}
                >
                  <span className="text-[12.5px] font-bold" style={{ color: "var(--primary)" }}>
                    {t("parties.moreDetails")}
                  </span>
                  <ChevronDown
                    size={16}
                    style={{
                      color: "var(--primary)",
                      transform: showMoreFormFields ? "rotate(180deg)" : "none",
                      transition: "transform 0.15s",
                    }}
                  />
                </button>

                {showMoreFormFields && (
                  <div className="space-y-2.5">
                    <label className="rt-in">
                      <span className="rt-in__label uppercase">Name in Odia (ଓଡ଼ିଆ)</span>
                      <input
                        className="rt-in__control"
                        value={customerForm.nameOr || ""}
                        onChange={(e) => setCField("nameOr", e.target.value)}
                        placeholder="ଉଦାହରଣ: ମାଆ ଦୁର୍ଗା ଷ୍ଟୋର୍"
                        dir="auto"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="rt-in">
                        <span className="rt-in__label uppercase">Contact person</span>
                        <input
                          className="rt-in__control"
                          value={customerForm.contactPerson}
                          onChange={(e) => setCField("contactPerson", e.target.value)}
                        />
                      </label>
                      <label className="rt-in">
                        <span className="rt-in__label uppercase">Price list</span>
                        <div className="rt-in__select-wrap">
                          <select
                            className="rt-in__control"
                            value={customerForm.priceList}
                            onChange={(e) => setCField("priceList", e.target.value)}
                          >
                            <option>Retail</option>
                            <option>Wholesale</option>
                            <option>Special</option>
                          </select>
                          <ChevronDown size={15} className="rt-in__select-chev" aria-hidden="true" />
                        </div>
                      </label>
                    </div>
                    <div className="rt-card flex items-center justify-between gap-3">
                      <span className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
                        GST registered (B2B)
                      </span>
                      <Toggle
                        on={customerForm.gstRegistered}
                        onChange={(v) => setCField("gstRegistered", v)}
                      />
                    </div>
                    <label className="rt-in">
                      <span className="rt-in__label uppercase">State</span>
                      <div className="rt-in__select-wrap">
                        <select
                          className="rt-in__control"
                          value={customerForm.state}
                          onChange={(e) => setCField("state", e.target.value)}
                        >
                          {INDIAN_STATES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={15} className="rt-in__select-chev" aria-hidden="true" />
                      </div>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="rt-in">
                        <span className="rt-in__label uppercase">PAN</span>
                        <input
                          className="rt-in__control uppercase"
                          value={customerForm.pan}
                          onChange={(e) => setCField("pan", e.target.value.toUpperCase())}
                        />
                      </label>
                      <label className="rt-in">
                        <span className="rt-in__label uppercase">FSSAI</span>
                        <input
                          className="rt-in__control"
                          value={customerForm.fssai}
                          onChange={(e) => setCField("fssai", e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="rt-in">
                        <span className="rt-in__label uppercase">Visit order</span>
                        <input
                          className="rt-in__control"
                          inputMode="numeric"
                          value={customerForm.visitOrder}
                          onChange={(e) => setCField("visitOrder", e.target.value)}
                        />
                      </label>
                      <label className="rt-in">
                        <span className="rt-in__label uppercase">Credit days</span>
                        <input
                          className="rt-in__control"
                          inputMode="numeric"
                          value={customerForm.creditDays}
                          onChange={(e) => setCField("creditDays", e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="rt-flow-phone__footer">
            <button
              type="button"
              onClick={isSupplier ? saveSupplier : saveCustomer}
              className="rt-btn w-full"
            >
              {isSupplier ? t("common.save") : t("parties.saveCustomer")}
            </button>
          </div>

          {clashConfirm && (
            <ConfirmModal
              isOpen
              title="Duplicate customer name"
              message={`Another customer is already named "${clashConfirm.clash.name}"${clashConfirm.clash.phone ? ` (phone ${clashConfirm.clash.phone})` : ""}. Their bills stay with them and are NOT merged, but the two will look the same in lists. Save this name anyway?`}
              confirmButtonLabel="Save anyway"
              cancelButtonLabel="Go back"
              variant="warning"
              confirmIcon={<Edit2 className="w-3.5 h-3.5" />}
              onConfirm={clashConfirm.commit}
              onClose={() => setClashConfirm(null)}
            />
          )}
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 bg-[var(--bg)] flex flex-col">
        <div className="sticky top-0 z-10 bg-[var(--bg)] border-b border-black/5 px-4 sm:px-6 py-3 flex items-center justify-between max-w-none lg:max-w-3xl mx-auto w-full">
          <h1 className="text-lg font-bold text-slate-900">
            {isSupplier
              ? editingSupplier
                ? "Edit supplier"
                : "New supplier"
              : editingCustomer || editingDerivedCustomer
                ? "Edit customer"
                : "New customer"}
          </h1>
          <button
            type="button"
            onClick={() => {
              setFormOpen(false);
              setEditingCustomer(null);
              setEditingDerivedCustomer(null);
              setEditingSupplier(null);
              setClashConfirm(null);
            }}
            className="p-2 rounded-full hover:bg-black/5 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 pb-28 max-w-none lg:max-w-3xl mx-auto w-full space-y-4">
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
                    type="tel"
                    inputMode="tel"
                    placeholder="10-digit mobile / phone"
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
                {(editingCustomer || editingDerivedCustomer) && (
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Renaming updates this customer in-place along with all their past bills, payments, and ledger.
                  </p>
                )}
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
                    type="tel"
                    inputMode="tel"
                    placeholder="10-digit mobile / phone"
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
                    <option>Special</option>
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

        <div className="sticky bottom-0 z-10 bg-[var(--bg)] border-t border-black/5 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={isSupplier ? saveSupplier : saveCustomer}
            className="w-full max-w-none lg:max-w-3xl mx-auto block py-3.5 rounded-2xl bg-[var(--primary)] text-white font-semibold text-base shadow-sm cursor-pointer active:scale-[0.99]"
          >
            Save
          </button>
        </div>

        <style>{CRATE_INPUT_CSS}</style>

        {clashConfirm && (
          <ConfirmModal
            isOpen
            title="Duplicate customer name"
            message={`Another customer is already named "${clashConfirm.clash.name}"${clashConfirm.clash.phone ? ` (phone ${clashConfirm.clash.phone})` : ""}. Their bills stay with them and are NOT merged, but the two will look the same in lists. Save this name anyway?`}
            confirmButtonLabel="Save anyway"
            cancelButtonLabel="Go back"
            variant="warning"
            confirmIcon={<Edit2 className="w-3.5 h-3.5" />}
            onConfirm={clashConfirm.commit}
            onClose={() => setClashConfirm(null)}
          />
        )}
      </div>
    );
  }

  /* ═══════════ Main Parties list ═══════════ */
  const selectedBeatName =
    beatFilter === "all"
      ? t("parties.allBeats", { n: existingCustomers.length })
      : beatFilter === "none"
        ? t("parties.noBeatYet")
        : beatNameById.get(beatFilter) || beatFilter;

  return (
    <div id="view-customers" className="hh-view w-full min-w-0 pb-24">
      {isPhone ? (
        <div className="space-y-3">
          <div className="hh-sales-top">
            <div className="hh-sales-top__row">
              <h1 className="hh-sales-top__title">{t("parties.title")}</h1>
              <button
                type="button"
                onClick={openAdd}
                className="hh-sales-top__iconbtn"
                aria-label={partyTab === "suppliers" ? "Add supplier" : t("parties.newCustomer")}
              >
                <Plus className="w-6 h-6" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="rt-search-bar">
            <Search size={16} style={{ color: "var(--text-2)", flexShrink: 0 }} />
            <input
              enterKeyHint="search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("parties.searchPlaceholder")}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                aria-label="Clear search"
                className="p-1 bg-transparent border-0 cursor-pointer"
                style={{ color: "var(--text-2)" }}
              >
                <X size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setPhoneFilterSheetOpen(true)}
              aria-label="Filter parties"
              className="relative p-1.5 bg-transparent border-0 cursor-pointer inline-flex items-center justify-center shrink-0"
              style={{
                color: customerFilter !== "all" || partyTab === "suppliers" ? "var(--primary)" : "var(--text-2)",
                minHeight: "34px",
                minWidth: "34px",
              }}
            >
              <SlidersHorizontal size={16} />
              {(customerFilter !== "all" || partyTab === "suppliers") && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 size-2 rounded-full"
                  style={{ background: "var(--primary)" }}
                />
              )}
            </button>
          </div>

          {partyTab === "customers" && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {[
                { id: "all", label: t("parties.allBeats", { n: existingCustomers.length }) },
                ...beats
                  .filter((b) => b.active !== false)
                  .map((b) => ({ id: b.id, label: `${b.name} ${beatCounts.counts.get(b.id) || 0}` })),
                { id: "none", label: `${t("parties.noBeatYet")} ${beatCounts.none}` },
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={beatFilter === chip.id}
                  onClick={() => setBeatFilter(chip.id)}
                  className="rt-chip shrink-0"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {partyTab === "customers" && customerFilter !== "all" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCustomerFilter("all")}
                className="rt-tag rt-tag--mode cursor-pointer border-0"
              >
                {customerFilter === "due" ? `Due (${dueCount})` : `${t("parties.credit")} (${advanceCount})`} ×
              </button>
            </div>
          )}

          {partyTab === "suppliers" && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                type="button"
                aria-pressed={false}
                onClick={() => {
                  setPartyTab("customers");
                  setSearchTerm("");
                }}
                className="rt-chip shrink-0"
              >
                {t("parties.customers")} ({existingCustomers.length})
              </button>
              <button
                type="button"
                aria-pressed={true}
                onClick={() => setPartyTab("suppliers")}
                className="rt-chip shrink-0"
              >
                {t("parties.suppliers")} ({suppliers.length})
              </button>
            </div>
          )}

          {phoneFilterSheetOpen &&
            createPortal(
              <div
                className="rt-bsheet-scrim"
                onClick={() => setPhoneFilterSheetOpen(false)}
                role="dialog"
                aria-modal="true"
              >
                <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                  <div className="hh-grab" />
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                      {t("parties.title")}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-pressed={partyTab === "customers"}
                        onClick={() => {
                          setPartyTab("customers");
                          setPhoneFilterSheetOpen(false);
                        }}
                        className="rt-pay-pill text-[13px] font-bold cursor-pointer bg-white"
                      >
                        {t("parties.customers")} ({existingCustomers.length})
                      </button>
                      <button
                        type="button"
                        aria-pressed={partyTab === "suppliers"}
                        onClick={() => {
                          setPartyTab("suppliers");
                          setPhoneFilterSheetOpen(false);
                        }}
                        className="rt-pay-pill text-[13px] font-bold cursor-pointer bg-white"
                      >
                        {t("parties.suppliers")} ({suppliers.length})
                      </button>
                    </div>
                  </div>
                  {partyTab === "customers" && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                        {t("parties.balanceDue")}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          aria-pressed={customerFilter === "all"}
                          onClick={() => {
                            setCustomerFilter("all");
                            setPhoneFilterSheetOpen(false);
                          }}
                          className="rt-pay-pill text-[12.5px] font-bold cursor-pointer bg-white"
                        >
                          {t("common.all")} ({existingCustomers.length})
                        </button>
                        <button
                          type="button"
                          aria-pressed={customerFilter === "due"}
                          onClick={() => {
                            setCustomerFilter("due");
                            setPhoneFilterSheetOpen(false);
                          }}
                          className="rt-pay-pill text-[12.5px] font-bold cursor-pointer bg-white"
                        >
                          Due ({dueCount})
                        </button>
                        <button
                          type="button"
                          aria-pressed={customerFilter === "advance"}
                          onClick={() => {
                            setCustomerFilter("advance");
                            setPhoneFilterSheetOpen(false);
                          }}
                          className="rt-pay-pill text-[12.5px] font-bold cursor-pointer bg-white"
                        >
                          {t("parties.credit")} ({advanceCount})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>,
              document.body,
            )}

          {partyTab === "suppliers" ? (
            filteredSuppliers.length === 0 ? (
              <div className="rt-card px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-2)" }}>
                {t("parties.noPartiesFound")}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredSuppliers.map((s) => {
                  const grnN = grnCountBySupplier.get(s.name.trim().toLowerCase()) || 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSupplier(s)}
                      className="hh-hist-card hh-hist-card--primary w-full text-left flex items-center gap-3 cursor-pointer"
                    >
                      <span className="rt-ico shrink-0">{getInitials(s.name, "S")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-bold break-words" style={{ color: "var(--text)" }}>
                          {s.name}
                        </span>
                        <span className="block text-[12px] mt-0.5 break-words" style={{ color: "var(--text-2)" }}>
                          {[s.phone || s.city || s.gstin].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-[15px] font-extrabold tabular-nums" style={{ color: "var(--text)" }}>
                          {grnN}
                        </span>
                        <span className="rt-tag mt-0.5">GRNs</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          ) : filteredCustomers.length === 0 ? (
            <div className="rt-card px-5 py-10 text-center space-y-1">
              <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>
                {t("parties.noPartiesFound")}
              </div>
              <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
                {selectedBeatName}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredCustomers.map((c) => {
                const hasAdvance = (c.advance || 0) > 0.004 && c.balanceDue <= 0.004;
                const hasDue = c.balanceDue > 0.004;
                const dueDays = hasDue ? (oldestDueDaysByCustomer.get(normCustName(c.name)) ?? 0) : 0;
                const overdueHigh = hasDue && dueDays > 14;
                const cardEdge = hasAdvance
                  ? "hh-hist-card--paid"
                  : hasDue
                    ? overdueHigh
                      ? "hh-hist-card--due"
                      : "hh-hist-card--amber"
                    : "hh-hist-card--paid";
                const displayName = nameFromMap(customerNameMap, c, language);
                const bid = beatIdForExisting(c);
                const beatLabel = (bid && beatNameById.get(bid)) || c.city || "";
                const tpLabel =
                  (c.id && customerTypeById.get(c.id)) ||
                  customerTypeByName.get(normCustName(c.name)) ||
                  "Retail";
                const subLine = [beatLabel || c.phone, tpLabel].filter(Boolean).join(" · ");

                return (
                  <button
                    key={c.id || c.name}
                    type="button"
                    onClick={() => {
                      setPhoneDetailTab("summary");
                      setSelectedCustomer(c);
                    }}
                    className={`hh-hist-card ${cardEdge} w-full text-left flex items-center gap-3 cursor-pointer`}
                  >
                    <span className="rt-ico shrink-0">{getInitials(displayName, "C")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold break-words leading-snug" style={{ color: "var(--text)" }}>
                        {displayName}
                      </span>
                      <span className="block text-[12px] mt-0.5 break-words" style={{ color: "var(--text-2)" }}>
                        {subLine}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      {hasAdvance ? (
                        <>
                          <span className="block text-[15px] font-extrabold tabular-nums" style={{ color: "var(--paid)" }}>
                            ₹{money(c.advance || 0)}
                          </span>
                          <span className="rt-tag rt-tag--paid mt-0.5">{t("parties.credit")}</span>
                        </>
                      ) : hasDue ? (
                        <>
                          <span className="block text-[15px] font-extrabold tabular-nums" style={{ color: "var(--text)" }}>
                            ₹{money(c.balanceDue)}
                          </span>
                          <span className={`rt-tag mt-0.5 ${overdueHigh ? "rt-tag--due" : "rt-tag--soon"}`}>
                            {dueDays === 1
                              ? t("parties.dayCount")
                              : dueDays > 1
                                ? t("parties.daysCount", { n: dueDays })
                                : t("status.due")}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="block text-[15px] font-extrabold tabular-nums" style={{ color: "var(--text)" }}>
                            ₹0
                          </span>
                          <span className="rt-tag rt-tag--paid mt-0.5">{t("parties.clear")}</span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="w-full min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Parties
          </h1>
          <button
            type="button"
            onClick={openAdd}
            className="size-10 sm:size-11 rounded-full bg-[var(--primary)] text-white flex items-center justify-center shadow-md cursor-pointer active:scale-95"
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
              setBeatMenuOpen(false);
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
              setBeatMenuOpen(false);
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

        <div ref={beatMenuRef} className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            enterKeyHint="search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name, phone, GSTIN"
            className={`w-full pl-10 py-2.5 rounded-full bg-white border border-black/8 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25 focus:border-[var(--primary)]/40 ${
              partyTab === "customers" && beats.length > 0
                ? searchTerm
                  ? "pr-20 md:pr-10"
                  : "pr-12 md:pr-4"
                : searchTerm
                  ? "pr-10"
                  : "pr-4"
            }`}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
              className={`absolute top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer ${
                partyTab === "customers" && beats.length > 0 ? "right-11 md:right-2" : "right-2"
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Mobile Beat Filter Icon on right side of search bar */}
          {partyTab === "customers" && beats.length > 0 && (
            <button
              type="button"
              onClick={() => setBeatMenuOpen((v) => !v)}
              aria-label="Filter by beat"
              aria-expanded={beatMenuOpen}
              className={`md:hidden absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] px-2 rounded-full inline-flex items-center justify-center gap-1 text-xs font-bold transition-colors cursor-pointer ${
                beatFilter !== "all"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              title="Filter by beat"
            >
              <Route className="w-4 h-4 shrink-0" />
            </button>
          )}

          {/* Beat Selector Dropdown inside Search (mobile) */}
          {beatMenuOpen && partyTab === "customers" && beats.length > 0 && (
            <div
              role="listbox"
              aria-label="Choose beat"
              className="md:hidden absolute left-0 right-0 top-full mt-1.5 z-40 rounded-2xl border border-[#DCE5F2] bg-white shadow-xl p-2 space-y-1 max-h-72 overflow-y-auto"
            >
              <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Filter by beat
              </div>
              {[
                { id: "all", label: "All beats", n: existingCustomers.length },
                ...beats
                  .filter((b) => b.active !== false)
                  .map((b) => ({ id: b.id, label: b.name, n: beatCounts.counts.get(b.id) || 0 })),
                { id: "none", label: "No beat yet", n: beatCounts.none },
              ].map((opt) => {
                const selected = beatFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setBeatFilter(opt.id);
                      setBeatMenuOpen(false);
                    }}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      selected
                        ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Route className={`w-3.5 h-3.5 shrink-0 ${selected ? "text-emerald-700" : "text-slate-400"}`} />
                      <span className="truncate">{opt.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold tabular-nums">
                        {opt.n}
                      </span>
                      {selected && <Check className="w-4 h-4 text-emerald-700" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
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

        {partyTab === "customers" && beats.length > 0 && beatFilter !== "all" && (
          <div className="md:hidden flex items-center gap-1.5 mb-3 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
              <Route className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
              <span>
                Beat:{" "}
                {beatFilter === "none"
                  ? "No beat yet"
                  : beats.find((b) => b.id === beatFilter)?.name || beatFilter}
              </span>
              <button
                type="button"
                onClick={() => setBeatFilter("all")}
                aria-label="Clear beat filter"
                className="ml-0.5 text-emerald-600 hover:text-emerald-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
        )}

        {partyTab === "customers" && beats.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 mb-3.5 overflow-x-auto pb-1 text-xs" aria-label="Filter by beat">
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
            <ul className="hh-list-grid">
              {filteredSuppliers.map((s) => {
                const grnN =
                  grnCountBySupplier.get(s.name.trim().toLowerCase()) || 0;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSupplier(s)}
                      data-card-tone="profit"
                      className="w-full text-left rounded-2xl border shadow-sm px-4 py-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition"
                    >
                      <div className="hh-icon-badge hh-icon-badge--purple">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 break-words leading-snug">
                          {s.name}
                        </div>
                        <div className="text-xs text-slate-600 min-w-0 break-words lg:truncate">
                          {s.phone || s.city || s.gstin || "—"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-extrabold text-violet-900 tabular-nums">
                          {grnN}
                        </div>
                        <div className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">
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
          <ul className="hh-list-grid">
            {filteredCustomers.map((c) => {
              const hasAdvance = (c.advance || 0) > 0.004 && c.balanceDue <= 0.004;
              const hasDue = c.balanceDue > 0.004;
              const cardTone = hasAdvance ? "received" : hasDue ? "due" : "sales";
              const avatarTone = hasAdvance ? "green" : hasDue ? "rose" : "blue";
              const displayName = nameFromMap(customerNameMap, c, language);
              return (
              <li key={c.id || c.name}>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(c)}
                  data-card-tone={cardTone}
                  className="w-full text-left rounded-2xl border shadow-sm px-4 py-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition"
                >
                  <div className={`hh-avatar hh-avatar--${avatarTone}`}>
                    {getInitials(displayName, "C")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 break-words leading-snug">
                        {displayName}
                      </span>
                      {hasAdvance && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                          Advance
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 min-w-0 break-words lg:truncate">
                      {c.phone || c.city || "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {hasAdvance ? (
                      <>
                        <div className="text-sm font-black text-emerald-700 tabular-nums">
                          ₹{money(c.advance || 0)}
                        </div>
                        <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                          advance
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className={`text-sm font-extrabold tabular-nums ${
                            hasDue ? "text-rose-600" : "text-slate-800"
                          }`}
                        >
                          ₹{money(c.balanceDue)}
                        </div>
                        <div
                          className={`text-[10px] font-bold uppercase tracking-wide ${
                            hasDue ? "text-rose-500" : "text-slate-500"
                          }`}
                        >
                          {hasDue ? "due" : "settled"}
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
      )}

      {customerToDelete && (
        <ConfirmModal
          isOpen
          title="Delete customer?"
          message={`Remove ${customerToDelete.name}?`}
          confirmButtonLabel="Delete"
          variant="danger"
          rectificationPrompt="Rectification comment (saved with the delete)"
          optionalCheckboxLabel="Also remove payments linked directly to this customer (recommended for duplicate customers)"
          onConfirmWithOptions={({ comment, optionalChecked }) => {
            if (customerToDelete.id) {
              deleteCustomer(customerToDelete.id, comment || undefined, {
                removePayments: optionalChecked,
              });
            }
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
  return <ToggleSwitch checked={on} onChange={onChange} />;
}

function EmptyCard({ title, hint }: { title: string; hint: string }) {
  return (
    <div
      data-card-tone="neutral"
      className="rounded-2xl border shadow-sm px-6 py-12 text-center"
    >
      <p className="text-base font-bold text-slate-900">{title}</p>
      <p className="text-sm text-slate-500 mt-1.5">{hint}</p>
    </div>
  );
}

export default CustomersView;
