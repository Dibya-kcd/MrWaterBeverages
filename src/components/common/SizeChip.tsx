import React from 'react';
import { sizeTheme, packTheme } from '../../utils/sizeColor';

/**
 * Coloured size pill (150ml, 500ml, 1L ...) followed by a solid pack pill (PET, Can ...).
 * Each part renders nothing if unknown.
 */
export const SizeChip: React.FC<{
  volume?: number | null;
  name?: string | null;
  pack?: string | null;
  className?: string;
}> = ({ volume, name, pack, className = '' }) => {
  const t = sizeTheme(volume, name);
  const k = packTheme(pack, name);
  if (!t.label && !k.label) return null;
  const base = 'inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-black leading-none shrink-0';
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`}>
      {t.label && (
        <span className={`${base} ${t.chip}`} title={`Size ${t.label}`}>
          {t.label}
        </span>
      )}
      {k.label && (
        <span className={`${base} ${k.chip}`} title={`Pack ${k.label}`}>
          {k.label}
        </span>
      )}
    </span>
  );
};
