import React, { useEffect, useRef, useState } from 'react';
import { notify } from "../../utils/toast";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Promotion, PromotionType } from '../../types';
import { schemeLabel } from '../../utils/billing';
import { ConfirmModal } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { PackIcon } from '../common/PackIcon';

export const PromotionsView: React.FC = () => {
  const {
    promotions,
    products,
    addPromotion,
    updatePromotion,
    deletePromotion,
    syncToCloud,
  } = useLedger();

  const [showAddPromo, setShowAddPromo] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<number | null>(null);
  const [promoToDelete, setPromoToDelete] = useState<Promotion | null>(null);
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
    isActive: true,
    bundleBuyType: 'any',
    requiredDistinctTypes: 2,
    minQtyPerType: 1,
    freeRewardChoice: 'all_eligible',
    freeProductId: undefined,
    freeProductQty: 1,
    productGroup: [],
    groupCategory: '',
    groupBrand: '',
    freeItemRule: 'CHEAPEST_IN_GROUP',
    customerChoiceProductId: undefined,
  });

  // Smart Filter Bar State
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | PromotionType>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  // Phone UI navigation state (does not affect desktop/tablet or data model)
  const isPhone = useIsMobile(767);
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3>(1);
  const [mobileScopeMode, setMobileScopeMode] = useState<'products' | 'category' | 'brand'>('products');
  const [mobileProdQuery, setMobileProdQuery] = useState('');

  // Categories & Brands for group tagging
  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
  const brands = Array.from(new Set(products.map((p) => p.brand).filter(Boolean)));

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
      (schemeLabel(p, products) || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.productIds || []).some((id) =>
        products.find((prod) => prod.id === id)?.name.toLowerCase().includes(searchQuery.toLowerCase())
      ) ||
      (p.productGroup || []).some((id) =>
        products.find((prod) => prod.id === id)?.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    const matchesProduct =
      productFilter === 'all' ||
      (p.productIds && p.productIds.length === 0) ||
      (p.productIds && p.productIds.includes(Number(productFilter))) ||
      (p.productGroup && p.productGroup.includes(Number(productFilter)));

    return matchesSearch && matchesType && matchesProduct;
  });

  const startEdit = (promo: Promotion) => {
    setEditingPromoId(promo.id);
    setDraftPromo({
      name: promo.name,
      type: promo.type,
      buyQty: promo.buyQty,
      freeQty: promo.freeQty,
      percent: promo.percent,
      flatPerCase: promo.flatPerCase,
      productIds: [...(promo.productIds || (promo as any).product_ids || []).map(Number)],
      bundleBuyType: promo.bundleBuyType || 'any',
      requiredDistinctTypes: promo.requiredDistinctTypes || 2,
      minQtyPerType: promo.minQtyPerType || 1,
      freeRewardChoice: promo.freeRewardChoice || 'all_eligible',
      freeProductId: promo.freeProductId,
      isActive: promo.isActive !== false,
      freeProductQty: promo.freeProductQty || 1,
      productGroup: promo.productGroup ? [...promo.productGroup.map(Number)] : [],
      groupCategory: promo.groupCategory || '',
      groupBrand: promo.groupBrand || '',
      freeItemRule: promo.freeItemRule || 'CHEAPEST_IN_GROUP',
      customerChoiceProductId: promo.customerChoiceProductId,
    });
    setMobileStep(1);
    setMobileScopeMode(promo.groupCategory ? 'category' : promo.groupBrand ? 'brand' : 'products');
    setMobileProdQuery('');
    setShowAddPromo(true);
  };

  const cancelEdit = () => {
    setEditingPromoId(null);
    setShowAddPromo(false);
    setMobileStep(1);
    setMobileScopeMode('products');
    setMobileProdQuery('');
    setDraftPromo({
      name: '',
      type: 'bogo',
      buyQty: 2,
      freeQty: 1,
      percent: 10,
      flatPerCase: 15,
      productIds: [],
      bundleBuyType: 'any',
      requiredDistinctTypes: 2,
      minQtyPerType: 1,
      freeRewardChoice: 'all_eligible',
      freeProductId: undefined,
      isActive: true,
      freeProductQty: 1,
      productGroup: [],
      groupCategory: '',
      groupBrand: '',
      freeItemRule: 'CHEAPEST_IN_GROUP',
      customerChoiceProductId: undefined,
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPromo.name.trim()) return;

    if (
      draftPromo.type === 'bundle' &&
      draftPromo.freeRewardChoice === 'specific' &&
      !draftPromo.freeProductId
    ) {
      notify('Please choose the Designated Free Reward Product.');
      return;
    }

    if (draftPromo.type === 'buy_x_get_different_free') {
      if (!draftPromo.freeProductId) {
        notify('Please choose the Free Product (Product B) that customers receive for free.');
        return;
      }
      if (draftPromo.productIds.length === 0) {
        notify('Please select at least one trigger product (Product A) that customers must buy.');
        return;
      }
    }

    if (draftPromo.type === 'group_buy_n_get_m_free') {
      const hasProducts = (draftPromo.productGroup && draftPromo.productGroup.length > 0) || (draftPromo.productIds && draftPromo.productIds.length > 0);
      const hasTag = !!draftPromo.groupCategory || !!draftPromo.groupBrand;
      if (!hasProducts && !hasTag) {
        notify('Please select the products or category/brand tag belonging to this group.');
        return;
      }
      if (draftPromo.freeItemRule === 'SPECIFIC_PRODUCT' && !draftPromo.freeProductId) {
        notify('Please select the specific free product to award for this group scheme.');
        return;
      }
    }

    const schemeName = draftPromo.name;
    const cleanIds = (draftPromo.productIds || []).map(Number).filter((n) => !isNaN(n));
    const cleanGroup = (draftPromo.productGroup || []).map(Number).filter((n) => !isNaN(n));
    const cleanDistinct = draftPromo.type === 'bundle'
      ? (cleanIds.length === 1 ? 1 : Math.max(1, draftPromo.requiredDistinctTypes || 2))
      : draftPromo.requiredDistinctTypes;

    const cleanDraft: Omit<Promotion, 'id'> = {
      ...draftPromo,
      productIds: cleanIds,
      productGroup: cleanGroup.length > 0 ? cleanGroup : cleanIds,
      requiredDistinctTypes: cleanDistinct,
      isActive: draftPromo.isActive !== false,
      freeItemRule: draftPromo.freeItemRule || draftPromo.freeItem || 'CHEAPEST_IN_GROUP',
      freeItem: draftPromo.freeItemRule || draftPromo.freeItem || 'CHEAPEST_IN_GROUP',
    };
    if (editingPromoId) {
      updatePromotion(editingPromoId, cleanDraft);
      setStatusMsg(`Scheme "${schemeName}" updated and synced — now active for billing.`);
    } else {
      addPromotion(cleanDraft);
      setStatusMsg(`Scheme "${schemeName}" created and synced — now active for billing.`);
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

  const toggleSchemeActive = (promo: Promotion) => {
    const nextActive = promo.isActive === false;
    updatePromotion(promo.id, {
      ...promo,
      isActive: nextActive,
    });
    setStatusMsg(
      nextActive
        ? `Scheme "${promo.name}" activated — will apply at billing.`
        : `Scheme "${promo.name}" deactivated — will not apply at billing.`
    );
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const toggleProduct = (productId: number) => {
    const numId = Number(productId);
    setDraftPromo((prev) => {
      const cleanIds = (prev.productIds || []).map(Number);
      const exists = cleanIds.some((id) => id === numId);
      return {
        ...prev,
        productIds: exists ? cleanIds.filter((id) => id !== numId) : [...cleanIds, numId],
      };
    });
  };

  const openMobileCreate = () => {
    setEditingPromoId(null);
    setDraftPromo({
      name: '',
      type: 'bogo',
      buyQty: 2,
      freeQty: 1,
      percent: 10,
      flatPerCase: 15,
      productIds: [],
      isActive: true,
      bundleBuyType: 'any',
      requiredDistinctTypes: 2,
      minQtyPerType: 1,
      freeRewardChoice: 'all_eligible',
      freeProductId: undefined,
      freeProductQty: 1,
      productGroup: [],
      groupCategory: '',
      groupBrand: '',
      freeItemRule: 'CHEAPEST_IN_GROUP',
      freeItem: 'CHEAPEST_IN_GROUP',
      customerChoiceProductId: undefined,
    });
    setMobileStep(1);
    setMobileScopeMode('products');
    setMobileProdQuery('');
    setShowAddPromo(true);
  };

  if (isPhone) {
    const liveCount = promotions.filter((p) => p.isActive !== false).length;
    const selectedIds = (draftPromo.productIds || []).map(Number);
    const matchingProducts = products.filter((p) => {
      const q = mobileProdQuery.trim().toLowerCase();
      return !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q);
    });
    const selectedProductsList = matchingProducts.filter((p) => selectedIds.includes(Number(p.id)));
    const unselectedProductsList = matchingProducts.filter((p) => !selectedIds.includes(Number(p.id)));

    const previewText = (() => {
      const base = schemeLabel({ ...draftPromo, id: 0 } as Promotion, products);
      const selectedNames = selectedIds
        .map((id) => products.find((p) => p.id === id)?.name)
        .filter(Boolean) as string[];
      const targetStr =
        selectedNames.length > 0
          ? selectedNames.slice(0, 2).join(' or ') + (selectedNames.length > 2 ? ` +${selectedNames.length - 2} more` : '')
          : draftPromo.groupCategory
            ? `${draftPromo.groupCategory} category`
            : draftPromo.groupBrand
              ? `${draftPromo.groupBrand} brand`
              : 'any eligible product';

      if (draftPromo.type === 'bogo' && (draftPromo.buyQty || 0) > 0 && (draftPromo.freeQty || 0) > 0) {
        const bq = Number(draftPromo.buyQty) || 1;
        const fq = Number(draftPromo.freeQty) || 1;
        const sampleCart = bq * 2 + Math.min(5, Math.max(1, Math.floor(bq / 2)));
        const earned = Math.floor(sampleCart / bq) * fq;
        return `Buy ${bq} ${bq === 1 ? 'case' : 'cases'} of ${targetStr}, get ${fq} ${fq === 1 ? 'case' : 'cases'} free. A cart of ${sampleCart} cases earns ${earned} free ${earned === 1 ? 'case' : 'cases'}.`;
      }
      return base || 'Configure offer rule in steps 1 and 2.';
    })();

    const ruleSummaryVal = (() => {
      if (draftPromo.type === 'bogo') return `${draftPromo.freeQty || 1} per ${draftPromo.buyQty || 1} cases`;
      if (draftPromo.type === 'buy_x_get_different_free') return `${draftPromo.freeQty || 1} free per ${draftPromo.buyQty || 1}`;
      if (draftPromo.type === 'group_buy_n_get_m_free') return `${draftPromo.freeQty || 1} free per ${draftPromo.buyQty || 1}`;
      if (draftPromo.type === 'bundle') return `${draftPromo.freeProductQty || draftPromo.freeQty || 1} free on ${draftPromo.requiredDistinctTypes || 2}+ types`;
      if (draftPromo.type === 'percent') return `${draftPromo.percent || 0}% discount`;
      return `₹${draftPromo.flatPerCase || 0} / case`;
    })();

    const appliesSummaryVal = (() => {
      if (selectedIds.length > 0) {
        const names = selectedIds.map((id) => products.find((p) => p.id === id)?.name).filter(Boolean);
        return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
      }
      if (draftPromo.groupCategory) return `Category: ${draftPromo.groupCategory}`;
      if (draftPromo.groupBrand) return `Brand: ${draftPromo.groupBrand}`;
      return 'All products';
    })();

    const promoTypeOptions: { id: PromotionType; label: string }[] = [
      { id: 'bogo', label: 'Buy qty, get free qty' },
      { id: 'buy_x_get_different_free', label: 'Distinct reward SKU (a different product)' },
      { id: 'group_buy_n_get_m_free', label: 'Group scheme rules (aggregated cart count)' },
      { id: 'bundle', label: 'Combo Bundle' },
      { id: 'percent', label: 'Percent off' },
      { id: 'flat', label: 'Flat off' },
    ];

    const goNextFromStep1 = () => {
      if (!draftPromo.name.trim()) {
        notify('Please enter an offer name.');
        return;
      }
      if (draftPromo.type === 'buy_x_get_different_free' && !draftPromo.freeProductId) {
        notify('Please choose the Free Reward Product (Product B).');
        return;
      }
      if (
        draftPromo.type === 'group_buy_n_get_m_free' &&
        draftPromo.freeItemRule === 'SPECIFIC_PRODUCT' &&
        !draftPromo.freeProductId
      ) {
        notify('Please choose the Designated Free Product.');
        return;
      }
      setMobileStep(2);
    };

    const goNextFromStep2 = () => {
      if (draftPromo.type === 'buy_x_get_different_free' && selectedIds.length === 0) {
        notify('Please select at least one trigger product (Product A).');
        return;
      }
      if (draftPromo.type === 'group_buy_n_get_m_free') {
        const hasProducts = selectedIds.length > 0 || (draftPromo.productGroup && draftPromo.productGroup.length > 0);
        const hasTag = !!draftPromo.groupCategory || !!draftPromo.groupBrand;
        if (!hasProducts && !hasTag) {
          notify('Please select products or a category/brand tag for this group.');
          return;
        }
      }
      setMobileStep(3);
    };

    const applyCategoryTag = (cat: string) => {
      const catProductIds = cat ? products.filter((p) => p.category === cat).map((p) => Number(p.id)) : [];
      setDraftPromo((prev) => ({
        ...prev,
        groupCategory: cat,
        groupBrand: '',
        productIds: prev.type === 'group_buy_n_get_m_free' ? prev.productIds : catProductIds,
      }));
    };

    const applyBrandTag = (brand: string) => {
      const brandProductIds = brand ? products.filter((p) => p.brand === brand).map((p) => Number(p.id)) : [];
      setDraftPromo((prev) => ({
        ...prev,
        groupBrand: brand,
        groupCategory: '',
        productIds: prev.type === 'group_buy_n_get_m_free' ? prev.productIds : brandProductIds,
      }));
    };

    return (
      <div id="view-promotions" className="hh-view min-w-0 max-w-full pb-24">
        {/* Screen 1: Offers list */}
        <header className="hh-sales-top">
          <div className="hh-sales-top__row">
            <h1 className="hh-sales-top__title">Promotions</h1>
            <button
              type="button"
              id="btn-open-new-scheme"
              onClick={openMobileCreate}
              className="hh-sales-top__iconbtn"
              aria-label="New offer"
            >
              <Plus size={22} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="space-y-3">
          {statusMsg && (
            <div id="promotions-sync-alert" className="rt-notice rt-notice--paid flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" style={{ color: 'var(--paid)' }} />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* KPI Grid */}
          <div className="rt-kv-grid">
            <div className="rt-kv">
              <div className="rt-kv__label">Total offers</div>
              <div className="rt-kv__val">{promotions.length}</div>
            </div>
            <div className="rt-kv">
              <div className="rt-kv__label">Live now</div>
              <div className="rt-kv__val" style={{ color: 'var(--received)' }}>
                {liveCount}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="rt-search-bar">
            <Search size={17} style={{ color: 'var(--text-2)' }} aria-hidden="true" />
            <input
              enterKeyHint="search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search offers…"
              aria-label="Search offers"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 min-w-0 min-h-0 border-0 bg-transparent text-[var(--text-2)] cursor-pointer"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Offer cards */}
          {filteredPromotions.length === 0 ? (
            <div className="rt-card text-center py-8">
              <Tag size={26} className="mx-auto mb-2" style={{ color: 'var(--text-2)' }} aria-hidden="true" />
              <p className="text-sm font-bold text-[var(--text)]">
                {promotions.length === 0 ? 'No offers yet' : 'No offers match your search'}
              </p>
              <p className="text-xs text-[var(--text-2)] mt-1">
                {promotions.length === 0 ? 'Tap + above to create your first trade offer.' : 'Try a different keyword or clear search.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredPromotions.map((p) => {
                const live = p.isActive !== false;
                const detail = schemeLabel(p, products);
                const prodIds = (p.productIds || (p as any).product_ids || []).map(Number);
                const prodNames = prodIds
                  .map((id: number) => products.find((prod) => prod.id === id)?.name)
                  .filter(Boolean) as string[];
                const prodSummary =
                  prodNames.length > 0
                    ? prodNames.slice(0, 2).join(', ') + (prodNames.length > 2 ? ` +${prodNames.length - 2}` : '')
                    : p.groupCategory
                      ? `Category: ${p.groupCategory}`
                      : p.groupBrand
                        ? `Brand: ${p.groupBrand}`
                        : '';
                const dateMeta = [p.startDate && p.endDate ? `${p.startDate} – ${p.endDate}` : p.endDate ? `Until ${p.endDate}` : '']
                  .filter(Boolean)
                  .join('');
                const subLine = [prodSummary, dateMeta].filter(Boolean).join(' · ');

                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => startEdit(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        startEdit(p);
                      }
                    }}
                    className={`rt-offer-card cursor-pointer ${live ? '' : 'rt-offer-card--muted'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold text-[var(--text)] leading-snug break-words">
                          {p.name}
                        </div>
                        <div className="text-[13px] text-[var(--text)] mt-0.5 leading-snug">{detail}</div>
                        {subLine && (
                          <div className="text-[12px] text-[var(--text-2)] mt-0.5 leading-snug break-words">
                            {subLine}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={live}
                        aria-label={live ? `Pause ${p.name}` : `Activate ${p.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSchemeActive(p);
                        }}
                        className="hh-switch mt-0.5"
                      >
                        <span className="hh-switch__thumb" />
                      </button>
                    </div>
                    <div className="mt-2">
                      <span className={`rt-tag ${live ? 'rt-tag--paid' : ''}`}>{live ? 'Live' : 'Ended'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            id="btn-sync-promotions-db"
            onClick={handleSyncDatabase}
            disabled={isSyncingSchemes}
            className="rt-link-btn text-xs"
          >
            <RefreshCw size={13} className={isSyncingSchemes ? 'animate-spin' : ''} aria-hidden="true" />
            {isSyncingSchemes ? 'Syncing…' : 'Sync schemes to cloud'}
          </button>
        </div>

        {/* Mobile Screens 2–4: Create / Edit Offer 3-Step Flow */}
        {showAddPromo && (
          <div className="rt-flow-phone" role="dialog" aria-modal="true" aria-label={editingPromoId ? 'Edit offer' : 'New offer'}>
            <header className="hh-sales-top">
              <div className="hh-sales-top__row">
                <button
                  type="button"
                  onClick={() => {
                    if (mobileStep === 3) setMobileStep(2);
                    else if (mobileStep === 2) setMobileStep(1);
                    else cancelEdit();
                  }}
                  className="rt-back-link"
                >
                  <ChevronLeft size={22} strokeWidth={2.5} aria-hidden="true" />
                  <span>{editingPromoId ? 'Edit offer' : 'New offer'}</span>
                </button>
              </div>
            </header>

            {mobileStep === 1 && (
              <>
                <div className="rt-flow-phone__body space-y-3">
                  <div className="rt-in">
                    <label htmlFor="promo-name-phone" className="rt-in__label">
                      OFFER NAME
                    </label>
                    <input
                      id="promo-name-phone"
                      type="text"
                      value={draftPromo.name}
                      onChange={(e) => setDraftPromo({ ...draftPromo, name: e.target.value })}
                      placeholder="e.g. Diwali Deal"
                      className="rt-in__control"
                    />
                  </div>

                  <div>
                    <div className="hh-set-section-lbl">PROMOTION TYPE</div>
                    <div className="space-y-2" role="radiogroup" aria-label="Promotion type">
                      {promoTypeOptions.map((opt) => {
                        const checked = draftPromo.type === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            onClick={() =>
                              setDraftPromo((prev) => ({
                                ...prev,
                                type: opt.id,
                                freeItemRule: prev.freeItemRule || 'CHEAPEST_IN_GROUP',
                              }))
                            }
                            className="hh-set-radio"
                          >
                            <span className="hh-set-radio__dot" aria-hidden="true" />
                            <span className="text-[13.5px] font-semibold text-[var(--text)] leading-snug">
                              {opt.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dynamic fields per promotion type */}
                  {(draftPromo.type === 'bogo' ||
                    draftPromo.type === 'buy_x_get_different_free' ||
                    draftPromo.type === 'group_buy_n_get_m_free') && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rt-in">
                        <label htmlFor="promo-buyqty-phone" className="rt-in__label">
                          BUY QTY
                        </label>
                        <input
                          id="promo-buyqty-phone"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={draftPromo.buyQty}
                          onChange={(e) => setDraftPromo({ ...draftPromo, buyQty: Number(e.target.value) })}
                          className="rt-in__control tabular-nums"
                        />
                      </div>
                      <div className="rt-in">
                        <label htmlFor="promo-freeqty-phone" className="rt-in__label">
                          FREE QTY
                        </label>
                        <input
                          id="promo-freeqty-phone"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={draftPromo.freeQty}
                          onChange={(e) =>
                            setDraftPromo({
                              ...draftPromo,
                              freeQty: Number(e.target.value),
                              freeProductQty: Number(e.target.value),
                            })
                          }
                          className="rt-in__control tabular-nums"
                        />
                      </div>
                    </div>
                  )}

                  {draftPromo.type === 'group_buy_n_get_m_free' && (
                    <div className="rt-in">
                      <label htmlFor="promo-rule-phone" className="rt-in__label">
                        FREE ITEM RULE
                      </label>
                      <div className="rt-in__select-wrap">
                        <select
                          id="promo-rule-phone"
                          value={draftPromo.freeItemRule || 'CHEAPEST_IN_GROUP'}
                          onChange={(e) => setDraftPromo({ ...draftPromo, freeItemRule: e.target.value as any })}
                          className="rt-in__control"
                        >
                          <option value="CHEAPEST_IN_GROUP">Cheapest in group</option>
                          <option value="SAME_AS_LAST_ADDED">Last added item</option>
                          <option value="SPECIFIC_PRODUCT">Specific reward product</option>
                          <option value="CUSTOMER_CHOICE_FROM_GROUP">Customer choice at checkout</option>
                        </select>
                        <ChevronDown size={15} className="rt-in__select-chev" aria-hidden="true" />
                      </div>
                    </div>
                  )}

                  {(draftPromo.type === 'buy_x_get_different_free' ||
                    (draftPromo.type === 'group_buy_n_get_m_free' && draftPromo.freeItemRule === 'SPECIFIC_PRODUCT')) && (
                    <div className="rt-in">
                      <label htmlFor="promo-freeprod-phone" className="rt-in__label">
                        FREE REWARD PRODUCT
                      </label>
                      <div className="rt-in__select-wrap">
                        <select
                          id="promo-freeprod-phone"
                          value={draftPromo.freeProductId || ''}
                          onChange={(e) =>
                            setDraftPromo({
                              ...draftPromo,
                              freeProductId: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          className="rt-in__control"
                        >
                          <option value="">Choose free product…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (₹{p.retail}/cs)
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={15} className="rt-in__select-chev" aria-hidden="true" />
                      </div>
                    </div>
                  )}

                  {draftPromo.type === 'bundle' && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rt-in">
                          <label htmlFor="promo-dist-phone" className="rt-in__label">
                            DISTINCT TYPES REQ.
                          </label>
                          <input
                            id="promo-dist-phone"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            value={draftPromo.requiredDistinctTypes || 2}
                            onChange={(e) =>
                              setDraftPromo({ ...draftPromo, requiredDistinctTypes: Number(e.target.value) })
                            }
                            className="rt-in__control tabular-nums"
                          />
                        </div>
                        <div className="rt-in">
                          <label htmlFor="promo-minqty-phone" className="rt-in__label">
                            MIN QTY PER TYPE
                          </label>
                          <input
                            id="promo-minqty-phone"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            value={draftPromo.minQtyPerType || 1}
                            onChange={(e) => setDraftPromo({ ...draftPromo, minQtyPerType: Number(e.target.value) })}
                            className="rt-in__control tabular-nums"
                          />
                        </div>
                      </div>
                      <div className="rt-in">
                        <label htmlFor="promo-bfree-phone" className="rt-in__label">
                          FREE QTY AWARDED
                        </label>
                        <input
                          id="promo-bfree-phone"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={draftPromo.freeProductQty || 1}
                          onChange={(e) =>
                            setDraftPromo({
                              ...draftPromo,
                              freeProductQty: Number(e.target.value),
                              freeQty: Number(e.target.value),
                            })
                          }
                          className="rt-in__control tabular-nums"
                        />
                      </div>
                    </div>
                  )}

                  {draftPromo.type === 'percent' && (
                    <div className="rt-in">
                      <label htmlFor="promo-pct-phone" className="rt-in__label">
                        PERCENT OFF (%)
                      </label>
                      <input
                        id="promo-pct-phone"
                        type="number"
                        inputMode="decimal"
                        min={1}
                        max={100}
                        value={draftPromo.percent}
                        onChange={(e) => setDraftPromo({ ...draftPromo, percent: Number(e.target.value) })}
                        className="rt-in__control tabular-nums"
                      />
                    </div>
                  )}

                  {draftPromo.type === 'flat' && (
                    <div className="rt-in">
                      <label htmlFor="promo-flat-phone" className="rt-in__label">
                        FLAT OFF PER CASE (₹)
                      </label>
                      <input
                        id="promo-flat-phone"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={draftPromo.flatPerCase}
                        onChange={(e) => setDraftPromo({ ...draftPromo, flatPerCase: Number(e.target.value) })}
                        className="rt-in__control tabular-nums"
                      />
                    </div>
                  )}
                </div>

                <footer className="rt-flow-phone__footer">
                  <button type="button" onClick={goNextFromStep1} className="rt-btn w-full">
                    Next: products
                  </button>
                </footer>
              </>
            )}

            {mobileStep === 2 && (
              <>
                <div className="rt-flow-phone__body space-y-3">
                  <div>
                    <div className="hh-set-section-lbl">APPLIES TO</div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { id: 'products', label: 'Products' },
                          { id: 'category', label: 'Category tag' },
                          { id: 'brand', label: 'Brand tag' },
                        ] as const
                      ).map((modeOpt) => (
                        <button
                          key={modeOpt.id}
                          type="button"
                          onClick={() => setMobileScopeMode(modeOpt.id)}
                          className={`hh-set-seg2__btn ${mobileScopeMode === modeOpt.id ? '' : ''}`}
                          aria-pressed={mobileScopeMode === modeOpt.id}
                          style={{
                            borderRadius: '999px',
                            minHeight: '38px',
                            padding: '0 16px',
                          }}
                        >
                          {modeOpt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {mobileScopeMode === 'products' && (
                    <>
                      <div className="rt-search-bar">
                        <Search size={17} style={{ color: 'var(--text-2)' }} aria-hidden="true" />
                        <input
                          enterKeyHint="search"
                          type="search"
                          value={mobileProdQuery}
                          onChange={(e) => setMobileProdQuery(e.target.value)}
                          placeholder="Search products"
                          aria-label="Search products"
                        />
                        {mobileProdQuery && (
                          <button
                            type="button"
                            onClick={() => setMobileProdQuery('')}
                            className="p-1 min-w-0 min-h-0 border-0 bg-transparent text-[var(--text-2)] cursor-pointer"
                            aria-label="Clear product search"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      {selectedProductsList.length > 0 && (
                        <div className="hh-set-list">
                          {selectedProductsList.map((p) => (
                            <div
                              key={`sel-${p.id}`}
                              className="hh-set-row"
                              style={{ cursor: 'default' }}
                            >
                              <PackIcon pack={p.pack} name={p.name} size="sm" />
                              <span className="flex-1 min-w-0 text-[14px] font-bold text-[var(--text)] break-words">
                                {p.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleProduct(p.id)}
                                className="min-w-0 min-h-[36px] px-2 border-0 bg-transparent text-[13px] font-bold cursor-pointer shrink-0"
                                style={{ color: 'var(--due)' }}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {unselectedProductsList.length > 0 && (
                        <div className="hh-set-list">
                          {unselectedProductsList.map((p) => (
                            <button
                              key={`unsel-${p.id}`}
                              type="button"
                              onClick={() => toggleProduct(p.id)}
                              className="hh-set-row"
                            >
                              <PackIcon pack={p.pack} name={p.name} size="sm" />
                              <span className="flex-1 min-w-0 text-[14px] font-medium text-[var(--text)] break-words">
                                {p.name}
                              </span>
                              <span className="text-[12.5px] font-bold shrink-0" style={{ color: 'var(--primary)' }}>
                                + Add
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="text-[12px] text-[var(--text-2)] px-1">
                        {draftPromo.type === 'buy_x_get_different_free'
                          ? 'Select at least one trigger product (Product A).'
                          : 'Leave empty to apply to all products.'}
                      </p>
                    </>
                  )}

                  {mobileScopeMode === 'category' && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!draftPromo.groupCategory}
                        onClick={() => applyCategoryTag('')}
                        className="hh-set-radio"
                      >
                        <span className="hh-set-radio__dot" aria-hidden="true" />
                        <span className="text-[13.5px] font-semibold text-[var(--text)]">All Categories</span>
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          role="radio"
                          aria-checked={draftPromo.groupCategory === cat}
                          onClick={() => applyCategoryTag(cat)}
                          className="hh-set-radio"
                        >
                          <span className="hh-set-radio__dot" aria-hidden="true" />
                          <span className="text-[13.5px] font-semibold text-[var(--text)]">{cat}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {mobileScopeMode === 'brand' && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!draftPromo.groupBrand}
                        onClick={() => applyBrandTag('')}
                        className="hh-set-radio"
                      >
                        <span className="hh-set-radio__dot" aria-hidden="true" />
                        <span className="text-[13.5px] font-semibold text-[var(--text)]">All Brands</span>
                      </button>
                      {brands.map((brand) => (
                        <button
                          key={brand}
                          type="button"
                          role="radio"
                          aria-checked={draftPromo.groupBrand === brand}
                          onClick={() => applyBrandTag(brand)}
                          className="hh-set-radio"
                        >
                          <span className="hh-set-radio__dot" aria-hidden="true" />
                          <span className="text-[13.5px] font-semibold text-[var(--text)]">{brand}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <footer className="rt-flow-phone__footer">
                  <button type="button" onClick={goNextFromStep2} className="rt-btn w-full">
                    Next: preview
                  </button>
                </footer>
              </>
            )}

            {mobileStep === 3 && (
              <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
                <div className="rt-flow-phone__body space-y-3">
                  <div className="rt-dashed-preview">
                    <div className="font-bold text-[14px] mb-1">Offer preview</div>
                    <div>{previewText}</div>
                  </div>

                  <div className="rt-card rt-card--divided">
                    <div className="rt-ln">
                      <span className="text-[var(--text-2)] font-medium">
                        {draftPromo.type === 'bogo' || draftPromo.type === 'bundle' ? 'Free qty awarded' : 'Offer rule'}
                      </span>
                      <span className="font-bold text-[var(--text)]">{ruleSummaryVal}</span>
                    </div>
                    <div className="rt-ln">
                      <span className="text-[var(--text-2)] font-medium">Applies to</span>
                      <span className="font-bold text-[var(--text)] text-right">{appliesSummaryVal}</span>
                    </div>
                  </div>

                  <div className="rt-card flex items-center justify-between gap-3">
                    <span className="text-[14px] font-bold text-[var(--text)]">Live now</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draftPromo.isActive !== false}
                      aria-label="Live now"
                      onClick={() =>
                        setDraftPromo((prev) => ({
                          ...prev,
                          isActive: prev.isActive === false,
                        }))
                      }
                      className="hh-switch"
                    >
                      <span className="hh-switch__thumb" />
                    </button>
                  </div>

                  {editingPromoId && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = promotions.find((x) => x.id === editingPromoId);
                        if (target) setPromoToDelete(target);
                      }}
                      className="hh-set-btn-danger-outline w-full"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Delete offer
                    </button>
                  )}
                </div>

                <footer className="rt-flow-phone__footer">
                  <button type="submit" className="rt-btn w-full">
                    Save offer
                  </button>
                </footer>
              </form>
            )}
          </div>
        )}

        {/* Mobile delete confirmation sheet */}
        {promoToDelete && (
          <div className="rt-bsheet-scrim" role="dialog" aria-modal="true" aria-labelledby="del-promo-phone-title">
            <div className="rt-bsheet rt-bsheet--white" onClick={(e) => e.stopPropagation()}>
              <div className="hh-grab" />
              <div>
                <h3 id="del-promo-phone-title" className="text-[17px] font-extrabold" style={{ color: 'var(--due)' }}>
                  Delete {promoToDelete.name}?
                </h3>
                <p className="text-[13px] text-[var(--text-2)] mt-1 leading-relaxed">
                  It will be immediately removed from trade billing and synced across cloud.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setPromoToDelete(null)}
                  className="rt-btn-outline rt-btn-outline--primary"
                >
                  Keep
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deletePromotion(promoToDelete.id);
                    setPromoToDelete(null);
                    cancelEdit();
                  }}
                  className="rt-btn rt-btn--due"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="view-promotions" className="hh-view mw-workspace min-w-0 max-w-full space-y-4 pb-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Promotions</h1>
        </div>
      </div>

      {statusMsg && (
        <div
          id="promotions-sync-alert"
          className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 px-3.5 py-2.5 text-sm font-semibold flex items-center gap-2"
        >
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Two-column workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-start">
        {/* LEFT: summary + create */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3 min-w-0">
          <div data-card-tone="profit" className="rounded-2xl border shadow-xs p-4 sm:p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-purple-900/70 mb-3">
              Promotion summary
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-1">
              <div className="text-center rounded-xl bg-white/80 border border-black/5 py-3 px-2">
                <div className="text-3xl font-extrabold text-slate-900 tabular-nums">{promotions.length}</div>
                <div className="text-xs font-semibold text-slate-500 mt-1">Total offers</div>
              </div>
              <div className="text-center rounded-xl bg-white/80 border border-black/5 py-3 px-2">
                <div className="text-3xl font-extrabold text-emerald-700 tabular-nums">
                  {promotions.filter((p) => p.isActive !== false).length}
                </div>
                <div className="text-xs font-semibold text-slate-500 mt-1">Live now</div>
              </div>
            </div>
            <div className="border-t border-black/5 mt-4 pt-4">
              {!showAddPromo ? (
                <button
                  type="button"
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
                      isActive: true,
                      bundleBuyType: 'any',
                      requiredDistinctTypes: 2,
                      minQtyPerType: 1,
                      freeRewardChoice: 'all_eligible',
                      freeProductId: undefined,
                      freeProductQty: 1,
                      productGroup: [],
                      groupCategory: '',
                      groupBrand: '',
                      freeItemRule: 'CHEAPEST_IN_GROUP',
                      freeItem: 'CHEAPEST_IN_GROUP',
                      customerChoiceProductId: undefined,
                    });
                    setShowAddPromo(true);
                  }}
                  className="w-full py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[#0a342b] text-white text-sm font-semibold cursor-pointer transition-colors"
                >
                  Create an offer
                </button>
              ) : (
                <form id="form-promo" onSubmit={handleSave} className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {editingPromoId ? 'Edit offer' : 'Create an offer'}
                    </h3>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg border border-black/8 cursor-pointer"
                    >
                      <X size={13} /> Close
                    </button>
                  </div>

                  <div>
                    <label htmlFor="promo-name" className="block text-xs font-semibold text-slate-600 mb-1">
                      Offer name
                    </label>
                    <input
                      id="promo-name"
                      required
                      value={draftPromo.name}
                      onChange={(e) => setDraftPromo({ ...draftPromo, name: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
                      placeholder="e.g. Diwali Deal"
                    />
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-slate-600 mb-1.5">Promotion Type</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'bogo' as const, label: 'Buy X Get X' },
                          { id: 'buy_x_get_different_free' as const, label: 'Buy A Get B Free' },
                          { id: 'group_buy_n_get_m_free' as const, label: 'Group Buy N Get M' },
                          { id: 'bundle' as const, label: 'Combo Bundle' },
                          { id: 'percent' as const, label: 'Percent off' },
                          { id: 'flat' as const, label: 'Flat off' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setDraftPromo((prev) => ({
                              ...prev,
                              type: t.id,
                              freeItemRule: prev.freeItemRule || 'CHEAPEST_IN_GROUP',
                            }));
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors text-center ${
                            draftPromo.type === t.id
                              ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Type 1: Percent off */}
                  {draftPromo.type === 'percent' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Percent off (%)</label>
                      <input
                        type="number" inputMode="decimal"
                        min={1}
                        max={100}
                        value={draftPromo.percent}
                        onChange={(e) => setDraftPromo({ ...draftPromo, percent: Number(e.target.value) })}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                      />
                    </div>
                  )}

                  {/* Type 2: Flat off */}
                  {draftPromo.type === 'flat' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Flat off per case (₹)</label>
                      <input
                        type="number" inputMode="numeric"
                        min={0}
                        value={draftPromo.flatPerCase}
                        onChange={(e) => setDraftPromo({ ...draftPromo, flatPerCase: Number(e.target.value) })}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                      />
                    </div>
                  )}

                  {/* Type 3: Standard BOGO (Buy X get X free) */}
                  {draftPromo.type === 'bogo' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Buy qty</label>
                        <input
                          type="number" inputMode="numeric"
                          min={1}
                          value={draftPromo.buyQty}
                          onChange={(e) => setDraftPromo({ ...draftPromo, buyQty: Number(e.target.value) })}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Free qty</label>
                        <input
                          type="number" inputMode="numeric"
                          min={1}
                          value={draftPromo.freeQty}
                          onChange={(e) => setDraftPromo({ ...draftPromo, freeQty: Number(e.target.value) })}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                        />
                      </div>
                    </div>
                  )}

                  {/* Type B: BUY_X_GET_DIFFERENT_FREE (Buy Product A, Get Product B Free) */}
                  {draftPromo.type === 'buy_x_get_different_free' && (
                    <div className="space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">Buy A → Get B Free Rule</span>
                        <span className="text-[11px] text-slate-500 font-medium">Distinct reward SKU</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Buy Qty (Item A)
                          </label>
                          <input
                            type="number" inputMode="numeric"
                            min={1}
                            value={draftPromo.buyQty}
                            onChange={(e) => setDraftPromo({ ...draftPromo, buyQty: Number(e.target.value) })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Free Qty (Item B)
                          </label>
                          <input
                            type="number" inputMode="numeric"
                            min={1}
                            value={draftPromo.freeQty}
                            onChange={(e) =>
                              setDraftPromo({
                                ...draftPromo,
                                freeQty: Number(e.target.value),
                                freeProductQty: Number(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Free Reward Product (Product B) *
                        </label>
                        <select
                          required
                          value={draftPromo.freeProductId || ''}
                          onChange={(e) =>
                            setDraftPromo({
                              ...draftPromo,
                              freeProductId: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                        >
                          <option value="">-- Choose Free Product --</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (₹{p.retail}/cs)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Trigger Product(s) (Product A) *
                        </label>
                        <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 space-y-1">
                          {products.map((p) => {
                            const on = (draftPromo.productIds || []).map(Number).includes(Number(p.id));
                            return (
                              <label
                                key={p.id}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleProduct(p.id)}
                                  className="rounded border-slate-300"
                                />
                                <span className="text-slate-700 font-medium break-words leading-snug">{p.name}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {draftPromo.productIds.length === 0
                            ? 'Select at least one trigger product'
                            : `${draftPromo.productIds.length} trigger product(s) selected`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Type C: GROUP_BUY_N_GET_M_FREE (Buy any N from group, get M free) */}
                  {draftPromo.type === 'group_buy_n_get_m_free' && (
                    <div className="space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">Group Scheme Rules</span>
                        <span className="text-[11px] text-teal-700 font-medium">Aggregated cart count</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Buy N (Across Group)
                          </label>
                          <input
                            type="number" inputMode="numeric"
                            min={1}
                            value={draftPromo.buyQty}
                            onChange={(e) => setDraftPromo({ ...draftPromo, buyQty: Number(e.target.value) })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                            placeholder="e.g. 2"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Get M Free
                          </label>
                          <input
                            type="number" inputMode="numeric"
                            min={1}
                            value={draftPromo.freeQty}
                            onChange={(e) =>
                              setDraftPromo({
                                ...draftPromo,
                                freeQty: Number(e.target.value),
                                freeProductQty: Number(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                            placeholder="e.g. 1"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Free Item Rule (Configurable)
                        </label>
                        <select
                          value={draftPromo.freeItemRule || 'CHEAPEST_IN_GROUP'}
                          onChange={(e) =>
                            setDraftPromo({
                              ...draftPromo,
                              freeItemRule: e.target.value as any,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                        >
                          <option value="CHEAPEST_IN_GROUP">
                            CHEAPEST_IN_GROUP (Default - Protects profit margin)
                          </option>
                          <option value="SAME_AS_LAST_ADDED">
                            SAME_AS_LAST_ADDED (Last group product added to cart)
                          </option>
                          <option value="SPECIFIC_PRODUCT">
                            SPECIFIC_PRODUCT (Designate specific product)
                          </option>
                          <option value="CUSTOMER_CHOICE_FROM_GROUP">
                            CUSTOMER_CHOICE_FROM_GROUP (Cashier/customer choice at checkout)
                          </option>
                        </select>
                      </div>

                      {draftPromo.freeItemRule === 'SPECIFIC_PRODUCT' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Designated Free Product *
                          </label>
                          <select
                            required
                            value={draftPromo.freeProductId || ''}
                            onChange={(e) =>
                              setDraftPromo({
                                ...draftPromo,
                                freeProductId: e.target.value ? Number(e.target.value) : undefined,
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                          >
                            <option value="">-- Choose Free Product --</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Group Category Tag Shortcut */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Category Tag</label>
                          <select
                            value={draftPromo.groupCategory || ''}
                            onChange={(e) => setDraftPromo({ ...draftPromo, groupCategory: e.target.value })}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                          >
                            <option value="">All Categories</option>
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Brand Tag</label>
                          <select
                            value={draftPromo.groupBrand || ''}
                            onChange={(e) => setDraftPromo({ ...draftPromo, groupBrand: e.target.value })}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                          >
                            <option value="">All Brands</option>
                            {brands.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Product Group Members */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-600">
                            Select Group Products (or leave empty for all in tag)
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const allIds = products.map((p) => p.id);
                              setDraftPromo((prev) => ({
                                ...prev,
                                productIds: prev.productIds?.length === allIds.length ? [] : allIds,
                                productGroup: prev.productGroup?.length === allIds.length ? [] : allIds,
                              }));
                            }}
                            className="text-[11px] font-semibold text-[var(--primary)] hover:underline"
                          >
                            {draftPromo.productIds.length === products.length ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>
                        <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 space-y-1">
                          {products.map((p) => {
                            const on = (draftPromo.productIds || []).map(Number).includes(Number(p.id));
                            return (
                              <label
                                key={p.id}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleProduct(p.id)}
                                  className="rounded border-slate-300"
                                />
                                <span className="text-slate-700 font-medium break-words leading-snug">{p.name}</span>
                                <span className="text-slate-400 text-[10px] ml-auto">₹{p.retail}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {draftPromo.productIds.length} product(s) explicitly included in this group
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Type: Combo / Bundle */}
                  {draftPromo.type === 'bundle' && (
                    <div className="space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Distinct Types Req.
                          </label>
                          <input
                            type="number" inputMode="decimal"
                            min={1}
                            value={draftPromo.requiredDistinctTypes || 2}
                            onChange={(e) =>
                              setDraftPromo({ ...draftPromo, requiredDistinctTypes: Number(e.target.value) })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Min Qty Per Type
                          </label>
                          <input
                            type="number" inputMode="numeric"
                            min={1}
                            value={draftPromo.minQtyPerType || 1}
                            onChange={(e) =>
                              setDraftPromo({ ...draftPromo, minQtyPerType: Number(e.target.value) })
                            }
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Free Qty Awarded</label>
                        <input
                          type="number" inputMode="numeric"
                          min={1}
                          value={draftPromo.freeProductQty || 1}
                          onChange={(e) =>
                            setDraftPromo({
                              ...draftPromo,
                              freeProductQty: Number(e.target.value),
                              freeQty: Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Offer preview</label>
                    <input
                      readOnly
                      value={schemeLabel({ ...draftPromo, id: 0 } as Promotion, products) || 'Configure offer above'}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700"
                    />
                  </div>

                  {draftPromo.type !== 'buy_x_get_different_free' &&
                    draftPromo.type !== 'group_buy_n_get_m_free' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                          Apply to products (optional)
                        </label>
                        <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1">
                          {products.length === 0 ? (
                            <p className="text-xs text-slate-400 px-1 py-2">No products added yet</p>
                          ) : (
                            products.map((p) => {
                              const on = (draftPromo.productIds || []).map(Number).includes(Number(p.id));
                              return (
                                <label
                                  key={p.id}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs"
                                >
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => toggleProduct(p.id)}
                                    className="rounded border-slate-300"
                                  />
                                  <span className="text-slate-700 font-medium break-words leading-snug">{p.name}</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Leave empty to apply to all products</p>
                      </div>
                    )}

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[#0a342b] text-white text-sm font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={16} />
                    {editingPromoId ? 'Save changes' : 'Publish offer'}
                  </button>
                </form>
              )}
            </div>
          </div>

          <button
            type="button"
            id="btn-sync-promotions-db"
            onClick={handleSyncDatabase}
            disabled={isSyncingSchemes}
            className="w-full text-xs font-semibold text-slate-500 hover:text-slate-800 py-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={`inline mr-1 ${isSyncingSchemes ? 'animate-spin' : ''}`} />
            {isSyncingSchemes ? 'Syncing…' : 'Sync schemes to cloud'}
          </button>
        </div>

        {/* RIGHT: offers list */}
        <div className="lg:col-span-7 xl:col-span-8 min-w-0">
          <div data-card-tone="neutral" className="rounded-2xl border shadow-xs overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-black/5 flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Offers</h2>
              <span className="text-[11px] text-slate-500 font-semibold tabular-nums">
                {filteredPromotions.length} shown
              </span>
            </div>

            {/* Lightweight search */}
            <div className="px-4 sm:px-5 py-2.5 border-b border-black/5">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input enterKeyHint="search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search offers…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                />
              </div>
            </div>

            <div className="p-3 sm:p-4 space-y-2.5">
              {filteredPromotions.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-500">
                  {promotions.length === 0
                    ? 'No offers yet. Create your first offer on the left.'
                    : 'No offers match your search.'}
                </div>
              ) : (
                filteredPromotions.map((p) => {
                  const live = p.isActive !== false;
                  const detail = schemeLabel(p, products);
                  return (
                    <div
                      key={p.id}
                      data-card-tone={live ? 'received' : 'neutral'}
                      className="rounded-2xl border shadow-xs px-3.5 sm:px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 transition-shadow"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={`hh-icon-badge shrink-0 ${
                            live ? 'hh-icon-badge--green' : 'hh-icon-badge--slate'
                          }`}
                        >
                          <Tag size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 break-words leading-snug">{p.name}</div>
                          <div className="text-xs text-slate-600 mt-0.5 leading-snug">{detail}</div>
                          {p.endDate && (
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Valid until {p.endDate}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 shrink-0 self-end sm:self-center">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wide ${
                            live ? 'text-teal-600' : 'text-slate-400'
                          }`}
                        >
                          {live ? 'Live' : 'Paused'}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleSchemeActive(p)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                            live
                              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              : 'bg-[var(--primary)] border-[var(--primary)] text-white hover:brightness-110'
                          }`}
                        >
                          {live ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Edit"
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPromoToDelete(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete"
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!promoToDelete}
        onClose={() => setPromoToDelete(null)}
        onConfirm={() => {
          if (promoToDelete) {
            deletePromotion(promoToDelete.id);
            setPromoToDelete(null);
          }
        }}
        title="Delete Trade Promotion Scheme"
        subtitle={promoToDelete?.name}
        message={`Are you sure you want to delete scheme "${promoToDelete?.name}"? It will be immediately removed from trade billing and synced across Supabase.`}
        confirmButtonLabel="Delete Scheme"
        variant="danger"
      />
    </div>
  );

};
