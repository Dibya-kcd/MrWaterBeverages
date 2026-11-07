import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LanguageCode, translate, getAvailableLanguages } from './translations';
import { useLedger } from '../context/LedgerContext';
import { startOdiaDomTranslation } from './domTranslate';

const STORAGE_KEY = 'mrwater_app_language';

function readStoredLanguage(): LanguageCode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'or' || raw === 'en') return raw;
  } catch {
    // ignore
  }
  return 'en';
}

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  availableLanguages: { code: LanguageCode; label: string }[];
  isOdia: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Odia is for the SALESMAN login only. The owner / admin screens (and the login screen) always stay in English,
 * whatever language the salesman chose on this device. Must be rendered inside <LedgerProvider>.
 */
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useLedger();
  const isSalesmanUser = currentUser?.role === 'salesman';
  const [chosen, setLanguageState] = useState<LanguageCode>(() => readStoredLanguage());
  const language: LanguageCode = isSalesmanUser ? chosen : 'en';

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore quota / private mode
    }
  }, []);

  // <html lang> + font follow the language actually shown
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language === 'or' ? 'or' : 'en';
      document.documentElement.dataset.lang = language;
    }
  }, [language]);

  // Fixed English texts on the salesman screens are shown in Odia (owner screens never reach this).
  useEffect(() => {
    if (language !== 'or') return;
    return startOdiaDomTranslation();
  }, [language]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(language, key, params),
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t,
      availableLanguages: getAvailableLanguages(),
      isOdia: language === 'or',
    }),
    [language, setLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Safe fallback so components don't crash if provider is missing during tests
    return {
      language: 'en',
      setLanguage: () => {},
      t: (key, params) => translate('en', key, params),
      availableLanguages: getAvailableLanguages(),
      isOdia: false,
    };
  }
  return ctx;
}
