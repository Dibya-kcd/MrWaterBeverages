import { InventoryDisposition, OrganizationProfile } from "../types";
import { money } from "./billing";

export function daysOpen(eventDate?: string, compensatedAt?: string): number {
  const start = eventDate ? new Date(eventDate + "T00:00:00") : new Date();
  const end = compensatedAt ? new Date(compensatedAt + "T00:00:00") : new Date();
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function printDispositionClaimVoucher(
  rows: InventoryDisposition[],
  org?: OrganizationProfile | null
) {
  if (!rows.length) return;
  const supplier = rows[0].supplierName || "Supplier";
  const cnNo = rows.find((r) => r.creditNoteNumber)?.creditNoteNumber || "—";
  const cnDate = rows.find((r) => r.creditNoteDate)?.creditNoteDate || "—";
  const claimTotal = rows.reduce((s, r) => s + (Number(r.costValue) || 0), 0);
  const paidTotal = rows.reduce((s, r) => s + (Number(r.compensatedAmount) || 0), 0);
  const cgst = rows.reduce((s, r) => s + (Number(r.cnCgst) || 0), 0);
  const sgst = rows.reduce((s, r) => s + (Number(r.cnSgst) || 0), 0);
  const igst = rows.reduce((s, r) => s + (Number(r.cnIgst) || 0), 0);
  const taxable = rows.reduce((s, r) => s + (Number(r.cnTaxableValue) || 0), 0);

  const lineRows = rows
    .map(
      (r, i) =>
        "<tr><td>" +
        (i + 1) +
        "</td><td>" +
        escapeHtml(r.productName || "#" + r.productId) +
        "</td><td>" +
        escapeHtml(r.batchNumber || "—") +
        "</td><td>" +
        escapeHtml(r.warehouseName || "—") +
        "</td><td style=\"text-align:right\">" +
        r.quantity +
        "</td><td style=\"text-align:right\">" +
        money(r.costValue || 0) +
        "</td><td style=\"text-align:right\">" +
        money(r.compensatedAmount || 0) +
        "</td><td>" +
        escapeHtml((r.compensationStatus || "").replace("_", " ")) +
        "</td></tr>"
    )
    .join("");

  const html =
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Claim CN</title><style>" +
    "body{font-family:system-ui,sans-serif;padding:24px;font-size:12px;color:#0f172a}" +
    "table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px}" +
    "th{background:#f1f5f9;font-size:10px;text-transform:uppercase}.sum{margin-top:16px;width:280px;margin-left:auto}" +
    ".sum div{display:flex;justify-content:space-between;padding:3px 0}@media print{button{display:none}}</style></head><body>" +
    "<button onclick=\"window.print()\">Print</button>" +
    "<h1>" +
    escapeHtml(org?.name || "MrWater") +
    " — Supplier Claim / Credit Note</h1>" +
    "<p><strong>Supplier:</strong> " +
    escapeHtml(supplier) +
    " | <strong>CN:</strong> " +
    escapeHtml(cnNo) +
    " | <strong>Date:</strong> " +
    escapeHtml(cnDate) +
    "</p><table><thead><tr><th>#</th><th>Product</th><th>Batch</th><th>Godown</th><th>Qty</th><th>Claim</th><th>CN</th><th>Status</th></tr></thead><tbody>" +
    lineRows +
    "</tbody></table><div class=\"sum\">" +
    "<div><span>Claim value</span><strong>Rs " +
    money(claimTotal) +
    "</strong></div>" +
    "<div><span>Taxable</span><span>Rs " +
    money(taxable) +
    "</span></div>" +
    "<div><span>CGST</span><span>Rs " +
    money(cgst) +
    "</span></div>" +
    "<div><span>SGST</span><span>Rs " +
    money(sgst) +
    "</span></div>" +
    "<div><span>IGST</span><span>Rs " +
    money(igst) +
    "</span></div>" +
    "<div><span>Received</span><strong>Rs " +
    money(paidTotal) +
    "</strong></div>" +
    "<div><span>Outstanding</span><strong>Rs " +
    money(Math.max(0, claimTotal - paidTotal)) +
    "</strong></div></div>" +
    "<p style=\"color:#64748b;margin-top:24px\">Generated " +
    new Date().toLocaleString("en-IN") +
    "</p></body></html>";

  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function exportGstrCnCsv(rows: InventoryDisposition[], filename = "gstr-supplier-cn.csv") {
  const header = [
    "Event Date","Supplier","CN Number","CN Date","Product","Notes","Qty Cases",
    "Claim Value ExGST","Taxable","CGST","SGST","IGST","CN Total","Status","Type","Warehouse","Batch",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    if (!r.creditNoteNumber && !(Number(r.compensatedAmount) > 0)) continue;
    const cells = [
      r.eventDate || "",
      r.supplierName || "",
      r.creditNoteNumber || "",
      r.creditNoteDate || "",
      r.productName || String(r.productId),
      (r.notes || "").replace(/,/g, ";"),
      String(r.quantity || 0),
      String(Number(r.costValue) || 0),
      String(Number(r.cnTaxableValue) || 0),
      String(Number(r.cnCgst) || 0),
      String(Number(r.cnSgst) || 0),
      String(Number(r.cnIgst) || 0),
      String(Number(r.cnTotal) || Number(r.compensatedAmount) || 0),
      r.compensationStatus || "",
      r.dispositionType || "",
      r.warehouseName || "",
      r.batchNumber || "",
    ].map(csvEscape);
    lines.push(cells.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
