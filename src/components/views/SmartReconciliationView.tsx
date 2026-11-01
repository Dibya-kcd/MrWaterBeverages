import React, { useMemo, useState } from 'react';
import {
  Plus,
  AlertTriangle,
  CheckCircle2,
  Search as SearchIcon,
  ShieldCheck,
  ArrowLeftRight,
  HelpCircle,
  ChevronLeft,
  Pencil,
  Trash2,
  History,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { Button, Card, CardContent, Badge, Modal } from '../ui';
import {
  AuditSession,
  VarianceEntry,
  VarianceClassification,
  InvestigationReason,
} from '../../types';
import { findSwapSuggestions, buildAuditDashboardSummary } from '../../utils/stockReconciliation';
import { InfoTip } from "../common/InfoTip";
import { todayISO } from "../../utils/dateLocal";

const REASON_LABELS: Record<InvestigationReason, string> = {
  sale_not_recorded: 'Sale not recorded',
  wrong_sku_in_sale: 'Wrong SKU used in sale',
  warehouse_transfer_not_recorded: 'Warehouse transfer not recorded',
  customer_return_not_recorded: 'Customer return not recorded',
  free_scheme_qty_not_recorded: 'Free/scheme quantity not recorded',
  damage: 'Damage',
  leakage: 'Leakage',
  expiry: 'Expiry',
  loading_unloading_discrepancy: 'Loading/unloading discrepancy',
  counting_error: 'Counting error',
  wrong_opening_stock: 'Wrong opening stock',
  duplicate_missing_transaction: 'Duplicate/missing transaction',
  unknown_variance: 'Unknown / Under Investigation',
};

function classificationBadge(c: VarianceClassification) {
  switch (c) {
    case 'matched':
      return <Badge variant="success">Matched</Badge>;
    case 'shortage':
      return <Badge variant="danger">Shortage</Badge>;
    case 'excess':
      return <Badge variant="accent">Excess</Badge>;
    case 'possible_swap':
      return <Badge variant="warning">Possible Product Swap</Badge>;
    case 'unexplained':
      return <Badge variant="danger">Unexplained Variance</Badge>;
    case 'under_investigation':
      return <Badge variant="warning">Under Investigation</Badge>;
    case 'reconciled':
      return <Badge variant="accent">Reconciled — Awaiting Approval</Badge>;
    case 'approved_adjustment':
      return <Badge variant="success">Approved Adjustment</Badge>;
    default:
      return <Badge variant="neutral">{c}</Badge>;
  }
}

export const SmartReconciliationView: React.FC = () => {
  const {
    products,
    warehouses,
    bookStock,
    currentUser,
    currentRole,
    auditSessions,
    createAuditSession,
    deleteAuditSession,
    updateAuditSession,
    saveAuditSessionCounts,
    confirmSwap,
    rejectSuggestion,
    keepAsSeparateVariance,
    markUnderInvestigation,
    selectInvestigationReason,
    approveReconciliation,
    reconciliationTransactions,
  } = useLedger();

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [warehouseId, setWarehouseId] = useState<string>(warehouses[0]?.id || '');
  const [auditorName, setAuditorName] = useState(currentUser?.name || '');
  const [referenceNote, setReferenceNote] = useState('');
  const todayStr = () => todayISO();
  const [auditDate, setAuditDate] = useState(todayStr());

  // Edit an existing session: header (date/godown/auditor/note) and counts (add missing / fix / remove)
  const [editHeaderOpen, setEditHeaderOpen] = useState(false);
  const [hdrDate, setHdrDate] = useState('');
  const [hdrWarehouseId, setHdrWarehouseId] = useState('');
  const [hdrAuditor, setHdrAuditor] = useState('');
  const [hdrNote, setHdrNote] = useState('');
  const [editCountsOpen, setEditCountsOpen] = useState(false);
  const [editCounts, setEditCounts] = useState<Record<number, string>>({});
  const [editRemove, setEditRemove] = useState<Set<number>>(new Set());
  const [editSearch, setEditSearch] = useState('');
  const [editMessage, setEditMessage] = useState('');

  const [reasonModalEntry, setReasonModalEntry] = useState<{ sessionId: string; entry: VarianceEntry } | null>(null);
  const [reasonChoice, setReasonChoice] = useState<InvestigationReason>('sale_not_recorded');
  const [reasonNotes, setReasonNotes] = useState('');
  const [swapQtyDraft, setSwapQtyDraft] = useState<Record<string, string>>({});

  const selectedSession = auditSessions.find((s) => s.id === selectedSessionId) || null;

  const filteredProducts = products.filter(
    (p) => !productSearch.trim() || p.name.toLowerCase().includes(productSearch.trim().toLowerCase())
  );

  const countedInDraft = Object.values(counts).filter((v) => v.trim() !== '').length;

  const startSession = () => {
    const countList = Object.entries(counts)
      .filter(([, v]) => v.trim() !== '')
      .map(([pid, v]) => ({ productId: Number(pid), physicalStock: Number(v) || 0 }));
    if (countList.length === 0) return;
    const wh = warehouses.find((w) => w.id === warehouseId);
    const session = createAuditSession({
      warehouseId: wh?.id,
      warehouseName: wh?.name,
      date: auditDate || todayStr(),
      auditorName: auditorName || currentUser?.name || 'Auditor',
      referenceNote,
      counts: countList,
    });
    setNewSessionOpen(false);
    setCounts({});
    setReferenceNote('');
    setAuditDate(todayStr());
    setSelectedSessionId(session.id);
  };

  const openEditHeader = () => {
    if (!selectedSession) return;
    setHdrDate(selectedSession.date);
    setHdrWarehouseId(selectedSession.warehouseId || warehouses[0]?.id || '');
    setHdrAuditor(selectedSession.auditorName);
    setHdrNote(selectedSession.referenceNote || '');
    setEditHeaderOpen(true);
  };

  const saveHeader = () => {
    if (!selectedSession || !hdrDate) return;
    const wh = warehouses.find((w) => w.id === hdrWarehouseId);
    updateAuditSession(selectedSession.id, {
      date: hdrDate,
      warehouseId: wh?.id,
      warehouseName: wh?.name,
      auditorName: hdrAuditor.trim() || selectedSession.auditorName,
      referenceNote: hdrNote,
    });
    setEditHeaderOpen(false);
  };

  const openEditCounts = () => {
    if (!selectedSession) return;
    const prefill: Record<number, string> = {};
    selectedSession.entries.forEach((e) => {
      prefill[e.productId] = String(e.physicalStock);
    });
    setEditCounts(prefill);
    setEditRemove(new Set());
    setEditSearch('');
    setEditMessage('');
    setEditCountsOpen(true);
  };

  const saveEditedCounts = () => {
    if (!selectedSession) return;
    const countList = Object.entries(editCounts)
      .filter(([pid, v]) => v.trim() !== '' && !editRemove.has(Number(pid)))
      .map(([pid, v]) => ({ productId: Number(pid), physicalStock: Math.max(0, Number(v) || 0) }));
    const res = saveAuditSessionCounts(selectedSession.id, countList, Array.from(editRemove));
    const parts = [
      res.added ? `${res.added} added` : '',
      res.updated ? `${res.updated} count(s) corrected` : '',
      res.removed ? `${res.removed} removed` : '',
      res.locked ? `${res.locked} skipped (already awaiting approval / applied)` : '',
    ].filter(Boolean);
    if (res.added + res.updated + res.removed === 0 && res.locked === 0) {
      setEditCountsOpen(false);
      return;
    }
    setEditMessage(parts.join(' · '));
    setEditCountsOpen(false);
  };

  const sessionsSorted = [...auditSessions].sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  const pendingTxnsFor = (entryId: string) =>
    reconciliationTransactions.filter((t) => t.varianceEntryId === entryId && !t.approvedAt);

  return (
    <div className="space-y-4">
      {!selectedSession && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-1.5">
                <ArrowLeftRight className="w-5 h-5 text-slate-700 shrink-0" /> Smart Stock Reconciliation
                <InfoTip title="Smart stock reconciliation">
                  <p>A shortage is never assumed to be lost stock. Similar-looking products are checked for possible mix-ups first, and you always confirm before anything changes.</p>
                </InfoTip>
              </h2>
            </div>
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setNewSessionOpen(true)} className="w-full sm:w-auto shrink-0">
              New Audit Session
            </Button>
          </div>

          {auditSessions.length === 0 ? (
            <Card>
              <CardContent className="text-center text-sm text-slate-400 py-8">
                No smart reconciliation sessions yet. Start one to count physical stock and let the system flag
                possible product mix-ups automatically.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sessionsSorted.map((s) => {
                const summary = buildAuditDashboardSummary(s.entries);
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSessionId(s.id)}
                    className="rounded-xl border border-slate-200 bg-white p-3 cursor-pointer hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm text-slate-900">
                          {s.date} {s.warehouseName ? `· ${s.warehouseName}` : ''}
                        </p>
                        <p className="text-xs text-slate-500">Auditor: {s.auditorName} · {summary.totalSkusAudited} SKUs</p>
                      </div>
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        {summary.possibleSwaps > 0 && <Badge variant="warning">{summary.possibleSwaps} possible swap</Badge>}
                        {summary.unresolved > 0 && <Badge variant="danger">{summary.unresolved} unresolved</Badge>}
                        {summary.approvedAdjustments > 0 && <Badge variant="success">{summary.approvedAdjustments} approved</Badge>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {selectedSession && (
        <SessionDetail
          session={selectedSession}
          products={products}
          currentRole={currentRole}
          currentUserName={currentUser?.name || 'Admin'}
          onBack={() => {
            setSelectedSessionId(null);
            setEditMessage('');
          }}
          onEditHeader={openEditHeader}
          onEditCounts={openEditCounts}
          editMessage={editMessage}
          onDelete={() => {
            deleteAuditSession(selectedSession.id);
            setSelectedSessionId(null);
          }}
          pendingTxnsFor={pendingTxnsFor}
          onConfirmSwap={(entry, candidateProductId, quantity, score) =>
            confirmSwap(selectedSession.id, entry.id, { candidateProductId, quantity, matchScore: score })
          }
          onRejectSuggestion={(entry) => rejectSuggestion(selectedSession.id, entry.id)}
          onKeepSeparate={(entry) => keepAsSeparateVariance(selectedSession.id, entry.id)}
          onInvestigate={(entry) => markUnderInvestigation(selectedSession.id, entry.id)}
          onOpenReasonModal={(entry) => {
            setReasonModalEntry({ sessionId: selectedSession.id, entry });
            setReasonChoice('sale_not_recorded');
            setReasonNotes('');
          }}
          onApprove={(entry) => approveReconciliation(selectedSession.id, entry.id, currentUser?.name || 'Admin')}
          swapQtyDraft={swapQtyDraft}
          setSwapQtyDraft={setSwapQtyDraft}
        />
      )}

      {/* New Session Modal */}
      <Modal
        isOpen={newSessionOpen}
        onClose={() => setNewSessionOpen(false)}
        title="New Smart Reconciliation Audit"
        subtitle="Pick the audit date and enter the physical count for each product — the system compares it against live book stock."
        maxWidth="lg"
        fullScreenOnDesktop
        bodyClassName="lg:overflow-hidden"
        footer={
          <>
            <span className="mr-auto text-xs text-slate-500">
              <strong className="text-slate-800">{countedInDraft}</strong> of {products.length} products counted
            </span>
            <Button variant="secondary" onClick={() => setNewSessionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={startSession} disabled={countedInDraft === 0}>
              Create Session
            </Button>
          </>
        }
      >
        <div className="space-y-3 lg:space-y-0 lg:h-full lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-6">
          <div className="space-y-3 lg:overflow-y-auto lg:pr-1">
          <label className="text-sm block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Audit Date</span>
            <input
              type="date"
              max={todayStr()}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={auditDate}
              onChange={(e) => setAuditDate(e.target.value)}
            />
            {auditDate && auditDate !== todayStr() && (
              <span className="block text-[11px] text-amber-700 mt-1">
                Back-dated audit. "System says" below is today's live book stock, not stock as it stood on that date.
              </span>
            )}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-600 mb-1">Warehouse</span>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-600 mb-1">Auditor Name</span>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={auditorName}
                onChange={(e) => setAuditorName(e.target.value)}
              />
            </label>
          </div>
          <label className="text-sm block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Reference Note (optional)</span>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
            />
          </label>
          <p className="hidden lg:block text-[11px] text-slate-400 leading-snug pt-1">
            Leave a product blank to skip it — only products with a count entered are added to this session.
          </p>
          </div>

          <div className="space-y-3 lg:space-y-0 lg:flex lg:flex-col lg:gap-3 lg:min-h-0">
            <div className="relative">
              <SearchIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm"
                placeholder="Search products to count..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg lg:max-h-none lg:flex-1 lg:min-h-0 lg:grid lg:grid-cols-2 2xl:grid-cols-3 lg:content-start">
              {filteredProducts.map((p) => {
                const raw = counts[p.id];
                const hasCount = raw !== undefined && raw.trim() !== '';
                const diff = hasCount ? (Number(raw) || 0) - bookStock(p.id) : 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 lg:border-r"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 break-words leading-snug" title={p.name}>{p.name}</p>
                      <p className="text-[11px] text-slate-400">System says {bookStock(p.id)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasCount && diff !== 0 && (
                        <span
                          className={`text-[11px] font-bold font-mono px-1.5 py-0.5 rounded ${
                            diff < 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                          }`}
                          title="Counted minus system stock"
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                      {hasCount && diff === 0 && (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">OK</span>
                      )}
                      <input
                        type="number" inputMode="numeric"
                        min="0"
                        placeholder="Count"
                        className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right"
                        value={counts[p.id] ?? ''}
                        onChange={(e) => setCounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="lg:hidden text-[11px] text-slate-400">
              Leave a product blank to skip it — only products with a count entered are added to this session.
            </p>
          </div>
        </div>
      </Modal>

      {/* Edit Session Header Modal */}
      <Modal
        isOpen={editHeaderOpen}
        onClose={() => setEditHeaderOpen(false)}
        title="Edit Audit Session"
        subtitle="Correct the date, godown, auditor or note. Changes are recorded in the session's change log."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditHeaderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveHeader} disabled={!hdrDate}>
              Save Changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="text-sm block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Audit Date</span>
            <input
              type="date"
              max={todayStr()}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={hdrDate}
              onChange={(e) => setHdrDate(e.target.value)}
            />
          </label>
          <label className="text-sm block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Warehouse</span>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={hdrWarehouseId}
              onChange={(e) => setHdrWarehouseId(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Auditor Name</span>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={hdrAuditor}
              onChange={(e) => setHdrAuditor(e.target.value)}
            />
          </label>
          <label className="text-sm block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Reference Note</span>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={hdrNote}
              onChange={(e) => setHdrNote(e.target.value)}
            />
          </label>
        </div>
      </Modal>

      {/* Edit Counts Modal: add missing products, correct counts, remove entries */}
      <Modal
        isOpen={editCountsOpen}
        onClose={() => setEditCountsOpen(false)}
        title="Edit Counts / Add Missing Products"
        subtitle="Products already in this session show their count. Fix a number, fill in a missing product, or remove an entry."
        maxWidth="lg"
        fullScreenOnDesktop
        bodyClassName="lg:overflow-hidden"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditCountsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEditedCounts}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-3 lg:space-y-0 lg:h-full lg:flex lg:flex-col lg:gap-3">
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm"
              placeholder="Search products..."
              value={editSearch}
              onChange={(e) => setEditSearch(e.target.value)}
            />
          </div>
          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg lg:max-h-none lg:flex-1 lg:min-h-0 lg:grid lg:grid-cols-2 2xl:grid-cols-3 lg:content-start">
            {products
              .filter((p) => !editSearch.trim() || p.name.toLowerCase().includes(editSearch.trim().toLowerCase()))
              .map((p) => {
                const entry = selectedSession?.entries.find((e) => e.productId === p.id);
                const locked = entry && (entry.decisionStatus === 'awaiting_approval' || entry.decisionStatus === 'applied');
                const removed = editRemove.has(p.id);
                return (
                  <div key={p.id} className={`flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 lg:border-r ${removed ? 'opacity-40' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 break-words leading-snug">{p.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {entry
                          ? locked
                            ? 'Locked — already awaiting approval / applied'
                            : `In session · system said ${entry.systemStock}`
                          : `Not in session · system says ${bookStock(p.id)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number" inputMode="numeric"
                        min="0"
                        disabled={!!locked || removed}
                        placeholder="Count"
                        className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right disabled:bg-slate-100"
                        value={editCounts[p.id] ?? ''}
                        onChange={(e) => setEditCounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      />
                      {entry && !locked && (
                        <button
                          type="button"
                          title={removed ? 'Undo remove' : 'Remove from this session'}
                          onClick={() =>
                            setEditRemove((prev) => {
                              const next = new Set(prev);
                              if (next.has(p.id)) next.delete(p.id);
                              else next.add(p.id);
                              return next;
                            })
                          }
                          className="p-1.5 rounded border border-slate-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
          <p className="text-[11px] text-slate-400">
            Corrected counts keep the system-stock figure captured when the session was created. Entries that are already awaiting
            approval or applied are locked so the approval trail is never rewritten.
          </p>
        </div>
      </Modal>

      {/* Investigation Reason Modal */}
      <Modal
        isOpen={!!reasonModalEntry}
        onClose={() => setReasonModalEntry(null)}
        title="Select Investigation Reason"
        subtitle={reasonModalEntry ? `${reasonModalEntry.entry.productName} — variance ${reasonModalEntry.entry.variance > 0 ? '+' : ''}${reasonModalEntry.entry.variance}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReasonModalEntry(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!reasonModalEntry) return;
                selectInvestigationReason(reasonModalEntry.sessionId, reasonModalEntry.entry.id, {
                  reason: reasonChoice,
                  notes: reasonNotes,
                });
                setReasonModalEntry(null);
              }}
            >
              Save Reason
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Not sure yet? Choose "Unknown / Under Investigation" — this will not force a reason or touch stock.
          </p>
          <select
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={reasonChoice}
            onChange={(e) => setReasonChoice(e.target.value as InvestigationReason)}
          >
            {(Object.entries(REASON_LABELS) as [InvestigationReason, string][]).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            rows={3}
            placeholder="Notes (optional)"
            value={reasonNotes}
            onChange={(e) => setReasonNotes(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
};

// ----------------------------------------------------------------
// Session detail
// ----------------------------------------------------------------

const SessionDetail: React.FC<{
  session: AuditSession;
  products: any[];
  currentRole: string | null;
  currentUserName: string;
  onBack: () => void;
  onEditHeader: () => void;
  onEditCounts: () => void;
  editMessage: string;
  onDelete: () => void;
  pendingTxnsFor: (entryId: string) => any[];
  onConfirmSwap: (entry: VarianceEntry, candidateProductId: number, quantity: number, score: number) => void;
  onRejectSuggestion: (entry: VarianceEntry) => void;
  onKeepSeparate: (entry: VarianceEntry) => void;
  onInvestigate: (entry: VarianceEntry) => void;
  onOpenReasonModal: (entry: VarianceEntry) => void;
  onApprove: (entry: VarianceEntry) => void;
  swapQtyDraft: Record<string, string>;
  setSwapQtyDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}> = ({
  session,
  products,
  currentRole,
  onBack,
  onEditHeader,
  onEditCounts,
  editMessage,
  onDelete,
  pendingTxnsFor,
  onConfirmSwap,
  onRejectSuggestion,
  onKeepSeparate,
  onInvestigate,
  onOpenReasonModal,
  onApprove,
  swapQtyDraft,
  setSwapQtyDraft,
}) => {
  const summary = useMemo(() => buildAuditDashboardSummary(session.entries), [session.entries]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="xs" variant="ghost" leftIcon={<ChevronLeft className="w-4 h-4" />} onClick={onBack}>
          Back
        </Button>
        <div className="flex-1">
          <p className="font-semibold text-sm text-slate-900">
            {session.date} {session.warehouseName ? `· ${session.warehouseName}` : ''}
          </p>
          <p className="text-xs text-slate-500">Auditor: {session.auditorName}{session.referenceNote ? ` · ${session.referenceNote}` : ''}</p>
        </div>
        <Button size="xs" variant="outline" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={onEditHeader}>
          Edit
        </Button>
        <Button size="xs" variant="outline" onClick={onEditCounts}>
          Edit Counts
        </Button>
        <Button size="xs" variant="ghost" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setDeleteConfirm(true)}>
          Delete
        </Button>
      </div>

      {editMessage && (
        <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
          Session updated: {editMessage}
        </div>
      )}

      {session.editLog && session.editLog.length > 0 && (
        <details className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <summary className="cursor-pointer select-none font-medium text-slate-700 flex items-center gap-1.5 inline-flex">
            <History className="w-3.5 h-3.5" /> Change log ({session.editLog.length})
          </summary>
          <ul className="mt-2 space-y-1 text-slate-600">
            {[...session.editLog].reverse().map((l, i) => (
              <li key={i}>
                <span className="text-slate-400">{l.at.slice(0, 16).replace('T', ' ')}</span> · {l.by} — {l.note}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Dashboard summary (spec §11) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryChip label="Matched" value={summary.matched} tone="success" />
        <SummaryChip label="Possible Swaps" value={summary.possibleSwaps} tone="warning" />
        <SummaryChip label="Unresolved" value={summary.unresolved} tone="danger" />
        <SummaryChip label="Approved" value={summary.approvedAdjustments} tone="success" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px] text-slate-600">
        <div className="bg-slate-50 rounded-lg py-2"><span className="font-bold">{summary.totalShortageUnits}</span> total shortage units</div>
        <div className="bg-slate-50 rounded-lg py-2"><span className="font-bold">{summary.totalExcessUnits}</span> total excess units</div>
        <div className="bg-slate-50 rounded-lg py-2"><span className="font-bold text-amber-700">{summary.possibleSubstitutionUnits}</span> possible substitution units</div>
        <div className="bg-slate-50 rounded-lg py-2"><span className="font-bold text-rose-700">{summary.unexplainedVarianceUnits}</span> unexplained variance units</div>
      </div>

      <div className="space-y-2">
        {session.entries
          .filter((e) => e.classification !== 'matched')
          .map((entry) => {
            const suggestions =
              entry.variance < 0 ? findSwapSuggestions({ shortageEntry: entry, allEntries: session.entries, products }) : [];
            const draftKey = entry.id;
            void pendingTxnsFor;

            return (
              <Card key={entry.id}>
                <CardContent className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-slate-900">{entry.productName}</p>
                      <p className="text-xs text-slate-500">
                        System says {entry.systemStock}, physical count is {entry.physicalStock}.
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-base font-bold ${entry.variance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {entry.variance > 0 ? '+' : ''}{entry.variance}
                      </p>
                      {classificationBadge(entry.classification)}
                    </div>
                  </div>

                  {entry.decisionStatus === 'pending' && suggestions.length > 0 && (
                    <div className="space-y-2 border-t border-slate-100 pt-2.5">
                      <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Possible Related Products
                      </p>
                      {suggestions.map((s) => (
                        <div key={s.candidateProductId} className="bg-amber-50/60 border border-amber-200 rounded-lg p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900">{s.candidateProductName}</p>
                            <Badge variant="warning">Possible Match — {s.score}% similarity</Badge>
                          </div>
                          <p className="text-[11px] text-slate-600">{s.explanation}</p>
                          <details className="text-[10px] text-slate-500">
                            <summary className="cursor-pointer select-none">Why this score?</summary>
                            <ul className="mt-1 space-y-0.5 list-disc list-inside">
                              {s.breakdown.map((b) => (
                                <li key={b.factor}>{b.note} ({b.awarded}/{b.weight})</li>
                              ))}
                            </ul>
                          </details>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <input
                              type="number" inputMode="numeric"
                              min="1"
                              max={s.matchedQuantity}
                              className="w-16 border border-amber-300 rounded px-1.5 py-1 text-xs text-right"
                              value={swapQtyDraft[draftKey] ?? String(s.matchedQuantity)}
                              onChange={(e) => setSwapQtyDraft((p) => ({ ...p, [draftKey]: e.target.value }))}
                            />
                            <Button
                              size="xs"
                              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                              onClick={() =>
                                onConfirmSwap(entry, s.candidateProductId, Number(swapQtyDraft[draftKey] ?? s.matchedQuantity) || s.matchedQuantity, s.score)
                              }
                            >
                              Confirm Swap
                            </Button>
                            <Button size="xs" variant="outline" onClick={() => onInvestigate(entry)}>
                              Investigate
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => onRejectSuggestion(entry)}>
                              Reject Suggestion
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button size="xs" variant="ghost" onClick={() => onKeepSeparate(entry)}>
                        Keep as Separate Variance
                      </Button>
                    </div>
                  )}

                  {entry.decisionStatus === 'pending' && suggestions.length === 0 && (
                    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2.5">
                      <Button size="xs" variant="outline" leftIcon={<HelpCircle className="w-3.5 h-3.5" />} onClick={() => onOpenReasonModal(entry)}>
                        Select Reason
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => onInvestigate(entry)}>
                        Under Investigation
                      </Button>
                    </div>
                  )}

                  {entry.decisionStatus === 'investigating' && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                      <p className="text-xs text-slate-500 flex-1">Marked as under investigation{entry.notes ? `: ${entry.notes}` : '.'}</p>
                      <Button size="xs" variant="outline" onClick={() => onOpenReasonModal(entry)}>
                        Select Reason
                      </Button>
                    </div>
                  )}

                  {entry.decisionStatus === 'awaiting_approval' && (
                    <div className="border-t border-slate-100 pt-2.5 space-y-1.5">
                      <p className="text-xs text-slate-600">
                        {entry.confirmedSwapWithProductId
                          ? `Confirmed swap${entry.confirmedSwapQuantity ? ` — ${entry.confirmedSwapQuantity} unit(s)` : ''}, awaiting approval.`
                          : entry.investigationReason
                          ? `Reason: ${REASON_LABELS[entry.investigationReason]} — awaiting approval.`
                          : 'Awaiting approval.'}
                      </p>
                      {currentRole === 'admin' ? (
                        <Button size="xs" leftIcon={<ShieldCheck className="w-3.5 h-3.5" />} onClick={() => onApprove(entry)}>
                          Approve Adjustment
                        </Button>
                      ) : (
                        <p className="text-[11px] text-amber-700">Needs admin approval before stock is updated.</p>
                      )}
                    </div>
                  )}

                  {entry.decisionStatus === 'applied' && (
                    <p className="text-xs text-emerald-700 border-t border-slate-100 pt-2.5">
                      Approved by {entry.approvedBy} on {entry.approvedAt?.slice(0, 10)} — stock ledger updated.
                    </p>
                  )}

                  {(entry.decisionStatus === 'kept_separate' || entry.decisionStatus === 'suggestion_rejected') && (
                    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2.5">
                      <p className="text-xs text-slate-500 flex-1">Kept as a separate, unreconciled variance.</p>
                      <Button size="xs" variant="outline" onClick={() => onOpenReasonModal(entry)}>
                        Select Reason
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        {session.entries.every((e) => e.classification === 'matched') && (
          <Card>
            <CardContent className="text-center text-sm text-emerald-600 py-6">
              Every counted product matched system stock exactly. Nothing to reconcile.
            </CardContent>
          </Card>
        )}
      </div>

      {deleteConfirm && (
        <Modal
          isOpen={deleteConfirm}
          onClose={() => setDeleteConfirm(false)}
          title="Delete Audit Session"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setDeleteConfirm(false);
                  onDelete();
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            This removes the session log. Any already-approved stock ledger entries and product stock changes are
            kept — deleting a session never reverses stock that was already adjusted.
          </p>
        </Modal>
      )}
    </div>
  );
};

const SummaryChip: React.FC<{ label: string; value: number; tone: 'success' | 'warning' | 'danger' }> = ({ label, value, tone }) => {
  const toneClasses = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
  } as const;
  return (
    <div className={`rounded-lg border p-2.5 text-center ${toneClasses[tone]}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[10px]">{label}</p>
    </div>
  );
};
