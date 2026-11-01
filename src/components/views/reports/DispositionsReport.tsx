import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileWarning,
  Gift,
  HandCoins,
  Package,
  Search,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { InventoryDisposition, InventoryDispositionType, SupplierCreditNote } from '../../../types';
import { money } from '../../../utils/billing';
import { trackedStage } from '../ExpiryReturnsTracker';

const STAGE_LABEL = {
  held: 'In godown',
  sent: 'With company',
  settled: 'Credit received',
  rejected: 'Company refused',
  discarded: 'Thrown out',
} as const;

type SubTab = 'summary' | 'free' | 'writeoffs' | 'claims' | 'batches' | 'creditnotes';

const TYPE_LABEL: Record<InventoryDispositionType, string> = {
  expiry_return: 'Expiry return',
  quality_return: 'Quality return',
  invoice_error_return: 'Invoice error return',
  return_to_supplier: 'Return to supplier',
  return_to_company: 'Return to company',
  free_near_expiry: 'Free near-expiry',
  scheme_free_issue: 'Scheme free issue',
  expired_writeoff: 'Expired write-off',
  damage_writeoff: 'Damage write-off',
};

const FREE_TYPES: InventoryDispositionType[] = ['free_near_expiry', 'scheme_free_issue'];
const WRITEOFF_TYPES: InventoryDispositionType[] = ['expired_writeoff', 'damage_writeoff'];
const RETURN_TYPES: InventoryDispositionType[] = [
  'expiry_return',
  'quality_return',
  'invoice_error_return',
  'return_to_supplier',
  'return_to_company',
];

function inPeriod(
  eventDate: string,
  period: string,
  selectedDate: string,
  startDate: string,
  endDate: string,
  todayStr: string,
  yesterdayStr: string,
  sevenDaysAgoStr: string,
  currentYearMonth: string,
  lastYearMonth: string
) {
  const d = (eventDate || '').slice(0, 10);
  if (!d) return false;
  if (period === 'customDate') return d === selectedDate;
  if (period === 'today') return d === todayStr;
  if (period === 'yesterday') return d === yesterdayStr;
  if (period === 'last7') return d >= sevenDaysAgoStr && d <= todayStr;
  if (period === 'thisMonth') return d.startsWith(currentYearMonth);
  if (period === 'lastMonth') return d.startsWith(lastYearMonth);
  if (period === 'customRange') return (!startDate || d >= startDate) && (!endDate || d <= endDate);
  return true; // all
}

interface Props {
  period: string;
  selectedDate: string;
  startDate: string;
  endDate: string;
  todayStr: string;
  yesterdayStr: string;
  sevenDaysAgoStr: string;
  currentYearMonth: string;
  lastYearMonth: string;
  periodLabel: string;
}

export const DispositionsReport: React.FC<Props> = ({
  period,
  selectedDate,
  startDate,
  endDate,
  todayStr,
  yesterdayStr,
  sevenDaysAgoStr,
  currentYearMonth,
  lastYearMonth,
  periodLabel,
}) => {
  const { inventoryDispositions, supplierCreditNotes, inventoryBatches, products, warehouses } =
    useLedger();
  const [subTab, setSubTab] = useState<SubTab>('summary');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return inventoryDispositions.filter((r) =>
      inPeriod(
        r.eventDate,
        period,
        selectedDate,
        startDate,
        endDate,
        todayStr,
        yesterdayStr,
        sevenDaysAgoStr,
        currentYearMonth,
        lastYearMonth
      )
    );
  }, [
    inventoryDispositions,
    period,
    selectedDate,
    startDate,
    endDate,
    todayStr,
    yesterdayStr,
    sevenDaysAgoStr,
    currentYearMonth,
    lastYearMonth,
  ]);

  const kpis = useMemo(() => {
    let freeCost = 0;
    let freeQty = 0;
    let writeoffCost = 0;
    let writeoffQty = 0;
    let returnCost = 0;
    let returnQty = 0;
    let claimedSettled = 0;
    let claimedPending = 0;
    let openClaims = 0;

    filtered.forEach((r) => {
      if (FREE_TYPES.includes(r.dispositionType)) {
        freeCost += r.costValue || 0;
        freeQty += r.quantity || 0;
      } else if (WRITEOFF_TYPES.includes(r.dispositionType)) {
        writeoffCost += r.costValue || 0;
        writeoffQty += r.quantity || 0;
      } else if (RETURN_TYPES.includes(r.dispositionType)) {
        returnCost += r.costValue || 0;
        returnQty += r.quantity || 0;
      }
      if (r.compensationStatus === 'pending' || r.compensationStatus === 'partial') {
        openClaims += 1;
        claimedPending += Math.max(0, (r.costValue || 0) - (r.compensatedAmount || 0));
      }
      if (r.compensationStatus === 'settled' || r.compensationStatus === 'partial') {
        claimedSettled += r.compensatedAmount || 0;
      }
    });

    // Scheme credit notes in period (by credit note date or createdAt)
    // Exclude return disposition credit notes (already tracked in claimedSettled / "Disposition CN settled")
    const rawScnInPeriod = supplierCreditNotes.filter((n) => {
      if ((n.notes || '').includes('Linked disposition')) return false;
      const d = (n.creditNoteDate || n.createdAt || '').slice(0, 10);
      return inPeriod(
        d,
        period,
        selectedDate,
        startDate,
        endDate,
        todayStr,
        yesterdayStr,
        sevenDaysAgoStr,
        currentYearMonth,
        lastYearMonth
      );
    });

    // Deduplicate in case any duplicate records exist
    const seenCnKeys = new Set<string>();
    const scnInPeriod = rawScnInPeriod.filter((n) => {
      const key = n.creditNoteNumber
        ? `${(n.supplierName || '').trim().toLowerCase()}_${n.creditNoteNumber.trim().toLowerCase()}`
        : n.id;
      if (seenCnKeys.has(key)) return false;
      seenCnKeys.add(key);
      return true;
    });

    const scnExpected = scnInPeriod.reduce((s, n) => s + (n.expectedAmount || 0), 0);
    const scnActual = scnInPeriod.reduce((s, n) => s + (n.actualAmount || 0), 0);
    const scnOpen = scnInPeriod.filter((n) => n.status !== 'settled').length;

    return {
      freeCost,
      freeQty,
      writeoffCost,
      writeoffQty,
      returnCost,
      returnQty,
      claimedSettled,
      claimedPending,
      openClaims,
      totalLossCost: freeCost + writeoffCost,
      scnExpected,
      scnActual,
      scnOpen,
      scnCount: scnInPeriod.length,
      scnInPeriod,
    };
  }, [
    filtered,
    supplierCreditNotes,
    period,
    selectedDate,
    startDate,
    endDate,
    todayStr,
    yesterdayStr,
    sevenDaysAgoStr,
    currentYearMonth,
    lastYearMonth,
  ]);

  const freeRows = useMemo(
    () => filtered.filter((r) => FREE_TYPES.includes(r.dispositionType)),
    [filtered]
  );
  const writeoffRows = useMemo(
    () => filtered.filter((r) => WRITEOFF_TYPES.includes(r.dispositionType)),
    [filtered]
  );
  const claimRows = useMemo(
    () =>
      filtered.filter(
        (r) =>
          RETURN_TYPES.includes(r.dispositionType) &&
          (r.compensationStatus === 'pending' ||
            r.compensationStatus === 'partial' ||
            r.compensationStatus === 'settled')
      ),
    [filtered]
  );

  /** Batch-level impact: dispositions by batch + remaining stock */
  const batchTracking = useMemo(() => {
    const map = new Map<
      string,
      {
        batchId: string;
        batchNumber: string;
        productId: number;
        productName: string;
        warehouseId: string;
        warehouseName: string;
        expiryDate: string;
        disposedQty: number;
        disposedCost: number;
        remainingQty: number;
        supplierInvoiceNo: string;
        events: number;
      }
    >();

    filtered.forEach((r) => {
      if (!r.batchId && !r.batchNumber) return;
      const key = r.batchId || `${r.productId}_${r.batchNumber}_${r.warehouseId}`;
      const existing = map.get(key);
      const batch = inventoryBatches.find((b) => b.id === r.batchId);
      if (!existing) {
        map.set(key, {
          batchId: r.batchId || key,
          batchNumber: r.batchNumber || batch?.batchNumber || '—',
          productId: r.productId,
          productName: r.productName || products.find((p) => p.id === r.productId)?.name || `#${r.productId}`,
          warehouseId: r.warehouseId,
          warehouseName:
            r.warehouseName || warehouses.find((w) => w.id === r.warehouseId)?.name || r.warehouseId,
          expiryDate: r.expiryDate || batch?.expiryDate || '',
          disposedQty: r.quantity || 0,
          disposedCost: r.costValue || 0,
          remainingQty: batch?.quantity ?? 0,
          supplierInvoiceNo: r.supplierInvoiceNo || batch?.supplierInvoiceNo || '',
          events: 1,
        });
      } else {
        existing.disposedQty += r.quantity || 0;
        existing.disposedCost += r.costValue || 0;
        existing.events += 1;
      }
    });

    let rows = Array.from(map.values());
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.batchNumber.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.supplierInvoiceNo.toLowerCase().includes(q)
      );
    }
    return rows.sort((a, b) => b.disposedCost - a.disposedCost);
  }, [filtered, inventoryBatches, products, warehouses, search]);

  const matchRows = (rows: InventoryDisposition[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.productName || '').toLowerCase().includes(q) ||
        (r.batchNumber || '').toLowerCase().includes(q) ||
        (r.supplierName || '').toLowerCase().includes(q) ||
        (r.creditNoteNumber || '').toLowerCase().includes(q) ||
        (r.distributedToName || '').toLowerCase().includes(q)
    );
  };

  const exportCsv = () => {
    const lines: string[] = [
      'MrWater — Dispositions, Free Issues, Write-offs & Supplier Claims',
      `Period,${periodLabel}`,
      '',
      'KPI,Value',
      `Free issue cost,${kpis.freeCost.toFixed(2)}`,
      `Free issue cases,${kpis.freeQty}`,
      `Write-off cost,${kpis.writeoffCost.toFixed(2)}`,
      `Write-off cases,${kpis.writeoffQty}`,
      `Return cost (claims base),${kpis.returnCost.toFixed(2)}`,
      `Open claims count,${kpis.openClaims}`,
      `Pending claim value,${kpis.claimedPending.toFixed(2)}`,
      `Settled from dispositions CN,${kpis.claimedSettled.toFixed(2)}`,
      `Scheme credit notes (count),${kpis.scnCount}`,
      `Scheme CN expected,${kpis.scnExpected.toFixed(2)}`,
      `Scheme CN actual,${kpis.scnActual.toFixed(2)}`,
      '',
      'Event Date,Type,Product,Batch,Warehouse,Qty,Cost,Supplier,Invoice,CN No,CN Total,Compensation,Recipient',
    ];
    filtered.forEach((r) => {
      lines.push(
        [
          r.eventDate,
          TYPE_LABEL[r.dispositionType] || r.dispositionType,
          `"${(r.productName || '').replace(/"/g, '""')}"`,
          r.batchNumber || '',
          r.warehouseName || r.warehouseId,
          r.quantity,
          (r.costValue || 0).toFixed(2),
          `"${(r.supplierName || '').replace(/"/g, '""')}"`,
          r.supplierInvoiceNo || '',
          r.creditNoteNumber || '',
          (r.cnTotal || 0).toFixed(2),
          r.compensationStatus,
          `"${(r.distributedToName || '').replace(/"/g, '""')}"`,
        ].join(',')
      );
    });
    lines.push('');
    lines.push('Supplier scheme credit notes in period');
    lines.push('Supplier,CN No,CN Date,Expected,Actual,Status,ProductId,Period');
    kpis.scnInPeriod.forEach((n: SupplierCreditNote) => {
      lines.push(
        [
          `"${(n.supplierName || '').replace(/"/g, '""')}"`,
          n.creditNoteNumber || '',
          n.creditNoteDate || '',
          (n.expectedAmount || 0).toFixed(2),
          (n.actualAmount || 0).toFixed(2),
          n.status,
          n.productId ?? '',
          n.period || '',
        ].join(',')
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MrWater_Dispositions_${periodLabel.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'summary', label: 'Summary', icon: <FileWarning className="w-3.5 h-3.5" /> },
    { id: 'free', label: 'Free issues', icon: <Gift className="w-3.5 h-3.5" /> },
    { id: 'writeoffs', label: 'Write-offs', icon: <Trash2 className="w-3.5 h-3.5" /> },
    { id: 'claims', label: 'Supplier claims', icon: <HandCoins className="w-3.5 h-3.5" /> },
    { id: 'batches', label: 'Batch tracking', icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'creditnotes', label: 'Scheme credit notes', icon: <TrendingDown className="w-3.5 h-3.5" /> },
  ];

  const renderTable = (rows: InventoryDisposition[]) => (
    <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left data-table min-w-[640px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Date</th>
            <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</th>
            <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Product / Batch</th>
            <th className="px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Qty</th>
            <th className="px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Cost</th>
            <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Supplier / CN</th>
            <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center py-10 text-slate-500 text-sm">
                No records in this period
              </td>
            </tr>
          ) : (
            matchRows(rows).map((r) => (
              <tr key={r.id} className="hover:bg-sky-50/40">
                <td className="px-2.5 py-2.5 font-mono text-xs whitespace-nowrap">{r.eventDate}</td>
                <td className="px-2.5 py-2.5 text-xs font-semibold">{TYPE_LABEL[r.dispositionType]}</td>
                <td className="px-2.5 py-2.5">
                  <div className="font-bold text-xs text-slate-900">{r.productName || `#${r.productId}`}</div>
                  <div className="text-[10px] text-slate-500">
                    {r.warehouseName || r.warehouseId}
                    {r.batchNumber ? ` · Lot ${r.batchNumber}` : ''}
                    {r.expiryDate ? ` · Exp ${r.expiryDate}` : ''}
                    {r.distributedToName ? ` · To ${r.distributedToName}` : ''}
                  </div>
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono font-bold text-xs">{r.quantity}</td>
                <td className="px-2.5 py-2.5 text-right font-mono font-bold text-xs text-amber-900">
                  ₹{money(r.costValue)}
                </td>
                <td className="px-2.5 py-2.5 text-xs">
                  <div className="font-semibold text-slate-800">{r.supplierName || '—'}</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {r.supplierInvoiceNo ? `Inv ${r.supplierInvoiceNo}` : ''}
                    {r.creditNoteNumber ? ` · CN ${r.creditNoteNumber}` : ''}
                    {r.cnTotal ? ` · ₹${money(r.cnTotal)}` : ''}
                  </div>
                </td>
                <td className="px-2.5 py-2.5 text-xs font-bold capitalize text-slate-600">
                  {r.returnTracking ? STAGE_LABEL[trackedStage(r)] : r.compensationStatus.replace('_', ' ')}
                  {r.returnTracking && (
                    <div className="text-[10px] font-normal normal-case text-slate-500">
                      Customer return · {r.returnTracking.customerName}
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-400 text-white flex items-center justify-center shadow-md shadow-amber-600/20 shrink-0">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
              Dispositions, Claims & Batch Impact
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Period: <span className="font-bold text-slate-700">{periodLabel}</span>
              {' · '}Free issues, write-offs, supplier returns, batch trail, scheme CNs
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Free issue cost</div>
          <div className="text-xl font-black text-sky-950 mt-1 font-mono tabular-nums">₹{money(kpis.freeCost)}</div>
          <div className="text-[11px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-100">
            {kpis.freeQty} cases given free
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Write-off cost</div>
          <div className="text-xl font-black text-rose-800 mt-1 font-mono tabular-nums">₹{money(kpis.writeoffCost)}</div>
          <div className="text-[11px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-100">
            {kpis.writeoffQty} cases written off
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-amber-200 p-3.5 shadow-sm bg-gradient-to-br from-amber-50 to-white">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Open supplier claims</div>
          <div className="text-xl font-black text-amber-950 mt-1 font-mono tabular-nums">
            {kpis.openClaims}
          </div>
          <div className="text-[11px] text-amber-900/80 mt-1.5 pt-1.5 border-t border-amber-100">
            Pending value ₹{money(kpis.claimedPending)}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Scheme CNs (period)</div>
          <div className="text-xl font-black text-emerald-800 mt-1 font-mono tabular-nums">
            ₹{money(kpis.scnActual)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-100">
            Expected ₹{money(kpis.scnExpected)} · {kpis.scnOpen} open
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                subTab === t.id
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        {subTab !== 'summary' && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full sm:w-48 pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        )}
      </div>

      {subTab === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Cost breakdown</div>
            {[
              { label: 'Free near-expiry / scheme free', value: kpis.freeCost, tone: 'sky' },
              { label: 'Write-offs (expiry / damage)', value: kpis.writeoffCost, tone: 'rose' },
              { label: 'Returns (claim base at cost)', value: kpis.returnCost, tone: 'amber' },
              { label: 'Trading loss (free + write-off)', value: kpis.totalLossCost, tone: 'dark' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between text-xs gap-2">
                <span className="text-slate-600 font-medium">{row.label}</span>
                <span
                  className={`font-mono font-black tabular-nums ${
                    row.tone === 'rose'
                      ? 'text-rose-700'
                      : row.tone === 'sky'
                        ? 'text-sky-800'
                        : row.tone === 'amber'
                          ? 'text-amber-800'
                          : 'text-slate-900'
                  }`}
                >
                  ₹{money(row.value)}
                </span>
              </div>
            ))}
            <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 leading-relaxed">
              Free issues and write-offs reduce stock at cost and hit gross margin. Returns stay as open claims until
              supplier credit notes are recorded. Scheme CNs (Type B/C) are listed separately under “Scheme credit notes”.
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Supplier money trail
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600 font-medium">Disposition CN settled</span>
              <span className="font-mono font-bold text-emerald-700">₹{money(kpis.claimedSettled)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600 font-medium">Disposition claims still open</span>
              <span className="font-mono font-bold text-amber-800">₹{money(kpis.claimedPending)}</span>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-slate-100">
              <span className="text-slate-600 font-medium">Scheme CN actual received</span>
              <span className="font-mono font-bold text-emerald-700">₹{money(kpis.scnActual)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600 font-medium">Scheme CN expected − actual</span>
              <span className="font-mono font-bold text-slate-800">
                ₹{money(Math.max(0, kpis.scnExpected - kpis.scnActual))}
              </span>
            </div>
          </div>
        </div>
      )}

      {subTab === 'free' && renderTable(freeRows)}
      {subTab === 'writeoffs' && renderTable(writeoffRows)}
      {subTab === 'claims' && renderTable(claimRows)}

      {subTab === 'batches' && (
        <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left data-table min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Batch / Lot</th>
                <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Product</th>
                <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Warehouse</th>
                <th className="px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Disposed</th>
                <th className="px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Cost out</th>
                <th className="px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Still in stock</th>
                <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Supplier inv</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batchTracking.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500 text-sm">
                    No batch-linked dispositions in this period. Prefer selecting a lot when posting returns.
                  </td>
                </tr>
              ) : (
                batchTracking.map((r) => (
                  <tr key={r.batchId} className="hover:bg-sky-50/40">
                    <td className="px-2.5 py-2.5">
                      <div className="font-mono font-bold text-xs text-slate-900">{r.batchNumber}</div>
                      <div className="text-[10px] text-slate-500">
                        {r.expiryDate ? `Exp ${r.expiryDate}` : '—'} · {r.events} event(s)
                      </div>
                    </td>
                    <td className="px-2.5 py-2.5 text-xs font-bold text-slate-800">{r.productName}</td>
                    <td className="px-2.5 py-2.5 text-xs text-slate-600">{r.warehouseName}</td>
                    <td className="px-2.5 py-2.5 text-right font-mono font-bold text-xs">{r.disposedQty}</td>
                    <td className="px-2.5 py-2.5 text-right font-mono font-bold text-xs text-amber-900">
                      ₹{money(r.disposedCost)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono font-bold text-xs text-sky-800">
                      {r.remainingQty}
                    </td>
                    <td className="px-2.5 py-2.5 font-mono text-[10px] text-slate-500">
                      {r.supplierInvoiceNo || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'creditnotes' && (
        <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left data-table min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Supplier</th>
                <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">CN No / Date</th>
                <th className="px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Expected</th>
                <th className="px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Actual</th>
                <th className="px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Outstanding</th>
                <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Period / GRN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {kpis.scnInPeriod.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500 text-sm">
                    No scheme-linked supplier credit notes in this period
                  </td>
                </tr>
              ) : (
                kpis.scnInPeriod.map((n) => (
                  <tr key={n.id} className="hover:bg-sky-50/40">
                    <td className="px-2.5 py-2.5 text-xs font-bold text-slate-900">{n.supplierName}</td>
                    <td className="px-2.5 py-2.5 text-xs font-mono">
                      <div>{n.creditNoteNumber || '—'}</div>
                      <div className="text-[10px] text-slate-500">{n.creditNoteDate || n.createdAt?.slice(0, 10)}</div>
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono text-xs font-bold">
                      ₹{money(n.expectedAmount)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono text-xs font-bold text-emerald-700">
                      ₹{money(n.actualAmount)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono text-xs font-bold text-amber-800">
                      ₹{money(Math.max(0, n.expectedAmount - n.actualAmount))}
                    </td>
                    <td className="px-2.5 py-2.5 text-xs font-bold capitalize">{n.status.replace('_', ' ')}</td>
                    <td className="px-2.5 py-2.5 text-[10px] text-slate-500 font-mono">
                      {n.period || n.grnId || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
