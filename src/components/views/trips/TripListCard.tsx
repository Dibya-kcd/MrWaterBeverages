import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Pencil, Receipt, RotateCcw, Trash2, Truck, Warehouse as WarehouseIcon } from 'lucide-react';
import { Trip } from '../../../types';
import { money } from '../../../utils/billing';
import { useLedger } from '../../../context/LedgerContext';
import { SizeChip } from '../../common/SizeChip';
import { sizeStripe } from '../../../utils/sizeColor';
import { OdiaName } from '../../common/OdiaName';

export interface TripCardRow {
  productId: number;
  name: string;
  loaded: number;
  sold: number;
  returned: number;
  discrepancy: number;
  /** Why the product was short when the trip closed (history only). */
  reason?: 'broken' | 'short_loaded' | 'sold_not_billed' | 'other';
  reasonNote?: string;
}

const REASON_LABEL: Record<NonNullable<TripCardRow['reason']>, string> = {
  broken: 'Broken',
  short_loaded: 'Short-loaded',
  sold_not_billed: 'Sold, not billed',
  other: 'Other',
};

interface TripListCardProps {
  trip: Trip;
  mode: 'active' | 'history';
  rows: TripCardRow[];
  billsCount: number;
  soldValue: number;
  godownLabel: string;
  personLabel?: string;
  onSettle?: (t: Trip) => void;
  onReopen?: (t: Trip) => void;
  onEdit: (t: Trip) => void;
  onBills: (t: Trip) => void;
  onDelete: (t: Trip) => void;
}

const fmtDate = (d?: string) => {
  if (!d) return '—';
  const dt = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn'; highlight?: boolean }> = ({
  label,
  value,
  sub,
  tone = 'default',
  highlight,
}) => {
  const color =
    tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className={`rounded-xl px-3 py-2.5 min-w-0 ${highlight ? 'bg-[#e9f1ec]' : 'bg-[#f4f2ed]'}`}>
      <div className="text-[11px] font-semibold text-slate-500 truncate">{label}</div>
      <div className={`text-lg font-bold tabular-nums leading-tight mt-0.5 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
};

/** One trip as a compact, thumb-friendly card. Same card is used for Active and History. */
export const TripListCard: React.FC<TripListCardProps> = ({
  trip,
  mode,
  rows,
  billsCount,
  soldValue,
  godownLabel,
  personLabel,
  onSettle,
  onReopen,
  onEdit,
  onBills,
  onDelete,
}) => {
  const [open, setOpen] = useState(mode === 'active');
  const { products } = useLedger();
  const productOf = (id: number) => products.find((p) => p.id === id);
  const loaded = rows.reduce((s, r) => s + r.loaded, 0);
  const sold = rows.reduce((s, r) => s + r.sold, 0);
  const returned = rows.reduce((s, r) => s + r.returned, 0);
  const shortage = rows.reduce((s, r) => s + Math.max(0, r.discrepancy), 0);
  const surplus = rows.reduce((s, r) => s + Math.max(0, -r.discrepancy), 0);
  // Per product, so one product sold past its load can't hide another still sitting on the van.
  const onVan = rows.reduce((s, r) => s + Math.max(0, r.loaded - r.sold), 0);
  const oversold = rows.filter((r) => r.sold > r.loaded);
  const isActive = mode === 'active';

  return (
    <article className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden" data-trip-id={trip.id}>
      <div className="p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="size-10 rounded-xl bg-[#e9f1ec] text-[var(--primary)] flex items-center justify-center shrink-0">
              <Truck size={19} />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-slate-900 leading-tight truncate">{trip.vehicle || 'Vehicle'}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Trip #{trip.id} · {fmtDate(trip.date)}
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              isActive ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {isActive ? 'On route' : 'Completed'}
          </span>
        </div>

        <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 min-w-0">
            <WarehouseIcon size={13} className="shrink-0" />
            <span className="truncate">From {godownLabel}</span>
          </span>
          <span>{trip.route ? `Beat: ${trip.route}` : 'No beat assigned'}</span>
          {personLabel && <span>{personLabel}</span>}
        </div>

        {/* Numbers */}
        {isActive ? (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Loaded" value={loaded} sub="units" />
            <Stat
              label="Sold (live)"
              value={sold}
              sub={`${money(soldValue)} · ${billsCount} bill${billsCount === 1 ? '' : 's'}`}
              highlight
              tone="good"
            />
            <Stat label="On van" value={onVan} sub="units" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Loaded" value={loaded} />
            <Stat label="Sold" value={sold} tone="good" sub={`${money(soldValue)}`} />
            <Stat label="Back" value={returned} />
            <Stat
              label={surplus > 0 && shortage === 0 ? 'Surplus' : 'Short'}
              value={shortage > 0 ? shortage : surplus}
              tone={shortage > 0 ? 'bad' : surplus > 0 ? 'warn' : 'good'}
            />
          </div>
        )}

        {isActive && oversold.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            Sold more than loaded:{' '}
            {oversold.map((r) => `${r.name} (+${r.sold - r.loaded})`).join(', ')}. Edit the load or check the bills.
          </div>
        )}

        {!isActive && shortage === 0 && surplus === 0 && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={14} /> Balanced
          </div>
        )}

        {/* Breakdown toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between text-xs font-semibold text-slate-600 py-1 cursor-pointer"
          aria-expanded={open}
        >
          <span>
            Products <span className="text-slate-400">· {rows.length}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--primary)]">
            {open ? 'Hide' : 'Show'} breakdown {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </button>

        {open && (
          <ul className="divide-y divide-black/5 rounded-xl border border-black/8 overflow-hidden">
            {rows.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">Nothing loaded on this trip.</li>}
            {rows.map((r) => {
              const left = isActive ? Math.max(0, r.loaded - r.sold) : r.returned;
              return (
                <li key={r.productId} className="px-3 py-2.5" style={sizeStripe(productOf(r.productId)?.volume, r.name)}>
                  <div className="text-[13px] font-semibold text-slate-900 leading-snug break-words">
                    <OdiaName name={r.name} />{' '}
                    <SizeChip volume={productOf(r.productId)?.volume} pack={productOf(r.productId)?.pack} name={r.name} />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-x-3">
                    <span>Loaded <strong className="text-slate-800">{r.loaded}</strong></span>
                    <span>Sold <strong className="text-emerald-700">{r.sold}</strong></span>
                    <span>
                      {isActive ? 'On van' : 'Back'}{' '}
                      <strong className={isActive && left === 0 ? 'text-amber-700' : 'text-slate-800'}>
                        {isActive && left === 0 ? 'sold out' : left}
                      </strong>
                    </span>
                    {isActive && r.sold > r.loaded && (
                      <span className="text-rose-600 font-semibold">Over by {r.sold - r.loaded}</span>
                    )}
                    {!isActive && r.discrepancy !== 0 && (
                      <span className={r.discrepancy > 0 ? 'text-rose-600 font-semibold' : 'text-amber-700 font-semibold'}>
                        {r.discrepancy > 0 ? `Short ${r.discrepancy}` : `Extra ${-r.discrepancy}`}
                        {r.discrepancy > 0 && r.reason ? ` · ${REASON_LABEL[r.reason]}` : ''}
                      </span>
                    )}
                    {!isActive && r.discrepancy > 0 && r.reasonNote && (
                      <span className="text-slate-500 italic">“{r.reasonNote}”</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        {isActive && onSettle && (
          <button
            type="button"
            onClick={() => onSettle(trip)}
            className="flex-1 min-h-11 px-4 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <CheckCircle2 size={16} /> Day-end settlement
          </button>
        )}
        {!isActive && onReopen && (
          <button
            type="button"
            onClick={() => onReopen(trip)}
            id={`btn-reopen-trip-${trip.id}`}
            className="flex-1 min-h-11 px-4 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] shadow-sm"
            title="Reopen trip back to Active to edit load, return, or bill stock"
          >
            <RotateCcw size={16} /> Reopen trip
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit(trip)}
          className={`min-h-11 px-4 rounded-xl border border-black/10 bg-white text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 ${isActive ? '' : 'flex-none'}`}
        >
          <Pencil size={15} /> Edit
        </button>
        <button
          type="button"
          onClick={() => onBills(trip)}
          className="size-11 rounded-xl border border-black/10 bg-white text-slate-600 inline-flex items-center justify-center cursor-pointer hover:bg-slate-50"
          aria-label="Manage bills on this trip"
          title="Bills on this trip"
        >
          <Receipt size={17} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(trip)}
          className="size-11 rounded-xl border border-black/10 bg-white text-rose-600 inline-flex items-center justify-center cursor-pointer hover:bg-rose-50"
          aria-label="Delete trip"
          title="Delete trip"
        >
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
};
