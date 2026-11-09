import React from 'react';

/** The orange "H" logo tile. Same gradient and glow the app always used; only its size changes per placement. */
export const BrandMark: React.FC<{ letter?: string; className?: string }> = ({ letter = 'H', className = 'size-10 text-base' }) => (
  <div
    className={`hh-brandmark rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-white shadow-md shadow-amber-500/25 select-none shrink-0 ${className}`}
    aria-hidden="true"
  >
    {letter}
  </div>
);
