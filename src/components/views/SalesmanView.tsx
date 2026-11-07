import React, { useState, useMemo, useEffect, useRef } from 'react';
import { makeSalesmanMatcher } from "../../utils/salesmanMatch";
import { SalesmanTripScreens, SalesmanTripScreenMode } from "./trips/SalesmanTripScreens";
import { NewTripSheet } from "./trips/NewTripSheet";
import { useCreateTrip } from "./trips/useCreateTrip";
import { SizeChip } from "../common/SizeChip";
import { sizeTheme, sizeStripe } from "../../utils/sizeColor";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  Filter,
  History as HistoryIcon,
  IndianRupee,
  Layers,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  Minus,
  Package,
  Percent,
  Phone,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Truck,
  User,
  UserCheck,
  UserPlus,
  Volume2,
  X,
  Zap,
  CheckSquare,
  ListPlus,
  Download,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { LanguageToggle } from '../common/LanguageToggle';
import { OdiaName } from '../common/OdiaName';
import { normCustName, splitSameNameShops } from '../../context/ledgerHelpers';
import { Bill, BillItem, ExistingCustomer, PriceType, Product, Trip } from '../../types';
import { billTotals, buildBillText, computeLine, normalizeGstFraction, money, schemeLabel, whatsappLink, resolveProductGstRate, resolveProductHsn, formatProductVolPack, volumeFromName } from '../../utils/billing';
import { downloadInvoicePdf } from '../../utils/invoicePdf';
import { getProductOdiaName, getCustomerOdiaName } from '../../utils/displayName';
import { isSpeechRecognitionSupported, speakAssistiveText, startSpeechRecognition } from '../../utils/speechRecognition';
import { CustomerSelector } from '../common/CustomerSelector';
import { AddCustomerModal } from '../common/AddCustomerModal';
import { TaxInvoiceModal } from '../common/TaxInvoiceModal';
import { SalesmanCartModal } from '../common/SalesmanCartModal';
import { SalesmanSaleWorkflow } from './SalesmanSaleWorkflow';
import { SalesmanCustomerDueLookup } from './SalesmanCustomerDueLookup';
import { billBalance } from '../../utils/salesReturns';
import { formatBeatStops, beatLabel } from '../../constants/beats';
import { useBeats } from '../../hooks/useBeats';
import { todayISO } from "../../utils/dateLocal";

export const SalesmanView: React.FC = () => {
  const { activeBeats } = useBeats();
  const createTrip = useCreateTrip();
  const {
    trips,
    bills,
    products,
    warehouses,
    defaultWarehouse,
    warehouseStock,
    addTrip,
    finalizeBill,
    getVehicleStock,
    cart,
    setCart,
    palette,
    lowVisionMode,
    setLowVisionMode,
    lowVisionStickyPosition,
    fz,
    scale,
    orgProfile,
    billingSettings,
    gstMode,
    currentUser,
    currentRole,
    activeSalesman,
    logout,
    recordPayment,
    activePromoFor,
    payments,
    salesmen,
  } = useLedger();

  // Mode: 'normal' vs 'lowVision' (Easy View). Single source of truth is the
  // shared ledger flag, so Settings and this screen always agree.
  const salesmanMode: 'normal' | 'lowVision' = lowVisionMode ? 'lowVision' : 'normal';

  const handleSetMode = (mode: 'normal' | 'lowVision') => {
    setLowVisionMode(mode === 'lowVision');
    try {
      speakAssistiveText(
        mode === 'lowVision'
          ? 'Easy View on. Larger text, high contrast, voice friendly.'
          : 'Normal mode on.'
      );
    } catch {
      // ignore
    }
  };

  // Today's date string YYYY-MM-DD
  const todayStr = useMemo(() => todayISO(), []);

  // Filter trips: Salesman only sees their assigned trips; Admin sees all trips
  const userSalesmanId = currentUser?.role === 'salesman' ? currentUser.id : undefined;
  const userSalesmanName = currentUser?.role === 'salesman' ? currentUser.name : undefined;

  // One tolerant matcher for trips, bills and payments (id, same phone, name ignoring case/spaces/dots)
  const matchesMe = useMemo(
    () =>
      makeSalesmanMatcher(
        {
          id: userSalesmanId,
          name: userSalesmanName,
          phone: currentUser?.role === 'salesman' ? currentUser.phone : undefined,
        },
        salesmen,
      ),
    [userSalesmanId, userSalesmanName, currentUser, salesmen],
  );

  const relevantTrips = useMemo(() => {
    let list = trips;
    if (currentUser?.role === 'salesman') {
      list = trips.filter((t) => matchesMe(t));
    }
    // Always sort newest trips first (by date descending, then id descending)
    return [...list].sort((a, b) => {
      const da = a.date || '';
      const db = b.date || '';
      if (db !== da) return db.localeCompare(da);
      return Number(b.id) - Number(a.id);
    });
  }, [trips, currentUser, matchesMe]);

  // Default to showing only trips with status: 'out' from today's date
  const todayOutTrips = useMemo(() => {
    return relevantTrips.filter((t) => t.status === 'out' && (!t.date || t.date === todayStr));
  }, [relevantTrips, todayStr]);

  // Any currently open/out trip regardless of date
  const anyOutTrips = useMemo(() => {
    return relevantTrips.filter((t) => t.status === 'out');
  }, [relevantTrips]);

  // Older / closed trips
  const olderOrClosedTrips = useMemo(() => {
    return relevantTrips.filter((t) => t.status === 'closed');
  }, [relevantTrips]);

  // Trip history visibility toggle
  const [showTripHistory, setShowTripHistory] = useState<boolean>(false);

  // Trips displayed in the selector list: ONLY show active out trips! Never show closed trips by default!
  const displayedTrips = useMemo(() => {
    if (showTripHistory) return relevantTrips;
    return anyOutTrips;
  }, [showTripHistory, relevantTrips, anyOutTrips]);

  // Trip history: search + "show more" so every past run can be reached, not just the latest few
  const [tripSearch, setTripSearch] = useState('');
  const [tripLimit, setTripLimit] = useState(30);
  const matchedTrips = useMemo(() => {
    const q = tripSearch.trim().toLowerCase();
    if (!showTripHistory || !q) return displayedTrips;
    return displayedTrips.filter(
      (t) =>
        (t.vehicle || '').toLowerCase().includes(q) ||
        (t.route || '').toLowerCase().includes(q) ||
        (t.date || '').includes(q) ||
        String(t.id).includes(q),
    );
  }, [displayedTrips, tripSearch, showTripHistory]);
  const shownTrips = showTripHistory ? matchedTrips.slice(0, tripLimit) : matchedTrips;

  // Selected vehicle/trip selection: ONLY default to an 'out' trip! Never a closed trip!
  const [selectedTripId, setSelectedTripId] = useState<number | null>(() => {
    return todayOutTrips[0]?.id ?? anyOutTrips[0]?.id ?? null;
  });

  // Keep selectedTripId valid if trips change
  useEffect(() => {
    if (selectedTripId !== null) {
      const exists = relevantTrips.some((t) => t.id === selectedTripId);
      if (!exists) {
        const nextId = todayOutTrips[0]?.id ?? anyOutTrips[0]?.id ?? null;
        setSelectedTripId(nextId);
      }
    } else if (todayOutTrips.length > 0 || anyOutTrips.length > 0) {
      const nextId = todayOutTrips[0]?.id ?? anyOutTrips[0]?.id ?? null;
      if (nextId !== null) {
        setSelectedTripId(nextId);
      }
    }
  }, [relevantTrips, selectedTripId, todayOutTrips, anyOutTrips]);

  // CRITICAL: activeTrip MUST strictly be an open trip (status === 'out'). A closed trip is NEVER active.
  const activeTrip: Trip | null = useMemo(() => {
    if (selectedTripId === null) return null;
    const found = trips.find((t) => t.id === selectedTripId);
    return found && found.status === 'out' ? found : null;
  }, [trips, selectedTripId]);

  // Quick Trip / Van Load Creator State
  const [showNewVanModal, setShowNewVanModal] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newSalesmanName, setNewSalesmanName] = useState('');
  const [newRouteName, setNewRouteName] = useState('');
  const [newTripDate, setNewTripDate] = useState<string>(() => todayISO());
  const [loadQuantities, setLoadQuantities] = useState<Record<number, number>>({});
  const [loadQuantityWarnings, setLoadQuantityWarnings] = useState<Record<number, string>>({});
  const [selectedLoadWarehouseId, setSelectedLoadWarehouseId] = useState<string>(
    () => defaultWarehouse?.id || warehouses[0]?.id || ''
  );

  useEffect(() => {
    if (!selectedLoadWarehouseId && (defaultWarehouse?.id || warehouses[0]?.id)) {
      setSelectedLoadWarehouseId(defaultWarehouse?.id || warehouses[0]?.id || '');
    }
  }, [defaultWarehouse, warehouses, selectedLoadWarehouseId]);

  // View state: 'home' vs 'sell' vs 'vanStock' vs 'bills' vs 'customerDue' vs 'trips'
    const { t } = useLanguage();
  const [salesmanTab, setSalesmanTab] = useState<'home' | 'sell' | 'vanStock' | 'bills' | 'customerDue' | 'trips'>('home');
  // Edit load / record returned stock & close trip screens (same ones the owner uses)
  const [tripScreen, setTripScreen] = useState<{ mode: SalesmanTripScreenMode; trip: Trip } | null>(null);

  // Sales form state
  const [selectedRetailer, setSelectedRetailer] = useState('');
  const [retailerPhone, setRetailerPhone] = useState('');
  // The registered customer record that was picked (empty when the shop was typed / spoken as free text).
  const [retailerCustomerId, setRetailerCustomerId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [priceType, setPriceType] = useState<PriceType>('Retail');
  const [customRateDraft, setCustomRateDraft] = useState('');
  const [amountPaidDraft, setAmountPaidDraft] = useState('0');
  const [productSearch, setProductSearch] = useState('');
  const [retailerSearch, setRetailerSearch] = useState('');
  const [showAllRetailersModal, setShowAllRetailersModal] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'warn' } | null>(null);

  // Invoice discount & settled total states
  const [invoiceDiscountDraft, setInvoiceDiscountDraft] = useState<string>('');
  const [settledTotalDraft, setSettledTotalDraft] = useState<string>('');
  const [autoSendWhatsApp, setAutoSendWhatsApp] = useState<boolean>(true);
  const [lastFinalizedWhatsApp, setLastFinalizedWhatsApp] = useState<{ id: number; phone: string; url: string } | null>(null);

  // Cart Modal & Multi-beverage selector states
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [batchQuantities, setBatchQuantities] = useState<Record<number, number>>({});

  // Van Stock Reconciliation search, filter & layout states
  const [vanStockSearch, setVanStockSearch] = useState<string>('');
  const [vanStockFilter, setVanStockFilter] = useState<'all' | 'available' | 'loaded' | 'empty'>('all');
  const [vanStockViewMode, setVanStockViewMode] = useState<'cards' | 'table'>('cards');

  // Accessibility customer search states
  const [isVoiceSearching, setIsVoiceSearching] = useState<boolean>(false);
  const [activeAlphaFilter, setActiveAlphaFilter] = useState<string>('ALL');
  const [showCustomerSelectorModal, setShowCustomerSelectorModal] = useState<boolean>(false);
  const [showHomeAddCustomerModal, setShowHomeAddCustomerModal] = useState<boolean>(false);

  // Invoice view modal
  const [invoiceModalBill, setInvoiceModalBill] = useState<Bill | null>(null);

  // Dedicated screen confirmed bill state (shows separate screen after cart confirmation)
  const [confirmedBill, setConfirmedBill] = useState<Bill | null>(null);

  // Sale date state (default to today's date, simple & selectable)
  const [saleDate, setSaleDate] = useState<string>(() => todayISO());

  // Two-finger pinch-to-zoom (0.75x - 3x) for Salesman Mode
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [isPinching, setIsPinching] = useState<boolean>(false);
  const pinchContainerRef = useRef<HTMLDivElement>(null);
  const initialPinchDistRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1.0);

  useEffect(() => {
    const container = pinchContainerRef.current;
    if (!container) return;

    const getDistance = (touches: TouchList) => {
      return Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialPinchDistRef.current = getDistance(e.touches);
        initialZoomRef.current = zoomScale;
        setIsPinching(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Only intercept when two fingers are actively pinching
      if (e.touches.length === 2 && initialPinchDistRef.current !== null) {
        e.preventDefault(); // Prevent full-page native viewport zoom
        const currentDist = getDistance(e.touches);
        const ratio = currentDist / initialPinchDistRef.current;
        const targetZoom = Math.min(3.0, Math.max(0.75, Number((initialZoomRef.current * ratio).toFixed(2))));
        setZoomScale(targetZoom);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDistRef.current = null;
        setIsPinching(false);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [zoomScale]);

  // Show feedback with timer
  const triggerFeedback = (text: string, type: 'success' | 'warn' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => {
      setFeedbackMsg(null);
    }, 4000);
  };

  // Cancel sale sequence at any stage
  const handleCancelSaleSequence = () => {
    setSelectedRetailer('');
    setRetailerPhone('');
    setRetailerCustomerId('');
    setSelectedProductId(null);
    setSaleDate(todayISO());
    setCart({
      retailer: '',
      phone: '',
      items: [],
      date: todayISO(),
    });
    setAmountPaidDraft('0');
    setInvoiceDiscountDraft('');
    setSettledTotalDraft('');
    setBatchQuantities({});
    setIsMultiSelectMode(false);
    setIsCartOpen(false);
    setConfirmedBill(null);
    triggerFeedback('Sale sequence cancelled. Ready for new customer.', 'warn');
    if (isLowVision) speakAssistiveText('Sale cancelled. Ready for new customer.');
  };

  // Start next invoice cleanly without cancellation warning
  const handleCreateNextInvoice = () => {
    setSelectedRetailer('');
    setRetailerPhone('');
    setRetailerCustomerId('');
    setSelectedProductId(null);
    setSaleDate(todayISO());
    setCart({
      retailer: '',
      phone: '',
      items: [],
      date: todayISO(),
    });
    setAmountPaidDraft('0');
    setInvoiceDiscountDraft('');
    setSettledTotalDraft('');
    setBatchQuantities({});
    setIsMultiSelectMode(false);
    setIsCartOpen(false);
    setConfirmedBill(null);
    setSalesmanTab('sell');
    triggerFeedback('Ready for next invoice! Select customer to begin.', 'success');
    if (isLowVision) speakAssistiveText('Ready for next invoice. Select customer.');
  };

  // Compile customer history from bills
  const frequentRetailers = useMemo(() => {
    const counts: Record<string, { count: number; phone: string }> = {};
    for (const b of bills) {
      const name = (b.retailer || '').trim();
      if (!name) continue;
      if (!counts[name]) counts[name] = { count: 0, phone: b.phone || '' };
      counts[name].count += 1;
      if (b.phone) counts[name].phone = b.phone;
    }
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([name, data]) => ({ name, phone: data.phone }));

    return sorted;
  }, [bills]);

  // Compile unique existing customers with purchase history
  // One source of truth for customer balances: the ledger's own list (opening balance, every
  // receipt, advances and returns included). A private list built from bills alone showed
  // "0 due / settled" for a customer who had paid in advance.
  const { existingCustomers: ledgerCustomers, customers: masterCustomers } = useLedger();
  const existingCustomers: ExistingCustomer[] = useMemo(
    () =>
      splitSameNameShops(
        [...ledgerCustomers].sort((a, b) => b.totalBills - a.totalBills),
        masterCustomers,
      ),
    [ledgerCustomers, masterCustomers],
  );

  // Calculate vehicle stock status for all products
  const vehicleProducts = useMemo(() => {
    return products.map((prod) => {
      const { loaded, sold, available } = getVehicleStock(activeTrip, prod.id);
      return {
        ...prod,
        vanLoaded: loaded,
        vanSold: sold,
        vanAvailable: available,
        isLoadedOnVan: loaded > 0,
      };
    });
  }, [products, activeTrip, getVehicleStock]);

  // Filtered vehicle products for Van Stock: strictly only loaded or available products!
  const filteredVehicleProducts = useMemo(() => {
    return vehicleProducts.filter((p) => {
      // ONLY products that are loaded or available on this vehicle run!
      if (p.vanLoaded <= 0 && p.vanAvailable <= 0) {
        return false;
      }

      // Search query filter (name or SKU)
      if (vanStockSearch.trim()) {
        const q = vanStockSearch.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku?.toLowerCase().includes(q);
        if (!matchName && !matchSku) return false;
      }

      return true;
    });
  }, [vehicleProducts, vanStockSearch]);

  // Vehicle Stock counts
  const vanStockCounts = useMemo(() => {
    const loadedProds = vehicleProducts.filter((p) => p.vanLoaded > 0 || p.vanAvailable > 0);
    const total = loadedProds.length;
    const loaded = loadedProds.filter((p) => p.vanLoaded > 0).length;
    const available = loadedProds.filter((p) => p.vanAvailable > 0).length;
    const empty = loadedProds.filter((p) => p.vanLoaded > 0 && p.vanAvailable <= 0).length;
    const totalLoadedCases = vehicleProducts.reduce((sum, p) => sum + p.vanLoaded, 0);
    const totalSoldCases = vehicleProducts.reduce((sum, p) => sum + p.vanSold, 0);
    const totalAvailableCases = vehicleProducts.reduce((sum, p) => sum + p.vanAvailable, 0);
    return { total, loaded, available, empty, totalLoadedCases, totalSoldCases, totalAvailableCases };
  }, [vehicleProducts]);

  // Selected product object
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return vehicleProducts.find((p) => p.id === selectedProductId) || null;
  }, [selectedProductId, vehicleProducts]);

  // Ensure selected product is valid and within stock
  useEffect(() => {
    if (!selectedProduct) return;
    const max = selectedProduct.vanAvailable;
    if (max <= 0) {
      setQuantity((prev) => (prev !== 0 ? 0 : prev));
    } else if (quantity > max) {
      setQuantity((prev) => (prev !== max ? max : prev));
    } else if (quantity === 0 && max > 0) {
      setQuantity((prev) => (prev !== 1 ? 1 : prev));
    }
  }, [selectedProduct?.id, selectedProduct?.vanAvailable, quantity]);

  // Calculate bill totals for items currently in cart.
  // Uses the same shared billTotals() helper as the admin Billing screen
  // (instead of a separate hand-rolled calculation) so the salesman's
  // on-screen total, the WhatsApp receipt, and the saved bill always
  // agree — including when gstMode is 'exclusive' or 'off', not just
  // the 'inclusive' case this used to assume.
  const cartTotals = useMemo(() => {
    const totals = billTotals(cart.items, gstMode, 0);
    return {
      ...totals,
      itemCount: cart.items.reduce((s, i) => s + i.qty, 0),
    };
  }, [cart.items, gstMode]);

  // Bills created by this salesman / vehicle trip
  const tripBills = useMemo(() => {
    if (!activeTrip) return [];
    return bills.filter((b) => (b.tripId === activeTrip.id) || activeTrip.billIds.includes(b.id));
  }, [bills, activeTrip]);

  const tripTotalCollected = useMemo(() => {
    return tripBills.reduce((sum, b) => sum + (Number(b.amountPaid) || 0), 0);
  }, [tripBills]);

  const tripTotalBilled = useMemo(() => {
    return tripBills.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  }, [tripBills]);

  // Bills scoped strictly to this salesman's own trips and bills
  const myBills = useMemo(() => {
    if (currentUser?.role === 'salesman') {
      const myTripIds = new Set(relevantTrips.map((t) => t.id));
      return bills.filter((b) => {
        if (b.tripId && myTripIds.has(b.tripId)) return true;
        return matchesMe(b);
      });
    }
    return bills;
  }, [bills, currentUser, relevantTrips, matchesMe]);

  const [myBillsScope, setMyBillsScope] = useState<'currentTrip' | 'allMyBills'>('currentTrip');
  const [myBillsSearch, setMyBillsSearch] = useState<string>('');

  const displayedMyBills = useMemo(() => {
    const base = (myBillsScope === 'currentTrip' && activeTrip) ? tripBills : myBills;
    const q = myBillsSearch.toLowerCase().trim();
    if (!q) return base;
    return base.filter((b) => {
      const idStr = String(b.id);
      const retailer = (b.retailer || '').toLowerCase();
      const phone = (b.phone || '').toLowerCase();
      return idStr.includes(q) || retailer.includes(q) || phone.includes(q);
    });
  }, [myBillsScope, tripBills, myBills, myBillsSearch]);

  const myBillsTotalBilled = useMemo(() => {
    return myBills.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  }, [myBills]);

  const myBillsTotalPaid = useMemo(() => {
    return myBills.reduce((sum, b) => sum + (Number(b.amountPaid) || 0), 0);
  }, [myBills]);

  // Today's bills scoped strictly to this salesman
  const todayBills = useMemo(() => {
    return myBills.filter((b) => {
      const d = (b.date || (b as any).createdAt || '').slice(0, 10);
      return d === todayStr;
    });
  }, [myBills, todayStr]);

  // Today's total sales billed
  const todaySales = useMemo(() => {
    return todayBills.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  }, [todayBills]);

  // Today's crates delivered
  const todayDeliveredCrates = useMemo(() => {
    return todayBills.reduce((sum, b) => {
      return sum + (b.items || []).reduce((itemSum, item) => itemSum + (Number(item.qty) || 0), 0);
    }, 0);
  }, [todayBills]);

  // Total items currently loaded on the active van
  const totalLoadedItems = useMemo(() => {
    if (!activeTrip || !activeTrip.loaded) return 0;
    return Object.values(activeTrip.loaded).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  }, [activeTrip]);

  // My payments recorded today
  const myPayments = useMemo(() => {
    if (currentUser?.role === 'salesman') {
      return (payments || []).filter((p) => {
        if (matchesMe({ salesmanId: p.salesmanId, salesman: p.recordedBy })) return true;
        if (p.billId && myBills.some((b) => b.id === p.billId)) return true;
        return false;
      });
    }
    return payments || [];
  }, [payments, currentUser, userSalesmanId, userSalesmanName, myBills]);

  const todayPayments = useMemo(() => {
    return myPayments.filter((p) => (p.paymentDate || p.createdAt || '').slice(0, 10) === todayStr);
  }, [myPayments, todayStr]);

  // Accurate breakdown of Cash vs UPI collected today (without double counting)
  const { todayCash, todayUpi } = useMemo(() => {
    let cash = 0;
    let upi = 0;
    const coveredBillIds = new Set<number>();

    todayPayments.forEach((p) => {
      if (p.billId) coveredBillIds.add(p.billId);
      const amt = Number(p.amount) || 0;
      if (p.mode === 'cash') cash += amt;
      else if (p.mode === 'upi') upi += amt;
      else cash += amt;
    });

    todayBills.forEach((b) => {
      if (b.amountPaid > 0 && !coveredBillIds.has(b.id)) {
        const mode = b.paymentMode || 'cash';
        const amt = Number(b.amountPaid) || 0;
        if (mode === 'upi') upi += amt;
        else cash += amt;
      }
    });

    return { todayCash: Math.max(0, cash), todayUpi: Math.max(0, upi) };
  }, [todayPayments, todayBills]);

  // Open the Load Vehicle Run sheet pre-filled from the signed-in salesman.
  // Salesman + vehicle come from the login/profile, date defaults to today,
  // beat stays blank until the salesman picks one (or types one if none are configured in Settings).
  const openVanModal = () => {
    const me = currentUser?.role === 'salesman' ? currentUser : null;
    const myProfile = me ? salesmen.find((s) => s.id === me.id) || me.salesman : null;
    const lastMine = relevantTrips.find((t) => (t.vehicle || '').trim());
    const profileVehicle = (myProfile?.defaultVehicle || myProfile?.default_vehicle || '').trim();
    setNewSalesmanName(me?.name || activeSalesman?.name || '');
    setNewVehicleName(profileVehicle || lastMine?.vehicle || '');
    setNewTripDate(todayISO());
    setNewRouteName('');
    setLoadQuantities({});
    setLoadQuantityWarnings({});
    setShowNewVanModal(true);
  };

  // Add line item to cart
  const handleAddItemToCart = () => {
    if (!selectedProduct) {
      triggerFeedback('Please select a beverage product first.', 'warn');
      return;
    }

    const available = selectedProduct.vanAvailable;
    if (available <= 0) {
      triggerFeedback(`Vehicle out of stock for ${selectedProduct.name}! Only loaded items can be sold.`, 'warn');
      return;
    }

    if (quantity <= 0) {
      triggerFeedback('Quantity must be at least 1 case.', 'warn');
      return;
    }

    // Check existing in cart for this product
    const existingInCart = cart.items.find((i) => i.productId === selectedProduct.id);
    const alreadyInCartQty = existingInCart ? existingInCart.qty : 0;
    const totalDemanded = alreadyInCartQty + quantity;

    if (totalDemanded > available) {
      triggerFeedback(
        `Cannot add ${quantity} cases! Van only has ${available} cases remaining (${alreadyInCartQty} already in bill).`,
        'warn'
      );
      return;
    }

    const rate = customRateDraft !== '' ? Number(customRateDraft) : (priceType === 'Retail' ? selectedProduct.retail : selectedProduct.wholesale);
    const computed = computeLine(selectedProduct, priceType, quantity, null, rate);

    const newItem: BillItem = {
      key: `${selectedProduct.id}_${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      category: selectedProduct.category,
      gst: resolveProductGstRate(selectedProduct),
      priceType,
      qty: quantity,
      rate,
      gross: computed.gross,
      freeQty: computed.freeQty,
      chargeableQty: computed.chargeableQty,
      discount: computed.discount,
      amount: computed.amount,
      batchNumber: selectedProduct.batchNumber,
      hsn: resolveProductHsn(selectedProduct),
    };

    setCart((prev) => {
      // If same product exists, update its quantity
      const existingIdx = prev.items.findIndex((it) => it.productId === selectedProduct.id && it.priceType === priceType && it.rate === rate);
      if (existingIdx >= 0) {
        const updatedItems = [...prev.items];
        const prevItem = updatedItems[existingIdx];
        const newTotalQty = prevItem.qty + quantity;
        const newComputed = computeLine(selectedProduct, priceType, newTotalQty, null, rate);
        updatedItems[existingIdx] = {
          ...prevItem,
          qty: newTotalQty,
          gross: newComputed.gross,
          freeQty: newComputed.freeQty,
          chargeableQty: newComputed.chargeableQty,
          discount: newComputed.discount,
          amount: newComputed.amount,
        };
        return { ...prev, items: updatedItems };
      }
      return { ...prev, items: [...prev.items, newItem] };
    });

    triggerFeedback(`✓ Added: ${quantity} cases of ${selectedProduct.name} (Van stock: ${available - totalDemanded} remaining)`);
    setQuantity(1);
    setCustomRateDraft('');
  };

  // Remove or adjust item in cart
  const handleRemoveCartItem = (key: string | number) => {
    setCart((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.key !== key),
    }));
  };

  const handleUpdateCartQty = (key: string | number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(key);
      return;
    }
    setCart((prev) => {
      const items = prev.items.map((it) => {
        if (it.key !== key) return it;
        const prod = products.find((p) => p.id === it.productId);
        if (!prod) return it;
        const { available } = getVehicleStock(activeTrip, prod.id);
        const safeQty = Math.min(newQty, available);
        if (safeQty !== newQty) {
          triggerFeedback(`Limited to ${available} cases remaining on vehicle!`, 'warn');
        }
        const promo = it.appliedPromo !== undefined ? it.appliedPromo : (activePromoFor(prod.id) || null);
        const computed = computeLine(prod, it.priceType, safeQty, promo, it.rate, it.discount);
        return {
          ...it,
          qty: safeQty,
          appliedPromo: promo,
          promoLabel: it.promoLabel || (promo ? schemeLabel(promo) : null),
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

  const handleUpdateCartRate = (key: string | number, newRate: number) => {
    setCart((prev) => {
      const items = prev.items.map((it) => {
        if (it.key !== key) return it;
        const prod = products.find((p) => p.id === it.productId);
        if (!prod) return it;
        const computed = computeLine(prod, it.priceType, it.qty, null, newRate, it.discount);
        return {
          ...it,
          rate: newRate,
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

  const handleUpdateCartDiscount = (key: string | number, newDiscount: number) => {
    setCart((prev) => {
      const items = prev.items.map((it) => {
        if (it.key !== key) return it;
        const prod = products.find((p) => p.id === it.productId);
        if (!prod) return it;
        const computed = computeLine(prod, it.priceType, it.qty, null, it.rate, newDiscount);
        return {
          ...it,
          discount: newDiscount,
          gross: computed.gross,
          freeQty: computed.freeQty,
          chargeableQty: computed.chargeableQty,
          amount: computed.amount,
        };
      });
      return { ...prev, items };
    });
  };

  const handleToggleCartPriceType = (key: string | number, newPriceType: PriceType) => {
    setCart((prev) => {
      const items = prev.items.map((it) => {
        if (it.key !== key) return it;
        const prod = products.find((p) => p.id === it.productId);
        if (!prod) return it;
        const newRate = newPriceType === 'Retail' ? prod.retail : prod.wholesale;
        const computed = computeLine(prod, newPriceType, it.qty, null, newRate, it.discount);
        return {
          ...it,
          priceType: newPriceType,
          rate: newRate,
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

  const getProductCartQty = (productId: number): number => {
    return cart.items
      .filter((item) => item.productId === productId)
      .reduce((sum, item) => sum + item.qty, 0);
  };

  const handleQuickProductCartChange = (productId: number, delta: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const { available } = getVehicleStock(activeTrip, prod.id);

    const existingItem = cart.items.find((it) => it.productId === productId);
    const currentQty = existingItem ? existingItem.qty : 0;
    const targetQty = currentQty + delta;

    if (delta > 0 && currentQty >= available) {
      triggerFeedback(`Vehicle only has ${available} cases of ${prod.name} remaining.`, 'warn');
      if (isLowVision) speakAssistiveText(`Vehicle limit reached. Only ${available} cases available.`);
      return;
    }

    if (targetQty <= 0) {
      if (existingItem) {
        handleRemoveCartItem(existingItem.key);
        if (isLowVision) speakAssistiveText(`Removed ${prod.name} from cart.`);
      }
      return;
    }

    if (existingItem) {
      handleUpdateCartQty(existingItem.key, targetQty);
      if (isLowVision) speakAssistiveText(`${prod.name} updated to ${targetQty} cases.`);
    } else {
      const rate = priceType === 'Retail' ? prod.retail : prod.wholesale;
      const promo = activePromoFor(prod.id) || null;
      const computed = computeLine(prod, priceType, targetQty, promo, rate);
      const newItem: BillItem = {
        key: `${prod.id}_${Date.now()}`,
        productId: prod.id,
        productName: prod.name,
        category: prod.category,
        gst: resolveProductGstRate(prod),
        priceType,
        qty: targetQty,
        rate,
        gross: computed.gross,
        freeQty: computed.freeQty,
        chargeableQty: computed.chargeableQty,
        discount: computed.discount,
        amount: computed.amount,
        appliedPromo: promo,
        promoLabel: promo ? schemeLabel(promo) : null,
        batchNumber: prod.batchNumber,
        hsn: resolveProductHsn(prod),
      };
      setCart((prev) => ({ ...prev, items: [...prev.items, newItem] }));
      if (isLowVision) speakAssistiveText(`Added 1 case of ${prod.name} to invoice. Total ${targetQty} cases.`);
    }
  };

  const handleBatchAddBeverages = () => {
    let addedCount = 0;
    let totalCasesAdded = 0;

    setCart((prev) => {
      const updatedItems = [...prev.items];

      for (const [pIdStr, qty] of Object.entries(batchQuantities)) {
        const pid = Number(pIdStr);
        if (qty <= 0) continue;
        const prod = products.find((p) => p.id === pid);
        if (!prod) continue;
        const { available } = getVehicleStock(activeTrip, prod.id);
        if (available <= 0) continue;

        const existingIdx = updatedItems.findIndex((it) => it.productId === pid);
        const currentQty = existingIdx >= 0 ? updatedItems[existingIdx].qty : 0;
        const safeQty = Math.min(currentQty + qty, available);

        const promo = activePromoFor(prod.id) || null;
        if (existingIdx >= 0) {
          const prevItem = updatedItems[existingIdx];
          const itemPromo = prevItem.appliedPromo !== undefined ? prevItem.appliedPromo : promo;
          const computed = computeLine(prod, prevItem.priceType, safeQty, itemPromo, prevItem.rate, prevItem.discount);
          updatedItems[existingIdx] = {
            ...prevItem,
            qty: safeQty,
            appliedPromo: itemPromo,
            promoLabel: prevItem.promoLabel || (itemPromo ? schemeLabel(itemPromo) : null),
            gross: computed.gross,
            freeQty: computed.freeQty,
            chargeableQty: computed.chargeableQty,
            discount: computed.discount,
            amount: computed.amount,
          };
        } else {
          const rate = priceType === 'Retail' ? prod.retail : prod.wholesale;
          const computed = computeLine(prod, priceType, safeQty, promo, rate);
          updatedItems.push({
            key: `${prod.id}_${Date.now()}_${Math.random()}`,
            productId: prod.id,
            productName: prod.name,
            category: prod.category,
            gst: resolveProductGstRate(prod),
            priceType,
            qty: safeQty,
            rate,
            gross: computed.gross,
            freeQty: computed.freeQty,
            chargeableQty: computed.chargeableQty,
            discount: computed.discount,
            amount: computed.amount,
            appliedPromo: promo,
            promoLabel: promo ? schemeLabel(promo) : null,
            batchNumber: prod.batchNumber,
            hsn: resolveProductHsn(prod),
          });
        }
        addedCount++;
        totalCasesAdded += qty;
      }

      return { ...prev, items: updatedItems };
    });

    if (addedCount > 0) {
      triggerFeedback(`Added ${addedCount} beverages (${totalCasesAdded} cases) to invoice!`, 'success');
      if (isLowVision) speakAssistiveText(`Added ${addedCount} beverages to invoice.`);
    }
    setBatchQuantities({});
    setIsMultiSelectMode(false);
  };

  const isLowVision = salesmanMode === 'lowVision';

  // Invoice discount calculations
  const rawCartTotal = cartTotals.total;
  const appliedDiscount = Number(invoiceDiscountDraft) || 0;
  const finalCartTotal = Math.max(0, rawCartTotal - appliedDiscount);

  const handleDiscountChange = (val: string) => {
    setInvoiceDiscountDraft(val);
    const d = Number(val) || 0;
    const computedTotal = Math.max(0, rawCartTotal - d);
    setSettledTotalDraft(d > 0 ? String(computedTotal) : '');
  };

  const handleSettledTotalChange = (val: string) => {
    setSettledTotalDraft(val);
    if (!val.trim()) {
      setInvoiceDiscountDraft('');
      return;
    }
    const target = Number(val);
    if (!isNaN(target) && target >= 0) {
      const diff = Math.max(0, rawCartTotal - target);
      setInvoiceDiscountDraft(diff > 0 ? String(diff) : '0');
    }
  };

  const applyQuickDiscount = (amt: number, isPercent: boolean = false) => {
    let d = 0;
    if (isPercent) {
      d = Math.round(rawCartTotal * (amt / 100));
    } else {
      d = amt;
    }
    handleDiscountChange(String(d));
    if (isLowVision) {
      speakAssistiveText(`Special discount of rupees ${d} applied. Settled total is rupees ${Math.max(0, rawCartTotal - d)}`);
    }
  };

  // Voice Search Customer for visionless salesman
  const handleVoiceSearchCustomer = () => {
    if (isVoiceSearching) {
      setIsVoiceSearching(false);
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      triggerFeedback('Speech recognition is not supported in this browser.', 'warn');
      return;
    }
    setIsVoiceSearching(true);
    speakAssistiveText('Listening. Speak customer or shop name now.');
    startSpeechRecognition({
      onStart: () => setIsVoiceSearching(true),
      onResult: (transcript) => {
        setIsVoiceSearching(false);
        const spoken = normCustName(transcript);
        // Match against every registered shop, not only the six most frequent. An exact name wins; otherwise
        // a partial match is accepted only when it points to exactly one shop (a short word like "ram" must not
        // silently pick one of several).
        const pool = existingCustomers.filter((c) => normCustName(c.name));
        const exact = pool.filter((c) => normCustName(c.name) === spoken);
        const partial =
          spoken.length >= 3
            ? pool.filter((c) => {
                const n = normCustName(c.name);
                return n.includes(spoken) || spoken.includes(n);
              })
            : [];
        const candidates = exact.length > 0 ? exact : partial;
        if (candidates.length === 1) {
          const matched = candidates[0];
          setSelectedRetailer(matched.name);
          setRetailerPhone(matched.phone || '');
          setRetailerCustomerId(matched.id || '');
          speakAssistiveText(`Selected shop ${matched.name}`);
          triggerFeedback(`Voice matched: ${matched.name}`);
        } else if (candidates.length > 1) {
          // several shops fit: let the person choose from the list instead of guessing
          setSelectedRetailer('');
          setRetailerPhone('');
          setRetailerCustomerId('');
          setShowCustomerSelectorModal(true);
          speakAssistiveText('More than one shop matches. Please choose from the list.');
          triggerFeedback(`More than one shop matches "${transcript}". Choose one from the list.`, 'warn');
        } else {
          // not a registered shop: keep what was heard as a one-off name, but never keep the previous shop's phone
          setSelectedRetailer(transcript);
          setRetailerPhone('');
          setRetailerCustomerId('');
          speakAssistiveText(`No registered shop named ${transcript}. Customer set to ${transcript}.`);
          triggerFeedback(`No registered shop "${transcript}" - use Add Customer to register it`, 'warn');
        }
      },
      onError: () => {
        setIsVoiceSearching(false);
        speakAssistiveText('Could not detect shop name. Tap to try again.');
        triggerFeedback('Voice recognition ended. Tap to try again.', 'warn');
      },
      onEnd: () => setIsVoiceSearching(false),
    });
  };

  // Finalize Sale
  const handleFinalizeSale = () => {
    if (!selectedRetailer.trim()) {
      triggerFeedback('Please select or enter the Retailer / Shop Name.', 'warn');
      if (isLowVision) speakAssistiveText('Please select shop name first.');
      return;
    }
    if (cart.items.length === 0) {
      triggerFeedback('Please add at least one beverage item to the bill.', 'warn');
      if (isLowVision) speakAssistiveText('No items in bill yet.');
      return;
    }
    if (!activeTrip) {
      triggerFeedback('No active vehicle trip selected. Please assign a vehicle trip first.', 'warn');
      return;
    }

    // Default is credit (0 paid) unless entered
    const paid = amountPaidDraft !== '' ? Math.max(0, Number(amountPaidDraft) || 0) : 0;
    const activeDate = saleDate || todayISO();

    // Update cart party info before finalizing
    setCart((prev) => ({
      ...prev,
      retailer: selectedRetailer.trim(),
      phone: retailerPhone.trim(),
      date: activeDate,
      warehouseId: activeTrip.warehouseId || '',
      tripId: activeTrip.id,
      vehicle: activeTrip.vehicle,
      salesman: activeTrip.salesman,
      additionalDiscount: appliedDiscount,
    }));

    const billId = finalizeBill(paid, activeTrip.id, appliedDiscount, undefined, undefined, undefined, activeDate, {
      // pass the chosen shop explicitly: the setCart() above has not been applied yet
      party: {
        retailer: selectedRetailer.trim(),
        phone: retailerPhone.trim(),
        salesman: activeTrip.salesman,
        vehicle: activeTrip.vehicle,
        warehouseId: activeTrip.warehouseId || '',
        // the picked customer record (checked against name/phone inside finalizeBill); empty = match by name + phone
        customerId: retailerCustomerId || undefined,
      },
    });
    if (billId !== null) {
      triggerFeedback(`✓ Sale Completed! Bill #${billId} saved. On-board vehicle stock updated.`, 'success');
      if (isLowVision) speakAssistiveText(`Sale finalized. Total rupees ${finalCartTotal}. Vehicle stock updated.`);

      // WhatsApp Automation
      const phoneToUse = retailerPhone.trim();
      if (phoneToUse) {
        const dummyBill: Bill = {
          ...cartTotals,
          total: finalCartTotal,
          id: billId,
          retailer: selectedRetailer.trim(),
          phone: phoneToUse,
          date: activeDate,
          items: cart.items,
          amountPaid: paid,
          warehouseId: activeTrip.warehouseId || '',
          tripId: activeTrip.id,
          vehicle: activeTrip.vehicle,
          salesman: activeTrip.salesman,
          additionalDiscount: appliedDiscount,
        };
        const text = buildBillText(dummyBill, orgProfile, billingSettings);
        const url = whatsappLink(phoneToUse, text);
        setLastFinalizedWhatsApp({ id: billId, phone: phoneToUse, url });

        if (autoSendWhatsApp) {
          try {
            window.open(url, '_blank');
          } catch {
            // Popup blocked
          }
        }
      }

      const savedBill: Bill = {
        ...cartTotals,
        total: finalCartTotal,
        id: billId,
        retailer: selectedRetailer.trim(),
        phone: phoneToUse,
        date: activeDate,
        items: [...cart.items],
        amountPaid: paid,
        warehouseId: activeTrip.warehouseId || '',
        tripId: activeTrip.id,
        vehicle: activeTrip.vehicle,
        salesman: activeTrip.salesman,
        additionalDiscount: appliedDiscount,
      };
      setConfirmedBill(savedBill);

      setSelectedRetailer('');
      setRetailerPhone('');
      setRetailerCustomerId('');
      setAmountPaidDraft('0');
      setInvoiceDiscountDraft('');
      setSettledTotalDraft('');
      setQuantity(1);
      setIsCartOpen(false);
    }
  };

  if (tripScreen) {
    return (
      <div id="view-salesman-trip-screen" className="mw-workspace space-y-4 p-2 sm:p-3">
        <SalesmanTripScreens
          mode={tripScreen.mode}
          trip={tripScreen.trip}
          onSwitchMode={(mode) => setTripScreen((cur) => (cur ? { ...cur, mode } : cur))}
          onClose={() => setTripScreen(null)}
        />
      </div>
    );
  }

  return (
    <div id="view-salesman" className="mw-workspace space-y-4">
      {/* Top Banner: Mode & Active Vehicle Switcher */}
      <header
        id="salesman-header"
        className="sticky top-0 z-30 border-b-2 shadow-md px-3 sm:px-4 py-2.5 sm:py-3 space-y-3"
        style={{
          backgroundColor: palette.panel,
          borderColor: palette.line,
        }}
      >
        <div className="max-w-none lg:max-w-6xl mx-auto space-y-3">
          {salesmanTab === 'home' ? (
            /* ================================================================= */
            /* HOME SCREEN TOP HEADER: EXACT FIELD ROUTE DASHBOARD               */
            /* ================================================================= */
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-sm">
                  <User size={24} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-500">
                    {t('salesman.routeDashboard')}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 truncate leading-tight">
                    {currentUser?.name || userSalesmanName || activeSalesman?.name || 'Sales Staff'}
                  </h1>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mt-0.5 truncate">
                    <Truck size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">
                      {activeTrip?.vehicle
                        ? `${activeTrip.vehicle}${activeTrip.route ? ' • ' + activeTrip.route : ''}`
                        : t('salesman.noActiveVehicle')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <LanguageToggle />
                <button
                  type="button"
                  id="salesman-home-btn-logout"
                  onClick={() => logout()}
                  className="size-11 rounded-2xl border-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 flex items-center justify-center cursor-pointer transition-colors shadow-xs"
                  title={t('salesman.signOut')}
                  aria-label={t('salesman.signOut')}
                >
                  <LogOut size={20} />
                </button>
              </div>
            </div>
          ) : (
            /* ================================================================= */
            /* NON-HOME VIEW HEADER: Contextual clean navigation                 */
            /* ================================================================= */
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setSalesmanTab('home')}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer flex items-center gap-1.5 text-xs font-black shrink-0"
                  title="Back to Dashboard Home"
                >
                  <LayoutGrid size={16} className="text-amber-500" />
                  <span>{t('salesman.tab.home')}</span>
                </button>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="truncate text-base sm:text-lg font-black tracking-tight"
                      style={{ color: palette.ink }}
                    >
                      {salesmanTab === 'sell' && t('salesman.newSale')}
                      {salesmanTab === 'vanStock' && t('salesman.tab.vanStock')}
                      {salesmanTab === 'bills' && t('salesman.myBills')}
                      {salesmanTab === 'customerDue' && t('salesman.payments')}
                      {salesmanTab === 'trips' && t('salesman.tab.trips')}
                    </span>
                    {activeTrip && (
                      <span className="px-2.5 py-0.5 text-[11px] font-black rounded-full bg-emerald-600 text-white shrink-0 flex items-center gap-1">
                        <Truck size={12} />
                        <span>{activeTrip.vehicle}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <LanguageToggle />
                <button
                  type="button"
                  id="salesman-header-btn-logout"
                  onClick={() => logout()}
                  className="size-9 rounded-xl border-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 flex items-center justify-center cursor-pointer transition-colors shadow-xs"
                  title={t('salesman.signOut')}
                  aria-label={t('salesman.signOut')}
                >
                  <LogOut size={17} />
                </button>
              </div>
            </div>
          )}
        </div>



        {/* Quick Review Cart Bar when items exist */}
        {cart.items.length > 0 && (
          <div className="max-w-none lg:max-w-6xl mx-auto mt-2">
            <button
              type="button"
              id="btn-quick-review-cart-bar"
              onClick={() => {
                setIsCartOpen(true);
                if (isLowVision) speakAssistiveText(`Reviewing invoice cart. ${cart.items.length} items.`);
              }}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-amber-500 bg-amber-50 hover:bg-amber-100 text-amber-950 font-black text-xs sm:text-sm flex items-center justify-between cursor-pointer shadow-sm transition-colors"
            >
              <div className="flex items-center gap-2">
                <ShoppingBag size={16} className="text-amber-700" />
                <span>Invoice Cart: {cart.items.length} beverage item(s)</span>
                {selectedRetailer && (
                  <span className="text-xs text-amber-800 font-bold hidden sm:inline">
                    for <OdiaName name={selectedRetailer} kind="person" className="inline" odiaClassName="ml-1 font-odia" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm sm:text-base text-amber-900 font-black">
                  ₹{money(finalCartTotal)}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-xs font-black">
                  Review & Bill →
                </span>
              </div>
            </button>
          </div>
        )}
      </header>

      {/* Floating / Top Alert Feedback Banner */}
      {feedbackMsg && (
        <div
          role="alert"
          aria-live="assertive"
          className="max-w-none lg:max-w-6xl mx-auto mt-3 px-4 py-2.5 rounded-md font-black text-sm flex items-center justify-between border-2 shadow-sm transition-all"
          style={{
            backgroundColor: feedbackMsg.type === 'success' ? '#ECFDF5' : '#FFFBEB',
            borderColor: feedbackMsg.type === 'success' ? '#059669' : '#D97706',
            color: feedbackMsg.type === 'success' ? '#065F46' : '#92400E',
          }}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="p-1 cursor-pointer"
            aria-label="Close notification"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Content Area with Smooth Two-Finger Pinch-to-Zoom (0.75x - 3x) */}
      <div
        ref={pinchContainerRef}
        className="w-full"
        style={{
          transform: zoomScale !== 1.0 ? `scale(${zoomScale})` : undefined,
          transformOrigin: 'top center',
          transition: isPinching ? 'none' : 'transform 0.12s ease-out',
          width: zoomScale > 1 ? `${(100 / zoomScale).toFixed(1)}%` : '100%',
          margin: zoomScale > 1 ? '0 auto' : undefined,
        }}
      >
        <main className="max-w-none lg:max-w-6xl mx-auto px-4 py-4">
        {/* VIEW 0: FIELD ROUTE DASHBOARD (HOME SCREEN) */}
        {salesmanTab === 'home' && (
          <section id="salesman-home-dashboard" className="space-y-6">
            {/* 4 Summary KPI Cards (2x2 Grid) */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {/* Card 1: Cash in Hand */}
              <div
                onClick={() => setSalesmanTab('customerDue')}
                className="p-3.5 sm:p-4 rounded-2xl border-2 shadow-sm transition-transform hover:scale-[1.01] cursor-pointer"
                style={{
                  backgroundColor: '#ECFDF5',
                  borderColor: '#A7F3D0',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-800">
                    Cash in Hand
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-200/60 text-emerald-800 flex items-center justify-center">
                    <IndianRupee size={18} />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-emerald-950">
                  ₹{money(todayCash)}
                </div>
                <div className="text-[11px] font-semibold text-emerald-700 mt-1">
                  Collected today
                </div>
              </div>

              {/* Card 2: UPI / Online */}
              <div
                onClick={() => setSalesmanTab('customerDue')}
                className="p-3.5 sm:p-4 rounded-2xl border-2 shadow-sm transition-transform hover:scale-[1.01] cursor-pointer"
                style={{
                  backgroundColor: '#ECFEFF',
                  borderColor: '#A5F3FC',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-cyan-800">
                    UPI / Online
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-cyan-200/60 text-cyan-800 flex items-center justify-center">
                    <Zap size={18} />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-cyan-950">
                  ₹{money(todayUpi)}
                </div>
                <div className="text-[11px] font-semibold text-cyan-700 mt-1">
                  Direct transfers
                </div>
              </div>

              {/* Card 3: Total Sales */}
              <div
                onClick={() => setSalesmanTab('bills')}
                className="p-3.5 sm:p-4 rounded-2xl border-2 shadow-sm transition-transform hover:scale-[1.01] cursor-pointer"
                style={{
                  backgroundColor: '#FFFBEB',
                  borderColor: '#FDE68A',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-800">
                    Total Sales
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-amber-200/60 text-amber-800 flex items-center justify-center">
                    <Receipt size={18} />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-amber-950">
                  ₹{money(todaySales)}
                </div>
                <div className="text-[11px] font-semibold text-amber-700 mt-1">
                  {todayBills.length} invoice{todayBills.length === 1 ? '' : 's'} cut
                </div>
              </div>

              {/* Card 4: Crates Delivered */}
              <div
                onClick={() => setSalesmanTab('vanStock')}
                className="p-3.5 sm:p-4 rounded-2xl border-2 shadow-sm transition-transform hover:scale-[1.01] cursor-pointer"
                style={{
                  backgroundColor: '#FAF5FF',
                  borderColor: '#E9D5FF',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-purple-800">
                    Crates Delivered
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-purple-200/60 text-purple-800 flex items-center justify-center">
                    <Package size={18} />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-purple-950">
                  {todayDeliveredCrates}
                </div>
                <div className="text-[11px] font-semibold text-purple-700 mt-1">
                  {totalLoadedItems} items loaded
                </div>
              </div>
            </div>

            {/* QUICK ACTIONS SECTION (2x2 Grid) */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500">
                <Sparkles size={14} className="text-amber-500" />
                <span>Quick Actions</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Action 1: New Bill / Sale */}
                <button
                  type="button"
                  id="home-action-sale"
                  onClick={() => setSalesmanTab('sell')}
                  className="group p-4 rounded-2xl border-2 flex items-center justify-between gap-3 text-left transition-all hover:shadow-md cursor-pointer"
                  style={{
                    backgroundColor: palette.panel,
                    borderColor: palette.line,
                  }}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                      <ShoppingCart size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm sm:text-base text-slate-900 group-hover:text-amber-600 transition-colors">
                        {t('salesman.newSale')}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        Create bill for retailer
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:translate-x-1 group-hover:text-slate-700 transition-all shrink-0" />
                </button>

                {/* Action 2: Payments */}
                <button
                  type="button"
                  id="home-action-payment"
                  onClick={() => setSalesmanTab('customerDue')}
                  className="group p-4 rounded-2xl border-2 flex items-center justify-between gap-3 text-left transition-all hover:shadow-md cursor-pointer"
                  style={{
                    backgroundColor: palette.panel,
                    borderColor: palette.line,
                  }}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                      <IndianRupee size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm sm:text-base text-slate-900 group-hover:text-emerald-600 transition-colors">
                        2. Payments
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        Collect dues & receipts
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:translate-x-1 group-hover:text-slate-700 transition-all shrink-0" />
                </button>

                {/* Action 3: Trips */}
                <button
                  type="button"
                  id="home-action-trip"
                  onClick={() => setSalesmanTab('trips')}
                  className="group p-4 rounded-2xl border-2 flex items-center justify-between gap-3 text-left transition-all hover:shadow-md cursor-pointer"
                  style={{
                    backgroundColor: palette.panel,
                    borderColor: palette.line,
                  }}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                      <Truck size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm sm:text-base text-slate-900 group-hover:text-amber-600 transition-colors">
                        3. Trips
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        Manage vehicle runs & loads
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:translate-x-1 group-hover:text-slate-700 transition-all shrink-0" />
                </button>

                {/* Action 4: Van Stock */}
                <button
                  type="button"
                  id="home-action-stock"
                  onClick={() => setSalesmanTab('vanStock')}
                  className="group p-4 rounded-2xl border-2 flex items-center justify-between gap-3 text-left transition-all hover:shadow-md cursor-pointer"
                  style={{
                    backgroundColor: palette.panel,
                    borderColor: palette.line,
                  }}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                      <Package size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm sm:text-base text-slate-900 group-hover:text-purple-600 transition-colors">
                        {t('salesman.tab.vanStock')}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        Check remaining stock & crates
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:translate-x-1 group-hover:text-slate-700 transition-all shrink-0" />
                </button>

                {/* Action 5: Add Customer */}
                <button
                  type="button"
                  id="home-action-add-customer"
                  onClick={() => setShowHomeAddCustomerModal(true)}
                  className="group p-4 rounded-2xl border-2 flex items-center justify-between gap-3 text-left transition-all hover:shadow-md cursor-pointer sm:col-span-2"
                  style={{
                    backgroundColor: palette.panel,
                    borderColor: palette.line,
                  }}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                      <UserPlus size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm sm:text-base text-slate-900 group-hover:text-emerald-700 transition-colors flex items-center gap-2">
                        <span>5. Add Customer</span>
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        Register new retailer on route
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-slate-400 group-hover:translate-x-1 group-hover:text-slate-700 transition-all shrink-0" />
                </button>
              </div>
            </div>

            {/* TODAY'S INVOICES SECTION */}
            <div
              className="p-4 sm:p-5 rounded-2xl border-2 shadow-sm space-y-4"
              style={{
                backgroundColor: palette.panel,
                borderColor: palette.line,
              }}
            >
              <div className="flex items-center justify-between gap-3 pb-3 border-b-2" style={{ borderColor: palette.line }}>
                <div className="flex items-center gap-2">
                  <Receipt size={20} className="text-emerald-700 shrink-0" />
                  <h2 className="font-black text-base sm:text-lg text-slate-900">
                    Today's Invoices ({todayBills.length})
                  </h2>
                </div>
                {todayBills.length > 0 && (
                  <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Total: ₹{money(todaySales)}
                  </span>
                )}
              </div>

              {todayBills.length === 0 ? (
                <div className="text-center py-10 px-4 rounded-xl border-2 border-dashed border-slate-200 space-y-3 bg-slate-50/50">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <ShoppingCart size={28} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-700">
                      No invoices generated yet today.
                    </p>
                    <p className="text-xs text-slate-500">
                      Tap '1. New Bill / Sale' to start billing a retailer.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSalesmanTab('sell')}
                    className="mt-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs cursor-pointer shadow-sm transition-colors"
                  >
                    + Create First Bill Today
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {todayBills.map((bill) => {
                    const total = Number(bill.total) || 0;
                    const paid = Number(bill.amountPaid) || 0;
                    const due = billBalance(bill);
                    const isFullyPaid = due <= 0;
                    const isPartial = paid > 0 && due > 0;
                    const itemCount = (bill.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);

                    return (
                      <div
                        key={bill.id}
                        className="p-3.5 rounded-xl border-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors bg-white hover:bg-slate-50"
                        style={{ borderColor: palette.line }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-slate-900">
                              <OdiaName name={bill.retailer} kind="person" />
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-500">
                              #{bill.id}
                            </span>
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                                isFullyPaid
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isPartial
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {isFullyPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 font-semibold mt-1 flex items-center gap-2 flex-wrap">
                            <span>{itemCount} crate{itemCount === 1 ? '' : 's'}</span>
                            <span>•</span>
                            <span>{bill.date || todayStr}</span>
                            {bill.vehicle && (
                              <>
                                <span>•</span>
                                <span>{bill.vehicle}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          <div className="text-left sm:text-right">
                            <div className="font-mono font-black text-sm text-slate-900">
                              ₹{money(total)}
                            </div>
                            {due > 0 ? (
                              <div className="text-[11px] font-bold text-rose-600">
                                Due: ₹{money(due)}
                              </div>
                            ) : (
                              <div className="text-[11px] font-bold text-emerald-600">
                                Fully Paid
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setInvoiceModalBill(bill)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                              title="View Invoice Details"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const text = `Invoice #${bill.id} from ${orgProfile?.name || 'MrWater Distribution'}: ₹${bill.total} for ${bill.retailer}. Thank you!`;
                                window.open(`https://wa.me/${bill.phone ? '91' + bill.phone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}`, '_blank');
                              }}
                              className="p-1.5 rounded-lg border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                              title="Share via WhatsApp"
                            >
                              <Share2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* VIEW 1: VAN STOCK SUMMARY & RECONCILIATION */}
        {salesmanTab === 'vanStock' && (
          <section id="salesman-van-stock-view" className="space-y-4">
            <div
              className="p-3 sm:p-4 rounded-xl border-2 shadow-sm"
              style={{
                backgroundColor: palette.panel,
                borderColor: palette.line,
              }}
            >
              {/* Header with Title & Live Van Run Metrics */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b-2" style={{ borderColor: palette.line }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
                    <Truck size={20} />
                  </div>
                  <div>
                    <h2 style={fz(18, { fontWeight: 900 })} className="text-slate-900">
                      {activeTrip ? `Van Stock · ${activeTrip.vehicle}` : t('salesman.tab.vanStock')}
                    </h2>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">
                      {activeTrip
                        ? `${activeTrip.route || 'Route'} · ${warehouses.find((w) => w.id === activeTrip.warehouseId)?.name || 'Main Godown'}`
                        : 'No vehicle currently assigned.'}
                    </p>
                  </div>
                </div>
                {activeTrip && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-800">
                      Invoiced: ₹{money(tripTotalBilled)}
                    </div>
                    <div className="px-2.5 py-1 rounded-md bg-sky-50 border border-blue-300 text-xs font-bold text-sky-800">
                      Collected: ₹{money(tripTotalCollected)}
                    </div>
                  </div>
                )}
              </div>

              {/* High-Level On-Board Cases Summary Bar */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                <div className="bg-slate-50 border-2 rounded-lg p-2.5 sm:p-3 text-center" style={{ borderColor: palette.line }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Loaded</div>
                  <div className="text-lg sm:text-2xl font-black text-slate-900 mt-0.5">{vanStockCounts.totalLoadedCases} cs</div>
                  <div className="text-[10.5px] text-slate-500 font-medium hidden sm:block">Departed on van</div>
                </div>
                <div className="bg-sky-50/60 border-2 border-sky-200 rounded-lg p-2.5 sm:p-3 text-center">
                  <div className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">Total Sold</div>
                  <div className="text-lg sm:text-2xl font-black text-sky-700 mt-0.5">{vanStockCounts.totalSoldCases} cs</div>
                  <div className="text-[10.5px] text-sky-600 font-medium hidden sm:block">Delivered on route</div>
                </div>
                <div className="bg-emerald-50/60 border-2 border-emerald-200 rounded-lg p-2.5 sm:p-3 text-center">
                  <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Remaining</div>
                  <div className="text-lg sm:text-2xl font-black text-emerald-800 mt-0.5">{vanStockCounts.totalAvailableCases} cs</div>
                  <div className="text-[10.5px] text-emerald-600 font-medium hidden sm:block">Ready to bill now</div>
                </div>
              </div>

              {/* Controls Toolbar: Search Only (No crossed-out filter chips or table toggle) */}
              <div className="mb-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={vanStockSearch}
                    onChange={(e) => setVanStockSearch(e.target.value)}
                    placeholder="Search loaded beverage by name or SKU..."
                    className="w-full pl-9 pr-8 py-2.5 text-xs sm:text-sm font-semibold border-2 rounded-xl focus-ring bg-white"
                    style={{ borderColor: palette.line }}
                  />
                  {vanStockSearch && (
                    <button aria-label="Close"
                      type="button"
                      onClick={() => setVanStockSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* EMPTY SEARCH / FILTER RESULTS */}
              {filteredVehicleProducts.length === 0 ? (
                <div className="text-center py-10 px-4 border-2 border-dashed rounded-2xl bg-slate-50 text-slate-500 space-y-3" style={{ borderColor: palette.line }}>
                  <Package size={40} className="mx-auto text-slate-400" />
                  <div>
                    <p className="font-extrabold text-sm sm:text-base text-slate-800">
                      {vanStockSearch
                        ? 'No loaded beverage items match your search.'
                        : 'No beverages currently loaded on this vehicle run.'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      {vanStockSearch
                        ? 'Try clearing your search term to see all loaded van products.'
                        : 'Load beverage stock onto your vehicle in the Trips menu before heading out on route.'}
                    </p>
                  </div>
                  {vanStockSearch ? (
                    <button
                      type="button"
                      onClick={() => setVanStockSearch('')}
                      className="px-4 py-2 text-xs font-bold bg-sky-600 text-white rounded-xl cursor-pointer hover:bg-sky-500 shadow-sm"
                    >
                      Clear Search
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSalesmanTab('trips')}
                      className="px-4 py-2.5 text-xs font-black bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl cursor-pointer shadow-sm inline-flex items-center gap-1.5"
                    >
                      <Truck size={15} />
                      <span>Go to Trips to Load Stock</span>
                    </button>
                  )}
                </div>
              ) : (
                /* CARD-BASED LAYOUT ONLY (ALL SHOULD BE CARD OPTION) */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredVehicleProducts.map((p) => {
                    const isOutOfStock = p.vanAvailable <= 0;
                    const isLoaded = p.vanLoaded > 0;
                    const percentSold = isLoaded ? Math.min(100, Math.round((p.vanSold / p.vanLoaded) * 100)) : 0;

                    return (
                      <div
                        key={p.id}
                        className="border-2 rounded-xl p-3.5 bg-white shadow-sm hover:shadow-sm transition-shadow flex flex-col justify-between"
                        style={{ borderColor: isOutOfStock ? `${palette.bad}80` : palette.line, borderLeftWidth: 6, borderLeftColor: sizeTheme(p.volume, p.name).hex }}
                      >
                        <div>
                          {/* Card Header: Name, SKU, and Status Badge */}
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-extrabold text-sm text-slate-900 break-words leading-snug" title={p.name}>
                                <OdiaName name={p.name} nameOr={p.nameOr} />
                              </h3>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {p.sku && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                    {p.sku}
                                  </span>
                                )}
                                <SizeChip volume={p.volume} pack={p.pack} name={p.name} />
                              </div>
                            </div>

                            {/* Van Status Badge: Loaded items are either AVAILABLE or VAN EMPTY */}
                            {isOutOfStock ? (
                              <span className="px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
                                VAN EMPTY
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                                AVAILABLE
                              </span>
                            )}
                          </div>

                          {/* 3-Column Reconciliation Metrics Box */}
                          <div className="grid grid-cols-3 gap-1.5 my-2.5 p-2 bg-slate-50/80 rounded-lg border border-slate-200 text-center">
                            <div>
                              <div className="text-[10px] font-bold text-slate-500 uppercase">Loaded</div>
                              <div className="text-sm font-extrabold text-slate-800">{p.vanLoaded} cs</div>
                            </div>
                            <div className="border-x border-slate-200">
                              <div className="text-[10px] font-bold text-sky-600 uppercase">Sold</div>
                              <div className="text-sm font-extrabold text-sky-800">{p.vanSold} cs</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold text-slate-500 uppercase">Remaining</div>
                              <div
                                className="text-sm font-black"
                                style={{ color: isOutOfStock ? palette.bad : palette.good }}
                              >
                                {p.vanAvailable} cs
                              </div>
                            </div>
                          </div>

                          {/* Route Sales Progress Bar */}
                          {isLoaded && (
                            <div className="mb-2">
                              <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-500 mb-1">
                                <span>Sold Progress</span>
                                <span>{percentSold}%</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    percentSold >= 100 ? 'bg-rose-500' : percentSold > 50 ? 'bg-blue-600' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${percentSold}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Footer: Rates & Quick Add Action */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 mt-2">
                          <div className="text-[11px] font-semibold text-slate-600">
                            <div>Retail: <strong className="text-slate-900">₹{p.retail}</strong></div>
                            <div>Wholesale: <strong className="text-slate-900">₹{p.wholesale}</strong></div>
                          </div>

                          {p.vanAvailable > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                handleQuickProductCartChange(p.id, 1);
                                triggerFeedback(`Added 1 case of ${p.name} to sale cart!`);
                              }}
                              className="px-3 py-1.5 text-xs font-bold bg-sky-600 text-white rounded-md hover:bg-sky-500 transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                              title="Add 1 case of this product to current sale"
                            >
                              <Plus size={13} />
                              <span>Add to Sale</span>
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                              Sold Out
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* VIEW 3: MY BILLS (SCOPED TO OWN TRIPS/BILLS ONLY) */}
        {salesmanTab === 'bills' && (
          <section id="salesman-bills-view" className="space-y-4">
            <div
              className="p-4 sm:p-5 rounded-2xl border-2 shadow-sm space-y-4"
              style={{
                backgroundColor: palette.panel,
                borderColor: palette.line,
              }}
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2" style={{ borderColor: palette.line }}>
                <div>
                  <h2 style={fz(18, { fontWeight: 900 })} className="text-slate-900 flex items-center gap-2">
                    <FileText size={20} className="text-sky-700" />
                    <span>My Bills</span>
                  </h2>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    {displayedMyBills.length} invoices on route
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="px-2.5 py-1 rounded-lg font-mono font-black bg-sky-50 text-sky-700 border border-sky-200">
                    Billed: ₹{money(myBillsTotalBilled)}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg font-mono font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Collected: ₹{money(myBillsTotalPaid)}
                  </span>
                </div>
              </div>

              {/* Scope toggle & search bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setMyBillsScope('currentTrip')}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                      myBillsScope === 'currentTrip'
                        ? 'bg-white text-blue-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Current Trip ({tripBills.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMyBillsScope('allMyBills')}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                      myBillsScope === 'allMyBills'
                        ? 'bg-white text-blue-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All My Bills ({myBills.length})
                  </button>
                </div>

                <div className="relative flex-1 sm:max-w-xs">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="search"
                    value={myBillsSearch}
                    onChange={(e) => setMyBillsSearch(e.target.value)}
                    placeholder="Search invoice # or retailer..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:border-sky-600"
                  />
                </div>
              </div>

              {/* Bills Listing */}
              {displayedMyBills.length === 0 ? (
                <div className="text-center py-12 rounded-xl border-2 border-dashed text-slate-500 space-y-1" style={{ borderColor: palette.line }}>
                  <FileText size={32} className="mx-auto text-slate-400" />
                  <div className="text-sm font-black text-slate-700">No invoices found</div>
                  <div className="text-xs font-semibold">
                    {myBillsSearch
                      ? `No bills matching "${myBillsSearch}".`
                      : myBillsScope === 'currentTrip'
                      ? 'No sales recorded on the current active trip yet. Switch to "Sell" to create bills.'
                      : 'No past bills found for your account.'}
                  </div>
                  {myBillsScope === 'currentTrip' && myBills.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMyBillsScope('allMyBills')}
                      className="mt-2 text-xs font-black text-sky-700 underline cursor-pointer"
                    >
                      View All {myBills.length} Past Invoices
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {displayedMyBills.map((bill) => {
                    const total = Number(bill.total) || 0;
                    const paid = Number(bill.amountPaid) || 0;
                    const due = billBalance(bill);

                    return (
                      <div
                        key={bill.id}
                        id={`salesman-bill-row-${bill.id}`}
                        className="p-3.5 rounded-xl border-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors"
                        style={{
                          borderColor: due > 0 ? '#FCA5A5' : palette.line,
                          backgroundColor: palette.cream,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm sm:text-base text-slate-900">
                              Invoice #{bill.id}
                            </span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-sky-700 font-mono">
                              {bill.date}
                            </span>
                            {due > 0 ? (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                                Due: ₹{money(due)}
                              </span>
                            ) : (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Paid in Full
                              </span>
                            )}
                          </div>
                          <div className="font-black text-sm mt-0.5 text-slate-800"><OdiaName name={bill.retailer} kind="person" /></div>
                          <div className="text-xs font-semibold text-slate-500 mt-0.5">
                            {bill.items.reduce((sum, i) => sum + (i.qty || 0), 0)} cases • {bill.items.length} line items
                            {bill.phone ? ` • Tel: ${bill.phone}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="text-right">
                            <div className="font-mono font-black text-base text-slate-900">₹{money(total)}</div>
                            <div className="text-xs font-bold text-emerald-700">Rec: ₹{money(paid)}</div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInvoiceModalBill(bill)}
                              className="p-2 rounded-lg border-2 cursor-pointer bg-white hover:bg-slate-100 transition-colors"
                              style={{ borderColor: palette.line }}
                              title="View / Print Tax Invoice"
                              aria-label={`View invoice ${bill.id}`}
                            >
                              <Printer size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const text = `Invoice #${bill.id} from ${orgProfile?.name || 'MrWater Distribution'}: ₹${bill.total} for ${bill.retailer}. Thank you!`;
                                window.open(`https://wa.me/${bill.phone ? '91' + bill.phone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}`, '_blank');
                              }}
                              className="p-2 rounded-lg border-2 cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                              style={{ borderColor: '#047857' }}
                              title="Share via WhatsApp"
                              aria-label={`WhatsApp invoice ${bill.id}`}
                            >
                              <Share2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* VIEW 3: MAKE SALE (MAIN BILLING WORKFLOW) */}
        {salesmanTab === 'sell' && (
          <div>
            <SalesmanSaleWorkflow
              confirmedBill={confirmedBill}
              setConfirmedBill={setConfirmedBill}
              cart={cart}
              activeTrip={activeTrip}
              availableTrips={anyOutTrips}
              onSelectTripId={(id) => {
                setSelectedTripId(id);
                if (isLowVision) speakAssistiveText(`Switched to vehicle ${(trips.find(t => t.id === id))?.vehicle || 'van'}.`);
              }}
              onOpenNewVanModal={openVanModal}
              products={products}
              customers={existingCustomers}
              selectedRetailer={selectedRetailer}
              setSelectedRetailer={setSelectedRetailer}
              retailerPhone={retailerPhone}
              setRetailerPhone={setRetailerPhone}
              setRetailerCustomerId={setRetailerCustomerId}
              priceType={priceType}
              setPriceType={setPriceType}
              isLowVision={isLowVision}
              palette={palette}
              scale={scale}
              finalCartTotal={finalCartTotal}
              getVehicleStock={getVehicleStock}
              getProductCartQty={getProductCartQty}
              onQuickProductCartChange={handleQuickProductCartChange}
              onOpenCart={() => setIsCartOpen(true)}
              onCancelSaleSequence={handleCancelSaleSequence}
              onCreateNextInvoice={handleCreateNextInvoice}
              onOpenInvoiceModal={(b) => setInvoiceModalBill(b)}
              onOpenCustomerDirectory={() => setShowCustomerSelectorModal(true)}
              onVoiceSearchCustomer={handleVoiceSearchCustomer}
              isVoiceSearching={isVoiceSearching}
              speakAssistiveText={speakAssistiveText}
              onSetSalesmanTab={setSalesmanTab}
              orgProfile={orgProfile}
              billingSettings={billingSettings}
              saleDate={saleDate}
              setSaleDate={setSaleDate}
            />
          </div>
        )}

        {/* VIEW 4: CUSTOMER PAYMENT DUE LOOKUP */}
        {salesmanTab === 'customerDue' && (
          <SalesmanCustomerDueLookup
            bills={bills}
            onSelectForSale={(customerName, phone) => {
              setSelectedRetailer(customerName);
              setRetailerPhone(phone);
              setRetailerCustomerId('');
              setSalesmanTab('sell');
              if (isLowVision) speakAssistiveText(`Selected ${customerName} for sale.`);
            }}
            onRecordPayment={recordPayment}
            palette={palette}
            isLowVision={isLowVision}
            speakAssistiveText={speakAssistiveText}
          />
        )}

        {/* VIEW 5: TRIPS (MY CURRENT & PAST VEHICLE DISPATCHES) */}
        {salesmanTab === 'trips' && (
          <section id="salesman-trips-view" className="space-y-4">
            <div
              className="p-4 sm:p-5 rounded-2xl border-2 shadow-sm space-y-4"
              style={{
                backgroundColor: palette.panel,
                borderColor: palette.line,
              }}
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2" style={{ borderColor: palette.line }}>
                <div>
                  <h2 style={fz(18, { fontWeight: 900 })} className="text-slate-900 flex items-center gap-2">
                    <Truck size={20} className="text-sky-700" />
                    <span>Trips</span>
                  </h2>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    {relevantTrips.length} assigned trip{relevantTrips.length === 1 ? '' : 's'}
                  </p>
                </div>

                <button
                  type="button"
                  id="btn-load-new-van-run"
                  onClick={openVanModal}
                  className="min-h-[40px] px-4 py-2 rounded-xl border-2 border-sky-600 bg-sky-600 hover:bg-sky-700 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors shrink-0"
                >
                  <Plus size={15} />
                  <span>Load Trip</span>
                </button>
              </div>

              {/* Active Trip Banner */}
              {activeTrip ? (
                <div
                  className="p-4 rounded-xl border-2 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{
                    backgroundColor: '#EFF6FF',
                    borderColor: '#3B82F6',
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider">
                        Active Trip
                      </span>
                      <span className="font-mono text-xs font-bold text-sky-700">
                        Date: {activeTrip.date}
                      </span>
                    </div>
                    <div className="font-black text-lg text-slate-900 mt-1">
                      {activeTrip.vehicle}
                    </div>
                    <div className="text-xs font-bold text-slate-600 mt-0.5">
                      Route: {activeTrip.route || 'Standard Route'} • Driver/Sales: {activeTrip.salesman} • Godown: <strong>{warehouses.find((w) => w.id === activeTrip.warehouseId)?.name || 'Main Godown'}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-500">Trip Sales</div>
                      <div className="font-mono font-black text-base text-slate-900">
                        ₹{money(tripTotalBilled)}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-700">
                        {tripBills.length} invoices generated
                      </div>
                    </div>

                    <button
                      type="button"
                      id="btn-salesman-end-trip"
                      onClick={() => setTripScreen({ mode: 'settle', trip: activeTrip })}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl border-2 border-amber-500 bg-amber-100 text-amber-900 font-black text-xs flex items-center gap-1 hover:bg-amber-200 cursor-pointer"
                    >
                      <span>End Trip</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalesmanTab('sell')}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-sky-600 text-white font-black text-xs flex items-center gap-1 hover:bg-sky-700 cursor-pointer shadow-sm"
                    >
                      <ShoppingCart size={14} />
                      <span>Start Selling</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="p-4 rounded-xl border-2 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderColor: '#CBD5E1',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                      <Truck size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-wider">
                          No Active Run for Today
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-500">
                          {todayStr}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-600 mt-1">
                        No delivery vehicle is currently dispatched. Tap “Load Vehicle Run” above to start selling on route.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* All Assigned Trips List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-500">
                    {showTripHistory ? 'All Dispatches & History' : 'Active Dispatches'} ({displayedTrips.length})
                  </div>
                  {olderOrClosedTrips.length > 0 && (
                    <button
                      type="button"
                      id="btn-trips-view-toggle-history"
                      onClick={() => setShowTripHistory(!showTripHistory)}
                      className="text-xs font-black text-sky-700 hover:text-blue-900 underline flex items-center gap-1 cursor-pointer"
                    >
                      <HistoryIcon size={14} />
                      <span>{showTripHistory ? "Show Active Only" : `Trip History (${olderOrClosedTrips.length} past runs)`}</span>
                    </button>
                  )}
                </div>

                {showTripHistory && (
                  <input
                    type="search"
                    value={tripSearch}
                    onChange={(e) => {
                      setTripSearch(e.target.value);
                      setTripLimit(30);
                    }}
                    enterKeyHint="search"
                    placeholder="Search vehicle, route, date or trip no."
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border-2 text-sm font-semibold focus:outline-none focus:border-sky-600"
                    style={{ borderColor: palette.line }}
                  />
                )}
                {displayedTrips.length === 0 ? (
                  <div
                    className="p-8 text-center rounded-xl border-2 border-dashed space-y-2 text-slate-500"
                    style={{ borderColor: palette.line }}
                  >
                    <Truck size={36} className="mx-auto text-slate-400" />
                    <div className="font-black text-sm text-slate-700">No vehicle runs assigned</div>
                    <div className="text-xs font-semibold">
                      Tap "Load Vehicle Run" above to load products onto a delivery vehicle.
                    </div>
                  </div>
                ) : (
                  shownTrips.map((trip) => {
                    const isActive = Boolean(activeTrip && activeTrip.id === trip.id);
                    const isOut = trip.status === 'out';
                    const tripLoadTotal = Object.values(trip.loaded || {}).reduce((sum, q) => sum + (Number(q) || 0), 0);
                    const billsForTrip = bills.filter((b) => b.tripId === trip.id || trip.billIds.includes(b.id));
                    const totalTripBilled = billsForTrip.reduce((sum, b) => sum + (Number(b.total) || 0), 0);

                    return (
                      <div
                        key={trip.id}
                        id={`salesman-trip-item-${trip.id}`}
                        className={`p-3.5 sm:p-4 rounded-xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isActive
                            ? 'bg-sky-50/70 border-blue-600 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-base text-slate-900">
                              {trip.vehicle}
                            </span>
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                isOut ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {isOut ? '● Out on Run' : 'Closed'}
                            </span>
                            <span className="text-xs font-bold text-slate-500 font-mono">
                              {trip.date}
                            </span>
                            <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                              {warehouses.find((w) => w.id === trip.warehouseId)?.name || 'Main Godown'}
                            </span>
                          </div>

                          <div className="text-xs font-semibold text-slate-600 mt-1">
                            Route: {trip.route || 'Delivery Route'} • Godown: {warehouses.find((w) => w.id === trip.warehouseId)?.name || 'Main Godown'} • Loaded: {tripLoadTotal} cases • Bills: {billsForTrip.length} (₹{money(totalTripBilled)})
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center flex-wrap justify-end">
                          {isOut && (
                            <>
                              <button
                                type="button"
                                id={`btn-salesman-edit-trip-${trip.id}`}
                                onClick={() => setTripScreen({ mode: 'edit', trip })}
                                className="min-h-[38px] px-3 py-1.5 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-black text-xs cursor-pointer"
                              >
                                View Load
                              </button>
                              <button
                                type="button"
                                id={`btn-salesman-settle-trip-${trip.id}`}
                                onClick={() => setTripScreen({ mode: 'settle', trip })}
                                className="min-h-[38px] px-3 py-1.5 rounded-xl border-2 border-amber-500 bg-amber-100 hover:bg-amber-200 text-amber-900 font-black text-xs cursor-pointer"
                              >
                                Return &amp; Settle
                              </button>
                            </>
                          )}
                          {isActive ? (
                            <span className="px-3 py-1.5 rounded-xl bg-sky-600 text-white font-black text-xs flex items-center gap-1 shadow-sm">
                              <CheckCircle2 size={14} />
                              <span>Current Active Run</span>
                            </span>
                          ) : isOut ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTripId(trip.id);
                                if (isLowVision) speakAssistiveText(`Switched to active vehicle ${trip.vehicle}.`);
                              }}
                              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-black text-xs flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <span>Switch to this Run</span>
                              <ArrowRight size={13} />
                            </button>
                          ) : (
                            <span className="px-3 py-1 text-xs font-bold text-slate-400 bg-slate-100 rounded-lg">
                              Completed Run
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                {showTripHistory && matchedTrips.length > shownTrips.length && (
                  <button
                    type="button"
                    onClick={() => setTripLimit((n) => n + 30)}
                    className="w-full min-h-[44px] rounded-xl border-2 border-slate-300 bg-white text-sm font-black text-slate-700 cursor-pointer hover:bg-slate-50"
                  >
                    Show more ({matchedTrips.length - shownTrips.length} older)
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
      </div>

      {/* LOAD VAN TRIP: the same load sheet the owner uses (per-product godown, add-products sheet, review) */}
      {showNewVanModal && (
        <NewTripSheet
          products={products}
          warehouses={warehouses}
          salesmen={salesmen}
          vehicles={Array.from(new Set(trips.map((t) => (t.vehicle || '').trim()).filter(Boolean))).sort((x, y) => x.localeCompare(y))}
          routes={activeBeats.map((b) => b.name)}
          defaultWarehouseId={defaultWarehouse?.id || warehouses[0]?.id || ''}
          warehouseStock={warehouseStock}
          attachableBills={createTrip.attachable}
          lockedSalesman={userSalesmanId ? { id: userSalesmanId, name: userSalesmanName || 'Salesman' } : undefined}
          initialVehicle={newVehicleName}
          onSubmit={(payload) => {
            const res = createTrip.create(payload);
            if (res.ok === false) return res.error;
            setSelectedTripId(res.trip.id);
            setShowNewVanModal(false);
            triggerFeedback(
              `Vehicle ${payload.vehicle} loaded with ${res.total} cases${res.godowns > 1 ? ` from ${res.godowns} godowns` : ''}!`,
              'success',
            );
            return null;
          }}
          onClose={() => setShowNewVanModal(false)}
        />
      )}

      {/* ALL RETAILERS SEARCH MODAL */}
      {showAllRetailersModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            className="w-full max-w-md rounded-xl border-2 shadow-2xl p-5"
            style={{
              backgroundColor: palette.panel,
              borderColor: palette.line,
              color: palette.ink,
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b-2" style={{ borderColor: palette.line }}>
              <h3 className="font-black text-base">Select or Add Retailer Shop</h3>
              <button aria-label="Close"
                type="button"
                onClick={() => setShowAllRetailersModal(false)}
                className="p-1 rounded hover:bg-black/10 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <input
                type="text"
                autoFocus
                value={retailerSearch}
                onChange={(e) => setRetailerSearch(e.target.value)}
                placeholder="Type shop name..."
                className="w-full p-2.5 text-sm font-bold border-2 rounded"
                style={{ borderColor: palette.line }}
              />

              <div className="max-h-56 overflow-y-auto space-y-1.5">
                {frequentRetailers
                  .filter((r) => r.name.toLowerCase().includes(retailerSearch.toLowerCase()))
                  .map((r) => (
                    <button
                      key={r.name}
                      type="button"
                      onClick={() => {
                        setSelectedRetailer(r.name);
                        setRetailerPhone(r.phone);
                        setRetailerCustomerId('');
                        setShowAllRetailersModal(false);
                      }}
                      className="w-full p-2.5 text-left text-xs font-bold rounded border hover:bg-black/5 cursor-pointer flex justify-between items-center"
                    >
                      <span>{r.name}</span>
                      {r.phone && <span className="opacity-60">{r.phone}</span>}
                    </button>
                  ))}
              </div>

              {retailerSearch.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRetailer(retailerSearch.trim());
                    setShowAllRetailersModal(false);
                  }}
                  className="w-full py-2.5 text-xs font-black rounded bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                >
                  Use "{retailerSearch.trim()}" as New Customer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tax Invoice Modal */}
      {invoiceModalBill && (
        <TaxInvoiceModal
          bill={invoiceModalBill}
          onClose={() => setInvoiceModalBill(null)}
        />
      )}

      {/* Full Accessible Customer Directory Modal */}
      {showCustomerSelectorModal && (
        <CustomerSelector
          customers={existingCustomers}
          currentRetailer={selectedRetailer}
          palette={palette}
          scale={scale}
          onSelect={(c) => {
            setSelectedRetailer(c.name);
            setRetailerPhone(c.phone || '');
            setRetailerCustomerId(c.id || '');
            setShowCustomerSelectorModal(false);
            if (isLowVision) speakAssistiveText(`Selected customer ${c.name}`);
          }}
          onClose={() => setShowCustomerSelectorModal(false)}
        />
      )}

      {/* Dedicated Invoice Cart Modal */}
      <SalesmanCartModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        isLowVision={isLowVision}
        palette={palette}
        scale={scale}
        activeTrip={activeTrip}
        products={products}
        selectedRetailer={selectedRetailer}
        setSelectedRetailer={setSelectedRetailer}
        retailerPhone={retailerPhone}
        setRetailerPhone={setRetailerPhone}
        customers={existingCustomers}
        amountPaidDraft={amountPaidDraft}
        setAmountPaidDraft={setAmountPaidDraft}
        invoiceDiscountDraft={invoiceDiscountDraft}
        settledTotalDraft={settledTotalDraft}
        handleDiscountChange={handleDiscountChange}
        handleSettledTotalChange={handleSettledTotalChange}
        applyQuickDiscount={applyQuickDiscount}
        autoSendWhatsApp={autoSendWhatsApp}
        setAutoSendWhatsApp={setAutoSendWhatsApp}
        lastFinalizedWhatsApp={lastFinalizedWhatsApp}
        onUpdateQty={handleUpdateCartQty}
        onUpdateRate={handleUpdateCartRate}
        onUpdateDiscount={handleUpdateCartDiscount}
        onTogglePriceType={handleToggleCartPriceType}
        onRemoveItem={handleRemoveCartItem}
        onFinalize={handleFinalizeSale}
        onCancelSale={handleCancelSaleSequence}
        onOpenCustomerDirectory={() => setShowCustomerSelectorModal(true)}
        onVoiceSearchCustomer={handleVoiceSearchCustomer}
        isVoiceSearching={isVoiceSearching}
        getVehicleStock={getVehicleStock}
        onAddProduct={handleQuickProductCartChange}
        priceType={priceType}
      />

      {/* Floating cart — low-vision mode only; normal mode uses cart icon beside customer name */}
      {isLowVision && cart.items.length > 0 && (
        <div className="fixed bottom-20 right-4 z-40">
          <button
            type="button"
            id="btn-floating-cart"
            onClick={() => {
              setIsCartOpen(true);
              speakAssistiveText(`Cart opened. ${cart.items.length} items.`);
            }}
            className="px-4 py-3 rounded-full border-3 shadow-2xl flex items-center gap-2.5 cursor-pointer font-black transition-transform hover:scale-105 active:scale-95 bg-yellow-400 text-black border-black text-base ring-4 ring-yellow-300/60"
          >
            <div className="relative">
              <ShoppingCart size={22} />
              <span className="absolute -top-2.5 -right-2.5 px-1.5 py-0.2 rounded-full font-black text-xs bg-black text-yellow-300">
                {cart.items.length}
              </span>
            </div>
            <span>Cart ({cart.items.length}) • ₹{money(finalCartTotal)}</span>
          </button>
        </div>
      )}

      {/* Mobile-Friendly Fixed Bottom Navigation Bar for Salesman Mode */}
      <nav
        id="salesman-bottom-nav"
        aria-label="Salesman navigation"
        className="fixed bottom-0 inset-x-0 z-40 w-full max-w-[100vw] bg-slate-900 border-t-2 border-slate-800 shadow-2xl select-none"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          backgroundColor: '#0F172A',
        }}
      >
        <div className="w-full grid grid-cols-6 items-stretch px-0.5">
        {[
          { id: 'home', label: 'Home', icon: LayoutGrid },
          { id: 'sell', label: 'Sale', icon: ShoppingCart },
          { id: 'customerDue', label: 'Payment', icon: IndianRupee },
          { id: 'trips', label: 'Trips', icon: Truck },
          { id: 'vanStock', label: 'Stock', icon: Package },
          { id: 'bills', label: 'My Bills', icon: FileText },
        ].map(({ id, label, icon: Icon }) => {
          const active = salesmanTab === id;
          return (
            <button
              key={id}
              id={`salesman-nav-${id}`}
              type="button"
              onClick={() => {
                setSalesmanTab(id as any);
                if (isLowVision) speakAssistiveText(`${label} screen active.`);
              }}
              aria-current={active ? 'page' : undefined}
              className={`min-h-[56px] w-full py-1.5 px-0.5 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                active ? 'text-amber-400 font-black' : 'text-slate-400 hover:text-white font-semibold'
              }`}
            >
              <div className={`p-1 rounded-lg ${active ? 'bg-amber-400/20 text-amber-400' : ''}`}>
                <Icon size={19} />
              </div>
              <span className="text-[10px] sm:text-[11px] leading-none text-center whitespace-nowrap">{label}</span>
            </button>
          );
        })}
        </div>
      </nav>

      {/* Subtle pinch-to-zoom reset indicator (only visible when zoomed, no permanent banner) */}
      {zoomScale !== 1.0 && (
        <button
          type="button"
          id="btn-reset-zoom"
          onClick={() => setZoomScale(1.0)}
          className="fixed top-16 right-4 z-40 px-3 py-1.5 rounded-full bg-slate-900/90 text-white text-xs font-black shadow-lg border border-slate-700 flex items-center gap-1.5 backdrop-blur-sm cursor-pointer hover:bg-black"
          title="Reset zoom to 1.0x"
        >
          <span>{zoomScale.toFixed(2)}x</span>
          <span className="text-amber-400 ml-1">Reset</span>
        </button>
      )}

      {/* Add New Customer Modal for Salesman */}
      <AddCustomerModal
        isOpen={showHomeAddCustomerModal}
        onClose={() => setShowHomeAddCustomerModal(false)}
        defaultRoute={activeTrip?.route || ''}
        isLowVision={salesmanMode === 'lowVision'}
        onCustomerCreated={(newCust) => {
          setSelectedRetailer(newCust.name);
          setRetailerPhone(newCust.phone || '');
          setRetailerCustomerId(newCust.id);
          setSalesmanTab('sell');
          triggerFeedback(`New customer "${newCust.name}" added to route. Ready for billing!`, 'success');
          speakAssistiveText(`Customer ${newCust.name} added. Ready for sale.`);
        }}
      />
    </div>
  );
};
