import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  Eye,
  FileText,
  Minus,
  Package,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { CATS } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { Bill, BillItem, ExistingCustomer, PriceType, FontSize } from '../../types';
import {
  billTotals,
  computeLine,
  generateBatchNumber,
  money,
  schemeLabel,
  whatsappLink,
  buildBillText,
} from '../../utils/billing';
import { downloadInvoicePdf } from '../../utils/invoicePdf';
import { speakAssistiveText } from '../../utils/speechRecognition';

interface LowVisionBillingViewProps {
  onOpenInvoiceModal?: (bill: Bill) => void;
  onOpenHistory?: () => void;
}

export const LowVisionBillingView: React.FC<LowVisionBillingViewProps> = ({
  onOpenInvoiceModal,
  onOpenHistory,
}) => {
  const {
    products,
    bills,
    cart,
    setCart,
    finalizeBill,
    remainingStock,
    activePromoFor,
    gstMode,
    setGstMode,
    palette,
    scale,
    fontSize,
    setFontSize,
    highContrast,
    setHighContrast,
    lowVisionMode,
    toggleLowVisionMode,
    lowVisionStickyPosition,
    setLowVisionStickyPosition,
    orgProfile,
    billingSettings,
    warehouses,
    justFinalizedBillId,
    setJustFinalizedBillId,
  } = useLedger();

  // State for single-column stepped invoice creation
  const [selectedRetailer, setSelectedRetailer] = useState<string>('');
  const [retailerPhone, setRetailerPhone] = useState<string>('');
  const [showSearchShops, setShowSearchShops] = useState<boolean>(false);
  const [shopSearchQuery, setShopSearchQuery] = useState<string>('');
  const [customShopName, setCustomShopName] = useState<string>('');

  // Product Selection
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Quantity Stepper (No keyboard by default)
  const [quantity, setQuantity] = useState<number>(1);

  // Sale Type (Wholesale / Retail)
  const [priceType, setPriceType] = useState<PriceType>(
    billingSettings?.defaultSaleType || 'Wholesale'
  );

  // Collapsible "More Details"
  const [showMoreDetails, setShowMoreDetails] = useState<boolean>(false);
  const [invoiceDate, setInvoiceDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [dispatchWarehouseId, setDispatchWarehouseId] = useState<string>(
    warehouses[0]?.id || ''
  );
  const [customRate, setCustomRate] = useState<string>('');
  const [applyScheme, setApplyScheme] = useState<boolean>(
    billingSettings?.autoApplyPromotions ?? true
  );

  // Quick Feedback Announcement
  const [feedbackBanner, setFeedbackBanner] = useState<{
    id: string;
    text: string;
    subText?: string;
  } | null>(null);

  // Partial Payment on Finalizing
  const [amountPaidDraft, setAmountPaidDraft] = useState<string>('');
  const [isFinishing, setIsFinishing] = useState<boolean>(false);

  const cartListRef = useRef<HTMLDivElement>(null);

  // Running calculations
  const totals = useMemo(() => billTotals(cart.items, gstMode), [cart.items, gstMode]);
  const totalItemUnits = useMemo(
    () => cart.items.reduce((sum, it) => sum + (it.qty || 0), 0),
    [cart.items]
  );

  const hasInitializedRetailer = useRef(false);
  // Initialize retailer from cart if cart has existing retailer on initial load
  useEffect(() => {
    if (!hasInitializedRetailer.current && cart.retailer && !selectedRetailer) {
      setSelectedRetailer(cart.retailer);
      if (cart.phone) setRetailerPhone(cart.phone);
      hasInitializedRetailer.current = true;
    }
  }, [cart.retailer, cart.phone, selectedRetailer]);

  // Derive top frequent shops from past bills + reliable depot fallbacks
  const quickSelectShops: ExistingCustomer[] = useMemo(() => {
    const map = new Map<string, ExistingCustomer>();

    for (const b of bills) {
      const norm = (b.retailer || '').trim();
      if (!norm) continue;
      const key = norm.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          name: norm,
          phone: b.phone || '',
          totalBills: 1,
          totalBilled: b.total || 0,
          totalPaid: b.amountPaid || 0,
          balanceDue: Math.max(0, (b.total || 0) - (b.amountPaid || 0)),
          lastBillDate: b.date || '',
        });
      } else {
        existing.totalBills += 1;
        existing.totalBilled += b.total || 0;
        existing.totalPaid += b.amountPaid || 0;
        existing.balanceDue += Math.max(0, (b.total || 0) - (b.amountPaid || 0));
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) => b.totalBills - a.totalBills);

    // Fallbacks so there are always at least 4-6 high-accessibility quick tap buttons ready
    const defaults: ExistingCustomer[] = [
      { name: 'Shiv Shakti Kirana', phone: '9822012345', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Mahalaxmi Super Market', phone: '9822023456', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Sai General Store', phone: '9822034567', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Ganesh Daily Needs', phone: '9822045678', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Krishna Cold Drinks', phone: '9822056789', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Radha Trading Co', phone: '9822067890', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
    ];

    const result: ExistingCustomer[] = [...sorted];
    for (const d of defaults) {
      if (result.length >= 6) break;
      if (!result.some((r) => r.name.toLowerCase() === d.name.toLowerCase())) {
        result.push(d);
      }
    }

    return result.slice(0, 6);
  }, [bills]);

  // Filtered shops list for search modal/section
  const filteredAllShops = useMemo(() => {
    const q = shopSearchQuery.trim().toLowerCase();
    const map = new Map<string, ExistingCustomer>();

    for (const b of bills) {
      const norm = (b.retailer || '').trim();
      if (!norm) continue;
      const key = norm.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          name: norm,
          phone: b.phone || '',
          totalBills: 1,
          totalBilled: b.total || 0,
          totalPaid: b.amountPaid || 0,
          balanceDue: Math.max(0, (b.total || 0) - (b.amountPaid || 0)),
          lastBillDate: b.date || '',
        });
      }
    }

    // Include quick shops too
    for (const qShop of quickSelectShops) {
      if (!map.has(qShop.name.toLowerCase())) {
        map.set(qShop.name.toLowerCase(), qShop);
      }
    }

    const list = Array.from(map.values());
    if (!q) return list;
    return list.filter(
      (s) => s.name.toLowerCase().includes(q) || s.phone.includes(q)
    );
  }, [bills, quickSelectShops, shopSearchQuery]);

  // Selected product object
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  // Filtered products list
  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category === selectedCategory);
    }
    const q = productSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.pack && p.pack.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q))
      );
    }
    return list;
  }, [products, selectedCategory, productSearchQuery]);

  // Default selected product to first available if none selected
  useEffect(() => {
    if (selectedProductId === null && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  // Stepper handlers
  const handleDecrement = () => {
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const handleIncrement = () => {
    setQuantity((prev) => prev + 1);
  };

  const handleAddQuantityPreset = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta));
  };

  // Font size bump helper: A- / A+
  const handleBumpFontSize = (direction: 'up' | 'down') => {
    const scales: FontSize[] = ['standard', 'large', 'xlarge'];
    const currIdx = scales.indexOf(fontSize);
    if (direction === 'up' && currIdx < scales.length - 1) {
      setFontSize(scales[currIdx + 1]);
    } else if (direction === 'down' && currIdx > 0) {
      setFontSize(scales[currIdx - 1]);
    }
  };

  // Add Item to Bill
  const handleAddLineToCart = () => {
    if (!selectedRetailer) {
      setFeedbackBanner({
        id: `err-${Date.now()}`,
        text: '⚠️ Please select a Retailer/Shop first!',
        subText: 'Tap one of the large shop buttons above.',
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!selectedProduct) {
      setFeedbackBanner({
        id: `err-${Date.now()}`,
        text: '⚠️ Please select a Product to add!',
      });
      return;
    }

    if (!quantity || quantity <= 0) {
      setQuantity(1);
      return;
    }

    const promo = applyScheme ? activePromoFor(selectedProduct.id) : null;
    const computed = computeLine(
      selectedProduct,
      priceType,
      quantity,
      promo,
      customRate
    );

    const newItem: BillItem = {
      key: `${selectedProduct.id}-${Date.now()}-${Math.random()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      category: selectedProduct.category,
      gst:
        selectedProduct.gstRate !== undefined
          ? selectedProduct.gstRate
          : CATS[selectedProduct.category]?.gst ?? 12,
      priceType,
      qty: quantity,
      rate: computed.rate,
      gross: computed.gross,
      freeQty: computed.freeQty,
      chargeableQty: computed.chargeableQty,
      discount: computed.discount,
      amount: computed.amount,
      promoLabel: promo ? schemeLabel(promo) : null,
      schemeSkipped: !applyScheme && Boolean(activePromoFor(selectedProduct.id)),
      batchNumber:
        selectedProduct.batchNumber || generateBatchNumber(selectedProduct.name),
      hsn: selectedProduct.hsn || CATS[selectedProduct.category]?.hsn || '2202',
      expiryDate: selectedProduct.expiry,
      warehouseId: dispatchWarehouseId || selectedProduct.warehouseId,
    };

    // Update cart
    setCart((prev) => ({
      ...prev,
      retailer: selectedRetailer,
      phone: retailerPhone,
      date: invoiceDate,
      warehouseId: dispatchWarehouseId,
      items: [...prev.items, newItem],
    }));

    // Trigger visual feedback banner
    const addedText = `Added: ${selectedProduct.name} x ${quantity} cs (₹${money(computed.amount)})`;
    setFeedbackBanner({
      id: `add-${Date.now()}`,
      text: addedText,
      subText: promo ? `🎁 Applied promo: ${schemeLabel(promo)}` : undefined,
    });

    // Reset quantity to 1 for next item, keep retailer intact
    setQuantity(1);
    setCustomRate('');

    // Scroll slightly down to acknowledge if needed
    setTimeout(() => {
      setFeedbackBanner((current) => (current?.text === addedText ? null : current));
    }, 4500);
  };

  // Remove line from cart
  const handleRemoveCartItem = (key: string | number) => {
    setCart((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.key !== key),
    }));
  };

  // Stepper on cart item
  const handleUpdateCartItemQty = (key: string | number, delta: number) => {
    setCart((prev) => {
      const items = prev.items.map((it) => {
        if (it.key !== key) return it;
        const prod = products.find((p) => p.id === it.productId);
        if (!prod) return it;
        const newQty = Math.max(1, it.qty + delta);
        const promo = it.promoLabel ? activePromoFor(it.productId) : null;
        const computed = computeLine(prod, it.priceType, newQty, promo, it.rate);
        return {
          ...it,
          qty: newQty,
          gross: computed.gross,
          freeQty: computed.freeQty,
          chargeableQty: computed.chargeableQty,
          discount: computed.discount,
          amount: computed.amount,
        };
      });
      return { ...prev, items };
    });
  };

  // Finish and Save Sale
  const handleFinishSale = () => {
    if (!selectedRetailer || cart.items.length === 0) return;

    setIsFinishing(true);
    const paidAmount = amountPaidDraft !== '' ? Number(amountPaidDraft) : totals.total;

    setCart((prev) => ({
      ...prev,
      retailer: selectedRetailer,
      phone: retailerPhone,
      date: invoiceDate,
      warehouseId: dispatchWarehouseId,
    }));

    finalizeBill(paidAmount);

    // Reset local view state for next sale
    setSelectedRetailer('');
    setRetailerPhone('');
    setQuantity(1);
    setAmountPaidDraft('');
    setIsFinishing(false);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Just finalized bill
  const justBill = useMemo(() => {
    if (!justFinalizedBillId) return null;
    return bills.find((b) => b.id === justFinalizedBillId) || null;
  }, [justFinalizedBillId, bills]);

  // High contrast palette tokens
  const bgCanvas = '#FFFFFF';
  const textDark = '#000000';
  const borderThick = '3px solid #000000';

  return (
    <div
      id="low-vision-billing-container"
      className="w-full max-w-2xl mx-auto pb-32 text-black"
      style={{
        backgroundColor: bgCanvas,
        color: textDark,
      }}
    >
      {/* 1. Header Toolbar with Mode Indicator, Contrast, & Font Size Stepper */}
      <div
        id="low-vision-top-control-bar"
        className="p-4 mb-4 border-b-4 border-black bg-black text-white flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40 shadow-md"
      >
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center font-black">
            <Eye size={22} aria-hidden="true" />
          </div>
          <div>
            <div className="text-lg sm:text-xl font-black tracking-tight leading-none uppercase">
              Low Vision Mode
            </div>
            <div className="text-xs font-semibold text-yellow-300 mt-0.5">
              Simplified Tap-First Sales Layout
            </div>
          </div>
        </div>

        {/* Quick controls: A- / A+ and Switch to Standard Layout */}
        <div className="flex items-center gap-2">
          {/* A- / A+ Stepper */}
          <div className="flex items-center border-2 border-white rounded overflow-hidden bg-white/10">
            <button
              type="button"
              id="btn-lv-font-down"
              onClick={() => handleBumpFontSize('down')}
              disabled={fontSize === 'standard'}
              aria-label="Decrease text size"
              title="Decrease text size"
              className="px-3 py-2 text-base font-black hover:bg-white hover:text-black cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              A-
            </button>
            <div className="px-2 font-mono font-bold text-xs uppercase border-x border-white/30 text-yellow-300">
              {fontSize === 'standard' ? '1x' : fontSize === 'large' ? '1.25x' : '1.55x'}
            </div>
            <button
              type="button"
              id="btn-lv-font-up"
              onClick={() => handleBumpFontSize('up')}
              disabled={fontSize === 'xlarge'}
              aria-label="Increase text size"
              title="Increase text size"
              className="px-3 py-2 text-base font-black hover:bg-white hover:text-black cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              A+
            </button>
          </div>

          {/* Toggle back to Standard Mode */}
          <button
            type="button"
            id="btn-exit-low-vision"
            onClick={toggleLowVisionMode}
            title="Switch back to standard billing layout"
            className="px-3 py-2 text-sm font-black border-2 border-white bg-white text-black hover:bg-yellow-300 cursor-pointer rounded transition-all leading-tight shadow-sm"
            style={{ minHeight: '44px' }}
          >
            Standard Layout ➔
          </button>
        </div>
      </div>

      {/* Persistent Sticky Running Total Bar (if configured at 'top') */}
      {lowVisionStickyPosition === 'top' && (
        <div
          id="sticky-running-total-top"
          className="sticky top-[68px] z-30 mb-4 p-4 bg-yellow-300 text-black border-b-4 border-black shadow-lg flex items-center justify-between"
        >
          <div>
            <div className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingCart size={18} />
              <span>Current Bill Items: {cart.items.length} ({totalItemUnits} cases)</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black leading-none mt-0.5">
              Total: ₹{money(totals.total)}
            </div>
          </div>
          {cart.items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                cartListRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-4 py-2.5 bg-black text-white font-black text-sm rounded border-2 border-black cursor-pointer hover:bg-slate-800"
              style={{ minHeight: '44px' }}
            >
              View Items ({cart.items.length}) ↓
            </button>
          )}
        </div>
      )}

      {/* Success banner if a bill was just saved */}
      {justBill && (
        <div
          id="lv-just-finalized-card"
          className="p-5 mb-6 border-4 border-black bg-emerald-100 text-black shadow-md rounded-none"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-emerald-700 text-white flex items-center justify-center font-black">
              <Check size={26} />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black">
                Bill #{billingSettings?.invoicePrefix ? `${billingSettings.invoicePrefix}-` : ''}{justBill.id} Saved!
              </div>
              <div className="text-base font-bold text-slate-800">
                {justBill.retailer} • Total: ₹{money(justBill.total)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <button
              type="button"
              id="btn-lv-download-pdf"
              onClick={() => downloadInvoicePdf(justBill, orgProfile, billingSettings)}
              className="w-full py-3.5 px-4 text-center font-black text-base border-3 border-black bg-black text-white hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer"
              style={{ minHeight: '56px' }}
            >
              <Download size={20} />
              Download PDF
            </button>

            <button
              type="button"
              id="btn-lv-print-modal"
              onClick={() => {
                if (onOpenInvoiceModal) onOpenInvoiceModal(justBill);
              }}
              className="w-full py-3.5 px-4 text-center font-black text-base border-3 border-black bg-white text-black hover:bg-slate-100 flex items-center justify-center gap-2 cursor-pointer"
              style={{ minHeight: '56px' }}
            >
              <Printer size={20} />
              Print Invoice
            </button>

            <a
              id="btn-lv-whatsapp"
              href={whatsappLink(justBill.phone, buildBillText(justBill, orgProfile, billingSettings))}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-4 text-center font-black text-base border-3 border-black bg-green-600 text-white hover:bg-green-700 flex items-center justify-center gap-2 cursor-pointer"
              style={{ minHeight: '56px' }}
            >
              <Phone size={20} />
              WhatsApp Bill
            </a>
          </div>

          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={() => setJustFinalizedBillId(null)}
              className="text-sm font-black underline text-slate-800 cursor-pointer"
            >
              Dismiss Notice ✕
            </button>
          </div>
        </div>
      )}

      {/* Real-time Confirmation Announcement after each item addition */}
      {feedbackBanner && (
        <div
          id="lv-feedback-banner"
          role="status"
          aria-live="polite"
          className="p-4 mb-6 border-4 border-black bg-yellow-300 text-black shadow-lg flex items-center justify-between gap-3 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 size={32} className="text-black shrink-0" aria-hidden="true" />
            <div>
              <div className="text-xl sm:text-2xl font-black leading-tight">
                {feedbackBanner.text}
              </div>
              {feedbackBanner.subText && (
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {feedbackBanner.subText}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-2 border-2 border-black bg-white text-black font-black hover:bg-black hover:text-white cursor-pointer rounded"
            aria-label="Close message"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Stepped Single-Column Form */}
      <div className="space-y-6 px-3 sm:px-0">
        {/* ========================================================= */}
        {/* STEP 1: SELECT RETAILER / SHOP                           */}
        {/* ========================================================= */}
        <section
          id="step-1-retailer"
          className="border-4 border-black p-5 bg-white shadow-md"
          aria-labelledby="heading-step-1"
        >
          <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b-2 border-black">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-black text-white font-black flex items-center justify-center text-lg">
                1
              </span>
              <h2 id="heading-step-1" className="text-xl sm:text-2xl font-black uppercase tracking-tight">
                Select Retailer / Shop
              </h2>
            </div>
            {selectedRetailer && (
              <span className="px-2.5 py-1 bg-emerald-200 border-2 border-black text-xs font-black uppercase flex items-center gap-1">
                <Check size={16} /> Selected
              </span>
            )}
          </div>

          {/* Currently Selected Retailer display */}
          {selectedRetailer ? (
            <div className="p-4 mb-4 border-3 border-black bg-slate-100 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-600 uppercase">Selected Party:</div>
                <div className="text-2xl sm:text-3xl font-black text-black">
                  {selectedRetailer}
                </div>
                {retailerPhone && (
                  <div className="text-sm font-bold text-slate-700 flex items-center gap-1 mt-0.5">
                    <Phone size={14} /> WhatsApp: {retailerPhone}
                  </div>
                )}
              </div>
              <button
                type="button"
                id="btn-change-retailer"
                onClick={() => {
                  setSelectedRetailer('');
                  setRetailerPhone('');
                  setCart((prev) => ({ ...prev, retailer: '', phone: '' }));
                  setShowSearchShops(true);
                  setShopSearchQuery('');
                  speakAssistiveText('Select new shop from list or search below.');
                  setTimeout(() => {
                    document.getElementById('input-lv-search-shop')?.focus();
                  }, 50);
                }}
                className="px-4 py-2 text-sm font-black border-2 border-black bg-white hover:bg-black hover:text-white cursor-pointer transition-colors"
                style={{ minHeight: '44px' }}
              >
                Change Shop
              </button>
            </div>
          ) : (
            <p className="text-base font-bold text-slate-700 mb-3">
              Tap a shop below to start billing:
            </p>
          )}

          {/* Top 4-6 Quick Select Shop Buttons (min height 56px, full width) */}
          <div className="grid grid-cols-1 gap-2.5 mb-4">
            {quickSelectShops.map((shop) => {
              const isSelected = selectedRetailer === shop.name;
              return (
                <button
                  key={shop.name}
                  type="button"
                  id={`btn-shop-${shop.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  onClick={() => {
                    setSelectedRetailer(shop.name);
                    if (shop.phone) setRetailerPhone(shop.phone);
                    setCart((prev) => ({ ...prev, retailer: shop.name, phone: shop.phone || prev.phone }));
                    setShowSearchShops(false);
                    speakAssistiveText(`Selected ${shop.name}`);
                  }}
                  aria-pressed={isSelected}
                  className={`w-full p-3.5 text-left border-3 border-black font-black flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-black text-white shadow-inner ring-4 ring-yellow-400'
                      : 'bg-white text-black hover:bg-yellow-100 active:bg-yellow-200'
                  }`}
                  style={{ minHeight: '56px' }}
                >
                  <div className="flex items-center gap-3">
                    <Store size={22} className={isSelected ? 'text-yellow-400' : 'text-slate-800'} />
                    <div>
                      <div className="text-lg sm:text-xl font-black leading-tight">
                        {shop.name}
                      </div>
                      {shop.phone && (
                        <div
                          className={`text-xs font-semibold ${
                            isSelected ? 'text-slate-300' : 'text-slate-600'
                          }`}
                        >
                          Ph: {shop.phone}
                        </div>
                      )}
                    </div>
                  </div>
                  {isSelected ? (
                    <span className="w-8 h-8 rounded-full bg-yellow-400 text-black flex items-center justify-center font-black">
                      ✓
                    </span>
                  ) : (
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Tap to select
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* "Search all shops" button */}
          {!showSearchShops ? (
            <button
              type="button"
              id="btn-search-all-shops-toggle"
              onClick={() => setShowSearchShops(true)}
              className="w-full py-3.5 px-4 text-center font-black text-base border-3 border-dashed border-black bg-slate-50 hover:bg-slate-100 text-black flex items-center justify-center gap-2 cursor-pointer"
              style={{ minHeight: '56px' }}
            >
              <Search size={20} />
              Search All Shops or Enter New Shop Name
            </button>
          ) : (
            <div className="p-4 border-3 border-black bg-slate-50 mt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-base font-black uppercase">Search or Add Shop</span>
                <button
                  type="button"
                  onClick={() => setShowSearchShops(false)}
                  className="text-xs font-bold underline text-slate-700 cursor-pointer"
                >
                  Close Search ✕
                </button>
              </div>

              {/* Big Text Search Input */}
              <input
                type="text"
                id="input-lv-search-shop"
                value={shopSearchQuery}
                onChange={(e) => setShopSearchQuery(e.target.value)}
                placeholder="Type shop name or phone..."
                className="w-full p-3 text-lg font-bold border-3 border-black bg-white text-black mb-3 focus:outline-none focus:ring-4 focus:ring-yellow-400"
                style={{ minHeight: '52px' }}
              />

              {/* Filtered list of matching shops */}
              <div className="max-h-60 overflow-y-auto space-y-2 mb-3">
                {filteredAllShops.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => {
                      setSelectedRetailer(s.name);
                      if (s.phone) setRetailerPhone(s.phone);
                      setCart((prev) => ({ ...prev, retailer: s.name, phone: s.phone || prev.phone }));
                      setShowSearchShops(false);
                      setShopSearchQuery('');
                      speakAssistiveText(`Selected ${s.name}`);
                    }}
                    className="w-full p-3 text-left border-2 border-black bg-white hover:bg-yellow-200 text-black font-black flex items-center justify-between cursor-pointer"
                    style={{ minHeight: '52px' }}
                  >
                    <div>
                      <div className="text-base font-black">{s.name}</div>
                      {s.phone && <div className="text-xs font-bold text-slate-600">{s.phone}</div>}
                    </div>
                    <span className="text-xs font-bold text-slate-600">Select ➔</span>
                  </button>
                ))}
              </div>

              {/* Add New Custom Retailer Option */}
              <div className="pt-3 border-t-2 border-black">
                <label htmlFor="input-new-shop-custom" className="block text-sm font-black mb-1">
                  Or enter brand new shop name:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="input-new-shop-custom"
                    value={customShopName}
                    onChange={(e) => setCustomShopName(e.target.value)}
                    placeholder="e.g. Balaji Provision Store"
                    className="w-full p-2.5 text-base font-bold border-2 border-black bg-white text-black"
                    style={{ minHeight: '48px' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customShopName.trim()) {
                        const newName = customShopName.trim();
                        setSelectedRetailer(newName);
                        setCart((prev) => ({ ...prev, retailer: newName }));
                        setShowSearchShops(false);
                        setCustomShopName('');
                        speakAssistiveText(`Selected new shop ${newName}`);
                      }
                    }}
                    disabled={!customShopName.trim()}
                    className="px-4 py-2 font-black text-sm border-2 border-black bg-black text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer shrink-0"
                    style={{ minHeight: '48px' }}
                  >
                    Use Shop
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ========================================================= */}
        {/* STEP 2: SELECT PRODUCT                                    */}
        {/* ========================================================= */}
        <section
          id="step-2-product"
          className="border-4 border-black p-5 bg-white shadow-md"
          aria-labelledby="heading-step-2"
        >
          <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b-2 border-black">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-black text-white font-black flex items-center justify-center text-lg">
                2
              </span>
              <h2 id="heading-step-2" className="text-xl sm:text-2xl font-black uppercase tracking-tight">
                Select Product
              </h2>
            </div>
            {selectedProduct && (
              <span className="px-2.5 py-1 bg-emerald-200 border-2 border-black text-xs font-black uppercase flex items-center gap-1">
                <Check size={16} /> Selected
              </span>
            )}
          </div>

          {/* Big-Text Filter Input for quick filtering if large catalog */}
          {products.length > 5 && (
            <div className="relative mb-3">
              <input
                type="text"
                id="input-lv-filter-product"
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                placeholder="Search products by name or pack..."
                className="w-full p-3 text-base sm:text-lg font-bold border-3 border-black bg-slate-50 text-black focus:bg-white focus:outline-none focus:ring-4 focus:ring-yellow-400"
                style={{ minHeight: '52px' }}
              />
              {productSearchQuery && (
                <button
                  type="button"
                  onClick={() => setProductSearchQuery('')}
                  className="absolute right-3 top-3.5 font-bold text-sm bg-slate-300 px-2 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Large Tappable Rows (Min height 56px, bold 20px+ text, no dropdown) */}
          <div
            className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1"
            role="radiogroup"
            aria-label="Products list"
          >
            {filteredProducts.map((p) => {
              const isSelected = selectedProductId === p.id;
              const stock = remainingStock(p.id);
              const promo = activePromoFor(p.id);
              const displayRate = priceType === 'Wholesale' ? p.wholesale : p.retail;

              return (
                <button
                  key={p.id}
                  type="button"
                  id={`btn-product-row-${p.id}`}
                  onClick={() => setSelectedProductId(p.id)}
                  aria-checked={isSelected}
                  role="radio"
                  className={`w-full p-3.5 text-left border-3 border-black cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-black text-white ring-4 ring-yellow-400'
                      : 'bg-white text-black hover:bg-yellow-50 active:bg-yellow-100'
                  }`}
                  style={{ minHeight: '64px' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {/* Product Name in bold 20px+ */}
                      <div className="text-xl sm:text-2xl font-black leading-tight">
                        {p.name}
                      </div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          isSelected ? 'text-yellow-300' : 'text-slate-700'
                        }`}
                      >
                        {p.pack || 'Standard Pack'} • HSN: {p.hsn || '2202'}
                      </div>
                    </div>

                    {/* Rate Display */}
                    <div className="text-right shrink-0">
                      <div className="text-xl sm:text-2xl font-black">
                        ₹{displayRate}
                      </div>
                      <div
                        className={`text-xs font-bold uppercase ${
                          isSelected ? 'text-slate-300' : 'text-slate-600'
                        }`}
                      >
                        per case
                      </div>
                    </div>
                  </div>

                  {/* Stock Level with Text + Icon (Never color alone) */}
                  <div className="mt-2 pt-2 border-t flex flex-wrap items-center justify-between gap-2 border-current opacity-90">
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold">
                      {stock > 10 ? (
                        <>
                          <CheckCircle2 size={16} aria-hidden="true" />
                          <span>[IN STOCK: {stock} cases]</span>
                        </>
                      ) : stock > 0 ? (
                        <>
                          <AlertTriangle size={16} aria-hidden="true" />
                          <span>[LOW STOCK: {stock} cases remaining]</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={16} aria-hidden="true" />
                          <span>[OUT OF STOCK: 0 cases]</span>
                        </>
                      )}
                    </div>

                    {promo && (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-black uppercase ${
                          isSelected ? 'bg-yellow-400 text-black' : 'bg-black text-white'
                        }`}
                      >
                        🎁 {schemeLabel(promo)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ========================================================= */}
        {/* STEP 3: SET QUANTITY (STEPPER)                           */}
        {/* ========================================================= */}
        <section
          id="step-3-quantity"
          className="border-4 border-black p-5 bg-white shadow-md"
          aria-labelledby="heading-step-3"
        >
          <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-black">
            <span className="w-8 h-8 rounded-full bg-black text-white font-black flex items-center justify-center text-lg">
              3
            </span>
            <h2 id="heading-step-3" className="text-xl sm:text-2xl font-black uppercase tracking-tight">
              Set Quantity (Cases)
            </h2>
          </div>

          {/* Stepper with Large [-] button, Large Number (24px+), Large [+] button */}
          <div className="flex items-center justify-between gap-3 mb-4">
            {/* Minus Button */}
            <button
              type="button"
              id="btn-lv-qty-minus"
              onClick={handleDecrement}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
              className="flex-1 py-4 text-center font-black text-3xl border-3 border-black bg-white hover:bg-yellow-200 active:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-xs flex items-center justify-center"
              style={{ minHeight: '64px' }}
            >
              <Minus size={32} strokeWidth={3} />
            </button>

            {/* Display Number (24px+ bold, read-only display, no keyboard by default) */}
            <div
              id="display-lv-quantity"
              className="flex-1 py-3 text-center border-3 border-black bg-yellow-200 text-black flex flex-col items-center justify-center select-none"
              style={{ minHeight: '64px' }}
              aria-live="polite"
              aria-label={`Current quantity: ${quantity} cases`}
            >
              <span className="text-3xl sm:text-4xl font-black leading-none">
                {quantity}
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 mt-1">
                Cases
              </span>
            </div>

            {/* Plus Button */}
            <button
              type="button"
              id="btn-lv-qty-plus"
              onClick={handleIncrement}
              aria-label="Increase quantity"
              className="flex-1 py-4 text-center font-black text-3xl border-3 border-black bg-white hover:bg-yellow-200 active:bg-yellow-300 cursor-pointer transition-colors shadow-xs flex items-center justify-center"
              style={{ minHeight: '64px' }}
            >
              <Plus size={32} strokeWidth={3} />
            </button>
          </div>

          {/* Quick Volume Preset Pills for Depot Salesmen (+1, +5, +10, +25) */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase text-slate-600 shrink-0">
              Quick Add:
            </span>
            <div className="grid grid-cols-4 gap-2 flex-1">
              {[1, 5, 10, 25].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleAddQuantityPreset(amt)}
                  className="py-2 px-1 text-center border-2 border-black bg-slate-100 hover:bg-black hover:text-white font-black text-sm cursor-pointer transition-colors"
                  style={{ minHeight: '44px' }}
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* STEP 4: SET SALE TYPE (RETAIL / WHOLESALE)                 */}
        {/* ========================================================= */}
        <section
          id="step-4-sale-type"
          className="border-4 border-black p-5 bg-white shadow-md"
          aria-labelledby="heading-step-4"
        >
          <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-black">
            <span className="w-8 h-8 rounded-full bg-black text-white font-black flex items-center justify-center text-lg">
              4
            </span>
            <h2 id="heading-step-4" className="text-xl sm:text-2xl font-black uppercase tracking-tight">
              Sale Type (Rate)
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Wholesale Button */}
            <button
              type="button"
              id="btn-lv-rate-wholesale"
              onClick={() => setPriceType('Wholesale')}
              aria-pressed={priceType === 'Wholesale'}
              className={`p-4 border-3 border-black text-left cursor-pointer transition-all flex items-center justify-between ${
                priceType === 'Wholesale'
                  ? 'bg-black text-white ring-4 ring-yellow-400'
                  : 'bg-white text-black hover:bg-yellow-100'
              }`}
              style={{ minHeight: '60px' }}
            >
              <div>
                <div className="text-lg sm:text-xl font-black">Wholesale Rate</div>
                {selectedProduct && (
                  <div
                    className={`text-sm font-bold ${
                      priceType === 'Wholesale' ? 'text-yellow-300' : 'text-slate-700'
                    }`}
                  >
                    ₹{selectedProduct.wholesale} / case
                  </div>
                )}
              </div>
              {priceType === 'Wholesale' && <Check size={24} className="text-yellow-400" />}
            </button>

            {/* Retail Button */}
            <button
              type="button"
              id="btn-lv-rate-retail"
              onClick={() => setPriceType('Retail')}
              aria-pressed={priceType === 'Retail'}
              className={`p-4 border-3 border-black text-left cursor-pointer transition-all flex items-center justify-between ${
                priceType === 'Retail'
                  ? 'bg-black text-white ring-4 ring-yellow-400'
                  : 'bg-white text-black hover:bg-yellow-100'
              }`}
              style={{ minHeight: '60px' }}
            >
              <div>
                <div className="text-lg sm:text-xl font-black">Retail Rate</div>
                {selectedProduct && (
                  <div
                    className={`text-sm font-bold ${
                      priceType === 'Retail' ? 'text-yellow-300' : 'text-slate-700'
                    }`}
                  >
                    ₹{selectedProduct.retail} / case
                  </div>
                )}
              </div>
              {priceType === 'Retail' && <Check size={24} className="text-yellow-400" />}
            </button>
          </div>
        </section>

        {/* ========================================================= */}
        {/* COLLAPSIBLE: "MORE DETAILS" (CLOSED BY DEFAULT)           */}
        {/* ========================================================= */}
        <div className="border-3 border-black bg-slate-50">
          <button
            type="button"
            id="btn-toggle-more-details"
            onClick={() => setShowMoreDetails((prev) => !prev)}
            aria-expanded={showMoreDetails}
            className="w-full p-4 flex items-center justify-between text-left font-black text-base sm:text-lg cursor-pointer hover:bg-slate-200"
            style={{ minHeight: '52px' }}
          >
            <span>
              ⚙️ More Details (WhatsApp, Date, Godown, Custom Rate, GST)
            </span>
            <span>{showMoreDetails ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showMoreDetails && (
            <div className="p-4 border-t-3 border-black space-y-4 bg-white">
              {/* WhatsApp Number */}
              <div>
                <label htmlFor="lv-input-whatsapp" className="block text-sm font-black mb-1">
                  Retailer WhatsApp Phone Number:
                </label>
                <input
                  type="tel"
                  id="lv-input-whatsapp"
                  value={retailerPhone}
                  onChange={(e) => setRetailerPhone(e.target.value)}
                  placeholder="e.g. 9822012345"
                  className="w-full p-3 text-base font-bold border-2 border-black"
                  style={{ minHeight: '48px' }}
                />
              </div>

              {/* Invoice Date */}
              <div>
                <label htmlFor="lv-input-date" className="block text-sm font-black mb-1">
                  Invoice Date:
                </label>
                <input
                  type="date"
                  id="lv-input-date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full p-3 text-base font-bold border-2 border-black"
                  style={{ minHeight: '48px' }}
                />
              </div>

              {/* Dispatch Godown */}
              {warehouses.length > 0 && (
                <div>
                  <label htmlFor="lv-select-warehouse" className="block text-sm font-black mb-1">
                    Dispatch Godown:
                  </label>
                  <select
                    id="lv-select-warehouse"
                    value={dispatchWarehouseId}
                    onChange={(e) => setDispatchWarehouseId(e.target.value)}
                    className="w-full p-3 text-base font-bold border-2 border-black bg-white"
                    style={{ minHeight: '48px' }}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.code ? `(${w.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Custom Line Rate */}
              <div>
                <label htmlFor="lv-input-custom-rate" className="block text-sm font-black mb-1">
                  Custom Negotiated Rate (Optional ₹):
                </label>
                <input
                  type="number"
                  id="lv-input-custom-rate"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  placeholder="Leave blank to use standard rate"
                  className="w-full p-3 text-base font-bold border-2 border-black"
                  style={{ minHeight: '48px' }}
                />
              </div>

              {/* GST Calculation Setting */}
              <div>
                <label htmlFor="lv-select-gst" className="block text-sm font-black mb-1">
                  GST Calculation Mode:
                </label>
                <select
                  id="lv-select-gst"
                  value={gstMode}
                  onChange={(e) => setGstMode(e.target.value as any)}
                  className="w-full p-3 text-base font-bold border-2 border-black bg-white"
                  style={{ minHeight: '48px' }}
                >
                  <option value="inclusive">GST Included in Price (Inclusive)</option>
                  <option value="exclusive">GST Extra (+ Added on Top)</option>
                  <option value="off">No GST (Disabled)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* STEP 5: CONFIRM LINE ITEM ("ADD TO BILL")                  */}
        {/* ========================================================= */}
        <div className="pt-2">
          <button
            type="button"
            id="btn-lv-add-to-bill"
            onClick={handleAddLineToCart}
            className="w-full py-4 px-6 text-center font-black text-xl sm:text-2xl border-4 border-black bg-yellow-300 hover:bg-yellow-400 active:bg-yellow-500 text-black flex items-center justify-center gap-3 cursor-pointer shadow-md transition-transform active:scale-[0.99]"
            style={{ minHeight: '64px' }}
          >
            <Plus size={28} strokeWidth={3} />
            <span>Add Item to Bill (₹{selectedProduct ? money((priceType === 'Wholesale' ? selectedProduct.wholesale : selectedProduct.retail) * quantity) : '0'})</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* CURRENT BILL ITEMS LIST (IF ANY ITEMS IN CART)             */}
        {/* ========================================================= */}
        <div
          ref={cartListRef}
          id="lv-cart-items-summary"
          className="border-4 border-black p-5 bg-white shadow-md mt-6"
        >
          <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-black">
            <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight flex items-center gap-2">
              <ShoppingCart size={22} />
              <span>Current Invoice Items ({cart.items.length})</span>
            </h3>
            {cart.items.length > 0 && (
              <button
                type="button"
                id="btn-lv-clear-cart"
                onClick={() => setCart((prev) => ({ ...prev, items: [] }))}
                className="text-xs font-black underline text-red-600 hover:text-black cursor-pointer"
              >
                Clear All Items
              </button>
            )}
          </div>

          {cart.items.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-slate-300 bg-slate-50 text-slate-600">
              <Package size={40} className="mx-auto mb-2 opacity-50" />
              <div className="text-lg font-bold">No items added yet.</div>
              <div className="text-sm">Select a shop and product above, then tap "Add Item to Bill".</div>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.items.map((item, idx) => (
                <div
                  key={item.key}
                  className="p-3.5 border-3 border-black bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-black text-white text-xs font-black flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-lg sm:text-xl font-black text-black">
                        {item.productName}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-700 ml-8">
                      {item.priceType} Rate: ₹{item.rate} • Total: ₹{money(item.amount)}
                      {item.freeQty > 0 && (
                        <span className="ml-2 font-black text-emerald-700">
                          (+{item.freeQty} Free)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Item Stepper & Delete */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <div className="flex items-center border-2 border-black bg-white">
                      <button
                        type="button"
                        onClick={() => handleUpdateCartItemQty(item.key, -1)}
                        className="px-3 py-1 text-lg font-black hover:bg-black hover:text-white cursor-pointer"
                        style={{ minHeight: '44px', minWidth: '40px' }}
                        aria-label="Decrease item quantity"
                      >
                        -
                      </button>
                      <span className="px-3 text-base font-black">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateCartItemQty(item.key, 1)}
                        className="px-3 py-1 text-lg font-black hover:bg-black hover:text-white cursor-pointer"
                        style={{ minHeight: '44px', minWidth: '40px' }}
                        aria-label="Increase item quantity"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveCartItem(item.key)}
                      className="p-2 border-2 border-black bg-red-100 text-red-700 hover:bg-red-700 hover:text-white cursor-pointer transition-colors"
                      style={{ minHeight: '44px', minWidth: '44px' }}
                      aria-label={`Remove ${item.productName} from bill`}
                      title="Remove line"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Invoice Breakdown */}
              <div className="pt-3 border-t-2 border-black text-base font-bold space-y-1 text-slate-800">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{money(totals.subtotal)}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-black">
                    <span>Scheme Discount:</span>
                    <span>-₹{money(totals.discount)}</span>
                  </div>
                )}
                {gstMode !== 'off' && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax (CGST + SGST):</span>
                    <span>₹{money(totals.cgst + totals.sgst)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t-2 border-black text-2xl sm:text-3xl font-black text-black">
                  <span>Grand Total:</span>
                  <span>₹{money(totals.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* STEP 6: FINISH SALE (FULL WIDTH LARGE BUTTON)             */}
        {/* ========================================================= */}
        {cart.items.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              id="btn-lv-finish-sale"
              onClick={handleFinishSale}
              disabled={isFinishing || !selectedRetailer}
              className="w-full py-5 px-6 text-center font-black text-2xl sm:text-3xl border-4 border-black bg-black text-white hover:bg-slate-900 active:bg-slate-800 cursor-pointer shadow-xl flex items-center justify-center gap-3 transition-transform active:scale-[0.99]"
              style={{ minHeight: '68px' }}
            >
              <Check size={32} strokeWidth={3} className="text-yellow-400" />
              <span>Finish Sale • ₹{money(totals.total)}</span>
            </button>
          </div>
        )}
      </div>

      {/* Persistent Sticky Running Total Bar (if configured at 'bottom') */}
      {lowVisionStickyPosition === 'bottom' && (
        <div
          id="sticky-running-total-bottom"
          className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-yellow-300 text-black border-t-4 border-black shadow-2xl flex items-center justify-between"
        >
          <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
            <div>
              <div className="text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingCart size={18} />
                <span>Invoice Items: {cart.items.length} ({totalItemUnits} cases)</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black leading-none mt-0.5">
                Total: ₹{money(totals.total)}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {cart.items.length > 0 && (
                <button
                  type="button"
                  id="btn-sticky-finish-sale"
                  onClick={handleFinishSale}
                  className="px-5 py-3 bg-black text-white font-black text-base sm:text-lg border-2 border-black rounded cursor-pointer hover:bg-slate-900 shadow-md"
                  style={{ minHeight: '52px' }}
                >
                  Finish Sale ➔
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
