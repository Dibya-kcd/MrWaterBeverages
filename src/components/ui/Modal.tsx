import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full';
  showCloseButton?: boolean;
  className?: string;
  bodyClassName?: string;
  /** Fill the whole screen on desktop/laptop (>=1024px). Phones/tablets keep the normal dialog. */
  fullScreenOnDesktop?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidth = 'lg',
  showCloseButton = true,
  className = '',
  bodyClassName = '',
  fullScreenOnDesktop = false,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    full: 'max-w-[95vw] md:max-w-7xl',
  }[maxWidth];

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-esc-handled
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 ${
        fullScreenOnDesktop ? 'lg:p-0 lg:bg-white' : ''
      }`}
      onClick={onClose}
    >
      <div
        data-modal-panel className={`modal-panel w-full ${maxWidthClasses} bg-white border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[min(92dvh,100%)] animate-in zoom-in-95 duration-150 ${
          fullScreenOnDesktop ? 'lg:max-w-none lg:h-screen lg:max-h-screen lg:rounded-none lg:border-0 lg:shadow-none' : ''
        } ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <div className="shrink-0">{icon}</div>}
              <div className="min-w-0">
                {title && (
                  <h3 className="text-base font-semibold text-slate-900 truncate tracking-tight">
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 -mr-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className={`p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 ${bodyClassName}`}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom, 0px))' }} className={`px-4 sm:px-5 pt-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0 rounded-b-2xl flex-wrap ${
            fullScreenOnDesktop ? 'lg:rounded-none' : ''
          }`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
