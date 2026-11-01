import React, { useState, useMemo } from 'react';
import { ArrowRight, Layers, IndianRupee, Percent, Calendar, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Warehouse } from '../../../types';
import { money } from '../../../utils/billing';
import { summariseSupplierDiscount } from '../../../utils/fefo';
import { StatCard, Card, Badge, Button } from '../../ui';
import { todayISO, toLocalISODate } from "../../../utils/dateLocal";

interface PurchasesReportProps {
  purchaseStats: {
    netPurchaseVal: number;
    totalCratesInward: number;
    totalGstPaid: number;
    totalCessPaid: number;
  };
  filteredGrns: any[];
  warehouses: Warehouse[];
  period: string;
  onNavigateInventory: () => void;
}

export const PurchasesReport: React.FC<PurchasesReportProps> = ({
  purchaseStats,
  filteredGrns,
  warehouses,
  period,
  onNavigateInventory,
}) => {
  const [viewMode, setViewMode] = useState<'daywise' | 'log'>('daywise');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const todayStr = useMemo(() => todayISO(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
  }, []);

  const formatFriendlyDate = (dateStr: string) => {
    if (!dateStr) return 'Unknown Date';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };


  const discountTotals = useMemo(() => {
    let line = 0;
    let bill = 0;
    filteredGrns.forEach((g) => {
      const s = summariseSupplierDiscount(g);
      line += s.lineDiscount;
      bill += s.billDiscount;
    });
    return { line, bill, total: line + bill };
  }, [filteredGrns]);

  // Day-wise aggregated inward purchases breakdown (Sorted Day-wise, Latest on top)
  const dayWisePurchases = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        grnCount: number;
        cratesReceived: number;
        netTaxable: number;
        taxPaid: number;
        grandTotal: number;
        warehouses: Set<string>;
        grns: any[];
      }
    >();

    filteredGrns.forEach((g) => {
      const d = (g.inwardDate || '').slice(0, 10) || 'Unknown Date';
      const crates = g.totalReceivedQty || g.items?.reduce((s: number, i: any) => s + (i.totalReceivedQty ?? (i.schemeMode === 'additive' ? (i.qty || 0) + (i.freeQty || 0) : (i.qty || 0))), 0) || 0;
      const net = g.totalTaxable || g.grandTotal || 0;
      const tax = g.totalTax || ((g.totalCgst || 0) + (g.totalSgst || 0)) || 0;
      const total = g.grandTotal || 0;
      const whName = warehouses.find((w) => w.id === g.warehouseId)?.name || 'Godown';

      const existing = map.get(d);
      if (!existing) {
        map.set(d, {
          date: d,
          grnCount: 1,
          cratesReceived: crates,
          netTaxable: net,
          taxPaid: tax,
          grandTotal: total,
          warehouses: new Set([whName]),
          grns: [g],
        });
      } else {
        existing.grnCount += 1;
        existing.cratesReceived += crates;
        existing.netTaxable += net;
        existing.taxPaid += tax;
        existing.grandTotal += total;
        existing.warehouses.add(whName);
        existing.grns.push(g);
      }
    });

    // Sort strictly day-wise: Latest day on top
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredGrns, warehouses]);

  // Inward consignments sorted latest on top
  const sortedGrns = useMemo(() => {
    return [...filteredGrns].sort((a, b) => {
      const dCmp = (b.inwardDate || '').localeCompare(a.inwardDate || '');
      if (dCmp !== 0) return dCmp;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [filteredGrns]);

  return (
    <div className="space-y-6">
      {/* Metrics Row: 2-col mobile -> 4-col desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
      {(discountTotals.total > 0) && (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3.5 shadow-sm flex flex-wrap items-center gap-4 text-xs">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Supplier discounts (period)</div>
            <div className="text-lg font-black text-emerald-950 font-mono tabular-nums mt-0.5">₹{money(discountTotals.total)}</div>
          </div>
          <div className="h-8 w-px bg-emerald-200 hidden sm:block" />
          <div>
            <div className="text-[10px] text-slate-500 font-semibold">Line schemes / free</div>
            <div className="font-mono font-bold text-slate-800">₹{money(discountTotals.line)}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-semibold">Bill-level discount</div>
            <div className="font-mono font-bold text-slate-800">₹{money(discountTotals.bill)}</div>
          </div>
          <p className="hidden sm:block text-[10px] text-slate-500 max-w-md leading-relaxed">
            Bill discounts (e.g. ₹15,467 on supplier invoice) are allocated into batch effective cost on inward (FEFO cost base).
          </p>
        </div>
      )}

<StatCard
          title="Total Purchases (Net)"
          value={`₹${money(purchaseStats.netPurchaseVal)}`}
          icon={IndianRupee}
          subtitle={`Across ${filteredGrns.length} consignments`}
          variant="default"
        />

        <StatCard
          title="Inward Crates Received"
          value={`${purchaseStats.totalCratesInward} crates`}
          icon={Layers}
          subtitle="Supplied to godowns"
          variant="accent"
        />

        <StatCard
          title="Input GST Tax Paid (ITC)"
          value={`₹${money(purchaseStats.totalGstPaid)}`}
          icon={Percent}
          subtitle="Available to offset output GST"
          variant="accent"
        />

        <StatCard
          title="Compensation Cess Paid"
          value={`₹${money(purchaseStats.totalCessPaid)}`}
          icon={Percent}
          subtitle="On carbonated drinks"
          variant="warning"
        />
      </div>

      {/* Main Content Card with Day-wise View Toggle */}
      <Card noPadding>
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900">Inward & Purchases Report</h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                Sorted: Day-wise, Latest on Top ↓
              </span>
            </div>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Goods received vouchers from manufacturers & super-stockists.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setViewMode('daywise')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors ${
                  viewMode === 'daywise'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Day-Wise Summary ({dayWisePurchases.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('log')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 cursor-pointer transition-colors ${
                  viewMode === 'log'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Consignments Log ({filteredGrns.length})</span>
              </button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={onNavigateInventory}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Open Inward Workspace
            </Button>
          </div>
        </div>

        {filteredGrns.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No inward invoices recorded for {period}. Receive a consignment in Inventory to view purchase history.
          </div>
        ) : viewMode === 'daywise' ? (
          /* ======================================================== */
          /* DAY-WISE PURCHASES SUMMARY (LATEST DAY ON TOP)           */
          /* ======================================================== */
          <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left data-table text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                  <th className="px-4 py-3">Inward Date</th>
                  <th className="px-3 py-3 text-center">GRNs</th>
                  <th className="px-3 py-3">Godown / Depot</th>
                  <th className="px-3 py-3 text-right">Crates Received</th>
                  <th className="px-3 py-3 text-right">Taxable Net (₹)</th>
                  <th className="px-3 py-3 text-right">Tax & Cess (₹)</th>
                  <th className="px-3 py-3 text-right">Gross Invoiced (₹)</th>
                  <th className="px-3 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dayWisePurchases.map((day) => {
                  const isExpanded = expandedDay === day.date;
                  const isToday = day.date === todayStr;
                  const isYesterday = day.date === yesterdayStr;

                  return (
                    <React.Fragment key={day.date}>
                      <tr className={`hover:bg-slate-50/75 transition-colors ${isExpanded ? 'bg-sky-50/40' : ''}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono">{day.date}</span>
                            {isToday && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Today
                              </span>
                            )}
                            {isYesterday && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 text-blue-800 border border-sky-200">
                                Yesterday
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-normal block mt-0.5">
                            {formatFriendlyDate(day.date)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border">
                            {day.grnCount}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600 max-w-[150px] truncate">
                          {Array.from(day.warehouses).join(', ')}
                        </td>
                        <td className="px-3 py-3 text-right font-black text-sky-700 tabular-nums">
                          {day.cratesReceived} cs
                        </td>
                        <td className="px-3 py-3 text-right text-slate-700 font-mono">
                          ₹{money(day.netTaxable)}
                        </td>
                        <td className="px-3 py-3 text-right text-amber-700 font-mono">
                          ₹{money(day.taxPaid)}
                        </td>
                        <td className="px-3 py-3 text-right font-black text-slate-900 font-mono text-sm">
                          ₹{money(day.grandTotal)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                            className="px-2.5 py-1 text-xs font-bold border rounded bg-white hover:bg-slate-50 text-sky-700 flex items-center gap-1 mx-auto cursor-pointer transition-colors shadow-sm"
                          >
                            <span>{isExpanded ? 'Hide' : 'View GRNs'}</span>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Sub-Table showing individual GRNs of this day */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={8} className="p-3 sm:p-4">
                            <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 shadow-inner">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700 border-b pb-2">
                                <span>Inward Consignments on {formatFriendlyDate(day.date)}</span>
                                <span className="text-slate-500 font-medium">{day.grns.length} GRN Vouchers</span>
                              </div>
                              <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b text-[10.5px] uppercase font-bold text-slate-500 bg-slate-50">
                                      <th className="px-3 py-1.5 text-left">GRN #</th>
                                      <th className="px-3 py-1.5 text-left">Supplier</th>
                                      <th className="px-3 py-1.5 text-left">Supplier Invoice #</th>
                                      <th className="px-3 py-1.5 text-left">Godown</th>
                                      <th className="px-3 py-1.5 text-right">Crates</th>
                                      <th className="px-3 py-1.5 text-right">Net Taxable</th>
                                      <th className="px-3 py-1.5 text-right">Tax (ITC)</th>
                                      <th className="px-3 py-1.5 text-right">Total Invoiced</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {day.grns.map((g) => {
                                      const wh = warehouses.find((w) => w.id === g.warehouseId);
                                      const crates = g.totalReceivedQty || g.items?.reduce((s: number, i: any) => s + (i.totalReceivedQty ?? (i.schemeMode === 'additive' ? (i.qty || 0) + (i.freeQty || 0) : (i.qty || 0))), 0) || 0;
                                      return (
                                        <tr key={g.id} className="hover:bg-slate-50">
                                          <td className="px-3 py-2 font-mono font-bold text-sky-700">{g.id}</td>
                                          <td className="px-3 py-2 font-semibold text-slate-900">{g.supplierName}</td>
                                          <td className="px-3 py-2 font-mono text-slate-600">{g.invoiceNo || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{wh?.name || 'Godown'}</td>
                                          <td className="px-3 py-2 text-right font-medium">{crates} cs</td>
                                          <td className="px-3 py-2 text-right text-slate-700 font-mono">₹{money(g.totalTaxable || g.grandTotal)}</td>
                                          <td className="px-3 py-2 text-right text-emerald-700 font-mono">₹{money(g.totalTax || 0)}</td>
                                          <td className="px-3 py-2 text-right font-black text-slate-900 font-mono">₹{money(g.grandTotal)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-black text-xs text-slate-900">
                  <td className="px-4 py-3" colSpan={3}>
                    TOTAL PURCHASES ({dayWisePurchases.length} Active Days)
                  </td>
                  <td className="px-3 py-3 text-right text-blue-950 text-sm">
                    {purchaseStats.totalCratesInward} cs
                  </td>
                  <td className="px-3 py-3 text-right">
                    ₹{money(purchaseStats.netPurchaseVal)}
                  </td>
                  <td className="px-3 py-3 text-right text-emerald-800">
                    ₹{money(purchaseStats.totalGstPaid + purchaseStats.totalCessPaid)}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-950 text-sm font-mono">
                    ₹{money(dayWisePurchases.reduce((s, d) => s + d.grandTotal, 0))}
                  </td>
                  <td className="px-3 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          /* ======================================================== */
          /* DETAILED CONSIGNMENTS LOG (SORTED LATEST ON TOP)         */
          /* ======================================================== */
          <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left data-table text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                  <th className="px-4 py-3">GRN #</th>
                  <th className="px-3 py-3">Inward Date</th>
                  <th className="px-3 py-3">Supplier</th>
                  <th className="px-3 py-3">Invoice Ref</th>
                  <th className="px-3 py-3">Godown</th>
                  <th className="px-3 py-3 text-right">Crates</th>
                  <th className="px-3 py-3 text-right">Supplier disc.</th>
                  <th className="px-3 py-3 text-right">Total Invoiced</th>
                  <th className="px-3 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedGrns.map((g) => {
                  const wh = warehouses.find((w) => w.id === g.warehouseId);
                  const crates = g.totalReceivedQty || g.items?.reduce((s: number, i: any) => s + (i.totalReceivedQty ?? (i.schemeMode === 'additive' ? (i.qty || 0) + (i.freeQty || 0) : (i.qty || 0))), 0) || 0;
                  return (
                    <tr key={g.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-sky-700">{g.id}</td>
                      <td className="px-3 py-3 text-slate-600 font-mono">{g.inwardDate || '—'}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{g.supplierName}</td>
                      <td className="px-3 py-3 font-mono text-slate-700">{g.invoiceNo || '—'}</td>
                      <td className="px-3 py-3 text-slate-600">{wh?.name || 'Godown'}</td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">{crates} cs</td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-800">
                        ₹{money(summariseSupplierDiscount(g).totalDiscount)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900 font-mono">
                        ₹{money(g.grandTotal)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge variant="success" size="sm">
                          Received
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-black text-xs text-slate-900">
                  <td className="px-4 py-3" colSpan={5}>
                    TOTAL CONSIGNMENTS ({sortedGrns.length} Records)
                  </td>
                  <td className="px-3 py-3 text-right text-blue-950 text-sm">
                    {purchaseStats.totalCratesInward} cs
                  </td>
                  <td className="px-3 py-3 text-right text-slate-950 text-sm font-mono">
                    ₹{money(sortedGrns.reduce((s, g) => s + (g.grandTotal || 0), 0))}
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
