import React, { useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { money } from '../../utils/billing';
import type { Bill, SalesReturn } from '../../types';
import { SalesReturnModal } from '../common/SalesReturnModal';

/**
 * Every customer return (credit note), newest first: good crates that went back to stock AND
 * scrapped ones. The expiry tracker below only follows scrapped crates, so without this list a
 * return of good crates showed up nowhere except on its own invoice.
 */
export const CustomerReturnsList: React.FC = () => {
  const { bills, cancelSalesReturn } = useLedger();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ bill: Bill; ret: SalesReturn } | null>(null);
  const [cancelling, setCancelling] = useState<{ bill: Bill; ret: SalesReturn } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [showAll, setShowAll] = useState(false);

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
      lines: { name: string; restock: number; scrap: number }[];
    }[] = [];
    for (const b of bills) {
      for (const r of b.returns || []) {
        out.push({
          key: `${b.id}_${r.id}`,
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
          lines: r.lines.map((l) => ({
            name: l.productName,
            restock: Number(l.restockQty) || 0,
            scrap: Number(l.scrapQty) || 0,
          })),
        });
      }
    }
    return out.sort((a, b) => (a.date === b.date ? (a.creditNoteNo < b.creditNoteNo ? 1 : -1) : a.date < b.date ? 1 : -1));
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
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4 space-y-3" aria-label="Customer returns">
      <div className="flex items-start gap-2">
        <Undo2 className="w-4 h-4 text-amber-700 mt-0.5" />
        <div>
          <h3 className="text-sm font-black text-slate-900">All customer returns</h3>
          <p className="hidden sm:block text-[11px] text-slate-500">
            Every return credit note: crates put back in stock and crates scrapped. Scrapped crates are followed
            further down.
          </p>
        </div>
      </div>

      {all.length === 0 ? (
        <p className="text-xs text-slate-600">
          No customer returns yet. Use <strong>Customer return</strong> above, or <strong>Return</strong> on an
          invoice in Sell → Sales history.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[
              ['Returns', String(totals.n)],
              ['Credit given', `₹${money(totals.credit)}`],
              ['Back in stock', `${totals.restock} cs`],
              ['Scrapped', `${totals.scrap} cs`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-slate-50 py-2">
                <div className="text-[10px] font-bold uppercase text-slate-500">{k}</div>
                <div className="text-base font-black text-slate-900 tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <input enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customer, credit note, invoice, product…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {shown.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-4">Nothing matches.</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((r) => (
                <li key={r.key} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-sm font-bold text-slate-900">
                      {r.customer} · {r.creditNoteNo}
                    </span>
                    <span className="text-sm font-black text-rose-700 tabular-nums">−₹{money(r.credit)}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {r.date} · Invoice #{r.billId}
                    {r.reason ? ` · ${r.reason}` : ''}
                    {r.revised ? ` · ${r.revised}` : ''}
                  </div>
                  <ul className="mt-1.5 text-xs text-slate-700 space-y-0.5">
                    {r.lines.map((l, i) => (
                      <li key={i}>
                        {l.name}:{' '}
                        {l.restock > 0 && <span className="text-emerald-700 font-semibold">{l.restock} cs to stock</span>}
                        {l.restock > 0 && l.scrap > 0 && ' · '}
                        {l.scrap > 0 && <span className="text-amber-700 font-semibold">{l.scrap} cs scrapped</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing({ bill: r.bill, ret: r.ret })}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
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
                      className="px-2.5 py-1 rounded-lg border border-rose-300 text-[11px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer"
                    >
                      Cancel return
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {filtered.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
            </button>
          )}
        </>
      )}

      {editing && (
        <SalesReturnModal bill={editing.bill} editReturn={editing.ret} onClose={() => setEditing(null)} />
      )}

      {cancelling && (
        <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3 text-sm">
            <h3 className="font-bold text-slate-900">
              Cancel return {cancelling.ret.creditNoteNo} (invoice #{cancelling.bill.id})
            </h3>
            <p className="text-xs text-slate-600">
              The ₹{money(cancelling.ret.totalCredit)} credit is reversed, so the invoice owes it again. Crates restocked by
              this return leave stock. The credit note stays on the invoice history as cancelled. Money already refunded to
              the customer is not touched.
            </p>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (e.g. return entered by mistake)"
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs"
            />
            {cancelError && <p className="text-xs text-rose-700 font-semibold">{cancelError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelling(null)}
                className="px-3 py-1.5 text-xs font-bold rounded border hover:bg-slate-50 cursor-pointer"
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
                className="px-3 py-1.5 text-xs font-bold rounded bg-rose-600 text-white disabled:opacity-40 cursor-pointer"
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
