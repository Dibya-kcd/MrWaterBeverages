import React, { useEffect, useMemo, useState } from 'react';
import {
  HandCoins,
  PackagePlus,
  FileClock,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Search,
  ExternalLink,
  FilePlus2,
  RefreshCw,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Modal,
  ConfirmModal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../ui';
import { InfoTip } from '../common/InfoTip';
import { SupplierScheme, SupplierSchemeType, SupplierIncentiveCalcMethod, SupplierCreditNote } from '../../types';
import { buildMonthlyIncentiveReport, isClaimLinkedNote } from '../../utils/supplierSchemes';
import { todayISO } from "../../utils/dateLocal";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const SCHEME_TYPE_LABEL: Record<SupplierSchemeType, string> = {
  free_goods: 'Type A — Free goods with purchase',
  pending_credit: 'Type B — Pending credit note',
  volume_incentive: 'Type C — Monthly volume incentive',
};

const SCHEME_TYPE_SHORT: Record<SupplierSchemeType, string> = {
  free_goods: 'A · Free goods',
  pending_credit: 'B · Pending credit',
  volume_incentive: 'C · Volume incentive',
};

const typeLabel = (t?: string) => SCHEME_TYPE_LABEL[(t as SupplierSchemeType) || 'free_goods'] || String(t || '—');
const typeShort = (t?: string) => SCHEME_TYPE_SHORT[(t as SupplierSchemeType) || 'free_goods'] || String(t || '—');

// 14px everywhere; iPhones get 16px from a global rule in index.css.
const inputCls =
  'w-full h-11 sm:h-10 border border-slate-300 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400';
const labelCls = 'flex items-center gap-1 text-xs font-medium text-slate-600 mb-1';
const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const todayIso = () => todayISO();

function emptySchemeForm(schemeType: SupplierSchemeType = 'free_goods'): Omit<SupplierScheme, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    supplierName: '',
    name: '',
    schemeType,
    productIds: [],
    startDate: todayIso(),
    endDate: undefined,
    targetQuantity: undefined,
    incentiveRate: undefined,
    calculationMethod: 'all_eligible',
    active: true,
    notes: '',
  };
}

type TabKey = 'schemes' | 'credit_notes' | 'monthly_report';
type CnFilter = 'all' | 'scheme' | 'claims';

const Field: React.FC<{ label: string; info?: React.ReactNode; infoTitle?: string; children: React.ReactNode; className?: string }> = ({
  label,
  info,
  infoTitle,
  children,
  className = '',
}) => (
  <div className={`min-w-0 ${className}`}>
    <span className={labelCls}>
      {label}
      {info && (
        <InfoTip size="sm" title={infoTitle || label}>
          {info}
        </InfoTip>
      )}
    </span>
    {children}
  </div>
);

/** Equal-width label/value tile used inside cards. */
const Stat: React.FC<{ label: string; value: string; tone?: 'default' | 'good' | 'warn' }> = ({ label, value, tone = 'default' }) => (
  <div className="bg-slate-50 rounded-lg px-1.5 py-2 text-center min-w-0">
    <p className="text-[10px] text-slate-500 leading-none">{label}</p>
    <p
      className={`text-xs sm:text-sm font-bold mt-1 truncate ${
        tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-800'
      }`}
    >
      {value}
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const SupplierSchemesView: React.FC = () => {
  const {
    products,
    bills,
    grns,
    setTab: goToTab,
    supplierSchemes,
    supplierSchemeApplications,
    addSupplierScheme,
    updateSupplierScheme,
    deleteSupplierScheme,
    supplierCreditNotes,
    addSupplierCreditNote,
    updateSupplierCreditNote,
    deleteSupplierCreditNote,
    recordSupplierCreditNoteReceipt,
  } = useLedger();

  const [tab, setTab] = useState<TabKey>('schemes');
  const [cnFilter, setCnFilter] = useState<CnFilter>('all');

  // Dashboard "credit notes not settled" lands straight on the Credit notes tab.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('mrwater_open_supplier_cn') === 'pending') {
        sessionStorage.removeItem('mrwater_open_supplier_cn');
        setTab('credit_notes');
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Scheme form
  const [schemeModalOpen, setSchemeModalOpen] = useState(false);
  const [editingSchemeId, setEditingSchemeId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySchemeForm());
  const [formError, setFormError] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; used: number } | null>(null);

  // Receipt
  const [receiptNote, setReceiptNote] = useState<SupplierCreditNote | null>(null);
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptDate, setReceiptDate] = useState(todayIso());

  // Edit / delete credit note
  const [editingNote, setEditingNote] = useState<SupplierCreditNote | null>(null);
  const [editExpectedAmount, setEditExpectedAmount] = useState('');
  const [editActualAmount, setEditActualAmount] = useState('');
  const [editCnNumber, setEditCnNumber] = useState('');
  const [editCnDate, setEditCnDate] = useState('');
  const [editCnNotes, setEditCnNotes] = useState('');
  const [deleteNoteConfirm, setDeleteNoteConfirm] = useState<SupplierCreditNote | null>(null);

  // ---- derived data -------------------------------------------------------

  const schemeById = useMemo(() => new Map(supplierSchemes.map((s) => [s.id, s])), [supplierSchemes]);

  /** How many GRN lines / free cases / expected ₹ each scheme has actually been attached to. */
  const usageByScheme = useMemo(() => {
    const m = new Map<string, { lines: number; freeCases: number; expected: number }>();
    for (const a of supplierSchemeApplications || []) {
      const u = m.get(a.schemeId) || { lines: 0, freeCases: 0, expected: 0 };
      u.lines += 1;
      u.freeCases += Number(a.freeQuantity) || 0;
      u.expected += Number(a.expectedBenefit) || 0;
      m.set(a.schemeId, u);
    }
    return m;
  }, [supplierSchemeApplications]);

  const supplierNames = useMemo(() => {
    const set = new Set<string>();
    supplierSchemes.forEach((s) => s.supplierName && set.add(s.supplierName));
    (grns || []).forEach((g: any) => g?.supplierName && set.add(g.supplierName));
    return Array.from(set).sort();
  }, [supplierSchemes, grns]);

  const monthlyPeriods = useMemo(() => {
    // Current month plus the two before it, newest first.
    const now = new Date();
    const out: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }, []);

  const monthlyReport = useMemo(
    () =>
      buildMonthlyIncentiveReport({
        schemes: supplierSchemes,
        bills,
        creditNotes: supplierCreditNotes,
        products,
        periods: monthlyPeriods,
      }),
    [supplierSchemes, bills, supplierCreditNotes, products, monthlyPeriods]
  );

  // Scheme / incentive notes vs expiry-damage claim notes (those belong to Returns & Disposals).
  const schemeNotes = useMemo(() => supplierCreditNotes.filter((n) => !isClaimLinkedNote(n)), [supplierCreditNotes]);
  const claimNotes = useMemo(() => supplierCreditNotes.filter((n) => isClaimLinkedNote(n)), [supplierCreditNotes]);
  const visibleNotes = cnFilter === 'scheme' ? schemeNotes : cnFilter === 'claims' ? claimNotes : supplierCreditNotes;

  const totalOutstanding = schemeNotes.reduce((s, n) => s + Math.max(0, n.expectedAmount - n.actualAmount), 0);
  const activeSchemesCount = supplierSchemes.filter((s) => s.active).length;
  const openNotesCount = schemeNotes.filter((n) => n.status !== 'settled').length;
  const monthlyToRaise = monthlyReport.filter((r) => r.achieved && r.status === 'pending').length;

  // ---- actions ------------------------------------------------------------

  const openCreate = () => {
    setEditingSchemeId(null);
    setForm(emptySchemeForm());
    setFormError('');
    setProductSearch('');
    setSchemeModalOpen(true);
  };

  const openEdit = (s: SupplierScheme) => {
    setEditingSchemeId(s.id);
    setForm({
      supplierName: s.supplierName,
      name: s.name,
      schemeType: s.schemeType,
      productIds: Array.isArray(s.productIds) ? s.productIds : [],
      warehouseId: s.warehouseId,
      startDate: s.startDate,
      endDate: s.endDate,
      targetQuantity: s.targetQuantity,
      incentiveRate: s.incentiveRate,
      calculationMethod: s.calculationMethod,
      active: s.active,
      notes: s.notes,
    });
    setFormError('');
    setProductSearch('');
    setSchemeModalOpen(true);
  };

  const saveScheme = () => {
    if (!form.supplierName.trim()) return setFormError('Enter the supplier name.');
    if (!form.name.trim()) return setFormError('Enter a scheme name.');
    if (form.productIds.length === 0) return setFormError('Select at least one product.');
    if (form.endDate && form.endDate < form.startDate) return setFormError('End date cannot be before the start date.');
    if (form.schemeType === 'volume_incentive') {
      if (!(Number(form.targetQuantity) > 0)) return setFormError('Enter the monthly target in cases.');
      if (!(Number(form.incentiveRate) > 0)) return setFormError('Enter the incentive rate (₹ per case).');
    }
    const payload = { ...form, supplierName: form.supplierName.trim(), name: form.name.trim() };
    if (editingSchemeId) updateSupplierScheme(editingSchemeId, payload);
    else addSupplierScheme(payload);
    setSchemeModalOpen(false);
  };

  const openReceipt = (n: SupplierCreditNote) => {
    setReceiptNote(n);
    setReceiptAmount(String(Math.max(0, n.expectedAmount - n.actualAmount)));
    setReceiptNumber(n.creditNoteNumber || '');
    setReceiptDate(n.creditNoteDate || todayIso());
  };

  /**
   * The amount typed here is what has been received IN THIS CREDIT NOTE, added to what was
   * already received. (The old screen asked for a running total, which was easy to get wrong.)
   */
  const submitReceipt = () => {
    if (!receiptNote) return;
    const add = Math.max(0, Number(receiptAmount) || 0);
    if (add <= 0) return;
    recordSupplierCreditNoteReceipt(receiptNote.id, {
      actualAmount: receiptNote.actualAmount + add,
      creditNoteNumber: receiptNumber.trim() || receiptNote.creditNoteNumber,
      creditNoteDate: receiptDate || todayIso(),
      attachmentRef: receiptNote.attachmentRef,
      notes: receiptNote.notes,
    });
    setReceiptNote(null);
  };

  const openEditNote = (n: SupplierCreditNote) => {
    setEditingNote(n);
    setEditExpectedAmount(String(n.expectedAmount ?? 0));
    setEditActualAmount(String(n.actualAmount ?? 0));
    setEditCnNumber(n.creditNoteNumber || '');
    setEditCnDate(n.creditNoteDate || todayIso());
    setEditCnNotes(n.notes || '');
  };

  const saveEditedNote = () => {
    if (!editingNote) return;
    updateSupplierCreditNote(editingNote.id, {
      expectedAmount: Math.max(0, Number(editExpectedAmount) || 0),
      actualAmount: Math.max(0, Number(editActualAmount) || 0),
      creditNoteNumber: editCnNumber.trim() || undefined,
      creditNoteDate: editCnDate || undefined,
      notes: editCnNotes.trim() || undefined,
    });
    setEditingNote(null);
  };

  const openClaim = () => {
    try {
      sessionStorage.setItem('mrwater_open_dispositions', 'claims');
    } catch {
      /* ignore */
    }
    goToTab('inventory');
  };

  /** Type C has no GRN, so the credit note is raised here once the month's target is met. */
  const raiseMonthlyNote = (r: (typeof monthlyReport)[number]) => {
    addSupplierCreditNote({
      supplierName: r.supplierName,
      schemeId: r.schemeId,
      period: r.period,
      expectedAmount: r.expectedCredit,
      actualAmount: 0,
      notes: `Monthly incentive ${r.period} · ${r.actualEligibleQty} cs sold vs target ${r.targetQuantity} cs`,
    });
  };

  const noteForRow = (r: (typeof monthlyReport)[number]) =>
    supplierCreditNotes.find((n) => n.schemeId === r.schemeId && n.period === r.period);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'settled':
        return <Badge variant="success" className="shrink-0 whitespace-nowrap">Settled</Badge>;
      case 'partially_credited':
        return <Badge variant="warning" className="shrink-0 whitespace-nowrap">Part received</Badge>;
      case 'pending':
        return <Badge variant="accent" className="shrink-0 whitespace-nowrap">Awaiting CN</Badge>;
      default:
        return <Badge variant="neutral" className="shrink-0 whitespace-nowrap">Target not met</Badge>;
    }
  };

  const productNames = (ids: number[]) =>
    (Array.isArray(ids) ? ids : []).map((pid) => products.find((p) => p.id === pid)?.name || `#${pid}`).join(', ') || '—';

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const toggleProduct = (id: number) =>
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(id) ? f.productIds.filter((x) => x !== id) : [...f.productIds, id],
    }));

  // ---- render -------------------------------------------------------------

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'schemes', label: 'Schemes' },
    { key: 'credit_notes', label: 'Credit notes', badge: openNotesCount },
    { key: 'monthly_report', label: 'Monthly', badge: monthlyToRaise },
  ];

  return (
    <div id="view-supplier-schemes" className="hh-view space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <HandCoins className="w-5 h-5 text-slate-700 shrink-0" aria-hidden="true" />
          <h1 className="truncate">Supplier credits</h1>
          <InfoTip title="Supplier credits">
            <p>
              Purchase-side benefits from your suppliers. This is separate from customer <strong>Promotions</strong>,
              which change what a customer pays on a bill. Nothing here ever changes a customer invoice.
            </p>
            <ul>
              <li>
                <strong>Type A – Free goods:</strong> extra free cases that come on top of what you were invoiced for.
                Attach the scheme to a GRN line in Inventory → Add stock; the free cases go into stock and lower your
                effective cost per case.
              </li>
              <li>
                <strong>Type B – Pending credit note:</strong> the supplier promises a ₹ credit later. Attach it to a GRN
                line and a credit note is created automatically for you to track.
              </li>
              <li>
                <strong>Type C – Monthly volume incentive:</strong> the supplier pays ₹ per case when your sales of the
                product group reach the monthly target. It is worked out live from your bills — see the Monthly tab.
              </li>
            </ul>
            <p>Every benefit stays traceable to the GRN or sales that earned it. The original GRN/invoice is never edited.</p>
          </InfoTip>
        </div>
        <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate} className="shrink-0 h-10 px-3.5">
          New scheme
        </Button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="relative flex flex-col gap-1 py-3 px-2.5 sm:px-4">
            <PackagePlus className="w-5 h-5 text-slate-400" aria-hidden="true" />
            <p className="text-[11px] text-slate-500 leading-tight">Active schemes</p>
            <p className="text-lg font-semibold text-slate-900 leading-none">{activeSchemesCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="relative flex flex-col gap-1 py-3 px-2.5 sm:px-4">
            <FileClock className="w-5 h-5 text-amber-400" aria-hidden="true" />
            <p className="text-[11px] text-slate-500 leading-tight">Open credit notes</p>
            <p className="text-lg font-semibold text-slate-900 leading-none">{openNotesCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="relative flex flex-col gap-1 py-3 px-2.5 sm:px-4">
            <TrendingUp className="w-5 h-5 text-emerald-500" aria-hidden="true" />
            <p className="text-[11px] text-slate-500 leading-tight">Still to receive</p>
            <p className="text-lg font-semibold text-slate-900 leading-none truncate">{inr(totalOutstanding)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs — equal-width segmented control, no sideways scroll */}
      <div role="tablist" className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
        {tabs.map(({ key, label, badge }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`h-10 px-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-w-0 ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="truncate">{label}</span>
            {!!badge && badge > 0 && (
              <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-[18px] text-center">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SCHEMES                                                            */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'schemes' && (
        <>
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold text-slate-800">Supplier schemes</h3>
            <InfoTip title="Schemes" size="sm">
              <p>
                A scheme is a standing supplier offer. Create it once here, then use it:
              </p>
              <ul>
                <li>
                  <strong>Type A / B</strong> appear in the “Supplier scheme” dropdown on every GRN line (Inventory → Add
                  stock). Only <strong>Active</strong> schemes are offered there.
                </li>
                <li>
                  <strong>Type C</strong> is not attached to a GRN. It reads your posted bills for the selected products
                  each month (cancelled bills are ignored and customer returns are deducted).
                </li>
              </ul>
              <p>
                Tap the Active / Inactive badge to switch a scheme off without deleting it. Deleting a scheme keeps all
                quantities and credit notes already recorded against it.
              </p>
            </InfoTip>
          </div>

          {supplierSchemes.length === 0 ? (
            <Card>
              <CardContent className="text-center text-sm text-slate-500 py-8 space-y-3">
                <p>No supplier schemes yet.</p>
                <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate} className="h-10">
                  Create your first scheme
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card noPadding className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scheme</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>Window</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplierSchemes.map((s) => {
                      const u = usageByScheme.get(s.id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium text-slate-900">{s.name}</TableCell>
                          <TableCell>{s.supplierName}</TableCell>
                          <TableCell className="text-xs">{typeLabel(s.schemeType)}</TableCell>
                          <TableCell className="text-xs max-w-[220px]">{productNames(s.productIds)}</TableCell>
                          <TableCell className="text-xs">
                            {s.schemeType === 'volume_incentive'
                              ? `${(s.targetQuantity || 0).toLocaleString('en-IN')} cs · ${inr(s.incentiveRate || 0)}/cs`
                              : u
                              ? `${u.lines} GRN line${u.lines > 1 ? 's' : ''}${u.freeCases ? ` · ${u.freeCases} free cs` : ''}${
                                  u.expected ? ` · ${inr(u.expected)}` : ''
                                }`
                              : 'Not used yet'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {s.startDate} {s.endDate ? `→ ${s.endDate}` : '(open)'}
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => updateSupplierScheme(s.id, { active: !s.active })}
                              title="Tap to switch on / off"
                              className="cursor-pointer"
                            >
                              <Badge variant={s.active ? 'success' : 'neutral'}>{s.active ? 'Active' : 'Inactive'}</Badge>
                            </button>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(s)} aria-label="Edit scheme">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Delete scheme"
                                onClick={() => setDeleteConfirm({ id: s.id, name: s.name, used: u?.lines || 0 })}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2.5">
                {supplierSchemes.map((s) => {
                  const u = usageByScheme.get(s.id);
                  return (
                    <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900 break-words">{s.name}</p>
                          <p className="text-xs text-slate-500 break-words leading-snug mt-0.5">{s.supplierName}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateSupplierScheme(s.id, { active: !s.active })}
                          aria-label={s.active ? 'Switch scheme off' : 'Switch scheme on'}
                          className="shrink-0 cursor-pointer"
                        >
                          <Badge variant={s.active ? 'success' : 'neutral'}>{s.active ? 'Active' : 'Inactive'}</Badge>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2.5">
                        <Badge variant="accent">{typeShort(s.schemeType)}</Badge>
                        <span className="text-[11px] text-slate-500">
                          {s.startDate} {s.endDate ? `→ ${s.endDate}` : '→ open'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 mt-2 line-clamp-2 break-words">{productNames(s.productIds)}</p>

                      <div className="mt-2.5 text-[11px] rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-600">
                        {s.schemeType === 'volume_incentive' ? (
                          <>
                            Target <strong className="text-slate-800">{(s.targetQuantity || 0).toLocaleString('en-IN')} cs</strong>/month ·{' '}
                            <strong className="text-slate-800">{inr(s.incentiveRate || 0)}</strong>/cs ·{' '}
                            {s.calculationMethod === 'excess_only' ? 'excess cases only' : 'all cases'}
                          </>
                        ) : u ? (
                          <>
                            Used on <strong className="text-slate-800">{u.lines}</strong> GRN line{u.lines > 1 ? 's' : ''}
                            {u.freeCases > 0 && (
                              <>
                                {' '}· <strong className="text-slate-800">{u.freeCases}</strong> free cs
                              </>
                            )}
                            {u.expected > 0 && (
                              <>
                                {' '}· <strong className="text-slate-800">{inr(u.expected)}</strong> expected
                              </>
                            )}
                          </>
                        ) : (
                          'Not used on any GRN yet'
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
                        <Button size="sm" variant="outline" className="h-10" leftIcon={<Pencil className="w-4 h-4" />} onClick={() => openEdit(s)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 text-rose-600 border-rose-200"
                          leftIcon={<Trash2 className="w-4 h-4" />}
                          onClick={() => setDeleteConfirm({ id: s.id, name: s.name, used: u?.lines || 0 })}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* CREDIT NOTES                                                       */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'credit_notes' && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <h3 className="text-sm font-semibold text-slate-800">Supplier credit notes</h3>
              <InfoTip title="Supplier credit notes" size="sm">
                <p>
                  Every ₹ a supplier owes you as a credit note, in one list. <strong>Expected</strong> is what was promised
                  and never changes after you record receipts; <strong>Received</strong> is what the supplier has actually
                  credited; <strong>Outstanding</strong> is the difference.
                </p>
                <ul>
                  <li>
                    <strong>Scheme / incentive</strong> notes come from Type B GRN lines (created automatically when you post
                    the GRN) and from Type C monthly incentives (raise them in the Monthly tab). Record receipts here.
                  </li>
                  <li>
                    <strong>Claim</strong> notes come from Returns &amp; Disposals (expired / damaged / returned stock). They
                    are the <em>same</em> credit notes you record in Inventory → Returns &amp; Disposals, shown here for
                    reference. Edit them there, where the GST split and partial receipts are kept. They are not counted in
                    the totals above, because claims are tracked on the Home screen separately.
                  </li>
                </ul>
                <p>Scheme credits actually received are included in the Supplier credits line of the profit report.</p>
              </InfoTip>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3.5 px-3.5 sm:mx-0 sm:px-0" role="group" aria-label="Filter credit notes">
            {([
              ['all', `All (${supplierCreditNotes.length})`],
              ['scheme', `Scheme & incentive (${schemeNotes.length})`],
              ['claims', `Claims (${claimNotes.length})`],
            ] as [CnFilter, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setCnFilter(k)}
                className={`h-9 px-3.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  cnFilter === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {visibleNotes.length === 0 ? (
            <Card>
              <CardContent className="text-center text-sm text-slate-500 py-8">
                {supplierCreditNotes.length === 0
                  ? 'No supplier credit notes yet. They appear when a GRN line uses a Type B scheme, when you raise a monthly incentive, or when an expiry/damage claim is settled.'
                  : 'Nothing in this filter.'}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card noPadding className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>CN no.</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleNotes.map((n) => {
                      const claim = isClaimLinkedNote(n);
                      const scheme = n.schemeId ? schemeById.get(n.schemeId) : undefined;
                      return (
                        <TableRow key={n.id}>
                          <TableCell className="font-medium text-slate-900">{n.supplierName}</TableCell>
                          <TableCell className="text-xs">
                            {claim ? 'Expiry / damage claim' : scheme?.name || (n.period ? `Incentive ${n.period}` : n.grnId || '—')}
                            {!claim && n.period && scheme ? ` · ${n.period}` : ''}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{n.creditNoteNumber || '—'}</TableCell>
                          <TableCell className="text-right">{inr(n.expectedAmount)}</TableCell>
                          <TableCell className="text-right">{inr(n.actualAmount)}</TableCell>
                          <TableCell className="text-right">{inr(Math.max(0, n.expectedAmount - n.actualAmount))}</TableCell>
                          <TableCell>{statusBadge(n.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1.5">
                              {claim ? (
                                <Button size="sm" variant="outline" leftIcon={<ExternalLink className="w-3.5 h-3.5" />} onClick={openClaim}>
                                  Open claim
                                </Button>
                              ) : (
                                <>
                                  {n.status !== 'settled' && (
                                    <Button size="sm" variant="outline" leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => openReceipt(n)}>
                                      Record receipt
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" onClick={() => openEditNote(n)} aria-label="Edit credit note">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setDeleteNoteConfirm(n)} aria-label="Delete credit note">
                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2.5">
                {visibleNotes.map((n) => {
                  const claim = isClaimLinkedNote(n);
                  const scheme = n.schemeId ? schemeById.get(n.schemeId) : undefined;
                  const outstanding = Math.max(0, n.expectedAmount - n.actualAmount);
                  const source = claim
                    ? 'Expiry / damage claim'
                    : scheme
                    ? `${scheme.name}${n.period ? ` · ${n.period}` : ''}`
                    : n.period
                    ? `Incentive ${n.period}`
                    : n.grnId
                    ? `GRN ${n.grnId}`
                    : 'Credit note';
                  return (
                    <div key={n.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900 break-words leading-snug">{n.supplierName}</p>
                          <p className="text-[11px] text-slate-500 break-words mt-0.5">{source}</p>
                          {n.creditNoteNumber && (
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5">CN {n.creditNoteNumber}</p>
                          )}
                        </div>
                        {statusBadge(n.status)}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mt-3">
                        <Stat label="Expected" value={inr(n.expectedAmount)} />
                        <Stat label="Received" value={inr(n.actualAmount)} tone="good" />
                        <Stat label="Outstanding" value={inr(outstanding)} tone={outstanding > 0 ? 'warn' : 'default'} />
                      </div>
                      <div className={`grid gap-2 mt-3 pt-3 border-t border-slate-100 ${claim ? 'grid-cols-1' : n.status !== 'settled' ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto]'}`}>
                        {claim ? (
                          <Button size="sm" variant="outline" className="h-10" leftIcon={<ExternalLink className="w-4 h-4" />} onClick={openClaim}>
                            Open claim in Returns &amp; Disposals
                          </Button>
                        ) : (
                          <>
                            {n.status !== 'settled' ? (
                              <Button size="sm" variant="outline" className="h-10" leftIcon={<CheckCircle2 className="w-4 h-4" />} onClick={() => openReceipt(n)}>
                                Record receipt
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-10" leftIcon={<Pencil className="w-4 h-4" />} onClick={() => openEditNote(n)}>
                                Edit
                              </Button>
                            )}
                            {n.status !== 'settled' && (
                              <Button size="sm" variant="outline" className="h-10 w-10 px-0" onClick={() => openEditNote(n)} aria-label="Edit credit note">
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-10 w-10 px-0 text-rose-600 border-rose-200"
                              onClick={() => setDeleteNoteConfirm(n)}
                              aria-label="Delete credit note"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MONTHLY                                                            */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'monthly_report' && (
        <>
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold text-slate-800">Monthly volume incentive</h3>
            <InfoTip title="Monthly volume incentive" size="sm">
              <p>
                One line per Type C scheme per month, for this month and the two before. The target applies to the
                <strong> whole product group together</strong> (not each product on its own).
              </p>
              <ul>
                <li>
                  <strong>Sold</strong> is counted live from your posted bills. Cancelled bills are ignored and customer
                  returns are deducted, so it always matches your sales.
                </li>
                <li>
                  <strong>All cases</strong> pays the rate on every case once the target is hit.{' '}
                  <strong>Excess only</strong> pays the rate only on cases above the target.
                </li>
                <li>
                  When the target is met, tap <strong>Raise credit note</strong> to start tracking what the supplier owes.
                  When the supplier issues the credit note, tap <strong>Record receipt</strong>.
                </li>
              </ul>
              <p>If sales change after you raised the note (a late bill or return), you will see an “Update expected” prompt.</p>
            </InfoTip>
          </div>

          {monthlyReport.length === 0 ? (
            <Card>
              <CardContent className="text-center text-sm text-slate-500 py-8">
                No monthly volume-incentive schemes yet. Create a Type C scheme to see it here.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card noPadding className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Sold</TableHead>
                      <TableHead className="text-right">Rate/cs</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyReport.map((r) => {
                      const note = noteForRow(r);
                      return (
                        <TableRow key={`${r.schemeId}_${r.period}`}>
                          <TableCell className="font-medium text-slate-900">{r.supplierName}</TableCell>
                          <TableCell className="text-xs max-w-[200px]">{r.productName}</TableCell>
                          <TableCell>{r.period}</TableCell>
                          <TableCell className="text-right">{r.targetQuantity.toLocaleString('en-IN')}</TableCell>
                          <TableCell className={`text-right ${r.achieved ? 'text-emerald-600 font-medium' : ''}`}>
                            {r.actualEligibleQty.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-right">{inr(r.incentiveRate)}</TableCell>
                          <TableCell className="text-right">{inr(r.expectedCredit)}</TableCell>
                          <TableCell className="text-right">{inr(r.creditReceived)}</TableCell>
                          <TableCell>{statusBadge(r.status)}</TableCell>
                          <TableCell className="text-right">
                            {r.achieved && !note && (
                              <Button size="sm" variant="outline" leftIcon={<FilePlus2 className="w-3.5 h-3.5" />} onClick={() => raiseMonthlyNote(r)}>
                                Raise credit note
                              </Button>
                            )}
                            {note && note.status !== 'settled' && (
                              <Button size="sm" variant="outline" leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => openReceipt(note)}>
                                Record receipt
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2.5">
                {monthlyReport.map((r) => {
                  const note = noteForRow(r);
                  const drift = note && Math.abs(note.expectedAmount - r.expectedCredit) > 0.5;
                  const pct = r.targetQuantity > 0 ? Math.min(100, Math.round((r.actualEligibleQty / r.targetQuantity) * 100)) : 0;
                  return (
                    <div key={`${r.schemeId}_${r.period}`} className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900 break-words">{r.productName}</p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {r.supplierName} · {r.period}
                          </p>
                        </div>
                        {statusBadge(r.status)}
                      </div>

                      <div className="mt-3">
                        <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                          <span>
                            Sold{' '}
                            <strong className={r.achieved ? 'text-emerald-700' : 'text-slate-800'}>
                              {r.actualEligibleQty.toLocaleString('en-IN')} cs
                            </strong>
                          </span>
                          <span>Target {r.targetQuantity.toLocaleString('en-IN')} cs</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                          <div className={`h-full rounded-full ${r.achieved ? 'bg-emerald-500' : 'bg-sky-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 mt-3">
                        <Stat label={`@ ${inr(r.incentiveRate)}/cs`} value={inr(r.expectedCredit)} />
                        <Stat label="Received" value={inr(r.creditReceived)} tone="good" />
                        <Stat label="Outstanding" value={inr(r.outstandingCredit)} tone={r.outstandingCredit > 0 ? 'warn' : 'default'} />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-2">
                        {r.calculationMethod === 'excess_only' ? 'Paid on cases above target only' : 'Paid on all cases once target is met'}
                      </p>

                      {drift && note && (
                        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2">
                          <p className="text-[11px] text-amber-900 leading-snug min-w-0">
                            Sales changed since the credit note was raised. Expected is now <strong>{inr(r.expectedCredit)}</strong> (note says{' '}
                            {inr(note.expectedAmount)}).
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 shrink-0 bg-white"
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                            onClick={() => updateSupplierCreditNote(note.id, { expectedAmount: r.expectedCredit })}
                          >
                            Update
                          </Button>
                        </div>
                      )}

                      {r.achieved && !note && (
                        <Button size="sm" variant="outline" className="w-full h-10 mt-3" leftIcon={<FilePlus2 className="w-4 h-4" />} onClick={() => raiseMonthlyNote(r)}>
                          Raise credit note
                        </Button>
                      )}
                      {note && note.status !== 'settled' && (
                        <Button size="sm" variant="outline" className="w-full h-10 mt-3" leftIcon={<CheckCircle2 className="w-4 h-4" />} onClick={() => openReceipt(note)}>
                          Record receipt
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODALS                                                             */}
      {/* ------------------------------------------------------------------ */}

      {/* Create / Edit Scheme */}
      <Modal
        isOpen={schemeModalOpen}
        onClose={() => setSchemeModalOpen(false)}
        title={editingSchemeId ? 'Edit supplier scheme' : 'New supplier scheme'}
        maxWidth="lg"
        footer={
          <div className="grid grid-cols-2 gap-2.5 w-full sm:flex sm:w-auto">
            <Button variant="secondary" className="h-11 sm:h-9" onClick={() => setSchemeModalOpen(false)}>
              Cancel
            </Button>
            <Button className="h-11 sm:h-9" onClick={saveScheme}>
              Save scheme
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field
            label="Scheme type"
            infoTitle="Scheme types"
            info={
              <>
                <p>
                  <strong>Type A – Free goods:</strong> attach to a GRN line during Add stock to record the extra free
                  cases received. They are added on top of the invoiced quantity and never overlap with the invoice’s own
                  scheme discount.
                </p>
                <p>
                  <strong>Type B – Pending credit note:</strong> attach to a GRN line to flag a future credit. The GRN stays
                  unchanged; a credit note is created for you to track and record when the supplier issues it.
                </p>
                <p>
                  <strong>Type C – Monthly volume incentive:</strong> not attached to a GRN. The supplier pays ₹ per case
                  when your monthly sales of the selected products reach the target.
                </p>
              </>
            }
          >
            <select
              className={inputCls}
              value={form.schemeType}
              onChange={(e) => setForm({ ...form, schemeType: e.target.value as SupplierSchemeType })}
            >
              <option value="free_goods">{SCHEME_TYPE_LABEL.free_goods}</option>
              <option value="pending_credit">{SCHEME_TYPE_LABEL.pending_credit}</option>
              <option value="volume_incentive">{SCHEME_TYPE_LABEL.volume_incentive}</option>
            </select>
          </Field>

          <Field label="Supplier name">
            <input
              className={inputCls}
              list="supplier-names"
              value={form.supplierName}
              onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
              placeholder="e.g. Campa Distributors"
              autoComplete="off"
            />
            <datalist id="supplier-names">
              {supplierNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>

          <Field label="Scheme name">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. 10+1 Free — Power Up 150ml"
            />
          </Field>

          <Field
            label={`Products (${form.productIds.length} selected)`}
            infoTitle="Products"
            info="Pick every product this scheme covers. For a monthly incentive the target is counted across all the selected products together."
          >
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                className={`${inputCls} pl-9`}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products"
              />
            </div>
            <div className="border border-slate-200 rounded-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-slate-500 p-3">No products match.</p>
              ) : (
                filteredProducts.map((p) => {
                  const checked = form.productIds.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-3 px-3 min-h-[44px] cursor-pointer active:bg-slate-50">
                      <input
                        type="checkbox"
                        className="w-5 h-5 shrink-0 accent-slate-900"
                        checked={checked}
                        onChange={() => toggleProduct(p.id)}
                      />
                      <span className="text-sm text-slate-800 break-words min-w-0">{p.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input type="date" className={inputCls} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
            <Field label="End date" info="Leave empty for an open-ended scheme." infoTitle="End date">
              <input
                type="date"
                className={inputCls}
                value={form.endDate || ''}
                onChange={(e) => setForm({ ...form, endDate: e.target.value || undefined })}
              />
            </Field>
          </div>

          {form.schemeType === 'volume_incentive' && (
            <div className="space-y-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly target (cases)">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    className={inputCls}
                    value={form.targetQuantity ?? ''}
                    onChange={(e) => setForm({ ...form, targetQuantity: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </Field>
                <Field label="Rate (₹ per case)">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    className={inputCls}
                    value={form.incentiveRate ?? ''}
                    onChange={(e) => setForm({ ...form, incentiveRate: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </Field>
              </div>
              <Field
                label="Calculation method"
                infoTitle="Calculation method"
                info={
                  <>
                    <p>
                      <strong>All eligible cases:</strong> once the target is reached, the rate is paid on every case sold.
                      Example: target 1000, sold 1200, ₹10 → 1200 × 10 = ₹12,000.
                    </p>
                    <p>
                      <strong>Excess cases only:</strong> the rate is paid only on cases above the target. Same example →
                      (1200 − 1000) × 10 = ₹2,000.
                    </p>
                  </>
                }
              >
                <select
                  className={inputCls}
                  value={form.calculationMethod}
                  onChange={(e) => setForm({ ...form, calculationMethod: e.target.value as SupplierIncentiveCalcMethod })}
                >
                  <option value="all_eligible">All eligible cases</option>
                  <option value="excess_only">Excess cases only</option>
                </select>
              </Field>
            </div>
          )}

          <div className="flex items-center gap-3 min-h-[44px]">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-5 h-5 accent-slate-900"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span className="text-sm font-medium text-slate-700">Active</span>
            </label>
            <InfoTip size="sm" title="Active">
              Only active Type A / B schemes appear in the GRN “Supplier scheme” dropdown. Switch a scheme off when the
              offer ends — nothing already recorded is changed.
            </InfoTip>
          </div>

          <Field label="Notes">
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              rows={2}
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          {formError && (
            <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
        </div>
      </Modal>

      {/* Record receipt */}
      <Modal
        isOpen={!!receiptNote}
        onClose={() => setReceiptNote(null)}
        title="Record credit note receipt"
        subtitle={receiptNote ? `${receiptNote.supplierName} · Expected ${inr(receiptNote.expectedAmount)}` : ''}
        footer={
          <div className="grid grid-cols-2 gap-2.5 w-full sm:flex sm:w-auto">
            <Button variant="secondary" className="h-11 sm:h-9" onClick={() => setReceiptNote(null)}>
              Cancel
            </Button>
            <Button className="h-11 sm:h-9" onClick={submitReceipt} disabled={!(Number(receiptAmount) > 0)}>
              Save receipt
            </Button>
          </div>
        }
      >
        {receiptNote && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-1.5">
              <Stat label="Expected" value={inr(receiptNote.expectedAmount)} />
              <Stat label="Received so far" value={inr(receiptNote.actualAmount)} tone="good" />
              <Stat
                label="Outstanding"
                value={inr(Math.max(0, receiptNote.expectedAmount - receiptNote.actualAmount))}
                tone="warn"
              />
            </div>
            <Field
              label="Credit note number"
              infoTitle="Receipt"
              info="Expected value is preserved permanently. This only records what the supplier actually credited, and it is added to anything already received."
            >
              <input className={inputCls} value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} placeholder="e.g. CN-2026-001" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount received now (₹)">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  className={inputCls}
                  value={receiptAmount}
                  onChange={(e) => setReceiptAmount(e.target.value)}
                />
              </Field>
              <Field label="Credit note date">
                <input type="date" className={inputCls} value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit credit note */}
      <Modal
        isOpen={!!editingNote}
        onClose={() => setEditingNote(null)}
        title="Edit supplier credit note"
        subtitle={editingNote ? editingNote.supplierName : ''}
        footer={
          <div className="grid grid-cols-2 gap-2.5 w-full sm:flex sm:w-auto">
            <Button variant="secondary" className="h-11 sm:h-9" onClick={() => setEditingNote(null)}>
              Cancel
            </Button>
            <Button className="h-11 sm:h-9" onClick={saveEditedNote}>
              Save changes
            </Button>
          </div>
        }
      >
        {editingNote && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expected (₹)" info="Use only to correct a wrong expected value. Normal receipts go through “Record receipt”." infoTitle="Expected amount">
                <input type="number" inputMode="decimal" min="0" className={inputCls} value={editExpectedAmount} onChange={(e) => setEditExpectedAmount(e.target.value)} />
              </Field>
              <Field label="Received (₹)">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  className={`${inputCls} font-semibold text-emerald-800`}
                  value={editActualAmount}
                  onChange={(e) => setEditActualAmount(e.target.value)}
                />
              </Field>
              <Field label="Credit note no.">
                <input className={inputCls} value={editCnNumber} onChange={(e) => setEditCnNumber(e.target.value)} placeholder="e.g. CN-2026-001" />
              </Field>
              <Field label="Credit note date">
                <input type="date" className={inputCls} value={editCnDate} onChange={(e) => setEditCnDate(e.target.value)} />
              </Field>
            </div>

            {Number(editActualAmount) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <p className="text-xs text-amber-900">Need to re-open this credit note?</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 w-full border-amber-300 text-amber-900 bg-white"
                  onClick={() => setEditActualAmount('0')}
                >
                  Reset received to ₹0
                </Button>
              </div>
            )}

            <Field label="Notes">
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                rows={2}
                value={editCnNotes}
                onChange={(e) => setEditCnNotes(e.target.value)}
              />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) deleteSupplierScheme(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        title="Delete supplier scheme"
        message={`Delete "${deleteConfirm?.name}"?${
          deleteConfirm && deleteConfirm.used > 0 ? ` It is used on ${deleteConfirm.used} GRN line(s).` : ''
        } GRN lines and credit notes already linked to it keep their recorded quantities and amounts — only the reusable scheme setup is removed.`}
        confirmButtonLabel="Delete"
        variant="danger"
      />

      <ConfirmModal
        isOpen={!!deleteNoteConfirm}
        onClose={() => setDeleteNoteConfirm(null)}
        onConfirm={() => {
          if (deleteNoteConfirm) deleteSupplierCreditNote(deleteNoteConfirm.id);
          setDeleteNoteConfirm(null);
        }}
        title="Delete supplier credit note"
        message={
          deleteNoteConfirm
            ? `Permanently delete credit note "${deleteNoteConfirm.creditNoteNumber || deleteNoteConfirm.id}" from ${deleteNoteConfirm.supplierName} (expected ${inr(deleteNoteConfirm.expectedAmount)}, received ${inr(deleteNoteConfirm.actualAmount)})? This removes the record.`
            : 'Delete this credit note?'
        }
        confirmButtonLabel="Delete note"
        variant="danger"
      />
    </div>
  );
};
