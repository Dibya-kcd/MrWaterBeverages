import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Hash, Landmark, ShoppingBag, Users, Zap } from "lucide-react";
import { Bill, Customer, OrganizationProfile, Product } from "../../../types";
import { money } from "../../../utils/billing";
import { useLedger } from "../../../context/LedgerContext";
import { RegisterCard, Pill } from "./mobile/ReportCards";
import {
  ReportBreakdownLine,
  ReportChipGroup,
  ReportFilterPanel,
  ReportStat,
  ReportStatGrid,
  ReportTitleBar,
} from "./ReportKit";
import { HeroCard, LegendDot, MiniStat, PhoneHeader, PhoneSearch, SplitBar } from "./mobile/PhoneKit";
import { SubPageBack, SubPageMenu, type SubPageCard } from "./mobile/SubPageMenu";
import { checkEwayInvoices, buildEwayBillJson, buildEinvoiceJson, EWAY_BILL_THRESHOLD } from "../../../utils/ewayBill";
import {
  buildGstLines,
  computeGstr3b,
  creditNoteSummary,
  exportCaGstPack,
  hsnSummary,
  orgStateCodeFromProfile,
  resolveLineGstRate,
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
  /** Phone only: which GST section is open as its own page (null = the list of section cards). */
  const [phoneOpen, setPhoneOpen] = useState<GstTab | null>(null);
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
  const hsnAll = useMemo(() => hsnSummary(lines), [lines]);
  const [search, setSearch] = useState("");
  const sq = search.trim().toLowerCase();
  const hsnRows = useMemo(
    () => (sq ? hsnAll.filter((r) => String(r.hsn).toLowerCase().includes(sq)) : hsnAll),
    [hsnAll, sq],
  );

  const b2bInvoices = invoices
    .filter((i) => i.isB2B)
    .filter(
      (i) =>
        !sq ||
        `${i.invoiceNo} ${i.customerName} ${i.customerGstin || ""}`.toLowerCase().includes(sq),
    );
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
  const { repairBillTotals, repairNonGstBillTaxes, convertBillsToTaxInvoices, recordMissingSeriesAsCancelled, cancelledBills, bills: allActiveBills } = useLedger();
  const [repairMsg, setRepairMsg] = useState<string | null>(null);
  const [seriesMsg, setSeriesMsg] = useState<string | null>(null);
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
        repairable = true;
      } else if (totalDiff > 1 && (b.retailer === "Free Sampling" || Number(b.discount) > 0)) {
        reason = `Bill discount of ₹${money(Number(b.discount) || 0)} was not factored into the lines. Saved ₹${money(salesTotal)} vs lines ₹${money(inv.invoiceTotal)}.`;
        repairable = true;
      } else if (taxDiff > 1) {
        reason = `Tax split mismatch: saved tax is ₹${money(salesTax)} (CGST ₹${money(b.cgst)} + SGST ₹${money(b.sgst)}) vs ₹${money(gstTax)} on invoice lines.`;
        repairable = true;
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
  const nonGstRepairable = mismatches.filter((m) => m.reason.startsWith("Non-GST invoice:"));

  const zeroGstBills = useMemo(() => {
    const zeroBillIds = new Set(
      lines
        .filter((l) => l.gstRatePct === 0 && (l.taxable > 0 || l.qty > 0))
        .map((l) => l.billId)
    );
    return filteredBills.filter((b) => {
      if (b.status === "cancelled" || !(b.items || []).length) return false;
      if (zeroBillIds.has(b.id)) return true;
      const isNonGst = b.invoiceType === "retail" || b.invoiceType === "bill_of_supply" || b.isGstInvoice === false;
      const zeroTaxStored = (Number(b.cgst) || 0) + (Number(b.sgst) || 0) < 0.01;
      return (isNonGst || zeroTaxStored) && (Number(b.total) || 0) > 0;
    });
  }, [filteredBills, lines]);

  const zeroUnits = useMemo(() => {
    const fromLines = lines.filter((l) => l.gstRatePct === 0).reduce((s, l) => s + (Number(l.qty) || 0), 0);
    if (fromLines > 0) return fromLines;
    return zeroGstBills.reduce((s, b) => s + (b.items || []).reduce((iq, it) => iq + (Number(it.qty) || 0), 0), 0);
  }, [lines, zeroGstBills]);

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

  const grnShown = (filteredGrns || []).filter(
    (g) =>
      !sq ||
      `${g.supplierName || ""} ${g.invoiceNo || ""} ${g.grnNumber || ""}`.toLowerCase().includes(sq),
  );
  const tableWrap = "rounded-2xl border border-black/10 bg-white overflow-x-auto";
  const th =
    "px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 text-left whitespace-nowrap bg-[#faf8f5]";
  const thR =
    "px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 text-right whitespace-nowrap bg-[#faf8f5]";
  const td = "px-3.5 py-2.5 text-[13px] text-slate-800";
  const tdR = "px-3.5 py-2.5 text-[13px] text-slate-800 text-right tabular-nums";
  const searchable = tab === "b2b" || tab === "hsn" || tab === "purchases";
  const searchHint =
    tab === "b2b" ? "Search invoice, party or GSTIN" : tab === "hsn" ? "Search HSN code" : "Search supplier or invoice no";
  const tabOptions = TABS.map((t) => ({ id: t.id, label: t.label }));
  const rs0 = (n: number) => `₹${money(n)}`;

  const gstCards: SubPageCard<GstTab>[] = [
    {
      id: "gstr3b",
      title: "GSTR-3B Summary",
      summary: `Output tax ${rs0(fromLines.outputGst)} less input credit ${rs0(fromLines.inputCredit)}, line by line as the return asks for it`,
      badge: `Payable ${rs0(fromLines.netPayable)}`,
      badgeTone: "red",
      icon: Landmark,
      tone: "indigo",
    },
    {
      id: "b2b",
      title: "B2B Invoices (with GSTIN)",
      summary: "Sales to GST-registered parties, invoice by invoice, for GSTR-1",
      badge: `${invoices.filter((i) => i.isB2B).length} invoices`,
      badgeTone: "blue",
      icon: FileText,
      tone: "blue",
    },
    {
      id: "b2c",
      title: "B2C Small Sales (without GSTIN)",
      summary: "Sales to shops and customers without a GSTIN, added up by tax rate",
      badge: `${b2cByRate.length} rate${b2cByRate.length === 1 ? "" : "s"}`,
      badgeTone: "amber",
      icon: Users,
      tone: "amber",
    },
    {
      id: "hsn",
      title: "HSN Summary",
      summary: "Quantity, taxable value and tax grouped by HSN code",
      badge: `${hsnAll.length} HSN code${hsnAll.length === 1 ? "" : "s"}`,
      badgeTone: "purple",
      icon: Hash,
      tone: "purple",
    },
    {
      id: "purchases",
      title: "Purchase Register (Input Credit)",
      summary: "Supplier invoices received in this period and the GST paid on them",
      badge: `${(filteredGrns || []).length} inward`,
      badgeTone: "green",
      icon: ShoppingBag,
      tone: "emerald",
    },
  ];

  return (
    <div className="flex flex-col gap-3 w-full" id="report-gst">
      {/* ============================ PHONE ============================ */}
      <div className="md:hidden space-y-3">
        {phoneOpen !== null ? (
          <SubPageBack backLabel="All GST sections" title={gstCards.find((c) => c.id === phoneOpen)?.title || "GST"} onBack={() => setPhoneOpen(null)} />
        ) : (
          <>
        <PhoneHeader title="GST" sub="Output tax and input tax credit summary" />
        <HeroCard tone="navy" label="Net GST payable" value={rs0(fromLines.netPayable)}>
          <SplitBar
            label="Output GST versus input credit"
            parts={[
              { value: fromLines.outputGst, className: "bg-rose-400" },
              { value: fromLines.inputCredit, className: "bg-emerald-400" },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/90">
            <LegendDot dot="bg-rose-400">Output {rs0(fromLines.outputGst)}</LegendDot>
            <LegendDot dot="bg-emerald-400">Input credit {rs0(fromLines.inputCredit)}</LegendDot>
          </div>
        </HeroCard>
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Output GST" value={rs0(fromLines.outputGst)} />
          <MiniStat label="Input credit" value={rs0(fromLines.inputCredit)} tone="green" />
          <MiniStat label="Non-GST sales" value={rs0(fromLines.taxableNil)} />
        </div>
        {fromLines.carryForwardItc > 0 && (
          <div className="px-1 text-xs font-semibold text-emerald-700">ITC carry-forward {rs0(fromLines.carryForwardItc)}</div>
        )}
        <SubPageMenu<GstTab>
          heading="GST sections"
          cards={gstCards}
          onOpen={(id) => {
            setTab(id);
            setSearch("");
            setPhoneOpen(id);
          }}
        />
        <button
          type="button"
          onClick={handleExport}
          className="w-full min-h-[48px] rounded-2xl border border-slate-200 bg-white text-[14px] font-bold text-slate-800 inline-flex items-center justify-center gap-2 cursor-pointer active:bg-slate-100"
        >
          <Download size={16} aria-hidden="true" /> Excel / CSV pack for CA
        </button>
        {exportMsg && <div className="text-xs font-semibold text-emerald-700 px-1">{exportMsg}</div>}
          </>
        )}
      </div>

      {/* ======================= TABLET / DESKTOP ======================= */}
      <div className="hidden md:block space-y-3">
        <ReportTitleBar
          title="GST"
          sub={`${formatPeriodLabel(periodLabel)} · GSTR-3B, B2B, B2C, HSN and purchase register`}
          actions={
            <>
              {exportMsg && <span className="text-xs font-semibold text-emerald-700">{exportMsg}</span>}
              <button
                type="button"
                onClick={handleExport}
                className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={13} aria-hidden="true" /> Excel / CSV pack for CA
              </button>
            </>
          }
        />
        <ReportStatGrid>
          <ReportStat label="Output GST" value={rs0(fromLines.outputGst)} tone="red" sub="tax on your sales" />
          <ReportStat label="Input credit" value={rs0(fromLines.inputCredit)} tone="green" sub="tax paid on purchases (ITC)" />
          <ReportStat
            label="Net payable"
            value={rs0(fromLines.netPayable)}
            sub={fromLines.carryForwardItc > 0 ? `ITC carry-forward ${rs0(fromLines.carryForwardItc)}` : "output − input credit"}
          />
          <ReportStat label="Non-GST sales" value={rs0(fromLines.taxableNil)} sub="nil rated / exempt" />
        </ReportStatGrid>
        <ReportBreakdownLine>
          <span>
            Output {rs0(fromLines.outputGst)} − Input credit {rs0(fromLines.inputCredit)} = Net payable {rs0(fromLines.netPayable)}
          </span>
        </ReportBreakdownLine>
      </div>

      {/* Warnings / helpers: on a phone they belong to the list screen, not inside a section page */}
      <div className={phoneOpen === null ? "contents" : "hidden md:contents"}>
      {zeroGstBills.length > 0 && (
        <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/90 p-4 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-bold text-rose-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>0% Non-GST Invoices Detected: ₹{money(fromLines.taxableNil)} ({zeroGstBills.length} bills · {zeroUnits} units)</span>
              </div>
              <div className="text-xs text-rose-800 leading-relaxed">
                Sales to village shops were saved as Non-GST / Retail bills with ₹0 tax. In GST law, MRP is tax-inclusive. Click below to backward-calculate 40% & 5% GST and legally merge these {zeroUnits} units into their proper tax rows.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const r = convertBillsToTaxInvoices(zeroGstBills.map((m) => m.id));
                setRepairMsg(`Done! ${r.fixed} invoice(s) converted to B2C Tax Invoices. Tax backward-calculated at 40% & 5%. The 0% row will now become ₹0.00.`);
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold whitespace-nowrap cursor-pointer transition-colors shadow-sm flex items-center justify-center gap-1.5 shrink-0"
            >
              <Zap className="w-4 h-4 text-amber-300 fill-current" />
              <span>Fix 0% Bills (Convert to Tax Invoices)</span>
            </button>
          </div>
          {repairMsg && <div className="text-xs font-semibold text-emerald-800">{repairMsg}</div>}
        </div>
      )}

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
            <>
              <div className="text-xs text-amber-900">
                No invoice exists for number(s): {series.missing.slice(0, 30).join(", ")}
                {series.missing.length > 30 ? "…" : ""}. A hole in the series has to be explained to the tax office (for
                example a number never used); check whether an invoice was deleted.
              </div>
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const count = recordMissingSeriesAsCancelled(series.missing);
                    setSeriesMsg(`${count} missing test invoice number(s) registered as Cancelled in series.`);
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
                >
                  Register {series.missing.length} missing test numbers as Cancelled in GSTR-1
                </button>
                {seriesMsg && <span className="text-xs font-semibold text-emerald-700">{seriesMsg}</span>}
              </div>
            </>
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
                  const r = repairBillTotals(repairable.map((m) => m.billId));
                  setRepairMsg(`${r.fixed} invoice(s) corrected${r.skipped ? `, ${r.skipped} left as they were` : ""}.`);
                }}
                className="px-3 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer transition-colors"
              >
                Fix {repairable.length} invoice(s) with a missing discount
              </button>
              {repairMsg && <span className="text-xs font-semibold text-emerald-700">{repairMsg}</span>}
            </div>
          )}
          {nonGstRepairable.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const r = convertBillsToTaxInvoices(nonGstRepairable.map((m) => m.billId));
                  setRepairMsg(`Done! ${r.fixed} invoice(s) converted to B2C Tax Invoices with GST recognized in report.`);
                }}
                className="px-3.5 py-1.5 rounded-full bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                Convert {nonGstRepairable.length} invoice(s) to B2C Tax Invoices (Include GST in returns)
              </button>
              <button
                type="button"
                onClick={() => {
                  const r = repairNonGstBillTaxes(nonGstRepairable.map((m) => m.billId));
                  setRepairMsg(`Done! ${r.fixed} Non-GST invoice(s) updated to ₹0.00 tax${r.skipped ? `, ${r.skipped} skipped` : ""}.`);
                }}
                className="px-3.5 py-1.5 rounded-full bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white text-xs font-medium cursor-pointer transition-colors shadow-xs"
              >
                Or Set stored tax to ₹0.00 (Keep as 0% Non-GST)
              </button>
              {repairMsg && <span className="text-xs font-semibold text-emerald-700">{repairMsg}</span>}
            </div>
          )}
        </div>
      )}

      </div>

      {phoneOpen !== null && searchable && (
        <div className="md:hidden space-y-3">
          <PhoneSearch value={search} onChange={setSearch} placeholder={searchHint} />
        </div>
      )}
      <div className="hidden md:block">
        <ReportFilterPanel
          search={searchable ? { value: search, onChange: setSearch, placeholder: searchHint } : undefined}
          isFiltered={searchable && sq.length > 0}
          onReset={() => setSearch("")}
        >
          <ReportChipGroup<GstTab> label="View" options={tabOptions} value={tab} onChange={setTab} />
        </ReportFilterPanel>
      </div>

      {/* Phone: the section body shows only after its card is opened. Tablet / desktop: always shown. */}
      <div className={`flex-col gap-3 ${phoneOpen === null ? "hidden md:flex" : "flex"}`}>
      {tab === "gstr3b" && (
        <>
        <div className="md:hidden space-y-3" id="gst-3b-cards">
          {(() => {
            const neg = (v: number) => `-₹${money(v)}`;
            const rows: { key: string; title: string; hero?: string; heroLabel?: string; heroTone?: "ink" | "green" | "red" | "amber"; stats: { label: string; value: string; tone?: "ink" | "green" | "red" | "amber" | "muted" }[] }[] = [
              { key: "a", title: "3.1(a) Outward taxable supplies", heroLabel: "Taxable", hero: `₹${money(fromLines.taxableGst)}`, stats: [
                { label: "IGST", value: `₹${money(fromLines.igst)}` }, { label: "CGST", value: `₹${money(fromLines.cgst)}` }, { label: "SGST", value: `₹${money(fromLines.sgst)}` }, { label: "Cess", value: `₹${money(fromLines.cess)}` } ] },
              { key: "c", title: "3.1(c) Nil rated / non-GST", heroLabel: "Taxable", hero: `₹${money(fromLines.taxableNil)}`, stats: [] },
              { key: "cn", title: "Less: credit notes issued", heroLabel: "Taxable", hero: neg(fromLines.cnTaxable), heroTone: "amber", stats: [
                { label: "IGST", value: neg(fromLines.cnIgst), tone: "amber" }, { label: "CGST", value: neg(fromLines.cnCgst), tone: "amber" }, { label: "SGST", value: neg(fromLines.cnSgst), tone: "amber" } ] },
              { key: "net", title: "Net output tax (after credit notes)", stats: [
                { label: "IGST", value: `₹${money(Math.max(0, fromLines.igst - fromLines.cnIgst))}` }, { label: "CGST", value: `₹${money(Math.max(0, fromLines.cgst - fromLines.cnCgst))}` }, { label: "SGST", value: `₹${money(Math.max(0, fromLines.sgst - fromLines.cnSgst))}` }, { label: "Cess", value: `₹${money(fromLines.cess)}` } ] },
              { key: "itc", title: `4(A)(5) ITC — all other${(gstTaxSummary.itcReversal?.total || 0) > 0 ? " (before reversal)" : ""}`, heroLabel: "Purchases", hero: `₹${money(purchaseStats.netPurchaseVal)}`, stats: [
                { label: "IGST", value: `₹${money(gstTaxSummary.itcReversal?.igst || 0)}`, tone: "green" }, { label: "CGST", value: `₹${money(fromLines.inputCredit / 2 + (gstTaxSummary.itcReversal?.cgst || 0))}`, tone: "green" }, { label: "SGST", value: `₹${money(fromLines.inputCredit / 2 + (gstTaxSummary.itcReversal?.sgst || 0))}`, tone: "green" }, { label: "Cess", value: `₹${money(purchaseStats.totalCessPaid || 0)}`, tone: "green" } ] },
            ];
            if ((gstTaxSummary.itcReversal?.total || 0) > 0) {
              rows.push({ key: "rev", title: "4(B)(2) ITC reversed — goods returned to suppliers", stats: [
                { label: "IGST", value: neg(gstTaxSummary.itcReversal!.igst), tone: "red" }, { label: "CGST", value: neg(gstTaxSummary.itcReversal!.cgst), tone: "red" }, { label: "SGST", value: neg(gstTaxSummary.itcReversal!.sgst), tone: "red" } ] });
            }
            rows.push({ key: "pay", title: "Net GST payable (net output − ITC)", heroLabel: "Payable", hero: `₹${money(fromLines.netPayable)}`, heroTone: "red", stats: [] });
            if (fromLines.carryForwardItc > 0) {
              rows.push({ key: "cf", title: "ITC carried forward to next period", heroLabel: "Carry forward", hero: `₹${money(fromLines.carryForwardItc)}`, heroTone: "green", stats: [] });
            }
            return rows.map((r) => (
              <RegisterCard key={r.key} title={<span className="text-[14px]">{r.title}</span>} heroLabel={r.heroLabel} hero={r.hero} heroTone={r.heroTone} stats={r.stats.length ? r.stats : undefined} />
            ));
          })()}
        </div>
        <div className={`hidden md:block ${tableWrap}`}>
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
        </>
      )}

      {tab === "b2b" && (
        <>
        <div className="md:hidden space-y-3" id="gst-b2b-cards">
          {b2bInvoices.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">Nothing for this month.</div>
          ) : (
            b2bInvoices.map((inv) => (
              <RegisterCard
                key={inv.billId}
                title={inv.customerName}
                subtitle={
                  <>
                    <div className="font-mono font-bold text-slate-900">{inv.invoiceNo}</div>
                    <div className="text-slate-500">
                      {inv.date}
                      {inv.customerGstin ? ` · ${inv.customerGstin}` : ""}
                    </div>
                  </>
                }
                heroLabel="Total"
                hero={`₹${money(inv.invoiceTotal)}`}
                stats={[
                  { label: "Taxable", value: `₹${money(inv.taxable)}` },
                  { label: "Tax", value: `₹${money(inv.cgst + inv.sgst + inv.igst + inv.cess)}`, tone: "amber" },
                ]}
              />
            ))
          )}
        </div>
        <div className={`hidden md:block ${tableWrap}`}>
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
        </>
      )}

      {tab === "b2c" && (
        <>
        <div className="md:hidden space-y-3" id="gst-b2c-cards">
          {b2cByRate.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">Nothing for this month.</div>
          ) : (
            b2cByRate.map((row) => (
              <RegisterCard
                key={`${row.rate}-${row.inter}`}
                title={row.inter ? "Inter-state" : "Intra-state"}
                pills={<Pill tone="blue">{row.rate % 1 === 0 ? row.rate.toFixed(0) : row.rate.toFixed(2)}% GST</Pill>}
                heroLabel="Taxable"
                hero={`₹${money(row.taxable)}`}
                stats={[
                  { label: "Tax", value: `₹${money(row.tax)}`, tone: "amber" },
                  { label: "Cess", value: `₹${money(row.cess)}`, tone: row.cess > 0 ? "amber" : "muted" },
                ]}
              />
            ))
          )}
        </div>
        <div className={`hidden md:block ${tableWrap}`}>
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
                {b2cByRate.map((row) => {
                  const isZeroWithFix = row.rate === 0 && zeroGstBills.length > 0;
                  return (
                    <tr key={`${row.rate}-${row.inter}`} className={isZeroWithFix ? "bg-rose-50/80 ring-1 ring-rose-300" : ""}>
                      <td className={td}>
                        <span>{row.inter ? "Inter-state" : "Intra-state"}</span>
                        {isZeroWithFix && (
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            Non-GST Error
                          </span>
                        )}
                      </td>
                      <td className={tdR}>
                        {row.rate % 1 === 0
                          ? row.rate.toFixed(0)
                          : row.rate.toFixed(2)}
                        %
                      </td>
                      <td className={tdR}>₹{money(row.taxable)}</td>
                      <td className={tdR}>₹{money(row.tax)}</td>
                      <td className={tdR}>
                        <div className="flex items-center justify-end gap-2">
                          <span>₹{money(row.cess)}</span>
                          {isZeroWithFix && (
                            <button
                              type="button"
                              onClick={() => {
                                const r = convertBillsToTaxInvoices(zeroGstBills.map((m) => m.id));
                                setRepairMsg(`Done! ${r.fixed} invoice(s) converted to B2C Tax Invoices. 0% row is now ₹0.00.`);
                              }}
                              className="px-2 py-0.5 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded cursor-pointer transition-colors shadow-xs"
                            >
                              Fix
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        </>
      )}

      {tab === "hsn" && (
        <>
        <div className="md:hidden space-y-3" id="gst-hsn-cards">
          {hsnRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">Nothing for this month.</div>
          ) : (
            hsnRows.map((row) => (
              <RegisterCard
                key={`${row.hsn}-${row.rate}`}
                title={<span className="font-mono">HSN {row.hsn}</span>}
                pills={<Pill tone="blue">{row.rate % 1 === 0 ? row.rate.toFixed(0) : row.rate.toFixed(2)}% GST</Pill>}
                heroLabel="Taxable"
                hero={`₹${money(row.taxable)}`}
                stats={[
                  { label: "Qty", value: row.qty },
                  { label: "Tax", value: `₹${money(row.cgst + row.sgst + row.igst)}`, tone: "amber" },
                  { label: "Cess", value: `₹${money(row.cess)}`, tone: row.cess > 0 ? "amber" : "muted" },
                ]}
              />
            ))
          )}
        </div>
        <div className={`hidden md:block ${tableWrap}`}>
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
                {hsnRows.map((row) => {
                  const isZeroHsn = row.rate === 0 && zeroGstBills.length > 0;
                  return (
                    <tr key={`${row.hsn}-${row.rate}`} className={isZeroHsn ? "bg-rose-50/70" : ""}>
                      <td className={`${td} font-mono`}>
                        <span>{row.hsn}</span>
                        {isZeroHsn && (
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            0% Error
                          </span>
                        )}
                      </td>
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
                      <td className={tdR}>
                        <div className="flex items-center justify-end gap-2">
                          <span>₹{money(row.cess)}</span>
                          {isZeroHsn && (
                            <button
                              type="button"
                              onClick={() => {
                                const r = convertBillsToTaxInvoices(zeroGstBills.map((m) => m.id));
                                setRepairMsg(`Done! ${r.fixed} invoice(s) converted to B2C Tax Invoices. 0% HSN lines merged into 40% & 5%.`);
                              }}
                              className="px-2 py-0.5 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded cursor-pointer transition-colors shadow-xs"
                            >
                              Fix
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        </>
      )}

      {tab === "purchases" && (
        <>
        <div className="md:hidden space-y-3" id="gst-purchase-cards">
          {!grnShown || grnShown.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">Nothing for this month.</div>
          ) : (
            [...grnShown]
              .sort((a, b) => String(b.inwardDate || "").localeCompare(String(a.inwardDate || "")))
              .map((g) => {
                const gst = Number(g.totalTax) || (Number(g.totalCgst) || 0) + (Number(g.totalSgst) || 0) + (Number(g.totalIgst) || 0);
                return (
                  <RegisterCard
                    key={g.id}
                    title={g.supplierName || "—"}
                    subtitle={
                      <>
                        <div className="font-mono font-bold text-slate-900">{g.invoiceNo || g.grnNumber || "—"}</div>
                        <div className="text-slate-500">{g.inwardDate || g.invoiceDate || "—"}</div>
                      </>
                    }
                    heroLabel="Total"
                    hero={`₹${money(Number(g.grandTotal) || 0)}`}
                    stats={[
                      { label: "Taxable", value: `₹${money(Number(g.totalTaxable) || Number(g.taxableAmount) || 0)}` },
                      { label: "GST (ITC)", value: `₹${money(gst)}`, tone: "green" },
                    ]}
                  />
                );
              })
          )}
        </div>
        <div className={`hidden md:block ${tableWrap}`}>
          {!grnShown || grnShown.length === 0 ? (
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
                {[...grnShown]
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
        </>
      )}

      </div>

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
