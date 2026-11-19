import React from 'react';
import { useLedger } from '../../../context/LedgerContext';
import { Trip } from '../../../types';
import { TripEditScreen } from '../TripEditScreen';
import { TripRecordReturnScreen } from '../TripRecordReturnScreen';
import { notify } from '../../../utils/toast';
import { useCloseTrip } from './useCloseTrip';
import { useLoadValidator } from './useLoadValidator';

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
  const { closeTrip: closeTripAndPost } = useCloseTrip();
  const validateLoad = useLoadValidator();
  const {
    trips,
    bills,
    products,
    salesmen,
    warehouses,
    warehouseStock,
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
        validateLoad={validateLoad}
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
      onSaveReturn={(tripId, finalReturn, closeTrip, shortageReasons, cashHandedIn, cashShortBooked, tripExpense) => {
        // A draft is kept apart from the recorded returns and never closes the trip.
        if (closeTrip) {
          const refused = closeTripAndPost({ tripId, returned: finalReturn, shortageReasons, cashHandedIn, cashShortBooked, tripExpense });
          if (refused) return refused; // stay on the screen and show why
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
