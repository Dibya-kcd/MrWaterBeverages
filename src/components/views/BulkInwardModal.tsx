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
import { CategoryKey, GrnImportWarning, GrnLineItem, GrnSchemeMode, GrnSchemeType, Product } from '../../types';
import {
  calculateLandedCostBreakdown,
  generateAutoSku,
  generateBatchNumber,
  money,
  normalizeTo8DigitHsn,
  inferUnitsPerCase,
} from '../../utils/billing';
import {
  ParsedInvoiceData,
  ParsedInvoiceItem,
  parseSpreadsheetInvoice,
  recognizeInvoiceWithAi,
  matchProductCatalog,
  detectCategory,
  detectPack,
  volumeFromName,
  detectPackAndVolume,
} from '../../utils/invoiceParser';
import {
  downloadImportTemplate,
  downloadImportTemplateXlsx,
} from '../../utils/importExport';
import { downloadBulkInwardRowsCsv } from '../../utils/grnCsvExport';
import { InwardProductCard } from '../inward/InwardProductCard';
import { UploadStep } from '../inward/UploadStep';
import { InwardStepIndicator } from '../inward/InwardStepIndicator';
import { todayISO } from "../../utils/dateLocal";

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
  listPrice?: number;
  isGstIncluded?: boolean;
  calculatedGstAmount?: number;
  priceInclGst?: number;

  // Scheme & Discount
  schemeType: GrnSchemeType;
  schemeMode?: GrnSchemeMode;
  schemeBuyQty?: number;
  schemeFreeQty?: number;
  discountPercent: number;
  discountFlat: number;
  discountAmount: number;
  schemeText: string;

  // Supplier Scheme (additive layer — separate from schemeType/freeQty above)
  supplierSchemeId?: string;
  supplierSchemeFreeQty?: number;
  pendingCreditSchemeId?: string;
  pendingCreditExpectedAmount?: number;

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
  const {
    products,
    warehouses,
    remainingStock,
    postGrn,
    palette,
    fz,
    scale,
    supplierSchemes,
    addSupplierSchemeApplication,
    addSupplierCreditNote,
    currentUser,
  } = useLedger();

  // Wizard Step: 'upload' | 'review'
  const [step, setStep] = useState<'upload' | 'review'>('upload');

  // Invoice Header Information
  const [supplierName, setSupplierName] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [invoiceNo, setInvoiceNo] = useState(`INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [inwardDate, setInwardDate] = useState(todayISO());
  const [vehicleNo, setVehicleNo] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [billedTo, setBilledTo] = useState('');
  const [shippedTo, setShippedTo] = useState('');
  const [showProviderDetails, setShowProviderDetails] = useState(false);
  // FIX: no default warehouse. Every inward MUST have the warehouse chosen manually —
  // an empty string forces the "Select warehouse..." placeholder below and blocks
  // Confirm & Post until the user actively picks one (see targetWarehouseId checks in
  // hasCasesMismatch/handleConfirmAndPostGrn and the disabled state on the submit
  // button further down).
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [overallDiscount, setOverallDiscount] = useState<number>(0);
  const [originalInvoiceTotal, setOriginalInvoiceTotal] = useState<number | null>(null);
  const [printedTotalCases, setPrintedTotalCases] = useState<number | null>(null);
  const [showAmountMismatchDetail, setShowAmountMismatchDetail] = useState(false);
  const [catalogPickerRowId, setCatalogPickerRowId] = useState<string | null>(null);
  const [catalogPickerSearch, setCatalogPickerSearch] = useState<string>('');
  const [volumePickerRowId, setVolumePickerRowId] = useState<string | null>(null);
  // "Import with warning" acknowledgement (in-app dialog; window.confirm can be blocked in PWA/iframes)
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [warningNote, setWarningNote] = useState('');

  // Inward-to-Godown Direct Costs (Transport, Freight, Labour, Other)
  const [transportCost, setTransportCost] = useState<number>(0);
  const [freightCost, setFreightCost] = useState<number>(0);
  const [loadingLabourCost, setLoadingLabourCost] = useState<number>(0);
  const [unloadingLabourCost, setUnloadingLabourCost] = useState<number>(0);
  const [otherInwardCost, setOtherInwardCost] = useState<number>(0);
  const [showInwardCostDetails, setShowInwardCostDetails] = useState<boolean>(false);

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

  const [bulkExpiryDate, setBulkExpiryDate] = useState<string>('');

  // Filter in review table
  const [searchQuery, setSearchQuery] = useState('');
  const [filterNewOnly, setFilterNewOnly] = useState(false);
  const [filterSchemeOnly, setFilterSchemeOnly] = useState(false);
  const [filterAttentionOnly, setFilterAttentionOnly] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [showMismatchDetail, setShowMismatchDetail] = useState(false);
  // Notes from the AI cross-checks (row arithmetic, totals, GSTIN ...) shown above the table
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);

  if (!isOpen) return null;

  // Convert ParsedInvoiceData into editable rows
  const loadInvoiceDataIntoReview = (data: ParsedInvoiceData, sourceName: string) => {
    setSupplierName(data.supplierName || '');
    setSupplierGstin(data.supplierGstin || '');
    setSupplierAddress(data.supplierAddress || '');
    setSupplierPhone(data.supplierPhone || '');
    setSupplierEmail(data.supplierEmail || '');
    setInvoiceNo(data.invoiceNo || `INV-${new Date().getFullYear()}-001`);
    setInwardDate(data.invoiceDate || todayISO());
    setVehicleNo(data.vehicleNo || '');
    setPlaceOfSupply(data.placeOfSupply || '');
    setBilledTo(data.billedTo || '');
    setShippedTo(data.shippedTo || '');
    setOverallDiscount(data.overallDiscount || 0);
    setOriginalInvoiceTotal(data.grandTotal || null);
    setPrintedTotalCases(
      data.totalCases && data.totalCases > 0
        ? data.totalCases
        : data.items.reduce((s, it) => s + (Number(it.qty) || 0), 0)
    );
    setDetectedSource(data.detectedSource);
    setAiWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    setFileName(sourceName);

    const mappedRows: EditableInwardRow[] = data.items.map((item, idx) => {
      // Re-verify against live catalog to be 100% accurate (checking rawName first, then productName fallback)
      let matchRes = matchProductCatalog(item.rawName || '', products);
      if (!matchRes.matchedProduct && item.productName && item.productName.trim() !== (item.rawName || '').trim()) {
        const alt = matchProductCatalog(item.productName, products);
        if (alt.matchedProduct) matchRes = alt;
      }
      const { isNewProduct, matchedProduct } = matchRes;

      const qty = Math.max(1, item.qty || 1);
      // never invent a price: 0 is flagged in the review table so the user types the real one
      const unitPrice = Math.max(0, item.unitPrice || 0);
      const volume = matchedProduct?.volume || item.volume || 150;
      const pack = matchedProduct?.pack || item.pack || 'PET';
      const unitsPerCrate = item.unitsPerCrate || inferUnitsPerCase(`${item.rawName || ''} ${item.pack || ''}`, volume);
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
        productName: (matchedProduct ? matchedProduct.name : item.productName || item.rawName).trim().toUpperCase(),
        category: matchedProduct?.category || item.category || detectCategory(item.rawName),
        pack,
        volume,
        packSize,
        unitsPerCrate,
        hsn: normalizeTo8DigitHsn(matchedProduct?.hsn || item.hsn, matchedProduct?.category || item.category, item.rawName),
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
        listPrice: item.listPrice !== undefined ? item.listPrice : item.unitPrice,
        isGstIncluded: item.isGstIncluded ?? false,
        calculatedGstAmount: item.calculatedGstAmount !== undefined ? item.calculatedGstAmount : (item.unitPrice * ((item.cgstPercent ?? 20) + (item.sgstPercent ?? 20)) / 100),
        priceInclGst: item.priceInclGst !== undefined ? item.priceInclGst : (item.unitPrice * (1 + ((item.cgstPercent ?? 20) + (item.sgstPercent ?? 20)) / 100)),
        batchNumber: (() => {
          const existingBatches = products.map((p) => p.batchNumber).filter(Boolean) as string[];
          const isOldBatch = item.batchNumber ? existingBatches.includes(item.batchNumber) : false;
          return (!item.batchNumber || isOldBatch)
            ? generateBatchNumber(matchedProduct ? matchedProduct.name : item.productName || item.rawName, undefined, existingBatches, idx, data.invoiceDate || inwardDate)
            : item.batchNumber;
        })(),
        expiry: item.expiryDate || '',
        mfgDate: item.mfgDate || todayISO(),
        isNewProduct,
        matchedProductId: matchedProduct?.id,
        matchedProductName: matchedProduct?.name,
        existingStock: matchedProduct ? remainingStock(matchedProduct.id) : undefined,
      };
    });

    setRows(mappedRows);
    setStep('review');
  };

  // Process uploaded files (Excel, CSV, PDF, Image)
  const processUploadedFile = async (file: File) => {
    setParseError(null);
    setAiWarnings([]);
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
              ? `${aiErr.message || 'Google Gemini is temporarily unavailable.'} You can click "Retry AI Vision", or open the review table and enter the lines manually.`
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
        let unitPrice = Math.max(0, Number(field === 'unitPrice' ? val : updated.unitPrice) || 0);
        let listPrice = updated.listPrice !== undefined ? Number(updated.listPrice) : Number(updated.unitPrice) || 0;
        let isGstIncluded = updated.isGstIncluded !== undefined ? Boolean(updated.isGstIncluded) : false;
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

        if (field === 'volume') {
          const vol = Math.max(50, Number(val) || 250);
          updated.volume = vol;
          updated.packSize = `${vol}ml ${updated.pack || 'PET'}`;
          updated.unitsPerCrate = inferUnitsPerCase(`${updated.productName} ${updated.pack || ''}`, vol);
        } else if (field === 'pack') {
          const pk = String(val);
          updated.pack = pk;
          updated.packSize = `${updated.volume || 250}ml ${pk}`;
          updated.unitsPerCrate = inferUnitsPerCase(`${updated.productName} ${pk}`, updated.volume);
        } else if (field === 'productName') {
          const newName = String(val).toUpperCase();
          updated.productName = newName;
          const matchRes = matchProductCatalog(newName, products);
          if (matchRes.matchedProduct) {
            const mp = matchRes.matchedProduct;
            updated.matchedProductId = mp.id;
            updated.matchedProductName = mp.name;
            updated.isNewProduct = false;
            updated.volume = mp.volume || updated.volume;
            updated.pack = mp.pack || updated.pack;
            updated.category = mp.category || updated.category;
            updated.hsn = mp.hsn || updated.hsn;
            updated.unitsPerCrate = mp.unitsPerCrate || inferUnitsPerCase(mp.name, mp.volume);
            updated.packSize = mp.packSize || `${mp.volume}ml ${mp.pack}`;
            updated.existingStock = remainingStock(mp.id);
            if (mp.wholesale) updated.wholesaleRate = mp.wholesale;
            if (mp.retail) updated.retailRate = mp.retail;
          } else {
            const detectedPackVol = detectPackAndVolume(newName);
            if (detectedPackVol.volume) {
              updated.volume = detectedPackVol.volume;
              updated.pack = detectedPackVol.pack;
              updated.packSize = `${detectedPackVol.volume}ml ${detectedPackVol.pack}`;
              updated.unitsPerCrate = inferUnitsPerCase(newName, detectedPackVol.volume);
            }
          }
        }

        if (field === 'listPrice') {
          listPrice = Math.max(0, Number(val) || 0);
          updated.listPrice = listPrice;
        } else if (field === 'isGstIncluded') {
          isGstIncluded = Boolean(val);
          updated.isGstIncluded = isGstIncluded;
        }

        const totalTaxRate = (cgstPercent + sgstPercent) / 100;
        let calculatedGst = 0;
        let priceInclGst = listPrice;

        if (!isGstIncluded) {
          // List price excludes GST -> calculate GST and add
          calculatedGst = listPrice * totalTaxRate;
          priceInclGst = listPrice + calculatedGst;
          unitPrice = listPrice;
        } else {
          // List price includes GST -> extract base taxable rate
          unitPrice = totalTaxRate > 0 ? listPrice / (1 + totalTaxRate) : listPrice;
          calculatedGst = listPrice - unitPrice;
          priceInclGst = listPrice;
        }

        updated.listPrice = listPrice;
        updated.isGstIncluded = isGstIncluded;
        updated.calculatedGstAmount = calculatedGst;
        updated.priceInclGst = priceInclGst;
        updated.unitPrice = unitPrice;

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
          field === 'listPrice' ||
          field === 'isGstIncluded' ||
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
            productName: matched.name.toUpperCase(),
            isNewProduct: false,
            matchedProductId: matched.id,
            matchedProductName: matched.name.toUpperCase(),
            existingStock: remainingStock(matched.id),
            category: matched.category,
            pack: matched.pack,
            volume: matched.volume,
            packSize: matched.packSize || `${matched.volume}ml ${matched.pack}`,
            unitsPerCrate: matched.unitsPerCrate || inferUnitsPerCase(matched.name, matched.volume),
            hsn: normalizeTo8DigitHsn(matched.hsn || r.hsn, matched.category, matched.name),
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

  // Duplicate an existing row with auto-generated fresh unique batch
  const handleDuplicateRow = (rowId: string) => {
    const target = rows.find((r) => r.id === rowId);
    if (!target) return;
    const existingBatches = [
      ...products.map((p) => p.batchNumber).filter(Boolean),
      ...rows.map((r) => r.batchNumber).filter(Boolean),
    ] as string[];
    const duplicated: EditableInwardRow = {
      ...target,
      id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      batchNumber: generateBatchNumber(target.productName, undefined, existingBatches, undefined, inwardDate),
    };
    const targetIndex = rows.findIndex((r) => r.id === rowId);
    const updated = [...rows];
    updated.splice(targetIndex + 1, 0, duplicated);
    setRows(updated);
  };

  // Start with manual blank consignment (with fresh batch)
  const handleStartBlankConsignment = () => {
    setAiWarnings([]);
    setFileName('Manual Inward Entry');
    setDetectedSource('manual');
    const existingBatches = products.map((p) => p.batchNumber).filter(Boolean) as string[];
    const firstProd = products[0];
    const unitPrice = 158.57;
    const cgstPercent = 20;
    const sgstPercent = 20;
    const totalTaxRate = (cgstPercent + sgstPercent) / 100;
    const calculatedGst = unitPrice * totalTaxRate;

    setRows([
      {
        id: `manual_row_${Date.now()}`,
        rawName: firstProd ? firstProd.name : 'CAMPA POWER UP 150ML PET',
        productName: firstProd ? firstProd.name : 'Campa Power Up 150ml PET',
        category: firstProd?.category || 'energy',
        pack: firstProd?.pack || 'PET',
        volume: firstProd?.volume || 150,
        hsn: normalizeTo8DigitHsn(firstProd?.hsn, firstProd?.category, firstProd?.name),
        qty: 50,
        freeQty: 0,
        unitPrice,
        listPrice: unitPrice,
        isGstIncluded: false,
        calculatedGstAmount: calculatedGst,
        priceInclGst: unitPrice + calculatedGst,
        schemeType: 'none',
        discountPercent: 0,
        discountFlat: 0,
        discountAmount: 0,
        schemeText: '',
        cgstPercent,
        sgstPercent,
        wholesaleRate: firstProd?.wholesale || 180,
        retailRate: firstProd?.retail || 200,
        batchNumber: generateBatchNumber(firstProd ? firstProd.name : 'CAMPA', undefined, existingBatches, 0, inwardDate),
        expiry: '',
        mfgDate: todayISO(),
        isNewProduct: !firstProd,
        matchedProductId: firstProd?.id,
        matchedProductName: firstProd?.name,
        existingStock: firstProd ? remainingStock(firstProd.id) : undefined,
      },
    ]);
    setStep('review');
  };

  // Add new empty row with fresh auto-generated batch
  const handleAddNewRow = () => {
    const existingBatches = [
      ...products.map((p) => p.batchNumber).filter(Boolean),
      ...rows.map((r) => r.batchNumber).filter(Boolean),
    ] as string[];
    const newId = `manual_row_${Date.now()}`;
    const unitPrice = 158.57;
    const cgstPercent = 20;
    const sgstPercent = 20;
    const totalTaxRate = (cgstPercent + sgstPercent) / 100;
    const calculatedGst = unitPrice * totalTaxRate;

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
      unitPrice,
      listPrice: unitPrice,
      isGstIncluded: false,
      calculatedGstAmount: calculatedGst,
      priceInclGst: unitPrice + calculatedGst,
      schemeType: 'none',
      discountPercent: 0,
      discountFlat: 0,
      discountAmount: 0,
      schemeText: '',
      cgstPercent,
      sgstPercent,
      wholesaleRate: 180,
      retailRate: 200,
      batchNumber: generateBatchNumber('NEW BEVERAGE', undefined, existingBatches, rows.length, inwardDate),
      expiry: '',
      mfgDate: todayISO(),
      isNewProduct: true,
    };
    setRows((prev) => [...prev, newRow]);
  };

  // Auto-generate fresh unique batch/tag numbers for all products inwards (never use old one)
  const handleAutoGenerateAllBatches = () => {
    const existingBatches = products.map((p) => p.batchNumber).filter(Boolean) as string[];
    const usedInConsignment: string[] = [];
    setRows((prev) =>
      prev.map((r, i) => {
        const fresh = generateBatchNumber(
          r.productName || r.rawName,
          undefined,
          [...existingBatches, ...usedInConsignment],
          i,
          inwardDate
        );
        usedInConsignment.push(fresh);
        return { ...r, batchNumber: fresh };
      })
    );
  };

  // Bulk toggle list price GST inclusion and recalculate
  const handleBulkSetListPriceGst = (isIncluded: boolean) => {
    setRows((prev) =>
      prev.map((r) => {
        const listP = r.listPrice !== undefined ? r.listPrice : r.unitPrice;
        const totalGstRate = (r.cgstPercent + r.sgstPercent) / 100;
        let unitPrice = listP;
        let calculatedGst = 0;
        let priceInclGst = listP;

        if (!isIncluded) {
          calculatedGst = listP * totalGstRate;
          priceInclGst = listP + calculatedGst;
          unitPrice = listP;
        } else {
          unitPrice = totalGstRate > 0 ? listP / (1 + totalGstRate) : listP;
          calculatedGst = listP - unitPrice;
          priceInclGst = listP;
        }

        const b = calculateLandedCostBreakdown({
          qty: r.qty,
          unitPrice,
          unitsPerCrate: r.unitsPerCrate || 24,
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
          ...r,
          listPrice: listP,
          isGstIncluded: isIncluded,
          calculatedGstAmount: calculatedGst,
          priceInclGst,
          unitPrice,
          freeQty: b.freeQty,
          paidQty: b.paidQty,
          discountAmount: b.discountAmount,
          schemeText: b.schemeLabel,
        };
      })
    );
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
  // Hard-locked: In FMCG beverage distribution, the invoiced crate count (r.qty) is
  // strictly the total physical crates received for that line (inclusive of free
  // scheme crates already printed on the invoice) — schemeMode is locked to
  // 'inclusive' throughout this modal, so r.qty is never added to r.freeQty.
  //
  // FIX: this previously summed ONLY r.qty, silently dropping any named "Supplier
  // Scheme" bonus crates (r.supplierSchemeFreeQty — a genuinely separate, off-invoice
  // bonus, unlike r.freeQty which is already inside r.qty). That under-count then fed
  // straight into the posted GRN's header totalReceivedQty AND the inward-cost-per-
  // crate allocation, so both silently diverged from the real quantity actually added
  // to inventory (see item.totalReceivedQty + supplierSchemeFreeQty in postGrn). Kept
  // as two figures: the invoice-equivalent total (what should match the printed
  // invoice, for the mismatch check) and the true received total (what's actually
  // posted to stock, cost-allocated, and shown as the working total below).
  const totalInvoicePrintedQty = totalBilledQty;
  const totalSupplierSchemeBonusQty = rows.reduce(
    (s, r) => s + (r.supplierSchemeId ? Number(r.supplierSchemeFreeQty) || 0 : 0),
    0
  );
  const totalReceivedQty = totalInvoicePrintedQty + totalSupplierSchemeBonusQty;
  const totalPaidQty = rows.reduce(
    (s, r) => s + Math.max(0, (Number(r.qty) || 0) - (Number(r.freeQty) || 0)),
    0
  );

  // Total Cases Mismatch Detection: Working table (as printed on the invoice, i.e.
  // EXCLUDING any off-invoice Supplier Scheme bonus) vs Invoice printed cases. A
  // Supplier Scheme bonus is expected to sit outside the printed count, so it must
  // never be included on this side of the comparison or every bonus-scheme GRN would
  // wrongly show a "mismatch".
  const hasCasesMismatch =
    printedTotalCases !== null && printedTotalCases > 0 && totalInvoicePrintedQty !== printedTotalCases;
  const casesDiff = printedTotalCases !== null ? totalInvoicePrintedQty - printedTotalCases : 0;

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
  // Step 1: button click. Warnings never block the import; they ask for an acknowledgement
  // (with an optional note) and are then stored on the GRN for future tracking.
  const handleConfirmAndPostGrn = () => {
    if (rows.length === 0) {
      setParseError('Please ensure there is at least 1 product line to inward.');
      return;
    }
    // FIX: warehouse selection is mandatory and manual, no default. This is the
    // primary guard; postGrn() itself also hard-validates this (and batch/expiry per
    // line) as a second line of defense so an invalid inward can never slip through
    // even from a future caller.
    if (!targetWarehouseId) {
      setParseError('Select the warehouse this invoice is being received into before confirming — there is no default.');
      return;
    }
    if (hasCasesMismatch) {
      setShowWarningDialog(true);
      return;
    }
    postConsignment([]);
  };

  // Step 2: user chose "Import with warning"
  const handleImportWithWarning = () => {
    const warnings: GrnImportWarning[] = [];
    if (hasCasesMismatch) {
      warnings.push({
        id: 'iw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        type: 'cases_mismatch',
        message: `Total cases mismatch: invoice printed ${printedTotalCases} cs vs imported ${totalReceivedQty} cs (${casesDiff > 0 ? `+${casesDiff}` : casesDiff} cs)`,
        expected: printedTotalCases ?? undefined,
        actual: totalReceivedQty,
        difference: casesDiff,
        note: warningNote.trim() || undefined,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: currentUser?.name || 'Admin',
        resolved: false,
      });
    }
    setShowWarningDialog(false);
    setWarningNote('');
    postConsignment(warnings);
  };

  const postConsignment = (importWarnings: GrnImportWarning[]) => {
    // Convert rows to GrnLineItem format using the unified landed cost engine
    const items: GrnLineItem[] = rows.map((r, idx) => {
      const unitsPerCrate = r.unitsPerCrate || inferUnitsPerCase(`${r.productName || ''} ${r.rawName || ''} ${r.pack || ''}`, r.volume);
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
        productName: r.productName.trim().toUpperCase(),
        category: r.category,
        sku: generateAutoSku(r.productName, r.category, idx + 100),
        hsn: normalizeTo8DigitHsn(r.hsn, r.category, r.productName),
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
        landedCostPerCrate: breakdown.landedCostPerCrate,
        landedCostPerCrateExGst: breakdown.landedCostPerCrateExGst,
        landedCostPerUnit: breakdown.landedCostPerUnit,
        effectiveCostPerUnit: breakdown.effectiveCostPerCrateExGst,
        inwardCostPerCrate: breakdown.inwardCostPerCrate,
        finalLandedCostPerUnit: breakdown.landedCostPerUnit,
        expiry: r.expiry,
        mfgDate: r.mfgDate,
        batchNumber: r.batchNumber,
        wholesaleRate: r.wholesaleRate,
        retailRate: r.retailRate,
        notes: r.isNewProduct ? 'Auto-created new product line from inward bill' : undefined,
        supplierSchemeId: r.supplierSchemeId,
        supplierSchemeFreeQty: r.supplierSchemeId ? r.supplierSchemeFreeQty || 0 : undefined,
        pendingCreditSchemeId: r.pendingCreditSchemeId,
        pendingCreditEligibleQty: r.pendingCreditSchemeId ? breakdown.paidQty : undefined,
        pendingCreditExpectedAmount: r.pendingCreditSchemeId ? r.pendingCreditExpectedAmount || 0 : undefined,
      };
    });

    const targetWhObj = warehouses.find((w) => w.id === targetWarehouseId);

    let createdGrn;
    try {
      createdGrn = postGrn({
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
      importWarnings: importWarnings.length > 0 ? importWarnings : undefined,
      totalBilledQty,
      totalFreeQty,
      totalPaidQty,
      totalReceivedQty,
      totalTaxable,
      totalCgst,
      totalSgst,
      totalTax,
      grandTotal: calculatedGrandTotal,
      overallDiscount: overallDiscount || 0,
      totalLineDiscount: totalItemDiscounts || 0,
      subtotalBeforeDiscount: totalGross + totalTax,
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
    } catch (err: any) {
      // GrnValidationError from postGrn (missing/invalid warehouse, missing batch
      // number or expiry on a line, duplicate invoice number, etc.) — surface every
      // issue to the user instead of silently failing or letting bad stock through.
      const issues = err?.issues as { message: string }[] | undefined;
      setParseError(
        issues && issues.length > 0
          ? `Could not post this invoice:\n${issues.map((i) => `• ${i.message}`).join('\n')}`
          : err?.message || 'Failed to post GRN.'
      );
      return;
    }

    // Supplier Scheme traceability: one application record per GRN line that was
    // attached to a Type A (free_goods) or Type B (pending_credit) scheme, plus an
    // auto-created "Pending Credit Note" for Type B, so it shows up immediately in the
    // Supplier Schemes view. The original GRN/invoice above is never touched by this.
    createdGrn.items.forEach((item) => {
      if (item.supplierSchemeId && item.supplierSchemeFreeQty && item.supplierSchemeFreeQty > 0) {
        addSupplierSchemeApplication({
          schemeId: item.supplierSchemeId,
          schemeType: 'free_goods',
          grnId: createdGrn.id,
          grnLineId: item.id,
          productId: item.productId || 0,
          supplierName: createdGrn.supplierName,
          supplierInvoiceNo: createdGrn.invoiceNo,
          eligibleQuantity: item.paidQty,
          freeQuantity: item.supplierSchemeFreeQty,
          expectedBenefit: 0,
          warehouseId: createdGrn.warehouseId,
        });
      }
      if (item.pendingCreditSchemeId && item.pendingCreditExpectedAmount && item.pendingCreditExpectedAmount > 0) {
        addSupplierSchemeApplication({
          schemeId: item.pendingCreditSchemeId,
          schemeType: 'pending_credit',
          grnId: createdGrn.id,
          grnLineId: item.id,
          productId: item.productId || 0,
          supplierName: createdGrn.supplierName,
          supplierInvoiceNo: createdGrn.invoiceNo,
          eligibleQuantity: item.pendingCreditEligibleQty || 0,
          freeQuantity: 0,
          expectedBenefit: item.pendingCreditExpectedAmount,
          warehouseId: createdGrn.warehouseId,
        });
        addSupplierCreditNote({
          supplierName: createdGrn.supplierName,
          schemeId: item.pendingCreditSchemeId,
          grnId: createdGrn.id,
          productId: item.productId,
          expectedAmount: item.pendingCreditExpectedAmount,
          actualAmount: 0,
          notes: `Auto-created from GRN ${createdGrn.grnNumber} · ${item.productName}`,
        });
      }
    });

    if (onSuccess) {
      onSuccess(createdGrn.grnNumber, items.length);
    }
  };

  const itemsWithSchemeCount = rows.filter(
    (r) => r.schemeType !== 'none' || r.freeQty > 0 || r.discountAmount > 0
  ).length;

  // Review helpers: lines that still need a human look (no expiry date / zero rate)
  const needsAttention = (r: EditableInwardRow) =>
    !r.expiry || !(r.batchNumber || '').trim() || !(Number(r.unitPrice) > 0);
  const attentionCount = rows.filter(needsAttention).length;
  const missingExpiryCount = rows.filter((r) => !r.expiry).length;
  const missingBatchCount = rows.filter((r) => !(r.batchNumber || '').trim()).length;
  // Informational only — never blocks posting (the cases mismatch is the only warning flow)
  const amountDiff = originalInvoiceTotal !== null ? calculatedGrandTotal - originalInvoiceTotal : 0;
  const hasAmountMismatch = originalInvoiceTotal !== null && Math.abs(amountDiff) >= 1;
  // Fill ONLY the empty expiry cells with the chosen date (never overwrites typed values)
  const handleFillEmptyExpiry = () => {
    if (!bulkExpiryDate) return;
    setRows((prev) => prev.map((r) => (r.expiry ? r : { ...r, expiry: bulkExpiryDate })));
  };

  // Filtered rows for review table
  const filteredRows = rows.filter((r) => {
    if (filterNewOnly && !r.isNewProduct) return false;
    if (filterSchemeOnly && r.schemeType === 'none' && r.freeQty === 0 && r.discountAmount === 0) return false;
    if (filterAttentionOnly && !needsAttention(r)) return false;
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
          ? 'fixed inset-0 z-50 flex flex-col bg-[#faf8f5] overflow-hidden'
          : 'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-3 bg-slate-900/40 overflow-hidden'
      }
    >
      <div
        className={
          isMaximized
            ? 'w-full h-full flex flex-col overflow-hidden bg-[#faf8f5]'
            : 'bg-[#faf8f5] w-full max-w-[99vw] xl:max-w-[98vw] 2xl:max-w-[1850px] h-[96vh] sm:h-[96vh] max-h-[96vh] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-black/5 flex flex-col overflow-hidden'
        }
      >
        {/* MODAL HEADER — Crate style */}
        <div
          className={`flex items-center justify-between px-3 sm:px-5 border-b border-black/5 bg-[#faf8f5] shrink-0 ${
            step === 'review' ? 'py-2.5 sm:py-3' : 'py-3'
          }`}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="p-1.5 bg-[#ebe8e1] text-[#0d4a3a] rounded-xl shrink-0">
              <Boxes size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <InwardStepIndicator step={step} />
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  {step === 'upload' ? 'Bulk purchase import' : 'Review purchase'}
                </h2>
                {step === 'upload' ? (
                  <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-white border border-black/8 text-slate-600">
                    Excel · CSV · PDF · Image
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[#ebe8e1] text-[#0d4a3a] shrink-0">
                    {rows.length} {rows.length === 1 ? 'product' : 'products'} · {totalReceivedQty} cs
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
                  Upload supplier invoice — products, qty, schemes & taxes extracted
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
          <div className="mx-3 sm:mx-6 mt-3 sm:mt-4 p-3.5 sm:p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg flex items-start gap-3 text-xs shadow-sm">
            <AlertCircle size={18} className="text-rose-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold block text-xs sm:text-sm text-rose-900">{parseError}</span>
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {lastUploadedFile && (
                  <button
                    onClick={() => processUploadedFile(lastUploadedFile)}
                    disabled={isParsing}
                    className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-md text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isParsing ? "animate-spin" : ""} />
                    Retry AI Vision ({lastUploadedFile.name})
                  </button>
                )}
                <button
                  onClick={handleStartBlankConsignment}
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-md text-xs flex items-center gap-1.5 cursor-pointer border border-slate-300 shadow-sm transition-colors"
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
          <UploadStep
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            fileInputRef={fileInputRef}
            processUploadedFile={processUploadedFile}
            isParsing={isParsing}
            parsingStatus={parsingStatus}
            handleDownloadCsvSample={handleDownloadCsvSample}
            handleDownloadSample={handleDownloadSample}
            handleStartBlankConsignment={handleStartBlankConsignment}
          />
        )}

        {/* ======================================================== */}
        {/* STEP 2: FULL REVIEW & EDIT WORKSPACE                      */}
        {/* ======================================================== */}
        {step === 'review' && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* ======================================================== */}
            {/* UPPER DETAILS: CONTRACTED STRIP VS EXPANDED CONTROLS     */}
            {/* ======================================================== */}

            {/* ======================================================== */}
            {/* REVIEW STATUS BAR — identity + live discrepancy checks   */}
            {/* One compact row that is ALWAYS visible; replaces the big  */}
            {/* red banner, the KPI strip and the amber costs banner.    */}
            {/* ======================================================== */}
            <div
              className="bg-slate-900 text-white px-3 sm:px-4 py-1.5 border-b flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs shrink-0"
              style={{ borderColor: palette.line }}
            >
              {/* Identity (click to open bill details) */}
              <button
                type="button"
                onClick={() => setIsUpperDetailsExpanded((prev) => !prev)}
                className="flex items-center gap-2 min-w-0 text-left cursor-pointer hover:text-indigo-200 transition-colors"
                title="Click to edit supplier, invoice, vehicle, taxes & godown"
              >
                <Building2 size={14} className="text-indigo-400 shrink-0" />
                <span className="font-bold truncate max-w-[140px] sm:max-w-[220px]" title={supplierName}>
                  {supplierName || 'Supplier'}
                </span>
                <span className="font-mono text-indigo-300 text-[11px] font-semibold shrink-0">#{invoiceNo || 'N/A'}</span>
                <span className="hidden md:inline text-slate-400 text-[11px] shrink-0">{inwardDate}</span>
                {isUpperDetailsExpanded ? (
                  <ChevronUp size={12} className="text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown size={12} className="text-slate-400 shrink-0" />
                )}
              </button>

              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${
                  targetWarehouseId
                    ? 'bg-slate-800 text-indigo-200 border-slate-700'
                    : 'bg-rose-600 text-white border-rose-400 animate-pulse'
                }`}
              >
                {targetWarehouseId
                  ? warehouses.find((w) => w.id === targetWarehouseId)?.name || 'Godown'
                  : 'Pick godown ▸ open bill details'}
              </span>

              <span className="hidden sm:block h-5 w-px bg-slate-700" />

              {/* Live discrepancy checks */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Cases check */}
                <button
                  type="button"
                  onClick={() => hasCasesMismatch && setShowMismatchDetail((v) => !v)}
                  className={`px-2 py-0.5 rounded border font-semibold flex items-center gap-1 text-[11px] ${
                    hasCasesMismatch
                      ? 'bg-red-600 border-red-300 text-white cursor-pointer hover:bg-red-500'
                      : 'bg-emerald-900/50 border-emerald-700 text-emerald-200 cursor-default'
                  }`}
                  title={
                    hasCasesMismatch
                      ? 'Click for details'
                      : printedTotalCases !== null
                      ? 'Table total matches the printed invoice case count'
                      : 'No printed case count was detected on the invoice'
                  }
                >
                  {hasCasesMismatch ? <AlertTriangle size={12} className="text-amber-200" /> : <Check size={12} />}
                  <span>
                    Cases <strong className="font-mono">{totalInvoicePrintedQty.toLocaleString()}</strong>
                    {printedTotalCases !== null && (
                      <>
                        {' '}
                        {hasCasesMismatch ? 'vs printed' : '= printed'}{' '}
                        <strong className="font-mono">{printedTotalCases.toLocaleString()}</strong>
                      </>
                    )}
                  </span>
                  {hasCasesMismatch && (
                    <span className="font-mono font-black bg-red-950 px-1 rounded">
                      {casesDiff > 0 ? `+${casesDiff}` : casesDiff}
                    </span>
                  )}
                  {totalSupplierSchemeBonusQty > 0 && (
                    <span className="text-[10px] font-normal opacity-80">(+{totalSupplierSchemeBonusQty} bonus)</span>
                  )}
                </button>

                {/* Amount check (informational only with interactive resolution helper) */}
                {originalInvoiceTotal !== null && (
                  <button
                    type="button"
                    onClick={() => setShowAmountMismatchDetail((v) => !v)}
                    className={`px-2 py-0.5 rounded border font-semibold flex items-center gap-1 text-[11px] cursor-pointer transition-colors ${
                      hasAmountMismatch
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 hover:bg-amber-500/30'
                        : 'bg-emerald-900/50 border-emerald-700 text-emerald-200'
                    }`}
                    title={`Calculated ₹${money(calculatedGrandTotal)} vs party invoice ₹${money(originalInvoiceTotal)}. Click for breakdown & 1-click fix.`}
                  >
                    {hasAmountMismatch ? <AlertTriangle size={12} /> : <Check size={12} />}
                    <span>
                      Amount{' '}
                      {hasAmountMismatch ? (
                        <>
                          <strong className="font-mono">{amountDiff > 0 ? '+' : '−'}₹{money(Math.abs(amountDiff))}</strong> vs party
                        </>
                      ) : (
                        'matches party'
                      )}
                    </span>
                  </button>
                )}

                {/* Needs attention (missing batch / missing expiry / zero rate) */}
                {attentionCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterAttentionOnly((v) => !v);
                      setFilterNewOnly(false);
                      setFilterSchemeOnly(false);
                    }}
                    className={`px-2 py-0.5 rounded border font-semibold flex items-center gap-1 text-[11px] cursor-pointer ${
                      filterAttentionOnly
                        ? 'bg-amber-400 border-amber-200 text-slate-900'
                        : 'bg-amber-500/20 border-amber-400 text-amber-200 hover:bg-amber-500/30'
                    }`}
                    title="Lines with a missing batch number, missing expiry date or a zero rate — click to show only these"
                  >
                    <AlertCircle size={12} />
                    <span>
                      {attentionCount} need{attentionCount === 1 ? 's' : ''} attention
                      {missingExpiryCount > 0 && ` (${missingExpiryCount} no expiry)`}
                      {missingBatchCount > 0 && ` (${missingBatchCount} no batch)`}
                    </span>
                  </button>
                )}
              </div>

              {/* Right side: totals + costs toggle */}
              <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
                <span className="hidden md:inline text-slate-300 text-[11px] font-mono">
                  <strong className="text-white">{rows.length}</strong> items •{' '}
                  <strong className="text-emerald-300">{totalReceivedQty.toLocaleString()}</strong> cs
                </span>

                <button
                  type="button"
                  onClick={() => setShowInwardCostDetails((v) => !v)}
                  className={`px-2 py-0.5 rounded border text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                    showInwardCostDetails
                      ? 'bg-amber-400 border-amber-200 text-slate-900'
                      : 'bg-slate-800 border-slate-600 text-amber-200 hover:bg-slate-700'
                  }`}
                  title="Transport, freight & labour costs allocated to landed cost"
                >
                  <Truck size={12} />
                  <span className="font-mono">
                    {totalInwardCost > 0 ? `₹${money(totalInwardCost)}` : 'Inward costs'}
                  </span>
                  {showInwardCostDetails ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>

                <div className="bg-indigo-950 px-2.5 py-0.5 rounded border border-indigo-700/60 flex items-center gap-1">
                  <span className="text-indigo-300 text-[10px] uppercase font-bold">Total</span>
                  <span className="font-extrabold text-amber-300 text-xs sm:text-sm font-mono">
                    ₹{money(calculatedGrandTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* AI cross-check notes (row arithmetic, totals, GSTIN ...) */}
            {aiWarnings.length > 0 && (
              <details className="bg-amber-50 border-b border-amber-300 px-3 sm:px-4 py-1.5 text-[11px] text-amber-900 shrink-0 group">
                <summary className="flex items-center gap-2 cursor-pointer select-none font-semibold list-none">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span>
                    AI read this invoice but {aiWarnings.length} point{aiWarnings.length === 1 ? '' : 's'} need
                    {aiWarnings.length === 1 ? 's' : ''} a quick check
                  </span>
                  <span className="ml-auto text-amber-700 font-normal group-open:hidden">show</span>
                  <span className="ml-auto text-amber-700 font-normal hidden group-open:inline">hide</span>
                </summary>
                <ul className="mt-1.5 mb-0.5 ml-6 list-disc space-y-0.5 leading-snug max-h-32 overflow-y-auto pr-2">
                  {aiWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}

            {/* Cases mismatch detail (only when the red chip is clicked) */}
            {hasCasesMismatch && showMismatchDetail && (
              <div className="bg-red-50 border-b-2 border-red-400 px-3 sm:px-4 py-1.5 text-[11px] text-red-900 flex items-start gap-2 shrink-0">
                <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
                <p className="flex-1 leading-snug">
                  <strong>Cases mismatch ({casesDiff > 0 ? `+${casesDiff}` : casesDiff}):</strong> the table's
                  invoice-equivalent total is <strong>{totalInvoicePrintedQty.toLocaleString()} cs</strong> but the
                  supplier invoice printed <strong>{printedTotalCases?.toLocaleString()} cs</strong>. The printed count
                  is the total crates physically received, including free scheme crates already billed — verify line
                  quantities and scheme free counts.
                </p>
                <button
                  type="button"
                  onClick={() => setShowMismatchDetail(false)}
                  className="text-red-500 hover:text-red-800 font-bold px-1 cursor-pointer"
                  title="Hide details"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Amount mismatch detail & 1-click resolution */}
            {hasAmountMismatch && showAmountMismatchDetail && originalInvoiceTotal !== null && (
              <div className="bg-amber-50 border-b-2 border-amber-400 px-3 sm:px-4 py-2 text-xs text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shrink-0">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    <p className="font-bold">
                      Amount Mismatch: Rows add up to ₹{money(calculatedGrandTotal)} but party invoice total is ₹{money(originalInvoiceTotal)} (difference ₹{money(Math.abs(amountDiff))}).
                    </p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      {Math.abs(amountDiff - totalTax) < 2 ? (
                        <span>
                          💡 <strong>Notice:</strong> The difference of <strong>₹{money(Math.abs(amountDiff))}</strong> matches <strong>Total GST (₹{money(totalTax)})</strong>. Party total ₹{money(originalInvoiceTotal)} was recorded as Taxable Base (before GST), whereas line totals include GST.
                        </span>
                      ) : (
                        <span>
                          Check quantities, unit rates, discounts and whether list prices include or exclude GST.
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOriginalInvoiceTotal(calculatedGrandTotal);
                      setShowAmountMismatchDetail(false);
                    }}
                    className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer shadow-xs transition-colors"
                    title="Set Party Invoice Total to calculated grand total with GST"
                  >
                    Sync Party Total to ₹{money(calculatedGrandTotal)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleBulkSetListPriceGst(true);
                      setShowAmountMismatchDetail(false);
                    }}
                    className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer shadow-xs transition-colors"
                    title="Mark all line items as GST-Inclusive rates"
                  >
                    Switch to GST Incl
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAmountMismatchDetail(false)}
                    className="text-slate-400 hover:text-slate-600 font-bold px-1.5 py-0.5 cursor-pointer"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Inward costs — single compact row, only when opened */}
            {showInwardCostDetails && (
              <div className="bg-amber-50 border-b border-amber-200 px-3 sm:px-4 py-1.5 flex flex-wrap items-center gap-2 text-xs shrink-0">
                <span className="font-bold text-amber-950 flex items-center gap-1">
                  <Truck size={13} /> Inward costs
                </span>
                {(
                  [
                    ['Transport', transportCost, setTransportCost, 50],
                    ['Freight', freightCost, setFreightCost, 50],
                    ['Loading', loadingLabourCost, setLoadingLabourCost, 25],
                    ['Unloading', unloadingLabourCost, setUnloadingLabourCost, 25],
                    ['Other', otherInwardCost, setOtherInwardCost, 25],
                  ] as [string, number, (n: number) => void, number][]
                ).map(([label, val, setter, step]) => (
                  <label
                    key={label}
                    className="flex items-center gap-1 bg-white border border-amber-300 rounded px-1.5 py-0.5"
                  >
                    <span className="text-[11px] text-slate-500">{label}</span>
                    <span className="font-mono text-slate-700">₹</span>
                    <input
                      type="number" inputMode="decimal"
                      min="0"
                      step={step}
                      value={val}
                      onChange={(e) => setter(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-14 font-mono text-xs font-bold text-slate-900 text-right bg-transparent focus:outline-hidden"
                      placeholder="0"
                    />
                  </label>
                ))}
                <span className="ml-auto text-[11px] text-amber-900 font-semibold font-mono">
                  Total ₹{money(totalInwardCost)} • +₹{money(inwardCostPerCrate)}/crate over {totalReceivedQty} crates
                </span>
              </div>
            )}

            {/* 2. EXPANDED VIEW (FULL INVOICE & TAX CONTROLS WITH QUICK COLLAPSE) */}
            {isUpperDetailsExpanded && (
              <div className="bg-slate-50 border-b shrink-0 transition-all shadow-inner max-h-[45vh] overflow-y-auto" style={{ borderColor: palette.line }}>
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
                    className="px-2.5 py-0.5 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded text-xs flex items-center gap-1 cursor-pointer shadow-sm shrink-0"
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
                    <input autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
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
                    <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">
                      Inward To Godown <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={targetWarehouseId}
                      onChange={(e) => setTargetWarehouseId(e.target.value)}
                      required
                      className={`w-full bg-white border rounded px-2 py-1 text-xs font-semibold focus:border-indigo-500 ${
                        !targetWarehouseId ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-300 text-slate-800'
                      }`}
                    >
                      <option value="">Select warehouse... (mandatory)</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                    {!targetWarehouseId && (
                      <p className="text-[10px] text-rose-600 font-semibold mt-0.5">
                        Required — no default warehouse. Pick where this invoice is being received.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">Bill Discount (₹)</label>
                    <input
                      type="number" inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={overallDiscount}
                      onChange={(e) => setOverallDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="0.00"
                      className="w-full font-mono font-bold text-rose-600 bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">Party Invoice Total (₹)</label>
                    <input
                      type="number" inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={originalInvoiceTotal ?? ''}
                      onChange={(e) => setOriginalInvoiceTotal(e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="e.g. 283340"
                      className="w-full font-mono font-bold text-indigo-700 bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:border-indigo-500"
                      title="Printed Grand Total from supplier tax invoice"
                    />
                  </div>
                </div>

                {/* Additional Provider Details Bar */}
                <div className="px-3 sm:px-6 py-1.5 bg-slate-100/80 border-t border-slate-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowProviderDetails((prev) => !prev)}
                      className="px-2 py-0.5 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-50 rounded border border-indigo-200 flex items-center gap-1.5 cursor-pointer shadow-sm"
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
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 shadow-sm"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                          Supplier Phone / Mobile
                        </label>
                        <input inputMode="tel" autoComplete="tel"
                          type="text"
                          value={supplierPhone}
                          onChange={(e) => setSupplierPhone(e.target.value)}
                          placeholder="e.g. +91 94370 84801"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 shadow-sm"
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
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 shadow-sm"
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
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 shadow-sm"
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
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 shadow-sm"
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

            {/* REVIEW TOOLBAR — one row: search • filters • bulk expiry • view • actions */}
            <div
              className="px-3 sm:px-4 py-1.5 border-b bg-white flex flex-wrap items-center gap-2 text-xs shrink-0"
              style={{ borderColor: palette.line }}
            >
              <div className="relative w-full sm:w-52 lg:w-60">
                <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
                <input enterKeyHint="search"
                  type="text"
                  placeholder="Search product, HSN, category, scheme..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1 border border-slate-300 rounded text-xs focus:border-indigo-500 focus:outline-hidden"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => {
                    setFilterNewOnly(false);
                    setFilterSchemeOnly(false);
                    setFilterAttentionOnly(false);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    !filterNewOnly && !filterSchemeOnly && !filterAttentionOnly
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({rows.length})
                </button>
                <button
                  onClick={() => {
                    setFilterNewOnly(!filterNewOnly);
                    if (!filterNewOnly) {
                      setFilterSchemeOnly(false);
                      setFilterAttentionOnly(false);
                    }
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                    filterNewOnly
                      ? 'bg-blue-600 text-white'
                      : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200'
                  }`}
                >
                  <Sparkles size={11} />
                  New ({newProductsCount})
                </button>
                <button
                  onClick={() => {
                    setFilterSchemeOnly(!filterSchemeOnly);
                    if (!filterSchemeOnly) {
                      setFilterNewOnly(false);
                      setFilterAttentionOnly(false);
                    }
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                    filterSchemeOnly
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                  }`}
                >
                  <Tag size={11} />
                  Schemes ({itemsWithSchemeCount})
                </button>
                <button
                  onClick={() => {
                    setFilterAttentionOnly(!filterAttentionOnly);
                    if (!filterAttentionOnly) {
                      setFilterNewOnly(false);
                      setFilterSchemeOnly(false);
                    }
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                    filterAttentionOnly
                      ? 'bg-amber-500 text-white'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                  }`}
                  title="Missing expiry date or zero rate"
                >
                  <AlertCircle size={11} />
                  Attention ({attentionCount})
                </button>
              </div>

              <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                {/* Bulk expiry: fill only the EMPTY expiry cells (never overwrites what you typed) */}
                <div
                  className="hidden lg:flex items-center gap-1 border border-slate-300 rounded px-1.5 py-0.5 bg-slate-50"
                  title="Set one expiry date for every line that has none yet"
                >
                  <span className="text-[11px] text-slate-500 font-medium">Expiry</span>
                  <input
                    type="date"
                    value={bulkExpiryDate}
                    onChange={(e) => setBulkExpiryDate(e.target.value)}
                    className="text-[11px] bg-white border border-slate-300 rounded px-1 py-0.5 text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handleFillEmptyExpiry}
                    disabled={missingExpiryCount === 0 || !bulkExpiryDate}
                    className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Fill empty ({missingExpiryCount})
                  </button>
                </div>

                {/* View Mode Toggle: Cards vs Table */}
                <div className="flex items-center border border-slate-300 rounded-md p-0.5 bg-slate-100 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`px-2 py-0.5 rounded flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                      viewMode === 'cards' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Card View"
                  >
                    <LayoutGrid size={13} />
                    <span className="text-[11px] hidden sm:inline">Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`px-2 py-0.5 rounded flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                      viewMode === 'table' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Table View"
                  >
                    <Table size={13} />
                    <span className="text-[11px] hidden sm:inline">Table</span>
                  </button>
                </div>

                {viewMode === 'table' && (
                  <div className="hidden lg:flex items-center border border-slate-300 rounded p-0.5 bg-slate-50 text-[11px]">
                    <button
                      onClick={() => setDensity('comfortable')}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                        density === 'comfortable' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Comfortable row height"
                    >
                      Spacious
                    </button>
                    <button
                      onClick={() => setDensity('compact')}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                        density === 'compact' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Compact row height"
                    >
                      Compact
                    </button>
                  </div>
                )}

                {/* List Price GST Global Check & Toggle */}
                <div className="flex items-center gap-1 border border-indigo-200 rounded p-0.5 bg-indigo-50/70 text-xs shrink-0">
                  <span className="text-[10px] font-bold text-indigo-900 px-1 flex items-center gap-1" title="Check if list prices include GST. If not, GST is calculated and added.">
                    <Percent size={11} className="text-indigo-600" />
                    List Price GST:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleBulkSetListPriceGst(false)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                      rows.length > 0 && rows.every((r) => !r.isGstIncluded)
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-indigo-800 hover:bg-indigo-100'
                    }`}
                    title="List prices exclude GST: calculate & add GST to all lines"
                  >
                    +Calc GST
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkSetListPriceGst(true)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                      rows.length > 0 && rows.every((r) => r.isGstIncluded)
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-indigo-800 hover:bg-indigo-100'
                    }`}
                    title="List prices include GST: extract base taxable value"
                  >
                    GST Incl
                  </button>
                </div>

                {/* Auto Batch / Tag All button */}
                <button
                  type="button"
                  onClick={handleAutoGenerateAllBatches}
                  className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded cursor-pointer flex items-center gap-1 transition-colors text-xs shrink-0"
                  title="Auto-generate fresh unique batch/tag numbers for all products inwards (never use old catalog batches)"
                >
                  <Sparkles size={12} className="text-amber-600" />
                  <span className="hidden sm:inline">Auto Batch/Tag</span>
                  <span className="sm:hidden">Batches</span>
                </button>

                <button
                  onClick={() => setShowBulkSchemeModal(true)}
                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 font-bold rounded cursor-pointer flex items-center gap-1.5 transition-colors text-xs"
                >
                  <Tag size={13} />
                  <span className="hidden sm:inline">Scheme to All</span>
                  <span className="sm:hidden">Scheme</span>
                </button>

                <button
                  onClick={handleAddNewRow}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded cursor-pointer flex items-center gap-1.5 shadow-sm transition-colors text-xs"
                >
                  <Plus size={13} />
                  <span className="hidden sm:inline">Add Product</span>
                  <span className="sm:hidden">Add</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadBulkInwardRowsCsv(rows, {
                      supplierName,
                      invoiceNo,
                      inwardDate,
                      warehouseName: warehouses.find((w) => w.id === targetWarehouseId)?.name,
                    })
                  }
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded cursor-pointer flex items-center gap-1.5 transition-colors text-xs shrink-0"
                  title="Download current inward items as CSV file"
                >
                  <Download size={13} className="text-emerald-700" />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">CSV</span>
                </button>
              </div>
            </div>

            {/* REVIEW ITEMS DISPLAY (RESPONSIVE CARDS OR SPREADSHEET TABLE) */}
            <div className={`flex-1 min-h-0 bg-slate-100/60 ${viewMode === 'table' ? 'overflow-hidden p-1.5 sm:p-2' : 'overflow-y-auto p-2 sm:p-3'}`}>
              {viewMode === 'cards' ? (
                <div className="space-y-3 min-w-0">
                  {filteredRows.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
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
                          inwardDate={inwardDate}
                          isExpanded={expandedCardId === r.id}
                          onToggleExpand={() =>
                            setExpandedCardId(expandedCardId === r.id ? null : r.id)
                          }
                          onUpdateField={(field, val) => updateRowField(r.id, field as keyof EditableInwardRow, val)}
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
                <div
                  className="h-full bg-white rounded-lg border shadow-sm overflow-auto"
                  style={{ borderColor: palette.line }}
                >
                  <table className="w-full text-left data-table text-xs border-separate border-spacing-0 min-w-[1120px]">
                    <thead className="sticky top-0 z-30 text-[11px] font-bold text-slate-600">
                      <tr>
                        <th className="sticky left-0 z-40 bg-slate-100 border-b border-slate-300 w-9 min-w-9 px-1 py-2 text-center">#</th>
                        <th className="sticky left-9 z-40 bg-slate-100 border-b border-r border-slate-300 min-w-[250px] px-2 py-2">Product</th>
                        <th className="bg-slate-100 border-b border-slate-300 w-20 px-2 py-2 text-right">Qty (cs)</th>
                        <th className="bg-purple-100 text-purple-900 border-b border-slate-300 w-28 px-2 py-2">Scheme</th>
                        <th className="bg-slate-100 border-b border-slate-300 w-28 px-2 py-2 text-right">List Price & GST</th>
                        <th className="bg-slate-100 border-b border-slate-300 w-[76px] px-2 py-2">GST</th>
                        <th className="bg-slate-100 border-b border-slate-300 w-36 px-2 py-2">Batch / Tag No</th>
                        <th className="bg-amber-100 text-amber-900 border-b border-slate-300 w-[140px] px-2 py-2">Expiry</th>
                        <th className="bg-slate-100 border-b border-slate-300 w-28 px-2 py-2 text-right">Line total</th>
                        <th className="bg-emerald-100 text-emerald-900 border-b border-slate-300 w-28 px-2 py-2 text-right">Landed / cr</th>
                        <th className="sticky right-0 z-40 bg-slate-100 border-b border-l border-slate-300 w-[92px] px-1 py-2 text-center">Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-12 text-center text-slate-500">
                            <p className="text-sm font-semibold">No products match the active filters or search query.</p>
                            <button
                              onClick={() => {
                                setSearchQuery('');
                                setFilterNewOnly(false);
                                setFilterSchemeOnly(false);
                                setFilterAttentionOnly(false);
                              }}
                              className="mt-2 text-xs font-bold text-indigo-600 underline cursor-pointer"
                            >
                              Reset filters
                            </button>
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((r, idx) => {
                          const unitsPerCrate = r.unitsPerCrate || inferUnitsPerCase(`${r.productName || ''} ${r.rawName || ''} ${r.pack || ''}`, r.volume);
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
                          const cellPad = isComfortable ? 'py-2.5' : 'py-1.5';
                          const isOpen = expandedRowId === r.id;
                          const rowBg = isOpen ? 'bg-indigo-50' : r.isNewProduct ? 'bg-sky-50' : 'bg-white';
                          const schemeLabel =
                            r.schemeType === 'discount_percent'
                              ? `${r.discountPercent}% off`
                              : r.schemeType === 'discount_flat'
                              ? `₹${r.discountFlat}/cs off`
                              : r.schemeType === 'b2g1'
                              ? `B${r.schemeBuyQty ?? 2}G${r.schemeFreeQty ?? 1}`
                              : r.freeQty > 0
                              ? `${r.freeQty} free`
                              : '—';
                          const hasScheme = schemeLabel !== '—' || !!r.supplierSchemeId;

                          return (
                            <React.Fragment key={r.id}>
                              <tr className="group">
                                {/* # (sticky) */}
                                <td className={`sticky left-0 z-20 ${rowBg} group-hover:bg-indigo-50 border-b border-slate-200 px-1 ${cellPad} text-center text-slate-400 font-mono text-[11px]`}>
                                  {idx + 1}
                                </td>

                                {/* Product name (sticky — stays visible while scrolling sideways) */}
                                <td className={`sticky left-9 z-20 ${rowBg} group-hover:bg-indigo-50 border-b border-r border-slate-200 px-2 ${cellPad}`}>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCatalogPickerRowId(catalogPickerRowId === r.id ? null : r.id);
                                        setCatalogPickerSearch('');
                                      }}
                                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-black border transition-colors cursor-pointer ${
                                        r.isNewProduct
                                          ? 'bg-blue-100 text-sky-800 border-sky-200 hover:bg-sky-200'
                                          : 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
                                      }`}
                                      title={r.isNewProduct ? "New product — click to map to existing catalog product" : `Catalog #${r.matchedProductId} • click to change mapping`}
                                    >
                                      {r.isNewProduct ? 'NEW ▾' : 'CAT ▾'}
                                    </button>
                                    <input
                                      type="text"
                                      value={r.productName}
                                      onChange={(e) => updateRowField(r.id, 'productName', e.target.value)}
                                      className="min-w-0 flex-1 font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 focus:outline-hidden"
                                      placeholder="Beverage Product Name"
                                      title={r.productName}
                                    />
                                  </div>

                                  {/* Catalog Match Popover */}
                                  {catalogPickerRowId === r.id && (
                                    <div className="absolute left-2 top-full mt-1 z-50 bg-white border border-slate-300 rounded-lg shadow-xl p-2 w-80 max-h-72 flex flex-col text-xs">
                                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 mb-1.5">
                                        <span className="font-bold text-slate-800 text-[11px]">Select Catalog Beverage</span>
                                        <button
                                          type="button"
                                          onClick={() => setCatalogPickerRowId(null)}
                                          className="text-slate-400 hover:text-slate-600 font-bold px-1"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                      <input
                                        type="text"
                                        value={catalogPickerSearch}
                                        onChange={(e) => setCatalogPickerSearch(e.target.value)}
                                        placeholder="Search catalog by name, ml, pack..."
                                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs mb-1.5 focus:border-indigo-500 focus:outline-hidden"
                                        autoFocus
                                      />
                                      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleCatalogMappingChange(r.id, 'new_product');
                                            setCatalogPickerRowId(null);
                                          }}
                                          className={`w-full text-left p-1.5 rounded border text-[11px] transition-colors cursor-pointer ${
                                            r.isNewProduct
                                              ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold'
                                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                          }`}
                                        >
                                          ✨ Create as New Catalog Product
                                        </button>
                                        {products
                                          .filter((p) => {
                                            if (!catalogPickerSearch.trim()) {
                                              const rawTokens = r.productName.toLowerCase().split(/[^a-z0-9]+/);
                                              return rawTokens.some((t) => t.length >= 3 && p.name.toLowerCase().includes(t));
                                            }
                                            const q = catalogPickerSearch.toLowerCase();
                                            return (
                                              p.name.toLowerCase().includes(q) ||
                                              String(p.volume).includes(q) ||
                                              p.pack?.toLowerCase().includes(q)
                                            );
                                          })
                                          .slice(0, 15)
                                          .map((p) => (
                                            <button
                                              key={p.id}
                                              type="button"
                                              onClick={() => {
                                                handleCatalogMappingChange(r.id, String(p.id));
                                                setCatalogPickerRowId(null);
                                              }}
                                              className={`w-full text-left p-1.5 rounded border text-[11px] flex items-center justify-between transition-colors cursor-pointer ${
                                                r.matchedProductId === p.id
                                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                                                  : 'bg-white border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
                                              }`}
                                            >
                                              <div className="min-w-0 pr-1">
                                                <div className="font-bold text-slate-900 truncate">{p.name}</div>
                                                <div className="text-[10px] text-slate-500">
                                                  {p.volume ? `${p.volume}ml` : ''} {p.pack} • {p.unitsPerCrate || 24}/cr • Stock: {p.opening ?? 0} cs
                                                </div>
                                              </div>
                                              <span className="shrink-0 text-[10px] text-slate-400 font-mono">#{p.id}</span>
                                            </button>
                                          ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Interactive Volume & Pack Controls */}
                                  <div className="mt-1 pl-0.5 text-[10px] flex items-center gap-1.5 flex-wrap">
                                    {/* Volume Pill / Quick Picker */}
                                    <div className="relative inline-block">
                                      <button
                                        type="button"
                                        onClick={() => setVolumePickerRowId(volumePickerRowId === r.id ? null : r.id)}
                                        className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 font-mono font-bold text-slate-700 cursor-pointer flex items-center gap-0.5"
                                        title="Click to change bottle volume (ml)"
                                      >
                                        <span>{r.volume ? (r.volume >= 1000 && r.volume % 1000 === 0 ? `${r.volume / 1000}L` : `${r.volume}ml`) : '—'}</span>
                                        <span className="text-[10px] text-slate-400">▾</span>
                                      </button>
                                      {volumePickerRowId === r.id && (
                                        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-300 rounded-lg shadow-lg p-1.5 w-48 text-xs flex flex-col gap-1">
                                          <span className="text-[10px] font-bold text-slate-500 uppercase px-1">Select Size</span>
                                          <div className="grid grid-cols-3 gap-1">
                                            {[150, 200, 250, 300, 500, 600, 750, 1000, 1250, 1500, 2000, 2250].map((v) => (
                                              <button
                                                key={v}
                                                type="button"
                                                onClick={() => {
                                                  updateRowField(r.id, 'volume', v);
                                                  setVolumePickerRowId(null);
                                                }}
                                                className={`px-1 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                                                  r.volume === v
                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                                }`}
                                              >
                                                {v >= 1000 && v % 1000 === 0 ? `${v / 1000}L` : v === 2250 ? '2.25L' : v === 1250 ? '1.25L' : v === 1500 ? '1.5L' : `${v}ml`}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Pack Type Toggle */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const packs = ['PET', 'CAN', 'RGB', 'TETRA'];
                                        const nextIdx = (packs.indexOf((r.pack || 'PET').toUpperCase()) + 1) % packs.length;
                                        updateRowField(r.id, 'pack', packs[nextIdx]);
                                      }}
                                      className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 font-bold text-slate-700 cursor-pointer"
                                      title="Click to toggle packaging: PET -> CAN -> RGB (Glass) -> TETRA"
                                    >
                                      {r.pack || 'PET'}
                                    </button>

                                    <span className="text-slate-400 font-mono">{unitsPerCrate}/cr</span>
                                    {!r.isNewProduct && <span className="text-slate-400">· stock {r.existingStock ?? 0} cs</span>}
                                  </div>
                                </td>

                                {/* Qty */}
                                <td className={`border-b border-slate-200 px-2 ${cellPad} text-right ${rowBg} group-hover:bg-indigo-50`}>
                                  <input
                                    type="number" inputMode="numeric"
                                    min="1"
                                    value={r.qty}
                                    onChange={(e) => updateRowField(r.id, 'qty', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                    className="font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-1 w-16 text-right text-xs focus:border-indigo-500 focus:outline-hidden"
                                    title="Total crates printed on the invoice for this line (includes free scheme crates)"
                                  />
                                </td>

                                {/* Scheme summary (click to open full scheme editor) */}
                                <td className={`border-b border-slate-200 px-2 ${cellPad} ${rowBg} group-hover:bg-indigo-50`}>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRowId(isOpen ? null : r.id)}
                                    className={`px-2 py-1 rounded border text-[11px] font-semibold w-full text-left truncate cursor-pointer ${
                                      hasScheme
                                        ? 'bg-purple-50 border-purple-300 text-purple-900 hover:bg-purple-100'
                                        : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                                    }`}
                                    title={r.schemeText || 'Click to edit scheme / discount'}
                                  >
                                    {schemeLabel}
                                    {r.supplierSchemeId && <span className="ml-1 text-[10px] font-black text-purple-700">+SUP</span>}
                                  </button>
                                </td>

                                {/* Rate & GST check */}
                                <td className={`border-b border-slate-200 px-2 ${cellPad} text-right ${rowBg} group-hover:bg-indigo-50`}>
                                  <div className="flex flex-col items-end gap-1">
                                    <input
                                      type="number" inputMode="decimal"
                                      min="0"
                                      step="0.01"
                                      value={r.listPrice !== undefined ? r.listPrice : r.unitPrice}
                                      onChange={(e) => updateRowField(r.id, 'listPrice', Math.max(0, parseFloat(e.target.value) || 0))}
                                      className={`font-mono font-bold text-slate-900 border rounded px-1.5 py-1 w-[84px] text-right text-xs focus:border-indigo-500 focus:outline-hidden ${
                                        !(Number(r.unitPrice) > 0) ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'
                                      }`}
                                      title={`List Price: ₹${money(r.listPrice !== undefined ? r.listPrice : r.unitPrice)}`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateRowField(r.id, 'isGstIncluded', !r.isGstIncluded)}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                        r.isGstIncluded
                                          ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                                          : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                                      }`}
                                      title={
                                        r.isGstIncluded
                                          ? 'List price INCLUDES GST (Base: ₹' + money(r.unitPrice) + '). Click to switch to Ex-GST.'
                                          : 'List price EXCLUDES GST. +₹' + money(r.calculatedGstAmount || 0) + ' GST calculated. Click to switch.'
                                      }
                                    >
                                      {r.isGstIncluded ? 'GST Incl' : '+Calc GST'}
                                    </button>
                                  </div>
                                </td>

                                {/* GST */}
                                <td className={`border-b border-slate-200 px-2 ${cellPad} ${rowBg} group-hover:bg-indigo-50`}>
                                  <select
                                    value={`${r.cgstPercent},${r.sgstPercent}`}
                                    onChange={(e) => {
                                      const [cg, sg] = e.target.value.split(',').map(Number);
                                      updateRowField(r.id, 'cgstPercent', cg);
                                      updateRowField(r.id, 'sgstPercent', sg);
                                    }}
                                    className="font-mono text-[11px] bg-white border border-slate-300 rounded px-1 py-1 text-slate-800 w-full"
                                  >
                                    <option value="20,20">40%</option>
                                    <option value="2.5,2.5">5%</option>
                                    <option value="9,9">18%</option>
                                    <option value="6,6">12%</option>
                                    <option value="0,0">0%</option>
                                  </select>
                                </td>

                                {/* Batch / Tag */}
                                <td className={`border-b border-slate-200 px-2 ${cellPad} ${rowBg} group-hover:bg-indigo-50`}>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={r.batchNumber}
                                      onChange={(e) => updateRowField(r.id, 'batchNumber', e.target.value)}
                                      className={`w-full px-1.5 py-1 border rounded font-mono text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-hidden ${
                                        !(r.batchNumber || '').trim() ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'
                                      }`}
                                      title={!(r.batchNumber || '').trim() ? 'Batch number missing' : 'Batch/Tag number'}
                                      placeholder="Batch No"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const existingBatches = [
                                          ...products.map((p) => p.batchNumber).filter(Boolean),
                                          ...rows.filter((x) => x.id !== r.id).map((x) => x.batchNumber).filter(Boolean),
                                        ] as string[];
                                        const fresh = generateBatchNumber(r.productName || r.rawName, undefined, existingBatches, undefined, inwardDate);
                                        updateRowField(r.id, 'batchNumber', fresh);
                                      }}
                                      className="p-1 rounded bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 border border-slate-200 hover:border-amber-300 transition-colors shrink-0 cursor-pointer"
                                      title="Auto-generate fresh unique batch/tag number (never reuse old one)"
                                    >
                                      <Sparkles size={11} />
                                    </button>
                                  </div>
                                </td>

                                {/* Expiry — always in view, highlighted when empty */}
                                <td className={`border-b border-slate-200 px-2 ${cellPad} ${rowBg} group-hover:bg-indigo-50`}>
                                  <input
                                    type="date"
                                    value={r.expiry}
                                    onChange={(e) => updateRowField(r.id, 'expiry', e.target.value)}
                                    className={`w-full px-1 py-1 border rounded text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-hidden ${
                                      !r.expiry ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'
                                    }`}
                                    title={!r.expiry ? 'Expiry date missing' : 'Expiry date'}
                                  />
                                </td>

                                {/* Line total */}
                                <td className={`border-b border-slate-200 px-2 ${cellPad} text-right font-mono font-bold text-slate-900 ${rowBg} group-hover:bg-indigo-50`}>
                                  ₹{money(breakdown.lineTotal)}
                                </td>

                                {/* Landed cost */}
                                <td className={`border-b border-slate-200 px-2 ${cellPad} text-right font-mono ${rowBg} group-hover:bg-indigo-50`}>
                                  <div className="font-black text-emerald-800">₹{money(breakdown.landedCostPerCrate)}</div>
                                  <div className="text-[10px] text-slate-500">₹{money(breakdown.landedCostPerUnit)}/unit</div>
                                </td>

                                {/* Actions (sticky right) */}
                                <td className={`sticky right-0 z-20 ${rowBg} group-hover:bg-indigo-50 border-b border-l border-slate-200 px-1 ${cellPad} text-center`}>
                                  <div className="flex items-center justify-center gap-0.5">
                                    <button
                                      onClick={() => setExpandedRowId(isOpen ? null : r.id)}
                                      className={`p-1 rounded cursor-pointer transition-colors ${
                                        isOpen ? 'text-indigo-700 bg-indigo-100' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                                      }`}
                                      title="Scheme, catalog mapping, pack size & cost breakdown"
                                    >
                                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                    <button
                                      onClick={() => handleDuplicateRow(r.id)}
                                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer transition-colors"
                                      title="Duplicate row (useful to split into different batches or lots)"
                                    >
                                      <Copy size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteRow(r.id)}
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                                      title="Delete this item from inward consignment"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Row detail panel (only when opened) */}
                              {isOpen && (
                                <tr>
                                  <td colSpan={11} className="bg-slate-50 border-b-2 border-indigo-300 p-0">
                                    <div className="sticky left-0 w-[calc(100vw-3rem)] max-w-full px-3 py-2.5 grid gap-3 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
                                      {/* Catalog mapping & pack */}
                                      <div className="flex flex-col gap-2 min-w-0">
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                          Catalog & pack
                                        </span>
                                        <select
                                          value={r.isNewProduct ? 'new_product' : String(r.matchedProductId)}
                                          onChange={(e) => handleCatalogMappingChange(r.id, e.target.value)}
                                          className="text-[11px] font-medium bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 cursor-pointer w-full"
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
                                        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
                                          <label className="flex items-center gap-1">
                                            <span className="text-[11px] text-slate-500 font-medium">Pack</span>
                                            <input
                                              type="text"
                                              value={packSize}
                                              onChange={(e) => updateRowField(r.id, 'packSize', e.target.value)}
                                              className="w-24 px-1.5 py-1 border border-slate-300 rounded text-xs text-slate-800 bg-white font-medium"
                                              placeholder="150ml PET"
                                            />
                                          </label>
                                          <label className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                            <span className="text-[11px] text-amber-900 font-bold">Units/Cr</span>
                                            <input
                                              type="number" inputMode="numeric"
                                              min="1"
                                              value={unitsPerCrate}
                                              onChange={(e) => updateRowField(r.id, 'unitsPerCrate', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                              className="w-12 font-mono font-bold text-xs text-amber-950 bg-white border border-amber-300 rounded px-1 py-0.5 text-right"
                                            />
                                          </label>
                                          <label className="flex items-center gap-1">
                                            <span className="text-[11px] text-slate-500 font-medium">HSN</span>
                                            <input
                                              type="text"
                                              value={r.hsn}
                                              onChange={(e) => updateRowField(r.id, 'hsn', e.target.value)}
                                              className="w-20 font-mono text-xs px-1.5 py-1 border border-slate-300 rounded bg-white text-slate-800"
                                            />
                                          </label>
                                          <label className="flex items-center gap-1">
                                            <span className="text-[11px] text-slate-500 font-medium">Wholesale ₹</span>
                                            <input
                                              type="number" inputMode="decimal"
                                              value={r.wholesaleRate}
                                              onChange={(e) => updateRowField(r.id, 'wholesaleRate', parseFloat(e.target.value) || 0)}
                                              className="w-20 px-1.5 py-1 border border-slate-300 rounded text-right font-bold text-slate-800 bg-white text-xs"
                                            />
                                          </label>
                                        </div>
                                      </div>

                                      {/* Scheme review (original editor, unchanged) */}
                                      <div className="bg-purple-50/70 border border-purple-200 rounded-lg p-2.5 min-w-0">
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-purple-800 flex items-center gap-1 mb-1.5">
                                          <Tag size={11} /> Scheme review & free qty
                                        </span>
                                <div className="flex flex-col gap-1.5">
                                  {/* Scheme Type Selector */}
                                  <select
                                    value={r.schemeType}
                                    onChange={(e) => updateRowField(r.id, 'schemeType', e.target.value as GrnSchemeType)}
                                    className="font-semibold text-purple-950 text-xs bg-white border border-purple-300 rounded-md px-2.5 py-1.5 w-full focus:border-purple-500 shadow-sm cursor-pointer"
                                  >
                                    <option value="b2g1">🎁 Buy 2 Get 1 Free (Ratio Scheme)</option>
                                    <option value="free_cases">+ Free Cases (included in billed qty, not extra)</option>
                                    <option value="discount_percent">% Percentage Discount</option>
                                    <option value="discount_flat">₹ Flat Off / Case</option>
                                    <option value="none">Standard (No Scheme)</option>
                                  </select>

                                  {/* b2g1 Ratio Scheme Inputs */}
                                  {r.schemeType === 'b2g1' && (
                                    <div className="p-2 bg-white border border-purple-200 rounded-md shadow-sm space-y-1.5">
                                      <div className="flex items-center gap-1 text-xs">
                                        <span className="text-purple-800 font-medium">Buy</span>
                                        <input
                                          type="number" inputMode="numeric"
                                          min="1"
                                          value={r.schemeBuyQty ?? 2}
                                          onChange={(e) => updateRowField(r.id, 'schemeBuyQty', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                          className="w-9 font-mono font-bold text-center bg-purple-50 border border-purple-300 rounded px-1 py-0.5 text-xs"
                                        />
                                        <span className="text-purple-800 font-medium">Get</span>
                                        <input
                                          type="number" inputMode="numeric"
                                          min="1"
                                          value={r.schemeFreeQty ?? 1}
                                          onChange={(e) => updateRowField(r.id, 'schemeFreeQty', Math.max(1, parseInt(e.target.value, 10) || 1))}
                                          className="w-9 font-mono font-bold text-center bg-purple-50 border border-purple-300 rounded px-1 py-0.5 text-xs"
                                        />
                                        <span className="text-purple-800 font-medium">Free</span>

                                        <div className="ml-auto flex items-center gap-1">
                                          <span className="text-[10px] text-slate-500 font-medium">Free:</span>
                                          <input
                                            type="number" inputMode="numeric"
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
                                    <div className="p-1.5 bg-white border border-purple-200 rounded-md shadow-sm space-y-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-purple-800 font-bold">Free:</span>
                                        <input
                                          type="number" inputMode="numeric"
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
                                    <div className="flex items-center gap-1.5 p-1.5 bg-white border border-purple-200 rounded-md shadow-sm">
                                      <span className="text-xs text-purple-800 font-bold">Disc:</span>
                                      <input
                                        type="number" inputMode="decimal"
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
                                    <div className="flex items-center gap-1.5 p-1.5 bg-white border border-purple-200 rounded-md shadow-sm">
                                      <span className="text-xs text-purple-800 font-bold">Flat:</span>
                                      <span className="text-xs text-purple-800 font-bold">₹</span>
                                      <input
                                        type="number" inputMode="decimal"
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

                                  {/* Supplier Scheme (additive layer, independent of the b2g1/free_cases scheme above) */}
                                  <div className="p-1.5 bg-amber-50/60 border border-amber-200 rounded-md space-y-1">
                                    <select
                                      value={r.supplierSchemeId || r.pendingCreditSchemeId || ''}
                                      onChange={(e) => {
                                        const scheme = supplierSchemes.find((s) => s.id === e.target.value);
                                        if (!scheme) {
                                          updateRowField(r.id, 'supplierSchemeId', undefined);
                                          updateRowField(r.id, 'supplierSchemeFreeQty', undefined);
                                          updateRowField(r.id, 'pendingCreditSchemeId', undefined);
                                          updateRowField(r.id, 'pendingCreditExpectedAmount', undefined);
                                          return;
                                        }
                                        if (scheme.schemeType === 'free_goods') {
                                          updateRowField(r.id, 'supplierSchemeId', scheme.id);
                                          updateRowField(r.id, 'pendingCreditSchemeId', undefined);
                                        } else if (scheme.schemeType === 'pending_credit') {
                                          updateRowField(r.id, 'pendingCreditSchemeId', scheme.id);
                                          updateRowField(r.id, 'supplierSchemeId', undefined);
                                        }
                                      }}
                                      className="font-medium text-amber-900 text-[10px] bg-white border border-amber-300 rounded px-1.5 py-1 w-full"
                                      title="Attach a named Supplier Scheme (additive free goods or pending credit) — separate from the invoice scheme above"
                                    >
                                      <option value="">No Supplier Scheme</option>
                                      {supplierSchemes
                                        .filter((s) => s.active && s.schemeType !== 'volume_incentive')
                                        .map((s) => (
                                          <option key={s.id} value={s.id}>
                                            {s.schemeType === 'free_goods' ? '🎁' : '⏳'} {s.name}
                                          </option>
                                        ))}
                                    </select>
                                    {r.supplierSchemeId && (
                                      <div className="flex items-center gap-1.5 text-[10px]">
                                        <span className="text-amber-800 font-semibold">+Free (additive):</span>
                                        <input
                                          type="number" inputMode="numeric"
                                          min="0"
                                          value={r.supplierSchemeFreeQty ?? 0}
                                          onChange={(e) =>
                                            updateRowField(r.id, 'supplierSchemeFreeQty', Math.max(0, parseInt(e.target.value, 10) || 0))
                                          }
                                          className="w-14 font-mono font-bold text-right bg-amber-50 border border-amber-300 rounded px-1 py-0.5"
                                        />
                                        <span className="text-emerald-700 font-mono font-bold ml-auto">
                                          Total: {breakdown.totalReceivedQty + (r.supplierSchemeFreeQty || 0)} cs
                                        </span>
                                      </div>
                                    )}
                                    {/* FIX: guard against double-counting the SAME free cases twice — once
                                        already inside r.freeQty (inclusive, part of the invoice's own total
                                        above) and again here as a separate "additive" Supplier Scheme bonus.
                                        This is the #1 way a "70 billed + 25 free" line silently becomes 95
                                        crates in stock: someone re-enters the same 25 here thinking it's how
                                        you record the invoice's own scheme, when this box is only for bonus
                                        stock that is NOT already printed/counted on this invoice. */}
                                    {r.supplierSchemeId && r.freeQty > 0 && (r.supplierSchemeFreeQty || 0) > 0 && (
                                      <div className="flex items-start gap-1 text-[10px] text-rose-700 bg-rose-50 border border-rose-300 rounded px-1.5 py-1 leading-snug">
                                        <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                                        <span>
                                          This line already has {r.freeQty} free crates included in the {r.qty} billed above
                                          (already a discount, not extra stock). Only add a Supplier Scheme qty here if the
                                          supplier is giving <strong>additional</strong> bonus stock beyond what's printed on
                                          this invoice — never re-enter the same free crates twice.
                                        </span>
                                      </div>
                                    )}
                                    {r.pendingCreditSchemeId && (
                                      <div className="flex items-center gap-1.5 text-[10px]">
                                        <span className="text-amber-800 font-semibold">Expected Credit ₹:</span>
                                        <input
                                          type="number" inputMode="decimal"
                                          min="0"
                                          value={r.pendingCreditExpectedAmount ?? 0}
                                          onChange={(e) =>
                                            updateRowField(r.id, 'pendingCreditExpectedAmount', Math.max(0, parseFloat(e.target.value) || 0))
                                          }
                                          className="w-20 font-mono font-bold text-right bg-amber-50 border border-amber-300 rounded px-1 py-0.5"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                                      </div>

                                      {/* Cost breakdown (read-only) */}
                                      <div className="flex flex-col gap-1.5 min-w-0">
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                          Cost breakdown
                                        </span>
                                        <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                                          <div className="bg-indigo-50 border border-indigo-200 rounded p-1.5">
                                            <div className="font-sans text-[10px] font-semibold text-indigo-700">Effective</div>
                                            <div className="font-bold text-indigo-950">₹{money(breakdown.effectiveCostPerCrateExGst)} ex</div>
                                            <div className="font-bold text-indigo-900">₹{money(breakdown.effectiveCostPerCrateInclGst)} incl</div>
                                            <div className="text-indigo-700">₹{money(breakdown.effectiveUnitRateInclGst)}/btl</div>
                                          </div>
                                          <div className="bg-amber-50 border border-amber-200 rounded p-1.5">
                                            <div className="font-sans text-[10px] font-semibold text-amber-700">Inward share</div>
                                            <div className="font-bold text-amber-900">+₹{money(breakdown.inwardCostPerCrate)}/cr</div>
                                            <div className="text-amber-800">+₹{money(breakdown.inwardCostPerCrate / unitsPerCrate)}/btl</div>
                                          </div>
                                          <div className="bg-emerald-50 border border-emerald-200 rounded p-1.5">
                                            <div className="font-sans text-[10px] font-semibold text-emerald-700">Landed</div>
                                            <div className="font-black text-emerald-900">₹{money(breakdown.landedCostPerCrate)}/cr</div>
                                            <div className="font-bold text-emerald-800">₹{money(breakdown.landedCostPerUnit)}/unit</div>
                                            <div className="text-slate-500">pre-tax ₹{money(breakdown.landedCostPerUnitExGst)}</div>
                                          </div>
                                        </div>
                                        <div className="text-[10px] text-slate-500 leading-snug">
                                          Paid {breakdown.paidQty} cs ({r.qty} billed) → received {breakdown.totalReceivedQty} cs •
                                          invoice rate incl. GST ₹{money(breakdown.invoiceRateInclGst)}/cr (₹
                                          {money(breakdown.invoiceUnitRateBottleInclGst)}/btl)
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
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
                    <span>Warning: Total cases mismatch ({totalInvoicePrintedQty} vs invoice's {printedTotalCases} printed, {casesDiff > 0 ? `+${casesDiff}` : casesDiff} cs)</span>
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
                  className="px-4 py-2.5 rounded-full text-sm font-semibold text-slate-600 hover:bg-black/5 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  id="btn-confirm-bulk-inward"
                  onClick={handleConfirmAndPostGrn}
                  disabled={!targetWarehouseId}
                  title={!targetWarehouseId ? 'Select a warehouse first — there is no default' : undefined}
                  className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-full text-sm font-semibold shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] ${
                    !targetWarehouseId
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                      : hasCasesMismatch
                      ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
                      : 'bg-[#0d4a3a] hover:bg-[#0a3d30] text-white cursor-pointer'
                  }`}
                >
                  {hasCasesMismatch ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                  <span>
                    {!targetWarehouseId
                      ? 'Select godown'
                      : hasCasesMismatch
                      ? 'Save with warning'
                      : 'Save purchase'}{' '}
                    · {rows.length} items · {totalReceivedQty.toLocaleString()} cs
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* IMPORT-WITH-WARNING DIALOG */}
        {showWarningDialog && hasCasesMismatch && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <div className="bg-white rounded-lg p-5 max-w-md w-full border-2 border-amber-500 shadow-xl flex flex-col gap-3">
              <h3 className="font-bold text-amber-900 text-sm flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-600" />
                Import with warning?
              </h3>
              <div className="text-xs text-slate-700 space-y-1 bg-amber-50 border border-amber-200 rounded p-3">
                <div>Invoice printed total: <strong>{printedTotalCases?.toLocaleString()} cs</strong></div>
                <div>Imported (working table): <strong>{totalReceivedQty.toLocaleString()} cs</strong></div>
                <div>Difference: <strong>{casesDiff > 0 ? `+${casesDiff}` : casesDiff} cs</strong></div>
              </div>
              <p className="text-xs text-slate-600 leading-snug">
                You can import now and correct the count later from the GRN list (Edit). This warning will be saved
                in the GRN history so it can be tracked.
              </p>
              <textarea
                value={warningNote}
                onChange={(e) => setWarningNote(e.target.value)}
                rows={2}
                placeholder="Optional note (e.g. 2 crates short, claim raised with supplier)"
                className="w-full border border-slate-300 rounded p-2 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowWarningDialog(false)}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 rounded text-xs cursor-pointer"
                >
                  Go back & fix
                </button>
                <button
                  type="button"
                  onClick={handleImportWithWarning}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <AlertTriangle size={14} /> Import with warning
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
                    type="number" inputMode="numeric"
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
