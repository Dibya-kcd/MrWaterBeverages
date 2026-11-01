import React from 'react';
import { AlertTriangle, Boxes, TrendingUp, IndianRupee, PieChart } from 'lucide-react';
import { Product } from '../../../types';
import { money } from '../../../utils/billing';
import { StatCard, Card, Badge } from '../../ui';

interface InventoryReportProps {
  inventoryStats: {
    totalCrates: number;
    totalCostValuation: number;
    totalCostValuationInclGst?: number;
    totalInputGst?: number;
    totalSellingValuation: number;
    potentialGrossProfit: number;
    marginPct: number;
  };
  products: Product[];
  remainingStock: (id: number) => number;
  expiryRadar: {
    expired: any[];
    critical: any[];
  };
}

export const InventoryReport: React.FC<InventoryReportProps> = ({
  inventoryStats,
  products,
  remainingStock,
  expiryRadar,
}) => {
  const totalLanded = inventoryStats.totalCostValuationInclGst || inventoryStats.totalCostValuation;
  const inputGst = inventoryStats.totalInputGst || Math.max(0, totalLanded - inventoryStats.totalCostValuation);

  return (
    <div className="space-y-6">
      {/* Metrics Row: 2-col mobile -> 5-col desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard
          title="Stock on Hand"
          value={`${inventoryStats.totalCrates} crates`}
          icon={Boxes}
          subtitle={`${products.length} SKU beverage lines`}
          variant="default"
        />

        <StatCard
          title="Total Spent on Stock"
          value={`₹${money(totalLanded)}`}
          icon={IndianRupee}
          subtitle="Landed Cost (Incl-GST & freight)"
          variant="accent"
        />

        <StatCard
          title="Stock Asset Value (Ex-Tax)"
          value={`₹${money(inventoryStats.totalCostValuation)}`}
          icon={IndianRupee}
          subtitle="Without GST (Balance Sheet)"
          variant="default"
        />

        <StatCard
          title="Wholesale Realization"
          value={`₹${money(inventoryStats.totalSellingValuation)}`}
          icon={TrendingUp}
          subtitle="Expected market revenue"
          variant="success"
        />

        <StatCard
          title="Potential Gross Profit"
          value={`₹${money(inventoryStats.potentialGrossProfit)}`}
          icon={PieChart}
          subtitle={`~${inventoryStats.marginPct.toFixed(1)}% gross margin`}
          variant="accent"
        />
      </div>

      {/* Tax Valuation Clarity Breakdown */}
      <div className="p-3.5 sm:p-4 rounded-xl border border-blue-200 bg-blue-50/70 text-slate-800 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        <div className="space-y-1">
          <div className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
            <span>ℹ️</span> Stock Asset Valuation Breakdown (Ex-Tax vs Incl-Tax)
          </div>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            Under Indian GST and standard accounting (AS-2), <strong>Stock Asset Value is recorded Ex-Tax (without GST)</strong> because GST paid on purchases is an <em>Input Tax Credit (ITC)</em> recovered against sales, not a product inventory cost.
          </p>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          <div className="bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-center">
            <span className="block text-[10px] uppercase font-bold text-slate-500">Ex-Tax Value</span>
            <span className="font-extrabold text-slate-900 font-mono text-xs">₹{money(inventoryStats.totalCostValuation)}</span>
          </div>
          <div className="text-slate-400 font-bold">+</div>
          <div className="bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-center">
            <span className="block text-[10px] uppercase font-bold text-amber-700">Input GST (ITC)</span>
            <span className="font-extrabold text-amber-800 font-mono text-xs">₹{money(inputGst)}</span>
          </div>
          <div className="text-slate-400 font-bold">=</div>
          <div className="bg-white border border-emerald-300 rounded-lg px-3 py-1.5 text-center">
            <span className="block text-[10px] uppercase font-bold text-emerald-700">Landed (Incl-Tax)</span>
            <span className="font-extrabold text-emerald-900 font-mono text-xs">₹{money(totalLanded)}</span>
          </div>
        </div>
      </div>

      {/* Expiry Risk Radar */}
      {(expiryRadar.expired.length > 0 || expiryRadar.critical.length > 0) && (
        <div className="border border-rose-200 p-4 rounded-xl bg-rose-50/70 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-rose-900 text-sm mb-3">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Batch Expiry Alerts ({expiryRadar.expired.length + expiryRadar.critical.length} batches requiring attention)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {expiryRadar.expired.map((b, idx) => (
              <div key={idx} className="bg-white border border-rose-200 p-3 rounded-lg text-xs shadow-sm">
                <span className="font-bold text-rose-900 block">{b.productName}</span>
                <span className="text-slate-600 text-[11px]">
                  Batch: {b.batchNumber} | {b.quantity} cases
                </span>
                <span className="block text-rose-700 font-semibold text-[11px] mt-1">
                  Expired on {b.expiryDate}
                </span>
              </div>
            ))}
            {expiryRadar.critical.map((b, idx) => (
              <div key={idx} className="bg-white border border-amber-200 p-3 rounded-lg text-xs shadow-sm">
                <span className="font-bold text-amber-900 block">{b.productName}</span>
                <span className="text-slate-600 text-[11px]">
                  Batch: {b.batchNumber} | {b.quantity} cases
                </span>
                <span className="block text-amber-700 font-semibold text-[11px] mt-1">
                  Expires soon ({b.expiryDate})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product Valuation Table */}
      <Card noPadding>
        <div className="p-4 sm:p-5 border-b border-slate-200">
          <h3 className="text-base font-extrabold text-slate-900">Stock Valuation & Margin Analysis</h3>
          <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
            Current crate balances, purchase rates, wholesale prices, and unrealized profit per SKU.
          </p>
        </div>

        <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left data-table text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                <th className="px-4 py-3">Beverage Item</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3 text-right">Available Stock</th>
                <th className="px-3 py-3 text-right">Purchase Rate (Ex-Tax)</th>
                <th className="px-3 py-3 text-right">Asset Value (Ex-Tax)</th>
                <th className="px-3 py-3 text-right">Landed (Incl-Tax)</th>
                <th className="px-3 py-3 text-right">Wholesale Rate</th>
                <th className="px-3 py-3 text-right">Wholesale Realization</th>
                <th className="px-3 py-3 text-right">Margin / Case</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => {
                const rem = remainingStock(p.id);
                const cost = p.effectiveCost || p.cost || 0;
                const landed = p.landedCostPerCrate && p.landedCostPerCrate > 0
                  ? p.landedCostPerCrate
                  : cost * (1 + (p.gstRate || 0.4));
                const whole = p.wholesale || p.retail || cost;
                const costVal = rem * cost;
                const landedVal = rem * landed;
                const sellVal = rem * whole;
                const margin = whole - cost;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                    <td className="px-3 py-3">
                      <Badge variant="neutral" size="sm">
                        {p.category}
                      </Badge>
                    </td>
                    <td className={`px-3 py-3 text-right font-black tabular-nums ${rem < 5 ? 'text-rose-700' : 'text-slate-900'}`}>
                      {rem} cs
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600 font-mono">₹{money(cost)}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-800 font-mono">₹{money(costVal)}</td>
                    <td className="px-3 py-3 text-right text-slate-600 font-mono">₹{money(landedVal)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900 font-mono">₹{money(whole)}</td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-800 font-mono">₹{money(sellVal)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-blue-800 font-mono">+₹{money(margin)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
