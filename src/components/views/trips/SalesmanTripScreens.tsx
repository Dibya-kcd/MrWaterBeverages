import React from 'react';
import { useLedger } from '../../../context/LedgerContext';
import { Trip } from '../../../types';
import { TripEditScreen } from '../TripEditScreen';
import { TripRecordReturnScreen } from '../TripRecordReturnScreen';
import { notify } from '../../../utils/toast';

export type SalesmanTripScreenMode = 'edit' | 'settle';

/**
 * The same load sheet screen the owner uses, but VIEW-ONLY for the salesman (only the owner can change a saved
 * trip), plus the "Record returned stock & close trip" screen so a salesman can finish his own run:
 * enter what came back to the warehouse unsold, enter the cash handed in, and close the trip.
 */
export const SalesmanTripScreens: React.FC<{
  mode: SalesmanTripScreenMode;
  trip: Trip;
  onSwitchMode: (mode: SalesmanTripScreenMode) => void;
  onClose: () => void;
}> = ({ mode, trip, onSwitchMode, onClose }) => {
  const {
    trips,
    bills,
    products,
    salesmen,
    warehouses,
    warehouseStock,
    remainingStock,
    getVehicleStock,
    saveReturn,
    saveReturnDraft,
    updateTrip,
    payments,
  } = useLedger();

  // always show the latest saved copy of the trip
  const current = trips.find((t) => Number(t.id) === Number(trip.id)) || trip;

  if (mode === 'edit') {
    return (
      <TripEditScreen
        trip={current}
        products={products}
        bills={bills}
        salesmen={salesmen}
        warehouses={warehouses}
        warehouseStock={warehouseStock}
        allTrips={trips}
        validateLoad={(t, newLoaded, billed) => {
          // Only products whose load goes up are checked, so older trips can still be edited.
          for (const [pidStr, qty] of Object.entries(newLoaded)) {
            const pid = Number(pidStr);
            const before = Number(t.loaded?.[pid]) || 0;
            if (qty <= before) continue;
            const unsoldOnThisVan = Math.max(0, qty - (billed[pid] || 0));
            const onOtherVans = trips
              .filter((x) => x.status === 'out' && Number(x.id) !== Number(t.id))
              .reduce((sum, x) => sum + getVehicleStock(x, pid).available, 0);
            const free = remainingStock(pid) - onOtherVans;
            if (unsoldOnThisVan > free) {
              const name = products.find((x) => x.id === pid)?.name || `Product #${pid}`;
              return `${name}: only ${Math.max(0, free)} free to load (${onOtherVans} already on other vans), but this van would carry ${unsoldOnThisVan} unsold.`;
            }
          }
          return null;
        }}
        onBack={onClose}
        readOnly
        onSave={() => onClose()}
        onRecordReturn={() => onSwitchMode('settle')}
      />
    );
  }

  return (
    <TripRecordReturnScreen
      trip={current}
      products={products}
      bills={bills}
      warehouses={warehouses}
      payments={payments}
      onBack={onClose}
      onSaveReturn={(tripId, finalReturn, closeTrip, shortageReasons, cashHandedIn, cashShortBooked) => {
        // A draft is kept apart from the recorded returns and never closes the trip.
        if (closeTrip) {
          const saved = saveReturn(tripId, finalReturn, shortageReasons, cashHandedIn, cashShortBooked);
          if (saved.ok === false) return saved.error; // stay on the screen and show why
        } else saveReturnDraft(tripId, finalReturn, cashHandedIn);
        notify(
          closeTrip ? `Trip #${tripId} settled and closed.` : `Trip #${tripId} settlement draft saved.`,
          'success',
        );
        onClose();
      }}
      onEditTrip={() => onSwitchMode('edit')}
    />
  );
};
