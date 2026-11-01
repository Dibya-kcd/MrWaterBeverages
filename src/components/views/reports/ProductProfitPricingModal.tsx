import React from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Package,
  IndianRupee,
  ShieldCheck,
  HelpCircle,
  ArrowRight,
  Layers,
  Calculator,
  Gift,
  FileText,
  Percent,
} from 'lucide-react';
import { ProductMarginRow } from './SalesMarginPnLReport';
import { Bill } from '../../../types';
import { money, normalizeGstFraction, resolveProductGstRate, scaledTaxSplit, breakEvenInclPaidRate, getGstOnFreeCases } from '../../../utils/billing';
import { returnedQtyByProduct } from '../../../utils/salesReturns';
import { CATS } from '../../../constants/initialData';

interface ProductProfitPricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: ProductMarginRow | null;
  bills: Bill[];
}

export const ProductProfitPricingModal: React.FC<ProductProfitPricingModalProps> = ({
  isOpen,
  onClose,
  row,
  bills,
}) => {
  if (!isOpen || !row) return null;

  // Filter bills containing this product
  const productBills = bills
    .filter((b) => b.status !== 'cancelled' && b.items.some((it) => it.productId === row.productId))
    .map((b) => {
      const it = b.items.find((item) => item.productId === row.productId)!;
      const backByProd = returnedQtyByProduct(b);
      const retQty = backByProd[row.productId] || 0;
      const billedQty = Number(it.qty) || 0;
      const netBilledQty = Math.max(0, billedQty - retQty);
      // `qty` is the physical number of cases and already includes the free scheme cases.
      const freeQty = Math.min(Number(it.freeQty) || 0, netBilledQty);
      const gross = Number(it.gross) || billedQty * (Number(it.rate) || 0);
      const disc = Number(it.discount) || 0;
      const billedNet = Number(it.amount) || gross - disc;

      const g = it.gst !== undefined && it.gst !== null
        ? normalizeGstFraction(it.gst)
        : resolveProductGstRate(undefined, it.category);
      const split = scaledTaxSplit(it, billedNet, g);
      const taxable = split.taxable;
      const gst = split.tax;
      const totalDispatched = netBilledQty;
      const cogsExGst = totalDispatched * (row.exGstCostPerCase || row.costPerCase);
      const cogsLanded = totalDispatched * (row.landedCostPerCase || (row.exGstCostPerCase ? row.exGstCostPerCase * (1 + g) : row.costPerCase));
      const opProfit = taxable - cogsExGst;
      const billedProfit = billedNet - cogsLanded;
      const customRate = Number(it.rate) || (billedQty > 0 ? gross / billedQty : 0);

      return {
        billId: b.id,
        date: b.date?.slice(0, 10) || '—',
        retailer: b.retailer || 'Cash / Walk-in',
        customRate,
        billedQty: netBilledQty - freeQty,
        freeQty,
        totalDispatched,
        gross,
        disc,
        billedNet,
        taxable,
        gst,
        cogs: cogsLanded,
        opProfit,
        billedProfit,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalBilledCases = row.casesSold;
  const totalFreeCases = row.freeCases;
  const totalDispatched = row.totalDispatched;
  const cost = row.costPerCase;

  // Method 2 (dividing by billed cases only):
  const avgBilledRate = row.avgBilledSellRate;
  const avgTaxableRate = row.avgTaxableSellRate;
  // Effective realized rate (dividing by total dispatched crates):
  const effectiveRealizedRate = row.effectiveSellRate;
  const effectiveTaxableRate = row.effectiveTaxableRate;

  // Ex-GST Operating Profit (Primary):
  const opProfit = row.operatingProfit;
  const opMarginPct = row.operatingMarginPct;
  const profitPerBilledCase = row.profitPerCase;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  {row.productName}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 uppercase tracking-wide">
                  {row.category}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Method 2 Active (Billed Cases)
                </span>
              </div>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                Transparent breakdown of Inward Purchase Cost, Custom Selling Rates, Free Schemes, and Ex-GST True Operating Profit
              </p>
            </div>
          </div>
          <button aria-label="Close"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-6 text-xs text-slate-700">
          {/* Executive Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Purchase Cost */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Inward Landed Cost
              </div>
              <div className="text-lg sm:text-xl font-black text-amber-950 font-mono">
                ₹{money(row.landedCostPerCase > 0 ? row.landedCostPerCase : cost)}
                <span className="text-xs font-normal text-slate-500"> / cs</span>
              </div>
              <div className="text-[10px] text-slate-600 font-medium">
                {row.landedCostPerCase > 0 ? (
                  <span>Incl-GST + Landed (Base ex-tax: ₹{money(row.exGstCostPerCase || cost)})</span>
                ) : (
                  <span>Ex-GST base rate</span>
                )}
              </div>
            </div>

            {/* Method 2 Selling Price */}
            <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-3.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 flex items-center justify-between">
                <span>Avg Selling Price</span>
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-sky-200 text-sky-900">
                  Method 2
                </span>
              </div>
              <div className="text-lg sm:text-xl font-black text-sky-950 font-mono">
                ₹{money(avgBilledRate)}
                <span className="text-xs font-normal text-sky-700"> / cs</span>
              </div>
              <div className="text-[10px] text-sky-800">
                Ex-GST: ₹{money(avgTaxableRate)} / cs
              </div>
            </div>

            {/* True Operating Profit (Ex-GST) */}
            <div className={`rounded-2xl p-3.5 space-y-1 border ${opProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
                <span>Operating Profit (Ex-GST)</span>
                {opProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-600" />}
              </div>
              <div className={`text-lg sm:text-xl font-black font-mono ${opProfit >= 0 ? 'text-emerald-950' : 'text-rose-950'}`}>
                ₹{money(opProfit)}
              </div>
              <div className="text-[10px] text-emerald-800 font-bold">
                +₹{money(profitPerBilledCase)} / cs ({opMarginPct.toFixed(1)}%)
              </div>
            </div>

            {/* Crates Dispatched */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Crates Delivered
              </div>
              <div className="text-lg sm:text-xl font-black text-slate-900 font-mono">
                {totalDispatched} cs
              </div>
              <div className="text-[10px] text-slate-500">
                {totalBilledCases} billed {totalFreeCases > 0 ? `+ ${totalFreeCases} free` : ''}
              </div>
            </div>
          </div>

          {/* Break-even selling rates */}
          {(() => {
            const cost = row.exGstCostPerCase || row.costPerCase || 0;
            const sample = bills.flatMap((b) => b.items).find((it) => it.productId === row.productId && it.gst != null);
            const g = sample ? normalizeGstFraction(sample.gst) : resolveProductGstRate(undefined, row.category as any);
            const schemes: [string, number, number][] = [
              ['No scheme', 1, 0],
              ['Buy 1 Get 1 free', 1, 1],
              ['Buy 2 Get 1 free', 2, 1],
              ['Buy 3 Get 1 free', 3, 1],
            ];
            return (
              <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">
                  Break-even selling rate (cost ₹{money(cost)} / cs ex-GST · GST {(g * 100).toFixed(0)}%)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 pr-3">Deal</th>
                        <th className="py-1 pr-3">Min price per PAID case (incl. GST)</th>
                        <th className="py-1">Or one custom rate per case, all cases</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {schemes.map(([label, n, m]) => {
                        const paid = breakEvenInclPaidRate(cost, n, m, g);
                        return (
                          <tr key={label} className="border-t border-amber-200/70">
                            <td className="py-1 pr-3 font-sans font-semibold">{label}</td>
                            <td className="py-1 pr-3">{paid == null ? 'not recoverable' : `₹${money(paid)}`}</td>
                            <td className="py-1">{paid == null ? '—' : `₹${money((paid * n) / (n + m))}`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-amber-900/80">
                  {getGstOnFreeCases()
                    ? 'GST is also charged on free cases (Settings), so a free-case scheme needs a higher price than the same deal entered as a custom rate.'
                    : 'GST is charged only on what the customer pays, so a free-case scheme and a custom rate need the same price.'}
                </p>
              </div>
            );
          })()}

          {/* Educational Step-by-Step Guide */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-emerald-600" />
              How Average Selling Price &amp; Profit are Calculated for this SKU
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Step 1: Selling Price (Method 2) */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center gap-2 text-sky-800 font-bold">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center text-[10px] font-black">
                    1
                  </span>
                  <span>Average Selling Price (Method 2)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  You sold <strong>{totalBilledCases} cases</strong> at custom rates across customer bills, generating <strong>₹{money(row.netSales)}</strong> total invoiced demand.
                </p>
                <div className="p-2.5 rounded-lg bg-sky-50/60 border border-sky-100 font-mono text-[11px] text-sky-950 space-y-1">
                  <div className="flex justify-between">
                    <span>Avg Billed Rate (Method 2):</span>
                    <span className="font-bold">₹{money(row.netSales)} ÷ {totalBilledCases} cs = ₹{money(avgBilledRate)} / cs</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Rate (Ex-GST):</span>
                    <span>₹{money(row.taxableSales)} ÷ {totalBilledCases} cs = ₹{money(avgTaxableRate)} / cs</span>
                  </div>
                </div>
                {totalFreeCases > 0 && (
                  <p className="text-[10px] text-amber-800 bg-amber-50/80 p-2 rounded-lg border border-amber-200/60">
                    <strong>Free Schemes Given:</strong> In addition to the {totalBilledCases} billed cases, you gave <strong>{totalFreeCases} cases free</strong>. The effective blended revenue across all {totalDispatched} dispatched cases is <strong>₹{money(effectiveRealizedRate)} / case</strong>.
                  </p>
                )}
              </div>

              {/* Step 2: Side-by-side GST & Revenue */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-black">
                    2
                  </span>
                  <span>GST Side-by-Side Separation</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  GST is a pass-through tax collected on behalf of the government and does not belong to your business income.
                </p>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] space-y-1">
                  <div className="flex justify-between text-sky-900">
                    <span>Total Billed Net (Customer Liability):</span>
                    <span className="font-bold">₹{money(row.netSales)}</span>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>Less: Output GST Collected (Payable):</span>
                    <span className="font-bold">−₹{money(row.gstAmount)}</span>
                  </div>
                  <div className="pt-1 border-t border-slate-200 flex justify-between text-slate-900 font-bold">
                    <span>= Taxable Turnover (Ex-GST Commercial Revenue):</span>
                    <span className="text-emerald-800">₹{money(row.taxableSales)}</span>
                  </div>
                </div>
              </div>

              {/* Step 3: Cost of Goods Sold (COGS) */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center gap-2 text-amber-800 font-bold">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[10px] font-black">
                    3
                  </span>
                  <span>COGS &amp; Free Goods Cost Absorption</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Your purchase cost is <strong>₹{money(cost)} / case</strong>{row.landedCostPerCase > 0 ? <> (original consignment bill: <strong>₹{money(row.landedCostPerCase)} / cs</strong> incl. GST &amp; landing expenses)</> : ''}. Every crate leaving your godown (both billed and free) represents physical stock you paid for.
                </p>
                <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/60 font-mono text-[11px] text-amber-950 space-y-1">
                  <div className="flex justify-between">
                    <span>Total Physical Cases Dispatched:</span>
                    <span>{totalBilledCases} billed + {totalFreeCases} free = {totalDispatched} cs</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 border-t border-amber-200/40">
                    <span>Total COGS:</span>
                    <span>{totalDispatched} cs × ₹{money(cost)} = ₹{money(row.cogs)}</span>
                  </div>
                </div>
              </div>

              {/* Step 4: True Operating Profit */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-black">
                    4
                  </span>
                  <span>Ex-GST True Operating Profit (Primary)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Calculated by subtracting true COGS from ex-GST taxable turnover, leaving your authentic operating profit without tax distortions.
                </p>
                <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-200 font-mono text-[11px] text-emerald-950 space-y-1">
                  <div className="flex justify-between">
                    <span>Taxable Revenue (Ex-GST):</span>
                    <span>₹{money(row.taxableSales)}</span>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>Less: Cost of Goods Sold (COGS):</span>
                    <span>−₹{money(row.cogs)}</span>
                  </div>
                  <div className="pt-1 border-t border-emerald-300 flex justify-between font-bold text-emerald-900 text-xs">
                    <span>= True Operating Profit:</span>
                    <span>₹{money(opProfit)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-emerald-800 pt-0.5">
                    <span>Operating Margin %:</span>
                    <span>{opMarginPct.toFixed(1)}% ({profitPerBilledCase >= 0 ? '+' : ''}₹{money(profitPerBilledCase)} / billed case)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice-by-Invoice Custom Rate Transactions Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-sky-600" />
                Sales Transactions &amp; Custom Rates Charged ({productBills.length} Invoices)
              </h4>
              <span className="text-[10px] text-slate-500 font-medium">
                Shows exact custom rates billed to each retailer
              </span>
            </div>

            <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left data-table min-w-[700px] text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2.5">Bill #</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Retailer</th>
                    <th className="px-3 py-2.5 text-right">Custom Rate</th>
                    <th className="px-3 py-2.5 text-right">Billed cs</th>
                    <th className="px-3 py-2.5 text-right">Free cs</th>
                    <th className="px-3 py-2.5 text-right">Taxable (Ex-GST)</th>
                    <th className="px-3 py-2.5 text-right">GST</th>
                    <th className="px-3 py-2.5 text-right">Billed Net</th>
                    <th className="px-3 py-2.5 text-right font-black text-emerald-800">
                      Operating Profit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productBills.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-6 text-slate-400">
                        No individual bills found for this product in the selected period.
                      </td>
                    </tr>
                  ) : (
                    productBills.map((b) => (
                      <tr key={b.billId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-2 font-mono font-bold text-sky-800">
                          #{b.billId}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                          {b.date}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-900">
                          {b.retailer}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">
                          ₹{money(b.customRate)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold">
                          {b.billedQty}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-amber-700">
                          {b.freeQty > 0 ? `+${b.freeQty}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">
                          ₹{money(b.taxable)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">
                          ₹{money(b.gst)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-sky-900">
                          ₹{money(b.billedNet)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono font-black ${
                            b.opProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          ₹{money(b.opProfit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/90 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            Formula: <strong>Average Selling Price = Total Invoiced ÷ Billed Cases</strong> · <strong>Operating Profit = Taxable Sales (Ex-GST) − COGS (Dispatched Crates × Inward Cost)</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
