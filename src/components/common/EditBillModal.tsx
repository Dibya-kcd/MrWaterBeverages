import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { Bill, BillItem, ExistingCustomer, PriceType, Product, Promotion, Warehouse } from '../../types';
import { CATS } from '../../constants/initialData';
import { billTotals, computeLine, money, schemeLabel, statusOf } from '../../utils/billing';
import { CustomerSelector } from './CustomerSelector';

interface EditBillModalProps {
  bill: Bill | null;
  onClose: () => void;
  onSave: (updatedBill: Bill) => void;
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

  // New item draft inside the modal
  const [selectedProductId, setSelectedProductId] = useState<number>(products[0]?.id || 0);
  const [draftPriceType, setDraftPriceType] = useState<PriceType>('Retail');
  const [draftQty, setDraftQty] = useState<number>(1);
  const [draftCustomRate, setDraftCustomRate] = useState<string>('');

  // Customer Selector Popup
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  useEffect(() => {
    if (bill) {
      setRetailer(bill.retailer || '');
      setPhone(bill.phone || '');
      setDate(bill.date || new Date().toISOString().slice(0, 10));
      setWarehouseId(bill.warehouseId || '');
      setItems(bill.items ? JSON.parse(JSON.stringify(bill.items)) : []);
      setAmountPaid(bill.amountPaid || 0);
    }
  }, [bill]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showCustomerPicker) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showCustomerPicker]);

  const activePromoForProduct = (productId: number): Promotion | null => {
    return promotions.find((promo) => promo.productIds?.includes(productId)) || null;
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
    const rate = draftCustomRate !== '' ? Math.max(0, Number(draftCustomRate)) : baseRate;
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
      gst: CATS[product.category]?.gst ?? 0.18,
      promoLabel: promo ? schemeLabel(promo) : null,
      schemeSkipped: false,
      batchNumber: product.batchNumber,
      hsn: product.hsn || CATS[product.category]?.hsn || '2202',
      expiryDate: product.expiry,
      warehouseId: product.warehouseId,
    };

    setItems((prev) => [...prev, newItem]);
    setDraftQty(1);
    setDraftCustomRate('');
  };

  // Live Recalculated Financials
  const totals = useMemo(() => {
    return billTotals(items, gstMode);
  }, [items, gstMode]);

  const dueBalance = Math.max(0, totals.total - amountPaid);
  const status = statusOf(totals.total, amountPaid);

  if (!bill) return null;

  const handleSave = () => {
    if (!retailer.trim()) {
      alert('Please enter or select a retailer name.');
      return;
    }
    if (items.length === 0) {
      alert('The bill must contain at least one product line item.');
      return;
    }

    const updatedBill: Bill = {
      id: bill.id,
      retailer: retailer.trim(),
      phone: phone.trim(),
      date,
      warehouseId,
      items,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      total: totals.total,
      discount: totals.discount,
      amountPaid: Math.min(totals.total, Math.max(0, amountPaid)),
    };

    onSave(updatedBill);
    onClose();
  };

  return (
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
        {/* Header */}
        <div
          className="px-5 py-3.5 flex items-center justify-between border-b shrink-0"
          style={{ borderColor: palette.border, backgroundColor: palette.bg }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white shadow-xs"
              style={{ backgroundColor: palette.accent }}
            >
              #{bill.id}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base sm:text-lg tracking-tight">
                  Edit Bill #{invoicePrefix}{bill.id}
                </h2>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-white"
                  style={{ backgroundColor: palette[status.balanceKey] }}
                >
                  {status.label}
                </span>
              </div>
              <p className="text-xs opacity-70">
                Direct in-place bill editor with live product price and quantity adjustment
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onRequestDelete(bill)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"
              title="Delete this bill"
              id="edit-modal-delete-btn"
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Delete Bill</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors hover:bg-stone-200/60 focus:outline-none"
              style={{ color: palette.muted }}
              title="Close"
              id="edit-modal-close-x"
            >
              <X size={18} />
            </button>
          </div>
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
                className="text-xs font-bold px-2.5 py-1 rounded-md border flex items-center gap-1.5 shadow-2xs hover:shadow-xs transition-all"
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
          </div>

          {/* Line Items Table with Inline Quantity & Price Editing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-tight flex items-center gap-2">
                <span>Billed Products ({items.length})</span>
                <span className="text-xs font-normal opacity-60">
                  Directly adjust quantity (+/-) or unit price without deleting
                </span>
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
              <div
                className="border-2 rounded-xl overflow-hidden shadow-2xs"
                style={{ borderColor: palette.border }}
              >
                <div className="overflow-x-auto">
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
                            <td className="px-3 py-2.5 font-semibold text-stone-900">
                              <div>{it.productName}</div>
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
                              <div className="inline-flex items-center rounded-lg border overflow-hidden bg-white shadow-2xs" style={{ borderColor: palette.border }}>
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
                                  type="number"
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
                                  type="number"
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
                                      +{it.freeQty} Free Case{it.freeQty !== 1 ? 's' : ''}
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
            )}

            {/* Quick Add Product Inline Form inside the Modal */}
            <div
              className="p-3.5 rounded-xl border space-y-2"
              style={{
                borderColor: palette.border,
                backgroundColor: `${palette.accent}06`,
              }}
            >
              <span className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                <Plus size={13} /> Add Another Product to this Bill
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                {/* Product Select */}
                <div className="sm:col-span-5">
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs font-semibold border rounded-lg bg-white"
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

                {/* Price Type */}
                <div className="sm:col-span-2">
                  <select
                    value={draftPriceType}
                    onChange={(e) => setDraftPriceType(e.target.value as PriceType)}
                    className="w-full px-2 py-1.5 text-xs border rounded-lg bg-white font-medium"
                    style={{ borderColor: palette.border }}
                    id="edit-modal-draft-type"
                  >
                    <option value="Retail">Retail</option>
                    <option value="Wholesale">Wholesale</option>
                  </select>
                </div>

                {/* Qty */}
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={draftQty}
                    onChange={(e) => setDraftQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-2 py-1.5 text-xs font-bold border rounded-lg bg-white"
                    style={{ borderColor: palette.border }}
                    id="edit-modal-draft-qty"
                  />
                </div>

                {/* Custom Rate (Optional Override) */}
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Custom Rate ₹"
                    value={draftCustomRate}
                    onChange={(e) => setDraftCustomRate(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border rounded-lg bg-white"
                    style={{ borderColor: palette.border }}
                    id="edit-modal-draft-rate"
                  />
                </div>

                {/* Add Button */}
                <div className="sm:col-span-1">
                  <button
                    type="button"
                    onClick={addDraftItem}
                    className="w-full py-1.5 rounded-lg text-xs font-bold text-white shadow-2xs transition-all hover:opacity-90 flex items-center justify-center"
                    style={{ backgroundColor: palette.accent }}
                    title="Add to line items"
                    id="edit-modal-add-item-btn"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
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
              {gstMode !== 'off' && (
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
                  type="number"
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
        </div>

        {/* Footer Actions */}
        <div
          className="px-5 py-3.5 bg-stone-50 border-t flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: palette.border, backgroundColor: palette.bg }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold border hover:bg-stone-200 transition-colors"
            style={{ borderColor: palette.border }}
            id="edit-modal-cancel-btn"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 rounded-lg text-sm font-bold text-white shadow-md hover:opacity-90 transition-all flex items-center gap-2"
            style={{ backgroundColor: palette.good }}
            id="edit-modal-save-btn"
          >
            <Save size={16} />
            Save Changes & Update Bill
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
  );
};
