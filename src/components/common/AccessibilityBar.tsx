import React, { useState } from 'react';
import { Building2, Cloud, Eye, LogOut, ShieldCheck, SunMoon, Type, User, UserCheck, X } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { FontSize } from '../../types';
import { PWAInstallButton } from './PWAInstallButton';

export const AccessibilityBar: React.FC = () => {
  const {
    tab,
    setTab,
    fontSize,
    setFontSize,
    highContrast,
    setHighContrast,
    lowVisionMode,
    toggleLowVisionMode,
    palette,
    fz,
    scale,
    orgProfile,
    supabaseStatus,
    supabaseConfig,
    currentUser,
    logout,
  } = useLedger();

  const [showUserModal, setShowUserModal] = useState(false);

  const sizeOptions: { id: FontSize; glyph: string; superscript?: string; title: string; ariaLabel: string }[] = [
    { id: 'standard', glyph: 'A', title: 'Standard font size (1.0x scale)', ariaLabel: 'Standard font size' },
    { id: 'large', glyph: 'A', superscript: '+', title: 'Large font size (1.25x scale - Depot recommended)', ariaLabel: 'Large font size' },
    { id: 'xlarge', glyph: 'A', superscript: '++', title: 'Extra Large font size (1.55x scale - High legibility)', ariaLabel: 'Extra large font size' },
  ];

  const cycleFontSize = () => {
    if (fontSize === 'standard') setFontSize('large');
    else if (fontSize === 'large') setFontSize('xlarge');
    else setFontSize('standard');
  };

  // Proportionally scaled button height
  const btnHeight = Math.max(34, Math.round(32 * Math.min(scale, 1.25)));

  return (
    <header
      id="accessibility-bar"
      className="flex flex-nowrap items-center justify-between gap-2 px-3 sm:px-5 py-1.5 sm:py-2 border-b-2 select-none min-h-[44px]"
      style={{
        borderColor: palette.line,
        backgroundColor: highContrast ? '#000000' : palette.navy,
      }}
    >
      {/* Left side: Firm Branding & Depot Indicator */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        <div
          className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 rounded border border-white/25 text-white/95 font-bold leading-none truncate"
          style={{
            height: `${btnHeight}px`,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            ...fz(12.5),
          }}
          title={`${orgProfile?.name || 'MrWater Distribution'} — ${orgProfile?.tagline || 'Distribution Ledger'}`}
        >
          <Building2 size={15} className="shrink-0 text-white/80" aria-hidden="true" />
          <span className="truncate max-w-[110px] sm:max-w-[280px] md:max-w-[360px]">
            {orgProfile?.name || 'MrWater Distribution'}
          </span>
          <span className="hidden lg:inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-bold bg-white/15 text-white/90">
            Wholesale Depot
          </span>
        </div>

        {/* Supabase Database Connection Pill */}
        {currentUser?.role === 'admin' ? (
          <button
            id="btn-nav-supabase-status"
            type="button"
            onClick={() => setTab('settings')}
            aria-label={`Database status: ${supabaseStatus.isConnected ? 'Connected' : 'Connecting'}`}
            title={`Supabase Database: ${supabaseConfig.projectRef}.supabase.co (${supabaseStatus.isConnected ? `${supabaseStatus.latencyMs}ms latency` : 'Connecting...'})\nClick to open Database Setup & Sync`}
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 rounded border border-white/20 hover:border-white/40 transition-all cursor-pointer select-none leading-none focus-ring shadow-xs"
            style={{
              height: `${btnHeight}px`,
              backgroundColor: supabaseStatus.isConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              ...fz(12),
            }}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                supabaseStatus.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
              aria-hidden="true"
            />
            <Cloud size={14} className={supabaseStatus.isConnected ? 'text-emerald-300' : 'text-amber-300'} aria-hidden="true" />
            <span className="font-bold text-white/95 tracking-wide">
              Supabase
            </span>
            <span
              className="hidden xl:inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase"
              style={{
                backgroundColor: supabaseStatus.isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)',
                color: '#FFFFFF',
              }}
            >
              {supabaseStatus.isConnected ? 'Live' : 'Sync'}
            </span>
          </button>
        ) : (
          <div
            id="badge-nav-supabase-status"
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 rounded border border-white/20 select-none leading-none shadow-xs text-white/95"
            style={{
              height: `${btnHeight}px`,
              backgroundColor: supabaseStatus.isConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              ...fz(12),
            }}
            title="Cloud Database Synchronization Active"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                supabaseStatus.isConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              aria-hidden="true"
            />
            <Cloud size={14} className={supabaseStatus.isConnected ? 'text-emerald-300' : 'text-amber-300'} aria-hidden="true" />
            <span className="font-bold text-white/95 tracking-wide">
              Cloud Sync
            </span>
          </div>
        )}
      </div>

      {/* Right side: Mobile Streamlined Controls (Single Row, Non-Wrapping) */}
      <div className="flex sm:hidden items-center gap-1.5 shrink-0" role="region" aria-label="Mobile display settings">
        {/* Mobile Font Size Cycler */}
        <button
          id="btn-mobile-font-size"
          type="button"
          onClick={cycleFontSize}
          aria-label={`Font size: ${fontSize}. Tap to cycle size.`}
          title={`Font size: ${fontSize}`}
          className="inline-flex items-center justify-center gap-0.5 px-2 h-8 rounded border border-white/30 bg-white/10 text-white font-bold text-xs cursor-pointer focus-ring"
        >
          <Type size={12} className="text-white/80" />
          <span>{fontSize === 'standard' ? 'A' : fontSize === 'large' ? 'A+' : 'A++'}</span>
        </button>

        {/* Mobile Contrast Toggle */}
        <button
          id="btn-mobile-contrast"
          type="button"
          onClick={() => setHighContrast((v) => !v)}
          aria-pressed={highContrast}
          aria-label="Toggle high contrast"
          title={highContrast ? 'High Contrast ON' : 'High Contrast OFF'}
          className={`inline-flex items-center justify-center w-8 h-8 rounded border cursor-pointer focus-ring transition-colors ${
            highContrast
              ? 'bg-white text-black border-white shadow-xs'
              : 'bg-white/10 text-white border-white/30 hover:bg-white/20'
          }`}
        >
          <SunMoon size={15} />
        </button>

        {/* Mobile Low Vision Toggle */}
        <button
          id="btn-mobile-low-vision"
          type="button"
          onClick={toggleLowVisionMode}
          aria-pressed={lowVisionMode}
          aria-label="Toggle low vision mode"
          title={lowVisionMode ? 'Low Vision Mode ON' : 'Low Vision Mode OFF'}
          className={`inline-flex items-center justify-center w-8 h-8 rounded border cursor-pointer focus-ring transition-colors ${
            lowVisionMode
              ? 'bg-yellow-400 text-black border-yellow-300 font-bold shadow-xs'
              : 'bg-white/10 text-white border-white/30 hover:bg-white/20'
          }`}
        >
          <Eye size={15} />
        </button>

        {/* Mobile Person Icon for Logout & Account (Replaces Settings on top) */}
        {currentUser ? (
          <button
            id="btn-mobile-person-logout"
            type="button"
            onClick={() => setShowUserModal(true)}
            aria-label={`User Account & Log Out: ${currentUser.name || (currentUser.role === 'admin' ? 'Admin' : 'Salesman')}`}
            title={`Logged in as ${currentUser.name || (currentUser.role === 'admin' ? 'Admin' : 'Salesman')} (${currentUser.role.toUpperCase()}) — Tap to Log Out`}
            className={`inline-flex items-center justify-center w-8 h-8 rounded border cursor-pointer focus-ring transition-colors ${
              currentUser.role === 'admin'
                ? 'bg-blue-500/25 text-white border-blue-300/50 hover:bg-blue-500/40'
                : 'bg-amber-500/25 text-white border-amber-300/50 hover:bg-amber-500/40'
            }`}
          >
            <User size={16} />
          </button>
        ) : (
          <button
            id="btn-mobile-person-login"
            type="button"
            onClick={() => logout()}
            aria-label="Sign In"
            title="Sign In"
            className="inline-flex items-center justify-center w-8 h-8 rounded border border-white/30 bg-white/10 text-white hover:bg-white/20 cursor-pointer focus-ring"
          >
            <User size={15} />
          </button>
        )}
      </div>

      {/* Right side: Desktop Display Settings cluster */}
      <div
        id="display-settings-cluster"
        className="hidden sm:flex items-center gap-2 sm:gap-2.5 flex-nowrap ml-auto"
        role="region"
        aria-label="Display and theme settings"
      >
        {/* Label on wider screens */}
        <span
          className="hidden xl:inline-block text-white/70 font-semibold tracking-wider uppercase text-[10.5px]"
          aria-hidden="true"
        >
          Display:
        </span>

        {/* 1. Typography Scale Selector (Segmented Group) */}
        <div
          role="group"
          aria-label="Text size scale"
          className="inline-flex items-center rounded border-2 border-white/40 overflow-hidden bg-black/25 p-0.5 shadow-xs"
          style={{ height: `${btnHeight}px` }}
        >
          <div
            className="flex items-center justify-center pl-2 pr-1.5 text-white/75"
            title="Text sizing control"
            aria-hidden="true"
          >
            <Type size={Math.round(15 * Math.min(scale, 1.25))} />
          </div>

          {sizeOptions.map((opt) => {
            const isSelected = fontSize === opt.id;
            return (
              <button
                key={opt.id}
                id={`font-size-${opt.id}`}
                type="button"
                onClick={() => setFontSize(opt.id)}
                aria-pressed={isSelected}
                aria-label={opt.ariaLabel}
                title={opt.title}
                className="inline-flex items-center justify-center px-2.5 h-full font-bold focus-ring cursor-pointer transition-all leading-none rounded-xs"
                style={{
                  backgroundColor: isSelected ? '#FFFFFF' : 'transparent',
                  color: isSelected ? palette.navy : '#FFFFFF',
                  minWidth: `${Math.round(34 * Math.min(scale, 1.25))}px`,
                  ...fz(12.5, { fontWeight: 800 }),
                }}
              >
                <span>{opt.glyph}</span>
                {opt.superscript && (
                  <span
                    className="ml-0.5 font-black opacity-90 self-start"
                    style={{ fontSize: '0.72em', lineHeight: 1, marginTop: '-0.15em' }}
                  >
                    {opt.superscript}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 2. Upgraded High Contrast Toggle with SunMoon Icon */}
        <button
          id="toggle-high-contrast"
          type="button"
          onClick={() => setHighContrast((v) => !v)}
          aria-pressed={highContrast}
          aria-label={`High contrast mode ${highContrast ? 'active' : 'inactive'}`}
          title={
            highContrast
              ? 'High Contrast (WCAG AAA) is ON — Click to switch to Standard color theme'
              : 'Turn on High Contrast Mode (WCAG AAA pure black & white for outdoor/depot visibility)'
          }
          className="inline-flex items-center justify-center gap-1.5 px-3 rounded border-2 focus-ring cursor-pointer transition-all leading-none shadow-xs"
          style={{
            height: `${btnHeight}px`,
            backgroundColor: highContrast ? '#FFFFFF' : 'rgba(255, 255, 255, 0.1)',
            color: highContrast ? '#000000' : '#FFFFFF',
            borderColor: highContrast ? '#FFFFFF' : 'rgba(255, 255, 255, 0.45)',
            fontWeight: 700,
            ...fz(12.5),
          }}
        >
          {/* Improved SunMoon Icon */}
          <SunMoon
            size={Math.round(16 * Math.min(scale, 1.25))}
            className={highContrast ? 'text-black' : 'text-amber-300'}
            aria-hidden="true"
          />
          <span className="hidden sm:inline font-bold">Contrast</span>
          <span
            className="inline-flex items-center px-1.5 py-0.5 text-[10.5px] font-mono font-black uppercase rounded leading-none"
            style={{
              backgroundColor: highContrast ? '#000000' : 'rgba(255, 255, 255, 0.25)',
              color: '#FFFFFF',
            }}
          >
            {highContrast ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* 3. Low Vision Mode Toggle (Top Bar next to Contrast) */}
        <button
          id="toggle-low-vision"
          type="button"
          onClick={toggleLowVisionMode}
          aria-pressed={lowVisionMode}
          aria-label={`Low vision billing mode ${lowVisionMode ? 'active' : 'inactive'}`}
          title={
            lowVisionMode
              ? 'Low Vision Billing Mode is ON (tap to switch to standard layout)'
              : 'Turn ON Low Vision Mode (simplified, high-accessibility mobile billing with large buttons & steppers)'
          }
          className="inline-flex items-center justify-center gap-1.5 px-3 rounded border-2 focus-ring cursor-pointer transition-all leading-none shadow-xs"
          style={{
            height: `${btnHeight}px`,
            backgroundColor: lowVisionMode ? '#FFFFFF' : 'rgba(255, 255, 255, 0.1)',
            color: lowVisionMode ? '#000000' : '#FFFFFF',
            borderColor: lowVisionMode ? '#FFFFFF' : 'rgba(255, 255, 255, 0.45)',
            fontWeight: 700,
            ...fz(12.5),
          }}
        >
          <Eye
            size={Math.round(16 * Math.min(scale, 1.25))}
            className={lowVisionMode ? 'text-black' : 'text-amber-300'}
            aria-hidden="true"
          />
          <span className="hidden sm:inline font-bold">Low Vision</span>
          <span
            className="inline-flex items-center px-1.5 py-0.5 text-[10.5px] font-mono font-black uppercase rounded leading-none"
            style={{
              backgroundColor: lowVisionMode ? '#000000' : 'rgba(255, 255, 255, 0.25)',
              color: '#FFFFFF',
            }}
          >
            {lowVisionMode ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* PWA / Android App Quick Install */}
        <PWAInstallButton />

        {/* 4. Top Person Icon & Logout (Replaces Settings on Top) */}
        {currentUser ? (
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-white/25">
            <button
              id="btn-top-person-logout"
              type="button"
              onClick={() => setShowUserModal(true)}
              title={`Logged in as ${currentUser.name || (currentUser.role === 'admin' ? 'Admin' : 'Salesman')} (${currentUser.role.toUpperCase()}) — Click to Log Out`}
              aria-label={`User Account & Log Out: ${currentUser.name || currentUser.role}`}
              className="inline-flex items-center justify-center gap-2 px-3 rounded border-2 focus-ring cursor-pointer transition-all leading-none shadow-xs text-white"
              style={{
                height: `${btnHeight}px`,
                backgroundColor:
                  currentUser.role === 'admin' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(234, 179, 8, 0.25)',
                borderColor:
                  currentUser.role === 'admin' ? 'rgba(147, 197, 253, 0.65)' : 'rgba(253, 224, 71, 0.65)',
                fontWeight: 700,
                ...fz(12.5),
              }}
            >
              {currentUser.role === 'admin' ? (
                <ShieldCheck size={Math.round(16 * Math.min(scale, 1.25))} className="text-blue-300 shrink-0" aria-hidden="true" />
              ) : (
                <User size={Math.round(16 * Math.min(scale, 1.25))} className="text-amber-300 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate max-w-[130px]">
                {currentUser.name || (currentUser.role === 'admin' ? 'Admin' : 'Salesman')}
              </span>
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-black uppercase bg-rose-500/40 hover:bg-rose-500/60 text-white border border-rose-400/50"
              >
                <LogOut size={10} className="shrink-0" />
                <span>Log Out</span>
              </span>
            </button>
          </div>
        ) : (
          <button
            id="btn-top-login"
            type="button"
            onClick={() => logout()}
            title="Log In / Switch Account"
            className="inline-flex items-center justify-center gap-1.5 px-3 rounded border-2 focus-ring cursor-pointer transition-all leading-none shadow-xs text-white bg-white/10 hover:bg-white/20 border-white/30"
            style={{
              height: `${btnHeight}px`,
              ...fz(12.5),
            }}
          >
            <User size={15} />
            <span>Sign In</span>
          </button>
        )}
      </div>

      {/* Account & Logout Confirmation Modal */}
      {showUserModal && currentUser && (
        <div
          id="account-logout-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-modal-title"
          onClick={() => setShowUserModal(false)}
        >
          <div
            id="account-logout-modal"
            className="w-full max-w-md rounded-2xl shadow-2xl border-2 p-5 sm:p-6 space-y-4 text-left"
            style={{
              backgroundColor: '#FFFFFF',
              borderColor: palette.navy,
              color: '#0F172A',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-xs"
                  style={{
                    backgroundColor: currentUser.role === 'admin' ? '#2563EB' : '#D97706',
                  }}
                >
                  <User size={22} />
                </div>
                <div>
                  <h2 id="account-modal-title" className="text-base sm:text-lg font-black leading-tight text-slate-900">
                    User Session & Account
                  </h2>
                  <p className="text-xs text-slate-500">Active session details</p>
                </div>
              </div>

              <button
                type="button"
                id="btn-close-account-modal"
                onClick={() => setShowUserModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* User Info Card */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Signed in as</span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider"
                  style={{
                    backgroundColor: currentUser.role === 'admin' ? '#DBEAFE' : '#FEF3C7',
                    color: currentUser.role === 'admin' ? '#1E40AF' : '#92400E',
                  }}
                >
                  {currentUser.role === 'admin' ? 'Administrator' : 'Field Salesman'}
                </span>
              </div>

              <div className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>{currentUser.name || (currentUser.role === 'admin' ? 'Admin' : 'Salesman')}</span>
              </div>

              {'phone' in currentUser && currentUser.phone && (
                <div className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                  <span className="text-slate-400 font-bold">Registered Phone:</span>
                  <span className="font-mono font-bold text-slate-800">{currentUser.phone}</span>
                </div>
              )}

              {'email' in currentUser && currentUser.email && (
                <div className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                  <span className="text-slate-400 font-bold">Admin Email:</span>
                  <span className="font-mono font-bold text-slate-800">{currentUser.email}</span>
                </div>
              )}
            </div>

            {/* Logout Explanation */}
            <p className="text-xs sm:text-sm text-slate-600">
              Logging out will end your session and return you to the login screen where you can sign in as another salesman or switch to administrator.
            </p>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                id="btn-confirm-logout-modal"
                type="button"
                onClick={() => {
                  setShowUserModal(false);
                  logout();
                }}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-black text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all focus-ring text-sm sm:text-base"
              >
                <LogOut size={18} />
                <span>Log Out ({currentUser.name || (currentUser.role === 'admin' ? 'Admin' : 'Salesman')})</span>
              </button>

              {currentUser.role === 'admin' && (
                <button
                  id="btn-modal-open-settings"
                  type="button"
                  onClick={() => {
                    setShowUserModal(false);
                    setTab('settings');
                  }}
                  className="w-full py-2 px-3 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>Go to System Settings</span>
                </button>
              )}

              {/* Install PWA / Android Native Mode */}
              <div className="pt-1">
                <PWAInstallButton variant="full" className="w-full" />
              </div>

              <button
                type="button"
                id="btn-cancel-logout-modal"
                onClick={() => setShowUserModal(false)}
                className="w-full py-2 px-3 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer transition-colors text-center"
              >
                Cancel / Stay Logged In
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
