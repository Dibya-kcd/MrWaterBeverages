import React, { useMemo, useState } from 'react';
import { ChevronRight, ClipboardList, Gift, HandCoins, Layers, PackageX, ReceiptText, Search, Sigma, X } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { InventoryDisposition, InventoryDispositionType, SupplierCreditNote } from '../../../types';
import { money } from '../../../utils/billing';
import { trackedStage } from '../ExpiryReturnsTracker';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import {
  ExplainBox,
  ReportBreakdownLine,
  ReportChipGroup,
  ReportEmpty,
  ReportExplainModal,
  ReportFilterPanel,
  ReportGroupCard,
  ReportList,
  ReportListMeta,
  ReportRow,
  ReportStat,
  ReportStatGrid,
  ReportTitleBar,
  reportCard,
  type StatTone,
} from './ReportKit';
import { PhoneDownloadBar } from './mobile/PhoneKit';
import { MobileReportTopBar } from './mobile/MobileReportContext';

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
  /** Phone only: which section is open as its own page (null = the list of section cards). */
  const [phoneOpen, setPhoneOpen] = useState<SubTab | null>(null);
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

  const [explainOpen, setExplainOpen] = useState(false);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  const TABS: { id: SubTab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'free', label: 'Free issues' },
    { id: 'writeoffs', label: 'Write-offs' },
    { id: 'claims', label: 'Supplier claims' },
    { id: 'batches', label: 'Batch tracking' },
    { id: 'creditnotes', label: 'Scheme credit notes' },
  ];

  const statusOf = (r: InventoryDisposition) =>
    r.returnTracking ? STAGE_LABEL[trackedStage(r)] : r.compensationStatus.replace('_', ' ');
  const money0 = (n: number) => `₹${money(n)}`;

  const shop = 'MrWater Distribution';
  const activeRows =
    subTab === 'free' ? matchRows(freeRows) : subTab === 'writeoffs' ? matchRows(writeoffRows) : subTab === 'claims' ? matchRows(claimRows) : [];

  /** Free / write-off / claim rows grouped by event day, newest first. */
  const dayGroups = useMemo(() => {
    const map = new Map<string, InventoryDisposition[]>();
    activeRows.forEach((r) => {
      const d = (r.eventDate || '').slice(0, 10) || 'Unknown date';
      map.set(d, [...(map.get(d) || []), r]);
    });
    return Array.from(map.entries())
      .map(([date, rows]) => ({ date, rows, cost: rows.reduce((t, r) => t + (r.costValue || 0), 0), qty: rows.reduce((t, r) => t + (r.quantity || 0), 0) }))
      .sort((a, b) => b.date.localeCompare(a.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, search, filtered]);

  const q = search.trim();
  const forceOpen = q.length > 0;
  const isOpen = (d: string) => forceOpen || openDays.has(d);
  const toggleDay = (d: string) =>
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  const allOpen = dayGroups.length > 0 && dayGroups.every((g) => openDays.has(g.date));
  const toggleAll = () => setOpenDays(allOpen ? new Set() : new Set(dayGroups.map((g) => g.date)));

  const fmtDayLong = (d: string) => {
    const dt = new Date(`${d}T12:00:00`);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };

  // ---- downloads (what is on screen: every record in the period + batches + scheme CNs) ----------
  const recordHeader = ['Date', 'Type', 'Product', 'Batch', 'Warehouse', 'Qty', 'Cost', 'Supplier', 'Invoice', 'CN no', 'CN total', 'Status', 'Recipient'];
  const recordRow = (r: InventoryDisposition): (string | number)[] => [
    r.eventDate,
    TYPE_LABEL[r.dispositionType] || r.dispositionType,
    r.productName || `#${r.productId}`,
    r.batchNumber || '',
    r.warehouseName || r.warehouseId,
    r.quantity,
    Number((r.costValue || 0).toFixed(2)),
    r.supplierName || '',
    r.supplierInvoiceNo || '',
    r.creditNoteNumber || '',
    Number((r.cnTotal || 0).toFixed(2)),
    statusOf(r),
    r.distributedToName || '',
  ];
  const cnRows = (): (string | number)[][] =>
    kpis.scnInPeriod.map((n: SupplierCreditNote) => [
      n.supplierName || '',
      n.creditNoteNumber || '',
      n.creditNoteDate || '',
      n.expectedAmount || 0,
      n.actualAmount || 0,
      Math.max(0, (n.expectedAmount || 0) - (n.actualAmount || 0)),
      n.status.replace('_', ' '),
      n.period || '',
    ]);
  const batchRows = (): (string | number)[][] =>
    batchTracking.map((b) => [b.batchNumber, b.productName, b.warehouseName, b.expiryDate, b.disposedQty, Number(b.disposedCost.toFixed(2)), b.remainingQty, b.supplierInvoiceNo]);

  const exportExcel = () =>
    downloadXlsx(`returns-free-claims-${fileStamp()}.xlsx`, [
      {
        name: 'Summary',
        header: ['Item', 'Value'],
        rows: [
          ['Free issue cost', kpis.freeCost],
          ['Free issue cases', kpis.freeQty],
          ['Write-off cost', kpis.writeoffCost],
          ['Write-off cases', kpis.writeoffQty],
          ['Return cost (claims base)', kpis.returnCost],
          ['Open claims', kpis.openClaims],
          ['Pending claim value', kpis.claimedPending],
          ['Settled from disposition CNs', kpis.claimedSettled],
          ['Scheme CN expected', kpis.scnExpected],
          ['Scheme CN received', kpis.scnActual],
        ],
      },
      { name: 'Records', header: recordHeader, rows: filtered.map(recordRow) },
      { name: 'Batches', header: ['Batch', 'Product', 'Warehouse', 'Expiry', 'Disposed', 'Cost out', 'Still in stock', 'Supplier inv'], rows: batchRows() },
      { name: 'Scheme CNs', header: ['Supplier', 'CN no', 'CN date', 'Expected', 'Received', 'Outstanding', 'Status', 'Period'], rows: cnRows() },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `returns-free-claims-${fileStamp()}.pdf`,
      title: 'Returns, free issues & claims',
      subtitle: [shop, `Period: ${periodLabel}`],
      landscape: true,
      sections: [
        {
          title: 'Summary',
          header: ['Item', 'Amount (Rs.)'],
          rows: [
            ['Free issue cost', money(kpis.freeCost)],
            ['Write-off cost', money(kpis.writeoffCost)],
            ['Trading loss (free + write-off)', money(kpis.totalLossCost)],
            ['Returns - claim base at cost', money(kpis.returnCost)],
            ['Pending supplier claims', money(kpis.claimedPending)],
            ['Settled from disposition CNs', money(kpis.claimedSettled)],
            ['Scheme CN expected', money(kpis.scnExpected)],
            ['Scheme CN received', money(kpis.scnActual)],
          ],
          rightAlign: [1],
        },
        {
          title: 'Records',
          header: ['Date', 'Type', 'Product', 'Batch', 'Qty', 'Cost (Rs.)', 'Supplier', 'Status'],
          rows: filtered.map((r) => [
            r.eventDate,
            TYPE_LABEL[r.dispositionType] || r.dispositionType,
            r.productName || `#${r.productId}`,
            r.batchNumber || '-',
            r.quantity,
            money(r.costValue),
            r.supplierName || '-',
            statusOf(r),
          ]),
          rightAlign: [4, 5],
        },
        {
          title: 'Scheme credit notes',
          header: ['Supplier', 'CN no', 'Date', 'Expected (Rs.)', 'Received (Rs.)', 'Outstanding (Rs.)', 'Status'],
          rows: kpis.scnInPeriod.map((n: SupplierCreditNote) => [
            n.supplierName || '',
            n.creditNoteNumber || '-',
            n.creditNoteDate || '-',
            money(n.expectedAmount),
            money(n.actualAmount),
            money(Math.max(0, n.expectedAmount - n.actualAmount)),
            n.status.replace('_', ' '),
          ]),
          rightAlign: [3, 4, 5],
        },
      ],
    });

  const hasAny = filtered.length > 0 || kpis.scnCount > 0;
  const isFiltered = q.length > 0;
  const tabOptions = TABS;
  const countFor = (id: SubTab) =>
    id === 'free' ? freeRows.length : id === 'writeoffs' ? writeoffRows.length : id === 'claims' ? claimRows.length : id === 'batches' ? batchTracking.length : id === 'creditnotes' ? kpis.scnCount : undefined;
  const tabOptionsWithCount = tabOptions.map((t) => ({ ...t, count: countFor(t.id) }));

  const emptyTextFor = (tab: SubTab) =>
    isFiltered
      ? 'Nothing matches this search'
      : tab === 'batches'
        ? 'No batch-linked dispositions in this period. Pick a lot when you post returns so it shows here.'
        : tab === 'creditnotes'
          ? 'No scheme-linked supplier credit notes in this period'
          : 'No records in this period';

  const rowSub = (r: InventoryDisposition) =>
    `${r.warehouseName || r.warehouseId}${r.batchNumber ? ` · Lot ${r.batchNumber}` : ''}${r.expiryDate ? ` · Exp ${r.expiryDate}` : ''}${r.distributedToName ? ` · To ${r.distributedToName}` : ''}`;
  const rowSupplier = (r: InventoryDisposition) =>
    [r.supplierName, r.supplierInvoiceNo ? `Inv ${r.supplierInvoiceNo}` : '', r.creditNoteNumber ? `CN ${r.creditNoteNumber}` : '', r.cnTotal ? `₹${money(r.cnTotal)}` : '']
      .filter(Boolean)
      .join(' · ');
  const statusTone = (r: InventoryDisposition): StatTone | 'muted' =>
    r.compensationStatus === 'settled' ? 'green' : r.compensationStatus === 'pending' || r.compensationStatus === 'partial' ? 'amber' : 'muted';

  const DispositionRow: React.FC<{ r: InventoryDisposition }> = ({ r }) => (
    <ReportRow
      title={
        <>
          {r.productName || `#${r.productId}`} <span className="text-xs font-semibold text-slate-400">× {r.quantity}</span>
        </>
      }
      sub={
        <>
          <span className="font-semibold text-slate-600">{TYPE_LABEL[r.dispositionType]}</span> · {rowSub(r)}
          {rowSupplier(r) && <span className="block">{rowSupplier(r)}</span>}
          {r.returnTracking && <span className="block">Customer return · {r.returnTracking.customerName}</span>}
        </>
      }
      amount={money0(r.costValue)}
      amountTone="amber"
      status={<span className="capitalize">{statusOf(r)}</span>}
      statusTone={statusTone(r)}
    />
  );

  const batchRowsUi = batchTracking;
  const cnList = kpis.scnInPeriod as SupplierCreditNote[];
  const showSearch = subTab !== 'summary' && subTab !== 'creditnotes';
  const showBody = (tab: SubTab) => subTab === tab;

  const summaryCards = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <section className={`${reportCard} overflow-hidden`}>
        <div className="px-3.5 py-2.5 bg-[#faf8f5] text-[13px] font-bold text-slate-900">Cost breakdown</div>
        <ReportList>
          <ReportRow title="Free near-expiry / scheme free" amount={money0(kpis.freeCost)} amountTone="sky" />
          <ReportRow title="Write-offs (expiry / damage)" amount={money0(kpis.writeoffCost)} amountTone="red" />
          <ReportRow title="Returns (claim base at cost)" amount={money0(kpis.returnCost)} amountTone="amber" />
          <ReportRow title="Trading loss (free + write-off)" sub="Hits gross margin" amount={money0(kpis.totalLossCost)} />
        </ReportList>
      </section>
      <section className={`${reportCard} overflow-hidden`}>
        <div className="px-3.5 py-2.5 bg-[#faf8f5] text-[13px] font-bold text-slate-900">Supplier money trail</div>
        <ReportList>
          <ReportRow title="Disposition CN settled" amount={money0(kpis.claimedSettled)} amountTone="green" />
          <ReportRow title="Disposition claims still open" amount={money0(kpis.claimedPending)} amountTone="amber" />
          <ReportRow title="Scheme CN actual received" amount={money0(kpis.scnActual)} amountTone="green" />
          <ReportRow title="Scheme CN expected − actual" amount={money0(Math.max(0, kpis.scnExpected - kpis.scnActual))} />
        </ReportList>
      </section>
    </div>
  );

  const compactRs = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`;
    if (abs >= 1000) return `₹${(abs / 1000).toFixed(1)}k`;
    return `₹${Math.round(abs)}`;
  };

  const phoneSections: {
    id: SubTab;
    title: string;
    sub: string;
    metric: string;
    icon: React.ReactNode;
    iconBg: string;
  }[] = [
    {
      id: 'summary',
      title: 'Summary of losses and claims',
      sub: 'Total loss and amount claimable',
      metric: compactRs(kpis.totalLossCost),
      icon: <Sigma size={16} />,
      iconBg: 'bg-[#f1f5f9] text-[var(--text-2)]',
    },
    {
      id: 'free',
      title: 'Free issues',
      sub: 'Near-expiry and scheme',
      metric: String(kpis.freeQty),
      icon: <Gift size={16} />,
      iconBg: 'bg-[var(--soon-bg)] text-[var(--soon)]',
    },
    {
      id: 'writeoffs',
      title: 'Write-offs',
      sub: 'Expired and damaged',
      metric: compactRs(kpis.writeoffCost),
      icon: <PackageX size={16} />,
      iconBg: 'bg-[#f1f5f9] text-[var(--text-2)]',
    },
    {
      id: 'claims',
      title: 'Supplier claims',
      sub: 'Raised and recovered',
      metric: compactRs(kpis.claimedPending > 0 ? kpis.claimedPending : kpis.returnCost),
      icon: <HandCoins size={16} />,
      iconBg: 'bg-[#eaf3fd] text-[var(--primary)]',
    },
    {
      id: 'batches',
      title: 'Batch tracking',
      sub: 'Batches near expiry',
      metric: String(batchTracking.length),
      icon: <ClipboardList size={16} />,
      iconBg: 'bg-[#f1f5f9] text-[var(--text-2)]',
    },
    {
      id: 'creditnotes',
      title: 'Scheme credit notes',
      sub: 'Credit from supplier schemes',
      metric: compactRs(kpis.scnActual > 0 ? kpis.scnActual : kpis.scnExpected),
      icon: <ReceiptText size={16} />,
      iconBg: 'bg-[#f1f5f9] text-[var(--text-2)]',
    },
  ];

  const shareProps = {
    reportTitle: 'Returns, free & claims',
    summaryLines: [
      { label: 'Trading loss (free + write-off)', value: money0(kpis.totalLossCost) },
      { label: 'Free issues', value: `${kpis.freeQty} cases (${money0(kpis.freeCost)})` },
      { label: 'Pending supplier claims', value: money0(kpis.claimedPending) },
      { label: 'Scheme credit notes', value: money0(kpis.scnActual) },
    ],
    sheets: [
      {
        name: 'Summary',
        header: ['Item', 'Amount'],
        rows: [
          ['Free issue cost', kpis.freeCost],
          ['Write-off cost', kpis.writeoffCost],
          ['Pending claims', kpis.claimedPending],
          ['Scheme CN received', kpis.scnActual],
        ],
      },
    ],
    pdfSections: [
      {
        title: 'Summary',
        header: ['Item', 'Amount (Rs.)'],
        rows: [
          ['Free issue cost', money(kpis.freeCost)],
          ['Write-off cost', money(kpis.writeoffCost)],
          ['Pending claims', money(kpis.claimedPending)],
        ],
        rightAlign: [1],
      },
    ],
  };

  const activePhoneSection = phoneSections.find((s) => s.id === phoneOpen);

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-dispositions-phone">
        {phoneOpen === null ? (
          <>
            <MobileReportTopBar
              title="Returns, free & claims"
              sub="Breakage and supplier credit"
              showPeriod
              shareProps={shareProps}
            />

            <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
              {phoneSections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSubTab(s.id);
                    setSearch('');
                    setPhoneOpen(s.id);
                  }}
                  className="w-full px-3.5 py-3 flex items-center gap-3 text-left active:bg-[#f8fafc] transition-colors cursor-pointer"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${s.iconBg}`}>
                    {s.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug">{s.title}</div>
                    <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 leading-snug">{s.sub}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[13px] font-extrabold text-[var(--text)] tabular-nums">{s.metric}</span>
                    <ChevronRight size={15} className="text-[var(--text-2)]" aria-hidden="true" />
                  </div>
                </button>
              ))}
            </section>
          </>
        ) : (
          <>
            <MobileReportTopBar
              title={activePhoneSection?.title || 'Details'}
              sub="Returns, free & claims"
              doubleBack
              onBack={() => setPhoneOpen(null)}
              showPeriod
              shareProps={shareProps}
            />

            {showSearch && (
              <div className="rt-search-bar">
                <Search size={15} className="text-[var(--text-2)] shrink-0" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product, lot or supplier…"
                />
                {search.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="text-[var(--text-2)] p-1 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {subTab === 'summary' && (
              <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
                {[
                  ['Free near-expiry / scheme free', kpis.freeCost, 'text-[var(--text)]'],
                  ['Write-offs (expiry / damage)', kpis.writeoffCost, 'text-[var(--due)]'],
                  ['Returns (claim base at cost)', kpis.returnCost, 'text-[var(--text)]'],
                  ['Disposition CN settled', kpis.claimedSettled, 'text-[var(--paid)]'],
                  ['Claims still open', kpis.claimedPending, 'text-[var(--soon)]'],
                  ['Scheme CN expected', kpis.scnExpected, 'text-[var(--text)]'],
                  ['Scheme CN received', kpis.scnActual, 'text-[var(--paid)]'],
                ].map(([label, value, tone]) => (
                  <div key={label as string} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-medium text-[var(--text-2)]">{label as string}</span>
                    <span className={`font-extrabold tabular-nums ${tone}`}>{money0(value as number)}</span>
                  </div>
                ))}
              </section>
            )}

            {(subTab === 'free' || subTab === 'writeoffs' || subTab === 'claims') &&
              (activeRows.length === 0 ? (
                <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
                  {emptyTextFor(subTab)}
                </div>
              ) : (
                <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
                  {activeRows.map((r) => {
                    const stTone =
                      r.compensationStatus === 'settled'
                        ? 'bg-[var(--paid-bg)] text-[var(--paid)]'
                        : r.compensationStatus === 'pending' || r.compensationStatus === 'partial'
                          ? 'bg-[var(--soon-bg)] text-[var(--soon)]'
                          : 'bg-[#f1f5f9] text-[var(--text-2)]';
                    return (
                      <div key={r.id} className="px-3.5 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug">
                            {r.productName || `#${r.productId}`} · ×{r.quantity}
                          </div>
                          <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 break-words">
                            {r.eventDate} · {TYPE_LABEL[r.dispositionType]} · {rowSub(r)}
                          </div>
                          {(rowSupplier(r) || r.returnTracking) && (
                            <div className="text-[11px] text-[var(--text-2)] mt-0.5 break-words">
                              {rowSupplier(r)}
                              {r.returnTracking ? ` · Customer: ${r.returnTracking.customerName}` : ''}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums">{money0(r.costValue)}</div>
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${stTone}`}>
                            {statusOf(r)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </section>
              ))}

            {subTab === 'batches' &&
              (batchRowsUi.length === 0 ? (
                <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
                  {emptyTextFor('batches')}
                </div>
              ) : (
                <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
                  {batchRowsUi.map((r) => (
                    <div key={r.batchId} className="px-3.5 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug">
                          {r.productName} · Lot {r.batchNumber}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-2)] mt-0.5">
                          {r.warehouseName} · {r.expiryDate ? `Exp ${r.expiryDate}` : 'No expiry'} · Disposed {r.disposedQty} · In stock {r.remainingQty}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums">{money0(r.disposedCost)}</div>
                        <div className="text-[11px] text-[var(--text-2)]">{r.events} event(s)</div>
                      </div>
                    </div>
                  ))}
                </section>
              ))}

            {subTab === 'creditnotes' &&
              (cnList.length === 0 ? (
                <div className="rt-rep-card py-10 px-4 text-center text-[13px] font-semibold text-[var(--text-2)]">
                  {emptyTextFor('creditnotes')}
                </div>
              ) : (
                <section className="rt-rep-card divide-y divide-[var(--divider)] overflow-hidden">
                  {cnList.map((n) => {
                    const outstanding = Math.max(0, n.expectedAmount - n.actualAmount);
                    return (
                      <div key={n.id} className="px-3.5 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-bold text-[var(--text)] leading-snug">
                            {n.supplierName}
                          </div>
                          <div className="text-[11.5px] text-[var(--text-2)] mt-0.5">
                            {n.creditNoteNumber || 'No CN no'} · {n.creditNoteDate || n.createdAt?.slice(0, 10)} · Received {money0(n.actualAmount)}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[13.5px] font-extrabold text-[var(--text)] tabular-nums">{money0(n.expectedAmount)}</div>
                          <span
                            className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                              outstanding > 0 ? 'bg-[var(--soon-bg)] text-[var(--soon)]' : 'bg-[var(--paid-bg)] text-[var(--paid)]'
                            }`}
                          >
                            {outstanding > 0 ? `Due ${compactRs(outstanding)}` : 'Settled'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </section>
              ))}
          </>
        )}

        <PhoneDownloadBar onExcel={exportExcel} onPdf={exportPdf} disabled={!hasAny} />
      </div>

      {/* ======================= TABLET / DESKTOP ======================= */}
      <div className="hidden md:block space-y-3" id="report-dispositions">
        <ReportTitleBar
          title="Returns, free & claims"
          sub={`${periodLabel} · free issues, write-offs, supplier returns, batch trail and scheme credit notes`}
          actions={<ReportDownloadButtons onExcel={exportExcel} onPdf={exportPdf} disabled={!hasAny} reportTitle="Returns, free and claims" />}
        />

        <ReportStatGrid>
          <ReportStat label="Free issue cost" value={money0(kpis.freeCost)} tone="sky" sub={`${kpis.freeQty} cases given free`} />
          <ReportStat label="Write-off cost" value={money0(kpis.writeoffCost)} tone="red" sub={`${kpis.writeoffQty} cases written off`} />
          <ReportStat label="Open supplier claims" value={kpis.openClaims} tone="amber" sub={`Pending value ${money0(kpis.claimedPending)}`} />
          <ReportStat label="Scheme CNs received" value={money0(kpis.scnActual)} tone="green" sub={`Expected ${money0(kpis.scnExpected)} · ${kpis.scnOpen} open`} />
        </ReportStatGrid>
        <ReportBreakdownLine onExplain={() => setExplainOpen(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Gift size={13} aria-hidden="true" /> Trading loss {money0(kpis.totalLossCost)} (free + write-off) · Returns at cost {money0(kpis.returnCost)}
          </span>
        </ReportBreakdownLine>

        <ReportFilterPanel
          search={showSearch ? { value: search, onChange: setSearch, placeholder: 'Search product, lot, supplier or CN no' } : undefined}
          isFiltered={isFiltered}
          onReset={() => setSearch('')}
        >
          <ReportChipGroup<SubTab> label="View" options={tabOptionsWithCount} value={subTab} onChange={setSubTab} />
        </ReportFilterPanel>

        {subTab === 'summary' && summaryCards}

        {(subTab === 'free' || subTab === 'writeoffs' || subTab === 'claims') && (
          <>
            {dayGroups.length > 1 && !forceOpen && (
              <ReportListMeta allOpen={allOpen} onToggleAll={toggleAll}>
                {dayGroups.length} days · {activeRows.length} record{activeRows.length === 1 ? '' : 's'}
                {isFiltered ? ' match' : ''}
              </ReportListMeta>
            )}
            {dayGroups.length === 0 && <ReportEmpty>{emptyTextFor(subTab)}</ReportEmpty>}
            {dayGroups.map((g) => (
              <ReportGroupCard
                key={g.date}
                title={fmtDayLong(g.date)}
                sub={`${g.rows.length} record${g.rows.length === 1 ? '' : 's'} · ${g.qty} cases`}
                headLabel="Cost"
                head={money0(g.cost)}
                headTone="amber"
                open={isOpen(g.date)}
                locked={forceOpen}
                onToggle={() => toggleDay(g.date)}
              >
                <ReportList>
                  {g.rows.map((r) => (
                    <DispositionRow key={r.id} r={r} />
                  ))}
                </ReportList>
              </ReportGroupCard>
            ))}
          </>
        )}

        {showBody('batches') && (
          <>
            {batchRowsUi.length > 0 && (
              <ReportListMeta>
                {batchRowsUi.length} batch{batchRowsUi.length === 1 ? '' : 'es'}
                {isFiltered ? ' match' : ''}
              </ReportListMeta>
            )}
            {batchRowsUi.length === 0 ? (
              <ReportEmpty>{emptyTextFor('batches')}</ReportEmpty>
            ) : (
              <section className={`${reportCard} overflow-hidden`}>
                <ReportList>
                  {batchRowsUi.map((r) => (
                    <ReportRow
                      key={r.batchId}
                      title={
                        <>
                          {r.productName} <span className="font-mono text-sky-700">· Lot {r.batchNumber}</span>
                        </>
                      }
                      sub={`${r.warehouseName} · ${r.expiryDate ? `Exp ${r.expiryDate}` : 'No expiry'} · ${r.events} event${r.events === 1 ? '' : 's'}${r.supplierInvoiceNo ? ` · Inv ${r.supplierInvoiceNo}` : ''}`}
                      amount={money0(r.disposedCost)}
                      amountTone="amber"
                      status={`Disposed ${r.disposedQty} · ${r.remainingQty} still in stock`}
                      statusTone="muted"
                    />
                  ))}
                </ReportList>
              </section>
            )}
          </>
        )}

        {showBody('creditnotes') && (
          <>
            {cnList.length > 0 && (
              <ReportListMeta>
                {cnList.length} credit note{cnList.length === 1 ? '' : 's'}
              </ReportListMeta>
            )}
            {cnList.length === 0 ? (
              <ReportEmpty>{emptyTextFor('creditnotes')}</ReportEmpty>
            ) : (
              <section className={`${reportCard} overflow-hidden`}>
                <ReportList>
                  {cnList.map((n) => {
                    const outstanding = Math.max(0, n.expectedAmount - n.actualAmount);
                    return (
                      <ReportRow
                        key={n.id}
                        title={
                          <>
                            {n.supplierName} <span className="font-mono text-sky-700">· {n.creditNoteNumber || 'No CN no'}</span>
                          </>
                        }
                        sub={`${n.creditNoteDate || n.createdAt?.slice(0, 10) || '—'} · ${n.period || n.grnId || '—'} · Expected ${money0(n.expectedAmount)} · Received ${money0(n.actualAmount)}`}
                        amount={money0(outstanding)}
                        amountTone={outstanding > 0 ? 'amber' : 'green'}
                        status={<span className="capitalize">{outstanding > 0 ? `Outstanding · ${n.status.replace('_', ' ')}` : n.status.replace('_', ' ')}</span>}
                        statusTone={outstanding > 0 ? 'amber' : 'green'}
                      />
                    );
                  })}
                </ReportList>
              </section>
            )}
          </>
        )}
      </div>

      {explainOpen && (
        <ReportExplainModal ariaLabel="How returns, free issues and claims are calculated" onClose={() => setExplainOpen(false)}>
          <ExplainBox tone="slate" title={`Free issues: ${money0(kpis.freeCost)}`}>
            <p>Near-expiry stock given away and scheme free issues, valued at cost. They reduce stock and gross margin.</p>
          </ExplainBox>
          <ExplainBox tone="rose" title={`Write-offs: ${money0(kpis.writeoffCost)}`}>
            <p>Expired or damaged stock thrown out, valued at cost.</p>
          </ExplainBox>
          <ExplainBox tone="amber" title={`Supplier claims: ${money0(kpis.claimedPending)} open`}>
            <p>Returns stay as open claims until the supplier credit note is recorded. Settled amounts come from those credit notes.</p>
          </ExplainBox>
          <ExplainBox tone="emerald" title={`Scheme credit notes: ${money0(kpis.scnActual)} received`}>
            <p>Scheme-linked credit notes are listed on their own. Return credit notes are not counted twice.</p>
          </ExplainBox>
        </ReportExplainModal>
      )}
    </>
  );
};
