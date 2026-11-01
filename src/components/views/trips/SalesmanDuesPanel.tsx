import React, { useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Salesman, Trip } from '../../../types';
import { tripCashDue } from '../../../utils/billing';

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

  const groups = useMemo(() => {
    const byPerson = new Map<string, { name: string; rows: { trip: Trip; due: number }[]; total: number }>();
    for (const t of trips) {
      const due = tripCashDue(t);
      if (due <= 0) continue;
      const name = t.driver || t.salesman || salesmen.find((s) => s.id === t.salesmanId)?.name || 'Unassigned';
      const g = byPerson.get(name) || { name, rows: [], total: 0 };
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

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3" aria-label="Cash owed by salesmen">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-amber-900">
          <Wallet size={16} /> Cash owed by salesmen
        </div>
        <div className="text-sm font-black text-amber-900">{inr(grand)}</div>
      </div>
      {error && <p className="text-xs font-bold text-rose-700">{error}</p>}
      {groups.map((g) => (
        <div key={g.name} className="rounded-xl bg-white border border-amber-100 p-3 space-y-2">
          <div className="flex items-center justify-between text-sm font-bold text-slate-900">
            <span>{g.name}</span>
            <span>{inr(g.total)}</span>
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
