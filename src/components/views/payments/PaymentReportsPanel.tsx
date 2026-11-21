import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PeriodFilter, periodLabel as periodRangeLabel, rangeForPreset, type PeriodRange } from '../../common/PeriodFilter';
import { BeatSalesDueReport } from '../reports/BeatSalesDueReport';
import { TotalReceiptsReport } from './TotalReceiptsReport';
import { DayWiseReport } from './DayWiseReport';
import { CustomerOverallReport } from './CustomerOverallReport';
import { CustomerReceiptsReport } from '../reports/CustomerReceiptsReport';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useLanguage } from '../../../i18n/LanguageContext';

type ReportId = 'total' | 'receipts' | 'day' | 'beat' | 'customer';

const SUBTABS: { id: ReportId; labelKey: string; desktopLabel: string }[] = [
  { id: 'total', labelKey: 'pay.tabTotal', desktopLabel: 'Total' },
  { id: 'receipts', labelKey: 'pay.tabReceipts', desktopLabel: 'Receipts' },
  { id: 'day', labelKey: 'pay.tabDayWise', desktopLabel: 'Day-wise' },
  { id: 'beat', labelKey: 'pay.tabBeatWise', desktopLabel: 'Beat-wise' },
  { id: 'customer', labelKey: 'pay.tabCustomers', desktopLabel: 'Customers' },
];

/**
 * Payments > Reports. Four reports, each with its own Excel / PDF download:
 * total receipts (paid or due), day-wise, beat-wise and customer-wise.
 */
export const PaymentReportsPanel: React.FC = () => {
  const isPhone = useIsMobile(767);
  const { t } = useLanguage();
  const [report, setReport] = useState<ReportId>('total');
  const [range, setRange] = useState<PeriodRange>(() => ({ preset: '7days', ...rangeForPreset('7days') }));
  const tabBtnRefs = useRef<Partial<Record<ReportId, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (!isPhone) return;
    tabBtnRefs.current[report]?.scrollIntoView?.({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [isPhone, report]);

  const inPeriod = useCallback(
    (d: string) => (!range.startDate || d >= range.startDate) && (!range.endDate || d <= range.endDate),
    [range],
  );
  const label = useMemo(() => periodRangeLabel(range), [range]);

  return (
    <div className="space-y-3">
      {isPhone ? (
        <>
          <div
            role="tablist"
            aria-label="Payment reports"
            className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
          >
            {SUBTABS.map((tb) => (
              <button
                key={tb.id}
                ref={(el) => {
                  tabBtnRefs.current[tb.id] = el;
                }}
                type="button"
                role="tab"
                aria-selected={report === tb.id}
                aria-pressed={report === tb.id}
                onClick={() => setReport(tb.id)}
                className="rt-chip shrink-0"
              >
                {t(tb.labelKey)}
              </button>
            ))}
          </div>

          {report !== 'customer' && (
            <div className="flex items-center justify-between gap-2 hh-pay-period">
              <span className="text-[12px] font-semibold" style={{ color: 'var(--text-2)' }}>
                {t('pay.period')}
              </span>
              <PeriodFilter compact monthIsCalendar value={range} onChange={setRange} />
            </div>
          )}
        </>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Payment reports"
            className="flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200 text-xs font-semibold overflow-x-auto no-scrollbar"
          >
            {SUBTABS.map((tb) => (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={report === tb.id}
                onClick={() => setReport(tb.id)}
                className={`flex-1 px-3 py-2 rounded-lg whitespace-nowrap cursor-pointer transition-all ${
                  report === tb.id ? 'bg-[var(--primary)] text-white font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tb.desktopLabel}
              </button>
            ))}
          </div>

          {report !== 'customer' && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">Period</span>
              <PeriodFilter compact value={range} onChange={setRange} />
            </div>
          )}
        </>
      )}

      {report === 'total' && <TotalReceiptsReport periodLabel={label} inPeriod={inPeriod} />}
      {report === 'receipts' && <CustomerReceiptsReport periodLabel={label} inPeriod={inPeriod} />}
      {report === 'day' && <DayWiseReport periodLabel={label} inPeriod={inPeriod} />}
      {report === 'beat' && <BeatSalesDueReport periodLabel={label} inPeriod={inPeriod} />}
      {report === 'customer' && <CustomerOverallReport />}
    </div>
  );
};
