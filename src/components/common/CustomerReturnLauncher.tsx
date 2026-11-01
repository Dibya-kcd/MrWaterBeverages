import React, { useMemo, useState } from 'react';
import { Search, Undo2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useLedger } from '../../context/LedgerContext';
import type { Bill } from '../../types';
import { money } from '../../utils/billing';
import { returnableQtyByProduct } from '../../utils/salesReturns';
import { SalesReturnModal } from './SalesReturnModal';

/** Crates of this invoice that can still come back. 0 for cancelled or fully returned invoices. */
export const returnableCrates = (b: Bill): number => {
  if (b.status === 'cancelled') return 0;
  return Object.values(returnableQtyByProduct(b)).reduce((s, q) => s + q, 0);
};

interface Props {
  /** Render the trigger button. Pass `className` to restyle it. */
  className?: string;
  label?: string;
}

/**
 * "Customer return" button that works from any screen: search the customer or invoice number,
 * pick the invoice, then record the return (restock / scrap -> send to company or throw out).
 */
export const CustomerReturnLauncher: React.FC<Props> = ({
  className = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm cursor-pointer active:scale-[0.99]',
  label = 'Customer return',
}) => {
  const { bills, billingSettings } = useLedger();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Bill | null>(null);

  const prefix = billingSettings?.invoicePrefix || 'INV';

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...bills]
      .filter((b) => b.status !== 'cancelled')
      .filter((b) => {
        if (!term) return true;
        return (
          String(b.id).includes(term) ||
          `${prefix}-${b.id}`.toLowerCase().includes(term) ||
          (b.retailer || '').toLowerCase().includes(term) ||
          (b.phone || '').includes(term)
        );
      })
      .sort((a, b) => b.id - a.id)
      .slice(0, 30);
  }, [bills, q, prefix]);

  const close = () => {
    setOpen(false);
    setQ('');
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Undo2 size={15} /> {label}
      </button>

      <Modal
        isOpen={open}
        onClose={close}
        title="Customer return"
        subtitle="Pick the invoice the customer is returning crates from"
        icon={<Undo2 size={18} />}
        maxWidth="lg"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input enterKeyHint="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search customer, phone or invoice no."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>

          {matches.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">No matching invoices.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[55vh] overflow-y-auto">
              {matches.map((b) => {
                const left = returnableCrates(b);
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      disabled={left === 0}
                      onClick={() => {
                        setPicked(b);
                        close();
                      }}
                      className="w-full text-left rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-amber-50/60 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900 truncate">
                          {prefix}-{b.id} · {b.retailer || 'Cash customer'}
                        </span>
                        <span className="block text-[11px] text-slate-500 truncate">
                          {b.date} · ₹{money(b.total)} · {b.items.map((i) => i.productName).join(', ')}
                        </span>
                      </span>
                      <span className={`shrink-0 text-[11px] font-bold ${left > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                        {left > 0 ? `${left} cs returnable` : 'Fully returned'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      <SalesReturnModal bill={picked} onClose={() => setPicked(null)} />
    </>
  );
};

export default CustomerReturnLauncher;
