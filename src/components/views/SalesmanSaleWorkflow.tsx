import React, { useState, useMemo } from 'react';
import {
  Search,
  Mic,
  MicOff,
  Zap,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Plus,
  Minus,
  ShoppingCart,
  X,
  Printer,
  Share2,
  RotateCcw,
  Building2,
  Phone,
  ChevronRight,
  Download,
} from 'lucide-react';
import { Bill, BillItem, ExistingCustomer, PriceType, Product, Trip } from '../../types';
import { money } from '../../utils/billing';
import { downloadInvoicePdf } from '../../utils/invoicePdf';

interface SalesmanSaleWorkflowProps {
  confirmedBill: Bill | null;
  setConfirmedBill: (bill: Bill | null) => void;
  cart: {
    items: BillItem[];
  };
  activeTrip: Trip | null;
  products: Product[];
  customers: ExistingCustomer[];
  selectedRetailer: string;
  setSelectedRetailer: (name: string) => void;
  retailerPhone: string;
  setRetailerPhone: (phone: string) => void;
  priceType: PriceType;
  setPriceType: (pt: PriceType) => void;
  isLowVision: boolean;
  palette: any;
  scale: number;
  finalCartTotal: number;
  getVehicleStock: (trip: Trip | null, productId: number) => { loaded: number; sold: number; available: number };
  getProductCartQty: (productId: number) => number;
  onQuickProductCartChange: (productId: number, delta: number) => void;
  onOpenCart: () => void;
  onCancelSaleSequence: () => void;
  onOpenCustomerDirectory: () => void;
  onVoiceSearchCustomer: () => void;
  isVoiceSearching: boolean;
  speakAssistiveText: (text: string) => void;
  onSetSalesmanTab: (tab: 'sell' | 'vanStock' | 'bills' | 'customerDue' | 'trips') => void;
  orgProfile?: any;
  billingSettings?: any;
}

export const SalesmanSaleWorkflow: React.FC<SalesmanSaleWorkflowProps> = ({
  confirmedBill,
  setConfirmedBill,
  cart,
  activeTrip,
  products,
  customers,
  selectedRetailer,
  setSelectedRetailer,
  retailerPhone,
  setRetailerPhone,
  priceType,
  setPriceType,
  isLowVision,
  palette,
  scale,
  finalCartTotal,
  getVehicleStock,
  getProductCartQty,
  onQuickProductCartChange,
  onOpenCart,
  onCancelSaleSequence,
  onOpenCustomerDirectory,
  onVoiceSearchCustomer,
  isVoiceSearching,
  speakAssistiveText,
  onSetSalesmanTab,
  orgProfile,
  billingSettings,
}) => {
  // Local state for search & filtering
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [productAlphaFilter, setProductAlphaFilter] = useState<string>('ALL');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState<boolean>(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);

  // Available product categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['ALL', ...Array.from(set)];
  }, [products]);

  // Filtered customers for instant live search dropdown
  const filteredCustomerSuggestions = useMemo(() => {
    if (!customerSearchQuery.trim()) return [];
    const query = customerSearchQuery.toLowerCase().trim();
    return (customers || [])
      .filter((c) => c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query)))
      .slice(0, 12);
  }, [customers, customerSearchQuery]);

  // Filtered products on vehicle
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      // Category filter
      if (selectedCategory !== 'ALL' && prod.category !== selectedCategory) {
        return false;
      }
      // Text search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = prod.name.toLowerCase().includes(query);
        const matchesCat = (prod.category || '').toLowerCase().includes(query);
        if (!matchesName && !matchesCat) return false;
      }
      // Alphabet Quick Jump
      if (productAlphaFilter !== 'ALL') {
        const first = (prod.name || '').trim().toUpperCase().charAt(0);
        if (productAlphaFilter === 'A-D' && !(first >= 'A' && first <= 'D')) return false;
        if (productAlphaFilter === 'E-H' && !(first >= 'E' && first <= 'H')) return false;
        if (productAlphaFilter === 'I-L' && !(first >= 'I' && first <= 'L')) return false;
        if (productAlphaFilter === 'M-P' && !(first >= 'M' && first <= 'P')) return false;
        if (productAlphaFilter === 'Q-T' && !(first >= 'Q' && first <= 'T')) return false;
        if (productAlphaFilter === 'U-Z' && !(first >= 'U' && first <= 'Z')) return false;
      }
      return true;
    });
  }, [products, selectedCategory, searchTerm, productAlphaFilter]);

  // Total items in cart
  const cartItemCount = cart.items.reduce((sum, it) => sum + it.qty, 0);

  // =========================================================================
  // VIEW 1: SEPARATE INVOICE CONFIRMATION SCREEN (STEP 4 AS SEPARATE SCREEN)
  // =========================================================================
  if (confirmedBill) {
    const isPaidInFull = (confirmedBill.amountPaid || 0) >= confirmedBill.total;
    const balanceDue = Math.max(0, confirmedBill.total - (confirmedBill.amountPaid || 0));
    const totalGst = (confirmedBill.cgst || 0) + (confirmedBill.sgst || 0);

    return (
      <div id="confirmed-invoice-view" className="max-w-3xl mx-auto space-y-4 py-2 px-1">
        {/* Success Banner */}
        <div
          className="p-4 sm:p-5 rounded-xl border-2 shadow-md flex items-center justify-between gap-4 flex-wrap"
          style={{
            backgroundColor: isLowVision ? '#000000' : '#ECFDF5',
            borderColor: isLowVision ? '#000000' : '#10B981',
            color: isLowVision ? '#FACC15' : '#065F46',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                isLowVision ? 'bg-yellow-400 text-black' : 'bg-emerald-600 text-white'
              }`}
            >
              <CheckCircle2 size={28} />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-wider">Sale Successfully Finalized</div>
              <h2 className="text-xl sm:text-2xl font-black">
                Invoice #{confirmedBill.id}
              </h2>
              <div className="text-xs font-bold opacity-90">
                Stock deducted from van • Recorded in sales ledger
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              type="button"
              id="btn-invoice-print"
              onClick={() => window.print()}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl font-black text-sm border-2 flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
              style={{
                backgroundColor: isLowVision ? '#FACC15' : '#FFFFFF',
                color: '#000000',
                borderColor: '#000000',
              }}
            >
              <Printer size={18} />
              <span>Print Tax Invoice</span>
            </button>
            <button
              type="button"
              id="btn-invoice-download-pdf"
              onClick={() => {
                if (confirmedBill) {
                  downloadInvoicePdf(confirmedBill, orgProfile, billingSettings);
                }
              }}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl font-black text-sm border-2 bg-slate-900 text-white flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors hover:bg-slate-800"
            >
              <Download size={18} />
              <span>Download PDF</span>
            </button>
            {confirmedBill.phone && (
              <a
                id="btn-invoice-whatsapp"
                href={`https://wa.me/${confirmedBill.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  `Hi ${confirmedBill.retailer}, thank you for your business! Bill #${confirmedBill.id} total: ₹${confirmedBill.total}. Paid: ₹${confirmedBill.amountPaid || 0}.`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl font-black text-sm bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
              >
                <Share2 size={18} />
                <span>Share WhatsApp</span>
              </a>
            )}
          </div>
        </div>

        {/* Invoice Summary Card */}
        <div
          className="p-4 sm:p-5 rounded-xl border-2 bg-white shadow-sm space-y-4"
          style={{ borderColor: palette.line }}
        >
          {/* Customer & Trip Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b" style={{ borderColor: palette.line }}>
            <div>
              <span className="text-[11px] font-black uppercase text-slate-500">Billed To Customer</span>
              <div className="text-lg font-black text-slate-900">{confirmedBill.retailer}</div>
              {confirmedBill.phone && (
                <div className="text-xs font-bold text-slate-600 flex items-center gap-1 mt-0.5">
                  <Phone size={12} />
                  <span>{confirmedBill.phone}</span>
                </div>
              )}
            </div>
            <div className="sm:text-right">
              <span className="text-[11px] font-black uppercase text-slate-500">Invoice Information</span>
              <div className="text-xs font-bold text-slate-700">Date: {confirmedBill.date}</div>
              {confirmedBill.vehicle && (
                <div className="text-xs font-bold text-slate-600">Van: {confirmedBill.vehicle}</div>
              )}
              {confirmedBill.salesman && (
                <div className="text-xs font-bold text-slate-600">Salesman: {confirmedBill.salesman}</div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-700 font-black" style={{ borderColor: palette.line }}>
                  <th className="py-2 px-2">Item</th>
                  <th className="py-2 px-2 text-center">Type</th>
                  <th className="py-2 px-2 text-right">Qty</th>
                  <th className="py-2 px-2 text-right">Rate</th>
                  <th className="py-2 px-2 text-right">Disc</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {confirmedBill.items.map((it, idx) => (
                  <tr key={it.key || idx} className="hover:bg-slate-50">
                    <td className="py-2 px-2 font-bold text-slate-900">
                      <div>{it.productName}</div>
                      {it.category && <div className="text-[10px] text-slate-400 font-normal">{it.category}</div>}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-700">
                        {it.priceType}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-black text-slate-900">{it.qty}</td>
                    <td className="py-2 px-2 text-right text-slate-700">₹{money(it.rate)}</td>
                    <td className="py-2 px-2 text-right text-slate-600">
                      {it.discount ? `₹${money(it.discount)}` : '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-black text-slate-900">₹{money(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Breakdown */}
          <div className="pt-3 border-t space-y-1.5 text-xs font-bold text-slate-700" style={{ borderColor: palette.line }}>
            <div className="flex justify-between">
              <span>Gross Total:</span>
              <span>₹{money(confirmedBill.subtotal)}</span>
            </div>
            {totalGst > 0 && (
              <div className="flex justify-between">
                <span>GST Tax:</span>
                <span>₹{money(totalGst)}</span>
              </div>
            )}
            {(confirmedBill.discount > 0 || (confirmedBill.additionalDiscount || 0) > 0) && (
              <div className="flex justify-between text-emerald-700 font-black">
                <span>Total Discount Applied:</span>
                <span>-₹{money((confirmedBill.discount || 0) + (confirmedBill.additionalDiscount || 0))}</span>
              </div>
            )}
            <div
              className="flex justify-between items-center py-2 border-t border-b text-base font-black text-slate-900"
              style={{ borderColor: palette.line }}
            >
              <span>Net Invoice Total:</span>
              <span className="text-xl text-blue-950 font-black">₹{money(confirmedBill.total)}</span>
            </div>

            <div className="flex justify-between items-center pt-1 text-xs">
              <span>Amount Collected:</span>
              <span className="font-black text-emerald-700">₹{money(confirmedBill.amountPaid || 0)}</span>
            </div>
            {!isPaidInFull && (
              <div className="flex justify-between items-center text-xs font-black text-rose-700">
                <span>Remaining Balance (Due):</span>
                <span>₹{money(balanceDue)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Post-Sale Navigation Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <button
            type="button"
            id="btn-start-next-sale"
            onClick={() => {
              setConfirmedBill(null);
              onCancelSaleSequence();
            }}
            className="w-full py-3.5 px-4 rounded-xl border-2 font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all hover:scale-[1.01]"
            style={{
              backgroundColor: isLowVision ? '#FACC15' : '#1E3A8A',
              color: isLowVision ? '#000000' : '#FFFFFF',
              borderColor: isLowVision ? '#000000' : '#1E3A8A',
            }}
          >
            <Plus size={18} />
            <span>Start Next Customer Sale</span>
          </button>

          <button
            type="button"
            id="btn-return-to-trips"
            onClick={() => {
              setConfirmedBill(null);
              onSetSalesmanTab('vanStock');
            }}
            className="w-full py-3.5 px-4 rounded-xl border-2 font-black text-sm bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
            style={{ borderColor: palette.line }}
          >
            <RotateCcw size={16} />
            <span>Van Stock & Rec</span>
          </button>

          <button
            type="button"
            id="btn-view-trip-bills"
            onClick={() => {
              setConfirmedBill(null);
              onSetSalesmanTab('bills');
            }}
            className="w-full py-3.5 px-4 rounded-xl border-2 font-black text-sm bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
            style={{ borderColor: palette.line }}
          >
            <Printer size={16} />
            <span>Trip Delivery Invoices</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: STREAMLINED SALE SEQUENCE (STEP 1: CUSTOMER + STEP 2: MULTI-PRODUCT)
  // =========================================================================
  return (
    <div id="salesman-sale-flow" className="space-y-4 max-w-5xl mx-auto">
      {/* Top Header & Cancel Button */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-white p-3 rounded-xl border-2 shadow-xs" style={{ borderColor: palette.line }}>
        <div>
          <h2 className="text-base sm:text-lg font-black flex items-center gap-2 text-slate-900">
            <span className="w-7 h-7 rounded-full bg-blue-900 text-white flex items-center justify-center text-xs font-black">
              1
            </span>
            <span>New Customer Sale</span>
          </h2>
          <p className="text-xs text-slate-500 font-bold">
            Search customer, tap beverages to add, then review cart to set quantities & pricing.
          </p>
        </div>

        {/* CANCEL SEQUENCE BUTTON (Available at any stage) */}
        {(selectedRetailer || cart.items.length > 0) && (
          <button
            type="button"
            id="btn-cancel-sale-sequence"
            onClick={() => {
              onCancelSaleSequence();
            }}
            className="px-3 py-1.5 rounded-lg border-2 border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <X size={14} />
            <span>Cancel Sale</span>
          </button>
        )}
      </div>

      {/* ===================================================================== */}
      {/* STEP 1: SELECT RETAILER / CUSTOMER (DIRECT SEARCH & VOICE, NO BULKY GRID) */}
      {/* ===================================================================== */}
      <div
        className="p-3.5 sm:p-4 rounded-xl border-2 bg-white shadow-xs space-y-3"
        style={{ borderColor: palette.line }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Building2 size={15} className="text-blue-900" />
            <span>Customer / Shop Details</span>
          </span>

          {selectedRetailer && (
            <button
              type="button"
              id="btn-change-customer"
              onClick={() => {
                setSelectedRetailer('');
                setRetailerPhone('');
                speakAssistiveText('Customer deselected. Please search new customer.');
              }}
              className="text-xs font-black text-blue-800 hover:text-blue-950 underline cursor-pointer"
            >
              Change Customer
            </button>
          )}
        </div>

        {selectedRetailer ? (
          /* Active Customer Display Card */
          <div className="p-3 rounded-lg border-2 border-emerald-500 bg-emerald-50/80 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-emerald-800">Selected Customer:</div>
              <div className="text-base sm:text-lg font-black text-slate-900">{selectedRetailer}</div>
              {retailerPhone && (
                <div className="text-xs font-bold text-slate-600 flex items-center gap-1 mt-0.5">
                  <Phone size={12} />
                  <span>{retailerPhone}</span>
                </div>
              )}
            </div>
            <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
          </div>
        ) : (
          /* Search & Quick Actions */
          <div className="space-y-3">
            {/* Direct Instant Search Bar with Autocomplete */}
            <div className="relative">
              <div className="relative flex items-center">
                <Search size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  id="input-customer-search-direct"
                  placeholder="Search customer by shop name or phone number..."
                  value={customerSearchQuery}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  className="w-full pl-10 pr-20 min-h-[46px] py-2.5 rounded-xl border-2 border-slate-300 text-base font-bold text-slate-900 focus:outline-none focus:border-blue-900 shadow-2xs"
                />
                {customerSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerSearchQuery('');
                      setShowCustomerDropdown(false);
                    }}
                    className="absolute right-3 min-h-[44px] px-2 text-xs font-black text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Instant Search Suggestions Dropdown (16-18px minimum font size) */}
              {showCustomerDropdown && filteredCustomerSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border-2 border-blue-900 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {filteredCustomerSuggestions.map((cust) => (
                    <button
                      key={cust.phone || cust.name}
                      type="button"
                      onClick={() => {
                        setSelectedRetailer(cust.name);
                        setRetailerPhone(cust.phone || '');
                        setShowCustomerDropdown(false);
                        setCustomerSearchQuery('');
                        speakAssistiveText(`Selected ${cust.name}`);
                      }}
                      className="w-full min-h-[50px] p-3 text-left hover:bg-blue-50 active:bg-blue-100 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-black text-slate-900 truncate">{cust.name}</div>
                        <div className="text-xs text-slate-500 font-bold flex items-center gap-2 flex-wrap mt-0.5">
                          {cust.phone && <span>Ph: {cust.phone}</span>}
                          {cust.balanceDue > 0 && (
                            <span className="text-rose-700 font-black">Due: ₹{money(cust.balanceDue)}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-400 shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              )}

              {/* When typing and no matches found */}
              {showCustomerDropdown && customerSearchQuery.trim() && filteredCustomerSuggestions.length === 0 && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border-2 border-slate-300 rounded-xl shadow-2xl p-4 text-center">
                  <p className="text-xs font-bold text-slate-500">No registered customer matching "{customerSearchQuery}".</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRetailer(customerSearchQuery.trim());
                      setShowCustomerDropdown(false);
                      setCustomerSearchQuery('');
                      speakAssistiveText(`Selected ${customerSearchQuery.trim()}`);
                    }}
                    className="mt-2 text-xs font-black text-blue-900 underline hover:text-blue-950 cursor-pointer"
                  >
                    Select "{customerSearchQuery.trim()}" for this sale
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions Row: 1-Tap Spot Cash, Voice Search, and Customer Directory */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {/* Voice Search Button */}
              <button
                type="button"
                id="btn-voice-search-customer"
                onClick={onVoiceSearchCustomer}
                className={`py-2.5 px-3 rounded-lg border-2 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all ${
                  isVoiceSearching
                    ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                }`}
              >
                {isVoiceSearching ? (
                  <>
                    <MicOff size={16} className="animate-spin" />
                    <span>Listening...</span>
                  </>
                ) : (
                  <>
                    <Mic size={16} className="text-amber-700" />
                    <span>Speak Name</span>
                  </>
                )}
              </button>

              {/* 1-Tap Spot Cash Sale */}
              <button
                type="button"
                id="btn-spot-cash-sale"
                onClick={() => {
                  setSelectedRetailer('Spot Cash / Walk-in Customer');
                  setRetailerPhone('');
                  speakAssistiveText('Spot cash customer selected.');
                }}
                className="py-2.5 px-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Zap size={15} className="text-emerald-600" />
                <span>Spot Cash Sale</span>
              </button>

              {/* Full Directory Selector */}
              <button
                type="button"
                id="btn-open-customer-directory"
                onClick={onOpenCustomerDirectory}
                className="py-2.5 px-3 rounded-lg border-2 border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Search size={14} />
                <span>Directory / Add New</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* STEP 2: MULTI-PRODUCT BEVERAGE SELECTION (IN ONE GO!)                 */}
      {/* ===================================================================== */}
      <div
        className="p-3.5 sm:p-4 rounded-xl border-2 bg-white shadow-xs space-y-3"
        style={{ borderColor: palette.line }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-900 text-white flex items-center justify-center text-xs font-black">
              2
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-slate-600">
              Select Beverages (Vehicle Stock)
            </span>
          </div>

          {/* Pricing tier toggle (Wholesale vs Retail default) */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 font-bold hidden sm:inline">Default Tier:</span>
            <div className="flex border border-slate-300 rounded overflow-hidden">
              <button
                type="button"
                onClick={() => setPriceType('Wholesale')}
                className={`px-2 py-1 font-black cursor-pointer ${
                  priceType === 'Wholesale' ? 'bg-blue-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Wholesale
              </button>
              <button
                type="button"
                onClick={() => setPriceType('Retail')}
                className={`px-2 py-1 font-black cursor-pointer ${
                  priceType === 'Retail' ? 'bg-blue-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Retail
              </button>
            </div>
          </div>
        </div>

        {/* Product Controls: Search & Alphabet Quick Jump */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                id="input-beverage-search"
                placeholder="Search beverages by name or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border-2 border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-900"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-black text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded text-xs font-black whitespace-nowrap cursor-pointer transition-colors ${
                    selectedCategory === cat
                      ? 'bg-blue-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Alphabet Quick Jump Pills (Requested by user) */}
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="text-[11px] font-black text-slate-500 uppercase shrink-0">Quick Jump:</span>
            {['ALL', 'A-D', 'E-H', 'I-L', 'M-P', 'Q-T', 'U-Z'].map((grp) => {
              const active = productAlphaFilter === grp;
              return (
                <button
                  key={grp}
                  type="button"
                  onClick={() => {
                    setProductAlphaFilter(grp);
                    speakAssistiveText(`Filtered beverages to ${grp}`);
                  }}
                  className={`px-2 py-0.5 rounded text-xs font-black cursor-pointer transition-colors ${
                    active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {grp}
                </button>
              );
            })}
          </div>
        </div>

        {/* MULTI-PRODUCT BEVERAGE GRID (Select multiple products for a customer in one go!) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
          {filteredProducts.map((prod) => {
            const { available } = getVehicleStock(activeTrip, prod.id);
            const inCartQty = getProductCartQty(prod.id);
            const isOutOfStock = available <= 0;
            const price = priceType === 'Retail' ? prod.retail : prod.wholesale;

            return (
              <div
                key={prod.id}
                id={`beverage-card-${prod.id}`}
                className={`p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between ${
                  inCartQty > 0
                    ? 'border-blue-900 bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div>
                  {/* Top row: Product name and dominant "X in van" stock badge (18-20px bold) */}
                  <div className="flex items-start justify-between gap-2.5 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm sm:text-base text-slate-900 truncate" title={prod.name}>
                        {prod.name}
                      </div>
                      <div className="text-xs text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                        <span>{prod.category}</span>
                        {prod.packSize && <span>• {prod.packSize}</span>}
                      </div>
                    </div>

                    {/* Dominant "X in van" Badge (18-20px bold, visually dominant over product name) */}
                    <div
                      className={`px-3 py-1.5 rounded-xl shrink-0 font-black uppercase text-center border-2 shadow-2xs ${
                        isOutOfStock
                          ? 'bg-rose-100 text-rose-900 border-rose-300'
                          : available < 5
                          ? 'bg-amber-100 text-amber-950 border-amber-300'
                          : 'bg-emerald-100 text-emerald-950 border-emerald-300'
                      }`}
                      aria-label={`${available} cases available in van`}
                    >
                      <div className="text-lg sm:text-xl font-black leading-none">
                        {available}
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-bold tracking-tight mt-0.5 whitespace-nowrap">
                        {isOutOfStock ? '0 in van' : 'in van'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between text-xs sm:text-sm font-semibold text-slate-600 mb-3">
                    <span>
                      Rate: <strong className="text-slate-900 font-black text-sm">₹{money(price)}</strong>
                      <span className="text-xs text-slate-500 font-normal"> /cs</span>
                    </span>
                    {inCartQty > 0 && (
                      <span className="text-blue-900 font-black text-xs flex items-center gap-1 bg-blue-100/80 px-2 py-0.5 rounded-md">
                        <CheckCircle2 size={13} />
                        <span>{inCartQty} in cart</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Direct Action: Multi-Product Stepper / Add with 44x44px min touch targets & 8px spacing */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  {inCartQty > 0 ? (
                    <div className="w-full flex items-center justify-between gap-2">
                      <div className="flex-1 flex items-center justify-between bg-white border-2 border-blue-900 rounded-xl p-0.5 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => onQuickProductCartChange(prod.id, -1)}
                          className="min-w-[44px] min-h-[44px] w-11 h-11 flex items-center justify-center text-blue-900 font-black hover:bg-blue-50 rounded-lg cursor-pointer text-lg"
                          title="Decrease 1 case"
                          aria-label={`Decrease ${prod.name}`}
                        >
                          <Minus size={18} />
                        </button>
                        <div className="font-black text-sm text-blue-950 px-2 flex items-center gap-1">
                          <span className="text-base font-black">{inCartQty}</span>
                          <span className="text-xs text-slate-500 font-bold">cs</span>
                        </div>
                        <button
                          type="button"
                          disabled={inCartQty >= available}
                          onClick={() => onQuickProductCartChange(prod.id, 1)}
                          className="min-w-[44px] min-h-[44px] w-11 h-11 flex items-center justify-center text-blue-900 font-black hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg cursor-pointer text-lg"
                          title="Increase 1 case"
                          aria-label={`Increase ${prod.name}`}
                        >
                          <Plus size={18} />
                        </button>
                      </div>

                      {/* Quick +5 shortcut (separated by 8px gap) */}
                      {available - inCartQty >= 5 && (
                        <button
                          type="button"
                          onClick={() => onQuickProductCartChange(prod.id, 5)}
                          className="min-w-[44px] min-h-[44px] px-3 rounded-xl border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-900 font-black text-sm cursor-pointer whitespace-nowrap flex items-center justify-center shadow-2xs"
                          title="Add 5 cases"
                        >
                          +5
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="w-full flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => onQuickProductCartChange(prod.id, 1)}
                        className="flex-1 min-h-[44px] py-2 px-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-900 hover:bg-blue-950 text-white shadow-2xs"
                      >
                        <Plus size={16} />
                        <span>Add 1 cs</span>
                      </button>

                      {available >= 5 && (
                        <button
                          type="button"
                          onClick={() => onQuickProductCartChange(prod.id, 5)}
                          className="min-h-[44px] min-w-[56px] px-3.5 rounded-xl border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-900 font-black text-sm cursor-pointer whitespace-nowrap flex items-center justify-center shadow-2xs"
                          title="Add 5 cases"
                        >
                          +5 cs
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredProducts.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm font-bold">
            No beverages match the current filter. Try clearing the search or changing the alphabet jump.
          </div>
        )}
      </div>

      {/* Confirmation Modal before Discarding Active Cart */}
      {showCancelConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600 font-black text-base">
              <AlertCircle size={22} />
              <span>Cancel Current Sale?</span>
            </div>
            <p className="text-sm font-semibold text-slate-600">
              You have <strong className="text-slate-900">{cart.items.length} beverage item{cart.items.length !== 1 ? 's' : ''}</strong> in this cart.
              Discarding will clear all items for this customer.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border-2 border-slate-300 text-sm font-black text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Keep Cart
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCancelConfirm(false);
                  onCancelSaleSequence();
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-black cursor-pointer shadow-sm"
              >
                Yes, Discard Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BOTTOM STICKY ACTION BAR: REVIEW CART & CANCEL SEQUENCE              */}
      {/* ===================================================================== */}
      <div
        className="sticky bottom-0 z-30 p-3 sm:p-4 rounded-2xl border-2 bg-white/95 backdrop-blur-sm shadow-2xl flex items-center justify-between gap-3 flex-wrap"
        style={{
          borderColor: palette.line,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        }}
      >
        {/* Left Side: De-emphasized Cancel Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            id="btn-bottom-cancel-sale"
            onClick={() => {
              if (cart.items.length > 0) {
                setShowCancelConfirm(true);
              } else {
                onCancelSaleSequence();
              }
            }}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer transition-colors"
            title="Cancel sale sequence"
          >
            Cancel Sale
          </button>

          {/* Running Total: Largest, boldest text in the bar (20px+) */}
          <div>
            <div className="text-xs font-bold text-slate-500">
              Cart: {cartItemCount} cs ({cart.items.length} items)
            </div>
            <div className="text-xl sm:text-2xl font-black text-blue-950 tracking-tight leading-none">
              ₹{money(finalCartTotal)}
            </div>
          </div>
        </div>

        {/* Right Side: Prominent Primary Action Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="btn-bottom-review-cart"
            disabled={cart.items.length === 0}
            onClick={onOpenCart}
            className="min-h-[48px] px-5 py-2.5 rounded-xl font-black text-sm sm:text-base bg-blue-900 hover:bg-blue-950 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-lg transition-transform hover:scale-[1.01]"
          >
            <span>Review Cart ({cart.items.length})</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
