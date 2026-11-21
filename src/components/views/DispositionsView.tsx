import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit2,
  FileWarning,
  Gift,
  Package,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useLedger } from '../../context/LedgerContext';
import {
  DispositionCompensationStatus,
  InventoryDisposition,
  InventoryDispositionType,
} from '../../types';
import { money } from '../../utils/billing';
import { daysOpen, exportGstrCnCsv, printDispositionClaimVoucher } from '../../utils/dispositionCn';
import { sortBatchesFefo } from '../../utils/fefo';
import { ExpiryReturnsTracker, trackedStage } from './ExpiryReturnsTracker';
import { CustomerReturnsList } from './CustomerReturnsList';
import { CustomerReturnLauncher } from '../common/CustomerReturnLauncher';
import { SizeChip } from '../common/SizeChip';
import { InfoTip } from "../common/InfoTip";
import { ConfirmModal } from "../ui/ConfirmModal";
import { todayISO } from "../../utils/dateLocal";
import { writeOffNetForPeriod } from '../../utils/pnlBridge';

const TYPE_OPTIONS: { id: InventoryDispositionType; label: string; group: string }[] = [
  { id: 'expiry_return', label: 'Expiry return to supplier', group: 'Return' },
  { id: 'quality_return', label: 'Quality / damage return', group: 'Return' },
  { id: 'invoice_error_return', label: 'Invoice error return', group: 'Return' },
  { id: 'return_to_supplier', label: 'Send back to supplier', group: 'Return' },
  { id: 'return_to_company', label: 'Send back to company', group: 'Return' },
  { id: 'free_near_expiry', label: 'Free near-expiry distribution', group: 'Free' },
  { id: 'scheme_free_issue', label: 'Scheme free issue (non-invoice)', group: 'Free' },
  { id: 'expired_writeoff', label: 'Expired write-off', group: 'Write-off' },
  { id: 'damage_writeoff', label: 'Damage write-off', group: 'Write-off' },
];

function needsCompensation(t: InventoryDispositionType) {
  return [
    'expiry_return',
    'quality_return',
    'invoice_error_return',
    'return_to_supplier',
    'return_to_company',
  ].includes(t);
}

function isFreeIssue(t: InventoryDispositionType) {
  return t === 'free_near_expiry' || t === 'scheme_free_issue';
}

const today = () => todayISO();

const fmtPhoneRupees = (val: number) => {
  const n = Math.abs(Number(val) || 0);
  if (n >= 100000) return `₹${(n / 100000).toFixed(2).replace(/\.00$/, '')}L`;
  if (n >= 10000) return `₹${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `₹${money(n)}`;
};

export interface DispositionsViewProps {
  selectedWarehouseFilter?: string;
  onChangeWarehouseFilter?: (whId: string) => void;
}

export const DispositionsView: React.FC<DispositionsViewProps> = ({
  selectedWarehouseFilter,
  onChangeWarehouseFilter,
}) => {
  const isPhone = useIsMobile(767);
  const {
    products,
    warehouses,
    inventoryBatches,
    grns,
    inventoryDispositions,
    addInventoryDisposition,
    deleteInventoryDisposition,
    updateInventoryDisposition,
    recordDispositionCompensation,
    supplierCreditNotes,
    deleteSupplierCreditNote,
    remainingStock,
    warehouseStock,
    setTab,
    orgProfile,
    notify,
  } = useLedger();

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open_claims' | 'settled' | 'writeoff'>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<string>(selectedWarehouseFilter || 'all');
  const [msg, setMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: any; settled: boolean; stockApplied: boolean } | null>(null);

  // Phone UI sheet / expansion state
  const [showPhoneTypeSheet, setShowPhoneTypeSheet] = useState(false);
  const [showPhoneWhSheet, setShowPhoneWhSheet] = useState(false);
  const [expandedPhoneLedgerId, setExpandedPhoneLedgerId] = useState<string | null>(null);
  const [decideTarget, setDecideTarget] = useState<InventoryDisposition | null>(null);
  const [decideChoice, setDecideChoice] = useState<'company' | 'scrap' | 'discard' | 'later'>('company');
  const [decideHandedDate, setDecideHandedDate] = useState(today());
  const [decideRef, setDecideRef] = useState('');
  const [phoneAttachment, setPhoneAttachment] = useState('');
  const [cnLinkGrnId, setCnLinkGrnId] = useState('');

  useEffect(() => {
    if (selectedWarehouseFilter !== undefined && selectedWarehouseFilter !== warehouseFilter) {
      setWarehouseFilter(selectedWarehouseFilter);
    }
  }, [selectedWarehouseFilter, warehouseFilter]);

  const setWhFilter = (whId: string) => {
    setWarehouseFilter(whId);
    onChangeWarehouseFilter?.(whId);
  };

  // Form state
  const [dispositionType, setDispositionType] = useState<InventoryDispositionType>('expiry_return');
  const [productId, setProductId] = useState<number | ''>('');
  const [warehouseId, setWarehouseId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [eventDate, setEventDate] = useState(today());
  const [reason, setReason] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [grnId, setGrnId] = useState('');
  const [distributedToName, setDistributedToName] = useState('');
  const [distributedToPhone, setDistributedToPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [referenceDocNo, setReferenceDocNo] = useState('');
  /** When false: document/claim only — does NOT reduce godown stock. */
  const [reduceStock, setReduceStock] = useState(true);
  /** Supplier compensation scheme asked for on the claim / CN */
  const [claimScheme, setClaimScheme] = useState<'none' | 'value_credit' | 'discount_pct' | 'free_bogo' | 'near_expiry_swap'>('none');
  const [schemeBuyQty, setSchemeBuyQty] = useState<number | ''>(1);
  const [schemeFreeQty, setSchemeFreeQty] = useState<number | ''>(1);
  const [schemeDiscountPct, setSchemeDiscountPct] = useState<number | ''>('');
  const [cnScheme, setCnScheme] = useState<'none' | 'value_credit' | 'discount_pct' | 'free_bogo' | 'near_expiry_swap'>('none');
  const [cnSchemeNote, setCnSchemeNote] = useState('');
  const [cnAttachment, setCnAttachment] = useState('');
  const [appendPayment, setAppendPayment] = useState(false);
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [showMultiCn, setShowMultiCn] = useState(false);
  const [multiCnNo, setMultiCnNo] = useState('');
  const [multiCnDate, setMultiCnDate] = useState(today());
  const [multiCnTotal, setMultiCnTotal] = useState<number | ''>('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [freeGoodsPrompt, setFreeGoodsPrompt] = useState<{ productName?: string; note?: string } | null>(null);

  // Compensation modal
  const [compId, setCompId] = useState<string | null>(null);
  const [cnNo, setCnNo] = useState('');
  const [cnDate, setCnDate] = useState(today());
  const [cnTaxable, setCnTaxable] = useState<number | ''>('');
  const [cnCgst, setCnCgst] = useState<number | ''>('');
  const [cnSgst, setCnSgst] = useState<number | ''>('');
  const [cnIgst, setCnIgst] = useState<number | ''>('');
  const [compAmt, setCompAmt] = useState<number | ''>('');
  const [claimVal, setClaimVal] = useState<number | ''>('');

  const batchesForSelection = useMemo(() => {
    if (!productId || !warehouseId) return [];
    return sortBatchesFefo(inventoryBatches, {
      productId: Number(productId),
      warehouseId,
    });
  }, [inventoryBatches, productId, warehouseId]);

  /** Products that still have remaining cases in the selected godown (warehouse → product). */
  const productsInWarehouse = useMemo(() => {
    if (!warehouseId) return [] as { id: number; name: string; stock: number }[];
    return products
      .map((p) => ({
        id: p.id,
        name: p.name,
        stock: Math.max(0, Number(warehouseStock(warehouseId, p.id)) || 0),
      }))
      .filter((row) => row.stock > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [warehouseId, products, warehouseStock, inventoryBatches, inventoryDispositions]);

  const selectedBatch = batchesForSelection.find((b) => b.id === batchId);
  const selectedProduct = products.find((p) => p.id === productId);
  const costPer =
    selectedBatch?.effectiveCostPrice ??
    selectedBatch?.costPrice ??
    selectedProduct?.effectiveCost ??
    selectedProduct?.cost ??
    0;

  const resetForm = () => {
    setDispositionType('expiry_return');
    setProductId('');
    setWarehouseId('');
    setBatchId('');
    setQuantity('');
    setEventDate(today());
    setReason('');
    setSupplierName('');
    setSupplierInvoiceNo('');
    setGrnId('');
    setDistributedToName('');
    setDistributedToPhone('');
    setNotes('');
    setReferenceDocNo('');
    setReduceStock(true);
    setClaimScheme('none');
    setSchemeBuyQty(1);
    setSchemeFreeQty(1);
    setSchemeDiscountPct('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !warehouseId || !quantity) {
      setMsg('Product, warehouse and quantity are required');
      return;
    }
    const wh = warehouses.find((w) => w.id === warehouseId);
    const qty = Number(quantity);
    const result = addInventoryDisposition({
      dispositionType,
      productId: Number(productId),
      productName: selectedProduct?.name,
      warehouseId,
      warehouseName: wh?.name,
      batchId: batchId || undefined,
      batchNumber: selectedBatch?.batchNumber,
      expiryDate: selectedBatch?.expiryDate,
      quantity: qty,
      unit: 'case',
      costPerUnit: Number(costPer) || 0,
      supplierName: supplierName || selectedBatch?.supplierName || undefined,
      grnId: grnId || undefined,
      supplierInvoiceNo: supplierInvoiceNo || selectedBatch?.supplierInvoiceNo || undefined,
      compensationStatus: needsCompensation(dispositionType) ? 'pending' : 'not_applicable',
      distributedToName: isFreeIssue(dispositionType) ? distributedToName || undefined : undefined,
      distributedToPhone: isFreeIssue(dispositionType) ? distributedToPhone || undefined : undefined,
      reason: reason || TYPE_OPTIONS.find((t) => t.id === dispositionType)?.label || '',
      notes: (() => {
        const bits: string[] = [];
        if (notes) bits.push(notes);
        if (claimScheme === 'free_bogo') {
          bits.push(`Supplier scheme: Buy ${schemeBuyQty || 1} Get ${schemeFreeQty || 1} free (claim)`);
        } else if (claimScheme === 'discount_pct') {
          bits.push(`Supplier scheme: ${schemeDiscountPct || 0}% value credit on CN`);
        } else if (claimScheme === 'near_expiry_swap') {
          bits.push('Supplier scheme: free near-expiry replacement / swap requested');
        } else if (claimScheme === 'value_credit') {
          bits.push('Supplier scheme: full value credit note requested');
        }
        if (!reduceStock) bits.push('Document only — stock not reduced');
        return bits.length ? bits.join(' · ') : undefined;
      })(),
      referenceDocNo: referenceDocNo || undefined,
      eventDate,
      stockApplied: reduceStock,
      approvalStatus: requireApproval ? 'pending_approval' : 'not_required',
      claimScheme: claimScheme !== 'none' ? claimScheme : undefined,
    } as any);
    if (!result.ok) {
      setMsg('error' in result ? result.error : 'Failed to record disposition');
      return;
    }
    setMsg(
      reduceStock
        ? `Saved. Stock reduced by ${qty} case(s).`
        : `Saved as document only — stock NOT reduced (${qty} case(s) recorded).`
    );

    if (claimScheme === 'free_bogo' || claimScheme === 'near_expiry_swap') {
      setFreeGoodsPrompt({
        productName: selectedProduct?.name,
        note: claimScheme === 'free_bogo' ? `Buy ${schemeBuyQty || 1} Get ${schemeFreeQty || 1}` : 'near-expiry swap',
      });
    }
    setShowForm(false);
    resetForm();
    setTimeout(() => setMsg(null), 4000);
  };

  const filtered = useMemo(() => {
    let rows = inventoryDispositions;
    if (typeFilter !== 'all') rows = rows.filter((r) => r.dispositionType === typeFilter);
    if (warehouseFilter !== 'all') rows = rows.filter((r) => r.warehouseId === warehouseFilter);
    if (statusFilter === 'open_claims') {
      rows = rows.filter((r) => r.compensationStatus === 'pending' || r.compensationStatus === 'partial');
    } else if (statusFilter === 'settled') {
      rows = rows.filter((r) => r.compensationStatus === 'settled');
    } else if (statusFilter === 'writeoff') {
      rows = rows.filter((r) => r.compensationStatus === 'not_applicable' || r.compensationStatus === 'rejected');
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.productName || '').toLowerCase().includes(q) ||
          (r.supplierName || '').toLowerCase().includes(q) ||
          (r.batchNumber || '').toLowerCase().includes(q) ||
          (r.creditNoteNumber || '').toLowerCase().includes(q) ||
          (r.distributedToName || '').toLowerCase().includes(q) ||
          (r.warehouseName || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [inventoryDispositions, typeFilter, warehouseFilter, statusFilter, search]);

  const ledgerStats = useMemo(() => {
    const open = inventoryDispositions.filter(
      (r) => r.compensationStatus === 'pending' || r.compensationStatus === 'partial',
    );
    const openValue = open.reduce(
      (s, r) => s + Math.max(0, (Number(r.costValue) || 0) - (Number(r.compensatedAmount) || 0)),
      0,
    );
    const settledRows = inventoryDispositions.filter((r) => r.compensationStatus === 'settled');
    const net = writeOffNetForPeriod(inventoryDispositions);
    const totalCases = inventoryDispositions.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const hasCnExport = inventoryDispositions.some((r) => r.creditNoteNumber || Number(r.compensatedAmount) > 0);
    return {
      count: inventoryDispositions.length,
      totalCases,
      openCount: open.length,
      openValue,
      settledCount: settledRows.length,
      recovered: net.recovered,
      netLoss: net.net,
      hasCnExport,
    };
  }, [inventoryDispositions]);

  const openClaims = inventoryDispositions.filter((r) =>
    r.compensationStatus === 'pending' || r.compensationStatus === 'partial'
  );

  const agedClaims = useMemo(() => {
    return openClaims
      .map((r) => ({ row: r, days: daysOpen(r.eventDate) }))
      .filter((x) => x.days >= 30)
      .sort((a, b) => b.days - a.days);
  }, [openClaims]);

  const selectedClaims = useMemo(
    () => inventoryDispositions.filter((r) => selectedClaimIds.includes(r.id)),
    [inventoryDispositions, selectedClaimIds]
  );

  const toggleClaimSelect = (id: string) => {
    setSelectedClaimIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submitMultiCn = () => {
    if (selectedClaims.length === 0) {
      setMsg('Select at least one open claim');
      return;
    }
    const suppliers = new Set(selectedClaims.map((r) => (r.supplierName || '').trim().toLowerCase()).filter(Boolean));
    if (suppliers.size > 1) {
      setMsg('Multi-line CN requires all selected claims to share the same supplier');
      return;
    }
    if (!multiCnNo.trim()) {
      setMsg('Enter credit note number');
      return;
    }
    const claimSum = selectedClaims.reduce((s, r) => s + (Number(r.costValue) || 0), 0);
    const total = Number(multiCnTotal) > 0 ? Number(multiCnTotal) : claimSum;
    if (total <= 0) {
      setMsg('CN total must be greater than zero');
      return;
    }
    // Allocate proportionally by claim value
    let allocated = 0;
    selectedClaims.forEach((r, idx) => {
      const share =
        idx === selectedClaims.length - 1
          ? Math.max(0, total - allocated)
          : claimSum > 0
            ? Math.round(((Number(r.costValue) || 0) / claimSum) * total * 100) / 100
            : Math.round((total / selectedClaims.length) * 100) / 100;
      allocated += share;
      const taxable = share;
      recordDispositionCompensation(r.id, {
        compensatedAmount: share,
        creditNoteNumber: multiCnNo.trim(),
        creditNoteDate: multiCnDate || undefined,
        cnTaxableValue: taxable,
        cnTotal: share,
        notes: `Multi-line CN ${multiCnNo.trim()} (${selectedClaims.length} lines)`,
        appendPayment: false,
      });
    });
    setShowMultiCn(false);
    setSelectedClaimIds([]);
    setMultiCnNo('');
    setMultiCnTotal('');
    setMsg(`Multi-line CN ${multiCnNo.trim()} applied to ${selectedClaims.length} claim(s)`);
    setTimeout(() => setMsg(null), 4000);
  };

  const submitCompensation = () => {
    if (!compId) return;
    const taxable = Number(cnTaxable) || 0;
    const cgst = Number(cnCgst) || 0;
    const sgst = Number(cnSgst) || 0;
    const igst = Number(cnIgst) || 0;
    const computed = taxable + cgst + sgst + igst;
    const total = Number(compAmt) || computed;
    if (!cnNo.trim()) {
      setMsg('Enter the supplier credit note number');
      return;
    }
    if (total <= 0) {
      setMsg('Credit note amount must be greater than zero');
      return;
    }
    if (igst > 0 && (cgst > 0 || sgst > 0)) {
      setMsg('Use either IGST or CGST+SGST on a credit note, not both');
      return;
    }
    if (computed > 0 && Math.abs(computed - total) > 1) {
      setMsg(`Taxable + GST (₹${money(computed)}) does not match CN total (₹${money(total)})`);
      return;
    }
    const dup = supplierCreditNotes.find(
      (n) =>
        (n.creditNoteNumber || '').trim().toLowerCase() === cnNo.trim().toLowerCase() &&
        !(n.notes || '').includes(`Linked disposition ${compId}`) &&
        (n.supplierName || '').trim().toLowerCase() === (inventoryDispositions.find((d) => d.id === compId)?.supplierName || '').trim().toLowerCase()
    );
    if (dup) {
      setMsg(`CN ${cnNo.trim()} is already recorded for this supplier`);
      return;
    }
    const schemeBits: string[] = [];
    if (cnScheme === 'free_bogo') schemeBits.push('CN scheme: free goods / BOGO');
    if (cnScheme === 'discount_pct') schemeBits.push('CN scheme: discount %');
    if (cnScheme === 'near_expiry_swap') schemeBits.push('CN scheme: near-expiry swap');
    if (cnScheme === 'value_credit') schemeBits.push('CN scheme: full value credit');
    if (cnSchemeNote.trim()) schemeBits.push(cnSchemeNote.trim());
    const target = inventoryDispositions.find((d) => d.id === compId);
    recordDispositionCompensation(compId, {
      compensatedAmount: total,
      creditNoteNumber: cnNo.trim(),
      creditNoteDate: cnDate || undefined,
      cnTaxableValue: taxable,
      cnCgst: cgst,
      cnSgst: sgst,
      cnIgst: igst,
      cnTotal: total,
      costValue: Number(claimVal) > 0 ? Number(claimVal) : undefined,
      notes: schemeBits.length ? schemeBits.join(' · ') : undefined,
      appendPayment: appendPayment,
      paymentNote: appendPayment ? `Partial receipt ${cnNo.trim()}` : undefined,
      attachmentRef: cnAttachment.trim() || undefined,
    });
    if (cnLinkGrnId && cnLinkGrnId !== target?.grnId) {
      updateInventoryDisposition(compId, { grnId: cnLinkGrnId });
    }
    if (cnScheme === 'free_bogo' || cnScheme === 'near_expiry_swap') {
      setFreeGoodsPrompt({
        productName: target?.productName,
        note: cnSchemeNote || cnScheme,
      });
    }
    setCompId(null);
    setAppendPayment(false);
    setCnAttachment('');
    setMsg(appendPayment ? 'Partial CN payment logged' : 'Credit note / compensation recorded');
    setTimeout(() => setMsg(null), 3000);
  };

  const openCnPanel = (r: InventoryDisposition) => {
    setCompId(r.id);
    setCnNo(r.creditNoteNumber || '');
    setCnDate(r.creditNoteDate || today());
    setCnTaxable(r.cnTaxableValue || '');
    setCnCgst(r.cnCgst || '');
    setCnSgst(r.cnSgst || '');
    setCnIgst(r.cnIgst || '');
    setCompAmt(r.compensationStatus === 'partial' ? '' : (r.compensatedAmount || r.costValue || ''));
    setClaimVal(r.costValue || '');
    setAppendPayment(r.compensationStatus === 'partial');
    setCnAttachment(r.attachmentRef || '');
    const validSchemes: Array<typeof cnScheme> = ['none', 'value_credit', 'discount_pct', 'free_bogo', 'near_expiry_swap'];
    setCnScheme(validSchemes.includes(r.claimScheme as typeof cnScheme) ? (r.claimScheme as typeof cnScheme) : 'value_credit');
    setCnLinkGrnId(r.grnId || '');
  };

  const reopenClaim = (id: string) => {
    // Remove the mirrored supplier CN first so "CN received" stops counting it.
    supplierCreditNotes
      .filter((n) => (n.notes || '').includes(`Linked disposition ${id}`))
      .forEach((n) => deleteSupplierCreditNote(n.id));
    updateInventoryDisposition(id, {
      compensationStatus: 'pending',
      compensatedAmount: 0,
      compensatedAt: undefined,
      creditNoteNumber: undefined,
      creditNoteDate: undefined,
      cnTaxableValue: 0,
      cnCgst: 0,
      cnSgst: 0,
      cnIgst: 0,
      cnTotal: 0,
      compensationPayments: [],
    });
    setCompId(null);
    setMsg('Claim reopened and reset to pending');
    setTimeout(() => setMsg(null), 3000);
  };

  const statusBadge = (s: DispositionCompensationStatus) => {
    const map: Record<string, string> = {
      not_applicable: 'bg-slate-100 text-slate-600 border-slate-200',
      pending: 'bg-amber-50 text-amber-800 border-amber-200',
      partial: 'bg-sky-50 text-sky-800 border-sky-200',
      settled: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      rejected: 'bg-rose-50 text-rose-800 border-rose-200',
    };
    return map[s] || map.not_applicable;
  };

  const confirmPhoneDecide = () => {
    if (!decideTarget || !decideTarget.returnTracking) return;
    const rt = decideTarget.returnTracking;
    if (decideChoice === 'company') {
      const sentDate = decideHandedDate || today();
      updateInventoryDisposition(decideTarget.id, {
        dispositionType: 'expiry_return',
        compensationStatus: decideTarget.compensationStatus === 'partial' ? 'partial' : 'pending',
        returnTracking: {
          ...rt,
          decision: 'company',
          stage: 'sent',
          sentOn: sentDate,
          sentRef: decideRef.trim() || rt.sentRef,
          log: [
            ...rt.log,
            {
              date: today(),
              stage: 'sent',
              note: `Handed to company on ${sentDate}${decideRef.trim() ? ` (${decideRef.trim()})` : ''}`,
            },
          ],
        },
      });
      notify('Sent to company claim created. Record credit note once received.');
    } else if (decideChoice === 'scrap') {
      updateInventoryDisposition(decideTarget.id, {
        dispositionType: 'expired_writeoff',
        compensationStatus: 'not_applicable',
        returnTracking: {
          ...rt,
          decision: 'discard',
          stage: 'discarded',
          discardedOn: today(),
          discardMethod: 'Scrapped — stock written off',
          log: [...rt.log, { date: today(), stage: 'discarded', note: 'Scrapped (stock written off)' }],
        },
      });
      notify(`Scrapped. ₹${money(decideTarget.costValue)} recorded as write-off.`);
    } else if (decideChoice === 'discard') {
      updateInventoryDisposition(decideTarget.id, {
        dispositionType: 'expired_writeoff',
        compensationStatus: 'not_applicable',
        returnTracking: {
          ...rt,
          decision: 'discard',
          stage: 'discarded',
          discardedOn: today(),
          discardMethod: 'Thrown out — disposed, no claim',
          log: [...rt.log, { date: today(), stage: 'discarded', note: 'Thrown out — no claim' }],
        },
      });
      notify(`Thrown out. ₹${money(decideTarget.costValue)} recorded as loss.`);
    } else {
      updateInventoryDisposition(decideTarget.id, {
        compensationStatus: 'not_applicable',
        returnTracking: {
          ...rt,
          decision: 'undecided',
          stage: 'held',
          log: [...rt.log, { date: today(), stage: 'held', note: 'Kept pending to decide later' }],
        },
      });
      notify('Kept pending under customer returns.');
    }
    setDecideTarget(null);
    setDecideRef('');
  };

  if (isPhone) {
    const whLabel =
      warehouseFilter === 'all'
        ? 'All godowns'
        : warehouses.find((w) => w.id === warehouseFilter)?.name || 'Godown';
    const typeLabel =
      typeFilter === 'all'
        ? 'All types'
        : TYPE_OPTIONS.find((t) => t.id === typeFilter)?.label || typeFilter;

    const phonePendingCustomerReturns = filtered.filter(
      (r) => !!r.returnTracking && trackedStage(r) === 'held'
    );
    const phoneLedgerRows = filtered.filter(
      (r) => !(!!r.returnTracking && trackedStage(r) === 'held')
    );

    const phoneNetStats = writeOffNetForPeriod(filtered);
    const phoneCasesCount = filtered.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

    const targetCompRow = compId ? inventoryDispositions.find((d) => d.id === compId) : undefined;
    const compComputed = (Number(cnTaxable) || 0) + (Number(cnCgst) || 0) + (Number(cnSgst) || 0) + (Number(cnIgst) || 0);
    const compFinalTotal = Number(compAmt) || compComputed || Number(targetCompRow?.costValue || 0);

    return (
      <div className="space-y-3 hh-inv-pb">
        {msg && (
          <div className="hh-inv-card hh-inv-card--alert-blue flex items-center gap-2 text-[13px] font-bold text-[#101D3A]">
            <CheckCircle2 size={16} className="text-[#16A34A] shrink-0" />
            <span className="flex-1">{msg}</span>
          </div>
        )}

        {/* Filter chips row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setShowPhoneWhSheet(true)}
            className={`shrink-0 h-9 px-4 rounded-full text-[12.5px] font-bold cursor-pointer inline-flex items-center gap-1.5 ${
              warehouseFilter === 'all'
                ? 'bg-[#101D3A] text-white'
                : 'bg-[#2864D9] text-white'
            }`}
          >
            <span>{whLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowPhoneTypeSheet(true)}
            className={`shrink-0 h-9 px-3.5 rounded-full text-[12.5px] font-bold border cursor-pointer inline-flex items-center gap-1 ${
              typeFilter !== 'all'
                ? 'bg-[#EBF2FE] border-[#2864D9] text-[#2864D9]'
                : 'bg-white border-slate-200 text-[#101D3A]'
            }`}
          >
            <span>{typeLabel}</span>
            <ChevronDown size={13} />
          </button>
          <CustomerReturnLauncher className="shrink-0 h-9 px-3.5 rounded-full border border-amber-300 bg-amber-50 text-amber-900 text-[12px] font-bold inline-flex items-center gap-1 cursor-pointer ml-auto" />
        </div>

        {/* 3-metric Summary Card */}
        <div className="hh-inv-card grid grid-cols-3 gap-2">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Entries</div>
            <div className="text-[19px] font-extrabold text-[#101D3A] tabular-nums mt-0.5">
              {filtered.length}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Cases</div>
            <div className="text-[19px] font-extrabold text-[#101D3A] tabular-nums mt-0.5">
              {phoneCasesCount}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Net loss</div>
            <div className="text-[19px] font-extrabold text-[#DC2626] tabular-nums mt-0.5">
              {fmtPhoneRupees(phoneNetStats.net)}
            </div>
          </div>
        </div>

        {/* Pending Customer Expired / Damaged Returns */}
        {phonePendingCustomerReturns.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-0.5">
              CUSTOMER EXPIRED / DAMAGED RETURNS · {phonePendingCustomerReturns.length} PENDING
            </div>
            {phonePendingCustomerReturns.map((d) => {
              const rt = d.returnTracking!;
              return (
                <div key={d.id} className="hh-inv-card flex items-center justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-extrabold text-[#101D3A] truncate">
                      {rt.customerName}
                    </div>
                    <div className="text-[12px] text-slate-500 mt-0.5 truncate">
                      {d.productName || `Product #${d.productId}`} · {d.quantity} cs ·{' '}
                      {d.reason || 'expired'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDecideTarget(d);
                      setDecideChoice(rt.decision === 'discard' ? 'discard' : 'company');
                      setDecideHandedDate(rt.sentOn || today());
                      setDecideRef(rt.sentRef || '');
                    }}
                    className="shrink-0 px-3.5 py-1.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[12px] font-extrabold cursor-pointer"
                  >
                    Decide
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Disposals & Claims Ledger List */}
        <div className="space-y-2">
          {phoneLedgerRows.length === 0 && phonePendingCustomerReturns.length === 0 ? (
            <div className="hh-inv-card text-center py-6 space-y-1.5">
              <div className="text-[13.5px] font-bold text-[#101D3A]">No returns or disposals yet</div>
              <p className="text-[12px] text-slate-500">
                Record supplier claims, customer returns, or stock write-offs below.
              </p>
            </div>
          ) : (
            phoneLedgerRows.map((r) => {
              const typeShort =
                r.dispositionType.includes('writeoff')
                  ? 'Write-off'
                  : r.dispositionType.includes('free')
                    ? 'Free issue'
                    : 'Claim';
              const isOpen = expandedPhoneLedgerId === r.id;
              const isClaimPending =
                r.compensationStatus === 'pending' || r.compensationStatus === 'partial';
              const isSettled = r.compensationStatus === 'settled';
              return (
                <div key={r.id} className="hh-inv-card space-y-2">
                  <button
                    type="button"
                    onClick={() => setExpandedPhoneLedgerId(isOpen ? null : r.id)}
                    className="w-full text-left flex items-start justify-between gap-2.5 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-extrabold text-[#101D3A] leading-snug">
                        {typeShort} · {r.productName || `#${r.productId}`}
                      </div>
                      <div className="text-[12px] text-slate-500 mt-0.5 leading-snug">
                        {r.batchNumber ? `${r.batchNumber} · ` : ''}
                        {r.quantity} cs · {r.reason || r.eventDate}
                        {r.supplierName ? ` · ${r.supplierName}` : ''}
                      </div>
                      {r.creditNoteNumber && (
                        <div className="text-[11.5px] font-bold text-[#15803D] mt-0.5">
                          CN {r.creditNoteNumber}
                          {r.compensatedAmount ? ` · ₹${money(r.compensatedAmount)} recovered` : ''}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={`text-[14.5px] font-extrabold tabular-nums ${
                          isSettled ? 'text-[#15803D]' : 'text-[#DC2626]'
                        }`}
                      >
                        ₹{money(r.costValue)}
                      </div>
                      {isClaimPending && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {r.compensationStatus === 'partial' ? 'Partial CN' : 'Claim open'}
                        </span>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                      {isClaimPending && (
                        <button
                          type="button"
                          onClick={() => openCnPanel(r)}
                          className="px-3 py-1.5 rounded-full bg-[#2864D9] text-white text-[12px] font-bold cursor-pointer"
                        >
                          Record CN
                        </button>
                      )}
                      {isSettled && (
                        <button
                          type="button"
                          onClick={() => openCnPanel(r)}
                          className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-[#101D3A] text-[12px] font-bold cursor-pointer"
                        >
                          Edit CN
                        </button>
                      )}
                      {(isClaimPending || isSettled) && (
                        <button
                          type="button"
                          onClick={() => printDispositionClaimVoucher([r], orgProfile)}
                          className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-slate-700 text-[12px] font-bold cursor-pointer inline-flex items-center gap-1"
                        >
                          <Printer size={12} /> Print
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            id: r.id,
                            settled: r.compensationStatus === 'settled',
                            stockApplied: r.stockApplied !== false,
                          })
                        }
                        className="px-3 py-1.5 rounded-full bg-rose-50 text-[#E11D48] text-[12px] font-bold cursor-pointer ml-auto"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Collapsible full customer return history so nothing is lost */}
        <details className="hh-inv-card">
          <summary className="cursor-pointer text-[13px] font-bold text-[#101D3A]">
            All customer returns &amp; detailed tracker
          </summary>
          <div className="mt-3 space-y-3">
            <CustomerReturnsList />
            <ExpiryReturnsTracker onRecordCn={openCnPanel} />
          </div>
        </details>

        {/* Bottom CTA */}
        <div className="hh-inv-cta-dock">
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              if (!warehouseId) {
                setWarehouseId(
                  warehouseFilter !== 'all' ? warehouseFilter : warehouses[0]?.id || ''
                );
              }
            }}
            className="hh-inv-btn-primary w-full"
          >
            New return / disposal
          </button>
        </div>

        {/* Decide Customer Return Bottom Sheet */}
        {decideTarget && decideTarget.returnTracking && (
          <div
            className="rt-bsheet-scrim"
            role="presentation"
            onClick={() => setDecideTarget(null)}
          >
            <div
              className="rt-bsheet"
              role="dialog"
              aria-modal="true"
              aria-label="Customer return decision"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="hh-grab" />
              <div className="space-y-3 pb-1">
                <div>
                  <h3 className="text-[18px] font-extrabold text-[#101D3A]">
                    Customer return
                  </h3>
                  <p className="text-[12.5px] text-slate-500 mt-0.5">
                    {decideTarget.returnTracking.customerName} · {decideTarget.productName} ·{' '}
                    {decideTarget.quantity} cs {decideTarget.reason || 'expired'}
                  </p>
                </div>

                <div className="space-y-2">
                  {[
                    {
                      id: 'company' as const,
                      title: 'Send to company',
                      sub: 'Creates a supplier claim; handed over on a date',
                    },
                    {
                      id: 'scrap' as const,
                      title: 'Scrap',
                      sub: 'Write off the stock',
                    },
                    {
                      id: 'discard' as const,
                      title: 'Throw out',
                      sub: 'Dispose, no claim',
                    },
                    {
                      id: 'later' as const,
                      title: 'Decide later',
                      sub: 'Keep it pending',
                    },
                  ].map((opt) => {
                    const active = decideChoice === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDecideChoice(opt.id)}
                        className={`w-full text-left rounded-xl border px-3.5 py-2.5 cursor-pointer transition ${
                          active
                            ? 'border-2 border-[#2864D9] bg-white'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="text-[13.5px] font-extrabold text-[#101D3A]">
                          {opt.title}
                        </div>
                        <div className="text-[11.5px] text-slate-500 mt-0.5">
                          {opt.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {decideChoice === 'company' && (
                  <div className="grid grid-cols-1 gap-2">
                    <div className="hh-inv-field">
                      <span className="hh-inv-field__label">Handed over on</span>
                      <input
                        type="date"
                        value={decideHandedDate}
                        max={today()}
                        onChange={(e) => setDecideHandedDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={confirmPhoneDecide}
                  className="hh-inv-btn-primary w-full"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phone Godown Picker Sheet */}
        {showPhoneWhSheet && (
          <div
            className="rt-bsheet-scrim"
            role="presentation"
            onClick={() => setShowPhoneWhSheet(false)}
          >
            <div
              className="rt-bsheet"
              role="dialog"
              aria-modal="true"
              aria-label="Filter godown"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="hh-grab" />
              <div className="space-y-2 pb-2">
                <h3 className="text-[16px] font-extrabold text-[#101D3A] mb-2">
                  Filter by godown
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setWhFilter('all');
                    setShowPhoneWhSheet(false);
                  }}
                  className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-[13.5px] font-bold ${
                    warehouseFilter === 'all'
                      ? 'border-2 border-[#2864D9] text-[#2864D9]'
                      : 'border-slate-200 text-[#101D3A]'
                  }`}
                >
                  All godowns
                </button>
                {warehouses.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setWhFilter(w.id);
                      setShowPhoneWhSheet(false);
                    }}
                    className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-[13.5px] font-bold ${
                      warehouseFilter === w.id
                        ? 'border-2 border-[#2864D9] text-[#2864D9]'
                        : 'border-slate-200 text-[#101D3A]'
                    }`}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Phone Type Picker Sheet */}
        {showPhoneTypeSheet && (
          <div
            className="rt-bsheet-scrim"
            role="presentation"
            onClick={() => setShowPhoneTypeSheet(false)}
          >
            <div
              className="rt-bsheet"
              role="dialog"
              aria-modal="true"
              aria-label="Filter type"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="hh-grab" />
              <div className="space-y-1.5 max-h-[65vh] overflow-y-auto pb-2">
                <h3 className="text-[16px] font-extrabold text-[#101D3A] mb-2">
                  Filter by type
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('all');
                    setShowPhoneTypeSheet(false);
                  }}
                  className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-[13.5px] font-bold ${
                    typeFilter === 'all'
                      ? 'border-2 border-[#2864D9] text-[#2864D9]'
                      : 'border-slate-200 text-[#101D3A]'
                  }`}
                >
                  All types
                </button>
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTypeFilter(t.id);
                      setShowPhoneTypeSheet(false);
                    }}
                    className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-[13px] font-bold ${
                      typeFilter === t.id
                        ? 'border-2 border-[#2864D9] text-[#2864D9]'
                        : 'border-slate-200 text-[#101D3A]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Phone New Return / Disposal Full-screen Form */}
        {showForm && (
          <div className="rt-flow-phone">
            <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
              <div className="hh-sales-top__row">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="hh-inv-backbtn"
                >
                  <ArrowLeft size={20} strokeWidth={2.3} />
                  <span>New return / disposal</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                if (phoneAttachment.trim() && !referenceDocNo) {
                  setReferenceDocNo(phoneAttachment.trim());
                }
                handleSubmit(e);
              }}
              className="rt-flow-phone__body space-y-2.5"
              style={{ paddingBottom: '120px' }}
            >
              {msg && (
                <div className="hh-inv-card hh-inv-card--alert-amber text-[12.5px] font-bold text-[#101D3A]">
                  {msg}
                </div>
              )}
              <div className="hh-inv-field hh-inv-field--focus">
                <span className="hh-inv-field__label">Product / batch</span>
                <select
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value ? Number(e.target.value) : '');
                    setBatchId('');
                  }}
                  required
                >
                  <option value="">
                    {!warehouseId
                      ? 'Select godown below first...'
                      : productsInWarehouse.length === 0
                        ? 'No stocked products in godown'
                        : 'Select product...'}
                  </option>
                  {productsInWarehouse.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.stock} cs)
                    </option>
                  ))}
                </select>
              </div>

              {productId && batchesForSelection.length > 0 && (
                <div className="hh-inv-field">
                  <span className="hh-inv-field__label">Batch / lot (FEFO)</span>
                  <select
                    value={batchId}
                    onChange={(e) => {
                      setBatchId(e.target.value);
                      const b = batchesForSelection.find((x) => x.id === e.target.value);
                      if (b?.supplierName) setSupplierName(b.supplierName);
                      if (b?.supplierInvoiceNo) setSupplierInvoiceNo(b.supplierInvoiceNo);
                    }}
                  >
                    <option value="">Auto FEFO (earliest expiry)</option>
                    {batchesForSelection.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber || b.id} · {b.quantity} cs · exp {b.expiryDate || '—'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div className="hh-inv-field">
                  <span className="hh-inv-field__label">Qty (cases)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0.01}
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0"
                    required
                  />
                </div>
                <div className="hh-inv-field">
                  <span className="hh-inv-field__label">Event date</span>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="hh-inv-field">
                <span className="hh-inv-field__label">Type / reason</span>
                <select
                  value={dispositionType}
                  onChange={(e) => setDispositionType(e.target.value as InventoryDispositionType)}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hh-inv-field">
                <span className="hh-inv-field__label">Warehouse / godown</span>
                <select
                  value={warehouseId}
                  onChange={(e) => {
                    setWarehouseId(e.target.value);
                    setProductId('');
                    setBatchId('');
                  }}
                  required
                >
                  <option value="">Select godown...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <div className="text-[12px] font-bold text-[#101D3A]">Stock impact</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReduceStock(true)}
                    className={`rounded-xl border px-3 py-2.5 text-[12.5px] font-extrabold text-center cursor-pointer ${
                      reduceStock
                        ? 'border-2 border-[#2864D9] bg-[#EBF2FE] text-[#101D3A]'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Reduce stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setReduceStock(false)}
                    className={`rounded-xl border px-3 py-2.5 text-[12px] font-bold text-center cursor-pointer leading-tight ${
                      !reduceStock
                        ? 'border-2 border-[#2864D9] bg-[#EBF2FE] text-[#101D3A]'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Save only (document / claim)
                  </button>
                </div>
              </div>

              {needsCompensation(dispositionType) && (
                <div className="hh-inv-card space-y-2">
                  <div className="hh-inv-field">
                    <span className="hh-inv-field__label">Supplier name</span>
                    <input
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="hh-inv-field">
                    <span className="hh-inv-field__label">Link GRN (optional)</span>
                    <select value={grnId} onChange={(e) => setGrnId(e.target.value)}>
                      <option value="">None</option>
                      {grns.slice(0, 60).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.grnNumber || g.id} · {g.supplierName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {isFreeIssue(dispositionType) && (
                <div className="hh-inv-card space-y-2">
                  <div className="hh-inv-field">
                    <span className="hh-inv-field__label">Distributed to</span>
                    <input
                      value={distributedToName}
                      onChange={(e) => setDistributedToName(e.target.value)}
                      placeholder="Customer / route"
                    />
                  </div>
                </div>
              )}

              <div className="hh-inv-field">
                <span className="hh-inv-field__label">Notes</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="hh-inv-field">
                <span className="hh-inv-field__label">Attachment / scan</span>
                <input
                  value={phoneAttachment || referenceDocNo}
                  onChange={(e) => {
                    setPhoneAttachment(e.target.value);
                    setReferenceDocNo(e.target.value);
                  }}
                  placeholder="Drive link or photo path"
                />
              </div>

              <button type="submit" className="hh-inv-btn-primary w-full mt-2">
                Save
              </button>
            </form>
          </div>
        )}

        {/* Phone Record / Edit Credit Note Full-screen Flow */}
        {compId && targetCompRow && (
          <div className="rt-flow-phone">
            <div className="hh-sales-top hh-sales-top--flush hh-inv-top hh-inv-top--flow">
              <div className="hh-sales-top__row">
                <button
                  type="button"
                  onClick={() => setCompId(null)}
                  className="hh-inv-backbtn"
                >
                  <ArrowLeft size={20} strokeWidth={2.3} />
                  <span>
                    {targetCompRow.compensationStatus === 'settled'
                      ? 'Edit credit note'
                      : 'Record credit note'}
                  </span>
                </button>
              </div>
            </div>

            <div className="rt-flow-phone__body space-y-2.5" style={{ paddingBottom: '120px' }}>
              {msg && (
                <div className="hh-inv-card hh-inv-card--alert-amber text-[12.5px] font-bold text-[#101D3A]">
                  {msg}
                </div>
              )}
              <div className="hh-inv-field hh-inv-field--focus">
                <span className="hh-inv-field__label">Credit note number</span>
                <input
                  value={cnNo}
                  onChange={(e) => setCnNo(e.target.value)}
                  placeholder="CN-FZ-221"
                />
              </div>

              <div className="hh-inv-field">
                <span className="hh-inv-field__label">Credit note date</span>
                <input
                  type="date"
                  value={cnDate}
                  onChange={(e) => setCnDate(e.target.value)}
                />
              </div>

              <div className="hh-inv-field">
                <span className="hh-inv-field__label">Link GRN (optional)</span>
                <select value={cnLinkGrnId} onChange={(e) => setCnLinkGrnId(e.target.value)}>
                  <option value="">None</option>
                  {grns.slice(0, 60).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.grnNumber || g.id} · {g.supplierName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <div className="text-[12px] font-bold text-[#101D3A]">Credit type</div>
                <div className="space-y-1.5">
                  {[
                    { id: 'value_credit' as const, label: 'Full value credit' },
                    { id: 'free_bogo' as const, label: 'Free goods (B1G1 / Buy X Get Y)' },
                    { id: 'near_expiry_swap' as const, label: 'Near-expiry free swap' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCnScheme(opt.id)}
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-[13px] font-extrabold text-left cursor-pointer ${
                        cnScheme === opt.id
                          ? 'border-2 border-[#2864D9] bg-white text-[#101D3A]'
                          : 'border-slate-200 bg-white text-[#101D3A]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="hh-inv-field">
                  <span className="hh-inv-field__label">Taxable (₹)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={cnTaxable}
                    onChange={(e) => setCnTaxable(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0"
                  />
                </div>
                <div className="hh-inv-field">
                  <span className="hh-inv-field__label">Total CN (₹)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={compAmt}
                    onChange={(e) => setCompAmt(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="hh-inv-card space-y-2">
                <div className="flex justify-between text-[13px] text-slate-700">
                  <span>
                    {targetCompRow.productName || `#${targetCompRow.productId}`} ·{' '}
                    {targetCompRow.quantity} cs
                  </span>
                  <span className="font-bold tabular-nums">
                    ₹{money(targetCompRow.costValue)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between items-baseline">
                  <span className="text-[14px] font-extrabold text-[#101D3A]">Credit total</span>
                  <span className="text-[17px] font-extrabold text-[#101D3A] tabular-nums">
                    ₹{money(compFinalTotal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rt-flow-phone__footer flex gap-2.5">
              <button
                type="button"
                onClick={() => setCompId(null)}
                className="hh-inv-btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCompensation}
                className="hh-inv-btn-primary flex-1"
              >
                {targetCompRow.compensationStatus === 'settled' ? 'Update CN' : 'Record CN'}
              </button>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget)
              deleteInventoryDisposition(deleteTarget.id, { restoreStock: deleteTarget.stockApplied });
            setDeleteTarget(null);
          }}
          title="Delete this disposition?"
          message={
            deleteTarget?.settled
              ? deleteTarget.stockApplied
                ? 'This claim is SETTLED with a credit note. Deleting removes the disposal, its linked supplier CN and returns the stock.'
                : 'This claim is SETTLED with a credit note. Deleting removes the record and its linked supplier CN (godown stock is unchanged).'
              : deleteTarget?.stockApplied
                ? 'The stock will return to inventory.'
                : 'This removes the document / customer-return tracking record without changing godown stock.'
          }
          confirmButtonLabel="Delete"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {msg}
        </div>
      )}

      <div
        data-card-tone="warning"
        className="rounded-2xl border shadow-xs p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="hh-icon-badge hh-icon-badge--amber shrink-0">
            <FileWarning className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold text-[#0A1F44] tracking-tight">Returns & Disposals</h2>
              <InfoTip title="Returns & disposals">
                <p>Everything that leaves stock without a normal customer sale: supplier returns, free near-expiry issues, expiry / damage write-offs and customer-returned crates sent back to the company.</p>
                <p>Each claim stays <strong>pending</strong> until you record the supplier’s credit note. Recorded credit notes also appear under Supplier credits → Claims, and always edit here, where the GST split and partial receipts are kept.</p>
              </InfoTip>
            </div>
            <p className="text-xs text-slate-500">
              Customer returns, company claims, credit notes & write-offs
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 w-full sm:w-auto">
          <CustomerReturnLauncher className="w-full sm:w-auto min-h-[44px] justify-center px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-[0.99]" />
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);
            }}
            className="w-full sm:w-auto min-h-[44px] justify-center px-3.5 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" /> New disposition
          </button>
        </div>
      </div>

      <CustomerReturnsList />

      <ExpiryReturnsTracker onRecordCn={openCnPanel} />

      {openClaims.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-950 space-y-2">
          <div>
            <strong className="font-black">{openClaims.length} open supplier claim(s)</strong>
            {' '}waiting for credit note or settlement. Select rows for multi-line CN or record per line.
          </div>
          {agedClaims.length > 0 && (
            <div className="flex items-start gap-2 text-rose-900 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>{agedClaims.length} claim(s) aged ≥ 30 days</strong>
                {agedClaims.slice(0, 3).map((x) => (
                  <span key={x.row.id} className="block">
                    · {x.row.productName || x.row.productId} · {x.days}d · {x.row.supplierName || '—'}
                  </span>
                ))}
                {agedClaims.length > 3 && <span className="block">· +{agedClaims.length - 3} more</span>}
              </span>
            </div>
          )}
          {selectedClaimIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{selectedClaimIds.length} selected</span>
              <button
                type="button"
                onClick={() => {
                  const sum = selectedClaims.reduce((s, r) => s + (Number(r.costValue) || 0), 0);
                  setMultiCnTotal(sum || '');
                  setShowMultiCn(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-black text-[10px] cursor-pointer"
              >
                Record multi-line CN
              </button>
              <button
                type="button"
                onClick={() => printDispositionClaimVoucher(selectedClaims, orgProfile)}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
              >
                <Printer className="w-3 h-3" /> Print claim
              </button>
              <button
                type="button"
                onClick={() => setSelectedClaimIds([])}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-600 cursor-pointer"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}

      {freeGoodsPrompt && (
        <div className="rounded-2xl border border-sky-300 bg-sky-50 p-3.5 text-xs text-sky-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2">
            <Gift className="w-4 h-4 shrink-0 text-sky-700" />
            <div>
              <strong className="font-black">Free goods / near-expiry swap on CN</strong>
              <p className="mt-0.5 font-medium">
                CN does not add stock. Receive free cases via Inward for{' '}
                {freeGoodsPrompt.productName || 'the product'}
                {freeGoodsPrompt.note ? ` (${freeGoodsPrompt.note})` : ''}.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setFreeGoodsPrompt(null);
                setTab('inventory');
              }}
              className="px-3 py-1.5 rounded-lg bg-sky-600 text-white font-black text-[11px] cursor-pointer"
            >
              Open Inventory / Inward
            </button>
            <button
              type="button"
              onClick={() => setFreeGoodsPrompt(null)}
              className="px-3 py-1.5 rounded-lg border border-sky-300 font-bold text-[11px] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Stock Disposals & Supplier Claims Ledger */}
      <section
        data-card-tone="neutral"
        className="rounded-2xl border shadow-xs p-3.5 sm:p-4 space-y-3"
        aria-label="Dispositions and claims ledger"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[#0A1F44]">Stock disposals & supplier claims ledger</h3>
            <p className="text-xs text-slate-500">
              All warehouse write-offs, free near-expiry issues, and customer-return company claims ({ledgerStats.count} entries · {ledgerStats.totalCases} cs)
            </p>
          </div>
          {ledgerStats.hasCnExport && (
            <button
              type="button"
              onClick={() => exportGstrCnCsv(inventoryDispositions)}
              className="px-3 py-2 rounded-xl border border-[#DCE5F2] bg-white/80 hover:bg-white text-xs font-bold text-[#0A1F44] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export CN CSV
            </button>
          )}
        </div>

        {ledgerStats.count > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div data-card-tone="sales" className="rounded-xl border px-3 py-2.5 shadow-2xs">
              <div className="text-xs font-semibold text-blue-900/75">Entries / Cases</div>
              <div className="text-base font-extrabold text-[#0A1F44] tabular-nums mt-0.5">
                {ledgerStats.count} <span className="text-xs font-semibold text-slate-500">({ledgerStats.totalCases} cs)</span>
              </div>
            </div>
            <div data-card-tone="warning" className="rounded-xl border px-3 py-2.5 shadow-2xs">
              <div className="text-xs font-semibold text-amber-800">Open claims ({ledgerStats.openCount})</div>
              <div className="text-base font-extrabold text-amber-950 tabular-nums mt-0.5">₹{money(ledgerStats.openValue)}</div>
            </div>
            <div data-card-tone="received" className="rounded-xl border px-3 py-2.5 shadow-2xs">
              <div className="text-xs font-semibold text-emerald-800">Recovered ({ledgerStats.settledCount})</div>
              <div className="text-base font-extrabold text-emerald-950 tabular-nums mt-0.5">₹{money(ledgerStats.recovered)}</div>
            </div>
            <div data-card-tone="due" className="rounded-xl border px-3 py-2.5 shadow-2xs">
              <div className="text-xs font-semibold text-rose-800">Net loss</div>
              <div className="text-base font-extrabold text-rose-950 tabular-nums mt-0.5">₹{money(ledgerStats.netLoss)}</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter ledger by claim status">
          {[
            { id: 'all' as const, label: 'All', count: ledgerStats.count },
            { id: 'open_claims' as const, label: 'Open claims', count: ledgerStats.openCount },
            { id: 'settled' as const, label: 'CN settled', count: ledgerStats.settledCount },
            {
              id: 'writeoff' as const,
              label: 'Write-offs / Refused',
              count: ledgerStats.count - ledgerStats.openCount - ledgerStats.settledCount,
            },
          ].map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#0A1F44] text-white border-[#0A1F44]'
                    : 'bg-white text-slate-700 border-[#DCE5F2] hover:bg-slate-50'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              enterKeyHint="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, supplier, batch, CN, godown…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#DCE5F2] bg-slate-50/70 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#DCE5F2] text-sm font-semibold bg-white"
          >
            <option value="all">All types</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          {warehouses.length > 1 && (
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#DCE5F2] text-sm font-semibold bg-white"
            >
              <option value="all">All godowns</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
        </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto overscroll-x-contain rounded-2xl border border-[#DCE5F2] bg-white">
        <table className="w-full text-left data-table min-w-[680px]">
          <thead>
            <tr className="border-b border-[#DCE5F2] bg-slate-50">
              <th className="w-8 px-2 py-2.5 text-center" aria-label="Select claim">
                <span className="sr-only">Select</span>
              </th>
              <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Date</th>
              <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</th>
              <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Product / Batch</th>
              <th className="px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Qty</th>
              <th className="px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Cost</th>
              <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Claim</th>
              <th className="px-2.5 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-500 text-sm">
                  No dispositions match the current filters. Record returns, free issues or write-offs above.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-sky-50/40">
                  <td className="px-2 py-2.5 text-center">
                    {(r.compensationStatus === 'pending' || r.compensationStatus === 'partial') && (
                      <input
                        type="checkbox"
                        checked={selectedClaimIds.includes(r.id)}
                        onChange={() => toggleClaimSelect(r.id)}
                        className="rounded border-slate-300 cursor-pointer"
                        title="Select for multi-line CN"
                      />
                    )}
                  </td>
                  <td className="px-2.5 py-2.5 font-mono text-xs whitespace-nowrap">
                    {r.eventDate}
                    {(r.compensationStatus === 'pending' || r.compensationStatus === 'partial') && daysOpen(r.eventDate) >= 30 && (
                      <span className="block text-[10px] font-black text-rose-700">{daysOpen(r.eventDate)}d open</span>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5 text-xs font-semibold text-slate-700">
                    {TYPE_OPTIONS.find((t) => t.id === r.dispositionType)?.label || r.dispositionType}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <div className="font-bold text-xs text-slate-900">{r.productName || `#${r.productId}`}</div>
                    {r.stockApplied === false && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-600 border border-slate-200">
                        {r.returnTracking ? 'Customer return · stock already out' : 'Doc only · stock kept'}
                      </span>
                    )}
                    <div className="text-[10px] text-slate-500">
                      {r.warehouseName || r.warehouseId}
                      {r.batchNumber ? ` · Lot ${r.batchNumber}` : ''}
                      {r.expiryDate ? ` · Exp ${r.expiryDate}` : ''}
                      {r.distributedToName ? ` · To ${r.distributedToName}` : ''}
                      {r.supplierName ? ` · ${r.supplierName}` : ''}
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono font-bold text-xs">{r.quantity}</td>
                  <td className="px-2.5 py-2.5 text-right font-mono text-xs text-amber-900 whitespace-nowrap">
                    <div className="font-bold">₹{money(r.costValue)}</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      ₹{money(r.costPerUnit)}/cs × {r.quantity}
                    </div>
                    {Math.abs((r.costPerUnit || 0) * (r.quantity || 0) - (r.costValue || 0)) > 0.5 && (
                      <div className="text-[10px] font-bold text-rose-600" title="Stored total differs from rate × quantity. Check the batch cost.">
                        ⚠ expected ₹{money((r.costPerUnit || 0) * (r.quantity || 0))}
                      </div>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${statusBadge(r.compensationStatus)}`}>
                      {r.compensationStatus.replace('_', ' ')}
                    </span>
                    {r.creditNoteNumber && (
                      <div className="text-[10px] text-slate-500 mt-0.5 font-mono">CN {r.creditNoteNumber}</div>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5 text-center">
                    <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                      {(r.compensationStatus === 'pending' || r.compensationStatus === 'partial') && (
                        <button
                          type="button"
                          onClick={() => {
                            setCompId(r.id);
                            setCnNo(r.creditNoteNumber || '');
                            setCnDate(r.creditNoteDate || today());
                            setCnTaxable(r.cnTaxableValue || '');
                            setCnCgst(r.cnCgst || '');
                            setCnSgst(r.cnSgst || '');
                            setCnIgst(r.cnIgst || '');
                            setCompAmt(r.compensationStatus === 'partial' ? '' : (r.compensatedAmount || r.costValue || ''));
                            setClaimVal(r.costValue || '');
                            setAppendPayment(r.compensationStatus === 'partial');
                            setCnAttachment(r.attachmentRef || '');
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer hover:bg-emerald-100"
                        >
                          Record CN
                        </button>
                      )}
                      {(r.compensationStatus === 'pending' || r.compensationStatus === 'partial' || r.compensationStatus === 'settled') && (
                        <button
                          type="button"
                          onClick={() => printDispositionClaimVoucher([r], orgProfile)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white text-slate-700 border border-slate-200 cursor-pointer hover:bg-slate-50 inline-flex items-center gap-0.5"
                          title="Print claim / CN voucher"
                        >
                          <Printer className="w-3 h-3" /> Print
                        </button>
                      )}
                      {r.approvalStatus === 'pending_approval' && (
                        <button
                          type="button"
                          onClick={() => {
                            updateInventoryDisposition(r.id, {
                              approvalStatus: 'approved',
                              approvedBy: 'Admin',
                            });
                            setMsg('Claim approved');
                            setTimeout(() => setMsg(null), 2500);
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-violet-50 text-violet-800 border border-violet-200 cursor-pointer"
                        >
                          Approve
                        </button>
                      )}
                      {r.compensationStatus === 'settled' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCompId(r.id);
                            setCnNo(r.creditNoteNumber || '');
                            setCnDate(r.creditNoteDate || today());
                            setCnTaxable(r.cnTaxableValue || '');
                            setCnCgst(r.cnCgst || '');
                            setCnSgst(r.cnSgst || '');
                            setCnIgst(r.cnIgst || '');
                            setCompAmt(r.compensatedAmount || r.costValue || '');
                            setClaimVal(r.costValue || '');
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200 cursor-pointer hover:bg-sky-100 inline-flex items-center gap-1"
                          title="Edit settled credit note details"
                        >
                          <Edit2 className="w-3 h-3" /> Edit CN
                        </button>
                      )}
                      <button
                        type="button"
                        title={r.stockApplied === false ? 'Delete record' : 'Delete disposal (stock returns to inventory)'}
                        onClick={() => {
                          setDeleteTarget({ id: r.id, settled: r.compensationStatus === 'settled', stockApplied: r.stockApplied !== false });
                        }}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
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

      {/* Mobile / tablet cards */}
      <div className="block md:hidden space-y-2.5">
        {filtered.length === 0 ? (
          <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            No dispositions match the current filters.
          </div>
        ) : (
          filtered.map((r) => {
            const prod = products.find((p) => p.id === r.productId);
            const openDays =
              (r.compensationStatus === 'pending' || r.compensationStatus === 'partial')
                ? daysOpen(r.eventDate)
                : 0;
            const cardTone =
              r.compensationStatus === 'settled'
                ? 'received'
                : r.compensationStatus === 'rejected'
                  ? 'due'
                  : r.compensationStatus === 'pending' || r.compensationStatus === 'partial'
                    ? 'warning'
                    : 'neutral';
            return (
              <div key={r.id} data-card-tone={cardTone} className="rounded-2xl border shadow-xs p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(r.compensationStatus === 'pending' || r.compensationStatus === 'partial') && (
                        <input
                          type="checkbox"
                          checked={selectedClaimIds.includes(r.id)}
                          onChange={() => toggleClaimSelect(r.id)}
                          className="rounded border-slate-300 cursor-pointer"
                          aria-label={`Select ${r.productName || 'claim'}`}
                        />
                      )}
                      <span className="font-mono text-xs font-bold text-slate-500">{r.eventDate}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-[#e9edfb] text-[#0A1F44]">
                        {TYPE_OPTIONS.find((t) => t.id === r.dispositionType)?.label || r.dispositionType}
                      </span>
                      {openDays >= 30 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                          {openDays}d open
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-sm text-[#0A1F44] break-words">
                        {r.productName || `#${r.productId}`}
                      </span>
                      <SizeChip volume={prod?.volume} pack={prod?.pack} name={r.productName} />
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-xs font-bold tabular-nums">
                        {r.quantity} cs
                      </span>
                    </div>
                    {r.stockApplied === false && (
                      <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        {r.returnTracking ? 'Customer return · stock already out' : 'Doc only · stock kept'}
                      </span>
                    )}
                    <div className="text-xs text-slate-500 leading-snug break-words">
                      <strong className="font-bold text-amber-900">₹{money(r.costValue)}</strong>
                      <span className="text-slate-400"> (₹{money(r.costPerUnit)}/cs)</span>
                      {r.warehouseName ? ` · ${r.warehouseName}` : ''}
                      {r.batchNumber ? ` · Lot ${r.batchNumber}` : ''}
                      {r.expiryDate ? ` · Exp ${r.expiryDate}` : ''}
                      {r.distributedToName ? ` · To ${r.distributedToName}` : ''}
                      {r.supplierName ? ` · ${r.supplierName}` : ''}
                    </div>
                    {r.creditNoteNumber && (
                      <div className="text-xs font-mono font-semibold text-emerald-800">
                        CN {r.creditNoteNumber}
                        {r.compensatedAmount ? ` · ₹${money(r.compensatedAmount)}` : ''}
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${statusBadge(r.compensationStatus)}`}>
                    {r.compensationStatus.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                  {(r.compensationStatus === 'pending' || r.compensationStatus === 'partial') && (
                    <button
                      type="button"
                      onClick={() => openCnPanel(r)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer"
                    >
                      Record CN
                    </button>
                  )}
                  {r.compensationStatus === 'settled' && (
                    <button
                      type="button"
                      onClick={() => openCnPanel(r)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 cursor-pointer inline-flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit CN
                    </button>
                  )}
                  {r.approvalStatus === 'pending_approval' && (
                    <button
                      type="button"
                      onClick={() => {
                        updateInventoryDisposition(r.id, {
                          approvalStatus: 'approved',
                          approvedBy: 'Admin',
                        });
                        setMsg('Claim approved');
                        setTimeout(() => setMsg(null), 2500);
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-50 text-violet-800 border border-violet-200 cursor-pointer"
                    >
                      Approve
                    </button>
                  )}
                  {(r.compensationStatus === 'pending' || r.compensationStatus === 'partial' || r.compensationStatus === 'settled') && (
                    <button
                      type="button"
                      onClick={() => printDispositionClaimVoucher([r], orgProfile)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 cursor-pointer inline-flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTarget({ id: r.id, settled: r.compensationStatus === 'settled', stockApplied: r.stockApplied !== false });
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      </section>

      {/* New disposition modal */}
      {showForm && (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" role="dialog">
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-sm">New return / disposal</h3>
              <button aria-label="Close" type="button" onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Type</label>
                <select
                  value={dispositionType}
                  onChange={(e) => setDispositionType(e.target.value as InventoryDispositionType)}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>{t.group}: {t.label}</option>
                  ))}
                </select>
              </div>

              {/* Flow: Warehouse → products with stock → batch → qty */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-3">
                <p className="text-[11px] font-bold text-slate-600">
                  1. Choose godown → 2. Product with remaining stock → 3. Batch (FEFO) → 4. Qty
                </p>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Warehouse / godown</label>
                  <select
                    value={warehouseId}
                    onChange={(e) => {
                      setWarehouseId(e.target.value);
                      setProductId('');
                      setBatchId('');
                    }}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    required
                  >
                    <option value="">Select warehouse…</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Product (with stock in this godown)
                  </label>
                  <select
                    value={productId}
                    onChange={(e) => {
                      setProductId(e.target.value ? Number(e.target.value) : '');
                      setBatchId('');
                    }}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    required
                    disabled={!warehouseId}
                  >
                    <option value="">
                      {!warehouseId
                        ? 'Select warehouse first…'
                        : productsInWarehouse.length === 0
                          ? 'No stocked products in this godown'
                          : 'Select product…'}
                    </option>
                    {productsInWarehouse.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.stock} cs remaining
                      </option>
                    ))}
                  </select>
                  {warehouseId && (
                    <p className="text-[10px] text-slate-500 mt-1 font-semibold">
                      {productsInWarehouse.length} product(s) with stock ·{' '}
                      {productsInWarehouse.reduce((s, p) => s + p.stock, 0)} cs total in godown
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Batch / lot (FEFO — earliest expiry first)
                  </label>
                  <select
                    value={batchId}
                    onChange={(e) => {
                      setBatchId(e.target.value);
                      const b = batchesForSelection.find((x) => x.id === e.target.value);
                      if (b?.supplierName) setSupplierName(b.supplierName);
                      if (b?.supplierInvoiceNo) {
                        setSupplierInvoiceNo(b.supplierInvoiceNo);
                        const match = grns.find(
                          (g) =>
                            (g.invoiceNo || '').trim().toLowerCase() === (b.supplierInvoiceNo || '').trim().toLowerCase() ||
                            (g.grnNumber || '').trim().toLowerCase() === (b.supplierInvoiceNo || '').trim().toLowerCase()
                        );
                        if (match) setGrnId(match.id);
                      }
                    }}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    disabled={!productId || !warehouseId}
                  >
                    <option value="">Any lot in warehouse (auto FEFO)</option>
                    {batchesForSelection.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber || b.id} · {b.quantity} cs · exp {b.expiryDate || '—'}
                        {b.supplierInvoiceNo ? ` · inv ${b.supplierInvoiceNo}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Qty (cases)</label>
                    <input
                      type="number" inputMode="numeric"
                      min={0.01}
                      step="any"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value ? Number(e.target.value) : '')}
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono bg-white"
                      required
                    />
                  </div>
                  <div className="flex items-end">
                    {costPer > 0 && (
                      <p className="text-[11px] text-slate-600 font-semibold pb-2">
                        Cost ₹{money(costPer)}/cs · ≈ ₹{money(costPer * (Number(quantity) || 0))}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Stock impact */}
              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Stock impact</div>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="stockImpact"
                    checked={reduceStock}
                    onChange={() => setReduceStock(true)}
                    className="mt-1"
                  />
                  <span className="text-xs text-slate-800">
                    <strong className="font-black">Reduce stock</strong>
                    <span className="block text-slate-500 font-semibold">Cases leave the godown (return / write-off / free issue).</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="stockImpact"
                    checked={!reduceStock}
                    onChange={() => setReduceStock(false)}
                    className="mt-1"
                  />
                  <span className="text-xs text-slate-800">
                    <strong className="font-black">Save only (document / claim)</strong>
                    <span className="block text-slate-500 font-semibold">
                      No stock change — use when stock already moved or you only need a CN claim record.
                    </span>
                  </span>
                </label>
              </div>

              {/* Supplier scheme for CN / claim */}
              {needsCompensation(dispositionType) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-900">
                    Supplier compensation scheme (for credit note)
                  </div>
                  <select
                    value={claimScheme}
                    onChange={(e) => setClaimScheme(e.target.value as typeof claimScheme)}
                    className="w-full px-3 py-2 rounded-xl border border-amber-200 text-sm bg-white"
                  >
                    <option value="none">No special scheme — value CN later</option>
                    <option value="value_credit">Full value credit note (₹ claim)</option>
                    <option value="discount_pct">Discount % on CN (e.g. damaged goods)</option>
                    <option value="free_bogo">Free goods scheme (Buy X Get Y / B1G1)</option>
                    <option value="near_expiry_swap">Free near-expiry replacement / swap</option>
                  </select>
                  {claimScheme === 'free_bogo' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600">Buy qty</label>
                        <input
                          type="number" inputMode="numeric"
                          min={1}
                          value={schemeBuyQty}
                          onChange={(e) => setSchemeBuyQty(e.target.value ? Number(e.target.value) : '')}
                          className="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600">Free qty</label>
                        <input
                          type="number" inputMode="numeric"
                          min={1}
                          value={schemeFreeQty}
                          onChange={(e) => setSchemeFreeQty(e.target.value ? Number(e.target.value) : '')}
                          className="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm"
                        />
                      </div>
                    </div>
                  )}
                  {claimScheme === 'discount_pct' && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-600">Discount %</label>
                      <input
                        type="number" inputMode="numeric"
                        min={0}
                        max={100}
                        value={schemeDiscountPct}
                        onChange={(e) => setSchemeDiscountPct(e.target.value ? Number(e.target.value) : '')}
                        className="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm"
                        placeholder="e.g. 50"
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-amber-900/80 font-medium">
                    Saved on the claim notes. When the supplier issues the CN, use <strong>Record CN / Edit CN</strong> and confirm the scheme there.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Event date</label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Your ref no.</label>
                  <input
                    value={referenceDocNo}
                    onChange={(e) => setReferenceDocNo(e.target.value)}
                    placeholder="DN / RTN no."
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              {needsCompensation(dispositionType) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" /> Supplier link
                  </div>
                  <input
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Supplier name"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                  <input
                    value={supplierInvoiceNo}
                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                    placeholder="Original supplier invoice no."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                  <select
                    value={grnId}
                    onChange={(e) => setGrnId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  >
                    <option value="">Link GRN (optional)</option>
                    {grns.slice(0, 80).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.grnNumber || g.id} · {g.supplierName} · {g.invoiceNo}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-amber-800 font-medium">
                    Claim status starts as <strong>pending</strong>. After you receive the supplier credit note, use “Record CN”.
                  </p>
                </div>
              )}

              {isFreeIssue(dispositionType) && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 space-y-2">
                  <div className="text-[11px] font-black uppercase tracking-wider text-sky-800 flex items-center gap-1">
                    <Gift className="w-3.5 h-3.5" /> Distributed to
                  </div>
                  <input
                    value={distributedToName}
                    onChange={(e) => setDistributedToName(e.target.value)}
                    placeholder="Customer / retailer / route"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                  <input inputMode="tel" autoComplete="tel"
                    value={distributedToPhone}
                    onChange={(e) => setDistributedToPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Reason</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Short reason"
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireApproval}
                  onChange={(e) => setRequireApproval(e.target.checked)}
                />
                Require approval before settling CN (maker–checker)
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-xs font-black cursor-pointer hover:bg-sky-500"
                >
                  {reduceStock ? 'Save & reduce stock' : 'Save document only'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Compensation / CN modal */}
      {compId && (() => {
        const targetRow = inventoryDispositions.find((d) => d.id === compId);
        const isSettled = targetRow?.compensationStatus === 'settled' || Number(targetRow?.compensatedAmount || 0) > 0;
        return (
          <div aria-modal="true" className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" role="dialog">
            <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
              <div className="shrink-0 sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <h3 className="font-black text-slate-900 text-sm">
                    {isSettled ? 'Edit Supplier Credit Note' : 'Record Supplier Credit Note'}
                  </h3>
                  {targetRow && (
                    <p className="text-[11px] text-slate-500">
                      {targetRow.productName || `Product #${targetRow.productId}`} · Qty: {targetRow.quantity} cs · Claim Value: ₹{money(targetRow.costValue)}
                    </p>
                  )}
                </div>
                <button aria-label="Close" type="button" onClick={() => setCompId(null)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {isSettled && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <span className="text-amber-900 font-medium">Claim is settled. Need to un-settle or re-open?</span>
                  <button
                    type="button"
                    onClick={() => reopenClaim(compId)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold hover:bg-amber-100 inline-flex items-center gap-1 cursor-pointer w-fit"
                  >
                    <RotateCcw className="w-3 h-3" /> Re-open (Pending)
                  </button>
                </div>
              )}

              {targetRow && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Claim value – cost of returned goods (₹, ex-GST)
                  </label>
                  <input
                    type="number" inputMode="decimal"
                    value={claimVal}
                    onChange={(e) => setClaimVal(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono bg-white"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">
                    Saved at ₹{money(targetRow.costPerUnit)}/cs × {targetRow.quantity} cs = ₹{money((targetRow.costPerUnit || 0) * (targetRow.quantity || 0))}.
                    Change this if the stored value is wrong; the credit note status is judged against it.
                  </p>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Credit Note Number</label>
                <input
                  value={cnNo}
                  onChange={(e) => setCnNo(e.target.value)}
                  placeholder="e.g. CN-2026-001"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Credit Note Date</label>
                <input
                  type="date"
                  value={cnDate}
                  onChange={(e) => setCnDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Taxable Value (₹)</label>
                  <input
                    type="number" inputMode="decimal"
                    value={cnTaxable}
                    onChange={(e) => setCnTaxable(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Taxable value"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Total CN Amount (₹)</label>
                  <input
                    type="number" inputMode="decimal"
                    value={compAmt}
                    onChange={(e) => setCompAmt(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Total CN amount"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono font-bold text-emerald-800"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">CGST (₹)</label>
                  <input
                    type="number" inputMode="decimal"
                    value={cnCgst}
                    onChange={(e) => setCnCgst(e.target.value ? Number(e.target.value) : '')}
                    placeholder="CGST"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">SGST (₹)</label>
                  <input
                    type="number" inputMode="decimal"
                    value={cnSgst}
                    onChange={(e) => setCnSgst(e.target.value ? Number(e.target.value) : '')}
                    placeholder="SGST"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">IGST (₹, if inter-state)</label>
                <input
                  type="number" inputMode="decimal"
                  value={cnIgst}
                  onChange={(e) => setCnIgst(e.target.value ? Number(e.target.value) : '')}
                  placeholder="IGST"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appendPayment}
                    onChange={(e) => setAppendPayment(e.target.checked)}
                  />
                  Log as additional partial payment (add to amount already received)
                </label>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Attachment / scan URL or file ref</label>
                  <input
                    value={cnAttachment}
                    onChange={(e) => setCnAttachment(e.target.value)}
                    placeholder="Drive link, photo path, or CN scan reference"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                {targetRow && Array.isArray(targetRow.compensationPayments) && targetRow.compensationPayments.length > 0 && (
                  <div className="text-[10px] text-slate-600 space-y-0.5">
                    <div className="font-black uppercase tracking-wider text-slate-500">Payment log</div>
                    {targetRow.compensationPayments.map((p) => (
                      <div key={p.id}>
                        {p.date}: ₹{money(p.amount)}
                        {p.cnNumber ? ` · ${p.cnNumber}` : ''}
                        {p.note ? ` · ${p.note}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 space-y-2">
                <div className="text-[11px] font-black uppercase tracking-wider text-sky-900">
                  Scheme on this credit note (optional)
                </div>
                <select
                  value={cnScheme}
                  onChange={(e) => setCnScheme(e.target.value as typeof cnScheme)}
                  className="w-full px-3 py-2 rounded-xl border border-sky-200 text-sm bg-white"
                >
                  <option value="none">Pure value CN (₹ only)</option>
                  <option value="value_credit">Full value credit</option>
                  <option value="discount_pct">Partial discount / damage %</option>
                  <option value="free_bogo">Free goods (B1G1 / Buy X Get Y)</option>
                  <option value="near_expiry_swap">Near-expiry free swap</option>
                </select>
                <input
                  value={cnSchemeNote}
                  onChange={(e) => setCnSchemeNote(e.target.value)}
                  placeholder="e.g. B2G1 free 10 cs near-expiry · or 50% damage discount"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              </div>

              <div className="shrink-0 sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3 flex gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                <button
                  type="button"
                  onClick={() => setCompId(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCompensation}
                  className="flex-[1.4] py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer hover:bg-emerald-500 shadow-md shadow-emerald-600/20"
                >
                  {isSettled ? 'Update CN' : 'Save CN'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Multi-line supplier CN */}
      {showMultiCn && (
        <div aria-modal="true" className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" role="dialog">
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900">Multi-line Supplier Credit Note</h3>
                <p className="text-[11px] text-slate-500">{selectedClaims.length} claim line(s) · same CN number</p>
              </div>
              <button aria-label="Close" type="button" onClick={() => setShowMultiCn(false)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
              <ul className="space-y-1.5">
                {selectedClaims.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2 border border-slate-100 rounded-lg px-2.5 py-1.5">
                    <span className="font-semibold text-slate-800">{r.productName || r.productId} · {r.quantity} cs</span>
                    <span className="font-mono font-bold">₹{money(r.costValue || 0)}</span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-slate-600">CN Number</label>
                  <input value={multiCnNo} onChange={(e) => setMultiCnNo(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600">CN Date</label>
                  <input type="date" value={multiCnDate} onChange={(e) => setMultiCnDate(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600">Total CN ₹</label>
                  <input type="number" inputMode="decimal" value={multiCnTotal} onChange={(e) => setMultiCnTotal(e.target.value ? Number(e.target.value) : '')} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono" />
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Total is split across lines in proportion to each claim value. Adjust total if supplier paid a different amount.
              </p>
            </div>
            <div className="border-t border-slate-200 px-4 py-3 flex gap-2">
              <button type="button" onClick={() => setShowMultiCn(false)} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold cursor-pointer">Cancel</button>
              <button type="button" onClick={submitMultiCn} className="flex-[1.4] py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer">Apply multi-line CN</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteInventoryDisposition(deleteTarget.id, { restoreStock: deleteTarget.stockApplied });
          setDeleteTarget(null);
        }}
        title="Delete this disposition?"
        message={
          deleteTarget?.settled
            ? deleteTarget.stockApplied
              ? 'This claim is SETTLED with a credit note. Deleting removes the disposal, its linked supplier CN and returns the stock.'
              : 'This claim is SETTLED with a credit note. Deleting removes the record and its linked supplier CN (godown stock is unchanged).'
            : deleteTarget?.stockApplied
              ? 'The stock will return to inventory.'
              : 'This removes the document / customer-return tracking record without changing godown stock.'
        }
        confirmButtonLabel="Delete"
      />
    </div>
  );
};
