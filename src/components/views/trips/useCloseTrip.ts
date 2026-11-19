import { useLedger } from '../../../context/LedgerContext';
import { TripShortageInput } from '../../../types';

/** What the Close Trip screen hands over when the person confirms. */
export interface CloseTripPayload {
  tripId: number;
  /** Good crates going back to the godown, per product. */
  returned: Record<number, number>;
  shortageReasons?: Record<number, TripShortageInput>;
  cashHandedIn?: number | null;
  /** Shortfall booked as owed by the salesman (null = none). */
  cashShortBooked?: number | null;
  /** Fuel / toll / loading paid out of the trip cash. 0 removes an earlier entry on re-close. */
  tripExpense?: { amount: number; note?: string };
}

const MARK = '[Trip close]';

/**
 * Closes a trip through the existing `saveReturn` (which puts good crates back in the godown, writes off
 * broken ones and records the cash handed in / shortfall) and then posts the trip expense to the business
 * ledger. Re-closing a re-opened trip updates the same expense line instead of adding a second one.
 * Returns an error text (nothing saved) or null.
 */
export function useCloseTrip() {
  const { trips, saveReturn, expenses, addExpense, updateExpense, deleteExpense } = useLedger();

  const closeTrip = (p: CloseTripPayload): string | null => {
    const res = saveReturn(p.tripId, p.returned, p.shortageReasons, p.cashHandedIn, p.cashShortBooked);
    if (res.ok === false) return res.error;

    if (p.tripExpense) {
      const trip = trips.find((t) => Number(t.id) === Number(p.tripId));
      const amount = Math.max(0, Math.round((Number(p.tripExpense.amount) || 0) * 100) / 100);
      const existing = expenses.filter(
        (e) => Number(e.tripId) === Number(p.tripId) && (e.note || '').startsWith(MARK),
      );
      const note = `${MARK} Fuel / toll / loading${p.tripExpense.note ? ` — ${p.tripExpense.note}` : ''}`;
      if (amount > 0) {
        const date = trip?.date || new Date().toISOString().slice(0, 10);
        const label = `Trip #${p.tripId}${trip?.vehicle ? ` (${trip.vehicle})` : ''}`;
        if (existing[0]) {
          updateExpense(existing[0].id, { amount, date, note, tripLabel: label });
          existing.slice(1).forEach((e) => deleteExpense(e.id));
        } else {
          addExpense({ date, category: 'transport', amount, mode: 'cash', note, tripId: p.tripId, tripLabel: label });
        }
      } else {
        existing.forEach((e) => deleteExpense(e.id));
      }
    }
    return null;
  };

  /** Trip expense already posted for this trip (shown when a closed trip is opened). */
  const postedTripExpense = (tripId: number): number =>
    expenses
      .filter((e) => Number(e.tripId) === Number(tripId) && (e.note || '').startsWith(MARK))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return { closeTrip, postedTripExpense };
}
