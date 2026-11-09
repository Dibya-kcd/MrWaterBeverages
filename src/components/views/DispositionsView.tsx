import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
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
import { useLedger } from '../../context/LedgerContext';
import {
  DispositionCompensationStatus,
  InventoryDisposition,
  InventoryDispositionType,
} from '../../types';
import { money } from '../../utils/billing';
import { daysOpen, exportGstrCnCsv, printDispositionClaimVoucher } from '../../utils/dispositionCn';
import { sortBatchesFefo } from '../../utils/fefo';
import { ExpiryReturnsTracker } from './ExpiryReturnsTracker';
import { CustomerReturnsList } from './CustomerReturnsList';
import { CustomerReturnLauncher } from '../common/CustomerReturnLauncher';
import { InfoTip } from "../common/InfoTip";
import { ConfirmModal } from "../ui/ConfirmModal";
import { todayISO } from "../../utils/dateLocal";

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

export const DispositionsView: React.FC = () => {
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
  } = useLedger();

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: any; settled: boolean } | null>(null);

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
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.productName || '').toLowerCase().includes(q) ||
          (r.supplierName || '').toLowerCase().includes(q) ||
          (r.batchNumber || '').toLowerCase().includes(q) ||
          (r.creditNoteNumber || '').toLowerCase().includes(q) ||
          (r.distributedToName || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [inventoryDispositions, typeFilter, search]);

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

  return (
    <div className="space-y-4">
      {msg && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {msg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-11 rounded-full bg-amber-600 text-white flex items-center justify-center shadow-md shrink-0">
            <FileWarning className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Returns & Disposals</h2>
              <InfoTip title="Returns & disposals">
                <p>Everything that leaves stock without a normal customer sale: supplier returns, free near-expiry issues, expiry / damage write-offs and customer-returned crates sent back to the company.</p>
                <p>Each claim stays <strong>pending</strong> until you record the supplier’s credit note. Recorded credit notes also appear under Supplier credits → Claims, and always edit here, where the GST split and partial receipts are kept.</p>
              </InfoTip>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
        <CustomerReturnLauncher className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-[0.99]" />
        <button
          type="button"
          onClick={() => {
            setShowForm(true);
            if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);
          }}
          className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-[0.99]"
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

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, supplier, batch, CN…"
            className="w-full pl-9 pr-3 py-2.5 rounded-full border border-black/8 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2.5 rounded-full border border-black/8 text-sm font-semibold bg-white"
        >
          <option value="all">All types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto overscroll-x-contain rounded-2xl border border-black/5 bg-white shadow-sm">
        <table className="w-full text-left data-table min-w-[640px]">
          <thead>
            <tr className="border-b border-black/5 bg-[#f6f4ef]/80">
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
                <td colSpan={7} className="text-center py-10 text-slate-500 text-sm">
                  No dispositions yet. Record returns, free issues or write-offs above.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-sky-50/40">
                  <td className="px-2 py-2.5">
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
                        title="Delete disposal (stock returns to inventory)"
                        onClick={() => {
                          setDeleteTarget({ id: r.id, settled: r.compensationStatus === 'settled' });
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
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm px-4 py-10 text-center text-sm text-slate-500">
            No dispositions yet. Record returns, free issues or write-offs above.
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-black/5 shadow-sm p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(r.compensationStatus === 'pending' || r.compensationStatus === 'partial') && (
                      <input
                        type="checkbox"
                        checked={selectedClaimIds.includes(r.id)}
                        onChange={() => toggleClaimSelect(r.id)}
                        className="rounded border-slate-300 cursor-pointer"
                      />
                    )}
                    <span className="font-mono text-[10px] font-bold text-slate-500">{r.eventDate}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#ebe8e1] text-slate-700">
                      {TYPE_OPTIONS.find((t) => t.id === r.dispositionType)?.label || r.dispositionType}
                    </span>
                  </div>
                  <div className="font-semibold text-sm text-slate-900 mt-1 truncate">
                    {r.productName || `#${r.productId}`}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {r.quantity} cs · ₹{money(r.costValue)}
                    {r.batchNumber ? ` · Lot ${r.batchNumber}` : ''}
                    {r.supplierName ? ` · ${r.supplierName}` : ''}
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md border ${statusBadge(r.compensationStatus)}`}>
                  {r.compensationStatus.replace('_', ' ')}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-black/5">
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
                    className="px-2.5 py-1.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer"
                  >
                    Record CN
                  </button>
                )}
                {(r.compensationStatus === 'pending' || r.compensationStatus === 'partial' || r.compensationStatus === 'settled') && (
                  <button
                    type="button"
                    onClick={() => printDispositionClaimVoucher([r], orgProfile)}
                    className="px-2.5 py-1.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200 cursor-pointer inline-flex items-center gap-0.5"
                  >
                    <Printer className="w-3 h-3" /> Print
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget({ id: r.id, settled: r.compensationStatus === 'settled' });
                  }}
                  className="px-2.5 py-1.5 rounded-full text-[10px] font-bold text-rose-600 border border-rose-100 cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New disposition modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" role="dialog">
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
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" role="dialog">
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
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" role="dialog">
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
          if (deleteTarget) deleteInventoryDisposition(deleteTarget.id, { restoreStock: true });
          setDeleteTarget(null);
        }}
        title="Delete this disposition?"
        message={
          deleteTarget?.settled
            ? 'This claim is SETTLED with a credit note. Deleting removes the disposal, its linked supplier CN and returns the stock.'
            : 'The stock will return to inventory.'
        }
        confirmButtonLabel="Delete"
      />
    </div>
  );
};
