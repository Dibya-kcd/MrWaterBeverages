import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SizeChip } from "../common/SizeChip";
import { sizeTheme } from "../../utils/sizeColor";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  FileText,
  Gift,
  History,
  Layers,
  Mic,
  MicOff,
  Minus,
  Package,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  User,
  X,
  Zap,
} from 'lucide-react';
import { CATS } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { Bill, BillItem, ExistingCustomer, PaymentMode, PriceType, Product, Promotion, Trip, Warehouse } from '../../types';
import { InvoiceSuccessCard } from '../billing/InvoiceSuccessCard';
import { CustomerQuickSelect } from '../billing/CustomerQuickSelect';
import { PaymentCollectionPanel } from '../billing/PaymentCollectionPanel';
import { SchemeSelectorModal } from '../billing/SchemeSelectorModal';
import { StockSourcePanel } from '../billing/StockSourcePanel';
import { CustomerSelector } from '../common/CustomerSelector';
import { billTotals, computeLine, normalizeGstFraction, money, schemeLabel, evaluateBundlePromotion, resolveProductGstRate } from '../../utils/billing';
import {
  startSpeechRecognition,
  parseSpokenQuantityAndProduct,
  ActiveSpeechSession,
} from '../../utils/speechRecognition';
import { billBalance } from '../../utils/salesReturns';
import { validateBillDraft, summarizeErrors, validatePhone } from '../../utils/validation';
import { collectExpiryAlerts } from '../../utils/fefo';
import { todayISO } from "../../utils/dateLocal";

interface BillingWorkflowProps {
  onOpenInvoiceModal: (bill: Bill, defaultFormat?: 'gst' | 'non_gst') => void;
  onOpenHistory: () => void;
}

export type StockSourceType = 'warehouse' | 'trip';

export const BillingWorkflow: React.FC<BillingWorkflowProps> = ({
  onOpenInvoiceModal,
  onOpenHistory,
}) => {
  const {
    products,
    bills,
    cart,
    setCart,
    finalizeBill,
    editingBillId,
    cancelEditBill,
    remainingStock,
    warehouseStock,
    getVehicleStock,
    activePromoFor,
    promotions,
    gstMode,
    palette,
    scale,
    orgProfile,
    billingSettings,
    warehouses,
    defaultWarehouse,
    trips,
    getPreviousCustomPrice,
    setCustomProductPrice,
    inventoryBatches,
    customers,
    productWarehouseStock,
    findBillingCustomer,
    getCustomerLedger,
  } = useLedger();

  // ---------------------------------------------------------------------------
  // 1. Stock Source State: Warehouse vs Active Trip / Van
  // ---------------------------------------------------------------------------
  const [stockSourceType, setStockSourceType] = useState<StockSourceType>(() => {
    // Default to central warehouse godown so all catalog beverages are available for billing
    if (cart.tripId) return 'trip';
    return 'warehouse';
  });

  // Selected Warehouse
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => {
    return cart.warehouseId || defaultWarehouse?.id || warehouses[0]?.id || '';
  });

  // Active / Out dispatch trips for quick stock selection
  const activeTrips = useMemo(() => {
    return trips.filter((t) => t.status === 'out');
  }, [trips]);

  // Selected Trip (strictly active trips only)
  const [selectedTripId, setSelectedTripId] = useState<number | null>(() => {
    if (cart.tripId) {
      const isCartTripActive = activeTrips.some((t) => t.id === cart.tripId);
      if (isCartTripActive) return cart.tripId;
    }
    return activeTrips[0]?.id || null;
  });

  const selectedTrip: Trip | null = useMemo(() => {
    if (!selectedTripId) return null;
    return trips.find((t) => t.id === selectedTripId) || null;
  }, [trips, selectedTripId]);

  // ---------------------------------------------------------------------------
  // 2. Customer, Pricing Tier & Date States
  // ---------------------------------------------------------------------------
  const [customerName, setCustomerName] = useState<string>(cart.retailer || '');
  const [customerPhone, setCustomerPhone] = useState<string>(cart.phone || '');
  /** Default B2C for unregistered retailers; B2B only when GSTIN is entered. */
  const [supplyType, setSupplyType] = useState<'B2C' | 'B2B'>('B2C');
  const [customerGstin, setCustomerGstin] = useState('');
  /** Invoice format state: 'non_gst' (B2C Retail Bill / Cash Memo) vs 'gst' (B2B Tax Invoice) */
  const [invoiceFormat, setInvoiceFormat] = useState<'gst' | 'non_gst'>('non_gst');
  const [isRetrospective, setIsRetrospective] = useState(false);
  const [priceType, setPriceType] = useState<PriceType>(() => {
    return billingSettings?.defaultSaleType || 'Retail';
  });
  const [saleDate, setSaleDate] = useState<string>(() => {
    return cart.date || todayISO();
  });
  const [showCustomerDirectoryModal, setShowCustomerDirectoryModal] = useState<boolean>(false);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState<boolean>(false);

  const handleClearCart = () => {
    setCart((prev) => ({ ...prev, items: [] }));
    setIsCheckoutOpen(false);
    setShowClearCartConfirm(false);
    showNotification('Cart cleared successfully.', 'success');
  };

  // ---------------------------------------------------------------------------
  // Custom Product Rates and Scheme Overrides
  // ---------------------------------------------------------------------------
  const [customProductRates, setCustomProductRates] = useState<Record<number, number>>({});
  const [customProductSchemes, setCustomProductSchemes] = useState<Record<number, Promotion | null>>({});
  const [schemeModalTarget, setSchemeModalTarget] = useState<{
    productId: number;
    product: Product;
    currentRate: number;
    currentScheme: Promotion | null;
    currentPromoLabel: string | null;
    lineItemKey?: string | number;
  } | null>(null);

  const getProductCurrentRate = (prod: Product): number => {
    const inCart = cart.items.find((it) => it.productId === prod.id);
    if (inCart) return inCart.rate;
    if (customProductRates[prod.id] !== undefined) return customProductRates[prod.id];
    const prevCustom = getPreviousCustomPrice(prod.id, customerName);
    if (prevCustom !== null && prevCustom > 0) return prevCustom;
    return priceType === 'Wholesale' ? (prod.wholesale || prod.retail || 0) : (prod.retail || prod.wholesale || 0);
  };

  const getProductCurrentScheme = (prod: Product): Promotion | null => {
    if (customProductSchemes[prod.id] !== undefined) return customProductSchemes[prod.id];
    const inCart = cart.items.find((it) => Number(it.productId) === Number(prod.id));
    if (inCart?.schemeSkipped) return null;
    const storePromo = activePromoFor(prod.id) || null;
    if (storePromo) return storePromo;
    if (inCart && inCart.appliedPromo) return inCart.appliedPromo;
    return null;
  };

  const handleSetProductRate = (productId: number, newRate: number) => {
    setCustomProductRates((prev) => ({ ...prev, [productId]: newRate }));
    setCustomProductPrice(productId, newRate, customerName);
    const inCart = cart.items.find((it) => it.productId === productId);
    if (inCart) {
      handleUpdateLineRate(inCart.key, newRate);
    }
  };

  const handleOpenSchemeModalForProduct = (productId: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const rate = getProductCurrentRate(prod);
    const scheme = getProductCurrentScheme(prod);
    const inCart = cart.items.find((it) => it.productId === productId);
    setSchemeModalTarget({
      productId,
      product: prod,
      currentRate: rate,
      currentScheme: scheme,
      currentPromoLabel: inCart?.promoLabel || (scheme ? schemeLabel(scheme, products) : null),
      lineItemKey: inCart?.key,
    });
  };

  const handleOpenSchemeModalForLine = (item: BillItem) => {
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return;
    const scheme = customProductSchemes[item.productId] !== undefined
      ? customProductSchemes[item.productId]
      : (item.appliedPromo !== undefined ? item.appliedPromo : (activePromoFor(prod.id) || null));
    setSchemeModalTarget({
      productId: item.productId,
      product: prod,
      currentRate: item.rate,
      currentScheme: scheme,
      currentPromoLabel: item.promoLabel || null,
      lineItemKey: item.key,
    });
  };

  const handleSchemeSelected = (promo: Promotion | null, label: string | null) => {
    if (!schemeModalTarget) return;
    const { productId, lineItemKey } = schemeModalTarget;
    setCustomProductSchemes((prev) => ({ ...prev, [productId]: promo }));
    const isSkipped = promo === null;
    if (lineItemKey) {
      handleUpdateLineScheme(lineItemKey, promo, label, isSkipped);
    } else {
      const inCart = cart.items.find((it) => Number(it.productId) === Number(productId));
      if (inCart) {
        handleUpdateLineScheme(inCart.key, promo, label, isSkipped);
      }
    }
    setSchemeModalTarget(null);
  };

  // Sync external customer changes into state
  useEffect(() => {
    if (cart.retailer !== undefined && cart.retailer !== customerName) {
      setCustomerName(cart.retailer);
    }
    if (cart.phone !== undefined && cart.phone !== customerPhone) {
      setCustomerPhone(cart.phone);
    }
  }, [cart.retailer, cart.phone]);

  // Refresh existing items in cart to match customer's previous custom prices or active schemes
  const prevCustomerNameRef = useRef<string>(customerName);
  useEffect(() => {
    if (prevCustomerNameRef.current === customerName) return;
    prevCustomerNameRef.current = customerName;

    // Clear draft session overrides so the selected customer's previous custom rates take effect
    setCustomProductRates((prev) => (Object.keys(prev).length === 0 ? prev : {}));

    // Refresh existing items in cart to match customer's previous custom prices
    setCart((prev) => {
      if (!prev.items || prev.items.length === 0) return prev;
      let changed = false;
      const updatedItems = prev.items.map((it) => {
        const prod = products.find((p) => Number(p.id) === Number(it.productId));
        if (!prod) return it;
        const prevCustom = getPreviousCustomPrice(it.productId, customerName);
        const targetRate =
          prevCustom !== null && prevCustom > 0
            ? prevCustom
            : it.priceType === 'Wholesale'
            ? prod.wholesale || prod.retail
            : prod.retail || prod.wholesale;
        if (targetRate !== undefined && targetRate > 0 && targetRate !== it.rate) {
          changed = true;
          const promo = it.schemeSkipped ? null : (it.appliedPromo || activePromoFor(prod.id) || null);
          const comp = computeLine(prod, it.priceType, it.qty, promo, targetRate, 0);
          return {
            ...it,
            rate: targetRate,
            gross: comp.gross,
            freeQty: comp.freeQty,
            chargeableQty: comp.chargeableQty,
            discount: comp.discount,
            amount: comp.amount,
          };
        }
        return it;
      });
      return changed ? { ...prev, items: updatedItems } : prev;
    });
  }, [customerName, products, getPreviousCustomPrice, activePromoFor]);

  // Keep cart line item promotions fresh when promotions catalog is added/updated
  useEffect(() => {
    setCart((prev) => {
      if (!prev.items || prev.items.length === 0) return prev;
      let changed = false;
      const updated = prev.items.map((it) => {
        if (it.isBundleFreeItem) return it;
        const prod = products.find((p) => Number(p.id) === Number(it.productId));
        if (!prod) return it;
        const currentActive = customProductSchemes[prod.id] !== undefined
          ? customProductSchemes[prod.id]
          : (activePromoFor(prod.id) || null);
        const currentLabel = currentActive ? schemeLabel(currentActive, products) : null;
        const promoChanged =
          it.appliedPromo?.id !== currentActive?.id ||
          it.promoLabel !== currentLabel ||
          it.appliedPromo?.buyQty !== currentActive?.buyQty ||
          it.appliedPromo?.freeQty !== currentActive?.freeQty ||
          it.appliedPromo?.percent !== currentActive?.percent ||
          it.appliedPromo?.flatPerCase !== currentActive?.flatPerCase;
        if (promoChanged) {
          changed = true;
          const comp = computeLine(prod, it.priceType, it.qty, currentActive, it.rate, 0);
          return {
            ...it,
            appliedPromo: currentActive,
            promoLabel: currentLabel,
            schemeSkipped: currentActive === null ? it.schemeSkipped : false,
            gross: comp.gross,
            freeQty: comp.freeQty,
            chargeableQty: comp.chargeableQty,
            discount: comp.discount,
            amount: comp.amount,
          };
        }
        return it;
      });
      return changed ? { ...prev, items: updated } : prev;
    });
  }, [promotions, products, activePromoFor, customProductSchemes]);

  // Keep cart metadata synchronized without triggering infinite re-render loops
  useEffect(() => {
    setCart((prev) => {
      const targetWarehouseId = stockSourceType === 'warehouse' ? selectedWarehouseId : selectedTrip?.warehouseId || '';
      const targetTripId = stockSourceType === 'trip' ? selectedTrip?.id : undefined;
      const targetVehicle = stockSourceType === 'trip' ? selectedTrip?.vehicle : undefined;
      const targetSalesman = stockSourceType === 'trip' ? selectedTrip?.salesman : undefined;
      const targetSalesmanId = stockSourceType === 'trip' ? selectedTrip?.salesmanId : undefined;

      if (
        prev.retailer === customerName &&
        prev.phone === customerPhone &&
        prev.date === saleDate &&
        prev.warehouseId === targetWarehouseId &&
        prev.tripId === targetTripId &&
        prev.vehicle === targetVehicle &&
        prev.salesman === targetSalesman &&
        prev.salesmanId === targetSalesmanId
      ) {
        return prev;
      }

      return {
        ...prev,
        retailer: customerName,
        phone: customerPhone,
        date: saleDate,
        warehouseId: targetWarehouseId,
        tripId: targetTripId,
        vehicle: targetVehicle,
        salesman: targetSalesman,
        salesmanId: targetSalesmanId,
      };
    });
  }, [
    customerName,
    customerPhone,
    saleDate,
    stockSourceType,
    selectedWarehouseId,
    selectedTrip?.id,
    selectedTrip?.warehouseId,
    selectedTrip?.vehicle,
    selectedTrip?.salesman,
    selectedTrip?.salesmanId,
    setCart,
  ]);

  // ---------------------------------------------------------------------------
  // 3. Product Catalog Browsing, Search & Voice Search
  // ---------------------------------------------------------------------------
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [productAlphaFilter, setProductAlphaFilter] = useState<string>('ALL');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(true);

  // Voice Search for Products (e.g. "5 Apple Fizz", "dozen cola")
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const voiceSessionRef = useRef<ActiveSpeechSession | null>(null);

  // Notifications / Feedback
  const [notificationMsg, setNotificationMsg] = useState<{ text: string; type: 'success' | 'warn' } | null>(null);

  const showNotification = (text: string, type: 'success' | 'warn' = 'success') => {
    setNotificationMsg({ text, type });
    setTimeout(() => {
      setNotificationMsg(null);
    }, 2800);
  };

  // Distinct Categories from Products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['ALL', ...Array.from(set)];
  }, [products]);

  // Existing Customers compiled from customer directory AND past bills
  // One source of truth for customer balances: the ledger's own list (opening balance, every
  // receipt, advances and returns included). A private list built from bills alone showed
  // "0 due / settled" for a customer who had paid in advance.
  const { existingCustomers: ledgerCustomers } = useLedger();
  const existingCustomers: ExistingCustomer[] = useMemo(
    () => [...ledgerCustomers].sort((a, b) => b.totalBills - a.totalBills),
    [ledgerCustomers],
  );

  // Helper to get available stock based on selected stock source
  const getProductStock = (productId: number): { available: number; loaded?: number; sold?: number; label: string } => {
    if (stockSourceType === 'trip') {
      if (!selectedTrip) {
        return { available: 0, label: 'Select a van / trip' };
      }
      const { loaded, sold, available } = getVehicleStock(selectedTrip, productId);
      const avail = Math.max(0, Number(available) || 0);
      const ld = Math.max(0, Number(loaded) || 0);
      return {
        available: avail,
        loaded: ld,
        sold: Math.max(0, Number(sold) || 0),
        label: ld > 0 ? `Van ${avail}/${ld} cs` : `Van ${avail} cs`,
      };
    } else {
      // Warehouse stock
      const wh = warehouses.find((w) => w.id === selectedWarehouseId);
      const whName = wh ? wh.name : 'Depot';
      const available = Math.max(
        0,
        Number(
          selectedWarehouseId ? warehouseStock(selectedWarehouseId, productId) : remainingStock(productId)
        ) || 0
      );
      const shortName = (whName || 'Depot').split(' ')[0];
      return {
        available,
        label: `${shortName} ${available} cs`,
      };
    }
  };

  // Filtered Products for Catalog
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      // Category filter
      if (selectedCategory !== 'ALL' && prod.category !== selectedCategory) {
        return false;
      }
      // Text search (name, SKU, category, pack)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = prod.name.toLowerCase().includes(query);
        const matchesCat = (prod.category || '').toLowerCase().includes(query);
        const matchesSku = (prod.sku || '').toLowerCase().includes(query);
        const matchesPack = (prod.pack || '').toLowerCase().includes(query);
        if (!matchesName && !matchesCat && !matchesSku && !matchesPack) return false;
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
      // Only In Stock Filter
      if (onlyInStock) {
        const stock = getProductStock(prod.id);
        if (stock.available <= 0) return false;
      }
      return true;
    });
  }, [products, selectedCategory, searchTerm, productAlphaFilter, onlyInStock, stockSourceType, selectedWarehouseId, selectedTrip, warehouses, cart.items]);

  const catalogStats = useMemo(() => {
    let inStockAtSource = 0;
    let totalCasesAtSource = 0;
    for (const p of products) {
      const s = getProductStock(p.id);
      if (s.available > 0) {
        inStockAtSource += 1;
        totalCasesAtSource += s.available;
      }
    }
    return {
      totalCatalog: products.length,
      inStockAtSource,
      totalCasesAtSource,
      shown: filteredProducts.length,
    };
  }, [products, filteredProducts, stockSourceType, selectedWarehouseId, selectedTrip, warehouses, cart.items]);

  // ---------------------------------------------------------------------------
  // 4. Cart Stepper & Quantity Manipulation
  // ---------------------------------------------------------------------------
  const getProductCartQty = (productId: number): number => {
    const item = cart.items.find((it) => Number(it.productId) === Number(productId));
    return item ? Number(item.qty) || 0 : 0;
  };

  const getSellableRemaining = (productId: number): number => {
    const stock = getProductStock(productId);
    return Math.max(0, stock.available - getProductCartQty(productId));
  };

  const handleQuickCartChange = (productId: number, delta: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const currentQty = getProductCartQty(productId);
    const targetQty = currentQty + delta;

    if (targetQty <= 0) {
      // Remove item
      setCart((prev) => ({
        ...prev,
        items: prev.items.filter((it) => it.productId !== productId),
      }));
      return;
    }

    // Check available stock
    const stock = getProductStock(productId);
    if (delta > 0 && targetQty > stock.available) {
      const godownAvail = remainingStock(productId);
      if (stock.available <= 0) {
        if (stockSourceType === 'trip' && godownAvail > 0) {
          showNotification(
            `Notice: 0 cases on van. Central Godown has ${godownAvail} cs. Added 1 case to invoice.`,
            'warn'
          );
        } else {
          showNotification(
            `Notice: Added ${product.name} (recorded stock is 0 cs).`,
            'warn'
          );
        }
      } else {
        showNotification(
          `Notice: ${stock.available} cases recorded in ${stockSourceType === 'trip' ? 'selected van' : 'selected warehouse'}. Added ${targetQty} cs.`,
          'warn'
        );
      }
    }

    const effectiveQty = targetQty;

    setCart((prev) => {
      const existingIdx = prev.items.findIndex((it) => Number(it.productId) === Number(productId));
      const existingItem = existingIdx >= 0 ? prev.items[existingIdx] : null;

      const unitRate = existingItem ? existingItem.rate : getProductCurrentRate(product);
      
      let promo: Promotion | null = null;
      let promoLabelText: string | null = null;
      if (customProductSchemes[product.id] !== undefined) {
        promo = customProductSchemes[product.id];
        promoLabelText = promo ? schemeLabel(promo, products) : null;
      } else {
        promo = activePromoFor(product.id) || (existingItem?.schemeSkipped ? null : existingItem?.appliedPromo) || null;
        promoLabelText = promo ? schemeLabel(promo, products) : null;
      }

      const computed = computeLine(product, priceType, effectiveQty, promo, unitRate, 0);

      const updatedItem: BillItem = {
        key: existingItem ? existingItem.key : `${product.id}-${Date.now()}`,
        productId: product.id,
        productName: product.name,
        category: product.category,
        gst: resolveProductGstRate(product),
        priceType,
        qty: effectiveQty,
        rate: unitRate,
        gross: computed.gross,
        freeQty: computed.freeQty,
        chargeableQty: computed.chargeableQty,
        discount: computed.discount,
        amount: computed.amount,
        promoLabel: promoLabelText,
        appliedPromo: promo,
        schemeSkipped: promo ? false : existingItem?.schemeSkipped,
        warehouseId: stockSourceType === 'warehouse' ? selectedWarehouseId : undefined,
      };

      if (existingIdx >= 0) {
        const copy = [...prev.items];
        copy[existingIdx] = updatedItem;
        return { ...prev, items: copy };
      } else {
        return { ...prev, items: [...prev.items, updatedItem] };
      }
    });
  };

  // Handle Voice Product Search
  const handleStartProductVoice = () => {
    if (isVoiceActive) {
      if (voiceSessionRef.current) {
        voiceSessionRef.current.stop();
      }
      setIsVoiceActive(false);
      return;
    }

    setVoiceTranscript('');
    setIsVoiceActive(true);

    const session = startSpeechRecognition({
      onStart: () => setIsVoiceActive(true),
      onInterimResult: (interim) => setVoiceTranscript(interim),
      onResult: (transcript) => {
        setIsVoiceActive(false);
        setVoiceTranscript(transcript);

        const parsed = parseSpokenQuantityAndProduct(transcript);
        if (!parsed.query) {
          showNotification('Could not understand beverage name.', 'warn');
          return;
        }

        const queryLower = parsed.query.toLowerCase().trim();
        const matched =
          products.find((p) => p.name.toLowerCase().includes(queryLower) || queryLower.includes(p.name.toLowerCase())) ||
          products.find((p) => {
            const words = queryLower.split(/\s+/).filter((w) => w.length > 2);
            return words.some((w) => p.name.toLowerCase().includes(w));
          });

        if (matched) {
          const stock = getProductStock(matched.id);
          if (stock.available <= 0) {
            showNotification(`${matched.name} is out of stock in this source.`, 'warn');
          } else {
            const current = getProductCartQty(matched.id);
            const canAdd = Math.max(0, stock.available - current);
            const toAdd = Math.min(parsed.quantity, canAdd);
            if (toAdd > 0) {
              handleQuickCartChange(matched.id, toAdd);
              showNotification(`✓ Added ${toAdd} cases of ${matched.name} to cart.`, 'success');
            }
          }
        } else {
          setSearchTerm(parsed.query);
          showNotification(`Filtered beverages by "${parsed.query}".`, 'success');
        }
      },
      onError: () => setIsVoiceActive(false),
      onEnd: () => setIsVoiceActive(false),
    });

    voiceSessionRef.current = session;
  };

  // ---------------------------------------------------------------------------
  // 5. Cart Totals & Checkout / Settlement Drawer States
  // ---------------------------------------------------------------------------
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  /** Guided flow: party details → pick crates → full-screen settle */
  type BillingFlowStep = 'party' | 'products' | 'settle';
  const [billingStep, setBillingStep] = useState<BillingFlowStep>('party');
  const [overallDiscountDraft, setOverallDiscountDraft] = useState<string>(
    cart.additionalDiscount ? String(cart.additionalDiscount) : ''
  );
  const [amountPaidDraft, setAmountPaidDraft] = useState<string>('0'); // credit default (not full cash)
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('credit');
  const [paymentDate, setPaymentDate] = useState<string>(saleDate);
  const [paymentNote, setPaymentNote] = useState<string>('');

  // Post-Sale Finalized Bill State
  const [finalizedBill, setFinalizedBill] = useState<Bill | null>(null);

  // Dynamic Totals
  const currentDiscount = Number(overallDiscountDraft) || 0;
  const totals = useMemo(() => {
    return billTotals(cart.items, gstMode, currentDiscount);
  }, [cart.items, gstMode, currentDiscount]);

  const totalCasesInCart = useMemo(() => {
    return cart.items.reduce((sum, it) => sum + it.qty, 0);
  }, [cart.items]);

  // Smart assist (read-only hints — does not change cart, stock, or finalize behaviour)
  const billingSmartHints = useMemo(() => {
    const hints: { id: string; tone: 'amber' | 'rose' | 'sky' | 'emerald'; text: string }[] = [];
    const asOf = saleDate || todayISO();

    if (stockSourceType === 'warehouse' && selectedWarehouseId) {
      const alerts = collectExpiryAlerts(inventoryBatches, products, asOf, {
        warehouseId: selectedWarehouseId,
      });
      const expired = alerts.filter((a) => a.level === 'expired');
      const critical = alerts.filter((a) => a.level === 'critical');
      if (expired.length > 0) {
        hints.push({
          id: 'exp-block',
          tone: 'rose',
          text: `${expired.length} expired lot(s) in this godown — FEFO billing will not sell them`,
        });
      }
      if (critical.length > 0) {
        hints.push({
          id: 'exp-soon',
          tone: 'amber',
          text: `${critical.length} lot(s) expire within 7 days — prefer moving near-expiry first`,
        });
      }
    }

    for (const it of cart.items) {
      let avail = 0;
      let sourceLabel = 'stock';
      if (stockSourceType === 'trip') {
        if (selectedTrip) {
          avail = Math.max(0, getVehicleStock(selectedTrip, it.productId).available || 0);
          sourceLabel = 'this van';
        }
      } else if (selectedWarehouseId) {
        const row = productWarehouseStock(it.productId).find((w) => w.warehouseId === selectedWarehouseId);
        avail = Math.max(0, row?.crates ?? 0);
        sourceLabel = row?.warehouseName || 'this godown';
      } else {
        avail = Math.max(0, remainingStock(it.productId) || 0);
        sourceLabel = 'depot';
      }
      if (avail > 0 && it.qty >= avail) {
        hints.push({
          id: `full-${it.productId}`,
          tone: 'amber',
          text: `${it.productName}: cart has all ${avail} cases in ${sourceLabel}`,
        });
      } else if (selectedWarehouseId && stockSourceType === 'warehouse') {
        const others = productWarehouseStock(it.productId).filter(
          (w) => w.warehouseId !== selectedWarehouseId && (w.crates || 0) > 0
        );
        if (avail < it.qty && others.length > 0) {
          const extra = others.map((w) => `${w.warehouseName} ${Math.max(0, w.crates)}cs`).join(', ');
          hints.push({
            id: `split-${it.productId}`,
            tone: 'sky',
            text: `${it.productName}: only ${avail} in selected godown — also in ${extra}`,
          });
        }
      }
    }

    // Credit limit warning (hard block still on finalizeBill)
    {
      const party = (customerName || '').trim();
      if (party && party.toLowerCase() !== 'cash sale') {
        // By customer ID (the same figure the hard block uses), not by name text.
        const cust = findBillingCustomer(party, customerPhone);
        const limit = Number(cust?.creditLimit) || 0;
        if (limit > 0 && cust) {
          const due = Math.max(0, getCustomerLedger(cust.id).rawBalance);
          const unpaid = Math.max(0, totals.total - (Number(amountPaidDraft) || 0));
          // when draft empty, assume full pay — use balanceDue if defined later; approximate:
          const thisCredit = Math.max(0, totals.total - Math.max(0, Number(amountPaidDraft) || 0));
          if (due + thisCredit > limit) {
            hints.push({
              id: 'credit-limit',
              tone: 'rose',
              text: `Credit limit ₹${limit.toLocaleString('en-IN')}: due ₹${due.toLocaleString('en-IN', { maximumFractionDigits: 0 })} — collect more or bill will be blocked`,
            });
          } else if (due > limit * 0.8) {
            hints.push({
              id: 'credit-near',
              tone: 'amber',
              text: `${party} near credit limit (due ₹${due.toLocaleString('en-IN', { maximumFractionDigits: 0 })} / ₹${limit.toLocaleString('en-IN')})`,
            });
          }
        }
      }
    }

    const party = (customerName || '').trim();
    if (party && party.toLowerCase() !== 'cash sale') {
      let due = 0;
      for (const b of bills) {
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

    if (cart.items.length > 0 && hints.length === 0) {
      hints.push({
        id: 'ok',
        tone: 'emerald',
        text: 'Cart looks clear — stock source set · FEFO (earliest expiry) applies on save',
      });
    }

    // Active Combo / Multi-Product Scheme hints
    const activeBundles = (promotions || []).filter(
      (p) =>
        p.isActive !== false &&
        (p.type === 'bundle' ||
          p.type === 'buy_x_get_different_free' ||
          p.type === 'group_buy_n_get_m_free')
    );
    for (const bp of activeBundles) {
      const bRes = evaluateBundlePromotion(bp, cart.items, products);
      if (bRes.isQualified && bRes.freeCasesAwarded > 0) {
        let schemeTag = 'Combo Scheme';
        if (bp.type === 'buy_x_get_different_free') schemeTag = 'Buy A Get B Free';
        if (bp.type === 'group_buy_n_get_m_free') schemeTag = 'Group Scheme';
        hints.unshift({
          id: `bundle-qual-${bp.id}`,
          tone: 'emerald',
          text: `🎁 ${schemeTag} Qualified: "${bp.name}" — ${bRes.freeCasesAwarded} Free Case(s) earned! Auto-applied to cart.`,
        });
      } else if (bRes.qualifyingCount > 0 && bRes.qualifyingCount < bRes.requiredCount) {
        let hintMsg = `Add ${bRes.requiredCount - bRes.qualifyingCount} more eligible type to get free bonus!`;
        if (bp.type === 'buy_x_get_different_free') {
          hintMsg = `Add ${bRes.requiredCount - bRes.qualifyingCount} more case(s) of trigger item to get ${bp.freeQty || 1} free!`;
        } else if (bp.type === 'group_buy_n_get_m_free') {
          hintMsg = `Add ${bRes.requiredCount - bRes.qualifyingCount} more case(s) from group to get ${bp.freeQty || 1} free!`;
        }
        hints.push({
          id: `bundle-near-${bp.id}`,
          tone: 'sky',
          text: `💡 Offer "${bp.name}": ${hintMsg}`,
        });
      }
    }

    return hints.slice(0, 5);
  }, [
    saleDate,
    stockSourceType,
    selectedWarehouseId,
    inventoryBatches,
    products,
    cart.items,
    selectedTrip,
    getVehicleStock,
    remainingStock,
    customerName,
    bills,
    productWarehouseStock,
    customers,
    totals.total,
    amountPaidDraft,
    promotions,
  ]);

  const regularCartItemsSignature = useMemo(() => {
    return (cart.items || [])
      .filter((it) => !it.isBundleFreeItem)
      .map((it) => `${it.productId}:${it.qty}`)
      .join('|');
  }, [cart.items]);

  const qualifiedBundlePromos = useMemo(() => {
    const activeBundles = (promotions || []).filter(
      (p) =>
        p.isActive !== false &&
        (p.type === 'bundle' ||
          p.type === 'buy_x_get_different_free' ||
          p.type === 'group_buy_n_get_m_free')
    );
    return activeBundles.map((bp) => {
      const res = evaluateBundlePromotion(bp, cart.items, products);
      return { bp, res };
    });
  }, [promotions, regularCartItemsSignature, products]);

  const handleAddBundleFreeReward = (bp: Promotion, rewardProd: Product, count: number) => {
    setCart((prev) => {
      const filtered = prev.items.filter((it) => Number(it.bundlePromoId) !== Number(bp.id));
      const freeItem: BillItem = {
        key: `bundle_free_${bp.id}_${Date.now()}`,
        productId: rewardProd.id,
        productName: rewardProd.name,
        category: rewardProd.category,
        gst: resolveProductGstRate(rewardProd),
        priceType: 'Retail',
        qty: count,
        rate: 0,
        gross: 0,
        freeQty: count,
        chargeableQty: 0,
        discount: 0,
        amount: 0,
        promoLabel: `🎁 ${bp.name} (Combo Free)`,
        isBundleFreeItem: true,
        bundlePromoId: Number(bp.id),
      };
      return { ...prev, items: [...filtered, freeItem] };
    });
    showNotification(`✓ Free reward added: ${count} free case(s) of ${rewardProd.name}!`, 'success');
  };

  // Auto-sync bundle free rewards atomically when bundle qualification status changes
  useEffect(() => {
    setCart((prev) => {
      let changed = false;
      let nextItems = [...prev.items];

      // 1. Process all qualified bundle promos
      for (const { bp, res } of qualifiedBundlePromos) {
        const promoId = Number(bp.id);
        const existingIdx = nextItems.findIndex(
          (it) => it.isBundleFreeItem && Number(it.bundlePromoId) === promoId
        );
        const existing = existingIdx >= 0 ? nextItems[existingIdx] : null;

        if (res.isQualified && res.freeCasesAwarded > 0) {
          const userPickedProd = existing
            ? products.find((p) => Number(p.id) === Number(existing.productId))
            : null;
          const rewardProd =
            userPickedProd || res.defaultFreeProduct || res.eligibleRewardProducts[0] || products[0];

          if (rewardProd) {
            const needUpdate =
              !existing ||
              existing.freeQty !== res.freeCasesAwarded ||
              Number(existing.productId) !== Number(rewardProd.id);

            if (needUpdate) {
              changed = true;
              const freeItem: BillItem = {
                key: existing?.key || `bundle_free_${promoId}_${Date.now()}`,
                productId: rewardProd.id,
                productName: rewardProd.name,
                category: rewardProd.category,
                gst: resolveProductGstRate(rewardProd),
                priceType: 'Retail',
                qty: res.freeCasesAwarded,
                rate: 0,
                gross: 0,
                freeQty: res.freeCasesAwarded,
                chargeableQty: 0,
                discount: 0,
                amount: 0,
                promoLabel: `🎁 ${bp.name} (Combo Free)`,
                isBundleFreeItem: true,
                bundlePromoId: promoId,
              };

              if (existingIdx >= 0) {
                nextItems[existingIdx] = freeItem;
              } else {
                nextItems.push(freeItem);
              }
            }
          }
        } else if (existingIdx >= 0) {
          // Promo no longer qualified -> remove free reward
          changed = true;
          nextItems.splice(existingIdx, 1);
        }
      }

      // 2. Remove any orphaned bundle free items whose promo is not in qualifiedBundlePromos
      const validPromoIds = new Set(
        qualifiedBundlePromos.filter((q) => q.res.isQualified).map((q) => Number(q.bp.id))
      );
      const cleaned = nextItems.filter(
        (it) => !it.isBundleFreeItem || (it.bundlePromoId && validPromoIds.has(Number(it.bundlePromoId)))
      );
      if (cleaned.length !== nextItems.length) {
        changed = true;
        nextItems = cleaned;
      }

      return changed ? { ...prev, items: nextItems } : prev;
    });
  }, [qualifiedBundlePromos, products]);


  // Amount paid & balance due
  const paidAmount = Math.max(0, Number(amountPaidDraft === '' ? 0 : amountPaidDraft) || 0);
  const balanceDue = Math.max(0, totals.total - paidAmount);
  const isPaidInFull = paidAmount >= totals.total && totals.total > 0;

  // Apply quick discount presets
  const handleApplyQuickDiscount = (amt: number, isPercent = false) => {
    if (amt === 0) {
      setOverallDiscountDraft('');
      return;
    }
    if (isPercent) {
      const calc = Math.round((totals.subtotal * amt) / 100);
      setOverallDiscountDraft(String(calc));
    } else {
      setOverallDiscountDraft(String(amt));
    }
  };

  // Line Item Modifications in Settle Panel
  const handleUpdateLineQty = (itemKey: string | number, newQty: number) => {
    if (newQty <= 0) {
      setCart((prev) => ({
        ...prev,
        items: prev.items.filter((it) => it.key !== itemKey),
      }));
      return;
    }
    setCart((prev) => {
      const items = prev.items.map((it) => {
        if (it.key !== itemKey) return it;
        const prod = products.find((p) => Number(p.id) === Number(it.productId));
        const promo = customProductSchemes[it.productId] !== undefined
          ? customProductSchemes[it.productId]
          : (activePromoFor(it.productId) || (it.schemeSkipped ? null : it.appliedPromo) || null);
        const comp = prod ? computeLine(prod, it.priceType, newQty, promo, it.rate, 0) : null;
        return {
          ...it,
          qty: newQty,
          appliedPromo: promo,
          promoLabel: promo ? schemeLabel(promo, products) : null,
          gross: comp?.gross ?? it.gross,
          freeQty: comp?.freeQty ?? 0,
          chargeableQty: comp?.chargeableQty ?? newQty,
          discount: comp?.discount ?? 0,
          amount: comp?.amount ?? it.amount,
        };
      });
      return { ...prev, items };
    });
  };

  const handleUpdateLineRate = (itemKey: string | number, newRate: number) => {
    setCart((prev) => {
      const items = prev.items.map((it) => {
        if (it.key !== itemKey) return it;
        setCustomProductPrice(it.productId, newRate, customerName);
        const prod = products.find((p) => Number(p.id) === Number(it.productId));
        const promo = customProductSchemes[it.productId] !== undefined
          ? customProductSchemes[it.productId]
          : (activePromoFor(it.productId) || (it.schemeSkipped ? null : it.appliedPromo) || null);
        const comp = prod ? computeLine(prod, it.priceType, it.qty, promo, newRate, 0) : null;
        return {
          ...it,
          rate: newRate,
          customPriceEdited: true,
          appliedPromo: promo,
          promoLabel: promo ? schemeLabel(promo, products) : null,
          gross: comp?.gross ?? it.gross,
          freeQty: comp?.freeQty ?? 0,
          chargeableQty: comp?.chargeableQty ?? it.chargeableQty,
          discount: comp?.discount ?? 0,
          amount: comp?.amount ?? it.amount,
        };
      });
      return { ...prev, items };
    });
  };

  const handleUpdateLineScheme = (
    itemKey: string | number,
    promo: Promotion | null,
    promoLabel: string | null,
    schemeSkipped?: boolean
  ) => {
    setCart((prev) => {
      const items = prev.items.map((it) => {
        if (it.key !== itemKey) return it;
        const prod = products.find((p) => Number(p.id) === Number(it.productId));
        const comp = prod ? computeLine(prod, it.priceType, it.qty, promo, it.rate, 0) : null;
        return {
          ...it,
          appliedPromo: promo,
          promoLabel: promo ? schemeLabel(promo, products) : promoLabel,
          schemeSkipped: schemeSkipped !== undefined ? schemeSkipped : false,
          gross: comp?.gross ?? it.gross,
          freeQty: comp?.freeQty ?? 0,
          chargeableQty: comp?.chargeableQty ?? it.qty,
          discount: comp?.discount ?? 0,
          amount: comp?.amount ?? it.amount,
        };
      });
      return { ...prev, items };
    });
  };

  const handleRemoveLine = (itemKey: string | number) => {
    setCart((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.key !== itemKey),
    }));
  };

  // Finalize & Issue Bill
  const handleConfirmAndFinalizeBill = () => {
    const draftErrors = validateBillDraft({
      retailer: customerName,
      phone: customerPhone,
      date: saleDate,
      itemCount: cart.items.length,
      total: totals.total,
      amountPaid: paidAmount,
    });
    if (Object.keys(draftErrors).length > 0) {
      showNotification(summarizeErrors(draftErrors), 'warn');
      return;
    }

    const billCustomer = customerName.trim() || 'Cash Sale';
    const tripToAssign = stockSourceType === 'trip' && selectedTripId ? selectedTripId : undefined;

    let note = paymentNote || '';
    if (isRetrospective) {
      note = (note ? note + ' · ' : '') + 'Retrospective / uncaptured sale (stock already issued)';
    }
    const billId = finalizeBill(
      paidAmount,
      tripToAssign,
      currentDiscount,
      paymentDate,
      paymentMode,
      note || undefined,
      saleDate,
      {
        supplyType,
        customerGstin: supplyType === 'B2B' ? customerGstin.trim().toUpperCase() : undefined,
        isRetrospective,
        invoiceType: invoiceFormat === 'gst' ? 'tax_invoice' : 'retail',
        isGstInvoice: invoiceFormat === 'gst',
      }
    );

    if (billId !== null) {
      // Find created / updated bill
      const created = bills.find((b) => b.id === billId) || {
        ...totals,
        id: billId,
        retailer: billCustomer,
        phone: customerPhone,
        date: saleDate,
        items: cart.items,
        amountPaid: paidAmount,
        warehouseId: stockSourceType === 'warehouse' ? selectedWarehouseId : undefined,
        tripId: tripToAssign,
        vehicle: selectedTrip?.vehicle,
        salesman: selectedTrip?.salesman,
        salesmanId: selectedTrip?.salesmanId,
        additionalDiscount: currentDiscount,
        paymentDate,
        paymentMode,
        paymentNote,
        supplyType,
        customerGstin: supplyType === 'B2B' ? customerGstin.trim().toUpperCase() : undefined,
        invoiceType: invoiceFormat === 'gst' ? 'tax_invoice' : 'retail',
        isGstInvoice: invoiceFormat === 'gst',
        isRetrospective,
      };

      setFinalizedBill(created);
      setIsCheckoutOpen(false);
      showNotification(
        `✓ ${invoiceFormat === 'gst' ? 'GST Tax Invoice' : 'Non-GST Retail Bill'} #${billId} generated successfully!`,
        'success'
      );
    }
  };

  // Start fresh sale
  const handleStartNextInvoice = () => {
    setCustomerName('');
    setCustomerPhone('');
    setSupplyType('B2C');
    setInvoiceFormat('non_gst');
    setCustomerGstin('');
    setIsRetrospective(false);
    setSaleDate(todayISO());
    setOverallDiscountDraft('');
    setAmountPaidDraft('0');
    setPaymentNote('');
    setPaymentMode('credit');
    setBillingStep('party');
    setIsCheckoutOpen(false);
    setFinalizedBill(null);
    setCart({
      retailer: '',
      phone: '',
      date: todayISO(),
      items: [],
      warehouseId: selectedWarehouseId,
    });
  };

  // ===========================================================================
  // SCREEN: Invoice Success Confirmation (Dedicated screen like Salesman Mode)
  // ===========================================================================
  if (finalizedBill) {
    return (
      <div id="billing-invoice-success-screen" className="max-w-none lg:max-w-3xl mx-auto py-4 space-y-4 pb-36 sm:pb-40">
        <InvoiceSuccessCard
          bill={finalizedBill}
          onOpenInvoiceModal={onOpenInvoiceModal}
          onCreateNextBill={handleStartNextInvoice}
          onOpenHistory={onOpenHistory}
        />
      </div>
    );
  }

  // ===========================================================================
  // MAIN POS BILLING VIEW: Salesman-style Fast & Responsive Counter Sale
  // ===========================================================================
  return (
    <div id="admin-billing-workflow-root" className="space-y-4 pb-28">
      {/* Floating toast — does not consume vertical layout */}
      {notificationMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-3 right-3 top-16 sm:left-auto sm:right-6 sm:top-20 sm:max-w-sm z-[90] pointer-events-auto"
        >
          <div
            className={`px-3 py-2 rounded-xl border-2 shadow-xl flex items-center justify-between gap-2 text-xs font-bold ${
              notificationMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-950 border-emerald-400'
                : 'bg-amber-50 text-amber-950 border-amber-400'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {notificationMsg.type === 'success' ? (
                <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
              ) : (
                <AlertCircle size={16} className="text-amber-700 shrink-0" />
              )}
              <span className="truncate">{notificationMsg.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotificationMsg(null)}
              className="p-1 cursor-pointer text-slate-500 hover:text-slate-800 shrink-0"
              aria-label="Close notification"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Active Edit Bill Banner */}
      {editingBillId && (
        <div className="p-3 sm:p-4 rounded-2xl border-2 border-amber-400 bg-amber-50 flex items-center justify-between gap-3 flex-wrap shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
            <span className="text-sm font-black text-amber-950">
              Editing Invoice #{editingBillId} — {cart.retailer || 'Party'}
            </span>
          </div>
          <button
            type="button"
            onClick={cancelEditBill}
            className="px-3 py-1.5 rounded-xl border border-amber-300 text-xs font-black text-amber-900 bg-white hover:bg-amber-100 cursor-pointer shadow-sm"
          >
            Cancel Edit & Discard
          </button>
        </div>
      )}

      {/* Guided steps — pill bar (Crate-style) */}
      <div className="w-full overflow-x-auto no-scrollbar no-print">
        <div className="inline-flex min-w-full sm:min-w-0 sm:w-full bg-[#ebe8e1] rounded-full p-1 gap-0.5">
          {([
            { id: 'party' as const, label: 'Customer' },
            { id: 'products' as const, label: 'Products' },
            { id: 'settle' as const, label: 'Save bill' },
          ]).map((s) => {
            const active = billingStep === s.id;
            const done =
              (s.id === 'party' && (billingStep === 'products' || billingStep === 'settle')) ||
              (s.id === 'products' && billingStep === 'settle');
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id === 'party') {
                    setBillingStep('party');
                    setIsCheckoutOpen(false);
                  } else if (s.id === 'products') {
                    if (!customerName.trim()) {
                      showNotification('Select a customer first.', 'warn');
                      return;
                    }
                    setBillingStep('products');
                    setIsCheckoutOpen(false);
                  } else {
                    if (cart.items.length === 0) {
                      showNotification('Add beverages to the cart first.', 'warn');
                      return;
                    }
                    setBillingStep('settle');
                    setIsCheckoutOpen(true);
                  }
                }}
                className={`flex-1 min-w-[5.5rem] px-3 py-2.5 rounded-full text-xs sm:text-sm font-semibold cursor-pointer transition-all whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : done
                      ? 'text-[#0d4a3a]'
                      : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {billingStep === 'party' && (
      <div className="space-y-4">
      {/* ===================================================================== */}
      {/* SECTION 1: STOCK SOURCE SELECTOR (Warehouse Godown vs Van / Trip)     */}
      {/* ===================================================================== */}
      <StockSourcePanel
        stockSourceType={stockSourceType}
        onSourceTypeChange={(type) => {
          setStockSourceType(type);
          if (type === 'warehouse') {
            showNotification('Switched inventory source to Warehouse / Godown.', 'success');
          } else {
            showNotification('Switched inventory source to Van / Trip Dispatch.', 'success');
          }
        }}
        warehouses={warehouses}
        selectedWarehouseId={selectedWarehouseId}
        onWarehouseChange={setSelectedWarehouseId}
        warehouseStock={warehouseStock}
        trips={activeTrips}
        selectedTripId={selectedTripId}
        onTripChange={setSelectedTripId}
        selectedTrip={selectedTrip}
        paletteLine={palette.line}
      />

      {/* ===================================================================== */}
      
      {/* Smart billing assist — informational only */}
      {billingSmartHints.length > 0 && (
        <div
          id="billing-smart-assist"
          className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-sm space-y-1.5"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
            <Sparkles size={13} className="text-sky-600" />
            Smart assist
            <span className="font-medium normal-case tracking-normal text-slate-400">
              · hints only — sale logic unchanged
            </span>
          </div>
          {billingSmartHints.map((h) => (
            <div
              key={h.id}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${
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

{/* SECTION 2: CUSTOMER SELECTION & PRICING BAR (Salesman-style POS)      */}
      {/* ===================================================================== */}
      <div
        id="section-customer-and-pricing"
        className="p-3.5 sm:p-4 rounded-2xl border-2 bg-white shadow-sm space-y-3"
        style={{ borderColor: palette.line }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <User size={18} className="text-sky-700 shrink-0" />
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide shrink-0">
              Customer & Sale Details
            </h2>
            {customerName.trim() && (
              <span className="text-sm font-semibold text-slate-700 truncate max-w-[10rem] sm:max-w-[16rem]" title={customerName}>
                · {customerName}
              </span>
            )}
            {/* Cart icon beside customer name (replaces floating cart) */}
            <button
              type="button"
              id="btn-header-cart"
              onClick={() => {
                if (cart.items.length === 0) return;
                setBillingStep('settle');
                setIsCheckoutOpen(true);
              }}
              disabled={cart.items.length === 0}
              className={`relative ml-1 shrink-0 size-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                cart.items.length > 0
                  ? 'bg-[#0B3D32] border-[#0B3D32] text-white hover:brightness-110'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              title={cart.items.length > 0 ? `Cart · ${cart.items.length} item(s) · Review & settle` : 'Cart is empty'}
              aria-label={cart.items.length > 0 ? `Open cart, ${cart.items.length} items` : 'Cart empty'}
            >
              <ShoppingCart size={18} />
              {cart.items.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-400 text-slate-900 text-[11px] font-black flex items-center justify-center leading-none border border-white shadow-sm">
                  {cart.items.length > 99 ? '99+' : cart.items.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {cart.items.length > 0 && (
              <button
                type="button"
                id="btn-customer-clear-cart"
                onClick={() => setShowClearCartConfirm(true)}
                className="px-3 py-1.5 rounded-xl border-2 border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                title="Discard all items from current cart"
              >
                <Trash2 size={14} />
                <span className="hidden sm:inline">Clear</span>
                <span className="sm:hidden">({cart.items.length})</span>
              </button>
            )}

            {/* Quick Spot Cash Button */}
            <button
              type="button"
              id="btn-admin-spot-cash"
              onClick={() => {
                setCustomerName('Spot Cash / Counter Sale');
                setCustomerPhone('');
                setSupplyType('B2C');
                setInvoiceFormat('non_gst');
                setCustomerGstin('');
                setIsRetrospective(false);
                setBillingStep('products');
                showNotification('Selected Spot Cash customer (Non-GST B2C Retail Bill). All beverages ready.', 'success');
              }}
              className="px-3 py-1.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
            >
              <Zap size={15} className="text-emerald-600" />
              <span>Spot Cash Sale</span>
            </button>
          </div>
        </div>

        {/* Customer Quick Select with search & voice mic */}
        <CustomerQuickSelect
          customerName={customerName}
          onCustomerNameChange={(name) => {
            setCustomerName(name);
            // Typing a new name without GSTIN stays B2C
            if (supplyType === 'B2B' && !customerGstin) setSupplyType('B2C');
          }}
          onSelectCustomer={(c) => {
            setCustomerName(c.name);
            setCustomerPhone(c.phone || ''); // always overwrite: never keep the previous customer's phone
            if ((c as any).gstin) {
              setCustomerGstin(String((c as any).gstin).toUpperCase());
              setSupplyType('B2B');
              setInvoiceFormat('gst');
            } else {
              setCustomerGstin('');
              setSupplyType('B2C');
              setInvoiceFormat('non_gst');
            }
            // Stay on party step so user can set date, stock-from, GST before beverages
            showNotification(`Selected customer: ${c.name}. Set date / stock from / GST, then continue to beverages.`, 'success');
          }}
          customerPhone={customerPhone}
          onCustomerPhoneChange={setCustomerPhone}
          customers={existingCustomers}
          onOpenDirectory={() => setShowCustomerDirectoryModal(true)}
                    onSelectSpotSale={() => {
            setCustomerName('Spot Cash / Counter Sale');
            setCustomerPhone('');
            setSupplyType('B2C');
            setInvoiceFormat('non_gst');
            setCustomerGstin('');
            setIsRetrospective(false);
            setBillingStep('products');
            showNotification('Selected Spot Cash customer (Non-GST B2C Retail Bill). All beverages ready.', 'success');
          }}
        />

        {/* Invoice Format & Tax Document Option */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                Invoice Document Option
              </span>
              <p className="text-xs font-semibold text-slate-700 mt-0.5">
                Generate as official GST Tax Invoice or clean Non-GST Retail Bill:
              </p>
            </div>

            {/* GST vs Non-GST Main Selector */}
            <div className="inline-flex items-center rounded-xl border border-slate-300 p-1 bg-white shadow-xs">
              <button
                type="button"
                id="btn-bill-format-nongst"
                onClick={() => {
                  setInvoiceFormat('non_gst');
                  setSupplyType('B2C');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer transition-all ${
                  invoiceFormat === 'non_gst'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Generate clean Non-GST Retail Bill / Cash Memo without separate tax breakdown (Ideal for general consumers / B2C)"
              >
                <span>🛒 Non-GST (Retail Bill)</span>
              </button>

              <button
                type="button"
                id="btn-bill-format-gst"
                onClick={() => {
                  setInvoiceFormat('gst');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer transition-all ${
                  invoiceFormat === 'gst'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Generate official GST Tax Invoice with HSN code & CGST/SGST tax breakdown"
              >
                <span>🏢 GST (Tax Invoice)</span>
              </button>
            </div>
          </div>

          {/* Contextual Options based on selected format */}
          {invoiceFormat === 'non_gst' ? (
            <div className="rounded-lg bg-emerald-50/80 border border-emerald-200 p-2.5 text-xs text-emerald-950 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span className="text-emerald-700 font-black">✓</span>
                <span className="font-black">Non-GST Retail Bill / Cash Memo Active</span>
              </div>
              <p className="text-[11px] text-emerald-800 font-medium">
                Generates a clean customer bill without separate CGST/SGST or HSN codes. Perfect for regular consumers, retail walk-ins, and unregistered retail shops.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50/80 border border-amber-200 p-3 text-xs text-amber-950 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black text-amber-900 uppercase text-[10px] tracking-wider">
                  Tax Classification:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSupplyType('B2C');
                      setCustomerGstin('');
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-bold border cursor-pointer ${
                      supplyType === 'B2C'
                        ? 'bg-amber-600 text-white border-amber-700'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    B2C (Unregistered with GST Breakdown)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSupplyType('B2B')}
                    className={`px-2.5 py-1 rounded text-xs font-bold border cursor-pointer ${
                      supplyType === 'B2B'
                        ? 'bg-sky-600 text-white border-sky-700'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    B2B (Registered with GSTIN)
                  </button>
                </div>
              </div>

              {supplyType === 'B2B' ? (
                <div className="space-y-1 pt-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Customer GSTIN</label>
                  <input autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                    value={customerGstin}
                    onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                    placeholder="15-character GSTIN (e.g. 24ABCDE1234F1Z5)"
                    maxLength={15}
                    className="w-full sm:max-w-xs px-3 py-1.5 rounded-lg border-2 border-sky-300 text-xs font-mono font-bold uppercase bg-white"
                  />
                  <p className="text-[11px] text-slate-500">
                    B2B GSTIN will appear on the Tax Invoice for recipient Input Tax Credit (ITC).
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-amber-900 font-medium">
                  Reported under B2C supplies in GSTR-1 with official CGST/SGST tax breakdown.
                </p>
              )}
            </div>
          )}

          <label className="flex items-start gap-2 text-xs font-semibold text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={isRetrospective}
              onChange={(e) => setIsRetrospective(e.target.checked)}
            />
            <span>
              <strong>Missed / uncaptured sale</strong>
              <span className="block font-medium text-slate-500">
                Stock was already given; raise invoice now for GST & books. Use correct sale date. Reduces remaining stock once.
              </span>
            </span>
          </label>
        </div>

        {/* Custom Price Notice & Sale Date Row */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Custom Price & Scheme indicator */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 text-xs font-black flex items-center gap-1.5">
              <Tag size={13} className="text-sky-700" />
              <span>Custom Price & Scheme Enabled</span>
            </span>
            <span className="text-[11px] font-bold text-slate-500 hidden sm:inline">
              (Direct price editing & per-product scheme selection)
            </span>
          </div>

          {/* Sale Date Input */}
          <div className="flex items-center gap-2">
            <label htmlFor="admin-sale-date" className="text-xs font-extrabold text-slate-600 flex items-center gap-1">
              <Calendar size={14} className="text-slate-400" />
              <span>Sale Date:</span>
            </label>
            <input
              id="admin-sale-date"
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="px-2.5 py-1 rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:border-sky-600"
            />
          </div>
        </div>
      </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl border-2 border-sky-200 bg-sky-50/80">
          <div className="text-xs text-slate-600 font-semibold">
            <span className="font-black text-slate-900">Next:</span> pick beverages from{' '}
            <strong className="text-sky-800">
              {stockSourceType === 'trip'
                ? selectedTrip
                  ? `van ${selectedTrip.vehicle}`
                  : 'selected van'
                : warehouses.find((w) => w.id === selectedWarehouseId)?.name || 'godown'}
            </strong>{' '}
            stock only.
          </div>
          <button
            type="button"
            id="btn-billing-continue-products"
            onClick={() => {
              if (!customerName.trim()) {
                showNotification('Enter or select customer / party name first.', 'warn');
                return;
              }
              if (stockSourceType === 'trip' && !selectedTripId) {
                showNotification('Select an active van / trip as stock source.', 'warn');
                return;
              }
              if (stockSourceType === 'warehouse' && !selectedWarehouseId) {
                showNotification('Select a warehouse / godown as stock source.', 'warn');
                return;
              }
              setBillingStep('products');
              showNotification('Select beverages from available stock.', 'success');
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-sm cursor-pointer shadow-md"
          >
            Continue to Beverages & Crates
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 2: SELECT BEVERAGES (always visible & loaded for instant billing) */}
      {/* ===================================================================== */}
      {(billingStep === 'party' || billingStep === 'products') && (
      <div className="space-y-4">
        {billingStep === 'products' && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl border-2 border-sky-200 bg-gradient-to-r from-sky-50 to-white shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center font-black shrink-0 shadow-sm">
              <User size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Customer</span>
                <span className="font-black text-slate-900 text-base sm:text-lg truncate">
                  {customerName || 'Spot Cash Sale'}
                </span>
                {customerPhone && (
                  <span className="text-xs text-slate-500 font-bold font-mono">
                    ({customerPhone})
                  </span>
                )}
                {supplyType === 'B2B' && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300">
                    B2B {customerGstin ? `• ${customerGstin}` : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 mt-0.5 flex-wrap">
                <span>
                  Source:{' '}
                  <strong className="text-sky-800">
                    {stockSourceType === 'trip'
                      ? selectedTrip
                        ? `Van ${selectedTrip.vehicle}${selectedTrip.salesman ? ` (${selectedTrip.salesman})` : ''}`
                        : 'Van Stock'
                      : `Godown · ${warehouses.find((w) => w.id === selectedWarehouseId)?.name || 'Central Godown'}`}
                  </strong>
                </span>
                <span>•</span>
                <span className="text-emerald-700 font-bold">
                  {catalogStats.inStockAtSource} in stock ({catalogStats.totalCasesAtSource} cs)
                </span>
                <span>•</span>
                <span className="text-sky-700 font-black">
                  {products.length} catalog beverages loaded
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick 1-click Source Switcher */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
              <button
                type="button"
                onClick={() => {
                  setStockSourceType('warehouse');
                  showNotification('Inventory source set to Godown / Warehouse.', 'success');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                  stockSourceType === 'warehouse'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Bill from central Godown inventory"
              >
                <Building2 size={13} />
                <span>Godown ({warehouses.find((w) => w.id === selectedWarehouseId)?.name?.split(' ')[0] || 'Depot'})</span>
              </button>
              {trips.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStockSourceType('trip');
                    showNotification('Inventory source set to Van / Trip Dispatch.', 'success');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                    stockSourceType === 'trip'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Bill from vehicle / route van stock"
                >
                  <Truck size={13} />
                  <span>Van {selectedTrip ? selectedTrip.vehicle : 'Trip'}</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setBillingStep('party')}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer shadow-xs transition-colors"
            >
              ← Edit Customer / Source
            </button>
          </div>
        </div>
        )}

      {/* ===================================================================== */}
      {/* SECTION 3: BEVERAGE CATALOG GRID WITH STEPPERS & DIRECT ACTIONS       */}
      {/* ===================================================================== */}
      <div
        id="section-beverage-catalog"
        className="p-3.5 sm:p-4 rounded-2xl border-2 bg-white shadow-sm space-y-3"
        style={{ borderColor: palette.line }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-sky-700" />
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
              Select Beverages & Crates
            </h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200">
                {catalogStats.shown} shown
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                {catalogStats.inStockAtSource} in stock · {catalogStats.totalCasesAtSource} cs
              </span>
              <span className="text-slate-400 font-semibold hidden sm:inline">
                of {catalogStats.totalCatalog} products
              </span>
            </span>
          </div>

          {/* Voice Search Button */}
          <button
            type="button"
            id="btn-voice-search-catalog"
            onClick={handleStartProductVoice}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl border-2 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-all ${
              isVoiceActive
                ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                : 'bg-sky-50 hover:bg-sky-100 text-blue-950 border-blue-300'
            }`}
          >
            {isVoiceActive ? (
              <>
                <MicOff size={15} className="animate-spin" />
                <span>{voiceTranscript ? `"${voiceTranscript}"` : 'Listening item...'}</span>
              </>
            ) : (
              <>
                <Mic size={15} className="text-sky-700" />
                <span>Speak Item (e.g. "5 Apple Fizz")</span>
              </>
            )}
          </button>
        </div>

        {/* Search & Category Filter Controls */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input enterKeyHint="search"
                type="text"
                id="input-catalog-search"
                placeholder="Search beverages by name, SKU, pack..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-600 bg-white"
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

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black whitespace-nowrap cursor-pointer transition-colors ${
                    selectedCategory === cat
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Alphabet Jump & In-Stock Only */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-black text-slate-500 uppercase shrink-0">Jump:</span>
              {['ALL', 'A-D', 'E-H', 'I-L', 'M-P', 'Q-T', 'U-Z'].map((grp) => {
                const active = productAlphaFilter === grp;
                return (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setProductAlphaFilter(grp)}
                    className={`px-2 py-0.5 rounded text-xs font-black cursor-pointer transition-colors ${
                      active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {grp}
                  </button>
                );
              })}
            </div>

            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
                className="w-4 h-4 rounded text-sky-700 focus:ring-blue-800"
              />
              <span>In-Stock Only</span>
            </label>
          </div>
        </div>

        {/* BEVERAGE CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {filteredProducts.map((prod) => {
            const stock = getProductStock(prod.id);
            const inCartQty = getProductCartQty(prod.id);
            const isOutOfStock = stock.available <= 0;
            const currentRate = getProductCurrentRate(prod);
            const inCartItem = cart.items.find((it) => Number(it.productId) === Number(prod.id));
            const activePromo = customProductSchemes[prod.id] !== undefined
              ? customProductSchemes[prod.id]
              : (activePromoFor(prod.id) || inCartItem?.appliedPromo || null);
            const activePromoLabel = activePromo ? schemeLabel(activePromo, products) : null;

            return (
              <div
                key={prod.id}
                id={`beverage-card-${prod.id}`}
                onClick={() => {
                  // Direct tap on card adds 1 case if stock available
                  if (stock.available > 0) {
                    handleQuickCartChange(prod.id, 1);
                  }
                }}
                className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex flex-col justify-between cursor-pointer select-none ${
                  inCartQty > 0
                    ? 'border-sky-600 bg-sky-50/40 shadow-md ring-2 ring-blue-900/10'
                    : isOutOfStock
                    ? 'border-slate-200 bg-slate-50/70 opacity-60'
                    : 'border-slate-200 bg-white hover:border-blue-700 hover:shadow-sm'
                }`}
                style={{ borderLeftWidth: 6, borderLeftColor: sizeTheme(prod.volume, prod.name).hex }}
              >
                <div>
                  {/* FULL PRODUCT NAME & METADATA */}
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
                      {prod.unitsPerCrate ? <span>• {prod.unitsPerCrate} per case</span> : null}
                    </div>

                    {/* Scheme Selector Button right on product card */}
                    <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        id={`btn-card-scheme-${prod.id}`}
                        onClick={() => handleOpenSchemeModalForProduct(prod.id)}
                        className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-black flex items-center justify-between gap-1.5 border cursor-pointer transition-all ${
                          activePromo
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-400 shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                        }`}
                        title="Click to view or change scheme for this beverage"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Gift size={13} className={activePromo ? 'text-emerald-700 shrink-0' : 'text-slate-400 shrink-0'} />
                          <span className="truncate">
                            {activePromoLabel || 'No Scheme'}
                          </span>
                        </div>
                        <span className="text-[10px] text-sky-700 underline font-black shrink-0">Change</span>
                      </button>

                      {/* Active Scheme Status Feedback Banner on Card */}
                      {activePromo && inCartItem && inCartItem.freeQty > 0 && (
                        <div className="px-2 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-900 text-[10px] font-black flex items-center gap-1 shadow-xs">
                          <CheckCircle2 size={11} className="text-emerald-700 shrink-0" />
                          <span>+{inCartItem.freeQty} free of {inCartItem.qty} ({inCartItem.chargeableQty} paid)</span>
                        </div>
                      )}
                      {activePromo && inCartItem && inCartItem.discount > 0 && inCartItem.freeQty === 0 && (
                        <div className="px-2 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-900 text-[10px] font-black flex items-center gap-1 shadow-xs">
                          <CheckCircle2 size={11} className="text-emerald-700 shrink-0" />
                          <span>Scheme Discount: −₹{money(inCartItem.discount)} Applied</span>
                        </div>
                      )}
                      {activePromo && activePromo.type === 'bogo' && inCartQty > 0 && inCartItem && (inCartItem.freeQty || 0) === 0 && (
                        <div className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[10px] font-bold flex items-center gap-1">
                          <Gift size={11} className="text-amber-700 shrink-0" />
                          <span>
                            {(() => {
                              const buy = Math.max(1, Number(activePromo.buyQty) || 2);
                              const free = Math.max(1, Number(activePromo.freeQty) || 1);
                              const cycle = buy + free;
                              const need = cycle - (inCartQty % cycle);
                              return need < cycle
                                ? `Add ${need} more cs for +${free} free (Buy ${buy} Get ${free})`
                                : `Buy ${buy} Get ${free}: need ${cycle} cs total`;
                            })()}
                          </span>
                        </div>
                      )}
                      {activePromo && activePromo.type === 'bundle' && inCartQty > 0 && inCartItem && inCartItem.freeQty === 0 && (
                        <div className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[10px] font-bold flex items-center gap-1">
                          <Sparkles size={11} className="text-purple-700 shrink-0" />
                          <span>Combo deal: Add qualifying beverages to earn free reward!</span>
                        </div>
                      )}
                      {activePromo && inCartQty === 0 && (
                        <div className="px-2 py-0.5 rounded-md bg-emerald-50/90 border border-emerald-200 text-emerald-900 text-[10px] font-bold flex items-center gap-1">
                          <Sparkles size={10} className="text-emerald-700 shrink-0" />
                          <span className="truncate">Scheme: {activePromoLabel || activePromo.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RATE & LIVE STOCK ROW (Direct Custom Price Entry) */}
                  <div className="flex items-center justify-between gap-2 py-2 border-t border-slate-100 flex-wrap">
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <label htmlFor={`rate-input-${prod.id}`} className="text-xs font-black text-slate-700">
                        Rate:
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-2 text-xs font-black text-slate-400">₹</span>
                        <input
                          id={`rate-input-${prod.id}`}
                          type="number" inputMode="numeric"
                          step="any"
                          min="0"
                          value={currentRate}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            handleSetProductRate(prod.id, val);
                          }}
                          className="w-24 pl-5 pr-2 py-1 text-sm font-black text-slate-900 bg-white rounded-xl border-2 border-slate-300 focus:border-sky-600 focus:outline-none shadow-sm"
                          title="Enter custom price per case"
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500">/cs</span>
                      <button
                        type="button"
                        onClick={() => handleSetProductRate(prod.id, 0)}
                        className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold border transition-colors cursor-pointer ${
                          currentRate === 0
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                        title="Set rate to ₹0 (Free sample / promotional gift)"
                      >
                        ₹0 Free
                      </button>
                      {getPreviousCustomPrice(prod.id, customerName) !== null && (
                        <span
                          className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300"
                          title="Previous custom price loaded"
                        >
                          Custom
                        </span>
                      )}
                    </div>

                    {/* Stock Badge — source total and remaining after cart */}
                    <div
                      className={`px-2.5 py-1 rounded-lg text-xs font-black tracking-tight flex items-center gap-1.5 flex-wrap ${
                        isOutOfStock
                          ? 'bg-rose-100 text-rose-900 border border-rose-300'
                          : getSellableRemaining(prod.id) < 10
                          ? 'bg-amber-100 text-amber-950 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                      }`}
                    >
                      <span>{stock.label}</span>
                      {inCartQty > 0 && stock.available > 0 && (
                        <span className="opacity-80 font-bold">
                          · left {getSellableRemaining(prod.id)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* DIRECT STEPPER / ADD ACTIONS */}
                <div className="pt-2.5 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                  {isOutOfStock ? (
                    <div className="space-y-1">
                      {stockSourceType === 'trip' && remainingStock(prod.id) > 0 ? (
                        <button
                          type="button"
                          id={`btn-add-from-godown-${prod.id}`}
                          onClick={() => {
                            setStockSourceType('warehouse');
                            handleQuickCartChange(prod.id, 1);
                            showNotification(`Switched source to Godown (${remainingStock(prod.id)} cs available) and added 1 case.`, 'success');
                          }}
                          className="w-full min-h-[44px] py-2 px-3 rounded-xl font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                          title="This product is in Godown — switch to Godown and add"
                        >
                          <Building2 size={14} />
                          <span>+ Add from Godown ({remainingStock(prod.id)} cs)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          id={`btn-add-anyway-${prod.id}`}
                          onClick={() => handleQuickCartChange(prod.id, 1)}
                          className="w-full min-h-[42px] py-2 px-3 rounded-xl font-bold text-xs bg-slate-700 hover:bg-slate-800 text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                        >
                          <Plus size={14} />
                          <span>+ Add to Bill (0 cs in {stockSourceType === 'trip' ? 'van' : 'depot'})</span>
                        </button>
                      )}
                    </div>
                  ) : inCartQty === 0 ? (
                    <button
                      type="button"
                      id={`btn-add-beverage-${prod.id}`}
                      onClick={() => handleQuickCartChange(prod.id, 1)}
                      className="w-full min-h-[44px] py-2 px-4 rounded-xl font-black text-sm bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors"
                    >
                      <Plus size={16} />
                      <span>Add Case</span>
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 bg-white rounded-xl border-2 border-sky-600 p-1">
                        <button
                          type="button"
                          id={`btn-decrease-beverage-${prod.id}`}
                          onClick={() => handleQuickCartChange(prod.id, -1)}
                          className="w-10 h-10 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 flex items-center justify-center cursor-pointer transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={18} />
                        </button>

                        <div className="text-center font-black text-base text-blue-950 px-2">
                          <span>{inCartQty}</span>
                          <span className="text-[11px] text-slate-500 font-normal block -mt-0.5">cases in cart</span>
                        </div>

                        <button
                          type="button"
                          id={`btn-increase-beverage-${prod.id}`}
                          onClick={() => handleQuickCartChange(prod.id, 1)}
                          className="w-10 h-10 rounded-lg bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center cursor-pointer transition-colors shadow-sm"
                          aria-label="Increase quantity"
                        >
                          <Plus size={18} />
                        </button>
                      </div>

                      {/* Quick +5 and +10 chips & Remove */}
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setCart((prev) => ({
                              ...prev,
                              items: prev.items.filter((it) => it.productId !== prod.id),
                            }));
                            showNotification(`Removed ${prod.name} from cart`, 'warn');
                          }}
                          className="px-2 py-0.5 rounded text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer flex items-center gap-1"
                          title="Remove this beverage from cart"
                        >
                          <Trash2 size={11} />
                          <span>Remove</span>
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuickCartChange(prod.id, 5)}
                            className="px-2 py-0.5 rounded text-[11px] font-black bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          >
                            +5 cs
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickCartChange(prod.id, 10)}
                            className="px-2 py-0.5 rounded text-[11px] font-black bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          >
                            +10 cs
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredProducts.length === 0 && (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 space-y-2">
            <div className="text-slate-800 font-black text-sm">No beverages to show</div>
            <p className="text-xs text-slate-500 font-semibold max-w-md mx-auto">
              {catalogStats.inStockAtSource === 0
                ? stockSourceType === 'trip'
                  ? 'No cases loaded on this van, or no trip selected. Switch stock source or load the van first.'
                  : 'No stock in the selected godown. Switch warehouse or receive an inward first.'
                : 'Try clearing search / category filters, or turn off “In stock only”.'}
            </p>
            <div className="text-[11px] font-bold text-slate-400">
              Catalog: {catalogStats.totalCatalog} · In stock here: {catalogStats.inStockAtSource} · Cases: {catalogStats.totalCasesAtSource}
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* SECTION 4: STICKY FLOATING CART BAR (Always accessible)               */}
      {/* ===================================================================== */}
      {qualifiedBundlePromos.filter((q) => q.res.isQualified && q.res.freeCasesAwarded > 0).map(({ bp, res }) => (
        <div
          key={`bar_bundle_${bp.id}`}
          className="fixed bottom-22 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto sm:min-w-[420px] z-40 p-2.5 rounded-xl border-2 border-emerald-400 bg-emerald-50/95 backdrop-blur-md shadow-lg flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-1.5 text-xs font-black text-emerald-950 truncate">
            <Gift size={15} className="text-emerald-700 shrink-0" />
            <span className="truncate">
              {bp.type === 'buy_x_get_different_free'
                ? `Buy A Get B Active: ${bp.name}`
                : bp.type === 'group_buy_n_get_m_free'
                ? `Group Scheme Active: ${bp.name}`
                : `Combo Scheme Active: ${bp.name}`} (+{res.freeCasesAwarded} Free)
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black shrink-0">
            ✓ Auto-Applied (₹0.00)
          </span>
        </div>
      ))}



      </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 3: REVIEW INVOICE & SETTLE — FULL SCREEN                         */}
      {/* ===================================================================== */}
      {(billingStep === 'settle' || isCheckoutOpen) && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-hidden"
        >
          <div className="w-full h-full bg-white flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Review Invoice & Settle Payment
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Party: <strong className="text-slate-900">{customerName || 'Cash Sale'}</strong> •{' '}
                  Source:{' '}
                  <strong className="text-sky-700">
                    {stockSourceType === 'warehouse'
                      ? warehouses.find((w) => w.id === selectedWarehouseId)?.name || 'Godown'
                      : selectedTrip?.vehicle || 'Trip'}
                  </strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => { setBillingStep('products'); setIsCheckoutOpen(false); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                ← Back to beverages
              </button>
            </div>

            {/* Content Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Line Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 flex items-center justify-between">
                  <span>Beverage Item</span>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="w-16 sm:w-20 text-center">Cases</span>
                    <span className="w-20 sm:w-24 text-right">Price (₹/cs)</span>
                    <span className="w-24 sm:w-28 text-center">Scheme</span>
                    <span className="w-18 sm:w-20 text-right">Amount</span>
                    <span className="w-6" />
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {cart.items.map((it) => (
                    <div key={it.key} className="p-3 flex items-center justify-between text-xs gap-2 flex-wrap sm:flex-nowrap">
                      <div className="flex-1 min-w-[140px]">
                        <div className="font-extrabold text-slate-900 break-words leading-snug">
                          {it.productName}{' '}
                          <SizeChip volume={products.find((p) => p.id === it.productId)?.volume} pack={products.find((p) => p.id === it.productId)?.pack} name={it.productName} className="align-middle" />
                        </div>
                        <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-1.5 flex-wrap">
                          <span>{it.category}</span>
                          {it.freeQty > 0 && (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              +{it.freeQty} free of {it.qty} ({it.chargeableQty} paid)
                            </span>
                          )}
                          {it.discount > 0 && (
                            <span className="text-emerald-700 font-bold">
                              Disc: -₹{money(it.discount)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        {/* Stepper */}
                        <div className="flex items-center border border-slate-300 rounded-lg bg-white">
                          <button
                            type="button"
                            onClick={() => handleUpdateLineQty(it.key, it.qty - 1)}
                            className="p-1 hover:bg-slate-100 cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="w-8 text-center font-black">{it.qty}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateLineQty(it.key, it.qty + 1)}
                            className="p-1 hover:bg-slate-100 cursor-pointer"
                            aria-label="Increase quantity"
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        {/* Editable Custom Price in Cart Review */}
                        <div className="w-20 sm:w-24 flex items-center gap-0.5 justify-end">
                          <span className="text-slate-400 font-bold text-xs">₹</span>
                          <input
                            type="number" inputMode="numeric"
                            step="any"
                            min="0"
                            value={it.rate}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              handleUpdateLineRate(it.key, val);
                            }}
                            className="w-16 sm:w-20 px-1.5 py-1 text-right text-xs font-black text-blue-950 bg-white rounded-lg border-2 border-slate-300 focus:border-sky-600 focus:outline-none shadow-sm"
                            title="Edit custom rate per case"
                          />
                        </div>

                        {/* Editable Scheme in Cart Review */}
                        <button
                          type="button"
                          onClick={() => handleOpenSchemeModalForLine(it)}
                          className="w-24 sm:w-28 px-1.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-bold text-slate-800 flex items-center justify-between gap-1 shadow-sm cursor-pointer truncate"
                          title="Change scheme for this line item"
                        >
                          <span className="truncate">{it.promoLabel || 'No Scheme'}</span>
                          <Gift size={12} className={it.promoLabel ? 'text-emerald-600 shrink-0' : 'text-slate-400 shrink-0'} />
                        </button>

                        {/* Amount */}
                        <span className="w-18 sm:w-20 text-right font-black text-slate-950">
                          ₹{money(it.amount)}
                        </span>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(it.key)}
                          className="w-6 p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Combo / Bundle Scheme Free Rewards Claim Banner */}
              {qualifiedBundlePromos.filter((q) => q.res.isQualified && q.res.freeCasesAwarded > 0).map(({ bp, res }) => {
                const existingFreeItem = cart.items.find((it) => it.bundlePromoId === bp.id);
                const alreadyClaimed = !!existingFreeItem;
                const activeRewardProd = existingFreeItem
                  ? products.find((p) => Number(p.id) === Number(existingFreeItem.productId))
                  : null;
                const rewardProd = activeRewardProd || res.defaultFreeProduct || res.eligibleRewardProducts[0] || products[0];
                const rule = bp.freeItemRule || bp.freeItem || 'CHEAPEST_IN_GROUP';
                return (
                  <div
                    key={bp.id}
                    className="p-3.5 rounded-2xl border-2 border-emerald-300 bg-emerald-50/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <Gift size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-emerald-950 flex items-center gap-1.5 flex-wrap">
                          <span>
                            {bp.type === 'buy_x_get_different_free'
                              ? `Buy A Get B Free: ${bp.name}`
                              : bp.type === 'group_buy_n_get_m_free'
                              ? `Group Buy N Get M: ${bp.name}`
                              : `Combo Scheme Qualified: ${bp.name}`}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-900 text-[10px] font-black uppercase">
                            Free Reward
                          </span>
                          {bp.type === 'group_buy_n_get_m_free' && (
                            <span className="px-1.5 py-0.2 rounded bg-teal-100 text-teal-800 text-[10px] font-bold">
                              {rule === 'CHEAPEST_IN_GROUP'
                                ? 'Cheapest in Group'
                                : rule === 'SAME_AS_LAST_ADDED'
                                ? 'Last Added in Group'
                                : rule === 'SPECIFIC_PRODUCT'
                                ? 'Designated Free SKU'
                                : 'Choice from Group'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-emerald-800 font-semibold mt-0.5">
                          {res.qualifyingProductNames.join(' + ')} · Unlocked {res.freeCasesAwarded} Free Case(s)
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                      {/* If multiple eligible reward products, let cashier pick which one they want free! */}
                      {res.eligibleRewardProducts.length > 1 && (
                        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-emerald-300 shadow-xs">
                          <label className="text-[11px] font-bold text-emerald-950 shrink-0">Free SKU:</label>
                          <select
                            value={rewardProd ? rewardProd.id : ''}
                            onChange={(e) => {
                              const chosen = products.find((p) => Number(p.id) === Number(e.target.value));
                              if (chosen) {
                                handleAddBundleFreeReward(bp, chosen, res.freeCasesAwarded);
                              }
                            }}
                            className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                            title="Choose which eligible product to receive as the free case"
                          >
                            {res.eligibleRewardProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (Free ₹0.00)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {alreadyClaimed ? (
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center gap-1.5 shadow-sm">
                          <CheckCircle2 size={15} />
                          <span>1 Free {rewardProd ? rewardProd.name : ''} in Bill (₹0.00)</span>
                        </span>
                      ) : (
                        rewardProd && (
                          <button
                            type="button"
                            onClick={() => handleAddBundleFreeReward(bp, rewardProd, res.freeCasesAwarded)}
                            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                          >
                            <Gift size={15} />
                            <span>+ Claim Free {rewardProd.name} (₹0.00)</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Payment Collection Panel */}
              <PaymentCollectionPanel
                totalAmount={totals.total}
                subtotal={totals.subtotal}
                overallDiscountDraft={overallDiscountDraft}
                onDiscountChange={setOverallDiscountDraft}
                onApplyQuickDiscount={handleApplyQuickDiscount}
                paymentMode={paymentMode}
                onPaymentModeChange={setPaymentMode}
                amountPaidDraft={amountPaidDraft}
                onAmountPaidChange={setAmountPaidDraft}
                balanceDue={balanceDue}
                isPaidInFull={isPaidInFull}
                paymentDate={paymentDate}
                onPaymentDateChange={setPaymentDate}
                paymentNote={paymentNote}
                onPaymentNoteChange={setPaymentNote}
              />

              {/* Document Option for this Sale */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Document Type to Generate:
                  </span>
                  <span
                    className={`text-[11px] font-black uppercase px-2 py-0.5 rounded border ${
                      invoiceFormat === 'gst'
                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    }`}
                  >
                    {invoiceFormat === 'gst' ? '🏢 GST Tax Invoice' : '🛒 Non-GST Retail Bill'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceFormat('non_gst');
                      setSupplyType('B2C');
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      invoiceFormat === 'non_gst'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600'
                    }`}
                    title="Generate clean Non-GST Retail Bill / Cash Memo (B2C)"
                  >
                    <span>🛒 Non-GST (Retail Bill)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceFormat('gst')}
                    className={`p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      invoiceFormat === 'gst'
                        ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-xs ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600'
                    }`}
                    title="Generate official GST Tax Invoice with tax breakdown"
                  >
                    <span>🏢 GST (Tax Invoice)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Actions — sticky footer like Crate Save bill */}
            <div className="p-4 sm:p-5 border-t border-black/5 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5 text-sm text-slate-600 order-2 sm:order-1">
                <div className="flex justify-between sm:justify-start sm:gap-6 gap-4">
                  <span>Taxable</span>
                  <span className="font-semibold text-slate-800 tabular-nums">₹{money(totals.subtotal || 0)}</span>
                </div>
                <div className="flex justify-between sm:justify-start sm:gap-6 gap-4 text-xs text-slate-500">
                  <span>CGST + SGST</span>
                  <span className="font-semibold tabular-nums">₹{money((totals.cgst || 0) + (totals.sgst || 0))}</span>
                </div>
                <div className="flex justify-between sm:justify-start sm:gap-6 gap-4 text-base font-bold text-slate-900 pt-0.5">
                  <span className="sr-only sm:not-sr-only sm:hidden">Total</span>
                  <span className="tabular-nums">₹{money(totals.total)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 order-1 sm:order-2 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => { setBillingStep('products'); setIsCheckoutOpen(false); }}
                  className="px-3.5 py-2.5 rounded-full border border-black/10 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-[#f6f4ef] cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  id="btn-confirm-final-invoice"
                  onClick={handleConfirmAndFinalizeBill}
                  className="px-5 py-2.5 rounded-full bg-[#0d4a3a] hover:bg-[#0a3d30] text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.99]"
                >
                  <span>+ Save bill</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* CUSTOMER DIRECTORY MODAL                                              */}
      {/* ===================================================================== */}
      {showCustomerDirectoryModal && (
        <CustomerSelector
          customers={existingCustomers}
          onSelect={(c) => {
            setCustomerName(c.name);
            if ((c as any).gstin) {
              setCustomerGstin(String((c as any).gstin).toUpperCase());
              setSupplyType('B2B');
              setInvoiceFormat('gst');
            } else {
              setCustomerGstin('');
              setSupplyType('B2C');
              setInvoiceFormat('non_gst');
            }
            setCustomerPhone(c.phone || ''); // always overwrite: never keep the previous customer's phone
            setShowCustomerDirectoryModal(false);
            // Stay on party step — complete date / stock-from / GST, then Continue to Beverages
            showNotification(`Selected customer: ${c.name}. Set date / stock from / GST, then continue to beverages.`, 'success');
          }}
          onClose={() => setShowCustomerDirectoryModal(false)}
          palette={palette}
          scale={scale}
          currentRetailer={customerName}
        />
      )}

      {/* ===================================================================== */}
      {/* PRODUCT SCHEME SELECTOR MODAL (Cart & Product level)                   */}
      {/* ===================================================================== */}
      {schemeModalTarget && (
        <SchemeSelectorModal
          product={schemeModalTarget.product}
          currentRate={schemeModalTarget.currentRate}
          currentScheme={schemeModalTarget.currentScheme}
          currentPromoLabel={schemeModalTarget.currentPromoLabel}
          availablePromotions={promotions}
          products={products}
          onSelectScheme={handleSchemeSelected}
          onClose={() => setSchemeModalTarget(null)}
        />
      )}

      {/* In-app Clear / Cancel Cart Confirmation Dialog */}
      {showClearCartConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border-2 border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Clear Cart & Discard Sale?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Are you sure you want to remove all {totalCasesInCart} crate(s) from the active bill?
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <div className="flex justify-between font-bold">
                <span>Items in cart:</span>
                <span>{cart.items.length} beverage line(s)</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total cases:</span>
                <span>{totalCasesInCart} cs</span>
              </div>
              <div className="flex justify-between font-black text-slate-900">
                <span>Total value:</span>
                <span>₹{money(totals.total)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearCartConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Keep Cart
              </button>
              <button
                type="button"
                id="btn-confirm-discard-cart"
                onClick={handleClearCart}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
              >
                <Trash2 size={14} />
                <span>Yes, Clear Cart</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
