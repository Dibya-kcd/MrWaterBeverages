import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
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
import { CategoryKey, GRN, GrnLineItem, GrnSchemeType } from '../../types';
import {
  calculateGrnLineMetrics,
  generateAutoSku,
  generateBatchNumber,
  money,
} from '../../utils/billing';

interface InwardConsignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedWarehouseId?: string;
  preselectedProductId?: number;
  initialGrnToEdit?: GRN | null;
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
  schemeBuyQty: number;
  schemeFreeQty: number;
  schemeDiscountPercent: number;
  schemeFlatDiscountPerCase: number;
  expiry: string;
  mfgDate: string;
  batchNumber: string;
  wholesaleRate: number;
  retailRate: number;
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
    schemeBuyQty: 2,
    schemeFreeQty: 1,
    schemeDiscountPercent: 5,
    schemeFlatDiscountPerCase: 10,
    expiry: '2026-10-31',
    mfgDate: new Date().toISOString().slice(0, 10),
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
}) => {
  const { products, warehouses, defaultWarehouse, postGrn, updateGrn, palette, fz } = useLedger();

  // Header State
  const [supplierName, setSupplierName] = useState(
    initialGrnToEdit?.supplierName || 'RADHIKA ENTERPRISES'
  );
  const [supplierGstin, setSupplierGstin] = useState(
    initialGrnToEdit?.supplierGstin || '21FSDPR8480R1ZU'
  );
  const [supplierAddress, setSupplierAddress] = useState(
    initialGrnToEdit?.supplierAddress || 'Main Road, Near Bus Stand, Kuchinda, Sambalpur, Odisha - 768222'
  );
  const [supplierPhone, setSupplierPhone] = useState(
    initialGrnToEdit?.supplierPhone || '+91 94370 84801'
  );
  const [supplierEmail, setSupplierEmail] = useState(
    initialGrnToEdit?.supplierEmail || 'radhika.beverages@gmail.com'
  );
  const [invoiceNo, setInvoiceNo] = useState(
    initialGrnToEdit?.invoiceNo || 'Sales Quotation No. 2'
  );
  const [inwardDate, setInwardDate] = useState(
    initialGrnToEdit?.inwardDate || new Date().toISOString().slice(0, 10)
  );
  const [vehicleNo, setVehicleNo] = useState(
    initialGrnToEdit?.vehicleNo || 'OD15AF7869'
  );
  const [placeOfSupply, setPlaceOfSupply] = useState(
    initialGrnToEdit?.placeOfSupply || 'Odisha (21)'
  );
  const [billedTo, setBilledTo] = useState(
    initialGrnToEdit?.billedTo || 'NEW BIJAYA PUSTAK BHANDRA'
  );
  const [shippedTo, setShippedTo] = useState(
    initialGrnToEdit?.shippedTo || 'SAHAJBAHAL GODOWN / KUCHINDA DEPOT'
  );
  const [showProviderFields, setShowProviderFields] = useState(false);
  const [targetWarehouseId, setTargetWarehouseId] = useState(
    initialGrnToEdit?.warehouseId ||
      preselectedWarehouseId ||
      defaultWarehouse?.id ||
      warehouses[0]?.id ||
      'wh-kuchinda'
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
        const halfTax = Math.round(((p.gstRate || catDef.gst) * 100) / 2 * 10) / 10;
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
          schemeBuyQty: 2,
          schemeFreeQty: 1,
          schemeDiscountPercent: 0,
          schemeFlatDiscountPerCase: 0,
          expiry: p.expiry || '2026-12-31',
          mfgDate: p.mfgDate || new Date().toISOString().slice(0, 10),
          batchNumber: p.batchNumber || generateBatchNumber(p.name),
          wholesaleRate: p.wholesale || 235,
          retailRate: p.retail || 240,
        };
      }
    }
    return defaultLineState('energy');
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync state when initialGrnToEdit changes
  useEffect(() => {
    if (initialGrnToEdit) {
      setSupplierName(initialGrnToEdit.supplierName);
      setInvoiceNo(initialGrnToEdit.invoiceNo);
      setInwardDate(initialGrnToEdit.inwardDate);
      setTargetWarehouseId(initialGrnToEdit.warehouseId);
      setNotes(initialGrnToEdit.notes || '');
      setReviewItems(initialGrnToEdit.items || []);
      setEditingIndex(null);
    } else if (preselectedProductId) {
      const p = products.find((x) => x.id === preselectedProductId);
      if (p) {
        const catDef = CATS[p.category] || { name: 'Energy', hsn: '22021090', gst: 0.4 };
        const halfTax = Math.round(((p.gstRate || catDef.gst) * 100) / 2 * 10) / 10;
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
          schemeBuyQty: 2,
          schemeFreeQty: 1,
          schemeDiscountPercent: 0,
          schemeFlatDiscountPerCase: 0,
          expiry: p.expiry || '2026-12-31',
          mfgDate: p.mfgDate || new Date().toISOString().slice(0, 10),
          batchNumber: p.batchNumber || generateBatchNumber(p.name),
          wholesaleRate: p.wholesale || 235,
          retailRate: p.retail || 240,
        });
      }
    }
  }, [initialGrnToEdit, preselectedProductId, products]);

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
    if (draftLine.schemeType === 'free_cases') {
      const buyQty = Math.max(1, draftLine.schemeBuyQty);
      freeQty = Math.floor(draftLine.qty / buyQty) * draftLine.schemeFreeQty;
    }

    return calculateGrnLineMetrics({
      qty: draftLine.qty,
      unitPrice: draftLine.unitPrice,
      cgstPercent: draftLine.cgstPercent,
      sgstPercent: draftLine.sgstPercent,
      schemeType: draftLine.schemeType,
      freeQty,
      discountPercent: draftLine.schemeDiscountPercent,
      discountFlat: draftLine.schemeFlatDiscountPerCase,
    });
  }, [draftLine]);

  // Totals for the review table
  const totals = useMemo(() => {
    let billed = 0;
    let free = 0;
    let taxable = 0;
    let cgst = 0;
    let sgst = 0;
    let savings = 0;
    let grand = 0;

    for (const item of reviewItems) {
      billed += Number(item.qty) || 0;
      free += Number(item.freeQty) || 0;
      taxable += Number(item.taxableAmount) || 0;
      cgst += Number(item.cgstAmount) || 0;
      sgst += Number(item.sgstAmount) || 0;
      savings += Number(item.discountAmount) || 0;
      grand += Number(item.lineTotal) || 0;
    }

    return {
      billed,
      free,
      totalCases: billed + free,
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
      hsn: catDef?.hsn || '2202',
      cgstPercent: half,
      sgstPercent: half,
    }));
  };

  const handleSelectExisting = (prodId: number) => {
    const p = products.find((x) => x.id === prodId);
    if (!p) return;
    const halfTax = p.gstRate ? (p.gstRate * 100) / 2 : 10;

    setDraftLine((prev) => ({
      ...prev,
      isNewProduct: false,
      selectedProductId: prodId,
      productName: p.name,
      category: p.category,
      hsn: p.hsn || CATS[p.category]?.hsn || '2202',
      pack: p.pack || 'PET',
      volume: p.volume || 150,
      unitPrice: p.cost,
      wholesaleRate: p.wholesale,
      retailRate: p.retail,
      cgstPercent: halfTax,
      sgstPercent: halfTax,
      expiry: p.expiry || '2026-12-31',
    }));
  };

  const handleAddDraftToReview = () => {
    setLineValidationError(null);
    const effectiveName = draftLine.isNewProduct
      ? draftLine.productName.trim()
      : draftLine.productName;

    if (!effectiveName) {
      setLineValidationError('Please enter or select a beverage product description.');
      return;
    }
    if (draftLine.qty <= 0) {
      setLineValidationError('Billed quantity must be at least 1 case.');
      return;
    }

    let schemeLabelText = '';
    if (draftLine.schemeType === 'free_cases') {
      schemeLabelText = `Buy ${draftLine.schemeBuyQty} Get ${draftLine.schemeFreeQty} Free`;
    } else if (draftLine.schemeType === 'discount_percent') {
      schemeLabelText = `${draftLine.schemeDiscountPercent}% Discount`;
    } else if (draftLine.schemeType === 'discount_flat') {
      schemeLabelText = `₹${draftLine.schemeFlatDiscountPerCase}/case Off`;
    }

    const freeCasesCalculated = Math.max(0, metrics.totalReceivedQty - draftLine.qty);

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
      freeQty: freeCasesCalculated,
      totalReceivedQty: metrics.totalReceivedQty,
      unitPrice: draftLine.unitPrice,
      effectiveCostPerUnit: metrics.effectiveCostPerUnit,
      landedCostPerUnit: metrics.landedCostPerUnit,
      cgstPercent: draftLine.cgstPercent,
      sgstPercent: draftLine.sgstPercent,
      taxableAmount: metrics.taxableAmount,
      cgstAmount: metrics.cgstAmount,
      sgstAmount: metrics.sgstAmount,
      taxAmount: metrics.taxAmount,
      schemeType: draftLine.schemeType,
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
    };

    if (editingIndex !== null) {
      setReviewItems((prev) => prev.map((it, i) => (i === editingIndex ? item : it)));
      setEditingIndex(null);
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
      schemeBuyQty: 2,
      schemeFreeQty: it.freeQty || 1,
      schemeDiscountPercent: it.discountPercent || 5,
      schemeFlatDiscountPerCase: it.discountFlat || 10,
      expiry: it.expiry,
      mfgDate: it.mfgDate || new Date().toISOString().slice(0, 10),
      batchNumber: it.batchNumber,
      wholesaleRate: it.wholesaleRate || Math.round(it.unitPrice * 1.1),
      retailRate: it.retailRate || Math.round(it.unitPrice * 1.25),
    });
    setEditingIndex(idx);
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
      alert('Please specify Supplier / Party Name.');
      return;
    }
    if (!invoiceNo.trim()) {
      alert('Please specify Invoice Number.');
      return;
    }
    if (reviewItems.length === 0) {
      alert('Please add at least one line item into the review table.');
      return;
    }

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div
        className="w-full max-w-5xl bg-white border-2 shadow-2xl flex flex-col my-8 max-h-[92vh] overflow-hidden"
        style={{ borderColor: palette.navy }}
      >
        {/* Modal Header */}
        <div
          className="px-6 py-4 flex items-center justify-between border-b-2"
          style={{ backgroundColor: palette.navy, borderColor: palette.navy, color: '#FFFFFF' }}
        >
          <div>
            <h2 style={fz(20, { fontWeight: 800 })}>
              {initialGrnToEdit ? `Edit Inward Invoice (${initialGrnToEdit.grnNumber})` : 'Inward Invoice Entry'}
            </h2>
            <p className="text-xs opacity-90 mt-0.5">
              Review invoice line items and schemes before submitting to inventory.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-white/80 hover:text-white cursor-pointer"
            aria-label="Close modal"
          >
            <X size={22} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {successMessage && (
            <div
              className="p-4 border-2 flex items-center gap-3"
              style={{ backgroundColor: `${palette.good}15`, borderColor: palette.good }}
            >
              <CheckCircle2 size={24} style={{ color: palette.good }} />
              <div style={fz(15, { fontWeight: 700, color: palette.ink })}>{successMessage}</div>
            </div>
          )}

          {/* 1. Invoice Header */}
          <div className="border-2 p-4" style={{ borderColor: palette.line }}>
            <div className="font-bold text-sm mb-3 pb-2 border-b flex items-center gap-2">
              <FileText size={16} style={{ color: palette.navy }} />
              <span>Consignment Header Details</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label style={labelStyle}>Supplier Name *</label>
                <input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full border-2 px-3 py-1.5 font-semibold text-sm"
                  style={{ borderColor: palette.line }}
                />
              </div>
              <div>
                <label style={labelStyle}>Supplier GSTIN</label>
                <input
                  value={supplierGstin}
                  onChange={(e) => setSupplierGstin(e.target.value)}
                  placeholder="21FSDPR8480R1ZU"
                  className="w-full border-2 px-3 py-1.5 font-mono text-sm uppercase"
                  style={{ borderColor: palette.line }}
                />
              </div>
              <div>
                <label style={labelStyle}>Invoice / Quotation No. *</label>
                <input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="w-full border-2 px-3 py-1.5 font-semibold text-sm"
                  style={{ borderColor: palette.line }}
                />
              </div>
              <div>
                <label style={labelStyle}>Inward Date *</label>
                <input
                  type="date"
                  value={inwardDate}
                  onChange={(e) => setInwardDate(e.target.value)}
                  className="w-full border-2 px-3 py-1.5 text-sm"
                  style={{ borderColor: palette.line }}
                />
              </div>
              <div>
                <label style={labelStyle}>Vehicle No.</label>
                <input
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  placeholder="OD15AF7869"
                  className="w-full border-2 px-3 py-1.5 font-mono text-sm uppercase"
                  style={{ borderColor: palette.line }}
                />
              </div>
              <div>
                <label style={labelStyle}>Target Godown / Warehouse *</label>
                <select
                  value={targetWarehouseId}
                  onChange={(e) => setTargetWarehouseId(e.target.value)}
                  className="w-full border-2 px-3 py-1.5 text-sm cursor-pointer"
                  style={{ borderColor: palette.line }}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 flex items-end">
                <button
                  type="button"
                  onClick={() => setShowProviderFields((prev) => !prev)}
                  className="px-3 py-1.5 text-xs font-bold border-2 flex items-center gap-1.5 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: showProviderFields ? palette.navy : '#F8FAFC',
                    borderColor: palette.navy,
                    color: showProviderFields ? '#FFFFFF' : palette.navy,
                  }}
                >
                  <span>{showProviderFields ? '▲ Hide Provider Details' : '▼ More Provider Details (Address, Phone, POS, Billed To)'}</span>
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
                  <input
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
                    placeholder="radhika.beverages@gmail.com"
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

          {/* 2. Line Entry Form */}
          <div className="border-2 p-4" style={{ borderColor: palette.line }}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b">
              <div className="font-bold text-sm flex items-center gap-2">
                <Package size={16} style={{ color: palette.navy }} />
                <span>Line Item Entry</span>
                {editingIndex !== null && (
                  <span className="text-xs px-2 py-0.5 font-bold rounded bg-amber-500 text-white">
                    Editing Row #{editingIndex + 1}
                  </span>
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
                      setDraftLine((prev) => ({ ...prev, productName: e.target.value }));
                      if (lineValidationError) setLineValidationError(null);
                    }}
                    placeholder="e.g. CAMPA POWER UP 150ML"
                    className="w-full border-2 px-3 py-1.5 font-bold text-sm"
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
                  type="number"
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
                  type="number"
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
              className="p-3 border-2 mb-3 text-xs"
              style={{ borderColor: palette.amber, backgroundColor: `${palette.amber}0a` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold flex items-center gap-1.5">
                  <Gift size={15} style={{ color: palette.amber }} />
                  Scheme / Discount (Optional)
                </span>
                <div className="flex gap-3">
                  {(
                    [
                      { key: 'none', label: 'None (Included in Rate)' },
                      { key: 'free_cases', label: 'Free Cases' },
                      { key: 'discount_percent', label: '% Discount' },
                      { key: 'discount_flat', label: 'Flat ₹ Discount' },
                    ] as const
                  ).map((st) => (
                    <label key={st.key} className="flex items-center gap-1 font-bold cursor-pointer">
                      <input
                        type="radio"
                        checked={draftLine.schemeType === st.key}
                        onChange={() => setDraftLine((p) => ({ ...p, schemeType: st.key }))}
                      />
                      <span>{st.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {draftLine.schemeType === 'free_cases' && (
                <div className="flex items-center gap-4">
                  <span>
                    Buy cases:
                    <input
                      type="number"
                      min="1"
                      value={draftLine.schemeBuyQty}
                      onChange={(e) =>
                        setDraftLine((p) => ({ ...p, schemeBuyQty: Number(e.target.value) || 1 }))
                      }
                      className="w-16 ml-1 border px-1 py-0.5"
                    />
                  </span>
                  <span>
                    Get free:
                    <input
                      type="number"
                      min="1"
                      value={draftLine.schemeFreeQty}
                      onChange={(e) =>
                        setDraftLine((p) => ({ ...p, schemeFreeQty: Number(e.target.value) || 1 }))
                      }
                      className="w-16 ml-1 border px-1 py-0.5"
                    />
                  </span>
                  <span className="font-bold text-amber-700">
                    Calculated: +{Math.max(0, metrics.totalReceivedQty - draftLine.qty)} Free cases (Total: {metrics.totalReceivedQty} cases)
                  </span>
                </div>
              )}

              {draftLine.schemeType === 'discount_percent' && (
                <div className="flex items-center gap-3">
                  <span>
                    Discount %:
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={draftLine.schemeDiscountPercent}
                      onChange={(e) =>
                        setDraftLine((p) => ({ ...p, schemeDiscountPercent: Number(e.target.value) || 0 }))
                      }
                      className="w-16 ml-1 border px-1 py-0.5"
                    />
                  </span>
                  <span className="font-bold text-amber-700">
                    Discount Amount: −₹{money(metrics.discountAmount)}
                  </span>
                </div>
              )}

              {draftLine.schemeType === 'discount_flat' && (
                <div className="flex items-center gap-3">
                  <span>
                    Flat discount per case (₹):
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draftLine.schemeFlatDiscountPerCase}
                      onChange={(e) =>
                        setDraftLine((p) => ({ ...p, schemeFlatDiscountPerCase: Number(e.target.value) || 0 }))
                      }
                      className="w-20 ml-1 border px-1 py-0.5"
                    />
                  </span>
                  <span className="font-bold text-amber-700">
                    Discount Amount: −₹{money(metrics.discountAmount)}
                  </span>
                </div>
              )}

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

            <button
              type="button"
              onClick={handleAddDraftToReview}
              className="w-full border-2 py-2 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              style={{
                backgroundColor: palette.navy,
                borderColor: palette.navy,
                color: '#FFFFFF',
              }}
            >
              <Plus size={16} />
              {editingIndex !== null ? 'Update Invoice Line' : 'Add Line to Invoice'}
            </button>
          </div>

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
              <div className="overflow-x-auto border mb-3">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="p-2">SKU</th>
                      <th className="p-2">Description</th>
                      <th className="p-2 text-right">Billed</th>
                      <th className="p-2 text-right">Free</th>
                      <th className="p-2 text-right">Landed Cost</th>
                      <th className="p-2 text-right">Tax</th>
                      <th className="p-2 text-right">Total</th>
                      <th className="p-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewItems.map((it, idx) => (
                      <tr key={it.id || idx} className="border-b">
                        <td className="p-2 font-mono font-bold text-blue-900">{it.sku}</td>
                        <td className="p-2 font-semibold">{it.productName}</td>
                        <td className="p-2 text-right font-bold">{it.qty}</td>
                        <td className="p-2 text-right font-bold text-amber-600">
                          {it.freeQty > 0 ? `+${it.freeQty}` : '—'}
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
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleEditRow(idx)}
                            className="p-1 text-blue-600 hover:text-blue-800 cursor-pointer"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(idx)}
                            className="p-1 text-red-600 hover:text-red-800 cursor-pointer ml-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reviewItems.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-gray-50 border text-xs">
                <div>
                  Total Received Cases: <strong>{totals.totalCases} cases</strong> ({totals.billed} billed + {totals.free} free)
                </div>
                <div>
                  Invoice Subtotal: <strong>₹{money(totals.taxable)}</strong>
                </div>
                <div>
                  Total GST: <strong>₹{money(totals.cgst + totals.sgst)}</strong>
                </div>
                <div className="text-sm font-extrabold text-green-700">
                  Invoice Total: ₹{money(totals.grand)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t-2 flex items-center justify-between" style={{ borderColor: palette.line }}>
          <button
            type="button"
            onClick={onClose}
            className="border-2 px-4 py-2 font-bold text-xs cursor-pointer"
            style={{ borderColor: palette.line, backgroundColor: '#FFFFFF' }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={reviewItems.length === 0}
            onClick={handleConfirmAndPost}
            className="border-2 px-6 py-2.5 font-bold text-sm flex items-center gap-2 cursor-pointer shadow disabled:opacity-50"
            style={{
              backgroundColor: palette.good,
              borderColor: palette.good,
              color: '#FFFFFF',
            }}
          >
            <CheckCircle2 size={18} />
            Save Invoice & Update Inventory
          </button>
        </div>
      </div>
    </div>
  );
};
