import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronRight, Download } from 'lucide-react';
import { Bill, Customer, OrganizationProfile, Product } from '../../../types';
import { money } from '../../../utils/billing';
import {
  buildGstLines,
  exportCaGstPack,
  orgStateCodeFromProfile,
  summarizeInvoices,
} from '../../../utils/gstReports';
import { downloadPdf, downloadXlsx, fileStamp } from '../../../utils/reportDownload';
import { ReportDownloadButtons } from '../../common/ReportDownloadButtons';
import { ReportTitleBar, reportCard } from './ReportKit';

/**
 * GST in one screen:
 *   GST charged on sales  - GST on sales returns  = GST you owe
 *   GST paid on purchases - GST on goods returned to suppliers = Input credit
 *   GST to pay = GST you owe - Input credit   (extra credit is carried forward)
 *
 * Figures are the same ones the GSTR-3B screen and the CA Excel pack use (gstTaxSummary).
 * The B2B / B2C / HSN / purchase registers stay available behind one button for the CA.
 */

export interface SimpleGstReportProps {
  gstTaxSummary: {
    outputTaxable: number;
    outputCgst: number;
    outputSgst: number;
    outputIgst?: number;
    outputCess: number;
    totalOutputGst: number;
    creditNoteTax?: number;
    netOutputGst?: number;
    inputGstCredit: number;
    itcReversal?: { total: number };
    netGstPayable: number;
    carryForwardItc?: number;
  };
  purchaseStats: { netPurchaseVal: number; totalGstPaid: number; totalCessPaid: number };
  filteredBills: Bill[];
  products: Product[];
  customers: Customer[];
  orgProfile?: OrganizationProfile | null;
  invoicePrefix?: string;
  periodLabel: string;
  /** The full registers (B2B, B2C, HSN, purchases), shown only when asked for. */
  detail?: React.ReactNode;
}

const Row: React.FC<{ label: string; value: number; kind?: 'item' | 'less' | 'subtotal' | 'grand'; hint?: string }> = ({
  label,
  value,
  kind = 'item',
  hint,
}) => {
  const strong = kind === 'subtotal' || kind === 'grand';
  return (
    <div
      className={`flex items-start justify-between gap-3 px-3.5 py-2.5 border-t border-black/5 first:border-t-0 ${
        kind === 'grand' ? 'bg-slate-900 text-white' : kind === 'subtotal' ? 'bg-[#faf8f5]' : ''
      }`}
    >
      <div className="min-w-0">
        <div className={`leading-snug ${kind === 'grand' ? 'text-[15px] font-extrabold' : strong ? 'text-[14px] font-bold' : 'text-[14px] font-medium'}`}>
          {label}
        </div>
        {hint ? <div className={`text-xs leading-snug ${kind === 'grand' ? 'text-slate-300' : 'text-slate-500'}`}>{hint}</div> : null}
      </div>
      <div className={`tabular-nums whitespace-nowrap ${kind === 'grand' ? 'text-[16px] font-extrabold' : strong ? 'text-[14px] font-extrabold' : 'text-[14px] font-semibold'}`}>
        {kind === 'less' ? '− ' : ''}₹{money(Math.abs(value))}
      </div>
    </div>
  );
};

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-t border-black/5 first:border-t-0">
    {children}
  </div>
);

const th = 'px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 text-right whitespace-nowrap bg-[#faf8f5]';
const td = 'px-3 py-2 text-[13px] text-slate-800 text-right tabular-nums whitespace-nowrap';

export const SimpleGstReport: React.FC<SimpleGstReportProps> = ({
  gstTaxSummary: g,
  purchaseStats,
  filteredBills,
  products,
  customers,
  orgProfile = null,
  invoicePrefix = 'INV',
  periodLabel,
  detail,
}) => {
  const [showDetail, setShowDetail] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const orgStateCode = orgStateCodeFromProfile(orgProfile);
  const lines = useMemo(
    () => buildGstLines(filteredBills, products, customers, invoicePrefix, { orgStateCode }),
    [filteredBills, products, customers, invoicePrefix, orgStateCode],
  );

  const byRate = useMemo(() => {
    const m = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number; cess: number }>();
    for (const l of lines) {
      const cur = m.get(l.gstRatePct) || { rate: l.gstRatePct, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
      cur.taxable += l.taxable;
      cur.cgst += l.cgst;
      cur.sgst += l.sgst;
      cur.igst += l.igst;
      cur.cess += l.cess;
      m.set(l.gstRatePct, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.rate - a.rate);
  }, [lines]);
  const showIgst = byRate.some((r) => r.igst > 0.004) || (g.outputIgst || 0) > 0.004;
  const showCess = byRate.some((r) => r.cess > 0.004) || g.outputCess > 0.004;

  // Invoices whose saved total differs from the invoice lines (the GST report and the sales report would disagree).
  const mismatches = useMemo(() => {
    const byId = new Map<number, Bill>();
    filteredBills.forEach((b) => byId.set(b.id, b));
    const out: { invoiceNo: string; customer: string }[] = [];
    for (const inv of summarizeInvoices(lines)) {
      const b = byId.get(inv.billId);
      if (!b) continue;
      const totalDiff = Math.abs(inv.invoiceTotal - (Number(b.total) || 0));
      const taxDiff = Math.abs(inv.cgst + inv.sgst + inv.igst - ((Number(b.cgst) || 0) + (Number(b.sgst) || 0)));
      if (totalDiff > 1 || taxDiff > 1) out.push({ invoiceNo: inv.invoiceNo, customer: inv.customerName });
    }
    return out;
  }, [lines, filteredBills]);

  // Figures
  const outputIgst = g.outputIgst || 0;
  const grossOutput = g.totalOutputGst;
  const cnTax = g.creditNoteTax || 0;
  const netOutput = g.netOutputGst ?? Math.max(0, grossOutput - cnTax);
  const purchaseGst = purchaseStats.totalGstPaid + (purchaseStats.totalCessPaid || 0);
  const itcReversed = g.itcReversal?.total || 0;
  const inputCredit = g.inputGstCredit;
  const payable = g.netGstPayable;
  const carryForward = g.carryForwardItc ?? Math.max(0, inputCredit - netOutput);

  const exportRows = (): [string, number][] => [
    ['Taxable sales', g.outputTaxable],
    ['CGST on sales', g.outputCgst],
    ['SGST on sales', g.outputSgst],
    ...(showIgst ? ([['IGST on sales', outputIgst]] as [string, number][]) : []),
    ...(showCess ? ([['Cess on sales', g.outputCess]] as [string, number][]) : []),
    ['Total GST on sales', grossOutput],
    ['Less: GST on sales returns', cnTax],
    ['GST you owe on sales', netOutput],
    ['Taxable purchases', purchaseStats.netPurchaseVal],
    ['GST paid on purchases', purchaseGst],
    ['Less: reversed on goods returned to suppliers', itcReversed],
    ['Input credit', inputCredit],
    ['GST to pay', payable],
    ['Credit carried forward', carryForward],
  ];

  const exportExcel = () =>
    downloadXlsx(`gst-summary-${fileStamp()}.xlsx`, [
      {
        name: 'GST',
        header: ['Item', 'Amount (Rs.)'],
        rows: [['Period', periodLabel], ...exportRows().map(([a, b]) => [a, Math.round(b * 100) / 100] as (string | number)[])],
      },
      {
        name: 'By rate',
        header: ['GST rate %', 'Taxable', 'CGST', 'SGST', 'IGST', 'Cess'],
        rows: byRate.map((r) => [r.rate, r.taxable, r.cgst, r.sgst, r.igst, r.cess].map((n) => Math.round(n * 100) / 100)),
      },
    ]);

  const exportPdf = () =>
    downloadPdf({
      filename: `gst-summary-${fileStamp()}.pdf`,
      title: 'GST summary',
      subtitle: ['MrWater Distribution', `Period: ${periodLabel}`],
      sections: [
        { header: ['Item', 'Amount (Rs.)'], rows: exportRows().map(([a, b]) => [a, money(b)]), rightAlign: [1] },
        {
          title: 'Sales by GST rate',
          header: ['Rate', 'Taxable', 'CGST', 'SGST', 'IGST'],
          rows: byRate.map((r) => [`${r.rate}%`, money(r.taxable), money(r.cgst), money(r.sgst), money(r.igst)]),
          rightAlign: [1, 2, 3, 4],
        },
      ],
    });

  const downloadForCa = () => {
    exportCaGstPack({
      bills: filteredBills,
      products,
      customers,
      org: orgProfile,
      invoicePrefix,
      periodLabel,
      inputGstCredit: inputCredit,
    });
    setMsg('Excel / CSV pack downloaded for your CA');
    setTimeout(() => setMsg(null), 4000);
  };

  if (showDetail && detail) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowDetail(false)}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-700 hover:underline cursor-pointer"
        >
          <ArrowLeft size={15} /> Back to GST summary
        </button>
        {detail}
      </div>
    );
  }

  const owes = payable > 0.004;

  return (
    <div className="flex flex-col gap-3 w-full max-w-3xl" id="report-gst">
      <ReportTitleBar
        title="GST"
        sub={periodLabel}
        actions={
          <ReportDownloadButtons
            onExcel={exportExcel}
            onPdf={exportPdf}
            reportTitle="GST summary"
            whatsappText={`🧾 *GST — ${periodLabel}*\nGST on sales: ₹${money(netOutput)}\nInput credit: ₹${money(inputCredit)}\n*${owes ? 'GST to pay' : 'Credit carried forward'}: ₹${money(owes ? payable : carryForward)}*`}
          />
        }
      />

      {/* The one number that matters */}
      <div className={`${reportCard} p-4 ${owes ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {owes ? 'GST to pay' : 'No GST to pay'}
        </div>
        <div className={`text-3xl font-extrabold tabular-nums ${owes ? 'text-amber-800' : 'text-emerald-800'}`}>
          ₹{money(owes ? payable : 0)}
        </div>
        <div className="text-xs text-slate-600 mt-0.5">
          {owes
            ? `GST on sales ₹${money(netOutput)} less input credit ₹${money(inputCredit)}`
            : carryForward > 0.004
              ? `Input credit is more than GST on sales. ₹${money(carryForward)} carries forward.`
              : 'GST on sales and input credit are equal.'}
        </div>
      </div>

      {mismatches.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
          <div>
            <b>{mismatches.length} invoice{mismatches.length === 1 ? '' : 's'}</b> have a saved total that differs from their
            lines ({mismatches.slice(0, 3).map((m) => m.invoiceNo).join(', ')}
            {mismatches.length > 3 ? '…' : ''}), so GST here may not match the sales report.
            {detail && (
              <>
                {' '}
                <button type="button" onClick={() => setShowDetail(true)} className="font-bold underline cursor-pointer">
                  Review and fix
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* The statement */}
      <section className={`${reportCard} overflow-hidden`}>
        <Heading>GST on sales</Heading>
        <Row label="Taxable sales" value={g.outputTaxable} hint="Before GST, before returns" />
        <Row label="CGST" value={g.outputCgst} />
        <Row label="SGST" value={g.outputSgst} />
        {showIgst && <Row label="IGST" value={outputIgst} />}
        {showCess && <Row label="Cess" value={g.outputCess} />}
        {cnTax > 0.004 && (
          <>
            <Row label="Total GST on sales" value={grossOutput} kind="subtotal" />
            <Row label="GST on sales returns" value={cnTax} kind="less" hint="Credit notes issued to customers" />
          </>
        )}
        <Row label="GST you owe on sales" value={netOutput} kind="subtotal" />

        <Heading>Input credit on purchases</Heading>
        <Row label="GST paid on purchases" value={purchaseGst} hint={`On taxable purchases of ₹${money(purchaseStats.netPurchaseVal)}`} />
        {itcReversed > 0.004 && <Row label="Reversed on goods returned to suppliers" value={itcReversed} kind="less" />}
        <Row label="Input credit" value={inputCredit} kind="subtotal" />

        <Row
          label={owes ? 'GST to pay' : carryForward > 0.004 ? 'Credit carried forward' : 'GST to pay'}
          value={owes ? payable : carryForward}
          kind="grand"
        />
      </section>

      {byRate.length > 0 && (
        <section className={`${reportCard} overflow-hidden`}>
          <div className="px-3.5 py-2.5 text-[13px] font-bold text-slate-900 bg-[#faf8f5]">Sales by GST rate</div>
          <div className="overflow-x-auto border-t border-black/5">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Rate</th>
                  <th className={th}>Taxable</th>
                  <th className={th}>CGST</th>
                  <th className={th}>SGST</th>
                  {showIgst && <th className={th}>IGST</th>}
                  {showCess && <th className={th}>Cess</th>}
                </tr>
              </thead>
              <tbody>
                {byRate.map((r) => (
                  <tr key={r.rate} className="border-t border-black/5">
                    <td className="px-3 py-2 text-[13px] font-semibold text-slate-800">{r.rate}%</td>
                    <td className={td}>₹{money(r.taxable)}</td>
                    <td className={td}>₹{money(r.cgst)}</td>
                    <td className={td}>₹{money(r.sgst)}</td>
                    {showIgst && <td className={td}>₹{money(r.igst)}</td>}
                    {showCess && <td className={td}>₹{money(r.cess)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={downloadForCa}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-3.5 py-3 text-sm font-bold hover:bg-slate-800 cursor-pointer"
        >
          <Download size={15} /> Download for CA
        </button>
        {detail && (
          <button
            type="button"
            onClick={() => setShowDetail(true)}
            className="inline-flex flex-1 items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            <span>Invoice lists: B2B, B2C, HSN, purchases</span>
            <ChevronRight size={16} className="text-slate-400" />
          </button>
        )}
      </div>
      {msg && <div className="text-xs font-semibold text-emerald-700 px-1">{msg}</div>}
    </div>
  );
};
