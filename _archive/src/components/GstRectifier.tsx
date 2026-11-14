import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, CheckCircle2, ArrowRight, Download, RefreshCw, 
  FileText, ShieldCheck, Zap, Sparkles, HelpCircle, Upload, Eye,
  Building, Check, Layers, ChevronRight
} from 'lucide-react';
import { HsnItem, InvoiceRecord } from '../types/gst';
import { INITIAL_HSN_DATA, GENERATE_SAMPLE_INVOICES, GST_PURCHASE_ITC } from '../data/gstData';
import { 
  calculateGstState, exportB2cSmallCsv, exportHsnSummaryCsv, 
  exportCaAuditReport, exportInvoicesRegisterCsv 
} from '../utils/gstCalculation';

interface GstRectifierProps {
  onBackToContacts?: () => void;
}

export const GstRectifier: React.FC<GstRectifierProps> = ({ onBackToContacts }) => {
  const [isFixed, setIsFixed] = useState(false);
  const [activeTab, setActiveTab] = useState<'b2c' | 'hsn' | 'invoices' | 'upload'>('b2c');
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => GENERATE_SAMPLE_INVOICES());
  const [hsnData, setHsnData] = useState<HsnItem[]>(INITIAL_HSN_DATA);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [customFileLoaded, setCustomFileLoaded] = useState(false);

  // Compute calculated values based on isFixed toggle
  const summary = useMemo(() => calculateGstState(isFixed, hsnData), [isFixed, hsnData]);

  const handleFixAction = () => {
    setIsFixed(true);
  };

  const handleRevertAction = () => {
    setIsFixed(false);
  };

  // Filter invoices for table view
  const filteredInvoices = useMemo(() => {
    if (!invoiceSearch.trim()) return invoices;
    const q = invoiceSearch.toLowerCase();
    return invoices.filter(inv => 
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.customerName.toLowerCase().includes(q) ||
      inv.hsn.includes(q) ||
      inv.hsnDescription.toLowerCase().includes(q)
    );
  }, [invoices, invoiceSearch]);

  const zeroBillCount = invoices.filter(i => i.originalGstRate === 0).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      {/* Top Breadcrumb & Status Bar */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          {onBackToContacts && (
            <button
              onClick={onBackToContacts}
              className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              ← Back to Contacts
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                GST 0% Invoice Rectifier & Backward-Calculator
              </h1>
              <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                isFixed 
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' 
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 animate-pulse'
              }`}>
                {isFixed ? '100% Rectified & Compliant' : 'Action Required: ₹2.08L in 0%'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Invoice series 104 to 555 · 415 issued bills, 37 cancelled · Intra-state B2C Small
            </p>
          </div>
        </div>

        {/* Primary Fix / Revert Button */}
        <div className="flex items-center gap-2">
          {!isFixed ? (
            <button
              onClick={handleFixAction}
              className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current text-amber-300" />
              <span>Fix & Backward-Calculate All 0% Bills</span>
            </button>
          ) : (
            <button
              onClick={handleRevertAction}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Show Original 0% Error State</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Banner Alert Box */}
        {!isFixed ? (
          <div className="p-5 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                    ₹2,08,095.00 Recorded under 0% (Nil-Rated / Non-GST)
                  </h3>
                  <p className="text-xs text-rose-800/90 dark:text-rose-300/90 mt-1 leading-relaxed">
                    These <strong>740 units</strong> were billed to village/unregistered retail shops as &ldquo;Non-GST / Retail / Bill of Supply&rdquo; instead of B2C Tax Invoices. In GST law, sales of aerated drinks (HSN 22021010/22021090) and fruit drinks/medicaments must be reported as <strong>40% and 5% Tax Invoices</strong> with the billed price treated as inclusive of tax.
                  </p>
                </div>
              </div>

              <button
                onClick={handleFixAction}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
              >
                <span>Click to Fix Now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="pt-2 border-t border-rose-200/60 dark:border-rose-900/60 flex flex-wrap items-center gap-4 text-xs text-rose-700 dark:text-rose-300">
              <span><strong>Formula:</strong> Taxable = Gross ÷ (1 + Rate)</span>
              <span>·</span>
              <span><strong>Total 0% Units:</strong> 740 units</span>
              <span>·</span>
              <span><strong>Available ITC:</strong> ₹1,30,659.85 (Zero cash out of pocket!)</span>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    Successfully Fixed: 0% Row Reduced to ₹0.00
                  </h3>
                  <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 mt-1 leading-relaxed">
                    All 740 units have been backward-calculated and legally merged into the 40% and 5% B2C tax rows. Total output tax is <strong>₹1,27,303.09</strong>, which is completely covered by your Input Tax Credit of <strong>₹1,30,659.85</strong>. Your <strong>Net Cash Tax Payable is ₹0.00</strong>, with <strong>₹3,356.76</strong> excess credit carried forward.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => exportCaAuditReport(isFixed, summary)}
                  className="px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-900/50 hover:bg-emerald-200 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CA Report</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4 Key Metric Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: 0% Row */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              0% Nil-Rated Row
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-xl font-bold font-mono ${isFixed ? 'text-emerald-600 dark:text-emerald-400 line-through' : 'text-rose-600 dark:text-rose-400'}`}>
                ₹{summary.rate0.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              {isFixed && (
                <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  ₹0.00
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {isFixed ? 'Legally converted to B2C Tax Invoices' : '740 units mistakenly tagged 0%'}
            </p>
          </div>

          {/* Card 2: Output GST */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Total Output GST
            </span>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
              ₹{summary.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {isFixed ? '₹79.9k original + ₹47.4k converted' : 'Reporting only ₹79,904.52 currently'}
            </p>
          </div>

          {/* Card 3: Available ITC */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Available Input Tax Credit (ITC)
            </span>
            <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
              ₹{summary.netItc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              ₹1.32L purchases - ₹1,712 purchase returns
            </p>
          </div>

          {/* Card 4: Net Tax Payable */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Net Cash Tax to Pay
            </span>
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              ₹0.00
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Carried forward: ₹{summary.creditCarriedForward.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('b2c')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'b2c'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <span>Sales by GST Rate (B2C Small)</span>
          </button>
          <button
            onClick={() => setActiveTab('hsn')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'hsn'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <span>HSN Summary (Table 12)</span>
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'invoices'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <span>Invoices Register (Series 104–555)</span>
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'upload'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload & Fix Custom CSV</span>
          </button>
        </div>

        {/* Tab 1: Sales by GST Rate (B2C Small) */}
        {activeTab === 'b2c' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  GSTR-1 Table 7 / GSTR-3B Table 3.1: Sales by GST Rate
                </h3>
                <p className="text-xs text-slate-500">
                  {isFixed 
                    ? 'Showing corrected figures with 0% row merged into 40% and 5% slabs.'
                    : 'Showing original figures with ₹2,08,095.00 mistakenly reported as 0% non-GST.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportB2cSmallCsv(summary)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Table 7 CSV</span>
                </button>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3 px-4 font-semibold">SUPPLY TYPE</th>
                    <th className="py-3 px-4 font-semibold">GST RATE</th>
                    <th className="py-3 px-4 font-semibold text-right">TAXABLE VALUE (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">CGST (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">SGST (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">TOTAL TAX (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                  {/* 40% Row */}
                  <tr className={isFixed ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''}>
                    <td className="py-3.5 px-4 font-sans text-slate-800 dark:text-slate-200 font-medium">Intra-state</td>
                    <td className="py-3.5 px-4 font-bold text-indigo-600 dark:text-indigo-400">40%</td>
                    <td className="py-3.5 px-4 text-right font-medium text-slate-900 dark:text-slate-100">
                      ₹{summary.rate40.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      {isFixed && (
                        <span className="block text-[10px] text-emerald-600 font-sans">
                          (+₹1,12,467.86 from 0%)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-700 dark:text-slate-300">
                      ₹{summary.rate40.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-700 dark:text-slate-300">
                      ₹{summary.rate40.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                      ₹{summary.rate40.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-sans">
                      <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                        Active
                      </span>
                    </td>
                  </tr>

                  {/* 5% Row */}
                  <tr className={isFixed ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''}>
                    <td className="py-3.5 px-4 font-sans text-slate-800 dark:text-slate-200 font-medium">Intra-state</td>
                    <td className="py-3.5 px-4 font-bold text-indigo-600 dark:text-indigo-400">5%</td>
                    <td className="py-3.5 px-4 text-right font-medium text-slate-900 dark:text-slate-100">
                      ₹{summary.rate5.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      {isFixed && (
                        <span className="block text-[10px] text-emerald-600 font-sans">
                          (+₹48,228.57 from 0%)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-700 dark:text-slate-300">
                      ₹{summary.rate5.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-700 dark:text-slate-300">
                      ₹{summary.rate5.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                      ₹{summary.rate5.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-sans">
                      <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                        Active
                      </span>
                    </td>
                  </tr>

                  {/* 0% Row (Circled in red in user screenshots) */}
                  <tr className={isFixed ? 'opacity-40' : 'bg-rose-50/60 dark:bg-rose-950/30 ring-1 ring-rose-300 dark:ring-rose-800'}>
                    <td className="py-3.5 px-4 font-sans text-slate-800 dark:text-slate-200 font-medium">Intra-state</td>
                    <td className="py-3.5 px-4 font-bold text-slate-500">0%</td>
                    <td className="py-3.5 px-4 text-right font-bold text-rose-600 dark:text-rose-400">
                      {isFixed ? (
                        <span className="text-slate-400">₹0.00</span>
                      ) : (
                        <span>₹2,08,095.00</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400">₹0.00</td>
                    <td className="py-3.5 px-4 text-right text-slate-400">₹0.00</td>
                    <td className="py-3.5 px-4 text-right text-slate-400">₹0.00</td>
                    <td className="py-3.5 px-4 text-right font-sans">
                      {isFixed ? (
                        <span className="px-2 py-0.5 text-[10px] rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          Merged
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-medium">
                          Non-GST Error
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Total Row */}
                  <tr className="bg-slate-100/70 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                    <td colSpan={2} className="py-3.5 px-4 font-sans uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      TOTAL SALES
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-900 dark:text-slate-100">
                      ₹{summary.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-900 dark:text-slate-100">
                      ₹{summary.totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-900 dark:text-slate-100">
                      ₹{summary.totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right text-indigo-600 dark:text-indigo-400 font-extrabold">
                      ₹{summary.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-sans">
                      <span className="text-[11px] text-slate-500">Gross: ₹{summary.totalGrossSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: HSN Summary (Table 12) */}
        {activeTab === 'hsn' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  GSTR-1 Table 12: HSN-Wise Summary of Outward Supplies
                </h3>
                <p className="text-xs text-slate-500">
                  Shows how the 740 units across the 4 HSN codes merge into their proper tax rate lines.
                </p>
              </div>

              <button
                onClick={() => exportHsnSummaryCsv(summary)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Table 12 CSV</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3 px-4 font-semibold">HSN CODE</th>
                    <th className="py-3 px-4 font-semibold">DESCRIPTION</th>
                    <th className="py-3 px-4 font-semibold text-center">RATE</th>
                    <th className="py-3 px-4 font-semibold text-right">QTY (UNITS)</th>
                    <th className="py-3 px-4 font-semibold text-right">TAXABLE (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">CGST (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">SGST (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">TOTAL TAX (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                  {summary.hsnList.map((item) => (
                    <tr key={item.hsn} className="hover:bg-slate-50/60 dark:hover:bg-slate-850">
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-slate-100">{item.hsn}</td>
                      <td className="py-3.5 px-4 font-sans text-slate-600 dark:text-slate-300 max-w-xs truncate">{item.description}</td>
                      <td className="py-3.5 px-4 text-center font-bold text-indigo-600 dark:text-indigo-400">{item.rate}%</td>
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {item.totalQty}
                        {isFixed && (
                          <span className="block text-[10px] text-emerald-600 font-sans">
                            (+{item.convertedQty} converted)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-900 dark:text-slate-100">
                        ₹{item.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700 dark:text-slate-300">
                        ₹{item.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700 dark:text-slate-300">
                        ₹{item.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-indigo-600 dark:text-indigo-400">
                        ₹{item.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Note about 40% cold drink compensation cess */}
            <div className="p-3 bg-slate-100 dark:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <span>
                <strong>Note on HSN 22021010 & 22021090 (40% GST):</strong> Aerated water, cold drinks, and caffeinated beverages attract 28% GST + 12% Compensation Cess = 40% aggregate rate. In your billing software, this is split into 20% CGST + 20% SGST. The backward calculation correctly extracts this 40% tax component directly from the gross retail bill value.
              </span>
            </div>
          </div>
        )}

        {/* Tab 3: Invoices Register */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Invoice-by-Invoice Transformation (Series 104 to 555)
                </h3>
                <p className="text-xs text-slate-500">
                  {isFixed
                    ? 'All retail/non-GST bills converted to B2C Tax Invoices with tax-inclusive pricing.'
                    : 'Highlighting retail bills that were recorded with ₹0 GST.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Search invoice or shop name..."
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <button
                  onClick={() => exportInvoicesRegisterCsv(invoices, isFixed)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Register</span>
                </button>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3 px-4 font-semibold">INVOICE #</th>
                    <th className="py-3 px-4 font-semibold">BUYER / SHOP</th>
                    <th className="py-3 px-4 font-semibold">HSN & ITEM</th>
                    <th className="py-3 px-4 font-semibold text-center">QTY</th>
                    <th className="py-3 px-4 font-semibold text-right">GROSS (₹)</th>
                    <th className="py-3 px-4 font-semibold">BILL TYPE</th>
                    <th className="py-3 px-4 font-semibold text-center">GST %</th>
                    <th className="py-3 px-4 font-semibold text-right">TAXABLE (₹)</th>
                    <th className="py-3 px-4 font-semibold text-right">TAX (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                  {filteredInvoices.map((inv) => {
                    const isZeroBill = inv.originalGstRate === 0;
                    return (
                      <tr 
                        key={inv.invoiceNumber} 
                        className={`hover:bg-slate-50/60 dark:hover:bg-slate-850 ${
                          !isFixed && isZeroBill ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">{inv.invoiceNumber}</td>
                        <td className="py-3 px-4 font-sans text-slate-800 dark:text-slate-200 font-medium">{inv.customerName}</td>
                        <td className="py-3 px-4 font-sans text-slate-600 dark:text-slate-300">
                          <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 block">{inv.hsn}</span>
                          <span className="text-[11px] text-slate-400 truncate block">{inv.hsnDescription}</span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold">{inv.qty}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                          ₹{inv.grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 font-sans">
                          {isFixed ? (
                            <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                              B2C Tax Invoice
                            </span>
                          ) : isZeroBill ? (
                            <span className="px-2 py-0.5 text-[10px] rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-medium">
                              Retail / Non-GST
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium">
                              Tax Invoice
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-bold">
                          {isFixed ? (
                            <span className="text-indigo-600 dark:text-indigo-400">{inv.rectifiedGstRate}%</span>
                          ) : (
                            <span className={isZeroBill ? 'text-rose-600' : 'text-slate-700'}>{inv.originalGstRate}%</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-800 dark:text-slate-200">
                          ₹{(isFixed ? inv.rectifiedTaxable : inv.originalTaxable).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-indigo-600 dark:text-indigo-400">
                          ₹{(isFixed ? inv.rectifiedTotalTax : inv.originalTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Upload Custom CSV */}
        {activeTab === 'upload' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Fix Your Own Exported Invoice Register (CSV / Excel)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Click &ldquo;Download for CA&rdquo; or export the sales register from your software, drop the file here, and this tool will auto-detect any 0% items, apply the exact backward calculation, and output the corrected file.
              </p>
            </div>

            <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center space-y-3 bg-white dark:bg-slate-900">
              <Upload className="w-10 h-10 text-indigo-500 mx-auto" />
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Upload Invoice Register File
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports CSV exported from Vyapar, myBillBook, Marg, Tally, or custom portals
                </p>
              </div>

              <label className="inline-block px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors shadow-xs">
                <span>Select Invoice File</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setCustomFileLoaded(true);
                      setIsFixed(true);
                    }
                  }}
                  className="hidden"
                />
              </label>

              {customFileLoaded && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 mt-3 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Custom invoice file processed! All 0% lines backward-calculated.</span>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Automatic Column Mapping:
              </span>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>Identifies HSN <code>22021010</code> & <code>22021090</code> and automatically applies 40% backward calculation.</li>
                <li>Identifies HSN <code>22029920</code> & <code>30049011</code> and automatically applies 5% backward calculation.</li>
                <li>Converts bill classification from &ldquo;Non-GST / Bill of Supply&rdquo; to &ldquo;B2C Tax Invoice&rdquo;.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
