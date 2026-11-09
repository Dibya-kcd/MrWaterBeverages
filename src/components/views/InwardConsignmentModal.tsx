import React, { useEffect, useMemo, useRef, useState } from 'react';
import { notify } from "../../utils/toast";
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Download,
  Edit2,
  FileCheck2,
  FileText,
  Gift,
  Package,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CATS } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { CategoryKey, GRN, GrnLineItem, GrnSchemeMode, GrnSchemeType } from '../../types';
import { normalizeTo8DigitHsn, calculateGrnLineMetrics, generateAutoSku, generateBatchNumber, money, normalizeGstFraction, resolveProductGstRate } from '../../utils/billing';
import { downloadSingleGrnCsv } from '../../utils/grnCsvExport';
import { todayISO } from "../../utils/dateLocal";

interface InwardConsignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedWarehouseId?: string;
  preselectedProductId?: number;
  initialGrnToEdit?: GRN | null;
  /** Opens bulk CSV/Excel import from the New purchase screen */
  onOpenBulkImport?: () => void;
}

interface DraftLineState {
  id: string;
  isNewProduct: boolean;
  selectedProductId?: number;
  productName: string;
  category: CategoryKey;
  hsn: string;
  pack: string;
  volume: number;
  qty: number;
  unitPrice: number;
  cgstPercent: number;
  sgstPercent: number;
  schemeType: GrnSchemeType;
  schemeMode: GrnSchemeMode;
  schemeBuyQty: number;
  schemeFreeQty: number;
  freeQty?: number;
  schemeDiscountPercent: number;
  schemeFlatDiscountPerCase: number;
  expiry: string;
  mfgDate: string;
  batchNumber: string;
  wholesaleRate: number;
  retailRate: number;
  supplierSchemeId?: string;
  supplierSchemeFreeQty?: number;
  pendingCreditSchemeId?: string;
  pendingCreditExpectedAmount?: number;
}

const defaultLineState = (category: CategoryKey = 'energy'): DraftLineState => {
  const catDef = CATS[category] || { name: 'Energy & Boost', hsn: '22021090', gst: 0.4 };
  const halfTax = Math.round((catDef.gst * 100) / 2 * 10) / 10;

  return {
    id: 'draft_' + Math.random().toString(36).slice(2, 8),
    isNewProduct: true,
    selectedProductId: undefined,
    productName: '',
    category,
    hsn: catDef.hsn,
    pack: 'PET',
    volume: 150,
    qty: 50,
    unitPrice: 158.57,
    cgstPercent: halfTax,
    sgstPercent: halfTax,
    schemeType: 'none',
    schemeMode: 'inclusive',
    schemeBuyQty: 2,
    schemeFreeQty: 1,
    freeQty: 0,
    schemeDiscountPercent: 0,
    schemeFlatDiscountPerCase: 0,
    expiry: '2026-10-31',
    mfgDate: todayISO(),
    batchNumber: '',
    wholesaleRate: 175,
    retailRate: 190,
  };
};

export const InwardConsignmentModal: React.FC<InwardConsignmentModalProps> = ({
  isOpen,
  onClose,
  preselectedWarehouseId,
  preselectedProductId,
  initialGrnToEdit,
  onOpenBulkImport,
}) => {
  const {
    products,
    warehouses,
    postGrn,
    updateGrn,
    palette,
    fz,
    supplierSchemes,
    addSupplierSchemeApplication,
    addSupplierCreditNote,
  } = useLedger();

  // Header State
  const [supplierName, setSupplierName] = useState(
    initialGrnToEdit?.supplierName || ''
  );
  const [supplierGstin, setSupplierGstin] = useState(
    initialGrnToEdit?.supplierGstin || ''
  );
  const [supplierAddress, setSupplierAddress] = useState(
    initialGrnToEdit?.supplierAddress || ''
  );
  const [supplierPhone, setSupplierPhone] = useState(
    initialGrnToEdit?.supplierPhone || ''
  );
  const [supplierEmail, setSupplierEmail] = useState(
    initialGrnToEdit?.supplierEmail || ''
  );
  const [invoiceNo, setInvoiceNo] = useState(
    initialGrnToEdit?.invoiceNo || ''
  );
  const [inwardDate, setInwardDate] = useState(
    initialGrnToEdit?.inwardDate || todayISO()
  );
  const [vehicleNo, setVehicleNo] = useState(
    initialGrnToEdit?.vehicleNo || ''
  );
  const [placeOfSupply, setPlaceOfSupply] = useState(
    initialGrnToEdit?.placeOfSupply || 'Odisha (21)'
  );
  const [billedTo, setBilledTo] = useState(
    initialGrnToEdit?.billedTo || ''
  );
  const [shippedTo, setShippedTo] = useState(
    initialGrnToEdit?.shippedTo || ''
  );
  const [showProviderFields, setShowProviderFields] = useState(false);
  // FIX: no default warehouse. If opened from an explicit context (preselectedWarehouseId,
  // e.g. "add stock" from within a specific warehouse screen) or editing an existing GRN,
  // pre-fill that. Otherwise it starts empty — the user MUST choose manually; there is no
  // fallback to defaultWarehouse/warehouses[0]/a hardcoded id.
  const [targetWarehouseId, setTargetWarehouseId] = useState(
    initialGrnToEdit?.warehouseId || preselectedWarehouseId || ''
  );
  const [notes, setNotes] = useState(initialGrnToEdit?.notes || '');

  // Review Table state: Nothing touches stock until confirmed
  const [reviewItems, setReviewItems] = useState<GrnLineItem[]>(
    initialGrnToEdit?.items || []
  );

  // Draft entry line
  const [draftLine, setDraftLine] = useState<DraftLineState>(() => {
    if (preselectedProductId) {
      const p = products.find((x) => x.id === preselectedProductId);
      if (p) {
        const catDef = CATS[p.category] || { name: 'Energy', hsn: '22021090', gst: 0.4 };
        const halfTax = Math.round((resolveProductGstRate(p) * 100) / 2 * 10) / 10;
        return {
          id: `line-${Date.now()}`,
          isNewProduct: false,
          selectedProductId: p.id,
          productName: p.name,
          category: p.category,
          hsn: p.hsn || catDef.hsn,
          pack: p.pack || 'PET',
          volume: p.volume || 150,
          qty: 24,
          unitPrice: p.cost || 210,
          cgstPercent: halfTax,
          sgstPercent: halfTax,
          schemeType: 'none',
          schemeMode: 'inclusive',
          schemeBuyQty: 2,
          schemeFreeQty: 1,
          schemeDiscountPercent: 0,
          schemeFlatDiscountPerCase: 0,
          expiry: p.expiry || '',
          mfgDate: p.mfgDate || todayISO(),
          batchNumber: generateBatchNumber(p.name),
          wholesaleRate: p.wholesale || 235,
          retailRate: p.retail || 240,
        };
      }
    }
    return defaultLineState('energy');
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(!initialGrnToEdit);
  const lineFormRef = useRef<HTMLDivElement>(null);

  // Sync state when the GRN being edited (or the preselected product) changes.
  const productsRef = useRef(products);
  productsRef.current = products;
  const grnSyncKey = `${isOpen ? 'open' : 'closed'}|${initialGrnToEdit?.id ?? ''}|${preselectedProductId ?? ''}`;
  const lastGrnSyncKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      lastGrnSyncKeyRef.current = null;
      return;
    }
    if (lastGrnSyncKeyRef.current === grnSyncKey) return;
    lastGrnSyncKeyRef.current = grnSyncKey;
    const products = productsRef.current;
    if (initialGrnToEdit) {
      setSupplierName(initialGrnToEdit.supplierName);
      setSupplierGstin(initialGrnToEdit.supplierGstin || '');
      setSupplierAddress(initialGrnToEdit.supplierAddress || '');
      setSupplierPhone(initialGrnToEdit.supplierPhone || '');
      setSupplierEmail(initialGrnToEdit.supplierEmail || '');
      setInvoiceNo(initialGrnToEdit.invoiceNo);
      setInwardDate(initialGrnToEdit.inwardDate);
      setVehicleNo(initialGrnToEdit.vehicleNo || '');
      setPlaceOfSupply(initialGrnToEdit.placeOfSupply || '');
      setBilledTo(initialGrnToEdit.billedTo || '');
      setShippedTo(initialGrnToEdit.shippedTo || '');
      setTargetWarehouseId(initialGrnToEdit.warehouseId || (warehouses[0]?.id ?? ''));
      setNotes(initialGrnToEdit.notes || '');
      setReviewItems(initialGrnToEdit.items || []);
      setEditingIndex(null);
      setShowAddForm(false);
    } else if (preselectedProductId) {
      const p = products.find((x) => x.id === preselectedProductId);
      if (p) {
        const catDef = CATS[p.category] || { name: 'Energy', hsn: '22021090', gst: 0.4 };
        const halfTax = Math.round((resolveProductGstRate(p) * 100) / 2 * 10) / 10;
        setDraftLine({
          id: `line-${Date.now()}`,
          isNewProduct: false,
          selectedProductId: p.id,
          productName: p.name,
          category: p.category,
          hsn: p.hsn || catDef.hsn,
          pack: p.pack || 'PET',
          volume: p.volume || 150,
          qty: 24,
          unitPrice: p.cost || 210,
          cgstPercent: halfTax,
          sgstPercent: halfTax,
          schemeType: 'none',
          schemeMode: 'inclusive',
          schemeBuyQty: 2,
          schemeFreeQty: 1,
          schemeDiscountPercent: 0,
          schemeFlatDiscountPerCase: 0,
          expiry: p.expiry || '',
          mfgDate: p.mfgDate || todayISO(),
          batchNumber: generateBatchNumber(p.name),
          wholesaleRate: p.wholesale || 235,
          retailRate: p.retail || 240,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grnSyncKey]);

  // Check matching existing product
  const matchingProduct = useMemo(() => {
    if (!draftLine.isNewProduct && draftLine.selectedProductId) {
      return products.find((p) => p.id === draftLine.selectedProductId);
    }
    if (draftLine.isNewProduct && draftLine.productName.trim()) {
      return products.find(
        (p) => p.name.trim().toLowerCase() === draftLine.productName.trim().toLowerCase()
      );
    }
    return undefined;
  }, [draftLine, products]);

  // Check similar existing product to prevent accidental duplicate additions
  const similarProduct = useMemo(() => {
    if (!draftLine.isNewProduct || !draftLine.productName.trim() || matchingProduct) {
      return undefined;
    }
    const cleanDraft = draftLine.productName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanDraft.length < 3) return undefined;

    return products.find((p) => {
      const cleanP = p.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanDraft.includes(cleanP) || cleanP.includes(cleanDraft);
    });
  }, [draftLine, products, matchingProduct]);

  const [lineValidationError, setLineValidationError] = useState<string | null>(null);

  // Live Auto SKU Preview
  const computedSku = useMemo(() => {
    if (!draftLine.isNewProduct && draftLine.selectedProductId) {
      const ep = products.find((p) => p.id === draftLine.selectedProductId);
      return ep?.sku || generateAutoSku(ep?.name || '', draftLine.category, ep?.id || 1);
    }
    if (matchingProduct) {
      return matchingProduct.sku;
    }
    const tentativeName = draftLine.productName.trim() || 'NEW BEVERAGE';
    return generateAutoSku(tentativeName, draftLine.category, products.length + 1);
  }, [draftLine, products, matchingProduct]);

  // Line metrics calculation
  const metrics = useMemo(() => {
    let freeQty = 0;
    const mode = draftLine.schemeMode || 'inclusive';

    if (draftLine.schemeType === 'b2g1') {
      const buyQty = Math.max(1, draftLine.schemeBuyQty);
      const freePerBuy = Math.max(1, draftLine.schemeFreeQty);
      if (draftLine.freeQty !== undefined && draftLine.freeQty !== null && Number(draftLine.freeQty) >= 0) {
        freeQty = Math.max(0, Number(draftLine.freeQty));
      } else {
        const cycle = mode === 'inclusive' ? buyQty + freePerBuy : buyQty;
        freeQty = cycle > 0 ? Math.floor(draftLine.qty / cycle) * freePerBuy : 0;
      }
    } else if (draftLine.schemeType === 'free_cases') {
      freeQty = Math.max(0, Number(draftLine.freeQty ?? draftLine.schemeFreeQty) || 0);
    }

    return calculateGrnLineMetrics({
      qty: draftLine.qty,
      unitPrice: draftLine.unitPrice,
      cgstPercent: draftLine.cgstPercent,
      sgstPercent: draftLine.sgstPercent,
      schemeType: draftLine.schemeType,
      schemeMode: mode,
      schemeBuyQty: draftLine.schemeBuyQty,
      schemeFreeQty: draftLine.schemeFreeQty,
      freeQty,
      discountPercent: draftLine.schemeDiscountPercent,
      discountFlat: draftLine.schemeFlatDiscountPerCase,
    });
  }, [draftLine]);

  // Totals for the review table
  const totals = useMemo(() => {
    let billed = 0;
    let free = 0;
    let paid = 0;
    let totalCases = 0;
    let taxable = 0;
    let cgst = 0;
    let sgst = 0;
    let savings = 0;
    let grand = 0;

    for (const item of reviewItems) {
      const bld = Number(item.qty) || 0;
      const fr = Number(item.freeQty) || 0;
      const rec = Number(item.totalReceivedQty) || (item.schemeMode === 'additive' ? bld + fr : bld);
      const pd = item.paidQty !== undefined ? Number(item.paidQty) : Math.max(0, bld - fr);

      billed += bld;
      free += fr;
      paid += pd;
      totalCases += rec;
      taxable += Number(item.taxableAmount) || 0;
      cgst += Number(item.cgstAmount) || 0;
      sgst += Number(item.sgstAmount) || 0;
      savings += Number(item.discountAmount) || 0;
      grand += Number(item.lineTotal) || 0;
    }

    return {
      billed,
      free,
      paid,
      totalCases,
      taxable,
      cgst,
      sgst,
      savings,
      grand,
    };
  }, [reviewItems]);

  if (!isOpen) return null;

  const handleCategoryChange = (cat: CategoryKey) => {
    const catDef = CATS[cat];
    let half = 10;
    if (cat === 'joos') half = 2.5;
    else if (cat === 'water') half = 9;
    else if (catDef) half = Math.round((catDef.gst * 100) / 2 * 10) / 10;

    setDraftLine((prev) => ({
      ...prev,
      category: cat,
      hsn: normalizeTo8DigitHsn(catDef?.hsn, cat, prev.productName),
      cgstPercent: half,
      sgstPercent: half,
    }));
  };

  const handleSelectExisting = (prodId: number) => {
    const p = products.find((x) => x.id === prodId);
    if (!p) return;
    const frac = resolveProductGstRate(p);
    const halfTax = Math.round((frac * 100) / 2 * 10) / 10;

    setDraftLine((prev) => ({
      ...prev,
      isNewProduct: false,
      selectedProductId: prodId,
      productName: p.name,
      category: p.category,
      hsn: normalizeTo8DigitHsn(p.hsn || CATS[p.category]?.hsn, p.category, p.name),
      pack: p.pack || 'PET',
      volume: p.volume || 150,
      unitPrice: p.cost,
      wholesaleRate: p.wholesale,
      retailRate: p.retail,
      cgstPercent: halfTax,
      sgstPercent: halfTax,
      expiry: p.expiry || '',
    }));
  };

  const handleAddDraftToReview = () => {
    setLineValidationError(null);
    const effectiveName = (draftLine.isNewProduct
      ? draftLine.productName.trim()
      : draftLine.productName).toUpperCase();

    if (!effectiveName) {
      setLineValidationError('Please enter or select a beverage product description.');
      return;
    }
    if (draftLine.qty <= 0) {
      setLineValidationError('Billed quantity must be at least 1 case.');
      return;
    }

    let schemeLabelText = '';
    const isInc = draftLine.schemeMode === 'inclusive';
    if (draftLine.schemeType === 'b2g1') {
      schemeLabelText = isInc
        ? `Buy ${draftLine.schemeBuyQty} Get ${draftLine.schemeFreeQty} Free (${metrics.freeQty} Free of ${draftLine.qty} cs · ${metrics.paidQty} Paid · Incl.)`
        : `Buy ${draftLine.schemeBuyQty} Get ${draftLine.schemeFreeQty} Free (+${metrics.freeQty} Bonus · ${metrics.totalReceivedQty} cs Total)`;
    } else if (draftLine.schemeType === 'free_cases') {
      schemeLabelText = isInc
        ? `${metrics.freeQty} Free Crates included in ${draftLine.qty} cs (${metrics.paidQty} Paid)`
        : `+${metrics.freeQty} Extra Free Crates on top of ${draftLine.qty} cs (${metrics.totalReceivedQty} Total)`;
    } else if (draftLine.schemeType === 'discount_percent') {
      schemeLabelText = `${draftLine.schemeDiscountPercent}% Discount`;
    } else if (draftLine.schemeType === 'discount_flat') {
      schemeLabelText = `₹${draftLine.schemeFlatDiscountPerCase}/case Off`;
    }

    const freeCasesCalculated = metrics.freeQty;

    const item: GrnLineItem = {
      id:
        editingIndex !== null && reviewItems[editingIndex]
          ? reviewItems[editingIndex].id
          : 'item_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      isNewProduct: draftLine.isNewProduct,
      productId: matchingProduct?.id || draftLine.selectedProductId,
      productName: effectiveName,
      category: draftLine.category,
      sku: computedSku,
      hsn: draftLine.hsn,
      pack: draftLine.pack,
      volume: draftLine.volume,
      qty: draftLine.qty,
      paidQty: metrics.paidQty,
      freeQty: freeCasesCalculated,
      totalReceivedQty: metrics.totalReceivedQty,
      unitPrice: draftLine.unitPrice,
      effectiveCostPerUnit: metrics.effectiveCostPerUnit,
      landedCostPerUnit: metrics.landedCostPerUnit,
      landedCostPerCrate: metrics.landedCostPerUnit, // metrics.landedCostPerUnit is crate-level
      landedCostPerCrateExGst: metrics.effectiveCostPerUnit,
      cgstPercent: draftLine.cgstPercent,
      sgstPercent: draftLine.sgstPercent,
      taxableAmount: metrics.taxableAmount,
      cgstAmount: metrics.cgstAmount,
      sgstAmount: metrics.sgstAmount,
      taxAmount: metrics.taxAmount,
      schemeType: draftLine.schemeType,
      schemeMode: draftLine.schemeMode,
      schemeBuyQty: draftLine.schemeBuyQty,
      schemeFreeQty: draftLine.schemeFreeQty,
      discountPercent: draftLine.schemeDiscountPercent,
      discountFlat: draftLine.schemeFlatDiscountPerCase,
      discountAmount: metrics.discountAmount,
      schemeText: schemeLabelText,
      lineTotal: metrics.lineTotal,
      expiry: draftLine.expiry,
      mfgDate: draftLine.mfgDate,
      batchNumber:
        draftLine.batchNumber.trim() ||
        generateBatchNumber(effectiveName, draftLine.schemeType !== 'none' ? 'SCH' : undefined),
      wholesaleRate: draftLine.wholesaleRate,
      retailRate: draftLine.retailRate,
      supplierSchemeId: draftLine.supplierSchemeId,
      supplierSchemeFreeQty: draftLine.supplierSchemeId ? draftLine.supplierSchemeFreeQty || 0 : undefined,
      pendingCreditSchemeId: draftLine.pendingCreditSchemeId,
      pendingCreditEligibleQty: draftLine.pendingCreditSchemeId ? draftLine.qty : undefined,
      pendingCreditExpectedAmount: draftLine.pendingCreditSchemeId ? draftLine.pendingCreditExpectedAmount || 0 : undefined,
    };

    if (editingIndex !== null) {
      setReviewItems((prev) => prev.map((it, i) => (i === editingIndex ? item : it)));
      setEditingIndex(null);
      if (initialGrnToEdit) {
        setShowAddForm(false);
      }
    } else {
      setReviewItems((prev) => [...prev, item]);
    }

    setDraftLine(defaultLineState(draftLine.category));
  };

  const handleEditRow = (idx: number) => {
    const it = reviewItems[idx];
    if (!it) return;
    setDraftLine({
      id: it.id,
      isNewProduct: !it.productId,
      selectedProductId: it.productId,
      productName: it.productName,
      category: it.category,
      hsn: it.hsn,
      pack: it.pack || 'PET',
      volume: it.volume || 150,
      qty: it.qty,
      unitPrice: it.unitPrice,
      cgstPercent: it.cgstPercent,
      sgstPercent: it.sgstPercent,
      schemeType: it.schemeType || 'none',
      schemeMode: it.schemeMode || 'inclusive',
      schemeBuyQty: it.schemeBuyQty || 2,
      schemeFreeQty: it.schemeFreeQty || 1,
      freeQty: it.freeQty || 0,
      schemeDiscountPercent: it.discountPercent || 0,
      schemeFlatDiscountPerCase: it.discountFlat || 0,
      expiry: it.expiry,
      mfgDate: it.mfgDate || todayISO(),
      batchNumber: it.batchNumber,
      wholesaleRate: it.wholesaleRate || Math.round(it.unitPrice * 1.1),
      retailRate: it.retailRate || Math.round(it.unitPrice * 1.25),
      supplierSchemeId: it.supplierSchemeId,
      supplierSchemeFreeQty: it.supplierSchemeFreeQty,
      pendingCreditSchemeId: it.pendingCreditSchemeId,
      pendingCreditExpectedAmount: it.pendingCreditExpectedAmount,
    });
    setEditingIndex(idx);
    setShowAddForm(true);
    setTimeout(() => {
      lineFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const handleDeleteRow = (idx: number) => {
    setReviewItems((prev) => prev.filter((_, i) => i !== idx));
    if (editingIndex === idx) {
      setEditingIndex(null);
      setDraftLine(defaultLineState());
    }
  };

  const handleConfirmAndPost = () => {
    if (!supplierName.trim()) {
      notify('Please specify Supplier / Party Name.');
      return;
    }
    if (!invoiceNo.trim()) {
      notify('Please specify Invoice Number.');
      return;
    }
    if (reviewItems.length === 0) {
      notify('Please add at least one line item into the review table.');
      return;
    }
    // FIX: warehouse is mandatory and manual — no default is ever assumed.
    if (!targetWarehouseId) {
      notify('Select the warehouse this invoice is being received into before confirming — there is no default.');
      return;
    }

    try {
      if (initialGrnToEdit) {
      updateGrn(initialGrnToEdit.id, {
        supplierName: supplierName.trim(),
        supplierGstin: supplierGstin.trim(),
        supplierAddress: supplierAddress.trim(),
        supplierPhone: supplierPhone.trim(),
        supplierEmail: supplierEmail.trim(),
        invoiceNo: invoiceNo.trim(),
        inwardDate,
        vehicleNo: vehicleNo.trim(),
        placeOfSupply: placeOfSupply.trim(),
        billedTo: billedTo.trim(),
        shippedTo: shippedTo.trim(),
        warehouseId: targetWarehouseId,
        notes: notes.trim(),
        items: reviewItems,
        totalBilledQty: totals.billed,
        totalFreeQty: totals.free,
        totalPaidQty: totals.paid,
        totalReceivedQty: totals.totalCases,
        totalTaxable: totals.taxable,
        totalCgst: totals.cgst,
        totalSgst: totals.sgst,
        totalTax: totals.cgst + totals.sgst,
        grandTotal: totals.grand,
      });

      setSuccessMessage(
        `Successfully updated ${initialGrnToEdit.grnNumber}! Stock recalculated across inventory & products.`
      );
    } else {
      const posted = postGrn({
        supplierName: supplierName.trim(),
        supplierGstin: supplierGstin.trim(),
        supplierAddress: supplierAddress.trim(),
        supplierPhone: supplierPhone.trim(),
        supplierEmail: supplierEmail.trim(),
        invoiceNo: invoiceNo.trim(),
        inwardDate,
        vehicleNo: vehicleNo.trim(),
        placeOfSupply: placeOfSupply.trim(),
        billedTo: billedTo.trim(),
        shippedTo: shippedTo.trim(),
        warehouseId: targetWarehouseId,
        notes: notes.trim(),
        items: reviewItems,
        totalBilledQty: totals.billed,
        totalFreeQty: totals.free,
        totalPaidQty: totals.paid,
        totalReceivedQty: totals.totalCases,
        totalTaxable: totals.taxable,
        totalCgst: totals.cgst,
        totalSgst: totals.sgst,
        totalTax: totals.cgst + totals.sgst,
        grandTotal: totals.grand,
      });

      setSuccessMessage(
        `Successfully confirmed & posted ${posted.grnNumber}! Real-time stock updated in all godowns.`
      );

      // Supplier Scheme traceability (mirrors BulkInwardModal — see there for full notes)
      posted.items.forEach((item) => {
        if (item.supplierSchemeId && item.supplierSchemeFreeQty && item.supplierSchemeFreeQty > 0) {
          addSupplierSchemeApplication({
            schemeId: item.supplierSchemeId,
            schemeType: 'free_goods',
            grnId: posted.id,
            grnLineId: item.id,
            productId: item.productId || 0,
            supplierName: posted.supplierName,
            supplierInvoiceNo: posted.invoiceNo,
            eligibleQuantity: item.qty - item.freeQty,
            freeQuantity: item.supplierSchemeFreeQty,
            expectedBenefit: 0,
            warehouseId: posted.warehouseId,
          });
        }
        if (item.pendingCreditSchemeId && item.pendingCreditExpectedAmount && item.pendingCreditExpectedAmount > 0) {
          addSupplierSchemeApplication({
            schemeId: item.pendingCreditSchemeId,
            schemeType: 'pending_credit',
            grnId: posted.id,
            grnLineId: item.id,
            productId: item.productId || 0,
            supplierName: posted.supplierName,
            supplierInvoiceNo: posted.invoiceNo,
            eligibleQuantity: item.pendingCreditEligibleQty || 0,
            freeQuantity: 0,
            expectedBenefit: item.pendingCreditExpectedAmount,
            warehouseId: posted.warehouseId,
          });
          addSupplierCreditNote({
            supplierName: posted.supplierName,
            schemeId: item.pendingCreditSchemeId,
            grnId: posted.id,
            productId: item.productId,
            expectedAmount: item.pendingCreditExpectedAmount,
            actualAmount: 0,
            notes: `Auto-created from GRN ${posted.grnNumber} · ${item.productName}`,
          });
        }
      });
      }
    } catch (err: any) {
      // GrnValidationError from postGrn/updateGrn (missing warehouse, missing batch
      // number or expiry on a line, duplicate invoice number, etc.).
      const issues = err?.issues as { message: string }[] | undefined;
      notify(
        issues && issues.length > 0
          ? `Could not post this invoice:\n${issues.map((i) => `• ${i.message}`).join('\n')}`
          : err?.message || 'Failed to post GRN.'
      );
      return;
    }

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const labelStyle = fz(12, {
    fontWeight: 700,
    color: palette.muted,
    textTransform: 'uppercase' as const,
    marginBottom: '0.25rem',
    display: 'block',
  });

  const fieldCls =
    'w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25';
  const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#faf8f5] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col my-0 sm:my-6 max-h-[94vh] overflow-hidden border border-black/5">
        {/* Modal Header — matches Purchases / New purchase UI */}
        <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-black/5 bg-[#faf8f5] sticky top-0 z-10">
          <div className="min-w-0 flex items-start gap-2">
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 p-1.5 -ml-1 rounded-full hover:bg-black/5 cursor-pointer text-slate-600 shrink-0"
              aria-label="Back"
            >
              <X size={18} className="sm:hidden" />
              <span className="hidden sm:inline text-lg leading-none">←</span>
            </button>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">
                {initialGrnToEdit
                  ? `Edit purchase (${initialGrnToEdit.grnNumber})`
                  : 'New purchase'}
              </h2>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                Supplier invoice with batch, expiry &amp; scheme
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!initialGrnToEdit && onOpenBulkImport && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBulkImport();
                }}
                className="hidden sm:inline-flex px-3 py-1.5 rounded-full text-xs font-semibold border border-black/10 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Bulk import
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="size-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-black/5 cursor-pointer"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        {!initialGrnToEdit && onOpenBulkImport && (
          <div className="sm:hidden px-4 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBulkImport();
              }}
              className="w-full py-2 rounded-xl text-xs font-semibold border border-dashed border-black/15 bg-white text-slate-600 cursor-pointer"
            >
              Or bulk import CSV / Excel / PDF
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {successMessage && (
            <div className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50 flex items-center gap-3 text-emerald-800 text-sm font-semibold">
              <CheckCircle2 size={20} />
              <div>{successMessage}</div>
            </div>
          )}

          {/* 1. Invoice Header — Crate card */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Supplier</label>
                <input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Choose…"
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls}>Supplier invoice no.</label>
                <input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls}>Invoice date</label>
                <input
                  type="date"
                  value={inwardDate}
                  onChange={(e) => setInwardDate(e.target.value)}
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls}>Receive into</label>
                <select
                  value={targetWarehouseId}
                  onChange={(e) => setTargetWarehouseId(e.target.value)}
                  required
                  className={`${fieldCls} cursor-pointer ${!targetWarehouseId ? 'border-rose-300' : ''}`}
                >
                  <option value="">Choose godown…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
                {!targetWarehouseId && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1">
                    Required — this invoice cannot be posted until a warehouse is chosen.
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>Supplier GSTIN</label>
                <input autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                  value={supplierGstin}
                  onChange={(e) => setSupplierGstin(e.target.value)}
                  placeholder="Optional"
                  className={`${fieldCls} font-mono uppercase`}
                />
              </div>
              <div>
                <label className={labelCls}>Vehicle no.</label>
                <input
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  placeholder="Optional"
                  className={`${fieldCls} font-mono uppercase`}
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowProviderFields((prev) => !prev)}
                  className="text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                >
                  {showProviderFields ? 'Hide more details' : '+ More details (address, phone, POS)'}
                </button>
              </div>
            </div>

            {showProviderFields && (
              <div className="mt-3 pt-3 border-t-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs" style={{ borderColor: palette.line }}>
                <div className="md:col-span-2">
                  <label style={labelStyle}>Supplier Registered Address</label>
                  <input
                    value={supplierAddress}
                    onChange={(e) => setSupplierAddress(e.target.value)}
                    placeholder="Main Road, Near Bus Stand, Kuchinda - 768222"
                    className="w-full border-2 px-3 py-1 text-xs"
                    style={{ borderColor: palette.line }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Supplier Phone / Mobile</label>
                  <input inputMode="tel" autoComplete="tel"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    placeholder="+91 94370 84801"
                    className="w-full border-2 px-3 py-1 text-xs"
                    style={{ borderColor: palette.line }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Supplier Email</label>
                  <input
                    value={supplierEmail}
                    onChange={(e) => setSupplierEmail(e.target.value)}
                    placeholder="supplier@example.com"
                    className="w-full border-2 px-3 py-1 text-xs"
                    style={{ borderColor: palette.line }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Place of Supply (POS)</label>
                  <input
                    value={placeOfSupply}
                    onChange={(e) => setPlaceOfSupply(e.target.value)}
                    placeholder="Odisha (21)"
                    className="w-full border-2 px-3 py-1 text-xs"
                    style={{ borderColor: palette.line }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Billed To (Consignee)</label>
                  <input
                    value={billedTo}
                    onChange={(e) => setBilledTo(e.target.value)}
                    placeholder="NEW BIJAYA PUSTAK BHANDRA"
                    className="w-full border-2 px-3 py-1 text-xs"
                    style={{ borderColor: palette.line }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Saved GRN Edit Notice / Expand Toggle */}
          {initialGrnToEdit && !showAddForm && editingIndex === null && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs text-emerald-950 font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-emerald-700" />
                  <span>Editing Saved Purchase {initialGrnToEdit.grnNumber} ({reviewItems.length} items loaded)</span>
                </div>
                <div className="text-[11px] text-emerald-800 mt-0.5">
                  Click the <strong>Edit (✏️)</strong> button on any row in the table below to edit its quantity, price, scheme, or batch.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingIndex(null);
                  setDraftLine(defaultLineState());
                  setShowAddForm(true);
                }}
                className="shrink-0 px-3.5 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold hover:bg-[var(--primary-hover)] cursor-pointer shadow-sm"
              >
                + Add Another Product
              </button>
            </div>
          )}

          {/* 2. Line Entry Form */}
          {(!initialGrnToEdit || showAddForm || editingIndex !== null) && (
          <div
            ref={lineFormRef}
            className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${
              editingIndex !== null
                ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50/20'
                : 'border-black/5'
            }`}
          >
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-black/5">
              <div className="font-semibold text-sm flex items-center gap-2 text-slate-900">
                <Package size={16} className={editingIndex !== null ? 'text-amber-600' : 'text-[var(--primary)]'} />
                <span>
                  {editingIndex !== null
                    ? `✏️ Edit Item #${editingIndex + 1}: ${draftLine.productName}`
                    : '+ Add product'}
                </span>
                {editingIndex !== null && (
                  <span className="text-xs px-2 py-0.5 font-bold rounded bg-amber-500 text-white">
                    Modifying Row #{editingIndex + 1}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {initialGrnToEdit && editingIndex === null && (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 border rounded cursor-pointer"
                  >
                    Hide Form
                  </button>
                )}
              </div>
              <div className="flex border-2 p-0.5" style={{ borderColor: palette.line }}>
                <button
                  type="button"
                  onClick={() => setDraftLine((prev) => ({ ...prev, isNewProduct: false }))}
                  className="px-2.5 py-1 text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: !draftLine.isNewProduct ? palette.navy : 'transparent',
                    color: !draftLine.isNewProduct ? '#FFFFFF' : palette.ink,
                  }}
                >
                  Existing Product
                </button>
                <button
                  type="button"
                  onClick={() => setDraftLine((prev) => ({ ...prev, isNewProduct: true }))}
                  className="px-2.5 py-1 text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: draftLine.isNewProduct ? palette.navy : 'transparent',
                    color: draftLine.isNewProduct ? '#FFFFFF' : palette.ink,
                  }}
                >
                  + New Product
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-3">
              {!draftLine.isNewProduct ? (
                <div className="md:col-span-2">
                  <label style={labelStyle}>Pick Existing Beverage</label>
                  <select
                    value={draftLine.selectedProductId || ''}
                    onChange={(e) => handleSelectExisting(Number(e.target.value))}
                    className="w-full border-2 px-3 py-1.5 text-sm font-semibold"
                    style={{ borderColor: palette.line }}
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="md:col-span-2">
                  <label style={labelStyle}>Product Description *</label>
                  <input
                    value={draftLine.productName}
                    onChange={(e) => {
                      setDraftLine((prev) => ({ ...prev, productName: e.target.value.toUpperCase() }));
                      if (lineValidationError) setLineValidationError(null);
                    }}
                    placeholder="e.g. CAMPA POWER UP 150ML"
                    className="w-full border-2 px-3 py-1.5 font-bold text-sm uppercase"
                    style={{ borderColor: palette.line }}
                  />
                  {matchingProduct && (
                    <div className="text-xs text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                      <span>✓ Matches catalog product — will reuse SKU {matchingProduct.sku}</span>
                    </div>
                  )}
                  {similarProduct && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900 flex items-center justify-between gap-2">
                      <div>
                        Similar product exists: <strong>{similarProduct.name}</strong> ({similarProduct.pack})
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectExisting(similarProduct.id)}
                        className="px-2 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold rounded text-[11px] cursor-pointer"
                      >
                        Use Existing
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={draftLine.category}
                  onChange={(e) => handleCategoryChange(e.target.value as CategoryKey)}
                  className="w-full border-2 px-3 py-1.5 text-sm"
                  style={{ borderColor: palette.line }}
                >
                  {Object.entries(CATS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Auto SKU Preview</label>
                <div
                  className="border-2 px-3 py-1.5 font-mono font-bold text-sm flex items-center justify-between"
                  style={{ borderColor: palette.line, backgroundColor: `${palette.navy}08` }}
                >
                  <span>{computedSku}</span>
                  <span className="text-xs font-bold text-gray-500">Auto</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <div>
                <label style={labelStyle}>HSN Code</label>
                <input
                  value={draftLine.hsn}
                  onChange={(e) => setDraftLine((prev) => ({ ...prev, hsn: e.target.value }))}
                  className="w-full border-2 px-3 py-1.5 text-sm font-mono"
                  style={{ borderColor: palette.line }}
                />
              </div>
              <div>
                <label style={labelStyle}>Billed Qty (Cases)</label>
                <input
                  type="number" inputMode="numeric"
                  min="1"
                  value={draftLine.qty}
                  onChange={(e) =>
                    setDraftLine((prev) => ({ ...prev, qty: Math.max(1, Number(e.target.value) || 0) }))
                  }
                  className="w-full border-2 px-3 py-1.5 text-sm font-bold"
                  style={{ borderColor: palette.line }}
                />
              </div>
              <div>
                <label style={labelStyle}>Unit Price (₹/Case)</label>
                <input
                  type="number" inputMode="decimal"
                  step="0.01"
                  value={draftLine.unitPrice}
                  onChange={(e) =>
                    setDraftLine((prev) => ({ ...prev, unitPrice: Number(e.target.value) || 0 }))
                  }
                  className="w-full border-2 px-3 py-1.5 text-sm font-bold"
                  style={{ borderColor: palette.line }}
                />
              </div>
              <div>
                <label style={labelStyle}>Expiry Date</label>
                <input
                  type="date"
                  value={draftLine.expiry}
                  onChange={(e) => setDraftLine((prev) => ({ ...prev, expiry: e.target.value }))}
                  className="w-full border-2 px-3 py-1.5 text-sm"
                  style={{ borderColor: palette.line }}
                />
              </div>
            </div>

            {/* Scheme section */}
            <div
              className="p-3 border-2 mb-3 text-xs rounded-lg"
              style={{ borderColor: palette.amber, backgroundColor: `${palette.amber}0a` }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <span className="font-bold flex items-center gap-1.5">
                  <Gift size={15} style={{ color: palette.amber }} />
                  Scheme / Free Crates / Discount
                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded">
                    Included in Bill · Zero Double-Count
                  </span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { key: 'none', label: 'No Scheme' },
                      { key: 'b2g1', label: 'Buy X Get Y Free' },
                      { key: 'free_cases', label: 'Free Crates' },
                      { key: 'discount_percent', label: '% Discount' },
                      { key: 'discount_flat', label: 'Flat ₹/Case' },
                    ] as const
                  ).map((st) => (
                    <label
                      key={st.key}
                      className={`flex items-center gap-1 font-bold px-2 py-0.5 rounded cursor-pointer text-[11px] ${
                        draftLine.schemeType === st.key
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        checked={draftLine.schemeType === st.key}
                        onChange={() => setDraftLine((p) => ({ ...p, schemeType: st.key }))}
                        className="sr-only"
                      />
                      <span>{st.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Scheme Billing Mode Selector */}
              {(draftLine.schemeType === 'b2g1' || draftLine.schemeType === 'free_cases') && (
                <div className="mb-2 p-2 bg-white border border-amber-200 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-700">
                    <strong>Billing Mode:</strong>{' '}
                    {draftLine.schemeMode === 'inclusive'
                      ? 'Free crates are part of the billed case count. Godown receives billed quantity.'
                      : 'Bonus crates are extra on top of invoice. Godown receives billed + free.'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDraftLine((p) => ({ ...p, schemeMode: 'inclusive' }))}
                      className={`px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer ${
                        draftLine.schemeMode === 'inclusive'
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      Included in Bill (Standard)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftLine((p) => ({ ...p, schemeMode: 'additive' }))}
                      className={`px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer ${
                        draftLine.schemeMode === 'additive'
                          ? 'bg-purple-700 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      Extra on Top (Bonus)
                    </button>
                  </div>
                </div>
              )}

              {draftLine.schemeType === 'b2g1' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mb-2">
                  <div className="flex items-center gap-2">
                    <span>
                      Buy (X):
                      <input
                        type="number" inputMode="numeric"
                        min="1"
                        value={draftLine.schemeBuyQty}
                        onChange={(e) =>
                          setDraftLine((p) => ({ ...p, schemeBuyQty: Math.max(1, Number(e.target.value) || 1), freeQty: undefined }))
                        }
                        className="w-14 ml-1 border px-1.5 py-0.5 font-bold"
                      />
                    </span>
                    <span>
                      Get (Y):
                      <input
                        type="number" inputMode="numeric"
                        min="1"
                        value={draftLine.schemeFreeQty}
                        onChange={(e) =>
                          setDraftLine((p) => ({ ...p, schemeFreeQty: Math.max(1, Number(e.target.value) || 1), freeQty: undefined }))
                        }
                        className="w-14 ml-1 border px-1.5 py-0.5 font-bold"
                      />
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-600 block mb-0.5">Free Crates:</span>
                    <input
                      type="number" inputMode="numeric"
                      min="0"
                      value={metrics.freeQty}
                      onChange={(e) =>
                        setDraftLine((p) => ({ ...p, freeQty: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="w-20 border px-1.5 py-0.5 font-bold text-emerald-800 bg-emerald-50 border-emerald-300"
                    />
                  </div>
                  <div className="text-right text-[11px] text-slate-600">
                    Paid: <strong className="text-sky-700">{metrics.paidQty} cs</strong> · Free:{' '}
                    <strong className="text-emerald-700">{metrics.freeQty} cs</strong> · Inward:{' '}
                    <strong className="text-slate-900">{metrics.totalReceivedQty} cs</strong>
                  </div>
                </div>
              )}

              {draftLine.schemeType === 'free_cases' && (
                <div className="flex items-center gap-4 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">Free Crates on Bill:</span>
                    <input
                      type="number" inputMode="numeric"
                      min="0"
                      value={draftLine.freeQty ?? draftLine.schemeFreeQty ?? 0}
                      onChange={(e) =>
                        setDraftLine((p) => ({
                          ...p,
                          freeQty: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="w-20 border px-1.5 py-0.5 font-bold text-emerald-800 bg-emerald-50 border-emerald-300"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 5, 10].map((add) => (
                      <button
                        key={add}
                        type="button"
                        onClick={() =>
                          setDraftLine((p) => ({ ...p, freeQty: (p.freeQty || 0) + add }))
                        }
                        className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-semibold hover:bg-slate-50 cursor-pointer"
                      >
                        +{add} cs
                      </button>
                    ))}
                  </div>
                  <span className="font-bold text-amber-700 ml-auto">
                    Discount Savings: −₹{money(metrics.discountAmount)}
                  </span>
                </div>
              )}

              {draftLine.schemeType === 'discount_percent' && (
                <div className="flex items-center gap-3 mb-2">
                  <span>
                    Discount %:
                    <input
                      type="number" inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.1"
                      value={draftLine.schemeDiscountPercent}
                      onChange={(e) =>
                        setDraftLine((p) => ({ ...p, schemeDiscountPercent: Number(e.target.value) || 0 }))
                      }
                      className="w-16 ml-1 border px-1.5 py-0.5 font-bold"
                    />
                  </span>
                  <span className="font-bold text-amber-700">
                    Discount Amount: −₹{money(metrics.discountAmount)}
                  </span>
                </div>
              )}

              {draftLine.schemeType === 'discount_flat' && (
                <div className="flex items-center gap-3 mb-2">
                  <span>
                    Flat discount per case (₹):
                    <input
                      type="number" inputMode="numeric"
                      min="0"
                      step="1"
                      value={draftLine.schemeFlatDiscountPerCase}
                      onChange={(e) =>
                        setDraftLine((p) => ({ ...p, schemeFlatDiscountPerCase: Number(e.target.value) || 0 }))
                      }
                      className="w-20 ml-1 border px-1.5 py-0.5 font-bold"
                    />
                  </span>
                  <span className="font-bold text-amber-700">
                    Discount Amount: −₹{money(metrics.discountAmount)}
                  </span>
                </div>
              )}

              {/* Physical Godown Inward Stock Verification Banner */}
              <div className="p-2 bg-white border border-emerald-500/40 rounded flex items-center justify-between text-xs mt-2">
                <span className="text-slate-700">
                  Physical Stock entering Godown:{' '}
                  <strong className="text-emerald-800 text-sm font-mono">{metrics.totalReceivedQty} crates</strong>
                  <span className="text-[11px] text-slate-500 ml-1">
                    ({metrics.paidQty} paid + {metrics.freeQty} free included in bill)
                  </span>
                </span>
                <span className="font-bold text-sky-700 font-mono text-xs">
                  Effective Landed: ₹{money(metrics.landedCostPerUnit)}/cs
                </span>
              </div>

              {/* Supplier Scheme (additive layer, independent of the invoice scheme above) */}
              <div className="mt-2 p-2 bg-amber-50/60 border border-amber-200 rounded-md space-y-1.5">
                <label className="text-[11px] font-semibold text-amber-900 block">Supplier Scheme (optional)</label>
                <select
                  value={draftLine.supplierSchemeId || draftLine.pendingCreditSchemeId || ''}
                  onChange={(e) => {
                    const scheme = supplierSchemes.find((s) => s.id === e.target.value);
                    setDraftLine((p) => ({
                      ...p,
                      supplierSchemeId: scheme?.schemeType === 'free_goods' ? scheme.id : undefined,
                      pendingCreditSchemeId: scheme?.schemeType === 'pending_credit' ? scheme.id : undefined,
                    }));
                  }}
                  className="text-xs border px-2 py-1 rounded w-full"
                  title="Attach a named Supplier Scheme — free goods add on top of the qty above; pending credit flags this line for a future credit note"
                >
                  <option value="">No Supplier Scheme</option>
                  {supplierSchemes
                    .filter((s) => s.active && s.schemeType !== 'volume_incentive')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.schemeType === 'free_goods' ? 'Free Goods' : 'Pending Credit'} — {s.name}
                      </option>
                    ))}
                </select>
                {draftLine.supplierSchemeId && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="text-slate-600">Additive free CASE (on top of {draftLine.qty} billed):</span>
                    <input
                      type="number" inputMode="numeric"
                      min="0"
                      value={draftLine.supplierSchemeFreeQty ?? 0}
                      onChange={(e) =>
                        setDraftLine((p) => ({ ...p, supplierSchemeFreeQty: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="w-16 border px-1 py-0.5 rounded text-right font-mono shrink-0"
                    />
                    <span className="font-bold text-emerald-700 basis-full sm:basis-auto">
                      = {metrics.totalReceivedQty + (draftLine.supplierSchemeFreeQty || 0)} cases physically received
                    </span>
                  </div>
                )}
                {draftLine.pendingCreditSchemeId && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-600">Expected supplier credit (₹):</span>
                    <input
                      type="number" inputMode="decimal"
                      min="0"
                      value={draftLine.pendingCreditExpectedAmount ?? 0}
                      onChange={(e) =>
                        setDraftLine((p) => ({ ...p, pendingCreditExpectedAmount: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="w-24 border px-1 py-0.5 rounded text-right font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="mt-2 pt-2 border-t flex items-center justify-between font-medium">
                <span>
                  Landed Price: <strong>₹{money(metrics.landedCostPerUnit)}/case</strong>
                </span>
                <span>
                  Tax Rate: <strong>{draftLine.cgstPercent + draftLine.sgstPercent}%</strong>
                </span>
                <span className="font-bold text-green-700">
                  Line Total: ₹{money(metrics.lineTotal)}
                </span>
              </div>
            </div>

            {lineValidationError && (
              <div className="mb-3 p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{lineValidationError}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddDraftToReview}
                className="flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer rounded-xl transition-colors shadow-sm"
                style={{
                  backgroundColor: editingIndex !== null ? '#d97706' : palette.navy,
                  color: '#FFFFFF',
                }}
              >
                {editingIndex !== null ? <Check size={16} /> : <Plus size={16} />}
                {editingIndex !== null ? `Save Changes to Item #${editingIndex + 1}` : 'Add Line to Invoice'}
              </button>
              {editingIndex !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingIndex(null);
                    if (initialGrnToEdit) setShowAddForm(false);
                    setDraftLine(defaultLineState());
                  }}
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-sm font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          )}

          {/* 3. Review-before-confirm Table */}
          <div className="border-2 p-4" style={{ borderColor: palette.line }}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b">
              <div className="font-bold text-sm flex items-center gap-2">
                <FileCheck2 size={16} style={{ color: palette.navy }} />
                <span>Invoice Items ({reviewItems.length})</span>
              </div>
            </div>

            {reviewItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-500">
                No items added yet. Add items using the form above.
              </div>
            ) : (
              <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm border mb-3">
                <table className="w-full text-left data-table text-xs">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="p-2">SKU</th>
                      <th className="p-2">Description</th>
                      <th className="p-2 text-right">Billed</th>
                      <th className="p-2 text-right">Free</th>
                      <th className="p-2 text-right">Paid</th>
                      <th className="p-2 text-right">Inward Qty</th>
                      <th className="p-2 text-right">Landed Cost</th>
                      <th className="p-2 text-right">Tax</th>
                      <th className="p-2 text-right">Total</th>
                      <th className="p-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewItems.map((it, idx) => (
                      <tr
                        key={it.id || idx}
                        className={`border-b transition-colors ${
                          idx === editingIndex
                            ? 'bg-amber-100/70 ring-2 ring-amber-400 font-semibold'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-2 font-mono font-bold text-sky-700">{it.sku}</td>
                        <td className="p-2 font-semibold">
                          <div>{it.productName}</div>
                          {idx === editingIndex && (
                            <span className="text-[10px] text-amber-700 font-bold bg-amber-200/60 px-1.5 py-0.5 rounded">
                              Editing in form above ⬆
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right font-bold">{it.qty}</td>
                        <td className="p-2 text-right font-bold text-amber-600">
                          {it.freeQty > 0 ? (
                            <span>
                              +{it.freeQty}{' '}
                              <span className="text-[10px] text-slate-500 font-normal">
                                ({it.schemeMode === 'additive' ? 'bonus' : 'incl.'})
                              </span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-2 text-right font-bold text-slate-700">
                          {it.paidQty !== undefined ? it.paidQty : Math.max(0, it.qty - (it.freeQty || 0))}
                        </td>
                        <td className="p-2 text-right font-extrabold text-emerald-800">
                          {it.totalReceivedQty || it.qty}
                        </td>
                        <td className="p-2 text-right font-mono">
                          ₹{money(it.landedCostPerUnit || it.unitPrice)}
                        </td>
                        <td className="p-2 text-right font-mono">
                          ₹{money((it.cgstAmount || 0) + (it.sgstAmount || 0))}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-green-700">
                          ₹{money(it.lineTotal)}
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleEditRow(idx)}
                            className={`p-1 px-2.5 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1 transition-colors ${
                              idx === editingIndex
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'text-sky-600 hover:text-sky-800 hover:bg-sky-50'
                            }`}
                            title="Edit this item"
                          >
                            <Edit2 size={13} />
                            <span>{idx === editingIndex ? 'Editing' : 'Edit'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(idx)}
                            className="p-1 px-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg cursor-pointer ml-1 inline-flex items-center gap-1"
                            title="Delete this row"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reviewItems.length > 0 && (
              <div className="mt-3 p-4 rounded-2xl bg-white border border-black/5 shadow-sm space-y-1.5">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Taxable</span>
                  <span className="font-semibold tabular-nums text-slate-800">₹{money(totals.taxable)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-500">
                  <span>GST</span>
                  <span className="font-semibold tabular-nums">₹{money(totals.cgst + totals.sgst)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-lg font-bold text-slate-900 tabular-nums">₹{money(totals.grand)}</span>
                  <span className="text-xs text-slate-500">{totals.totalCases} cases</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer — Save purchase */}
        <div className="px-4 sm:px-5 py-3 border-t border-black/5 bg-white flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-full text-sm font-semibold text-slate-600 hover:bg-black/5 cursor-pointer"
            >
              Cancel
            </button>
            {reviewItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const grnObj: GRN = {
                    id: initialGrnToEdit?.id || `grn_${Date.now()}`,
                    grnNumber: initialGrnToEdit?.grnNumber || 'DRAFT-GRN',
                    supplierName: supplierName || 'Supplier',
                    supplierGstin,
                    supplierAddress,
                    supplierPhone,
                    supplierEmail,
                    invoiceNo: invoiceNo || 'INV',
                    inwardDate,
                    vehicleNo,
                    placeOfSupply,
                    billedTo,
                    shippedTo,
                    warehouseId: targetWarehouseId,
                    items: reviewItems,
                    totalBilledQty: totals.billed,
                    totalFreeQty: totals.free,
                    totalPaidQty: totals.paid,
                    totalReceivedQty: totals.totalCases,
                    totalTaxable: totals.taxable,
                    totalCgst: totals.cgst,
                    totalSgst: totals.sgst,
                    totalTax: totals.cgst + totals.sgst,
                    grandTotal: totals.grand,
                    createdAt: initialGrnToEdit?.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  };
                  downloadSingleGrnCsv(grnObj, warehouses);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-sm font-semibold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 cursor-pointer shadow-xs"
                title="Download this inward GRN with all items as CSV file"
              >
                <Download size={14} />
                <span>Download CSV</span>
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={reviewItems.length === 0 || !targetWarehouseId}
            onClick={handleConfirmAndPost}
            title={!targetWarehouseId ? 'Select a warehouse first — there is no default' : undefined}
            className="px-5 py-2.5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-semibold shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
          >
            {!targetWarehouseId ? 'Select godown' : 'Save purchase'}
          </button>
        </div>
      </div>
    </div>
  );
};
