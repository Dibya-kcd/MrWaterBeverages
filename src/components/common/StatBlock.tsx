import React from 'react';
import { useLedger } from '../../context/LedgerContext';

interface StatBlockProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  id?: string;
}

export const StatBlock: React.FC<StatBlockProps> = ({ label, value, sub, accent, id }) => {
  const { palette, fz } = useLedger();

  return (
    <div
      id={id}
      className="border-2 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3.5 flex flex-col justify-between h-full shadow-xs"
      style={{
        borderColor: palette.line,
        backgroundColor: palette.panel,
      }}
    >
      <div>
        <div className="text-xs sm:text-sm font-semibold truncate" style={{ color: palette.ink, lineHeight: 1.25 }}>
          {label}
        </div>
        <div
          className="text-lg sm:text-2xl font-black mt-1 tracking-tight truncate"
          style={{ color: accent || palette.ink, lineHeight: 1.15 }}
        >
          {value}
        </div>
      </div>
      {sub && (
        <div className="text-[11px] sm:text-xs text-slate-500 mt-1 truncate" style={{ lineHeight: 1.2 }}>
          {sub}
        </div>
      )}
    </div>
  );
};
