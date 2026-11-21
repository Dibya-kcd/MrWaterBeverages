import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, MessageCircle, Pencil, Phone, Receipt, RotateCcw, Trash2, Truck, Warehouse as WarehouseIcon } from 'lucide-react';
import { Trip } from '../../../types';
import { money, whatsappLink } from '../../../utils/billing';
import { useLedger } from '../../../context/LedgerContext';
import { SizeChip } from '../../common/SizeChip';
import { PackIcon } from '../../common/PackIcon';
import { compareProductsInSequence } from '../../../utils/sizeColor';
import { OdiaName } from '../../common/OdiaName';

import { useIsMobile } from '../../../hooks/useIsMobile';
import { useLanguage } from '../../../i18n/LanguageContext';

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
  /** Crates damaged on a product that was also short for another reason (the main reason is then 'broken'). */
  damagedQty?: number;
  /** The missing part of such a product. */
  missing?: { reason: 'short_loaded' | 'sold_not_billed' | 'other'; qty: number; note?: string };
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
  driverPhone?: string;
  salesmanPhone?: string;
  onSettle?: (t: Trip) => void;
  onReopen?: (t: Trip) => void;
  onEdit: (t: Trip) => void;
  onBills: (t: Trip) => void;
  onDelete: (t: Trip) => void;
  onOpenDetail?: (t: Trip) => void;
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
    <div
      className={`rounded-xl px-3 py-2.5 min-w-0 border ${
        highlight
          ? 'bg-emerald-50/90 border-emerald-200/80'
          : 'bg-white/80 border-black/5'
      }`}
    >
      <div className="text-[11px] font-semibold text-slate-500 truncate">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums leading-tight mt-0.5 ${color}`}>{value}</div>
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
  driverPhone,
  salesmanPhone,
  onSettle,
  onReopen,
  onEdit,
  onBills,
  onDelete,
  onOpenDetail,
}) => {
  const resolvedDriverPhone = (driverPhone || trip.driverPhone || '').trim();
  const resolvedSalesmanPhone = (salesmanPhone || trip.salesmanPhone || '').trim();
  const [open, setOpen] = useState(mode === 'active');
  const isPhone = useIsMobile(767);
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
  const cardTone = isActive
    ? oversold.length > 0
      ? 'due'
      : 'warning'
    : shortage > 0
      ? 'due'
      : 'received';
  const iconTone = isActive
    ? oversold.length > 0
      ? 'hh-icon-badge--rose'
      : 'hh-icon-badge--amber'
    : shortage > 0
      ? 'hh-icon-badge--rose'
      : 'hh-icon-badge--green';

  const [historyExpanded, setHistoryExpanded] = useState(false);

  const phoneReasonText = (r: TripCardRow): string | null => {
    if (r.discrepancy === 0) return null;
    if (r.discrepancy < 0) return `Extra ${-r.discrepancy} cs`;
    const parts: string[] = [];
    if (r.missing) {
      if ((r.damagedQty ?? 0) > 0) {
        parts.push(`Damaged ${r.damagedQty}${r.reasonNote ? ` · ${r.reasonNote}` : ''}`);
      }
      parts.push(
        `${REASON_LABEL[r.missing.reason]} · ${r.missing.qty} cs${r.missing.note ? ` · ${r.missing.note}` : ''}`,
      );
    } else if (r.reason) {
      if (r.reason === 'broken') {
        parts.push(`Damaged ${r.discrepancy}${r.reasonNote ? ` · ${r.reasonNote}` : ''}`);
      } else {
        parts.push(`${REASON_LABEL[r.reason]} · ${r.discrepancy} cs${r.reasonNote ? ` · ${r.reasonNote}` : ''}`);
      }
    } else if (r.reasonNote) {
      parts.push(r.reasonNote);
    }
    return parts.length > 0 ? parts.join(' · ') : `Short ${r.discrepancy} cs`;
  };

  if (isPhone) {
    const metaText = [`From ${godownLabel}`, trip.route ? `Beat: ${trip.route}` : 'No beat assigned', personLabel]
      .filter(Boolean)
      .join(' · ');

    if (isActive) {
      return (
        <article className="rt-card space-y-2.5" data-trip-id={trip.id}>
          <button
            type="button"
            onClick={() => (onOpenDetail ? onOpenDetail(trip) : onEdit(trip))}
            className="w-full text-left bg-transparent border-0 p-0 cursor-pointer space-y-2.5"
            style={{ borderRadius: 'var(--r-card)' }}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <span className="rt-trip-icon-badge" aria-hidden="true">
                  <Truck size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15.5px] font-extrabold leading-tight break-words" style={{ color: 'var(--text)' }}>
                    {trip.vehicle || 'Vehicle'}
                  </div>
                  <div className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--text-2)' }}>
                    Trip #{trip.id} · {fmtDate(trip.date)}
                  </div>
                </div>
              </div>
              <span className="rt-trip-pill-onroute shrink-0">On route</span>
            </div>

            <div className="text-[12px] font-medium leading-snug break-words" style={{ color: 'var(--text-2)' }}>
              {metaText}
            </div>

            <div className="border-t pt-2.5 grid grid-cols-3 gap-2" style={{ borderColor: 'var(--divider)' }}>
              <div className="min-w-0">
                <div className="text-[11.5px] font-medium" style={{ color: 'var(--text-2)' }}>Loaded</div>
                <div className="text-[16px] font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: 'var(--text)' }}>
                  {loaded}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11.5px] font-bold" style={{ color: 'var(--received)' }}>Sold (live)</div>
                <div className="text-[16px] font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: 'var(--received)' }}>
                  {sold}
                </div>
                <div className="text-[10.5px] font-semibold leading-tight mt-0.5 break-words" style={{ color: 'var(--received)' }}>
                  {billsCount} {billsCount === 1 ? 'bill' : 'bills'} · ₹{money(soldValue)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11.5px] font-medium" style={{ color: 'var(--text-2)' }}>On van</div>
                <div className="text-[16px] font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: 'var(--text)' }}>
                  {onVan}
                </div>
              </div>
            </div>
          </button>

          {oversold.length > 0 && (
            <div className="rt-notice rt-notice--due">
              {oversold.map((r) => `${r.name} (+${r.sold - r.loaded})`).join(', ')}
            </div>
          )}

          {onSettle && (
            <button type="button" onClick={() => onSettle(trip)} className="rt-btn w-full">
              Settle trip
            </button>
          )}
        </article>
      );
    }

    const sortedRows = [...rows].sort((a, b) =>
      compareProductsInSequence(
        productOf(a.productId) || { name: a.name },
        productOf(b.productId) || { name: b.name },
      ),
    );
    const shortSurplusLabel = surplus > 0 && shortage === 0 ? 'Surplus' : 'Short';
    const shortSurplusVal = shortage > 0 ? shortage : surplus;
    const shortSurplusColor = shortage > 0 ? 'var(--due)' : surplus > 0 ? 'var(--warning)' : 'var(--received)';

    return (
      <article className="rt-card space-y-2.5" data-trip-id={trip.id}>
        <button
          type="button"
          onClick={() => setHistoryExpanded((v) => !v)}
          aria-expanded={historyExpanded}
          className="w-full text-left bg-transparent border-0 p-0 cursor-pointer space-y-2.5"
          style={{ borderRadius: 'var(--r-card)' }}
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <span className="rt-trip-icon-badge" aria-hidden="true">
                <Truck size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15.5px] font-extrabold leading-tight break-words" style={{ color: 'var(--text)' }}>
                  {trip.vehicle || 'Vehicle'}
                </div>
                <div className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--text-2)' }}>
                  Trip #{trip.id} · {fmtDate(trip.date)}
                </div>
              </div>
            </div>
            <span className="rt-trip-pill-completed shrink-0">Completed</span>
          </div>

          <div className="text-[12px] font-medium leading-snug break-words" style={{ color: 'var(--text-2)' }}>
            {metaText}
          </div>

          <div className="grid grid-cols-4 gap-1.5 w-full">
            <div className="rt-trip-tile">
              <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-2)' }}>Loaded</div>
              <div className="text-[15.5px] font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: 'var(--text)' }}>
                {loaded}
              </div>
            </div>
            <div className="rt-trip-tile">
              <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-2)' }}>Sold</div>
              <div className="text-[15.5px] font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: 'var(--received)' }}>
                {sold}
              </div>
              <div className="text-[10.5px] font-medium tabular-nums truncate mt-0.5" style={{ color: 'var(--text-2)' }}>
                ₹{money(soldValue)}
              </div>
            </div>
            <div className="rt-trip-tile">
              <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-2)' }}>Back</div>
              <div className="text-[15.5px] font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: 'var(--text)' }}>
                {returned}
              </div>
            </div>
            <div className="rt-trip-tile">
              <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-2)' }}>{shortSurplusLabel}</div>
              <div className="text-[15.5px] font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: shortSurplusColor }}>
                {shortSurplusVal}
              </div>
            </div>
          </div>
        </button>

        {historyExpanded && (
          <div className="pt-1 space-y-2">
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b text-[11px] font-semibold" style={{ borderColor: 'var(--divider)', color: 'var(--text-2)' }}>
              <span>Product</span>
              <span className="shrink-0">Loaded · Sold · Back · Short</span>
            </div>
            {sortedRows.length === 0 ? (
              <div className="text-[12px] py-1" style={{ color: 'var(--text-2)' }}>Nothing loaded on this trip.</div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                {sortedRows.map((r) => {
                  const reasonLine = phoneReasonText(r);
                  const shortCell = r.discrepancy > 0 ? r.discrepancy : r.discrepancy < 0 ? `+${-r.discrepancy}` : 0;
                  return (
                    <div key={r.productId} className="py-2 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold leading-snug break-words" style={{ color: 'var(--text)' }}>
                          <OdiaName name={r.name} />
                        </div>
                        {reasonLine && (
                          <div className="text-[11.5px] font-medium leading-snug mt-0.5 break-words" style={{ color: 'var(--text-2)' }}>
                            {reasonLine}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-[12.5px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>
                        {r.loaded} · {r.sold} · {r.returned} ·{' '}
                        <span
                          className={r.discrepancy > 0 ? 'font-extrabold' : undefined}
                          style={r.discrepancy > 0 ? { color: 'var(--due)' } : r.discrepancy < 0 ? { color: 'var(--warning)' } : undefined}
                        >
                          {shortCell}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="text-[11.5px] font-medium pt-0.5" style={{ color: 'var(--text-2)' }}>
              {billsCount} {billsCount === 1 ? 'bill' : 'bills'} · ₹{money(soldValue)} sold value
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-0.5">
          {onReopen && (
            <button
              type="button"
              id={`btn-reopen-trip-${trip.id}`}
              onClick={() => onReopen(trip)}
              className="rt-btn-outline rt-btn-outline--primary flex-1"
            >
              Reopen trip
            </button>
          )}
          <button
            type="button"
            onClick={() => onBills(trip)}
            className="rt-trip-act-icon"
            aria-label="Manage bills on this trip"
            title="Bills on this trip"
          >
            <Receipt size={17} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(trip)}
            className="rt-trip-act-icon"
            aria-label="Edit trip"
            title="Edit trip"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(trip)}
            className="rt-trip-act-icon rt-trip-act-icon--danger"
            aria-label="Delete trip"
            title="Delete trip"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <article
      data-card-tone={cardTone}
      className="rounded-2xl border shadow-sm overflow-hidden"
      data-trip-id={trip.id}
    >
      <div className="p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className={`hh-icon-badge ${iconTone}`}>
              <Truck size={19} />
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-slate-900 leading-tight min-w-0 break-words lg:truncate">{trip.vehicle || 'Vehicle'}</div>
              <div className="text-xs text-slate-600 mt-0.5">
                Trip #{trip.id} · {fmtDate(trip.date)}
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              isActive
                ? 'bg-white/85 text-amber-800 border-amber-200'
                : shortage > 0
                  ? 'bg-white/85 text-rose-700 border-rose-200'
                  : 'bg-white/85 text-emerald-800 border-emerald-200'
            }`}
          >
            {isActive ? 'On route' : 'Completed'}
          </span>
        </div>

        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 min-w-0">
            <WarehouseIcon size={13} className="shrink-0" />
            <span className="min-w-0 break-words lg:truncate">From {godownLabel}</span>
          </span>
          <span>{trip.route ? `Beat: ${trip.route}` : 'No beat assigned'}</span>
          {personLabel && <span>{personLabel}</span>}
          {resolvedDriverPhone && (
            <span className="inline-flex items-center gap-1.5">
              <a
                href={`tel:${resolvedDriverPhone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900 no-underline"
                title="Call driver"
              >
                <Phone size={12} /> {resolvedDriverPhone}
              </a>
              <a
                href={whatsappLink(resolvedDriverPhone, `Trip #${trip.id} (${trip.vehicle || 'Van'}) · ${trip.date}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-emerald-600 hover:text-emerald-800 no-underline"
                aria-label={`WhatsApp ${resolvedDriverPhone}`}
                title="Message on WhatsApp"
              >
                <MessageCircle size={12} />
              </a>
            </span>
          )}
          {resolvedSalesmanPhone && resolvedSalesmanPhone !== resolvedDriverPhone && (
            <span className="inline-flex items-center gap-1.5">
              <a
                href={`tel:${resolvedSalesmanPhone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:text-sky-900 no-underline"
                title="Call salesman"
              >
                <Phone size={12} /> {resolvedSalesmanPhone}
              </a>
              <a
                href={whatsappLink(resolvedSalesmanPhone, `Trip #${trip.id} (${trip.vehicle || 'Van'}) · ${trip.date}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-emerald-600 hover:text-emerald-800 no-underline"
                aria-label={`WhatsApp ${resolvedSalesmanPhone}`}
                title="Message on WhatsApp"
              >
                <MessageCircle size={12} />
              </a>
            </span>
          )}
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
          <ul className="bg-white/85 divide-y divide-black/5 rounded-xl border border-black/8 overflow-hidden">
            {rows.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">Nothing loaded on this trip.</li>}
            {[...rows]
              .sort((a, b) =>
                compareProductsInSequence(
                  productOf(a.productId) || { name: a.name },
                  productOf(b.productId) || { name: b.name },
                ),
              )
              .map((r) => {
              const left = isActive ? Math.max(0, r.loaded - r.sold) : r.returned;
              return (
                <li key={r.productId} className="px-3 py-2.5 flex items-start gap-2.5">
                  <PackIcon size="sm" pack={productOf(r.productId)?.pack} name={r.name} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
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
                        {r.discrepancy > 0 && r.missing
                          ? ` · ${r.damagedQty ?? 0} broken, ${r.missing.qty} ${REASON_LABEL[r.missing.reason].toLowerCase()}`
                          : r.discrepancy > 0 && r.reason
                            ? ` · ${REASON_LABEL[r.reason]}`
                            : ''}
                      </span>
                    )}
                    {!isActive && r.discrepancy > 0 && (r.missing?.note || r.reasonNote) && (
                      <span className="text-slate-500 italic">“{r.missing?.note || r.reasonNote}”</span>
                    )}
                  </div>
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
