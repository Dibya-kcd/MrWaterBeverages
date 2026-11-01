/**
 * Download helpers for the beat / receipt reports: an Excel workbook (one sheet per table) and a PDF.
 * The libraries are loaded only when a button is pressed, so they do not slow the app down at start-up.
 * PDF text uses "Rs." because the built-in PDF fonts cannot print the rupee sign (same as invoice PDFs).
 */

export interface SheetSpec {
  name: string;
  header: string[];
  rows: (string | number)[][];
  /** Shown as the last row, bold. */
  total?: (string | number)[];
}

export interface PdfSection {
  title?: string;
  header: string[];
  rows: (string | number)[][];
  total?: (string | number)[];
  /** Column indexes to right-align (numbers). */
  rightAlign?: number[];
}

const safeSheetName = (n: string) => n.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';

export const fileStamp = (): string => new Date().toISOString().slice(0, 10);

export const fileSlug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'report';

export async function downloadXlsx(filename: string, sheets: SheetSpec[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa: (string | number)[][] = [s.header, ...s.rows];
    if (s.total) aoa.push(s.total);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // readable column widths
    ws['!cols'] = s.header.map((h, i) => {
      const longest = aoa.reduce((m, r) => Math.max(m, String(r[i] ?? '').length), h.length);
      return { wch: Math.min(40, Math.max(8, longest + 2)) };
    });
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.name));
  }
  XLSX.writeFile(wb, filename);
}

export async function downloadPdf(opts: {
  filename: string;
  title: string;
  /** Lines under the title (shop name, period, filters). */
  subtitle?: string[];
  sections: PdfSection[];
  landscape?: boolean;
}): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: opts.landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const margin = 32;
  let y = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(opts.title, margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  for (const line of opts.subtitle || []) {
    doc.text(line, margin, y);
    y += 12;
  }
  doc.setTextColor(0);
  y += 4;

  for (const s of opts.sections) {
    if (s.title) {
      if (y > doc.internal.pageSize.getHeight() - 90) {
        doc.addPage();
        y = 40;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(s.title, margin, y + 6);
      y += 12;
    }
    const body = s.rows.map((r) => r.map((c) => String(c)));
    const foot = s.total ? [s.total.map((c) => String(c))] : undefined;
    const align: Record<number, { halign: 'right' }> = {};
    for (const i of s.rightAlign || []) align[i] = { halign: 'right' };
    autoTable(doc, {
      startY: y,
      head: [s.header],
      body,
      foot,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      headStyles: { fillColor: [13, 74, 58], textColor: 255 },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
      columnStyles: align,
      showFoot: 'lastPage',
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 18;
  }

  // page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Page ${i} of ${pages}`,
      doc.internal.pageSize.getWidth() - margin,
      doc.internal.pageSize.getHeight() - 16,
      { align: 'right' },
    );
  }
  doc.save(opts.filename);
}
