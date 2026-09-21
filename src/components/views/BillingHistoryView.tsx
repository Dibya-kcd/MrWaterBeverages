import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Eye,
  FileText,
  Filter,
  MessageCircle,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  User,
  Users,
  Check,
} from 'lucide-react';
import { Bill, ExistingCustomer } from '../../types';
import { money, statusOf } from '../../utils/billing';
import { StatusBadge } from '../common/StatusBadge';
import { WhatsAppButton } from '../common/WhatsAppButton';
import { useLedger } from '../../context/LedgerContext';

interface BillingHistoryViewProps {
  onViewInvoice: (bill: Bill) => void;
  onEditBill: (bill: Bill) => void;
  onDeleteBill: (bill: Bill) => void;
  onNewInvoiceClick?: () => void;
}

type HistoryGrouping = 'date' | 'customer';
type PaymentFilter = 'all' | 'pending' | 'paid';

export const BillingHistoryView: React.FC<BillingHistoryViewProps> = ({
  onViewInvoice,
  onEditBill,
  onDeleteBill,
  onNewInvoiceClick,
}) => {
  const {
    bills,
    salesmen,
    recordPayment,
    syncBillsToCloud,
    palette,
    fz,
    scale,
    billingSettings,
  } = useLedger();

  const [grouping, setGrouping] = useState<HistoryGrouping>('date');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [salesmanFilter, setSalesmanFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [paymentDraft, setPaymentDraft] = useState<Record<number, string>>({});
  const [isSyncingBills, setIsSyncingBills] = useState(false);
  const [syncBillsMsg, setSyncBillsMsg] = useState<string | null>(null);

  const prefix = billingSettings?.invoicePrefix ? `${billingSettings.invoicePrefix}-` : '';

  // Filter bills based on search and payment status
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        b.retailer.toLowerCase().includes(q) ||
        (b.phone && b.phone.includes(q)) ||
        String(b.id).includes(q) ||
        b.date.includes(q) ||
        b.items.some((i) => i.productName.toLowerCase().includes(q));

      const due = Math.max(0, b.total - b.amountPaid);
      let matchesPayment = true;
      if (paymentFilter === 'pending') matchesPayment = due > 0;
      if (paymentFilter === 'paid') matchesPayment = due === 0;

      let matchesSalesman = true;
      if (salesmanFilter) {
        matchesSalesman =
          b.salesmanId === salesmanFilter ||
          b.salesman === salesmanFilter ||
          salesmen.find((s) => s.id === salesmanFilter)?.name === b.salesman;
      }

      return matchesSearch && matchesPayment && matchesSalesman;
    });
  }, [bills, salesmen, searchQuery, paymentFilter, salesmanFilter]);

  // Overall statistics
  const stats = useMemo(() => {
    const totalCount = bills.length;
    const totalBilled = bills.reduce((sum, b) => sum + b.total, 0);
    const totalPaid = bills.reduce((sum, b) => sum + b.amountPaid, 0);
    const totalDue = Math.max(0, totalBilled - totalPaid);
    const pendingCount = bills.filter((b) => b.total - b.amountPaid > 0).length;
    const paidCount = bills.filter((b) => b.total - b.amountPaid <= 0).length;
    return { totalCount, totalBilled, totalPaid, totalDue, pendingCount, paidCount };
  }, [bills]);

  // Group by Date (Latest date on top)
  const dateGroups = useMemo(() => {
    const map = new Map<string, Bill[]>();
    for (const b of filteredBills) {
      const dateKey = b.date || 'Unspecified Date';
      const arr = map.get(dateKey) || [];
      arr.push(b);
      map.set(dateKey, arr);
    }

    // Sort dates in descending order (latest on top)
    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    return sortedDates.map((date) => {
      // Sort bills inside each date in sequence (latest on top)
      const groupBills = (map.get(date) || []).sort((a, b) => b.id - a.id);
      const totalBilled = groupBills.reduce((s, b) => s + b.total, 0);
      const totalPaid = groupBills.reduce((s, b) => s + b.amountPaid, 0);
      const totalDue = Math.max(0, totalBilled - totalPaid);
      return {
        key: `date-${date}`,
        label: date,
        bills: groupBills,
        totalBilled,
        totalPaid,
        totalDue,
      };
    });
  }, [filteredBills]);

  // Group by Customer (Latest activity on top)
  const customerGroups = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; bills: Bill[] }>();
    for (const b of filteredBills) {
      const norm = (b.retailer || 'Unknown Party').trim();
      const key = norm.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { name: norm, phone: b.phone || '', bills: [b] });
      } else {
        existing.bills.push(b);
        if (!existing.phone && b.phone) existing.phone = b.phone;
      }
    }

    const groups = Array.from(map.entries()).map(([key, data]) => {
      // Sort bills for each customer with latest on top
      const sortedBills = data.bills.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return b.id - a.id;
      });
      const latestDate = sortedBills[0]?.date || '';
      const totalBilled = sortedBills.reduce((s, b) => s + b.total, 0);
      const totalPaid = sortedBills.reduce((s, b) => s + b.amountPaid, 0);
      const totalDue = Math.max(0, totalBilled - totalPaid);
      return {
        key: `cust-${key}`,
        name: data.name,
        phone: data.phone,
        latestDate,
        bills: sortedBills,
        totalBilled,
        totalPaid,
        totalDue,
      };
    });

    // Sequence manner: customer with latest bill on top
    return groups.sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  }, [filteredBills]);

  // Toggle expansion for an accordion key
  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key], // Default is expanded (undefined => true)
    }));
  };

  const isExpanded = (key: string, isFirst: boolean) => {
    if (expandedKeys[key] !== undefined) return expandedKeys[key];
    return isFirst; // Expand top group by default
  };

  const handleExpandAll = () => {
    const allKeys: Record<string, boolean> = {};
    if (grouping === 'date') {
      dateGroups.forEach((g) => {
        allKeys[g.key] = true;
      });
    } else {
      customerGroups.forEach((g) => {
        allKeys[g.key] = true;
      });
    }
    setExpandedKeys(allKeys);
  };

  const handleCollapseAll = () => {
    const allKeys: Record<string, boolean> = {};
    if (grouping === 'date') {
      dateGroups.forEach((g) => {
        allKeys[g.key] = false;
      });
    } else {
      customerGroups.forEach((g) => {
        allKeys[g.key] = false;
      });
    }
    setExpandedKeys(allKeys);
  };

  const handleRecordPayment = (billId: number) => {
    const amount = Number(paymentDraft[billId]);
    if (!amount || amount <= 0) return;
    recordPayment(billId, amount);
    setPaymentDraft((pd) => ({ ...pd, [billId]: '' }));
  };

  const handleFullClear = (bill: Bill) => {
    const due = Math.max(0, bill.total - bill.amountPaid);
    if (due > 0) {
      recordPayment(bill.id, due);
    }
  };

  const cardStyle = {
    backgroundColor: palette.panel,
    borderColor: palette.line,
  };

  return (
    <div id="view-billing-history" className="space-y-4">
      {/* Top Bar: Grouping, Filters, and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-2 p-3 sm:p-4 rounded shadow-xs" style={cardStyle}>
        {/* Left: View Mode (Date-wise vs Customer) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">View By:</span>
          <div className="flex rounded border-2 overflow-hidden bg-slate-100 p-0.5" style={{ borderColor: palette.line }}>
            <button
              type="button"
              id="history-group-date"
              onClick={() => setGrouping('date')}
              className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer rounded transition-colors ${
                grouping === 'date' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
              }`}
              style={grouping === 'date' ? { backgroundColor: palette.navy, color: '#FFFFFF' } : {}}
            >
              <Calendar size={13} />
              Date-wise
            </button>
            <button
              type="button"
              id="history-group-customer"
              onClick={() => setGrouping('customer')}
              className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer rounded transition-colors ${
                grouping === 'customer' ? 'bg-blue-900 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
              }`}
              style={grouping === 'customer' ? { backgroundColor: palette.navy, color: '#FFFFFF' } : {}}
            >
              <Users size={13} />
              By Customer
            </button>
          </div>

          <div className="flex items-center gap-1 ml-2">
            <button
              type="button"
              onClick={handleExpandAll}
              className="text-xs font-bold px-2 py-1 border rounded hover:bg-slate-50 cursor-pointer"
              style={{ borderColor: palette.line, color: palette.navy }}
              title="Expand all sections"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="text-xs font-bold px-2 py-1 border rounded hover:bg-slate-50 cursor-pointer"
              style={{ borderColor: palette.line, color: palette.muted }}
              title="Collapse all sections"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Right: Metrics & Sync */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 border font-bold text-xs rounded" style={{ borderColor: palette.line, backgroundColor: palette.panel }}>
            {bills.length} Bills
          </span>
          <span className="px-2.5 py-1 border font-bold text-xs rounded text-blue-900 bg-blue-50 border-blue-200">
            ₹{money(stats.totalBilled)}
          </span>
          {stats.totalDue > 0 && (
            <span className="px-2.5 py-1 border font-bold text-xs rounded text-rose-700 bg-rose-50 border-rose-200">
              Due: ₹{money(stats.totalDue)}
            </span>
          )}
          <button
            type="button"
            id="btn-sync-history-cloud"
            disabled={isSyncingBills}
            onClick={async () => {
              setIsSyncingBills(true);
              setSyncBillsMsg(null);
              try {
                const res = await syncBillsToCloud();
                if (res.success) {
                  setSyncBillsMsg(`Synced ${res.count} bills to cloud!`);
                } else {
                  setSyncBillsMsg(`Sync note: ${res.error || 'Check connection'}`);
                }
              } catch (e: any) {
                setSyncBillsMsg(`Sync failed: ${e?.message || 'Error'}`);
              } finally {
                setIsSyncingBills(false);
                setTimeout(() => setSyncBillsMsg(null), 4000);
              }
            }}
            className="flex items-center gap-1 border px-2.5 py-1 text-xs font-bold rounded cursor-pointer hover:bg-slate-50"
            style={{ borderColor: palette.line }}
            title="Sync with cloud database"
          >
            <RefreshCw size={12} className={isSyncingBills ? 'animate-spin text-blue-600' : ''} />
            {isSyncingBills ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {syncBillsMsg && (
        <div className="p-2.5 border rounded flex items-center gap-2 text-xs font-bold bg-emerald-50 text-emerald-800 border-emerald-300">
          <Check size={14} />
          {syncBillsMsg}
        </div>
      )}

      {/* Search and Status Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-2 p-3 rounded shadow-xs" style={cardStyle}>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="history-search-input"
            type="text"
            placeholder="Search party, bill #, phone, beverage..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs font-medium border-2 rounded focus-ring"
            style={{ borderColor: palette.line, backgroundColor: palette.panel }}
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            id="filter-by-salesman"
            aria-label="Filter by Salesman"
            value={salesmanFilter}
            onChange={(e) => setSalesmanFilter(e.target.value)}
            className="border-2 rounded px-2.5 py-1 text-xs font-semibold focus-ring bg-white"
            style={{ borderColor: palette.line }}
          >
            <option value="">All Salesmen ({salesmen.length})</option>
            {salesmen.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {(
            [
              { id: 'all', label: 'All', count: stats.totalCount },
              { id: 'pending', label: 'Pending Due', count: stats.pendingCount },
              { id: 'paid', label: 'Paid', count: stats.paidCount },
            ] as const
          ).map((flt) => {
            const active = paymentFilter === flt.id;
            return (
              <button
                key={flt.id}
                type="button"
                onClick={() => setPaymentFilter(flt.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  active ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
                style={active ? { backgroundColor: palette.navy, borderColor: palette.navy, color: '#FFFFFF' } : {}}
              >
                <span>{flt.label}</span>
                <span className={`px-1 py-0.2 rounded text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {flt.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Listing: Empty State */}
      {filteredBills.length === 0 && (
        <div className="border-2 p-8 text-center rounded shadow-xs" style={cardStyle}>
          <FileText size={32} className="mx-auto text-slate-400 mb-2" />
          <p className="font-bold text-slate-700 text-sm">No bills match your criteria.</p>
          {onNewInvoiceClick && (
            <button
              type="button"
              onClick={onNewInvoiceClick}
              className="mt-3 px-4 py-2 text-xs font-bold text-white rounded cursor-pointer"
              style={{ backgroundColor: palette.good }}
            >
              Create New Invoice
            </button>
          )}
        </div>
      )}

      {/* Grouping Mode 1: Date-wise (Sequence: Latest on top) */}
      {grouping === 'date' &&
        dateGroups.map((group, idx) => {
          const expanded = isExpanded(group.key, idx === 0);
          return (
            <div key={group.key} className="border-2 rounded overflow-hidden shadow-xs" style={cardStyle}>
              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => toggleExpand(group.key)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer select-none bg-slate-50/80 hover:bg-slate-100/80 border-b"
                style={{ borderColor: palette.line }}
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  {expanded ? <ChevronUp size={16} className="text-slate-600" /> : <ChevronDown size={16} className="text-slate-600" />}
                  <Calendar size={15} style={{ color: palette.navy }} />
                  <span className="font-bold text-sm text-slate-900">{group.label}</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-700">
                    {group.bills.length} bill{group.bills.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="text-slate-800">₹{money(group.totalBilled)}</span>
                  {group.totalDue > 0 ? (
                    <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                      Due: ₹{money(group.totalDue)}
                    </span>
                  ) : (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      Settled
                    </span>
                  )}
                </div>
              </button>

              {/* Accordion Body: Bills in sequence */}
              {expanded && (
                <div className="divide-y divide-slate-200 p-2 sm:p-3 space-y-2">
                  {group.bills.map((bill) => (
                    <BillItemCard
                      key={bill.id}
                      bill={bill}
                      prefix={prefix}
                      palette={palette}
                      onViewInvoice={onViewInvoice}
                      onEditBill={onEditBill}
                      onDeleteBill={onDeleteBill}
                      paymentDraft={paymentDraft[bill.id] || ''}
                      onPaymentDraftChange={(val) => setPaymentDraft((prev) => ({ ...prev, [bill.id]: val }))}
                      onRecordPayment={() => handleRecordPayment(bill.id)}
                      onFullClear={() => handleFullClear(bill)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

      {/* Grouping Mode 2: Customer-wise (Sequence: Latest customer on top) */}
      {grouping === 'customer' &&
        customerGroups.map((group, idx) => {
          const expanded = isExpanded(group.key, idx === 0);
          return (
            <div key={group.key} className="border-2 rounded overflow-hidden shadow-xs" style={cardStyle}>
              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => toggleExpand(group.key)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer select-none bg-slate-50/80 hover:bg-slate-100/80 border-b"
                style={{ borderColor: palette.line }}
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  {expanded ? <ChevronUp size={16} className="text-slate-600" /> : <ChevronDown size={16} className="text-slate-600" />}
                  <User size={15} style={{ color: palette.navy }} />
                  <span className="font-bold text-sm text-slate-900">{group.name}</span>
                  {group.phone && <span className="text-xs text-slate-500 font-mono">({group.phone})</span>}
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-700">
                    {group.bills.length} order{group.bills.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="text-slate-500">Last: {group.latestDate}</span>
                  <span className="text-slate-800">Total: ₹{money(group.totalBilled)}</span>
                  {group.totalDue > 0 ? (
                    <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                      Due: ₹{money(group.totalDue)}
                    </span>
                  ) : (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      All Paid
                    </span>
                  )}
                </div>
              </button>

              {/* Accordion Body: Bills for this customer in sequence */}
              {expanded && (
                <div className="divide-y divide-slate-200 p-2 sm:p-3 space-y-2">
                  {group.bills.map((bill) => (
                    <BillItemCard
                      key={bill.id}
                      bill={bill}
                      prefix={prefix}
                      palette={palette}
                      onViewInvoice={onViewInvoice}
                      onEditBill={onEditBill}
                      onDeleteBill={onDeleteBill}
                      paymentDraft={paymentDraft[bill.id] || ''}
                      onPaymentDraftChange={(val) => setPaymentDraft((prev) => ({ ...prev, [bill.id]: val }))}
                      onRecordPayment={() => handleRecordPayment(bill.id)}
                      onFullClear={() => handleFullClear(bill)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

interface BillItemCardProps {
  bill: Bill;
  prefix: string;
  palette: any;
  onViewInvoice: (b: Bill) => void;
  onEditBill: (b: Bill) => void;
  onDeleteBill: (b: Bill) => void;
  paymentDraft: string;
  onPaymentDraftChange: (val: string) => void;
  onRecordPayment: () => void;
  onFullClear: () => void;
}

const BillItemCard: React.FC<BillItemCardProps> = ({
  bill,
  prefix,
  palette,
  onViewInvoice,
  onEditBill,
  onDeleteBill,
  paymentDraft,
  onPaymentDraftChange,
  onRecordPayment,
  onFullClear,
}) => {
  const balance = Math.max(0, bill.total - bill.amountPaid);
  const st = statusOf(bill.total, bill.amountPaid);
  const totalCases = bill.items.reduce((s, i) => s + i.qty, 0);
  const freeCases = bill.items.reduce((s, i) => s + (i.freeQty || 0), 0);

  return (
    <div className="border rounded-md p-3 bg-white hover:border-slate-400 transition-colors shadow-2xs space-y-2.5">
      {/* Top Line: Invoice #, Date, Customer & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onViewInvoice(bill)}
            className="font-bold font-mono text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-blue-900 border border-slate-300 cursor-pointer"
            title="Click to view tax invoice"
          >
            #{prefix}{bill.id}
          </button>
          <span className="text-xs text-slate-500 font-medium">{bill.date}</span>
          <span className="font-bold text-xs text-slate-900">{bill.retailer}</span>
          {bill.salesman && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200 flex items-center gap-1">
              <User size={10} />
              <span>{bill.salesman}</span>
            </span>
          )}
          {bill.phone && (
            <span className="text-xs text-slate-500 font-mono flex items-center gap-0.5">
              <Phone size={10} />
              {bill.phone}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={st} />
        </div>
      </div>

      {/* Item Summary Chips */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
        <span className="font-bold text-slate-600">{totalCases} cs</span>
        {freeCases > 0 && <span className="font-bold text-amber-700">(+{freeCases} free)</span>}
        <span className="text-slate-300">·</span>
        {bill.items.map((item, idx) => (
          <span key={item.key || idx} className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
            {item.productName} ({item.qty} cs @ ₹{item.rate})
          </span>
        ))}
      </div>

      {/* Financials & Quick Collection Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div>
            <span className="text-slate-500">Bill: </span>
            <strong className="text-slate-900">₹{money(bill.total)}</strong>
          </div>
          <div>
            <span className="text-slate-500">Paid: </span>
            <strong className="text-emerald-700">₹{money(bill.amountPaid)}</strong>
          </div>
          {balance > 0 ? (
            <div>
              <span className="text-slate-500">Due: </span>
              <strong className="text-rose-700">₹{money(balance)}</strong>
            </div>
          ) : (
            <span className="text-emerald-700 font-bold text-[11px]">✓ Settled</span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {balance > 0 && (
            <div className="flex items-center gap-1 mr-1">
              <input
                type="number"
                step="0.01"
                placeholder={`₹${balance}`}
                value={paymentDraft}
                onChange={(e) => onPaymentDraftChange(e.target.value)}
                className="w-20 px-2 py-1 text-xs border rounded font-mono font-bold focus:outline-none"
                style={{ borderColor: palette.line }}
              />
              <button
                type="button"
                onClick={onRecordPayment}
                disabled={!paymentDraft || Number(paymentDraft) <= 0}
                className="px-2 py-1 text-xs font-bold rounded text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
                title="Record partial or full payment"
              >
                Pay
              </button>
              <button
                type="button"
                onClick={onFullClear}
                className="px-1.5 py-1 text-[11px] font-bold rounded border bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                title="Clear entire due balance"
              >
                Clear
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onViewInvoice(bill)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border hover:bg-slate-100 cursor-pointer"
            style={{ borderColor: palette.line, color: palette.navy }}
            title="View Tax Invoice"
          >
            <Eye size={12} />
            <span>View</span>
          </button>

          <button
            type="button"
            onClick={() => onEditBill(bill)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border hover:bg-amber-50 text-amber-800 border-amber-300 cursor-pointer"
            title="Edit this invoice"
          >
            <Pencil size={12} />
            <span>Edit</span>
          </button>

          <WhatsAppButton bill={bill} id={`wa-btn-hist-${bill.id}`} />

          <button
            type="button"
            onClick={() => onDeleteBill(bill)}
            className="p-1 text-xs font-bold rounded text-rose-600 hover:bg-rose-50 hover:text-rose-800 border border-transparent hover:border-rose-200 cursor-pointer"
            title="Delete this bill"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
