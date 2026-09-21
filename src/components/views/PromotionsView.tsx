import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Cloud,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Promotion, PromotionType } from '../../types';
import { schemeLabel } from '../../utils/billing';
import { IconButton } from '../common/IconButton';

export const PromotionsView: React.FC = () => {
  const {
    promotions,
    products,
    addPromotion,
    updatePromotion,
    deletePromotion,
    supabaseStatus,
    syncToCloud,
    palette,
    fz,
    scale,
  } = useLedger();

  const [showAddPromo, setShowAddPromo] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<number | null>(null);
  const [isSyncingSchemes, setIsSyncingSchemes] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [draftPromo, setDraftPromo] = useState<Omit<Promotion, 'id'>>({
    name: '',
    type: 'bogo',
    buyQty: 2,
    freeQty: 1,
    percent: 10,
    flatPerCase: 15,
    productIds: [],
  });

  // Smart Filter Bar State
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | PromotionType>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

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

  const activeFiltersCount =
    (typeFilter !== 'all' ? 1 : 0) +
    (productFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setTypeFilter('all');
    setProductFilter('all');
    setSearchQuery('');
  };

  const filteredPromotions = promotions.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      schemeLabel(p).toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.productIds.some((id) =>
        products.find((prod) => prod.id === id)?.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    const matchesProduct =
      productFilter === 'all' ||
      p.productIds.length === 0 ||
      p.productIds.includes(Number(productFilter));

    return matchesSearch && matchesType && matchesProduct;
  });

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

  const startEdit = (promo: Promotion) => {
    setEditingPromoId(promo.id);
    setDraftPromo({
      name: promo.name,
      type: promo.type,
      buyQty: promo.buyQty,
      freeQty: promo.freeQty,
      percent: promo.percent,
      flatPerCase: promo.flatPerCase,
      productIds: [...promo.productIds],
    });
    setShowAddPromo(true);
  };

  const cancelEdit = () => {
    setEditingPromoId(null);
    setShowAddPromo(false);
    setDraftPromo({
      name: '',
      type: 'bogo',
      buyQty: 2,
      freeQty: 1,
      percent: 10,
      flatPerCase: 15,
      productIds: [],
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPromo.name.trim()) return;

    const schemeName = draftPromo.name;
    if (editingPromoId) {
      updatePromotion(editingPromoId, draftPromo);
      setStatusMsg(`Scheme "${schemeName}" updated and synced to Supabase database (public.promotions).`);
    } else {
      addPromotion(draftPromo);
      setStatusMsg(`Scheme "${schemeName}" created and synced to Supabase database (public.promotions).`);
    }
    cancelEdit();
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const handleSyncDatabase = async () => {
    setIsSyncingSchemes(true);
    setStatusMsg(null);
    try {
      const res = await syncToCloud();
      setStatusMsg(res.message || 'Schemes successfully synchronized to Supabase.');
    } catch (e: any) {
      setStatusMsg(`Database sync failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setIsSyncingSchemes(false);
      setTimeout(() => setStatusMsg(null), 6000);
    }
  };

  const toggleProduct = (productId: number) => {
    setDraftPromo((prev) => {
      const exists = prev.productIds.includes(productId);
      return {
        ...prev,
        productIds: exists ? prev.productIds.filter((id) => id !== productId) : [...prev.productIds, productId],
      };
    });
  };

  return (
    <div id="view-promotions" className="p-4 sm:p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 style={fz(24, { fontWeight: 700, color: palette.ink })}>Beverage Schemes & Promotions</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="btn-sync-promotions-db"
            onClick={handleSyncDatabase}
            disabled={isSyncingSchemes}
            className="flex items-center gap-2 border-2 px-3.5 py-2.5 focus-ring cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: palette.panel,
              color: palette.ink,
              borderColor: palette.line,
              ...fz(14, { fontWeight: 600 }),
            }}
            title="Push all schemes and trade promotions directly to Supabase"
          >
            <RefreshCw size={Math.round(16 * scale)} className={isSyncingSchemes ? 'animate-spin' : ''} aria-hidden="true" />
            {isSyncingSchemes ? 'Syncing...' : 'Sync to Supabase'}
          </button>
          <button
            id="btn-open-new-scheme"
            onClick={() => {
              setEditingPromoId(null);
              setDraftPromo({
                name: '',
                type: 'bogo',
                buyQty: 2,
                freeQty: 1,
                percent: 10,
                flatPerCase: 15,
                productIds: [],
              });
              setShowAddPromo(true);
            }}
            className="flex items-center gap-2 border-2 px-4 py-2.5 focus-ring cursor-pointer"
            style={{
              backgroundColor: palette.navy,
              color: '#FFFFFF',
              borderColor: palette.navy,
              ...fz(15, { fontWeight: 700 }),
            }}
          >
            <Plus size={Math.round(18 * scale)} aria-hidden="true" />
            New Scheme
          </button>
        </div>
      </div>

      {/* Cloud Sync Status Banner */}
      {statusMsg && (
        <div
          id="promotions-sync-alert"
          className="border-2 p-3 mb-4 flex items-center gap-2.5 text-sm"
          style={{
            backgroundColor: `${palette.good}15`,
            borderColor: palette.good,
            color: palette.good,
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Database connection info badge */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border mb-4 text-xs"
        style={{
          borderColor: supabaseStatus.isConnected ? palette.good : palette.line,
          backgroundColor: palette.panel,
          color: palette.muted,
        }}
      >
        <Cloud size={14} style={{ color: supabaseStatus.isConnected ? palette.good : palette.muted }} />
        <span>
          Supabase Database:{' '}
          <strong style={{ color: supabaseStatus.isConnected ? palette.good : palette.ink }}>
            {supabaseStatus.isConnected ? 'Connected (table: public.promotions)' : 'Offline / Local Cache'}
          </strong>
        </span>
        {supabaseStatus.lastSyncedAt && (
          <span className="ml-auto text-[11px] text-gray-500">Last Synced: {supabaseStatus.lastSyncedAt}</span>
        )}
      </div>

      {/* Promotion Form */}
      {showAddPromo && (
        <form
          id="form-promo"
          onSubmit={handleSave}
          className="border-2 p-5 mb-6 shadow-sm"
          style={{ borderColor: palette.amber, backgroundColor: palette.panel }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 style={fz(18, { fontWeight: 700, color: palette.ink })}>
              {editingPromoId ? 'Edit Trade Scheme' : 'Create Trade Scheme'}
            </h2>
            <IconButton onClick={cancelEdit} icon={X} label="Cancel scheme editing" id="close-scheme-form" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="sm:col-span-2">
              <label htmlFor="promo-name" style={labelStyle}>
                Scheme Display Title *
              </label>
              <input
                id="promo-name"
                required
                value={draftPromo.name}
                onChange={(e) => setDraftPromo({ ...draftPromo, name: e.target.value })}
                className="border-2 px-3 py-2.5 w-full focus-ring"
                style={inputStyle}
                placeholder="e.g. Campa 150ml Summer BOGO (Buy 2 Get 1 Free)"
              />
            </div>

            <div>
              <label htmlFor="promo-type" style={labelStyle}>
                Calculation Mechanism
              </label>
              <select
                id="promo-type"
                value={draftPromo.type}
                onChange={(e) => setDraftPromo({ ...draftPromo, type: e.target.value as PromotionType })}
                className="border-2 px-3 py-2.5 w-full focus-ring"
                style={inputStyle}
              >
                <option value="bogo">Buy X Get Y Free (BOGO)</option>
                <option value="percent">Percentage Discount (% off)</option>
                <option value="flat">Flat Cash Discount (₹ off/case)</option>
              </select>
            </div>

            {draftPromo.type === 'bogo' && (
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label htmlFor="promo-buy" style={labelStyle}>
                    Buy Qty (Cases)
                  </label>
                  <input
                    id="promo-buy"
                    type="number"
                    min="1"
                    value={draftPromo.buyQty}
                    onChange={(e) => setDraftPromo({ ...draftPromo, buyQty: Math.max(1, Number(e.target.value)) })}
                    className="w-full border-2 px-3 py-2.5 focus-ring"
                    style={inputStyle}
                  />
                </div>
                <div className="w-1/2">
                  <label htmlFor="promo-free" style={labelStyle}>
                    Free Qty (Cases)
                  </label>
                  <input
                    id="promo-free"
                    type="number"
                    min="1"
                    value={draftPromo.freeQty}
                    onChange={(e) => setDraftPromo({ ...draftPromo, freeQty: Math.max(1, Number(e.target.value)) })}
                    className="w-full border-2 px-3 py-2.5 focus-ring"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {draftPromo.type === 'percent' && (
              <div>
                <label htmlFor="promo-percent" style={labelStyle}>
                  Discount Percentage (% off gross)
                </label>
                <input
                  id="promo-percent"
                  type="number"
                  min="1"
                  max="100"
                  value={draftPromo.percent}
                  onChange={(e) => setDraftPromo({ ...draftPromo, percent: Number(e.target.value) })}
                  className="border-2 px-3 py-2.5 w-full focus-ring"
                  style={inputStyle}
                />
              </div>
            )}

            {draftPromo.type === 'flat' && (
              <div>
                <label htmlFor="promo-flat" style={labelStyle}>
                  Flat Cash Reduction (₹ per case)
                </label>
                <input
                  id="promo-flat"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={draftPromo.flatPerCase}
                  onChange={(e) => setDraftPromo({ ...draftPromo, flatPerCase: Number(e.target.value) })}
                  className="border-2 px-3 py-2.5 w-full focus-ring"
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          <div style={fz(14, { color: palette.ink, fontWeight: 700, marginBottom: '0.4em' })}>
            Select Eligible Beverage Products:
          </div>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 max-h-60 overflow-y-auto p-3 border-2"
            style={{ borderColor: palette.line, backgroundColor: palette.panel }}
          >
            {products.map((p) => {
              const checked = draftPromo.productIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-2.5 py-1 px-1 cursor-pointer select-none"
                  style={fz(14)}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProduct(p.id)}
                    className="w-4 h-4"
                  />
                  <span className={checked ? 'font-semibold' : ''}>{p.name}</span>
                </label>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              id="btn-save-scheme"
              type="submit"
              className="border-2 px-5 py-2.5 focus-ring cursor-pointer"
              style={{
                backgroundColor: palette.amber,
                borderColor: palette.amber,
                color: '#FFFFFF',
                ...fz(15, { fontWeight: 700 }),
              }}
            >
              {editingPromoId ? 'Save Changes' : 'Save Scheme'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="border-2 px-4 py-2.5 focus-ring cursor-pointer"
              style={{
                borderColor: palette.line,
                color: palette.muted,
                backgroundColor: palette.panel,
                ...fz(15, { fontWeight: 600 }),
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Smart Space-Saving Filter Bar */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                id="input-promo-search"
                type="text"
                placeholder="Search scheme name, product, or rule..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 border-2 rounded focus-ring bg-white text-xs sm:text-sm"
                style={{ borderColor: palette.line, color: palette.ink }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Options Popover Trigger */}
            <div className="relative" ref={filterDropdownRef}>
              <button
                type="button"
                id="btn-promo-filters-toggle"
                onClick={() => setShowFilterDropdown((prev) => !prev)}
                className={`flex items-center gap-2 px-3 py-2 border-2 rounded text-xs sm:text-sm font-bold cursor-pointer transition-colors focus-ring ${
                  showFilterDropdown || activeFiltersCount > 0
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-white hover:bg-slate-50 text-slate-800'
                }`}
                style={{
                  borderColor: showFilterDropdown || activeFiltersCount > 0 ? palette.navy : palette.line,
                }}
              >
                <Filter size={14} />
                <span>Filter Options</span>
                {activeFiltersCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 ${showFilterDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Smart Popover */}
              {showFilterDropdown && (
                <div
                  id="popover-promo-filters"
                  className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-72 sm:w-80 bg-white border-2 rounded-xl shadow-2xl z-50 p-4 space-y-3.5 animate-in fade-in duration-150"
                  style={{ borderColor: palette.navy }}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal size={15} className="text-blue-900" />
                      <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Scheme Filter Options
                      </span>
                    </div>
                    {activeFiltersCount > 0 && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-[11px] font-bold text-red-600 hover:text-red-800 flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw size={11} />
                        Reset
                      </button>
                    )}
                  </div>

                  {/* Scheme Type */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1">
                      <Tag size={12} /> Scheme Type:
                    </label>
                    <select
                      id="select-promo-type"
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as any)}
                      className="w-full border-2 px-2.5 py-1.5 text-xs font-semibold rounded bg-white focus:outline-none focus:border-blue-900"
                      style={{ borderColor: palette.line, color: palette.ink }}
                    >
                      <option value="all">All Scheme Types</option>
                      <option value="bogo">Buy X Get Y Free (BOGO / Free Cases)</option>
                      <option value="percent">Percentage Off (%)</option>
                      <option value="flat">Flat Cash Discount / Case (₹)</option>
                    </select>
                  </div>

                  {/* Target Product */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1">
                      Target Product:
                    </label>
                    <select
                      id="select-promo-product"
                      value={productFilter}
                      onChange={(e) => setProductFilter(e.target.value)}
                      className="w-full border-2 px-2.5 py-1.5 text-xs font-semibold rounded bg-white focus:outline-none focus:border-blue-900"
                      style={{ borderColor: palette.line, color: palette.ink }}
                    >
                      <option value="all">All Products</option>
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
                      {filteredPromotions.length} schemes found
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowFilterDropdown(false)}
                      className="px-3.5 py-1.5 text-xs font-bold rounded bg-blue-900 text-white hover:bg-blue-950 cursor-pointer shadow-xs"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Active Filter Chips */}
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active Filters:</span>
            {typeFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-200">
                Type: {typeFilter === 'bogo' ? 'Buy X Get Y' : typeFilter === 'percent' ? '% Off' : 'Flat ₹/Cs'}
                <button
                  type="button"
                  onClick={() => setTypeFilter('all')}
                  className="hover:text-amber-950 cursor-pointer"
                  title="Remove type filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {productFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-900 border border-blue-200">
                Product: {products.find((p) => String(p.id) === productFilter)?.name || productFilter}
                <button
                  type="button"
                  onClick={() => setProductFilter('all')}
                  className="hover:text-blue-950 cursor-pointer"
                  title="Remove product filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-blue-900 hover:underline font-bold cursor-pointer ml-1"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Promotions Cards Grid (Matches Dashboard Cards) */}
      <div>
        {filteredPromotions.length === 0 ? (
          <div className="p-8 text-center border-2 rounded-xl bg-white shadow-xs" style={{ borderColor: palette.line }}>
            <p style={fz(15, { color: palette.muted })}>
              {promotions.length === 0
                ? 'No active trade schemes configured. Click "New Scheme" to set up volume discounts or free cases.'
                : 'No trade schemes match your filter criteria. Try clearing filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredPromotions.map((p) => {
              const attachedProducts = p.productIds
                .map((id) => products.find((x) => x.id === id)?.name)
                .filter(Boolean);

              return (
                <div
                  key={p.id}
                  className="border-2 rounded-xl p-3.5 sm:p-4 shadow-xs bg-white flex flex-col justify-between gap-3"
                  style={{ borderColor: palette.line }}
                >
                  <div>
                    {/* Header: Name, scheme badge, Action buttons */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="font-bold text-xs px-2.5 py-0.5 border rounded-lg"
                            style={{
                              borderColor: palette.amber,
                              color: palette.amber,
                              backgroundColor: `${palette.amber}15`,
                            }}
                          >
                            {schemeLabel(p)}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 border text-[11px] rounded-lg font-semibold"
                            style={{
                              borderColor: palette.good,
                              color: palette.good,
                              backgroundColor: `${palette.good}10`,
                            }}
                          >
                            <CheckCircle2 size={12} />
                            <span>Active Scheme</span>
                          </span>
                        </div>
                        <h3 className="font-bold text-base text-slate-900 mt-1 break-words">
                          {p.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <IconButton
                          id={`edit-promo-${p.id}`}
                          onClick={() => startEdit(p)}
                          icon={Pencil}
                          label={`Edit scheme: ${p.name}`}
                        />
                        <IconButton
                          id={`delete-promo-${p.id}`}
                          onClick={() => {
                            if (window.confirm(`Delete promotion "${p.name}"?`)) {
                              deletePromotion(p.id);
                            }
                          }}
                          icon={Trash2}
                          label={`Delete scheme: ${p.name}`}
                          color={palette.bad}
                        />
                      </div>
                    </div>

                    {/* Scheme Details Metric Grid */}
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100">
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[11px] font-semibold text-slate-500">Scheme Mechanism</div>
                        <div className="text-sm font-bold text-slate-900 mt-0.5">
                          {schemeLabel(p)}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[11px] font-semibold text-slate-500">Target SKUs</div>
                        <div className="text-sm font-bold text-slate-900 mt-0.5">
                          {p.productIds.length === 0 ? 'All Beverages' : `${p.productIds.length} Linked`}
                        </div>
                      </div>
                    </div>

                    {/* Attached Products Chips */}
                    <div className="mt-2.5 p-2 bg-slate-50/80 border border-slate-200 rounded-lg text-xs">
                      <div className="text-[11px] font-semibold text-slate-500 mb-1">
                        Applied Products ({attachedProducts.length}):
                      </div>
                      {attachedProducts.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {attachedProducts.map((prodName, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-700 font-medium"
                            >
                              {prodName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Applies to all products across catalogue</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
