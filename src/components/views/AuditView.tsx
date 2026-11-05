import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  ClipboardCheck,
  Filter,
  History,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Audit } from '../../types';
import { IconButton } from '../common/IconButton';
import { SmartReconciliationView } from './SmartReconciliationView';
import { InfoTip } from "../common/InfoTip";
import { todayISO, toLocalISODate } from "../../utils/dateLocal";
import { SizeChip } from '../common/SizeChip';
import { sizeStripe } from '../../utils/sizeColor';

export interface AuditViewProps {
  embedded?: boolean;
}

export const AuditView: React.FC<AuditViewProps> = ({ embedded = false }) => {
  const { products, stockAsOf, audits, saveAudit, deleteAudit, palette, fz, scale } = useLedger();

  // New Audit Form State
  const todayStr = todayISO();
  const yesterdayStr = toLocalISODate(new Date(Date.now() - 86400000));

  const [auditDate, setAuditDate] = useState<string>(todayStr);
  const [mode, setMode] = useState<'quick' | 'smart'>('smart');
  // System quantity shown and used for the variance is the stock of the audit date (today's balance for today).
  const bookAt = (productId: number) => stockAsOf(productId, auditDate);
  const [referenceNote, setReferenceNote] = useState<string>('');
  const [physicalCounts, setPhysicalCounts] = useState<Record<number, string>>({});
  const [autoAdjust, setAutoAdjust] = useState<boolean>(true);
  const [auditSavedMessage, setAuditSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(true);

  // Date Filter & Search State for History
  const [dateFilterMode, setDateFilterMode] = useState<'all' | 'today' | 'yesterday' | 'week' | 'custom'>('all');
  const [customFilterDate, setCustomFilterDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Accordion state for Day groups in Audit History
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  // Audit Deletion Confirmation Modal State
  const [auditToDelete, setAuditToDelete] = useState<Audit | null>(null);

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
    ...fz(12.5, { fontWeight: 700, color: palette.ink, marginBottom: '0.25em' }),
    display: 'block',
  };

  // Format date helper with friendly tags
  const formatDayHeader = (dateStr: string) => {
    if (!dateStr || dateStr === 'Undated') return { label: 'Undated Audits', tag: '' };
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const isToday = dateStr === todayStr;
      const isYesterday = dateStr === yesterdayStr;

      let tag = '';
      if (isToday) tag = 'Today';
      else if (isYesterday) tag = 'Yesterday';

      const formatted = dt.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return { label: formatted, tag };
    } catch {
      return { label: dateStr, tag: '' };
    }
  };

  const handleSaveAudit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!auditDate) {
      setErrorMessage('Please mention and select the Audit Date.');
      return;
    }

    const hasAnyCount = Object.values(physicalCounts).some((v) => v !== '' && v !== undefined);
    if (!hasAnyCount) {
      setErrorMessage('Please enter physical counted crates for at least one beverage product.');
      return;
    }

    saveAudit(physicalCounts, autoAdjust, auditDate, referenceNote);
    setPhysicalCounts({});
    setReferenceNote('');
    setAuditSavedMessage(
      `Physical stock audit for date ${auditDate} saved successfully! ${
        autoAdjust ? 'Live stock now matches the counted quantities.' : 'Observation recorded without altering stock.'
      }`
    );
    setTimeout(() => setAuditSavedMessage(null), 6000);
  };

  const fillAllWithBookStock = () => {
    const filled: Record<number, string> = {};
    products.forEach((p) => {
      filled[p.id] = String(bookAt(p.id));
    });
    setPhysicalCounts(filled);
  };

  const clearAllCounts = () => {
    setPhysicalCounts({});
  };

  // Group historical audits by date descending (latest date on top)
  const auditsGroupedByDate = useMemo(() => {
    // Filter audits based on user filter controls
    const filtered = audits.filter((a) => {
      // Date filter mode
      if (dateFilterMode === 'today' && a.date !== todayStr) return false;
      if (dateFilterMode === 'yesterday' && a.date !== yesterdayStr) return false;
      if (dateFilterMode === 'custom' && customFilterDate && a.date !== customFilterDate) return false;
      if (dateFilterMode === 'week') {
        const aTime = new Date(a.date).getTime();
        const weekAgo = Date.now() - 7 * 86400000;
        if (aTime < weekAgo) return false;
      }

      // Search query (audit id, reference note, product name)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = String(a.id).includes(q);
        const matchesDate = a.date.includes(q);
        const matchesNote = a.referenceNote?.toLowerCase().includes(q);
        const matchesProduct = a.entries.some((e) => e.name.toLowerCase().includes(q));
        if (!matchesId && !matchesDate && !matchesNote && !matchesProduct) return false;
      }

      return true;
    });

    const map = new Map<string, Audit[]>();
    for (const audit of filtered) {
      const d = audit.date || 'Undated';
      if (!map.has(d)) {
        map.set(d, []);
      }
      map.get(d)!.push(audit);
    }

    // Sort dates descending (latest day on top)
    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((date) => ({
      date,
      audits: map.get(date)!.sort((a, b) => b.id - a.id),
    }));
  }, [audits, dateFilterMode, customFilterDate, searchQuery, todayStr, yesterdayStr]);

  // Overall audit stats
  const auditStats = useMemo(() => {
    let totalAudits = audits.length;
    let totalVariances = 0;
    let datesSet = new Set<string>();

    for (const a of audits) {
      if (a.date) datesSet.add(a.date);
      for (const e of a.entries) {
        if (e.diff !== 0) totalVariances++;
      }
    }
    return {
      totalAudits,
      totalVariances,
      uniqueDays: datesSet.size,
    };
  }, [audits]);

  // Live count summary for the form currently being filled
  const formStats = useMemo(() => {
    let countedCount = 0;
    let varianceCount = 0;
    let netVariance = 0;

    for (const p of products) {
      const val = physicalCounts[p.id];
      if (val !== '' && val !== undefined) {
        countedCount++;
        const counted = Number(val);
        const book = bookAt(p.id);
        const diff = counted - book;
        if (diff !== 0) {
          varianceCount++;
          netVariance += diff;
        }
      }
    }
    return { countedCount, varianceCount, netVariance };
  }, [products, physicalCounts, stockAsOf, auditDate]);

  const toggleDayExpansion = (dateKey: string) => {
    setExpandedDays((prev) => ({
      ...prev,
      [dateKey]: prev[dateKey] === false ? true : false,
    }));
  };

  const expandAllDays = () => {
    const updated: Record<string, boolean> = {};
    for (const g of auditsGroupedByDate) {
      updated[g.date] = true;
    }
    setExpandedDays(updated);
  };

  const collapseAllDays = () => {
    const updated: Record<string, boolean> = {};
    for (const g of auditsGroupedByDate) {
      updated[g.date] = false;
    }
    setExpandedDays(updated);
  };

  const modeToggle = (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-4">
      <button
        type="button"
        onClick={() => setMode('quick')}
        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
          mode === 'quick' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
        }`}
      >
        Past audits
      </button>
      <button
        type="button"
        onClick={() => setMode('smart')}
        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
          mode === 'smart' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
        }`}
      >
        Smart Reconciliation
      </button>
    </div>
  );

  if (mode === 'smart') {
    return (
      <div id="view-audit" className={embedded ? 'flex flex-col gap-5' : 'py-1 lg:p-6 max-w-none lg:max-w-6xl'}>
        {modeToggle}
        <SmartReconciliationView />
      </div>
    );
  }

  return (
    <div id="view-audit" className={embedded ? 'flex flex-col gap-5' : 'py-1 lg:p-6 max-w-none lg:max-w-6xl'}>
      {modeToggle}
      {/* Header with Title and Quick Actions */}
      <div
        className="flex items-center justify-between pb-3 border-b-2 flex-wrap gap-3"
        style={{ borderColor: palette.line }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/20 shrink-0">
              <ClipboardCheck className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-lg sm:text-2xl font-black tracking-tight text-slate-900">
                Physical Stock Audit
              </h1>
              <InfoTip title="Physical stock audit">
                <p>Count the stock physically present, date by date, and reconcile it against what the system expects.</p>
                <p>Differences are never turned into a loss automatically — each shortage or excess is matched, reviewed and approved first.</p>
              </InfoTip>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
        </div>
      </div>

      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-3 sm:p-3.5">
          <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Total Audits</div>
          <div className="text-xl font-extrabold mt-1 text-slate-900">{auditStats.totalAudits}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Stocktakes stored</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-3 sm:p-3.5">
          <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Audit Dates</div>
          <div className="text-xl font-extrabold mt-1 text-slate-900">{auditStats.uniqueDays} days</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Grouped date-wise</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-3 sm:p-3.5">
          <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Variances</div>
          <div className="text-xl font-extrabold mt-1 text-slate-900">{auditStats.totalVariances} items</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Count differences</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-3 sm:p-3.5">
          <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Catalog</div>
          <div className="text-xl font-extrabold mt-1 text-slate-900">{products.length}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Products to count</div>
        </div>
      </div>

      {/* Success Notification */}
      {auditSavedMessage && (
        <div
          className="flex items-center justify-between p-3.5 border-2 rounded shadow-sm"
          style={{
            borderColor: palette.good,
            backgroundColor: `${palette.good}15`,
            color: palette.good,
            ...fz(14, { fontWeight: 600 }),
          }}
          role="status"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>{auditSavedMessage}</span>
          </div>
          <button aria-label="Close"
            type="button"
            onClick={() => setAuditSavedMessage(null)}
            className="p-1 hover:bg-emerald-100 rounded text-emerald-800 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div
          className="flex items-center justify-between p-3.5 border-2 rounded shadow-sm"
          style={{
            borderColor: palette.bad,
            backgroundColor: `${palette.bad}15`,
            color: palette.bad,
            ...fz(14, { fontWeight: 600 }),
          }}
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <button aria-label="Close"
            type="button"
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:bg-rose-100 rounded text-rose-800 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Product-level counting was retired: counts now go through Smart Reconciliation (every difference is matched and approved before stock changes). Past audits stay readable below. */}
      <div
        className="border-2 rounded px-4 py-3 flex items-center justify-between flex-wrap gap-3"
        style={{ borderColor: palette.line, backgroundColor: palette.panel, color: palette.ink, ...fz(13.5) }}
      >
        <span>
          New stock counts are done in <strong>Smart Reconciliation</strong>. This page keeps the history of earlier quick audits.
        </span>
        <button
          type="button"
          onClick={() => setMode('smart')}
          className="border-2 px-3.5 py-2 focus-ring cursor-pointer font-bold rounded"
          style={{ borderColor: palette.navy, backgroundColor: palette.navy, color: '#FFFFFF', ...fz(13.5) }}
        >
          Start a count
        </button>
      </div>


      {/* DATE-WISE AUDIT LOG HISTORY SECTION */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b-2" style={{ borderColor: palette.line }}>
          <div className="flex items-center gap-2">
            <History size={20} className="text-slate-800" aria-hidden="true" />
            <h2 style={fz(18, { fontWeight: 800, color: palette.ink })}>
              Date-Wise Audit Log History
            </h2>
          </div>

          {/* Date Filter Tabs & Search Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center border-2 rounded p-0.5 text-xs font-semibold" style={{ borderColor: palette.line }}>
              <button
                type="button"
                onClick={() => setDateFilterMode('all')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  dateFilterMode === 'all' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                All Dates
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('today')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  dateFilterMode === 'today' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('yesterday')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  dateFilterMode === 'yesterday' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('week')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  dateFilterMode === 'week' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Past 7 Days
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('custom')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  dateFilterMode === 'custom' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Specific Date
              </button>
            </div>

            {dateFilterMode === 'custom' && (
              <input
                type="date"
                value={customFilterDate}
                onChange={(e) => setCustomFilterDate(e.target.value)}
                className="border-2 px-2 py-1 text-xs rounded font-semibold focus-ring"
                style={{ borderColor: palette.line, color: palette.ink }}
              />
            )}

            {/* Quick search input */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input enterKeyHint="search"
                type="text"
                placeholder="Search audit / note..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-2 pl-7 pr-2.5 py-1 text-xs rounded focus-ring"
                style={{ borderColor: palette.line, color: palette.ink, width: '160px' }}
              />
            </div>
          </div>
        </div>

        {/* Expand / Collapse Day Groups Controls */}
        {auditsGroupedByDate.length > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-semibold text-slate-600 px-1">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-slate-500" />
              <span>
                Showing {auditsGroupedByDate.length} day{auditsGroupedByDate.length === 1 ? '' : 's'} with recorded stock audits (latest date on top)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={expandAllDays}
                className="inline-flex items-center gap-1 hover:text-slate-900 hover:underline cursor-pointer"
              >
                <ChevronsDown size={14} />
                Expand All Days
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={collapseAllDays}
                className="inline-flex items-center gap-1 hover:text-slate-900 hover:underline cursor-pointer"
              >
                <ChevronsUp size={14} />
                Contract All Days
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {audits.length === 0 ? (
          <div className="border-2 p-8 text-center rounded-sm" style={cardStyle}>
            <ClipboardCheck size={Math.round(36 * scale)} className="mx-auto mb-2 opacity-40" aria-hidden="true" />
            <div style={fz(16, { fontWeight: 700, color: palette.ink })}>No Stock Audits Recorded</div>
            <div style={fz(13.5, { color: palette.muted, marginTop: '0.25em' })}>
              Select an Audit Date and enter counted crates above to record your warehouse inventory audit.
            </div>
          </div>
        ) : auditsGroupedByDate.length === 0 ? (
          <div className="border-2 p-6 text-center rounded-sm" style={cardStyle}>
            <div style={fz(14, { color: palette.muted })}>
              No historical audits found matching the selected date or search filter.
            </div>
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('all');
                setSearchQuery('');
              }}
              className="mt-2 text-xs font-bold text-sky-700 underline cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          /* Date-Wise Accordions */
          <div className="space-y-5">
            {auditsGroupedByDate.map((group) => {
              const { label: dayLabel, tag: dayTag } = formatDayHeader(group.date);
              const isDayExpanded = expandedDays[group.date] !== false; // default expanded

              // Calculate day totals
              const dayProductsAudited = group.audits.reduce((acc, a) => acc + a.entries.length, 0);
              const dayDiscrepanciesCount = group.audits.reduce(
                (acc, a) => acc + a.entries.filter((e) => e.diff !== 0).length,
                0
              );
              const dayNetDiff = group.audits.reduce(
                (acc, a) => acc + a.entries.reduce((s, e) => s + e.diff, 0),
                0
              );

              return (
                <div
                  key={group.date}
                  className="border-2 rounded-sm overflow-hidden shadow-sm"
                  style={{ borderColor: palette.line, backgroundColor: palette.panel }}
                >
                  {/* Date Header Accordion Trigger */}
                  <div
                    onClick={() => toggleDayExpansion(group.date)}
                    className="p-3 sm:p-4 border-b-2 flex items-center justify-between flex-wrap gap-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                    style={{ borderColor: palette.line, backgroundColor: `${palette.navy}08` }}
                    title="Click to expand or collapse this day's audits"
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        className="p-1 rounded text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                        aria-label={isDayExpanded ? 'Collapse Day' : 'Expand Day'}
                      >
                        {isDayExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                      <Calendar size={18} className="text-sky-800" aria-hidden="true" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-base">{dayLabel}</span>
                          {dayTag && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-blue-100 text-sky-800">
                              {dayTag}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 font-medium">
                          Audit Date: <strong>{group.date}</strong> · {group.audits.length}{' '}
                          {group.audits.length === 1 ? 'audit session' : 'audit sessions'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-semibold text-slate-700 flex-wrap">
                      <span className="bg-white px-2.5 py-1 rounded border border-slate-200 shadow-sm">
                        {group.audits.length} Session{group.audits.length === 1 ? '' : 's'}
                      </span>
                      <span className="bg-white px-2.5 py-1 rounded border border-slate-200 shadow-sm">
                        {dayProductsAudited} Items Audited
                      </span>
                      {dayDiscrepanciesCount === 0 ? (
                        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded border border-emerald-300 font-bold">
                          ✓ Exact Match (0 Variance)
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-800 px-2.5 py-1 rounded border border-amber-300 font-bold">
                          {dayDiscrepanciesCount} Discrepanc{dayDiscrepanciesCount === 1 ? 'y' : 'ies'} (
                          {dayNetDiff > 0 ? `+${dayNetDiff}` : dayNetDiff} cs net)
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {isDayExpanded ? 'Click to collapse' : 'Click to expand'}
                      </span>
                    </div>
                  </div>

                  {/* Audits under this day */}
                  {isDayExpanded && (
                    <div className="divide-y-2 p-3 sm:p-4 space-y-4" style={{ borderColor: palette.line }}>
                      {group.audits.map((a) => {
                        const discrepancies = a.entries.filter((e) => e.diff !== 0);
                        const isBalanced = discrepancies.length === 0;

                        return (
                          <div
                            key={a.id}
                            className="border-2 rounded p-4 bg-white shadow-sm hover:border-slate-400 transition-colors"
                            style={{ borderColor: palette.line }}
                          >
                            {/* Audit Card Header */}
                            <div className="flex items-center justify-between mb-3 flex-wrap gap-2 pb-2.5 border-b" style={{ borderColor: palette.line }}>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span style={fz(15, { fontWeight: 800, color: palette.ink })}>
                                    Audit #{a.id}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded bg-sky-600 text-white shadow-sm">
                                    <Calendar size={13} />
                                    <span>Date: {a.date}</span>
                                  </span>
                                  {a.time && (
                                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                      Time: {a.time}
                                    </span>
                                  )}
                                  {a.referenceNote && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200">
                                      {a.referenceNote}
                                    </span>
                                  )}
                                </div>

                                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                                  <span>{a.entries.length} beverages counted</span>
                                  <span>·</span>
                                  <span
                                    className={`font-bold ${
                                      isBalanced ? 'text-emerald-700' : 'text-rose-700'
                                    }`}
                                  >
                                    {isBalanced
                                      ? 'Reconciliation Balanced'
                                      : `${discrepancies.length} variance item${discrepancies.length === 1 ? '' : 's'}`}
                                  </span>
                                  <span>·</span>
                                  <span className="text-slate-600 font-medium">
                                    {a.adjusted ? 'Stock balances auto-adjusted' : 'Audit observation only'}
                                  </span>
                                </div>
                              </div>

                              {/* Delete Audit Button */}
                              <button
                                type="button"
                                onClick={() => setAuditToDelete(a)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-200 transition-colors cursor-pointer"
                                title={`Delete Audit #${a.id}`}
                                aria-label={`Delete Audit #${a.id}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            {/* Itemized Table of this Audit */}
                            <div className="border overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ borderColor: palette.line }}>
                              <table className="w-full text-left data-table" style={fz(12.5)}>
                                <thead>
                                  <tr className="bg-slate-50 border-b" style={{ borderColor: palette.line }}>
                                    <th className="px-3 py-1.5 font-bold">Beverage Product</th>
                                    <th className="px-3 py-1.5 text-right font-bold">System Book Stock</th>
                                    <th className="px-3 py-1.5 text-right font-bold">Physical Counted</th>
                                    <th className="px-3 py-1.5 text-right font-bold">Variance (Diff)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {a.entries.map((e) => (
                                    <tr
                                      key={e.productId}
                                      className="border-t hover:bg-slate-50/60"
                                      style={{ borderColor: palette.line }}
                                    >
                                      <td
                                        className="px-3 py-1.5 font-medium text-slate-900"
                                        style={sizeStripe(products.find((p) => p.id === e.productId)?.volume, e.name)}
                                      >
                                        <span className="break-words">{e.name}</span>{' '}
                                        <SizeChip
                                          volume={products.find((p) => p.id === e.productId)?.volume}
                                          pack={products.find((p) => p.id === e.productId)?.pack}
                                          name={e.name}
                                        />
                                      </td>
                                      <td className="px-3 py-1.5 text-right text-slate-600">{e.system} cs</td>
                                      <td className="px-3 py-1.5 text-right font-bold text-slate-800">{e.counted} cs</td>
                                      <td
                                        className="px-3 py-1.5 text-right font-bold"
                                        style={{
                                          color:
                                            e.diff === 0
                                              ? palette.good
                                              : e.diff > 0
                                              ? '#d97706'
                                              : palette.bad,
                                        }}
                                      >
                                        {e.diff === 0
                                          ? '0 (Exact)'
                                          : `${e.diff > 0 ? `+${e.diff}` : e.diff} cs ${e.diff > 0 ? '(Excess)' : '(Shortage)'}`}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {auditToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-delete-audit-title"
        >
          <div
            className="w-full max-w-md border-2 shadow-2xl rounded-sm overflow-hidden"
            style={{ backgroundColor: palette.panel, borderColor: palette.bad }}
          >
            <div
              className="p-4 border-b-2 flex items-center justify-between text-white"
              style={{ backgroundColor: palette.bad }}
            >
              <div className="flex items-center gap-2 font-bold text-base">
                <Trash2 size={20} aria-hidden="true" />
                <span id="modal-delete-audit-title">Confirm Delete Stock Audit</span>
              </div>
              <button
                type="button"
                onClick={() => setAuditToDelete(null)}
                className="text-white/80 hover:text-white p-1 rounded transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p style={fz(14, { color: palette.ink, lineHeight: 1.5 })}>
                Are you sure you want to delete{' '}
                <strong>
                  Audit #{auditToDelete.id}
                </strong>{' '}
                recorded on <strong>{auditToDelete.date}</strong>?
              </p>
              <div
                className="p-3 border-2 rounded text-xs"
                style={{
                  backgroundColor: `${palette.bad}10`,
                  borderColor: palette.bad,
                  color: palette.bad,
                }}
              >
                This will remove the historical audit log entry containing {auditToDelete.entries.length} product reconciliation counts. Warning: if this audit adjusted stock, deleting it also reverses that adjustment and live stock changes by the same amount.
              </div>
            </div>

            <div
              className="p-4 border-t-2 flex items-center justify-end gap-2"
              style={{ borderColor: palette.line, backgroundColor: `${palette.line}20` }}
            >
              <button
                type="button"
                onClick={() => setAuditToDelete(null)}
                className="border-2 px-4 py-2 text-xs font-semibold rounded cursor-pointer transition-colors"
                style={{
                  borderColor: palette.line,
                  color: palette.ink,
                  backgroundColor: palette.panel,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-audit"
                onClick={() => {
                  const id = auditToDelete.id;
                  deleteAudit(id);
                  setAuditToDelete(null);
                  setAuditSavedMessage(`Audit #${id} was deleted successfully.`);
                  setTimeout(() => setAuditSavedMessage(null), 4000);
                }}
                className="border-2 px-4 py-2 text-xs font-bold text-white rounded cursor-pointer transition-all shadow-sm"
                style={{
                  backgroundColor: palette.bad,
                  borderColor: palette.bad,
                }}
              >
                Yes, Delete Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
