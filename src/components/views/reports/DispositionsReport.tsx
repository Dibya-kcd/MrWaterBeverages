import React, { useMemo, useState } from 'react';
import { Gift } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { InventoryDisposition, InventoryDispositionType, SupplierCreditNote } from '../../../types';
import { money } from '../../../utils/billing';
import { trackedStage } from '../ExpiryReturnsTracker';
import { RegisterCard, Pill } from './mobile/ReportCards';
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
import {
  Chips,
  EmptyNote,
  HeroCard,
  LegendDot,
  MiniStat,
  PhoneDownloadBar,
  PhoneHeader,
  PhoneSearch,
  RowCard,
  SplitBar,
} from './mobile/PhoneKit';

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
  const phoneTabs = tabOptions.map((t) => {
    const c = countFor(t.id);
    return { id: t.id, label: c !== undefined && c > 0 ? `${t.label} ${c}` : t.label };
  });

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

  const phoneRegisterCard = (r: InventoryDisposition) => (
    <RegisterCard
      key={r.id}
      title={r.productName || `#${r.productId}`}
      pills={<Pill tone="amber">{TYPE_LABEL[r.dispositionType]}</Pill>}
      subtitle={
        <>
          <div className="font-mono">{r.eventDate}</div>
          <div className="text-slate-500">{rowSub(r)}</div>
        </>
      }
      heroLabel="Cost"
      hero={money0(r.costValue)}
      heroTone="amber"
      stats={[
        { label: 'Qty', value: r.quantity },
        { label: 'Status', value: <span className="capitalize text-[13px]">{statusOf(r)}</span>, tone: 'muted' },
      ]}
      note={
        rowSupplier(r) || r.returnTracking ? (
          <div className="text-[11px] text-slate-600 space-y-0.5">
            {rowSupplier(r) && <div className="text-slate-700">{rowSupplier(r)}</div>}
            {r.returnTracking && <div>Customer return · {r.returnTracking.customerName}</div>}
          </div>
        ) : null
      }
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

  return (
    <>
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3" id="report-dispositions-phone">
        <PhoneHeader title="Returns, free & claims" sub="Returns, samples & write-offs summary" />

        <HeroCard tone="navy" label="Trading loss (free + write-off)" value={money0(kpis.totalLossCost)}>
          <SplitBar
            label="Free issues versus write-offs"
            parts={[
              { value: kpis.freeCost, className: 'bg-sky-400' },
              { value: kpis.writeoffCost, className: 'bg-rose-400' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/90">
            <LegendDot dot="bg-sky-400">Free {money0(kpis.freeCost)}</LegendDot>
            <LegendDot dot="bg-rose-400">Write-off {money0(kpis.writeoffCost)}</LegendDot>
          </div>
        </HeroCard>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Open claims" value={kpis.openClaims} tone={kpis.openClaims > 0 ? 'amber' : 'green'} />
          <MiniStat label="Claim value" value={money0(kpis.claimedPending)} tone={kpis.claimedPending > 0 ? 'amber' : 'green'} />
          <MiniStat label="Scheme CNs" value={money0(kpis.scnActual)} tone="green" />
        </div>

        <Chips<SubTab> label="Returns, free and claims views" options={phoneTabs} value={subTab} onChange={setSubTab} />
        {showSearch && <PhoneSearch value={search} onChange={setSearch} placeholder="Search product, lot or supplier…" />}

        {subTab === 'summary' && (
          <RowCard>
            <div className="p-3 space-y-2 text-[13px]">
              {[
                ['Free near-expiry / scheme free', kpis.freeCost, 'text-sky-800'],
                ['Write-offs (expiry / damage)', kpis.writeoffCost, 'text-rose-700'],
                ['Returns (claim base at cost)', kpis.returnCost, 'text-amber-700'],
                ['Disposition CN settled', kpis.claimedSettled, 'text-emerald-700'],
                ['Claims still open', kpis.claimedPending, 'text-amber-700'],
                ['Scheme CN expected', kpis.scnExpected, 'text-slate-900'],
                ['Scheme CN received', kpis.scnActual, 'text-emerald-700'],
              ].map(([label, value, tone]) => (
                <div key={label as string} className="flex justify-between gap-3">
                  <span className="text-slate-600">{label as string}</span>
                  <span className={`font-extrabold tabular-nums ${tone}`}>{money0(value as number)}</span>
                </div>
              ))}
            </div>
          </RowCard>
        )}

        {(subTab === 'free' || subTab === 'writeoffs' || subTab === 'claims') &&
          (activeRows.length === 0 ? <EmptyNote>{emptyTextFor(subTab)}</EmptyNote> : activeRows.map(phoneRegisterCard))}

        {subTab === 'batches' &&
          (batchRowsUi.length === 0 ? (
            <EmptyNote>{emptyTextFor('batches')}</EmptyNote>
          ) : (
            batchRowsUi.map((r) => (
              <RegisterCard
                key={r.batchId}
                title={r.productName}
                subtitle={
                  <>
                    <div className="font-mono font-bold text-slate-900">Lot {r.batchNumber}</div>
                    <div className="text-slate-500">
                      {r.warehouseName} · {r.expiryDate ? `Exp ${r.expiryDate}` : 'No expiry'} · {r.events} event(s)
                    </div>
                  </>
                }
                heroLabel="Cost out"
                hero={money0(r.disposedCost)}
                heroTone="amber"
                stats={[
                  { label: 'Disposed', value: r.disposedQty },
                  { label: 'Still in stock', value: r.remainingQty, tone: 'sky' },
                  { label: 'Supplier inv', value: r.supplierInvoiceNo || '—', tone: 'muted' },
                ]}
              />
            ))
          ))}

        {subTab === 'creditnotes' &&
          (cnList.length === 0 ? (
            <EmptyNote>{emptyTextFor('creditnotes')}</EmptyNote>
          ) : (
            cnList.map((n) => {
              const outstanding = Math.max(0, n.expectedAmount - n.actualAmount);
              return (
                <RegisterCard
                  key={n.id}
                  title={n.supplierName}
                  pills={<Pill tone={outstanding > 0 ? 'amber' : 'green'}>{n.status.replace('_', ' ')}</Pill>}
                  subtitle={
                    <>
                      <div className="font-mono font-bold text-slate-900">{n.creditNoteNumber || '—'}</div>
                      <div className="text-slate-500">
                        {n.creditNoteDate || n.createdAt?.slice(0, 10)} · {n.period || n.grnId || '—'}
                      </div>
                    </>
                  }
                  heroLabel="Expected"
                  hero={money0(n.expectedAmount)}
                  split={{ a: n.actualAmount, b: outstanding, label: 'Received versus outstanding' }}
                  stats={[
                    { label: 'Received', value: money0(n.actualAmount), tone: 'green' },
                    { label: 'Outstanding', value: money0(outstanding), tone: outstanding > 0 ? 'amber' : 'muted' },
                  ]}
                />
              );
            })
          ))}

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
