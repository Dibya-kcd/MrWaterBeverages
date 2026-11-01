import React, { useState, useMemo } from 'react';
import { MessageCircle, Plus, AlertCircle, Clock, CheckCircle2, Calendar, ArrowUpDown } from 'lucide-react';
import { money } from '../../../utils/billing';
import { StatCard, Card, Button } from '../../ui';
import { todayISO, toLocalISODate } from "../../../utils/dateLocal";

interface DebtorItem {
  retailer: string;
  phone?: string;
  balance: number;
  billsCount: number;
  totalBilled: number;
  totalPaid: number;
  lastBillDate?: string;
  aging: {
    current: number;
    due15: number;
    overdue30: number;
  };
}

interface ReceivablesReportProps {
  debtorsLedger: DebtorItem[];
  orgProfile?: { name?: string };
  onRecordPayment: (retailer: string) => void;
}

export const ReceivablesReport: React.FC<ReceivablesReportProps> = ({
  debtorsLedger,
  orgProfile,
  onRecordPayment,
}) => {
  const [sortOrder, setSortOrder] = useState<'latestDay' | 'balance' | 'overdue'>('latestDay');

  const todayStr = useMemo(() => todayISO(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);

  const totalMarketCredit = useMemo(() => debtorsLedger.reduce((sum, d) => sum + d.balance, 0), [debtorsLedger]);
  const overdueCredit = useMemo(() => debtorsLedger.reduce((sum, d) => sum + d.aging.due15 + d.aging.overdue30, 0), [debtorsLedger]);
  const currentDues = useMemo(() => debtorsLedger.reduce((sum, d) => sum + d.aging.current, 0), [debtorsLedger]);

  // Sort debtors based on selected sort order (default: Latest Day on top)
  const sortedDebtors = useMemo(() => {
    return [...debtorsLedger].sort((a, b) => {
      if (sortOrder === 'latestDay') {
        const dateA = a.lastBillDate || '';
        const dateB = b.lastBillDate || '';
        const dCmp = dateB.localeCompare(dateA);
        if (dCmp !== 0) return dCmp;
        return b.balance - a.balance;
      }
      if (sortOrder === 'overdue') {
        const overdueA = a.aging.due15 + a.aging.overdue30;
        const overdueB = b.aging.due15 + b.aging.overdue30;
        if (overdueB !== overdueA) return overdueB - overdueA;
        return b.balance - a.balance;
      }
      return b.balance - a.balance;
    });
  }, [debtorsLedger, sortOrder]);

  const formatFriendlyDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const clean = dateStr.slice(0, 10);
      const [y, m, d] = clean.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          title="Total Market Credit Due"
          value={`₹${money(totalMarketCredit)}`}
          icon={AlertCircle}
          subtitle={`Across ${debtorsLedger.length} retail accounts`}
          variant="danger"
        />

        <StatCard
          title="Overdue Credit (> 15 Days)"
          value={`₹${money(overdueCredit)}`}
          icon={Clock}
          subtitle="Priority collection targets"
          variant="warning"
        />

        <StatCard
          title="Current Dues (0 - 15 Days)"
          value={`₹${money(currentDues)}`}
          icon={CheckCircle2}
          subtitle="Within normal trade terms"
          variant="success"
        />
      </div>

      {/* Party-wise Outstanding Table with Sort Controls */}
      <Card noPadding>
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900">Retailer Debtors Aging Schedule</h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                Sorted: {sortOrder === 'latestDay' ? 'Day-wise Latest on Top ↓' : sortOrder === 'balance' ? 'Highest Balance Due' : 'High Overdue'}
              </span>
            </div>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Outstanding balances categorized by aging days with direct WhatsApp reminder triggers.
            </p>
          </div>

          {/* Sort Control Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <ArrowUpDown size={12} /> Sort:
            </span>
            <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setSortOrder('latestDay')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                  sortOrder === 'latestDay'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar size={12} />
                <span>Day-Wise Latest on Top</span>
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('balance')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md cursor-pointer transition-colors ${
                  sortOrder === 'balance'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Highest Due</span>
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('overdue')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md cursor-pointer transition-colors ${
                  sortOrder === 'overdue'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Overdue (&gt;15d)</span>
              </button>
            </div>
          </div>
        </div>

        {debtorsLedger.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            🎉 All customer accounts are fully settled! Zero market credit outstanding.
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left data-table text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                  <th className="px-4 py-3">Retailer Party</th>
                  <th className="px-3 py-3">Latest Bill Date</th>
                  <th className="px-3 py-3 text-right">Bills</th>
                  <th className="px-3 py-3 text-right">Total Invoiced</th>
                  <th className="px-3 py-3 text-right">Total Paid</th>
                  <th className="px-3 py-3 text-right text-rose-700">Balance Due</th>
                  <th className="px-3 py-3 text-right text-slate-600">0-15 Days</th>
                  <th className="px-3 py-3 text-right text-amber-700">16-30 Days</th>
                  <th className="px-3 py-3 text-right text-rose-700">30+ Days</th>
                  <th className="px-3 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedDebtors.map((d, idx) => {
                  const dateClean = d.lastBillDate?.slice(0, 10) || '';
                  const isToday = dateClean === todayStr;
                  const isYesterday = dateClean === yesterdayStr;

                  const waText = encodeURIComponent(
                    `Dear ${d.retailer},\nGreetings from ${orgProfile?.name || 'MrWater Distribution'}.\nThis is a friendly reminder that your outstanding balance is ₹${money(
                      d.balance
                    )} against beverage delivery bills.\nKindly clear the dues at your earliest convenience. Thank you!`
                  );
                  const waLink = d.phone ? `https://wa.me/91${d.phone.replace(/[^0-9]/g, '')}?text=${waText}` : null;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <div>{d.retailer}</div>
                        {d.phone && (
                          <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                            📱 {d.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="font-mono text-slate-800 font-medium">
                            {formatFriendlyDate(d.lastBillDate)}
                          </span>
                          {isToday && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Today
                            </span>
                          )}
                          {isYesterday && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-black uppercase bg-blue-100 text-blue-800 border border-sky-200">
                              Yesterday
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-600 tabular-nums">
                        {d.billsCount}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700 font-mono">
                        ₹{money(d.totalBilled)}
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-700 font-medium font-mono">
                        ₹{money(d.totalPaid)}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-rose-700 font-mono text-sm">
                        ₹{money(d.balance)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600 font-mono">
                        ₹{money(d.aging.current)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-amber-800 font-mono">
                        ₹{money(d.aging.due15)}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-rose-800 font-mono">
                        ₹{money(d.aging.overdue30)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => onRecordPayment(d.retailer)}
                            leftIcon={<Plus className="w-3 h-3" />}
                            title="Record payment for this retailer party"
                          >
                            Pay
                          </Button>
                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                              title="Send payment reminder on WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-black text-xs text-slate-900">
                  <td className="px-4 py-3" colSpan={5}>
                    TOTAL RECEIVABLES ({sortedDebtors.length} Customers)
                  </td>
                  <td className="px-3 py-3 text-right text-rose-900 text-sm font-mono">
                    ₹{money(totalMarketCredit)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    ₹{money(currentDues)}
                  </td>
                  <td className="px-3 py-3 text-right text-amber-800">
                    ₹{money(debtorsLedger.reduce((s, d) => s + d.aging.due15, 0))}
                  </td>
                  <td className="px-3 py-3 text-right text-rose-800">
                    ₹{money(debtorsLedger.reduce((s, d) => s + d.aging.overdue30, 0))}
                  </td>
                  <td className="px-3 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
