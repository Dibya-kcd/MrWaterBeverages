import React, { useCallback, useMemo, useState } from 'react';
import { PeriodFilter, periodLabel as periodRangeLabel, rangeForPreset, type PeriodRange } from '../../common/PeriodFilter';
import { BeatSalesDueReport } from '../reports/BeatSalesDueReport';
import { TotalReceiptsReport } from './TotalReceiptsReport';
import { DayWiseReport } from './DayWiseReport';
import { CustomerOverallReport } from './CustomerOverallReport';
import { CustomerReceiptsReport } from '../reports/CustomerReceiptsReport';

type ReportId = 'total' | 'receipts' | 'day' | 'beat' | 'customer';

const SUBTABS: { id: ReportId; label: string }[] = [
  { id: 'total', label: 'Total' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'day', label: 'Day-wise' },
  { id: 'beat', label: 'Beat-wise' },
  { id: 'customer', label: 'Customers' },
];

/**
 * Payments > Reports. Four reports, each with its own Excel / PDF download:
 * total receipts (paid or due), day-wise, beat-wise and customer-wise.
 */
export const PaymentReportsPanel: React.FC = () => {
  const [report, setReport] = useState<ReportId>('total');
  const [range, setRange] = useState<PeriodRange>(() => ({ preset: '7days', ...rangeForPreset('7days') }));
  const inPeriod = useCallback(
    (d: string) => (!range.startDate || d >= range.startDate) && (!range.endDate || d <= range.endDate),
    [range],
  );
  const label = useMemo(() => periodRangeLabel(range), [range]);

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Payment reports"
        className="flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200 text-xs font-semibold overflow-x-auto no-scrollbar"
      >
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={report === t.id}
            onClick={() => setReport(t.id)}
            className={`flex-1 px-3 py-2 rounded-lg whitespace-nowrap cursor-pointer transition-all ${
              report === t.id ? 'bg-[#064e3b] text-white font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {report !== 'customer' && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Period</span>
          <PeriodFilter compact value={range} onChange={setRange} />
        </div>
      )}

      {report === 'total' && <TotalReceiptsReport periodLabel={label} inPeriod={inPeriod} />}
      {report === 'receipts' && <CustomerReceiptsReport periodLabel={label} inPeriod={inPeriod} />}
      {report === 'day' && <DayWiseReport periodLabel={label} inPeriod={inPeriod} />}
      {report === 'beat' && <BeatSalesDueReport periodLabel={label} inPeriod={inPeriod} />}
      {report === 'customer' && <CustomerOverallReport />}
    </div>
  );
};
