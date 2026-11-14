import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  User,
  LogOut,
  Settings,
  ChevronDown,
  SunMoon,
  Type,
  Eye,
  Phone,
  Mail,
  MapPin,
  Check,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { FontSize } from '../../types';
import { UserAvatar } from './UserAvatar';
import { ToggleSwitch } from '../ui/ToggleSwitch';

interface ProfileAvatarMenuProps {
  className?: string;
}

export const ProfileAvatarMenu: React.FC<ProfileAvatarMenuProps> = ({ className = '' }) => {
  const {
    currentUser,
    orgProfile,
    warehouses,
    setTab,
    fontSize,
    setFontSize,
    highContrast,
    setHighContrast,
    lowVisionMode,
    toggleLowVisionMode,
    logout,
  } = useLedger();
  const { t } = useLanguage();

  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const businessName = orgProfile?.name || 'Hydrate Hub';
  const businessTagline = orgProfile?.tagline || 'Distribution & Retail ERP';
  const businessInitial = businessName.charAt(0).toUpperCase() || 'H';

  const roleLabel =
    currentUser && typeof currentUser === 'object' && 'role' in currentUser
      ? String((currentUser as { role?: string }).role || 'Owner')
      : 'Owner';
  const userName =
    (currentUser && typeof currentUser === 'object' && 'name' in currentUser && String((currentUser as { name?: string }).name || '').trim()) ||
    (currentUser && typeof currentUser === 'object' && 'username' in currentUser && String((currentUser as { username?: string }).username || '').trim()) ||
    'dibyaprakashkcd5';

  const userEmail =
    (currentUser && typeof currentUser === 'object' && 'email' in currentUser && String((currentUser as { email?: string }).email || '')) ||
    orgProfile?.email ||
    'dibyaprakashkcd5@gmail.com';

  const phone = orgProfile?.phone || '';
  const gstin = orgProfile?.gstin || '';
  const address = orgProfile?.address || '';
  const defaultGodown = warehouses?.find((w) => w.isDefault) || warehouses?.[0];
  const currentGodown = defaultGodown?.name || '';
  const showGodown = (warehouses?.length ?? 0) > 1 && !!currentGodown;

  const handleEditProfile = () => {
    setIsOpen(false);
    setTab('settings');
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    setIsOpen(false);
    if (typeof logout === 'function') {
      logout();
    }
  };

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      {/* Avatar Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 p-0 sm:px-1.5 sm:py-1 rounded-xl bg-transparent border-0 shadow-none hover:opacity-85 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="Business Profile & Settings"
      >
        {/* Colorful Profile Icon (no background box) */}
        <span className="w-10 h-10 flex items-center justify-center bg-transparent text-[#059669] font-extrabold text-lg shrink-0">
          <UserAvatar initial={businessInitial} size={24} />
        </span>

        {/* Business & User Text (Desktop) */}
        <div className="hidden sm:flex flex-col text-left leading-tight min-w-0 max-w-[130px] md:max-w-[160px]">
          <span className="text-xs font-bold text-slate-900 truncate">
            {businessName}
          </span>
          <span className="text-[11px] text-slate-500 truncate capitalize">
            {userName} · {roleLabel}
          </span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform hidden sm:block ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Profile & Business Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1.5rem)] max-h-[80vh] overflow-y-auto sm:w-88 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Business Profile Header */}
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-800 text-white font-extrabold text-lg flex items-center justify-center shrink-0 shadow-xs">
                <UserAvatar initial={businessInitial} size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 truncate">{businessName}</h3>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase">
                    {roleLabel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">{businessTagline}</p>
                <p className="text-[11px] font-medium text-slate-600 mt-1 truncate">
                  👤 {userName}
                </p>
              </div>
            </div>

            {/* Quick Contact & Tax details */}
            <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-1 text-[11px] text-slate-500">
              {userEmail && (
                <div className="flex items-center gap-1.5 truncate">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{userEmail}</span>
                </div>
              )}
              {phone && (
                <div className="flex items-center gap-1.5 truncate">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{phone}</span>
                </div>
              )}
              {gstin && (
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-mono text-slate-400 font-bold text-[10px]">GSTIN:</span>
                  <span className="font-mono font-semibold text-slate-700">{gstin}</span>
                </div>
              )}
              {address && (
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{address}</span>
                </div>
              )}
            </div>

            {/* Edit Business Profile Button */}
            <button
              type="button"
              onClick={handleEditProfile}
              className="mt-3 w-full py-1.5 px-3 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Edit Business Profile & Settings</span>
            </button>
          </div>

          {/* Display & Visual Preferences */}
          <div className="p-3.5 border-b border-slate-200 space-y-2.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Display & Accessibility
            </span>

            {/* Font Size Selector */}
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                <Type className="w-3.5 h-3.5 text-slate-400" />
                <span>Text Size</span>
              </span>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                {(['standard', 'large', 'xlarge'] as FontSize[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setFontSize(sz)}
                    className={`px-2 py-0.5 text-xs font-bold rounded-md transition-colors ${
                      fontSize === sz
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {sz === 'standard' ? 'A' : sz === 'large' ? 'A+' : 'A++'}
                  </button>
                ))}
              </div>
            </div>

            {/* High Contrast Toggle */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span
                id="label-menu-high-contrast"
                onClick={() => setHighContrast(!highContrast)}
                className="flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer select-none"
              >
                <SunMoon className="w-3.5 h-3.5 text-slate-400" />
                <span>High Contrast</span>
              </span>
              <ToggleSwitch
                size="sm"
                checked={highContrast}
                onChange={setHighContrast}
                ariaLabelledBy="label-menu-high-contrast"
              />
            </div>

            {/* Low Vision Mode Toggle */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span
                id="label-menu-low-vision"
                onClick={toggleLowVisionMode}
                className="flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer select-none"
              >
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                <span>High Legibility Mode</span>
              </span>
              <ToggleSwitch
                size="sm"
                tone="emerald"
                checked={lowVisionMode}
                onChange={() => toggleLowVisionMode()}
                ariaLabelledBy="label-menu-low-vision"
              />
            </div>
          </div>

          {/* Active Godown info */}
          {showGodown && (
          <div className="px-3.5 py-2.5 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3 text-slate-400" />
              <span className="shrink-0">Default godown:</span>
            </span>
            <span className="font-semibold text-slate-700 truncate min-w-0">{currentGodown}</span>
          </div>
          )}

          {/* Log Out Button (Moved out from Settings to here per user request) */}
          <div className="p-3 bg-white">
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out / Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Log Out Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Sign Out of Account</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to log out from <strong className="text-slate-800">{businessName}</strong>? All pending transactions remain saved on this device.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="py-2 px-3 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors"
              >
                Confirm Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
