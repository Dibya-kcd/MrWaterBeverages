import React, { useState, useEffect, useMemo } from 'react';
import { notify } from "../../utils/toast";
import {
  X,
  Plus,
  Trash2,
  Save,
  UserCheck,
  Building2,
  Calendar,
  Phone,
  Tag,
  Percent,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ShoppingCart,
  Truck,
  FileText,
  ChevronDown,
  ChevronUp,
  Search,
  RotateCcw,
} from 'lucide-react';
import { Bill, BillItem, ExistingCustomer, PriceType, Product, Promotion, Trip, Warehouse } from '../../types';
import type { BillEditPreview } from '../../context/LedgerContext';
import { CATS } from '../../constants/initialData';
import { billTotals, issuedGstMode, isWholeRupee, computeLine,
  normalizeGstFraction, money, schemeLabel, statusOf, resolveProductGstRate, resolveProductHsn } from '../../utils/billing';
import { CustomerSelector } from './CustomerSelector';
import { SizeChip } from './SizeChip';
import { sizeStripe } from '../../utils/sizeColor';
import { ConfirmModal } from '../ui/ConfirmModal';
import { todayISO } from "../../utils/dateLocal";

interface EditBillModalProps {
  bill: Bill | null;
  onClose: () => void;
  /** Return true when saved. The modal stays open (nothing is lost) when this returns false. */
  onSave: (updatedBill: Bill, opts: { comment: string; requestedPaid?: number }) => boolean | void;
  /** Dry run: what changed, does it touch stock, what would block it. */
  previewEdit?: (bill: Bill, requestedPaid?: number) => BillEditPreview;
  /** Reopen the trip this bill was sold from (stock changes on closed trips need this). */
  onReopenTrip?: (tripId: number) => void;
  trips?: Trip[];
  onRequestDelete: (bill: Bill) => void;
  products: Product[];
  promotions: Promotion[];
  warehouses: Warehouse[];
  existingCustomers: ExistingCustomer[];
  gstMode: 'inclusive' | 'exclusive' | 'off';
  palette: any;
  invoicePrefix?: string;
  remainingStock: (productId: number) => number;
}

export const EditBillModal: React.FC<EditBillModalProps> = ({
  bill,
  onClose,
  onSave,
  previewEdit,
  onReopenTrip,
  trips,
  onRequestDelete,
  products,
  promotions,
  warehouses,
  existingCustomers,
  gstMode,
  palette,
  invoicePrefix = '',
  remainingStock,
}) => {
  // Form State initialized from the clicked bill
  const [retailer, setRetailer] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [items, setItems] = useState<BillItem[]>([]);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [invoiceFormat, setInvoiceFormat] = useState<'gst' | 'non_gst'>('non_gst');
  const [customerGstin, setCustomerGstin] = useState('');
  const [ewayBillNo, setEwayBillNo] = useState('');
  const [irn, setIrn] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [transportDistanceKm, setTransportDistanceKm] = useState('');
  const [editComment, setEditComment] = useState('');
  const [saveError, setSaveError] = useState('');
  // The finished edit waiting for the user's "yes, save" (stock and payment effects are shown first).
  const [pendingBill, setPendingBill] = useState<Bill | null>(null);

  // New item draft inside the modal (collapsed link by default to save mobile space)
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number>(products[0]?.id || 0);
  const [draftPriceType, setDraftPriceType] = useState<PriceType>('Retail');
  const [draftQty, setDraftQty] = useState<number>(1);
  const [draftCustomRate, setDraftCustomRate] = useState<string>('');

  // Customer Selector Popup
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  // Pre-fill draft rate with base price when selected product or price type changes
  // (Depends on the price itself, not on the products array, which is a new array after every
  // background sync and used to wipe the rate you were typing.)
  const draftProduct = products.find((p) => p.id === selectedProductId);
  const draftBasePrice = draftProduct
    ? draftPriceType === 'Retail'
      ? draftProduct.retail
      : draftProduct.wholesale
    : undefined;
  useEffect(() => {
    if (!selectedProductId || !draftProduct) return;
    setDraftCustomRate(draftBasePrice ? String(draftBasePrice) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId, draftPriceType, draftBasePrice]);

  useEffect(() => {
    if (bill) {
      setRetailer(bill.retailer || '');
      setPhone(bill.phone || '');
      setDate(bill.date || todayISO());
      setWarehouseId(bill.warehouseId || '');
      setItems(bill.items ? JSON.parse(JSON.stringify(bill.items)) : []);
      setAmountPaid(bill.amountPaid || 0);
      const isGst =
        bill.invoiceType === 'tax_invoice' || bill.isGstInvoice === true
          ? true
          : bill.invoiceType === 'retail' || bill.invoiceType === 'bill_of_supply' || bill.isGstInvoice === false
            ? false
            : bill.supplyType === 'B2B' && Boolean(bill.customerGstin);
      setInvoiceFormat(isGst ? 'gst' : 'non_gst');
      setCustomerGstin(bill.customerGstin || '');
      setEwayBillNo(bill.ewayBillNo || '');
      setIrn(bill.irn || '');
      setTransporterName(bill.transporterName || '');
      setTransportDistanceKm(bill.transportDistanceKm ? String(bill.transportDistanceKm) : '');
      setEditComment('');
      setSaveError('');
      setIsAddingProduct(false);
    }
  }, [bill?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showCustomerPicker) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showCustomerPicker]);

  const activePromoForProduct = (productId: number): Promotion | null => {
    return (
      promotions.find(
        (promo) => promo.type !== 'bundle' && promo.productIds?.includes(productId)
      ) || null
    );
  };

  // Recalculate an item when qty or rate or priceType or scheme changes
  const updateLineItem = (
    index: number,
    updates: {
      qty?: number;
      rate?: number;
      priceType?: PriceType;
      toggleScheme?: boolean;
    }
  ) => {
    setItems((prevItems) => {
      const next = [...prevItems];
      const item = next[index];
      if (!item) return prevItems;

      const product = products.find((p) => p.id === item.productId);
      const promo = activePromoForProduct(item.productId);

      const newPriceType = updates.priceType || item.priceType || 'Retail';
      let newRate = updates.rate !== undefined ? updates.rate : item.rate;

      // If priceType changed and user didn't explicitly override rate, update default rate
      if (updates.priceType && updates.rate === undefined && product) {
        newRate = newPriceType === 'Retail' ? product.retail : product.wholesale;
      }

      const newQty = updates.qty !== undefined ? Math.max(1, updates.qty) : item.qty;

      let isSchemeActive = !item.schemeSkipped;
      if (updates.toggleScheme !== undefined) {
        isSchemeActive = updates.toggleScheme;
      }

      const appliedPromo = isSchemeActive ? promo : null;
      const computed = product
        ? computeLine(product, newPriceType, newQty, appliedPromo, newRate)
        : {
            rate: newRate,
            gross: newQty * newRate,
            freeQty: 0,
            chargeableQty: newQty,
            discount: 0,
            amount: newQty * newRate,
          };

      next[index] = {
        ...item,
        qty: newQty,
        rate: newRate,
        priceType: newPriceType,
        gross: computed.gross,
        freeQty: computed.freeQty,
        chargeableQty: computed.chargeableQty,
        discount: computed.discount,
        amount: computed.amount,
        promoLabel: appliedPromo ? schemeLabel(appliedPromo) : null,
        schemeSkipped: !isSchemeActive,
      };

      return next;
    });
  };

  const removeLineItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addDraftItem = () => {
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const baseRate = draftPriceType === 'Retail' ? product.retail : product.wholesale;
    const rate = draftCustomRate !== '' 
      ? Math.max(0, Number(draftCustomRate)) 
      : baseRate;
    const qty = Math.max(1, draftQty);

    const promo = activePromoForProduct(product.id);
    const computed = computeLine(product, draftPriceType, qty, promo, rate);

    const newItem: BillItem = {
      key: `${product.id}-${Date.now()}-${Math.random()}`,
      productId: product.id,
      productName: product.name,
      category: product.category,
      priceType: draftPriceType,
      qty,
      rate,
      gross: computed.gross,
      freeQty: computed.freeQty,
      chargeableQty: computed.chargeableQty,
      discount: computed.discount,
      amount: computed.amount,
      gst: resolveProductGstRate(product),
      promoLabel: promo ? schemeLabel(promo) : null,
      schemeSkipped: false,
      batchNumber: product.batchNumber,
      hsn: resolveProductHsn(product),
      expiryDate: product.expiry,
      warehouseId: product.warehouseId,
    };

    setItems((prev) => [...prev, newItem]);
    setDraftQty(1);
    setDraftCustomRate('');
  };

  // Live Recalculated Financials
  // An edit must never change the invoice's money just because it was opened and saved:
  //  - the invoice-level (trade) discount saved on the bill is kept, and
  //  - the bill keeps the GST treatment it was issued with (the app-wide GST switch may have changed since).
  const keptExtraDiscount = Math.max(0, Number(bill?.additionalDiscount) || 0);
  const editGstMode: 'inclusive' | 'exclusive' | 'off' = useMemo(
    () => (bill ? issuedGstMode(bill, gstMode) : gstMode),
    [bill, gstMode],
  );
  const totals = useMemo(() => {
    // A bill issued without round-off stays unrounded, so opening and saving it changes nothing.
    return billTotals(items, editGstMode, keptExtraDiscount, { round: bill ? isWholeRupee(bill.total) : undefined });
  }, [items, editGstMode, keptExtraDiscount, bill]);

  const dueBalance = Math.max(0, totals.total - amountPaid);
  const status = statusOf(totals.total, amountPaid);

  // Draft of the bill as currently edited (used for the live stock-impact preview and for saving).
  const draftBill: Bill | null = bill
    ? {
        ...bill,
        retailer: retailer.trim(),
        phone: phone.trim(),
        date,
        // A bill sold from a trip / specific godown keeps it: an empty selection must not silently
        // move the sale to the default godown.
        warehouseId: warehouseId || bill.warehouseId,
        items,
        subtotal: totals.subtotal,
        cgst: totals.cgst,
        sgst: totals.sgst,
        total: totals.total,
        discount: totals.discount,
        amountPaid: Math.min(totals.total, Math.max(0, amountPaid)),
      }
    : null;
  const preview: BillEditPreview | null = useMemo(
    () => (draftBill && previewEdit ? previewEdit(draftBill, Math.max(0, amountPaid)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bill?.id, retailer, phone, date, warehouseId, items, amountPaid, totals.total, trips],
  );
  const sourceTrip =
    preview?.source.kind === 'trip' && trips
      ? trips.find((t) => Number(t.id) === preview.source.tripId)
      : undefined;
  const blockedByStock = !!preview && preview.problems.length > 0;

  if (!bill) return null;

  const handleSave = () => {
    if (!retailer.trim()) {
      notify('Please enter or select a retailer name.');
      return;
    }
    if (items.length === 0) {
      notify('The bill must contain at least one product line item.');
      return;
    }

    if (preview && preview.problems.length > 0) {
      setSaveError(preview.problems.join('\n'));
      return;
    }

    const updatedBill: Bill = {
      ...bill,
      id: bill.id,
      retailer: retailer.trim(),
      phone: phone.trim(),
      date,
      warehouseId: warehouseId || bill.warehouseId,
      items,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      total: totals.total,
      discount: totals.discount,
      amountPaid: Math.min(totals.total, Math.max(0, amountPaid)),
      supplyType: invoiceFormat === 'gst' && customerGstin.trim() ? 'B2B' : 'B2C',
      customerGstin: invoiceFormat === 'gst' && customerGstin.trim() ? customerGstin.trim().toUpperCase() : undefined,
      invoiceType: invoiceFormat === 'gst' ? 'tax_invoice' : 'retail',
      isGstInvoice: invoiceFormat === 'gst',
      ewayBillNo: ewayBillNo.replace(/\D/g, '').slice(0, 12) || undefined,
      irn: irn.trim() || undefined,
      transporterName: transporterName.trim() || undefined,
      transportDistanceKm: Number(transportDistanceKm) > 0 ? Math.round(Number(transportDistanceKm)) : undefined,
    };

    // Show what this save does to stock and money, and ask for the reason, before saving anything.
    setSaveError('');
    setPendingBill(updatedBill);
  };

  const confirmSave = (reason: string) => {
    if (!pendingBill) return;
    const comment = reason.trim();
    if (comment.length < 3) return;
    setEditComment(comment); // kept, so it is still there if the save is refused
    const toSave = pendingBill;
    setPendingBill(null);
    // `requestedPaid` is what was typed before it was capped at the new total, so money received
    // above a lowered total is kept as an advance instead of being dropped.
    // Close only when the save really happened; otherwise keep the form so no edit is lost.
    const ok = onSave(toSave, { comment, requestedPaid: Math.max(0, amountPaid) });
    if (ok === false) {
      setSaveError('Not saved. Read the message shown on screen, fix it and press Save again. Your changes are still here.');
      return;
    }
    onClose();
  };

  const rupees = (n: number) => `₹${money(n)}`;
  const confirmImpact = (() => {
    const items: { label: string; detail?: string; qtyChange?: string }[] = [];
    if (!preview) return items;
    items.push({
      label: preview.stockChanged ? 'Stock will be adjusted' : 'Stock is not affected',
      detail: preview.stockChanged
        ? `Only the products whose crates changed · ${preview.source.label}`
        : `Same crates, products and source · ${preview.source.label}`,
    });
    for (const c of preview.changes) items.push({ label: c });
    const pay = preview.payment;
    if (pay.movedToCustomer) {
      items.push({
        label: `Receipts move to ${pay.movedToCustomer}`,
        detail: `The ${rupees(pay.receivedBefore)} received on this bill follows the invoice to the new customer`,
      });
    }
    if (pay.keptAsAdvance > 0) {
      items.push({
        label: 'Received money kept as advance',
        detail: `The new total is lower than what was received, so the extra stays on the customer's account`,
        qtyChange: rupees(pay.keptAsAdvance),
      });
    }
    if (pay.removedAsCorrection > 0) {
      items.push({
        label: 'Receipts removed (paid amount lowered)',
        detail: 'Treated as a correction, not a refund. Use Refund on the customer if cash goes back',
        qtyChange: rupees(pay.removedAsCorrection),
      });
    }
    if (pay.keptAsAdvance <= 0 && pay.removedAsCorrection <= 0 && !pay.movedToCustomer) {
      items.push({
        label: 'Payments',
        detail:
          pay.paidAfter > pay.receivedBefore
            ? `${rupees(pay.paidAfter - pay.receivedBefore)} more recorded as received`
            : 'No change to payments already received',
      });
    }
    return items;
  })();

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl shadow-2xl border-2 overflow-hidden bg-white text-stone-900 animate-in zoom-in-95 duration-150 my-auto"
        style={{
          borderColor: palette.accent,
          backgroundColor: palette.cardBg || '#ffffff',
          color: palette.text,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Clean & Non-Redundant for Mobile */}
        <div
          className="px-4 py-3 flex items-center justify-between border-b shrink-0 bg-stone-50"
          style={{ borderColor: palette.border }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={18} className="text-amber-600 shrink-0" />
            <h2 className="font-extrabold text-sm sm:text-base text-stone-900 truncate tracking-tight">
              Edit Bill #{invoicePrefix || ''}{bill.id}
            </h2>
            <span
              className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-white shrink-0"
              style={{ backgroundColor: palette[status.balanceKey] }}
            >
              {status.label}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-stone-200 text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer shrink-0"
            style={{ color: palette.muted }}
            title="Close"
            id="edit-modal-close-x"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Customer & Bill Details Bar */}
          <div
            className="p-4 rounded-xl border space-y-3"
            style={{ borderColor: palette.border, backgroundColor: palette.bg }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-75 flex items-center gap-1.5">
                <UserCheck size={14} /> Customer & Dispatch Information
              </span>
              <button
                type="button"
                onClick={() => setShowCustomerPicker(true)}
                className="text-xs font-bold px-2.5 py-1 rounded-md border flex items-center gap-1.5 shadow-sm hover:shadow-sm transition-all"
                style={{
                  borderColor: palette.accent,
                  color: palette.accent,
                  backgroundColor: `${palette.accent}0d`,
                }}
                id="edit-modal-pick-customer-btn"
              >
                <UserCheck size={13} />
                <span>Select Existing Customer ({existingCustomers.length})</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Retailer Name */}
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">
                  Retailer / Party Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kirana"
                  value={retailer}
                  onChange={(e) => setRetailer(e.target.value)}
                  className="w-full px-3 py-2 text-sm border-2 rounded-lg font-medium focus:outline-none focus:ring-1"
                  style={{
                    borderColor: palette.border,
                    backgroundColor: palette.cardBg || '#ffffff',
                    color: palette.text,
                  }}
                  id="edit-modal-retailer-input"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80 flex items-center gap-1">
                  <Phone size={12} /> WhatsApp Phone
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border-2 rounded-lg font-mono focus:outline-none focus:ring-1"
                  style={{
                    borderColor: palette.border,
                    backgroundColor: palette.cardBg || '#ffffff',
                    color: palette.text,
                  }}
                  id="edit-modal-phone-input"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80 flex items-center gap-1">
                  <Calendar size={12} /> Invoice Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border-2 rounded-lg focus:outline-none focus:ring-1"
                  style={{
                    borderColor: palette.border,
                    backgroundColor: palette.cardBg || '#ffffff',
                    color: palette.text,
                  }}
                  id="edit-modal-date-input"
                />
              </div>

              {/* Warehouse */}
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80 flex items-center gap-1">
                  <Building2 size={12} /> Dispatch Godown
                </label>
                <select
                  value={warehouseId}
                  disabled={preview?.source.kind === 'trip'}
                  title={preview?.source.kind === 'trip' ? 'This bill was sold from a trip. Godown follows the trip.' : undefined}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border-2 rounded-lg focus:outline-none focus:ring-1"
                  style={{
                    borderColor: palette.border,
                    backgroundColor: palette.cardBg || '#ffffff',
                    color: palette.text,
                  }}
                  id="edit-modal-warehouse-select"
                >
                  <option value="">Default Godown</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.location ? `(${w.location})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Document Format Option - Compact GST / Non-GST Toggle Button */}
            <div
              className="p-3 rounded-xl border bg-stone-50/80 space-y-2.5"
              style={{ borderColor: palette.border }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[11px] shrink-0 border ${
                      invoiceFormat === 'gst'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    {invoiceFormat === 'gst' ? 'GST' : 'CASH'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-stone-900 truncate">
                      {invoiceFormat === 'gst' ? 'GST Tax Invoice' : 'Non-GST Retail Bill'}
                    </div>
                    <div className="text-[10.5px] text-stone-500 font-semibold truncate">
                      {invoiceFormat === 'gst' ? 'Official tax invoice with B2B GSTIN' : 'Standard retail cash memo'}
                    </div>
                  </div>
                </div>

                {/* Single Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={invoiceFormat === 'gst'}
                  onClick={() => setInvoiceFormat(invoiceFormat === 'gst' ? 'non_gst' : 'gst')}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    invoiceFormat === 'gst' ? 'bg-amber-600' : 'bg-emerald-600'
                  }`}
                  id="edit-modal-gst-toggle"
                  title={`Toggle between Non-GST and GST (Currently: ${invoiceFormat === 'gst' ? 'GST' : 'Non-GST'})`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      invoiceFormat === 'gst' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {invoiceFormat === 'gst' && (
                <div className="pt-2 border-t border-stone-200">
                  <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Buyer GSTIN (15 Digits)
                  </label>
                  <input
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    type="text"
                    value={customerGstin}
                    onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 21AAAAA0000A1Z5"
                    maxLength={15}
                    className="w-full px-3 py-2 text-xs font-mono font-bold uppercase border rounded-xl bg-white focus:outline-none focus:ring-1 focus:border-amber-600"
                    style={{ borderColor: palette.border }}
                  />
                </div>
              )}

              {/* Optional Collapsible E-Way & Transport Details to save mobile space */}
              <details className="pt-1 text-[11px] text-stone-500">
                <summary className="cursor-pointer font-bold text-[10.5px] uppercase tracking-wider hover:text-stone-700 flex items-center gap-1">
                  <Truck size={12} className="text-stone-400" />
                  <span>Optional: E-Way Bill &amp; Transport Details</span>
                </summary>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 pt-2 border-t border-stone-200">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-0.5">
                      E-way bill no.
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={ewayBillNo}
                      onChange={(e) => setEwayBillNo(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      placeholder="12 digits"
                      className="w-full px-2 py-1 text-xs font-mono font-bold border rounded-lg bg-white focus:outline-none"
                      style={{ borderColor: palette.border }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-0.5">
                      Transporter
                    </label>
                    <input
                      type="text"
                      value={transporterName}
                      onChange={(e) => setTransporterName(e.target.value)}
                      placeholder="Vehicle / Name"
                      className="w-full px-2 py-1 text-xs font-bold border rounded-lg bg-white focus:outline-none"
                      style={{ borderColor: palette.border }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-0.5">
                      IRN (e-invoice)
                    </label>
                    <input
                      type="text"
                      value={irn}
                      onChange={(e) => setIrn(e.target.value.trim().slice(0, 64))}
                      placeholder="64-char IRN"
                      className="w-full px-2 py-1 text-xs font-mono font-bold border rounded-lg bg-white focus:outline-none"
                      style={{ borderColor: palette.border }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-0.5">
                      Distance (km)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={transportDistanceKm}
                      onChange={(e) => setTransportDistanceKm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="km"
                      className="w-full px-2 py-1 text-xs font-bold border rounded-lg bg-white focus:outline-none"
                      style={{ borderColor: palette.border }}
                    />
                  </div>
                </div>
              </details>
            </div>
          </div>

          {/* Where this bill's stock came from + what this edit does to stock */}
          {preview && (
            <div
              className="p-4 rounded-xl border space-y-2.5"
              style={{ borderColor: palette.border, backgroundColor: palette.bg }}
              id="edit-modal-source-panel"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs">
                  <span className="font-bold uppercase tracking-wider opacity-75">Sold from: </span>
                  <span className="font-bold">
                    {preview.source.kind === 'trip' ? '🚚 ' : '🏭 '}
                    {preview.source.label}
                  </span>
                  {preview.source.kind === 'trip' && (
                    <span
                      className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase text-white ${
                        preview.source.tripStatus === 'closed' ? 'bg-stone-600' : 'bg-emerald-600'
                      }`}
                    >
                      {preview.source.tripStatus === 'closed' ? 'Closed' : 'Open'}
                    </span>
                  )}
                </div>
                {preview.source.kind === 'trip' && preview.source.tripStatus === 'closed' && onReopenTrip && preview.source.tripId != null && (
                  <button
                    type="button"
                    onClick={() => {
                      onReopenTrip(preview.source.tripId as number);
                      setSaveError('');
                      notify(`Trip #${preview.source.tripId} reopened to Active. You can now adjust crate quantities.`);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border shadow-sm bg-white hover:bg-slate-50 text-emerald-800 border-emerald-300 cursor-pointer active:scale-95 transition-transform"
                    id="edit-modal-reopen-trip-btn"
                    title="Reopen trip to active status to allow stock adjustments"
                  >
                    <RotateCcw size={13} className="shrink-0" />
                    <span>Reopen trip #{preview.source.tripId} to edit stock</span>
                  </button>
                )}
              </div>

              {blockedByStock ? (
                <div className="text-xs rounded-lg p-3 bg-red-50 text-red-900 border border-red-200 space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-rose-800">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>This edit changes crates / products, which moves live stock, and cannot be saved yet:</span>
                  </div>
                  <div className="pl-5 text-slate-700 whitespace-pre-line leading-relaxed font-medium">
                    {preview.problems.map((m) => `• ${m}`).join('\n')}
                  </div>
                  {preview.source.kind === 'trip' && preview.source.tripStatus === 'closed' && onReopenTrip && preview.source.tripId != null && (
                    <div className="pt-1 pl-5">
                      <button
                        type="button"
                        onClick={() => {
                          onReopenTrip(preview.source.tripId as number);
                          setSaveError('');
                          notify(`Trip #${preview.source.tripId} reopened to Active. You can now adjust crate quantities.`);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs cursor-pointer shadow-sm active:scale-95 transition-all"
                      >
                        <RotateCcw size={14} className="shrink-0" />
                        Reopen Trip #{preview.source.tripId} to Active Now
                      </button>
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 pl-5 pt-0.5">
                    Tip: You can still save price, customer, or payment edits without reopening by keeping crates at original quantities.
                  </div>
                </div>
              ) : preview.stockChanged ? (
                <div className="text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-900 border border-amber-200">
                  ℹ This edit changes crates / products, so live stock will be adjusted only for the products whose crates changed.
                </div>
              ) : null}

              {(preview.payment.keptAsAdvance > 0 || preview.payment.removedAsCorrection > 0 || preview.payment.movedToCustomer) && (
                <div className="text-xs rounded-lg px-3 py-2 bg-sky-50 text-sky-900 border border-sky-200">
                  {preview.payment.keptAsAdvance > 0 && (
                    <div>💰 ₹{money(preview.payment.keptAsAdvance)} already received is more than the new total, so it will be kept as an advance on the customer's account.</div>
                  )}
                  {preview.payment.removedAsCorrection > 0 && (
                    <div>💰 ₹{money(preview.payment.removedAsCorrection)} of receipts will be removed because the paid amount was lowered (a correction, not a refund).</div>
                  )}
                  {preview.payment.movedToCustomer && (
                    <div>💰 Receipts on this bill will move to {preview.payment.movedToCustomer}.</div>
                  )}
                </div>
              )}

              {preview.changes.length > 0 && (
                <ul className="text-[11px] opacity-80 list-disc pl-5 space-y-0.5">
                  {preview.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              {sourceTrip && preview.source.tripStatus !== 'closed' && (
                <p className="text-[11px] opacity-60">
                  Trip is open: you can also adjust the van load from Trips if you need more crates on this vehicle.
                </p>
              )}
            </div>
          )}

          {/* Line Items Table with Inline Quantity & Price Editing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-tight text-stone-900">
                Billed Products ({items.length})
              </h3>
            </div>

            {items.length === 0 ? (
              <div
                className="p-8 text-center rounded-xl border-2 border-dashed opacity-70"
                style={{ borderColor: palette.border }}
              >
                <p className="font-medium text-sm">No products on this bill.</p>
                <p className="text-xs opacity-75 mt-1">Use the form below to add products.</p>
              </div>
            ) : (
              <>
              {/* Mobile: one card per product (the wide table below is for tablet / desktop) */}
              <div className="md:hidden space-y-3">
                {items.map((it, idx) => {
                  const product = products.find((p) => p.id === it.productId);
                  const promo = activePromoForProduct(it.productId);
                  const isPromoActive = !it.schemeSkipped && Boolean(it.promoLabel || promo);
                  const priceType = it.priceType || 'Retail';
                  return (
                    <div
                      key={`m-${it.productId}-${idx}`}
                      className="rounded-2xl border bg-white shadow-sm overflow-hidden"
                      style={{ borderColor: palette.border, ...sizeStripe(product?.volume, it.productName) }}
                    >
                      <div className="p-3 space-y-3">
                        {/* Name + remove */}
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 size-6 rounded-full bg-stone-100 text-[11px] font-bold text-stone-500 flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-stone-900 leading-snug break-words">
                              {it.productName}{' '}
                              <SizeChip volume={product?.volume} pack={product?.pack} name={it.productName} />
                            </div>
                            {product && (
                              <div className="text-[11px] text-stone-500 mt-0.5">
                                Default: ₹{product.retail} Ret · ₹{product.wholesale} Whls
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLineItem(idx)}
                            className="shrink-0 size-9 -mr-1 -mt-1 rounded-full text-red-500 hover:bg-red-50 active:bg-red-100 flex items-center justify-center"
                            title="Remove line item"
                            aria-label={`Remove ${it.productName}`}
                            id={`m-remove-line-${idx}`}
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>

                        {/* Sale type: segmented toggle */}
                        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-stone-100">
                          {(['Retail', 'Wholesale'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => updateLineItem(idx, { priceType: t as PriceType })}
                              className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                priceType === t ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'
                              }`}
                              id={`m-edit-line-type-${idx}-${t}`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>

                        {/* Qty stepper + Rate */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Qty (Cases)</div>
                            <div className="flex items-stretch rounded-xl border overflow-hidden bg-white" style={{ borderColor: palette.border }}>
                              <button
                                type="button"
                                onClick={() => updateLineItem(idx, { qty: it.qty - 1 })}
                                disabled={it.qty <= 1}
                                className="w-11 h-11 text-lg font-bold bg-stone-100 active:bg-stone-200 disabled:opacity-30"
                                aria-label="Decrease quantity"
                                id={`m-edit-qty-minus-${idx}`}
                              >
                                −
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                value={it.qty}
                                onChange={(e) =>
                                  updateLineItem(idx, { qty: Math.max(1, parseInt(e.target.value) || 1) })
                                }
                                className="min-w-0 flex-1 text-center text-base font-bold focus:outline-none"
                                id={`m-edit-qty-input-${idx}`}
                              />
                              <button
                                type="button"
                                onClick={() => updateLineItem(idx, { qty: it.qty + 1 })}
                                className="w-11 h-11 text-lg font-bold bg-stone-100 active:bg-stone-200"
                                aria-label="Increase quantity"
                                id={`m-edit-qty-plus-${idx}`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Rate (₹)</div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold">₹</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={it.rate}
                                onChange={(e) =>
                                  updateLineItem(idx, { rate: Math.max(0, parseFloat(e.target.value) || 0) })
                                }
                                className="w-full h-11 pl-7 pr-2 text-base font-bold border rounded-xl focus:outline-none focus:ring-1 bg-white"
                                style={{ borderColor: palette.border }}
                                id={`m-edit-rate-input-${idx}`}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Scheme */}
                        {promo && (
                          <label className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isPromoActive}
                              onChange={(e) => updateLineItem(idx, { toggleScheme: e.target.checked })}
                              className="mt-0.5 size-4 rounded"
                            />
                            <span className="text-xs">
                              <span className="font-bold text-amber-800">{promo.name}</span>
                              {isPromoActive && it.freeQty > 0 && (
                                <span className="block text-green-700 font-bold">
                                  {it.freeQty} Free Case{it.freeQty !== 1 ? 's' : ''} (incl.)
                                </span>
                              )}
                              {isPromoActive && it.discount > 0 && (
                                <span className="block text-stone-600">Save ₹{money(it.discount)}</span>
                              )}
                            </span>
                          </label>
                        )}
                      </div>

                      {/* Line total */}
                      <div
                        className="flex items-center justify-between px-3 py-2 border-t"
                        style={{ backgroundColor: palette.bg, borderColor: palette.border }}
                      >
                        <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">Line total</span>
                        <span className="text-base font-extrabold">₹{money(it.amount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="hidden md:block border-2 rounded-xl overflow-hidden shadow-sm"
                style={{ borderColor: palette.border }}
              >
                <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead
                      className="border-b uppercase tracking-wider font-bold opacity-80"
                      style={{
                        backgroundColor: palette.bg,
                        borderColor: palette.border,
                      }}
                    >
                      <tr>
                        <th className="px-3 py-2.5">#</th>
                        <th className="px-3 py-2.5">Product Name</th>
                        <th className="px-3 py-2.5">Type</th>
                        <th className="px-3 py-2.5 w-32">Qty (Cases)</th>
                        <th className="px-3 py-2.5 w-28">Rate (₹)</th>
                        <th className="px-3 py-2.5">Scheme / Free</th>
                        <th className="px-3 py-2.5 text-right">Line Total</th>
                        <th className="px-2 py-2.5 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {items.map((it, idx) => {
                        const product = products.find((p) => p.id === it.productId);
                        const promo = activePromoForProduct(it.productId);
                        const isPromoActive = !it.schemeSkipped && Boolean(it.promoLabel || promo);

                        return (
                          <tr
                            key={`${it.productId}-${idx}`}
                            className="hover:bg-stone-50/50 transition-colors"
                          >
                            <td className="px-3 py-2.5 font-bold opacity-50">{idx + 1}</td>
                            <td className="px-3 py-2.5 font-semibold text-stone-900" style={sizeStripe(product?.volume, it.productName)}>
                              <div>
                                {it.productName}{' '}
                                <SizeChip volume={product?.volume} pack={product?.pack} name={it.productName} />
                              </div>
                              {product && (
                                <div className="text-[10px] opacity-60">
                                  Default: ₹{product.retail} Ret / ₹{product.wholesale} Whls
                                </div>
                              )}
                            </td>
                            {/* Sale Type Selector */}
                            <td className="px-3 py-2.5">
                              <select
                                value={it.priceType || 'Retail'}
                                onChange={(e) =>
                                  updateLineItem(idx, {
                                    priceType: e.target.value as PriceType,
                                  })
                                }
                                className="px-2 py-1 text-xs border rounded font-medium bg-white"
                                style={{ borderColor: palette.border }}
                                id={`edit-line-type-${idx}`}
                              >
                                <option value="Retail">Retail</option>
                                <option value="Wholesale">Wholesale</option>
                              </select>
                            </td>

                            {/* Inline Quantity with +/- Tactile Buttons */}
                            <td className="px-3 py-2.5">
                              <div className="inline-flex items-center rounded-lg border overflow-hidden bg-white shadow-sm" style={{ borderColor: palette.border }}>
                                <button
                                  type="button"
                                  onClick={() => updateLineItem(idx, { qty: it.qty - 1 })}
                                  disabled={it.qty <= 1}
                                  className="px-2 py-1 font-bold text-xs bg-stone-100 hover:bg-stone-200 disabled:opacity-30 transition-colors"
                                  title="Decrease quantity by 1"
                                  id={`edit-qty-minus-${idx}`}
                                >
                                  -
                                </button>
                                <input
                                  type="number" inputMode="numeric"
                                  min="1"
                                  value={it.qty}
                                  onChange={(e) =>
                                    updateLineItem(idx, {
                                      qty: Math.max(1, parseInt(e.target.value) || 1),
                                    })
                                  }
                                  className="w-12 text-center text-xs font-bold py-1 focus:outline-none"
                                  id={`edit-qty-input-${idx}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => updateLineItem(idx, { qty: it.qty + 1 })}
                                  className="px-2 py-1 font-bold text-xs bg-stone-100 hover:bg-stone-200 transition-colors"
                                  title="Increase quantity by 1"
                                  id={`edit-qty-plus-${idx}`}
                                >
                                  +
                                </button>
                              </div>
                            </td>

                            {/* Inline Rate/Price Editor */}
                            <td className="px-3 py-2.5">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50 font-bold">
                                  ₹
                                </span>
                                <input
                                  type="number" inputMode="decimal"
                                  step="0.01"
                                  min="0"
                                  value={it.rate}
                                  onChange={(e) =>
                                    updateLineItem(idx, {
                                      rate: Math.max(0, parseFloat(e.target.value) || 0),
                                    })
                                  }
                                  className="w-24 pl-5 pr-2 py-1 text-xs font-bold border rounded-lg focus:outline-none focus:ring-1"
                                  style={{
                                    borderColor: palette.border,
                                    backgroundColor: '#ffffff',
                                  }}
                                  id={`edit-rate-input-${idx}`}
                                />
                              </div>
                            </td>

                            {/* Scheme & Free cases */}
                            <td className="px-3 py-2.5">
                              {promo ? (
                                <div className="space-y-1">
                                  <label className="inline-flex items-center gap-1 cursor-pointer text-[11px] font-medium">
                                    <input
                                      type="checkbox"
                                      checked={isPromoActive}
                                      onChange={(e) =>
                                        updateLineItem(idx, {
                                          toggleScheme: e.target.checked,
                                        })
                                      }
                                      className="rounded"
                                    />
                                    <span className="text-amber-700 font-bold">
                                      {promo.name}
                                    </span>
                                  </label>
                                  {isPromoActive && it.freeQty > 0 && (
                                    <div className="text-[10px] text-green-700 font-bold">
                                      {it.freeQty} Free Case{it.freeQty !== 1 ? 's' : ''} (incl.)
                                    </div>
                                  )}
                                  {isPromoActive && it.discount > 0 && (
                                    <div className="text-[10px] opacity-75">
                                      Save ₹{money(it.discount)}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="opacity-40 italic text-[11px]">No active scheme</span>
                              )}
                            </td>

                            {/* Line Total */}
                            <td className="px-3 py-2.5 text-right font-bold text-sm">
                              ₹{money(it.amount)}
                            </td>

                            {/* Remove button */}
                            <td className="px-2 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => removeLineItem(idx)}
                                className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors"
                                title="Remove line item"
                                id={`remove-line-${idx}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              </>
            )}

            {/* Space-Saving Link to Add Product (Collapsed by default per mobile-first request) */}
            {!isAddingProduct ? (
              <button
                type="button"
                onClick={() => setIsAddingProduct(true)}
                className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-sky-400 bg-sky-50/70 hover:bg-sky-100 text-sky-800 text-xs sm:text-sm font-black flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99] shadow-xs"
                id="edit-modal-show-add-product-btn"
              >
                <Plus size={16} className="text-sky-600" />
                <span>+ Add Another Product to this Bill</span>
              </button>
            ) : (
              <div
                className="p-3.5 sm:p-4 rounded-xl border-2 space-y-3 bg-sky-50/50 shadow-sm"
                style={{
                  borderColor: palette.border,
                }}
              >
                <div className="flex items-center justify-between pb-2 border-b border-sky-200">
                  <span className="text-xs font-black uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                    <Plus size={14} className="text-sky-600" />
                    <span>Add Product to Bill</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingProduct(false)}
                    className="text-xs font-bold text-stone-500 hover:text-stone-800 px-2 py-0.5 rounded cursor-pointer"
                  >
                    ✕ Cancel
                  </button>
                </div>

                {/* Available Products Selector */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600">
                    Select Product ({products.length} Available)
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-semibold border rounded-lg bg-white text-stone-900 focus:outline-none focus:ring-1 focus:border-sky-600"
                    style={{ borderColor: palette.border }}
                    id="edit-modal-add-product-select"
                  >
                    {products.map((p) => {
                      const stock = remainingStock(p.id);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} (Stock: {stock} cs | Ret: ₹{p.retail} | Whls: ₹{p.wholesale})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Price Type, Qty & Rate - Mobile Friendly Responsive Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  {/* Price Type Segmented */}
                  <div>
                    <label className="block text-[10.5px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                      Sale Type
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-stone-100 border border-stone-200">
                      {(['Retail', 'Wholesale'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setDraftPriceType(t)}
                          className={`py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                            draftPriceType === t ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Qty with Stepper */}
                  <div>
                    <label className="block text-[10.5px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                      Quantity (Cases)
                    </label>
                    <div className="flex items-stretch rounded-lg border overflow-hidden bg-white" style={{ borderColor: palette.border }}>
                      <button
                        type="button"
                        onClick={() => setDraftQty((q) => Math.max(1, q - 1))}
                        disabled={draftQty <= 1}
                        className="w-10 h-9 font-bold text-sm bg-stone-100 active:bg-stone-200 disabled:opacity-30 cursor-pointer"
                        aria-label="Decrease draft quantity"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={draftQty}
                        onChange={(e) => setDraftQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="min-w-0 flex-1 text-center text-xs font-bold focus:outline-none"
                        id="edit-modal-draft-qty"
                      />
                      <button
                        type="button"
                        onClick={() => setDraftQty((q) => q + 1)}
                        className="w-10 h-9 font-bold text-sm bg-stone-100 active:bg-stone-200 cursor-pointer"
                        aria-label="Increase draft quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Rate */}
                  <div>
                    <label className="block text-[10.5px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                      Rate (₹ / Case)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-xs">₹</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="Rate ₹"
                        value={draftCustomRate}
                        onChange={(e) => setDraftCustomRate(e.target.value)}
                        className="w-full h-9 pl-6 pr-2 text-xs font-bold border rounded-lg bg-white focus:outline-none focus:ring-1"
                        style={{ borderColor: palette.border }}
                        id="edit-modal-draft-rate"
                        title="Rate per case"
                      />
                    </div>
                  </div>
                </div>

                {/* Add to Bill Button */}
                <div className="pt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      addDraftItem();
                      notify(`Added ${draftProduct?.name || 'item'} to bill!`, 'success');
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl text-xs font-black text-white shadow-sm transition-all hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: palette.accent }}
                    id="edit-modal-add-item-btn"
                  >
                    <Plus size={16} />
                    <span>Add Item to Bill</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingProduct(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Financial Summary & Payment Settlement */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bill Summary Breakdown */}
            <div
              className="p-4 rounded-xl border text-xs space-y-2"
              style={{ borderColor: palette.border, backgroundColor: palette.bg }}
            >
              <h4 className="font-bold text-xs uppercase tracking-wider opacity-75">
                Financial Breakdown
              </h4>
              <div className="flex justify-between">
                <span className="opacity-70">Gross Line Subtotal:</span>
                <span className="font-semibold">₹{money(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-green-700 font-semibold">
                  <span>Trade Schemes Discount:</span>
                  <span>-₹{money(totals.discount)}</span>
                </div>
              )}
              {keptExtraDiscount > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>Invoice discount (kept from the original bill):</span>
                  <span>-₹{money(keptExtraDiscount)}</span>
                </div>
              )}
              {editGstMode !== 'off' && (
                <>
                  <div className="flex justify-between text-stone-600">
                    <span>CGST (Central Tax):</span>
                    <span>₹{money(totals.cgst)}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>SGST (State Tax):</span>
                    <span>₹{money(totals.sgst)}</span>
                  </div>
                </>
              )}
              <div
                className="pt-2 border-t flex justify-between text-sm font-bold"
                style={{ borderColor: palette.border }}
              >
                <span>Net Total Bill Amount:</span>
                <span className="text-base" style={{ color: palette.accent }}>
                  ₹{money(totals.total)}
                </span>
              </div>
            </div>

            {/* Payment & Due Settlement */}
            <div
              className="p-4 rounded-xl border space-y-3"
              style={{ borderColor: palette.border, backgroundColor: palette.bg }}
            >
              <h4 className="font-bold text-xs uppercase tracking-wider opacity-75 flex items-center justify-between">
                <span>Payment Settlement</span>
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-bold text-white uppercase"
                  style={{ backgroundColor: palette[status.balanceKey] }}
                >
                  {status.label}
                </span>
              </h4>

              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">
                  Amount Received / Collected (₹)
                </label>
                <input
                  type="number" inputMode="decimal"
                  step="0.01"
                  min="0"
                  max={totals.total}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm font-bold border-2 rounded-lg focus:outline-none focus:ring-1"
                  style={{
                    borderColor: palette.border,
                    backgroundColor: palette.cardBg || '#ffffff',
                    color: palette.text,
                  }}
                  id="edit-modal-amount-paid-input"
                />
              </div>

              {/* Payment Quick Shortcuts */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAmountPaid(totals.total)}
                  className="px-2 py-1 text-xs rounded border font-medium bg-white hover:bg-stone-100 transition-colors"
                  style={{ borderColor: palette.border }}
                >
                  Full Paid (₹{money(totals.total)})
                </button>
                <button
                  type="button"
                  onClick={() => setAmountPaid(0)}
                  className="px-2 py-1 text-xs rounded border font-medium bg-white hover:bg-stone-100 transition-colors"
                  style={{ borderColor: palette.border }}
                >
                  Credit (₹0)
                </button>
                <button
                  type="button"
                  onClick={() => setAmountPaid(Math.round(totals.total / 2))}
                  className="px-2 py-1 text-xs rounded border font-medium bg-white hover:bg-stone-100 transition-colors"
                  style={{ borderColor: palette.border }}
                >
                  50% (₹{money(Math.round(totals.total / 2))})
                </button>
              </div>

              <div
                className="pt-2 border-t flex items-center justify-between text-xs font-bold"
                style={{ borderColor: palette.border }}
              >
                <span>Outstanding Balance Due:</span>
                <span
                  className="text-sm font-bold"
                  style={{ color: dueBalance > 0 ? palette.bad : palette.good }}
                >
                  ₹{money(dueBalance)}
                </span>
              </div>
            </div>
          </div>

          {/* Edit history (scrolls with the bill; the reason for a NEW edit is asked in the save popup) */}
          {bill.editHistory && bill.editHistory.length > 0 && (
            <details className="text-[11px] rounded-xl border px-3 py-2" style={{ borderColor: palette.border }}>
              <summary className="cursor-pointer font-bold opacity-75">
                Edit history ({bill.editHistory.length})
              </summary>
              <ul className="mt-2 space-y-1.5">
                {[...bill.editHistory].reverse().map((h, i) => (
                  <li key={i} className="border-l-2 pl-2" style={{ borderColor: palette.border }}>
                    <b>{new Date(h.at).toLocaleString('en-IN')}</b> · {h.by} · “{h.comment}”
                    {h.changes.length > 0 && <div className="opacity-70">{h.changes.join('; ')}</div>}
                    {h.stockChanged && <div className="text-amber-700">Stock was adjusted</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {saveError && (
          <p
            className="px-5 py-2 border-t shrink-0 text-xs text-red-600 font-semibold whitespace-pre-line max-h-24 overflow-y-auto"
            style={{ borderColor: palette.border }}
            id="edit-modal-save-error"
          >
            {saveError}
          </p>
        )}

        {/* Footer Actions - Cancel replaced with Delete Bill per mobile-first request */}
        <div
          className="px-4 sm:px-5 py-3 bg-stone-50 border-t flex items-center justify-between gap-2.5 shrink-0"
          style={{ borderColor: palette.border, backgroundColor: palette.bg }}
        >
          <button
            type="button"
            onClick={() => onRequestDelete(bill)}
            className="px-3.5 py-2.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs shrink-0"
            id="edit-modal-footer-delete-btn"
            title="Delete this bill"
          >
            <Trash2 size={16} className="text-rose-600" />
            <span>Delete</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={blockedByStock}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black text-white shadow-md hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{ backgroundColor: palette.good }}
            id="edit-modal-save-btn"
          >
            <Save size={16} />
            <span>Save Changes &amp; Update Bill</span>
          </button>
        </div>
      </div>

      {/* Customer Selector Modal (if triggered from within the edit modal) */}
      {showCustomerPicker && (
        <CustomerSelector
          customers={existingCustomers}
          currentRetailer={retailer}
          palette={palette}
          scale={1}
          onClose={() => setShowCustomerPicker(false)}
          onSelect={(c) => {
            setRetailer(c.name);
            if (c.phone) setPhone(c.phone);
            setShowCustomerPicker(false);
          }}
        />
      )}
    </div>
    {pendingBill && (
      <ConfirmModal
        isOpen
        title={`Save changes to Bill #${invoicePrefix}${bill.id}?`}
        subtitle="Check the impact, then add a reason. It is saved in the bill's edit history."
        warningNote={
          preview?.payment.keptAsAdvance || preview?.payment.removedAsCorrection || preview?.stockChanged
            ? 'This edit moves stock and/or money.'
            : undefined
        }
        impactItems={confirmImpact}
        confirmButtonLabel="Save Changes"
        variant="warning"
        confirmIcon={<Save className="w-3.5 h-3.5" />}
        rectificationPrompt="Reason / comment for this edit *"
        rectificationPlaceholder="e.g. Rate corrected as agreed with customer / wrong quantity entered"
        initialComment={editComment}
        commentMinLength={3}
        onConfirm={() => {}}
        onConfirmWithComment={confirmSave}
        onClose={() => setPendingBill(null)}
      />
    )}
    </>
  );
};
