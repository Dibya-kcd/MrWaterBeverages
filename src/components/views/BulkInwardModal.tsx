import React, { useState, useRef, useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  Boxes,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Gift,
  HelpCircle,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Layers,
  Maximize2,
  Minimize2,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Table,
  Tag,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { CATS } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { CategoryKey, GrnLineItem, GrnSchemeMode, GrnSchemeType, Product } from '../../types';
import {
  calculateLandedCostBreakdown,
  generateAutoSku,
  generateBatchNumber,
  money,
} from '../../utils/billing';
import {
  ParsedInvoiceData,
  ParsedInvoiceItem,
  parseSpreadsheetInvoice,
  recognizeInvoiceWithAi,
  matchProductCatalog,
  detectCategory,
} from '../../utils/invoiceParser';
import {
  downloadImportTemplate,
  downloadImportTemplateXlsx,
} from '../../utils/importExport';
import { InwardProductCard } from '../inward/InwardProductCard';

interface BulkInwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (grnNumber: string, count: number) => void;
}

interface EditableInwardRow {
  id: string;
  rawName: string;
  productName: string;
  category: CategoryKey;
  pack: string;
  volume: number;
  packSize?: string;
  unitsPerCrate?: number;
  hsn: string;
  qty: number;
  freeQty: number;
  paidQty?: number;
  unitPrice: number;

  // Scheme & Discount
  schemeType: GrnSchemeType;
  schemeMode?: GrnSchemeMode;
  schemeBuyQty?: number;
  schemeFreeQty?: number;
  discountPercent: number;
  discountFlat: number;
  discountAmount: number;
  schemeText: string;

  // Taxes
  cgstPercent: number;
  sgstPercent: number;

  // Pricing & Batches
  wholesaleRate: number;
  retailRate: number;
  batchNumber: string;
  expiry: string;
  mfgDate: string;

  // Catalog Matching
  isNewProduct: boolean;
  matchedProductId?: number;
  matchedProductName?: string;
  existingStock?: number;
}

export const BulkInwardModal: React.FC<BulkInwardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { products, warehouses, defaultWarehouse, postGrn, palette, fz, scale } = useLedger();

  // Wizard Step: 'upload' | 'review'
  const [step, setStep] = useState<'upload' | 'review'>('upload');

  // Invoice Header Information
  const [supplierName, setSupplierName] = useState('RADHIKA ENTERPRISES');
  const [supplierGstin, setSupplierGstin] = useState('21FSDPR8480R1ZU');
  const [supplierAddress, setSupplierAddress] = useState('Main Road, Near Bus Stand, Kuchinda, Sambalpur, Odisha - 768222');
  const [supplierPhone, setSupplierPhone] = useState('+91 94370 84801');
  const [supplierEmail, setSupplierEmail] = useState('radhika.beverages@gmail.com');
  const [invoiceNo, setInvoiceNo] = useState(`INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [inwardDate, setInwardDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicleNo, setVehicleNo] = useState('OD15AF7869');
  const [placeOfSupply, setPlaceOfSupply] = useState('Odisha (21)');
  const [billedTo, setBilledTo] = useState('NEW BIJAYA PUSTAK BHANDRA');
  const [shippedTo, setShippedTo] = useState('SAHAJBAHAL GODOWN / KUCHINDA DEPOT');
  const [showProviderDetails, setShowProviderDetails] = useState(false);
  const [targetWarehouseId, setTargetWarehouseId] = useState(
    defaultWarehouse?.id || warehouses[0]?.id || 'wh-kuchinda'
  );
  const [overallDiscount, setOverallDiscount] = useState<number>(0);
  const [originalInvoiceTotal, setOriginalInvoiceTotal] = useState<number | null>(null);
  const [printedTotalCases, setPrintedTotalCases] = useState<number | null>(null);

  // Inward-to-Godown Direct Costs (Transport, Freight, Labour, Other)
  const [transportCost, setTransportCost] = useState<number>(1200);
  const [freightCost, setFreightCost] = useState<number>(0);
  const [loadingLabourCost, setLoadingLabourCost] = useState<number>(300);
  const [unloadingLabourCost, setUnloadingLabourCost] = useState<number>(300);
  const [otherInwardCost, setOtherInwardCost] = useState<number>(0);
  const [showInwardCostDetails, setShowInwardCostDetails] = useState<boolean>(true);

  // Parsing & File State
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsingStatus, setParsingStatus] = useState<string>('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'excel' | 'csv' | 'pdf' | 'image' | 'preset' | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  const [isErrorTemporary, setIsErrorTemporary] = useState(false);
  const [detectedSource, setDetectedSource] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Layout & Sizing State
  const [isMaximized, setIsMaximized] = useState(true);
  const [isUpperDetailsExpanded, setIsUpperDetailsExpanded] = useState(false);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('compact');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [isMobileInvoiceOpen, setIsMobileInvoiceOpen] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);

  // Auto-detect screen size: use Card view on mobile/small screens, Table view on wide screens
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth >= 1200) {
        setViewMode('table');
      } else {
        setViewMode('cards');
      }
    }
  }, []);

  // Check Gemini API Key status from server
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setHasGeminiKey(!!data.hasGeminiKey);
      })
      .catch(() => {
        setHasGeminiKey(false);
      });
  }, []);

  // Editable Review Rows
  const [rows, setRows] = useState<EditableInwardRow[]>([]);

  // Bulk Apply Drawer / Dialog state
  const [showBulkSchemeModal, setShowBulkSchemeModal] = useState(false);
  const [bulkSchemeType, setBulkSchemeType] = useState<GrnSchemeType>('discount_percent');
  const [bulkSchemeValue, setBulkSchemeValue] = useState<number>(5);
  const [bulkSchemeName, setBulkSchemeName] = useState<string>('Dealer Scheme');

  const [bulkExpiryDate, setBulkExpiryDate] = useState<string>('2027-03-31');

  // Filter in review table
  const [searchQuery, setSearchQuery] = useState('');
  const [filterNewOnly, setFilterNewOnly] = useState(false);
  const [filterSchemeOnly, setFilterSchemeOnly] = useState(false);

  if (!isOpen) return null;

  // Convert ParsedInvoiceData into editable rows
  const loadInvoiceDataIntoReview = (data: ParsedInvoiceData, sourceName: string) => {
    setSupplierName(data.supplierName || 'RADHIKA ENTERPRISES');
    setSupplierGstin(data.supplierGstin || '21FSDPR8480R1ZU');
    setSupplierAddress(data.supplierAddress || 'Main Road, Near Bus Stand, Kuchinda, Sambalpur, Odisha - 768222');
    setSupplierPhone(data.supplierPhone || '+91 94370 84801');
    setSupplierEmail(data.supplierEmail || 'radhika.beverages@gmail.com');
    setInvoiceNo(data.invoiceNo || `INV-${new Date().getFullYear()}-001`);
    setInwardDate(data.invoiceDate || new Date().toISOString().slice(0, 10));
    setVehicleNo(data.vehicleNo || 'OD15AF7869');
    setPlaceOfSupply(data.placeOfSupply || 'Odisha (21)');
    setBilledTo(data.billedTo || 'NEW BIJAYA PUSTAK BHANDRA');
    setShippedTo(data.shippedTo || 'SAHAJBAHAL GODOWN / KUCHINDA DEPOT');
    setOverallDiscount(data.overallDiscount || 0);
    setOriginalInvoiceTotal(data.grandTotal || null);
    setPrintedTotalCases(
      data.totalCases && data.totalCases > 0
        ? data.totalCases
        : data.items.reduce((s, it) => s + (Number(it.qty) || 0), 0)
    );
    setDetectedSource(data.detectedSource);
    setFileName(sourceName);

    const mappedRows: EditableInwardRow[] = data.items.map((item, idx) => {
      // Re-verify against live catalog to be 100% accurate
      const { isNewProduct, matchedProduct } = matchProductCatalog(item.rawName, products);

      const qty = Math.max(1, item.qty || 1);
      const unitPrice = Math.max(0, item.unitPrice || 158.57);
      const volume = matchedProduct?.volume || item.volume || 150;
      const pack = matchedProduct?.pack || item.pack || 'PET';
      const unitsPerCrate = item.unitsPerCrate || (volume <= 200 ? 30 : 24);
      const packSize = item.packSize || `${volume}ml ${pack}`;

      let schemeType: GrnSchemeType = item.schemeType || 'none';
      const schemeMode: GrnSchemeMode = 'inclusive';
      let schemeBuyQty = item.schemeBuyQty ?? (schemeType === 'b2g1' ? 2 : undefined);
      let schemeFreeQty = item.schemeFreeQty ?? (schemeType === 'b2g1' ? 1 : undefined);
      const freeQty = item.freeQty !== undefined ? Math.max(0, item.freeQty) : undefined;

      // Auto compute free quantity if scheme is Buy X Get Y
      if (schemeType === 'b2g1') {
        schemeBuyQty = schemeBuyQty || 2;
        schemeFreeQty = schemeFreeQty || 1;
      } else if (freeQty !== undefined && freeQty > 0 && schemeType === 'none') {
        schemeType = 'free_cases';
      } else if (item.discountPercent > 0 && schemeType === 'none') {
        schemeType = 'discount_percent';
      }

      const breakdown = calculateLandedCostBreakdown({
        qty,
        unitPrice,
        unitsPerCrate,
        pack,
        volume,
        packSize,
        cgstPercent: item.cgstPercent ?? 20,
        sgstPercent: item.sgstPercent ?? 20,
        schemeType,
        schemeMode,
        schemeBuyQty,
        schemeFreeQty,
        freeQty,
        discountPercent: item.discountPercent || 0,
        discountFlat: item.discountFlat || 0,
        discountAmount: item.discountAmount || 0,
      });

      return {
        id: `row_${Date.now()}_${idx}`,
        rawName: item.rawName,
        productName: matchedProduct ? matchedProduct.name : item.productName || item.rawName,
        category: matchedProduct?.category || item.category || detectCategory(item.rawName),
        pack,
        volume,
        packSize,
        unitsPerCrate,
        hsn: matchedProduct?.hsn || item.hsn || '22021090',
        qty,
        freeQty: breakdown.freeQty,
        paidQty: breakdown.paidQty,
        unitPrice,
        schemeType,
        schemeMode,
        schemeBuyQty,
        schemeFreeQty,
        discountPercent: item.discountPercent || 0,
        discountFlat: item.discountFlat || 0,
        discountAmount: breakdown.discountAmount,
        schemeText:
          item.schemeDescription ||
          breakdown.schemeLabel,
        cgstPercent: item.cgstPercent ?? 20,
        sgstPercent: item.sgstPercent ?? 20,
        wholesaleRate: matchedProduct?.wholesale || Math.round(breakdown.effectiveCostPerCrateInclGst * 1.15) || Math.round(unitPrice * 1.15),
        retailRate: matchedProduct?.retail || Math.round(breakdown.effectiveCostPerCrateInclGst * 1.25) || Math.round(unitPrice * 1.25),
        batchNumber: matchedProduct?.batchNumber || item.batchNumber || generateBatchNumber(item.rawName),
        expiry: matchedProduct?.expiry || item.expiryDate || '2027-03-31',
        mfgDate: item.mfgDate || new Date().toISOString().slice(0, 10),
        isNewProduct,
        matchedProductId: matchedProduct?.id,
        matchedProductName: matchedProduct?.name,
        existingStock: matchedProduct?.opening,
      };
    });

    setRows(mappedRows);
    setStep('review');
  };

  // Process uploaded files (Excel, CSV, PDF, Image)
  const processUploadedFile = async (file: File) => {
    setParseError(null);
    setIsErrorTemporary(false);
    setLastUploadedFile(file);
    setIsParsing(true);
    setFileName(file.name);
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    try {
      if (['xlsx', 'xls', 'csv'].includes(extension)) {
        setFileType(extension === 'csv' ? 'csv' : 'excel');
        setParsingStatus('Parsing spreadsheet tables, column headers, and beverage rows...');
        const parsed = await parseSpreadsheetInvoice(file, products);
        loadInvoiceDataIntoReview(parsed, file.name);
      } else if (['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
        setFileType(extension === 'pdf' ? 'pdf' : 'image');
        setParsingStatus(
          `Extracting details with AI OCR (${extension.toUpperCase()}). Analyzing items, quantities, taxes, schemes...`
        );
        try {
          const parsed = await recognizeInvoiceWithAi(file, products);
          loadInvoiceDataIntoReview(parsed, file.name);
        } catch (aiErr: any) {
          console.error('AI recognition failed:', aiErr);
          const isTemp =
            aiErr.isTemporary ||
            aiErr.status === 503 ||
            /high demand|unavailable|temporar/i.test(aiErr.message || '');
          setIsErrorTemporary(isTemp);
          throw new Error(
            isTemp
              ? 'Google Gemini is currently experiencing temporary high traffic across AI models (503). You can click "Retry AI Vision", or proceed directly into the review table to adjust line quantities manually.'
              : `AI Vision recognition error: ${aiErr.message || 'Unable to recognize document'}. Please upload using our updated Excel/CSV template or proceed with manual entry.`
          );
        }
      } else {
        throw new Error('Unsupported format. Please upload an Excel (.xlsx, .xls), CSV (.csv), PDF (.pdf), or Image (.jpg, .png).');
      }
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse invoice.');
    } finally {
      setIsParsing(false);
      setParsingStatus('');
    }
  };

  // Row update handlers
  const updateRowField = (id: string, field: keyof EditableInwardRow, val: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: val };

        // Auto-recalculate line financial values
        const qty = Math.max(1, Number(field === 'qty' ? val : updated.qty) || 1);
        const unitPrice = Math.max(0, Number(field === 'unitPrice' ? val : updated.unitPrice) || 0);
        const cgstPercent = Number(field === 'cgstPercent' ? val : updated.cgstPercent) || 0;
        const sgstPercent = Number(field === 'sgstPercent' ? val : updated.sgstPercent) || 0;
        const schemeType = (field === 'schemeType' ? val : updated.schemeType) as GrnSchemeType;
        // Hard-locked to inclusive: Supplier invoice quantity includes free crates
        const schemeMode: GrnSchemeMode = 'inclusive';

        let schemeBuyQty = Number(field === 'schemeBuyQty' ? val : updated.schemeBuyQty) || 2;
        let schemeFreeQty = Number(field === 'schemeFreeQty' ? val : updated.schemeFreeQty) || 1;

        if (field === 'schemeType') {
          if (val === 'b2g1') {
            schemeBuyQty = 2;
            schemeFreeQty = 1;
            updated.schemeBuyQty = 2;
            updated.schemeFreeQty = 1;
            updated.discountPercent = 0;
            updated.discountFlat = 0;
          } else if (val === 'none') {
            updated.freeQty = 0;
            updated.schemeBuyQty = undefined;
            updated.schemeFreeQty = undefined;
            updated.schemeText = '';
            updated.discountPercent = 0;
            updated.discountFlat = 0;
          } else if (val === 'free_cases') {
            updated.discountPercent = 0;
            updated.discountFlat = 0;
          }
        }

        const b = calculateLandedCostBreakdown({
          qty,
          unitPrice,
          unitsPerCrate: updated.unitsPerCrate || 24,
          pack: updated.pack,
          volume: updated.volume,
          packSize: updated.packSize,
          cgstPercent,
          sgstPercent,
          schemeType,
          schemeMode,
          schemeBuyQty,
          schemeFreeQty,
          freeQty: field === 'freeQty' ? Number(val) : (field === 'schemeType' && val === 'none' ? 0 : undefined),
          paidQty: field === 'paidQty' ? Number(val) : undefined,
          discountPercent: Number(field === 'discountPercent' ? val : updated.discountPercent) || 0,
          discountFlat: Number(field === 'discountFlat' ? val : updated.discountFlat) || 0,
          discountAmount: field === 'discountAmount' ? Number(val) : undefined,
        });

        updated.qty = qty;
        updated.unitPrice = unitPrice;
        updated.schemeType = schemeType;
        updated.schemeMode = schemeMode;
        updated.freeQty = b.freeQty;
        updated.paidQty = b.paidQty;
        updated.discountAmount = b.discountAmount;
        updated.schemeText = b.schemeLabel;

        const landedCost = b.effectiveCostPerCrateInclGst;

        // Auto suggest selling rates if not manually overridden
        if (
          field === 'unitPrice' ||
          field === 'qty' ||
          field === 'freeQty' ||
          field === 'discountPercent' ||
          field === 'discountFlat' ||
          field === 'schemeType' ||
          field === 'schemeMode' ||
          field === 'schemeBuyQty' ||
          field === 'schemeFreeQty'
        ) {
          if (!updated.wholesaleRate || updated.wholesaleRate < landedCost) {
            updated.wholesaleRate = Math.round(landedCost * 1.15);
          }
          if (!updated.retailRate || updated.retailRate < updated.wholesaleRate) {
            updated.retailRate = Math.round(landedCost * 1.25);
          }
        }

        return updated;
      })
    );
  };

  // Toggle or change product catalog mapping
  const handleCatalogMappingChange = (rowId: string, targetValue: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (targetValue === 'new_product') {
          return {
            ...r,
            isNewProduct: true,
            matchedProductId: undefined,
            matchedProductName: undefined,
            existingStock: undefined,
          };
        }

        const prodId = parseInt(targetValue, 10);
        const matched = products.find((p) => p.id === prodId);
        if (matched) {
          return {
            ...r,
            isNewProduct: false,
            matchedProductId: matched.id,
            matchedProductName: matched.name,
            existingStock: matched.opening,
            category: matched.category,
            pack: matched.pack,
            volume: matched.volume,
            hsn: matched.hsn || r.hsn,
            wholesaleRate: matched.wholesale || r.wholesaleRate,
            retailRate: matched.retail || r.retailRate,
          };
        }
        return r;
      })
    );
  };

  // Delete row
  const handleDeleteRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  // Duplicate an existing row
  const handleDuplicateRow = (rowId: string) => {
    const target = rows.find((r) => r.id === rowId);
    if (!target) return;
    const duplicated: EditableInwardRow = {
      ...target,
      id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      batchNumber: generateBatchNumber(target.productName),
    };
    const targetIndex = rows.findIndex((r) => r.id === rowId);
    const updated = [...rows];
    updated.splice(targetIndex + 1, 0, duplicated);
    setRows(updated);
  };

  // Start with manual blank consignment
  const handleStartBlankConsignment = () => {
    setFileName('Manual Inward Entry');
    setDetectedSource('manual');
    const firstProd = products[0];
    const unitPrice = 158.57;

    setRows([
      {
        id: `manual_row_${Date.now()}`,
        rawName: firstProd ? firstProd.name : 'CAMPA POWER UP 150ML PET',
        productName: firstProd ? firstProd.name : 'Campa Power Up 150ml PET',
        category: firstProd?.category || 'energy',
        pack: firstProd?.pack || 'PET',
        volume: firstProd?.volume || 150,
        hsn: firstProd?.hsn || '22021090',
        qty: 50,
        freeQty: 0,
        unitPrice,
        schemeType: 'none',
        discountPercent: 0,
        discountFlat: 0,
        discountAmount: 0,
        schemeText: '',
        cgstPercent: 20,
        sgstPercent: 20,
        wholesaleRate: firstProd?.wholesale || 180,
        retailRate: firstProd?.retail || 200,
        batchNumber: generateBatchNumber('LOT'),
        expiry: '2027-03-31',
        mfgDate: new Date().toISOString().slice(0, 10),
        isNewProduct: !firstProd,
        matchedProductId: firstProd?.id,
        matchedProductName: firstProd?.name,
        existingStock: firstProd?.opening,
      },
    ]);
    setStep('review');
  };

  // Add new empty row
  const handleAddNewRow = () => {
    const newId = `manual_row_${Date.now()}`;
    const newRow: EditableInwardRow = {
      id: newId,
      rawName: 'NEW BEVERAGE 150ML PET',
      productName: 'New Beverage 150ml PET',
      category: 'energy',
      pack: 'PET',
      volume: 150,
      hsn: '22021090',
      qty: 50,
      freeQty: 0,
      unitPrice: 158.57,
      schemeType: 'none',
      discountPercent: 0,
      discountFlat: 0,
      discountAmount: 0,
      schemeText: '',
      cgstPercent: 20,
      sgstPercent: 20,
      wholesaleRate: 180,
      retailRate: 200,
      batchNumber: generateBatchNumber('NEW'),
      expiry: '2027-03-31',
      mfgDate: new Date().toISOString().slice(0, 10),
      isNewProduct: true,
    };
    setRows((prev) => [...prev, newRow]);
  };

  // Apply Bulk Scheme to All Rows
  const handleApplyBulkScheme = () => {
    setRows((prev) =>
      prev.map((r) => {
        let discountPercent = r.discountPercent;
        let discountFlat = r.discountFlat;
        let freeQty = r.freeQty;

        if (bulkSchemeType === 'discount_percent') {
          discountPercent = bulkSchemeValue;
        } else if (bulkSchemeType === 'discount_flat') {
          discountFlat = bulkSchemeValue;
        } else if (bulkSchemeType === 'free_cases') {
          // e.g. 1 free for every 10 cases
          freeQty = Math.floor(r.qty / 10) * Math.max(1, bulkSchemeValue);
        }

        const qty = r.qty;
        const unitPrice = r.unitPrice;
        let discountAmount = 0;
        if (bulkSchemeType === 'discount_percent') {
          discountAmount = (qty * unitPrice * discountPercent) / 100;
        } else if (bulkSchemeType === 'discount_flat') {
          discountAmount = qty * discountFlat;
        }

        return {
          ...r,
          schemeType: bulkSchemeType,
          discountPercent,
          discountFlat,
          freeQty,
          discountAmount,
          schemeText: bulkSchemeName,
        };
      })
    );
    setShowBulkSchemeModal(false);
  };

  // Apply Bulk Expiry Date
  const handleApplyBulkExpiry = () => {
    if (!bulkExpiryDate) return;
    setRows((prev) => prev.map((r) => ({ ...r, expiry: bulkExpiryDate })));
  };

  // Live Summary Calculations
  const totalBilledQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalFreeQty = rows.reduce((s, r) => s + (Number(r.freeQty) || 0), 0);
  // Hard-locked: In FMCG beverage distribution, the invoiced crate count is strictly
  // the total physical crates received (inclusive of free scheme crates).
  const totalReceivedQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalPaidQty = rows.reduce(
    (s, r) => s + Math.max(0, (Number(r.qty) || 0) - (Number(r.freeQty) || 0)),
    0
  );

  // Total Cases Mismatch Detection: Working table vs Invoice printed cases
  const hasCasesMismatch =
    printedTotalCases !== null && printedTotalCases > 0 && totalReceivedQty !== printedTotalCases;
  const casesDiff = printedTotalCases !== null ? totalReceivedQty - printedTotalCases : 0;

  // Inward Direct Costs Calculation
  const totalInwardCost =
    (Number(transportCost) || 0) +
    (Number(freightCost) || 0) +
    (Number(loadingLabourCost) || 0) +
    (Number(unloadingLabourCost) || 0) +
    (Number(otherInwardCost) || 0);
  const inwardCostPerCrate = totalReceivedQty > 0 ? totalInwardCost / totalReceivedQty : 0;

  const totalGross = rows.reduce((s, r) => s + r.qty * r.unitPrice, 0);
  const totalItemDiscounts = rows.reduce((s, r) => s + r.discountAmount, 0);
  const totalTaxable = Math.max(0, totalGross - totalItemDiscounts);

  const totalCgst = rows.reduce((s, r) => {
    const gross = r.qty * r.unitPrice;
    const taxb = Math.max(0, gross - r.discountAmount);
    return s + (taxb * r.cgstPercent) / 100;
  }, 0);

  const totalSgst = rows.reduce((s, r) => {
    const gross = r.qty * r.unitPrice;
    const taxb = Math.max(0, gross - r.discountAmount);
    return s + (taxb * r.sgstPercent) / 100;
  }, 0);

  const totalTax = totalCgst + totalSgst;
  const calculatedGrandTotal = Math.max(0, totalTaxable + totalTax - overallDiscount);
  // Total Landed Inventory Valuation = Total Invoice + Total Inward-to-Godown Direct Costs
  const totalLandedInventoryValue = calculatedGrandTotal + totalInwardCost;

  const newProductsCount = rows.filter((r) => r.isNewProduct).length;
  const existingProductsCount = rows.filter((r) => !r.isNewProduct).length;

  // Confirm and commit inward consignment
  const handleConfirmAndPostGrn = () => {
    if (rows.length === 0) {
      setParseError('Please ensure there is at least 1 product line to inward.');
      return;
    }

    // Confirmation prompt before posting if a total cases mismatch exists
    if (hasCasesMismatch) {
      const proceed = window.confirm(
        `⚠️ TOTAL CASES MISMATCH WARNING!\n\n` +
        `• Working Table Total: ${totalReceivedQty.toLocaleString()} crates\n` +
        `• Invoice Printed Total: ${printedTotalCases?.toLocaleString()} crates\n` +
        `• Discrepancy: ${casesDiff > 0 ? `+${casesDiff}` : casesDiff} crates\n\n` +
        `In FMCG distribution, invoice printed cases is always the physical total received (inclusive of free scheme crates).\n\n` +
        `Posting this will save ${totalReceivedQty.toLocaleString()} crates to godown inventory.\n\n` +
        `Are you sure you want to proceed and save this consignment?`
      );
      if (!proceed) {
        return;
      }
    }

    // Convert rows to GrnLineItem format using the unified landed cost engine
    const items: GrnLineItem[] = rows.map((r, idx) => {
      const unitsPerCrate = r.unitsPerCrate || (r.volume <= 200 ? 30 : 24);
      const breakdown = calculateLandedCostBreakdown({
        qty: r.qty,
        unitPrice: r.unitPrice,
        unitsPerCrate,
        pack: r.pack,
        volume: r.volume,
        packSize: r.packSize,
        cgstPercent: r.cgstPercent,
        sgstPercent: r.sgstPercent,
        schemeType: r.schemeType,
        schemeMode: r.schemeMode || 'inclusive',
        schemeBuyQty: r.schemeBuyQty,
        schemeFreeQty: r.schemeFreeQty,
        freeQty: r.freeQty,
        paidQty: r.paidQty,
        discountPercent: r.discountPercent,
        discountFlat: r.discountFlat,
        discountAmount: r.discountAmount,
        inwardCostPerCrate,
      });

      return {
        id: `grn_item_${Date.now()}_${idx}`,
        isNewProduct: r.isNewProduct,
        productId: r.isNewProduct ? undefined : r.matchedProductId,
        productName: r.productName,
        category: r.category,
        sku: generateAutoSku(r.productName, r.category, idx + 100),
        hsn: r.hsn,
        pack: r.pack,
        volume: r.volume,
        packSize: r.packSize || `${r.volume}ml ${r.pack}`,
        unitsPerCrate,
        qty: r.qty,
        unitPrice: r.unitPrice,
        schemeType: r.schemeType,
        schemeMode: r.schemeMode || 'inclusive',
        schemeBuyQty: r.schemeBuyQty,
        schemeFreeQty: r.schemeFreeQty,
        freeQty: breakdown.freeQty,
        paidQty: breakdown.paidQty,
        discountPercent: r.discountPercent,
        discountFlat: r.discountFlat,
        discountAmount: breakdown.discountAmount,
        schemeText:
          r.schemeText ||
          (r.schemeType === 'b2g1'
            ? `Buy ${r.schemeBuyQty || 2} Get ${r.schemeFreeQty || 1} Free`
            : r.freeQty > 0
            ? `+${r.freeQty} Free Crates`
            : ''),
        taxableAmount: breakdown.taxableAmount,
        cgstPercent: r.cgstPercent,
        sgstPercent: r.sgstPercent,
        cgstAmount: breakdown.cgstAmount,
        sgstAmount: breakdown.sgstAmount,
        taxAmount: breakdown.taxAmount,
        lineTotal: breakdown.lineTotal,
        totalReceivedQty: breakdown.totalReceivedQty,
        invoiceRateExGst: breakdown.invoiceRateExGst,
        invoiceRateInclGst: breakdown.invoiceRateInclGst,
        gstPercent: breakdown.gstPercent,
        gstAmountPerCrate: breakdown.gstAmountPerCrate,
        effectiveCostPerCrateExGst: breakdown.effectiveCostPerCrateExGst,
        effectiveCostPerCrateInclGst: breakdown.effectiveCostPerCrateInclGst,
        effectiveUnitRateExGst: breakdown.effectiveUnitRateExGst,
        effectiveUnitRateInclGst: breakdown.effectiveUnitRateInclGst,
        // Landed Cost Per Unit (Crate & Bottle) includes invoice line total + proportional inward godown cost
        landedCostPerCrate: breakdown.landedCostPerCrate,
        landedCostPerCrateExGst: breakdown.landedCostPerCrateExGst,
        landedCostPerUnit: breakdown.landedCostPerUnit,
        effectiveCostPerUnit: breakdown.effectiveUnitRateExGst,
        inwardCostPerCrate: breakdown.inwardCostPerCrate,
        finalLandedCostPerUnit: breakdown.landedCostPerUnit,
        expiry: r.expiry,
        mfgDate: r.mfgDate,
        batchNumber: r.batchNumber,
        wholesaleRate: r.wholesaleRate,
        retailRate: r.retailRate,
        notes: r.isNewProduct ? 'Auto-created new product line from inward bill' : undefined,
      };
    });

    const targetWhObj = warehouses.find((w) => w.id === targetWarehouseId);

    const createdGrn = postGrn({
      supplierName,
      supplierGstin,
      supplierAddress,
      supplierPhone,
      supplierEmail,
      invoiceNo,
      inwardDate,
      vehicleNo,
      placeOfSupply,
      billedTo,
      shippedTo,
      warehouseId: targetWarehouseId,
      warehouseName: targetWhObj?.name || 'Main Godown',
      items,
      totalBilledQty,
      totalFreeQty,
      totalPaidQty,
      totalReceivedQty,
      totalTaxable,
      totalCgst,
      totalSgst,
      totalTax,
      grandTotal: calculatedGrandTotal,
      inwardCosts: {
        transport: Number(transportCost) || 0,
        freight: Number(freightCost) || 0,
        loadingLabour: Number(loadingLabourCost) || 0,
        unloadingLabour: Number(unloadingLabourCost) || 0,
        otherInwardCosts: Number(otherInwardCost) || 0,
        totalInwardCost,
        inwardCostPerCrate,
      },
      totalInwardCost,
      inwardCostPerCrate,
      notes: `Inward parsed from ${fileName || 'Invoice'}. Provider: ${supplierName} (GSTIN: ${supplierGstin}). Vehicle: ${vehicleNo}. Overall Discount: ₹${money(overallDiscount)}. Direct Inward Godown Cost: ₹${money(totalInwardCost)} (+₹${money(inwardCostPerCrate)}/crate).`,
    });

    if (onSuccess) {
      onSuccess(createdGrn.grnNumber, items.length);
    }
  };

  const itemsWithSchemeCount = rows.filter(
    (r) => r.schemeType !== 'none' || r.freeQty > 0 || r.discountAmount > 0
  ).length;

  // Filtered rows for review table
  const filteredRows = rows.filter((r) => {
    if (filterNewOnly && !r.isNewProduct) return false;
    if (filterSchemeOnly && r.schemeType === 'none' && r.freeQty === 0 && r.discountAmount === 0) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.productName.toLowerCase().includes(q) ||
        r.rawName.toLowerCase().includes(q) ||
        r.hsn.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.schemeText && r.schemeText.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Download Comprehensive Sample Excel Template (With Provider Details sheet, Items table & GST Guide)
  const handleDownloadSample = () => {
    downloadImportTemplateXlsx();
  };

  // Download Comprehensive CSV Template (With Provider Details headers & columns)
  const handleDownloadCsvSample = () => {
    downloadImportTemplate();
  };

  return (
    <div
      id="modal-bulk-inward"
      className={
        isMaximized
          ? 'fixed inset-0 z-50 flex flex-col bg-white overflow-hidden'
          : 'fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-2.5 bg-slate-900/60 backdrop-blur-xs overflow-hidden'
      }
    >
      <div
        className={
          isMaximized
            ? 'w-full h-full flex flex-col overflow-hidden bg-white'
            : 'bg-white w-full max-w-[99vw] xl:max-w-[98vw] 2xl:max-w-[1850px] h-full sm:h-[98vh] max-h-[98vh] rounded-xl shadow-2xl border flex flex-col overflow-hidden'
        }
        style={{ borderColor: palette.line }}
      >
        {/* MODAL HEADER */}
        <div
          className={`flex items-center justify-between px-3 sm:px-6 border-b bg-slate-50 shrink-0 ${
            step === 'review' ? 'py-2 sm:py-2.5' : 'py-2.5 sm:py-3'
          }`}
          style={{ borderColor: palette.line }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="p-1 sm:p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
              <Boxes size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                  {step === 'upload' ? 'Smart Inward Invoice Reader' : 'Review Inward Consignment'}
                </h2>
                {step === 'upload' ? (
                  <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Excel • CSV • PDF • Image OCR
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                    {rows.length} {rows.length === 1 ? 'Product' : 'Products'} ({totalReceivedQty} Crates)
                  </span>
                )}
                {step === 'review' && fileName && (
                  <span className="hidden lg:inline-block text-[11px] text-slate-500 font-medium truncate max-w-[180px]">
                    from {fileName}
                  </span>
                )}
              </div>
              {step === 'upload' && (
                <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
                  Upload supplier invoice or quotation in any format. Extracts products, quantities, schemes & taxes.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {step === 'review' && (
              <>
                {/* Upper Details Toggle Button in Header */}
                <button
                  type="button"
                  onClick={() => setIsUpperDetailsExpanded((prev) => !prev)}
                  className={`px-2 sm:px-2.5 py-1 text-xs font-semibold rounded border flex items-center gap-1 cursor-pointer transition-colors ${
                    isUpperDetailsExpanded
                      ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
                  }`}
                  title={
                    isUpperDetailsExpanded
                      ? 'Contract upper details to maximize product review workspace'
                      : 'Expand upper details to edit supplier info, vehicle, taxes & godown'
                  }
                >
                  {isUpperDetailsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span className="hidden sm:inline">{isUpperDetailsExpanded ? 'Contract Details' : 'Bill Details'}</span>
                  <span className="sm:hidden">{isUpperDetailsExpanded ? 'Contract' : 'Bill'}</span>
                </button>

                <button
                  onClick={() => setStep('upload')}
                  className="px-2 sm:px-2.5 py-1 text-xs font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer flex items-center gap-1 transition-colors"
                  title="Upload a different invoice"
                >
                  <RefreshCw size={12} />
                  <span className="hidden sm:inline">Change File</span>
                </button>
              </>
            )}

            {/* Maximize / Restore Toggle */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1 sm:p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-md cursor-pointer transition-colors"
              title={isMaximized ? 'Restore windowed view' : 'Maximize full screen view'}
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            <button
              onClick={onClose}
              className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md cursor-pointer transition-colors"
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ERROR NOTIFICATION */}
        {parseError && (
          <div className="mx-3 sm:mx-6 mt-3 sm:mt-4 p-3.5 sm:p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg flex items-start gap-3 text-xs shadow-xs">
            <AlertCircle size={18} className="text-rose-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold block text-xs sm:text-sm text-rose-900">{parseError}</span>
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {lastUploadedFile && (
                  <button
                    onClick={() => processUploadedFile(lastUploadedFile)}
                    disabled={isParsing}
                    className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-md text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isParsing ? "animate-spin" : ""} />
                    Retry AI Vision ({lastUploadedFile.name})
                  </button>
                )}
                <button
                  onClick={handleStartBlankConsignment}
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-md text-xs flex items-center gap-1.5 cursor-pointer border border-slate-300 shadow-xs transition-colors"
                >
                  <ArrowRight size={13} />
                  Open Review (Manual Entry)
                </button>
                <button
                  onClick={handleDownloadSample}
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-md text-xs flex items-center gap-1.5 cursor-pointer border border-emerald-300 transition-colors"
                >
                  <Download size={13} />
                  Use Excel Template
                </button>
              </div>
            </div>
            <button
              onClick={() => setParseError(null)}
              className="text-rose-400 hover:text-rose-700 font-bold p-1 rounded hover:bg-rose-100 transition-colors cursor-pointer shrink-0"
              title="Dismiss alert"
            >
              ✕
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 1: UPLOAD / DRAG & DROP / TEMPLATE DOWNLOAD         */}
        {/* ======================================================== */}
        {step === 'upload' && (
          <div className="p-6 overflow-y-auto flex flex-col gap-6 flex-1">
            {/* DRAG & DROP DROPZONE */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  processUploadedFile(e.dataTransfer.files[0]);
                }
              }}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-indigo-600 bg-indigo-50/70 scale-[0.99]'
                  : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processUploadedFile(e.target.files[0]);
                  }
                }}
              />

              {isParsing ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-base font-bold text-indigo-900">{parsingStatus || 'Analyzing document...'}</p>
                  <p className="text-xs text-slate-500 max-w-md">
                    Extracting header metadata, matching beverage catalog, calculating taxes & scheme incentives.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3.5 bg-emerald-100 text-emerald-700 rounded-full shadow-xs">
                      <FileSpreadsheet size={28} />
                    </div>
                    <div className="p-3.5 bg-blue-100 text-blue-700 rounded-full shadow-xs">
                      <FileText size={28} />
                    </div>
                    <div className="p-3.5 bg-indigo-100 text-indigo-700 rounded-full shadow-xs">
                      <ImageIcon size={28} />
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-800 mb-1">
                    Drag & Drop your Supplier Invoice here, or <span className="text-indigo-600 underline">Browse File</span>
                  </h3>
                  <p className="text-xs text-slate-500 max-w-lg mb-5">
                    Supports <strong>Excel (.xlsx, .xls)</strong>, <strong>CSV (.csv)</strong>, <strong>PDF invoices</strong>, and <strong>Photo / Scanned bills (.jpg, .png)</strong>.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600 max-w-2xl w-full">
                    <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-xs font-medium text-center">
                      ✓ Billed vs Free cases
                    </div>
                    <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-xs font-medium text-center">
                      ✓ New vs Existing products
                    </div>
                    <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-xs font-medium text-center">
                      ✓ Auto GST Calculation
                    </div>
                    <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-xs font-medium text-center">
                      ✓ Landed Cost Computation
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ACTION OPTIONS: TEMPLATE DOWNLOAD & MANUAL ENTRY */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Download Sample Excel / CSV Templates with Provider Details */}
              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2 text-emerald-700">
                    <FileSpreadsheet size={20} />
                    <h4 className="font-bold text-sm text-slate-900">
                      Download Updated Inward Templates (Excel / CSV)
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-2.5">
                    Updated to capture <strong>complete Invoice Provider Details</strong>: Supplier / Distributor Name, GSTIN, Registered Address, Phone, Email, Invoice No, Invoice Date, Vehicle No, Place of Supply (POS), Billed To, and Shipped To.
                  </p>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-emerald-800">
                    <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded font-medium">✓ Provider Details Sheet</span>
                    <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded font-medium">✓ Beverage Item Columns</span>
                    <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded font-medium">✓ GST Slabs Reference</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 font-medium">Includes sample data ready for instant import</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownloadCsvSample}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors border border-slate-300"
                      title="Download flat CSV template with provider and item columns"
                    >
                      <Download size={13} />
                      CSV Template
                    </button>
                    <button
                      onClick={handleDownloadSample}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                      title="Download multi-sheet Excel workbook with Provider Details, Items, and Tax Guides"
                    >
                      <Download size={13} />
                      Excel Template (.xlsx)
                    </button>
                  </div>
                </div>
              </div>

              {/* Option 2: Start Manual Consignment */}
              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2 text-indigo-700">
                    <Plus size={20} />
                    <h4 className="font-bold text-sm text-slate-900">
                      Direct Manual Inward Entry
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Skip uploading a file and start directly with an empty consignment in the review screen. Add beverage products, specify schemes, enter supplier details, and post stock straight to your godown.
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Fast entry for physical paper receipts</span>
                  <button
                    onClick={handleStartBlankConsignment}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <ArrowRight size={13} />
                    Start Manual Entry
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 2: FULL REVIEW & EDIT WORKSPACE                      */}
        {/* ======================================================== */}
        {step === 'review' && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* ======================================================== */}
            {/* UPPER DETAILS: CONTRACTED STRIP VS EXPANDED CONTROLS     */}
            {/* ======================================================== */}

            {/* 1. CONTRACTED VIEW (DEFAULT - GIVES MAXIMUM SPACE TO PRODUCTS) */}
            {!isUpperDetailsExpanded && (
              <div
                className="bg-slate-900 text-white px-3 sm:px-6 py-2 border-b flex items-center justify-between gap-2 text-xs shrink-0 shadow-2xs"
                style={{ borderColor: palette.line }}
              >
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-white min-w-0">
                    <Building2 size={14} className="text-indigo-400 shrink-0" />
                    <span className="truncate max-w-[130px] sm:max-w-[200px] text-xs" title={supplierName}>
                      {supplierName || 'Supplier'}
                    </span>
                  </div>
                  <span className="text-slate-600 hidden sm:inline">•</span>
                  <div className="flex items-center gap-1 font-mono text-indigo-300 font-semibold text-[11px] shrink-0">
                    <span className="text-slate-400 hidden sm:inline">Inv:</span>
                    <span className="text-white font-bold">#{invoiceNo || 'N/A'}</span>
                  </div>
                  <span className="text-slate-600 hidden sm:inline">•</span>
                  <div className="hidden sm:flex items-center gap-1 text-slate-300 text-[11px] shrink-0">
                    <span className="text-slate-400">Date:</span>
                    <span>{inwardDate}</span>
                  </div>
                  <span className="text-slate-600 hidden md:inline">•</span>
                  <div className="hidden md:flex items-center gap-1 text-slate-300 text-[11px] shrink-0">
                    <span className="text-slate-400">To:</span>
                    <span className="px-1.5 py-0.5 bg-slate-800 text-indigo-200 rounded font-semibold text-[10px] border border-slate-700">
                      {warehouses.find((w) => w.id === targetWarehouseId)?.name || 'Godown'}
                    </span>
                  </div>
                  {vehicleNo && (
                    <>
                      <span className="text-slate-600 hidden lg:inline">•</span>
                      <span className="hidden lg:inline font-mono text-slate-400 text-[10px]">Veh: {vehicleNo}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {/* Live metrics indicator */}
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="hidden md:inline text-slate-300 text-[11px]">
                      <strong className="text-white">{rows.length}</strong> items • <strong className="text-emerald-300">{totalReceivedQty.toLocaleString()}</strong> cs
                    </span>
                    <div className="bg-indigo-950 px-2.5 py-0.5 rounded border border-indigo-700/60 flex items-center gap-1">
                      <span className="text-indigo-300 text-[10px] uppercase font-bold">Total:</span>
                      <span className="font-extrabold text-amber-300 text-xs sm:text-sm">₹{money(calculatedGrandTotal)}</span>
                    </div>
                  </div>

                  {/* Expand Upper Details Button */}
                  <button
                    type="button"
                    onClick={() => setIsUpperDetailsExpanded(true)}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs shrink-0"
                    title="Expand supplier info, vehicle, taxes & godown settings"
                  >
                    <ChevronDown size={13} />
                    <span className="hidden sm:inline">Edit Bill Details</span>
                    <span className="sm:hidden">Edit Info</span>
                  </button>
                </div>
              </div>
            )}

            {/* 2. EXPANDED VIEW (FULL INVOICE & TAX CONTROLS WITH QUICK COLLAPSE) */}
            {isUpperDetailsExpanded && (
              <div className="bg-slate-50 border-b shrink-0 transition-all shadow-inner" style={{ borderColor: palette.line }}>
                {/* Header Banner with Close/Contract action */}
                <div className="bg-indigo-950 text-white px-3 sm:px-6 py-1.5 flex items-center justify-between text-xs border-b border-indigo-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 size={14} className="text-indigo-400 shrink-0" />
                    <span className="font-bold text-xs uppercase tracking-wide truncate">
                      Invoice Header & Dispatch Details
                    </span>
                    <span className="hidden sm:inline text-indigo-300 text-[11px]">
                      (Modify supplier info, vehicle, taxes or godown below)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsUpperDetailsExpanded(false)}
                    className="px-2.5 py-0.5 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded text-xs flex items-center gap-1 cursor-pointer shadow-xs shrink-0"
                    title="Contract upper details to maximize product review workspace"
                  >
                    <ChevronUp size={13} />
                    <span>Contract Upper Info ▲</span>
                  </button>
                </div>

                {/* Editable Invoice Fields - Grid */}
                <div className="px-3 sm:px-6 py-2.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">Supplier Name</label>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">Supplier GSTIN</label>
                    <input
                      type="text"
                      value={supplierGstin}
                      onChange={(e) => setSupplierGstin(e.target.value)}
                      className="w-full font-mono text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">Invoice #</label>
                    <input
                      type="text"
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      className="w-full font-mono font-bold text-indigo-700 bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">Invoice Date</label>
                    <input
                      type="date"
                      value={inwardDate}
                      onChange={(e) => setInwardDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">Vehicle #</label>
                    <input
                      type="text"
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value)}
                      className="w-full font-mono text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">Inward To Godown</label>
                    <select
                      value={targetWarehouseId}
                      onChange={(e) => setTargetWarehouseId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:border-indigo-500"
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">Bill Discount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={overallDiscount}
                      onChange={(e) => setOverallDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="0.00"
                      className="w-full font-mono font-bold text-rose-600 bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:border-rose-500"
                    />
                  </div>
                </div>

                {/* Additional Provider Details Bar */}
                <div className="px-3 sm:px-6 py-1.5 bg-slate-100/80 border-t border-slate-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowProviderDetails((prev) => !prev)}
                      className="px-2 py-0.5 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-50 rounded border border-indigo-200 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Building2 size={12} />
                      <span>{showProviderDetails ? 'Hide Provider Details' : 'Full Provider Address & Consignee'}</span>
                      {showProviderDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {detectedSource && (
                      <span className="text-[11px] text-slate-500 hidden md:inline">
                        Source: {detectedSource}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsUpperDetailsExpanded(false)}
                    className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Done, Contract Info</span>
                    <ChevronUp size={12} />
                  </button>
                </div>

                {/* EXPANDABLE INVOICE PROVIDER & DISPATCH DETAILS PANEL */}
                {showProviderDetails && (
                  <div className="bg-indigo-50/80 border-t border-indigo-100 px-3 sm:px-6 py-2.5 transition-all">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                      <div className="lg:col-span-2">
                        <label className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                          Supplier Registered Address
                        </label>
                        <input
                          type="text"
                          value={supplierAddress}
                          onChange={(e) => setSupplierAddress(e.target.value)}
                          placeholder="e.g. Main Road, Kuchinda - 768222"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                          Supplier Phone / Mobile
                        </label>
                        <input
                          type="text"
                          value={supplierPhone}
                          onChange={(e) => setSupplierPhone(e.target.value)}
                          placeholder="e.g. +91 94370 84801"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                          Supplier Email
                        </label>
                        <input
                          type="text"
                          value={supplierEmail}
                          onChange={(e) => setSupplierEmail(e.target.value)}
                          placeholder="e.g. supplier@gmail.com"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                          Place of Supply (POS)
                        </label>
                        <input
                          type="text"
                          value={placeOfSupply}
                          onChange={(e) => setPlaceOfSupply(e.target.value)}
                          placeholder="e.g. Odisha (21)"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                          Billed To (Consignee)
                        </label>
                        <input
                          type="text"
                          value={billedTo}
                          onChange={(e) => setBilledTo(e.target.value)}
                          placeholder="e.g. Store Name"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* LIVE KPI SUMMARY BAR */}
                <div className="bg-indigo-900 text-white px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
                    <div>
                      <span className="text-indigo-200 block text-[10px] uppercase font-semibold">Line Items</span>
                      <span className="font-bold text-white text-xs sm:text-sm">
                        {rows.length} items
                        <span className="text-indigo-300 font-normal text-[11px] ml-1">
                          ({newProductsCount} new, {existingProductsCount} existing)
                        </span>
                      </span>
                    </div>

                    <div className="hidden sm:block h-6 w-px bg-indigo-700" />

                    <div>
                      <span className="text-indigo-200 block text-[10px] uppercase font-semibold">Billed Cases</span>
                      <span className="font-bold text-white text-xs sm:text-sm">
                        {totalBilledQty.toLocaleString()} cs
                        {totalPaidQty < totalBilledQty && (
                          <span className="text-indigo-300 font-normal text-[11px] ml-1">
                            ({totalPaidQty} paid)
                          </span>
                        )}
                      </span>
                    </div>

                    <div>
                      <span className="text-indigo-200 block text-[10px] uppercase font-semibold">Free Scheme Cases</span>
                      <span className="font-bold text-emerald-300 text-xs sm:text-sm">
                        {totalFreeQty.toLocaleString()} cs
                      </span>
                    </div>

                    {printedTotalCases !== null && (
                      <div className="hidden sm:block">
                        <span className="text-indigo-200 block text-[10px] uppercase font-semibold">Printed Invoice Cases</span>
                        <span className="font-bold text-indigo-100 text-xs sm:text-sm">
                          {printedTotalCases.toLocaleString()} cs
                        </span>
                      </div>
                    )}

                    <div className={hasCasesMismatch ? 'bg-red-700/80 px-2 py-0.5 rounded border border-red-400' : ''}>
                      <span className="text-indigo-200 block text-[10px] uppercase font-semibold">Total Crates Received</span>
                      <span className={`font-bold text-xs sm:text-sm flex items-center gap-1 ${hasCasesMismatch ? 'text-red-100 font-extrabold' : 'text-white'}`}>
                        {hasCasesMismatch && <AlertTriangle size={13} className="text-amber-300 shrink-0" />}
                        {totalReceivedQty.toLocaleString()} crates
                        {hasCasesMismatch && (
                          <span className="text-[10px] bg-red-950 text-red-200 px-1 rounded font-mono font-bold">
                            {casesDiff > 0 ? `+${casesDiff}` : casesDiff} MISMATCH
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="hidden md:block h-6 w-px bg-indigo-700" />

                    <div className="hidden md:block">
                      <span className="text-indigo-200 block text-[10px] uppercase font-semibold">Taxable Amount</span>
                      <span className="font-mono font-bold text-indigo-100 text-xs sm:text-sm">₹{money(totalTaxable)}</span>
                    </div>

                    <div className="hidden md:block">
                      <span className="text-indigo-200 block text-[10px] uppercase font-semibold">Total GST</span>
                      <span className="font-mono font-bold text-indigo-100 text-xs sm:text-sm">₹{money(totalTax)}</span>
                    </div>

                    {totalInwardCost > 0 && (
                      <div className="hidden lg:block bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 rounded">
                        <span className="text-amber-200 block text-[10px] uppercase font-semibold">Direct Inward Costs</span>
                        <span className="font-mono font-bold text-amber-100 text-xs sm:text-sm">
                          ₹{money(totalInwardCost)}{' '}
                          <span className="text-[10px] text-amber-200 font-normal">
                            (+₹{money(inwardCostPerCrate)}/cr)
                          </span>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {originalInvoiceTotal !== null && (
                      <div className="text-right hidden sm:block">
                        <span className="text-indigo-300 block text-[10px]">Party Total</span>
                        <span className="font-mono text-xs font-semibold text-indigo-200">
                          ₹{money(originalInvoiceTotal)}
                        </span>
                      </div>
                    )}

                    <div className="bg-indigo-950/80 px-3 py-1 rounded-lg border border-indigo-700 text-right">
                      <span className="text-indigo-300 block text-[10px] font-semibold uppercase">Invoice Grand Total</span>
                      <span className="font-mono font-extrabold text-amber-300 text-sm sm:text-base">
                        ₹{money(calculatedGrandTotal)}
                      </span>
                    </div>

                    {totalInwardCost > 0 && (
                      <div className="bg-emerald-950/80 px-3 py-1 rounded-lg border border-emerald-700 text-right hidden xl:block">
                        <span className="text-emerald-300 block text-[10px] font-semibold uppercase">Total Landed Valuation</span>
                        <span className="font-mono font-extrabold text-emerald-300 text-sm sm:text-base">
                          ₹{money(totalLandedInventoryValue)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* RED MISMATCH WARNING BANNER */}
            {hasCasesMismatch && (
              <div className="mx-3 sm:mx-6 my-2.5 p-3 sm:p-4 bg-red-50 border-2 border-red-500 rounded-lg shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-red-950">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-100 border border-red-300 rounded-full text-red-700 shrink-0 mt-0.5">
                    <AlertTriangle size={22} className="text-red-600" />
                  </div>
                  <div>
                    <div className="font-black text-xs sm:text-sm text-red-900 flex items-center gap-2">
                      <span>⚠️ Total Cases Mismatch Detected!</span>
                      <span className="px-2 py-0.5 bg-red-200 text-red-950 rounded font-mono text-[11px] font-black border border-red-300">
                        {casesDiff > 0 ? `+${casesDiff}` : casesDiff} Cases Difference
                      </span>
                    </div>
                    <p className="text-xs text-red-800 mt-1 leading-snug">
                      The working table total received is <strong>{totalReceivedQty.toLocaleString()} crates</strong>, but the supplier invoice printed case count is <strong>{printedTotalCases?.toLocaleString()} crates</strong>. In FMCG beverage distribution, the printed invoice case count is strictly the total crates physically received (inclusive of free scheme crates). Please verify line quantities and scheme free counts.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span className="text-[11px] font-bold text-red-800 bg-white px-3 py-1.5 rounded border border-red-300 shadow-2xs font-mono">
                    Printed: {printedTotalCases} cs vs Table: {totalReceivedQty} cs
                  </span>
                </div>
              </div>
            )}

            {/* REVIEW TOOLBAR */}
            <div className="px-3 sm:px-6 py-2 border-b bg-white flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0" style={{ borderColor: palette.line }}>
              <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xl">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search recognized products, HSN, category, scheme..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 border border-slate-300 rounded text-xs focus:border-indigo-500 focus:outline-hidden"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="hidden sm:flex items-center gap-1">
                  <button
                    onClick={() => {
                      setFilterNewOnly(false);
                      setFilterSchemeOnly(false);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      !filterNewOnly && !filterSchemeOnly
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All ({rows.length})
                  </button>

                  <button
                    onClick={() => {
                      setFilterNewOnly(!filterNewOnly);
                      if (!filterNewOnly) setFilterSchemeOnly(false);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                      filterNewOnly
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                    }`}
                  >
                    <Sparkles size={11} />
                    New ({newProductsCount})
                  </button>

                  <button
                    onClick={() => {
                      setFilterSchemeOnly(!filterSchemeOnly);
                      if (!filterSchemeOnly) setFilterNewOnly(false);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                      filterSchemeOnly
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                    }`}
                  >
                    <Tag size={11} />
                    Schemes ({itemsWithSchemeCount})
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* View Mode Toggle: Cards vs Table */}
                <div className="flex items-center border border-slate-300 rounded-md p-0.5 bg-slate-100 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`px-2 py-1 rounded flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                      viewMode === 'cards'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Card View (Optimized for all screen sizes & mobile readability)"
                  >
                    <LayoutGrid size={13} />
                    <span className="text-[11px]">Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`px-2 py-1 rounded flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                      viewMode === 'table'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Table View (Desktop Spreadsheet Layout)"
                  >
                    <Table size={13} />
                    <span className="text-[11px]">Table</span>
                  </button>
                </div>

                {/* Density Toggle - only when in table view */}
                {viewMode === 'table' && (
                  <div className="hidden lg:flex items-center border border-slate-300 rounded p-0.5 bg-slate-50 text-[11px]">
                    <button
                      onClick={() => setDensity('comfortable')}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                        density === 'comfortable' ? 'bg-white shadow-xs text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Comfortable row height"
                    >
                      Spacious
                    </button>
                    <button
                      onClick={() => setDensity('compact')}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                        density === 'compact' ? 'bg-white shadow-xs text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Compact row height"
                    >
                      Compact
                    </button>
                  </div>
                )}

                {/* Header Expand/Contract Button in Toolbar */}
                <button
                  type="button"
                  onClick={() => setIsUpperDetailsExpanded((prev) => !prev)}
                  className={`px-2.5 py-1.5 rounded font-semibold flex items-center gap-1.5 cursor-pointer text-xs transition-colors border ${
                    isUpperDetailsExpanded
                      ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-2xs'
                  }`}
                  title={
                    isUpperDetailsExpanded
                      ? 'Contract upper details to maximize product review workspace'
                      : 'Expand upper details to edit supplier info, vehicle, taxes & godown'
                  }
                >
                  {isUpperDetailsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span className="hidden sm:inline">{isUpperDetailsExpanded ? 'Contract Header' : 'Bill Header'}</span>
                  <span className="sm:hidden">{isUpperDetailsExpanded ? 'Contract' : 'Bill'}</span>
                </button>

                <button
                  onClick={() => setShowBulkSchemeModal(true)}
                  className="px-2.5 sm:px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 font-bold rounded cursor-pointer flex items-center gap-1.5 transition-colors text-xs"
                >
                  <Tag size={13} />
                  <span className="hidden sm:inline">Scheme to All</span>
                  <span className="sm:hidden">Scheme</span>
                </button>

                <button
                  onClick={handleAddNewRow}
                  className="px-2.5 sm:px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded cursor-pointer flex items-center gap-1.5 shadow-xs transition-colors text-xs"
                >
                  <Plus size={13} />
                  <span className="hidden sm:inline">Add Product</span>
                  <span className="sm:hidden">Add</span>
                </button>
              </div>

              {/* Mobile Filter Buttons Row */}
              <div className="sm:hidden flex items-center gap-1.5 w-full pt-1 border-t border-slate-100">
                <button
                  onClick={() => {
                    setFilterNewOnly(false);
                    setFilterSchemeOnly(false);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                    !filterNewOnly && !filterSchemeOnly
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  All ({rows.length})
                </button>

                <button
                  onClick={() => {
                    setFilterNewOnly(!filterNewOnly);
                    if (!filterNewOnly) setFilterSchemeOnly(false);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                    filterNewOnly
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
                >
                  <Sparkles size={10} />
                  New ({newProductsCount})
                </button>

                <button
                  onClick={() => {
                    setFilterSchemeOnly(!filterSchemeOnly);
                    if (!filterSchemeOnly) setFilterNewOnly(false);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                    filterSchemeOnly
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-50 text-purple-700 border border-purple-200'
                  }`}
                >
                  <Tag size={10} />
                  Schemes ({itemsWithSchemeCount})
                </button>
              </div>
            </div>

            {/* INWARD-TO-GODOWN DIRECT COSTS BANNER */}
            <div className="bg-amber-50/90 border-b border-amber-200 px-3 sm:px-6 py-2.5 text-xs shrink-0">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                <div className="flex items-start sm:items-center gap-2">
                  <div className="p-1.5 bg-amber-100 text-amber-900 rounded-md shrink-0 mt-0.5 sm:mt-0">
                    <Truck size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-amber-950 text-xs sm:text-sm">
                        Inward-to-Godown Direct Costs
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-200/80 text-amber-900 border border-amber-300">
                        Allocated to Stock: +₹{money(inwardCostPerCrate)} / Crate
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-tight">
                      Costs required to bring goods into the godown (transport, freight, labour). Allocated equally across all {totalReceivedQty} received crates to calculate true Landed Cost.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-white border border-amber-300 rounded px-2 py-1 shadow-2xs">
                    <span className="text-[11px] text-slate-500 font-medium">Transport:</span>
                    <span className="font-mono text-xs font-bold text-slate-800">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={transportCost}
                      onChange={(e) => setTransportCost(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-16 font-mono text-xs font-bold text-slate-900 text-right bg-transparent focus:outline-hidden"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 bg-white border border-amber-300 rounded px-2 py-1 shadow-2xs">
                    <span className="text-[11px] text-slate-500 font-medium">Freight:</span>
                    <span className="font-mono text-xs font-bold text-slate-800">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={freightCost}
                      onChange={(e) => setFreightCost(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-16 font-mono text-xs font-bold text-slate-900 text-right bg-transparent focus:outline-hidden"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 bg-white border border-amber-300 rounded px-2 py-1 shadow-2xs">
                    <span className="text-[11px] text-slate-500 font-medium">Loading:</span>
                    <span className="font-mono text-xs font-bold text-slate-800">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="25"
                      value={loadingLabourCost}
                      onChange={(e) => setLoadingLabourCost(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-14 font-mono text-xs font-bold text-slate-900 text-right bg-transparent focus:outline-hidden"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 bg-white border border-amber-300 rounded px-2 py-1 shadow-2xs">
                    <span className="text-[11px] text-slate-500 font-medium">Unloading:</span>
                    <span className="font-mono text-xs font-bold text-slate-800">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="25"
                      value={unloadingLabourCost}
                      onChange={(e) => setUnloadingLabourCost(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-14 font-mono text-xs font-bold text-slate-900 text-right bg-transparent focus:outline-hidden"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 bg-white border border-amber-300 rounded px-2 py-1 shadow-2xs">
                    <span className="text-[11px] text-slate-500 font-medium">Other:</span>
                    <span className="font-mono text-xs font-bold text-slate-800">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="25"
                      value={otherInwardCost}
                      onChange={(e) => setOtherInwardCost(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-14 font-mono text-xs font-bold text-slate-900 text-right bg-transparent focus:outline-hidden"
                      placeholder="0"
                    />
                  </div>

                  <div className="bg-amber-900 text-amber-100 px-3 py-1 rounded font-mono text-xs font-bold shadow-2xs flex items-center gap-1.5">
                    <span>Total:</span>
                    <span className="text-white text-sm">₹{money(totalInwardCost)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* REVIEW ITEMS DISPLAY (RESPONSIVE CARDS OR SPREADSHEET TABLE) */}
            <div className="flex-1 min-h-0 overflow-y-auto bg-slate-100/60 p-2 sm:p-3 md:p-3.5">
              {viewMode === 'cards' ? (
                <div className="space-y-3 min-w-0">
                  {filteredRows.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                      <p className="text-sm font-semibold">No products match the active filters or search query.</p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setFilterNewOnly(false);
                          setFilterSchemeOnly(false);
                        }}
                        className="mt-2 text-xs font-bold text-indigo-600 underline cursor-pointer"
                      >
                        Reset filters
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2.5 sm:gap-3 min-w-0">
                      {filteredRows.map((r, idx) => (
                        <InwardProductCard
                          key={r.id}
                          row={r}
                          index={idx}
                          products={products}
                          inwardCostPerCrate={inwardCostPerCrate}
                          isExpanded={expandedCardId === r.id}
                          onToggleExpand={() =>
                            setExpandedCardId(expandedCardId === r.id ? null : r.id)
                          }
                          onUpdateField={(field, val) => updateRowField(r.id, field, val)}
                          onCatalogMappingChange={(val) => handleCatalogMappingChange(r.id, val)}
                          onDuplicate={() => handleDuplicateRow(r.id)}
                          onDelete={() => handleDeleteRow(r.id)}
                          money={money}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl border shadow-sm overflow-x-auto" style={{ borderColor: palette.line }}>
                  <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
                    <thead className="bg-slate-100/90 text-slate-700 border-b font-bold sticky top-0 z-10 backdrop-blur-xs" style={{ borderColor: palette.line }}>
                      <tr>
                        <th className="px-3 py-3 w-10 text-center">#</th>
                        <th className="px-4 py-3 min-w-[320px]">Product & Pack Info</th>
                        <th className="px-3 py-3 w-28 text-right">Billed Qty</th>
                        <th className="px-4 py-3 min-w-[280px] bg-purple-50/70 border-x border-purple-200">
                          <div className="flex items-center gap-1.5 text-purple-900">
                            <Tag size={13} />
                            <span>Scheme Review & Free Qty</span>
                          </div>
                        </th>
                        <th className="px-4 py-3 min-w-[190px] text-right">
                          <span>Invoice Unit Rate</span>
                          <span className="block text-[10px] font-normal text-slate-500">Ex-GST • GST • Incl-GST</span>
                        </th>
                        <th className="px-4 py-3 min-w-[190px] text-right bg-indigo-50/60 text-indigo-950 border-x border-indigo-200">
                          <span>Effective Scheme Rate</span>
                          <span className="block text-[10px] font-normal text-indigo-700">Per Crate & Per Unit</span>
                        </th>
                        <th className="px-3 py-3 min-w-[140px] text-right bg-amber-50/70 text-amber-950">
                          <span>Inward Cost Share</span>
                          <span className="block text-[10px] font-normal text-amber-700">Transport/Labour</span>
                        </th>
                        <th className="px-4 py-3 min-w-[190px] text-right bg-emerald-50/80 text-emerald-950 border-x border-emerald-200">
                          <span>Final Landed Cost</span>
                          <span className="block text-[10px] font-normal text-emerald-700">Per Crate & Per Unit</span>
                        </th>
                        <th className="px-4 py-3 min-w-[200px]">Selling & Batch</th>
                        <th className="px-2 py-3 w-16 text-center">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-slate-500">
                            <p className="text-sm font-semibold">No products match the active filters or search query.</p>
                            <button
                              onClick={() => {
                                setSearchQuery('');
                                setFilterNewOnly(false);
                                setFilterSchemeOnly(false);
                              }}
                              className="mt-2 text-xs font-bold text-indigo-600 underline cursor-pointer"
                            >
                              Reset filters
                            </button>
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((r, idx) => {
                          const unitsPerCrate = r.unitsPerCrate || (r.volume <= 200 ? 30 : 24);
                          const packSize = r.packSize || `${r.volume}ml ${r.pack}`;
                          const breakdown = calculateLandedCostBreakdown({
                            qty: r.qty,
                            unitPrice: r.unitPrice,
                            unitsPerCrate,
                            pack: r.pack,
                            volume: r.volume,
                            packSize: r.packSize,
                            cgstPercent: r.cgstPercent,
                            sgstPercent: r.sgstPercent,
                            schemeType: r.schemeType,
                            schemeMode: r.schemeMode || 'inclusive',
                            schemeBuyQty: r.schemeBuyQty,
                            schemeFreeQty: r.schemeFreeQty,
                            freeQty: r.freeQty,
                            paidQty: r.paidQty,
                            discountPercent: r.discountPercent,
                            discountFlat: r.discountFlat,
                            discountAmount: r.discountAmount,
                            inwardCostPerCrate,
                          });
                          const isComfortable = density === 'comfortable';

                          return (
                            <tr
                              key={r.id}
                              className={`hover:bg-indigo-50/20 transition-colors ${
                                r.isNewProduct ? 'bg-blue-50/15' : ''
                              }`}
                            >
                              {/* Index */}
                              <td className="px-3 py-3 text-center text-slate-400 font-mono text-[11px] align-top pt-4">
                                {idx + 1}
                              </td>

                              {/* Product Info, Pack Size & Units Per Crate */}
                              <td className={`px-4 ${isComfortable ? 'py-3.5' : 'py-2.5'} align-top`}>
                                <div className="flex flex-col gap-1.5">
                                  {/* Status Badge & Quick Catalog Switcher */}
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {r.isNewProduct ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                        <Sparkles size={11} className="text-blue-600" />
                                        NEW PRODUCT
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        <Check size={11} className="text-emerald-700" />
                                        EXISTING #{r.matchedProductId} ({r.existingStock ?? 0} cs)
                                      </span>
                                    )}

                                    <select
                                      value={r.isNewProduct ? 'new_product' : String(r.matchedProductId)}
                                      onChange={(e) => handleCatalogMappingChange(r.id, e.target.value)}
                                      className="text-[11px] font-medium bg-slate-50 border border-slate-300 rounded px-2 py-0.5 text-slate-700 hover:bg-slate-100 cursor-pointer"
                                      title="Map to an existing product in your catalog or treat as a new item"
                                    >
                                      <option value="new_product">Create as New Product</option>
                                      <optgroup label="Map to Existing Catalog Product:">
                                        {products.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name} ({p.category.toUpperCase()})
                                          </option>
                                        ))}
                                      </optgroup>
                                    </select>
                                  </div>

                                  {/* Editable Product Name */}
                                  <input
                                    type="text"
                                    value={r.productName}
                                    onChange={(e) => updateRowField(r.id, 'productName', e.target.value)}
                                    className={`font-bold text-slate-900 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 w-full focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs ${
                                      isComfortable ? 'text-sm' : 'text-xs'
                                    }`}
                                    placeholder="Beverage Product Name"
                                  />

                                  {/* Pack Size, Units/Crate, Category & HSN */}
                                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 pt-0.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[11px] text-slate-400 font-medium">Pack:</span>
                                      <input
                                        type="text"
                                        value={packSize}
                                        onChange={(e) => updateRowField(r.id, 'packSize', e.target.value)}
                                        className="w-24 px-1.5 py-0.5 border border-slate-300 rounded text-xs text-slate-800 bg-white font-medium"
                                        placeholder="150ml PET"
                                      />
                                    </div>

                                    <div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                      <span className="text-[11px] text-amber-900 font-bold">Units/Cr:</span>
                                      <input
                                        type="number"
                                        min="1"
                                        value={unitsPerCrate}
                                        onChange={(e) => updateRowField(r.id, 'unitsPerCrate', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                        className="w-12 font-mono font-bold text-xs text-amber-950 bg-white border border-amber-300 rounded px-1 py-0.5 text-right"
                                      />
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <span className="text-[11px] text-slate-400 font-medium">HSN:</span>
                                      <input
                                        type="text"
                                        value={r.hsn}
                                        onChange={(e) => updateRowField(r.id, 'hsn', e.target.value)}
                                        className="w-20 font-mono text-xs px-1.5 py-0.5 border border-slate-300 rounded bg-white text-slate-800"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Billed Qty */}
                              <td className={`px-3 ${isComfortable ? 'py-3.5' : 'py-2.5'} text-right align-top`}>
                                <input
                                  type="number"
                                  min="1"
                                  value={r.qty}
                                  onChange={(e) => updateRowField(r.id, 'qty', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                  className={`font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-md px-2 py-1.5 w-24 text-right focus:border-indigo-500 shadow-xs ${
                                    isComfortable ? 'text-sm' : 'text-xs'
                                  }`}
                                />
                                <span className="block text-[11px] text-slate-500 mt-1 font-medium">crates billed</span>
                              </td>

                              {/* PRODUCT SCHEME REVIEW & FREE QUANTITY */}
                              <td className={`px-4 ${isComfortable ? 'py-3.5' : 'py-2.5'} bg-purple-50/35 border-x border-purple-200 align-top`}>
                                <div className="flex flex-col gap-1.5">
                                  {/* Scheme Type Selector */}
                                  <select
                                    value={r.schemeType}
                                    onChange={(e) => updateRowField(r.id, 'schemeType', e.target.value as GrnSchemeType)}
                                    className="font-semibold text-purple-950 text-xs bg-white border border-purple-300 rounded-md px-2.5 py-1.5 w-full focus:border-purple-500 shadow-xs cursor-pointer"
                                  >
                                    <option value="b2g1">🎁 Buy 2 Get 1 Free (Ratio Scheme)</option>
                                    <option value="free_cases">+ Free Bonus Cases</option>
                                    <option value="discount_percent">% Percentage Discount</option>
                                    <option value="discount_flat">₹ Flat Off / Case</option>
                                    <option value="none">Standard (No Scheme)</option>
                                  </select>

                                  {/* b2g1 Ratio Scheme Inputs */}
                                  {r.schemeType === 'b2g1' && (
                                    <div className="p-2 bg-white border border-purple-200 rounded-md shadow-xs space-y-1.5">
                                      <div className="flex items-center gap-1 text-xs">
                                        <span className="text-purple-800 font-medium">Buy</span>
                                        <input
                                          type="number"
                                          min="1"
                                          value={r.schemeBuyQty ?? 2}
                                          onChange={(e) => updateRowField(r.id, 'schemeBuyQty', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                          className="w-9 font-mono font-bold text-center bg-purple-50 border border-purple-300 rounded px-1 py-0.5 text-xs"
                                        />
                                        <span className="text-purple-800 font-medium">Get</span>
                                        <input
                                          type="number"
                                          min="1"
                                          value={r.schemeFreeQty ?? 1}
                                          onChange={(e) => updateRowField(r.id, 'schemeFreeQty', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                          className="w-9 font-mono font-bold text-center bg-purple-50 border border-purple-300 rounded px-1 py-0.5 text-xs"
                                        />
                                        <span className="text-purple-800 font-medium">Free</span>

                                        <div className="ml-auto flex items-center gap-1">
                                          <span className="text-[10px] text-slate-500 font-medium">Free:</span>
                                          <input
                                            type="number"
                                            min="0"
                                            value={r.freeQty}
                                            onChange={(e) => updateRowField(r.id, 'freeQty', Math.max(0, parseInt(e.target.value, 10) || 0))}
                                            className="w-12 font-mono font-bold text-right bg-emerald-50 border border-emerald-300 text-emerald-800 rounded px-1 py-0.5 text-xs"
                                            title="Free crates"
                                          />
                                        </div>
                                      </div>

                                      {/* Scheme Mode: Locked to Inclusive */}
                                      <div className="flex items-center justify-between gap-1 p-1 bg-purple-50/70 border border-purple-200 rounded text-[10px]">
                                        <span className="text-purple-900 font-semibold shrink-0">Mode:</span>
                                        <select
                                          value="inclusive"
                                          disabled
                                          className="font-bold text-purple-950 text-[10px] bg-white border border-purple-300 rounded px-1 py-0.5 w-full cursor-not-allowed"
                                          title="Inclusive: Free crates are included inside the invoiced case count"
                                        >
                                          <option value="inclusive">Inclusive (50 free out of 150)</option>
                                        </select>
                                      </div>

                                      <div className="flex items-center justify-between text-[10px] font-bold text-purple-900 border-t border-purple-100 pt-1">
                                        <span>Billed {r.qty} ({breakdown.paidQty} paid)</span>
                                        <span className="text-emerald-700 font-mono">Rec {breakdown.totalReceivedQty} cs</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Free cases input */}
                                  {r.schemeType === 'free_cases' && (
                                    <div className="p-1.5 bg-white border border-purple-200 rounded-md shadow-xs space-y-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-purple-800 font-bold">Free:</span>
                                        <input
                                          type="number"
                                          min="0"
                                          value={r.freeQty}
                                          onChange={(e) => updateRowField(r.id, 'freeQty', Math.max(0, parseInt(e.target.value, 10) || 0))}
                                          className="font-mono font-bold text-purple-900 text-xs bg-purple-50 border border-purple-300 rounded px-2 py-0.5 w-16 text-right"
                                        />
                                        <span className="text-xs text-purple-700 font-semibold">crates</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-purple-100 text-[10px]">
                                        <select
                                          value="inclusive"
                                          disabled
                                          className="font-semibold text-purple-950 text-[10px] bg-purple-50 border border-purple-300 rounded px-1 py-0.5 cursor-not-allowed"
                                          title="Inclusive: Free crates are within billed quantity"
                                        >
                                          <option value="inclusive">Within billed (Inclusive)</option>
                                        </select>
                                        <span className="text-emerald-700 font-bold font-mono">
                                          Rec: {breakdown.totalReceivedQty} cs
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Discount percent */}
                                  {r.schemeType === 'discount_percent' && (
                                    <div className="flex items-center gap-1.5 p-1.5 bg-white border border-purple-200 rounded-md shadow-xs">
                                      <span className="text-xs text-purple-800 font-bold">Disc:</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        value={r.discountPercent}
                                        onChange={(e) =>
                                          updateRowField(r.id, 'discountPercent', Math.max(0, parseFloat(e.target.value) || 0))
                                        }
                                        className="font-mono font-bold text-purple-900 text-xs bg-purple-50 border border-purple-300 rounded px-1.5 py-0.5 w-16 text-right"
                                      />
                                      <span className="text-xs text-purple-800 font-bold">%</span>
                                      <span className="text-xs font-mono font-bold text-rose-600 ml-auto">
                                        -₹{money(r.discountAmount)}
                                      </span>
                                    </div>
                                  )}

                                  {/* Discount flat */}
                                  {r.schemeType === 'discount_flat' && (
                                    <div className="flex items-center gap-1.5 p-1.5 bg-white border border-purple-200 rounded-md shadow-xs">
                                      <span className="text-xs text-purple-800 font-bold">Flat:</span>
                                      <span className="text-xs text-purple-800 font-bold">₹</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={r.discountFlat}
                                        onChange={(e) =>
                                          updateRowField(r.id, 'discountFlat', Math.max(0, parseFloat(e.target.value) || 0))
                                        }
                                        className="font-mono font-bold text-purple-900 text-xs bg-purple-50 border border-purple-300 rounded px-1.5 py-0.5 w-16 text-right"
                                      />
                                      <span className="text-[11px] text-purple-700">/case</span>
                                      <span className="text-xs font-mono font-bold text-rose-600 ml-auto">
                                        -₹{money(r.discountAmount)}
                                      </span>
                                    </div>
                                  )}

                                  {/* Scheme Description Note */}
                                  <input
                                    type="text"
                                    placeholder="Scheme note (e.g. Buy 2 Get 1 Free)"
                                    value={r.schemeText}
                                    onChange={(e) => updateRowField(r.id, 'schemeText', e.target.value)}
                                    className="text-[11px] text-slate-700 bg-white border border-purple-200 rounded px-2 py-1 placeholder:text-purple-300"
                                  />
                                </div>
                              </td>

                              {/* INVOICE UNIT RATE (Supplier Billing Rate) */}
                              <td className={`px-4 ${isComfortable ? 'py-3.5' : 'py-2.5'} text-right align-top`}>
                                <div className="flex flex-col items-end gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] text-slate-400 font-medium">Ex-GST:</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={r.unitPrice}
                                      onChange={(e) => updateRowField(r.id, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
                                      className="font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 w-24 text-right focus:border-indigo-500 shadow-xs text-xs"
                                    />
                                  </div>

                                  {/* GST Rate Selector & Separate Amount */}
                                  <div className="flex items-center justify-end gap-1 text-[11px]">
                                    <select
                                      value={`${r.cgstPercent},${r.sgstPercent}`}
                                      onChange={(e) => {
                                        const [cg, sg] = e.target.value.split(',').map(Number);
                                        updateRowField(r.id, 'cgstPercent', cg);
                                        updateRowField(r.id, 'sgstPercent', sg);
                                      }}
                                      className="font-mono text-[10px] bg-slate-50 border border-slate-300 rounded px-1 py-0.5 text-slate-800"
                                    >
                                      <option value="20,20">40% GST</option>
                                      <option value="2.5,2.5">5% GST</option>
                                      <option value="9,9">18% GST</option>
                                      <option value="6,6">12% GST</option>
                                      <option value="0,0">0% GST</option>
                                    </select>
                                    <span className="text-slate-500 font-mono text-[10px]">
                                      +₹{money(breakdown.gstAmountPerCrate)}
                                    </span>
                                  </div>

                                  {/* Invoice Rate Incl. GST */}
                                  <div className="mt-1 pt-1 border-t border-slate-200 w-full text-right">
                                    <div className="font-extrabold text-slate-900 font-mono text-xs">
                                      ₹{money(breakdown.invoiceRateInclGst)} <span className="text-[10px] font-normal text-slate-500">incl GST</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      ₹{money(breakdown.invoiceUnitRateBottleInclGst)} / bottle
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* EFFECTIVE SCHEME RATE */}
                              <td className={`px-4 ${isComfortable ? 'py-3.5' : 'py-2.5'} text-right bg-indigo-50/40 border-x border-indigo-200 align-top`}>
                                <div className="flex flex-col items-end gap-0.5 font-mono">
                                  <span className="text-[10px] text-indigo-700 font-medium">Effective Pre-Tax:</span>
                                  <span className="font-bold text-indigo-950 text-xs">
                                    ₹{money(breakdown.effectiveCostPerCrateExGst)} / cr
                                  </span>

                                  <span className="text-[10px] text-indigo-700 font-medium mt-1">Effective Incl-GST:</span>
                                  <span className="font-extrabold text-indigo-900 text-xs">
                                    ₹{money(breakdown.effectiveCostPerCrateInclGst)} / cr
                                  </span>

                                  <div className="bg-indigo-100/90 text-indigo-950 px-1.5 py-0.5 rounded text-[11px] font-extrabold mt-1">
                                    ₹{money(breakdown.effectiveUnitRateInclGst)} / bottle
                                  </div>
                                  <span className="text-[9px] text-indigo-600 mt-0.5">
                                    Paid {breakdown.paidQty}cs ({r.qty} bld) → Rec {breakdown.totalReceivedQty}cs
                                  </span>
                                </div>
                              </td>

                              {/* INWARD GODOWN COST SHARE */}
                              <td className={`px-3 ${isComfortable ? 'py-3.5' : 'py-2.5'} text-right bg-amber-50/40 align-top`}>
                                <div className="flex flex-col items-end gap-0.5 font-mono">
                                  <span className="font-bold text-amber-900 text-xs">
                                    +₹{money(breakdown.inwardCostPerCrate)}
                                  </span>
                                  <span className="text-[10px] text-amber-700">/ crate</span>
                                  <span className="text-[10px] text-amber-800 mt-1">
                                    +₹{money(breakdown.inwardCostPerCrate / unitsPerCrate)} / btl
                                  </span>
                                </div>
                              </td>

                              {/* FINAL LANDED COST (Post-tax Landed Cost into Godown) */}
                              <td className={`px-4 ${isComfortable ? 'py-3.5' : 'py-2.5'} text-right bg-emerald-50/60 border-x border-emerald-200 align-top`}>
                                <div className="flex flex-col items-end gap-0.5 font-mono">
                                  <div className="font-black text-emerald-900 text-sm">
                                    ₹{money(breakdown.landedCostPerCrate)}
                                  </div>
                                  <span className="text-[10px] text-emerald-700 font-bold">
                                    / crate (incl. inward)
                                  </span>

                                  <div className="bg-emerald-600 text-white px-2 py-0.5 rounded text-xs font-black mt-1 shadow-2xs">
                                    ₹{money(breakdown.landedCostPerUnit)} / unit
                                  </div>

                                  <span className="text-[9px] text-slate-500 mt-0.5">
                                    Pre-tax: ₹{money(breakdown.landedCostPerUnitExGst)}/unit
                                  </span>
                                </div>
                              </td>

                              {/* SELLING & BATCH */}
                              <td className={`px-4 ${isComfortable ? 'py-3.5' : 'py-2.5'} align-top`}>
                                <div className="flex flex-col gap-1.5 text-xs">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-slate-500 text-[11px] font-medium">Line Total:</span>
                                    <span className="font-mono font-bold text-slate-900 text-xs">
                                      ₹{money(breakdown.lineTotal)}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-slate-500 text-[11px] font-medium">Wholesale Rate:</span>
                                    <div className="flex items-center gap-0.5 font-mono">
                                      <span>₹</span>
                                      <input
                                        type="number"
                                        value={r.wholesaleRate}
                                        onChange={(e) => updateRowField(r.id, 'wholesaleRate', parseFloat(e.target.value) || 0)}
                                        className="w-16 px-1.5 py-0.5 border border-slate-300 rounded text-right font-bold text-slate-800 bg-white text-xs"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-slate-500 text-[11px] font-medium">Lot Batch:</span>
                                    <input
                                      type="text"
                                      value={r.batchNumber}
                                      onChange={(e) => updateRowField(r.id, 'batchNumber', e.target.value)}
                                      className="w-24 px-1.5 py-0.5 border border-slate-300 rounded font-mono text-[11px] text-slate-800 bg-white"
                                    />
                                  </div>

                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-slate-500 text-[11px] font-medium">Expiry:</span>
                                    <input
                                      type="date"
                                      value={r.expiry}
                                      onChange={(e) => updateRowField(r.id, 'expiry', e.target.value)}
                                      className="w-24 px-1 py-0.5 border border-slate-300 rounded text-[11px] text-slate-800 bg-white"
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* Actions: Duplicate & Delete */}
                              <td className={`px-2 ${isComfortable ? 'py-3.5' : 'py-2.5'} text-center align-top pt-4`}>
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleDuplicateRow(r.id)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer transition-colors"
                                    title="Duplicate row (useful to split into different batches or lots)"
                                  >
                                    <Copy size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRow(r.id)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                                    title="Delete this item from inward consignment"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* MODAL FOOTER CONFIRMATION BAR */}
            <div className="bg-slate-50 px-3 sm:px-6 py-2 sm:py-2.5 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 shrink-0" style={{ borderColor: palette.line }}>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {hasCasesMismatch ? (
                  <div className="flex items-center gap-1.5 text-xs text-red-700 font-bold bg-red-100 border border-red-300 px-2.5 py-1 rounded">
                    <AlertTriangle size={15} className="text-red-600 shrink-0" />
                    <span>Warning: Total cases mismatch ({totalReceivedQty} received vs {printedTotalCases} printed, {casesDiff > 0 ? `+${casesDiff}` : casesDiff} cs)</span>
                  </div>
                ) : (
                  <>
                    <Info size={14} className="text-indigo-600 shrink-0" />
                    <span className="text-[11px] sm:text-xs leading-tight">
                      Confirming updates stock in <strong>{warehouses.find((w) => w.id === targetWarehouseId)?.name || 'Godown'}</strong>, logs lots, and registers new lines.
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 sm:px-4 py-1.5 border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 rounded cursor-pointer text-xs transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  id="btn-confirm-bulk-inward"
                  onClick={handleConfirmAndPostGrn}
                  className={`flex-1 sm:flex-initial px-4 sm:px-5 py-1.5 font-bold rounded shadow-xs cursor-pointer text-xs flex items-center justify-center gap-1.5 transition-colors ${
                    hasCasesMismatch
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                  }`}
                >
                  {hasCasesMismatch ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                  <span>Confirm & Post ({rows.length} Items • {totalReceivedQty.toLocaleString()} Crates)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* BULK SCHEME / DISCOUNT SUB-MODAL                          */}
        {/* ======================================================== */}
        {showBulkSchemeModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <div className="bg-white rounded-lg p-5 max-w-md w-full border shadow-xl flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Tag size={16} className="text-purple-600" />
                  Apply Scheme / Discount to All Items
                </h3>
                <button
                  onClick={() => setShowBulkSchemeModal(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              <div className="flex flex-col gap-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Scheme Type</label>
                  <select
                    value={bulkSchemeType}
                    onChange={(e) => setBulkSchemeType(e.target.value as GrnSchemeType)}
                    className="w-full border rounded px-2.5 py-1.5 bg-white font-medium"
                  >
                    <option value="discount_percent">Percentage Discount (% Off each item)</option>
                    <option value="discount_flat">Flat Cash Discount (₹ Off per crate)</option>
                    <option value="free_cases">Free Bonus Crates (e.g. +1 per 10 cases)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    {bulkSchemeType === 'discount_percent'
                      ? 'Discount Percentage (%)'
                      : bulkSchemeType === 'discount_flat'
                      ? 'Flat Amount (₹/case)'
                      : 'Free Crates per 10 Billed'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={bulkSchemeType === 'discount_percent' ? '0.5' : '1'}
                    value={bulkSchemeValue}
                    onChange={(e) => setBulkSchemeValue(parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Scheme Name / Label</label>
                  <input
                    type="text"
                    value={bulkSchemeName}
                    onChange={(e) => setBulkSchemeName(e.target.value)}
                    placeholder="e.g. Summer Promo, Dealer Incentive"
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t text-xs">
                <button
                  onClick={() => setShowBulkSchemeModal(false)}
                  className="px-3 py-1.5 border rounded text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyBulkScheme}
                  className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded font-bold"
                >
                  Apply to All {rows.length} Items
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
