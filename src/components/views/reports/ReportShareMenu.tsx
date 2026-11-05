import React, { useState, useRef, useEffect } from 'react';
import { Share2, FileSpreadsheet, FileText, MessageSquare, Check, Download } from 'lucide-react';
import { downloadPdf, downloadXlsx, fileStamp, fileSlug, type SheetSpec, type PdfSection } from '../../../utils/reportDownload';

export interface ReportShareMenuProps {
  reportTitle: string;
  periodLabel: string;
  orgName?: string;
  summaryMetrics?: { label: string; value: string }[];
  sheets: SheetSpec[];
  pdfSections: PdfSection[];
  filenamePrefix?: string;
  customWhatsappText?: string;
  align?: 'left' | 'right';
  className?: string;
  triggerClassName?: string;
  iconClassName?: string;
}

export const ReportShareMenu: React.FC<ReportShareMenuProps> = ({
  reportTitle,
  periodLabel,
  orgName = 'Hydrate Hub',
  summaryMetrics = [],
  sheets,
  pdfSections,
  filenamePrefix,
  customWhatsappText,
  align = 'right',
  className = '',
  triggerClassName,
  iconClassName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<'pdf' | 'excel' | null>(null);
  const [copied, setCopied] = useState(false);
  const [dropdownSide, setDropdownSide] = useState<'left' | 'right'>(align);
  const [isMobile, setIsMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Detect mobile / narrow viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-detect side for desktop popover
  useEffect(() => {
    if (isOpen && menuRef.current && !isMobile) {
      const rect = menuRef.current.getBoundingClientRect();
      if (rect.right < 265) {
        setDropdownSide('left');
      } else if (rect.left + 265 > window.innerWidth) {
        setDropdownSide('right');
      } else {
        setDropdownSide(align);
      }
    }
  }, [isOpen, align, isMobile]);

  // Close on outside click / escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
      // Prevent body scroll when mobile sheet is open
      if (isMobile) document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, isMobile]);

  const slug = fileSlug(filenamePrefix || reportTitle);

  const handleShareWhatsApp = () => {
    setIsOpen(false);
    let text = customWhatsappText;
    if (!text) {
      const lines: string[] = [
        `📊 *${orgName} · ${reportTitle}*`,
        `📅 Period: ${periodLabel}`,
        `━━━━━━━━━━━━━━━━━━━━`,
      ];

      if (summaryMetrics.length > 0) {
        summaryMetrics.forEach((m) => {
          lines.push(`• *${m.label}:* ${m.value}`);
        });
        lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      }

      if (sheets[0]?.rows && sheets[0].rows.length > 0) {
        const topRows = sheets[0].rows.slice(0, 5);
        lines.push(`📋 *Recent Items:*`);
        topRows.forEach((r) => {
          lines.push(`  - ${r[0]} | ${r[r.length - 1]}`);
        });
        if (sheets[0].rows.length > 5) {
          lines.push(`  _...and ${sheets[0].rows.length - 5} more entries_`);
        }
        lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      }

      lines.push(`_Generated on ${new Date().toLocaleDateString('en-IN')}_`);
      text = lines.join('\n');
    }

    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    try {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch {
      navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleDownloadPdf = async () => {
    setIsOpen(false);
    setIsExporting('pdf');
    try {
      await downloadPdf({
        filename: `${slug}-${fileStamp()}.pdf`,
        title: `${orgName} - ${reportTitle}`,
        subtitle: [
          `Period: ${periodLabel}`,
          `Generated: ${new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}`,
        ],
        landscape: pdfSections.some((s) => s.header.length > 5),
        sections: pdfSections,
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadExcel = async () => {
    setIsOpen(false);
    setIsExporting('excel');
    try {
      await downloadXlsx(`${slug}-${fileStamp()}.xlsx`, sheets);
    } catch (err) {
      console.error('Failed to export Excel:', err);
    } finally {
      setIsExporting(null);
    }
  };

  const menuContent = (
    <>
      <div className="px-3 py-2 border-b border-slate-100 mb-1">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
          Share & Export
        </p>
        <p className="text-xs font-bold text-slate-800 truncate">{reportTitle}</p>
      </div>

      <div className="space-y-0.5">
        <button
          type="button"
          onClick={handleShareWhatsApp}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-emerald-50 text-slate-800 transition cursor-pointer group"
        >
          <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition">
            <MessageSquare size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 group-hover:text-emerald-900">
              Share via WhatsApp
            </div>
            <div className="text-[11px] text-slate-400 truncate">Send summary message</div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={isExporting !== null}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-rose-50 text-slate-800 transition cursor-pointer group disabled:opacity-50"
        >
          <div className="h-9 w-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition">
            <FileText size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 group-hover:text-rose-900">
              Download as PDF
            </div>
            <div className="text-[11px] text-slate-400 truncate">Print-ready A4 document</div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleDownloadExcel}
          disabled={isExporting !== null}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-emerald-50 text-slate-800 transition cursor-pointer group disabled:opacity-50"
        >
          <div className="h-9 w-9 rounded-lg bg-emerald-100 text-[#047857] flex items-center justify-center shrink-0 group-hover:bg-[#047857] group-hover:text-white transition">
            <FileSpreadsheet size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 group-hover:text-emerald-900">
              Download as Excel
            </div>
            <div className="text-[11px] text-slate-400 truncate">Full .xlsx spreadsheet</div>
          </div>
        </button>
      </div>
    </>
  );

  return (
    <div className={`relative inline-block ${className}`} ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Share and export options"
        aria-expanded={isOpen}
        className={
          triggerClassName ||
          "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition-colors cursor-pointer"
        }
      >
        <Share2 size={14} className={iconClassName || "text-slate-600"} />
        <span className="font-bold">Share</span>
      </button>

      {/* Mobile: full-width bottom sheet to avoid clipping */}
      {isOpen && isMobile && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[100]"
            onClick={() => setIsOpen(false)}
            aria-hidden
          />
          <div className="fixed bottom-0 left-0 right-0 z-[110] rounded-t-2xl border border-slate-200 bg-white p-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[70vh] overflow-y-auto">
            <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-2" />
            {menuContent}
          </div>
        </>
      )}

      {/* Desktop / tablet: anchored dropdown */}
      {isOpen && !isMobile && (
        <div
          className={`absolute ${
            dropdownSide === 'left' ? 'left-0' : 'right-0'
          } mt-1.5 w-72 max-w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl z-[60] animate-in fade-in zoom-in-95 duration-100 text-left`}
        >
          {menuContent}
        </div>
      )}

      {copied && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-bold rounded-lg shadow-lg z-[70] whitespace-nowrap flex items-center gap-1">
          <Check size={12} className="text-emerald-400" /> Copied summary to clipboard!
        </div>
      )}
    </div>
  );
};
