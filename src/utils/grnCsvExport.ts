import { GRN, GrnLineItem, Warehouse } from '../types';
import { todayISO } from './dateLocal';

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads a comprehensive CSV for a single inward GRN with invoice metadata and full line-item details.
 */
export function downloadSingleGrnCsv(grn: GRN, warehouses?: Warehouse[]): void {
  const whName =
    warehouses?.find((w) => w.id === grn.warehouseId)?.name ||
    grn.warehouseName ||
    grn.warehouseId ||
    'Main Godown';

  const lines: string[] = [];

  // Metadata Section
  lines.push(['# INWARD GOODS RECEIVED NOTE (GRN)'].join(','));
  lines.push(['GRN Number', escapeCsv(grn.grnNumber || `GRN-${grn.id}`)].join(','));
  lines.push(['Supplier Invoice No', escapeCsv(grn.invoiceNo || '—')].join(','));
  lines.push(['Invoice Date', escapeCsv(grn.inwardDate || todayISO())].join(','));
  lines.push(['Supplier Name', escapeCsv(grn.supplierName || '—')].join(','));
  lines.push(['Supplier GSTIN', escapeCsv(grn.supplierGstin || '—')].join(','));
  lines.push(['Supplier Address', escapeCsv(grn.supplierAddress || '—')].join(','));
  lines.push(['Supplier Phone', escapeCsv(grn.supplierPhone || '—')].join(','));
  lines.push(['Godown / Warehouse', escapeCsv(whName)].join(','));
  lines.push(['Vehicle No', escapeCsv(grn.vehicleNo || '—')].join(','));
  lines.push(['Place of Supply', escapeCsv(grn.placeOfSupply || '—')].join(','));
  lines.push(['Total Inward Cases', grn.totalReceivedQty || 0].join(','));
  lines.push(['Total Taxable Value (INR)', Number(grn.totalTaxable || 0).toFixed(2)].join(','));
  lines.push(['Total CGST (INR)', Number(grn.totalCgst || 0).toFixed(2)].join(','));
  lines.push(['Total SGST (INR)', Number(grn.totalSgst || 0).toFixed(2)].join(','));
  lines.push(['Total Tax (INR)', Number(grn.totalTax || 0).toFixed(2)].join(','));
  lines.push(['Grand Total (INR)', Number(grn.grandTotal || 0).toFixed(2)].join(','));
  lines.push(''); // blank line separator

  // Items Header
  const headers = [
    'Line #',
    'SKU',
    'Product Description',
    'Category',
    'HSN Code',
    'Pack Type',
    'Volume (ml)',
    'Units Per Crate',
    'Billed Cases',
    'Free Scheme Cases',
    'Paid Cases',
    'Total Received Cases',
    'Unit Rate ex-GST (INR/cs)',
    'Scheme Type',
    'Scheme Details',
    'Discount Amount (INR)',
    'Taxable Value (INR)',
    'CGST %',
    'CGST Amount (INR)',
    'SGST %',
    'SGST Amount (INR)',
    'Total Tax (INR)',
    'Line Total (INR)',
    'Effective Cost ex-GST (INR/cs)',
    'Landed Cost incl-GST (INR/cs)',
    'Landed Cost Per Unit Bottle (INR)',
    'Batch Number',
    'Mfg Date',
    'Expiry Date',
  ];
  lines.push(headers.map(escapeCsv).join(','));

  const items: GrnLineItem[] = grn.items || [];
  items.forEach((it, idx) => {
    const paid = it.paidQty !== undefined ? it.paidQty : Math.max(0, it.qty - (it.freeQty || 0));
    const received = it.totalReceivedQty || it.qty;
    const cgstAmt = it.cgstAmount || 0;
    const sgstAmt = it.sgstAmount || 0;
    const totalTax = cgstAmt + sgstAmt;

    const row = [
      idx + 1,
      escapeCsv(it.sku || `SKU-${idx + 1}`),
      escapeCsv(it.productName),
      escapeCsv(it.category || 'energy'),
      escapeCsv(it.hsn || '22021090'),
      escapeCsv(it.pack || 'PET'),
      it.volume || 150,
      it.unitsPerCrate || 24,
      it.qty || 0,
      it.freeQty || 0,
      paid,
      received,
      Number(it.unitPrice || 0).toFixed(2),
      escapeCsv(it.schemeType || 'none'),
      escapeCsv(it.schemeText || '—'),
      Number(it.discountAmount || 0).toFixed(2),
      Number(it.taxableAmount || 0).toFixed(2),
      Number(it.cgstPercent || 0).toFixed(2),
      Number(cgstAmt).toFixed(2),
      Number(it.sgstPercent || 0).toFixed(2),
      Number(sgstAmt).toFixed(2),
      Number(totalTax).toFixed(2),
      Number(it.lineTotal || 0).toFixed(2),
      Number(it.effectiveCostPerCrateExGst || (received > 0 ? (it.taxableAmount || 0) / received : it.unitPrice || 0)).toFixed(2),
      Number(it.landedCostPerCrate || (received > 0 ? (it.lineTotal || 0) / received : 0)).toFixed(2),
      Number(it.landedCostPerUnit || 0).toFixed(2),
      escapeCsv(it.batchNumber || '—'),
      escapeCsv(it.mfgDate || '—'),
      escapeCsv(it.expiry || '—'),
    ];
    lines.push(row.map(escapeCsv).join(','));
  });

  const grnTag = (grn.grnNumber || `GRN-${grn.id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const invTag = (grn.invoiceNo || 'INV').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${grnTag}_${invTag}_${grn.inwardDate || todayISO()}.csv`;

  triggerDownload(lines.join('\n'), filename);
}

/**
 * Downloads all inward GRNs in a unified ERP / Tally-ready register CSV file.
 */
export function downloadAllGrnsCsv(grns: GRN[], warehouses?: Warehouse[]): void {
  const whMap = new Map<string, string>();
  (warehouses || []).forEach((w) => whMap.set(w.id, w.name));

  const headers = [
    'GRN Number',
    'Supplier Invoice No',
    'Invoice Date',
    'Supplier Name',
    'Supplier GSTIN',
    'Godown / Warehouse',
    'Vehicle No',
    'Line #',
    'SKU',
    'Product Description',
    'Category',
    'HSN Code',
    'Pack Type',
    'Volume (ml)',
    'Units Per Crate',
    'Billed Cases',
    'Free Cases',
    'Paid Cases',
    'Received Cases',
    'Unit Rate ex-GST (INR/cs)',
    'Scheme Details',
    'Discount Amount (INR)',
    'Taxable Value (INR)',
    'CGST %',
    'CGST (INR)',
    'SGST %',
    'SGST (INR)',
    'Total Tax (INR)',
    'Line Total (INR)',
    'Effective Cost ex-GST (INR/cs)',
    'Landed Cost (INR/cs)',
    'Batch Number',
    'Expiry Date',
    'GRN Total Cases',
    'GRN Grand Total (INR)',
  ];

  const lines: string[] = [headers.map(escapeCsv).join(',')];

  (grns || []).forEach((g) => {
    const whName = whMap.get(g.warehouseId) || g.warehouseName || g.warehouseId || 'Main Godown';
    const items = g.items && g.items.length > 0 ? g.items : [];

    if (items.length === 0) {
      // Row with header info only
      const row = [
        escapeCsv(g.grnNumber || `GRN-${g.id}`),
        escapeCsv(g.invoiceNo || '—'),
        escapeCsv(g.inwardDate || '—'),
        escapeCsv(g.supplierName || '—'),
        escapeCsv(g.supplierGstin || '—'),
        escapeCsv(whName),
        escapeCsv(g.vehicleNo || '—'),
        1,
        '—',
        'No item rows recorded',
        '—',
        '—',
        '—',
        0,
        24,
        g.totalBilledQty || 0,
        g.totalFreeQty || 0,
        g.totalPaidQty || 0,
        g.totalReceivedQty || 0,
        0,
        '—',
        0,
        Number(g.totalTaxable || 0).toFixed(2),
        0,
        Number(g.totalCgst || 0).toFixed(2),
        0,
        Number(g.totalSgst || 0).toFixed(2),
        Number(g.totalTax || 0).toFixed(2),
        Number(g.grandTotal || 0).toFixed(2),
        0,
        0,
        '—',
        '—',
        g.totalReceivedQty || 0,
        Number(g.grandTotal || 0).toFixed(2),
      ];
      lines.push(row.map(escapeCsv).join(','));
      return;
    }

    items.forEach((it, idx) => {
      const paid = it.paidQty !== undefined ? it.paidQty : Math.max(0, it.qty - (it.freeQty || 0));
      const received = it.totalReceivedQty || it.qty;
      const cgstAmt = it.cgstAmount || 0;
      const sgstAmt = it.sgstAmount || 0;
      const totalTax = cgstAmt + sgstAmt;

      const row = [
        escapeCsv(g.grnNumber || `GRN-${g.id}`),
        escapeCsv(g.invoiceNo || '—'),
        escapeCsv(g.inwardDate || '—'),
        escapeCsv(g.supplierName || '—'),
        escapeCsv(g.supplierGstin || '—'),
        escapeCsv(whName),
        escapeCsv(g.vehicleNo || '—'),
        idx + 1,
        escapeCsv(it.sku || `SKU-${idx + 1}`),
        escapeCsv(it.productName),
        escapeCsv(it.category || 'energy'),
        escapeCsv(it.hsn || '22021090'),
        escapeCsv(it.pack || 'PET'),
        it.volume || 150,
        it.unitsPerCrate || 24,
        it.qty || 0,
        it.freeQty || 0,
        paid,
        received,
        Number(it.unitPrice || 0).toFixed(2),
        escapeCsv(it.schemeText || it.schemeType || '—'),
        Number(it.discountAmount || 0).toFixed(2),
        Number(it.taxableAmount || 0).toFixed(2),
        Number(it.cgstPercent || 0).toFixed(2),
        Number(cgstAmt).toFixed(2),
        Number(it.sgstPercent || 0).toFixed(2),
        Number(sgstAmt).toFixed(2),
        Number(totalTax).toFixed(2),
        Number(it.lineTotal || 0).toFixed(2),
        Number(it.effectiveCostPerCrateExGst || (received > 0 ? (it.taxableAmount || 0) / received : it.unitPrice || 0)).toFixed(2),
        Number(it.landedCostPerCrate || (received > 0 ? (it.lineTotal || 0) / received : 0)).toFixed(2),
        escapeCsv(it.batchNumber || '—'),
        escapeCsv(it.expiry || '—'),
        g.totalReceivedQty || 0,
        Number(g.grandTotal || 0).toFixed(2),
      ];
      lines.push(row.map(escapeCsv).join(','));
    });
  });

  const filename = `Inward_GRN_Register_${todayISO()}.csv`;
  triggerDownload(lines.join('\n'), filename);
}

/**
 * Export draft review rows from BulkInwardModal before/after confirmation.
 */
export function downloadBulkInwardRowsCsv(
  rows: any[],
  meta?: {
    supplierName?: string;
    invoiceNo?: string;
    inwardDate?: string;
    warehouseName?: string;
  }
): void {
  const headers = [
    'Line #',
    'Product Description',
    'Category',
    'HSN Code',
    'Pack',
    'Volume (ml)',
    'Units/Case',
    'Billed Qty',
    'Free Scheme Qty',
    'Paid Qty',
    'Unit Rate ex-GST (INR)',
    'Scheme Type',
    'Scheme Note',
    'Discount (INR)',
    'Taxable (INR)',
    'CGST %',
    'SGST %',
    'Total Tax (INR)',
    'Line Total (INR)',
    'Wholesale Rate (INR)',
    'Retail Rate (INR)',
    'Batch Number',
    'Expiry Date',
  ];

  const lines: string[] = [];

  if (meta) {
    lines.push(['# BULK INWARD IMPORT DRAFT'].join(','));
    if (meta.supplierName) lines.push(['Supplier Name', escapeCsv(meta.supplierName)].join(','));
    if (meta.invoiceNo) lines.push(['Invoice No', escapeCsv(meta.invoiceNo)].join(','));
    if (meta.inwardDate) lines.push(['Invoice Date', escapeCsv(meta.inwardDate)].join(','));
    if (meta.warehouseName) lines.push(['Godown', escapeCsv(meta.warehouseName)].join(','));
    lines.push('');
  }

  lines.push(headers.map(escapeCsv).join(','));

  rows.forEach((r, idx) => {
    const cgst = Number(r.cgstPercent) || 0;
    const sgst = Number(r.sgstPercent) || 0;
    const taxAmt = (r.taxableAmount || 0) * ((cgst + sgst) / 100);

    const row = [
      idx + 1,
      escapeCsv(r.productName || r.rawName),
      escapeCsv(r.category || 'energy'),
      escapeCsv(r.hsn || '22021090'),
      escapeCsv(r.pack || 'PET'),
      r.volume || 150,
      r.unitsPerCrate || 24,
      r.qty || 0,
      r.freeQty || 0,
      r.paidQty !== undefined ? r.paidQty : Math.max(0, (r.qty || 0) - (r.freeQty || 0)),
      Number(r.unitPrice || 0).toFixed(2),
      escapeCsv(r.schemeType || 'none'),
      escapeCsv(r.schemeText || '—'),
      Number(r.discountAmount || 0).toFixed(2),
      Number(r.taxableAmount || 0).toFixed(2),
      cgst.toFixed(2),
      sgst.toFixed(2),
      taxAmt.toFixed(2),
      Number(r.lineTotal || 0).toFixed(2),
      Number(r.wholesaleRate || 0).toFixed(2),
      Number(r.retailRate || 0).toFixed(2),
      escapeCsv(r.batchNumber || '—'),
      escapeCsv(r.expiry || '—'),
    ];
    lines.push(row.map(escapeCsv).join(','));
  });

  const inv = (meta?.invoiceNo || 'Draft').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Inward_Import_${inv}_${todayISO()}.csv`;
  triggerDownload(lines.join('\n'), filename);
}
