import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowRightLeft,
  Boxes,
  Check,
  Package,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  Edit2,
  FileSpreadsheet,
  FileText,
  Filter,
  Gift,
  Info,
  Minus,
  Plus,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { CATS } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { GRN } from '../../types';
import { generateSkuId, money } from '../../utils/billing';
import { collectExpiryAlerts } from '../../utils/fefo';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { EmptyState } from '../common/EmptyState';
import { SizeChip } from '../common/SizeChip';
import { PackIcon } from '../common/PackIcon';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { AuditView } from './AuditView';
import { OversoldInspectorModal } from './OversoldInspectorModal';
import { buildOversoldClearAudits, type OversoldItem } from '../../utils/oversoldDiagnostic';
import { StockAuditScreen } from './StockAuditScreen';
import { BulkInwardModal } from './BulkInwardModal';
import { InwardConsignmentModal } from './InwardConsignmentModal';
import { WarehousesView } from './WarehousesView';
import { DispositionsView } from './DispositionsView';
import { trackedStage } from './ExpiryReturnsTracker';
import { InfoTip } from "../common/InfoTip";
import { todayISO } from "../../utils/dateLocal";
import { downloadAllGrnsCsv, downloadSingleGrnCsv } from '../../utils/grnCsvExport';
import { buildCrossWarehouseShiftPlan } from '../../utils/billCostRepair';

export type InventorySubTab = 'realtime' | 'consignments' | 'audit' | 'transfers' | 'warehouses' | 'batches' | 'dispositions';

interface InventoryViewProps {
  initialSubTab?: InventorySubTab;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ initialSubTab = 'realtime' }) => {
  const {
    products,
    grns,
    deleteGrn,
    soldByProduct,
    remainingStock,
    productWarehouseStock,
    warehouses,
    inventoryBatches,
    audits,
    stockTransfers,
    supplierCreditNotes,
    palette,
    fz,
    scale,
    billingSettings,
    setTab,
    pullFromCloud,
    addStockTransfer,
    warehouseStock,
    productBatchLines,
    inventoryDispositions,
    bills,
    restoreCrossWarehouseAllocations,
    oversoldReport,
    saveBatchAudit,
    currentRole,
    reassignBillsProductWarehouse,
    undoLastOversoldReassign,
    hasOversoldReassignUndo,
  } = useLedger();

  const clearOversoldDeficits = (items: OversoldItem[], reason: string) => {
    if (currentRole !== 'admin') return;
    for (const a of buildOversoldClearAudits(items, reason)) {
      saveBatchAudit({
        warehouseId: a.warehouseId,
        referenceNote: 'Oversold deficit cleared from the oversold inspector',
        lines: a.lines,
      });
    }
  };

  const [oversoldInspect, setOversoldInspect] = useState<{ open: boolean; productId?: number; warehouseId?: string }>({ open: false });

  const crossWhPlan = useMemo(
    () =>
      buildCrossWarehouseShiftPlan({
        bills: bills || [],
        products,
        inventoryBatches,
        warehouses,
      }),
    [bills, products, inventoryBatches, warehouses],
  );

  // Customer expired returns still waiting for a decision / handover (badge on the Returns tab).
  const pendingExpiryReturns = (inventoryDispositions || []).filter(
    (d) => !!d.returnTracking && trackedStage(d) === 'held',
  ).length;

  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudSyncMsg, setCloudSyncMsg] = useState<string | null>(null);

  const resolveTab = (tabName?: InventorySubTab): 'realtime' | 'consignments' | 'audit' | 'transfers' | 'dispositions' => {
    if (tabName === 'audit') return 'audit';
    if (tabName === 'transfers' || tabName === 'warehouses' || tabName === 'batches') return 'transfers';
    if (tabName === 'consignments') return 'consignments';
    if (tabName === 'dispositions') return 'dispositions';
    return 'realtime';
  };

  const [activeTab, setActiveTab] = useState<'realtime' | 'consignments' | 'audit' | 'transfers' | 'dispositions'>(
    resolveTab(initialSubTab)
  );
  const todayStr = todayISO();
  const expiryAlerts = React.useMemo(
    () => collectExpiryAlerts(inventoryBatches, products, todayStr),
    [inventoryBatches, products, todayStr]
  );

  const creditReceivedByProduct = useMemo(() => {
    const map: Record<number, number> = {};
    for (const cn of supplierCreditNotes || []) {
      const amt = Number(cn.actualAmount) || 0;
      if (amt > 0) {
        if (cn.productId) {
          const pid = Number(cn.productId);
          map[pid] = (map[pid] || 0) + amt;
        } else if (cn.grnId) {
          const matchBatch = inventoryBatches.find(
            (b) => b.id.includes(cn.grnId!) || (b.supplierInvoiceNo && cn.grnId!.includes(b.supplierInvoiceNo))
          );
          if (matchBatch) {
            map[matchBatch.productId] = (map[matchBatch.productId] || 0) + amt;
          }
        } else if (cn.notes) {
          for (const p of products) {
            if (cn.notes.toLowerCase().includes(p.name.toLowerCase())) {
              map[p.id] = (map[p.id] || 0) + amt;
            }
          }
        }
      }
    }
    return map;
  }, [supplierCreditNotes, products, inventoryBatches]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [stockLevelFilter, setStockLevelFilter] = useState<'all' | 'instock' | 'low' | 'out' | 'negative'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterDropdown]);

  const [isInwardModalOpen, setIsInwardModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedProductForInward, setSelectedProductForInward] = useState<number | undefined>(undefined);
  const [selectedGrnToEdit, setSelectedGrnToEdit] = useState<GRN | null>(null);
  const [grnToDelete, setGrnToDelete] = useState<GRN | null>(null);
  const [expandedGrnIds, setExpandedGrnIds] = useState<Record<string, boolean>>({});
  const [expandedBatchProductIds, setExpandedBatchProductIds] = useState<Record<number, boolean>>({});
  const [notification, setNotification] = useState<string | null>(null);

  const isPhone = useIsMobile(767);
  const [auditWhId, setAuditWhId] = useState<string>('');
  const [showWhSheet, setShowWhSheet] = useState(false);
  const [lastNewGrnId, setLastNewGrnId] = useState<string | null>(null);
  const [darkToast, setDarkToast] = useState<string | null>(null);
  const [showTransferPicker, setShowTransferPicker] = useState(false);
  const [xferJustDone, setXferJustDone] = useState<{
    fromName: string;
    toName: string;
    totalCases: number;
    summary: string;
    timeLabel: string;
    count: number;
  } | null>(null);

  useEffect(() => {
    if (!auditWhId && warehouses[0]?.id) {
      setAuditWhId(warehouses[0].id);
    }
  }, [warehouses, auditWhId]);

  const showPhoneToast = (msg: string) => {
    setDarkToast(msg);
    setTimeout(() => setDarkToast(null), 4500);
  };

  // ── Multi-line inter-godown transfer (Inventory control → Transfer) ──
  type TransferLine = { key: string; productId: number; qty: number };
  const [xferFromId, setXferFromId] = useState('');
  const [xferToId, setXferToId] = useState('');
  const [xferLines, setXferLines] = useState<TransferLine[]>([]);
  const [xferNote, setXferNote] = useState('');
  const [xferBusy, setXferBusy] = useState(false);

  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(resolveTab(initialSubTab));
    }
  }, [initialSubTab]);

  useEffect(() => {
    if (!xferFromId && warehouses[0]?.id) setXferFromId(warehouses[0].id);
    if (!xferToId && (warehouses[1]?.id || warehouses[0]?.id)) {
      setXferToId(warehouses[1]?.id || warehouses[0].id);
    }
  }, [warehouses, xferFromId, xferToId]);

  React.useEffect(() => {
    try {
      if (sessionStorage.getItem('mrwater_open_dispositions') === 'claims') {
        sessionStorage.removeItem('mrwater_open_dispositions');
        setActiveTab('dispositions');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const cardStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderWidth: 2,
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    color: palette.ink,
    borderColor: palette.line,
    borderWidth: 2,
    ...fz(14),
  };

  const showToast = (msg: string) => {
    if (isPhone) {
      showPhoneToast(msg);
      return;
    }
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const activeFiltersCount =
    (selectedCat !== 'all' ? 1 : 0) +
    (selectedWarehouse !== 'all' ? 1 : 0) +
    (stockLevelFilter !== 'all' ? 1 : 0);

  const clearAllFilters = () => {
    setSelectedCat('all');
    setSelectedWarehouse('all');
    setStockLevelFilter('all');
    setSearchTerm('');
  };

  const negativeStockProducts = useMemo(
    // remainingStock() is never below 0, so look for an oversold godown instead
    () => products.filter((p) => productWarehouseStock(p.id).some((r) => r.crates < 0)),
    [products, productWarehouseStock]
  );
  const negativeStockCount = negativeStockProducts.length;

  const filteredProducts = products.filter((p) => {
    const sku = p.sku || generateSkuId(p.name, p.category, p.id);
    const matchName =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = selectedCat === 'all' || p.category === selectedCat;
    // Location filter: product has batch or book stock at that godown
    const matchWh =
      selectedWarehouse === 'all' ||
      inventoryBatches.some(
        (b) => b.productId === p.id && b.warehouseId === selectedWarehouse,
      ) ||
      warehouseStock(selectedWarehouse, p.id) !== 0 ||
      p.warehouseId === selectedWarehouse;
    const rem = remainingStock(p.id);
    const threshold = billingSettings?.lowStockThreshold ?? 10;
    let matchStock = true;
    if (stockLevelFilter === 'instock') matchStock = rem > 0;
    else if (stockLevelFilter === 'low') matchStock = rem <= threshold && rem > 0;
    else if (stockLevelFilter === 'out') matchStock = rem === 0;
    else if (stockLevelFilter === 'negative') matchStock = productWarehouseStock(p.id).some((r) => r.crates < 0);

    return matchName && matchCat && matchWh && matchStock;
  });

  const exportInventoryCsv = () => {
    const headers = [
      'SKU ID',
      'Product Name',
      'Category',
      'Batch Lot',
      'Warehouse/Godown',
      'Opening Crates',
      'Inward Crates',
      'Crates Sold in Bills',
      'Real-Time Available Crates',
      'Wholesale Rate (₹)',
      'Total Valuation (₹)',
    ];

    const rows = filteredProducts.map((p) => {
      const sku = p.sku || generateSkuId(p.name, p.category, p.id);
      const sold = soldByProduct[p.id] || 0;
      const rem = remainingStock(p.id);
      const val = rem * p.wholesale;
      const wh = warehouses.find((w) => w.id === p.warehouseId);
      const inwardSum = inventoryBatches
        .filter((b) => b.productId === p.id)
        .reduce((sum, b) => sum + b.quantity, 0);

      return [
        `"${sku}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        p.category,
        productBatchLines(p.id).filter((b) => b.availableQty > 0).map((b) => b.batchNumber).join(' / '),
        wh ? `"${wh.name.replace(/"/g, '""')}"` : 'Main Depot',
        p.opening,
        inwardSum,
        sold,
        rem,
        p.wholesale,
        val.toFixed(2),
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory_crates_realtime_${todayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalStockCases = Math.max(
    0,
    filteredProducts.reduce((s, p) => s + Math.max(0, remainingStock(p.id)), 0),
  );
  const totalStockValue = Math.max(
    0,
    filteredProducts.reduce(
      (s, p) => s + Math.max(0, remainingStock(p.id)) * p.wholesale,
      0,
    ),
  );
  const totalSoldCrates = filteredProducts.reduce((s, p) => s + (soldByProduct[p.id] || 0), 0);
  const lowStockCount = filteredProducts.filter(
    (p) => remainingStock(p.id) < (billingSettings?.lowStockThreshold ?? 5)
  ).length;

  const fmtCompactInr = (val: number) => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2).replace(/\.00$/, '')}L`;
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
  };

  const selectedWhObj = warehouses.find((w) => w.id === selectedWarehouse);
  const auditWhObj = warehouses.find((w) => w.id === auditWhId) || warehouses[0];
  const sortedGrnsForHeader = [...(grns || [])].sort((a, b) => {
    const da = a.inwardDate || a.invoiceDate || '';
    const db = b.inwardDate || b.invoiceDate || '';
    if (da !== db) return db.localeCompare(da);
    return String(b.id).localeCompare(String(a.id));
  });

  return (
    <div id="view-inventory" className={`hh-view mw-workspace flex flex-col gap-4 w-full min-w-0 max-w-full ${isPhone ? 'pb-24' : 'pb-24'}`}>
      {/* Desktop Toast Notification */}
      {!isPhone && notification && (
        <div className="flex items-center gap-2 p-3 bg-[var(--primary)] text-white rounded-2xl shadow-md animate-fade-in text-sm font-semibold">
          <CheckCircle2 size={18} />
          <span>{notification}</span>
        </div>
      )}

      {isPhone ? (
        <div className="hh-sales-top hh-sales-top--flush hh-inv-top">
          <div className="hh-sales-top__row">
            <h1 className="hh-sales-top__title">Inventory</h1>
            {(activeTab === 'realtime' || activeTab === 'dispositions') && (
              <button
                type="button"
                onClick={() => setShowWhSheet(true)}
                className="hh-inv-glass-pill"
              >
                <span>{selectedWhObj ? selectedWhObj.name : 'All locations'}</span>
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            )}
            {activeTab === 'consignments' && (
              <button
                type="button"
                onClick={() => downloadAllGrnsCsv(sortedGrnsForHeader, warehouses)}
                className="hh-inv-glass-pill"
                aria-label="Download all GRNs as CSV"
              >
                <Download size={12} aria-hidden="true" />
                <span>CSV</span>
              </button>
            )}
            {activeTab === 'audit' && auditWhObj && (
              <button
                type="button"
                onClick={() => setShowWhSheet(true)}
                className="hh-inv-glass-pill"
              >
                <span>{auditWhObj.name}</span>
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="rt-utabs" role="tablist" aria-label="Inventory sections">
            {(
              [
                { id: 'realtime' as const, label: 'Stock', alertCount: 0 },
                { id: 'consignments' as const, label: 'Inward', alertCount: 0 },
                { id: 'audit' as const, label: 'Audit', alertCount: 0 },
                { id: 'dispositions' as const, label: 'Returns', alertCount: pendingExpiryReturns || 0 },
                { id: 'transfers' as const, label: 'Transfer', alertCount: 0 },
              ] as const
            ).map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  id={`tab-${t.id}`}
                  onClick={() => {
                    setActiveTab(t.id);
                    if (t.id === 'transfers') setXferJustDone(null);
                  }}
                  className="hh-inv-utab"
                >
                  <span>{t.label}</span>
                  {t.alertCount > 0 && (
                    <span className="hh-inv-tab-badge">{t.alertCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {/* Consistent Page Header (Desktop / Tablet) */}
          <div className="flex items-center justify-between gap-3 min-h-10 sm:min-h-11">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Inventory
            </h1>
            {activeTab === 'consignments' && (
              <button
                type="button"
                id="btn-add-inward"
                onClick={() => {
                  setSelectedGrnToEdit(null);
                  setIsInwardModalOpen(true);
                }}
                className="size-10 sm:size-11 rounded-full bg-[var(--primary)] text-white flex items-center justify-center shadow-md cursor-pointer active:scale-95 transition-transform shrink-0"
                aria-label="New inward purchase"
                title="New inward purchase"
              >
                <Plus className="w-5 h-5" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </>
      )}

      {crossWhPlan.affectedBillCount > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
            <div className="space-y-1">
              <div>
                <b>Stock shifted across godowns on {crossWhPlan.affectedBillCount} bill(s) ({crossWhPlan.totalShiftedCases} cases):</b>{' '}
                Bills without a godown tag were linked to batches in another godown, which can make available units look higher. Restore them to their original godown while keeping saved costs frozen.
              </div>
              <div className="flex flex-col gap-0.5 text-[11px] text-amber-950/90">
                {crossWhPlan.lines.slice(0, 5).map((l) => {
                  const matchedBill = (bills || []).find((b) => b.id === l.billId);
                  const billLabel = matchedBill?.docNo || `#${l.billId}`;
                  return (
                    <div key={`${l.billId}-${l.itemIndex}`}>
                      • <b>{l.productName}</b> ({l.qty} cs) on Bill {billLabel} ({l.retailer} · {l.billDate}) — batch in{' '}
                      <b>{l.allocatedWarehouseNames.join(', ')}</b> instead of <b>{l.expectedWarehouseName}</b>
                    </div>
                  );
                })}
                {crossWhPlan.lines.length > 5 && (
                  <div className="text-amber-800 font-semibold">+{crossWhPlan.lines.length - 5} more item(s)</div>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => restoreCrossWarehouseAllocations(crossWhPlan)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-950 cursor-pointer shrink-0"
          >
            <RotateCcw size={13} />
            Restore Exact Inventory ({crossWhPlan.totalShiftedCases} cs)
          </button>
        </div>
      )}

      {!isPhone && oversoldReport.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/90 px-3.5 py-3">
          <div className="flex items-start sm:items-center gap-2 text-xs font-semibold text-rose-900 min-w-0">
            <AlertTriangle size={15} className="shrink-0 text-rose-600 mt-0.5 sm:mt-0" />
            <span>
              {oversoldReport.length} product godown{oversoldReport.length === 1 ? ' is' : 's are'} oversold (negative book balance).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOversoldInspect({ open: true })}
            className="self-start sm:self-auto shrink-0 h-8 px-3.5 rounded-full bg-rose-700 text-xs font-semibold text-white hover:bg-rose-800 cursor-pointer whitespace-nowrap transition-colors"
          >
            Inspect &amp; clear ({oversoldReport.length})
          </button>
        </div>
      )}

      {!isPhone && (
        /* Consistent Segmented Tabs (Desktop / Tablet) */
        <div
          className="grid grid-cols-5 w-full bg-[#ebe8e1] rounded-full p-1"
          role="tablist"
          aria-label="Inventory sections"
        >
          {(
            [
              { id: 'realtime' as const, label: 'Stock', alertCount: 0 },
              { id: 'consignments' as const, label: 'Inward', alertCount: 0 },
              { id: 'audit' as const, label: 'Audit', alertCount: 0 },
              { id: 'dispositions' as const, label: 'Returns', alertCount: pendingExpiryReturns || 0 },
              { id: 'transfers' as const, label: 'Transfer', alertCount: 0 },
            ] as const
          ).map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                id={`tab-${t.id}`}
                onClick={() => setActiveTab(t.id)}
                className={`min-w-0 py-2.5 px-1 sm:px-3 rounded-full text-[11.5px] sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap truncate ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
                {t.alertCount > 0 && (
                  <span className="ml-1 text-[10.5px] font-bold text-amber-700 tabular-nums">
                    {t.alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* TAB 1: REAL-TIME CRATE COUNTS */}
      {activeTab === 'realtime' && (() => {
        const today = todayStr;
        const daysUntil = (exp?: string) => {
          if (!exp) return null;
          const d = new Date(exp.length === 10 ? exp + 'T12:00:00' : exp);
          if (isNaN(d.getTime())) return null;
          const t = new Date(today + 'T12:00:00');
          return Math.round((d.getTime() - t.getTime()) / 86400000);
        };
        const formatExp = (exp?: string) => {
          if (!exp) return 'Exp —';
          const d = new Date(exp.length === 10 ? exp + 'T12:00:00' : exp);
          if (isNaN(d.getTime())) return `Exp ${exp}`;
          return `Exp ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
        };
        const expBadge = (days: number | null) => {
          if (days === null) return null;
          if (days < 0) {
            return (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                Expired
              </span>
            );
          }
          if (days <= 30) {
            return (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {days}d
              </span>
            );
          }
          if (days <= 90) {
            return (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700">
                {days}d
              </span>
            );
          }
          return (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {days}d
            </span>
          );
        };

        // Products to show: filtered, with optional location filter applied to live warehouse stock
        const stockProducts = filteredProducts
          .map((p) => {
            const batchLines = productBatchLines(p.id);
            const batches =
              selectedWarehouse === 'all'
                ? batchLines
                : batchLines.filter((b) => b.warehouseId === selectedWarehouse);

            const liveStock =
              selectedWarehouse === 'all'
                ? remainingStock(p.id)
                : warehouseStock(selectedWarehouse, p.id);

            const headerQty = Math.max(0, liveStock);
            return { p, batches, rem: liveStock, headerQty };
          })
          .filter(({ p, batches, headerQty }) => {
            if (selectedWarehouse !== 'all') {
              // Show product if it has available live stock at this warehouse or matching batches
              return headerQty > 0 || batches.some((b) => b.availableQty > 0);
            }
            return true;
          })
          .sort((a, b) => a.p.name.localeCompare(b.p.name));

        if (isPhone) {
          const lowThreshold = billingSettings?.lowStockThreshold ?? 10;
          const phoneTotalCases = stockProducts.reduce((s, r) => s + Math.max(0, r.headerQty), 0);
          const phoneTotalValue = stockProducts.reduce((s, r) => s + Math.max(0, r.headerQty) * (Number(r.p.wholesale) || 0), 0);
          const oversoldProductCount = new Set(oversoldReport.map((o) => o.productId)).size;

          return (
            <div className="flex flex-col gap-3 w-full">
              <div className="rt-search-bar">
                <Search size={16} className="text-slate-400 shrink-0" />
                <input
                  enterKeyHint="search"
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search product"
                />
              </div>

              <div className="hh-inv-card flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-slate-500">Total stock</div>
                  <div className="text-[22px] font-extrabold text-slate-900 leading-tight tabular-nums mt-0.5">
                    {phoneTotalCases.toLocaleString()} cs
                  </div>
                </div>
                <div className="text-right min-w-0">
                  <div className="text-[12px] font-medium text-slate-500">Value</div>
                  <div className="text-[20px] font-extrabold text-slate-900 leading-tight tabular-nums mt-0.5">
                    {fmtCompactInr(phoneTotalValue)}
                  </div>
                </div>
              </div>

              {oversoldReport.length > 0 && (
                <div className="hh-inv-card hh-inv-card--alert-red flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-bold text-rose-600 leading-snug">
                      {oversoldProductCount} product{oversoldProductCount === 1 ? '' : 's'} oversold
                    </div>
                    <div className="text-[12px] text-slate-500 leading-snug mt-0.5">
                      Book stock is below zero in a godown
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOversoldInspect({ open: true })}
                    className="text-[13px] font-bold text-[#2864d9] px-2 py-1 min-w-0 shrink-0 cursor-pointer"
                  >
                    Fix
                  </button>
                </div>
              )}

              {stockProducts.length === 0 ? (
                <div className="hh-inv-card py-10 text-center">
                  <p className="text-sm font-semibold text-slate-700">No stock to show</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Adjust search or location, or receive inward stock.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {stockProducts.map(({ p, batches, headerQty }) => {
                    const expanded = !!expandedBatchProductIds[p.id];
                    const whNames = Array.from(
                      new Set(
                        productWarehouseStock(p.id)
                          .filter((r) => r.crates > 0 && (selectedWarehouse === 'all' || r.warehouseId === selectedWarehouse))
                          .map((r) => r.warehouseName)
                      )
                    );
                    if (whNames.length === 0) {
                      const batchWh = Array.from(
                        new Set(
                          batches.map((b) => warehouses.find((w) => w.id === b.warehouseId)?.name || b.warehouseName).filter(Boolean)
                        )
                      );
                      whNames.push(...(batchWh as string[]));
                    }
                    const hasExpiredOrSoon = batches.some((b) => {
                      const d = daysUntil(b.expiryDate);
                      return b.availableQty > 0 && d !== null && d <= 30;
                    });
                    const isLow = headerQty > 0 && headerQty <= lowThreshold;
                    const batchCount = batches.filter((b) => b.availableQty !== 0).length || batches.length;

                    let statusPill: React.ReactNode = null;
                    if (hasExpiredOrSoon) {
                      statusPill = (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10.5px] font-bold">
                          Expiring
                        </span>
                      );
                    } else if (isLow) {
                      statusPill = (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10.5px] font-bold">
                          Low
                        </span>
                      );
                    } else if (batchCount > 0) {
                      statusPill = (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-sky-50 text-[#2864d9] text-[10.5px] font-bold">
                          {batchCount} batch{batchCount === 1 ? '' : 'es'}
                        </span>
                      );
                    } else {
                      statusPill = (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10.5px] font-bold">
                          {headerQty === 0 ? 'Out' : 'Book'}
                        </span>
                      );
                    }

                    return (
                      <div key={p.id} className="hh-inv-card p-0 overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedBatchProductIds((prev) => ({
                              ...prev,
                              [p.id]: !prev[p.id],
                            }))
                          }
                          aria-expanded={expanded}
                          className="w-full flex items-center justify-between gap-2.5 px-3.5 py-3 text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <PackIcon pack={p.pack} name={p.name} />
                            <div className="min-w-0">
                              <div className="text-[14px] font-bold text-slate-900 leading-snug truncate">
                                {p.name}
                              </div>
                              <div className="text-[12px] font-medium text-slate-500 truncate mt-0.5">
                                {whNames.length > 0 ? whNames.join(' · ') : warehouses[0]?.name || 'Main'}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 space-y-0.5">
                            <div className="text-[14.5px] font-extrabold text-slate-900 tabular-nums leading-tight">
                              {headerQty} cs
                            </div>
                            <div>{statusPill}</div>
                          </div>
                        </button>

                        {expanded && (
                          <div className="border-t border-slate-100 px-3.5 pb-3 pt-2">
                            {productWarehouseStock(p.id)
                              .filter((r) => r.crates < 0 && (selectedWarehouse === 'all' || r.warehouseId === selectedWarehouse))
                              .map((r) => (
                                <div key={`neg_${r.warehouseId}`} className="mb-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 flex items-center justify-between gap-2 text-[11.5px]">
                                  <span className="font-semibold text-rose-800">
                                    {r.warehouseName}: book balance {r.crates} cs
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setOversoldInspect({ open: true, productId: p.id, warehouseId: r.warehouseId })}
                                    className="font-bold text-[#2864d9] shrink-0 cursor-pointer"
                                  >
                                    Fix
                                  </button>
                                </div>
                              ))}
                            {batches.length > 0 ? (
                              <>
                                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 pb-1.5">
                                  <span>Batch · expiry · godown</span>
                                  <span>Cases</span>
                                </div>
                                <div className="divide-y divide-slate-100">
                                  {batches.map((b) => {
                                    const wh = warehouses.find((w) => w.id === b.warehouseId);
                                    const days = daysUntil(b.expiryDate);
                                    const qty = b.availableQty;
                                    return (
                                      <div key={b.key} className="py-2 flex items-center justify-between gap-2 text-[12.5px]">
                                        <div className="min-w-0 truncate text-slate-700">
                                          <strong className="font-bold text-slate-900">{b.batchNumber || '—'}</strong>
                                          <span> · {formatExp(b.expiryDate)} · {wh?.name || b.warehouseName || 'Main'}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span className={`font-bold tabular-nums ${qty < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                            {qty} cs
                                          </span>
                                          {expBadge(days)}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            ) : (
                              <div className="py-1.5 text-[12px] text-slate-500">
                                Book stock: <strong className="text-slate-800">{headerQty} cs</strong>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-4 max-w-none mx-auto w-full">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input enterKeyHint="search"
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search product"
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 rounded-full border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
                />
              </div>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="w-full sm:w-48 px-3 py-2.5 rounded-full border border-black/10 bg-white text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
              >
                <option value="all">All locations</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {stockProducts.length === 0 ? (
              <div data-card-tone="neutral" className="rounded-2xl border shadow-sm px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate-700">No stock to show</p>
                <p className="text-xs text-slate-500 mt-1">
                  Adjust search or location, or receive inward stock.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="px-1 text-xs font-semibold text-slate-500 tabular-nums">
                  {totalStockCases.toLocaleString()} units on hand · {stockProducts.length} product{stockProducts.length === 1 ? '' : 's'}
                </div>
              <ul className="space-y-2.5">
                {stockProducts.map(({ p, batches, headerQty }) => {
                  const expanded = !!expandedBatchProductIds[p.id];
                  const hasDetail = batches.length > 0;
                  const stockTone =
                    headerQty < 0
                      ? 'due'
                      : headerQty === 0
                        ? 'neutral'
                        : headerQty <= 5
                          ? 'warning'
                          : 'received';
                  return (
                    <li
                      key={p.id}
                      data-card-tone={stockTone}
                      className="rounded-2xl border shadow-sm overflow-hidden transition-shadow"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBatchProductIds((prev) => ({
                            ...prev,
                            [p.id]: !prev[p.id],
                          }))
                        }
                        className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left cursor-pointer transition-colors"
                        aria-expanded={expanded}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <PackIcon pack={p.pack} name={p.name} />
                          <span className="text-[13px] sm:text-sm font-bold text-slate-900 leading-snug break-words min-w-0">
                            {p.name}{' '}
                            <SizeChip volume={p.volume} pack={p.pack} name={p.name} />
                          </span>
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-xl text-xs sm:text-sm font-extrabold tabular-nums shrink-0 border ${
                            headerQty < 0
                              ? 'bg-rose-100/90 text-rose-700 border-rose-200'
                              : headerQty === 0
                                ? 'bg-white/80 text-slate-500 border-slate-200/80'
                                : headerQty <= 5
                                  ? 'bg-amber-100/90 text-amber-800 border-amber-200'
                                  : 'bg-white/85 text-emerald-800 border-emerald-200/80'
                          }`}
                        >
                          {headerQty} cs
                        </span>
                      </button>

                      {expanded && (
                        <div className="border-t border-black/5 bg-white/85">
                          {productWarehouseStock(p.id)
                            .filter((r) => r.crates < 0 && (selectedWarehouse === 'all' || r.warehouseId === selectedWarehouse))
                            .map((r) => (
                              <div key={`neg_${r.warehouseId}`} className="px-3 sm:px-4 py-2 text-[11px] font-semibold text-rose-700 bg-rose-50 border-b border-rose-100">
                                Oversold in {r.warehouseName}: book balance {r.crates} cs. Check the godown on those bills or run a stock audit.{' '}
                                <button
                                  type="button"
                                  onClick={() => setOversoldInspect({ open: true, productId: p.id, warehouseId: r.warehouseId })}
                                  className="ml-1 rounded-md bg-rose-700 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-rose-800 cursor-pointer"
                                >
                                  Inspect Bills
                                </button>
                              </div>
                            ))}
                          {hasDetail ? (
                            <ul className="divide-y divide-black/5">
                              {batches.map((b) => {
                                const wh = warehouses.find((w) => w.id === b.warehouseId);
                                const days = daysUntil(b.expiryDate);
                                const qty = b.availableQty;
                                const inward = b.receivedQty;
                                return (
                                  <li
                                    key={b.key}
                                    className="px-3 sm:px-4 py-2.5 flex items-start gap-2 sm:gap-3"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[13px] text-slate-700 leading-snug">
                                        <span className="font-medium">
                                          Batch {b.batchNumber ? b.batchNumber : '·'}
                                        </span>
                                        <span className="text-slate-400"> · </span>
                                        <span>{wh?.name || b.warehouseName || b.warehouseId || 'Unknown godown'}</span>
                                      </div>
                                      <div className="text-[11px] text-slate-500 mt-0.5">
                                        {formatExp(b.expiryDate)}
                                        {inward > 0 && inward !== qty && (
                                          <span className="text-slate-400 ml-1.5 font-normal">
                                            (inward: {inward} cs)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                      {expBadge(days)}
                                      <span
                                        className={`text-sm font-bold tabular-nums min-w-[2rem] text-right ${
                                          qty < 0 ? 'text-rose-600' : qty === 0 ? 'text-slate-400' : 'text-slate-800'
                                        }`}
                                      >
                                        {qty} cs
                                      </span>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <div className="px-4 py-3 text-xs text-slate-500">
                              No batch rows
                              {selectedWarehouse !== 'all' ? ' at this location' : ''}.
                              Book stock:{' '}
                              <span className="font-semibold text-slate-700">
                                {selectedWarehouse === 'all'
                                  ? remainingStock(p.id)
                                  : warehouseStock(selectedWarehouse, p.id)}{' '}
                                cs
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              </div>
            )}

          </div>
        );
      })()}

      {/* TAB 2: PURCHASES (inward supplier invoices) */}
      {activeTab === 'consignments' && (() => {
        const formatInvDate = (d?: string) => {
          if (!d) return '—';
          const dt = new Date(d.length === 10 ? d + 'T12:00:00' : d);
          if (isNaN(dt.getTime())) return d;
          return dt.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
        };
        const sortedGrns = [...(grns || [])].sort((a, b) => {
          const da = a.inwardDate || a.invoiceDate || '';
          const db = b.inwardDate || b.invoiceDate || '';
          if (da !== db) return db.localeCompare(da);
          return String(b.id).localeCompare(String(a.id));
        });

        if (isPhone) {
          return (
            <div className="flex flex-col gap-3 w-full hh-inv-pb">
              {sortedGrns.length === 0 ? (
                <div className="hh-inv-card py-10 text-center">
                  <p className="text-sm font-bold text-slate-800">No purchases yet</p>
                  <p className="text-xs text-slate-500 mt-1">Record an inward bill or import an invoice.</p>
                </div>
              ) : (
                <>
                  <div className="text-[13px] font-bold text-slate-700 px-0.5">
                    {sortedGrns.length} inward purchase record{sortedGrns.length === 1 ? '' : 's'}
                  </div>
                  <div className="space-y-2.5">
                    {sortedGrns.map((g, idx) => {
                      const isNew = g.id === lastNewGrnId;
                      const expanded = !!expandedGrnIds[g.id];
                      const total = Number(g.grandTotal) || 0;
                      const invLabel = g.invoiceNo || '—';
                      const grnLabel = g.grnNumber || `GRN-${g.id}`;
                      const dateLabel = isNew && (g.inwardDate === todayISO() || g.invoiceDate === todayISO())
                        ? 'today'
                        : formatInvDate(g.inwardDate || g.invoiceDate);
                      const whName = warehouses.find((w) => w.id === g.warehouseId)?.name || g.warehouseId || 'Main';
                      const totalCs =
                        Number(g.totalReceivedQty) ||
                        (g.items || []).reduce(
                          (s, it) => s + (Number((it as any).totalReceivedQty) || Number((it as any).qty) || 0),
                          0
                        );
                      const taxable = Number(g.totalTaxable) || 0;

                      return (
                        <div
                          key={g.id}
                          className={`hh-inv-card p-0 overflow-hidden ${isNew ? 'hh-inv-card--alert-blue' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedGrnIds((prev) => ({
                                ...prev,
                                [g.id]: !prev[g.id],
                              }))
                            }
                            aria-expanded={expanded}
                            className="w-full px-3.5 py-3 text-left cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="min-w-0">
                                <div className="text-[13.5px] font-extrabold text-slate-900 uppercase leading-snug break-words">
                                  {(g.supplierName || 'Supplier').toUpperCase()}
                                </div>
                                <div className="text-[11.5px] font-medium text-slate-500 mt-0.5 leading-snug">
                                  {grnLabel} · Inv {invLabel} · {dateLabel}
                                </div>
                                {isNew && (
                                  <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-[#2864d9] text-[10.5px] font-bold">
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="text-[14px] font-extrabold text-slate-900 tabular-nums shrink-0">
                                ₹{money(total)}
                              </div>
                            </div>
                            {idx === 0 && !isNew && !expanded && (
                              <div className="grid grid-cols-3 gap-2 pt-2.5 mt-2.5 border-t border-slate-100">
                                <div>
                                  <div className="text-[10.5px] text-slate-400 font-medium">Cases</div>
                                  <div className="text-[13px] font-bold text-slate-900 tabular-nums">{totalCs}</div>
                                </div>
                                <div>
                                  <div className="text-[10.5px] text-slate-400 font-medium">Godown</div>
                                  <div className="text-[13px] font-bold text-slate-900 truncate">{whName}</div>
                                </div>
                                <div>
                                  <div className="text-[10.5px] text-slate-400 font-medium">Taxable</div>
                                  <div className="text-[13px] font-bold text-slate-900 tabular-nums">₹{money(taxable)}</div>
                                </div>
                              </div>
                            )}
                          </button>

                          {expanded && (
                            <div className="px-3.5 pb-3.5 pt-2.5 border-t border-slate-100 space-y-2.5">
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <div className="text-[10.5px] text-slate-400 font-medium">Cases</div>
                                  <div className="text-[13px] font-bold text-slate-900 tabular-nums">{totalCs}</div>
                                </div>
                                <div>
                                  <div className="text-[10.5px] text-slate-400 font-medium">Godown</div>
                                  <div className="text-[13px] font-bold text-slate-900 truncate">{whName}</div>
                                </div>
                                <div>
                                  <div className="text-[10.5px] text-slate-400 font-medium">Taxable</div>
                                  <div className="text-[13px] font-bold text-slate-900 tabular-nums">₹{money(taxable)}</div>
                                </div>
                              </div>

                              {(g.items || []).length > 0 && (
                                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                                  {(g.items || []).map((item, lineIdx) => (
                                    <div key={item.id || lineIdx} className="px-3 py-2 flex items-center justify-between gap-2 text-[12.5px]">
                                      <div className="min-w-0">
                                        <div className="font-bold text-slate-800 truncate">{item.productName}</div>
                                        <div className="text-[11px] text-slate-500">
                                          {item.qty} cs{item.freeQty ? ` + ${item.freeQty} free` : ''}
                                          {item.unitPrice != null ? ` · ₹${money(item.unitPrice)}/cs` : ''}
                                        </div>
                                      </div>
                                      <div className="font-bold text-slate-900 tabular-nums shrink-0">
                                        ₹{money(Number(item.lineTotal) || 0)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="grid grid-cols-3 gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => downloadSingleGrnCsv(g, warehouses)}
                                  className="min-h-[38px] rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Download size={13} /> CSV
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedGrnToEdit(g);
                                    setIsInwardModalOpen(true);
                                  }}
                                  className="min-h-[38px] rounded-full border border-[#2864d9] bg-white text-[#2864d9] text-[12px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Edit2 size={13} /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setGrnToDelete(g)}
                                  className="min-h-[38px] rounded-full border border-rose-200 bg-rose-50 text-rose-700 text-[12px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Trash2 size={13} /> Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="hh-inv-cta-dock">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(true)}
                  className="hh-inv-btn-outline flex-1"
                >
                  Bulk import
                </button>
                <button
                  type="button"
                  id="btn-add-inward"
                  onClick={() => {
                    setSelectedGrnToEdit(null);
                    setIsInwardModalOpen(true);
                  }}
                  className="hh-inv-btn-primary flex-1"
                >
                  + New purchase
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-4 max-w-none mx-auto w-full">
            {sortedGrns.length === 0 ? (
              <div data-card-tone="neutral" className="rounded-2xl border shadow-sm px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate-800">No purchases yet</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGrnToEdit(null);
                      setIsInwardModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer"
                  >
                    New purchase
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(true)}
                    className="px-4 py-2 rounded-full bg-white border border-black/10 text-slate-700 text-sm font-semibold cursor-pointer"
                  >
                    Bulk import
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="text-xs font-bold text-slate-700">
                    {sortedGrns.length} Inward Purchase Record{sortedGrns.length === 1 ? '' : 's'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadAllGrnsCsv(sortedGrns, warehouses)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-xs transition-colors"
                      title="Download all inward GRNs with full line items and tax breakdown as CSV"
                      aria-label="Download all GRNs as CSV"
                    >
                      <Download size={13} className="text-emerald-700" />
                      <span>CSV<span className="hidden sm:inline"> · all GRNs</span></span>
                    </button>
                  </div>
                </div>
              <ul className="space-y-2.5">
                {sortedGrns.map((g) => {
                  const expanded = !!expandedGrnIds[g.id];
                  const total = Number(g.grandTotal) || 0;
                  const invLabel = g.invoiceNo || '—';
                  const grnLabel = g.grnNumber || `GRN-${g.id}`;
                  const dateLabel = formatInvDate(g.inwardDate || g.invoiceDate);
                  return (
                    <li
                      key={g.id}
                      data-card-tone="received"
                      className="rounded-2xl border shadow-sm overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGrnIds((prev) => ({
                            ...prev,
                            [g.id]: !prev[g.id],
                          }))
                        }
                        className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left cursor-pointer transition-colors"
                        aria-expanded={expanded}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="hh-icon-badge hh-icon-badge--green">
                            <ArrowDownToLine size={18} />
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] sm:text-sm font-bold text-slate-900 leading-snug break-words">
                              {(g.supplierName || 'Supplier').toUpperCase()}
                            </div>
                            <div className="text-[11px] sm:text-[12px] text-slate-600 mt-0.5 break-words">
                              {grnLabel} · Inv {invLabel} · {dateLabel}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm font-extrabold text-emerald-900 tabular-nums shrink-0">
                          ₹{money(total)}
                        </div>
                      </button>

                      {expanded && (
                        <div className="px-3 sm:px-4 pb-4 pt-3 border-t border-black/5 bg-white/85 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div>
                              <div className="text-slate-500 font-medium">Godown</div>
                              <div className="font-semibold text-slate-800">
                                {warehouses.find((w) => w.id === g.warehouseId)?.name ||
                                  g.warehouseId ||
                                  '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500 font-medium">Cases</div>
                              <div className="font-semibold text-slate-800 tabular-nums">
                                {Number(g.totalReceivedQty) ||
                                  (g.items || []).reduce(
                                    (s, it) =>
                                      s +
                                      (Number((it as any).totalReceivedQty) ||
                                        Number((it as any).qty) ||
                                        0),
                                    0,
                                  )}{' '}
                                cs
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500 font-medium">Taxable</div>
                              <div className="font-semibold text-slate-800 tabular-nums">
                                ₹{money(Number(g.totalTaxable) || 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500 font-medium">GST</div>
                              <div className="font-semibold text-slate-800 tabular-nums">
                                ₹
                                {money(
                                  Number(g.totalTax) ||
                                    (Number(g.totalCgst) || 0) + (Number(g.totalSgst) || 0),
                                )}
                              </div>
                            </div>
                          </div>

                          {(g.items || []).length > 0 && (
                            <ul className="rounded-xl border border-black/5 bg-white divide-y divide-black/5 overflow-hidden">
                              {(g.items || []).map((item, idx) => {
                                const prod = products.find((p) => p.id === item.productId);
                                return (
                                <li
                                  key={item.id || idx}
                                  className="px-3 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm"
                                >
                                  <div className="flex items-start gap-2 min-w-0">
                                    <PackIcon size="sm" pack={prod?.pack} name={item.productName} className="mt-0.5" />
                                    <div className="min-w-0">
                                      <span className="font-semibold text-slate-800">
                                        {item.productName}
                                      </span>{' '}
                                      <SizeChip
                                        volume={prod?.volume}
                                        pack={prod?.pack}
                                        name={item.productName}
                                      />
                                      {item.schemeText && (
                                        <span className="ml-1.5 text-[10px] text-purple-700">
                                          {item.schemeText}
                                        </span>
                                      )}
                                      <div className="text-[11px] text-slate-500">
                                        {item.qty} cs
                                        {item.freeQty ? ` + ${item.freeQty} free` : ''}
                                        {item.unitPrice != null
                                          ? ` · ₹${money(item.unitPrice)}/cs`
                                          : ''}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="font-bold tabular-nums text-slate-900 shrink-0">
                                    ₹{money(Number(item.lineTotal) || 0)}
                                  </span>
                                </li>
                                );
                              })}
                            </ul>
                          )}

                          <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => downloadSingleGrnCsv(g, warehouses)}
                              className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm font-semibold text-emerald-800 cursor-pointer hover:bg-emerald-100"
                              title="Download this GRN and its line items as CSV"
                            >
                              <Download size={14} />
                              CSV
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedGrnToEdit(g);
                                setIsInwardModalOpen(true);
                              }}
                              className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-xl bg-white border border-black/10 text-xs sm:text-sm font-semibold text-[var(--primary)] cursor-pointer hover:bg-[var(--primary)]/5"
                            >
                              <Edit2 size={14} />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setGrnToDelete(g)}
                              className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-xs sm:text-sm font-semibold text-rose-700 cursor-pointer hover:bg-rose-100"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              </div>
            )}
          </div>
        );
      })()}


      {activeTab === 'dispositions' && (
        <DispositionsView
          selectedWarehouseFilter={isPhone ? selectedWarehouse : undefined}
          onChangeWarehouseFilter={isPhone ? setSelectedWarehouse : undefined}
        />
      )}

      {activeTab === 'audit' && (
        <div className="flex flex-col gap-3 max-w-none mx-auto w-full">
          {/* Phone-first batch-level count. No fixed/floating bars: the keyboard never covers a row. */}
          <StockAuditScreen
            onGoInventoryTab={(t) => setActiveTab(t)}
            selectedWhId={isPhone ? auditWhId : undefined}
            onChangeWhId={isPhone ? setAuditWhId : undefined}
          />
          {!isPhone && (
            <details className="text-xs text-slate-500 my-2">
              <summary className="cursor-pointer font-semibold text-slate-600 py-1 hover:text-slate-900">
                Audit history &amp; reconciliation
              </summary>
              <div className="mt-3">
                <AuditView embedded />
              </div>
            </details>
          )}
        </div>
      )}

      {/* TAB 4: GODOWN TRANSFERS — multi-line form matching Inventory control UI */}
      {activeTab === 'transfers' && (() => {
        const fromId = xferFromId || warehouses[0]?.id || '';
        const toId = xferToId || warehouses[1]?.id || warehouses[0]?.id || '';
        const availableFor = (productId: number) =>
          fromId ? Math.max(0, warehouseStock(fromId, productId)) : 0;

        const addProductLine = (productId: number) => {
          if (!productId) return;
          if (xferLines.some((l) => l.productId === productId)) {
            showToast('Product already on the transfer list.');
            return;
          }
          const avail = availableFor(productId);
          setXferLines((prev) => [
            ...prev,
            {
              key: `line_${productId}_${Date.now()}`,
              productId,
              qty: avail > 0 ? 1 : 0,
            },
          ]);
        };

        const executeTransfer = () => {
          if (!fromId || !toId || fromId === toId) {
            showToast('Choose two different warehouses.');
            return;
          }
          if (xferLines.length === 0) {
            showToast('Add at least one product.');
            return;
          }
          setXferBusy(true);
          let okCount = 0;
          let failCount = 0;
          let movedTotal = 0;
          const movedParts: string[] = [];
          for (const line of xferLines) {
            const qty = Math.floor(Number(line.qty) || 0);
            if (qty <= 0) continue;
            const avail = availableFor(line.productId);
            const prodName = products.find((p) => p.id === line.productId)?.name || `Product #${line.productId}`;
            if (qty > avail) {
              showToast(`Cannot transfer ${qty} of ${prodName} — only ${avail} available at source.`);
              failCount++;
              continue;
            }
            const result = addStockTransfer({
              date: todayISO(),
              fromWarehouseId: fromId,
              toWarehouseId: toId,
              productId: line.productId,
              batchNumber: '',
              quantity: qty,
              referenceNote: xferNote.trim() || undefined,
            });
            if (result === false) failCount++;
            else {
              okCount++;
              movedTotal += qty;
              movedParts.push(`${prodName} ${qty} cs`);
            }
          }
          setXferBusy(false);
          if (okCount > 0) {
            const fromName = warehouses.find((w) => w.id === fromId)?.name || 'Source';
            const toName = warehouses.find((w) => w.id === toId)?.name || 'Destination';
            const nowStr = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
            if (isPhone) {
              setXferJustDone({
                fromName,
                toName,
                totalCases: movedTotal,
                summary: movedParts.join(' · '),
                timeLabel: `Today ${nowStr}`,
                count: okCount,
              });
              showPhoneToast(`${movedTotal} cs moved from ${fromName} to ${toName}.`);
            } else {
              showToast(
                `Transferred ${okCount} product line${okCount === 1 ? '' : 's'}${failCount ? ` (${failCount} failed)` : ''}.`,
              );
            }
            setXferLines([]);
            setXferNote('');
          } else if (failCount === 0) {
            showToast('Enter quantities greater than zero.');
          }
        };

        const productsNotOnList = products.filter(
          (p) => !xferLines.some((l) => l.productId === p.id),
        );

        if (isPhone) {
          const fromWhName = warehouses.find((w) => w.id === fromId)?.name || 'Main';
          const totalMovingCases = xferLines.reduce((s, l) => s + Math.max(0, Math.floor(Number(l.qty) || 0)), 0);

          if (xferJustDone) {
            return (
              <div className="flex flex-col gap-3 w-full">
                <div className="hh-inv-card hh-inv-card--alert-blue">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-extrabold text-slate-900 flex items-center gap-1.5">
                        <span>{xferJustDone.fromName}</span>
                        <ArrowRight size={14} className="text-slate-400" />
                        <span>{xferJustDone.toName}</span>
                      </div>
                      <div className="text-[12px] text-slate-500 mt-0.5">
                        {xferJustDone.timeLabel} · {xferJustDone.count} product{xferJustDone.count === 1 ? '' : 's'}
                      </div>
                      <div className="text-[12px] font-medium text-slate-700 mt-1">
                        {xferJustDone.summary}
                      </div>
                    </div>
                    <div className="text-[14.5px] font-extrabold text-slate-900 tabular-nums shrink-0">
                      {xferJustDone.totalCases} cs
                    </div>
                  </div>
                </div>

                {stockTransfers.slice(xferJustDone.count, xferJustDone.count + 8).map((st) => {
                  const from = warehouses.find((w) => w.id === st.fromWarehouseId);
                  const to = warehouses.find((w) => w.id === st.toWarehouseId);
                  const prod = products.find((p) => p.id === st.productId);
                  return (
                    <div key={st.id} className="hh-inv-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[14px] font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{from?.name || '?'}</span>
                            <ArrowRight size={13} className="text-slate-400" />
                            <span>{to?.name || '?'}</span>
                          </div>
                          <div className="text-[12px] text-slate-500 mt-0.5">
                            {st.date} · {prod?.name || `Product #${st.productId}`}
                          </div>
                        </div>
                        <div className="text-[14px] font-extrabold text-slate-900 tabular-nums shrink-0">
                          {st.quantity} cs
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setXferJustDone(null)}
                  className="hh-inv-btn-outline w-full mt-1"
                >
                  + New transfer
                </button>
              </div>
            );
          }

          return (
            <div className="flex flex-col gap-3 w-full">
              {/* FROM -> TO godown card */}
              <div className="hh-inv-card flex items-center gap-2.5">
                <label className="hh-inv-field flex-1">
                  <span className="hh-inv-field__label">From</span>
                  <select
                    value={fromId}
                    onChange={(e) => setXferFromId(e.target.value)}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <ArrowRight size={18} className="text-[#2864d9] shrink-0" />
                <label className="hh-inv-field flex-1">
                  <span className="hh-inv-field__label">To</span>
                  <select
                    value={toId}
                    onChange={(e) => setXferToId(e.target.value)}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Products card */}
              <div className="hh-inv-card space-y-2.5">
                {xferLines.length === 0 ? (
                  <p className="text-[12.5px] text-slate-500 py-1">
                    No products selected yet. Add beverages below to move stock.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {xferLines.map((line) => {
                      const prod = products.find((p) => p.id === line.productId);
                      const avail = availableFor(line.productId);
                      const over = line.qty > avail;
                      return (
                        <div key={line.key} className="py-2.5 first:pt-0 flex items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <PackIcon pack={prod?.pack} name={prod?.name} />
                            <div className="min-w-0">
                              <div className="text-[13.5px] font-bold text-slate-900 leading-snug truncate">
                                {prod?.name || `Product #${line.productId}`}
                              </div>
                              <div className={`text-[11.5px] font-medium mt-0.5 ${avail <= 0 || over ? 'text-rose-600' : 'text-slate-500'}`}>
                                Available in {fromWhName}: {avail} cs
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="inline-flex items-center rounded-full border border-[#2864d9] bg-white overflow-hidden">
                              <button
                                type="button"
                                aria-label="Decrease quantity"
                                onClick={() => {
                                  if (line.qty <= 1) {
                                    setXferLines((prev) => prev.filter((l) => l.key !== line.key));
                                  } else {
                                    setXferLines((prev) =>
                                      prev.map((l) => (l.key === line.key ? { ...l, qty: l.qty - 1 } : l))
                                    );
                                  }
                                }}
                                className="w-8 h-8 min-w-0 min-h-0 flex items-center justify-center text-[#2864d9] font-bold cursor-pointer"
                              >
                                <Minus size={14} />
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={avail > 0 ? avail : undefined}
                                value={line.qty}
                                onChange={(e) => {
                                  const v = Math.max(0, Number(e.target.value) || 0);
                                  setXferLines((prev) =>
                                    prev.map((l) => (l.key === line.key ? { ...l, qty: v } : l))
                                  );
                                }}
                                className="w-10 text-center text-[13.5px] font-extrabold text-slate-900 tabular-nums border-0 bg-transparent p-0 focus:outline-none"
                              />
                              <button
                                type="button"
                                aria-label="Increase quantity"
                                onClick={() =>
                                  setXferLines((prev) =>
                                    prev.map((l) => (l.key === line.key ? { ...l, qty: l.qty + 1 } : l))
                                  )
                                }
                                className="w-8 h-8 min-w-0 min-h-0 flex items-center justify-center text-[#2864d9] font-bold cursor-pointer"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!fromId}
                  onClick={() => setShowTransferPicker(true)}
                  className="text-[13px] font-bold text-[#2864d9] py-1 min-h-0 cursor-pointer disabled:opacity-40"
                >
                  + Add product
                </button>
              </div>

              <div className="flex items-center justify-between px-1 py-1 text-[13.5px]">
                <span className="font-medium text-slate-500">Total moving</span>
                <span className="font-extrabold text-slate-900 tabular-nums">{totalMovingCases} cs</span>
              </div>

              <button
                type="button"
                disabled={xferBusy || xferLines.length === 0 || !fromId || !toId || totalMovingCases <= 0}
                onClick={executeTransfer}
                className="hh-inv-btn-primary w-full"
              >
                Transfer stock
              </button>

              {stockTransfers.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="text-[11.5px] font-bold uppercase tracking-wider text-slate-500 px-0.5">
                    Recent transfers
                  </div>
                  {stockTransfers.slice(0, 8).map((st) => {
                    const from = warehouses.find((w) => w.id === st.fromWarehouseId);
                    const to = warehouses.find((w) => w.id === st.toWarehouseId);
                    const prod = products.find((p) => p.id === st.productId);
                    return (
                      <div key={st.id} className="hh-inv-card flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{from?.name || '?'}</span>
                            <ArrowRight size={13} className="text-slate-400" />
                            <span>{to?.name || '?'}</span>
                          </div>
                          <div className="text-[12px] text-slate-500 mt-0.5">
                            {st.date} · {prod?.name || `Product #${st.productId}`}
                          </div>
                        </div>
                        <div className="text-[13.5px] font-extrabold text-slate-900 tabular-nums shrink-0">
                          {st.quantity} cs
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {showTransferPicker && (
                <div className="rt-bsheet-scrim" onClick={() => setShowTransferPicker(false)}>
                  <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
                    <div className="hh-grab" />
                    <h3 className="text-[17px] font-extrabold text-slate-900">Select product</h3>
                    <div className="divide-y divide-slate-100 max-h-[55vh] overflow-y-auto bg-white rounded-2xl border border-slate-200">
                      {[...productsNotOnList]
                        .sort((a, b) => availableFor(b.id) - availableFor(a.id) || a.name.localeCompare(b.name))
                        .map((p) => {
                          const q = availableFor(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                addProductLine(p.id);
                                setShowTransferPicker(false);
                              }}
                              className="w-full px-3.5 py-3 flex items-center justify-between gap-2 text-left cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <PackIcon size="sm" pack={p.pack} name={p.name} />
                                <div className="min-w-0">
                                  <div className="text-[13.5px] font-bold text-slate-900 truncate">{p.name}</div>
                                  <div className="text-[11.5px] text-slate-500">Available in {fromWhName}: {q} cs</div>
                                </div>
                              </div>
                              <span className="text-[12.5px] font-bold text-[#2864d9] shrink-0">Add</span>
                            </button>
                          );
                        })}
                      {productsNotOnList.length === 0 && (
                        <div className="px-4 py-6 text-center text-xs text-slate-500">
                          All products are already added.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-3 max-w-none mx-auto w-full">
            <div data-card-tone="warning" className="rounded-2xl border shadow-sm p-3.5 sm:p-5 space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--amber">
                    <ArrowRightLeft size={15} />
                  </span>
                  <h2 className="text-sm font-bold text-slate-900">Move stock between godowns</h2>
                </div>
                <InfoTip title="How transfers work" size="sm">
                  <p>Earliest-expiry batches move first, so the oldest stock leaves the source godown first.</p>
                </InfoTip>
              </div>

              <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    From
                  </label>
                  <select
                    value={fromId}
                    onChange={(e) => setXferFromId(e.target.value)}
                    className="w-full px-2.5 sm:px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  >
                    <option value="">Choose…</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    To
                  </label>
                  <select
                    value={toId}
                    onChange={(e) => setXferToId(e.target.value)}
                    className="w-full px-2.5 sm:px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  >
                    <option value="">Choose…</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Product lines */}
              <div className="space-y-1">
                {xferLines.length === 0 && (
                  <p className="text-xs text-slate-400 py-1">
                    No products yet — add one below.
                  </p>
                )}
                {xferLines.map((line) => {
                  const prod = products.find((p) => p.id === line.productId);
                  const avail = availableFor(line.productId);
                  const over = line.qty > avail;
                  return (
                    <div
                      key={line.key}
                      className="flex items-center gap-2 sm:gap-3 py-2.5 px-2.5 rounded-xl bg-white/80 border border-black/5"
                    >
                      <PackIcon size="sm" pack={prod?.pack} name={prod?.name} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] sm:text-sm font-semibold text-slate-900 leading-snug break-words">
                          {prod?.name || `Product #${line.productId}`}{' '}
                          <SizeChip volume={prod?.volume} pack={prod?.pack} name={prod?.name} />
                        </div>
                        <div
                          className={`text-[11px] font-medium ${
                            avail <= 0
                              ? 'text-rose-600'
                              : over
                                ? 'text-amber-700'
                                : 'text-slate-500'
                          }`}
                        >
                          Available {avail}
                          {!fromId && ' (select From)'}
                          {over && avail > 0 && ` · max ${avail}`}
                        </div>
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={avail > 0 ? avail : undefined}
                        value={line.qty}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setXferLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key
                                ? { ...l, qty: isNaN(v) ? 0 : v }
                                : l,
                            ),
                          );
                        }}
                        className={`w-16 sm:w-20 shrink-0 px-2 py-1.5 rounded-lg border text-sm text-right font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 ${
                          over ? 'border-rose-400 bg-rose-50' : 'border-black/10'
                        }`}
                      />
                      <button
                        type="button"
                        aria-label="Remove product"
                        onClick={() =>
                          setXferLines((prev) =>
                            prev.filter((l) => l.key !== line.key),
                          )
                        }
                        className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <select
                value=""
                onChange={(e) => {
                  const pid = Number(e.target.value);
                  if (pid) addProductLine(pid);
                }}
                disabled={!fromId}
                className="w-full px-3 py-2.5 rounded-xl border border-dashed border-black/15 bg-slate-50/80 text-sm text-slate-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 disabled:opacity-50"
              >
                <option value="">
                  {fromId ? '+ Add product…' : 'Select From warehouse first…'}
                </option>
                {[...productsNotOnList]
                  .sort((a, b) => {
                    const qa = availableFor(a.id);
                    const qb = availableFor(b.id);
                    if (qa > 0 && qb <= 0) return -1;
                    if (qb > 0 && qa <= 0) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((p) => {
                    const q = availableFor(p.id);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} — {q} available
                      </option>
                    );
                  })}
              </select>

              <input
                type="text"
                value={xferNote}
                onChange={(e) => setXferNote(e.target.value)}
                placeholder="Note (optional) — e.g. Shift to Chakan godown"
                aria-label="Transfer note"
                className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
              />

              <button
                type="button"
                disabled={xferBusy || xferLines.length === 0 || !fromId || !toId}
                onClick={executeTransfer}
                className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-bold text-sm cursor-pointer hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Transfer stock
              </button>
            </div>

            {/* Recent transfers */}
            {stockTransfers.length > 0 && (
              <div data-card-tone="sales" className="rounded-2xl border shadow-sm overflow-hidden">
                <div className="px-3.5 sm:px-4 py-3 border-b border-black/5 flex items-center gap-2.5">
                  <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--blue">
                    <Truck size={15} />
                  </span>
                  <span className="text-sm font-bold text-slate-900">Recent transfers</span>
                </div>
                <ul className="bg-white/80 divide-y divide-black/5 sm:max-h-64 sm:overflow-y-auto">
                  {stockTransfers.slice(0, 12).map((st) => {
                    const from = warehouses.find((w) => w.id === st.fromWarehouseId);
                    const to = warehouses.find((w) => w.id === st.toWarehouseId);
                    const prod = products.find((p) => p.id === st.productId);
                    return (
                      <li
                        key={st.id}
                        className="px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="flex items-start gap-2 min-w-0">
                            <PackIcon size="sm" pack={prod?.pack} name={prod?.name} className="mt-0.5" />
                            <span className="font-semibold text-slate-800 leading-snug break-words min-w-0">
                              {prod?.name || `Product #${st.productId}`}{' '}
                              <SizeChip volume={prod?.volume} pack={prod?.pack} name={prod?.name} />
                            </span>
                          </span>
                          <span className="font-bold tabular-nums text-slate-800 shrink-0">{st.quantity} cs</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500 mt-0.5">
                          <span className="min-w-0 break-words">{from?.name || '?'} → {to?.name || '?'}</span>
                          <span className="text-slate-400 shrink-0">{st.date}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {/* Shared Phone Warehouse Selector Sheet (Stock, Returns & Audit) */}
      {isPhone && showWhSheet && (
        <div className="rt-bsheet-scrim" onClick={() => setShowWhSheet(false)}>
          <div className="rt-bsheet" onClick={(e) => e.stopPropagation()}>
            <div className="hh-grab" />
            <h3 className="text-[17px] font-extrabold text-slate-900">
              {activeTab === 'audit' ? 'Select audit godown' : 'Select godown'}
            </h3>
            <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {activeTab !== 'audit' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWarehouse('all');
                    setShowWhSheet(false);
                  }}
                  className="w-full px-3.5 py-3 flex items-center justify-between text-left text-[14px] font-bold text-slate-900 cursor-pointer"
                >
                  <span>All locations</span>
                  {selectedWarehouse === 'all' && <Check size={16} className="text-[#2864d9]" />}
                </button>
              )}
              {warehouses.map((w) => {
                const isSel = activeTab === 'audit' ? auditWhId === w.id : selectedWarehouse === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      if (activeTab === 'audit') setAuditWhId(w.id);
                      else setSelectedWarehouse(w.id);
                      setShowWhSheet(false);
                    }}
                    className="w-full px-3.5 py-3 flex items-center justify-between text-left text-[14px] font-bold text-slate-900 cursor-pointer"
                  >
                    <span>{w.name}</span>
                    {isSel && <Check size={16} className="text-[#2864d9]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Dark Bottom Toast (phone) */}
      {isPhone && darkToast && (
        <div className="hh-inv-toast" role="status" aria-live="polite">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <span className="leading-snug">{darkToast}</span>
        </div>
      )}

      {/* Inward Consignment Modal */}
      <InwardConsignmentModal
        isOpen={isInwardModalOpen}
        onClose={() => {
          setIsInwardModalOpen(false);
          setSelectedProductForInward(undefined);
          setSelectedGrnToEdit(null);
        }}
        preselectedWarehouseId={selectedWarehouse !== 'all' ? selectedWarehouse : undefined}
        preselectedProductId={selectedProductForInward}
        initialGrnToEdit={selectedGrnToEdit}
        onOpenBulkImport={() => {
          setIsInwardModalOpen(false);
          setIsBulkModalOpen(true);
        }}
        onSaved={(info) => {
          if (info.grnId) setLastNewGrnId(info.grnId);
          setActiveTab('consignments');
          if (isPhone) {
            showPhoneToast(
              info.isEdit
                ? `Purchase updated. Stock ${info.cases} cs in ${info.warehouseName}.`
                : `Purchase saved. Stock +${info.cases} cs in ${info.warehouseName}.`
            );
          }
        }}
      />

      {/* Bulk Inward Modal */}
      <BulkInwardModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={(grnNumber, itemCount, extra) => {
          if (extra?.grnId) setLastNewGrnId(extra.grnId);
          setIsBulkModalOpen(false);
          setActiveTab('consignments');
          if (isPhone && extra?.totalCases !== undefined && extra?.warehouseName) {
            showPhoneToast(`Imported ${itemCount} lines as ${grnNumber}. Stock +${extra.totalCases} cs in ${extra.warehouseName}.`);
          } else {
            showToast(`Recorded inward consignment ${grnNumber} with ${itemCount} items. Stock and products updated!`);
          }
        }}
      />

      {/* Double-Confirmation Delete Consignment Modal */}
      {grnToDelete && (
        <ConfirmDeleteModal
          isOpen={!!grnToDelete}
          onClose={() => setGrnToDelete(null)}
          onConfirm={() => {
            const grnNum = grnToDelete.grnNumber;
            const cases = grnToDelete.totalReceivedQty;
            deleteGrn(grnToDelete.id);
            showToast(`Deleted ${grnNum}. Reversed ${cases} crates from inventory.`);
            setGrnToDelete(null);
          }}
          title="Delete Inward Consignment & Reverse Stock"
          subtitle={`${grnToDelete.grnNumber} • ${grnToDelete.supplierName} • Inv #${grnToDelete.invoiceNo}`}
          warningNote={`Deleting this inward invoice will permanently remove the record and automatically reverse all ${grnToDelete.totalReceivedQty} received crates from godown stock.`}
          confirmationPrompt={`I confirm that I want to reverse invoice ${grnToDelete.invoiceNo} and deduct ${grnToDelete.totalReceivedQty} cases.`}
          confirmButtonLabel="Permanently Delete & Reverse Stock"
          impactItems={[
            {
              label: 'Stock Deduction',
              detail: `Reversal from ${warehouses.find((w) => w.id === grnToDelete.warehouseId)?.name || 'Godowns'}`,
              qtyChange: `-${grnToDelete.totalReceivedQty} cs`,
            },
            {
              label: 'Invoice Grand Total',
              detail: `Reversal of ₹${money(grnToDelete.grandTotal)}`,
            },
            {
              label: 'Supplier & Invoice',
              detail: `${grnToDelete.supplierName} (Inv: ${grnToDelete.invoiceNo}, Dated: ${grnToDelete.inwardDate})`,
            },
            {
              label: 'Affected Line Items',
              detail:
                grnToDelete.items
                  .map((it) => `${it.productName}: -${it.totalReceivedQty} cs`)
                  .slice(0, 4)
                  .join(', ') + (grnToDelete.items.length > 4 ? ` + ${grnToDelete.items.length - 4} more` : ''),
            },
          ]}
        />
      )}
      {oversoldInspect.open && (
        <OversoldInspectorModal
          items={oversoldReport}
          initialProductId={oversoldInspect.productId}
          initialWarehouseId={oversoldInspect.warehouseId}
          onClose={() => setOversoldInspect({ open: false })}
          isAdmin={currentRole === 'admin'}
          onClearDeficits={clearOversoldDeficits}
          onReassign={reassignBillsProductWarehouse}
          onUndoReassign={undoLastOversoldReassign}
          hasUndo={hasOversoldReassignUndo}
          onStartAudit={(whId) => {
            if (whId) setAuditWhId(whId);
            setActiveTab('audit');
          }}
          onGoTransfer={(pid, fromWh, toWh) => {
            if (fromWh) setXferFromId(fromWh);
            if (toWh) setXferToId(toWh);
            setXferJustDone(null);
            setXferLines([{ key: `line_${pid}_${Date.now()}`, productId: pid, qty: 1 }]);
            setActiveTab('transfers');
          }}
        />
      )}
    </div>
  );
};
