import React, { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

/** Two small buttons: download the report as an Excel workbook or as a PDF. */
export const ReportDownloadButtons: React.FC<{
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
  disabled?: boolean;
}> = ({ onExcel, onPdf, disabled }) => {
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const [err, setErr] = useState('');

  const run = async (kind: 'xlsx' | 'pdf', fn: () => Promise<void> | void) => {
    setBusy(kind);
    setErr('');
    try {
      await fn();
    } catch (e) {
      console.error('Report download failed', e);
      setErr('Download failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const btn =
    'h-9 px-3 rounded-xl border border-black/10 bg-white text-[13px] font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={disabled || busy !== null} onClick={() => run('xlsx', onExcel)} aria-label="Download Excel">
          {busy === 'xlsx' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} className="text-emerald-700" />}
          Excel
        </button>
        <button type="button" className={btn} disabled={disabled || busy !== null} onClick={() => run('pdf', onPdf)} aria-label="Download PDF">
          {busy === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} className="text-rose-700" />}
          PDF
        </button>
      </div>
      {err && <span className="text-[11px] text-rose-700">{err}</span>}
    </div>
  );
};
