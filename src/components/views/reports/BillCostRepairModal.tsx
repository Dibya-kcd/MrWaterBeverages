import React, { useMemo, useState } from 'react';
import { X, ShieldCheck, Link2, Lock, AlertTriangle, Search, CheckCircle2 } from 'lucide-react';
import { Bill, Product } from '../../../types';
import { useLedger } from '../../../context/LedgerContext';
import { money } from '../../../utils/billing';
import {
  buildBillCostRepairPlan,
  EstimatedCostReason,
  RepairApplyMode,
} from '../../../utils/billCostRepair';

export interface BillCostRepairModalProps {
  open: boolean;
  onClose: () => void;
  filteredBills: Bill[];
  products: Product[];
  periodLabel?: string;
}

const REASON_LABEL: Record<EstimatedCostReason, string> = {
  no_batch: 'No batch recorded',
  van_fallback: 'Van fallback (VAN-)',
  missing_or_zero_batch: 'Missing / ₹0 batch',
};

const REASON_TONE: Record<EstimatedCostReason, string> = {
  no_batch: 'bg-amber-100 text-amber-900 border-amber-200',
  van_fallback: 'bg-sky-100 text-sky-900 border-sky-200',
  missing_or_zero_batch: 'bg-rose-100 text-rose-900 border-rose-200',
};

export const BillCostRepairModal: React.FC<BillCostRepairModalProps> = ({
  open,
  onClose,
  filteredBills,
  products,
  periodLabel,
}) => {
  const { inventoryBatches, warehouses, repairEstimatedBillCosts } = useLedger();
  const [mode, setMode] = useState<RepairApplyMode>('link_and_freeze');
  const [reasonFilter, setReasonFilter] = useState<'all' | EstimatedCostReason>('all');
  const [search, setSearch] = useState('');

  const plan = useMemo(
    () =>
      open
        ? buildBillCostRepairPlan({
            bills: filteredBills,
            products,
            inventoryBatches: inventoryBatches || [],
            warehouses: warehouses || [],
          })
        : {
            lines: [],
            affectedBillCount: 0,
            totalCases: 0,
            linkableLinesCount: 0,
            linkableCases: 0,
            freezeOnlyLinesCount: 0,
            freezeOnlyCases: 0,
          },
    [open, filteredBills, products, inventoryBatches, warehouses],
  );

  const reasonCounts = useMemo(() => {
    const counts: Record<EstimatedCostReason, number> = {
      no_batch: 0,
      van_fallback: 0,
      missing_or_zero_batch: 0,
    };
    for (const l of plan.lines) counts[l.reason] += 1;
    return counts;
  }, [plan.lines]);

  const visibleLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plan.lines.filter((l) => {
      if (reasonFilter !== 'all' && l.reason !== reasonFilter) return false;
      if (!q) return true;
      return (
        String(l.billId).includes(q) ||
        l.retailer.toLowerCase().includes(q) ||
        l.productName.toLowerCase().includes(q) ||
        (l.matchedBatch?.batchNumber || '').toLowerCase().includes(q) ||
        l.existingBatchText.toLowerCase().includes(q)
      );
    });
  }, [plan.lines, reasonFilter, search]);

  if (!open) return null;

  const handleApply = () => {
    if (plan.lines.length === 0) return;
    repairEstimatedBillCosts(plan, mode);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bill-cost-repair-title"
    >
      <div className="bg-white rounded-2xl border border-black/10 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-black/10 flex items-start justify-between gap-3">
          <div>
            <h2 id="bill-cost-repair-title" className="text-base sm:text-lg font-extrabold text-slate-900">
              Preview &amp; Fix Unbatched Bill Costs
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {periodLabel ? `${periodLabel} · ` : ''}
              {plan.affectedBillCount} bill{plan.affectedBillCount === 1 ? '' : 's'} · {plan.lines.length} line
              {plan.lines.length === 1 ? '' : 's'} · {plan.totalCases} cases
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
          {/* Safety Guarantee */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 flex items-start gap-2.5">
            <ShieldCheck size={17} className="shrink-0 text-emerald-700 mt-0.5" />
            <div>
              <span className="font-bold">100% Untouched Financials:</span> Invoice totals, GST (CGST/SGST), tax stamps,
              discounts, customer dues, and payment records will <span className="font-bold">not</span> be changed.
              Only missing cost metadata (<code className="font-mono text-[11px]">costExGst</code> and matching warehouse batch tags) is updated.
            </div>
          </div>

          {plan.lines.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-1.5">
              <CheckCircle2 size={28} className="mx-auto text-emerald-600" />
              <div className="text-sm font-bold text-slate-800">All bills already have saved or batch costs</div>
              <div className="text-xs text-slate-500">No estimated bill lines remain in this period.</div>
            </div>
          ) : (
            <>
              {/* Mode Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setMode('link_and_freeze')}
                  className={`text-left rounded-xl border p-3 transition cursor-pointer ${
                    mode === 'link_and_freeze'
                      ? 'border-sky-500 bg-sky-50/70 ring-1 ring-sky-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                      <Link2 size={14} className="text-sky-600" />
                      Link warehouse batch &amp; freeze cost
                    </span>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    Matches an existing batch from the same godown for{' '}
                    <b>{plan.linkableCases}</b> case{plan.linkableCases === 1 ? '' : 's'} ({plan.linkableLinesCount} line
                    {plan.linkableLinesCount === 1 ? '' : 's'}) and freezes current avg cost on the remaining{' '}
                    <b>{plan.freezeOnlyCases}</b> case{plan.freezeOnlyCases === 1 ? '' : 's'}. Godown stock totals stay identical.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('freeze_only')}
                  className={`text-left rounded-xl border p-3 transition cursor-pointer ${
                    mode === 'freeze_only'
                      ? 'border-sky-500 bg-sky-50/70 ring-1 ring-sky-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                    <Lock size={14} className="text-amber-600" />
                    Freeze current product cost only
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    Leaves all batch allocations untouched and locks today&apos;s ex-GST product cost onto all{' '}
                    <b>{plan.totalCases}</b> cases so future GRN price changes never rewrite past profit.
                  </p>
                </button>
              </div>

              {/* Filter & Search Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {(
                    [
                      { id: 'all', label: `All (${plan.lines.length})` },
                      ...(reasonCounts.no_batch > 0
                        ? [{ id: 'no_batch' as const, label: `No batch (${reasonCounts.no_batch})` }]
                        : []),
                      ...(reasonCounts.van_fallback > 0
                        ? [{ id: 'van_fallback' as const, label: `Van fallback (${reasonCounts.van_fallback})` }]
                        : []),
                      ...(reasonCounts.missing_or_zero_batch > 0
                        ? [
                            {
                              id: 'missing_or_zero_batch' as const,
                              label: `Missing/₹0 batch (${reasonCounts.missing_or_zero_batch})`,
                            },
                          ]
                        : []),
                    ] as { id: 'all' | EstimatedCostReason; label: string }[]
                  ).map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setReasonFilter(chip.id)}
                      className={`px-2.5 py-1 rounded-lg font-semibold border cursor-pointer ${
                        reasonFilter === chip.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter bill #, customer, product..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Affected Lines Preview Table */}
              <div className="rounded-xl border border-black/10 overflow-hidden">
                <div className="overflow-x-auto max-h-[340px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wide sticky top-0 z-10 border-b border-black/10">
                      <tr>
                        <th className="px-3 py-2">Bill &amp; Customer</th>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2 text-right">Cases</th>
                        <th className="px-3 py-2">Why Estimated</th>
                        <th className="px-3 py-2">Action &amp; Cost Ex-GST</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 bg-white">
                      {visibleLines.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                            No matching bill lines.
                          </td>
                        </tr>
                      ) : (
                        visibleLines.map((l) => {
                          const willLink =
                            mode === 'link_and_freeze' &&
                            l.action === 'link_and_freeze' &&
                            l.matchedBatch !== null;
                          const appliedCost = willLink
                            ? l.proposedCostExGst
                            : l.currentAvgCostExGst;
                          const costDiffers =
                            willLink &&
                            Math.abs(appliedCost - l.currentAvgCostExGst) > 0.01;
                          return (
                            <tr key={`${l.billId}-${l.itemIndex}`} className="hover:bg-slate-50/70">
                              <td className="px-3 py-2 align-top whitespace-nowrap">
                                <div className="font-bold text-slate-900">#{l.billId}</div>
                                <div className="text-[11px] text-slate-600 truncate max-w-[160px]" title={l.retailer}>
                                  {l.retailer}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {l.billDate} · {l.warehouseName}
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="font-semibold text-slate-800">{l.productName}</div>
                                <div className="text-[10px] text-slate-400">
                                  Current batch: {l.existingBatchText}
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top text-right font-bold tabular-nums text-slate-900 whitespace-nowrap">
                                {l.netCases} cs
                              </td>
                              <td className="px-3 py-2 align-top whitespace-nowrap">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold ${REASON_TONE[l.reason]}`}
                                >
                                  {REASON_LABEL[l.reason]}
                                </span>
                              </td>
                              <td className="px-3 py-2 align-top">
                                {willLink && l.matchedBatch ? (
                                  <div>
                                    <div className="font-bold text-sky-800">
                                      Link {l.matchedBatch.batchNumber} · ₹{money(appliedCost)}/cs
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {l.matchedBatch.expiryDate ? `Exp ${l.matchedBatch.expiryDate.slice(0, 10)}` : 'No expiry'}
                                      {costDiffers ? ` · avg was ₹${money(l.currentAvgCostExGst)}` : ''}
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-semibold text-amber-800">
                                      Freeze avg ₹{money(appliedCost)}/cs
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      {mode === 'link_and_freeze'
                                        ? 'No batch in this godown — keeps avg cost locked'
                                        : 'Batch field left unchanged'}
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-black/10 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-amber-600 shrink-0" />
            <span>Invoices, GST totals, customer dues &amp; payments remain 100% unchanged.</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={plan.lines.length === 0}
              onClick={handleApply}
              className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-extrabold hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {mode === 'link_and_freeze' ? 'Link & Freeze' : 'Freeze Cost'} ({plan.affectedBillCount} bill
              {plan.affectedBillCount === 1 ? '' : 's'} · {plan.totalCases} cs)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
