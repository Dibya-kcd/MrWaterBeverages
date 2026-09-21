import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  Boxes,
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
  Plus,
  PlusCircle,
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
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { AuditView } from './AuditView';
import { BulkInwardModal } from './BulkInwardModal';
import { InwardConsignmentModal } from './InwardConsignmentModal';
import { WarehousesView } from './WarehousesView';

export type InventorySubTab = 'realtime' | 'consignments' | 'audit' | 'transfers' | 'warehouses' | 'batches';

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
    palette,
    fz,
    scale,
    billingSettings,
    setTab,
  } = useLedger();

  const resolveTab = (tabName?: InventorySubTab): 'realtime' | 'consignments' | 'audit' | 'transfers' => {
    if (tabName === 'audit') return 'audit';
    if (tabName === 'transfers' || tabName === 'warehouses' || tabName === 'batches') return 'transfers';
    if (tabName === 'consignments') return 'consignments';
    return 'realtime';
  };

  const [activeTab, setActiveTab] = useState<'realtime' | 'consignments' | 'audit' | 'transfers'>(
    resolveTab(initialSubTab)
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [stockLevelFilter, setStockLevelFilter] = useState<'all' | 'instock' | 'low' | 'out'>('all');
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

  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(resolveTab(initialSubTab));
    }
  }, [initialSubTab]);

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

  const filteredProducts = products.filter((p) => {
    const sku = p.sku || generateSkuId(p.name, p.category, p.id);
    const matchName =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = selectedCat === 'all' || p.category === selectedCat;
    const matchWh = selectedWarehouse === 'all' || p.warehouseId === selectedWarehouse;
    const rem = remainingStock(p.id);
    const threshold = billingSettings?.lowStockThreshold ?? 10;
    let matchStock = true;
    if (stockLevelFilter === 'instock') matchStock = rem > 0;
    else if (stockLevelFilter === 'low') matchStock = rem <= threshold && rem > 0;
    else if (stockLevelFilter === 'out') matchStock = rem <= 0;

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
        p.batchNumber || '',
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
    link.download = `inventory_crates_realtime_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalStockCases = filteredProducts.reduce((s, p) => s + remainingStock(p.id), 0);
  const totalStockValue = filteredProducts.reduce(
    (s, p) => s + remainingStock(p.id) * p.wholesale,
    0
  );
  const totalSoldCrates = filteredProducts.reduce((s, p) => s + (soldByProduct[p.id] || 0), 0);
  const lowStockCount = filteredProducts.filter(
    (p) => remainingStock(p.id) < (billingSettings?.lowStockThreshold ?? 5)
  ).length;

  return (
    <div id="view-inventory" className="p-3 sm:p-5 lg:p-6 max-w-7xl mx-auto flex flex-col gap-4 sm:gap-5 w-full">
      {/* Toast Notification */}
      {notification && (
        <div className="flex items-center gap-2 p-3 bg-emerald-700 text-white rounded-md shadow-md animate-fade-in text-sm font-semibold">
          <CheckCircle2 size={18} />
          <span>{notification}</span>
        </div>
      )}

      {/* Header Banner - Responsive fit for all screens */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: palette.ink }}>
            Inventory Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time crate tracking, godown stock & inward consignments
          </p>
        </div>

        {/* Action Buttons with prominent icons & dynamic screen adaptability */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Inward Invoice */}
          <button
            id="btn-receive-inward"
            type="button"
            onClick={() => {
              setSelectedGrnToEdit(null);
              setSelectedProductForInward(undefined);
              setIsInwardModalOpen(true);
            }}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-bold rounded-lg shadow-xs cursor-pointer transition-all text-xs sm:text-sm whitespace-nowrap"
            title="Record an inward consignment invoice from supplier or truck"
          >
            <PlusCircle size={16} className="shrink-0" />
            <span>Inward Invoice</span>
          </button>

          {/* Bulk Inward */}
          <button
            id="btn-bulk-inward"
            type="button"
            onClick={() => setIsBulkModalOpen(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-2 border-indigo-200 hover:border-indigo-300 font-bold rounded-lg cursor-pointer transition-all text-xs sm:text-sm whitespace-nowrap shadow-xs"
            title="Import invoices from PDF, Excel, CSV, or Image"
          >
            <Upload size={16} className="shrink-0 text-indigo-700" />
            <span>Bulk Inward</span>
          </button>

          {/* Export CSV */}
          <button
            id="btn-export-inventory"
            type="button"
            onClick={exportInventoryCsv}
            disabled={products.length === 0}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-300 font-bold rounded-lg cursor-pointer transition-all text-xs sm:text-sm whitespace-nowrap shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export real-time inventory to CSV spreadsheet"
          >
            <Download size={16} className="shrink-0 text-slate-600" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Quick Metrics Bar - Dynamic 2-col on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="p-3 sm:p-3.5 border-2 rounded-xl shadow-xs flex flex-col justify-between" style={cardStyle}>
          <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Available Stock</div>
          <div className="text-xl sm:text-2xl font-black mt-1 truncate" style={{ color: palette.navy }}>
            {totalStockCases}{' '}
            <span className="text-xs font-semibold text-slate-500">crates</span>
          </div>
          {lowStockCount > 0 ? (
            <div className="text-[11px] font-bold text-rose-600 mt-0.5 flex items-center gap-1">
              <AlertTriangle size={12} className="shrink-0" /> {lowStockCount} low-stock item(s)
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 mt-0.5 font-medium">All items healthy</div>
          )}
        </div>

        <div className="p-3 sm:p-3.5 border-2 rounded-xl shadow-xs flex flex-col justify-between" style={cardStyle}>
          <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Inward Invoices</div>
          <div className="text-xl sm:text-2xl font-black text-blue-900 mt-1 truncate">
            {grns.length}{' '}
            <span className="text-xs font-semibold text-slate-500">invoices</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Logged consignments</div>
        </div>

        <div className="p-3 sm:p-3.5 border-2 rounded-xl shadow-xs flex flex-col justify-between" style={cardStyle}>
          <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Godown Locations</div>
          <div className="text-xl sm:text-2xl font-black text-indigo-900 mt-1 truncate">
            {warehouses.length}{' '}
            <span className="text-xs font-semibold text-slate-500">facilities</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Central & regional depots</div>
        </div>

        <div className="p-3 sm:p-3.5 border-2 rounded-xl shadow-xs flex flex-col justify-between" style={cardStyle}>
          <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Inventory Valuation</div>
          <div className="text-xl sm:text-2xl font-black text-emerald-800 mt-1 truncate">
            ₹{money(totalStockValue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">At wholesale rate</div>
        </div>
      </div>

      {/* Sub-Tab Navigation - Dynamic 2x2 grid on mobile, sleek 1x4 segmented row on tablet/desktop */}
      <div className="w-full bg-slate-100/90 p-1 sm:p-1.5 rounded-xl border-2 border-slate-200">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-1.5">
          {/* Live Stock Tab */}
          <button
            type="button"
            id="tab-live-stock"
            onClick={() => setActiveTab('realtime')}
            className={`flex items-center justify-between gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
              activeTab === 'realtime'
                ? 'bg-white text-blue-900 border-blue-200 shadow-sm ring-1 ring-blue-500/20'
                : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60 border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <Boxes size={16} className={`shrink-0 ${activeTab === 'realtime' ? 'text-blue-700' : 'text-slate-400'}`} />
              <span className="truncate">Live Stock</span>
            </div>
            <span
              className={`text-[10px] sm:text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                activeTab === 'realtime' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {products.length}
            </span>
          </button>

          {/* Inward Invoices Tab */}
          <button
            type="button"
            id="tab-inward-invoices"
            onClick={() => setActiveTab('consignments')}
            className={`flex items-center justify-between gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
              activeTab === 'consignments'
                ? 'bg-white text-blue-900 border-blue-200 shadow-sm ring-1 ring-blue-500/20'
                : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60 border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <ArrowDownToLine size={16} className={`shrink-0 ${activeTab === 'consignments' ? 'text-blue-700' : 'text-slate-400'}`} />
              <span className="truncate">Inward Invoices</span>
            </div>
            <span
              className={`text-[10px] sm:text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                activeTab === 'consignments' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {grns.length}
            </span>
          </button>

          {/* Physical Stock Audit Tab */}
          <button
            type="button"
            id="tab-stock-audit"
            onClick={() => setActiveTab('audit')}
            className={`flex items-center justify-between gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
              activeTab === 'audit'
                ? 'bg-white text-blue-900 border-blue-200 shadow-sm ring-1 ring-blue-500/20'
                : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60 border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <ClipboardCheck size={16} className={`shrink-0 ${activeTab === 'audit' ? 'text-blue-700' : 'text-slate-400'}`} />
              <span className="truncate">Stock Audit</span>
            </div>
            <span
              className={`text-[10px] sm:text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                activeTab === 'audit' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {audits.length}
            </span>
          </button>

          {/* Godown Transfers Tab */}
          <button
            type="button"
            id="tab-godown-transfers"
            onClick={() => setActiveTab('transfers')}
            className={`flex items-center justify-between gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
              activeTab === 'transfers'
                ? 'bg-white text-blue-900 border-blue-200 shadow-sm ring-1 ring-blue-500/20'
                : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60 border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <ArrowRightLeft size={16} className={`shrink-0 ${activeTab === 'transfers' ? 'text-blue-700' : 'text-slate-400'}`} />
              <span className="truncate">Transfers</span>
            </div>
            <span
              className={`text-[10px] sm:text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                activeTab === 'transfers' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {stockTransfers.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: REAL-TIME CRATE COUNTS */}
      {activeTab === 'realtime' && (
        <>
          {products.length === 0 ? (
            <div className="p-12 text-center border-2 rounded" style={cardStyle}>
              <Boxes size={52} className="mx-auto mb-3" color={palette.muted} />
              <h2 style={fz(20, { fontWeight: 700, color: palette.ink })}>No Inventory Registered</h2>
              <p
                style={fz(15, {
                  color: palette.muted,
                  maxWidth: '480px',
                  margin: '0.75rem auto 1.5rem',
                })}
              >
                Your inventory database is currently empty and clean. Inward products directly into inventory by receiving invoices from suppliers or using bulk inward.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  onClick={() => setIsInwardModalOpen(true)}
                  className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded cursor-pointer"
                >
                  Receive Inward Consignment
                </button>
                <button
                  onClick={() => setIsBulkModalOpen(true)}
                  className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-300 font-bold rounded cursor-pointer flex items-center gap-1.5"
                >
                  <Upload size={15} /> Bulk Inward (PDF / Excel)
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Smart Space-Saving Filter & Search Toolbar */}
              <div className="relative mb-4">
                <div
                  className="flex items-center gap-2 p-2 sm:p-2.5 border-2 rounded-xl bg-white shadow-2xs"
                  style={{ borderColor: palette.line }}
                >
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-0">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      id="search-inventory"
                      type="text"
                      placeholder="Search beverage name, brand, SKU ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-8 py-1.5 text-xs sm:text-sm bg-transparent rounded-lg border-0 focus:outline-hidden text-slate-800 placeholder:text-slate-400 font-medium"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        title="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Showing Count (Desktop) */}
                  <div className="hidden md:block text-xs font-medium text-slate-500 shrink-0 px-1">
                    {filteredProducts.length} of {products.length} items
                  </div>

                  {/* Smart Filter Trigger Button */}
                  <div className="relative shrink-0" ref={filterDropdownRef}>
                    <button
                      type="button"
                      id="btn-filter-toggle-inventory"
                      onClick={() => setShowFilterDropdown((prev) => !prev)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all cursor-pointer ${
                        showFilterDropdown || activeFiltersCount > 0
                          ? 'bg-blue-900 text-white border-blue-950 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      <Filter size={14} className={activeFiltersCount > 0 ? 'text-amber-300' : 'text-slate-600'} />
                      <span>Filters</span>
                      {activeFiltersCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black bg-amber-400 text-slate-950">
                          {activeFiltersCount}
                        </span>
                      )}
                      <ChevronDown
                        size={13}
                        className={`transition-transform duration-150 ${showFilterDropdown ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {/* Smart Filter Options Popover */}
                    {showFilterDropdown && (
                      <div
                        className="absolute right-0 top-full mt-2 w-72 sm:w-80 p-3.5 bg-white border-2 rounded-xl shadow-xl z-30 space-y-3.5"
                        style={{ borderColor: palette.navy }}
                      >
                        <div className="flex items-center justify-between border-b pb-2">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                            <SlidersHorizontal size={14} className="text-blue-900" />
                            <span>Filter Inventory</span>
                          </div>
                          {activeFiltersCount > 0 && (
                            <button
                              type="button"
                              onClick={clearAllFilters}
                              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <RotateCcw size={11} /> Reset
                            </button>
                          )}
                        </div>

                        {/* Category Option */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                            Beverage Category
                          </label>
                          <select
                            value={selectedCat}
                            onChange={(e) => setSelectedCat(e.target.value)}
                            className="w-full text-xs border-2 border-slate-200 rounded-lg p-1.5 bg-slate-50 text-slate-800 font-semibold focus:border-blue-900 focus:outline-hidden cursor-pointer"
                          >
                            <option value="all">All Categories ({products.length})</option>
                            {Object.entries(CATS).map(([key, cat]) => {
                              const count = products.filter((p) => p.category === key).length;
                              return (
                                <option key={key} value={key}>
                                  {cat.name} ({count})
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {/* Godown Option */}
                        {warehouses.length > 0 && (
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                              Godown Location
                            </label>
                            <select
                              value={selectedWarehouse}
                              onChange={(e) => setSelectedWarehouse(e.target.value)}
                              className="w-full text-xs border-2 border-slate-200 rounded-lg p-1.5 bg-slate-50 text-slate-800 font-semibold focus:border-blue-900 focus:outline-hidden cursor-pointer"
                            >
                              <option value="all">All Godowns</option>
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name} {w.isDefault ? '(Default)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Stock Level Option */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                            Stock Availability
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { id: 'all', label: 'All Stock' },
                              { id: 'instock', label: 'In Stock (>0)' },
                              { id: 'low', label: 'Low Stock (≤10)' },
                              { id: 'out', label: 'Out of Stock (0)' },
                            ].map((st) => (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() => setStockLevelFilter(st.id as any)}
                                className={`px-2 py-1.5 rounded text-[11px] font-bold border transition-colors cursor-pointer text-left truncate ${
                                  stockLevelFilter === st.id
                                    ? 'bg-blue-900 text-white border-blue-950 shadow-2xs'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {st.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="pt-2 border-t flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 font-medium">
                            Matches {filteredProducts.length} items
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowFilterDropdown(false)}
                            className="px-3 py-1 bg-blue-900 text-white rounded text-xs font-bold hover:bg-blue-950 cursor-pointer shadow-2xs"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Active Filter Chips */}
                {activeFiltersCount > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-0.5">
                    <span className="text-[11px] font-bold text-slate-500">Active Filters:</span>

                    {selectedCat !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 text-xs font-semibold">
                        Category: {CATS[selectedCat as any]?.name || selectedCat}
                        <button
                          type="button"
                          onClick={() => setSelectedCat('all')}
                          className="hover:text-rose-600 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    )}

                    {selectedWarehouse !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200 text-xs font-semibold">
                        Godown: {warehouses.find((w) => w.id === selectedWarehouse)?.name || 'Selected'}
                        <button
                          type="button"
                          onClick={() => setSelectedWarehouse('all')}
                          className="hover:text-rose-600 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    )}

                    {stockLevelFilter !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold">
                        Stock:{' '}
                        {stockLevelFilter === 'instock'
                          ? 'In Stock'
                          : stockLevelFilter === 'low'
                          ? 'Low Stock'
                          : 'Out of Stock'}
                        <button
                          type="button"
                          onClick={() => setStockLevelFilter('all')}
                          className="hover:text-rose-600 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="text-[11px] font-bold text-rose-700 hover:underline cursor-pointer ml-1"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              {/* Table of Real-Time Warehouse Stock (Desktop view) */}
              <div className="hidden lg:block border-2 overflow-x-auto shadow-xs rounded" style={cardStyle}>
                <table className="w-full text-left min-w-[980px]" style={fz(13)}>
                  <thead>
                    <tr
                      className="border-b-2"
                      style={{ borderColor: palette.line, backgroundColor: '#f8fafc' }}
                    >
                      <th className="px-3.5 py-3 font-bold">SKU ID</th>
                      <th className="px-3.5 py-3 font-bold">Product Name & Category</th>
                      <th className="px-3.5 py-3 font-bold">Batch / Lot</th>
                      <th className="px-3.5 py-3 text-right font-bold">Opening</th>
                      <th className="px-3.5 py-3 text-right font-bold">Inwarded</th>
                      <th className="px-3.5 py-3 text-right font-bold">Sold in Bills</th>
                      <th className="px-3.5 py-3 text-right font-bold">
                        Real-Time Crate Stock Across Warehouses
                      </th>
                      <th className="px-3.5 py-3 text-right font-bold">Wholesale Rate</th>
                      <th className="px-3.5 py-3 text-right font-bold">Valuation</th>
                      <th className="px-3.5 py-3 text-right font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => {
                      const sku = p.sku || generateSkuId(p.name, p.category, p.id);
                      const sold = soldByProduct[p.id] || 0;
                      const rem = remainingStock(p.id);
                      const threshold = billingSettings?.lowStockThreshold ?? 5;
                      const isLow = rem < threshold;
                      const value = rem * p.wholesale;
                      const whBreakdown = productWarehouseStock(p.id);
                      const inwardSum = inventoryBatches
                        .filter((b) => b.productId === p.id)
                        .reduce((sum, b) => sum + b.quantity, 0);

                      const productBatches = inventoryBatches.filter((b) => b.productId === p.id);
                      const isBatchExpanded = !!expandedBatchProductIds[p.id];

                      return (
                        <React.Fragment key={p.id}>
                          <tr
                            className="border-t-2 hover:bg-slate-50/80 transition-colors"
                            style={{ borderColor: palette.line }}
                          >
                          {/* SKU ID */}
                          <td className="px-3.5 py-3">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded">
                              {sku}
                            </span>
                          </td>

                          {/* Product & Category */}
                          <td className="px-3.5 py-3">
                            <div className="font-bold text-sm" style={{ color: palette.ink }}>
                              {p.name}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {CATS[p.category]?.name || p.category} · {p.volume}ml {p.pack} · HSN:{' '}
                              {p.hsn || CATS[p.category]?.hsn || '2202'}
                            </div>
                          </td>

                          {/* Batch / Lot */}
                          <td className="px-3.5 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded w-fit">
                                {p.batchNumber || (inventoryBatches.find((b) => b.productId === p.id)?.batchNumber ?? 'LOT-AUTO')}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                Exp: {p.expiry || (inventoryBatches.find((b) => b.productId === p.id)?.expiryDate ?? '—')}
                              </span>
                              {inventoryBatches.filter((b) => b.productId === p.id).length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedBatchProductIds((prev) => ({
                                      ...prev,
                                      [p.id]: !prev[p.id],
                                    }))
                                  }
                                  className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-0.5 mt-0.5 cursor-pointer w-fit"
                                >
                                  {expandedBatchProductIds[p.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  {inventoryBatches.filter((b) => b.productId === p.id).length} lot(s)
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Opening */}
                          <td className="px-3.5 py-3 text-right font-medium text-slate-600">
                            {p.opening} cs
                          </td>

                          {/* Inwarded */}
                          <td className="px-3.5 py-3 text-right font-semibold text-emerald-800">
                            +{inwardSum} cs
                          </td>

                          {/* Sold in Bills (Deducted live) */}
                          <td className="px-3.5 py-3 text-right font-medium text-red-700">
                            -{sold} cs
                          </td>

                          {/* Real-Time Warehouse Crate Stock */}
                          <td className="px-3.5 py-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <div
                                className="text-sm font-black flex items-center gap-1.5"
                                style={{ color: isLow ? palette.bad : palette.ink }}
                              >
                                <span>{rem} crates</span>
                                {isLow && (
                                  <span
                                    className="px-1.5 py-0.2 border text-[10px] font-bold rounded"
                                    style={{
                                      borderColor: palette.bad,
                                      backgroundColor: `${palette.bad}15`,
                                      color: palette.bad,
                                    }}
                                  >
                                    LOW
                                  </span>
                                )}
                              </div>

                              {/* Warehouse breakdown pills */}
                              <div className="flex flex-wrap justify-end gap-1 max-w-[220px]">
                                {whBreakdown.map((wh) => (
                                  <span
                                    key={wh.warehouseId}
                                    className="text-[11px] font-mono px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded"
                                    title={`${wh.warehouseName}: ${wh.crates} crates available`}
                                  >
                                    {wh.warehouseName.slice(0, 12)}:{' '}
                                    <strong className="text-blue-900">{wh.crates} cs</strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                          </td>

                          {/* Wholesale Rate */}
                          <td className="px-3.5 py-3 text-right font-medium">
                            ₹{money(p.wholesale)}
                          </td>

                          {/* Stock Valuation */}
                          <td className="px-3.5 py-3 text-right font-bold text-slate-800">
                            ₹{money(value)}
                          </td>

                          {/* Inward Stock Action */}
                          <td className="px-3.5 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => {
                                setSelectedProductForInward(p.id);
                                setSelectedGrnToEdit(null);
                                setIsInwardModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-bold rounded bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 cursor-pointer inline-flex items-center gap-1"
                              title={`Inward stock for ${p.name}`}
                            >
                              <Plus size={13} /> Inward
                            </button>
                          </td>
                        </tr>

                        {/* Expandable Lot / Batch Details Sub-Row */}
                        {isBatchExpanded && productBatches.length > 0 && (
                          <tr className="bg-slate-50 border-t border-b border-slate-200">
                            <td colSpan={10} className="px-4 py-3">
                              <div className="border border-slate-200 rounded bg-white p-3 shadow-xs">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                                    <FileSpreadsheet size={13} className="text-blue-600" />
                                    Inward Lots & Batches for {p.name}
                                  </div>
                                  <span className="text-[11px] text-slate-500">
                                    {productBatches.length} lot(s) inwarded via consignments
                                  </span>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                                        <th className="py-1.5 px-2 font-bold">Batch / Lot</th>
                                        <th className="py-1.5 px-2 font-bold">Supplier & Invoice</th>
                                        <th className="py-1.5 px-2 font-bold">Inward Date</th>
                                        <th className="py-1.5 px-2 font-bold">Godown</th>
                                        <th className="py-1.5 px-2 text-right font-bold">Quantity</th>
                                        <th className="py-1.5 px-2 text-right font-bold">Landed Cost</th>
                                        <th className="py-1.5 px-2 font-bold">Expiry Date</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-mono">
                                      {productBatches.map((b) => {
                                        const wh = warehouses.find((w) => w.id === b.warehouseId);
                                        return (
                                          <tr key={b.id} className="hover:bg-slate-50/80">
                                            <td className="py-1.5 px-2 font-bold text-amber-900">{b.batchNumber}</td>
                                            <td className="py-1.5 px-2 font-sans text-slate-700">
                                              {b.supplierInvoiceNo ? `#${b.supplierInvoiceNo}` : 'Consignment'} ({b.supplierName || 'Direct'})
                                            </td>
                                            <td className="py-1.5 px-2 text-slate-600 font-sans">{b.inwardDate || '—'}</td>
                                            <td className="py-1.5 px-2 font-sans text-slate-700">{wh?.name || 'Kuchinda Central'}</td>
                                            <td className="py-1.5 px-2 text-right font-bold text-blue-900 font-sans">{b.quantity} cs</td>
                                            <td className="py-1.5 px-2 text-right text-emerald-800">₹{money(b.effectiveCostPrice || b.costPrice || 0)}</td>
                                            <td className="py-1.5 px-2 text-slate-600 font-sans">{b.expiryDate || '—'}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  </tbody>
                  <tfoot>
                    <tr
                      className="border-t-2 font-bold"
                      style={{ borderColor: palette.line, backgroundColor: `${palette.navy}08` }}
                    >
                      <td colSpan={6} className="px-3.5 py-3">
                        Total for visible inventory ({filteredProducts.length} items)
                      </td>
                      <td className="px-3.5 py-3 text-right font-black" style={{ color: palette.navy }}>
                        {totalStockCases} cs available
                      </td>
                      <td className="px-3.5 py-3 text-right font-medium">—</td>
                      <td className="px-3.5 py-3 text-right font-black" style={{ color: palette.navy }}>
                        ₹{money(totalStockValue)}
                      </td>
                      <td className="px-3.5 py-3 text-right">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Responsive Cards View for Mobile & Tablet (matching Dashboard Cards) */}
              <div className="block lg:hidden space-y-3.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredProducts.map((p) => {
                    const sku = p.sku || generateSkuId(p.name, p.category, p.id);
                    const sold = soldByProduct[p.id] || 0;
                    const rem = remainingStock(p.id);
                    const threshold = billingSettings?.lowStockThreshold ?? 5;
                    const isLow = rem < threshold;
                    const value = rem * p.wholesale;
                    const whBreakdown = productWarehouseStock(p.id);
                    const inwardSum = inventoryBatches
                      .filter((b) => b.productId === p.id)
                      .reduce((sum, b) => sum + b.quantity, 0);

                    const productBatches = inventoryBatches.filter((b) => b.productId === p.id);
                    const isBatchExpanded = !!expandedBatchProductIds[p.id];
                    const batchCode = p.batchNumber || (inventoryBatches.find((b) => b.productId === p.id)?.batchNumber ?? 'LOT-AUTO');
                    const expDate = p.expiry || (inventoryBatches.find((b) => b.productId === p.id)?.expiryDate ?? '—');

                    return (
                      <div
                        key={p.id}
                        className="border-2 rounded-xl p-3.5 sm:p-4 shadow-xs bg-white flex flex-col justify-between gap-3"
                        style={{ borderColor: isLow ? `${palette.bad}80` : palette.line }}
                      >
                        <div>
                          {/* Header: Title, SKU, Category, Inward CTA */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded">
                                  {sku}
                                </span>
                                <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                                  {CATS[p.category]?.name || p.category}
                                </span>
                              </div>
                              <h3 className="font-bold text-base text-slate-900 mt-1 break-words">
                                {p.name}
                              </h3>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {p.volume}ml {p.pack} · HSN: {p.hsn || CATS[p.category]?.hsn || '2202'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProductForInward(p.id);
                                setSelectedGrnToEdit(null);
                                setIsInwardModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 cursor-pointer inline-flex items-center gap-1 shrink-0 shadow-xs"
                              title={`Inward stock for ${p.name}`}
                            >
                              <Plus size={13} /> Inward
                            </button>
                          </div>

                          {/* 2x2 Metric Stat Blocks (matches Dashboard style) */}
                          <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100">
                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                              <div className="text-[11px] font-semibold text-slate-500">Live Available Stock</div>
                              <div className="text-base font-black flex items-center gap-1 mt-0.5" style={{ color: isLow ? palette.bad : palette.ink }}>
                                <span>{rem} cs</span>
                                {isLow && (
                                  <span className="px-1.5 py-0.2 border text-[9px] font-bold rounded bg-rose-50 text-rose-700 border-rose-300">
                                    LOW
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">Opening: {p.opening} cs</div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                              <div className="text-[11px] font-semibold text-slate-500">Stock Valuation</div>
                              <div className="text-base font-black text-slate-900 mt-0.5">₹{money(value)}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">@ ₹{money(p.wholesale)}/cs</div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                              <div className="text-[11px] font-semibold text-slate-500">Inwarded Cases</div>
                              <div className="text-sm font-bold text-emerald-700 mt-0.5">+{inwardSum} cs</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">Total additions</div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                              <div className="text-[11px] font-semibold text-slate-500">Sold in Bills</div>
                              <div className="text-sm font-bold text-red-700 mt-0.5">-{sold} cs</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">Delivered to retail</div>
                            </div>
                          </div>

                          {/* Batch & Expiry Strip */}
                          <div className="mt-2.5 flex items-center justify-between gap-2 p-2 bg-slate-50/80 border border-slate-200 rounded-lg text-xs flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-500 font-semibold">Lot:</span>
                              <span className="font-mono font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 border border-amber-200 rounded text-[11px]">
                                {batchCode}
                              </span>
                              <span className="text-[11px] text-slate-400">· Exp: {expDate}</span>
                            </div>
                            {productBatches.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedBatchProductIds((prev) => ({
                                    ...prev,
                                    [p.id]: !prev[p.id],
                                  }))
                                }
                                className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-0.5 cursor-pointer ml-auto"
                              >
                                {isBatchExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {productBatches.length} lot(s)
                              </button>
                            )}
                          </div>

                          {/* Godown distribution pills */}
                          {whBreakdown.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="text-slate-500 font-semibold">Godowns:</span>
                              {whBreakdown.map((wh) => (
                                <span
                                  key={wh.warehouseId}
                                  className="font-mono px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-900 rounded"
                                >
                                  {wh.warehouseName}: <strong>{wh.crates} cs</strong>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Expanded Lot Details on Cards */}
                          {isBatchExpanded && productBatches.length > 0 && (
                            <div className="mt-3 space-y-2 pt-2.5 border-t border-slate-200">
                              <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                <FileSpreadsheet size={13} className="text-blue-600" />
                                Inward Batches ({productBatches.length}):
                              </div>
                              {productBatches.map((b) => {
                                const wh = warehouses.find((w) => w.id === b.warehouseId);
                                return (
                                  <div key={b.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                                    <div className="flex justify-between items-center">
                                      <span className="font-mono font-bold text-amber-900">{b.batchNumber}</span>
                                      <span className="font-bold text-emerald-800">+{b.quantity} cs</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1">
                                      <span>{b.supplierName || 'Consignment'} ({wh ? wh.name : 'Main'})</span>
                                      <span>₹{money(b.effectiveCostPrice || b.costPrice || 0)}/cs</span>
                                    </div>
                                    {b.expiryDate && (
                                      <div className="text-[10px] text-slate-400 mt-0.5">
                                        Expires: {b.expiryDate}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Mobile/Tablet Total Card */}
                <div
                  className="border-2 rounded-xl p-3.5 sm:p-4 bg-slate-50 flex items-center justify-between flex-wrap gap-2"
                  style={{ borderColor: palette.line }}
                >
                  <div>
                    <div className="text-xs font-bold text-slate-600">Total Visible Inventory</div>
                    <div className="text-xs text-slate-500">{filteredProducts.length} items</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black" style={{ color: palette.navy }}>
                      {totalStockCases} crates
                    </div>
                    <div className="text-xs font-bold text-slate-700">₹{money(totalStockValue)} total value</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* TAB 2: INWARD INVOICES */}
      {activeTab === 'consignments' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Inward Consignment Invoices
              </h2>
              <p className="text-xs text-slate-500">
                Verified delivery receipts, batch tracking & wholesale supplier invoices
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setSelectedGrnToEdit(null);
                  setSelectedProductForInward(undefined);
                  setIsInwardModalOpen(true);
                }}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer shadow-xs whitespace-nowrap"
              >
                <PlusCircle size={15} /> <span>Inward Invoice</span>
              </button>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(true)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-2 border-indigo-200 hover:border-indigo-300 rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap shadow-xs"
              >
                <Upload size={14} className="text-indigo-700" /> <span>Bulk Inward</span>
              </button>
            </div>
          </div>

          {grns.length === 0 ? (
            <div className="p-10 text-center border-2 rounded-xl" style={cardStyle}>
              <FileSpreadsheet size={44} className="mx-auto mb-2 text-slate-400" />
              <h3 className="font-bold text-base text-slate-800">No Inward Invoices Recorded</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Your database is completely clean. Create your first inward consignment manually or upload an invoice via Bulk Inward.
              </p>
              <div className="flex items-center justify-center gap-2.5 mt-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGrnToEdit(null);
                    setSelectedProductForInward(undefined);
                    setIsInwardModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs sm:text-sm rounded-lg cursor-pointer shadow-xs"
                >
                  <PlusCircle size={15} /> <span>Inward Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-2 border-indigo-200 hover:border-indigo-300 font-bold text-xs sm:text-sm rounded-lg cursor-pointer shadow-xs"
                >
                  <Upload size={14} className="text-indigo-700" /> <span>Bulk Inward</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {grns.map((grn) => {
                const isExpanded = !!expandedGrnIds[grn.id];
                const wh = warehouses.find((w) => w.id === grn.warehouseId);

                return (
                  <div
                    key={grn.id}
                    className="border-2 rounded bg-white overflow-hidden shadow-xs"
                    style={{ borderColor: palette.line }}
                  >
                    {/* Consignment Header Row */}
                    <div className="p-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 border-b-2" style={{ borderColor: palette.line }}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-xs font-black px-2 py-1 bg-blue-100 text-blue-900 border border-blue-300 rounded">
                          {grn.grnNumber}
                        </span>
                        <div>
                          <div className="font-bold text-sm text-slate-900">
                            {grn.supplierName} · Invoice: {grn.invoiceNo}
                          </div>
                          <div className="text-xs text-slate-500">
                            Inward Date: <span className="font-medium text-slate-700">{grn.inwardDate}</span> · Godown:{' '}
                            <span className="font-medium text-slate-700">{wh ? wh.name : 'Kuchinda Central Godown'}</span> · Items:{' '}
                            <span className="font-bold text-slate-800">{grn.items.length}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="text-right">
                          <div className="text-xs text-slate-500">Total Cases</div>
                          <div className="text-sm font-black text-slate-800">
                            {grn.totalReceivedQty} cs{' '}
                            {grn.totalFreeQty > 0 && (
                              <span className="text-[11px] font-bold text-purple-700">
                                ({grn.totalBilledQty} billed + {grn.totalFreeQty} free)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-slate-500">Invoice Total</div>
                          <div className="text-base font-black text-emerald-800">
                            ₹{money(grn.grandTotal)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 border-l-2 pl-3" style={{ borderColor: palette.line }}>
                          <button
                            onClick={() =>
                              setExpandedGrnIds((prev) => ({
                                ...prev,
                                [grn.id]: !prev[grn.id],
                              }))
                            }
                            className="px-2.5 py-1.5 border text-xs font-bold rounded bg-white hover:bg-slate-100 text-slate-700 cursor-pointer flex items-center gap-1"
                            title={isExpanded ? 'Hide line items' : 'View line items'}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {isExpanded ? 'Hide' : 'View Items'}
                          </button>

                          <button
                            onClick={() => {
                              setSelectedGrnToEdit(grn);
                              setSelectedProductForInward(undefined);
                              setIsInwardModalOpen(true);
                            }}
                            className="p-1.5 border rounded bg-white hover:bg-blue-50 text-blue-700 border-blue-200 cursor-pointer"
                            title="Edit Inward Consignment"
                          >
                            <Edit2 size={14} />
                          </button>

                          <button
                            id={`btn-delete-grn-${grn.id}`}
                            onClick={() => {
                              setGrnToDelete(grn);
                            }}
                            className="p-1.5 border rounded bg-white hover:bg-red-50 text-red-600 border-red-200 cursor-pointer"
                            title="Delete Consignment & Reverse Stock"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Line Items (Table for desktop, Cards for mobile/tablet) */}
                    {isExpanded && (
                      <div className="p-3 bg-white">
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-xs min-w-[800px]">
                            <thead>
                              <tr className="border-b text-slate-500 font-bold bg-slate-50/50">
                                <th className="px-3 py-2">SKU ID</th>
                                <th className="px-3 py-2">Description / Beverage</th>
                                <th className="px-3 py-2">HSN/SAC</th>
                                <th className="px-3 py-2 text-right">Billed Qty</th>
                                <th className="px-3 py-2 text-right">Free Scheme</th>
                                <th className="px-3 py-2 text-right">Total Inflow</th>
                                <th className="px-3 py-2 text-right">Rate / Case</th>
                                <th className="px-3 py-2 text-right">Landed Cost / Case</th>
                                <th className="px-3 py-2 text-right">Tax%</th>
                                <th className="px-3 py-2 text-right">Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {grn.items.map((item, idx) => (
                                <tr key={item.id || idx} className="border-b hover:bg-slate-50/60">
                                  <td className="px-3 py-2 font-mono font-bold text-blue-900">
                                    {item.sku}
                                  </td>
                                  <td className="px-3 py-2 font-bold text-slate-900">
                                    {item.productName}
                                    {item.schemeText && (
                                      <span className="ml-2 text-[11px] font-normal text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200">
                                        {item.schemeText}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-slate-500">{item.hsn}</td>
                                  <td className="px-3 py-2 text-right font-medium">{item.qty} cs</td>
                                  <td className="px-3 py-2 text-right">
                                    {item.freeQty > 0 ? (
                                      <span className="font-bold text-purple-700">+{item.freeQty} cs</span>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-slate-800">
                                    {item.totalReceivedQty} cs
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono">₹{money(item.unitPrice)}</td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                                    ₹{money(item.landedCostPerUnit)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                                    {item.cgstPercent + item.sgstPercent}%
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                                    ₹{money(item.lineTotal)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile & Tablet Card Layout for Inward Line Items */}
                        <div className="block md:hidden space-y-2">
                          {grn.items.map((item, idx) => (
                            <div key={item.id || idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-mono text-[11px] font-bold text-blue-900">{item.sku}</div>
                                  <div className="font-bold text-sm text-slate-900 mt-0.5">{item.productName}</div>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold text-sm text-slate-900">₹{money(item.lineTotal)}</div>
                                  <div className="text-[11px] text-slate-500">HSN: {item.hsn}</div>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-slate-200 text-center">
                                <div className="bg-white p-1.5 rounded border border-slate-200">
                                  <div className="text-[10px] text-slate-500 font-medium">Billed Qty</div>
                                  <div className="font-bold text-slate-800">{item.qty} cs</div>
                                </div>
                                <div className="bg-white p-1.5 rounded border border-slate-200">
                                  <div className="text-[10px] text-slate-500 font-medium">Free Scheme</div>
                                  <div className="font-bold text-purple-700">+{item.freeQty} cs</div>
                                </div>
                                <div className="bg-white p-1.5 rounded border border-slate-200">
                                  <div className="text-[10px] text-slate-500 font-medium">Total Inflow</div>
                                  <div className="font-black text-emerald-800">{item.totalReceivedQty} cs</div>
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-[11px] text-slate-600 mt-2">
                                <span>Rate: ₹{money(item.unitPrice)} | Landed: <strong className="text-emerald-800">₹{money(item.landedCostPerUnit)}</strong></span>
                                <span>GST: {item.cgstPercent + item.sgstPercent}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PHYSICAL STOCK AUDIT */}
      {activeTab === 'audit' && (
        <div className="flex flex-col gap-4">
          <AuditView embedded />
        </div>
      )}

      {/* TAB 4: GODOWN TRANSFERS */}
      {activeTab === 'transfers' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b-2" style={{ borderColor: palette.line }}>
            <div>
              <h2 className="text-base font-bold text-slate-900">Inter-Godown Stock Transfers</h2>
              <p className="text-xs text-slate-500">
                Move beverage crates between godowns with real-time balance reconciliation.
              </p>
            </div>
            <button
              onClick={() => {
                setTab('settings');
              }}
              className="px-3 py-1.5 border text-xs font-semibold rounded hover:bg-slate-50 text-slate-700 cursor-pointer flex items-center gap-1.5"
            >
              <Building2 size={13} />
              Manage Godown Facilities in Settings →
            </button>
          </div>
          <WarehousesView embedded initialSubTab="transfers" />
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
