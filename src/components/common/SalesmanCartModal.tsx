import { useLanguage } from '../../i18n/LanguageContext';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SizeChip } from "../common/SizeChip";
import { sizeTheme, packTheme } from "../../utils/sizeColor";
import {
  X,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Percent,
  MessageCircle,
  CheckCircle2,
  ArrowLeft,
  Phone,
  Receipt,
  Mic,
  MicOff,
  Edit2,
  Check,
  Tag,
  AlertCircle,
  Clock,
  Search,
  Store,
  Zap,
  ChevronDown,
  MoreVertical,
} from 'lucide-react';
import { BillItem, PriceType, Product, Trip, ExistingCustomer } from '../../types';
import { money } from '../../utils/billing';
import { speakAssistiveText } from '../../utils/speechRecognition';
import { getProductOdiaName, getCustomerOdiaName } from '../../utils/displayName';

interface SalesmanCartModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: {
    items: BillItem[];
  };
  isLowVision: boolean;
  palette: any;
  scale: number;
  activeTrip: Trip | null;
  products: Product[];
  selectedRetailer: string;
  setSelectedRetailer: (name: string) => void;
  retailerPhone: string;
  setRetailerPhone: (phone: string) => void;
  customers?: ExistingCustomer[];
  amountPaidDraft: string;
  setAmountPaidDraft: (val: string) => void;
  invoiceDiscountDraft: string;
  settledTotalDraft: string;
  handleDiscountChange: (val: string) => void;
  handleSettledTotalChange: (val: string) => void;
  applyQuickDiscount: (amt: number, isPercent?: boolean) => void;
  autoSendWhatsApp: boolean;
  setAutoSendWhatsApp: (val: boolean) => void;
  lastFinalizedWhatsApp: { id: number; phone: string; url: string } | null;
  onUpdateQty: (key: string | number, qty: number) => void;
  onUpdateRate: (key: string | number, rate: number) => void;
  onUpdateDiscount: (key: string | number, discount: number) => void;
  onTogglePriceType: (key: string | number, priceType: PriceType) => void;
  onRemoveItem: (key: string | number) => void;
  onFinalize: () => void;
  onCancelSale?: () => void;
  onOpenCustomerDirectory: () => void;
  onVoiceSearchCustomer: () => void;
  isVoiceSearching: boolean;
  getVehicleStock: (trip: Trip | null, productId: number) => { loaded: number; sold: number; available: number };
  onAddProduct?: (productId: number, delta: number) => void;
  priceType?: PriceType;
  isPriceLocked?: boolean;
}

export const SalesmanCartModal: React.FC<SalesmanCartModalProps> = ({
  isOpen,
  onClose,
  cart,
  isLowVision,
  palette,
  scale,
  activeTrip,
  products,
  selectedRetailer,
  setSelectedRetailer,
  retailerPhone,
  setRetailerPhone,
  customers = [],
  amountPaidDraft,
  setAmountPaidDraft,
  invoiceDiscountDraft,
  settledTotalDraft,
  handleDiscountChange,
  handleSettledTotalChange,
  applyQuickDiscount,
  autoSendWhatsApp,
  setAutoSendWhatsApp,
  lastFinalizedWhatsApp,
  onUpdateQty,
  onUpdateRate,
  onUpdateDiscount,
  onTogglePriceType,
  onRemoveItem,
  onFinalize,
  onCancelSale,
  onOpenCustomerDirectory,
  onVoiceSearchCustomer,
  isVoiceSearching,
  getVehicleStock,
  onAddProduct,
  priceType,
  isPriceLocked = false,
}) => {
  const { isOdia } = useLanguage();

  // Beverage browsing mode state (allows adding beverages without leaving modal)
  const [isBrowsingBeverages, setIsBrowsingBeverages] = useState<boolean>(false);
  const [beverageSearchQuery, setBeverageSearchQuery] = useState<string>('');
  const [selectedBeverageCategory, setSelectedBeverageCategory] = useState<string>('ALL');
  const [selectedBeveragePack, setSelectedBeveragePack] = useState<'ALL' | 'CAN' | 'PET' | 'GLASS' | 'TETRA'>('ALL');
  const [activePriceType, setActivePriceType] = useState<PriceType>(priceType || 'Wholesale');
  // Compact-cart UI state: bill discount panel, payment mode, overflow menu
  const [showDiscount, setShowDiscount] = useState<boolean>(false);
  const [payMode, setPayMode] = useState<'credit' | 'partial' | 'full'>('credit');
  const [showMenu, setShowMenu] = useState<boolean>(false);

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const clean = p.name.trim().toLowerCase();
      counts.set(clean, (counts.get(clean) || 0) + 1);
    }
    return counts;
  }, [products]);

  // Keep price type in sync with parent if provided
  useEffect(() => {
    if (priceType) {
      setActivePriceType(priceType);
    }
  }, [priceType]);

  // Reset browsing mode when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setIsBrowsingBeverages(false);
      setBeverageSearchQuery('');
      setShowMenu(false);
      setShowDiscount(false);
      setPayMode('credit');
      setEditingItemKey(null);
    }
  }, [isOpen]);

  // Local editing states per item
  const [editingItemKey, setEditingItemKey] = useState<string | number | null>(null);
  const [editingRateDraft, setEditingRateDraft] = useState<string>('');
  const [editingDiscountDraft, setEditingDiscountDraft] = useState<string>('');

  // Quick Spot Cash handler
  const handlePickWalkInCash = () => {
    setSelectedRetailer('Spot Cash / Walk-in Customer');
    setRetailerPhone('');
    if (isLowVision) {
      speakAssistiveText('Selected Spot Cash / Walk-in Customer');
    }
  };

  const rawCartTotal = cart.items.reduce((sum, item) => sum + item.amount, 0);
  const appliedDiscount = Number(invoiceDiscountDraft) || 0;
  const finalCartTotal = Math.max(0, rawCartTotal - appliedDiscount);
  const totalCases = cart.items.reduce((sum, item) => sum + item.qty, 0);

  // Payment states & calculations (Default is Credit always means 0)
  const numericPaid = amountPaidDraft !== '' ? Math.max(0, Number(amountPaidDraft) || 0) : 0;
  const isCredit = numericPaid === 0;
  const isFull = finalCartTotal > 0 && numericPaid === finalCartTotal;
  const isPartial = numericPaid > 0 && numericPaid < finalCartTotal;
  const balanceDue = Math.max(0, finalCartTotal - numericPaid);

  // Ensure default is credit ('0') if empty
  useEffect(() => {
    if (isOpen && (amountPaidDraft === '' || amountPaidDraft === undefined)) {
      setAmountPaidDraft('0');
    }
  }, [isOpen, amountPaidDraft, setAmountPaidDraft]);

  // Beverage categories available in product list
  const beverageCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of products) {
      if (p.category) cats.add(p.category);
    }
    return ['ALL', ...Array.from(cats)];
  }, [products]);

  // Beverages filtered for the browsing list
  const filteredBeverages = useMemo(() => {
    const q = beverageSearchQuery.trim().toLowerCase();
    return products
      .filter((p) => {
        if (selectedBeverageCategory !== 'ALL' && p.category !== selectedBeverageCategory) {
          return false;
        }

        if (selectedBeveragePack !== 'ALL') {
          const pTheme = packTheme(p.pack, p.name);
          const pLabel = pTheme.label.toLowerCase();
          if (selectedBeveragePack === 'CAN' && !pLabel.includes('can') && !pLabel.includes('tin')) return false;
          if (selectedBeveragePack === 'PET' && !pLabel.includes('pet') && !pLabel.includes('bottle')) return false;
          if (selectedBeveragePack === 'GLASS' && !pLabel.includes('glass') && !pLabel.includes('rgb')) return false;
          if (selectedBeveragePack === 'TETRA' && !pLabel.includes('tetra') && !pLabel.includes('pouch')) return false;
        }

        if (q) {
          const sTheme = sizeTheme(p.volume, p.name);
          const pTheme = packTheme(p.pack, p.name);
          const matchName = p.name.toLowerCase().includes(q);
          const matchCat = (p.category || '').toLowerCase().includes(q);
          const matchVol = String(p.volume || '').includes(q) || sTheme.label.toLowerCase().includes(q);
          const matchPack = (p.pack || '').toLowerCase().includes(q) || pTheme.label.toLowerCase().includes(q);
          const matchUnits = p.unitsPerCrate ? `${p.unitsPerCrate}`.includes(q) : false;
          return matchName || matchCat || matchVol || matchPack || matchUnits;
        }
        return true;
      })
      .sort((a, b) => {
        const stockA = getVehicleStock(activeTrip, a.id).available;
        const stockB = getVehicleStock(activeTrip, b.id).available;
        // Prioritize items with stock on vehicle
        if (stockA > 0 && stockB <= 0) return -1;
        if (stockA <= 0 && stockB > 0) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [products, beverageSearchQuery, selectedBeverageCategory, selectedBeveragePack, activeTrip, getVehicleStock]);

  // Handle adding/subtracting beverage from the in-cart beverage list
  const handleAddBeverageDelta = (prod: Product, delta: number) => {
    if (onAddProduct) {
      onAddProduct(prod.id, delta);
      if (isLowVision) {
        speakAssistiveText(delta > 0 ? `Added 1 case of ${prod.name}` : `Removed 1 case of ${prod.name}`);
      }
    } else {
      const existing = cart.items.find((it) => it.productId === prod.id);
      if (existing) {
        const newQty = existing.qty + delta;
        if (newQty <= 0) {
          onRemoveItem(existing.key);
        } else {
          onUpdateQty(existing.key, newQty);
        }
      }
    }
  };

  const startEditingItem = (item: BillItem) => {
    setEditingItemKey(item.key);
    setEditingRateDraft(String(item.rate));
    setEditingDiscountDraft(item.discount ? String(item.discount) : '');
    if (isLowVision) {
      speakAssistiveText(`Editing ${item.productName}. Current rate is rupees ${item.rate}`);
    }
  };

  const saveEditingItem = (key: string | number) => {
    const rateVal = Number(editingRateDraft);
    if (!isPriceLocked && !isNaN(rateVal) && rateVal >= 0) {
      onUpdateRate(key, rateVal);
    }
    const discVal = Number(editingDiscountDraft) || 0;
    onUpdateDiscount(key, discVal);
    setEditingItemKey(null);
    if (isLowVision) {
      speakAssistiveText(`Saved changes for item. Rate is now rupees ${rateVal}`);
    }
  };

  if (!isOpen) return null;

  const lv = isLowVision;
  const mode: 'credit' | 'partial' | 'full' = payMode === 'partial' ? 'partial' : isFull ? 'full' : isCredit ? 'credit' : 'partial';

  return (
    <div
      id="salesman-cart-modal-backdrop"
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs sm:overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Invoice Draft & Cart"
    >
      <div
        id="salesman-cart-modal-container"
        className={`w-full sm:max-w-3xl sm:rounded-xl shadow-2xl flex flex-col sm:my-auto h-[100dvh] sm:h-auto sm:max-h-[92dvh] overflow-hidden sm:border-3 ${
          lv ? 'bg-black text-yellow-300 border-yellow-400' : 'bg-slate-100 text-slate-900 border-slate-700'
        }`}
        style={!lv ? { borderColor: palette.navy } : {}}
      >
        {/* Header: one line — back / title, always-visible total, menu, close */}
        <div
          className={`px-3 sm:px-4 pb-3 flex items-center justify-between gap-2 shrink-0 ${
            lv ? 'bg-yellow-400 text-black' : 'bg-[var(--primary)] text-white'
          }`}
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              id={isBrowsingBeverages ? 'btn-back-to-cart-header' : 'btn-close-cart-modal'}
              onClick={isBrowsingBeverages ? () => { setIsBrowsingBeverages(false); if (lv) speakAssistiveText('Returned to invoice cart view.'); } : onClose}
              className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center cursor-pointer ${lv ? 'bg-black text-yellow-300' : 'hover:bg-white/10 text-white'}`}
              aria-label={isBrowsingBeverages ? 'Back to cart' : 'Close cart'}
            >
              <ArrowLeft size={22} />
            </button>
            <div className="min-w-0">
              <h2 className="text-[17px] font-extrabold leading-tight truncate">
                {isBrowsingBeverages
                  ? isOdia ? 'ପାନୀୟ ଯୋଡନ୍ତୁ (Add beverages)' : 'Add beverages'
                  : isOdia ? 'କାର୍ଟ (Cart)' : 'Cart'}
              </h2>
              <p className={`text-[11.5px] font-semibold truncate ${lv ? 'text-black' : 'text-emerald-200'}`}>
                {cart.items.length} {isOdia ? 'ଆଇଟମ୍' : (cart.items.length === 1 ? 'item' : 'items')} · {totalCases} {isOdia ? 'କେସ୍' : 'cases'} · {activeTrip?.vehicle || (isOdia ? 'ଭ୍ୟାନ୍ ଷ୍ଟକ୍' : 'Van Stock')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 relative">
            <span
              className={`text-[17px] font-black px-3 py-1.5 rounded-xl ${lv ? 'bg-black text-yellow-300' : 'bg-white text-[var(--primary)]'}`}
              aria-live="polite"
            >
              ₹{money(finalCartTotal)}
            </span>
            {!isBrowsingBeverages && onCancelSale && (
              <>
                <button
                  type="button"
                  onClick={() => setShowMenu((v) => !v)}
                  className={`w-9 h-10 rounded-lg flex items-center justify-center cursor-pointer ${lv ? 'bg-black text-yellow-300' : 'hover:bg-white/10 text-white'}`}
                  aria-label="More actions"
                  aria-expanded={showMenu}
                >
                  <MoreVertical size={20} />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl bg-white text-slate-900 shadow-xl border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      id="btn-modal-cancel-sale"
                      onClick={() => {
                        setShowMenu(false);
                        onCancelSale();
                        onClose();
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-extrabold text-rose-700 hover:bg-rose-50 cursor-pointer flex items-center gap-2"
                    >
                      <Trash2 size={16} /> Cancel sale
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Modal Body: Either Beverage Catalog List OR Cart Review */}
        {isBrowsingBeverages ? (
          <div className="p-3 sm:p-5 space-y-4 overflow-y-auto flex-1">
            {/* Top controls: Search, Category pills, Price Tier selector */}
            <div
              className={`p-3.5 rounded-xl border-2 space-y-3 ${
                isLowVision ? 'bg-gray-900 border-yellow-400 text-yellow-300' : 'bg-white border-slate-300 shadow-sm'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h3 className="font-black text-base sm:text-lg flex items-center gap-2">
                    <span>Van Beverage List</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-black ${
                        isLowVision ? 'bg-yellow-400 text-black' : 'bg-blue-100 text-sky-700 border border-blue-300'
                      }`}
                    >
                      {filteredBeverages.length} Items
                    </span>
                  </h3>
                  <p className="text-xs opacity-75 font-semibold mt-0.5">
                    1-Tap to add cases directly from {activeTrip?.vehicle || 'Van Stock'} into bill
                  </p>
                </div>

                {/* Price Tier Switcher */}
                <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 p-1 rounded-lg border border-slate-300">
                  <span className="text-xs font-black text-slate-700 px-1">Rate Tier:</span>
                  {(['Wholesale', 'Retail'] as PriceType[]).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      id={`beverage-tier-${tier.toLowerCase()}`}
                      onClick={() => {
                        setActivePriceType(tier);
                        if (isLowVision) speakAssistiveText(`Switched price tier to ${tier}`);
                      }}
                      className={`px-2.5 py-1 text-xs font-black rounded-md cursor-pointer transition-all ${
                        activePriceType === tier
                          ? isLowVision
                            ? 'bg-yellow-400 text-black'
                            : 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                <input
                  type="text"
                  id="input-beverage-modal-search"
                  value={beverageSearchQuery}
                  onChange={(e) => setBeverageSearchQuery(e.target.value)}
                  placeholder="Search beverage name, size, or category..."
                  className={`w-full pl-9 pr-8 py-2 text-sm font-bold rounded-lg border-2 focus:outline-none transition-all ${
                    isLowVision
                      ? 'bg-black text-yellow-300 border-yellow-400 focus:ring-2 focus:ring-yellow-400'
                      : 'bg-white text-slate-900 border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                  }`}
                  style={{ minHeight: '42px' }}
                />
                {beverageSearchQuery && (
                  <button aria-label="Close"
                    type="button"
                    onClick={() => setBeverageSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full opacity-60 hover:opacity-100 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Packaging Container Type Pills: All, Can (Blue), PET (Red), Glass, Tetra */}
              <div className="flex items-center gap-1.5 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
                <span className="text-[11px] font-black text-slate-500 uppercase px-1.5 shrink-0">Pack:</span>
                <button
                  type="button"
                  onClick={() => setSelectedBeveragePack('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer whitespace-nowrap transition-colors ${
                    selectedBeveragePack === 'ALL'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All Packaging
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBeveragePack('CAN')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer whitespace-nowrap transition-colors ${
                    selectedBeveragePack === 'CAN'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-blue-50 text-blue-700 border border-blue-300 hover:bg-blue-100'
                  }`}
                >
                  🥫 Can (Blue)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBeveragePack('PET')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer whitespace-nowrap transition-colors ${
                    selectedBeveragePack === 'PET'
                      ? 'bg-red-600 text-white shadow-2xs'
                      : 'bg-red-50 text-red-700 border border-red-300 hover:bg-red-100'
                  }`}
                >
                  🍾 PET (Red)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBeveragePack('GLASS')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer whitespace-nowrap transition-colors ${
                    selectedBeveragePack === 'GLASS'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                  }`}
                >
                  🍶 Glass RGB
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBeveragePack('TETRA')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer whitespace-nowrap transition-colors ${
                    selectedBeveragePack === 'TETRA'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  🧃 Tetra
                </button>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm pb-1">
                {beverageCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    id={`bev-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => setSelectedBeverageCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black border cursor-pointer whitespace-nowrap transition-colors ${
                      selectedBeverageCategory === cat
                        ? isLowVision
                          ? 'bg-yellow-400 text-black border-yellow-400 font-black'
                          : 'bg-sky-600 text-white border-blue-950 shadow-sm'
                        : isLowVision
                        ? 'bg-black text-yellow-300 border-yellow-400/50 hover:bg-gray-800'
                        : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Beverage Grid Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredBeverages.map((prod) => {
                const vehicleStock = getVehicleStock(activeTrip, prod.id);
                const existingItem = cart.items.find((it) => it.productId === prod.id);
                const currentQty = existingItem ? existingItem.qty : 0;
                const currentRate = existingItem
                  ? existingItem.rate
                  : activePriceType === 'Retail'
                  ? prod.retail
                  : prod.wholesale;
                const isOutOfVanStock = vehicleStock.available <= 0 && currentQty === 0;

                return (
                  <div
                    key={prod.id}
                    id={`beverage-select-card-${prod.id}`}
                    style={{ borderLeftWidth: 6, borderLeftColor: sizeTheme(prod.volume, prod.name).hex }}
                    className={`p-3 rounded-xl border-2 flex flex-col justify-between gap-2.5 transition-all ${
                      currentQty > 0
                        ? isLowVision
                          ? 'bg-zinc-900 border-yellow-400 text-yellow-300 shadow-md ring-2 ring-yellow-400/30'
                          : 'bg-sky-50/70 border-blue-500 text-slate-900 shadow-sm'
                        : isLowVision
                        ? 'bg-black border-gray-800 text-yellow-300'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-black text-sm sm:text-base leading-snug">
                              <div>{prod.name}</div>
                              {isOdia && (prod.nameOr || getProductOdiaName(prod.id, products)) && (
                                <div className="text-xs font-bold text-sky-800 font-odia mt-0.5">
                                  {prod.nameOr || getProductOdiaName(prod.id, products)}
                                </div>
                              )}
                            </h4>
                            {(nameCounts.get(prod.name.trim().toLowerCase()) || 0) > 1 && (
                              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                ⚠️ Check Size/Pack
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold opacity-75 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <SizeChip volume={prod.volume} pack={prod.pack} name={prod.name} className="mr-1" />
                            {prod.unitsPerCrate && (
                              <span className="text-[10.5px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {prod.unitsPerCrate} pcs/case
                              </span>
                            )}
                            <span>· {prod.category}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-bold opacity-60 block">Price / case</span>
                          <span className="font-black text-sm sm:text-base text-sky-700 dark:text-yellow-300">
                            ₹{money(currentRate)}
                          </span>
                        </div>
                      </div>

                      {/* Stock & Cart status badges */}
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap text-xs">
                        <span
                          className={`px-2 py-0.5 rounded font-black border ${
                            vehicleStock.available > 0
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-red-100 text-red-900 border-red-300'
                          }`}
                        >
                          Van Stock: {vehicleStock.available} cs
                        </span>
                        {currentQty > 0 && (
                          <span className="font-black px-2 py-0.5 rounded bg-blue-600 text-white">
                            {currentQty} cs in Cart
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Add / Stepper Controller */}
                    <div className="pt-2 border-t border-dashed border-slate-300 flex items-center justify-between gap-2">
                      {currentQty === 0 ? (
                        <button
                          type="button"
                          id={`btn-add-bev-${prod.id}`}
                          disabled={isOutOfVanStock}
                          onClick={() => handleAddBeverageDelta(prod, 1)}
                          className={`w-full py-2.5 px-3 rounded-lg font-black text-xs sm:text-sm border-2 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                            isLowVision
                              ? 'bg-yellow-400 text-black border-yellow-400 hover:bg-yellow-300'
                              : 'bg-sky-600 hover:bg-sky-700 text-white border-blue-950'
                          }`}
                          style={{ minHeight: '42px' }}
                        >
                          <Plus size={16} />
                          <span>{isOutOfVanStock ? 'Out of Van Stock' : '+ Add 1 Case'}</span>
                        </button>
                      ) : (
                        <div className="w-full flex items-center justify-between gap-2">
                          <div className="flex items-center border-2 rounded-lg overflow-hidden border-blue-600">
                            <button aria-label="Decrease"
                              type="button"
                              id={`btn-bev-modal-minus-${prod.id}`}
                              onClick={() => handleAddBeverageDelta(prod, -1)}
                              className={`px-3 py-1.5 font-black text-base cursor-pointer transition-colors ${
                                isLowVision
                                  ? 'bg-yellow-400 text-black hover:bg-yellow-500'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                              }`}
                              style={{ minHeight: '38px', minWidth: '38px' }}
                            >
                              <Minus size={15} />
                            </button>
                            <span className="px-3 py-1.5 font-black text-sm min-w-[48px] text-center bg-white text-slate-900">
                              {currentQty} cs
                            </span>
                            <button aria-label="Increase"
                              type="button"
                              id={`btn-bev-modal-plus-${prod.id}`}
                              disabled={currentQty >= vehicleStock.available}
                              onClick={() => handleAddBeverageDelta(prod, 1)}
                              className={`px-3 py-1.5 font-black text-base cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                isLowVision
                                  ? 'bg-yellow-400 text-black hover:bg-yellow-500'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                              }`}
                              style={{ minHeight: '38px', minWidth: '38px' }}
                            >
                              <Plus size={15} />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddBeverageDelta(prod, -currentQty)}
                            className="text-xs font-black text-rose-600 hover:text-rose-800 p-1.5 cursor-pointer flex items-center gap-1"
                            title="Remove all cases of this beverage"
                          >
                            <Trash2 size={14} />
                            <span>Remove</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Scrollable Content Body */
          <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* POST-FINALIZE WHATSAPP BANNER */}
          {lastFinalizedWhatsApp && (
            <div className={`m-3 p-3 rounded-xl border-2 flex items-center justify-between gap-3 ${lv ? 'bg-yellow-300 text-black border-black' : 'bg-emerald-50 text-emerald-950 border-emerald-400'}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <MessageCircle size={22} className="shrink-0 text-emerald-700" />
                <div className="min-w-0">
                  <div className="font-black text-sm">Bill #{lastFinalizedWhatsApp.id} ready on WhatsApp</div>
                  <div className="text-xs truncate">{lastFinalizedWhatsApp.phone}</div>
                </div>
              </div>
              <a href={lastFinalizedWhatsApp.url} target="_blank" rel="noopener noreferrer"
                 className="px-4 min-h-[44px] rounded-lg font-black text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                <MessageCircle size={16} /><span>Open</span>
              </a>
            </div>
          )}

          {/* Customer bar — one row */}
          <div
            id="cart-active-shop-header"
            className={`px-3 py-2.5 flex items-center gap-2.5 border-b ${lv ? 'bg-zinc-950 border-yellow-400 text-yellow-300' : 'bg-white border-slate-200'}`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${lv ? 'bg-yellow-400 text-black' : 'bg-sky-100 text-sky-700'}`}>
              <Store size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold leading-tight flex items-center gap-1.5">
                <span className="truncate">{selectedRetailer || 'Spot Cash / Walk-in Customer'}</span>
                {selectedRetailer && selectedRetailer !== 'Spot Cash / Walk-in Customer' && (
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                )}
              </div>
              {isOdia && (
                <div className="text-xs font-bold text-sky-800 font-odia truncate mt-0.5">
                  {selectedRetailer === 'Spot Cash / Walk-in Customer' || !selectedRetailer
                    ? 'ସ୍ପଟ୍ କ୍ୟାଶ୍ / ୱାକ୍-ଇନ୍ ଗ୍ରାହକ'
                    : getCustomerOdiaName(selectedRetailer, customers)}
                </div>
              )}
              <div className={`text-[11.5px] font-semibold truncate ${lv ? 'opacity-80' : 'text-slate-500'}`}>
                {retailerPhone ? `${retailerPhone}${autoSendWhatsApp ? ' · bill sent on WhatsApp' : ''}` : (isOdia ? 'ଫୋନ୍ ନମ୍ବର ନାହିଁ' : 'No phone number')}
              </div>
            </div>
            {selectedRetailer !== 'Spot Cash / Walk-in Customer' && (
              <button
                type="button"
                id="cart-btn-walkin-cash"
                onClick={handlePickWalkInCash}
                className={`w-10 h-10 rounded-xl border-[1.5px] flex items-center justify-center cursor-pointer shrink-0 ${lv ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-amber-50 text-amber-700 border-amber-300'}`}
                title="Switch to Spot Cash / Walk-in sale"
                aria-label="Switch to Spot Cash / Walk-in customer"
              >
                <Zap size={17} />
              </button>
            )}
            {!isOdia && (
<button
              type="button"
              id="cart-btn-voice-recog"
              onClick={onVoiceSearchCustomer}
              className={`w-10 h-10 rounded-xl border-[1.5px] flex items-center justify-center cursor-pointer shrink-0 ${
                isVoiceSearching ? 'bg-rose-600 text-white border-rose-700 animate-pulse' : lv ? 'bg-black text-yellow-300 border-yellow-400' : 'bg-white text-sky-700 border-slate-300'
              }`}
              title="Speak customer or shop name"
              aria-label={isVoiceSearching ? 'Listening for customer name' : 'Speak customer name'}
            >
              {isVoiceSearching ? <MicOff size={17} className="animate-spin" /> : <Mic size={17} />}
            </button>
)}
            <button
              type="button"
              id="cart-btn-change-customer"
              onClick={onOpenCustomerDirectory}
              className={`px-3 min-h-[40px] rounded-xl border-[1.5px] text-xs font-extrabold cursor-pointer shrink-0 ${lv ? 'bg-yellow-400 text-black border-yellow-400' : 'text-sky-700 border-sky-200 bg-white'}`}
            >
              Change
            </button>
          </div>

          <div className="p-3 space-y-2.5">
            {/* Cart items — compact cards */}
            {cart.items.length === 0 ? (
              <div className={`text-center py-10 border-2 border-dashed rounded-xl font-bold text-sm ${lv ? 'border-yellow-400 text-yellow-300' : 'border-slate-300 text-slate-500'}`}>
                <ShoppingCart size={36} className="mx-auto mb-2 opacity-50" />
                No beverages in cart yet.
                <div className="mt-3">
                  <button
                    type="button"
                    id="btn-empty-cart-browse-beverages"
                    onClick={() => { setIsBrowsingBeverages(true); if (lv) speakAssistiveText('Opening beverage catalog to add items.'); }}
                    className={`px-5 min-h-[44px] rounded-xl font-black text-sm cursor-pointer flex items-center gap-2 mx-auto ${lv ? 'bg-yellow-400 text-black' : 'bg-sky-600 text-white'}`}
                  >
                    <Plus size={16} /><span>Add beverages</span>
                  </button>
                </div>
              </div>
            ) : (
              cart.items.map((item) => {
                const prod = products.find((p) => p.id === item.productId);
                const vehicleStock = prod ? getVehicleStock(activeTrip, prod.id) : { available: 999, loaded: 0, sold: 0 };
                const isEditing = editingItemKey === item.key;

                return (
                  <div
                    key={item.key}
                    id={`cart-item-${item.key}`}
                    style={{ borderLeftWidth: 5, borderLeftColor: sizeTheme(prod?.volume, item.productName).hex }}
                    className={`p-2.5 rounded-xl border transition-shadow ${
                      lv ? 'bg-gray-950 border-yellow-400 text-yellow-300' : isEditing ? 'bg-white border-sky-500 shadow-md' : 'bg-white border-slate-200 shadow-xs'
                    }`}
                  >
                    {/* Row 1: name, size, tier, line total */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-[14.5px] leading-snug break-words">
                          <div>{item.productName}</div>
                          {isOdia && (prod?.nameOr || getProductOdiaName(item.productId || item.productName, products)) && (
                            <div className="text-xs font-bold text-sky-800 font-odia mt-0.5">
                              {prod?.nameOr || getProductOdiaName(item.productId || item.productName, products)}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <SizeChip volume={prod?.volume} pack={prod?.pack} name={item.productName} />
                          <span className={`px-1.5 py-0.5 text-[10.5px] font-extrabold rounded-md ${item.priceType === 'Retail' ? 'bg-sky-100 text-sky-800' : 'bg-purple-100 text-purple-800'}`}>
                            {item.priceType}
                          </span>
                          {item.discount > 0 && (
                            <span className="px-1.5 py-0.5 text-[10.5px] font-extrabold rounded-md bg-rose-50 text-rose-700">−₹{money(item.discount)} disc</span>
                          )}
                        </div>
                      </div>
                      <div className="text-base font-black whitespace-nowrap">₹{money(item.amount)}</div>
                    </div>

                    {/* Row 2: stepper · rate (tap pencil to edit) · van stock · remove */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`flex items-center border-[1.5px] rounded-xl overflow-hidden ${lv ? 'border-yellow-400' : 'border-slate-300'}`}>
                        <button
                          type="button"
                          id={`btn-qty-minus-${item.key}`}
                          onClick={() => onUpdateQty(item.key, item.qty - 1)}
                          className={`w-10 h-10 flex items-center justify-center cursor-pointer ${lv ? 'bg-yellow-400 text-black' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'}`}
                          aria-label="Decrease quantity"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="number" inputMode="numeric"
                          min={1}
                          max={vehicleStock.available}
                          value={item.qty}
                          aria-label="Quantity in cases"
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (!isNaN(val)) onUpdateQty(item.key, Math.max(1, Math.min(vehicleStock.available, val)));
                          }}
                          className={`w-11 text-center font-black text-sm h-10 ${lv ? 'bg-black text-yellow-300' : 'bg-white text-slate-900'}`}
                        />
                        <button
                          type="button"
                          id={`btn-qty-plus-${item.key}`}
                          onClick={() => onUpdateQty(item.key, item.qty + 1)}
                          disabled={item.qty >= vehicleStock.available}
                          className={`w-10 h-10 flex items-center justify-center cursor-pointer disabled:opacity-30 ${lv ? 'bg-yellow-400 text-black' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'}`}
                          aria-label="Increase quantity"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditingItemKey(null) : startEditingItem(item))}
                        className={`min-h-[40px] px-1.5 flex items-center gap-1 text-[12.5px] font-bold cursor-pointer ${lv ? 'text-yellow-300' : 'text-slate-700'}`}
                        aria-label={`Edit rate and discount for ${item.productName}`}
                        aria-expanded={isEditing}
                      >
                        <span>₹{money(item.rate)}/cs</span>
                        <Edit2 size={13} className={lv ? 'text-yellow-300' : 'text-sky-600'} />
                      </button>

                      <span className={`ml-auto text-[10.5px] font-bold text-right ${lv ? '' : 'text-slate-500'}`}>Van {vehicleStock.available}</span>

                      <button
                        type="button"
                        id={`btn-remove-item-${item.key}`}
                        onClick={() => onRemoveItem(item.key)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer shrink-0 ${lv ? 'bg-red-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                        title="Remove item from invoice"
                        aria-label={`Remove ${item.productName}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Expanded editor — only for the tapped line */}
                    {isEditing && (
                      <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-300">
                        <div className="flex gap-2.5">
                          {!isPriceLocked && (
                            <div className="flex-1 min-w-0">
                              <label className="block text-[10.5px] font-extrabold tracking-wide text-slate-500 mb-1">RATE / CASE (₹)</label>
                              <input
                                type="number" inputMode="decimal"
                                value={editingRateDraft}
                                onChange={(e) => setEditingRateDraft(e.target.value)}
                                placeholder={`₹${item.rate}`}
                                className="w-full h-11 px-3 text-base font-black rounded-xl border-2 border-sky-500 bg-white text-slate-900"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <label className="block text-[10.5px] font-extrabold tracking-wide text-slate-500 mb-1">LINE DISCOUNT (₹)</label>
                            <input
                              type="number" inputMode="numeric"
                              min={0}
                              value={editingDiscountDraft}
                              onChange={(e) => setEditingDiscountDraft(e.target.value)}
                              placeholder="0"
                              className="w-full h-11 px-3 text-base font-black rounded-xl border-2 border-sky-500 bg-white text-slate-900"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2.5">
                          <button
                            type="button"
                            onClick={() => onTogglePriceType(item.key, item.priceType === 'Retail' ? 'Wholesale' : 'Retail')}
                            className="min-h-[40px] px-3 rounded-full text-xs font-extrabold bg-purple-100 text-purple-800 cursor-pointer"
                          >
                            Use {item.priceType === 'Retail' ? 'Wholesale' : 'Retail'}
                          </button>
                          {isPriceLocked && (
                            <span className="text-[10px] font-bold text-slate-500 uppercase px-1.5 py-0.5 rounded bg-slate-200">Standard rate</span>
                          )}
                          <button
                            type="button"
                            onClick={() => saveEditingItem(item.key)}
                            className="ml-auto min-h-[42px] px-5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-sm flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check size={17} strokeWidth={3} /> Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Add more + bill discount toggle */}
            {cart.items.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  id="btn-add-beverages-from-cart-header"
                  onClick={() => { setIsBrowsingBeverages(true); if (lv) speakAssistiveText('Opening beverage catalog to add items.'); }}
                  className={`flex-1 min-h-[44px] rounded-xl text-[13px] font-extrabold border-[1.5px] border-dashed flex items-center justify-center gap-1.5 cursor-pointer ${lv ? 'bg-yellow-400 text-black border-black' : 'text-sky-700 border-sky-300 bg-sky-50'}`}
                >
                  <Plus size={16} /><span>Add more beverages</span>
                </button>
                <button
                  type="button"
                  id="btn-toggle-bill-discount"
                  onClick={() => setShowDiscount((v) => !v)}
                  aria-expanded={showDiscount}
                  className={`min-h-[44px] px-3 rounded-xl text-[12.5px] font-extrabold border flex items-center gap-1.5 cursor-pointer ${
                    appliedDiscount > 0 || showDiscount ? 'bg-amber-50 border-amber-300 text-amber-900' : lv ? 'bg-black border-yellow-400 text-yellow-300' : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <Percent size={15} />
                  <span>{appliedDiscount > 0 ? `−₹${money(appliedDiscount)}` : 'Discount'}</span>
                  <ChevronDown size={15} className={`transition-transform ${showDiscount ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )}

            {/* Bill discount panel — collapsed by default */}
            {cart.items.length > 0 && showDiscount && (
              <div className={`p-3 rounded-xl border-[1.5px] space-y-2.5 ${lv ? 'bg-gray-900 border-yellow-400 text-yellow-300' : 'bg-amber-50 border-amber-300 text-slate-900'}`}>
                <div className="flex items-center justify-between text-[11px] font-extrabold tracking-wide text-amber-900">
                  <span>BILL DISCOUNT</span>
                  {appliedDiscount > 0 && (
                    <button type="button" onClick={() => handleDiscountChange('0')} className="text-rose-600 text-xs font-black cursor-pointer min-h-[32px]">Reset</button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[50, 100, 200].map((amt) => (
                    <button key={amt} type="button" onClick={() => applyQuickDiscount(amt, false)}
                      className={`min-h-[40px] text-[13px] font-black rounded-xl border-[1.5px] cursor-pointer ${lv ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-white border-amber-300 text-amber-900'}`}>
                      −₹{amt}
                    </button>
                  ))}
                  <button type="button" onClick={() => applyQuickDiscount(5, true)}
                    className={`min-h-[40px] text-[13px] font-black rounded-xl border-[1.5px] cursor-pointer ${lv ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-white border-amber-300 text-amber-900'}`}>
                    −5%
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="cart-special-discount-amt" className="block text-[10.5px] font-extrabold tracking-wide text-slate-500 mb-1">DISCOUNT (₹)</label>
                    <input id="cart-special-discount-amt" type="number" inputMode="numeric" min={0}
                      value={invoiceDiscountDraft} onChange={(e) => handleDiscountChange(e.target.value)} placeholder="₹0"
                      className={`w-full h-11 px-3 text-base font-black rounded-xl border-2 ${lv ? 'bg-black text-yellow-300 border-yellow-400' : 'bg-white border-amber-400 text-slate-900'}`} />
                  </div>
                  <div>
                    <label htmlFor="cart-settled-total-amt" className="block text-[10.5px] font-extrabold tracking-wide text-slate-500 mb-1">FINAL TOTAL (₹)</label>
                    <input id="cart-settled-total-amt" type="number" inputMode="decimal" min={0}
                      value={settledTotalDraft} onChange={(e) => handleSettledTotalChange(e.target.value)} placeholder={`₹${rawCartTotal}`}
                      className={`w-full h-11 px-3 text-base font-black rounded-xl border-2 ${lv ? 'bg-black text-yellow-300 border-yellow-400' : 'bg-white border-amber-400 text-slate-900'}`} />
                  </div>
                </div>
              </div>
            )}

            {/* Payment + WhatsApp */}
            {cart.items.length > 0 && (
              <div className={`p-3 rounded-xl border ${lv ? 'bg-gray-900 border-yellow-400 text-yellow-300' : 'bg-white border-slate-200'}`}>
                <div className="text-[11px] font-extrabold tracking-wide text-slate-500 mb-2">PAYMENT TODAY</div>
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Payment today">
                  <button
                    type="button" role="radio" aria-checked={mode === 'credit'}
                    id="btn-payment-option-credit"
                    onClick={() => {
                      setPayMode('credit');
                      setAmountPaidDraft('0');
                      if (lv) speakAssistiveText(`Selected Credit. 0 rupees paid today. Rupees ${finalCartTotal} due to pay.`);
                    }}
                    className={`min-h-[44px] rounded-xl font-black text-[13px] border-[1.5px] flex items-center justify-center gap-1 cursor-pointer ${
                      mode === 'credit' ? (lv ? 'bg-yellow-400 text-black border-yellow-500 ring-2 ring-yellow-400' : 'bg-amber-600 text-white border-amber-600 ring-2 ring-amber-200') : lv ? 'bg-black text-yellow-300 border-yellow-400/50' : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    <Clock size={15} /> Credit
                  </button>
                  <button
                    type="button" role="radio" aria-checked={mode === 'partial'}
                    id="btn-payment-option-partial"
                    onClick={() => {
                      setPayMode('partial');
                      if (isFull || isCredit) setAmountPaidDraft('');
                    }}
                    className={`min-h-[44px] rounded-xl font-black text-[13px] border-[1.5px] flex items-center justify-center cursor-pointer ${
                      mode === 'partial' ? (lv ? 'bg-yellow-400 text-black border-yellow-500 ring-2 ring-yellow-400' : 'bg-sky-600 text-white border-sky-600 ring-2 ring-sky-200') : lv ? 'bg-black text-yellow-300 border-yellow-400/50' : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Partial
                  </button>
                  <button
                    type="button" role="radio" aria-checked={mode === 'full'}
                    id="btn-payment-option-full"
                    onClick={() => {
                      setPayMode('full');
                      setAmountPaidDraft(String(finalCartTotal));
                      if (lv) speakAssistiveText(`Selected Full Cash. Rupees ${finalCartTotal} paid today. 0 due.`);
                    }}
                    className={`min-h-[44px] rounded-xl font-black text-[13px] border-[1.5px] flex items-center justify-center gap-1 cursor-pointer ${
                      mode === 'full' ? (lv ? 'bg-yellow-400 text-black border-yellow-500 ring-2 ring-yellow-400' : 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-200') : lv ? 'bg-black text-yellow-300 border-yellow-400/50' : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    <CheckCircle2 size={15} /> Full cash
                  </button>
                </div>

                {mode === 'partial' && (
                  <div className="flex gap-2.5 mt-2.5 items-end">
                    <div className="flex-1 min-w-0">
                      <label htmlFor="cart-amount-paid-today" className="block text-[10.5px] font-extrabold tracking-wide text-slate-500 mb-1">AMOUNT RECEIVED (₹)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black opacity-60">₹</span>
                        <input
                          id="cart-amount-paid-today"
                          type="number" inputMode="decimal" min={0} step="any" autoFocus
                          value={amountPaidDraft}
                          onChange={(e) => setAmountPaidDraft(e.target.value)}
                          placeholder="0"
                          className={`w-full h-11 pl-7 pr-3 text-base font-black rounded-xl border-2 ${lv ? 'bg-black text-yellow-300 border-yellow-400' : 'bg-white border-sky-500 text-slate-900'}`}
                        />
                      </div>
                    </div>
                    <div className={`flex-1 rounded-xl border-[1.5px] px-2.5 py-1 h-11 ${balanceDue > 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
                      <div className="text-[9.5px] font-extrabold text-amber-900">BALANCE DUE</div>
                      <div className={`text-base font-black leading-tight ${balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>₹{money(balanceDue)}</div>
                    </div>
                  </div>
                )}

                <label className="flex items-center justify-between gap-3 mt-3 cursor-pointer min-h-[40px]">
                  <span className="text-[13px] font-bold flex items-center gap-1.5">
                    <MessageCircle size={16} className="text-emerald-600" /> Send bill on WhatsApp
                  </span>
                  <input
                    type="checkbox" role="switch"
                    checked={autoSendWhatsApp}
                    onChange={(e) => setAutoSendWhatsApp(e.target.checked)}
                    className="w-5 h-5 accent-emerald-600 cursor-pointer"
                    aria-label="Send bill on WhatsApp"
                  />
                </label>
              </div>
            )}
          </div>
          </div>
        )}

        {/* Footer: sticky — totals + due + one big Finalize button */}
        <div
          className={`shrink-0 px-3 pt-2.5 border-t ${lv ? 'bg-gray-950 border-yellow-400' : 'bg-white border-slate-300 shadow-[0_-6px_18px_rgba(15,23,42,0.10)]'}`}
          style={{ paddingBottom: 'max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))' }}
        >
          {isBrowsingBeverages ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
              <div className="text-xs sm:text-sm font-bold flex items-center gap-2 flex-wrap">
                <span>Selected:</span>
                <span className="font-black text-sky-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                  {cart.items.length} {cart.items.length === 1 ? 'Beverage' : 'Beverages'} ({totalCases} cases)
                </span>
                <span>• Subtotal:</span>
                <span className="font-black text-emerald-700 text-base">₹{money(finalCartTotal)}</span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  id="btn-beverage-done-review"
                  onClick={() => {
                    setIsBrowsingBeverages(false);
                    if (isLowVision) speakAssistiveText(`Returning to invoice review. ${cart.items.length} beverages in cart.`);
                  }}
                  className={`w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl font-black text-sm sm:text-base border-2 cursor-pointer shadow-lg flex items-center justify-center gap-2 transition-all ${
                    isLowVision
                      ? 'bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-300'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                  }`}
                >
                  <CheckCircle2 size={18} />
                  <span>Done Adding → Review Invoice (₹{money(finalCartTotal)})</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-[12.5px] font-bold mb-2">
                <span className={lv ? '' : 'text-slate-600'}>
                  Items ₹{money(rawCartTotal)}
                  {appliedDiscount > 0 && <> · Discount <b className="text-rose-600">−₹{money(appliedDiscount)}</b></>}
                </span>
                {cart.items.length > 0 && (
                  <span className={`font-extrabold ${balanceDue > 0 ? (lv ? '' : 'text-amber-700') : 'text-emerald-700'}`}>
                    {balanceDue > 0 ? `₹${money(balanceDue)} ${isCredit ? 'on credit' : 'due'}` : 'Paid in full'}
                  </span>
                )}
              </div>
              <button
                type="button"
                id="btn-finalize-from-cart-modal"
                disabled={cart.items.length === 0 || !selectedRetailer.trim()}
                onClick={() => { onFinalize(); }}
                className={`w-full min-h-[54px] rounded-xl font-black text-[16.5px] shadow-lg cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed ${
                  lv ? 'bg-yellow-400 text-black hover:bg-yellow-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <CheckCircle2 size={22} strokeWidth={2.6} />
                <span>Finalize sale · ₹{money(finalCartTotal)}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
