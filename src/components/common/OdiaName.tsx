import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useLedger } from '../../context/LedgerContext';
import { getPhoneticOdia, type NameKind } from '../../utils/displayName';

/**
 * English name, plus the same name written in Odia underneath when the salesman has chosen Odia.
 * Looks up a saved Odia name (`nameOr`) first, then writes the English name in Odia script.
 * In English mode (and for the owner) it is just the English name.
 */
export const OdiaName: React.FC<{
  name?: string | null;
  kind?: NameKind;
  /** Saved Odia name, when the caller already has it. */
  nameOr?: string | null;
  className?: string;
  odiaClassName?: string;
}> = ({ name, kind = 'product', nameOr, className, odiaClassName }) => {
  const { isOdia } = useLanguage();
  const { products, customers, existingCustomers } = useLedger() as any;
  const english = (name || '').trim();
  if (!english) return null;
  if (!isOdia) return <span className={className}>{english}</span>;

  let saved = (nameOr || '').trim();
  if (!saved) {
    const key = english.toLowerCase();
    const pool: any[] = kind === 'product' ? products || [] : [...(existingCustomers || []), ...(customers || [])];
    saved = (pool.find((x) => (x?.name || '').trim().toLowerCase() === key)?.nameOr || '').trim();
  }
  const odia = saved || getPhoneticOdia(english, kind);
  return (
    <span className={className}>
      <span className="block">{english}</span>
      {odia && odia !== english && (
        <span className={odiaClassName || 'block text-[0.85em] font-bold text-sky-800 font-odia leading-snug'}>{odia}</span>
      )}
    </span>
  );
};
