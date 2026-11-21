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
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { PackIcon } from '../common/PackIcon';
import { CATS } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { CategoryKey, GRN, GrnLineItem, GrnSchemeMode, GrnSchemeType, Taxability } from '../../types';
import {
  normalizeTo8DigitHsn,
  calculateLandedCostBreakdown,
  generateAutoSku,
  generateBatchNumber,
  money,
  resolveProductGstRate,
  resolveProductHsn,
} from '../../utils/billing';
import { downloadSingleGrnCsv } from '../../utils/grnCsvExport';
import { todayISO } from "../../utils/dateLocal";
import { validatePhone } from "../../utils/validation";

interface InwardConsignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedWarehouseId?: string;
  preselectedProductId?: number;
  initialGrnToEdit?: GRN | null;
  /** Opens bulk CSV/Excel import from the New purchase screen */
  onOpenBulkImport?: () => void;
  onSaved?: (info: { grnId?: string; grnNumber?: string; cases: number; warehouseName: string; isEdit?: boolean }) => void;
}

interface DraftLineState {
  id: string;
  isNewProduct: boolean;
  selectedProductId?: number;
  productName: string;
  category: CategoryKey;
  taxability: Taxability;
  hsn: string;
  pack: string;
  volume: number;
  unitsPerCrate: number;
  qty: number;
  unitPrice: number;
  isGstIncluded: boolean;
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
    taxability: 'taxable',
    hsn: catDef.hsn,
    pack: 'PET',
    volume: 150,
    unitsPerCrate: 24,
    qty: 50,
    unitPrice: 158.57,
    isGstIncluded: false,
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
  onSaved,
}) => {
  const isPhone = useIsMobile(767);
  const {
    products,
    warehouses,
    grns,
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

  // Manual Inward Costs (Freight, Labour, Other) — automatically distributed across landed cost
  const [freightCost, setFreightCost] = useState<number>(
    initialGrnToEdit?.inwardCosts?.freight || 0
  );
  const [labourCost, setLabourCost] = useState<number>(
    (initialGrnToEdit?.inwardCosts?.loadingLabour || 0) +
      (initialGrnToEdit?.inwardCosts?.unloadingLabour || 0)
  );
  const [otherInwardCost, setOtherInwardCost] = useState<number>(
    (initialGrnToEdit?.inwardCosts?.transport || 0) +
      (initialGrnToEdit?.inwardCosts?.otherInwardCosts || 0)
  );
  const [showMoreInwardCosts, setShowMoreInwardCosts] = useState(false);

  const [targetWarehouseId, setTargetWarehouseId] = useState(
    initialGrnToEdit?.warehouseId || preselectedWarehouseId || ''
  );
  const [notes, setNotes] = useState(initialGrnToEdit?.notes || '');

  // Review Table state: Nothing touches stock until confirmed
  const [reviewItems, setReviewItems] = useState<GrnLineItem[]>(
    initialGrnToEdit?.items || []
  );

  // Known suppliers lookup (from past GRNs + supplier directory cache)
  const knownSuppliers = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string; gstin?: string; address?: string; email?: string }>();
    try {
      const raw = localStorage.getItem('mrwater_cache_suppliers_master');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const s of parsed) {
            const key = String(s?.name || '').trim().toLowerCase();
            if (key) {
              map.set(key, {
                name: String(s.name).trim(),
                phone: s.phone || '',
                gstin: s.gstin || '',
                address: s.address || '',
                email: s.email || '',
              });
            }
          }
        }
      }
    } catch { /* ignore storage errors */ }
    for (const g of grns || []) {
      const key = String(g.supplierName || '').trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      map.set(key, {
        name: existing?.name || g.supplierName.trim(),
        phone: existing?.phone || g.supplierPhone || '',
        gstin: existing?.gstin || g.supplierGstin || '',
        address: existing?.address || g.supplierAddress || '',
        email: existing?.email || g.supplierEmail || '',
      });
    }
    return Array.from(map.values());
  }, [grns]);

  const applySupplierAutofill = (nameVal: string) => {
    const clean = nameVal.trim().toLowerCase();
    if (!clean) return;
    const match = knownSuppliers.find((s) => s.name.toLowerCase() === clean);
    if (!match) return;
    if (!supplierPhone.trim() && match.phone) setSupplierPhone(match.phone);
    if (!supplierGstin.trim() && match.gstin) setSupplierGstin(match.gstin);
    if (!supplierAddress.trim() && match.address) setSupplierAddress(match.address);
    if (!supplierEmail.trim() && match.email) setSupplierEmail(match.email);
  };

  // Draft entry line
  const [draftLine, setDraftLine] = useState<DraftLineState>(() => {
    if (preselectedProductId) {
      const p = products.find((x) => x.id === preselectedProductId);
      if (p) {
        const isNonGst = p.taxability === 'non_gst';
        const halfTax = isNonGst ? 0 : Math.round((resolveProductGstRate(p) * 100) / 2 * 10) / 10;
        return {
          id: `line-${Date.now()}`,
          isNewProduct: false,
          selectedProductId: p.id,
          productName: p.name,
          category: p.category,
          taxability: isNonGst ? 'non_gst' : 'taxable',
          hsn: resolveProductHsn(p),
          pack: p.pack || 'PET',
          volume: p.volume || 150,
          unitsPerCrate: p.unitsPerCrate || 24,
          qty: 24,
          unitPrice: p.cost || 210,
          isGstIncluded: !isNonGst && !!p.ratesIncludeGst,
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
  const [phoneStep, setPhoneStep] = useState<1 | 2 | 3>(1);
  const [phoneStepError, setPhoneStepError] = useState<string | null>(null);
  const [showPhoneCatalogSheet, setShowPhoneCatalogSheet] = useState(false);
  const [phoneCatalogSearch, setPhoneCatalogSearch] = useState('');
  const [phonePrintedTotal, setPhonePrintedTotal] = useState<string>('');
  const [phoneNewProductMode, setPhoneNewProductMode] = useState(false);

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
    setPhoneStep(1);
    setPhoneStepError(null);
    setPhonePrintedTotal('');
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
      setFreightCost(initialGrnToEdit.inwardCosts?.freight || 0);
      setLabourCost(
        (initialGrnToEdit.inwardCosts?.loadingLabour || 0) +
          (initialGrnToEdit.inwardCosts?.unloadingLabour || 0)
      );
      setOtherInwardCost(
        (initialGrnToEdit.inwardCosts?.transport || 0) +
          (initialGrnToEdit.inwardCosts?.otherInwardCosts || 0)
      );
      setTargetWarehouseId(initialGrnToEdit.warehouseId || (warehouses[0]?.id ?? ''));
      setNotes(initialGrnToEdit.notes || '');
      setReviewItems(initialGrnToEdit.items || []);
      setEditingIndex(null);
      setShowAddForm(false);
    } else if (preselectedProductId) {
      const p = products.find((x) => x.id === preselectedProductId);
      if (p) {
        const isNonGst = p.taxability === 'non_gst';
        const halfTax = isNonGst ? 0 : Math.round((resolveProductGstRate(p) * 100) / 2 * 10) / 10;
        setDraftLine({
          id: `line-${Date.now()}`,
          isNewProduct: false,
          selectedProductId: p.id,
          productName: p.name,
          category: p.category,
          taxability: isNonGst ? 'non_gst' : 'taxable',
          hsn: resolveProductHsn(p),
          pack: p.pack || 'PET',
          volume: p.volume || 150,
          unitsPerCrate: p.unitsPerCrate || 24,
          qty: 24,
          unitPrice: p.cost || 210,
          isGstIncluded: !isNonGst && !!p.ratesIncludeGst,
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

  const totalInwardCost = useMemo(
    () =>
      Math.max(0, Number(freightCost) || 0) +
      Math.max(0, Number(labourCost) || 0) +
      Math.max(0, Number(otherInwardCost) || 0),
    [freightCost, labourCost, otherInwardCost]
  );

  // Raw draft breakdown without inward allocation first to get draft received qty
  const draftReceivedQty = useMemo(() => {
    const mode = draftLine.schemeMode || 'inclusive';
    let freeQty = 0;
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
    return mode === 'additive' ? draftLine.qty + freeQty : draftLine.qty;
  }, [draftLine]);

  // Existing review cases
  const reviewCasesTotal = useMemo(
    () =>
      reviewItems.reduce(
        (s, item) =>
          s + (Number(item.totalReceivedQty) || (item.schemeMode === 'additive' ? (Number(item.qty) || 0) + (Number(item.freeQty) || 0) : Number(item.qty) || 0)),
        0
      ),
    [reviewItems]
  );

  // Per-case inward cost for live review items & draft preview
  const reviewInwardCostPerCrate = reviewCasesTotal > 0 ? totalInwardCost / reviewCasesTotal : 0;
  const draftPreviewCases = useMemo(() => {
    if (editingIndex !== null && reviewItems[editingIndex]) {
      const oldRec = Number(reviewItems[editingIndex].totalReceivedQty) || Number(reviewItems[editingIndex].qty) || 0;
      return Math.max(1, reviewCasesTotal - oldRec + draftReceivedQty);
    }
    return Math.max(1, reviewCasesTotal + draftReceivedQty);
  }, [editingIndex, reviewItems, reviewCasesTotal, draftReceivedQty]);
  const draftPreviewInwardPerCrate = draftPreviewCases > 0 ? totalInwardCost / draftPreviewCases : 0;

  // Line metrics calculation (supports Non-GST, GST Included/Excluded rate, and live Freight+Labour landed cost)
  const metrics = useMemo(() => {
    let freeQty = 0;
    const mode = draftLine.schemeMode || 'inclusive';
    const isNonGst = draftLine.taxability === 'non_gst';

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

    const cg = isNonGst ? 0 : draftLine.cgstPercent;
    const sg = isNonGst ? 0 : draftLine.sgstPercent;
    const taxFrac = (cg + sg) / 100;
    const exGstRate =
      !isNonGst && draftLine.isGstIncluded && taxFrac > 0
        ? Math.round((draftLine.unitPrice / (1 + taxFrac)) * 100) / 100
        : draftLine.unitPrice;

    const breakdown = calculateLandedCostBreakdown({
      qty: draftLine.qty,
      unitPrice: exGstRate,
      unitsPerCrate: draftLine.unitsPerCrate || 24,
      pack: draftLine.pack,
      volume: draftLine.volume,
      cgstPercent: cg,
      sgstPercent: sg,
      schemeType: draftLine.schemeType,
      schemeMode: mode,
      schemeBuyQty: draftLine.schemeBuyQty,
      schemeFreeQty: draftLine.schemeFreeQty,
      freeQty,
      discountPercent: draftLine.schemeDiscountPercent,
      discountFlat: draftLine.schemeFlatDiscountPerCase,
      inwardCostPerCrate: draftPreviewInwardPerCrate,
    });

    return {
      exGstRate,
      discountAmount: breakdown.discountAmount,
      taxableAmount: breakdown.taxableAmount,
      cgstAmount: breakdown.cgstAmount,
      sgstAmount: breakdown.sgstAmount,
      taxAmount: breakdown.taxAmount,
      lineTotal: breakdown.lineTotal,
      paidQty: breakdown.paidQty,
      freeQty: breakdown.freeQty,
      totalReceivedQty: breakdown.totalReceivedQty,
      landedCostPerCrate: breakdown.landedCostPerCrate,
      landedCostPerCrateExGst: breakdown.landedCostPerCrateExGst,
      landedCostPerBottle: breakdown.landedCostPerUnit,
      effectiveCostPerCrateExGst: breakdown.effectiveCostPerCrateExGst,
      effectiveCostPerCrateInclGst: breakdown.effectiveCostPerCrateInclGst,
      effectiveCostPerUnit: breakdown.effectiveCostPerCrateExGst,
    };
  }, [draftLine, draftPreviewInwardPerCrate]);

  // Review items with live inward cost (Freight + Labour + Other) allocated across cases
  const resolvedReviewItems = useMemo(() => {
    const roundedInward = Math.round(reviewInwardCostPerCrate * 100) / 100;
    const labourPerCase = reviewCasesTotal > 0 ? Math.round((labourCost / reviewCasesTotal) * 100) / 100 : 0;
    const freightPerCase = reviewCasesTotal > 0 ? Math.round((freightCost / reviewCasesTotal) * 100) / 100 : 0;
    return reviewItems.map((item) => {
      const isNonGst = item.taxability === 'non_gst';
      const cg = isNonGst ? 0 : Number(item.cgstPercent) || 0;
      const sg = isNonGst ? 0 : Number(item.sgstPercent) || 0;
      const b = calculateLandedCostBreakdown({
        qty: item.qty,
        unitPrice: item.unitPrice,
        unitsPerCrate: item.unitsPerCrate || 24,
        pack: item.pack,
        volume: item.volume,
        cgstPercent: cg,
        sgstPercent: sg,
        schemeType: item.schemeType,
        schemeMode: item.schemeMode,
        schemeBuyQty: item.schemeBuyQty,
        schemeFreeQty: item.schemeFreeQty,
        freeQty: item.freeQty,
        paidQty: item.paidQty,
        discountPercent: item.discountPercent,
        discountFlat: item.discountFlat,
        discountAmount: item.discountAmount,
        inwardCostPerCrate: reviewInwardCostPerCrate,
      });
      return {
        ...item,
        taxability: (isNonGst ? 'non_gst' : item.taxability || 'taxable') as Taxability,
        cgstPercent: cg,
        sgstPercent: sg,
        hsn: isNonGst ? (item.hsn || '').trim() : item.hsn,
        inwardCostPerCrate: roundedInward,
        labourCost: labourPerCase,
        freightCost: freightPerCase,
        effectiveCostPerCrateExGst: b.effectiveCostPerCrateExGst,
        effectiveCostPerCrateInclGst: b.effectiveCostPerCrateInclGst,
        effectiveCostPerUnit: b.effectiveCostPerCrateExGst,
        landedCostPerCrate: b.landedCostPerCrate,
        landedCostPerCrateExGst: b.landedCostPerCrateExGst,
        landedCostPerUnit: b.landedCostPerUnit,
      };
    });
  }, [reviewItems, reviewInwardCostPerCrate, reviewCasesTotal, labourCost, freightCost]);

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

    for (const item of resolvedReviewItems) {
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
  }, [resolvedReviewItems]);

  const phoneError = useMemo(
    () => (supplierPhone.trim() ? validatePhone(supplierPhone, { label: 'Supplier phone' }) : null),
    [supplierPhone]
  );

  if (!isOpen) return null;

  const handleCategoryChange = (cat: CategoryKey) => {
    const catDef = CATS[cat];
    let half = 10;
    if (cat === 'joos') half = 2.5;
    else if (cat === 'water') half = 9;
    else if (catDef) half = Math.round((catDef.gst * 100) / 2 * 10) / 10;

    setDraftLine((prev) => {
      const isNonGst = prev.taxability === 'non_gst';
      return {
        ...prev,
        category: cat,
        hsn: isNonGst ? prev.hsn : normalizeTo8DigitHsn(catDef?.hsn, cat, prev.productName, prev.taxability),
        cgstPercent: isNonGst ? 0 : half,
        sgstPercent: isNonGst ? 0 : half,
      };
    });
  };

  const handleSelectExisting = (prodId: number) => {
    const p = products.find((x) => x.id === prodId);
    if (!p) return;
    const isNonGst = p.taxability === 'non_gst';
    const frac = isNonGst ? 0 : resolveProductGstRate(p);
    const halfTax = isNonGst ? 0 : Math.round((frac * 100) / 2 * 10) / 10;

    setDraftLine((prev) => ({
      ...prev,
      isNewProduct: false,
      selectedProductId: prodId,
      productName: p.name,
      category: p.category,
      taxability: isNonGst ? 'non_gst' : 'taxable',
      hsn: normalizeTo8DigitHsn(
        p.hsn || (isNonGst ? '' : CATS[p.category]?.hsn),
        p.category,
        p.name,
        p.taxability
      ),
      pack: p.pack || 'PET',
      volume: p.volume || 150,
      unitsPerCrate: p.unitsPerCrate || 24,
      unitPrice: p.cost,
      isGstIncluded: !isNonGst && !!p.ratesIncludeGst,
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
    const isNonGst = draftLine.taxability === 'non_gst';

    const item: GrnLineItem = {
      id:
        editingIndex !== null && reviewItems[editingIndex]
          ? reviewItems[editingIndex].id
          : 'item_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      isNewProduct: draftLine.isNewProduct,
      productId: matchingProduct?.id || draftLine.selectedProductId,
      productName: effectiveName,
      category: draftLine.category,
      taxability: isNonGst ? 'non_gst' : 'taxable',
      sku: computedSku,
      hsn: isNonGst ? draftLine.hsn.trim() : draftLine.hsn,
      pack: draftLine.pack,
      volume: draftLine.volume,
      unitsPerCrate: draftLine.unitsPerCrate || 24,
      qty: draftLine.qty,
      paidQty: metrics.paidQty,
      freeQty: freeCasesCalculated,
      totalReceivedQty: metrics.totalReceivedQty,
      unitPrice: metrics.exGstRate,
      effectiveCostPerCrateExGst: metrics.effectiveCostPerCrateExGst,
      effectiveCostPerCrateInclGst: metrics.effectiveCostPerCrateInclGst,
      effectiveCostPerUnit: metrics.effectiveCostPerUnit,
      landedCostPerUnit: metrics.landedCostPerBottle,
      landedCostPerCrate: metrics.landedCostPerCrate,
      landedCostPerCrateExGst: metrics.landedCostPerCrateExGst,
      cgstPercent: isNonGst ? 0 : draftLine.cgstPercent,
      sgstPercent: isNonGst ? 0 : draftLine.sgstPercent,
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
    const it = resolvedReviewItems[idx];
    if (!it) return;
    const isNonGst = it.taxability === 'non_gst';
    setDraftLine({
      id: it.id,
      isNewProduct: !it.productId,
      selectedProductId: it.productId,
      productName: it.productName,
      category: it.category,
      taxability: isNonGst ? 'non_gst' : 'taxable',
      hsn: it.hsn,
      pack: it.pack || 'PET',
      volume: it.volume || 150,
      unitsPerCrate: it.unitsPerCrate || 24,
      qty: it.qty,
      unitPrice: it.unitPrice,
      isGstIncluded: false,
      cgstPercent: isNonGst ? 0 : it.cgstPercent,
      sgstPercent: isNonGst ? 0 : it.sgstPercent,
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
    if (supplierPhone.trim() && phoneError) {
      notify(phoneError);
      return;
    }
    if (!invoiceNo.trim()) {
      notify('Please specify Invoice Number.');
      return;
    }
    if (resolvedReviewItems.length === 0) {
      notify('Please add at least one line item into the review table.');
      return;
    }
    if (!targetWarehouseId) {
      notify('Select the warehouse this invoice is being received into before confirming — there is no default.');
      return;
    }

    const roundedInwardPerCase = Math.round(reviewInwardCostPerCrate * 100) / 100;
    const inwardCostsPayload =
      totalInwardCost > 0
        ? {
            transport: 0,
            freight: Math.max(0, Number(freightCost) || 0),
            loadingLabour: Math.max(0, Number(labourCost) || 0),
            unloadingLabour: 0,
            otherInwardCosts: Math.max(0, Number(otherInwardCost) || 0),
            totalInwardCost,
            inwardCostPerCrate: roundedInwardPerCase,
          }
        : undefined;

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
        inwardCosts: inwardCostsPayload,
        totalInwardCost,
        inwardCostPerCrate: roundedInwardPerCase,
        items: resolvedReviewItems,
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
      const whName = warehouses.find((w) => w.id === targetWarehouseId)?.name || 'godown';
      onSaved?.({
        grnId: initialGrnToEdit.id,
        grnNumber: initialGrnToEdit.grnNumber,
        cases: totals.totalCases,
        warehouseName: whName,
        isEdit: true,
      });
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
        inwardCosts: inwardCostsPayload,
        totalInwardCost,
        inwardCostPerCrate: roundedInwardPerCase,
        items: resolvedReviewItems,
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
      const whName = warehouses.find((w) => w.id === targetWarehouseId)?.name || 'Main godown';
      onSaved?.({
        grnId: posted.id,
        grnNumber: posted.grnNumber,
        cases: totals.totalCases,
        warehouseName: whName,
        isEdit: false,
      });
      }
    } catch (err: any) {
      const issues = err?.issues as { message: string }[] | undefined;
      notify(
        issues && issues.length > 0
          ? `Could not post this invoice:\n${issues.map((i) => `• ${i.message}`).join('\n')}`
          : err?.message || 'Failed to post GRN.'
      );
      return;
    }

    if (isPhone) {
      onClose();
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

  if (isPhone) {
    const selectedWhName = warehouses.find((w) => w.id === targetWarehouseId)?.name || 'Main godown';
    const invDateFormatted = inwardDate
      ? new Date(inwardDate.length === 10 ? inwardDate + 'T12:00:00' : inwardDate).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';
    const printedNum = phonePrintedTotal.trim() ? Number(phonePrintedTotal) : totals.grand;
    const printedDiff = Math.round((totals.grand - (isNaN(printedNum) ? totals.grand : printedNum)) * 100) / 100;

    const handlePhoneStep1Next = () => {
      setPhoneStepError(null);
      if (!supplierName.trim()) {
        setPhoneStepError('Enter the supplier / party name.');
        return;
      }
      if (supplierPhone.trim() && phoneError) {
        setPhoneStepError(phoneError);
        return;
      }
      if (!invoiceNo.trim()) {
        setPhoneStepError('Enter the supplier invoice number.');
        return;
      }
      if (!targetWarehouseId) {
        setPhoneStepError('Select the godown receiving this stock.');
        return;
      }
      setPhoneStep(2);
    };

    const handlePhoneStep2Next = () => {
      setPhoneStepError(null);
      if (showAddForm && draftLine.productName.trim()) {
        if (draftLine.qty <= 0) {
          setPhoneStepError('Quantity must be at least 1 case.');
          return;
        }
        handleAddDraftToReview();
        setShowAddForm(false);
        setPhoneStep(3);
        return;
      }
      if (resolvedReviewItems.length === 0) {
        setPhoneStepError('Add at least one beverage product first.');
        return;
      }
      setPhoneStep(3);
    };

    return (
      <div role="dialog" aria-modal="true" aria-label="New purchase" className="rt-flow-phone">
        <div className="hh-sales-top hh-sales-top--flush hh-inv-top--flow">
          <div className="hh-sales-top__row">
            <button
              type="button"
              onClick={() => {
                setPhoneStepError(null);
                if (phoneStep === 1) onClose();
                else setPhoneStep((s) => (s === 3 ? 2 : 1));
              }}
              className="hh-inv-backbtn"
            >
              <span>‹</span>
              <span>{initialGrnToEdit ? `Edit ${initialGrnToEdit.grnNumber}` : 'New purchase'}</span>
            </button>
            {phoneStep === 1 && !initialGrnToEdit && onOpenBulkImport && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBulkImport();
                }}
                className="hh-inv-glass-pill"
              >
                Bulk import
              </button>
            )}
          </div>
          <div className="hh-inv-seg" aria-hidden="true">
            <span className={`hh-inv-seg__bar ${phoneStep >= 1 ? 'hh-inv-seg__bar--on' : ''}`} />
            <span className={`hh-inv-seg__bar ${phoneStep >= 2 ? 'hh-inv-seg__bar--on' : ''}`} />
            <span className={`hh-inv-seg__bar ${phoneStep >= 3 ? 'hh-inv-seg__bar--on' : ''}`} />
          </div>
          <div className="rt-stp">
            {phoneStep === 1 && 'Step 1 of 3 · Supplier and invoice'}
            {phoneStep === 2 && 'Step 2 of 3 · Items'}
            {phoneStep === 3 && 'Step 3 of 3 · Review'}
          </div>
        </div>

        <div className="rt-flow-phone__body space-y-3">
          {phoneStepError && (
            <div className="hh-inv-card hh-inv-card--alert-red text-[12.5px] font-semibold text-rose-700">
              {phoneStepError}
            </div>
          )}

          {phoneStep === 1 && (
            <>
              <div className="hh-inv-card space-y-2.5">
                <label className="hh-inv-field hh-inv-field--focus">
                  <span className="hh-inv-field__label">Supplier / Party *</span>
                  <input
                    list="inward-known-suppliers"
                    value={supplierName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSupplierName(val);
                      applySupplierAutofill(val);
                    }}
                    onBlur={(e) => applySupplierAutofill(e.target.value)}
                    placeholder="Supplier / Party name…"
                  />
                  <datalist id="inward-known-suppliers">
                    {knownSuppliers.map((s) => (
                      <option key={s.name} value={s.name} />
                    ))}
                  </datalist>
                </label>

                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">Supplier GSTIN (Optional)</span>
                  <input
                    autoCapitalize="characters"
                    value={supplierGstin}
                    onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())}
                    placeholder="Optional (leave blank for Non-GST)"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="hh-inv-field">
                    <span className="hh-inv-field__label">Supplier Invoice No.</span>
                    <input
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="e.g. A-4471"
                    />
                  </label>
                  <label className="hh-inv-field">
                    <span className="hh-inv-field__label">Invoice Date</span>
                    <input
                      type="date"
                      value={inwardDate}
                      onChange={(e) => setInwardDate(e.target.value)}
                    />
                  </label>
                </div>

                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">Vehicle No.</span>
                  <input
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                    placeholder="e.g. OD-02-AB-4471"
                  />
                </label>

                <label className="hh-inv-field">
                  <span className="hh-inv-field__label">Receive Into</span>
                  <select
                    value={targetWarehouseId}
                    onChange={(e) => setTargetWarehouseId(e.target.value)}
                  >
                    <option value="">Choose godown…</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={() => setShowProviderFields((p) => !p)}
                className="text-left px-1 text-[12px] font-medium text-slate-500 cursor-pointer min-h-0"
              >
                Phone, email, address and place of supply are optional and sit under{' '}
                <span className="font-bold text-[#2864d9]">&quot;More supplier details&quot;</span>.
              </button>

              {showProviderFields && (
                <div className="hh-inv-card space-y-2.5">
                  <label className="hh-inv-field">
                    <span className="hh-inv-field__label">Supplier Phone</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={supplierPhone}
                      onChange={(e) => setSupplierPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="hh-inv-field">
                      <span className="hh-inv-field__label">Email</span>
                      <input
                        type="email"
                        value={supplierEmail}
                        onChange={(e) => setSupplierEmail(e.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                    <label className="hh-inv-field">
                      <span className="hh-inv-field__label">Place of Supply</span>
                      <input
                        value={placeOfSupply}
                        onChange={(e) => setPlaceOfSupply(e.target.value)}
                        placeholder="Odisha (21)"
                      />
                    </label>
                  </div>
                  <label className="hh-inv-field">
                    <span className="hh-inv-field__label">Supplier Address</span>
                    <input
                      value={supplierAddress}
                      onChange={(e) => setSupplierAddress(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                </div>
              )}
            </>
          )}

          {phoneStep === 2 && (
            <>
              {resolvedReviewItems.map((it, idx) => (
                <div key={it.id || idx} className="hh-inv-card space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <PackIcon size="sm" pack={it.pack} name={it.productName} />
                      <div className="min-w-0">
                        <div className="text-[14px] font-bold text-slate-900 truncate">{it.productName}</div>
                        <div className="text-[11.5px] text-slate-500">
                          {it.qty} cs{it.freeQty ? ` + ${it.freeQty} free` : ''} · {it.batchNumber || 'Auto batch'} · ₹{money(it.lineTotal)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditRow(idx)}
                        className="text-[12px] font-bold text-[#2864d9] min-h-0 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(idx)}
                        className="text-[12px] font-bold text-rose-600 min-h-0 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {(showAddForm || resolvedReviewItems.length === 0) && (
                <div className="hh-inv-card space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!phoneNewProductMode) setShowPhoneCatalogSheet(true);
                      }}
                      className="flex items-center gap-2 min-w-0 text-left min-h-0 cursor-pointer"
                    >
                      <PackIcon size="sm" pack={draftLine.pack} name={draftLine.productName || 'Water'} />
                      <span className="text-[14.5px] font-bold text-slate-900 truncate">
                        {draftLine.productName ? draftLine.productName : 'Pick beverage'}
                      </span>
                    </button>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowPhoneCatalogSheet(true)}
                        className="text-[12px] font-bold text-[#2864d9] min-h-0 cursor-pointer"
                      >
                        Catalog
                      </button>
                      {resolvedReviewItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftLine(defaultLineState(draftLine.category));
                            setShowAddForm(false);
                            setEditingIndex(null);
                          }}
                          className="text-[12px] font-bold text-rose-600 min-h-0 cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {phoneNewProductMode && (
                    <label className="hh-inv-field hh-inv-field--focus">
                      <span className="hh-inv-field__label">New beverage name *</span>
                      <input
                        value={draftLine.productName}
                        onChange={(e) => setDraftLine((p) => ({ ...p, isNewProduct: true, selectedProductId: undefined, productName: e.target.value }))}
                        placeholder="e.g. Water 1L PET"
                      />
                    </label>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <label className="hh-inv-field">
                      <span className="hh-inv-field__label">Billed</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={draftLine.qty}
                        onChange={(e) => setDraftLine((p) => ({ ...p, qty: Math.max(1, Number(e.target.value) || 1) }))}
                      />
                    </label>
                    <div className="hh-inv-field">
                      <span className="hh-inv-field__label">Inward</span>
                      <div className="text-[14px] font-bold text-slate-900 leading-[24px] tabular-nums">
                        {metrics.totalReceivedQty}
                      </div>
                    </div>
                    <label className="hh-inv-field">
                      <span className="hh-inv-field__label">Units/case</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={draftLine.unitsPerCrate}
                        onChange={(e) => setDraftLine((p) => ({ ...p, unitsPerCrate: Math.max(1, Number(e.target.value) || 1) }))}
                      />
                    </label>
                  </div>

                  <label className="hh-inv-field">
                    <span className="hh-inv-field__label">Batch / Lot No.</span>
                    <input
                      value={draftLine.batchNumber}
                      onChange={(e) => setDraftLine((p) => ({ ...p, batchNumber: e.target.value }))}
                      placeholder={generateBatchNumber(draftLine.productName || 'B2311')}
                    />
                  </label>

                  <label className="hh-inv-field">
                    <span className="hh-inv-field__label">Expiry Date</span>
                    <input
                      type="date"
                      value={draftLine.expiry}
                      onChange={(e) => setDraftLine((p) => ({ ...p, expiry: e.target.value }))}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="hh-inv-field">
                      <span className="hh-inv-field__label">Landed Cost (₹/cs)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={draftLine.unitPrice}
                        onChange={(e) => setDraftLine((p) => ({ ...p, unitPrice: Math.max(0, Number(e.target.value) || 0) }))}
                      />
                    </label>
                    <label className="hh-inv-field">
                      <span className="hh-inv-field__label">Free Crates</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={draftLine.freeQty || 0}
                        onChange={(e) => {
                          const fq = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setDraftLine((p) => ({
                            ...p,
                            freeQty: fq,
                            schemeType: fq > 0 ? 'free_cases' : 'none',
                            schemeMode: fq > 0 ? 'additive' : 'inclusive',
                          }));
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setPhoneStepError(null);
                  if (showAddForm && draftLine.productName.trim()) {
                    handleAddDraftToReview();
                  }
                  setShowAddForm(true);
                  setPhoneNewProductMode(false);
                  if (!showAddForm || !draftLine.productName.trim()) {
                    setShowPhoneCatalogSheet(true);
                  }
                }}
                className="hh-inv-btn-outline w-full"
              >
                + Add another beverage
              </button>

              <p className="text-[12px] text-slate-500 px-1 leading-snug">
                Pick an existing beverage or create a new one. Supplier scheme is optional.
              </p>
            </>
          )}

          {phoneStep === 3 && (
            <>
              <div className="hh-inv-card space-y-2.5">
                <div className="border-b border-slate-100 pb-2">
                  <div className="text-[15px] font-extrabold text-slate-900">{supplierName}</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">
                    Inv {invoiceNo} · {invDateFormatted} · into {selectedWhName}
                  </div>
                </div>

                <div className="space-y-1.5 text-[13px]">
                  {resolvedReviewItems.map((it, idx) => (
                    <div key={it.id || idx} className="flex items-center justify-between gap-2">
                      <span className="text-slate-700 font-medium truncate">
                        {it.productName} · {it.qty} cs{it.freeQty ? ` + ${it.freeQty} free` : ''}
                      </span>
                      <span className="font-bold text-slate-900 tabular-nums shrink-0">
                        ₹{money(Number(it.lineTotal) || 0)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 text-slate-500 pt-1">
                    <span>Taxable</span>
                    <span className="font-semibold text-slate-800 tabular-nums">₹{money(totals.taxable)}</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between">
                  <span className="text-[15px] font-bold text-slate-900">Total</span>
                  <span className="text-[17px] font-extrabold text-slate-900 tabular-nums">
                    ₹{money(totals.grand)}
                  </span>
                </div>
              </div>

              <div className="hh-inv-card space-y-2">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-slate-500 font-medium">Invoice printed total</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={phonePrintedTotal === '' ? String(Math.round(totals.grand * 100) / 100) : phonePrintedTotal}
                    onChange={(e) => setPhonePrintedTotal(e.target.value)}
                    aria-label="Invoice printed total"
                    className="w-28 text-right font-bold text-slate-900 border-b border-slate-200 bg-transparent py-0.5 tabular-nums focus:outline-none focus:border-[#2864d9]"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-slate-500 font-medium">Difference</span>
                  <span className={`font-bold tabular-nums ${Math.abs(printedDiff) < 1 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {printedDiff < 0 ? '-' : ''}₹{money(Math.abs(printedDiff))}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-amber-950 leading-snug">
                Stock goes up by {totals.totalCases} cs in {selectedWhName} when you save.
              </div>
            </>
          )}
        </div>

        <div className="rt-flow-phone__footer">
          {phoneStep === 1 && (
            <button type="button" onClick={handlePhoneStep1Next} className="hh-inv-btn-primary w-full">
              Next: items
            </button>
          )}
          {phoneStep === 2 && (
            <button type="button" onClick={handlePhoneStep2Next} className="hh-inv-btn-primary w-full">
              Next: review
            </button>
          )}
          {phoneStep === 3 && (
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setPhoneStep(2)} className="hh-inv-btn-outline">
                Back
              </button>
              <button
                type="button"
                disabled={resolvedReviewItems.length === 0 || !targetWarehouseId}
                onClick={handleConfirmAndPost}
                className="hh-inv-btn-accent"
              >
                Save purchase
              </button>
            </div>
          )}
        </div>

        {showPhoneCatalogSheet && (
          <div className="rt-bsheet-scrim" onClick={() => setShowPhoneCatalogSheet(false)}>
            <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
              <div className="hh-grab" />
              <h3 className="text-[17px] font-extrabold text-slate-900">Select catalog beverage</h3>
              <div className="rt-search-bar">
                <Search size={16} className="text-slate-400 shrink-0" />
                <input
                  type="search"
                  value={phoneCatalogSearch}
                  onChange={(e) => setPhoneCatalogSearch(e.target.value)}
                  placeholder="Search catalog"
                />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-[45vh] overflow-y-auto">
                {products
                  .filter((p) => !phoneCatalogSearch.trim() || p.name.toLowerCase().includes(phoneCatalogSearch.toLowerCase()))
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPhoneNewProductMode(false);
                        handleSelectExisting(p.id);
                        setShowPhoneCatalogSheet(false);
                      }}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PackIcon size="sm" pack={p.pack} name={p.name} />
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-bold text-slate-900 truncate">{p.name}</div>
                          <div className="text-[11px] text-slate-500">{p.unitsPerCrate || 24} pcs / case</div>
                        </div>
                      </div>
                      <span className="text-[12.5px] font-bold text-[#2864d9] shrink-0">Select</span>
                    </button>
                  ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPhoneNewProductMode(true);
                  setDraftLine((p) => ({ ...p, isNewProduct: true, selectedProductId: undefined, productName: '' }));
                  setShowPhoneCatalogSheet(false);
                }}
                className="hh-inv-btn-outline w-full"
              >
                Create as new product
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Inward consignment" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#faf8f5] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col my-0 sm:my-6 max-h-[94vh] overflow-hidden border border-black/5">
        {/* Modal Header — matches Purchases / New purchase UI */}
        <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 border-b border-black/5 bg-[#faf8f5] sticky top-0 z-10">
          <div className="min-w-0 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="size-9 rounded-full hover:bg-black/5 flex items-center justify-center cursor-pointer text-slate-600 shrink-0"
              aria-label="Back"
            >
              <X size={18} className="sm:hidden" />
              <span className="hidden sm:inline text-lg leading-none">←</span>
            </button>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 leading-tight truncate">
                {initialGrnToEdit
                  ? `Edit purchase (${initialGrnToEdit.grnNumber})`
                  : 'New purchase'}
              </h2>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5 leading-tight truncate">
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
                  list="inward-known-suppliers"
                  value={supplierName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSupplierName(val);
                    applySupplierAutofill(val);
                  }}
                  onBlur={(e) => applySupplierAutofill(e.target.value)}
                  placeholder="Supplier / Party name…"
                  className={fieldCls}
                />
                <datalist id="inward-known-suppliers">
                  {knownSuppliers.map((s) => (
                    <option key={s.name} value={s.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>Supplier Phone</label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className={`${fieldCls} font-mono ${phoneError ? 'border-rose-300' : ''}`}
                />
                {phoneError && (
                  <p className="text-[11px] text-rose-600 font-medium mt-1">{phoneError}</p>
                )}
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
                  placeholder="Optional (leave blank for Non-GST)"
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
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() => setShowProviderFields((prev) => !prev)}
                  className="text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                >
                  {showProviderFields ? 'Hide address & POS' : '+ More details (address, email, POS)'}
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

            {/* Manual Freight & Labour Inward Costs */}
            <div className="pt-3 border-t border-black/5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={labelCls + ' mb-0'}>
                  Manual Handling / Landing Costs (Auto-added to Landed Price)
                </span>
                <div className="flex items-center gap-3 text-xs tabular-nums">
                  {totalInwardCost > 0 && (
                    <span className="font-semibold text-emerald-700">
                      Total: ₹{money(totalInwardCost)}
                      {reviewCasesTotal > 0 ? ` (+₹${money(reviewInwardCostPerCrate)}/case)` : ''}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowMoreInwardCosts((v) => !v)}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    {showMoreInwardCosts ? 'Hide other' : '+ Transport/Other'}
                  </button>
                </div>
              </div>
              <div className={`grid grid-cols-1 ${showMoreInwardCosts ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3`}>
                <div>
                  <label className={labelCls}>Freight (₹ total bill)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={freightCost || ''}
                    onChange={(e) => setFreightCost(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                    className={`${fieldCls} tabular-nums font-mono`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Labour (₹ total bill)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={labourCost || ''}
                    onChange={(e) => setLabourCost(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                    className={`${fieldCls} tabular-nums font-mono`}
                  />
                </div>
                {showMoreInwardCosts && (
                  <div>
                    <label className={labelCls}>Transport / Other (₹)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={otherInwardCost || ''}
                      onChange={(e) => setOtherInwardCost(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="0"
                      className={`${fieldCls} tabular-nums font-mono`}
                    />
                  </div>
                )}
              </div>
            </div>
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

            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
                <button
                  type="button"
                  onClick={() =>
                    setDraftLine((prev) => {
                      const catDef = CATS[prev.category] || { hsn: '22021090', gst: 0.4 };
                      const half = Math.round((catDef.gst * 100) / 2 * 10) / 10;
                      return {
                        ...prev,
                        taxability: 'taxable',
                        hsn: prev.hsn || catDef.hsn,
                        cgstPercent: prev.cgstPercent === 0 && prev.sgstPercent === 0 ? half : prev.cgstPercent,
                        sgstPercent: prev.cgstPercent === 0 && prev.sgstPercent === 0 ? half : prev.sgstPercent,
                      };
                    })
                  }
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    draftLine.taxability !== 'non_gst'
                      ? 'bg-[var(--primary)] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  GST Product
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraftLine((prev) => ({
                      ...prev,
                      taxability: 'non_gst',
                      isGstIncluded: false,
                      cgstPercent: 0,
                      sgstPercent: 0,
                    }))
                  }
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    draftLine.taxability === 'non_gst'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Non-GST (0% Tax)
                </button>
              </div>
              {draftLine.taxability !== 'non_gst' ? (
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftLine.isGstIncluded}
                    onChange={(e) => setDraftLine((p) => ({ ...p, isGstIncluded: e.target.checked }))}
                    className="rounded border-slate-300 accent-[var(--primary)]"
                  />
                  Entered rate includes GST
                </label>
              ) : (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                  Bought &amp; sold without GST · Excluded from GST reports
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <div>
                <label style={labelStyle}>
                  {draftLine.taxability === 'non_gst' ? 'HSN (Optional)' : 'HSN Code'}
                </label>
                <input
                  value={draftLine.hsn}
                  onChange={(e) => setDraftLine((prev) => ({ ...prev, hsn: e.target.value }))}
                  placeholder={draftLine.taxability === 'non_gst' ? 'Optional' : '22021090'}
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
                <label style={labelStyle}>
                  {draftLine.taxability === 'non_gst'
                    ? 'Unit Price (₹/Case)'
                    : draftLine.isGstIncluded
                      ? 'Rate incl. GST (₹/Case)'
                      : 'Rate ex-GST (₹/Case)'}
                </label>
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
                <label style={labelStyle}>Units / Case</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={draftLine.unitsPerCrate}
                  onChange={(e) =>
                    setDraftLine((prev) => ({ ...prev, unitsPerCrate: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className="w-full border-2 px-3 py-1.5 text-sm font-mono"
                  style={{ borderColor: palette.line }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
              <div>
                <label style={labelStyle}>Batch / Lot No.</label>
                <input
                  value={draftLine.batchNumber}
                  onChange={(e) => setDraftLine((prev) => ({ ...prev, batchNumber: e.target.value }))}
                  placeholder="Auto-generated if blank"
                  className="w-full border-2 px-3 py-1.5 text-sm font-mono"
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
              <div className="p-2 bg-white border border-emerald-500/40 rounded flex items-center justify-between text-xs mt-2 flex-wrap gap-1.5">
                <span className="text-slate-700">
                  Physical Stock entering Godown:{' '}
                  <strong className="text-emerald-800 text-sm font-mono">{metrics.totalReceivedQty} crates</strong>
                  <span className="text-[11px] text-slate-500 ml-1">
                    ({metrics.paidQty} paid + {metrics.freeQty} free)
                  </span>
                </span>
                <span className="font-bold text-sky-700 font-mono text-xs tabular-nums">
                  Auto Landed: ₹{money(metrics.landedCostPerCrate)}/cs · ₹{money(metrics.landedCostPerBottle)}/unit
                  {draftPreviewInwardPerCrate > 0 && (
                    <span className="text-[10px] font-medium text-emerald-700 ml-1">
                      (incl. +₹{money(draftPreviewInwardPerCrate)}/cs handling)
                    </span>
                  )}
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

              <div className="mt-2 pt-2 border-t flex items-center justify-between font-medium flex-wrap gap-2">
                <span>
                  Landed Price:{' '}
                  <strong className="tabular-nums">
                    ₹{money(metrics.landedCostPerCrate)}/case · ₹{money(metrics.landedCostPerBottle)}/unit
                  </strong>
                </span>
                <span>
                  Tax Rate:{' '}
                  <strong>
                    {draftLine.taxability === 'non_gst'
                      ? '0% (Non-GST)'
                      : `${draftLine.cgstPercent + draftLine.sgstPercent}%`}
                  </strong>
                </span>
                <span className="font-bold text-green-700 tabular-nums">
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
                <table className="w-full min-w-[780px] text-left data-table text-xs">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="p-2 whitespace-nowrap">SKU</th>
                      <th className="p-2 min-w-[150px]">Description</th>
                      <th className="p-2 text-right whitespace-nowrap">Billed</th>
                      <th className="p-2 text-right whitespace-nowrap">Free</th>
                      <th className="p-2 text-right whitespace-nowrap">Paid</th>
                      <th className="p-2 text-right whitespace-nowrap">Inward Qty</th>
                      <th className="p-2 text-right whitespace-nowrap">Landed Cost</th>
                      <th className="p-2 text-right whitespace-nowrap">Tax</th>
                      <th className="p-2 text-right whitespace-nowrap">Total</th>
                      <th className="p-2 text-center whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedReviewItems.map((it, idx) => (
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{it.productName}</span>
                            {it.taxability === 'non_gst' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Non-GST
                              </span>
                            )}
                          </div>
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
                        <td className="p-2 text-right font-mono tabular-nums">
                          <div>₹{money(it.landedCostPerCrate || it.landedCostPerUnit || it.unitPrice)}/cs</div>
                          {Number(it.landedCostPerUnit) > 0 && Number(it.landedCostPerCrate) > Number(it.landedCostPerUnit) && (
                            <div className="text-[10px] text-slate-500">₹{money(it.landedCostPerUnit)}/u</div>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums">
                          {it.taxability === 'non_gst' ? 'Non-GST' : `₹${money((it.cgstAmount || 0) + (it.sgstAmount || 0))}`}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-green-700 tabular-nums">
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

            {resolvedReviewItems.length > 0 && (
              <div className="mt-3 p-4 rounded-2xl bg-white border border-black/5 shadow-sm space-y-1.5">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Taxable</span>
                  <span className="font-semibold tabular-nums text-slate-800">₹{money(totals.taxable)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-500">
                  <span>GST</span>
                  <span className="font-semibold tabular-nums">₹{money(totals.cgst + totals.sgst)}</span>
                </div>
                {totalInwardCost > 0 && (
                  <div className="flex justify-between text-sm text-emerald-700">
                    <span>Freight &amp; Labour (allocated to landed cost)</span>
                    <span className="font-semibold tabular-nums">₹{money(totalInwardCost)}</span>
                  </div>
                )}
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
            {resolvedReviewItems.length > 0 && (
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
                    inwardCosts: totalInwardCost > 0 ? {
                      transport: 0,
                      freight: Math.max(0, Number(freightCost) || 0),
                      loadingLabour: Math.max(0, Number(labourCost) || 0),
                      unloadingLabour: 0,
                      otherInwardCosts: Math.max(0, Number(otherInwardCost) || 0),
                      totalInwardCost,
                      inwardCostPerCrate: Math.round(reviewInwardCostPerCrate * 100) / 100,
                    } : undefined,
                    totalInwardCost,
                    inwardCostPerCrate: Math.round(reviewInwardCostPerCrate * 100) / 100,
                    items: resolvedReviewItems,
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
