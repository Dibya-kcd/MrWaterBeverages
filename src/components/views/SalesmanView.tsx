import React, { useState, useMemo, useEffect } from 'react';
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
import { Bill, BillItem, ExistingCustomer, PriceType, Product, Trip } from '../../types';
import { buildBillText, computeLine, money, whatsappLink } from '../../utils/billing';
import { downloadInvoicePdf } from '../../utils/invoicePdf';
import { isSpeechRecognitionSupported, speakAssistiveText, startSpeechRecognition } from '../../utils/speechRecognition';
import { CustomerSelector } from '../common/CustomerSelector';
import { TaxInvoiceModal } from '../common/TaxInvoiceModal';
import { SalesmanCartModal } from '../common/SalesmanCartModal';
import { SalesmanSaleWorkflow } from './SalesmanSaleWorkflow';
import { SalesmanCustomerDueLookup } from './SalesmanCustomerDueLookup';

export const SalesmanView: React.FC = () => {
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
    highContrast,
    setHighContrast,
    lowVisionStickyPosition,
    fz,
    scale,
    orgProfile,
    billingSettings,
    currentUser,
    currentRole,
    activeSalesman,
    logout,
    recordPayment,
  } = useLedger();

  // Mode: 'normal' vs 'lowVision' (vision-impaired)
  const [salesmanMode, setSalesmanMode] = useState<'normal' | 'lowVision'>(() => {
    try {
      const saved = localStorage.getItem('salesman_view_mode');
      if (saved === 'lowVision' || saved === 'normal') return saved;
    } catch {
      // ignore
    }
    return 'normal';
  });

  const handleSetMode = (mode: 'normal' | 'lowVision') => {
    setSalesmanMode(mode);
    try {
      localStorage.setItem('salesman_view_mode', mode);
    } catch {
      // ignore
    }
    if (mode === 'lowVision' && !highContrast) {
      setHighContrast(true);
    }
  };

  // Today's date string YYYY-MM-DD
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Filter trips: Salesman only sees their assigned trips; Admin sees all trips
  const userSalesmanId = currentUser?.role === 'salesman' ? currentUser.id : undefined;
  const userSalesmanName = currentUser?.role === 'salesman' ? currentUser.name : undefined;

  const relevantTrips = useMemo(() => {
    if (currentUser?.role === 'salesman') {
      return trips.filter((t) => {
        if (userSalesmanId && t.salesmanId === userSalesmanId) return true;
        if (userSalesmanName && t.salesman && t.salesman.toLowerCase().trim() === userSalesmanName.toLowerCase().trim()) return true;
        return false;
      });
    }
    return trips;
  }, [trips, currentUser, userSalesmanId, userSalesmanName]);

  // Default to showing only trips with status: 'out' from today's date
  const todayOutTrips = useMemo(() => {
    return relevantTrips.filter((t) => t.status === 'out' && (!t.date || t.date === todayStr));
  }, [relevantTrips, todayStr]);

  // Older / closed trips moved behind "Trip History" link
  const olderOrClosedTrips = useMemo(() => {
    return relevantTrips.filter((t) => !(t.status === 'out' && (!t.date || t.date === todayStr)));
  }, [relevantTrips, todayStr]);

  // Trip history visibility toggle
  const [showTripHistory, setShowTripHistory] = useState<boolean>(false);

  // Trips displayed in the tappable selector card list
  const displayedTrips = useMemo(() => {
    if (showTripHistory) return relevantTrips;
    return todayOutTrips;
  }, [showTripHistory, relevantTrips, todayOutTrips]);

  // Selected vehicle/trip selection
  const [selectedTripId, setSelectedTripId] = useState<number | null>(() => {
    return todayOutTrips[0]?.id || relevantTrips.find((t) => t.status === 'out')?.id || relevantTrips[0]?.id || null;
  });

  // Keep selectedTripId valid if trips change
  useEffect(() => {
    if (selectedTripId !== null) {
      const exists = relevantTrips.some((t) => t.id === selectedTripId);
      if (!exists) {
        setSelectedTripId(todayOutTrips[0]?.id || relevantTrips.find((t) => t.status === 'out')?.id || relevantTrips[0]?.id || null);
      }
    } else if (relevantTrips.length > 0) {
      setSelectedTripId(todayOutTrips[0]?.id || relevantTrips.find((t) => t.status === 'out')?.id || relevantTrips[0]?.id || null);
    }
  }, [relevantTrips, selectedTripId, todayOutTrips]);

  const activeTrip: Trip | null = useMemo(() => {
    return trips.find((t) => t.id === selectedTripId) || null;
  }, [trips, selectedTripId]);

  // Quick Trip / Van Load Creator State
  const [showNewVanModal, setShowNewVanModal] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('Tata Ace - MH-14-GH-1234');
  const [newSalesmanName, setNewSalesmanName] = useState('Ramesh Kumar');
  const [newRouteName, setNewRouteName] = useState('Route 1 - City Retailers');
  const [loadQuantities, setLoadQuantities] = useState<Record<number, number>>({});
  const [loadQuantityWarnings, setLoadQuantityWarnings] = useState<Record<number, string>>({});

  // View state: 'sell' vs 'vanStock' vs 'bills' vs 'customerDue' vs 'trips'
  const [salesmanTab, setSalesmanTab] = useState<'sell' | 'vanStock' | 'bills' | 'customerDue' | 'trips'>('sell');

  // Sales form state
  const [selectedRetailer, setSelectedRetailer] = useState('');
  const [retailerPhone, setRetailerPhone] = useState('');
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

  // Synchronize salesman mode when clicked from Nav or MobileNav
  useEffect(() => {
    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<'normal' | 'lowVision'>;
      if (customEvent.detail === 'normal' || customEvent.detail === 'lowVision') {
        setSalesmanMode(customEvent.detail);
      }
    };
    window.addEventListener('salesman_mode_changed', handleModeChange);
    return () => window.removeEventListener('salesman_mode_changed', handleModeChange);
  }, []);

  // Invoice view modal
  const [invoiceModalBill, setInvoiceModalBill] = useState<Bill | null>(null);

  // Dedicated screen confirmed bill state (shows separate screen after cart confirmation)
  const [confirmedBill, setConfirmedBill] = useState<Bill | null>(null);

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
    setSelectedProductId(null);
    setCart({
      retailer: '',
      phone: '',
      items: [],
      date: new Date().toISOString().slice(0, 10),
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

    if (sorted.length === 0) {
      return [
        { name: 'Kisan Cold Drinks & General Store', phone: '9861012345' },
        { name: 'Maa Tarini Daily Market Store', phone: '9437198765' },
        { name: 'Gupta Sweets & Fast Food Center', phone: '9861254321' },
        { name: 'Highway Oasis Restaurant', phone: '9438011223' },
      ];
    }
    return sorted;
  }, [bills]);

  // Compile unique existing customers with purchase history
  const existingCustomers: ExistingCustomer[] = useMemo(() => {
    const map = new Map<string, ExistingCustomer>();

    for (const b of bills) {
      const norm = (b.retailer || '').trim();
      if (!norm) continue;
      const key = norm.toLowerCase();

      const total = Number(b.total) || 0;
      const paid = Number(b.amountPaid) || 0;
      const due = Math.max(0, total - paid);

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          name: norm,
          phone: b.phone || '',
          totalBills: 1,
          totalBilled: total,
          totalPaid: paid,
          balanceDue: due,
          lastBillDate: b.date || '',
        });
      } else {
        existing.totalBills += 1;
        existing.totalBilled += total;
        existing.totalPaid += paid;
        existing.balanceDue += due;
        if (!existing.phone && b.phone) existing.phone = b.phone;
        if (b.date && (!existing.lastBillDate || b.date > existing.lastBillDate)) {
          existing.lastBillDate = b.date;
        }
      }
    }

    // Include reliable default shops so list is always populated
    const defaultShops: ExistingCustomer[] = [
      { name: 'Kisan Cold Drinks & General Store', phone: '9861012345', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Maa Tarini Daily Market Store', phone: '9437198765', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Gupta Sweets & Fast Food Center', phone: '9861254321', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Highway Oasis Restaurant', phone: '9438011223', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Shiv Shakti Kirana', phone: '9822012345', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Mahalaxmi Super Market', phone: '9822023456', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Sai General Store', phone: '9822034567', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Ganesh Daily Needs', phone: '9822045678', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Krishna Cold Drinks', phone: '9822056789', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
      { name: 'Radha Trading Co', phone: '9822067890', totalBills: 0, totalBilled: 0, totalPaid: 0, balanceDue: 0, lastBillDate: '' },
    ];
    for (const d of defaultShops) {
      const k = d.name.toLowerCase();
      if (!map.has(k)) {
        map.set(k, d);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalBills - a.totalBills);
  }, [bills]);

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

  // Filtered vehicle products for Van Stock Reconciliation
  const filteredVehicleProducts = useMemo(() => {
    return vehicleProducts.filter((p) => {
      // Search query filter (name or SKU)
      if (vanStockSearch.trim()) {
        const q = vanStockSearch.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku?.toLowerCase().includes(q);
        if (!matchName && !matchSku) return false;
      }

      if (vanStockFilter === 'available') {
        return p.vanAvailable > 0;
      }
      if (vanStockFilter === 'loaded') {
        return p.vanLoaded > 0;
      }
      if (vanStockFilter === 'empty') {
        return p.vanLoaded > 0 && p.vanAvailable <= 0;
      }
      return true;
    });
  }, [vehicleProducts, vanStockSearch, vanStockFilter]);

  // Vehicle Stock counts for quick filter tabs
  const vanStockCounts = useMemo(() => {
    const total = vehicleProducts.length;
    const loaded = vehicleProducts.filter((p) => p.vanLoaded > 0).length;
    const available = vehicleProducts.filter((p) => p.vanAvailable > 0).length;
    const empty = vehicleProducts.filter((p) => p.vanLoaded > 0 && p.vanAvailable <= 0).length;
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
    if (selectedProduct) {
      if (selectedProduct.vanAvailable <= 0) {
        setQuantity(0);
      } else if (quantity > selectedProduct.vanAvailable) {
        setQuantity(selectedProduct.vanAvailable);
      } else if (quantity === 0 && selectedProduct.vanAvailable > 0) {
        setQuantity(1);
      }
    }
  }, [selectedProduct, quantity]);

  // Calculate bill totals for items currently in cart
  const cartTotals = useMemo(() => {
    const subtotal = cart.items.reduce((s, i) => s + i.amount, 0);
    const cgst = cart.items.reduce((s, i) => s + (i.amount * (i.gst / 2)) / (1 + i.gst), 0);
    const sgst = cgst;
    const discount = cart.items.reduce((s, i) => s + (i.discount || 0), 0);
    return {
      subtotal,
      cgst,
      sgst,
      total: subtotal,
      discount,
      itemCount: cart.items.reduce((s, i) => s + i.qty, 0),
    };
  }, [cart.items]);

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
        if (userSalesmanId && b.salesmanId === userSalesmanId) return true;
        if (userSalesmanName && b.salesman && b.salesman.toLowerCase().trim() === userSalesmanName.toLowerCase().trim()) return true;
        return false;
      });
    }
    return bills;
  }, [bills, currentUser, relevantTrips, userSalesmanId, userSalesmanName]);

  const [myBillsScope, setMyBillsScope] = useState<'currentTrip' | 'allMyBills'>('currentTrip');
  const [myBillsSearch, setMyBillsSearch] = useState<string>('');

  const displayedMyBills = useMemo(() => {
    const base = myBillsScope === 'currentTrip' ? tripBills : myBills;
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

  // Handle Quick Load of a Van Trip
  const handleCreateVanTrip = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const vehicle = newVehicleName.trim() || 'Van MH-14-1234';
    const salesman = newSalesmanName.trim() || 'Salesman';
    const date = new Date().toISOString().slice(0, 10);
    const whId = defaultWarehouse?.id || warehouses[0]?.id || 'wh-kuchinda';

    // Only load items where qty > 0, capped to warehouse stock
    const finalLoad: Record<number, number> = {};
    for (const p of products) {
      const entered = loadQuantities[p.id] ?? 0;
      const whAvail = typeof warehouseStock === 'function' ? warehouseStock(whId, p.id) : (p.opening || 0);
      const safeQty = Math.min(Math.max(0, entered), Math.max(0, whAvail));
      if (safeQty > 0) {
        finalLoad[p.id] = safeQty;
      }
    }

    const totalLoaded = Object.values(finalLoad).reduce((a, b) => a + b, 0);
    if (totalLoaded === 0) {
      triggerFeedback('Please enter at least 1 case quantity to load into the vehicle.', 'warn');
      return;
    }

    const newT = addTrip(vehicle, date, finalLoad, whId, [], salesman, newRouteName.trim());
    setSelectedTripId(newT.id);
    setShowNewVanModal(false);
    setLoadQuantities({});
    setLoadQuantityWarnings({});
    triggerFeedback(`Vehicle ${vehicle} loaded with ${totalLoaded} cases for ${salesman}!`, 'success');
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
      gst: selectedProduct.gstRate || 0.18,
      priceType,
      qty: quantity,
      rate,
      gross: computed.gross,
      freeQty: computed.freeQty,
      chargeableQty: computed.chargeableQty,
      discount: computed.discount,
      amount: computed.amount,
      batchNumber: selectedProduct.batchNumber,
      hsn: selectedProduct.hsn,
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
        const computed = computeLine(prod, it.priceType, safeQty, null, it.rate);
        return {
          ...it,
          qty: safeQty,
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
      const computed = computeLine(prod, priceType, targetQty, null, rate);
      const newItem: BillItem = {
        key: `${prod.id}_${Date.now()}`,
        productId: prod.id,
        productName: prod.name,
        category: prod.category,
        gst: prod.gstRate || 0.18,
        priceType,
        qty: targetQty,
        rate,
        gross: computed.gross,
        freeQty: computed.freeQty,
        chargeableQty: computed.chargeableQty,
        discount: computed.discount,
        amount: computed.amount,
        batchNumber: prod.batchNumber,
        hsn: prod.hsn,
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

        if (existingIdx >= 0) {
          const prevItem = updatedItems[existingIdx];
          const computed = computeLine(prod, prevItem.priceType, safeQty, null, prevItem.rate, prevItem.discount);
          updatedItems[existingIdx] = {
            ...prevItem,
            qty: safeQty,
            gross: computed.gross,
            freeQty: computed.freeQty,
            chargeableQty: computed.chargeableQty,
            discount: computed.discount,
            amount: computed.amount,
          };
        } else {
          const rate = priceType === 'Retail' ? prod.retail : prod.wholesale;
          const computed = computeLine(prod, priceType, safeQty, null, rate);
          updatedItems.push({
            key: `${prod.id}_${Date.now()}_${Math.random()}`,
            productId: prod.id,
            productName: prod.name,
            category: prod.category,
            gst: prod.gstRate || 0.18,
            priceType,
            qty: safeQty,
            rate,
            gross: computed.gross,
            freeQty: computed.freeQty,
            chargeableQty: computed.chargeableQty,
            discount: computed.discount,
            amount: computed.amount,
            batchNumber: prod.batchNumber,
            hsn: prod.hsn,
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
        const lower = transcript.toLowerCase().trim();
        const matched = frequentRetailers.find(
          (r) => r.name.toLowerCase().includes(lower) || lower.includes(r.name.toLowerCase())
        );
        if (matched) {
          setSelectedRetailer(matched.name);
          if (matched.phone) setRetailerPhone(matched.phone);
          speakAssistiveText(`Selected shop ${matched.name}`);
          triggerFeedback(`Voice matched: ${matched.name}`);
        } else {
          setSelectedRetailer(transcript);
          speakAssistiveText(`Customer set to ${transcript}`);
          triggerFeedback(`Customer set to: ${transcript}`);
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

    // Update cart party info before finalizing
    setCart((prev) => ({
      ...prev,
      retailer: selectedRetailer.trim(),
      phone: retailerPhone.trim(),
      date: new Date().toISOString().slice(0, 10),
      warehouseId: activeTrip.warehouseId || '',
      tripId: activeTrip.id,
      vehicle: activeTrip.vehicle,
      salesman: activeTrip.salesman,
      additionalDiscount: appliedDiscount,
    }));

    const billId = finalizeBill(paid, activeTrip.id, appliedDiscount);
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
          date: new Date().toISOString().slice(0, 10),
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
        date: new Date().toISOString().slice(0, 10),
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
      setAmountPaidDraft('0');
      setInvoiceDiscountDraft('');
      setSettledTotalDraft('');
      setQuantity(1);
      setIsCartOpen(false);
    }
  };

  return (
    <div
      id="salesman-app-root"
      className="min-h-screen pb-28 md:pb-12"
      style={{
        backgroundColor: palette.cream,
        color: palette.ink,
      }}
    >
      {/* Top Banner: Mode & Active Vehicle Switcher */}
      <header
        id="salesman-header"
        className="sticky top-0 z-30 border-b-2 shadow-md px-3 sm:px-4 py-2.5 sm:py-3 space-y-3"
        style={{
          backgroundColor: palette.panel,
          borderColor: palette.line,
        }}
      >
        <div className="max-w-6xl mx-auto space-y-3">
          {/* ================================================================= */}
          {/* ROW 1: FULL-WIDTH MODE SWITCHER (#btn-mode-normal / #btn-mode-visionless) */}
          {/* Minimum button height 44px, font size 16px+, icon size 20px+ */}
          {/* ================================================================= */}
          <div
            className="w-full"
            role="radiogroup"
            aria-label="Salesman View Mode"
          >
            <div className="grid grid-cols-2 gap-2.5 w-full">
              <button
                type="button"
                id="btn-mode-normal"
                onClick={() => handleSetMode('normal')}
                aria-checked={salesmanMode === 'normal'}
                role="radio"
                className={`w-full min-h-[44px] py-2 px-3 sm:px-4 rounded-xl border-2 flex items-center justify-center gap-2.5 cursor-pointer font-black transition-all ${
                  salesmanMode === 'normal'
                    ? 'shadow-md ring-2 ring-blue-900/30'
                    : 'opacity-70 hover:opacity-100 hover:bg-slate-100'
                }`}
                style={{
                  fontSize: '16px',
                  borderColor: salesmanMode === 'normal' ? palette.navy : palette.line,
                  backgroundColor: salesmanMode === 'normal' ? palette.navy : palette.panel,
                  color: salesmanMode === 'normal' ? '#FFFFFF' : palette.ink,
                }}
              >
                <User size={22} className="shrink-0" />
                <span className="truncate">Normal Mode</span>
              </button>

              <button
                type="button"
                id="btn-mode-visionless"
                onClick={() => handleSetMode('lowVision')}
                aria-checked={salesmanMode === 'lowVision'}
                role="radio"
                className={`w-full min-h-[44px] py-2 px-3 sm:px-4 rounded-xl border-2 flex items-center justify-center gap-2.5 cursor-pointer font-black transition-all ${
                  salesmanMode === 'lowVision'
                    ? 'shadow-md ring-2 ring-amber-500/40'
                    : 'opacity-70 hover:opacity-100 hover:bg-slate-100'
                }`}
                style={{
                  fontSize: '16px',
                  borderColor: salesmanMode === 'lowVision' ? (isLowVision ? '#000000' : palette.bad) : palette.line,
                  backgroundColor: salesmanMode === 'lowVision' ? (isLowVision ? '#FACC15' : palette.bad) : palette.panel,
                  color: salesmanMode === 'lowVision' ? (isLowVision ? '#000000' : '#FFFFFF') : palette.ink,
                }}
              >
                <Eye size={22} className="shrink-0" />
                <span className="truncate">Visionless Mode</span>
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* ROW 2: APP TITLE & ACTIVE VEHICLE STATUS                          */}
          {/* ================================================================= */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 shadow-2xs"
                style={{
                  backgroundColor: palette.navy,
                  color: '#FFFFFF',
                }}
              >
                <Truck size={20} />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="truncate text-lg sm:text-xl font-black tracking-tight"
                    style={{
                      lineHeight: 1.1,
                      color: palette.ink,
                    }}
                  >
                    Van Sales & Routes
                  </span>
                  <span
                    className="px-2.5 py-0.5 text-xs font-black rounded-full uppercase shrink-0"
                    style={{
                      backgroundColor: activeTrip ? palette.good : palette.bad,
                      color: '#FFFFFF',
                    }}
                  >
                    {activeTrip ? 'ACTIVE TRIP' : 'NO VEHICLE'}
                  </span>
                </div>
              </div>
            </div>

            {/* Load Van Run Action Button & Log Out Button */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                id="salesman-btn-load-van"
                onClick={() => setShowNewVanModal(true)}
                className="min-h-[44px] px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-black rounded-xl border-2 flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
                style={{
                  backgroundColor: palette.amber,
                  color: '#FFFFFF',
                  borderColor: palette.amber,
                }}
              >
                <Plus size={16} />
                <span>Load Vehicle Run</span>
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* ROW 3: VEHICLE / TRIP SELECTOR (Tappable Card/List, 16px+, 44px+) */}
          {/* ================================================================= */}
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="font-black text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <span>{showTripHistory ? 'All Dispatches / History' : "Today's Active Vehicle Runs"}</span>
                <span className="font-bold text-slate-400">
                  ({showTripHistory ? relevantTrips.length : todayOutTrips.length})
                </span>
              </div>

              {olderOrClosedTrips.length > 0 && (
                <button
                  type="button"
                  id="btn-toggle-trip-history"
                  onClick={() => setShowTripHistory(!showTripHistory)}
                  className="font-black text-blue-900 hover:text-blue-950 underline cursor-pointer flex items-center gap-1 min-h-[32px]"
                >
                  <HistoryIcon size={14} />
                  <span>{showTripHistory ? "Show Today's Only" : `Trip History (${olderOrClosedTrips.length} past runs)`}</span>
                </button>
              )}
            </div>

            {/* Tappable Card List replacing native <select> */}
            <div
              id="salesman-select-vehicle"
              role="listbox"
              aria-label="Select active vehicle trip"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              {displayedTrips.length > 0 ? (
                displayedTrips.map((t) => {
                  const isSelected = selectedTripId === t.id;
                  const isOut = t.status === 'out';
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setSelectedTripId(t.id);
                        if (isLowVision) speakAssistiveText(`Selected vehicle ${t.vehicle}`);
                      }}
                      className={`w-full min-h-[48px] p-3 rounded-xl border-2 flex items-center justify-between gap-3 text-left transition-all cursor-pointer shadow-2xs ${
                        isSelected
                          ? 'border-blue-900 bg-blue-50/90 ring-2 ring-blue-900/30'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-slate-900 truncate">
                            {t.vehicle}
                          </span>
                          <span
                            className={`text-xs font-black px-2 py-0.5 rounded-full uppercase shrink-0 ${
                              isOut ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isOut ? 'OUT' : t.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
                          {t.salesman && (
                            <span>
                              Salesman: <strong className="text-slate-700">{t.salesman}</strong>
                            </span>
                          )}
                          {t.route && <span>• {t.route}</span>}
                          {t.date && <span>• {t.date}</span>}
                        </div>
                      </div>

                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-blue-900 text-white flex items-center justify-center shrink-0">
                          <CheckCircle2 size={16} />
                        </div>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="col-span-full p-4 rounded-xl border-2 border-dashed border-slate-300 text-center space-y-2 bg-slate-50">
                  <div className="text-sm font-bold text-slate-600">
                    No vehicles currently out on route for today ({todayStr}).
                  </div>
                  {olderOrClosedTrips.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTripHistory(true)}
                      className="text-xs font-black text-blue-900 hover:underline cursor-pointer"
                    >
                      Click here to view Trip History ({olderOrClosedTrips.length} past runs)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Cards: Exactly the 5 requested salesman capabilities */}
        <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2 pt-2 border-t" style={{ borderColor: palette.line }}>
          {/* Capability 1: Sell */}
          <button
            type="button"
            id="nav-card-sale"
            onClick={() => {
              setSalesmanTab('sell');
              if (isLowVision) speakAssistiveText('Customer Billing workflow active.');
            }}
            className={`p-2 sm:p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
              salesmanTab === 'sell'
                ? isLowVision
                  ? 'border-black bg-yellow-300 text-black shadow-md ring-2 ring-black'
                  : 'border-blue-900 bg-blue-50/90 text-blue-950 shadow-sm ring-2 ring-blue-900/30'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                <ShoppingCart size={15} className={salesmanTab === 'sell' ? 'text-blue-900' : 'text-slate-500'} />
                <span>1. Sell</span>
              </div>
              {selectedRetailer ? (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 truncate max-w-[65px]">
                  Draft
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400">POS</span>
              )}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
              {selectedRetailer ? selectedRetailer : 'Billing Workflow'}
            </div>
          </button>

          {/* Capability 2: Van Stock */}
          <button
            type="button"
            id="nav-card-stock"
            onClick={() => {
              setSalesmanTab('vanStock');
              if (isLowVision) speakAssistiveText('Van Stock & Reconciliation active.');
            }}
            className={`p-2 sm:p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
              salesmanTab === 'vanStock'
                ? isLowVision
                  ? 'border-black bg-yellow-300 text-black shadow-md ring-2 ring-black'
                  : 'border-blue-900 bg-blue-50/90 text-blue-950 shadow-sm ring-2 ring-blue-900/30'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                <Package size={15} className={salesmanTab === 'vanStock' ? 'text-blue-900' : 'text-slate-500'} />
                <span>2. Van Stock</span>
              </div>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                {vehicleProducts.length} Loaded
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
              Loaded vs Sold vs Rec
            </div>
          </button>

          {/* Capability 3: My Bills */}
          <button
            type="button"
            id="nav-card-bills"
            onClick={() => {
              setSalesmanTab('bills');
              if (isLowVision) speakAssistiveText(`My Bills history active. ${myBills.length} invoices.`);
            }}
            className={`p-2 sm:p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
              salesmanTab === 'bills'
                ? isLowVision
                  ? 'border-black bg-yellow-300 text-black shadow-md ring-2 ring-black'
                  : 'border-blue-900 bg-blue-50/90 text-blue-950 shadow-sm ring-2 ring-blue-900/30'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                <FileText size={15} className={salesmanTab === 'bills' ? 'text-blue-900' : 'text-slate-500'} />
                <span>3. My Bills</span>
              </div>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                {myBills.length} Bills
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
              Own Dispatches Only
            </div>
          </button>

          {/* Capability 4: Customer Payment Due Lookup */}
          <button
            type="button"
            id="nav-card-customer-due"
            onClick={() => {
              setSalesmanTab('customerDue');
              if (isLowVision) speakAssistiveText('Customer Payment Due Lookup active.');
            }}
            className={`p-2 sm:p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
              salesmanTab === 'customerDue'
                ? isLowVision
                  ? 'border-black bg-yellow-300 text-black shadow-md ring-2 ring-black'
                  : 'border-blue-900 bg-blue-50/90 text-blue-950 shadow-sm ring-2 ring-blue-900/30'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                <IndianRupee size={15} className={salesmanTab === 'customerDue' ? 'text-blue-900' : 'text-slate-500'} />
                <span>4. Payment Due</span>
              </div>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                Lookup
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
              Outstanding & Record
            </div>
          </button>

          {/* Capability 5: Trips (their own runs only) */}
          <button
            type="button"
            id="nav-card-trips"
            onClick={() => {
              setSalesmanTab('trips');
              if (isLowVision) speakAssistiveText(`Trips active. ${relevantTrips.length} assigned runs.`);
            }}
            className={`p-2 sm:p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
              salesmanTab === 'trips'
                ? isLowVision
                  ? 'border-black bg-yellow-300 text-black shadow-md ring-2 ring-black'
                  : 'border-blue-900 bg-blue-50/90 text-blue-950 shadow-sm ring-2 ring-blue-900/30'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                <Truck size={15} className={salesmanTab === 'trips' ? 'text-blue-900' : 'text-slate-500'} />
                <span>5. Trips</span>
              </div>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                {relevantTrips.length} Runs
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
              Own Dispatches Only
            </div>
          </button>
        </div>

        {/* Quick Review Cart Bar when items exist */}
        {cart.items.length > 0 && (
          <div className="max-w-6xl mx-auto mt-2">
            <button
              type="button"
              id="btn-quick-review-cart-bar"
              onClick={() => {
                setIsCartOpen(true);
                if (isLowVision) speakAssistiveText(`Reviewing invoice cart. ${cart.items.length} items.`);
              }}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-amber-500 bg-amber-50 hover:bg-amber-100 text-amber-950 font-black text-xs sm:text-sm flex items-center justify-between cursor-pointer shadow-xs transition-colors"
            >
              <div className="flex items-center gap-2">
                <ShoppingBag size={16} className="text-amber-700" />
                <span>Invoice Cart: {cart.items.length} beverage item(s)</span>
                {selectedRetailer && (
                  <span className="text-xs text-amber-800 font-bold hidden sm:inline">
                    for {selectedRetailer}
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
          className="max-w-6xl mx-auto mt-3 px-4 py-2.5 rounded-md font-black text-sm flex items-center justify-between border-2 shadow-sm transition-all"
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

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 py-4">
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
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Truck size={20} className="text-blue-900 shrink-0" />
                    <h2 style={fz(18, { fontWeight: 900 })}>
                      Vehicle Stock Reconciliation: {activeTrip?.vehicle || 'No Van Assigned'}
                    </h2>
                  </div>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    Strict on-board stock accounting. Only loaded cases can be sold by this vehicle on route.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-800">
                    Total Invoiced: {money(tripTotalBilled)}
                  </div>
                  <div className="px-2.5 py-1 rounded-md bg-blue-50 border border-blue-300 text-xs font-bold text-blue-800">
                    Collected: {money(tripTotalCollected)}
                  </div>
                </div>
              </div>

              {/* High-Level On-Board Cases Summary Bar */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                <div className="bg-slate-50 border-2 rounded-lg p-2.5 sm:p-3 text-center" style={{ borderColor: palette.line }}>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Loaded</div>
                  <div className="text-lg sm:text-2xl font-black text-slate-900 mt-0.5">{vanStockCounts.totalLoadedCases} cs</div>
                  <div className="text-[10.5px] text-slate-500 font-medium hidden sm:block">Stock departed on van</div>
                </div>
                <div className="bg-blue-50/60 border-2 border-blue-200 rounded-lg p-2.5 sm:p-3 text-center">
                  <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Total Sold</div>
                  <div className="text-lg sm:text-2xl font-black text-blue-900 mt-0.5">{vanStockCounts.totalSoldCases} cs</div>
                  <div className="text-[10.5px] text-blue-600 font-medium hidden sm:block">Delivered on route</div>
                </div>
                <div className="bg-emerald-50/60 border-2 border-emerald-200 rounded-lg p-2.5 sm:p-3 text-center">
                  <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Remaining</div>
                  <div className="text-lg sm:text-2xl font-black text-emerald-800 mt-0.5">{vanStockCounts.totalAvailableCases} cs</div>
                  <div className="text-[10.5px] text-emerald-600 font-medium hidden sm:block">Ready to bill now</div>
                </div>
              </div>

              {/* Controls Toolbar: Search, Filters, and Cards/Table Toggle */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-4">
                {/* Search Bar */}
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={vanStockSearch}
                    onChange={(e) => setVanStockSearch(e.target.value)}
                    placeholder="Search van beverage by name or SKU..."
                    className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm font-semibold border-2 rounded-lg focus-ring bg-white"
                    style={{ borderColor: palette.line }}
                  />
                  {vanStockSearch && (
                    <button
                      type="button"
                      onClick={() => setVanStockSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Filter Pills & View Mode Switcher */}
                <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
                  {/* Filter chips */}
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                    <button
                      type="button"
                      onClick={() => setVanStockFilter('all')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        vanStockFilter === 'all'
                          ? 'bg-blue-900 text-white border-blue-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      All ({vanStockCounts.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setVanStockFilter('available')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        vanStockFilter === 'available'
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      Available ({vanStockCounts.available})
                    </button>
                    <button
                      type="button"
                      onClick={() => setVanStockFilter('loaded')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        vanStockFilter === 'loaded'
                          ? 'bg-blue-900 text-white border-blue-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      Loaded ({vanStockCounts.loaded})
                    </button>
                    <button
                      type="button"
                      onClick={() => setVanStockFilter('empty')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        vanStockFilter === 'empty'
                          ? 'bg-rose-700 text-white border-rose-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      Empty ({vanStockCounts.empty})
                    </button>
                  </div>

                  {/* Cards vs Table View Mode Switcher */}
                  <div className="inline-flex border-2 rounded-lg p-0.5 bg-slate-100" style={{ borderColor: palette.line }}>
                    <button
                      type="button"
                      onClick={() => setVanStockViewMode('cards')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md cursor-pointer flex items-center gap-1 transition-all ${
                        vanStockViewMode === 'cards'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Cards view (recommended for mobile/tablet)"
                    >
                      <LayoutGrid size={13} />
                      <span className="hidden sm:inline">Cards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVanStockViewMode('table')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md cursor-pointer flex items-center gap-1 transition-all ${
                        vanStockViewMode === 'table'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Compact Table view"
                    >
                      <List size={13} />
                      <span className="hidden sm:inline">Table</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* EMPTY SEARCH / FILTER RESULTS */}
              {filteredVehicleProducts.length === 0 ? (
                <div className="text-center py-10 border-2 rounded-xl bg-slate-50 text-slate-500" style={{ borderColor: palette.line }}>
                  <Package size={36} className="mx-auto mb-2 opacity-40" />
                  <p className="font-bold text-sm text-slate-700">No beverage items match this filter.</p>
                  <p className="text-xs mt-1">Try clearing your search term or selecting "All Items".</p>
                  {vanStockSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setVanStockSearch('');
                        setVanStockFilter('all');
                      }}
                      className="mt-3 px-3 py-1.5 text-xs font-bold bg-blue-900 text-white rounded-md cursor-pointer hover:bg-blue-800"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              ) : vanStockViewMode === 'cards' ? (
                /* CARD-BASED RECONCILIATION LAYOUT (MOBILE & TABLET OPTIMIZED) */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredVehicleProducts.map((p) => {
                    const isOutOfStock = p.vanAvailable <= 0;
                    const isLoaded = p.vanLoaded > 0;
                    const percentSold = isLoaded ? Math.min(100, Math.round((p.vanSold / p.vanLoaded) * 100)) : 0;

                    return (
                      <div
                        key={p.id}
                        className="border-2 rounded-xl p-3.5 bg-white shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between"
                        style={{ borderColor: isOutOfStock && isLoaded ? `${palette.bad}80` : palette.line }}
                      >
                        <div>
                          {/* Card Header: Name, SKU, and Status Badge */}
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-extrabold text-sm text-slate-900 truncate" title={p.name}>
                                {p.name}
                              </h3>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {p.sku && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                    {p.sku}
                                  </span>
                                )}
                                <span className="text-[11px] font-semibold text-slate-500">
                                  {p.volume}ml {p.pack}
                                </span>
                              </div>
                            </div>

                            {/* Van Status Badge */}
                            {!isLoaded ? (
                              <span className="px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                NOT LOADED
                              </span>
                            ) : isOutOfStock ? (
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
                              <div className="text-[10px] font-bold text-blue-600 uppercase">Sold</div>
                              <div className="text-sm font-extrabold text-blue-800">{p.vanSold} cs</div>
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
                              className="px-3 py-1.5 text-xs font-bold bg-blue-900 text-white rounded-md hover:bg-blue-800 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="Add 1 case of this product to current sale"
                            >
                              <Plus size={13} />
                              <span>Add to Sale</span>
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                              {isLoaded ? 'Sold Out' : 'Unavailable'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* TABLE VIEW (HIGH-DENSITY FOR DESKTOP / LARGE SCREENS) */
                <div className="overflow-x-auto border-2 rounded-xl" style={{ borderColor: palette.line }}>
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 bg-slate-50" style={{ borderColor: palette.line }}>
                        <th className="p-3 font-extrabold text-slate-900">Beverage Product</th>
                        <th className="p-3 font-extrabold text-center text-slate-900">Pack</th>
                        <th className="p-3 font-extrabold text-right text-slate-900">Loaded on Van</th>
                        <th className="p-3 font-extrabold text-right text-slate-900">Sold on Route</th>
                        <th className="p-3 font-extrabold text-right text-slate-900">Remaining</th>
                        <th className="p-3 font-extrabold text-center text-slate-900">Van Status</th>
                        <th className="p-3 font-extrabold text-right text-slate-900">Quick Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: palette.line }}>
                      {filteredVehicleProducts.map((p) => {
                        const isOutOfStock = p.vanAvailable <= 0;
                        const isLoaded = p.vanLoaded > 0;
                        return (
                          <tr
                            key={p.id}
                            className="hover:bg-slate-50/60 transition-colors"
                          >
                            <td className="p-3 font-bold text-slate-900">
                              <div className="flex items-center gap-2">
                                <span>{p.name}</span>
                                {p.sku && (
                                  <span className="text-xs px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                                    {p.sku}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-center text-xs font-semibold text-slate-600">{p.volume}ml {p.pack}</td>
                            <td className="p-3 text-right font-bold text-slate-800">{p.vanLoaded} cs</td>
                            <td className="p-3 text-right font-bold text-blue-700">{p.vanSold} cs</td>
                            <td className="p-3 text-right font-black text-base" style={{ color: isOutOfStock ? palette.bad : palette.good }}>
                              {p.vanAvailable} cs
                            </td>
                            <td className="p-3 text-center">
                              {!isLoaded ? (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                  NOT LOADED
                                </span>
                              ) : isOutOfStock ? (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  VAN EMPTY
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  AVAILABLE
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {p.vanAvailable > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleQuickProductCartChange(p.id, 1);
                                    triggerFeedback(`Added 1 case of ${p.name} to sale cart!`);
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold bg-blue-900 text-white rounded hover:bg-blue-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus size={12} />
                                  <span>Add</span>
                                </button>
                              ) : (
                                <span className="text-xs font-semibold text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* VIEW 3: MY BILLS (SCOPED TO OWN TRIPS/BILLS ONLY) */}
        {salesmanTab === 'bills' && (
          <section id="salesman-bills-view" className="space-y-4">
            <div
              className="p-4 sm:p-5 rounded-2xl border-2 shadow-xs space-y-4"
              style={{
                backgroundColor: palette.panel,
                borderColor: palette.line,
              }}
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2" style={{ borderColor: palette.line }}>
                <div>
                  <h2 style={fz(18, { fontWeight: 900 })} className="text-slate-900 flex items-center gap-2">
                    <FileText size={20} className="text-blue-900" />
                    <span>My Invoices & Delivery Bills</span>
                  </h2>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    Scoped strictly to your assigned vehicle dispatches and sales receipts
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="px-2.5 py-1 rounded-lg font-mono font-black bg-blue-50 text-blue-900 border border-blue-200">
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
                        ? 'bg-white text-blue-950 shadow-xs'
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
                        ? 'bg-white text-blue-950 shadow-xs'
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
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:border-blue-900"
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
                      className="mt-2 text-xs font-black text-blue-900 underline cursor-pointer"
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
                    const due = Math.max(0, total - paid);

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
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-mono">
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
                          <div className="font-black text-sm mt-0.5 text-slate-800">{bill.retailer}</div>
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
                                const text = `Invoice #${bill.id} from Radhika Distribution: ₹${bill.total} for ${bill.retailer}. Thank you!`;
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
            {/* NO ACTIVE TRIP ALERT BANNER */}
            {!activeTrip && (
              <div
                className="mb-6 p-4 rounded-lg border-2 flex flex-col sm:flex-row items-center justify-between gap-4"
                style={{
                  backgroundColor: '#FEF2F2',
                  borderColor: '#DC2626',
                  color: '#991B1B',
                }}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle size={28} className="shrink-0" />
                  <div>
                    <h3 className="font-black text-base">Vehicle Not Dispatched</h3>
                    <p className="text-xs font-bold">
                      A salesman cannot sell without loaded vehicle stock. Please start a van run or select an existing vehicle.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewVanModal(true)}
                  className="px-4 py-2 rounded bg-rose-700 text-white font-black text-sm cursor-pointer shadow-md hover:bg-rose-800 transition-colors"
                >
                  Start / Load Van Run Now
                </button>
              </div>
            )}

            <SalesmanSaleWorkflow
              confirmedBill={confirmedBill}
              setConfirmedBill={setConfirmedBill}
              cart={cart}
              activeTrip={activeTrip}
              products={products}
              customers={existingCustomers}
              selectedRetailer={selectedRetailer}
              setSelectedRetailer={setSelectedRetailer}
              retailerPhone={retailerPhone}
              setRetailerPhone={setRetailerPhone}
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
              onOpenCustomerDirectory={() => setShowCustomerSelectorModal(true)}
              onVoiceSearchCustomer={handleVoiceSearchCustomer}
              isVoiceSearching={isVoiceSearching}
              speakAssistiveText={speakAssistiveText}
              onSetSalesmanTab={setSalesmanTab}
              orgProfile={orgProfile}
              billingSettings={billingSettings}
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
              className="p-4 sm:p-5 rounded-2xl border-2 shadow-xs space-y-4"
              style={{
                backgroundColor: palette.panel,
                borderColor: palette.line,
              }}
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2" style={{ borderColor: palette.line }}>
                <div>
                  <h2 style={fz(18, { fontWeight: 900 })} className="text-slate-900 flex items-center gap-2">
                    <Truck size={20} className="text-blue-900" />
                    <span>My Vehicle Dispatches & Delivery Runs</span>
                  </h2>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    Viewing {relevantTrips.length} assigned trip runs for {userSalesmanName || 'your account'}
                  </p>
                </div>

                <button
                  type="button"
                  id="btn-load-new-van-run"
                  onClick={() => setShowNewVanModal(true)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border-2 border-blue-900 bg-blue-900 hover:bg-blue-950 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                >
                  <Plus size={15} />
                  <span>Load Vehicle Run</span>
                </button>
              </div>

              {/* Active Trip Banner */}
              {activeTrip && (
                <div
                  className="p-4 rounded-xl border-2 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{
                    backgroundColor: '#EFF6FF',
                    borderColor: '#3B82F6',
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider">
                        Active Vehicle Run
                      </span>
                      <span className="font-mono text-xs font-bold text-blue-900">
                        Date: {activeTrip.date}
                      </span>
                    </div>
                    <div className="font-black text-lg text-slate-900 mt-1">
                      {activeTrip.vehicle}
                    </div>
                    <div className="text-xs font-bold text-slate-600 mt-0.5">
                      Route: {activeTrip.route || 'Standard City Route'} • Driver/Sales: {activeTrip.salesman}
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
                      onClick={() => setSalesmanTab('sell')}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-900 text-white font-black text-xs flex items-center gap-1 hover:bg-blue-950 cursor-pointer shadow-xs"
                    >
                      <ShoppingCart size={14} />
                      <span>Start Selling</span>
                    </button>
                  </div>
                </div>
              )}

              {/* All Assigned Trips List */}
              <div className="space-y-2.5">
                <div className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Assigned Dispatches ({relevantTrips.length})
                </div>

                {relevantTrips.length === 0 ? (
                  <div
                    className="p-8 text-center rounded-xl border-2 border-dashed space-y-2 text-slate-500"
                    style={{ borderColor: palette.line }}
                  >
                    <Truck size={36} className="mx-auto text-slate-400" />
                    <div className="font-black text-sm text-slate-700">No vehicle runs assigned</div>
                    <div className="text-xs font-semibold">
                      Click "Load Vehicle Run" to load products onto a delivery vehicle.
                    </div>
                  </div>
                ) : (
                  relevantTrips.map((trip) => {
                    const isActive = activeTrip?.id === trip.id;
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
                            ? 'bg-blue-50/70 border-blue-600 shadow-xs'
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
                          </div>

                          <div className="text-xs font-semibold text-slate-600 mt-1">
                            Route: {trip.route || 'Delivery Route'} • Loaded: {tripLoadTotal} cases • Bills: {billsForTrip.length} (₹{money(totalTripBilled)})
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {isActive ? (
                            <span className="px-3 py-1.5 rounded-xl bg-blue-900 text-white font-black text-xs flex items-center gap-1 shadow-xs">
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
              </div>
            </div>
          </section>
        )}
      </main>

      {/* QUICK MODAL: LOAD VAN TRIP */}
      {showNewVanModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs"
        >
          <div
            className="w-full max-w-lg max-h-[92dvh] max-h-[92svh] flex flex-col rounded-2xl border-2 shadow-2xl p-4 sm:p-6 overflow-hidden"
            style={{
              backgroundColor: palette.panel,
              borderColor: palette.line,
              color: palette.ink,
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b-2 shrink-0" style={{ borderColor: palette.line }}>
              <div className="flex items-center gap-2">
                <Truck size={22} className="text-blue-900" />
                <h3 className="font-black text-lg">Load Vehicle Run & Assign Salesman</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewVanModal(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-black/10 cursor-pointer"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateVanTrip} className="space-y-4 mt-3 overflow-y-auto pr-1 flex-1">
              <div>
                <label className="block text-xs font-bold mb-1">Vehicle Registration / Model *</label>
                <input
                  type="text"
                  required
                  value={newVehicleName}
                  onChange={(e) => setNewVehicleName(e.target.value)}
                  placeholder="e.g. Tata Ace - MH-14-GH-1234"
                  className="w-full min-h-[44px] p-2.5 text-sm font-bold border-2 rounded-xl focus:border-blue-900 focus:outline-none"
                  style={{ borderColor: palette.line }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">Salesman Name *</label>
                  <input
                    type="text"
                    required
                    value={newSalesmanName}
                    onChange={(e) => setNewSalesmanName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full min-h-[44px] p-2.5 text-sm font-bold border-2 rounded-xl focus:border-blue-900 focus:outline-none"
                    style={{ borderColor: palette.line }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Route / Area</label>
                  <input
                    type="text"
                    value={newRouteName}
                    onChange={(e) => setNewRouteName(e.target.value)}
                    placeholder="e.g. Route A - Market"
                    className="w-full min-h-[44px] p-2.5 text-sm font-bold border-2 rounded-xl focus:border-blue-900 focus:outline-none"
                    style={{ borderColor: palette.line }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1.5">
                  Initial Load (Cases loaded into vehicle):
                </label>
                <div className="max-h-56 overflow-y-auto space-y-2 border-2 p-3 rounded-xl bg-slate-50 divide-y divide-slate-200">
                  {products.map((p) => {
                    const whId = defaultWarehouse?.id || warehouses[0]?.id || 'wh-kuchinda';
                    const availableInWh = typeof warehouseStock === 'function' ? warehouseStock(whId, p.id) : (p.opening || 0);
                    const qtyVal = loadQuantities[p.id] ?? 0;
                    const warning = loadQuantityWarnings[p.id];

                    return (
                      <div key={p.id} className="pt-2 first:pt-0 space-y-1">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-900 truncate block text-sm">{p.name} ({p.volume}ml)</span>
                            <span className="text-xs font-semibold text-blue-900 block">
                              {availableInWh} cs available in warehouse
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              min={0}
                              max={availableInWh}
                              value={qtyVal}
                              onChange={(e) => {
                                const raw = Math.max(0, parseInt(e.target.value, 10) || 0);
                                const capped = Math.min(raw, Math.max(0, availableInWh));
                                setLoadQuantities((prev) => ({ ...prev, [p.id]: capped }));
                                if (raw > availableInWh) {
                                  setLoadQuantityWarnings((prev) => ({
                                    ...prev,
                                    [p.id]: `Cannot exceed available warehouse stock (${availableInWh} cs available)`,
                                  }));
                                } else {
                                  setLoadQuantityWarnings((prev) => {
                                    const next = { ...prev };
                                    delete next[p.id];
                                    return next;
                                  });
                                }
                              }}
                              className="w-20 min-h-[44px] p-1 text-center font-black border-2 rounded-lg bg-white focus:border-blue-900 focus:outline-none text-base"
                            />
                            <span className="font-bold text-gray-500">cs</span>
                          </div>
                        </div>

                        {warning && (
                          <div className="text-[11px] font-black text-rose-600">
                            ⚠️ {warning}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNewVanModal(false)}
                  className="min-h-[44px] px-5 py-2 text-sm font-bold rounded-xl border-2 cursor-pointer hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-6 py-2 text-sm font-black rounded-xl text-white bg-blue-900 hover:bg-blue-950 cursor-pointer shadow-sm"
                >
                  Start Trip & Enable Selling
                </button>
              </div>
            </form>
          </div>
        </div>
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
              <button
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
            if (c.phone) setRetailerPhone(c.phone);
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

      {/* Floating Action Button for Cart (always accessible, positioned above mobile bottom nav) */}
      {cart.items.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 right-4 z-40">
          <button
            type="button"
            id="btn-floating-cart"
            onClick={() => {
              setIsCartOpen(true);
              if (isLowVision) speakAssistiveText(`Cart opened. ${cart.items.length} items.`);
            }}
            className={`px-4 py-3 rounded-full border-3 shadow-2xl flex items-center gap-2.5 cursor-pointer font-black transition-transform hover:scale-105 active:scale-95 ${
              isLowVision
                ? 'bg-yellow-400 text-black border-black text-base ring-4 ring-yellow-300/60'
                : 'bg-blue-900 text-white border-blue-950 text-sm ring-2 ring-blue-400/30'
            }`}
          >
            <div className="relative">
              <ShoppingCart size={isLowVision ? 22 : 18} />
              <span
                className={`absolute -top-2.5 -right-2.5 px-1.5 py-0.2 rounded-full font-black text-xs ${
                  isLowVision ? 'bg-black text-yellow-300' : 'bg-amber-400 text-slate-900'
                }`}
              >
                {cart.items.length}
              </span>
            </div>
            <span>Cart ({cart.items.length}) • ₹{money(finalCartTotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
};
