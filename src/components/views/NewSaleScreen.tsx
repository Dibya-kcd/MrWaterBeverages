import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { notify } from "../../utils/toast";
import { sizeTheme, packTheme, compareProductsInSequence } from "../../utils/sizeColor";
import { PackIcon, packTextColor } from "../common/PackIcon";
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileText,
  Gift,
  Minus,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  X,
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
import { ActionBar } from '../ui/HomeKit';
import { applyCartSchemes, computeLine, money, schemeLabel, volumeFromName } from '../../utils/billing';
import { CATS } from '../../constants/initialData';
import { SchemeSelectorModal } from '../billing/SchemeSelectorModal';
import { CustomerPredictiveSearch } from '../billing/CustomerPredictiveSearch';
import { todayISO } from "../../utils/dateLocal";

// Helper: extract default catalog price for product (never hardcoded 0 unless catalog has 0)
const getProductDefaultPrice = (p: Product): number => {
  if (typeof p.retail === 'number' && !isNaN(p.retail) && p.retail > 0) return p.retail;
  if (typeof p.wholesale === 'number' && !isNaN(p.wholesale) && p.wholesale > 0) return p.wholesale;
  if (typeof (p as any).price === 'number' && !isNaN((p as any).price) && (p as any).price > 0) return (p as any).price;
  return 0;
};

interface NewSaleScreenProps {
  onBack: () => void;
  onOpenInvoiceModal: (bill: Bill, defaultFormat?: 'gst' | 'non_gst') => void;
  onOpenHistory: () => void;
}

export const NewSaleScreen: React.FC<NewSaleScreenProps> = ({
  onBack,
  onOpenInvoiceModal,
  onOpenHistory,
}) => {
  const { t } = useLanguage();
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
    finalizeBill,
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
  const defaultWarehouseId = defaultWarehouse?.id || warehouses[0]?.id || 'wh_main';
  const [stockSource, setStockSource] = useState<string>(defaultWarehouseId);

  // If currently selected stock source is a trip that closed, revert back to default warehouse
  useEffect(() => {
    if (stockSource.startsWith('trip_')) {
      const tid = parseInt(stockSource.replace('trip_', ''), 10);
      const isStillActive = activeTripsForUser.some((t) => t.id === tid);
      if (!isStillActive) {
        setStockSource(defaultWarehouseId);
      }
    }
  }, [stockSource, activeTripsForUser, defaultWarehouseId]);

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

  // Modals & Panels
  const [showProductSelector, setShowProductSelector] = useState<boolean>(false);
  // Show only products available in the selected warehouse or vehicle (defaults to true)
  const [inStockOnly, setInStockOnly] = useState<boolean>(true);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustGstin, setNewCustGstin] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustBeat, setNewCustBeat] = useState('');

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
    setCart({
      retailer: '',
      phone: '',
      date: todayISO(),
      items: [],
      warehouseId: defaultWarehouseId,
    });
    setShowProductSelector(false);
    setShowCartReview(false);
  }, [defaultWarehouseId, setCart]);

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

  // Do NOT auto-open the beverage selector when customer or stock-from changes.
  // Flow: complete customer → date → stock from → GST, then user taps "Select beverages".
  const checkAndPromptProducts = (_cust: string, _stock: string) => {
    // intentionally no-op — smooth sequential selection
  };

  // Stock from change (Godown or Van Trip)
  const handleStockSourceChange = (val: string) => {
    if (val === '__new_van_trip__') {
      setShowNewTripModal(true);
      return;
    }
    setStockSource(val);
    checkAndPromptProducts(customerName, val);
  };

  // Load a new van with the same load-sheet screen the Trips page uses, then sell from it
  const handleCreateTrip = (payload: NewTripPayload): string | null => {
    const res = createTrip.create(payload);
    if (res.ok === false) return res.error;
    setShowNewTripModal(false);
    setStockSource(`trip_${res.trip.id}`);
    notify(`${payload.vehicle} loaded with ${res.total} cs${res.godowns > 1 ? ` from ${res.godowns} godowns` : ''}.`);
    checkAndPromptProducts(customerName, `trip_${res.trip.id}`);
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



  // Product categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['all', ...Array.from(set)];
  }, [products]);

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

  // Count of items in stock at the selected location
  const inStockCount = useMemo(() => {
    return products.filter((p) => getProductStock(p.id) > 0).length;
  }, [products, getProductStock]);

  // Same size the product card shows: the saved volume, else the size written in the name.
  const sizeOf = (p: { volume?: number; name?: string }): number => {
    const v = Number(p.volume);
    return v > 0 ? v : (p.name ? volumeFromName(p.name) || 0 : 0);
  };
  const isSodaProduct = (p: { category?: string; name?: string }): boolean =>
    p.category === 'vibe' || /soda|cola|carbonat/i.test(`${p.category || ''} ${p.name || ''}`);

  // One chip per size that really exists in the catalogue, so every chip matches what the cards show.
  const sizeOptions = useMemo(() => {
    const set = new Set<number>();
    products.forEach((p) => {
      const v = sizeOf(p);
      if (v > 0) set.add(v);
    });
    return Array.from(set).sort((a, b) => a - b).map((v) => ({ id: String(v), label: sizeTheme(v).label }));
  }, [products]);

  // If the chosen size disappears (stock edited, catalogue changed), go back to All.
  useEffect(() => {
    if (selectedSize !== 'all' && selectedSize !== 'soda' && !sizeOptions.some((o) => o.id === selectedSize)) {
      setSelectedSize('all');
    }
  }, [sizeOptions, selectedSize]);

  // Products matching search, size, pack & stock (before category filter) sorted in sequence (PET -> Can -> Glass -> Tetra, ascending volume)
  const baseFilteredProducts = useMemo(() => {
    return products
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

        if (!matchesSearch) return false;

        // Filter to only show products available in the selected warehouse or vehicle
        if (inStockOnly) {
          const available = getProductStock(p.id);
          const inCart = (selectedItems[p.id] || 0) > 0;
          return available > 0 || inCart;
        }
        return true;
      })
      .sort(compareProductsInSequence);
  }, [products, beverageSearch, selectedPackFilter, selectedSize, inStockOnly, getProductStock, selectedItems]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of baseFilteredProducts) {
      const catKey = p.category || 'other';
      counts.set(catKey, (counts.get(catKey) || 0) + 1);
    }
    return counts;
  }, [baseFilteredProducts]);

  // Filtered products inside "Select Beverages & Crates"
  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return baseFilteredProducts;
    return baseFilteredProducts.filter((p) => (p.category || 'other') === selectedCategory);
  }, [baseFilteredProducts, selectedCategory]);

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

  // Total crates in cart
  const totalCartQty = useMemo(() => {
    return lineItems.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  }, [lineItems]);

  // Keep LedgerContext cart synchronized so finalizeBill succeeds
  useEffect(() => {
    const isTrip = stockSource.startsWith('trip_');
    const tripId = isTrip ? parseInt(stockSource.replace('trip_', ''), 10) : undefined;
    const warehouseId = !isTrip ? stockSource : undefined;

    setCart({
      retailer: customerName,
      phone: customerPhone,
      date: saleDate,
      items: lineItems,
      warehouseId,
      tripId,
    });
  }, [customerName, customerPhone, saleDate, lineItems, stockSource, setCart]);

  // Handle Save Bill from Cart Review
  const handleSaveBill = () => {
    if (!customerName.trim()) {
      notify('Please choose or enter a customer name.');
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
    const warehouseId = !isTrip ? stockSource : undefined;

    const isGst = billType === 'tax_invoice';
    const supplyType = isGst && customerGstin.trim() ? 'B2B' : 'B2C';

    const trimmedPayment = paymentAmount.trim();
    const paidNum =
      trimmedPayment === ''
        ? 0
        : Math.min(grandTotal, Math.max(0, Number(trimmedPayment) || 0));
    const effectivePaymentMode: PaymentMode =
      paidNum <= 0 ? 'credit' : paymentMode === 'credit' ? 'cash' : paymentMode;

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
        supplyType,
        customerGstin: customerGstin.trim() || undefined,
        invoiceType: billType === 'tax_invoice' ? 'tax_invoice' : 'bill_of_supply',
        isGstInvoice: isGst,
        status: 'active',
      };

      setSavedBill(newlyCreated);
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
      setShowCartReview(false);
      onOpenInvoiceModal(newlyCreated, isGst ? 'gst' : 'non_gst');
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

  return (
    <div className="hh-view w-full space-y-4 pb-16 min-w-0 overflow-x-hidden">
      {/* Top Header with Responsive Floating Cart Icon */}
      <div className="flex items-center justify-between gap-3 sticky top-0 bg-[var(--canvas)] z-30 py-2.5 -my-2 border-b border-slate-200/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-tight">
              Order & Invoice Details
            </h2>
            <p className="text-[11px] text-slate-500 truncate hidden sm:block">
              Select customer, godown stock, and water products to generate bill
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(selectedCustomerId || totalCartQty > 0) && (
            <button
              type="button"
              id="btn-reset-new-customer"
              onClick={handleResetSale}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
              title="Reset order & select a new customer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}

          {/* Floating Cart Button with Live Number & Subtotal */}
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

      {/* Main Configuration Card */}
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
                <option value="tax_invoice" disabled={compositionLocked}>
                  Tax invoice (GST inclusive){compositionLocked ? ' - not allowed for composition' : ''}
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

        {/* Button to Open "Select Beverages & Crates" Screen */}
        <button
          type="button"
          id="btn-add-product"
          onClick={() => setShowProductSelector(true)}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-emerald-50/70 via-white to-slate-50 hover:from-emerald-100/70 hover:to-emerald-50/30 rounded-2xl border-2 border-emerald-600/30 hover:border-emerald-600 shadow-2xs text-sm font-semibold text-slate-800 transition-all cursor-pointer group"
        >
          <span className="flex items-center gap-2.5 text-emerald-950 font-bold">
            <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs shrink-0">
              <Plus className="w-4 h-4" />
            </div>
            <span>Select Beverages & Crates</span>
          </span>
          <div className="flex items-center gap-2">
            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 shrink-0" />
          </div>
        </button>

      {/* MODAL: Select Beverages & Crates Screen (Smart Quantity & Custom Rate Grid) */}
      {showProductSelector && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowProductSelector(false)}
        >
          <div
            className="w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl md:max-w-4xl lg:max-w-6xl bg-white sm:border border-slate-200 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/90 shrink-0">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-800 shrink-0" />
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                    Select Beverages & Crates
                  </h3>
                  {totalCartQty > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold shrink-0">
                      {totalCartQty} cs in cart
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  Stock source: <span className="font-semibold text-slate-800">{selectedStockLabel}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProductSelector(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer shrink-0"
                aria-label="Close beverage selection"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filters + beverage list share one body, so on a short screen they scroll together and the list is never squeezed out */}
            <div className="hh-picker__body">
            {/* Search & Category-Wise Filter Bar */}
            <div className="hh-picker__filters px-3 sm:px-4 py-2.5 border-b border-slate-200 space-y-2 bg-white shrink-0">
              {customerName.trim() && (() => {
                const cust = (customers || []).find((c) => c.name === customerName);
                const beatName = (cust && (beatOfCustomer(cust, beats)?.name || cust.city)) || '';
                let due = 0;
                try { due = Math.max(0, getCustomerLedger(customerName, customerPhone).rawBalance); } catch { /* ignore */ }
                return (
                  <div className="hh-partycard">
                    <span className="hh-partycard__main">
                      <span className="hh-partycard__name">{customerName}</span>
                      <span className="hh-partycard__sub">
                        {beatName && <>{t('sell.beat')}: {beatName} · </>}
                        <span className={due > 0 ? 'hh-partycard__due' : ''}>{t('sell.currentDue')}: ₹{money(due)}</span>
                      </span>
                    </span>
                    <button type="button" className="hh-linkbtn hh-linkbtn--primary" onClick={() => setShowProductSelector(false)}>{t('sell.change')}</button>
                  </div>
                );
              })()}

              {/* Row 1: Search + Stock toggle side-by-side (never collides) */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    enterKeyHint="search"
                    placeholder="Search name, size or pack..."
                    value={beverageSearch}
                    onChange={(e) => setBeverageSearch(e.target.value)}
                    className="w-full min-h-[42px] pl-9 pr-8 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 bg-white"
                  />
                  {beverageSearch && (
                    <button
                      type="button"
                      onClick={() => setBeverageSearch('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  id="btn-toggle-stock-filter"
                  onClick={() => setInStockOnly((prev) => !prev)}
                  className={`min-h-[42px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border whitespace-nowrap ${
                    inStockOnly
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                  title={inStockOnly ? `Showing items available in ${selectedStockLabel}. Click to show all catalog.` : `Showing all products. Click to show only items available in ${selectedStockLabel}.`}
                >
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <span>{inStockOnly ? `In Stock (${inStockCount})` : `All (${products.length})`}</span>
                </button>
              </div>

              {/* Row 2: Clean Category-Wise Tabs (swipeable, no scrollbar) */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Product categories">
                {categories.map((cat, idx) => {
                  const count = cat === 'all' ? baseFilteredProducts.length : (categoryCounts.get(cat) || 0);
                  if (cat !== 'all' && count === 0 && selectedCategory !== cat) return null;
                  const label = cat === 'all' ? 'All' : (CATS as Record<string, { name: string }>)[cat]?.name || cat;
                  const active = selectedCategory === cat;
                  return (
                    <button
                      key={cat || `cat_${idx}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedCategory(cat)}
                      className={`min-h-[38px] px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors shrink-0 border ${
                        active
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {label} <span className={`tabular-nums ${active ? 'text-emerald-100' : 'text-slate-400'}`}>({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Row 3: Compact Pack + Size Dropdowns (zero horizontal clipping or scrollbar on 360px phones) */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <select
                    aria-label="Filter by packaging"
                    value={selectedPackFilter}
                    onChange={(e) => setSelectedPackFilter(e.target.value as 'all' | 'can' | 'pet' | 'glass' | 'tetra')}
                    className={`w-full min-h-[38px] appearance-none pl-3 pr-8 rounded-xl border text-xs font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
                      selectedPackFilter !== 'all'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-950'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="all">Pack: All types</option>
                    <option value="pet">PET Bottle</option>
                    <option value="can">Can / Tin</option>
                    <option value="glass">Glass RGB</option>
                    <option value="tetra">Tetra / Pouch</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <div className="relative">
                  <select
                    aria-label={t('sell.sizeFilter')}
                    value={selectedSize}
                    onChange={(e) => setSelectedSize(e.target.value)}
                    className={`w-full min-h-[38px] appearance-none pl-3 pr-8 rounded-xl border text-xs font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
                      selectedSize !== 'all'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-950'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="all">Size: {t('sell.sizeAll')}</option>
                    {sizeOptions.map(({ id, label }) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                    <option value="soda">{t('sell.sizeSoda')}</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {(selectedCategory !== 'all' || selectedPackFilter !== 'all' || selectedSize !== 'all' || beverageSearch.trim() !== '') && (
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                  <span className="tabular-nums">Showing {filteredProducts.length} beverage{filteredProducts.length === 1 ? '' : 's'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('all');
                      setSelectedPackFilter('all');
                      setSelectedSize('all');
                      setBeverageSearch('');
                    }}
                    className="font-bold text-emerald-800 hover:underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>

            {/* Category-Wise Product List + Live Bill Panel */}
            <div className="hh-picker__lists flex-1 min-h-0 flex">
            <div className="hh-picker__list flex-1 min-w-0 overflow-y-auto p-3 sm:p-4 bg-slate-50/70 space-y-5">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-14 px-4 text-slate-500 text-sm space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">
                      {inStockOnly
                        ? `No beverages available for these filters in ${selectedStockLabel}`
                        : 'No beverages match your filters'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      {inStockOnly
                        ? 'Try showing all catalog items or clearing active filters.'
                        : 'Try clearing search, pack, or size filters.'}
                    </p>
                  </div>
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
                        className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                    {inStockOnly && (
                      <button
                        type="button"
                        onClick={() => setInStockOnly(false)}
                        className="px-3.5 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold cursor-pointer"
                      >
                        Show All Catalog ({products.length})
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                categorySections.map((section) => (
                  <section key={section.key} className="space-y-2">
                    {/* Sticky Category Section Heading */}
                    <div className="sticky top-0 z-10 flex items-center justify-between py-1.5 px-1 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/80">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                        {section.label}
                      </h4>
                      <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                        {section.items.length} SKU{section.items.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {section.items.map((prod, idx) => {
                        const available = getProductStock(prod.id);
                        const inCartQty = selectedItems[prod.id] || 0;
                        const defaultRate = getProductDefaultPrice(prod);
                        const customRate = customRates[prod.id];
                        const currentRate = customRate !== undefined ? customRate : defaultRate;
                        const isCustom = customRate !== undefined && customRate !== defaultRate;

                        const sTheme = sizeTheme(prod.volume, prod.name);
                        const pTheme = packTheme(prod.pack, prod.name);

                        // Active Promo
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

                        // Check if scheme applied in cart
                        const cartLine = lineItems.find((li) => li.productId === prod.id);
                        const comp = cartLine || (inCartQty > 0 ? computeLine(prod, 'Retail', inCartQty, activePromo, currentRate, 0) : null);
                        const itemGross = cartLine ? cartLine.gross : (comp ? comp.gross : inCartQty * currentRate);

                        return (
                          <div
                            key={prod.id !== undefined ? `prod_${prod.id}` : `prod_idx_${idx}`}
                            onClick={() => openQuickEntry(prod)}
                            style={{ borderLeftWidth: 5, borderLeftColor: sTheme.hex }}
                            className={`rounded-2xl border p-3 transition-colors flex flex-col gap-2 cursor-pointer ${
                              inCartQty > 0
                                ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-600/15'
                                : 'bg-white border-slate-200 hover:border-emerald-300'
                            }`}
                          >
                            {/* Top Row: PackIcon + Clean Identity + Right Quick Entry / Stepper */}
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <PackIcon pack={prod.pack} name={prod.name} className="mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <div className="font-extrabold text-slate-900 text-sm leading-snug break-words">
                                    {prod.name}
                                    {(nameCounts.get(prod.name.trim().toLowerCase()) || 0) > 1 && (
                                      <span className="ml-1.5 text-[10px] font-bold text-amber-800">
                                        (Check size/pack)
                                      </span>
                                    )}
                                  </div>

                                  {/* Clean unboxed typographic metadata (no pill clutter) */}
                                  <div className="mt-1 text-xs text-slate-600 tabular-nums leading-relaxed">
                                    {sTheme.label && (
                                      <span className="font-extrabold" style={{ color: sTheme.hex }}>
                                        {sTheme.label}
                                      </span>
                                    )}
                                    {pTheme.label && (
                                      <span className={`font-bold ${packTextColor(prod.pack, prod.name)}`}>
                                        {sTheme.label ? ' · ' : ''}{pTheme.label}
                                      </span>
                                    )}
                                  {prod.unitsPerCrate ? (
                                    <span> · {prod.unitsPerCrate} pcs</span>
                                  ) : null}
                                  <span> · </span>
                                  <span
                                    className={`font-bold ${
                                      available > 0
                                        ? 'text-emerald-700'
                                        : 'text-rose-600'
                                    }`}
                                  >
                                    {stockSource.startsWith('trip_')
                                      ? `${available} on van`
                                      : available > 0
                                        ? `${available} in stock`
                                        : '0 in stock'}
                                  </span>
                                </div>

                                {/* Price & Scheme summary */}
                                <div className="mt-1 flex items-center gap-1.5 flex-wrap text-xs">
                                  <span className={`font-black tabular-nums ${currentRate === 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                                    {currentRate === 0 ? '₹0 Free' : `₹${money(currentRate)}/cs`}
                                  </span>
                                  {isCustom && currentRate > 0 && (
                                    <span className="text-[11px] font-bold text-amber-700">· Custom rate</span>
                                  )}
                                  {promoLabel && (
                                    <span className="text-[11px] font-bold text-amber-700 truncate max-w-[170px]">
                                      · {promoLabel}
                                    </span>
                                  )}
                                </div>
                                </div>
                              </div>

                              {/* Right Action: + Add (1-tap) OR Compact Stepper + Qty/Rate Edit */}
                              <div className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {inCartQty === 0 ? (
                                  <button
                                    type="button"
                                    id={`btn-add-beverage-${prod.id}`}
                                    onClick={() => setItemQty(prod.id, 1)}
                                    className="min-h-[42px] px-3.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-95 text-white text-xs font-black flex items-center gap-1 cursor-pointer shadow-2xs"
                                    title="Tap to add 1 case, or tap product name to enter exact qty / rate"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>Add</span>
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <div className="flex items-center rounded-xl border border-emerald-600 bg-white overflow-hidden shadow-2xs">
                                      <button
                                        type="button"
                                        onClick={() => setItemQty(prod.id, inCartQty - 1)}
                                        aria-label={`Decrease ${prod.name}`}
                                        className="w-9 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openQuickEntry(prod)}
                                        className="min-w-[40px] h-10 px-1.5 font-black text-sm text-emerald-900 tabular-nums hover:bg-emerald-50 cursor-pointer"
                                        title="Tap to type exact quantity, rate, or scheme"
                                      >
                                        {inCartQty}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setItemQty(prod.id, inCartQty + 1)}
                                        aria-label={`Increase ${prod.name}`}
                                        className="w-9 h-10 flex items-center justify-center bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Active Line Summary & Edit Rate/Scheme Bar (only when in cart or scheme active) */}
                            {inCartQty > 0 && (
                              <div
                                className="pt-2 border-t border-emerald-200/70 flex items-center justify-between gap-2 text-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => openQuickEntry(prod)}
                                    className="inline-flex items-center gap-1 font-bold text-emerald-900 hover:underline cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3 shrink-0" />
                                    <span>Edit qty / rate</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSchemeModalProduct(prod)}
                                    className="inline-flex items-center gap-1 font-bold text-amber-800 hover:underline cursor-pointer"
                                  >
                                    <Gift className="w-3 h-3 shrink-0" />
                                    <span>{promoLabel ? 'Change scheme' : 'Scheme'}</span>
                                  </button>
                                </div>
                                <span className="font-black text-emerald-950 font-mono tabular-nums shrink-0">
                                  ₹{money(itemGross)}
                                  {comp && comp.freeQty > 0 ? ` (+${comp.freeQty} free)` : ''}
                                </span>
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
            {/* Live bill panel (desktop): what is on the bill right now */}
            <aside className="hh-cartpane" aria-label={t('sell.yourBill')}>
              <h3 className="hh-card__title">{t('sell.yourBill')}</h3>
              {lineItems.length === 0 ? (
                <p className="hh-empty">{t('sell.emptyBill')}</p>
              ) : (
                <ul className="hh-cartpane__list">
                  {lineItems.map((it) => (
                    <li key={String(it.key ?? it.productId)} className="hh-cartpane__row">
                      <span className="hh-cartpane__name">{it.productName}</span>
                      <span className="hh-cartpane__qty">× {it.qty}</span>
                      <span className="hh-cartpane__amt">₹{money(it.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="hh-cartpane__total">
                <span className="hh-label">{t('sell.total')}</span>
                <span className="hh-actionbar__total">₹{money(grandTotal)}</span>
              </div>
            </aside>
            </div>
            </div>

            {/* Footer: item count, total, GST note, free-case badge, Cancel + Review & Finalise (never hidden) */}
            <ActionBar
              flow
              cancelLabel={t('sell.cancel')}
              onCancel={() => {
                handleResetSale();
              }}
              primaryLabel={t('sell.review')}
              onPrimary={() => {
                setShowProductSelector(false);
                setShowCartReview(true);
              }}
              primaryDisabled={totalCartQty === 0}
            >
              <div className="hh-actionbar__summary">
                <div>
                  <p className="hh-label">{t('sell.itemsCount', { n: totalCartQty })}</p>
                  <p className="hh-actionbar__total">₹{money(grandTotal)}</p>
                </div>
                <div className="hh-actionbar__badges">
                  {totalTax > 0 && <span className="hh-actionbar__gst">{t('sell.gstIncluded')}</span>}
                  {totalFreeQty > 0 && <span className="hh-pill hh-pill--received">{t('sell.freeCases', { n: totalFreeQty })}</span>}
                </div>
              </div>
            </ActionBar>
          </div>
        </div>
      )}

      {/* QUICK ENTRY POPUP: Quantity, Rate & Scheme for mobile & desktop */}
      {quickEntryProduct && (() => {
        const prod = quickEntryProduct;
        const available = getProductStock(prod.id);
        const sTheme = sizeTheme(prod.volume, prod.name);
        const pTheme = packTheme(prod.pack, prod.name);
        const defaultRate = getProductDefaultPrice(prod);
        const parsedQty = Math.max(0, parseInt(quickEntryQty, 10) || 0);
        const parsedRate = quickEntryRate.trim() === '' ? 0 : Math.max(0, parseFloat(quickEntryRate) || 0);
        const isCustomRate = parsedRate !== defaultRate;

        const userChoice = customSchemes[prod.id];
        let activePromo: Promotion | null = null;
        if (userChoice !== undefined) {
          activePromo = userChoice;
        } else if (schemeMode !== 'none' && billingSettings?.schemesEnabled !== false && billingSettings?.autoApplyPromotions !== false) {
          activePromo = activePromoFor ? activePromoFor(prod.id) : null;
        }
        const promoLabel = activePromo ? schemeLabel(activePromo, products) : null;
        const previewComp = parsedQty > 0 ? computeLine(prod, 'Retail', parsedQty, activePromo, parsedRate, 0) : null;

        const commitPopup = (e?: React.FormEvent) => {
          e?.preventDefault();
          if (parsedRate !== (customRates[prod.id] !== undefined ? customRates[prod.id] : defaultRate)) {
            handleSetProductRate(prod.id, parsedRate);
          }
          setItemQty(prod.id, parsedQty);
          setQuickEntryProduct(null);
        };

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Enter quantity for ${prod.name}`}
            className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setQuickEntryProduct(null)}
          >
            <form
              onSubmit={commitPopup}
              onClick={(e) => e.stopPropagation()}
              style={{ borderTopWidth: 4, borderTopColor: sTheme.hex }}
              className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-4 sm:p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <PackIcon pack={prod.pack} name={prod.name} className="mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-slate-900 leading-snug">{prod.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {sTheme.label && <span className="font-bold" style={{ color: sTheme.hex }}>{sTheme.label}</span>}
                      {pTheme.label && <span className={`font-bold ${packTextColor(prod.pack, prod.name)}`}>{sTheme.label ? ' · ' : ''}{pTheme.label}</span>}
                      {prod.unitsPerCrate ? ` · ${prod.unitsPerCrate} pcs` : ''}
                      {' · '}
                      <span className={available > 0 ? 'font-bold text-emerald-700' : 'font-bold text-rose-600'}>
                        {stockSource.startsWith('trip_') ? `${available} on van` : `${available} in stock`}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickEntryProduct(null)}
                  aria-label="Close entry popup"
                  className="size-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quantity Stepper + Quick Accelerators */}
              <div className="space-y-2">
                <label htmlFor="popup-qty-input" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Cases / Crates
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickEntryQty(String(Math.max(0, parsedQty - 1)))}
                    aria-label="Decrease quantity"
                    className="w-12 h-12 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-800 cursor-pointer shrink-0"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <input
                    id="popup-qty-input"
                    ref={quickEntryQtyRef}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={quickEntryQty}
                    onChange={(e) => setQuickEntryQty(e.target.value)}
                    className="flex-1 min-w-0 h-12 text-center text-xl font-black text-slate-900 rounded-xl border-2 border-emerald-600/50 focus:border-emerald-700 focus:outline-none tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setQuickEntryQty(String(parsedQty + 1))}
                    aria-label="Increase quantity"
                    className="w-12 h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-1.5 pt-0.5">
                  {[1, 2, 5, 10, 20].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setQuickEntryQty(String(parsedQty + inc))}
                      className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-xs font-black text-slate-800 cursor-pointer tabular-nums"
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rate & Scheme Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor={`rate-input-${prod.id}`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Rate (₹ / cs)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuickEntryRate('0')}
                        className={`text-[11px] font-bold cursor-pointer ${parsedRate === 0 ? 'text-emerald-700 underline' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        ₹0 Free
                      </button>
                      {isCustomRate && (
                        <button
                          type="button"
                          onClick={() => setQuickEntryRate(String(defaultRate))}
                          className="text-[11px] font-bold text-amber-700 hover:underline cursor-pointer"
                        >
                          Reset (₹{defaultRate})
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    id={`rate-input-${prod.id}`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={quickEntryRate}
                    onChange={(e) => setQuickEntryRate(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm font-black text-slate-900 tabular-nums focus:outline-none focus:border-emerald-700"
                  />
                </div>

                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Scheme / Promo
                  </span>
                  <button
                    type="button"
                    onClick={() => setSchemeModalProduct(prod)}
                    className={`w-full min-h-[42px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
                      activePromo
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                      <Gift className="w-4 h-4 shrink-0" />
                      <span className="truncate">{promoLabel || 'No scheme'}</span>
                    </span>
                    <span className="text-[11px] underline shrink-0">Change</span>
                  </button>
                </div>
              </div>

              {/* Preview & Actions */}
              <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                <span className="text-slate-600 font-semibold tabular-nums">
                  {parsedQty} cs × ₹{parsedRate}
                  {previewComp && previewComp.freeQty > 0 ? ` (+${previewComp.freeQty} free)` : ''}
                </span>
                <span className="text-sm font-black text-slate-900 font-mono tabular-nums">
                  ₹{money(previewComp ? previewComp.gross : parsedQty * parsedRate)}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                {(selectedItems[prod.id] || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setItemQty(prod.id, 0);
                      setQuickEntryProduct(null);
                    }}
                    className="min-h-[46px] px-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 cursor-pointer shrink-0"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setQuickEntryProduct(null)}
                  className="min-h-[46px] px-4 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[46px] rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-black cursor-pointer"
                >
                  {parsedQty === 0 ? 'Remove Item' : (selectedItems[prod.id] || 0) > 0 ? 'Update Item' : `Add ${parsedQty} Case${parsedQty === 1 ? '' : 's'}`}
                </button>
              </div>
            </form>
          </div>
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

      {/* MODAL: Cart Review & Finalize (Mobile-First Single-Scroll + Tablet 2-Column Split) */}
      {showCartReview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cart Review & Finalize"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowCartReview(false)}
        >
          <div
            className="w-full h-[100dvh] sm:h-auto sm:max-h-[92dvh] sm:max-w-3xl lg:max-w-5xl bg-white sm:border border-slate-200 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Slim Sticky Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/90 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Cart Review & Finalize
                  </h3>
                  <span className="text-xs font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md tabular-nums">
                    {totalCartQty} cs{totalFreeQty > 0 ? ` · ${totalFreeQty} free` : ''}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  <span className="font-semibold text-slate-800">{customerName || 'Apt / Walk-in sale'}</span> · {selectedStockLabel}
                </p>
              </div>
              <button
                aria-label="Close cart review"
                type="button"
                onClick={() => setShowCartReview(false)}
                className="size-10 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Unified Responsive Body:
                - Mobile (< md): single smooth scroll container so items are completely visible (never squished!)
                - Tablet / Desktop (>= md): side-by-side 2-column grid (Items on left, Summary + Payment on right) */}
            <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:grid md:grid-cols-[1.25fr_1fr] bg-slate-50/60">
              {/* LEFT / TOP: Review Items List */}
              <div className="p-3 sm:p-4 md:overflow-y-auto md:h-full space-y-2.5">
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 tabular-nums">
                    Review Items ({lineItems.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCartReview(false);
                      setShowProductSelector(true);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:underline cursor-pointer py-1 px-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add more items</span>
                  </button>
                </div>

                {lineItems.length === 0 ? (
                  <div className="py-12 px-4 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-3">
                    <p className="text-slate-500 text-sm font-semibold">
                      Your cart is empty. Add beverages to review.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCartReview(false);
                        setShowProductSelector(true);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-xs font-bold cursor-pointer"
                    >
                      + Select Beverages
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {lineItems.map((item, idx) => {
                      const prod = products.find((p) => p.id === item.productId);
                      const sTheme = sizeTheme(prod?.volume, item.productName);
                      const pTheme = packTheme(prod?.pack, item.productName);
                      const cost = Number(prod?.effectiveCost ?? prod?.cost) || 0;
                      const cases = Number(item.qty) || 0;
                      const perCase = cases > 0 ? (Number(item.taxable) || 0) / cases : 0;
                      const profit = cost > 0 && cases > 0 && !item.isFree && !item.isBundleFreeItem ? perCase - cost : null;

                      return (
                        <div
                          key={item.key || `cart_item_${item.productId}_${idx}`}
                          style={{ borderLeftWidth: 5, borderLeftColor: sTheme.hex }}
                          className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2.5 shadow-2xs"
                        >
                          {/* Top Row: PackIcon + Product Name + Line Total */}
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <PackIcon pack={prod?.pack} name={item.productName} className="mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <div className="font-extrabold text-slate-900 text-sm sm:text-[15px] leading-snug break-words">
                                  {item.productName}
                                </div>
                                <div className="mt-1 text-xs text-slate-600 tabular-nums leading-relaxed">
                                  {sTheme.label && (
                                    <span className="font-extrabold" style={{ color: sTheme.hex }}>
                                      {sTheme.label}
                                    </span>
                                  )}
                                  {pTheme.label && (
                                    <span className={`font-bold ${packTextColor(prod?.pack, item.productName)}`}>
                                      {sTheme.label ? ' · ' : ''}{pTheme.label}
                                    </span>
                                  )}
                                  {prod?.unitsPerCrate ? <span> · {prod.unitsPerCrate} pcs</span> : null}
                                  <span> · ₹{money(item.rate)}/cs</span>
                                  {item.rate === 0 && <span className="font-bold text-emerald-700"> (Free)</span>}
                                  {item.cgstRate > 0 && <span> · GST {item.cgstRate * 2}%</span>}
                                </div>

                              {(item.freeQty > 0 || item.discount > 0 || profit !== null) && (
                                <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] tabular-nums">
                                  {item.freeQty > 0 && (
                                    <span className="font-bold text-emerald-700">
                                      {item.chargeableQty} paid + {item.freeQty} free incl.
                                    </span>
                                  )}
                                  {item.discount > 0 && (
                                    <span className="font-bold text-emerald-700">
                                      Save ₹{money(item.discount)}
                                    </span>
                                  )}
                                  {profit !== null && (
                                    <span className={profit >= 0 ? 'text-emerald-700' : 'font-bold text-rose-700'}>
                                      {profit >= 0
                                        ? `Margin ₹${money(profit)}/cs`
                                        : `Below cost (−₹${money(-profit)}/cs)`}
                                    </span>
                                  )}
                                </div>
                              )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-sm sm:text-base font-black text-slate-900 font-mono tabular-nums">
                                ₹{money(item.gross)}
                              </div>
                              <div className="text-[11px] text-slate-500 font-semibold tabular-nums">
                                {item.qty} crate{item.qty === 1 ? '' : 's'}
                              </div>
                            </div>
                          </div>

                          {/* Bottom Row: Scheme + Edit Rate + Qty Stepper + Remove */}
                          {!item.isBundleFreeItem && (
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                {item.appliedPromo ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                                    <Gift className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate max-w-[130px]">{item.promoLabel || 'Scheme'}</span>
                                    <button
                                      type="button"
                                      onClick={() => setCustomSchemes((prev) => ({ ...prev, [item.productId]: null }))}
                                      className="text-rose-600 hover:text-rose-800 font-black cursor-pointer pl-0.5"
                                      title="Clear scheme"
                                      aria-label="Clear scheme"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (prod) setSchemeModalProduct(prod);
                                    }}
                                    className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                                  >
                                    <Gift className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Scheme</span>
                                  </button>
                                )}

                                {prod && (
                                  <button
                                    type="button"
                                    onClick={() => openQuickEntry(prod)}
                                    className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                                    title="Edit quantity or rate"
                                  >
                                    <Pencil className="w-3 h-3 text-slate-500" />
                                    <span>Rate</span>
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50 overflow-hidden">
                                  <button
                                    aria-label={`Decrease ${item.productName}`}
                                    type="button"
                                    onClick={() => setItemQty(item.productId, item.qty - 1)}
                                    className="w-9 h-9 flex items-center justify-center text-slate-700 hover:bg-slate-200 cursor-pointer"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => prod && openQuickEntry(prod)}
                                    className="min-w-[38px] h-9 px-1.5 font-mono font-black text-sm text-slate-900 bg-white border-x border-slate-200 tabular-nums cursor-pointer"
                                    title="Tap to type exact quantity"
                                  >
                                    {item.qty}
                                  </button>
                                  <button
                                    aria-label={`Increase ${item.productName}`}
                                    type="button"
                                    onClick={() => setItemQty(item.productId, item.qty + 1)}
                                    className="w-9 h-9 flex items-center justify-center bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setItemQty(item.productId, 0)}
                                  aria-label={`Remove ${item.productName}`}
                                  title="Remove item"
                                  className="w-9 h-9 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RIGHT / BOTTOM: Bill Totals & Payment Collection */}
              <div className="p-3 sm:p-4 md:border-l md:border-slate-200 md:overflow-y-auto md:h-full bg-white md:bg-slate-50/40 space-y-3 border-t md:border-t-0 border-slate-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">
                  Summary & Payment
                </h4>

                {/* Compact Totals Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 md:bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block">Taxable Value</span>
                    <span className="font-bold font-mono text-slate-900 text-sm tabular-nums">₹{money(taxableAmount)}</span>
                  </div>
                  <div className="bg-slate-50 md:bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block">Taxes (GST Incl.)</span>
                    <span className="font-bold font-mono text-slate-900 text-sm tabular-nums">₹{money(totalTax)}</span>
                  </div>
                  <div className="bg-slate-50 md:bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block">Total Crates</span>
                    <span className="font-bold font-mono text-slate-900 text-sm tabular-nums">
                      {totalCartQty} cs{totalFreeQty > 0 ? ` (${totalFreeQty} free)` : ''}
                    </span>
                  </div>
                  <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-emerald-800 block font-semibold">Grand Total</span>
                    <span className="font-black font-mono text-emerald-950 text-sm sm:text-base tabular-nums">₹{money(grandTotal)}</span>
                  </div>
                </div>

                {billType === 'tax_invoice' && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                    <span>GST tax is inclusive in the bill amount · No extra surcharge added</span>
                  </div>
                )}

                {/* Payment Details */}
                <div className="pt-2 border-t border-slate-200 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                      Payment Mode
                    </label>
                    <select
                      value={paymentMode}
                      onChange={(e) => {
                        const nextMode = e.target.value as PaymentMode;
                        setPaymentMode(nextMode);
                        if (nextMode === 'credit') {
                          setPaymentAmount('0');
                        }
                      }}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                      <option value="credit">Credit (Due)</option>
                      <option value="bank">Bank Transfer (NEFT/RTGS)</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        Amount Collected
                      </label>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentAmount(String(grandTotal));
                            if (paymentMode === 'credit') setPaymentMode('cash');
                          }}
                          className="text-emerald-700 font-bold hover:underline cursor-pointer"
                        >
                          Full
                        </button>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentAmount('0');
                            setPaymentMode('credit');
                          }}
                          className="text-amber-700 font-bold hover:underline cursor-pointer"
                        >
                          Credit (0)
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={paymentAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPaymentAmount(val);
                        const num = Number(val);
                        if (val.trim() !== '' && num > 0 && paymentMode === 'credit') {
                          setPaymentMode('cash');
                        }
                      }}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold font-mono focus:outline-none focus:ring-2 focus:ring-emerald-700/20 tabular-nums"
                    />
                    <p
                      className={`mt-1.5 text-xs font-semibold ${
                        collectedAmountPreview <= 0 || balanceDuePreview > 0.005
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {collectedAmountPreview <= 0
                        ? `Defaults to ₹0 (Credit) · Due ₹${money(grandTotal)}`
                        : balanceDuePreview > 0.005
                          ? `Partial payment · Credit due ₹${money(balanceDuePreview)}`
                          : 'Paid in full · Due ₹0.00'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Slim Pinned Action Bar (always reachable on mobile & tablet) */}
            <div className="px-3 sm:px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowCartReview(false);
                  setShowProductSelector(true);
                }}
                className="min-h-[44px] px-3.5 sm:px-4 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0 whitespace-nowrap"
              >
                + Add More
              </button>

              <button
                type="button"
                id="btn-finalize-save-bill"
                onClick={handleSaveBill}
                disabled={lineItems.length === 0}
                className="flex-1 sm:flex-initial min-h-[44px] inline-flex items-center justify-center gap-2 px-4 sm:px-6 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-95 text-white text-sm font-black shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span className="truncate">Finalize · ₹{money(grandTotal)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add New Customer */}
      {showNewCustomerModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowNewCustomerModal(false)}
        >
          <div
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">New Customer / Shop</h3>
              <button aria-label="Close"
                type="button"
                onClick={() => setShowNewCustomerModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Customer / Shop Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Northside Traders"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  GSTIN (optional)
                </label>
                <input autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                  type="text"
                  placeholder="e.g. 27ABCDE1234F1Z5"
                  value={newCustGstin}
                  onChange={(e) => setNewCustGstin(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                />
              </div>

              {/* Route / Beat Selection (Beats configured in Settings) */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Route / Beat
                </label>

                <select
                  value={newCustBeat}
                  onChange={(e) => setNewCustBeat(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20 bg-white cursor-pointer"
                >
                  <option value="">-- Select Beat / Route --</option>
                  {activeBeats.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>

                {/* 1-Tap Quick Beat Chips */}
                {activeBeats.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {activeBeats.slice(0, 6).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setNewCustBeat(b.name)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                          newCustBeat.toLowerCase() === b.name.toLowerCase()
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Address (optional)
                </label>
                <input
                  type="text"
                  placeholder="Shop location / route"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewCustomer}
                disabled={!newCustName.trim()}
                className="px-5 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                Save & Select Customer
              </button>
            </div>
          </div>
        </div>
      )}

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
