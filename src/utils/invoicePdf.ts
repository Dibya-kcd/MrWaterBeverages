import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Bill, OrganizationProfile, BillingSettings } from '../types';
import { money, normalizeTo8DigitHsn, statusOf, cgstSgstLabels, freeStockInvoiceDisplay, nonGstSummary } from './billing';
import { billTaxBreakdown } from './gstReports';
import { todayISO } from "./dateLocal";
import { inrToWords, isBillGstInvoice } from './invoiceCommon';
import { generateReceiptPdf80, sharePdfFile } from './receipt80';

export { inrToWords, isBillGstInvoice };

// Convert numbers into Indian Currency words (e.g. "Rupees Ten Thousand Five Hundred Only")
const GST_STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh', '97': 'Other Territory',
};

export function generateInvoicePdf(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
  options?: { showBatch?: boolean }
): jsPDF {
  const isGst = isBillGstInvoice(bill, invoiceFormat);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  const invoiceNo = settings?.invoicePrefix
    ? `${settings.invoicePrefix}-${bill.id}`
    : isGst
    ? `INV-${bill.id}`
    : `RET-${bill.id}`;
  const orgName = org?.name || 'MrWater';
  const orgTagline = org?.tagline || 'Authorized Wholesale Beverage Distributor';
  const orgAddress = org?.address ? `${org.address}, ${org.city || ''}` : '';
  const orgPhone = org?.phone || '+91 98765 43210';
  const orgGstin = org?.gstin || '';
  const orgFssai = org?.fssai || '10020011000123';
  const orgState = org?.state || 'Odisha';
  const orgStateCode = org?.stateCode || (org?.gstin ? org.gstin.slice(0, 2) : '21');

  // 1. Header background box & branding
  doc.setFillColor(26, 54, 93); // Dark navy
  doc.rect(margin, margin, contentWidth, 24, 'F');

  // Title in header
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(orgName.toUpperCase(), margin + 5, margin + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(220, 230, 242);
  doc.text(orgTagline, margin + 5, margin + 13);
  doc.text(`${orgAddress} | Phone: ${orgPhone}`, margin + 5, margin + 18);
  if (isGst) {
    doc.text(`GSTIN: ${orgGstin}  |  FSSAI Lic. No: ${orgFssai}`, margin + 5, margin + 22);
  } else {
    doc.text(`FSSAI Lic. No: ${orgFssai}${orgGstin ? `  |  GSTIN: ${orgGstin}` : ''}`, margin + 5, margin + 22);
  }

  // Invoice Type Badge on top right
  const badgeWidth = isGst ? 40 : 48;
  const badgeX = pageWidth - margin - badgeWidth;
  if (isGst) {
    doc.setFillColor(217, 119, 6); // Warm Amber for Tax Invoice
  } else {
    doc.setFillColor(16, 128, 67); // Emerald Green for Retail Bill of Supply
  }
  doc.roundedRect(badgeX, margin + 4, badgeWidth, 16, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(isGst ? 'TAX INVOICE' : 'RETAIL BILL', badgeX + badgeWidth / 2, margin + 10, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(isGst ? '(Original for Recipient)' : '(Non-GST / B2C Cash Memo)', badgeX + badgeWidth / 2, margin + 14.5, { align: 'center' });

  // 2. Invoice Meta & Customer Details Grid (Two columns)
  let y = margin + 27;
  const colWidth = contentWidth / 2;

  // Box for Bill To
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, colWidth, 24, 'FD');
  doc.rect(margin + colWidth, y, colWidth, 24, 'FD');

  // Party Details (Left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('BILLED TO (PARTY DETAILS):', margin + 4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(bill.retailer || 'Cash Retailer', margin + 4, y + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  if (bill.phone) {
    doc.text(`Contact / WhatsApp: ${bill.phone}`, margin + 4, y + 16);
  } else {
    doc.text('Counter Cash Sale', margin + 4, y + 16);
  }
  const buyerStateCode = bill.customerGstin && bill.customerGstin.length >= 2
    ? bill.customerGstin.slice(0, 2)
    : orgStateCode;
  // Name the buyer's state from the GSTIN state code. Previously anything other than Odisha fell
  // back to the SELLER's state name, so an interstate invoice printed e.g. "Odisha (29)".
  const buyerState =
    (bill as any).customerState ||
    (buyerStateCode === orgStateCode ? orgState : GST_STATE_NAMES[buyerStateCode] || `State code ${buyerStateCode}`);

  if (isGst && bill.customerGstin) {
    doc.text(`Buyer GSTIN: ${bill.customerGstin} | State: ${buyerState} (${buyerStateCode})`, margin + 4, y + 20.5);
  } else {
    doc.text(`Supply: B2C Retail Customer | State: ${orgState} (${orgStateCode})`, margin + 4, y + 20.5);
  }

  // Invoice Details (Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('INVOICE CREDENTIALS:', margin + colWidth + 4, y + 5);

  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(isGst ? 'Invoice No:' : 'Bill No:', margin + colWidth + 4, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.text(invoiceNo, margin + colWidth + 30, y + 11);

  doc.setFont('helvetica', 'normal');
  doc.text('Date of Issue:', margin + colWidth + 4, y + 16);
  doc.setFont('helvetica', 'bold');
  doc.text(bill.date || todayISO(), margin + colWidth + 30, y + 16);

  const status = statusOf(bill.total, bill.amountPaid);
  doc.setFont('helvetica', 'normal');
  doc.text('Payment Status:', margin + colWidth + 4, y + 20.5);
  doc.setFont('helvetica', 'bold');
  if (status.label === 'Paid') {
    doc.setTextColor(16, 128, 67);
  } else if (status.label === 'Credit') {
    doc.setTextColor(180, 40, 40);
  } else {
    doc.setTextColor(180, 100, 0);
  }
  doc.text(`${status.label.toUpperCase()} (Paid: Rs. ${money(bill.amountPaid)})`, margin + colWidth + 30, y + 20.5);

  y += 27;

  // Transport line: vehicle, e-way bill and transporter (printed only when there is something to show).
  const transportBits = [
    bill.vehicle ? `Vehicle No: ${bill.vehicle}` : '',
    bill.ewayBillNo ? `E-Way Bill No: ${bill.ewayBillNo}` : '',
    bill.irn ? `IRN: ${bill.irn}` : '',
    bill.transporterName ? `Transporter: ${bill.transporterName}` : '',
    bill.transportDistanceKm ? `Distance: ${bill.transportDistanceKm} km` : '',
  ].filter(Boolean);
  if (transportBits.length > 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(transportBits.join('     '), margin + 4, y + 3.5);
    y += 7;
  }

  // 3. Line Items Table using autotable
  const tableHead = isGst
    ? [
        [
          { content: '#', styles: { halign: 'center' as const } },
          { content: 'Description of Goods & Packs', styles: { halign: 'left' as const } },
          { content: 'HSN', styles: { halign: 'center' as const } },
          { content: 'Total Crates', styles: { halign: 'center' as const } },
          { content: 'Free (Incl.)', styles: { halign: 'center' as const } },
          { content: 'Rate (Rs)', styles: { halign: 'right' as const } },
          { content: 'Gross (Rs)', styles: { halign: 'right' as const } },
          { content: 'Scheme (Rs)', styles: { halign: 'right' as const } },
          { content: 'GST %', styles: { halign: 'center' as const } },
          { content: 'GST (Rs)', styles: { halign: 'right' as const } },
          { content: 'Amount (Rs)', styles: { halign: 'right' as const } },
        ],
      ]
    : [
        [
          { content: '#', styles: { halign: 'center' as const } },
          { content: 'Description of Goods & Packs', styles: { halign: 'left' as const } },
          { content: 'Total Crates', styles: { halign: 'center' as const } },
          { content: 'Free (Incl.)', styles: { halign: 'center' as const } },
          { content: 'Rate (Rs)', styles: { halign: 'right' as const } },
          { content: 'Gross (Rs)', styles: { halign: 'right' as const } },
          { content: 'Discount (Rs)', styles: { halign: 'right' as const } },
          { content: 'Net Total (Rs)', styles: { halign: 'right' as const } },
        ],
      ];

  // Per-line GST (rate and amount) and the tax summary by HSN / rate. GST is charged on the paid
  // value plus the free scheme cases carried in the line; the line's stored rate is what was billed.
  const taxBreakdown = isGst ? billTaxBreakdown(bill, []) : null;

  const tableBody = bill.items.map((it, idx) => {
    const d = freeStockInvoiceDisplay(it);
    const lineTax = taxBreakdown?.lines[idx];

    const shouldShowLot =
      options?.showBatch !== undefined
        ? options.showBatch
        : (settings?.showBatchOnInvoice ?? false);
    const lot = shouldShowLot && it.batchNumber ? `\nLot: ${it.batchNumber}${it.expiryDate ? ` (Exp: ${it.expiryDate})` : ''}` : '';
    const itemDesc = d.isFreeStock
      ? `${it.productName}${lot}\nFREE STOCK · 100% scheme discount${d.schemeNote ? `\n${d.schemeNote}` : ''}`
      : it.freeQty > 0
        ? `${it.productName}${lot}\nIncluded in total crates: ${it.freeQty} free (${Math.max(0, it.qty - it.freeQty)} billed + ${it.freeQty} free)`
        : `${it.productName}${lot}${it.promoLabel ? `\n* ${it.promoLabel}` : ''}`;

    if (isGst) {
      return [
        { content: String(idx + 1), styles: { halign: 'center' as const } },
        {
          content: itemDesc,
          styles: {
            halign: 'left' as const,
            fontStyle: 'bold' as const,
            textColor: d.isFreeStock ? ([5, 150, 105] as [number, number, number]) : ([30, 41, 59] as [number, number, number]),
          },
        },
        { content: normalizeTo8DigitHsn(it.hsn || lineTax?.hsn, it.category, it.productName), styles: { halign: 'center' as const } },
        { content: d.qtyLabel, styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        {
          content: d.isFreeStock ? d.freeLabel : d.freeLabel === '—' ? '-' : d.freeLabel,
          styles: { halign: 'center' as const, textColor: [180, 100, 0] as [number, number, number] },
        },
        { content: money(d.rate), styles: { halign: 'right' as const } },
        { content: money(d.gross), styles: { halign: 'right' as const } },
        {
          content: d.isFreeStock ? `100% (-${money(d.discount)})` : d.discount > 0 ? `-${money(d.discount)}` : '-',
          styles: { halign: 'right' as const, textColor: [180, 100, 0] as [number, number, number] },
        },
        {
          content: lineTax && lineTax.ratePct > 0 && !d.isFreeStock ? `${lineTax.ratePct}%` : '-',
          styles: { halign: 'center' as const },
        },
        {
          content: lineTax && lineTax.tax > 0 && !d.isFreeStock ? money(lineTax.tax) : '-',
          styles: { halign: 'right' as const },
        },
        {
          content: d.isFreeStock ? '0.00 FREE' : money(d.amount),
          styles: {
            halign: 'right' as const,
            fontStyle: 'bold' as const,
            textColor: d.isFreeStock ? ([5, 150, 105] as [number, number, number]) : ([30, 41, 59] as [number, number, number]),
          },
        },
      ];
    } else {
      // Non-GST Retail clean format
      return [
        { content: String(idx + 1), styles: { halign: 'center' as const } },
        {
          content: itemDesc,
          styles: {
            halign: 'left' as const,
            fontStyle: 'bold' as const,
            textColor: d.isFreeStock ? ([5, 150, 105] as [number, number, number]) : ([30, 41, 59] as [number, number, number]),
          },
        },
        { content: d.qtyLabel, styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        {
          content: d.isFreeStock ? d.freeLabel : d.freeLabel === '—' ? '-' : d.freeLabel,
          styles: { halign: 'center' as const, textColor: [180, 100, 0] as [number, number, number] },
        },
        { content: money(d.rate), styles: { halign: 'right' as const } },
        { content: money(d.gross), styles: { halign: 'right' as const } },
        {
          content: d.isFreeStock ? `100% (-${money(d.discount)})` : d.discount > 0 ? `-${money(d.discount)}` : '-',
          styles: { halign: 'right' as const, textColor: [180, 100, 0] as [number, number, number] },
        },
        {
          content: d.isFreeStock ? '0.00 FREE' : money(d.amount),
          styles: {
            halign: 'right' as const,
            fontStyle: 'bold' as const,
            textColor: d.isFreeStock ? ([5, 150, 105] as [number, number, number]) : ([30, 41, 59] as [number, number, number]),
          },
        },
      ];
    }
  });

  const columnStyles = isGst
    ? {
        0: { cellWidth: 7 },
        1: { cellWidth: 38 },
        2: { cellWidth: 16 },
        3: { cellWidth: 14 },
        4: { cellWidth: 14 },
        5: { cellWidth: 15 },
        6: { cellWidth: 17 },
        7: { cellWidth: 16 },
        8: { cellWidth: 13 },
        9: { cellWidth: 15 },
        10: { cellWidth: 21 },
      }
    : {
        0: { cellWidth: 7 },
        1: { cellWidth: 65 },
        2: { cellWidth: 18 },
        3: { cellWidth: 18 },
        4: { cellWidth: 18 },
        5: { cellWidth: 20 },
        6: { cellWidth: 18 },
        7: { cellWidth: 22 },
      };

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    headStyles: {
      fillColor: isGst ? [26, 54, 93] : [15, 76, 58], // Dark navy for GST, deep emerald for Retail
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles,
    margin: { left: margin, right: margin },
  });

  // Tax summary by HSN and rate (GST invoices)
  if (taxBreakdown && taxBreakdown.isTaxed && taxBreakdown.summary.length > 0) {
    const sum = taxBreakdown.summary;
    const totTaxable = sum.reduce((a, r) => a + r.taxable, 0);
    const totCgst = sum.reduce((a, r) => a + r.cgst, 0);
    const totSgst = sum.reduce((a, r) => a + r.sgst, 0);
    const totTax = sum.reduce((a, r) => a + r.tax, 0);
    const halfPct = (r: number) => (Number.isInteger(r / 2) ? String(r / 2) : (r / 2).toFixed(2).replace(/\.?0+$/, ''));
    autoTable(doc, {
      startY: ((doc as any).lastAutoTable?.finalY ?? y) + 3,
      head: [[
        { content: 'HSN', styles: { halign: 'left' as const } },
        { content: 'GST Rate', styles: { halign: 'center' as const } },
        { content: 'Cases', styles: { halign: 'center' as const } },
        { content: 'Taxable (Rs)', styles: { halign: 'right' as const } },
        { content: 'CGST (Rs)', styles: { halign: 'right' as const } },
        { content: 'SGST (Rs)', styles: { halign: 'right' as const } },
        { content: 'Total GST (Rs)', styles: { halign: 'right' as const } },
      ]],
      body: [
        ...sum.map((r) => [
          { content: r.hsn, styles: { halign: 'left' as const } },
          { content: r.ratePct > 0 ? `${r.ratePct}% (${halfPct(r.ratePct)}+${halfPct(r.ratePct)})` : '0%', styles: { halign: 'center' as const } },
          { content: String(r.qty), styles: { halign: 'center' as const } },
          { content: money(r.taxable), styles: { halign: 'right' as const } },
          { content: money(r.cgst), styles: { halign: 'right' as const } },
          { content: money(r.sgst), styles: { halign: 'right' as const } },
          { content: money(r.tax), styles: { halign: 'right' as const } },
        ]),
        [
          { content: 'Total', styles: { halign: 'left' as const, fontStyle: 'bold' as const } },
          { content: '', styles: {} },
          { content: String(sum.reduce((a, r) => a + r.qty, 0)), styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
          { content: money(totTaxable), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
          { content: money(totCgst), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
          { content: money(totSgst), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
          { content: money(totTax), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.6, lineColor: [203, 213, 225], lineWidth: 0.2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      margin: { left: margin, right: margin },
    });
  }

  // Calculate table end position
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 4 : y + 50;

  // 4. Totals and Summary Box (Right aligned table) + Amount in words & Bank (Left aligned)
  const summaryWidth = 84;
  const summaryX = pageWidth - margin - summaryWidth;

  // Left column info: Amount in words & Bank Info
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, finalY, contentWidth - summaryWidth - 5, 42, 1, 1, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('AMOUNT IN WORDS:', margin + 4, finalY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  const words = inrToWords(bill.total);
  const splitWords = doc.splitTextToSize(words, contentWidth - summaryWidth - 14);
  doc.text(splitWords, margin + 4, finalY + 10);

  // Bank & UPI details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('BANK & DIGITAL SETTLEMENT:', margin + 4, finalY + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  const upiText = org?.upiId ? `UPI ID: ${org.upiId}` : '';
  const bankText = org?.bankName
    ? `Bank: ${org.bankName} | A/c: ${org.accountNumber || '—'} | IFSC: ${org.ifsc || '—'}`
    : 'Bank: HDFC Bank Ltd | A/c: 50200088991122 | IFSC: HDFC0001234';
  doc.text(upiText, margin + 4, finalY + 25);
  doc.text(bankText, margin + 4, finalY + 29.5);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Scan & Pay via any UPI App (GPay, PhonePe, Paytm, BHIM)', margin + 4, finalY + 34);
  doc.text(
    isGst
      ? 'Payment terms: Strictly against delivery / within agreed credit days.'
      : 'Prices inclusive of all taxes. (Non-GST / B2C Retail Cash Memo)',
    margin + 4,
    finalY + 38
  );

  // Right column: Financial Summary breakdown
  const boxHeight = 46;
  doc.setFillColor(248, 250, 252);
  doc.rect(summaryX, finalY, summaryWidth, boxHeight, 'FD');

  const totalCratesCount = bill.items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const totalFreeCratesCount = bill.items.reduce((s, it) => s + (Number(it.freeQty) || 0), 0);
  const cratesVal = totalFreeCratesCount > 0 ? `${totalCratesCount} cs (${totalFreeCratesCount} free incl.)` : `${totalCratesCount} cs`;

  const ngSummary = nonGstSummary(bill);
  const rows = [
    { label: 'Total Crates:', val: cratesVal, bold: true, color: [15, 23, 42] as [number, number, number] },
    ...(isGst
      ? [
          { label: 'Taxable Value:', val: `Rs. ${money(bill.subtotal)}`, bold: false },
          ...(bill.additionalDiscount && bill.additionalDiscount > 0
            ? [{ label: 'Special Discount (applied):', val: `-Rs. ${money(bill.additionalDiscount)}`, bold: false, color: [200, 30, 30] as [number, number, number] }]
            : []),
          ...(bill.discount > (bill.additionalDiscount || 0)
            ? [{ label: 'Trade Scheme Savings:', val: `-Rs. ${money(bill.discount - (bill.additionalDiscount || 0))}`, bold: false, color: [180, 100, 0] as [number, number, number] }]
            : []),
          ...(() => {
            const lbl = cgstSgstLabels(bill.items || []);
            return [
              { label: lbl.cgst + ':', val: `Rs. ${money(bill.cgst)}`, bold: false },
              { label: lbl.sgst + ':', val: `Rs. ${money(bill.sgst)}`, bold: false },
            ];
          })(),
        ]
      : [
          // Non-GST (B2C) copy: tax-inclusive prices only, no GST split.
          { label: 'Items Value:', val: `Rs. ${money(ngSummary.itemsValue)}`, bold: false },
          ...(ngSummary.schemeDiscount > 0
            ? [{ label: 'Trade Scheme Savings:', val: `-Rs. ${money(ngSummary.schemeDiscount)}`, bold: false, color: [180, 100, 0] as [number, number, number] }]
            : []),
          ...(ngSummary.specialDiscount > 0
            ? [{ label: 'Special Discount:', val: `-Rs. ${money(ngSummary.specialDiscount)}`, bold: false, color: [200, 30, 30] as [number, number, number] }]
            : []),
          ...(ngSummary.taxAdjustment > 0.05
            ? [{ label: 'Taxes:', val: `Rs. ${money(ngSummary.taxAdjustment)}`, bold: false }]
            : []),
        ]),
    ...(Math.abs(Number(bill.roundOff) || 0) >= 0.005
      ? [{ label: 'Round off:', val: `${(Number(bill.roundOff) || 0) < 0 ? '-' : '+'}Rs. ${money(Math.abs(Number(bill.roundOff) || 0))}`, bold: false }]
      : []),
    {
      label: isGst ? 'Total Invoice Value:' : 'Net Total Payable:',
      val: `Rs. ${money(bill.total)}`,
      bold: true,
      size: 10,
      color: isGst ? ([26, 54, 93] as [number, number, number]) : ([16, 128, 67] as [number, number, number]),
    },
    ...((Number(bill.youSaved) || Number(bill.schemeDiscountTotal) || 0) > 0
      ? [{
          label: 'You saved:',
          val: `Rs. ${money(Number(bill.youSaved) || Number(bill.schemeDiscountTotal) || 0)}`,
          bold: true,
          color: [16, 128, 67] as [number, number, number],
        }]
      : []),
    { label: 'Amount Received:', val: `Rs. ${money(bill.amountPaid)}`, bold: false },
    {
      label: 'Balance Outstanding:',
      val: `Rs. ${money(status.balance)}`,
      bold: true,
      color: status.balance > 0 ? ([180, 40, 40] as [number, number, number]) : ([16, 128, 67] as [number, number, number]),
    },
  ];

  let sumY = finalY + 5;
  rows.forEach((r) => {
    doc.setFont('helvetica', r.bold ? 'bold' : 'normal');
    doc.setFontSize(r.size || 8);
    if (r.color) {
      doc.setTextColor(r.color[0], r.color[1], r.color[2]);
    } else {
      doc.setTextColor(15, 23, 42);
    }
    doc.text(r.label, summaryX + 4, sumY);
    doc.text(r.val, summaryX + summaryWidth - 4, sumY, { align: 'right' });
    sumY += 5.2;
  });

  // 5. Terms and Conditions & Authorized Signatory block
  const footerY = finalY + 46;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  // Left: Terms
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TERMS & CONDITIONS:', margin, footerY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  const terms =
    org?.invoiceTerms ||
    '1. Goods once sold will not be taken back or exchanged.\n2. Payment strictly on due date. Interest @18% p.a. charged on overdue bills.\n3. Empty glass crates must be returned promptly.\n4. All disputes are subject to local jurisdiction only.';
  const splitTerms = doc.splitTextToSize(terms, contentWidth - 65);
  doc.text(splitTerms, margin, footerY + 8);

  // Right: Authorized Signature
  const signX = pageWidth - margin - 55;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(26, 54, 93);
  doc.text(`For ${orgName.toUpperCase()}`, signX, footerY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('(Authorized Signatory)', signX, footerY + 22);

  // Bottom footer page stamp
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    isGst
      ? 'This is a Computer Generated Tax Invoice. E. & O.E.'
      : bill.taxStamp?.declaration
        ? `${bill.taxStamp.declaration}. Computer generated Bill of Supply.`
        : 'This is a Computer Generated Retail Bill of Supply (Non-GST / B2C). Thank You!',
    pageWidth / 2,
    pageHeight - 6,
    { align: 'center' }
  );

  return doc;
}

export type InvoicePaper = 'a4' | '80mm';
export type InvoicePdfOptions = { showBatch?: boolean; paper?: InvoicePaper };

/** Paper for the PDF: what the caller asked for, else Settings -> Billing, else A4. */
export function resolveInvoicePaper(settings?: BillingSettings, options?: InvoicePdfOptions): InvoicePaper {
  return options?.paper ?? (settings?.defaultInvoicePaper === '80mm' ? '80mm' : 'a4');
}

/** The invoice on A4 (full GST layout) or as an 80 mm receipt, same figures either way. */
export function buildInvoicePdf(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
  options?: InvoicePdfOptions
): jsPDF {
  return resolveInvoicePaper(settings, options) === '80mm'
    ? generateReceiptPdf80(bill, org, settings, invoiceFormat, options)
    : generateInvoicePdf(bill, org, settings, invoiceFormat, options);
}

export function invoicePdfFilename(
  bill: Bill,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
  options?: InvoicePdfOptions
): string {
  const isGst = isBillGstInvoice(bill, invoiceFormat);
  const prefix = settings?.invoicePrefix || (isGst ? 'INV' : 'RET');
  const cleanRetailer = (bill.retailer || 'Cash').replace(/[^a-zA-Z0-9_-]/g, '_');
  const paper = resolveInvoicePaper(settings, options) === '80mm' ? '_80mm' : '';
  return isGst
    ? `Tax_Invoice_${prefix}-${bill.id}_${cleanRetailer}${paper}.pdf`
    : `Retail_Bill_${prefix}-${bill.id}_${cleanRetailer}${paper}.pdf`;
}

export function downloadInvoicePdf(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
  options?: InvoicePdfOptions
): void {
  const doc = buildInvoicePdf(bill, org, settings, invoiceFormat, options);
  doc.save(invoicePdfFilename(bill, settings, invoiceFormat, options));
}

/**
 * Opens the phone's share sheet with the invoice PDF attached (pick WhatsApp there).
 * Where the browser cannot share files, the PDF is downloaded instead and 'downloaded' is returned.
 */
export async function shareInvoicePdf(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
  options?: InvoicePdfOptions
): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const isGst = isBillGstInvoice(bill, invoiceFormat);
  const doc = buildInvoicePdf(bill, org, settings, invoiceFormat, options);
  const filename = invoicePdfFilename(bill, settings, invoiceFormat, options);
  const prefix = settings?.invoicePrefix || (isGst ? 'INV' : 'RET');
  const result = await sharePdfFile(
    doc,
    filename,
    `${isGst ? 'Tax Invoice' : 'Bill'} ${prefix}-${bill.id} - ${bill.retailer || 'Cash'}`
  );
  if (result === 'unsupported') {
    doc.save(filename);
    return 'downloaded';
  }
  return result;
}

export function printInvoicePdf(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings,
  invoiceFormat?: 'gst' | 'non_gst',
  options?: InvoicePdfOptions
): void {
  const doc = buildInvoicePdf(bill, org, settings, invoiceFormat, options);
  doc.autoPrint();
  const blobUrl = doc.output('bloburl');
  const printWindow = window.open(blobUrl, '_blank');
  if (printWindow) {
    printWindow.focus();
  } else {
    // Fallback if window.open is blocked in sandbox iframe
    doc.save(invoicePdfFilename(bill, settings, invoiceFormat, options));
  }
}
