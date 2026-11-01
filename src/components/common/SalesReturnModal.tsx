import React, { useEffect, useMemo, useState } from 'react';
import { Undo2, Truck, Trash2, Clock } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useLedger } from '../../context/LedgerContext';
import type { Bill, SalesReturn, ScrapAction } from '../../types';
import { money } from '../../utils/billing';
import {
  billBalance,
  billRefundDue,
  buildSalesReturn,
  returnableQtyByProduct,
  soldQtyByProduct,
  returnedQtyByProduct,
} from '../../utils/salesReturns';
import { todayISO } from "../../utils/dateLocal";

interface Props {
  bill: Bill | null;
  onClose: () => void;
  /** When set, the modal corrects this saved return instead of creating a new one. */
  editReturn?: SalesReturn | null;
}

const REASONS = ['Expired stock', 'Damaged / broken in transit', 'Leaking or expired stock', 'Wrong item delivered', 'Customer refused delivery', 'Excess stock returned'];

const toInt = (v: string): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const SalesReturnModal: React.FC<Props> = ({ bill: billProp, onClose, editReturn }) => {
  const { createSalesReturn, editSalesReturn, notify, inventoryBatches } = useLedger();
  // While correcting a return, work on the invoice as it was BEFORE that return, so its crates are
  // available again and the preview shows the true before/after.
  const bill: Bill | null = useMemo(
    () =>
      billProp && editReturn
        ? { ...billProp, returns: (billProp.returns || []).filter((r) => r.id !== editReturn.id) }
        : billProp,
    [billProp, editReturn],
  );
  const [editNote, setEditNote] = useState('');
  const [restock, setRestock] = useState<Record<number, string>>({});
  const [scrap, setScrap] = useState<Record<number, string>>({});
  const [scrapAction, setScrapAction] = useState<Record<number, ScrapAction>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editReturn) return;
    const r: Record<number, string> = {};
    const sc: Record<number, string> = {};
    const act: Record<number, ScrapAction> = {};
    for (const l of editReturn.lines) {
      if (l.restockQty > 0) r[l.productId] = String(l.restockQty);
      if (l.scrapQty > 0) {
        sc[l.productId] = String(l.scrapQty);
        act[l.productId] = l.scrapAction || 'undecided';
      }
    }
    setRestock(r);
    setScrap(sc);
    setScrapAction(act);
    setReason(editReturn.reason || '');
    setEditNote('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editReturn?.id]);

  const rows = useMemo(() => {
    if (!bill) return [];
    const sold = soldQtyByProduct(bill);
    const back = returnedQtyByProduct(bill);
    const left = returnableQtyByProduct(bill);
    const seen = new Set<number>();
    const out: { productId: number; name: string; sold: number; back: number; left: number }[] = [];
    for (const it of bill.items) {
      if (seen.has(it.productId)) continue;
      seen.add(it.productId);
      out.push({ productId: it.productId, name: it.productName, sold: sold[it.productId] || 0, back: back[it.productId] || 0, left: left[it.productId] || 0 });
    }
    return out;
  }, [bill]);

  const lines = useMemo(
    () => rows.map((r) => ({ productId: r.productId, restockQty: toInt(restock[r.productId] || ''), scrapQty: toInt(scrap[r.productId] || ''), scrapAction: scrapAction[r.productId] || ('undecided' as ScrapAction), warehouseId: undefined })),
    [rows, restock, scrap, scrapAction]
  );

  // Batch / expiry of what was sold, so the owner can see how stale the returned crates are.
  const batchInfo = useMemo(() => {
    const out: Record<number, { batches: string; expiry?: string; daysPast?: number }> = {};
    if (!bill) return out;
    const today = todayISO();
    for (const it of bill.items) {
      const nums: string[] = [];
      let earliest: string | undefined;
      for (const a of it.batchAllocations || []) {
        const b = (inventoryBatches || []).find((x) => x.id === a.batchId);
        if (a.batchNumber && !nums.includes(a.batchNumber)) nums.push(a.batchNumber);
        if (b?.expiryDate && (!earliest || b.expiryDate < earliest)) earliest = b.expiryDate;
      }
      if (nums.length === 0 && !earliest) continue;
      const days = earliest ? Math.floor((Date.parse(today) - Date.parse(earliest)) / 86400000) : undefined;
      out[it.productId] = { batches: nums.join(', '), expiry: earliest, daysPast: days };
    }
    return out;
  }, [bill, inventoryBatches]);

  // Live preview using the exact same pricing code the return will be saved with.
  const preview = useMemo(() => {
    if (!bill) return null;
    const res = buildSalesReturn(bill, lines, { id: 'preview', creditNoteNo: 'preview', date: '', reason: '' });
    if ('error' in res) return { error: res.error } as const;
    const after = { ...bill, returns: [...(bill.returns || []), res.value] };
    return { credit: res.value.totalCredit, balance: billBalance(after), refund: billRefundDue(after), before: billBalance(bill) } as const;
  }, [bill, lines]);

  if (!bill) return null;

  const anyEntered = lines.some((l) => l.restockQty > 0 || l.scrapQty > 0);
  const overLimit = rows.find((r) => toInt(restock[r.productId] || '') + toInt(scrap[r.productId] || '') > r.left);

  const submit = () => {
    setError('');
    if (editReturn) {
      const done = editSalesReturn(bill.id, editReturn.id, lines, reason, editNote);
      if ('error' in done) {
        setError(done.error);
        return;
      }
      onClose();
      return;
    }
    const res = createSalesReturn(bill.id, lines, reason);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    const scrapLines = res.value.lines.filter((l) => l.scrapQty > 0);
    const toCo = scrapLines.filter((l) => l.scrapAction === 'company').reduce((n, l) => n + l.scrapQty, 0);
    const out = scrapLines.filter((l) => l.scrapAction === 'discard').reduce((n, l) => n + l.scrapQty, 0);
    const later = scrapLines.filter((l) => l.scrapAction !== 'company' && l.scrapAction !== 'discard').reduce((n, l) => n + l.scrapQty, 0);
    const scrapNote = scrapLines.length
      ? ` Scrapped crates: ${[toCo ? `${toCo} to claim from company` : '', out ? `${out} thrown out` : '', later ? `${later} waiting for your decision (Live stock → Returns)` : ''].filter(Boolean).join(', ')}.`
      : '';
    notify(`Return ${res.value.creditNoteNo} saved: ₹${money(res.value.totalCredit)} credited to invoice #${bill.id}.${scrapNote}`);
    setRestock({});
    setScrap({});
    setScrapAction({});
    setReason('');
    onClose();
  };

  return (
    <Modal
      isOpen={!!bill}
      onClose={onClose}
      title={editReturn ? `Edit return ${editReturn.creditNoteNo} — invoice #${bill.id}` : `Customer return — invoice #${bill.id}`}
      subtitle={bill.retailer}
      icon={<Undo2 size={18} />}
      maxWidth="2xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm font-bold rounded border hover:bg-slate-50 cursor-pointer">
            Close
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!anyEntered || !!overLimit || (!!preview && 'error' in preview) || (!!editReturn && editNote.trim().length < 3)}
            className="px-3 py-1.5 text-sm font-bold rounded bg-sky-600 text-white disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {editReturn ? 'Save correction' : 'Save return'}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          Restocked crates go back on the shelf, in the batch they were sold from. Scrapped crates (expired, leaking, broken) are tracked: send them to the company to claim a credit note, or throw them out. The credit reduces what this customer owes.
        </p>

        <div className="space-y-2.5">
          {rows.map((r) => {
            const sc = toInt(scrap[r.productId] || '');
            const act: ScrapAction = scrapAction[r.productId] || 'undecided';
            const info = batchInfo[r.productId];
            const expired = info?.daysPast !== undefined && info.daysPast >= 0;
            return (
              <div key={r.productId} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 leading-snug">{r.name}</div>
                    <div className="text-[11px] text-slate-500">
                      Sold {r.sold} · Already returned {r.back} · Can return {r.left}
                    </div>
                    {info && (
                      <div className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${expired ? 'text-rose-700' : 'text-slate-500'}`}>
                        <Clock size={11} />
                        {info.batches ? `Batch ${info.batches}` : 'Batch'}
                        {info.expiry ? ` · Exp ${info.expiry}` : ''}
                        {expired ? ` · expired ${info.daysPast}d ago` : ''}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block truncate text-[11px] font-bold text-slate-600">Restock · resell</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={r.left}
                      disabled={r.left === 0}
                      value={restock[r.productId] ?? ''}
                      onChange={(e) => setRestock((p) => ({ ...p, [r.productId]: e.target.value }))}
                      aria-label={`Crates of ${r.name} to restock`}
                      className="mt-0.5 w-full border rounded-xl px-2.5 py-2 text-right disabled:bg-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="block truncate text-[11px] font-bold text-slate-600">Scrap · expired/bad</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={r.left}
                      disabled={r.left === 0}
                      value={scrap[r.productId] ?? ''}
                      onChange={(e) => setScrap((p) => ({ ...p, [r.productId]: e.target.value }))}
                      aria-label={`Crates of ${r.name} to scrap`}
                      className="mt-0.5 w-full border rounded-xl px-2.5 py-2 text-right disabled:bg-slate-100"
                    />
                  </label>
                </div>

                {sc > 0 && (
                  <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-2.5 space-y-1.5">
                    <div className="text-[11px] font-bold text-amber-900">
                      What happens to these {sc} scrapped crate(s)?
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5" role="radiogroup" aria-label="Scrap destination">
                      {([
                        { id: 'company', label: 'Send to company', hint: 'Claim a credit note', icon: Truck },
                        { id: 'discard', label: 'Throw out', hint: 'Write off the loss', icon: Trash2 },
                        { id: 'undecided', label: 'Decide later', hint: 'Keep in godown', icon: Clock },
                      ] as const).map((o) => {
                        const on = act === o.id;
                        const Icon = o.icon;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setScrapAction((p) => ({ ...p, [r.productId]: o.id }))}
                            className={`flex items-center gap-2 text-left px-2.5 py-2 rounded-xl border cursor-pointer transition-colors ${
                              on ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                            }`}
                          >
                            <Icon size={15} className="shrink-0" />
                            <span className="min-w-0">
                              <span className="block text-xs font-bold leading-tight">{o.label}</span>
                              <span className={`block text-[10px] leading-tight ${on ? 'text-emerald-100' : 'text-slate-500'}`}>{o.hint}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <label className="block">
          <span className="text-xs font-bold text-slate-600">Reason</span>
          <input
            list="sales-return-reasons"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Damaged in transit"
            className="mt-1 w-full border rounded px-2 py-1.5"
          />
          <datalist id="sales-return-reasons">
            {REASONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>

        {editReturn && (
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Why is this return being corrected? *</span>
            <input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="e.g. Wrong quantity entered, should be 2 crates"
              className="mt-1 w-full border rounded px-2 py-1.5"
            />
            <span className="block text-[11px] text-slate-500 mt-1">
              Same credit note number is kept. Stock, credit and ledger follow the new quantities.
            </span>
          </label>
        )}

        {overLimit && <p className="text-rose-700 font-semibold">Only {overLimit.left} crate(s) of {overLimit.name} can still be returned.</p>}
        {error && <p className="text-rose-700 font-semibold">{error}</p>}

        {anyEntered && preview && !('error' in preview) && (
          <div className="rounded border bg-slate-50 p-2.5 space-y-0.5">
            <div className="flex justify-between">
              <span>Credit for this return</span>
              <strong>₹{money(preview.credit)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Due on invoice</span>
              <span>
                ₹{money(preview.before)} → <strong>₹{money(preview.balance)}</strong>
              </span>
            </div>
            {preview.refund > 0 && (
              <div className="flex justify-between text-amber-800">
                <span>Refund due to customer</span>
                <strong>₹{money(preview.refund)}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SalesReturnModal;
