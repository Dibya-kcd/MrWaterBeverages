import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  Boxes,
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
import { CATS } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { GRN } from '../../types';
import { generateSkuId, money } from '../../utils/billing';
import { collectExpiryAlerts } from '../../utils/fefo';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { EmptyState } from '../common/EmptyState';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { AuditView } from './AuditView';
import { BulkInwardModal } from './BulkInwardModal';
import { InwardConsignmentModal } from './InwardConsignmentModal';
import { WarehousesView } from './WarehousesView';
import { DispositionsView } from './DispositionsView';
import { trackedStage } from './ExpiryReturnsTracker';
import { InfoTip } from "../common/InfoTip";
import { todayISO } from "../../utils/dateLocal";
import { downloadAllGrnsCsv, downloadSingleGrnCsv } from '../../utils/grnCsvExport';

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
    saveAudit,
    bookStock,
    inventoryDispositions,
  } = useLedger();

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

  // ── Multi-line inter-godown transfer (Inventory control → Transfer) ──
  type TransferLine = { key: string; productId: number; qty: number };
  const [xferFromId, setXferFromId] = useState('');
  const [xferToId, setXferToId] = useState('');
  const [xferLines, setXferLines] = useState<TransferLine[]>([]);
  const [xferNote, setXferNote] = useState('');
  const [xferBusy, setXferBusy] = useState(false);

  // ── Stock audit (batch-level, matches Inventory control UI) ──
  const [auditWhId, setAuditWhId] = useState('');
  const [auditCounts, setAuditCounts] = useState<Record<string, string>>({});
  const [auditNote, setAuditNote] = useState('');
  const [auditSearch, setAuditSearch] = useState('');

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
    if (!auditWhId && warehouses[0]?.id) setAuditWhId(warehouses[0].id);
  }, [warehouses, xferFromId, xferToId, auditWhId]);

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

  return (
    <div id="view-inventory" className="mw-workspace flex flex-col gap-4 sm:gap-5 w-full min-w-0 max-w-full">
      {/* Toast Notification */}
      {notification && (
        <div className="flex items-center gap-2 p-3 bg-[#0d4a3a] text-white rounded-2xl shadow-md animate-fade-in text-sm font-semibold">
          <CheckCircle2 size={18} />
          <span>{notification}</span>
        </div>
      )}

      {/* Workspace header — Inventory & Inward */}
      <div className="flex flex-col gap-3 w-full min-w-0">
        <div className="hidden sm:block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
          Workspace <span className="text-slate-300 mx-1">/</span> Inventory
        </div>
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Inventory
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">
              {totalStockCases.toLocaleString()} units on hand
              <span className="hidden sm:inline"> · {grns.length} inward record{grns.length === 1 ? '' : 's'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Sub-tabs — pill segmented control (Customers screen pattern), scrollable on mobile */}
      <div className="w-full">
        <div className="grid grid-cols-5 w-full bg-[#ebe8e1] rounded-2xl sm:rounded-full p-1 gap-0.5">
          {(
            [
              { id: 'realtime' as const, label: 'Stock', count: products.length, icon: Boxes },
              { id: 'consignments' as const, label: 'Inward', count: grns.length, icon: ArrowDownToLine },
              { id: 'audit' as const, label: 'Audit', count: undefined as number | undefined, icon: ClipboardCheck },
              { id: 'dispositions' as const, label: 'Returns', count: pendingExpiryReturns || undefined, icon: AlertTriangle },
              { id: 'transfers' as const, label: 'Transfer', count: undefined as number | undefined, icon: ArrowRightLeft },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                id={`tab-${t.id}`}
                onClick={() => setActiveTab(t.id)}
                className={`relative min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-0.5 sm:px-3 py-1.5 sm:py-2.5 rounded-xl sm:rounded-full text-[10px] leading-tight sm:text-sm font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon size={15} className={`shrink-0 ${active ? 'text-[#0d4a3a]' : 'text-slate-400'}`} />
                <span className="truncate max-w-full">{t.label}</span>
                {t.count !== undefined && (
                  <span
                    className={`${
                      t.id === 'dispositions'
                        ? 'absolute top-0.5 right-1 sm:static bg-amber-500 text-white sm:bg-black/5 sm:text-slate-500'
                        : 'hidden sm:inline-block'
                    } text-[10px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-px sm:py-0.5 rounded-full tabular-nums ${
                      active ? 'sm:!bg-[#ebe8e1] sm:!text-[#0d4a3a]' : ''
                    } ${t.id === 'dispositions' ? '' : active ? 'bg-[#ebe8e1] text-[#0d4a3a]' : 'bg-black/5 text-slate-500'}`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

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

        return (
          <div className="flex flex-col gap-4 max-w-none lg:max-w-3xl mx-auto w-full">
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
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 rounded-full border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/25"
                />
              </div>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="w-full sm:w-48 px-3 py-2.5 rounded-full border border-black/10 bg-white text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/25"
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
              <div className="rounded-2xl border border-black/8 bg-white shadow-sm px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate-700">No stock to show</p>
                <p className="text-xs text-slate-500 mt-1">
                  Adjust search or location, or receive inward stock.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {stockProducts.map(({ p, batches, headerQty }) => {
                  const expanded = !!expandedBatchProductIds[p.id];
                  const hasDetail = batches.length > 0;
                  return (
                    <li
                      key={p.id}
                      className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBatchProductIds((prev) => ({
                            ...prev,
                            [p.id]: !prev[p.id],
                          }))
                        }
                        className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left cursor-pointer hover:bg-slate-50/80 transition-colors"
                        aria-expanded={expanded}
                      >
                        <span className="text-[13px] sm:text-sm font-bold text-slate-900 leading-snug break-words min-w-0">
                          {p.name}
                        </span>
                        <span
                          className={`text-sm font-extrabold tabular-nums shrink-0 ${
                            headerQty < 0
                              ? 'text-rose-600'
                              : headerQty === 0
                                ? 'text-slate-400'
                                : 'text-slate-900'
                          }`}
                        >
                          {headerQty} cs
                        </span>
                      </button>

                      {expanded && (
                        <div className="border-t border-black/5 bg-[#faf9f6]/80">
                          {productWarehouseStock(p.id)
                            .filter((r) => r.crates < 0 && (selectedWarehouse === 'all' || r.warehouseId === selectedWarehouse))
                            .map((r) => (
                              <div key={`neg_${r.warehouseId}`} className="px-3 sm:px-4 py-2 text-[11px] font-semibold text-rose-700 bg-rose-50 border-b border-rose-100">
                                Oversold in {r.warehouseName}: book balance {r.crates} cs. Check the godown on those bills or run a stock audit.
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

        return (
          <div className="flex flex-col gap-4 max-w-none lg:max-w-3xl mx-auto w-full">
            {sortedGrns.length === 0 ? (
              <div className="rounded-2xl border border-black/8 bg-white shadow-sm px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate-800">No purchases yet</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGrnToEdit(null);
                      setIsInwardModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-full bg-[#0d4a3a] text-white text-sm font-semibold cursor-pointer"
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
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGrnToEdit(null);
                        setIsInwardModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0d4a3a] text-xs font-semibold text-white hover:bg-[#0a3d30] cursor-pointer shadow-xs"
                    >
                      <Plus size={13} />
                      <span>New purchase</span>
                    </button>
                  </div>
                </div>
              <ul className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden divide-y divide-black/5">
                {sortedGrns.map((g) => {
                  const expanded = !!expandedGrnIds[g.id];
                  const total = Number(g.grandTotal) || 0;
                  const invLabel = g.invoiceNo || '—';
                  const grnLabel = g.grnNumber || `GRN-${g.id}`;
                  const dateLabel = formatInvDate(g.inwardDate || g.invoiceDate);
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGrnIds((prev) => ({
                            ...prev,
                            [g.id]: !prev[g.id],
                          }))
                        }
                        className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left hover:bg-slate-50/80 cursor-pointer transition-colors"
                        aria-expanded={expanded}
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] sm:text-sm font-bold text-slate-900 leading-snug break-words">
                            {(g.supplierName || 'Supplier').toUpperCase()}
                          </div>
                          <div className="text-[11px] sm:text-[12px] text-slate-500 mt-0.5 break-words">
                            {grnLabel} · Inv {invLabel} · {dateLabel}
                          </div>
                        </div>
                        <div className="text-sm font-extrabold text-slate-900 tabular-nums shrink-0">
                          ₹{money(total)}
                        </div>
                      </button>

                      {expanded && (
                        <div className="px-3 sm:px-4 pb-4 pt-2 border-t border-black/5 bg-[#faf9f6]/90 space-y-3">
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
                              {(g.items || []).map((item, idx) => (
                                <li
                                  key={item.id || idx}
                                  className="px-3 py-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                                >
                                  <div className="min-w-0">
                                    <span className="font-semibold text-slate-800">
                                      {item.productName}
                                    </span>
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
                                  <span className="font-bold tabular-nums text-slate-900 shrink-0">
                                    ₹{money(Number(item.lineTotal) || 0)}
                                  </span>
                                </li>
                              ))}
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
                              className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-xl bg-white border border-black/10 text-xs sm:text-sm font-semibold text-[#0d4a3a] cursor-pointer hover:bg-[#0d4a3a]/5"
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
        <DispositionsView />
      )}

      {activeTab === 'audit' && (() => {
        const whId = auditWhId || warehouses[0]?.id || '';
        // System qty = LIVE remaining per batch at this godown (received minus sales, returns,
        // disposals and earlier audit adjustments), not the original inward quantity.
        const rows = products
          .flatMap((prod) =>
            productBatchLines(prod.id)
              .filter((l) => !whId || l.warehouseId === whId)
              .map((l) => ({
                key: l.key,
                batch: { productId: prod.id, batchNumber: l.batchNumber, expiryDate: l.expiryDate },
                name: prod.name,
                systemQty: l.availableQty,
              })),
          )
          .sort((a, b) => a.name.localeCompare(b.name) || (a.batch.batchNumber || '').localeCompare(b.batch.batchNumber || ''));

        // Also include products with live stock but no batch rows at this warehouse
        const productIdsWithBatches = new Set(rows.map((r) => r.batch.productId));
        const orphanProducts = products
          .filter((p) => !productIdsWithBatches.has(p.id))
          .map((p) => {
            const sys = whId ? warehouseStock(whId, p.id) : bookStock(p.id);
            return { key: `prod_${p.id}`, productId: p.id, name: p.name, systemQty: sys };
          })
          .filter((r) => r.systemQty !== 0);

        const handleSaveAudit = () => {
          // Product-level count for THIS godown. A batch left blank "matches", so it counts as its
          // system quantity; otherwise a partly filled product would look short by the blank batches.
          const counts: Record<number, string> = {};
          const entered = new Set<number>();
          const totals: Record<number, number> = {};
          for (const r of rows) {
            const raw = auditCounts[r.key];
            const has = raw !== undefined && raw !== '' && !isNaN(Number(raw));
            if (has) entered.add(r.batch.productId);
            totals[r.batch.productId] =
              (totals[r.batch.productId] || 0) + (has ? Number(raw) : r.systemQty);
          }
          for (const o of orphanProducts) {
            const raw = auditCounts[o.key];
            if (raw === undefined || raw === '' || isNaN(Number(raw))) continue;
            entered.add(o.productId);
            totals[o.productId] = (totals[o.productId] || 0) + Number(raw);
          }
          for (const pid of entered) counts[pid] = String(totals[pid]);
          if (Object.keys(counts).length === 0) {
            showToast('Enter at least one counted quantity.');
            return;
          }
          saveAudit(counts, true, todayISO(), auditNote || undefined, whId || undefined);
          setAuditCounts({});
          setAuditNote('');
          showToast('Stock audit saved. Differences posted to live stock.');
        };

        // Quick filter so a long list can be searched by name or batch.
        const q = auditSearch.trim().toLowerCase();
        const matches = (name: string, batch?: string) =>
          !q || name.toLowerCase().includes(q) || (batch || '').toLowerCase().includes(q);
        const visibleRows = rows.filter((r) => matches(r.name, r.batch.batchNumber));
        const visibleOrphans = orphanProducts.filter((o) => matches(o.name));

        const allKeys = [
          ...rows.map((r) => ({ key: r.key, sys: r.systemQty })),
          ...orphanProducts.map((o) => ({ key: o.key, sys: o.systemQty })),
        ];
        let countedLines = 0;
        let diffLines = 0;
        for (const k of allKeys) {
          const raw = auditCounts[k.key];
          if (raw === undefined || raw === '' || isNaN(Number(raw))) continue;
          countedLines++;
          if (Number(raw) !== k.sys) diffLines++;
        }

        // One shared row renderer: stacked card on phones (full product name on its own line,
        // then System / Counted / Diff), classic 4-column grid from `sm` upwards.
        const renderAuditRow = (opts: {
          key: string;
          name: string;
          meta: string;
          systemQty: number;
        }) => {
          const countedStr = auditCounts[opts.key] ?? '';
          const hasCount = countedStr !== '';
          const counted = hasCount ? Number(countedStr) : NaN;
          const diff = hasCount && !isNaN(counted) ? counted - opts.systemQty : null;
          return (
            <li
              key={opts.key}
              className={`grid grid-cols-[1fr_1.4fr_1fr] sm:grid-cols-[1fr_5rem_5.5rem_4rem] gap-x-3 gap-y-1.5 sm:gap-y-0 px-3 sm:px-4 py-2.5 sm:py-3 items-start sm:items-center ${
                diff !== null && diff !== 0 ? 'bg-amber-50/50' : ''
              }`}
            >
              <div className="col-span-3 sm:col-span-1 min-w-0">
                <div className="text-[13px] sm:text-sm font-semibold text-slate-900 leading-snug break-words">
                  {opts.name}
                </div>
                <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{opts.meta}</div>
              </div>
              <div className="sm:text-right">
                <div className="sm:hidden text-[10px] font-bold uppercase tracking-wide text-slate-400">System</div>
                <div
                  className={`h-[38px] sm:h-auto flex items-center sm:justify-end text-sm font-bold tabular-nums ${
                    opts.systemQty < 0 ? 'text-rose-600' : 'text-slate-800'
                  }`}
                >
                  {opts.systemQty}
                </div>
              </div>
              <div>
                <div className="sm:hidden text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Counted</div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={countedStr}
                  placeholder="—"
                  aria-label={`Counted quantity for ${opts.name}`}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setAuditCounts((prev) => ({
                      ...prev,
                      [opts.key]: e.target.value,
                    }))
                  }
                  className="w-full sm:max-w-[5rem] sm:ml-auto block px-2 py-1.5 rounded-lg border border-black/10 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                />
              </div>
              <div className="sm:text-right">
                <div className="sm:hidden text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right">Diff</div>
                <div
                  className={`h-[38px] sm:h-auto flex items-center justify-end text-sm font-semibold tabular-nums ${
                    diff === null
                      ? 'text-slate-300'
                      : diff === 0
                        ? 'text-emerald-600'
                        : diff > 0
                          ? 'text-sky-700'
                          : 'text-rose-600'
                  }`}
                >
                  {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                </div>
              </div>
            </li>
          );
        };

        const fmtExp = (d?: string) =>
          d
            ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
            : '—';

        return (
          <div className="flex flex-col gap-3 max-w-none lg:max-w-3xl mx-auto w-full">
            {/* Toolbar: godown + search + how-it-works */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-1.5 sm:w-56">
                <select
                  value={whId}
                  aria-label="Godown to audit"
                  onChange={(e) => {
                    setAuditWhId(e.target.value);
                    setAuditCounts({});
                  }}
                  className="flex-1 min-w-0 px-3 py-2 sm:py-2.5 rounded-full border border-black/10 bg-white text-sm font-medium text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/25"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <InfoTip title="How the stock audit works">
                  <p>Count what is physically on the shelf and type it under <strong>Counted</strong>. Leave a line blank if it matches the system.</p>
                  <p>Differences are posted as audit adjustments to live stock and kept in the ledger.</p>
                </InfoTip>
              </div>
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Search product or batch"
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 rounded-full border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/25"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_5rem_5.5rem_4rem] gap-3 px-4 py-2.5 border-b border-black/5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <div>Product / batch</div>
                <div className="text-right">System</div>
                <div className="text-right">Counted</div>
                <div className="text-right">Diff</div>
              </div>
              <div className="sm:hidden flex items-center justify-between px-3 py-2 border-b border-black/5 text-[11px] font-semibold text-slate-500">
                <span>{visibleRows.length + visibleOrphans.length} lines</span>
                <span>
                  {countedLines} counted
                  {diffLines > 0 && <span className="text-amber-700"> · {diffLines} differ</span>}
                </span>
              </div>
              <ul className="divide-y divide-black/5 sm:max-h-[60vh] sm:overflow-y-auto">
                {visibleRows.length === 0 && visibleOrphans.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-slate-500">
                    {q ? 'No lines match your search.' : 'No stock lines for this godown.'}
                  </li>
                )}
                {visibleRows.map((r) =>
                  renderAuditRow({
                    key: r.key,
                    name: r.name,
                    meta: `Batch ${r.batch.batchNumber || '—'} · Exp ${fmtExp(r.batch.expiryDate)}`,
                    systemQty: r.systemQty,
                  }),
                )}
                {visibleOrphans.map((o) =>
                  renderAuditRow({
                    key: o.key,
                    name: o.name,
                    meta: 'No batch · book stock',
                    systemQty: o.systemQty,
                  }),
                )}
              </ul>
            </div>

            {/* Save bar — fixed above the bottom nav on phone/tablet so it is always reachable on a long list.
                (position: sticky does not engage here because ancestors use overflow:auto.) */}
            <div className="lg:hidden h-14" aria-hidden="true" />
            <div className="fixed inset-x-0 z-30 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:static lg:z-auto px-3 sm:px-6 lg:px-0 py-2 bg-[#f6f4ef]/95 backdrop-blur border-t border-black/5 lg:border-0 lg:bg-transparent lg:backdrop-blur-none lg:py-0">
              <div className="max-w-none lg:max-w-3xl mx-auto flex flex-row gap-2 items-center">
                <input
                  type="text"
                  value={auditNote}
                  onChange={(e) => setAuditNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
                />
                <button
                  type="button"
                  onClick={handleSaveAudit}
                  disabled={countedLines === 0}
                  className="shrink-0 px-4 sm:px-5 py-2.5 rounded-xl bg-[#0d4a3a] text-white font-semibold text-sm cursor-pointer hover:bg-[#0a3d30] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Save{countedLines > 0 ? ` (${countedLines})` : ''}
                </button>
              </div>
            </div>

            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold text-slate-600 py-1">
                Audit history &amp; reconciliation
              </summary>
              <div className="mt-3">
                <AuditView embedded />
              </div>
            </details>
          </div>
        );
      })()}

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
          for (const line of xferLines) {
            const qty = Math.floor(Number(line.qty) || 0);
            if (qty <= 0) continue;
            const avail = availableFor(line.productId);
            if (qty > avail) {
              const name =
                products.find((p) => p.id === line.productId)?.name ||
                `Product #${line.productId}`;
              showToast(
                `Cannot transfer ${qty} of ${name} — only ${avail} available at source.`,
              );
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
            else okCount++;
          }
          setXferBusy(false);
          if (okCount > 0) {
            showToast(
              `Transferred ${okCount} product line${okCount === 1 ? '' : 's'}${failCount ? ` (${failCount} failed)` : ''}.`,
            );
            setXferLines([]);
            setXferNote('');
          } else if (failCount === 0) {
            showToast('Enter quantities greater than zero.');
          }
        };

        const productsNotOnList = products.filter(
          (p) => !xferLines.some((l) => l.productId === p.id),
        );

        return (
          <div className="flex flex-col gap-3 max-w-none lg:max-w-3xl mx-auto w-full">
            <div className="rounded-2xl border border-black/8 bg-white shadow-sm p-3 sm:p-5 space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-800">Move stock between godowns</h2>
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
                    className="w-full px-2.5 sm:px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
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
                    className="w-full px-2.5 sm:px-3 py-2.5 rounded-xl border border-black/10 bg-white text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
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
                      className="flex items-center gap-2 sm:gap-3 py-2.5 border-b border-black/5 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] sm:text-sm font-semibold text-slate-900 leading-snug break-words">
                          {prod?.name || `Product #${line.productId}`}
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
                        className={`w-16 sm:w-20 shrink-0 px-2 py-1.5 rounded-lg border text-sm text-right font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30 ${
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
                className="w-full px-3 py-2.5 rounded-xl border border-dashed border-black/15 bg-slate-50/80 text-sm text-slate-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30 disabled:opacity-50"
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
                className="w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4a3a]/30"
              />

              <button
                type="button"
                disabled={xferBusy || xferLines.length === 0 || !fromId || !toId}
                onClick={executeTransfer}
                className="w-full py-3 rounded-xl bg-[#0d4a3a] text-white font-bold text-sm cursor-pointer hover:bg-[#0a3d30] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Transfer stock
              </button>
            </div>

            {/* Recent transfers */}
            {stockTransfers.length > 0 && (
              <div className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden">
                <div className="px-3 sm:px-4 py-2.5 border-b border-black/5 text-sm font-bold text-slate-800">
                  Recent transfers
                </div>
                <ul className="divide-y divide-black/5 sm:max-h-64 sm:overflow-y-auto">
                  {stockTransfers.slice(0, 12).map((st) => {
                    const from = warehouses.find((w) => w.id === st.fromWarehouseId);
                    const to = warehouses.find((w) => w.id === st.toWarehouseId);
                    const prod = products.find((p) => p.id === st.productId);
                    return (
                      <li
                        key={st.id}
                        className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-semibold text-slate-800 leading-snug break-words min-w-0">
                            {prod?.name || `Product #${st.productId}`}
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
      />

      {/* Bulk Inward Modal */}
      <BulkInwardModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={(grnNumber, itemCount) => {
          showToast(`Recorded inward consignment ${grnNumber} with ${itemCount} items. Stock and products updated!`);
          setIsBulkModalOpen(false);
          setActiveTab('consignments');
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
    </div>
  );
};
