import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Gift,
  HelpCircle,
  Layers,
  Package,
  Percent,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { CATS } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { CategoryKey, GRN, GrnLineItem, GrnSchemeType, Product } from '../../types';
import {
  calculateGrnLineMetrics,
  generateAutoSku,
  generateBatchNumber,
  money,
} from '../../utils/billing';
import { IconButton } from '../common/IconButton';

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
  schemeText: string;
  expiry: string;
  mfgDate: string;
  batchNumber: string;
  wholesaleRate: number;
  retailRate: number;
}

const defaultDraftLine = (category: CategoryKey = 'energy'): DraftLineState => {
  const catDef = CATS[category] || { name: 'Energy & Boost', hsn: '22021090', gst: 0.4 };
  const initialGstPart = Math.round((catDef.gst * 100) / 2 * 10) / 10;

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
    cgstPercent: initialGstPart,
    sgstPercent: initialGstPart,
    schemeType: 'free_cases',
    schemeBuyQty: 2,
    schemeFreeQty: 1,
    schemeDiscountPercent: 5,
    schemeFlatDiscountPerCase: 10,
    schemeText: 'Buy 2 Get 1 Free',
    expiry: '2026-10-31',
    mfgDate: new Date().toISOString().slice(0, 10),
    batchNumber: '',
    wholesaleRate: 175,
    retailRate: 190,
  };
};

export const GrnView: React.FC = () => {
  const {
    grns,
    postGrn,
    updateGrn,
    deleteGrn,
    activeGrnToEdit,
    setActiveGrnToEdit,
    products,
    warehouses,
    defaultWarehouse,
    remainingStock,
    palette,
    fz,
    scale,
  } = useLedger();

  // Search and view controls
  const [historySearch, setHistorySearch] = useState('');
  const [expandedGrnId, setExpandedGrnId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // GRN Header state
  const [supplierName, setSupplierName] = useState(
    activeGrnToEdit ? activeGrnToEdit.supplierName : ''
  );
  const [invoiceNo, setInvoiceNo] = useState(
    activeGrnToEdit ? activeGrnToEdit.invoiceNo : ''
  );
  const [inwardDate, setInwardDate] = useState(
    activeGrnToEdit ? activeGrnToEdit.inwardDate : new Date().toISOString().slice(0, 10)
  );
  const [warehouseId, setWarehouseId] = useState(
    activeGrnToEdit?.warehouseId || defaultWarehouse?.id || warehouses[0]?.id || 'wh-kuchinda'
  );
  const [headerNotes, setHeaderNotes] = useState(activeGrnToEdit?.notes || '');

  // Review Table state (Nothing touches stock until confirm)
  const [reviewItems, setReviewItems] = useState<GrnLineItem[]>(
    activeGrnToEdit ? activeGrnToEdit.items : []
  );

  // Active Line Entry Form state
  const [draftLine, setDraftLine] = useState<DraftLineState>(() => defaultDraftLine('energy'));
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);

  // Synchronize if editing a GRN from external trigger
  React.useEffect(() => {
    if (activeGrnToEdit) {
      setSupplierName(activeGrnToEdit.supplierName);
      setInvoiceNo(activeGrnToEdit.invoiceNo);
      setInwardDate(activeGrnToEdit.inwardDate);
      setWarehouseId(activeGrnToEdit.warehouseId);
      setHeaderNotes(activeGrnToEdit.notes || '');
      setReviewItems(activeGrnToEdit.items);
      setActiveTab('create');
    }
  }, [activeGrnToEdit]);

  // Check if draft product name matches an existing product
  const matchingExistingProduct = useMemo(() => {
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

  // Live Auto SKU Preview
  const computedSkuPreview = useMemo(() => {
    if (!draftLine.isNewProduct && draftLine.selectedProductId) {
      const ep = products.find((p) => p.id === draftLine.selectedProductId);
      return ep?.sku || generateAutoSku(ep?.name || '', draftLine.category, ep?.id || 1);
    }
    if (matchingExistingProduct) {
      return matchingExistingProduct.sku;
    }
    const tentativeName = draftLine.productName.trim() || 'NEW PRODUCT';
    return generateAutoSku(tentativeName, draftLine.category, products.length + 1);
  }, [draftLine, products, matchingExistingProduct]);

  // Live Metrics calculation for the draft line item
  const currentLineMetrics = useMemo(() => {
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

  // Calculate totals across the Review Table
  const reviewTotals = useMemo(() => {
    let billedCases = 0;
    let freeCases = 0;
    let taxableTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let schemeSavingsTotal = 0;
    let grandTotal = 0;

    for (const item of reviewItems) {
      billedCases += Number(item.qty) || 0;
      freeCases += Number(item.freeQty) || 0;
      taxableTotal += Number(item.taxableAmount) || 0;
      cgstTotal += Number(item.cgstAmount) || 0;
      sgstTotal += Number(item.sgstAmount) || 0;
      schemeSavingsTotal += Number(item.discountAmount) || 0;
      grandTotal += Number(item.lineTotal) || 0;
    }

    return {
      billedCases,
      freeCases,
      totalCases: billedCases + freeCases,
      taxableTotal,
      cgstTotal,
      sgstTotal,
      schemeSavingsTotal,
      grandTotal,
    };
  }, [reviewItems]);

  // Switch Category -> Auto adjust HSN and Tax
  const handleCategoryChange = (cat: CategoryKey) => {
    const catDef = CATS[cat];
    let halfTax = 10;
    if (cat === 'joos') halfTax = 2.5;
    else if (cat === 'water') halfTax = 9;
    else if (catDef) halfTax = Math.round((catDef.gst * 100) / 2 * 10) / 10;

    setDraftLine((prev) => ({
      ...prev,
      category: cat,
      hsn: catDef?.hsn || '2202',
      cgstPercent: halfTax,
      sgstPercent: halfTax,
    }));
  };

  // Switch to Existing Product selection
  const handleSelectExistingProduct = (prodId: number) => {
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

  // Add draft line into Review Table
  const handleAddLineToReview = () => {
    const effectiveName = draftLine.isNewProduct
      ? draftLine.productName.trim()
      : draftLine.productName;

    if (!effectiveName) {
      alert('Please enter or select a beverage product description.');
      return;
    }
    if (draftLine.qty <= 0) {
      alert('Billed quantity must be greater than 0 cases.');
      return;
    }

    const skuToUse = computedSkuPreview;
    const batchToUse =
      draftLine.batchNumber.trim() ||
      generateBatchNumber(effectiveName, draftLine.schemeType !== 'none' ? 'SCH' : undefined);

    let schemeLabelText = '';
    if (draftLine.schemeType === 'free_cases') {
      schemeLabelText = `Buy ${draftLine.schemeBuyQty} Get ${draftLine.schemeFreeQty} Free`;
    } else if (draftLine.schemeType === 'discount_percent') {
      schemeLabelText = `${draftLine.schemeDiscountPercent}% Discount`;
    } else if (draftLine.schemeType === 'discount_flat') {
      schemeLabelText = `₹${draftLine.schemeFlatDiscountPerCase}/case Cash Discount`;
    }

    const freeCasesCalculated = Math.max(0, currentLineMetrics.totalReceivedQty - draftLine.qty);

    const newLine: GrnLineItem = {
      id:
        editingLineIndex !== null && reviewItems[editingLineIndex]
          ? reviewItems[editingLineIndex].id
          : 'item_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      isNewProduct: draftLine.isNewProduct,
      productId: matchingExistingProduct?.id || draftLine.selectedProductId,
      productName: effectiveName,
      category: draftLine.category,
      sku: skuToUse,
      hsn: draftLine.hsn,
      pack: draftLine.pack,
      volume: draftLine.volume,
      qty: draftLine.qty,
      freeQty: freeCasesCalculated,
      totalReceivedQty: currentLineMetrics.totalReceivedQty,
      unitPrice: draftLine.unitPrice,
      effectiveCostPerUnit: currentLineMetrics.effectiveCostPerUnit,
      landedCostPerUnit: currentLineMetrics.landedCostPerUnit,
      cgstPercent: draftLine.cgstPercent,
      sgstPercent: draftLine.sgstPercent,
      taxableAmount: currentLineMetrics.taxableAmount,
      cgstAmount: currentLineMetrics.cgstAmount,
      sgstAmount: currentLineMetrics.sgstAmount,
      taxAmount: currentLineMetrics.taxAmount,
      schemeType: draftLine.schemeType,
      discountPercent: draftLine.schemeDiscountPercent,
      discountFlat: draftLine.schemeFlatDiscountPerCase,
      discountAmount: currentLineMetrics.discountAmount,
      schemeText: schemeLabelText,
      lineTotal: currentLineMetrics.lineTotal,
      expiry: draftLine.expiry,
      mfgDate: draftLine.mfgDate,
      batchNumber: batchToUse,
      wholesaleRate: draftLine.wholesaleRate,
      retailRate: draftLine.retailRate,
    };

    if (editingLineIndex !== null) {
      setReviewItems((prev) =>
        prev.map((item, idx) => (idx === editingLineIndex ? newLine : item))
      );
      setEditingLineIndex(null);
    } else {
      setReviewItems((prev) => [...prev, newLine]);
    }

    // Reset line draft for next entry
    setDraftLine(defaultDraftLine(draftLine.category));
  };

  // Edit line from review table
  const handleEditReviewRow = (index: number) => {
    const item = reviewItems[index];
    if (!item) return;

    setDraftLine({
      id: item.id,
      isNewProduct: !item.productId,
      selectedProductId: item.productId,
      productName: item.productName,
      category: item.category,
      hsn: item.hsn,
      pack: item.pack || 'PET',
      volume: item.volume || 150,
      qty: item.qty,
      unitPrice: item.unitPrice,
      cgstPercent: item.cgstPercent,
      sgstPercent: item.sgstPercent,
      schemeType: item.schemeType || 'none',
      schemeBuyQty: 2,
      schemeFreeQty: item.freeQty || 1,
      schemeDiscountPercent: item.discountPercent || 5,
      schemeFlatDiscountPerCase: item.discountFlat || 10,
      schemeText: item.schemeText || '',
      expiry: item.expiry,
      mfgDate: item.mfgDate || new Date().toISOString().slice(0, 10),
      batchNumber: item.batchNumber,
      wholesaleRate: item.wholesaleRate || Math.round(item.unitPrice * 1.1),
      retailRate: item.retailRate || Math.round(item.unitPrice * 1.25),
    });
    setEditingLineIndex(index);
  };

  // Delete line from review table
  const handleDeleteReviewRow = (index: number) => {
    setReviewItems((prev) => prev.filter((_, idx) => idx !== index));
    if (editingLineIndex === index) {
      setEditingLineIndex(null);
      setDraftLine(defaultDraftLine());
    }
  };

  // Confirm and Post GRN (Touches stock atomically)
  const handleConfirmAndPostGrn = () => {
    if (!supplierName.trim()) {
      alert('Please enter the Supplier / Party Name.');
      return;
    }
    if (!invoiceNo.trim()) {
      alert('Please enter the Supplier Invoice Number.');
      return;
    }
    if (reviewItems.length === 0) {
      alert('Please enter at least one line item in the review table before posting.');
      return;
    }

    const payload: Omit<GRN, 'id' | 'grnNumber' | 'createdAt' | 'updatedAt'> = {
      supplierName: supplierName.trim(),
      invoiceNo: invoiceNo.trim(),
      inwardDate,
      warehouseId,
      notes: headerNotes.trim(),
      items: reviewItems,
      totalBilledQty: reviewTotals.billedCases,
      totalFreeQty: reviewTotals.freeCases,
      totalReceivedQty: reviewTotals.totalCases,
      totalTaxable: reviewTotals.taxableTotal,
      totalCgst: reviewTotals.cgstTotal,
      totalSgst: reviewTotals.sgstTotal,
      totalTax: reviewTotals.cgstTotal + reviewTotals.sgstTotal,
      grandTotal: reviewTotals.grandTotal,
    };

    if (activeGrnToEdit) {
      updateGrn(activeGrnToEdit.id, payload);
      setActiveGrnToEdit(null);
      setSuccessBanner(
        `Successfully updated ${activeGrnToEdit.grnNumber}. Products & stock recalculated everywhere automatically!`
      );
    } else {
      const created = postGrn(payload);
      setSuccessBanner(
        `Successfully confirmed & posted ${created.grnNumber}! Stock is now live in Products, Godowns, and Billing.`
      );
    }

    // Reset draft form
    setReviewItems([]);
    setEditingLineIndex(null);
    setDraftLine(defaultDraftLine());
    setActiveTab('history');
  };

  // Cancel edit mode
  const handleCancelEditing = () => {
    setActiveGrnToEdit(null);
    setReviewItems([]);
    setEditingLineIndex(null);
    setDraftLine(defaultDraftLine());
  };

  // Handle GRN deletion from history
  const handleDeleteGrn = (id: string, grnNum: string) => {
    if (
      confirm(
        `Are you sure you want to delete ${grnNum}? This will immediately reverse the stock and recalculate inventory across the entire system.`
      )
    ) {
      deleteGrn(id);
      setSuccessBanner(
        `Deleted ${grnNum}. Stock was automatically recalculated across Products, Godowns, and Billing.`
      );
    }
  };

  // Handle Edit GRN from history
  const handleStartEditGrn = (grn: GRN) => {
    setActiveGrnToEdit(grn);
    setActiveTab('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Filtered GRNs
  const filteredGrns = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return grns;
    return grns.filter((g) => {
      const matchHeader =
        g.grnNumber.toLowerCase().includes(q) ||
        g.invoiceNo.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q) ||
        g.inwardDate.includes(q);
      const matchItem = g.items.some(
        (it) =>
          it.productName.toLowerCase().includes(q) ||
          it.sku.toLowerCase().includes(q) ||
          it.batchNumber.toLowerCase().includes(q)
      );
      return matchHeader || matchItem;
    });
  }, [grns, historySearch]);

  const cardStyle = {
    backgroundColor: '#FFFFFF',
    borderColor: palette.line,
  };

  const inputStyle = {
    borderColor: palette.line,
    color: palette.ink,
    backgroundColor: '#FFFFFF',
  };

  const labelStyle = fz(12.5, {
    fontWeight: 700,
    color: palette.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginBottom: '0.25rem',
    display: 'block',
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="px-2.5 py-0.5 font-bold tracking-wider rounded text-xs uppercase"
              style={{ backgroundColor: palette.navy, color: '#FFFFFF' }}
            >
              Single Source of Truth
            </span>
            <span style={fz(13, { color: palette.muted })}>MrWater Distribution Architecture</span>
          </div>
          <h1
            style={fz(28, {
              fontWeight: 800,
              color: palette.ink,
              lineHeight: 1.15,
              marginTop: '0.25rem',
            })}
          >
            Inward Goods Receipt Note (GRN)
          </h1>
          <p style={fz(14, { color: palette.muted, marginTop: '0.2rem' })}>
            All products and stock come into existence through GRN. Stock is never manually assumed.
          </p>
        </div>

        {/* Tab Controls & Quick Sample Load */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('create')}
            className="border-2 px-4 py-2 font-bold cursor-pointer transition-colors focus-ring flex items-center gap-2"
            style={{
              backgroundColor: activeTab === 'create' ? palette.navy : '#FFFFFF',
              borderColor: palette.navy,
              color: activeTab === 'create' ? '#FFFFFF' : palette.navy,
              ...fz(14),
            }}
          >
            <Plus size={16} />
            {activeGrnToEdit ? `Editing ${activeGrnToEdit.grnNumber}` : 'New Inward GRN'}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className="border-2 px-4 py-2 font-bold cursor-pointer transition-colors focus-ring flex items-center gap-2"
            style={{
              backgroundColor: activeTab === 'history' ? palette.navy : '#FFFFFF',
              borderColor: palette.navy,
              color: activeTab === 'history' ? '#FFFFFF' : palette.navy,
              ...fz(14),
            }}
          >
            <Receipt size={16} />
            Posted GRN History ({grns.length})
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div
          className="mb-6 p-4 border-2 flex items-center justify-between gap-3 shadow-sm"
          style={{ borderColor: palette.good, backgroundColor: `${palette.good}15` }}
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 size={22} style={{ color: palette.good }} />
            <span style={fz(14.5, { fontWeight: 700, color: palette.ink })}>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="cursor-pointer text-sm font-bold opacity-75 hover:opacity-100"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* VIEW 1: CREATOR & REVIEW-BEFORE-CONFIRM TABLE */}
      {activeTab === 'create' && (
        <div className="space-y-6">
          {/* Active Edit Alert */}
          {activeGrnToEdit && (
            <div
              className="p-3 border-2 flex items-center justify-between gap-3"
              style={{ borderColor: palette.amber, backgroundColor: `${palette.amber}18` }}
            >
              <div className="flex items-center gap-2">
                <Edit2 size={18} style={{ color: palette.amber }} />
                <span style={fz(14, { fontWeight: 700 })}>
                  Currently Editing {activeGrnToEdit.grnNumber} (Inv #{activeGrnToEdit.invoiceNo}).
                  Any edits will automatically recalculate Products and sellable inventory.
                </span>
              </div>
              <button
                onClick={handleCancelEditing}
                className="px-3 py-1 font-bold border-2 cursor-pointer text-xs"
                style={{ borderColor: palette.line, backgroundColor: '#FFFFFF' }}
              >
                Cancel Edit
              </button>
            </div>
          )}

          {/* 1. Header Information (Supplier, Inv No, Date, Godown) */}
          <div className="border-2 p-5 shadow-sm" style={cardStyle}>
            <div
              className="pb-3 mb-4 border-b-2 flex items-center justify-between gap-2"
              style={{ borderColor: palette.line }}
            >
              <div className="flex items-center gap-2">
                <FileText size={20} style={{ color: palette.navy }} />
                <span style={fz(16, { fontWeight: 800, color: palette.ink })}>
                  1. Consignment Invoice Header
                </span>
              </div>
              <span style={fz(12.5, { color: palette.muted })}>
                Modeled directly on supplier tax invoice
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label style={labelStyle}>Supplier / Consignor *</label>
                <input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. RADHIKA ENTERPRISES"
                  className="w-full border-2 px-3 py-2 focus-ring font-semibold"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Supplier Invoice / Quotation No. *</label>
                <input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="e.g. Sales Quotation No. 2"
                  className="w-full border-2 px-3 py-2 focus-ring font-semibold"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Inward Receipt Date *</label>
                <input
                  type="date"
                  value={inwardDate}
                  onChange={(e) => setInwardDate(e.target.value)}
                  className="w-full border-2 px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Receiving Godown / Warehouse *</label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full border-2 px-3 py-2 focus-ring cursor-pointer"
                  style={inputStyle}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 2. Line Item Entry (Mirrors Actual Invoice Fields) */}
          <div className="border-2 p-5 shadow-sm" style={cardStyle}>
            <div
              className="pb-3 mb-4 border-b-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{ borderColor: palette.line }}
            >
              <div className="flex items-center gap-2">
                <Package size={20} style={{ color: palette.navy }} />
                <span style={fz(16, { fontWeight: 800, color: palette.ink })}>
                  2. Line Item Entry
                </span>
                {editingLineIndex !== null && (
                  <span
                    className="px-2 py-0.5 text-xs font-bold rounded"
                    style={{ backgroundColor: palette.amber, color: '#FFFFFF' }}
                  >
                    Editing Row #{editingLineIndex + 1}
                  </span>
                )}
              </div>

              {/* Product Source Toggle: Existing vs + New Product */}
              <div className="flex items-center gap-1 border-2 p-1" style={{ borderColor: palette.line }}>
                <button
                  type="button"
                  onClick={() => setDraftLine((prev) => ({ ...prev, isNewProduct: false }))}
                  className="px-3 py-1 text-xs font-bold cursor-pointer transition-colors focus-ring"
                  style={{
                    backgroundColor: !draftLine.isNewProduct ? palette.navy : 'transparent',
                    color: !draftLine.isNewProduct ? '#FFFFFF' : palette.ink,
                  }}
                >
                  Pick Existing Product
                </button>
                <button
                  type="button"
                  onClick={() => setDraftLine((prev) => ({ ...prev, isNewProduct: true }))}
                  className="px-3 py-1 text-xs font-bold cursor-pointer transition-colors focus-ring"
                  style={{
                    backgroundColor: draftLine.isNewProduct ? palette.navy : 'transparent',
                    color: draftLine.isNewProduct ? '#FFFFFF' : palette.ink,
                  }}
                >
                  + New Product
                </button>
              </div>
            </div>

            {/* Existing Product Dropdown or New Product Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {!draftLine.isNewProduct ? (
                <div className="lg:col-span-2">
                  <label style={labelStyle}>Select Existing Product *</label>
                  <select
                    value={draftLine.selectedProductId || ''}
                    onChange={(e) => handleSelectExistingProduct(Number(e.target.value))}
                    className="w-full border-2 px-3 py-2 focus-ring font-medium"
                    style={inputStyle}
                  >
                    <option value="">-- Choose from existing catalog --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({remainingStock(p.id)} cases currently)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="lg:col-span-2">
                  <label style={labelStyle}>Product Description / Name *</label>
                  <input
                    value={draftLine.productName}
                    onChange={(e) =>
                      setDraftLine((prev) => ({ ...prev, productName: e.target.value }))
                    }
                    placeholder="e.g. CAMPA POWER UP 150ML PET"
                    className="w-full border-2 px-3 py-2 focus-ring font-bold"
                    style={inputStyle}
                  />
                  {matchingExistingProduct && (
                    <div
                      className="mt-1 text-xs font-semibold flex items-center gap-1.5"
                      style={{ color: palette.amber }}
                    >
                      <Sparkles size={13} />
                      Matches existing catalog item — will accumulate stock under{' '}
                      <strong>{matchingExistingProduct.sku}</strong>.
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={draftLine.category}
                  onChange={(e) => handleCategoryChange(e.target.value as CategoryKey)}
                  className="w-full border-2 px-3 py-2 focus-ring cursor-pointer"
                  style={inputStyle}
                >
                  {Object.entries(CATS).map(([key, cat]) => (
                    <option key={key} value={key}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Auto SKU Preview</label>
                <div
                  className="border-2 px-3 py-2 font-mono font-bold flex items-center justify-between"
                  style={{ backgroundColor: `${palette.navy}0a`, borderColor: palette.line }}
                >
                  <span style={fz(14, { color: palette.navy })}>{computedSkuPreview}</span>
                  <span className="text-xs uppercase px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${palette.navy}20`, color: palette.navy }}>
                    Auto
                  </span>
                </div>
              </div>
            </div>

            {/* Packaging, HSN, Quantity, Unit Price */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label style={labelStyle}>HSN / SAC Code</label>
                <input
                  value={draftLine.hsn}
                  onChange={(e) => setDraftLine((prev) => ({ ...prev, hsn: e.target.value }))}
                  placeholder="e.g. 22021090"
                  className="w-full border-2 px-3 py-2 focus-ring font-mono"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Billed Qty (Cases) *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={draftLine.qty}
                  onChange={(e) =>
                    setDraftLine((prev) => ({ ...prev, qty: Math.max(1, Number(e.target.value) || 0) }))
                  }
                  className="w-full border-2 px-3 py-2 focus-ring font-bold text-lg"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Unit Price / Case (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={draftLine.unitPrice}
                  onChange={(e) =>
                    setDraftLine((prev) => ({ ...prev, unitPrice: Number(e.target.value) || 0 }))
                  }
                  className="w-full border-2 px-3 py-2 focus-ring font-bold text-lg"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Expiry Date</label>
                <input
                  type="date"
                  value={draftLine.expiry}
                  onChange={(e) => setDraftLine((prev) => ({ ...prev, expiry: e.target.value }))}
                  className="w-full border-2 px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Scheme / Discount Section with Landed Price Calculation */}
            <div
              className="p-4 border-2 mb-4"
              style={{ borderColor: palette.amber, backgroundColor: `${palette.amber}0a` }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Gift size={18} style={{ color: palette.amber }} />
                  <span style={fz(14, { fontWeight: 700, color: palette.ink })}>
                    Manual Scheme / Discount & Landed Price Calculation
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(
                    [
                      { key: 'none', label: 'No Scheme' },
                      { key: 'free_cases', label: 'Buy X Get Y Free' },
                      { key: 'discount_percent', label: '% Discount' },
                      { key: 'discount_flat', label: 'Flat / Case' },
                    ] as const
                  ).map((st) => (
                    <label
                      key={st.key}
                      className="flex items-center gap-1 text-xs font-bold cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="schemeType"
                        checked={draftLine.schemeType === st.key}
                        onChange={() => setDraftLine((prev) => ({ ...prev, schemeType: st.key }))}
                        className="w-3.5 h-3.5"
                      />
                      <span>{st.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Dynamic Scheme Inputs */}
              {draftLine.schemeType === 'free_cases' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-center">
                  <div>
                    <label style={labelStyle}>Buy Cases (X)</label>
                    <input
                      type="number"
                      min="1"
                      value={draftLine.schemeBuyQty}
                      onChange={(e) =>
                        setDraftLine((prev) => ({
                          ...prev,
                          schemeBuyQty: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className="w-full border-2 px-3 py-1.5"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Free Cases (Y)</label>
                    <input
                      type="number"
                      min="1"
                      value={draftLine.schemeFreeQty}
                      onChange={(e) =>
                        setDraftLine((prev) => ({
                          ...prev,
                          schemeFreeQty: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className="w-full border-2 px-3 py-1.5 font-bold"
                      style={inputStyle}
                    />
                  </div>
                  <div className="col-span-2 text-xs font-semibold" style={{ color: palette.muted }}>
                    Calculated Free Cases for {draftLine.qty} billed:
                    <span className="font-bold ml-1 text-sm" style={{ color: palette.amber }}>
                      +{Math.max(0, currentLineMetrics.totalReceivedQty - draftLine.qty)} Cases Free
                    </span>
                    {' '}(Total Received: {currentLineMetrics.totalReceivedQty} cases)
                  </div>
                </div>
              )}

              {draftLine.schemeType === 'discount_percent' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-center">
                  <div>
                    <label style={labelStyle}>Discount Percentage (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={draftLine.schemeDiscountPercent}
                      onChange={(e) =>
                        setDraftLine((prev) => ({
                          ...prev,
                          schemeDiscountPercent: Number(e.target.value) || 0,
                        }))
                      }
                      className="w-full border-2 px-3 py-1.5 font-bold"
                      style={inputStyle}
                    />
                  </div>
                  <div className="col-span-3 text-xs font-semibold" style={{ color: palette.muted }}>
                    Total Discount Savings:
                    <span className="font-bold ml-1 text-sm" style={{ color: palette.amber }}>
                      −₹{money(currentLineMetrics.discountAmount)}
                    </span>
                  </div>
                </div>
              )}

              {draftLine.schemeType === 'discount_flat' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-center">
                  <div>
                    <label style={labelStyle}>Cash Discount per Case (₹)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={draftLine.schemeFlatDiscountPerCase}
                      onChange={(e) =>
                        setDraftLine((prev) => ({
                          ...prev,
                          schemeFlatDiscountPerCase: Number(e.target.value) || 0,
                        }))
                      }
                      className="w-full border-2 px-3 py-1.5 font-bold"
                      style={inputStyle}
                    />
                  </div>
                  <div className="col-span-3 text-xs font-semibold" style={{ color: palette.muted }}>
                    Total Cash Savings:
                    <span className="font-bold ml-1 text-sm" style={{ color: palette.amber }}>
                      −₹{money(currentLineMetrics.discountAmount)}
                    </span>
                  </div>
                </div>
              )}

              {/* Landed Cost Live KPI Bar */}
              <div
                className="mt-3 pt-3 border-t-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center"
                style={{ borderColor: `${palette.amber}40` }}
              >
                <div>
                  <div className="text-xs uppercase font-bold" style={{ color: palette.muted }}>
                    Effective Cost (Pre-Tax)
                  </div>
                  <div className="font-extrabold text-base" style={{ color: palette.ink }}>
                    ₹{money(currentLineMetrics.effectiveCostPerUnit)} / case
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase font-bold" style={{ color: palette.muted }}>
                    Landed Price (Post-Tax)
                  </div>
                  <div className="font-extrabold text-base" style={{ color: palette.navy }}>
                    ₹{money(currentLineMetrics.landedCostPerUnit)} / case
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase font-bold" style={{ color: palette.muted }}>
                    Combined GST Rate
                  </div>
                  <div className="font-bold text-base" style={{ color: palette.ink }}>
                    {draftLine.cgstPercent + draftLine.sgstPercent}% ({draftLine.cgstPercent}% CGST + {draftLine.sgstPercent}% SGST)
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase font-bold" style={{ color: palette.muted }}>
                    Line Total Payable
                  </div>
                  <div className="font-extrabold text-lg" style={{ color: palette.good }}>
                    ₹{money(currentLineMetrics.lineTotal)}
                  </div>
                </div>
              </div>
            </div>

            {/* Taxes & Selling Rates */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <label style={labelStyle}>CGST (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={draftLine.cgstPercent}
                  onChange={(e) =>
                    setDraftLine((prev) => ({ ...prev, cgstPercent: Number(e.target.value) || 0 }))
                  }
                  className="w-full border-2 px-3 py-1.5"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>SGST (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={draftLine.sgstPercent}
                  onChange={(e) =>
                    setDraftLine((prev) => ({ ...prev, sgstPercent: Number(e.target.value) || 0 }))
                  }
                  className="w-full border-2 px-3 py-1.5"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Wholesale Rate (₹)</label>
                <input
                  type="number"
                  step="0.5"
                  value={draftLine.wholesaleRate}
                  onChange={(e) =>
                    setDraftLine((prev) => ({ ...prev, wholesaleRate: Number(e.target.value) || 0 }))
                  }
                  className="w-full border-2 px-3 py-1.5"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Retail Rate / MRP (₹)</label>
                <input
                  type="number"
                  step="0.5"
                  value={draftLine.retailRate}
                  onChange={(e) =>
                    setDraftLine((prev) => ({ ...prev, retailRate: Number(e.target.value) || 0 }))
                  }
                  className="w-full border-2 px-3 py-1.5"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Add Line to Review Button */}
            <button
              type="button"
              onClick={handleAddLineToReview}
              className="w-full border-2 py-3 px-4 font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors focus-ring"
              style={{
                backgroundColor: palette.navy,
                borderColor: palette.navy,
                color: '#FFFFFF',
                ...fz(15),
              }}
            >
              <Plus size={18} />
              {editingLineIndex !== null
                ? `Update Review Table Row #${editingLineIndex + 1}`
                : 'Add Line Item to Review Table'}
            </button>
          </div>

          {/* 3. REVIEW-BEFORE-CONFIRM TABLE */}
          <div className="border-2 p-5 shadow-sm" style={cardStyle}>
            <div
              className="pb-3 mb-4 border-b-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              style={{ borderColor: palette.line }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <FileCheck2 size={20} style={{ color: palette.navy }} />
                  <span style={fz(16, { fontWeight: 800, color: palette.ink })}>
                    3. Review-Before-Confirm Table
                  </span>
                  <span
                    className="px-2 py-0.5 text-xs font-bold rounded"
                    style={{ backgroundColor: `${palette.navy}15`, color: palette.navy }}
                  >
                    {reviewItems.length} item{reviewItems.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div style={fz(13, { color: palette.amber, fontWeight: 700, marginTop: '0.2rem' })}>
                  ⚠️ Nothing touches stock until you hit Confirm & Post GRN below.
                </div>
              </div>

              {reviewItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setReviewItems([])}
                  className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                >
                  Clear All Rows
                </button>
              )}
            </div>

            {reviewItems.length === 0 ? (
              <div
                className="py-10 text-center border-2 border-dashed"
                style={{ borderColor: palette.line, color: palette.muted }}
              >
                <Layers size={36} className="mx-auto mb-2 opacity-50" />
                <p style={fz(15, { fontWeight: 600 })}>The review table is currently empty</p>
                <p style={fz(13, { marginTop: '0.25rem' })}>
                  Add items using the entry form above or click "Load Sample Invoice" to test.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border-2 mb-4" style={{ borderColor: palette.line }}>
                <table className="w-full text-left" style={fz(13)}>
                  <thead>
                    <tr
                      className="border-b-2 select-none"
                      style={{
                        backgroundColor: `${palette.navy}0a`,
                        borderColor: palette.line,
                        color: palette.ink,
                      }}
                    >
                      <th className="px-3 py-2.5 font-bold"># / SKU</th>
                      <th className="px-3 py-2.5 font-bold">Product Description</th>
                      <th className="px-3 py-2.5 text-right font-bold">Billed Qty</th>
                      <th className="px-3 py-2.5 text-right font-bold">Free</th>
                      <th className="px-3 py-2.5 text-right font-bold">Total Recv</th>
                      <th className="px-3 py-2.5 text-right font-bold">Unit Price</th>
                      <th className="px-3 py-2.5 text-right font-bold">Landed Cost</th>
                      <th className="px-3 py-2.5 text-right font-bold">Scheme Savings</th>
                      <th className="px-3 py-2.5 text-right font-bold">Tax (CGST+SGST)</th>
                      <th className="px-3 py-2.5 text-right font-bold">Line Total</th>
                      <th className="px-3 py-2.5 text-center font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewItems.map((it, idx) => (
                      <tr
                        key={it.id || idx}
                        className="border-t-2 transition-colors hover:bg-black/5"
                        style={{ borderColor: palette.line }}
                      >
                        <td className="px-3 py-2.5 font-mono font-bold" style={{ color: palette.navy }}>
                          <span className="text-xs text-gray-500 mr-1.5">{idx + 1}.</span>
                          {it.sku}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-bold" style={{ color: palette.ink }}>
                            {it.productName}
                          </div>
                          <div className="text-xs" style={{ color: palette.muted }}>
                            HSN: {it.hsn} · Lot: {it.batchNumber} · Exp: {it.expiry}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold">{it.qty}</td>
                        <td className="px-3 py-2.5 text-right font-bold" style={{ color: palette.amber }}>
                          {it.freeQty > 0 ? `+${it.freeQty}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold">
                          {it.totalReceivedQty || it.qty + (it.freeQty || 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">₹{money(it.unitPrice)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: palette.navy }}>
                          ₹{money(it.landedCostPerUnit || it.unitPrice)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono" style={{ color: palette.amber }}>
                          {it.discountAmount ? `−₹${money(it.discountAmount)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">
                          ₹{money((it.cgstAmount || 0) + (it.sgstAmount || 0))}
                          <div className="text-gray-400">
                            ({it.cgstPercent + it.sgstPercent}%)
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-sm" style={{ color: palette.good }}>
                          ₹{money(it.lineTotal)}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleEditReviewRow(idx)}
                            title="Edit this line item"
                            className="p-1.5 text-blue-600 hover:text-blue-800 cursor-pointer"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteReviewRow(idx)}
                            title="Remove this line item"
                            className="p-1.5 text-red-600 hover:text-red-800 cursor-pointer ml-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Invoice Financial Summary Box */}
            {reviewItems.length > 0 && (
              <div
                className="p-4 border-2 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
                style={{ backgroundColor: `${palette.navy}08`, borderColor: palette.line }}
              >
                <div>
                  <div style={labelStyle}>Total Cases Recv</div>
                  <div className="font-extrabold text-xl" style={{ color: palette.ink }}>
                    {reviewTotals.totalCases} cases
                  </div>
                  <div className="text-xs" style={{ color: palette.muted }}>
                    ({reviewTotals.billedCases} billed + {reviewTotals.freeCases} free)
                  </div>
                </div>

                <div>
                  <div style={labelStyle}>Taxable Subtotal</div>
                  <div className="font-extrabold text-xl font-mono" style={{ color: palette.ink }}>
                    ₹{money(reviewTotals.taxableTotal)}
                  </div>
                </div>

                <div>
                  <div style={labelStyle}>Scheme Savings</div>
                  <div className="font-extrabold text-xl font-mono" style={{ color: palette.amber }}>
                    −₹{money(reviewTotals.schemeSavingsTotal)}
                  </div>
                </div>

                <div>
                  <div style={labelStyle}>Total GST</div>
                  <div className="font-extrabold text-xl font-mono" style={{ color: palette.ink }}>
                    ₹{money(reviewTotals.cgstTotal + reviewTotals.sgstTotal)}
                  </div>
                  <div className="text-xs" style={{ color: palette.muted }}>
                    CGST: ₹{money(reviewTotals.cgstTotal)} · SGST: ₹{money(reviewTotals.sgstTotal)}
                  </div>
                </div>

                <div>
                  <div style={labelStyle}>Payable Invoice Total</div>
                  <div className="font-extrabold text-2xl font-mono" style={{ color: palette.good }}>
                    ₹{money(reviewTotals.grandTotal)}
                  </div>
                </div>
              </div>
            )}

            {/* Confirm & Post GRN Action Bar */}
            {reviewItems.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                {activeGrnToEdit && (
                  <button
                    type="button"
                    onClick={handleCancelEditing}
                    className="w-full sm:w-auto border-2 px-4 py-3 font-bold cursor-pointer"
                    style={{ borderColor: palette.line, backgroundColor: '#FFFFFF' }}
                  >
                    Cancel Editing
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleConfirmAndPostGrn}
                  className="w-full sm:w-auto border-2 px-8 py-3.5 font-bold flex items-center justify-center gap-2 cursor-pointer transition-transform hover:scale-[1.01] focus-ring shadow-md"
                  style={{
                    backgroundColor: palette.good,
                    borderColor: palette.good,
                    color: '#FFFFFF',
                    ...fz(16, { fontWeight: 800 }),
                  }}
                >
                  <CheckCircle2 size={20} />
                  {activeGrnToEdit ? 'Save Changes & Recalculate Stock' : 'Confirm & Post GRN'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: POSTED GRN HISTORY & LEDGER */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div
            className="p-4 border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
            style={cardStyle}
          >
            <div className="relative flex-1 max-w-md">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: palette.muted }}
              />
              <input
                type="text"
                placeholder="Search by GRN #, Invoice #, Supplier, or Product..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full border-2 pl-9 pr-3 py-2 text-sm focus-ring"
                style={inputStyle}
              />
            </div>

            <div className="text-xs font-semibold" style={{ color: palette.muted }}>
              Showing {filteredGrns.length} of {grns.length} Posted Consignments
            </div>
          </div>

          {filteredGrns.length === 0 ? (
            <div
              className="py-12 text-center border-2 border-dashed"
              style={{ borderColor: palette.line, color: palette.muted }}
            >
              <FileSpreadsheet size={40} className="mx-auto mb-2 opacity-50" />
              <p style={fz(16, { fontWeight: 700 })}>No matching GRN vouchers found</p>
              <p style={fz(13)}>Click "New Inward GRN" above to record an inward consignment.</p>
            </div>
          ) : (
            filteredGrns.map((grn) => {
              const isExpanded = expandedGrnId === grn.id;
              const wh = warehouses.find((w) => w.id === grn.warehouseId);

              return (
                <div key={grn.id} className="border-2 shadow-sm transition-all" style={cardStyle}>
                  <div
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b-2"
                    style={{ borderColor: palette.line }}
                  >
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span
                          className="font-mono font-extrabold text-base px-2.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: palette.navy }}
                        >
                          {grn.grnNumber}
                        </span>
                        <span className="font-bold" style={fz(16, { color: palette.ink })}>
                          Inv #{grn.invoiceNo}
                        </span>
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded border"
                          style={{ borderColor: palette.good, color: palette.good }}
                        >
                          Stock Live & Posted
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs mt-1.5" style={{ color: palette.muted }}>
                        <span>
                          <strong>Supplier:</strong> {grn.supplierName}
                        </span>
                        <span>
                          <strong>Date:</strong> {grn.inwardDate}
                        </span>
                        <span>
                          <strong>Godown:</strong> {wh?.name || grn.warehouseId}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-right">
                        <div className="text-xs uppercase font-bold" style={{ color: palette.muted }}>
                          {grn.totalReceivedQty} Cases ({grn.items.length} items)
                        </div>
                        <div className="font-extrabold text-lg font-mono" style={{ color: palette.good }}>
                          ₹{money(grn.grandTotal)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedGrnId(isExpanded ? null : grn.id)}
                          className="border-2 px-3 py-1.5 text-xs font-bold cursor-pointer"
                          style={{ borderColor: palette.line }}
                        >
                          {isExpanded ? 'Hide Details' : 'View Lines'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEditGrn(grn)}
                          title="Edit this GRN and recalculate stock"
                          className="border-2 px-3 py-1.5 text-xs font-bold cursor-pointer flex items-center gap-1 text-blue-700"
                          style={{ borderColor: palette.line }}
                        >
                          <Edit2 size={13} />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteGrn(grn.id, grn.grnNumber)}
                          title="Delete GRN and reverse all stock"
                          className="border-2 p-1.5 text-xs font-bold cursor-pointer text-red-600 hover:bg-red-50"
                          style={{ borderColor: palette.line }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Line Items Table & Provider Details */}
                  {isExpanded && (
                    <div className="p-4 bg-black/5 space-y-3">
                      {(grn.supplierGstin || grn.supplierAddress || grn.supplierPhone || grn.vehicleNo || grn.placeOfSupply || grn.billedTo) && (
                        <div className="p-3 bg-white border rounded text-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2" style={{ borderColor: palette.line }}>
                          {grn.supplierGstin && (
                            <div>
                              <span className="text-gray-500 font-semibold block text-[10px] uppercase">Supplier GSTIN</span>
                              <span className="font-mono font-bold text-gray-800">{grn.supplierGstin}</span>
                            </div>
                          )}
                          {grn.supplierPhone && (
                            <div>
                              <span className="text-gray-500 font-semibold block text-[10px] uppercase">Supplier Phone</span>
                              <span className="text-gray-800">{grn.supplierPhone}</span>
                            </div>
                          )}
                          {grn.supplierEmail && (
                            <div>
                              <span className="text-gray-500 font-semibold block text-[10px] uppercase">Supplier Email</span>
                              <span className="text-gray-800">{grn.supplierEmail}</span>
                            </div>
                          )}
                          {grn.vehicleNo && (
                            <div>
                              <span className="text-gray-500 font-semibold block text-[10px] uppercase">Vehicle No</span>
                              <span className="font-mono font-bold text-gray-800">{grn.vehicleNo}</span>
                            </div>
                          )}
                          {grn.placeOfSupply && (
                            <div>
                              <span className="text-gray-500 font-semibold block text-[10px] uppercase">Place of Supply</span>
                              <span className="text-gray-800">{grn.placeOfSupply}</span>
                            </div>
                          )}
                          {grn.billedTo && (
                            <div>
                              <span className="text-gray-500 font-semibold block text-[10px] uppercase">Billed To</span>
                              <span className="text-gray-800">{grn.billedTo}</span>
                            </div>
                          )}
                          {grn.supplierAddress && (
                            <div className="sm:col-span-2">
                              <span className="text-gray-500 font-semibold block text-[10px] uppercase">Supplier Address</span>
                              <span className="text-gray-800">{grn.supplierAddress}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b font-bold text-gray-700">
                              <th className="py-2 px-2">SKU</th>
                              <th className="py-2 px-2">Product Name</th>
                              <th className="py-2 px-2">HSN</th>
                              <th className="py-2 px-2 text-right">Billed</th>
                              <th className="py-2 px-2 text-right">Free</th>
                              <th className="py-2 px-2 text-right">Total Cases</th>
                              <th className="py-2 px-2 text-right">Rate</th>
                              <th className="py-2 px-2 text-right">Landed Cost</th>
                              <th className="py-2 px-2 text-right">Line Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {grn.items.map((it, i) => (
                              <tr key={it.id || i} className="border-b border-gray-200">
                                <td className="py-2 px-2 font-mono font-bold text-blue-900">{it.sku}</td>
                                <td className="py-2 px-2 font-semibold">{it.productName}</td>
                                <td className="py-2 px-2 font-mono">{it.hsn}</td>
                                <td className="py-2 px-2 text-right font-bold">{it.qty}</td>
                                <td className="py-2 px-2 text-right text-amber-600 font-bold">
                                  {it.freeQty > 0 ? `+${it.freeQty}` : '—'}
                                </td>
                                <td className="py-2 px-2 text-right font-extrabold">
                                  {it.totalReceivedQty || it.qty + (it.freeQty || 0)}
                                </td>
                                <td className="py-2 px-2 text-right font-mono">₹{money(it.unitPrice)}</td>
                                <td className="py-2 px-2 text-right font-mono font-bold text-blue-900">
                                  ₹{money(it.landedCostPerUnit || it.unitPrice)}
                                </td>
                                <td className="py-2 px-2 text-right font-mono font-bold text-green-700">
                                  ₹{money(it.lineTotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
