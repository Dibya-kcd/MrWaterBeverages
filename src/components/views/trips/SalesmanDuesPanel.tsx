import React, { useMemo, useState } from 'react';
import { Phone, Wallet } from 'lucide-react';
import { Salesman, Trip } from '../../../types';
import { tripCashDue } from '../../../utils/billing';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useLanguage } from '../../../i18n/LanguageContext';

interface SalesmanDuesPanelProps {
  trips: Trip[];
  salesmen: Salesman[];
  onRecover: (tripId: number, amount: number, note?: string) => boolean;
  onWriteOff: (tripId: number) => void;
}

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;

/** Cash shortfalls booked at trip close that the salesman has not yet paid back. */
export const SalesmanDuesPanel: React.FC<SalesmanDuesPanelProps> = ({ trips, salesmen, onRecover, onWriteOff }) => {
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [confirmOff, setConfirmOff] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPhone = useIsMobile(767);
  const { t } = useLanguage();

  const groups = useMemo(() => {
    const byPerson = new Map<string, { name: string; phone?: string; rows: { trip: Trip; due: number }[]; total: number }>();
    for (const t of trips) {
      const due = tripCashDue(t);
      if (due <= 0) continue;
      const matchedSm = salesmen.find((s) => s.id === t.salesmanId);
      const name = t.driver || t.salesman || matchedSm?.name || 'Unassigned';
      const phone = (t.driverPhone || t.salesmanPhone || matchedSm?.phone || '').trim() || undefined;
      const g = byPerson.get(name) || { name, phone, rows: [], total: 0 };
      if (!g.phone && phone) g.phone = phone;
      g.rows.push({ trip: t, due });
      g.total += due;
      byPerson.set(name, g);
    }
    return Array.from(byPerson.values())
      .map((g) => ({ ...g, rows: g.rows.sort((a, b) => Number(a.trip.id) - Number(b.trip.id)) }))
      .sort((a, b) => b.total - a.total);
  }, [trips, salesmen]);

  if (groups.length === 0) return null;
  const grand = groups.reduce((sum, g) => sum + g.total, 0);

  if (isPhone) {
    return (
      <section className="hh-hist-card hh-hist-card--due space-y-2.5" aria-label={t('trips.cashShortfall')}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[14px] font-extrabold" style={{ color: 'var(--text)' }}>
            <Wallet size={16} style={{ color: 'var(--due)' }} />
            <span>{t('trips.cashShortfall')}</span>
          </div>
          <span className="text-[15px] font-extrabold tabular-nums" style={{ color: 'var(--due)' }}>
            {inr(grand)}
          </span>
        </div>
        {error && <p className="text-xs font-bold" style={{ color: 'var(--due)' }}>{error}</p>}
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.name} className="border-t pt-2 space-y-2" style={{ borderColor: 'var(--divider)' }}>
              <div className="flex items-center justify-between gap-2 text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <span>{g.name}</span>
                  {g.phone && (
                    <a
                      href={`tel:${g.phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1 text-[11.5px] font-bold no-underline"
                      style={{ color: 'var(--primary)' }}
                    >
                      <Phone size={12} /> {g.phone}
                    </a>
                  )}
                </div>
                <span className="tabular-nums shrink-0" style={{ color: 'var(--due)' }}>{inr(g.total)}</span>
              </div>
              {g.rows.map(({ trip, due }) => (
                <div key={trip.id} className="space-y-2">
                  <div className="flex items-center justify-between text-[12px]" style={{ color: 'var(--text-2)' }}>
                    <span>Trip #{trip.id} · {trip.date}</span>
                    <span className="font-bold tabular-nums" style={{ color: 'var(--due)' }}>{inr(due)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={amounts[trip.id] ?? ''}
                      onChange={(e) => setAmounts((p) => ({ ...p, [trip.id]: e.target.value }))}
                      placeholder={String(due)}
                      aria-label={`Amount received for trip ${trip.id}`}
                      className="flex-1 min-h-[44px] px-3 rounded-full border text-sm font-bold"
                      style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const raw = amounts[trip.id];
                        const amt = raw === undefined || raw.trim() === '' ? due : Number(raw);
                        if (!Number.isFinite(amt) || amt <= 0 || amt > due + 0.005) {
                          setError(`Enter an amount between 0 and ${inr(due)} for trip #${trip.id}.`);
                          return;
                        }
                        setError(null);
                        if (onRecover(trip.id, amt)) setAmounts((p) => ({ ...p, [trip.id]: '' }));
                      }}
                      className="rt-btn shrink-0"
                    >
                      {t('trips.recordRecovery')}
                    </button>
                    {confirmOff === trip.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          onWriteOff(trip.id);
                          setConfirmOff(null);
                        }}
                        className="rt-btn rt-btn--due shrink-0"
                      >
                        {t('common.confirm')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmOff(trip.id)}
                        className="rt-btn-outline shrink-0"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      data-card-tone="warning"
      className="rounded-2xl border shadow-xs p-4 space-y-3"
      aria-label="Cash owed by salesmen"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-sm font-black text-amber-950">
          <span className="hh-icon-badge hh-icon-badge--sm hh-icon-badge--amber shrink-0">
            <Wallet size={15} />
          </span>
          <span>Cash owed by salesmen</span>
        </div>
        <div className="text-sm font-black text-amber-950 tabular-nums">{inr(grand)}</div>
      </div>
      {error && <p className="text-xs font-bold text-rose-700">{error}</p>}
      {groups.map((g) => (
        <div key={g.name} className="rounded-xl bg-white/85 border border-black/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm font-bold text-slate-900">
            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
              <span>{g.name}</span>
              {g.phone && (
                <a
                  href={`tel:${g.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 no-underline"
                >
                  <Phone size={12} /> {g.phone}
                </a>
              )}
            </div>
            <span className="tabular-nums shrink-0">{inr(g.total)}</span>
          </div>
          {g.rows.map(({ trip, due }) => (
            <div key={trip.id} className="flex flex-wrap items-center gap-2 text-xs border-t border-slate-100 pt-2">
              <span className="font-semibold text-slate-700">
                Trip #{trip.id} · {trip.date}
              </span>
              <span className="font-black text-amber-800">{inr(due)} due</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={amounts[trip.id] ?? ''}
                onChange={(e) => setAmounts((p) => ({ ...p, [trip.id]: e.target.value }))}
                placeholder={String(due)}
                aria-label={`Amount received for trip ${trip.id}`}
                className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
              />
              <button
                type="button"
                onClick={() => {
                  const raw = amounts[trip.id];
                  const amt = raw === undefined || raw.trim() === '' ? due : Number(raw);
                  if (!Number.isFinite(amt) || amt <= 0 || amt > due + 0.005) {
                    setError(`Enter an amount between 0 and ${inr(due)} for trip #${trip.id}.`);
                    return;
                  }
                  setError(null);
                  if (onRecover(trip.id, amt)) setAmounts((p) => ({ ...p, [trip.id]: '' }));
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-bold cursor-pointer"
              >
                Received
              </button>
              {confirmOff === trip.id ? (
                <button
                  type="button"
                  onClick={() => {
                    onWriteOff(trip.id);
                    setConfirmOff(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-700 text-white font-bold cursor-pointer"
                >
                  Confirm write-off
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmOff(trip.id)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-bold cursor-pointer"
                >
                  Write off
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
};
