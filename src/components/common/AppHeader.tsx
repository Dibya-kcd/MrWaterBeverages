import React from 'react';
import { useLedger } from '../../context/LedgerContext';

export interface AppHeaderProps {
  onMenuClick?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = () => {
  const { highContrast, setTab, currentUser, orgProfile } = useLedger();
  const roleLabel =
    currentUser && typeof currentUser === 'object' && 'role' in currentUser
      ? String((currentUser as { role?: string }).role || 'Owner')
      : 'Owner';
  const brand =
    (orgProfile && (orgProfile as { name?: string }).name && (orgProfile as { name?: string }).name !== 'MrWater')
      ? (orgProfile as { name?: string }).name!
      : 'Hydrate Hub';

  return (
    <header
      id="app-header"
      className="select-none sticky top-0 z-30 bg-[#f6f4ef]/90 backdrop-blur-xl border-b border-black/5"
      style={highContrast ? { backgroundColor: '#000', color: '#fff' } : undefined}
    >
      <div className="flex items-center justify-between gap-3 px-3.5 sm:px-5 lg:px-6 py-2.5 min-h-[56px] w-full max-w-none">
        <button
          type="button"
          onClick={() => setTab('dashboard')}
          className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group focus-ring rounded-xl p-0.5"
          title="Home"
        >
          <div
            className="size-9 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 group-hover:from-amber-500 group-hover:to-amber-700 transition-all flex items-center justify-center font-bold text-white text-base shadow-md shadow-amber-500/25 select-none shrink-0"
            aria-hidden="true"
          >
            {brand.charAt(0).toUpperCase()}
          </div>
          <span className={`font-bold text-base sm:text-lg tracking-tight truncate leading-none ${highContrast ? 'text-white' : 'text-slate-900'}`}>
            {brand}
          </span>
        </button>

        <span className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white/90 border border-black/6 text-slate-600 shadow-sm">
          {roleLabel === 'admin' ? 'Owner' : roleLabel}
        </span>
      </div>
    </header>
  );
};
