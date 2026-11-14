import { HsnItem, GstRateSummary, InvoiceRecord } from '../types/gst';
import { INITIAL_HSN_DATA, GST_PURCHASE_ITC } from '../data/gstData';

export interface CalculatedGstSummary {
  // Sales by GST Rate
  rate40: GstRateSummary;
  rate5: GstRateSummary;
  rate0: GstRateSummary;
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalTax: number;
  totalGrossSales: number;

  // ITC & Tax Payable
  grossItc: number;
  reversedItc: number;
  netItc: number;
  outputTaxPayable: number;
  netCashPayable: number;
  creditCarriedForward: number;

  // HSN Summaries
  hsnList: Array<{
    hsn: string;
    description: string;
    rate: number;
    totalQty: number;
    totalTaxable: number;
    cgst: number;
    sgst: number;
    totalTax: number;
    hasConvertedUnits: boolean;
    convertedQty: number;
    convertedGross: number;
  }>;
}

/**
 * Computes the GSTR-1 & GSTR-3B summaries in either 'original' or 'rectified' state
 */
export function calculateGstState(isFixed: boolean, hsnData: HsnItem[] = INITIAL_HSN_DATA): CalculatedGstSummary {
  if (!isFixed) {
    // Original state matching user's screenshots
    const rate40: GstRateSummary = {
      rate: 40,
      taxable: 190339.29,
      cgst: 38067.86,
      sgst: 38067.86,
      totalTax: 76135.71
    };

    const rate5: GstRateSummary = {
      rate: 5,
      taxable: 75376.19,
      cgst: 1884.40,
      sgst: 1884.40,
      totalTax: 3768.81
    };

    const rate0: GstRateSummary = {
      rate: 0,
      taxable: 208095.00,
      cgst: 0.00,
      sgst: 0.00,
      totalTax: 0.00
    };

    const totalTaxable = rate40.taxable + rate5.taxable + rate0.taxable;
    const totalTax = rate40.totalTax + rate5.totalTax + rate0.totalTax;
    const totalCgst = rate40.cgst + rate5.cgst;
    const totalSgst = rate40.sgst + rate5.sgst;
    const totalGrossSales = totalTaxable + totalTax;

    const netItc = GST_PURCHASE_ITC.netItc;
    const netCashPayable = Math.max(0, totalTax - netItc);
    const creditCarriedForward = Math.max(0, netItc - totalTax);

    const hsnList = hsnData.map(item => ({
      hsn: item.hsn,
      description: item.description,
      rate: item.correctGstRate,
      totalQty: item.originalTaxableQty,
      totalTaxable: item.originalTaxableAmount,
      cgst: Number((item.originalTaxAmount / 2).toFixed(2)),
      sgst: Number((item.originalTaxAmount / 2).toFixed(2)),
      totalTax: item.originalTaxAmount,
      hasConvertedUnits: false,
      convertedQty: 0,
      convertedGross: 0
    }));

    return {
      rate40,
      rate5,
      rate0,
      totalTaxable,
      totalCgst,
      totalSgst,
      totalTax,
      totalGrossSales,
      grossItc: GST_PURCHASE_ITC.grossItc,
      reversedItc: GST_PURCHASE_ITC.reversedItc,
      netItc,
      outputTaxPayable: totalTax,
      netCashPayable,
      creditCarriedForward,
      hsnList
    };
  }

  // RECTIFIED STATE:
  // Backward-calculate each 0% item:
  // Taxable = Gross / (1 + Rate / 100)
  // Tax = Gross - Taxable
  let addedTaxable40 = 0;
  let addedTax40 = 0;

  let addedTaxable5 = 0;
  let addedTax5 = 0;

  const hsnList = hsnData.map(item => {
    const rateFactor = 1 + item.correctGstRate / 100;
    const convertedTaxable = Number((item.original0Taxable / rateFactor).toFixed(2));
    const convertedTax = Number((item.original0Taxable - convertedTaxable).toFixed(2));

    if (item.correctGstRate === 40) {
      addedTaxable40 += convertedTaxable;
      addedTax40 += convertedTax;
    } else {
      addedTaxable5 += convertedTaxable;
      addedTax5 += convertedTax;
    }

    const combinedTaxable = Number((item.originalTaxableAmount + convertedTaxable).toFixed(2));
    const combinedTax = Number((item.originalTaxAmount + convertedTax).toFixed(2));
    const combinedCgst = Number((combinedTax / 2).toFixed(2));
    const combinedSgst = Number((combinedTax / 2).toFixed(2));
    const totalQty = item.originalTaxableQty + item.original0Qty;

    return {
      hsn: item.hsn,
      description: item.description,
      rate: item.correctGstRate,
      totalQty,
      totalTaxable: combinedTaxable,
      cgst: combinedCgst,
      sgst: combinedSgst,
      totalTax: combinedTax,
      hasConvertedUnits: true,
      convertedQty: item.original0Qty,
      convertedGross: item.original0Taxable
    };
  });

  const finalTaxable40 = Number((190339.29 + addedTaxable40).toFixed(2));
  const finalTax40 = Number((76135.71 + addedTax40).toFixed(2));
  const finalCgst40 = Number((finalTax40 / 2).toFixed(2));
  const finalSgst40 = Number((finalTax40 / 2).toFixed(2));

  const finalTaxable5 = Number((75376.19 + addedTaxable5).toFixed(2));
  const finalTax5 = Number((3768.81 + addedTax5).toFixed(2));
  const finalCgst5 = Number((finalTax5 / 2).toFixed(2));
  const finalSgst5 = Number((finalTax5 / 2).toFixed(2));

  const rate40: GstRateSummary = {
    rate: 40,
    taxable: finalTaxable40,
    cgst: finalCgst40,
    sgst: finalSgst40,
    totalTax: finalTax40
  };

  const rate5: GstRateSummary = {
    rate: 5,
    taxable: finalTaxable5,
    cgst: finalCgst5,
    sgst: finalSgst5,
    totalTax: finalTax5
  };

  const rate0: GstRateSummary = {
    rate: 0,
    taxable: 0.00,
    cgst: 0.00,
    sgst: 0.00,
    totalTax: 0.00
  };

  const totalTaxable = Number((rate40.taxable + rate5.taxable).toFixed(2));
  const totalTax = Number((rate40.totalTax + rate5.totalTax).toFixed(2));
  const totalCgst = Number((rate40.cgst + rate5.cgst).toFixed(2));
  const totalSgst = Number((rate40.sgst + rate5.sgst).toFixed(2));
  const totalGrossSales = Number((totalTaxable + totalTax).toFixed(2));

  const netItc = GST_PURCHASE_ITC.netItc;
  const netCashPayable = Math.max(0, Number((totalTax - netItc).toFixed(2)));
  const creditCarriedForward = Math.max(0, Number((netItc - totalTax).toFixed(2)));

  return {
    rate40,
    rate5,
    rate0,
    totalTaxable,
    totalCgst,
    totalSgst,
    totalTax,
    totalGrossSales,
    grossItc: GST_PURCHASE_ITC.grossItc,
    reversedItc: GST_PURCHASE_ITC.reversedItc,
    netItc,
    outputTaxPayable: totalTax,
    netCashPayable,
    creditCarriedForward,
    hsnList
  };
}

/**
 * Downloads a CSV file in browser
 */
function downloadFile(content: string, filename: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export corrected GSTR-1 B2C Small Table
 */
export function exportB2cSmallCsv(summary: CalculatedGstSummary): void {
  const headers = ['Type', 'Place of Supply', 'Applicable % of Tax Rate', 'Rate (%)', 'Taxable Value (₹)', 'Cess Amount (₹)', 'CGST (₹)', 'SGST (₹)', 'Total Tax (₹)'];
  const rows = [
    ['OE (Other than E-Commerce)', 'Intra-State', '-', '40.00%', summary.rate40.taxable.toFixed(2), '0.00', summary.rate40.cgst.toFixed(2), summary.rate40.sgst.toFixed(2), summary.rate40.totalTax.toFixed(2)],
    ['OE (Other than E-Commerce)', 'Intra-State', '-', '5.00%', summary.rate5.taxable.toFixed(2), '0.00', summary.rate5.cgst.toFixed(2), summary.rate5.sgst.toFixed(2), summary.rate5.totalTax.toFixed(2)],
    ['OE (Other than E-Commerce)', 'Intra-State', '-', '0.00%', '0.00', '0.00', '0.00', '0.00', '0.00']
  ];

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  downloadFile(csv, 'GSTR1_Table7_B2C_Small_Rectified.csv');
}

/**
 * Export corrected HSN Table 12
 */
export function exportHsnSummaryCsv(summary: CalculatedGstSummary): void {
  const headers = ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value (₹)', 'Taxable Value (₹)', 'Integrated Tax (₹)', 'Central Tax (₹)', 'State/UT Tax (₹)', 'Cess (₹)'];
  const rows = summary.hsnList.map(item => [
    `"${item.hsn}"`,
    `"${item.description}"`,
    'OTH-OTHERS',
    item.totalQty,
    (item.totalTaxable + item.totalTax).toFixed(2),
    item.totalTaxable.toFixed(2),
    '0.00',
    item.cgst.toFixed(2),
    item.sgst.toFixed(2),
    '0.00'
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  downloadFile(csv, 'GSTR1_Table12_HSN_Summary_Rectified.csv');
}

/**
 * Export comprehensive CA Audit Report
 */
export function exportCaAuditReport(isFixed: boolean, summary: CalculatedGstSummary): void {
  const lines = [
    '========================================================================',
    'GST AUDIT RECONCILIATION & 0% INVOICE RECTIFICATION REPORT',
    'Invoice Series: 104 to 555 | Period: Current Tax Period',
    `Report Generation Timestamp: ${new Date().toLocaleString()}`,
    `Status: ${isFixed ? 'RECTIFIED & TAX-INCLUSIVE B2C COMPLIANT' : 'ORIGINAL (CONTAINS 0% RETAIL BILL ERROR)'}`,
    '========================================================================',
    '',
    '1. TAX LIABILITY & INPUT TAX CREDIT (ITC) BALANCE:',
    `Gross Output GST Tax: ₹${summary.outputTaxPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `Input Tax Credit (ITC) Available: ₹${summary.netItc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `Net Cash Tax Payable (After ITC): ₹${summary.netCashPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `Credit Carried Forward (Excess ITC): ₹${summary.creditCarriedForward.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    '',
    '2. SALES BY GST RATE (GSTR-1 TABLE 7 / GSTR-3B TABLE 3.1):',
    `40% Slab -> Taxable: ₹${summary.rate40.taxable.toFixed(2)} | CGST: ₹${summary.rate40.cgst.toFixed(2)} | SGST: ₹${summary.rate40.sgst.toFixed(2)} | Total Tax: ₹${summary.rate40.totalTax.toFixed(2)}`,
    `5% Slab  -> Taxable: ₹${summary.rate5.taxable.toFixed(2)} | CGST: ₹${summary.rate5.cgst.toFixed(2)} | SGST: ₹${summary.rate5.sgst.toFixed(2)} | Total Tax: ₹${summary.rate5.totalTax.toFixed(2)}`,
    `0% Slab  -> Taxable: ₹${summary.rate0.taxable.toFixed(2)} | CGST: ₹0.00 | SGST: ₹0.00 | Total Tax: ₹0.00`,
    `TOTAL SALES -> Taxable: ₹${summary.totalTaxable.toFixed(2)} | Total GST: ₹${summary.totalTax.toFixed(2)} | Gross Invoiced: ₹${summary.totalGrossSales.toFixed(2)}`,
    '',
    '3. HSN-WISE MERGED SUMMARY (TABLE 12):',
    ...summary.hsnList.map(h => 
      `HSN ${h.hsn} (${h.rate}%): Qty ${h.totalQty} units | Taxable: ₹${h.totalTaxable.toFixed(2)} | CGST: ₹${h.cgst.toFixed(2)} | SGST: ₹${h.sgst.toFixed(2)}`
    ),
    '',
    '4. LEGAL COMPLIANCE NOTE FOR CA / AUDITOR:',
    'The ₹2,08,095.00 previously declared as 0% (Nil-rated / Retail Bill) represents taxable goods (HSN 22021010, 22021090, 22029920, 30049011) sold to unregistered village retail shops.',
    'Under Section 31 of CGST Act, sales to unregistered persons must be recorded as B2C Tax Invoices with MRP treated as cum-tax.',
    'Backward tax calculation formula applied: Taxable = Gross / (1 + Rate), CGST = Tax/2, SGST = Tax/2.',
    'The additional output tax of ₹47,398.57 is completely set off against eligible Input Tax Credit of ₹1,30,659.85, resulting in ₹0.00 cash liability.',
    '========================================================================'
  ];

  downloadFile(lines.join('\r\n'), 'CA_GST_Audit_Reconciliation_Report.txt', 'text/plain;charset=utf-8;');
}

/**
 * Export Invoices register
 */
export function exportInvoicesRegisterCsv(invoices: InvoiceRecord[], isFixed: boolean): void {
  const headers = [
    'Invoice Number',
    'Customer Name',
    'HSN',
    'Description',
    'Quantity',
    'Gross Invoiced (₹)',
    'Bill Type',
    'GST Rate (%)',
    'Taxable Value (₹)',
    'CGST (₹)',
    'SGST (₹)',
    'Total Tax (₹)'
  ];

  const rows = invoices.map(inv => {
    if (!isFixed) {
      return [
        inv.invoiceNumber,
        `"${inv.customerName}"`,
        inv.hsn,
        `"${inv.hsnDescription}"`,
        inv.qty,
        inv.grossAmount.toFixed(2),
        `"${inv.originalBillType}"`,
        `${inv.originalGstRate}%`,
        inv.originalTaxable.toFixed(2),
        '0.00',
        '0.00',
        inv.originalTax.toFixed(2)
      ];
    } else {
      return [
        inv.invoiceNumber,
        `"${inv.customerName}"`,
        inv.hsn,
        `"${inv.hsnDescription}"`,
        inv.qty,
        inv.grossAmount.toFixed(2),
        `"${inv.rectifiedBillType}"`,
        `${inv.rectifiedGstRate}%`,
        inv.rectifiedTaxable.toFixed(2),
        inv.rectifiedCgst.toFixed(2),
        inv.rectifiedSgst.toFixed(2),
        inv.rectifiedTotalTax.toFixed(2)
      ];
    }
  });

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  downloadFile(csv, isFixed ? 'Rectified_Tax_Invoices_Register.csv' : 'Original_Invoices_Register.csv');
}
