import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { Modal } from '../ui/Modal';

export interface InfoTipProps {
  /** Heading shown at the top of the info sheet. */
  title: string;
  /** Full explanation. Plain text, paragraphs or JSX. */
  children: React.ReactNode;
  /** Accessible label for the ⓘ button. Defaults to "About <title>". */
  label?: string;
  className?: string;
  /** Smaller icon for use inside cards / tabs. */
  size?: 'sm' | 'md';
  /** When set, the trigger is a labelled pill ("ⓘ How profit is calculated") instead of a bare icon. */
  text?: string;
}

/**
 * Small ⓘ button. Tap it to read the full explanation in a bottom sheet on phones
 * (centered dialog on larger screens). Used instead of permanent grey helper paragraphs
 * so every screen stays compact and aligned on mobile.
 *
 * The button is at least 28px square with a larger invisible hit area, so it is easy to
 * tap with a thumb without making the heading row taller.
 */
export const InfoTip: React.FC<InfoTipProps> = ({ title, children, label, className = '', size = 'md', text }) => {
  const [open, setOpen] = useState(false);
  // Escape closes just this sheet, not a form dialog that may be open underneath it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  const icon = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={label || `About ${title}`}
        title={label || `About ${title}`}
        className={
          text
            ? `inline-flex items-center gap-1.5 self-start max-w-full px-2.5 py-1.5 rounded-full border border-sky-200 bg-sky-50 text-sky-800 text-xs font-semibold hover:bg-sky-100 active:bg-sky-100 transition-colors cursor-pointer ${className}`
            : `relative inline-flex items-center justify-center shrink-0 rounded-full text-slate-400 hover:text-sky-600 hover:bg-sky-50 active:bg-sky-100 transition-colors cursor-pointer before:content-[''] before:absolute before:-inset-2 ${
                size === 'sm' ? 'w-5 h-5' : 'w-7 h-7'
              } ${className}`
        }
      >
        <Info className={text ? 'w-3.5 h-3.5 shrink-0 text-sky-600' : icon} aria-hidden="true" />
        {text && <span className="truncate">{text}</span>}
      </button>
      {/* Portal: a sheet opened from inside another dialog must not be clipped by it. */}
      {typeof document !== 'undefined' && createPortal(
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        icon={<Info className="w-5 h-5 text-sky-600" aria-hidden="true" />}
        maxWidth="md"
      >
        <div className="text-sm text-slate-700 leading-relaxed space-y-3 [&_strong]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </Modal>,
        document.body
      )}
    </>
  );
};
