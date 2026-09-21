import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Filter,
  Layers,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { InventoryBatch, StockTransfer, Warehouse } from '../../types';
import { generateBatchNumber, money } from '../../utils/billing';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { IconButton } from '../common/IconButton';

export interface WarehousesViewProps {
  embedded?: boolean;
  initialSubTab?: 'warehouses' | 'batches' | 'transfers';
}

export const WarehousesView: React.FC<WarehousesViewProps> = ({
  embedded = false,
  initialSubTab = 'warehouses',
}) => {
  const {
    warehouses,
    addWarehouse,
    updateWarehouse,
    deleteWarehouse,
    defaultWarehouse,
    inventoryBatches,
    addBatch,
    updateBatch,
    deleteBatch,
    products,
    stockTransfers,
    addStockTransfer,
    warehouseStock,
    palette,
    fz,
    scale,
  } = useLedger();

  const [activeSubTab, setActiveSubTab] = useState<'warehouses' | 'batches' | 'transfers'>(initialSubTab);

  // Deletion modals state
  const [warehouseToDelete, setWarehouseToDelete] = useState<Warehouse | null>(null);
  const [cannotDeleteWarehouse, setCannotDeleteWarehouse] = useState<{ name: string; cases: number } | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<InventoryBatch | null>(null);

  // Warehouse Modal State
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null);
  const [whForm, setWhForm] = useState({
    name: '',
    code: '',
    location: '',
    manager: '',
    phone: '',
    capacityCases: 1000,
    isDefault: false,
    notes: '',
  });

  // Batch Modal State
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [batchForm, setBatchForm] = useState({
    productId: products[0]?.id || 0,
    batchNumber: '',
    mfgDate: '',
    expiryDate: '',
    warehouseId: warehouses[0]?.id || '',
    quantity: 50,
    costPrice: 0,
    mrp: 0,
    notes: '',
  });

  // Transfer Modal State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    fromWarehouseId: warehouses[0]?.id || '',
    toWarehouseId: warehouses[1]?.id || warehouses[0]?.id || '',
    productId: products[0]?.id || 0,
    batchNumber: '',
    quantity: 10,
    referenceNote: '',
  });

  // Search & Filters
  const [batchSearch, setBatchSearch] = useState('');
  const [batchWarehouseFilter, setBatchWarehouseFilter] = useState('all');
  const [batchProductFilter, setBatchProductFilter] = useState('all');
  const [showBatchFilterDropdown, setShowBatchFilterDropdown] = useState(false);
  const batchFilterDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (batchFilterDropdownRef.current && !batchFilterDropdownRef.current.contains(e.target as Node)) {
        setShowBatchFilterDropdown(false);
      }
    };
    if (showBatchFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showBatchFilterDropdown]);

  const activeBatchFiltersCount =
    (batchWarehouseFilter !== 'all' ? 1 : 0) +
    (batchProductFilter !== 'all' ? 1 : 0);

  const clearBatchFilters = () => {
    setBatchWarehouseFilter('all');
    setBatchProductFilter('all');
    setBatchSearch('');
  };

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

  // Helper for batch expiry status
  const getBatchExpiryStatus = (expiryDate: string) => {
    if (!expiryDate) return { label: 'No Expiry', color: palette.muted, bg: '#f1f5f9' };
    const now = new Date();
    // Parse YYYY-MM-DD or DD/MM/YYYY
    let exp: Date;
    if (expiryDate.includes('/')) {
      const [d, m, y] = expiryDate.split('/');
      exp = new Date(Number(y), Number(m) - 1, Number(d));
    } else {
      exp = new Date(expiryDate);
    }
    if (isNaN(exp.getTime())) return { label: 'Valid', color: palette.muted, bg: '#f1f5f9' };

    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { label: 'Expired', color: '#991b1b', bg: '#fee2e2' };
    }
    if (diffDays <= 45) {
      return { label: `Expiring in ${diffDays}d`, color: '#9a3412', bg: '#ffedd5' };
    }
    return { label: `Good (${diffDays}d)`, color: '#166534', bg: '#dcfce7' };
  };

  // Warehouse Actions
  const handleOpenAddWarehouse = () => {
    setEditingWarehouseId(null);
    setWhForm({
      name: '',
      code: `WH-${warehouses.length + 1}`,
      location: '',
      manager: '',
      phone: '',
      capacityCases: 1000,
      isDefault: warehouses.length === 0,
      notes: '',
    });
    setShowWarehouseModal(true);
  };

  const handleOpenEditWarehouse = (wh: Warehouse) => {
    setEditingWarehouseId(wh.id);
    setWhForm({
      name: wh.name,
      code: wh.code,
      location: wh.location,
      manager: wh.manager,
      phone: wh.phone,
      capacityCases: wh.capacityCases || 1000,
      isDefault: Boolean(wh.isDefault),
      notes: wh.notes || '',
    });
    setShowWarehouseModal(true);
  };

  const handleSaveWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whForm.name.trim()) return;

    if (editingWarehouseId) {
      updateWarehouse(editingWarehouseId, {
        name: whForm.name.trim(),
        code: whForm.code.trim(),
        location: whForm.location.trim(),
        manager: whForm.manager.trim(),
        phone: whForm.phone.trim(),
        capacityCases: Number(whForm.capacityCases) || 0,
        isDefault: whForm.isDefault,
        notes: whForm.notes.trim(),
      });
    } else {
      addWarehouse({
        name: whForm.name.trim(),
        code: whForm.code.trim() || `WH-${warehouses.length + 1}`,
        location: whForm.location.trim(),
        manager: whForm.manager.trim(),
        phone: whForm.phone.trim(),
        capacityCases: Number(whForm.capacityCases) || 0,
        isDefault: whForm.isDefault,
        notes: whForm.notes.trim(),
      });
    }
    setShowWarehouseModal(false);
  };

  // Batch Actions
  const handleOpenAddBatch = (preselectedProductId?: number) => {
    setEditingBatchId(null);
    const prod = products.find((p) => p.id === preselectedProductId) || products[0];
    setBatchForm({
      productId: prod?.id || 0,
      batchNumber: generateBatchNumber(prod?.name),
      mfgDate: new Date().toISOString().slice(0, 10),
      expiryDate: prod?.expiry || '2026-12-31',
      warehouseId: defaultWarehouse?.id || warehouses[0]?.id || '',
      quantity: 50,
      costPrice: prod?.cost || 0,
      mrp: prod?.retail || 0,
      notes: '',
    });
    setShowBatchModal(true);
  };

  const handleOpenEditBatch = (b: InventoryBatch) => {
    setEditingBatchId(b.id);
    setBatchForm({
      productId: b.productId,
      batchNumber: b.batchNumber,
      mfgDate: b.mfgDate || '',
      expiryDate: b.expiryDate || '',
      warehouseId: b.warehouseId,
      quantity: b.quantity,
      costPrice: b.costPrice || 0,
      mrp: b.mrp || 0,
      notes: b.notes || '',
    });
    setShowBatchModal(true);
  };

  const handleSaveBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchForm.batchNumber.trim() || !batchForm.productId) return;

    if (editingBatchId) {
      updateBatch(editingBatchId, {
        productId: Number(batchForm.productId),
        batchNumber: batchForm.batchNumber.trim().toUpperCase(),
        mfgDate: batchForm.mfgDate,
        expiryDate: batchForm.expiryDate,
        warehouseId: batchForm.warehouseId,
        quantity: Number(batchForm.quantity) || 0,
        costPrice: Number(batchForm.costPrice) || 0,
        mrp: Number(batchForm.mrp) || 0,
        notes: batchForm.notes.trim(),
      });
    } else {
      addBatch({
        productId: Number(batchForm.productId),
        batchNumber: batchForm.batchNumber.trim().toUpperCase(),
        mfgDate: batchForm.mfgDate,
        expiryDate: batchForm.expiryDate,
        warehouseId: batchForm.warehouseId,
        quantity: Number(batchForm.quantity) || 0,
        costPrice: Number(batchForm.costPrice) || 0,
        mrp: Number(batchForm.mrp) || 0,
        notes: batchForm.notes.trim(),
      });
    }
    setShowBatchModal(false);
  };

  // Stock Transfer Actions
  const handleOpenTransfer = (preselectedBatch?: InventoryBatch) => {
    const fromWh = preselectedBatch?.warehouseId || warehouses[0]?.id || '';
    const otherWh = warehouses.find((w) => w.id !== fromWh)?.id || fromWh;
    setTransferForm({
      date: new Date().toISOString().slice(0, 10),
      fromWarehouseId: fromWh,
      toWarehouseId: otherWh,
      productId: preselectedBatch?.productId || products[0]?.id || 0,
      batchNumber: preselectedBatch?.batchNumber || '',
      quantity: Math.min(10, preselectedBatch?.quantity || 10),
      referenceNote: '',
    });
    setShowTransferModal(true);
  };

  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !transferForm.fromWarehouseId ||
      !transferForm.toWarehouseId ||
      transferForm.fromWarehouseId === transferForm.toWarehouseId ||
      transferForm.quantity <= 0
    ) {
      alert('Please select two distinct warehouses and enter a valid quantity.');
      return;
    }

    addStockTransfer({
      date: transferForm.date,
      fromWarehouseId: transferForm.fromWarehouseId,
      toWarehouseId: transferForm.toWarehouseId,
      productId: Number(transferForm.productId),
      batchNumber: transferForm.batchNumber.trim().toUpperCase(),
      quantity: Number(transferForm.quantity),
      referenceNote: transferForm.referenceNote.trim(),
    });
    setShowTransferModal(false);
  };

  // Filtered Batches
  const filteredBatches = inventoryBatches.filter((b) => {
    const prod = products.find((p) => p.id === b.productId);
    const prodName = prod ? prod.name.toLowerCase() : '';
    const matchSearch =
      b.batchNumber.toLowerCase().includes(batchSearch.toLowerCase()) ||
      prodName.includes(batchSearch.toLowerCase());
    const matchWh = batchWarehouseFilter === 'all' || b.warehouseId === batchWarehouseFilter;
    const matchProd = batchProductFilter === 'all' || String(b.productId) === batchProductFilter;
    return matchSearch && matchWh && matchProd;
  });

  const totalCasesInWarehouses = warehouses.reduce((sum, w) => sum + warehouseStock(w.id), 0);
  const expiringSoonCount = inventoryBatches.filter((b) => {
    const st = getBatchExpiryStatus(b.expiryDate);
    return st.label.includes('Expiring') || st.label === 'Expired';
  }).length;

  return (
    <div id="view-warehouses" className={embedded ? 'w-full' : 'p-4 sm:p-6 max-w-7xl mx-auto'}>
      {/* Header (hidden when embedded inside unified Inventory View) */}
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 style={fz(26, { fontWeight: 700, color: palette.ink })}>
              Warehouse & Batch Management
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-add-warehouse"
              onClick={handleOpenAddWarehouse}
              className="flex items-center gap-2 border-2 px-3.5 py-2 cursor-pointer focus-ring font-semibold"
              style={{
                backgroundColor: palette.panel,
                borderColor: palette.line,
                color: palette.navy,
                ...fz(14),
              }}
            >
              <Building2 size={Math.round(16 * scale)} />
              Add Warehouse
            </button>
            <button
              id="btn-add-batch"
              onClick={() => handleOpenAddBatch()}
              disabled={products.length === 0}
              className="flex items-center gap-2 border-2 px-3.5 py-2 cursor-pointer focus-ring font-semibold"
              style={{
                backgroundColor: palette.navy,
                borderColor: palette.navy,
                color: '#FFFFFF',
                opacity: products.length === 0 ? 0.5 : 1,
                ...fz(14),
              }}
            >
              <Plus size={Math.round(16 * scale)} />
              Add Batch
            </button>
            <button
              id="btn-transfer-stock"
              onClick={() => handleOpenTransfer()}
              disabled={warehouses.length < 2 || products.length === 0}
              className="flex items-center gap-2 border-2 px-3.5 py-2 cursor-pointer focus-ring font-semibold"
              style={{
                backgroundColor: palette.panel,
                borderColor: palette.navy,
                color: palette.navy,
                opacity: warehouses.length < 2 || products.length === 0 ? 0.5 : 1,
                ...fz(14),
              }}
            >
              <ArrowRightLeft size={Math.round(16 * scale)} />
              Transfer Stock
            </button>
          </div>
        </div>
      )}

      {/* Embedded Action Bar */}
      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 border-2 rounded" style={cardStyle}>
          <div className="text-xs font-bold text-slate-600">
            {activeSubTab === 'warehouses' && `Managing ${warehouses.length} physical godown locations`}
            {activeSubTab === 'batches' && `Tracking ${inventoryBatches.length} batch lots and expiry dates`}
            {activeSubTab === 'transfers' && `History of ${stockTransfers.length} inter-godown transfers`}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {activeSubTab === 'warehouses' && (
              <button
                onClick={handleOpenAddWarehouse}
                className="flex items-center gap-1.5 px-3 py-1.5 font-bold rounded text-xs text-white bg-blue-700 hover:bg-blue-800 cursor-pointer"
              >
                <Plus size={14} />
                Add Godown
              </button>
            )}
            {activeSubTab === 'batches' && (
              <button
                onClick={() => handleOpenAddBatch()}
                className="flex items-center gap-1.5 px-3 py-1.5 font-bold rounded text-xs text-white bg-blue-700 hover:bg-blue-800 cursor-pointer"
              >
                <Plus size={14} />
                Add Batch Lot
              </button>
            )}
            <button
              onClick={() => handleOpenTransfer()}
              disabled={warehouses.length < 2 || products.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 font-bold rounded text-xs border-2 cursor-pointer"
              style={{
                borderColor: palette.navy,
                color: palette.navy,
                backgroundColor: 'transparent',
                opacity: warehouses.length < 2 || products.length === 0 ? 0.5 : 1,
              }}
            >
              <ArrowRightLeft size={14} />
              Inter-Godown Transfer
            </button>
          </div>
        </div>
      )}

      {/* KPI Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="p-4 border-2" style={cardStyle}>
          <div className="flex items-center justify-between">
            <span style={fz(12.5, { color: palette.muted, textTransform: 'uppercase', fontWeight: 600 })}>
              Warehouses / Godowns
            </span>
            <Building2 size={Math.round(18 * scale)} color={palette.navy} />
          </div>
          <div className="mt-2" style={fz(24, { fontWeight: 700, color: palette.navy })}>
            {warehouses.length}
          </div>
          <div className="text-xs mt-1" style={{ color: palette.muted }}>
            Default: {defaultWarehouse ? defaultWarehouse.name : 'None assigned'}
          </div>
        </div>

        <div className="p-4 border-2" style={cardStyle}>
          <div className="flex items-center justify-between">
            <span style={fz(12.5, { color: palette.muted, textTransform: 'uppercase', fontWeight: 600 })}>
              Total Tracked Cases
            </span>
            <Layers size={Math.round(18 * scale)} color={palette.good} />
          </div>
          <div className="mt-2" style={fz(24, { fontWeight: 700, color: palette.good })}>
            {totalCasesInWarehouses}
          </div>
          <div className="text-xs mt-1" style={{ color: palette.muted }}>
            Across all active batches
          </div>
        </div>

        <div className="p-4 border-2" style={cardStyle}>
          <div className="flex items-center justify-between">
            <span style={fz(12.5, { color: palette.muted, textTransform: 'uppercase', fontWeight: 600 })}>
              Active Batches
            </span>
            <WarehouseIcon size={Math.round(18 * scale)} color={palette.navy} />
          </div>
          <div className="mt-2" style={fz(24, { fontWeight: 700, color: palette.navy })}>
            {inventoryBatches.length}
          </div>
          <div className="text-xs mt-1" style={{ color: palette.muted }}>
            Lot numbers registered
          </div>
        </div>

        <div className="p-4 border-2" style={cardStyle}>
          <div className="flex items-center justify-between">
            <span style={fz(12.5, { color: palette.muted, textTransform: 'uppercase', fontWeight: 600 })}>
              Expiry Attention
            </span>
            <Clock size={Math.round(18 * scale)} color={expiringSoonCount > 0 ? palette.bad : palette.good} />
          </div>
          <div
            className="mt-2"
            style={fz(24, {
              fontWeight: 700,
              color: expiringSoonCount > 0 ? palette.bad : palette.good,
            })}
          >
            {expiringSoonCount}
          </div>
          <div className="text-xs mt-1" style={{ color: palette.muted }}>
            {expiringSoonCount > 0 ? 'Batches need priority dispatch' : 'All batches fresh'}
          </div>
        </div>
      </div>

      {/* Navigation Subtabs */}
      <div className="flex items-center border-b-2 gap-2 mb-6" style={{ borderColor: palette.line }}>
        <button
          id="tab-btn-warehouses"
          onClick={() => setActiveSubTab('warehouses')}
          className="pb-2.5 px-4 font-bold border-b-4 -mb-[2px] transition-colors cursor-pointer"
          style={{
            borderColor: activeSubTab === 'warehouses' ? palette.navy : 'transparent',
            color: activeSubTab === 'warehouses' ? palette.navy : palette.muted,
            ...fz(15),
          }}
        >
          Warehouses & Godowns ({warehouses.length})
        </button>
        <button
          id="tab-btn-batches"
          onClick={() => setActiveSubTab('batches')}
          className="pb-2.5 px-4 font-bold border-b-4 -mb-[2px] transition-colors cursor-pointer"
          style={{
            borderColor: activeSubTab === 'batches' ? palette.navy : 'transparent',
            color: activeSubTab === 'batches' ? palette.navy : palette.muted,
            ...fz(15),
          }}
        >
          Batches & Expiry ({inventoryBatches.length})
        </button>
        <button
          id="tab-btn-transfers"
          onClick={() => setActiveSubTab('transfers')}
          className="pb-2.5 px-4 font-bold border-b-4 -mb-[2px] transition-colors cursor-pointer"
          style={{
            borderColor: activeSubTab === 'transfers' ? palette.navy : 'transparent',
            color: activeSubTab === 'transfers' ? palette.navy : palette.muted,
            ...fz(15),
          }}
        >
          Stock Transfers ({stockTransfers.length})
        </button>
      </div>

      {/* 1. SUB-TAB: WAREHOUSES */}
      {activeSubTab === 'warehouses' && (
        <div>
          {warehouses.length === 0 ? (
            <div className="p-8 text-center border-2" style={cardStyle}>
              <Building2 size={48} className="mx-auto mb-3" color={palette.muted} />
              <h3 style={fz(18, { fontWeight: 700, color: palette.ink })}>No Warehouses Configured</h3>
              <p style={fz(14, { color: palette.muted, maxWidth: '400px', margin: '0.5rem auto 1.5rem' })}>
                Set up your central godown, secondary depots, or cold storages to organize stock by physical facility.
              </p>
              <button
                id="btn-create-first-warehouse"
                onClick={handleOpenAddWarehouse}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-bold cursor-pointer focus-ring"
                style={{
                  backgroundColor: palette.navy,
                  color: '#FFFFFF',
                  ...fz(14),
                }}
              >
                <Plus size={16} />
                Add First Warehouse
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {warehouses.map((wh) => {
                const cases = warehouseStock(wh.id);
                const batchCount = inventoryBatches.filter((b) => b.warehouseId === wh.id).length;
                const percentCap = wh.capacityCases ? Math.min(100, Math.round((cases / wh.capacityCases) * 100)) : 0;

                return (
                  <div key={wh.id} className="p-5 border-2 flex flex-col justify-between" style={cardStyle}>
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 style={fz(17, { fontWeight: 700, color: palette.ink })}>{wh.name}</h3>
                            {wh.isDefault && (
                              <span
                                className="px-2 py-0.5 rounded text-xs font-bold"
                                style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}
                              >
                                Default
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono mt-0.5" style={{ color: palette.muted }}>
                            Code: {wh.code}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <IconButton
                            id={`btn-edit-wh-${wh.id}`}
                            icon={Pencil}
                            tooltip="Edit Warehouse"
                            onClick={() => handleOpenEditWarehouse(wh)}
                          />
                          <IconButton
                            id={`btn-delete-wh-${wh.id}`}
                            icon={Trash2}
                            variant="danger"
                            tooltip="Delete Warehouse"
                            onClick={() => {
                              if (cases > 0) {
                                setCannotDeleteWarehouse({ name: wh.name, cases });
                                return;
                              }
                              setWarehouseToDelete(wh);
                            }}
                          />
                        </div>
                      </div>

                      <div className="mt-4 space-y-2 text-sm">
                        {wh.location && (
                          <div className="flex items-center gap-2" style={{ color: palette.ink }}>
                            <MapPin size={14} color={palette.muted} />
                            <span>{wh.location}</span>
                          </div>
                        )}
                        {(wh.manager || wh.phone) && (
                          <div className="flex items-center gap-2" style={{ color: palette.ink }}>
                            <Phone size={14} color={palette.muted} />
                            <span>
                              {wh.manager} {wh.phone ? `(${wh.phone})` : ''}
                            </span>
                          </div>
                        )}
                        {wh.notes && (
                          <p className="text-xs italic mt-2" style={{ color: palette.muted }}>
                            "{wh.notes}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t-2" style={{ borderColor: palette.line }}>
                      <div className="flex items-center justify-between mb-1">
                        <span style={fz(13, { color: palette.muted })}>Stock in Godown:</span>
                        <span style={fz(15, { fontWeight: 700, color: palette.navy })}>
                          {cases} cases ({batchCount} batches)
                        </span>
                      </div>

                      {wh.capacityCases && wh.capacityCases > 0 ? (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs mb-1" style={{ color: palette.muted }}>
                            <span>Capacity Usage</span>
                            <span>
                              {cases} / {wh.capacityCases} ({percentCap}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${percentCap}%`,
                                backgroundColor: percentCap > 90 ? palette.bad : palette.navy,
                              }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {!wh.isDefault && (
                        <button
                          id={`btn-set-default-${wh.id}`}
                          onClick={() => updateWarehouse(wh.id, { isDefault: true })}
                          className="mt-3 w-full py-1 text-xs border font-semibold cursor-pointer"
                          style={{
                            borderColor: palette.line,
                            color: palette.navy,
                            backgroundColor: palette.panel,
                          }}
                        >
                          Set as Default Warehouse
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. SUB-TAB: BATCHES & EXPIRY TRACKER */}
      {activeSubTab === 'batches' && (
        <div>
          {/* Smart Space-Saving Filter Bar */}
          <div className="mb-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    id="input-batch-search"
                    type="text"
                    placeholder="Search batch number or product..."
                    value={batchSearch}
                    onChange={(e) => setBatchSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 border-2 rounded focus-ring bg-white text-xs sm:text-sm"
                    style={{ borderColor: palette.line, color: palette.ink }}
                  />
                  {batchSearch && (
                    <button
                      type="button"
                      onClick={() => setBatchSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Filter Options Popover Trigger */}
                <div className="relative" ref={batchFilterDropdownRef}>
                  <button
                    type="button"
                    id="btn-batch-filters-toggle"
                    onClick={() => setShowBatchFilterDropdown((prev) => !prev)}
                    className={`flex items-center gap-2 px-3 py-2 border-2 rounded text-xs sm:text-sm font-bold cursor-pointer transition-colors focus-ring ${
                      showBatchFilterDropdown || activeBatchFiltersCount > 0
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-white hover:bg-slate-50 text-slate-800'
                    }`}
                    style={{
                      borderColor: showBatchFilterDropdown || activeBatchFiltersCount > 0 ? palette.navy : palette.line,
                    }}
                  >
                    <Filter size={14} />
                    <span>Filter Options</span>
                    {activeBatchFiltersCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black flex items-center justify-center">
                        {activeBatchFiltersCount}
                      </span>
                    )}
                    <ChevronDown
                      size={13}
                      className={`transition-transform duration-200 ${showBatchFilterDropdown ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Smart Filter Popover */}
                  {showBatchFilterDropdown && (
                    <div
                      id="popover-batch-filters"
                      className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-72 sm:w-80 bg-white border-2 rounded-xl shadow-2xl z-50 p-4 space-y-3.5 animate-in fade-in duration-150"
                      style={{ borderColor: palette.navy }}
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <SlidersHorizontal size={15} className="text-blue-900" />
                          <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                            Batch Filter Options
                          </span>
                        </div>
                        {activeBatchFiltersCount > 0 && (
                          <button
                            type="button"
                            onClick={clearBatchFilters}
                            className="text-[11px] font-bold text-red-600 hover:text-red-800 flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw size={11} />
                            Reset
                          </button>
                        )}
                      </div>

                      {/* Warehouse Option */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1">
                          <Building2 size={12} /> Godown / Warehouse:
                        </label>
                        <select
                          id="select-batch-wh"
                          value={batchWarehouseFilter}
                          onChange={(e) => setBatchWarehouseFilter(e.target.value)}
                          className="w-full border-2 px-2.5 py-1.5 text-xs font-semibold rounded bg-white focus:outline-none focus:border-blue-900"
                          style={{ borderColor: palette.line, color: palette.ink }}
                        >
                          <option value="all">All Warehouses ({warehouses.length})</option>
                          {warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Product Option */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1">
                          <Layers size={12} /> Product Line:
                        </label>
                        <select
                          id="select-batch-prod"
                          value={batchProductFilter}
                          onChange={(e) => setBatchProductFilter(e.target.value)}
                          className="w-full border-2 px-2.5 py-1.5 text-xs font-semibold rounded bg-white focus:outline-none focus:border-blue-900"
                          style={{ borderColor: palette.line, color: palette.ink }}
                        >
                          <option value="all">All Products ({products.length})</option>
                          {products.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Popover Footer */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-medium">
                          {filteredBatches.length} batches found
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowBatchFilterDropdown(false)}
                          className="px-3.5 py-1.5 text-xs font-bold rounded bg-blue-900 text-white hover:bg-blue-950 cursor-pointer shadow-xs"
                        >
                          Apply Filters
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                id="btn-add-batch-tab"
                onClick={() => handleOpenAddBatch()}
                disabled={products.length === 0}
                className="flex items-center gap-2 px-3.5 py-2 font-bold cursor-pointer focus-ring rounded"
                style={{
                  backgroundColor: palette.navy,
                  color: '#FFFFFF',
                  opacity: products.length === 0 ? 0.5 : 1,
                  ...fz(14),
                }}
              >
                <Plus size={16} />
                Register New Batch
              </button>
            </div>

            {/* Active Batch Filter Chips */}
            {activeBatchFiltersCount > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active Filters:</span>
                {batchWarehouseFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-900 border border-blue-200">
                    Godown: {warehouses.find((w) => w.id === batchWarehouseFilter)?.name || batchWarehouseFilter}
                    <button
                      type="button"
                      onClick={() => setBatchWarehouseFilter('all')}
                      className="hover:text-blue-950 cursor-pointer"
                      title="Remove warehouse filter"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                {batchProductFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                    Product: {products.find((p) => String(p.id) === batchProductFilter)?.name || batchProductFilter}
                    <button
                      type="button"
                      onClick={() => setBatchProductFilter('all')}
                      className="hover:text-emerald-950 cursor-pointer"
                      title="Remove product filter"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={clearBatchFilters}
                  className="text-xs text-blue-900 hover:underline font-bold cursor-pointer ml-1"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {products.length === 0 ? (
            <div className="p-8 text-center border-2" style={cardStyle}>
              <Layers size={48} className="mx-auto mb-3" color={palette.muted} />
              <h3 style={fz(18, { fontWeight: 700, color: palette.ink })}>No Products Added Yet</h3>
              <p style={fz(14, { color: palette.muted, maxWidth: '400px', margin: '0.5rem auto' })}>
                Please add products in the Products catalog first, then assign batches with manufacturing and expiry dates.
              </p>
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="p-8 text-center border-2" style={cardStyle}>
              <Layers size={48} className="mx-auto mb-3" color={palette.muted} />
              <h3 style={fz(18, { fontWeight: 700, color: palette.ink })}>No Batches Found</h3>
              <p style={fz(14, { color: palette.muted, maxWidth: '400px', margin: '0.5rem auto 1.5rem' })}>
                Register lot numbers, production dates, and expiry dates to maintain FIFO dispatch and strict quality compliance.
              </p>
              <button
                id="btn-register-first-batch"
                onClick={() => handleOpenAddBatch()}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-bold cursor-pointer focus-ring"
                style={{
                  backgroundColor: palette.navy,
                  color: '#FFFFFF',
                  ...fz(14),
                }}
              >
                <Plus size={16} />
                Register First Batch
              </button>
            </div>
          ) : (
            <>
              <div className="hidden lg:block border-2 overflow-x-auto" style={cardStyle}>
                <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: `2px solid ${palette.line}` }}>
                    <th className="p-3" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                      Batch Number
                    </th>
                    <th className="p-3" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                      Product Name
                    </th>
                    <th className="p-3" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                      Godown / Warehouse
                    </th>
                    <th className="p-3" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                      Mfg. Date
                    </th>
                    <th className="p-3" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                      Expiry Date & Health
                    </th>
                    <th className="p-3 text-right" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                      Quantity (Cases)
                    </th>
                    <th className="p-3 text-right" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                      Cost / Case
                    </th>
                    <th className="p-3 text-center" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatches.map((b) => {
                    const prod = products.find((p) => p.id === b.productId);
                    const wh = warehouses.find((w) => w.id === b.warehouseId);
                    const expStatus = getBatchExpiryStatus(b.expiryDate);

                    return (
                      <tr
                        key={b.id}
                        className="hover:bg-slate-50 transition-colors"
                        style={{ borderBottom: `1px solid ${palette.line}` }}
                      >
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <span
                              className="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs w-fit"
                              style={{ backgroundColor: '#e2e8f0', color: palette.ink }}
                            >
                              {b.batchNumber}
                            </span>
                            {b.scheme && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200 w-fit">
                                {b.scheme}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-semibold" style={{ color: palette.ink }}>
                          {prod ? prod.name : `Product #${b.productId}`}
                        </td>
                        <td className="p-3 text-sm" style={{ color: palette.ink }}>
                          {wh ? wh.name : 'Unassigned'}
                        </td>
                        <td className="p-3 text-sm font-mono" style={{ color: palette.muted }}>
                          {b.mfgDate || '—'}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{b.expiryDate}</span>
                            <span
                              className="px-2 py-0.5 rounded text-xs font-bold"
                              style={{ backgroundColor: expStatus.bg, color: expStatus.color }}
                            >
                              {expStatus.label}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-bold text-base" style={{ color: palette.navy }}>
                          {b.quantity}
                        </td>
                        <td className="p-3 text-right text-sm font-mono" style={{ color: palette.ink }}>
                          {b.costPrice ? money(b.costPrice) : '—'}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <IconButton
                              id={`btn-edit-batch-${b.id}`}
                              icon={Pencil}
                              tooltip="Edit Batch"
                              onClick={() => handleOpenEditBatch(b)}
                            />
                            {warehouses.length > 1 && (
                              <IconButton
                                id={`btn-transfer-batch-${b.id}`}
                                icon={ArrowRightLeft}
                                tooltip="Transfer to another warehouse"
                                onClick={() => handleOpenTransfer(b)}
                              />
                            )}
                            <IconButton
                              id={`btn-delete-batch-${b.id}`}
                              icon={Trash2}
                              variant="danger"
                              tooltip="Delete Batch"
                              onClick={() => {
                                setBatchToDelete(b);
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

            {/* Mobile & Tablet Card Layout (Matches Dashboard Cards) */}
            <div className="block lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredBatches.map((b) => {
                const prod = products.find((p) => p.id === b.productId);
                const wh = warehouses.find((w) => w.id === b.warehouseId);
                const expStatus = getBatchExpiryStatus(b.expiryDate);

                return (
                  <div
                    key={b.id}
                    className="border-2 rounded-xl p-3.5 sm:p-4 shadow-xs flex flex-col justify-between"
                    style={cardStyle}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {b.batchNumber}
                          </span>
                          <h4 className="font-bold text-slate-900 mt-1.5" style={fz(15)}>
                            {prod ? prod.name : `Product #${b.productId}`}
                          </h4>
                          <div className="text-xs text-slate-600 mt-0.5 font-medium">
                            Warehouse: <strong className="text-slate-800">{wh ? wh.name : b.warehouseId}</strong>
                          </div>
                        </div>

                        <span
                          className="px-2 py-0.5 rounded text-xs font-bold shrink-0"
                          style={{ backgroundColor: expStatus.bg, color: expStatus.color }}
                        >
                          {expStatus.label}
                        </span>
                      </div>

                      {/* 2-Column Metrics */}
                      <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200 text-xs">
                        <div className="bg-slate-50 p-2 rounded border border-slate-200">
                          <div className="text-[11px] text-slate-500 font-medium">Stock (Cases)</div>
                          <div className="font-extrabold text-base text-slate-900">{b.quantity}</div>
                        </div>
                        <div className="bg-slate-50 p-2 rounded border border-slate-200">
                          <div className="text-[11px] text-slate-500 font-medium">Cost / Case</div>
                          <div className="font-bold text-base text-slate-900">
                            {b.costPrice ? `₹${money(b.costPrice)}` : '—'}
                          </div>
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          Mfg: <span className="font-mono font-medium text-slate-700">{b.mfgDate || '—'}</span>
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          Exp: <span className="font-mono font-medium text-slate-700">{b.expiryDate}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1.5 mt-3 pt-2 border-t border-slate-100">
                      <IconButton
                        id={`btn-mob-edit-batch-${b.id}`}
                        icon={Pencil}
                        tooltip="Edit Batch"
                        onClick={() => handleOpenEditBatch(b)}
                      />
                      {warehouses.length > 1 && (
                        <IconButton
                          id={`btn-mob-transfer-batch-${b.id}`}
                          icon={ArrowRightLeft}
                          tooltip="Transfer to another warehouse"
                          onClick={() => handleOpenTransfer(b)}
                        />
                      )}
                      <IconButton
                        id={`btn-mob-delete-batch-${b.id}`}
                        icon={Trash2}
                        variant="danger"
                        tooltip="Delete Batch"
                        onClick={() => {
                          setBatchToDelete(b);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    )}

      {/* 3. SUB-TAB: STOCK TRANSFERS */}
      {activeSubTab === 'transfers' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 style={fz(18, { fontWeight: 700, color: palette.ink })}>Inter-Warehouse Movement Log</h3>
              <p style={fz(14, { color: palette.muted })}>
                Audit record of case transfers between central depots and local distributing godowns.
              </p>
            </div>
            <button
              id="btn-transfer-new"
              onClick={() => handleOpenTransfer()}
              disabled={warehouses.length < 2 || products.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 font-bold cursor-pointer focus-ring"
              style={{
                backgroundColor: palette.navy,
                color: '#FFFFFF',
                opacity: warehouses.length < 2 || products.length === 0 ? 0.5 : 1,
                ...fz(14),
              }}
            >
              <ArrowRightLeft size={16} />
              New Stock Transfer
            </button>
          </div>

          {stockTransfers.length === 0 ? (
            <div className="p-8 text-center border-2" style={cardStyle}>
              <ArrowRightLeft size={48} className="mx-auto mb-3" color={palette.muted} />
              <h4 style={fz(16, { fontWeight: 700, color: palette.ink })}>No Stock Transfers Recorded</h4>
              <p style={fz(14, { color: palette.muted, maxWidth: '420px', margin: '0.5rem auto' })}>
                When you relocate cases between godowns, each transaction is logged here for inventory reconciliation.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block border-2 overflow-x-auto" style={cardStyle}>
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: `2px solid ${palette.line}` }}>
                      <th className="p-3" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                        Date
                      </th>
                      <th className="p-3" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                        Source Warehouse
                      </th>
                      <th className="p-3" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                        Destination Warehouse
                      </th>
                      <th className="p-3" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                        Product & Batch
                      </th>
                      <th className="p-3 text-right" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                        Transferred Cases
                      </th>
                      <th className="p-3" style={fz(13, { fontWeight: 700, color: palette.ink })}>
                        Challan / Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockTransfers.map((st) => {
                      const fromWh = warehouses.find((w) => w.id === st.fromWarehouseId);
                      const toWh = warehouses.find((w) => w.id === st.toWarehouseId);
                      const prod = products.find((p) => p.id === st.productId);

                      return (
                        <tr
                          key={st.id}
                          className="hover:bg-slate-50 transition-colors"
                          style={{ borderBottom: `1px solid ${palette.line}` }}
                        >
                          <td className="p-3 text-sm font-mono">{st.date}</td>
                          <td className="p-3 font-semibold text-sm" style={{ color: palette.bad }}>
                            {fromWh ? fromWh.name : st.fromWarehouseId}
                          </td>
                          <td className="p-3 font-semibold text-sm" style={{ color: palette.good }}>
                            {toWh ? toWh.name : st.toWarehouseId}
                          </td>
                          <td className="p-3 text-sm">
                            <div className="font-semibold">{prod ? prod.name : `Product #${st.productId}`}</div>
                            {st.batchNumber && (
                              <span className="text-xs font-mono px-1.5 py-0.2 bg-slate-100 rounded">
                                Batch: {st.batchNumber}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-bold text-base" style={{ color: palette.navy }}>
                            {st.quantity}
                          </td>
                          <td className="p-3 text-sm italic" style={{ color: palette.muted }}>
                            {st.referenceNote || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile & Tablet Card Layout */}
              <div className="block md:hidden space-y-3">
                {stockTransfers.map((st) => {
                  const fromWh = warehouses.find((w) => w.id === st.fromWarehouseId);
                  const toWh = warehouses.find((w) => w.id === st.toWarehouseId);
                  const prod = products.find((p) => p.id === st.productId);

                  return (
                    <div
                      key={st.id}
                      className="border-2 rounded-xl p-3.5 bg-white shadow-xs"
                      style={cardStyle}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                        <span className="text-xs font-mono text-slate-500 font-bold">{st.date}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                          {st.quantity} Cases
                        </span>
                      </div>

                      <div className="font-bold text-slate-900 text-sm">
                        {prod ? prod.name : `Product #${st.productId}`}
                      </div>
                      {st.batchNumber && (
                        <div className="text-xs font-mono text-slate-500 mt-0.5">
                          Batch: <strong className="text-slate-700">{st.batchNumber}</strong>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 text-xs flex-wrap">
                        <span className="font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          From: {fromWh ? fromWh.name : st.fromWarehouseId}
                        </span>
                        <span className="text-slate-400">→</span>
                        <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          To: {toWh ? toWh.name : st.toWarehouseId}
                        </span>
                      </div>

                      {st.referenceNote && (
                        <div className="text-xs text-slate-500 italic mt-2 bg-slate-50 p-1.5 rounded border border-slate-200">
                          Note: {st.referenceNote}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* MODAL: ADD / EDIT WAREHOUSE */}
      {showWarehouseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="w-full max-w-lg border-2 p-6 shadow-xl"
            style={{ backgroundColor: palette.panel, borderColor: palette.line }}
          >
            <div className="flex items-center justify-between pb-3 border-b-2 mb-4" style={{ borderColor: palette.line }}>
              <h2 style={fz(18, { fontWeight: 700, color: palette.ink })}>
                {editingWarehouseId ? 'Edit Warehouse Facility' : 'Add New Warehouse / Godown'}
              </h2>
              <button
                id="btn-close-wh-modal"
                onClick={() => setShowWarehouseModal(false)}
                className="p-1 cursor-pointer"
              >
                <X size={20} color={palette.muted} />
              </button>
            </div>

            <form onSubmit={handleSaveWarehouse} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label style={labelStyle}>Warehouse Name *</label>
                  <input
                    id="input-wh-name"
                    type="text"
                    required
                    placeholder="e.g. Central Depot - Hadapsar"
                    value={whForm.name}
                    onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 focus-ring"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Code *</label>
                  <input
                    id="input-wh-code"
                    type="text"
                    required
                    placeholder="WH-01"
                    value={whForm.code}
                    onChange={(e) => setWhForm({ ...whForm, code: e.target.value })}
                    className="w-full px-3 py-2 border-2 focus-ring uppercase"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Location / Address</label>
                <input
                  id="input-wh-location"
                  type="text"
                  placeholder="Plot 45, MIDC Industrial Area"
                  value={whForm.location}
                  onChange={(e) => setWhForm({ ...whForm, location: e.target.value })}
                  className="w-full px-3 py-2 border-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Facility Manager</label>
                  <input
                    id="input-wh-manager"
                    type="text"
                    placeholder="Manager Name"
                    value={whForm.manager}
                    onChange={(e) => setWhForm({ ...whForm, manager: e.target.value })}
                    className="w-full px-3 py-2 border-2 focus-ring"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Contact Phone</label>
                  <input
                    id="input-wh-phone"
                    type="text"
                    placeholder="9876543210"
                    value={whForm.phone}
                    onChange={(e) => setWhForm({ ...whForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border-2 focus-ring"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Capacity (Cases)</label>
                  <input
                    id="input-wh-capacity"
                    type="number"
                    min="0"
                    value={whForm.capacityCases}
                    onChange={(e) => setWhForm({ ...whForm, capacityCases: Number(e.target.value) })}
                    className="w-full px-3 py-2 border-2 focus-ring"
                    style={inputStyle}
                  />
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="checkbox-wh-default"
                      type="checkbox"
                      checked={whForm.isDefault}
                      onChange={(e) => setWhForm({ ...whForm, isDefault: e.target.checked })}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span style={fz(13, { fontWeight: 600, color: palette.ink })}>Set as Default Facility</span>
                  </label>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Notes</label>
                <textarea
                  id="textarea-wh-notes"
                  rows={2}
                  placeholder="Storage conditions, temperature controls, keyholder..."
                  value={whForm.notes}
                  onChange={(e) => setWhForm({ ...whForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t-2" style={{ borderColor: palette.line }}>
                <button
                  id="btn-cancel-wh"
                  type="button"
                  onClick={() => setShowWarehouseModal(false)}
                  className="px-4 py-2 border-2 cursor-pointer font-semibold"
                  style={{ borderColor: palette.line, color: palette.ink }}
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-wh"
                  type="submit"
                  className="px-5 py-2 font-bold cursor-pointer"
                  style={{ backgroundColor: palette.navy, color: '#FFFFFF' }}
                >
                  {editingWarehouseId ? 'Update Warehouse' : 'Save Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT BATCH */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="w-full max-w-lg border-2 p-6 shadow-xl"
            style={{ backgroundColor: palette.panel, borderColor: palette.line }}
          >
            <div className="flex items-center justify-between pb-3 border-b-2 mb-4" style={{ borderColor: palette.line }}>
              <h2 style={fz(18, { fontWeight: 700, color: palette.ink })}>
                {editingBatchId ? 'Edit Batch Registration' : 'Register Product Batch'}
              </h2>
              <button
                id="btn-close-batch-modal"
                onClick={() => setShowBatchModal(false)}
                className="p-1 cursor-pointer"
              >
                <X size={20} color={palette.muted} />
              </button>
            </div>

            <form onSubmit={handleSaveBatch} className="space-y-3">
              <div>
                <label style={labelStyle}>Product *</label>
                <select
                  id="select-batch-product"
                  required
                  value={batchForm.productId}
                  onChange={(e) => {
                    const pid = Number(e.target.value);
                    const prod = products.find((p) => p.id === pid);
                    setBatchForm({
                      ...batchForm,
                      productId: pid,
                      costPrice: prod?.cost || batchForm.costPrice,
                      mrp: prod?.retail || batchForm.mrp,
                      expiryDate: prod?.expiry || batchForm.expiryDate,
                    });
                  }}
                  className="w-full px-3 py-2 border-2 focus-ring cursor-pointer"
                  style={inputStyle}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.pack})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Batch / Lot Number *</label>
                  <input
                    id="input-batch-number"
                    type="text"
                    required
                    placeholder="e.g. B-2026-99"
                    value={batchForm.batchNumber}
                    onChange={(e) => setBatchForm({ ...batchForm, batchNumber: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border-2 focus-ring font-mono font-bold uppercase"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Target Godown / Warehouse</label>
                  <select
                    id="select-batch-wh-target"
                    value={batchForm.warehouseId}
                    onChange={(e) => setBatchForm({ ...batchForm, warehouseId: e.target.value })}
                    className="w-full px-3 py-2 border-2 focus-ring cursor-pointer"
                    style={inputStyle}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.isDefault ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Manufacturing (MFG) Date</label>
                  <input
                    id="input-batch-mfg"
                    type="date"
                    value={batchForm.mfgDate}
                    onChange={(e) => setBatchForm({ ...batchForm, mfgDate: e.target.value })}
                    className="w-full px-3 py-2 border-2 focus-ring"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Expiry (EXP) Date *</label>
                  <input
                    id="input-batch-expiry"
                    type="date"
                    required
                    value={batchForm.expiryDate}
                    onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border-2 focus-ring font-bold"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label style={labelStyle}>Quantity (Cases) *</label>
                  <input
                    id="input-batch-qty"
                    type="number"
                    min="0"
                    required
                    value={batchForm.quantity}
                    onChange={(e) => setBatchForm({ ...batchForm, quantity: Number(e.target.value) })}
                    className="w-full px-3 py-2 border-2 focus-ring font-bold"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Cost / Case (₹)</label>
                  <input
                    id="input-batch-cost"
                    type="number"
                    step="0.01"
                    value={batchForm.costPrice}
                    onChange={(e) => setBatchForm({ ...batchForm, costPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 border-2 focus-ring"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>MRP / Case (₹)</label>
                  <input
                    id="input-batch-mrp"
                    type="number"
                    step="0.01"
                    value={batchForm.mrp}
                    onChange={(e) => setBatchForm({ ...batchForm, mrp: Number(e.target.value) })}
                    className="w-full px-3 py-2 border-2 focus-ring"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Notes / Quality Remarks</label>
                <textarea
                  id="textarea-batch-notes"
                  rows={2}
                  placeholder="Supplier batch code, QA inspection passed, delivery invoice ref..."
                  value={batchForm.notes}
                  onChange={(e) => setBatchForm({ ...batchForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t-2" style={{ borderColor: palette.line }}>
                <button
                  id="btn-cancel-batch"
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-4 py-2 border-2 cursor-pointer font-semibold"
                  style={{ borderColor: palette.line, color: palette.ink }}
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-batch"
                  type="submit"
                  className="px-5 py-2 font-bold cursor-pointer"
                  style={{ backgroundColor: palette.navy, color: '#FFFFFF' }}
                >
                  {editingBatchId ? 'Update Batch' : 'Save Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STOCK TRANSFER */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="w-full max-w-lg border-2 p-6 shadow-xl"
            style={{ backgroundColor: palette.panel, borderColor: palette.line }}
          >
            <div className="flex items-center justify-between pb-3 border-b-2 mb-4" style={{ borderColor: palette.line }}>
              <h2 style={fz(18, { fontWeight: 700, color: palette.ink })}>Inter-Warehouse Stock Transfer</h2>
              <button
                id="btn-close-transfer-modal"
                onClick={() => setShowTransferModal(false)}
                className="p-1 cursor-pointer"
              >
                <X size={20} color={palette.muted} />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="space-y-3">
              <div>
                <label style={labelStyle}>Transfer Date *</label>
                <input
                  id="input-transfer-date"
                  type="date"
                  required
                  value={transferForm.date}
                  onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })}
                  className="w-full px-3 py-2 border-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>From Warehouse (Source) *</label>
                  <select
                    id="select-transfer-from"
                    required
                    value={transferForm.fromWarehouseId}
                    onChange={(e) => setTransferForm({ ...transferForm, fromWarehouseId: e.target.value })}
                    className="w-full px-3 py-2 border-2 focus-ring cursor-pointer"
                    style={inputStyle}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>To Warehouse (Destination) *</label>
                  <select
                    id="select-transfer-to"
                    required
                    value={transferForm.toWarehouseId}
                    onChange={(e) => setTransferForm({ ...transferForm, toWarehouseId: e.target.value })}
                    className="w-full px-3 py-2 border-2 focus-ring cursor-pointer"
                    style={inputStyle}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Product *</label>
                <select
                  id="select-transfer-prod"
                  required
                  value={transferForm.productId}
                  onChange={(e) => {
                    const pid = Number(e.target.value);
                    const matchingBatches = inventoryBatches.filter(
                      (b) => b.productId === pid && b.warehouseId === transferForm.fromWarehouseId
                    );
                    setTransferForm({
                      ...transferForm,
                      productId: pid,
                      batchNumber: matchingBatches[0]?.batchNumber || '',
                    });
                  }}
                  className="w-full px-3 py-2 border-2 focus-ring cursor-pointer"
                  style={inputStyle}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Batch Number</label>
                  <input
                    id="input-transfer-batch"
                    type="text"
                    placeholder="Batch Lot (optional)"
                    value={transferForm.batchNumber}
                    onChange={(e) => setTransferForm({ ...transferForm, batchNumber: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border-2 focus-ring font-mono font-bold uppercase"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Quantity to Transfer (Cases) *</label>
                  <input
                    id="input-transfer-qty"
                    type="number"
                    min="1"
                    required
                    value={transferForm.quantity}
                    onChange={(e) => setTransferForm({ ...transferForm, quantity: Number(e.target.value) })}
                    className="w-full px-3 py-2 border-2 focus-ring font-bold"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Delivery Challan / Reference Note</label>
                <input
                  id="input-transfer-note"
                  type="text"
                  placeholder="e.g. Challan #CH-882, vehicle tempo MH-12-AB-1234"
                  value={transferForm.referenceNote}
                  onChange={(e) => setTransferForm({ ...transferForm, referenceNote: e.target.value })}
                  className="w-full px-3 py-2 border-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t-2" style={{ borderColor: palette.line }}>
                <button
                  id="btn-cancel-transfer"
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 border-2 cursor-pointer font-semibold"
                  style={{ borderColor: palette.line, color: palette.ink }}
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-transfer"
                  type="submit"
                  className="px-5 py-2 font-bold cursor-pointer"
                  style={{ backgroundColor: palette.navy, color: '#FFFFFF' }}
                >
                  Execute Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Warehouse Confirmation Modal */}
      {warehouseToDelete && (
        <ConfirmDeleteModal
          isOpen={!!warehouseToDelete}
          onClose={() => setWarehouseToDelete(null)}
          onConfirm={() => {
            deleteWarehouse(warehouseToDelete.id);
            setWarehouseToDelete(null);
          }}
          title="Delete Godown Location"
          subtitle={`${warehouseToDelete.name} (${warehouseToDelete.code})`}
          warningNote="This will remove this warehouse from your godown registry. (Verified: 0 cases currently stored)."
          confirmationPrompt={`I confirm that I want to remove godown "${warehouseToDelete.name}".`}
          confirmButtonLabel="Permanently Delete Godown"
          impactItems={[
            { label: 'Godown Name', detail: warehouseToDelete.name },
            { label: 'Facility Code', detail: warehouseToDelete.code },
            { label: 'Location', detail: warehouseToDelete.location || 'Not specified' },
          ]}
        />
      )}

      {/* Cannot Delete Warehouse Alert Modal */}
      {cannotDeleteWarehouse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border-2 border-amber-500 rounded p-5 shadow-xl">
            <div className="flex items-center gap-2 text-amber-700 font-bold mb-2">
              <AlertTriangle size={20} />
              <span>Cannot Delete Godown With Stock</span>
            </div>
            <p className="text-sm text-slate-700 mb-4">
              Godown <strong>"{cannotDeleteWarehouse.name}"</strong> currently holds{' '}
              <strong>{cannotDeleteWarehouse.cases} active cases</strong>. Before deleting this godown, please transfer the inventory to another godown or dispatch it in sales trips.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCannotDeleteWarehouse(null)}
                className="px-4 py-2 bg-slate-800 text-white font-bold text-xs rounded cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Batch Confirmation Modal */}
      {batchToDelete && (
        <ConfirmDeleteModal
          isOpen={!!batchToDelete}
          onClose={() => setBatchToDelete(null)}
          onConfirm={() => {
            deleteBatch(batchToDelete.id);
            setBatchToDelete(null);
          }}
          title="Delete Inventory Batch Lot"
          subtitle={`Lot #${batchToDelete.batchNumber}`}
          warningNote={`This will permanently remove this batch lot from inventory and deduct ${batchToDelete.quantity} cases from available stock.`}
          confirmationPrompt={`I confirm that I want to delete batch ${batchToDelete.batchNumber} and deduct ${batchToDelete.quantity} cases.`}
          confirmButtonLabel="Permanently Delete Batch"
          impactItems={[
            {
              label: 'Stock Deduction',
              detail: `Will reverse from ${warehouses.find((w) => w.id === batchToDelete.warehouseId)?.name || 'Godown'}`,
              qtyChange: `-${batchToDelete.quantity} cs`,
            },
            {
              label: 'Associated Product',
              detail: products.find((p) => p.id === batchToDelete.productId)?.name || `Product #${batchToDelete.productId}`,
            },
            {
              label: 'Expiry Date',
              detail: batchToDelete.expiryDate || 'N/A',
            },
          ]}
        />
      )}
    </div>
  );
};
