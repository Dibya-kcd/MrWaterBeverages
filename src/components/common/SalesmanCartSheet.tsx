import { useLanguage } from '../../i18n/LanguageContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  MessageCircle,
  MoreVertical,
  Mic,
  Pencil,
  Percent,
  Plus,
  Minus,
  Store,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { SizeChip } from './SizeChip';
import { sizeTheme } from '../../utils/sizeColor';
import { money } from '../../utils/billing';
import { getProductOdiaName, getCustomerOdiaName } from '../../utils/displayName';
import type { BillItem, ExistingCustomer, PriceType, Product, Trip } from '../../types';

/** Same props as the desktop SalesmanCartModal so the parent does not change. */
export interface SalesmanCartSheetProps {
  isOpen: boolean;
  onClose: () => void;
  cart: { items: BillItem[] };
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

type PayMode = 'credit' | 'partial' | 'full';

const WALK_IN = 'Spot Cash / Walk-in Customer';

export const SalesmanCartSheet: React.FC<SalesmanCartSheetProps> = ({
  isOpen,
  onClose,
  cart,
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
  isPriceLocked = false,
}) => {
  const { isOdia } = useLanguage();

  const [editingKey, setEditingKey] = useState<string | number | null>(null);
  const [rateDraft, setRateDraft] = useState('');
  const [lineDiscountDraft, setLineDiscountDraft] = useState('');
  const [showDiscount, setShowDiscount] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [payMode, setPayMode] = useState<PayMode>('credit');
  const menuRef = useRef<HTMLDivElement | null>(null);

  const rawCartTotal = cart.items.reduce((s, it) => s + it.amount, 0);
  const appliedDiscount = Number(invoiceDiscountDraft) || 0;
  const finalCartTotal = Math.max(0, rawCartTotal - appliedDiscount);
  const totalCases = cart.items.reduce((s, it) => s + it.qty, 0);
  const numericPaid = amountPaidDraft !== '' ? Math.max(0, Number(amountPaidDraft) || 0) : 0;
  const balanceDue = Math.max(0, finalCartTotal - numericPaid);

  // Default payment is credit (₹0); the parent expects a '0' string rather than empty
  useEffect(() => {
    if (isOpen && (amountPaidDraft === '' || amountPaidDraft === undefined)) setAmountPaidDraft('0');
  }, [isOpen, amountPaidDraft, setAmountPaidDraft]);

  // Opening the sheet: pick the mode that matches what is already in the draft
  useEffect(() => {
    if (!isOpen) return;
    const paid = Number(amountPaidDraft) || 0;
    if (paid <= 0) setPayMode('credit');
    else if (finalCartTotal > 0 && paid >= finalCartTotal) setPayMode('full');
    else setPayMode('partial');
    setShowDiscount(appliedDiscount > 0);
    setEditingKey(null);
    setMenuOpen(false);
    setConfirmCancel(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Keep "Full cash" equal to the total when items / discount change afterwards
  useEffect(() => {
    if (payMode === 'full' && String(finalCartTotal) !== amountPaidDraft) {
      setAmountPaidDraft(String(finalCartTotal));
    }
  }, [payMode, finalCartTotal, amountPaidDraft, setAmountPaidDraft]);

  // Close the ⋮ menu on outside tap
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [menuOpen]);

  // Lock background scroll while the full-screen sheet is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const startEdit = (item: BillItem) => {
    setEditingKey(item.key);
    setRateDraft(String(item.rate));
    setLineDiscountDraft(item.discount ? String(item.discount) : '');
  };

  const saveEdit = (item: BillItem) => {
    if (!isPriceLocked) {
      const r = Number(rateDraft);
      if (!isNaN(r) && r >= 0 && r !== item.rate) onUpdateRate(item.key, r);
    }
    const d = Math.max(0, Number(lineDiscountDraft) || 0);
    if (d !== (item.discount || 0)) onUpdateDiscount(item.key, d);
    setEditingKey(null);
  };

  const pickMode = (mode: PayMode) => {
    setPayMode(mode);
    if (mode === 'credit') setAmountPaidDraft('0');
    else if (mode === 'full') setAmountPaidDraft(String(finalCartTotal));
    else if (Number(amountPaidDraft) <= 0 || Number(amountPaidDraft) >= finalCartTotal) setAmountPaidDraft('0');
  };

  const dueLabel = useMemo(() => {
    if (balanceDue <= 0) return 'paid in full';
    if (numericPaid <= 0) return 'on credit';
    return 'due';
  }, [balanceDue, numericPaid]);

  const canFinalize = cart.items.length > 0 && selectedRetailer.trim() !== '';
  const isWalkIn = selectedRetailer === WALK_IN;

  if (!isOpen) return null;

  const modeBtn = (mode: PayMode, label: string, icon: React.ReactNode, activeCls: string) => (
    <button
      type="button"
      id={`btn-pay-mode-${mode}`}
      onClick={() => pickMode(mode)}
      aria-pressed={payMode === mode}
      className={`flex-1 min-h-[44px] rounded-xl border-2 text-sm font-black flex items-center justify-center gap-1.5 transition-colors ${
        payMode === mode ? activeCls : 'bg-white border-slate-200 text-slate-700 active:bg-slate-50'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div
      id="salesman-cart-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Cart"
      className="fixed inset-0 z-50 flex flex-col bg-slate-100"
    >
      {/* HEADER: back · title + counts · total · menu */}
      <header
        className="bg-[#0B3D32] text-white shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-2 px-2 py-2.5">
          <button
            type="button"
            id="btn-close-cart-sheet"
            onClick={onClose}
            className="size-11 rounded-xl flex items-center justify-center active:bg-white/10"
            aria-label="Back to products"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-base font-black leading-tight">{isOdia ? 'କାର୍ଟ (Cart)' : 'Cart'}</div>
            <div className="text-[11px] font-semibold text-emerald-100/90 truncate">
              {cart.items.length} {isOdia ? 'ଆଇଟମ୍' : (cart.items.length === 1 ? 'item' : 'items')} · {totalCases} {isOdia ? 'କେସ୍' : (totalCases === 1 ? 'case' : 'cases')}
              {activeTrip?.vehicle ? ` · ${activeTrip.vehicle}` : ''}
            </div>
          </div>
          <div
            className="px-3 py-1.5 rounded-xl bg-white text-[#0B3D32] text-lg font-black leading-none"
            aria-live="polite"
          >
            ₹{money(finalCartTotal)}
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              id="btn-cart-menu"
              onClick={() => setMenuOpen((v) => !v)}
              className="size-11 rounded-xl flex items-center justify-center active:bg-white/10"
              aria-label="More actions"
              aria-expanded={menuOpen}
            >
              <MoreVertical size={20} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-60 rounded-xl bg-white text-slate-900 shadow-2xl border border-slate-200 overflow-hidden z-10">
                {!isWalkIn && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRetailer(WALK_IN);
                      setRetailerPhone('');
                      setMenuOpen(false);
                    }}
                    className="w-full min-h-[48px] px-4 text-left text-sm font-bold flex items-center gap-2.5 active:bg-slate-100"
                  >
                    <Zap size={16} className="text-amber-600" />
                    Spot cash / walk-in
                  </button>
                )}
                {!isOdia && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onVoiceSearchCustomer();
                  }}
                  className="w-full min-h-[48px] px-4 text-left text-sm font-bold flex items-center gap-2.5 active:bg-slate-100 border-t border-slate-100"
                >
                  <Mic size={16} className={isVoiceSearching ? 'text-rose-600' : 'text-sky-700'} />
                  {isVoiceSearching ? 'Listening…' : 'Find customer by voice'}
                </button>
                )}
                {onCancelSale && (
                  <button
                    type="button"
                    id="btn-cart-menu-cancel"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmCancel(true);
                    }}
                    className="w-full min-h-[48px] px-4 text-left text-sm font-black text-rose-700 flex items-center gap-2.5 active:bg-rose-50 border-t border-slate-100"
                  >
                    <X size={16} />
                    Cancel sale
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* SCROLLING BODY */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Customer strip */}
        <div className="bg-white border-b border-slate-200 px-3 py-2.5 flex items-center gap-3">
          <div className="size-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
            <Store size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-slate-900 truncate">{selectedRetailer || (isOdia ? 'ଗ୍ରାହକ ବାଛନ୍ତୁ' : 'Choose customer')}</div>
            {isOdia && (
              <div className="text-xs font-bold text-sky-800 font-odia truncate mt-0.5">
                {selectedRetailer === WALK_IN || !selectedRetailer
                  ? 'ସ୍ପଟ୍ କ୍ୟାଶ୍ / ୱାକ୍-ଇନ୍ ଗ୍ରାହକ'
                  : getCustomerOdiaName(selectedRetailer, customers || [])}
              </div>
            )}
            <div className="text-xs font-semibold text-slate-500 truncate">
              {retailerPhone
                ? `${retailerPhone}${autoSendWhatsApp ? ' · bill sent on WhatsApp' : ''}`
                : isWalkIn
                ? (isOdia ? 'ୱାକ୍-ଇନ୍ ବିକ୍ରି' : 'Walk-in sale')
                : (isOdia ? 'ଫୋନ୍ ନମ୍ବର ନାହିଁ' : 'No phone number')}
            </div>
          </div>
          <button
            type="button"
            id="btn-cart-change-customer"
            onClick={onOpenCustomerDirectory}
            className="min-h-[40px] px-3.5 rounded-xl border-2 border-sky-200 text-sky-700 text-sm font-black active:bg-sky-50 flex items-center gap-1.5"
          >
            <Users size={14} />
            Change
          </button>
        </div>

        <div className="p-3 space-y-2.5">
          {lastFinalizedWhatsApp && (
            <a
              href={lastFinalizedWhatsApp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl border-2 border-emerald-400 bg-emerald-50 text-emerald-950 flex items-center gap-2.5 font-black text-sm"
            >
              <MessageCircle size={20} className="text-emerald-700 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Bill #{lastFinalizedWhatsApp.id} ready · open WhatsApp</span>
            </a>
          )}

          {/* ITEM CARDS */}
          {cart.items.length === 0 ? (
            <div className="py-14 text-center border-2 border-dashed border-slate-300 rounded-2xl text-slate-500">
              <p className="text-sm font-bold">No beverages in the cart yet.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 min-h-[44px] px-5 rounded-xl bg-sky-600 text-white text-sm font-black inline-flex items-center gap-2 active:bg-sky-700"
              >
                <Plus size={16} /> Add beverages
              </button>
            </div>
          ) : (
            cart.items.map((item) => {
              const prod = products.find((p) => p.id === item.productId);
              const stock = prod ? getVehicleStock(activeTrip, prod.id) : { available: 999, loaded: 0, sold: 0 };
              const editing = editingKey === item.key;
              const otherTier: PriceType = item.priceType === 'Retail' ? 'Wholesale' : 'Retail';
              const otherRate = prod ? (otherTier === 'Retail' ? prod.retail : prod.wholesale) : 0;

              return (
                <div
                  key={item.key}
                  id={`cart-item-${item.key}`}
                  style={{ borderLeftWidth: 5, borderLeftColor: sizeTheme(prod?.volume, item.productName).hex }}
                  className={`rounded-2xl bg-white shadow-sm px-3 pt-2.5 pb-3 border ${
                    editing ? 'border-sky-500 ring-2 ring-sky-100' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-black text-slate-900 leading-snug break-words">
                        <div>{item.productName}</div>
                        {isOdia && (prod?.nameOr || getProductOdiaName(item.productId || item.productName, products)) && (
                          <div className="text-xs font-bold text-sky-800 font-odia mt-0.5">
                            {prod?.nameOr || getProductOdiaName(item.productId || item.productName, products)}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <SizeChip volume={prod?.volume} pack={prod?.pack} name={item.productName} />
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-black ${
                            item.priceType === 'Retail' ? 'bg-sky-100 text-sky-800' : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {item.priceType}
                        </span>
                        {item.discount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-black bg-rose-100 text-rose-700">
                            −₹{money(item.discount)} disc
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-base font-black text-slate-900 shrink-0">₹{money(item.amount)}</div>
                  </div>

                  {editing ? (
                    <div className="mt-3 space-y-3">
                      <div className={`grid gap-3 ${isPriceLocked ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {!isPriceLocked && (
                          <label className="block">
                            <span className="block text-[11px] font-black text-slate-500 mb-1">Rate / case (₹)</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={rateDraft}
                              onChange={(e) => setRateDraft(e.target.value)}
                              className="w-full h-11 px-3 rounded-xl border-2 border-sky-500 text-lg font-black text-slate-900 bg-white focus:outline-none"
                            />
                          </label>
                        )}
                        <label className="block">
                          <span className="block text-[11px] font-black text-slate-500 mb-1">Line discount (₹)</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={lineDiscountDraft}
                            onChange={(e) => setLineDiscountDraft(e.target.value)}
                            placeholder="0"
                            className="w-full h-11 px-3 rounded-xl border-2 border-slate-300 text-lg font-black text-slate-900 bg-white focus:outline-none focus:border-sky-500"
                          />
                        </label>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        {!isPriceLocked && otherRate > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              onTogglePriceType(item.key, otherTier);
                              setRateDraft(String(otherRate));
                            }}
                            className="min-h-[44px] px-3.5 rounded-full bg-purple-50 text-purple-800 text-sm font-black active:bg-purple-100"
                          >
                            Use {otherTier} · ₹{money(otherRate)}
                          </button>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={() => saveEdit(item)}
                          className="min-h-[44px] px-6 rounded-xl bg-sky-600 text-white text-sm font-black flex items-center gap-1.5 active:bg-sky-700"
                        >
                          <Check size={16} /> Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50 overflow-hidden">
                        <button
                          type="button"
                          id={`btn-qty-minus-${item.key}`}
                          aria-label={`Decrease ${item.productName}`}
                          onClick={() => onUpdateQty(item.key, item.qty - 1)}
                          className="size-11 flex items-center justify-center text-slate-800 active:bg-slate-200"
                        >
                          <Minus size={17} />
                        </button>
                        <div className="min-w-[52px] text-center text-sm font-black text-slate-900">{item.qty} cs</div>
                        <button
                          type="button"
                          id={`btn-qty-plus-${item.key}`}
                          aria-label={`Increase ${item.productName}`}
                          disabled={item.qty >= stock.available}
                          onClick={() => onUpdateQty(item.key, item.qty + 1)}
                          className="size-11 flex items-center justify-center text-slate-800 active:bg-slate-200 disabled:opacity-30"
                        >
                          <Plus size={17} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="min-h-[44px] px-2 flex items-center gap-1.5 text-sm font-black text-slate-800 active:bg-slate-100 rounded-lg"
                        aria-label={`Edit rate and discount for ${item.productName}`}
                      >
                        <span>₹{money(item.rate)}/cs</span>
                        <Pencil size={14} className="text-sky-600" />
                      </button>

                      <span className="ml-auto text-xs font-bold text-slate-400 whitespace-nowrap">Van {stock.available}</span>
                      <button
                        type="button"
                        id={`btn-remove-item-${item.key}`}
                        onClick={() => onRemoveItem(item.key)}
                        className="size-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center active:bg-rose-100"
                        aria-label={`Remove ${item.productName}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Add more / Discount chips */}
          {cart.items.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                id="btn-cart-add-more"
                onClick={onClose}
                className="flex-1 min-h-[48px] rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/60 text-sky-700 text-sm font-black flex items-center justify-center gap-1.5 active:bg-sky-100"
              >
                <Plus size={16} /> Add more beverages
              </button>
              <button
                type="button"
                id="btn-cart-toggle-discount"
                onClick={() => setShowDiscount((v) => !v)}
                aria-expanded={showDiscount}
                className={`min-h-[48px] px-3.5 rounded-xl border-2 text-sm font-black flex items-center gap-1.5 ${
                  showDiscount || appliedDiscount > 0
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <Percent size={15} />
                Discount
                <ChevronDown size={15} className={`transition-transform ${showDiscount ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}

          {/* Bill discount (collapsed until needed) */}
          {cart.items.length > 0 && showDiscount && (
            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-amber-950">Bill discount</span>
                {appliedDiscount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDiscountChange('0')}
                    className="min-h-[36px] px-2 text-sm font-black text-rose-700"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[50, 100, 200].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => applyQuickDiscount(amt, false)}
                    className="min-h-[44px] rounded-xl border-2 border-amber-300 bg-white text-sm font-black text-amber-900 active:bg-amber-100"
                  >
                    −₹{amt}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => applyQuickDiscount(5, true)}
                  className="min-h-[44px] rounded-xl border-2 border-amber-300 bg-white text-sm font-black text-amber-900 active:bg-amber-100"
                >
                  −5%
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[11px] font-black text-amber-900/80 mb-1">Discount (₹)</span>
                  <input
                    id="cart-special-discount-amt"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={invoiceDiscountDraft}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    placeholder="0"
                    className="w-full h-11 px-3 rounded-xl border-2 border-amber-300 bg-white text-lg font-black text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-black text-amber-900/80 mb-1">Final total (₹)</span>
                  <input
                    id="cart-settled-total-amt"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={settledTotalDraft}
                    onChange={(e) => handleSettledTotalChange(e.target.value)}
                    placeholder={String(rawCartTotal)}
                    className="w-full h-11 px-3 rounded-xl border-2 border-amber-300 bg-white text-lg font-black text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Payment */}
          {cart.items.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
              <div className="text-sm font-black text-slate-900">{isOdia ? 'ଆଜିର ପେମେଣ୍ଟ (Payment today)' : 'Payment today'}</div>
              <div className="flex gap-2">
                {modeBtn('credit', isOdia ? 'ବାକି (Credit)' : 'Credit', <Clock size={16} />, 'bg-amber-600 border-amber-600 text-white')}
                {modeBtn('partial', isOdia ? 'କିଛି ପେମେଣ୍ଟ' : 'Partial', null, 'bg-sky-600 border-sky-600 text-white')}
                {modeBtn('full', isOdia ? 'ପୂରା କ୍ୟାଶ୍' : 'Full cash', <CheckCircle2 size={16} />, 'bg-emerald-600 border-emerald-600 text-white')}
              </div>

              {payMode === 'partial' && (
                <div className="flex items-end gap-2">
                  <label className="block flex-1">
                    <span className="block text-[11px] font-black text-slate-500 mb-1">Amount received (₹)</span>
                    <input
                      id="cart-amount-paid-today"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      autoFocus
                      value={amountPaidDraft === '0' ? '' : amountPaidDraft}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAmountPaidDraft(v === '' ? '0' : v);
                      }}
                      placeholder="0"
                      className="w-full h-12 px-3 rounded-xl border-2 border-sky-500 text-xl font-black text-slate-900 bg-white focus:outline-none"
                    />
                  </label>
                  <div className="h-12 px-3 rounded-xl border-2 border-amber-200 bg-amber-50 flex flex-col justify-center min-w-[112px]">
                    <span className="text-[10px] font-black text-amber-800 leading-none">Balance due</span>
                    <span className="text-base font-black text-rose-700 leading-tight">₹{money(balanceDue)}</span>
                  </div>
                </div>
              )}

              <label className="flex items-center justify-between gap-3 min-h-[44px] cursor-pointer">
                <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <MessageCircle size={16} className="text-emerald-600" />
                  Send bill on WhatsApp
                  {!retailerPhone && <span className="text-[11px] font-semibold text-slate-400">(no number)</span>}
                </span>
                <span className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={autoSendWhatsApp}
                    onChange={(e) => setAutoSendWhatsApp(e.target.checked)}
                    className="sr-only peer"
                  />
                  <span className="w-12 h-7 rounded-full bg-slate-300 peer-checked:bg-emerald-500 transition-colors" />
                  <span className="absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                </span>
              </label>
            </div>
          )}
          <div className="h-2" />
        </div>
      </div>

      {/* STICKY FINALIZE BAR */}
      <footer
        className="shrink-0 bg-white border-t border-slate-200 px-3 pt-2 shadow-[0_-6px_16px_rgba(15,23,42,0.06)]"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-2 gap-2">
          <span className="truncate">
            Items ₹{money(rawCartTotal)}
            {appliedDiscount > 0 && (
              <>
                {' · Discount '}
                <span className="text-rose-600 font-black">−₹{money(appliedDiscount)}</span>
              </>
            )}
          </span>
          <span
            className={`shrink-0 font-black ${balanceDue <= 0 ? 'text-emerald-700' : numericPaid > 0 ? 'text-rose-600' : 'text-amber-700'}`}
          >
            {balanceDue <= 0 ? 'Paid in full' : `₹${money(balanceDue)} ${dueLabel}`}
          </span>
        </div>
        <button
          type="button"
          id="btn-finalize-from-cart-modal"
          disabled={!canFinalize}
          onClick={onFinalize}
          className="w-full min-h-[54px] rounded-2xl bg-emerald-600 active:bg-emerald-700 text-white text-base font-black flex items-center justify-center gap-2 shadow-lg disabled:opacity-40"
        >
          <Check size={20} strokeWidth={3} />
          {isOdia ? `ବିଲ୍ ତିଆରି କରନ୍ତୁ · ₹${money(finalCartTotal)}` : `Finalize sale · ₹${money(finalCartTotal)}`}
        </button>
        {!selectedRetailer.trim() && (
          <p className="mt-1.5 text-center text-xs font-bold text-rose-600">
            {isOdia ? 'ବିଲ୍ ତିଆରି ପାଇଁ ଗ୍ରାହକ ବାଛନ୍ତୁ।' : 'Choose a customer to finalize.'}
          </p>
        )}
      </footer>

      {/* Cancel-sale confirmation */}
      {confirmCancel && (
        <div className="absolute inset-0 z-20 bg-black/55 flex items-end">
          <div
            className="w-full bg-white rounded-t-3xl p-5 space-y-4"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="text-base font-black text-slate-900">Cancel this sale?</div>
            <p className="text-sm font-semibold text-slate-600">
              All {cart.items.length} item{cart.items.length === 1 ? '' : 's'} will be cleared from the cart.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="min-h-[48px] rounded-xl border-2 border-slate-300 text-sm font-black text-slate-700 active:bg-slate-100"
              >
                Keep cart
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmCancel(false);
                  onCancelSale?.();
                  onClose();
                }}
                className="min-h-[48px] rounded-xl bg-rose-600 text-white text-sm font-black active:bg-rose-700"
              >
                Yes, cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
