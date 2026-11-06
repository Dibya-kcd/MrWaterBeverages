import React, { useMemo, useState } from 'react';
import { TrendingUp, IndianRupee, Package, Search, Info, ShieldCheck, Gift } from 'lucide-react';
import { useLedger } from '../../../context/LedgerContext';
import { Card, CardContent, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, StatCard } from '../../ui';
import { money, normalizeGstFraction, resolveProductGstRate, scaledTaxSplit } from '../../../utils/billing';
import { returnedQtyByProduct } from '../../../utils/salesReturns';
import { CATS } from '../../../constants/initialData';
import { InfoTip } from '../../common/InfoTip';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportShareMenu } from './ReportShareMenu';
import { ProductProfitPhone } from './mobile/ProductProfitPhone';
import { Bill } from '../../../types';

export interface SupplierProductProfitReportProps {
  filteredBills?: Bill[];
  periodLabel?: string;
}

/**
 * Product Profit report (spec §17) — one row per product, folding in Supplier Scheme /
 * Credit Note benefits alongside the existing sales/purchase data.
 *
 * Operating Gross Profit is calculated on Net Taxable Sales (ex-GST, after deducting returns)
 * minus COGS at adjusted landed cost, properly separating GST liability from commercial profit.
 * Average Selling Price is calculated via Method 2 (dividing by billed cases).
 */
export const SupplierProductProfitReport: React.FC<SupplierProductProfitReportProps> = ({
  filteredBills,
  periodLabel = 'This month',
}) => {
  const { products, bills, inventoryBatches, supplierCreditNotes, warehouses, orgProfile } = useLedger();
  const activeBills = filteredBills || bills;
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');

  const rows = useMemo(() => {
    return products
      .map((product) => {
        const batches = inventoryBatches.filter(
          (b) => b.productId === product.id && (warehouseFilter === 'all' || b.warehouseId === warehouseFilter)
        );
        const purchaseQty = batches.reduce((s, b) => s + (Number(b.billedQuantity) || 0), 0);
        const freePurchaseQty = batches.reduce(
          (s, b) => s + (Number(b.freeQuantity) || 0) + (Number(b.supplierSchemeFreeQty) || 0),
          0
        );
        const totalReceived = batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
        const landedCostBasis = batches.reduce(
          (s, b) => s + (Number(b.effectiveCostPrice) || Number(b.costPrice) || 0) * (Number(b.quantity) || 0),
          0
        );
        const avgLandedCost =
          totalReceived > 0
            ? landedCostBasis / totalReceived
            : Number(product.effectiveCost || product.cost || 0);
        const batchesLandedIncl = batches.reduce(
          (s, b) => s + (Number(b.landedCostPerCrate) || 0) * (Number(b.quantity) || 0),
          0
        );
        const gRate = resolveProductGstRate(product);
        const avgLandedIncl =
          totalReceived > 0 && batchesLandedIncl > 0
            ? batchesLandedIncl / totalReceived
            : Number(product.landedCostPerCrate) || Math.round(avgLandedCost * (1 + gRate) * 100) / 100;

        let salesQty = 0;
        let salesFreeQty = 0;
        let salesValue = 0;
        let salesTaxableValue = 0;
        let salesGst = 0;

        for (const bill of activeBills) {
          if (bill.status === 'cancelled') continue;
          if (warehouseFilter !== 'all' && bill.warehouseId !== warehouseFilter) continue;

          const backByProd = returnedQtyByProduct(bill);
          const retQty = backByProd[product.id] || 0;

          let billItemQty = 0;
          let billFreeQty = 0;
          for (const item of bill.items) {
            if (item.productId !== product.id) continue;
            const q = Number(item.qty) || 0;
            const free = Number(item.freeQty) || 0;
            billItemQty += q;
            billFreeQty += free;

            const amt = Number(item.amount) || 0;
            const g = item.gst !== undefined && item.gst !== null
              ? normalizeGstFraction(item.gst)
              : resolveProductGstRate(product, item.category);
            const split = scaledTaxSplit(item, amt, g);
            const taxable = split.taxable;
            const gst = split.tax;

            salesValue += amt;
            salesTaxableValue += taxable;
            salesGst += gst;
          }

          // Net physical crates delivered (net of returns)
          // `qty` is the physical case count and already contains the free scheme cases,
          // so split it into billed (paid) and free instead of adding free on top again.
          const netPhysical = Math.max(0, billItemQty - retQty);
          const freeInNet = Math.min(billFreeQty, netPhysical);
          salesQty += netPhysical - freeInNet;
          salesFreeQty += freeInNet;
        }

        const relatedCreditNotes = supplierCreditNotes.filter((cn) => {
          if (cn.productId && Number(cn.productId) === Number(product.id)) return true;
          if (
            cn.grnId &&
            batches.some(
              (b) =>
                b.id.includes(cn.grnId!) ||
                b.notes?.includes(cn.grnId!) ||
                (b.supplierInvoiceNo && cn.grnId.includes(b.supplierInvoiceNo))
            )
          )
            return true;
          if (cn.notes && cn.notes.toLowerCase().includes(product.name.toLowerCase())) return true;
          return false;
        });
        const creditReceived = relatedCreditNotes.reduce((s, cn) => s + (Number(cn.actualAmount) || 0), 0);
        const creditExpected = relatedCreditNotes.reduce((s, cn) => s + (Number(cn.expectedAmount) || 0), 0);
        const creditOutstanding = Math.max(0, creditExpected - creditReceived);

        // Spread confirmed/expected credit across the received quantity to adjust
        // effective cost, mirroring how the additive free-goods cost re-spread works.
        const adjustedCostConfirmed =
          totalReceived > 0 ? Math.max(0, (landedCostBasis - creditReceived) / totalReceived) : avgLandedCost;
        const adjustedCostExpected =
          totalReceived > 0 ? Math.max(0, (landedCostBasis - creditExpected) / totalReceived) : avgLandedCost;

        const totalDispatched = salesQty + salesFreeQty;
        const cogsConfirmed = totalDispatched * adjustedCostConfirmed;
        const cogsExpected = totalDispatched * adjustedCostExpected;

        // Ex-GST True Operating Gross Profit (Taxable sales minus COGS)
        const grossProfitConfirmed = salesTaxableValue - cogsConfirmed;
        const grossProfitExpected = salesTaxableValue - cogsExpected;
        const marginConfirmed = salesTaxableValue > 0 ? (grossProfitConfirmed / salesTaxableValue) * 100 : 0;

        // Method 2 (dividing by billed cases only):
        const avgBilledSellingPrice = salesQty > 0 ? salesValue / salesQty : 0;
        const avgTaxableSellingPrice = salesQty > 0 ? salesTaxableValue / salesQty : 0;
        const effectiveRealizedPrice = totalDispatched > 0 ? salesValue / totalDispatched : 0;
        const profitPerCase = salesQty > 0 ? grossProfitConfirmed / salesQty : 0;

        return {
          product,
          salesQty,
          salesFreeQty,
          totalDispatched,
          salesValue,
          salesTaxableValue,
          salesGst,
          purchaseQty,
          freePurchaseQty,
          totalReceived,
          avgLandedCost,
          avgLandedIncl,
          creditReceived,
          creditOutstanding,
          adjustedCostConfirmed,
          grossProfitConfirmed,
          grossProfitExpected,
          marginConfirmed,
          avgBilledSellingPrice,
          avgTaxableSellingPrice,
          effectiveRealizedPrice,
          profitPerCase,
        };
      })
      .filter((r) => r.salesQty > 0 || r.totalReceived > 0)
      .filter((r) => !search.trim() || r.product.name.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => b.grossProfitConfirmed - a.grossProfitConfirmed);
  }, [products, bills, inventoryBatches, supplierCreditNotes, warehouseFilter, search]);

  const totalProfit = rows.reduce((s, r) => s + r.grossProfitConfirmed, 0);
  const totalTaxable = rows.reduce((s, r) => s + r.salesTaxableValue, 0);
  const totalGst = rows.reduce((s, r) => s + r.salesGst, 0);
  const totalCreditReceived = rows.reduce((s, r) => s + r.creditReceived, 0);
  const totalCreditOutstanding = rows.reduce((s, r) => s + r.creditOutstanding, 0);

  const godownName = warehouseFilter === 'all' ? 'All godowns' : warehouses.find((w) => w.id === warehouseFilter)?.name || 'Godown';

  const exportExcel = () =>
    downloadXlsx(`product-profit-${fileStamp()}.xlsx`, [
      {
        name: 'Product profit',
        header: ['Product', 'Category', 'Billed cs', 'Free cs', 'Adj. cost / cs', 'Avg selling price', 'Taxable sales (ex-GST)', 'GST collected', 'Billed net', 'Operating profit', 'Margin %', 'Profit / cs'],
        rows: rows.map((r) => [
          r.product.name,
          r.product.category || 'general',
          r.salesQty,
          r.salesFreeQty,
          r.adjustedCostConfirmed,
          r.avgBilledSellingPrice,
          r.salesTaxableValue,
          r.salesGst,
          r.salesValue,
          r.grossProfitConfirmed,
          Math.round(r.marginConfirmed * 10) / 10,
          r.profitPerCase,
        ]),
        total: ['Total', '', '', '', '', '', totalTaxable, totalGst, '', totalProfit, '', ''],
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `product-profit-${fileStamp()}.pdf`,
      title: 'Product profit (after GST)',
      subtitle: [orgProfile?.name || 'MrWater Distribution', `Godown: ${godownName}`, 'Profit = sales without GST minus cost of cases sold'],
      landscape: true,
      sections: [
        {
          header: ['Product', 'Billed cs', 'Free cs', 'Cost / cs (Rs.)', 'Avg price (Rs.)', 'Sales ex-GST (Rs.)', 'GST (Rs.)', 'Profit (Rs.)', 'Margin'],
          rows: rows.map((r) => [
            r.product.name,
            r.salesQty,
            r.salesFreeQty,
            money(r.adjustedCostConfirmed),
            money(r.avgBilledSellingPrice),
            money(r.salesTaxableValue),
            money(r.salesGst),
            money(r.grossProfitConfirmed),
            `${r.marginConfirmed.toFixed(1)}%`,
          ]),
          total: ['Total', '', '', '', '', money(totalTaxable), money(totalGst), money(totalProfit), ''],
          rightAlign: [1, 2, 3, 4, 5, 6, 7, 8],
        },
      ],
    });

  return (
    <>
      <ProductProfitPhone
        rows={rows}
        totalProfit={totalProfit}
        totalGst={totalGst}
        creditReceived={totalCreditReceived}
        creditOutstanding={totalCreditOutstanding}
        search={search}
        onSearch={setSearch}
        warehouseId={warehouseFilter}
        onWarehouse={setWarehouseFilter}
        warehouses={warehouses}
        onExcel={exportExcel}
        onPdf={exportPdf}
      />
    <div className="hidden md:block space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <StatCard tone="profit" icon={TrendingUp} title="Confirmed Operating Profit" value={`₹${money(totalProfit)}`} />
        <StatCard tone="sales" icon={ShieldCheck} title="Total Output GST" value={`₹${money(totalGst)}`} />
        <StatCard tone="received" icon={IndianRupee} title="Supplier Credit Recv." value={`₹${money(totalCreditReceived)}`} />
        <StatCard tone="due" icon={Package} title="Credit Outstanding" value={`₹${money(totalCreditOutstanding)}`} />
      </div>

      <InfoTip title="GST-accurate operating profit" text="How profit is calculated">
        <p><strong className="font-semibold text-sky-950">GST-Accurate Operating Profit &amp; Method 2 ASP:</strong> Profit is calculated on <em>Taxable Sales (Ex-GST)</em> minus <em>COGS (at confirmed landed cost after supplier credits, including promotional free crates)</em>. Output GST (₹{money(totalGst)}) collected from retailers is excluded. Average Selling Price is computed using <strong>Method 2 (dividing by billed cases only)</strong>.</p>
      </InfoTip>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="relative flex-1 sm:min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm bg-white"
            placeholder="Search product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full sm:w-auto bg-white cursor-pointer font-medium"
          value={warehouseFilter}
          onChange={(e) => setWarehouseFilter(e.target.value)}
        >
          <option value="all">All Warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <ReportShareMenu
          reportTitle="Product Profit Report"
          periodLabel={periodLabel}
          orgName={orgProfile?.name || "Hydrate Hub"}
          align="right"
          summaryMetrics={[
            { label: 'Confirmed Operating Profit', value: `₹${money(totalProfit)}` },
            { label: 'Total Output GST', value: `₹${money(totalGst)}` },
            { label: 'Supplier Credit Recv.', value: `₹${money(totalCreditReceived)}` },
            { label: 'Credit Outstanding', value: `₹${money(totalCreditOutstanding)}` },
          ]}
          sheets={[
            {
              name: 'Product Profit',
              header: ['Product', 'Category', 'Billed cases', 'Free cases', 'Total cases', 'Cost (Rs)', 'Avg Sell (Rs)', 'Taxable Sales (Rs)', 'Operating Profit (Rs)', 'Margin %'],
              rows: rows.map((r) => [
                r.product.name,
                r.product.category,
                r.salesQty,
                r.salesFreeQty,
                r.salesQty + r.salesFreeQty,
                r.adjustedCostConfirmed,
                r.avgBilledSellingPrice,
                r.salesTaxableValue,
                r.grossProfitConfirmed,
                `${r.marginConfirmed.toFixed(1)}%`,
              ]),
            },
          ]}
          pdfSections={[
            {
              title: `Product Profit Summary (${periodLabel})`,
              header: ['Product', 'Total cs', 'Cost', 'Sell', 'Taxable', 'Profit', 'Margin %'],
              rows: rows.map((r) => [
                r.product.name,
                r.salesQty + r.salesFreeQty,
                money(r.adjustedCostConfirmed),
                money(r.avgBilledSellingPrice),
                money(r.salesTaxableValue),
                money(r.grossProfitConfirmed),
                `${r.marginConfirmed.toFixed(1)}%`,
              ]),
              rightAlign: [1, 2, 3, 4, 5, 6],
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="text-center text-sm text-slate-400 py-8">
            No product activity yet for this filter.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card noPadding className="hidden lg:block overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Billed cs</TableHead>
                  <TableHead className="text-right">Free cs</TableHead>
                  <TableHead className="text-right">Total cs</TableHead>
                  <TableHead className="text-right">Adj. Cost</TableHead>
                  <TableHead className="text-right font-black text-sky-900">Avg Sell (Method 2)</TableHead>
                  <TableHead className="text-right">Taxable (Ex-GST)</TableHead>
                  <TableHead className="text-right">GST (Output)</TableHead>
                  <TableHead className="text-right">Billed Net</TableHead>
                  <TableHead className="text-right font-black text-emerald-800">Operating Profit</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.product.id}>
                    <TableCell className="font-bold text-slate-900">
                      <div>{r.product.name}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{r.product.category || 'general'}</div>
                    </TableCell>
                    <TableCell className="font-mono font-bold text-slate-900 text-right">
                      {r.salesQty.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="font-mono text-amber-700 text-right">
                      {r.salesFreeQty > 0 ? `+${r.salesFreeQty}` : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-slate-700 text-right">
                      {r.totalDispatched.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="font-mono text-right">
                      <div className="font-semibold text-slate-800">₹{money(r.adjustedCostConfirmed)}</div>
                      {r.avgLandedIncl > 0 && (
                        <div className="text-[10px] text-slate-400 font-normal">
                          Landed: ₹{money(r.avgLandedIncl)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-mono font-black text-sky-950">₹{money(r.avgBilledSellingPrice)}</div>
                      <div className="text-[10px] text-slate-400 font-mono">Ex-GST: ₹{money(r.avgTaxableSellingPrice)}</div>
                    </TableCell>
                    <TableCell className="font-mono font-bold text-slate-800 text-right">
                      ₹{money(r.salesTaxableValue)}
                    </TableCell>
                    <TableCell className="font-mono text-slate-500 text-right">
                      ₹{money(r.salesGst)}
                    </TableCell>
                    <TableCell className="font-mono text-sky-800 font-semibold text-right">
                      ₹{money(r.salesValue)}
                    </TableCell>
                    <TableCell
                      className={`font-mono font-black text-right ${
                        r.grossProfitConfirmed >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      <div>₹{money(r.grossProfitConfirmed)}</div>
                      <div className="text-[10px] font-normal text-emerald-800">
                        +₹{money(r.profitPerCase)} / cs
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                          r.marginConfirmed >= 15
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.marginConfirmed >= 5
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {r.marginConfirmed.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile & tablet cards */}
          <div className="lg:hidden space-y-2">
            {rows.map((r) => (
              <div key={r.product.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm text-slate-900 leading-snug">{r.product.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {r.salesQty} billed {r.salesFreeQty > 0 ? `+ ${r.salesFreeQty} free` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-base font-black leading-tight ${
                        r.grossProfitConfirmed >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      ₹{money(r.grossProfitConfirmed)}
                    </p>
                    <p className="text-[10px] text-slate-400">{r.marginConfirmed.toFixed(1)}% operating margin</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-slate-50 rounded-lg py-1.5 px-1">
                    <p className="text-[10px] text-slate-500">Method 2 ASP</p>
                    <p className="text-xs font-bold text-sky-900 font-mono">₹{money(r.avgBilledSellingPrice)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-1.5 px-1">
                    <p className="text-[10px] text-slate-500">Taxable Turn.</p>
                    <p className="text-xs font-bold text-slate-800 font-mono">₹{money(r.salesTaxableValue)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-1.5 px-1">
                    <p className="text-[10px] text-slate-500">Output GST</p>
                    <p className="text-xs font-bold text-slate-600 font-mono">₹{money(r.salesGst)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-100">
                  <span>Adj. Cost: ₹{money(r.adjustedCostConfirmed)} / cs</span>
                  <span>Profit: +₹{money(r.profitPerCase)} / cs</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
    </>
  );
};
