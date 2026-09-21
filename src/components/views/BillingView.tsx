import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  MessageCircle,
  Mic,
  MicOff,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { CATS } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { Bill, BillItem, ExistingCustomer, PriceType } from '../../types';
import {
  billTotals,
  buildBillText,
  computeLine,
  generateBatchNumber,
  money,
  schemeLabel,
  statusOf,
  whatsappLink,
} from '../../utils/billing';
import { downloadInvoicePdf } from '../../utils/invoicePdf';
import {
  startSpeechRecognition,
  isSpeechRecognitionSupported,
  speakAssistiveText,
} from '../../utils/speechRecognition';
import { IconButton } from '../common/IconButton';
import { StatusBadge } from '../common/StatusBadge';
import { TaxInvoiceModal } from '../common/TaxInvoiceModal';
import { WhatsAppButton } from '../common/WhatsAppButton';
import { CustomerSelector } from '../common/CustomerSelector';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { EditBillModal } from '../common/EditBillModal';
import { BillingHistoryView } from './BillingHistoryView';
import { LowVisionBillingView } from './LowVisionBillingView';

export const BillingView: React.FC = () => {
  const {
    products,
    bills,
    cart,
    setCart,
    editingBillId,
    startEditBill,
    cancelEditBill,
    finalizeBill,
    updateBill,
    recordPayment,
    deleteBill,
    syncBillsToCloud,
    justFinalizedBillId,
    setJustFinalizedBillId,
    remainingStock,
    activePromoFor,
    promotions,
    gstMode,
    setGstMode,
    palette,
    fz,
    scale,
    lowVisionMode,
    toggleLowVisionMode,
    orgProfile,
    billingSettings,
    warehouses,
  } = useLedger();

  const [billingSubTab, setBillingSubTab] = useState<'create' | 'history'>('create');
  const [isSyncingBills, setIsSyncingBills] = useState(false);
  const [syncBillsMsg, setSyncBillsMsg] = useState<string | null>(null);

  // New Modals: In-place edit modal, delete confirmation modal, customer selector
  const [editModalBill, setEditModalBill] = useState<Bill | null>(null);
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState<boolean>(false);

  const [draftLine, setDraftLine] = useState<{
    productId: string;
    priceType: PriceType;
    qty: string;
    customRate: string;
    customDiscount: string;
    applyScheme: boolean;
  }>({
    productId: '',
    priceType: billingSettings?.defaultSaleType || 'Retail',
    qty: '1',
    customRate: '',
    customDiscount: '',
    applyScheme: billingSettings?.autoApplyPromotions ?? true,
  });

  const [viewingBillId, setViewingBillId] = useState<number | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<Record<number, string>>({});
  const [amountPaidDraft, setAmountPaidDraft] = useState<string>('');
  const [invoiceModalBill, setInvoiceModalBill] = useState<Bill | null>(null);

  // Bill-level Special Discount & Price-Override after all total
  const [invoiceDiscountDraft, setInvoiceDiscountDraft] = useState<string>('');
  const [settledTotalDraft, setSettledTotalDraft] = useState<string>('');
  const [autoSendWhatsApp, setAutoSendWhatsApp] = useState<boolean>(true);
  const [lastFinalizedWhatsApp, setLastFinalizedWhatsApp] = useState<{
    id: number;
    phone: string;
    url: string;
  } | null>(null);

  // Inline editing in cart
  const [editingLineKey, setEditingLineKey] = useState<string | number | null>(null);
  const [editingLineRate, setEditingLineRate] = useState<string>('');
  const [editingLineDiscount, setEditingLineDiscount] = useState<string>('');

  // Voice Search status
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);

  // Bill payment history card states
  const [billSearch, setBillSearch] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [expandedBillIds, setExpandedBillIds] = useState<Record<number, boolean>>({});

  // Respond to global floating shortcut "+ New Bill"
  useEffect(() => {
    const onNewBill = () => {
      setBillingSubTab('create');
      setTimeout(() => {
        const input = document.getElementById('input-retailer-name') as HTMLInputElement | null;
        if (input) {
          input.focus();
        }
      }, 100);
    };
    window.addEventListener('app-new-bill', onNewBill);
    return () => window.removeEventListener('app-new-bill', onNewBill);
  }, []);

  const toggleBillExpand = (id: number) => {
    setExpandedBillIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleQuickFullPayment = (billId: number, balance: number) => {
    setPaymentDraft((pd) => ({ ...pd, [billId]: String(balance) }));
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderWidth: 2,
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    color: palette.ink,
    borderColor: palette.line,
    borderWidth: 2,
    ...fz(14),
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: palette.ink,
    fontWeight: 600,
    marginBottom: '0.25em',
    ...fz(13),
  };

  // Base raw totals without invoice discount
  const rawTotals = useMemo(() => billTotals(cart.items, gstMode, 0), [cart.items, gstMode]);
  const appliedDiscount = Number(invoiceDiscountDraft) || 0;
  const previewTotals = useMemo(
    () => billTotals(cart.items, gstMode, appliedDiscount),
    [cart.items, gstMode, appliedDiscount]
  );

  // Discount & Settled Total Synchronizers
  const handleDiscountChange = (val: string) => {
    setInvoiceDiscountDraft(val);
    const d = Number(val) || 0;
    const computed = billTotals(cart.items, gstMode, d);
    setSettledTotalDraft(d > 0 ? String(computed.total) : '');
  };

  const handleSettledTotalChange = (val: string) => {
    setSettledTotalDraft(val);
    if (!val.trim()) {
      setInvoiceDiscountDraft('');
      return;
    }
    const target = Number(val);
    if (!isNaN(target) && target >= 0) {
      const diff = Math.max(0, rawTotals.total - target);
      setInvoiceDiscountDraft(diff > 0 ? String(diff) : '0');
    }
  };

  const applyQuickDiscount = (amount: number, isPercent: boolean = false) => {
    let d = 0;
    if (isPercent) {
      d = Math.round(rawTotals.subtotal * (amount / 100));
    } else {
      d = amount;
    }
    handleDiscountChange(String(d));
  };

  const addLineToCart = () => {
    if (!draftLine.productId) return;
    const pid = Number(draftLine.productId);
    const product = products.find((p) => p.id === pid);
    if (!product) return;

    const qty = Number(draftLine.qty);
    if (!qty || qty <= 0) return;

    const promo = draftLine.applyScheme ? activePromoFor(pid) : null;
    const customDiscNum = draftLine.customDiscount !== '' ? Number(draftLine.customDiscount) : undefined;
    const computed = computeLine(product, draftLine.priceType, qty, promo, draftLine.customRate, customDiscNum);

    const newItem: BillItem = {
      key: `${pid}-${Date.now()}-${Math.random()}`,
      productId: pid,
      productName: product.name,
      category: product.category,
      gst: product.gstRate !== undefined ? product.gstRate : CATS[product.category].gst,
      priceType: draftLine.priceType,
      qty,
      rate: computed.rate,
      gross: computed.gross,
      freeQty: computed.freeQty,
      chargeableQty: computed.chargeableQty,
      discount: computed.discount,
      amount: computed.amount,
      promoLabel: promo ? schemeLabel(promo) : null,
      schemeSkipped: !draftLine.applyScheme && Boolean(activePromoFor(pid)),
      batchNumber: product.batchNumber || generateBatchNumber(product.name),
      hsn: product.hsn || CATS[product.category]?.hsn || '2202',
      expiryDate: product.expiry,
      warehouseId: product.warehouseId,
    };

    setCart((c) => ({ ...c, items: [...c.items, newItem] }));
    setDraftLine({
      productId: '',
      priceType: billingSettings?.defaultSaleType || 'Retail',
      qty: '1',
      customRate: '',
      customDiscount: '',
      applyScheme: billingSettings?.autoApplyPromotions ?? true,
    });
  };

  const removeLine = (key: string | number) => {
    setCart((c) => ({ ...c, items: c.items.filter((it) => it.key !== key) }));
  };

  const updateCartLine = (
    key: string | number,
    updates: { qty?: number; rate?: number; discount?: number }
  ) => {
    setCart((c) => {
      const items = c.items.map((it) => {
        if (it.key !== key) return it;
        const product = products.find((p) => p.id === it.productId);
        if (!product) return it;

        const newQty = updates.qty !== undefined ? Math.max(1, updates.qty) : it.qty;
        const newRate = updates.rate !== undefined ? Math.max(0, updates.rate) : it.rate;
        const newDiscount = updates.discount !== undefined ? Math.max(0, updates.discount) : undefined;

        const promo = it.promoLabel ? activePromoFor(it.productId) : null;
        const computed = computeLine(product, it.priceType, newQty, promo, newRate, newDiscount);

        return {
          ...it,
          qty: newQty,
          rate: newRate,
          gross: computed.gross,
          freeQty: computed.freeQty,
          chargeableQty: computed.chargeableQty,
          discount: computed.discount,
          amount: computed.amount,
        };
      });
      return { ...c, items };
    });
  };

  // Voice Customer Search Integration
  const handleVoiceCustomerSearch = () => {
    if (isVoiceListening) {
      setIsVoiceListening(false);
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    setIsVoiceListening(true);
    speakAssistiveText('Listening. Speak customer or shop name now.');
    startSpeechRecognition({
      onStart: () => setIsVoiceListening(true),
      onResult: (transcript) => {
        setIsVoiceListening(false);
        const lower = transcript.toLowerCase();
        const matched = existingCustomers.find(
          (c) =>
            c.name.toLowerCase().includes(lower) ||
            lower.includes(c.name.toLowerCase())
        );
        if (matched) {
          setCart((prev) => ({
            ...prev,
            retailer: matched.name,
            phone: matched.phone || prev.phone,
          }));
          speakAssistiveText(`Selected customer ${matched.name}`);
        } else {
          setCart((prev) => ({ ...prev, retailer: transcript }));
          speakAssistiveText(`Customer set to ${transcript}`);
        }
      },
      onError: (err) => {
        setIsVoiceListening(false);
      },
      onEnd: () => setIsVoiceListening(false),
    });
  };

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

    return Array.from(map.values()).sort((a, b) => b.totalBills - a.totalBills);
  }, [bills]);

  const handleFinalize = () => {
    const paid = amountPaidDraft !== '' ? Number(amountPaidDraft) : previewTotals.total;
    const id = finalizeBill(paid, undefined, appliedDiscount);
    if (id !== null) {
      setAmountPaidDraft('');
      setInvoiceDiscountDraft('');
      setSettledTotalDraft('');
      const phoneToUse = (cart.phone || '').trim();
      if (phoneToUse) {
        const newlyCreatedBill: Bill = {
          ...previewTotals,
          id,
          retailer: cart.retailer || 'Cash Sale',
          phone: phoneToUse,
          date: cart.date,
          items: cart.items,
          amountPaid: paid,
          warehouseId: cart.warehouseId || '',
          additionalDiscount: appliedDiscount,
        };
        const text = buildBillText(newlyCreatedBill, orgProfile, billingSettings);
        const url = whatsappLink(phoneToUse, text);
        setLastFinalizedWhatsApp({ id, phone: phoneToUse, url });
        if (autoSendWhatsApp) {
          window.open(url, '_blank');
        }
      }
    }
  };

  const handleRecordPayment = (billId: number) => {
    const amount = Number(paymentDraft[billId]);
    if (!amount || amount <= 0) return;
    recordPayment(billId, amount);
    setPaymentDraft((pd) => ({ ...pd, [billId]: '' }));
  };

  const justBill = justFinalizedBillId ? bills.find((b) => b.id === justFinalizedBillId) : null;

  return (
    <div id="view-billing" className="p-3 sm:p-6 max-w-6xl">
      {/* Header and Sub-Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4 pb-2 border-b-2" style={{ borderColor: palette.line }}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded border-2 overflow-hidden bg-slate-100 p-0.5" style={{ borderColor: palette.line }}>
            <button
              type="button"
              id="subtab-billing-create"
              onClick={() => setBillingSubTab('create')}
              className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer rounded transition-colors ${
                billingSubTab === 'create' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
              }`}
              style={billingSubTab === 'create' ? { backgroundColor: palette.navy, color: '#FFFFFF' } : {}}
            >
              <FileText size={13} />
              <span>New Invoice</span>
            </button>
            <button
              type="button"
              id="subtab-billing-history"
              onClick={() => setBillingSubTab('history')}
              className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer rounded transition-colors ${
                billingSubTab === 'history' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
              }`}
              style={billingSubTab === 'history' ? { backgroundColor: palette.navy, color: '#FFFFFF' } : {}}
            >
              <Clock size={13} />
              <span className="hidden sm:inline">Bill & Payment History</span>
              <span className="sm:hidden">History</span>
              <span>({bills.length})</span>
            </button>
          </div>

          {editingBillId && (
            <span
              className="px-2 py-0.5 border font-bold text-xs rounded"
              style={{ borderColor: palette.amber, color: palette.amber, backgroundColor: `${palette.amber}15` }}
            >
              Editing #{editingBillId}
            </span>
          )}
        </div>

        {/* Low Vision Mode Toggle & GST Calculation Mode */}
        <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
          {/* Low Vision Mode Toggle Button */}
          <button
            type="button"
            id="btn-billing-toggle-low-vision"
            onClick={toggleLowVisionMode}
            aria-pressed={lowVisionMode}
            className="border-2 px-2.5 py-1 text-xs font-bold rounded focus-ring cursor-pointer flex items-center gap-1.5 transition-all"
            style={{
              borderColor: lowVisionMode ? palette.ink : palette.line,
              backgroundColor: lowVisionMode ? palette.ink : palette.panel,
              color: lowVisionMode ? '#FFFFFF' : palette.ink,
            }}
            title="Switch between Standard Billing and Low Vision Mobile Layout"
          >
            <Eye size={13} />
            <span>Low Vision:</span>
            <span
              className="px-1 py-0.2 rounded text-[10px] font-mono font-black uppercase"
              style={{
                backgroundColor: lowVisionMode ? '#FFFFFF' : palette.line,
                color: lowVisionMode ? '#000000' : palette.ink,
              }}
            >
              {lowVisionMode ? 'ON' : 'OFF'}
            </span>
          </button>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">GST:</span>
            <select
              id="select-gst-mode"
              value={gstMode}
              onChange={(e) => setGstMode(e.target.value as any)}
              className="border-2 px-2 py-1 text-xs font-bold rounded focus-ring cursor-pointer bg-white"
              style={{ borderColor: palette.line, color: palette.ink }}
              title="GST Calculation Mode"
            >
              <option value="inclusive">Incl. in Price</option>
              <option value="exclusive">+ Extra (Added)</option>
              <option value="off">Disabled (No GST)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Success banner for newly created bill */}
      {justBill && (
        <div
          id="banner-just-finalized"
          className="border-2 p-3.5 mb-5 flex items-center justify-between flex-wrap gap-2.5 shadow-sm rounded"
          style={{ borderColor: palette.good, backgroundColor: `${palette.good}15` }}
          role="status"
        >
          <div className="flex items-center gap-2" style={fz(14, { color: palette.good, fontWeight: 700 })}>
            <Check size={Math.round(18 * scale)} aria-hidden="true" />
            Bill #{billingSettings?.invoicePrefix ? `${billingSettings.invoicePrefix}-` : ''}{justBill.id} saved for {justBill.retailer} (₹{money(justBill.total)})
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 1-Click Download PDF */}
            <button
              type="button"
              id="btn-download-just-saved-pdf"
              onClick={() => downloadInvoicePdf(justBill, orgProfile, billingSettings)}
              className="inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:opacity-95 font-bold shadow-xs text-xs rounded"
              style={{
                backgroundColor: palette.navy,
                borderColor: palette.navy,
                color: '#FFFFFF',
              }}
              title="Download GST Tax Invoice PDF"
            >
              <Download size={14} aria-hidden="true" />
              Download PDF
            </button>

            {/* View & Print Modal */}
            <button
              type="button"
              id="btn-print-just-saved"
              onClick={() => setInvoiceModalBill(justBill)}
              className="inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:bg-white font-bold text-xs rounded"
              style={{
                borderColor: palette.line,
                backgroundColor: palette.panel,
                color: palette.ink,
              }}
              title="Open full printable GST invoice"
            >
              <Printer size={14} aria-hidden="true" />
              View & Print
            </button>

            {/* WhatsApp formatted receipt */}
            <a
              id="whatsapp-just-saved"
              href={whatsappLink(justBill.phone, buildBillText(justBill, orgProfile, billingSettings))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:opacity-95 font-bold shadow-xs text-xs rounded"
              style={{
                borderColor: '#1EBE5D',
                backgroundColor: '#25D366',
                color: '#FFFFFF',
              }}
            >
              <MessageCircle size={14} aria-hidden="true" />
              WhatsApp Bill
            </a>

            {/* View in History Option */}
            <button
              type="button"
              onClick={() => setBillingSubTab('history')}
              className="inline-flex items-center gap-1.5 border-2 px-3 py-1.5 focus-ring cursor-pointer hover:bg-white font-bold text-xs rounded"
              style={{
                borderColor: palette.navy,
                backgroundColor: `${palette.navy}10`,
                color: palette.navy,
              }}
            >
              View in History ➔
            </button>

            <IconButton
              onClick={() => setJustFinalizedBillId(null)}
              icon={X}
              label="Dismiss confirmation"
            />
          </div>
        </div>
      )}

      {/* Create Mode: Conditional between Low Vision Mode & Standard Two-Column Layout */}
      {billingSubTab === 'create' &&
        (lowVisionMode ? (
          <LowVisionBillingView
            onOpenInvoiceModal={(b) => setInvoiceModalBill(b)}
            onOpenHistory={() => setBillingSubTab('history')}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        {/* Left Column: Form & Items List */}
        <div className="lg:col-span-3">
          <div className="border-2 p-4 shadow-sm" style={cardStyle}>
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${warehouses.length > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 mb-4`}>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="bill-retailer" style={labelStyle} className="mb-0">
                    Retailer / Party Name *
                  </label>
                  <div className="flex items-center gap-2">
                    {existingCustomers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowCustomerPicker(true)}
                        className="text-xs font-bold underline hover:opacity-80 flex items-center gap-1 cursor-pointer"
                        style={{ color: palette.navy }}
                        id="pick-existing-customer-btn"
                      >
                        <UserCheck size={12} />
                        Pick ({existingCustomers.length})
                      </button>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <input
                    id="bill-retailer"
                    list="existing-customers-list"
                    placeholder="Type, speak, or select customer..."
                    value={cart.retailer}
                    onChange={(e) => {
                      const val = e.target.value;
                      const matched = existingCustomers.find((c) => c.name.toLowerCase() === val.toLowerCase());
                      setCart((prev) => ({
                        ...prev,
                        retailer: val,
                        phone: matched && matched.phone && !prev.phone ? matched.phone : prev.phone,
                      }));
                    }}
                    className="border-2 px-3 py-2.5 w-full focus-ring pr-10"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={handleVoiceCustomerSearch}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded cursor-pointer transition-colors ${
                      isVoiceListening
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                    }`}
                    title={isVoiceListening ? 'Listening... Speak customer name' : 'Click to speak customer name'}
                  >
                    {isVoiceListening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                </div>
                <datalist id="existing-customers-list">
                  {existingCustomers.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.phone ? `${c.name} (${c.phone})` : c.name}
                    </option>
                  ))}
                </datalist>
                {existingCustomers.length > 0 && !cart.retailer && (
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-400 font-medium">Quick select:</span>
                    {existingCustomers.slice(0, 3).map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => setCart((prev) => ({ ...prev, retailer: c.name, phone: c.phone || prev.phone }))}
                        className="text-[11px] font-semibold px-2 py-0.5 rounded border border-slate-300 hover:border-slate-500 bg-slate-50 hover:bg-white text-slate-700 cursor-pointer transition-colors"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {(() => {
                  const q = cart.retailer.trim().toLowerCase();
                  const matched = q ? existingCustomers.find((c) => c.name.trim().toLowerCase() === q) : null;
                  if (!matched) return null;
                  return (
                    <div
                      className="mt-1 px-2 py-0.5 rounded text-[11px] font-semibold flex items-center justify-between gap-1 border"
                      style={{
                        borderColor: palette.line,
                        backgroundColor: `${palette.navy}0a`,
                        color: palette.navy,
                      }}
                    >
                      <span>{matched.totalBills} past order{matched.totalBills !== 1 ? 's' : ''}</span>
                      {matched.balanceDue > 0 ? (
                        <span className="text-red-600 font-bold">Due: ₹{money(matched.balanceDue)}</span>
                      ) : (
                        <span className="text-green-700">All Paid</span>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <label htmlFor="bill-phone" style={labelStyle}>
                  WhatsApp Number (optional)
                </label>
                <input
                  id="bill-phone"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={cart.phone}
                  onChange={(e) => setCart({ ...cart, phone: e.target.value })}
                  className="border-2 px-3 py-2.5 w-full focus-ring"
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="bill-date" style={labelStyle}>
                  Invoice Date
                </label>
                <input
                  id="bill-date"
                  type="date"
                  value={cart.date}
                  onChange={(e) => setCart({ ...cart, date: e.target.value })}
                  className="border-2 px-3 py-2.5 w-full focus-ring"
                  style={inputStyle}
                />
              </div>
              {warehouses.length > 0 && (
                <div>
                  <label htmlFor="bill-warehouse" style={labelStyle}>
                    Dispatch Godown
                  </label>
                  <select
                    id="bill-warehouse"
                    value={cart.warehouseId || ''}
                    onChange={(e) => setCart({ ...cart, warehouseId: e.target.value })}
                    className="border-2 px-3 py-2.5 w-full focus-ring cursor-pointer"
                    style={inputStyle}
                  >
                    <option value="">Default Godown</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Line Item Inputs */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end border-t-2 pt-4"
              style={{ borderColor: palette.line }}
            >
              <div className="lg:col-span-2">
                <label htmlFor="line-product" style={labelStyle}>
                  Select Product *
                </label>
                <select
                  id="line-product"
                  value={draftLine.productId}
                  onChange={(e) => setDraftLine({ ...draftLine, productId: e.target.value, applyScheme: true })}
                  className="w-full border-2 px-3 py-2.5 focus-ring"
                  style={inputStyle}
                >
                  <option value="">-- Choose beverage --</option>
                  {products.map((p) => {
                    const promo = activePromoFor(p.id);
                    const rem = remainingStock(p.id);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({rem} left){promo ? ` — [${schemeLabel(promo)}]` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label htmlFor="line-saletype" style={labelStyle}>
                  Sale Type
                </label>
                <select
                  id="line-saletype"
                  value={draftLine.priceType}
                  onChange={(e) => setDraftLine({ ...draftLine, priceType: e.target.value as PriceType })}
                  className="w-full border-2 px-3 py-2.5 focus-ring"
                  style={inputStyle}
                >
                  <option value="Retail">Retail</option>
                  <option value="Wholesale">Wholesale</option>
                </select>
              </div>

              <div>
                <label htmlFor="line-qty" style={labelStyle}>
                  Qty (Cases) *
                </label>
                <input
                  id="line-qty"
                  type="number"
                  min="1"
                  value={draftLine.qty}
                  onChange={(e) => setDraftLine({ ...draftLine, qty: e.target.value })}
                  className="w-full border-2 px-3 py-2.5 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="line-rate" style={labelStyle}>
                  Custom Rate (₹ override)
                </label>
                <input
                  id="line-rate"
                  type="number"
                  step="0.01"
                  placeholder="Default rate"
                  value={draftLine.customRate}
                  onChange={(e) => setDraftLine({ ...draftLine, customRate: e.target.value })}
                  className="w-full border-2 px-3 py-2.5 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div className="lg:col-span-3">
                <button
                  id="btn-add-line-item"
                  type="button"
                  onClick={addLineToCart}
                  className="w-full border-2 px-4 py-2.5 flex items-center justify-center gap-2 focus-ring cursor-pointer"
                  style={{
                    backgroundColor: palette.navy,
                    borderColor: palette.navy,
                    color: '#FFFFFF',
                    ...fz(15, { fontWeight: 700 }),
                  }}
                >
                  <Plus size={Math.round(18 * scale)} aria-hidden="true" /> Add Item to Bill
                </button>
              </div>
            </div>

            {/* Scheme Toggle Alert */}
            {draftLine.productId && activePromoFor(Number(draftLine.productId)) && (
              <div
                className="mt-3 px-3 py-2.5 border-2 flex items-center gap-2.5 flex-wrap"
                style={{ borderColor: palette.amber, backgroundColor: `${palette.amber}14` }}
              >
                <label htmlFor="line-applyscheme" className="flex items-center gap-2 cursor-pointer">
                  <input
                    id="line-applyscheme"
                    type="checkbox"
                    checked={draftLine.applyScheme}
                    onChange={(e) => setDraftLine({ ...draftLine, applyScheme: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span style={fz(14, { fontWeight: 700, color: palette.ink })}>
                    Apply scheme: {schemeLabel(activePromoFor(Number(draftLine.productId)))}
                  </span>
                </label>
                {!draftLine.applyScheme && (
                  <span style={fz(12.5, { color: palette.muted })}>
                    (Scheme bypassed: billing at standard rate)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Cart Items List */}
          {cart.items.length > 0 && (
            <div className="border-2 mt-4 shadow-sm" style={cardStyle}>
              <div className="px-4 py-2.5 border-b-2 font-bold" style={{ borderColor: palette.line, ...fz(15) }}>
                Bill Line Items ({cart.items.length})
              </div>
              {cart.items.map((it) => (
                <div
                  key={it.key}
                  className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 border-b-2 last:border-b-0 gap-3"
                  style={{ borderColor: palette.line }}
                >
                  <div className="space-y-1 min-w-0">
                    <div style={fz(15, { fontWeight: 700, color: palette.ink })}>{it.productName}</div>
                    <div className="flex items-center gap-2 flex-wrap" style={fz(12.5, { color: palette.muted })}>
                      <span className="font-semibold px-1.5 py-0.5 rounded border text-[11px]" style={{ borderColor: palette.line }}>
                        {it.priceType}
                      </span>
                      {it.promoLabel && it.freeQty > 0 && (
                        <span style={{ color: palette.amber, fontWeight: 700 }}>
                          +{it.freeQty} free ({it.chargeableQty} charged)
                        </span>
                      )}
                      {it.promoLabel && it.freeQty === 0 && it.discount > 0 && (
                        <span style={{ color: palette.amber, fontWeight: 700 }}>
                          −₹{money(it.discount)} scheme
                        </span>
                      )}
                      {it.schemeSkipped && (
                        <span style={{ color: palette.muted }}> · scheme skipped</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
                    {/* Inline Qty Buttons */}
                    <div className="inline-flex items-center rounded border overflow-hidden bg-white shadow-2xs" style={{ borderColor: palette.line }}>
                      <button
                        type="button"
                        onClick={() => updateCartLine(it.key, { qty: it.qty - 1 })}
                        disabled={it.qty <= 1}
                        className="px-2 py-1 font-bold text-xs bg-stone-100 hover:bg-stone-200 disabled:opacity-30"
                        title="Decrease qty"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={it.qty}
                        onChange={(e) =>
                          updateCartLine(it.key, { qty: Math.max(1, parseInt(e.target.value) || 1) })
                        }
                        className="w-11 text-center text-xs font-bold py-1 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => updateCartLine(it.key, { qty: it.qty + 1 })}
                        className="px-2 py-1 font-bold text-xs bg-stone-100 hover:bg-stone-200"
                        title="Increase qty"
                      >
                        +
                      </button>
                    </div>

                    {/* Inline Rate Input */}
                    <div className="inline-flex items-center border rounded px-1.5 py-1 bg-white" style={{ borderColor: palette.line }}>
                      <span className="text-xs opacity-50 mr-1 font-bold">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={it.rate}
                        onChange={(e) =>
                          updateCartLine(it.key, { rate: Math.max(0, parseFloat(e.target.value) || 0) })
                        }
                        className="w-16 text-xs font-bold focus:outline-none"
                        title="Edit line item rate"
                      />
                    </div>

                    <div className="text-right min-w-[70px]">
                      <div style={fz(15, { fontWeight: 700, color: palette.ink })}>₹{money(it.amount)}</div>
                    </div>

                    <IconButton
                      onClick={() => removeLine(it.key)}
                      icon={Trash2}
                      label={`Remove ${it.productName} from bill`}
                      color={palette.bad}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Live Bill Preview & Payment Action */}
        <div className="lg:col-span-2">
          <div className="border-2 p-5 lg:sticky lg:top-4 shadow-sm" style={cardStyle}>
            <div
              style={fz(18, {
                fontWeight: 700,
                color: palette.ink,
                marginBottom: '0.6em',
                paddingBottom: '0.5em',
                borderBottom: `2px solid ${palette.line}`,
              })}
            >
              Live Invoice Summary
            </div>

            {cart.items.length === 0 ? (
              <div className="py-6 text-center" style={fz(14, { color: palette.muted })}>
                Add products from the left to calculate subtotal, scheme discounts, taxes, and final payable amount.
              </div>
            ) : (
              <div aria-live="polite">
                <div style={fz(14, { color: palette.muted, marginBottom: '0.8em' })}>
                  <strong>Party:</strong> {cart.retailer || 'Retailer not entered yet'} · {cart.date}
                </div>

                <div className="border-2 mb-4" style={{ borderColor: palette.line }}>
                  <table className="w-full text-left" style={fz(13)}>
                    <thead>
                      <tr className="border-b-2" style={{ borderColor: palette.line }}>
                        <th className="px-2 py-1.5 font-bold">Item</th>
                        <th className="px-2 py-1.5 text-right font-bold">Qty</th>
                        <th className="px-2 py-1.5 text-right font-bold">Rate</th>
                        <th className="px-2 py-1.5 text-right font-bold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.items.map((it) => (
                        <tr key={it.key} className="border-t-2" style={{ borderColor: palette.line }}>
                          <td className="px-2 py-1.5 font-medium">
                            {it.productName}
                            {it.freeQty > 0 && (
                              <span style={{ color: palette.amber, fontWeight: 700 }}> (+{it.freeQty} free)</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right">{it.qty}</td>
                          <td className="px-2 py-1.5 text-right">₹{money(it.rate)}</td>
                          <td className="px-2 py-1.5 text-right font-bold">₹{money(it.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Invoice Special Discount & Settled Price Override */}
                <div
                  className="mb-4 p-3 rounded border-2 space-y-2.5"
                  style={{ borderColor: palette.line, backgroundColor: `${palette.navy}08` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: palette.navy }}>
                      <Tag size={14} /> Special Discount / Price Override
                    </span>
                    {appliedDiscount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setInvoiceDiscountDraft('');
                          setSettledTotalDraft('');
                        }}
                        className="text-[11px] font-bold text-red-600 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="input-invoice-discount" style={labelStyle} className="text-xs">
                        Special Discount (₹)
                      </label>
                      <input
                        id="input-invoice-discount"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="₹0"
                        value={invoiceDiscountDraft}
                        onChange={(e) => handleDiscountChange(e.target.value)}
                        className="w-full border-2 px-2.5 py-1.5 focus-ring"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="input-settled-total" style={labelStyle} className="text-xs">
                        Modify Final Total (₹)
                      </label>
                      <input
                        id="input-settled-total"
                        type="number"
                        min="0"
                        step="1"
                        placeholder={`₹${money(rawTotals.total)}`}
                        value={settledTotalDraft}
                        onChange={(e) => handleSettledTotalChange(e.target.value)}
                        className="w-full border-2 px-2.5 py-1.5 focus-ring font-bold"
                        style={{ ...inputStyle, color: palette.good }}
                        title="Enter the negotiated final settled total; discount will be calculated automatically"
                      />
                    </div>
                  </div>

                  {/* Quick Discount Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[11px] text-slate-500 font-semibold">Quick:</span>
                    <button
                      type="button"
                      onClick={() => applyQuickDiscount(50)}
                      className="text-xs font-bold px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
                    >
                      −₹50
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickDiscount(100)}
                      className="text-xs font-bold px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
                    >
                      −₹100
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickDiscount(200)}
                      className="text-xs font-bold px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
                    >
                      −₹200
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickDiscount(5, true)}
                      className="text-xs font-bold px-2 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100 cursor-pointer"
                    >
                      −5% Off
                    </button>
                  </div>
                </div>

                <div style={fz(14.5)} className="space-y-2 mb-4">
                  {previewTotals.discount > 0 && (
                    <div className="flex justify-between font-bold" style={{ color: palette.amber }}>
                      <span>Trade Scheme Savings:</span>
                      <span>−₹{money(previewTotals.discount)}</span>
                    </div>
                  )}
                  {previewTotals.additionalDiscount > 0 && (
                    <div className="flex justify-between font-bold text-rose-600">
                      <span>Special Invoice Discount:</span>
                      <span>−₹{money(previewTotals.additionalDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span style={{ color: palette.muted }}>
                      {gstMode === 'inclusive' ? 'Taxable Value:' : 'Subtotal:'}
                    </span>
                    <span className="font-semibold">₹{money(previewTotals.subtotal)}</span>
                  </div>
                  {gstMode !== 'off' && (
                    <>
                      <div className="flex justify-between">
                        <span style={{ color: palette.muted }}>
                          CGST{gstMode === 'inclusive' ? ' (included)' : ''}:
                        </span>
                        <span className="font-semibold">₹{money(previewTotals.cgst)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: palette.muted }}>
                          SGST{gstMode === 'inclusive' ? ' (included)' : ''}:
                        </span>
                        <span className="font-semibold">₹{money(previewTotals.sgst)}</span>
                      </div>
                    </>
                  )}
                  <div
                    className="flex justify-between pt-2 border-t-2 font-bold"
                    style={{ borderColor: palette.line, ...fz(18, { color: palette.ink }) }}
                  >
                    <span>Total Bill:</span>
                    <span>₹{money(previewTotals.total)}</span>
                  </div>
                </div>

                {/* Amount Paid Quick Actions */}
                <div className="mb-4 pt-3 border-t-2" style={{ borderColor: palette.line }}>
                  <label htmlFor="input-amount-paid" style={labelStyle}>
                    Payment Received Now (₹)
                  </label>
                  <input
                    id="input-amount-paid"
                    type="number"
                    step="0.01"
                    placeholder={`Full amount: ₹${money(previewTotals.total)}`}
                    value={amountPaidDraft}
                    onChange={(e) => setAmountPaidDraft(e.target.value)}
                    className="w-full border-2 px-3 py-2 mb-2 focus-ring"
                    style={inputStyle}
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setAmountPaidDraft(String(previewTotals.total))}
                      className="border-2 px-2.5 py-1 text-xs font-bold focus-ring cursor-pointer"
                      style={{ borderColor: palette.line, backgroundColor: palette.panel }}
                    >
                      Full Paid (₹{money(previewTotals.total)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountPaidDraft('0')}
                      className="border-2 px-2.5 py-1 text-xs font-bold focus-ring cursor-pointer"
                      style={{ borderColor: palette.line, backgroundColor: palette.panel }}
                    >
                      Credit (₹0)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountPaidDraft(String(Math.round(previewTotals.total / 2)))}
                      className="border-2 px-2.5 py-1 text-xs font-bold focus-ring cursor-pointer"
                      style={{ borderColor: palette.line, backgroundColor: palette.panel }}
                    >
                      50% Advance
                    </button>
                  </div>
                </div>

                {/* Direct WhatsApp Automation */}
                <div className="mb-4 p-2.5 rounded border flex items-center justify-between gap-2" style={{ borderColor: palette.line, backgroundColor: palette.panel }}>
                  <label htmlFor="checkbox-autosend-whatsapp" className="flex items-center gap-2 cursor-pointer text-xs font-bold" style={{ color: palette.ink }}>
                    <input
                      id="checkbox-autosend-whatsapp"
                      type="checkbox"
                      checked={autoSendWhatsApp}
                      onChange={(e) => setAutoSendWhatsApp(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>Directly send bill via WhatsApp on finalize</span>
                  </label>
                  {cart.phone ? (
                    <span className="text-[11px] font-mono font-bold text-emerald-600 flex items-center gap-1">
                      <Phone size={11} /> {cart.phone}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">No phone yet</span>
                  )}
                </div>

                {/* Last Finalized Bill WhatsApp Banner */}
                {lastFinalizedWhatsApp && (
                  <div className="mb-4 p-3 rounded-lg border-2 border-emerald-500 bg-emerald-50 text-emerald-950 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-xs">
                    <div className="text-xs font-bold">
                      ✅ Bill #{lastFinalizedWhatsApp.id} saved & WhatsApp ready for {lastFinalizedWhatsApp.phone}!
                    </div>
                    <a
                      href={lastFinalizedWhatsApp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <MessageCircle size={14} /> Open WhatsApp
                    </a>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    id="btn-finalize-bill"
                    type="button"
                    onClick={handleFinalize}
                    disabled={!cart.retailer.trim() || cart.items.length === 0}
                    className="w-full border-2 px-4 py-3 text-center focus-ring cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                    style={{
                      backgroundColor: palette.good,
                      borderColor: palette.good,
                      color: '#FFFFFF',
                      ...fz(16),
                    }}
                  >
                    {editingBillId ? 'Update Bill' : 'Save & Print Invoice'}
                  </button>
                  {editingBillId ? (
                    <button
                      type="button"
                      id="btn-cancel-edit-bill"
                      onClick={() => {
                        cancelEditBill();
                        setAmountPaidDraft('');
                        setInvoiceDiscountDraft('');
                        setSettledTotalDraft('');
                      }}
                      className="w-full border-2 px-3 py-2 text-center focus-ring cursor-pointer font-semibold"
                      style={{
                        borderColor: palette.line,
                        color: palette.muted,
                        backgroundColor: palette.panel,
                        ...fz(14),
                      }}
                    >
                      Cancel Editing
                    </button>
                  ) : (
                    (cart.items.length > 0 || Boolean(cart.retailer && cart.retailer.trim())) && (
                      <button
                        type="button"
                        id="btn-cancel-bill-draft"
                        onClick={() => {
                          cancelEditBill();
                          setAmountPaidDraft('');
                          setInvoiceDiscountDraft('');
                          setSettledTotalDraft('');
                          setDraftLine({
                            productId: '',
                            priceType: billingSettings?.defaultSaleType || 'Retail',
                            qty: '1',
                            customRate: '',
                            customDiscount: '',
                            applyScheme: billingSettings?.autoApplyPromotions ?? true,
                          });
                        }}
                        className="w-full border-2 border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-2 text-center font-bold text-xs rounded transition-colors cursor-pointer shadow-xs"
                        title="Cancel sale and clear current cart draft"
                      >
                        Cancel Sale & Clear Cart
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
        ))}

      {/* Bill & Payment History View (Active when 'history' subtab is selected) */}
      {billingSubTab === 'history' && (
        <BillingHistoryView
          onViewInvoice={(b) => setInvoiceModalBill(b)}
          onEditBill={(b) => setEditModalBill(b)}
          onDeleteBill={(b) => setBillToDelete(b)}
          onNewInvoiceClick={() => setBillingSubTab('create')}
        />
      )}

      {invoiceModalBill && (
        <TaxInvoiceModal
          bill={invoiceModalBill}
          onClose={() => setInvoiceModalBill(null)}
        />
      )}

      {/* In-Place Bill Edit Modal */}
      {editModalBill && (
        <EditBillModal
          bill={editModalBill}
          onClose={() => setEditModalBill(null)}
          onSave={(updated) => {
            updateBill(updated);
            setEditModalBill(null);
          }}
          onRequestDelete={(b) => {
            setEditModalBill(null);
            setBillToDelete(b);
          }}
          products={products}
          promotions={promotions}
          warehouses={warehouses}
          existingCustomers={existingCustomers}
          gstMode={gstMode}
          palette={palette}
          invoicePrefix={billingSettings?.invoicePrefix || ''}
          remainingStock={remainingStock}
        />
      )}

      {/* Safe Delete Bill Confirmation Modal */}
      {billToDelete && (
        <DeleteConfirmModal
          bill={billToDelete}
          onConfirm={(id) => {
            deleteBill(id);
            setBillToDelete(null);
          }}
          onCancel={() => setBillToDelete(null)}
          palette={palette}
          invoicePrefix={billingSettings?.invoicePrefix || ''}
        />
      )}

      {/* Customer Selector Modal */}
      {showCustomerPicker && (
        <CustomerSelector
          customers={existingCustomers}
          currentRetailer={cart.retailer}
          palette={palette}
          scale={scale}
          onSelect={(c) => {
            setCart((prev) => ({
              ...prev,
              retailer: c.name,
              phone: c.phone || prev.phone,
            }));
            setShowCustomerPicker(false);
          }}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}
    </div>
  );
};
