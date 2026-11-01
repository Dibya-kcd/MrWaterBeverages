import React, { useMemo, useState } from "react";
import { Calendar, Download } from "lucide-react";
import { Bill, Customer, OrganizationProfile, Product } from "../../../types";
import { money } from "../../../utils/billing";
import { useLedger } from "../../../context/LedgerContext";
import { checkEwayInvoices, buildEwayBillJson, buildEinvoiceJson, EWAY_BILL_THRESHOLD } from "../../../utils/ewayBill";
import {
  buildGstLines,
  computeGstr3b,
  creditNoteSummary,
  exportCaGstPack,
  hsnSummary,
  orgStateCodeFromProfile,
  summarizeInvoices, invoiceSeriesSummary } from "../../../utils/gstReports";

interface TaxReportProps {
  gstTaxSummary: {
    totalOutputGst: number;
    outputCgst: number;
    outputSgst: number;
    outputCess: number;
    inputGstCredit: number;
    /** ITC reversed for goods returned to suppliers (supplier credit notes) in the period. */
    itcReversal?: { cgst: number; sgst: number; igst: number; total: number };
    netGstPayable: number;
    outputTaxable: number;
  };
  purchaseStats: {
    netPurchaseVal: number;
    totalGstPaid: number;
    totalCessPaid: number;
  };
  filteredBills?: Bill[];
  filteredGrns?: any[];
  products?: Product[];
  customers?: Customer[];
  orgProfile?: OrganizationProfile | null;
  invoicePrefix?: string;
  periodLabel?: string;
}

type GstTab = "gstr3b" | "b2b" | "b2c" | "hsn" | "purchases";

const TABS: { id: GstTab; label: string }[] = [
  { id: "gstr3b", label: "GSTR-3B" },
  { id: "b2b", label: "B2B" },
  { id: "b2c", label: "B2C small" },
  { id: "hsn", label: "HSN summary" },
  { id: "purchases", label: "Purchase register" },
];

function formatPeriodLabel(label?: string): string {
  if (!label) return "This period";
  if (/^\d{4}-\d{2}$/.test(label)) {
    const [y, m] = label.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (label.includes("_to_")) return label.replace(/_/g, " ");
  return label;
}

export const TaxReport: React.FC<TaxReportProps> = ({
  gstTaxSummary,
  purchaseStats,
  filteredBills = [],
  filteredGrns = [],
  products = [],
  customers = [],
  orgProfile = null,
  invoicePrefix = "INV",
  periodLabel = "period",
}) => {
  const [tab, setTab] = useState<GstTab>("gstr3b");
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const orgStateCode = orgStateCodeFromProfile(orgProfile);
  const lines = useMemo(
    () =>
      buildGstLines(filteredBills, products, customers, invoicePrefix, {
        orgStateCode,
      }),
    [filteredBills, products, customers, invoicePrefix, orgStateCode],
  );
  const invoices = useMemo(() => summarizeInvoices(lines), [lines]);
  const hsnRows = useMemo(() => hsnSummary(lines), [lines]);

  const b2bInvoices = invoices.filter((i) => i.isB2B);
  const b2cLines = lines.filter((l) => !l.isB2B);

  const b2cByRate = useMemo(() => {
    const map = new Map<
      string,
      {
        rate: number;
        inter: boolean;
        taxable: number;
        tax: number;
        cess: number;
      }
    >();
    for (const l of b2cLines) {
      const key = `${l.gstRatePct}|${l.interState}`;
      const cur = map.get(key) || {
        rate: l.gstRatePct,
        inter: l.interState,
        taxable: 0,
        tax: 0,
        cess: 0,
      };
      cur.taxable += l.taxable;
      cur.tax += l.cgst + l.sgst + l.igst;
      cur.cess += l.cess;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.rate - a.rate || Number(a.inter) - Number(b.inter),
    );
  }, [b2cLines]);

  const fromLines = useMemo(() => {
    const cn = creditNoteSummary(filteredBills, lines, invoicePrefix);
    // Net ITC (after reversals). 0 is a real answer, so no "|| fallback" to the gross figure.
    const inputCredit = Number.isFinite(Number(gstTaxSummary.inputGstCredit))
      ? Number(gstTaxSummary.inputGstCredit)
      : Number(purchaseStats.totalGstPaid) || 0;
    return computeGstr3b(lines, cn, inputCredit);
  }, [
    lines,
    filteredBills,
    invoicePrefix,
    gstTaxSummary.inputGstCredit,
    purchaseStats.totalGstPaid,
  ]);

  // Reconciliation: every invoice must read the same in the GST report and in the sales report.
  // Any invoice where the two disagree is listed with the reason (no silent "ghost" amounts).
  const { repairBillTotals, cancelledBills, bills: allActiveBills } = useLedger();
  const [repairMsg, setRepairMsg] = useState<string | null>(null);
  const mismatches = useMemo(() => {
    const byId = new Map<number, Bill>();
    filteredBills.forEach((b) => byId.set(b.id, b));
    const out: {
      billId: number;
      invoiceNo: string;
      customer: string;
      gstTotal: number;
      salesTotal: number;
      gstTax: number;
      salesTax: number;
      reason: string;
      repairable: boolean;
    }[] = [];
    for (const inv of invoices) {
      const b = byId.get(inv.billId);
      if (!b) continue;
      const salesTotal = Number(b.total) || 0;
      const salesTax = (Number(b.cgst) || 0) + (Number(b.sgst) || 0);
      const gstTax = inv.cgst + inv.sgst + inv.igst;
      const totalDiff = Math.abs(inv.invoiceTotal - salesTotal);
      const taxDiff = Math.abs(gstTax - salesTax);
      if (totalDiff <= 1 && taxDiff <= 1) continue;
      const nonGst = b.invoiceType === "retail" || b.invoiceType === "bill_of_supply" || b.isGstInvoice === false;
      const extra = Number(b.additionalDiscount) || 0;
      let reason = "Saved totals differ from the invoice lines.";
      let repairable = false;
      if (extra > 0 && totalDiff > 1) {
        reason = `Invoice discount ₹${money(extra)} is not in the saved total (usually an old edit). Saved ₹${money(salesTotal)} vs lines ₹${money(inv.invoiceTotal)}.`;
        repairable = true;
      } else if (nonGst && taxDiff > 1) {
        reason = `Non-GST invoice: ₹${money(salesTax)} tax is stored on the bill (sales report) but the GST report shows ₹${money(gstTax)}.`;
      }
      out.push({
        billId: b.id,
        invoiceNo: inv.invoiceNo,
        customer: inv.customerName,
        gstTotal: inv.invoiceTotal,
        salesTotal,
        gstTax,
        salesTax,
        reason,
        repairable,
      });
    }
    return out;
  }, [invoices, filteredBills]);
  const repairable = mismatches.filter((m) => m.repairable);

  const series = useMemo(
    () => invoiceSeriesSummary(filteredBills, cancelledBills || [], allActiveBills || []),
    [filteredBills, cancelledBills, allActiveBills],
  );

  // E-way bill: invoices above Rs 50,000 need one before the goods move.
  const [ewayMsg, setEwayMsg] = useState<string | null>(null);
  const eway = useMemo(() => {
    if (!orgProfile) return { checks: [] as ReturnType<typeof checkEwayInvoices>, byId: new Map<number, string>() };
    const byId = new Map<number, string>();
    invoices.forEach((i) => byId.set(i.billId, i.invoiceNo));
    const noOf = (b: Bill) => byId.get(b.id) || `${invoicePrefix}-${b.id}`;
    return { checks: checkEwayInvoices(filteredBills, orgProfile, customers, noOf, products), byId };
  }, [filteredBills, orgProfile, customers, products, invoices, invoicePrefix]);
  const ewayPending = eway.checks.filter((c) => c.needed && !c.hasEwayBill);
  const ewayReady = ewayPending.filter((c) => c.problems.length === 0);
  const b2bNoIrn = filteredBills.filter(
    (b) => b.status !== "cancelled" && /^[0-9A-Z]{15}$/.test(b.customerGstin || "") && !b.irn,
  );
  const downloadEinvoiceJson = () => {
    if (!orgProfile || b2bNoIrn.length === 0) return;
    const json = buildEinvoiceJson(
      b2bNoIrn,
      orgProfile,
      customers,
      (b) => eway.byId.get(b.id) || `${invoicePrefix}-${b.id}`,
      products,
    );
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `e-invoices-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setEwayMsg(`${json.length} B2B invoice(s) exported for the e-invoice portal. After upload, enter each IRN on its invoice (Edit bill).`);
  };
  const downloadEwayJson = () => {
    if (!orgProfile || ewayReady.length === 0) return;
    const ids = new Set(ewayReady.map((c) => c.billId));
    const json = buildEwayBillJson(
      filteredBills.filter((b) => ids.has(b.id)),
      orgProfile,
      customers,
      (b) => eway.byId.get(b.id) || `${invoicePrefix}-${b.id}`,
      products,
    );
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eway-bills-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setEwayMsg(`${ewayReady.length} invoice(s) exported. Upload the file on the e-way bill portal (Generate in bulk), then enter each e-way bill number on its invoice (Edit bill).`);
  };

  const handleExport = () => {
    exportCaGstPack({
      bills: filteredBills,
      products,
      customers,
      org: orgProfile,
      invoicePrefix,
      periodLabel,
      inputGstCredit: fromLines.inputCredit,
    });
    setExportMsg("Excel / CSV pack downloaded for your CA");
    setTimeout(() => setExportMsg(null), 4000);
  };

  const cardCls =
    "rounded-2xl border border-black/8 bg-white shadow-sm px-3.5 py-3 min-w-0";
  const tableWrap =
    "rounded-2xl border border-black/8 bg-white shadow-sm overflow-x-auto";
  const th =
    "px-3 py-2.5 text-[11px] font-bold text-slate-500 text-left whitespace-nowrap";
  const thR =
    "px-3 py-2.5 text-[11px] font-bold text-slate-500 text-right whitespace-nowrap";
  const td = "px-3 py-2.5 text-sm text-slate-800";
  const tdR = "px-3 py-2.5 text-sm text-slate-800 text-right tabular-nums";

  return (
    <div className="flex flex-col gap-4 max-w-none lg:max-w-4xl mx-auto w-full">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            GST &amp; reports
          </h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-black/10 bg-white text-sm font-semibold text-slate-800">
          <Calendar size={15} className="text-slate-500" />
          {formatPeriodLabel(periodLabel)}
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-black/10 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
        >
          <Download size={15} />
          Excel / CSV
        </button>
        {exportMsg && (
          <span className="text-xs font-semibold text-emerald-700">{exportMsg}</span>
        )}
      </div>

      {series && (
        <div
          className={`rounded-2xl border p-4 space-y-1 ${
            series.missing.length > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
          }`}
        >
          <div className="text-sm font-bold text-slate-800">
            Invoice series · {series.from} to {series.to}
          </div>
          <div className="text-xs text-slate-600">
            {series.numbers} number(s): {series.active} issued, {series.cancelled} cancelled
            {series.missing.length > 0 ? `, ${series.missing.length} missing` : ", none missing"}. GSTR-1 asks for these
            figures under "documents issued".
          </div>
          {series.missing.length > 0 && (
            <div className="text-xs text-amber-900">
              No invoice exists for number(s): {series.missing.slice(0, 30).join(", ")}
              {series.missing.length > 30 ? "…" : ""}. A hole in the series has to be explained to the tax office (for
              example a number never used); check whether an invoice was deleted.
            </div>
          )}
        </div>
      )}

      {eway.checks.length > 0 && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 space-y-2">
          <div className="text-sm font-bold text-sky-900">
            E-way bill · invoices above ₹{money(EWAY_BILL_THRESHOLD)}: {eway.checks.filter((c) => c.needed).length} ·
            done: {eway.checks.filter((c) => c.hasEwayBill).length} · still needed: {ewayPending.length}
          </div>
          {ewayPending.length > 0 && (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {ewayPending.slice(0, 30).map((c) => (
                <div key={c.billId} className="text-xs rounded-lg bg-white/70 border border-sky-200 px-3 py-2">
                  <b>{c.invoiceNo}</b> · {c.customer} · ₹{money(c.total)}
                  {c.problems.length === 0 ? (
                    <span className="text-emerald-700 font-semibold"> — ready to export</span>
                  ) : (
                    <div className="text-sky-900/80">Fix first: {c.problems.join("; ")}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={ewayReady.length === 0}
              onClick={downloadEwayJson}
              className="px-3 py-1.5 rounded-full bg-sky-700 text-white text-xs font-bold cursor-pointer disabled:opacity-40"
            >
              Download e-way bill file ({ewayReady.length} ready)
            </button>
            <span className="text-[11px] text-sky-900/70">
              This is the portal's bulk-upload file; the app does not connect to the GST portal. Check it on the portal before generating.
            </span>
          </div>
          {ewayMsg && <div className="text-xs font-semibold text-emerald-700">{ewayMsg}</div>}
        </div>
      )}

      {orgProfile && b2bNoIrn.length > 0 && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 space-y-2">
          <div className="text-sm font-bold text-violet-900">
            E-invoice · {b2bNoIrn.length} B2B invoice(s) without an IRN
          </div>
          <div className="text-xs text-violet-900/80">
            Needed only if e-invoicing applies to your turnover. The app cannot create the IRN or QR code; it prepares the
            file for the e-invoice portal's bulk upload.
          </div>
          <button
            type="button"
            onClick={downloadEinvoiceJson}
            className="px-3 py-1.5 rounded-full bg-violet-700 text-white text-xs font-bold cursor-pointer"
          >
            Download e-invoice file ({b2bNoIrn.length})
          </button>
        </div>
      )}

      {mismatches.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2">
          <div className="text-sm font-bold text-amber-900">
            {mismatches.length} invoice(s) read differently in the GST report and the sales report
          </div>
          <div className="text-xs text-amber-900/80">
            These amounts are not the same on both reports. The reason is shown for each invoice.
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {mismatches.slice(0, 40).map((m) => (
              <div key={m.billId} className="text-xs rounded-lg bg-white/70 border border-amber-200 px-3 py-2">
                <b>{m.invoiceNo}</b> · {m.customer} — GST report ₹{money(m.gstTotal)} / sales report ₹{money(m.salesTotal)}
                <div className="text-amber-900/80">{m.reason}</div>
              </div>
            ))}
          </div>
          {repairable.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Recalculate the saved total, taxable value and GST of ${repairable.length} invoice(s) from their own lines and invoice discount?\n\nEach one is saved as an audited edit, and the customer's due follows the corrected total.`,
                    )
                  )
                    return;
                  const r = repairBillTotals(repairable.map((m) => m.billId));
                  setRepairMsg(`${r.fixed} invoice(s) corrected${r.skipped ? `, ${r.skipped} left as they were` : ""}.`);
                }}
                className="px-3 py-1.5 rounded-full bg-amber-600 text-white text-xs font-bold cursor-pointer"
              >
                Fix {repairable.length} invoice(s) with a missing discount
              </button>
              {repairMsg && <span className="text-xs font-semibold text-emerald-700">{repairMsg}</span>}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className={cardCls}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Output GST
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
            ₹{money(fromLines.outputGst)}
          </div>
        </div>
        <div className={cardCls}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Input credit
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-emerald-700 mt-1 tabular-nums">
            ₹{money(fromLines.inputCredit)}
          </div>
        </div>
        <div className={cardCls}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Net payable
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
            ₹{money(fromLines.netPayable)}
          </div>
          {fromLines.carryForwardItc > 0 && (
            <div className="text-[10px] font-semibold text-emerald-700 mt-0.5">
              ITC carry-forward ₹{money(fromLines.carryForwardItc)}
            </div>
          )}
        </div>
        <div className={cardCls}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Non-GST sales
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
            ₹{money(fromLines.taxableNil)}
          </div>
        </div>
      </div>

      <div className="w-full overflow-x-auto no-scrollbar">
        <div className="inline-flex min-w-min bg-[#ebe8e1] rounded-full p-1 gap-0.5">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer transition-all ${
                  active
                    ? "bg-[#0d4a3a] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "gstr3b" && (
        <div className={tableWrap}>
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-black/5">
                <th className={th}>Section</th>
                <th className={thR}>Taxable</th>
                <th className={thR}>IGST</th>
                <th className={thR}>CGST</th>
                <th className={thR}>SGST</th>
                <th className={thR}>Cess</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              <tr>
                <td className={td}>3.1(a) Outward taxable supplies</td>
                <td className={tdR}>₹{money(fromLines.taxableGst)}</td>
                <td className={tdR}>₹{money(fromLines.igst)}</td>
                <td className={tdR}>₹{money(fromLines.cgst)}</td>
                <td className={tdR}>₹{money(fromLines.sgst)}</td>
                <td className={tdR}>₹{money(fromLines.cess)}</td>
              </tr>
              <tr>
                <td className={td}>3.1(c) Nil rated / non-GST</td>
                <td className={tdR}>₹{money(fromLines.taxableNil)}</td>
                <td className={tdR}>₹0.00</td>
                <td className={tdR}>₹0.00</td>
                <td className={tdR}>₹0.00</td>
                <td className={tdR}>₹0.00</td>
              </tr>
              <tr>
                <td className={`${td} text-slate-500`}>
                  Less: credit notes issued
                </td>
                <td className={tdR}>-₹{money(fromLines.cnTaxable)}</td>
                <td className={tdR}>-₹{money(fromLines.cnIgst)}</td>
                <td className={tdR}>-₹{money(fromLines.cnCgst)}</td>
                <td className={tdR}>-₹{money(fromLines.cnSgst)}</td>
                <td className={tdR}>₹0.00</td>
              </tr>
              <tr className="bg-slate-50/60">
                <td className={`${td} font-semibold`}>
                  Net output tax (after credit notes)
                </td>
                <td className={tdR}></td>
                <td className={`${tdR} font-semibold`}>
                  ₹{money(Math.max(0, fromLines.igst - fromLines.cnIgst))}
                </td>
                <td className={`${tdR} font-semibold`}>
                  ₹{money(Math.max(0, fromLines.cgst - fromLines.cnCgst))}
                </td>
                <td className={`${tdR} font-semibold`}>
                  ₹{money(Math.max(0, fromLines.sgst - fromLines.cnSgst))}
                </td>
                <td className={`${tdR} font-semibold`}>
                  ₹{money(fromLines.cess)}
                </td>
              </tr>
              <tr>
                <td className={td}>4(A)(5) ITC — all other{(gstTaxSummary.itcReversal?.total || 0) > 0 ? ' (before reversal)' : ''}</td>
                <td className={tdR}>₹{money(purchaseStats.netPurchaseVal)}</td>
                <td className={tdR}>₹{money((gstTaxSummary.itcReversal?.igst || 0))}</td>
                <td className={tdR}>₹{money(fromLines.inputCredit / 2 + (gstTaxSummary.itcReversal?.cgst || 0))}</td>
                <td className={tdR}>₹{money(fromLines.inputCredit / 2 + (gstTaxSummary.itcReversal?.sgst || 0))}</td>
                <td className={tdR}>₹{money(purchaseStats.totalCessPaid || 0)}</td>
              </tr>
              {(gstTaxSummary.itcReversal?.total || 0) > 0 && (
                <tr>
                  <td className={`${td} text-rose-700`}>
                    4(B)(2) ITC reversed — goods returned to suppliers (credit notes)
                  </td>
                  <td className={tdR}></td>
                  <td className={`${tdR} text-rose-700`}>−₹{money(gstTaxSummary.itcReversal!.igst)}</td>
                  <td className={`${tdR} text-rose-700`}>−₹{money(gstTaxSummary.itcReversal!.cgst)}</td>
                  <td className={`${tdR} text-rose-700`}>−₹{money(gstTaxSummary.itcReversal!.sgst)}</td>
                  <td className={tdR}></td>
                </tr>
              )}
              <tr className="bg-slate-50/60">
                <td className={`${td} font-bold`}>
                  Net GST payable (net output − ITC)
                </td>
                <td className={tdR} colSpan={4}></td>
                <td className={`${tdR} font-bold`}>
                  ₹{money(fromLines.netPayable)}
                </td>
              </tr>
              {fromLines.carryForwardItc > 0 && (
                <tr>
                  <td className={`${td} text-emerald-700`}>
                    ITC carried forward to next period
                  </td>
                  <td className={tdR} colSpan={4}></td>
                  <td className={`${tdR} text-emerald-700 font-semibold`}>
                    ₹{money(fromLines.carryForwardItc)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "b2b" && (
        <div className={tableWrap}>
          {b2bInvoices.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              Nothing for this month.
            </div>
          ) : (
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-black/5">
                  <th className={th}>Invoice</th>
                  <th className={th}>Party</th>
                  <th className={th}>GSTIN</th>
                  <th className={thR}>Taxable</th>
                  <th className={thR}>Tax</th>
                  <th className={thR}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {b2bInvoices.map((inv) => (
                  <tr key={inv.billId}>
                    <td className={td}>
                      <div className="font-semibold">{inv.invoiceNo}</div>
                      <div className="text-[11px] text-slate-500">{inv.date}</div>
                    </td>
                    <td className={td}>{inv.customerName}</td>
                    <td className={`${td} font-mono text-xs`}>
                      {inv.customerGstin || "—"}
                    </td>
                    <td className={tdR}>₹{money(inv.taxable)}</td>
                    <td className={tdR}>
                      ₹{money(inv.cgst + inv.sgst + inv.igst + inv.cess)}
                    </td>
                    <td className={tdR}>₹{money(inv.invoiceTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "b2c" && (
        <div className={tableWrap}>
          {b2cByRate.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              Nothing for this month.
            </div>
          ) : (
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-black/5">
                  <th className={th}>Supply</th>
                  <th className={thR}>GST %</th>
                  <th className={thR}>Taxable</th>
                  <th className={thR}>Tax</th>
                  <th className={thR}>Cess</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {b2cByRate.map((row) => (
                  <tr key={`${row.rate}-${row.inter}`}>
                    <td className={td}>
                      {row.inter ? "Inter-state" : "Intra-state"}
                    </td>
                    <td className={tdR}>
                      {row.rate % 1 === 0
                        ? row.rate.toFixed(0)
                        : row.rate.toFixed(2)}
                      %
                    </td>
                    <td className={tdR}>₹{money(row.taxable)}</td>
                    <td className={tdR}>₹{money(row.tax)}</td>
                    <td className={tdR}>₹{money(row.cess)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "hsn" && (
        <div className={tableWrap}>
          {hsnRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              Nothing for this month.
            </div>
          ) : (
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-black/5">
                  <th className={th}>HSN</th>
                  <th className={thR}>GST %</th>
                  <th className={thR}>Qty</th>
                  <th className={thR}>Taxable</th>
                  <th className={thR}>Tax</th>
                  <th className={thR}>Cess</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {hsnRows.map((row) => (
                  <tr key={`${row.hsn}-${row.rate}`}>
                    <td className={`${td} font-mono`}>{row.hsn}</td>
                    <td className={tdR}>
                      {row.rate % 1 === 0
                        ? row.rate.toFixed(0)
                        : row.rate.toFixed(2)}
                      %
                    </td>
                    <td className={tdR}>{row.qty}</td>
                    <td className={tdR}>₹{money(row.taxable)}</td>
                    <td className={tdR}>
                      ₹{money(row.cgst + row.sgst + row.igst)}
                    </td>
                    <td className={tdR}>₹{money(row.cess)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "purchases" && (
        <div className={tableWrap}>
          {!filteredGrns || filteredGrns.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              Nothing for this month.
            </div>
          ) : (
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-black/5">
                  <th className={th}>Date</th>
                  <th className={th}>Supplier</th>
                  <th className={th}>Invoice</th>
                  <th className={thR}>Taxable</th>
                  <th className={thR}>GST</th>
                  <th className={thR}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {[...filteredGrns]
                  .sort((a, b) =>
                    String(b.inwardDate || "").localeCompare(
                      String(a.inwardDate || ""),
                    ),
                  )
                  .map((g) => {
                    const gst =
                      Number(g.totalTax) ||
                      (Number(g.totalCgst) || 0) +
                        (Number(g.totalSgst) || 0) +
                        (Number(g.totalIgst) || 0);
                    return (
                      <tr key={g.id}>
                        <td className={td}>
                          {g.inwardDate || g.invoiceDate || "—"}
                        </td>
                        <td className={td}>{g.supplierName || "—"}</td>
                        <td className={td}>
                          {g.invoiceNo || g.grnNumber || "—"}
                        </td>
                        <td className={tdR}>
                          ₹
                          {money(
                            Number(g.totalTaxable) ||
                              Number(g.taxableAmount) ||
                              0,
                          )}
                        </td>
                        <td className={tdR}>₹{money(gst)}</td>
                        <td className={tdR}>
                          ₹{money(Number(g.grandTotal) || 0)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Figures follow the selected report period (all bills in the period,
        whatever their payment status) and use the GST rate printed on each
        invoice, after any special discount. Credit notes are deducted from
        output tax; excess ITC is carried forward. B2B uses a valid GSTIN on the
        invoice or customer master; sales to a GSTIN of another state than your
        own are shown as IGST. Export downloads the invoice register, GSTR-1
        B2B / B2C (B2CL + B2CS) / credit notes / HSN / documents issued and the
        GSTR-3B summary for your CA.
      </p>
    </div>
  );
};
