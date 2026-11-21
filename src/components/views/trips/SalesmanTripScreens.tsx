import React, { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { Trip } from '../../../types';
import { TripEditScreen } from '../TripEditScreen';
import { TripRecordReturnScreen } from '../TripRecordReturnScreen';
import { notify } from '../../../utils/toast';
import { billNetTotal } from '../../../utils/salesReturns';
import { money, tripCashDue, whatsappLink } from '../../../utils/billing';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useCloseTrip } from './useCloseTrip';
import { useLoadValidator } from './useLoadValidator';

export type SalesmanTripScreenMode = 'edit' | 'settle';

const fmtShortDate = (d?: string) => {
  if (!d) return 'Undated';
  const dt = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

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
  const isPhone = useIsMobile(767);
  const { t } = useLanguage();
  const {
    trips,
    bills,
    products,
    salesmen,
    warehouses,
    warehouseStock,
    saveReturnDraft,
    payments,
  } = useLedger();

  const [closedSummary, setClosedSummary] = useState<{
    id: number;
    sales: number;
    cashIn: number;
    owed: number;
    salesman: string;
    phone?: string;
    route: string;
    date: string;
    vehicle: string;
  } | null>(null);

  // always show the latest saved copy of the trip
  const current = trips.find((t) => Number(t.id) === Number(trip.id)) || trip;

  if (isPhone && closedSummary) {
    const liveClosed = trips.find((x) => Number(x.id) === Number(closedSummary.id));
    const liveDue = liveClosed ? tripCashDue(liveClosed) : closedSummary.owed;
    const shareText = [
      `Trip #${closedSummary.id} (${closedSummary.vehicle || '-'})`,
      closedSummary.route ? `Route: ${closedSummary.route}` : '',
      closedSummary.salesman ? `Salesman: ${closedSummary.salesman}` : '',
      `Date: ${closedSummary.date}`,
      `Sales: ₹${money(closedSummary.sales)}`,
      `Cash in: ₹${money(closedSummary.cashIn)}`,
      liveDue > 0 ? `Owed: ₹${money(liveDue)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return (
      <div className="mw-workspace w-full min-w-0 pb-8 space-y-4">
        <div className="hh-sales-top">
          <div className="hh-sales-top__row">
            <h1 className="hh-sales-top__title truncate">{t('trips.tripClosedHeader', { id: closedSummary.id })}</h1>
            <span className="hh-sales-top__pill shrink-0">{t('trips.closedTag')}</span>
          </div>
        </div>

        <div className="rt-card space-y-4 text-center py-6">
          <div className="mx-auto rt-success-check">
            <Check size={28} strokeWidth={2.6} />
          </div>
          <div>
            <h2 className="text-[22px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
              {t('trips.tripCompleted')}
            </h2>
            <p className="text-[13px] font-medium mt-1 break-words" style={{ color: 'var(--text-2)' }}>
              {[closedSummary.salesman, closedSummary.route, closedSummary.date].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="rt-three pt-2 border-t text-left" style={{ borderColor: 'var(--divider)' }}>
            <div className="rt-three__col">
              <span className="rt-three__label">{t('trips.sales')}</span>
              <span className="rt-three__val">₹{money(closedSummary.sales)}</span>
            </div>
            <div className="rt-three__col">
              <span className="rt-three__label">{t('trips.cashIn')}</span>
              <span className="rt-three__val" style={{ color: 'var(--paid)' }}>₹{money(closedSummary.cashIn)}</span>
            </div>
            <div className="rt-three__col">
              <span className="rt-three__label">{t('trips.owed')}</span>
              <span className="rt-three__val" style={{ color: liveDue > 0 ? 'var(--due)' : 'var(--text)' }}>
                ₹{money(liveDue)}
              </span>
            </div>
          </div>
        </div>

        {liveDue > 0 && (
          <div className="hh-hist-card hh-hist-card--due space-y-1">
            <div className="text-[13.5px] font-extrabold break-words" style={{ color: 'var(--text)' }}>
              {t('trips.salesmanOwes', {
                name: closedSummary.salesman || t('trips.salesman'),
                amt: money(liveDue),
              })}
            </div>
            <div className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>
              {t('trips.cashShortfall')}
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          <a
            href={whatsappLink(closedSummary.phone || '', shareText)}
            target="_blank"
            rel="noopener noreferrer"
            className="rt-btn-outline rt-btn-outline--primary w-full no-underline"
          >
            <Share2 size={16} /> {t('trips.shareTripReport')}
          </a>
          <button
            type="button"
            onClick={() => {
              setClosedSummary(null);
              onClose();
            }}
            className="rt-btn w-full"
          >
            {t('trips.backToTrips')}
          </button>
        </div>
      </div>
    );
  }

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
        if (closeTrip && isPhone) {
          const ids = new Set((current.billIds || []).map(Number));
          const tripSales = bills
            .filter((b) => Number(b.tripId) === Number(tripId) || ids.has(Number(b.id)))
            .reduce((s, b) => s + billNetTotal(b), 0);
          const matchedSm = salesmen.find(
            (s) =>
              (current.salesmanId && s.id === current.salesmanId) ||
              (current.salesman && s.name.trim().toLowerCase() === current.salesman.trim().toLowerCase()),
          );
          const sm = (current.driver || current.salesman || matchedSm?.name || '').trim();
          const phone = (current.driverPhone || current.salesmanPhone || matchedSm?.phone || '').trim() || undefined;
          setClosedSummary({
            id: tripId,
            sales: tripSales,
            cashIn: Number(cashHandedIn) || 0,
            owed: Number(cashShortBooked) || 0,
            salesman: sm,
            phone,
            route: current.route || '',
            date: fmtShortDate(current.date),
            vehicle: current.vehicle || '',
          });
          return;
        }
        onClose();
      }}
      onEditTrip={() => onSwitchMode('edit')}
    />
  );
};

