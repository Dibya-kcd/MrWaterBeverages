import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Cloud,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  HelpCircle,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  SunMoon,
  Tag,
  Trash2,
  Type,
  Upload,
  UserCheck,
  X,
  ZoomIn,
} from 'lucide-react';
import { DEMO_PRESETS } from '../../constants/demoPresets';
import { FONT_SCALES } from '../../constants/initialData';
import { useLedger } from '../../context/LedgerContext';
import { DemoPresetId, FontSize, GstMode, PriceType } from '../../types';
import { DatabaseSettingsView } from './DatabaseSettingsView';
import { WarehousesView } from './WarehousesView';
import { SalesmenManagementSection } from './SalesmenManagementSection';

export type SettingsSection =
  | 'org'
  | 'salesmen'
  | 'warehouses'
  | 'billing'
  | 'display'
  | 'promotions'
  | 'database'
  | 'demo';

export interface SettingsViewProps {
  initialSection?: SettingsSection;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ initialSection = 'org' }) => {
  const {
    palette,
    fz,
    scale,
    fontSize,
    setFontSize,
    highContrast,
    setHighContrast,
    lowVisionMode,
    setLowVisionMode,
    toggleLowVisionMode,
    lowVisionStickyPosition,
    setLowVisionStickyPosition,
    orgProfile,
    updateOrgProfile,
    pullOrgProfileFromCloud,
    supabaseConfig,
    supabaseStatus,
    checkSupabaseConnection,
    billingSettings,
    updateBillingSettings,
    pullBillingSettingsFromCloud,
    promotions,
    setTab,
    loadDemoPreset,
    exportBackup,
    importBackup,
    clearTransactions,
    resetToDefault,
    cleanDatabase,
  } = useLedger();

  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [profileForm, setProfileForm] = useState(orgProfile);
  const [billingForm, setBillingForm] = useState(billingSettings);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pullingProfile, setPullingProfile] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);
  const [pullingBilling, setPullingBilling] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Smart Section Selector & Filter Dropdown State
  const [showSectionDropdown, setShowSectionDropdown] = useState(false);
  const [sectionSearch, setSectionSearch] = useState('');
  const sectionDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sectionDropdownRef.current && !sectionDropdownRef.current.contains(e.target as Node)) {
        setShowSectionDropdown(false);
      }
    };
    if (showSectionDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSectionDropdown]);

  useEffect(() => {
    setProfileForm(orgProfile);
  }, [orgProfile]);

  useEffect(() => {
    setBillingForm(billingSettings);
  }, [billingSettings]);

  const cardStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderWidth: 2,
    borderRadius: '0.75rem',
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: palette.panel,
    color: palette.ink,
    borderColor: palette.line,
    borderWidth: 2,
    ...fz(14),
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: palette.ink,
    fontWeight: 600,
    marginBottom: '0.25em',
    ...fz(13),
  };

  const handleProfileChange = (field: keyof typeof profileForm, value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleBillingChange = <K extends keyof typeof billingForm>(field: K, value: typeof billingForm[K]) => {
    setBillingForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await updateOrgProfile(profileForm);
      if (res.cloudSynced) {
        setSaveSuccessMsg('Organisation profile saved locally & synchronized to Supabase PostgreSQL cloud!');
      } else if (res.message) {
        setSaveSuccessMsg(`Organisation profile saved locally. (Supabase cloud notice: ${res.message})`);
      } else {
        setSaveSuccessMsg('Organisation profile saved locally!');
      }
    } catch (err: any) {
      setSaveSuccessMsg(`Saved locally. (${err?.message || 'Offline'})`);
    } finally {
      setSavingProfile(false);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    }
  };

  const handlePullProfile = async () => {
    setPullingProfile(true);
    try {
      const res = await pullOrgProfileFromCloud();
      if (res.success) {
        setSaveSuccessMsg('Organisation profile refreshed from Supabase cloud database!');
      } else {
        setSaveSuccessMsg(`Could not pull from Supabase: ${res.message || 'No record found'}`);
      }
    } catch (err: any) {
      setSaveSuccessMsg(`Pull error: ${err?.message || 'Network error'}`);
    } finally {
      setPullingProfile(false);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    }
  };

  const handleSaveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBilling(true);
    try {
      const res = await updateBillingSettings(billingForm);
      if (res.cloudSynced) {
        setSaveSuccessMsg('Billing & stock parameters saved locally & synchronized to Supabase PostgreSQL cloud!');
      } else if (res.message) {
        setSaveSuccessMsg(`Billing settings saved locally. (Supabase cloud notice: ${res.message})`);
      } else {
        setSaveSuccessMsg('Billing & stock preferences saved successfully!');
      }
    } catch (err: any) {
      setSaveSuccessMsg(`Saved locally. (${err?.message || 'Offline'})`);
    } finally {
      setSavingBilling(false);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    }
  };

  const handlePullBilling = async () => {
    setPullingBilling(true);
    try {
      const res = await pullBillingSettingsFromCloud();
      if (res.success) {
        setSaveSuccessMsg('Billing settings refreshed from Supabase cloud database!');
      } else {
        setSaveSuccessMsg(`Could not pull from Supabase: ${res.message || 'No record found'}`);
      }
    } catch (err: any) {
      setSaveSuccessMsg(`Pull error: ${err?.message || 'Network error'}`);
    } finally {
      setPullingBilling(false);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = importBackup(content);
      if (res.success) {
        setImportStatus({ type: 'success', message: 'Backup restored successfully! All data updated.' });
        // update local forms
        setTimeout(() => window.location.reload(), 800);
      } else {
        setImportStatus({ type: 'error', message: res.error || 'Failed to import backup file' });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCleanDatabase = () => {
    if (window.confirm('Are you sure you want to clean the entire database? All sample items, inward vouchers, batches, and transactions will be removed, leaving an entirely clean database.')) {
      cleanDatabase();
      setSaveSuccessMsg('Database cleaned. All unwanted records and sample data have been completely removed.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  const handleResetDemo = () => {
    if (window.confirm('Reset all ledger data back to factory defaults? Any custom invoices, trips, or changes will be restored.')) {
      resetToDefault();
      setSaveSuccessMsg('Ledger reset to standard defaults.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  const handleClearTransactions = () => {
    if (window.confirm('Are you sure you want to clear all bills, vehicle trips, and audits? Products catalog and company profile will be safely preserved.')) {
      clearTransactions();
      setSaveSuccessMsg('All transaction records cleared.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  const handleLoadPreset = (presetId: DemoPresetId) => {
    const preset = DEMO_PRESETS[presetId];
    if (window.confirm(`Load preset "${preset.name}"? This will populate the ledger with sample data for this scenario.`)) {
      loadDemoPreset(presetId);
      setProfileForm(preset.orgProfile);
      setSaveSuccessMsg(`Preset "${preset.name}" loaded successfully!`);
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    }
  };

  const navButtons: {
    id: SettingsSection;
    label: string;
    description: string;
    icon: React.ComponentType<{ size?: number }>;
    group: string;
  }[] = [
    { id: 'org', label: 'Organisation Profile', description: 'Firm details, GSTIN, address, WhatsApp message', icon: Building2, group: 'Business & Operations' },
    { id: 'salesmen', label: 'Manage Salesmen', description: 'Field staff, assigned vans, PIN login & active status', icon: UserCheck, group: 'Business & Operations' },
    { id: 'warehouses', label: 'Godowns & Warehouses', description: 'Multi-location depots, stock transfers & batches', icon: Building2, group: 'Business & Operations' },
    { id: 'billing', label: 'Billing & Invoicing', description: 'GST mode, tax calculations, invoice number prefixes', icon: Receipt, group: 'Billing & Commercial' },
    { id: 'promotions', label: 'Promotions & Schemes', description: 'BOGO schemes, % volume discounts & cash cutoffs', icon: Tag, group: 'Billing & Commercial' },
    { id: 'display', label: 'Display & Accessibility', description: 'Font scale, high contrast, low vision zoom bar', icon: Eye, group: 'Preferences & System' },
    { id: 'database', label: 'Database & Cloud', description: 'Supabase sync, connection latency, SQL migrations', icon: Cloud, group: 'Preferences & System' },
    { id: 'demo', label: 'Data & Backups', description: 'JSON backup export, restore, demo datasets & reset', icon: Database, group: 'Preferences & System' },
  ];

  const currentNav = navButtons.find((b) => b.id === activeSection) || navButtons[0];
  const CurrentIcon = currentNav.icon;

  const filteredNavButtons = navButtons.filter(
    (b) =>
      !sectionSearch ||
      b.label.toLowerCase().includes(sectionSearch.toLowerCase()) ||
      b.description.toLowerCase().includes(sectionSearch.toLowerCase()) ||
      b.group.toLowerCase().includes(sectionSearch.toLowerCase())
  );

  return (
    <div id="view-settings" className="p-4 sm:p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Sliders size={Math.round(24 * scale)} style={{ color: palette.amber }} aria-hidden="true" />
          <h1 style={fz(26, { fontWeight: 700, color: palette.ink })}>System & Agency Settings</h1>
        </div>
        <p style={fz(15, { color: palette.muted })}>
          Manage your business identity, accessibility display scale, trade scheme rules, invoice formatting, and demo data presets.
        </p>
      </div>

      {/* Success Notification */}
      {saveSuccessMsg && (
        <div
          role="status"
          className="mb-5 p-3.5 border-2 flex items-center gap-2.5 font-bold"
          style={{
            borderColor: palette.good,
            backgroundColor: `${palette.good}15`,
            color: palette.good,
            ...fz(14),
          }}
        >
          <Check size={Math.round(18 * scale)} aria-hidden="true" />
          {saveSuccessMsg}
        </div>
      )}

      {/* Smart Space-Saving Section Selector & Filter Bar */}
      <div className="mb-6 space-y-2.5">
        <div
          className="flex flex-wrap items-center justify-between gap-3 p-2.5 sm:p-3 rounded-xl border-2 bg-white shadow-2xs"
          style={{ borderColor: palette.line }}
        >
          {/* Active Section Info Chip */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-900 border border-blue-200 shrink-0">
              <CurrentIcon size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Settings Section:</span>
                <span className="px-2 py-0.2 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-700">
                  {currentNav.group}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-black truncate text-slate-900">
                {currentNav.label}
              </h2>
            </div>
          </div>

          {/* Smart Section Switcher / Filter Popover */}
          <div className="relative" ref={sectionDropdownRef}>
            <button
              type="button"
              id="btn-settings-section-toggle"
              onClick={() => setShowSectionDropdown((prev) => !prev)}
              className={`flex items-center gap-2 px-3.5 py-2 border-2 rounded text-xs sm:text-sm font-bold cursor-pointer transition-colors focus-ring ${
                showSectionDropdown
                  ? 'bg-blue-900 text-white border-blue-900'
                  : 'bg-white hover:bg-slate-50 text-slate-800'
              }`}
              style={{
                borderColor: showSectionDropdown ? palette.navy : palette.line,
              }}
            >
              <Filter size={14} />
              <span>Filter / Switch Section</span>
              <ChevronDown
                size={13}
                className={`transition-transform duration-200 ${showSectionDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Smart Popover */}
            {showSectionDropdown && (
              <div
                id="popover-settings-sections"
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border-2 rounded-xl shadow-2xl z-50 p-3.5 space-y-3 animate-in fade-in duration-150"
                style={{ borderColor: palette.navy }}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal size={15} className="text-blue-900" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Settings Sections ({navButtons.length})
                    </span>
                  </div>
                </div>

                {/* Section Search Bar */}
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    placeholder="Search settings section..."
                    value={sectionSearch}
                    onChange={(e) => setSectionSearch(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 border-2 rounded text-xs focus:outline-none focus:border-blue-900"
                    style={{ borderColor: palette.line, color: palette.ink }}
                  />
                  {sectionSearch && (
                    <button
                      type="button"
                      onClick={() => setSectionSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Section Options List */}
                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                  {filteredNavButtons.map(({ id, label, description, icon: Icon, group }) => {
                    const active = activeSection === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        id={`option-settings-${id}`}
                        onClick={() => {
                          setActiveSection(id);
                          setShowSectionDropdown(false);
                          setSectionSearch('');
                        }}
                        className={`w-full text-left p-2.5 rounded-lg border-2 flex items-start gap-2.5 cursor-pointer transition-all ${
                          active
                            ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div
                          className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
                            active ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-900'
                          }`}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold truncate">{label}</span>
                            <span
                              className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded shrink-0 ${
                                active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {group}
                            </span>
                          </div>
                          <p
                            className={`text-[11px] line-clamp-1 mt-0.5 ${
                              active ? 'text-blue-100' : 'text-slate-500'
                            }`}
                          >
                            {description}
                          </p>
                        </div>
                        {active && <Check size={14} className="shrink-0 mt-1 text-amber-300" />}
                      </button>
                    );
                  })}
                  {filteredNavButtons.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-500">
                      No settings section found matching "{sectionSearch}"
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Click any section to switch</span>
                  <button
                    type="button"
                    onClick={() => setShowSectionDropdown(false)}
                    className="font-bold text-blue-900 hover:underline cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Compact Horizontal Quick-Pills for Fast Desktop Navigation */}
        <div
          role="tablist"
          aria-label="Settings categories"
          className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs"
        >
          {navButtons.map(({ id, label, icon: Icon }) => {
            const active = activeSection === id;
            return (
              <button
                key={id}
                id={`tab-settings-${id}`}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSection(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 font-bold whitespace-nowrap cursor-pointer transition-colors text-xs ${
                  active
                    ? 'bg-blue-900 text-white border-blue-900 shadow-2xs'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 1: ORGANISATION PROFILE */}
      {activeSection === 'org' && (
        <div id="section-org-profile" className="space-y-6">
          <form onSubmit={handleSaveProfile} className="border-2 p-5 sm:p-6 shadow-sm" style={cardStyle}>
            <div className="flex items-center justify-between pb-3 mb-4 border-b-2 flex-wrap gap-3" style={{ borderColor: palette.line }}>
              <div>
                <h2 style={fz(19, { fontWeight: 700, color: palette.ink })}>Business & Firm Profile</h2>
                <p style={fz(13.5, { color: palette.muted })}>
                  This information appears on customer tax invoices, receipt headers, WhatsApp share messages, and payment details.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  id="btn-pull-org-profile"
                  onClick={handlePullProfile}
                  disabled={pullingProfile || !supabaseStatus.isConnected}
                  className="flex items-center gap-1.5 border-2 px-3 py-2 font-semibold focus-ring cursor-pointer transition-colors"
                  style={{
                    backgroundColor: palette.panel,
                    borderColor: palette.line,
                    color: palette.ink,
                    ...fz(13),
                  }}
                  title="Pull latest profile saved in Supabase cloud"
                >
                  <RefreshCw
                    size={Math.round(15 * scale)}
                    className={pullingProfile ? 'animate-spin' : ''}
                    aria-hidden="true"
                  />
                  {pullingProfile ? 'Pulling...' : 'Pull from Supabase'}
                </button>

                <button
                  type="submit"
                  id="btn-save-org-profile"
                  disabled={savingProfile}
                  className="flex items-center gap-2 border-2 px-4 py-2 font-bold focus-ring cursor-pointer"
                  style={{
                    backgroundColor: palette.navy,
                    borderColor: palette.navy,
                    color: '#FFFFFF',
                    ...fz(14),
                  }}
                >
                  {savingProfile ? (
                    <RefreshCw size={Math.round(16 * scale)} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Save size={Math.round(16 * scale)} aria-hidden="true" />
                  )}
                  {savingProfile ? 'Saving & Syncing...' : 'Save & Sync to Supabase'}
                </button>
              </div>
            </div>

            {/* Supabase Database Connection & Sync Status Banner */}
            <div
              className="p-3 mb-5 border rounded flex flex-wrap items-center justify-between gap-3 text-xs"
              style={{
                backgroundColor: supabaseStatus.isConnected ? `${palette.good}08` : `${palette.amber}08`,
                borderColor: supabaseStatus.isConnected ? `${palette.good}40` : `${palette.amber}40`,
              }}
            >
              <div className="flex items-center gap-2">
                <Database size={16} className={supabaseStatus.isConnected ? 'text-emerald-600' : 'text-amber-600'} />
                <span>
                  <strong className="text-slate-800 dark:text-slate-200">Database Engine:</strong>{' '}
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                    Supabase PostgreSQL
                  </span>{' '}
                  (Project: <code className="font-mono">{supabaseConfig.projectRef}</code>)
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold uppercase"
                  style={{
                    backgroundColor: supabaseStatus.isConnected ? `${palette.good}20` : `${palette.amber}20`,
                    color: supabaseStatus.isConnected ? palette.good : palette.amber,
                  }}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      supabaseStatus.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  {supabaseStatus.isConnected ? 'Live Cloud Connected' : 'Local Storage Only'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <span>Auto-saves to browser storage & syncs to cloud on save.</span>
                <button
                  type="button"
                  onClick={() => setActiveSection('database')}
                  className="underline font-bold hover:text-indigo-600 cursor-pointer"
                >
                  Configure Cloud SQL →
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="org-name" style={labelStyle}>
                  Firm / Agency Name *
                </label>
                <input
                  id="org-name"
                  type="text"
                  required
                  value={profileForm.name}
                  onChange={(e) => handleProfileChange('name', e.target.value)}
                  placeholder="e.g. MrWater Beverages & Distribution"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="org-tagline" style={labelStyle}>
                  Tagline / Subtitle
                </label>
                <input
                  id="org-tagline"
                  type="text"
                  value={profileForm.tagline}
                  onChange={(e) => handleProfileChange('tagline', e.target.value)}
                  placeholder="e.g. Authorized Beverage Agency & C&F Depot"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="org-owner" style={labelStyle}>
                  Proprietor / Authorized Signatory
                </label>
                <input
                  id="org-owner"
                  type="text"
                  value={profileForm.ownerName}
                  onChange={(e) => handleProfileChange('ownerName', e.target.value)}
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="org-phone" style={labelStyle}>
                  Billing WhatsApp / Phone Number *
                </label>
                <input
                  id="org-phone"
                  type="text"
                  required
                  value={profileForm.phone}
                  onChange={(e) => handleProfileChange('phone', e.target.value)}
                  placeholder="10-digit mobile for bills"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="org-address" style={labelStyle}>
                  Depot / Warehouse Address
                </label>
                <input
                  id="org-address"
                  type="text"
                  value={profileForm.address}
                  onChange={(e) => handleProfileChange('address', e.target.value)}
                  placeholder="e.g. Shop No. 12, APMC Market Yard, Station Road"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="org-city" style={labelStyle}>
                  City, State & PIN Code
                </label>
                <input
                  id="org-city"
                  type="text"
                  value={profileForm.city}
                  onChange={(e) => handleProfileChange('city', e.target.value)}
                  placeholder="e.g. Pune, Maharashtra - 411001"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="org-email" style={labelStyle}>
                  Official Email Address
                </label>
                <input
                  id="org-email"
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => handleProfileChange('email', e.target.value)}
                  placeholder="e.g. radhika.distribution@example.com"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              {/* Statutory Info */}
              <div className="md:col-span-2 pt-3 border-t-2 mt-2" style={{ borderColor: palette.line }}>
                <h3 style={fz(16, { fontWeight: 700, color: palette.ink, marginBottom: '0.75rem' })}>
                  Tax & Regulatory Registration
                </h3>
              </div>

              <div>
                <label htmlFor="org-gstin" style={labelStyle}>
                  GSTIN (GST Identification Number)
                </label>
                <input
                  id="org-gstin"
                  type="text"
                  maxLength={15}
                  value={profileForm.gstin}
                  onChange={(e) => handleProfileChange('gstin', e.target.value.toUpperCase())}
                  placeholder="15-digit GSTIN (e.g. 27AABCR1234F1Z5)"
                  className="w-full px-3 py-2 focus-ring uppercase"
                  style={inputStyle}
                />
                <span style={fz(11.5, { color: palette.muted, marginTop: '2px', display: 'block' })}>
                  Format: 2-digit state code + 10 PAN characters + 1 entity + Z + checksum
                </span>
              </div>

              <div>
                <label htmlFor="org-fssai" style={labelStyle}>
                  FSSAI License Number (Food Safety)
                </label>
                <input
                  id="org-fssai"
                  type="text"
                  maxLength={14}
                  value={profileForm.fssai}
                  onChange={(e) => handleProfileChange('fssai', e.target.value)}
                  placeholder="14-digit FSSAI (e.g. 11521000001234)"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              {/* Bank & Settlement info */}
              <div className="md:col-span-2 pt-3 border-t-2 mt-2" style={{ borderColor: palette.line }}>
                <div className="flex items-center gap-2">
                  <CreditCard size={Math.round(18 * scale)} style={{ color: palette.amber }} aria-hidden="true" />
                  <h3 style={fz(16, { fontWeight: 700, color: palette.ink })}>
                    Retailer Payment Collection & Bank Details
                  </h3>
                </div>
                <p style={fz(12.5, { color: palette.muted, marginTop: '2px' })}>
                  Printed on invoices and included in WhatsApp bills so retailers can pay you directly via UPI or NEFT.
                </p>
              </div>

              <div>
                <label htmlFor="org-upi" style={labelStyle}>
                  UPI ID (VPA for QR / Instant Pay)
                </label>
                <input
                  id="org-upi"
                  type="text"
                  value={profileForm.upiId}
                  onChange={(e) => handleProfileChange('upiId', e.target.value)}
                  placeholder="e.g. radhikabev@sbi"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="org-bank-name" style={labelStyle}>
                  Bank Name
                </label>
                <input
                  id="org-bank-name"
                  type="text"
                  value={profileForm.bankName}
                  onChange={(e) => handleProfileChange('bankName', e.target.value)}
                  placeholder="e.g. State Bank of India"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="org-acc-no" style={labelStyle}>
                  Bank Account Number
                </label>
                <input
                  id="org-acc-no"
                  type="text"
                  value={profileForm.accountNumber}
                  onChange={(e) => handleProfileChange('accountNumber', e.target.value)}
                  placeholder="e.g. 30894567123"
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="org-ifsc" style={labelStyle}>
                  IFSC Code
                </label>
                <input
                  id="org-ifsc"
                  type="text"
                  maxLength={11}
                  value={profileForm.ifsc}
                  onChange={(e) => handleProfileChange('ifsc', e.target.value.toUpperCase())}
                  placeholder="e.g. SBIN0001234"
                  className="w-full px-3 py-2 focus-ring uppercase"
                  style={inputStyle}
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="org-terms" style={labelStyle}>
                  Invoice Terms & Conditions / Footer Remarks
                </label>
                <textarea
                  id="org-terms"
                  rows={2}
                  value={profileForm.invoiceTerms}
                  onChange={(e) => handleProfileChange('invoiceTerms', e.target.value)}
                  placeholder="e.g. Goods once sold will not be taken back. Payment due within 7 days."
                  className="w-full px-3 py-2 focus-ring resize-y"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 border-2 px-5 py-2.5 font-bold focus-ring cursor-pointer"
                style={{
                  backgroundColor: palette.navy,
                  borderColor: palette.navy,
                  color: '#FFFFFF',
                  ...fz(14),
                }}
              >
                <Save size={Math.round(16 * scale)} aria-hidden="true" />
                Save Profile Changes
              </button>
            </div>
          </form>

          {/* Live Preview Card */}
          <div className="border-2 p-5 shadow-sm" style={cardStyle}>
            <div className="flex items-center gap-2 mb-3">
              <Receipt size={Math.round(18 * scale)} style={{ color: palette.amber }} aria-hidden="true" />
              <h3 style={fz(16, { fontWeight: 700, color: palette.ink })}>
                Live Invoice Header & WhatsApp Preview
              </h3>
            </div>
            <div
              className="border-2 p-4 font-mono select-none"
              style={{
                backgroundColor: `${palette.navy}08`,
                borderColor: palette.line,
                ...fz(12.5),
                color: palette.ink,
              }}
            >
              <div className="font-bold text-base" style={{ color: palette.navy }}>
                {profileForm.name || 'YOUR FIRM NAME'}
              </div>
              <div className="italic">{profileForm.tagline || 'Authorized Beverage Agency'}</div>
              <div>{profileForm.address ? `${profileForm.address}, ${profileForm.city}` : 'Market Yard, Pune'}</div>
              <div>Contact: {profileForm.phone || '9876543210'} | GSTIN: {profileForm.gstin || '27AABCR1234F1Z5'}</div>
              {profileForm.fssai && <div>FSSAI Lic. No: {profileForm.fssai}</div>}
              <div className="my-1 border-t border-dashed" style={{ borderColor: palette.line }}></div>
              <div>*Tax Invoice #101 — Sample Retailer Store*</div>
              <div>Date: 2026-09-15</div>
              <div>CAMPA POWER UP x3 (1 free) @ ₹240.00 = ₹480.00</div>
              <div>*Total: ₹480.00 (Paid: ₹480.00 | Balance: ₹0.00)*</div>
              <div className="my-1 border-t border-dashed" style={{ borderColor: palette.line }}></div>
              <div>Payment: UPI {profileForm.upiId || 'radhikabev@sbi'} | Bank: {profileForm.bankName || 'SBI'} (A/c: {profileForm.accountNumber || '••••••'})</div>
              <div className="text-xs opacity-80 mt-1">{profileForm.invoiceTerms}</div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: GODOWNS & WAREHOUSES */}
      {activeSection === 'warehouses' && (
        <div id="section-warehouses-settings" className="space-y-6">
          <WarehousesView embedded initialSubTab="warehouses" />
        </div>
      )}

      {/* SECTION: MANAGE SALESMEN */}
      {activeSection === 'salesmen' && (
        <div id="section-salesmen-settings" className="space-y-6">
          <SalesmenManagementSection />
        </div>
      )}

      {/* SECTION 2: DISPLAY & ACCESSIBILITY */}
      {activeSection === 'display' && (
        <div id="section-display-settings" className="space-y-6">
          <div className="border-2 p-5 sm:p-6 shadow-sm" style={cardStyle}>
            <h2 style={fz(19, { fontWeight: 700, color: palette.ink, marginBottom: '0.25em' })}>
              Text Size & Accessibility Scaling
            </h2>
            <p style={fz(14, { color: palette.muted, marginBottom: '1.25rem' })}>
              Choose a typography scale engineered for high legibility, depot lighting conditions, and elder shopkeeper readability.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                {
                  id: 'standard' as FontSize,
                  glyph: 'A',
                  badge: '1.00x',
                  title: 'Standard',
                  subtitle: 'Compact Desktop',
                  desc: 'Dense layout suited for HD monitors & high information capacity.',
                  sampleSize: 14,
                },
                {
                  id: 'large' as FontSize,
                  glyph: 'A+',
                  badge: '1.25x',
                  title: 'Large',
                  subtitle: 'Depot Recommended',
                  desc: '+25% font scale with generous touch targets and relaxed line heights.',
                  sampleSize: 17,
                },
                {
                  id: 'xlarge' as FontSize,
                  glyph: 'A++',
                  badge: '1.55x',
                  title: 'Extra Large',
                  subtitle: 'High Visibility',
                  desc: '+55% maximum accessibility scale engineered for elder readability.',
                  sampleSize: 21,
                },
              ].map((opt) => {
                const isSelected = fontSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFontSize(opt.id)}
                    aria-pressed={isSelected}
                    className="p-4 border-2 text-left focus-ring cursor-pointer transition-all flex flex-col justify-between h-full"
                    style={{
                      borderColor: isSelected ? palette.navy : palette.line,
                      backgroundColor: isSelected ? `${palette.navy}10` : palette.panel,
                      borderWidth: isSelected ? 3 : 2,
                    }}
                  >
                    <div>
                      {/* Top icon and scale pill */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div
                          className="w-9 h-9 rounded inline-flex items-center justify-center font-black text-sm border-2 leading-none"
                          style={{
                            backgroundColor: isSelected ? palette.navy : `${palette.line}25`,
                            color: isSelected ? '#FFFFFF' : palette.ink,
                            borderColor: isSelected ? palette.navy : palette.line,
                          }}
                        >
                          {opt.glyph}
                        </div>
                        <span
                          className="px-2 py-0.5 font-mono font-bold rounded text-xs leading-none"
                          style={{
                            backgroundColor: isSelected ? palette.navy : `${palette.line}30`,
                            color: isSelected ? '#FFFFFF' : palette.muted,
                          }}
                        >
                          {opt.badge}
                        </span>
                      </div>

                      {/* Title and subtitle */}
                      <div className="mb-2">
                        <div style={fz(16, { fontWeight: 700, color: palette.ink, lineHeight: 1.2 })}>
                          {opt.title}
                        </div>
                        <div className="text-xs font-semibold opacity-75 mt-0.5" style={{ color: palette.muted }}>
                          {opt.subtitle}
                        </div>
                      </div>

                      <p style={fz(13, { color: palette.muted, lineHeight: 1.35 })}>{opt.desc}</p>
                    </div>

                    {/* Bottom specimen & active indicator */}
                    <div
                      className="mt-4 pt-3 border-t flex items-center justify-between"
                      style={{ borderColor: `${palette.line}40` }}
                    >
                      <span
                        style={{
                          fontSize: `${opt.sampleSize}px`,
                          fontWeight: 700,
                          color: palette.navy,
                          lineHeight: 1,
                        }}
                      >
                        Aa ₹240
                      </span>
                      {isSelected ? (
                        <span className="flex items-center gap-1 text-xs font-bold" style={{ color: palette.good }}>
                          <Check size={14} /> Active
                        </span>
                      ) : (
                        <span className="text-xs opacity-60 font-semibold" style={{ color: palette.muted }}>
                          Click to apply
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* High Contrast Mode Toggle */}
            <div className="pt-4 border-t-2" style={{ borderColor: palette.line }}>
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-2 rounded-xs" style={{ borderColor: palette.line, backgroundColor: highContrast ? '#0000000a' : `${palette.navy}08` }}>
                <div className="max-w-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <SunMoon size={Math.round(20 * Math.min(scale, 1.25))} style={{ color: palette.amber }} aria-hidden="true" />
                    <h3 style={fz(16, { fontWeight: 700, color: palette.ink })}>High Contrast Mode (WCAG AAA)</h3>
                  </div>
                  <p style={fz(13.5, { color: palette.muted })}>
                    Converts the entire distribution system to stark, high-contrast monochrome (pure black & white) with crisp high-definition borders. Optimal for strong outdoor sunlight, loading docks, and low-vision depot operators.
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-settings-high-contrast"
                  onClick={() => setHighContrast((v) => !v)}
                  aria-pressed={highContrast}
                  className="inline-flex items-center justify-center gap-2.5 border-2 px-4 py-2.5 font-bold focus-ring cursor-pointer transition-all leading-none shadow-xs"
                  style={{
                    backgroundColor: highContrast ? '#000000' : palette.panel,
                    color: highContrast ? '#FFFFFF' : palette.ink,
                    borderColor: palette.ink,
                    ...fz(14),
                  }}
                >
                  <SunMoon size={Math.round(18 * Math.min(scale, 1.25))} aria-hidden="true" />
                  <span>High Contrast</span>
                  <span
                    className="px-2 py-0.5 rounded text-xs font-mono font-black uppercase"
                    style={{
                      backgroundColor: highContrast ? '#FFFFFF' : palette.ink,
                      color: highContrast ? '#000000' : '#FFFFFF',
                    }}
                  >
                    {highContrast ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            </div>

            {/* Low Vision Mode (Simplified Mobile Sales Layout) */}
            <div className="pt-4 border-t-2" style={{ borderColor: palette.line }}>
              <div
                className="p-4 border-2 rounded-xs"
                style={{
                  borderColor: lowVisionMode ? palette.navy : palette.line,
                  backgroundColor: lowVisionMode ? (highContrast ? '#00000010' : `${palette.navy}08`) : palette.panel,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                  <div className="max-w-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <Eye size={Math.round(20 * Math.min(scale, 1.25))} style={{ color: palette.amber }} aria-hidden="true" />
                      <h3 style={fz(16, { fontWeight: 700, color: palette.ink })}>
                        Low Vision Mode (Accessible Mobile Billing Layout)
                      </h3>
                    </div>
                    <p style={fz(13.5, { color: palette.muted })}>
                      Transforms the New Invoice form into a single-column, high-contrast touch interface with minimum 18px text, 56px+ tap targets, quick-select shop buttons, quantity steppers (no typing required), and instant audible/visual confirmations.
                    </p>
                  </div>
                  <button
                    type="button"
                    id="btn-settings-low-vision"
                    onClick={toggleLowVisionMode}
                    aria-pressed={lowVisionMode}
                    className="inline-flex items-center justify-center gap-2.5 border-2 px-4 py-2.5 font-bold focus-ring cursor-pointer transition-all leading-none shadow-xs"
                    style={{
                      backgroundColor: lowVisionMode ? (highContrast ? '#000000' : palette.navy) : palette.panel,
                      color: lowVisionMode ? '#FFFFFF' : palette.ink,
                      borderColor: palette.ink,
                      ...fz(14),
                    }}
                  >
                    <Eye size={Math.round(18 * Math.min(scale, 1.25))} aria-hidden="true" />
                    <span>Low Vision Mode</span>
                    <span
                      className="px-2 py-0.5 rounded text-xs font-mono font-black uppercase"
                      style={{
                        backgroundColor: lowVisionMode ? '#FFFFFF' : palette.ink,
                        color: lowVisionMode ? '#000000' : '#FFFFFF',
                      }}
                    >
                      {lowVisionMode ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>

                {/* Running Total Bar Placement Preference */}
                <div className="pt-3 border-t mt-3 flex flex-wrap items-center justify-between gap-3" style={{ borderColor: `${palette.line}60` }}>
                  <div>
                    <span style={fz(13.5, { fontWeight: 700, color: palette.ink, display: 'block' })}>
                      Sticky Running Total Bar Position
                    </span>
                    <span style={fz(12, { color: palette.muted })}>
                      Choose where the persistent invoice running total bar sits in Low Vision Mode.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      id="btn-sticky-bottom"
                      onClick={() => setLowVisionStickyPosition('bottom')}
                      aria-pressed={lowVisionStickyPosition === 'bottom'}
                      className="px-3 py-1.5 border-2 rounded text-xs font-bold cursor-pointer transition-all"
                      style={{
                        borderColor: lowVisionStickyPosition === 'bottom' ? palette.navy : palette.line,
                        backgroundColor: lowVisionStickyPosition === 'bottom' ? palette.navy : palette.panel,
                        color: lowVisionStickyPosition === 'bottom' ? '#FFFFFF' : palette.ink,
                      }}
                    >
                      Pinned to Bottom (Mobile Thumb-Zone)
                    </button>
                    <button
                      type="button"
                      id="btn-sticky-top"
                      onClick={() => setLowVisionStickyPosition('top')}
                      aria-pressed={lowVisionStickyPosition === 'top'}
                      className="px-3 py-1.5 border-2 rounded text-xs font-bold cursor-pointer transition-all"
                      style={{
                        borderColor: lowVisionStickyPosition === 'top' ? palette.navy : palette.line,
                        backgroundColor: lowVisionStickyPosition === 'top' ? palette.navy : palette.panel,
                        color: lowVisionStickyPosition === 'top' ? '#FFFFFF' : palette.ink,
                      }}
                    >
                      Pinned to Top
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Visual Specimen */}
          <div className="border-2 p-5 shadow-sm" style={cardStyle}>
            <h3 style={fz(16, { fontWeight: 700, color: palette.ink, marginBottom: '0.5rem' })}>
              Live Typography & Contrast Specimen
            </h3>
            <div className="border-2 p-4" style={{ borderColor: palette.line, backgroundColor: palette.panel }}>
              <div className="flex justify-between items-center mb-2">
                <span style={fz(17, { fontWeight: 700, color: palette.navy })}>CAMPA POWER UP (150ml PET)</span>
                <span style={fz(14, { fontWeight: 700, color: palette.good })}>Stock: 147 Cases Available</span>
              </div>
              <p style={fz(14, { color: palette.muted })}>
                Campa Energy Category · HSN 22021090 · GST 20% · Retail Rate: ₹240.00 / Case
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="border-2 px-3 py-1.5 font-bold"
                  style={{ backgroundColor: palette.navy, color: '#FFFFFF', borderColor: palette.navy, ...fz(13) }}
                >
                  Sample Primary Action
                </button>
                <button
                  type="button"
                  className="border-2 px-3 py-1.5 font-bold"
                  style={{ backgroundColor: palette.panel, color: palette.ink, borderColor: palette.line, ...fz(13) }}
                >
                  Sample Secondary
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: PROMOTIONS & TRADE SCHEMES */}
      {activeSection === 'promotions' && (
        <div id="section-promotions-settings" className="space-y-6">
          <div className="border-2 p-5 sm:p-6 shadow-sm" style={cardStyle}>
            <div className="flex items-center justify-between pb-3 mb-4 border-b-2 flex-wrap gap-2" style={{ borderColor: palette.line }}>
              <div>
                <h2 style={fz(19, { fontWeight: 700, color: palette.ink })}>Trade Schemes & Promotions Rules</h2>
                <p style={fz(13.5, { color: palette.muted })}>
                  Control how beverage distributor offers (Buy-X-Get-Y-Free, case rebates, % discounts) apply across sales.
                </p>
              </div>
              <button
                type="button"
                id="btn-goto-promotions"
                onClick={() => setTab('promotions')}
                className="flex items-center gap-2 border-2 px-4 py-2 font-bold focus-ring cursor-pointer"
                style={{
                  backgroundColor: palette.navy,
                  borderColor: palette.navy,
                  color: '#FFFFFF',
                  ...fz(14),
                }}
              >
                <Tag size={Math.round(16 * scale)} aria-hidden="true" />
                Open Scheme Builder
              </button>
            </div>

            {/* Automation toggle */}
            <div className="p-4 border-2 mb-5" style={{ borderColor: palette.line, backgroundColor: `${palette.navy}06` }}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="setting-auto-apply-promo"
                  checked={billingForm.autoApplyPromotions}
                  onChange={(e) => {
                    handleBillingChange('autoApplyPromotions', e.target.checked);
                    updateBillingSettings({ autoApplyPromotions: e.target.checked });
                  }}
                  className="mt-1 w-5 h-5 focus-ring cursor-pointer"
                />
                <div>
                  <span style={fz(15, { fontWeight: 700, color: palette.ink })}>
                    Auto-apply qualifying schemes by default in Billing
                  </span>
                  <p style={fz(13, { color: palette.muted, marginTop: '2px' })}>
                    When checked, adding cases of scheme-enabled beverages will automatically deduct free cases or apply cash discounts. You can always override per-line item during billing.
                  </p>
                </div>
              </label>
            </div>

            {/* Active Schemes Listing */}
            <div>
              <h3 style={fz(16, { fontWeight: 700, color: palette.ink, marginBottom: '0.75rem' })}>
                Currently Active Trade Promotions ({promotions.length})
              </h3>
              {promotions.length === 0 ? (
                <div className="border-2 p-6 text-center" style={{ borderColor: palette.line }}>
                  <p style={fz(14, { color: palette.muted })}>
                    No active trade promotions configured. Click "Open Scheme Builder" to create a BOGO or discount scheme.
                  </p>
                </div>
              ) : (
                <div className="border-2 divide-y-2" style={{ borderColor: palette.line }}>
                  {promotions.map((promo) => (
                    <div key={promo.id} className="p-3.5 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div style={fz(15, { fontWeight: 700, color: palette.ink })}>{promo.name}</div>
                        <div style={fz(13, { color: palette.muted })}>
                          Type: <span className="font-semibold uppercase">{promo.type}</span> · Applies to {promo.productIds.length} beverage item(s)
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2.5 py-1 border-2 font-bold"
                          style={{
                            borderColor: palette.amber,
                            color: palette.amber,
                            backgroundColor: `${palette.amber}15`,
                            ...fz(12.5),
                          }}
                        >
                          Active
                        </span>
                        <button
                          type="button"
                          onClick={() => setTab('promotions')}
                          className="border-2 px-3 py-1 font-semibold focus-ring cursor-pointer"
                          style={{
                            borderColor: palette.line,
                            backgroundColor: palette.panel,
                            color: palette.ink,
                            ...fz(12.5),
                          }}
                        >
                          Edit Scheme
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: BILLING & INVOICING PREFERENCES */}
      {activeSection === 'billing' && (
        <div id="section-billing-settings" className="space-y-6">
          <form onSubmit={handleSaveBilling} className="border-2 p-5 sm:p-6 shadow-sm" style={cardStyle}>
            <div className="flex items-center justify-between pb-3 mb-5 border-b-2 flex-wrap gap-2" style={{ borderColor: palette.line }}>
              <div>
                <h2 style={fz(19, { fontWeight: 700, color: palette.ink })}>Invoicing & Stock Parameters</h2>
                <p style={fz(13.5, { color: palette.muted })}>
                  Set default tax calculations, invoice numbering prefixes, and warehouse inventory safety limits.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-pull-billing-settings"
                  onClick={handlePullBilling}
                  disabled={pullingBilling}
                  className="flex items-center gap-1.5 border-2 px-3 py-2 font-bold focus-ring cursor-pointer"
                  style={{
                    backgroundColor: palette.panel,
                    borderColor: palette.line,
                    color: palette.ink,
                    ...fz(13),
                  }}
                  title="Load saved billing settings from Supabase table"
                >
                  <RefreshCw
                    size={Math.round(15 * scale)}
                    className={pullingBilling ? 'animate-spin text-blue-600' : ''}
                    aria-hidden="true"
                  />
                  {pullingBilling ? 'Pulling...' : 'Pull from Supabase'}
                </button>

                <button
                  type="submit"
                  id="btn-save-billing-settings"
                  disabled={savingBilling}
                  className="flex items-center gap-2 border-2 px-4 py-2 font-bold focus-ring cursor-pointer"
                  style={{
                    backgroundColor: palette.navy,
                    borderColor: palette.navy,
                    color: '#FFFFFF',
                    ...fz(14),
                  }}
                >
                  {savingBilling ? (
                    <RefreshCw size={Math.round(16 * scale)} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Save size={Math.round(16 * scale)} aria-hidden="true" />
                  )}
                  {savingBilling ? 'Saving & Syncing...' : 'Save & Sync to Supabase'}
                </button>
              </div>
            </div>

            {/* Supabase Database Connection & Sync Status Banner */}
            <div
              className="p-3 mb-5 border rounded flex flex-wrap items-center justify-between gap-3 text-xs"
              style={{
                backgroundColor: supabaseStatus.isConnected ? `${palette.good}08` : `${palette.amber}08`,
                borderColor: supabaseStatus.isConnected ? `${palette.good}40` : `${palette.amber}40`,
              }}
            >
              <div className="flex items-center gap-2">
                <Database size={16} className={supabaseStatus.isConnected ? 'text-emerald-600' : 'text-amber-600'} />
                <span>
                  <strong className="text-slate-800 dark:text-slate-200">Database Engine:</strong>{' '}
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                    Supabase PostgreSQL (billing_settings)
                  </span>{' '}
                  (Project: <code className="font-mono">{supabaseConfig.projectRef}</code>)
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold uppercase"
                  style={{
                    backgroundColor: supabaseStatus.isConnected ? `${palette.good}20` : `${palette.amber}20`,
                    color: supabaseStatus.isConnected ? palette.good : palette.amber,
                  }}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      supabaseStatus.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  {supabaseStatus.isConnected ? 'Live Cloud Connected' : 'Local Storage Only'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <span>Auto-saves locally & syncs to Supabase billing_settings table on save.</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="inv-prefix" style={labelStyle}>
                  Invoice Prefix Code
                </label>
                <input
                  id="inv-prefix"
                  type="text"
                  value={billingForm.invoicePrefix}
                  onChange={(e) => handleBillingChange('invoicePrefix', e.target.value.toUpperCase())}
                  placeholder="e.g. RBL, INV-2026-"
                  className="w-full px-3 py-2 focus-ring uppercase"
                  style={inputStyle}
                />
                <span style={fz(11.5, { color: palette.muted, marginTop: '2px', display: 'block' })}>
                  Appended to bill numbers on invoices (e.g. {billingForm.invoicePrefix}-101)
                </span>
              </div>

              <div>
                <label htmlFor="inv-default-price" style={labelStyle}>
                  Default Sale Rate Type
                </label>
                <select
                  id="inv-default-price"
                  value={billingForm.defaultSaleType}
                  onChange={(e) => handleBillingChange('defaultSaleType', e.target.value as PriceType)}
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                >
                  <option value="Retail">Retail (MRP/Direct Retail Price)</option>
                  <option value="Wholesale">Wholesale (Bulk Kirana Shop Price)</option>
                </select>
              </div>

              <div>
                <label htmlFor="inv-default-gst" style={labelStyle}>
                  Default GST Mode
                </label>
                <select
                  id="inv-default-gst"
                  value={billingForm.defaultGstMode}
                  onChange={(e) => handleBillingChange('defaultGstMode', e.target.value as GstMode)}
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                >
                  <option value="inclusive">GST Inclusive (Rate includes CGST & SGST)</option>
                  <option value="exclusive">GST Exclusive (Tax added on top of rate)</option>
                  <option value="off">GST Off / Non-Tax Bill</option>
                </select>
              </div>

              <div>
                <label htmlFor="inv-low-stock" style={labelStyle}>
                  Low Stock Warning Threshold (Cases)
                </label>
                <input
                  id="inv-low-stock"
                  type="number"
                  min={1}
                  max={100}
                  value={billingForm.lowStockThreshold}
                  onChange={(e) => handleBillingChange('lowStockThreshold', Number(e.target.value) || 5)}
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
                <span style={fz(11.5, { color: palette.muted, marginTop: '2px', display: 'block' })}>
                  Products with fewer remaining cases will display amber warning badges.
                </span>
              </div>

              <div>
                <label htmlFor="inv-max-salesman-discount" style={labelStyle}>
                  Max Salesman Discount Cap (%)
                </label>
                <input
                  id="inv-max-salesman-discount"
                  type="number"
                  min={0}
                  max={100}
                  value={billingForm.maxSalesmanDiscountPercent ?? 10}
                  onChange={(e) =>
                    handleBillingChange(
                      'maxSalesmanDiscountPercent',
                      Math.max(0, Math.min(100, Number(e.target.value) || 0))
                    )
                  }
                  className="w-full px-3 py-2 focus-ring"
                  style={inputStyle}
                />
                <span style={fz(11.5, { color: palette.muted, marginTop: '2px', display: 'block' })}>
                  Strict ceiling for field salesmen on route. Salesmen cannot apply discounts exceeding this limit.
                </span>
              </div>

              <div className="md:col-span-2 pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    id="setting-round-off"
                    checked={billingForm.roundOffGrandTotal}
                    onChange={(e) => handleBillingChange('roundOffGrandTotal', e.target.checked)}
                    className="w-5 h-5 focus-ring cursor-pointer"
                  />
                  <span style={fz(14, { fontWeight: 600, color: palette.ink })}>
                    Round off invoice total to nearest integer rupee
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 border-2 px-5 py-2.5 font-bold focus-ring cursor-pointer"
                style={{
                  backgroundColor: palette.navy,
                  borderColor: palette.navy,
                  color: '#FFFFFF',
                  ...fz(14),
                }}
              >
                <Save size={Math.round(16 * scale)} aria-hidden="true" />
                Save Invoicing Settings
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SECTION 5: DATABASE & SUPABASE CLOUD SYNC */}
      {activeSection === 'database' && (
        <div id="section-database-settings" className="space-y-6">
          <DatabaseSettingsView />
        </div>
      )}

      {/* SECTION 6: DEMO & DATA MANAGEMENT */}
      {activeSection === 'demo' && (
        <div id="section-demo-settings" className="space-y-6">
          {/* Import / Export Card */}
          <div className="border-2 p-5 sm:p-6 shadow-sm" style={cardStyle}>
            <div className="flex items-center gap-2 mb-2">
              <Database size={Math.round(20 * scale)} style={{ color: palette.amber }} aria-hidden="true" />
              <h2 style={fz(19, { fontWeight: 700, color: palette.ink })}>System Backup & Restore</h2>
            </div>
            <p style={fz(14, { color: palette.muted, marginBottom: '1.25rem' })}>
              Download a complete JSON snapshot of your entire ledger (catalog, invoices, trips, audits, and profile) or restore a previous backup.
            </p>

            {importStatus && (
              <div
                role="status"
                className="mb-4 p-3 border-2 font-bold flex items-center gap-2"
                style={{
                  borderColor: importStatus.type === 'success' ? palette.good : palette.bad,
                  backgroundColor: `${importStatus.type === 'success' ? palette.good : palette.bad}15`,
                  color: importStatus.type === 'success' ? palette.good : palette.bad,
                  ...fz(13.5),
                }}
              >
                {importStatus.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
                {importStatus.message}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                id="btn-export-backup"
                onClick={exportBackup}
                className="flex items-center gap-2 border-2 px-4 py-2.5 font-bold focus-ring cursor-pointer"
                style={{
                  backgroundColor: palette.navy,
                  borderColor: palette.navy,
                  color: '#FFFFFF',
                  ...fz(14),
                }}
              >
                <Download size={Math.round(16 * scale)} aria-hidden="true" />
                Export Ledger Backup (.JSON)
              </button>

              <label
                htmlFor="input-restore-backup"
                className="flex items-center gap-2 border-2 px-4 py-2.5 font-bold focus-ring cursor-pointer"
                style={{
                  backgroundColor: palette.panel,
                  borderColor: palette.line,
                  color: palette.ink,
                  ...fz(14),
                }}
              >
                <Upload size={Math.round(16 * scale)} aria-hidden="true" />
                Restore from Backup (.JSON)
                <input
                  ref={fileInputRef}
                  id="input-restore-backup"
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          {/* Quick Demo Presets */}
          <div className="border-2 p-5 sm:p-6 shadow-sm" style={cardStyle}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={Math.round(20 * scale)} style={{ color: palette.amber }} aria-hidden="true" />
              <h2 style={fz(19, { fontWeight: 700, color: palette.ink })}>Demo Data Presets</h2>
            </div>
            <p style={fz(14, { color: palette.muted, marginBottom: '1.25rem' })}>
              Instantly switch between realistic distribution business scenarios to demonstrate features, test trip reconciliations, or start fresh.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(Object.keys(DEMO_PRESETS) as DemoPresetId[]).map((presetKey) => {
                const preset = DEMO_PRESETS[presetKey];
                return (
                  <div
                    key={presetKey}
                    className="border-2 p-4 flex flex-col justify-between"
                    style={{ borderColor: palette.line, backgroundColor: palette.panel }}
                  >
                    <div>
                      <div style={fz(16, { fontWeight: 700, color: palette.ink, marginBottom: '0.25rem' })}>
                        {preset.name}
                      </div>
                      <p style={fz(13, { color: palette.muted, marginBottom: '1rem' })}>
                        {preset.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      id={`btn-load-preset-${presetKey}`}
                      onClick={() => handleLoadPreset(presetKey)}
                      className="w-full border-2 px-3 py-2 font-bold focus-ring cursor-pointer transition-colors"
                      style={{
                        backgroundColor: `${palette.navy}10`,
                        borderColor: palette.navy,
                        color: palette.navy,
                        ...fz(13),
                      }}
                    >
                      Load This Preset
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Danger Zone: Reset & Clear */}
          <div className="border-2 p-5 sm:p-6 shadow-sm" style={{ ...cardStyle, borderColor: palette.bad }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={Math.round(20 * scale)} style={{ color: palette.bad }} aria-hidden="true" />
              <h2 style={fz(19, { fontWeight: 700, color: palette.bad })}>Danger Zone</h2>
            </div>
            <p style={fz(14, { color: palette.muted, marginBottom: '1.25rem' })}>
              Permanent operations to reset demo state or purge transactional records.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                id="btn-clean-database"
                onClick={handleCleanDatabase}
                className="flex items-center gap-2 border-2 px-4 py-2 font-bold focus-ring cursor-pointer"
                style={{
                  backgroundColor: palette.panel,
                  borderColor: palette.bad,
                  color: palette.bad,
                  ...fz(13.5),
                }}
              >
                <Trash2 size={Math.round(16 * scale)} aria-hidden="true" />
                Clean Database (Purge All Unwanted / Sample Data)
              </button>

              <button
                type="button"
                id="btn-clear-transactions"
                onClick={handleClearTransactions}
                className="flex items-center gap-2 border-2 px-4 py-2 font-bold focus-ring cursor-pointer"
                style={{
                  backgroundColor: palette.panel,
                  borderColor: palette.warn,
                  color: palette.warn,
                  ...fz(13.5),
                }}
              >
                <Trash2 size={Math.round(16 * scale)} aria-hidden="true" />
                Clear Bills & Trips (Keep Catalog)
              </button>

              <button
                type="button"
                id="btn-factory-reset"
                onClick={handleResetDemo}
                className="flex items-center gap-2 border-2 px-4 py-2 font-bold focus-ring cursor-pointer"
                style={{
                  backgroundColor: palette.bad,
                  borderColor: palette.bad,
                  color: '#FFFFFF',
                  ...fz(13.5),
                }}
              >
                <RotateCcw size={Math.round(16 * scale)} aria-hidden="true" />
                Factory Reset All Data to Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
