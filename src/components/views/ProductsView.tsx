import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Edit2,
  FileSpreadsheet,
  Filter,
  Layers,
  Package,
  Plus,
  PlusCircle,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CATS } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { CategoryKey, Product } from '../../types';
import { generateBatchNumber, generateSkuId, money } from '../../utils/billing';
import { IconButton } from '../common/IconButton';

export type ProductSubTab = 'all' | 'low_stock' | 'valuation';

export const ProductsView: React.FC = () => {
  const {
    products,
    addProduct,
    updateProductField,
    deleteProduct,
    remainingStock,
    bookStock,
    grns,
    inventoryBatches,
    billingSettings,
    warehouses,
    defaultWarehouse,
    palette,
    fz,
    scale,
    setTab,
  } = useLedger();

  const [activeTab, setActiveTab] = useState<ProductSubTab>('all');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedStockStatus, setSelectedStockStatus] = useState<'all' | 'instock' | 'low' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'name-asc' | 'wholesale-desc' | 'stock-asc' | 'stock-desc'>('name-asc');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  // Check if the product being edited has inward/batch history
  const editingProductHasInwardHistory = useMemo(() => {
    if (!editingProduct) return false;
    const inGrn = grns && grns.some((g) => g.items && g.items.some((it) => it.productId === editingProduct.id));
    const inBatch = inventoryBatches && inventoryBatches.some((b) => b.productId === editingProduct.id);
    return Boolean(inGrn || inBatch);
  }, [editingProduct, grns, inventoryBatches]);

  // Close filter dropdown on outside click
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

  const initialNewProduct = (): Omit<Product, 'id'> => ({
    name: '',
    sku: '',
    category: 'energy',
    hsn: '22021090',
    gstRate: 0.4,
    expiry: '2026-12-31',
    mfgDate: new Date().toISOString().slice(0, 10),
    batchNumber: generateBatchNumber('', ''),
    warehouseId: defaultWarehouse?.id || warehouses[0]?.id || '',
    volume: 200,
    pack: 'PET',
    opening: 0,
    cost: 158.57,
    retail: 240,
    wholesale: 235,
    scheme: '',
    effectiveCost: 158.57,
  });

  const [newProduct, setNewProduct] = useState<Omit<Product, 'id'>>(initialNewProduct);

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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: palette.ink,
    fontWeight: 600,
    marginBottom: '0.25em',
    ...fz(13),
  };

  const handleCategoryChange = (catKey: CategoryKey) => {
    const cat = CATS[catKey];
    setNewProduct((prev) => ({
      ...prev,
      category: catKey,
      hsn: cat.hsn,
      gstRate: cat.gst,
    }));
  };

  const handleSaveNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name.trim()) return;

    const skuCode =
      newProduct.sku && newProduct.sku.trim()
        ? newProduct.sku.trim().toUpperCase()
        : generateSkuId(newProduct.name, newProduct.category, products.length + 1);

    const batchNum =
      newProduct.batchNumber && newProduct.batchNumber.trim()
        ? newProduct.batchNumber.trim().toUpperCase()
        : generateBatchNumber(newProduct.name);

    addProduct({
      ...newProduct,
      name: newProduct.name.trim().toUpperCase(),
      sku: skuCode,
      batchNumber: batchNum,
      opening: Number(newProduct.opening) || 0,
      effectiveCost: Number(newProduct.cost) || 0,
      warehouseId: newProduct.warehouseId || defaultWarehouse?.id || (warehouses[0]?.id ?? ''),
    });

    setNewProduct(initialNewProduct());
    setShowAddProduct(false);
  };

  const handleSaveEditProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    updateProductField(editingProduct.id, 'name', editingProduct.name.trim().toUpperCase());
    updateProductField(editingProduct.id, 'category', editingProduct.category);
    if (editingProduct.sku) {
      updateProductField(editingProduct.id, 'sku', editingProduct.sku.trim().toUpperCase());
    }
    if (editingProduct.batchNumber) {
      updateProductField(editingProduct.id, 'batchNumber', editingProduct.batchNumber.trim().toUpperCase());
    }
    if (editingProduct.hsn) updateProductField(editingProduct.id, 'hsn', editingProduct.hsn.trim());
    if (editingProduct.gstRate !== undefined) {
      updateProductField(editingProduct.id, 'gstRate', Number(editingProduct.gstRate));
    }
    if (editingProduct.warehouseId) {
      updateProductField(editingProduct.id, 'warehouseId', editingProduct.warehouseId);
    }
    updateProductField(editingProduct.id, 'expiry', editingProduct.expiry);
    updateProductField(editingProduct.id, 'opening', Number(editingProduct.opening));
    updateProductField(editingProduct.id, 'cost', Number(editingProduct.cost));
    updateProductField(editingProduct.id, 'wholesale', Number(editingProduct.wholesale));
    updateProductField(editingProduct.id, 'retail', Number(editingProduct.retail));
    if (editingProduct.scheme !== undefined) {
      updateProductField(editingProduct.id, 'scheme', editingProduct.scheme);
    }

    setEditingProduct(null);
  };

  const lowStockThreshold = billingSettings?.lowStockThreshold ?? 10;
  const lowStockProducts = products.filter((p) => remainingStock(p.id) <= lowStockThreshold);
  const outOfStockCount = products.filter((p) => remainingStock(p.id) <= 0).length;
  const totalStockCases = products.reduce((s, p) => s + remainingStock(p.id), 0);
  const totalStockValue = products.reduce((s, p) => s + remainingStock(p.id) * p.wholesale, 0);

  // Active filter count calculation
  const activeFiltersCount =
    (selectedCat !== 'all' ? 1 : 0) +
    (selectedWarehouse !== 'all' ? 1 : 0) +
    (selectedStockStatus !== 'all' ? 1 : 0) +
    (sortBy !== 'name-asc' ? 1 : 0);

  const clearAllFilters = () => {
    setSelectedCat('all');
    setSelectedWarehouse('all');
    setSelectedStockStatus('all');
    setSortBy('name-asc');
    setSearchTerm('');
  };

  const filteredProducts = products
    .filter((p) => {
      // Sub-tab constraint
      const rem = remainingStock(p.id);
      if (activeTab === 'low_stock' && rem > lowStockThreshold) return false;

      // Category filter
      const matchesCat = selectedCat === 'all' || p.category === selectedCat;

      // Warehouse filter
      const matchesWh = selectedWarehouse === 'all' || p.warehouseId === selectedWarehouse;

      // Stock status filter
      let matchesStock = true;
      if (selectedStockStatus === 'instock') matchesStock = rem > 0;
      else if (selectedStockStatus === 'low') matchesStock = rem <= lowStockThreshold && rem > 0;
      else if (selectedStockStatus === 'out') matchesStock = rem <= 0;

      // Search term
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.sku && p.sku.toLowerCase().includes(term)) ||
        (p.hsn && p.hsn.includes(term));

      return matchesCat && matchesWh && matchesStock && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'wholesale-desc') return b.wholesale - a.wholesale;
      if (sortBy === 'stock-asc') return remainingStock(a.id) - remainingStock(b.id);
      if (sortBy === 'stock-desc') return remainingStock(b.id) - remainingStock(a.id);
      return a.name.localeCompare(b.name);
    });

  const exportProductsCsv = () => {
    const headers = [
      'SKU ID',
      'Product Name',
      'Category',
      'HSN Code',
      'Batch Lot',
      'Wholesale Rate (₹)',
      'Retail MRP (₹)',
      'Purchase Cost (₹)',
      'GST Rate',
      'Available Crates',
      'Valuation (₹)',
    ];

    const rows = filteredProducts.map((p) => {
      const rem = remainingStock(p.id);
      const val = rem * p.wholesale;
      const gstPct = Math.round((p.gstRate || CATS[p.category]?.gst || 0.18) * 100);
      return [
        `"${p.sku || generateSkuId(p.name, p.category, p.id)}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        p.category,
        p.hsn || CATS[p.category]?.hsn || '2202',
        p.batchNumber || '',
        p.wholesale,
        p.retail,
        p.cost,
        `${gstPct}%`,
        rem,
        val.toFixed(2),
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `products_catalog_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="view-products" className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 style={fz(24, { fontWeight: 700, color: palette.ink })}>Products Catalog</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage beverage SKUs, wholesale pricing, HSN codes & godown stock
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={exportProductsCsv}
            className="flex items-center gap-1.5 border-2 px-3 py-2 focus-ring cursor-pointer rounded text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
            style={{ borderColor: palette.line }}
            title="Export filtered products catalog as CSV"
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('inventory')}
            className="flex items-center gap-1.5 border-2 px-3 py-2 focus-ring cursor-pointer rounded text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
            style={{ borderColor: palette.line }}
            title="Open Inward Stock to receive beverage consignments"
          >
            <Boxes size={15} />
            <span>Receive Consignment</span>
          </button>

          <button
            id="btn-open-add-product"
            onClick={() => {
              setShowAddProduct((v) => !v);
              setNewProduct(initialNewProduct());
            }}
            className="flex items-center gap-2 border-2 px-4 py-2 focus-ring cursor-pointer rounded shadow-xs"
            style={{
              backgroundColor: palette.navy,
              color: '#FFFFFF',
              borderColor: palette.navy,
              ...fz(14, { fontWeight: 700 }),
            }}
          >
            <Plus size={Math.round(18 * scale)} aria-hidden="true" />
            Add Product
          </button>
        </div>
      </div>

      {/* Quick Metrics Bar - Matching InventoryView */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="p-3 sm:p-3.5 border-2 rounded-xl shadow-xs flex flex-col justify-between" style={cardStyle}>
          <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Total Catalog SKUs</div>
          <div className="text-xl sm:text-2xl font-black mt-1" style={{ color: palette.navy }}>
            {products.length} <span className="text-xs font-normal text-slate-500">beverages</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">{Object.keys(CATS).length} categories active</div>
        </div>

        <div className="p-3 sm:p-3.5 border-2 rounded-xl shadow-xs flex flex-col justify-between" style={cardStyle}>
          <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Stock on Hand</div>
          <div className="text-xl sm:text-2xl font-black mt-1 text-slate-800">
            {totalStockCases} <span className="text-xs font-normal text-slate-500">crates</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">Across all registered depots</div>
        </div>

        <div
          className={`p-3 sm:p-3.5 border-2 rounded-xl shadow-xs flex flex-col justify-between ${
            lowStockProducts.length > 0 ? 'bg-amber-50/50 border-amber-300' : ''
          }`}
          style={lowStockProducts.length > 0 ? undefined : cardStyle}
        >
          <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-800">Stock Alerts</div>
          <div className="text-xl sm:text-2xl font-black mt-1 text-amber-900">
            {lowStockProducts.length} <span className="text-xs font-normal text-slate-600">low / {outOfStockCount} out</span>
          </div>
          <div className="text-[11px] text-amber-700 mt-1 font-semibold">
            {lowStockProducts.length > 0 ? 'Reorder needed' : 'All SKUs healthy'}
          </div>
        </div>

        <div className="p-3 sm:p-3.5 border-2 rounded-xl shadow-xs flex flex-col justify-between" style={cardStyle}>
          <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Wholesale Valuation</div>
          <div className="text-xl sm:text-2xl font-black mt-1 text-emerald-700">
            ₹{money(totalStockValue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">Expected realization value</div>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar - Segmented style matching InventoryView */}
      <div className="w-full bg-slate-100/90 p-1 sm:p-1.5 rounded-xl border-2 border-slate-200 mb-4 shadow-2xs">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white/80 hover:text-slate-900'
            }`}
          >
            <Package size={15} />
            <span>All Products</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'all' ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {products.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('low_stock')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'low_stock'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white/80 hover:text-slate-900'
            }`}
          >
            <AlertTriangle size={15} />
            <span>Low Stock Alerts</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'low_stock' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {lowStockProducts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('valuation')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'valuation'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'text-slate-700 hover:bg-white/80 hover:text-slate-900'
            }`}
          >
            <Layers size={15} />
            <span>Catalog Valuation</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'valuation' ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              ₹{money(totalStockValue)}
            </span>
          </button>
        </div>
      </div>

      {/* Add Product Form Drawer */}
      {showAddProduct && (
        <div
          id="add-product-panel"
          className="border-2 p-5 mb-6 shadow-sm rounded"
          style={{ borderColor: palette.navy, backgroundColor: palette.panel }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 style={fz(17, { fontWeight: 700, color: palette.ink })}>
              Add New Beverage Product
            </h2>
            <IconButton
              onClick={() => setShowAddProduct(false)}
              icon={X}
              label="Close form"
              id="close-add-product"
            />
          </div>

          <form onSubmit={handleSaveNewProduct} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="prod-name" style={labelStyle}>Product Name *</label>
                <input
                  id="prod-name"
                  type="text"
                  required
                  placeholder="e.g. CAMPA ENERGY BOOST 150ML"
                  value={newProduct.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setNewProduct((prev) => ({
                      ...prev,
                      name,
                      sku: prev.sku || generateSkuId(name, prev.category, products.length + 1),
                    }));
                  }}
                  className="w-full border-2 px-3 py-1.5 rounded uppercase font-bold"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="prod-sku" style={labelStyle}>SKU Code</label>
                <input
                  id="prod-sku"
                  type="text"
                  placeholder="e.g. ENG-150-01"
                  value={newProduct.sku || ''}
                  onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value.toUpperCase() })}
                  className="w-full border-2 px-3 py-1.5 rounded font-mono font-bold"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="prod-batch" style={labelStyle}>Batch / Lot No.</label>
                <input
                  id="prod-batch"
                  type="text"
                  placeholder="e.g. LOT-26C01"
                  value={newProduct.batchNumber || ''}
                  onChange={(e) => setNewProduct({ ...newProduct, batchNumber: e.target.value.toUpperCase() })}
                  className="w-full border-2 px-3 py-1.5 rounded font-mono"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="prod-category" style={labelStyle}>Category</label>
                <select
                  id="prod-category"
                  value={newProduct.category}
                  onChange={(e) => handleCategoryChange(e.target.value as CategoryKey)}
                  className="w-full border-2 px-3 py-1.5 rounded cursor-pointer"
                  style={inputStyle}
                >
                  {Object.entries(CATS).map(([key, cat]) => (
                    <option key={key} value={key}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="prod-hsn" style={labelStyle}>HSN Code</label>
                <input
                  id="prod-hsn"
                  type="text"
                  required
                  value={newProduct.hsn}
                  onChange={(e) => setNewProduct({ ...newProduct, hsn: e.target.value })}
                  className="w-full border-2 px-3 py-1.5 rounded font-mono"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="prod-cost" style={labelStyle}>Purchase Cost (₹)</label>
                <input
                  id="prod-cost"
                  type="number"
                  step="0.01"
                  required
                  value={newProduct.cost}
                  onChange={(e) => setNewProduct({ ...newProduct, cost: Number(e.target.value) })}
                  className="w-full border-2 px-3 py-1.5 rounded"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="prod-wholesale" style={labelStyle}>Wholesale Rate (₹)</label>
                <input
                  id="prod-wholesale"
                  type="number"
                  step="0.01"
                  required
                  value={newProduct.wholesale}
                  onChange={(e) => setNewProduct({ ...newProduct, wholesale: Number(e.target.value) })}
                  className="w-full border-2 px-3 py-1.5 rounded font-bold"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="prod-retail" style={labelStyle}>Retail / MRP (₹)</label>
                <input
                  id="prod-retail"
                  type="number"
                  step="0.01"
                  required
                  value={newProduct.retail}
                  onChange={(e) => setNewProduct({ ...newProduct, retail: Number(e.target.value) })}
                  className="w-full border-2 px-3 py-1.5 rounded"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="prod-opening" style={labelStyle}>
                  Initial Opening Stock (Cases)
                </label>
                <input
                  id="prod-opening"
                  type="number"
                  min="0"
                  value={newProduct.opening}
                  onChange={(e) => setNewProduct({ ...newProduct, opening: Number(e.target.value) })}
                  className="w-full border-2 px-3 py-1.5 rounded font-bold"
                  style={inputStyle}
                  title="Initial baseline cases before receiving inward consignments"
                />
                <span className="text-[10px] text-slate-500 font-medium mt-0.5 block">
                  Initial baseline before inward consignments are received.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: palette.line }}>
              <button
                type="button"
                onClick={() => setShowAddProduct(false)}
                className="px-4 py-1.5 border-2 rounded font-bold text-xs cursor-pointer"
                style={{ borderColor: palette.line, backgroundColor: '#FFFFFF' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-1.5 text-white font-bold text-xs rounded cursor-pointer"
                style={{ backgroundColor: palette.navy }}
              >
                Save Product
              </button>
            </div>
          </form>
        </div>
      )}

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
              type="text"
              placeholder="Search products by name, SKU, or HSN code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs sm:text-sm bg-transparent rounded-lg border-0 focus:outline-hidden text-slate-800 placeholder:text-slate-400 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
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
              id="btn-filter-toggle-products"
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
                    <span>Filter Products</span>
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
                    {Object.entries(CATS).map(([k, c]) => {
                      const count = products.filter((p) => p.category === k).length;
                      return (
                        <option key={k} value={k}>
                          {c.name} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Godown Option */}
                {warehouses.length > 1 && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Depot / Godown Location
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
                      { id: 'all', label: 'All Levels' },
                      { id: 'instock', label: 'In Stock (>0)' },
                      { id: 'low', label: 'Low Stock (≤10)' },
                      { id: 'out', label: 'Out of Stock (0)' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSelectedStockStatus(st.id as any)}
                        className={`px-2 py-1.5 rounded text-[11px] font-bold border transition-colors cursor-pointer text-left truncate ${
                          selectedStockStatus === st.id
                            ? 'bg-blue-900 text-white border-blue-950 shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort Option */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Sort Order
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full text-xs border-2 border-slate-200 rounded-lg p-1.5 bg-slate-50 text-slate-800 font-semibold focus:border-blue-900 focus:outline-hidden cursor-pointer"
                  >
                    <option value="name-asc">Product Name (A - Z)</option>
                    <option value="wholesale-desc">Wholesale Price (High to Low)</option>
                    <option value="stock-asc">Stock Level (Lowest First)</option>
                    <option value="stock-desc">Stock Level (Highest First)</option>
                  </select>
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

        {/* Active Filter Chips (shown compactly when filters are selected) */}
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-0.5">
            <span className="text-[11px] font-bold text-slate-500">Active Filters:</span>

            {selectedCat !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 text-xs font-semibold">
                Category: {CATS[selectedCat as CategoryKey]?.name || selectedCat}
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

            {selectedStockStatus !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold">
                Stock:{' '}
                {selectedStockStatus === 'instock'
                  ? 'In Stock'
                  : selectedStockStatus === 'low'
                  ? 'Low Stock'
                  : 'Out of Stock'}
                <button
                  type="button"
                  onClick={() => setSelectedStockStatus('all')}
                  className="hover:text-rose-600 cursor-pointer"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {sortBy !== 'name-asc' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 text-xs font-semibold">
                Sorted: {sortBy.replace('-', ' ')}
                <button
                  type="button"
                  onClick={() => setSortBy('name-asc')}
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

      {/* Products Table (Desktop) */}
      <div className="hidden lg:block border-2 overflow-x-auto shadow-xs rounded" style={cardStyle}>
        <table className="w-full text-left min-w-[850px]" style={fz(13)}>
          <thead>
            <tr className="border-b-2" style={{ borderColor: palette.line, backgroundColor: '#f8fafc' }}>
              <th className="px-3.5 py-2.5 font-bold">SKU</th>
              <th className="px-3.5 py-2.5 font-bold">Product Name</th>
              <th className="px-3.5 py-2.5 font-bold">Category</th>
              <th className="px-3.5 py-2.5 font-bold">Batch / Lot</th>
              <th className="px-3.5 py-2.5 font-bold">HSN</th>
              <th className="px-3.5 py-2.5 text-right font-bold">Cost Rate</th>
              <th className="px-3.5 py-2.5 text-right font-bold">Wholesale</th>
              <th className="px-3.5 py-2.5 text-right font-bold">Retail / MRP</th>
              <th className="px-3.5 py-2.5 text-right font-bold">GST %</th>
              <th className="px-3.5 py-2.5 text-right font-bold">Live Stock</th>
              <th className="px-3.5 py-2.5 text-center font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => {
              const catDef = CATS[p.category];
              const gstPct = Math.round((p.gstRate || catDef?.gst || 0.18) * 100);
              const liveStock = remainingStock(p.id);
              const matchingBatches = inventoryBatches.filter((b) => b.productId === p.id);
              const batchCode = p.batchNumber || matchingBatches[0]?.batchNumber || '—';
              const skuCode = p.sku || `PRD-${p.id}`;

              return (
                <tr key={p.id} className="border-b hover:bg-slate-50 transition-colors" style={{ borderColor: palette.line }}>
                  <td className="px-3.5 py-2.5 font-mono font-bold text-xs" style={{ color: palette.navy }}>
                    <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                      {skuCode}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 font-bold text-slate-900">
                    <div>{p.name}</div>
                    <div className="text-[11px] text-slate-500 font-normal">{p.pack || 'PET'} · {p.volume || 200}ml</div>
                  </td>
                  <td className="px-3.5 py-2.5 font-medium text-slate-700">
                    {catDef?.name || p.category}
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-xs text-slate-700">
                    <span className="bg-amber-50 text-amber-900 px-1.5 py-0.5 rounded border border-amber-200 font-bold">
                      {batchCode}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">
                    {p.hsn || catDef?.hsn || '2202'}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-slate-700">
                    ₹{money(p.cost)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900">
                    ₹{money(p.wholesale)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-slate-700">
                    ₹{money(p.retail)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-xs font-semibold text-blue-800">
                    {gstPct}%
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    <div className="flex flex-col items-end">
                      <button
                        onClick={() => setTab('inventory')}
                        className={`font-mono font-bold text-xs px-2 py-0.5 rounded border cursor-pointer hover:underline ${
                          liveStock <= (billingSettings?.lowStockThreshold ?? 10)
                            ? liveStock <= 0
                              ? 'bg-rose-50 text-rose-700 border-rose-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        }`}
                        title={`Live stock remaining: ${liveStock} cs (Opening: ${p.opening} cs). Click to view in Inventory.`}
                      >
                        {liveStock} cs
                      </button>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Open: {p.opening} cs
                      </span>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setEditingProduct({ ...p })}
                        className="p-1 border rounded hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                        title="Edit Product"
                      >
                        <Edit2 size={13} />
                      </button>
                      <IconButton
                        id={`btn-delete-prod-${p.id}`}
                        icon={Trash2}
                        variant="danger"
                        tooltip="Delete Product"
                        onClick={() => {
                          if (confirm(`Delete ${p.name}?`)) {
                            deleteProduct(p.id);
                          }
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Responsive Product Cards for Mobile and Tablet (matching Dashboard Cards) */}
      <div className="block lg:hidden space-y-3.5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredProducts.map((p) => {
            const catDef = CATS[p.category];
            const gstPct = Math.round((p.gstRate || catDef?.gst || 0.18) * 100);
            const liveStock = remainingStock(p.id);
            const matchingBatches = inventoryBatches.filter((b) => b.productId === p.id);
            const batchCode = p.batchNumber || matchingBatches[0]?.batchNumber || '—';
            const skuCode = p.sku || `PRD-${p.id}`;
            const isLowStock = liveStock <= (billingSettings?.lowStockThreshold ?? 10);

            return (
              <div
                key={p.id}
                className="border-2 rounded-xl p-3.5 sm:p-4 shadow-xs bg-white flex flex-col justify-between gap-3"
                style={{ borderColor: palette.line }}
              >
                <div>
                  {/* Card Header: SKU, Category, Name, Action Icons */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                          {skuCode}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-900 rounded border border-blue-200">
                          {catDef?.name || p.category}
                        </span>
                      </div>
                      <h3 className="font-bold text-base text-slate-900 mt-1 break-words">
                        {p.name}
                      </h3>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {p.pack || 'PET'} · {p.volume || 200}ml · HSN: {p.hsn || catDef?.hsn || '2202'}
                      </div>
                    </div>

                    {/* Quick Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditingProduct({ ...p })}
                        className="p-1.5 border rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                        title="Edit Product"
                      >
                        <Edit2 size={14} />
                      </button>
                      <IconButton
                        id={`btn-delete-prod-card-${p.id}`}
                        icon={Trash2}
                        variant="danger"
                        tooltip="Delete Product"
                        onClick={() => {
                          if (confirm(`Delete ${p.name}?`)) {
                            deleteProduct(p.id);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Pricing and Stock Metric Blocks (Dashboard style) */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] font-semibold text-slate-500">Wholesale Rate</div>
                      <div className="text-base font-black text-slate-900 mt-0.5">₹{money(p.wholesale)}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Retail: ₹{money(p.retail)}</div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] font-semibold text-slate-500">Live Available Stock</div>
                      <div className="text-base font-black flex items-center gap-1 mt-0.5">
                        <span className={isLowStock ? 'text-amber-700' : 'text-emerald-700'}>
                          {liveStock} cs
                        </span>
                        {isLowStock && (
                          <span className="px-1.5 py-0.2 border text-[9px] font-bold rounded bg-amber-50 text-amber-800 border-amber-300">
                            {liveStock <= 0 ? 'OUT' : 'LOW'}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Opening: {p.opening} cs</div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] font-semibold text-slate-500">Cost Rate</div>
                      <div className="text-sm font-bold text-slate-700 mt-0.5">₹{money(p.cost)}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Base purchase</div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] font-semibold text-slate-500">GST Tax Bracket</div>
                      <div className="text-sm font-bold text-blue-800 mt-0.5">{gstPct}% GST</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">HSN: {p.hsn || '2202'}</div>
                    </div>
                  </div>

                  {/* Batch & Inventory Navigation */}
                  <div className="mt-2.5 flex items-center justify-between gap-2 p-2 bg-slate-50/80 border border-slate-200 rounded-lg text-xs flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-semibold">Active Batch:</span>
                      <span className="font-mono font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 border border-amber-200 rounded text-[11px]">
                        {batchCode}
                      </span>
                    </div>
                    <button
                      onClick={() => setTab('inventory')}
                      className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold underline cursor-pointer ml-auto"
                    >
                      View in Inventory →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 shadow-xl border-2 border-slate-300">
            <div className="flex items-center justify-between border-b pb-2 mb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Edit2 size={15} className="text-blue-600" />
                Edit Product
              </h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditProduct} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Product Name *</label>
                  <input
                    required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full border-2 p-1.5 rounded font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">SKU Code</label>
                  <input
                    value={editingProduct.sku || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value.toUpperCase() })}
                    placeholder="e.g. ENG-150-01"
                    className="w-full border-2 p-1.5 rounded font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Batch / Lot No.</label>
                  <input
                    value={editingProduct.batchNumber || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, batchNumber: e.target.value.toUpperCase() })}
                    placeholder="e.g. LOT-26C01"
                    className="w-full border-2 p-1.5 rounded font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value as CategoryKey })}
                    className="w-full border-2 p-1.5 rounded cursor-pointer"
                  >
                    {Object.entries(CATS).map(([k, c]) => (
                      <option key={k} value={k}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">HSN Code *</label>
                  <input
                    required
                    value={editingProduct.hsn || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, hsn: e.target.value })}
                    className="w-full border-2 p-1.5 rounded font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Purchase Cost (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingProduct.cost}
                    onChange={(e) => setEditingProduct({ ...editingProduct, cost: Number(e.target.value) })}
                    className="w-full border-2 p-1.5 rounded font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Wholesale Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingProduct.wholesale}
                    onChange={(e) => setEditingProduct({ ...editingProduct, wholesale: Number(e.target.value) })}
                    className="w-full border-2 p-1.5 rounded font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Retail / MRP (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingProduct.retail}
                    onChange={(e) => setEditingProduct({ ...editingProduct, retail: Number(e.target.value) })}
                    className="w-full border-2 p-1.5 rounded font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {editingProductHasInwardHistory
                      ? 'Original Opening Stock (historical)'
                      : 'Opening Stock (Cases)'}
                  </label>
                  <input
                    type="number"
                    value={editingProduct.opening}
                    disabled={editingProductHasInwardHistory}
                    onChange={(e) => setEditingProduct({ ...editingProduct, opening: Number(e.target.value) })}
                    className={`w-full border-2 p-1.5 rounded font-bold font-mono ${
                      editingProductHasInwardHistory
                        ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-300'
                        : ''
                    }`}
                    title={
                      editingProductHasInwardHistory
                        ? `Stock is now tracked via Inward Invoices & Batches. Current live available stock: ${remainingStock(editingProduct.id)} cs.`
                        : 'Initial opening stock quantity'
                    }
                  />
                  {editingProductHasInwardHistory ? (
                    <p className="text-[10px] text-amber-700 font-medium mt-1 leading-tight">
                      Stock is now tracked via Inward GRN consignments & batches (Live: {remainingStock(editingProduct.id)} cs). Original opening stock is historical and locked.
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-500 font-medium mt-1">
                      Live available stock: {remainingStock(editingProduct.id)} cs
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-3 py-1.5 border rounded font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-700 text-white rounded font-bold hover:bg-blue-800 cursor-pointer"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
