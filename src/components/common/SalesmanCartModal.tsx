import React, { useState, useMemo, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { BillItem, PriceType, Product, Trip, ExistingCustomer } from '../../types';
import { money } from '../../utils/billing';
import { speakAssistiveText } from '../../utils/speechRecognition';

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
  // Beverage browsing mode state (allows adding beverages without leaving modal)
  const [isBrowsingBeverages, setIsBrowsingBeverages] = useState<boolean>(false);
  const [beverageSearchQuery, setBeverageSearchQuery] = useState<string>('');
  const [selectedBeverageCategory, setSelectedBeverageCategory] = useState<string>('ALL');
  const [activePriceType, setActivePriceType] = useState<PriceType>(priceType || 'Wholesale');

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
        if (q) {
          const matchName = p.name.toLowerCase().includes(q);
          const matchCat = (p.category || '').toLowerCase().includes(q);
          const matchVol = String(p.volume || '').includes(q);
          return matchName || matchCat || matchVol;
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
  }, [products, beverageSearchQuery, selectedBeverageCategory, activeTrip, getVehicleStock]);

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
    if (!isNaN(rateVal) && rateVal >= 0) {
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

  return (
    <div
      id="salesman-cart-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Invoice Draft & Cart"
    >
      <div
        id="salesman-cart-modal-container"
        className={`w-full max-w-3xl rounded-xl shadow-2xl flex flex-col my-auto max-h-[92dvh] max-h-[92svh] overflow-hidden border-3 ${
          isLowVision ? 'bg-black text-yellow-300 border-yellow-400' : 'bg-white text-slate-900 border-slate-700'
        }`}
        style={!isLowVision ? { backgroundColor: palette.panel, borderColor: palette.navy } : {}}
      >
        {/* Header Bar */}
        <div
          className={`px-4 py-3.5 border-b-2 flex items-center justify-between gap-3 ${
            isLowVision ? 'bg-yellow-400 text-black border-yellow-500' : 'bg-slate-900 text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isBrowsingBeverages ? (
              <button
                type="button"
                id="btn-back-to-cart-header"
                onClick={() => {
                  setIsBrowsingBeverages(false);
                  if (isLowVision) speakAssistiveText('Returned to invoice cart view.');
                }}
                className={`px-3 py-1.5 rounded-lg border-2 cursor-pointer font-black transition-colors flex items-center gap-1.5 text-xs shadow-xs ${
                  isLowVision
                    ? 'bg-black text-yellow-300 border-yellow-400 hover:bg-zinc-900'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                }`}
                title="Back to Invoice Cart"
              >
                <ArrowLeft size={16} />
                <span>Back to Cart</span>
              </button>
            ) : (
              <div
                className={`p-2 rounded-lg flex items-center justify-center ${
                  isLowVision ? 'bg-black text-yellow-300' : 'bg-blue-600 text-white'
                }`}
              >
                <ShoppingCart size={22} />
              </div>
            )}
            <div>
              <h2 className="text-lg sm:text-xl font-black leading-tight flex items-center gap-2">
                <span>{isBrowsingBeverages ? 'Browse & Add Beverages' : 'Invoice Cart'}</span>
                <span
                  className={`px-2 py-0.5 text-xs font-black rounded-full ${
                    isLowVision ? 'bg-black text-yellow-300' : 'bg-white text-slate-900'
                  }`}
                >
                  {cart.items.length} {cart.items.length === 1 ? 'Beverage' : 'Beverages'} • {totalCases} Cases
                </span>
              </h2>
              <p className={`text-xs font-bold ${isLowVision ? 'text-black' : 'text-slate-300'}`}>
                {isBrowsingBeverages
                  ? `Select beverages loaded in ${activeTrip?.vehicle || 'Van Stock'} to add into invoice`
                  : `Active Run: ${activeTrip?.vehicle || 'Van Stock'} • Salesman Bill`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`hidden sm:inline-block text-lg font-black px-3 py-1 rounded border-2 ${
                isLowVision ? 'bg-black text-yellow-300 border-black' : 'bg-emerald-600 text-white border-emerald-500'
              }`}
            >
              ₹{money(finalCartTotal)}
            </span>
            <button
              type="button"
              id="btn-close-cart-modal"
              onClick={onClose}
              className={`p-2 rounded-lg border-2 cursor-pointer font-black transition-colors ${
                isLowVision
                  ? 'bg-black text-white hover:bg-gray-800 border-black'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
              }`}
              aria-label="Close cart invoice"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body: Either Beverage Catalog List OR Cart Review */}
        {isBrowsingBeverages ? (
          <div className="p-3 sm:p-5 space-y-4 overflow-y-auto flex-1">
            {/* Top controls: Search, Category pills, Price Tier selector */}
            <div
              className={`p-3.5 rounded-xl border-2 space-y-3 ${
                isLowVision ? 'bg-gray-900 border-yellow-400 text-yellow-300' : 'bg-white border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h3 className="font-black text-base sm:text-lg flex items-center gap-2">
                    <span>Van Beverage List</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-black ${
                        isLowVision ? 'bg-yellow-400 text-black' : 'bg-blue-100 text-blue-900 border border-blue-300'
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
                            : 'bg-blue-900 text-white shadow-xs'
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
                  <button
                    type="button"
                    onClick={() => setBeverageSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full opacity-60 hover:opacity-100 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
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
                          : 'bg-blue-900 text-white border-blue-950 shadow-xs'
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
                    className={`p-3 rounded-xl border-2 flex flex-col justify-between gap-2.5 transition-all ${
                      currentQty > 0
                        ? isLowVision
                          ? 'bg-zinc-900 border-yellow-400 text-yellow-300 shadow-md ring-2 ring-yellow-400/30'
                          : 'bg-blue-50/70 border-blue-500 text-slate-900 shadow-sm'
                        : isLowVision
                        ? 'bg-black border-gray-800 text-yellow-300'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-black text-sm sm:text-base leading-snug">{prod.name}</h4>
                          <div className="text-xs font-semibold opacity-75 mt-0.5">
                            {prod.volume ? `${prod.volume}ml` : ''} • {prod.category}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-bold opacity-60 block">Price / case</span>
                          <span className="font-black text-sm sm:text-base text-blue-900 dark:text-yellow-300">
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
                          className={`w-full py-2.5 px-3 rounded-lg font-black text-xs sm:text-sm border-2 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                            isLowVision
                              ? 'bg-yellow-400 text-black border-yellow-400 hover:bg-yellow-300'
                              : 'bg-blue-900 hover:bg-blue-950 text-white border-blue-950'
                          }`}
                          style={{ minHeight: '42px' }}
                        >
                          <Plus size={16} />
                          <span>{isOutOfVanStock ? 'Out of Van Stock' : '+ Add 1 Case'}</span>
                        </button>
                      ) : (
                        <div className="w-full flex items-center justify-between gap-2">
                          <div className="flex items-center border-2 rounded-lg overflow-hidden border-blue-600">
                            <button
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
                            <button
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
          <div className="p-3 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* POST-FINALIZE WHATSAPP BANNER */}
          {lastFinalizedWhatsApp && (
            <div
              className={`p-3 rounded-lg border-2 flex flex-col sm:flex-row items-center justify-between gap-3 ${
                isLowVision
                  ? 'bg-yellow-300 text-black border-black'
                  : 'bg-emerald-50 text-emerald-950 border-emerald-400'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MessageCircle size={22} className="shrink-0 text-emerald-700" />
                <div>
                  <div className="font-black text-sm">Bill #{lastFinalizedWhatsApp.id} Ready on WhatsApp!</div>
                  <div className="text-xs">Destination: {lastFinalizedWhatsApp.phone}</div>
                </div>
              </div>
              <a
                href={lastFinalizedWhatsApp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-4 py-2 rounded-lg font-black text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <MessageCircle size={16} />
                <span>Open WhatsApp Chat</span>
              </a>
            </div>
          )}

          {/* Active Customer / Shop Bar (Streamlined: Step 1 active shop, no bulky suggestion list) */}
          <div
            id="cart-active-shop-header"
            className={`p-3 rounded-xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
              isLowVision
                ? 'bg-zinc-950 border-yellow-400 text-yellow-300'
                : 'bg-slate-50 border-slate-300 text-slate-900 shadow-xs'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-black ${
                  isLowVision ? 'bg-yellow-400 text-black' : 'bg-blue-900 text-white'
                }`}
              >
                <Store size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider opacity-60">
                  Active Shop (Step 1 Customer):
                </div>
                <div className="text-sm sm:text-base font-black truncate flex items-center gap-1.5">
                  <span>{selectedRetailer || 'Spot Cash / Walk-in Customer'}</span>
                  {selectedRetailer && selectedRetailer !== 'Spot Cash / Walk-in Customer' && (
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  )}
                </div>
                {retailerPhone && (
                  <div className="text-xs font-bold opacity-75 flex items-center gap-1 mt-0.5">
                    <Phone size={11} />
                    <span>WhatsApp: {retailerPhone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions: Spot Cash / Walk-in & Voice Recognition ONLY (No bulky suggestion box) */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {selectedRetailer !== 'Spot Cash / Walk-in Customer' && (
                <button
                  type="button"
                  id="cart-btn-walkin-cash"
                  onClick={handlePickWalkInCash}
                  className={`px-3 py-2 rounded-lg text-xs font-black border-2 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors ${
                    isLowVision
                      ? 'bg-yellow-400 text-black border-yellow-400 hover:bg-yellow-300'
                      : 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100'
                  }`}
                  title="Switch to Spot Cash / Walk-in sale"
                  style={{ minHeight: '38px' }}
                >
                  <Zap size={14} className={isLowVision ? 'text-black' : 'text-amber-600'} />
                  <span>Spot Cash / Walk-in</span>
                </button>
              )}

              <button
                type="button"
                id="cart-btn-voice-recog"
                onClick={onVoiceSearchCustomer}
                className={`px-3 py-2 rounded-lg text-xs font-black border-2 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors ${
                  isVoiceSearching
                    ? 'bg-rose-600 text-white border-rose-700 animate-pulse ring-2 ring-rose-400'
                    : isLowVision
                    ? 'bg-black text-yellow-300 border-yellow-400 hover:bg-zinc-900'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                }`}
                title="Speak customer or shop name"
                style={{ minHeight: '38px' }}
              >
                {isVoiceSearching ? (
                  <>
                    <MicOff size={14} className="animate-spin" />
                    <span>Listening...</span>
                  </>
                ) : (
                  <>
                    <Mic size={14} className={isLowVision ? 'text-yellow-400' : 'text-blue-900'} />
                    <span>Voice Search</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Cart Items List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-1.5 gap-2">
              <h3 className="font-black text-base flex items-center gap-2">
                <Receipt size={18} />
                <span>Invoice Items ({cart.items.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-add-beverages-from-cart-header"
                  onClick={() => {
                    setIsBrowsingBeverages(true);
                    if (isLowVision) speakAssistiveText('Opening beverage catalog to add items.');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-black border-2 cursor-pointer flex items-center gap-1.5 shadow-xs transition-colors ${
                    isLowVision
                      ? 'bg-yellow-400 text-black border-yellow-400 hover:bg-yellow-300'
                      : 'bg-blue-50 text-blue-900 border-blue-300 hover:bg-blue-100'
                  }`}
                >
                  <Plus size={14} />
                  <span>Browse & Add Beverages</span>
                </button>
              </div>
            </div>

            {cart.items.length === 0 ? (
              <div
                className={`text-center py-10 border-2 border-dashed rounded-lg font-bold text-sm ${
                  isLowVision ? 'border-yellow-400 text-yellow-300' : 'border-slate-300 text-slate-500'
                }`}
              >
                <ShoppingCart size={36} className="mx-auto mb-2 opacity-50" />
                No beverages in cart yet.
                <div className="mt-3">
                  <button
                    type="button"
                    id="btn-empty-cart-browse-beverages"
                    onClick={() => {
                      setIsBrowsingBeverages(true);
                      if (isLowVision) speakAssistiveText('Opening beverage catalog to add items.');
                    }}
                    className={`px-5 py-2.5 rounded-lg font-black text-xs sm:text-sm border-2 cursor-pointer shadow-md flex items-center gap-2 mx-auto ${
                      isLowVision
                        ? 'bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-300'
                        : 'bg-blue-900 text-white border-blue-950 hover:bg-blue-950'
                    }`}
                  >
                    <Plus size={16} />
                    <span>Browse & Add Beverages</span>
                  </button>
                </div>
              </div>
            ) : (
              cart.items.map((item, idx) => {
                const prod = products.find((p) => p.id === item.productId);
                const vehicleStock = prod ? getVehicleStock(activeTrip, prod.id) : { available: 999, loaded: 0, sold: 0 };
                const isEditing = editingItemKey === item.key;

                return (
                  <div
                    key={item.key}
                    id={`cart-item-${item.key}`}
                    className={`p-3.5 rounded-xl border-2 transition-all ${
                      isLowVision
                        ? 'bg-gray-950 border-yellow-400 text-yellow-300'
                        : 'bg-white border-slate-300 text-slate-900 shadow-xs'
                    }`}
                  >
                    {/* Top Row: Product Info & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2 mb-2.5">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 text-xs font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-black text-base sm:text-lg">{item.productName}</span>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-black rounded uppercase ${
                              item.priceType === 'Retail'
                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                : 'bg-purple-100 text-purple-900 border border-purple-300'
                            }`}
                          >
                            {item.priceType}
                          </span>
                        </div>
                        <div className="text-xs font-semibold opacity-75 mt-0.5">
                          Category: {item.category.toUpperCase()} • Available in Van: {vehicleStock.available} cs
                        </div>
                      </div>

                      {/* Right: Item Total & Delete */}
                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div className="text-right">
                          <div className="text-base sm:text-lg font-black text-emerald-700">
                            ₹{money(item.amount)}
                          </div>
                          {item.discount > 0 && (
                            <div className="text-[11px] font-bold text-rose-600">
                              (Discount: -₹{money(item.discount)})
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          id={`btn-remove-item-${item.key}`}
                          onClick={() => onRemoveItem(item.key)}
                          className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                            isLowVision
                              ? 'bg-red-600 text-white border-red-700 hover:bg-red-700'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          }`}
                          title="Remove item from invoice"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Controls Row: Quantity Steppers, Rate Adjuster, Price Type Switch */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                      {/* 1. Cases Quantity Stepper */}
                      <div>
                        <label className="block text-xs font-black mb-1">
                          Quantity (Cases):
                        </label>
                        <div className="flex items-center border-2 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            id={`btn-qty-minus-${item.key}`}
                            onClick={() => onUpdateQty(item.key, item.qty - 1)}
                            className={`px-3.5 py-2 font-black text-base cursor-pointer ${
                              isLowVision
                                ? 'bg-yellow-400 text-black hover:bg-yellow-500'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                            }`}
                            aria-label="Decrease quantity"
                          >
                            <Minus size={16} />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={vehicleStock.available}
                            value={item.qty}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (!isNaN(val)) {
                                onUpdateQty(item.key, Math.max(1, Math.min(vehicleStock.available, val)));
                              }
                            }}
                            className={`w-full text-center font-black text-sm py-1.5 ${
                              isLowVision ? 'bg-black text-yellow-300' : 'bg-white text-slate-900'
                            }`}
                          />
                          <button
                            type="button"
                            id={`btn-qty-plus-${item.key}`}
                            onClick={() => onUpdateQty(item.key, item.qty + 1)}
                            disabled={item.qty >= vehicleStock.available}
                            className={`px-3.5 py-2 font-black text-base cursor-pointer disabled:opacity-30 ${
                              isLowVision
                                ? 'bg-yellow-400 text-black hover:bg-yellow-500'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                            }`}
                            aria-label="Increase quantity"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>

                      {/* 2. Rate Editor / Price Type */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-black">
                            Rate / Case (₹):
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const nextType: PriceType = item.priceType === 'Retail' ? 'Wholesale' : 'Retail';
                              onTogglePriceType(item.key, nextType);
                            }}
                            className="text-[11px] font-bold underline cursor-pointer text-blue-600 hover:text-blue-800"
                          >
                            Use {item.priceType === 'Retail' ? 'Wholesale' : 'Retail'}
                          </button>
                        </div>

                        {isEditing && !isPriceLocked ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editingRateDraft}
                              onChange={(e) => setEditingRateDraft(e.target.value)}
                              placeholder={`₹${item.rate}`}
                              className="w-full px-2 py-1.5 text-xs font-black rounded border-2 border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => saveEditingItem(item.key)}
                              className="px-2.5 py-1.5 rounded bg-emerald-600 text-white font-black text-xs cursor-pointer"
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between border-2 rounded-lg px-2.5 py-1.5 bg-slate-50/50">
                            <span className="font-black text-sm">₹{item.rate} / cs</span>
                            {isPriceLocked ? (
                              <span className="text-[10px] font-bold text-slate-500 uppercase px-1.5 py-0.5 rounded bg-slate-200">
                                Standard Rate
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditingItem(item)}
                                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <Edit2 size={12} />
                                <span>Edit</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 3. Quick Preset Adjuster or Discount */}
                      <div>
                        <label className="block text-xs font-black mb-1">
                          Line Discount (₹):
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={item.discount || ''}
                          onChange={(e) => onUpdateDiscount(item.key, Number(e.target.value) || 0)}
                          placeholder="₹0 discount"
                          className={`w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border-2 ${
                            isLowVision ? 'bg-black text-yellow-300 border-yellow-400' : 'bg-white border-slate-300'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* INVOICE-LEVEL SPECIAL DISCOUNT & PRICE OVERRIDE */}
          {cart.items.length > 0 && (
            <div
              className={`p-4 rounded-xl border-2 space-y-3 ${
                isLowVision ? 'bg-gray-900 border-yellow-400 text-yellow-300' : 'bg-amber-50/70 border-amber-300 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Percent size={18} className="text-amber-700" />
                  <span className="font-black text-sm">Special Discount & Price Override After Total</span>
                </div>
                {appliedDiscount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDiscountChange('0')}
                    className="text-xs font-black text-rose-600 hover:underline cursor-pointer"
                  >
                    Reset Discount
                  </button>
                )}
              </div>

              {/* Quick Discount Presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold">Quick Presets:</span>
                {[50, 100, 200].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => applyQuickDiscount(amt, false)}
                    className={`px-3 py-1 text-xs font-black rounded-lg border-2 cursor-pointer ${
                      isLowVision ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-white border-slate-400 hover:bg-amber-100'
                    }`}
                  >
                    -₹{amt}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => applyQuickDiscount(5, true)}
                  className={`px-3 py-1 text-xs font-black rounded-lg border-2 cursor-pointer ${
                    isLowVision ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-white border-slate-400 hover:bg-amber-100'
                  }`}
                >
                  -5%
                </button>
              </div>

              {/* Discount Amount & Settled Final Total Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cart-special-discount-amt" className="block text-xs font-black mb-1">
                    Special Invoice Discount (₹):
                  </label>
                  <input
                    id="cart-special-discount-amt"
                    type="number"
                    min={0}
                    value={invoiceDiscountDraft}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    placeholder="₹0"
                    className={`w-full px-3 py-1.5 text-sm font-black rounded-lg border-2 ${
                      isLowVision ? 'bg-black text-yellow-300 border-yellow-400' : 'bg-white border-slate-400'
                    }`}
                  />
                </div>

                <div>
                  <label htmlFor="cart-settled-total-amt" className="block text-xs font-black mb-1">
                    Modify Settled Final Total (₹):
                  </label>
                  <input
                    id="cart-settled-total-amt"
                    type="number"
                    min={0}
                    value={settledTotalDraft}
                    onChange={(e) => handleSettledTotalChange(e.target.value)}
                    placeholder={`₹${rawCartTotal}`}
                    className={`w-full px-3 py-1.5 text-sm font-black rounded-lg border-2 ${
                      isLowVision ? 'bg-black text-yellow-300 border-yellow-400' : 'bg-white border-slate-400'
                    }`}
                  />
                </div>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="pt-2 border-t flex items-center justify-between text-xs sm:text-sm font-black">
                <span>Gross Items Total: ₹{money(rawCartTotal)}</span>
                {appliedDiscount > 0 && (
                  <span className="text-rose-600">Less Discount: -₹{money(appliedDiscount)}</span>
                )}
                <span className="text-emerald-700 text-base font-black">
                  Net Settled: ₹{money(finalCartTotal)}
                </span>
              </div>
            </div>
          )}

          {/* WHATSAPP AUTOMATION & PAYMENT SECTION */}
          {cart.items.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* WhatsApp Delivery Option */}
              <div
                className={`p-3 rounded-xl border-2 flex items-center justify-between gap-3 ${
                  isLowVision ? 'bg-gray-900 border-yellow-400 text-yellow-300' : 'bg-slate-50 border-slate-300'
                }`}
              >
                <label className="flex items-center gap-2.5 cursor-pointer font-bold text-xs sm:text-sm">
                  <input
                    type="checkbox"
                    checked={autoSendWhatsApp}
                    onChange={(e) => setAutoSendWhatsApp(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    <MessageCircle size={16} className="text-emerald-600" />
                    <span>Directly send bill through WhatsApp if number available</span>
                  </div>
                </label>
                <span className="text-xs font-semibold opacity-70 truncate max-w-[130px]">
                  {retailerPhone || '(No phone)'}
                </span>
              </div>

              {/* Cash / Amount Paid Today Section with Full or Credit Options */}
              <div
                className={`p-3.5 sm:p-4 rounded-xl border-2 space-y-3 ${
                  isLowVision ? 'bg-gray-900 border-yellow-400 text-yellow-300' : 'bg-slate-50 border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label htmlFor="cart-amount-paid-today" className="block text-xs sm:text-sm font-black">
                    Cash / Amount Paid Today (₹):
                  </label>
                  <span className="text-xs font-bold opacity-75">
                    Net Bill: <span className="font-black">₹{money(finalCartTotal)}</span>
                  </span>
                </div>

                {/* Quick Selection: Full or Credit options (Default: Credit = ₹0) */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Credit Option (Default is Credit = 0) */}
                  <button
                    type="button"
                    id="btn-payment-option-credit"
                    onClick={() => {
                      setAmountPaidDraft('0');
                      if (isLowVision) speakAssistiveText(`Selected Credit. 0 rupees paid today. Rupees ${finalCartTotal} due to pay.`);
                    }}
                    className={`py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm border-2 cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
                      isCredit
                        ? isLowVision
                          ? 'bg-yellow-400 text-black border-yellow-500 shadow-md ring-2 ring-yellow-400'
                          : 'bg-amber-600 text-white border-amber-700 shadow-md ring-2 ring-amber-300'
                        : isLowVision
                        ? 'bg-black text-yellow-300 border-yellow-400/50 hover:bg-gray-800'
                        : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-50'
                    }`}
                  >
                    <Clock size={16} className="shrink-0" />
                    <span>Credit / Udhaar (₹0)</span>
                    {isCredit && (
                      <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-black/20 ml-0.5">
                        Default
                      </span>
                    )}
                  </button>

                  {/* Full Payment Option */}
                  <button
                    type="button"
                    id="btn-payment-option-full"
                    onClick={() => {
                      setAmountPaidDraft(String(finalCartTotal));
                      if (isLowVision) speakAssistiveText(`Selected Full Cash. Rupees ${finalCartTotal} paid today. 0 due.`);
                    }}
                    className={`py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm border-2 cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
                      isFull
                        ? isLowVision
                          ? 'bg-yellow-400 text-black border-yellow-500 shadow-md ring-2 ring-yellow-400'
                          : 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-300'
                        : isLowVision
                        ? 'bg-black text-yellow-300 border-yellow-400/50 hover:bg-gray-800'
                        : 'bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    <CheckCircle2 size={16} className="shrink-0" />
                    <span>Full Cash (₹{money(finalCartTotal)})</span>
                    {isFull && (
                      <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-black/20 ml-0.5">
                        Active
                      </span>
                    )}
                  </button>
                </div>

                {/* Custom / Partial Payment Input */}
                <div>
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="font-bold opacity-80">
                      Or enter custom / partial payment (₹):
                    </span>
                    {isPartial && (
                      <span className="text-[11px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                        Partial Payment
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black opacity-60">₹</span>
                    <input
                      id="cart-amount-paid-today"
                      type="number"
                      min={0}
                      step="any"
                      value={amountPaidDraft}
                      onChange={(e) => setAmountPaidDraft(e.target.value)}
                      placeholder="0"
                      className={`w-full pl-8 pr-3 py-2 text-base font-black rounded-lg border-2 ${
                        isLowVision ? 'bg-black text-yellow-300 border-yellow-400' : 'bg-white border-slate-400 text-slate-900'
                      }`}
                    />
                  </div>
                </div>

                {/* Live Payment & Balance Due Breakdown */}
                <div
                  className={`p-3 rounded-lg border-2 flex items-center justify-between gap-3 text-xs sm:text-sm font-black ${
                    balanceDue > 0
                      ? isLowVision
                        ? 'bg-black border-yellow-400 text-yellow-300'
                        : 'bg-amber-50 border-amber-300 text-amber-950'
                      : isLowVision
                      ? 'bg-black border-yellow-400 text-yellow-300'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {balanceDue > 0 ? (
                      <AlertCircle size={18} className="text-amber-700 shrink-0" />
                    ) : (
                      <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />
                    )}
                    <div>
                      <div>
                        {balanceDue > 0 ? 'Due to Pay (Balance on Credit):' : 'Full Payment Settled:'}
                      </div>
                      <div className="text-[11px] font-bold opacity-75">
                        Amount Paid Today: ₹{money(numericPaid)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-base sm:text-lg font-black ${balanceDue > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                      {balanceDue > 0 ? `₹${money(balanceDue)} Due` : '₹0 Due'}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider font-bold opacity-70">
                      {isCredit ? 'Credit / Udhaar' : isFull ? 'Paid in Full' : 'Partial Paid'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Footer Actions */}
        <div
          className={`p-3 sm:p-4 border-t-2 flex flex-col sm:flex-row items-center justify-between gap-3 ${
            isLowVision ? 'bg-gray-950 border-yellow-400' : 'bg-slate-100 border-slate-300'
          }`}
          style={{ paddingBottom: 'max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
        >
          {isBrowsingBeverages ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
              <div className="text-xs sm:text-sm font-bold flex items-center gap-2 flex-wrap">
                <span>Selected:</span>
                <span className="font-black text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
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
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  id="btn-modal-add-more-beverages"
                  onClick={() => {
                    setIsBrowsingBeverages(true);
                    if (isLowVision) speakAssistiveText('Opening beverage catalog to add more items.');
                  }}
                  className={`flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 rounded-xl font-black text-sm border-2 cursor-pointer flex items-center justify-center gap-2 transition-colors ${
                    isLowVision
                      ? 'bg-black text-yellow-300 border-yellow-400 hover:bg-gray-900'
                      : 'bg-white text-slate-800 border-slate-400 hover:bg-slate-200'
                  }`}
                >
                  <Plus size={16} />
                  <span>Add More Beverages</span>
                </button>

                {onCancelSale && (
                  <button
                    type="button"
                    id="btn-modal-cancel-sale"
                    onClick={() => {
                      onCancelSale();
                      onClose();
                    }}
                    className={`min-h-[44px] px-3.5 py-2.5 rounded-xl font-black text-xs sm:text-sm border-2 cursor-pointer transition-colors ${
                      isLowVision
                        ? 'border-rose-400 text-rose-300 bg-black hover:bg-rose-950'
                        : 'border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100'
                    }`}
                    title="Cancel sale sequence and clear cart"
                  >
                    Cancel Sale
                  </button>
                )}
              </div>

              <button
                type="button"
                id="btn-finalize-from-cart-modal"
                disabled={cart.items.length === 0 || !selectedRetailer.trim()}
                onClick={() => {
                  onFinalize();
                }}
                className={`w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl font-black text-base border-2 shadow-lg cursor-pointer flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  isLowVision
                    ? 'bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-500'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                }`}
              >
                <CheckCircle2 size={20} />
                <span>
                  Finalize Van Sale (₹{money(finalCartTotal)})
                  {balanceDue > 0 && (
                    <span className="text-xs font-bold opacity-90 block sm:inline sm:ml-1.5">
                      • ₹{money(balanceDue)} Due
                    </span>
                  )}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
