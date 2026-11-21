import React from 'react';
import { PackGroupKey, productPackGroup } from '../../utils/sizeColor';

export const PACK_TEXT_COLOR: Record<PackGroupKey, string> = {
  Can: 'text-blue-700',
  PET: 'text-rose-700',
  Glass: 'text-emerald-700',
  Tetra: 'text-amber-700',
  Other: 'text-slate-600',
};

const PACK_TILE_CLASS: Record<PackGroupKey, string> = {
  Can: 'hh-icon-badge hh-icon-badge--blue border-transparent text-white',
  PET: 'hh-icon-badge hh-icon-badge--rose border-transparent text-white',
  Glass: 'hh-icon-badge hh-icon-badge--green border-transparent text-white',
  Tetra: 'hh-icon-badge hh-icon-badge--amber border-transparent text-white',
  Other: 'hh-icon-badge hh-icon-badge--slate border-transparent text-white',
};

export function packTextColor(pack?: string | null, name?: string | null): string {
  return PACK_TEXT_COLOR[productPackGroup({ pack, name }).key];
}

const PackGlyph: React.FC<{ group: PackGroupKey; className?: string }> = ({ group, className }) => {
  switch (group) {
    case 'Can':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M8 3h8l1 2.2v13.6L16 21H8l-1-2.2V5.2L8 3z" />
          <path d="M7 6.5h10" />
          <path d="M7 17.5h10" />
          <path d="M10.5 3l1.5-1.4" />
        </svg>
      );
    case 'PET':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M9.5 2.5h5v2.3h-5z" />
          <path d="M10 4.8L7.5 8.6V19.5a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V8.6L14 4.8" />
          <path d="M7.5 12h9" />
          <path d="M7.5 15.5h9" />
        </svg>
      );
    case 'Glass':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M10 2.5h4v1.8h-4z" />
          <path d="M10.5 4.3v4.2c0 1.3-2.5 2.4-2.5 4.5v6.8a1.7 1.7 0 0 0 1.7 1.7h4.6a1.7 1.7 0 0 0 1.7-1.7V13c0-2.1-2.5-3.2-2.5-4.5V4.3" />
          <path d="M8 14.5h8" />
        </svg>
      );
    case 'Tetra':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M7.5 7.5L10 4h6.5l1.5 3.5v12.5a1.5 1.5 0 0 1-1.5 1.5H9a1.5 1.5 0 0 1-1.5-1.5V7.5z" />
          <path d="M7.5 8.5h10.5" />
          <path d="M13 4V2.2l2.5-.7" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <rect x="4" y="6" width="16" height="14" rx="2" />
          <path d="M4 11h16" />
          <path d="M10 6v14" />
        </svg>
      );
  }
};

export interface PackIconProps {
  pack?: string | null;
  name?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Color-coded packaging icon tile (Can = Blue, PET = Red, Glass = Green, Tetra = Amber)
 * for fast visual differentiation on Product, Trip, and Inventory cards.
 */
export const PackIcon: React.FC<PackIconProps> = ({ pack, name, size = 'md', className = '' }) => {
  const info = productPackGroup({ pack, name });
  const boxCls = size === 'sm' ? 'size-7 rounded-lg' : 'size-9 rounded-xl';
  const svgCls = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <span
      className={`inline-flex items-center justify-center border shrink-0 ${boxCls} ${PACK_TILE_CLASS[info.key]} ${className}`}
      title={info.heading}
      aria-hidden="true"
    >
      <PackGlyph group={info.key} className={svgCls} />
    </span>
  );
};
