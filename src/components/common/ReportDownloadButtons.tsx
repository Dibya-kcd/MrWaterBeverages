import React, { useState, useRef, useEffect } from 'react';
import { Share2, FileSpreadsheet, FileText, MessageSquare, Loader2, Check } from 'lucide-react';

/** Unified Share & Export menu: Share via WhatsApp, Download as PDF, Download as Excel. */
export const ReportDownloadButtons: React.FC<{
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
  onWhatsApp?: () => Promise<void> | void;
  reportTitle?: string;
  whatsappText?: string;
  disabled?: boolean;
}> = ({ onExcel, onPdf, onWhatsApp, reportTitle, whatsappText, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | 'whatsapp' | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const run = async (kind: 'xlsx' | 'pdf' | 'whatsapp', fn: () => Promise<void> | void) => {
    setBusy(kind);
    setErr('');
    try {
      await fn();
    } catch (e) {
      console.error('Report action failed', e);
      setErr('Action failed. Please try again.');
    } finally {
      setBusy(null);
      setIsOpen(false);
    }
  };

  const handleWhatsApp = () => {
    if (onWhatsApp) {
      return run('whatsapp', onWhatsApp);
    }
    const title = reportTitle || document.title || 'Business Report';
    const text = whatsappText || `📊 *${title}*\nReport summary from Hydrate Hub.\n_Generated on ${new Date().toLocaleDateString('en-IN')}_`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        disabled={disabled || busy !== null}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Share and download options"
        className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin text-slate-500" />
        ) : (
          <Share2 size={14} className="text-slate-600" />
        )}
        <span>Share</span>
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-56 rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 text-left">
          <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Share & Export
            </p>
            {reportTitle && (
              <p className="text-xs font-bold text-slate-800 truncate">
                {reportTitle}
              </p>
            )}
          </div>

          <div className="space-y-0.5">
            {/* WhatsApp */}
            <button
              type="button"
              onClick={handleWhatsApp}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-emerald-50 text-slate-800 transition cursor-pointer group"
            >
              <div className="h-7 w-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition">
                <MessageSquare size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                  Share via WhatsApp
                </div>
                <div className="text-[10px] text-slate-400">Summary message</div>
              </div>
            </button>

            {/* Download PDF */}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run('pdf', onPdf)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-rose-50 text-slate-800 transition cursor-pointer group disabled:opacity-50"
            >
              <div className="h-7 w-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition">
                <FileText size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 group-hover:text-rose-900">
                  Download as PDF
                </div>
                <div className="text-[10px] text-slate-400">Print-ready document</div>
              </div>
            </button>

            {/* Download Excel */}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run('xlsx', onExcel)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-emerald-50 text-slate-800 transition cursor-pointer group disabled:opacity-50"
            >
              <div className="h-7 w-7 rounded-lg bg-emerald-100 text-[#047857] flex items-center justify-center shrink-0 group-hover:bg-[#047857] group-hover:text-white transition">
                <FileSpreadsheet size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                  Download as Excel
                </div>
                <div className="text-[10px] text-slate-400">.xlsx spreadsheet</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {copied && (
        <div className="absolute top-full mt-2 right-0 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-bold rounded-lg shadow-lg z-50 whitespace-nowrap flex items-center gap-1">
          <Check size={12} className="text-emerald-400" /> Copied summary!
        </div>
      )}

      {err && <span className="text-[11px] text-rose-700 mt-1 block">{err}</span>}
    </div>
  );
};
