import React, { useMemo, useState } from 'react';
import { Lock, Search, Undo2, X } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { SizeChip } from '../common/SizeChip';
import { money } from '../../utils/billing';
import type { Bill, CancelledSalesReturn, SalesReturn } from '../../types';
import { SalesReturnModal } from '../common/SalesReturnModal';
import { trackedStage } from './ExpiryReturnsTracker';

/**
 * Every customer return (credit note), newest first: good crates that went back to stock AND
 * scrapped ones. The expiry tracker below only follows scrapped crates, so without this list a
 * return of good crates showed up nowhere except on its own invoice.
 */
export const CustomerReturnsList: React.FC = () => {
  const { bills, cancelSalesReturn, products, inventoryDispositions } = useLedger();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ bill: Bill; ret: SalesReturn } | null>(null);
  const [cancelling, setCancelling] = useState<{ bill: Bill; ret: SalesReturn } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  const lockedReturnKeys = useMemo(() => {
    const locked = new Set<string>();
    for (const d of inventoryDispositions) {
      const rt = d.returnTracking;
      if (!rt) continue;
      const stage = trackedStage(d);
      const withCo =
        stage === 'sent' ||
        stage === 'settled' ||
        stage === 'rejected' ||
        d.compensationStatus === 'settled' ||
        d.compensationStatus === 'partial' ||
        d.compensationStatus === 'rejected';
      if (withCo) locked.add(`${rt.sourceBillId}_${rt.sourceReturnId}`);
    }
    return locked;
  }, [inventoryDispositions]);

  const all = useMemo(() => {
    const out: {
      key: string;
      creditNoteNo: string;
      date: string;
      customer: string;
      billId: number;
      bill: Bill;
      ret: SalesReturn;
      revised?: string;
      reason: string;
      credit: number;
      restock: number;
      scrap: number;
      lockedByCompany: boolean;
      lines: { productId: number; name: string; restock: number; scrap: number }[];
    }[] = [];
    for (const b of bills) {
      for (const r of b.returns || []) {
        const key = `${b.id}_${r.id}`;
        out.push({
          key,
          creditNoteNo: r.creditNoteNo,
          date: r.date,
          customer: b.retailer || 'Walk-in',
          billId: b.id,
          bill: b,
          ret: r,
          revised: r.revisedAt ? `corrected ${r.revisedAt.slice(0, 10)}${r.revisionNote ? ': ' + r.revisionNote : ''}` : undefined,
          reason: r.reason,
          credit: Number(r.totalCredit) || 0,
          restock: r.lines.reduce((s, l) => s + (Number(l.restockQty) || 0), 0),
          scrap: r.lines.reduce((s, l) => s + (Number(l.scrapQty) || 0), 0),
          lockedByCompany: lockedReturnKeys.has(key),
          lines: r.lines.map((l) => ({
            productId: l.productId,
            name: l.productName,
            restock: Number(l.restockQty) || 0,
            scrap: Number(l.scrapQty) || 0,
          })),
        });
      }
    }
    return out.sort((a, b) => (a.date === b.date ? (a.creditNoteNo < b.creditNoteNo ? 1 : -1) : a.date < b.date ? 1 : -1));
  }, [bills, lockedReturnKeys]);

  const cancelledList = useMemo(() => {
    const out: { key: string; billId: number; customer: string; ret: CancelledSalesReturn }[] = [];
    for (const b of bills) {
      for (const r of b.cancelledReturns || []) {
        out.push({ key: `${b.id}_${r.id}`, billId: b.id, customer: b.retailer || 'Walk-in', ret: r });
      }
    }
    return out.sort((a, b) => (b.ret.cancelledAt || '').localeCompare(a.ret.cancelledAt || ''));
  }, [bills]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((r) =>
      [r.customer, r.creditNoteNo, `#${r.billId}`, r.reason, ...r.lines.map((l) => l.name)]
        .join(' ')
        .toLowerCase()
        .includes(s),
    );
  }, [all, q]);

  const shown = showAll ? filtered : filtered.slice(0, 10);
  const totals = useMemo(
    () => ({
      n: filtered.length,
      credit: filtered.reduce((s, r) => s + r.credit, 0),
      restock: filtered.reduce((s, r) => s + r.restock, 0),
      scrap: filtered.reduce((s, r) => s + r.scrap, 0),
    }),
    [filtered],
  );

  return (
    <section
      data-card-tone="neutral"
      className="rounded-2xl border shadow-xs p-3.5 sm:p-4 space-y-3"
      aria-label="Customer returns"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--amber shrink-0">
            <Undo2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#0A1F44]">All customer returns</h3>
            <p className="text-xs text-slate-500">
              Customer credit notes: crates put back in stock and scrapped crates tracked below.
            </p>
          </div>
        </div>
        {cancelledList.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCancelled((v) => !v)}
            className="px-2.5 py-1.5 rounded-xl border border-[#DCE5F2] bg-slate-50 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            {showCancelled ? 'Hide' : 'Cancelled'} ({cancelledList.length})
          </button>
        )}
      </div>

      {all.length === 0 ? (
        <p className="text-xs text-slate-600 leading-relaxed">
          No customer returns yet. Use <strong>Customer return</strong> above, or <strong>Return</strong> on an
          invoice in Sell → Sales history.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { k: 'Returns', v: String(totals.n), tone: 'sales', cls: 'text-[#0A1F44]' },
              { k: 'Credit given', v: `₹${money(totals.credit)}`, tone: 'due', cls: 'text-rose-900' },
              { k: 'Back in stock', v: `${totals.restock} cs`, tone: 'received', cls: 'text-emerald-900' },
              { k: 'Scrapped', v: `${totals.scrap} cs`, tone: 'warning', cls: 'text-amber-900' },
            ].map((stat) => (
              <div key={stat.k} data-card-tone={stat.tone} className={`rounded-xl border px-3 py-2.5 shadow-2xs ${stat.cls}`}>
                <div className="text-xs font-semibold opacity-75">{stat.k}</div>
                <div className="text-base sm:text-lg font-extrabold tabular-nums mt-0.5">{stat.v}</div>
              </div>
            ))}
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search customer, credit note, invoice, product…"
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#DCE5F2] bg-slate-50/70 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/25"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQ('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-4">Nothing matches.</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((r) => (
                <li
                  key={r.key}
                  data-card-tone={r.scrap > 0 && r.restock === 0 ? 'warning' : 'sales'}
                  className="rounded-2xl border shadow-xs p-3.5 space-y-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <span className="text-sm font-bold text-[#0A1F44] break-words">
                      {r.customer} · <span className="font-mono text-xs text-slate-600">{r.creditNoteNo}</span>
                    </span>
                    <span className="text-sm font-extrabold text-rose-700 tabular-nums shrink-0">−₹{money(r.credit)}</span>
                  </div>
                  <div className="text-xs text-slate-500 leading-snug">
                    {r.date} · Invoice #{r.billId}
                    {r.reason ? ` · ${r.reason}` : ''}
                    {r.revised ? ` · ${r.revised}` : ''}
                  </div>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {r.lines.map((l, i) => {
                      const prod = products.find((p) => p.id === l.productId);
                      return (
                        <li key={i} className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-900">{l.name}</span>
                          <SizeChip volume={prod?.volume} pack={prod?.pack} name={l.name} />
                          <span className="text-slate-400">:</span>
                          {l.restock > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                              {l.restock} cs to stock
                            </span>
                          )}
                          {l.scrap > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                              {l.scrap} cs scrapped
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {r.lockedByCompany ? (
                    <div className="pt-1 flex items-center gap-1.5 text-xs text-sky-800 bg-sky-50/70 border border-sky-200 rounded-xl px-2.5 py-1.5">
                      <Lock size={12} className="shrink-0" />
                      <span>Scrapped crates already sent/settled with company — reopen in tracker below before editing.</span>
                    </div>
                  ) : (
                    <div className="pt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing({ bill: r.bill, ret: r.ret })}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#DCE5F2] text-xs font-bold text-[#0A1F44] hover:bg-slate-50 cursor-pointer"
                      >
                        Edit return
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCancelReason('');
                          setCancelError('');
                          setCancelling({ bill: r.bill, ret: r.ret });
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        Cancel return
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {filtered.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full min-h-[42px] py-2 rounded-xl border border-[#DCE5F2] text-xs font-bold text-[#0A1F44] hover:bg-slate-50 cursor-pointer"
            >
              {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
            </button>
          )}
        </>
      )}

      {showCancelled && cancelledList.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="text-xs font-bold text-slate-700">Cancelled customer returns (audit history)</div>
          <ul className="space-y-1.5">
            {cancelledList.map((c) => (
              <li key={c.key} className="text-xs text-slate-600 flex flex-wrap justify-between gap-2 border-b border-slate-200/70 pb-1.5 last:border-b-0 last:pb-0">
                <span>
                  <strong className="text-slate-800">{c.ret.creditNoteNo}</strong> · {c.customer} (Inv #{c.billId}) ·{' '}
                  <span className="italic">{c.ret.cancelReason}</span>
                </span>
                <span className="font-mono text-slate-500">₹{money(c.ret.totalCredit)} · {(c.ret.cancelledAt || '').slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <SalesReturnModal bill={editing.bill} editReturn={editing.ret} onClose={() => setEditing(null)} />
      )}

      {cancelling && (
        <div role="dialog" aria-modal="true" aria-label="Cancel return" className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-4 space-y-3 text-sm">
            <h3 className="font-bold text-slate-900">
              Cancel return {cancelling.ret.creditNoteNo} (invoice #{cancelling.bill.id})
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              The ₹{money(cancelling.ret.totalCredit)} credit is reversed, so the invoice owes it again. Crates restocked by
              this return leave stock. The credit note stays on the invoice history as cancelled. Money already refunded to
              the customer is not touched.
            </p>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (e.g. return entered by mistake)"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
            />
            {cancelError && <p className="text-xs text-rose-700 font-semibold">{cancelError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelling(null)}
                className="px-3.5 py-2 text-xs font-bold rounded-xl border hover:bg-slate-50 cursor-pointer"
              >
                Keep return
              </button>
              <button
                type="button"
                disabled={cancelReason.trim().length < 3}
                onClick={() => {
                  const res = cancelSalesReturn(cancelling.bill.id, cancelling.ret.id, cancelReason);
                  if ('error' in res) setCancelError(res.error);
                  else setCancelling(null);
                }}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-rose-600 text-white disabled:opacity-40 cursor-pointer"
              >
                Cancel return
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
