import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, ChevronRight } from 'lucide-react';
import { OVERSOLD_REASONS, type OversoldItem, type ReassignSummary } from '../../utils/oversoldDiagnostic';
import { useIsMobile } from '../../hooks/useIsMobile';

interface Props {
  items: OversoldItem[];
  /** Product to show first (from a card's "Inspect Bills" button). */
  initialProductId?: number;
  initialWarehouseId?: string;
  onClose: () => void;
  /** Only the owner login may post stock adjustments. */
  isAdmin?: boolean;
  /** Posts one audit adjustment per godown that brings each listed book balance to 0. */
  onClearDeficits?: (items: OversoldItem[], reason: string) => void;
  /** Dry-run or apply a godown move for the selected bills (owner only when applying). */
  onReassign?: (args: { productId: number; fromWarehouseId: string; toWarehouseId: string; billIds: number[]; dryRun?: boolean }) => ReassignSummary;
  onUndoReassign?: () => { ok: boolean; restoredBills: number; error?: string };
  hasUndo?: boolean;
  /** Optional navigation helpers for phone bottom sheet actions. */
  onStartAudit?: (warehouseId?: string) => void;
  onGoTransfer?: (productId: number, fromWarehouseId?: string, toWarehouseId?: string) => void;
}

const keyOf = (i: Pick<OversoldItem, 'productId' | 'warehouseId'>) => `${i.productId}|${i.warehouseId}`;

/** Read-only inspector: explains each negative (product x godown) book balance and the bills behind it. Changes nothing. */
export const OversoldInspectorModal: React.FC<Props> = ({
  items,
  initialProductId,
  initialWarehouseId,
  onClose,
  isAdmin,
  onClearDeficits,
  onReassign,
  onUndoReassign,
  hasUndo,
  onStartAudit,
  onGoTransfer,
}) => {
  const isPhone = useIsMobile(767);
  const first =
    items.find((i) => i.productId === initialProductId && (!initialWarehouseId || i.warehouseId === initialWarehouseId)) ||
    items[0];
  const [selected, setSelected] = useState<string | undefined>(first ? keyOf(first) : undefined);
  const [phoneAction, setPhoneAction] = useState<'clear' | 'move' | 'reassign'>('clear');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const item = items.find((i) => keyOf(i) === selected) || items[0];
  // 'one' = clear just the selected godown, 'all' = every oversold godown. Needs a reason + a second click.
  const [confirm, setConfirm] = useState<'one' | 'all' | null>(null);
  const [reason, setReason] = useState('');
  const canClear = !!isAdmin && !!onClearDeficits;
  const target = confirm === 'all' ? items : item ? [item] : [];

  // ── Advanced: reassign mis-tagged bills ──
  const [toWh, setToWh] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [moveConfirm, setMoveConfirm] = useState(false);
  const [moveMsg, setMoveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const itemKey = item ? keyOf(item) : '';
  useEffect(() => {
    setPicked([]);
    setMoveConfirm(false);
    setToWh(item?.targets.find((t) => t.availableCases > 0)?.warehouseId || item?.targets[0]?.warehouseId || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);
  const preview =
    item && onReassign && toWh && picked.length > 0
      ? onReassign({ productId: item.productId, fromWarehouseId: item.warehouseId, toWarehouseId: toWh, billIds: picked, dryRun: true })
      : null;
  const tgt = item?.targets.find((t) => t.warehouseId === toWh);
  const moved = preview?.ok ? preview.movedCases : 0;
  const tgtAfter = tgt ? tgt.bookBalance - moved : 0;
  const blocked = !preview?.ok || moved <= 0 || tgtAfter < 0;
  const doMove = () => {
    if (!item || !onReassign || blocked) return;
    const r = onReassign({ productId: item.productId, fromWarehouseId: item.warehouseId, toWarehouseId: toWh, billIds: picked });
    setMoveMsg(r.ok ? { ok: true, text: `Moved ${r.movedCases} cs on ${r.perBill.length} bill(s).` } : { ok: false, text: r.error || 'Could not move.' });
    setMoveConfirm(false);
    setPicked([]);
  };
  const apply = () => {
    if (!canClear || !reason || target.length === 0) return;
    onClearDeficits!(target, reason);
    setConfirm(null);
    setReason('');
  };

  if (isPhone) {
    const bestTarget = item?.targets.find((t) => t.availableCases > 0) || item?.targets[0];
    return (
      <div className="rt-bsheet-scrim" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Oversold inspector"
          className="rt-bsheet"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="hh-grab" />
          <div className="space-y-0.5">
            <h3 className="text-[18px] font-extrabold text-slate-900 leading-tight">
              Oversold inspector
            </h3>
            {item ? (
              <p className="text-[12.5px] font-medium text-slate-500">
                {item.productName} · {item.warehouseName} · book balance {item.bookBalance} cs
              </p>
            ) : (
              <p className="text-[12.5px] text-slate-500">No oversold godowns right now.</p>
            )}
          </div>

          {items.length > 1 && item && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {items.map((i) => {
                const active = keyOf(i) === keyOf(item);
                return (
                  <button
                    key={keyOf(i)}
                    type="button"
                    onClick={() => {
                      setSelected(keyOf(i));
                      setConfirm(null);
                      setReason('');
                    }}
                    className={`hh-inv-chip-compact shrink-0 border cursor-pointer ${
                      active
                        ? 'bg-[#2864d9] text-white border-[#2864d9]'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {i.productName} ({i.bookBalance} cs)
                  </button>
                );
              })}
            </div>
          )}

          {item && (
            <>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setPhoneAction('clear')}
                  className={`w-full text-left rounded-2xl bg-white p-3.5 transition-colors cursor-pointer ${
                    phoneAction === 'clear'
                      ? 'border-[1.5px] border-[#2864d9]'
                      : 'border border-slate-200'
                  }`}
                >
                  <div className="text-[14px] font-bold text-slate-900">
                    Clear the deficit with an audit
                  </div>
                  <div className="text-[12px] text-slate-500 mt-0.5 leading-snug">
                    Recommended. Count the godown and post the difference.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPhoneAction('move')}
                  className={`w-full text-left rounded-2xl bg-white p-3.5 transition-colors cursor-pointer ${
                    phoneAction === 'move'
                      ? 'border-[1.5px] border-[#2864d9]'
                      : 'border border-slate-200'
                  }`}
                >
                  <div className="text-[14px] font-bold text-slate-900">
                    Move from another godown
                  </div>
                  <div className="text-[12px] text-slate-500 mt-0.5 leading-snug">
                    {bestTarget
                      ? `Same product in ${bestTarget.warehouseName}: ${bestTarget.availableCases} cs available`
                      : 'No stock available in other godowns'}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPhoneAction('reassign')}
                  className={`w-full text-left rounded-2xl bg-white p-3.5 transition-colors cursor-pointer ${
                    phoneAction === 'reassign'
                      ? 'border-[1.5px] border-[#2864d9]'
                      : 'border border-slate-200'
                  }`}
                >
                  <div className="text-[14px] font-bold text-slate-900">
                    Reassign mis-tagged bills
                  </div>
                  <div className="text-[12px] text-slate-500 mt-0.5 leading-snug">
                    Advanced. Bills sold from the wrong godown.
                  </div>
                </button>
              </div>

              {phoneAction === 'clear' && (
                <>
                  {!canClear && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-amber-900">
                      Owner login required to post stock adjustments.
                    </div>
                  )}

                  {canClear && confirm !== null && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2.5">
                      <p className="text-[12px] font-bold text-slate-800">
                        Confirm: set {target.length === 1 ? `${item.productName} (${item.warehouseName})` : `all ${target.length} oversold balances`} to 0 cs
                      </p>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        aria-label="Reason for the adjustment"
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px] font-medium"
                      >
                        <option value="">Choose reason…</option>
                        {OVERSOLD_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setConfirm(null); setReason(''); }}
                          className="hh-inv-btn-outline flex-1"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!reason}
                          onClick={apply}
                          className="hh-inv-btn-primary flex-1"
                        >
                          Post audit
                        </button>
                      </div>
                    </div>
                  )}

                  {confirm === null && (
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (onStartAudit) {
                            onStartAudit(item.warehouseId);
                            onClose();
                          } else if (canClear) {
                            setConfirm('one');
                          }
                        }}
                        className="hh-inv-btn-primary w-full"
                      >
                        Start audit
                      </button>
                      {canClear && (
                        <button
                          type="button"
                          onClick={() => setConfirm('one')}
                          className="w-full text-center text-[12.5px] font-bold text-[#2864d9] py-1 min-h-0 cursor-pointer"
                        >
                          Or clear {item.bookBalance} → 0 cs immediately
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {phoneAction === 'move' && (
                <div className="space-y-2.5">
                  <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                    {item.targets.map((t) => (
                      <div key={t.warehouseId} className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
                        <span className="font-semibold text-slate-800">{t.warehouseName}</span>
                        <span className="font-bold text-slate-900 tabular-nums">{t.availableCases} cs available</span>
                      </div>
                    ))}
                    {item.targets.length === 0 && (
                      <div className="px-3.5 py-3 text-[12.5px] text-slate-500">No other godown available.</div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!bestTarget || bestTarget.availableCases <= 0}
                    onClick={() => {
                      if (bestTarget && onGoTransfer) {
                        onGoTransfer(item.productId, bestTarget.warehouseId, item.warehouseId);
                        onClose();
                      }
                    }}
                    className="hh-inv-btn-primary w-full"
                  >
                    <span>Move stock in Transfer</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {phoneAction === 'reassign' && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5">
                  <p className="text-[12px] text-slate-600 leading-snug">
                    Select bills mistakenly tagged to {item.warehouseName} to move their batch link to another godown.
                  </p>
                  {!isAdmin || !onReassign ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900">
                      Owner login required.
                    </div>
                  ) : (
                    <>
                      <label className="hh-inv-field">
                        <span className="hh-inv-field__label">Move to godown</span>
                        <select
                          value={toWh}
                          onChange={(e) => { setToWh(e.target.value); setMoveConfirm(false); }}
                        >
                          {item.targets.map((t) => (
                            <option key={t.warehouseId} value={t.warehouseId}>
                              {t.warehouseName} ({t.bookBalance} cs)
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                        {item.bills.map((b) => (
                          <label key={b.billId} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={picked.includes(b.billId)}
                              onChange={(e) => {
                                setMoveConfirm(false);
                                setPicked((p) => (e.target.checked ? [...p, b.billId] : p.filter((x) => x !== b.billId)));
                              }}
                            />
                            <span className="font-bold text-slate-900">#{b.billId}</span>
                            <span className="flex-1 min-w-0 truncate text-slate-700">{b.retailer}</span>
                            <span className="font-bold tabular-nums">{b.qtyDeducted} cs</span>
                          </label>
                        ))}
                        {item.bills.length === 0 && (
                          <div className="px-3 py-2.5 text-[12px] text-slate-500">
                            No active bill is behind this deficit.
                          </div>
                        )}
                      </div>
                      {preview && (
                        <div className="rounded-xl bg-slate-50 p-2.5 text-[12px] space-y-1">
                          {preview.ok ? (
                            <>
                              <div>{item.warehouseName}: <b>{item.bookBalance} → {item.bookBalance + moved} cs</b></div>
                              <div className={tgtAfter < 0 ? 'text-rose-700 font-bold' : ''}>
                                {tgt?.warehouseName}: <b>{tgt?.bookBalance} → {tgtAfter} cs</b>
                              </div>
                            </>
                          ) : (
                            <div className="text-rose-700 font-semibold">{preview.error}</div>
                          )}
                        </div>
                      )}
                      {moveMsg && (
                        <p className={`text-[12px] font-semibold ${moveMsg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {moveMsg.text}
                        </p>
                      )}
                      {!moveConfirm ? (
                        <button type="button" disabled={blocked} onClick={() => setMoveConfirm(true)} className="hh-inv-btn-primary w-full">
                          Move selected bills
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setMoveConfirm(false)} className="hh-inv-btn-outline flex-1">
                            Cancel
                          </button>
                          <button type="button" onClick={doMove} className="hh-inv-btn-primary flex-1">
                            Confirm move
                          </button>
                        </div>
                      )}
                      {isAdmin && hasUndo && onUndoReassign && (
                        <button
                          type="button"
                          onClick={() => {
                            const r = onUndoReassign();
                            setMoveMsg({ ok: r.ok, text: r.ok ? `Undone on ${r.restoredBills} bill(s).` : r.error || 'Could not undo.' });
                          }}
                          className="hh-inv-btn-outline w-full"
                        >
                          Undo last godown move
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Oversold godown inspector"
        className="w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-rose-100 bg-rose-50 px-4 py-3">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <AlertTriangle size={16} /> Oversold godown inspector ({items.length})
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-rose-800 hover:bg-rose-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {!item ? (
          <p className="p-6 text-sm text-slate-600">No oversold godowns right now.</p>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-1.5">
              {items.map((i) => (
                <button
                  key={keyOf(i)}
                  type="button"
                  onClick={() => setSelected(keyOf(i))}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                    keyOf(i) === keyOf(item) ? 'border-rose-600 bg-rose-600 text-white' : 'border-rose-200 bg-white text-rose-800'
                  }`}
                >
                  {i.productName} · {i.warehouseName} · {i.bookBalance} cs
                </button>
              ))}
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {item.productName} in {item.warehouseName}
              </h3>
              <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                {[
                  ['Inward (batches)', item.inwardCases],
                  ['Audit / ledger adj', item.auditLedgerAdjCases],
                  ['Restocked returns', item.restockedCases],
                  ['Disposed', -item.disposedCases],
                  ['Sold (active bills)', -item.totalSoldCases],
                ].map(([label, v]) => (
                  <div key={label as string} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-bold text-slate-900">{v as number} cs</dd>
                  </div>
                ))}
                <div className="rounded-lg bg-rose-50 px-2.5 py-1.5">
                  <dt className="text-rose-700">Book balance</dt>
                  <dd className="font-bold text-rose-800">{item.bookBalance} cs</dd>
                </div>
              </dl>
              <p className="mt-1.5 text-[11px] text-slate-500">Short by {item.shortfallCases} cs. Looking at this screen changes nothing.</p>
            </div>


            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <h4 className="text-xs font-bold text-emerald-900">Recommended: clear the book deficit with an audit</h4>
              <p className="text-[11px] text-emerald-900/80">
                Posts one audit adjustment that brings only {item.productName} in {item.warehouseName} from {item.bookBalance} to 0 cs. Every other
                godown&apos;s stock, and all bills, dues and payments, stay exactly as they are.
              </p>
              {!canClear ? (
                <p className="text-[11px] font-semibold text-amber-800">Owner login required to post stock adjustments.</p>
              ) : confirm === null ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setConfirm('one')} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800 cursor-pointer">
                    Clear Book Deficit to 0 via Audit ({item.bookBalance} → 0 cs)
                  </button>
                  {items.length > 1 && (
                    <button type="button" onClick={() => setConfirm('all')} className="rounded-lg border border-emerald-700 bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer">
                      Clear All Oversold Deficits via Audit ({items.length})
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 rounded-lg bg-white p-2.5 border border-emerald-200">
                  <p className="text-[11px] font-semibold text-slate-800">Confirm: these balances will be set to 0 cs</p>
                  <ul className="text-[11px] text-slate-700 max-h-28 overflow-y-auto">
                    {target.map((t) => (
                      <li key={keyOf(t)}>
                        {t.productName} · {t.warehouseName}: {t.bookBalance} → 0 cs (+{t.shortfallCases})
                      </li>
                    ))}
                  </ul>
                  <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for the adjustment" className="w-full h-9 px-2 rounded-lg border border-slate-300 bg-white text-[11px]">
                    <option value="">Choose the reason…</option>
                    {OVERSOLD_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button type="button" disabled={!reason} onClick={apply} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40 cursor-pointer">
                      Confirm and post audit
                    </button>
                    <button type="button" onClick={() => { setConfirm(null); setReason(''); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800">Bills that took stock from this godown ({item.bills.length})</h4>
              <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">Bill</th>
                      <th className="px-2 py-1.5">Date</th>
                      <th className="px-2 py-1.5">Retailer</th>
                      <th className="px-2 py-1.5">Trip</th>
                      <th className="px-2 py-1.5 text-right">Cases</th>
                      <th className="px-2 py-1.5">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {item.bills.map((b) => (
                      <tr key={b.billId}>
                        <td className="px-2 py-1.5 font-semibold">#{b.billId}</td>
                        <td className="px-2 py-1.5">{b.billDate}</td>
                        <td className="px-2 py-1.5">{b.retailer}</td>
                        <td className="px-2 py-1.5">{b.tripId ?? '-'}</td>
                        <td className="px-2 py-1.5 text-right font-bold">{b.qtyDeducted}</td>
                        <td className="px-2 py-1.5">
                          {b.allocationSource === 'batch'
                            ? `Batch ${b.batchLabels.join(', ')}`
                            : b.allocationSource === 'mixed'
                              ? `Batch ${b.batchLabels.join(', ')} + bill godown`
                              : 'Bill godown tag'}
                        </td>
                      </tr>
                    ))}
                    {item.bills.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-2 py-3 text-slate-500">
                          No active bill is behind this deficit (it comes from audits, disposals or the in-progress cart).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800">Same product in other godowns</h4>
              <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2 text-[11px]">
                {item.targets.map((t) => (
                  <li key={t.warehouseId} className="flex justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <span>{t.warehouseName}</span>
                    <span className="font-bold">{t.availableCases} cs available</span>
                  </li>
                ))}
                {item.targets.length === 0 && <li className="text-slate-500">No other godown.</li>}
              </ul>
            </div>

            <details className="rounded-xl border border-slate-200 bg-white" onToggle={() => { setMoveConfirm(false); setMoveMsg(null); }}>
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold text-slate-700">Advanced: Reassign Mis-tagged Bills</summary>
              <div className="space-y-2.5 border-t border-slate-100 p-3">
                <p className="text-[11px] text-slate-600">
                  Use only if these bills were really supplied from another godown. Only the batch link of {item.productName} changes. Invoice totals, GST,
                  costs, payments, dues and the ledger stay exactly as they are. Bills without a godown tag are skipped.
                </p>
                {!isAdmin || !onReassign ? (
                  <p className="text-[11px] font-semibold text-amber-800">Owner login required.</p>
                ) : (
                  <>
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Move to godown
                      <select value={toWh} onChange={(e) => { setToWh(e.target.value); setMoveConfirm(false); }} className="mt-1 w-full h-9 px-2 rounded-lg border border-slate-300 bg-white text-[11px]">
                        {item.targets.map((t) => (
                          <option key={t.warehouseId} value={t.warehouseId}>
                            {t.warehouseName} ({t.bookBalance} cs)
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {item.bills.map((b) => (
                        <label key={b.billId} className="flex items-center gap-2 px-2 py-1.5 text-[11px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={picked.includes(b.billId)}
                            onChange={(e) => { setMoveConfirm(false); setPicked((p) => (e.target.checked ? [...p, b.billId] : p.filter((x) => x !== b.billId))); }}
                          />
                          <span className="font-semibold">#{b.billId}</span>
                          <span className="flex-1 min-w-0 break-words lg:truncate">{b.retailer}</span>
                          <span className="font-bold">{b.qtyDeducted} cs</span>
                        </label>
                      ))}
                    </div>
                    {preview && (
                      <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] space-y-1">
                        {preview.ok ? (
                          <>
                            <div>
                              {item.warehouseName}: <b>{item.bookBalance} → {item.bookBalance + moved} cs</b>
                            </div>
                            <div className={tgtAfter < 0 ? 'text-rose-700 font-bold' : ''}>
                              {tgt?.warehouseName}: <b>{tgt?.bookBalance} → {tgtAfter} cs</b>
                              {tgtAfter < 0 && ' (would become oversold, so this move is blocked)'}
                            </div>
                          </>
                        ) : (
                          <div className="text-rose-700 font-semibold">{preview.error}</div>
                        )}
                        {preview.skipped.map((sk) => (
                          <div key={sk.billId} className="text-amber-800">Skipped #{sk.billId}: {sk.reason}</div>
                        ))}
                      </div>
                    )}
                    {!moveConfirm ? (
                      <button type="button" disabled={blocked} onClick={() => setMoveConfirm(true)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40 cursor-pointer">
                        Move Selected Bills to Another Godown
                      </button>
                    ) : (
                      <div className="rounded-lg border border-slate-300 bg-white p-2.5 space-y-2">
                        <p className="text-[11px] text-slate-800">
                          Confirm: move {moved} cs of {item.productName} from {item.warehouseName} to {tgt?.warehouseName} on {preview?.perBill.length} bill(s). You can undo this afterwards.
                        </p>
                        <div className="flex gap-2">
                          <button type="button" onClick={doMove} className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer">Confirm and move</button>
                          <button type="button" onClick={() => setMoveConfirm(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">Cancel</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {moveMsg && <p className={`text-[11px] font-semibold ${moveMsg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{moveMsg.text}</p>}
                {isAdmin && hasUndo && onUndoReassign && (
                  <button
                    type="button"
                    onClick={() => { const r = onUndoReassign(); setMoveMsg({ ok: r.ok, text: r.ok ? `Undone on ${r.restoredBills} bill(s).` : r.error || 'Could not undo.' }); }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    Undo last godown move
                  </button>
                )}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
};
