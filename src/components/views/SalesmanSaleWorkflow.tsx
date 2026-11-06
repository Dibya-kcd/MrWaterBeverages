import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SizeChip } from "../common/SizeChip";
import { sizeTheme } from "../../utils/sizeColor";
import {
  Search,
  Mic,
  MicOff,
  Zap,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Plus,
  Minus,
  ShoppingCart,
  Sparkles,
  X,
  Printer,
  Share2,
  RotateCcw,
  Building2,
  Phone,
  ChevronRight,
  Download,
  Calendar,
  Volume2,
  Package,
  Truck,
  UserPlus,
} from 'lucide-react';
import { Bill, BillItem, ExistingCustomer, PriceType, Product, Trip } from '../../types';
import { money } from '../../utils/billing';
import { downloadInvoicePdf } from '../../utils/invoicePdf';
import { InvoiceSuccessCard } from '../billing/InvoiceSuccessCard';
import { normCustName } from '../../context/ledgerHelpers';
import { AddCustomerModal } from '../common/AddCustomerModal';
import {
  startSpeechRecognition,
  parseSpokenQuantityAndProduct,
  ActiveSpeechSession,
} from '../../utils/speechRecognition';
import { useLedger } from '../../context/LedgerContext';
import { useBeatFilter } from '../../hooks/useBeatFilter';
import { BeatFilterBar } from '../common/BeatFilterBar';
import { collectExpiryAlerts } from '../../utils/fefo';
import { todayISO } from "../../utils/dateLocal";

interface SalesmanSaleWorkflowProps {
  confirmedBill: Bill | null;
  setConfirmedBill: (bill: Bill | null) => void;
  cart: {
    items: BillItem[];
    date?: string;
  };
  activeTrip: Trip | null;
  products: Product[];
  customers: ExistingCustomer[];
  selectedRetailer: string;
  setSelectedRetailer: (name: string) => void;
  retailerPhone: string;
  setRetailerPhone: (phone: string) => void;
  /** remembers which registered customer record was picked (empty for a one-off typed name) */
  setRetailerCustomerId?: (id: string) => void;
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
  onCreateNextInvoice?: () => void;
  onOpenCustomerDirectory?: () => void;
  /** Opens the printable invoice preview for a saved bill (used by the Print button on phones). */
  onOpenInvoiceModal?: (bill: Bill) => void;
  onVoiceSearchCustomer: () => void;
  isVoiceSearching: boolean;
  speakAssistiveText: (text: string) => void;
  onSetSalesmanTab: (tab: 'home' | 'sell' | 'vanStock' | 'bills' | 'customerDue' | 'trips') => void;
  orgProfile?: any;
  billingSettings?: any;
  saleDate?: string;
  setSaleDate?: (d: string) => void;
  availableTrips?: Trip[];
  onSelectTripId?: (id: number) => void;
  onOpenNewVanModal?: () => void;
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
  setRetailerCustomerId,
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
  onCreateNextInvoice,
  onOpenInvoiceModal,
  onVoiceSearchCustomer,
  isVoiceSearching,
  speakAssistiveText,
  onSetSalesmanTab,
  orgProfile,
  billingSettings,
  saleDate = todayISO(),
  setSaleDate,
  availableTrips = [],
  onSelectTripId,
  onOpenNewVanModal,
}) => {
  // Read-only ledger data for smart assist (does not change sale / stock behaviour)
  const { inventoryBatches, bills, customers: ledgerCustomers, findBillingCustomer, getCustomerLedger } = useLedger();

  // Local state for search & filtering
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [productAlphaFilter, setProductAlphaFilter] = useState<string>('ALL');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState<boolean>(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState<boolean>(false);

  // Voice Product Search state
  const [isProductVoiceActive, setIsProductVoiceActive] = useState<boolean>(false);
  const [productVoiceTranscript, setProductVoiceTranscript] = useState<string>('');
  const [voiceActionResult, setVoiceActionResult] = useState<{ text: string; type: 'success' | 'warn' } | null>(null);
  const voiceSessionRef = useRef<ActiveSpeechSession | null>(null);

  // Available product categories (strictly from items loaded or available on this vehicle)
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const { loaded, available } = getVehicleStock(activeTrip, p.id);
      if ((loaded > 0 || available > 0) && p.category) {
        set.add(p.category);
      }
    });
    return ['ALL', ...Array.from(set)];
  }, [products, activeTrip, getVehicleStock]);

  // Beat filter (a salesman starts on his own beat). With a beat chosen, tapping the empty search box lists that
  // beat's customers so he can pick the next shop without typing.
  const beatFilter = useBeatFilter();
  const filteredCustomerSuggestions = useMemo(() => {
    const inBeat = beatFilter.apply(customers || []);
    if (!customerSearchQuery.trim()) {
      return beatFilter.active ? [...inBeat].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40) : [];
    }
    const query = customerSearchQuery.toLowerCase().trim();
    return inBeat
      .filter((c) => c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query)))
      .slice(0, 12);
  }, [customers, customerSearchQuery, beatFilter.apply, beatFilter.active]);

  // Filtered products on vehicle: strictly only loaded or available products!
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      // ONLY products that are loaded or available on this vehicle run!
      const { loaded, available } = getVehicleStock(activeTrip, prod.id);
      if (loaded <= 0 && available <= 0) {
        return false;
      }

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
  }, [products, activeTrip, getVehicleStock, selectedCategory, searchTerm, productAlphaFilter]);

  // Total items in cart
  const cartItemCount = cart.items.reduce((sum, it) => sum + it.qty, 0);

  // Smart assist — informational only (Salesman mode). No changes to qty, stock, or finalize.
  const salesmanSmartHints = useMemo(() => {
    const hints: { id: string; tone: 'amber' | 'rose' | 'sky' | 'emerald'; text: string }[] = [];
    const asOf = (saleDate || todayISO()).slice(0, 10);

    if (!activeTrip) {
      hints.push({
        id: 'no-trip',
        tone: 'amber',
        text: 'Select an active van / trip before adding stock',
      });
      return hints;
    }

    // Near-expiry / expired on products that are on this van (loaded > 0)
    const vanProductIds = new Set<number>();
    products.forEach((p) => {
      const { loaded, available } = getVehicleStock(activeTrip, p.id);
      if ((loaded || 0) > 0 || (available || 0) > 0) vanProductIds.add(p.id);
    });

    if (vanProductIds.size > 0 && inventoryBatches?.length) {
      const alerts = collectExpiryAlerts(inventoryBatches, products, asOf).filter((a) =>
        vanProductIds.has(a.productId)
      );
      const expired = alerts.filter((a) => a.level === 'expired');
      const critical = alerts.filter((a) => a.level === 'critical');
      if (expired.length > 0) {
        hints.push({
          id: 'exp-block',
          tone: 'rose',
          text: `${expired.length} expired lot(s) linked to van products — do not sell; return or write off`,
        });
      }
      if (critical.length > 0) {
        hints.push({
          id: 'exp-soon',
          tone: 'amber',
          text: `${critical.length} lot(s) expire within 7 days — prioritise those SKUs on this route`,
        });
      }
    }

    // Cart vs van availability
    for (const it of cart.items) {
      const { available } = getVehicleStock(activeTrip, it.productId);
      const avail = Math.max(0, available || 0);
      if (avail > 0 && it.qty >= avail) {
        hints.push({
          id: `full-${it.productId}`,
          tone: 'amber',
          text: `${it.productName}: cart has all ${avail} cases left on this van`,
        });
      }
    }

    // Party previous dues
    const party = (selectedRetailer || '').trim();
    if (party && party.toLowerCase() !== 'cash sale' && party.toLowerCase() !== 'spot cash') {
      let due = 0;
      for (const b of bills || []) {
        if ((b.retailer || '').trim().toLowerCase() === party.toLowerCase()) {
          due += Math.max(0, (b.total || 0) - (b.amountPaid || 0));
        }
      }
      if (due > 1) {
        hints.push({
          id: 'party-due',
          tone: 'sky',
          text: `${party} has ₹${money(due)} open on previous bills`,
        });
      }
    }

    // Credit limit + beat
    if (party && party.toLowerCase() !== 'cash sale' && party.toLowerCase() !== 'spot cash') {
      const cust = findBillingCustomer(party, retailerPhone);
      const limit = Number(cust?.creditLimit) || 0;
      if (limit > 0 && cust) {
        const due = Math.max(0, getCustomerLedger(cust.id).rawBalance);
        if (due > limit) {
          hints.push({
            id: 'credit-over',
            tone: 'rose',
            text: `Over credit limit (due ₹${money(due)} / limit ₹${money(limit)}) — collect before more credit`,
          });
        } else if (due > limit * 0.8) {
          hints.push({
            id: 'credit-near',
            tone: 'amber',
            text: `Near credit limit: ₹${money(due)} of ₹${money(limit)}`,
          });
        }
      }
      if (cust && (cust.route || cust.city)) {
        hints.push({
          id: 'route',
          tone: 'sky',
          text: `Beat: ${[cust.route, cust.city].filter(Boolean).join(' · ')}${cust.address ? ' — ' + cust.address : ''}`,
        });
      }
    }


    if (cart.items.length > 0 && hints.filter((h) => h.id !== 'no-trip').length === 0) {
      hints.push({
        id: 'ok',
        tone: 'emerald',
        text: `Van ready · ${cartItemCount} cs in cart · FEFO on save`,
      });
    }

    return hints.slice(0, 4);
  }, [
    saleDate,
    activeTrip,
    products,
    inventoryBatches,
    cart.items,
    getVehicleStock,
    selectedRetailer,
    bills,
    cartItemCount,
    ledgerCustomers,
  ]);


  // Handle Voice Product Search (e.g., "5 Apple Fizz", "dozen cola", "mango")
  const handleStartProductVoiceSearch = () => {
    if (isProductVoiceActive) {
      if (voiceSessionRef.current) {
        voiceSessionRef.current.stop();
      }
      setIsProductVoiceActive(false);
      return;
    }

    setProductVoiceTranscript('');
    setIsProductVoiceActive(true);

    const session = startSpeechRecognition({
      onStart: () => {
        setIsProductVoiceActive(true);
      },
      onInterimResult: (interim) => {
        setProductVoiceTranscript(interim);
      },
      onResult: (transcript) => {
        setIsProductVoiceActive(false);
        setProductVoiceTranscript(transcript);

        const parsed = parseSpokenQuantityAndProduct(transcript);
        if (!parsed.query) {
          setVoiceActionResult({ text: 'Could not understand product name.', type: 'warn' });
          return;
        }

        const queryLower = parsed.query.toLowerCase().trim();

        // Find best matching product from vehicle stock
        const matched = products.find((p) => {
          const nameLower = p.name.toLowerCase();
          return nameLower.includes(queryLower) || queryLower.includes(nameLower);
        }) || products.find((p) => {
          // Token match
          const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);
          const nameLower = p.name.toLowerCase();
          return queryWords.some((w) => nameLower.includes(w));
        });

        if (matched) {
          const { available } = getVehicleStock(activeTrip, matched.id);
          if (available <= 0) {
            setVoiceActionResult({
              text: `${matched.name} is currently OUT OF STOCK on this van.`,
              type: 'warn',
            });
            speakAssistiveText(`${matched.name} is out of stock on this van.`);
          } else {
            const currentInCart = getProductCartQty(matched.id);
            const canAdd = Math.max(0, available - currentInCart);
            const toAdd = Math.min(parsed.quantity, canAdd);

            if (toAdd > 0) {
              onQuickProductCartChange(matched.id, toAdd);
              const msg = `✓ Added ${toAdd} case(s) of ${matched.name} to cart.`;
              setVoiceActionResult({ text: msg, type: 'success' });
              speakAssistiveText(`Added ${toAdd} cases of ${matched.name}`);
            } else {
              setVoiceActionResult({
                text: `Van only has ${available} cases of ${matched.name}, all already in cart!`,
                type: 'warn',
              });
              speakAssistiveText(`All ${available} cases already added to cart.`);
            }
          }
        } else {
          // If no direct single match, filter the beverage search field to help the salesman tap
          setSearchTerm(parsed.query);
          setVoiceActionResult({
            text: `Filtered beverages by "${parsed.query}". Tap the item below to add.`,
            type: 'success',
          });
          speakAssistiveText(`Showing matches for ${parsed.query}`);
        }

        setTimeout(() => {
          setVoiceActionResult(null);
        }, 5000);
      },
      onError: (err) => {
        setIsProductVoiceActive(false);
        setVoiceActionResult({ text: err, type: 'warn' });
        setTimeout(() => setVoiceActionResult(null), 4000);
      },
      onEnd: () => {
        setIsProductVoiceActive(false);
      },
    });

    voiceSessionRef.current = session;
  };

  useEffect(() => {
    return () => {
      if (voiceSessionRef.current) {
        voiceSessionRef.current.abort();
      }
    };
  }, []);

  // =========================================================================
  // VIEW 1: SEPARATE INVOICE CONFIRMATION SCREEN (COMPLETE SALE)
  // =========================================================================
  if (confirmedBill) {
    const handleNextInvoice = () => {
      setConfirmedBill(null);
      if (onCreateNextInvoice) {
        onCreateNextInvoice();
      } else {
        onCancelSaleSequence();
      }
    };

    return (
      <div id="confirmed-sale-screen" className="space-y-4 max-w-none lg:max-w-2xl mx-auto py-2 pb-56 sm:pb-40">
        <InvoiceSuccessCard
          bill={confirmedBill}
          onCreateNextBill={handleNextInvoice}
          onOpenInvoiceModal={onOpenInvoiceModal ? (b) => onOpenInvoiceModal(b) : undefined}
          onOpenHistory={() => {
            setConfirmedBill(null);
            onSetSalesmanTab('bills');
          }}
        />

        {/* Floating Quick Action: Create Next Invoice — Always visible above bottom navigation */}
        <div className="hidden sm:block fixed sm:bottom-20 inset-x-0 z-30 px-3 sm:px-4 pointer-events-none">
          <div className="max-w-2xl mx-auto flex items-center justify-end pointer-events-auto">
            <button
              type="button"
              id="btn-floating-next-invoice"
              onClick={handleNextInvoice}
              className="px-5 py-2.5 rounded-full font-black text-xs sm:text-sm bg-[#0B3D32] hover:bg-[#072720] text-white cursor-pointer shadow-2xl border-2 border-emerald-400 flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 ring-4 ring-emerald-500/20"
            >
              <Plus size={16} strokeWidth={3} />
              <span>Create Next Invoice</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: STREAMLINED SALE SEQUENCE:
  // Step 1: Customer/Shop
  // Step 2: Select Beverages
  // Step 3: Cart Review (Bottom Sticky Bar -> Modal/Review)
  // Step 4: Complete Sale
  // =========================================================================
  return (
    <div id="salesman-sale-flow" className="space-y-4 max-w-none lg:max-w-5xl mx-auto pb-24">
      {/* Voice product action feedback banner */}
      {voiceActionResult && (
        <div
          role="alert"
          className={`p-3 rounded-xl border-2 font-black text-xs sm:text-sm flex items-center justify-between shadow-sm transition-all ${
            voiceActionResult.type === 'success'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
              : 'bg-amber-50 border-amber-500 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {voiceActionResult.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{voiceActionResult.text}</span>
          </div>
          <button aria-label="Close"
            type="button"
            onClick={() => setVoiceActionResult(null)}
            className="p-1 cursor-pointer text-slate-600 hover:text-slate-900"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* VEHICLE & STOCK SOURCE CARD (Unified, non-redundant) */}
      <div
        id="section-stock-source-salesman"
        className={`p-2.5 sm:p-4 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 ${
          isLowVision
            ? 'bg-black text-yellow-300 border-yellow-400'
            : !activeTrip
            ? 'bg-amber-50/90 border-amber-300 text-amber-950'
            : 'bg-gradient-to-r from-sky-50 to-blue-50 border-sky-300 text-sky-950'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isLowVision
                ? 'bg-yellow-400 text-black font-black'
                : !activeTrip
                ? 'bg-amber-600 text-white'
                : 'bg-sky-600 text-white'
            }`}
          >
            {!activeTrip ? <AlertTriangle size={22} /> : <Truck size={22} />}
          </div>
          <div className="min-w-0">
            <div className="hidden sm:block text-[11px] font-black uppercase tracking-wider opacity-80">
              Stock Source / Vehicle Run:
            </div>
            <div className="text-base sm:text-lg font-black truncate">
              {activeTrip ? `${activeTrip.vehicle} (Trip #${activeTrip.id})` : 'Vehicle Not Dispatched'}
            </div>
            {activeTrip ? (
              <div className="text-xs font-semibold opacity-90 truncate">
                Route: {activeTrip.route || 'City Beat'} • Loaded: {Object.values(activeTrip.loaded || {}).reduce((a, b) => a + (Number(b) || 0), 0)} cs
              </div>
            ) : (
              <div className="text-xs font-semibold opacity-90">
                Please select a dispatched vehicle or start a new van run to record sales.
              </div>
            )}
          </div>
        </div>

        {/* Action buttons: Switch Vehicle or Start / Load Van Run */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {availableTrips && availableTrips.length > 0 && onSelectTripId && (
            <select
              value={activeTrip?.id || ''}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val) onSelectTripId(val);
              }}
              className={`p-2 text-xs font-bold rounded-xl border cursor-pointer focus:outline-none ${
                isLowVision
                  ? 'bg-black text-yellow-300 border-yellow-400'
                  : 'bg-white text-slate-800 border-sky-300'
              }`}
              style={{ minHeight: '40px' }}
              title="Select or Switch Vehicle Run"
              aria-label="Select or Switch Vehicle Run"
            >
              {!activeTrip && <option value="">Select Dispatched Van...</option>}
              {availableTrips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.vehicle} (Trip #{t.id})
                </option>
              ))}
            </select>
          )}

          {onOpenNewVanModal && (
            <button
              type="button"
              onClick={onOpenNewVanModal}
              className={`px-3.5 py-2 text-xs font-black rounded-xl border flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors ${
                isLowVision
                  ? 'bg-yellow-400 text-black border-yellow-400 hover:bg-yellow-300'
                  : !activeTrip
                  ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600'
                  : 'bg-sky-700 hover:bg-sky-800 text-white border-sky-700'
              }`}
              style={{ minHeight: '40px' }}
            >
              <Plus size={15} />
              <span>{activeTrip ? 'New Van Run' : 'Start / Load Van Run'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 1. CUSTOMER / SHOP DETAILS (Simplified: No big header, no numbering,  */}
      {/* no directory button, compact Speak Name & Spot Cash, Clean Sale Date)  */}
      {/* ===================================================================== */}
      <div
        id="section-customer-details"
        className="p-2.5 sm:p-4 rounded-2xl border-2 bg-white shadow-sm space-y-2 sm:space-y-3"
        style={{ borderColor: palette.line }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 size={18} className="text-sky-700 shrink-0" />
            <span className="text-sm font-black text-slate-900">
              Customer / Shop Details
            </span>
            {!selectedRetailer && (
              <button
                type="button"
                id="btn-header-cart-salesman"
                onClick={onOpenCart}
                disabled={cart.items.length === 0}
                className={`relative shrink-0 size-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                  cart.items.length > 0
                    ? 'bg-[#0B3D32] border-[#0B3D32] text-white hover:brightness-110'
                    : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                }`}
                title={cart.items.length > 0 ? `Cart · ${cart.items.length} item(s)` : 'Cart is empty'}
                aria-label={cart.items.length > 0 ? `Open cart, ${cart.items.length} items` : 'Cart empty'}
              >
                <ShoppingCart size={17} />
                {cart.items.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-400 text-slate-900 text-[11px] font-black flex items-center justify-center leading-none border border-white shadow-sm">
                    {cart.items.length > 99 ? '99+' : cart.items.length}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Cancel sale sequence button (if active) */}
          {(selectedRetailer || cart.items.length > 0) && (
            <button
              type="button"
              id="btn-cancel-sale-sequence"
              onClick={() => {
                if (cart.items.length > 0) {
                  setShowCancelConfirm(true);
                } else {
                  onCancelSaleSequence();
                }
              }}
              className="px-2.5 py-1 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
            >
              <X size={13} />
              <span>Cancel Sale</span>
            </button>
          )}
        </div>

        {selectedRetailer ? (
          /* Active Customer Display Card */
          <div className="p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/80 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-black uppercase text-emerald-800">Billed To:</div>
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-base sm:text-lg font-black text-slate-900 truncate">{selectedRetailer}</div>
                {/* Cart icon beside customer name */}
                <button
                  type="button"
                  id="btn-customer-cart"
                  onClick={onOpenCart}
                  disabled={cart.items.length === 0}
                  className={`relative shrink-0 size-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                    cart.items.length > 0
                      ? 'bg-[#0B3D32] border-[#0B3D32] text-white hover:brightness-110'
                      : 'bg-white border-emerald-200 text-slate-400 cursor-not-allowed'
                  }`}
                  title={cart.items.length > 0 ? `Cart · ${cart.items.length} item(s)` : 'Cart is empty'}
                  aria-label={cart.items.length > 0 ? `Open cart, ${cart.items.length} items` : 'Cart empty'}
                >
                  <ShoppingCart size={17} />
                  {cart.items.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-400 text-slate-900 text-[11px] font-black flex items-center justify-center leading-none border border-white shadow-sm">
                      {cart.items.length > 99 ? '99+' : cart.items.length}
                    </span>
                  )}
                </button>
              </div>
              {retailerPhone && (
                <div className="text-xs font-bold text-slate-600 flex items-center gap-1 mt-0.5">
                  <Phone size={12} />
                  <span>{retailerPhone}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                id="btn-change-customer"
                onClick={() => {
                  setSelectedRetailer('');
                  setRetailerPhone('');
                  setRetailerCustomerId?.('');
                  speakAssistiveText('Customer deselected.');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 font-bold text-xs cursor-pointer shadow-sm"
              >
                Change
              </button>
              <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
            </div>
          </div>
        ) : (
          /* Search & Compact Quick Actions (Speak Name, Spot Cash Sale) */
          <div className="space-y-2.5">
            <BeatFilterBar value={beatFilter.value} onChange={beatFilter.setValue} options={beatFilter.options} />
            {/* Direct Instant Search Bar with Autocomplete */}
            <div className="relative">
              <div className="relative flex items-center">
                <Search size={18} className="absolute left-3 text-slate-400 pointer-events-none" />
                <input enterKeyHint="search"
                  type="text"
                  id="input-customer-search-direct"
                  placeholder="Search customer by shop name or phone number..."
                  value={customerSearchQuery}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  className="w-full pl-10 pr-16 min-h-[46px] py-2.5 rounded-xl border-2 border-slate-300 text-sm sm:text-base font-extrabold text-slate-900 focus:outline-none focus:border-sky-600 shadow-sm bg-white"
                />
                {customerSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerSearchQuery('');
                      setShowCustomerDropdown(false);
                    }}
                    className="absolute right-3 min-h-[40px] px-2 text-xs font-black text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {showCustomerDropdown && filteredCustomerSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border-2 border-sky-600 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {filteredCustomerSuggestions.map((cust) => (
                    <button
                      key={`${cust.id || ''}|${cust.phone || ''}|${cust.name}`}
                      type="button"
                      onClick={() => {
                        setSelectedRetailer(cust.name);
                        setRetailerPhone(cust.phone || '');
                        setRetailerCustomerId?.(cust.id || '');
                        setShowCustomerDropdown(false);
                        setCustomerSearchQuery('');
                        speakAssistiveText(`Selected ${cust.name}`);
                      }}
                      className="w-full min-h-[48px] p-3 text-left hover:bg-sky-50 active:bg-blue-100 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm sm:text-base font-black text-slate-900 truncate">{cust.name}</div>
                        <div className="text-xs text-slate-500 font-bold flex items-center gap-2 flex-wrap mt-0.5">
                          {cust.phone && <span>Ph: {cust.phone}</span>}
                          {cust.balanceDue > 0 && (
                            <span className="text-rose-700 font-black">Due: ₹{money(cust.balanceDue)}</span>
                          )}
                          {cust.balanceDue <= 0 && (cust.advance || 0) > 0.004 && (
                            <span className="text-sky-700 font-black">Advance: ₹{money(cust.advance || 0)}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-400 shrink-0 ml-2" />
                    </button>
                  ))}

                  {/* Quick button to register new customer with current search text */}
                  {customerSearchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => setShowAddCustomerModal(true)}
                      className="w-full p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 border-t border-emerald-200 cursor-pointer transition-colors"
                    >
                      <UserPlus size={16} className="text-emerald-700" />
                      <span>Register "{customerSearchQuery.trim()}" as New Customer</span>
                    </button>
                  )}
                </div>
              )}

              {/* Match not found custom entry */}
              {showCustomerDropdown && customerSearchQuery.trim() && filteredCustomerSuggestions.length === 0 && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border-2 border-slate-300 rounded-xl shadow-2xl p-4 text-center space-y-2.5">
                  <p className="text-xs font-bold text-slate-500">No registered shop found matching "{customerSearchQuery}".</p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomerDropdown(false);
                        setShowAddCustomerModal(true);
                      }}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <UserPlus size={15} />
                      <span>+ Register as New Customer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const typed = customerSearchQuery.trim();
                        // A name typed slightly differently ("Sharma Stores", "M/s Sharma Store") may still be a
                        // registered shop: use that record instead of creating a look-alike free-text customer.
                        const key = normCustName(typed);
                        const same = key ? (customers || []).filter((c) => normCustName(c.name) === key) : [];
                        if (same.length === 1) {
                          setSelectedRetailer(same[0].name);
                          setRetailerPhone(same[0].phone || '');
                          setRetailerCustomerId?.(same[0].id || '');
                          speakAssistiveText(`Selected ${same[0].name}`);
                        } else {
                          setSelectedRetailer(typed);
                          // never carry the previous shop's phone / record onto a different name
                          setRetailerPhone('');
                          setRetailerCustomerId?.('');
                          speakAssistiveText(`Selected ${typed}`);
                        }
                        setShowCustomerDropdown(false);
                        setCustomerSearchQuery('');
                      }}
                      className="w-full sm:w-auto px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer"
                    >
                      Use once for this bill
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions: Add New Customer, Speak Name & Spot Cash Sale */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-0.5 sm:pt-1">
              {/* Add New Customer Button */}
              <button
                type="button"
                id="btn-salesman-add-new-customer"
                onClick={() => setShowAddCustomerModal(true)}
                className="min-h-[44px] py-2 px-3 rounded-xl border-2 border-slate-900 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-transform active:scale-[0.99]"
              >
                <UserPlus size={17} className="text-emerald-400" />
                <span className="sm:hidden">Add</span><span className="hidden sm:inline">+ Add Customer</span>
              </button>

              {/* Voice Search Button */}
              <button
                type="button"
                id="btn-voice-search-customer"
                onClick={onVoiceSearchCustomer}
                className={`min-h-[44px] py-2 px-3 rounded-xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all ${
                  isVoiceSearching
                    ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300'
                }`}
              >
                {isVoiceSearching ? (
                  <>
                    <MicOff size={18} className="animate-spin" />
                    <span className="sm:hidden">Listening</span><span className="hidden sm:inline">Listening...</span>
                  </>
                ) : (
                  <>
                    <Mic size={18} className="text-amber-800" />
                    <span className="sm:hidden">Speak</span><span className="hidden sm:inline">Speak Name</span>
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
                  setRetailerCustomerId?.('');
                  speakAssistiveText('Spot cash customer selected.');
                }}
                className="min-h-[44px] py-2 px-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
              >
                <Zap size={17} className="text-emerald-600" />
                <span className="sm:hidden">Spot cash</span><span className="hidden sm:inline">Spot Cash Sale</span>
              </button>
            </div>
          </div>
        )}

        {/* Simplified Sale Date (Defaults to today, simple & selectable) */}
        <div className="pt-1.5 sm:pt-2 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
          <label htmlFor="salesman-sale-date-input" className="font-extrabold text-slate-700 flex items-center gap-1.5">
            <Calendar size={14} className="text-slate-500" />
            <span>Sale Date:</span>
          </label>
          <input
            id="salesman-sale-date-input"
            type="date"
            value={saleDate}
            onChange={(e) => {
              if (setSaleDate) {
                setSaleDate(e.target.value);
              }
            }}
            className="px-2.5 py-1 rounded-lg border border-slate-300 font-bold text-slate-900 bg-white focus:outline-none focus:border-sky-600"
          />
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. SELECT BEVERAGES (VEHICLE STOCK)                                   */}
      {/* Product names wrap naturally and are never cut off. Tap to add 1,      */}
      {/* repeat to increase, minus to decrease. Spoken product search included. */}
      
      {/* Smart assist — hints only. Larger type when Easy View is on. */}
      {salesmanSmartHints.length > 0 && (
        <div
          id="salesman-smart-assist"
          role="status"
          aria-live="polite"
          className={`rounded-2xl border shadow-sm space-y-1.5 ${
            isLowVision
              ? 'border-4 border-black bg-white p-4'
              : 'border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3'
          }`}
        >
          <div
            className={`flex items-center gap-1.5 font-black uppercase tracking-wider ${
              isLowVision ? 'text-sm text-black' : 'text-[11px] text-slate-500'
            }`}
          >
            <Sparkles size={isLowVision ? 18 : 13} className={isLowVision ? 'text-black' : 'text-sky-600'} />
            Smart assist
            <span className={`font-medium normal-case tracking-normal ${isLowVision ? 'text-slate-800' : 'text-slate-400'}`}>
              · van / expiry / dues — does not change the sale
            </span>
          </div>
          {salesmanSmartHints.map((h) => (
            <div
              key={h.id}
              className={`font-bold rounded-lg border ${
                isLowVision ? 'text-base px-3 py-2.5' : 'text-xs font-semibold px-2.5 py-1.5'
              } ${
                h.tone === 'rose'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : h.tone === 'amber'
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : h.tone === 'sky'
                      ? 'bg-sky-50 border-sky-200 text-sky-950'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              {h.text}
            </div>
          ))}
        </div>
      )}

{/* ===================================================================== */}
      <div
        id="section-beverage-selection"
        className="p-2.5 sm:p-4 rounded-2xl border-2 bg-white shadow-sm space-y-2.5 sm:space-y-3"
        style={{ borderColor: palette.line }}
      >
        <div className="hidden sm:flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-sky-700" />
            <span className="text-sm font-black text-slate-900">
              Select Beverages (Vehicle Stock)
            </span>
          </div>

          {/* Voice Product Search Button */}
          <button
            type="button"
            id="btn-voice-product-search"
            onClick={handleStartProductVoiceSearch}
            className={`px-3 py-1.5 rounded-xl border-2 font-black flex items-center gap-1.5 cursor-pointer shadow-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
              isLowVision ? 'min-h-[52px] text-sm' : 'min-h-[44px] text-xs'
            } ${
              isProductVoiceActive
                ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                : 'bg-sky-50 hover:bg-sky-100 text-blue-950 border-blue-300'
            }`}
          >
            {isProductVoiceActive ? (
              <>
                <MicOff size={16} className="animate-spin" />
                <span>{productVoiceTranscript ? `"${productVoiceTranscript}"` : 'Listening item...'}</span>
              </>
            ) : (
              <>
                <Mic size={16} className="text-sky-700" />
                <span>Speak Item (e.g. "5 Apple Fizz")</span>
              </>
            )}
          </button>
        </div>

        {/* Product Controls: Text Search & Quick Alphabet Jump */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Search Input */}
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input enterKeyHint="search"
                type="text"
                id="input-beverage-search"
                placeholder="Search beverages by name or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 min-h-[44px] sm:min-h-0 rounded-xl border-2 border-slate-200 text-sm sm:text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-600 bg-white"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Voice search — icon only on phones (full button stays in the header on larger screens) */}
            <button
              type="button"
              id="btn-voice-product-search-mobile"
              onClick={handleStartProductVoiceSearch}
              aria-label="Speak an item, for example 5 Apple Fizz"
              className={`sm:hidden shrink-0 size-11 rounded-xl border-2 flex items-center justify-center cursor-pointer ${
                isProductVoiceActive
                  ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                  : 'bg-white text-sky-700 border-slate-200 active:bg-sky-50'
              }`}
            >
              {isProductVoiceActive ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            {/* Category Filter Pills */}
            <div className="order-last w-full sm:order-none sm:w-auto flex items-center gap-1.5 sm:gap-1 overflow-x-auto pb-1 max-w-full no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 sm:px-2.5 py-2 sm:py-1 min-h-[40px] sm:min-h-0 rounded-full sm:rounded-lg text-sm sm:text-xs font-black whitespace-nowrap cursor-pointer transition-colors ${
                    selectedCategory === cat
                      ? 'bg-[#0B3D32] sm:bg-sky-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Alphabet Quick Jump Pills */}
          <div className="hidden sm:flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="text-[11px] font-black text-slate-500 uppercase shrink-0">Jump:</span>
            {['ALL', 'A-D', 'E-H', 'I-L', 'M-P', 'Q-T', 'U-Z'].map((grp) => {
              const active = productAlphaFilter === grp;
              return (
                <button
                  key={grp}
                  type="button"
                  onClick={() => {
                    setProductAlphaFilter(grp);
                    speakAssistiveText(`Filtered to ${grp}`);
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

        {/* BEVERAGE CARDS GRID */}
        {/* Full product name visibility (never cut off), Stock info positioned lower, Tap to add 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 pt-0 sm:pt-1">
          {filteredProducts.map((prod) => {
            const { available } = getVehicleStock(activeTrip, prod.id);
            const inCartQty = getProductCartQty(prod.id);
            const isOutOfStock = available <= 0;
            const price = prod.retail || prod.wholesale;

            const atMax = inCartQty >= available;

            return (
              <React.Fragment key={prod.id}>
              {/* PHONE: one compact row per product (~78px) — name, size, rate, van stock, Add / stepper */}
              <div
                id={`beverage-row-${prod.id}`}
                className={`sm:hidden flex items-center gap-2 rounded-xl border bg-white pl-2.5 pr-2 py-2 ${
                  inCartQty > 0 ? 'border-sky-500 bg-sky-50/50' : isOutOfStock ? 'border-slate-200 opacity-60' : 'border-slate-200'
                }`}
                style={{ borderLeftWidth: 5, borderLeftColor: sizeTheme(prod.volume, prod.name).hex }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-black text-slate-900 leading-snug break-words">{prod.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <SizeChip volume={prod.volume} pack={prod.pack} name={prod.name} />
                    <span className="text-sm font-black text-slate-900">
                      ₹{money(price)}<span className="text-xs font-semibold text-slate-500">/cs</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[11px] font-black ${
                        isOutOfStock
                          ? 'bg-rose-100 text-rose-800'
                          : available < 5
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {isOutOfStock ? 'Empty' : `${available} in van`}
                    </span>
                  </div>
                </div>
                {isOutOfStock ? (
                  <span className="shrink-0 text-xs font-bold text-slate-400 pr-1">Out of stock</span>
                ) : inCartQty === 0 ? (
                  <button
                    type="button"
                    id={`btn-add-beverage-m-${prod.id}`}
                    onClick={() => onQuickProductCartChange(prod.id, 1)}
                    className="shrink-0 min-h-[44px] min-w-[84px] px-3 rounded-xl bg-sky-600 active:bg-sky-700 text-white text-sm font-black flex items-center justify-center gap-1"
                    aria-label={`Add ${prod.name}`}
                  >
                    <Plus size={16} strokeWidth={3} /> Add
                  </button>
                ) : (
                  <div className="shrink-0 flex items-center rounded-xl border-2 border-sky-600 bg-white overflow-hidden">
                    <button
                      type="button"
                      id={`btn-minus-beverage-m-${prod.id}`}
                      onClick={() => onQuickProductCartChange(prod.id, -1)}
                      className="size-11 flex items-center justify-center text-slate-900 active:bg-slate-100"
                      aria-label={`Decrease ${prod.name}`}
                    >
                      <Minus size={18} />
                    </button>
                    <span className="min-w-[30px] text-center text-lg font-black text-sky-700">{inCartQty}</span>
                    <button
                      type="button"
                      id={`btn-plus-beverage-m-${prod.id}`}
                      disabled={atMax}
                      onClick={() => onQuickProductCartChange(prod.id, 1)}
                      className="size-11 flex items-center justify-center bg-sky-600 text-white active:bg-sky-700 disabled:opacity-40"
                      aria-label={`Increase ${prod.name}`}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                )}
              </div>

              {/* TABLET / DESKTOP: original card */}
              <div
                id={`beverage-card-${prod.id}`}
                onClick={() => {
                  // Direct tap on card increments by 1 if stock available
                  if (available > 0 && inCartQty < available) {
                    onQuickProductCartChange(prod.id, 1);
                  }
                }}
                className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all hidden sm:flex flex-col justify-between cursor-pointer select-none ${
                  inCartQty > 0
                    ? 'border-sky-600 bg-sky-50/50 shadow-md ring-2 ring-blue-900/20'
                    : isOutOfStock
                    ? 'border-slate-200 bg-slate-50/70 opacity-60'
                    : 'border-slate-200 bg-white hover:border-blue-700 hover:shadow-sm'
                }`}
                style={{ borderLeftWidth: 6, borderLeftColor: sizeTheme(prod.volume, prod.name).hex }}
              >
                <div>
                  {/* FULL PRODUCT NAME: Never cut off or hidden, allows wrapping to multiple lines */}
                  <div className="w-full mb-2">
                    <h3
                      className="font-black text-base sm:text-lg text-slate-900 break-words whitespace-normal leading-snug"
                      style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                    >
                      {prod.name}
                    </h3>
                    <div className="text-xs text-slate-500 font-bold flex items-center gap-1.5 mt-1 flex-wrap">
                      {prod.category && (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-extrabold text-[11px]">
                          {prod.category}
                        </span>
                      )}
                      <SizeChip volume={prod.volume} pack={prod.pack} name={prod.name} />
                    </div>
                  </div>

                  {/* RATE & IN-VAN STOCK ROW: Positioned cleanly below the full product name */}
                  <div className="flex items-center justify-between gap-2 py-2 border-t border-slate-100 flex-wrap">
                    <div className="text-sm font-black text-slate-900">
                      ₹{money(price)}
                      <span className="text-xs font-semibold text-slate-500"> /case</span>
                    </div>

                    {/* Dominant In-Van Stock Info */}
                    <div
                      className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-tight flex items-center gap-1 ${
                        isOutOfStock
                          ? 'bg-rose-100 text-rose-900 border border-rose-300'
                          : available < 5
                          ? 'bg-amber-100 text-amber-950 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                      }`}
                    >
                      <span>{available} in van</span>
                      {isOutOfStock && <span className="font-normal">(Empty)</span>}
                    </div>
                  </div>
                </div>

                {/* DIRECT ACTION: Tap to add 1, repeat to increase, minus to decrease */}
                <div className="pt-2.5 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                  {isOutOfStock ? (
                    <div className="w-full py-2.5 px-3 rounded-xl bg-slate-100 text-slate-500 font-bold text-xs text-center border border-slate-200">
                      Out of Stock in Van
                    </div>
                  ) : inCartQty === 0 ? (
                    <button
                      type="button"
                      id={`btn-add-beverage-${prod.id}`}
                      onClick={() => onQuickProductCartChange(prod.id, 1)}
                      className="w-full min-h-[46px] py-2.5 px-4 rounded-xl font-black text-sm bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors"
                    >
                      <Plus size={18} />
                      <span>Tap to Add (1 cs)</span>
                    </button>
                  ) : (
                    <div className="w-full flex items-center justify-between gap-2 bg-white border-2 border-sky-600 rounded-xl p-1 shadow-sm">
                      <button
                        type="button"
                        id={`btn-minus-beverage-${prod.id}`}
                        onClick={() => onQuickProductCartChange(prod.id, -1)}
                        className={`rounded-lg font-black flex items-center justify-center cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
                          isLowVision
                            ? 'min-w-[52px] min-h-[52px] w-13 h-13 bg-black text-yellow-300'
                            : 'min-w-[48px] min-h-[48px] w-12 h-12 bg-slate-100 hover:bg-slate-200 text-slate-900'
                        }`}
                        aria-label={`Decrease ${prod.name}`}
                      >
                        <Minus size={isLowVision ? 24 : 20} />
                      </button>

                      <div className={`flex-1 text-center font-black ${isLowVision ? 'text-slate-900' : 'text-slate-900 text-base'}`}>
                        <span className={isLowVision ? 'text-2xl text-black' : 'text-lg text-sky-700'}>{inCartQty}</span>
                        <span className={`font-bold ml-1 ${isLowVision ? 'text-sm text-black' : 'text-xs text-slate-500'}`}>in cart</span>
                      </div>

                      <button
                        type="button"
                        id={`btn-plus-beverage-${prod.id}`}
                        disabled={inCartQty >= available}
                        onClick={() => onQuickProductCartChange(prod.id, 1)}
                        className={`rounded-lg font-black flex items-center justify-center cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-30 disabled:cursor-not-allowed ${
                          isLowVision
                            ? 'min-w-[52px] min-h-[52px] w-13 h-13 bg-yellow-300 text-black border-2 border-black'
                            : 'min-w-[48px] min-h-[48px] w-12 h-12 bg-sky-600 hover:bg-sky-700 text-white'
                        }`}
                        aria-label={`Increase ${prod.name}`}
                      >
                        <Plus size={isLowVision ? 24 : 20} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              </React.Fragment>
            );
          })}
        </div>

        {filteredProducts.length === 0 && (
          <div className="p-8 text-center border-2 border-dashed rounded-2xl bg-slate-50 space-y-2.5">
            <Package size={36} className="mx-auto text-slate-400" />
            <div className="text-slate-800 text-sm font-black">
              {searchTerm || selectedCategory !== 'ALL' || productAlphaFilter !== 'ALL'
                ? 'No loaded beverages match the selected filter.'
                : 'No products loaded on this vehicle run.'}
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {searchTerm || selectedCategory !== 'ALL' || productAlphaFilter !== 'ALL'
                ? 'Try clearing your search term or resetting the category filter.'
                : 'Please load beverage stock onto your vehicle in the Trips menu before creating bills.'}
            </p>
            {searchTerm || selectedCategory !== 'ALL' || productAlphaFilter !== 'ALL' ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('ALL');
                  setProductAlphaFilter('ALL');
                }}
                className="px-3.5 py-1.5 text-xs font-bold bg-sky-600 text-white rounded-lg hover:bg-sky-500 cursor-pointer"
              >
                Reset Filters
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSetSalesmanTab('trips')}
                className="px-4 py-2 text-xs font-black bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl cursor-pointer shadow-sm inline-flex items-center gap-1.5"
              >
                <Truck size={15} />
                <span>Go to Trips to Load Van</span>
              </button>
            )}
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
      {/* 3. CART REVIEW TRIGGER BAR (Fixed at bottom above nav)                */}
      {/* ===================================================================== */}
      {/* Bottom bar: always visible while the cart has items — Cancel on the left, running total in the
          middle, Review & Finalise on the right (big buttons, plain words, for first-time users). */}
      <div
        id="salesman-cart-bottom-bar"
        className={`${cart.items.length > 0 ? 'flex' : 'hidden'} sticky bottom-16 z-30 rounded-2xl border-2 shadow-2xl items-center gap-2 ${
          isLowVision
            ? 'p-3 border-4 border-black bg-yellow-300 text-black'
            : 'p-2 pl-3 border-[#0B3D32] bg-[#0B3D32] text-white'
        }`}
        role="region"
        aria-label="Running cart total"
      >
        <button
          type="button"
          id="btn-bottom-cancel-sale"
          onClick={() => setShowCancelConfirm(true)}
          className={`shrink-0 min-h-[56px] px-3 rounded-xl font-black text-xs hidden sm:flex flex-col items-center justify-center gap-0.5 cursor-pointer border-2 ${
            isLowVision ? 'border-black bg-white text-black' : 'border-rose-300 bg-rose-50 text-rose-700 active:bg-rose-100'
          }`}
          aria-label="Cancel this sale and clear the cart"
        >
          <X size={18} />
          <span>Cancel</span>
        </button>

        <div className="min-w-0 flex-1 text-left sm:text-center">
          <div className={`font-bold leading-tight ${isLowVision ? 'text-sm text-black' : 'text-xs text-emerald-100/90'}`}>
            {cart.items.length} item{cart.items.length !== 1 ? 's' : ''} · {cartItemCount} case{cartItemCount !== 1 ? 's' : ''}
          </div>
          <div
            className={`font-black tracking-tight leading-none ${isLowVision ? 'text-2xl text-black' : 'text-xl text-white'}`}
            aria-live="polite"
            aria-atomic="true"
          >
            ₹{money(finalCartTotal)}
          </div>
        </div>

        <button
          type="button"
          id="btn-bottom-review-cart"
          disabled={cart.items.length === 0}
          onClick={onOpenCart}
          aria-label={`Review and finalise, ${cart.items.length} items, total rupees ${money(finalCartTotal)}`}
          className={`shrink-0 min-h-[56px] px-4 rounded-xl font-black flex flex-col items-center justify-center gap-0.5 cursor-pointer shadow-lg text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-40 disabled:cursor-not-allowed ${
            isLowVision ? 'bg-black text-yellow-300 border-4 border-black' : 'bg-white active:bg-emerald-50 text-[#0B3D32]'
          }`}
        >
          <CheckCircle2 size={18} />
          <span>Review cart</span>
        </button>
      </div>

      {/* Add New Customer Modal for Salesman */}
      <AddCustomerModal
        isOpen={showAddCustomerModal}
        onClose={() => setShowAddCustomerModal(false)}
        initialName={customerSearchQuery.trim()}
        defaultRoute={activeTrip?.route || ''}
        isLowVision={isLowVision}
        onCustomerCreated={(newCust) => {
          setSelectedRetailer(newCust.name);
          setRetailerPhone(newCust.phone || '');
          setRetailerCustomerId?.(newCust.id);
          setShowCustomerDropdown(false);
          setCustomerSearchQuery('');
          speakAssistiveText(`Selected ${newCust.name}`);
        }}
      />
    </div>
  );
};
