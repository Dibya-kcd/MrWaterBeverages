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

export interface AuditViewProps {
  embedded?: boolean;
}

export const AuditView: React.FC<AuditViewProps> = ({ embedded = false }) => {
  const { products, bookStock, audits, saveAudit, deleteAudit, palette, fz, scale } = useLedger();

  // New Audit Form State
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const [auditDate, setAuditDate] = useState<string>(todayStr);
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
        autoAdjust ? 'Opening stock balances have been trued-up.' : 'Observation recorded without altering stock.'
      }`
    );
    setTimeout(() => setAuditSavedMessage(null), 6000);
  };

  const fillAllWithBookStock = () => {
    const filled: Record<number, string> = {};
    products.forEach((p) => {
      filled[p.id] = String(bookStock(p.id));
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
        const book = bookStock(p.id);
        const diff = counted - book;
        if (diff !== 0) {
          varianceCount++;
          netVariance += diff;
        }
      }
    }
    return { countedCount, varianceCount, netVariance };
  }, [products, physicalCounts, bookStock]);

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

  return (
    <div id="view-audit" className={embedded ? 'flex flex-col gap-5' : 'p-4 sm:p-6 max-w-6xl'}>
      {/* Header with Title and Quick Actions */}
      <div
        className="flex items-center justify-between pb-3 border-b-2 flex-wrap gap-3"
        style={{ borderColor: palette.line }}
      >
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck size={embedded ? 22 : 28} className="text-blue-700" aria-hidden="true" />
            <h1 style={fz(embedded ? 20 : 26, { fontWeight: 800, color: palette.ink })}>
              Date-Wise Physical Stock Audit & Reconcile
            </h1>
          </div>
          <p style={fz(embedded ? 13 : 14.5, { color: palette.muted, marginTop: '0.25em' })}>
            Perform physical warehouse counts organized by date. Compare godown crates with ledger book stock and track historical audit logs day by day.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="flex items-center gap-1.5 border-2 px-3.5 py-2 focus-ring cursor-pointer font-bold rounded shadow-xs"
            style={{
              backgroundColor: showForm ? palette.panel : palette.navy,
              borderColor: palette.navy,
              color: showForm ? palette.navy : '#FFFFFF',
              ...fz(13.5),
            }}
          >
            {showForm ? <ChevronUp size={16} /> : <Plus size={16} />}
            <span>{showForm ? 'Hide Audit Entry Form' : 'New Physical Audit'}</span>
          </button>
        </div>
      </div>

      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border-2 p-3 rounded-sm shadow-xs" style={cardStyle}>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Audits Stored</div>
          <div className="text-xl font-extrabold mt-1 text-slate-900">{auditStats.totalAudits}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Reconciliation stocktakes</div>
        </div>
        <div className="border-2 p-3 rounded-sm shadow-xs" style={cardStyle}>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Audit Dates</div>
          <div className="text-xl font-extrabold mt-1 text-slate-900">{auditStats.uniqueDays} days</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Grouped date-wise</div>
        </div>
        <div className="border-2 p-3 rounded-sm shadow-xs" style={cardStyle}>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Variance Discrepancies</div>
          <div className="text-xl font-extrabold mt-1 text-slate-900">{auditStats.totalVariances} items</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Products with count difference</div>
        </div>
        <div className="border-2 p-3 rounded-sm shadow-xs" style={cardStyle}>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Products in Catalog</div>
          <div className="text-xl font-extrabold mt-1 text-slate-900">{products.length} beverages</div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Available for stock audit</div>
        </div>
      </div>

      {/* Success Notification */}
      {auditSavedMessage && (
        <div
          className="flex items-center justify-between p-3.5 border-2 rounded shadow-xs"
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
          <button
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
          className="flex items-center justify-between p-3.5 border-2 rounded shadow-xs"
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
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:bg-rose-100 rounded text-rose-800 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* NEW AUDIT ENTRY FORM (WITH DATE EXPLICITLY MENTIONED AND SELECTABLE) */}
      {showForm && (
        <form
          id="form-stock-audit"
          onSubmit={handleSaveAudit}
          className="border-2 p-5 rounded-sm shadow-sm"
          style={{ borderColor: palette.navy, backgroundColor: palette.panel }}
        >
          {/* Prominent Audit Date Mention & Selector Banner */}
          <div
            className="p-3.5 border-2 rounded mb-5 flex items-center justify-between flex-wrap gap-3"
            style={{ borderColor: palette.line, backgroundColor: `${palette.navy}08` }}
          >
            <div className="flex items-center gap-2.5">
              <Calendar size={20} className="text-blue-800" aria-hidden="true" />
              <div>
                <div className="flex items-center gap-2">
                  <span style={fz(16, { fontWeight: 800, color: palette.ink })}>
                    Stock Audit Date:
                  </span>
                  <span className="font-extrabold text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded text-sm border border-blue-200">
                    {formatDayHeader(auditDate).label}
                  </span>
                  {formatDayHeader(auditDate).tag && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-emerald-100 text-emerald-800">
                      {formatDayHeader(auditDate).tag}
                    </span>
                  )}
                </div>
                <p style={fz(12.5, { color: palette.muted, marginTop: '0.15em' })}>
                  Physical stock count will be stamped and recorded under date <strong>{auditDate}</strong>.
                </p>
              </div>
            </div>

            {/* Quick Date Switchers */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setAuditDate(todayStr)}
                className={`px-2.5 py-1 text-xs font-bold rounded border-2 cursor-pointer transition-colors ${
                  auditDate === todayStr ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-slate-800 border-slate-300'
                }`}
              >
                Today ({todayStr})
              </button>
              <button
                type="button"
                onClick={() => setAuditDate(yesterdayStr)}
                className={`px-2.5 py-1 text-xs font-bold rounded border-2 cursor-pointer transition-colors ${
                  auditDate === yesterdayStr ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-slate-800 border-slate-300'
                }`}
              >
                Yesterday ({yesterdayStr})
              </button>
            </div>
          </div>

          {/* Form Fields: Date picker, Reference, Auto-adjust option */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            <div>
              <label htmlFor="audit-date-input" style={labelStyle}>
                Audit Date * (Date when stock was counted)
              </label>
              <input
                id="audit-date-input"
                type="date"
                required
                value={auditDate}
                onChange={(e) => setAuditDate(e.target.value)}
                className="w-full border-2 px-3 py-2 focus-ring rounded font-semibold"
                style={inputStyle}
              />
            </div>

            <div>
              <label htmlFor="audit-reference-note" style={labelStyle}>
                Auditor Name / Godown Location (Optional)
              </label>
              <input
                id="audit-reference-note"
                placeholder="e.g. Main Godown / Suresh (Weekly Reconcile)"
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
                className="w-full border-2 px-3 py-2 focus-ring rounded"
                style={inputStyle}
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold p-2.5 border-2 rounded select-none" style={{ borderColor: palette.line, backgroundColor: `${palette.line}10` }}>
                <input
                  type="checkbox"
                  checked={autoAdjust}
                  onChange={(e) => setAutoAdjust(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus-ring cursor-pointer"
                />
                <span>Auto-adjust product opening stock to match physical count</span>
              </label>
            </div>
          </div>

          {/* Table Tools: Pre-fill and Clear */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span style={fz(14, { fontWeight: 700, color: palette.ink })}>
                Counted Beverage Stock (Physical Cases):
              </span>
              {formStats.countedCount > 0 && (
                <span className="text-xs bg-slate-100 border border-slate-300 text-slate-700 px-2 py-0.5 rounded font-bold">
                  {formStats.countedCount} entered ·{' '}
                  {formStats.varianceCount === 0 ? (
                    <span className="text-emerald-700">0 variance</span>
                  ) : (
                    <span className="text-amber-700">
                      {formStats.varianceCount} with variance ({formStats.netVariance > 0 ? `+${formStats.netVariance}` : formStats.netVariance} cs net)
                    </span>
                  )}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fillAllWithBookStock}
                className="border-2 px-3 py-1 text-xs focus-ring cursor-pointer font-semibold rounded hover:bg-slate-100"
                style={{
                  borderColor: palette.line,
                  backgroundColor: palette.panel,
                  color: palette.ink,
                }}
                title="Populate physical count column with current book stock values for quick auditing"
              >
                Pre-fill with Book Stock
              </button>
              <button
                type="button"
                onClick={clearAllCounts}
                className="border-2 px-3 py-1 text-xs focus-ring cursor-pointer font-semibold rounded text-slate-600 hover:bg-slate-100"
                style={{
                  borderColor: palette.line,
                  backgroundColor: palette.panel,
                }}
              >
                Clear Inputs
              </button>
            </div>
          </div>

          {/* Physical Count Table */}
          <div className="border-2 overflow-x-auto mb-5 rounded" style={{ borderColor: palette.line }}>
            <table className="w-full text-left" style={fz(13.5)}>
              <thead>
                <tr className="border-b-2 bg-slate-50" style={{ borderColor: palette.line }}>
                  <th className="px-3.5 py-2.5 font-bold">Product Name</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">System Book Stock</th>
                  <th className="px-3.5 py-2.5 text-right font-bold w-40">Physical Count (Cases)</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">Variance (Diff)</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const book = bookStock(p.id);
                  const countedStr = physicalCounts[p.id];
                  const hasCounted = countedStr !== '' && countedStr !== undefined;
                  const counted = hasCounted ? Number(countedStr) : null;
                  const diff = counted !== null ? counted - book : null;

                  return (
                    <tr key={p.id} className="border-t hover:bg-slate-50/50" style={{ borderColor: palette.line }}>
                      <td className="px-3.5 py-2">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-500">₹{p.retail || p.wholesale || p.cost} / case</div>
                      </td>
                      <td className="px-3.5 py-2 text-right font-semibold text-slate-700">{book} cs</td>
                      <td className="px-3.5 py-2 text-right">
                        <label htmlFor={`audit-count-${p.id}`} className="sr-only">
                          Physical count for {p.name}
                        </label>
                        <input
                          id={`audit-count-${p.id}`}
                          type="number"
                          min="0"
                          placeholder="Count cs"
                          value={countedStr || ''}
                          onChange={(e) =>
                            setPhysicalCounts({ ...physicalCounts, [p.id]: e.target.value })
                          }
                          className="w-28 border-2 px-2.5 py-1 text-right focus-ring font-bold rounded"
                          style={inputStyle}
                        />
                      </td>
                      <td
                        className="px-3.5 py-2 text-right font-bold"
                        style={{
                          color:
                            diff === null
                              ? palette.muted
                              : diff === 0
                              ? palette.good
                              : diff > 0
                              ? '#d97706' // amber for excess
                              : palette.bad, // red for shortage
                        }}
                      >
                        {diff === null
                          ? '—'
                          : diff === 0
                          ? '0 (Exact)'
                          : `${diff > 0 ? `+${diff}` : diff} cs ${diff > 0 ? '(Excess)' : '(Shortage)'}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Form Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              id="btn-save-audit"
              type="submit"
              className="border-2 px-6 py-2.5 focus-ring cursor-pointer font-bold rounded shadow-xs"
              style={{
                backgroundColor: palette.navy,
                borderColor: palette.navy,
                color: '#FFFFFF',
                ...fz(14),
              }}
            >
              Save Audit for {auditDate} & Finalize
            </button>
            <button
              type="button"
              onClick={() => {
                setPhysicalCounts({});
                setShowForm(false);
              }}
              className="border-2 px-4 py-2.5 focus-ring cursor-pointer font-semibold rounded hover:bg-slate-100"
              style={{
                borderColor: palette.line,
                color: palette.muted,
                backgroundColor: palette.panel,
                ...fz(14),
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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
              <input
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
              className="mt-2 text-xs font-bold text-blue-700 underline cursor-pointer"
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
                  className="border-2 rounded-sm overflow-hidden shadow-xs"
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
                      <Calendar size={18} className="text-blue-800" aria-hidden="true" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-base">{dayLabel}</span>
                          {dayTag && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-blue-100 text-blue-800">
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
                      <span className="bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs">
                        {group.audits.length} Session{group.audits.length === 1 ? '' : 's'}
                      </span>
                      <span className="bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs">
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
                            className="border-2 rounded p-4 bg-white shadow-2xs hover:border-slate-400 transition-colors"
                            style={{ borderColor: palette.line }}
                          >
                            {/* Audit Card Header */}
                            <div className="flex items-center justify-between mb-3 flex-wrap gap-2 pb-2.5 border-b" style={{ borderColor: palette.line }}>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span style={fz(15, { fontWeight: 800, color: palette.ink })}>
                                    Audit #{a.id}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded bg-blue-900 text-white shadow-xs">
                                    <Calendar size={13} />
                                    <span>Date: {a.date}</span>
                                  </span>
                                  {a.time && (
                                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                      Time: {a.time}
                                    </span>
                                  )}
                                  {a.referenceNote && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
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
                            <div className="border overflow-x-auto rounded" style={{ borderColor: palette.line }}>
                              <table className="w-full text-left" style={fz(12.5)}>
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
                                      <td className="px-3 py-1.5 font-medium text-slate-900">{e.name}</td>
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
                This will remove the historical audit log entry containing {auditToDelete.entries.length} product reconciliation counts. Note that if stock was already adjusted, product opening balances remain preserved.
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
                className="border-2 px-4 py-2 text-xs font-bold text-white rounded cursor-pointer transition-all shadow-xs"
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
