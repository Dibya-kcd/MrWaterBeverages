import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Bill, OrganizationProfile, BillingSettings } from '../types';
import { money, statusOf } from './billing';

// Convert numbers into Indian Currency words (e.g. "Rupees Ten Thousand Five Hundred Only")
export function inrToWords(num: number): string {
  if (isNaN(num) || num <= 0) return 'Rupees Zero Only';

  const a = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertTwoDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
  };

  const convertThreeDigits = (n: number): string => {
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    let res = '';
    if (hundred > 0) res += a[hundred] + ' Hundred';
    if (remainder > 0) res += (res ? ' and ' : '') + convertTwoDigits(remainder);
    return res;
  };

  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);

  let crore = Math.floor(whole / 10000000);
  let lakh = Math.floor((whole % 10000000) / 100000);
  let thousand = Math.floor((whole % 100000) / 1000);
  let remainder = whole % 1000;

  let parts: string[] = [];
  if (crore > 0) parts.push(convertThreeDigits(crore) + ' Crore');
  if (lakh > 0) parts.push(convertThreeDigits(lakh) + ' Lakh');
  if (thousand > 0) parts.push(convertThreeDigits(thousand) + ' Thousand');
  if (remainder > 0) parts.push(convertThreeDigits(remainder));

  let res = 'Rupees ' + (parts.join(' ') || 'Zero');
  if (paise > 0) {
    res += ' and ' + convertTwoDigits(paise) + ' Paise';
  }
  return res + ' Only';
}

export function generateInvoicePdf(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  const invoiceNo = settings?.invoicePrefix ? `${settings.invoicePrefix}-${bill.id}` : `INV-${bill.id}`;
  const orgName = org?.name || 'RADHIKA BEVERAGES';
  const orgTagline = org?.tagline || 'Authorized Wholesale Beverage Distributor';
  const orgAddress = org?.address ? `${org.address}, ${org.city || ''}` : 'Depot Area, Station Road';
  const orgPhone = org?.phone || '+91 98765 43210';
  const orgGstin = org?.gstin || '24AAACR1234F1Z8';
  const orgFssai = org?.fssai || '10020011000123';

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
  doc.text(`GSTIN: ${orgGstin}  |  FSSAI Lic. No: ${orgFssai}`, margin + 5, margin + 22);

  // TAX INVOICE Badge on top right
  doc.setFillColor(217, 119, 6); // Warm Amber
  doc.roundedRect(pageWidth - margin - 45, margin + 4, 40, 16, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TAX INVOICE', pageWidth - margin - 25, margin + 10.5, { align: 'center' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('(Original for Recipient)', pageWidth - margin - 25, margin + 15, { align: 'center' });

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
  doc.text(`Place of Supply: Gujarat (24)`, margin + 4, y + 20.5);

  // Invoice Details (Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('INVOICE CREDENTIALS:', margin + colWidth + 4, y + 5);

  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Invoice No:', margin + colWidth + 4, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.text(invoiceNo, margin + colWidth + 30, y + 11);

  doc.setFont('helvetica', 'normal');
  doc.text('Invoice Date:', margin + colWidth + 4, y + 16);
  doc.setFont('helvetica', 'bold');
  doc.text(bill.date || new Date().toISOString().slice(0, 10), margin + colWidth + 30, y + 16);

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

  // 3. Line Items Table using autotable
  const tableHead = [
    [
      { content: '#', styles: { halign: 'center' as const } },
      { content: 'Description of Goods & Packs', styles: { halign: 'left' as const } },
      { content: 'HSN', styles: { halign: 'center' as const } },
      { content: 'Crates', styles: { halign: 'center' as const } },
      { content: 'Free', styles: { halign: 'center' as const } },
      { content: 'Rate (Rs)', styles: { halign: 'right' as const } },
      { content: 'Gross (Rs)', styles: { halign: 'right' as const } },
      { content: 'Scheme (Rs)', styles: { halign: 'right' as const } },
      { content: 'Taxable (Rs)', styles: { halign: 'right' as const } },
      { content: 'Amount (Rs)', styles: { halign: 'right' as const } },
    ],
  ];

  const tableBody = bill.items.map((it, idx) => {
    const grossVal = it.gross || it.qty * it.rate;
    const discountVal = it.discount || 0;
    const taxableVal = grossVal - discountVal;

    return [
      { content: String(idx + 1), styles: { halign: 'center' as const } },
      {
        content:
          it.freeQty > 0
            ? `${it.productName}${it.batchNumber ? `\nLot: ${it.batchNumber}` : ''}\n* Scheme: ${it.freeQty} Free Case(s)`
            : `${it.productName}${it.batchNumber ? `\nLot: ${it.batchNumber}` : ''}`,
        styles: { halign: 'left' as const, fontStyle: 'bold' as const },
      },
      { content: it.hsn || '2202', styles: { halign: 'center' as const } },
      { content: String(it.qty), styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
      { content: it.freeQty > 0 ? `+${it.freeQty}` : '-', styles: { halign: 'center' as const, textColor: [180, 100, 0] as [number, number, number] } },
      { content: money(it.rate), styles: { halign: 'right' as const } },
      { content: money(grossVal), styles: { halign: 'right' as const } },
      { content: discountVal > 0 ? `-${money(discountVal)}` : '-', styles: { halign: 'right' as const, textColor: [180, 100, 0] as [number, number, number] } },
      { content: money(taxableVal), styles: { halign: 'right' as const } },
      { content: money(it.amount), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
    ];
  });

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
      fillColor: [26, 54, 93],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 50 },
      2: { cellWidth: 14 },
      3: { cellWidth: 14 },
      4: { cellWidth: 12 },
      5: { cellWidth: 18 },
      6: { cellWidth: 20 },
      7: { cellWidth: 18 },
      8: { cellWidth: 20 },
      9: { cellWidth: 22 },
    },
    margin: { left: margin, right: margin },
  });

  // Calculate table end position
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 4 : y + 50;

  // 4. Totals and Summary Box (Right aligned table) + Amount in words & Bank (Left aligned)
  const summaryWidth = 80;
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
  const upiText = org?.upiId ? `UPI ID: ${org.upiId}` : 'UPI ID: radhikabev@upi';
  const bankText = org?.bankName
    ? `Bank: ${org.bankName} | A/c: ${org.accountNumber || '—'} | IFSC: ${org.ifsc || '—'}`
    : 'Bank: HDFC Bank Ltd | A/c: 50200088991122 | IFSC: HDFC0001234';
  doc.text(upiText, margin + 4, finalY + 25);
  doc.text(bankText, margin + 4, finalY + 29.5);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Scan & Pay via any UPI App (GPay, PhonePe, Paytm, BHIM)', margin + 4, finalY + 34);
  doc.text('Payment terms: Strictly against delivery / within agreed credit days.', margin + 4, finalY + 38);

  // Right column: Financial Summary breakdown
  doc.setFillColor(248, 250, 252);
  doc.rect(summaryX, finalY, summaryWidth, 42, 'FD');

  const rows = [
    { label: 'Subtotal (Gross):', val: `Rs. ${money(bill.subtotal)}`, bold: false },
    ...(bill.additionalDiscount && bill.additionalDiscount > 0
      ? [{ label: 'Special Discount:', val: `-Rs. ${money(bill.additionalDiscount)}`, bold: false, color: [200, 30, 30] as [number, number, number] }]
      : []),
    ...(bill.discount > (bill.additionalDiscount || 0)
      ? [{ label: 'Trade Scheme Savings:', val: `-Rs. ${money(bill.discount - (bill.additionalDiscount || 0))}`, bold: false, color: [180, 100, 0] as [number, number, number] }]
      : []),
    { label: 'CGST (6%):', val: `Rs. ${money(bill.cgst)}`, bold: false },
    { label: 'SGST (6%):', val: `Rs. ${money(bill.sgst)}`, bold: false },
    { label: 'Total Invoice Value:', val: `Rs. ${money(bill.total)}`, bold: true, size: 10, color: [26, 54, 93] as [number, number, number] },
    { label: 'Amount Received:', val: `Rs. ${money(bill.amountPaid)}`, bold: false },
    { label: 'Balance Outstanding:', val: `Rs. ${money(status.balance)}`, bold: true, color: status.balance > 0 ? [180, 40, 40] as [number, number, number] : [16, 128, 67] as [number, number, number] },
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
  const terms = org?.invoiceTerms || '1. Goods once sold will not be taken back or exchanged.\n2. Payment strictly on due date. Interest @18% p.a. charged on overdue bills.\n3. Empty glass crates must be returned promptly.\n4. All disputes are subject to local jurisdiction only.';
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
  doc.text('This is a Computer Generated Tax Invoice. E. & O.E.', pageWidth / 2, pageHeight - 6, { align: 'center' });

  return doc;
}

export function downloadInvoicePdf(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings
): void {
  const doc = generateInvoicePdf(bill, org, settings);
  const prefix = settings?.invoicePrefix || 'INV';
  const cleanRetailer = (bill.retailer || 'Cash').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Tax_Invoice_${prefix}-${bill.id}_${cleanRetailer}.pdf`;
  doc.save(filename);
}

export function printInvoicePdf(
  bill: Bill,
  org?: OrganizationProfile,
  settings?: BillingSettings
): void {
  const doc = generateInvoicePdf(bill, org, settings);
  doc.autoPrint();
  const blobUrl = doc.output('bloburl');
  const printWindow = window.open(blobUrl, '_blank');
  if (printWindow) {
    printWindow.focus();
  } else {
    // Fallback if window.open is blocked in sandbox iframe
    doc.save(`Tax_Invoice_${settings?.invoicePrefix || 'INV'}-${bill.id}.pdf`);
  }
}
