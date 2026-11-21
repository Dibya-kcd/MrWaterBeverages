import { cartTaxMix, isLineNonGst } from '../../utils/invoiceCommon';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { notify } from "../../utils/toast";
import { sizeTheme, packTheme, compareProductsInSequence } from "../../utils/sizeColor";
import { PackIcon, packTextColor } from "../common/PackIcon";
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Citrus,
  CreditCard,
  CupSoda,
  Droplets,
  FileText,
  Gift,
  LayoutGrid,
  Minus,
  Package,
  Pencil,
  Phone,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { resolveTaxRegime, noOutputTax } from '../../tax/appRegime';
import { normCustName } from '../../context/ledgerHelpers';
import { Bill, BillItem, Customer, PaymentMode, Product, Promotion, PriceType } from '../../types';
import { useBeats } from '../../hooks/useBeats';
import { NewTripSheet, NewTripPayload } from './trips/NewTripSheet';
import { useCreateTrip } from './trips/useCreateTrip';
import { beatOfCustomer } from '../../utils/beats';
import { useLanguage } from '../../i18n/LanguageContext';
import { applyCartSchemes, computeLine, money, schemeLabel, volumeFromName } from '../../utils/billing';
import { CATS } from '../../constants/initialData';
import { SchemeSelectorModal } from '../billing/SchemeSelectorModal';
import { SchemeCustomPriceModal } from '../modals/SchemeCustomPriceModal';
import { CustomerPredictiveSearch, RichCustomerOption } from '../billing/CustomerPredictiveSearch';
import { CustomerStep } from '../billing/CustomerStep';
import { NewCustomerSheet } from '../billing/NewCustomerSheet';
import { InvoiceSuccessCard } from '../billing/InvoiceSuccessCard';
import { todayISO } from "../../utils/dateLocal";
import { OrderContextBar, formatSaleDate, SaleSource } from '../billing/OrderContextBar';
import { useIsCompactLayout, useIsMobile } from '../../hooks/useIsMobile';
import { FlowInlineHeader } from '../common/FlowKit';
import { validatePhone } from '../../utils/validation';
import { tripPrimaryWarehouseId } from '../../utils/tripLoads';
import { shortCategoryLabel } from '../../utils/categoryLabel';

// Helper: extract default catalog price for product (never hardcoded 0 unless catalog has 0)
const getProductDefaultPrice = (p: Product): number => {
  if (typeof p.retail === 'number' && !isNaN(p.retail) && p.retail > 0) return p.retail;
  if (typeof p.wholesale === 'number' && !isNaN(p.wholesale) && p.wholesale > 0) return p.wholesale;
  if (typeof (p as any).price === 'number' && !isNaN((p as any).price) && (p as any).price > 0) return (p as any).price;
  return 0;
};

const ProductCardMedia: React.FC<{ product: Product }> = ({ product }) => {
  const imgSrc = (product as any).imageUrl || (product as any).image;
  const [failed, setFailed] = useState(false);
  if (imgSrc && !failed) {
    return (
      <img
        src={imgSrc}
        alt={product.name}
        className="rt-prod-media__img"
        onError={() => setFailed(true)}
      />
    );
  }
  return <PackIcon pack={product.pack} name={product.name} />;
};

interface NewSaleScreenProps {
  onBack: () => void;
  onOpenInvoiceModal: (bill: Bill, defaultFormat?: 'gst' | 'non_gst') => void;
}

export const NewSaleScreen: React.FC<NewSaleScreenProps> = ({
  onBack,
  onOpenInvoiceModal,
}) => {
  const { t, isOdia } = useLanguage();
  // Phone + tablet (< 1024px) get the compact order screens; desktop keeps its existing layout.
  const isCompact = useIsCompactLayout();
  const isPhone = useIsMobile(767);
  const [editSetup, setEditSetup] = useState(false); // phone/tablet: edit van + date in place on the order page
  const {
    products,
    bills,
    warehouses,
    defaultWarehouse,
    trips,
    salesmen,
    addTrip,
    getVehicleStock,
    customers,
    existingCustomers,
    getCustomerLedger,
    addCustomer,
    updateCustomer,
    finalizeBill,
    finalizeSplitBills,
    warehouseStock,
    remainingStock,
    promotions,
    activePromoFor,
    billingSettings,
    orgProfile,
    setCart,
    getPreviousCustomPrice,
    setCustomProductPrice,
    currentUser,
    payments,
  } = useLedger();

  // Active Trips Filtered by Role: strictly active trips (status === 'out').
  // Salesmen only see their assigned active trips; Owners/Admins see all active trips.
  const activeTripsForUser = useMemo(() => {
    const isSalesman = currentUser && typeof currentUser === 'object' && 'role' in currentUser && currentUser.role === 'salesman';
    const sId = (currentUser as any)?.salesman?.id || (currentUser as any)?.id;
    const sName = (currentUser as any)?.salesman?.name || (currentUser as any)?.name;

    return trips.filter((t) => {
      // Never show closed or completed trips
      if (t.status !== 'out') return false;
      if (isSalesman) {
        return (
          t.salesmanId === sId ||
          t.salesman === sName ||
          (!t.salesmanId && !t.salesman)
        );
      }
      return true; // Owner/Admin sees all active trips
    });
  }, [trips, currentUser]);

  // Form Configuration State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerGstin, setCustomerGstin] = useState<string>('');

  const [billType, setBillType] = useState<'tax_invoice' | 'bill_of_supply' | 'estimate'>('tax_invoice');

  // Stock from (Warehouse or active Trip)
  const defaultWarehouseId = defaultWarehouse?.id || warehouses[0]?.id || '';
  // Default to a trip linked from Trip Detail ("Record sale") if active, else first active trip, else warehouse.
  const [stockSource, setStockSource] = useState<string>(() => {
    try {
      const prefillId = Number(sessionStorage.getItem('mrwater_prefill_trip_id'));
      sessionStorage.removeItem('mrwater_prefill_trip_id');
      if (prefillId && activeTripsForUser.some((t) => Number(t.id) === prefillId)) {
        return `trip_${prefillId}`;
      }
    } catch {
      /* sessionStorage unavailable */
    }
    return activeTripsForUser.length > 0 ? `trip_${activeTripsForUser[0].id}` : defaultWarehouseId;
  });
  // Derived views of stockSource, so the existing warehouse-id / `trip_<id>` handling stays untouched.
  const saleSource: SaleSource = stockSource.startsWith('trip_') ? 'trip' : 'warehouse';
  const selectedTripId: number | undefined = stockSource.startsWith('trip_')
    ? parseInt(stockSource.replace('trip_', ''), 10)
    : undefined;
  const handleSaleSourceChange = (next: SaleSource) => {
    if (next === 'warehouse') {
      if (saleSource !== 'warehouse') setStockSource(defaultWarehouseId);
    } else if (saleSource !== 'trip' && activeTripsForUser.length > 0) {
      setStockSource(`trip_${activeTripsForUser[0].id}`);
    }
  };

  // If currently selected stock source is a trip that closed, revert back to default warehouse
  useEffect(() => {
    if (stockSource.startsWith('trip_')) {
      const tid = parseInt(stockSource.replace('trip_', ''), 10);
      const isStillActive = activeTripsForUser.some((t) => t.id === tid);
      if (!isStillActive) {
        setStockSource(defaultWarehouseId);
      }
    } else if (defaultWarehouseId && (!stockSource || !warehouses.some((w) => w.id === stockSource))) {
      setStockSource(defaultWarehouseId);
    }
  }, [stockSource, activeTripsForUser, defaultWarehouseId, warehouses]);

  // Date
  const todayStr = todayISO();
  const [saleDate, setSaleDate] = useState<string>(todayStr);
  // Composition / unregistered businesses never charge GST: lock the bill type to Bill of Supply.
  const compositionLocked = useMemo(
    () => noOutputTax(resolveTaxRegime(orgProfile, saleDate)),
    [orgProfile, saleDate],
  );
  useEffect(() => {
    if (compositionLocked && billType === 'tax_invoice') setBillType('bill_of_supply');
  }, [compositionLocked, billType]);

  // Selected Cart Items: productId -> qty
  const [selectedItems, setSelectedItems] = useState<Record<number, number>>({});
  // Track chronological order of additions for 'SAME_AS_LAST_ADDED' scheme rule
  const [itemOrder, setItemOrder] = useState<number[]>([]);

  // Custom price per case per product
  const [customRates, setCustomRates] = useState<Record<number, number>>({});

  // Active / chosen promotion overrides per product
  const [customSchemes, setCustomSchemes] = useState<Record<number, Promotion | null>>({});

  // Scheme Mode for this Bill: 'auto' | 'none' | 'manual'
  const [schemeMode, setSchemeMode] = useState<'auto' | 'none' | 'manual'>(() => {
    if (billingSettings?.schemesEnabled === false || billingSettings?.autoApplyPromotions === false) {
      return 'none';
    }
    return 'auto';
  });

  useEffect(() => {
    if (billingSettings?.schemesEnabled === false || billingSettings?.autoApplyPromotions === false) {
      setSchemeMode('none');
    }
  }, [billingSettings?.schemesEnabled, billingSettings?.autoApplyPromotions]);

  // Scheme selector modal & Quick Product Entry popup
  const [schemeModalProduct, setSchemeModalProduct] = useState<Product | null>(null);
  const [quickEntryProduct, setQuickEntryProduct] = useState<Product | null>(null);
  const [quickEntryQty, setQuickEntryQty] = useState<string>('1');
  const [quickEntryRate, setQuickEntryRate] = useState<string>('');
  const quickEntryQtyRef = useRef<HTMLInputElement | null>(null);

  // Cart Review Modal / Drawer
  const [showCartReview, setShowCartReview] = useState<boolean>(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  // UI-only: which payment card is highlighted in Order Review. It just drives paymentMode / paymentAmount.
  const [payChoice, setPayChoice] = useState<'credit' | 'cash' | 'upi' | 'partial'>('credit');

  // Modals & Panels
  const [showProductSelector, setShowProductSelector] = useState<boolean>(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustGstin, setNewCustGstin] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustBeat, setNewCustBeat] = useState('');
  const [newCustPrefilled, setNewCustPrefilled] = useState<{
    name?: boolean;
    phone?: boolean;
    gstin?: boolean;
  }>({});

  // Sale Page Beat filter (beats are configured in Settings only)
  const [selectedBeatFilter, setSelectedBeatFilter] = useState<string>('all');

  // Van Trip modal state (for starting a new delivery van dispatch)
  const [showNewTripModal, setShowNewTripModal] = useState<boolean>(false);

  // Search inside "Select Beverages & Crates" modal
  const [beverageSearch, setBeverageSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPackFilter, setSelectedPackFilter] = useState<'all' | 'can' | 'pet' | 'glass' | 'tetra'>('all');
  // Size filter (All / each size you actually stock / Soda): view-only filter, nothing is saved.
  const [selectedSize, setSelectedSize] = useState<string>('all');
  const [schemesOnly, setSchemesOnly] = useState<boolean>(false);
  const [inCartOnly, setInCartOnly] = useState<boolean>(false);
  const [catalogFilterOpen, setCatalogFilterOpen] = useState<boolean>(false);
  const catalogFilterRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!catalogFilterOpen) return;
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (catalogFilterRef.current && !catalogFilterRef.current.contains(e.target as Node)) {
        setCatalogFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [catalogFilterOpen]);
  const { beats, activeBeats } = useBeats();
  const createTrip = useCreateTrip();

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const clean = p.name.trim().toLowerCase();
      counts.set(clean, (counts.get(clean) || 0) + 1);
    }
    return counts;
  }, [products]);

  // Success message after save
  const [savedBill, setSavedBill] = useState<Bill | null>(null);
  const [phoneReviewStage, setPhoneReviewStage] = useState<'cart' | 'checkout'>('cart');

  useEffect(() => {
    const onNewBill = () => {
      setSavedBill(null);
      setPhoneReviewStage('cart');
    };
    window.addEventListener('app-new-bill', onNewBill);
    return () => window.removeEventListener('app-new-bill', onNewBill);
  }, []);

  // Cancel & Reset flow: completely clears all cart items, discounts, customer selections and closes modals
  const handleResetSale = useCallback(() => {
    setSelectedItems({});
    setItemOrder([]);
    setCustomRates({});
    setCustomSchemes({});
    setSelectedCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerGstin('');
    setPaymentAmount('');
    setPaymentMode('cash');
    setPaymentNote('');
    setPayChoice('credit');
    const resetIsTrip = stockSource.startsWith('trip_');
    const resetTripId = resetIsTrip ? parseInt(stockSource.replace('trip_', ''), 10) : undefined;
    const resetTrip = resetTripId != null ? trips.find((t) => Number(t.id) === resetTripId) : undefined;
    setCart({
      retailer: '',
      phone: '',
      date: todayISO(),
      items: [],
      warehouseId: resetIsTrip
        ? tripPrimaryWarehouseId(resetTrip) || undefined
        : defaultWarehouseId || undefined,
      tripId: resetTripId,
    });
    setShowProductSelector(false);
    setCatalogFilterOpen(false);
    setSelectedCategory('all');
    setSchemesOnly(false);
    setInCartOnly(false);
    setShowCartReview(false);
    setPhoneReviewStage('cart');
    setShowCancelSaleConfirm(false);
  }, [defaultWarehouseId, setCart, stockSource, trips]);

  const [showCancelSaleConfirm, setShowCancelSaleConfirm] = useState<boolean>(false);

  // All available customers combined
  const customerOptions = useMemo(() => {
    const list: { id: string; name: string; phone?: string; gstin?: string }[] = [];
    const seenNames = new Set<string>();
    const last10 = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);

    // same name + different phone numbers = different shops, so each stays its own choice
    const phonesByName = new Map<string, Set<string>>();
    (customers || []).forEach((c) => {
      const k = normCustName(c.name);
      const d = last10(c.phone);
      if (!k || d.length < 10) return;
      if (!phonesByName.has(k)) phonesByName.set(k, new Set());
      phonesByName.get(k)!.add(d);
    });

    (customers || []).forEach((c, idx) => {
      const trimmed = (c.name || '').trim();
      const nameKey = normCustName(trimmed) || trimmed.toLowerCase();
      const d = last10(c.phone);
      const split = (phonesByName.get(nameKey)?.size || 0) > 1;
      const key = split ? `${nameKey}|${d.length === 10 ? d : c.id}` : nameKey;
      if (trimmed && !seenNames.has(key)) {
        seenNames.add(key);
        seenNames.add(nameKey);
        const custId = c.id || `cust_${idx}_${encodeURIComponent(trimmed.toLowerCase())}`;
        list.push({ id: custId, name: trimmed, phone: c.phone, gstin: c.gstin });
      }
    });

    (existingCustomers || []).forEach((c, idx) => {
      const trimmed = (c.name || '').trim();
      const nameKey = normCustName(trimmed) || trimmed.toLowerCase();
      if (trimmed && !seenNames.has(nameKey)) {
        seenNames.add(nameKey);
        const custId = c.id || `ec_${idx}_${encodeURIComponent(trimmed.toLowerCase())}`;
        list.push({ id: custId, name: trimmed, phone: c.phone });
      }
    });

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, existingCustomers]);

  // Load previous custom prices when customer changes
  const loadCustomPricesForCustomer = (name: string) => {
    if (!name || !getPreviousCustomPrice) return;
    const newRates: Record<number, number> = {};
    products.forEach((p) => {
      const prevPrice = getPreviousCustomPrice(p.id, name);
      if (prevPrice !== null && prevPrice !== undefined && prevPrice > 0) {
        newRates[p.id] = prevPrice;
      }
    });
    if (Object.keys(newRates).length > 0) {
      setCustomRates((prev) => ({ ...prev, ...newRates }));
    }
  };

  // When customer dropdown changes
  const handleCustomerChange = (val: string) => {
    if (val === '__new__') {
      setNewCustPrefilled({});
      setShowNewCustomerModal(true);
      return;
    }
    if (val === '__walkin__') {
      setSelectedCustomerId('__walkin__');
      setCustomerName('Apt / Walk-in sale');
      setCustomerPhone('');
      setCustomerGstin('');
      loadCustomPricesForCustomer('Apt / Walk-in sale');
      checkAndPromptProducts('Apt / Walk-in sale', stockSource);
      return;
    }
    setSelectedCustomerId(val);
    const found = customerOptions.find((c) => c.id === val);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone || '');
      setCustomerGstin(found.gstin || '');
      loadCustomPricesForCustomer(found.name);
      checkAndPromptProducts(found.name, stockSource);
    } else {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerGstin('');
    }
  };

  // Step 1 → Step 2: once a retailer is picked (or saved), go straight to the Beverage Catalog.
  // Changing stock-from / date never opens it on its own.
  const checkAndPromptProducts = (_cust: string, _stock: string) => {
    setShowProductSelector(true);
  };

  // Stock from change (Godown or Van Trip)
  const handleStockSourceChange = (val: string) => {
    if (val === '__new_van_trip__') {
      setShowNewTripModal(true);
      return;
    }
    setStockSource(val);
  };

  // Load a new van with the same load-sheet screen the Trips page uses, then sell from it
  const handleCreateTrip = (payload: NewTripPayload): string | null => {
    const res = createTrip.create(payload);
    if (res.ok === false) return res.error;
    setShowNewTripModal(false);
    setStockSource(`trip_${res.trip.id}`);
    notify(`${payload.vehicle} loaded with ${res.total} cs${res.godowns > 1 ? ` from ${res.godowns} godowns` : ''}.`);
    return null;
  };

  // Filter customers by selected beat if beat filter is active on sale page
  const filteredCustomersForPredictive = useMemo(() => {
    if (selectedBeatFilter === 'all') return customers;
    return (customers || []).filter((c) => {
      const bName = beatOfCustomer(c, beats)?.name || c.route || c.city || '';
      return bName.toLowerCase() === selectedBeatFilter.toLowerCase();
    });
  }, [customers, beats, selectedBeatFilter]);

  const filteredExistingCustomersForPredictive = useMemo(() => {
    if (selectedBeatFilter === 'all') return existingCustomers;
    return (existingCustomers || []).filter((c) => {
      const match = (customers || []).find((cust) => cust.name.toLowerCase() === c.name.toLowerCase());
      const bName = (match && (beatOfCustomer(match, beats)?.name || match.route || match.city)) || c.address || '';
      return bName.toLowerCase().includes(selectedBeatFilter.toLowerCase());
    });
  }, [existingCustomers, customers, beats, selectedBeatFilter]);

  // Quick save new customer with Beat
  const handleSaveNewCustomer = () => {
    if (!newCustName.trim()) return;
    if (newCustPhone.trim()) {
      const phoneErr = validatePhone(newCustPhone, { label: 'Customer phone' });
      if (phoneErr) {
        notify(phoneErr);
        return;
      }
    }

    let assignedBeatId: string | undefined = undefined;
    const cleanBeat = (newCustBeat || '').trim();

    if (cleanBeat) {
      const match =
        activeBeats.find((b) => b.name.toLowerCase() === cleanBeat.toLowerCase()) ||
        beats.find((b) => b.name.toLowerCase() === cleanBeat.toLowerCase());
      if (match) {
        assignedBeatId = match.id;
      }
    }

    const created = addCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      gstin: newCustGstin.trim().toUpperCase() || undefined,
      address: newCustAddress.trim() || undefined,
      city: cleanBeat || undefined,
      route: cleanBeat || undefined,
      beatId: assignedBeatId,
    });

    setShowNewCustomerModal(false);
    setSelectedCustomerId(created.id);
    setCustomerName(created.name);
    setCustomerPhone(created.phone || '');
    setCustomerGstin(created.gstin || '');
    setNewCustName('');
    setNewCustPhone('');
    setNewCustGstin('');
    setNewCustAddress('');
    setNewCustBeat('');
    notify(`Customer "${created.name}" saved${cleanBeat ? ` in Beat "${cleanBeat}"` : ''}.`);
    checkAndPromptProducts(created.name, stockSource);
  };



  // Get stock for product at selected location (warehouse or trip vehicle)
  const getProductStock = useCallback((productId: number): number => {
    if (stockSource.startsWith('trip_')) {
      const tripId = parseInt(stockSource.replace('trip_', ''), 10);
      const trip = trips.find((t) => t.id === tripId);
      if (trip) {
        if (getVehicleStock) {
          const vs = getVehicleStock(trip, productId);
          return Math.max(0, vs.available);
        }
        const loaded = Number(trip.loaded?.[productId] || 0);
        const returned = Number(trip.returned?.[productId] || 0);
        return Math.max(0, loaded - returned);
      }
      return 0;
    }
    // Warehouse stock
    if (warehouseStock) {
      return warehouseStock(stockSource, productId);
    }
    return remainingStock(productId);
  }, [stockSource, trips, getVehicleStock, warehouseStock, remainingStock]);

  // Products available in the selected warehouse or vehicle (or already in cart)
  const availableProducts = useMemo(() => {
    return products.filter((p) => getProductStock(p.id) > 0 || (selectedItems[p.id] || 0) > 0);
  }, [products, getProductStock, selectedItems]);

  // Count of items in stock at the selected location
  const inStockCount = useMemo(() => {
    return products.filter((p) => getProductStock(p.id) > 0).length;
  }, [products, getProductStock]);

  // Product categories (only categories that have in-stock products)
  const categories = useMemo(() => {
    const set = new Set<string>();
    availableProducts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['all', ...Array.from(set)];
  }, [availableProducts]);

  // Same size the product card shows: the saved volume, else the size written in the name.
  const sizeOf = (p: { volume?: number; name?: string }): number => {
    const v = Number(p.volume);
    return v > 0 ? v : (p.name ? volumeFromName(p.name) || 0 : 0);
  };
  const isSodaProduct = (p: { category?: string; name?: string }): boolean =>
    p.category === 'vibe' || /soda|cola|carbonat/i.test(`${p.category || ''} ${p.name || ''}`);

  // One chip per size that exists among in-stock products.
  const sizeOptions = useMemo(() => {
    const set = new Set<number>();
    availableProducts.forEach((p) => {
      const v = sizeOf(p);
      if (v > 0) set.add(v);
    });
    return Array.from(set).sort((a, b) => a - b).map((v) => ({ id: String(v), label: sizeTheme(v).label }));
  }, [availableProducts]);

  // If the chosen size disappears (stock edited, catalogue changed), go back to All.
  useEffect(() => {
    if (selectedSize !== 'all' && selectedSize !== 'soda' && !sizeOptions.some((o) => o.id === selectedSize)) {
      setSelectedSize('all');
    }
  }, [sizeOptions, selectedSize]);

  // Products matching search, size, pack & available stock sorted in sequence (PET -> Can -> Glass -> Tetra, ascending volume)
  const baseFilteredProducts = useMemo(() => {
    return availableProducts
      .filter((p) => {
        if (selectedSize === 'soda') {
          if (!isSodaProduct(p)) return false;
        } else if (selectedSize !== 'all') {
          if (String(sizeOf(p)) !== selectedSize) return false;
        }
        if (selectedPackFilter !== 'all') {
          const pTheme = packTheme(p.pack, p.name);
          const pLabel = pTheme.label.toLowerCase();
          if (selectedPackFilter === 'can' && !pLabel.includes('can') && !pLabel.includes('tin')) return false;
          if (selectedPackFilter === 'pet' && !pLabel.includes('pet') && !pLabel.includes('bottle')) return false;
          if (selectedPackFilter === 'glass' && !pLabel.includes('glass') && !pLabel.includes('rgb')) return false;
          if (selectedPackFilter === 'tetra' && !pLabel.includes('tetra') && !pLabel.includes('pouch')) return false;
        }

        const q = beverageSearch.toLowerCase().trim();
        const sTheme = sizeTheme(p.volume, p.name);
        const pTheme = packTheme(p.pack, p.name);
        const matchesSearch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          sTheme.label.toLowerCase().includes(q) ||
          pTheme.label.toLowerCase().includes(q) ||
          (p.pack && p.pack.toLowerCase().includes(q)) ||
          (p.volume && String(p.volume).includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q));

        return matchesSearch;
      })
      .sort(compareProductsInSequence);
  }, [availableProducts, beverageSearch, selectedPackFilter, selectedSize]);

  const hasActiveSchemeForProduct = useCallback(
    (prod: Product): boolean => {
      const userChoice = customSchemes[prod.id];
      if (userChoice !== undefined) return Boolean(userChoice);
      if (
        schemeMode === 'none' ||
        billingSettings?.schemesEnabled === false ||
        billingSettings?.autoApplyPromotions === false
      ) {
        return false;
      }
      return Boolean(activePromoFor ? activePromoFor(prod.id) : null);
    },
    [
      customSchemes,
      schemeMode,
      billingSettings?.schemesEnabled,
      billingSettings?.autoApplyPromotions,
      activePromoFor,
    ],
  );

  const schemeMatchCount = useMemo(
    () => baseFilteredProducts.filter((p) => hasActiveSchemeForProduct(p)).length,
    [baseFilteredProducts, hasActiveSchemeForProduct],
  );

  const cartMatchCount = useMemo(
    () => baseFilteredProducts.filter((p) => (selectedItems[p.id] || 0) > 0).length,
    [baseFilteredProducts, selectedItems],
  );

  useEffect(() => {
    if (inCartOnly && cartMatchCount === 0) setInCartOnly(false);
  }, [inCartOnly, cartMatchCount]);

  const quickFilteredProducts = useMemo(() => {
    if (!schemesOnly && !inCartOnly) return baseFilteredProducts;
    return baseFilteredProducts.filter((p) => {
      if (schemesOnly && !hasActiveSchemeForProduct(p)) return false;
      if (inCartOnly && (selectedItems[p.id] || 0) <= 0) return false;
      return true;
    });
  }, [baseFilteredProducts, schemesOnly, inCartOnly, hasActiveSchemeForProduct, selectedItems]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of quickFilteredProducts) {
      const catKey = p.category || 'other';
      counts.set(catKey, (counts.get(catKey) || 0) + 1);
    }
    return counts;
  }, [quickFilteredProducts]);

  // Filtered products inside "Select Beverages & Crates"
  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return quickFilteredProducts;
    return quickFilteredProducts.filter((p) => (p.category || 'other') === selectedCategory);
  }, [quickFilteredProducts, selectedCategory]);

  // Group filtered products category-wise in canonical category order
  const categorySections = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filteredProducts) {
      const catKey = p.category || 'other';
      const arr = map.get(catKey);
      if (arr) arr.push(p);
      else map.set(catKey, [p]);
    }
    const orderedKeys: string[] = [];
    for (const cat of categories) {
      if (cat !== 'all' && map.has(cat)) orderedKeys.push(cat);
    }
    for (const k of map.keys()) {
      if (!orderedKeys.includes(k)) orderedKeys.push(k);
    }
    return orderedKeys.map((k) => ({
      key: k,
      label: (CATS as Record<string, { name: string }>)[k]?.name || k || 'Beverages',
      items: map.get(k) || [],
    }));
  }, [filteredProducts, categories]);

  const openQuickEntry = useCallback(
    (prod: Product) => {
      const inCart = selectedItems[prod.id] || 0;
      const defRate = getProductDefaultPrice(prod);
      const curRate = customRates[prod.id] !== undefined ? customRates[prod.id] : defRate;
      setQuickEntryProduct(prod);
      setQuickEntryQty(inCart > 0 ? String(inCart) : '1');
      setQuickEntryRate(String(curRate));
      setTimeout(() => {
        quickEntryQtyRef.current?.focus();
        quickEntryQtyRef.current?.select();
      }, 30);
    },
    [selectedItems, customRates],
  );

  // Set custom price per case
  const handleSetProductRate = (productId: number, rate: number) => {
    setCustomRates((prev) => ({ ...prev, [productId]: rate }));
    if (customerName && setCustomProductPrice) {
      setCustomProductPrice(productId, rate, customerName);
    }
  };

  // Quantity updates
  const setItemQty = (productId: number, qty: number) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (qty <= 0) {
        delete next[productId];
      } else {
        next[productId] = qty;
      }
      return next;
    });

    setItemOrder((prev) => {
      if (qty <= 0) {
        return prev.filter((id) => id !== productId);
      }
      if (prev.includes(productId)) return prev;
      return [...prev, productId];
    });
  };

  // Compute bill line items with custom rate, schemes, and tax via unified applyCartSchemes
  const { lineItems, taxableAmount, cgstAmount, sgstAmount, totalTax, grandTotal, totalFreeQty, totalDiscount } = useMemo(() => {
    const pIds = Object.keys(selectedItems)
      .map(Number)
      .filter((id) => (selectedItems[id] || 0) > 0);

    // Order product IDs according to itemOrder, with any unlisted at the end
    const orderedPids = [...pIds].sort((a, b) => {
      const idxA = itemOrder.indexOf(a);
      const idxB = itemOrder.indexOf(b);
      if (idxA >= 0 && idxB >= 0) return idxA - idxB;
      if (idxA >= 0) return -1;
      if (idxB >= 0) return 1;
      return 0;
    });

    const rawLines = orderedPids.map((pId) => {
      const prod = products.find((p) => p.id === pId);
      const defaultCatalogRate = prod ? getProductDefaultPrice(prod) : 0;
      const customRate = customRates[pId] !== undefined ? customRates[pId] : defaultCatalogRate;

      const userChoice = customSchemes[pId];
      let promo: Promotion | null = null;
      let noScheme = false;

      if (userChoice !== undefined) {
        promo = userChoice;
        if (userChoice === null) noScheme = true;
      } else if (schemeMode === 'none' || billingSettings?.schemesEnabled === false) {
        promo = null;
        noScheme = true;
      } else if (schemeMode === 'manual' || billingSettings?.autoApplyPromotions === false) {
        promo = null;
        noScheme = false;
      } else {
        promo = activePromoFor ? activePromoFor(pId) : null;
      }

      return {
        productId: pId,
        qty: selectedItems[pId] || 0,
        customRate,
        promo,
        noScheme,
        priceType: 'Retail' as PriceType,
      };
    });

    return applyCartSchemes(rawLines, promotions, products, {
      billType,
      itemOrder,
      autoAddMissingFreeLines: schemeMode !== 'none',
      disableAllSchemes: schemeMode === 'none' || billingSettings?.schemesEnabled === false,
      autoApply: schemeMode === 'auto' && billingSettings?.autoApplyPromotions !== false,
    });
  }, [
    selectedItems,
    itemOrder,
    customRates,
    customSchemes,
    schemeMode,
    billingSettings?.schemesEnabled,
    billingSettings?.autoApplyPromotions,
    products,
    billType,
    activePromoFor,
    promotions,
  ]);

  const collectedAmountPreview = useMemo(() => {
    const trimmed = paymentAmount.trim();
    if (trimmed === '') return 0;
    return Math.min(grandTotal, Math.max(0, Number(trimmed) || 0));
  }, [paymentAmount, grandTotal]);
  const balanceDuePreview = Math.max(0, grandTotal - collectedAmountPreview);

  const cartTaxStatus = useMemo(() => {
    const mix = cartTaxMix(lineItems, products);
    return {
      hasNonGst: mix.nonGst.length > 0,
      hasTaxable: mix.taxable.length > 0,
      allNonGst: mix.allNonGst,
      hasMixedTax: mix.hasMixed,
    };
  }, [lineItems, products]);

  const splitPreview = useMemo(() => {
    const gstLines = lineItems.filter((it) => !isLineNonGst(it, products));
    const nonGstLines = lineItems.filter((it) => isLineNonGst(it, products));
    const gstTotal = Math.round(gstLines.reduce((s, it) => s + (Number(it.gross) || 0), 0) * 100) / 100;
    const gstTax = Math.round(gstLines.reduce((s, it) => s + (Number(it.cgst) || 0) + (Number(it.sgst) || 0), 0) * 100) / 100;
    const nonGstTotal = Math.round(nonGstLines.reduce((s, it) => s + (Number(it.amount ?? it.gross) || 0), 0) * 100) / 100;
    const gstPaid = Math.round(Math.min(collectedAmountPreview, gstTotal) * 100) / 100;
    const nonGstPaid = Math.round(Math.min(Math.max(0, collectedAmountPreview - gstPaid), nonGstTotal) * 100) / 100;
    return { gstLines, nonGstLines, gstTotal, gstTax, nonGstTotal, gstPaid, nonGstPaid };
  }, [lineItems, products, collectedAmountPreview]);

  useEffect(() => {
    if (cartTaxStatus.allNonGst && billType === 'tax_invoice') {
      setBillType('bill_of_supply');
    }
  }, [cartTaxStatus.allNonGst, billType]);

  const customerPhoneError = useMemo(
    () => (customerPhone.trim() ? validatePhone(customerPhone, { label: 'Customer phone' }) : null),
    [customerPhone]
  );

  // Total crates in cart
  const totalCartQty = useMemo(() => {
    return lineItems.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  }, [lineItems]);

  // Keep LedgerContext cart synchronized so finalizeBill succeeds
  useEffect(() => {
    const isTrip = stockSource.startsWith('trip_');
    const tripId = isTrip ? parseInt(stockSource.replace('trip_', ''), 10) : undefined;
    const matchedTrip = tripId != null ? trips.find((t) => Number(t.id) === tripId) : undefined;
    const warehouseId = isTrip
      ? tripPrimaryWarehouseId(matchedTrip) || undefined
      : stockSource || undefined;

    setCart({
      retailer: customerName,
      phone: customerPhone,
      date: saleDate,
      items: lineItems,
      warehouseId,
      tripId,
    });
  }, [customerName, customerPhone, saleDate, lineItems, stockSource, trips, setCart]);

  // Handle Save Bill from Cart Review
  const handleSaveBill = () => {
    if (!customerName.trim()) {
      notify('Please choose or enter a customer name.');
      return;
    }
    if (customerPhoneError) {
      notify(customerPhoneError);
      return;
    }
    if (lineItems.length === 0) {
      notify('Please add at least one beverage / crate to the bill.');
      setShowCartReview(false);
      setShowProductSelector(true);
      return;
    }

    const isTrip = stockSource.startsWith('trip_');
    const tripToAssign = isTrip ? parseInt(stockSource.replace('trip_', ''), 10) : undefined;
    const matchedTrip = tripToAssign != null ? trips.find((t) => Number(t.id) === tripToAssign) : undefined;
    const warehouseId = isTrip
      ? tripPrimaryWarehouseId(matchedTrip) || undefined
      : stockSource || undefined;

    const isGst = billType === 'tax_invoice' && !cartTaxStatus.allNonGst;
    const supplyType = isGst && customerGstin.trim() ? 'B2B' : 'B2C';

    const trimmedPayment = paymentAmount.trim();
    const paidNum =
      trimmedPayment === ''
        ? 0
        : Math.min(grandTotal, Math.max(0, Number(trimmedPayment) || 0));
    const effectivePaymentMode: PaymentMode =
      paidNum <= 0 ? 'credit' : paymentMode === 'credit' ? 'cash' : paymentMode;

    const resetCheckoutUi = () => {
      if (customerPhone.trim() && selectedCustomerId && selectedCustomerId !== '__walkin__' && updateCustomer) {
        const matchedCust = (customers || []).find((c) => c.id === selectedCustomerId);
        if (matchedCust && !(matchedCust.phone || '').trim()) {
          updateCustomer({
            ...matchedCust,
            phone: customerPhone.trim(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      setSelectedItems({});
      setItemOrder([]);
      setCustomRates({});
      setCustomSchemes({});
      setSelectedCustomerId('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerGstin('');
      setPaymentAmount('');
      setPaymentMode('cash');
      setPaymentNote('');
      setPayChoice('credit');
      setShowCartReview(false);
      setPhoneReviewStage('cart');
    };

    if (cartTaxStatus.hasMixedTax) {
      const splitRes = finalizeSplitBills({
        amountPaid: paidNum,
        tripId: tripToAssign,
        overallDiscount: 0,
        paymentDate: saleDate,
        paymentMode: effectivePaymentMode,
        paymentNote: paymentNote || undefined,
        billDate: saleDate,
        extras: {
          supplyType,
          customerGstin: customerGstin.trim() ? customerGstin.trim().toUpperCase() : undefined,
          isRetrospective: false,
          invoiceType: billType === 'tax_invoice' ? 'tax_invoice' : 'bill_of_supply',
          isGstInvoice: isGst,
          party: {
            retailer: customerName,
            phone: customerPhone,
            customerId:
              selectedCustomerId && selectedCustomerId !== '__walkin__' ? selectedCustomerId : undefined,
          },
        },
      });
      if (splitRes) {
        // Show exactly what was saved (never a rebuilt preview): GST invoice first, else the cash memo.
        const first = splitRes.gstBill ?? splitRes.nonGstBill;
        if (first) {
          const firstIsGst = Boolean(splitRes.gstBill) && first.docSeries !== 'non_gst';
          if (splitRes.gstBill && splitRes.nonGstBill) {
            notify(
              `Split order saved: ${splitRes.gstBill.docNo || 'GST invoice'} + ${splitRes.nonGstBill.docNo || 'Non-GST cash memo'}.`,
            );
          }
          setSavedBill(first);
          resetCheckoutUi();
          if (!isPhone) {
            onOpenInvoiceModal(first, firstIsGst && first.isGstInvoice ? 'gst' : 'non_gst');
          }
        }
      }
      return;
    }

    const billId = finalizeBill(
      paidNum,
      tripToAssign,
      0, // additionalDiscount
      saleDate,
      effectivePaymentMode,
      paymentNote || undefined,
      saleDate,
      {
        supplyType,
        customerGstin: customerGstin.trim() ? customerGstin.trim().toUpperCase() : undefined,
        isRetrospective: false,
        invoiceType: billType === 'tax_invoice' ? 'tax_invoice' : 'bill_of_supply',
        isGstInvoice: isGst,
        docSeries: cartTaxStatus.allNonGst ? 'non_gst' : 'gst',
        gstExclude: cartTaxStatus.allNonGst,
        // the customer that was picked, so the bill links to exactly that record (not a name/phone guess)
        party: {
          retailer: customerName,
          phone: customerPhone,
          customerId:
            selectedCustomerId && selectedCustomerId !== '__walkin__' ? selectedCustomerId : undefined,
        },
      }
    );

    if (billId !== null) {
      const newlyCreated: Bill = {
        id: billId,
        docSeries: cartTaxStatus.allNonGst ? 'non_gst' : 'gst',
        gstExclude: cartTaxStatus.allNonGst,
        retailer: customerName,
        phone: customerPhone,
        date: saleDate,
        items: lineItems,
        subtotal: taxableAmount,
        cgst: cgstAmount,
        sgst: sgstAmount,
        discount: totalDiscount,
        totalTaxable: taxableAmount,
        totalCgst: cgstAmount,
        totalSgst: sgstAmount,
        totalTax: totalTax,
        total: grandTotal,
        amountPaid: paidNum,
        paymentMode: effectivePaymentMode,
        warehouseId,
        tripId: tripToAssign,
        saleSource: isTrip ? 'trip' : 'warehouse',
        supplyType,
        customerGstin: customerGstin.trim() || undefined,
        invoiceType: isGst ? 'tax_invoice' : 'bill_of_supply',
        isGstInvoice: isGst,
        status: 'active',
      };

      setSavedBill(newlyCreated);
      resetCheckoutUi();
      if (!isPhone) {
        onOpenInvoiceModal(newlyCreated, isGst ? 'gst' : 'non_gst');
      }
    }
  };

  const selectedStockLabel = useMemo(() => {
    if (stockSource.startsWith('trip_')) {
      const tid = parseInt(stockSource.replace('trip_', ''), 10);
      const tr = trips.find((t) => t.id === tid);
      return tr ? `${tr.vehicle} (Van #${tr.id})` : 'Delivery Van';
    }
    const wh = warehouses.find((w) => w.id === stockSource);
    return wh ? `${wh.name} (${wh.code || 'Godown'})` : 'Godown';
  }, [stockSource, trips, warehouses]);

  // ---- Order context + review helpers (display only; cart math is untouched) ----
  const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const formattedSaleDate = formatSaleDate(saleDate, todayStr);
  const lowStockLimit = Math.max(0, Number(billingSettings?.lowStockThreshold) || 5);

  const tripOptions = useMemo(
    () =>
      activeTripsForUser.map((tr) => {
        let casesLeft = 0;
        if (getVehicleStock) {
          for (const p of products) {
            casesLeft += Math.max(0, getVehicleStock(tr, p.id).available);
          }
        } else {
          for (const pid of Object.keys(tr.loaded || {})) {
            const idNum = Number(pid);
            const loaded = Number(tr.loaded?.[idNum] || 0);
            const returned = Number(tr.returned?.[idNum] || 0);
            casesLeft += Math.max(0, loaded - returned);
          }
        }
        return {
          id: tr.id,
          label: tr.vehicle ? `${tr.vehicle} · #${tr.id}` : `Trip #${tr.id}`,
          vehicle: tr.vehicle || undefined,
          salesman: tr.salesman || undefined,
          route: tr.route || undefined,
          date: tr.date || undefined,
          casesLeft,
        };
      }),
    [activeTripsForUser, getVehicleStock, products],
  );

  const warehouseOptions = useMemo(
    () =>
      (warehouses || []).map((w) => {
        let casesLeft = 0;
        for (const p of products) {
          const qty = warehouseStock ? warehouseStock(w.id, p.id) : remainingStock(p.id);
          casesLeft += Math.max(0, qty);
        }
        return {
          id: w.id,
          name: w.name,
          code: w.code || undefined,
          casesLeft,
        };
      }),
    [warehouses, warehouseStock, remainingStock, products],
  );
  // Routes / beats of the trips that are out today: drives the "Today's Route" pill in Step 1.
  const todayRoutes = useMemo(
    () => activeTripsForUser.map((tr) => (tr.route || '').trim()).filter(Boolean),
    [activeTripsForUser],
  );

  // Credit position of the picked retailer: limit, what they owe now, and what is left to use.
  const creditInfo = useMemo(() => {
    const rec =
      (customers || []).find((c) => c.id === selectedCustomerId) ||
      (customers || []).find((c) => normCustName(c.name) === normCustName(customerName));
    const limit = Math.max(0, Number(rec?.creditLimit) || 0);
    let due = 0;
    try {
      due = Math.max(0, getCustomerLedger(customerName, customerPhone).rawBalance);
    } catch {
      /* no ledger yet: treat as nothing due */
    }
    return { limit, due, available: limit > 0 ? Math.max(0, limit - due) : (null as number | null) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, selectedCustomerId, customerName, customerPhone, bills, payments]);
  const creditExceeded = creditInfo.available !== null && grandTotal > creditInfo.available + 0.005;

  // Savings shown in the summary: scheme / % / flat discounts (already worked out by applyCartSchemes)
  // plus the gap between the catalogue rate and any custom rate typed for a line.
  const customPriceSavings = useMemo(() => {
    let sum = 0;
    for (const it of lineItems) {
      if (it.isFree || it.isBundleFreeItem) continue;
      const prod = products.find((p) => p.id === it.productId);
      const base = prod ? getProductDefaultPrice(prod) : 0;
      const rate = Number(it.rate) || 0;
      if (base > 0 && rate > 0 && rate < base) sum += (base - rate) * (Number(it.qty) || 0);
    }
    return Math.round(sum * 100) / 100;
  }, [lineItems, products]);
  const totalSavings = Math.round((totalDiscount + customPriceSavings) * 100) / 100;
  // grandTotal is already after discounts, so subtotal − savings = grand total.
  const subtotalBeforeSavings = Math.round((grandTotal + totalSavings) * 100) / 100;

  // Payment cards drive the same paymentMode / paymentAmount that handleSaveBill already reads.
  const selectPayChoice = (choice: 'credit' | 'cash' | 'upi' | 'partial') => {
    setPayChoice(choice);
    if (choice === 'partial') {
      setPaymentAmount('');
      if (paymentMode === 'credit') setPaymentMode('cash');
    }
  };
  useEffect(() => {
    if (payChoice === 'credit') {
      setPaymentMode('credit');
      setPaymentAmount('0');
    } else if (payChoice === 'cash' || payChoice === 'upi') {
      setPaymentMode(payChoice);
      setPaymentAmount(String(grandTotal)); // stays "paid in full" if the cart changes
    }
  }, [payChoice, grandTotal]);

  // Step 4 "Edit": back to Step 1 with the cart kept. Picking a retailer again returns to the catalog.
  const goBackToStep1 = () => {
    setShowCartReview(false);
    setShowProductSelector(false);
    setSelectedCustomerId('');
  };

  // "New Customer / Shop" form: shown from Step 1 and from the inline customer search below.
  const newCustomerSheet = showNewCustomerModal ? (
    <NewCustomerSheet
      name={newCustName}
      onNameChange={setNewCustName}
      phone={newCustPhone}
      onPhoneChange={setNewCustPhone}
      gstin={newCustGstin}
      onGstinChange={setNewCustGstin}
      address={newCustAddress}
      onAddressChange={setNewCustAddress}
      beat={newCustBeat}
      onBeatChange={setNewCustBeat}
      activeBeats={activeBeats}
      prefilledFields={newCustPrefilled}
      onSave={handleSaveNewCustomer}
      onClose={() => {
        setNewCustPrefilled({});
        setShowNewCustomerModal(false);
      }}
    />
  ) : null;

  const requestCancelSale = () => {
    if (totalCartQty > 0) {
      setShowCancelSaleConfirm(true);
    } else {
      handleResetSale();
    }
  };

  const cancelSaleConfirmModal = showCancelSaleConfirm ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('salesman.cancelCurrentSale')}
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="rt-card w-full max-w-sm space-y-4 shadow-2xl">
        <div className="flex items-center gap-2 text-[var(--due)] font-bold text-base">
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>{t('salesman.cancelCurrentSale')}</span>
        </div>
        <p className="text-sm text-[var(--text-2)] leading-relaxed">
          You have <strong className="text-[var(--text)]">{totalCartQty} {totalCartQty === 1 ? 'case' : 'cases'}</strong> in this cart. Cancelling will clear the cart and start fresh.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={() => setShowCancelSaleConfirm(false)}
            className="rt-btn-outline min-h-[44px]"
          >
            Keep Cart
          </button>
          <button
            type="button"
            onClick={handleResetSale}
            className="rt-btn min-h-[44px] bg-[var(--due)]! border-[var(--due)]!"
          >
            {t('salesman.cancelSale')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // STAGE 4 (Phone): Bill saved success screen before returning to Step 1
  if (isPhone && savedBill) {
    return (
      <div className="hh-view w-full min-w-0 overflow-x-hidden">
        <div
          data-esc-close
          role="dialog"
          aria-modal="true"
          aria-label={t('sell.billSavedTitle')}
          className="rt-sale-sheet"
        >
          <header className="rt-sale-header">
            <div className="rt-sale-header__row">
              <h2 className="rt-sale-header__title">{t('sell.billSavedTitle')}</h2>
            </div>
          </header>
          <div className="rt-sale-body !pt-3">
            <InvoiceSuccessCard
              bill={savedBill}
              onOpenInvoiceModal={onOpenInvoiceModal}
              onCreateNextBill={() => {
                setSavedBill(null);
                setPhoneReviewStage('cart');
              }}
              onOpenHistory={() => {
                setSavedBill(null);
                setPhoneReviewStage('cart');
                onBack();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // STEP 1: no customer chosen yet. Picking one (or saving a new one) sets selectedCustomerId, which
  // moves on to the order form below. Reset / finishing a bill clears it and brings Step 1 back.
  if (!selectedCustomerId) {
    return (
      <div className="hh-view w-full min-w-0 overflow-x-hidden">
        <CustomerStep
          customers={filteredCustomersForPredictive}
          existingCustomers={filteredExistingCustomersForPredictive}
          beats={beats}
          activeBeats={activeBeats}
          selectedBeatFilter={selectedBeatFilter}
          onBeatFilterChange={setSelectedBeatFilter}
          bills={bills}
          payments={payments}
          onBack={onBack}
          todayRoutes={todayRoutes}
          tripLabel={saleSource === 'trip' && selectedTripId !== undefined ? `Trip: #TRP-${selectedTripId}` : undefined}
          cartItemCount={totalCartQty}
          onCancelSale={requestCancelSale}
          stockSummary={{
            source: saleSource,
            label: saleSource === 'trip' ? `Van: ${selectedStockLabel}` : selectedStockLabel,
            dateLabel: formattedSaleDate,
            isBackDated: saleDate < todayStr,
          }}
          contextBar={
            <OrderContextBar
              saleSource={saleSource}
              onSaleSourceChange={handleSaleSourceChange}
              trips={tripOptions}
              selectedTripId={selectedTripId}
              onTripChange={(id) => setStockSource(`trip_${id}`)}
              warehouses={warehouseOptions}
              selectedWarehouseId={!stockSource.startsWith('trip_') ? stockSource : defaultWarehouseId}
              onWarehouseChange={(id) => setStockSource(id)}
              saleDate={saleDate}
              onSaleDateChange={setSaleDate}
              todayIso={todayStr}
            />
          }
          // Same handlers as the inline customer search in the order form (kept identical on purpose).
          onSelectCustomer={(c: RichCustomerOption) => {
            setSavedBill(null);
            setPhoneReviewStage('cart');
            setSelectedCustomerId(c.id);
            setCustomerName(c.name);
            setCustomerPhone(c.phone || '');
            setCustomerGstin(c.gstin || '');
            loadCustomPricesForCustomer(c.name);
            checkAndPromptProducts(c.name, stockSource);
          }}
          onSelectSpotSale={() => {
            setSavedBill(null);
            setPhoneReviewStage('cart');
            setSelectedCustomerId('__walkin__');
            setCustomerName('Apt / Walk-in sale');
            setCustomerPhone('');
            setCustomerGstin('');
            loadCustomPricesForCustomer('Apt / Walk-in sale');
            checkAndPromptProducts('Apt / Walk-in sale', stockSource);
          }}
          onOpenCreateCustomer={(prefill) => {
            setNewCustName(prefill.name || '');
            setNewCustPhone(prefill.phone || '');
            setNewCustGstin(prefill.gstin || '');
            setNewCustBeat(selectedBeatFilter !== 'all' ? selectedBeatFilter : '');
            setNewCustPrefilled({
              name: Boolean(prefill.name),
              phone: Boolean(prefill.phone),
              gstin: Boolean(prefill.gstin),
            });
            setShowNewCustomerModal(true);
          }}
        />
        {newCustomerSheet}
        {cancelSaleConfirmModal}
      </div>
    );
  }

  return (
    <div
      className={`hh-view w-full min-w-0 overflow-x-hidden pb-16 ${
        isCompact ? 'space-y-3' : 'space-y-4'
      }`}
    >
      {/* Top Header Bar (tablet & desktop only; phone uses AppHeader + New Sale/History tabs) */}
      {isCompact && !isPhone ? (
        <FlowInlineHeader
          title="Order Details"
          onBack={goBackToStep1}
          backLabel="Back to retailers"
          right={
            <button
              type="button"
              id="btn-floating-cart"
              onClick={() => setShowCartReview(true)}
              aria-label="Review cart and finalize bill"
              className={`min-h-[34px] sm:min-h-[38px] px-2.5 sm:px-3 rounded-full font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-all shrink-0 shadow-xs ${
                totalCartQty > 0
                  ? 'bg-gradient-to-r from-[#19A84B] to-[#0D8A38] text-white! border border-white/20'
                  : 'bg-white/15 hover:bg-white/25 text-white! border border-white/20'
              }`}
            >
              <ShoppingCart className="w-4 h-4 shrink-0" />
              {totalCartQty > 0 ? (
                <span className="tabular-nums whitespace-nowrap">
                  {totalCartQty} · ₹{money(grandTotal)}
                </span>
              ) : (
                <span className="tabular-nums">0</span>
              )}
            </button>
          }
        />
      ) : !isCompact ? (
        <div className="flex items-center justify-between gap-3 sticky top-0 bg-[var(--canvas)] z-30 py-2.5 -my-2 border-b border-slate-200/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-tight whitespace-nowrap truncate">
                Order & Invoice Details
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                Select customer, godown stock, and water products to generate bill
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(selectedCustomerId || totalCartQty > 0) && (
              <button
                type="button"
                id="btn-reset-new-customer"
                onClick={requestCancelSale}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                title="Cancel sale & clear current order"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t('salesman.cancelSale')}</span>
              </button>
            )}

            <button
              type="button"
              id="btn-floating-cart"
              onClick={() => setShowCartReview(true)}
              className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer shrink-0 ${
                totalCartQty > 0
                  ? 'bg-[var(--primary)] text-white hover:bg-[var(--primary)] shadow-emerald-950/20 active:scale-95'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
              title="Review cart and finalize bill"
            >
              <div className="relative">
                <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
                {totalCartQty > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center border border-white">
                    {totalCartQty}
                  </span>
                )}
              </div>
              <span className="hidden xs:inline">Review Cart</span>
              {totalCartQty > 0 && (
                <span className="font-mono text-emerald-200 font-bold ml-0.5">
                  ₹{money(grandTotal)}
                </span>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {/* Main Configuration Card */}
      {isPhone ? (
        <section
          className="rt-card hh-order-setup-card space-y-3.5"
          aria-label={t('sell.orderSetup')}
        >
          {/* Retailer Summary Header */}
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)]">
                  {t('sell.customer')}
                </p>
                <span className={`rt-tag ${creditInfo.due > 0.004 ? 'rt-tag--due' : 'rt-tag--paid'}`}>
                  {creditInfo.due > 0.004 ? `${t('home.dueLabel')} ${inr(creditInfo.due)}` : t('sell.paid')}
                </span>
              </div>
              <h3 className="mt-1 text-[17px] font-extrabold text-[var(--text)] leading-snug break-words">
                {customerName || 'Walk-in sale'}
              </h3>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={goBackToStep1}
                className="rt-btn-outline min-h-[44px] px-3 text-xs font-bold"
              >
                {t('sell.change')}
              </button>
              <button
                type="button"
                id="btn-reset-new-customer"
                onClick={requestCancelSale}
                aria-label={t('salesman.cancelSale')}
                title="Cancel order & select a new customer"
                className="min-h-[44px] px-3 rounded-full border border-[var(--due)]/30 bg-[var(--due-bg)] text-[var(--due)] text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('common.cancel')}</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <Phone className="w-4 h-4 text-[var(--primary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="tel"
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Customer phone / WhatsApp (optional)"
              aria-label="Customer phone number"
              className={`w-full min-h-[44px] pl-10 pr-3.5 rounded-full border bg-[var(--bg)] text-sm font-medium text-[var(--text)] focus:outline-none focus:bg-[var(--surface)] ${
                customerPhoneError
                  ? 'border-[var(--due)]'
                  : 'border-[var(--border)] focus:border-[var(--primary)]'
              }`}
            />
          </div>
          {customerGstin && (
            <span className="inline-block text-[11px] font-mono font-semibold text-[var(--text-2)]">
              GSTIN: {customerGstin}
            </span>
          )}
          {customerPhoneError && (
            <p className="text-[11px] font-medium text-[var(--due)]">{customerPhoneError}</p>
          )}

          {/* Stock Source & Bill Date Strip */}
          <div className="rounded-[var(--r-card)] bg-[var(--bg)] border border-[var(--border)] p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-2)] m-0">
                  {t('sell.stockSource')}
                </p>
                <div className="flex items-start gap-1.5 text-[13px] font-bold text-[var(--text)] min-w-0">
                  {saleSource === 'trip' ? (
                    <Truck className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                  ) : (
                    <Building2 className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                  )}
                  <span className="leading-snug break-words">
                    {saleSource === 'trip' ? `Van: ${selectedStockLabel}` : selectedStockLabel}
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 text-xs font-semibold tabular-nums ${
                    saleDate < todayStr ? 'text-[var(--soon-text)]' : 'text-[var(--text-2)]'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>{formattedSaleDate}</span>
                  {saleDate < todayStr && (
                    <span className="rt-tag rt-tag--soon">Back-dated</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditSetup((v) => !v)}
                aria-expanded={editSetup}
                className={`min-h-[44px] px-3.5 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors ${
                  editSetup
                    ? 'bg-[var(--text)] border-[var(--text)] text-[var(--surface)]'
                    : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)]'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>{editSetup ? t('sell.done') : 'Edit'}</span>
              </button>
            </div>

            {editSetup && (
              <div className="pt-2 border-t border-[var(--border)]">
                <OrderContextBar
                  saleSource={saleSource}
                  onSaleSourceChange={handleSaleSourceChange}
                  trips={tripOptions}
                  selectedTripId={selectedTripId}
                  onTripChange={(id) => setStockSource(`trip_${id}`)}
                  warehouses={warehouseOptions}
                  selectedWarehouseId={!stockSource.startsWith('trip_') ? stockSource : defaultWarehouseId}
                  onWarehouseChange={(id) => setStockSource(id)}
                  saleDate={saleDate}
                  onSaleDateChange={setSaleDate}
                  todayIso={todayStr}
                />
              </div>
            )}
          </div>

          {/* Bill Type */}
          <div>
            <label htmlFor="select-bill-type" className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-2)] mb-1.5">
              Bill Type
            </label>
            <div className="relative">
              <select
                id="select-bill-type"
                value={billType}
                onChange={(e) => setBillType(e.target.value as any)}
                className="w-full min-h-[44px] appearance-none px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)] font-semibold focus:outline-none focus:border-[var(--primary)] pr-10 cursor-pointer"
              >
                <option value="tax_invoice" disabled={compositionLocked || cartTaxStatus.allNonGst}>
                  Tax invoice (GST inclusive)
                  {compositionLocked
                    ? ' - not allowed for composition'
                    : cartTaxStatus.allNonGst
                      ? ' - disabled (all items Non-GST)'
                      : ''}
                </option>
                <option value="bill_of_supply">Bill of supply (non-GST)</option>
                <option value="estimate">Estimate / quotation</option>
              </select>
              <ChevronDown className="w-4 h-4 text-[var(--text-2)] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {compositionLocked && (
              <p className="mt-1.5 text-[11px] text-[var(--text-2)]">
                Composition taxpayer: a Bill of Supply is issued and no GST is charged to the customer.
              </p>
            )}
            {cartTaxStatus.allNonGst && (
              <p className="mt-2 rt-notice rt-notice--soon">
                All items are Non-GST / Trading — issues a separate Cash Memo (NG-...) excluded from GST filings.
              </p>
            )}
            {cartTaxStatus.hasMixedTax && (
              <p className="mt-2 rt-notice rt-notice--soon">
                Mixed cart: checkout will auto-split into 1 GST Invoice ({billingSettings?.invoicePrefix || 'INV'}-...) + 1 Non-GST Cash Memo (NG-...).
              </p>
            )}
          </div>
        </section>
      ) : isCompact ? (
        <section
          data-card-tone="sales"
          className="rounded-2xl border shadow-sm p-4 space-y-3.5"
          aria-label="Order setup"
        >
          {/* Retailer Summary Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#5A7198]">
                  Retailer
                </p>
                {creditInfo.due > 0.004 ? (
                  <span className="bg-red-50 text-red-700 font-bold rounded-md px-2 py-0.5 text-[11px] whitespace-nowrap tabular-nums">
                    Due {inr(creditInfo.due)}
                  </span>
                ) : (
                  <span className="text-[#15803D] font-bold text-[11px] whitespace-nowrap tabular-nums">
                    Due ₹0
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-[18px] font-extrabold text-[#0A1F44] leading-snug break-words">
                {customerName || 'Walk-in sale'}
              </h3>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Phone className="w-3.5 h-3.5 text-[#1A63DB] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Customer phone / WhatsApp (optional)"
                    aria-label="Customer phone number"
                    className={`w-full min-h-[38px] pl-8 pr-2.5 rounded-xl border bg-[#F5F8FD] text-xs font-semibold text-[#0A1F44] focus:outline-none focus:bg-white focus:ring-2 ${
                      customerPhoneError
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                        : 'border-[#DCE5F2] focus:border-[#1A63DB] focus:ring-[#1A63DB]/15'
                    }`}
                  />
                </div>
                {customerGstin && (
                  <span className="text-[11px] font-mono font-semibold text-[#5A7198]">
                    GSTIN: {customerGstin}
                  </span>
                )}
              </div>
              {customerPhoneError && (
                <p className="mt-1 text-[11px] font-medium text-rose-600">{customerPhoneError}</p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={goBackToStep1}
                className="min-h-[36px] px-2.5 rounded-xl border border-[#DCE5F2] bg-[#F5F8FD] hover:bg-[#EAF1FB] text-xs font-bold text-[#1A63DB] cursor-pointer transition-colors whitespace-nowrap"
              >
                Change
              </button>
              <button
                type="button"
                id="btn-reset-new-customer"
                onClick={requestCancelSale}
                aria-label={t('salesman.cancelSale')}
                title="Cancel order & select a new customer"
                className="min-h-[36px] px-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('common.cancel')}</span>
              </button>
            </div>
          </div>

          {/* Stock Source & Bill Date Strip */}
          <div className="rounded-xl bg-white/80 border border-black/5 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <div className="flex items-start gap-1.5 text-[13px] font-bold text-[#0A1F44] min-w-0">
                  {saleSource === 'trip' ? (
                    <Truck className="w-4 h-4 text-[#1A63DB] shrink-0 mt-0.5" />
                  ) : (
                    <Building2 className="w-4 h-4 text-[#1A63DB] shrink-0 mt-0.5" />
                  )}
                  <span className="leading-snug break-words">
                    {saleSource === 'trip' ? `Van: ${selectedStockLabel}` : selectedStockLabel}
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 text-xs font-semibold tabular-nums ${
                    saleDate < todayStr ? 'text-amber-800' : 'text-[#4A638D]'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>{formattedSaleDate}</span>
                  {saleDate < todayStr && (
                    <span className="text-[11px] font-bold text-amber-700">· Back-dated</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditSetup((v) => !v)}
                aria-expanded={editSetup}
                className={`min-h-[38px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors ${
                  editSetup
                    ? 'bg-[#0A1F44] border-[#0A1F44] text-white'
                    : 'bg-white border-[#DCE5F2] text-[#0A1F44] hover:bg-slate-50'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>{editSetup ? 'Done' : 'Edit'}</span>
              </button>
            </div>

            {editSetup && (
              <div className="pt-2 border-t border-[#DCE5F2]">
                <OrderContextBar
                  saleSource={saleSource}
                  onSaleSourceChange={handleSaleSourceChange}
                  trips={tripOptions}
                  selectedTripId={selectedTripId}
                  onTripChange={(id) => setStockSource(`trip_${id}`)}
                  warehouses={warehouseOptions}
                  selectedWarehouseId={!stockSource.startsWith('trip_') ? stockSource : defaultWarehouseId}
                  onWarehouseChange={(id) => setStockSource(id)}
                  saleDate={saleDate}
                  onSaleDateChange={setSaleDate}
                  todayIso={todayStr}
                />
              </div>
            )}
          </div>

          {/* Bill Type */}
          <div>
            <label htmlFor="select-bill-type" className="block text-[11px] font-bold uppercase tracking-wider text-[#5A7198] mb-1.5">
              Bill Type
            </label>
            <div className="relative">
              <select
                id="select-bill-type"
                value={billType}
                onChange={(e) => setBillType(e.target.value as any)}
                className="w-full min-h-[46px] appearance-none px-3.5 rounded-xl border border-[#DCE5F2] bg-white text-sm text-[#0A1F44] font-semibold focus:outline-none focus:border-[#1A63DB] focus:ring-2 focus:ring-[#1A63DB]/15 pr-10 cursor-pointer"
              >
                <option value="tax_invoice" disabled={compositionLocked || cartTaxStatus.allNonGst}>
                  Tax invoice (GST inclusive)
                  {compositionLocked
                    ? ' - not allowed for composition'
                    : cartTaxStatus.allNonGst
                      ? ' - disabled (all items Non-GST)'
                      : ''}
                </option>
                <option value="bill_of_supply">Bill of supply (non-GST)</option>
                <option value="estimate">Estimate / quotation</option>
              </select>
              <ChevronDown className="w-4 h-4 text-[#5A7198] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {compositionLocked && (
              <p className="mt-1.5 text-[11px] text-[#5A7198]">
                Composition taxpayer: a Bill of Supply is issued and no GST is charged to the customer.
              </p>
            )}
            {cartTaxStatus.allNonGst && (
              <p className="mt-1.5 text-[11px] font-medium text-amber-800">
                All items are Non-GST / Trading — issues a separate Cash Memo (NG-...) excluded from GST filings.
              </p>
            )}
            {cartTaxStatus.hasMixedTax && (
              <p className="mt-1.5 text-[11px] font-medium text-amber-800">
                Mixed cart: checkout will auto-split into 1 GST Invoice ({billingSettings?.invoicePrefix || 'INV'}-...) + 1 Non-GST Cash Memo (NG-...).
              </p>
            )}
          </div>
        </section>
      ) : (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-xs space-y-4">
        {/* Route / Beat Filter on Sale Page */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 border-b border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
            <Truck size={13} className="text-indigo-600 shrink-0" />
            <span>Route / Beat:</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedBeatFilter('all')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
              selectedBeatFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            All Beats
          </button>
          {activeBeats.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBeatFilter(b.name)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                selectedBeatFilter.toLowerCase() === b.name.toLowerCase()
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* 1. CUSTOMER (Smart Responsive Predictive Search) */}
          <CustomerPredictiveSearch
            id="select-customer"
            label="CUSTOMER"
            placeholder={
              selectedBeatFilter !== 'all'
                ? `Search customers in Beat "${selectedBeatFilter}"...`
                : 'Search by name, mobile, customer ID, or email...'
            }
            selectedCustomerId={selectedCustomerId}
            selectedCustomerName={customerName}
            selectedCustomerPhone={customerPhone}
            customers={filteredCustomersForPredictive}
            existingCustomers={filteredExistingCustomersForPredictive}
            onSelectCustomer={(c) => {
              setSelectedCustomerId(c.id);
              setCustomerName(c.name);
              setCustomerPhone(c.phone || '');
              setCustomerGstin(c.gstin || '');
              loadCustomPricesForCustomer(c.name);
              checkAndPromptProducts(c.name, stockSource);
            }}
            onSelectSpotSale={() => {
              setSelectedCustomerId('__walkin__');
              setCustomerName('Apt / Walk-in sale');
              setCustomerPhone('');
              setCustomerGstin('');
              loadCustomPricesForCustomer('Apt / Walk-in sale');
              checkAndPromptProducts('Apt / Walk-in sale', stockSource);
            }}
            onOpenCreateCustomer={(prefill) => {
              setNewCustName(prefill.name || '');
              setNewCustPhone(prefill.phone || '');
              setNewCustGstin(prefill.gstin || '');
              setNewCustBeat(selectedBeatFilter !== 'all' ? selectedBeatFilter : '');
              setNewCustPrefilled({});
              setShowNewCustomerModal(true);
            }}
          />

          {/* 2. BILL TYPE */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              BILL TYPE
            </label>
            <div className="relative">
              <select
                id="select-bill-type"
                value={billType}
                onChange={(e) => setBillType(e.target.value as any)}
                className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 pr-10 cursor-pointer"
              >
                <option value="tax_invoice" disabled={compositionLocked || cartTaxStatus.allNonGst}>
                  Tax invoice (GST inclusive)
                  {compositionLocked
                    ? ' - not allowed for composition'
                    : cartTaxStatus.allNonGst
                      ? ' - disabled (all items Non-GST)'
                      : ''}
                </option>
                <option value="bill_of_supply">Bill of supply (non-GST)</option>
                <option value="estimate">Estimate / quotation</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {compositionLocked && (
              <p className="mt-1.5 text-[11px] text-slate-500">
                Composition taxpayer: a Bill of Supply is issued and no GST is charged to the customer.
              </p>
            )}
            {cartTaxStatus.allNonGst && (
              <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                All items are Non-GST / Trading — issues a separate Cash Memo (NG-...) excluded from GST filings.
              </p>
            )}
            {cartTaxStatus.hasMixedTax && (
              <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                Mixed cart: checkout will auto-split into 1 GST Invoice ({billingSettings?.invoicePrefix || 'INV'}-...) + 1 Non-GST Cash Memo (NG-...).
              </p>
            )}
          </div>

          {/* 2b. CUSTOMER PHONE (Editable inline for SMS/WhatsApp & records) */}
          <div>
            <label htmlFor="newsale-desktop-phone" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              CUSTOMER PHONE (OPTIONAL)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="newsale-desktop-phone"
                type="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="10-digit WhatsApp / mobile"
                className={`w-full pl-9 pr-3 py-2.5 rounded-xl border bg-white text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 ${
                  customerPhoneError
                    ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                    : 'border-slate-200 focus:border-emerald-700 focus:ring-emerald-700/20'
                }`}
              />
            </div>
            {customerPhoneError && (
              <p className="mt-1 text-[11px] font-medium text-rose-600">{customerPhoneError}</p>
            )}
          </div>

          {/* 3. STOCK FROM (Godowns & Delivery Vans / Van Trip Stock) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                STOCK FROM
              </label>
              {stockSource.startsWith('trip_') && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                  Van Trip Stock
                </span>
              )}
            </div>
            <div className="relative">
              <select
                id="select-stock-from"
                value={stockSource}
                onChange={(e) => handleStockSourceChange(e.target.value)}
                className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 pr-10 cursor-pointer"
              >
                <optgroup label="🏢 Godowns & Warehouses">
                  {warehouses.map((w, idx) => (
                    <option key={w.id || `wh_${idx}`} value={w.id}>
                      {w.name} ({w.code || 'Godown'})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="🚚 Active Delivery Vans / Trips">
                  {activeTripsForUser.length > 0 ? (
                    activeTripsForUser.map((t, idx) => {
                      const loadedCount = Object.values(t.loaded || {}).reduce((a, b) => a + (Number(b) || 0), 0);
                      return (
                        <option key={t.id !== undefined ? `trip_${t.id}` : `trip_idx_${idx}`} value={`trip_${t.id}`}>
                          {t.vehicle} (Trip #{t.id}{t.salesman ? ` · ${t.salesman}` : ''}) — {loadedCount} cs loaded
                        </option>
                      );
                    })
                  ) : (
                    <option value="" disabled>
                      (No active van trips out on route)
                    </option>
                  )}
                  <option value="__new_van_trip__">+ Dispatch / Add New Van Trip...</option>
                </optgroup>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {stockSource.startsWith('trip_') && (
              <p className="text-[11px] text-emerald-700 font-medium mt-1 truncate">
                Sourcing inventory from {selectedStockLabel}
              </p>
            )}
          </div>

            {/* 4. DATE */}
            <div>
              <label htmlFor="newsale-date-input" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                DATE
              </label>
              <div className="relative">
                <input
                  id="newsale-date-input"
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 cursor-pointer shadow-2xs"
                />
              </div>
            </div>
          </div>
        </div>
      )}

        {/* Button to Open "Select Beverages & Crates" Screen */}
        <button
          type="button"
          id="btn-add-product"
          onClick={() => setShowProductSelector(true)}
          className={`w-full flex items-center justify-between px-4 min-h-[52px] rounded-full font-bold text-[14.5px] transition-all cursor-pointer group ${
            isPhone
              ? 'hh-order-select-cta'
              : isCompact
                ? 'bg-gradient-to-r from-[#19A84B] to-[#0D8A38] hover:from-[#159642] hover:to-[#0A752E] text-white shadow-sm'
                : 'bg-gradient-to-r from-emerald-50/70 via-white to-slate-50 hover:from-emerald-100/70 hover:to-emerald-50/30 rounded-2xl border-2 border-emerald-600/30 hover:border-emerald-600 shadow-2xs text-slate-800 py-3.5'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <span
              className={`size-7 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                isPhone
                  ? 'bg-white/20 text-white'
                  : isCompact
                    ? 'bg-white text-[#0D8A38]'
                    : 'bg-emerald-700 text-white rounded-lg'
              }`}
            >
              <Plus className="w-4 h-4 stroke-[3]" />
            </span>
            <span>Select Beverages &amp; Crates</span>
          </span>
          <ChevronRight
            className={`w-4 h-4 shrink-0 ${isCompact ? 'text-white/90' : 'text-slate-400 group-hover:text-emerald-700'}`}
          />
        </button>

        {isPhone && totalCartQty > 0 && (
          <button
            type="button"
            id="btn-floating-cart"
            onClick={() => setShowCartReview(true)}
            className="rt-btn w-full justify-between"
          >
            <span className="tabular-nums">
              {t('sell.itemsCount', { n: totalCartQty })} · {inr(grandTotal)}
            </span>
            <span>{t('sell.checkout')} →</span>
          </button>
        )}

      {/* STEP 2 — Beverage Catalog (phone restyled sheet on <768px; 8/4 split modal on tablet+) */}
      {showProductSelector && (isPhone ? (() => {
        const isWalkIn = selectedCustomerId === '__walkin__';
        const activeFilterCount =
          (selectedPackFilter !== 'all' ? 1 : 0) +
          (selectedSize !== 'all' ? 1 : 0) +
          (schemesOnly ? 1 : 0) +
          (inCartOnly ? 1 : 0);
        const packChoices: { id: 'all' | 'pet' | 'can' | 'glass' | 'tetra'; label: string; shortLabel: string }[] = [
          { id: 'all', label: 'All packs', shortLabel: 'All' },
          { id: 'pet', label: 'PET Bottle', shortLabel: 'PET' },
          { id: 'can', label: 'Can / Tin', shortLabel: 'Can' },
          { id: 'glass', label: 'Glass RGB', shortLabel: 'Glass' },
          { id: 'tetra', label: 'Tetra / Pouch', shortLabel: 'Tetra' },
        ];
        const activePackShort = packChoices.find((pk) => pk.id === selectedPackFilter)?.shortLabel;
        const activeSizeLabel =
          selectedSize === 'soda'
            ? t('sell.sizeSoda') || 'Soda'
            : sizeOptions.find((sz) => sz.id === selectedSize)?.label;
        const orderedPhoneProducts = categorySections.flatMap((s) => s.items);

        const toggleSchemesOnly = () => {
          setSchemesOnly((prev) => {
            const next = !prev;
            if (next && selectedCategory !== 'all') {
              const catHasScheme = baseFilteredProducts.some(
                (p) => (p.category || 'other') === selectedCategory && hasActiveSchemeForProduct(p),
              );
              if (!catHasScheme) setSelectedCategory('all');
            }
            return next;
          });
        };

        const toggleInCartOnly = () => {
          setInCartOnly((prev) => {
            const next = !prev;
            if (next && selectedCategory !== 'all') {
              const catHasCart = baseFilteredProducts.some(
                (p) => (p.category || 'other') === selectedCategory && (selectedItems[p.id] || 0) > 0,
              );
              if (!catHasCart) setSelectedCategory('all');
            }
            return next;
          });
        };

        return (
          <div
            data-esc-close
            role="dialog"
            aria-modal="true"
            aria-label="Beverage Catalog"
            className="rt-sale-sheet"
          >
            {/* 1. Header (--primary): back + customer/walk-in, right = due/no-customer tag, 4-bar progress, search */}
            <header className="rt-sale-header">
              <div className="rt-sale-header__row">
                <button
                  type="button"
                  onClick={goBackToStep1}
                  aria-label="Back to customer selection"
                  className="rt-sale-header__back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="rt-sale-header__title">
                  {isWalkIn ? t('sell.walkInSale') : (customerName || t('sell.walkInSale'))}
                </h2>
                <div className="rt-sale-header__right">
                  {isWalkIn ? (
                    <span className="rt-tag rt-tag--ghost">{t('sell.noCustomer')}</span>
                  ) : (
                    <span className={`rt-tag ${creditInfo.due > 0.004 ? 'rt-tag--soon' : 'rt-tag--paid'}`}>
                      {creditInfo.due > 0.004 ? `${t('sell.currentDue')} ${inr(creditInfo.due)}` : t('sell.paid')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={requestCancelSale}
                    aria-label={t('salesman.cancelSale')}
                    className="rt-sale-header__cancel"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('common.cancel')}</span>
                  </button>
                </div>
              </div>

              <div className="rt-seg" aria-hidden="true">
                <span className="rt-seg__bar rt-seg__bar--on" />
                <span className="rt-seg__bar rt-seg__bar--on" />
                <span className="rt-seg__bar" />
                <span className="rt-seg__bar" />
              </div>
              <p className="rt-stp">{t('sell.step2PickProducts')}</p>

              <div ref={catalogFilterRef} className="relative">
                <div className="rt-sale-search">
                  <Search className="w-4 h-4 rt-sale-search__icon" />
                  <input
                    type="text"
                    enterKeyHint="search"
                    placeholder={t('sell.searchProducts')}
                    aria-label={t('sell.searchProducts')}
                    value={beverageSearch}
                    onChange={(e) => setBeverageSearch(e.target.value)}
                    className="rt-sale-search__input"
                  />
                  {beverageSearch && (
                    <button
                      type="button"
                      onClick={() => setBeverageSearch('')}
                      aria-label="Clear search"
                      className="rt-sale-search__btn"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCatalogFilterOpen((v) => !v)}
                    aria-label="Filter beverages"
                    aria-expanded={catalogFilterOpen}
                    className={`rt-sale-search__btn ${activeFilterCount > 0 || catalogFilterOpen ? 'rt-sale-search__btn--active' : ''}`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    {activeFilterCount > 0 && (
                      <span className="rt-sale-search__badge">{activeFilterCount}</span>
                    )}
                  </button>
                </div>

                {catalogFilterOpen && (
                  <div
                    role="dialog"
                    aria-label="Beverage filters"
                    className="rt-card absolute left-0 right-0 top-full mt-2 z-50 space-y-3 max-h-[60vh] overflow-y-auto"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold text-[var(--text-2)]">
                        {t('sell.sizeFilter')}
                      </span>
                      <div className="flex items-center gap-2">
                        {activeFilterCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPackFilter('all');
                              setSelectedSize('all');
                              setSchemesOnly(false);
                              setInCartOnly(false);
                            }}
                            className="text-xs font-bold text-[var(--primary)] cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setCatalogFilterOpen(false)}
                          className="rt-tag cursor-pointer"
                        >
                          {t('sell.done')}
                        </button>
                      </div>
                    </div>

                    {(schemeMatchCount > 0 || schemesOnly || cartMatchCount > 0 || inCartOnly) && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-[var(--text-2)]">Quick Filters</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(schemeMatchCount > 0 || schemesOnly) && (
                            <button
                              type="button"
                              aria-pressed={schemesOnly}
                              onClick={toggleSchemesOnly}
                              className="rt-chip rt-chip--offer"
                            >
                              <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Offers</span>
                              <span className="rt-chip__count">{schemeMatchCount}</span>
                            </button>
                          )}
                          {(cartMatchCount > 0 || inCartOnly) && (
                            <button
                              type="button"
                              aria-pressed={inCartOnly}
                              onClick={toggleInCartOnly}
                              className="rt-chip"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>In cart</span>
                              <span className="rt-chip__count">{cartMatchCount}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className={`space-y-1.5 ${(schemeMatchCount > 0 || cartMatchCount > 0) ? 'pt-2 border-t border-[var(--border)]' : ''}`}>
                      <div className="text-[11px] font-semibold text-[var(--text-2)]">Pack Type</div>
                      <div className="flex flex-wrap gap-1.5">
                        {packChoices.map((pk) => (
                          <button
                            key={pk.id}
                            type="button"
                            aria-pressed={selectedPackFilter === pk.id}
                            onClick={() => setSelectedPackFilter(pk.id)}
                            className="rt-chip"
                          >
                            {pk.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                      <div className="text-[11px] font-semibold text-[var(--text-2)]">Size</div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { id: 'all', label: t('sell.sizeAll') || 'All' },
                          ...sizeOptions,
                          { id: 'soda', label: t('sell.sizeSoda') || 'Soda' },
                        ].map((sz) => (
                          <button
                            key={sz.id}
                            type="button"
                            aria-pressed={selectedSize === sz.id}
                            onClick={() => setSelectedSize(sz.id)}
                            className="rt-chip"
                          >
                            {sz.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </header>

            {/* 2. Smart filter chips row (All, active pack/size tags, Offers, In cart, crisp short categories) */}
            <div className="rt-chips" role="group" aria-label="Product filters">
              <button
                type="button"
                aria-pressed={selectedCategory === 'all' && !schemesOnly && !inCartOnly}
                onClick={() => {
                  setSelectedCategory('all');
                  setSchemesOnly(false);
                  setInCartOnly(false);
                }}
                className="rt-chip"
              >
                <span>{t('sell.categoryAll')}</span>
                <span className="rt-chip__count">{baseFilteredProducts.length}</span>
              </button>

              {activePackShort && (
                <button
                  type="button"
                  aria-pressed="true"
                  onClick={() => setSelectedPackFilter('all')}
                  aria-label={`Remove ${activePackShort} pack filter`}
                  className="rt-chip"
                >
                  <span>{activePackShort}</span>
                  <X className="w-3.5 h-3.5 opacity-80" aria-hidden="true" />
                </button>
              )}

              {activeSizeLabel && (
                <button
                  type="button"
                  aria-pressed="true"
                  onClick={() => setSelectedSize('all')}
                  aria-label={`Remove ${activeSizeLabel} size filter`}
                  className="rt-chip"
                >
                  <span>{activeSizeLabel}</span>
                  <X className="w-3.5 h-3.5 opacity-80" aria-hidden="true" />
                </button>
              )}

              {(schemeMatchCount > 0 || schemesOnly) && (
                <button
                  type="button"
                  aria-pressed={schemesOnly}
                  onClick={toggleSchemesOnly}
                  className="rt-chip rt-chip--offer"
                >
                  <Tag className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Offers</span>
                  <span className="rt-chip__count">{schemeMatchCount}</span>
                </button>
              )}

              {(cartMatchCount > 0 || inCartOnly) && (
                <button
                  type="button"
                  aria-pressed={inCartOnly}
                  onClick={toggleInCartOnly}
                  className="rt-chip"
                >
                  <ShoppingCart className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>In cart</span>
                  <span className="rt-chip__count">{cartMatchCount}</span>
                </button>
              )}

              {categories
                .filter((cat) => cat !== 'all')
                .map((cat, idx) => {
                  const count = categoryCounts.get(cat) || 0;
                  if (count === 0 && selectedCategory !== cat) return null;
                  const label = shortCategoryLabel(cat);
                  return (
                    <button
                      key={cat || `cat_${idx}`}
                      type="button"
                      aria-pressed={selectedCategory === cat}
                      onClick={() =>
                        setSelectedCategory((prev) => (prev === cat ? 'all' : cat))
                      }
                      className="rt-chip"
                    >
                      <span>{label}</span>
                      <span className="rt-chip__count">{count}</span>
                    </button>
                  );
                })}
            </div>

            {/* 3 & 4. Scrollable product grid + Walk-in notice + Offer banner */}
            <div className="rt-sale-body">
              {isWalkIn && (
                <div className="rt-noti" role="status">
                  <Zap className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{t('sell.walkInNotice')}</span>
                </div>
              )}

              {(totalDiscount > 0 || totalFreeQty > 0) && (
                <div className="rt-offer-banner" role="status">
                  <Tag className="w-4 h-4 shrink-0" />
                  <span className="rt-offer-banner__text">
                    {t('sell.offerApplied')}
                    {totalDiscount > 0 ? ` · −${inr(totalDiscount)}` : ''}
                    {totalFreeQty > 0 ? ` · +${t('sell.freeCases', { n: totalFreeQty })}` : ''}
                  </span>
                  <span className="rt-tag rt-tag--soon shrink-0">{t('sell.applied')}</span>
                </div>
              )}

              {orderedPhoneProducts.length === 0 ? (
                <div className="rt-card text-center space-y-3 py-8">
                  <Package className="w-8 h-8 mx-auto text-[var(--text-2)]" />
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {inStockCount === 0
                      ? `No beverages with stock available in ${selectedStockLabel}`
                      : `No beverages match your filters in ${selectedStockLabel}`}
                  </p>
                  {(selectedCategory !== 'all' || selectedPackFilter !== 'all' || selectedSize !== 'all' || schemesOnly || inCartOnly || beverageSearch.trim() !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('all');
                        setSelectedPackFilter('all');
                        setSelectedSize('all');
                        setSchemesOnly(false);
                        setInCartOnly(false);
                        setBeverageSearch('');
                      }}
                      className="rt-btn-outline"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="rt-prod-grid">
                  {orderedPhoneProducts.map((prod, idx) => {
                    const available = getProductStock(prod.id);
                    const inCartQty = selectedItems[prod.id] || 0;
                    const defaultRate = getProductDefaultPrice(prod);
                    const customRate = customRates[prod.id];
                    const currentRate = customRate !== undefined ? customRate : defaultRate;
                    const sTheme = sizeTheme(prod.volume, prod.name);
                    const pTheme = packTheme(prod.pack, prod.name);

                    const userChoice = customSchemes[prod.id];
                    let activePromo: Promotion | null = null;
                    if (userChoice !== undefined) {
                      activePromo = userChoice;
                    } else if (schemeMode === 'none' || billingSettings?.schemesEnabled === false || billingSettings?.autoApplyPromotions === false) {
                      activePromo = null;
                    } else {
                      activePromo = activePromoFor ? activePromoFor(prod.id) : null;
                    }
                    const promoLabel = activePromo ? schemeLabel(activePromo, products) : null;
                    const isOos = available <= 0;
                    const packParts = [
                      prod.unitsPerCrate ? t('sell.packInfo', { pcs: prod.unitsPerCrate }) : (sTheme.label || pTheme.label),
                      isOos ? t('sell.outOfStock') : t('sell.leftCount', { n: available }),
                    ].filter(Boolean);

                    return (
                      <div
                        key={prod.id !== undefined ? `prod_${prod.id}` : `prod_idx_${idx}`}
                        className={`rt-card rt-prod-card ${inCartQty > 0 ? 'rt-prod-card--in-cart' : ''} ${isOos ? 'rt-prod-card--oos' : ''}`}
                      >
                        <div className="rt-prod-media">
                          {promoLabel && (
                            <span className="rt-prod-scheme" title={promoLabel}>
                              {t('sell.scheme')}
                            </span>
                          )}
                          <ProductCardMedia product={prod} />
                        </div>

                        <div className="rt-prod-info">
                          <h3 className="rt-prod-name">
                            {prod.name}
                            {isOdia && prod.nameOr ? (
                              <span className="block text-[11px] font-semibold font-odia text-[var(--text-2)] mt-0.5">
                                {prod.nameOr}
                              </span>
                            ) : null}
                          </h3>
                          {packParts.length > 0 && (
                            <p className="rt-prod-pack">{packParts.join(' · ')}</p>
                          )}
                          <p className="rt-prod-price">
                            {currentRate === 0 ? '₹0' : `₹${currentRate.toLocaleString('en-IN')}`}
                          </p>
                        </div>

                        {isOos && inCartQty === 0 ? (
                          <button type="button" disabled className="rt-prod-oos">
                            {t('sell.unavailable')}
                          </button>
                        ) : inCartQty === 0 ? (
                          <button
                            type="button"
                            id={`btn-add-beverage-${prod.id}`}
                            onClick={() => setItemQty(prod.id, 1)}
                            className="rt-prod-add"
                          >
                            <Plus className="w-4 h-4" />
                            <span>{t('sell.add')}</span>
                          </button>
                        ) : (
                          <div className="rt-prod-stepper">
                            <button
                              type="button"
                              onClick={() => setItemQty(prod.id, inCartQty - 1)}
                              aria-label={`Decrease ${prod.name}`}
                              className="rt-prod-stepper__btn"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openQuickEntry(prod)}
                              title="Tap to edit qty, rate or scheme"
                              className="rt-prod-stepper__qty"
                            >
                              {inCartQty}
                            </button>
                            <button
                              type="button"
                              onClick={() => setItemQty(prod.id, inCartQty + 1)}
                              aria-label={`Increase ${prod.name}`}
                              className="rt-prod-stepper__btn"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 5. Sticky cart bar 12px above bottom nav (hide when empty) */}
            {totalCartQty > 0 && (
              <div className="rt-cartbar" role="region" aria-label={t('sell.yourBill')}>
                <div className="rt-cartbar__info">
                  <span className="rt-cartbar__count">
                    {totalCartQty === 1 ? t('sell.caseSingle') : t('sell.casesCount', { n: totalCartQty })}
                    {totalFreeQty > 0 ? ` · +${totalFreeQty}` : ''}
                  </span>
                  <span className="rt-cartbar__total">{inr(grandTotal)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneReviewStage('cart');
                    setShowProductSelector(false);
                    setShowCartReview(true);
                  }}
                  className="rt-cartbar__cta"
                >
                  <span>{isWalkIn ? t('sell.reviewOrder') : t('sell.viewCart')}</span>
                </button>
              </div>
            )}
          </div>
        );
      })() : (
        <div
          data-esc-close
          role="dialog"
          aria-modal="true"
          aria-label="Beverage Catalog"
          className="fixed inset-0 z-50 bg-[#F8F9FA] flex flex-col"
        >
          {/* Header */}
          <header className="bg-[#0A1F44] text-white px-3 py-2.5 flex items-center gap-3 shrink-0 pt-[max(0.625rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={() => setShowProductSelector(false)}
              aria-label="Close beverage catalog"
              className="size-11 shrink-0 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="min-w-0 flex-1 text-[17px] sm:text-lg font-extrabold text-white leading-none truncate">
              Beverage Catalog
            </h2>
            <button
              type="button"
              onClick={requestCancelSale}
              className="min-h-[44px] px-3 rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
              title="Cancel order & select a new customer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('salesman.cancelSale')}</span>
            </button>
          </header>

          {/* Sticky customer context strip */}
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 shrink-0">
            <p className="text-sm font-semibold text-[#0A1F44] min-w-0 break-words">
              {customerName || 'Walk-in sale'} •{' '}
              <span className="font-medium text-gray-600">
                Available Credit:{' '}
                {creditInfo.available === null ? 'No limit' : inr(creditInfo.available)}
              </span>
            </p>
            <span
              className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap ${
                saleSource === 'trip' ? 'bg-[#ECFDF5] text-[#1B8A5A]' : 'bg-slate-100 text-slate-600'
              }`}
              title={selectedStockLabel}
            >
              {saleSource === 'trip' ? 'Van Stock' : 'Warehouse Stock'}
            </span>
          </div>

          {/* Search + unified Filter icon dropdown */}
          <div className="bg-[#F8F9FA] border-b border-gray-200 px-3 md:px-4 py-2.5 shrink-0">
            {(() => {
              const activeFilterCount =
                (selectedCategory !== 'all' ? 1 : 0) +
                (selectedPackFilter !== 'all' ? 1 : 0) +
                (selectedSize !== 'all' ? 1 : 0);

              const renderCategoryIcon = (cat: string, isActive: boolean) => {
                const cls = `w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#1B8A5A]'}`;
                switch (cat) {
                  case 'all':
                    return <LayoutGrid className={cls} />;
                  case 'energy':
                    return <Zap className={cls} />;
                  case 'vibe':
                    return <CupSoda className={cls} />;
                  case 'joos':
                    return <Citrus className={cls} />;
                  case 'water':
                    return <Droplets className={cls} />;
                  default:
                    return <Package className={cls} />;
                }
              };

              const packChoices: { id: 'all' | 'pet' | 'can' | 'glass' | 'tetra'; label: string }[] = [
                { id: 'all', label: 'All packs' },
                { id: 'pet', label: 'PET Bottle' },
                { id: 'can', label: 'Can / Tin' },
                { id: 'glass', label: 'Glass RGB' },
                { id: 'tetra', label: 'Tetra / Pouch' },
              ];

              return (
                <div ref={catalogFilterRef} className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    enterKeyHint="search"
                    placeholder="Search name, size or pack"
                    value={beverageSearch}
                    onChange={(e) => setBeverageSearch(e.target.value)}
                    className={`w-full min-h-[44px] pl-10 rounded-xl border border-gray-300 bg-white text-base text-[#0A1F44] focus:outline-none focus:border-[#1B8A5A] focus:ring-2 focus:ring-[#1B8A5A]/20 ${
                      beverageSearch ? 'pr-24' : 'pr-14'
                    }`}
                  />
                  {beverageSearch && (
                    <button
                      type="button"
                      onClick={() => setBeverageSearch('')}
                      aria-label="Clear search"
                      className="absolute right-12 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-gray-400 hover:text-gray-700 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  {/* Unified Filter Icon Button */}
                  <button
                    type="button"
                    onClick={() => setCatalogFilterOpen((v) => !v)}
                    aria-label="Filter beverages"
                    aria-expanded={catalogFilterOpen}
                    title="Filter category, pack & size"
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] px-2 rounded-lg inline-flex items-center justify-center gap-1 text-xs font-bold transition-colors cursor-pointer ${
                      activeFilterCount > 0 || catalogFilterOpen
                        ? 'bg-[#1B8A5A] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4 shrink-0" />
                    {activeFilterCount > 0 && (
                      <span className="tabular-nums text-[11px] font-extrabold leading-none">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {/* Unified Filter Dropdown */}
                  {catalogFilterOpen && (
                    <div
                      role="dialog"
                      aria-label="Beverage filters"
                      className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border border-[#DCE5F2] bg-white shadow-xl p-3 space-y-3 max-h-[70vh] overflow-y-auto"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Filter catalog
                        </span>
                        <div className="flex items-center gap-2">
                          {activeFilterCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategory('all');
                                setSelectedPackFilter('all');
                                setSelectedSize('all');
                              }}
                              className="text-xs font-bold text-[#1B8A5A] hover:underline cursor-pointer"
                            >
                              Reset to All
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setCatalogFilterOpen(false)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      </div>

                      {/* Category with icons (default: All) */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-500">Category</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {categories.map((cat, idx) => {
                            const count = cat === 'all' ? baseFilteredProducts.length : categoryCounts.get(cat) || 0;
                            if (cat !== 'all' && count === 0 && selectedCategory !== cat) return null;
                            const label =
                              cat === 'all'
                                ? 'All'
                                : (CATS as Record<string, { name: string }>)[cat]?.name || cat;
                            const active = selectedCategory === cat;
                            return (
                              <button
                                key={cat || `cat_${idx}`}
                                type="button"
                                onClick={() => setSelectedCategory(cat)}
                                className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-1.5 cursor-pointer transition-colors border ${
                                  active
                                    ? 'bg-[#1B8A5A] border-[#1B8A5A] text-white shadow-xs'
                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <span className="flex items-center gap-1.5 min-w-0">
                                  {renderCategoryIcon(cat, active)}
                                  <span className="truncate">{label}</span>
                                </span>
                                <span
                                  className={`text-[11px] font-bold tabular-nums shrink-0 ${
                                    active ? 'text-white/85' : 'text-slate-400'
                                  }`}
                                >
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Pack Type (default: All packs) */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <div className="text-[11px] font-bold text-slate-500">Pack Type</div>
                        <div className="flex flex-wrap gap-1.5">
                          {packChoices.map((pk) => {
                            const active = selectedPackFilter === pk.id;
                            return (
                              <button
                                key={pk.id}
                                type="button"
                                onClick={() => setSelectedPackFilter(pk.id)}
                                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors border ${
                                  active
                                    ? 'bg-[#1B8A5A] border-[#1B8A5A] text-white'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {pk.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Size (default: All) */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <div className="text-[11px] font-bold text-slate-500">Size</div>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { id: 'all', label: t('sell.sizeAll') || 'All' },
                            ...sizeOptions,
                            { id: 'soda', label: t('sell.sizeSoda') || 'Soda' },
                          ].map((sz) => {
                            const active = selectedSize === sz.id;
                            return (
                              <button
                                key={sz.id}
                                type="button"
                                onClick={() => setSelectedSize(sz.id)}
                                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors border ${
                                  active
                                    ? 'bg-[#1B8A5A] border-[#1B8A5A] text-white'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {sz.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Body: product list (+ live mini-cart on tablets) */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-3 md:px-4 pt-3 pb-28 md:pb-6 md:grid md:grid-cols-12 md:gap-6">
              <div className="md:col-span-8 min-w-0 space-y-4">
                {(selectedCategory !== 'all' || selectedPackFilter !== 'all' || selectedSize !== 'all' || beverageSearch.trim() !== '') && (
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-gray-500">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="tabular-nums font-medium">
                        Showing {filteredProducts.length} beverage{filteredProducts.length === 1 ? '' : 's'}
                      </span>
                      {selectedCategory !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#1B8A5A] font-semibold">
                          {(CATS as Record<string, { name: string }>)[selectedCategory]?.name || selectedCategory}
                          <button
                            type="button"
                            onClick={() => setSelectedCategory('all')}
                            aria-label="Clear category filter"
                            className="cursor-pointer hover:text-[#0A1F44]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                      {selectedPackFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#1B8A5A] font-semibold uppercase">
                          {selectedPackFilter}
                          <button
                            type="button"
                            onClick={() => setSelectedPackFilter('all')}
                            aria-label="Clear pack filter"
                            className="cursor-pointer hover:text-[#0A1F44]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                      {selectedSize !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#1B8A5A] font-semibold">
                          {sizeOptions.find((s) => s.id === selectedSize)?.label || selectedSize}
                          <button
                            type="button"
                            onClick={() => setSelectedSize('all')}
                            aria-label="Clear size filter"
                            className="cursor-pointer hover:text-[#0A1F44]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('all');
                        setSelectedPackFilter('all');
                        setSelectedSize('all');
                        setBeverageSearch('');
                      }}
                      className="font-semibold text-[#1B8A5A] hover:underline cursor-pointer px-1.5 py-1"
                    >
                      Clear filters
                    </button>
                  </div>
                )}

                {filteredProducts.length === 0 ? (
                  <div data-card-tone="neutral" className="rounded-2xl border p-6 text-center space-y-3">
                    <Package className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="text-sm font-semibold text-[#0A1F44]">
                      {inStockCount === 0
                        ? `No beverages with stock available in ${selectedStockLabel}`
                        : `No beverages match your filters in ${selectedStockLabel}`}
                    </p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      {(selectedCategory !== 'all' || selectedPackFilter !== 'all' || selectedSize !== 'all' || beverageSearch.trim() !== '') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategory('all');
                            setSelectedPackFilter('all');
                            setSelectedSize('all');
                            setBeverageSearch('');
                          }}
                          className="min-h-[44px] px-4 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-[#0A1F44] hover:bg-gray-50 cursor-pointer"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  categorySections.map((section) => (
                    <section key={section.key} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600">{section.label}</h4>
                        <span className="text-[11px] font-semibold text-gray-400 tabular-nums">
                          {section.items.length} SKU{section.items.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {section.items.map((prod, idx) => {
                          const available = getProductStock(prod.id);
                          const inCartQty = selectedItems[prod.id] || 0;
                          const defaultRate = getProductDefaultPrice(prod);
                          const customRate = customRates[prod.id];
                          const currentRate = customRate !== undefined ? customRate : defaultRate;
                          const isCustom = customRate !== undefined && customRate !== defaultRate;

                          const sTheme = sizeTheme(prod.volume, prod.name);
                          const pTheme = packTheme(prod.pack, prod.name);

                          const userChoice = customSchemes[prod.id];
                          let activePromo: Promotion | null = null;
                          if (userChoice !== undefined) {
                            activePromo = userChoice;
                          } else if (schemeMode === 'none' || billingSettings?.schemesEnabled === false || billingSettings?.autoApplyPromotions === false) {
                            activePromo = null;
                          } else {
                            activePromo = activePromoFor ? activePromoFor(prod.id) : null;
                          }
                          const promoLabel = activePromo ? schemeLabel(activePromo, products) : null;

                          const cartLine = lineItems.find((li) => li.productId === prod.id);
                          const comp = cartLine || (inCartQty > 0 ? computeLine(prod, 'Retail', inCartQty, activePromo, currentRate, 0) : null);
                          const itemGross = cartLine ? cartLine.gross : comp ? comp.gross : inCartQty * currentRate;

                          const stockBadge =
                            available <= 0
                              ? { text: 'Out of Stock', cls: 'bg-red-100 text-red-700' }
                              : available <= lowStockLimit
                                ? { text: 'Low Stock', cls: 'bg-amber-100 text-amber-800' }
                                : { text: 'In Stock', cls: 'bg-[#ECFDF5] text-[#1B8A5A]' };

                          const cardTone =
                            inCartQty > 0
                              ? 'received'
                              : available <= 0
                                ? 'due'
                                : available <= lowStockLimit
                                  ? 'warning'
                                  : 'sales';

                          return (
                            <div
                              key={prod.id !== undefined ? `prod_${prod.id}` : `prod_idx_${idx}`}
                              data-card-tone={cardTone}
                              className={`rounded-2xl border p-3.5 shadow-xs flex flex-col gap-3 transition-all ${
                                inCartQty > 0 ? 'ring-2 ring-emerald-500/40 shadow-sm' : ''
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <PackIcon pack={prod.pack} name={prod.name} className="mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-[#0A1F44] text-sm leading-snug break-words">
                                    {prod.name}
                                    {(nameCounts.get(prod.name.trim().toLowerCase()) || 0) > 1 && (
                                      <span className="ml-1.5 text-[10px] font-semibold text-amber-800">(Check size/pack)</span>
                                    )}
                                  </p>
                                  <p className="mt-0.5 text-xs text-gray-600 tabular-nums">
                                    {sTheme.label && (
                                      <span className="font-semibold" style={{ color: sTheme.hex }}>{sTheme.label}</span>
                                    )}
                                    {pTheme.label && (
                                      <span className={`font-semibold ${packTextColor(prod.pack, prod.name)}`}>
                                        {sTheme.label ? ' · ' : ''}{pTheme.label}
                                      </span>
                                    )}
                                    {prod.unitsPerCrate ? <span> · {prod.unitsPerCrate} pcs</span> : null}
                                  </p>
                                  <p className="mt-1 text-sm font-bold tabular-nums text-[#0A1F44]">
                                    {currentRate === 0 ? '₹0 Free' : `₹${currentRate.toLocaleString('en-IN')} / case`}
                                    {isCustom && currentRate > 0 && (
                                      <span className="ml-1.5 text-[11px] font-semibold text-amber-700">Custom</span>
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stockBadge.cls}`}>
                                  {stockBadge.text} · {available}
                                </span>
                                {prod.taxability === 'non_gst' && (
                                  <span className="bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                                    Non-GST · 0%
                                  </span>
                                )}
                                {promoLabel && (
                                  <span className="bg-emerald-100 text-emerald-800 text-xs font-medium px-2 py-0.5 rounded-full max-w-full truncate">
                                    {promoLabel}
                                  </span>
                                )}
                              </div>

                              {inCartQty === 0 ? (
                                <button
                                  type="button"
                                  id={`btn-add-beverage-${prod.id}`}
                                  onClick={() => setItemQty(prod.id, 1)}
                                  className="w-full min-h-[44px] rounded-xl border border-[#1B8A5A] text-[#1B8A5A] hover:bg-[#ECFDF5] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Plus className="w-4 h-4" /> Add
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="inline-flex items-center rounded-xl border border-[#1B8A5A] overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={() => setItemQty(prod.id, inCartQty - 1)}
                                        aria-label={`Decrease ${prod.name}`}
                                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#1B8A5A] hover:bg-[#ECFDF5] cursor-pointer"
                                      >
                                        <Minus className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openQuickEntry(prod)}
                                        title="Tap to type an exact quantity"
                                        className="min-h-[44px] min-w-[44px] px-2 font-bold text-[#0A1F44] tabular-nums hover:bg-[#ECFDF5] cursor-pointer"
                                      >
                                        {inCartQty}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setItemQty(prod.id, inCartQty + 1)}
                                        aria-label={`Increase ${prod.name}`}
                                        className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-[#1B8A5A] text-white hover:bg-[#157048] cursor-pointer"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                    </div>
                                    <div className="text-right min-w-0">
                                      <p className="font-bold text-[#0A1F44] tabular-nums">{inr(itemGross)}</p>
                                      {comp && comp.freeQty > 0 && (
                                        <p className="text-[11px] font-semibold text-[#1B8A5A]">+{comp.freeQty} Free Case{comp.freeQty === 1 ? '' : 's'}</p>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => openQuickEntry(prod)}
                                    className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-[#F8F9FA] hover:bg-gray-100 text-sm font-semibold text-[#0A1F44] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <Gift className="w-4 h-4 text-[#1B8A5A]" /> Scheme / Custom Price
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>

              {/* Tablet: sticky live mini-cart */}
              <aside className="hidden md:block md:col-span-4 min-w-0" aria-label="Live cart">
                <div className="sticky top-0 bg-white rounded-xl border border-gray-200 p-5 max-h-[calc(100vh-14rem)] overflow-y-auto flex flex-col">
                  <h3 className="text-sm font-bold text-[#0A1F44]">Your Order</h3>
                  {lineItems.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-500">No items yet. Tap Add on a product.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-gray-100">
                      {lineItems.map((it) => (
                        <li key={String(it.key ?? it.productId)} className="flex items-start justify-between gap-2 py-2 text-sm">
                          <span className="min-w-0 break-words text-[#0A1F44]">
                            {it.productName} <span className="text-gray-500">× {it.qty}</span>
                          </span>
                          <span className="font-semibold tabular-nums text-[#0A1F44] shrink-0">{inr(it.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-sm text-gray-600">{totalCartQty} Cases{totalFreeQty > 0 ? ` (${totalFreeQty} free)` : ''}</span>
                    <span className="text-lg font-bold text-[#0A1F44] tabular-nums">{inr(grandTotal)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={totalCartQty === 0}
                    onClick={() => {
                      setShowProductSelector(false);
                      setShowCartReview(true);
                    }}
                    className="mt-4 w-full min-h-[48px] rounded-xl bg-[#1B8A5A] hover:bg-[#157048] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Proceed to Review →
                  </button>
                </div>
              </aside>
            </div>
          </div>

          {/* Mobile: floating cart bar */}
          {totalCartQty > 0 && (
            <div className="md:hidden fixed bottom-4 inset-x-4 bg-[#0A1F44] text-white rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3 mb-[env(safe-area-inset-bottom)]">
              <span className="font-semibold text-sm tabular-nums">
                {totalCartQty} Cases • {inr(grandTotal)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowProductSelector(false);
                  setShowCartReview(true);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-[#1B8A5A] hover:bg-[#157048] text-white text-sm font-semibold whitespace-nowrap cursor-pointer"
              >
                Review Order →
              </button>
            </div>
          )}
        </div>
      ))}

      {/* STEP 3 & STEP 4 — Cart & Schemes → Review & Checkout (phone restyled; desktop/tablet untouched) */}
      {showCartReview && (isPhone ? (() => {
        const isWalkIn = selectedCustomerId === '__walkin__';
        const activePhonePay: 'cash' | 'upi' | 'credit' =
          payChoice === 'credit' || (payChoice === 'partial' && (Number(paymentAmount) || 0) <= 0)
            ? 'credit'
            : paymentMode === 'upi'
              ? 'upi'
              : 'cash';

        if (phoneReviewStage === 'cart') {
          return (
            <div
              data-esc-close
              role="dialog"
              aria-modal="true"
              aria-label={t('sell.cart')}
              className="rt-sale-sheet"
            >
              <header className="rt-sale-header">
                <div className="rt-sale-header__row">
                  <button
                    type="button"
                    aria-label="Back to catalog"
                    onClick={() => {
                      setShowCartReview(false);
                      setShowProductSelector(true);
                    }}
                    className="rt-sale-header__back"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h2 className="rt-sale-header__title">{t('sell.cart')}</h2>
                  <div className="rt-sale-header__right">
                    <span className="rt-tag rt-tag--ghost">
                      {totalCartQty === 1 ? t('sell.caseSingle') : t('sell.casesCount', { n: totalCartQty })}
                    </span>
                    <button
                      type="button"
                      onClick={requestCancelSale}
                      aria-label={t('salesman.cancelSale')}
                      className="rt-sale-header__cancel"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('common.cancel')}</span>
                    </button>
                  </div>
                </div>
                <div className="rt-seg" aria-hidden="true">
                  <span className="rt-seg__bar rt-seg__bar--on" />
                  <span className="rt-seg__bar rt-seg__bar--on" />
                  <span className="rt-seg__bar rt-seg__bar--on" />
                  <span className="rt-seg__bar" />
                </div>
                <p className="rt-stp">{t('sell.step3QuantitiesOffers')}</p>
              </header>

              <div className="rt-sale-body !pt-3">
                {lineItems.length === 0 ? (
                  <div className="rt-card py-6 text-center space-y-2.5">
                    <p className="text-sm font-semibold text-[var(--text-2)]">{t('sell.emptyBill')}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCartReview(false);
                        setShowProductSelector(true);
                      }}
                      className="rt-btn-outline rt-btn-outline--primary"
                    >
                      {t('sell.add')}
                    </button>
                  </div>
                ) : (
                  <section className="rt-card !py-1 !px-3.5">
                    {lineItems.map((item, idx) => {
                      const prod = products.find((p) => p.id === item.productId);
                      return (
                        <div key={item.key || `cart_item_${item.productId}_${idx}`} className="rt-cartrow">
                          <div className="rt-cartrow__thumb">
                            {prod ? (
                              <ProductCardMedia product={prod} />
                            ) : (
                              <PackIcon pack={prod?.pack} name={item.productName} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-bold text-[var(--text)] leading-snug break-words m-0">
                              {item.productName}
                            </p>
                            <p className="text-[11.5px] font-semibold text-[var(--text-2)] tabular-nums mt-0.5 m-0">
                              {item.rate === 0 ? 'Free' : `₹${Number(item.rate).toLocaleString('en-IN')} × ${item.qty}`}
                              {item.freeQty > 0 && (
                                <span className="text-[var(--paid)] font-bold"> · +{item.freeQty} free</span>
                              )}
                            </p>
                          </div>
                          {!item.isBundleFreeItem ? (
                            <div className="rt-st2">
                              <button
                                type="button"
                                aria-label={`Decrease ${item.productName}`}
                                onClick={() => setItemQty(item.productId, item.qty - 1)}
                                className="rt-st2__btn"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => prod && openQuickEntry(prod)}
                                title="Tap to edit qty, rate or scheme"
                                className="rt-st2__qty"
                              >
                                {item.qty}
                              </button>
                              <button
                                type="button"
                                aria-label={`Increase ${item.productName}`}
                                onClick={() => setItemQty(item.productId, item.qty + 1)}
                                className="rt-st2__btn"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="rt-tag rt-tag--paid shrink-0">+{item.qty} free</span>
                          )}
                        </div>
                      );
                    })}
                  </section>
                )}

                {(totalDiscount > 0 || totalFreeQty > 0) && (
                  <div className="rt-noti !justify-between !items-center" role="status">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Gift className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="font-bold text-[var(--text)] break-words">
                        {t('sell.offerApplied')}
                        {totalFreeQty > 0 ? ` · +${t('sell.freeCases', { n: totalFreeQty })}` : ''}
                        {totalDiscount > 0 ? ` · −${inr(totalDiscount)}` : ''}
                      </span>
                    </span>
                    <span className="rt-tag rt-tag--paid shrink-0">{t('sell.applied')}</span>
                  </div>
                )}

              </div>

              {totalCartQty > 0 && (
                <div className="rt-cartbar" role="region" aria-label={t('sell.total')}>
                  <div className="rt-cartbar__info">
                    <span className="rt-cartbar__count">{t('sell.total')}</span>
                    <span className="rt-cartbar__total">{inr(grandTotal)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isWalkIn && payChoice === 'credit') {
                        selectPayChoice('cash');
                      }
                      setPhoneReviewStage('checkout');
                    }}
                    className="rt-cartbar__cta"
                  >
                    <span>{t('sell.reviewOrder')}</span>
                  </button>
                </div>
              )}
            </div>
          );
        }

        const combinedTotal = isWalkIn
          ? grandTotal
          : Math.round((grandTotal + creditInfo.due) * 100) / 100;
        const balanceAfterBill = Math.max(
          0,
          Math.round((combinedTotal - collectedAmountPreview) * 100) / 100,
        );

        return (
          <div
            data-esc-close
            role="dialog"
            aria-modal="true"
            aria-label={t('sell.reviewOrder')}
            className="rt-sale-checkout-sheet"
          >
            <header className="rt-sale-header">
              <div className="rt-sale-header__row">
                <button
                  type="button"
                  aria-label="Back to cart"
                  onClick={() => setPhoneReviewStage('cart')}
                  className="rt-sale-header__back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="rt-sale-header__title">{t('sell.reviewOrder')}</h2>
                <div className="rt-sale-header__right">
                  <button
                    type="button"
                    onClick={requestCancelSale}
                    aria-label={t('salesman.cancelSale')}
                    className="rt-sale-header__cancel"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('common.cancel')}</span>
                  </button>
                </div>
              </div>
              <div className="rt-seg" aria-hidden="true">
                <span className="rt-seg__bar rt-seg__bar--on" />
                <span className="rt-seg__bar rt-seg__bar--on" />
                <span className="rt-seg__bar rt-seg__bar--on" />
                <span className="rt-seg__bar rt-seg__bar--on" />
              </div>
              <p className="rt-stp">{t('sell.step4Checkout')}</p>
            </header>

            <div className="rt-checkout-body">
              {customerPhoneError && (
                <div role="alert" className="rt-notice rt-notice--due">
                  {customerPhoneError}
                </div>
              )}
              {creditExceeded && (payChoice === 'credit' || payChoice === 'partial') && (
                <div role="alert" className="rt-notice rt-notice--due">
                  This order ({inr(grandTotal)}) is more than the available credit ({inr(creditInfo.available ?? 0)}). Collect part of it now or pick another method.
                </div>
              )}
              {creditInfo.available !== null && balanceDuePreview > creditInfo.available && (
                <div role="alert" className="rt-notice rt-notice--due">
                  Remaining {inr(balanceDuePreview)} is above available credit {inr(creditInfo.available)}.
                </div>
              )}
              {cartTaxStatus.hasMixedTax && (
                <div role="status" className="rt-notice rt-notice--soon">
                  Mixed cart: auto-splits into 1 GST Invoice + 1 Non-GST Cash Memo (NG-...).
                </div>
              )}

              {/* Card 1: Bill to & Totals */}
              <section className="rt-card space-y-1">
                <div className="flex items-start justify-between gap-2 pb-1">
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-semibold text-[var(--text-2)]">{t('sell.billTo')}</div>
                    <div className="text-[14px] font-extrabold text-[var(--text)] break-words">
                      {isWalkIn ? t('sell.walkInSale') : (customerName || t('sell.walkInSale'))}
                    </div>
                  </div>
                  {isWalkIn ? (
                    <span className="rt-tag rt-tag--ghost shrink-0">{t('sell.counter')}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={goBackToStep1}
                      className="text-xs font-bold text-[var(--primary)] cursor-pointer shrink-0 min-h-[44px] inline-flex items-center px-1"
                    >
                      {t('common.edit')}
                    </button>
                  )}
                </div>

                {!isWalkIn ? (
                  <>
                    <div className="rt-ln">
                      <span className="text-[var(--text-2)] font-semibold">
                        {t('sell.items')} ({totalCartQty}
                        {totalFreeQty > 0 ? ` + ${totalFreeQty} free` : ''})
                      </span>
                      <b className="tabular-nums">{inr(grandTotal)}</b>
                    </div>
                    <div className="rt-ln">
                      <span className="text-[var(--text-2)] font-semibold">{t('sell.previousDue')}</span>
                      <b className={`tabular-nums ${creditInfo.due > 0.004 ? 'text-[var(--due)]' : 'text-[var(--text)]'}`}>
                        {inr(creditInfo.due)}
                      </b>
                    </div>
                    <div className="rt-ln rt-ln--total">
                      <span>{t('sell.grandTotal')}</span>
                      <span className="tabular-nums">{inr(combinedTotal)}</span>
                    </div>
                  </>
                ) : (
                  <div className="rt-ln rt-ln--total">
                    <span>{t('sell.grandTotal')}</span>
                    <span className="tabular-nums">{inr(grandTotal)}</span>
                  </div>
                )}
              </section>

              {/* Card 2: Payment method + large Amount received + Balance after bill */}
              <section className="rt-card space-y-2.5">
                <div className="text-[11.5px] font-semibold text-[var(--text-2)]">{t('sell.payment')}</div>

                <div className="rt-pay-pills" role="group" aria-label={t('sell.payment')}>
                  <button
                    type="button"
                    aria-pressed={activePhonePay === 'cash'}
                    onClick={() => selectPayChoice('cash')}
                    className="rt-pay-pill"
                  >
                    <span>{t('sell.cash')}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={activePhonePay === 'upi'}
                    onClick={() => selectPayChoice('upi')}
                    className="rt-pay-pill"
                  >
                    <span>{t('sell.upi')}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={!isWalkIn && activePhonePay === 'credit'}
                    disabled={isWalkIn}
                    onClick={() => {
                      if (!isWalkIn) selectPayChoice('credit');
                    }}
                    className={`rt-pay-pill ${isWalkIn ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <span>{t('sell.credit')}</span>
                  </button>
                </div>

                <div className="rt-fld">
                  <label htmlFor="partial-amount" className="rt-fld__label">
                    {t('sell.amountCollected')}
                  </label>
                  <div className="rt-fld__row">
                    <span className="rt-fld__curr">₹</span>
                    <input
                      id="partial-amount"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={paymentAmount}
                      onChange={(e) => {
                        setPayChoice('partial');
                        if (paymentMode === 'credit') setPaymentMode('cash');
                        setPaymentAmount(e.target.value);
                      }}
                      className="rt-fld__input"
                    />
                  </div>
                </div>

                {payChoice === 'partial' && collectedAmountPreview > 0 && (
                  <div className="flex items-center gap-1.5">
                    {(['cash', 'upi'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={paymentMode === m}
                        onClick={() => setPaymentMode(m)}
                        className="rt-chip min-h-[34px]! px-3!"
                      >
                        {m === 'cash' ? t('sell.cash') : t('sell.upi')}
                      </button>
                    ))}
                  </div>
                )}

                <div className="rt-ln !pt-0.5">
                  <span className="text-[var(--text-2)] font-semibold">
                    {isWalkIn ? t('sell.balance') : t('sell.balanceAfterBill')}
                  </span>
                  <b className={`tabular-nums ${balanceAfterBill > 0.005 ? 'text-[var(--due)]' : 'text-[var(--paid)]'}`}>
                    {inr(balanceAfterBill)}
                  </b>
                </div>
              </section>

              {/* Collapsible Phone & Bill Type details */}
              <details className="rt-card">
                <summary className="list-none flex items-center justify-between gap-2 cursor-pointer text-[12px] font-bold text-[var(--text-2)]">
                  <span>{t('sell.orderSetup')} · {formattedSaleDate}</span>
                  <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                </summary>
                <div className="mt-3 space-y-2.5">
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-[var(--text-2)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      inputMode="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone / WhatsApp (optional)"
                      aria-label="Retailer phone number"
                      className="w-full min-h-[44px] pl-9 pr-3 rounded-[var(--r-control)] border border-[var(--border)] bg-[var(--bg)] text-sm font-medium text-[var(--text)] focus:outline-none focus:bg-[var(--surface)] focus:border-[var(--primary)]"
                    />
                  </div>
                  <select
                    id="review-bill-type"
                    value={billType}
                    onChange={(e) => setBillType(e.target.value as 'tax_invoice' | 'bill_of_supply' | 'estimate')}
                    aria-label="Bill type"
                    className="w-full min-h-[44px] px-3 rounded-[var(--r-control)] border border-[var(--border)] bg-[var(--surface)] text-sm font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                  >
                    <option value="tax_invoice" disabled={compositionLocked || cartTaxStatus.allNonGst}>
                      Tax invoice (GST inclusive)
                      {compositionLocked
                        ? ' - not allowed for composition'
                        : cartTaxStatus.allNonGst
                          ? ' - disabled (all items Non-GST)'
                          : ''}
                    </option>
                    <option value="bill_of_supply">Bill of supply (non-GST)</option>
                    <option value="estimate">Estimate / quotation</option>
                  </select>
                </div>
              </details>
            </div>

            <div className="rt-checkout-footer">
              <button
                type="button"
                id="btn-finalize-save-bill-mobile"
                onClick={handleSaveBill}
                disabled={lineItems.length === 0}
                className="rt-btn rt-btn--accent w-full"
              >
                {cartTaxStatus.hasMixedTax
                  ? `${t('sell.confirmGenerateBill')} (2)`
                  : t('sell.confirmGenerateBill')}
              </button>
            </div>
          </div>
        );
      })() : (
        <div
          data-esc-close
          role="dialog"
          aria-modal="true"
          aria-label="Order Review & Checkout"
          className="fixed inset-0 z-50 bg-[#F8F9FA] flex flex-col"
        >
          <header className="bg-[#0A1F44] text-white px-3 py-2.5 flex items-center gap-3 shrink-0 pt-[max(0.625rem,env(safe-area-inset-top))]">
            <button
              type="button"
              aria-label="Back to catalog"
              onClick={() => {
                setShowCartReview(false);
                setShowProductSelector(true);
              }}
              className="size-11 shrink-0 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
              <h2 className="text-[17px] sm:text-lg font-extrabold text-white leading-none truncate">
                Order Review
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-white/85 whitespace-nowrap">
                  {totalCartQty} cs{totalFreeQty > 0 ? ` · ${totalFreeQty} free` : ''}
                </span>
                <button
                  type="button"
                  onClick={requestCancelSale}
                  className="min-h-[38px] px-3 rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-bold text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('salesman.cancelSale')}</span>
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-3 md:px-4 pt-3 pb-28 md:pb-6 md:grid md:grid-cols-12 md:gap-6 space-y-4 md:space-y-0">
              {/* LEFT: retailer info + editable items */}
              <div className="md:col-span-7 min-w-0 space-y-4">
                <section className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Retailer</p>
                      <h3 className="text-lg font-bold text-[#0A1F44] break-words">{customerName || 'Apt / Walk-in sale'}</h3>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                          <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="tel"
                            inputMode="tel"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="Phone / WhatsApp (optional)"
                            aria-label="Retailer phone number"
                            className={`w-full min-h-[38px] pl-8 pr-2.5 rounded-lg border bg-gray-50 focus:bg-white text-xs font-medium text-[#0A1F44] focus:outline-none focus:ring-2 ${
                              customerPhoneError
                                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                                : 'border-gray-200 focus:border-[#1B8A5A] focus:ring-[#1B8A5A]/20'
                            }`}
                          />
                        </div>
                        {customerGstin && (
                          <span className="text-xs text-gray-600 font-mono">{customerGstin}</span>
                        )}
                      </div>
                      {customerPhoneError && (
                        <p className="mt-1 text-[11px] font-medium text-rose-600">{customerPhoneError}</p>
                      )}
                    </div>
                    <span
                      className={`font-semibold rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap ${
                        creditInfo.due > 0.004 ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-[#1B8A5A]'
                      }`}
                    >
                      Due {inr(creditInfo.due)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] text-[#1B8A5A] text-xs font-semibold px-2.5 py-1">
                      <Truck className="w-3.5 h-3.5" />
                      {saleSource === 'trip' ? `Source: Trip (${selectedTripId ?? '—'})` : 'Source: Warehouse'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Invoice Date: {formattedSaleDate}
                    </span>
                    <button
                      type="button"
                      onClick={goBackToStep1}
                      className="min-h-[44px] px-2 text-xs font-semibold text-[#1B8A5A] hover:underline cursor-pointer"
                    >
                      Change retailer
                    </button>
                  </div>
                </section>

                <section className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 tabular-nums">
                      Order Items ({lineItems.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCartReview(false);
                        setShowProductSelector(true);
                      }}
                      className="min-h-[44px] px-2 inline-flex items-center gap-1 text-xs font-semibold text-[#1B8A5A] hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add more items
                    </button>
                  </div>

                  {lineItems.length === 0 ? (
                    <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6 text-center space-y-3">
                      <p className="text-sm font-semibold text-gray-600">Your cart is empty. Add beverages to review.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCartReview(false);
                          setShowProductSelector(true);
                        }}
                        className="min-h-[44px] px-4 rounded-xl bg-[#1B8A5A] hover:bg-[#157048] text-white text-sm font-semibold cursor-pointer"
                      >
                        + Select Beverages
                      </button>
                    </div>
                  ) : (
                    lineItems.map((item, idx) => {
                      const prod = products.find((p) => p.id === item.productId);
                      const cost = Number(prod?.effectiveCost ?? prod?.cost) || 0;
                      const cases = Number(item.qty) || 0;
                      const perCase = cases > 0 ? (Number(item.taxable) || 0) / cases : 0;
                      const profit = cost > 0 && cases > 0 && !item.isFree && !item.isBundleFreeItem ? perCase - cost : null;
                      return (
                        <div
                          key={item.key || `cart_item_${item.productId}_${idx}`}
                          className="bg-white rounded-xl border border-gray-200 p-3.5 space-y-2.5"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-11 h-11 rounded-xl bg-[#F8F9FA] border border-gray-200 flex items-center justify-center shrink-0">
                              <PackIcon pack={prod?.pack} name={item.productName} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-[#0A1F44] text-sm leading-snug break-words">{item.productName}</p>
                              <p className="mt-0.5 text-xs text-gray-600 tabular-nums">
                                {item.rate === 0 ? 'Free' : `₹${Number(item.rate).toLocaleString('en-IN')} / case`}
                                {item.taxability === 'non_gst' ? (
                                  <span className="ml-1 font-semibold text-slate-600">· Non-GST (0%)</span>
                                ) : item.cgstRate > 0 ? (
                                  <span> · GST {item.cgstRate * 2}%</span>
                                ) : null}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {item.freeQty > 0 && (
                                  <span className="bg-emerald-100 text-emerald-800 text-xs font-medium px-2 py-0.5 rounded-full">
                                    +{item.freeQty} Free Case{item.freeQty === 1 ? '' : 's'}
                                  </span>
                                )}
                                {item.appliedPromo && (
                                  <span className="bg-emerald-50 text-[#1B8A5A] text-xs font-medium px-2 py-0.5 rounded-full max-w-full truncate">
                                    {item.promoLabel || 'Scheme'}
                                  </span>
                                )}
                                {profit !== null && profit < 0 && (
                                  <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                    Below cost (−₹{money(-profit)}/cs)
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-[#0A1F44] tabular-nums">{inr(item.gross)}</p>
                              <p className="text-[11px] text-gray-500 tabular-nums">{item.qty} case{item.qty === 1 ? '' : 's'}</p>
                            </div>
                          </div>

                          {!item.isBundleFreeItem && (
                            <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
                              <div className="inline-flex items-center rounded-xl border border-gray-300 overflow-hidden">
                                <button
                                  type="button"
                                  aria-label={`Decrease ${item.productName}`}
                                  onClick={() => setItemQty(item.productId, item.qty - 1)}
                                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-700 hover:bg-gray-100 cursor-pointer"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="min-w-[40px] px-2 text-center font-bold text-[#0A1F44] tabular-nums">{item.qty}</span>
                                <button
                                  type="button"
                                  aria-label={`Increase ${item.productName}`}
                                  onClick={() => setItemQty(item.productId, item.qty + 1)}
                                  className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-[#1B8A5A] text-white hover:bg-[#157048] cursor-pointer"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="flex items-center gap-2">
                                {prod && (
                                  <button
                                    type="button"
                                    onClick={() => openQuickEntry(prod)}
                                    aria-label={`Edit scheme or price for ${item.productName}`}
                                    title="Scheme / Custom Price"
                                    className="min-h-[44px] px-3 rounded-xl border border-gray-200 bg-[#F8F9FA] hover:bg-gray-100 text-xs font-semibold text-[#0A1F44] inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-[#1B8A5A]" /> Edit
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setItemQty(item.productId, 0)}
                                  aria-label={`Remove ${item.productName}`}
                                  title="Remove item"
                                  className="min-h-[44px] min-w-[44px] rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </section>
              </div>

              {/* RIGHT: financial summary + payment + CTA */}
              <div className="md:col-span-5 min-w-0 space-y-4">
                {isCompact && (
                  <section className="bg-white rounded-xl border border-gray-200 p-4">
                    <label htmlFor="review-bill-type" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                      Bill type
                    </label>
                    <select
                      id="review-bill-type"
                      value={billType}
                      onChange={(e) => setBillType(e.target.value as 'tax_invoice' | 'bill_of_supply' | 'estimate')}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-gray-300 bg-white text-sm font-medium text-[#0A1F44] cursor-pointer focus:outline-none focus:border-[#1B8A5A] focus:ring-2 focus:ring-[#1B8A5A]/20"
                    >
                      <option value="tax_invoice" disabled={compositionLocked || cartTaxStatus.allNonGst}>
                        Tax invoice (GST inclusive)
                        {compositionLocked
                          ? ' - not allowed for composition'
                          : cartTaxStatus.allNonGst
                            ? ' - disabled (all items Non-GST)'
                            : ''}
                      </option>
                      <option value="bill_of_supply">Bill of supply (non-GST)</option>
                      <option value="estimate">Estimate / quotation</option>
                    </select>
                    {cartTaxStatus.allNonGst && (
                      <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
                        All items are Non-GST (0% tax) — GST does not apply.
                      </p>
                    )}
                    {cartTaxStatus.hasMixedTax && billType === 'tax_invoice' && (
                      <p className="mt-1.5 text-[11px] font-medium text-gray-500">
                        Mixed cart: Non-GST items stay at 0% GST; GST applies only to taxable items.
                      </p>
                    )}
                  </section>
                )}

                <section className="bg-white rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-3">Financial Summary</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-600">Subtotal</dt>
                      <dd className="font-medium text-[#0A1F44] tabular-nums">{inr(subtotalBeforeSavings)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-600">Scheme &amp; Custom Price Savings</dt>
                      <dd className="text-[#1B8A5A] font-medium tabular-nums">
                        {totalSavings > 0 ? `− ${inr(totalSavings)}` : inr(0)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-600">{billType === 'tax_invoice' ? 'GST (included)' : 'GST'}</dt>
                      <dd className="font-medium text-[#0A1F44] tabular-nums">{inr(totalTax)}</dd>
                    </div>
                    <div className="flex justify-between gap-3 pt-3 border-t border-gray-200">
                      <dt className="font-bold text-[#0A1F44]">GRAND TOTAL</dt>
                      <dd className="font-bold text-lg text-[#0A1F44] tabular-nums">{inr(grandTotal)}</dd>
                    </div>
                  </dl>
                  {cartTaxStatus.hasMixedTax && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/75 p-3 space-y-1.5 text-xs">
                      <div className="font-bold text-amber-950 flex items-center justify-between">
                        <span>Auto-Split Checkout · 2 Separate Bills</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-200/70 text-[10px] uppercase tracking-wider">GST Safe</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-700 tabular-nums">
                        <span>1. GST Bill ({splitPreview.gstLines.length} item{splitPreview.gstLines.length === 1 ? '' : 's'})</span>
                        <span className="font-bold text-slate-900">{inr(splitPreview.gstTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-700 tabular-nums">
                        <span>2. Non-GST Cash Memo · NG-... ({splitPreview.nonGstLines.length} item{splitPreview.nonGstLines.length === 1 ? '' : 's'})</span>
                        <span className="font-bold text-amber-900">{inr(splitPreview.nonGstTotal)} (0% GST)</span>
                      </div>
                      {collectedAmountPreview > 0 && collectedAmountPreview < grandTotal - 0.01 && (
                        <div className="pt-1 border-t border-amber-200/80 text-[11px] text-amber-900 tabular-nums">
                          Payment split: {inr(splitPreview.gstPaid)} → GST bill · {inr(splitPreview.nonGstPaid)} → Non-GST memo
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section className="bg-white rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-3">Payment Method</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Net 30 Credit */}
                    <button
                      type="button"
                      aria-pressed={payChoice === 'credit'}
                      onClick={() => selectPayChoice('credit')}
                      className={`text-left rounded-xl min-h-[44px] cursor-pointer ${
                        payChoice === 'credit' ? 'border-2 border-[#1B8A5A] bg-[#ECFDF5] p-[11px]' : 'border border-gray-200 bg-white hover:border-gray-300 p-3'
                      }`}
                    >
                      <CreditCard className="w-5 h-5 text-[#0A1F44]" />
                      <p className="mt-1.5 text-sm font-semibold text-[#0A1F44]">Net 30 Credit</p>
                      {creditInfo.available === null ? (
                        <p className="text-xs text-gray-500">No credit limit set</p>
                      ) : creditExceeded ? (
                        <p className="text-xs font-semibold text-red-700">
                          Over limit by {inr(grandTotal - creditInfo.available)}
                        </p>
                      ) : (
                        <p className="text-xs font-medium text-[#1B8A5A]">Remaining {inr(creditInfo.available)}</p>
                      )}
                    </button>

                    <button
                      type="button"
                      aria-pressed={payChoice === 'cash'}
                      onClick={() => selectPayChoice('cash')}
                      className={`text-left rounded-xl min-h-[44px] cursor-pointer ${
                        payChoice === 'cash' ? 'border-2 border-[#1B8A5A] bg-[#ECFDF5] p-[11px]' : 'border border-gray-200 bg-white hover:border-gray-300 p-3'
                      }`}
                    >
                      <Banknote className="w-5 h-5 text-[#0A1F44]" />
                      <p className="mt-1.5 text-sm font-semibold text-[#0A1F44]">Cash / Delivery</p>
                      <p className="text-xs text-gray-500">Collect full amount</p>
                    </button>

                    <button
                      type="button"
                      aria-pressed={payChoice === 'upi'}
                      onClick={() => selectPayChoice('upi')}
                      className={`text-left rounded-xl min-h-[44px] cursor-pointer ${
                        payChoice === 'upi' ? 'border-2 border-[#1B8A5A] bg-[#ECFDF5] p-[11px]' : 'border border-gray-200 bg-white hover:border-gray-300 p-3'
                      }`}
                    >
                      <QrCode className="w-5 h-5 text-[#0A1F44]" />
                      <p className="mt-1.5 text-sm font-semibold text-[#0A1F44]">UPI / QR Code</p>
                      <p className="text-xs text-gray-500">GPay · PhonePe · Paytm</p>
                    </button>

                    <button
                      type="button"
                      aria-pressed={payChoice === 'partial'}
                      onClick={() => selectPayChoice('partial')}
                      className={`text-left rounded-xl min-h-[44px] cursor-pointer ${
                        payChoice === 'partial' ? 'border-2 border-[#1B8A5A] bg-[#ECFDF5] p-[11px]' : 'border border-gray-200 bg-white hover:border-gray-300 p-3'
                      }`}
                    >
                      <Wallet className="w-5 h-5 text-[#0A1F44]" />
                      <p className="mt-1.5 text-sm font-semibold text-[#0A1F44]">Partial / Split Payment</p>
                      <p className="text-xs text-gray-500">Part now, rest on credit</p>
                    </button>
                  </div>

                  {creditExceeded && (payChoice === 'credit' || payChoice === 'partial') && (
                    <p className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
                      This order ({inr(grandTotal)}) is more than the available credit ({inr(creditInfo.available ?? 0)}).
                      {' '}Collect part of it now or pick another method.
                    </p>
                  )}

                  {payChoice === 'partial' && (
                    <div className="mt-3 space-y-2">
                      <label htmlFor="partial-amount" className="block text-xs font-semibold text-gray-600">
                        Amount Collected Now
                      </label>
                      <input
                        id="partial-amount"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        placeholder="0"
                        value={paymentAmount}
                        onChange={(e) => {
                          setPaymentAmount(e.target.value);
                          if (paymentMode === 'credit') setPaymentMode('cash');
                        }}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-gray-300 bg-white text-base font-semibold text-[#0A1F44] tabular-nums focus:outline-none focus:border-[#1B8A5A] focus:ring-2 focus:ring-[#1B8A5A]/20"
                      />
                      <div className="flex gap-2">
                        {(['cash', 'upi'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPaymentMode(m)}
                            className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold cursor-pointer ${
                              paymentMode === m ? 'bg-[#1B8A5A] text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {m === 'cash' ? 'Cash' : 'UPI'}
                          </button>
                        ))}
                      </div>
                      <p
                        className={`text-xs font-semibold ${balanceDuePreview > 0.005 ? 'text-amber-700' : 'text-[#1B8A5A]'}`}
                      >
                        {collectedAmountPreview <= 0
                          ? `Nothing collected · ${inr(grandTotal)} goes on credit`
                          : balanceDuePreview > 0.005
                            ? `Remaining credit balance: ${inr(balanceDuePreview)}`
                            : 'Paid in full · Due ₹0'}
                      </p>
                      {creditInfo.available !== null && balanceDuePreview > creditInfo.available && (
                        <p className="text-xs font-semibold text-red-700">
                          Remaining {inr(balanceDuePreview)} is above available credit {inr(creditInfo.available)}.
                        </p>
                      )}
                    </div>
                  )}
                </section>

                {/* Tablet: sticky CTA inside the right column */}
                <div className="hidden md:block sticky bottom-0 bg-[#F8F9FA] pt-2 pb-1">
                  <button
                    type="button"
                    id="btn-finalize-save-bill"
                    onClick={handleSaveBill}
                    disabled={lineItems.length === 0}
                    className="w-full min-h-[48px] bg-[#1B8A5A] hover:bg-[#157048] text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {cartTaxStatus.hasMixedTax
                      ? `Confirm & Issue 2 Split Bills • ${inr(grandTotal)}`
                      : `Confirm & Complete Sale • ${inr(grandTotal)}`}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile: sticky bottom CTA */}
          <div className="md:hidden shrink-0 bg-white border-t border-gray-200 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              id="btn-finalize-save-bill-mobile"
              onClick={handleSaveBill}
              disabled={lineItems.length === 0}
              className="w-full min-h-[48px] bg-[#1B8A5A] hover:bg-[#157048] text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {cartTaxStatus.hasMixedTax
                ? `Confirm & Issue 2 Split Bills • ${inr(grandTotal)}`
                : `Confirm & Complete Sale • ${inr(grandTotal)}`}
            </button>
          </div>
        </div>
      ))}

      {/* QUICK ENTRY POPUP: Quantity, Rate & Scheme (UI lives in SchemeCustomPriceModal) */}
      {quickEntryProduct && (() => {
        const prod = quickEntryProduct;
        const available = getProductStock(prod.id);
        const defaultRate = getProductDefaultPrice(prod);
        const parsedQty = Math.max(0, parseInt(quickEntryQty, 10) || 0);
        const parsedRate = quickEntryRate.trim() === '' ? 0 : Math.max(0, parseFloat(quickEntryRate) || 0);

        const userChoice = customSchemes[prod.id];
        let activePromo: Promotion | null = null;
        if (userChoice !== undefined) {
          activePromo = userChoice;
        } else if (schemeMode !== 'none' && billingSettings?.schemesEnabled !== false && billingSettings?.autoApplyPromotions !== false) {
          activePromo = activePromoFor ? activePromoFor(prod.id) : null;
        }
        const promoLabel = activePromo ? schemeLabel(activePromo, products) : null;
        const previewComp = parsedQty > 0 ? computeLine(prod, 'Retail', parsedQty, activePromo, parsedRate, 0) : null;

        const commitPopup = () => {
          if (parsedRate !== (customRates[prod.id] !== undefined ? customRates[prod.id] : defaultRate)) {
            handleSetProductRate(prod.id, parsedRate);
          }
          setItemQty(prod.id, parsedQty);
          setQuickEntryProduct(null);
        };

        return (
          <SchemeCustomPriceModal
            product={prod}
            basePrice={defaultRate}
            available={available}
            isVanStock={stockSource.startsWith('trip_')}
            qty={quickEntryQty}
            parsedQty={parsedQty}
            onQtyChange={setQuickEntryQty}
            qtyInputRef={quickEntryQtyRef}
            rate={quickEntryRate}
            parsedRate={parsedRate}
            onRateChange={setQuickEntryRate}
            schemeActive={!!activePromo}
            promoLabel={promoLabel}
            freeQty={previewComp ? previewComp.freeQty : 0}
            onToggleScheme={(next) => {
              if (!next) {
                // Same effect as the cart line's "Clear scheme" button.
                setCustomSchemes((prev) => ({ ...prev, [prod.id]: null }));
                return;
              }
              const candidate = activePromoFor ? activePromoFor(prod.id) : null;
              if (candidate) setCustomSchemes((prev) => ({ ...prev, [prod.id]: candidate }));
              else setSchemeModalProduct(prod); // nothing to auto-apply: let the user pick one
            }}
            onChangeScheme={() => setSchemeModalProduct(prod)}
            lineTotal={Math.round(((previewComp ? previewComp.gross : parsedQty * parsedRate) + Number.EPSILON) * 100) / 100}
            isEditing={(selectedItems[prod.id] || 0) > 0}
            onSubmit={commitPopup}
            onRemove={() => {
              setItemQty(prod.id, 0);
              setQuickEntryProduct(null);
            }}
            onClose={() => setQuickEntryProduct(null)}
          />
        );
      })()}

      {/* SCHEME SELECTOR MODAL (Full Promotions & BOGO Support) */}
      {schemeModalProduct && (
        <SchemeSelectorModal
          product={schemeModalProduct}
          currentRate={customRates[schemeModalProduct.id] !== undefined ? customRates[schemeModalProduct.id] : getProductDefaultPrice(schemeModalProduct)}
          currentScheme={
            customSchemes[schemeModalProduct.id] !== undefined
              ? customSchemes[schemeModalProduct.id]
              : (schemeMode === 'none' || billingSettings?.schemesEnabled === false || billingSettings?.autoApplyPromotions === false
                ? null
                : (activePromoFor ? activePromoFor(schemeModalProduct.id) : null))
          }
          currentPromoLabel={customSchemes[schemeModalProduct.id] ? schemeLabel(customSchemes[schemeModalProduct.id]!, products) : null}
          availablePromotions={promotions}
          products={products}
          onSelectScheme={(promo) => {
            setCustomSchemes((prev) => ({ ...prev, [schemeModalProduct.id]: promo }));
            setSchemeModalProduct(null);
          }}
          onClose={() => setSchemeModalProduct(null)}
        />
      )}

      {/* MODAL: Add New Customer */}
      {newCustomerSheet}
      {cancelSaleConfirmModal}

      {/* New van trip: the full load-sheet screen (products + quantities), so the van has stock to sell */}
      {showNewTripModal && (
        <NewTripSheet
          products={products}
          warehouses={warehouses}
          salesmen={salesmen}
          vehicles={Array.from(new Set(trips.map((t) => (t.vehicle || '').trim()).filter(Boolean))).sort((x, y) => x.localeCompare(y))}
          routes={activeBeats.map((b) => b.name)}
          defaultWarehouseId={defaultWarehouseId}
          warehouseStock={warehouseStock}
          attachableBills={createTrip.attachable}
          lockedSalesman={
            currentUser && typeof currentUser === 'object' && 'role' in currentUser && currentUser.role === 'salesman'
              ? { id: String((currentUser as any).id), name: String((currentUser as any).name || 'Salesman') }
              : undefined
          }
          onSubmit={handleCreateTrip}
          onClose={() => setShowNewTripModal(false)}
        />
      )}
    </div>
  );
};
