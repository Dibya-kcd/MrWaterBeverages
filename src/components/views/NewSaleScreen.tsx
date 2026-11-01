import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { notify } from "../../utils/toast";
import { SizeChip } from "../common/SizeChip";
import { sizeTheme } from "../../utils/sizeColor";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileText,
  Gift,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Bill, BillItem, Customer, PaymentMode, Product, Promotion, PriceType } from '../../types';
import { applyCartSchemes, computeLine, money, schemeLabel } from '../../utils/billing';
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
  const {
    products,
    bills,
    warehouses,
    defaultWarehouse,
    trips,
    addTrip,
    getVehicleStock,
    customers,
    existingCustomers,
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

  // Selected Cart Items: productId -> qty
  const [selectedItems, setSelectedItems] = useState<Record<number, number>>({});
  // Track chronological order of additions for 'SAME_AS_LAST_ADDED' scheme rule
  const [itemOrder, setItemOrder] = useState<number[]>([]);

  // Custom price per case per product
  const [customRates, setCustomRates] = useState<Record<number, number>>({});

  // Local string drafts for rate input while typing
  const [rateInputDrafts, setRateInputDrafts] = useState<Record<number, string>>({});

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

  // Scheme selector modal
  const [schemeModalProduct, setSchemeModalProduct] = useState<Product | null>(null);

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

  // Van Trip modal state (for starting a new delivery van dispatch)
  const [showNewTripModal, setShowNewTripModal] = useState<boolean>(false);
  const [newTripVehicle, setNewTripVehicle] = useState('Delivery Van #1');
  const [newTripSalesman, setNewTripSalesman] = useState('Van Salesman');
  const [newTripWhId, setNewTripWhId] = useState<string>(defaultWarehouseId);

  // Search inside "Select Beverages & Crates" modal
  const [beverageSearch, setBeverageSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Success message after save
  const [savedBill, setSavedBill] = useState<Bill | null>(null);

  // All available customers combined
  const customerOptions = useMemo(() => {
    const list: { id: string; name: string; phone?: string; gstin?: string }[] = [];
    const seenNames = new Set<string>();

    (customers || []).forEach((c, idx) => {
      const trimmed = (c.name || '').trim();
      if (trimmed && !seenNames.has(trimmed.toLowerCase())) {
        seenNames.add(trimmed.toLowerCase());
        const custId = c.id || `cust_${idx}_${encodeURIComponent(trimmed.toLowerCase())}`;
        list.push({ id: custId, name: trimmed, phone: c.phone, gstin: c.gstin });
      }
    });

    (existingCustomers || []).forEach((c, idx) => {
      const trimmed = (c.name || '').trim();
      if (trimmed && !seenNames.has(trimmed.toLowerCase())) {
        seenNames.add(trimmed.toLowerCase());
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

  // Quick dispatch new delivery van trip
  const handleSaveNewTrip = () => {
    if (!newTripVehicle.trim()) return;
    const createdTrip = addTrip(
      newTripVehicle.trim(),
      saleDate,
      {},
      newTripWhId || defaultWarehouseId,
      [],
      newTripSalesman.trim() || undefined
    );
    setShowNewTripModal(false);
    setStockSource(`trip_${createdTrip.id}`);
    setNewTripVehicle(`Delivery Van #${trips.length + 2}`);
    setNewTripSalesman('Van Salesman');
    checkAndPromptProducts(customerName, `trip_${createdTrip.id}`);
  };

  // Quick save new customer
  const handleSaveNewCustomer = () => {
    if (!newCustName.trim()) return;
    const created = addCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      gstin: newCustGstin.trim().toUpperCase() || undefined,
      address: newCustAddress.trim() || undefined,
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

  // Filtered products inside "Select Beverages & Crates"
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !beverageSearch ||
        p.name.toLowerCase().includes(beverageSearch.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(beverageSearch.toLowerCase()));
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      if (!matchesSearch || !matchesCategory) return false;

      // Filter to only show products available in the selected warehouse or vehicle
      if (inStockOnly) {
        const available = getProductStock(p.id);
        const inCart = (selectedItems[p.id] || 0) > 0;
        return available > 0 || inCart;
      }
      return true;
    });
  }, [products, beverageSearch, selectedCategory, inStockOnly, getProductStock, selectedItems]);

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

    const paidNum = paymentAmount === '' ? grandTotal : Math.max(0, Number(paymentAmount) || 0);

    const billId = finalizeBill(
      paidNum,
      tripToAssign,
      0, // additionalDiscount
      saleDate,
      paymentMode,
      paymentNote || undefined,
      saleDate,
      {
        supplyType,
        customerGstin: customerGstin.trim() ? customerGstin.trim().toUpperCase() : undefined,
        isRetrospective: false,
        invoiceType: billType === 'tax_invoice' ? 'tax_invoice' : 'bill_of_supply',
        isGstInvoice: isGst,
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
    <div className="w-full max-w-none lg:max-w-4xl mx-auto space-y-4 pb-16 min-w-0 overflow-x-hidden">
      {/* Top Header with Responsive Floating Cart Icon */}
      <div className="flex items-center justify-between gap-3 sticky top-0 bg-[#f8fafc]/95 backdrop-blur-md z-30 py-2.5 -my-2 border-b border-slate-200/60">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2.5 text-left group cursor-pointer min-w-0"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700 group-hover:text-slate-900 group-hover:-translate-x-0.5 transition-transform shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 leading-tight">
              New sale
            </h1>
          </div>
        </button>

        {/* Floating Cart Button with Live Number & Subtotal */}
        <button
          type="button"
          id="btn-floating-cart"
          onClick={() => setShowCartReview(true)}
          className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer shrink-0 ${
            totalCartQty > 0
              ? 'bg-[#0d4a3a] text-white hover:bg-[#0a382c] shadow-emerald-950/20 active:scale-95'
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

      {/* Main Configuration Card — compliant with Image 2 */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* 1. CUSTOMER (Smart Responsive Predictive Search) */}
          <CustomerPredictiveSearch
            id="select-customer"
            label="CUSTOMER"
            placeholder="Search by name, mobile, customer ID, or email..."
            selectedCustomerId={selectedCustomerId}
            selectedCustomerName={customerName}
            selectedCustomerPhone={customerPhone}
            customers={customers}
            existingCustomers={existingCustomers}
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
                <option value="tax_invoice">Tax invoice (GST inclusive)</option>
                <option value="bill_of_supply">Bill of supply (non-GST)</option>
                <option value="estimate">Estimate / quotation</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
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
            {totalCartQty > 0 && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-700 text-white shadow-xs">
                {Object.keys(selectedItems).length} beverage(s) · {totalCartQty} cs
              </span>
            )}
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
            className="w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl md:max-w-4xl bg-white sm:border border-slate-200 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
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

            {/* Search & Category Filter Bar */}
            <div className="p-3 sm:p-3.5 border-b border-slate-200 space-y-2 bg-white shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search beverage by name, size, or category..."
                  value={beverageSearch}
                  onChange={(e) => setBeverageSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 bg-white"
                />
                {beverageSearch && (
                  <button
                    type="button"
                    onClick={() => setBeverageSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Category Filter Pills & Stock Filter Toggle */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 flex-1 min-w-0">
                  {categories.map((cat, idx) => (
                    <button
                      key={cat || `cat_${idx}`}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                        selectedCategory === cat
                          ? 'bg-[#0d4a3a] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {cat === 'all' ? 'All Beverages' : cat}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  id="btn-toggle-stock-filter"
                  onClick={() => setInStockOnly((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border ${
                    inStockOnly
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                  title={inStockOnly ? `Showing items available in ${selectedStockLabel}. Click to show all catalog.` : `Showing all products. Click to show only items available in ${selectedStockLabel}.`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>{inStockOnly ? `In Stock (${inStockCount})` : `All Catalog (${products.length})`}</span>
                </button>
              </div>
            </div>

            {/* Beverage Cards Grid (Smart Quantity Card, Custom Rate & Scheme Selector) */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-50/60">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-16 px-4 text-slate-500 text-sm space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">
                      {inStockOnly
                        ? `No beverages currently available in ${selectedStockLabel}`
                        : 'No beverages match your search'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      {inStockOnly
                        ? `This warehouse or vehicle currently has 0 stock for this filter. You can toggle to view all products or choose another warehouse/vehicle.`
                        : 'Try searching for another beverage name or selecting "All Beverages".'}
                    </p>
                  </div>
                  {inStockOnly && (
                    <button
                      type="button"
                      onClick={() => setInStockOnly(false)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#0d4a3a] text-white text-xs font-bold hover:bg-[#0a382c] cursor-pointer shadow-xs"
                    >
                      Show All Catalog ({products.length} products)
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
                  {filteredProducts.map((prod, idx) => {
                    const available = getProductStock(prod.id);
                    const inCartQty = selectedItems[prod.id] || 0;
                    const defaultRate = getProductDefaultPrice(prod);
                    const customRate = customRates[prod.id];
                    const currentRate = customRate !== undefined ? customRate : defaultRate;
                    const isCustom = customRate !== undefined && customRate !== defaultRate;

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

                    const draftVal = rateInputDrafts[prod.id];
                    const displayRateVal = draftVal !== undefined ? draftVal : (currentRate !== undefined ? String(currentRate) : '');

                    return (
                      <div
                        key={prod.id !== undefined ? `prod_${prod.id}` : `prod_idx_${idx}`}
                        onClick={() => setItemQty(prod.id, inCartQty + 1)}
                        className={`rounded-2xl border p-3 sm:p-3.5 transition-all flex flex-col justify-between gap-2.5 cursor-pointer select-none active:scale-[0.99] relative ${
                          inCartQty > 0
                            ? 'border-2 border-emerald-600 bg-emerald-50/40 ring-4 ring-emerald-600/15 shadow-md'
                            : 'bg-white border-slate-200/90 hover:border-emerald-300 hover:bg-slate-50/50 hover:shadow-2xs'
                        }`}
                        title="Touch anywhere to add 1 case to cart"
                        style={{ borderLeftWidth: 6, borderLeftColor: sizeTheme(prod.volume, prod.name).hex }}
                      >
                        <div className="space-y-2">
                          {/* Top Row: Beverage Name, Pack, Stock & Scheme */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug break-words">
                                  {prod.name}
                                </span>
                                {prod.category && (
                                  <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                                    {prod.category}
                                  </span>
                                )}
                                <SizeChip volume={prod.volume} pack={prod.pack} name={prod.name} />
                              </div>

                              {/* Stock status indicator */}
                              <div className="mt-1 flex items-center gap-1.5 text-xs">
                                {stockSource.startsWith('trip_') ? (
                                  <span
                                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                      available > 0
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/70'
                                        : 'bg-amber-50 text-amber-800 border border-amber-200/70'
                                    }`}
                                  >
                                    <Truck className="w-3.5 h-3.5 text-current shrink-0" />
                                    <span>{available > 0 ? `${available} cs on van` : '0 on van'}</span>
                                  </span>
                                ) : (
                                  <span
                                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                      available > 0
                                        ? 'bg-slate-100 text-slate-700'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200/70'
                                    }`}
                                  >
                                    <Package className="w-3.5 h-3.5 text-current shrink-0" />
                                    <span>{available > 0 ? `${available} in stock` : remainingStock(prod.id) < 0 ? `Oversold (${remainingStock(prod.id)} cs)` : 'Out of stock'}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Top Right Badges: In-Cart indicator & Scheme Button */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {inCartQty > 0 && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-700 text-white font-black text-xs shadow-xs animate-in zoom-in-75 duration-100 shrink-0">
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>{inCartQty} in cart</span>
                                </span>
                              )}

                              {/* Scheme Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSchemeModalProduct(prod);
                                }}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer shrink-0 ${
                                  activePromo
                                    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 shadow-2xs'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                                title="Apply or change promotion / scheme"
                              >
                                <Gift className={`w-3.5 h-3.5 ${activePromo ? 'text-amber-700' : 'text-slate-400'}`} />
                                <span className="max-w-[90px] sm:max-w-[120px] truncate text-[11px]">
                                  {promoLabel || 'Scheme'}
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* Scheme feedback banners */}
                          {comp && comp.freeQty > 0 && (
                            <div className="px-2.5 py-1 rounded-lg bg-emerald-100/80 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span className="truncate">+{comp.freeQty} free crate(s) awarded ({comp.chargeableQty} paid)</span>
                            </div>
                          )}
                          {comp && comp.discount > 0 && comp.freeQty === 0 && (
                            <div className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Scheme discount: −₹{money(comp.discount)}</span>
                            </div>
                          )}

                          {/* Rate Customization Bar: NO Retail label, Rate can be customized and set to 0 */}
                          <div
                            className="p-2 sm:p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 flex items-center justify-between gap-2 flex-wrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              <label
                                htmlFor={`rate-input-${prod.id}`}
                                className="text-[11px] font-black text-slate-600 uppercase tracking-wide shrink-0"
                              >
                                Rate:
                              </label>
                              <div className="relative flex items-center shrink-0">
                                <span className="absolute left-2 text-xs font-black text-slate-400 pointer-events-none">
                                  ₹
                                </span>
                                <input
                                  id={`rate-input-${prod.id}`}
                                  type="number" inputMode="numeric"
                                  step="any"
                                  min="0"
                                  value={displayRateVal}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setRateInputDrafts((prev) => ({ ...prev, [prod.id]: raw }));
                                    if (raw.trim() !== '') {
                                      const parsed = parseFloat(raw);
                                      if (!isNaN(parsed) && parsed >= 0) {
                                        handleSetProductRate(prod.id, parsed);
                                      }
                                    }
                                  }}
                                  onBlur={() => {
                                    const draft = rateInputDrafts[prod.id];
                                    if (draft !== undefined) {
                                      if (draft.trim() === '') {
                                        handleSetProductRate(prod.id, 0);
                                      } else {
                                        const parsed = parseFloat(draft);
                                        handleSetProductRate(prod.id, isNaN(parsed) || parsed < 0 ? 0 : parsed);
                                      }
                                      setRateInputDrafts((prev) => {
                                        const next = { ...prev };
                                        delete next[prod.id];
                                        return next;
                                      });
                                    }
                                  }}
                                  placeholder="0"
                                  className="w-20 sm:w-22 pl-5 pr-1.5 py-1 text-xs sm:text-sm font-black text-slate-900 bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 focus:border-emerald-700 tabular-nums shadow-2xs"
                                  title="Custom price per crate (can be 0 for samples/complimentary)"
                                />
                              </div>
                              <span className="text-[11px] text-slate-500 font-semibold shrink-0">/cs</span>

                              {/* Helper button to quickly make 0 */}
                              <button
                                type="button"
                                onClick={() => {
                                  handleSetProductRate(prod.id, 0);
                                  setRateInputDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[prod.id];
                                    return next;
                                  });
                                }}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer shrink-0 ${
                                  currentRate === 0
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                }`}
                                title="Set rate to ₹0 (Free sample or promotional gift)"
                              >
                                ₹0 Free
                              </button>

                              {/* Custom indicator & Reset button */}
                              {isCustom && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                    Custom
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCustomRates((prev) => {
                                        const next = { ...prev };
                                        delete next[prod.id];
                                        return next;
                                      });
                                      setRateInputDrafts((prev) => {
                                        const next = { ...prev };
                                        delete next[prod.id];
                                        return next;
                                      });
                                    }}
                                    className="text-[10px] text-slate-500 hover:text-slate-900 underline font-bold cursor-pointer"
                                    title="Reset to default rate"
                                  >
                                    Reset
                                  </button>
                                </div>
                              )}
                            </div>

                            {currentRate === 0 && (
                              <span className="text-[10.5px] font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">
                                Complimentary
                              </span>
                            )}
                          </div>
                        </div>

                        {/* SMART QUANTITY CARD: Fit to screen, Mobile & Tablet optimized */}
                        <div className="pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                          {inCartQty === 0 ? (
                            /* Unselected: Smart Add Button + Quick +5 & +10 Accelerators */
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                id={`btn-add-beverage-${prod.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemQty(prod.id, 1);
                                }}
                                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0d4a3a] hover:bg-[#0a382c] active:scale-[0.98] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                              >
                                <Plus className="w-4 h-4" />
                                <span>Add Case</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemQty(prod.id, 5);
                                }}
                                className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 text-xs font-black transition-all cursor-pointer border border-slate-200"
                                title="Add 5 crates"
                              >
                                +5
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemQty(prod.id, 10);
                                }}
                                className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 text-xs font-black transition-all cursor-pointer border border-slate-200"
                                title="Add 10 crates"
                              >
                                +10
                              </button>
                            </div>
                          ) : (
                            /* Selected: Interactive Stepper with Direct Input, Accelerators & Real-time Live Subtotal */
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-1.5 flex-wrap sm:flex-nowrap">
                                {/* Stepper with direct quantity input */}
                                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border-2 border-emerald-600 shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => setItemQty(prod.id, inCartQty - 1)}
                                    className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 active:scale-90 flex items-center justify-center cursor-pointer transition-colors"
                                    title="Decrease quantity"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <input
                                    type="number" inputMode="numeric"
                                    min="0"
                                    value={inCartQty}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      setItemQty(prod.id, isNaN(val) ? 0 : Math.max(0, val));
                                    }}
                                    className="w-12 h-8 text-center font-black text-sm text-slate-900 bg-slate-50 rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-700 tabular-nums"
                                    title="Type custom quantity"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setItemQty(prod.id, inCartQty + 1)}
                                    className="w-8 h-8 rounded-lg bg-[#0d4a3a] text-white hover:bg-[#0a382c] active:scale-90 flex items-center justify-center shadow-2xs cursor-pointer transition-transform"
                                    title="Increase quantity"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* Quick +5 & +10 accelerators + Remove */}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setItemQty(prod.id, inCartQty + 5)}
                                    className="h-8 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-900 text-xs font-bold transition-all cursor-pointer border border-emerald-200"
                                    title="Add 5 more crates"
                                  >
                                    +5
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setItemQty(prod.id, inCartQty + 10)}
                                    className="h-8 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-900 text-xs font-bold transition-all cursor-pointer border border-emerald-200"
                                    title="Add 10 more crates"
                                  >
                                    +10
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setItemQty(prod.id, 0)}
                                    className="h-8 px-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all cursor-pointer border border-rose-200 flex items-center gap-1"
                                    title="Remove this beverage from cart"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Remove</span>
                                  </button>
                                </div>
                              </div>

                              {/* Live Subtotal Strip */}
                              <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-emerald-50/80 border border-emerald-200/80">
                                <span className="text-slate-600 font-semibold">
                                  {inCartQty} cs × ₹{currentRate}
                                </span>
                                <span className="font-black text-emerald-950 font-mono text-xs sm:text-sm">
                                  Item Total: ₹{money(itemGross)} {currentRate === 0 && <span className="text-[10px] text-emerald-700 font-sans font-bold">(Free)</span>}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer with Subtotal & Done Button */}
            <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 shadow-lg">
              <div>
                <span className="text-xs text-slate-500 font-semibold block">Total selection ({totalCartQty} crates)</span>
                <span className="text-base sm:text-lg font-black text-slate-900 font-mono">
                  ₹{money(grandTotal)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProductSelector(false)}
                  className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 cursor-pointer"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowProductSelector(false);
                    setShowCartReview(true);
                  }}
                  className="px-4 sm:px-5 py-2.5 rounded-xl bg-[#0d4a3a] hover:bg-[#0a382c] active:scale-[0.98] text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-transform"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Review Cart ({totalCartQty})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* MODAL: Cart Review & Finalize (Captures and finalizes bill here!) */}
      {showCartReview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowCartReview(false)}
        >
          <div
            className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    Cart Review & Finalize
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-700 text-white font-black text-xs shadow-2xs">
                    {totalCartQty} Crates Total {totalFreeQty > 0 ? `(${totalFreeQty} free incl.)` : ''}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Party: <span className="font-semibold text-slate-800">{customerName || 'Apt / Walk-in sale'}</span> · {selectedStockLabel}
                </p>
              </div>
              <button aria-label="Close"
                type="button"
                onClick={() => setShowCartReview(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="p-4 overflow-y-auto space-y-3 divide-y divide-slate-100 flex-1 max-h-[48vh]">
              {lineItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  Your cart is empty. Add beverages to review.
                </div>
              ) : (
                lineItems.map((item, idx) => (
                  <div key={item.key || `cart_item_${item.productId}_${idx}`} className="pt-3 first:pt-0 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900">{item.productName}</span>
                        <SizeChip volume={products.find((p) => p.id === item.productId)?.volume} pack={products.find((p) => p.id === item.productId)?.pack} name={item.productName} />
                        {item.appliedPromo && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                            <span>{item.promoLabel || 'Scheme'}</span>
                            <button
                              type="button"
                              onClick={() => setCustomSchemes((prev) => ({ ...prev, [item.productId]: null }))}
                              className="text-rose-600 hover:text-rose-800 font-black ml-0.5 cursor-pointer"
                              title="Clear scheme: switch to full rate"
                            >
                              ✕
                            </button>
                          </span>
                        )}
                        {item.freeQty > 0 && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {item.freeQty} Free (incl.)
                          </span>
                        )}
                        {!item.appliedPromo && !item.isBundleFreeItem && (
                          <button
                            type="button"
                            onClick={() => {
                              const prod = products.find((p) => p.id === item.productId);
                              if (prod) setSchemeModalProduct(prod);
                            }}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                            title="Choose a scheme for this item"
                          >
                            + Add Scheme
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                        <span>Rate: ₹{item.rate} / cs {item.rate === 0 && <span className="text-emerald-700 font-bold">(Free)</span>}</span>
                        <span>·</span>
                        <span>
                          {item.qty} crate{item.qty === 1 ? '' : 's'}
                          {item.freeQty > 0 ? ` (${item.chargeableQty} paid + ${item.freeQty} free incl.)` : ''}
                        </span>
                        {item.cgstRate > 0 && <span>· GST {item.cgstRate * 2}%</span>}
                      </div>
                      {(() => {
                        // Margin guard: realised ex-GST revenue per physical case vs ex-GST purchase cost
                        const prod = products.find((p) => p.id === item.productId);
                        const cost = Number(prod?.effectiveCost ?? prod?.cost) || 0;
                        const cases = Number(item.qty) || 0;
                        if (item.isFree || item.isBundleFreeItem || cost <= 0 || cases <= 0) return null;
                        const perCase = (Number(item.taxable) || 0) / cases;
                        const profit = perCase - cost;
                        if (profit >= 0) {
                          return (
                            <div className="text-[10px] text-emerald-700 mt-0.5">
                              Margin ₹{money(profit)} / cs (cost ₹{money(cost)} ex-GST)
                            </div>
                          );
                        }
                        return (
                          <div className="text-[10px] font-bold text-rose-700 mt-0.5">
                            Below cost: earns ₹{money(perCase)} / cs ex-GST vs cost ₹{money(cost)} (loss ₹{money(-profit * cases)})
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Stepper */}
                      {!item.isBundleFreeItem && (
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                          <button aria-label="Decrease"
                            type="button"
                            onClick={() => setItemQty(item.productId, item.qty - 1)}
                            className="w-7 h-7 flex items-center justify-center rounded bg-white text-slate-700 hover:bg-slate-200 shadow-xs cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-8 text-center font-mono font-bold text-xs text-slate-800">
                            {item.qty}
                          </span>
                          <button aria-label="Increase"
                            type="button"
                            onClick={() => setItemQty(item.productId, item.qty + 1)}
                            className="w-7 h-7 flex items-center justify-center rounded bg-white text-slate-700 hover:bg-slate-200 shadow-xs cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="text-right min-w-[4.5rem]">
                        <div className="font-bold text-slate-900 font-mono">
                          ₹{money(item.gross)}
                        </div>
                        {item.discount > 0 && (
                          <div className="text-[10px] font-bold text-emerald-700 font-mono">
                            Save ₹{money(item.discount)}
                          </div>
                        )}
                        {!item.isBundleFreeItem && (
                          <button
                            type="button"
                            onClick={() => setItemQty(item.productId, 0)}
                            className="text-[11px] text-rose-500 hover:underline cursor-pointer block ml-auto mt-0.5"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Financial Summary & Payment Collection */}
            <div className="p-4 bg-slate-50 border-t border-slate-200/80 space-y-3 shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">Taxable Value</span>
                  <span className="font-bold font-mono text-slate-900 text-sm">₹{money(taxableAmount)}</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">Taxes (GST Incl.)</span>
                  <span className="font-bold font-mono text-slate-900 text-sm">₹{money(totalTax)}</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">Total Crates</span>
                  <span className="font-bold font-mono text-slate-900 text-sm">
                    {totalCartQty} cs {totalFreeQty > 0 ? `(${totalFreeQty} free incl.)` : ''}
                  </span>
                </div>
                <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                  <span className="text-emerald-800 block font-semibold">Grand Total</span>
                  <span className="font-black font-mono text-emerald-900 text-sm sm:text-base">₹{money(grandTotal)}</span>
                </div>
              </div>
              {billType === 'tax_invoice' && (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                  <span>GST tax is inclusive in the bill amount · No extra surcharge added for tax invoice</span>
                </div>
              )}

              {/* Payment Details */}
              <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    PAYMENT MODE
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold focus:outline-none"
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
                    <label className="block text-[11px] font-bold text-slate-600">
                      AMOUNT COLLECTED
                    </label>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setPaymentAmount(String(grandTotal))}
                        className="text-emerald-700 font-bold hover:underline cursor-pointer"
                      >
                        Full
                      </button>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => setPaymentAmount('0')}
                        className="text-amber-700 font-bold hover:underline cursor-pointer"
                      >
                        Credit (0)
                      </button>
                    </div>
                  </div>
                  <input
                    type="number" inputMode="decimal"
                    step="any"
                    min="0"
                    placeholder={`₹${grandTotal}`}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold font-mono focus:outline-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCartReview(false);
                    setShowProductSelector(true);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  + Add More Products
                </button>

                <button
                  type="button"
                  id="btn-finalize-save-bill"
                  onClick={handleSaveBill}
                  disabled={lineItems.length === 0}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#0d4a3a] hover:bg-[#0a382c] active:scale-95 text-white text-sm font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>Finalize & Save Bill (₹{money(grandTotal)})</span>
                </button>
              </div>
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
                className="px-5 py-2 rounded-xl bg-[#0d4a3a] text-white text-xs font-semibold hover:bg-[#0a3d30] disabled:opacity-50"
              >
                Save & Select Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Dispatch / Add New Delivery Van Trip */}
      {showNewTripModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowNewTripModal(false)}
        >
          <div
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">New Van Trip Dispatch</h3>
                  <p className="text-xs text-slate-500">Enable selling directly from delivery vehicle stock</p>
                </div>
              </div>
              <button aria-label="Close"
                type="button"
                onClick={() => setShowNewTripModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Vehicle / Van Name or Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Delivery Van #1 (MH-12-AB-1234)"
                  value={newTripVehicle}
                  onChange={(e) => setNewTripVehicle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Salesman / Driver Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={newTripSalesman}
                  onChange={(e) => setNewTripSalesman(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Dispatch From Godown
                </label>
                <select
                  value={newTripWhId}
                  onChange={(e) => setNewTripWhId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none"
                >
                  {warehouses.map((w, idx) => (
                    <option key={w.id || `wh_opt_${idx}`} value={w.id}>
                      {w.name} ({w.code || 'Godown'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewTripModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewTrip}
                disabled={!newTripVehicle.trim()}
                className="px-5 py-2 rounded-xl bg-[#0d4a3a] text-white text-xs font-semibold hover:bg-[#0a3d30] disabled:opacity-50 cursor-pointer shadow-xs"
              >
                Dispatch & Select Van
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
