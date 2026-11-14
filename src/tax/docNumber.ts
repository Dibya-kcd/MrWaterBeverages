/** Financial-year-wise document numbering (Rule 46(b): consecutive, unique per FY, max 16 characters). */

/** Indian financial year label for a date: 2026-03-31 -> "2025-26", 2026-04-01 -> "2026-27". */
export function financialYear(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function formatDocumentNumber(prefix: string, fy: string, seq: number, pad = 4): string {
  const no = `${prefix}/${fy.slice(2, 4)}${fy.slice(5)}/${String(seq).padStart(pad, '0')}`; // e.g. BOS/2526/0001
  if (no.length > 16) throw new Error(`Document number "${no}" exceeds the 16 character limit`);
  if (!/^[A-Za-z0-9/-]+$/.test(no)) throw new Error(`Document number "${no}" has characters GST does not allow`);
  return no;
}

/** In-memory reference implementation; production uses the document_number_series table + unique index. */
export class NumberSeries {
  private last = new Map<string, number>();
  private used = new Set<string>();

  allocate(docType: string, prefix: string, date: string): string {
    const fy = financialYear(date);
    const k = `${docType}|${fy}`;
    const seq = (this.last.get(k) ?? 0) + 1;
    const no = formatDocumentNumber(prefix, fy, seq);
    this.register(docType, fy, no);
    this.last.set(k, seq);
    return no;
  }

  register(docType: string, fy: string, no: string): void {
    const key = `${docType}|${fy}|${no}`;
    if (this.used.has(key)) throw new Error(`Duplicate document number ${no} for ${docType} in FY ${fy}`);
    this.used.add(key);
  }
}
