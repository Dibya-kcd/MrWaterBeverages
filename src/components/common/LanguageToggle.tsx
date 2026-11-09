import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { LanguageCode } from '../../i18n/translations';

/**
 * Compact E / ଓ switch for salesman screens.
 * Always visible so the salesman can change language on any page without opening Settings.
 */
export const LanguageToggle: React.FC<{
  className?: string;
  size?: 'sm' | 'md';
}> = ({ className = '', size = 'sm' }) => {
  const { language, setLanguage } = useLanguage();

  const btn = (code: LanguageCode, label: string) => {
    const active = language === code;
    const pad = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]';
    return (
      <button
        type="button"
        onClick={() => setLanguage(code)}
        aria-pressed={active}
        aria-label={code === 'en' ? 'English' : 'Odia'}
        className={`${pad} font-black rounded-lg transition-colors cursor-pointer min-h-[32px] ${
          active
            ? 'bg-[var(--primary)] text-white shadow-sm'
            : 'bg-transparent text-slate-600 hover:bg-slate-100'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-xl border-2 border-slate-200 bg-white shadow-xs shrink-0 ${className}`}
      role="group"
      aria-label="Language"
      title="Language / ଭାଷା"
    >
      {btn('en', 'E')}
      {btn('or', 'ଓ')}
    </div>
  );
};
